// Bug bash (#54): the loop has to survive what happens on camera. Each test here failed before its fix.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { FactoryState, Item, ServerToWeb } from "@shiptorio/shared";
import type { CardView, DeckView } from "../src/deck2d/contract";
import { createLiveSource, UNCONFIRMED_MS } from "../src/deck2d/data/source";
import { createPayoff, PAYOFF } from "../src/deck2d/payoff";

const item = (id: string, state: Item["state"], over: Partial<Item> = {}): Item => ({ id, kind: "bug", source: "github_issue", title: id, district: "web", state, attempts: 0, updatedAt: 1, ...over });
const state = (rockets: number, items: Item[] = []): FactoryState => ({
  repo: "r3dbars/testing", baseBranch: "main", districts: [], belts: [], items, power: [], machines: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 0,
  metrics: { rockets, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: rockets },
});
const memory = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) }; };

/** The page's own order: the frame loop draws before the socket's first snapshot lands. */
function page(store = memory()) {
  let receive!: (m: ServerToWeb) => void;
  const src = createLiveSource({ kind: "live", repo: "r3dbars/testing", scenario: "quiet-morning" }, { connect: (_cfg, onMessage) => { receive = onMessage; return { send() {}, close() {} }; } });
  const payoff = createPayoff({ every: true, store, day: () => "2026-10-29" });
  const captions: (string | null)[] = [];
  const frames = (seconds: number) => { let v!: DeckView; for (let t = 0; t < seconds; t += 0.05) { src.step?.(0.05); v = payoff.view(src.view(), 0.05); captions.push(v.caption); } return v; };
  return { src, payoff, store, captions, frames, receive: (m: ServerToWeb) => receive(m) };
}

test("reload mid-step: the first snapshot is not a ship (no old rocket, no fake 'Shipped' beat)", () => {
  const p = page();
  const loading = p.frames(1); // the socket is still connecting
  expect((loading as DeckView & { loading?: boolean }).loading).toBe(true); // the engine and payoff skip this as a baseline
  p.receive({ type: "snapshot", state: state(12) });
  p.frames(PAYOFF.noRocket + PAYOFF.beat);
  expect(p.captions.filter(c => c?.startsWith("Shipped"))).toEqual([]);
  expect(p.store.get("shiptorio.deck.shippedToday")).toBeNull(); // and nothing was counted as today's
  // a real ship after that still gets its beat
  p.receive({ type: "snapshot", state: state(13) });
  expect(p.frames(PAYOFF.noRocket + 0.2).caption).toBe("Shipped. That's your first today.");
});

test("reload while a crate is mid-line: the first loaded view already carries the real ship count", () => {
  const p = page();
  p.frames(0.5);
  p.receive({ type: "snapshot", state: { ...state(12, [item("gh-16", "working", { updatedAt: Date.now() })]), pipeline: [{ id: "builder", state: "working", cause: "building", itemIds: ["gh-16"], moveIds: [] }] } });
  const v = p.frames(0.1);
  expect(v.shipped).toBe(12); // a 0 here makes the engine launch 12 rockets once this crate reaches Launch
});

test("two tabs: one ship counts once toward today", () => {
  const store = memory();
  const a = page(store), b = page(store);
  for (const tab of [a, b]) { tab.receive({ type: "snapshot", state: state(4) }); tab.frames(0.2); }
  for (const tab of [a, b]) tab.receive({ type: "snapshot", state: state(5) });
  const seen = [a, b].map(tab => tab.frames(PAYOFF.noRocket + 0.2).caption);
  expect(seen).toEqual(["Shipped. That's your first today.", "Shipped. That's your first today."]);
  expect(JSON.parse(store.get("shiptorio.deck.shippedToday")!).n).toBe(1);
});

test("a decision the server never confirms brings its card back instead of hiding it until reload", () => {
  let clock = 1_000_000, receive!: (m: ServerToWeb) => void;
  const sent: unknown[] = [];
  const src = createLiveSource({ kind: "live", repo: "r3dbars/testing", scenario: "quiet-morning" }, { now: () => clock, connect: (_cfg, onMessage) => { receive = onMessage; return { send: m => sent.push(m), close() {} }; } });
  const move = { id: "m1", title: "Start build?", why: "", createdAt: 0, options: [{ id: "go", label: "Go", recommended: true, actions: [{ tool: "approve_runner_job", args: {}, reason: "" }] }] };
  receive({ type: "snapshot", state: { ...state(0), deck: [move] } });
  src.approve("m1");
  src.approve("m1"); // double tap: still one send
  expect(sent).toHaveLength(1);
  expect(src.view().card).toBeNull();
  clock += 30_000;
  expect(src.view().card).toBeNull(); // still landing: no flash back
  clock += UNCONFIRMED_MS;
  expect(src.view().card?.id).toBe("m1"); // the socket dropped it: the player can answer again
  src.approve("m1");
  expect(sent).toHaveLength(2);
});

// The card needs a DOM (same setup as deck-card-dom.test.ts).
const KEYS = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "matchMedia"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;
beforeAll(() => {
  win = new Window({ url: "http://localhost/" });
  for (const k of KEYS) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of KEYS) Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: (win as unknown as Record<string, unknown>)[k] });
});
afterAll(async () => {
  for (const k of KEYS) { const d = saved.get(k); if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
  await win.happyDOM.close();
});

test("tap Later, then the same call comes back: the card shows it again (story stalled forever before)", async () => {
  const { mountCard } = await import("../src/deck2d/card/card");
  const host = document.createElement("div"); document.body.appendChild(host);
  const got: string[] = [];
  const h = mountCard(host, { onApprove: id => got.push(`approve:${id}`), onLater: id => got.push(`later:${id}`) });
  const live = () => host.querySelector<HTMLElement>(".ic-card:not(.ic-ghost):not(.ic-empty)");
  const call: CardView = { id: "story-call-2", title: "Approve fix for login typo?", dots: { have: 1, need: 3 }, line: "", stop: "review" };
  h.show(call);
  live()!.querySelector<HTMLButtonElement>(".later")!.click();
  live()?.querySelector<HTMLButtonElement>(".approve")?.click(); // a second tap lands on nothing
  h.show(call); // the source hasn't caught up yet: still no second answer
  expect(live()).toBeNull();
  h.show(null); // the story parks it for a few seconds
  h.show({ ...call }); // then deals the same call again
  expect(live()?.dataset.card).toBe("story-call-2");
  live()!.querySelector<HTMLButtonElement>(".approve")!.click();
  expect(got).toEqual(["later:story-call-2", "approve:story-call-2"]);
  h.destroy();
});
