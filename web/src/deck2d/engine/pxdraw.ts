import { ART_PX, PALETTE as C, type Item } from "../contract";

// The engine's own pieces drawn as pixel art in code (contract: the pixel canvas): belt, crates, lever, jam beacon.
// Everything is in art px; px() turns that into world units on the art grid.

const P = ART_PX;
const g = (n: number) => Math.round(n / P); // world -> art px
/** Fill w x h art px whose top-left is art px (ax, ay). */
function px(cx: CanvasRenderingContext2D, ax: number, ay: number, w: number, h: number, color: string) {
  cx.fillStyle = color; cx.fillRect(ax * P, ay * P, w * P, h * P);
}

const BELT_H = 12;
const SEG = 14; // one belt plate, art px
/** One belt run from (ax, ay) to (bx, by) in world units, plates moving right. Slopes become 1-px stairs.
 * 3/4 view like Justin's mockups and the deck's underside, top to bottom: soot, the status line on the back rail
 * (green, red in a blocked bay) with brass studs on its posts, a shadowed gap, a track of cool steel plates (lit at
 * the back, a sun-lit right edge, brass rivets) with one chevron per plate, a brass front lip, an iron front face
 * with steel roller hubs, soot. Each bay supplies its own accumulated movement phase; no cargo means a stationary
 * green belt. */
export function beltRun(cx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, len: number, t: number, speed: number, blockedAt: (worldX: number) => boolean = () => false, phaseAt: (worldX: number) => number = () => 0) {
  const x0 = g(ax), x1 = g(ax + (bx - ax) * Math.min(1, len / Math.hypot(bx - ax, by - ay)));
  // cast shadow on the floor first (light layer, sun from the upper right: it falls down-left)
  cx.save(); cx.globalAlpha = 0.5;
  for (let x = x0; x < x1; x++) { const f = (x - x0) / Math.max(1, g(bx) - x0), y = g(ay + (by - ay) * f) - Math.floor(BELT_H / 2); px(cx, x - 1, y + BELT_H, 1, 2, C.soot[0]); }
  cx.restore();
  for (let x = x0; x < x1; x++) {
    const f = (x - x0) / Math.max(1, g(bx) - x0), y = g(ay + (by - ay) * f) - Math.floor(BELT_H / 2);
    const end = x === x0 || x === x1 - 1, post = x % 28 === 0, postLit = x % 28 === 1;
    const blocked = blockedAt(x * P), signal = blocked ? C.jam : C.ok;
    px(cx, x, y, 1, 1, C.soot[0]);
    // back rail: the status line along its top, a brass stud on every post catching the sun on its right
    px(cx, x, y + 1, 1, 1, end ? signal[2] : post ? C.brass[2] : postLit ? C.brass[4] : signal[1]);
    // the track. Row 0 is the gap in the back rail's shadow; the plates are cool steel, lit at the back (it faces the
    // sun), darker toward the front lip, so the warm crates pop off them.
    const shift = Math.floor(phaseAt(x * P) * speed / P);
    const k = ((x - shift) % SEG + SEG) % SEG;
    const tr = blocked
      ? [C.iron[0], C.jam[0], C.jam[0], C.iron[1], C.iron[1], C.iron[0]]
      : [C.iron[0], C.steel[2], C.steel[1], C.steel[0], C.steel[0], C.iron[0]];
    for (let r = 0; r < 6; r++) px(cx, x, y + 2 + r, 1, 1, tr[r]);
    if (k === 0) px(cx, x, y + 2, 1, 6, C.soot[0]); // plate seam
    else if (k === 1) px(cx, x, y + 3, 1, 4, blocked ? C.iron[0] : C.steel[0]); // the plate's shaded left edge
    else if (k === SEG - 1) { px(cx, x, y + 3, 1, 1, blocked ? C.jam[1] : C.steel[3]); px(cx, x, y + 4, 1, 3, blocked ? C.jam[0] : C.steel[2]); } // its sun-lit right edge
    else if (k === SEG - 2) { px(cx, x, y + 3, 1, 1, C.brass[4]); px(cx, x, y + 6, 1, 1, C.brass[2]); } // rivets, brass as jewelry
    // One chevron per plate. Healthy plates travel right; a red blocked bay holds its entire pattern still.
    const d = k - 5;
    if (d === 0 || d === 1) { px(cx, x, y + 3, 1, 1, signal[2]); px(cx, x, y + 6, 1, 1, signal[1]); }
    if (d === 1 || d === 2) { px(cx, x, y + 4, 1, 1, signal[2]); px(cx, x, y + 5, 1, 1, signal[1]); }
    if (d === 2) px(cx, x, y + 6, 1, 1, signal[0]); // the chevron's shadow on the plate, falling down-left of its tip
    // front lip: a brass trim line, a glint where it passes a post; the ends carry the status color
    px(cx, x, y + 8, 1, 1, end ? signal[2] : postLit ? C.brass[4] : blocked ? C.jam[0] : C.brass[2]);
    // the iron front face: a roller hub under every plate (static: the plates move, the rollers' frame doesn't),
    // iron rivets between them and the odd rust run
    const hub = x % SEG;
    px(cx, x, y + 9, 1, 1, hub === 6 ? C.steel[2] : hub === 7 ? C.steel[3] : hub === 13 ? C.iron[3] : C.iron[1]);
    px(cx, x, y + 10, 1, 1, hub === 6 ? C.steel[0] : hub === 7 ? C.steel[1] : hub === 13 && x % 42 === 13 ? C.copper[0] : C.iron[0]);
    px(cx, x, y + 11, 1, 1, C.soot[0]);
  }
}

const BADGE_FONT: Record<string, string[]> = {
  "#": ["101", "111", "101", "111", "101"], P: ["110", "101", "110", "100", "100"], R: ["110", "101", "110", "101", "101"],
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["110", "001", "010", "100", "111"],
  "3": ["110", "001", "010", "001", "110"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "110", "001", "110"],
  "6": ["011", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "110"],
};
export function crateBadge(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  const text = label.slice(0, 6), width = text.length * 4 + 1, left = g(x) - Math.floor(width / 2), top = g(y) - 21;
  px(ctx, left - 1, top - 1, width + 2, 9, C.soot[0]); px(ctx, left, top, width, 7, C.steel[0]);
  [...text].forEach((c, n) => BADGE_FONT[c]?.forEach((row, yy) => [...row].forEach((bit, xx) => {
    if (bit === "1") px(ctx, left + 1 + n * 4 + xx, top + 1 + yy, 1, 1, C.white[0]);
  })));
}

const LAMP: Record<Item["look"], { mark: "check" | "cross" | "dot" | null; c: readonly [string, string, string] }> = {
  plain: { mark: null, c: [C.plate[1], C.plate[2], C.plate[3]] },
  ok: { mark: "check", c: [C.ok[0], C.ok[1], C.ok[2]] },
  bad: { mark: "cross", c: [C.jam[0], C.jam[1], C.jam[2]] },
  glow: { mark: "dot", c: [C.energy[0], C.energy[2], C.energy[3]] },
  wait: { mark: "dot", c: [C.jam[0], C.jam[1], C.jam[2]] },
};
/** A 13 x 12 wooden crate on the belt at world (x, y = belt centre line), 3/4 view like the mockups: lit lid on top,
 * planked front with a brass frame and corner brackets, and its status painted on the front (green check = ok). */
export function crate(cx: CanvasRenderingContext2D, x: number, y: number, look: Item["look"]) {
  const W = 13, ax = g(x) - 6, ay = g(y) - 12 + 2; // bottom sits on the track
  const wood = C.plate, br = C.brass;
  px(cx, ax, ay, W, 12, C.soot[0]); // outline
  // lid (top face, 3 rows), lit from the upper right: lighter than the deck's wood so the crate pops off the floor
  px(cx, ax + 1, ay + 1, W - 2, 3, wood[4]); px(cx, ax + 1, ay + 1, W - 2, 1, C.sun[6]); px(cx, ax + 1, ay + 3, W - 2, 1, wood[3]);
  px(cx, ax + 4, ay + 2, 5, 1, wood[3]); // lid plank seam
  // front face: 7 rows of pale planks inside a dark iron frame (cool against the warm wall, like the mockups)
  px(cx, ax + 1, ay + 4, W - 2, 7, wood[3]);
  px(cx, ax + 2, ay + 7, W - 4, 1, wood[2]); // plank seam
  px(cx, ax + W - 3, ay + 5, 1, 5, wood[4]); // sun rim on the right
  px(cx, ax + 1, ay + 4, 1, 7, C.iron[1]); px(cx, ax + W - 2, ay + 4, 1, 7, C.iron[2]); px(cx, ax + 1, ay + 10, W - 2, 1, C.iron[1]);
  // brass frame: top edge and corner brackets with a glint on the sunny side
  px(cx, ax + 1, ay + 4, W - 2, 1, br[2]); px(cx, ax + W - 4, ay + 4, 3, 1, br[4]);
  px(cx, ax + 1, ay + 10, 2, 1, br[1]); px(cx, ax + W - 3, ay + 10, 2, 1, br[2]);
  px(cx, ax + 1, ay + 5, 1, 1, br[2]); px(cx, ax + W - 2, ay + 5, 1, 1, br[4]);
  const L = LAMP[look];
  const mx = ax + 4, my = ay + 5; // a 5 x 5 mark in the middle of the front
  if (L.mark === "check") {
    // a fat check: dark outline under, bright stroke on top
    for (const [dx, dy] of [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1]]) { px(cx, mx + dx - 1, my + dy, 2, 1, L.c[1]); px(cx, mx + dx - 1, my + dy + 1, 2, 1, L.c[0]); }
    px(cx, mx + 4, my + 1, 1, 1, L.c[2]); px(cx, mx + 3, my + 2, 1, 1, L.c[2]);
  } else if (L.mark === "cross") {
    for (let i = 0; i < 4; i++) { px(cx, mx + i, my + i, 1, 1, L.c[1]); px(cx, mx + 3 - i, my + i, 1, 1, L.c[1]); }
    px(cx, mx + 3, my, 1, 1, L.c[2]);
  } else if (L.mark === "dot") {
    px(cx, mx + 1, my + 1, 3, 3, L.c[0]); px(cx, mx + 2, my + 1, 2, 2, L.c[1]); px(cx, mx + 3, my + 1, 1, 1, L.c[2]);
    halo(cx, mx + 2, my + 2, 5, L.c[1]);
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

/** The review lever, 11 x 18, at world (x, base), like the mockup's: a riveted brass-trimmed iron box with a slot, a
 * long iron shaft with a brass collar, and a big red ball. down = just pulled (toward you), glow = waiting on you. */
export function lever(cx: CanvasRenderingContext2D, x: number, base: number, mode: "up" | "down" | "glow") {
  const ax = g(x) - 5, ay = g(base) - 18;
  // base box, 11 x 6: lit top face, dark front, brass trim line and corner rivets, the slot in the top
  px(cx, ax, ay + 12, 11, 6, C.soot[0]);
  px(cx, ax + 1, ay + 13, 9, 1, C.iron[3]); px(cx, ax + 7, ay + 13, 3, 1, C.iron[4]); // top face, sun on the right
  px(cx, ax + 1, ay + 14, 9, 1, C.brass[3]); px(cx, ax + 8, ay + 14, 2, 1, C.brass[5]); // brass trim, glint
  px(cx, ax + 1, ay + 15, 9, 2, C.iron[1]); px(cx, ax + 9, ay + 15, 1, 2, C.iron[2]); // front face, sun rim
  px(cx, ax + 1, ay + 16, 2, 1, C.iron[0]); // grime low and left
  px(cx, ax + 2, ay + 15, 1, 1, C.brass[2]); px(cx, ax + 8, ay + 15, 1, 1, C.brass[4]); // rivets
  px(cx, ax + 4, ay + 13, 3, 1, C.soot[0]); // the slot
  const ball = (bx: number, by: number) => { // a 4 x 4 red ball, lit up-right, with a white glint
    px(cx, bx - 1, by - 1, 6, 6, C.soot[0]);
    px(cx, bx, by, 4, 4, C.jam[1]); px(cx, bx, by + 3, 4, 1, C.jam[0]); px(cx, bx, by, 1, 4, C.jam[0]);
    px(cx, bx + 2, by, 2, 1, C.jam[2]); px(cx, bx + 3, by + 1, 1, 1, C.jam[2]); px(cx, bx + 2, by, 1, 1, C.white[0]);
  };
  if (mode === "down") {
    // pulled toward you: the shaft leans out of the slot, the ball sits low and right
    px(cx, ax + 5, ay + 10, 1, 3, C.iron[3]); px(cx, ax + 6, ay + 9, 1, 2, C.iron[4]); px(cx, ax + 4, ay + 12, 3, 1, C.brass[3]);
    ball(ax + 6, ay + 5);
  } else {
    // upright: iron shaft with a lit right side, a brass collar near the bottom
    px(cx, ax + 4, ay + 3, 3, 10, C.soot[0]);
    px(cx, ax + 5, ay + 4, 1, 9, C.iron[3]); px(cx, ax + 5, ay + 4, 1, 1, C.iron[4]);
    px(cx, ax + 4, ay + 10, 3, 2, C.brass[3]); px(cx, ax + 6, ay + 10, 1, 1, C.brass[5]); // collar
    ball(ax + 4, ay);
    if (mode === "glow") halo(cx, ax + 6, ay + 2, 6, C.sun[4]);
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
