// The demo must never die on a cost limit: when the $5/day account cap or the $50/day site cap is hit mid-loop,
// Shippy stops thinking cleanly, says so in plain words, makes no further model call, and the player can still approve
// and ship what already exists. The next UTC day he resumes on his own. Anonymous tutorial visitors cost nothing.
// Unit coverage of the ledger lives in spend.test.ts / cost-guards.test.ts / planning-retry.test.ts; this file drives
// the real Factory DO over real SQLite (every migration) with GitHub and Meta behind one fetch spy.
import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv, unlimitedFactory } from "./browser-fixture";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { FactoryState, type Item, type Move, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { testD1, signedInCookie } from "./d1-fixture";
import { freshInspection, setStage } from "../src/gauntlet";
import { ACCOUNT_CAP_LINE, NANO_USD, SITE_CAP_LINE } from "../src/spend";
import { utcDay } from "../src/budget";
import { RateLimitError } from "../src/rate-limit";
import { PLANNER_REST_KEY, type PlanningRetry } from "../src/planning-retry";
import { issueRevision, type RunnerJob } from "../src/runner-job";
import { makeSessionCookie } from "../src/session";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
const { default: worker } = await import("../src/index");

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const REPO = "owner/repo", HEAD = "c".repeat(40), BASE = "a".repeat(40);
type Log = Extract<ServerToWeb, { type: "log" }>;
const realFetch = globalThis.fetch;
// The deck asks the game master in the background (a fire-and-forget ranking call). When a test ends, its factories
// lose their model key and the in-flight call lands on this test's spy, so nothing late reaches the next file's fetch.
const liveEnvs: Record<string, unknown>[] = [];
afterEach(async () => {
  for (const env of liveEnvs.splice(0)) { env.SPARK_DISABLED = "1"; delete env.META_API_KEY; }
  await new Promise(resolve => setTimeout(resolve, 50));
  globalThis.fetch = realFetch;
});

/** GitHub's D1 pacing ledger hands out a free slot every time, so fixture reads don't wait a second apiece. */
const freeSlots = (db: D1Database) => ({ ...db, prepare: (sql: string) => sql.startsWith("INSERT INTO api_limits(scope, next_at)") ? { bind: () => ({ first: async () => ({ next_at: Date.now() + 1000 }) }) } : db.prepare(sql) }) as unknown as D1Database;

/** Player copy is plain: no stack frames, no class names, no internal model name (AGENTS.md: never "Spark" to players). */
function plain(text: string) {
  expect(text).not.toMatch(/\bSpark\b/i);
  expect(text).not.toMatch(/\n\s+at |Error:|BudgetError|RateLimitError|undefined|\[object/);
}

/**
 * The real Factory over real SQLite, a capturing browser socket, and one fetch spy that serves a GitHub fixture
 * (installation token, repo tree, issue, PR #99 checks and merge) and counts every call to the Meta model API.
 */
async function capsFactory(env: Record<string, unknown> = {}) {
  const sqlite = testD1();
  await signedInCookie({ DB: sqlite, SESSION_SECRET: "caps-test" } as never, "test-player", [REPO], 1);
  await sqlite.prepare("INSERT INTO signup_resources VALUES('test-player','factory',?),('test-player','repo',?)").bind(REPO, REPO).run();
  const model: { url: string; body: string }[] = [], github: string[] = [];
  let merges = 0;
  let modelReply: () => Response = () => new Response("model must not be reached", { status: 500 });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input), path = new URL(url).pathname;
    if (url.startsWith("https://api.meta.ai/")) { model.push({ url, body: String(init?.body) }); return modelReply(); }
    if (!url.startsWith("https://api.github.com/")) throw new Error(`Unexpected outbound call ${url}`);
    github.push(`${init?.method ?? "GET"} ${path}`);
    if (path.endsWith("/access_tokens")) return Response.json({ token: "fixture-token", expires_at: new Date(Date.now() + 3600_000).toISOString() });
    if (path === `/repos/${REPO}`) return Response.json({ default_branch: "main" });
    if (path.startsWith(`/repos/${REPO}/git/trees/`)) return Response.json({ sha: BASE, tree: [{ path: "README.md", type: "blob" }, { path: "docs/setup.md", type: "blob" }], truncated: false });
    if (path === `/repos/${REPO}/git/ref/heads/main`) return Response.json({ object: { sha: BASE } });
    if (path === `/repos/${REPO}/issues/1`) return Response.json({ number: 1, state: "open", title: "README: add a quick start", body: "Docs only.", labels: [], updated_at: "2026-10-30T00:00:00Z", html_url: `https://github.com/${REPO}/issues/1`, user: { login: "test-player" }, author_association: "OWNER" });
    if (path === `/repos/${REPO}/issues/1/comments`) return Response.json([]);
    if (path === `/repos/${REPO}/pulls/99/merge`) { merges++; return Response.json({ merged: true, sha: "d".repeat(40) }); }
    if (path === `/repos/${REPO}/pulls/99`) return Response.json({ number: 99, base: { ref: "main", sha: BASE }, head: { sha: HEAD }, state: merges ? "closed" : "open", merged: merges > 0, draft: false, mergeable: true, mergeable_state: "clean" });
    if (path.endsWith("/check-runs")) return Response.json({ total_count: 1, check_runs: [{ name: "CI", app: { id: 15368 }, head_sha: HEAD, status: "completed", conclusion: "success" }] });
    if (path.endsWith("/status")) return Response.json({ total_count: 0, statuses: [] });
    if (init?.method === "POST" && path.includes("/comments")) return Response.json({ id: 1 }, { status: 201 });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;

  // Three pieces of work: #1 waits for a plan (the planner is about to need the model), #2's plan already waits for
  // approval, #3's PR passed every station and waits on the Gate.
  let pad: Item = { id: "gh-3", kind: "feature", source: "github_issue", title: "Docs: add an FAQ page", district: "docs", state: "inspecting", attempts: 1, prNumber: 99, branch: "shiptorio/runner-00000000-0000-4000-8000-000000000003", updatedAt: 1, inspection: freshInspection(HEAD) };
  for (const gate of ["ci", "verify", "ai"] as const) pad = setStage(pad, gate, "passed", "passed");
  const items: Item[] = [
    { id: "gh-1", kind: "feature", source: "github_issue", title: "README: add a quick start", body: "Docs only.", district: "/", state: "queued", attempts: 0, updatedAt: 1 },
    { id: "gh-2", kind: "feature", source: "github_issue", title: "Docs: fix the broken install link", body: "Docs only.", district: "docs", state: "queued", attempts: 0, updatedAt: 1 },
    pad,
  ];
  const state = FactoryState.parse({ repo: REPO, baseBranch: "main", districts: [], ...starterLine(), items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["githubAccessCheckedAt", Date.now()], ["state", state], ["meta", { repo: REPO, installationId: 1 }], ["openMoves", []]]);
  let alarm: number | null = null;
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(options: { prefix?: string; limit?: number } = {}) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix ?? "")).slice(0, options.limit)); },
    async getAlarm() { return alarm; }, async setAlarm(value: number) { alarm = value; }, async deleteAlarm() { alarm = null; },
  };
  const events: ServerToWeb[] = [];
  const socket = authorizedSocket((raw: string) => events.push(JSON.parse(raw)), REPO);
  let exclusive: Promise<unknown> = Promise.resolve();
  const ctx = { storage, waitUntil: () => {}, acceptWebSocket() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket] };
  const paced = freeSlots(sqlite);
  const raw: Record<string, unknown> = { ...browserEnv, CACHE: membershipCache, DB: authorizedDB(paced), META_API_KEY: "test-only", GITHUB_APP_ID: "caps-test", GITHUB_APP_PRIVATE_KEY: privateKey, ...env };
  liveEnvs.push(raw);
  const fullEnv = credentialEnv(raw);
  const factory = new Factory(ctx as never, fullEnv as never);
  type Internal = { load(): Promise<unknown>; planRunnerJob(job: RunnerJob): Promise<void>; planRunnerJobs(): Promise<void>; performRunnerPlan(job: RunnerJob, signal: AbortSignal): Promise<void>; refreshDecisions(): Promise<void>; offerGauntletMove(poll?: boolean): Promise<void>; runLearned(): Promise<void>; githubGuard(op: string, run: () => Promise<unknown>): Promise<void>; sparkEnv(): Record<string, unknown>; broadcastQueue: Promise<void>; state: FactoryState };
  const internal = factory as unknown as Internal;
  await internal.load();
  /** #2's plan, written before the cap (one runner job at a time, so it lands once #1's planning is set aside). */
  const writtenPlan = async () => {
  data.set("runnerJob:job-2", { id: "job-2", repo: REPO, itemId: "gh-2", harness: "codex", allowedPaths: ["docs/install.md"], branch: "shiptorio/runner-job-2", baseSha: BASE, status: "awaiting_approval", approvalMoveId: "approval-2", needsApproval: true, plan: "Fix the link in docs/install.md.", runAccount: "test-player",
    inputRevision: await issueRevision("Docs: fix the broken install link", JSON.stringify({ body: "Docs only.", failure: "", scars: [] })) } satisfies Partial<RunnerJob>);
    data.set("openMoves", [...((data.get("openMoves") as Move[]) ?? []), (factory as unknown as { runnerApprovalMove(job: unknown, item: Item): Move }).runnerApprovalMove(data.get("runnerJob:job-2"), internal.state.items.find(i => i.id === "gh-2")!)]);
    (factory as unknown as { openMoves: Move[] | null }).openMoves = null;
  };
  const saved = () => data.get("state") as FactoryState;
  const deck = () => saved().deck ?? [];
  const logs = () => events.filter((e): e is Log => e.type === "log");
  const send = (value: unknown) => factory.webSocketMessage(authorizedSocket(() => {}, REPO), JSON.stringify(value));
  /** Today's spend already on the ledger, as other calls left it. */
  const spent = async (account: string, repo: string, usd: number, now = Date.now()) => {
    await sqlite.prepare("INSERT INTO spark_factory_calls(id, repo, day, model, nano_usd, account) VALUES (?, ?, ?, 'muse-spark-1.3', ?, ?)").bind(crypto.randomUUID(), repo, utcDay(now), Math.round(usd * NANO_USD), account).run();
  };
  /** The player asks for a plan on #1: the job is queued and the planner runs once. */
  const plan = async () => {
    const job = await factory.enqueueRunner({ itemId: "gh-1", harness: "codex", allowedPaths: [], needsApproval: true }, "test-player");
    await internal.planRunnerJob(job);
    await internal.broadcastQueue;
    return job;
  };
  return { writtenPlan, factory, internal, sqlite, data, events, saved, deck, logs, send, spent, plan, model, github, merges: () => merges, reply: (fn: () => Response) => { modelReply = fn; } };
}
type Caps = Awaited<ReturnType<typeof capsFactory>>;

const nextMidnight = (now = Date.now()) => (Math.floor(now / 86400000) + 1) * 86400000;

/** Everything the player can still do while Shippy rests: approve a waiting plan, and Ship it at the Gate. */
async function stillPlayable(f: Caps) {
  const before = f.model.length;
  // Approve the plan that was already written.
  await f.writtenPlan();
  await f.internal.refreshDecisions();
  expect(f.deck().some(m => m.id === "approval-2")).toBe(true);
  await f.send({ type: "choose_move", moveId: "approval-2", optionId: "approve" });
  expect(f.data.get("runnerJob:job-2")).toMatchObject({ status: "ready", approvedBy: "player" });
  expect(f.logs().some(l => l.text === "Plan approved. Your local agent can now start." && l.itemId === "gh-2")).toBe(true);
  // Ship the PR that already passed every station.
  await f.internal.offerGauntletMove(true);
  const gate = f.deck().find(m => m.itemId === "gh-3" && m.options.some(o => o.id === "launch")) as Move;
  expect(gate).toBeDefined();
  await f.send({ type: "choose_move", moveId: gate.id, optionId: "launch" });
  expect(f.merges()).toBe(1);
  expect(f.saved().items.find(i => i.id === "gh-3")?.state).toBe("launched");
  expect(f.logs().some(l => l.text === "Launching #99." && l.approvedBy === "player")).toBe(true);
  // None of that needed the model.
  expect(f.model.length).toBe(before);
}

describe("the $5/day account cap, hit mid-loop", () => {
  it("stops before the model call, tells the player plainly, keeps the deck playable, and resumes the next UTC day", async () => {
    const f = await capsFactory();
    await f.spent("user:1", REPO, 4.999);
    const job = await f.plan();

    // Shippy's GitHub reads ran, but the paid call was refused before any request left.
    expect(f.github.some(c => c.endsWith("/git/trees/main"))).toBe(true);
    expect(f.model).toEqual([]);
    expect((await f.sqlite.prepare("SELECT COUNT(*) AS n FROM spark_factory_calls").first<{ n: number }>())?.n).toBe(1); // the denied reservation left nothing behind

    // The job is set aside, not failed for good, and nothing was charged.
    expect(f.data.get(`runnerJob:${job.id}`)).toMatchObject({ status: "failed", error: "Planning paused. No build run charged. The planner will try again after resting." });
    expect(f.data.has(`planningResume:${job.id}`)).toBe(true);
    const rest = f.data.get(PLANNER_REST_KEY) as PlanningRetry;
    expect(rest).toMatchObject({ kind: "cap", retryAt: nextMidnight() });
    expect(rest.reason).toBe(`Account daily dollar budget reached. ${ACCOUNT_CAP_LINE}`);

    // The deck: one calm card, last, that says $5, 00:00 UTC, and that reviewing and shipping still work.
    const card = f.deck().find(m => m.id === "planner-rest")!;
    expect(card.title).toBe("Shippy is done thinking for today");
    expect(card.why).toBe("This account used today's five dollars of AI. He's back at 00:00 UTC. You can keep reviewing and shipping.");
    expect(card.plan).toEqual([new Date(nextMidnight()).toISOString()]);
    expect(f.deck().at(-1)?.id).toBe("planner-rest");
    expect(f.deck().filter(m => m.id === "planner-rest")).toHaveLength(1);
    // The planner's own note (the brain panel) carries the exact account line: $5, 00:00 UTC, reviews and merges.
    expect(f.saved().brain?.thoughts.some(t => t.by === "fallback" && t.itemId === "gh-1" && t.reason.includes(ACCOUNT_CAP_LINE))).toBe(true);
    expect(ACCOUNT_CAP_LINE).toBe("Shippy is done thinking for today: this account used its five dollars of AI for the day. He's back at 00:00 UTC. The deck, reviews and merges keep working.");
    for (const text of [card.title, card.why, ...f.logs().map(l => l.text)]) plain(text);

    // Ticks, deck refreshes, a resumed plan pass and another Plan tap: still no model call.
    for (let n = 0; n < 3; n++) { await f.internal.refreshDecisions(); await f.internal.planRunnerJobs(); await f.internal.runLearned(); }
    await f.send({ type: "brain_look" });
    expect(f.model).toEqual([]);
    expect(f.data.get(`runnerJob:${job.id}`)).toMatchObject({ status: "failed" });

    await stillPlayable(f);
    expect(f.model).toEqual([]);

    // Overnight the local agent finishes #2's build (one runner job at a time), so the line is free again.
    f.data.set("runnerJob:job-2", { ...(f.data.get("runnerJob:job-2") as RunnerJob), status: "completed" });
    // 00:00 UTC: the card goes, the parked plan resumes on its own and reaches the model again.
    const tomorrow = nextMidnight() + 60_000;
    const clock = spyOn(Date, "now").mockReturnValue(tomorrow);
    f.reply(() => Response.json({ choices: [{ message: { content: JSON.stringify({ files: ["README.md"] }) } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }));
    const methods = f.internal;
    const resumed = spyOn(methods, "performRunnerPlan").mockImplementation(async (j: RunnerJob) => {
      const { pickFiles } = await import("../src/spark");
      const files = await pickFiles(methods.sparkEnv() as never, { title: "README: add a quick start", body: "Docs only.", district: "/" }, ["README.md"]);
      f.data.set(`runnerJob:${j.id}`, { ...j, status: "awaiting_approval", allowedPaths: files });
      f.data.delete(`planningResume:${j.id}`);
    });
    try {
      await methods.refreshDecisions();
      expect(f.deck().some(m => m.id === "planner-rest")).toBe(false);
      await methods.planRunnerJobs();
      expect(resumed).toHaveBeenCalledTimes(1);
      expect(f.model).toHaveLength(1);
      expect(f.data.get(`runnerJob:${job.id}`)).toMatchObject({ status: "awaiting_approval", allowedPaths: ["README.md"] });
      // Yesterday's spend is kept; today's call is charged to today.
      const days = await f.sqlite.prepare("SELECT day, COUNT(*) AS n FROM spark_factory_calls WHERE account = 'user:1' GROUP BY day ORDER BY day").all<{ day: string; n: number }>();
      expect(days.results).toEqual([{ day: utcDay(Date.parse(new Date(tomorrow - 86400000).toISOString())), n: 1 }, { day: utcDay(tomorrow), n: 1 }]);
    } finally { resumed.mockRestore(); clock.mockRestore(); }
  });

  it("while Shippy rests no Plan card is dealt, a forced start says the cap in plain words, and Plan comes back at 00:00 UTC", async () => {
    const f = await capsFactory();
    await f.spent("user:1", REPO, 5);
    await f.plan();
    const tapped = f.logs().length;
    // #2's Plan card (dealt earlier) is withdrawn while the cap holds: the player can't tap into an obscure failure.
    const card: Move = { id: "plan-again", title: "Plan #2: Docs: fix the broken install link", why: "Get a focused plan first.", stage: "build", kind: "build", itemId: "gh-2", createdAt: Date.now(), options: [{ id: "codex", label: "Plan with Codex", recommended: true, actions: [{ tool: "plan_runner_job", args: { harness: "codex" }, reason: "Read this issue" }] }, { id: "decline", label: "Later", recommended: false, actions: [] }] };
    f.data.set("openMoves", [...(f.data.get("openMoves") as Move[]), card]);
    (f.internal as unknown as { openMoves: Move[] | null }).openMoves = null;
    await f.internal.refreshDecisions();
    expect(f.deck().some(m => m.id === card.id)).toBe(false);
    expect(f.deck().some(m => m.id === "planner-rest")).toBe(true);
    // A stale tap on it (an old browser tab) runs nothing.
    await f.send({ type: "choose_move", moveId: card.id, optionId: "codex" });
    expect((await f.factory.runnerJobs()).some(j => j.itemId === "gh-2")).toBe(false);
    expect(f.logs().slice(tapped).filter(l => l.itemId === "gh-2")).toEqual([]);
    // The inbox's Start button reaches the same guard: it gets the cap's own line, not "failed tries" and a timestamp.
    const refused = await f.factory.enqueueRunner({ itemId: "gh-2", harness: "codex", allowedPaths: [], needsApproval: true }, "test-player").then(() => null, (e: Error) => e.message);
    expect(refused).toBe(`Planning paused. ${ACCOUNT_CAP_LINE}`);
    plain(refused!);
    expect(f.model).toEqual([]);
    // 00:00 UTC, the player's computer online: a Plan card is dealt again.
    const tomorrow = nextMidnight() + 60_000;
    const clock = spyOn(Date, "now").mockReturnValue(tomorrow);
    try {
      f.data.set("runnerPresence", { harnesses: ["codex"], seenAt: tomorrow });
      await (f.internal as unknown as { offerRunnerPlan(): Promise<void> }).offerRunnerPlan();
      await f.internal.refreshDecisions();
      expect(f.deck().some(m => m.options.some(o => o.actions.some(a => a.tool === "plan_runner_job")))).toBe(true);
      expect(f.deck().some(m => m.id === "planner-rest")).toBe(false);
    } finally { clock.mockRestore(); }
  });

  it("the inbox route turns the cap and the run quota into the 409 the deck shows word for word, not 'Could not reach the factory'", async () => {
    const { testApp } = await import("./app-fixture");
    const { privateKey: key } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    for (const message of [`Planning paused. ${ACCOUNT_CAP_LINE}`, `Planning paused. ${SITE_CAP_LINE}`, "Daily run quota reached. Builds start again at 00:00 UTC.", "Something else broke"]) {
      const grants = new Map<string, unknown>();
      const env = { SESSION_SECRET: "caps-route", APP_PASSWORD: "caps-route-preview", ALLOWED_LOGINS: "writer", DB: freeSlots(testD1()), GITHUB_APP_ID: "123", GITHUB_APP_PRIVATE_KEY: key.export({ type: "pkcs8", format: "pem" }).toString(),
        CACHE: { get: async (k: string) => grants.get(k) ?? null, put: async (k: string, v: string) => { if (k.startsWith("access:")) grants.set(k, JSON.parse(v)); } },
        FACTORY: { idFromName: (name: string) => name, get: (name: string) => name.startsWith("security:") ? { securityLimit: async () => ({ allowed: true, retryAfter: 0 }) } : { ensure: async () => {}, startInboxIssue: async () => { throw new Error(message); } } } };
      const cookie = `${await signedInCookie(env as never, "writer", [REPO], 42)}; ${(await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")}`;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/installation")) return Response.json({ id: 1 });
        if (path.endsWith("/access_tokens")) return Response.json({ token: "fixture", expires_at: new Date(Date.now() + 3600000).toISOString() });
        if (path.endsWith("/permission")) return Response.json({ permission: "write", user: { id: 42 } });
        if (path.startsWith("/repos/")) return Response.json({ id: 1, permissions: { push: true } });
        throw new Error(`Unexpected ${path}`);
      }) as typeof fetch;
      const response = await testApp.fetch(new Request(`https://shiptorio.com/api/repos/${REPO}/issues/2/start`, { method: "POST", headers: { cookie, origin: "https://shiptorio.com" } }), env as never);
      if (message === "Something else broke") { expect(response.status).toBe(500); continue; }
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: message });
    }
  });
});

describe("the $50/day site cap", () => {
  it("stops every account cleanly, never blames the player's own $5, keeps the deck playable, resumes at midnight", async () => {
    const f = await capsFactory();
    // Strangers spent the whole site budget; this player spent nothing.
    for (let n = 0; n < 10; n++) await f.spent(`user:${100 + n}`, `stranger/repo-${n}`, 5);
    await f.plan();
    expect(f.model).toEqual([]);
    const rest = f.data.get(PLANNER_REST_KEY) as PlanningRetry;
    expect(rest).toMatchObject({ kind: "cap", retryAt: nextMidnight() });
    expect(rest.reason).toBe(`Site daily dollar budget reached. ${SITE_CAP_LINE}`);
    const card = f.deck().find(m => m.id === "planner-rest")!;
    expect(card.title).toBe("Shippy is done thinking for today");
    expect(card.why).toBe("Shiptorio used today's AI for everyone. He's back at 00:00 UTC. You can keep reviewing and shipping.");
    // Never the account's $5: this player didn't spend it.
    for (const text of [card.title, card.why, rest.reason, SITE_CAP_LINE, ...f.logs().map(l => l.text)]) { expect(text).not.toContain("$5"); expect(text).not.toMatch(/this account/i); plain(text); }
    expect(SITE_CAP_LINE).toContain("00:00 UTC");
    expect(SITE_CAP_LINE).toContain("reviews and merges keep working");
    expect(f.saved().brain?.thoughts.some(t => t.by === "fallback" && t.reason.includes(SITE_CAP_LINE))).toBe(true);

    for (let n = 0; n < 3; n++) { await f.internal.refreshDecisions(); await f.internal.planRunnerJobs(); }
    await stillPlayable(f);
    expect(f.model).toEqual([]);

    const clock = spyOn(Date, "now").mockReturnValue(nextMidnight() + 1000);
    try {
      await f.internal.refreshDecisions();
      expect(f.deck().some(m => m.id === "planner-rest")).toBe(false);
    } finally { clock.mockRestore(); }
  });

  it("SPARK_SITE_DAILY_USD lowers the site ceiling, and the message still names everyone, not the account", async () => {
    const f = await capsFactory({ SPARK_SITE_DAILY_USD: "0.5" });
    await f.spent("user:200", "stranger/repo", 0.5);
    await f.plan();
    expect(f.model).toEqual([]);
    expect((f.data.get(PLANNER_REST_KEY) as PlanningRetry).reason).toBe(`Site daily dollar budget reached. ${SITE_CAP_LINE}`);
    expect(f.deck().find(m => m.id === "planner-rest")?.why).toContain("for everyone");
  });

  it("under both caps at once the player hears the site line (theirs would not help them)", async () => {
    const f = await capsFactory();
    await f.spent("user:1", REPO, 5);
    for (let n = 0; n < 9; n++) await f.spent(`user:${100 + n}`, `stranger/repo-${n}`, 5);
    await f.plan();
    expect(f.model).toEqual([]);
    expect((f.data.get(PLANNER_REST_KEY) as PlanningRetry).reason).toStartWith("Site daily dollar budget reached.");
  });
});

describe("the bottleneck brain and the game master stop at half the day's dollars, not only half the calls", () => {
  it("at 60% of the $5 with few calls made, neither asks the model", async () => {
    const f = await capsFactory({ CACHE: { ...membershipCache, get: async (key: string) => key === "flags:v1:global:brain" ? "true" : membershipCache.get(key) } });
    await f.spent("user:1", REPO, 3);
    const internal = f.internal as unknown as { brainBudget(): Promise<{ used: number; limit: number } | null>; rankBudgetLeft(): Promise<boolean> };
    expect(await internal.rankBudgetLeft()).toBe(false);
    const budget = await internal.brainBudget();
    expect(budget!.used).toBeGreaterThanOrEqual(0.5 * budget!.limit);
  });

  it("well under half of the dollars, both may still think", async () => {
    const f = await capsFactory();
    await f.spent("user:1", REPO, 1);
    const internal = f.internal as unknown as { brainBudget(): Promise<{ used: number; limit: number } | null>; rankBudgetLeft(): Promise<boolean> };
    expect(await internal.rankBudgetLeft()).toBe(true);
    expect((await internal.brainBudget())!.used).toBeLessThan(0.5);
  });
});

describe("anonymous tutorial and guest visitors cost zero model calls", () => {
  it("the public deck, the judge replay, a guest save, the waitlist and a forged webhook never reach a model or the spend ledger", async () => {
    const DB = testD1();
    const env = { DB, SESSION_SECRET: "caps-guest", APP_PASSWORD: "caps-preview", ALLOWED_LOGINS: "test-player", META_API_KEY: "test-only", GITHUB_WEBHOOK_SECRET: "hook-secret", SIGNUP_GATE_MODE: "password", FACTORY: unlimitedFactory,
      CACHE: { get: async () => null, put: async () => {} }, ASSETS: { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`, { headers: { "content-type": "text/html" } }) } };
    const outbound: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => { outbound.push(String(input)); throw new Error("an anonymous visitor must not reach a provider"); }) as unknown as typeof fetch;
    const ctx = { waitUntil: () => {}, passThroughOnException() {} };
    const visit = (path: string, init: RequestInit = {}, host = "shiptorio.dev") => worker.fetch(new Request(`https://${host}${path}`, { ...init, headers: { "cf-connecting-ip": "192.0.2.9", ...(init.headers ?? {}) } }), env as never, ctx as never);
    // The stranger's tutorial on shiptorio.dev: the front door and the deck, no password.
    for (const path of ["/", "/deck", "/deck?source=live", "/deck?source=sim&scenario=first-run", "/deck/art/sky.webp"]) expect((await visit(path)).status, path).toBeOneOf([200, 302]);
    // The judge replay, on either host.
    for (const host of ["shiptorio.dev", "shiptorio.com"]) expect((await visit("/judge?source=live&repo=private/repo", {}, host)).status).toBe(200);
    // A guest with the preview password: their sample save and preferences.
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    const me = await visit("/api/me", { headers: { cookie: preview, origin: "https://shiptorio.com" } }, "shiptorio.com");
    expect(me.status).toBe(200);
    const guest = `${preview}; ${me.headers.get("set-cookie")!.split(";")[0]}`;
    const { emptyProgress } = await import("@shiptorio/shared");
    expect((await visit("/api/me/progress", { method: "PUT", body: JSON.stringify({ ...emptyProgress(), xp: 3 }), headers: { cookie: guest, origin: "https://shiptorio.com", "content-type": "application/json" } }, "shiptorio.com")).status).toBe(200);
    // A guest trying the live factory and the planner's routes is turned away before any work.
    for (const path of ["/api/repos/owner/repo/factory", "/api/repos/owner/repo/runner/enqueue", "/api/repos/owner/repo/limits"]) {
      expect((await visit(path, { method: path.endsWith("enqueue") ? "POST" : "GET", headers: { cookie: guest, origin: "https://shiptorio.com" } }, "shiptorio.com")).status, path).toBe(401);
    }
    // The waitlist form and an unsigned issue webhook (the classic "free triage" bait).
    await visit("/api/waitlist", { method: "POST", body: "email=stranger%40example.com", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://shiptorio.com" } }, "shiptorio.com");
    const hook = await visit("/webhooks/github", { method: "POST", body: JSON.stringify({ action: "opened", issue: { number: 1, title: "triage me", body: "", state: "open" }, repository: { full_name: "owner/repo" }, installation: { id: 1 } }), headers: { "x-github-event": "issues", "x-hub-signature-256": "sha256=" + "0".repeat(64), "content-type": "application/json" } }, "shiptorio.com");
    expect(hook.status).toBeGreaterThanOrEqual(400);

    expect(outbound).toEqual([]);
    for (const table of ["spark_factory_calls", "spark_usage"]) expect((await DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n, table).toBe(0);
  });
});

describe("out-of-usage messages read plainly", () => {
  it("a GitHub rate limit says GitHub is busy and when it asks again, once, with no stack and no internal names", async () => {
    const f = await capsFactory();
    const retryAt = Date.now() + 5 * 60_000;
    let runs = 0;
    for (let n = 0; n < 3; n++) await f.internal.githubGuard("offerRunnerPlan", async () => { runs++; throw new RateLimitError(retryAt); });
    await f.internal.broadcastQueue;
    expect(runs).toBe(1); // it rests instead of hammering GitHub every tick
    const said = f.logs().filter(l => l.text.startsWith("GitHub is busy"));
    expect(said).toHaveLength(1);
    expect(said[0].text).toBe(`GitHub is busy. The factory waits until ${new Date(retryAt).toISOString().slice(11, 19)} UTC before asking again.`);
    plain(said[0].text);
    // No "Factory work needs attention" alarm card for an ordinary limit.
    expect(f.deck().some(m => m.id.startsWith("reliability:"))).toBe(false);
  });

  it("a GitHub rate limit during planning rests the planner with a calm card, not an outage", async () => {
    const f = await capsFactory();
    const retryAt = Date.now() + 10 * 60_000;
    const attempt = spyOn(f.internal, "performRunnerPlan").mockRejectedValue(new RateLimitError(retryAt));
    try { await f.plan(); } finally { attempt.mockRestore(); }
    const card = f.deck().find(m => m.id === "planner-rest")!;
    expect(card.title).toBe(`Planner is resting until ${new Date(retryAt).toISOString().slice(11, 16)} UTC`);
    expect(card.why).toBe("Planning resumes automatically. You can keep reviewing existing work.");
    for (const text of [card.title, card.why, ...f.logs().map(l => l.text)]) plain(text);
  });

  it("the daily run quota on a Plan tap reads plainly and says when builds come back", async () => {
    const f = await capsFactory();
    await f.sqlite.prepare("INSERT INTO signup_counters(scope, bucket, count, expires_at) VALUES ('runs:test-player', ?, 20, ?)").bind(Math.floor(Date.now() / 86400000), nextMidnight() + 86400000).run();
    const card: Move = { id: "plan-1", title: "Plan #1: README: add a quick start", why: "Get a focused plan first.", stage: "build", kind: "build", itemId: "gh-1", createdAt: Date.now(), options: [{ id: "codex", label: "Plan with Codex", recommended: true, actions: [{ tool: "plan_runner_job", args: { harness: "codex" }, reason: "Read this issue" }] }, { id: "decline", label: "Later", recommended: false, actions: [] }] };
    f.data.set("openMoves", [card]);
    (f.internal as unknown as { openMoves: Move[] | null }).openMoves = null;
    await f.internal.refreshDecisions();
    expect(f.deck().some(m => m.id === "plan-1")).toBe(true);
    const before = f.logs().length;
    await f.send({ type: "choose_move", moveId: "plan-1", optionId: "codex" });
    const said = f.logs().slice(before).filter(l => l.itemId === "gh-1").map(l => l.text);
    expect(said).toHaveLength(1);
    plain(said[0]);
    expect(said[0]).toContain("00:00 UTC");
    expect(said[0]).not.toMatch(/\d{4}-\d\d-\d\dT/); // no raw ISO timestamps in player copy
    expect((await f.factory.runnerJobs()).some(j => j.itemId === "gh-1")).toBe(false);
  });
});
