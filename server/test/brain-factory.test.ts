import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv } from "./browser-fixture";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { FactoryState, type Diagnosis, type Item, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import type { BrainMemory } from "../src/diagnose";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

// No collector may reach the network here: GitHub, PostHog and Meta all fail fast, so this is the rule path end to end.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const waiting: Item = { id: "gh-7", source: "github_issue", title: "Checkout button does nothing", kind: "bug", state: "queued", district: "web", updatedAt: Date.now() - 2 * 3_600_000, attempts: 0 } as Item;

/** The real Durable Object with in-memory storage, the "brain" flag on, and no network. */
function fixture(items: Item[]) {
  globalThis.fetch = (async () => { throw new Error("offline in tests"); }) as unknown as typeof fetch;
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0, move: null, deck: [] });
  const data = new Map<string, unknown>([["state", structuredClone(state)], ["meta", { repo: state.repo, installationId: 1 }], ["openMoves", []]]);
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(options: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)); },
    async getAlarm() { return null; }, async setAlarm() {},
  };
  const DB = { prepare(sql: string) {
    if (sql.startsWith("SELECT u.id") || sql.startsWith("SELECT u.login")) return { bind: () => ({ first: async () => ({ id: 1, login: "test-player" }) }) };
    return { bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) }) };
  } };
  const CACHE = { ...membershipCache, get: async (key: string) => key === "flags:v1:global:brain" ? "true" : membershipCache.get(key) };
  const events: ServerToWeb[] = [];
  const socket = authorizedSocket((raw: string) => events.push(JSON.parse(raw)));
  let exclusive: Promise<unknown> = Promise.resolve();
  const ctx = { storage, acceptWebSocket() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket] };
  const factory = new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE, DB: authorizedDB(DB) }) as never) as unknown as {
    load(): Promise<unknown>; refreshDecisions(): Promise<void>; webSocketMessage(ws: unknown, raw: string): Promise<void>;
    brainBusy: boolean; brainKickedAt: number; state: FactoryState;
  };
  /** One tick: refresh the deck, let the brain's pass finish, refresh again so its card is dealt. */
  const tick = async () => {
    await factory.load();
    factory.brainKickedAt = 0;
    await factory.refreshDecisions();
    for (let i = 0; i < 200 && factory.brainBusy; i++) await new Promise(r => setTimeout(r, 5));
    await factory.refreshDecisions();
  };
  const send = (value: unknown) => factory.webSocketMessage(authorizedSocket(), JSON.stringify(value));
  const saved = () => data.get("state") as FactoryState;
  return { factory, tick, send, data, saved, events };
}

describe("the bottleneck brain in the real factory", () => {
  it("collects, diagnoses, deals one card, remembers Continue and counts the win when the jam clears", async () => {
    const f = fixture([waiting]);
    await f.tick();

    // Collected: the factory collector saw work waiting with no agent plugged in.
    const signals = (f.data.get("brainSignals") as { signals: { id: string }[] }).signals.map(s => s.id);
    expect(signals).toContain("factory:no_agent:repo");

    // Diagnosed and dealt: one unlock card in the deck, the map's holdingBack set, the Diagnosis stored.
    const memory = f.data.get("brainMemory") as BrainMemory;
    expect(memory.current?.bottleneck).toMatchObject({ id: "factory:no_agent:repo", area: "ship", by: "rule" });
    expect(memory.current?.unlock.play).toBe("connect_agent");
    const card = f.saved().deck?.find(m => m.id === "unlock:factory:no_agent:repo");
    expect(card?.options.map(o => o.id)).toEqual(["continue", "later"]);
    expect(f.saved().holdingBack).toMatchObject({ id: "factory:no_agent:repo", area: "ship" });
    expect((f.data.get("brainDiagnoses") as Diagnosis[])[0].unlock?.play).toBe("connect_agent");

    // Continue: the slot frees and the unlock is watched.
    await f.send({ type: "choose_move", moveId: card!.id, optionId: "continue" });
    const after = f.data.get("brainMemory") as BrainMemory;
    expect(after.current).toBeUndefined();
    expect(Object.keys(after.pending)).toEqual(["factory:no_agent:repo"]);

    // The jam clears (the work shipped): the next pass counts the win and the brain goes quiet.
    const state = f.data.get("state") as FactoryState;
    state.items = state.items.map(i => ({ ...i, state: "launched" as const }));
    f.data.set("state", state);
    (f.factory as unknown as { state: FactoryState | null }).state = null;
    await f.tick();
    const done = f.data.get("brainMemory") as BrainMemory;
    expect(done.cleared[0]).toMatchObject({ bottleneckId: "factory:no_agent:repo", play: "connect_agent" });
    expect(done.pending).toEqual({});
    expect(f.saved().deck?.some(m => m.id.startsWith("unlock:"))).toBe(false);
    expect(f.saved().holdingBack ?? null).toBeNull();
    expect(f.events.some(e => e.type === "log" && e.text.startsWith("Unblocked:"))).toBe(true);
  });

  it("brain_look re-reads every source and looks again without waiting the half hour", async () => {
    const f = fixture([waiting]);
    await f.tick();
    const first = f.data.get("brainMemory") as BrainMemory;
    const readAt = (f.data.get("brainSignals") as { readAt: Record<string, number> }).readAt.factory;
    await new Promise(r => setTimeout(r, 5));
    await f.tick(); // a normal tick right after: the throttle keeps the card, the factory collector isn't due
    expect((f.data.get("brainMemory") as BrainMemory).lastAt).toBe(first.lastAt);
    await f.send({ type: "brain_look" });
    for (let i = 0; i < 200 && f.factory.brainBusy; i++) await new Promise(r => setTimeout(r, 5));
    const looked = f.data.get("brainMemory") as BrainMemory;
    expect((f.data.get("brainSignals") as { readAt: Record<string, number> }).readAt.factory).toBeGreaterThan(readAt);
    expect(looked.current?.bottleneck.id).toBe("factory:no_agent:repo");
    expect(looked.runs.count).toBe(first.runs.count); // no model here, so the rule answered: no run spent
  });

  it("Later parks the bottleneck instead of dealing it again", async () => {
    const f = fixture([waiting]);
    await f.tick();
    await f.send({ type: "choose_move", moveId: "unlock:factory:no_agent:repo", optionId: "later" });
    const memory = f.data.get("brainMemory") as BrainMemory;
    expect(memory.later["factory:no_agent:repo"]).toBeDefined();
    await f.tick();
    expect(f.saved().deck?.some(m => m.id === "unlock:factory:no_agent:repo")).toBe(false);
  });
});
