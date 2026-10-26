// Every online plant gets a building on the map. The sim places its own; the live server only reports what the
// runner found (state.power: a Claude or ChatGPT sign-in is solar, a local model is geothermal), so the map
// puts those plants in the plant row next to the steam plant, the way the sim lays them out.

import type { FactoryState, Machine, PowerSource } from "@shiptorio/shared";

const PLANT_TYPE: Partial<Record<PowerSource["kind"], Machine["type"]>> = { solar: "solar", geothermal: "geothermal" };
const STEP = 3; // grid cells between plants, so the Item Lab models don't overlap

export function withPlants<T extends Pick<FactoryState, "machines" | "power">>(state: T): T {
  const missing = state.power.filter((p) => p.online && PLANT_TYPE[p.kind] && !state.machines.some((m) => m.id === p.id));
  if (!missing.length) return state;
  const steam = state.machines.find((m) => m.type === "steam");
  const row = steam?.y ?? 3;
  const taken = new Set(state.machines.map((m) => `${m.x},${m.y}`));
  let x = (steam?.x ?? 0) + STEP;
  const placed: Machine[] = [];
  for (const p of missing) {
    while (taken.has(`${x},${row}`)) x += STEP;
    taken.add(`${x},${row}`);
    placed.push({ id: p.id, type: PLANT_TYPE[p.kind]!, x, y: row, tier: 1, state: "idle" });
    x += STEP;
  }
  return { ...state, machines: [...state.machines, ...placed] };
}
