import { expect, test } from "bun:test";
import { SHIP_CHEER, SHIP_CRATE, SHIP_LINES, SHIP_TIMING, isShipCard, shipFeel } from "../src/deck2d/story/ship";
import { TOUR, createTour } from "../src/deck2d/story/tour";
import { createBus } from "../src/deck2d/contract";

const run = (s: { step?: (dt: number) => void }, sec: number) => { for (let t = 0; t < sec; t += 0.05) s.step?.(0.05); };
const items = (v: ReturnType<ReturnType<typeof shipFeel>["view"]>) => v.stops.flatMap(s => s.items.map(i => ({ stop: s.id, id: i.id })));

/** Click through the tour up to its Gate card. */
function atGate() {
  const bus = createBus(), s = shipFeel(createTour(), bus);
  for (let i = 0; i < 200 && !isShipCard(s.view().card); i++) { const c = s.view().card; if (c) s.approve(c.id); run(s, 1); }
  return { bus, s };
}

test("the tour's Gate card becomes a held Ship it; every other card stays a tap", () => {
  const bus = createBus(), s = shipFeel(createTour(), bus);
  expect(s.view().card?.hold).toBeFalsy();
  const { s: g } = atGate();
  expect(g.view().card).toMatchObject({ id: `tour-0-${TOUR.length - 1}`, yes: "Ship it", hold: true });
});

test("Ship it: lever, the crate rides onto the pad, only then one ship, the rocket climbs, then Shippy's cheer card", () => {
  const { bus, s } = atGate();
  const before = s.view().shipped;
  s.approve(s.view().card!.id);
  expect(s.shipPhase()).toBe("lever");
  expect(s.quiet()).toBe(true);
  expect(s.view()).toMatchObject({ card: null, caption: null, shippy: { pose: "lever", at: "gate" } });
  run(s, SHIP_TIMING.lever + 0.1);
  run(s, 2); // the tour's own clock would have dropped the crate and shipped by now
  let v = s.view();
  expect(items(v)).toEqual([{ stop: "launch", id: SHIP_CRATE }]);
  expect(v.shipped).toBe(before); // no rocket while the crate is still on the bridge
  bus.emit({ type: "crate-arrive", stop: "launch", id: SHIP_CRATE });
  run(s, SHIP_TIMING.settle + 0.1);
  v = s.view();
  expect(s.shipPhase()).toBe("launch");
  expect(v.shipped).toBe(before + 1);
  expect(items(v)).toEqual([]);
  bus.emit({ type: "launch" });
  run(s, SHIP_TIMING.afterLaunch - 0.2);
  expect(s.view()).toMatchObject({ card: null, caption: null }); // the rocket climbs with nothing over it
  run(s, 0.4);
  expect(s.view().card).toMatchObject({ id: `${SHIP_CHEER}-0`, title: SHIP_LINES.cheerTitle, guide: "shippy" });
  s.approve(`${SHIP_CHEER}-0`);
  expect(s.quiet()).toBe(false);
  expect(s.view().card?.id).toBe("story-connect"); // back to the tour: sign in
  expect(s.view().shipped).toBe(before + 1);
});

test("no rocket layer: the beat still finishes on its own", () => {
  const { s } = atGate();
  s.approve(s.view().card!.id);
  run(s, SHIP_TIMING.lever + SHIP_TIMING.ride + SHIP_TIMING.liftoff + SHIP_TIMING.afterLaunch + 0.5);
  expect(s.shipPhase()).toBe("cheer");
});

test("Watch again flies one more rocket; a tour Replay never makes the count go down", () => {
  const { s } = atGate();
  s.approve(s.view().card!.id);
  run(s, 20);
  const n = s.view().shipped;
  s.later(`${SHIP_CHEER}-0`);
  expect(s.view().shipped).toBe(n + 1);
  run(s, 20);
  s.approve(`${SHIP_CHEER}-1`);
  s.later("story-connect"); // Replay
  expect(s.view().card?.id).toMatch(/^tour-/);
  expect(s.view().shipped).toBe(n + 1);
});
