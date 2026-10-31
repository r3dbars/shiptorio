// The iron card as a story card (CardView.shippy, card/story.ts): Shippy inside the plate, his line typing out, a tap
// finishes the line first and then goes on, Later only when `no` is set, and every pose has real frames.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { CardView } from "../src/deck2d/contract";

const KEYS = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "matchMedia"] as const;
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

const LINE = "Hi, I'm Shippy. This game mirrors your GitHub repo.";
const story = (id: string, more: Partial<CardView> = {}): CardView => ({ id, shippy: "wave", title: "", line: LINE, dots: null, stop: "repo", ...more });

async function mount() {
  const { mountCard } = await import("../src/deck2d/card/card");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const got: string[] = [];
  const h = mountCard(host, { onApprove: (id) => got.push(`approve:${id}`), onLater: (id) => got.push(`later:${id}`) });
  const live = () => host.querySelector(".ic-card:not(.ic-ghost)") as HTMLElement;
  return { host, got, h, live };
}

test("Shippy stands inside the card, Next only, the whole line goes to screen readers", async () => {
  const t = await mount();
  t.h.show(story("hi"));
  const c = t.live();
  expect(c.classList.contains("ic-story")).toBe(true);
  expect(c.querySelector("canvas.ic-story-shippy")).not.toBeNull();
  expect(c.querySelector(".ic-btn.approve b")!.textContent).toBe("Next");
  expect((c.querySelector(".ic-btn.later") as HTMLElement).hidden).toBe(true);
  expect(c.getAttribute("aria-label")).toBe(LINE);
  expect((c.querySelector(".ic-title") as HTMLElement).hidden).toBe(true);
  t.h.destroy();
});

test("the first tap finishes a typing line, the second goes on; ← does nothing without a no", async () => {
  const t = await mount();
  t.h.show(story("hi"));
  const line = t.live().querySelector(".ic-line")!;
  // the whole line is laid out from the start (no re-wrap jitter); the part still to type is hidden
  expect(line.textContent).toBe(LINE);
  expect(line.querySelector(".ic-untyped")!.textContent!.length).toBeGreaterThan(0);
  t.live().click();
  expect(line.textContent).toBe(LINE);
  expect(t.got).toEqual([]);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  expect(t.got).toEqual([]);
  t.live().click();
  expect(t.got).toEqual(["approve:hi"]);
  t.h.destroy();
});

test("with a no label, Skip shows and ← answers later; → finishes then goes on", async () => {
  const t = await mount();
  t.h.show(story("meta", { shippy: "talk", no: "Skip", yes: "Got it" }));
  const c = t.live();
  expect((c.querySelector(".ic-btn.later") as HTMLElement).hidden).toBe(false);
  expect(c.querySelector(".ic-btn.later b")!.textContent).toBe("Skip");
  expect(c.querySelector(".ic-btn.approve b")!.textContent).toBe("Got it");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  expect(t.got).toEqual([]);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  expect(t.got).toEqual(["approve:meta"]);
  t.h.show(story("meta2", { no: "Skip" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  expect(t.got).toEqual(["approve:meta", "later:meta2"]);
  t.h.destroy();
});

test("the same id coming back as a plain card drops Shippy", async () => {
  const t = await mount();
  t.h.show(story("x"));
  t.h.show({ id: "x", title: "Approve x?", dots: { have: 0, need: 3 }, line: "plain", stop: "review" });
  const c = t.live();
  expect(c.classList.contains("ic-story")).toBe(false);
  expect(c.querySelector(".ic-story-shippy")).toBeNull();
  expect((c.querySelector(".ic-btn.later") as HTMLElement).hidden).toBe(false);
  t.h.destroy();
});

test("every pose moves while talking and lands on real frames", async () => {
  const { storyFrame, typedChars } = await import("../src/deck2d/card/story");
  const { pxFrame } = await import("../src/deck2d/shippy/pixel");
  for (const pose of ["talk", "wave", "point", "happy"] as const) {
    const seen = new Set<string>();
    for (let t = 0; t < 40; t++) {
      for (const talking of [true, false]) {
        const f = storyFrame(pose, t, talking);
        expect(pxFrame(f.frame).cells.size).toBeGreaterThan(50);
        if (talking) seen.add(`${f.frame}:${f.dy}`);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  }
  expect(typedChars("abc", 0)).toBe(0);
  expect(typedChars("abc", 10_000)).toBe(3);
});

test("a double tap's second half doesn't skip the next story card (QA 2026-10-31: Reduce Motion skipped Powered by Meta)", async () => {
  const { STORY_TAP_GUARD_MS } = await import("../src/deck2d/card/card");
  const t = await mount();
  t.h.show(story("hi"));
  t.live().click(); // finishes the line
  t.live().click(); // goes on
  expect(t.got).toEqual(["approve:hi"]);
  t.h.show(story("meta"));
  t.live().click(); // finishes the line (with Reduce Motion it is already whole)
  t.live().click(); // the tail of the double tap: too soon after the last answer, ignored
  expect(t.got).toEqual(["approve:hi"]);
  await new Promise((r) => setTimeout(r, STORY_TAP_GUARD_MS + 20));
  t.live().click();
  expect(t.got).toEqual(["approve:hi", "approve:meta"]);
  t.h.destroy();
});
