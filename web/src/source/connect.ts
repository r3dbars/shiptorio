// Connect without loading what this visit doesn't need: the simulator (~2.4k lines) only for ?source=sim, the live
// socket (and zod) only for ?source=live. The deck uses this; the old app's connect() in index.ts loads the sim up front.
import type { Listener, Source, SourceConfig, StatusListener } from "./config";

type Sim = typeof import("../sim/engine");
let sim: Sim | null = null;
/** Loads the simulator once. After that, sim sources connect synchronously, like the old app's connect(). */
export const loadSim = (): Promise<Sim> => import("../sim/engine").then((m) => (sim = m));

export function connectLazy(cfg: SourceConfig, onMessage: Listener, onStatus: StatusListener): Source {
  if (cfg.kind === "live") return connectLazyLive(cfg.repo, onMessage, onStatus);
  const open = (m: Sim) => m.connectSim(cfg.scenario, onMessage, onStatus, cfg.repo || undefined);
  return sim ? open(sim) : lazySource(loadSim, open, onStatus);
}

export function connectLazyLive(repo: string, onMessage: Listener, onStatus: StatusListener, load: () => Promise<{ connectLive: (repo: string, onMessage: Listener, onStatus: StatusListener) => Source }> = () => import("./live")): Source {
  // live loads on demand: it brings zod (the message schemas), which the sim and the first paint don't need
  onStatus("connecting");
  return lazySource(load, ({ connectLive }) => connectLive(repo, onMessage, onStatus), onStatus);
}

function lazySource<T>(load: () => Promise<T>, open: (m: T) => Source, onStatus: StatusListener): Source {
  let src: Source | null = null;
  let closed = false;
  load().then((m) => {
    if (closed) return;
    src = open(m);
  }).catch(() => { if (!closed) onStatus("offline"); });
  return {
    send: (m) => { if (!closed) src?.send(m); },
    close: () => {
      closed = true;
      src?.close();
    },
  };
}
