// The build sequence drawn as pixel art, for the pixel canvas (?px=1, contract "the pixel canvas").
// Whole art px only (1 art px = ART_PX world units), PALETTE colors only, light from the upper right, 1 px soot
// outline, 3/4 top-down (a top face over a front face). Quality bar (PIXEL-CANVAS.md): 3-4 ramp steps per part,
// banding on round things, bevels, rivets, grime dither, cast shadows down-left, small slow life only.
// Everything stays inside the stop's slot (SLOT_PX either side of STOP_X).
// The finished machine is the stations thread's drawing: stations/index.ts `drawStation(ctx, id, state)` when it
// exists (feet at STOP_X[id], BELT_Y + LOOK[id].drop). Until then an iron machine stands in.

import { ART_PX, BELT_Y, LOOK, PALETTE as P, STOP_X, type StopId, type StopState } from "../contract";
import { STAGE_AT } from "./timeline";
import { clamp01, easeOut, span } from "../engine/math";

export type DrawStation = (ctx: CanvasRenderingContext2D, id: StopId, state: StopState, t?: number) => void;
type StationsModule = { drawStation?: DrawStation; stationSize?: (id: StopId) => { w: number; h: number } };
// Vite rewrites the glob at build time; plain bun (the tests) has no import.meta.glob, so fall back to the stand-in.
const stations: Record<string, StationsModule> = (() => {
  try { return import.meta.glob<StationsModule>("../stations/index.ts", { eager: true }); } catch { return {}; }
})();
const external = (): DrawStation | undefined => Object.values(stations)[0]?.drawStation;
/** How tall the finished machine is in art px (feet = row 0). */
const heightOf = (stop: StopId) => Object.values(stations)[0]?.stationSize?.(stop).h ?? 38;

/** Half-width of a stop's slot, in art px (110 world units). */
export const SLOT_PX = 22;
const H = 38; // a station's height, art px

const easeIn = (t: number) => t * t * t;

// ---------- the pen: art px, anchored at a stop's feet (x right, y up is negative) ----------
interface Pen {
  r(x: number, y: number, w: number, h: number, c: string): void;
  p(x: number, y: number, c: string): void;
  /** Checker dither of two colors (grime, soft band edges). */
  d(x: number, y: number, w: number, h: number, a: string, b: string): void;
  /** The light layer: glow, steam, cast shadows at 25/50/75%. */
  glow(x: number, y: number, w: number, h: number, c: string, alpha: 0.25 | 0.5 | 0.75): void;
  /** Clip to the rows between y0 (bottom, inclusive) and y1 (top), art px relative to the feet. */
  clip(y1: number, y0: number): void;
  ctx: CanvasRenderingContext2D;
}

function penFor(ctx: CanvasRenderingContext2D, stop: StopId): Pen {
  const ox = Math.round(STOP_X[stop] / ART_PX), oy = Math.round((BELT_Y + LOOK[stop].drop) / ART_PX);
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = c;
    ctx.fillRect((ox + Math.round(x)) * ART_PX, (oy + Math.round(y)) * ART_PX, Math.round(w) * ART_PX, Math.round(h) * ART_PX);
  };
  return {
    ctx, r,
    p: (x, y, c) => r(x, y, 1, 1, c),
    d(x, y, w, h, a, b) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) r(x + i, y + j, 1, 1, (i + j + x + y) & 1 ? a : b); },
    glow(x, y, w, h, c, alpha) { ctx.save(); ctx.globalAlpha = alpha; r(x, y, w, h, c); ctx.restore(); },
    clip(y1, y0) {
      ctx.beginPath();
      ctx.rect((ox - SLOT_PX - 4) * ART_PX, (oy + y1) * ART_PX, (SLOT_PX * 2 + 8) * ART_PX, (y0 - y1 + 1) * ART_PX);
      ctx.clip();
    },
  };
}

/** A ramp color by light level 0..1 (0 = darkest). */
const ramp = (rp: readonly string[], v: number) => rp[Math.max(0, Math.min(rp.length - 1, Math.round(v * (rp.length - 1))))];

/** A filled disc; shade(dx, dy) picks each pixel's color (for banding). */
function disc(pen: Pen, cx: number, cy: number, rad: number, shade: (dx: number, dy: number) => string) {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.6) { const c = shade(x, y); if (c) pen.p(cx + x, cy + y, c); }
}

/** A rivet: one lit px over one dark px. */
const rivet = (pen: Pen, x: number, y: number, lit: string = P.brass[4], dark: string = P.iron[0]) => { pen.p(x, y, lit); pen.p(x, y + 1, dark); };

// ---------- the finished machine stand-in (until stations/ lands) ----------
function standIn(pen: Pen, t: number) {
  const { r, p, d, glow } = pen;
  glow(-22, -3, 40, 4, P.iron[0], 0.5); // cast shadow, down-left
  // silhouette + outline
  r(-20, -36, 40, 37, P.soot[0]);
  // top face (3/4 view), light from the upper right
  r(-19, -35, 38, 4, P.iron[3]); r(4, -35, 15, 4, P.iron[4]); r(-19, -35, 38, 1, P.iron[4]);
  for (let x = -16; x < 18; x += 8) r(x, -34, 1, 3, P.iron[2]); // top seams
  r(-19, -31, 38, 1, P.soot[0]); // edge between top and front
  // front face: mid fill, lit right band, dark left band, grime at the feet
  r(-19, -30, 38, 30, P.iron[2]);
  r(10, -30, 7, 30, P.iron[3]);
  r(-19, -30, 2, 30, P.iron[1]);
  d(-17, -4, 34, 3, P.iron[1], P.iron[2]);
  r(-19, -1, 38, 1, P.iron[0]);
  // brass corner posts with rivets
  for (const [x, lit] of [[-19, false], [16, true]] as const) {
    r(x, -31, 3, 31, lit ? P.brass[3] : P.brass[1]); r(x + (lit ? 2 : 0), -31, 1, 31, lit ? P.brass[4] : P.brass[2]);
    for (let y = -28; y < -1; y += 5) rivet(pen, x + 1, y, P.brass[5], P.brass[0]);
  }
  // panel seam + bevel across the front
  r(-16, -19, 32, 1, P.iron[1]); r(-16, -18, 32, 1, P.iron[3]);
  // gear porthole: brass ring with banding, a steel gear inside
  disc(pen, -5, -10, 8, (x, y) => (x * x + y * y > 42 ? (x - y > 2 ? P.brass[4] : x - y < -4 ? P.brass[1] : P.brass[3]) : P.soot[0]));
  disc(pen, -5, -10, 5, (x, y) => (x - y > 3 ? P.steel[3] : x - y < -3 ? P.steel[1] : P.steel[2]));
  for (const [x, y] of [[0, -6], [4, -4], [6, 0], [4, 4], [0, 6], [-4, 4], [-6, 0], [-4, -4]]) p(-5 + Math.round(x * 0.9), -10 + Math.round(y * 0.9), P.steel[3]);
  disc(pen, -5, -10, 1, () => P.soot[0]); p(-4, -11, P.steel[3]);
  // glowing window, upper right, with a mullion and a slow scanline
  r(5, -29, 10, 8, P.soot[0]); r(6, -28, 8, 6, P.sun[4]); r(6, -28, 8, 2, P.sun[5]); r(10, -28, 1, 6, P.soot[0]); r(6, -25, 8, 1, P.soot[0]);
  const scan = Math.floor(t * 4) % 6; r(6, -28 + scan, 8, 1, P.sun[6]); r(10, -28 + scan, 1, 1, P.soot[0]);
  glow(4, -30, 12, 10, P.sun[5], 0.25);
  // copper pipe down the right side, banded across the curve
  for (let y = -26; y < -2; y++) { p(17, y, P.copper[1]); p(18, y, P.copper[2]); p(19, y, P.copper[4]); }
  r(16, -27, 4, 1, P.soot[0]); r(16, -2, 4, 1, P.soot[0]); p(19, -14, P.white[0]);
  // stack on top: a banded cylinder with a brass lip and a slow smoke wisp
  r(-4, -43, 9, 9, P.soot[0]);
  for (let y = -42; y < -35; y++) { p(-3, y, P.copper[0]); p(-2, y, P.copper[1]); r(-1, y, 3, 1, P.copper[2]); p(2, y, P.copper[3]); p(3, y, P.copper[4]); }
  r(-4, -43, 9, 2, P.brass[2]); r(-4, -43, 9, 1, P.brass[4]); p(3, -42, P.white[0]);
  for (let i = 0; i < 3; i++) { // three puffs drifting up and left, one px per beat
    const k = ((t * 0.8 + i / 3) % 1), y = -45 - Math.floor(k * 8), x = Math.floor(-k * 3);
    if (k < 0.8) { p(x, y, k < 0.4 ? P.haze[3] : P.haze[2]); if (k < 0.5) p(x + 1, y, P.haze[2]); }
  }
  // warm rim on the right silhouette
  r(20, -35, 1, 34, P.sun[4]);
}

function machine(pen: Pen, stop: StopId, t: number) {
  const ext = external();
  if (ext) ext(pen.ctx, stop, "idle", t); else standIn(pen, t);
}

// ---------- the locked plot: tarp, padlock, plate ----------
const GLYPH: Record<string, string[]> = {
  C: ["111", "100", "100", "100", "111"], O: ["111", "101", "101", "101", "111"], N: ["110", "101", "101", "101", "101"],
  E: ["111", "100", "110", "100", "111"], T: ["111", "010", "010", "010", "010"],
};

function plate(pen: Pen, label: string, dy: number) {
  const { r, p, d } = pen;
  const w = label.length * 4 + 7, x0 = -Math.floor(w / 2), y0 = 6 + dy, h = 11;
  r(x0 - 1, y0 - 1, w + 2, h + 2, P.soot[0]);
  // bevelled brass frame: lit top/left, dark bottom/right
  r(x0, y0, w, h, P.brass[3]);
  r(x0, y0, w, 1, P.brass[5]); r(x0, y0, 1, h, P.brass[4]);
  r(x0, y0 + h - 1, w, 1, P.brass[1]); r(x0 + w - 1, y0, 1, h, P.brass[2]);
  // inset panel with grime in its corners
  r(x0 + 2, y0 + 2, w - 4, h - 4, P.iron[1]);
  r(x0 + 2, y0 + 2, w - 4, 1, P.iron[0]);
  d(x0 + 2, y0 + h - 3, 3, 1, P.iron[0], P.iron[1]); d(x0 + w - 5, y0 + h - 3, 3, 1, P.iron[0], P.iron[1]);
  for (const [x, y] of [[x0 + 1, y0 + 1], [x0 + w - 2, y0 + 1], [x0 + 1, y0 + h - 3], [x0 + w - 2, y0 + h - 3]]) rivet(pen, x, y, P.brass[5], P.brass[0]);
  let x = x0 + 4;
  for (const ch of label) {
    GLYPH[ch]?.forEach((row, j) => [...row].forEach((b, i) => { if (b === "1") { p(x + i, y0 + 3 + j, P.brass[5]); } }));
    x += 4;
  }
}

/** Height of the cloth's top edge at column x (a boxy lump, softened at the corners). */
const tarpTop = (x: number) => -25 + Math.max(0, Math.abs(x + 1) - 15) + (Math.sin(x * 0.55) > 0.75 ? 1 : 0);
/** The hem: drapes between the three rope points. */
const tarpHem = (x: number) => -4 - Math.round(1.6 * Math.abs(Math.sin(((x + 19) * Math.PI) / 18)));

function tarp(pen: Pen, dx = 0, dy = 0, ghost = false) {
  const { r, p, glow } = pen;
  if (!ghost) glow(-23 + dx, -2 + dy, 40, 3, P.iron[0], 0.5); // cast shadow
  // iron base peeking out under the hem, brass trim + rivets
  if (!ghost) {
    r(-20, -5, 40, 6, P.soot[0]); r(-19, -4, 38, 4, P.iron[2]); r(-19, -4, 38, 1, P.brass[3]); r(10, -3, 9, 3, P.iron[3]);
    for (let x = -16; x < 18; x += 6) rivet(pen, x, -3);
    r(-19, -1, 38, 1, P.iron[0]);
  }
  const cloth = [P.steel[0], P.steel[1], P.steel[2], P.steel[3]];
  for (let x = -19; x <= 19; x++) {
    const top = tarpTop(x), hem = tarpHem(x), X = x + dx;
    r(X, top - 1 + dy, 1, hem - top + 2, P.soot[0]); // outline column
    // fold shading: a fold faces the light where its slope rises to the right
    const fold = Math.cos(x * 0.72 + 0.4), side = x > 9 ? 1 : x < -14 ? -1 : 0;
    for (let y = top; y <= hem; y++) {
      const onTop = y < top + 4;
      let v = onTop ? 2 + (x > 4 ? 1 : 0) : 1.4 + fold * 0.9 + side * 0.6 - (y > hem - 2 ? 0.8 : 0);
      if (!onTop && ((x + y) & 1) && Math.abs(v - Math.round(v)) > 0.3) v += 0.5; // dither the band edges
      p(X, y + dy, ramp(cloth, v / 3));
    }
    if (x === 19 || (x > 14 && tarpTop(x + 1) > top)) p(X, top + dy, P.sun[4]); // warm rim on the right
  }
  r(-20 + dx, tarpTop(-20) + dy, 1, tarpHem(-19) - tarpTop(-20) + 1, P.soot[0]);
  r(20 + dx, tarpTop(20) + dy, 1, tarpHem(19) - tarpTop(20) + 1, P.soot[0]);
  // a few faded brass stars in the weave, like the mockup's cloth
  for (const [x, y] of [[-12, -17], [3, -12], [-4, -21], [12, -18]]) { p(x + dx, y + dy, P.plate[1]); }
  // grommets + ropes to the deck at the three drape points
  for (const x of [-17, 0, 17]) {
    const hy = tarpHem(x) + dy;
    if (x !== 0) { p(x + dx, hy, P.brass[4]); p(x + 1 + dx, hy, P.brass[2]); if (!ghost) { p(x + dx, hy + 1, P.plate[3]); p(x + dx + (x < 0 ? -1 : 1), hy + 2, P.plate[2]); } }
  }
}

function padlock(pen: Pen, open: boolean, dy = 0) {
  const { r, p } = pen;
  const y = -7 + dy, lift = open ? 2 : 0;
  r(-1, y - 9, 3, 4, P.iron[1]); p(0, y - 9, P.iron[3]); // hasp strap from the cloth
  // shackle: steel, lit right
  r(-2, y - 5 - lift, 1, 3 + (open ? 0 : 0), P.steel[2]); r(2, y - 5 - lift, 1, open ? 1 : 3, P.steel[3]); r(-1, y - 6 - lift, 3, 1, P.steel[3]);
  // body: bevelled brass with a keyhole
  r(-3, y - 3, 7, 7, P.soot[0]);
  r(-2, y - 2, 5, 5, P.brass[3]); r(-2, y - 2, 5, 1, P.brass[5]); r(2, y - 2, 1, 5, P.brass[4]); r(-2, y + 2, 5, 1, P.brass[1]);
  p(0, y - 1, P.soot[0]); p(0, y, P.soot[0]); p(2, y - 2, P.white[0]);
}

// ---------- build pieces ----------
function plot(pen: Pen, lit: boolean, t: number) {
  const { r, p, d, glow } = pen;
  glow(-24, -1, 46, 3, P.iron[0], 0.5);
  // slab: top face (3/4) + front edge
  r(-23, -11, 46, 12, P.soot[0]);
  r(-22, -10, 44, 8, P.plate[2]); r(8, -10, 14, 8, P.plate[3]); r(-22, -10, 44, 1, P.plate[3]);
  d(-21, -4, 8, 2, P.plate[1], P.plate[2]); d(12, -9, 6, 1, P.plate[1], P.plate[3]); // grime
  for (const x of [-11, 0, 11]) r(x, -10, 1, 8, P.plate[1]); // plate seams
  r(-22, -6, 44, 1, P.plate[1]);
  for (const x of [-16, -5, 6, 17]) p(x, -8, P.plate[4]);
  r(-22, -2, 44, 1, P.brass[3]); r(-22, -1, 44, 2, P.iron[2]); r(10, -1, 12, 2, P.iron[3]); // front edge with brass trim
  for (let x = -19; x < 21; x += 6) p(x, -1, P.brass[4]);
  // chalk plot, creeping dashes; lit = gold with a soft glow
  const dash = Math.floor(t * 5) % 4, c = lit ? P.brass[5] : P.plate[4];
  if (lit) glow(-17, -9, 34, 6, P.sun[5], 0.25);
  for (let x = -17; x <= 16; x++) if ((x + dash) & 2) { p(x, -9, c); p(x, -4, c); }
  for (let y = -9; y <= -4; y++) if ((y + dash) & 2) { p(-17, y, c); p(16, y, c); }
  // corner hazard blocks with lamps
  for (const [x, y] of [[-23, -12], [19, -12], [-23, -4], [19, -4]] as const) {
    r(x - 1, y - 1, 6, 6, P.soot[0]);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) p(x + i, y + j, (i + j) % 4 < 2 ? P.brass[4] : P.soot[0]);
    r(x + 1, y - 3, 2, 2, P.soot[0]); r(x + 1, y - 4, 2, 1, lit ? P.sun[5] : P.iron[2]); p(x + 2, y - 4, lit ? P.sun[6] : P.iron[3]);
    if (lit) glow(x - 1, y - 6, 6, 5, P.sun[5], 0.25);
  }
}

/** Work platform behind the machine: legs, X braces, hazard-striped deck, railing, two lanterns, a ladder. */
function scaffold(pen: Pen, t: number) {
  const { r, p, d, glow } = pen;
  const deckY = -36;
  glow(-25, -2, 12, 3, P.soot[0], 0.5);
  // legs: cool dark steel, the back pair set back by the 3/4 offset; warm rim on the right edge, rust under rivets
  for (const [x, back] of [[-17, true], [19, true], [-21, false], [17, false]] as const) {
    const top = back ? deckY - 3 : deckY;
    r(x - 1, top, 4, -top + 1, P.soot[0]);
    r(x, top, 1, -top, back ? P.steel[0] : P.steel[1]); r(x + 1, top, 1, -top, back ? P.steel[1] : P.steel[2]);
    if (!back) { r(x + 2, top + 1, 1, -top - 2, P.sun[1]); p(x + 1, top + 1, P.white[0]); } // sun rim + glint
    if (!back) { r(x - 1, -2, 4, 2, P.steel[1]); r(x - 1, -2, 4, 1, P.steel[2]); }   // foot plates
    for (let y = top + 3; y < -2; y += 7) {
      rivet(pen, x + 1, y, P.brass[4], P.soot[0]);
      if (!back) { p(x + 1, y + 2, P.copper[1]); p(x + 1, y + 3, P.copper[0]); } // rust streak
    }
    if (!back) d(x, -6, 2, 4, P.iron[1], P.steel[1]); // grime at the feet
  }
  // X braces on the left bay
  for (let y = -3; y > deckY + 3; y -= 11) for (let k = 0; k < 10; k++) { p(-20 + Math.round(k * 0.3), y - k, P.steel[1]); p(-18 - Math.round(k * 0.3), y - k, P.steel[0]); }
  // deck: steel plate top face (lighter toward the sun), dark front edge with a brass rivet line
  r(-23, deckY - 4, 46, 7, P.soot[0]);
  r(-22, deckY - 3, 44, 3, P.steel[2]); r(8, deckY - 3, 14, 3, P.steel[3]); d(-21, deckY - 2, 12, 1, P.steel[1], P.steel[2]);
  for (const x of [-12, 0, 12]) r(x, deckY - 3, 1, 3, P.steel[1]); // plate seams
  r(-22, deckY, 44, 2, P.steel[1]); r(-22, deckY + 2, 44, 1, P.steel[0]);
  for (let x = -20; x < 22; x += 6) p(x, deckY, P.brass[3]);
  p(21, deckY - 3, P.white[0]); r(22, deckY - 3, 1, 5, P.sun[1]);
  d(-22, deckY + 1, 8, 1, P.iron[1], P.steel[1]); // grime in the corner
  // railing: dark steel rail with a lit top px, thin posts
  r(-22, deckY - 10, 44, 1, P.steel[3]); r(-22, deckY - 9, 44, 1, P.steel[1]); r(-22, deckY - 8, 44, 1, P.soot[0]);
  p(18, deckY - 10, P.white[0]);
  for (const x of [-22, -11, 0, 11, 21]) r(x, deckY - 9, 1, 6, P.steel[1]);
  // lanterns at both ends: soot cage, warm glass, a soft halo (flickers one shade, slowly)
  for (const x of [-22, 20]) {
    const warm = Math.floor(t * 2 + x) % 5 === 0 ? P.sun[4] : P.sun[5];
    r(x - 1, deckY - 15, 4, 5, P.soot[0]); r(x, deckY - 14, 2, 3, warm); p(x + 1, deckY - 14, P.sun[6]); p(x, deckY - 16, P.brass[3]);
    glow(x - 2, deckY - 17, 6, 8, P.sun[5], 0.25);
  }
  // ladder up the left
  for (let y = -1; y > deckY; y--) { p(-24, y, P.steel[0]); p(-22, y, P.steel[1]); if ((y & 3) === 0) p(-23, y, P.steel[2]); }
}

/** The crane, behind on the right: heavy base, banded turret drum, lattice boom, pulley, hook block. */
function crane(pen: Pen, swing: number, hookY: number, t = 0) {
  const { r, p, d, glow } = pen;
  glow(4, -2, 14, 3, P.soot[0], 0.5);
  // base: steel top face + front, rivets with rust streaks, grime
  r(6, -10, 17, 11, P.soot[0]);
  r(7, -9, 15, 3, P.steel[2]); r(15, -9, 7, 3, P.steel[3]);
  r(7, -6, 15, 6, P.steel[1]); r(17, -6, 5, 6, P.steel[2]); r(7, -6, 15, 1, P.steel[0]);
  r(22, -9, 1, 9, P.sun[1]); p(21, -9, P.white[0]);
  d(8, -2, 7, 1, P.iron[1], P.steel[1]);
  for (const x of [9, 13, 17, 20]) { rivet(pen, x, -5, P.brass[4], P.soot[0]); p(x, -3, P.copper[1]); }
  // turret drum: a steel cylinder banded across x, glint on the sun side
  const drum = [P.steel[0], P.steel[1], P.steel[1], P.steel[2], P.steel[2], P.steel[3], P.sun[1]];
  r(9, -19, 9, 10, P.soot[0]);
  for (let i = 0; i < 7; i++) r(10 + i, -18, 1, 9, drum[i]);
  r(10, -15, 7, 2, P.iron[1]); r(14, -15, 2, 1, P.iron[3]); // winch cable wrap
  p(15, -18, P.white[0]); p(15, -17, P.steel[3]);
  for (const x of [10, 16]) p(x, -12, P.brass[3]);
  // exhaust: a short stack and a slow, dithered haze puff
  r(18, -23, 3, 5, P.soot[0]); r(19, -22, 1, 4, P.steel[1]); p(19, -23, P.steel[2]);
  const k = (t * 0.6) % 1, py = -26 - Math.round(k * 8);
  if (k < 0.85) { r(18 + Math.round(k * 2), py, 3, 2, P.haze[1]); p(19 + Math.round(k * 2), py, P.haze[2]); if (k > 0.5) p(20 + Math.round(k * 2), py + 1, P.haze[0]); }
  // lantern on the base
  r(20, -14, 3, 4, P.soot[0]); r(21, -13, 1, 2, P.sun[5]); glow(19, -15, 5, 6, P.sun[5], 0.25);
  // boom: pivot -> tip, 3 px thick, steel with a lit top edge and lattice gaps
  const px0 = 13, py0 = -17, tx = Math.round(10 - swing * 12), ty = Math.round(-56 + swing * 6);
  const n = Math.max(Math.abs(tx - px0), Math.abs(ty - py0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(px0 + ((tx - px0) * i) / n), y = Math.round(py0 + ((ty - py0) * i) / n);
    r(x - 2, y - 1, 4, 3, P.soot[0]);
  }
  for (let i = 0; i <= n; i++) {
    const x = Math.round(px0 + ((tx - px0) * i) / n), y = Math.round(py0 + ((ty - py0) * i) / n);
    p(x, y, P.steel[3]); p(x - 1, y, P.steel[2]); p(x, y + 1, P.steel[0]);
    if (i % 3 === 0) p(x - 1, y + 1, P.soot[0]);
    if (i % 9 === 4) p(x, y, P.brass[3]); // a rivet at each lattice joint
  }
  // pulley at the tip: steel wheel, one glint
  disc(pen, tx, ty, 2, (x, y) => (x * x + y * y < 1 ? P.soot[0] : x - y > 0 ? P.steel[3] : P.steel[1]));
  p(tx + 1, ty - 1, P.white[0]);
  // cable + hook block
  const hy = Math.max(ty + 4, Math.round(hookY));
  r(tx, ty + 2, 1, hy - ty - 2, P.soot[0]);
  r(tx - 2, hy - 1, 5, 4, P.soot[0]); r(tx - 1, hy, 3, 2, P.steel[2]); p(tx + 1, hy, P.white[0]); p(tx - 1, hy + 1, P.copper[0]);
  p(tx - 1, hy + 3, P.steel[3]); p(tx - 1, hy + 4, P.steel[2]); p(tx, hy + 5, P.steel[2]); p(tx + 1, hy + 4, P.steel[3]);
  return { x: tx, y: hy + 5 };
}

/** The girder cage (frame stage): a 3/4 box of bevelled beams, rivets at the joints, the porthole ring. */
function cage(pen: Pen) {
  const { r, p } = pen;
  const T = -32, B = -1, L = -18, R = 17, off = 3;
  const beamV = (x: number, y0: number, y1: number, back: boolean) => {
    r(x - 1, y0, 4, y1 - y0 + 1, P.soot[0]);
    r(x, y0, 1, y1 - y0, back ? P.steel[0] : P.steel[1]); r(x + 1, y0, 1, y1 - y0, back ? P.steel[1] : P.steel[3]);
  };
  const beamH = (x0: number, x1: number, y: number, back: boolean) => {
    r(x0, y - 1, x1 - x0 + 1, 4, P.soot[0]);
    r(x0, y, x1 - x0, 1, back ? P.steel[1] : P.steel[3]); r(x0, y + 1, x1 - x0, 1, back ? P.steel[0] : P.steel[1]);
  };
  // back frame (set back up-right)
  beamV(L + off, T - off, B - off, true); beamV(R + off, T - off, B - off, true); beamH(L + off, R + off + 1, T - off, true);
  // top-face diagonals
  for (let k = 0; k <= off; k++) { r(L + k, T - k, 2, 1, P.steel[2]); r(R + k, T - k, 2, 1, P.steel[3]); }
  // front frame + middle girders
  beamV(L, T, B, false); beamV(R, T, B, false);
  for (const y of [T, -21, -11, B - 1]) beamH(L, R + 1, y, false);
  for (const y of [T, -21, -11, B - 1]) { rivet(pen, L + 1, y + 1); rivet(pen, R + 1, y + 1); }
  // X brace in the lower bay
  for (let i = 0; i <= 32; i++) { // two diagonals, L+2..R-1 by -10..-3
    const x = L + 2 + Math.round((i * (R - L - 3)) / 32), y = -10 + Math.round((i * 7) / 32);
    p(x, y, P.steel[1]); p(x, -13 - y, P.steel[2]);
  }
  // the porthole ring that will hold the gear
  disc(pen, -5, -10, 8, (x, y) => (x * x + y * y > 40 ? (x - y > 6 ? P.brass[4] : x - y > 2 ? P.steel[3] : x - y < -4 ? P.steel[0] : P.steel[1]) : ""));
}

/** Pixel ring (midpoint circle). keep(x, y) can thin it out as it fades. */
function ring(pen: Pen, cx: number, cy: number, rad: number, c: string, keep: (x: number, y: number) => boolean = () => true) {
  let x = rad, y = 0, e = 1 - rad;
  while (x >= y) {
    for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) if (keep(a, b)) pen.p(cx + a, cy + b, c);
    y++;
    if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
  }
}

function burst(pen: Pen, t: number) {
  const k = span(t, STAGE_AT.burst, STAGE_AT.burst + 0.45);
  if (k <= 0 || k >= 1) return;
  const rad = 5 + Math.round(easeOut(k) * (SLOT_PX - 6)), cy = -19;
  const thin = k < 0.55 ? () => true : k < 0.8 ? (x: number, y: number) => ((x + y) & 1) === 0 : (x: number, y: number) => ((x * 3 + y) & 3) === 0;
  if (k < 0.45) pen.glow(-rad + 2, cy - rad + 2, rad * 2 - 3, rad * 2 - 3, P.sun[5], 0.25);
  ring(pen, 0, cy, rad + 1, P.sun[3], thin);
  ring(pen, 0, cy, rad, P.sun[6], thin);
  if (k < 0.6) ring(pen, 0, cy, rad - 1, P.brass[5], thin);
  if (k < 0.4) for (let i = 0; i < 8; i++) { // 8 short rays just outside the ring
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
    for (const d of [rad + 3, rad + 4]) pen.p(Math.round(c * d), cy + Math.round(s * d), d === rad + 3 ? P.brass[5] : P.sun[5]);
  }
}

function dust(pen: Pen, t: number) {
  const k = span(t, STAGE_AT.land, STAGE_AT.land + 0.45);
  if (k <= 0 || k >= 1) return;
  const d = Math.round(easeOut(k) * 4), rise = Math.round(k * 2);
  for (const s of [-1, 1]) {
    for (const [ox, oy, rad] of [[0, 0, 2], [s * 3, -1, 2], [s * 1, -3, 1]] as const) {
      if (k > 0.75 && rad === 1) continue;
      const cx = s * 19 + s * d + ox, cy = -2 - rise + oy;
      disc(pen, cx, cy, rad, (x, y) => {
        if (k > 0.6 && ((x + y + cx) & 1)) return ""; // dissolves
        return x - y > 1 ? P.haze[3] : x - y < -1 ? P.haze[1] : P.haze[2];
      });
    }
  }
}

function check(pen: Pen, t: number) {
  const k = t - STAGE_AT.check, gone = span(t, STAGE_AT.gone - 0.3, STAGE_AT.gone);
  if (k < 0 || gone >= 1) return;
  const rad = gone > 0.5 ? 4 : k < 0.06 ? 4 : k < 0.16 ? 8 : 7; // small, overshoot, settle
  const cx = 14, cy = -40;
  pen.glow(cx - rad - 1, cy - rad - 1, rad * 2 + 3, rad * 2 + 3, P.ok[2], 0.25);
  disc(pen, cx, cy, rad + 1, () => P.soot[0]);
  // brass bezel, banded: lit upper right, dark lower left
  disc(pen, cx, cy, rad, (x, y) => (x - y > rad * 0.6 ? P.brass[4] : x - y < -rad * 0.6 ? P.brass[1] : P.brass[3]));
  // green dome: dark rim, mid, lit band upper right
  disc(pen, cx, cy, rad - 2, (x, y) => (x - y > rad * 0.5 ? P.ok[2] : x + y > rad * 0.6 || x - y < -rad * 0.7 ? P.ok[0] : P.ok[1]));
  if (rad >= 6) {
    for (const [x, y] of [[0, -rad + 1], [rad - 1, 0], [0, rad - 1], [-rad + 1, 0]]) pen.p(cx + x, cy + y, P.brass[5]); // bezel rivets
    const tick: [number, number][] = [[-3, 0], [-2, 1], [-1, 2], [0, 1], [1, 0], [2, -1], [3, -2]];
    for (const [a, b] of tick) { pen.p(cx + a, cy + b + 1, P.ok[0]); }
    for (const [a, b] of tick) { pen.p(cx + a, cy + b, P.white[0]); }
    pen.p(cx + rad - 2, cy - rad + 2, P.white[0]); // glint
  } else {
    for (const [a, b] of [[-1, 0], [0, 1], [1, 0], [2, -1]] as [number, number][]) pen.p(cx + a, cy + b, P.white[0]);
  }
}

// ---------- the sequence ----------
export function drawLockedPx(ctx: CanvasRenderingContext2D, stop: StopId, label: string) {
  const pen = penFor(ctx, stop);
  tarp(pen);
  padlock(pen, false);
  plate(pen, label, 0);
}

/** One build in progress, t seconds in. slot = which engine pass. */
export function drawBuildPx(ctx: CanvasRenderingContext2D, stop: StopId, t: number, slot: "line" | "stations" | "front", label: string) {
  const pen = penFor(ctx, stop);
  if (slot === "line") { if (t < STAGE_AT.burst) plot(pen, t >= STAGE_AT.plot, t); return; }
  if (slot === "front") { burst(pen, t); dust(pen, t); check(pen, t); return; }
  if (t >= STAGE_AT.done) return;
  // scaffold + crane rise from the deck behind the machine, and sink back into it at the burst
  const up = easeOut(span(t, STAGE_AT.scaffold, STAGE_AT.scaffold + 0.3)), sink = Math.round(easeIn(span(t, STAGE_AT.burst - 0.12, STAGE_AT.burst + 0.15)) * 60);
  const lowering = span(t, STAGE_AT.top, STAGE_AT.land), drop = Math.round((1 - easeIn(lowering)) * 14);
  if (up > 0 && sink < 60) {
    ctx.save(); pen.clip(-70, 0); ctx.translate(0, (sink + Math.round((1 - up) * 50)) * ART_PX);
    scaffold(pen, t);
    const swing = t < STAGE_AT.frame ? 0 : t < STAGE_AT.top - 0.2 ? 0.5 : 1; // three slow positions, like the sheet
    crane(pen, swing, t < STAGE_AT.top ? -44 : -H - drop - 8, t);
    ctx.restore();
  }
  // the machine: girder cage, then the finished drawing revealed from the feet, then its top lowered in
  const fUp = span(t, STAGE_AT.frame, STAGE_AT.panels - 0.05), pUp = span(t, STAGE_AT.panels, STAGE_AT.top - 0.05);
  if (t < STAGE_AT.land && fUp > 0) { ctx.save(); pen.clip(-Math.round(36 * fUp), 1); cage(pen); ctx.restore(); }
  const seat = -Math.round(heightOf(stop) * 0.74); // the top slice (stack + top face) above this row comes in on the hook
  const body = t < STAGE_AT.top ? -Math.round(pUp * -seat) : seat;
  if (body < 0) { ctx.save(); pen.clip(body, 2); machine(pen, stop, t); ctx.restore(); }
  if (t >= STAGE_AT.top) {
    const thump = t >= STAGE_AT.land && t < STAGE_AT.land + 0.08 ? 1 : 0;
    ctx.save(); ctx.translate(0, (-drop + thump) * ART_PX); pen.clip(-80, seat - 1); machine(pen, stop, t); ctx.restore();
  }
  // tarp whips up and off, the plate drops away
  if (t < STAGE_AT.plot + 0.2) {
    const k = span(t, 0.04, STAGE_AT.plot + 0.2);
    if (k < 1) tarp(pen, Math.round(easeIn(k) * 8), -Math.round(easeOut(k) * 34), true);
    if (t < 0.1) padlock(pen, t > 0.03);
  }
  const pk = span(t, 0, 0.25);
  if (pk < 1) plate(pen, label, Math.round(easeIn(pk) * 12));
}
