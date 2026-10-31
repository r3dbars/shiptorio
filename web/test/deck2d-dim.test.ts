import { expect, test } from "bun:test";
import { PALETTE } from "../src/deck2d/contract";
import { DIM, dimPixels } from "../src/deck2d/engine/dim";

// The original per-pixel dim from engine.ts, kept here as the reference the fast one must match byte for byte.
const SUN = Object.keys(PALETTE).indexOf("sun"), ramps = Object.values(PALETTE).map((r) => r.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))));
function stepDown(r: number, g: number, b: number) {
  let best = Infinity, ri = 0, ci = 0;
  ramps.forEach((ramp, a) => ramp.forEach(([pr, pg, pb], n) => {
    const e = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (e < best) { best = e; ri = a; ci = n; }
  }));
  return ramps[ri][Math.max(0, ci - DIM - (ri === SUN ? 1 : 0))];
}

test("dimPixels matches the original palette dim exactly", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
  const px = 50_000, d = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = rnd(); d[i + 1] = rnd(); d[i + 2] = rnd(); d[i + 3] = i % 40 ? 255 : 0;
    if (i % 12 === 0 && i) d.copyWithin(i, i - 4, i - 1); // runs of the same color, like real art
  }
  // palette colors themselves sit exactly between ties
  ramps.flat().forEach(([r, g, b], k) => d.set([r, g, b, 255], k * 4));
  const want = d.slice();
  for (let i = 0; i < want.length; i += 4) if (want[i + 3]) [want[i], want[i + 1], want[i + 2]] = stepDown(want[i], want[i + 1], want[i + 2]);
  dimPixels(d);
  expect(Buffer.from(d).equals(Buffer.from(want))).toBe(true);
});
