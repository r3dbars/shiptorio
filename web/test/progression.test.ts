import { expect, test } from "bun:test";
import type { Move } from "@shiptorio/shared";
import { createAnswerTracker } from "../src/ui/CheckIn";
import { progressOn, progressProfile } from "../src/ui/Progress";
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

test("progression stays off by default and respects explicit browser opt-in and opt-out", () => {
  const keys = ["location", "localStorage"] as const;
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map<string, string>();
  const location = { search: "" };
  try {
    Object.defineProperty(globalThis, "location", { configurable: true, value: location });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
    expect(progressOn()).toBe(false);
    location.search = "?progress=1";
    expect(progressOn()).toBe(true);
    location.search = "?empire=1";
    expect(progressOn()).toBe(true);
    location.search = "?progress=0&empire=1";
    expect(progressOn()).toBe(false);
    location.search = "";
    expect(progressOn()).toBe(false);
  } finally {
    for (const key of keys) { const descriptor = descriptors.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
