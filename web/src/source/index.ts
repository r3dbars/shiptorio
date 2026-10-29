// A factory source speaks the shared protocol. The UI never knows whether it's the real
// server or the simulator: `?source=sim` (default) or `?source=live&repo=owner/name`.

import { connectSim } from "../sim/engine";
import type { Listener, Source, SourceConfig, StatusListener } from "./config";
import { connectLazyLive } from "./connect";

export { readConfig, SCENARIO_NAMES, type Listener, type Source, type SourceConfig, type StatusListener } from "./config";
export { connectLazy, connectLazyLive } from "./connect";

export function connect(cfg: SourceConfig, onMessage: Listener, onStatus: StatusListener): Source {
  if (cfg.kind === "sim") return connectSim(cfg.scenario, onMessage, onStatus, cfg.repo || undefined);
  return connectLazyLive(cfg.repo, onMessage, onStatus);
}
