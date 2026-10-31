// The city's small pictures, drawn in city px with the 48 palette colours: the islands' dither, the halos (rings drawn
// source-over at 25 or 50%, the one allowed partial alpha), the islands' own lights, the dotted rocket arc and its
// arrowhead, Customers' small rocket (its flight along the arc, its drop onto the pad and its dust puff), Marketing's beacon,
// and the grow glow: a backlight behind the line, the sunset sky round it stepped up its own ramps. The connectors are
// connector.ts. Pure helpers come first (tested without a canvas).
import { PALETTE as C, PALETTE_48 } from "../contract";
import type { Rect } from "./layout";
import type { XY } from "./manifest";

// ---------- pure helpers ----------
/** The dither step between dark and lit: a checker of 2 x 2 px cells. Pixel (x, y) shows the lit picture when
 *  ((x >> 1) + (y >> 1)) & 1 is 0, the dark one otherwise. */
export const litCell = (x: number, y: number) => (((x >> 1) + (y >> 1)) & 1) === 0;
export function checker(lit: Uint8ClampedArray, dark: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(lit.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, from = litCell(x, y) ? lit : dark;
    out[o] = from[o]; out[o + 1] = from[o + 1]; out[o + 2] = from[o + 2]; out[o + 3] = from[o + 3];
  }
  return out;
}
/** How long the checker shows when an island steps back to dark (beat 5), on the city's own clock. */
export const DIM_DITHER = 0.12;

/** The dust puff as the rocket lands: three frames of 0.13 s, each a pair of 7 x 5 clumps (a soot outline round a white[0] top
 *  row and a haze[3] body) this far either side of its foot, the third a px higher as it rises, the first with an 11 x 1
 *  haze[2] skirt under the rocket; then gone. */
export const PUFF_FRAME = 0.13;
export const PUFF_OUT = [9, 15, 21] as const;
export const puffFrame = (t: number) => (t < 0 ? -1 : Math.floor(t / PUFF_FRAME) < PUFF_OUT.length ? Math.floor(t / PUFF_FRAME) : -1);

/** Inside a stepped disc of radius r (rows of half-width round(sqrt(r^2 - dy^2))). */
export const inDisc = (r: number, dx: number, dy: number) => Math.abs(dy) <= r && Math.abs(dx) <= Math.round(Math.sqrt(r * r - dy * dy));
/** A ring: inside radius `outer`, outside radius `inner`. Two rings (7-4 and 4-2) tile without overlapping. */
export const inRing = (outer: number, inner: number, dx: number, dy: number) => inDisc(outer, dx, dy) && !inDisc(inner, dx, dy);
/** Inside an ellipse of radii rx, ry. */
export const inEllipse = (rx: number, ry: number, dx: number, dy: number) => (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;

// ---------- halos ----------
type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
/** A ring as runs of whole px per row (dy, from dx0 to dx1 inclusive), made once per pair of radii. */
const ringRuns = new Map<string, [number, number, number][]>();
export function runsOf(outer: number, inner: number): [number, number, number][] {
  const key = `${outer},${inner}`;
  let runs = ringRuns.get(key);
  if (!runs) {
    runs = [];
    for (let dy = -outer; dy <= outer; dy++) {
      let start: number | null = null;
      for (let dx = -outer; dx <= outer + 1; dx++) {
        const on = dx <= outer && inRing(outer, inner, dx, dy);
        if (on && start === null) start = dx;
        if (!on && start !== null) { runs.push([dy, start, dx - 1]); start = null; }
      }
    }
    ringRuns.set(key, runs);
  }
  return runs;
}
/** A glow ring on the light layer, source-over (alphas never add up), skipping the lit thing's own box. */
export function ring(c: Ctx, cx: number, cy: number, outer: number, inner: number, color: string, alpha: number, skip?: Rect) {
  c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = "source-over"; c.fillStyle = color;
  for (const [dy, a, b] of runsOf(outer, inner)) {
    const y = cy + dy, x0 = cx + a, x1 = cx + b;
    if (!skip || y < skip.y || y >= skip.y + skip.h || x1 < skip.x || x0 >= skip.x + skip.w) { c.fillRect(x0, y, x1 - x0 + 1, 1); continue; }
    if (x0 < skip.x) c.fillRect(x0, y, skip.x - x0, 1); // the run either side of the skipped box
    if (x1 >= skip.x + skip.w) c.fillRect(skip.x + skip.w, y, x1 - skip.x - skip.w + 1, 1);
  }
  c.restore();
}
/** A lantern's glow: r 7-4 in brass[3] at 25%, then r 4-2 in brass[4] at 50%. `step` 1 and 2 are its bloom as it comes on
 *  (an island lamp, 0.06 s each): r 3-2 in brass[4] at 50%, then that with r 5-3 in brass[3] at 25% round it. */
export function lanternHalo(c: Ctx, at: XY, skip?: Rect, step: 1 | 2 | 3 = 3) {
  if (step === 3) {
    ring(c, at[0], at[1], 7, 4, C.brass[3], 0.25, skip);
    ring(c, at[0], at[1], 4, 2, C.brass[4], 0.5, skip);
    return;
  }
  if (step === 2) ring(c, at[0], at[1], 5, 3, C.brass[3], 0.25, skip);
  ring(c, at[0], at[1], 3, 2, C.brass[4], 0.5, skip);
}
// ---------- the grow glow: a backlight behind the line ----------
/** While the factory "must grow", the sunset sky round the line warms up like a backlight: inside the outer ellipse each
 *  sky pixel snaps to its nearest palette colour and steps one place up its own ramp, inside the inner one two places. Only
 *  the sky's ramps (sun and copper) move: the skyline's towers (iron, haze, plate, steel, soot) stay dark silhouettes, so no
 *  edge of the glow ever crosses a tower. Each ellipse's edge is a 4 px band of 2 x 2 checker, never a hard arc. Opaque
 *  palette colours only: no alpha, so it reads as light on the sky, not a film over it. */
export const GROW_GLOW = { at: [150, 40] as XY, outer: [196, 78] as XY, inner: [150, 56] as XY } as const;
/** Half the dithered band round each ellipse's edge: from r - 2 to r + 2 the checker picks the inner or the outer count. */
export const GLOW_BAND = 2;
/** Each palette colour's index in PALETTE_48 and its place on its own ramp. */
const RAMPS = Object.entries(C) as [keyof typeof C, readonly string[]][];
const INDEX = new Map<string, number>(PALETTE_48.map((hex, i) => [hex, i]));
const at48 = (ramp: keyof typeof C, k: number) => INDEX.get(C[ramp][k])!;
/** One step up the sky's own ramps: sun[k] -> sun[k+1], copper[k] -> copper[k+1] (the top of each stays). Everything else
 *  stays where it is. A sun or copper pixel never leaves its ramp. */
const WARM: number[] = PALETTE_48.map((_, i) => i);
for (const [ramp, list] of RAMPS) list.forEach((_, k) => {
  if ((ramp === "sun" || ramp === "copper") && k < list.length - 1) WARM[at48(ramp, k)] = at48(ramp, k + 1);
});
/** The ramp and place of a PALETTE_48 index, for the tests. */
export function rampOf(i: number): { ramp: keyof typeof C; k: number } {
  let n = i;
  for (const [ramp, list] of RAMPS) { if (n < list.length) return { ramp, k: n }; n -= list.length; }
  throw new Error(`no palette colour ${i}`);
}
/** One or two steps up the ramps, from a PALETTE_48 index. */
export const warmStep = (i: number, steps: number): number => (steps <= 0 ? i : warmStep(WARM[i], steps - 1));
const RGB48 = PALETTE_48.map((h) => [1, 3, 5].map((o) => parseInt(h.slice(o, o + 2), 16)));
const nearCache = new Map<number, number>();
/** The PALETTE_48 index nearest an RGB colour (the same rule as the pixel canvas's own snap). */
export function nearest48(r: number, g: number, b: number): number {
  const key = (r << 16) | (g << 8) | b;
  let best = nearCache.get(key);
  if (best === undefined) {
    let d = Infinity; best = 0;
    RGB48.forEach(([pr, pg, pb], i) => { const e = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (e < d) { d = e; best = i; } });
    nearCache.set(key, best);
  }
  return best;
}
/** Where (dx, dy) is against an ellipse's edge: "in" inside its band, "out" outside it, "edge" in the 4 px band. */
const against = (r: XY, dx: number, dy: number) =>
  inEllipse(r[0] - GLOW_BAND, r[1] - GLOW_BAND, dx, dy) ? "in" : inEllipse(r[0] + GLOW_BAND, r[1] + GLOW_BAND, dx, dy) ? "edge" : "out";
/** How many steps the warm-up takes at city px (x, y): 2 inside the inner ellipse, 1 inside the outer one, else 0; in the
 *  4 px band round either edge, the inner count on the checker's lit cells (litCell) and the outer one on the others. */
export function warmSteps(x: number, y: number): number {
  const [cx, cy] = GROW_GLOW.at, dx = x - cx, dy = y - cy, cell = litCell(x, y);
  const pick = (where: "in" | "edge" | "out", inside: number, outside: number) => (where === "in" || (where === "edge" && cell) ? inside : outside);
  return pick(against(GROW_GLOW.inner, dx, dy), 2, pick(against(GROW_GLOW.outer, dx, dy), 1, 0));
}
/** Warms an RGBA picture whose top-left pixel is city px (ox, oy), in place. Transparent pixels stay as they are. */
export function warmUp(d: Uint8ClampedArray, w: number, h: number, ox: number, oy: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const steps = warmSteps(ox + i, oy + j), o = (j * w + i) * 4;
    if (!steps || d[o + 3] === 0) continue;
    const [r, g, b] = RGB48[warmStep(nearest48(d[o], d[o + 1], d[o + 2]), steps)];
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
}
/** The grow glow on the city buffer: reads the backdrop under the outer ellipse (the sky, before any connector or line pixel
 *  is drawn), warms it and puts it back. Only while the glow is on, so a frame without it never reads the canvas. */
export function warmBackdrop(c: Ctx) {
  const m = c.getTransform(), [cx, cy] = GROW_GLOW.at, [rx, ry] = GROW_GLOW.outer;
  const x0 = Math.round(m.a * (cx - rx) + m.e), y0 = Math.round(m.d * (cy - ry) + m.f);
  const bx = Math.max(0, x0), by = Math.max(0, y0);
  const bw = Math.min(c.canvas.width, x0 + 2 * rx + 1) - bx, bh = Math.min(c.canvas.height, y0 + 2 * ry + 1) - by;
  if (bw <= 0 || bh <= 0) return;
  const img = c.getImageData(bx, by, bw, bh);
  warmUp(img.data, bw, bh, Math.round((bx - m.e) / m.a), Math.round((by - m.f) / m.d));
  c.putImageData(img, bx, by);
}

// ---------- the islands' own lights (manifest `lights`), steady once an island is lit ----------
export type LightKind = "signal" | "pad" | "thruster" | "window" | "crack";
export interface IslandLight { at: XY; kind: LightKind }
/** The steady part of a light (signal, pad, window, thruster core). Drawn after the island sprite. */
export function drawLight(c: Ctx, l: IslandLight) {
  const [x, y] = l.at;
  if (l.kind === "signal" || l.kind === "pad") { px(c, x, y, 2, 2, C.brass[4]); px(c, x + 1, y, 1, 1, C.brass[5]); }
  else if (l.kind === "window") px(c, x, y, 2, 2, C.brass[4]);
  else if (l.kind === "thruster") px(c, x - 1, y, 3, 2, C.energy[3]);
}
/** A light's glow, if it has one: thrusters r 5-2 energy[2], the crack r 6-3 sun[3], both at 25%. */
export function lightHalo(c: Ctx, l: IslandLight) {
  const [x, y] = l.at;
  if (l.kind === "thruster") ring(c, x, y, 5, 2, C.energy[2], 0.25, { x: x - 1, y, w: 3, h: 2 });
  else if (l.kind === "crack") ring(c, x, y, 6, 3, C.sun[3], 0.25);
}

// ---------- islands ----------
export type IslandImage = CanvasImageSource & { width: number; height: number };
const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  return { c, g };
};
/** The checker of lit over dark, made once per island from its two pictures. */
export function makeDither(lit: HTMLImageElement, dark: HTMLImageElement): HTMLCanvasElement {
  const w = lit.naturalWidth, h = lit.naturalHeight, a = canvas(w, h), b = canvas(w, h);
  a.g.drawImage(lit, 0, 0); b.g.drawImage(dark, 0, 0);
  const out = checker(a.g.getImageData(0, 0, w, h).data, b.g.getImageData(0, 0, w, h).data, w, h);
  a.g.putImageData(new ImageData(out, w, h), 0, 0);
  return a.c;
}

// ---------- the arc, the rocket, the puff, the beacon ----------
/** Paints a small sprite from rows of letters (a space or . is clear), one city px per letter. */
function sprite(c: Ctx, x: number, y: number, rows: readonly string[], key: Record<string, string>) {
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const color = key[row[i]]; if (color) px(c, x + i, y + j, 1, 1, color); } });
}
/** A lit arc dot, 5 x 5: a soot outline round a 3 x 3 brass bead with a brass[5] glint. */
export const DOT = [".SSS.", "SbbBS", "SbbbS", "SbbbS", ".SSS."];
/** A dark arc dot, the lit one's 5 x 5 shape: a soot outline round a 3 x 3 iron[1] bead with an iron[3] glint. */
export const DOT_DARK = DOT;
const DOT_LIT_KEY = { S: C.soot[0], b: C.brass[4], B: C.brass[5] }, DOT_DARK_KEY = { S: C.soot[0], b: C.iron[1], B: C.iron[3] };
/** The arrowhead at the pad end, 7 x 5, pointing down (while every dot is lit and the capsule is on its way). */
export const ARROW = ["SSSSSSS", "SBBBBBS", ".SBBBS.", "..SBS..", "...S..."];
const ARROW_KEY = { S: C.soot[0], B: C.brass[5] };
/** The dotted route from the line's rocket to the Customers pad. Dots lit from the rocket (index 0) are brass beads with a
 *  glow; the rest are dark iron beads of the same size. `show(j)` false leaves dot j out (a phone hides the ones that would
 *  sit under its caption band). The arrowhead shows only with `arrow`. */
export function drawArc(c: Ctx, dots: XY[], lit: number, tip: XY, arrow: boolean, show: (j: number) => boolean = () => true) {
  for (let j = 0; j < dots.length; j++) {
    if (!show(j)) continue;
    const [x, y] = dots[j];
    if (j < lit) ring(c, x, y, 4, 2, C.brass[4], 0.25, { x: x - 2, y: y - 2, w: 5, h: 5 });
    sprite(c, x - 2, y - 2, j < lit ? DOT : DOT_DARK, j < lit ? DOT_LIT_KEY : DOT_DARK_KEY);
  }
  if (arrow) sprite(c, tip[0] - 3, tip[1] - 4, ARROW, ARROW_KEY);
}

// ---------- Customers' capsule ----------
/** Customers' rocket, 9 x 15, the line's rocket in small: a copper nose (1, 3, 5 px wide, its right edge copper[4]), a 5 px
 *  body inside a soot outline (haze[3] on the left two columns, white[0] on the right three) with a 2 x 2 energy[2] porthole, a
 *  brass[4] band, copper fins 2 px out each side (copper[1] in the shade, copper[3] in the sun) and an iron[2] nozzle. Light
 *  from the upper right. Its foot (bottom row) stands on the pad. */
export const ROCKET = [
  "....S....",
  "...SNS...",
  "..SnnNS..",
  ".SnnnnNS.",
  ".SHHwwwS.",
  ".SHHeewS.",
  ".SHHeewS.",
  ".SHHwwwS.",
  ".SHHwwwS.",
  ".SBBBBBS.",
  "SSHHwwwSS",
  "SfHHwwwFS",
  "SfHHwwwFS",
  "SfSiiiSFS",
  "SSSiiiSSS",
];
/** The same rocket in flight, nose up and to the right (15 x 15): the side toward the sky white, the other haze. */
export const ROCKET_UP = [
  ".............S.",
  "..........SSSNS",
  ".........SNNnS.",
  "........SNnnnS.",
  ".......SwwnnS..",
  "......SwewHnS..",
  ".....SwweHHS...",
  "..SSSwBwHHS....",
  ".SffwwwBHS.....",
  "SffwwwHHS......",
  ".SSwwHHS.......",
  ".SiiHHFS.......",
  "..SiSFFS.......",
  "...SSFS........",
  ".....S.........",
];
/** Level, nose to the right (15 x 9): ROCKET turned a quarter right with its sunny side up. */
export const ROCKET_LEVEL = [
  "SSSSS..........",
  "SFFFSSSSSSSS...",
  "SSwwwBwwwwwNS..",
  "iiwwwBwweewnNS.",
  "iiwwwBwweewnnNS",
  "iiHHHBHHHHHnnS.",
  "SSHHHBHHHHHnS..",
  "SfffSSSSSSSS...",
  "SSSSS..........",
];
const ROCKET_KEY = { S: C.soot[0], N: C.copper[4], n: C.copper[3], B: C.brass[4], H: C.haze[3], w: C.white[0], e: C.energy[2], f: C.copper[1], F: C.copper[3], i: C.iron[2] };
export function drawRocket(c: Ctx, pad: XY) { sprite(c, pad[0] - 4, pad[1] - ROCKET.length + 1, ROCKET, ROCKET_KEY); }
/** The flame under the upright rocket's nozzle while it comes down: 1 x 2 sun[4]. */
export const FLAME = { w: 1, h: 2, color: C.sun[4] } as const;
export type FlightPose = "up" | "level" | "upright";
/** Where the capsule is when it has flown `p` (0..1) of the dots, in whole city px, and how it flies: nose up and to the
 *  right over dots 0-9, level over 10-16, then upright from dot 17 on, coming down on its flame (no turning in between:
 *  each pose is its own drawing). */
export function flightAt(dots: XY[], p: number): { at: XY; pose: FlightPose } {
  const last = dots.length - 1, u = Math.max(0, Math.min(1, p)) * last, i = Math.min(last - 1, Math.floor(u)), f = u - i;
  const [ax, ay] = dots[i], [bx, by] = dots[i + 1];
  const at: XY = [Math.round(ax + (bx - ax) * f), Math.round(ay + (by - ay) * f)];
  const pose: FlightPose = u < 10 ? "up" : u < 17 ? "level" : "upright";
  return { at, pose };
}
/** The capsule's straight drop from the last dot onto the pad: its centre at `d` (0..1) of the way from `from` to where it
 *  stands on the pad (its foot on the pad's row), in whole city px. */
export function dropAt(from: XY, pad: XY, d: number): XY {
  const to: XY = [pad[0], pad[1] - (ROCKET.length >> 1)], e = Math.max(0, Math.min(1, d));
  return [Math.round(from[0] + (to[0] - from[0]) * e), Math.round(from[1] + (to[1] - from[1]) * e)];
}
const POSES: Record<FlightPose, readonly string[]> = { up: ROCKET_UP, level: ROCKET_LEVEL, upright: ROCKET };
/** The capsule centred on `at` in `pose`; upright, with its flame under the nozzle. */
function drawCapsule(c: Ctx, at: XY, pose: FlightPose) {
  const rows = POSES[pose], x = at[0] - (rows[0].length >> 1), y = at[1] - (rows.length >> 1);
  sprite(c, x, y, rows, ROCKET_KEY);
  if (pose === "upright") px(c, at[0], y + rows.length, FLAME.w, FLAME.h, FLAME.color);
}
/** The capsule in flight along the dots. */
export function drawFlight(c: Ctx, dots: XY[], p: number) {
  const { at, pose } = flightAt(dots, p);
  drawCapsule(c, at, pose);
}
/** The capsule dropping from the last dot onto the pad, upright on its flame. */
export function drawDrop(c: Ctx, dots: XY[], pad: XY, d: number) {
  drawCapsule(c, dropAt(dots[dots.length - 1], pad, d), "upright");
}
/** A dust clump, 7 x 5: a soot outline round a white[0] top row and a haze[3] body. */
export const CLUMP = ["..SSS..", ".SWWWS.", "SWhhhWS", "ShhhhhS", ".SSSSS."];
const CLUMP_KEY = { S: C.soot[0], W: C.white[0], h: C.haze[3] };
/** One frame of the dust puff: a clump either side of the rocket's foot, its bottom row on the foot's row (the third frame a
 *  px higher); the first frame also lays an 11 x 1 haze[2] skirt just under the rocket. */
export function drawPuff(c: Ctx, pad: XY, frame: number) {
  const out = PUFF_OUT[frame];
  if (out === undefined) return;
  const half = CLUMP[0].length >> 1, top = pad[1] - CLUMP.length + 1 - (frame === 2 ? 1 : 0);
  for (const side of [-1, 1]) sprite(c, pad[0] + side * out - half, top, CLUMP, CLUMP_KEY);
  if (frame === 0) px(c, pad[0] - 5, pad[1] + 1, 11, 1, C.haze[2]);
}
/** Marketing's beacon: rings r 14-9 in brass[3] at 25% and r 9-4 in brass[4] at 50% round a 3 x 3 brass[5] core with one
 *  white[0] px. Steady: it never blinks. */
export function drawBeacon(c: Ctx, at: XY) {
  const [x, y] = at, core: Rect = { x: x - 1, y: y - 1, w: 3, h: 3 };
  ring(c, x, y, 14, 9, C.brass[3], 0.25, core);
  ring(c, x, y, 9, 4, C.brass[4], 0.5, core);
  px(c, x - 1, y - 1, 3, 3, C.brass[5]);
  px(c, x + 1, y - 1, 1, 1, C.white[0]);
}
