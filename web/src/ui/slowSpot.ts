// The slow-spot line (?simple=1): one sentence that always answers "what's holding the factory up right now?".
// When work is parked on the player it says so ("You · 3 waiting"); otherwise it names the jammed stage with the
// bottleneck engine's own numbers; with nothing jammed, all clear. Ideas never make the player the slow spot.

import { attentionOf, ATTENTION_RANK, type Bottleneck, type Move } from "@shiptorio/shared";
import { STAGE_LABEL, TASKS } from "../copy";

export interface SlowSpot {
  who: "you" | "line" | "clear";
  text: string;
}

export function slowSpot(deck: readonly Move[], bottleneck?: Bottleneck | null): SlowSpot {
  const parked = deck.filter((m) => attentionOf(m) !== "suggest").length;
  if (parked) return { who: "you", text: TASKS.you(parked) };
  // a jam that's waiting on the player's own pad is already the "you" case above; anything else is the line's
  if (bottleneck && bottleneck.wip > 0) return { who: "line", text: TASKS.stage(STAGE_LABEL[bottleneck.stage], bottleneck.summary) };
  return { who: "clear", text: TASKS.clear };
}

/** The tray's order: stuck work first, then work parked on a yes, then ideas, keeping deck order within a kind. */
export function taskOrder(deck: readonly Move[]): Move[] {
  return deck.map((m, i) => ({ m, i })).sort((a, b) => ATTENTION_RANK[attentionOf(a.m)] - ATTENTION_RANK[attentionOf(b.m)] || a.i - b.i).map((x) => x.m);
}
