// What a factory source is and how the URL picks one. Imports neither the simulator nor the live socket, so the
// deck's first chunk carries neither; connect.ts loads whichever the URL asks for.
import type { ServerToWeb, WebToServer } from "@shiptorio/shared";
import type { ScenarioName } from "../sim/engine";

/** Object.keys(SCENARIOS) in sim/engine.ts, kept in step by web/test/lazy-source.test.ts. */
export const SCENARIO_NAMES = [
  "judge", "quiet-morning", "brain", "pileup", "rework-loop", "research", "heal", "mines", "support", "orbit", "growth",
  "bottleneck", "checkin", "first-run", "geothermal", "intro", "buildout", "deck-watch", "deck2d",
] as const satisfies readonly ScenarioName[];

export interface Source {
  send(msg: WebToServer): void;
  close(): void;
}

export type Listener = (msg: ServerToWeb) => void;
export type StatusListener = (status: "connecting" | "live" | "offline") => void;

export interface SourceConfig {
  kind: "sim" | "live";
  repo: string;
  scenario: ScenarioName;
}

export function readConfig(search = location.search): SourceConfig {
  const q = new URLSearchParams(search);
  const scenario = q.get("scenario") as ScenarioName;
  return {
    kind: q.get("source") === "live" ? "live" : "sim",
    // live defaults to this repo; the sim names its own fake repo unless onboarding picked one
    repo: q.get("repo") || (q.get("source") === "live" ? "r3dbars/shiptorio" : ""),
    scenario: (SCENARIO_NAMES as readonly string[]).includes(scenario) ? scenario : "quiet-morning",
  };
}
