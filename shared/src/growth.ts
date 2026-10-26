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

/** Unique-person counts returned by one ordered-funnel query over the whole window.
 * Summing daily route totals (or daily uniques) cannot recover an ordered cohort. */
export interface StepCounts { entered: number; converted: number; days: number }
export interface FunnelWindow extends StepCounts {
  from: string; to: string; startsOn: string; endsOn: string;
  ordered: true; unit: "unique_persons";
  evidence: "posthog_funnel" | "simulation";
  conversionWindowHours: number;
}

const validCounts = (c: StepCounts) => Number.isSafeInteger(c.entered) && c.entered >= 0 && Number.isSafeInteger(c.converted) && c.converted >= 0 && c.converted <= c.entered && Number.isSafeInteger(c.days) && c.days >= 0;

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

/** Accept one complete, explicitly ordered query window; never infer cohorts from traffic. */
export function stepCounts(rows: FunnelWindow[], step: FunnelStep, days: Set<string>): StepCounts | null {
  const sorted = [...days].sort();
  const matches = rows.filter(r => r.from === step.from && r.to === step.to && r.startsOn === sorted[0] && r.endsOn === sorted[sorted.length - 1]);
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (row.ordered !== true || row.unit !== "unique_persons" || !["posthog_funnel", "simulation"].includes(row.evidence) || !Number.isFinite(row.conversionWindowHours) || row.conversionWindowHours <= 0 || row.days !== days.size || !validCounts(row)) return null;
  return { entered: row.entered, converted: row.converted, days: row.days };
}

const lastDays = (now: number, from: number, n: number) => new Set(Array.from({ length: n }, (_, i) => dayOf(now - (i + from) * DAY)));

/** Compare yesterday's step conversion against the 7 full days before it. Null when it held up, or there's too little traffic to say. */
export function findFunnelDrop(rows: FunnelWindow[], step: FunnelStep, now = Date.now()): FunnelDrop | null {
  const baseline = stepCounts(rows, step, lastDays(now, 2, 7));
  const yesterday = stepCounts(rows, step, lastDays(now, 1, 1));
  if (!baseline || !yesterday) return null;
  // A baseline and current day must describe the same funnel definition.
  if (new Set(rows.filter(r => r.from === step.from && r.to === step.to).map(r => `${r.evidence}:${r.conversionWindowHours}`)).size !== 1) return null;
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
  baselineSample: number;
  days: number;
  baselineDays: number;
  valid: boolean;
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
  if (!validCounts(before) || !validCounts(after)) return { baseRate: 0, rate: 0, lift: 0, diff: 0, z: 0, p: 1, ci: [0, 0], sample: 0, baselineSample: 0, days: 0, baselineDays: 0, valid: false };
  const p1 = rate(before);
  const p2 = rate(after);
  const n1 = before.entered;
  const n2 = after.entered;
  const diff = p2 - p1;
  const lift = p1 > 0 ? diff / p1 : 0;
  if (!n1 || !n2) return { baseRate: p1, rate: p2, lift, diff, z: 0, p: 1, ci: [0, 0], sample: n2, baselineSample: n1, days: after.days, baselineDays: before.days, valid: true };
  const pooled = (before.converted + after.converted) / (n1 + n2);
  const se0 = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  const z = se0 > 0 ? diff / se0 : 0;
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  return { baseRate: p1, rate: p2, lift, diff, z, p, ci: [diff - 1.96 * se, diff + 1.96 * se], sample: n2, baselineSample: n1, days: after.days, baselineDays: before.days, valid: true };
}

/** Fixed-horizon comparison: daily reads are provisional, not repeated stop tests.
 * Before/after differences remain observational, not proof that the PR caused them. */
export function verdict(m: Measurement, daysWatched: number, windowDays = MEASURE_DAYS): ExperimentVerdict {
  if (daysWatched < windowDays) return "too_early";
  if (!m.valid || m.days < windowDays || m.baselineDays < windowDays || m.sample < MIN_SAMPLE || m.baselineSample < MIN_SAMPLE) return "inconclusive";
  const sure = m.p < ALPHA;
  if (sure && m.lift >= MIN_LIFT) return "lift";
  if (sure && m.lift <= -MIN_LIFT) return "hurt";
  return "no_lift";
}

const pctStr = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;
const ratePct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** One plain line for the card, the map pop and the log. No model names. */
export function verdictLine(v: ExperimentVerdict, m: Measurement, label: string): string {
  switch (v) {
    case "lift":
      return `Observed ${pctStr(m.lift)} on ${label}: ${ratePct(m.baseRate)} → ${ratePct(m.rate)} across ${m.sample} people after launch. Cause is not established.`;
    case "hurt":
      return `${pctStr(m.lift)} on ${label}: ${ratePct(m.baseRate)} → ${ratePct(m.rate)}. Observed after launch; review before changing or rolling back.`;
    case "no_lift":
      return `No clear lift on ${label}: ${ratePct(m.baseRate)} → ${ratePct(m.rate)} across ${m.sample} people (could be noise).`;
    case "inconclusive":
      return `Not enough valid data on ${label}: ${m.sample} people after launch. No conclusion yet.`;
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
    ...(v !== "too_early" && { state: v === "lift" ? "won" : v === "hurt" ? "lost" : v === "inconclusive" ? "inconclusive" : "flat", decidedAt: now }),
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
