import type { DeckView, StopId } from "../contract";

/** Presentation metadata; human decisions are separate from the factory's blocked state. */
export type AttentionView = DeckView & { attention?: readonly StopId[]; focus?: StopId };
export const needsAttention = (view: DeckView, id: StopId) => (view as AttentionView).attention?.includes(id) ?? false;
