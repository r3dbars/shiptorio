import type { Move } from '@shiptorio/shared';

/** Stable across repeated offers; a new approved job or PR head is a new decision. Support cards add their
 * ticket, so two customers' replies stay two cards (keys without one are unchanged). Shippy's unlock cards add
 * their bottleneck: they carry no item, so two different problems of one kind would otherwise share a key, and a
 * Later on one would hide the other and count toward its third-defer card. */
export function moveKey(move: Move): string {
  return JSON.stringify([move.itemId ?? '', move.kind ?? move.stage ?? 'unblock', move.options.flatMap(o => o.actions.map(a => [a.tool, a.args.jobId ?? '', a.args.headSha ?? '', a.args.scarCount ?? '', ...(a.args.ticketId ? [a.args.ticketId] : []), ...(a.args.level ? [a.args.level] : [])])), ...(move.id.startsWith('unlock:') ? [move.id] : [])]);
}
export interface DeckRule { kind: string; scope: string; actionId: string }
export interface DeckDecision { key: string; move: Move; count: number; deferred?: boolean; dismissed?: boolean }
export interface DeckUndo { id: string; expiresAt: number; key: string; before?: DeckDecision; rule?: DeckRule; noteId?: string }
export interface DeferIntent { id: string; userId: number; scope?: string }
export interface DeferReceipt extends DeferIntent { moveId: string; key: string; at: number }
export interface DeckBook {
  /** Correlation only. Saved atomically with the deferred decision, bounded beyond the client's one-minute retry window. */
  deferReceipts?: DeferReceipt[];
  decisions: Record<string, DeckDecision>; notes: { id: string; text: string }[]; undos: DeckUndo[];
  /** docs/ATTENTION.md: the player's Continues in a row per card class (`kind|scope`). A Later or a never resets it. */
  yes?: Record<string, number>;
  /** docs/LEARN.md: yeses in a row per learnable class (`kind|scope|tool`, server/src/learn.ts). */
  learnYes?: Record<string, number>;
  /** docs/LEARN.md: classes the factory now answers on its own. */
  auto?: Record<string, { since: number; label: string; /** the player who taught it; their flags decide whether it still runs */ by?: string }>;
  /** Items the factory moved on its own, so a PR that comes back un-learns its class. */
  autoRuns?: { itemId: string; key: string }[];
}
export const emptyDeckBook = (): DeckBook => ({ decisions: {}, notes: [], undos: [] });
export function thirdDefer(move: Move): Move {
  return { ...move, id: `${move.id}:deferred`, title: 'Never, or let the factory decide?', why: `You have set aside “${move.title}” three times. Choose what should happen to this kind of decision.`, kind: 'automate', options: [
    { id: 'never-kind', label: 'Stop this kind of card', recommended: false, actions: [] },
    { id: 'decide-class', label: 'Let the factory decide these', recommended: true, actions: [] },
    { id: 'keep-later', label: 'Keep it for next time', recommended: false, actions: [] },
  ] };
}
export function hasDeferReceipt(book: DeckBook, move: Move, intent: DeferIntent, now = Date.now()): boolean {
  const key = moveKey(move);
  return (book.deferReceipts ?? []).some(r => r.at > now - 600_000 && r.id === intent.id && r.userId === intent.userId && r.moveId === move.id && r.key === key && r.scope === intent.scope);
}
export function deferCard(book: DeckBook, move: Move, intent?: DeferIntent, now = Date.now()): boolean {
  const key = moveKey(move), prior = book.decisions[key];
  if (intent) {
    const receipts = (book.deferReceipts ?? []).filter(r => r.at > now - 600_000);
    const replay = hasDeferReceipt(book, move, intent, now);
    book.deferReceipts = receipts;
    if (replay) {
      // A reconnect starts a new check-in; replay the parking effect, not another lesson/count.
      if (prior && !prior.dismissed) prior.deferred = true;
      return false;
    }
    book.deferReceipts = [...receipts, {...intent, moveId: move.id, key, at: now}].slice(-128);
  }
  // Duplicate deliveries of the same parked decision are not new player choices.
  if (prior?.deferred || prior?.dismissed) return false;
  book.decisions[key] = { key, move, count: (prior?.count ?? 0) + 1, deferred: true };
  return true;
}
export const yesKey = (kind: string, scope: string) => `${kind}|${scope}`;
export function noteYes(book: DeckBook, kind: string, scope: string): number {
  const key = yesKey(kind, scope), yes = book.yes ?? (book.yes = {});
  return (yes[key] = (yes[key] ?? 0) + 1);
}
export function resetYes(book: DeckBook, kind: string, scope: string): void {
  if (book.yes) delete book.yes[yesKey(kind, scope)];
}
/** Away this long, and the next visit is a new check-in: what the player put off comes back. */
export const CHECKIN_GAP_MS = 30 * 60_000;
export function beginCheckin(book: DeckBook): void {
  for (const decision of Object.values(book.decisions)) decision.deferred = false;
}
export function suppressed(book: DeckBook, move: Move): boolean {
  const decision = book.decisions[moveKey(move)];
  return !!(decision?.deferred || decision?.dismissed);
}
export function plannerFeedback(book: DeckBook, rules: readonly DeckRule[]): string {
  const yesStreaks = Object.entries(book.yes ?? {}).filter(([, n]) => n >= 2).map(([key, streak]) => { const [kind, scope] = key.split("|"); return { kind, scope, streak }; });
  return JSON.stringify({ excludedMoveClasses: rules.map(({ kind, scope }) => ({ kind, scope })), playerCorrections: book.notes.slice(-20).map(n => n.text), ...(yesStreaks.length ? { playerYesStreaks: yesStreaks } : {}) });
}
