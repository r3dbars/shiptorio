// Launch permits (docs/PRODUCT.md "Autonomy is earned"): a lane of work that keeps shipping clean earns the
// right to launch on its own. Clean = every gauntlet station passed with zero rework. One rework or failure
// in the lane revokes its permit and resets the streak. Pure rules; the Factory DO stores the book.

import type { Autonomy, DistrictTrust, Item, Move } from "@shiptorio/shared";
import { countClean, ladderOf, nextStep, type Ladder } from "./levels";

const DOCS_FILE = /\.(md|mdx|txt)$|(^|\/)docs\//i;

export interface LaneRecord {
  lane: string;
  streak: number; // clean ships in a row
  shipped: number;
  reworks: number;
  permit: boolean;
  autoLaunched: number;
  offeredAt?: number; // streak when the player last said "not yet"
}

export interface PermitBook {
  lanes: Record<string, LaneRecord>;
  launches: number; // every rocket since permits started counting
  autoLaunches: number; // rockets that launched on a permit
  ladder?: Ladder; // factory-wide autonomy level (src/levels.ts), behind the "autonomy" flag
}

export const emptyBook = (): PermitBook => ({ lanes: {}, launches: 0, autoLaunches: 0 });

/**
 * The lane a PR's work belongs to: "docs" when every file is docs, else the one top-level folder all files
 * share. Root files and cross-folder PRs have no lane, so they always wait for the player.
 */
export function laneOf(files: string[]): string | null {
  if (!files.length) return null;
  if (files.every((f) => DOCS_FILE.test(f))) return "docs";
  const tops = new Set(files.map((f) => (f.includes("/") ? f.split("/")[0] : "")));
  if (tops.size !== 1 || tops.has("")) return null;
  return [...tops][0];
}

export const riskOf = (lane: string): DistrictTrust["risk"] => (lane === "docs" ? "low" : "medium");
/** Clean ships in a row before a lane is offered its permit. Thresholds are tuning, not law. */
export const needFor = (lane: string): number => (riskOf(lane) === "low" ? 5 : 10);
/** After "not yet", ask again this many clean ships later. */
const ASK_AGAIN = 3;

const record = (book: PermitBook, lane: string): LaneRecord =>
  book.lanes[lane] ?? { lane, streak: 0, shipped: 0, reworks: 0, permit: false, autoLaunched: 0 };

/** A clean ship has a passed gauntlet and no scars. Overrules and outside merges don't count. */
export const shippedClean = (item: Item): boolean =>
  item.inspection?.state === "passed" && !item.scars?.length;

/** A rocket launched. Returns the updated book. */
export function recordShip(book: PermitBook, item: Item, auto: boolean): PermitBook {
  const clean = shippedClean(item);
  const next: PermitBook = { ...(clean ? countClean(book) : book), lanes: { ...book.lanes }, launches: book.launches + 1, autoLaunches: book.autoLaunches + (auto ? 1 : 0) };
  if (!item.lane) return next;
  const r = record(book, item.lane);
  next.lanes[item.lane] = { ...r, shipped: r.shipped + 1, streak: clean ? r.streak + 1 : 0, autoLaunched: r.autoLaunched + (auto ? 1 : 0) };
  return next;
}

/** A station sent work in this lane back. The streak resets and any permit is revoked. */
export function recordRework(book: PermitBook, lane: string): { book: PermitBook; revoked: boolean } {
  const r = record(book, lane);
  const revoked = r.permit;
  return { book: { ...book, lanes: { ...book.lanes, [lane]: { ...r, streak: 0, reworks: r.reworks + 1, permit: false, offeredAt: undefined } } }, revoked };
}

// Turned off by hand, the card waits ASK_AGAIN more clean ships before it asks again (same as a snooze).
export function setPermit(book: PermitBook, lane: string, permit: boolean): PermitBook {
  const r = record(book, lane);
  return { ...book, lanes: { ...book.lanes, [lane]: { ...r, permit, offeredAt: permit ? undefined : r.streak } } };
}

export function snooze(book: PermitBook, lane: string): PermitBook {
  const r = record(book, lane);
  return { ...book, lanes: { ...book.lanes, [lane]: { ...r, offeredAt: r.streak } } };
}

export const earned = (r: LaneRecord): boolean => r.streak >= needFor(r.lane);

/** The lane ready for its permit card, if any. */
export function permitReady(book: PermitBook): LaneRecord | undefined {
  return Object.values(book.lanes).find((r) => !r.permit && earned(r) && (r.offeredAt === undefined || r.streak >= r.offeredAt + ASK_AGAIN));
}

/** May this PR launch without the player? Only on a permit, only with a clean gauntlet on this head. */
export function mayAutoLaunch(book: PermitBook, item: Item): boolean {
  return !!item.lane && !!book.lanes[item.lane]?.permit && item.state === "on_pad" && shippedClean(item);
}

const laneName = (lane: string) => (lane === "docs" ? "docs" : `/${lane}`);

export function permitMove(r: LaneRecord, now = Date.now()): Move {
  const name = laneName(r.lane);
  return {
    id: crypto.randomUUID(),
    title: `${r.streak} ${name} PRs shipped clean, zero rework. Let ${name} ship on their own?`,
    why: `Every one passed Checks and Review the first time. With a permit, ${name} PRs that pass every station launch without waiting on you.`,
    stage: "pad",
    kind: "automate",
    focus: "gate-1",
    grows: ["+1 AUTOMATION", "FEWER CARDS"],
    createdAt: now,
    plan: [
      `${name} PRs that pass every station merge on their own`,
      "Anything that needs rework still comes to you",
      "One rework or failure in this lane takes the permit away",
      "You can turn it off anytime",
    ],
    options: [
      { id: "allow", label: "Allow", recommended: true, actions: [{ tool: "set_autonomy", args: { district: r.lane, permit: true }, reason: `${r.streak} clean ships in a row in ${name}.` }] },
      { id: "not_yet", label: "Not yet", recommended: false, actions: [] },
    ],
  };
}

/**
 * What the HUD shows: per-lane trust and permits, and how much of the shipping runs itself. Levels only with the
 * "autonomy" flag, permits only with the "permits" flag: while they're parked a permit stored earlier never shows.
 */
export function autonomyView(book: PermitBook, { levels = false, permits = false } = {}, now = Date.now()): Autonomy {
  const lanes = Object.values(book.lanes);
  const step = levels ? nextStep(book, now) : null;
  return {
    level: levels ? ladderOf(book, now).level : "advisor",
    districts: lanes.map((r) => ({ district: r.lane, score: Math.min(1, r.streak / needFor(r.lane)), risk: riskOf(r.lane), permit: permits && r.permit })),
    next: step && { level: step.level, have: step.have, need: step.need, label: step.label },
    ranAlone: book.autoLaunches,
    automated: book.launches ? book.autoLaunches / book.launches : 0,
    launches: book.launches,
  };
}
