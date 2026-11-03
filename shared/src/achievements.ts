// Achievements (docs/PRODUCT.md "Progression"): badges for real outcomes, never for clicking. Each one reads the
// factory state the player already sees (a merged PR, a launch nobody tapped, a bug the verify bay stopped, a
// lane that earned its permit) and pays out XP into progression. Pure rules, no storage: the web keeps one
// Earned record per player (localStorage, plus the account's `achievements` pref when signed in) and folds every
// factory state in with `check`.

import type { FactoryState } from "./model";
import { dayKey, daysBetween } from "./progression";

export interface Achievement {
  id: string;
  name: string;
  what: string; // one plain line: what you did
  icon: string; // HUD pixel icon name (the old React HUD drew these)
  xp: number; // paid into progression when it unlocks
  tier: "bronze" | "silver" | "gold";
  /** How far along you are, from this factory's state. Unlocks at have >= need. */
  progress: (s: FactoryState, ctx: CheckContext) => number;
  need: number;
}

/** What the factory state alone can't say. */
export interface CheckContext {
  streak: number; // days in a row the player made a real move (progression's best, or the record's own)
}

const rocketsOf = (s: FactoryState) => Math.max(s.metrics?.rockets ?? 0, s.science.red + s.science.green + s.science.grey + s.science.blue);
const automatedOf = (s: FactoryState) => Math.round((s.autonomy?.automated ?? 0) * (s.autonomy?.launches ?? 0));
const launchedOf = (s: FactoryState) => s.items.filter((i) => i.state === "launched");

/** Launches in a row with no scar on them, newest back. One that rode the rework belt ends the run. */
export function cleanRun(s: FactoryState): number {
  const when = (i: FactoryState["items"][number]) => i.orbit?.since ?? i.updatedAt;
  const launched = launchedOf(s).sort((a, b) => when(b) - when(a));
  let n = 0;
  for (const i of launched) {
    if (i.scars?.length) break;
    n++;
  }
  return n;
}

/** Bad fixes the verify bay stopped before they reached main. */
export function verifyCatches(s: FactoryState): number {
  const station = (s.stations ?? []).filter((st) => st.kind === "verify").reduce((n, st) => n + st.caughtThisWeek, 0);
  const scars = s.items.filter((i) => i.scars?.some((x) => x.station === "verify")).length;
  return Math.max(station, scars);
}

const connected = (s: FactoryState, kind: "sentry" | "posthog") => (s.sources ?? []).some((src) => src.kind === kind && src.state === "connected");

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-rocket", name: "Liftoff", what: "Your first PR shipped.", icon: "rocket", xp: 25, tier: "bronze", need: 1, progress: rocketsOf },
  { id: "first-research", name: "New check", what: "You researched a check. It runs on every PR now.", icon: "flask", xp: 25, tier: "bronze", need: 1, progress: (s) => s.research?.done.length ?? 0 },
  { id: "first-mine-sentry", name: "Error miner", what: "Sentry is connected. Real errors become ore.", icon: "ore", xp: 25, tier: "bronze", need: 1, progress: (s) => (connected(s, "sentry") ? 1 : 0) },
  { id: "first-mine-posthog", name: "Traffic miner", what: "PostHog is connected. Traffic drops become ore.", icon: "gauge", xp: 25, tier: "bronze", need: 1, progress: (s) => (connected(s, "posthog") ? 1 : 0) },
  { id: "caught-before-prod", name: "Caught it", what: "Checks stopped a bad fix before it reached your users.", icon: "shield", xp: 40, tier: "silver", need: 1, progress: verifyCatches },
  { id: "second-try", name: "Back on the belt", what: "A PR that got sent back came round again and shipped.", icon: "wrench", xp: 30, tier: "bronze", need: 1, progress: (s) => launchedOf(s).filter((i) => i.scars?.length).length },
  { id: "first-permit", name: "Permit to launch", what: "A lane earned a launch permit. Its PRs ship on their own.", icon: "key", xp: 50, tier: "silver", need: 1, progress: (s) => (s.autonomy?.districts.some((d) => d.permit) ? 1 : 0) },
  { id: "first-auto", name: "Hands off", what: "A PR launched on a permit. Nobody had to tap.", icon: "bot", xp: 60, tier: "silver", need: 1, progress: automatedOf },
  { id: "orbit-clear", name: "All clear", what: "A launch held for its whole orbit watch. No comeback.", icon: "eye", xp: 40, tier: "silver", need: 1, progress: (s) => launchedOf(s).filter((i) => i.orbit?.state === "clear").length },
  { id: "error-fixed", name: "Biter down", what: "A live Sentry error stopped after your fix shipped.", icon: "check", xp: 40, tier: "silver", need: 1, progress: (s) => s.metrics?.bitersKilled ?? 0 },
  { id: "ten-rockets", name: "Production line", what: "Ten PRs shipped.", icon: "box", xp: 60, tier: "silver", need: 10, progress: rocketsOf },
  { id: "clean-10", name: "Ten clean", what: "Ten launches in a row with no rework.", icon: "star", xp: 100, tier: "gold", need: 10, progress: cleanRun },
  { id: "streak-7", name: "Week on the line", what: "Seven days in a row of real moves.", icon: "tower", xp: 100, tier: "gold", need: 7, progress: (_s, ctx) => ctx.streak },
  { id: "lights-out", name: "Lights out", what: "The factory runs itself. You only check in.", icon: "bolt", xp: 150, tier: "gold", need: 1, progress: (s) => (s.autonomy?.level === "lights_out" ? 1 : 0) },
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

// ---- the player's record ----

export interface Earned {
  v: 1;
  got: Record<string, { at: number; repo?: string }>; // achievement id -> when, and in which factory
  streak: number; // the record's own day streak: days in a row with a factory open and something shipped or answered
  best: number;
  last: string | null; // last day (local YYYY-MM-DD) that counted
}

export const emptyEarned = (): Earned => ({ v: 1, got: {}, streak: 0, best: 0, last: null });

/** Loads whatever was stored; anything broken starts fresh. Unknown ids are dropped. */
export function parseEarned(raw: string | null | undefined): Earned {
  if (!raw) return emptyEarned();
  try {
    const e = JSON.parse(raw) as Earned;
    if (e?.v !== 1 || typeof e.got !== "object" || !e.got) return emptyEarned();
    const got = Object.fromEntries(Object.entries(e.got).filter(([id, g]) => achievementById(id) && Number.isFinite(g?.at) && g.at >= 0 && (g.repo === undefined || typeof g.repo === "string" && g.repo.length <= 256)));
    const count = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
    return { v: 1, got, streak: count(e.streak), best: Math.max(count(e.best), count(e.streak)), last: typeof e.last === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.last) ? e.last : null };
  } catch {
    return emptyEarned();
  }
}

/** Two copies of one player's record (this browser, the account) → one. Earliest unlock wins, best streak wins. */
export function mergeEarned(a: Earned, b: Earned): Earned {
  const got = { ...a.got };
  for (const [id, g] of Object.entries(b.got)) if (!got[id] || g.at < got[id].at) got[id] = g;
  const newer = (a.last ?? "") >= (b.last ?? "") ? a : b;
  return { v: 1, got, streak: newer.streak, best: Math.max(a.best, b.best), last: newer.last };
}


/** A real move today (a ship, a card answered): the record's streak goes on or starts over. */
export function markDay(e: Earned, now: number): Earned {
  const key = dayKey(now);
  if (e.last === key) return e;
  const streak = e.last && daysBetween(e.last, key) === 1 ? e.streak + 1 : 1;
  return { ...e, streak, best: Math.max(e.best, streak), last: key };
}

export interface Check {
  earned: Earned;
  fresh: Achievement[]; // unlocked just now, in catalog order
}

/**
 * Fold one factory state in. Achievements are about outcomes, so a factory that already shipped gets its
 * badges the first time you open it. `streak` is progression's best streak when it's around.
 */
export function check(e: Earned, repo: string, s: FactoryState, now: number, streak = 0): Check {
  const ctx: CheckContext = { streak: Math.max(streak, e.best) };
  const fresh = ACHIEVEMENTS.filter((a) => !e.got[a.id] && a.progress(s, ctx) >= a.need);
  if (!fresh.length) return { earned: e, fresh };
  const got = { ...e.got };
  for (const a of fresh) got[a.id] = { at: now, repo };
  return { earned: { ...e, got }, fresh };
}

/** Every achievement with how far along this factory is, for the panel. Earned first, then closest. */
export function board(e: Earned, s: FactoryState | null, streak = 0) {
  const ctx: CheckContext = { streak: Math.max(streak, e.best) };
  return ACHIEVEMENTS.map((a) => {
    const got = e.got[a.id];
    const have = got ? a.need : s ? Math.min(a.need, a.progress(s, ctx)) : 0;
    return { a, got, have, into: have / a.need };
  }).sort((x, y) => (x.got ? 0 : 1) - (y.got ? 0 : 1) || (x.got && y.got ? x.got.at - y.got.at : y.into - x.into));
}
