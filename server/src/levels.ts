// Autonomy levels on live factories (docs/PRODUCT.md "Autonomy is earned"): Advisor → Floor → Build → Lights out.
// Earned only from verified outcomes the permit book already counts: clean ships (every gauntlet station passed,
// zero rework), launch permits, and time with no escaped defect. An escaped defect (orbit watch) drops the
// factory back to Advisor. Pure rules; the Factory DO stores the ladder inside the permit book, behind the
// "autonomy" flag. No level ever merges: merging stays with the player's Launch card or a lane's permit.

import type { Autonomy, AutonomyLevel, Move } from "@shiptorio/shared";
import type { PermitBook } from "./permits";

export interface Ladder {
  level: AutonomyLevel;
  since: number; // when the factory reached this level (or last dropped)
  clean: number; // clean ships since the last escaped defect
  offeredAt?: number; // clean count when the player last said "not yet" to the next level
  lastEscape?: number;
}

export const ORDER: AutonomyLevel[] = ["advisor", "floor", "build", "lights_out"];
export const FLOOR_SHIPS = 3;
export const BUILD_SHIPS = 8;
export const LIGHTS_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;
const ASK_AGAIN = 3; // clean ships after a "not yet" before the card asks again

export const emptyLadder = (now = Date.now()): Ladder => ({ level: "advisor", since: now, clean: 0 });
export const ladderOf = (book: PermitBook, now = Date.now()): Ladder => book.ladder ?? emptyLadder(now);
export const rank = (level: AutonomyLevel) => ORDER.indexOf(level);

const permits = (book: PermitBook) => Object.values(book.lanes).filter((r) => r.permit).length;
const shippedLanes = (book: PermitBook) => Object.values(book.lanes).filter((r) => r.shipped > 0).length;

/** What it takes to reach the next level, and how far along the factory is. null at the top. */
export function nextStep(book: PermitBook, now = Date.now()): (NonNullable<Autonomy["next"]> & { ready: boolean }) | null {
  const l = ladderOf(book, now);
  if (l.level === "advisor") return { level: "floor", have: Math.min(l.clean, FLOOR_SHIPS), need: FLOOR_SHIPS, label: "PRs shipped clean", ready: l.clean >= FLOOR_SHIPS };
  if (l.level === "floor") {
    const ready = l.clean >= BUILD_SHIPS && permits(book) >= 1;
    return { level: "build", have: Math.min(l.clean, BUILD_SHIPS), need: BUILD_SHIPS, label: permits(book) ? "PRs shipped clean" : "PRs shipped clean, plus one launch permit", ready };
  }
  if (l.level === "build") {
    const days = Math.floor((now - l.since) / DAY);
    const most = permits(book) >= 2 && permits(book) * 2 >= shippedLanes(book);
    return { level: "lights_out", have: Math.min(days, LIGHTS_DAYS), need: LIGHTS_DAYS, label: most ? "days at Build with no escaped defect" : "days at Build with no escaped defect, plus permits on most lanes", ready: days >= LIGHTS_DAYS && most };
  }
  return null;
}

/** The level ready for its card, if any: earned, and not snoozed. */
export function levelReady(book: PermitBook, now = Date.now()): AutonomyLevel | undefined {
  const l = ladderOf(book, now);
  const next = nextStep(book, now);
  if (!next?.ready) return undefined;
  if (l.offeredAt !== undefined && l.clean < l.offeredAt + ASK_AGAIN) return undefined;
  return next.level;
}

/** A clean ship counts toward the next level. */
export const countClean = (book: PermitBook, now = Date.now()): PermitBook => {
  const l = ladderOf(book, now);
  return { ...book, ladder: { ...l, clean: l.clean + 1 } };
};

/** The player said yes on the level card. Only the earned next level is granted. */
export function grantLevel(book: PermitBook, level: AutonomyLevel, now = Date.now()): PermitBook | null {
  const next = nextStep(book, now);
  if (!next?.ready || next.level !== level) return null;
  return { ...book, ladder: { ...ladderOf(book, now), level, since: now, offeredAt: undefined } };
}

/** The player turned the level down. Down only: going up is earned. */
export function lowerLevel(book: PermitBook, level: AutonomyLevel, now = Date.now()): PermitBook | null {
  const l = ladderOf(book, now);
  if (rank(level) >= rank(l.level)) return null;
  return { ...book, ladder: { ...l, level, since: now, offeredAt: l.clean } };
}

export const snoozeLevel = (book: PermitBook, now = Date.now()): PermitBook => {
  const l = ladderOf(book, now);
  return { ...book, ladder: { ...l, offeredAt: l.clean } };
};

/** An escaped defect (orbit watch tripped): back to Advisor, the clean count starts over. */
export function escape(book: PermitBook, now = Date.now()): { book: PermitBook; dropped: AutonomyLevel | null } {
  const l = ladderOf(book, now);
  return { book: { ...book, ladder: { level: "advisor", since: now, clean: 0, lastEscape: now } }, dropped: l.level === "advisor" ? null : l.level };
}

export const LEVEL_NAME: Record<AutonomyLevel, string> = { advisor: "Advisor", floor: "Floor", build: "Build", lights_out: "Lights out" };

/** What Spark may do on its own at each level, live. Merging is never on this list. */
export const LEVEL_DOES: Record<AutonomyLevel, string[]> = {
  advisor: ["The planner reads, sorts and suggests. Every card waits for you"],
  floor: ["The planner starts plans on its own: it reads the issue and the code and proposes files and steps", "No code changes until you approve the plan"],
  build: ["The planner approves its own plans, so your agents start building", "A PR that fails a check goes back to the builder with its scar, while it still can (3 scars and it's yours)", "Every PR still runs every station. Merging still needs you or a lane's permit"],
  lights_out: ["The planner also takes the launch permits your lanes earn", "The factory runs while you're away, inside your budget", "Merging still only happens on a permit, after every station passes"],
};

export function levelMove(book: PermitBook, level: AutonomyLevel, now = Date.now()): Move {
  const l = ladderOf(book, now);
  const name = LEVEL_NAME[level];
  const title = level === "floor" ? `${l.clean} PRs shipped clean. Let the planner start plans on its own?`
    : level === "build" ? `${l.clean} PRs shipped clean and a lane has a permit. Let the planner start builds on its own?`
    : `A week at Build with no escaped defect. Go lights out?`;
  return {
    id: crypto.randomUUID(),
    title,
    why: `${name} is earned from what actually shipped: every one of those PRs passed every station the first time. Turn it back down anytime in Make it yours. An escaped defect drops it to Advisor on its own.`,
    stage: "build",
    kind: "automate",
    grows: ["+1 AUTONOMY", "FEWER CARDS"],
    createdAt: now,
    plan: [...LEVEL_DOES[level], "You can turn it back down anytime"],
    options: [
      { id: "allow", label: `Unlock ${name}`, recommended: true, actions: [{ tool: "set_autonomy", args: { level }, reason: `${l.clean} clean ships since the last escaped defect.` }] },
      { id: "not_yet", label: "Not yet", recommended: false, actions: [] },
    ],
  };
}
