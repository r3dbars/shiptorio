// The 2D deck's iron card (web/src/deck2d/card/card.ts) in a real DOM: swipe/tap/keys answer once per card, an approve
// fills the next dot on the flying ghost, and running dry right after an answer says "All caught up".
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { CardView } from "../src/deck2d/contract";

const KEYS = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "matchMedia"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;
beforeAll(() => {
  win = new Window({ url: "http://localhost/" });
  for (const k of KEYS) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of KEYS) Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: (win as unknown as Record<string, unknown>)[k] });
});
afterAll(async () => {
  for (const k of KEYS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
  await win.happyDOM.close();
});

const card = (id: string, have = 0): CardView => ({ id, title: `Approve ${id}?`, dots: { have, need: 3 }, line: "Approve 2 more like this and it's automatic.", stop: "review" });

async function mount() {
  const { mountCard } = await import("../src/deck2d/card/card");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const got: string[] = [];
  const h = mountCard(host, { onApprove: (id) => got.push(`approve:${id}`), onLater: (id) => got.push(`later:${id}`) });
  const live = () => host.querySelector(".ic-card:not(.ic-ghost)") as HTMLElement | null;
  return { host, got, h, live };
}

test("swipeAnswer: past the line or a flick answers, a nudge does not", async () => {
  const { swipeAnswer } = await import("../src/deck2d/card/card");
  expect(swipeAnswer(200, 400)).toBe("approve");
  expect(swipeAnswer(-200, 400)).toBe("later");
  expect(swipeAnswer(40, 400)).toBeNull();
  expect(swipeAnswer(30, 400, 3)).toBeNull(); // a jitter is not a flick
  expect(swipeAnswer(50, 400, 1.2)).toBe("approve");
  expect(swipeAnswer(-50, 400, -1.2)).toBe("later");
});

test("a tap answers once; the ghost shows the next dot filled", async () => {
  const t = await mount();
  t.h.show(card("a"));
  expect(t.live()!.querySelector(".ic-title")!.textContent).toBe("Approve a?");
  const approve = t.live()!.querySelector(".ic-btn.approve") as HTMLButtonElement;
  approve.click();
  approve.click();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  expect(t.got).toEqual(["approve:a"]);
  const ghost = t.host.querySelector(".ic-ghost.approve")!;
  expect(ghost.querySelectorAll(".ic-dot.on").length).toBe(1);
  expect(ghost.querySelector(".ic-dot.pop")).not.toBeNull();
  // the source re-sending the answered card is ignored
  t.h.show(card("a"));
  expect(t.live()).toBeNull();
  t.h.destroy();
});

test("arrow keys answer, and a dry deck right after says All caught up", async () => {
  const t = await mount();
  t.h.show(card("b"));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  expect(t.got).toEqual(["later:b"]);
  t.h.show(null);
  expect(t.live()?.textContent).toContain("All caught up");
  t.h.show(card("c"));
  expect(t.live()?.querySelector(".ic-title")?.textContent).toBe("Approve c?");
  t.h.destroy();
  expect(t.host.children.length).toBe(0);
});

test("Shippy talking (guide cards) is not a queue: no All caught up after its card while the next thing builds", async () => {
  const t = await mount();
  t.h.show({ id: "tour-0-2", title: "Software is a factory", line: "Let's build your line.", dots: null, stop: "repo", yes: "Build it", guide: "shippy" });
  (t.live()!.querySelector(".ic-btn.approve") as HTMLButtonElement).click();
  expect(t.got).toEqual(["approve:tour-0-2"]);
  t.h.show(null);
  expect(t.live()).toBeNull();
  t.h.destroy();
});

test("a swipe right past the line approves; a short drag snaps back", async () => {
  const t = await mount();
  t.h.show(card("d"));
  const el = t.live()!;
  const ptr = (type: string, x: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 100, pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" }));
  ptr("pointerdown", 100); ptr("pointermove", 130); ptr("pointerup", 130);
  expect(t.got).toEqual([]);
  expect(el.style.transform).toBe("");
  ptr("pointerdown", 100); ptr("pointermove", 200); ptr("pointermove", 400); ptr("pointerup", 400);
  expect(t.got).toEqual(["approve:d"]);
  t.h.destroy();
});

test("yes/no labels show on the buttons", async () => {
  const t = await mount();
  t.h.show({ ...card("e"), yes: "Show me my repo", no: "Replay" } as CardView);
  expect(t.live()!.querySelector(".ic-btn.approve")!.textContent).toContain("Show me my repo");
  expect(t.live()!.querySelector(".ic-btn.later")!.textContent).toContain("Replay");
  t.h.destroy();
});

test("a hold card needs a held press or a full swipe, never a tap or a flick", async () => {
  const { swipeAnswer, HOLD_MS } = await import("../src/deck2d/card/card");
  expect(swipeAnswer(150, 400, 3, true)).toBeNull(); // past the normal line, flicked: still no
  expect(swipeAnswer(260, 400, 0, true)).toBe("approve");
  expect(swipeAnswer(-150, 400, 0, true)).toBe("later"); // Later stays easy
  const t = await mount();
  t.h.show({ ...card("f"), hold: true } as CardView);
  const approve = t.live()!.querySelector(".ic-btn.approve") as HTMLButtonElement;
  const press = (type: string) => approve.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 2, isPrimary: true, button: 0, pointerType: "touch" }));
  approve.click();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" }));
  press("pointerdown"); await sleep(HOLD_MS / 3); press("pointerup");
  await sleep(HOLD_MS);
  expect(t.got).toEqual([]);
  press("pointerdown"); await sleep(HOLD_MS + 100);
  expect(t.got).toEqual(["approve:f"]);
  t.h.destroy();
});

test("?px=1 draws the pixel card (canvas plate, buttons, dots); ?px=0 keeps the painted one", async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("http://localhost/deck.html?px=1") });
    const t = await mount();
    t.h.show(card("g", 1));
    expect(t.host.querySelector(".ironcard")!.classList.contains("px")).toBe(true);
    expect(t.live()!.querySelectorAll(":scope > .ic-pxbg").length).toBe(1);
    expect(t.live()!.querySelectorAll(".ic-btn > .ic-pxbg").length).toBe(2);
    expect(t.live()!.querySelectorAll(".ic-dot > .ic-pxdot").length).toBe(3);
    t.h.destroy();
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("http://localhost/deck.html?px=0") });
    const u = await mount();
    u.h.show(card("h"));
    expect(u.host.querySelector(".ironcard")!.classList.contains("px")).toBe(false);
    expect(u.live()!.querySelector(".ic-pxbg")).toBeNull();
    u.h.destroy();
  } finally {
    if (had) Object.defineProperty(globalThis, "location", had);
    else delete (globalThis as Record<string, unknown>).location;
  }
});

test("only Meta-guided cards mount Shippy; replacing or answering cleans him up", async () => {
  const t = await mount();
  t.h.show(card("setup"));
  expect(t.host.querySelector(".ic-shippy-guide")).toBeNull();
  t.h.show({ ...card("meta"), guide: "shippy" });
  const sprite = t.live()!.querySelector(".ic-shippy-guide");
  expect(sprite?.getAttribute("aria-hidden")).toBe("true");
  t.h.show({ ...card("meta"), guide: "shippy", line: "Updated recommendation" });
  expect(t.live()!.querySelector(".ic-shippy-guide")).toBe(sprite);
  t.h.show(card("ordinary"));
  expect(t.host.querySelector(".ic-shippy-guide")).toBeNull();
  t.h.show({ ...card("meta-again"), guide: "shippy" });
  (t.live()!.querySelector(".approve") as HTMLButtonElement).click();
  expect(t.host.querySelector(".ic-shippy-guide")).toBeNull();
  t.h.destroy();
});
