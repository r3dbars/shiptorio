// Foot anchors for Shippy's sprites (web/public/deck/art/shippy-*.webp, contract SPRITES.shippy).
// ax = the middle of his body, measured from the lantern (his left edge, the one cyan thing in every pose), so the
// box stays put while legs and arms grow out of it. ay = his feet; lever/happy/alarm have the lever base, dust or
// shake lines hanging below the feet, so their ay sits above the image bottom. Source px.
export type ShippyFrame = "shippy-0" | "shippy-1" | "shippy-2" | "shippy-3" | "shippy-4" | "shippy-5" | "shippy-lever" | "shippy-happy" | "shippy-alarm" | "shippy-peek";
export const ANCHOR: Record<ShippyFrame, { ax: number; ay: number }> = {
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
};
/** The unfold strip, closed box to walking. Folding plays it backwards. */
export const UNFOLD: ShippyFrame[] = ["shippy-0", "shippy-1", "shippy-2", "shippy-3", "shippy-4", "shippy-5"];
/** Strip frames are this tall; every sprite shares the same px-per-world-unit so poses keep their true size. */
export const STRIP_H = 289;
