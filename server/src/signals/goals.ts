// The player-goals collector (docs/BRAIN.md "Who builds what"). Reads the goals on the factory state
// (shared/src/goals.ts) and says when goals themselves are the bottleneck: none picked yet, picked but nothing
// has shipped since, or the player's own taps point somewhere else. No model calls; cheap enough to run every pass.
// The goals as weights (goalWeight, goalContext) live in shared so the brain can tilt every other signal by them.
import { GOALS, inferGoals, signalId, type BrainSignal, type FactoryState, type GoalGuess, type SignalCollector } from "@shiptorio/shared";

export interface GoalsCtx {
  state: Pick<FactoryState, "goals" | "metrics">;
  /** Continue taps rolled up by card kind (deckBook.yes), so a goal can be checked against what the player does. */
  yes?: Readonly<Record<string, number>>;
}

const HOUR = 3600_000, DAY = 24 * HOUR;
const MIN_ROCKETS = 1; // the goal card is earned after the first rocket; before that, no goal is not a problem
const STALL_DAYS = 3;
const OFF_TRACK_TAPS = 6; // this many Continues on cards that serve another goal before the brain says so

export function goalSignals(ctx: GoalsCtx, now: number): BrainSignal[] {
  const { goals, metrics } = ctx.state;
  const rockets = metrics?.rockets ?? 0;
  const at = { observedAt: now, freshUntil: now + 6 * HOUR };
  if (rockets < MIN_ROCKETS) return [];
  if (!goals || goals.by !== "player") {
    const guess = goals ? GOALS[goals.picks[0]].label.toLowerCase() : undefined;
    return [{
      id: signalId("goals", "goal_missing"), source: "goals", kind: "goal_missing", confidence: 1, ...at,
      title: guess ? `No goal picked yet; the factory guesses ${guess}.` : "No goal picked yet, so every signal counts the same.",
      // Low on purpose: a missing goal only wins when nothing real is on fire.
      severity: Math.min(0.35, 0.15 + 0.05 * rockets),
      metric: { value: rockets, unit: "rockets" },
      evidence: [{ label: goals?.why ?? `${rockets} ${rockets === 1 ? "rocket" : "rockets"} launched without a goal` }],
    }];
  }
  const out: BrainSignal[] = [];
  const top = GOALS[goals.picks[0]];
  const since = goals.rockets === undefined ? undefined : rockets - goals.rockets;
  const days = (now - goals.at) / DAY;
  if (since === 0 && days >= STALL_DAYS) {
    out.push({
      id: signalId("goals", "goal_stalled", goals.picks[0]), source: "goals", kind: "goal_stalled", scope: goals.picks[0], confidence: 1, ...at,
      title: `Nothing has shipped toward ${top.want} in ${Math.floor(days)} days.`,
      severity: Math.min(0.8, 0.3 + 0.1 * (days - STALL_DAYS)),
      metric: { value: Math.floor(days), unit: "days" },
      evidence: [{ label: `Goal set ${Math.floor(days)} days ago, 0 rockets since` }],
    });
  }
  const taps = Object.values(ctx.yes ?? {}).reduce((n, v) => n + v, 0);
  if (taps >= OFF_TRACK_TAPS) {
    const fromTaps: GoalGuess | undefined = inferGoals({ yes: ctx.yes })[0];
    if (fromTaps && fromTaps.score > 0 && !goals.picks.includes(fromTaps.id)) {
      out.push({
        id: signalId("goals", "goal_off_track", fromTaps.id), source: "goals", kind: "goal_off_track", scope: fromTaps.id, confidence: 0.6, ...at,
        title: `You picked ${top.label.toLowerCase()}, but your yeses lean to ${GOALS[fromTaps.id].label.toLowerCase()}.`,
        severity: 0.3,
        metric: { value: taps, unit: "taps" },
        evidence: [{ label: `${taps} Continues, most on cards that serve ${GOALS[fromTaps.id].want}` }],
      });
    }
  }
  return out;
}

export const goalsCollector: SignalCollector<GoalsCtx> = {
  source: "goals",
  everyMs: 10 * 60_000,
  read: async (ctx, now) => goalSignals(ctx, now),
};
