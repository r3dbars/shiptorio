// The "taps" collector for the bottleneck brain (docs/BRAIN.md): what the player's own taps say about the
// deck. Reads card_taps rows (server/src/taps.ts), never calls a model. Kinds are the taps entries in
// SIGNAL_KINDS: card_ignored, later_streak, never_reason.
//
// The return type mirrors BrainSignal in shared/src/signals.ts structurally, so this file doesn't wait on
// that contract landing; once it's on main, swap TapSignal for the shared type.

import { loadTaps, type TapRow } from "../taps";
import { plural } from "../encode";

export interface TapSignal {
  id: string;
  source: "taps";
  kind: "card_ignored" | "later_streak" | "never_reason";
  title: string;
  severity: number;
  confidence: number;
  metric?: { value: number; baseline?: number; unit: string };
  scope?: string;
  evidence: { label: string; url?: string }[];
  observedAt: number;
  freshUntil: number;
}

const WEEK = 7 * 86400000, FRESH = 30 * 60000, STALE_OPEN = 86400000;
const id = (kind: string, scope?: string) => `taps:${kind}:${scope ?? "repo"}`;

/** One factory's taps from the last week (any order) → at most a few signals, heaviest first. */
export function tapSignals(rows: readonly TapRow[], now: number): TapSignal[] {
  const week = rows.filter(r => r.shown_at >= now - WEEK);
  const base = { source: "taps" as const, confidence: 1, observedAt: now, freshUntil: now + FRESH };
  const out: TapSignal[] = [];

  // Cards that left untapped, or have sat on the deck a whole day: the deck is talking to nobody.
  const ignored = week.filter(r => r.action === "gone" || (r.decided_at === null && now - r.shown_at > STALE_OPEN));
  if (ignored.length >= 3) out.push({ ...base, id: id("card_ignored"), kind: "card_ignored",
    title: `${plural(ignored.length, "card")} went untapped this week.`.slice(0, 160),
    // Advice about the deck, not a stop on the line: never louder than a red PR or an empty builder.
    severity: Math.min(0.5, ignored.length / 10), metric: { value: ignored.length, unit: "cards" },
    evidence: ignored.slice(0, 3).map(r => ({ label: `Untapped: ${r.title}`.slice(0, 120) })) });

  // Later after Later on the same kind of card: the brain keeps dealing something the player doesn't want now.
  const byKind = new Map<string, TapRow[]>();
  for (const r of week.filter(r => r.action && r.action !== "gone").sort((a, b) => b.decided_at! - a.decided_at!)) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  for (const [kind, taps] of byKind) {
    let streak = 0;
    while (streak < taps.length && (taps[streak].action === "later" || taps[streak].action === "never")) streak++;
    if (streak >= 3) out.push({ ...base, id: id("later_streak", kind), kind: "later_streak", scope: kind,
      title: `You set aside the last ${streak} ${kind} cards.`, severity: Math.min(0.6, streak / 6), metric: { value: streak, unit: "cards" },
      evidence: taps.slice(0, Math.min(streak, 3)).map(r => ({ label: `${r.action === "later" ? "Later" : "Never"}: ${r.title}`.slice(0, 120) })) });
  }

  // "Wrong call" is the strongest no there is: the planner misread the situation.
  const wrong = week.filter(r => r.action === "never" && r.reason === "wrong");
  if (wrong.length >= 2) out.push({ ...base, id: id("never_reason"), kind: "never_reason",
    title: `You marked ${plural(wrong.length, "card")} as the wrong call this week.`, severity: Math.min(1, wrong.length / 4),
    metric: { value: wrong.length, unit: "cards" }, evidence: wrong.slice(0, 3).map(r => ({ label: `Wrong call: ${r.title}`.slice(0, 120) })) });

  return out.sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
}

/**
 * The registry entry (server/src/signals/index.ts, #388): `bind(tapsCollector, c => ({ db: c.env.DB, repo: c.repo }))`.
 * Reads every 10 minutes; taps only change when the player is around.
 */
export const tapsCollector = {
  source: "taps" as const,
  everyMs: 10 * 60_000,
  async read(ctx: { db: D1Database; repo?: string }, now: number): Promise<TapSignal[]> {
    if (!ctx.repo) return [];
    return tapSignals(await loadTaps(ctx.db, { repo: ctx.repo, since: now - WEEK, limit: 500 }), now);
  },
};
