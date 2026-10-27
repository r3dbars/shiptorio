import { socketDisconnected } from "../telemetry";
import { ServerToWeb } from "@shiptorio/shared";
import type { Listener, Source, StatusListener } from ".";

const HEARTBEAT_MS = 15_000;
const DEAD_MS = 5_000;
const NOTICE_MS = 3_000;

export function connectLive(repo: string, onMessage: Listener, onStatus: StatusListener): Source {
  let ws: WebSocket | null = null;
  let closed = false, synced = false, attempt = 0, lastSeq = -1;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let notice: HTMLElement | undefined;

  // Preserve the last good map through short interruptions; no red offline flash.
  const waiting = () => {
    if (noticeTimer !== undefined || notice) return;
    noticeTimer = setTimeout(() => {
      noticeTimer = undefined;
      if (closed || typeof document === "undefined") return;
      notice = document.createElement("div");
      notice.setAttribute("role", "status");
      notice.textContent = "Reconnecting…";
      notice.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:1000;padding:6px 10px;border-radius:6px;background:#1b2448;color:#c9b48a;font:12px monospace;pointer-events:none";
      document.body.append(notice);
    }, NOTICE_MS);
  };
  const ready = () => {
    clearTimeout(noticeTimer); noticeTimer = undefined;
    notice?.remove(); notice = undefined;
    attempt = 0;
    onStatus("live");
  };
  const detach = () => {
    clearTimeout(heartbeat); clearTimeout(deadline);
    const socket = ws; ws = null; synced = false;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
  };
  const lost = () => {
    if (closed) return;
    detach(); waiting();
    clearTimeout(retry);
    // Equal jitter, capped at 10s; a network/visibility recovery bypasses this delay.
    const cap = Math.min(10_000, 250 * 2 ** Math.min(attempt++, 6));
    retry = setTimeout(open, cap / 2 + Math.random() * cap / 2);
  };
  const ping = (socket: WebSocket) => {
    if (closed || ws !== socket || socket.readyState !== WebSocket.OPEN) return;
    clearTimeout(heartbeat);
    deadline = setTimeout(lost, DEAD_MS);
    try { socket.send("ping"); } catch { lost(); }
  };
  const open = () => {
    if (closed) return;
    clearTimeout(retry); retry = undefined;
    detach(); waiting();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let socket: WebSocket;
    try { socket = new WebSocket(`${proto}://${location.host}/api/repos/${repo}/factory`); }
    catch { lost(); return; }
    ws = socket;
    const current = () => !closed && ws === socket;
    // Covers a hung handshake and an open socket that never sends its snapshot.
    deadline = setTimeout(lost, DEAD_MS);
    socket.onmessage = (e) => {
      if (!current() || typeof e.data !== "string") return;
      if (e.data === "pong") {
        if (!synced) return;
        clearTimeout(deadline);
        heartbeat = setTimeout(() => ping(socket), HEARTBEAT_MS);
        return;
      }
      let value: unknown;
      try { value = JSON.parse(e.data); } catch { return; }
      const parsed = ServerToWeb.safeParse(value);
      if (!parsed.success) { console.warn("bad message from server", parsed.error); return; }
      const seq = (value as { seq?: unknown }).seq;
      if (seq !== undefined && (!Number.isSafeInteger(seq) || (seq as number) < 0)) return;
      const msg = parsed.data;
      if (!synced) {
        if (msg.type !== "snapshot") return;
        // A new socket explicitly requests a full snapshot via the upgrade. Equal
        // cursors are valid when no work happened during the interruption.
        if (typeof seq === "number" && seq < lastSeq) return;
        synced = true;
      } else if (msg.type === "snapshot" || (typeof seq === "number" && seq <= lastSeq)) return;
      if (typeof seq === "number") lastSeq = seq;
      clearTimeout(deadline); clearTimeout(heartbeat);
      onMessage(msg);
      if (!current()) return;
      if (msg.type === "snapshot") ready();
      if (current()) heartbeat = setTimeout(() => ping(socket), HEARTBEAT_MS);
    };
    socket.onclose = (event) => {
      if (!current()) return;
      socketDisconnected(repo, event?.code ?? 1006, event?.wasClean ?? false);
      lost();
    };
    socket.onerror = () => { if (current()) lost(); };
  };
  const resume = () => {
    if (closed || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    // Mobile browsers can leave readyState OPEN on a dead socket. Replacing it
    // also discards frames buffered while asleep before they can replay sounds.
    open();
  };
  if (typeof window !== "undefined") window.addEventListener("online", resume);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
  onStatus("connecting");
  open();

  return {
    send: (msg) => {
      if (!closed && synced && ws?.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(msg)); } catch { lost(); }
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      detach(); clearTimeout(retry); clearTimeout(noticeTimer);
      notice?.remove();
      if (typeof window !== "undefined") window.removeEventListener("online", resume);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
    },
  };
}
