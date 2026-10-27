import { afterEach, beforeEach, expect, test } from "bun:test";
import type { FactoryState, Item } from "@shiptorio/shared";
import { connectSim, SCENARIOS } from "../src/sim/engine";
import { applyPatch } from "../src/store";
import { tagText } from "../src/map/shaft/driver";
import { makeLayout } from "../src/map/shaft/layout";
import { clickable, lineOf, mineKey, planFromState } from "../src/map/shaft/plan";

// The shaft (?world=shaft) builds itself from the real FactoryState. Play every sim scenario and check that what it
// would build is sound: every chip opens a real panel, the gauntlet is in line order, the layout fits.

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
const flush = () => {
  while (micro.length) micro.shift()!();
};
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

// a scenario's states, sampled every few seconds for a minute and a half
function play(name: keyof typeof SCENARIOS): FactoryState[] {
  let state: FactoryState | null = null;
  const out: FactoryState[] = [];
  const src = connectSim(name, (m) => {
    if (m.type === "snapshot") state = m.state;
    else if (m.type === "patch" && state) state = applyPatch(state, m.patch);
  }, () => {});
  advance(0);
  for (let s = 0; s < 30; s++) {
    if (state) out.push(state);
    advance(3000);
  }
  src.close();
  return out;
}

for (const name of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
  test(`shaft plan for the ${name} scenario: real panels, line order, a layout that fits`, () => {
    const states = play(name);
    expect(states.length).toBeGreaterThan(0);
    for (const state of states) {
      const sp = planFromState(state);
      expect(sp.plan.assemblers.length).toBeLessThanOrEqual(3);
      // every chip opens a real panel: a gauntlet station by its id, or a machine as m:<id>
      for (const key of Object.values(sp.pick)) {
        if (key.startsWith("m:")) expect(state.machines.some((m) => m.id === key.slice(2))).toBe(true);
        else expect((state.stations ?? []).some((s) => s.id === key)).toBe(true);
      }
      // the checks floor runs the gauntlet in line order, without the gate or orbit watch
      const line = lineOf(state).map((c) => c.id);
      expect(sp.plan.checks.map((c) => c.id)).toEqual(line);
      if (state.stations?.length) expect(line).toEqual(state.stations.filter((s) => ["ci", "custom", "verify", "review"].includes(s.kind)).map((s) => s.id));
      // items moving never rebuild the shaft: only the machines, stations, mines and power do
      expect(planFromState({ ...state, items: [] }).key).toBe(sp.key);
      const layout = makeLayout(sp.plan);
      for (const c of sp.plan.checks) expect(layout.stations.some((s) => s.id === c.id)).toBe(true);
      for (const a of sp.plan.assemblers) expect(layout.stations.some((s) => s.id === a.id)).toBe(true);
    }
  });
}

test("a mine opens its deposit, nothing when connected without one, or asks to connect", () => {
  const sp = planFromState(play("judge")[0]);
  for (const [src, id] of Object.entries(sp.mines)) expect(mineKey(sp, src)).toBe(id ? `m:${id}` : undefined);
  if (!("posthog" in sp.mines)) expect(mineKey(sp, "posthog")).toBe("src:posthog");
});

test("districts and the drone have no panel", () => {
  expect(clickable("d:checkout")).toBe(false);
  expect(clickable("drone")).toBe(false);
  expect(clickable("")).toBe(false);
  expect(clickable("ci-1")).toBe(true);
  expect(clickable("m:assembler-1")).toBe(true);
});

test("item tags: the PR number, else the issue number, else what kind of ore it is", () => {
  const item = (o: Partial<Item>) => ({ id: "sim-1-1", title: "x", source: "github_issue", state: "ore", attempts: 0, ...o }) as Item;
  expect(tagText(item({ prNumber: 143 }))).toBe("#143");
  expect(tagText(item({ id: "gh-12" }))).toBe("#12");
  expect(tagText(item({ source: "sentry" }))).toBe("ERROR");
  expect(tagText(item({ source: "inbox" }))).toBe("MAIL");
});
