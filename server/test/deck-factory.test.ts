import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv, browserCookies } from "./browser-fixture";
import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Move, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { emptyDeckBook, moveKey } from "../src/deck-decisions";
import { testD1 } from "./d1-fixture";
import { flagKey } from "../src/flags";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
const card = (id: string, overrides: Partial<Move> = {}): Move => ({ id, title: `Review ${id}`, why: "A real factory decision", kind: "verify", createdAt: 1, focus: "verify-1", options: [{ id: "review", label: "Review", recommended: true, actions: [{ tool: "inspect_bottleneck", args: { stage: "inspect" }, reason: "Read the queue" }] }], ...overrides });

/** Real DO methods with durable storage/SQL/transport substitutes, no network services. */
function fixture(cards: Move[], stateOverrides: Partial<FactoryState> = {}) {
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0, move: cards[0] ?? null, deck: cards, ...stateOverrides });
  const data = new Map<string, unknown>([["state", structuredClone(state)], ["meta", { repo: state.repo, installationId: 1 }], ["openMoves", structuredClone(cards)]]);
  const rules = new Map<string, { repo: string; kind: string; scope: string; actionId: string }>();
  let alarm: number | null = null;
  const events: ServerToWeb[] = [];
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(options: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)); },
    async getAlarm() { return alarm; }, async setAlarm(value: number) { alarm = value; },
  };
  const taps = testD1(); // docs/context/taps.md: the card tap log runs on real SQLite
  const DB = { prepare(sql: string) {
    if (sql.includes("card_taps")) return taps.prepare(sql);
    if (sql.startsWith('SELECT u.id') || sql.startsWith('SELECT u.login')) return {bind:()=>({first:async()=>({id:1,login:'test-player'})})};
    if (sql.startsWith('SELECT enabled')) return {bind:()=>({first:async()=>null})};
    return { bind(...args: unknown[]) { return {
    async all() { if (sql.includes("FROM deleted_factories")) return {results: []}; if (!sql.startsWith("SELECT kind, scope")) throw new Error(`Unexpected query ${sql}`); return { results: [...rules.values()].filter(r => r.repo === args[0]).map(({ kind, scope, actionId }) => ({ kind, scope, actionId })) }; },
    async run() {
      if (sql.startsWith("INSERT INTO move_kind_rules")) { const [repo, kind, scope, actionId] = args as string[]; const key = JSON.stringify([repo, kind, scope]); if (!rules.has(key)) rules.set(key, { repo, kind, scope, actionId }); }
      else if (sql.startsWith("DELETE FROM move_kind_rules")) { const [repo, kind, scope, actionId] = args; const key = JSON.stringify([repo, kind, scope]); if (rules.get(key)?.actionId === actionId) rules.delete(key); }
      else throw new Error(`Unexpected write ${sql}`);
      return { success: true };
    },
  }; } }; } };
  const socket = authorizedSocket((raw: string) => events.push(JSON.parse(raw)));
  let exclusive: Promise<unknown> = Promise.resolve();
  const background: Promise<unknown>[] = [];
  const ctx = { storage, waitUntil: (task: Promise<unknown>) => { background.push(task); }, acceptWebSocket() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket] };
  const reload = () => new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE: membershipCache, DB: authorizedDB(DB) }) as never);
  const factory = reload();
  const send = (value: unknown, instance = factory) => instance.webSocketMessage(authorizedSocket(), JSON.stringify(value));
  const checkin = async (instance = factory) => {
    const prior = (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
    (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = class { 0 = {}; 1 = socket; };
    try {
      const response = await instance.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/demo/factory", { headers: { upgrade: "websocket", origin: "https://shiptorio.com", cookie: await browserCookies() } }));
      expect(response.status).toBe(101);
      // These scenarios start after initial deck frames reach the browser, which
      // is now intentionally later than the handshake response.
      await Promise.all(background);
      await (instance as unknown as { broadcastQueue: Promise<void> }).broadcastQueue;
    }
    finally { (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair = prior; }
  };
  const saved = () => data.get("state") as FactoryState;
  const undoId = () => events.filter((e): e is Extract<ServerToWeb, { type: "log" }> => e.type === "log" && !!e.actionId).at(-1)!.actionId!;
  return { factory, reload, send, checkin, data, saved, rules, events, undoId, socket, taps };
}

describe("durable live check-in decisions", () => {
  it("checks the upgrade principal once per request and rechecks repository access and revocation", async () => {
    const f = fixture([]);
    const internal = f.factory as unknown as { env: { DB: { prepare(sql: string): any } }; githubStopped(): Promise<boolean> };
    internal.githubStopped = async () => true;
    const prepare = internal.env.DB.prepare.bind(internal.env.DB);
    let reads = 0, revoked = false, revokeDuringUpgrade = false;
    internal.env.DB.prepare = (sql: string) => {
      const statement = prepare(sql);
      if (!sql.startsWith("SELECT u.id, u.login FROM sessions")) return statement;
      return { ...statement, bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { ...bound, first: async () => { reads++; return revoked || revokeDuringUpgrade && reads > 1 ? null : bound.first(); } };
      } };
    };
    await f.checkin();
    // One principal read plus the independent repository authorization read.
    expect(reads).toBe(2);
    reads = 0;
    await f.checkin();
    expect(reads).toBe(2); // Never reuse the prior request's authority.
    // A revocation between principal verification and repository authorization
    // still denies the upgrade; the two reads are deliberately not collapsed.
    reads = 0;
    revokeDuringUpgrade = true;
    const raced = await f.factory.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/demo/factory", { headers: { upgrade: "websocket", origin: "https://shiptorio.com", cookie: await browserCookies() } }));
    expect(raced.status).toBe(403);
    expect(reads).toBe(2);
    expect((f.factory as any).socketFetch).toBeUndefined();
    revoked = true;
    const response = await f.factory.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/demo/factory", { headers: { upgrade: "websocket", origin: "https://shiptorio.com", cookie: await browserCookies() } }));
    expect(response.status).toBe(401);
  });

  it("retries an unchanged decision after a transient cursor write failure", async () => {
    const f = fixture([card("first"), card("second")]);
    await f.checkin();
    const internal = f.factory as unknown as { openMoves: Move[]; refreshDecisions(): Promise<void>; broadcastQueue: Promise<void>; ctx: { storage: { put(key: string, value: unknown): Promise<void> } } };
    const put = internal.ctx.storage.put.bind(internal.ctx.storage);
    let cursorWrites = 0;
    internal.ctx.storage.put = async (key, value) => {
      if (key === "browserSeq" && ++cursorWrites === 2) throw new Error("Cursor storage temporarily unavailable");
      await put(key, value);
    };
    internal.openMoves.find(m => m.id === "second")!.why = "New receipts";
    f.events.length = 0;
    await internal.refreshDecisions();
    await internal.broadcastQueue;
    expect(f.events.map(e => e.type)).toEqual(["patch"]); // Deck allocation failed.
    f.events.length = 0;
    await internal.refreshDecisions();
    await internal.broadcastQueue;
    expect(f.events.map(e => e.type)).toEqual(["patch", "deck"]);
    expect(f.events.find(e => e.type === "deck")).toMatchObject({ deck: [{ id: "first" }, { id: "second", why: "New receipts" }] });
  });

  it("does not let an older failed publication invalidate a later identical payload after intervening changes", async () => {
    const f = fixture([card("first"), card("second")]);
    await f.checkin();
    const internal = f.factory as unknown as { openMoves: Move[]; refreshDecisions(): Promise<void>; broadcastQueue: Promise<void>; ctx: { storage: { put(key: string, value: unknown): Promise<void> } } };
    const put = internal.ctx.storage.put.bind(internal.ctx.storage);
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let cursorWrites = 0;
    internal.ctx.storage.put = async (key, value) => {
      if (key === "browserSeq" && ++cursorWrites === 2) {
        started.resolve(); await release.promise; throw new Error("Old cursor allocation failed");
      }
      await put(key, value);
    };
    const second = internal.openMoves.find(m => m.id === "second")!;
    try {
      second.why = "Payload A";
      await internal.refreshDecisions();
      await started.promise;
      second.why = "Payload B";
      await internal.refreshDecisions();
      second.why = "Payload A";
      await internal.refreshDecisions();
    } finally { release.resolve(); }
    await internal.broadcastQueue;
    const decks = f.events.filter((e): e is Extract<ServerToWeb, { type: "deck" }> => e.type === "deck");
    expect(decks.slice(-2).map(e => e.deck.find(m => m.id === "second")?.why)).toEqual(["Payload B", "Payload A"]);
    f.events.length = 0;
    await internal.refreshDecisions();
    await internal.broadcastQueue;
    expect(f.events.map(e => e.type)).toEqual(["patch"]); // Later A stays acknowledged.
  });

  it("publishes the first decisions, then keeps telemetry without repeating unchanged card frames or their authorization reads", async () => {
    const f = fixture([card("first"), card("second")]);
    await f.checkin();
    expect(f.events.filter(e => e.type === "deck")).toHaveLength(1);
    expect(f.events.filter(e => e.type === "move")).toHaveLength(1);
    const internal = f.factory as unknown as { refreshDecisions(): Promise<void>; broadcastQueue: Promise<void>; env: { DB: { prepare(sql: string): any } } };
    const prepare = internal.env.DB.prepare.bind(internal.env.DB);
    let sessionReads = 0;
    internal.env.DB.prepare = sql => { if (sql.startsWith("SELECT u.id, u.login FROM sessions")) sessionReads++; return prepare(sql); };
    f.events.length = 0;
    await internal.refreshDecisions();
    await internal.broadcastQueue;
    expect(f.events.map(e => e.type)).toEqual(["patch"]);
    expect(sessionReads).toBe(1); // Fresh authorization for the one real telemetry frame.
    expect(f.saved().move?.id).toBe("first");
  });

  it("publishes changed lower cards and changed top options, resolves removal, and can offer the same card again", async () => {
    const f = fixture([card("first"), card("second")]);
    await f.checkin();
    const internal = f.factory as unknown as { openMoves: Move[]; refreshDecisions(): Promise<void>; broadcastQueue: Promise<void> };
    const refresh = async () => { f.events.length = 0; await internal.refreshDecisions(); await internal.broadcastQueue; };
    internal.openMoves.find(m => m.id === "second")!.why = "The evidence changed";
    await refresh();
    expect(f.events.map(e => e.type)).toEqual(["patch", "deck"]);
    internal.openMoves.find(m => m.id === "first")!.options[0].label = "Read the updated receipts";
    await refresh();
    expect(f.events.map(e => e.type)).toEqual(["patch", "deck", "move"]);
    expect(f.events.find(e => e.type === "move")).toMatchObject({ move: { options: [{ label: "Read the updated receipts" }] } });
    const first = structuredClone(internal.openMoves.find(m => m.id === "first")!);
    internal.openMoves = [];
    await refresh();
    expect(f.events.map(e => e.type)).toEqual(["patch", "deck", "move_resolved"]);
    internal.openMoves = [first];
    await refresh();
    expect(f.events.map(e => e.type)).toEqual(["patch", "deck", "move"]);
  });

  it("sends full snapshots on reconnect and still denies revoked sessions when decisions are unchanged", async () => {
    const f = fixture([card("first")]);
    await f.checkin();
    f.events.length = 0;
    await f.checkin();
    const snapshot = f.events.find(e => e.type === "snapshot");
    expect(snapshot).toMatchObject({ state: { move: { id: "first" }, deck: [{ id: "first" }] } });
    const internal = f.factory as unknown as { refreshDecisions(): Promise<void>; broadcastQueue: Promise<void>; env: { DB: { prepare(sql: string): any } } };
    const prepare = internal.env.DB.prepare.bind(internal.env.DB);
    internal.env.DB.prepare = sql => sql.startsWith("SELECT u.id, u.login FROM sessions") ? { bind: () => ({ first: async () => null }) } : prepare(sql);
    let closed = 0;
    f.socket.close = () => { closed++; };
    f.events.length = 0;
    await internal.refreshDecisions();
    await internal.broadcastQueue;
    expect(f.events).toEqual([]);
    expect(closed).toBe(1);
  });

  it("republishes unchanged cards under newly learned redaction policy without churning on duplicate registration", async () => {
    const credential = "opaque provider credential 雪";
    const f = fixture([card("first", { why: `Evidence includes ${credential}` })]);
    await f.checkin();
    expect(f.events.find(e => e.type === "move")).toMatchObject({ move: { why: `Evidence includes ${credential}` } });
    const internal = f.factory as unknown as { redactor: { register(value: unknown): void }; refreshDecisions(): Promise<void>; broadcastQueue: Promise<void> };
    internal.redactor.register({ ACCESS_TOKEN: credential });
    f.events.length = 0;
    await internal.refreshDecisions();
    await internal.broadcastQueue;
    expect(f.events.map(e => e.type)).toEqual(["patch", "deck", "move"]);
    expect(f.events.find(e => e.type === "deck")).toMatchObject({ deck: [{ why: "Evidence includes [REDACTED]" }] });
    expect(f.events.find(e => e.type === "move")).toMatchObject({ move: { why: "Evidence includes [REDACTED]" } });
    internal.redactor.register({ ACCESS_TOKEN: credential });
    f.events.length = 0;
    await internal.refreshDecisions();
    await internal.broadcastQueue;
    expect(f.events.map(e => e.type)).toEqual(["patch"]);
  });

  it("returns an authorized handshake while another session frame authorization is held", async () => {
    const f = fixture([]);
    await f.factory.exportState();
    const oldHash = "f".repeat(64);
    const attachment = f.socket.deserializeAttachment() as { user: { sessionHash: string } };
    attachment.user.sessionHash = oldHash;
    f.socket.serializeAttachment(attachment);
    const internal = f.factory as unknown as { env: { DB: { prepare(sql: string): any } }; broadcast(value: unknown): Promise<void>; broadcastQueue: Promise<void> };
    const prepare = internal.env.DB.prepare.bind(internal.env.DB);
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    internal.env.DB.prepare = (sql: string) => {
      const statement = prepare(sql);
      if (!sql.startsWith("SELECT u.id, u.login FROM sessions")) return statement;
      return { ...statement, bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { ...bound, first: async () => { if (args[0] === oldHash) { started.resolve(); await release.promise; return null; } return bound.first(); } };
      } };
    };
    const prior = (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
    const frames: ServerToWeb[] = [];
    const freshSocket = authorizedSocket(raw => frames.push(JSON.parse(raw)));
    (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = class { 0 = {}; 1 = freshSocket; };
    const queued = internal.broadcast({ type: "patch", patch: { tick: 9 } });
    await started.promise;
    let opening: Promise<Response> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      opening = f.factory.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/demo/factory", { headers: { upgrade: "websocket", origin: "https://shiptorio.com", cookie: await browserCookies() } }));
      const response = await Promise.race([opening, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Handshake waited on unrelated browser delivery")), 1000); })]);
      expect(response.status).toBe(101);
      expect(frames.some(frame => frame.type === "snapshot" && frame.state.repo === "r3dbars/demo")).toBe(true);
      expect(f.events).toEqual([]); // The old session has not completed authorization.
    } finally {
      clearTimeout(timer);
      release.resolve();
      await opening?.catch(() => {});
      await queued;
      await internal.broadcastQueue;
      (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair = prior;
    }
    expect(f.events).toEqual([]); // Old session denial still prevents queued data delivery.
  });

  it("defers until the next check-in, retains counts across restart, and escalates the third defer", async () => {
    const f = fixture([card("defer")]);
    await f.checkin();
    let current = f.factory;
    for (let count = 1; count <= 3; count++) {
      await f.send({ type: "defer_move", moveId: "defer" }, current);
      expect(f.saved().deck).toEqual([]);
      current = f.reload();
      await f.checkin(current);
      expect(f.saved().deck?.[0].id).toBe(count === 3 ? "defer:deferred" : "defer");
    }
    expect(f.saved().move?.title).toBe("Never, or let the factory decide?");
    await f.send({ type: "choose_move", moveId: "defer:deferred", optionId: "decide-class" }, current);
    expect(f.saved().deck).toEqual([]);
    expect(f.data.get("approvalEvents")).toEqual([expect.objectContaining({ kind: "verify" })]);
  });

  it("concurrent Later deliveries count once and survive reconnect with the same next-check-in card", async () => {
    const move = card("replayed-later");
    const f = fixture([move]);
    await f.checkin();
    await Promise.all([f.send({ type: "defer_move", moveId: move.id }), f.send({ type: "defer_move", moveId: move.id })]);
    expect((f.data.get("deckBook") as ReturnType<typeof emptyDeckBook>).decisions[moveKey(move)].count).toBe(1);
    expect(f.saved().deck).toEqual([]);
    const restarted = f.reload(); await f.checkin(restarted);
    expect(f.saved().deck?.map(m => m.id)).toEqual([move.id]);
    expect((f.data.get("deckBook") as ReturnType<typeof emptyDeckBook>).decisions[moveKey(move)].count).toBe(1);
  });

  it("reconnect derives pipeline from durable jobs instead of a stale stored projection", async () => {
    const f = fixture([], { items: [{ id: "gh-1", kind: "bug", source: "github_issue", title: "A fix", district: "/", state: "queued", updatedAt: 1, attempts: 0 }] });
    f.data.set("runnerJob:durable", { id: "durable", itemId: "gh-1", status: "ready", repo: "r3dbars/demo", harness: "codex", allowedPaths: [], branch: "shiptorio/runner-test", approvedAt: 1, lease: "never-public" });
    await f.checkin();
    const snapshot = f.events.find((e): e is Extract<ServerToWeb, {type:"snapshot"}> => e.type === "snapshot")!;
    expect(snapshot.state.pipeline?.find(s => s.id === "builder")).toMatchObject({ state: "stuck", cause: "runner_offline", itemIds: ["gh-1"] });
    expect(JSON.stringify(snapshot.state.pipeline)).not.toContain("never-public");
    expect(f.saved().pipeline).toBeUndefined(); // Projection is not another durable state machine.
    f.data.set("runnerPresence", { harnesses: ["codex"], seenAt: Date.now() });
    f.events.length = 0; await f.checkin(f.reload());
    const fresh = f.events.find((e): e is Extract<ServerToWeb, {type:"snapshot"}> => e.type === "snapshot")!;
    expect(fresh.state.pipeline?.find(s => s.id === "builder")).toMatchObject({ state: "working", cause: "building" });
  });

  it("logs every card offered and what the player tapped, with the wait and the planner's reason", async () => {
    const f = fixture([card("yes", { because: "Two PRs wait on review." }), card("later", { kind: "input" }), card("wrong", { kind: "build" })]);
    await f.checkin();
    const rows = async () => (await f.taps.prepare("SELECT card_id, kind, action, reason, because, suggested, decided_at, shown_at FROM card_taps ORDER BY card_id, id").all<Record<string, unknown>>()).results;
    expect((await rows()).map(r => [r.card_id, r.action])).toEqual([["later", null], ["wrong", null], ["yes", null]]);
    await f.send({ type: "choose_move", moveId: "yes", optionId: "review" });
    await f.send({ type: "defer_move", moveId: "later" });
    await f.send({ type: "dismiss_move", moveId: "wrong", why: "wrong" });
    const after = await rows();
    expect(after.map(r => [r.card_id, r.action, r.reason])).toEqual([["later", "later", null], ["wrong", "never", "wrong"], ["yes", "continue", null]]);
    expect(after[2]).toMatchObject({ kind: "verify", because: "Two PRs wait on review.", suggested: "review" });
    expect(after.every(r => typeof r.decided_at === "number")).toBe(true);
    // A card still on the deck after its tap isn't logged again; a card offered again after Later is a new showing.
    await f.checkin(f.reload());
    expect((await rows()).filter(r => r.card_id === "later")).toHaveLength(2);
  });

  it("grades bottleneck-brain cards by their play, with the signals the brain saw", async () => {
    const f = fixture([card("unlock:ci:ci_slow:repo", { kind: "automate", options: [{ id: "continue", label: "Cache installs", recommended: true, actions: [] }, { id: "later", label: "Later", recommended: false, actions: [] }] })]);
    f.data.set("brainMemory", { current: { bottleneck: { id: "ci:ci_slow:repo", by: "spark" }, unlock: { play: "ci_cache_installs" } } });
    f.data.set("brainSignals", { signals: [{ id: "ci:ci_slow:repo", severity: 0.734 }] });
    await f.checkin();
    const row = await f.taps.prepare("SELECT play, by, context FROM card_taps WHERE card_id = 'unlock:ci:ci_slow:repo'").first<{ play: string; by: string; context: string }>();
    expect(row).toMatchObject({ play: "ci_cache_installs", by: "spark" });
    expect(JSON.parse(row!.context).signals).toEqual([{ id: "ci:ci_slow:repo", severity: 0.73 }]);
  });

  it("can resolve the third-defer choice for an implied bottleneck card", async () => {
    const f = fixture([], { items: [{ id: "gh-unpowered", kind: "bug", source: "github_issue", title: "Waiting for a builder", district: "/", state: "queued", attempts: 0, updatedAt: 1 }] });
    let current = f.factory;
    await f.checkin(current);
    const originalId = f.saved().deck!.find(m => m.stage === "resources")!.id;
    for (let n = 0; n < 3; n++) {
      await f.send({ type: "defer_move", moveId: originalId }, current);
      current = f.reload();
      await f.checkin(current);
    }
    const escalation = f.saved().deck!.find(m => m.id === `${originalId}:deferred`)!;
    expect(escalation.title).toBe("Never, or let the factory decide?");
    await f.send({ type: "choose_move", moveId: escalation.id, optionId: "decide-class" }, current);
    expect(f.saved().deck?.some(m => m.id === escalation.id)).toBe(false);
    expect(f.data.get("approvalEvents")).toEqual([expect.objectContaining({ kind: "unblock" })]);
  });

  it("dismiss once removes only that card and undo restores it after a DO restart", async () => {
    const f = fixture([card("one"), card("two", { kind: "input" })]);
    await f.checkin();
    await f.send({ type: "dismiss_move", moveId: "one", why: "once" });
    expect(f.saved().deck?.map(m => m.id)).toEqual(["two"]);
    const actionId = f.undoId();
    const restarted = f.reload();
    await f.checkin(restarted);
    expect(f.saved().deck?.map(m => m.id)).toEqual(["two"]);
    await f.send({ type: "undo", actionId }, restarted);
    expect(new Set(f.saved().deck?.map(m => m.id))).toEqual(new Set(["one", "two"]));
    expect(f.rules.size).toBe(0);
  });

  it("mutes one kind/scope in D1, applies that rule after restart, and undo removes exactly its rule", async () => {
    const f = fixture([card("verify-one"), card("verify-two"), card("input", { kind: "input" })]);
    await f.checkin();
    await f.send({ type: "dismiss_move", moveId: "verify-one", why: "kind" });
    expect(f.rules.size).toBe(1);
    expect(f.saved().deck?.map(m => m.id)).toEqual(["input"]);
    const actionId = f.undoId();
    const restarted = f.reload();
    await f.checkin(restarted);
    expect(f.saved().deck?.map(m => m.id)).toEqual(["input"]);
    await f.send({ type: "undo", actionId }, restarted);
    expect(f.rules.size).toBe(0);
    expect(new Set(f.saved().deck?.map(m => m.id))).toEqual(new Set(["verify-one", "verify-two", "input"]));
  });

  it("records class automation intent without issuing a permit, and retracts it on undo", async () => {
    const f = fixture([card("automation")]);
    await f.checkin();
    await f.send({ type: "dismiss_move", moveId: "automation", why: "spark" });
    expect(f.saved().deck).toEqual([]);
    expect(f.data.get("approvalEvents")).toEqual([expect.objectContaining({ kind: "verify", scope: "tool:inspect_bottleneck" })]);
    expect(f.saved().autonomy?.districts?.some(d => d.permit) ?? false).toBe(false);
    await f.send({ type: "undo", actionId: f.undoId() });
    expect(f.saved().deck?.map(m => m.id)).toEqual(["automation"]);
    expect(f.data.get("approvalEvents")).toEqual([]);
  });

  it("persists wrong-call feedback for the planner, while undo retracts that note", async () => {
    const f = fixture([card("wrong")]);
    await f.checkin();
    await f.send({ type: "dismiss_move", moveId: "wrong", why: "wrong" });
    const book = () => f.data.get("deckBook") as { notes: { text: string }[] };
    expect(book().notes).toHaveLength(1);
    expect(book().notes[0].text).toContain("Review wrong");
    expect(book().notes[0].text).toContain("wrong call");
    const restarted = f.reload();
    await f.checkin(restarted);
    expect(book().notes).toHaveLength(1);
    await f.send({ type: "undo", actionId: f.undoId() }, restarted);
    expect(book().notes).toEqual([]);
    expect(f.saved().deck?.map(m => m.id)).toEqual(["wrong"]);
  });

  it("refuses an expired undo and a stale undo behind a newer decision", async () => {
    const originalNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      const f = fixture([card("expired")]);
      await f.checkin();
      await f.send({ type: "dismiss_move", moveId: "expired", why: "once" });
      const actionId = f.undoId();
      now += 300_001;
      await f.send({ type: "undo", actionId });
      expect(f.saved().deck).toEqual([]);
      const book = f.data.get("deckBook") as { undos: { id: string; key: string; expiresAt: number }[] };
      book.undos[0].expiresAt = now + 300_000;
      book.undos.push({ ...book.undos[0], id: "newer" });
      f.data.set("deckBook", structuredClone(book));
      const restarted = f.reload();
      await f.checkin(restarted);
      await f.send({ type: "undo", actionId }, restarted);
      expect(f.saved().deck).toEqual([]);
    } finally { Date.now = originalNow; }
  });

  it("routes an actual non-top card and rejects stale ids without executing another card", async () => {
    const f = fixture([card("top"), card("second", { kind: "build" })]);
    await f.checkin();
    expect(f.saved().move?.id).toBe("top");
    const before = f.events.length;
    await f.send({ type: "choose_move", moveId: "forged", optionId: "review" });
    expect(f.events).toHaveLength(before);
    await f.send({ type: "choose_move", moveId: "second", optionId: "review" });
    expect(f.events.slice(before).some(e => e.type === "log" && e.text.includes("waiting for its next input"))).toBe(true);
    expect(f.saved().deck?.map(m => m.id)).toContain("second");
    expect(f.saved().move?.id).toBe("top");
  });

  it("a locked card cannot merge through a details option and a right swipe only schedules proof", async () => {
    const head = "a".repeat(40);
    const launch = card("launch", { stage: "pad", kind: "ship", itemId: "pr", options: [{ id: "launch", label: "Launch", recommended: true, actions: [{ tool: "request_merge", args: { pr: 99 }, reason: "Claimed green" }] }] });
    const f = fixture([launch], { items: [{ id: "pr", kind: "bug", source: "github_issue", title: "Fix", district: "/", state: "on_pad", machineId: "gate-1", prNumber: 99, attempts: 1, updatedAt: 1, inspection: { headSha: head, state: "passed", humanApproved: false, stages: [{ gate: "ci", state: "passed", reason: "green" }, { gate: "verify", state: "pending", reason: "Not run" }, { gate: "ai", state: "passed", reason: "green" }] } }] });
    let requests = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { requests++; throw new Error("A locked card must never reach GitHub"); }) as unknown as typeof fetch;
    try {
      await f.checkin();
      expect(f.saved().deck?.find(m => m.id === "launch")?.locked).toBe(true);
      await f.send({ type: "choose_move", moveId: "launch", optionId: "launch" });
      await f.send({ type: "choose_move", moveId: "launch", optionId: "run-missing-check" });
      expect(requests).toBe(0);
      expect(f.saved().items[0].state).toBe("on_pad");
      expect(f.saved().science.red).toBe(0);
      expect(f.events.some(e => e.type === "log" && e.text.includes("missing checks before launching"))).toBe(true);
    } finally { globalThis.fetch = originalFetch; }
  });
});

describe("runner approval survives concurrent deck selection changes", () => {
  it("replayed Approve commits one approval and one teaching event across reconnect", async () => {
    const { issueRevision } = await import("../src/runner-job");
    const item = { id: "gh-58", kind: "bug" as const, source: "github_issue" as const, title: "Fix the guard", body: "Scoped", district: "/", state: "queued" as const, attempts: 0, updatedAt: 1 };
    const move = card("approval-once", { kind: "build", stage: "build", itemId: item.id, options: [{ id: "approve", label: "Approve", recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId: "job-once" }, reason: "Approve this plan" }] }] });
    const f = fixture([move], { items: [item] });
    f.data.set("runnerJob:job-once", { id: "job-once", itemId: item.id, repo: "r3dbars/demo", status: "awaiting_approval", harness: "codex", allowedPaths: ["server/src/engine.ts"], branch: "shiptorio/runner-once", approvalMoveId: move.id, inputRevision: await issueRevision(item.title, JSON.stringify({ body: item.body, failure: "", scars: [] })) });
    await f.checkin();
    await Promise.all([f.send({ type: "choose_move", moveId: move.id, optionId: "approve" }), f.send({ type: "choose_move", moveId: move.id, optionId: "approve" })]);
    const stored = structuredClone(f.data.get("runnerJob:job-once"));
    expect(stored).toMatchObject({ status: "ready", approvedAt: expect.any(Number) });
    expect(f.data.get("approvalEvents")).toHaveLength(1);
    const reloaded = f.reload(); await f.checkin(reloaded);
    await f.send({ type: "choose_move", moveId: move.id, optionId: "approve" }, reloaded);
    expect(f.data.get("runnerJob:job-once")).toEqual(stored);
    expect(f.data.get("approvalEvents")).toHaveLength(1);
  });
  for (const boundary of ["before-handler", "real-refresh", "inside-lock", "revised-item", "rebound-job"] as const) it(`binds the selected plan at ${boundary} and preserves unrelated cards`, async () => {
    const { issueRevision } = await import("../src/runner-job");
    const item = { id: "gh-58", kind: "bug" as const, source: "github_issue" as const, title: "Fix the guard", body: "A scoped fix", district: "/", state: "queued" as const, attempts: 0, updatedAt: 1 };
    const blocker = { ...item, id: "gh-59", title: "An older urgent queue item", value: 100 };
    const other = card("unrelated", { kind: "unblock", stage: "intake", itemId: blocker.id });
    const approval = card("approval-58", { kind: "build", stage: "build", itemId: item.id, options: [{ id: "approve", label: "Approve plan", recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId: "job-58" }, reason: "Player approves the scoped plan" }] }] });
    const f = fixture([other, approval], { items: [item, blocker] });
    f.data.set("runnerJob:job-58", { id: "job-58", repo: "r3dbars/demo", itemId: item.id, harness: "codex", allowedPaths: ["server/src/engine.ts"], branch: "shiptorio/runner-test", status: "awaiting_approval", approvalMoveId: approval.id,
      inputRevision: await issueRevision(item.title, JSON.stringify({ body: item.body, failure: "", scars: [] })) });
    await f.factory.debugSnapshot();
    const internal = f.factory as unknown as { state: FactoryState; runnerJobs: typeof f.factory.runnerJobs; refreshDecisions(): Promise<void>; ctx: { blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> } };
    if (boundary === "before-handler" || boundary === "real-refresh") {
      const original = internal.runnerJobs.bind(f.factory); let changed = false;
      internal.runnerJobs = async () => {
        const jobs = await original();
        if (!changed) {
          changed = true;
          if (boundary === "real-refresh") { await internal.refreshDecisions(); expect(internal.state.move?.id).not.toBe(approval.id); }
          else internal.state.move = other;
        }
        return jobs;
      };
    } else {
      const original = internal.ctx.blockConcurrencyWhile.bind(internal.ctx);
      internal.ctx.blockConcurrencyWhile = fn => original(async () => {
        internal.state.move = other;
        if (boundary === "revised-item") internal.state.items = internal.state.items.map(current => current.id === item.id ? { ...current, title: "Changed since the player saw the plan" } : current);
        if (boundary === "rebound-job") f.data.set("runnerJob:job-58", { ...(f.data.get("runnerJob:job-58") as object), approvalMoveId: "a-different-plan" });
        return fn();
      });
    }
    await f.send({ type: "choose_move", moveId: approval.id, optionId: "approve" });
    if (boundary === "revised-item") {
      expect(f.data.get("runnerJob:job-58")).toMatchObject({ status: "failed", error: "Issue changed; request a fresh plan." });
      expect(f.data.get("runnerJob:job-58")).not.toHaveProperty("approvedAt");
    } else if (boundary === "rebound-job") {
      expect(f.data.get("runnerJob:job-58")).toMatchObject({ status: "awaiting_approval", approvalMoveId: "a-different-plan" });
      expect(f.data.get("runnerJob:job-58")).not.toHaveProperty("approvedAt");
      return;
    } else expect(f.data.get("runnerJob:job-58")).toMatchObject({ status: "ready", approvedAt: expect.any(Number), allowedPaths: ["server/src/engine.ts"] });
    expect((f.data.get("openMoves") as Move[]).some(m => m.id === other.id)).toBe(true);
    expect((f.data.get("openMoves") as Move[]).some(m => m.id === approval.id)).toBe(false);
  });
});

describe("real runner proposals survive a deck full of passive source alerts", () => {
  for (const status of ["none", "failed", "awaiting_approval"] as const) it(`keeps the ${status} job path reachable without changing its state`, async () => {
    const now = Date.now();
    const item = { id: "gh-58", kind: "bug" as const, source: "github_issue" as const, title: "Fix the real regression", district: "/", state: "queued" as const, attempts: 0, updatedAt: now };
    const alerts = Array.from({ length: 12 }, (_, n) => card(`source-alert-${n}`, { kind: "unblock", stage: "intake", createdAt: now - 4 * 60 * 60_000, options: [{ id: "later", label: "Look later", recommended: true, actions: [] }] }));
    const f = fixture(alerts, { items: [item] });
    f.data.set("runnerPresence", { harnesses: ["codex"], seenAt: now });
    const job = { id: "job-58", itemId: item.id, repo: "r3dbars/demo", status, harness: "codex", allowedPaths: ["server/src/engine.ts"], branch: "shiptorio/runner-job-58", baseSha: "a".repeat(40), plan: "Fix the scoped regression and prove it", approvalMoveId: "approval-58" };
    if (status !== "none") f.data.set("runnerJob:job-58", structuredClone(job));
    await (f.factory as unknown as { offerRunnerPlan(): Promise<void> }).offerRunnerPlan();
    const tool = status === "awaiting_approval" ? "approve_runner_job" : "plan_runner_job";
    expect(f.saved().deck).toHaveLength(12);
    expect(f.saved().deck?.some(move => move.itemId === item.id && move.options.some(option => option.actions.some(action => action.tool === tool)))).toBe(true);
    if (status !== "none") expect(f.data.get("runnerJob:job-58")).toEqual(job);
    else expect(await f.factory.runnerJobs()).toEqual([]);
  });
});

describe("the factory learns what the player approves (docs/LEARN.md)", () => {
  type Job = Record<string, unknown>;
  /** Three plan approvals in /web, each Continued by the player, so "Approving plans in /web" is learned. */
  async function taught() {
    const { issueRevision } = await import("../src/runner-job");
    const items = [1, 2, 3, 4].map(n => ({ id: `gh-${n}`, kind: "bug" as const, source: "github_issue" as const, title: `Fix bug ${n}`, body: "A scoped fix", district: "web", state: "queued" as const, attempts: 0, updatedAt: 1 }));
    const approval = (n: number) => card(`approval-${n}`, { title: `Plan for bug ${n}`, kind: "build", stage: "build", itemId: `gh-${n}`, options: [{ id: "approve", label: "Approve plan", recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId: `job-${n}` }, reason: "Player approves the scoped plan" }] }] });
    const f = fixture([1, 2, 3].map(approval), { items });
    const job = async (n: number, extra: Job = {}) => f.data.set(`runnerJob:job-${n}`, { id: `job-${n}`, repo: "r3dbars/demo", itemId: `gh-${n}`, harness: "codex", allowedPaths: ["web/src/a.ts"], branch: `shiptorio/runner-${n}`, status: "awaiting_approval", approvalMoveId: `approval-${n}`,
      inputRevision: await issueRevision(`Fix bug ${n}`, JSON.stringify({ body: "A scoped fix", failure: "", scars: [] })), ...extra });
    for (const n of [1, 2, 3]) await job(n);
    await f.checkin();
    const meter = (id: string) => f.saved().deck?.find(m => m.id === id)?.learn;
    const internal = f.factory as unknown as { openMoves: Move[] | null; state: FactoryState; env: { CACHE: unknown }; runLearned(): Promise<void>; broadcastQueue: Promise<void> };
    /** A fourth plan arrives, then one tick of learned work runs. */
    const fourth = async (extra: Job = {}, item: Record<string, unknown> = {}) => {
      await job(4, extra);
      if (Object.keys(item).length) internal.state.items = internal.state.items.map(i => i.id === "gh-4" ? { ...i, ...item } : i);
      f.data.set("openMoves", [...(f.data.get("openMoves") as Move[]), approval(4)]);
      internal.openMoves = null;
      await internal.runLearned();
      await internal.broadcastQueue;
      return f.data.get("runnerJob:job-4") as Job;
    };
    const flags = (values: Record<string, string>) => { internal.env.CACHE = { ...membershipCache, get: async (key: string) => values[key] ?? membershipCache.get(key) }; };
    expect(meter("approval-1")).toBeUndefined(); // no dots before the first yes
    await f.send({ type: "choose_move", moveId: "approval-1", optionId: "approve" });
    expect(meter("approval-2")).toEqual({ have: 1, need: 3 });
    await f.send({ type: "choose_move", moveId: "approval-2", optionId: "approve" });
    expect(meter("approval-3")).toEqual({ have: 2, need: 3 });
    await f.send({ type: "choose_move", moveId: "approval-3", optionId: "approve" });
    return { f, fourth, flags };
  }

  it("fills the dots on each yes, learns on the third, then approves the next plan on its own, recorded as autonomy", async () => {
    const { f, fourth } = await taught();
    expect(f.saved().learned).toEqual([{ key: "build|district:web|approve_runner_job", label: "Approving plans in /web", since: expect.any(Number) }]);
    expect(f.events.some(e => e.type === "log" && e.text.startsWith("Learned."))).toBe(true);
    // The player's own approvals stay the player's.
    expect(f.data.get("runnerJob:job-1")).toMatchObject({ status: "ready", approvedBy: "player" });
    expect(await fourth()).toMatchObject({ status: "ready", approvedAt: expect.any(Number), approvedBy: "autonomy" });
    // The shared handler's own audit line says autonomy too, not the player.
    const approvals = f.events.filter((e): e is Extract<ServerToWeb, { type: "log" }> => e.type === "log" && e.tool === "approve_runner_job" && e.itemId === "gh-4");
    expect(approvals.length).toBeGreaterThan(0);
    expect(approvals.every(e => e.approvedBy === "autonomy" && e.actor === "spark")).toBe(true);
    expect(await f.taps.prepare("SELECT action FROM card_taps WHERE card_id = 'approval-4'").bind().first()).toEqual({ action: "auto" });

    // Ask me again: the dots come back.
    await f.send({ type: "unlearn", key: "build|district:web|approve_runner_job" });
    expect(f.saved().learned).toEqual([]);
  });

  for (const [name, job, item] of [
    ["a rework plan (job.reworkPr)", { reworkPr: 170 }, {}],
    ["a base refresh (job.refreshBase)", { refreshBase: { expectedHeadSha: "c".repeat(40) } }, {}],
    ["an item that already has a PR", {}, { prNumber: 170 }],
    ["an item with a scar", {}, { scars: [{ station: "ci", reason: "red", at: 1 }] }],
  ] as const) it(`never approves ${name} on its own, even after earlier first-build yeses`, async () => {
    const { fourth } = await taught();
    const stored = await fourth(job, item);
    expect(stored.status).toBe("awaiting_approval");
    expect(stored.approvedAt).toBeUndefined();
  });

  for (const [name, values] of [
    ["the global learn kill switch", { [flagKey("learn")]: "false" }],
    ["the global autonomy kill switch", { [flagKey("autonomy")]: "false" }],
    ["the teacher's own learn opt-out", { [flagKey("learn", "test-player")]: "false" }],
    ["the teacher's own autonomy opt-out", { [flagKey("autonomy", "test-player")]: "false" }],
  ] as const) it(`does nothing on its own under ${name}`, async () => {
    const { fourth, flags } = await taught();
    flags(values);
    expect(await fourth()).toMatchObject({ status: "awaiting_approval" });
  });

  it("a stale plan goes through the real handler's revision check and is never approved", async () => {
    const { f, fourth } = await taught();
    const stored = await fourth({ inputRevision: "stale" });
    expect(stored).toMatchObject({ status: "failed", error: "Issue changed; request a fresh plan." });
    expect(stored.approvedAt).toBeUndefined();
    expect(f.events.some(e => e.type === "log" && e.tool === "approve_runner_job" && e.itemId === "gh-4")).toBe(false);
  });

  it("a dismiss tells the planner to try something different, and empties the dots", async () => {
    const f = fixture([card("idea", { kind: "build" })]);
    await f.checkin();
    await f.send({ type: "dismiss_move", moveId: "idea", why: "once" });
    expect((f.data.get("deckBook") as { notes: { text: string }[] }).notes.at(-1)?.text).toContain("try a smaller or different version");
  });
});

describe("runner decisions remain reachable among durable third-defer escalations", () => {
  for (const status of ["failed", "awaiting_approval"] as const) it(`keeps the ${status} path visible without consuming governance decisions`, async () => {
    const now = Date.now();
    const issue = { id: "gh-58", kind: "bug" as const, source: "github_issue" as const, title: "Fix the queued regression", district: "/", state: "queued" as const, attempts: 0, updatedAt: now };
    const older = Array.from({ length: 12 }, (_, n) => ({ ...issue, id: `sentry-${n}`, source: "sentry" as const, updatedAt: now - 4 * 60 * 60_000, value: 100 }));
    const alerts = older.map(item => card(`governance-${item.id}`, { itemId: item.id, kind: "unblock", stage: "inspect", createdAt: item.updatedAt }));
    const book = emptyDeckBook();
    for (const move of alerts) { const key = moveKey(move); book.decisions[key] = { key, move, count: 3 }; }
    const originalBook = structuredClone(book);
    const f = fixture(alerts, { items: [issue, ...older] });
    f.data.set("deckBook", book);
    f.data.set("runnerPresence", { harnesses: ["codex"], seenAt: now });
    const job = { id: "job-58", itemId: issue.id, repo: "r3dbars/demo", status, harness: "codex", allowedPaths: ["server/src/engine.ts"], branch: "shiptorio/runner-job-58", baseSha: "a".repeat(40), plan: "Fix the scoped regression and prove it", approvalMoveId: "approval-58" };
    f.data.set("runnerJob:job-58", structuredClone(job));
    const internal = f.factory as unknown as { offerRunnerPlan(): Promise<void>; resolveRunnerMove(move: Move): Promise<void> };
    await internal.offerRunnerPlan();
    const tool = status === "awaiting_approval" ? "approve_runner_job" : "plan_runner_job";
    const proposal = f.saved().deck?.find(move => move.itemId === issue.id && move.options.some(option => option.actions.some(action => action.tool === tool)));
    expect(proposal).toBeDefined();
    expect(f.saved().deck).toHaveLength(12);
    expect(f.saved().deck?.filter(move => move.id.endsWith(":deferred"))).toHaveLength(11);
    expect((f.data.get("openMoves") as Move[]).filter(move => alerts.some(alert => alert.id === move.id))).toHaveLength(12);
    expect(f.data.get("deckBook")).toEqual(originalBook);
    expect(f.data.get("runnerJob:job-58")).toEqual(job);
    await internal.resolveRunnerMove(proposal!);
    expect(f.saved().deck).toHaveLength(12);
    expect(f.saved().deck?.filter(move => move.id.endsWith(":deferred")).every(move => move.title === "Never, or let the factory decide?")).toBe(true);
    expect((f.data.get("openMoves") as Move[]).filter(move => alerts.some(alert => alert.id === move.id))).toHaveLength(12);
    expect(f.data.get("deckBook")).toEqual(originalBook);
    expect(f.data.get("runnerJob:job-58")).toEqual(job);
  });
});
