// Rush and Park (docs/GAMEPLAY-PICKS.md, r3-rush / touchwork): tap a cart, then Rush or Park in its callout.
// Rush puts the item at the front of its queue; Park sets it aside so it stops taking the line until Unpark.
// The sim and the live server both order their waiting work with these, so the two behave the same.
import type { Item } from "./model";

/** States where an item is still waiting for the line, so Rush or Park changes what happens next. */
const WAITING: ReadonlySet<Item["state"]> = new Set(["ore", "queued", "rejected"]);

export type PriorityChoice = "rush" | "park" | "none";

/** What the callout offers for this item. A parked item can always be unparked. */
export function priorityChoices(item: Pick<Item, "state" | "priority">): PriorityChoice[] {
  if (item.priority === "park") return ["none"];
  if (!WAITING.has(item.state)) return [];
  return item.priority === "rush" ? ["park"] : ["rush", "park"];
}

/** Whether a player's set_priority applies to this item (anything else is ignored). */
export function canSetPriority(item: Pick<Item, "state" | "priority">, choice: PriorityChoice): boolean {
  if (choice === "none") return !!item.priority;
  return WAITING.has(item.state) && item.priority !== choice;
}

/** The item with the player's choice applied. */
export function withPriority<T extends Pick<Item, "priority">>(item: T, choice: PriorityChoice): T {
  const next = { ...item };
  if (choice === "none") delete next.priority;
  else next.priority = choice;
  return next;
}

/** Waiting work in the order the line takes it: rushed first (keeping their order), parked left out. */
export function lineOrder<T extends Pick<Item, "priority">>(items: readonly T[]): T[] {
  const live = items.filter((i) => i.priority !== "park");
  return [...live.filter((i) => i.priority === "rush"), ...live.filter((i) => i.priority !== "rush")];
}
