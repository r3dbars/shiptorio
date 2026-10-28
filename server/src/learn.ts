// The factory learns what you approve (docs/LEARN.md, Justin's journey pick #11). Every kind of card (its kind plus
// where it is, the deck's `kind|scope` class) counts your Continues in a row. Say yes LEARN_NEED times in a row and
// the factory does that kind on its own from then on. Later, Edit (another option) or a dismiss resets the count, and
// a dismiss also tells the planner to try a different version next time. Pure rules; the Factory DO stores them in
// the deck book, behind the "learn" flag.
//
// Only safe, undoable tools can be learned: starting a plan and approving a plan. Launches (the held red button),
// merges, customer replies, research and autonomy cards always wait for the player.

import type { Learned, Move } from "@shiptorio/shared";
import { yesKey, type DeckBook } from "./deck-decisions";

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

export const learnKey = (card: Move, scope: string) => yesKey(card.kind ?? "unblock", scope);

const KIND_WORD: Record<string, string> = { build: "Plans", verify: "Checks", review: "Reviews", unblock: "Fixes", input: "Inputs" };

/** "Plans in /web": what the player sees in the list of things the factory does on its own. */
export function learnLabel(key: string): string {
  const [kind, scope = ""] = key.split("|");
  const [what, where] = scope.split(":");
  const word = KIND_WORD[kind] ?? "These cards";
  const folder = what === "district" ? (where ?? "").replace(/^\/+/, "") : "";
  return folder ? `${word} in /${folder}` : word;
}

export const isLearned = (book: DeckBook, key: string) => !!book.auto?.[key];

/** The dots on a card: yeses so far, out of LEARN_NEED. Undefined for cards that can't be learned or already are. */
export function learnMeter(book: DeckBook, card: Move, scope: string): Move["learn"] {
  if (!learnOption(card)) return undefined;
  const key = learnKey(card, scope);
  if (isLearned(book, key)) return undefined;
  // An old streak from before learning existed never skips the last yes: the player always sees one dot left.
  return { have: Math.min(book.yes?.[key] ?? 0, LEARN_NEED - 1), need: LEARN_NEED };
}

/** After a Continue was counted (noteYes): learns the class once the streak is full. True when it just learned. */
export function learnFromYes(book: DeckBook, card: Move, scope: string, now: number): boolean {
  if (!learnOption(card)) return false;
  const key = learnKey(card, scope);
  if (isLearned(book, key) || (book.yes?.[key] ?? 0) < LEARN_NEED) return false;
  (book.auto ??= {})[key] = { since: now, label: learnLabel(key) };
  return true;
}

/** Ask the player again for this class. The streak starts over. */
export function forget(book: DeckBook, key: string): boolean {
  if (!book.auto?.[key]) return false;
  delete book.auto[key];
  if (book.yes) delete book.yes[key];
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
