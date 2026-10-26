import { ServerToWeb } from "@shiptorio/shared";
import type { Listener, Source, StatusListener } from ".";

export function connectLive(repo: string, onMessage: Listener, onStatus: StatusListener): Source {
  let ws: WebSocket | null = null;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;

  const open = () => {
    onStatus("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/api/repos/${repo}/factory`);
    ws.onopen = () => {
      onStatus("live");
      ping = setInterval(() => ws?.send("ping"), 30_000);
    };
    ws.onmessage = (e) => {
      const parsed = ServerToWeb.safeParse(JSON.parse(e.data));
      if (parsed.success) onMessage(parsed.data);
      else console.warn("bad message from server", parsed.error);
    };
    ws.onclose = () => {
      clearInterval(ping);
      onStatus("offline");
      if (!closed) setTimeout(open, 3000);
    };
  };
  open();

  return {
    send: (msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
