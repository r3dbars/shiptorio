// The demo's climax, as filmed on r3dbars/Testing (#30-#37, README and docs issues): the player approves three plans of
// the same kind through the deck socket, the dots fill on every card, the third says "Learned.", and the fourth and
// fifth plans are approved by the factory on its own and say so. Ship it at the Gate never is (docs/LEARN.md).
// Unit rules live in learn.test.ts and the code-plan path in deck-factory.test.ts; this file pins what the
// player sees on the deck, in order, for the docs demo, plus the streak resets, the scripted `forget`, a restart,
// and the human-only merge. No network: GitHub fetch is a spy that fails the test if anything is called.
import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv, browserCookies } from "./browser-fixture";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item, type Move, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { testD1 } from "./d1-fixture";
import { flagEnabled } from "../src/flags";
import { launchMove } from "../src/gauntlet";
import { emptyDeckBook } from "../src/deck-decisions";
import { learnFromYes, learnOption } from "../src/learn";
import { issueRevision } from "../src/runner-job";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

type Log = Extract<ServerToWeb, { type: "log" }>;
type Job = Record<string, unknown>;
const DOCS_KEY = "build|district:docs|approve_runner_job";

// The Testing demo issues: README and docs prose, the kind a first-time player is happy to hand off.
const DEMO = [
  { n: 30, title: "README: add a quick start section", district: "/", file: "README.md" },
  { n: 31, title: "Docs: fix the broken install link", district: "docs", file: "docs/install.md" },
  { n: 32, title: "README: explain the config flags", district: "/", file: "README.md" },
  { n: 33, title: "Docs: add an FAQ page", district: "docs", file: "docs/faq.md" },
  { n: 34, title: "Docs: document the CLI output", district: "docs", file: "docs/cli.md" },
  { n: 35, title: "README: add a troubleshooting section", district: "/", file: "README.md" },
  { n: 36, title: "Docs: fix typos in the setup guide", district: "docs", file: "docs/setup.md" },
  { n: 37, title: "Docs: add a glossary", district: "docs", file: "docs/glossary.md" },
] as const;

let fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => { fetchCalls.push(String(input)); throw new Error(`No network in the demo-path test: ${String(input)}`); }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

/** Real Factory DO over in-memory storage, a real-SQLite tap log and the browser socket fixtures (as deck-factory.test.ts). */
function demoFactory(env: Record<string, unknown> = {}) {
  const items: Item[] = DEMO.map(d => ({ id: `gh-${d.n}`, kind: "feature", source: "github_issue", title: d.title, body: "Docs only.", district: d.district, state: "queued", attempts: 0, updatedAt: 1 }));
  const state = FactoryState.parse({ repo: "r3dbars/testing", baseBranch: "main", districts: [], ...starterLine(), items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0, move: null, deck: [] });
  const data = new Map<string, unknown>([["githubAccessCheckedAt", Date.now()], ["state", structuredClone(state)], ["meta", { repo: state.repo, installationId: 1 }], ["openMoves", []]]);
  let alarm: number | null = null;
  const events: ServerToWeb[] = [];
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(options: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)); },
    async getAlarm() { return alarm; }, async setAlarm(value: number) { alarm = value; }, async deleteAlarm() { alarm = null; },
  };
  const taps = testD1();
  const DB = { prepare(sql: string) {
    if (sql.includes("card_taps")) return taps.prepare(sql);
    if (sql.startsWith("SELECT u.id") || sql.startsWith("SELECT u.login")) return { bind: () => ({ first: async () => ({ id: 1, login: "test-player" }) }) };
    if (sql.startsWith("SELECT enabled")) return { bind: () => ({ first: async () => null }) };
    return { bind() { return {
      async all() { return { results: [] }; },
      async first() { return null; },
      async run() { return { success: true }; },
    }; } };
  } };
  const socket = authorizedSocket((raw: string) => events.push(JSON.parse(raw)), "r3dbars/testing");
  let exclusive: Promise<unknown> = Promise.resolve();
  const background: Promise<unknown>[] = [];
  const ctx = { storage, waitUntil: (task: Promise<unknown>) => { background.push(task); }, acceptWebSocket() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket] };
  const fullEnv = credentialEnv({ ...browserEnv, CACHE: membershipCache, DB: authorizedDB(DB), ...env });
  const boot = () => new Factory(ctx as never, fullEnv as never);
  let factory = boot();
  type Internal = { openMoves: Move[] | null; state: FactoryState; runLearned(): Promise<void>; broadcastQueue: Promise<void>; refreshDecisions(): Promise<void>; runnerApprovalMove(job: unknown, item: Item): Move; launch(item: Item, by: "autonomy", head: unknown): Promise<void> };
  const internal = () => factory as unknown as Internal;
  const send = (value: unknown) => factory.webSocketMessage(authorizedSocket(() => {}, "r3dbars/testing"), JSON.stringify(value));
  const checkin = async () => {
    const g = globalThis as unknown as { WebSocketPair?: unknown };
    const prior = g.WebSocketPair;
    g.WebSocketPair = class { 0 = {}; 1 = socket; };
    try {
      const response = await factory.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/testing/factory", { headers: { upgrade: "websocket", origin: "https://shiptorio.com", cookie: await browserCookies() } }));
      expect(response.status).toBe(101);
      await Promise.all(background);
      await internal().broadcastQueue;
    } finally { g.WebSocketPair = prior; }
  };
  // Copies: bun's toMatchObject can write asymmetric matchers back into the object it inspected.
  const saved = () => structuredClone(data.get("state")) as FactoryState;
  const job = (n: number) => structuredClone(data.get(`runnerJob:job-${n}`)) as Job | undefined;
  /** Spark planned issue n: its job waits for approval and the real approval card joins the deck. */
  const planned = async (n: number) => {
    const d = DEMO.find(x => x.n === n)!;
    const stored = { id: `job-${n}`, repo: "r3dbars/testing", itemId: `gh-${n}`, harness: "codex", allowedPaths: [d.file], branch: `shiptorio/runner-${n}`, baseSha: "a".repeat(40), status: "awaiting_approval", approvalMoveId: `approval-${n}`, needsApproval: true,
      plan: `Edit ${d.file} only.`, inputRevision: await issueRevision(d.title, JSON.stringify({ body: "Docs only.", failure: "", scars: [] })) };
    data.set(`runnerJob:job-${n}`, stored);
    const item = internal().state.items.find(i => i.id === `gh-${n}`)!;
    const move = internal().runnerApprovalMove(stored, item);
    data.set("openMoves", [...(data.get("openMoves") as Move[]), move]);
    internal().openMoves = null;
    await internal().refreshDecisions();
    await internal().broadcastQueue;
    return move;
  };
  /** The most recent deck frame the browser got: what the player is looking at. */
  const deckFrame = () => (events.filter((e): e is Extract<ServerToWeb, { type: "deck" }> => e.type === "deck").at(-1)?.deck ?? []);
  const shown = (id: string) => deckFrame().find(m => m.id === id);
  const logs = () => events.filter((e): e is Log => e.type === "log");
  const tick = async () => { await internal().runLearned(); await internal().broadcastQueue; };
  const restart = () => { factory = boot(); return factory; };
  const approve = (n: number) => send({ type: "choose_move", moveId: `approval-${n}`, optionId: "approve" });
  return { data, events, taps, send, checkin, saved, job, planned, deckFrame, shown, logs, tick, restart, approve, internal, get factory() { return factory; } };
}
type Demo = ReturnType<typeof demoFactory>;

/** Approve n plans in a row through the socket, checking the dots the player saw on each card before the tap. */
async function teach(f: Demo, issues: number[], startHave = 0) {
  let have = startHave;
  for (const n of issues) {
    await f.planned(n);
    expect(f.shown(`approval-${n}`)?.learn).toEqual(have ? { have, need: 3 } : undefined);
    await f.approve(n);
    expect(f.job(n)).toMatchObject({ status: "ready", approvedBy: "player" });
    have++;
  }
}

describe("demo climax: approve three docs plans, the fourth ships by itself", () => {
  it("dots on every card in order, Learned. on the third, the fourth and fifth approved by autonomy and shown as such", async () => {
    const f = demoFactory();
    await f.checkin();
    expect(f.deckFrame().some(m => m.id.startsWith("approval-"))).toBe(false);

    // Card 1: no dots (a brand-new player's first card stays plain). Card 2: ●○○. Card 3: ●●○.
    await teach(f, [30, 31, 32]);
    // The third yes is the one that learns, and the player is told so plainly.
    const learnedLog = f.logs().filter(l => l.text.startsWith("Learned."));
    expect(learnedLog).toHaveLength(1);
    expect(learnedLog[0]).toMatchObject({ text: "Learned. The factory does these on its own now.", level: "success", itemId: "gh-32", actor: "player" });
    expect(learnedLog[0].reason).toContain("Make it yours");
    // README (root) and docs/ prose teach one permission.
    expect(f.saved().learned).toEqual([{ key: DOCS_KEY, label: "Approving plans in /docs", since: expect.any(Number) }]);
    const learnedAt = f.logs().indexOf(learnedLog[0]);
    const approvals = f.logs().filter(l => l.tool === "approve_runner_job");
    expect(approvals.map(l => l.approvedBy)).toEqual(["player", "player", "player"]);

    // Card 4 arrives. Learned kinds show no dots: the next tick answers it.
    const four = await f.planned(33);
    expect(f.shown(four.id)?.learn).toBeUndefined();
    await f.tick();
    expect(f.job(33)).toMatchObject({ status: "ready", approvedBy: "autonomy", approvedAt: expect.any(Number) });
    // What the player sees after: the card is gone from their deck...
    expect(f.shown(four.id)).toBeUndefined();
    expect(f.saved().deck?.some(m => m.id === four.id)).toBe(false);
    // ...the log says the factory did it on its own, because they taught it, and how to turn it off.
    const auto = f.logs().slice(learnedAt).filter(l => l.itemId === "gh-33");
    expect(auto.find(l => l.tool === "approve_runner_job")).toMatchObject({ actor: "spark", approvedBy: "autonomy", text: "Plan approved. Your local agent can now start." });
    const taught = auto.find(l => l.reason === "You taught it this one. Turn it off in Make it yours.");
    expect(taught).toMatchObject({ actor: "spark", approvedBy: "autonomy", level: "info" });
    expect(taught?.text).toBe("Build #33: Docs: add an FAQ page: Approve and build with Codex");
    expect(auto.some(l => l.approvedBy === "player")).toBe(false);
    // ...the crate is credited to the learned kind (the deck's "auto" mark), and the tap log says auto, not continue.
    expect(f.saved().learned?.[0].items).toEqual(["gh-33"]);
    // One showing, answered by the factory: not also logged as a card the player let go by (taps.ts recordTap).
    expect((await f.taps.prepare("SELECT action, option_id FROM card_taps WHERE card_id = 'approval-33'").bind().all()).results).toEqual([{ action: "auto", option_id: "approve" }]);

    // Card 5 too, with nobody tapping.
    await f.planned(34);
    await f.tick();
    expect(f.job(34)).toMatchObject({ status: "ready", approvedBy: "autonomy" });
    expect(f.shown("approval-34")).toBeUndefined();
    expect(f.saved().learned?.[0].items).toEqual(["gh-33", "gh-34"]);
    // The player's own three stay theirs; still exactly one "Learned." line.
    for (const n of [30, 31, 32]) expect(f.job(n)?.approvedBy).toBe("player");
    expect(f.logs().filter(l => l.text.startsWith("Learned."))).toHaveLength(1);
    // Nothing left the box.
    expect(fetchCalls).toEqual([]);
  });

  it("the learned docs permission does not approve a code plan on the same demo repo", async () => {
    const f = demoFactory();
    await f.checkin();
    await teach(f, [30, 31, 32]);
    await f.planned(33);
    f.data.set("runnerJob:job-33", { ...f.job(33), allowedPaths: ["src/index.ts"] });
    await f.tick();
    expect(f.job(33)).toMatchObject({ status: "awaiting_approval" });
    expect(f.shown("approval-33")).toBeDefined();
  });
});

describe("a Later, an Edit or a dismiss in the middle resets the streak", () => {
  for (const [name, interrupt] of [
    ["Later", (f: Demo) => f.send({ type: "defer_move", moveId: "approval-32" })],
    ["Edit (the other option: Not now)", (f: Demo) => f.send({ type: "choose_move", moveId: "approval-32", optionId: "decline" })],
    ["a dismiss", (f: Demo) => f.send({ type: "dismiss_move", moveId: "approval-32", why: "once" })],
  ] as const) it(`after two yeses, ${name} on the third card empties the dots and nothing is learned`, async () => {
    const f = demoFactory();
    await f.checkin();
    await teach(f, [30, 31]);
    await f.planned(32);
    expect(f.shown("approval-32")?.learn).toEqual({ have: 2, need: 3 });
    await interrupt(f);
    expect(f.job(32)?.status).not.toBe("ready");
    expect(f.saved().learned).toEqual([]);
    expect(f.logs().some(l => l.text.startsWith("Learned."))).toBe(false);
    // The next card starts from zero: no dots, then ●○○, ●●○, and only then learned.
    await teach(f, [33, 34, 35]);
    expect(f.saved().learned?.map(l => l.key)).toEqual([DOCS_KEY]);
    await f.planned(36);
    await f.tick();
    expect(f.job(36)).toMatchObject({ status: "ready", approvedBy: "autonomy" });
  });
});

describe("the scripted run's forget (unlearn *) leaves a filmed take at zero", () => {
  it("clears a learned kind and a half-filled streak; the next card has no dots and nothing runs on its own", async () => {
    const f = demoFactory();
    await f.checkin();
    await teach(f, [30, 31, 32]);
    await f.planned(33);
    await f.tick();
    expect(f.job(33)?.approvedBy).toBe("autonomy");
    await f.send({ type: "unlearn", key: "*" });
    expect(f.saved().learned).toEqual([]);
    expect(f.logs().at(-1)?.text).toBe("Got it. The factory asks you about these again.");
    const book = f.data.get("deckBook") as { auto?: object; learnYes?: object; autoRuns?: unknown[] };
    expect(book.auto).toEqual({}); expect(book.learnYes).toEqual({}); expect(book.autoRuns).toEqual([]);

    // The take: card one is plain and waits for the player.
    await f.planned(34);
    expect(f.shown("approval-34")?.learn).toBeUndefined();
    await f.tick();
    expect(f.job(34)?.status).toBe("awaiting_approval");
    expect(f.shown("approval-34")).toBeDefined();
    // And the whole beat plays again from zero.
    await f.send({ type: "choose_move", moveId: "approval-34", optionId: "approve" });
    await teach(f, [35, 36], 1);
    expect(f.saved().learned?.map(l => l.key)).toEqual([DOCS_KEY]);
  });

  it("forget after a partial streak (two dots, no learn) also starts at zero", async () => {
    const f = demoFactory();
    await f.checkin();
    await teach(f, [30, 31]);
    await f.send({ type: "unlearn", key: "*" });
    await f.planned(32);
    expect(f.shown("approval-32")?.learn).toBeUndefined();
    await f.approve(32);
    await f.planned(33);
    expect(f.shown("approval-33")?.learn).toEqual({ have: 1, need: 3 });
  });
});

describe("a restart keeps what the player taught", () => {
  it("dots survive a restart mid-streak, and a learned kind keeps running after one", async () => {
    const f = demoFactory();
    await f.checkin();
    await teach(f, [30, 31]);
    f.restart();
    await f.checkin();
    await f.planned(32);
    expect(f.shown("approval-32")?.learn).toEqual({ have: 2, need: 3 });
    await f.approve(32);
    expect(f.saved().learned?.map(l => l.key)).toEqual([DOCS_KEY]);

    f.restart();
    await f.checkin();
    expect(f.saved().learned?.map(l => l.key)).toEqual([DOCS_KEY]);
    await f.planned(33);
    await f.tick();
    expect(f.job(33)).toMatchObject({ status: "ready", approvedBy: "autonomy" });
    expect(f.shown("approval-33")).toBeUndefined();
  });
});

describe("Ship it at the Gate is never automatic, even when learned", () => {
  const onPad = (): Item => ({ id: "gh-30", kind: "feature", source: "github_issue", title: "README: add a quick start section", district: "/", state: "on_pad", attempts: 1, updatedAt: 1, prNumber: 41, branch: "shiptorio/runner-30",
    inspection: { headSha: "b".repeat(40), state: "passed", stages: [] } } as unknown as Item);

  it("the real Gate card can never be learned: three Ship it yeses fill no dots", () => {
    const gate = launchMove(onPad());
    expect(gate.kind).toBe("ship");
    expect(gate.options[0].actions[0].tool).toBe("request_merge");
    expect(learnOption(gate)).toBeNull();
    const book = emptyDeckBook();
    for (let i = 0; i < 5; i++) expect(learnFromYes(book, gate, "district:/", i, true, "test-player")).toBe(false);
    expect(book.learnYes).toBeUndefined();
    expect(book.auto).toBeUndefined();
  });

  it("launch permits and autonomy levels stay parked even where every new feature is on (FEATURES=all)", async () => {
    for (const env of [{}, { FEATURES: "all" }]) {
      expect(await flagEnabled(env, "permits")).toBe(false);
      expect(await flagEnabled(env, "autonomy")).toBe(false);
      expect(await flagEnabled(env, "learn")).toBe(true);
    }
  });

  it("with docs plans learned (and even a forged learned merge), a ready PR waits on the Gate for the player", async () => {
    const f = demoFactory({ FEATURES: "all" });
    await f.checkin();
    await teach(f, [30, 31, 32]);
    const internal = f.internal();
    const item = { ...onPad(), id: "gh-37", title: "Docs: add a glossary", district: "docs" } as Item;
    internal.state.items = internal.state.items.map(i => i.id === item.id ? item : i);
    const gate = launchMove(item);
    f.data.set("openMoves", [...(f.data.get("openMoves") as Move[]), gate]);
    internal.openMoves = null;
    // A forged or stale book entry that claims Ship it was learned must still not merge anything.
    const book = f.data.get("deckBook") as { auto: Record<string, unknown> };
    book.auto["ship|district:docs|request_merge"] = { since: 1, label: "Shipping", by: "test-player" };
    f.data.set("deckBook", book);
    (internal as unknown as { deckBook: unknown }).deckBook = null;
    await internal.refreshDecisions();
    for (let i = 0; i < 3; i++) await f.tick();
    // The launch handler refuses an autonomous merge on its own too.
    await internal.launch(item, "autonomy", item.inspection!.headSha);
    expect(fetchCalls.filter(u => /merge|pulls/.test(u))).toEqual([]);
    expect(fetchCalls).toEqual([]);
    expect(f.saved().items.find(i => i.id === "gh-37")?.state).toBe("on_pad");
    expect(f.logs().some(l => l.tool === "request_merge")).toBe(false);
    expect(await f.taps.prepare(`SELECT action FROM card_taps WHERE card_id = '${gate.id}' AND action = 'auto'`).bind().first()).toBeNull();
  });
});
