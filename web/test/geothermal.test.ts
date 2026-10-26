import { afterEach, beforeEach, expect, test } from "bun:test";
import type { FactoryState, Item, ServerToWeb } from "@shiptorio/shared";
import { connectSim } from "../src/sim/engine";
import { applyPatch } from "../src/store";
import { readConfig } from "../src/source";
import { notePowerJobs, powerLedger } from "../src/ui/powerLedger";
import { withPlants } from "../src/map/plants";

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
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?autolaunch" } });
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

test("?scenario=geothermal is reachable from the URL", () => {
  expect(readConfig("?source=sim&scenario=geothermal").scenario).toBe("geothermal");
});

test("the planner routes the docs fix to geothermal and the bug to Claude, and both ship through the gauntlet", () => {
  let state: FactoryState | null = null;
  const logs: Extract<ServerToWeb, { type: "log" }>[] = [];
  const builtOn = new Map<string, string>(); // item title -> assembler that built it
  const seen = new Map<string, Set<string>>(); // item title -> stations it visited
  let jobs = new Map<string, string>();
  const src = connectSim("geothermal", (m) => {
    if (m.type === "snapshot") state = m.state;
    else if (m.type === "patch" && state) state = applyPatch(state, m.patch);
    else if (m.type === "log") logs.push(m);
    if (!state) return;
    jobs = notePowerJobs(jobs, state);
    for (const i of state.items as Item[]) {
      if (i.state === "working" && i.machineId) builtOn.set(i.title, i.machineId);
      if (i.machineId) seen.set(i.title, new Set([...(seen.get(i.title) ?? []), i.machineId]));
    }
  }, () => {});
  advance(0);
  const s0 = state as unknown as FactoryState;
  expect(s0.power.find((p) => p.id === "geo-local")).toMatchObject({ kind: "geothermal", name: "Your computer", online: true });
  expect(s0.machines.find((m) => m.id === "assembler-local")).toMatchObject({ harness: "local", powerId: "geo-local" });
  expect(s0.machines.some((m) => m.type === "geothermal" && m.id === "geo-local")).toBe(true);

  advance(900 * 80);
  src.close();
  const end = state as unknown as FactoryState;

  expect(builtOn.get("Fix typo in README setup steps")).toBe("assembler-local");
  expect(builtOn.get("Checkout total ignores the coupon after a refresh")).toBe("assembler-1");
  const route = logs.filter((l) => l.tool === "route").map((l) => l.text);
  expect(route).toHaveLength(2);
  expect(route[0]).toContain("your computer (geothermal)");
  expect(route[0]).toContain("small docs job, 1 file, low risk");
  expect(route[1]).toContain("Claude (solar)");
  expect(logs.map((l) => `${l.text} ${l.reason ?? ""}`).join("\n")).not.toMatch(/spark/i);
  expect(end.brain?.thoughts.filter((t) => t.decision === "route")).toHaveLength(2);

  for (const title of builtOn.keys()) {
    expect([...(seen.get(title) ?? [])]).toEqual(expect.arrayContaining(["ci-1", "verify-1", "review-1", "gate-1"]));
    expect(end.items.find((i) => i.title === title)?.state).toBe("launched");
  }
  expect(end.items.every((i) => i.orbit)).toBe(true);

  const ledger = powerLedger(end, jobs);
  expect(ledger.find((r) => r.id === "geo-local")).toMatchObject({ jobs: 1, cost: "free, runs on your computer" });
  expect(ledger.find((r) => r.id === "solar-claude_code")).toMatchObject({ jobs: 1, cost: "uses your plan" });
});

test("a live geothermal power source gets a plant on the map next to the other plants", () => {
  const live = {
    machines: [
      { id: "steam-spark", type: "steam", x: 0, y: 3, tier: 1, state: "idle" },
      { id: "assembler-1", type: "assembler", x: 0, y: 0, tier: 1, state: "idle" },
      { id: "runner-local", type: "assembler", x: 0, y: 6, harness: "local", powerId: "geo-local", tier: 1, state: "working" },
    ],
    power: [
      { id: "steam-spark", kind: "steam", name: "Muse Spark", level: 1, online: true },
      { id: "solar-claude_code", kind: "solar", name: "Claude", level: 1, online: true },
      { id: "geo-local", kind: "geothermal", name: "Your computer", level: 0.8, online: true },
    ],
  } as unknown as FactoryState;
  const placed = withPlants(live).machines;
  const geo = placed.find((m) => m.id === "geo-local")!;
  const solar = placed.find((m) => m.id === "solar-claude_code")!;
  expect(geo.type).toBe("geothermal");
  expect(solar.type).toBe("solar");
  expect(geo.y).toBe(3); // the plant row, beside the steam plant
  expect(new Set(placed.map((m) => `${m.x},${m.y}`)).size).toBe(placed.length);
  // offline plants stay off the map, and a state that already has its plants is left alone
  expect(withPlants({ ...live, power: live.power.map((p) => ({ ...p, online: p.kind === "steam" })) }).machines).toHaveLength(3);
  const sim = withPlants(live);
  expect(withPlants(sim)).toBe(sim);
});
