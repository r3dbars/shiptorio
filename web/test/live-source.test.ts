import { describe, expect, it } from "bun:test";
import type { ServerToWeb } from "@shiptorio/shared";
import { FactoryState } from "@shiptorio/shared";
import { connectLive } from "../src/source/live";

// Run the real transport against a controllable network/clock. No browser sessions,
// factory jobs or real timers escape a test, including when an assertion throws.
function transportTest(run: (h: ReturnType<typeof harness>) => void) {
  const h = harness();
  try { run(h); } finally { h.restore(); }
}
function harness() {
  const keys = ["WebSocket", "location", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "window", "document"] as const;
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let now = 0, nextId = 0;
  const dateNow = Date.now; Date.now = () => now;
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
  const win = new EventTarget();
  const notices = new Set<unknown>();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible", body: { appendChild(el: unknown) { notices.add(el); } }, createElement: () => { const el = { setAttribute() {}, textContent: "", style: { cssText: "" }, remove() { notices.delete(el); } }; return el; } });
  const values = { window: win, document: doc, WebSocket: Socket, location: { protocol: "https:", host: "shiptorio.com" }, setTimeout: (run: () => void, delay: number) => schedule(run, delay), clearTimeout: clear, setInterval: (run: () => void, delay: number) => schedule(run, delay, true), clearInterval: clear };
  for (const key of keys) Object.defineProperty(globalThis, key, { value: values[key], writable: true, configurable: true });
  const messages: ServerToWeb[] = [], statuses: string[] = [];
  return {
    sockets, tasks, messages, statuses, win, doc, notices,
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
      Date.now = dateNow;
      for (const key of keys) {
        const descriptor = descriptors.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
const snapshot = JSON.stringify({ type: "snapshot", seq: 0, state: FactoryState.parse({ repo: "r3dbars/shiptorio", baseBranch: "main", districts: [], machines: [], belts: [], power: [], items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 }) });
const { seq: _seq, ...snapshotMessage } = JSON.parse(snapshot);
const sync = (socket: { message(data: unknown): void }) => socket.message(snapshot);
const log = JSON.stringify({ type: "log", level: "info", text: "Current factory", at: 1 });

describe("live factory source lifecycle", () => {
  it("cancels a pending retry when disposed after an unexpected disconnect", () => transportTest(h => {
    const source = h.connect();
    expect(h.sockets[0].url).toBe("wss://shiptorio.com/api/repos/r3dbars/shiptorio/factory");
    h.sockets[0].open(); sync(h.sockets[0]);
    const oldClose = h.sockets[0].onclose!;
    h.sockets[0].close();
    oldClose(); // duplicate network event must not queue a second reconnect
    expect(h.statuses).toEqual(["connecting", "live"]);
    expect(h.tasks.size).toBe(2);
    source.close(); source.close();
    h.advance(90_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.tasks.size).toBe(0);
    expect(h.statuses).toEqual(["connecting", "live"]);
  }));

  it("clears heartbeats and delivers no late messages or statuses after disposal", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0];
    const lateOpen = (socket.onopen ?? (() => {})), lateMessage = socket.onmessage!, lateClose = socket.onclose!;
    socket.open(); sync(socket); socket.message(log);
    expect(h.messages).toHaveLength(2);
    source.close();
    lateOpen(); lateMessage({ data: log }); lateClose();
    source.send({ type: "set_goal", text: "Must not send" });
    h.advance(90_000);
    expect(socket.closeCalls).toBe(1);
    expect(socket.sent).toEqual([]);
    expect(h.messages).toHaveLength(2);
    expect(h.statuses).toEqual(["connecting", "live"]);
    expect(h.tasks.size).toBe(0);
    expect(h.sockets).toHaveLength(1);
  }));

  it("ignores stale old-socket callbacks without changing the new connection heartbeat", () => transportTest(h => {
    const source = h.connect(), old = h.sockets[0];
    const lateOpen = (old.onopen ?? (() => {})), lateMessage = old.onmessage!, lateClose = old.onclose!;
    old.open(); sync(old); old.close();
    h.advance(3000);
    expect(h.sockets).toHaveLength(2);
    const current = h.sockets[1];
    current.open(); sync(current); current.message(log);
    lateOpen(); lateMessage({ data: log }); lateClose();
    h.advance(15_000);
    expect(h.statuses).toEqual(["connecting", "live", "live"]);
    expect(h.messages).toHaveLength(3);
    expect(old.sent).toEqual([]);
    expect(current.sent).toEqual(["ping"]);
    expect(h.sockets).toHaveLength(2);
    source.close();
  }));

  it("isolates malformed JSON, nontext frames and invalid protocol data, then accepts a valid frame", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0];
    socket.open(); sync(socket);
    const originalWarn = console.warn;
    let warnings = 0;
    console.warn = () => { warnings++; };
    try {
      expect(() => socket.message("{broken")).not.toThrow();
      expect(() => socket.message(new Uint8Array([1, 2]))).not.toThrow();
      socket.message("null");
      socket.message(JSON.stringify({ type: "not-a-factory-message" }));
      socket.message(JSON.stringify({ type: "log", level: "info", text: "Missing timestamp" }));
      expect(h.messages).toEqual([snapshotMessage]);
      expect(warnings).toBe(3);
      socket.message(log);
      expect(h.messages).toEqual([snapshotMessage, JSON.parse(log)]);
      expect(h.statuses).toEqual(["connecting", "live"]);
    } finally { console.warn = originalWarn; source.close(); }
  }));

  it("sends commands only on the active open socket", () => transportTest(h => {
    const source = h.connect();
    const command = { type: "set_goal", text: "Ship something verified" } as const;
    source.send(command);
    expect(h.sockets[0].sent).toEqual([]);
    h.sockets[0].open(); sync(h.sockets[0]); source.send(command);
    expect(h.sockets[0].sent).toEqual([JSON.stringify(command)]);
    h.sockets[0].close(); source.send(command);
    h.advance(3000); h.sockets[1].open(); sync(h.sockets[1]); source.send(command);
    expect(h.sockets[1].sent).toEqual([JSON.stringify(command)]);
    source.close(); source.send(command);
    expect(h.sockets[1].sent).toEqual([JSON.stringify(command)]);
  }));

  it("does not start a heartbeat when a status listener disposes the source", () => transportTest(h => {
    let source: ReturnType<typeof connectLive>;
    source = h.connect(status => { h.statuses.push(status); if (status === "live") source.close(); });
    h.sockets[0].open(); sync(h.sockets[0]);
    expect(h.tasks.size).toBe(0);
    h.advance(90_000);
    expect(h.statuses).toEqual(["connecting", "live"]);
    expect(h.sockets).toHaveLength(1);
  }));
});


describe("quiet resync", () => {
  it("waits for one snapshot, fences stale sequences, and never repeats catch-up frames", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0];
    socket.open(); socket.message(log);
    expect(h.messages).toHaveLength(0);
    expect(h.statuses).toEqual(["connecting"]);
    sync(socket);
    const event = (seq: number) => JSON.stringify({ ...JSON.parse(log), seq });
    socket.message(event(2)); socket.message(event(2)); socket.message(event(1)); sync(socket);
    expect(h.messages).toHaveLength(2);
    h.win.dispatchEvent(new Event("online"));
    const current = h.sockets[1]; current.open();
    current.message(event(3)); // pre-snapshot frame must never replay
    current.message(JSON.stringify({ ...JSON.parse(snapshot), seq: 1 }));
    expect(h.messages).toHaveLength(2);
    current.message(JSON.stringify({ ...JSON.parse(snapshot), seq: 3 }));
    current.message(event(2)); current.message(event(3)); current.message(event(4));
    expect(h.messages).toHaveLength(4);
    source.close();
  }));
  it("replaces a dead OPEN socket immediately on visibility and online, and removes listeners on close", () => transportTest(h => {
    const source = h.connect(); sync(h.sockets[0]);
    h.doc.visibilityState = "hidden"; h.doc.dispatchEvent(new Event("visibilitychange"));
    expect(h.sockets).toHaveLength(1);
    h.doc.visibilityState = "visible"; h.doc.dispatchEvent(new Event("visibilitychange"));
    expect(h.sockets).toHaveLength(2);
    expect(h.sockets[0].closeCalls).toBe(1);
    source.close(); h.win.dispatchEvent(new Event("online")); h.doc.dispatchEvent(new Event("visibilitychange"));
    h.advance(100_000);
    expect(h.sockets).toHaveLength(2); expect(h.tasks.size).toBe(0);
  }));
  it("requires a heartbeat response and retries silently with bounded jitter", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0]; socket.open(); sync(socket);
    h.advance(15_000); expect(socket.sent).toEqual(["ping"]);
    socket.message("pong"); h.advance(15_000); expect(socket.sent).toEqual(["ping", "ping"]);
    h.advance(5_000); expect(socket.closeCalls).toBe(1);
    h.advance(250); expect(h.sockets).toHaveLength(2);
    expect(h.statuses).toEqual(["connecting", "live"]);
    source.close();
  }));
  for (const delay of [6000, 10000]) it(`accepts a legitimate ${delay}ms cold handshake without restarting it`, () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0];
    h.advance(delay);
    expect(h.sockets).toHaveLength(1); expect(socket.closeCalls).toBe(0);
    expect(h.notices.size).toBe(1); expect(h.statuses).toEqual(["connecting"]);
    socket.open(); sync(socket);
    expect(h.messages).toHaveLength(1); expect(h.statuses).toEqual(["connecting", "live"]);
    expect(h.notices.size).toBe(0); source.close();
  }));
  it("closes and retries a handshake still hung at fifteen seconds", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0]; h.advance(14_999);
    expect(socket.closeCalls).toBe(0); expect(h.sockets).toHaveLength(1);
    h.advance(251);
    expect(socket.closeCalls).toBe(1); expect(h.sockets).toHaveLength(2);
    expect(h.messages).toHaveLength(0); source.close();
  }));
  it("keeps a five-second first-snapshot bound after a slow successful upgrade", () => transportTest(h => {
    const source = h.connect(), socket = h.sockets[0]; h.advance(10_000); socket.open();
    h.advance(4000); socket.message("pong"); // A heartbeat cannot substitute for the first snapshot.
    h.advance(999); expect(socket.closeCalls).toBe(0);
    h.advance(1); expect(socket.closeCalls).toBe(1);
    h.advance(250); expect(h.sockets).toHaveLength(2);
    expect(h.messages).toHaveLength(0); source.close();
  }));
  it("retries rejected or closed handshakes immediately instead of waiting for cold grace", () => transportTest(h => {
    const source = h.connect(), rejected = h.sockets[0];
    (rejected as any).onerror();
    expect(rejected.closeCalls).toBe(1);
    h.advance(250); expect(h.sockets).toHaveLength(2);
    h.sockets[1].close(); h.advance(500);
    expect(h.sockets).toHaveLength(3); source.close();
  }));
});


it("coalesces simultaneous return signals but replaces a handshake that crossed an outage", () => transportTest(h => {
  const source = h.connect(); h.sockets[0].open(); sync(h.sockets[0]);
  h.win.dispatchEvent(new Event("online"));
  h.doc.dispatchEvent(new Event("visibilitychange"));
  expect(h.sockets).toHaveLength(2);
  h.win.dispatchEvent(new Event("offline"));
  h.win.dispatchEvent(new Event("online"));
  expect(h.sockets).toHaveLength(3);
  source.close();
}));


it("drops gameplay frames while hidden instead of queuing old sounds for wake", () => transportTest(h => {
  const source = h.connect(); h.sockets[0].open(); sync(h.sockets[0]);
  h.doc.visibilityState = "hidden"; h.doc.dispatchEvent(new Event("visibilitychange"));
  h.sockets[0].message(JSON.stringify({ ...JSON.parse(log), seq: 4 }));
  expect(h.messages).toHaveLength(1);
  h.doc.visibilityState = "visible";
  h.sockets[0].message(JSON.stringify({ ...JSON.parse(log), seq: 4 })); // queued before visibility callback
  expect(h.messages).toHaveLength(1);
  h.doc.dispatchEvent(new Event("visibilitychange"));
  h.sockets[1].open(); h.sockets[1].message(JSON.stringify({ ...JSON.parse(snapshot), seq: 4 }));
  expect(h.messages).toHaveLength(2);
  source.close();
}));


it("gives a returning tab a fresh three-second notice grace and never flashes on a 1s blip", () => transportTest(h => {
  const source = h.connect(); h.sockets[0].open(); sync(h.sockets[0]);
  h.sockets[0].close(); h.advance(1000);
  expect(h.notices.size).toBe(0);
  h.sockets[1].open(); sync(h.sockets[1]); h.advance(3001);
  expect(h.notices.size).toBe(0);
  h.sockets[1].close(); h.advance(3001);
  expect(h.notices.size).toBe(1);
  h.doc.visibilityState = "visible"; h.doc.dispatchEvent(new Event("visibilitychange"));
  expect(h.notices.size).toBe(0);
  const socket = h.sockets.at(-1)!; socket.open(); sync(socket);
  h.advance(3001); expect(h.notices.size).toBe(0);
  source.close(); expect(h.tasks.size).toBe(0);
}));

const decisionCard = (head = "a") => ({ id: "plan-1", title: "Approve this plan", why: "Scoped", itemId: "gh-1", createdAt: 1,
  plan: [`Base ${head}`], options: [{id:"approve",label:"Approve",recommended:true,actions:[{tool:"approve_runner_job",args:{jobId:`job-${head}`},reason:"Exact plan"}]}] });
const decisionSnapshot = (head = "a", seq = 0) => JSON.stringify({ ...JSON.parse(snapshot), seq, state: {...snapshotMessage.state, move:decisionCard(head), deck:[decisionCard(head)]} });
it("retains an offline tap and sends it only after a fresh matching snapshot", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot()); first.close();
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  h.advance(300); const fresh = h.sockets[1]; fresh.open();
  expect(fresh.sent).toEqual([]);
  fresh.message(decisionSnapshot());
  expect(fresh.sent).toEqual([JSON.stringify({type:"choose_move",moveId:"plan-1",optionId:"approve"})]);
  source.close();
}));
it("replays an unacknowledged tap once per connection but never replays changed plan authority", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot());
  const tap = {type:"choose_move" as const,moveId:"plan-1",optionId:"approve"};
  source.send(tap); source.send(tap); expect(first.sent).toHaveLength(1);
  first.close(); h.advance(300); const fresh = h.sockets[1]; fresh.open(); fresh.message(decisionSnapshot("b"));
  expect(fresh.sent).toEqual([]); source.close();
}));
it("authoritative resolution clears pending decisions and disposal cannot send them for another player", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot());
  source.send({type:"defer_move",moveId:"plan-1"});
  first.message(JSON.stringify({type:"deck",deck:[],seq:1}));
  first.close(); h.advance(300); const fresh = h.sockets[1]; fresh.open(); fresh.message(decisionSnapshot("a",2));
  expect(fresh.sent).toEqual([]);
  source.close(); source.send({type:"dismiss_move",moveId:"plan-1",why:"once"});
  h.win.dispatchEvent(new Event("online")); expect(h.sockets).toHaveLength(2);
}));
it("keeps a tap when send throws between readiness and socket transmission", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot());
  first.send = () => { throw new Error("network disappeared"); };
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  h.advance(300); const fresh = h.sockets[1]; fresh.open(); expect(fresh.sent).toEqual([]);
  fresh.message(decisionSnapshot()); expect(fresh.sent).toHaveLength(1); source.close();
}));
it("an explicit resolution acknowledges the intent even if the same card is offered again", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot());
  source.send({type:"dismiss_move",moveId:"plan-1",why:"once"});
  first.message(JSON.stringify({type:"move_resolved",moveId:"plan-1",actor:"player",seq:1}));
  first.close(); h.advance(300); const fresh = h.sockets[1]; fresh.open(); fresh.message(decisionSnapshot("a",2));
  expect(fresh.sent).toEqual([]); source.close();
}));
it("changed tool scope under the same card and option ID requires a fresh player choice", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot()); first.close();
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  const changed = JSON.parse(decisionSnapshot());
  changed.state.deck[0].options[0].actions[0].args.headSha = "new-head";
  h.advance(300); const fresh = h.sockets[1]; fresh.open(); fresh.message(JSON.stringify(changed));
  expect(fresh.sent).toEqual([]);
  expect(h.messages.at(-2)).toMatchObject({type:"log",level:"warn",text:expect.stringContaining("card just changed")});
  source.close();
}));
it("Later survives reconnect but unrelated machine writes are not replayed", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot()); first.close();
  source.send({type:"defer_move",moveId:"plan-1"}); source.send({type:"set_goal",text:"not replayable"});
  h.advance(300); const fresh = h.sockets[1]; fresh.open(); fresh.message(decisionSnapshot());
  expect(fresh.sent).toHaveLength(1);
  expect(JSON.parse(fresh.sent[0])).toMatchObject({type:"defer_move",moveId:"plan-1",intentId:expect.stringMatching(/^[a-f0-9-]{36}$/)}); source.close();
}));
it("pong cannot hide an unacknowledged decision; replay is bounded and visibly asks for retry", () => transportTest(h => {
  const source = h.connect(), first = h.sockets[0]; first.open(); first.message(decisionSnapshot());
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  for (let attempt = 0; attempt < 2; attempt++) {
    h.sockets.at(-1)!.message("pong"); h.advance(10_300);
    const fresh = h.sockets.at(-1)!; expect(fresh).not.toBe(first);
    fresh.open(); fresh.message(decisionSnapshot()); expect(fresh.sent).toHaveLength(1);
  }
  h.sockets.at(-1)!.message("pong"); h.advance(10_001);
  expect(h.messages).toContainEqual(expect.objectContaining({type:"log",level:"warn",text:expect.stringContaining("didn't go through")}));
  expect(h.sockets.reduce((n,s) => n+s.sent.filter(raw=>raw.includes('"choose_move"')).length,0)).toBe(3);
  source.close(); expect(h.tasks.size).toBe(0);
}));
it("same-card Launch cannot replay across a changed PR head", () => transportTest(h => {
  const launch = JSON.parse(decisionSnapshot());
  launch.state.deck[0].options[0].actions = [{tool:"request_merge",args:{headSha:"a"},reason:"Launch this exact revision"}];
  const source = h.connect(), first=h.sockets[0];first.open();first.message(JSON.stringify(launch));first.close();
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  launch.state.deck[0].options[0].actions[0].args.headSha = "b";
  h.advance(300);const fresh=h.sockets[1];fresh.open();fresh.message(JSON.stringify(launch));
  expect(fresh.sent).toEqual([]);source.close();
}));
it("offline intents expire rather than approving unexpectedly much later", () => transportTest(h => {
  const source=h.connect(), first=h.sockets[0];first.open();first.message(decisionSnapshot());first.close();
  source.send({type:"defer_move",moveId:"plan-1"}); h.advance(60_001);
  expect(h.messages).toContainEqual(expect.objectContaining({type:"log",text:expect.stringContaining("didn't go through")}));
  const fresh=h.sockets.at(-1)!;fresh.open();fresh.message(decisionSnapshot());expect(fresh.sent).toEqual([]);source.close();
}));
it("never queues a card or option that this source has not received", () => transportTest(h => {
  const source=h.connect(), first=h.sockets[0];
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  first.open();first.message(decisionSnapshot());expect(first.sent).toEqual([]);
  source.send({type:"choose_move",moveId:"plan-1",optionId:"forged"});expect(first.sent).toEqual([]);source.close();
}));
it("a persistent inspect card is sent once online without false acknowledgement retries", () => transportTest(h => {
  const state=JSON.parse(decisionSnapshot());state.state.deck[0].options[0].actions=[{tool:"inspect_bottleneck",args:{stage:"inspect"},reason:"Read the queue"}];
  const source=h.connect(),first=h.sockets[0];first.open();first.message(JSON.stringify(state));
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  for(let n=0;n<4;n++){h.advance(14_000);first.message("pong");}
  expect(h.sockets).toHaveLength(1);
  expect(first.sent.filter(raw=>raw.includes('"choose_move"'))).toHaveLength(1);
  expect(h.messages.some(msg=>msg.type==="log" && msg.level==="warn")).toBe(false);
  source.close();
}));
it("offline nonreplayable choices request an explicit retry and never run after reconnect", () => transportTest(h => {
  const state=JSON.parse(decisionSnapshot());state.state.deck[0].options[0].actions=[{tool:"run_missing_check",args:{headSha:"a"},reason:"Queue a check"}];
  const source=h.connect(),first=h.sockets[0];first.open();first.message(JSON.stringify(state));first.close();
  source.send({type:"choose_move",moveId:"plan-1",optionId:"approve"});
  expect(h.messages.at(-1)).toMatchObject({type:"log",level:"warn",text:expect.stringContaining("didn't go through")});
  h.advance(300);const fresh=h.sockets[1];fresh.open();fresh.message(JSON.stringify(state));expect(fresh.sent).toEqual([]);source.close();
}));

it("Later reuses one correlation ID after ack loss; a fresh later tap gets a new ID", () => transportTest(h => {
  const source=h.connect(),first=h.sockets[0];first.open();first.message(decisionSnapshot());
  source.send({type:"defer_move",moveId:"plan-1"});source.send({type:"defer_move",moveId:"plan-1"});
  expect(first.sent).toHaveLength(1);const original=JSON.parse(first.sent[0]);expect(original.intentId).toMatch(/^[a-f0-9-]{36}$/);
  first.close();h.advance(300);const fresh=h.sockets[1];fresh.open();fresh.message(decisionSnapshot());
  expect(JSON.parse(fresh.sent[0])).toEqual(original);
  fresh.message(JSON.stringify({type:"deck",deck:[],seq:1}));
  fresh.message(JSON.stringify({type:"deck",deck:[decisionCard()],seq:2}));
  source.send({type:"defer_move",moveId:"plan-1"});
  expect(JSON.parse(fresh.sent[1]).intentId).not.toBe(original.intentId);source.close();
}));
