import type { Color } from "./palette";
import type { Px } from "./px";

// Shading with real volume. Every shape gets a tone 0..1 per pixel from a light that sits up and to the right,
// in front of the machine; the tone picks a step of the material's ramp, with a 2x2 checker dither where it falls
// between two steps. Round things get banded shading across the curve, a hot glint and a bounce px at the dark edge.

export type Ramp = readonly Color[];
export const IRON: Ramp = ["soot", "iron-0", "iron-1", "iron-2", "iron-3", "iron-4"];
// Ramps are tuned to Justin's painted art snapped to the 48: mostly the dark and middle steps, the top step only
// for glints. (His builder snapped: soot, plate-0, iron-0, brass-0/1, iron-1/2, brass-2, plate-2; brass-4 is ~0.1%.)
export const BRASS: Ramp = ["soot", "plate-0", "brass-0", "brass-1", "brass-2", "brass-3", "brass-4", "brass-5"];
export const COPPER: Ramp = ["soot", "brass-0", "sun-0", "copper-0", "copper-1", "copper-2", "sun-4", "sun-6"];
export const STEEL: Ramp = ["iron-0", "steel-1", "steel-2", "steel-3", "haze-2", "haze-3"];
/** Light machined steel (gears): reads grey next to the brass. */
export const GEAR: Ramp = ["soot", "iron-1", "iron-3", "iron-4", "haze-2", "haze-3"];
export const SMOKE: Ramp = ["iron-2", "iron-3", "steel-3", "haze-2", "haze-3"];

/** Light direction (x right, y up, z toward the viewer), normalised. */
const L = (() => { const v = [0.62, 0.48, 0.62]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

/** Deterministic per-pixel noise in 0..1 (wear, grime, rust); same pixels every frame, so nothing shimmers. */
export const noise = (x: number, y: number, seed = 0) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Smooth value noise at a given cell size: blotches of rust and wear instead of single-pixel speckle. */
export const blotch = (x: number, y: number, cell: number, seed = 0) => {
  const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = noise(x0, y0, seed), b = noise(x0 + 1, y0, seed), c = noise(x0, y0 + 1, seed), d = noise(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

/** Pick a ramp step for tone v (0 dark .. 1 light), dithering the in-between band in a checker. */
export function tone(g: Px, x: number, y: number, ramp: Ramp, v: number) {
  const f = Math.max(0, Math.min(1, v)) * (ramp.length - 1), lo = Math.floor(f), fr = f - lo;
  const i = fr < 0.44 ? lo : fr > 0.56 ? lo + 1 : lo + ((x + y) & 1); // dither only the narrow middle band
  g.set(x, y, ramp[Math.min(ramp.length - 1, i)]);
}

const lambert = (nx: number, ny: number, nz: number) => Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
const spec = (nx: number, ny: number, nz: number) => {
  // Blinn-ish: half vector between the light and the viewer
  const hx = L[0], hy = L[1], hz = L[2] + 1, hn = Math.hypot(hx, hy, hz);
  return Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hn), 24);
};

/** A standing cylinder (tank, chimney, pipe riser): banded across its width. */
export function cylV(g: Px, x: number, y: number, w: number, h: number, ramp: Ramp, opts: { amb?: number; gloss?: number } = {}) {
  const amb = opts.amb ?? 0.12, gloss = opts.gloss ?? 0.5;
  for (let i = 0; i < w; i++) {
    const th = ((i + 0.5) / w * 2 - 1) * (Math.PI / 2) * 0.92, nx = Math.sin(th), nz = Math.cos(th);
    let v = amb + 0.52 * lambert(nx, 0, nz) + gloss * 0.9 * spec(nx, 0, nz);
    if (i === 0 && w > 3) v += 0.12; // bounce light at the very dark edge
    for (let j = 0; j < h; j++) tone(g, x + i, y + j, ramp, v);
  }
}

/** A lying cylinder (pipe run, flange): banded across its height, lit along its top. */
export function cylH(g: Px, x: number, y: number, w: number, h: number, ramp: Ramp, opts: { amb?: number; gloss?: number } = {}) {
  const amb = opts.amb ?? 0.12, gloss = opts.gloss ?? 0.5;
  for (let j = 0; j < h; j++) {
    const th = ((j + 0.5) / h * 2 - 1) * (Math.PI / 2) * 0.92, ny = -Math.sin(th), nz = Math.cos(th);
    let v = amb + 0.52 * lambert(0.25, ny, nz) + gloss * 0.9 * spec(0.2, ny, nz);
    if (j === h - 1 && h > 3) v += 0.1;
    for (let i = 0; i < w; i++) tone(g, x + i, y + j, ramp, v + (i === w - 1 ? 0.08 : 0));
  }
}

/** A sphere or dome: ball knobs, lamp bulbs, bolt heads. */
export function ball(g: Px, cx: number, cy: number, r: number, ramp: Ramp, opts: { amb?: number; gloss?: number } = {}) {
  const amb = opts.amb ?? 0.1, gloss = opts.gloss ?? 0.9;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    tone(g, x, y, ramp, amb + 0.8 * lambert(dx, -dy, nz) + gloss * spec(dx, -dy, nz));
  }
}

/** A ring seen face-on (bezels, flanges): a raised round band, lit on its upper-right arc. */
export function bezel(g: Px, cx: number, cy: number, r0: number, r1: number, ramp: Ramp) {
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r1 || d < r0) continue;
    const t = ((d - r0) / Math.max(0.5, r1 - r0)) * 2 - 1; // -1 inner edge .. 1 outer edge
    const ux = dx / (d || 1), uy = dy / (d || 1), nz = Math.sqrt(Math.max(0, 1 - t * t * 0.8));
    tone(g, x, y, ramp, 0.06 + 0.46 * lambert(ux * t, -uy * t, nz) + 0.35 * spec(ux * t, -uy * t, nz));
  }
}

/** A flat iron (or any) face: base tone that lifts toward the lit top-right, with wear speckle and grime low down.
 * rust adds warm mottling the way the painted mockups have it. */
export function face(g: Px, x: number, y: number, w: number, h: number, ramp: Ramp, base: number, opts: { rust?: number; grime?: number; seed?: number } = {}) {
  const rust = opts.rust ?? 0, grime = opts.grime ?? 2, seed = opts.seed ?? 1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = i / Math.max(1, w - 1), v0 = j / Math.max(1, h - 1);
    const wear = blotch(x + i, y + j, 4, seed) - 0.5;
    let v = base + 0.1 * u - 0.08 * v0 + wear * 0.3 + (noise(x + i, y + j, seed) - 0.5) * 0.05;
    if (j >= h - grime) v -= 0.12;
    tone(g, x + i, y + j, ramp, v);
    // rust gathers in blotches, brown where it's thin, orange where it's thick
    const r = blotch(x + i, y + j, 3, seed + 7);
    if (rust && r > 1 - rust * 3 && noise(x + i, y + j, seed + 9) < 0.7) g.set(x + i, y + j, r > 1 - rust ? "plate-2" : noise(x + i, y + j, seed + 4) < 0.5 ? "plate-0" : "plate-1");
  }
}

/** A raised brass strap/band: bevelled (light top + left edge inside, dark bottom + right), with rivets. */
export function strap(g: Px, x: number, y: number, w: number, h: number, ramp: Ramp = BRASS, rivetEvery = 0, shadow = true) {
  if (shadow) drop(g, x, y, w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let v = 0.4 + 0.08 * (i / Math.max(1, w - 1)) + (blotch(x + i, y + j, 3, 3) - 0.5) * 0.16;
    if (j === 0) v += 0.2; else if (j === h - 1) v -= 0.3;
    if (i === 0 && h > 2) v += 0.1; else if (i === w - 1 && w > 2 && h > 2) v -= 0.16;
    tone(g, x + i, y + j, ramp, v);
  }
  if (rivetEvery) {
    const horiz = w >= h;
    const n = horiz ? w : h;
    for (let k = Math.floor(rivetEvery / 2); k < n; k += rivetEvery) horiz ? rivet(g, x + k, y + Math.floor((h - 1) / 2)) : rivet(g, x + Math.floor((w - 1) / 2), y + k);
  }
}

/** Cast shadow of a raised part onto whatever is already drawn: 1px down and to the left (light is upper right). */
export function drop(g: Px, x: number, y: number, w: number, h: number, c: Color = "iron-0") {
  for (let i = -1; i < w - 1; i++) if (g.has(x + i, y + h)) g.set(x + i, y + h, c);
  for (let j = 1; j <= h; j++) if (g.has(x - 1, y + j)) g.set(x - 1, y + j, c);
}

/** A rivet: one light px over one dark px. */
export function rivet(g: Px, x: number, y: number, light: Color = "brass-3", dark: Color = "brass-0") {
  g.set(x, y, light); g.set(x, y + 1, dark);
}

/** Smoke: a few soft puffs drifting up and to the right from (x, y). p is the loop phase 0..1; heavy = jam smoke. */
export function smoke(g: Px, x: number, y: number, p: number, heavy = false) {
  const n = heavy ? 4 : 2;
  for (let k = 0; k < n; k++) {
    const q = (p + k / n) % 1, rise = q * (heavy ? 13 : 10);
    if (q > 0.92) continue;
    const r = (heavy ? 1.8 : 1.1) + q * (heavy ? 2.6 : 1.6);
    const cx = x + q * 6 + Math.sin(q * 6 + k) * 1.2, cy = y - rise;
    const fade = q > 0.65 ? 1 : 0; // older puffs lose their dark side
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = (xx + 0.5 - cx) / r, dy = (yy + 0.5 - cy) / r, d = dx * dx + dy * dy;
      if (d > 1) continue;
      const v = 0.45 + 0.45 * (dx * 0.6 - dy * 0.6) + fade * 0.25 - (heavy ? 0.1 : 0);
      if (!heavy && q > 0.5 && ((xx + yy) & 1)) continue; // thin wisp breaks up as it rises
      tone(g, xx, yy, SMOKE, v);
    }
  }
}
