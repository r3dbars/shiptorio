import { afterEach, beforeEach, expect, test } from "bun:test";
import type { FactoryState, ServerToWeb } from "@shiptorio/shared";
import { connectSim } from "../src/sim/engine";
import { applyPatch } from "../src/store";

// A second builder (docs/GAMEPLAY-PICKS.md r5-second A), played on the sim with hand-driven timers.
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
import type { Move } from "@shiptorio/shared";

function busy() {
  let state: FactoryState | null = null;
  const moves: Move[] = [];
  const logs: string[] = [];
  const src = connectSim("pileup", (m: ServerToWeb) => {
    if (m.type === "snapshot") state = m.state;
    else if (m.type === "patch" && state) state = applyPatch(state, m.patch);
    else if (m.type === "move" && m.move) moves.push(m.move);
    else if (m.type === "log") logs.push(m.text);
  }, () => {});
  const builders = () => state!.machines.filter((m) => m.type === "assembler");
  return { src, moves, logs, builders };
}

test("once 3 PRs have waited on the one builder, a card asks for a second; yes bolts one in that takes work", () => {
  const g = busy();
  advance(20 * 60_000, () => g.moves.some((m) => m.title === "Add a second builder?"));
  const card = g.moves.find((m) => m.title === "Add a second builder?")!;
  expect(card.why).toStartWith("3 PRs waited on the builder today");
  expect(g.builders()).toHaveLength(1);
  g.src.send({ type: "choose_move", moveId: card.id, optionId: "add" });
  advance(2_000);
  expect(g.builders().map((m) => m.id)).toEqual(["assembler-1", "assembler-1-2"]);
  advance(10 * 60_000, () => g.logs.some((l) => l.startsWith("assembler-1-2 picked up")));
  expect(g.logs.some((l) => l.startsWith("assembler-1-2 picked up"))).toBe(true);
  g.src.close();
});

test("the card comes once: Not yet doesn't bring it back", () => {
  const g = busy();
  advance(20 * 60_000, () => g.moves.some((m) => m.title === "Add a second builder?"));
  const card = g.moves.find((m) => m.title === "Add a second builder?")!;
  g.src.send({ type: "choose_move", moveId: card.id, optionId: "later" });
  advance(20 * 60_000);
  expect(g.moves.filter((m) => m.title === "Add a second builder?")).toHaveLength(1);
  expect(g.builders()).toHaveLength(1);
  g.src.close();
});
