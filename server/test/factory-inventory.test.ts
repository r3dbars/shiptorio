import { expect, test } from "bun:test";
import { FactoryState, type WebToServer } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { inventoryCommand } from "../src/factory-inventory";

function inventory() {
  return FactoryState.parse({
    repo: "example/shop", baseBranch: "main", districts: [], ...starterLine(), items: [],
    science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0,
  });
}

function freeze(value: unknown): void {
  if (!value || typeof value !== "object") return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

test("every inventory calculation accepts frozen state and messages without mutating them", () => {
  const commands: WebToServer[] = [
    { type: "place_machine", machineType: "assembler", x: 20, y: 20, harness: "spark" },
    { type: "remove_machine", id: "assembler-1" },
    { type: "connect_belt", from: "splitter-1", to: "assembler-1", carries: "bug" },
    { type: "move_machine", id: "assembler-1", x: 20, y: 20 },
    { type: "set_harness", machineId: "assembler-1", harness: "codex" },
    { type: "set_module", machineId: "assembler-1", module: "careful" },
  ];
  for (const command of commands) {
    const state = inventory(), before = structuredClone(state), beforeCommand = structuredClone(command);
    freeze(state); freeze(command);
    const result = inventoryCommand(state, command, () => "fixture");
    expect(result.handled).toBe(true);
    expect(result.handled && result.patch).toBeDefined();
    expect(state).toEqual(before);
    expect(command).toEqual(beforeCommand);
  }
});

test("IDs are requested exactly once for valid creation and never for guarded or unrelated commands", () => {
  const state = inventory();
  const generated: string[] = [];
  const newId = () => { generated.push("new-id"); return "abcdef"; };
  const commands: WebToServer[] = [
    { type: "connect_belt", from: "missing", to: "assembler-1" },
    { type: "connect_belt", from: "splitter-1", to: "missing" },
    { type: "remove_machine", id: "missing" },
    { type: "move_machine", id: "missing", x: 20, y: 20 },
    { type: "set_harness", machineId: "missing", harness: "codex" },
    { type: "set_module", machineId: "missing", module: "careful" },
    { type: "set_goal", text: "Ship more fixes" },
  ];
  for (const command of commands) inventoryCommand(state, command, newId);
  expect(generated).toEqual([]);
  const placed = inventoryCommand(state, { type: "place_machine", machineType: "assembler", x: 20, y: 20 }, newId);
  expect(placed.handled && placed.patch?.machines?.[0].id).toBe("assembler-abcdef");
  expect(generated).toHaveLength(1);
  const belt = inventoryCommand(state, { type: "connect_belt", from: "splitter-1", to: "assembler-1" }, newId);
  expect(belt.handled && belt.patch?.belts?.[0].id).toBe("belt-abcdef");
  expect(generated).toHaveLength(2);
});

test("the result distinguishes unknown commands, scheduling noops and invalid-belt early stops", () => {
  const state = inventory(), newId = () => { throw Error("No ID should be needed"); };
  expect(inventoryCommand(state, { type: "set_goal", text: "Ship" }, newId)).toEqual({ handled: false });
  expect(inventoryCommand(state, { type: "move_machine", id: "missing", x: 20, y: 20 }, newId)).toEqual({ handled: true, patch: undefined });
  expect(inventoryCommand(state, { type: "connect_belt", from: "missing", to: "assembler-1" }, newId)).toEqual({ handled: true, stop: true });
});
