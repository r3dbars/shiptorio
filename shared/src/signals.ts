// The bottleneck brain's contract (docs/BRAIN.md). Collectors turn the outside world (repo, CI, Sentry,
// PostHog, feedback, the player's goals and taps) into Signals. The brain reads the fresh ones, names ONE
// BrainBottleneck, and deals ONE BrainUnlock as a Continue/Later card. Pure and shared, so server, web, sim
// and the eval harness all speak the same shapes.
//
// Names are Brain* on purpose: the queue-jam `Bottleneck` in model.ts stays as it is (it becomes one
// "factory" signal), and the ore `Signal` in server/src/sources/types.ts is a raw webhook event that becomes
// an Item. A BrainSignal summarizes a whole source ("12 Sentry issues untriaged"), never one event.

import { z } from "zod";
import type { Move, MoveKind } from "./model";

/** Where a signal comes from. One collector per source (docs/BRAIN.md "Who builds what"). */
export const SignalSource = z.enum(["factory", "repo", "ci", "sentry", "posthog", "feedback", "goals", "taps"]);
export type SignalSource = z.infer<typeof SignalSource>;

/**
 * What the signal says. Free slug so collectors can add kinds without touching shared; the known ones are
 * listed in SIGNAL_KINDS so the brain prompt and the eval harness can name them.
 */
export const SignalKind = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);
export type SignalKind = z.infer<typeof SignalKind>;

export const SIGNAL_KINDS: Record<SignalSource, readonly string[]> = {
  factory: ["queue_jam", "no_power", "no_agent", "rework_loop"],
  repo: ["prs_stale", "issues_untriaged", "no_tests", "big_prs", "backlog_empty", "ship_rate_drop"],
  ci: ["ci_slow", "ci_flaky", "ci_red_main", "ci_queue", "ci_missing"],
  sentry: ["errors_piling", "error_spike", "regression", "errors_unowned"],
  posthog: ["usage_flat", "funnel_drop", "no_users", "feature_unused", "no_analytics"],
  feedback: ["feedback_unanswered", "feedback_thin", "same_complaint"],
  goals: ["goal_stalled", "goal_missing", "goal_off_track"],
  taps: ["card_ignored", "later_streak", "never_reason"],
};

/** One link the player (and the eval harness) can open to check the claim. */
export const Evidence = z.object({
  label: z.string().max(120), // "Run #4812 took 14 min"
  url: z.string().url().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const BrainSignal = z.object({
  /** Stable across reads: `${source}:${kind}:${scope ?? "repo"}`. Re-reading the same fact replaces it. */
  id: z.string(),
  source: SignalSource,
  kind: SignalKind,
  /** One plain sentence with the real number: "CI takes 14 min, up from 6 last week." Player-safe words. */
  title: z.string().max(160),
  /** 0 = noise, 1 = the factory can't ship until this is dealt with. Collectors calibrate per source. */
  severity: z.number().min(0).max(1),
  /** How sure the collector is the number is right (sampled data, partial reads). Defaults to 1. */
  confidence: z.number().min(0).max(1).default(1),
  metric: z.object({ value: z.number(), baseline: z.number().optional(), unit: z.string().max(16) }).optional(),
  /** District, folder or funnel step it's about, when it's narrower than the whole repo. */
  scope: z.string().max(80).optional(),
  evidence: z.array(Evidence).min(1).max(5),
  /** When the collector read it, and when it should stop counting without a fresh read. */
  observedAt: z.number(),
  freshUntil: z.number(),
});
export type BrainSignal = z.infer<typeof BrainSignal>;

export const signalId = (source: SignalSource, kind: string, scope?: string) => `${source}:${kind}:${scope ?? "repo"}`;

export const isFresh = (s: BrainSignal, now: number) => s.observedAt <= now && now < s.freshUntil;

/**
 * Severity, faded by confidence and by age inside the freshness window (half weight at the end of it).
 * The deterministic ranking the brain starts from, and what the rule fallback uses on its own.
 */
export function signalWeight(s: BrainSignal, now: number): number {
  if (!isFresh(s, now)) return 0;
  const life = Math.max(1, s.freshUntil - s.observedAt);
  return s.severity * s.confidence * (1 - 0.5 * ((now - s.observedAt) / life));
}

/** Fresh signals, heaviest first, with ids deduped (the newest read wins). */
export function freshSignals(signals: readonly BrainSignal[], now: number): BrainSignal[] {
  const byId = new Map<string, BrainSignal>();
  for (const s of signals) if (isFresh(s, now) && (byId.get(s.id)?.observedAt ?? -1) < s.observedAt) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => signalWeight(b, now) - signalWeight(a, now) || a.id.localeCompare(b.id));
}

/**
 * What kind of thing is holding the player back. Closed on purpose: the eval harness grades on it exactly,
 * and the map picks the floor to light from it. ship = work stuck in the line (factory, repo flow);
 * speed = CI or tooling slows every PR; quality = errors reach users; users = nobody uses what ships;
 * feedback = people wrote in and nobody answered, or nobody is asked; focus = no goal, or the player's
 * taps say the deck is off. "Nothing is wrong" is a null bottleneck, never an area.
 */
export const BottleneckArea = z.enum(["ship", "speed", "quality", "users", "feedback", "focus"]);
export type BottleneckArea = z.infer<typeof BottleneckArea>;

/** The area a source's signals point at by default. The rule fallback uses it; Spark may say otherwise with a reason. */
export const DEFAULT_AREA: Record<SignalSource, BottleneckArea> = {
  factory: "ship", repo: "ship", ci: "speed", sentry: "quality", posthog: "users", feedback: "feedback", goals: "focus", taps: "focus",
};

/** The ONE thing holding the player back right now, named from the signals. */
export const BrainBottleneck = z.object({
  id: z.string(), // the main signal's id, so the same jam keeps the same card
  area: BottleneckArea,
  title: z.string().max(80), // "Errors are piling up"
  why: z.string().max(200), // who it hurts, with a number: "14 errors hit 230 users this week, none triaged."
  signalIds: z.array(z.string()).min(1).max(5), // only ids from the fresh set; the first is the main one
  confidence: z.number().min(0).max(1),
  by: z.enum(["spark", "rule"]),
  decidedAt: z.number(),
});
export type BrainBottleneck = z.infer<typeof BrainBottleneck>;

/** How big the ask is. The brain favors tap over minutes over hours when they unlock the same thing. */
export const UnlockEffort = z.enum(["tap", "minutes", "hours"]);
export type UnlockEffort = z.infer<typeof UnlockEffort>;

/**
 * The ONE move that clears the bottleneck. Becomes one Continue/Later card (toMove). `action` runs on
 * Continue; with no action, Continue opens `url` (a step only the player can do, like replying to a user).
 */
export const BrainUnlock = z.object({
  id: z.string(),
  bottleneckId: z.string(),
  play: z.string(), // the unlock playbook entry it came from (server/src/unlocks.ts), e.g. "ci_cache_installs"; evals grade on it
  kind: z.enum(["unblock", "build", "verify", "input", "automate", "ship", "review", "reply"]), // MoveKind
  title: z.string().max(80), // the card headline: "Triage the 14 new errors"
  because: z.string().max(140), // under 20 plain words, cites the number
  effort: UnlockEffort,
  action: z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()) }).optional(),
  url: z.string().url().optional(),
  grows: z.array(z.string()).max(3).optional(), // "+1 CHECK", "+1 SOURCE"
  /** How the loop knows it worked: this signal clears, or its metric crosses `below`/`above`. */
  doneWhen: z.object({ signalId: z.string(), below: z.number().optional(), above: z.number().optional() }),
});
export type BrainUnlock = z.infer<typeof BrainUnlock>;

/** One full pass of the brain: what it read, what it named, what it dealt, and why. Stored and replayed by evals. */
export const Diagnosis = z.object({
  at: z.number(),
  signals: z.array(BrainSignal),
  bottleneck: BrainBottleneck.nullable(), // null = nothing worth a card; the brain stays quiet
  unlock: BrainUnlock.nullable(),
  reason: z.string().max(300),
});
export type Diagnosis = z.infer<typeof Diagnosis>;

/** Did the unlock work? Checked against the newest read of its signal. */
export function unlockDone(u: BrainUnlock, signals: readonly BrainSignal[], now: number): boolean {
  const s = freshSignals(signals, now).find((x) => x.id === u.doneWhen.signalId);
  if (!s) return true; // the signal cleared
  const v = s.metric?.value;
  if (v === undefined) return false;
  return (u.doneWhen.below !== undefined && v < u.doneWhen.below) || (u.doneWhen.above !== undefined && v > u.doneWhen.above);
}

/** The one card: Continue runs the unlock, Later parks it (the deck book remembers). */
export function unlockMove(b: BrainBottleneck, u: BrainUnlock, now: number): Move {
  const kind: MoveKind = u.kind;
  return {
    id: `unlock:${b.id}`,
    title: u.title,
    why: b.why,
    because: u.because,
    kind,
    grows: u.grows,
    url: u.url,
    createdAt: now,
    attention: "suggest",
    options: [
      { id: "continue", label: "Continue", recommended: true, actions: u.action ? [{ ...u.action, reason: u.because }] : [] },
      { id: "later", label: "Later", recommended: false, actions: [] },
    ],
  };
}

/**
 * A collector reads one source and returns its current signals. Never throws for "not connected": it
 * returns a `*_missing` / `no_*` signal or nothing. Never calls a model; collectors are cheap and run often.
 */
export interface SignalCollector<Ctx = unknown> {
  source: SignalSource;
  /** Minimum ms between reads, so a busy factory can't hammer GitHub or PostHog. */
  everyMs: number;
  read(ctx: Ctx, now: number): Promise<BrainSignal[]>;
}

/** What the map and HUD read: the brain's current bottleneck plus its main signal's weight (0..1). Null = quiet. */
export const HoldingBack = BrainBottleneck.extend({ severity: z.number().min(0).max(1) });
export type HoldingBack = z.infer<typeof HoldingBack>;
