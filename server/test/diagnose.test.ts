import { sparkTestEnv } from "./budget-fixture";
import { afterEach, describe, expect, it } from "bun:test";
import { signalId, unlockMove, type BrainSignal, type FactoryState, type SignalSource } from "@shiptorio/shared";
import { BRAIN, emptyMemory, eligible, modelDiagnose, playerCopy, reconcile, ruleDiagnosis, runDiagnose, shouldDiagnose, tapBrain, type ModelDiagnosis } from "../src/diagnose";
import { PLAYBOOK, doneWhen, playsFor, unlockFor } from "../src/unlocks";
import { bind, collect, emptyCache, factoryCollector, type SignalContext } from "../src/signals";

const T = Date.parse("2026-10-27T12:00:00Z");
const sig = (source: SignalSource, kind: string, severity: number, extra: Partial<BrainSignal> = {}): BrainSignal => ({
  id: signalId(source, kind), source, kind, title: `${kind} title`, severity, confidence: 1,
  evidence: [{ label: `${kind} evidence`, url: `https://example.com/${kind}` }], observedAt: T, freshUntil: T + 6 * 3_600_000, ...extra,
});
const ci = sig("ci", "ci_slow", 0.7, { title: "CI takes 14 min, up from 6.", metric: { value: 14, baseline: 6, unit: "min" } });
const sentry = sig("sentry", "errors_piling", 0.5);
const usage = sig("posthog", "usage_flat", 0.45, { metric: { value: 3, baseline: 20, unit: "users" } });

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
const pick = (s: BrainSignal): ModelDiagnosis => {
  const r = ruleDiagnosis([s], emptyMemory(), T)!;
  return { bottleneck: { ...r.bottleneck, by: "spark" }, unlock: r.unlock, reason: "model" };
};
const base = { goal: "100 users", playerFeedback: "", budget: null };

describe("playbook", () => {
  it("covers every known kind and only uses the deck's safe tools", async () => {
    const { SIGNAL_KINDS } = await import("@shiptorio/shared");
    for (const kind of Object.values(SIGNAL_KINDS).flat()) expect(playsFor(kind)[0].play).not.toBe("look_at_it");
    const tools = new Set(PLAYBOOK.flatMap(p => p.action ? [p.action(ci).tool] : []));
    expect([...tools].sort()).toEqual(["ask_goal", "connect_source", "inspect_bottleneck"]);
    expect(new Set(PLAYBOOK.map(p => p.play)).size).toBe(PLAYBOOK.length);
  });

  it("links to the repo or the evidence, and knows when it worked", () => {
    const u = unlockFor(playsFor("ci_slow")[0], ci, ci.id, { repo: "owner/shop" });
    expect(u).toMatchObject({ play: "ci_cache_installs", url: "https://github.com/owner/shop/actions", doneWhen: { signalId: ci.id, below: 6 } });
    expect(unlockFor(playsFor("errors_piling")[0], sentry, sentry.id, {}).url).toBe("https://example.com/errors_piling");
    expect(unlockFor(playsFor("ci_slow")[0], ci, ci.id, { repo: "../evil" }).url).toBe("https://example.com/ci_slow");
    expect(doneWhen(usage)).toEqual({ signalId: usage.id, above: 20 });
    expect(doneWhen(sentry)).toEqual({ signalId: sentry.id });
    expect(playsFor("brand_new_kind")[0].play).toBe("look_at_it");
  });

  it("deals one Continue/Later card", () => {
    const r = ruleDiagnosis([ci], emptyMemory(), T, { repo: "owner/shop" })!;
    const move = unlockMove(r.bottleneck, r.unlock, T);
    expect(move.id).toBe(`unlock:${ci.id}`);
    expect(move.options.map(o => o.id)).toEqual(["continue", "later"]);
  });
});

describe("throttle", () => {
  it("diagnoses on a first card, a changed main signal and every 30 min; never in a burst", () => {
    expect(shouldDiagnose(emptyMemory(), [ci], T, null).run).toBe(true);
    const r = ruleDiagnosis([ci], emptyMemory(), T)!;
    const m = { ...emptyMemory(), current: { ...r, shownAt: T }, lastAt: T, mainKey: `${ci.id}:3`, runs: { day: "2026-10-27", count: 1 } };
    expect(shouldDiagnose(m, [ci], T + 60_000, null).run).toBe(false);
    expect(shouldDiagnose(m, [ci, sentry], T + BRAIN.minGapMs, null).run).toBe(false); // ci still the main signal
    const worse = { ...sentry, severity: 0.95 };
    expect(shouldDiagnose(m, [ci, worse], T + 60_000, null).run).toBe(false);
    expect(shouldDiagnose(m, [ci, worse], T + BRAIN.minGapMs, null)).toEqual({ run: true, why: "The main signal changed." });
    expect(shouldDiagnose(m, [ci], T + BRAIN.everyMs, null).run).toBe(true);
  });

  it("caps at 24 a day and stops at half the model budget", () => {
    expect(shouldDiagnose({ ...emptyMemory(), runs: { day: "2026-10-27", count: 24 } }, [ci], T, null).run).toBe(false);
    expect(shouldDiagnose({ ...emptyMemory(), runs: { day: "2026-10-26", count: 24 } }, [ci], T, null).run).toBe(true);
    expect(shouldDiagnose(emptyMemory(), [ci], T, { used: 200, limit: 400 }).run).toBe(false);
    expect(shouldDiagnose(emptyMemory(), [ci], T, { used: 199, limit: 400 }).run).toBe(true);
  });

  it("backs off after model failures", () => {
    const m = { ...emptyMemory(), lastAt: T, fails: 3 };
    expect(shouldDiagnose(m, [ci], T + BRAIN.minGapMs * 4, null).run).toBe(false);
    expect(shouldDiagnose(m, [ci], T + BRAIN.minGapMs * 8, null).run).toBe(true);
  });

  it("ignores stale and faint signals", () => {
    expect(eligible([{ ...ci, freshUntil: T }], emptyMemory(), T)).toEqual([]);
    expect(eligible([{ ...ci, severity: 0.3, confidence: 0.5 }], emptyMemory(), T)).toEqual([]);
  });
});

describe("memory", () => {
  it("Later parks a bottleneck for a day unless it gets clearly worse", () => {
    const m = tapBrain(emptyMemory(), ci.id, "later", 0.7, T);
    expect(eligible([ci, sentry], m, T + 3_600_000).map(s => s.id)).toEqual([sentry.id]);
    expect(eligible([{ ...ci, severity: 0.95, observedAt: T + 3_600_000 }], m, T + 3_600_000).map(s => s.id)).toEqual([ci.id]);
    expect(eligible([{ ...ci, observedAt: T + BRAIN.laterMs, freshUntil: T + BRAIN.laterMs * 2 }], m, T + BRAIN.laterMs + 1).map(s => s.id)).toEqual([ci.id]);
  });

  it("Continue watches the unlock and counts a win when its signal clears", () => {
    const r = ruleDiagnosis([ci, sentry], emptyMemory(), T)!;
    const m = tapBrain({ ...emptyMemory(), current: { ...r, shownAt: T } }, ci.id, "continue", 0.7, T + 1000);
    expect(m.current).toBeUndefined();
    expect(eligible([ci], m, T + 3_600_000)).toEqual([]);
    expect(reconcile(m, [ci], T + 3_600_000).cleared).toEqual([]);
    const faster = { ...ci, metric: { value: 5, baseline: 6, unit: "min" }, observedAt: T + 7_200_000, freshUntil: T + 9_000_000 };
    const done = reconcile(m, [faster], T + 7_200_000);
    expect(done.cleared).toMatchObject([{ bottleneckId: ci.id, play: "ci_cache_installs" }]);
    expect(done.memory.pending).toEqual({});
    expect(done.memory.cleared[0].bottleneckId).toBe(ci.id);
  });

  it("a current card whose signal went away is a win too", () => {
    const r = ruleDiagnosis([sentry], emptyMemory(), T)!;
    const out = reconcile({ ...emptyMemory(), current: { ...r, shownAt: T } }, [ci], T + 20 * 60_000);
    expect(out.cleared).toMatchObject([{ bottleneckId: sentry.id, heldMs: 20 * 60_000 }]);
    expect(out.memory.current).toBeUndefined();
  });
});

describe("rule fallback", () => {
  it("heaviest signal, its source's default area, its kind's first play", () => {
    const r = ruleDiagnosis([usage, ci, sentry], emptyMemory(), T, { repo: "owner/shop" })!;
    expect(r.bottleneck).toMatchObject({ id: ci.id, area: "speed", by: "rule", signalIds: [ci.id] });
    expect(r.unlock).toMatchObject({ play: "ci_cache_installs", bottleneckId: ci.id });
  });

  it("keeps the current card on a near-tie so the deck doesn't flip", () => {
    const close = sig("feedback", "feedback_unanswered", 0.66);
    const cur = ruleDiagnosis([close], emptyMemory(), T)!;
    expect(ruleDiagnosis([ci, close], { ...emptyMemory(), current: { ...cur, shownAt: T } }, T)!.bottleneck.id).toBe(close.id);
    expect(ruleDiagnosis([ci, close], emptyMemory(), T)!.bottleneck.id).toBe(ci.id);
  });
});

describe("the model diagnose", () => {
  const brief = (signals: BrainSignal[]) => ({ signals, playerFeedback: "", history: { later: [], acted: [], worked: [] }, now: T });

  it("reads deeper, then names one bottleneck and one playbook unlock in player words", async () => {
    const sent = spark([
      { tool: "read_signal", reason: "How bad is CI?", signalId: ci.id },
      { tool: "diagnose", reason: "Every PR waits on CI.", signalIds: [ci.id, sentry.id], area: "speed", title: "CI is slow", why: "Spark sees every PR wait 14 minutes.", play: "ci_cache_installs", card: "Cache installs in CI", because: "CI went from 6 to 14 min.", confidence: 0.8 },
    ]);
    const steps: string[] = [];
    const out = await modelDiagnose(sparkTestEnv(), brief([ci, sentry]), { repo: "owner/shop" }, {}, async s => { steps.push(s.tool); });
    expect("quiet" in out).toBe(false);
    if ("quiet" in out) return;
    expect(out.bottleneck).toMatchObject({ id: ci.id, area: "speed", by: "spark", signalIds: [ci.id, sentry.id], confidence: 0.8 });
    expect(out.bottleneck.why).not.toMatch(/spark/i);
    expect(out.unlock).toMatchObject({ play: "ci_cache_installs", title: "Cache installs in CI", url: "https://github.com/owner/shop/actions", doneWhen: { below: 6 } });
    expect(steps).toEqual(["read_signal", "diagnose"]);
    expect(sent[0]).toContain("ci_cache_installs"); // the playbook is in the brief up front
    expect(sent[1]).toContain("https://example.com/ci_slow"); // read_signal shows the evidence
  });

  it("can stay quiet", async () => {
    spark([{ tool: "quiet", reason: "Small stuff, nothing worth a card." }]);
    expect(await modelDiagnose(sparkTestEnv(), brief([ci]))).toEqual({ quiet: true, reason: "Small stuff, nothing worth a card." });
  });

  it("refuses signals it wasn't given and plays outside the main signal's playbook", async () => {
    spark([{ tool: "diagnose", reason: "x", signalIds: ["made:up:repo"], play: "ci_cache_installs" }]);
    await expect(modelDiagnose(sparkTestEnv(), brief([ci]))).rejects.toThrow("wasn't given");
    spark([{ tool: "diagnose", reason: "x", signalIds: [ci.id], play: "connect_posthog" }]);
    await expect(modelDiagnose(sparkTestEnv(), brief([ci]))).rejects.toThrow("isn't in the playbook");
  });

  it("must decide within its turns", async () => {
    spark(Array.from({ length: BRAIN.turns }, () => ({ tool: "read_factory", reason: "look" })));
    await expect(modelDiagnose(sparkTestEnv(), brief([ci]), {}, { factory: () => "{}" })).rejects.toThrow("without a diagnosis");
  });

  it("player copy never says Spark", () => {
    expect(playerCopy("Muse Spark thinks CI is slow", 60)).toBe("the factory thinks CI is slow");
  });
});

describe("one pass", () => {
  it("thinks once, then holds the card until the main signal changes", async () => {
    let calls = 0;
    const think = async () => { calls++; return pick(sentry); };
    const a = await runDiagnose({ ...base, signals: [ci, sentry], memory: emptyMemory(), now: T, think });
    expect(a).toMatchObject({ decided: true, thought: true, diagnosis: { bottleneck: { id: sentry.id, by: "spark" } } });
    const b = await runDiagnose({ ...base, signals: [ci, sentry], memory: a.memory, now: T + BRAIN.minGapMs * 2, think });
    expect(b).toMatchObject({ decided: false, thought: false, diagnosis: { bottleneck: { id: sentry.id } } });
    const worse = { ...usage, severity: 0.95 };
    const c = await runDiagnose({ ...base, signals: [ci, sentry, worse], memory: b.memory, now: T + BRAIN.minGapMs * 3, think });
    expect(c.thought).toBe(true);
    expect(calls).toBe(2);
  });

  it("falls back to the rule when the model fails or isn't configured", async () => {
    const failed = await runDiagnose({ ...base, signals: [ci, sentry], memory: emptyMemory(), now: T, think: async () => { throw new Error("Meta API down"); } });
    expect(failed).toMatchObject({ thought: true, fellBack: "Meta API down", diagnosis: { bottleneck: { id: ci.id, by: "rule" } } });
    expect(failed.memory.fails).toBe(1);
    const none = await runDiagnose({ ...base, signals: [ci], memory: emptyMemory(), now: T });
    expect(none).toMatchObject({ thought: false, fellBack: "No model configured.", diagnosis: { bottleneck: { id: ci.id } } });
    const broke = await runDiagnose({ ...base, signals: [ci], memory: emptyMemory(), now: T, budget: { used: 300, limit: 400 }, think: async () => { throw new Error("should not be asked"); } });
    expect(broke).toMatchObject({ thought: false, diagnosis: { bottleneck: { by: "rule" } } });
  });

  it("a quiet model holds quiet until the picture changes", async () => {
    let calls = 0;
    const think = async (): Promise<ModelDiagnosis> => { calls++; return { quiet: true, reason: "Fine." }; };
    const a = await runDiagnose({ ...base, signals: [sentry], memory: emptyMemory(), now: T, think });
    expect(a.diagnosis.bottleneck).toBeNull();
    const b = await runDiagnose({ ...base, signals: [sentry], memory: a.memory, now: T + BRAIN.minGapMs * 2, think });
    expect(b.diagnosis.bottleneck).toBeNull();
    expect(calls).toBe(1);
  });

  it("after Later the next pass deals something else; nothing open means no card", async () => {
    const think = async (b: { signals: BrainSignal[] }) => pick(b.signals[0]);
    const a = await runDiagnose({ ...base, signals: [ci, sentry], memory: emptyMemory(), now: T, think });
    expect(a.diagnosis.bottleneck!.id).toBe(ci.id);
    const parked = tapBrain(a.memory, ci.id, "later", 0.7, T + 1000);
    const b = await runDiagnose({ ...base, signals: [ci, sentry], memory: parked, now: T + BRAIN.minGapMs, think });
    expect(b.diagnosis.bottleneck!.id).toBe(sentry.id);
    const c = await runDiagnose({ ...base, signals: [ci], memory: b.memory, now: T + BRAIN.minGapMs * 2, think });
    expect(c.cleared.map(x => x.bottleneckId)).toEqual([sentry.id]);
    expect(c.diagnosis.bottleneck).toBeNull();
  });
});

describe("collectors", () => {
  const state = { items: [], power: [] } as unknown as FactoryState;
  const ctx = (jam: SignalContext["jam"]["bottleneck"]): SignalContext => ({ state, env: {} as SignalContext["env"], storage: { get: async () => undefined }, jam: { bottleneck: jam, stages: [] } });

  it("the factory collector turns the queue jam into a signal", async () => {
    const jam = { stage: "inspect" as const, stationId: "review-1", wip: 3, ageMs: 3 * 3_600_000, throughputPerHour: 0, valueAtRisk: 9, summary: "3 items waiting at AI review. Oldest wait: 3 h." };
    const [s] = await factoryCollector.read(ctx(jam), T);
    expect(s).toMatchObject({ id: "factory:queue_jam:review-1", kind: "queue_jam", source: "factory" });
    expect(s.severity).toBeGreaterThan(0.7);
    const fresh = (await factoryCollector.read(ctx({ ...jam, wip: 1, ageMs: 60_000, valueAtRisk: 1 }), T))[0];
    expect(fresh.severity).toBeLessThan(0.4);
    expect((await factoryCollector.read(ctx({ ...jam, stage: "resources" }), T))[0].kind).toBe("no_agent");
    expect(await factoryCollector.read(ctx(null), T)).toEqual([]);
    expect(await factoryCollector.read(ctx({ ...jam, stage: "pad" }), T)).toEqual([]); // repo:approve_queue covers the launch pile
  });

  it("reads only due collectors, survives a broken one and drops stale signals", async () => {
    let reads = 0;
    const slow = bind({ source: "ci" as const, everyMs: 30 * 60_000, read: async (c: { n: number }, now: number) => { reads++; return [{ ...ci, observedAt: now, freshUntil: now + c.n }]; } }, () => ({ n: 3_600_000 }));
    const broken = { source: "sentry" as const, everyMs: 0, read: async (): Promise<BrainSignal[]> => { throw new Error("Sentry 500"); } };
    const a = await collect(ctx(null), { readAt: {}, signals: [{ ...sentry, freshUntil: T + 60_000 }] }, T, [slow, broken]);
    expect(a.errors).toEqual([{ source: "sentry", error: "Sentry 500" }]);
    expect(a.cache.signals.map(s => s.id).sort()).toEqual([ci.id, sentry.id]); // sentry's old read stands
    const b = await collect(ctx(null), a.cache, T + 2 * 60_000, [slow, broken]);
    expect(reads).toBe(1);
    expect(b.cache.signals.map(s => s.id)).toEqual([ci.id]); // sentry went stale
    await collect(ctx(null), b.cache, T + 31 * 60_000, [slow, broken]);
    expect(reads).toBe(2);
    expect(emptyCache().signals).toEqual([]);
  });
});
