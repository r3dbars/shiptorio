// A factory source speaks the shared protocol. The UI never knows whether it's the real
// server or the simulator: `?source=sim` (default) or `?source=live&repo=owner/name`.

import type { ServerToWeb, WebToServer } from "@shiptorio/shared";
import { connectLive } from "./live";
import { connectSim, SCENARIOS, type ScenarioName } from "../sim/engine";

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
    repo: q.get("repo") || "r3dbars/shiptorio",
    scenario: scenario in SCENARIOS ? scenario : "quiet-morning",
  };
}

export function connect(cfg: SourceConfig, onMessage: Listener, onStatus: StatusListener): Source {
  return cfg.kind === "live" ? connectLive(cfg.repo, onMessage, onStatus) : connectSim(cfg.scenario, onMessage, onStatus);
}
