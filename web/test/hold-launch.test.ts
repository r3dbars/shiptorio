import { describe, expect, test } from "bun:test";
import { CONFIRM_MS, HOLD_MS, MAX_FRAME_MS, HoldGesture } from "../src/ui/holdLaunch";

// A deterministic clock: frames run only when the test steps time.
function rig() {
  let t = 0;
  let next = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  const log: string[] = [];
  const g = new HoldGesture(
    {
      progress: () => {},
      launch: (card) => log.push(`launch ${card}`),
      arm: () => log.push("arm"),
      cancel: () => log.push("cancel"),
      confirm: (card) => log.push(`confirm ${card}`),
    },
    {
      now: () => t,
      raf: (cb) => { frames.set(next, cb); return next++; },
      caf: (id) => { frames.delete(id); },
      after: (ms, cb) => { timers.set(next, { at: t + ms, cb }); return next++; },
      clear: (id) => { timers.delete(id); },
    },
  );
  const fire = () => { for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.cb(); } };
  const step = (ms: number) => {
    for (let left = ms; left > 0; left -= 16) {
      t += Math.min(16, left);
      fire();
      const due = [...frames.values()];
      frames.clear();
      due.forEach((f) => f());
    }
  };
  // One long stall: time jumps without frames in between (a janky main thread or a frozen tab).
  const stall = (ms: number) => {
    t += ms;
    fire();
    const due = [...frames.values()];
    frames.clear();
    due.forEach((f) => f());
  };
  return { g, step, stall, log, frames, timers };
}

describe("hold to launch", () => {
  test("letting go early never launches", () => {
    const { g, step, log } = rig();
    g.press("A"); step(HOLD_MS - 100); g.release(); step(2000);
    expect(log).toEqual(["arm", "cancel"]);
  });
  test("a full hold launches exactly once", () => {
    const { g, step, log } = rig();
    g.press("A"); step(HOLD_MS + 500); g.release(); step(2000);
    expect(log).toEqual(["arm", "launch A"]);
  });
  test("keyboard: key down holds, key up early cancels, a full hold launches", () => {
    const { g, step, log } = rig();
    g.press("A"); step(300); g.release();
    g.press("A"); step(HOLD_MS + 20); g.release();
    expect(log).toEqual(["arm", "cancel", "arm", "launch A"]);
  });
  test("focus leaving, a hidden tab or lost pointer capture mid-hold cancels it", () => {
    for (const leave of ["blur", "hidden", "lostcapture"]) {
      const { g, step, log, frames } = rig();
      g.press("A"); step(400);
      g.cancel(); // each of these events calls cancel in the component
      step(HOLD_MS * 2);
      expect([leave, ...log]).toEqual([leave, "arm", "cancel"]);
      expect(frames.size).toBe(0);
    }
  });
  test("a second press while held (another key, a second button) does not restart or double launch", () => {
    const { g, step, log } = rig();
    g.press("A"); step(400); g.press("A"); step(HOLD_MS);
    expect(log).toEqual(["arm", "launch A"]);
  });
  test("the card changing under a hold cancels it and never launches the old card", () => {
    const { g, step, log, frames } = rig();
    g.press("A"); step(400); g.retarget("B"); step(HOLD_MS * 2);
    expect(log).toEqual(["arm", "cancel"]);
    expect(frames.size).toBe(0);
  });
  test("unmounting mid-hold stops the frame loop", () => {
    const { g, step, log, frames } = rig();
    g.press("A"); step(400); g.dispose(); step(HOLD_MS * 2);
    expect(log).toEqual(["arm"]);
    expect(frames.size).toBe(0);
  });
  test("screen reader activation asks twice on the same card, within the window", () => {
    const { g, step, log } = rig();
    g.assistive("A"); step(1000); g.assistive("A");
    expect(log).toEqual(["confirm A", "confirm null", "launch A"]);
  });
  test("screen reader confirm expires, and does not carry over to another card", () => {
    const { g, step, log } = rig();
    g.assistive("A"); step(CONFIRM_MS + 100);
    expect(log).toEqual(["confirm A", "confirm null"]); // expiry is announced, so the button stops saying "Again"
    g.assistive("A");
    expect(log).toEqual(["confirm A", "confirm null", "confirm A"]);
    g.retarget("B"); g.assistive("B");
    expect(log).toEqual(["confirm A", "confirm null", "confirm A", "confirm null", "confirm B"]);
  });
  test("the click a browser fires right after a key or pointer press is not an activation", () => {
    const { g, step, log } = rig();
    g.press("A"); step(200); g.release(); g.assistive("A"); g.assistive("A");
    expect(log).toEqual(["arm", "cancel"]);
    g.press("A"); step(HOLD_MS + 20); g.release(); g.assistive("A");
    expect(log).toEqual(["arm", "cancel", "arm", "launch A"]);
  });
  test("one long stall never counts as a full hold, even if the release arrives late", () => {
    const { g, stall, step, log } = rig();
    g.press("A"); stall(2000); stall(2000);
    expect(log).toEqual(["arm"]);
    g.release();
    expect(log).toEqual(["arm", "cancel"]);
    g.press("A"); stall(5000); step(HOLD_MS - MAX_FRAME_MS + 20);
    expect(log).toEqual(["arm", "cancel", "arm", "launch A"]);
  });
  test("one confirm timer at a time: a press disarms it, a re-arm starts a fresh window, unmount clears it", () => {
    const { g, step, log, timers } = rig();
    g.assistive("A"); step(1000);
    g.press("A"); step(100); g.release(); // physical Space press disarms
    expect(timers.size).toBe(0);
    step(900); g.assistive("A"); // re-arm at 2000, open until 7000
    step(3000); // 5000: the first window's end must not disarm anything
    expect(log.filter((l) => l.startsWith("confirm"))).toEqual(["confirm A", "confirm null", "confirm A"]);
    step(2100); // 7100: the second window expired
    expect(log.at(-1)).toBe("confirm null");
    g.assistive("A"); g.dispose();
    expect(timers.size).toBe(0);
  });
});
