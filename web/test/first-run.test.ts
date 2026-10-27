import { expect, test } from "bun:test";
import type { FactoryState, Item } from "@shiptorio/shared";

import { FirstRunLight, litFloors } from "../src/map/shaft/firstRun";

// a factory on its first open: the repo is read, the line stands, nothing has moved yet
const snapshot = (_scenario: "first-run"): FactoryState =>
  ({
    repo: "you/app",
    baseBranch: "main",
    districts: [],
    machines: [{ id: "ore-issues", type: "ore_deposit", x: 0, y: 0, tier: 1, state: "idle" }],
    belts: [],
    items: [],
    power: [],
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    trust: 0.5,
    tick: 0,
    metrics: { rockets: 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0 },
    stations: ["ci", "verify", "review", "merge"].map((kind) => ({ id: `${kind}-1`, kind, name: kind, machineId: `${kind}-1`, wip: 0, caughtThisWeek: 0, actions: [] })),
  }) as unknown as FactoryState;
const item = (state: Item["state"], extra: Partial<Item> = {}) => ({ id: `i-${state}`, kind: "bug", source: "issues", title: "x", district: "web", state, attempts: 0, updatedAt: 0, ...extra }) as Item;
const withItems = (s: FactoryState, items: Item[]): FactoryState => ({ ...s, items });

test("a brand-new factory is dark: only the GitHub tunnel is lit", () => {
  expect(litFloors(snapshot("first-run"))).toBe(0);
});

test("floors light bottom to top as real progress lands", () => {
  const s = snapshot("first-run");
  expect(litFloors(withItems(s, [item("ore")]))).toBe(1); // the first issue came up as ore
  expect(litFloors(withItems(s, [item("queued")]))).toBe(1);
  expect(litFloors(withItems(s, [item("working")]))).toBe(2); // the first build runs
  expect(litFloors(withItems(s, [item("queued", { attempts: 1 })]))).toBe(2); // it built once and came back
  expect(litFloors(withItems(s, [item("inspecting")]))).toBe(2); // CI is running, not reported yet
  expect(litFloors(withItems(s, [item("inspecting", { inspection: { headSha: "a", state: "pending", humanApproved: false, stages: [{ gate: "ci", state: "passed", reason: "" }] } })]))).toBe(3);
  expect(litFloors(withItems(s, [item("passed")]))).toBe(3);
  expect(litFloors(withItems(s, [item("rejected")]))).toBe(3);
  expect(litFloors(withItems(s, [item("launched")]))).toBe(4); // the first rocket lights the top
});

test("a factory that has shipped before is fully lit, even with an empty line", () => {
  const s = snapshot("first-run");
  expect(litFloors({ ...s, metrics: { ...s.metrics!, rockets: 1 } })).toBe(4);
  expect(litFloors({ ...s, science: { red: 1, green: 0, grey: 0, blue: 0 } })).toBe(4);
});

test("station tallies alone don't light the checks: only real work on the line does", () => {
  const s = snapshot("first-run");
  expect(litFloors({ ...s, stations: s.stations!.map((st) => ({ ...st, caughtThisWeek: 9 })) })).toBe(0);
});

test("the light never goes back down, and only a rise after the first look swoops", () => {
  const l = new FirstRunLight();
  expect(l.set(1, false)).toBeNull(); // the first look: no swoop
  expect(l.dark).toBe(true);
  expect(l.set(2, false)).toBe("build");
  expect(l.set(1, false)).toBeNull(); // the item moved on: the floor stays lit
  expect(l.level).toBe(2);
  expect(l.set(4, true)).toBe("launch");
  expect(l.dark).toBe(false);
});
