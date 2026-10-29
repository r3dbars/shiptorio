import { expect, test } from "bun:test";
import type { ServerToWeb } from "@shiptorio/shared";
import { connectReplay, createRecorder, parseTrace, recordingAllowed, sanitizeTraceValue, traceSchedule } from "../src/deck2d/data/replay";
import { createLiveSource } from "../src/deck2d/data/source";
import fixture from "./fixtures/traces/testing-16-sample.json";

const sample = () => parseTrace(fixture);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function clock() {
  let id = 0;
  const queue = new Map<number, { fn: () => void; at: number }>();
  return {
    timers: { set(fn: () => void, at: number) { queue.set(++id, { fn, at }); return id; }, clear(id: unknown) { queue.delete(id as number); } },
    advance(to: number) { for (const [id, job] of [...queue].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])) if (job.at <= to) { queue.delete(id); job.fn(); } },
    pending: () => queue.size,
  };
}

test("trace validation preserves protocol order and rejects unordered or missing initial state", () => {
  expect(sample().provenance).toBe("fixture");
  expect(() => parseTrace({ ...fixture, frames: fixture.frames.slice(1) })).toThrow("snapshot");
  expect(() => parseTrace({ ...fixture, frames: [fixture.frames[0], { ...fixture.frames[1], at: -1 }] })).toThrow("order");
  expect(() => parseTrace({ ...fixture, frames: [{ at: 0, message: { type: "choose_move" } }] })).toThrow();
});

test("speed and idle-gap compression are deterministic, including equal-time messages", () => {
  const normal = traceSchedule(sample(), 1), fast = traceSchedule(sample(), 4);
  expect(normal.every((f, i) => i === 0 || f.at - normal[i - 1].at <= 2000)).toBe(true);
  expect(fast.map(f => f.at)).toEqual(normal.map(f => f.at / 4));
  expect(traceSchedule(sample(), 3)).toEqual(normal);
  expect(normal[3].at).toBe(normal[4].at);
});

test("replay transport performs one read and never writes when sent player actions", async () => {
  const c = clock(), messages: ServerToWeb[] = [], requests: { path: string; method?: string }[] = [];
  const source = connectReplay(m => messages.push(m), () => {}, { ui: false, search: "?trace=testing-16-sample&speed=2", timers: c.timers,
    fetch: (async (path, init) => { requests.push({ path: String(path), method: init?.method }); return Response.json(fixture); }) as typeof fetch });
  await flush();
  source.send({ type: "choose_move", moveId: "ship-27", optionId: "continue" });
  source.send({ type: "launch_pr", itemId: "gh-16" });
  c.advance(Infinity);
  expect(messages).toEqual(sample().frames.map(f => f.message));
  expect(requests).toEqual([{ path: "/deck/traces/testing-16-sample.json", method: undefined }]);
  source.close(); expect(c.pending()).toBe(0);
});

test("live deck folding replays one identity through the issue to launched PR without sending a decision", async () => {
  const c = clock();
  const source = createLiveSource({ kind: "sim", repo: "", scenario: "quiet-morning" }, { replay: { ui: false, search: "?trace=testing-16-sample", timers: c.timers, fetch: (async () => Response.json(fixture)) as typeof fetch } });
  await flush();
  expect(source.state()?.items[0].id).toBe("gh-16");
  c.advance(4000);
  const before = source.state();
  source.approve("plan-16"); source.later("plan-16");
  expect(source.state()).toBe(before);
  c.advance(Infinity);
  expect(source.state()?.items).toHaveLength(1);
  expect(source.state()?.items[0]).toMatchObject({ id: "gh-16", state: "launched", prNumber: 27 });
  expect(source.state()?.metrics?.rockets).toBe(1);
  source.close();
});

test("closing during fetch prevents playback; trace names cannot escape the trace directory", async () => {
  let resolve!: (r: Response) => void;
  const c = clock(), messages: ServerToWeb[] = [];
  const source = connectReplay(m => messages.push(m), () => {}, { ui: false, search: "?trace=testing", timers: c.timers, fetch: (() => new Promise(r => { resolve = r; })) as typeof fetch });
  source.close(); resolve(Response.json(fixture)); await flush(); c.advance(Infinity);
  expect(messages).toEqual([]);
  let fetched = false;
  connectReplay(() => {}, () => {}, { ui: false, search: "?trace=../private", fetch: (async () => { fetched = true; return Response.json(fixture); }) as typeof fetch });
  await flush(); expect(fetched).toBe(false);
});

test("recorder is opt-in and unavailable on production; it strips credentials and email", () => {
  expect(recordingAllowed(new URL("https://shiptorio.dev/deck?record=1"))).toBe(true);
  expect(recordingAllowed(new URL("http://localhost:5191/deck.html?record=1"))).toBe(true);
  expect(recordingAllowed(new URL("https://shiptorio.dev/deck"))).toBe(false);
  expect(recordingAllowed(new URL("https://shiptorio.com/deck?record=1"))).toBe(false);
  let now = 100; const recorder = createRecorder(() => now);
  recorder.record({ type: "log", level: "info", at: 0, text: "ignored before snapshot" });
  recorder.record(sample().frames[0].message); now += 250;
  recorder.record({ type: "log", level: "info", at: 0, text: "player@example.com token=secret Bearer abcdef ghp_1234567890 https://example.test?code=abc" });
  const json = JSON.stringify(recorder.trace());
  for (const secret of ["player@example.com", "secret", "abcdef", "ghp_1234567890", "code=abc"]) expect(json).not.toContain(secret);
  expect(recorder.trace().frames[1].at).toBe(250);
  expect(sanitizeTraceValue({ accessToken: "secret", nested: { cookie: "secret", title: "ok" } })).toEqual({ nested: { title: "ok" } });
  const cloned = recorder.trace(); cloned.frames.length = 0;
  expect(recorder.trace().frames).toHaveLength(2);
});

test("replay blocks page-owned connection buttons and removes that guard on close", async () => {
  const { Window } = await import("happy-dom");
  const win = new Window();
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: win.document });
  try {
    const button = win.document.createElement("button");
    let activated = 0; button.onclick = () => { activated++; }; win.document.body.append(button);
    const c = clock();
    const replay = connectReplay(() => {}, () => {}, { search: "?trace=testing-16-sample", timers: c.timers, fetch: (async () => Response.json(fixture)) as typeof fetch });
    await flush(); button.click();
    expect(activated).toBe(0);
    expect(win.document.querySelector('[role="status"]')?.textContent).toContain("fixture sample");
    replay.close(); button.click();
    expect(activated).toBe(1);
    expect(win.document.querySelector('[role="status"]')).toBeNull();
  } finally {
    if (saved) Object.defineProperty(globalThis, "document", saved); else delete (globalThis as { document?: unknown }).document;
    await win.happyDOM.close();
  }
});
