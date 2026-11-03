// The hackathon demo path, locked end to end on the deck (web/src/deck2d), with fixtures only: no server, no network.
//  1. A judge's first minute: /deck?source=live as a guest is Shippy's tour first, every card in order, nothing fetched
//     and no socket opened; the password popup comes only at "Want to build yours?", then the GitHub sign-in hop.
//  2. The live loop from a scripted socket: real transport (source/live.ts), schema parse, fold + applyPatch, deckView
//     and the conveyor journey, fed the frames the Factory sends (fixtures built with the server's own projections).
//  3. The station lamp colors, the learn dots (1/3, 2/3, then automatic), the cap card and the "That's fixed" card.
//  4. The story camera at the locked canvas sizes (640x360 desktop, 360x640 phone).
// Real-browser layout and network checks for the same path: tests/e2e/demo-path.pw.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { FactoryState, projectPipeline, unlockMove, type Item, type Move, type PipelineJob, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../../server/src/engine";
import { freshInspection, launchMove, liveStations, reworkMove, setStage } from "../../server/src/gauntlet";
import { nextPlanningDay, plannerRestDeck } from "../../server/src/planning-retry";
import { utcDay } from "../../server/src/budget";
import { freshWork, learnFromYes, learnMeter, learnScope, learnedList, noteAutoRun } from "../../server/src/learn";
import type { DeckBook } from "../../server/src/deck-decisions";
import { CANVAS, CANVAS_PORTRAIT, FLOOR_Y, PALETTE, STOPS, STOP_X, createBus, type CardView, type StopId } from "../src/deck2d/contract";
import { createConnections } from "../src/deck2d/data/connections";
import { createLiveSource, type LiveDeckSource } from "../src/deck2d/data/source";
import type { LiveDeckView } from "../src/deck2d/data/view";
import { LEARN } from "../src/copy";
import { askPassword, previewUnlock } from "../src/deck2d/password";
import { machineSignal } from "../src/deck2d/stations/status";
import { needsAttention } from "../src/deck2d/stations/attention";
import { TOUR, createTour } from "../src/deck2d/story/tour";
import { shipFeel } from "../src/deck2d/story/ship";
import { frameShot } from "../src/deck2d/engine/camera";
import { cardScale } from "../src/deck2d/card/pixel";
import { connectLive } from "../src/source/live";

// ---------- a DOM (happy-dom) for the password popup and the card ----------
const KEYS = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "matchMedia", "location", "WebSocket", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;
beforeAll(() => {
  win = new Window({ url: "https://shiptorio.dev/deck?source=live" });
  for (const k of KEYS) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of KEYS) if (k !== "WebSocket" && k !== "fetch") Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: (win as unknown as Record<string, unknown>)[k] });
});
afterAll(async () => {
  for (const k of KEYS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
  await win.happyDOM.close();
});

// Anything that could reach a server (and so a model) is recorded: every fetch and every socket the page opens.
const net = { fetches: [] as { url: string; method: string }[], sockets: [] as FakeSocket[] };
class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event?: { code: number; wasClean: boolean }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(readonly url: string) { net.sockets.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  send(data: string) { if (this.readyState !== 1) throw new Error("Socket is not open"); this.sent.push(data); }
  frame(msg: ServerToWeb, seq: number) { this.onmessage?.({ data: JSON.stringify({ ...msg, seq }) }); }
  close() { this.readyState = 3; }
}
const spyFetch = (answer: (url: string, init?: RequestInit) => Response | Promise<Response>) => (async (url: RequestInfo | URL, init?: RequestInit) => {
  net.fetches.push({ url: String(url), method: init?.method ?? "GET" });
  return answer(String(url), init);
}) as typeof fetch;
beforeEach(() => {
  net.fetches = []; net.sockets = [];
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, writable: true, value: FakeSocket });
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: spyFetch(() => { throw new Error("unexpected network call"); }) });
  document.body.innerHTML = "";
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// ---------- 1. the guest's first minute ----------
// The same wiring as main.ts for /deck?source=live without a session: storyBeforeSignIn(shipFeel(createTour(), bus),
// connections, { ask: true }), connections' askPassword -> password.ts askPassword. The frame loop below is main.ts's,
// with the engine's two events (a crate reaching a machine, the rocket going) played the way the engine plays them.
async function guestDeck(opts: { locked: boolean; unlock?: (password: string) => Promise<"ok" | "wrong" | "busy" | "error"> }) {
  const { storyBeforeSignIn, oneAsk } = await import("../src/deck2d/main");
  const went: string[] = [];
  const navigate = (url: string) => { went.push(url); };
  const request = spyFetch(url => {
    if (url === "/api/me") return opts.locked ? new Response("Preview password required", { status: 401 }) : Response.json({ guest: true, login: null, githubConfigured: true });
    if (url === "/access") return new Response(null, { status: 401 });
    throw new Error(`unexpected request ${url}`);
  });
  const connections = createConnections({
    origin: "https://shiptorio.dev", path: "/deck?source=live", navigate, copy: async () => {}, fetch: request,
    askPassword: next => askPassword(document as unknown as Document, next, navigate, opts.unlock ?? previewUnlock(request)),
  });
  const bus = createBus();
  const tour = shipFeel(createTour(), bus);
  const source = storyBeforeSignIn(tour, connections, { ask: true });
  let shipped = 0, clock = 0, idle = 0;
  const shown: CardView[] = [], at = new Map<string, StopId>();
  const frame = (dt = 0.1) => {
    clock += dt;
    source.step?.(dt);
    connections.tick();
    const view = oneAsk(connections.view(source.view())) as LiveDeckView;
    if (!view.card) idle += dt;
    if (view.card && shown.at(-1)?.id !== view.card.id) shown.push(view.card);
    // the engine says once when a crate reaches a machine (crate-arrive); main.ts forwards it to the source
    for (const stop of view.stops) for (const item of stop.items) if (at.get(item.id) !== stop.id) {
      at.set(item.id, stop.id);
      (source as unknown as { arrive?: (id: string, stop: StopId) => void }).arrive?.(item.id, stop.id);
      bus.emit({ type: "crate-arrive", id: item.id, stop: stop.id });
    }
    if (!view.stops.some(s => s.items.length)) at.clear();
    if (view.shipped > shipped) { shipped = view.shipped; bus.emit({ type: "launch" }); }
    return view;
  };
  const answer = (card: CardView, yes = true) => {
    if (card.id.startsWith("connection-")) return void connections.answer(card.id, yes);
    if (yes) source.approve(card.id); else source.later(card.id);
  };
  /** Read each card and press its yes, until the card with this title is up. */
  const playUntil = (title: string) => {
    for (let i = 0; i < 20000; i++) {
      const view = frame();
      if (view.card?.title === title) return view.card;
      if (view.card) answer(view.card);
    }
    throw new Error(`never reached "${title}" after ${shown.map(c => c.title).join(" / ")}`);
  };
  return { frame, answer, playUntil, shown, went, connections, popup: () => document.getElementById("deck-password"), time: () => ({ clock, idle }) };
}

describe("a judge's first minute on /deck?source=live", () => {
  test("Shippy's tour comes first: every card in TOUR order, no password, no fetch, no socket, under a minute of waiting", async () => {
    const deck = await guestDeck({ locked: true });
    const first = deck.frame().card!;
    expect(first.title).toBe("Hi, I'm Shippy!");
    expect(first.shippy).toBe("wave"); // Shippy in the card, not a sign-in form
    expect(deck.popup()).toBeNull();
    const ask = deck.playUntil("Want to build yours?");
    expect(deck.shown.map(c => c.title)).toEqual([...TOUR.map(b => b.title), "Want to build yours?"]);
    // the only card that ships (pretend) code is a held press, and it is the only one that isn't Shippy talking
    expect(deck.shown.filter(c => c.hold).map(c => c.title)).toEqual(["Ship this fix?"]);
    expect(deck.shown.filter(c => !c.shippy).map(c => c.title)).toEqual(["Ship this fix?", "Want to build yours?"]);
    expect(ask).toMatchObject({ yes: "Build mine", no: "Replay", setup: true });
    // a stranger met the whole factory without one request: nothing that could start a model call
    expect(net.fetches).toEqual([]);
    expect(net.sockets).toEqual([]);
    expect(deck.popup()).toBeNull();
    // what the judge waits through between taps (builds, the ride down the line, the rocket): reading time not counted
    expect(deck.time().idle).toBeLessThan(60);
  });

  test("Build mine is the sign-in hop: the password popup, then GitHub; the only requests are /api/me and the gate form", async () => {
    const tries: string[] = [];
    const deck = await guestDeck({ locked: true, unlock: async password => { tries.push(password); return password === "right" ? "ok" : "wrong"; } });
    const ask = deck.playUntil("Want to build yours?");
    deck.answer(ask);
    for (let i = 0; i < 5; i++) { deck.frame(); await tick(); }
    const popup = deck.popup()!;
    expect(popup).not.toBeNull();
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.querySelector("h2")!.textContent).toBe("Enter the password");
    expect(deck.frame().card).toMatchObject({ title: "Sign in to your factory", yes: "Sign in" }); // under the modal: its way back
    expect(net.fetches).toEqual([{ url: "/api/me", method: "GET" }]);
    const form = popup.querySelector("form")!, input = popup.querySelector("input")!;
    input.value = "nope";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }) as unknown as Event);
    await tick();
    expect(popup.querySelector(".err")!.textContent).toBe("That password didn’t work.");
    expect(deck.went).toEqual([]);
    input.value = "right";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }) as unknown as Event);
    await tick();
    expect(tries).toEqual(["nope", "right"]);
    expect(deck.went).toEqual(["/auth/login?next=%2Fdeck%3Fsource%3Dlive"]); // the server's GitHub sign-in, back to the live deck
    expect(net.sockets).toEqual([]);
  });

  test("the popup's own form posts the server's gate, and a right password goes on to GitHub sign-in", async () => {
    const went: string[] = [];
    const request = spyFetch((url, init) => {
      if (url !== "/access" || init?.method !== "POST") throw new Error(`unexpected ${url}`);
      return new URLSearchParams(String(init.body)).get("password") === "right" ? new Response(null, { status: 303, headers: { location: "/" } }) : new Response("gate", { status: 401 });
    });
    askPassword(document as unknown as Document, "/auth/login?next=%2Fdeck%3Fsource%3Dlive", url => went.push(url), previewUnlock(request));
    const popup = document.getElementById("deck-password")!, input = popup.querySelector("input")!, form = popup.querySelector("form")!;
    expect(document.activeElement).toBe(input as unknown as Element);
    input.value = "right";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }) as unknown as Event);
    await tick(); await tick();
    expect(net.fetches).toEqual([{ url: "/access", method: "POST" }]);
    expect(went).toEqual(["/auth/login?next=%2Fdeck%3Fsource%3Dlive"]);
  });

  test("Not now (or Escape) on the password leaves a way back: Sign in reopens it, Close asks \"Want to build yours?\" again", async () => {
    const deck = await guestDeck({ locked: true, unlock: async () => "wrong" });
    for (const close of ["button", "escape"] as const) {
      const ask = deck.playUntil("Want to build yours?");
      deck.answer(ask);
      for (let i = 0; i < 5; i++) { deck.frame(); await tick(); }
      const popup = deck.popup()!;
      expect(popup).not.toBeNull();
      // the deck's own keys stay quiet under the popup: an Enter must not reach the card
      let leaked = 0;
      const listen = () => { leaked++; };
      window.addEventListener("keydown", listen);
      popup.querySelector("input")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }) as unknown as Event);
      window.removeEventListener("keydown", listen);
      expect(leaked).toBe(0);
      if (close === "button") popup.querySelector<HTMLButtonElement>(".later")!.click();
      else document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
      await tick();
      expect(deck.popup()).toBeNull();
      const signIn = deck.frame().card!;
      expect(signIn).toMatchObject({ title: "Sign in to your factory", yes: "Sign in", no: "Close" });
      const asked = net.fetches.length;
      deck.answer(signIn); await tick();
      expect(deck.popup()).not.toBeNull(); // Sign in is the popup again, with no new request
      expect(net.fetches.length).toBe(asked);
      deck.popup()!.querySelector<HTMLButtonElement>(".later")!.click();
      deck.answer(deck.frame().card!, false); await tick(); // Close
      const again = deck.frame().card;
      expect(again?.title).toBe("Want to build yours?");
      expect(again?.id).not.toBe(ask.id);
    }
    expect(deck.went).toEqual([]);
    expect(net.fetches).toEqual([{ url: "/api/me", method: "GET" }, { url: "/api/me", method: "GET" }]); // one check per Build mine
    expect(net.sockets).toEqual([]);
  });

  test("the password field keeps the typing: the sign-in card that comes up behind the popup doesn't take focus", async () => {
    const { wireDeckAccessibility } = await import("../src/deck2d/main");
    const { mountCard } = await import("../src/deck2d/card/card");
    const canvas = document.createElement("canvas"), host = document.createElement("div"), caption = document.createElement("p");
    document.body.append(canvas, host, caption);
    const card = mountCard(host, { onApprove() {}, onLater() {} });
    const a11y = wireDeckAccessibility(canvas as unknown as HTMLCanvasElement, host, caption);
    const signIn = (id: string): CardView => ({ id, title: "Sign in to your factory", line: "Sign in with GitHub so Shippy can see your repos.", yes: "Sign in", no: "Close", stop: "repo", dots: null });
    // the deck's order on Build mine: the popup opens (focus in the field), then the sign-in card lands behind it
    askPassword(document as unknown as Document, "/auth/login", () => {}, async () => "wrong");
    const input = document.querySelector<HTMLInputElement>("#deck-password input")!;
    expect(document.activeElement).toBe(input);
    card.show(signIn("connection-1")); a11y.update(signIn("connection-1"), null);
    expect(document.activeElement).toBe(input);
    // without a popup a new card still takes focus, so keys answer it (deck2d-a11y.test.ts)
    document.querySelector<HTMLButtonElement>("#deck-password .later")!.click();
    card.show(signIn("connection-2")); a11y.update(signIn("connection-2"), null);
    expect(document.activeElement).toBe(host.querySelector(".ic-card:not(.ic-ghost)"));
    a11y.destroy(); card.destroy();
  });

  test("with the preview cookie already set, Build mine goes straight to GitHub: no popup, no second card", async () => {
    const deck = await guestDeck({ locked: false });
    deck.answer(deck.playUntil("Want to build yours?"));
    for (let i = 0; i < 5; i++) { deck.frame(); await tick(); }
    expect(deck.popup()).toBeNull();
    expect(deck.went).toEqual(["/auth/login?next=%2Fdeck%3Fsource%3Dlive"]);
    expect(net.fetches).toEqual([{ url: "/api/me", method: "GET" }]);
  });
});

// ---------- 2. the live loop from a scripted socket ----------
// The "server" here is a mirror FactoryState plus the server's own projections (starterLine, liveStations,
// projectPipeline, launchMove, unlockMove, plannerRestDeck, learn.ts), sent as the frames factory.ts broadcasts:
// snapshot, patch (items + pipeline + stations), deck, move, move_resolved. The deck side is the real transport.
const REPO = "fixture/demo", HEAD = "b".repeat(40);
const NOW = Date.UTC(2026, 10, 1, 15, 0, 0);
const issue = (n: number, title: string, more: Partial<Item> = {}): Item => ({ id: `gh-${n}`, kind: "bug", source: "github_issue", title, district: "src", state: "ore", attempts: 0, updatedAt: NOW, ...more });
const thought = (itemId: string) => ({ model: "muse-spark-1.3", online: true, decisions: 1, fallbacks: 0,
  thoughts: [{ id: `t-${itemId}`, at: NOW, decision: "plan" as const, by: "spark" as const, model: "muse-spark-1.3", ms: 900, itemId, title: "Plan the fix", outcome: "plan", reason: "Small, scoped fix" }] });
/** The approve-plan card factory.ts publishes for a planned runner job (runnerMove). */
const buildCard = (item: Item, jobId: string, learn?: Move["learn"]): Move => ({ id: `approve-${jobId}`, title: `Build #${item.id.slice(3)}: ${item.title}`,
  why: "Review the plan and 1 files before your local Codex starts.", itemId: item.id, stage: "build", kind: "build", focus: "assembler-1", createdAt: NOW,
  plan: ["Files: src/cart.ts", "Checks run before a PR opens. You still decide when to merge."], ...(learn ? { learn } : {}),
  options: [{ id: "approve", label: "Approve and build with Codex", recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId }, reason: "Approve this exact plan." }] }, { id: "decline", label: "Not now", recommended: false, actions: [] }] });
const holding = { id: "ci_blocking:CI", area: "quality" as const, title: "A red check is blocking a PR", why: "\"CI\" is failing on PR #39.", signalIds: ["ci_blocking:CI"], confidence: 1, by: "spark" as const, decidedAt: NOW, severity: 1 };
const shippyCard = unlockMove(holding, { id: "u1", bottleneckId: holding.id, play: "fix_blocking_check", kind: "unblock", title: "Have the Builder fix the failing check",
  because: "PR #39 has been red for 2 days.", effort: "minutes", action: { tool: "fix_failing_pr", args: { pr: 39, workflow: "CI" } }, doneWhen: { signalId: holding.id } }, NOW);
/** factory.ts winCard: Shippy's follow-up once the fix landed. */
const winCard: Move = { id: "win:fix:39", title: "That's fixed", why: "Shippy checked again: #39 passes its checks now, with the fix from #51.", kind: "unblock", createdAt: NOW, attention: "suggest",
  options: [{ id: "continue", label: "Nice", recommended: true, actions: [] }, { id: "later", label: "Hide", recommended: false, actions: [] }] };

const COLOR = new Map<readonly string[], string>([[PALETTE.brass, "yellow"], [PALETTE.jam, "red"], [PALETTE.ok, "green"], [PALETTE.energy, "cyan"], [PALETTE.steel, "off"]]);

async function liveDeck(start: Partial<FactoryState> = {}) {
  const { oneAsk } = await import("../src/deck2d/main");
  let clock = NOW, seq = 1;
  const jobs: PipelineJob[] = [];
  // the server's state of the world, and what it would broadcast for it
  const server: FactoryState = FactoryState.parse({ repo: REPO, baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 1, ...start });
  const derive = () => { server.stations = liveStations(server, clock); server.pipeline = projectPipeline(server, jobs); };
  derive();
  const src: LiveDeckSource = createLiveSource({ kind: "live", repo: REPO, scenario: "quiet-morning" }, { connect: (cfg, onMessage, onStatus) => connectLive(cfg.repo, onMessage, onStatus), now: () => clock });
  expect(net.sockets.map(s => s.url)).toEqual([`wss://shiptorio.dev/api/repos/${REPO}/factory`]);
  const socket = net.sockets[0];
  socket.open();
  const frame = (msg: ServerToWeb) => socket.frame(msg, seq++);
  frame({ type: "snapshot", state: structuredClone(server) });
  const visited: StopId[] = [];
  return {
    src, server, jobs, socket, visited, frame,
    advance(ms: number) { clock += ms; },
    /** The server changed items (and maybe more): broadcast items, pipeline and stations as one patch. */
    patch(items: Item[], extra: Partial<FactoryState> = {}) {
      for (const it of items) { const i = server.items.findIndex(x => x.id === it.id); if (i < 0) server.items.push(it); else server.items[i] = it; }
      Object.assign(server, extra); derive();
      frame({ type: "patch", patch: { items, pipeline: server.pipeline, stations: server.stations, ...extra } });
    },
    deck(deck: Move[]) {
      server.deck = deck; server.move = deck[0] ?? null; derive();
      frame({ type: "deck", deck });
      if (deck[0]) frame({ type: "move", move: deck[0] });
      frame({ type: "patch", patch: { pipeline: server.pipeline } });
    },
    resolved(moveId: string) { server.deck = (server.deck ?? []).filter(m => m.id !== moveId); frame({ type: "move_resolved", moveId, actor: "player" }); },
    /** What the player sees once the conveyor has played out: the engine's crate-arrive events, one machine at a time. */
    settle() {
      let view = oneAsk(src.view()) as LiveDeckView;
      for (let i = 0; i < 60; i++) {
        if (view.work && visited.at(-1) !== view.work.stop) visited.push(view.work.stop);
        if (view.work) src.arrive(view.work.id, view.work.stop);
        src.step?.(0.8); clock += 800;
        const next = oneAsk(src.view()) as LiveDeckView;
        const still = !next.followItem && !view.followItem && next.work?.stop === view.work?.stop;
        view = next;
        if (still && i > 2) break;
      }
      if (view.work && visited.at(-1) !== view.work.stop) visited.push(view.work.stop);
      return view;
    },
    sent: () => socket.sent.filter(s => s !== "ping").map(s => JSON.parse(s) as { type: string; moveId?: string; optionId?: string }),
  };
}
/** Each station's status lamp, the way the engine lights it (engine.ts drawStation -> stations/status.ts machineSignal). */
const lamps = (view: LiveDeckView) => Object.fromEntries(view.stops.map(s => [s.id, COLOR.get(machineSignal(view.jam === s.id ? "jammed" : s.state, needsAttention(view, s.id)))]));
const only = (lit: Partial<Record<StopId, string>>) => Object.fromEntries(STOPS.map(id => [id, lit[id] ?? "off"]));

describe("the live loop from a scripted socket feed", () => {
  test("Shippy's card, yes, then one fix rides Repo to Launch with the right card, station and color at every step", async () => {
    const live = await liveDeck({ holdingBack: holding, deck: [shippyCard], move: shippyCard });
    const fix = issue(51, "Fix the failing CI check on PR #39");

    // 1. Shippy's recommendation: the one card, Meta-guided, waiting at Repo (yellow), nothing else lit or red
    let view = live.settle();
    expect(view.card).toMatchObject({ id: shippyCard.id, title: "Have the Builder fix the failing check", guide: "shippy", stop: "repo", yes: "Continue", no: "Later", hold: false, dots: null });
    expect(view.card!.line).toBe(`Shippy: ${holding.why}`);
    expect(lamps(view)).toEqual(only({ repo: "yellow" }));
    expect(view.jam).toBeNull();
    expect(live.sent()).toEqual([]); // nothing is asked of the server until the player answers

    // 2. Yes: exactly one choose_move for that card's suggested option, and the card goes at once
    live.src.approve(view.card!.id);
    expect(live.sent()).toEqual([{ type: "choose_move", moveId: shippyCard.id, optionId: "continue" }]);
    expect(live.src.view().card).toBeNull();
    live.resolved(shippyCard.id);
    live.deck([]);
    live.patch([fix], { holdingBack: null });
    view = live.settle();
    expect(view.intake?.map(i => i.id)).toEqual(["gh-51"]); // the filed fix waits in Repo's pile
    expect(view.caption).toBe("1 issue waiting in Repo. Choose one to start.");
    expect(view.card).toBeNull();

    // 3. Planner reads it (cyan: running)
    live.jobs.push({ id: "j1", itemId: fix.id, status: "planning" });
    live.patch([{ ...fix, state: "queued" }]);
    view = live.settle();
    expect(view.work).toMatchObject({ id: "gh-51", stop: "planner", badge: "#51" });
    expect(lamps(view)).toEqual(only({ planner: "cyan" }));
    expect(view.caption).toBe("#51 · Fix the failing CI check on PR #39 · Planner is working");

    // 4. The plan waits on you: "Start build", Shippy-guided, at Builder (yellow)
    live.jobs[0].status = "awaiting_approval";
    live.patch([{ ...fix, state: "queued" }], { brain: thought(fix.id) });
    live.deck([buildCard(fix, "j1")]);
    view = live.settle();
    expect(view.card).toMatchObject({ id: "approve-j1", title: "Build #51: Fix the failing CI check on PR #39", yes: "Start build", guide: "shippy", stop: "builder", dots: null, hold: false });
    expect(view.card!.line).toContain("Files: src/cart.ts");
    expect(view.work?.stop).toBe("builder");
    expect(lamps(view)).toEqual(only({ builder: "yellow" }));
    live.src.approve("approve-j1");
    expect(live.sent().at(-1)).toEqual({ type: "choose_move", moveId: "approve-j1", optionId: "approve" });
    live.resolved("approve-j1"); live.deck([]);

    // 5. Builder writes it on the player's machine (cyan)
    live.jobs[0].status = "running"; live.jobs[0].approvedAt = NOW;
    live.patch([{ ...fix, state: "working" }]);
    view = live.settle();
    expect(view.work?.stop).toBe("builder");
    expect(lamps(view)).toEqual(only({ builder: "cyan" }));
    expect(view.card).toBeNull();

    // 6. A PR opens and Checks run (cyan), then Review (cyan)
    live.jobs[0].status = "completed";
    const pr: Item = { ...fix, state: "inspecting", prNumber: 52, prUrl: "https://github.com/fixture/demo/pull/52", machineId: "ci-1", inspection: freshInspection(HEAD) };
    live.patch([pr]);
    view = live.settle();
    expect(view.work).toMatchObject({ stop: "checks", badge: "PR52" });
    expect(lamps(view)).toEqual(only({ checks: "cyan" }));
    const verified = setStage(setStage(pr, "ci", "passed", "CI green", NOW), "verify", "passed", "Fails on base, passes on head", NOW);
    live.patch([verified]);
    view = live.settle();
    expect(view.work?.stop).toBe("review");
    expect(lamps(view)).toEqual(only({ review: "cyan" }));

    // 7. Gate: the server's own launch card. Held, plain about what it ships, yellow at the Gate
    const atGate = setStage(verified, "ai", "passed", "Regression covers the fix", NOW);
    expect(atGate.state).toBe("on_pad");
    live.patch([atGate]);
    const ship = launchMove(atGate, NOW);
    live.deck([ship]);
    view = live.settle();
    expect(view.work?.stop).toBe("gate");
    expect(view.card).toMatchObject({ id: ship.id, title: "Ship PR #52?", yes: "Ship it", hold: true, stop: "gate", dots: null });
    expect(view.card!.line).toBe("Fixes: Fix the failing CI check on PR #39, in src/. Checks passed. Hold to ship.");
    expect(lamps(view)).toEqual(only({ gate: "yellow" }));
    live.src.approve(ship.id);
    expect(live.sent().at(-1)).toEqual({ type: "choose_move", moveId: ship.id, optionId: "launch" });
    live.resolved(ship.id); live.deck([]);

    // 8. Merged: the crate rides to Launch and the rocket counts once it lands there
    const approved = { ...atGate, inspection: { ...atGate.inspection!, humanApproved: true } };
    live.patch([approved]);
    live.patch([{ ...approved, state: "launched", orbit: { since: NOW, until: NOW + 86_400_000, state: "watching", prNumber: 52 } }],
      { metrics: { rockets: 1, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 1 } });
    view = live.settle();
    expect(view.work?.stop).toBe("launch");
    expect(view.shipped).toBe(1);
    expect(view.stops.some(s => s.state === "jammed")).toBe(false);

    // 9. Shippy checks again and says so: "That's fixed", plain (no Shippy guide, no dots, no hold)
    live.deck([winCard]);
    for (let i = 0; i < 20 && live.src.view().work; i++) live.settle(); // the rocket's moment ends, the line rests
    view = live.settle();
    expect(view.card).toMatchObject({ id: "win:fix:39", title: "That's fixed", dots: null, hold: false, setup: false, guide: undefined, attention: "suggest" });
    expect(view.card!.line).toBe("Shippy checked again: #39 passes its checks now, with the fix from #51.");
    expect(view.stops.some(s => s.state === "jammed")).toBe(false);
    live.src.approve("win:fix:39");
    expect(live.sent().at(-1)).toEqual({ type: "choose_move", moveId: "win:fix:39", optionId: "continue" });

    // the whole ride, one machine at a time, never skipping one, never backwards
    expect(live.visited).toEqual(["repo", "planner", "builder", "checks", "review", "gate", "launch"]);
    // the deck only ever sent the player's four answers: nothing else that could start a model call
    expect(live.sent().map(m => m.type)).toEqual(["choose_move", "choose_move", "choose_move", "choose_move"]);
    expect(net.fetches).toEqual([]);
    live.src.close();
  });

  test("red means actually stuck: CI sends the PR back, the crate rides back to Builder and only Builder is red", async () => {
    const live = await liveDeck();
    const pr: Item = { ...issue(60, "Fix cart total"), state: "inspecting", prNumber: 61, machineId: "ci-1", inspection: freshInspection(HEAD) };
    live.patch([pr]);
    let view = live.settle();
    expect(view.work?.stop).toBe("checks");
    expect(lamps(view)).toEqual(only({ checks: "cyan" })); // a check that is still running is never red
    const failed = setStage(pr, "ci", "rework", "CI: cart.test.ts failed", NOW);
    expect(failed.state).toBe("rejected");
    live.patch([failed]);
    live.deck([reworkMove(failed, NOW)]);
    view = live.settle();
    expect(view.jam).toBe("builder");
    expect(view.work?.stop).toBe("builder"); // the rework belt runs backwards, one machine
    expect(view.stops.find(s => s.id === "builder")).toMatchObject({ state: "jammed", waiting: "BUILDER WAITING" });
    expect(Object.entries(lamps(view)).filter(([, c]) => c === "red").map(([id]) => id)).toEqual(["builder"]);
    expect(view.card?.title).toBeTruthy(); // the way out is a card, never a red screen
    // the rework starts: no longer stuck, so no longer red
    live.resolved(view.card!.id); live.deck([]);
    live.jobs.push({ id: "j2", itemId: failed.id, status: "running", approvedAt: NOW });
    live.patch([{ ...failed, state: "working" }]);
    view = live.settle();
    expect(view.jam).toBeNull();
    expect(lamps(view)).toEqual(only({ builder: "cyan" }));
    live.src.close();
  });

  test("the learn dots: plain, then 1/3, 2/3, and the 4th build starts itself with Builder green and no card", async () => {
    const { mountCard } = await import("../src/deck2d/card/card");
    const host = document.createElement("div");
    document.body.append(host);
    const card = mountCard(host, { onApprove() {}, onLater() {} });
    const face = () => host.querySelector<HTMLElement>(".ic-card:not(.ic-ghost)")!;
    const live = await liveDeck();
    const book: DeckBook = { decisions: {}, notes: [], undos: [] };
    const seen: { dots: CardView["dots"]; on: number; label: string | null; line: string }[] = [];
    for (let n = 1; n <= 3; n++) {
      const item = issue(n, `Fix typo ${n}`, { state: "queued", updatedAt: NOW + n });
      const job: PipelineJob & { approvalMoveId: string; allowedPaths: string[] } = { id: `j${n}`, itemId: item.id, status: "awaiting_approval", approvalMoveId: `approve-j${n}`, allowedPaths: ["src/cart.ts"] };
      live.jobs.push(job);
      // the server's dots for this card (factory.ts refreshDecisions -> learn.ts learnMeter)
      const plain = buildCard(item, `j${n}`), scope = learnScope(plain, "district:src", [job]);
      const move = buildCard(item, `j${n}`, learnMeter(book, plain, scope, freshWork(plain, item, [job])));
      live.patch([item], { brain: thought(item.id) });
      live.deck([move]);
      const view = live.settle();
      expect(view.card?.id).toBe(move.id);
      card.show(view.card);
      const dots = face().querySelector<HTMLElement>(".ic-dots")!;
      seen.push({ dots: view.card!.dots, on: dots.hidden ? 0 : dots.querySelectorAll(".ic-dot.on").length, label: dots.hidden ? null : dots.getAttribute("aria-label"), line: view.card!.line });
      expect(lamps(view).builder).toBe("yellow");
      live.src.approve(move.id);
      expect(learnFromYes(book, move, scope, NOW + n, true, "fixture")).toBe(n === 3);
      live.resolved(move.id); live.deck([]);
      job.status = "completed";
      live.patch([{ ...item, state: "launched", updatedAt: NOW + n }], { learned: learnedList(book) });
      live.settle();
    }
    expect(seen.map(s => s.dots)).toEqual([null, { have: 1, need: 3 }, { have: 2, need: 3 }]);
    expect(seen.map(s => s.on)).toEqual([0, 1, 2]);
    expect(seen.map(s => s.label)).toEqual([null, "1 of 3 approvals toward automatic", "2 of 3 approvals toward automatic"]);
    expect(seen[1].line).toEndWith(LEARN.line(2));
    expect(seen[2].line).toEndWith(LEARN.line(1));
    // the 4th: the factory approves it itself (factory.ts noteAutoRun), so there is no card, the Builder runs green
    const fourth = issue(4, "Fix typo 4", { state: "working", updatedAt: NOW + 10 });
    const key = Object.keys(book.auto ?? {})[0];
    expect(key).toBe("build|district:src|approve_runner_job");
    noteAutoRun(book, fourth.id, key);
    live.jobs.push({ id: "j4", itemId: fourth.id, status: "running", approvedAt: NOW + 10 });
    live.patch([fourth], { learned: learnedList(book) });
    live.advance(10_000); // past the level-up's happy beat
    const view = live.settle();
    expect(view.card).toBeNull();
    expect(view.work).toMatchObject({ id: "gh-4", stop: "builder", auto: true });
    expect(view.stops.find(s => s.id === "builder")).toMatchObject({ state: "auto", automated: true });
    expect(lamps(view)).toEqual(only({ builder: "green" }));
    expect(view.caption).toBe(LEARN.ranItself("#4"));
    expect(live.sent().map(m => m.moveId)).toEqual(["approve-j1", "approve-j2", "approve-j3"]); // three yeses, never a fourth
    card.destroy();
    live.src.close();
  });

  for (const who of ["account", "site"] as const) test(`the ${who} cap card renders plainly: Shippy is done thinking for today, nothing red, nothing held`, async () => {
    const retry = { day: utcDay(NOW), failures: 1, retryAt: nextPlanningDay(NOW), kind: "cap" as const, reason: `${who} daily dollar budget reached` };
    const deck = plannerRestDeck([], retry, NOW);
    expect(deck.map(m => m.title)).toEqual(["Shippy is done thinking for today"]);
    const live = await liveDeck();
    live.deck(deck);
    const view = live.settle();
    const why = who === "account" ? "This account used today's five dollars of AI. He's back at 00:00 UTC. You can keep shipping what's ready."
      : "Shiptorio used today's AI for everyone. He's back at 00:00 UTC. You can keep shipping what's ready.";
    expect(view.card).toMatchObject({ id: "planner-rest", title: "Shippy is done thinking for today", line: `Shippy: ${why}`, dots: null, hold: false, setup: false, guide: undefined });
    expect(view.jam).toBeNull();
    expect(Object.values(lamps(view))).not.toContain("red");
    // yellow means waiting on you: a resting Shippy asks nothing, so no station glows for his card
    expect((view as { attention?: string[] }).attention).toEqual([]);
    expect(Object.values(lamps(view))).not.toContain("yellow");
    const { mountCard } = await import("../src/deck2d/card/card");
    const host = document.createElement("div");
    document.body.append(host);
    const card = mountCard(host, { onApprove() {}, onLater() {} });
    card.show(view.card);
    const face = host.querySelector<HTMLElement>(".ic-card:not(.ic-ghost)")!;
    expect(face.querySelector(".ic-title")!.textContent).toBe("Shippy is done thinking for today");
    expect(face.querySelector(".ic-line")!.textContent).toBe(`Shippy: ${why}`);
    expect(face.classList.contains("hold")).toBe(false);
    expect(face.classList.contains("ic-story")).toBe(false);
    expect(face.querySelector<HTMLElement>(".ic-dots")!.hidden).toBe(true);
    expect(face.querySelector(".ic-shippy-guide")).toBeNull(); // no Meta-guided Shippy on a status card
    expect([...face.querySelectorAll("button")].map(b => b.textContent?.replace(/[←→]/g, "").trim())).toEqual(["Later", "Continue"]);
    card.destroy();
    // real work always comes before the cap card: a ready Ship it is still the top card
    const pr = setStage(setStage(setStage({ ...issue(70, "Fix cart"), state: "inspecting", prNumber: 71, machineId: "ci-1", inspection: freshInspection(HEAD) }, "ci", "passed", "ok", NOW), "verify", "passed", "ok", NOW), "ai", "passed", "ok", NOW);
    live.patch([pr]);
    const ship = launchMove(pr, NOW);
    live.deck(plannerRestDeck([ship], retry, NOW));
    expect(live.settle().card?.id).toBe(ship.id);
    live.src.close();
  });

  test("\"That's fixed\" renders plainly on the card too: one Shippy, no guide, no dots", async () => {
    const live = await liveDeck();
    live.deck([winCard]);
    const view = live.settle();
    const { mountCard } = await import("../src/deck2d/card/card");
    const host = document.createElement("div");
    document.body.append(host);
    const card = mountCard(host, { onApprove() {}, onLater() {} });
    card.show(view.card);
    const face = host.querySelector<HTMLElement>(".ic-card:not(.ic-ghost)")!;
    expect(face.querySelector(".ic-title")!.textContent).toBe("That's fixed");
    expect(face.querySelector(".ic-line")!.textContent).toBe("Shippy checked again: #39 passes its checks now, with the fix from #51.");
    expect(face.querySelector(".ic-shippy-guide")).toBeNull();
    expect(face.querySelector<HTMLElement>(".ic-dots")!.hidden).toBe(true);
    card.destroy();
    live.src.close();
  });
});

// ---------- 4. the locked canvas sizes ----------
describe("the story camera at the locked canvas sizes", () => {
  // engine.ts subject(): a station shot frames 900 world units around its stop, Shippy 560, Launch 1100
  const shots = [...STOPS.filter(s => s !== "launch").map(id => ({ name: id, x: STOP_X[id], y: FLOOR_Y - 90, width: 900 })),
    { name: "shippy", x: STOP_X.repo - 150, y: FLOOR_Y - 7, width: 560 }, { name: "launch", x: STOP_X.launch - 70, y: 100, width: 1100 }];
  for (const [label, size] of [["desktop", CANVAS], ["phone", CANVAS_PORTRAIT]] as const) for (const dpr of [1, 2, 3]) {
    test(`${label} ${size.w}x${size.h} @${dpr}: every tour shot is a whole-pixel zoom with its subject above the card`, () => {
      const screen = { w: size.w, h: size.h, dpr, artPx: 5, pixel: true };
      for (const shot of shots) {
        const f = frameShot(shot, screen);
        const k = f.s * 5 * dpr; // device px per art px
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
        expect(k).toBeGreaterThanOrEqual(1);
        const viewW = size.w / f.s, viewH = size.h / f.s;
        // desktop rounds the zoom down, so the whole subject fits across; a phone rounds to the nearest whole zoom and may
        // trim the subject's edges, never more than a fifth of it
        expect(viewW).toBeGreaterThanOrEqual(shot.width * (label === "phone" ? 0.8 : 1) - 1e-6);
        const top = f.y - viewH / 2;
        expect((shot.y - top) / viewH).toBeLessThan(0.5); // above the middle: the card owns the bottom of the screen
        expect(shot.y).toBeGreaterThan(top);
      }
    });
  }
  test("the card's pixel scale is the phone scale at both locked sizes, and the desktop one only on wide windows", () => {
    expect(cardScale(CANVAS.w)).toBe(2);
    expect(cardScale(CANVAS_PORTRAIT.w)).toBe(2);
    expect(cardScale(CANVAS.w * 2)).toBe(3);
  });
});
