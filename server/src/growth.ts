// The growth loop on the live factory (docs/context/growth-loop.md). Runs on every PostHog poll:
// launched experiments get their baseline frozen and their after-launch days measured, and a funnel step
// that dropped (with no experiment already on it) comes back as a proposal for Spark to turn into one.
// Pure: the Factory does the Spark call through think() and ingests the proposal as ore.

import { findFunnelDrop, guessFunnel, MEASURE_DAYS, stepCounts, updateExperiment, type Experiment, type FunnelDrop, type FunnelStep, type Item, type RouteUsers, type Station } from "@shiptorio/shared";
import type { Signal } from "./sources/types";
import type { RouteDay } from "./sources/posthog";

const DAY = 86400000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const MAX_EXPERIMENTS = 20;

/** People per route per day for the key event, the shape the funnel math reads. */
export const routeUsers = (rows: RouteDay[], keyEvent: string): RouteUsers[] => rows.filter((r) => r.event === keyEvent).map(({ route, day, users }) => ({ route, day, users }));

/** Full days strictly after `from` up to yesterday, at most `max`. */
function daysAfter(from: number, now: number, max: number): Set<string> {
  const days = new Set<string>();
  const first = Date.parse(`${dayOf(from)}T00:00:00Z`) + DAY;
  for (let t = first; dayOf(t) < dayOf(now) && days.size < max; t += DAY) days.add(dayOf(t));
  return days;
}
const daysBefore = (at: number, n: number) => new Set(Array.from({ length: n }, (_, i) => dayOf(at - (i + 1) * DAY)));

export interface GrowthTick {
  experiments: Experiment[];
  changed: boolean;
  decided: Experiment[]; // called on this poll: lift, no lift or hurt
  drop?: FunnelDrop; // a funnel step that dropped with nothing on it yet: ask Spark for an experiment
}

export function growthTick(experiments: Experiment[], items: Item[], users: RouteUsers[], now: number, step: FunnelStep | null = guessFunnel([...new Set(users.map((u) => u.route))])): GrowthTick {
  const decided: Experiment[] = [];
  const next = experiments.map((exp) => {
    const item = exp.itemId ? items.find((i) => i.id === exp.itemId) : undefined;
    // the PR launched: freeze the week before as the baseline, start the watch
    if (exp.state === "building" && item?.state === "launched") {
      const launchedAt = item.orbit?.since ?? item.updatedAt;
      return { ...exp, state: "measuring" as const, prNumber: item.orbit?.prNumber ?? item.prNumber, launchedAt, baseline: stepCounts(users, exp.step, daysBefore(launchedAt, 7)), daysWatched: 0 };
    }
    if (exp.state === "building" && !item) return { ...exp, state: "dropped" as const }; // the ore was closed before it shipped
    if (exp.state !== "measuring" || !exp.launchedAt) return exp;
    const days = daysAfter(exp.launchedAt, now, exp.windowDays);
    if (!days.size) return exp;
    const out = updateExperiment(exp, stepCounts(users, exp.step, days), days.size, now);
    if (out.state !== "measuring" && out !== exp) decided.push(out);
    return out;
  });
  const changed = next.some((e, i) => e !== experiments[i]);
  const open = (e: Experiment) => e.state === "proposed" || e.state === "building" || e.state === "measuring";
  const drop = step && !next.some((e) => e.step.label === step.label && open(e)) ? findFunnelDrop(users, step, now) ?? undefined : undefined;
  return { experiments: next.slice(0, MAX_EXPERIMENTS), changed, decided, drop };
}

/** A new experiment from Spark's proposal (or the fallback), waiting to be shipped. */
export function newExperiment(drop: FunnelDrop, p: { title: string; hypothesis: string; change: Experiment["change"]; district: string }, now: number): Experiment {
  return {
    id: `exp-${dayOf(now)}-${drop.step.from.replace(/\W+/g, "") || "root"}-${drop.step.to.replace(/\W+/g, "") || "root"}`,
    step: drop.step,
    title: p.title.startsWith("Experiment:") ? p.title : `Experiment: ${p.title}`,
    hypothesis: p.hypothesis,
    change: p.change,
    district: p.district,
    state: "building",
    baseline: drop.baseline,
    windowDays: MEASURE_DAYS,
    proposedAt: now,
  };
}

/** The experiment as ore: it rides the normal line (triage, the player's go, the gauntlet, the merge gate). */
export function experimentSignal(exp: Experiment, drop: FunnelDrop, now: number): Signal {
  const fingerprint = `growth:${exp.id}`;
  return {
    source: "posthog", externalId: exp.id, fingerprint, kindHint: "feature",
    title: exp.title,
    body: `${exp.hypothesis}\n\nWhy: ${drop.step.label} converted ${Math.round(drop.rate * 100)}% yesterday vs ${Math.round(drop.baseRate * 100)}% the week before (−${drop.dropPct}%), about ${drop.lostPerDay} people a day. After it launches, the measure station watches ${drop.step.label} for ${exp.windowDays} days and calls lift, no lift or hurt.`,
    districtHint: exp.district, usersAffected: drop.lostPerDay, occurredAt: now, rawRef: fingerprint, severity: 1, hints: [`route:${drop.step.from}`, "growth"], action: "upsert",
  };
}

// The measure station sits by orbit watch. It goes on the map with the first experiment.
export const MEASURE_ID = "measure-1";
export const measureMachine = () => ({ id: MEASURE_ID, type: "inspector" as const, x: 18, y: 3, tier: 1, state: "idle" as const });

export function measureStation(s: { experiments?: Experiment[]; machines: { id: string }[] }): Station | null {
  const exps = s.experiments ?? [];
  if (!exps.length || !s.machines.some((m) => m.id === MEASURE_ID)) return null;
  const decided = exps.filter((e) => e.state === "won" || e.state === "flat" || e.state === "lost");
  const last = [...decided].sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))[0];
  return {
    id: MEASURE_ID, kind: "measure", name: "Measure station", machineId: MEASURE_ID,
    wip: exps.filter((e) => e.state === "measuring").length,
    passRate: decided.length ? decided.filter((e) => e.state === "won").length / decided.length : undefined,
    caughtThisWeek: decided.filter((e) => e.state === "lost").length,
    lastLog: last?.line ? { who: "Measure", text: last.line.slice(0, 200), ok: last.state !== "lost" } : undefined,
    actions: [],
  };
}
