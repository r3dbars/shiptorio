// The growth loop (docs/context/growth-loop.md): the first loop past code. A PostHog funnel step drops,
// the planner proposes one small experiment (copy, a CTA, an onboarding tweak), it ships as a normal PR
// through the gauntlet, and the measure station watches the same funnel step for a few days after the
// launch and calls it: lift, no lift, or it hurt. Pure functions, shared by the server, the sim and tests.

import type { Experiment, ExperimentChange, ExperimentVerdict, FunnelStep } from "./model";

const DAY = 86400000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

// Documented thresholds.
export const FUNNEL_MIN_ENTERED = 50; // people/day into the step, on average, before a drop means anything
export const FUNNEL_DROP = 0.2; // yesterday's step conversion at least 20% below its 7-day baseline
export const MEASURE_DAYS = 7; // how long the measure station watches after a launch
export const MIN_SAMPLE = 200; // people into the step after the launch before a verdict can be "lift" or "hurt"
export const ALPHA = 0.05; // two-sided significance for lift / hurt
export const MIN_LIFT = 0.02; // relative lift under 2% is "no lift" even when significant

/** People per day on a route, the shape the PostHog mine already pulls (server/src/sources/posthog.ts). */
export interface RouteUsers { route: string; day: string; users: number }

/** A funnel step's numbers over some days: how many reached `from`, and how many of them reached `to`. */
export interface StepCounts { entered: number; converted: number; days: number }

export interface FunnelDrop {
  step: FunnelStep;
  baseline: StepCounts; // the 7 full days before yesterday
  yesterday: StepCounts;
  baseRate: number;
  rate: number;
  dropPct: number; // 31 = conversion is 31% below baseline
  lostPerDay: number; // people a day who would have converted at the baseline rate
}

export const rate = (c: StepCounts) => (c.entered > 0 ? Math.min(1, c.converted / c.entered) : 0);

/** Sum a step over a set of days. Users on `to` cap at users on `from` per day (people can land mid-funnel). */
export function stepCounts(rows: RouteUsers[], step: FunnelStep, days: Set<string>): StepCounts {
  let entered = 0;
  let converted = 0;
  for (const day of days) {
    const from = rows.filter((r) => r.route === step.from && r.day === day).reduce((n, r) => n + r.users, 0);
    const to = rows.filter((r) => r.route === step.to && r.day === day).reduce((n, r) => n + r.users, 0);
    entered += from;
    converted += Math.min(from, to);
  }
  return { entered, converted, days: days.size };
}

const lastDays = (now: number, from: number, n: number) => new Set(Array.from({ length: n }, (_, i) => dayOf(now - (i + from) * DAY)));

/** Compare yesterday's step conversion against the 7 full days before it. Null when it held up, or there's too little traffic to say. */
export function findFunnelDrop(rows: RouteUsers[], step: FunnelStep, now = Date.now()): FunnelDrop | null {
  const baseline = stepCounts(rows, step, lastDays(now, 2, 7));
  const yesterday = stepCounts(rows, step, lastDays(now, 1, 1));
  if (baseline.entered / 7 < FUNNEL_MIN_ENTERED || yesterday.entered < FUNNEL_MIN_ENTERED / 2) return null;
  const baseRate = rate(baseline);
  const r = rate(yesterday);
  if (baseRate <= 0 || r >= baseRate * (1 - FUNNEL_DROP)) return null;
  return { step, baseline, yesterday, baseRate, rate: r, dropPct: Math.round((1 - r / baseRate) * 100), lostPerDay: Math.round((baseRate - r) * yesterday.entered) };
}

/** The planner's stand-in when Spark can't answer: one small, reversible change aimed at the step that dropped. */
export function fallbackExperiment(drop: FunnelDrop): { change: ExperimentChange; hypothesis: string; title: string } {
  const to = drop.step.to.toLowerCase();
  const pct = `${Math.round(drop.baseRate * 100)}%`;
  if (/checkout|pay|cart/.test(to))
    return { change: "cta", title: `Clearer checkout button on ${drop.step.from}`, hypothesis: `A plain "Pay now" button with the total on it gets ${drop.step.label} back above ${pct}.` };
  if (/sign ?up|register|onboard|start|welcome/.test(to))
    return { change: "onboarding", title: `Shorter signup on ${drop.step.from}`, hypothesis: `Asking for email only, then the rest later, gets ${drop.step.label} back above ${pct}.` };
  if (/pricing|plan|upgrade/.test(to))
    return { change: "copy", title: `Say the price up front on ${drop.step.from}`, hypothesis: `Naming the starting price next to the button gets ${drop.step.label} back above ${pct}.` };
  return { change: "copy", title: `Plainer call to action on ${drop.step.from}`, hypothesis: `One clear next step instead of three gets ${drop.step.label} back above ${pct}.` };
}

// ---------- measurement ----------

export interface Measurement {
  baseRate: number;
  rate: number;
  lift: number; // relative: 0.16 = +16%
  diff: number; // absolute rate difference
  z: number;
  p: number; // two-sided
  ci: [number, number]; // 95% interval on the absolute difference
  sample: number; // people into the step since the launch
}

// Abramowitz–Stegun 7.1.26: good to about 1e-7, plenty for a verdict.
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
export const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Two-proportion z-test: the step before the launch (baseline) against the step after it. */
export function measure(before: StepCounts, after: StepCounts): Measurement {
  const p1 = rate(before);
  const p2 = rate(after);
  const n1 = before.entered;
  const n2 = after.entered;
  const diff = p2 - p1;
  const lift = p1 > 0 ? diff / p1 : 0;
  if (!n1 || !n2) return { baseRate: p1, rate: p2, lift, diff, z: 0, p: 1, ci: [0, 0], sample: n2 };
  const pooled = (before.converted + after.converted) / (n1 + n2);
  const se0 = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  const z = se0 > 0 ? diff / se0 : 0;
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  return { baseRate: p1, rate: p2, lift, diff, z, p, ci: [diff - 1.96 * se, diff + 1.96 * se], sample: n2 };
}

/**
 * The measure station's call. Too early until the watch is over or there's enough sample to be sure either way;
 * then lift (significant and at least MIN_LIFT up), hurt (significant and down), or no lift.
 */
export function verdict(m: Measurement, daysWatched: number, windowDays = MEASURE_DAYS): ExperimentVerdict {
  const sure = m.sample >= MIN_SAMPLE && m.p < ALPHA;
  if (sure && m.lift >= MIN_LIFT) return daysWatched >= Math.min(3, windowDays) ? "lift" : "too_early";
  if (sure && m.lift <= -MIN_LIFT) return "hurt"; // a real drop ends the watch early
  return daysWatched >= windowDays ? "no_lift" : "too_early";
}

const pctStr = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;
const ratePct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** One plain line for the card, the map pop and the log. No model names. */
export function verdictLine(v: ExperimentVerdict, m: Measurement, label: string): string {
  switch (v) {
    case "lift":
      return `${pctStr(m.lift)} on ${label}: ${ratePct(m.baseRate)} → ${ratePct(m.rate)} across ${m.sample} people. It worked.`;
    case "hurt":
      return `${pctStr(m.lift)} on ${label}: ${ratePct(m.baseRate)} → ${ratePct(m.rate)}. It made things worse, roll it back.`;
    case "no_lift":
      return `No real change on ${label}: ${ratePct(m.baseRate)} → ${ratePct(m.rate)} across ${m.sample} people (could be noise).`;
    default:
      return `Still measuring ${label}: ${ratePct(m.rate)} so far vs ${ratePct(m.baseRate)} before, ${m.sample} people in.`;
  }
}

/** Fold a fresh measurement into an experiment that's being watched. Returns the same object when nothing moved. */
export function updateExperiment(exp: Experiment, after: StepCounts, daysWatched: number, now: number): Experiment {
  if (exp.state !== "measuring") return exp;
  const m = measure(exp.baseline, after);
  const v = verdict(m, daysWatched, exp.windowDays);
  const next: Experiment = {
    ...exp,
    after,
    daysWatched,
    lift: m.lift,
    p: m.p,
    verdict: v,
    line: verdictLine(v, m, exp.step.label),
    ...(v !== "too_early" && { state: v === "lift" ? "won" : v === "hurt" ? "lost" : "flat", decidedAt: now }),
  };
  return JSON.stringify(next) === JSON.stringify(exp) ? exp : next;
}

/** The step to watch when the player hasn't named one: the first pair of busy routes that looks like a funnel. */
export function guessFunnel(routes: string[]): FunnelStep | null {
  const pairs: [RegExp, RegExp][] = [[/^\/cart$/, /^\/checkout$/], [/^\/pricing$/, /^\/(signup|register)$/], [/^\/$/, /^\/(signup|register)$/], [/^\/$/, /^\/pricing$/]];
  for (const [a, b] of pairs) {
    const from = routes.find((r) => a.test(r));
    const to = routes.find((r) => b.test(r));
    if (from && to) return { from, to, label: `${from} → ${to}` };
  }
  return null;
}
