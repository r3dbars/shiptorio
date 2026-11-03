// Foot anchors for Shippy's sprites (web/public/deck/art/shippy-*.webp, contract SPRITES.shippy).
// ax = the middle of his body, measured from the lantern (his left edge, the one cyan thing in every pose), so the
// box stays put while legs and arms grow out of it. ay = his feet; lever/happy/alarm have the lever base, dust or
// shake lines hanging below the feet, so their ay sits above the image bottom. Source px.
export type ShippyFrame = "shippy-weld-0" | "shippy-weld-1" | "shippy-carry-0" | "shippy-carry-1" | "shippy-0" | "shippy-1" | "shippy-2" | "shippy-3" | "shippy-4" | "shippy-5" | "shippy-lever" | "shippy-happy" | "shippy-alarm" | "shippy-peek";
// s = extra scale for sheets drawn at a different size (the build poses came out ~10% bigger than the strip).
export const ANCHOR: Record<ShippyFrame, { ax: number; ay: number; s?: number }> = {
  "shippy-0": { ax: 209, ay: 289 },
  "shippy-1": { ax: 216, ay: 289 },
  "shippy-2": { ax: 219, ay: 289 },
  "shippy-3": { ax: 211, ay: 289 },
  "shippy-4": { ax: 172, ay: 289 },
  "shippy-5": { ax: 182, ay: 289 },
  "shippy-lever": { ax: 177, ay: 320 },
  "shippy-happy": { ax: 180, ay: 282 },
  "shippy-alarm": { ax: 217, ay: 456 },
  "shippy-peek": { ax: 154, ay: 246 },
  // build poses (Justin, 2026-10-28 20:34): torch with sparks, and carrying a steel beam. Two frames each.
  "shippy-weld-0": { ax: 180, ay: 323, s: 0.9 },
  "shippy-weld-1": { ax: 180, ay: 324, s: 0.9 },
  "shippy-carry-0": { ax: 175, ay: 324, s: 0.9 },
  "shippy-carry-1": { ax: 173, ay: 322, s: 0.9 },
};
/** Sprite names beyond the contract's SPRITES.shippy list, so a loader can fetch them too. */
export const BUILD_SPRITES: ShippyFrame[] = ["shippy-weld-0", "shippy-weld-1", "shippy-carry-0", "shippy-carry-1"];
/** The unfold strip, closed box to walking. Folding plays it backwards. */
export const UNFOLD: ShippyFrame[] = ["shippy-0", "shippy-1", "shippy-2", "shippy-3", "shippy-4", "shippy-5"];
/** Strip frames are this tall; every sprite shares the same px-per-world-unit so poses keep their true size. */
export const STRIP_H = 289;
