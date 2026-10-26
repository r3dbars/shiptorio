import { expect, test } from "bun:test";
import type { Move } from "@shiptorio/shared";
import { createAnswerTracker } from "../src/ui/CheckIn";
import { progressProfile } from "../src/ui/Progress";
const card = (id: string) => ({ id }) as Move;
test("progression profiles separate simulator and signed-in identities", () => {
  expect(progressProfile("sim", "alice")).toBe("sim");
  expect(progressProfile("live", "ALICE")).toBe("github:alice");
  expect(progressProfile("live", "alice")).not.toBe(progressProfile("live", "bob"));
  expect(progressProfile("live", null)).not.toBe(progressProfile("live", "alice"));
});
test("offline or refused gestures do not earn XP before an authoritative deck removal", () => {
  const answers = createAnswerTracker();
  answers.submit("one");
  expect(answers.acknowledge([card("one"), card("two")])).toEqual([]);
  expect(answers.acknowledge([card("one"), card("two")])).toEqual([]);
  answers.submit("one"); // retry the same card; one eventual credit
  expect(answers.acknowledge([card("two")])).toEqual([1]);
  expect(answers.acknowledge([])).toEqual([]);
});
test("batched accepted gestures earn one last-card bonus, never one bonus per removal", () => {
  const answers = createAnswerTracker();
  answers.submit("one"); answers.submit("two");
  expect(answers.acknowledge([])).toEqual([1, 0]);
  expect(answers.acknowledge([])).toEqual([]);
});
