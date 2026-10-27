// Coming back (docs/GAMEPLAY-PICKS.md r3-return B, r4-pull B): after a long enough gap, the first thing you see is
// what the factory really shipped while you were gone, and, when a launch is waiting, the card that asks for it.
// Only real events: launched items whose launch time falls inside the gap. Nothing shipped, nothing shown.

import { continueOption, type FactoryState, type Item, type Move } from "@shiptorio/shared";

export const AWAY_MS = 6 * 3600_000; // a gap this long counts as coming back
export const LAPSE_MAX = 6; // the most rockets the time-lapse flies; the counter still ticks to the real total
const KEY = "shiptorio:last-seen";

const UNIT: Record<string, number> = { m: 60_000, h: 3600_000, d: 86_400_000 };

/** ?away=12 (hours), ?away=90m, ?away=2d: pretend the last visit was that long ago. 0 or junk: no comeback. */
export function parseAway(v: string | null): number | null {
  const m = v && /^(\d+(?:\.\d+)?)([mhd]?)$/.exec(v.trim());
  if (!m) return null;
  const ms = Number(m[1]) * UNIT[m[2] || "h"];
  return ms > 0 ? ms : null;
}

/** When the player was last here, if it was long enough ago to count as coming back. */
export function awaySince(search: string, stored: number | null, now: number): number | null {
  const q = new URLSearchParams(search);
  if (q.has("away")) {
    const ms = parseAway(q.get("away"));
    return ms === null ? null : now - ms;
  }
  return stored !== null && now - stored >= AWAY_MS ? stored : null;
}

export function readSeen(scope: string): number | null {
  try {
    const n = Number(localStorage.getItem(`${KEY}:${scope}`));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function markSeen(scope: string, now = Date.now()) {
  try {
    localStorage.setItem(`${KEY}:${scope}`, String(now));
  } catch {
    // private window: every visit is a first visit
  }
}

export const shippedAt = (i: Item) => i.orbit?.since ?? i.updatedAt;

export const isLaunchCard = (m: Move) => continueOption(m).actions.some((a) => a.tool === "request_merge");

export interface AwayReport {
  shipped: Item[]; // launched while away, oldest first
  launch: Move | null; // a launch card waiting on the player
}

export function whileAway(state: FactoryState, since: number, now: number): AwayReport {
  const shipped = state.items
    .filter((i) => i.state === "launched" && shippedAt(i) > since && shippedAt(i) <= now)
    .sort((a, b) => shippedAt(a) - shippedAt(b));
  return { shipped, launch: launchWaiting(state) };
}

/** A launch card on the deck whose PR really is on the pad (r4-pull: "#143 passed every check. Hold to launch.") */
export function launchWaiting(state: FactoryState): Move | null {
  const deck = state.deck ?? (state.move ? [state.move] : []);
  return deck.find((m) => isLaunchCard(m) && state.items.some((i) => i.id === m.itemId && i.state === "on_pad")) ?? null;
}

/** The Shipped counter mid time-lapse: it starts back where it stood when you left and reaches the real total
 * as the last replayed rocket goes. */
export function shippedShown(real: number, total: number, flown: number, landed: number): number {
  if (flown <= 0 || landed >= flown) return real;
  return Math.max(0, real - Math.round(total * (1 - landed / flown)));
}
