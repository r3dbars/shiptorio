import { afterEach, beforeEach, expect, test } from "bun:test";
import type { FactoryState, ServerToWeb } from "@shiptorio/shared";
import { connectSim } from "../src/sim/engine";
import { applyPatch } from "../src/store";
import { itemPanel } from "../src/ui/StationPanel";
import { cartAt, clickable } from "../src/map/shaft/plan";

// Rush and Park from a cart's callout (docs/GAMEPLAY-PICKS.md r3-rush), played on the sim with hand-driven timers.
let timers = new Map<number, { at: number; every?: number; fn: () => void }>();
let micro: (() => void)[] = [];
let now = 0;
let ids = 0;
const real = { setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, location: Object.getOwnPropertyDescriptor(globalThis, "location") };
beforeEach(() => {
  timers = new Map();
  micro = [];
  now = 0;
  const add = (fn: () => void, ms = 0, every?: number) => (timers.set(++ids, { at: now + Math.max(0, ms), every, fn }), ids);
  globalThis.setTimeout = ((fn: () => void, ms?: number) => add(fn, ms)) as unknown as typeof setTimeout;
  globalThis.setInterval = ((fn: () => void, ms = 1) => add(fn, Math.max(1, ms), Math.max(1, ms))) as unknown as typeof setInterval;
  globalThis.clearTimeout = globalThis.clearInterval = ((id: unknown) => void timers.delete(Number(id))) as typeof clearTimeout;
  globalThis.queueMicrotask = (fn) => void micro.push(fn);
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?autolaunch" } });
});
afterEach(() => {
  Object.assign(globalThis, { setTimeout: real.setTimeout, clearTimeout: real.clearTimeout, setInterval: real.setInterval, clearInterval: real.clearInterval, queueMicrotask: real.queueMicrotask });
  if (real.location) Object.defineProperty(globalThis, "location", real.location);
  else Reflect.deleteProperty(globalThis, "location");
});
const flush = () => { while (micro.length) micro.shift()!(); };
function advance(ms: number, until?: () => boolean) {
  const end = now + ms;
  for (let n = 0; n < 100_000; n++) {
    flush();
    if (until?.()) return;
    const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
    if (!next) break;
    const [id, t] = next;
    now = t.at;
    if (t.every) timers.set(id, { ...t, at: t.at + t.every });
    else timers.delete(id);
    t.fn();
  }
  now = Math.max(now, end);
  flush();
}

function play() {
  let state: FactoryState | null = null;
  const logs: string[] = [];
  const src = connectSim("quiet-morning", (m: ServerToWeb) => {
    if (m.type === "snapshot") state = m.state;
    else if (m.type === "patch" && state) state = applyPatch(state, m.patch);
    else if (m.type === "log") logs.push(m.text);
  }, () => {});
  const item = (title: string) => state!.items.find((i) => i.title === title);
  return { src, logs, item, state: () => state! };
}

const DARK = "Add dark mode toggle";
const TESTS = "Missing tests for webhook signatures";

test("a parked cart stays off the line until Unpark, then ships", () => {
  const g = play();
  advance(120_000, () => !!g.item(DARK));
  g.src.send({ type: "set_priority", itemId: g.item(DARK)!.id, priority: "park" });
  advance(10 * 60_000);
  expect(g.item(DARK)?.priority).toBe("park");
  expect(g.item(DARK)?.state).not.toBe("launched");
  expect(g.item(DARK)?.attempts).toBe(0); // never taken by a builder
  expect(g.item("Remove dead map cache code")?.state).toBe("launched"); // the rest of the line kept moving
  g.src.send({ type: "set_priority", itemId: g.item(DARK)!.id, priority: "none" });
  advance(10 * 60_000);
  expect(g.item(DARK)?.priority).toBeUndefined();
  expect(g.item(DARK)?.state).toBe("launched");
  expect(g.logs).toContain(`Parked "${DARK}"`);
  expect(g.logs).toContain(`Unparked "${DARK}"`);
  g.src.close();
});

test("a rushed cart is the next one a builder picks up", () => {
  const g = play();
  advance(120_000, () => !!g.item(DARK));
  g.src.send({ type: "set_priority", itemId: g.item(DARK)!.id, priority: "park" });
  advance(120_000, () => !!g.item(TESTS));
  g.src.send({ type: "set_priority", itemId: g.item(TESTS)!.id, priority: "park" });
  // both wait, sorted, with nothing else ahead of them
  advance(5 * 60_000, () => g.item(DARK)?.state === "queued" && g.item(TESTS)?.state === "queued" && !g.state().items.some((i) => ["ore", "queued", "working"].includes(i.state) && !i.priority));
  g.src.send({ type: "set_priority", itemId: g.item(DARK)!.id, priority: "none" });
  g.src.send({ type: "set_priority", itemId: g.item(TESTS)!.id, priority: "rush" });
  advance(5 * 60_000, () => g.item(TESTS)?.state === "working" || g.item(DARK)?.state === "working");
  const picked = g.logs.filter((l) => l.includes("picked up"));
  expect(picked.at(-1)).toContain(TESTS);
  expect(g.logs).toContain(`Rushed "${TESTS}" to the front of the line`);
  g.src.close();
});

test("a tap picks the nearest cart within a finger's reach, as a pick key the panels open", () => {
  const carts = [{ ref: "gh-1", x: 100, y: 100 }, { ref: "gh-2", x: 112, y: 100 }];
  expect(cartAt(carts, 109, 101)).toBe("item:gh-2");
  expect(cartAt(carts, 98, 104)).toBe("item:gh-1");
  expect(cartAt(carts, 160, 100)).toBeUndefined();
  expect(clickable("item:gh-1")).toBe(true);
});

test("work already on the line can't be rushed or parked", () => {
  const g = play();
  advance(10 * 60_000);
  const shipped = g.state().items.find((i) => i.state === "launched")!;
  g.src.send({ type: "set_priority", itemId: shipped.id, priority: "park" });
  advance(2_000);
  expect(g.state().items.find((i) => i.id === shipped.id)?.priority).toBeUndefined();
  g.src.close();
});

test("the cart's callout offers Rush and Park while it waits, Unpark once parked, nothing once it's building", () => {
  const g = play();
  advance(120_000, () => !!g.item(DARK));
  const labels = () => itemPanel(`item:${g.item(DARK)!.id}`, g.state())!.choices.map((c) => c.label);
  expect(labels()).toEqual(["Rush", "Park"]);
  g.src.send({ type: "set_priority", itemId: g.item(DARK)!.id, priority: "park" });
  advance(2_000);
  expect(labels()).toEqual(["Unpark"]);
  g.src.send({ type: "set_priority", itemId: g.item(DARK)!.id, priority: "none" });
  advance(5 * 60_000, () => g.item(DARK)?.state === "working");
  expect(labels()).toEqual([]);
  expect(itemPanel("item:nope", g.state())).toBeNull();
  g.src.close();
});
