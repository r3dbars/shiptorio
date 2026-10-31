// "Shippy behaves": the hackathon demo path through the real Factory Durable Object, over many ticks on a clock the
// test controls. Every source is real (the collectors, the CI derive, the deck), fed by a fake GitHub, a fake
// PostHog and an optional fake Meta model. Nothing reaches the network.
import { credentialEnv } from "./credential-fixture";
import { budgetDb } from "./budget-fixture";
import { generateKeyPairSync } from "node:crypto";
import { authorizedDB, authorizedSocket, browserEnv } from "./browser-fixture";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { FactoryState, type GoalId, type Item, type Move, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { BRAIN, type BrainMemory } from "../src/diagnose";
import { beginCheckin, type DeckBook } from "../src/deck-decisions";
import { clearRepoCache } from "../src/signals/repo";
import { fakeUsage } from "../src/signals/posthog";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const REPO = "r3dbars/demo";
const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();

// ---------- the clock ----------
// Date.now ticks with real time plus an offset the test moves, so code that waits a few real ms still sees time pass.
// Fake days start at 01:00 UTC tomorrow, so a test's hours stay inside one UTC day (the brain's daily cap counts by it).
const realNow = Date.now.bind(Date);
let offset = 0;
const clock = {
  set(at: number) { offset = at - realNow(); },
  advance(ms: number) { offset += ms; },
  now: () => realNow() + offset,
};
const startOfFakeDay = () => Math.floor(realNow() / DAY) * DAY + DAY + HOUR;
const realFetch = globalThis.fetch;
beforeEach(() => { clearRepoCache(); clock.set(startOfFakeDay()); Date.now = clock.now; });
afterEach(() => { globalThis.fetch = realFetch; Date.now = realNow; });

// ---------- the world outside the factory ----------

interface Pr { number: number; workflow: string; red: boolean }
interface World {
  /** Open PRs and the newest run of their one check. */
  prs: Pr[];
  /** The model: off (rule path), or a mock that diagnoses (or stays quiet) on every call. */
  model: "off" | "diagnose" | "quiet";
}
const iso = (at: number) => new Date(at).toISOString();

/** Three PRs merged this week, each a couple of hours from open to merge: the line ships. */
const merged = (now: number) => [1, 2, 3].map(d => ({ number: 30 + d, title: `Shipped ${d}`, html_url: `https://github.com/${REPO}/pull/${30 + d}`, draft: false, created_at: iso(now - d * DAY - 2 * HOUR),
  updated_at: iso(now - d * DAY), closed_at: iso(now - d * DAY), merged_at: iso(now - d * DAY), user: { login: "r3dbars", type: "User" }, head: { ref: `done-${d}` }, body: "" }));

/** CI: four quick green runs on main in the last day, plus each open PR's newest check. */
function runs(world: World, now: number) {
  const main = [1, 4, 9, 20].map((h, i) => ({ id: 100 + i, name: "check", workflow_id: 1, head_branch: "main", head_sha: `m${i}`, event: "push", status: "completed", conclusion: "success", run_attempt: 1,
    run_started_at: iso(now - h * HOUR), created_at: iso(now - h * HOUR), updated_at: iso(now - h * HOUR + 3 * MIN), html_url: `https://github.com/${REPO}/actions/runs/${100 + i}`, pull_requests: [] }));
  const prs = world.prs.map(p => ({ id: 1000 + p.number, name: p.workflow, workflow_id: 2, head_branch: `pr-${p.number}`, head_sha: `h${p.number}`, event: "pull_request", status: "completed", conclusion: p.red ? "failure" : "success", run_attempt: 1,
    run_started_at: iso(now - 20 * MIN), created_at: iso(now - 20 * MIN), updated_at: iso(now - 15 * MIN), html_url: `https://github.com/${REPO}/actions/runs/${1000 + p.number}`, pull_requests: [{ number: p.number }] }));
  return [...prs, ...main];
}

/** Three outside voices this week, each answered by the owner: feedback is flowing and nobody is waiting. */
function issues(now: number) {
  return ["ana", "ben", "cy"].map((login, i) => ({ number: 10 + i, title: `Idea ${i}`, state: "closed", created_at: iso(now - (3 + i) * DAY), closed_at: iso(now - (2 + i) * DAY), comments: 1,
    labels: [{ name: "idea" }], user: { login, type: "User" }, author_association: "NONE", html_url: `https://github.com/${REPO}/issues/${10 + i}` }));
}
const comments = (now: number) => [10, 11, 12].map((n, i) => ({ issue_url: `https://api.github.com/repos/${REPO}/issues/${n}`, created_at: iso(now - (2.5 + i) * DAY), user: { login: "r3dbars", type: "User" }, author_association: "OWNER" }));

/** PostHog's HogQL answers, from the "healthy" canned usage: steady users, steady growth, features in use. */
function hogql(body: string, now: number) {
  const usage = fakeUsage(now, "healthy");
  const query = JSON.parse(body).query.query as string;
  if (query.includes("uniq(person_id) AS wau")) return { results: [[usage.wau]] };
  if (query.includes("FROM persons")) return { results: usage.newPeople.map(d => [d.day, d.people]) };
  if (query.includes("GROUP BY event")) return { results: usage.events.map(e => [e.event, e.firstDay, e.users, e.users7d]) };
  if (query.includes("AS users FROM events")) return { results: usage.active.map(d => [d.day, d.users]) };
  return { results: [] };
}

/** The JSON brief a model call carries, unwrapped from its untrusted-data envelope. */
function brief<T>(body: string): T {
  const user = (JSON.parse(body).messages as { role: string; content: string }[]).filter(m => m.role === "user").at(-1)!.content;
  return JSON.parse(JSON.parse(user.split("\n")[1])) as T;
}

/** A diagnose turn from the mock model: name the heaviest signal it was shown, with its first play. */
function modelTurn(world: World, body: string) {
  if (world.model === "quiet") return { tool: "quiet", reason: "Nothing worth a card." };
  const signal = brief<{ signals: { id: string; plays: { play: string }[] }[] }>(body).signals[0];
  const id = signal.id, play = signal.plays[0].play;
  // Its words name itself on purpose: the card the player sees must not.
  return { tool: "diagnose", reason: "The heaviest thing holding the factory back.", signalIds: [id], play, area: "speed", title: "Spark sees a check failing", why: "Muse Spark says one PR can't ship until it passes.",
    card: "Let Spark fix the failing check", because: "Spark counted 1 PR stuck on a red check.", confidence: 0.9 };
}

interface Calls { github: string[]; diagnose: number; otherModel: number; posthog: number }

function fakeNetwork(world: World, calls: Calls) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input), method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = typeof init?.body === "string" ? init.body : "";
    const now = Date.now();
    if (url.startsWith("https://api.meta.ai/")) {
      const reply = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });
      if (body.includes("You are the mind of Shiptorio")) { calls.diagnose++; return reply(modelTurn(world, body)); }
      // Anything else (the game master ranking the deck): keep the order it was given, no rewording.
      calls.otherModel++;
      return reply({ order: (brief<{ cards?: { id: string }[] }>(body).cards ?? []).map(c => c.id), reason: "Top card first.", bottleneck: null, picks: {}, because: {} });
    }
    if (url.startsWith("https://us.posthog.com/")) { calls.posthog++; return Response.json(hogql(body, now)); }
    if (!url.startsWith("https://api.github.com/")) throw new Error(`offline in tests: ${url}`);
    const path = url.slice("https://api.github.com".length);
    calls.github.push(`${method} ${path}`);
    const repo = `/repos/${REPO}`;
    if (path.includes("/access_tokens")) return Response.json({ token: "fixture-installation-token", expires_at: iso(now + HOUR) });
    if (path === repo) return Response.json({ default_branch: "main" });
    if (path.startsWith(`${repo}/actions/runs`)) return Response.json({ workflow_runs: runs(world, now) });
    if (path.startsWith(`${repo}/pulls?state=open`)) return Response.json(world.prs.map(p => ({ number: p.number, title: `Change ${p.number}`, html_url: `https://github.com/${REPO}/pull/${p.number}`, draft: false,
      created_at: iso(now - HOUR), updated_at: iso(now - 20 * MIN), user: { login: "r3dbars", type: "User" }, requested_reviewers: [], head: { ref: `pr-${p.number}`, sha: `h${p.number}` }, body: "" })));
    if (path.startsWith(`${repo}/pulls?state=closed`)) return Response.json(merged(now));
    if (path.startsWith(`${repo}/branches`)) return Response.json([{ name: "main" }, ...world.prs.map(p => ({ name: `pr-${p.number}` }))]);
    if (path.startsWith(`${repo}/issues/comments`)) return Response.json(comments(now));
    if (path.startsWith(`${repo}/issues?`)) return Response.json(issues(now));
    if (path === "/graphql") return Response.json({ data: { repository: { discussions: { nodes: [] } } } });
    return Response.json({ message: "Not Found" }, { status: 404 });
  }) as unknown as typeof fetch;
}

// ---------- the factory ----------

/** A KV namespace in memory, with the "brain" flag on and the player's repo membership fresh. */
function memoryKv() {
  const kv = new Map<string, string>([["flags:v1:global:brain", "true"]]);
  return {
    async get(key: string, type?: string) {
      if (key.startsWith("access:v2:")) return { expiresAt: Date.now() + 59_000 };
      const raw = kv.get(key);
      return raw === undefined ? null : type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) { kv.set(key, value); },
    async delete(key: string) { kv.delete(key); },
  };
}

interface Options { items?: Item[]; world?: Partial<World>; env?: Record<string, unknown>; /** The player's goal. "ship_faster" (the default) lifts CI and line signals 1.5x. */ goal?: GoalId }

/**
 * The real Durable Object on in-memory storage, a real budget ledger (SQLite), the brain flag on, Sentry and PostHog
 * connected and quiet, a goal picked and one rocket launched: a healthy factory, unless the test breaks something.
 */
function fixture(options: Options = {}) {
  const world: World = { prs: [], model: "off", ...options.world };
  const calls: Calls = { github: [], diagnose: 0, otherModel: 0, posthog: 0 };
  fakeNetwork(world, calls);
  const now = Date.now();
  const state = FactoryState.parse({
    repo: REPO, baseBranch: "main", districts: [], ...starterLine(), items: options.items ?? [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0, move: null, deck: [],
    goals: { picks: [options.goal ?? "ship_faster"], by: "player", at: now, rockets: 1 }, metrics: { rockets: 1, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 1 },
  });
  const data = new Map<string, unknown>([["state", structuredClone(state)], ["meta", { repo: REPO, installationId: 1 }], ["openMoves", []], ["sentryLinked", true], ["posthogLinked", true], ["githubRepoId", 504]]);
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(o: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(o.prefix)).slice(0, o.limit)); },
    async getAlarm() { return null; }, async setAlarm() {}, async deleteAlarm() {},
  };
  const ledger = budgetDb();
  ledger.sqlite.exec(`INSERT INTO user_repos VALUES('${REPO}', 1)`);
  const stub = { bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) }) };
  const DB = { prepare(sql: string) {
    if (sql.startsWith("SELECT u.id") || sql.startsWith("SELECT u.login")) return { bind: () => ({ first: async () => ({ id: 1, login: "test-player" }) }) };
    // GitHub's pacing ledger: every slot free, no cooldown.
    if (sql.includes("INSERT INTO api_limits")) return { bind: () => ({ first: async () => ({ next_at: Date.now() + 1000 }), run: async () => ({ success: true }) }) };
    // The model budget lives in a real SQLite ledger; everything else the factory asks D1 is empty.
    try { return ledger.db.prepare(sql); } catch { return stub; }
  }, batch: async () => [] };
  const env = credentialEnv({
    ...browserEnv, CACHE: memoryKv(), DB: authorizedDB(DB),
    GITHUB_APP_ID: "demo-path-shippy", GITHUB_APP_PRIVATE_KEY: PEM,
    // PostHog pinned to this factory with an operator key, so its collector reads the (fake) project.
    POSTHOG_API_KEY: "phx_fixture", POSTHOG_PROJECT_ID: "1", POSTHOG_REPO_ID: "504", POSTHOG_INSTALLATION_ID: "1",
    ...(world.model === "off" ? {} : { META_API_KEY: "fixture-meta-key" }),
    ...options.env,
  });
  const events: ServerToWeb[] = [];
  type Live = {
    load(): Promise<unknown>; refreshDecisions(): Promise<void>; webSocketMessage(ws: unknown, raw: string): Promise<void>; decisionData(): Promise<void>;
    brainBusy: boolean; brainKickedAt: number; state: FactoryState | null; deckBook: DeckBook | null;
  };
  const boot = (): Live => {
    // The player's open tab. Its sign-in is stamped fresh on each read, so hours on the fake clock don't expire it.
    const socket = () => authorizedSocket((raw: string) => events.push(JSON.parse(raw)));
    let exclusive: Promise<unknown> = Promise.resolve();
    const ctx = { storage, acceptWebSocket() {}, waitUntil() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket()] };
    return new Factory(ctx as never, env as never) as unknown as Live;
  };
  let factory = boot();
  /** Every Shippy card that was ever on the deck, by id: each one passed the copy rules when it was dealt. */
  const dealt = new Set<string>();
  const settle = async () => {
    for (let i = 0; i < 400 && factory.brainBusy; i++) await new Promise(r => setTimeout(r, 5));
    for (const card of (data.get("state") as FactoryState).deck ?? []) {
      if (!card.id.startsWith("unlock:") && !card.id.startsWith("win:")) continue;
      plainWords(card); dealt.add(card.id);
    }
  };
  /** One deck refresh as the alarm runs it, then let the brain's pass (if one started) finish and deal its card. */
  const tick = async (advance = 0) => {
    clock.advance(advance);
    await factory.load();
    await factory.refreshDecisions();
    await settle();
  };
  const send = async (value: unknown) => { await factory.webSocketMessage(authorizedSocket(), JSON.stringify(value)); await settle(); };
  const saved = () => data.get("state") as FactoryState;
  const deck = (): Move[] => saved().deck ?? [];
  const shippy = () => deck().filter(m => m.id.startsWith("unlock:") || m.id.startsWith("win:"));
  const memory = () => data.get("brainMemory") as BrainMemory | undefined;
  const logs = () => events.filter((e): e is Extract<ServerToWeb, { type: "log" }> => e.type === "log");
  /** The DO is evicted: a fresh instance over the same storage, as Cloudflare restarts it. */
  const restart = () => { factory = boot(); };
  /** The player opens the game again: a new check-in, as the socket upgrade starts it. */
  const checkin = async () => { await factory.load(); await factory.decisionData(); beginCheckin(factory.deckBook!); await factory.refreshDecisions(); await settle(); };
  return { world, calls, data, ledger, tick, send, saved, deck, shippy, memory, logs, restart, checkin, events, dealt, get factory() { return factory; } };
}


type Fixture = ReturnType<typeof fixture>;
const RED_CHECK = "unlock:ci:ci_blocking:check";
const RED_LINT = "unlock:ci:ci_blocking:lint";

/** Ticks every `every` ms for `span` ms, checking `each` after every one. */
async function run(f: Fixture, span: number, every: number, each: (at: number) => void = () => {}) {
  for (let t = every; t <= span; t += every) { await f.tick(every); each(t); }
}

/** The copy rules for anything Shippy deals: plain player words, no model name, no blame, inside the deck's limits. */
function plainWords(card: Move) {
  const words = [card.title, card.why, card.because ?? "", ...card.options.map(o => o.label)].join(" | ");
  expect(words).not.toMatch(/\bspark\b|\bmuse\b/i);
  expect(words).not.toMatch(/you(?:'re| are) the bottleneck/i);
  expect(words).not.toMatch(/\b(?:ci|repo|factory|sentry|posthog|feedback|goals|taps):[a-z_]+/); // no signal ids
  expect(words).not.toMatch(/\b(?:ci_blocking|no_agent|queue_jam|fix_failing_pr|doneWhen|bottleneckId)\b/); // no internals
  expect(card.title.length).toBeGreaterThan(0);
  expect(card.title.length).toBeLessThanOrEqual(80); // BrainUnlock.title
  expect(card.why.length).toBeLessThanOrEqual(200); // BrainBottleneck.why
  expect((card.because ?? "").length).toBeLessThanOrEqual(140); // BrainUnlock.because
  for (const o of card.options) expect(o.label.length).toBeLessThanOrEqual(40);
}
/** Every card Shippy has up right now passes plainWords; returns them. */
function checkCopy(f: Fixture): Move[] {
  const cards = f.shippy();
  for (const card of cards) plainWords(card);
  return cards;
}

const quietConsole: { mockRestore(): void }[] = [];
beforeEach(() => { quietConsole.push(spyOn(console, "info").mockImplementation(() => {})); });
afterEach(() => { for (const spy of quietConsole.splice(0)) spy.mockRestore(); });

describe("all clear: a healthy factory keeps Shippy quiet", () => {
  it("deals no unlock card, no win card and no log lines across a day and a half of ticks", async () => {
    const f = fixture();
    await run(f, 36 * HOUR, 10 * MIN, () => {
      expect(f.shippy()).toEqual([]);
      expect(f.saved().holdingBack ?? null).toBeNull();
    });
    // Every source was really read, and none of them had anything to say.
    const cache = f.data.get("brainSignals") as { readAt: Record<string, number>; signals: unknown[] };
    expect(Object.keys(cache.readAt).sort()).toEqual(["ci", "factory", "feedback", "goals", "posthog", "repo", "sentry", "taps"]);
    expect(cache.signals).toEqual([]);
    expect(f.calls.github.some(c => c.includes("/actions/runs"))).toBe(true);
    expect(f.calls.posthog).toBeGreaterThan(0);
    expect(f.memory()?.current).toBeUndefined();
    expect(f.memory()?.cleared ?? []).toEqual([]);
    expect(f.data.get("brainDiagnoses") ?? []).toEqual([]);
    expect(f.deck()).toEqual([]);
    expect(f.logs()).toEqual([]);
  }, 60_000);

  it("never asks the model when there is nothing to weigh, even one that would deal a card if asked", async () => {
    const f = fixture({ world: { model: "diagnose" } });
    await run(f, 12 * HOUR, 5 * MIN, () => expect(f.shippy()).toEqual([]));
    expect(f.calls.diagnose).toBe(0);
    expect(f.memory()?.runs.count ?? 0).toBe(0);
    expect(f.logs()).toEqual([]);
  }, 60_000);

  it("a quiet model is asked at most every half hour, never in a burst, and the deck stays empty", async () => {
    // Something is up (a red PR) but the model says it isn't worth a card.
    const f = fixture({ world: { model: "quiet", prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    expect(f.calls.diagnose).toBe(1);
    await run(f, 10 * MIN, 5_000);
    expect(f.calls.diagnose).toBe(1); // 120 rapid ticks: no second look
    await run(f, 3 * HOUR, MIN, () => expect(f.shippy()).toEqual([]));
    expect(f.calls.diagnose).toBe(1 + 6); // the first look, then one per half hour
    expect(f.memory()?.quiet).toBe(true);
  }, 60_000);

  it.each([["continue", "Nice"], ["later", "Hide"]])("after the player taps %s on the win card, it never comes back, even across a restart", async (optionId, label) => {
    const f = fixture({ world: { prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    expect(f.deck().some(m => m.id === RED_CHECK)).toBe(true);
    f.world.prs = [{ number: 39, workflow: "check", red: false }]; // the check goes green
    await run(f, 10 * MIN, 10 * MIN);
    const win = f.deck().find(m => m.id.startsWith("win:"));
    expect(win).toMatchObject({ id: "win:ci:ci_blocking:check", title: "That's fixed" });
    expect(win!.options.find(o => o.id === optionId)?.label).toBe(label);
    plainWords(win!);
    expect(f.deck().some(m => m.id === RED_CHECK)).toBe(false);
    await f.send({ type: "choose_move", moveId: win!.id, optionId });
    expect(f.shippy()).toEqual([]);
    await run(f, 8 * HOUR, 15 * MIN, () => expect(f.shippy()).toEqual([]));
    f.restart(); await f.checkin();
    await run(f, 2 * HOUR, 15 * MIN, () => expect(f.shippy()).toEqual([]));
    expect(f.logs().filter(l => l.text.startsWith("Unblocked:"))).toHaveLength(1); // said once, when it cleared
  }, 60_000);
});

describe("Later means later: no re-nag", () => {
  it(`a parked card stays away for the whole park window (${BRAIN.laterMs / HOUR} h), across check-ins and a restart, then comes back`, async () => {
    const f = fixture({ world: { prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    const card = f.deck().find(m => m.id === RED_CHECK)!;
    expect(card).toBeDefined();
    const parkedAt = Date.now();
    await f.send({ type: "choose_move", moveId: card.id, optionId: "later" });
    expect(f.memory()?.later["ci:ci_blocking:check"]?.until).toBeGreaterThanOrEqual(parkedAt + BRAIN.laterMs);
    expect(f.shippy()).toEqual([]);
    for (let h = 1; h < 24; h++) {
      await run(f, HOUR, 10 * MIN, () => expect(f.shippy()).toEqual([]));
      if (h % 4 === 0) await f.checkin(); // the player comes back: the deck's own "until next check-in" ends
      if (h === 12) { f.restart(); await f.checkin(); } // the DO is evicted mid-park
      expect(f.shippy()).toEqual([]);
    }
    // Just short of the window: still parked. The PR has been red the whole time.
    clock.set(parkedAt + BRAIN.laterMs - 5 * MIN); await f.checkin(); await f.tick(MIN);
    expect(f.shippy()).toEqual([]);
    // Past it: Shippy raises it again, once.
    clock.set(parkedAt + BRAIN.laterMs + MIN); await f.checkin(); await f.tick(MIN);
    expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]);
    checkCopy(f);
  }, 120_000);

  it("with a goal that lifts CI, Later parks at the lifted weight, so the same red PR doesn't count as worse", async () => {
    // ship_faster lifts CI 1.5x: the red PR ranks at 1.0, and that is what the park must remember.
    const f = fixture({ world: { prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    await f.send({ type: "choose_move", moveId: RED_CHECK, optionId: "later" });
    expect(f.memory()!.later["ci:ci_blocking:check"].weight).toBeGreaterThan(0.95);
    await f.checkin(); await f.tick(10 * MIN); await f.checkin();
    expect(f.shippy()).toEqual([]);
  }, 60_000);

  it("a parked card comes back early only when it gets clearly worse", async () => {
    // A goal that doesn't lift CI, so the red PR's weight has room to get clearly worse.
    const f = fixture({ goal: "first_users", world: { prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    await f.tick(5 * MIN); // the player looks at it a few minutes after Shippy read CI
    await f.send({ type: "choose_move", moveId: RED_CHECK, optionId: "later" });
    const parked = f.memory()!.later["ci:ci_blocking:check"];
    expect(parked.weight).toBeGreaterThan(0.6);
    expect(parked.weight).toBeLessThan(0.7);

    // A second PR fails the same check: a little worse, not clearly. Still parked.
    f.world.prs.push({ number: 41, workflow: "check", red: true });
    await run(f, HOUR, 10 * MIN);
    await f.checkin();
    expect(f.shippy()).toEqual([]);

    // Four PRs fail it now: clearly worse than when it was parked. It comes back the next time the player looks.
    f.world.prs.push({ number: 43, workflow: "check", red: true }, { number: 45, workflow: "check", red: true });
    await f.tick(10 * MIN);
    await f.checkin();
    const back = f.shippy();
    expect(back.map(m => m.id)).toEqual([RED_CHECK]);
    expect(back[0].why).toContain("#39");
    checkCopy(f);
  }, 60_000);

  it("Later on one red PR doesn't hide a different one", async () => {
    const f = fixture({ world: { prs: [{ number: 39, workflow: "check", red: true }, { number: 41, workflow: "lint", red: true }] } });
    await f.tick();
    expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]);
    await f.send({ type: "choose_move", moveId: RED_CHECK, optionId: "later" });
    // The slot is free, so the next pass deals the other red PR, in this same session.
    await f.tick(MIN);
    expect(f.shippy().map(m => m.id)).toEqual([RED_LINT]);
    expect(f.shippy()[0].why).toContain("#41");
    checkCopy(f);
    // And the parked one stays parked behind it.
    await run(f, 2 * HOUR, 10 * MIN, () => expect(f.shippy().map(m => m.id)).toEqual([RED_LINT]));
  }, 60_000);

  it("Laters on different red PRs don't add up to the third-defer card", async () => {
    const f = fixture({ world: { prs: [{ number: 39, workflow: "check", red: true }, { number: 41, workflow: "lint", red: true }, { number: 43, workflow: "types", red: true }] } });
    await f.tick();
    // Three different red checks, one Later each.
    for (const id of [RED_CHECK, RED_LINT, "unlock:ci:ci_blocking:types"]) {
      expect(f.shippy().map(m => m.id)).toEqual([id]);
      await f.send({ type: "choose_move", moveId: id, optionId: "later" });
      await f.checkin(); await f.tick(MIN);
    }
    // A day on, the first one is back as itself, not as "you've set this aside three times".
    clock.advance(BRAIN.laterMs); await f.checkin(); await f.tick(MIN);
    const cards = f.shippy();
    expect(cards.map(m => m.id)).toEqual([RED_CHECK]);
    expect(cards[0].title).not.toBe("Never, or let the factory decide?");
  }, 60_000);

  it("the third Later turns the fourth showing into 'Never, or let the factory decide?', never earlier", async () => {
    const f = fixture({ world: { prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    for (let later = 1; later <= 3; later++) {
      const cards = f.shippy();
      expect(cards.map(m => m.id)).toEqual([RED_CHECK]); // showings 1–3: the plain card
      expect(cards[0].title).not.toBe("Never, or let the factory decide?");
      await f.send({ type: "choose_move", moveId: RED_CHECK, optionId: "later" });
      expect(f.shippy()).toEqual([]);
      // The next day the player comes back and the park has run out.
      clock.advance(BRAIN.laterMs + 10 * MIN); await f.checkin(); await f.tick(MIN);
    }
    const ask = f.shippy();
    expect(ask).toHaveLength(1);
    expect(ask[0]).toMatchObject({ id: `${RED_CHECK}:deferred`, title: "Never, or let the factory decide?", kind: "automate" });
    expect(ask[0].why).toContain("three times");
    expect(ask[0].options.map(o => o.id)).toEqual(["never-kind", "decide-class", "keep-later"]);
    expect(ask[0].options.find(o => o.recommended)?.id).toBe("decide-class");
    plainWords(ask[0]);
    // "Keep it for next time" parks it again like a Later: gone until the window runs out.
    await f.send({ type: "choose_move", moveId: ask[0].id, optionId: "keep-later" });
    expect(f.shippy()).toEqual([]);
    await run(f, 6 * HOUR, 30 * MIN, () => expect(f.shippy()).toEqual([]));
  }, 60_000);
});

describe("Shippy notices a break mid-run", () => {
  it("quiet and green, then a PR's check goes red: the next CI read deals the red-PR card in that same pass", async () => {
    const f = fixture({ world: { prs: [{ number: 39, workflow: "check", red: false }] } });
    await run(f, 2 * HOUR, 10 * MIN, () => expect(f.shippy()).toEqual([]));
    f.world.prs[0].red = true;
    await f.tick(10 * MIN); // one tick: CI is due, read, diagnosed and dealt
    const card = f.deck().find(m => m.id === RED_CHECK);
    expect(card).toBeDefined();
    expect(card!.why).toBe("Failing on #39");
    expect(card!.options.map(o => o.label)).toEqual(["Continue", "Later"]);
    expect(card!.options[0].actions[0]).toMatchObject({ tool: "fix_failing_pr", args: { pr: 39, workflow: "check" } });
    expect(f.memory()?.current?.bottleneck).toMatchObject({ id: "ci:ci_blocking:check", by: "rule", area: "speed" });
    expect(f.saved().holdingBack).toMatchObject({ id: "ci:ci_blocking:check" });
    checkCopy(f);
    // It stays the one card while the PR stays red, without flipping or re-dealing.
    const shownAt = f.memory()!.current!.shownAt;
    await run(f, 2 * HOUR, 10 * MIN, () => expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]));
    expect(f.memory()!.current!.shownAt).toBe(shownAt);
  }, 60_000);

  it("with the model in budget, the model names it: one look, its words cleaned of its own name", async () => {
    const f = fixture({ world: { model: "diagnose", prs: [{ number: 39, workflow: "check", red: false }] } });
    await run(f, HOUR, 10 * MIN);
    expect(f.calls.diagnose).toBe(0);
    f.world.prs[0].red = true;
    await f.tick(10 * MIN);
    expect(f.calls.diagnose).toBe(1);
    const card = f.deck().find(m => m.id === RED_CHECK)!;
    expect(card).toMatchObject({ title: "Let the factory fix the failing check", because: "The factory counted 1 PR stuck on a red check." });
    expect(card.why).toBe("The factory says one PR can't ship until it passes.");
    expect(f.memory()?.current?.bottleneck.by).toBe("spark");
    checkCopy(f);
  }, 60_000);

  it("with the model out of budget, the rule still deals the red-PR card and the model is never called", async () => {
    const f = fixture({ world: { model: "diagnose", prs: [{ number: 39, workflow: "check", red: false }] } });
    // Half the day's calls are gone: the brain saves the rest for planning and review.
    const day = new Date(Date.now()).toISOString().slice(0, 10);
    f.ledger.sqlite.query("INSERT INTO spark_usage(account, day, calls, tokens) VALUES (?, ?, ?, ?)").run("user:1", day, 200, 0);
    await run(f, HOUR, 10 * MIN);
    f.world.prs[0].red = true;
    await f.tick(10 * MIN);
    const card = f.deck().find(m => m.id === RED_CHECK);
    expect(card).toBeDefined();
    expect(card!.title).toBe("Have the Builder fix the failing check");
    expect(f.memory()?.current?.bottleneck.by).toBe("rule");
    expect(f.calls.diagnose).toBe(0);
    checkCopy(f);
    await run(f, 2 * HOUR, 10 * MIN, () => expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]));
    expect(f.calls.diagnose).toBe(0);
  }, 60_000);
});

describe("copy: what Shippy says on the demo path", () => {
  // Every tick and tap in this file runs plainWords over every Shippy card on the deck (settle()). This story deals
  // each kind of card the demo shows, so the rules are known to have seen all of them.
  it("an idle line, a red PR, a Later, the next card and the follow-up all read plainly", async () => {
    const waiting = { id: "gh-7", source: "github_issue", title: "Checkout button does nothing", kind: "bug", state: "queued", district: "web", updatedAt: Date.now() - 2 * HOUR, attempts: 0 } as Item;
    const f = fixture({ items: [waiting], world: { prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]);
    await f.send({ type: "choose_move", moveId: RED_CHECK, optionId: "later" });
    await f.tick(MIN);
    const idle = f.shippy();
    expect(idle.map(m => m.id)).toEqual(["unlock:factory:no_agent:repo"]);
    expect(idle[0].title).toBe("Plug in an agent to build");
    // The work ships: the jam clears and Shippy follows up once.
    const state = f.data.get("state") as FactoryState;
    f.data.set("state", { ...state, items: state.items.map(i => ({ ...i, state: "launched" as const })) });
    (f.factory as unknown as { state: FactoryState | null }).state = null;
    await f.tick(MIN);
    expect(f.shippy().map(m => m.id)).toEqual(["win:factory:no_agent:repo"]);
    expect(f.shippy()[0].why).toMatch(/^Shippy checked again: ".+" is clear now\.$/);
    expect([...f.dealt].sort()).toEqual([RED_CHECK, "unlock:factory:no_agent:repo", "win:factory:no_agent:repo"]);
    expect(f.logs().filter(l => l.level === "warn" || l.level === "error")).toEqual([]);
  }, 60_000);
});

describe("throttle: no burst of model calls", () => {
  it("rapid ticks: one look for the first card, none for the next ten minutes of 5-second ticks", async () => {
    const f = fixture({ world: { model: "diagnose", prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    expect(f.calls.diagnose).toBe(1);
    expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]);
    await run(f, 10 * MIN, 5_000, () => expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]));
    expect(f.calls.diagnose).toBe(1);
    expect(f.memory()?.runs.count).toBe(1);
  }, 60_000);

  it("an unchanged red PR is looked at again every half hour, not every CI read", async () => {
    const f = fixture({ world: { model: "diagnose", prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    await run(f, 3 * HOUR, MIN);
    // The first card, then one half-hourly look per 30 minutes. CI is re-read every 10 minutes and its weight
    // fades between reads; that fade is not a new main signal.
    expect(f.calls.diagnose).toBe(1 + 6);
  }, 60_000);

  it("a changed main signal gets an early look", async () => {
    const f = fixture({ goal: "first_users", world: { model: "diagnose", prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    expect(f.calls.diagnose).toBe(1);
    // A heavier problem: one check failing on three PRs. The next CI read sees it, and Shippy looks again early.
    f.world.prs.push({ number: 41, workflow: "lint", red: true }, { number: 43, workflow: "lint", red: true }, { number: 45, workflow: "lint", red: true });
    await run(f, 10 * MIN, MIN);
    expect(f.calls.diagnose).toBe(2);
    expect(f.shippy().map(m => m.id)).toEqual([RED_LINT]);
    checkCopy(f);
  }, 60_000);

  it(`caps model looks at ${BRAIN.dailyRuns} a day; the card stays up after the cap`, async () => {
    const f = fixture({ world: { model: "diagnose", prs: [{ number: 39, workflow: "check", red: true }] } });
    await f.tick();
    await run(f, 20 * HOUR, 5 * MIN, () => expect(f.shippy().map(m => m.id)).toEqual([RED_CHECK]));
    expect(f.calls.diagnose).toBe(BRAIN.dailyRuns);
    expect(f.memory()?.runs.count).toBe(BRAIN.dailyRuns);
    checkCopy(f);
  }, 120_000);
});
