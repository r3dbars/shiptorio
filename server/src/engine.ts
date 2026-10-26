// Pure factory rules, kept out of the Durable Object so they're easy to test.

import type { Belt, FactoryState, Item, Machine } from "@shiptorio/shared";
import { gauntletLine } from "./gauntlet";

// Spark may only write ordinary repo paths: no escapes, git metadata, CI config or secrets.
import { pathAllowed } from "./injection-policy";
export const SAFE_PATH = { test: pathAllowed };

export function upsert<T extends { id: string }>(list: T[], next: T) {
  const i = list.findIndex((x) => x.id === next.id);
  if (i === -1) list.push(next);
  else list[i] = next;
}

export function hasMachine(s: FactoryState, type: Machine["type"]) {
  return s.machines.some((m) => m.type === type);
}

export function pickAssembler(s: FactoryState, item: Item): Machine | undefined {
  const idle = s.machines.filter((m) => m.type === "assembler" && m.state !== "working" && m.harness === "spark"
    && s.power.some((p) => p.id === m.powerId && p.online && p.level > 0)
    && s.belts.some((b) => b.to === m.id && (!b.carries || b.carries === item.kind)
      && s.machines.some((source) => source.id === b.from && source.type === "splitter"))
    && s.belts.some((b) => b.from === m.id && (!b.carries || b.carries === item.kind)
      && s.machines.some((target) => target.id === b.to && target.type === "inspector")));
  if (item.machineId) return idle.find((m) => m.id === item.machineId);
  return idle.find((m) => m.district === item.district) ?? idle[0];
}

// One complete line: ore → splitter → assembler → the gauntlet (CI, verify, review, merge gate) → launch pad.
export function starterLine(): Pick<FactoryState, "machines" | "belts" | "power"> {
  const gauntlet = gauntletLine();
  const power = [{ id: "steam-spark", kind: "steam" as const, name: "Planner", level: 1, online: true }];
  const machines: Machine[] = [
    { id: "ore-issues", type: "ore_deposit", x: -6, y: 0, tier: 1, state: "idle" },
    { id: "splitter-1", type: "splitter", x: -3, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    { id: "assembler-1", type: "assembler", x: 0, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    ...gauntlet.machines,
    { id: "steam-spark", type: "steam", x: 0, y: 3, tier: 1, state: "idle" },
  ];
  const chain = ["ore-issues", "splitter-1", "assembler-1"];
  const belts: Belt[] = [...chain.slice(1).map((to, i) => ({ id: `belt-${i + 1}`, from: chain[i], to })), ...gauntlet.belts];
  return { machines, belts, power };
}
