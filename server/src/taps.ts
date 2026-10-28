// What players say yes and no to (docs/context/taps.md). Every card the factory offers gets one row in
// D1 card_taps: what it was, what the planner suggested and why, what the factory saw at the time, what the
// player did (Continue, another option, Later, Never + its chip, or nothing), how long they took, and later
// whether the work they approved shipped clean or came back. tapsReport() turns the rows into the eval the
// /admin/taps page shows; tapSignals() (signals/taps.ts) and tapBrief() feed it back to the brain.
//
// Privacy: the self-hoster's own D1, no player login, titles and reasons redacted, 90-day retention, and
// TAPS_LOG=off turns the whole log off.

import type { Move } from "@shiptorio/shared";
import { redactText } from "./redact";

export const TAPS_RETENTION_MS = 90 * 86400000;

/** auto: the factory answered it on its own, after the player taught it (docs/LEARN.md). */
export type TapAction = "continue" | "other" | "later" | "never" | "gone" | "auto";
export type NeverReason = "once" | "kind" | "spark" | "wrong";
export type TapOutcome = "shipped_clean" | "shipped_after_rework" | "rework" | "came_back";

export interface TapRow {
  id?: number;
  repo: string;
  card_id: string;
  item_id: string | null;
  kind: string;
  scope: string;
  play: string | null;
  attention: string | null;
  title: string;
  suggested: string | null;
  because: string | null;
  by: "spark" | "rule";
  context: string | null;
  shown_at: number;
  decided_at: number | null;
  action: TapAction | null;
  option_id: string | null;
  reason: NeverReason | null;
  outcome: TapOutcome | null;
  outcome_at: number | null;
}

export const tapsEnabled = (env: { TAPS_LOG?: string }) => env.TAPS_LOG !== "off";

/** What the factory saw when it dealt the card. Kept small: it is for reading back, not replaying. */
export interface TapContext {
  bottleneck?: { stage: string; wip: number; ageMinutes: number } | null;
  /** The game master's one-line reason for the deck order it picked. */
  rank?: string;
  /** Fresh bottleneck-brain signal ids and severities, once the brain deals cards. */
  signals?: { id: string; severity: number }[];
}

/** The row for a card being offered. Pure. */
export function offeredRow(repo: string, move: Move, scope: string, by: "spark" | "rule", now: number, context?: TapContext, play?: string): TapRow {
  return {
    repo, card_id: move.id, item_id: move.itemId ?? null, kind: move.kind ?? "unblock", scope, play: play ?? null,
    attention: move.attention ?? null, title: redactText(move.title).slice(0, 120),
    suggested: move.options.find(o => o.recommended)?.id ?? null,
    because: move.because ? redactText(move.because).slice(0, 200) : null, by,
    context: context ? redactText(JSON.stringify(context)).slice(0, 2000) : null,
    shown_at: now, decided_at: null, action: null, option_id: null, reason: null, outcome: null, outcome_at: null,
  };
}

const COLUMNS = ["repo", "card_id", "item_id", "kind", "scope", "play", "attention", "title", "suggested", "because", "by", "context", "shown_at"] as const;

/** Logs newly offered cards. A card that already has an open (untapped) row keeps it, so re-renders don't double count. */
export async function offerCards(db: D1Database, rows: TapRow[]): Promise<void> {
  if (!rows.length) return;
  const sql = `INSERT INTO card_taps (${COLUMNS.join(", ")}) SELECT ${COLUMNS.map(() => "?").join(", ")} WHERE NOT EXISTS (SELECT 1 FROM card_taps WHERE repo = ? AND card_id = ? AND decided_at IS NULL)`;
  for (const r of rows) await db.prepare(sql).bind(...COLUMNS.map(c => r[c]), r.repo, r.card_id).run();
}

/** Card ids that are on the deck without a tap yet, so a cold Durable Object knows what it already logged. */
export async function openCards(db: D1Database, repo: string): Promise<string[]> {
  return (await db.prepare("SELECT card_id FROM card_taps WHERE repo = ? AND decided_at IS NULL").bind(repo).all<{ card_id: string }>()).results.map(r => r.card_id);
}

/** Cards that left the deck untapped: the work moved on, or the player never looked. */
export async function closeGone(db: D1Database, repo: string, cardIds: string[], now: number): Promise<void> {
  if (!cardIds.length) return;
  for (const id of cardIds) await db.prepare("UPDATE card_taps SET decided_at = ?, action = 'gone' WHERE repo = ? AND card_id = ? AND decided_at IS NULL").bind(now, repo, id).run();
}

/**
 * The player's tap. Updates the card's open row; a card offered before logging was on gets a row now
 * (decide time unknown, so it counts toward rates but not the median).
 */
export async function recordTap(db: D1Database, row: TapRow, tap: { action: Exclude<TapAction, "gone">; optionId?: string; reason?: NeverReason }, now: number): Promise<void> {
  const done = await db.prepare("UPDATE card_taps SET decided_at = ?, action = ?, option_id = ?, reason = ? WHERE repo = ? AND card_id = ? AND decided_at IS NULL")
    .bind(now, tap.action, tap.optionId ?? null, tap.reason ?? null, row.repo, row.card_id).run();
  if ((done.meta?.changes ?? 0) > 0) return;
  await db.prepare(`INSERT INTO card_taps (${COLUMNS.join(", ")}, decided_at, action, option_id, reason) VALUES (${[...COLUMNS, 1, 2, 3, 4].map(() => "?").join(", ")})`)
    .bind(...COLUMNS.map(c => c === "shown_at" ? now : row[c]), now, tap.action, tap.optionId ?? null, tap.reason ?? null).run();
}

/**
 * What became of work the player approved. Shipping is final; a rework only marks rows that have no
 * outcome yet; a comeback after launch overrides a clean ship.
 */
export async function recordOutcome(db: D1Database, repo: string, itemId: string, outcome: TapOutcome, now: number): Promise<void> {
  const replaces = outcome === "rework" ? "outcome IS NULL" : outcome === "came_back" ? "outcome IS NULL OR outcome LIKE 'shipped%'" : "outcome IS NULL OR outcome = 'rework'";
  await db.prepare(`UPDATE card_taps SET outcome = ?, outcome_at = ? WHERE repo = ? AND item_id = ? AND action IN ('continue', 'other') AND (${replaces})`).bind(outcome, now, repo, itemId).run();
}

export async function loadTaps(db: D1Database, opts: { repo?: string; since: number; limit?: number }): Promise<TapRow[]> {
  const where = opts.repo ? "WHERE shown_at >= ? AND repo = ?" : "WHERE shown_at >= ?";
  const q = db.prepare(`SELECT * FROM card_taps ${where} ORDER BY shown_at DESC LIMIT ?`);
  return (await (opts.repo ? q.bind(opts.since, opts.repo, opts.limit ?? 5000) : q.bind(opts.since, opts.limit ?? 5000)).all<TapRow>()).results;
}

export async function purgeTaps(db: D1Database, now: number): Promise<void> {
  await db.prepare("DELETE FROM card_taps WHERE shown_at < ?").bind(now - TAPS_RETENTION_MS).run();
}

// ---------- the eval ----------

export interface TapStats {
  shown: number;
  /** Player taps: continue + other + later + never. */
  decided: number;
  continued: number; other: number; later: number; never: number; gone: number;
  /** Continue / decided. Null with nothing decided. */
  approval: number | null;
  medianDecideMs: number | null;
  shippedClean: number; shippedAfterRework: number; rework: number; cameBack: number;
  /** Of approved work with a result, the share that shipped clean and stayed up. */
  goodRate: number | null;
}

export interface TapsReport {
  since: number;
  total: TapStats;
  byKind: Record<string, TapStats>;
  byScope: Record<string, TapStats>;
  byPlay: Record<string, TapStats>;
  /** Did the model's suggestion get taken more than the fixed rules'? */
  byAuthor: Record<string, TapStats>;
  byAttention: Record<string, TapStats>;
  neverReasons: Record<string, number>;
  /** Cards most often set aside (Later, Never) or left untapped, grouped by title. */
  skipped: { title: string; kind: string; scope: string; later: number; never: number; gone: number }[];
  recent: TapRow[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function tapStats(rows: readonly TapRow[]): TapStats {
  const n = (a: TapAction) => rows.filter(r => r.action === a).length;
  const o = (x: TapOutcome) => rows.filter(r => r.outcome === x).length;
  const continued = n("continue"), other = n("other"), later = n("later"), never = n("never");
  const decided = continued + other + later + never;
  const shippedClean = o("shipped_clean"), shippedAfterRework = o("shipped_after_rework"), rework = o("rework"), cameBack = o("came_back");
  const results = shippedClean + shippedAfterRework + rework + cameBack;
  // A row whose shown_at equals decided_at was logged at the tap: its wait is unknown, not zero.
  const waits = rows.filter(r => r.decided_at !== null && r.action !== "gone" && r.decided_at > r.shown_at).map(r => r.decided_at! - r.shown_at);
  return {
    shown: rows.length, decided, continued, other, later, never, gone: n("gone"),
    approval: decided ? continued / decided : null, medianDecideMs: median(waits),
    shippedClean, shippedAfterRework, rework, cameBack, goodRate: results ? shippedClean / results : null,
  };
}

function groupStats(rows: readonly TapRow[], key: (r: TapRow) => string | null): Record<string, TapStats> {
  const groups = new Map<string, TapRow[]>();
  for (const r of rows) { const k = key(r); if (k) groups.set(k, [...(groups.get(k) ?? []), r]); }
  return Object.fromEntries([...groups].sort((a, b) => b[1].length - a[1].length).map(([k, g]) => [k, tapStats(g)]));
}

export function tapsReport(rows: readonly TapRow[], since: number): TapsReport {
  const inWindow = rows.filter(r => r.shown_at >= since);
  const skips = new Map<string, TapsReport["skipped"][number]>();
  for (const r of inWindow) {
    if (r.action !== "later" && r.action !== "never" && r.action !== "gone") continue;
    const k = `${r.kind}|${r.title}`;
    const s = skips.get(k) ?? { title: r.title, kind: r.kind, scope: r.scope, later: 0, never: 0, gone: 0 };
    s[r.action]++;
    skips.set(k, s);
  }
  const reasons: Record<string, number> = {};
  for (const r of inWindow) if (r.action === "never" && r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  return {
    since, total: tapStats(inWindow),
    byKind: groupStats(inWindow, r => r.kind), byScope: groupStats(inWindow, r => r.scope),
    byPlay: groupStats(inWindow, r => r.play), byAuthor: groupStats(inWindow, r => r.by), byAttention: groupStats(inWindow, r => r.attention),
    neverReasons: reasons,
    skipped: [...skips.values()].sort((a, b) => (b.later + b.never + b.gone) - (a.later + a.never + a.gone)).slice(0, 10),
    recent: [...inWindow].sort((a, b) => b.shown_at - a.shown_at).slice(0, 40),
  };
}

/**
 * The short version the game master reads next to playerFeedback: how often each kind of card gets a yes,
 * what gets skipped, and how many approvals came back. Only kinds with at least 3 taps, so one swipe
 * can't steer the deck.
 */
export function tapBrief(report: TapsReport): { approvalByKind: Record<string, { taps: number; yes: number; rate: number }>; oftenSkipped: string[]; approvedThenReworked: number; approvedAndShippedClean: number } {
  const approvalByKind: Record<string, { taps: number; yes: number; rate: number }> = {};
  for (const [kind, s] of Object.entries(report.byKind)) if (s.decided >= 3) approvalByKind[kind] = { taps: s.decided, yes: s.continued, rate: Math.round((s.approval ?? 0) * 100) / 100 };
  return {
    approvalByKind,
    oftenSkipped: report.skipped.filter(s => s.later + s.never >= 2).slice(0, 5).map(s => `${s.kind}: ${s.title}`),
    approvedThenReworked: report.total.rework + report.total.shippedAfterRework + report.total.cameBack,
    approvedAndShippedClean: report.total.shippedClean,
  };
}
