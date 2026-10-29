import { expect, test } from "bun:test";
import { PALETTE } from "../src/deck2d/contract";
import { beltRun } from "../src/deck2d/engine/pxdraw";

function render(t: number, blocked = false) {
  const pixels = new Map<string, string>();
  const ctx = {
    fillStyle: "", globalAlpha: 1, save() {}, restore() {},
    fillRect(x: number, y: number, w: number, h: number) {
      for (let j = y; j < y + h; j += 5) for (let i = x; i < x + w; i += 5)
        pixels.set(`${i},${j}`, this.fillStyle);
    },
  };
  beltRun(ctx as unknown as CanvasRenderingContext2D, 0, 50, 300, 50, 300, t, 50, x => blocked && x >= 100 && x < 200);
  return pixels;
}

test("only the blocked area turns red and clearing restores green", () => {
  const blocked = render(0, true), clear = render(0);
  expect(blocked.get("50,25")).toBe(PALETTE.ok[1]);
  expect(blocked.get("150,25")).toBe(PALETTE.jam[1]);
  expect(blocked.get("250,25")).toBe(PALETTE.ok[1]);
  expect(clear.get("150,25")).toBe(PALETTE.ok[1]);
});

test("green arrows travel right on the art grid", () => {
  const a = render(0), b = render(0.1); // one art pixel of travel
  const arrows = (p: Map<string, string>) => [...p].filter(([key, color]) => key.endsWith(",35") && color === PALETTE.ok[2]).map(([key]) => Number(key.split(",")[0]));
  expect(arrows(b)).toEqual(arrows(a).map(x => x + 5).filter(x => x < 300));
});
