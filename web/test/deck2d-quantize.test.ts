import { expect, test } from "bun:test";
import { PALETTE_48 } from "../src/deck2d/contract";
import { createQuantizer } from "../src/deck2d/engine/pixel";

// The original per-frame palette snap from pixel.ts, the reference the fast one must match byte for byte.
const rgb = PALETTE_48.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
function reference(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let best = Infinity, j = 0;
    rgb.forEach(([r, g, b], n) => { const e = (r - d[i]) ** 2 + (g - d[i + 1]) ** 2 + (b - d[i + 2]) ** 2; if (e < best) { best = e; j = n; } });
    [d[i], d[i + 1], d[i + 2]] = rgb[j]; d[i + 3] = 255;
  }
}

test("the palette snap matches the original exactly, frame after frame", () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
  const snap = createQuantizer(PALETTE_48);
  for (let frame = 0; frame < 3; frame++) {
    const d = new Uint8ClampedArray(40_000 * 4);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = rnd(); d[i + 1] = rnd(); d[i + 2] = rnd(); d[i + 3] = [0, 255, 128, 255, 1][i % 5];
      if (i % 16 === 0 && i) d.copyWithin(i, i - 4, i); // runs, like real frames
    }
    rgb.forEach(([r, g, b], k) => d.set([r, g, b, 200], k * 4));
    const want = d.slice();
    reference(want); snap(d);
    expect(Buffer.from(d).equals(Buffer.from(want))).toBe(true);
  }
});
