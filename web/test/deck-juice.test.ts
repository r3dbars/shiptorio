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
  expect(played).toEqual(["ore", "launch", "launch_iron", "permit_grant", "level_up"]);
});

test("routine sounds are a sparse texture", () => {
  const { d, played, at } = deck();
  for (let ms = 0; ms < 10_000; ms += 500) {
    at(ms);
    d.fire({ type: "crate-arrive", stop: "builder", id: "x" });
    d.fire({ type: "shippy", pose: "walking" });
  }
  // ten seconds of a busy belt: a handful of sounds, not forty
  expect(played.length).toBeLessThanOrEqual(4);
  expect(played.length).toBeGreaterThan(0);
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

test("every event maps to something real or is deliberately silent", () => {
  const all: DeckEvent[] = [
    ...(["idle", "working", "jammed", "auto"] as const).map((state) => ({ type: "station-state", stop: "checks", state }) as const),
    { type: "station-built", stop: "checks" }, { type: "crate-arrive", stop: "checks", id: "x" }, { type: "approve", cardId: "c" },
    { type: "later", cardId: "c" }, { type: "jam", stop: "review" }, { type: "launch" }, { type: "automated", stop: "review" },
    ...(["folded", "peek", "unfold", "walking", "lever", "happy", "alarmed"] as const).map((pose) => ({ type: "shippy", pose }) as const),
  ];
  const silent = all.filter((e) => cuesFor(e).length === 0).map((e) => ("state" in e ? e.state : "pose" in e ? e.pose : e.type));
  expect(silent).toEqual(["idle", "jammed", "auto", "peek"]);
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

test("a staged build uses the quiet construction kit and doesn't ring twice", () => {
  const played: string[] = [];
  const d = new DeckSound((s) => played.push(s), () => 0, (c) => played.push(`build:${c}`));
  d.fire({ type: "build-start", stop: "checks" });
  for (const stage of ["plot", "scaffold", "frame", "burst", "check"] as const) d.fire({ type: "build-stage", stop: "checks", stage });
  d.fire({ type: "station-built", stop: "checks" });
  expect(played).toEqual(["place", "build:chalk", "build:ratchet", "build:rivet", "build:crackle", "build:thunk", "build:bell"]);
  // a station that just appears (no stages) still lands with a drop
  d.fire({ type: "station-built", stop: "review" });
  expect(played.at(-1)).toBe("station_drop");
});

test("the deck growing and the launch island have sounds", () => {
  for (const phase of ["beams", "plates", "rails", "glow", "rocks", "done"] as const) expect(cuesFor({ type: "deck-grow", size: "medium", phase }).length).toBeGreaterThan(0);
  for (const stage of ["island-rising", "island-up", "bridge", "bridge-done", "tower", "rocket-lowering", "rocket-seated"] as const)
    expect(cuesFor({ type: "launch-stage", stage }).length).toBeGreaterThan(0);
});
