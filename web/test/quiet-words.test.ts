import { expect, test } from "bun:test";
import type { FactoryState, Item } from "@shiptorio/shared";
import { lineOrder, parkedIn, quietWord, workLabel, workOnLine, WORDS } from "../src/map/shaft/waiting";
import type { Plan } from "../src/map/shaft/layout";

// A quiet machine on the shaft never says IDLE (Justin: "why are so many things idle"): it says what it's waiting on,
// read off the real factory: the next item up the line ("NEXT UP"), or the player, when that item is parked on their card.

const plan: Plan = {
  planner: { id: "splitter-1" },
  assemblers: [{ id: "assembler-1" }, { id: "assembler-2" }],
  checks: [{ id: "ci-1", kind: "ci" }, { id: "verify-1", kind: "verify" }, { id: "review-1", kind: "review" }],
  gate: { id: "gate-1" },
  pad: { id: "launch-pad" },
  orbit: { id: "orbit-1" },
};
const item = (id: string, state: Item["state"], o: Partial<Item> = {}) => ({ id, state, title: id, source: "github_issue", ...o }) as Item;
const order = lineOrder(plan);
const words = (items: Item[], station: string, parked: (s: string) => boolean = () => false) =>
  quietWord(order.get(station)!, workOnLine(items, plan, order), parked, station);

test("the line runs planner, builders side by side, checks in order, gate, pad, orbit", () => {
  expect([...order]).toEqual([["splitter-1", 0], ["assembler-1", 1], ["assembler-2", 1], ["ci-1", 2], ["verify-1", 3], ["review-1", 4], ["gate-1", 5], ["launch-pad", 6], ["orbit-1", 7]]);
});

test("nothing anywhere upstream: no word (the chip says READY)", () => {
  expect(words([], "ci-1")).toBeNull();
  // work further up the line is not something this machine waits on
  expect(words([item("a", "on_pad", { prNumber: 141, machineId: "gate-1" })], "ci-1")).toBeNull();
});

test("the nearest real item below is on its way: NEXT UP", () => {
  const items = [item("a", "working", { machineId: "assembler-1", prNumber: 142 }), item("b", "ore")];
  expect(words(items, "review-1")).toEqual({ word: WORDS.next, det: "#142 on its way" });
  expect(words(items, "splitter-1")).toEqual({ word: WORDS.next, det: "new work on its way" });
});

test("real work already at the machine while the map's copy rides up to it is still on its way, not idle", () => {
  expect(words([item("a", "inspecting", { machineId: "ci-1", prNumber: 141 })], "ci-1")).toEqual({ word: WORDS.next, det: "#141 on its way" });
});

test("the item upstream is parked on the player's card: WAITING ON YOU", () => {
  const items = [item("a", "on_pad", { machineId: "gate-1", prNumber: 141 }), item("b", "working", { machineId: "assembler-1" })];
  const gate = (s: string) => s === "gate-1";
  expect(words(items, "launch-pad", gate)).toEqual({ word: WORDS.you, det: "#141 is on your card" });
  expect(words(items, "orbit-1", gate)).toEqual({ word: WORDS.you, det: "#141 is on your card" });
  // below the gate the next thing is still the build on its way
  expect(words(items, "ci-1", gate)).toEqual({ word: WORDS.next, det: "new work on its way" });
});

test("a parked item wins a tie with one that's moving at the same place", () => {
  const items = [item("a", "working", { machineId: "assembler-2", prNumber: 7 }), item("b", "working", { machineId: "assembler-1", prNumber: 8 })];
  expect(words(items, "ci-1", (s) => s === "assembler-1")).toEqual({ word: WORDS.you, det: "#8 is on your card" });
});

test("launched work is done with the line; rework rides back below the planner", () => {
  const out = workOnLine([item("a", "launched"), item("b", "rejected", { prNumber: 9 })], plan, order);
  expect(out).toEqual([{ at: -0.5, station: "splitter-1", label: "#9" }]);
});

test("parked, from the real factory alone: blocked machines, and the gate while work is on the pad", () => {
  const state = {
    items: [item("a", "on_pad", { machineId: "gate-1" })],
    machines: [{ id: "assembler-2", state: "blocked" }, { id: "ci-m", state: "blocked" }, { id: "assembler-1", state: "working" }],
    stations: [{ id: "ci-1", machineId: "ci-m" }],
  } as unknown as FactoryState;
  const parked = parkedIn(state, plan);
  expect(["gate-1", "assembler-2", "ci-1", "assembler-1", "ci-m"].map(parked)).toEqual([true, true, true, false, false]);
  expect(parkedIn({ ...state, items: [] }, plan)("gate-1")).toBe(false);
});

test("labels name the PR or issue, else just new work", () => {
  expect(workLabel({ id: "x", prNumber: 12 })).toBe("#12");
  expect(workLabel({ id: "gh-40" })).toBe("#40");
  expect(workLabel({ id: "sim-2-1" })).toBe("new work");
});
