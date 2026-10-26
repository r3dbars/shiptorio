import { describe, expect, test } from "bun:test";
import {
  fallbackExperiment,
  findFunnelDrop,
  guessFunnel,
  measure,
  normalCdf,
  updateExperiment,
  verdict,
  verdictLine,
  type RouteUsers,
} from "../src/growth";
import type { Experiment, FunnelStep } from "../src/model";

const DAY = 86400000;
const NOW = Date.parse("2026-10-26T12:00:00Z");
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const step: FunnelStep = { from: "/cart", to: "/checkout", label: "/cart → /checkout" };

/** 8 days of /cart and /checkout users; yesterday's checkout share can differ. */
function rows(cart: number, share: number, yesterdayShare = share): RouteUsers[] {
  const out: RouteUsers[] = [];
  for (let i = 1; i <= 8; i++) {
    const day = dayOf(NOW - i * DAY);
    out.push({ route: "/cart", day, users: cart }, { route: "/checkout", day, users: Math.round(cart * (i === 1 ? yesterdayShare : share)) });
  }
  return out;
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
  test("people landing straight on /checkout can't push conversion over 100%", () => {
    const r = rows(100, 0.5, 0.2).map((x) => (x.route === "/checkout" && x.day !== dayOf(NOW - DAY) ? { ...x, users: 500 } : x));
    expect(findFunnelDrop(r, step, NOW)!.baseRate).toBe(1);
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
  test("a clear jump is lift once a few days are in", () => {
    const m = measure(base, { entered: 1200, converted: 430, days: 3 }); // 35.8%
    expect(verdict(m, 3)).toBe("lift");
    expect(verdict(m, 1)).toBe("too_early");
  });
  test("a clear drop is hurt, even early", () => {
    expect(verdict(measure(base, { entered: 800, converted: 180, days: 2 }), 2)).toBe("hurt");
  });
  test("flat after the full window is no lift", () => {
    const m = measure(base, { entered: 2700, converted: 815, days: 7 });
    expect(verdict(m, 7)).toBe("no_lift");
    expect(verdict(m, 4)).toBe("too_early");
  });
  test("a big lift on a tiny sample waits", () => {
    expect(verdict(measure(base, { entered: 60, converted: 30, days: 7 }), 7)).toBe("no_lift");
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
  test("wins on lift and stamps the time", () => {
    const next = updateExperiment(exp, { entered: 1200, converted: 430, days: 3 }, 3, NOW);
    expect(next.state).toBe("won");
    expect(next.decidedAt).toBe(NOW);
    expect(next.lift).toBeCloseTo(0.194, 2);
  });
  test("flat after the window", () => {
    expect(updateExperiment(exp, { entered: 2700, converted: 815, days: 7 }, 7, NOW).state).toBe("flat");
  });
  test("lost when it hurt", () => {
    expect(updateExperiment(exp, { entered: 800, converted: 180, days: 2 }, 2, NOW).state).toBe("lost");
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
