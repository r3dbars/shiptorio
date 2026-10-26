// Pure factory rules, kept out of the Durable Object so they're easy to test.

import type { Belt, FactoryState, Item, Machine } from "@shiptorio/shared";

// Spark may only write ordinary repo paths: no escapes, git metadata, CI config or secrets.
export const SAFE_PATH = /^(?!\/)(?!.*\.\.)(?!\.github\/)(?!.*\s)(?!.*(?:^|\/)\.(?:env|dev\.vars)(?:\.|\/|$))(?!.*(?:^|\/)\.(?:git|github)(?:\/|$))(?!.*\.(?:pem|key|p12|pfx)$)[\w./@+-]+$/i;

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

// One complete line, per the v1 plan: ore → splitter → assembler → inspector → launch pad, on Spark power.
export function starterLine(): Pick<FactoryState, "machines" | "belts" | "power"> {
  const power = [{ id: "steam-spark", kind: "steam" as const, name: "Muse Spark", level: 1, online: true }];
  const machines: Machine[] = [
    { id: "ore-issues", type: "ore_deposit", x: -6, y: 0, tier: 1, state: "idle" },
    { id: "splitter-1", type: "splitter", x: -3, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    { id: "assembler-1", type: "assembler", x: 0, y: 0, harness: "spark", powerId: "steam-spark", tier: 1, state: "idle" },
    { id: "inspector-1", type: "inspector", x: 3, y: 0, tier: 1, state: "idle" },
    { id: "launch-pad", type: "launch_pad", x: 6, y: 0, tier: 1, state: "idle" },
    { id: "steam-spark", type: "steam", x: 0, y: 3, tier: 1, state: "idle" },
  ];
  const chain = ["ore-issues", "splitter-1", "assembler-1", "inspector-1", "launch-pad"];
  const belts: Belt[] = chain.slice(1).map((to, i) => ({ id: `belt-${i + 1}`, from: chain[i], to }));
  return { machines, belts, power };
}
