import { expect, test } from "bun:test";
import { assertRefreshItem, ownsRefreshPr, refreshTarget, RefreshBaseMoved } from "../src/runner-refresh";
import type { RunnerJob } from "../src/runner-job";
const repo = "r3dbars/demo", branch = "shiptorio/runner-00000000-0000-4000-8000-000000000001";
const headSha = "a".repeat(40), baseSha = "b".repeat(40);

test("base refresh binds the open same-repository PR, old head and current target ref", async () => {
  const original = globalThis.fetch;
  let pull = { state: "open", merged: false, draft: false, mergeable_state: "behind", head: { sha: headSha, ref: branch, repo: { full_name: repo } }, base: { sha: baseSha, ref: "main", repo: { full_name: repo } } };
  let ref = baseSha;
  globalThis.fetch = (async (input: string | Request | URL) => String(input).includes("/pulls/") ? Response.json(pull) : Response.json({ object: { sha: ref } })) as typeof fetch;
  try {
    const expected = { headSha, baseSha, baseBranch: "main" };
    expect(await refreshTarget("test-token", repo, 1, branch, "main")).toEqual(expected);
    for (const change of [{ state: "closed" }, { merged: true }, { draft: true }, { head: { ...pull.head, sha: "c".repeat(40) } }, { head: { ...pull.head, ref: "human-branch" } }, { head: { ...pull.head, repo: { full_name: "attacker/fork" } } }, { base: { ...pull.base, ref: "other" } }, { base: { ...pull.base, repo: { full_name: "attacker/target" } } }]) {
      const saved = pull; pull = { ...pull, ...change };
      await expect(refreshTarget("test-token", repo, 1, branch, "main", expected)).rejects.toThrow("changed"); pull = saved;
    }
    ref = "c".repeat(40);
    await expect(refreshTarget("test-token", repo, 1, branch, "main", expected)).rejects.toThrow("during validation");
    pull.base.sha = ref;
    await expect(refreshTarget("test-token", repo, 1, branch, "main", expected)).rejects.toBeInstanceOf(RefreshBaseMoved);
    pull.mergeable_state = "clean";
    expect(await refreshTarget("test-token", repo, 1, branch, "main")).toBeNull();
  } finally { globalThis.fetch = original; }
});

test("only a previously approved same-item runner publication grants refresh provenance", () => {
  const item = { id: "gh-1", branch, prNumber: 1 };
  const job: RunnerJob = { id: "old", itemId: item.id, repo, harness: "codex", branch, status: "completed", allowedPaths: ["src/fix.ts"], approvedAt: 1, headSha, prUrl: `https://github.com/${repo}/pull/1` };
  expect(ownsRefreshPr([job], item, repo, headSha)).toBe(true);
  for (const change of [{ status: "running" }, { approvedAt: undefined }, { itemId: "gh-2" }, { repo: "attacker/fork" }, { branch: "human" }, { headSha: baseSha }, { prUrl: `https://github.com/${repo}/pull/2` }]) expect(ownsRefreshPr([{ ...job, ...change } as RunnerJob], item, repo, headSha)).toBe(false);
});

test("a refresh assignment cannot move to another factory item's PR or branch", () => {
  const job = { branch, reworkPr: 1, refreshBase: { expectedHeadSha: headSha } } as RunnerJob;
  expect(() => assertRefreshItem(job, { branch, prNumber: 1 })).not.toThrow();
  expect(() => assertRefreshItem(job, { branch, prNumber: 2 })).toThrow("changed PR or branch");
  expect(() => assertRefreshItem(job, { branch: "human", prNumber: 1 })).toThrow("changed PR or branch");
});
