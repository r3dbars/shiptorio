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

for (const scenario of ["full", "approval-base-moved", "claim-base-moved", "finish-base-moved"] as const) test(`base refresh ${scenario}: personal approval and exact base/head remain required`, async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  const originalFetch = globalThis.fetch;
  let head = first, parent = base, currentBase = base, plannerCall = 0, opened = 0, merged: unknown = null, patchedBody = "", scopeViolation = false;
  const plans: string[] = [], comparisons: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), json = (x: unknown) => Response.json(x);
    if (/\/comments\?per_page=100&page=/.test(url)) return json([]);
    if (url.endsWith("/access_tokens")) return json({ token: "test-install-token" });
    if (url.endsWith("/repos/r3dbars/demo")) return json({ default_branch: "main" });
    if (url.includes("/git/trees/")) return json({ sha: "tree", tree: [{ path: "server/src/engine.ts", type: "blob" }, { path: "server/test/engine.test.ts", type: "blob" }], truncated: false });
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: currentBase } });
    if (url.includes("/git/ref/heads/shiptorio/")) return json({ object: { sha: head } });
    if (url.includes("/contents/")) return json({ encoding: "base64", content: btoa("export const guard = true;") });
    if (url.endsWith("/pulls/99/files?per_page=100")) return json([{ filename: "server/src/engine.ts", status: "modified", patch: "-bad\n+fixed" }, { filename: "server/test/engine.test.ts", status: "added", patch: "+test" }]);
    if (url.endsWith("/pulls/99/merge")) { merged = JSON.parse(String(init?.body)); return json({ merged: true }); }
    if (url.endsWith(`/git/commits/${second}`)) return json({ parents: [{ sha: parent }] });
    if (url.endsWith("/pulls/99")) {
      if (init?.method === "PATCH") { patchedBody = JSON.parse(String(init.body)).body; return json({}); }
      return json({ number: 99, html_url: "https://github.com/r3dbars/demo/pull/99", state: "open", merged: false, body: patchedBody || "Original PR", draft: false, mergeable: true, mergeable_state: head === first || currentBase !== base ? "behind" : "clean", head: { sha: head, ref: branch, repo: { full_name: "r3dbars/demo" } }, base: { sha: currentBase, ref: "main", repo: { full_name: "r3dbars/demo" } } });
    }
    if (url.includes("/compare/")) { comparisons.push(url); return json({ status: "ahead", ahead_by: 1, files: [{ filename: scopeViolation ? "server/.dev.vars" : "server/src/engine.ts", status: "modified", changes: 2, patch: "-old\n+fixed" }] }); }
    if (url.includes("/check-runs?")) return json({ total_count: 1, check_runs: [{ name: "CI", app: { id: 15368 }, head_sha: head, status: "completed", conclusion: "success" }] });
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
  const inspection = freshInspection(first, { passed: true, reason: "green" });
  inspection.state = "passed"; inspection.stages = inspection.stages.map(stage => ({ ...stage, state: "passed", reason: "old head green" }));
  const initial = { id: "gh-1", kind: "bug", source: "github_issue", title: "Fix credential guard", body: "Guard the paths", district: "server", state: "on_pad", attempts: 1, prNumber: 99, prUrl: "https://github.com/r3dbars/demo/pull/99", branch, inspection, updatedAt: 1 } as Item;
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [initial], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }], ["runnerPair", "pair"], ["runnerPresence", { harnesses: ["codex"], seenAt: Date.now() }], ["runnerJob:old", { id: "old", itemId: "gh-1", repo: state.repo, harness: "codex", branch, baseSha: base, status: "completed", approvedAt: 1, headSha: first, prUrl: initial.prUrl, allowedPaths: ["server/src/engine.ts", "server/test/engine.test.ts"] }]]);
  let alarm: number | null = null;
  const storage = { async transaction<T>(fn: (tx: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> }) => Promise<T>): Promise<T> { return fn(storage); }, async get(k: string) { return structuredClone(data.get(k)); }, async put(k: string, v: unknown) { data.set(k, structuredClone(v)); }, async delete(k: string) { return data.delete(k); }, async list(o: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([k]) => k.startsWith(o.prefix)).slice(0, o.limit)); }, async getAlarm() { return alarm; }, async setAlarm(n: number) { alarm = n; } };
  const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(), getWebSockets: () => [] };
  const f = new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE: membershipCache, GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "test-key", DB: { prepare: () => ({ bind: () => ({ first: async () => ({ token_version: 0, status: "active", installation_id: 1, id: 1, login: "test-player", user_id: 1, calls: 1, tokens: 100, next_at: Date.now(), failures: 0, enabled:1, runs_daily:20, count:1 }), all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } }) as never);

  const saved = () => data.get("state") as FactoryState;
  const internal = f as unknown as { offerRunnerPlan(): Promise<void>; planRunnerJobs(): Promise<void>; offerGauntletMove(): Promise<void>; runGauntlet(): Promise<void> };
  const choose = async (optionId: string) => {
    const move = saved().deck?.find(m => m.options.some(o => o.id === optionId)) ?? saved().move!;
    await f.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId: move.id, optionId }));
  };
  try {
    await internal.offerRunnerPlan();
    expect(saved().deck?.some(m => m.options.some(o => o.id === "refresh-base"))).toBe(true);
    await choose("refresh-base");
    await internal.planRunnerJobs();
    const job = (await f.runnerJobs()).find(j => j.id !== "old")!;
    expect(job).toMatchObject({ status: "awaiting_approval", reworkPr: 99, baseSha: base, verifyBaseSha: base, branch, refreshBase: { expectedHeadSha: first } });
    expect(saved().deck?.find(m => m.id === job.approvalMoveId)?.plan?.join(" ")).toContain("replace branch");
    expect(await f.claimRunner("pair", ["codex"])).toBeNull();
    if (scenario === "approval-base-moved") {
      currentBase = "d".repeat(40);
      await choose("approve");
      expect((await f.runnerJobs()).find(j => j.id === job.id)?.status).toBe("failed");
      expect(await f.claimRunner("pair", ["codex"])).toBeNull();
      expect(merged).toBeNull(); return;
    }
    await choose("approve");
    if (scenario === "claim-base-moved") currentBase = "d".repeat(40);
    const assigned = await f.claimRunner("pair", ["codex"]);
    if (scenario === "claim-base-moved") {
      expect(assigned).toBeNull();
      expect((await f.runnerJobs()).find(j => j.id === job.id)?.status).toBe("failed");
      expect(merged).toBeNull(); return;
    }
    expect(assigned?.approvedAt).toBeNumber();
    head = second;
    const receipt = { jobId: job.id, lease: assigned!.lease!, ok: true, sha: second, summary: "Rebuilt on latest main", checks: ["typecheck", "test", "build"] as ("typecheck" | "test" | "build")[], proof };
    await expect(f.finishRunner("pair", { ...receipt, proof: undefined })).rejects.toThrow("fresh approved regression proof");
    await expect(f.finishRunner("pair", { ...receipt, proof: { ...proof, failsOnBase: false } })).rejects.toThrow("fresh approved regression proof");
    await expect(f.finishRunner("pair", { ...receipt, proof: { ...proof, baseSha: first } })).rejects.toThrow("base/head");
    parent = first;
    await expect(f.finishRunner("pair", receipt)).rejects.toThrow("approved base parent");
    parent = base; scopeViolation = true;
    await expect(f.finishRunner("pair", receipt)).rejects.toThrow("approved scope");
    scopeViolation = false;
    if (scenario === "finish-base-moved") {
      currentBase = "d".repeat(40);
      expect(await f.finishRunner("pair", receipt)).toEqual({ status: "failed" });
      expect((await f.runnerJobs()).find(j => j.id === job.id)).toMatchObject({ status: "failed", headSha: second });
      await f.onCheckSuite([99], true, "current", second);
      await internal.runGauntlet();
      expect(stageOf(saved().items[0], "verify")?.state).toBe("pending");
      data.set("runnerRefreshCheckedAt", 0);
      await internal.offerRunnerPlan();
      await choose("refresh-base");
      const next = (await f.runnerJobs()).find(j => j.id !== "old" && j.id !== job.id)!;
      expect(next).toMatchObject({ status: "planning", baseSha: currentBase, refreshBase: { expectedHeadSha: second } });
      expect(next.proof).toBeUndefined(); expect(merged).toBeNull(); return;
    }
    expect((await f.finishRunner("pair", receipt)).prUrl).toBe(initial.prUrl);
    expect(opened).toBe(0);
    expect(merged).toBeNull();
    expect(comparisons.at(-1)).toContain(`${base}...${second}`);
    expect(saved().items[0]).toMatchObject({ state: "inspecting", branch, prNumber: 99, inspection: { headSha: second } });
    expect(stageOf(saved().items[0], "ci")?.state).toBe("pending");
    await f.onCheckSuite([99], true, "stale", first);
    expect(stageOf(saved().items[0], "ci")?.state).toBe("pending");
    await f.onCheckSuite([99], true, "current", second);
    await internal.runGauntlet(); await internal.runGauntlet(); await internal.runGauntlet();
    await internal.offerGauntletMove();
    expect(stageOf(saved().items[0], "verify")?.reason).toContain("reproduced on base");
    expect(saved().deck?.some(m => m.options.some(o => o.id === "launch"))).toBe(true);
    expect(merged).toBeNull();
    await choose("launch");
    expect(merged).toMatchObject({ sha: second, merge_method: "squash" });
    expect(saved().items[0].state).toBe("launched");
  } finally { globalThis.fetch = originalFetch; }
});
