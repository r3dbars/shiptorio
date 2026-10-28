import type { Move } from '@shiptorio/shared';

/** Stable across repeated offers; a new approved job or PR head is a new decision. Support cards add their
 * ticket, so two customers' replies stay two cards (keys without one are unchanged). */
export function moveKey(move: Move): string {
  return JSON.stringify([move.itemId ?? '', move.kind ?? move.stage ?? 'unblock', move.options.flatMap(o => o.actions.map(a => [a.tool, a.args.jobId ?? '', a.args.headSha ?? '', a.args.scarCount ?? '', ...(a.args.ticketId ? [a.args.ticketId] : []), ...(a.args.level ? [a.args.level] : [])]))]);
}
export interface DeckRule { kind: string; scope: string; actionId: string }
export interface DeckDecision { key: string; move: Move; count: number; deferred?: boolean; dismissed?: boolean }
export interface DeckUndo { id: string; expiresAt: number; key: string; before?: DeckDecision; rule?: DeckRule; noteId?: string }
export interface DeckBook {
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
export function deferCard(book: DeckBook, move: Move): void {
  const key = moveKey(move), prior = book.decisions[key];
  book.decisions[key] = { key, move, count: (prior?.count ?? 0) + 1, deferred: true };
}
export const yesKey = (kind: string, scope: string) => `${kind}|${scope}`;
export function noteYes(book: DeckBook, kind: string, scope: string): number {
  const key = yesKey(kind, scope), yes = book.yes ?? (book.yes = {});
  return (yes[key] = (yes[key] ?? 0) + 1);
}
export function resetYes(book: DeckBook, kind: string, scope: string): void {
  if (book.yes) delete book.yes[yesKey(kind, scope)];
}
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
