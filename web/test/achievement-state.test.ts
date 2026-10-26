import { expect, test } from "bun:test";
import { achievementStorageKey, shippedSince } from "../src/ui/achievementState";

test("achievement records separate players and never reuse the unowned legacy key", () => {
  expect(achievementStorageKey("github:alice")).not.toBe(achievementStorageKey("github:bob"));
  expect(achievementStorageKey("github:alice")).not.toBe(achievementStorageKey("sim"));
  expect(achievementStorageKey("github:alice")).not.toBe("shiptorio:achievements");
});

test("only a new ship in the same factory advances the achievement day", () => {
  const previous = { repo: "owner/one", rockets: 1 };
  expect(shippedSince(null, previous)).toBe(false);
  expect(shippedSince(previous, { ...previous })).toBe(false);
  expect(shippedSince(previous, { ...previous, rockets: 2 })).toBe(true);
  expect(shippedSince(previous, { repo: "owner/two", rockets: 20 })).toBe(false);
  expect(shippedSince(previous, { ...previous, rockets: 0 })).toBe(false);
});
