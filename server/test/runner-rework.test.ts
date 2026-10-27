import { gauntletPolicy } from "./gauntlet-fixture";
import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv, browserCookies } from "./browser-fixture";
import { expect, mock, test } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { canRework, freshInspection, reworkMove, setStage, stageOf, verifyFromDiff } from "../src/gauntlet";
import type { RegressionProof, RunnerJob } from "../src/runner-job";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
const base = "a".repeat(40), first = "b".repeat(40), second = "c".repeat(40);
const branch = "shiptorio/runner-00000000-0000-4000-8000-000000000001";
const proof: RegressionProof = { failsOnBase: true, passesOnHead: true, baseSha: base, headSha: second, command: "bun test ./server/test/engine.test.ts", logTail: "BASE: 1 fail\nHEAD: 1 pass" };

test("verify receipts require a reproduced base failure and passing head; third station strike escalates", () => {
  expect(verifyFromDiff(["server/test/engine.test.ts"], true, proof).passed).toBe(true);
  expect(verifyFromDiff(["server/test/engine.test.ts"], true, { ...proof, failsOnBase: false }).passed).toBe(false);
  expect(verifyFromDiff(["server/test/engine.test.ts"], true, { ...proof, passesOnHead: false }).passed).toBe(false);
  let item = { id: "gh-1", kind: "bug", source: "github_issue", title: "Fix guard", district: "server", state: "inspecting", attempts: 1, branch, prNumber: 99, updatedAt: 1, inspection: freshInspection(first) } as Item;
  item = setStage(item, "verify", "rework", "Missing repro");
  expect(canRework(item)).toBe(true);
  expect(reworkMove(item).options[0].id).toBe("rework-codex");
  item = setStage(item, "verify", "rework", "Still missing repro");
  item = setStage(item, "verify", "rework", "Third failed repro");
  expect(canRework(item)).toBe(false);
  expect(reworkMove(item).options.map(o => o.id)).toEqual(["later", "overrule"]);
});

test("scar → re-plan → approve → one same-branch fix → fresh gauntlet → Launch", async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  const originalFetch = globalThis.fetch;
  let head = first, plannerCall = 0, opened = 0, merged: unknown = null, patchedBody = "", scopeViolation = false;
  const plans: string[] = [], comparisons: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), json = (x: unknown) => Response.json(x);
    const policy = gauntletPolicy(url); if (policy) return policy;
    if (/\/comments\?per_page=100&page=/.test(url)) return json([]);
    if (url.endsWith("/access_tokens")) return json({ token: "test-install-token" });
    if (url.endsWith("/repos/r3dbars/demo")) return json({ default_branch: "main" });
    if (url.includes("/git/trees/")) return json({ sha: "tree", tree: [{ path: "server/src/engine.ts", type: "blob" }, { path: "server/test/engine.test.ts", type: "blob" }], truncated: false });
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: base } });
    if (url.includes("/git/ref/heads/shiptorio/")) return json({ object: { sha: head } });
    if (url.includes("/contents/")) return json({ encoding: "base64", content: btoa("export const guard = true;") });
    if (url.endsWith("/pulls/99/files?per_page=100")) return json([{ filename: "server/src/engine.ts", status: "modified", patch: "-bad\n+fixed" }, { filename: "server/test/engine.test.ts", status: "added", patch: "+test" }]);
    if (url.endsWith("/pulls/99/merge")) { merged = JSON.parse(String(init?.body)); return json({ merged: true }); }
    if (url.endsWith("/pulls/99")) {
      if (init?.method === "PATCH") { patchedBody = JSON.parse(String(init.body)).body; return json({}); }
      return json({ number: 99, html_url: "https://github.com/r3dbars/demo/pull/99", state: "open", merged: false, body: patchedBody || "Original PR", head: { sha: head, ref: branch }, base: { sha: base, ref: "main" } });
    }
    if (url.includes("/compare/")) { comparisons.push(url); return json({ status: "ahead", ahead_by: 1, files: [{ filename: scopeViolation ? "server/.dev.vars" : "server/src/engine.ts", status: "modified", changes: 2, patch: "-old\n+fixed" }] }); }
    if (url.includes("/check-runs?")) return json({ total_count: 1, check_runs: [{ name: "CI", app: { id: 15368 }, head_sha: new URL(url).pathname.split("/").at(-2), status: "completed", conclusion: "success" }] });
    if (url.includes("/status?")) return json({ total_count: 0, statuses: [] });
    if (url.includes("/issues/1/comments?")) return json([]);
    if (url.endsWith("/issues/1")) return json({ number: 1, title: "Fix credential guard", body: "Guard the paths", state: "open", html_url: "https://github.com/r3dbars/demo/issues/1" });
    if (/\/issues\/\d+\/comments$/.test(url)) return json({ id: 1 });
    if (url.endsWith("/chat/completions") && String(init?.body).includes("game master")) { const brief = JSON.parse(JSON.parse(JSON.parse(String(init?.body)).messages[1].content.split("\n")[1])); return json({ choices: [{ message: { content: JSON.stringify({ order: brief.cards.map((c: { id: string }) => c.id), reason: "Oldest jam first.", picks: {} }) } }] }); }
    if (url.endsWith("/chat/completions")) {
      const request = JSON.parse(String(init?.body));
      if (request.messages[0].content.includes("hostile reviewer")) return json({ choices: [{ message: { content: JSON.stringify({ verdict: "pass", reason: "Regression is fixed with direct coverage.", findings: [] }) } }] });
      plans.push(String(init?.body)); plannerCall++;
      const action = plannerCall === 1 ? { files: ["server/src/engine.ts", "server/test/engine.test.ts"] } : plannerCall === 2 ? { tool: "read_issue", reason: "Read the failed verify scar" } : plannerCall === 3 ? { tool: "read_file", path: "server/src/engine.ts", reason: "Inspect failed branch code" } : { tool: "assign_job", files: ["server/src/engine.ts", "server/test/engine.test.ts"], reason: "Fix the failed proof", plan: "Address missing repro with an actual base-failing regression and fix.", acceptance: ["Regression fails on base and passes on head"] };
      return json({ choices: [{ message: { content: JSON.stringify(action) } }] });
    }
    if (url.includes("/pulls?")) return json([]);
    if (url.endsWith("/pulls") && init?.method === "POST") { opened++; return json({ number: 100, html_url: "https://github.com/r3dbars/demo/pull/100" }); }
    throw new Error(`Unexpected rework request ${url}`);
  }) as typeof fetch;
  const initial = setStage({ id: "gh-1", kind: "bug", source: "github_issue", title: "Fix credential guard", body: "Guard the paths", district: "server", state: "inspecting", attempts: 1, prNumber: 99, prUrl: "https://github.com/r3dbars/demo/pull/99", branch, inspection: freshInspection(first, { passed: true, reason: "green" }), updatedAt: 1 } as Item, "verify", "rework", "Missing repro on base");
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [initial], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }], ["runnerPair", "pair"], ["runnerJob:old", { id: "old", itemId: "gh-1", repo: state.repo, harness: "codex", branch, baseSha: base, status: "completed", headSha: first, prUrl: initial.prUrl, allowedPaths: ["server/src/engine.ts", "server/test/engine.test.ts"] }]]);
  let alarm: number | null = null;
  const storage = { async transaction<T>(fn: (tx: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> }) => Promise<T>): Promise<T> { return fn(storage); }, async get(k: string) { return structuredClone(data.get(k)); }, async put(k: string, v: unknown) { data.set(k, structuredClone(v)); }, async delete(k: string) { return data.delete(k); }, async list(o: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([k]) => k.startsWith(o.prefix)).slice(0, o.limit)); }, async getAlarm() { return alarm; }, async setAlarm(n: number) { alarm = n; } };
  const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(), getWebSockets: () => [] };
  const f = new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE: membershipCache, GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "test-key", DB: { prepare: () => ({ bind: () => ({ first: async () => ({ token_version: 0, status: "active", installation_id: 1, id: 1, login: "test-player", user_id: 1, calls: 1, tokens: 100, next_at: Date.now(), failures: 0, enabled:1, runs_daily:20, count:1 }), all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } }) as never);

  const saved = () => data.get("state") as FactoryState;
  const choose = async (optionId: string) => f.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId: saved().move!.id, optionId }));
  try {
    await f.alarm();
    expect(saved().move?.options[0].id).toBe("rework-codex");
    // A planning hold drops the rework card. Once the hold ends it comes back, rather than waiting forever.
    data.set("planningRetry:gh-1", { day: new Date().toISOString().slice(0, 10), failures: 1, reason: "offline", retryAt: Date.now() + 60000 });
    await f.alarm();
    expect(saved().deck?.some(m => m.options.some(o => o.id === "rework-codex"))).toBe(false);
    data.delete("planningRetry:gh-1");
    await f.alarm();
    expect(saved().move?.options[0].id).toBe("rework-codex");
    await choose("rework-codex");
    await f.alarm();
    const job = (await f.runnerJobs()).find(j => j.id !== "old")!;
    expect(job).toMatchObject({ status: "awaiting_approval", reworkPr: 99, baseSha: first, verifyBaseSha: base, branch });
    expect(plans.join("\n")).toContain("Missing repro on base");
    expect(await f.claimRunner("pair", ["codex"])).toBeNull();
    await choose("approve");
    const assigned = await f.claimRunner("pair", ["codex"]);
    expect(assigned?.branch).toBe(branch);
    head = second;
    const receipt = { jobId: job.id, lease: assigned!.lease!, ok: true, sha: second, summary: "Fixed regression", checks: ["typecheck", "test", "build"] as ("typecheck" | "test" | "build")[], proof };
    scopeViolation = true;
    await expect(f.finishRunner("pair", receipt)).rejects.toThrow("approved scope");
    scopeViolation = false;
    await expect(f.finishRunner("pair", { ...receipt, proof: { ...proof, headSha: first } })).rejects.toThrow("base/head");
    expect((await f.finishRunner("pair", receipt)).prUrl).toBe(initial.prUrl);
    expect(opened).toBe(0);
    expect(patchedBody).toContain("BASE: 1 fail");
    expect(comparisons.at(-1)).toContain(`${first}...${second}`);
    expect(saved().items[0]).toMatchObject({ state: "inspecting", branch, prNumber: 99, attempts: 2 });
    expect(saved().items[0].scars).toHaveLength(1);
    expect(stageOf(saved().items[0], "ci")?.state).toBe("pending");
    await f.onCheckSuite([99], true, "stale", first);
    expect(stageOf(saved().items[0], "ci")?.state).toBe("pending");
    await f.onCheckSuite([99], true, "new head", second);
    await f.alarm();
    expect(stageOf(saved().items[0], "verify")?.reason).toContain("reproduced on base");
    await f.alarm();
    expect(saved().move?.options[0].id).toBe("launch");
    expect(saved().move?.evidence?.every(e => e.ok)).toBe(true);
    await choose("launch");
    expect(merged).toMatchObject({ sha: second, merge_method: "squash" });
    expect(saved().items[0].state).toBe("launched");
    expect(saved().science.red).toBe(1);
    const third = setStage(setStage(initial, "verify", "rework", "again"), "verify", "rework", "third");
    (f as unknown as { state: FactoryState }).state.items = [third];
    await expect(f.enqueueRunner({ itemId: third.id, harness: "codex", allowedPaths: [], needsApproval: true })).rejects.toThrow("escalation");
  } finally { globalThis.fetch = originalFetch; }
});
