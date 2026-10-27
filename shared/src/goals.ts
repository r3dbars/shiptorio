// Player goals: what the player wants their project to get better at right now ("fewer bugs", "first 100
// users", "ship faster"). The bottleneck brain reads them to weigh its signals, so a Sentry pile-up matters
// more to someone chasing fewer bugs and a quiet PostHog matters more to someone chasing users.
//
// Earned, never upfront (docs/VISION.md principle 11): no goal question on first run. After the first rocket
// the factory guesses a goal from the repo's README and the player's own taps, and asks once on one card:
// "Looks like you want fewer bugs. Right?" Later parks it. The player can change it in Make it yours.
// Pure, so the sim and the live server deal the same card and the brain gets the same context.
import { z } from "zod";
import type { FactoryState, Move } from "./model";
import { DEFAULT_AREA, type BottleneckArea, type BrainSignal } from "./signals";

export const GoalId = z.enum(["fewer_bugs", "ship_faster", "first_users", "answer_users", "grow_usage"]);
export type GoalId = z.infer<typeof GoalId>;

export interface GoalDef {
  id: GoalId;
  label: string; // the button and menu text, short
  want: string; // "Looks like you want ___. Right?"
  areas: readonly BottleneckArea[]; // the bottleneck areas (shared/src/signals.ts) the brain weighs up for this goal
}

export const GOALS: Record<GoalId, GoalDef> = {
  fewer_bugs: { id: "fewer_bugs", label: "Fewer bugs", want: "fewer bugs", areas: ["quality", "speed"] },
  ship_faster: { id: "ship_faster", label: "Ship faster", want: "to ship faster", areas: ["ship", "speed"] },
  first_users: { id: "first_users", label: "First users", want: "your first users", areas: ["users", "feedback"] },
  answer_users: { id: "answer_users", label: "Answer users", want: "to answer your users", areas: ["feedback", "quality"] },
  grow_usage: { id: "grow_usage", label: "More usage", want: "more people using it", areas: ["users", "feedback"] },
};
export const GOAL_IDS = GoalId.options;

export const Goals = z.object({
  picks: z.array(GoalId).min(1).max(3), // most important first
  by: z.enum(["player", "inferred"]), // player = tapped it; inferred = the factory's guess, not confirmed yet
  at: z.number(),
  why: z.string().max(200).optional(), // the evidence behind an inferred guess
  rockets: z.number().int().nonnegative().optional(), // rockets launched when it was set, so the brain can tell a stalled goal
});
export type Goals = z.infer<typeof Goals>;

export interface GoalGuess { id: GoalId; score: number; why: string }

/** What the factory has seen the player do: Continues per card kind, and connected sources. */
export interface GoalEvidence {
  readme?: string;
  description?: string;
  /** Continue taps per Move kind (deckBook.yes rolled up by kind). */
  yes?: Partial<Record<string, number>>;
  sources?: readonly string[]; // connected source kinds: "sentry", "posthog", "email"
  rockets?: number;
}

const WORDS: Record<GoalId, RegExp> = {
  fewer_bugs: /\b(bugs?|crash(es|ing)?|errors?|stab(le|ility)|reliab(le|ility)|flaky|regressions?|sentry|fix(es)?)\b/gi,
  ship_faster: /\b(ship(ping)?|release|deploy(s|ment)?|ci|pipeline|velocity|faster|roadmap|wip|work in progress|alpha|beta)\b/gi,
  first_users: /\b(launch(ing)?|waitlist|sign ?ups?|early access|landing page|coming soon|beta testers?|pricing|get started)\b/gi,
  answer_users: /\b(support|feedback|help ?desk|customers?|tickets?|contact us|email us|discord|community)\b/gi,
  grow_usage: /\b(growth|retention|analytics|posthog|onboarding|activation|engagement|users?|active)\b/gi,
};
const TAP_GOAL: Record<string, GoalId> = { verify: "fewer_bugs", ship: "ship_faster", build: "ship_faster", unblock: "ship_faster", reply: "answer_users", input: "grow_usage" };
const SOURCE_GOAL: Record<string, GoalId> = { sentry: "fewer_bugs", posthog: "grow_usage", email: "answer_users", stripe: "first_users" };

/**
 * The factory's guess at what the player wants, best first. README words, the kinds of cards the player keeps
 * saying yes to, and the sources they plugged in each add a little. Every goal gets a score so the card can
 * offer runners-up; a tie falls back to the GOALS order, which starts with fewer bugs (true of almost any repo).
 */
export function inferGoals(e: GoalEvidence): GoalGuess[] {
  const text = `${e.description ?? ""}\n${(e.readme ?? "").slice(0, 8000)}`;
  const out = GOAL_IDS.map((id, i) => {
    const hits = text.match(WORDS[id])?.length ?? 0;
    const words = Math.min(3, hits * 0.5);
    const taps = Object.entries(e.yes ?? {}).reduce((n, [k, v]) => n + (TAP_GOAL[k] === id ? Math.min(3, (v ?? 0) * 0.5) : 0), 0);
    const plugged = (e.sources ?? []).some((s) => SOURCE_GOAL[s] === id) ? 1.5 : 0;
    const why = taps >= words && taps >= plugged && taps > 0 ? "Guessed from the cards you keep saying yes to."
      : plugged > words && plugged > 0 ? "Guessed from the sources you plugged in."
      : words > 0 ? "Guessed from your README." : "A good start for any repo.";
    return { id, score: words + taps + plugged - i * 0.01, why };
  });
  return out.sort((a, b) => b.score - a.score);
}

export const GOAL_MOVE_ID = "goal:pick";

/** One card, earned after the first rocket, while the player hasn't picked a goal yet. */
export function goalMove(state: Pick<FactoryState, "metrics">, goals: Goals | undefined, guesses: readonly GoalGuess[], now: number): Move | null {
  if (goals?.by === "player" || (state.metrics?.rockets ?? 0) < 1 || !guesses.length) return null;
  const [top, ...rest] = guesses;
  const pick = (g: GoalGuess, recommended: boolean) => ({
    id: `goal:${g.id}`,
    label: recommended ? `Yes, ${GOALS[g.id].label.toLowerCase()}` : GOALS[g.id].label,
    recommended,
    actions: [{ tool: "set_goals", args: { picks: [g.id] }, reason: `Weigh what's next toward ${GOALS[g.id].want}.` }],
  });
  return {
    id: GOAL_MOVE_ID,
    title: `Looks like you want ${GOALS[top.id].want}. Right?`,
    why: "Tell the factory what matters, and it hunts for whatever's blocking that.",
    because: top.why,
    kind: "automate",
    focus: "factory",
    grows: ["+1 GOAL"],
    createdAt: now,
    options: [pick(top, true), ...rest.slice(0, 2).map((g) => pick(g, false))],
  };
}

/** A goal card option (or a menu tap) as Goals. Anything that isn't a real goal id is ignored. */
export function goalsFromPick(picks: unknown, now: number, rockets?: number): Goals | null {
  const ok = Array.isArray(picks) ? [...new Set(picks.filter((p): p is GoalId => GoalId.safeParse(p).success))].slice(0, 3) : [];
  return ok.length ? { picks: ok, by: "player", at: now, ...(rockets !== undefined ? { rockets } : {}) } : null;
}

/** The plain sentence Spark's prompts already read as `goal`. */
export function goalText(goals: Goals | undefined): string | undefined {
  if (!goals) return undefined;
  const list = goals.picks.map((id) => GOALS[id].label.toLowerCase());
  return `${goals.by === "player" ? "The player's goal" : "The player's likely goal"}: ${list.join(", then ")}.`;
}

/**
 * How much a bottleneck area counts for this player: 1 with no goal, up to 1.5 when it serves their top goal
 * (half that lift for a guess they haven't confirmed). The brain multiplies a signal's weight by this, so
 * goals tilt the pick without hiding a real fire.
 */
export function goalWeight(goals: Goals | undefined, area: BottleneckArea): number {
  if (!goals) return 1;
  const trust = goals.by === "player" ? 1 : 0.5;
  const rank = goals.picks.findIndex((id) => GOALS[id].areas.includes(area));
  return rank === -1 ? 1 : 1 + trust * (rank === 0 ? 0.5 : rank === 1 ? 0.25 : 0.1);
}

/**
 * Signals tilted by the player's goals before the brain ranks them: severity times goalWeight for the signal's
 * area, capped at 1. A goal lifts a faint signal it cares about past a louder one it doesn't, but at most 1.5x,
 * so a real fire elsewhere still wins. Goal signals themselves (source "goals") are never tilted.
 */
export function tiltByGoals<T extends Pick<BrainSignal, "source" | "severity">>(signals: readonly T[], goals: Goals | undefined): T[] {
  if (!goals) return [...signals];
  return signals.map((s) => {
    const w = s.source === "goals" ? 1 : goalWeight(goals, DEFAULT_AREA[s.source]);
    return w === 1 ? s : { ...s, severity: Math.min(1, Number((s.severity * w).toFixed(3))) };
  });
}

/** The goals as context for the bottleneck brain: who set them, in order, and what they weigh up. */
export interface GoalContext {
  kind: "goals";
  confirmed: boolean;
  summary: string;
  goals: { id: GoalId; label: string; areas: readonly BottleneckArea[] }[];
}
export function goalContext(goals: Goals | undefined): GoalContext | null {
  if (!goals) return null;
  return {
    kind: "goals",
    confirmed: goals.by === "player",
    summary: goalText(goals)!,
    goals: goals.picks.map((id) => ({ id, label: GOALS[id].label, areas: GOALS[id].areas })),
  };
}
