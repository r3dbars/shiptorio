// The shiptorio:build event the build sound listens to (moved here from the old app's buildout/journey.ts).
// A scene fires it on window as each build moves through its moment.
import type { StepId } from "../deck2d/rules/sim";

/** One build moment, in ms from its start. */
export const BUILD_MS = { chalk: 500, construct: 4500, burst: 5500, payoff: 7000 } as const;

/** Fired on window by the scene (slice 2) as each build moves through its moment. Sound, card and tests listen. */
export const BUILD_EVENT = "shiptorio:build";
export interface BuildDetail {
  /** the step being built (later unlocks use their own ids) */
  id: StepId | string;
  phase: "start" | "burst" | "done";
  /** true the first time this kind of piece bursts online (big burst, full bell); false for repeats */
  first?: boolean;
}
export const emitBuild = (detail: BuildDetail) => window.dispatchEvent(new CustomEvent<BuildDetail>(BUILD_EVENT, { detail }));
/** Listen for builds. Returns the remover. */
export function onBuild(fn: (d: BuildDetail) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<BuildDetail>).detail);
  window.addEventListener(BUILD_EVENT, h);
  return () => window.removeEventListener(BUILD_EVENT, h);
}
