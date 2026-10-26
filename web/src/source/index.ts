// A factory source speaks the shared protocol. The UI never knows whether it's the real
// server or the simulator: `?source=sim` (default) or `?source=live&repo=owner/name`.

import type { ServerToWeb, WebToServer } from "@shiptorio/shared";
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
    // live defaults to this repo; the sim names its own fake repo unless onboarding picked one
    repo: q.get("repo") || (q.get("source") === "live" ? "r3dbars/shiptorio" : ""),
    scenario: scenario in SCENARIOS ? scenario : "quiet-morning",
  };
}

export function connect(cfg: SourceConfig, onMessage: Listener, onStatus: StatusListener): Source {
  if (cfg.kind === "sim") return connectSim(cfg.scenario, onMessage, onStatus, cfg.repo || undefined);
  // live loads on demand: it brings zod (the message schemas), which the sim and the first paint don't
  // need. Until it's loaded, sends are dropped, the same as live drops them while its socket isn't open.
  onStatus("connecting");
  let src: Source | null = null;
  let closed = false;
  import("./live").then(
    ({ connectLive }) => {
      if (!closed) src = connectLive(cfg.repo, onMessage, onStatus);
    },
    () => !closed && onStatus("offline"), // the chunk didn't load (offline, or a deploy replaced it): reload to retry
  );
  return {
    send: (m) => {
      if (!closed) src?.send(m);
    },
    close: () => {
      closed = true;
      src?.close();
    },
  };
}
