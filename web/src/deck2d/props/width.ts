// The pixel hull's width as the deck grows (props/ draws it, grow/ reports it as camera and belt bounds). Its own tiny
// module so grow/ can read it without pulling the hull drawing into its chunk.
import { ART_PX, DECK_DX, HULL } from "../contract";

export type Size = "small" | "medium" | "large";
/** Built width per size, world units: each size ends just past its last station (small: Builder, medium: Review);
 * large is the whole HULL. grow/ bounds() should report the same, so the camera and the hull agree. */
const WIDTH: Record<Size, number> = DECK_DX ? { small: 1700, medium: 2450, large: HULL.x1 } : { small: 1000, medium: 1700, large: 2039 };
const NEXT: Record<Size, Size> = { small: "medium", medium: "large", large: "large" };
export const COL = 16; // art px: the hull grows one plate-ish column at a time

/** The hull's width in art px at `size`, `growing` (0..1) of the way to the next size: one COL column at a time. */
export function hullCols(size: Size, growing: number): number {
  const a = WIDTH[size], b = WIDTH[NEXT[size]];
  if (!growing || a === b) return a / ART_PX;
  const k = 1 - (1 - growing) ** 2; // eases out as the last plates land
  return Math.floor(((a + (b - a) * k) / ART_PX) / COL) * COL || a / ART_PX;
}

