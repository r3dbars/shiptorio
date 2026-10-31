import { expect, test } from "bun:test";
import { FLIGHT, FLIGHT_SECONDS, flightPose } from "../src/deck2d/launch/flight";

test("launch holds for ignition, climbs, coasts and decelerates to the pad", () => {
  expect(flightPose(0)).toMatchObject({ stage: "ignition", y: 0 });
  expect(flightPose(FLIGHT.ignition + 1)).toMatchObject({ stage: "ascent" });
  const entry = FLIGHT.ignition + FLIGHT.ascent + FLIGHT.coast;
  const early = flightPose(entry + FLIGHT.landing * 0.2), middle = flightPose(entry + FLIGHT.landing * 0.5), late = flightPose(entry + FLIGHT.landing * 0.8);
  expect(middle.y - early.y).toBeGreaterThan(late.y - middle.y);
  expect(late.legs).toBeGreaterThan(0);
  expect(flightPose(FLIGHT_SECONDS)).toMatchObject({ stage: "ready", y: 0, x: 0, lean: 0, legs: 1 });
});

test("the ascent, coast and descent meet without teleporting", () => {
  expect(FLIGHT.ascent).toBeGreaterThanOrEqual(3); // snappy (feel test 2026-10-30), still long enough to read
  expect(FLIGHT.landing).toBeGreaterThanOrEqual(8);
  for (const boundary of [FLIGHT.ignition + FLIGHT.ascent, FLIGHT.ignition + FLIGHT.ascent + FLIGHT.coast]) {
    const before = flightPose(boundary - 0.001), after = flightPose(boundary + 0.001);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  }
});

test("every flight pose stays finite and the rocket never sinks through the pad", () => {
  for (let t = 0; t <= FLIGHT_SECONDS + 1; t += 0.02) {
    const f = flightPose(t);
    expect(Number.isFinite(f.y) && Number.isFinite(f.x)).toBe(true);
    expect(f.y).toBeLessThanOrEqual(0);
  }
});
