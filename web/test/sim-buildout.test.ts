import { afterEach, beforeEach, expect, test } from "bun:test";
import type { FactoryState, ServerToWeb, WebToServer } from "@shiptorio/shared";
import { STARTER_ISSUE, stepFrom } from "../src/buildout/journey";
import { connectSim } from "../src/sim/engine";
import { applyPatch } from "../src/store";
import { readConfig } from "../src/source";

// Drive the simulator's timers by hand so a whole run takes milliseconds.
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
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "" } });
});
afterEach(() => {
  Object.assign(globalThis, { setTimeout: real.setTimeout, clearTimeout: real.clearTimeout, setInterval: real.setInterval, clearInterval: real.clearInterval, queueMicrotask: real.queueMicrotask });
  if (real.location) Object.defineProperty(globalThis, "location", real.location);
  else Reflect.deleteProperty(globalThis, "location");
});
const flush = () => { while (micro.length) micro.shift()!(); };
function advance(ms: number) {
  const end = now + ms;
  for (let n = 0; n < 100_000; n++) {
    flush();
    const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
    if (!next) break;
    const [id, t] = next;
    now = t.at;
    if (t.every) timers.set(id, { ...t, at: t.at + t.every });
    else timers.delete(id);
    t.fn();
  }
  now = end;
  flush();
}

const TICK = 1400;

function run() {
  let state: FactoryState | null = null;
  const msgs: ServerToWeb[] = [];
  const src = connectSim("buildout", (m) => {
    msgs.push(m);
    if (m.type === "snapshot") state = m.state;
    else if (m.type === "patch" && state) state = applyPatch(state, m.patch);
  }, () => {});
  advance(0);
  const send = (msg: WebToServer) => (src.send(msg), advance(0));
  const build = (action: string) => send({ type: "station_action", stationId: "buildout", action });
  return { src, msgs, send, build, get s() { return state as unknown as FactoryState; } };
}

test("?scenario=buildout is reachable from the URL", () => {
  expect(readConfig("?buildout=1&source=sim&scenario=buildout").scenario).toBe("buildout");
});

test("the demo shop starts on nothing at all, and waits for the first build", () => {
  const f = run();
  expect(f.s.machines).toEqual([]);
  expect(f.s.belts).toEqual([]);
  expect(f.s.districts).toEqual([]);
  expect(f.s.power).toEqual([]);
  expect(f.s.items).toEqual([]);
  advance(TICK * 30);
  expect(f.s.machines).toEqual([]);
  expect(f.s.items).toEqual([]);
  expect(stepFrom(f.s).id).toBe("tunnel");
  expect(f.msgs.some((m) => m.type === "move")).toBe(false);
  f.src.close();
});

test("the guided issue rides from dark rock to a rocket, one build at a time", () => {
  const f = run();
  const at = () => stepFrom(f.s).id;
  const issue = () => f.s.items.find((i) => i.title === STARTER_ISSUE.title);

  f.send({ type: "connect_source", kind: "github" });
  expect(at()).toBe("boiler");
  expect(f.s.machines.map((m) => m.id)).toEqual(["ore-issues"]);
  expect(f.s.districts.length).toBeGreaterThan(0);

  f.build("boiler");
  expect(at()).toBe("builder");
  f.build("builder");
  expect(at()).toBe("issue");
  expect(f.s.machines.find((m) => m.type === "assembler")).toMatchObject({ powerId: "solar-claude_code" });

  f.build("issue");
  expect(at()).toBe("planner");
  expect(issue()).toMatchObject({ state: "ore", district: "docs", url: expect.stringContaining("/issues/1") });

  // the planner desk takes it and holds it on the plan until Continue, however long the player waits
  advance(TICK * 20);
  expect(issue()?.state).toBe("queued");
  expect(at()).toBe("planner");
  expect(f.s.machines.some((m) => m.type === "inspector")).toBe(false);

  f.build("planner");
  advance(TICK * 3);
  expect(issue()?.state).toBe("working");
  expect(at()).toBe("build");

  // the PR opens: the CI station builds itself, then the pad rises when it passes
  advance(TICK * 5);
  expect(f.s.machines.some((m) => m.id === "ci-1")).toBe(true);
  advance(TICK * 6);
  expect(issue()?.state).toBe("on_pad");
  expect(at()).toBe("launch");
  expect(f.s.machines.some((m) => m.type === "launch_pad")).toBe(true);
  expect(f.s.stations?.map((st) => st.id)).toEqual(["ci-1", "gate-1"]);
  // it waits for the hold; nothing launches on its own and no card jumps in front of the coach
  advance(TICK * 20);
  expect(issue()?.state).toBe("on_pad");
  expect(f.msgs.some((m) => m.type === "move")).toBe(false);

  f.send({ type: "launch_pr", itemId: issue()!.id });
  expect(issue()?.state).toBe("launched");
  expect(f.s.metrics?.rockets).toBe(1);
  expect(at()).toBe("look");
  f.src.close();
});

test("a build skips nothing: building a later step puts up everything before it", () => {
  const f = run();
  f.build("issue");
  expect(f.s.machines.map((m) => m.id).sort()).toEqual(["assembler-1", "ore-issues", "solar-claude_code", "splitter-1", "steam-spark"]);
  expect(stepFrom(f.s).id).toBe("planner");
  // a Continue before the ore reaches the desk still counts
  f.build("planner");
  advance(TICK * 6);
  expect(f.s.items[0].state).not.toBe("queued");
  f.src.close();
});

test("skip ahead fills in the whole starter line and hands over to normal play", () => {
  const f = run();
  f.build("all");
  for (const id of ["ore-issues", "splitter-1", "assembler-1", "ci-1", "verify-1", "review-1", "gate-1", "launch-pad"]) expect(f.s.machines.some((m) => m.id === id)).toBe(true);
  f.src.close();
});
