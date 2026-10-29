import { ServerToWeb } from "@shiptorio/shared";
import type { Source, Listener, StatusListener } from "../../source";

export interface DeckTrace {
  version: 1;
  provenance: "recorded-live" | "fixture";
  name: string;
  frames: { at: number; message: ServerToWeb }[];
}
export const MAX_TRACE_BYTES = 5_000_000;
const MAX_FRAMES = 10_000;
const GAP_MS = 2000;
const SECRET_KEY = /(?:token|password|secret|authorization|cookie|credential|private.?key|email)/i;

/** Defense in depth before anything leaves the browser. Never stores raw socket bytes. */
export function sanitizeTraceValue(value: unknown): unknown {
  if (typeof value === "string") return value
    .replace(/https?:\/\/[^\s<>"']+/gi, text => {
      try { const url = new URL(text); url.username = ""; url.password = ""; url.hash = ""; for (const key of [...url.searchParams.keys()]) if (SECRET_KEY.test(key) || /^(key|code|session|signature)$/i.test(key)) url.searchParams.delete(key); return url.href; }
      catch { return "[redacted URL]"; }
    })
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[redacted private key]")
    .replace(/\b(?:Bearer\s+\S+|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]+)\b/gi, "[redacted token]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/([?&](?:access_token|token|key|secret|code|session|signature)=)[^&#\s]*/gi, "$1[redacted]")
    .replace(/((?:api[ _-]?key|token|password|secret|cookie|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\b(?=[A-Za-z0-9_+/=-]{32,}\b)(?=[A-Za-z0-9_+/=-]*[A-Z])(?=[A-Za-z0-9_+/=-]*[a-z])(?=[A-Za-z0-9_+/=-]*\d)[A-Za-z0-9_+/=-]+\b/g, "[redacted opaque value]");
  if (Array.isArray(value)) return value.map(sanitizeTraceValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)).map(([key, v]) => [key, sanitizeTraceValue(v)]));
  return value;
}

export function parseTrace(value: unknown): DeckTrace {
  if (!value || typeof value !== "object") throw new Error("This is not a deck trace.");
  const input = value as Partial<DeckTrace>;
  if (input.version !== 1 || !["recorded-live", "fixture"].includes(input.provenance ?? "") || !Array.isArray(input.frames) || !input.frames.length || input.frames.length > MAX_FRAMES) throw new Error("Unsupported or empty deck trace.");
  let prior = -1;
  const frames = input.frames.map(frame => {
    if (!Number.isFinite(frame.at) || frame.at < 0 || frame.at < prior) throw new Error("Trace timestamps must stay in order.");
    prior = frame.at;
    return { at: frame.at, message: ServerToWeb.parse(sanitizeTraceValue(frame.message)) };
  });
  if (frames[0].message.type !== "snapshot") throw new Error("A trace must start with a factory snapshot.");
  return { version: 1, provenance: input.provenance!, name: String(input.name ?? "Factory replay").slice(0, 100), frames };
}

export function traceSchedule(trace: DeckTrace, speed = 1): DeckTrace["frames"] {
  const rate = [1, 2, 4].includes(speed) ? speed : 1;
  let time = 0;
  return trace.frames.map((frame, i) => {
    if (i) time += Math.min(GAP_MS, frame.at - trace.frames[i - 1].at) / rate;
    return { at: time, message: frame.message };
  });
}

export function createRecorder(now: () => number = Date.now) {
  const trace: DeckTrace = { version: 1, provenance: "recorded-live", name: "Recorded factory run", frames: [] };
  let started = 0, bytes = 0;
  return {
    record(message: ServerToWeb) {
      if ((!trace.frames.length && message.type !== "snapshot") || trace.frames.length >= MAX_FRAMES || bytes >= MAX_TRACE_BYTES) return;
      const clean = ServerToWeb.parse(sanitizeTraceValue(message));
      const size = JSON.stringify(clean).length;
      if (bytes + size > MAX_TRACE_BYTES) return;
      if (!trace.frames.length) started = now();
      trace.frames.push({ at: Math.max(trace.frames.at(-1)?.at ?? 0, now() - started), message: clean });
      bytes += size;
    },
    trace: () => structuredClone(trace),
  };
}

export function recordingAllowed(url: URL): boolean {
  return url.searchParams.get("record") === "1" && ["localhost", "127.0.0.1", "[::1]", "shiptorio.dev"].includes(url.hostname);
}

export function mountRecorder(recorder: ReturnType<typeof createRecorder>): () => void {
  if (typeof document === "undefined") return () => {};
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Save trace";
  button.title = "Download a sanitized recording of the received factory messages";
  button.style.cssText = "position:fixed;right:12px;top:12px;z-index:1100;padding:8px;background:#142030;color:#fff;border:1px solid #c99b48;font:14px monospace";
  button.onclick = () => {
    const trace = recorder.trace();
    if (!trace.frames.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "shiptorio-live-trace.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.body.appendChild(button);
  return () => button.remove();
}

export interface ReplayOptions {
  search?: string;
  fetch?: typeof fetch;
  timers?: { set(fn: () => void, delay: number): unknown; clear(id: unknown): void };
  /** Tests can omit the status tag and file-drop listeners. */
  ui?: boolean;
}

/** Read-only transport: the same validated messages go into the live deck's fold handler. */
export function connectReplay(onMessage: Listener, onStatus: StatusListener, options: ReplayOptions = {}): Source {
  const query = new URLSearchParams(options.search ?? location.search);
  const speed = Number(query.get("speed")) || 1;
  const timers = options.timers ?? { set: (fn, delay) => setTimeout(fn, delay), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>) };
  let closed = false, generation = 0;
  const pending = new Set<unknown>();
  const clear = () => { generation++; for (const id of pending) timers.clear(id); pending.clear(); };
  // The page also owns connection controls outside DeckSource. Block activation there too.
  // Wheel zoom and file drop remain available; a replay never opens a live action flow.
  const blockActivation = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const blockKey = (event: KeyboardEvent) => { if (["Enter", " "].includes(event.key)) blockActivation(event); };
  const guarded = options.ui !== false && typeof document !== "undefined";
  if (guarded) {
    document.addEventListener("click", blockActivation, true);
    document.addEventListener("pointerdown", blockActivation, true);
    document.addEventListener("pointerup", blockActivation, true);
    document.addEventListener("keydown", blockKey, true);
  }
  const tag = options.ui === false || typeof document === "undefined" ? null : document.createElement("div");
  if (tag) {
    tag.setAttribute("role", "status");
    tag.style.cssText = "position:fixed;top:12px;left:12px;z-index:1100;padding:6px 10px;background:#142030;color:#fff;border:1px solid #c99b48;font:14px monospace;pointer-events:none";
    tag.textContent = "Replay · loading trace";
    document.body.appendChild(tag);
  }
  const play = (raw: unknown) => {
    if (closed) return;
    const trace = parseTrace(raw);
    clear(); onStatus("live");
    if (tag) tag.textContent = `${trace.provenance === "fixture" ? "Replay · fixture sample" : "Replay · recorded live"} · ${[1, 2, 4].includes(speed) ? speed : 1}×`;
    for (const frame of traceSchedule(trace, speed)) {
      if (frame.at === 0) { onMessage(frame.message); continue; }
      let id: unknown;
      id = timers.set(() => { pending.delete(id); if (!closed) onMessage(frame.message); }, frame.at);
      pending.add(id);
    }
  };
  const failed = () => { if (!closed) { onStatus("offline"); if (tag) tag.textContent = "Replay · could not read trace. Drop a valid trace JSON to try again."; } };
  const loadText = (text: string) => { if (text.length > MAX_TRACE_BYTES) throw new Error("Trace is too large."); play(JSON.parse(text)); };
  const drag = (event: DragEvent) => { event.preventDefault(); };
  const drop = (event: DragEvent) => {
    event.preventDefault(); const file = event.dataTransfer?.files[0]; if (!file) return;
    clear(); const current = generation;
    if (file.size > MAX_TRACE_BYTES) { failed(); return; }
    file.text().then(text => { if (!closed && current === generation) loadText(text); }).catch(failed);
  };
  if (tag) { document.addEventListener("dragover", drag); document.addEventListener("drop", drop); }
  onStatus("connecting");
  const name = query.get("trace");
  if (!name) { if (tag) tag.textContent = "Replay · drop a trace JSON here"; }
  else if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name)) failed();
  else {
    const current = generation;
    (options.fetch ?? fetch)(`/deck/traces/${name}.json`, { credentials: "omit", cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Trace unavailable."); return response.text(); })
      .then(text => { if (!closed && current === generation) loadText(text); }).catch(failed);
  }
  return {
    send() { /* Replay can never dispatch, approve, defer, or merge anything. */ },
    close() { closed = true; clear(); tag?.remove();
      if (guarded) {
        document.removeEventListener("click", blockActivation, true);
        document.removeEventListener("pointerdown", blockActivation, true);
        document.removeEventListener("pointerup", blockActivation, true);
        document.removeEventListener("keydown", blockKey, true);
      }
      if (tag) { document.removeEventListener("dragover", drag); document.removeEventListener("drop", drop); } },
  };
}
