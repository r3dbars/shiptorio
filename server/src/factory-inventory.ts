import type { FactoryState, Patch, WebToServer } from "@shiptorio/shared";

type Inventory = Pick<FactoryState, "machines" | "belts" | "stations">;
type Command<T extends WebToServer["type"]> = Extract<WebToServer, { type: T }>;
type NewId = () => string;
export type InventoryResult = { handled: false } | { handled: true; patch?: Patch; stop?: true };

function placedMachine(msg: Command<"place_machine">, newId: NewId): Patch {
  return { machines: [{
    id: `${msg.machineType}-${newId()}`,
    type: msg.machineType,
    x: msg.x,
    y: msg.y,
    district: msg.district,
    harness: msg.harness,
    powerId: msg.harness === "spark" ? "steam-spark" : undefined,
    tier: 1,
    state: "idle",
  }] };
}

function removedMachine(s: Inventory, msg: Command<"remove_machine">): Patch | undefined {
  if (s.machines.some(m => m.id === msg.id && m.state === "working")) return;
  if (s.stations?.some(st => st.machineId === msg.id)) return; // gauntlet stations stay on the line
  return { removed: [
    { kind: "machine", id: msg.id },
    ...s.belts.filter(b => b.from === msg.id || b.to === msg.id).map(b => ({ kind: "belt" as const, id: b.id })),
  ] };
}

function connectedBelt(s: Inventory, msg: Command<"connect_belt">, newId: NewId): Patch | undefined {
  if (!s.machines.some(m => m.id === msg.from) || !s.machines.some(m => m.id === msg.to)) return;
  return { belts: [{ id: `belt-${newId()}`, from: msg.from, to: msg.to, carries: msg.carries }] };
}

function movedMachine(s: Inventory, msg: Command<"move_machine">): Patch | undefined {
  const m = s.machines.find(x => x.id === msg.id);
  const taken = s.machines.some(x => x.id !== msg.id && Math.abs(x.x - msg.x) < 2 && Math.abs(x.y - msg.y) < 2);
  if (m && !taken) return { machines: [{ ...m, x: msg.x, y: msg.y }] };
}

function changedHarness(s: Inventory, msg: Command<"set_harness">): Patch | undefined {
  const m = s.machines.find(x => x.id === msg.machineId);
  if (m?.type === "assembler" && m.state !== "working") return { machines: [{ ...m, harness: msg.harness, powerId: msg.harness === "spark" ? "steam-spark" : m.powerId }] };
}

function changedModule(s: Inventory, msg: Command<"set_module">): Patch | undefined {
  const m = s.machines.find(x => x.id === msg.machineId);
  if (m) return { machines: [{ ...m, module: msg.module }] };
}

/** Calculate inventory patches only. The browser handler retains authorization, IO and scheduling. */
export function inventoryCommand(s: Inventory, msg: WebToServer, newId: NewId): InventoryResult {
  switch (msg.type) {
    case "place_machine": return { handled: true, patch: placedMachine(msg, newId) };
    case "remove_machine": return { handled: true, patch: removedMachine(s, msg) };
    case "connect_belt": {
      const patch = connectedBelt(s, msg, newId);
      // Missing endpoints previously returned from the handler before its common scheduler.
      return patch ? { handled: true, patch } : { handled: true, stop: true };
    }
    case "move_machine": return { handled: true, patch: movedMachine(s, msg) };
    case "set_harness": return { handled: true, patch: changedHarness(s, msg) };
    case "set_module": return { handled: true, patch: changedModule(s, msg) };
    default: return { handled: false };
  }
}
