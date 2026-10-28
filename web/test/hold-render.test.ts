import { expect, test } from "bun:test";
import { holdRenderYield, submitWhenUnheld } from "../src/ui/holdRender";
import { HoldGesture, type HoldClock } from "../src/ui/holdLaunch";

function rig() {
  let now = 0;
  let next = 0;
  const frames = new Map<number, () => void>();
  const log: string[] = [];
  const lease = holdRenderYield({ progress: () => {}, arm: () => log.push("arm"),
    cancel: () => log.push("cancel"), confirm: () => {}, launch: card => log.push(card) });
  const clock: HoldClock = { now: () => now, raf: cb => { frames.set(++next, cb); return next; },
    caf: id => { frames.delete(id); }, after: () => ++next, clear: () => {} };
  const g = new HoldGesture(lease.events, clock, 900);
  return { g, log, lease, frame: (ms: number) => {
    now += ms; const due = [...frames.values()]; frames.clear(); due.forEach(cb => cb());
  }, dispose: () => { g.dispose(); lease.dispose(); } };
}

test("only a genuine active hold defers GL, and a full safe hold resumes it exactly once", () => {
  const r = rig(); let draws = 0;
  try {
    expect(submitWhenUnheld(() => draws++)).toBe(true);
    r.g.press("A");
    expect(submitWhenUnheld(() => draws++)).toBe(false);
    r.frame(5000); // one long frozen frame still credits only the existing 100ms
    expect(r.log).toEqual(["arm"]);
    for (let i = 0; i < 8; i++) r.frame(100);
    expect(r.log).toEqual(["arm", "A"]);
    expect(submitWhenUnheld(() => draws++)).toBe(true);
    r.g.release(); expect(r.log).toEqual(["arm", "A"]);
    expect(draws).toBe(2);
  } finally { r.dispose(); }
});

test("release, pointer/focus cancellation, retarget and unmount each resume GL", () => {
  for (const end of [(r: ReturnType<typeof rig>) => r.g.release(),
    (r: ReturnType<typeof rig>) => r.g.cancel(),
    (r: ReturnType<typeof rig>) => r.g.retarget("B"),
    (r: ReturnType<typeof rig>) => r.dispose()]) {
    const r = rig();
    try { r.g.press("A"); end(r); expect(submitWhenUnheld(() => {})).toBe(true); }
    finally { r.dispose(); }
  }
});

test("independent controls and repeated cleanup cannot clear another active hold", () => {
  const a = rig(), b = rig();
  try {
    a.g.press("A"); b.g.press("B"); a.dispose(); a.dispose();
    expect(submitWhenUnheld(() => {})).toBe(false);
    b.g.cancel(); expect(submitWhenUnheld(() => {})).toBe(true);
  } finally { a.dispose(); b.dispose(); }
});

test("assistive confirmation never pauses rendering", () => {
  const r = rig();
  try {
    r.g.assistive("A"); expect(submitWhenUnheld(() => {})).toBe(true);
    r.g.assistive("A"); expect(r.log).toEqual(["A"]);
    expect(submitWhenUnheld(() => {})).toBe(true);
  } finally { r.dispose(); }
});
