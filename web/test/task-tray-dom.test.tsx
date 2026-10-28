// The simple screen's task tray (TaskTray.tsx) in a real DOM: a drag or a button press belongs to the card it started
// on. If the deck swaps that card out mid-gesture (a websocket patch), letting go must send nothing for the card that
// took its place, launch cards included. Stray pointers, lost capture and a blurred window end the gesture too.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Move, WebToServer } from "@shiptorio/shared";

const KEYS = ["window", "document", "navigator", "localStorage", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent", "PointerEvent", "KeyboardEvent", "FocusEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"] as const;
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

const build = (id: string): Move => ({
  id, itemId: `item-${id}`, createdAt: 1, kind: "build", stage: "build", attention: "approve", title: `Build ${id}`,
  options: [{ id: "go", label: `Build ${id} now`, recommended: true, actions: [{ tool: "approve_plan", args: { itemId: `item-${id}` }, reason: "test" }] }],
});
const launch = (id: string): Move => ({
  id, itemId: `item-${id}`, createdAt: 1, kind: "launch", stage: "pad", attention: "approve", title: `Launch ${id}`,
  options: [{ id: "ship", label: `Launch ${id}`, recommended: true, actions: [{ tool: "request_merge", args: { itemId: `item-${id}` }, reason: "test" }] }],
});

async function mount(first: Move[]) {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { TaskTray } = await import("../src/ui/TaskTray");
  try { localStorage.setItem("shiptorio:simple-went", "1"); } catch { /* no storage */ }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const sent: WebToServer[] = [];
  const render = (deck: Move[]) => act(() => root.render(<TaskTray deck={deck} send={(m) => sent.push(m)} onFocus={() => {}} />));
  await render(first);
  const card = () => host.querySelector(".tasktray section.task") as HTMLElement;
  const title = () => card().querySelector(".att") as HTMLElement;
  const ptr = (target: Element, type: string, x: number, y: number, o: { id?: number; primary?: boolean; button?: number } = {}) =>
    act(() => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: o.id ?? 1, isPrimary: o.primary ?? true, button: o.button ?? 0, pointerType: "touch" })); });
  const click = (el: Element, detail: number) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail })); });
  return { host, sent, render, card, title, ptr, click, act, unmount: async () => { await act(() => root.unmount()); host.remove(); } };
}

test("a drag that started on card A sends nothing when the deck swaps in card B before you let go", async () => {
  const t = await mount([build("A")]);
  try {
    await t.ptr(t.title(), "pointerdown", 100, 100);
    await t.ptr(t.title(), "pointermove", 300, 100); // past the swipe line: would be Continue
    await t.render([build("B")]);
    expect(t.title().textContent).toBe("Build B");
    await t.ptr(t.card(), "pointerup", 300, 100);
    expect(t.sent).toEqual([]);
    // B still answers a fresh swipe of its own
    await t.ptr(t.title(), "pointerdown", 100, 100);
    await t.ptr(t.title(), "pointermove", 300, 100);
    await t.ptr(t.title(), "pointerup", 300, 100);
    expect(t.sent).toEqual([{ type: "choose_move", moveId: "B", optionId: "go" }]);
  } finally { await t.unmount(); }
});

test("a long swipe begun on a build card never launches the launch card that replaces it", async () => {
  const t = await mount([build("A")]);
  try {
    await t.ptr(t.title(), "pointerdown", 10, 100);
    await t.ptr(t.title(), "pointermove", 900, 100);
    await t.render([launch("L")]);
    await t.ptr(t.card(), "pointermove", 950, 100);
    await t.ptr(t.card(), "pointerup", 950, 100);
    await t.ptr(t.card(), "pointerdown", 100, 400); // a left swipe from the old drag's leftovers stays harmless too
    expect(t.sent).toEqual([]);
  } finally { await t.unmount(); }
});

test("unrelated pointers, a second finger, a right button, lost capture and a blurred window never answer", async () => {
  const t = await mount([build("A")]);
  try {
    await t.ptr(t.title(), "pointerdown", 100, 100, { id: 1 });
    await t.ptr(t.title(), "pointermove", 300, 100, { id: 2 }); // another pointer moving doesn't drive it
    await t.ptr(t.title(), "pointerup", 300, 100, { id: 2 }); // nor end it
    expect(t.sent).toEqual([]);
    await t.ptr(t.title(), "lostpointercapture", 300, 100, { id: 1 });
    await t.ptr(t.title(), "pointermove", 300, 100, { id: 1 });
    await t.ptr(t.title(), "pointerup", 300, 100, { id: 1 });
    expect(t.sent).toEqual([]);

    await t.ptr(t.title(), "pointerdown", 100, 100, { id: 3, primary: false });
    await t.ptr(t.title(), "pointermove", 300, 100, { id: 3, primary: false });
    await t.ptr(t.title(), "pointerup", 300, 100, { id: 3, primary: false });
    await t.ptr(t.title(), "pointerdown", 100, 100, { id: 4, button: 2 });
    await t.ptr(t.title(), "pointermove", 300, 100, { id: 4, button: 2 });
    await t.ptr(t.title(), "pointerup", 300, 100, { id: 4, button: 2 });
    expect(t.sent).toEqual([]);

    await t.ptr(t.title(), "pointerdown", 100, 100, { id: 5 });
    await t.ptr(t.title(), "pointermove", 300, 100, { id: 5 });
    await t.act(() => { window.dispatchEvent(new Event("blur")); });
    await t.ptr(t.title(), "pointerup", 300, 100, { id: 5 });
    await t.ptr(t.title(), "pointercancel", 300, 100, { id: 5 });
    expect(t.sent).toEqual([]);
  } finally { await t.unmount(); }
});

test("a Continue or Later press that started on card A does nothing on card B; keyboard and assistive clicks still work", async () => {
  const t = await mount([build("A"), build("C")]);
  try {
    const go = () => t.card().querySelector("button.ago") as HTMLButtonElement;
    const later = () => t.card().querySelector("button.alater") as HTMLButtonElement;
    await t.ptr(go(), "pointerdown", 0, 0);
    await t.render([build("B"), build("C")]);
    expect(t.title().textContent).toBe("Build B");
    await t.click(go(), 1);
    await t.ptr(later(), "pointerdown", 0, 0);
    await t.render([build("D"), build("C")]);
    await t.click(later(), 1);
    expect(t.sent).toEqual([]);
    // a click with no press behind it is a keyboard or assistive activation: it answers the card on screen
    await t.click(go(), 0);
    expect(t.sent).toEqual([{ type: "choose_move", moveId: "D", optionId: "go" }]);
    // and a real press on the card that stays put answers it
    await t.ptr(later(), "pointerdown", 0, 0);
    await t.click(later(), 1);
    expect(t.sent.at(-1)).toEqual({ type: "defer_move", moveId: "C" });
  } finally { await t.unmount(); }
});

test("a swipe down asks why once and sends exactly one never for the card it started on", async () => {
  const t = await mount([build("A"), build("C")]);
  try {
    await t.ptr(t.title(), "pointerdown", 100, 100);
    await t.ptr(t.title(), "pointermove", 100, 300);
    await t.ptr(t.title(), "pointerup", 100, 300);
    const why = [...t.host.querySelectorAll<HTMLButtonElement>(".tnever button")];
    expect(why.map((b) => b.textContent)).toEqual(["Wrong idea", "Try it another way"]);
    await t.act(() => why[0].click());
    expect(t.sent).toEqual([{ type: "dismiss_move", moveId: "A", why: "wrong" }]);
    expect(t.title().textContent).toBe("Build C");
  } finally { await t.unmount(); }
});

test("Later parks a card: the tray says caught up with it parked, and Bring back puts it on top again", async () => {
  const { act, useState } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { TaskTray } = await import("../src/ui/TaskTray");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const sent: WebToServer[] = [];
  function Host() {
    const [parked, setParked] = useState<ReadonlySet<string>>(() => new Set());
    return <TaskTray deck={[build("A")]} send={(m) => sent.push(m)} onFocus={() => {}} parked={parked} onPark={(id) => setParked((p) => new Set(p).add(id))} onBringBack={() => setParked(new Set())} />;
  }
  try {
    await act(() => root.render(<Host />));
    await act(() => (host.querySelector("button.alater") as HTMLButtonElement).click());
    expect(sent).toEqual([{ type: "defer_move", moveId: "A" }]);
    expect(host.querySelector(".caught .att")?.textContent).toBe("Nothing's moving right now.");
    expect(host.querySelector(".tparked")?.textContent).toBe("1 parked for later");
    await act(() => (host.querySelector(".caught button.alater") as HTMLButtonElement).click());
    expect(host.querySelector(".tasktray .att")?.textContent).toBe("Build A");
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

test("plugging in a builder leads the tray as a setup card, and a launch holds a Shipped moment before the next card", async () => {
  const power: Move = { id: "P", createdAt: 1, stage: "resources", attention: "suggest", title: "Your computer writes the code. Plug it in to start building.",
    options: [{ id: "connect", label: "Connect a local agent", recommended: true, actions: [{ tool: "connect_source", args: { kind: "claude" }, reason: "test" }] }] };
  const t = await mount([build("A"), power]);
  try {
    expect(t.title().textContent).toBe(power.title);
    expect(t.card().querySelector(".atop b")?.textContent).toBe("Setup first");
    expect(t.card().className).toContain("steer");
  } finally { await t.unmount(); }
  const u = await mount([launch("L"), build("B")]);
  try {
    await u.ptr(u.title(), "pointerdown", 10, 100);
    await u.ptr(u.title(), "pointermove", 900, 100);
    await u.ptr(u.title(), "pointerup", 900, 100);
    expect(u.sent).toEqual([{ type: "choose_move", moveId: "L", optionId: "ship" }]);
    expect(u.host.querySelector(".shipped .att")?.textContent).toBe("Launch L"); // not "Build B" yet
  } finally { await u.unmount(); }
});
