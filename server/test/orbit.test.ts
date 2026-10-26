import { authorizedDB, membershipCache } from "./browser-fixture";
import { authorizedSocket, browserEnv } from "./browser-fixture";
import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, liveStations, setStage } from "../src/gauntlet";
import { DEPLOY_GRACE_MS, expired, isWatching, orbitStation, regress, revertedPr, SPIKE, startWatch, WATCH_MS, watchForRevert, watchForSentry, watchForSha } from "../src/orbit";
import { emptyBook, recordShip, setPermit, type PermitBook } from "../src/permits";
import type { Signal } from "../src/sources";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

const T0 = 1_800_000_000_000;
const launched = (overrides: Partial<Item> = {}): Item => {
  let item: Item = { id: "sentry-4501", kind: "bug", source: "sentry", title: "TypeError: total is undefined", district: "checkout", lane: "checkout", state: "inspecting", attempts: 2, prNumber: 41, prUrl: "https://github.com/r3dbars/demo/pull/41", branch: "shiptorio/sentry-4501", machineId: "ci-1", inspection: freshInspection("a".repeat(40)), updatedAt: 1, ore: { fingerprint: "sentry:4501", count: 40, firstSeen: 1, lastSeen: 1, severity: 2, usersAffected: 112, reporters: [], linked: [], hints: [], rawRefs: ["sentry:event:old"], paying: false }, ...overrides };
  for (const gate of ["ci", "verify", "ai"] as const) item = setStage(item, gate, "passed", "ok");
  return startWatch({ ...item, state: "launched" }, T0, (overrides.id ?? "m").slice(-1).repeat(40));
};
const base = (items: Item[]) => FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });

describe("orbit rules", () => {
  it("watches a launch for 24h, then clears it", () => {
    const item = launched();
    expect(item.orbit).toMatchObject({ state: "watching", since: T0, until: T0 + WATCH_MS, prNumber: 41 });
    expect(isWatching(item, T0 + WATCH_MS - 1)).toBe(true);
    expect(expired([item], T0 + WATCH_MS - 1)).toEqual([]);
    const [clear] = expired([item], T0 + WATCH_MS);
    expect(clear.orbit).toMatchObject({ state: "clear", at: T0 + WATCH_MS });
    expect(isWatching(clear, T0 + 1)).toBe(false);
  });
  it("a comeback scars the item and sends it back for a fresh PR", () => {
    const back = regress(launched(), "sentry", 'Sentry fired "TypeError" again', "https://sentry.io/x", T0 + 3 * 3600_000);
    expect(back).toMatchObject({ state: "rejected", machineId: "orbit-1", attempts: 0, prNumber: undefined, branch: undefined, inspection: undefined });
    expect(back.scars?.at(-1)).toMatchObject({ station: "orbit", strike: 1, evidenceUrl: "https://sentry.io/x" });
    expect(back.failure).toBe('Sentry fired "TypeError" again 3h after #41 launched');
    expect(back.orbit).toMatchObject({ state: "regressed", signal: "sentry", prNumber: 41 });
  });
  it("finds the PR a GitHub revert undoes", () => {
    expect(revertedPr({ title: 'Revert "Fix total (#41)"', body: "Reverts r3dbars/demo#41" }, "r3dbars/demo")).toBe(41);
    expect(revertedPr({ title: "Revert the cart change", body: "Reverts #41" }, "r3dbars/demo")).toBe(41);
    expect(revertedPr({ title: 'Revert "x"', body: "Reverts someone/else#41" }, "r3dbars/demo")).toBeNull();
    expect(revertedPr({ title: "Fix total", body: "Reverts r3dbars/demo#41" }, "r3dbars/demo")).toBeNull();
    expect(watchForRevert([launched()], 41, T0 + 1)?.id).toBe("sentry-4501");
    expect(watchForRevert([launched()], 41, T0 + WATCH_MS)).toBeUndefined();
  });
  it("matches a failed check to the launch's merge commit", () => {
    expect(watchForSha([launched()], "m".repeat(40), T0 + 1)?.id).toBe("sentry-4501");
    expect(watchForSha([launched()], "b".repeat(40), T0 + 1)).toBeUndefined();
  });
  it("Sentry: the same error after the deploy trips it; before the deploy, or one stray new error, doesn't", () => {
    const item = launched();
    const later = T0 + DEPLOY_GRACE_MS + 1;
    expect(watchForSentry([item], item, true, later, later)?.id).toBe(item.id);
    expect(watchForSentry([item], item, true, T0 + 60_000, later)).toBeUndefined();
    const fresh = (count: number): Item => ({ id: "sentry-9", kind: "bug", source: "sentry", title: "RangeError", district: "checkout", state: "ore", attempts: 0, updatedAt: later, ore: { fingerprint: "sentry:9", count, firstSeen: later, lastSeen: later, severity: 2, usersAffected: 3, reporters: [], linked: [], hints: [], rawRefs: [], paying: false } });
    expect(watchForSentry([item], fresh(SPIKE - 1), false, later, later)).toBeUndefined();
    expect(watchForSentry([item], fresh(SPIKE), false, later, later)?.id).toBe(item.id);
    expect(watchForSentry([item], { ...fresh(SPIKE), district: "cart" }, false, later, later)).toBeUndefined();
  });
  it("is the fifth station: watching count, catches, last verdict", () => {
    const s = base([launched(), launched({ id: "gh-2", prNumber: 42 })]);
    expect(orbitStation(s, T0 + 1)).toMatchObject({ id: "orbit-1", kind: "orbit", wip: 2, caughtThisWeek: 0 });
    s.items[1] = regress(s.items[1], "revert", "Revert PR #50 undoes it", undefined, T0 + 3600_000);
    const st = liveStations(s, T0 + 3600_000).at(-1)!;
    expect(st).toMatchObject({ id: "orbit-1", wip: 1, caughtThisWeek: 1, passRate: 0 });
    expect(st.lastLog).toEqual({ who: "Orbit watch", text: "#42: Revert PR #50 undoes it 1h after #42 launched", ok: false });
  });
});

describe("orbit watch in the Factory", () => {
  const fixture = (items: Item[], book: PermitBook) => {
    const data = new Map<string, unknown>([["state", base(items)], ["meta", { repo: "r3dbars/demo", installationId: 1 }], ["permits", book]]);
    const events: { type: string; district?: string; text?: string }[] = [];
    let alarm: number | null = null;
    const storage = {
      async get(k: string) { return structuredClone(data.get(k)); },
      async put(k: string, v: unknown) { data.set(k, structuredClone(v)); },
      async delete(k: string) { return data.delete(k); },
      async list(o: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([k]) => k.startsWith(o.prefix)).slice(0, o.limit)); },
      async transaction<T>(fn: (tx: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> }) => Promise<T>): Promise<T> { return fn(storage); },
      async getAlarm() { return alarm; },
      async setAlarm(v: number) { alarm = v; },
    };
    const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(), getWebSockets: () => [authorizedSocket((raw: string) => events.push(JSON.parse(raw)))] };
    const f = new Factory(ctx as never, { ...browserEnv, CACHE: membershipCache, DB: { prepare: () => ({ bind: () => ({ first: async () => ({ installation_id: 1, id: 1 }), all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } } as never);
    return { f, data, events, saved: () => data.get("state") as FactoryState, book: () => data.get("permits") as PermitBook };
  };
  const permitted = () => {
    let book = emptyBook();
    for (let i = 0; i < 10; i++) book = recordShip(book, { ...launched(), state: "on_pad" }, false);
    return setPermit(book, "checkout", true);
  };

  it("a Sentry comeback revokes the lane's permit and puts the fix back on the rework belt", async () => {
    const now = Date.now();
    const item = { ...launched(), orbit: { ...launched().orbit!, since: now - 3600_000, until: now + WATCH_MS } };
    const x = fixture([item], permitted());
    const signal: Signal = { source: "sentry", externalId: "4501", fingerprint: "sentry:4501", title: "TypeError: total is undefined", body: "", url: "https://sentry.io/issues/4501", usersAffected: 1, occurredAt: now, rawRef: "sentry:event:new", severity: 2, hints: [], action: "upsert" };
    await x.f.ingestSignal(signal);
    await (x.f as unknown as { broadcastQueue: Promise<void> }).broadcastQueue;
    const back = x.saved().items[0];
    expect(back.state).toBe("rejected");
    expect(back.scars?.at(-1)?.station).toBe("orbit");
    expect(back.orbit?.state).toBe("regressed");
    expect(x.book().lanes.checkout).toMatchObject({ permit: false, streak: 0 });
    expect(x.saved().metrics?.escapedDefects).toBe(1);
    expect(x.saved().stations?.at(-1)?.lastLog?.ok).toBe(false);
    expect(x.events.some((e) => e.type === "autonomy_unlocked" && e.district === "checkout" && /came back in orbit/.test(e.text ?? ""))).toBe(true);
  });

  it("a revert PR and a red check on the merge commit both trip it", async () => {
    const now = Date.now();
    const watching = (o: Partial<Item>) => { const i = launched(o); return { ...i, orbit: { ...i.orbit!, since: now - 60_000, until: now + WATCH_MS } }; };
    const x = fixture([watching({}), watching({ id: "gh-2", prNumber: 42, lane: "docs", district: "docs", ore: undefined })], permitted());
    await x.f.enqueueGitHub("d1", "pull_request", { action: "opened", repository: { full_name: "r3dbars/demo" }, installation: { id: 1 }, pull_request: { number: 50, title: 'Revert "Fix total (#41)"', body: "Reverts r3dbars/demo#41", html_url: "https://github.com/r3dbars/demo/pull/50" } });
    await x.f.enqueueGitHub("d2", "check_suite", { action: "completed", repository: { full_name: "r3dbars/demo" }, installation: { id: 1 }, check_suite: { head_sha: "2".repeat(40), conclusion: "failure", pull_requests: [], app: { name: "GitHub Actions" } } });
    await x.f.alarm();
    const [a, b] = x.saved().items;
    expect(a.orbit).toMatchObject({ state: "regressed", signal: "revert" });
    expect(b.orbit).toMatchObject({ state: "regressed", signal: "deploy" });
    expect(b.failure).toMatch(/^"GitHub Actions" failed on main /);
    expect(x.saved().stations?.at(-1)).toMatchObject({ wip: 0, caughtThisWeek: 2 });
  });

  it("a merged PR starts a 24h watch on its merge commit", async () => {
    const pad = { ...launched(), state: "on_pad" as const, orbit: undefined };
    const x = fixture([pad], emptyBook());
    await x.f.onPullClosed(41, true, "f".repeat(40));
    const item = x.saved().items[0];
    expect(item.state).toBe("launched");
    expect(item.orbit).toMatchObject({ state: "watching", mergeSha: "f".repeat(40), prNumber: 41 });
    expect(item.orbit!.until - item.orbit!.since).toBe(WATCH_MS);
    expect(x.saved().stations?.at(-1)?.wip).toBe(1);
  });
});
