import type { Color } from "../deck2d/stations/palette";
import { Px, shift } from "../deck2d/stations/px";
import { BRASS, blotch, noise, tone, type Ramp } from "../deck2d/stations/shade";

// Bake-off, 2D side: the twin boiler (web/public/deck/art/boiler-on.webp) drawn 100% in code on the art grid.
// The hard bits on purpose: two round tanks with domed shoulders, copper pipes that bend in real elbows, brass bands
// with rivets that follow the curve, rust and grime on cool iron, fire windows with a glow, and big soft smoke.
// Every pixel is a Black Iron 48 color (glows are the one light-layer exception, like the stations).
// Built on the stations kit (px.ts, shade.ts) without touching it: tubes and lathe shapes are new here.

export const BOILER_W = 96, BOILER_H = 88;
const TOP = 4; // smoke headroom: the machine is laid out 10 rows down
const FRAMES = 12, FPS = 6;

const TANK: Ramp = ["soot", "steel-0", "iron-1", "steel-1", "iron-2", "steel-2", "iron-3", "steel-3", "haze-2"];
export const CU: Ramp = ["soot", "plate-0", "copper-0", "plate-2", "copper-1", "plate-3", "copper-2", "copper-3", "copper-4"];
const SMOKE: Ramp = ["iron-3", "iron-4", "haze-2", "haze-3", "white"];
const FIRE: Ramp = ["sun-0", "sun-1", "sun-2", "sun-3", "sun-4", "sun-5", "sun-6", "white"];

// light up-right and toward the viewer, same as shade.ts
const L = (() => { const v = [0.62, 0.48, 0.62]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
const H = (() => { const v = [L[0], L[1], L[2] + 1]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
export function lit(nx: number, ny: number, nz: number, amb: number, gloss: number) {
  const n = Math.hypot(nx, ny, nz) || 1;
  nx /= n; ny /= n; nz /= n;
  const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  const s = Math.pow(Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]), 28);
  return amb + 0.55 * d + gloss * s;
}

/** A tube along a path with rounded corners: every pixel gets the normal of the real round cross-section, so elbows
 * shade like bent pipe, not like stacked boxes. Corners round off with radius `bend`. */
export function tube(g: Px, pts: [number, number][], r: number, ramp: Ramp, o: { amb?: number; gloss?: number; bend?: number } = {}) {
  const amb = o.amb ?? 0.1, gloss = o.gloss ?? 0.9, bend = o.bend ?? 4;
  const path: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by), k = Math.min(bend, l1 / 2, l2 / 2);
    const p0: [number, number] = [bx - ((bx - ax) / l1) * k, by - ((by - ay) / l1) * k];
    const p2: [number, number] = [bx + ((cx - bx) / l2) * k, by + ((cy - by) / l2) * k];
    for (let t = 0; t <= 1.001; t += 0.1) { // quadratic bezier through the corner
      const u = 1 - t;
      path.push([u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], u * u * p0[1] + 2 * u * t * by + t * t * p2[1]]);
    }
  }
  path.push(pts[pts.length - 1]);
  const S: [number, number][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
    for (let j = 0; j < n; j++) S.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
  }
  S.push(path[path.length - 1]);
  const xs = S.map((p) => p[0]), ys = S.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys) - r - 1); y <= Math.max(...ys) + r + 1; y++)
    for (let x = Math.floor(Math.min(...xs) - r - 1); x <= Math.max(...xs) + r + 1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, bx = 0, by = 0;
      for (const [sx, sy] of S) { const d = (px - sx) ** 2 + (py - sy) ** 2; if (d < best) { best = d; bx = sx; by = sy; } }
      const d = Math.sqrt(best);
      if (d > r) continue;
      const ox = (px - bx) / r, oy = (py - by) / r, nz = Math.sqrt(Math.max(0, 1 - ox * ox - oy * oy));
      let v = lit(ox, -oy, nz, amb, gloss);
      if (d > r - 1 && ox < -0.3 && oy > 0) v += 0.1; // bounce light on the dark lower-left edge
      tone(g, x, y, ramp, v + (blotch(x, y, 3, 21) - 0.5) * 0.12);
    }
}

/** A shape of revolution standing upright (tank, dome, chimney, band): radius R(y) per row. Shading uses the real
 * normal, tilted up wherever the radius grows downward (a dome's shoulder catches the sky). */
export function lathe(g: Px, cx: number, y0: number, y1: number, R: (y: number) => number, ramp: Ramp,
  o: { amb?: number; gloss?: number; rust?: number; seed?: number; grime?: number } = {}) {
  const amb = o.amb ?? 0.08, gloss = o.gloss ?? 0.6, rust = o.rust ?? 0, seed = o.seed ?? 3, grime = o.grime ?? 0;
  for (let y = y0; y < y1; y++) {
    const r = R(y + 0.5);
    if (r <= 0) continue;
    const slope = (R(y + 1) - R(y)); // radius growth per row down
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const s = (x + 0.5 - cx) / r;
      if (Math.abs(s) > 1) continue;
      const nz = Math.sqrt(1 - s * s);
      let v = lit(s, slope * 1.2, nz, amb, gloss);
      if (s < -0.86) v += 0.1; // bounce at the dark edge
      v += (blotch(x, y, 4, seed) - 0.5) * 0.22 + (noise(x, y, seed) - 0.5) * 0.06;
      if (grime && y >= y1 - grime) v -= 0.14;
      tone(g, x, y, ramp, v);
      if (rust) { // rust gathers in blotches, brown where thin, orange where thick
        const b = blotch(x, y, 3, seed + 7);
        if (b > 1 - rust * 3 && noise(x, y, seed + 9) < 0.6) g.set(x, y, b > 1 - rust ? "copper-0" : noise(x, y, seed + 4) < 0.5 ? "plate-0" : "plate-1");
      }
    }
  }
}

/** Rivets around a band: they ride the curve, bright on the lit side, lost in shadow on the dark side. */
function rivetRow(g: Px, cx: number, y: number, r: number, step = 3.2) {
  for (let a = -1.35; a <= 1.35; a += step / r) {
    const s = Math.sin(a), x = Math.round(cx + s * r - 0.5);
    if (s < -0.85) continue;
    g.set(x, y, s > 0.15 ? "brass-5" : s > -0.4 ? "brass-4" : "brass-2");
    g.set(x, y + 1, s > -0.2 ? "brass-0" : "soot");
    if (noise(x, y, 5) < 0.4) g.set(x, y + 2, "copper-0"); // a rust streak running down from the rivet
  }
}

/** A riveted iron cabinet in 3/4: front, a sheared top face, a lit right side. Vents and a brass frame. */
function cabinet(g: Px, x: number, y: number, w: number, h: number, d: number, seed: number) {
  for (let k = 0; k < d; k++) for (let i = 0; i < w; i++) tone(g, x + i + (d - k), y - d + k, TANK, 0.62 + 0.12 * (i / w) + (blotch(x + i, y + k, 3, seed) - 0.5) * 0.2);
  for (let j = 0; j < d; j++) for (let i = 0; i < h; i++) tone(g, x + w + j, y - j + i, TANK, 0.5 + j * 0.04 - i * 0.004);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let v = 0.34 + 0.1 * (i / w) - 0.1 * (j / h) + (blotch(x + i, y + j, 3, seed) - 0.5) * 0.25;
    if (j >= h - 3) v -= 0.12;
    tone(g, x + i, y + j, TANK, v);
    const b = blotch(x + i, y + j, 3, seed + 5);
    if (b > 0.82 && noise(x + i, y + j, seed) < 0.7) g.set(x + i, y + j, b > 0.9 ? "plate-2" : "plate-1");
  }
  // brass frame: dark on the shadow edges, bright on the lit ones; brass is jewelry so it stays thin
  g.hline(x, y, w, "brass-3"); g.vline(x + w - 1, y, h, "brass-3"); g.vline(x, y + 1, h - 1, "brass-1"); g.hline(x + 1, y + h - 1, w - 1, "brass-1");
  g.hline(x + d, y - d, w, "brass-2"); g.vline(x + w + d - 1, y - d + 1, h - 1, "brass-3"); g.set(x + w + d - 1, y - d, "brass-5"); g.set(x + w - 1, y, "brass-5");
  for (let k = 1; k < d; k++) g.set(x + w - 1 + k, y - k, "brass-4");
  // vent slots
  for (let k = 0; k < 4; k++) { const vy = y + 3 + k * 2; g.hline(x + 3, vy, w - 6, "soot"); g.hline(x + 3, vy + 1, w - 6, "steel-2"); g.set(x + w - 4, vy + 1, "steel-3"); }
  // corner rivets
  for (const [rx, ry] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 3], [x + w - 2, y + h - 3]]) { g.set(rx, ry, "brass-4"); g.set(rx, ry + 1, "brass-0"); }
  // nameplate
  g.rect(x + 3, y + h - 6, w - 6, 2, "brass-1"); g.hline(x + 3, y + h - 6, w - 6, "brass-3"); g.set(x + w - 4, y + h - 6, "brass-5");
}

function tank(g: Px, cx: number, seed: number) {
  const R0 = 15, neck = 6.5, domeTop = 43, domeBot = 53, bodyBot = 75;
  const R = (y: number) => y < domeTop ? 0 : y < domeBot ? neck + (R0 - neck) * Math.sqrt(Math.max(0, 1 - ((domeBot - y) / (domeBot - domeTop + 0.6)) ** 2)) : R0;
  lathe(g, cx, domeTop, bodyBot, R, TANK, { amb: 0.06, gloss: 0.55, rust: 0.04, seed, grime: 4 });
  // inside line on the silhouette (the stations' selective outline), so the two tanks read apart where they meet
  for (let y = domeTop + 2; y < bodyBot; y++) { const r = R(y + 0.5); g.set(Math.floor(cx - r + 0.5), y, "soot"); g.set(Math.ceil(cx + r - 0.5) - 1, y, "iron-0"); }
  // a seam ring under the shoulder, and the vertical plate seams (they bend with the curve, so they bunch at the edges)
  for (const a of [-0.9, -0.2, 0.55]) { const x = Math.round(cx + Math.sin(a) * R0 - 0.5); for (let y = domeBot + 4; y < bodyBot - 3; y++) if (noise(x, y, 2) < 0.92) g.set(x, y, a < 0 ? "soot" : "steel-0"); }
  // brass bands: top of the body, the fire belt, the foot
  for (const [y, h] of [[domeBot, 4], [bodyBot - 4, 4]] as const) {
    lathe(g, cx, y, y + h, () => R0 + 0.7, BRASS, { amb: 0.12, gloss: 1.1, seed: seed + 1 });
    for (let x = Math.floor(cx - R0); x <= cx + R0; x++) if (g.has(x, y + h)) g.set(x, y + h, noise(x, y, 1) < 0.5 ? "soot" : "iron-0"); // shadow under the band
    rivetRow(g, cx, y + 1, R0 + 0.7);
  }
  lathe(g, cx, 60, 61, () => R0 + 0.4, BRASS, { amb: 0.08, gloss: 0.8, seed: seed + 2 });
  // the neck collar where the chimney meets the dome
  lathe(g, cx, domeTop - 1, domeTop + 2, () => neck + 1.5, BRASS, { amb: 0.14, gloss: 1.1 });
  rivetRow(g, cx, domeTop, neck + 1.5, 2.6);
}

function chimney(g: Px, cx: number) {
  const top = 27, bot = 43;
  lathe(g, cx, top + 2, bot, () => 5.5, CU, { amb: 0.12, gloss: 1.2, seed: 9 });
  for (const y of [31, 38]) {
    lathe(g, cx, y, y + 2, () => 6.4, BRASS, { amb: 0.14, gloss: 1.1 });
    for (let x = Math.floor(cx - 5); x <= cx + 5; x++) if (g.has(x, y + 2)) g.set(x, y + 2, "plate-0");
  }
  // the lip, seen a little from above: a brass ring around a dark mouth
  for (let y = top - 2; y <= top + 3; y++) for (let x = Math.floor(cx - 7); x <= cx + 7; x++) {
    const dx = (x + 0.5 - cx) / 6.8, dy = (y + 0.5 - (top + 0.5)) / 2.4;
    if (dx * dx + dy * dy > 1) continue;
    const ix = (x + 0.5 - cx) / 4.8, iy = (y + 0.5 - (top + 0.2)) / 1.4;
    if (ix * ix + iy * iy <= 1) { g.set(x, y, iy > 0.2 ? "iron-0" : "soot"); continue; }
    tone(g, x, y, BRASS, lit(dx, -dy * 0.6 + 0.6, 0.5, 0.15, 1.1));
  }
  lathe(g, cx, top + 2, top + 4, () => 6.8, BRASS, { amb: 0.12, gloss: 1.0 }); // the lip's front edge
}

function firebox(g: Px, cx: number, f: number) {
  const x = Math.round(cx - 6.5), y = 59, w = 13, h = 11;
  // brass frame with a bevel, soot inside, three glowing grate bars
  g.rect(x, y, w, h, "brass-2"); g.hline(x, y, w, "brass-4"); g.vline(x + w - 1, y, h, "brass-3"); g.vline(x, y, h, "brass-1"); g.hline(x, y + h - 1, w, "brass-0");
  g.set(x + w - 1, y, "brass-5");
  g.rect(x + 1, y + 1, w - 2, h - 2, "soot");
  const flick = [0, 0.04, -0.03, 0.02, 0.05, -0.02][f % 6]; // slow, small; nothing flashes
  for (let b = 0; b < 3; b++) {
    const bx = x + 2 + b * 3.5;
    for (let j = 0; j < h - 4; j++) for (let i = 0; i < 2; i++) {
      const v = 0.95 - Math.abs(j - (h - 5) / 2) / (h - 4) * 0.7 - (i === 0 ? 0.1 : 0) + flick - (b === 1 ? 0 : 0.06);
      tone(g, Math.round(bx + i), y + 2 + j, FIRE, v);
    }
  }
  g.hline(x + 1, y + h - 2, w - 2, "sun-1"); // embers on the sill
  // light layer: the fire warms the iron round it (stays on the machine) and spills a little on the deck
  g.glowDisc(cx, y + h / 2, 8.5, "sun-4", 0.25, [x, y, w, h]);
  g.glow(x - 2, y - 1, w + 4, 1, "sun-5", 0.25);
  g.glow(x, y + h, w, 2, "sun-3", 0.5);
  g.glow(x - 4, 78, w + 8, 2, "sun-2", 0.25, true);
}

/** Big soft smoke: puffs born at the mouth, swelling as they rise and drift right, fraying at the edge. */
function plume(g: Px, x: number, y: number, p: number, seed: number) {
  const n = 6;
  const puffs = Array.from({ length: n }, (_, k) => (p + k / n) % 1).sort((a, b) => b - a); // oldest drawn first
  for (const q of puffs) {
    const rise = q * 24, r = 2.6 + q * 6.4;
    const cx = x + q * 9 + Math.sin(q * 7 + seed) * 1.8, cy = y - 1 - rise;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      if (yy < -TOP) continue;
      const dx = (xx + 0.5 - cx) / r, dy = (yy + 0.5 - cy) / r, d = dx * dx + dy * dy;
      // lumpy outline: three lobes, so a puff reads as a cloud and not a disc
      const lump = 0.82 + 0.18 * Math.sin(Math.atan2(dy, dx) * 3 + seed + q * 4);
      if (d > lump) continue;
      if (q > 0.75 && d > lump * 0.7 && ((xx + yy) & 1)) continue; // older puffs fray at the edge
      tone(g, xx, yy, SMOKE, 0.42 + 0.42 * (dx * 0.55 - dy * 0.65) - d * 0.1 + (1 - q) * 0.1);
    }
  }
}

let base: Px | null = null;
function staticPart() {
  if (base) return base;
  const raw = new Px(BOILER_W, BOILER_H), g = shift(raw, 0, TOP);
  g.glow(4, 78, 90, 3, "iron-0", 0.5, true); // contact shadow, falling down-left
  // back layer: the high pipe that links the two chimneys and drops to the cabinets at each end
  tube(g, [[29, 35], [8, 35], [8, 60]], 2.5, CU, { bend: 6 });
  tube(g, [[66, 35], [88, 35], [88, 60]], 2.5, CU, { bend: 6 });
  tube(g, [[29, 35], [67, 35]], 2.5, CU);
  for (const fx of [19, 47, 76]) { // brass couplings along the high pipe
    for (let y = 32; y <= 38; y++) for (let x = fx; x < fx + 3; x++) tone(g, x, y, BRASS, lit(0.2 + (x - fx) * 0.3, -(y - 35) / 3, 0.8, 0.12, 1.0));
    g.set(fx + 2, 32, "brass-5");
  }
  tank(g, 29.5, 13);
  tank(g, 66.5, 31);
  chimney(g, 29.5);
  chimney(g, 66.5);
  // shoulder pipes: each dome to its cabinet, and a hoop between the two domes onto the middle riser
  tube(g, [[19, 49], [13, 49], [13, 60]], 2.2, CU, { bend: 4 });
  tube(g, [[76, 49], [83, 49], [83, 60]], 2.2, CU, { bend: 4 });
  tube(g, [[41, 50], [48, 44.5], [55, 50]], 2.2, CU, { bend: 6 });
  tube(g, [[48, 46], [48, 77]], 2.2, CU, { gloss: 1.1 });
  for (const y of [55, 67]) for (let x = 45; x < 52; x++) for (let j = 0; j < 3; j++) tone(g, x, y + j, BRASS, lit((x - 48) / 3, j === 0 ? 0.5 : -0.2, 0.7, 0.12, 1.0));
  // front: the cabinets
  cabinet(g, 2, 59, 12, 18, 3, 41);
  cabinet(g, 80, 59, 11, 18, 3, 43);
  raw.outline();
  base = raw;
  return raw;
}

const cache = new Map<number, HTMLCanvasElement>();
/** The boiler at time t (seconds): a BOILER_W x BOILER_H canvas in art px, feet on the bottom rows. */
export function boilerFrame(t: number): HTMLCanvasElement {
  const f = Math.floor(t * FPS) % FRAMES;
  let cv = cache.get(f);
  if (cv) return cv;
  const b = staticPart(), raw = new Px(BOILER_W, BOILER_H), g = shift(raw, 0, TOP);
  raw.d.set(b.d);
  raw.glows.push(...b.glows);
  firebox(g, 29.5, f);
  firebox(g, 66.5, (f + 3) % FRAMES);
  plume(g, 29, 26, f / FRAMES, 1);
  plume(g, 66, 26, ((f + 5) % FRAMES) / FRAMES, 4);
  cv = raw.bake();
  cache.set(f, cv);
  return cv;
}

export type { Color };
