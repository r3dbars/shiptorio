// Panel copy lookups. The words themselves live in ../copy.ts; this only picks the right ones.

import { techOfStation, type Machine } from "@shiptorio/shared";
import { GEO_COPY, MACHINE_COPY, POWER_COPY, RESEARCHED, REWORK_COPY, STATION_COPY, type PanelCopy } from "../copy";

export { GEO_COPY, MACHINE_COPY, POWER_COPY, REWORK_COPY, STATION_COPY, type PanelCopy };

/** A researched check's panel: what it does and a real example of what it stops (shared/src/research.ts). */
export function researchedCopy(stationId: string): PanelCopy {
  const t = techOfStation(stationId);
  if (!t) return STATION_COPY.custom;
  return { zone: RESEARCHED.zone, name: t.name, tag: ["blue", RESEARCHED.tag], what: RESEARCHED.what(t.what, t.catches) };
}

export const POWER_TYPES: Machine["type"][] = ["steam", "solar", "battery", "geothermal"];

export { actionLabel } from "../deck2d/rules/sim";
