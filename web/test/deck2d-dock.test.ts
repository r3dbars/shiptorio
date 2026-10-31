import { expect, test } from "bun:test";
import { createShippy } from "../src/deck2d/shippy/shippy";
import { DOCK_HOME_X, drawChargingDock } from "../src/deck2d/shippy/dock";
import { PALETTE_48, STOP_X } from "../src/deck2d/contract";

test("Shippy walks back to the charging dock and fills his battery only after arriving", () => {
  const s = createShippy({ get: () => null, ready: async () => {} }, { pixel: true, reducedMotion: true });
  const run = (at: "corner" | "builder", seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) s.update(1 / 60, { at, pose: at === "corner" ? "folded" : "weld" });
  };
  run("corner", 8); expect(s.state.docked).toBe(true); expect(s.state.battery).toBe(1);
  run("builder", 6); expect(s.state.docked).toBe(false);
  const spent = s.state.battery;
  run("corner", 1); expect(s.state.docked).toBe(false); expect(s.state.battery).toBeLessThan(spent);
  run("corner", 15); expect(s.state.docked).toBe(true); expect(s.state.battery).toBe(1);
});

test("the dock sits clear of the line and rests quietly once charged", () => {
  expect(DOCK_HOME_X + 75).toBeLessThan(STOP_X.repo - 200);
  const draw = (t: number) => {
    const marks: { color: string; box: number[] }[] = [];
    const ctx = { fillStyle: "", fillRect(...box: number[]) { marks.push({ color: this.fillStyle, box }); } };
    drawChargingDock(ctx as unknown as CanvasRenderingContext2D, DOCK_HOME_X, 360, 1, true, t, false);
    return marks;
  };
  expect(draw(1)).toEqual(draw(8));
  for (const mark of draw(1)) {
    expect(PALETTE_48).toContain(mark.color);
    expect(mark.box.every(n => Number.isInteger(n / 5))).toBe(true);
  }
});

test("Shippy extends his legs before leaving and retracts them only after returning", () => {
  const s = createShippy({ get: () => null, ready: async () => {} }, { pixel: true, reducedMotion: true });
  expect(s.state.dockPhase).toBe("compact");
  s.update(0.1, { at: "builder", pose: "weld" });
  expect(s.state.dockPhase).toBe("waking");
  expect(s.state.x).toBe(DOCK_HOME_X);
  for (let i = 0; i < 5; i++) s.update(0.1, { at: "builder", pose: "weld" });
  expect(s.state.x).toBe(DOCK_HOME_X);
  for (let i = 0; i < 80; i++) s.update(0.1, { at: "builder", pose: "weld" });
  expect(s.state.dockPhase).toBe("awake");
  let foldedAfterArrival = false;
  for (let i = 0; i < 100; i++) {
    s.update(0.1, { at: "corner", pose: "idle" });
    if (s.state.dockPhase === "folding") { foldedAfterArrival = true; expect(s.state.x).toBe(DOCK_HOME_X); }
  }
  expect(foldedAfterArrival).toBe(true);
  expect(s.state).toMatchObject({ x: DOCK_HOME_X, dockPhase: "compact", docked: true });
});

test("cancelling a wake-up folds back down without sliding away from the dock", () => {
  const s = createShippy({ get: () => null, ready: async () => {} }, { pixel: true });
  s.update(0.1, { at: "builder", pose: "weld" });
  s.update(0.1, { at: "builder", pose: "weld" });
  for (let i = 0; i < 10; i++) s.update(0.1, { at: "corner", pose: "idle" });
  expect(s.state).toMatchObject({ x: DOCK_HOME_X, dockPhase: "compact", docked: true });
});
