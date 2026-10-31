import { expect, test } from "bun:test";
import { anchoredCenter, frameShot, pixelZoom, settleCamera, wholeScale } from "../src/deck2d/engine/camera";

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

test("story shots land on a whole-number zoom with the subject above the card", () => {
  for (const v of [{ w: 1440, h: 900, dpr: 2 }, { w: 390, h: 844, dpr: 3 }, { w: 1280, h: 720, dpr: 1 }]) {
    const scr = { ...v, artPx: 5, pixel: true };
    const f = frameShot({ x: 190, y: 270, width: 560 }, scr);
    const k = f.s * 5 * v.dpr;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
    expect(k).toBeGreaterThanOrEqual(1);
    expect(f.x).toBe(190);
    // the subject sits above the middle, where the bottom card can't cover it
    expect(f.y).toBeGreaterThan(270);
    expect(270 - (f.y - v.h / f.s / 2)).toBeLessThan(v.h / f.s / 2);
  }
});

test("pulling back to the whole line never zooms past the fit", () => {
  const scr = { w: 1440, h: 900, dpr: 2, artPx: 5, pixel: true };
  for (const s of [0.31, 0.37, 0.39, 0.5]) {
    const out = wholeScale(s, scr, true);
    expect(out).toBeLessThanOrEqual(s + 1e-9);
    expect(Number.isInteger(Math.round(out * 10 * 1e6) / 1e6)).toBe(true);
  }
  expect(wholeScale(0.05, scr, true)).toBe(1 / 10); // never below one device px per art px
});

test("a station shot on a short screen moves above the story card, and a screen where it already clears is untouched", () => {
  const station = { x: 1000, y: 400, width: 900, tall: 220 };
  for (const v of [{ w: 844, h: 390, dpr: 3 }, { w: 640, h: 360, dpr: 1 }]) {
    const scr = { ...v, artPx: 5, pixel: true }, cardTop = v.h * 0.45;
    const f = frameShot(station, scr, cardTop);
    const k = f.s * 5 * v.dpr;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
    // the station's bottom edge is on screen above the card
    const bottom = v.h / 2 + (station.y + station.tall / 2 - f.y) * f.s;
    expect(bottom).toBeLessThanOrEqual(cardTop);
    expect(v.h / 2 + (station.y - station.tall / 2 - f.y) * f.s).toBeGreaterThanOrEqual(0);
  }
  // a tall desktop window: the card sits low, so the shot is exactly what it was without a card
  const desk = { w: 1280, h: 720, dpr: 1, artPx: 5, pixel: true };
  expect(frameShot(station, desk, 470)).toEqual(frameShot(station, desk));
  expect(frameShot(station, desk, null)).toEqual(frameShot(station, desk));
});
