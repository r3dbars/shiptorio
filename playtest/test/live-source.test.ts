import { describe, expect, it } from "bun:test";
import type { ServerToWeb } from "../../shared/src";
import { connectLive } from "../../web/src/source/live";

// Run the real transport against a controllable network/clock. No browser sessions,
// factory jobs or real timers escape a test, including when an assertion throws.
function transportTest(run: (h: ReturnType<typeof harness>) => void) {
  const h = harness();
  try { run(h); } finally { h.restore(); }
}
function harness() {
  const keys = ["WebSocket", "location", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] as const;
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let now = 0, nextId = 0;
  const tasks = new Map<number, { at: number; every?: number; run: () => void }>();
  const schedule = (run: () => void, delay: number, repeat = false) => { const id = ++nextId; tasks.set(id, { at: now + delay, every: repeat ? delay : undefined, run }); return id; };
  const clear = (id: number) => { tasks.delete(id); };
  const sockets: Socket[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    sent: string[] = [];
    closeCalls = 0;
    constructor(readonly url: string) { sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    send(data: string) { if (this.readyState !== 1) throw new Error("Socket is not open"); this.sent.push(data); }
    message(data: unknown) { this.onmessage?.({ data }); }
    close() { this.closeCalls++; this.readyState = 3; this.onclose?.(); }
  }
  const values = { WebSocket: Socket, location: { protocol: "https:", host: "shiptorio.com" }, setTimeout: (run: () => void, delay: number) => schedule(run, delay), clearTimeout: clear, setInterval: (run: () => void, delay: number) => schedule(run, delay, true), clearInterval: clear };
  for (const key of keys) Object.defineProperty(globalThis, key, { value: values[key], writable: true, configurable: true });
  const messages: ServerToWeb[] = [], statuses: string[] = [];
  return {
    sockets, tasks, messages, statuses,
    connect: (onStatus: (status: string) => void = status => statuses.push(status)) => connectLive("r3dbars/shiptorio", msg => messages.push(msg), onStatus),
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const next = [...tasks.entries()].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, task] = next;
        now = task.at;
        if (task.every) task.at += task.every; else tasks.delete(id);
        task.run();
      }
      now = until;
    },
    restore() {
      for (const key of keys) {
        const descriptor = descriptors.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
const log = JSON.stringify({ type: "log", level: "info", text: "Current factory", at: 1 });

describe("live factory source lifecycle", () => {
  it("cancels a pending retry when disposed after an unexpected disconnect", () => transportTest(h => {
    const source = h.connect();
    expect(h.sockets[0].url).toBe("wss://shiptorio.com/api/repos/r3dbars/shiptorio/factory");
    h.sockets[0].open();
    const oldClose = h.sockets[0].onclose!;
    h.sockets[0].close();
    oldClose(); // duplicate network event must not queue a second reconnect
    expect(h.statuses).toEqual(["connecting", "live", "offline"]);
    expect(h.tasks.size).toBe(1);
    source.close(); source.close();
    h.advance(90_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.tasks.size).toBe(0);
    expect(h.statuses).toEqual(["connecting", "live", "offline"]);
  }));

  it("clears heartbeats and delivers no late messages or statuses after disposal", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0];
    const lateOpen = socket.onopen!, lateMessage = socket.onmessage!, lateClose = socket.onclose!;
    socket.open(); socket.message(log);
    expect(h.messages).toHaveLength(1);
    source.close();
    lateOpen(); lateMessage({ data: log }); lateClose();
    source.send({ type: "set_goal", text: "Must not send" });
    h.advance(90_000);
    expect(socket.closeCalls).toBe(1);
    expect(socket.sent).toEqual([]);
    expect(h.messages).toHaveLength(1);
    expect(h.statuses).toEqual(["connecting", "live"]);
    expect(h.tasks.size).toBe(0);
    expect(h.sockets).toHaveLength(1);
  }));

  it("ignores stale old-socket callbacks without changing the new connection heartbeat", () => transportTest(h => {
    const source = h.connect(), old = h.sockets[0];
    const lateOpen = old.onopen!, lateMessage = old.onmessage!, lateClose = old.onclose!;
    old.open(); old.close();
    h.advance(3000);
    expect(h.sockets).toHaveLength(2);
    const current = h.sockets[1];
    current.open(); current.message(log);
    lateOpen(); lateMessage({ data: log }); lateClose();
    h.advance(30_000);
    expect(h.statuses).toEqual(["connecting", "live", "offline", "connecting", "live"]);
    expect(h.messages).toHaveLength(1);
    expect(old.sent).toEqual([]);
    expect(current.sent).toEqual(["ping"]);
    expect(h.sockets).toHaveLength(2);
    source.close();
  }));

  it("isolates malformed JSON, nontext frames and invalid protocol data, then accepts a valid frame", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0];
    socket.open();
    const originalWarn = console.warn;
    let warnings = 0;
    console.warn = () => { warnings++; };
    try {
      expect(() => socket.message("{broken")).not.toThrow();
      expect(() => socket.message(new Uint8Array([1, 2]))).not.toThrow();
      socket.message("null");
      socket.message(JSON.stringify({ type: "not-a-factory-message" }));
      socket.message(JSON.stringify({ type: "log", level: "info", text: "Missing timestamp" }));
      expect(h.messages).toEqual([]);
      expect(warnings).toBe(3);
      socket.message(log);
      expect(h.messages).toEqual([JSON.parse(log)]);
      expect(h.statuses).toEqual(["connecting", "live"]);
    } finally { console.warn = originalWarn; source.close(); }
  }));

  it("sends commands only on the active open socket", () => transportTest(h => {
    const source = h.connect();
    const command = { type: "set_goal", text: "Ship something verified" } as const;
    source.send(command);
    expect(h.sockets[0].sent).toEqual([]);
    h.sockets[0].open(); source.send(command);
    expect(h.sockets[0].sent).toEqual([JSON.stringify(command)]);
    h.sockets[0].close(); source.send(command);
    h.advance(3000); h.sockets[1].open(); source.send(command);
    expect(h.sockets[1].sent).toEqual([JSON.stringify(command)]);
    source.close(); source.send(command);
    expect(h.sockets[1].sent).toEqual([JSON.stringify(command)]);
  }));

  it("does not start a heartbeat when a status listener disposes the source", () => transportTest(h => {
    let source: ReturnType<typeof connectLive>;
    source = h.connect(status => { h.statuses.push(status); if (status === "live") source.close(); });
    h.sockets[0].open();
    expect(h.tasks.size).toBe(0);
    h.advance(90_000);
    expect(h.statuses).toEqual(["connecting", "live"]);
    expect(h.sockets).toHaveLength(1);
  }));
});
