import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv, browserCookies } from "./browser-fixture";
import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Move, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";

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
  const DB = { prepare(sql: string) {
    if (sql.startsWith('SELECT u.id') || sql.startsWith('SELECT u.login')) return {bind:()=>({first:async()=>({id:1,login:'test-player'})})};
    if (sql.startsWith('SELECT enabled')) return {bind:()=>({first:async()=>null})};
    return { bind(...args: unknown[]) { return {

    async all() { if (!sql.startsWith("SELECT kind, scope")) throw new Error(`Unexpected query ${sql}`); return { results: [...rules.values()].filter(r => r.repo === args[0]).map(({ kind, scope, actionId }) => ({ kind, scope, actionId })) }; },
    async run() {
      if (sql.startsWith("INSERT INTO move_kind_rules")) { const [repo, kind, scope, actionId] = args as string[]; const key = JSON.stringify([repo, kind, scope]); if (!rules.has(key)) rules.set(key, { repo, kind, scope, actionId }); }
      else if (sql.startsWith("DELETE FROM move_kind_rules")) { const [repo, kind, scope, actionId] = args; const key = JSON.stringify([repo, kind, scope]); if (rules.get(key)?.actionId === actionId) rules.delete(key); }
      else throw new Error(`Unexpected write ${sql}`);
      return { success: true };
    },
  }; } }; } };
  const socket = authorizedSocket((raw: string) => events.push(JSON.parse(raw)));
  let exclusive: Promise<unknown> = Promise.resolve();
  const ctx = { storage, acceptWebSocket() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket] };
  const reload = () => new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE: membershipCache, DB: authorizedDB(DB) }) as never);
  const factory = reload();
  const send = (value: unknown, instance = factory) => instance.webSocketMessage(authorizedSocket(), JSON.stringify(value));
  const checkin = async (instance = factory) => {
    const prior = (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
    (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = class { 0 = {}; 1 = socket; };
    try { const response = await instance.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/demo/factory", { headers: { upgrade: "websocket", origin: "https://shiptorio.com", cookie: await browserCookies() } })); expect(response.status).toBe(101); }
    finally { (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair = prior; }
  };
  const saved = () => data.get("state") as FactoryState;
  const undoId = () => events.filter((e): e is Extract<ServerToWeb, { type: "log" }> => e.type === "log" && !!e.actionId).at(-1)!.actionId!;
  return { factory, reload, send, checkin, data, saved, rules, events, undoId };
}

describe("durable live check-in decisions", () => {
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
