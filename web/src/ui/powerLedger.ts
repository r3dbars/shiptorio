// Power accounting for the HUD: per plant, what it is, what it costs you, how much headroom is left and how
// many jobs it ran this session. A job counts for the plant whose assembler built it.

import type { FactoryState, PowerSource } from "@shiptorio/shared";

export interface PlantRow {
  id: string;
  kind: PowerSource["kind"];
  name: string;
  kindLabel: string; // "geothermal", "solar", "planner"
  cost: string; // what running it costs you
  level: number;
  online: boolean;
  jobs: number; // jobs built on it this session (the steam plant: planner decisions)
  busy: boolean; // one of its machines is working right now
}

const KIND_LABEL: Record<PowerSource["kind"], string> = { geothermal: "geothermal", solar: "solar", steam: "planner" };
const COST: Record<PowerSource["kind"], string> = {
  geothermal: "free, runs on your computer",
  solar: "uses your plan",
  steam: "runs the planner, on us",
};

// One line on what the geothermal plant is for. Player-facing: say "the planner", never the model's name.
export const GEO_EXPLAINER =
  "The planner sends small, low-risk jobs (docs, simple fixes) to your computer. Bigger or risky work goes to your subscriptions. Everything still goes through every check.";

// Remember which plant built each item. Items leave the assembler for the gauntlet, so the count has to be kept
// as they pass through, not read off the final state. Returns the same map when nothing new was seen.
export function notePowerJobs(seen: Map<string, string>, state: Pick<FactoryState, "items" | "machines">): Map<string, string> {
  let out = seen;
  for (const i of state.items) {
    if (i.state !== "working" || !i.machineId || seen.has(i.id)) continue;
    const powerId = state.machines.find((m) => m.id === i.machineId)?.powerId;
    if (!powerId) continue;
    if (out === seen) out = new Map(seen);
    out.set(i.id, powerId);
  }
  return out;
}

export function powerLedger(state: Pick<FactoryState, "power" | "machines" | "brain" | "items">, jobs: Map<string, string>): PlantRow[] {
  const ran = new Map<string, number>();
  for (const powerId of jobs.values()) ran.set(powerId, (ran.get(powerId) ?? 0) + 1);
  return state.power.map((p) => ({
    id: p.id,
    kind: p.kind,
    name: p.kind === "steam" ? "Planner" : p.name,
    kindLabel: KIND_LABEL[p.kind],
    cost: COST[p.kind],
    level: p.level,
    online: p.online,
    jobs: p.kind === "steam" ? (state.brain?.decisions ?? 0) : (ran.get(p.id) ?? 0),
    busy: state.machines.some((m) => m.powerId === p.id && m.state === "working"),
  }));
}
