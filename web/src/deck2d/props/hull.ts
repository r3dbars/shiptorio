import { HULL, ART_PX } from "../contract";
import type { Color } from "../stations/palette";
import { Px, shift } from "../stations/px";
import { BRASS, GOLD, IRON, ball, blotch, cylH, cylV, noise, rivet, strap, tone, type Ramp } from "../stations/shade";
import { CU, tube } from "../../bakeoff/boiler2d";

// The large deck's hull drawn in code on the art grid (contract HULL): warm iron floor plates, a perimeter rail with
// brass-capped posts and lanterns, a riveted front skirt with brass bands and brackets, a rock underside with cyan
// cracks and copper pipe loops, the caged core orb and two copper steam vents. All static: the lanterns, cracks and
// the orb are steady lights (the calm rule). The moving bits (steam, the boiler's fire and smoke) are in index.ts.
//
// Coordinates here are art px (world / ART_PX). hullCanvas(w) renders a deck w art px wide, cached; the deck grows by
// re-rendering at the new width (the vents and the right-hand end ride with the edge).

export const A = {
  back: Math.round(HULL.back / ART_PX), // 20: back edge of the floor
  front: Math.round(HULL.front / ART_PX), // 64: front edge (the bridge meets this rail)
  skirt: Math.round(HULL.skirt / ART_PX), // 78: bottom of the front skirt
  orb: { x: HULL.orb.x / ART_PX, y: HULL.orb.y / ART_PX },
};
/** The canvas starts TOP art px above y 0 (lanterns on the back rail) and is H tall (orb at the bottom). */
export const TOP = 8, H = 160, PAD = 2;

const FLOOR: Ramp = ["soot", "iron-0", "iron-1", "iron-2", "plate-1", "plate-2", "iron-4", "plate-4"];
/** Warm dark iron for the skirt and posts: the deck reads brown-black like the mockups, not blue. */
const WARM: Ramp = ["soot", "iron-0", "iron-1", "iron-2", "plate-1", "iron-3", "iron-4"];
const POST: Ramp = ["soot", "brass-0", "plate-1", "brass-1", "plate-2", "brass-2", "brass-3", "brass-4"];
const ROCK: Ramp = ["soot", "iron-0", "iron-1", "iron-2", "haze-0", "iron-3", "iron-4"];
const ENERGY: Ramp = ["steel-0", "energy-0", "energy-1", "energy-1", "energy-2", "energy-2", "energy-3"];
const LAMP: Ramp = ["sun-1", "sun-3", "sun-4", "sun-5", "sun-6", "white"];

const hash = (a: number, b: number, s = 0) => noise(a * 7 + 3, b * 13 + 5, s);
/** Where the floor's left and right edges are on row y (the back corners are chamfered). */
const CH = 7;
const xl = (y: number) => Math.max(0, CH - (y - A.back));
const xr = (y: number, w: number) => w - 1 - Math.max(0, CH - (y - A.back));

/** The orb hangs under the middle of the large deck; on a smaller deck it moves to that deck's middle. */
export const orbX = (w: number) => (w >= A.orb.x + 24 ? A.orb.x : w / 2);
/** The two steam vents ride with the right-hand end. */
export const ventXs = (w: number) => [w - 98, w - 78];
export const VENT_MOUTH = 100;

// ---------- floor ----------
const ROWS = [A.back, A.back + 6, A.back + 13, A.back + 21, A.back + 29, A.back + 36, A.front - 2];
const PLATE = 22;
function floor(g: Px, w: number) {
  const c = w / 2;
  for (let y = A.back; y < A.front - 2; y++) {
    const v = (y - A.back) / (A.front - A.back);
    let r = 0; while (r < ROWS.length - 2 && y >= ROWS[r + 1]) r++;
    const top = ROWS[r], bot = ROWS[r + 1], beltRow = y >= 39 && y <= 55; // the belt sits on these rows: keep them quiet
    for (let x = xl(y); x <= xr(y, w); x++) {
      // plates converge a little toward the back, like the mockups' 3/4 view
      const u = c + (x - c) / (0.9 + 0.1 * v) + 1000, col = Math.floor(u / PLATE), m = u - col * PLATE;
      const ph = hash(col, r, 2);
      let t = 0.54 + (ph - 0.5) * 0.18 + 0.12 * (x / w) + (blotch(x, y, 5, 4) - 0.5) * 0.22 + (noise(x, y, 6) - 0.5) * 0.05;
      if (y < A.back + 2) t -= 0.18; // the back rail's shadow falls down-left onto the floor
      // each plate is bevelled: lit along its top and right edges, shadowed along its bottom and left (light: upper right)
      if (m < 1) t = 0.1; // seam groove
      else if (m < 2) t -= 0.08;
      else if (m >= PLATE - 1) t += 0.14;
      if (y === top && r > 0) t = 0.1;
      else if (y === top + 1) t += 0.16;
      else if (y === bot - 1) t -= 0.12;
      // grime collects in the corners: a dark checker
      if ((m < 4 || m >= PLATE - 3) && (y >= bot - 2) && ((x + y) & 1)) t -= 0.12;
      // a few plates are grates: dark slots
      const grate = ph < 0.1 && !beltRow && r > 0;
      if (grate && m > 3 && m < PLATE - 3 && y > top + 1 && y < bot - 1) t = (y - top) % 2 ? 0.06 : 0.36;
      tone(g, x, y, FLOOR, t);
      // rust: brown where thin, orange where thick, in slow blotches
      const ru = blotch(x, y, 4, 9 + col);
      if (!grate && ru > 0.86 && noise(x, y, 11) < 0.5 && m > 1 && y > top + 1) g.set(x, y, ru > 0.92 ? "copper-0" : "plate-1");
      // rivets at the plate corners (brass is jewelry: one light px over one dark px)
      if ((Math.floor(m) === 3 || Math.floor(m) === PLATE - 4 || (Math.floor(m) === PLATE / 2 && !beltRow)) && (y === top + 3 || y === bot - 3) && (!beltRow || y < 40)) {
        g.set(x, y, "brass-3"); g.set(x, y + 1, "brass-0");
      }
    }
  }
  // the front lip: a riveted brass-trimmed edge plate
  for (let x = 0; x < w; x++) {
    tone(g, x, A.front - 2, FLOOR, 0.62 + 0.15 * (x / w));
    g.set(x, A.front - 1, x % 7 === 3 ? "brass-4" : "brass-2");
    g.set(x, A.front, "brass-0");
  }
}

// ---------- rails, posts, lanterns ----------
function lantern(g: Px, cx: number, base: number, sky = true) {
  // brass foot, glass with a hot core, brass hood + ring; light from the upper right
  g.rect(cx - 2, base - 1, 5, 1, "brass-1"); g.set(cx + 2, base - 1, "brass-3");
  for (let j = 0; j < 4; j++) for (let i = -1; i <= 1; i++) tone(g, cx + i, base - 2 - j, LAMP, 0.85 - Math.abs(i) * 0.25 - (j === 0 ? 0.25 : 0) + (i === 1 ? 0.08 : 0));
  g.vline(cx - 2, base - 5, 4, "brass-1"); g.vline(cx + 2, base - 5, 4, "brass-3");
  g.rect(cx - 2, base - 6, 5, 1, "brass-2"); g.set(cx + 2, base - 6, "brass-4"); g.set(cx, base - 7, "brass-3");
  // steady halo: warms the metal round it and (25%) the sky behind
  g.glowDisc(cx + 0.5, base - 3.5, 6, "sun-4", 0.25, [cx - 2, base - 7, 5, 7]);
  if (sky) for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 0], [3, 0], [-1, -8], [1, -8]]) g.glow(cx + dx, base - 3 + dy, 1, 1, "sun-4", 0.5, true); // a few warm sparks of light, no disc
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
    post(g, x, y0 - 11, y0 + 1);
    if (k % 3 === 0 || k === n) lantern(g, x + 2, y0 - 11);
  }
}

function sideRails(g: Px, w: number) {
  // the chamfered back corners and the two short ends: a diagonal copper rail on each corner
  for (const [x0, x1, sgn] of [[0, CH, 1], [w - 1, w - 1 - CH, -1]] as const) {
    for (let k = 0; k <= CH; k++) { const x = x0 + sgn * k, y = A.back + CH - k - 9; g.set(x, y, "copper-1"); g.set(x, y + 1, "copper-0"); }
  }
  for (const x of [0, w - 5]) { post(g, x, A.back + CH - 10, A.front + 1); }
  for (let y = A.back + CH - 8; y < A.front - 4; y++) { g.set(1, y, "copper-0"); g.set(w - 3, y, "copper-2"); }
}

function frontRail(g: Px, w: number) {
  const y0 = A.front;
  cylH(g, 0, y0 - 6, w, 2, CU, { amb: 0.18, gloss: 1.2 });
  const n = Math.max(2, Math.round(w / 34));
  for (let k = 0; k <= n; k++) {
    const x = Math.round((k * (w - 5)) / n);
    post(g, x, y0 - 8, y0 + 2);
    if (k === 0 || k === n) lantern(g, x + 2, y0 - 8);
  }
}

// ---------- skirt ----------
function skirt(g: Px, w: number) {
  const y0 = A.front + 1, y1 = A.skirt;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const v = (y - y0) / (y1 - y0);
    let t = 0.42 - 0.18 * v + 0.1 * (x / w) + (blotch(x, y, 4, 21) - 0.5) * 0.22;
    if (x < 3) t -= 0.12; // the left end turns away from the light
    tone(g, x, y, WARM, t + 0.08);
    const ru = blotch(x, y, 3, 23);
    if (ru > 0.84 && noise(x, y, 25) < 0.55) g.set(x, y, ru > 0.9 ? "copper-0" : "plate-1");
  }
  strap(g, 0, y0, w, 2, GOLD, 0, false); // top band
  for (let x = 3; x < w; x += 6) rivet(g, x, y0 + 6, "iron-4", "soot"); // a rivet row across the middle
  strap(g, 0, y1 - 3, w, 2, GOLD); // bottom band
  for (let x = 3; x < w; x += 6) rivet(g, x, y1 - 3, "brass-5", "brass-1");
  g.hline(0, y1 - 1, w, "soot"); // the under-lip in shadow
  // brackets: riveted plates bolted over the skirt, standing a px proud with a cast shadow
  for (let x = 14; x < w - 6; x += 32) {
    strap(g, x, y0 - 1, 6, y1 - y0 + 2, WARM);
    for (let y = y0 + 2; y < y1 - 2; y += 3) { rivet(g, x + 1, y, "brass-3", "brass-0"); rivet(g, x + 4, y, "brass-4", "brass-0"); }
    // a rust streak running down from the bracket's foot
    if (hash(x, 1) < 0.6) for (let y = y1 - 1; y < y1 + 1; y++) g.set(x + 1, y, "copper-0");
  }
}

// ---------- rock underside ----------
function depth(x: number, w: number) {
  const k = 1 - ((x - w / 2) / (w / 2)) ** 2;
  return 8 + 40 * Math.pow(Math.max(0, k), 0.6) + (blotch(x, 0, 7, 31) - 0.5) * 10;
}
/** A boulder: flattened, dark, lit faintly from the upper right, with warm bounce light from the sunset clouds on its
 * underside and a soot crease where it meets its neighbours. */
function boulder(g: Px, cx: number, cy: number, r: number, seed: number) {
  const ry = r * 0.8;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    const lump = 0.82 + 0.18 * blotch(x, y, 2, seed);
    if (d > lump) continue;
    const nz = Math.sqrt(Math.max(0, 1 - d));
    let v = 0.22 + 0.5 * Math.max(0, dx * 0.6 - dy * 0.5 + nz * 0.5) * 0.8 + (noise(x, y, seed) - 0.5) * 0.12;
    if (d > lump * 0.75 && dx < 0.2 && dy < 0) v -= 0.12; // the crease on the shadow side
    tone(g, x, y, ROCK, v);
    if (dy > 0.45 && d > lump * 0.55) g.set(x, y, dy > 0.75 && noise(x, y, seed + 1) < 0.7 ? "plate-1" : "haze-0"); // warm bounce from below
  }
}
function rocks(g: Px, w: number) {
  const y0 = A.skirt;
  // a dark mass first so the boulders never show sky between them
  for (let x = 1; x < w - 1; x++) { const d = depth(x, w) * 0.72; for (let y = y0; y < y0 + d; y++) g.set(x, y, (x + y) & 1 ? "iron-0" : "soot"); }
  const n = Math.round(w / 1.6);
  const bs: { x: number; y: number; r: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = 3 + hash(i, 1, 33) * (w - 6), d = depth(x, w), r = 2.5 + hash(i, 2, 33) * 3.5 + d * 0.05;
    bs.push({ x, y: y0 + 1 + hash(i, 3, 33) * Math.max(1, d - r * 0.8), r, s: i });
  }
  bs.sort((a, b) => a.y - b.y);
  for (const b of bs) {
    boulder(g, b.x, b.y, b.r, b.s);
    // under the deck the top of each rock sits in the skirt's shadow
    for (let y = Math.floor(b.y - b.r); y < b.y - b.r * 0.4; y++) for (let x = Math.floor(b.x - b.r); x <= b.x + b.r; x++) if (y < y0 + 4 && g.has(x, y) && ((x + y) & 1)) g.set(x, y, "soot");
  }
  // cyan cracks: steady energy seams on a few rocks (never pulse)
  for (let i = 0; i < Math.max(2, Math.round(w / 48)); i++) {
    const x0 = Math.round(20 + ((i + 0.5) / Math.max(2, Math.round(w / 48))) * (w - 40) + (hash(i, 7, 41) - 0.5) * 18);
    if (Math.abs(x0 - orbX(w)) < 16) continue;
    let x = x0, y = y0 + 3;
    const len = 6 + Math.round(hash(i, 8, 41) * 6);
    for (let k = 0; k < len; k++) {
      g.set(x, y, k % 3 === 1 ? "energy-3" : "energy-2"); g.set(x - 1, y, "energy-0");
      g.glow(x - 2, y, 1, 1, "energy-1", 0.5); g.glow(x + 1, y, 1, 1, "energy-1", 0.5); g.glow(x + 2, y, 1, 1, "energy-1", 0.25);
      y++; if (hash(i, k, 43) < 0.45) x += hash(i, k, 44) < 0.5 ? -1 : 1;
    }
  }
  // copper pipe loops hung under the skirt between brackets, and a hanging lantern every other bay
  for (let x = 20, k = 0; x < w - 30; x += 32, k++) {
    if (Math.abs(x + 13 - orbX(w)) < 18 || ventXs(w).some((v) => Math.abs(x + 13 - v) < 22)) continue;
    if (k % 2 === 0) tube(g, [[x, y0 - 1], [x, y0 + 5], [x + 13, y0 + 5], [x + 13, y0 - 1]], 1.4, CU, { bend: 4, amb: 0.1, gloss: 0.8 });
    else { g.vline(x + 6, y0, 3, "iron-3"); lantern(g, x + 6, y0 + 9, true); }
  }
}

// ---------- the core orb ----------
function orb(g: Px, w: number) {
  const cx = Math.round(orbX(w)) + 0.5, cy = A.orb.y + 2, R = 13;
  // the riser that holds it: copper with brass collars, from the skirt down through the rock
  cylV(g, cx - 2.5, A.skirt - 1, 5, cy - R - A.skirt + 2, CU, { amb: 0.15, gloss: 1.1 });
  for (const y of [A.skirt + 2, cy - R - 3]) cylV(g, cx - 4.5, y, 9, 2, BRASS, { amb: 0.15, gloss: 1 });
  // the glass and its glowing core
  ball(g, cx, cy, R - 0.5, ENERGY, { amb: 0.2, gloss: 0.45 });
  ball(g, cx + 0.5, cy + 0.5, 4.2, ["energy-2", "energy-2", "energy-3", "energy-3", "white"], { amb: 0.45, gloss: 0.6 });
  g.set(cx + 4, cy - 6, "white"); g.set(cx + 5, cy - 5, "energy-3"); // one glint on the glass
  // the brass cage: meridians (ellipses that narrow toward the edges), an equator band, top and bottom caps
  const cage = (x: number, y: number) => { const s = (x + 0.5 - cx) / R; g.set(x, y, s > 0.3 ? "brass-4" : s > -0.3 ? "brass-3" : "brass-1"); };
  for (const ph of [-0.82, -0.35, 0.35, 0.82]) for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.04) cage(Math.round(cx + Math.sin(ph) * R * Math.cos(a) - 0.5), Math.round(cy + R * Math.sin(a) - 0.5));
  for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.04) cage(Math.round(cx - 0.5), Math.round(cy + R * Math.sin(a) - 0.5));
  for (let x = Math.floor(cx - R); x <= cx + R; x++) { cage(x, Math.round(cy - 0.5)); if (g.has(x, Math.round(cy + 0.5))) g.set(x, Math.round(cy + 0.5), "brass-0"); }
  cylH(g, cx - 5.5, cy - R - 1, 11, 2, BRASS, { amb: 0.2, gloss: 1 });
  cylH(g, cx - 4.5, cy + R - 1, 9, 2, BRASS, { amb: 0.12, gloss: 0.8 });
  g.vline(cx - 0.5, cy + R + 1, 2, "brass-2"); g.set(cx - 0.5, cy + R + 3, "brass-4"); // finial
  // a steady cool halo: on the rock above and, faintly, the sky round it
}

// ---------- the steam vents (static part) ----------
function vents(g: Px, w: number) {
  for (const x of ventXs(w)) {
    tube(g, [[x - 11, A.front + 7], [x, A.front + 7], [x, VENT_MOUTH - 2]], 4, CU, { bend: 6, amb: 0.12, gloss: 1.2 });
    cylV(g, x - 12, A.front + 2, 2, 10, BRASS, { amb: 0.15 }); // the flange where it leaves the skirt
    cylV(g, x - 5, VENT_MOUTH - 6, 10, 3, BRASS, { amb: 0.15, gloss: 1 }); // the mouth collar
    cylV(g, x - 5, VENT_MOUTH - 14, 10, 2, BRASS, { amb: 0.15, gloss: 1 });
    for (let i = -4; i <= 4; i++) g.set(x + i - 0.5, VENT_MOUTH - 2, Math.abs(i) < 4 ? "soot" : "brass-1"); // the dark mouth
  }
}

/** The deck's right-hand end: the slab's side face in light, trimmed in brass, so a smaller deck still looks finished. */
function endCap(g: Px, w: number) {
  for (let y = A.back + CH; y < A.skirt; y++) for (let x = w - 3; x < w; x++) tone(g, x, y, WARM, 0.5 + (x - w + 3) * 0.08 - (y > A.front ? 0.12 : 0));
  g.vline(w - 1, A.back + CH, A.skirt - A.back - CH, "brass-3");
  for (let y = A.back + CH + 2; y < A.skirt - 2; y += 4) rivet(g, w - 2, y, "brass-4", "brass-0");
}

const cache = new Map<number, HTMLCanvasElement>();
/** The whole static hull, w art px wide: a canvas (w + 2*PAD) x H, art (0, 0) at (PAD, TOP). */
export function hullCanvas(w: number): HTMLCanvasElement {
  w = Math.max(60, Math.round(w));
  let cv = cache.get(w);
  if (cv) return cv;
  const raw = new Px(w + 2 * PAD, H), g = shift(raw, PAD, TOP);
  rocks(g, w);
  orb(g, w);
  skirt(g, w);
  vents(g, w);
  floor(g, w);
  backRail(g, w);
  sideRails(g, w);
  frontRail(g, w);
  endCap(g, w);
  raw.outline();
  cv = raw.bake();
  cache.set(w, cv);
  return cv;
}

export type { Color };
