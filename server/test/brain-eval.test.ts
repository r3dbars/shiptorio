import { afterEach, describe, expect, test } from "bun:test";
import { BottleneckArea, BrainSignal, SIGNAL_KINDS } from "@shiptorio/shared";
import { CASES } from "../scripts/brain-eval/cases";
import { evaluate, runCase, sparkThink, stubSpark, summarize, T0 } from "../scripts/brain-eval/harness";
import { emptyMemory, ruleDiagnosis } from "../src/diagnose";

// The eval itself runs live on a Meta key (bun run brain:eval --live). Here: the fixtures are valid contract
// data, the grading is right, and the whole pipe runs end to end against a stubbed model.

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

describe("brain eval fixtures", () => {
  test("every case is a valid, distinct BrainSignal set with a known expected answer", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length);
    for (const c of CASES) {
      const signals = c.signals(T0);
      for (const s of signals) {
        expect(() => BrainSignal.parse(s)).not.toThrow();
        expect(SIGNAL_KINDS[s.source]).toContain(s.kind);
      }
      if (c.expect.area) expect(BottleneckArea.options).toContain(c.expect.area);
      if (c.expect.signal) expect(signals.map(s => s.id)).toContain(c.expect.signal);
      if (c.expect.area) expect(c.unlock).toBeDefined();
    }
  });

  test("covers the situations that matter: quiet, conflicts, goals, injection", () => {
    const ids = CASES.map(c => c.id);
    expect(CASES.filter(c => c.expect.area === null).length).toBeGreaterThanOrEqual(5);
    for (const id of ["red-ci-quiet-sentry", "error-spike", "no-users", "feedback-backlog", "player-bottleneck", "nothing-wrong", "loud-vs-stuck", "goal-customers", "injection-in-feedback"]) expect(ids).toContain(id);
    for (const area of BottleneckArea.options.filter(a => a !== "focus")) expect(CASES.some(c => c.expect.area === area)).toBe(true);
  });
});

describe("brain eval grading", () => {
  test("the rule fallback names the plain cases and stays quiet when nothing's wrong", async () => {
    const r = await evaluate({ mode: "rule", model: "rule" });
    const byId = Object.fromEntries(r.cases.map(c => [c.id, c]));
    expect(byId["red-ci-quiet-sentry"].exact).toBe(true);
    expect(byId["error-spike"].got.signalId).toBe("sentry:error_spike:checkout");
    for (const id of ["nothing-wrong", "small-noise", "player-away-fine"]) { // under the floor: the rule stays quiet too
      expect(byId[id].got.area).toBeNull();
      expect(byId[id].nags).toEqual({ quietCard: false, flip: false, renag: false, heartbeatCard: false });
    }
    // Severity alone can't read these; they're where the model has to earn its keep.
    expect(byId["loud-vs-stuck"].hit).toBe(false);
    expect(byId["goal-customers"].hit).toBe(false);
    // The bar the rule sets today. If it drops, a fixture or the loop changed: look before lowering it.
    expect(r.summary.hitRate).toBeGreaterThanOrEqual(0.8);
    // Just over the model's floor but under the rule's (BRAIN.ruleFloor): the rule stays quiet too.
    expect(byId["ci-creep"].got.area).toBeNull();
    expect(byId["weekend-dip"].got.area).toBeNull();
    expect(r.summary.overNags).toBe(0);
    expect(r.summary.thinks).toBe(0);
  });

  test("a stubbed model runs the real think path and gets metered", async () => {
    const stub = stubSpark(); restore = stub.restore;
    const r = await evaluate({ mode: "stub", model: "stub", think: sparkThink(stub.env), only: ["error-spike", "nothing-wrong", "loud-vs-stuck"] });
    const spike = r.cases.find(c => c.id === "error-spike")!;
    expect(spike.got.by).toBe("spark");
    expect(spike.exact).toBe(true);
    expect(spike.playHit).toBe(true);
    expect(spike.got.play).toBe("chase_error_spike");
    expect(spike.meter.calls).toBeGreaterThanOrEqual(2); // read, then pick
    expect(spike.thinks).toBeGreaterThanOrEqual(1);
    expect(spike.nags.flip).toBe(false); // fifteen quiet minutes later: same card, no new think
    expect(spike.nags.renag).toBe(false); // Later holds
    expect(r.cases.find(c => c.id === "nothing-wrong")!.meter.calls).toBe(0); // quiet costs nothing
    expect(r.summary.usdPerDecision).toBeGreaterThan(0);
    expect(r.summary.fallbacks).toBe(0);
  });

  test("over-nagging is counted: a brain that always raises a card gets caught", async () => {
    const quiet = CASES.find(c => c.id === "nothing-wrong")!;
    // A quiet case with one signal nudged over the floor: a nagging brain raises it, a good one says quiet.
    const tempted = { ...quiet, signals: (now: number) => quiet.signals(now).map(s => s.kind === "ci_slow" ? { ...s, severity: 0.3 } : s) };
    const meter = () => ({ calls: 0, input: 0, output: 0, nanoUsd: 0, unmeasured: 0, ms: 0 });
    const nagger = await runCase(tempted, async brief => ({ ...ruleDiagnosis(brief.signals.map(s => ({ ...s, severity: 1 })), emptyMemory(), brief.now)!, reason: "always something" }), meter());
    expect(nagger.nags.quietCard).toBe(true);
    expect(summarize("x", "x", [nagger]).summary.overNags).toBeGreaterThan(0);
    const calm = await runCase(tempted, async () => ({ quiet: true as const, reason: "CI at 6 minutes is fine." }), meter());
    expect(calm.nags.quietCard).toBe(false);
    expect(calm.hit).toBe(true);
  });
});
