import { ART_PX, PALETTE as C, type Item } from "../contract";

// The engine's own pieces drawn as pixel art in code (contract: the pixel canvas): belt, crates, lever, jam beacon.
// Everything is in art px; px() turns that into world units on the art grid.

const P = ART_PX;
const g = (n: number) => Math.round(n / P); // world -> art px
/** Fill w x h art px whose top-left is art px (ax, ay). */
function px(cx: CanvasRenderingContext2D, ax: number, ay: number, w: number, h: number, color: string) {
  cx.fillStyle = color; cx.fillRect(ax * P, ay * P, w * P, h * P);
}

const BELT_H = 9;
/** One belt run from (ax, ay) to (bx, by) in world units, chevrons moving right. Slopes become 1-px stairs.
 * 3/4 view, top to bottom: lit rail, rail, belt surface (3 rows, chevrons), lip shadow, riveted front face, soot. */
export function beltRun(cx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, len: number, t: number, speed: number) {
  const x0 = g(ax), x1 = g(ax + (bx - ax) * Math.min(1, len / Math.hypot(bx - ax, by - ay)));
  const shift = Math.floor((t * speed) / P);
  for (let x = x0; x < x1; x++) {
    const f = (x - x0) / Math.max(1, g(bx) - x0), y = g(ay + (by - ay) * f) - Math.floor(BELT_H / 2);
    const end = x === x0 || x === x1 - 1;
    px(cx, x, y, 1, 1, C.soot[0]);
    px(cx, x, y + 1, 1, 1, end ? C.brass[3] : x % 12 === 0 ? C.brass[5] : C.brass[4]); // sunlit rail edge, a glint now and then
    px(cx, x, y + 2, 1, 1, C.brass[2]);
    // belt surface: mid, dark, darker toward the front (it curves away over the roller)
    px(cx, x, y + 3, 1, 1, C.iron[2]); px(cx, x, y + 4, 1, 1, C.iron[1]); px(cx, x, y + 5, 1, 1, C.iron[1]);
    // chevrons every 8 px: ">" over the 3 surface rows, lit on top, shaded below
    const k = ((x - shift) % 8 + 8) % 8;
    if (k === 2) { px(cx, x, y + 3, 1, 1, C.brass[4]); px(cx, x, y + 5, 1, 1, C.brass[2]); }
    if (k === 3) { px(cx, x, y + 4, 1, 1, C.brass[3]); }
    if (k === 1) { px(cx, x, y + 3, 1, 1, C.brass[2]); px(cx, x, y + 5, 1, 1, C.brass[1]); }
    // belt seam every 16 px reads as separate plates
    if (((x - shift) % 16 + 16) % 16 === 0) px(cx, x, y + 3, 1, 3, C.soot[0]);
    px(cx, x, y + 6, 1, 1, C.soot[0]); // lip shadow where the belt rolls under
    // front face: copper-dark frame with rivets, a bevel line on top
    px(cx, x, y + 7, 1, 1, x % 6 === 3 ? C.brass[3] : C.copper[0]);
    px(cx, x, y + 8, 1, 1, x % 6 === 3 ? C.brass[1] : C.iron[1]);
    px(cx, x, y + 9, 1, 1, C.soot[0]);
  }
  // cast shadow on the deck below (light layer, sun from the upper right)
  cx.save(); cx.globalAlpha = 0.5;
  for (let x = x0; x < x1; x++) { const f = (x - x0) / Math.max(1, g(bx) - x0), y = g(ay + (by - ay) * f) - Math.floor(BELT_H / 2); px(cx, x - 1, y + 10, 1, 1, C.soot[0]); }
  cx.restore();
}

const LAMP: Record<Item["look"], [string, string] | null> = {
  plain: null, ok: [C.ok[1], C.ok[2]], bad: [C.jam[1], C.jam[2]], glow: [C.energy[1], C.energy[3]], wait: [C.jam[1], C.jam[2]],
};
/** A 9x9 crate on the belt at world (x, y = belt centre line): lid on top, slatted front, brass corners, a status lamp. */
export function crate(cx: CanvasRenderingContext2D, x: number, y: number, look: Item["look"]) {
  const ax = g(x) - 4, ay = g(y) - 4 - 9 + 3; // bottom sits on the belt surface
  px(cx, ax, ay, 9, 10, C.soot[0]);
  // lid (top face), lit from the upper right
  px(cx, ax + 1, ay + 1, 7, 3, C.plate[3]); px(cx, ax + 1, ay + 1, 7, 1, C.plate[4]); px(cx, ax + 7, ay + 1, 1, 3, C.plate[4]);
  px(cx, ax + 1, ay + 3, 7, 1, C.plate[2]); // lid lip
  // front face: slats, darker to the left/bottom
  px(cx, ax + 1, ay + 4, 7, 5, C.plate[2]); px(cx, ax + 1, ay + 4, 1, 5, C.plate[1]); px(cx, ax + 1, ay + 8, 7, 1, C.plate[1]);
  px(cx, ax + 2, ay + 6, 6, 1, C.plate[1]); px(cx, ax + 7, ay + 4, 1, 4, C.plate[3]);
  // brass corner brackets with a glint
  px(cx, ax + 1, ay + 4, 1, 1, C.brass[2]); px(cx, ax + 7, ay + 4, 1, 1, C.brass[4]); px(cx, ax + 1, ay + 8, 1, 1, C.brass[1]); px(cx, ax + 7, ay + 8, 1, 1, C.brass[2]);
  const lamp = LAMP[look];
  if (lamp) {
    px(cx, ax + 4, ay + 5, 2, 2, lamp[0]); px(cx, ax + 5, ay + 5, 1, 1, lamp[1]);
    if (look === "glow" || look === "wait") halo(cx, ax + 5, ay + 6, 4, lamp[0]);
  }
}

/** Light layer: a stepped square-ish halo at 25% (contract: the one place partial alpha is allowed). */
export function halo(cx: CanvasRenderingContext2D, ax: number, ay: number, r: number, color: string, a = 0.25) {
  cx.save(); cx.globalAlpha = a; cx.globalCompositeOperation = "lighter";
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy));
    px(cx, ax - w, ay + dy, w * 2 + 1, 1, color);
  }
  cx.restore();
}

/** The review lever, 7 x 12, at world (x, base). down = just pulled, glow = waiting on you. */
export function lever(cx: CanvasRenderingContext2D, x: number, base: number, mode: "up" | "down" | "glow") {
  const ax = g(x) - 3, ay = g(base) - 12;
  // riveted base box: lit top, dark front, rivet glints
  px(cx, ax, ay + 8, 7, 4, C.soot[0]); px(cx, ax + 1, ay + 8, 5, 1, C.iron[4]); px(cx, ax + 1, ay + 9, 5, 2, C.iron[2]);
  px(cx, ax + 5, ay + 9, 1, 2, C.iron[3]); px(cx, ax + 1, ay + 10, 1, 1, C.brass[3]); px(cx, ax + 5, ay + 10, 1, 1, C.brass[4]);
  px(cx, ax + 2, ay + 8, 3, 1, C.soot[0]); // the slot
  if (mode === "down") {
    // pulled toward you: short shaft, knob low and right
    px(cx, ax + 3, ay + 6, 1, 2, C.brass[2]); px(cx, ax + 4, ay + 6, 1, 1, C.brass[4]);
    px(cx, ax + 4, ay + 4, 3, 3, C.soot[0]); px(cx, ax + 5, ay + 5, 1, 1, C.jam[1]); px(cx, ax + 5, ay + 4, 1, 1, C.jam[2]);
  } else {
    px(cx, ax + 3, ay + 2, 1, 6, C.brass[2]); px(cx, ax + 4, ay + 3, 1, 5, C.brass[4]); px(cx, ax + 4, ay + 2, 1, 1, C.soot[0]); // shaft with its lit side
    px(cx, ax + 2, ay - 1, 4, 4, C.soot[0]); px(cx, ax + 3, ay, 2, 2, C.jam[1]); px(cx, ax + 4, ay, 1, 1, C.jam[2]); px(cx, ax + 3, ay + 1, 1, 1, C.jam[0]); // ball knob
    if (mode === "glow") halo(cx, ax + 4, ay + 1, 4, C.sun[4]);
  }
}

/** The jam beacon over a stuck station: caged lamp, one slow breath of red light (calm: the only thing that pulses). */
export function beacon(cx: CanvasRenderingContext2D, x: number, top: number, t: number) {
  const ax = g(x) - 3, ay = g(top) - 8;
  halo(cx, ax + 3, ay + 3, 8, C.jam[1], 0.2 + 0.1 * Math.sin(t * 2.4));
  px(cx, ax + 1, ay, 5, 1, C.soot[0]); px(cx, ax, ay + 1, 7, 5, C.soot[0]);
  px(cx, ax + 1, ay + 1, 5, 4, C.jam[0]); px(cx, ax + 2, ay + 1, 3, 3, C.jam[1]); px(cx, ax + 3, ay + 1, 2, 1, C.jam[2]); px(cx, ax + 4, ay + 2, 1, 1, C.white[0]);
  px(cx, ax + 3, ay + 1, 1, 4, C.soot[0]); // cage bar
  px(cx, ax, ay + 6, 7, 2, C.soot[0]); px(cx, ax + 1, ay + 6, 5, 1, C.brass[3]); px(cx, ax + 5, ay + 6, 1, 1, C.brass[5]); // brass collar
}
