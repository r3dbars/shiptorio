// The iron card in pixel mode (?px=1, contract: the pixel canvas). The plate, its buttons and the trust dots are drawn
// in code at art resolution, in Black Iron 48 colors only, and blown up at a whole-number CSS scale with smoothing off,
// so the card reads as the same piece of pixel art as the deck. Light from the upper right, 1 art px soot outline.

import { PALETTE } from "../contract";

const { soot, iron, brass, plate, sun, ok } = PALETTE;

/** CSS px per art px for the card: whole numbers only. Bigger than the deck's own pixel so the words stay readable. */
export const cardScale = (width = globalThis.innerWidth ?? 400) => (width >= 900 ? 3 : 2);

type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, color: string, x: number, y: number, w = 1, h = 1) => { c.fillStyle = color; c.fillRect(x, y, w, h); };

// a stable little hash so rust speckles and seams don't jump between repaints
const noise = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A brass rivet, 2 x 2: lit top-right, shadowed bottom-left. */
function rivet(c: Ctx, x: number, y: number) {
  px(c, brass[2], x, y, 2, 2);
  px(c, brass[4], x + 1, y);
  px(c, brass[1], x, y + 1);
}

/**
 * A brass corner bracket, 12 x 12 with its inner corner cut off and a big rivet. (x, y) is the plate's corner;
 * dx/dy point into the plate. Shaded in world terms so the light stays upper-right on all four corners.
 */
function bracket(c: Ctx, x: number, y: number, dx: 1 | -1, dy: 1 | -1) {
  const N = 12;
  const inside = (u: number, v: number) => u >= 0 && v >= 0 && u < N && v < N && u + v <= 16;
  // local (u, v) -> plate px, and back
  const X = (u: number) => (dx > 0 ? x + u : x - u - 1);
  const Y = (v: number) => (dy > 0 ? y + v : y - v - 1);
  const at = (wx: number, wy: number) => inside(dx > 0 ? wx - x : x - 1 - wx, dy > 0 ? wy - y : y - 1 - wy);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    if (!inside(u, v)) continue;
    const wx = X(u), wy = Y(v);
    const up = at(wx, wy - 1), right = at(wx + 1, wy), down = at(wx, wy + 1), left = at(wx - 1, wy);
    const color = !up || !right || !down || !left
      ? (!up || !right ? brass[5] : brass[1])
      : brass[3];
    px(c, color, wx, wy);
  }
  // soot outline on the plate side (the screen edge side is already the plate's outline)
  for (let v = -1; v <= N; v++) for (let u = -1; u <= N; u++) {
    if (inside(u, v) || !(inside(u + 1, v) || inside(u - 1, v) || inside(u, v + 1) || inside(u, v - 1))) continue;
    if (u < 0 || v < 0) continue;
    px(c, soot[0], X(u), Y(v));
  }
  // the rivet: 3 x 3, lit top-right, shadow bottom-left
  const rx = Math.min(X(3), X(5)), ry = Math.min(Y(3), Y(5));
  px(c, brass[2], rx, ry, 3, 3);
  px(c, brass[4], rx + 1, ry, 2, 2);
  px(c, brass[5], rx + 2, ry);
  px(c, brass[0], rx, ry + 2, 2, 1);
  px(c, brass[0], rx, ry + 1);
}

/**
 * The card's plate: soot outline, a riveted iron band with a brass trim line inside it, a dark plate face with
 * faint seams and rust, and brass brackets in the corners.
 */
export function paintPlate(c: Ctx, w: number, h: number) {
  c.clearRect(0, 0, w, h);
  px(c, soot[0], 0, 0, w, h);
  // the band: 4 px of iron, lit along the top and right
  px(c, iron[2], 1, 1, w - 2, h - 2);
  px(c, iron[3], 1, 1, w - 2, 1);
  px(c, iron[3], w - 2, 1, 1, h - 2);
  px(c, iron[1], 1, h - 2, w - 2, 1);
  px(c, iron[1], 1, 1, 1, h - 2);
  // brass trim just inside the band
  px(c, brass[2], 5, 5, w - 10, h - 10);
  px(c, brass[4], 5, 5, w - 10, 1);
  px(c, brass[4], w - 6, 5, 1, h - 10);
  // the face
  px(c, soot[0], 6, 6, w - 12, h - 12);
  px(c, iron[1], 7, 7, w - 14, h - 14);
  // seams: a couple of vertical plate joints and one horizontal, in the ramp's darkest color with a lit lip
  const seams = [Math.round(w * 0.33), Math.round(w * 0.71)];
  for (const sx of seams) { px(c, iron[0], sx, 7, 1, h - 14); px(c, iron[2], sx + 1, 7, 1, h - 14); }
  const sy = Math.round(h * 0.58);
  px(c, iron[0], 7, sy, w - 14, 1);
  px(c, iron[2], 7, sy - 1, w - 14, 1);
  // rust and wear, sparse
  // rust: a few small streaks running down from a point, never single loose pixels
  for (let y = 9; y < h - 12; y += 3) for (let x = 9; x < w - 9; x += 3) {
    if (noise(x, y) > 0.012) continue;
    const len = 1 + Math.floor(noise(y, x) * 3);
    px(c, plate[2], x, y);
    px(c, plate[1], x, y + 1, 1, len);
    if (noise(x + 1, y) > 0.5) px(c, plate[1], x + 1, y + 1, 1, Math.max(1, len - 2));
  }
  // rivets along the band
  for (let x = 12; x < w - 12; x += 10) { rivet(c, x, 2); rivet(c, x, h - 4); }
  for (let y = 12; y < h - 12; y += 10) { rivet(c, 2, y); rivet(c, w - 4, y); }
  // brackets on the corners, over the band
  bracket(c, 0, 0, 1, 1);
  bracket(c, w, 0, -1, 1);
  bracket(c, 0, h, 1, -1);
  bracket(c, w, h, -1, -1);
  // one warm rim px down the right edge
  px(c, sun[5], w - 1, 8, 1, h - 16);
}

/**
 * A button: soot outline, a 3 px band (iron for Later, brass for the lit one), dark face inside.
 * glow = brass band with a hot inner line: the button the card is heading for, and Approve.
 */
export function paintButton(c: Ctx, w: number, h: number, glow: boolean) {
  c.clearRect(0, 0, w, h);
  px(c, soot[0], 0, 0, w, h);
  const band = glow ? brass : iron;
  px(c, glow ? brass[3] : iron[2], 1, 1, w - 2, h - 2);
  px(c, glow ? brass[5] : iron[3], 1, 1, w - 2, 1);
  px(c, glow ? brass[5] : iron[3], w - 2, 1, 1, h - 2);
  px(c, band[1], 1, h - 2, w - 2, 1);
  px(c, band[1], 1, 1, 1, h - 2);
  px(c, soot[0], 3, 3, w - 6, h - 6);
  px(c, glow ? plate[0] : iron[1], 4, 4, w - 8, h - 8);
  if (glow) { px(c, sun[5], 4, 4, w - 8, 1); px(c, sun[4], 4, h - 5, w - 8, 1); }
  // little bolts in the band's corners
  for (const [x, y] of [[1, 1], [w - 3, 1], [1, h - 3], [w - 3, h - 3]] as const) {
    px(c, brass[glow ? 5 : 3], x, y, 2, 2);
    px(c, brass[1], x, y + 1);
  }
}

/** A trust dot, 7 x 7 art px. on = brass, done = ok green (only when the kind runs on its own), off = an iron ring. */
export function paintDot(c: Ctx, state: "off" | "on" | "done") {
  c.clearRect(0, 0, 7, 7);
  const ring = [[2, 0, 3, 1], [1, 1, 1, 1], [5, 1, 1, 1], [0, 2, 1, 3], [6, 2, 1, 3], [1, 5, 1, 1], [5, 5, 1, 1], [2, 6, 3, 1]] as const;
  const outline = state === "off" ? iron[3] : soot[0];
  for (const [x, y, w, h] of ring) px(c, outline, x, y, w, h);
  const ramp = state === "done" ? [ok[0], ok[1], ok[2]] : state === "on" ? [brass[2], brass[4], brass[5]] : [iron[0], iron[0], iron[1]];
  px(c, ramp[1], 2, 1, 3, 5);
  px(c, ramp[1], 1, 2, 5, 3);
  px(c, ramp[0], 1, 4, 2, 1); px(c, ramp[0], 2, 5, 2, 1); // shadow bottom-left
  px(c, ramp[2], 4, 2, 1, 1); px(c, ramp[2], 3, 1, 2, 1); // light top-right
}

/** One canvas painted at art size and shown at a whole-number scale; repaints when its box changes. */
export function pixelLayer(box: HTMLElement, scale: () => number, paint: (c: Ctx, w: number, h: number) => void) {
  const cv = document.createElement("canvas");
  cv.className = "ic-pxbg";
  cv.setAttribute("aria-hidden", "true");
  box.prepend(cv);
  let last = "";
  const draw = () => {
    const p = scale();
    const r = box.getBoundingClientRect();
    const w = Math.max(16, Math.round(r.width / p)), h = Math.max(12, Math.round(r.height / p));
    const key = `${w}x${h}@${p}`;
    if (key === last) return;
    last = key;
    cv.width = w;
    cv.height = h;
    cv.style.width = `${w * p}px`;
    cv.style.height = `${h * p}px`;
    const c = cv.getContext("2d");
    if (c) { c.imageSmoothingEnabled = false; paint(c, w, h); }
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(draw) : null;
  ro?.observe(box);
  globalThis.requestAnimationFrame?.(draw);
  return { redraw: () => { last = ""; draw(); }, stop: () => ro?.disconnect() };
}
