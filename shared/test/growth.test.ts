import { describe, expect, test } from "bun:test";
import {
  fallbackExperiment,
  findFunnelDrop,
  guessFunnel,
  measure,
  stepCounts,
  normalCdf,
  updateExperiment,
  verdict,
  verdictLine,
  type FunnelWindow,
} from "../src/growth";
import type { Experiment, FunnelStep } from "../src/model";

const DAY = 86400000;
const NOW = Date.parse("2026-10-26T12:00:00Z");
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const step: FunnelStep = { from: "/cart", to: "/checkout", label: "/cart → /checkout" };

/** Complete synthetic ordered-funnel query windows, not independent route totals. */
function rows(cart: number, share: number, yesterdayShare = share): FunnelWindow[] {
  const common = { from: step.from, to: step.to, ordered: true as const, unit: "unique_persons" as const, evidence: "simulation" as const, conversionWindowHours: 24 };
  return [
    { ...common, startsOn: dayOf(NOW - 8 * DAY), endsOn: dayOf(NOW - 2 * DAY), entered: cart * 7, converted: Math.round(cart * 7 * share), days: 7 },
    { ...common, startsOn: dayOf(NOW - DAY), endsOn: dayOf(NOW - DAY), entered: cart, converted: Math.round(cart * yesterdayShare), days: 1 },
  ];
}

describe("funnel drops", () => {
  test("a step that loses a third of its conversion is a drop, with real numbers", () => {
    const drop = findFunnelDrop(rows(400, 0.45, 0.3), step, NOW)!;
    expect(drop).not.toBeNull();
    expect(drop.baseRate).toBeCloseTo(0.45, 2);
    expect(drop.rate).toBeCloseTo(0.3, 2);
    expect(drop.dropPct).toBe(33);
    expect(drop.lostPerDay).toBe(60);
    expect(drop.baseline.days).toBe(7);
  });
  test("a small wobble isn't a drop", () => {
    expect(findFunnelDrop(rows(400, 0.45, 0.4), step, NOW)).toBeNull();
  });
  test("too little traffic to judge", () => {
    expect(findFunnelDrop(rows(20, 0.45, 0.1), step, NOW)).toBeNull();
  });
  test("route marginals, missing windows and duplicate windows never establish conversion", () => {
    const traffic = [{ route: "/cart", day: dayOf(NOW - DAY), users: 100 }, { route: "/checkout", day: dayOf(NOW - DAY), users: 100 }];
    expect(findFunnelDrop(traffic as unknown as FunnelWindow[], step, NOW)).toBeNull();
    expect(findFunnelDrop(rows(100, 0.5, 0.2).slice(1), step, NOW)).toBeNull();
    const r = rows(100, 0.5, 0.2);
    expect(findFunnelDrop([...r, r[0]], step, NOW)).toBeNull();
    expect(findFunnelDrop(r.map(x => ({ ...x, converted: x.entered + 1 })), step, NOW)).toBeNull();
    expect(stepCounts(r, step, new Set([dayOf(NOW - DAY)]))).toMatchObject({ entered: 100, converted: 20, days: 1 });
  });
  test("guesses a funnel from busy routes", () => {
    expect(guessFunnel(["/", "/cart", "/checkout"])).toEqual(step);
    expect(guessFunnel(["/", "/pricing", "/signup"])?.label).toBe("/pricing → /signup");
    expect(guessFunnel(["/docs"])).toBeNull();
  });
});

describe("experiment proposal fallback", () => {
  const drop = findFunnelDrop(rows(400, 0.45, 0.3), step, NOW)!;
  test("checkout drops get a CTA test aimed at the step", () => {
    const e = fallbackExperiment(drop);
    expect(e.change).toBe("cta");
    expect(e.hypothesis).toContain("/cart → /checkout");
    expect(e.hypothesis).toContain("45%");
  });
  test("signup drops get an onboarding tweak", () => {
    expect(fallbackExperiment({ ...drop, step: { from: "/pricing", to: "/signup", label: "/pricing → /signup" } }).change).toBe("onboarding");
  });
  test("anything else gets a copy change", () => {
    expect(fallbackExperiment({ ...drop, step: { from: "/", to: "/docs", label: "/ → /docs" } }).change).toBe("copy");
  });
});

describe("measurement math", () => {
  test("normal CDF matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.645)).toBeCloseTo(0.05, 3);
  });
  test("two-proportion z-test on a textbook case", () => {
    // 200/1000 vs 250/1000: pooled 0.225, z ≈ 2.68, p ≈ 0.0073
    const m = measure({ entered: 1000, converted: 200, days: 7 }, { entered: 1000, converted: 250, days: 7 });
    expect(m.lift).toBeCloseTo(0.25, 6);
    expect(m.diff).toBeCloseTo(0.05, 6);
    expect(m.z).toBeCloseTo(2.68, 2);
    expect(m.p).toBeCloseTo(0.0073, 3);
    expect(m.ci[0]).toBeGreaterThan(0);
    expect(m.ci[1]).toBeGreaterThan(m.diff);
  });
  test("no data after the launch means p = 1", () => {
    const m = measure({ entered: 1000, converted: 200, days: 7 }, { entered: 0, converted: 0, days: 0 });
    expect(m.p).toBe(1);
    expect(m.sample).toBe(0);
  });
});

describe("verdicts", () => {
  const base = { entered: 2800, converted: 840, days: 7 }; // 30%
  test("a clear jump stays provisional until the fixed complete horizon", () => {
    const m = measure(base, { entered: 1200, converted: 430, days: 7 }); // 35.8%
    expect(verdict(m, 3)).toBe("too_early");
    expect(verdict(m, 7)).toBe("lift");
    expect(verdict(m, 1)).toBe("too_early");
  });
  test("a clear drop is provisional early, with a final call only at the fixed horizon", () => {
    expect(verdict(measure(base, { entered: 800, converted: 180, days: 2 }), 2)).toBe("too_early");
    expect(verdict(measure(base, { entered: 800, converted: 180, days: 7 }), 7)).toBe("hurt");
  });
  test("flat after the full window is no lift", () => {
    const m = measure(base, { entered: 2700, converted: 815, days: 7 });
    expect(verdict(m, 7)).toBe("no_lift");
    expect(verdict(m, 4)).toBe("too_early");
  });
  test("a big lift on a tiny sample waits", () => {
    expect(verdict(measure(base, { entered: 60, converted: 30, days: 7 }), 7)).toBe("inconclusive");
    expect(verdict(measure(base, { entered: 60, converted: 30, days: 2 }), 2)).toBe("too_early");
  });
  test("a significant but tiny lift is still no lift", () => {
    const huge = { entered: 2_000_000, converted: 600_000, days: 7 };
    const m = measure(huge, { entered: 2_000_000, converted: 606_000, days: 7 }); // +1%, p tiny
    expect(m.p).toBeLessThan(0.05);
    expect(verdict(m, 7)).toBe("no_lift");
  });
  test("verdict lines say what happened in plain words", () => {
    const m = measure(base, { entered: 1200, converted: 430, days: 3 });
    expect(verdictLine("lift", m, step.label)).toContain("Observed +19%");
    expect(verdictLine("lift", m, step.label)).not.toContain("It worked");
    expect(verdictLine("no_lift", m, step.label)).toContain("No clear lift");
    expect(verdictLine("hurt", m, step.label)).toContain("review before");
  });
});

describe("updateExperiment", () => {
  const exp: Experiment = {
    id: "exp-1", step, title: "Clearer checkout button", hypothesis: "h", change: "cta", district: "checkout", state: "measuring",
    baseline: { entered: 2800, converted: 840, days: 7 }, windowDays: 7, proposedAt: NOW - 9 * DAY, launchedAt: NOW - 3 * DAY,
  };
  test("stays measuring while it's too early", () => {
    const next = updateExperiment(exp, { entered: 300, converted: 95, days: 1 }, 1, NOW);
    expect(next.state).toBe("measuring");
    expect(next.verdict).toBe("too_early");
    expect(next.line).toContain("Still measuring");
  });
  test("wins on lift and stamps the time", () => {
    const next = updateExperiment(exp, { entered: 1200, converted: 430, days: 7 }, 7, NOW);
    expect(next.state).toBe("won");
    expect(next.decidedAt).toBe(NOW);
    expect(next.lift).toBeCloseTo(0.194, 2);
  });
  test("flat after the window", () => {
    expect(updateExperiment(exp, { entered: 2700, converted: 815, days: 7 }, 7, NOW).state).toBe("flat");
  });
  test("lost when it hurt", () => {
    expect(updateExperiment(exp, { entered: 800, converted: 180, days: 7 }, 7, NOW).state).toBe("lost");
  });
  test("a decided experiment doesn't move", () => {
    const won = { ...exp, state: "won" as const };
    expect(updateExperiment(won, { entered: 1, converted: 0, days: 1 }, 7, NOW)).toBe(won);
  });
  test("same numbers, same object", () => {
    const once = updateExperiment(exp, { entered: 300, converted: 95, days: 1 }, 1, NOW);
    expect(updateExperiment(once, { entered: 300, converted: 95, days: 1 }, 1, NOW)).toBe(once);
  });
});


test("zero, invalid, incomplete or underpowered windows are inconclusive, never no-lift", () => {
  const base = { entered: 2800, converted: 840, days: 7 };
  for (const after of [{ entered: 0, converted: 0, days: 7 }, { entered: 60, converted: 30, days: 7 }, { entered: 1000, converted: 500, days: 3 }, { entered: 100, converted: 500, days: 7 }]) {
    const m = measure(base, after);
    expect(verdict(m, 7)).toBe("inconclusive");
    expect(verdictLine("inconclusive", m, "checkout")).toContain("No conclusion yet");
  }
});

test("a zero baseline cannot be labelled no-lift when relative lift is undefined", () => {
  expect(verdict(measure({ entered: 1000, converted: 0, days: 7 }, { entered: 1000, converted: 300, days: 7 }), 7)).toBe("inconclusive");
});

test("an early noisy spike cannot freeze a winner that vanishes over the complete window", () => {
  const exp = { id: "noise", step, title: "CTA", hypothesis: "h", change: "cta" as const, district: "checkout", state: "measuring" as const, baseline: { entered: 2800, converted: 840, days: 7 }, windowDays: 7, proposedAt: NOW - 9 * DAY, launchedAt: NOW - 7 * DAY };
  const early = updateExperiment(exp, { entered: 1200, converted: 430, days: 3 }, 3, NOW - 4 * DAY);
  expect(early.state).toBe("measuring");
  const complete = updateExperiment(early, { entered: 2800, converted: 840, days: 7 }, 7, NOW);
  expect(complete.state).toBe("flat");
  expect(updateExperiment(complete, { entered: 2800, converted: 840, days: 7 }, 7, NOW)).toBe(complete);
});
