import type { Factory, Item, ServerToWeb, WebToServer } from "@shiptorio/shared";

export class FactoryError extends Error {}
export const emptyFactory = (repo: string): Factory => ({ repo, revision: 0, machines: [], items: [], belts: [] });

/** Pure reducer: only user build actions here. Spark owns automated factory decisions. */
export function applyCommand(state: Factory, command: WebToServer): Factory {
  const next = structuredClone(state);
  switch (command.type) {
    case "place_machine":
      if (next.machines.some((m) => m.id === command.machine.id)) throw new FactoryError("Machine already exists");
      if (next.machines.length >= 100) throw new FactoryError("Machine limit reached");
      next.machines.push(command.machine);
      break;
    case "remove_machine":
      if (!next.machines.some((m) => m.id === command.machineId)) throw new FactoryError("Unknown machine");
      if (next.items.some((item) => item.machineId === command.machineId)) throw new FactoryError("Machine still has assigned items");
      next.machines = next.machines.filter((m) => m.id !== command.machineId);
      next.belts = next.belts.filter((b) => b.from !== command.machineId && b.to !== command.machineId);
      break;
    case "connect_belt":
      if (next.belts.some((b) => b.id === command.belt.id)) throw new FactoryError("Belt already exists");
      if (command.belt.from === command.belt.to) throw new FactoryError("A belt needs two different machines");
      if (![command.belt.from, command.belt.to].every((id) => next.machines.some((m) => m.id === id))) throw new FactoryError("Unknown belt endpoint");
      if (next.belts.length >= 300) throw new FactoryError("Belt limit reached");
      next.belts.push(command.belt);
      break;
    case "set_module": {
      const machine = next.machines.find((m) => m.id === command.machineId);
      if (!machine) throw new FactoryError("Unknown machine");
      if (new Set(command.modules).size !== command.modules.length) throw new FactoryError("Duplicate modules");
      machine.modules = command.modules;
      break;
    }
    case "launch_pr":
      throw new FactoryError("PR creation requires the runner integration; no job has been dispatched");
  }
  next.revision++;
  return next;
}

/** Verified issue events become ore. Delivery retries must not create duplicate items. */
export function ingestIssue(state: Factory, issue: { number: number; title: string }): Factory {
  if (state.items.some((i) => i.source === "github_issue" && i.sourceId === String(issue.number))) return state;
  if (state.items.length >= 2000) throw new FactoryError("Item limit reached");
  const item: Item = { id: `issue-${issue.number}`, repo: state.repo, title: issue.title,
    source: "github_issue", sourceId: String(issue.number), state: "ore", machineId: null,
    quality: null, failure: null, pr: null };
  return { ...state, revision: state.revision + 1, items: [...state.items, item] };
}

export function patch(before: Factory, after: Factory): ServerToWeb {
  return { type: "patch", version: 1, repo: after.repo, baseRevision: before.revision,
    revision: after.revision, changes: { machines: after.machines, items: after.items, belts: after.belts } };
}
