import { expect, test } from "bun:test";
import { anchoredCenter, pixelZoom, settleCamera } from "../src/deck2d/engine/camera";

test("pixel zoom does not oscillate when a gesture hovers around a rounding threshold", () => {
  let level = 3;
  for (const value of [3.48, 3.52, 3.49, 3.55, 3.51]) { level = pixelZoom(value, level); expect(level).toBe(3); }
  level = pixelZoom(3.65, level); expect(level).toBe(4);
  for (const value of [3.55, 3.49, 3.52, 3.45]) { level = pixelZoom(value, level); expect(level).toBe(4); }
  expect(pixelZoom(3.35, level)).toBe(3);
});

test("zoom keeps the pointer's world point within half an art pixel at odd viewport sizes", () => {
  for (const size of [779, 1280, 1441]) for (const zoom of [1, 2, 3, 7]) {
    const point = size * 0.37, world = 1432;
    const center = anchoredCenter(world, point, size, zoom, 5);
    const origin = Math.round(center / 5 - Math.ceil(size / zoom) / 2);
    const actual = (point / zoom + origin) * 5;
    expect(Math.abs(actual - world)).toBeLessThanOrEqual(2.5);
  }
});

test("automatic camera approach is monotonic and settles instead of drifting forever", () => {
  for (const fps of [30, 60, 144]) {
    let x = 0;
    for (let i = 0; i < fps * 3; i++) {
      const next = settleCamera(x, 1000, 1 / fps, 1.25);
      expect(next).toBeGreaterThanOrEqual(x); expect(next).toBeLessThanOrEqual(1000); x = next;
    }
    expect(x).toBe(1000);
  }
});
