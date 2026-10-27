// Folds protocol messages into one FactoryState plus a rolling log.

import { useEffect, useMemo, useRef, useState } from "react";
import type { FactoryState, Patch, ServerToWeb, WebToServer } from "@shiptorio/shared";
import { connect, type Source, type SourceConfig } from "./source";

export type LogLine = Omit<Extract<ServerToWeb, { type: "log" }>, "type">;

const MAX_LOG = 80;

export function applyPatch(s: FactoryState, p: Patch): FactoryState {
  const upsert = <T extends { id: string }>(list: T[], next: T[] | undefined) => {
    if (!next?.length) return list;
    const out = [...list];
    for (const n of next) {
      const i = out.findIndex((x) => x.id === n.id);
      if (i === -1) out.push(n);
      else out[i] = n;
    }
    return out;
  };
  const gone = (kind: "item" | "machine" | "belt") => new Set(p.removed?.filter((r) => r.kind === kind).map((r) => r.id));
  const goneItems = gone("item");
  const goneMachines = gone("machine");
  const goneBelts = gone("belt");
  return {
    ...s,
    items: upsert(s.items, p.items).filter((x) => !goneItems.has(x.id)),
    machines: upsert(s.machines, p.machines).filter((x) => !goneMachines.has(x.id)),
    belts: upsert(s.belts, p.belts).filter((x) => !goneBelts.has(x.id)),
    districts: p.districts ?? s.districts,
    power: p.power ?? s.power,
    science: p.science ?? s.science,
    trust: p.trust ?? s.trust,
    tick: p.tick ?? s.tick,
    goal: p.goal ?? s.goal,
    goals: p.goals ?? s.goals,
    bottleneck: p.bottleneck !== undefined ? p.bottleneck : s.bottleneck,
    holdingBack: p.holdingBack !== undefined ? p.holdingBack : s.holdingBack,
    autonomy: p.autonomy ?? s.autonomy,
    metrics: p.metrics ?? s.metrics,
    foreman: p.foreman ?? s.foreman,
    brain: p.brain ?? s.brain,
    sources: p.sources ?? s.sources,
    stations: p.stations ?? s.stations,
    research: p.research ?? s.research,
    support: p.support ?? s.support,
    experiments: p.experiments ?? s.experiments,
  };
}

export function useFactory(cfg: SourceConfig) {
  const [state, setState] = useState<FactoryState | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [unlock, setUnlock] = useState<Extract<ServerToWeb, { type: "autonomy_unlocked" }> | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const source = useRef<Source | null>(null);

  useEffect(() => {
    setState(null);
    setLog([]);
    setUnlock(null);
    const onMessage = (msg: ServerToWeb) => {
      if (msg.type === "snapshot") setState(msg.state);
      else if (msg.type === "patch") setState((s) => (s ? applyPatch(s, msg.patch) : s));
      else if (msg.type === "move") setState((s) => (s ? { ...s, move: msg.move } : s));
      else if (msg.type === "move_resolved")
        setState((s) => (s ? { ...s, move: s.move?.id === msg.moveId ? null : s.move, deck: s.deck?.filter((m) => m.id !== msg.moveId) } : s));
      else if (msg.type === "deck") setState((s) => (s ? { ...s, deck: msg.deck } : s));
      else if (msg.type === "autonomy_unlocked") {
        setUnlock(msg);
        setLog((l) => [...l.slice(-(MAX_LOG - 1)), { level: "success", text: msg.text, at: Date.now(), actor: "system" }]);
      } else {
        const { type: _, ...line } = msg;
        setLog((l) => [...l.slice(-(MAX_LOG - 1)), line]);
      }
    };
    source.current = connect(cfg, onMessage, setStatus);
    return () => source.current?.close();
  }, [cfg.kind, cfg.repo, cfg.scenario]);

  const send = useMemo(() => (msg: WebToServer) => source.current?.send(msg), []);
  return { state, log, status, send, unlock };
}
