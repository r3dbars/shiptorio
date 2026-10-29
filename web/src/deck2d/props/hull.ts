import { HULL, ART_PX } from "../contract";
import { IDX, type Color } from "../stations/palette";
import { Px, shift } from "../stations/px";
import { BRASS, blotch, cylH, cylV, noise, tone, type Ramp } from "../stations/shade";
import { CU } from "./boiler2d";
import { dressFloor } from "./clutter";
import { coreFrame, crystals, engine, enginePos, ends, rim, rocks, type Under } from "./underside";

// The large deck's hull drawn in code on the art grid (contract HULL): warm iron floor plates and a perimeter rail with
// brass-capped posts and lanterns. The sides and underside (rim band, boulders, crystals, the engine at the middle)
// are underside.ts, drawn to match the launch island. The hull lights stay steady; index.ts drives the engine core's
// pulse and blocked-state warning, the slow light in the crystals and the boiler smoke.
//
// Coordinates here are art px (world / ART_PX). hullCanvas(w) renders a deck w art px wide, cached; the deck grows by
// re-rendering at the new width (the engine stays at the middle, the right-hand end rides with the edge).

// More walkable floor in front of the machines, without scaling any artwork.
const FRONT_DEPTH = 14;
export const A = {
  back: Math.round(HULL.back / ART_PX),
  front: Math.round(HULL.front / ART_PX) + FRONT_DEPTH,
  skirt: Math.round(HULL.skirt / ART_PX) + FRONT_DEPTH,
};
/** The canvas starts TOP art px above y 0 (lanterns on the back rail) and is H tall (the engine at the bottom). */
export const TOP = 20, H = 250, PAD = 2;

const POST: Ramp = ["soot", "brass-0", "plate-1", "brass-1", "plate-2", "brass-2", "brass-3", "brass-4"];
const LAMP: Ramp = ["sun-1", "sun-3", "sun-4", "sun-5", "sun-6", "white"];

const hash = (a: number, b: number, s = 0) => noise(a * 7 + 3, b * 13 + 5, s);
/** Where the floor's left and right edges are on row y (the back corners are chamfered). */
const CH = 7;
const xl = (y: number) => Math.max(0, CH - (y - A.back));
const xr = (y: number, w: number) => w - 1 - Math.max(0, CH - (y - A.back));

// ---------- floor ----------
// Rows compress toward the rear rail and open up toward the viewer.
const ROWS = [A.back];
while (ROWS[ROWS.length - 1] < A.front - 2) {
  const y = ROWS[ROWS.length - 1];
  ROWS.push(Math.min(A.front - 2, y + Math.round(4 + 6 * (y - A.back) / (A.front - A.back))));
}
const PLATE = 15;
/** Floor plates: tan-brown worn iron catching the sunset, thin dark seams, a rivet in each corner. */
const DECKPLATE: Ramp = ["iron-0", "iron-1", "iron-2", "plate-1", "plate-2", "iron-4", "plate-4"];
function floor(g: Px, w: number) {
  const c = w / 2;
  for (let y = A.back; y < A.front - 2; y++) {
    const v = (y - A.back) / (A.front - A.back);
    let r = 0; while (r < ROWS.length - 2 && y >= ROWS[r + 1]) r++;
    const top = ROWS[r], bot = ROWS[r + 1], beltRow = y >= 39 && y <= 55; // the belt sits on these rows: keep them quiet
    for (let x = xl(y); x <= xr(y, w); x++) {
      // plates converge a little toward the back, like the mockups' 3/4 view
      const u = c + (x - c) / (0.76 + 0.24 * v) + 1000, col = Math.floor(u / PLATE), m = u - col * PLATE;
      const ph = hash(col, r, 2);
      let t = 0.45 + 0.3 * v + (ph - 0.5) * 0.08 + 0.08 * (x / w) + (blotch(x, y, 6, 4) - 0.5) * 0.1 + (noise(x, y, 6) - 0.5) * 0.04;
      if (y < A.back + 3) t -= 0.16; // recessed shadow where the rear rail meets the floor
      if (m < 1 || (y === top && r > 0)) t = 0.24; // seam
      else if (y === top + 1 && r > 0) t += 0.08; // the plate's lit top edge
      else if (m >= PLATE - 1) t += 0.05;
      // grime collects in the corners: a dark checker
      if ((m < 3 || m >= PLATE - 2) && (y >= bot - 2) && ((x + y) & 1)) t -= 0.1;
      // a few plates are grates: dark slots
      const grate = ph < 0.08 && !beltRow && r > 0;
      if (grate && m > 2 && m < PLATE - 2 && y > top + 1 && y < bot - 1) t = (y - top) % 2 ? 0.08 : 0.4;
      tone(g, x, y, DECKPLATE, t);
      // wear and rust in slow blotches: orange where the paint's gone, dark brown where it's rusting
      const ru = blotch(x, y, 4, 9 + col);
      if (!grate && m > 1 && y > top + 1 && noise(x, y, 11) < 0.55) { if (ru > 0.9) g.set(x, y, "plate-3"); else if (ru < 0.1) g.set(x, y, "plate-1"); }
      // a rivet in each corner (brass is jewelry: one light px over one dark px); none under the belt
      if ((Math.floor(m) === 2 || Math.floor(m) === PLATE - 3) && (y === top + 2 || y === bot - 3) && !beltRow) {
        g.set(x, y, "brass-3"); g.set(x, y + 1, "iron-1");
      }
    }
  }
  // the front lip: a riveted brass-trimmed edge plate
  for (let x = 0; x < w; x++) {
    tone(g, x, A.front - 2, DECKPLATE, 0.7 + 0.15 * (x / w));
    g.set(x, A.front - 1, x % 7 === 3 ? "brass-4" : "brass-2");
    g.set(x, A.front, "brass-0");
  }
}

// ---------- rails, posts, lanterns ----------
function lantern(g: Px, cx: number, base: number, sky = true) {
  // a cage lantern: brass foot, glass with a hot core behind two dark bars, a pointed brass hood with a ring on top
  g.rect(cx - 3, base - 1, 7, 1, "brass-1"); g.set(cx + 3, base - 1, "brass-3"); g.set(cx + 2, base - 1, "brass-2");
  for (let j = 0; j < 5; j++) for (let i = -2; i <= 2; i++) tone(g, cx + i, base - 2 - j, LAMP, 0.95 - Math.abs(i) * 0.18 - Math.abs(j - 2) * 0.1 + (i > 0 ? 0.06 : 0));
  g.vline(cx - 3, base - 6, 5, "brass-1"); g.vline(cx + 3, base - 6, 5, "brass-3");
  for (const i of [-1, 1]) g.vline(cx + i, base - 5, 3, "sun-1"); // the cage bars, dark against the flame
  g.rect(cx - 3, base - 7, 7, 1, "brass-2"); g.set(cx + 3, base - 7, "brass-4");
  g.rect(cx - 2, base - 8, 5, 1, "brass-2"); g.set(cx + 2, base - 8, "brass-4"); g.set(cx, base - 9, "brass-3"); g.set(cx, base - 10, "brass-1");
  // steady halo: warms the metal round it
  g.glowDisc(cx + 0.5, base - 3, 11, "sun-4", 0.25, [cx - 3, base - 10, 7, 10]);
  g.glowDisc(cx + 0.5, base - 3, 6, "sun-5", 0.25, [cx - 3, base - 10, 7, 10]);
  if (sky) for (const [dx, dy] of [[-5, -4], [5, -4], [-4, 0], [4, 0], [0, -12]]) g.glow(cx + dx, base - 3 + dy, 1, 1, "sun-4", 0.5, true); // a few warm sparks of light, no disc
}

function post(g: Px, x: number, top: number, bot: number) {
  cylV(g, x, top, 5, bot - top, POST, { amb: 0.08, gloss: 0.7 });
  cylH(g, x - 1, top - 1, 7, 2, BRASS, { amb: 0.22, gloss: 1 }); // cap
  cylH(g, x - 1, bot - 3, 7, 2, BRASS, { amb: 0.12 }); // foot collar
  for (let y = top + 3; y < bot - 4; y += 4) { g.set(x + 3, y, "brass-4"); g.set(x + 3, y + 1, "brass-0"); } // rivets on the lit side
}

function backRail(g: Px, w: number) {
  const y0 = A.back;
  cylH(g, CH, y0 - 9, w - 2 * CH, 3, CU, { amb: 0.15, gloss: 1.1 }); // copper top rail
  for (let x = CH; x < w - CH; x++) g.set(x, y0 - 4, x % 5 === 0 ? "brass-3" : "brass-1"); // thin brass lower rail
  const n = Math.max(2, Math.round((w - 2 * CH) / 26));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(CH - 2 + (k * (w - 2 * CH)) / n);
    const lamp = k % 3 === 0 || k === n;
    post(g, x, y0 - (lamp ? 14 : 11), y0 + 1);
    if (lamp) lantern(g, x + 2, y0 - 15);
  }
}

function sideRails(g: Px, w: number) {
  // the chamfered back corners and the two short ends: a diagonal copper rail on each corner
  for (const [x0, x1, sgn] of [[0, CH, 1], [w - 1, w - 1 - CH, -1]] as const) {
    for (let k = 0; k <= CH; k++) { const x = x0 + sgn * k, y = A.back + CH - k - 9; g.set(x, y, "copper-1"); g.set(x, y + 1, "copper-0"); }
  }
  for (const x of [0, w - 5]) { post(g, x, A.back + CH - 14, A.front + 1); lantern(g, x + 2, A.back + CH - 15); }
  for (let y = A.back + CH - 8; y < A.front - 4; y++) { g.set(1, y, "copper-0"); g.set(w - 3, y, "copper-2"); }
}

function frontRail(g: Px, w: number) {
  const y0 = A.front;
  cylH(g, 0, y0 - 6, w, 2, CU, { amb: 0.18, gloss: 1.2 });
  // posts stand on the skirt's brackets, so rail, skirt and hangers read as one frame; tall lantern posts at the ends
  for (let x = 14, k = 0; x < w - 6; x += 32, k++) post(g, x + 0.5, y0 - 8, y0 + 2);
  for (const x of [0, w - 5]) { post(g, x, y0 - 12, y0 + 2); lantern(g, x + 2, y0 - 13); }
}

const cache = new Map<number, { cv: HTMLCanvasElement; seams: { x: number; y: number }[]; bottom: Int16Array }>();
const under = (w: number): Under => ({ y0: A.front + 1, y1: A.skirt, w });
/** Where the engine's core window is for a deck w art px wide (index.ts lights it). */
export const coreAt = (w: number) => enginePos(under(Math.max(60, Math.round(w)))).win;
const coreFrames = new Map<string, HTMLCanvasElement>();
/** Eight tiny cached frames of the core's light; the engine round it stays still. */
export function coreLight(blocked: boolean, phase: number): HTMLCanvasElement {
  const key = `${blocked}:${phase}`;
  let cv = coreFrames.get(key);
  if (!cv) {
    const raw = new Px(CORE, CORE);
    coreFrame(raw, CORE / 2, CORE / 2, blocked, phase);
    cv = raw.bake();
    coreFrames.set(key, cv);
  }
  return cv;
}
export const CORE = 28;

function build(w: number) {
  let hit = cache.get(w);
  if (hit) return hit;
  const raw = new Px(w + 2 * PAD, H), g = shift(raw, PAD, TOP), u = under(w);
  const bottom = rocks(g, u);
  const eng = enginePos(u);
  crystals(g, u, (x) => Math.abs(x - eng.cx) < 52);
  engine(g, u);
  rim(g, u);
  floor(g, w);
  backRail(g, w);
  sideRails(g, w);
  dressFloor(raw, g, w, PAD, TOP);
  frontRail(g, w);
  ends(g, u, A.back + CH);
  raw.outline();
  const seams: { x: number; y: number }[] = [];
  for (let i = 0; i < raw.d.length; i++) if (raw.d[i] === IDX["energy-2"] || raw.d[i] === IDX["energy-3"]) {
    const x = i % raw.w - PAD, y = Math.floor(i / raw.w) - TOP;
    if (Math.abs(x - eng.cx) > 12 || y < eng.top) seams.push({ x, y }); // the nozzle's throat stays steady
  }
  hit = { cv: raw.bake(), seams, bottom };
  cache.set(w, hit);
  return hit;
}
/** The whole static hull, w art px wide: a canvas (w + 2*PAD) x H, art (0, 0) at (PAD, TOP). */
export const hullCanvas = (w: number) => build(Math.max(60, Math.round(w))).cv;
/** The bright crystal pixels, so index.ts can run slow light through them. */
export const hullHighlights = (w: number) => build(Math.max(60, Math.round(w))).seams;
/** The lowest rock row (art px) at column x of a deck w art px wide. */
export function rockBottom(x: number, w: number) {
  const b = build(Math.max(60, Math.round(w))).bottom, i = Math.max(0, Math.min(b.length - 1, Math.round(x)));
  return b[i];
}

export type { Color };
