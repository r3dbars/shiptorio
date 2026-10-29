import type { Move } from "@shiptorio/shared";

/** docs/BRAIN.md: an unlock card with no action is a step only the player can do, so Continue opens its link. */
export function openUnlockLink(move: Move, o: Move["options"][number]) {
  if (move.id.startsWith("unlock:") && o.id === "continue" && !o.actions.length && move.url?.startsWith("https://")) window.open(move.url, "_blank", "noopener");
}
