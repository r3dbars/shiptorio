import { afterEach, beforeEach, expect, test } from "bun:test";
import { FrameGovernor } from "../src/map/quality";

const original = {
  location: Object.getOwnPropertyDescriptor(globalThis, "location"),
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
};
let hidden = false;
let now = 0;

beforeEach(() => {
  hidden = false;
  now = performance.now();
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "" } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    get visibilityState() { return hidden ? "hidden" : "visible"; },
  } });
});
afterEach(() => {
  for (const key of ["location", "document"] as const) {
    const descriptor = original[key];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const frame = (g: FrameGovernor, gap: number) => g.draw(now += gap, false);
function warmed() {
  const g = new FrameGovernor(false);
  frame(g, 3100); // shader warm-up / initial clock gap is not evidence of sustained slowness
  return g;
}

test("captured continuous CI stalls reach the existing lowest tier in two frames", () => {
  const g = warmed();
  // Actual remote trace gaps were ~600–1800ms; the old average path ignored all of them.
  frame(g, 606); expect(g.tier).toBe(0);
  frame(g, 1227); expect(g.tier).toBe(2);
  frame(g, 1832); expect(g.tier).toBe(2);
});

test("bounded catastrophic frame range includes 500ms and 2000ms", () => {
  const g = warmed();
  frame(g, 500); frame(g, 2000);
  expect(g.tier).toBe(2);
});

test("a normal frame or a long suspended clock gap breaks the slow streak", () => {
  const g = warmed();
  frame(g, 600); frame(g, 16); frame(g, 600);
  expect(g.tier).toBe(0);
  frame(g, 2001); frame(g, 600);
  expect(g.tier).toBe(0);
  frame(g, 600); expect(g.tier).toBe(2);
});

test("hidden frames cannot trigger or carry a fallback streak", () => {
  const g = warmed();
  frame(g, 600);
  hidden = true; frame(g, 600); frame(g, 600);
  expect(g.tier).toBe(0);
  hidden = false; frame(g, 600);
  expect(g.tier).toBe(0);
  frame(g, 600); expect(g.tier).toBe(2);
});

test("shader warm-up stalls do not count toward the fallback", () => {
  const g = new FrameGovernor(false);
  frame(g, 600); frame(g, 600); frame(g, 600); frame(g, 600);
  expect(g.tier).toBe(0);
  frame(g, 700); expect(g.tier).toBe(0);
  frame(g, 600); expect(g.tier).toBe(2);
});

test("all explicit quality pins ignore sustained catastrophic stalls", () => {
  for (const tier of [0, 1, 2]) {
    location.search = `?quality=${tier}`;
    const g = new FrameGovernor(false);
    frame(g, 3100); frame(g, 600); frame(g, 1800); frame(g, 600);
    expect(g.tier).toBe(tier);
  }
});

test("normal good-device look, ordinary average fallback and shadow cadence remain", () => {
  const good = warmed();
  for (let i = 0; i < 150; i++) frame(good, 17);
  expect(good.tier).toBe(0); expect(good.shadows()).toBe(true);
  const slow = warmed();
  for (let i = 0; i < 140; i++) frame(slow, 35);
  expect(slow.tier).toBe(1);
  const a = slow.shadows(); frame(slow, 35); expect(slow.shadows()).toBe(!a);
  slow.tier = 2;
  expect(frame(slow, 10)).toBe(false);
  expect(frame(slow, 25)).toBe(true);
});
