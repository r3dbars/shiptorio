import { credentialEnv } from "./credential-fixture";
import { generateKeyPairSync } from "node:crypto";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv } from "./browser-fixture";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { FactoryState, type Diagnosis, type Item, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { emptyMemory, ruleDiagnosis, type BrainMemory } from "../src/diagnose";
import { signalId } from "@shiptorio/shared";

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
function fixture(items: Item[], extraEnv: Record<string, unknown> = {}) {
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
    // GitHub's pacing ledger: every slot free, no cooldown.
    if (sql.includes("INSERT INTO api_limits")) return { bind: () => ({ first: async () => ({ next_at: Date.now() + 1000 }), run: async () => ({ success: true }) }) };
    return { bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) }) };
  } };
  const CACHE = { ...membershipCache, get: async (key: string) => key === "flags:v1:global:brain" ? "true" : membershipCache.get(key) };
  const events: ServerToWeb[] = [];
  const socket = authorizedSocket((raw: string) => events.push(JSON.parse(raw)));
  let exclusive: Promise<unknown> = Promise.resolve();
  const ctx = { storage, acceptWebSocket() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket] };
  const factory = new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE, DB: authorizedDB(DB), ...extraEnv }) as never) as unknown as {
    load(): Promise<unknown>; refreshDecisions(): Promise<void>; webSocketMessage(ws: unknown, raw: string): Promise<void>; onPullClosed(pr: number, merged: boolean, sha?: string): Promise<void>;
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

  it("yes on a red PR files a fix issue and puts it on the line; when the fix merges, the red PR gets it", async () => {
    // A real App key, and GitHub's pacing ledger with every slot free.
    const f = fixture([], {
      GITHUB_APP_ID: "fix-loop-test",
      GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    });
    const calls: string[] = [];
    let filedLabels: unknown;
    const issue = { number: 50, state: "open", title: 'Fix "check" failing on #39', body: "", user: { login: "r3dbars" }, author_association: "OWNER", labels: [], updated_at: "2026-10-30T19:00:00Z", html_url: "https://github.com/r3dbars/demo/issues/50" };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input), method = init?.method ?? "GET";
      calls.push(`${method} ${url.replace("https://api.github.com", "")}`);
      if (url.includes("/access_tokens")) return Response.json({ token: "fixture-installation-token", expires_at: new Date(Date.now() + 3600000).toISOString() });
      if (url.endsWith("/pulls/39") && method === "GET") return Response.json({ state: "open", title: "Shipping note", html_url: "https://github.com/r3dbars/demo/pull/39", head: { sha: "h39", repo: { full_name: "r3dbars/demo" } } });
      if (url.includes("/commits/h39/check-runs")) return Response.json({ check_runs: [{ status: "completed", conclusion: "success" }] });
      if (url.endsWith("/repos/r3dbars/demo/issues") && method === "POST") { filedLabels = JSON.parse(String(init?.body)).labels; return Response.json(issue, { status: 201 }); }
      if (url.endsWith("/issues/50")) return Response.json(issue);
      if (url.includes("/issues/50/comments")) return Response.json([]);
      if (url.endsWith("/pulls/39/update-branch")) return Response.json({ message: "Updating pull request branch." }, { status: 202 });
      return Response.json({ message: "Not Found" }, { status: 404 });
    }) as unknown as typeof fetch;
    const red = { id: signalId("ci", "ci_blocking", "check"), source: "ci" as const, kind: "ci_blocking", scope: "check", title: '"check" is failing on #39, so it can\'t ship.', severity: 0.7, confidence: 1,
      evidence: [{ label: "Failing on #39", url: "https://github.com/r3dbars/demo/actions/runs/1" }], observedAt: Date.now(), freshUntil: Date.now() + 3_600_000 };
    const r = ruleDiagnosis([red], emptyMemory(), Date.now(), { repo: "r3dbars/demo" })!;
    expect(r.unlock.action).toMatchObject({ tool: "fix_failing_pr", args: { pr: 39, workflow: "check" } });
    f.data.set("brainMemory", { ...emptyMemory(), current: { ...r, shownAt: Date.now() }, lastAt: Date.now(), mainKey: "x" });
    f.data.set("brainSignals", { signals: [red], readAt: { ci: Date.now(), repo: Date.now(), factory: Date.now(), sentry: Date.now(), posthog: Date.now(), feedback: Date.now(), goals: Date.now() } });
    await f.factory.load(); await f.factory.refreshDecisions();
    expect(f.saved().deck?.some(m => m.id === `unlock:${red.id}`)).toBe(true);
    await f.send({ type: "choose_move", moveId: `unlock:${red.id}`, optionId: "continue" });
    expect(calls).toContain("POST /repos/r3dbars/demo/issues");
    expect(filedLabels).toEqual(["shiptorio"]); // so the planner trusts an issue the App filed itself
    expect(f.saved().items.some(i => i.id === "gh-50")).toBe(true);
    expect(f.data.get("fixesPr:50")).toEqual({ pr: 39, sameRepo: true });
    // A failed fix build forgets the Continue, so the red-PR card can come back now instead of in 6 hours.
    f.data.set("brainMemory", { ...(f.data.get("brainMemory") as BrainMemory), acted: { [red.id]: Date.now(), "repo:backlog_growing:repo": Date.now() } });
    await (f.factory as unknown as { reopenRedPrCard(id: string): Promise<void> }).reopenRedPrCard("gh-50");
    expect(Object.keys((f.data.get("brainMemory") as BrainMemory).acted)).toEqual(["repo:backlog_growing:repo"]);

    // The fix ships as PR #51: Shippy updates #39 from main so its checks run on the fix, once.
    const state = f.data.get("state") as FactoryState;
    state.items = state.items.map(i => i.id === "gh-50" ? { ...i, state: "on_pad" as const, prNumber: 51 } : i);
    f.data.set("state", state); (f.factory as unknown as { state: FactoryState | null }).state = null;
    await f.factory.onPullClosed(51, true, "abc").catch(() => {});
    await f.factory.onPullClosed(51, true, "abc").catch(() => {});
    expect(calls.filter(c => c === "PUT /repos/r3dbars/demo/pulls/39/update-branch")).toHaveLength(1);

    // #39's checks finish green: Shippy sees it himself and follows up first thing on the deck.
    await f.tick();
    const win = f.saved().deck?.find(m => m.id === "win:fix:39");
    expect(win?.why).toBe("Shippy checked again: #39 passes its checks now, with the fix from #51.");
    expect((f.data.get("fixesPr:50") as { confirmed?: boolean }).confirmed).toBe(true);
  });

  it("after a problem clears, Shippy follows up once with a card that says so", async () => {
    const f = fixture([waiting]);
    await f.tick();
    const state = f.data.get("state") as FactoryState;
    state.items = state.items.map(i => ({ ...i, state: "launched" as const }));
    f.data.set("state", state);
    (f.factory as unknown as { state: FactoryState | null }).state = null;
    await f.tick();
    const win = f.saved().deck?.find(m => m.id.startsWith("win:"));
    expect(win).toMatchObject({ title: "That's fixed", options: [{ label: "Nice" }, { label: "Hide" }] });
    expect(win!.why).toContain("is clear now");
    await f.send({ type: "choose_move", moveId: win!.id, optionId: "continue" });
    await f.tick();
    expect(f.saved().deck?.some(m => m.id.startsWith("win:"))).toBe(false);
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
