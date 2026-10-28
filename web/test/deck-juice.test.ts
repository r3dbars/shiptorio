import { expect, test } from "bun:test";

import type { DeckEvent } from "../src/deck2d/contract";
import { ALARM_GAP_MS, cuesFor, DeckSound } from "../src/deck2d/juice/sounds";
import { driftX, launchRise, shakeOffset } from "../src/deck2d/juice/fx";

// The deck's sound map (deck2d/juice/sounds.ts): your swipes always play, the big moments always play, and the
// routine texture (crates, walking, machines) goes through the calm floor.

function deck() {
  let now = 0;
  const played: string[] = [];
  const d = new DeckSound((s) => played.push(s), () => now);
  return { d, played, at: (ms: number) => (now = ms) };
}

test("swipes are never thinned", () => {
  const { d, played } = deck();
  for (let i = 0; i < 5; i++) d.fire({ type: "approve", cardId: "c" });
  d.fire({ type: "later", cardId: "c" });
  expect(played).toEqual(["card_go", "card_go", "card_go", "card_go", "card_go", "card_later"]);
});

test("launch and automated always play in full, even in a busy beat", () => {
  const { d, played } = deck();
  d.fire({ type: "crate-arrive", stop: "builder", id: "x" });
  d.fire({ type: "launch" });
  d.fire({ type: "automated", stop: "review" });
  expect(played).toEqual(["launch", "permit_grant"]);
});

test("a running deck is silent: crates, machines, Shippy walking", () => {
  const { d, played, at } = deck();
  for (let ms = 0; ms < 10_000; ms += 500) {
    at(ms);
    d.fire({ type: "crate-arrive", stop: "builder", id: "x" });
    d.fire({ type: "station-state", stop: "builder", state: "working" });
    d.fire({ type: "shippy", pose: "walking" });
  }
  expect(played).toEqual([]);
});

test("a flickering jam buzzes once", () => {
  const { d, played, at } = deck();
  d.fire({ type: "jam", stop: "review" });
  d.fire({ type: "shippy", pose: "alarmed" });
  at(2000);
  d.fire({ type: "jam", stop: "review" });
  expect(played).toEqual(["stamp_fail"]);
  at(ALARM_GAP_MS + 1);
  d.fire({ type: "jam", stop: "review" });
  expect(played).toEqual(["stamp_fail", "stamp_fail"]);
});

test("every beat is one cue at most", () => {
  const all: DeckEvent[] = [
    ...(["idle", "working", "jammed", "auto"] as const).map((state) => ({ type: "station-state", stop: "checks", state }) as const),
    { type: "station-built", stop: "checks" }, { type: "crate-arrive", stop: "checks", id: "x" }, { type: "approve", cardId: "c" },
    { type: "later", cardId: "c" }, { type: "jam", stop: "review" }, { type: "launch" }, { type: "automated", stop: "review" },
    ...(["folded", "peek", "unfold", "walking", "lever", "happy", "alarmed"] as const).map((pose) => ({ type: "shippy", pose }) as const),
  ];
  for (const e of all) expect(cuesFor(e).length).toBeLessThanOrEqual(1);
});

test("shake decays to nothing and drift loops", () => {
  expect(shakeOffset(0.4, 5, 0.4)).toEqual([0, 0]);
  expect(Math.abs(shakeOffset(0.02, 5, 0.4)[0])).toBeLessThanOrEqual(5);
  expect(driftX(0, 6, 800)).toBeCloseTo(0);
  expect(driftX(10, 6, 800)).toBe(-60);
  expect(driftX(200, 6, 800)).toBe(-400);
  expect(driftX(1000, 6, 800)).toBeGreaterThan(-800);
});

test("the rocket rumbles on the pad, then climbs all the way", () => {
  expect(launchRise(0)).toBe(0);
  expect(launchRise(0.2)).toBe(0);
  expect(launchRise(0.6)).toBeGreaterThan(0);
  expect(launchRise(0.6)).toBeLessThan(launchRise(0.9));
  expect(launchRise(1)).toBe(1);
});

test("a staged build rings once, when it's done", () => {
  const played: string[] = [];
  const d = new DeckSound((s) => played.push(s), () => 0, (c) => played.push(`build:${c}`));
  d.fire({ type: "build-start", stop: "checks" });
  for (const stage of ["plot", "scaffold", "frame", "panels", "top", "burst", "check"] as const) d.fire({ type: "build-stage", stop: "checks", stage });
  d.fire({ type: "station-built", stop: "checks" });
  expect(played).toEqual(["build:bell"]);
  // a station that just appears (no stages) still lands with a drop
  d.fire({ type: "station-built", stop: "review" });
  expect(played.at(-1)).toBe("station_drop");
});

test("growing the deck and raising the island ring once per step, not per bolt", () => {
  const grow = (["beams", "plates", "rails", "glow", "rocks", "done"] as const).flatMap((phase) => cuesFor({ type: "deck-grow", size: "medium", phase }));
  expect(grow.length).toBe(1);
  const island = (["island-rising", "island-up", "bridge", "bridge-done", "tower", "rocket-lowering", "rocket-seated"] as const).flatMap((stage) => cuesFor({ type: "launch-stage", stage }));
  expect(island.length).toBe(2);
});

// ---- pixel mode (deck2d/juice/pixel.ts) ----
import { PALETTE_48 } from "../src/deck2d/contract";
import { effectsFor, plateWidth } from "../src/deck2d/juice/pixel";

test("pixel effects only at the focal moments", () => {
  expect(effectsFor({ type: "crate-arrive", stop: "builder", id: "x" })).toEqual([]);
  expect(effectsFor({ type: "jam", stop: "review" })).toEqual([]);
  expect(effectsFor({ type: "station-state", stop: "builder", state: "working" })).toEqual([]);
  expect(effectsFor({ type: "station-built", stop: "checks" }).length).toBeGreaterThan(0);
  expect(effectsFor({ type: "automated", stop: "review" }).length).toBeGreaterThan(0);
  expect(effectsFor({ type: "launch" }).length).toBeGreaterThan(0);
});

test("pixel effects draw whole art px in palette colors, light layer at 25/50/75%, and end", () => {
  const events: DeckEvent[] = [{ type: "station-built", stop: "checks" }, { type: "automated", stop: "review" }, { type: "launch" }];
  for (const e of events)
    for (const fx of effectsFor(e)) {
      expect(fx.frames).toBeLessThanOrEqual(20); // under ~2.5s at 8 fps
      for (let f = 0; f < fx.frames; f++)
        fx.draw((ax, ay, c) => {
          expect(Number.isInteger(ax) && Number.isInteger(ay)).toBe(true);
          expect(PALETTE_48).toContain(c);
        }, f, (a) => expect([0.25, 0.5, 0.75, 1]).toContain(a));
    }
  expect(plateWidth("AUTOMATED")).toBeLessThanOrEqual(44); // fits over a station
});
