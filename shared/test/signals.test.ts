import { describe, expect, test } from "bun:test";
import { BrainSignal, DEFAULT_AREA, SIGNAL_KINDS, BrainUnlock, freshSignals, isFresh, signalId, signalWeight, unlockDone, unlockMove, type BrainBottleneck } from "../src/signals";
import { Move } from "../src/model";

const T0 = 1_800_000_000_000;
const H = 3_600_000;
const sig = (over: Partial<BrainSignal> = {}): BrainSignal => BrainSignal.parse({
  id: signalId("ci", "ci_slow"), source: "ci", kind: "ci_slow", title: "CI takes 14 min, up from 6.", severity: 0.6,
  metric: { value: 14, baseline: 6, unit: "min" }, evidence: [{ label: "Run 4812", url: "https://github.com/o/r/actions/runs/4812" }],
  observedAt: T0, freshUntil: T0 + 6 * H, ...over,
});

describe("brain signals", () => {
  test("every source has known kinds and a default area", () => {
    for (const source of Object.keys(SIGNAL_KINDS)) expect(DEFAULT_AREA[source as keyof typeof DEFAULT_AREA]).toBeDefined();
  });
  test("freshness fades weight to half, then drops it", () => {
    const s = sig();
    expect(isFresh(s, T0 - 1)).toBe(false);
    expect(signalWeight(s, T0)).toBeCloseTo(0.6);
    expect(signalWeight(s, T0 + 3 * H)).toBeCloseTo(0.45);
    expect(signalWeight(s, T0 + 6 * H)).toBe(0);
  });
  test("freshSignals keeps the newest read per id, heaviest first", () => {
    const old = sig({ severity: 0.9 });
    const newer = sig({ observedAt: T0 + H, freshUntil: T0 + 7 * H, severity: 0.2 });
    const errors = sig({ id: signalId("sentry", "errors_piling"), source: "sentry", kind: "errors_piling", severity: 0.7 });
    const out = freshSignals([old, newer, errors], T0 + H);
    expect(out.map(s => s.id)).toEqual(["sentry:errors_piling:repo", "ci:ci_slow:repo"]);
    expect(out[1].severity).toBe(0.2);
  });
  test("rejects a signal without evidence", () => {
    expect(() => sig({ evidence: [] })).toThrow();
  });
  test("an unlock is done when its signal clears or crosses the line", () => {
    const u = BrainUnlock.parse({ id: "u1", bottleneckId: "ci:ci_slow:repo", play: "ci_cache", kind: "automate", title: "Cache installs in CI", because: "CI went from 6 to 14 min.", effort: "minutes", doneWhen: { signalId: "ci:ci_slow:repo", below: 8 } });
    expect(unlockDone(u, [sig()], T0)).toBe(false);
    expect(unlockDone(u, [sig({ metric: { value: 7, unit: "min" } })], T0)).toBe(true);
    expect(unlockDone(u, [], T0)).toBe(true);
  });
  test("an unlock deals one valid Continue/Later card", () => {
    const b: BrainBottleneck = { id: "ci:ci_slow:repo", area: "speed", title: "CI is slow", why: "Every PR waits 14 min.", signalIds: ["ci:ci_slow:repo"], confidence: 0.8, by: "rule", decidedAt: T0 };
    const u = BrainUnlock.parse({ id: "u1", bottleneckId: b.id, play: "ci_cache", kind: "automate", title: "Cache installs in CI", because: "CI went from 6 to 14 min.", effort: "minutes", action: { tool: "plan_runner_job", args: { itemId: "x" } }, doneWhen: { signalId: b.id, below: 8 } });
    const move = Move.parse(unlockMove(b, u, T0));
    expect(move.options.map(o => o.label)).toEqual(["Continue", "Later"]);
    expect(move.options[0].actions[0].tool).toBe("plan_runner_job");
    expect(move.id).toBe("unlock:ci:ci_slow:repo");
  });
});
