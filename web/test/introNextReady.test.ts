import { expect, test } from "bun:test";
import { introNextReady } from "../src/ui/IntroTour";

const state = (states: string[]) => ({ districts: [], items: states.map((s, i) => ({ id: `i${i}`, state: s })) }) as never;

test("beat 2 stays ready once the intro's items have all reached the pad", () => {
  expect(introNextReady(state(["working"]), 1, false)).toBe(true);
  expect(introNextReady(state(["on_pad", "on_pad", "launched"]), 1, false)).toBe(true);
  expect(introNextReady(state(["queued"]), 1, false)).toBe(false);
});
