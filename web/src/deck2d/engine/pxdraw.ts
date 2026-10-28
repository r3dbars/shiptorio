import { ART_PX, PALETTE as C, type Item } from "../contract";

// The engine's own pieces drawn as pixel art in code (contract: the pixel canvas): belt, crates, lever, jam beacon.
// Everything is in art px; px() turns that into world units on the art grid.

const P = ART_PX;
const g = (n: number) => Math.round(n / P); // world -> art px
/** Fill w x h art px whose top-left is art px (ax, ay). */
function px(cx: CanvasRenderingContext2D, ax: number, ay: number, w: number, h: number, color: string) {
  cx.fillStyle = color; cx.fillRect(ax * P, ay * P, w * P, h * P);
}

const BELT_H = 7;
/** One belt run from (ax, ay) to (bx, by) in world units, chevrons moving right. Slopes become 1-px stairs. */
export function beltRun(cx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, len: number, t: number, speed: number) {
  const x0 = g(ax), x1 = g(ax + (bx - ax) * Math.min(1, len / Math.hypot(bx - ax, by - ay)));
  const shift = Math.floor((t * speed) / P);
  for (let x = x0; x < x1; x++) {
    const f = (x - x0) / Math.max(1, g(bx) - x0), y = g(ay + (by - ay) * f) - Math.floor(BELT_H / 2);
    px(cx, x, y, 1, 1, C.soot[0]);
    px(cx, x, y + 1, 1, 1, C.brass[2]); // top rail, lit from above
    px(cx, x, y + 2, 1, 3, C.iron[1]);
    // chevrons: a ">" every 8 px, 3 tall, sliding with the belt
    const k = ((x - shift) % 8 + 8) % 8;
    if (k === 2 || k === 3) px(cx, x, y + 3, 1, 1, C.brass[k === 3 ? 4 : 3]);
    if (k === 1 || k === 2) px(cx, x, k === 1 ? y + 2 : y + 4, 1, 1, C.brass[3]);
    px(cx, x, y + 5, 1, 1, C.iron[0]); // bottom rail in shade
    px(cx, x, y + 6, 1, 1, C.soot[0]);
  }
}

const LAMP: Record<Item["look"], string | null> = { plain: null, ok: C.ok[1], bad: C.jam[1], glow: C.energy[2], wait: C.jam[2] };
/** An 8x8 crate sitting on the belt at world (x, y = belt centre line). */
export function crate(cx: CanvasRenderingContext2D, x: number, y: number, look: Item["look"]) {
  const ax = g(x) - 4, ay = g(y) - 3 - 8; // sits on the belt's top rail
  px(cx, ax, ay, 8, 8, C.soot[0]);
  px(cx, ax + 1, ay + 1, 6, 6, C.plate[2]);
  px(cx, ax + 1, ay + 1, 6, 1, C.plate[4]); // lit top
  px(cx, ax + 6, ay + 2, 1, 5, C.plate[3]); // lit right face
  px(cx, ax + 1, ay + 6, 5, 1, C.plate[1]); // shade
  px(cx, ax + 3, ay + 2, 1, 4, C.plate[1]); // slat
  const lamp = LAMP[look];
  if (lamp) { px(cx, ax + 4, ay + 2, 2, 2, lamp); if (look === "glow" || look === "wait") halo(cx, ax + 5, ay + 3, 4, lamp); }
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

/** The review lever, 5 x 10, at world (x, base). down = just pulled, glow = waiting on you. */
export function lever(cx: CanvasRenderingContext2D, x: number, base: number, mode: "up" | "down" | "glow") {
  const ax = g(x) - 2, ay = g(base) - 10;
  px(cx, ax, ay + 7, 5, 3, C.soot[0]); px(cx, ax + 1, ay + 7, 3, 2, C.iron[3]); px(cx, ax + 3, ay + 7, 1, 2, C.iron[4]);
  if (mode === "down") { px(cx, ax + 2, ay + 5, 1, 2, C.brass[2]); px(cx, ax + 3, ay + 4, 2, 2, C.jam[1]); }
  else {
    px(cx, ax + 2, ay + 1, 1, 6, C.brass[3]); px(cx, ax + 1, ay, 3, 2, C.soot[0]); px(cx, ax + 2, ay, 1, 1, C.jam[2]);
    if (mode === "glow") halo(cx, ax + 2, ay + 1, 3, C.sun[4]);
  }
}

/** The jam beacon over a stuck station: steady lamp, one slow breath of red light (calm: the only thing that pulses). */
export function beacon(cx: CanvasRenderingContext2D, x: number, top: number, t: number) {
  const ax = g(x) - 2, ay = g(top) - 6;
  halo(cx, ax + 2, ay + 2, 7, C.jam[1], 0.2 + 0.1 * Math.sin(t * 2.4));
  px(cx, ax, ay, 5, 6, C.soot[0]); px(cx, ax + 1, ay + 1, 3, 3, C.jam[1]); px(cx, ax + 2, ay + 1, 2, 1, C.jam[2]);
  px(cx, ax + 1, ay + 4, 3, 1, C.brass[2]);
}
