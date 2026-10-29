import { expect, test } from "bun:test";
import type { TreeEntry } from "../src/github";
import { initialFactoryState } from "../src/factory-initialization";

test("fresh layout preserves the repository branch and packs blob districts only", () => {
  const entries: TreeEntry[] = [
    { path: "src/cart.ts", type: "blob" },
    { path: "src/checkout.ts", type: "blob" },
    { path: "README.md", type: "blob" },
    { path: "assets", type: "tree" },
  ];
  const before = structuredClone(entries);
  const state = initialFactoryState("example/shop", { branch: "develop", entries }, {});
  expect(state.baseBranch).toBe("develop");
  expect(state.repo).toBe("example/shop");
  expect(state.districts).toEqual([
    { name: "src", x: 0, y: 0, w: 2, h: 1, files: 2 },
    { name: "/", x: 4, y: 0, w: 1, h: 1, files: 1 },
  ]);
  expect(entries).toEqual(before);
  expect(state.sources?.[0]?.state).toBe("needs_action");
});

test("an empty repository keeps an empty layout and configured GitHub status", () => {
  const state = initialFactoryState("example/shop", { branch: "trunk", entries: [] }, {
    GITHUB_APP_ID: "fixture-app", GITHUB_APP_PRIVATE_KEY: "fixture-key",
    GITHUB_WEBHOOK_SECRET: "fixture-hook", GITHUB_CLIENT_ID: "fixture-client",
    GITHUB_CLIENT_SECRET: "fixture-secret",
  });
  expect(state.districts).toEqual([]);
  expect(state.sources?.[0]?.state).toBe("connected");
});

test("fresh factories never share mutable inventory, counters or source setup", () => {
  const tree = { branch: "main", entries: [] };
  const first = initialFactoryState("example/first", tree, {});
  const second = initialFactoryState("example/second", tree, {});
  const before = structuredClone(second);
  first.machines[0].state = "working";
  first.belts.pop();
  first.power[0].level = 0;
  first.science.red = 42;
  first.sources![0].setup!.steps.push("Changed only in the first factory");
  expect(second).toEqual(before);
});

import { testD1 } from "./d1-fixture";
import { ACCESS_RECHECK_MS, reconcileFactoryGitHubAccess } from "../src/factory-initialization";
import { GitHubError } from "../src/github";

async function accessFixture() {
  const DB = testD1();
  await DB.prepare("INSERT INTO installations(id,account_login,status) VALUES (40,'owner','active')").run();
  await DB.prepare("INSERT INTO repos(full_name,installation_id) VALUES ('owner/repo',40)").run();
  return { DB, env: { DB } as Parameters<typeof reconcileFactoryGitHubAccess>[0], meta: { repo: "owner/repo", installationId: 40 } };
}

test("wake checks are bounded, but durable suspension bypasses the cache", async () => {
  const { DB, env, meta } = await accessFixture();
  let calls = 0;
  const lookup = async () => { calls++; return { id: 40 }; };
  expect(await reconcileFactoryGitHubAccess(env, meta, undefined, 10_000, lookup)).toEqual({ stopped: false, checkedAt: 10_000 });
  expect(await reconcileFactoryGitHubAccess(env, meta, 10_000, 10_001, lookup)).toEqual({ stopped: false });
  await DB.prepare("UPDATE installations SET status='suspended' WHERE id=40").run();
  expect(await reconcileFactoryGitHubAccess(env, meta, 10_000, 10_002, lookup)).toEqual({ stopped: true, reason: "GitHub installation suspended" });
  expect(calls).toBe(1);
  await DB.prepare("UPDATE installations SET status='active' WHERE id=40").run();
  expect(await reconcileFactoryGitHubAccess(env, meta, 10_000, 10_000 + ACCESS_RECHECK_MS, lookup)).toEqual({ stopped: false, checkedAt: 10_000 + ACCESS_RECHECK_MS });
  expect(calls).toBe(2);
});

test("missed installation suspension persists and does not retry GitHub", async () => {
  const { DB, env, meta } = await accessFixture();
  const result = await reconcileFactoryGitHubAccess(env, meta, undefined, 10_000, async () => ({ id: 40, suspended_at: "2026-10-29T10:00:00Z" }));
  expect(result).toEqual({ stopped: true, reason: "GitHub installation suspended" });
  expect(await DB.prepare("SELECT status FROM installations WHERE id=40").first()).toEqual({ status: "suspended" });
  expect(await reconcileFactoryGitHubAccess(env, meta, undefined, 20_000, async () => { throw new Error("must not fetch"); })).toEqual(result);
});

test("access loss is durable and identity changes never silently switch installations", async () => {
  const { DB, env, meta } = await accessFixture();
  expect(await reconcileFactoryGitHubAccess(env, meta, undefined, 10_000, async () => ({ id: 41 }))).toEqual({ stopped: true, reason: "GitHub repository access unavailable", archivedAt: 10_000 });
  expect(await reconcileFactoryGitHubAccess(env, meta, undefined, 20_000, async () => { throw new Error("must not fetch"); })).toEqual({ stopped: true, reason: "GitHub repository access unavailable", archivedAt: 10_000 });
  expect(await DB.prepare("SELECT installation_id FROM repos WHERE full_name='owner/repo'").first()).toEqual({ installation_id: 40 });
});

test("outages and credential failures stop this wake without archiving the repository", async () => {
  for (const status of [401, 403, 429, 503]) {
    const { DB, env, meta } = await accessFixture();
    await expect(reconcileFactoryGitHubAccess(env, meta, undefined, 10_000, async () => { throw new GitHubError(status, "/repos/owner/repo/installation", "GET"); })).rejects.toThrow();
    expect(await DB.prepare("SELECT archived_at FROM repos WHERE full_name='owner/repo'").first()).toEqual({ archived_at: null });
  }
});

test("a signed access restoration during lookup invalidates stale removal evidence", async () => {
  const { DB, env, meta } = await accessFixture();
  const result = await reconcileFactoryGitHubAccess(env, meta, undefined, 10_000, async () => {
    await DB.prepare("UPDATE installations SET token_version=token_version+1 WHERE id=40").run();
    throw new GitHubError(404, "/repos/owner/repo/installation", "GET");
  });
  expect(result).toEqual({ stopped: false });
  expect(await DB.prepare("SELECT archived_at FROM repos WHERE full_name='owner/repo'").first()).toEqual({ archived_at: null });
});
