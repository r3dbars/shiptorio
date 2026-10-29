import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { FactoryState, Item, Move, ServerToWeb, WebToServer } from "@shiptorio/shared";
import { STOPS, type DeckView } from "../src/deck2d/contract";
import { connectSim } from "../src/sim/engine";
import type { Source, SourceConfig } from "../src/source";
import { createLiveSource } from "../src/deck2d/data/source";
import { createWatchSource, isWatchMode } from "../src/deck2d/data/watch";
import { ALL_CLEAR, deckView, FIRST_LINE, itemStop } from "../src/deck2d/data/view";
import { createBuild } from "../src/deck2d/build/build";
import { createBus } from "../src/deck2d/contract";

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

test("watch mode is explicitly simulator-only", () => {
  expect(isWatchMode("?source=sim&watch=1")).toBe(true);
  expect(isWatchMode("?source=live&watch=1")).toBe(false);
  expect(isWatchMode("?source=sim")).toBe(false);
});

test("watch mode builds, fails, repairs, launches, and resets without a click", () => {
  const src = createWatchSource();
  const seen = new Set<string>();
  let repaired = false, launched = false, reset = false;
  for (let i = 0; i < 2000; i++) {
    advance(100);
    src.step?.(0.1);
    const job = src.state()?.items[0];
    if (job) seen.add(job.state);
    expect(src.view().caption).not.toMatch(/SIMULATION|gauntlet|blockage/);
    if (job?.state === "rejected") expect(src.view().caption).toBe("A check failed. Sending the fix back for repair…");
    if (job?.state === "inspecting") expect(src.view().caption).toBe("Checking the fix…");
    if (job?.state === "rejected") expect(src.view().jam).toBe("builder");
    if (job?.state === "working" && job.attempts > 1) repaired = true;
    if (src.view().shipped > 0) launched = true;
    expect(src.view().stops.every(s => s.built)).toBe(true);
    if (launched && src.view().shipped === 0) { reset = true; break; }
    expect(src.view().card).toBeNull();
  }
  src.close();
  expect([...seen]).toEqual(expect.arrayContaining(["working", "rejected", "inspecting", "launched"]));
  expect(repaired).toBe(true);
  expect(launched).toBe(true);
  expect(reset).toBe(true);
  expect(timers.size).toBe(0);
});

test("closing while a watch reset is pending leaves no simulator running", () => {
  const src = createWatchSource();
  advance(0);
  src.reset();
  src.close();
  advance(0);
  expect(timers.size).toBe(0);
});

test("every reset frame keeps built stations until the replacement snapshot is ready", () => {
  const src = createWatchSource();
  const build = createBuild({ get: () => null } as never, createBus(), { reduced: true });
  advance(0); // The simulator publishes its first snapshot in a microtask.
  const frame = () => {
    src.step?.(1 / 60);
    const view = src.view();
    build.update(1 / 60, view);
    expect(view.stops.every(s => s.built)).toBe(true);
    expect(view.stops.some(s => s.locked)).toBe(false);
    expect(view.stops.some(s => build.owns(s))).toBe(false);
  };
  frame();
  src.reset();
  // Draw before queued snapshot delivery: this used to draw four CONNECT tarps.
  frame();
  src.reset(); // A repeated reset must not replace the pending connection.
  frame();
  advance(0);
  frame();
  src.close();
  expect(timers.size).toBe(0);
});

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
    expect(v.shippy).toEqual({ pose: "weld", at: "builder" });
  });

  test("human approvals request attention without marking the machine as broken", () => {
    const v = deckView(base({ items: [item("a", "queued")], deck: [card("idea", "research"), card("plan", "plan_runner_job", { learn: { have: 1, need: 3 } })] }), { now: 1e12 });
    expect(v.card).toMatchObject({ id: "plan", stop: "planner", dots: { have: 1, need: 3 }, line: "Approve 2 more like this and then it's automatic.", hold: false, waitingCards: 2, attention: "approve" });
    expect(v.jam).toBeNull();
    expect(v.attention).toContain("planner");
    expect(stop(v, "planner")).toMatchObject({ state: "idle", items: [{ id: "a", look: "plain" }] });
    expect(v.stops.some(x => x.state === "jammed")).toBe(false);
    expect(v.shippy).toEqual({ pose: "inspect", at: "planner" });
  });

  test("a merge card sits at the gate and asks for a held press", () => {
    const v = deckView(base({ deck: [card("ship", "request_merge", { kind: "ship" })] }), { now: 1e12 });
    expect(v.card).toMatchObject({ stop: "gate", hold: true, dots: null, line: FIRST_LINE });
  });

  test("clicking an attention station selects its own real decision", () => {
    const s = base({ deck: [card("build", "start_job"), card("merge", "request_merge")] });
    const v = deckView(s, { selectedStop: "gate" });
    expect(v.card?.id).toBe("merge");
    expect(v.card?.hold).toBe(true);
    expect(v.attention).toEqual(expect.arrayContaining(["builder", "gate"]));
    expect(v.jam).toBeNull();
  });

  test("a busy bottleneck is not an error, but reported failures are red", () => {
    const v = deckView(base({ items: [item("a", "on_pad")], bottleneck: { stage: "inspect", stationId: "review-1", wip: 2, ageMs: 1, throughputPerHour: 0, valueAtRisk: 1, summary: "" } }), { now: 1e12 });
    expect(v.jam).toBeNull();
    expect(v.card).toBeNull();
    // a slow stop Shippy already runs is just busy, not a jam
    expect(deckView(base({ learned: [{ key: "build|sim|start_job", label: "", since: 0 }], bottleneck: { stage: "build", stationId: "asm-1", wip: 2, ageMs: 1, throughputPerHour: 0, valueAtRisk: 1, summary: "" } })).jam).toBeNull();
    expect(deckView(base({ items: [item("failed", "rejected", { failure: "CI failed" })] })).jam).toBe("builder");
    const error = deckView(base({ sources: [{ kind: "github", state: "error", detail: "GitHub unavailable", eventsToday: 0, setup: { steps: [] } }] }));
    expect(error.jam).toBe("repo");
    expect(error.attention).not.toContain("repo");
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

  test("Shippy works on the active job, follows the Foreman's active target, and ignores stale targets", () => {
    const inspecting = item("verify", "inspecting", { updatedAt: 2, inspection: { headSha: "head", state: "pending", humanApproved: false, stages: [{ gate: "ci", state: "pending", reason: "" }] } });
    const s = base({ items: [item("code", "working", { updatedAt: 1 }), inspecting] });
    expect(deckView(s, { now: 1e12 }).shippy).toEqual({ at: "builder", pose: "weld" });
    expect(deckView({ ...s, foreman: { thinking: false, targetId: "verify" } }, { now: 1e12 }).shippy).toEqual({ at: "checks", pose: "inspect" });
    expect(deckView(base({ foreman: { thinking: false, targetId: "asm-1" } }), { now: 1e12 }).shippy).toEqual({ at: "corner", pose: "folded" });
    expect(deckView(base({ foreman: { thinking: true, targetId: "asm-1" } }), { now: 1e12 }).shippy).toEqual({ at: "builder", pose: "inspect" });
  });

  test("rejected work waits for approval, an actual rework job welds, and human review stays manual", () => {
    const s = base({ items: [item("fix", "rejected", { failure: "CI failed", attempts: 1 })] });
    expect(deckView(s, { now: 1e12 }).shippy).toEqual({ at: "builder", pose: "alarmed" });
    s.items[0].state = "working";
    expect(deckView(s, { now: 1e12 }).shippy).toEqual({ at: "builder", pose: "weld" });
    s.items[0] = item("human", "inspecting", { inspection: { headSha: "head", state: "pending", humanApproved: false, stages: [{ gate: "human", state: "pending", reason: "" }] } });
    expect(deckView(s, { now: 1e12 }).shippy).toEqual({ at: "gate", pose: "alarmed" });
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
      expect(v.jam).toBeNull();
      expect(v.attention).toContain("builder");
      expect(v.shippy).toEqual({ pose: "inspect", at: "builder" });
    }
    src.approve(v.card.id);
    advance(0);
    // beat 3: swipe and it moves (the card is gone at once, Shippy pulls the lever)
    const after = src.view();
    expect(after.card?.id).not.toBe(v.card.id);
    if (!after.stops.find((x) => x.id === "builder")!.automated) expect(after.shippy).toEqual({ pose: "lever", at: v.card.stop });
  }
  expect(builds.slice(0, 3)).toEqual(["Build the fix: await the payment intent before enabling the button.", "Approve 2 more like this and then it's automatic.", "Approve 1 more like this and then it's automatic."]);
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

test("real protocol job updates drive work, completion, then home without sending actions", () => {
  let receive!: (message: ServerToWeb) => void;
  const sent: WebToServer[] = [];
  const src = createLiveSource(undefined, {
    connect: (cfg, onMessage) => {
      expect(cfg.kind).toBe("sim");
      receive = onMessage;
      return { send: message => sent.push(message), close() {} };
    },
  });
  const active = item("job", "working", { updatedAt: Date.now() });
  receive({ type: "snapshot", state: base({ items: [active] }) });
  expect(src.view().shippy).toEqual({ at: "builder", pose: "weld" });
  receive({ type: "snapshot", state: base({ items: [{ ...active, state: "passed", updatedAt: Date.now() }] }) });
  expect(src.view().shippy).toEqual({ at: "builder", pose: "happy" });
  advance(1500);
  expect(src.view().shippy).toEqual({ at: "corner", pose: "folded" });
  expect(sent).toEqual([]);
  src.close();
});

test("the deck page's no-argument source reads the selected live repository", () => {
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?source=live&repo=owner/project" } });
  const src = createLiveSource(undefined, {
    connect: cfg => {
      expect(cfg).toMatchObject({ kind: "live", repo: "owner/project" });
      return { send() {}, close() {} };
    },
  });
  src.close();
});


test("Shippy guide requires matching Meta evidence, and ignores unrelated or fallback decisions", () => {
  const m = card("unlock:stuck", "request_rework", { itemId: "a" });
  const state = base({ deck: [m], holdingBack: { id: "stuck", area: "build", title: "Stuck", why: "Needs a fix", signalIds: ["a"], confidence: 1, by: "spark", decidedAt: 1, severity: 1 } });
  expect(deckView(state).card?.guide).toBe("shippy");
  expect(deckView({ ...state, holdingBack: { ...state.holdingBack!, by: "rule" } }).card?.guide).toBeUndefined();
  expect(deckView({ ...state, deck: [card("setup", "connect_source", { options: [{ id: "go", label: "Connect", recommended: true, actions: [{ tool: "connect_source", args: { kind: "codex" }, reason: "" }] }] })] }).card?.guide).toBeUndefined();
  const thought = { id: "t", at: 1, decision: "plan" as const, by: "spark" as const, model: "muse-spark", ms: 1, itemId: "a", title: "Plan", outcome: "Build", reason: "Fix it" };
  const planned = base({ deck: [card("plan", "approve_runner_job", { itemId: "a" })], brain: { model: "muse-spark", online: true, decisions: 1, fallbacks: 0, thoughts: [thought] } });
  expect(deckView(planned).card?.guide).toBe("shippy");
  expect(deckView({ ...planned, brain: { ...planned.brain!, thoughts: [{ ...thought, itemId: "other" }] } }).card?.guide).toBeUndefined();
  expect(deckView({ ...planned, brain: { ...planned.brain!, thoughts: [thought, { ...thought, id: "new", at: 2, by: "fallback" }] } }).card?.guide).toBeUndefined();
});

test("live brain focus parks on the picked approval without painting a healthy station red", () => {
  const s = base({ items: [item("gh-16", "queued")], deck: [card("approve16", "approve_runner_job", { itemId: "gh-16" })], liveBottleneck: { stop: "builder", itemId: "gh-16", reason: "Waiting on your call: start the build for #16.", source: "spark" } });
  const v = deckView(s, { visualFlow: true });
  expect(v.focus).toBe("builder");
  expect(v.caption).toBe(s.liveBottleneck!.reason);
  expect(v.card?.id).toBe("approve16");
  expect(v.attention).toContain("builder");
  expect(v.jam).toBeNull();
  expect(v.stops.find(x => x.id === "builder")?.state).not.toBe("jammed");
});

test("a real fault stays red while the brain supplies its single explanation", () => {
  const v = deckView(base({ items: [item("gh-16", "rejected", { failure: "Check failed" })], liveBottleneck: { stop: "builder", itemId: "gh-16", reason: "A fix is needed before #16 can continue.", source: "fallback" } }), { visualFlow: true });
  expect(v.focus).toBe("builder");
  expect(v.jam).toBe("builder");
  expect(v.caption).toBe("A fix is needed before #16 can continue.");
});

test("live pick patches and null clears survive the actual source fold; removed work cannot hold focus", async () => {
  const { fold } = await import("../src/deck2d/data/source");
  const pick = { stop: "builder" as const, itemId: "gh-16", reason: "Waiting on your call: start the build for #16.", source: "spark" as const };
  const s = base({ items: [item("gh-16", "queued")] });
  const picked = fold(s, { type: "patch", patch: { liveBottleneck: pick } })!;
  expect(deckView(picked, { visualFlow: true }).focus).toBe("builder");
  expect(deckView({ ...picked, items: [] }, { visualFlow: true }).focus).toBeUndefined();
  const cleared = fold(picked, { type: "patch", patch: { liveBottleneck: null } })!;
  expect(cleared.liveBottleneck).toBeNull();
  expect(deckView(cleared, { visualFlow: true }).focus).toBeUndefined();
});

test("the live source retains a settled brain focus and caption through the conveyor journey", () => {
  let receive!: (message: ServerToWeb) => void;
  const source = createLiveSource({ kind: "live", repo: "r3dbars/Testing" }, { connect: (_config, callback) => { receive = callback; return { send() {}, close() {} }; } });
  receive({ type: "snapshot", state: base({ items: [item("gh-16", "inspecting", { prNumber: 27 })], liveBottleneck: { stop: "checks", itemId: "gh-16", reason: "Waiting for checks on PR #27.", source: "spark" } }) });
  const view = source.view();
  expect(view.focus).toBe("checks");
  expect(view.caption).toBe("Waiting for checks on PR #27.");
  source.close();
});

test("a new brain pick waits for cargo arrival before changing active item identity", () => {
  let receive!: (message: ServerToWeb) => void;
  const source = createLiveSource({ kind: "live", repo: "r3dbars/Testing" }, { connect: (_config, callback) => { receive = callback; return { send() {}, close() {} }; } });
  const one = item("gh-16", "working");
  const two = item("gh-17", "working", { updatedAt: -1 });
  const pick = (id: string) => ({ stop: "builder" as const, itemId: id, reason: "The coding engine is working.", source: "spark" as const });
  receive({ type: "snapshot", state: base({ items: [one, two], liveBottleneck: pick(one.id) }) });
  expect(source.view().work?.id).toBe(one.id);
  receive({ type: "patch", patch: { items: [{ ...one, state: "inspecting", prNumber: 27 }] } });
  source.step!(1); source.view();
  receive({ type: "patch", patch: { liveBottleneck: pick(two.id) } });
  expect(source.view().work?.id).toBe(one.id);
  source.arrive(one.id, "checks");
  expect(source.view().work?.id).toBe(two.id);
  source.close();
});

test("all clear: nothing asks and nothing moves, so Shippy docks under one plain line and no card", () => {
  const watched = item("gh-16", "launched", { prNumber: 27, orbit: { since: 0, until: 1e13, state: "watching" } });
  for (const visualFlow of [true, false]) {
    const v = deckView(base({ items: visualFlow ? [watched] : [] }), { visualFlow, now: 1e12 });
    expect(v.allClear).toBe(true);
    expect(v.caption).toBe(ALL_CLEAR);
    expect(v.card).toBeNull();
    expect(v.shippy).toEqual({ pose: "folded", at: "corner" });
    expect(v.stops.every(x => x.state !== "working" && x.state !== "jammed")).toBe(true);
  }
});

test("not all clear while anything needs you, is stuck, or is moving", () => {
  const flow = { visualFlow: true, now: 1e12 };
  expect(deckView(base({ deck: [card("a", "approve_runner_job")] }), flow).allClear).toBe(false);
  expect(deckView(base({ items: [item("gh-16", "rejected")] }), flow).allClear).toBe(false);
  expect(deckView(base({ items: [item("gh-16", "working")] }), flow).allClear).toBe(false);
  const waiting = deckView(base({ items: [item("gh-16", "ore")] }), flow);
  expect(waiting.allClear).toBe(false);
  expect(waiting.caption).toBe("1 issue waiting in Repo. Choose one to start.");
  // a fresh, empty factory isn't "clear", it hasn't started
  expect(deckView(base({ machines: [], stations: [] }), { now: 1e12 }).allClear).toBe(false);
});

test("a launched crate is followed through its flight, then the deck rests", () => {
  const launched = item("gh-16", "launched", { prNumber: 27, orbit: { since: 0, until: 1e13, state: "watching" } });
  expect(deckView(base({ items: [launched] }), { visualFlow: true, activeItemId: "gh-16" }).work?.stop).toBe("launch");
  expect(deckView(base({ items: [launched] }), { visualFlow: true, activeItemId: null }).work).toBeUndefined();
});
