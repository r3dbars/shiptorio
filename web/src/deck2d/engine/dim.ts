// The pixel-art dim for background pictures (engine.ts dimArt): every pixel snaps to its nearest palette color, then
// steps darker on that color's own ramp. Pure and allocation-free per pixel, because the sky alone is ~1.6M pixels
// and ~100k distinct colors, and this ran on the first frame.
import { PALETTE } from "../contract";

export const DIM = 1;

const SUN = Object.keys(PALETTE).indexOf("sun");
const ramps = Object.values(PALETTE).map((r) => r.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))));
// Flat palette in search order (ramp by ramp, light to dark), each with the packed rgb it dims to.
const N = ramps.reduce((n, r) => n + r.length, 0);
const PR = new Int32Array(N), PG = new Int32Array(N), PB = new Int32Array(N), TO = new Int32Array(N);
{
  let k = 0;
  ramps.forEach((ramp, a) => ramp.forEach(([r, g, b], n) => {
    const [tr, tg, tb] = ramp[Math.max(0, n - DIM - (a === SUN ? 1 : 0))];
    PR[k] = r; PG[k] = g; PB[k] = b; TO[k++] = (tr << 16) | (tg << 8) | tb;
  }));
}

/** Packed rgb of the dimmed palette color for one pixel. First nearest match wins, as before. */
export function dimColor(r: number, g: number, b: number): number {
  let best = Infinity, bi = 0;
  for (let k = 0; k < N; k++) {
    const dr = PR[k] - r, dg = PG[k] - g, db = PB[k] - b, e = dr * dr + dg * dg + db * db;
    if (e < best) { best = e; bi = k; }
  }
  return TO[bi];
}

/** Dims RGBA pixels in place. Fully transparent pixels are left alone. */
export function dimPixels(d: Uint8ClampedArray, cache = new Map<number, number>()): void {
  let lastKey = -1, last = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    if (key !== lastKey) {
      let c = cache.get(key);
      if (c === undefined) { c = dimColor(d[i], d[i + 1], d[i + 2]); cache.set(key, c); }
      lastKey = key; last = c;
    }
    d[i] = last >> 16; d[i + 1] = (last >> 8) & 255; d[i + 2] = last & 255;
  }
}
