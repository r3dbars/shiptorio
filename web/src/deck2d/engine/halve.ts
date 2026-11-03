// The city frame is one pixel grid: 1 city px = 2 deck art px. The line is drawn at art resolution into its own buffer
// and halved 2:1 nearest-neighbour into the city buffer. Every output pixel is one of the four source pixels it covers
// (no blending, so no new colours), picked by a fixed rule so the same picture always halves the same way; a browser's
// own drawImage downscale picks the left or right pixel of an exact half depending on the GPU.
//
// The rule is plain nearest-neighbour with the upper right pixel of each 2x2 block (the light's side), except at a
// silhouette: when that pixel is transparent the first solid one (upper left, lower right, lower left) is used, so a
// 1 px outline never half-disappears into the sky. (Preferring the odd pixel out in each block was tried: it promotes
// every rivet and glint, and the line turns glittery and brassy compared with the same art at station zoom.)

import { ART_PX } from "../contract";

/** Source alpha at or above this counts as a solid pixel; below it the pixel only matters when nothing else is there. */
const SOLID = 128;

/** Halves an RGBA picture w x h (both even) into (w / 2) x (h / 2). */
export function halve2x(src: Uint8ClampedArray, w: number, h: number, out: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray((w >> 1) * (h >> 1) * 4)): Uint8ClampedArray<ArrayBuffer> {
  const ow = w >> 1, oh = h >> 1;
  for (let by = 0; by < oh; by++) for (let bx = 0; bx < ow; bx++) {
    const tl = by * 2 * w + bx * 2, o = (by * ow + bx) * 4;
    let s = (tl + 1) * 4; // upper right
    if (src[s + 3] < SOLID) {
      // a silhouette: the first solid pixel of the block, else the most opaque one
      let best = s, alpha = src[s + 3];
      for (const c of [tl, tl + w + 1, tl + w]) {
        const a = src[c * 4 + 3];
        if (a >= SOLID) { best = c * 4; break; }
        if (a > alpha) { alpha = a; best = c * 4; }
      }
      s = best;
    }
    out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3];
  }
  return out;
}

// ---------- belt phase, in whole city px ----------
// A belt's plates shift by floor(phase * speed / ART_PX) art px. When the picture is halved, an odd shift moves every
// 1 px detail between two columns of a block and the belt flickers; so at city zoom the phase is rounded down to a whole
// number of 2-art-px steps (plus half an art px, so the floor can never land one short).
export const BELT_SPEED = 170;
/** Whole 2-art-px steps a belt has moved after `phase` seconds. */
export const beltStep = (phase: number, speed = BELT_SPEED) => Math.floor((phase * speed) / (2 * ART_PX));
/** The phase (seconds) that shifts the plates by exactly `step` * 2 art px. */
export const stepPhase = (step: number, speed = BELT_SPEED) => (step * 2 * ART_PX + ART_PX / 2) / speed;
export const quantPhase = (phase: number, speed = BELT_SPEED) => stepPhase(beltStep(phase, speed), speed);
