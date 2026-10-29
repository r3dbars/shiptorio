import { HULL, ART_PX } from "../contract";
import type { Color } from "../stations/palette";
import { Px, shift } from "../stations/px";
import { BRASS, GOLD, IRON, ball, blotch, cylH, cylV, noise, rivet, strap, tone, type Ramp } from "../stations/shade";
import { CU, tube } from "../../bakeoff/boiler2d";
import { dressFloor } from "./clutter";

// The large deck's hull drawn in code on the art grid (contract HULL): warm iron floor plates, a perimeter rail with
// brass-capped posts and lanterns, a riveted front skirt with brass bands and brackets, a rock underside with cyan
// cracks and copper pipe loops, the caged core orb and two copper steam vents. The hull lights stay steady;
// index.ts drives the separate core pulse and blocked-state warning along with the steam and boiler smoke.
//
// Coordinates here are art px (world / ART_PX). hullCanvas(w) renders a deck w art px wide, cached; the deck grows by
// re-rendering at the new width (the vents and the right-hand end ride with the edge).

// More walkable floor in front of the machines, without scaling any artwork.
const FRONT_DEPTH = 14;
export const A = {
  back: Math.round(HULL.back / ART_PX),
  front: Math.round(HULL.front / ART_PX) + FRONT_DEPTH,
  skirt: Math.round(HULL.skirt / ART_PX) + FRONT_DEPTH,
  orb: { x: HULL.orb.x / ART_PX, y: HULL.orb.y / ART_PX + FRONT_DEPTH + 58 },
};
/** The canvas starts TOP art px above y 0 (lanterns on the back rail) and is H tall (orb at the bottom). */
export const TOP = 20, H = 250, PAD = 2;

/** Warm dark iron for the skirt and posts: the deck reads brown-black like the mockups, not blue. */
const WARM: Ramp = ["soot", "iron-0", "iron-1", "iron-2", "plate-1", "iron-3", "iron-4"];
const POST: Ramp = ["soot", "brass-0", "plate-1", "brass-1", "plate-2", "brass-2", "brass-3", "brass-4"];
const ROCK: Ramp = ["soot", "iron-0", "iron-1", "iron-2", "steel-1", "iron-3", "iron-4"];
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
export const VENT_MOUTH = 122 + FRONT_DEPTH;

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

// ---------- skirt ----------
function skirt(g: Px, w: number) {
  const y0 = A.front + 1, y1 = A.skirt;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const v = (y - y0) / (y1 - y0);
    let t = 0.32 - 0.16 * v + 0.08 * (x / w) + (blotch(x, y, 4, 21) - 0.5) * 0.12;
    if (x < 3) t -= 0.12; // the left end turns away from the light
    tone(g, x, y, WARM, t + 0.08);
    const ru = blotch(x, y, 3, 23);
    if (ru > 0.84 && noise(x, y, 25) < 0.55) g.set(x, y, ru > 0.9 ? "copper-0" : "plate-1");
  }
  strap(g, 0, y0, w, 3, GOLD, 0, false); // top band
  g.hline(0, y0 + 3, w, "soot"); // the floor overhang casts a continuous shadow on the vertical face
  for (let x = 4; x < w; x += 8) { g.rect(x, y0 + 5, 2, 2, "iron-3"); g.set(x + 1, y0 + 5, "iron-4"); g.set(x, y0 + 6, "iron-1"); g.hline(x, y0 + 7, 2, "soot"); } // 2px bolt heads across the middle
  strap(g, 0, y1 - 4, w, 3, GOLD); // bottom band
  for (let x = 3; x < w; x += 6) rivet(g, x, y1 - 3, "brass-5", "brass-1");
  g.hline(0, y1 - 1, w, "soot"); // the under-lip in shadow
  // brackets: riveted plates bolted over the skirt, standing a px proud with a cast shadow
  for (let x = 14; x < w - 6; x += 32) {
    strap(g, x, y0 - 1, 6, y1 - y0 + 2, WARM);
    for (let y = y0 + 2; y < y1 - 2; y += 3) { rivet(g, x + 1, y, "brass-3", "brass-0"); rivet(g, x + 4, y, "brass-4", "brass-0"); }
  }
}
/** The brackets run on down past the skirt into the rock; every other one carries a hanging lantern. Drawn after the
 * rocks so they sit in front. */
function hangers(g: Px, w: number) {
  const y1 = A.skirt;
  for (let x = 14, k = 0; x < w - 6; x += 32, k++) {
    strap(g, x, y1 - 1, 6, 5, WARM);
    rivet(g, x + 1, y1 + 1, "brass-3", "brass-0"); rivet(g, x + 4, y1 + 1, "brass-4", "brass-0");
    g.hline(x, y1 + 4, 6, "soot");
    if (k % 2 === 1 && Math.abs(x + 3 - orbX(w)) > 20 && !ventXs(w).some((v) => Math.abs(x + 3 - v) < 12)) {
      g.vline(x + 3, y1 + 4, 3, "iron-3"); g.set(x + 2, y1 + 5, "iron-1");
      lantern(g, x + 3, y1 + 14, false);
    }
  }
}

// ---------- rock underside ----------
function depth(x: number, w: number) {
  const k = 1 - Math.abs((x - w / 2) / (w / 2));
  return 10 + 68 * Math.pow(Math.max(0, k), 0.65) + (blotch(x, 0, 13, 31) - 0.5) * 8;
}
function rocks(g: Px, w: number) {
  const y0 = A.skirt;
  // Interlocking, irregular stone faces: every pixel belongs to one fracture cell.
  // Jittered seeds avoid repeating diamonds, with vertical compression producing
  // long strata and small broken ledges instead of rounded piles or empty fill.
  const cell = 17;
  const seeds = new Map<string, { x: number; y: number; tone: number }>();
  const seedAt = (i: number, j: number) => {
    const key = `${i}:${j}`;
    let s = seeds.get(key);
    if (!s) { s = { x: (i + 0.18 + hash(i, j, 101) * 0.64) * cell, y: (j + 0.18 + hash(i, j, 102) * 0.64) * cell, tone: hash(i, j, 103) }; seeds.set(key, s); }
    return s;
  };
  for (let x = 1; x < w - 1; x++) {
    const d = Math.round(depth(x, w) - hash(Math.floor(x / 5), 0, 107) * 4);
    for (let j = 0; j < d; j++) {
      const y = y0 + j, gx = Math.floor(x / cell), gy = Math.floor(j / cell);
      let best = Infinity, second = Infinity, owner = seedAt(gx, gy);
      for (let a = gx - 1; a <= gx + 1; a++) for (let b = gy - 1; b <= gy + 1; b++) {
        const s = seedAt(a, b), dist = (x - s.x) ** 2 + ((j - s.y) * 0.78) ** 2;
        if (dist < best) { second = best; best = dist; owner = s; } else if (dist < second) second = dist;
      }
      const face = (x - owner.x) * 0.65 - (j - owner.y) * 0.35;
      let light = 0.28 + owner.tone * 0.2 + (face > 1.5 ? 0.13 : face < -3 ? -0.06 : 0);
      light -= Math.max(0, j / d - 0.65) * 0.16;
      const seam = second - best;
      if (seam < 7) light = 0.08; // narrow fracture depth
      else if (seam < 19 && face > 0) light += 0.16; // chipped lip catches the sun
      if (j < 4) light -= (4 - j) * 0.045; // the hull overhang occludes the stone
      tone(g, x, y, ROCK, light + (noise(x, y, 109) - 0.5) * 0.035);
      if (j > d - 3 && x % 5 < 2) g.set(x, y, "iron-2"); // little exposed chips on the silhouette
      if (owner.tone > 0.75 && j % 11 === 4 && seam > 20 && noise(x, y, 110) > 0.65) g.set(x, y, "copper-0");
    }
  }
  // cyan cracks: steady energy seams running down through the rock, some forked (they never pulse)
  const nc = Math.max(2, Math.round(w / 44));
  for (let i = 0; i < nc; i++) {
    const x0 = Math.round(16 + ((i + 0.5) / nc) * (w - 32) + (hash(i, 7, 41) - 0.5) * 16);
    if (Math.abs(x0 - orbX(w)) < 22 || ventXs(w).some((v) => Math.abs(x0 - v) < 10)) continue;
    const len = Math.min(Math.round(depth(x0, w)) - 4, 24 + Math.round(hash(i, 8, 41) * 28));
    const run = (x: number, y: number, n: number, seed: number) => {
      for (let k = 0; k < n; k++) {
        g.set(x, y, k % 4 === 2 ? "energy-3" : "energy-2"); if (g.has(x - 1, y)) g.set(x - 1, y, "energy-0");
        g.glow(x - 2, y, 1, 1, "energy-1", 0.5); g.glow(x + 1, y, 1, 1, "energy-1", 0.5); g.glow(x + 2, y, 1, 1, "energy-1", 0.25);
        y++; if (hash(seed, k, 43) < 0.5) x += hash(seed, k, 44) < 0.5 ? -1 : 1;
        if (k === 4 && n > 8 && hash(seed, 9, 45) < 0.7) run(x + 1, y, Math.round(n / 3), seed + 17); // a fork
      }
    };
    run(x0, y0 + 2, len, i);
  }
  // big pipe loops slung under the skirt, dark iron with brass collars, in front of the rock
  const bays = Math.floor((w - 20) / 64);
  for (let k = 0; k < bays; k++) {
    const x = 22 + k * 64, wid = 40 + Math.round(hash(k, 3, 51) * 8), d = 9 + Math.round(hash(k, 4, 51) * 5);
    if (Math.abs(x + wid / 2 - orbX(w)) < 34 || ventXs(w).some((v) => v > x - 14 && v < x + wid + 14)) continue;
    tube(g, [[x, y0 - 1], [x + 2, y0 + d], [x + wid - 2, y0 + d], [x + wid, y0 - 1]], 1.6, POST, { bend: 8, amb: 0.12, gloss: 0.9 });
    for (const cx of [x + 1, x + wid - 1]) cylV(g, cx - 2, y0 + 1, 4, 2, BRASS, { amb: 0.15 });
  }
}

// ---------- the core orb ----------
function orb(g: Px, w: number, blocked = false, phase = 0) {
  const cx = Math.round(orbX(w)) + 0.5, cy = A.orb.y - 6, R = 20; // it hangs clear below the rocks; the engine frames pixel mode down to y 800 (160 art px)
  const bright = phase >= 2 && phase <= 5;
  const energy: Ramp = blocked
    ? ["jam-0", "jam-0", "jam-1", "jam-1", "jam-2", "jam-2", "white"]
    : ENERGY;
  const glow: Color = blocked ? "jam-2" : "energy-1";
  const core: Ramp = blocked
    ? (bright ? ["jam-1", "jam-2", "white"] : ["jam-0", "jam-1", "jam-2"])
    : (bright ? ["energy-1", "energy-2", "energy-3", "white"] : ["energy-0", "energy-1", "energy-2"]);
  // A short pressure neck seats into a bolted cradle in the rock. The feed pipe
  // is buried in the island instead of reading as a long pole over its face.
  const neck = cy - R - 13;
  strap(g, cx - 15.5, neck - 7, 31, 5, IRON);
  for (const dx of [-12, 12]) rivet(g, cx + dx - 0.5, neck - 5, "brass-3", "soot");
  for (const side of [-1, 1]) {
    tube(g, [[cx + side * 14, neck - 3], [cx + side * 10, neck + 8], [cx + side * 6, neck + 12]], 2.2, IRON, { amb: 0.14, gloss: 0.5 });
    cylV(g, cx + side * 10 - 1.5, neck - 2, 3, 7, CU, { amb: 0.18, gloss: 0.75 });
  }
  cylV(g, cx - 3.5, neck, 7, 15, CU, { amb: 0.15, gloss: 1.1 });
  for (const y of [neck, neck + 7, neck + 12]) cylV(g, cx - 5.5, y, 11, 2, BRASS, { amb: 0.15, gloss: 1 });
  // the glass and its glowing core
  ball(g, cx, cy, R - 0.5, energy, { amb: 0.12, gloss: 0.35 });
  const drift = phase < 4 ? -1 : 1;
  ball(g, cx + 0.5 + drift, cy + 0.5 - drift, bright ? 10 : 8, core, { amb: 0.35, gloss: 0.4 });
  g.set(cx + 9, cy - 12, "white"); g.set(cx + 10, cy - 11, blocked ? "jam-2" : "energy-3"); g.set(cx + 8, cy - 12, blocked ? "jam-2" : "energy-3"); g.set(cx + 10, cy - 10, blocked ? "jam-2" : "energy-3"); // one glint on the glass
  // the brass cage: meridians (ellipses that narrow toward the edges), an equator band, top and bottom caps
  const cage = (x: number, y: number) => { const s = (x + 0.5 - cx) / R; g.set(x, y, s > 0.3 ? "brass-4" : s > -0.3 ? "brass-3" : "brass-1"); };
  for (const ph of [-1.1, -0.7, -0.3, 0.3, 0.7, 1.1]) for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.04) cage(Math.round(cx + Math.sin(ph) * R * Math.cos(a) - 0.5), Math.round(cy + R * Math.sin(a) - 0.5));
  for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.04) cage(Math.round(cx - 0.5), Math.round(cy + R * Math.sin(a) - 0.5));
  for (let x = Math.floor(cx - R); x <= cx + R; x++) { cage(x, Math.round(cy - 0.5)); if (g.has(x, Math.round(cy + 0.5))) g.set(x, Math.round(cy + 0.5), "brass-0"); }
  cylH(g, cx - 10.5, cy - R - 2, 21, 4, BRASS, { amb: 0.2, gloss: 1 });
  cylH(g, cx - 8.5, cy + R - 2, 17, 4, BRASS, { amb: 0.12, gloss: 0.8 });
  for (let x = Math.floor(cx - R); x <= cx + R; x++) if (g.has(x, Math.round(cy - 1.5))) cage(x, Math.round(cy - 1.5)); // a 2px equator band
  g.vline(cx - 0.5, cy + R + 2, 2, "brass-2"); g.set(cx - 0.5, cy + R + 4, "brass-4"); // finial
  // Palette light layers breathe around the cage; blocked state uses the jam ramp.
  g.glowDisc(cx, cy, R + (bright ? 12 : 8), glow, bright ? 0.5 : 0.25, [Math.floor(cx - R), Math.floor(cy - R - 2), 2 * R + 2, 2 * R + 4]);
  for (let y = Math.floor(cy - R - 4); y <= cy + R + 4; y++) for (let x = Math.floor(cx - R - 4); x <= cx + R + 4; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d > R + 1 && d < R + 3.5 && !g.has(x, y) && ((x + y) & 1) && ((x >> 1) + (y >> 1)) % 2) g.glow(x, y, 1, 1, glow, 0.5, true); }
  // a steady cool halo: on the rock above and, faintly, the sky round it
}

// ---------- the steam vents (static part) ----------
function vents(g: Px, w: number) {
  for (const x of ventXs(w)) {
    tube(g, [[x - 14, A.front + 7], [x, A.front + 7], [x, VENT_MOUTH - 2]], 5, CU, { bend: 6, amb: 0.12, gloss: 1.2 });
    cylV(g, x - 15, A.front + 1, 2, 12, BRASS, { amb: 0.15 }); // the flange where it leaves the skirt
    cylV(g, x - 6.5, VENT_MOUTH - 7, 13, 4, BRASS, { amb: 0.15, gloss: 1 }); // the mouth collar
    cylV(g, x - 6.5, VENT_MOUTH - 17, 13, 2, BRASS, { amb: 0.15, gloss: 1 });
    for (let i = -5; i <= 5; i++) g.set(x + i - 0.5, VENT_MOUTH - 3, Math.abs(i) < 5 ? "soot" : "brass-1"); // the dark mouth
  }
}

/** The deck's right-hand end: the slab's side face in light, trimmed in brass, so a smaller deck still looks finished. */
function endCap(g: Px, w: number) {
  for (let y = A.back + CH; y < A.skirt; y++) for (let x = w - 3; x < w; x++) tone(g, x, y, WARM, 0.5 + (x - w + 3) * 0.08 - (y > A.front ? 0.12 : 0));
  g.vline(w - 1, A.back + CH, A.skirt - A.back - CH, "brass-3");
  for (let y = A.back + CH + 2; y < A.skirt - 2; y += 4) rivet(g, w - 2, y, "brass-4", "brass-0");
}

const cache = new Map<number, HTMLCanvasElement>();
const orbFrames = new Map<string, HTMLCanvasElement>();
/** Eight tiny cached frames: only the light/core moves; the hanging cage stays anchored. */
export function orbFrame(blocked: boolean, phase: number): HTMLCanvasElement {
  const key = `${blocked}:${phase}`;
  let cv = orbFrames.get(key);
  if (!cv) {
    const raw = new Px(76, 160);
    orb(shift(raw, 38 - Math.round(A.orb.x), 2 - A.skirt), A.orb.x + 24, blocked, phase);
    raw.outline();
    cv = raw.bake();
    orbFrames.set(key, cv);
  }
  return cv;
}
/** The whole static hull, w art px wide: a canvas (w + 2*PAD) x H, art (0, 0) at (PAD, TOP). */
export function hullCanvas(w: number): HTMLCanvasElement {
  w = Math.max(60, Math.round(w));
  let cv = cache.get(w);
  if (cv) return cv;
  const raw = new Px(w + 2 * PAD, H), g = shift(raw, PAD, TOP);
  rocks(g, w);
  skirt(g, w);
  hangers(g, w);
  vents(g, w);
  floor(g, w);
  backRail(g, w);
  sideRails(g, w);
  dressFloor(raw, g, w, PAD, TOP);
  frontRail(g, w);
  endCap(g, w);
  raw.outline();
  cv = raw.bake();
  cache.set(w, cv);
  return cv;
}

export type { Color };
