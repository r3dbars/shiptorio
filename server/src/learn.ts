// The factory learns what you approve (docs/LEARN.md, Justin's journey pick #11). Every kind of card (its kind, where
// it is and what its suggested option does: `kind|scope|tool`) counts your Continues in a row. Say yes LEARN_NEED times in a row and
// the factory does that kind on its own from then on. Later, Edit (another option) or a dismiss resets the count, and
// a dismiss also tells the planner to try a different version next time. Pure rules; the Factory DO stores them in
// the deck book, behind the "learn" flag.
//
// Only safe, undoable tools can be learned: starting a plan and approving a plan. Launches (the held red button),
// merges, customer replies, research and autonomy cards always wait for the player.

import type { Item, Learned, Move } from "@shiptorio/shared";
import type { DeckBook } from "./deck-decisions";

export const LEARN_NEED = 3;
const SAFE_TOOLS = new Set(["plan_runner_job", "approve_runner_job"]);
const NEVER_KINDS = new Set(["ship", "reply", "automate"]);
const MAX_RUNS = 50;

/** The option the factory may tap on its own for this card, or null when this kind of card can never be learned. */
export function learnOption(card: Move): string | null {
  if (card.locked || NEVER_KINDS.has(card.kind ?? "")) return null;
  const option = card.options.find(o => o.recommended);
  if (!option?.actions.length || option.id.startsWith("rework-")) return null;
  if (card.options.some(o => o.actions.some(a => a.tool === "request_merge"))) return null;
  return option.actions.every(a => SAFE_TOOLS.has(a.tool)) ? option.id : null;
}

/**
 * Only first-time work can be learned. A rework plan, a base refresh of a factory PR, or anything on an item that
 * already has a PR or a scar is a new decision that always needs the player's own fresh yes, whatever they said
 * to first builds before (#170).
 */
export function freshWork(card: Move, item: Item | undefined, jobs: readonly { itemId: string; approvalMoveId?: string; reworkPr?: number; refreshBase?: unknown }[]): boolean {
  if (!item || item.prNumber || item.state === "rejected" || item.scars?.length) return false;
  if (card.options.some(o => o.id.startsWith("rework-") || o.actions.some(a => a.args.refreshBase === true || a.args.reworkPr !== undefined || a.args.scarCount !== undefined))) return false;
  return !jobs.some(j => (j.approvalMoveId === card.id || j.itemId === item.id) && (j.reworkPr !== undefined || !!j.refreshBase));
}

/** Starting a plan and approving one are learned apart: letting code get written is a bigger yes than reading. */
export function learnKey(card: Move, scope: string): string {
  const tool = card.options.find(o => o.recommended)?.actions[0]?.tool ?? "none";
  return `${card.kind ?? "unblock"}|${scope}|${tool}`;
}

const TOOL_WORD: Record<string, string> = { plan_runner_job: "Starting plans", approve_runner_job: "Approving plans" };

/** "Approving plans in /web": what the player sees in the list of things the factory does on its own. */
export function learnLabel(key: string): string {
  const [, scope = "", tool = ""] = key.split("|");
  const [what, where] = scope.split(":");
  const word = TOOL_WORD[tool] ?? "These cards";
  const folder = what === "district" ? (where ?? "").replace(/^\/+/, "") : "";
  return folder ? `${word} in /${folder}` : word;
}

export const isLearned = (book: DeckBook, key: string) => !!book.auto?.[key];

/** The dots on a card: yeses so far, out of LEARN_NEED. Undefined before the first yes, and for cards that can't be learned or already are. */
export function learnMeter(book: DeckBook, card: Move, scope: string, fresh: boolean): Move["learn"] {
  if (!fresh || !learnOption(card)) return undefined;
  const key = learnKey(card, scope);
  const have = book.learnYes?.[key] ?? 0;
  // No dots before the first yes: a brand-new player's first card stays plain.
  if (isLearned(book, key) || !have) return undefined;
  return { have: Math.min(have, LEARN_NEED - 1), need: LEARN_NEED };
}

/** A Continue on the suggested option, as is: one more dot. Learns the class on the last one; true when it just learned. */
export function learnFromYes(book: DeckBook, card: Move, scope: string, now: number, fresh: boolean, by: string): boolean {
  if (!fresh || !learnOption(card)) return false;
  const key = learnKey(card, scope);
  if (isLearned(book, key)) return false;
  const yes = book.learnYes ??= {};
  if ((yes[key] = (yes[key] ?? 0) + 1) < LEARN_NEED) return false;
  (book.auto ??= {})[key] = { since: now, label: learnLabel(key), by };
  return true;
}

/** Later, Edit or a dismiss on any card of this kind and place: the dots empty. */
export function resetLearn(book: DeckBook, kind: string, scope: string): void {
  for (const key of Object.keys(book.learnYes ?? {})) if (key.startsWith(`${kind}|${scope}|`)) delete book.learnYes![key];
}

/** Ask the player again for this class. The streak starts over. */
export function forget(book: DeckBook, key: string): boolean {
  if (!book.auto?.[key]) return false;
  delete book.auto[key];
  if (book.learnYes) delete book.learnYes[key];
  book.autoRuns = (book.autoRuns ?? []).filter(r => r.key !== key);
  return true;
}

export function noteAutoRun(book: DeckBook, itemId: string | undefined, key: string): void {
  if (!itemId) return;
  book.autoRuns = [...(book.autoRuns ?? []).filter(r => r.itemId !== itemId), { itemId, key }].slice(-MAX_RUNS);
}

/** Work the factory started on its own came back: that class goes back to asking. Returns the class it forgot. */
export function forgetOnComeback(book: DeckBook, itemId: string): string | null {
  const run = book.autoRuns?.find(r => r.itemId === itemId);
  return run && forget(book, run.key) ? run.key : null;
}

/** A dismiss is a lesson: the planner tries a different version or suggests something else next time. */
export function dismissNote(card: Move, scope: string): string {
  return `Player passed on ${card.kind ?? "unblock"} in ${scope}: ${card.title}. Next time try a smaller or different version of this, or suggest something else.`;
}

export function learnedList(book: DeckBook): Learned[] {
  return Object.entries(book.auto ?? {}).map(([key, v]) => ({ key, label: v.label, since: v.since })).sort((a, b) => a.since - b.since).slice(0, 40);
}
