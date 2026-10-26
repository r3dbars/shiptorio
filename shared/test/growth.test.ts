import { describe, expect, test } from "bun:test";
import {
  fallbackExperiment,
  findFunnelDrop,
  funnelDays,
  guessFunnel,
  earlyWarning,
  measure,
  normalCdf,
  updateExperiment,
  verdict,
  verdictLine,
  type FunnelDay,
} from "../src/growth";
import type { Experiment, FunnelStep } from "../src/model";

const DAY = 86400000;
const NOW = Date.parse("2026-10-26T12:00:00Z");
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const step: FunnelStep = { from: "/cart", to: "/checkout", label: "/cart → /checkout" };

/** 8 days of the /cart → /checkout funnel; yesterday's conversion can differ. */
function rows(cart: number, share: number, yesterdayShare = share): FunnelDay[] {
  return Array.from({ length: 8 }, (_, k) => {
    const i = 8 - k;
    return { day: dayOf(NOW - i * DAY), entered: cart, converted: Math.round(cart * (i === 1 ? yesterdayShare : share)) };
  });
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
  test("a missing baseline day means no call, not a drop", () => {
    expect(findFunnelDrop(rows(400, 0.45, 0.3).filter((r) => r.day !== dayOf(NOW - 4 * DAY)), step, NOW)).toBeNull();
    expect(findFunnelDrop(rows(400, 0.45, 0.3).filter((r) => r.day !== dayOf(NOW - DAY)), step, NOW)).toBeNull();
  });
  test("guesses a funnel from busy routes", () => {
    expect(guessFunnel(["/", "/cart", "/checkout"])).toEqual(step);
    expect(guessFunnel(["/", "/pricing", "/signup"])?.label).toBe("/pricing → /signup");
    expect(guessFunnel(["/docs"])).toBeNull();
  });
});

describe("funnel counting (same person, in order, same day)", () => {
  const t0 = Date.parse("2026-10-20T10:00:00Z");
  const ev = (person: string, route: string, minutes: number) => ({ person, route, at: t0 + minutes * 60000 });
  test("disjoint cohorts: 100 on /cart and 100 different people on /checkout is 0% conversion", () => {
    const events = [...Array.from({ length: 100 }, (_, i) => ev(`a${i}`, "/cart", i)), ...Array.from({ length: 100 }, (_, i) => ev(`b${i}`, "/checkout", i))];
    expect(funnelDays(events, step)).toEqual([{ day: "2026-10-20", entered: 100, converted: 0 }]);
  });
  test("order matters: /checkout before /cart doesn't convert", () => {
    expect(funnelDays([ev("p", "/checkout", 0), ev("p", "/cart", 5)], step)[0]).toEqual({ day: "2026-10-20", entered: 1, converted: 0 });
    expect(funnelDays([ev("p", "/cart", 0), ev("p", "/checkout", 5)], step)[0].converted).toBe(1);
  });
  test("cross-day: /cart today, /checkout tomorrow is outside the one-day window", () => {
    const days = funnelDays([ev("p", "/cart", 0), ev("p", "/checkout", 24 * 60)], step);
    expect(days).toEqual([{ day: "2026-10-20", entered: 1, converted: 0 }]);
  });
  test("one person counts once a day, however many times they bounce", () => {
    expect(funnelDays([ev("p", "/cart", 0), ev("p", "/cart", 3), ev("p", "/checkout", 4), ev("p", "/checkout", 9)], step)[0]).toEqual({ day: "2026-10-20", entered: 1, converted: 1 });
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

describe("verdicts (one call, at the 7-day horizon)", () => {
  const base = { entered: 2800, converted: 840, days: 7 }; // 30%
  test("a clear jump is lift, but only once the week is up", () => {
    const m = measure(base, { entered: 2800, converted: 1000, days: 7 }); // 35.7%
    expect(verdict(m, 7, 7, 7)).toBe("lift");
    expect(verdict(measure(base, { entered: 1200, converted: 430, days: 3 }), 3, 7, 3)).toBe("too_early");
  });
  test("a clear drop is hurt at the horizon; before it, only an early warning", () => {
    const early = measure(base, { entered: 800, converted: 180, days: 2 });
    expect(verdict(early, 2, 7, 2)).toBe("too_early");
    expect(earlyWarning(early)).toBe(true);
    expect(verdictLine("too_early", early, step.label)).toContain("Early warning");
    expect(verdict(measure(base, { entered: 2800, converted: 650, days: 7 }), 7, 7, 7)).toBe("hurt");
  });
  test("flat over a full, well-sampled week is no lift", () => {
    expect(verdict(measure(base, { entered: 2700, converted: 815, days: 7 }), 7, 7, 7)).toBe("no_lift");
  });
  test("zero traffic after the launch is inconclusive, not no lift", () => {
    const m = measure(base, { entered: 0, converted: 0, days: 0 });
    expect(verdict(m, 7, 7, 0)).toBe("inconclusive");
    expect(verdictLine("inconclusive", m, step.label)).toBe("Not enough data to call /cart → /checkout: 0 people after vs 2800 before. No verdict.");
  });
  test("a missing day in the window is inconclusive", () => {
    expect(verdict(measure(base, { entered: 2400, converted: 860, days: 6 }), 7, 7, 6)).toBe("inconclusive");
  });
  test("a too-small sample on either side is inconclusive", () => {
    expect(verdict(measure(base, { entered: 120, converted: 60, days: 7 }), 7, 7, 7)).toBe("inconclusive");
    expect(verdict(measure({ entered: 150, converted: 45, days: 7 }, { entered: 2800, converted: 1000, days: 7 }), 7, 7, 7)).toBe("inconclusive");
  });
  test("a significant but tiny lift is still no lift", () => {
    const huge = { entered: 2_000_000, converted: 600_000, days: 7 };
    const m = measure(huge, { entered: 2_000_000, converted: 606_000, days: 7 }); // +1%, p tiny
    expect(m.p).toBeLessThan(0.05);
    expect(verdict(m, 7, 7, 7)).toBe("no_lift");
  });
  test("verdict lines say what happened in plain words", () => {
    const m = measure(base, { entered: 1200, converted: 430, days: 3 });
    expect(verdictLine("lift", m, step.label)).toBe("+19% on /cart → /checkout: 30.0% → 35.8% across 1200 people. It worked.");
    expect(verdictLine("no_lift", m, step.label)).toContain("No real change");
    expect(verdictLine("hurt", m, step.label)).toContain("roll it back");
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
  test("a transient early spike never freezes a win: day 3 looks great, the full week is flat", () => {
    // days 1-3: 430/1200 (35.8%), significant on its own; days 4-7: 410/1600, so the week is 840/2800 (30%)
    const day3 = updateExperiment(exp, { entered: 1200, converted: 430, days: 3 }, 3, NOW);
    expect(day3.state).toBe("measuring");
    const week = updateExperiment(day3, { entered: 2800, converted: 840, days: 7 }, 7, NOW + 4 * DAY);
    expect(week.state).toBe("flat");
    expect(week.lift).toBeCloseTo(0, 6);
  });
  test("wins on lift at the horizon and stamps the time", () => {
    const next = updateExperiment(exp, { entered: 2800, converted: 1000, days: 7 }, 7, NOW);
    expect(next.state).toBe("won");
    expect(next.decidedAt).toBe(NOW);
    expect(next.lift).toBeCloseTo(0.19, 2);
  });
  test("lost when it hurt over the week", () => {
    expect(updateExperiment(exp, { entered: 2800, converted: 650, days: 7 }, 7, NOW).state).toBe("lost");
  });
  test("missing PostHog days end inconclusive", () => {
    const next = updateExperiment(exp, { entered: 1600, converted: 560, days: 4 }, 7, NOW);
    expect(next.state).toBe("inconclusive");
    expect(next.line).toContain("Not enough data");
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
