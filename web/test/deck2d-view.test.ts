import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { FactoryState, Item, Move, ServerToWeb, WebToServer } from "@shiptorio/shared";
import { STOPS, type DeckView } from "../src/deck2d/contract";
import { connectSim } from "../src/sim/engine";
import type { Source, SourceConfig } from "../src/source";
import { createLiveSource } from "../src/deck2d/data/source";
import { deckView, FIRST_LINE, itemStop } from "../src/deck2d/data/view";

const base = (over: Partial<FactoryState> = {}): FactoryState => ({
  repo: "r3dbars/testing", baseBranch: "main", districts: [], belts: [], items: [], power: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 0,
  machines: [{ id: "asm-1", type: "assembler", x: 0, y: 0, tier: 1, state: "idle" }],
  stations: [
    { id: "ci-1", kind: "ci", name: "CI", wip: 0, caughtThisWeek: 0, actions: [] },
    { id: "review-1", kind: "review", name: "AI review", wip: 0, caughtThisWeek: 0, actions: [] },
    { id: "gate-1", kind: "merge", name: "Gate", wip: 0, caughtThisWeek: 0, actions: [] },
  ],
  ...over,
});
const item = (id: string, state: Item["state"], over: Partial<Item> = {}): Item => ({ id, kind: "bug", source: "github_issue", title: id, district: "web", state, attempts: 0, updatedAt: 0, ...over });
const card = (id: string, tool: string, over: Partial<Move> = {}): Move => ({ id, title: `Approve ${id}?`, why: "", createdAt: 0, options: [{ id: "go", label: "Go", recommended: true, actions: [{ tool, args: {}, reason: "" }] }, { id: "skip", label: "Not now", recommended: false, actions: [] }], ...over });
const stop = (v: DeckView, id: string) => v.stops.find((x) => x.id === id)!;

describe("the 2D deck's view of a factory", () => {
  test("no state yet: seven dark stops, no card, Shippy folded", () => {
    const v = deckView(null);
    expect(v.stops.map((x) => x.id)).toEqual([...STOPS]);
    expect(v.stops.every((x) => x.state === "idle" && !x.built)).toBe(true);
    expect(v.card).toBeNull();
    expect(v.shippy).toEqual({ pose: "folded", at: "corner" });
  });

  test("items land as crates on the right stop", () => {
    const inspecting = (gate: "ci" | "ai" | "human") => ({ headSha: "x", state: "pending" as const, humanApproved: false, stages: [{ gate, state: "pending" as const, reason: "" }] });
    expect(itemStop(item("a", "ore"))).toBe("repo");
    expect(itemStop(item("a", "queued"))).toBe("planner");
    expect(itemStop(item("a", "rejected"))).toBe("builder");
    expect(itemStop(item("a", "inspecting", { inspection: inspecting("ci") }))).toBe("checks");
    expect(itemStop(item("a", "inspecting", { inspection: inspecting("ai") }))).toBe("review");
    expect(itemStop(item("a", "inspecting", { inspection: inspecting("human") }))).toBe("gate");
    expect(itemStop(item("a", "on_pad"))).toBe("gate");
    expect(itemStop(item("a", "launched", { orbit: { since: 0, until: 1, state: "watching" } }))).toBe("launch");
    expect(itemStop(item("a", "launched"))).toBeNull();
    const v = deckView(base({ items: [item("b", "ore", { updatedAt: 2 }), item("a", "ore", { updatedAt: 1 }), item("c", "working", { priority: "rush" })] }), { now: 1e12 });
    expect(stop(v, "repo").items).toEqual([{ id: "a", title: "a", look: "plain" }, { id: "b", title: "b", look: "plain" }]);
    expect(stop(v, "builder")).toMatchObject({ built: true, state: "working", items: [{ id: "c", look: "glow" }] });
    expect(v.shippy).toEqual({ pose: "walking", at: "repo" });
  });

  test("the card waiting on you is the one jam, and Shippy is alarmed there", () => {
    const v = deckView(base({ items: [item("a", "queued")], deck: [card("idea", "research"), card("plan", "plan_runner_job", { learn: { have: 1, need: 3 } })] }), { now: 1e12 });
    expect(v.card).toMatchObject({ id: "plan", stop: "planner", dots: { have: 1, need: 3 }, line: "Approve 2 more like this and then it's automatic.", hold: false, waitingCards: 2, attention: "approve" });
    expect(v.jam).toBe("planner");
    expect(stop(v, "planner")).toMatchObject({ waiting: "PLANNER WAITING", items: [{ id: "a", look: "wait" }] });
    expect(v.stops.filter((x) => x.state === "jammed").map((x) => x.id)).toEqual(["planner"]);
    expect(v.shippy).toEqual({ pose: "alarmed", at: "planner" });
  });

  test("a merge card sits at the gate and asks for a held press", () => {
    const v = deckView(base({ deck: [card("ship", "request_merge", { kind: "ship" })] }), { now: 1e12 });
    expect(v.card).toMatchObject({ stop: "gate", hold: true, dots: null, line: FIRST_LINE });
  });

  test("with no card, the bottleneck engine's pick is the jam", () => {
    const v = deckView(base({ items: [item("a", "on_pad")], bottleneck: { stage: "inspect", stationId: "review-1", wip: 2, ageMs: 1, throughputPerHour: 0, valueAtRisk: 1, summary: "" } }), { now: 1e12 });
    expect(v.jam).toBe("review");
    expect(v.card).toBeNull();
    // a slow stop Shippy already runs is just busy, not a jam
    expect(deckView(base({ learned: [{ key: "build|sim|start_job", label: "", since: 0 }], bottleneck: { stage: "build", stationId: "asm-1", wip: 2, ageMs: 1, throughputPerHour: 0, valueAtRisk: 1, summary: "" } })).jam).toBeNull();
  });

  test("a card the UI already answered is skipped", () => {
    const v = deckView(base({ deck: [card("a", "plan_runner_job"), card("b", "start_job")] }), { now: 1e12, hidden: new Set(["a"]) });
    expect(v.card?.id).toBe("b");
  });

  test("learning a kind turns its stop automatic, and Shippy celebrates", () => {
    const now = 1e12;
    const s = base({ learned: [{ key: "build|district:web|approve_runner_job", label: "Approving plans", since: now - 1000 }] });
    const v = deckView(s, { now });
    expect(stop(v, "builder")).toMatchObject({ automated: true, state: "auto" });
    expect(v.caption).toBe("Shippy has this. Fix the next jam.");
    expect(stop(v, "planner").automated).toBe(false);
    expect(v.shippy).toEqual({ pose: "happy", at: "builder" });
    expect(deckView(s, { now: now + 10_000 }).shippy.pose).toBe("folded");
  });

  test("a launch permit makes the gate and launch automatic", () => {
    const v = deckView(base({ autonomy: { level: "advisor", next: null, ranAlone: 0, districts: [{ district: "docs", score: 1, risk: "low", permit: true }] } }));
    expect(stop(v, "gate").automated).toBe(true);
    expect(stop(v, "launch").automated).toBe(true);
  });

  test("an Approve pulls the lever for a beat", () => {
    const v = deckView(base(), { now: 1000, pulled: { stop: "builder", at: 500 } });
    expect(v.shippy).toEqual({ pose: "lever", at: "builder" });
    expect(deckView(base(), { now: 5000, pulled: { stop: "builder", at: 500 } }).shippy.pose).toBe("folded");
  });

  test("stops that aren't built stay off", () => {
    const v = deckView(base({ machines: [], stations: [] }));
    expect(v.stops.filter((x) => x.built).map((x) => x.id)).toEqual(["repo"]);
    expect(v.caption).toBe("Software is a factory.");
  });
});

// The whole story on the simulator: it's waiting on your call, swipe and it moves, approve twice more and it's automatic.
let timers = new Map<number, { at: number; every?: number; fn: () => void }>();
let micro: (() => void)[] = [];
let now = 0;
let ids = 0;
const real = { setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, now: Date.now, location: Object.getOwnPropertyDescriptor(globalThis, "location") };
beforeEach(() => {
  timers = new Map();
  micro = [];
  now = 0;
  const add = (fn: () => void, ms = 0, every?: number) => (timers.set(++ids, { at: now + Math.max(0, ms), every, fn }), ids);
  globalThis.setTimeout = ((fn: () => void, ms?: number) => add(fn, ms)) as unknown as typeof setTimeout;
  globalThis.setInterval = ((fn: () => void, ms = 1) => add(fn, Math.max(1, ms), Math.max(1, ms))) as unknown as typeof setInterval;
  globalThis.clearTimeout = globalThis.clearInterval = ((id: unknown) => void timers.delete(Number(id))) as typeof clearTimeout;
  globalThis.queueMicrotask = (fn) => void micro.push(fn);
  Date.now = () => 1e12 + now;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "" } });
});
afterEach(() => {
  Object.assign(globalThis, { setTimeout: real.setTimeout, clearTimeout: real.clearTimeout, setInterval: real.setInterval, clearInterval: real.clearInterval, queueMicrotask: real.queueMicrotask });
  Date.now = real.now;
  if (real.location) Object.defineProperty(globalThis, "location", real.location);
  else Reflect.deleteProperty(globalThis, "location");
});
const flush = () => { while (micro.length) micro.shift()!(); };
function advance(ms: number) {
  const end = now + ms;
  for (let n = 0; n < 100_000; n++) {
    flush();
    const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
    if (!next) break;
    const [id, t] = next;
    now = t.at;
    if (t.every) timers.set(id, { ...t, at: t.at + t.every });
    else timers.delete(id);
    t.fn();
  }
  now = end;
  flush();
}
const simSource = (scenario: SourceConfig["scenario"]) =>
  createLiveSource({ kind: "sim", repo: "", scenario }, { connect: (cfg, onMessage, onStatus): Source => connectSim(cfg.scenario, onMessage, onStatus) });

test("on the simulator: it waits on your call, swipe and it moves, three yeses and the builder is automatic", () => {
  const src = simSource("deck2d");
  advance(0);
  let pings = 0;
  src.subscribe!(() => pings++);
  const builds: string[] = [];
  for (let i = 0; i < 200 && !src.view().stops.find((x) => x.id === "builder")!.automated; i++) {
    advance(1400);
    const v = src.view();
    if (!v.card) continue;
    if (v.card.stop === "builder") {
      builds.push(v.card.line);
      // beat 2: the line is waiting on you, right where the card points
      expect(v.jam).toBe("builder");
      expect(v.shippy).toEqual({ pose: "alarmed", at: "builder" });
    }
    src.approve(v.card.id);
    advance(0);
    // beat 3: swipe and it moves (the card is gone at once, Shippy pulls the lever)
    const after = src.view();
    expect(after.card?.id).not.toBe(v.card.id);
    if (!after.stops.find((x) => x.id === "builder")!.automated) expect(after.shippy).toEqual({ pose: "lever", at: v.card.stop });
  }
  expect(builds.slice(0, 3)).toEqual([FIRST_LINE, "Approve 2 more like this and then it's automatic.", "Approve 1 more like this and then it's automatic."]);
  // beat 4: the builder runs on its own now, and Shippy is happy about it
  advance(1300);
  const v = src.view();
  expect(v.stops.find((x) => x.id === "builder")).toMatchObject({ automated: true, state: "auto" });
  expect(v.shippy).toEqual({ pose: "happy", at: "builder" });
  expect(pings).toBeGreaterThan(0);
  src.close();
});

test("Later sends defer_move once and hides the card; Approve on a vanished card sends nothing", () => {
  const sent: WebToServer[] = [];
  const src = createLiveSource({ kind: "live", repo: "r3dbars/testing", scenario: "quiet-morning" }, {
    connect: (_cfg, onMessage) => {
      queueMicrotask(() => onMessage({ type: "snapshot", state: base({ deck: [card("a", "start_job"), card("b", "plan_runner_job")] }) }));
      return { send: (m) => sent.push(m), close: () => {} };
    },
  });
  flush();
  expect(src.view().card?.id).toBe("a");
  src.later("a");
  src.later("a");
  expect(sent).toEqual([{ type: "defer_move", moveId: "a" }]);
  expect(src.view().card?.id).toBe("b");
  src.approve("gone");
  expect(sent.length).toBe(1);
  src.approve("b");
  expect(sent.at(-1)).toEqual({ type: "choose_move", moveId: "b", optionId: "go" });
  expect(src.view().card).toBeNull();
});
