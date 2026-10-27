import { expect, test } from "bun:test";
import type { FactoryState } from "@shiptorio/shared";

import type { Iron } from "../src/map/shaft/core";
import { Trophies } from "../src/map/shaft/trophies";

const I = { stations: { "asm-1": { x: 0, y: 2, z: 0 }, "asm-2": { x: 10, y: 2, z: 0 }, gate: { x: 0, y: 20, z: -10 } } } as unknown as Iron;
const machines = [{ id: "asm-1", type: "assembler" }, { id: "asm-2", type: "assembler" }, { id: "gate", type: "inspector" }];
const st = (items: { id: string; state: string; machineId?: string }[]) => ({ machines, items } as unknown as FactoryState);
const lamps = (t: Trophies) => t.group.children.length / 2;
const lampXs = (t: Trophies) => t.group.children.filter((_, i) => i % 2).map((m) => Math.round(m.position.x));

test("a shipped PR leaves a lamp in front of the assembler that built it, not the gate it left from", () => {
  const t = new Trophies();
  t.sync(I, st([{ id: "a", state: "building", machineId: "asm-2" }]));
  expect(lamps(t)).toBe(0);
  t.sync(I, st([{ id: "a", state: "launched", machineId: "gate" }]));
  expect(lamps(t)).toBe(1);
  expect(lampXs(t)[0]).toBeGreaterThan(5); // asm-2 sits at x 10
});

test("a PR that shipped before this page saw it build stands at the first assembler; nothing else lights", () => {
  const t = new Trophies();
  t.sync(I, st([{ id: "a", state: "launched", machineId: "gate" }, { id: "b", state: "on_pad", machineId: "gate" }, { id: "c", state: "rejected" }]));
  expect(lamps(t)).toBe(1);
  expect(lampXs(t)[0]).toBeLessThan(5);
});

test("lamps cap at 24 per assembler and are rebuilt only when the count changes", () => {
  const t = new Trophies();
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, state: "launched" }));
  t.sync(I, st(many));
  expect(lamps(t)).toBe(24);
  const first = t.group.children[0];
  t.sync(I, st(many));
  expect(t.group.children[0]).toBe(first);
  t.dispose();
});
