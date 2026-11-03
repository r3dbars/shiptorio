// Tiny animation math the deck's layers all share (it used to be copied into each one).

/** Clamp to 0..1. */
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** How far t is through the window a..b, clamped to 0..1. */
export const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
/** Cubic ease-out: fast start, soft landing. */
export const easeOut = (x: number): number => 1 - (1 - x) ** 3;
