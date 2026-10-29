import { expect, test } from "bun:test";
import { PALETTE, PALETTE_48 } from "../src/deck2d/contract";
import { machineSignal, silhouetteOutline, statusLamp } from "../src/deck2d/stations/status";
import { STATIONS } from "../src/deck2d/stations";
import { Px } from "../src/deck2d/stations/px";

test("one meaning per color: yellow waits on you, red is stuck, green is automatic, cyan runs, idle unlit", () => {
  expect(machineSignal("working")).toBe(PALETTE.energy);
  expect(machineSignal("auto")).toBe(PALETTE.ok);
  expect(machineSignal("jammed")).toBe(PALETTE.jam);
  expect(machineSignal("idle")).toBe(PALETTE.steel);
  expect(machineSignal("idle", true)).toBe(PALETTE.brass);
  expect(machineSignal("jammed", true)).toBe(PALETTE.jam); // faults always win
});

test("status lamps remain palette-only and aligned to the art grid", () => {
  const paints: { color: string; box: number[] }[] = [];
  const ctx = { fillStyle: "", globalAlpha: 1, save() {}, restore() {},
    fillRect(...box: number[]) { paints.push({ color: this.fillStyle, box }); },
  } as unknown as CanvasRenderingContext2D;
  for (const state of ["idle", "working", "jammed", "auto"] as const) statusLamp(ctx, state, 100, 200, 5);
  for (const p of paints) {
    expect(PALETTE_48).toContain(p.color);
    expect(p.box.every(n => Number.isInteger(n / 5))).toBe(true);
  }
  expect(paints.some(p => p.color === PALETTE.ok[2])).toBe(true);
  expect(paints.some(p => p.color === PALETTE.energy[2])).toBe(true);
  expect(paints.some(p => p.color === PALETTE.jam[2])).toBe(true);
});

test("the red contour follows outer pixel steps without filling the machine or internal holes", () => {
  const ring = silhouetteOutline(7, 7, (x, y) => x >= 1 && x <= 5 && y >= 1 && y <= 5 && !(x >= 2 && x <= 4 && y >= 2 && y <= 4));
  const at = (x: number, y: number) => ring.pixels[(y + ring.pad) * ring.width + x + ring.pad];
  expect(at(0, 3)).toBe(1); expect(at(-1, 3)).toBe(2);
  expect(at(1, 3)).toBe(0); // solid body
  expect(at(3, 3)).toBe(0); // enclosed hole
  expect(at(-2, 3)).toBe(0); // outside the two-pixel contour
});

test("each of the six machines supplies its own distinct structural contour", () => {
  const shapes = new Set<string>();
  for (const def of Object.values(STATIONS)) {
    const raw = new Px(def.w, def.h); def.draw(raw, "idle", 0);
    const ring = silhouetteOutline(def.w, def.h, (x, y) => raw.d[y * def.w + x] !== 255);
    expect(ring.pixels.some(p => p === 1)).toBe(true);
    shapes.add(`${ring.width}:${ring.height}:${Array.from(ring.pixels).join("")}`);
  }
  expect(shapes.size).toBe(6);
});
