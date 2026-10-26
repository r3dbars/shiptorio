import type { Move } from "@shiptorio/shared";

/** The card's one-line why: the planner's own sentence, else the suggested option's reason. */
export const because = (m: Move): string | undefined => m.because ?? m.options.find((o) => o.recommended)?.actions[0]?.reason;
