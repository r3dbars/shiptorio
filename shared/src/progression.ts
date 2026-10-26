// Progression (docs/PRODUCT.md "Progression"): a reason to come back tomorrow. XP comes from real results,
// never from clicking: ships, clean ships, launches that held in orbit, launches that ran on their own, new
// checks, check-in cards cleared. Levels, a daily streak and unlocks carry across days and across repos.
// The day log keeps each day's deck size, so the end-of-day summary can show tomorrow's deck shrinking as
// trust grows. Pure rules, no storage: the web keeps one Progress per player and folds factory states in.

import type { FactoryState } from "./model";

export const XP = {
  ship: 10, // a PR merged
  clean: 5, // ...and it never went back on the rework belt
  orbit: 10, // ...and it held for the whole orbit watch
  automated: 15, // ...and it launched on a permit, nobody had to tap
  check: 30, // a new check researched: the line verifies more from now on
  card: 2, // a check-in card answered
  deckCleared: 15, // every card answered, nothing waiting on you
  streakDay: 5, // first real move of the day, × streak length (capped at 7)
} as const;

export type XpReason = keyof typeof XP;

/** What one repo's factory has already paid out, so a reload or reconnect never pays twice. */
export interface RepoSeen {
  rockets: number;
  automated: number;
  checks: number;
  paid: string[]; // item ids already paid a clean / orbit bonus, as "clean:id" / "orbit:id"
}

export interface DayLog {
  day: string; // local YYYY-MM-DD
  xp: number;
  ships: number;
  cards: number;
  deck: number; // cards waiting the first time you looked that day
  automated?: number; // share of launches that ran on their own, end of day (0..1)
}

export interface Progress {
  v: 1;
  xp: number;
  streak: number; // days in a row with at least one real move
  best: number;
  freezes: number; // a missed day costs a freeze instead of the streak; one earned per 7-day run, max 2
  last: string | null; // the last day that counted toward the streak
  days: DayLog[]; // newest last, 30 kept
  seen: Record<string, RepoSeen>;
  unlocked: string[]; // unlock ids, in the order earned
  equip: Record<string, boolean>; // cosmetics switched on
}

export const emptyProgress = (): Progress => ({ v: 1, xp: 0, streak: 0, best: 0, freezes: 0, last: null, days: [], seen: {}, unlocked: [], equip: {} });

/** Loads whatever was stored; anything broken or from an older shape starts fresh. */
export function parseProgress(raw: string | null | undefined): Progress {
  if (!raw) return emptyProgress();
  try {
    const p = JSON.parse(raw) as Progress;
    if (p?.v !== 1 || typeof p.xp !== "number" || !Array.isArray(p.days)) return emptyProgress();
    return { ...emptyProgress(), ...p };
  } catch {
    return emptyProgress();
  }
}

// ---- days ----

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayNum = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);

/** Today's log line, made on first touch with the deck size you walked in to. */
function today(p: Progress, now: number, deck: number): [Progress, DayLog] {
  const key = dayKey(now);
  const last = p.days[p.days.length - 1];
  if (last?.day === key) return [p, last];
  const log: DayLog = { day: key, xp: 0, ships: 0, cards: 0, deck };
  return [{ ...p, days: [...p.days, log].slice(-30) }, log];
}

/** Is the streak still alive today? (It shows 0 once a day is missed with no freeze to spend.) */
export function liveStreak(p: Progress, now: number): number {
  if (!p.last) return 0;
  const gap = daysBetween(p.last, dayKey(now));
  return gap <= 1 || gap - 1 <= p.freezes ? p.streak : 0;
}

// ---- levels ----

/** Total XP to reach a level: 0, 50, 150, 300, 500, 750... each level asks 50 more than the last. */
export const xpForLevel = (level: number) => 25 * level * (level - 1);

export function levelOf(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, title: TITLES[Math.min(level, TITLES.length) - 1], have: xp - from, need: to - from, into: (xp - from) / (to - from) };
}

const TITLES = ["Tinkerer", "Mechanic", "Engineer", "Line lead", "Foreman", "Plant manager", "Chief engineer", "Industrialist", "Lights-out legend"];

// ---- unlocks ----

export interface Unlock {
  id: string;
  name: string;
  what: string; // one plain line
  icon: string; // HUD pixel icon (web/src/ui/icons.tsx)
  level?: number; // reach this level
  streak?: number; // or keep a streak this long
  cosmetic?: boolean; // can be switched on and off
}

export const UNLOCKS: Unlock[] = [
  { id: "glass-lake", name: "Glass lake", what: "A glass-walled lake set into your island, for a rainy day.", icon: "drop", streak: 3, cosmetic: true },
  { id: "morning-brief", name: "Morning brief", what: "Each new day opens with yesterday's ships and today's deck.", icon: "sun", level: 2 },
  { id: "lanterns", name: "Island lanterns", what: "Warm lanterns along the island rim, lit for every day of your streak.", icon: "flame", level: 3, cosmetic: true },
  { id: "freeze", name: "Streak shield", what: "Miss a day and a shield takes the hit instead of your streak. One per 7-day run.", icon: "shield", streak: 7 },
  { id: "gold-pad", name: "Gold launch pad", what: "Your launch pad's trim turns gold.", icon: "rocket", level: 5, cosmetic: true },
];

const earned = (u: Unlock, level: number, best: number) => (u.level !== undefined && level >= u.level) || (u.streak !== undefined && best >= u.streak);

/** The next thing you'll get, and how far off it is. */
export function nextUnlock(p: Progress) {
  const { level } = levelOf(p.xp);
  const left = UNLOCKS.filter((u) => !p.unlocked.includes(u.id));
  return left
    .map((u) => ({ unlock: u, gap: u.level !== undefined ? `Level ${u.level}` : `${u.streak}-day streak`, dist: u.level !== undefined ? (u.level - level) * 3 : (u.streak ?? 0) - p.best }))
    .sort((a, b) => a.dist - b.dist)[0];
}

// ---- folding in what happened ----

export interface Gain {
  reason: XpReason;
  xp: number;
  text: string;
}

export interface Step {
  progress: Progress;
  gains: Gain[];
  levelUp?: { level: number; title: string };
  unlocked: Unlock[];
  streakUp?: number; // the streak just grew to this
}

/** Pay out XP, handle day rollover and the streak, award unlocks. Every other function funnels into this. */
function award(p0: Progress, gains: Gain[], now: number, deck: number, ships = 0, cards = 0): Step {
  let [p] = today(p0, now, deck);
  if (!gains.length) return { progress: p, gains, unlocked: [] };
  const key = dayKey(now);
  let streakUp: number | undefined;
  let freezes = p.freezes;
  if (p.last !== key) {
    // first real move today: the streak goes on, or a shield covers the gap, or it starts over
    const gap = p.last ? daysBetween(p.last, key) : Infinity;
    const missed = gap - 1;
    let streak = 1;
    if (gap === 1) streak = p.streak + 1;
    else if (missed >= 1 && missed <= freezes && p.unlocked.includes("freeze")) {
      freezes -= missed;
      streak = p.streak + 1;
    }
    if (streak % 7 === 0 && p.unlocked.includes("freeze")) freezes = Math.min(2, freezes + 1);
    gains = [...gains, { reason: "streakDay", xp: XP.streakDay * Math.min(7, streak), text: streak > 1 ? `Day ${streak} in a row` : "First move today" }];
    streakUp = streak;
    p = { ...p, streak, best: Math.max(p.best, streak), last: key, freezes };
  }
  const xp = gains.reduce((n, g) => n + g.xp, 0);
  const before = levelOf(p.xp);
  const days = p.days.map((d) => (d.day === key ? { ...d, xp: d.xp + xp, ships: d.ships + ships, cards: d.cards + cards } : d));
  p = { ...p, xp: p.xp + xp, days };
  const after = levelOf(p.xp);
  const fresh = UNLOCKS.filter((u) => !p.unlocked.includes(u.id) && earned(u, after.level, p.best));
  if (fresh.length) {
    p = {
      ...p,
      unlocked: [...p.unlocked, ...fresh.map((u) => u.id)],
      equip: { ...p.equip, ...Object.fromEntries(fresh.filter((u) => u.cosmetic).map((u) => [u.id, true])) },
      freezes: fresh.some((u) => u.id === "freeze") ? Math.max(p.freezes, 1) : p.freezes, // the shield's first charge
    };
  }
  return {
    progress: p,
    gains,
    unlocked: fresh,
    streakUp,
    levelUp: after.level > before.level ? { level: after.level, title: after.title } : undefined,
  };
}

const automatedCount = (s: FactoryState) => Math.round((s.autonomy?.automated ?? 0) * (s.autonomy?.launches ?? 0));
const rocketsOf = (s: FactoryState) => Math.max(s.metrics?.rockets ?? 0, s.science.red + s.science.green + s.science.grey + s.science.blue);

/**
 * Fold one factory state in. The first look at a repo only records where it stands (no back pay), and a
 * counter that goes backwards (a sim restart, a reset) just moves the baseline.
 */
export function observe(p0: Progress, repo: string, s: FactoryState, now: number): Step {
  const deck = s.deck?.length ?? (s.move ? 1 : 0);
  const was = p0.seen[repo];
  const launched = s.items.filter((i) => i.state === "launched");
  const now0: RepoSeen = { rockets: rocketsOf(s), automated: automatedCount(s), checks: s.research?.done.length ?? 0, paid: was?.paid ?? [] };
  if (!was) {
    const paid = launched.flatMap((i) => [`clean:${i.id}`, ...(i.orbit?.state === "clear" ? [`orbit:${i.id}`] : [])]);
    const [p] = today(p0, now, deck);
    return { progress: { ...p, seen: { ...p.seen, [repo]: { ...now0, paid: paid.slice(-200) } } }, gains: [], unlocked: [] };
  }
  const gains: Gain[] = [];
  const ships = Math.max(0, now0.rockets - was.rockets);
  const auto = Math.max(0, now0.automated - was.automated);
  const checks = Math.max(0, now0.checks - was.checks);
  if (ships) gains.push({ reason: "ship", xp: XP.ship * ships, text: ships > 1 ? `${ships} PRs shipped` : "PR shipped" });
  if (auto) gains.push({ reason: "automated", xp: XP.automated * auto, text: auto > 1 ? `${auto} launched on their own` : "Launched on its own" });
  if (checks) gains.push({ reason: "check", xp: XP.check * checks, text: checks > 1 ? `${checks} new checks` : "New check on the line" });
  const paid = new Set(was.paid);
  for (const i of launched) {
    if (!paid.has(`clean:${i.id}`)) {
      paid.add(`clean:${i.id}`);
      if (!i.scars?.length) gains.push({ reason: "clean", xp: XP.clean, text: "Clean ship, no rework" });
    }
    if (i.orbit?.state === "clear" && !paid.has(`orbit:${i.id}`)) {
      paid.add(`orbit:${i.id}`);
      gains.push({ reason: "orbit", xp: XP.orbit, text: "Held in orbit for 24h" });
    }
  }
  const seen: RepoSeen = { ...now0, paid: [...paid].slice(-200) };
  const step = award({ ...p0, seen: { ...p0.seen, [repo]: seen } }, gains, now, deck, ships);
  // remember how much of the shipping ran itself, for the day log
  const launches = s.autonomy?.launches;
  if (launches) {
    const key = dayKey(now);
    step.progress = { ...step.progress, days: step.progress.days.map((d) => (d.day === key ? { ...d, automated: s.autonomy?.automated ?? 0 } : d)) };
  }
  return step;
}

/** A check-in card answered (any direction counts: a "never, and why" is a real decision too). */
export function answered(p: Progress, now: number, left: number): Step {
  const gains: Gain[] = [{ reason: "card", xp: XP.card, text: "Card answered" }];
  if (left === 0) gains.push({ reason: "deckCleared", xp: XP.deckCleared, text: "Deck cleared, nothing waits on you" });
  return award(p, gains, now, left + 1, 0, 1);
}

/** Just open the day (no XP): makes today's log with the deck you walked in to. */
export const openDay = (p: Progress, now: number, deck: number) => today(p, now, deck)[0];

// ---- the end-of-day summary ----

export interface DaySummary {
  today: DayLog;
  yesterday?: DayLog;
  trend: DayLog[]; // last 7 days you played, oldest first
  shrink: number | null; // cards fewer than a week ago (or your first day); null until there's two days
}

export function summary(p: Progress, now: number): DaySummary {
  const key = dayKey(now);
  const t = p.days.find((d) => d.day === key) ?? { day: key, xp: 0, ships: 0, cards: 0, deck: 0 };
  const before = p.days.filter((d) => d.day < key);
  const trend = [...before.slice(-6), t];
  const first = trend[0];
  return { today: t, yesterday: before[before.length - 1], trend, shrink: trend.length > 1 ? first.deck - t.deck : null };
}
