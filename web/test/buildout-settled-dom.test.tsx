import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { FactoryState } from "@shiptorio/shared";

const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;
beforeAll(() => {
  win = new Window({ url: "http://localhost/" });
  for (const key of keys) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (win as unknown as Record<string, unknown>)[key] });
  }
});
afterAll(async () => {
  for (const key of keys) {
    const previous = saved.get(key);
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete (globalThis as Record<string, unknown>)[key];
  }
  await win.happyDOM.close();
});

function timers() {
  let now = 0, next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  const after = spyOn(window, "setTimeout").mockImplementation(((run: () => void, ms = 0) => {
    const id = next++;
    pending.set(id, { at: now + ms, run });
    return id;
  }) as typeof window.setTimeout);
  const clear = spyOn(window, "clearTimeout").mockImplementation((id) => { pending.delete(Number(id)); });
  return {
    pending,
    to(at: number) {
      now = at;
      for (const [id, timer] of [...pending]) if (timer.at <= now) { pending.delete(id); timer.run(); }
    },
    restore() { after.mockRestore(); clear.mockRestore(); },
  };
}

async function probe() {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useSettled } = await import("../src/ui/Buildout");
  const clock = timers(), accepted: string[] = [];
  let action = () => {};
  function Probe({ card, busy }: { card: string; busy: boolean }) {
    const { ready, run } = useSettled(card);
    action = run(() => accepted.push(card));
    return <button disabled={!ready || busy} onClick={action}>Build it</button>;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return {
    act, clock, accepted,
    render: (card: string, busy = false) => act(() => root.render(<Probe card={card} busy={busy} />)),
    button: () => host.querySelector("button")!,
    action: () => action,
    close: async () => { await act(() => root.unmount()); host.remove(); expect(clock.pending.size).toBe(0); clock.restore(); },
  };
}

test("settling is disabled at 270 ms, and a fresh enabled click is accepted once", async () => {
  const p = await probe();
  try {
    await p.render("builder");
    expect(p.button().disabled).toBe(true);
    await p.act(() => p.clock.to(270));
    await p.act(() => p.button().click());
    expect(p.accepted).toEqual([]);
    await p.act(() => p.clock.to(599));
    expect(p.button().disabled).toBe(true);
    await p.act(() => p.clock.to(600));
    expect(p.button().disabled).toBe(false);
    await p.act(() => p.button().click());
    expect(p.accepted).toEqual(["builder"]);
    // A separate busy condition still disables the button without restarting the settled card.
    await p.render("builder", true);
    expect(p.button().disabled).toBe(true);
    await p.render("builder");
    expect(p.button().disabled).toBe(false);
  } finally { await p.close(); }
});

test("A to B to A cannot reuse an old ready token or a cancelled timer", async () => {
  const p = await probe();
  try {
    await p.render("A");
    await p.act(() => p.clock.to(600));
    const oldAction = p.action();
    await p.render("B");
    const oldTimer = [...p.clock.pending.values()][0].run;
    await p.act(() => p.clock.to(700));
    await p.render("A");
    expect(p.button().disabled).toBe(true);
    await p.act(() => { oldTimer(); oldAction(); });
    expect(p.button().disabled).toBe(true);
    expect(p.accepted).toEqual([]);
    await p.act(() => p.clock.to(1299));
    expect(p.button().disabled).toBe(true);
    await p.act(() => p.clock.to(1300));
    expect(p.button().disabled).toBe(false);
    await p.act(() => p.button().click());
    expect(p.accepted).toEqual(["A"]);
    await p.render("B"); // unmount also clears a still-pending settling timer
    expect(p.clock.pending.size).toBe(1);
  } finally { await p.close(); }
});

test("the real Build it and Later buttons expose the guard; first enabled Build it advances once", async () => {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { Buildout } = await import("../src/ui/Buildout");
  const { emitBuild } = await import("../src/buildout/journey");
  const clock = timers(), sent: unknown[] = [];
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const state = { repo: "demo/shop", items: [], machines: [], power: [{ online: true }], sources: [{ kind: "github", state: "connected" }] } as unknown as FactoryState;
  try {
    await act(() => root.render(<Buildout state={state} live={false} free={false} send={m => sent.push(m)} onLookAround={() => {}} />));
    await act(() => { emitBuild({ id: "tunnel", phase: "done" }); emitBuild({ id: "boiler", phase: "done" }); });
    const button = host.querySelector<HTMLButtonElement>('[data-buildout-action="tap"]')!;
    const later = host.querySelector<HTMLButtonElement>(".bo-later")!;
    expect(button.textContent).toBe("Build it");
    expect(button.disabled).toBe(true);
    expect(later.disabled).toBe(true);
    await act(() => clock.to(270));
    await act(() => button.click());
    expect(sent).toEqual([]);
    await act(() => clock.to(600));
    expect(button.disabled).toBe(false);
    expect(later.disabled).toBe(false);
    await act(() => button.click());
    expect(sent).toEqual([{ type: "station_action", stationId: "buildout", action: "builder" }]);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Building");
  } finally {
    await act(() => root.unmount()); host.remove();
    expect(clock.pending.size).toBe(0); clock.restore();
  }
});
