import { socketDisconnected } from "../telemetry";
import { ServerToWeb } from "@shiptorio/shared";
import type { Listener, Source, StatusListener } from ".";

export function connectLive(repo: string, onMessage: Listener, onStatus: StatusListener): Source {
  let ws: WebSocket | null = null;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (closed) return;
    onStatus("connecting");
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${location.host}/api/repos/${repo}/factory`);
    ws = socket;
    const current = () => !closed && ws === socket;
    socket.onopen = () => {
      if (!current()) return;
      onStatus("live");
      if (!current()) return;
      clearInterval(ping);
      ping = setInterval(() => {
        if (current() && socket.readyState === WebSocket.OPEN) socket.send("ping");
      }, 30_000);
    };
    socket.onmessage = (e) => {
      if (!current() || typeof e.data !== "string") return;
      let value: unknown;
      try { value = JSON.parse(e.data); } catch { return; }
      const parsed = ServerToWeb.safeParse(value);
      if (parsed.success) onMessage(parsed.data);
      else console.warn("bad message from server", parsed.error);
    };
    socket.onclose = (event) => {
      if (!current()) return;
      socketDisconnected(repo, event?.code ?? 1006, event?.wasClean ?? false);
      ws = null;
      clearInterval(ping);
      ping = undefined;
      onStatus("offline");
      if (!closed) reconnect = setTimeout(() => { reconnect = undefined; open(); }, 3000);
    };
  };
  open();

  return {
    send: (msg) => !closed && ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
    close: () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      clearTimeout(reconnect);
      const socket = ws;
      ws = null;
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = null;
        socket.close();
      }
    },
  };
}
