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

function physical() {
  const win = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const lease = holdRenderYield({ progress() {}, arm() {}, cancel() {}, confirm() {}, launch() {} }, { window: win, document: doc });
  const fire = (type: string, props: Record<string, unknown> = {}) => win.dispatchEvent(Object.assign(new Event(type), props));
  const complete = () => { lease.events.arm(); lease.events.launch("A"); lease.dispose(); };
  return { win, doc, lease, fire, complete };
}
test("completed detached keyboard holds ignore wrong keys/repeats and recover a missed keyup on fresh keydown", () => {
  const f = physical();
  try {
    expect(f.lease.keyDown(" ")).toBe(true); f.complete();
    f.fire("keyup", { key: "Enter" }); expect(submitWhenUnheld(() => {})).toBe(false);
    f.fire("keydown", { key: " ", repeat: true }); expect(submitWhenUnheld(() => {})).toBe(false);
    f.fire("keydown", { key: " ", repeat: false }); expect(submitWhenUnheld(() => {})).toBe(true);
  } finally { f.fire("blur"); }
});
test("completed detached pointer leases recover a missed up only on a matching fresh primary down", () => {
  const f = physical();
  try {
    f.lease.pointerDown(7); f.complete();
    f.fire("pointerdown", { pointerId: 8, isPrimary: true, button: 0 }); expect(submitWhenUnheld(() => {})).toBe(false);
    f.fire("pointerdown", { pointerId: 7, isPrimary: false, button: 0 }); expect(submitWhenUnheld(() => {})).toBe(false);
    f.fire("pointerdown", { pointerId: 7, isPrimary: true, button: 0 }); expect(submitWhenUnheld(() => {})).toBe(true);
  } finally { f.fire("blur"); }
});
test("native cancel, window blur and hidden state release completed detached ownership without React callbacks", () => {
  for (const finish of ["pointercancel", "blur", "hidden"]) {
    const f = physical();
    f.lease.pointerDown(7); f.complete();
    if (finish === "hidden") { f.doc.visibilityState = "hidden"; f.doc.dispatchEvent(new Event("visibilitychange")); }
    else f.fire(finish, { pointerId: 7 });
    expect(submitWhenUnheld(() => {})).toBe(true);
    expect(f.lease.pointerDown(7)).toBe(false); // disposed component cannot reacquire a stale token
  }
});
test("effect cleanup/setup replay permits the same mounted controller to acquire a new lease", () => {
  const f = physical();
  f.lease.pointerDown(7); f.lease.events.arm(); f.lease.dispose();
  expect(submitWhenUnheld(() => {})).toBe(true);
  f.lease.mount(); expect(f.lease.keyDown("Enter")).toBe(true); f.lease.events.arm();
  expect(submitWhenUnheld(() => {})).toBe(false); f.fire("keyup", { key: "Enter" });
  expect(submitWhenUnheld(() => {})).toBe(true); f.lease.dispose();
});
