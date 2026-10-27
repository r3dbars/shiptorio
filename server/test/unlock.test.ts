import { sparkTestEnv } from "./budget-fixture";
import { afterEach, describe, expect, it } from "bun:test";
import { UNLOCK, emptyMemory, eligible, fingerprint, playerCopy, reconcile, rulePick, runUnlock, shouldThink, tapUnlock, thinkUnlock, type Signal, type UnlockCard } from "../src/unlock";

const T = Date.parse("2026-10-27T12:00:00Z");
const sig = (id: string, severity: number, extra: Partial<Signal> = {}): Signal => ({
  id, source: id.split(":")[0], kind: "k", title: `${id} title`, detail: `${id} evidence\nmore`, severity, at: T, action: { label: `Fix ${id}` }, ...extra,
});
const ci = sig("ci:slow", 0.7, { title: "CI takes 14 min a run" });
const sentry = sig("sentry:spike", 0.5);
const usage = sig("posthog:flat", 0.4);

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
function spark(script: unknown[]) {
  const sent: string[] = [];
  globalThis.fetch = (async (_: unknown, init: RequestInit) => {
    sent.push((JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] }).messages.find(m => m.role === "user")!.content);
    return Response.json({ choices: [{ message: { content: JSON.stringify(script[sent.length - 1]) } }] });
  }) as unknown as typeof fetch;
  return sent;
}
const modelCard = (signalId: string): UnlockCard => ({ signalId, title: "t", why: "w", action: { label: "Go" }, by: "model", reason: "r", at: T });

describe("throttle", () => {
  it("fingerprint ignores small severity wiggles and noise under the floor", () => {
    expect(fingerprint([sig("a", 0.51)])).toBe(fingerprint([sig("a", 0.55)]));
    expect(fingerprint([sig("a", 0.5)])).not.toBe(fingerprint([sig("a", 0.8)]));
    expect(fingerprint([sig("a", 0.5), sig("b", 0.1)])).toBe(fingerprint([sig("a", 0.5)]));
  });

  it("thinks on a first card, a changed picture and a heartbeat, never in a burst", () => {
    const m = emptyMemory();
    expect(shouldThink(m, [ci], T, null).think).toBe(true);
    const after = { ...m, current: modelCard(ci.id), lastThinkAt: T, fingerprint: fingerprint([ci]), thinks: { day: "2026-10-27", count: 1 } };
    expect(shouldThink(after, [ci], T + 60_000, null)).toEqual({ think: false, why: "Thought a moment ago." });
    expect(shouldThink(after, [ci, sentry], T + 60_000, null).think).toBe(false);
    expect(shouldThink(after, [ci, sentry], T + UNLOCK.minGapMs, null)).toEqual({ think: true, why: "The picture changed." });
    expect(shouldThink(after, [ci], T + UNLOCK.minGapMs, null).think).toBe(false);
    expect(shouldThink(after, [ci], T + UNLOCK.heartbeatMs, null).think).toBe(true);
  });

  it("stays inside the day's caps and leaves budget for planning and review", () => {
    const m = { ...emptyMemory(), thinks: { day: "2026-10-27", count: UNLOCK.dailyThinks } };
    expect(shouldThink(m, [ci], T, null).think).toBe(false);
    expect(shouldThink({ ...m, thinks: { day: "2026-10-26", count: 99 } }, [ci], T, null).think).toBe(true);
    expect(shouldThink(emptyMemory(), [ci], T, { used: 240, limit: 400 }).think).toBe(false);
    expect(shouldThink(emptyMemory(), [ci], T, { used: 100, limit: 400 }).think).toBe(true);
  });

  it("backs off after model failures", () => {
    const m = { ...emptyMemory(), lastThinkAt: T, fails: 3 };
    expect(shouldThink(m, [ci], T + UNLOCK.minGapMs * 4, null).think).toBe(false);
    expect(shouldThink(m, [ci], T + UNLOCK.minGapMs * 8, null).think).toBe(true);
  });
});

describe("memory", () => {
  it("Later puts a signal off for a day unless it gets clearly worse", () => {
    const m = tapUnlock({ ...emptyMemory(), current: modelCard(ci.id) }, ci.id, "later", ci.severity, T);
    expect(m.current).toBeUndefined();
    expect(eligible([ci, sentry], m, T + 3_600_000).map(s => s.id)).toEqual([sentry.id]);
    expect(eligible([{ ...ci, severity: 0.95 }], m, T + 3_600_000).map(s => s.id)).toEqual([ci.id]);
    expect(eligible([ci], m, T + UNLOCK.snoozeMs + 1).map(s => s.id)).toEqual([ci.id]);
  });

  it("yes gives the action time to work before the same signal comes back", () => {
    const m = tapUnlock(emptyMemory(), ci.id, "yes", ci.severity, T);
    expect(eligible([ci], m, T + 3_600_000)).toEqual([]);
    expect(eligible([ci], m, T + UNLOCK.actedMs + 1)).toHaveLength(1);
  });

  it("notices when the current bottleneck clears", () => {
    const m = { ...emptyMemory(), current: modelCard(ci.id), shownAt: T };
    expect(reconcile(m, [ci], T + 1000).cleared).toBeUndefined();
    const gone = reconcile(m, [sentry], T + 20 * 60_000);
    expect(gone.cleared).toMatchObject({ signalId: ci.id, heldMs: 20 * 60_000 });
    expect(gone.memory.current).toBeUndefined();
    expect(gone.memory.cleared[0].signalId).toBe(ci.id);
    expect(reconcile(m, [{ ...ci, severity: 0.1 }], T).cleared?.signalId).toBe(ci.id);
  });
});

describe("rule fallback", () => {
  it("picks the worst open signal and keeps the current card on a tie", () => {
    expect(rulePick([usage, ci, sentry], emptyMemory(), T)).toMatchObject({ signalId: ci.id, by: "rule", title: "CI takes 14 min a run", why: "ci:slow evidence" });
    const tie = sig("support:open", 0.72);
    expect(rulePick([ci, tie], { ...emptyMemory(), current: modelCard(tie.id) }, T)!.signalId).toBe(tie.id);
    expect(rulePick([ci, tie], emptyMemory(), T)!.signalId).toBe(ci.id); // pipeline-side sources win a tie
    expect(rulePick([sig("a", 0.1)], emptyMemory(), T)).toBeNull();
  });
});

describe("the model pick", () => {
  it("reads deeper, then picks one open signal in plain player words", async () => {
    const sent = spark([
      { tool: "read_signal", reason: "Check how bad CI really is.", signalId: ci.id },
      { tool: "pick", reason: "Every PR waits on CI, so it blocks the most.", signalId: ci.id, title: "Spark says CI takes 14 min a run", why: "Every change waits 14 minutes before anyone can look at it.", label: "Speed up CI" },
    ]);
    const steps: string[] = [];
    const card = await thinkUnlock(sparkTestEnv(), { signals: [ci, sentry], playerFeedback: "", history: { snoozed: [], acted: [], cleared: [] } }, { signals: id => `full evidence for ${id}` }, async s => { steps.push(s.tool); });
    expect(card).toMatchObject({ signalId: ci.id, by: "model", action: { label: "Speed up CI" } });
    expect(card.title).not.toMatch(/spark/i);
    expect(steps).toEqual(["read_signal", "pick"]);
    expect(sent[1]).toContain("full evidence for ci:slow");
  });

  it("refuses a pick outside the open signals", async () => {
    spark([{ tool: "pick", reason: "x", signalId: "made:up", title: "t", why: "w", label: "Go" }]);
    await expect(thinkUnlock(sparkTestEnv(), { signals: [ci], playerFeedback: "", history: { snoozed: [], acted: [], cleared: [] } })).rejects.toThrow("isn't open");
  });

  it("must pick within its turns", async () => {
    spark(Array.from({ length: UNLOCK.turns }, () => ({ tool: "read_factory", reason: "look" })));
    await expect(thinkUnlock(sparkTestEnv(), { signals: [ci], playerFeedback: "", history: { snoozed: [], acted: [], cleared: [] } }, { factory: () => "{}" })).rejects.toThrow("without picking");
  });

  it("player copy never says Spark", () => {
    expect(playerCopy("Muse Spark thinks CI is slow", 60)).toBe("the factory thinks CI is slow");
  });
});

describe("one run of the loop", () => {
  const base = { goal: "100 users", playerFeedback: "", budget: null };

  it("thinks, then holds the card until the picture changes", async () => {
    let calls = 0;
    const think = async () => { calls++; return modelCard(sentry.id); };
    const first = await runUnlock({ ...base, signals: [ci, sentry], memory: emptyMemory(), now: T, think });
    expect(first).toMatchObject({ thought: true, card: { signalId: sentry.id, by: "model" } });
    const again = await runUnlock({ ...base, signals: [ci, sentry], memory: first.memory, now: T + UNLOCK.minGapMs * 2, think });
    expect(again).toMatchObject({ thought: false, card: { signalId: sentry.id } });
    expect(calls).toBe(1);
    const changed = await runUnlock({ ...base, signals: [ci, sentry, usage], memory: again.memory, now: T + UNLOCK.minGapMs * 3, think });
    expect(changed.thought).toBe(true);
    expect(calls).toBe(2);
  });

  it("falls back to the rule when the model fails or isn't configured", async () => {
    const failed = await runUnlock({ ...base, signals: [ci, sentry], memory: emptyMemory(), now: T, think: async () => { throw new Error("Meta API down"); } });
    expect(failed).toMatchObject({ thought: true, fellBack: "Meta API down", card: { signalId: ci.id, by: "rule" } });
    expect(failed.memory.fails).toBe(1);
    const none = await runUnlock({ ...base, signals: [ci], memory: emptyMemory(), now: T });
    expect(none).toMatchObject({ thought: false, fellBack: "No model configured.", card: { signalId: ci.id } });
  });

  it("after Later, the next run picks something else; after a clear it reports the win", async () => {
    const think = async (b: { signals: Signal[] }) => modelCard(b.signals[0].id);
    const first = await runUnlock({ ...base, signals: [ci, sentry], memory: emptyMemory(), now: T, think });
    expect(first.card!.signalId).toBe(ci.id);
    const snoozed = tapUnlock(first.memory, ci.id, "later", ci.severity, T + 1000);
    const second = await runUnlock({ ...base, signals: [ci, sentry], memory: snoozed, now: T + UNLOCK.minGapMs, think });
    expect(second.card!.signalId).toBe(sentry.id);
    const third = await runUnlock({ ...base, signals: [ci], memory: second.memory, now: T + UNLOCK.minGapMs * 2, think });
    expect(third.cleared?.signalId).toBe(sentry.id);
    expect(third.card).toBeNull(); // ci is still snoozed and nothing else is open
  });
});
