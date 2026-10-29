import { expect, test } from "bun:test";
import { PALETTE, STOPS, STOP_X } from "../src/deck2d/contract";
import { beltRun } from "../src/deck2d/engine/pxdraw";
import { advanceBeltDistance, beltConnectionAt } from "../src/deck2d/engine/flow";

function render(t: number, blocked = false, moving = true) {
  const pixels = new Map<string, string>();
  const ctx = {
    fillStyle: "", globalAlpha: 1, save() {}, restore() {},
    fillRect(x: number, y: number, w: number, h: number) {
      for (let j = y; j < y + h; j += 5) for (let i = x; i < x + w; i += 5)
        pixels.set(`${i},${j}`, this.fillStyle);
    },
  };
  beltRun(ctx as unknown as CanvasRenderingContext2D, 0, 50, 300, 50, 300, t, 50, x => blocked && x >= 100 && x < 200, x => moving && !(blocked && x >= 100 && x < 200) ? t : 0);
  return pixels;
}

test("only the blocked area turns red and clearing restores green", () => {
  const blocked = render(0, true), clear = render(0);
  expect(blocked.get("50,25")).toBe(PALETTE.ok[1]);
  expect(blocked.get("150,25")).toBe(PALETTE.jam[1]);
  expect(blocked.get("250,25")).toBe(PALETTE.ok[1]);
  expect(clear.get("150,25")).toBe(PALETTE.ok[1]);
});

test("an empty green conveyor holds still", () => {
  expect(render(0, false, false)).toEqual(render(10, false, false));
  expect(render(0, false, false).get("150,25")).toBe(PALETTE.ok[1]);
});

test("a belt connection does not change ownership halfway between machines", () => {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const from = STOPS[i], to = STOPS[i + 1];
    expect(beltConnectionAt(STOP_X[from] + 1)).toBe(from);
    expect(beltConnectionAt((STOP_X[from] + STOP_X[to]) / 2)).toBe(from);
    expect(beltConnectionAt(STOP_X[to] - 1)).toBe(from);
    expect(beltConnectionAt(STOP_X[to])).toBe(to);
  }
});

test("green arrows travel right on the art grid", () => {
  const a = render(0), b = render(0.1); // one art pixel of travel
  const arrows = (p: Map<string, string>) => [...p].filter(([key, color]) => key.endsWith(",35") && color === PALETTE.ok[2]).map(([key]) => Number(key.split(",")[0]));
  expect(arrows(b)).toEqual(arrows(a).map(x => x + 5).filter(x => x < 300));
});

test("blocked plates and arrows stop while the neighboring belt keeps moving", () => {
  const a = render(0, true), b = render(0.1, true);
  const bay = (pixels: Map<string, string>, left: number, right: number) => [...pixels].filter(([key]) => {
    const x = Number(key.split(",")[0]); return x >= left && x < right;
  });
  expect(bay(b, 100, 200)).toEqual(bay(a, 100, 200));
  expect(bay(b, 0, 100)).not.toEqual(bay(a, 0, 100));
});

test("cargo stops on approach to a blocked bay and resumes when cleared", () => {
  const blocked = (d: number) => d >= 100 && d < 200;
  expect(advanceBeltDistance(90, 250, 40, blocked)).toBe(100);
  expect(advanceBeltDistance(100, 250, 40, blocked)).toBe(100);
  expect(advanceBeltDistance(100, 250, 40, () => false)).toBe(140);
  expect(advanceBeltDistance(220, 250, 40, blocked)).toBe(250);
});
