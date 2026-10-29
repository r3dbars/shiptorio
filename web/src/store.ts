// Folds protocol messages into one FactoryState plus a rolling log.

import { useEffect, useMemo, useRef, useState } from "react";
import type { FactoryState, ServerToWeb, WebToServer } from "@shiptorio/shared";
import { connect, type Source, type SourceConfig } from "./source";
import { applyPatch } from "./source/patch";

export { applyPatch };

export type LogLine = Omit<Extract<ServerToWeb, { type: "log" }>, "type">;

const MAX_LOG = 80;

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
