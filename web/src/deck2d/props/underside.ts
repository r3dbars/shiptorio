import type { Color } from "../stations/palette";
import { Px } from "../stations/px";
import { BRASS, GOLD, ball, bezel, blotch, cylV, noise, rivet, strap, tone, type Ramp } from "../stations/shade";
import { CU, lathe, lit } from "./boiler2d";

// The deck's sides and underside, drawn to match the launch island (Justin, 2026-10-29: "make the bottom of the island
// for the main factory line match that ... I want the engine to be right in the middle"). The island reads as a heavy
// iron rim band with copper pillars over a hanging mass of warm dark boulders that tapers to a point, a few cyan
// crystal shards and loose rocks floating round it. Same recipe here, stretched to the deck's width:
//
//   rim     a thick riveted iron band (brass top trim, dark lip) with keystone brackets under the rail posts and a
//           warm copper pillar every third one, like the island's
//   rocks   rounded boulders, each lit on its upper right, dark crevices between them, warm browns with cool steel in
//           the deepest shadows; the mass hangs in lobes and tapers to its lowest point at the middle
//   shards  cyan crystals in leaning pairs, the two biggest flanking the engine like the island's V
//   engine  the deck's engine hangs at the very middle: a riveted steel drum on two struts, brass flanges, turbine pods
//           at its ends, a nozzle underneath and a round window on the core (index.ts draws the core's light)
//
// Coordinates are art px with (0, 0) at the deck's back-left corner, the same grid as hull.ts. Everything is static
// except the core window and the slow light in the shards, which index.ts drives.

/** Warm dark rock, darkest to lightest: lit faces go brown, never orange. */
const ROCK: Ramp = ["soot", "iron-0", "iron-1", "brass-0", "iron-2", "plate-1", "plate-2", "plate-3"];
/** The rim band's plates: warm black iron. */
const RIM: Ramp = ["soot", "iron-0", "plate-0", "iron-1", "brass-0", "iron-2", "plate-1", "plate-2"];
/** Engine drum: cool dark steel (art direction: steel bodies, brass only as jewelry). */
const DRUM: Ramp = ["soot", "steel-0", "iron-1", "steel-1", "steel-2", "iron-3", "steel-3", "haze-2"];
const ENERGY: Ramp = ["steel-0", "energy-0", "energy-1", "energy-1", "energy-2", "energy-3"];

const hash = (a: number, b: number, s = 0) => noise(a * 7 + 3, b * 13 + 5, s);

export interface Under { y0: number; y1: number; w: number }

// ---------- the silhouette ----------
/** How far the rock hangs below the rim at column x, before the boulders round it off. Deepest at the middle. */
export function depth(x: number, w: number) {
  const u = (x - w / 2) / (w / 2), a = Math.abs(u);
  let d = 18 + 64 * Math.pow(Math.max(0, 1 - a), 1.6);
  // hanging lobes so a long deck doesn't read as one flat wedge
  for (const [at, spread, h] of [[-0.66, 0.16, 24], [-0.34, 0.1, 12], [0.3, 0.11, 14], [0.64, 0.15, 21]]) {
    const k = Math.max(0, 1 - Math.abs(u - at) / spread);
    d += h * k * k * (3 - 2 * k);
  }
  d += (blotch(x, 0, 9, 31) - 0.5) * 7;
  return Math.min(d, 5 + 2.2 * Math.min(x, w - 1 - x)); // the ends turn under, stepped back from the rim
}

// ---------- boulders ----------
// Two scales of cells: big stones (dark crevices between them, each one shaded as a rounded lump lit on its upper
// right) and smaller facets inside each stone (a lit lip, no crevice), so the mass reads as chiselled boulders, not
// cobbles. The whole mass is also shaded as one form: the half of the V that faces the sun is lighter.
const BIG = 17, FACET = 8;
interface Seed { x: number; y: number; r: number; t: number }
function seeds(cell: number, salt: number) {
  const m = new Map<number, Seed>(); // numeric keys: this runs ~18 times per rock pixel on the first frame
  return (i: number, j: number) => {
    const k = (i + 32768) * 65536 + (j + 32768);
    let s = m.get(k);
    if (!s) {
      s = { x: (i + 0.15 + hash(i, j, salt + 1) * 0.7) * cell, y: (j + 0.15 + hash(i, j, salt + 2) * 0.7) * cell * 0.75, r: cell * (0.6 + hash(i, j, salt + 4) * 0.3), t: hash(i, j, salt + 3) };
      m.set(k, s);
    }
    return s;
  };
}
function nearest(at: (i: number, j: number) => Seed, cell: number, x: number, j: number) {
  const gx = Math.floor(x / cell), gy = Math.floor(j / (cell * 0.75));
  let best = Infinity, second = Infinity, s = at(gx, gy);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gy - 1; b <= gy + 1; b++) {
    const c = at(a, b), dx = x + 0.5 - c.x, dy = (j + 0.5 - c.y) * 1.2, d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) { second = best; best = d; s = c; } else if (d < second) second = d;
  }
  return { s, best, seam: second - best };
}

/** The rock mass. Returns the lowest rock row per column so index.ts can float loose stones just under it. */
export function rocks(g: Px, u: Under): Int16Array {
  const { y1: y0, w } = u, big = seeds(BIG, 100), facet = seeds(FACET, 200), bottom = new Int16Array(w).fill(-1);
  const D = Array.from({ length: w }, (_, x) => depth(x, w));
  const Dat = (x: number) => D[Math.max(0, Math.min(w - 1, Math.round(x)))];
  for (let x = 1; x < w - 1; x++) {
    const slope = (Dat(x + 8) - Dat(x - 8)) / 16; // >0: the underside here faces down-left, away from the sun
    for (let j = 0; j < D[x] + BIG; j++) {
      const { s, best, seam } = nearest(big, BIG, x, j);
      // inside the envelope, or part of a stone whose centre is inside it (that rounds the silhouette into stones)
      if (!(j < D[x] - 2 || (s.y < Dat(s.x) - 2 && best < s.r))) continue;
      const f = nearest(facet, FACET, x, j);
      const nx = (x + 0.5 - s.x) / s.r, ny = (j + 0.5 - s.y) / s.r, r2 = Math.min(1.4, nx * nx + ny * ny);
      const face = nx * 0.62 - ny * 0.78; // >0 faces the sun (upper right)
      const fface = (x + 0.5 - f.s.x) * 0.62 - (j + 0.5 - f.s.y) * 0.78;
      let v = 0.5 + 0.36 * face - 0.18 * r2 + (s.t - 0.5) * 0.26 + (f.s.t - 0.5) * 0.08;
      v -= 0.22 * Math.max(-0.6, Math.min(1, slope * 1.6)); // the whole V: sun side lighter
      v -= 0.18 * Math.pow(j / Math.max(10, D[x]), 1.4); // deeper is darker
      v += 0.05 * (x / w) + (blotch(x, j, 26, 113) - 0.5) * 0.12;
      if (j < 7) v -= (7 - j) * 0.045; // the rim's overhang shades the top of the stone
      if (seam < 0.9) v = 0.03; // crevice between stones
      else if (seam < 1.6) v = Math.min(v, 0.16); // its soft edge
      else if (seam < 3 && face > 0.25) v += 0.2; // a stone's lit lip
      else if (f.seam < 0.9 && v > 0.3) v -= 0.12; // a facet edge: a shallow crease, not a crevice
      else if (f.seam < 2 && fface > 1) v += 0.07; // a facet's lit edge
      v += (noise(x, j, 109) - 0.5) * 0.05;
      const y = y0 + j;
      tone(g, x, y, ROCK, v);
      // cool steel in the deepest shadow (lower left of a stone), like the island's underside
      if (seam >= 1.6 && face < -0.5 && r2 > 0.4 && noise(x, j, 111) < 0.5) g.set(x, y, v < 0.24 ? "steel-0" : "steel-1");
      // a little copper ore in the odd stone
      if (s.t > 0.88 && seam > 3 && face > 0 && noise(x, j, 112) > 0.72) g.set(x, y, "copper-0");
      if (y > bottom[x]) bottom[x] = y;
    }
  }
  return bottom;
}

// ---------- crystals ----------
/** One shard: a 2px bar leaning toward the middle, dark edge on its shaded side, bright core, white-hot tip. */
function shard(g: Px, x: number, y: number, len: number, lean: number) {
  const k = Math.hypot(lean, 1), dx = lean / k, dy = 1 / k;
  for (let i = 0; i < len; i++) {
    const px = x + dx * i, py = y + dy * i, tip = i >= len - 2;
    const taper = i < 2 || tip ? 1 : 2;
    for (let s = 0; s < taper + 1; s++) {
      const c: Color = s === taper ? "iron-0" : tip ? (i === len - 1 ? "energy-3" : "energy-2") : s === 0 ? (i % 5 === 2 ? "energy-3" : "energy-2") : "energy-1";
      const X = Math.round(px + (lean > 0 ? -s : s)), Y = Math.round(py);
      if (c === "iron-0" && !g.has(X, Y)) continue;
      g.set(X, Y, c);
    }
    g.glow(Math.round(px) - 2, Math.round(py), 5, 1, "energy-1", 0.25);
  }
}

export function crystals(g: Px, u: Under, avoid: (x: number) => boolean) {
  const { y1: y0, w } = u, c = w / 2;
  const n = Math.max(2, Math.round(w / 95));
  for (let i = 0; i < n; i++) {
    const x = Math.round(14 + ((i + 0.5) / n) * (w - 28) + (hash(i, 7, 41) - 0.5) * 22);
    if (avoid(x)) continue;
    const d = depth(x, w), lean = x < c ? 0.55 : -0.55;
    const len = Math.max(7, Math.min(Math.round(d * 0.42), 10 + Math.round(hash(i, 8, 41) * 7)));
    const top = y0 + Math.round(Math.max(9, d * 0.4 + hash(i, 9, 41) * 6));
    shard(g, x, top, len, lean);
    if (hash(i, 10, 41) < 0.8) shard(g, x + (lean > 0 ? 4 : -4), top + 3, Math.max(4, len - 4), lean); // its smaller twin
  }
  // the island's V: two big shards either side of the engine, leaning in toward its core
  for (const side of [-1, 1]) {
    const x = Math.round(c + side * 38), d = depth(x, w);
    shard(g, x, y0 + Math.round(d * 0.35), Math.round(d * 0.45), -side * 0.6);
    shard(g, x + side * 5, y0 + Math.round(d * 0.35) + 4, Math.round(d * 0.3), -side * 0.6);
  }
}

// ---------- the rim band (the deck's front face) ----------
/** Keystone brackets stand under the front rail's posts (hull.ts frontRail: x = 14 + 32k). */
export const bracketXs = (w: number) => { const xs: number[] = []; for (let x = 14; x < w - 6; x += 32) xs.push(x); return xs; };

export function rim(g: Px, u: Under) {
  const { y0, y1, w } = u, h = y1 - y0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const v0 = (y - y0) / h;
    let v = 0.42 - 0.14 * v0 + 0.08 * (x / w) + (blotch(x, y, 5, 21) - 0.5) * 0.12 + (noise(x, y, 22) - 0.5) * 0.04;
    if (x < 3) v -= 0.14; // the left end turns away from the light
    tone(g, x, y, RIM, v);
  }
  strap(g, 0, y0, w, 2, GOLD, 0, false); // brass top trim, catching the sun
  g.hline(0, y0 + 2, w, "soot"); // the floor's overhang
  g.hline(0, y0 + 3, w, "iron-0");
  // plate seams with a lit right-hand bevel, two rivet rows
  for (let x = 30; x < w - 4; x += 32) { g.vline(x, y0 + 4, h - 8, "iron-0"); g.vline(x + 1, y0 + 4, h - 8, "iron-2"); }
  for (let x = 4; x < w - 2; x += 8) { rivet(g, x, y0 + 4, "iron-4", "iron-0"); rivet(g, x, y1 - 6, "iron-3", "iron-0"); }
  // the heavy bottom lip
  for (let x = 0; x < w; x++) { g.set(x, y1 - 4, x % 9 === 4 ? "brass-3" : "brass-1"); tone(g, x, y1 - 3, RIM, 0.5 + 0.1 * (x / w)); tone(g, x, y1 - 2, RIM, 0.3); g.set(x, y1 - 1, "soot"); }
  bracketXs(w).forEach((x, k) => k % 3 === 1 ? pillar(g, x - 1, y0 - 1, y1 + 3) : keystone(g, x, y0 - 1, y1 + 4));
  keystone(g, Math.round(w / 2) - 6, y0 - 1, y1 + 6, 12); // the big one over the engine
}

/** A keystone bracket: a riveted iron strap with a brass edge on its lit side, running a few px down into the rock. */
function keystone(g: Px, x: number, top: number, bot: number, wid = 6) {
  strap(g, x, top, wid, bot - top, RIM);
  g.vline(x + wid - 1, top + 1, bot - top - 2, "brass-2");
  g.set(x + wid - 1, top + 1, "brass-4");
  for (let y = top + 3; y < bot - 2; y += 3) { rivet(g, x + 1, y, "brass-3", "brass-0"); rivet(g, x + wid - 2, y, "brass-4", "brass-0"); }
  // tapered foot: the strap narrows to a point where it bites into the stone
  for (let i = 0; i < 3; i++) { g.hline(x + i + 1, bot + i, wid - 2 - 2 * i, i === 0 ? "iron-2" : "iron-1"); }
}

/** A copper pillar, the island's warm column: a lit round post with brass bands top and bottom. */
function pillar(g: Px, x: number, top: number, bot: number) {
  cylV(g, x, top, 8, bot - top, CU, { amb: 0.16, gloss: 1.1 });
  for (const y of [top, bot - 3]) cylV(g, x - 1, y, 10, 3, BRASS, { amb: 0.16, gloss: 1 });
  g.hline(x - 1, bot, 10, "soot");
}

/** The right-hand end: the slab's side face in light, trimmed in brass, so a smaller deck still looks finished. The left end
 * gets a dark corner post (it faces away from the sun). */
export function ends(g: Px, u: Under, from: number) {
  const { y1, w } = u;
  for (let y = from; y < y1; y++) for (let x = w - 3; x < w; x++) tone(g, x, y, RIM, 0.52 + (x - w + 3) * 0.09 - (y > u.y0 ? 0.1 : 0));
  g.vline(w - 1, from, y1 - from, "brass-3");
  for (let y = from + 2; y < y1 - 2; y += 4) rivet(g, w - 2, y, "brass-4", "brass-0");
  for (let y = u.y0; y < y1; y++) { g.set(0, y, "iron-0"); g.set(1, y, "iron-1"); g.set(2, y, y % 4 === 1 ? "brass-1" : "iron-1"); }
}

// ---------- the engine ----------
/** Where the engine sits: centred on the deck. win = the core window's centre (index.ts draws the light in it). */
export function enginePos(u: Under) {
  const cx = Math.round(u.w / 2), top = u.y1 + 50;
  return { cx, top, win: { x: cx, y: top + 12 }, bottom: top + 37 };
}
export const WIN_R = 7;

export function engine(g: Px, u: Under) {
  const { cx, top, win } = enginePos(u);
  const L = cx - 30, R = cx + 30, H = 25; // the drum
  // the drum's contact shadow on the stone it hangs in
  for (let x = L - 8; x <= R + 8; x++) for (let k = 1; k <= 2; k++) if (g.has(x, top - k)) g.set(x, top - k, k === 1 ? "soot" : "iron-0");
  // turbine pods at both ends: short steel cans with grille slats and a brass ring
  for (const [px, side] of [[L - 7, -1], [R + 1, 1]] as const) {
    lathe(g, px + 3, top + 3, top + H - 3, () => 3.5, DRUM, { amb: 0.12, gloss: 0.7 });
    for (let y = top + 5; y < top + H - 4; y += 2) g.hline(px + (side < 0 ? 0 : 1), y, 6, y % 4 === 1 ? "soot" : "steel-0");
    cylV(g, px - 0.5, top + 2, 8, 2, BRASS, { amb: 0.14 });
    cylV(g, px - 0.5, top + H - 4, 8, 2, BRASS, { amb: 0.12 });
  }
  // the drum: a lying cylinder lit along its top, brighter toward the sun's side, rounded at both ends
  for (let j = 0; j < H; j++) for (let x = L; x <= R; x++) {
    const ny = -((j + 0.5) / H * 2 - 1), sx = (x + 0.5 - cx) / (R - L + 1) * 2;
    const nz = Math.sqrt(Math.max(0.05, 1 - ny * ny * 0.85)), end = Math.max(0, Math.abs(sx) - 0.86) * 6;
    const v = lit(sx * 0.35 + end * Math.sign(sx) * 0.6, ny, nz, 0.1, 0.55) + (blotch(x, j, 4, 61) - 0.5) * 0.12;
    tone(g, x, top + j, DRUM, v);
  }
  // brass flanges at the ends, iron ribs either side of the window, a seam along the belly
  for (const fx of [L, R - 2]) { cylV(g, fx, top - 1, 3, H + 2, BRASS, { amb: 0.14, gloss: 1 }); for (let y = top + 1; y < top + H; y += 3) g.set(fx + 1, y, "brass-5"); }
  for (const rx of [cx - 17, cx + 15]) {
    cylV(g, rx, top, 3, H, DRUM, { amb: 0.22, gloss: 0.9 });
    for (let y = top + 2; y < top + H - 1; y += 4) rivet(g, rx + 1, y, "brass-3", "soot");
  }
  g.hline(L + 3, top + H - 5, R - L - 5, "steel-0");
  for (let x = L + 4; x < R - 2; x += 4) if (Math.abs(x - cx) > 12) rivet(g, x, top + 2, "steel-3", "steel-0");
  // two riveted saddle straps hold the drum up into the stone, brass collars where they bite
  for (const sx of [cx - 23, cx + 17]) {
    strap(g, sx, top - 10, 6, H - 3, RIM);
    g.vline(sx + 5, top - 9, H - 5, "brass-2"); g.set(sx + 5, top - 9, "brass-4");
    for (let y = top - 7; y < top + H - 6; y += 4) rivet(g, sx + 2, y, "brass-3", "brass-0");
    cylV(g, sx - 1, top - 11, 8, 3, BRASS, { amb: 0.16, gloss: 1 });
  }
  // the nozzle: a short bell under the drum, glowing faintly cyan in its throat
  lathe(g, cx, top + H, top + H + 11, (y) => 4 + (y - top - H) * 0.55, CU, { amb: 0.12, gloss: 1, seed: 7 });
  cylV(g, cx - 5, top + H, 10, 2, BRASS, { amb: 0.14, gloss: 1 });
  for (let x = cx - 8; x <= cx + 8; x++) if (g.has(x, top + H + 10)) g.set(x, top + H + 10, Math.abs(x - cx) < 6 ? "energy-0" : "soot");
  g.set(cx - 1, top + H + 10, "energy-1"); g.set(cx, top + H + 10, "energy-1");
  g.glow(cx - 6, top + H + 11, 13, 2, "energy-1", 0.25, true);
  // the core window: a raised brass bezel; the glass stays dim here (index.ts lights it)
  bezel(g, win.x, win.y, WIN_R, WIN_R + 3, BRASS);
  g.disc(win.x, win.y, WIN_R, "steel-0");
  rivet(g, win.x + 7, win.y - 6, "brass-5", "brass-1"); rivet(g, win.x - 8, win.y + 5, "brass-2", "brass-0");
}

/** The core's light: eight tiny frames of a glowing ball behind the window glass. Blocked turns it jam red. */
export function coreFrame(g: Px, cx: number, cy: number, blocked: boolean, phase: number) {
  const bright = phase >= 2 && phase <= 5;
  const glass: Ramp = blocked ? ["jam-0", "jam-0", "jam-1", "jam-1", "jam-2", "jam-2"] : ENERGY;
  const core: Ramp = blocked ? (bright ? ["jam-1", "jam-2", "jam-2"] : ["jam-0", "jam-1", "jam-2"]) : (bright ? ["energy-1", "energy-2", "energy-3", "white"] : ["energy-0", "energy-1", "energy-2"]);
  ball(g, cx, cy, WIN_R - 0.5, glass, { amb: 0.1, gloss: 0.3 });
  const drift = phase < 4 ? -0.5 : 0.5;
  ball(g, cx + drift, cy - drift, bright ? 3.5 : 2.5, core, { amb: 0.4, gloss: 0.4 });
  g.set(cx + 2, cy - 4, "white"); g.set(cx + 3, cy - 3, blocked ? "jam-2" : "energy-3");
  g.glowDisc(cx, cy, WIN_R + (bright ? 7 : 5), blocked ? "jam-2" : "energy-1", 0.25, [cx - WIN_R, cy - WIN_R, WIN_R * 2, WIN_R * 2]);
}

// ---------- loose stones ----------
/** A small floating stone in the island's style: a lumpy diamond, lit upper right, steel in its shade. */
export function stone(size: number, seed: number): HTMLCanvasElement {
  const n = size * 2 + 5, g = new Px(n, n), c = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5 - c) / size, dy = (y + 0.5 - c) / (size * 1.15);
    const a = Math.atan2(dy, dx), bump = 0.82 + 0.18 * Math.sin(a * 3 + seed * 1.9) + 0.1 * Math.sin(a * 5 + seed);
    const r = Math.hypot(dx, dy) / bump + Math.max(0, dy) * 0.25; // lumpy, a little pointed underneath
    if (r > 1) continue;
    const face = dx * 0.62 - dy * 0.78;
    let v = 0.5 + 0.34 * face - 0.18 * r * r + (noise(x, y, seed) - 0.5) * 0.08;
    if (r > 0.72 && face > 0.35) v += 0.14; // lit rim
    tone(g, x, y, ROCK, v);
    if (face < -0.45 && r > 0.45 && noise(x, y, seed + 3) < 0.6) g.set(x, y, "steel-1");
  }
  g.outline();
  return g.bake();
}

