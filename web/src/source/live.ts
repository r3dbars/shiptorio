import { DecisionOutbox, isDecision } from "./decision-outbox";
import { socketDisconnected, startTelemetry } from "../telemetry";
import { parseLiveMessage } from "./schemas";
import { createRecorder, mountRecorder, recordingAllowed } from "../deck2d/data/replay";
import type { Listener, Source, StatusListener } from "./config";

const HEARTBEAT_MS = 15_000;
// A cold authenticated upgrade can take ten seconds; snapshot/pong deadlines stay short.
const CONNECT_MS = 15_000;
const DEAD_MS = 5_000;
const NOTICE_MS = 3_000;

/** Signed out (expired or cleared session): the factory socket's upgrade is refused, so it never opens. */
export async function sessionGone(request: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await request("/api/me", { cache: "no-store" });
    if (response.status === 401) return true;
    if (!response.ok) return false;
    const account = await response.json() as { guest?: boolean; login?: unknown };
    return account.guest === true || typeof account.login !== "string" || !account.login;
  } catch { return false; } // offline or a server hiccup is not a sign-out: keep reconnecting
}

export function connectLive(repo: string, onMessage: Listener, onStatus: StatusListener, signedOut: () => Promise<boolean> = sessionGone): Source {
  startTelemetry();
  const recorder = typeof location !== "undefined" && typeof location.href === "string" && recordingAllowed(new URL(location.href)) ? createRecorder() : null;
  const removeRecorder = recorder ? mountRecorder(recorder) : () => {};
  let ws: WebSocket | null = null;
  let closed = false, synced = false, attempt = 0, lastSeq = -1;
  let openedAt = 0, openedOnline = true;
  // Upgrades refused in a row. Two means "ask who is here": a signed-out player gets a sign-in link, not an endless "Reconnecting…".
  let refused = 0, out = false;
  let sleeping = typeof document !== "undefined" && document.visibilityState === "hidden";
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let notice: HTMLElement | undefined;
  let decisionTimer: ReturnType<typeof setTimeout> | undefined;
  const warnDecision = (reason: "changed" | "unconfirmed") => onMessage({type:"log", level:"warn", text:reason === "unconfirmed" ? "That didn't go through. Check the card and try again." : "This card just changed. Take another look, then try again.", at:Date.now()});
  const outbox = new DecisionOutbox(warnDecision);
  const watchDecisions = () => {
    if (closed || !outbox.hasPending) { clearTimeout(decisionTimer); decisionTimer = undefined; return; }
    if (decisionTimer !== undefined) return;
    decisionTimer = setTimeout(() => {
      decisionTimer = undefined;
      outbox.expire();
      // A healthy heartbeat does not acknowledge a player decision. Ask for fresh
      // authoritative state before replaying the same bounded intent.
      if (outbox.hasPending && synced) lost();
      watchDecisions();
    }, 10_000);
  };
  const flushDecisions = () => {
    const socket = ws;
    if (closed || !synced || !socket || socket.readyState !== WebSocket.OPEN) return;
    try { outbox.flush(socket, message => socket.send(JSON.stringify(message))); } catch { lost(); }
  };

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
      document.body.appendChild(notice);
    }, NOTICE_MS);
  };
  const showSignedOut = () => {
    if (closed || typeof document === "undefined") return;
    out = true;
    detach(); clearTimeout(retry); retry = undefined; clearNotice();
    const link = document.createElement("a") as HTMLAnchorElement;
    link.setAttribute("role", "status");
    link.href = `/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    link.textContent = "You're signed out. Sign in again →";
    link.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:1000;padding:8px 12px;border-radius:6px;background:#1b2448;color:#f3d27a;font:13px monospace;text-decoration:underline";
    notice = link;
    document.body.appendChild(link);
    onStatus("offline");
  };
  const refusedUpgrade = () => {
    if (++refused % 2 !== 0) return;
    void signedOut().then(gone => { if (gone && !closed && !synced && !out) showSignedOut(); }, () => undefined);
  };
  const clearNotice = () => {
    clearTimeout(noticeTimer); noticeTimer = undefined;
    notice?.remove(); notice = undefined;
  };
  const ready = () => {
    clearNotice();
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
    if (closed || out) return;
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
    if (closed || out) return;
    clearTimeout(retry); retry = undefined;
    detach(); waiting();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let socket: WebSocket;
    loadMark("socket-start");
    try { socket = new WebSocket(`${proto}://${location.host}/api/repos/${repo}/factory`); }
    catch { lost(); return; }
    ws = socket;
    openedAt = Date.now();
    openedOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    const current = () => !closed && ws === socket;
    let opened = false;
    // Bound connection establishment separately from an opened socket missing its snapshot.
    deadline = setTimeout(lost, CONNECT_MS);
    socket.onopen = () => {
      if (!current() || synced) return;
      opened = true; refused = 0;
      loadMark("socket-open");
      clearTimeout(deadline);
      deadline = setTimeout(lost, DEAD_MS);
    };
    socket.onmessage = (e) => {
      if (!current() || typeof e.data !== "string") return;
      if (e.data === "pong") {
        if (!synced) return;
        clearTimeout(heartbeat);
        clearTimeout(deadline);
        heartbeat = setTimeout(() => ping(socket), HEARTBEAT_MS);
        return;
      }
      // Background frames are catch-up state, not a queue of sounds to play on wake.
      // The visible tab replaces this socket and receives one current snapshot.
      if (sleeping || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      let value: unknown;
      try { value = JSON.parse(e.data); } catch { return; }
      let parsed: ReturnType<typeof parseLiveMessage>;
      try { parsed = parseLiveMessage(value); }
      catch (error) { console.warn("bad message from server", error); return; }
      const { seq, ...msg } = parsed;
      if (!synced) {
        if (msg.type !== "snapshot") return;
        // A new socket explicitly requests a full snapshot via the upgrade. Equal
        // cursors are valid when no work happened during the interruption.
        if (typeof seq === "number" && seq < lastSeq) return;
        synced = true;
        loadMark("snapshot");
      } else if (msg.type === "snapshot" || (typeof seq === "number" && seq <= lastSeq)) return;
      if (typeof seq === "number") lastSeq = seq;
      clearTimeout(deadline); clearTimeout(heartbeat);
      // Record only validated, accepted messages, before local display substitutions.
      recorder?.record(msg);
      const local = (m: { id: string; title: string; plan?: string[] } | null | undefined) => { if (m?.id === "planner-rest" && m.plan?.[0] && m.title.startsWith("Planner is resting")) m.title = `Planner is resting until ${new Date(m.plan[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`; };
      if (msg.type === "snapshot") { msg.state.deck?.forEach(local); local(msg.state.move); }
      if (msg.type === "deck") msg.deck.forEach(local);
      if (msg.type === "move") local(msg.move);
      outbox.observe(msg);
      watchDecisions();
      onMessage(msg);
      if (!current()) return;
      if (msg.type === "snapshot") { ready(); flushDecisions(); }
      if (current()) heartbeat = setTimeout(() => ping(socket), HEARTBEAT_MS);
    };
    socket.onclose = (event) => {
      if (!current()) return;
      socketDisconnected(repo, event?.code ?? 1006, event?.wasClean ?? false);
      if (!opened) refusedUpgrade();
      lost();
    };
    socket.onerror = () => { if (!current()) return; if (!opened) refusedUpgrade(); lost(); };
  };
  const resume = () => {
    if (closed || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    // online and visibilitychange often arrive together. Keep the fresh handshake.
    if (!sleeping && ws && !synced && openedOnline && Date.now() - openedAt < 1000) return;
    // Mobile browsers can leave readyState OPEN on a dead socket. Replacing it
    // also discards frames buffered while asleep before they can replay sounds.
    // Count the three-second grace from the player's return, not time asleep.
    sleeping = false; out = false; refused = 0;
    clearNotice();
    open();
  };
  const visibility = () => {
    if (document.visibilityState === "hidden") { sleeping = true; clearNotice(); }
    else resume();
  };
  const offline = () => { openedOnline = false; };
  if (typeof window !== "undefined") {
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibility);
  onStatus("connecting");
  open();

  return {
    send: (msg) => {
      if (closed) return;
      if (isDecision(msg)) {
        if (outbox.replayable(msg)) { outbox.enqueue(msg); flushDecisions(); watchDecisions(); }
        else if (!outbox.knows(msg) || !synced || ws?.readyState !== WebSocket.OPEN) warnDecision("unconfirmed");
        else { try { ws.send(JSON.stringify(msg)); } catch { warnDecision("unconfirmed"); lost(); } }
        return;
      }
      if (!closed && synced && ws?.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(msg)); } catch { lost(); }
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      outbox.clear(); clearTimeout(decisionTimer);
      removeRecorder();
      detach(); clearTimeout(retry); clearNotice();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", resume);
        window.removeEventListener("offline", offline);
      }
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility);
    },
  };
}
import { loadMark } from "./load-marks";
