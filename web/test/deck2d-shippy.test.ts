import { expect, test } from "bun:test";
import { STOP_X, type ShippyView } from "../src/deck2d/contract";
import { createShippy } from "../src/deck2d/shippy/shippy";

const noArt = { get: () => null, ready: async () => {} };
function run(s: ReturnType<typeof createShippy>, view: ShippyView, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) s.update(1 / 60, view);
}

test("Shippy unfolds out of the corner, walks to the stop, works it, and folds back home", () => {
  // The screen-corner box is the non-pixel look; pixel mode (now the default) has its own test below.
  const s = createShippy(noArt, { reducedMotion: true, pixel: false });
  run(s, { at: "corner", pose: "folded" }, 0.5);
  expect(s.state).toMatchObject({ corner: "home", world: "off" });

  s.update(1 / 60, { at: "review", pose: "walking" });
  expect(s.state.corner).toBe("unfold");
  run(s, { at: "review", pose: "walking" }, 1.4);
  expect(s.state.corner).toBe("gone");
  expect(s.state.world).toBe("walk");
  run(s, { at: "review", pose: "lever" }, 8);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.review + 150, pose: "lever" });

  run(s, { at: "gate", pose: "alarmed" }, 8);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.gate + 150 });

  run(s, { at: "corner", pose: "folded" }, 3);
  expect(s.state).toMatchObject({ corner: "home", world: "off" });
});

test("a call back to the deck mid-leap drops him straight back down", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: false });
  run(s, { at: "builder", pose: "walking" }, 8);
  expect(s.state.world).toBe("stand");
  s.update(1 / 60, { at: "corner", pose: "folded" });
  run(s, { at: "checks", pose: "lever" }, 8);
  expect(s.state).toMatchObject({ corner: "gone", world: "stand", x: STOP_X.checks + 150 });
});

test("build poses: he carries the beam while he walks, then welds at the stop", () => {
  const s = createShippy(noArt, { reducedMotion: true });
  run(s, { at: "builder", pose: "carry" }, 1.4);
  expect(s.state).toMatchObject({ world: "walk", pose: "carry" });
  run(s, { at: "builder", pose: "weld" }, 8);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.builder + 150, pose: "weld" });
});

test("pixel mode: home is on the deck floor, he never leaves the floor between home and a stop", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: true });
  const home = STOP_X.repo - 150;
  const seen = new Set<string>();
  const go = (view: ShippyView, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) { s.update(1 / 60, view); seen.add(s.state.world); }
  };
  go({ at: "review", pose: "lever" }, 10);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.review + 150 });
  go({ at: "corner", pose: "folded" }, 10);
  expect(s.state).toMatchObject({ corner: "home", world: "off", x: home });
  expect(seen.has("drop") || seen.has("leave")).toBe(false);
});
