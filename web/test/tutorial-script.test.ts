import { expect, test } from "bun:test";
import { STOPS } from "../src/deck2d/contract";
import { TUTORIAL } from "../src/deck2d/story/script";

test("Shippy says hi first, and the rocket comes last", () => {
  expect(TUTORIAL[0].focus).toBe("shippy");
  expect(TUTORIAL.at(-1)!.focus).toBe("rocket");
});

test("every station gets its own card, built in line order, with the engine before Builder", () => {
  const built = TUTORIAL.flatMap(c => c.build ? [c.build] : []);
  expect(built).toEqual(["repo", "planner", "engine", "builder", "checks", "review", "gate", "island"]);
  for (const s of STOPS) expect(TUTORIAL.some(c => c.focus === s)).toBe(true);
});

test("Shippy names the model that powers him", () => {
  expect(TUTORIAL.some(c => c.lines.some(l => l.includes("Meta Muse Spark")))).toBe(true);
});

test("lines stay short: one or two per card, each fits on a phone card", () => {
  for (const c of TUTORIAL) for (const l of c.lines) expect(l.length).toBeLessThanOrEqual(56);
  expect(new Set(TUTORIAL.map(c => c.id)).size).toBe(TUTORIAL.length);
});

test("only the approve card ships code", () => {
  expect(TUTORIAL.filter(c => c.hold).map(c => c.id)).toEqual(["approve"]);
});
