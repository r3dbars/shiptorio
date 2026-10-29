// The few game rules the simulator needs from the old app's modules, kept here so the deck's sim imports
// nothing from map/, ui/ or buildout/. Those modules re-export these names, so their callers are unchanged.
import type { FactoryState } from "@shiptorio/shared";
import { MACHINE_COPY, POWER_COPY, REWORK_COPY } from "../../copy";

/** Build as you go's eight builds, in order (web/src/buildout/CONTRACT.md). */
export const STEP_IDS = ["tunnel", "boiler", "builder", "issue", "planner", "build", "checks", "launch"] as const;
export type StepId = (typeof STEP_IDS)[number];

/** The first job in the demo shop. server/src/starterIssue.ts matches its title and label. */
export const STARTER_ISSUE = {
  title: 'Add a "Run it locally" section to the README',
  label: "shiptorio-starter",
} as const;

/** Mines unlock slowly: the first after 3 rockets, the next after 6, then 9. One new source at a time, never up front. */
export function mineUnlocked(state: FactoryState): boolean {
  const connected = (state.sources ?? []).filter((x) => x.state === "connected").length;
  return (state.metrics?.rockets ?? 0) >= 3 * (connected + 1);
}

// The label for an action id on any panel, so the floor log can say what was asked for.
export function actionLabel(action: string): string | undefined {
  const all = [REWORK_COPY, POWER_COPY, ...Object.values(MACHINE_COPY)].flatMap((c) => c?.actions ?? []);
  return all.find((a) => a.id === action)?.label;
}
