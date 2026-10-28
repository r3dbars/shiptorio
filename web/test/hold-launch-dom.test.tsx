// The real HoldLaunch component in a DOM, on a fake clock: what the button says and does must follow the
// controller exactly. Globals are put back afterwards so other test files keep their window-less world.
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { HoldClock } from "../src/ui/holdLaunch";

const KEYS = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MouseEvent", "KeyboardEvent", "PointerEvent", "FocusEvent", "Event", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;

beforeAll(() => {
  win = new Window({ url: "http://localhost/" });
  const g = globalThis as Record<string, unknown>;
  for (const k of KEYS) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of KEYS) if (k !== "IS_REACT_ACT_ENVIRONMENT") Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: (win as unknown as Record<string, unknown>)[k] });
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
  g.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  for (const k of KEYS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
  await win.happyDOM.close();
});

function fakeClock() {
  let t = 0;
  let next = 1;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const frames = new Map<number, () => void>();
  const clock: HoldClock = {
    now: () => t,
    raf: (cb) => { frames.set(next, cb); return next++; },
    caf: (id) => { frames.delete(id); },
    after: (ms, cb) => { timers.set(next, { at: t + ms, cb }); return next++; },
    clear: (id) => { timers.delete(id); },
  };
  const to = (ms: number) => {
    while (t < ms) {
      t = Math.min(ms, t + 16);
      for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.cb(); }
      const due = [...frames.values()];
      frames.clear();
      due.forEach((f) => f());
    }
  };
  return { clock, to, timers };
}

async function mount(clock: HoldClock, card = "launch:7") {
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { HoldLaunch } = await import("../src/ui/Attention");
  const { SoundCaptions } = await import("../src/ui/SoundCaptions");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const launched: string[] = [];
  const render = (c: string) => act(() => root.render(<><HoldLaunch card={c} label="Launch #7: webhook tests" clock={clock} onLaunch={(id) => launched.push(id)} /><SoundCaptions /></>));
  await render(card);
  const button = () => host.querySelector("button.alaunch") as HTMLButtonElement;
  const fire = (ev: Event) => act(() => { button().dispatchEvent(ev); });
  return {
    launched,
    render,
    button,
    label: () => button().getAttribute("aria-label") ?? "",
    caption: () => host.querySelector('[aria-label="Sound captions"]')?.textContent ?? "",
    act,
    ax: () => fire(new MouseEvent("click", { bubbles: true, detail: 0 })),
    key: (type: "keydown" | "keyup") => fire(new KeyboardEvent(type, { key: " ", bubbles: true })),
    unmount: () => act(() => root.unmount()),
  };
}

test("screen reader arm, Space press, re-arm: the old window can't flip the label while a click would still launch", async () => {
  const { clock, to, timers } = fakeClock();
  const b = await mount(clock);
  await b.ax(); // t=0: armed
  expect(b.label()).toStartWith("Activate again to launch");
  await b.act(() => to(1000));
  await b.key("keydown"); // a physical press disarms the confirm
  expect(b.label()).toStartWith("Hold to launch");
  await b.act(() => to(1100));
  await b.key("keyup"); // early release: no launch
  await b.act(() => to(2000));
  await b.ax(); // re-armed until 7000
  expect(b.label()).toStartWith("Activate again to launch");
  await b.act(() => to(5000)); // the first window's old end: nothing changes
  expect(b.label()).toStartWith("Activate again to launch");
  expect(timers.size).toBe(1);
  await b.act(() => to(7016)); // the second window ends: the label and the controller agree it's over
  expect(b.label()).toStartWith("Hold to launch");
  await b.ax(); // so this click arms again instead of launching
  expect(b.launched).toEqual([]);
  expect(b.label()).toStartWith("Activate again to launch");
  await b.act(() => to(8000));
  await b.ax(); // the second activation inside the window is the consent
  expect(b.launched).toEqual(["launch:7"]);
  await b.unmount();
  expect(timers.size).toBe(0);
});

test("a hold on one card never launches the card that replaces it", async () => {
  const { clock, to } = fakeClock();
  const b = await mount(clock, "launch:7");
  await b.key("keydown");
  await b.act(() => to(400));
  await b.render("launch:8"); // same element, new card underneath
  await b.act(() => to(2000));
  await b.key("keyup");
  expect(b.launched).toEqual([]);
  await b.unmount();
});

test("a full keyboard hold launches once and only after the ring fills", async () => {
  const { clock, to } = fakeClock();
  const b = await mount(clock);
  await b.key("keydown");
  await b.act(() => to(700));
  expect(b.launched).toEqual([]);
  await b.act(() => to(900));
  await b.key("keyup");
  await b.ax(); // the click a browser fires after the key is not a second launch
  expect(b.launched).toEqual(["launch:7"]);
  await b.unmount();
});


test("a real full hold plays exactly four countdown clanks and submits one request", async () => {
  const { sound } = await import("../src/sound/engine");
  const tick = spyOn(sound, "holdTick");
  const play = spyOn(sound, "play");
  const { clock, to } = fakeClock();
  const b = await mount(clock);
  try {
    await b.key("keydown");
    await b.act(() => to(800));
    await b.key("keyup");
    await b.ax();
    expect(tick.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 3]);
    expect(play.mock.calls.filter(([s]) => s === "hold_go")).toHaveLength(1);
    expect(play.mock.calls.filter(([s]) => s === "hold_cancel")).toHaveLength(0);
    expect(b.launched).toEqual(["launch:7"]);
  } finally { await b.unmount(); tick.mockRestore(); play.mockRestore(); }
});

test("cancel then re-arm resets the countdown and captions distinguish requests from launches", async () => {
  const { sound } = await import("../src/sound/engine");
  const tick = spyOn(sound, "holdTick");
  const play = spyOn(sound, "play");
  const { clock, to } = fakeClock();
  const b = await mount(clock);
  const captionsSettle = () => b.act(() => new Promise<void>((done) => setTimeout(done, 5)));
  try {
    await b.key("keydown");
    await captionsSettle();
    expect(b.caption()).toBe("Launch hold started");
    await b.act(() => to(160));
    await b.key("keyup");
    await captionsSettle();
    expect(b.caption()).toBe("Launch hold cancelled");
    expect(b.launched).toEqual([]);
    expect(tick.mock.calls.map(([i]) => i)).toEqual([0]);
    tick.mockClear();
    await b.key("keydown");
    await captionsSettle();
    expect(b.caption()).toBe("Launch hold started");
    await b.act(() => to(960));
    await captionsSettle();
    expect(tick.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 3]);
    expect(b.caption()).toBe("Launch requested");
    expect(play.mock.calls.filter(([s]) => s === "hold_cancel")).toHaveLength(1);
    expect(play.mock.calls.filter(([s]) => s === "hold_go")).toHaveLength(1);
    expect(b.launched).toEqual(["launch:7"]);
  } finally { await b.unmount(); tick.mockRestore(); play.mockRestore(); }
});
