import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection } from "../src/gauntlet";
import { WATCH_MS } from "../src/orbit";
import type { PermitBook } from "../src/permits";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
const head = "a".repeat(40), merge = "b".repeat(40);
const item = (): Item => ({ id: "gh-1", kind: "bug", source: "github_issue", title: "Fix checkout", district: "checkout", lane: "checkout", state: "on_pad", attempts: 1, prNumber: 41, prUrl: "https://github.com/r3dbars/demo/pull/41", branch: "shiptorio/runner-original", inspection: freshInspection(head), updatedAt: 1 });
function fixture(items = [item()]) {
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }], ["runnerJob:original", { id: "original", itemId: "gh-1", repo: state.repo, status: "completed", harness: "codex", allowedPaths: ["checkout/total.ts"], branch: "shiptorio/runner-original", prUrl: "https://github.com/r3dbars/demo/pull/41" }]]);
  let alarm: number | null = null, failAt: string | undefined;
  const storage = {
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(options: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)); },
    async getAlarm() { return alarm; }, async setAlarm(value: number) { alarm = value; },
    async transaction<T>(fn: (tx: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> }) => Promise<T>): Promise<T> {
      const draft = structuredClone(data);
      const result = await fn({ get: async key => structuredClone(draft.get(key)), put: async (key, value) => { if (key === failAt) throw new Error("Injected transaction write failure"); draft.set(key, structuredClone(value)); } });
      data.clear(); for (const [key, value] of draft) data.set(key, value);
      return result;
    },
  };
  let exclusive: Promise<unknown> = Promise.resolve();
  const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [] };
  const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } };
  const reload = () => new Factory(ctx as never, env as never);
  return { data, reload, saved: () => data.get("state") as FactoryState, credits: () => [...data.keys()].filter(k => k.startsWith("launchCredit:")), alarm: () => alarm, consumeAlarm: () => { alarm = null; }, setAlarm: (at: number) => { alarm = at; }, failAt: (key?: string) => { failAt = key; } };
}
async function revert(f: ReturnType<typeof fixture>, factory: InstanceType<typeof Factory>) {
  await factory.enqueueGitHub("revert-delivery", "pull_request", { action: "opened", repository: { full_name: "r3dbars/demo" }, installation: { id: 1 }, pull_request: { number: 50, title: 'Revert "Fix checkout"', body: "Reverts r3dbars/demo#41" } });
  f.consumeAlarm(); await factory.alarm();
}

describe("durable orbit launch accounting", () => {
  it("keeps a regression and its scar across restart/old merge replay, and credits a genuine fresh PR once", async () => {
    const f = fixture(), factory = f.reload();
    await factory.onPullClosed(41, true, merge);
    await revert(f, factory);
    expect(f.saved().items[0]).toMatchObject({ state: "queued", orbit: { state: "regressed", prNumber: 41 }, prNumber: undefined });
    const regression = structuredClone(f.saved());
    const restarted = f.reload();
    // No GitHub credentials exist: entering legacy recovery would also fail this test.
    await restarted.onPullClosed(41, true, merge);
    expect(f.saved()).toEqual(regression);
    expect(f.saved().science.red).toBe(1);
    expect((f.data.get("permits") as PermitBook).launches).toBe(1);
    const next = f.saved();
    next.items[0] = { ...next.items[0], state: "on_pad", prNumber: 52, prUrl: "https://github.com/r3dbars/demo/pull/52", branch: "shiptorio/runner-followup", inspection: freshInspection("c".repeat(40)) };
    f.data.set("state", structuredClone(next));
    await f.reload().onPullClosed(52, true, "d".repeat(40));
    const relaunched = structuredClone(f.saved());
    await f.reload().onPullClosed(41, true, merge);
    await f.reload().onPullClosed(52, true, "d".repeat(40));
    expect(f.saved()).toEqual(relaunched);
    expect(f.saved().science.red).toBe(2);
    expect((f.data.get("permits") as PermitBook).launches).toBe(2);
    expect(f.saved().items[0].scars?.at(-1)?.station).toBe("orbit");
    expect(f.saved().items[0].orbit).toMatchObject({ state: "watching", prNumber: 52 });
    expect(f.credits().sort()).toEqual(["launchCredit:41", "launchCredit:52"]);
  });

  it("backfills pre-ledger watches without recovering over newer work", async () => {
    const f = fixture(), factory = f.reload();
    await factory.onPullClosed(41, true, merge);
    await revert(f, factory);
    f.data.delete("launchCredit:41"); // Factory launched under the old version.
    const before = structuredClone(f.saved());
    await f.reload().onPullClosed(41, true, merge);
    expect(f.saved()).toEqual(before);
    expect(f.credits()).toEqual(["launchCredit:41"]);
    // Even an older PR no longer present in the latest orbit snapshot cannot replace an existing item.
    f.data.delete("launchCredit:41");
    const newer = f.saved(); newer.items[0].orbit = undefined; newer.items[0].prNumber = 52;
    f.data.set("state", structuredClone(newer));
    await f.reload().onPullClosed(41, true, merge);
    expect(f.saved().items[0]).toMatchObject({ prNumber: 52, state: "queued" });
    expect(f.saved().science.red).toBe(1);
  });

  it("rolls back failed launch accounting and safely retries the same receipt after restart", async () => {
    const f = fixture(); f.failAt("launchCredit:41");
    await expect(f.reload().onPullClosed(41, true, merge)).rejects.toThrow("transaction write failure");
    expect(f.saved().science.red).toBe(0);
    expect(f.saved().items[0].state).toBe("on_pad");
    expect(f.data.has("permits")).toBe(false);
    expect(f.credits()).toEqual([]);
    f.failAt();
    await f.reload().onPullClosed(41, true, merge);
    await f.reload().onPullClosed(41, true, merge);
    expect(f.saved().science.red).toBe(1);
    expect((f.data.get("permits") as PermitBook).launches).toBe(1);
  });

  it("awards one credit for concurrent duplicate merge receipts", async () => {
    const f = fixture(), factory = f.reload();
    await Promise.all([factory.onPullClosed(41, true, merge), factory.onPullClosed(41, true, merge)]);
    expect(f.saved().science.red).toBe(1);
    expect((f.data.get("permits") as PermitBook).launches).toBe(1);
    expect(f.credits()).toEqual(["launchCredit:41"]);
  });
});

describe("idle orbit deadlines", () => {
  it("wakes at the actual 24-hour deadline without a browser, runner or source and clears once after restart", async () => {
    const originalNow = Date.now;
    let now = 1_800_000_000_000;
    Date.now = () => now;
    try {
      const f = fixture();
      await f.reload().onPullClosed(41, true, merge);
      const deadline = now + WATCH_MS;
      expect(f.saved().items[0].orbit?.until).toBe(deadline);
      expect(f.alarm()).toBe(deadline);
      now = deadline - 1; f.consumeAlarm(); await f.reload().alarm();
      expect(f.saved().items[0].orbit?.state).toBe("watching");
      expect(f.alarm()).toBe(deadline);
      now = deadline; f.consumeAlarm(); await f.reload().alarm();
      expect(f.saved().items[0].orbit).toMatchObject({ state: "clear", at: deadline });
      expect(f.alarm()).toBeNull();
      const clear = structuredClone(f.saved().items[0]);
      now += 1000; await f.reload().alarm();
      expect(f.saved().items[0]).toEqual(clear);
      expect(f.saved().science.red).toBe(1);
      expect(f.saved().metrics?.usersUnblocked ?? 0).toBe(0);
    } finally { Date.now = originalNow; }
  });

  it("keeps PostHog polling ahead of a watch alarm established during a launch", async () => {
    const originalNow = Date.now;
    const now = 1_800_000_000_000;
    Date.now = () => now;
    try {
      const f = fixture();
      f.data.set("posthogLinked", true);
      f.data.set("posthogPoll", { nextAt: now + 60_000, failures: 0 });
      const factory = f.reload(); await factory.onPullClosed(41, true, merge);
      expect(f.alarm()).toBe(now + WATCH_MS);
      await factory.alarm();
      expect(f.alarm()).toBe(now + 60_000);
      expect(f.saved().items[0].orbit?.state).toBe("watching");
    } finally { Date.now = originalNow; }
  });

  it("preserves an earlier alarm and pulls the watch alarm forward for new work", async () => {
    const originalNow = Date.now;
    const now = 1_800_000_000_000;
    Date.now = () => now;
    try {
      const f = fixture(); f.setAlarm(now + 60_000);
      const factory = f.reload(); await factory.onPullClosed(41, true, merge);
      expect(f.alarm()).toBe(now + 60_000);
      f.consumeAlarm(); await factory.alarm();
      expect(f.alarm()).toBe(now + WATCH_MS);
      await factory.enqueueGitHub("new-work", "unknown", { repository: { full_name: "r3dbars/demo" }, installation: { id: 1 } });
      expect(f.alarm()).toBe(now + 2000);
    } finally { Date.now = originalNow; }
  });
});
