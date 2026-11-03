import type { StopState } from "../contract";
import type { Px } from "./px";

/** One station drawn in code. w x h is the whole grid in art px (1px margin all round for the outline);
 * the feet sit on the bottom row, centred. Each state has n frames played at fps (n = 1: it holds still). */
export interface StationDef {
  w: number;
  h: number;
  anim(s: StopState): { n: number; fps: number };
  draw(g: Px, s: StopState, frame: number): void;
}
