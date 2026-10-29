import { expect, test } from "bun:test";
import { createShippyRehearsal } from "../src/deck2d/shippy/rehearsal";
import { createShippy } from "../src/deck2d/shippy/shippy";
import { STOP_X } from "../src/deck2d/contract";
import { createBuild } from "../src/deck2d/build/build";

test("Shippy arrives before construction starts, then works and walks home", () => {
  const source = createShippyRehearsal();
  const shippy = createShippy({ get: () => null, ready: async () => {} }, { pixel: true, reducedMotion: true });
  let built = false;
  const poses = new Set<string>();
  for (let i = 0; i < 34 * 60; i++) {
    source.step!(1 / 60);
    const view = source.view(); shippy.update(1 / 60, view.shippy); poses.add(view.shippy.pose);
    const builder = view.stops.find(s => s.id === "builder")!;
    if (builder.built && !built) expect(Math.abs(shippy.state.x - (STOP_X.builder + 150))).toBeLessThan(1);
    built = builder.built;
  }
  for (const pose of ["carry", "weld", "inspect", "poke", "lever", "happy"]) expect(poses.has(pose)).toBe(true);
  expect(Math.abs(shippy.state.x - (STOP_X.repo - 150))).toBeLessThan(1);
});

test("the rehearsal can pause, skip jobs, and replay", () => {
  const source = createShippyRehearsal();
  source.paused = true; source.step!(20);
  expect(source.view().shippy.at).toBe("corner");
  source.next(); expect(source.view().shippy.pose).toBe("carry");
  source.reset(); expect(source.view().shippy.at).toBe("corner");
});

test("replay cancels an in-progress construction before sending Shippy home", () => {
  const source = createShippyRehearsal();
  const build = createBuild({ get: () => null, ready: async () => {} }, null, { reduced: true });
  build.update(0, source.view());
  source.next(); source.next();
  build.update(0.1, source.view());
  expect(build.progress("builder")).not.toBeNull();
  source.reset(); build.update(0, source.view());
  expect(build.progress("builder")).toBeNull();
  expect(build.shippyAct()).toBeNull();
});
