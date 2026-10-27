import { expect, test } from "bun:test";

import { calmSounds, freshCalm, ROUTINE_GAP_MS, SAME_GAP_MS } from "../src/sound/calm";

test("big moments always play, routine sounds thin to one per beat", () => {
  const mem = freshCalm();
  expect(calmSounds(["ore", "machine_start", "launch", "stamp_pass", "ci_buzz"], 0, mem)).toEqual(["ore", "launch", "ci_buzz"]);
  // too soon for any routine sound, the catch still plays
  expect(calmSounds(["stamp_pass", "verify_caught"], ROUTINE_GAP_MS - 1, mem)).toEqual(["verify_caught"]);
  // a different routine sound once the gap is up, but not the same one again yet
  expect(calmSounds(["ore", "stamp_pass"], ROUTINE_GAP_MS, mem)).toEqual(["stamp_pass"]);
  expect(calmSounds(["ore"], SAME_GAP_MS, mem)).toEqual(["ore"]);
});
