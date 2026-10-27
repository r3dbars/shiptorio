import { expect, test } from "bun:test";

import { mapGesture, releaseAction } from "../src/map/gesture";
import { floorFrame } from "../src/map/shaft/frame";
import { nearestFloorAt, snapFloorAt } from "../src/map/shaft/stage";

const up = { last: true, moved: 40, multi: false, cancelled: false };

test("a one-finger drag settles, a tap picks", () => {
  expect(releaseAction(up)).toBe("settle");
  expect(releaseAction({ ...up, moved: 3 })).toBe("pick");
});

test("a pinch never snaps or picks, even when the last finger lifts after it", () => {
  expect(releaseAction({ ...up, multi: true })).toBe("none");
  expect(releaseAction({ ...up, moved: 0, multi: true })).toBe("none");
  // the first of two fingers lifting is not the end of the gesture
  expect(releaseAction({ ...up, last: false })).toBe("none");
});

test("a cancelled pointer never picks or snaps", () => {
  expect(releaseAction({ ...up, cancelled: true })).toBe("none");
  expect(releaseAction({ ...up, moved: 0, cancelled: true })).toBe("none");
});

test("the phone settles on whichever floor is nearest", () => {
  const [W, H] = [390, 844];
  for (const v of ["mine", "build", "checks", "launch"] as const) {
    const y = floorFrame(v, W, H).at[1];
    expect(nearestFloorAt(y, W, H)).toBe(v);
    expect(nearestFloorAt(y + 1, W, H)).toBe(v);
  }
  expect(nearestFloorAt(-99, W, H)).toBe("mine");
  expect(nearestFloorAt(99, W, H)).toBe("launch");
});

test("only a view about one floor tall snaps; the whole-shaft overview stays put", () => {
  const [W, H] = [390, 844];
  const b = floorFrame("build", W, H);
  expect(snapFloorAt(b.at[1] + 1, b.h, W, H)).toBe("build");
  expect(snapFloorAt(b.at[1] + 1, b.h * 1.2, W, H)).toBe("build");
  expect(snapFloorAt(b.at[1], b.h * 3, W, H)).toBeNull();
  expect(snapFloorAt(b.at[1], b.h / 2, W, H)).toBeNull();
});

// the real map handler (FactoryMap wires canvas pointer events to mapGesture), driven with fake pointers
function rig() {
  const calls: string[] = [];
  const g = mapGesture({
    capture: () => {},
    panBy: () => calls.push("pan"),
    zoomBy: () => calls.push("zoom"),
    hover: () => calls.push("hover"),
    pick: () => calls.push("pick"),
    settle: () => calls.push("settle"),
  });
  const ev = (pointerId: number, clientX: number, clientY: number, type = "pointerup") => ({ pointerId, clientX, clientY, type, pointerType: "touch" });
  return { g, ev, acts: () => calls.filter((c) => c === "pick" || c === "settle") };
}

test("handler: a still tap picks once; a one-finger drag settles once", () => {
  let r = rig();
  r.g.down(r.ev(1, 100, 100));
  r.g.up(r.ev(1, 100, 100));
  expect(r.acts()).toEqual(["pick"]);
  r = rig();
  r.g.down(r.ev(1, 100, 100));
  r.g.move(r.ev(1, 100, 160));
  r.g.up(r.ev(1, 100, 160));
  expect(r.acts()).toEqual(["settle"]);
});

test("handler: two still fingers lifting one by one neither pick nor settle", () => {
  const r = rig();
  r.g.down(r.ev(1, 100, 100));
  r.g.down(r.ev(2, 200, 200));
  r.g.up(r.ev(1, 100, 100));
  r.g.up(r.ev(2, 200, 200));
  expect(r.acts()).toEqual([]);
});

test("handler: a cancelled finger, then the other lifting, neither picks nor settles", () => {
  const r = rig();
  r.g.down(r.ev(1, 100, 100));
  r.g.down(r.ev(2, 200, 200));
  r.g.up(r.ev(1, 100, 100, "pointercancel"));
  r.g.up(r.ev(2, 200, 200));
  expect(r.acts()).toEqual([]);
});

test("handler: a one-finger cancel neither picks nor settles, and the next tap still picks", () => {
  const r = rig();
  r.g.down(r.ev(1, 100, 100));
  r.g.move(r.ev(1, 100, 160));
  r.g.up(r.ev(1, 100, 160, "pointercancel"));
  r.g.down(r.ev(3, 100, 100));
  r.g.up(r.ev(3, 100, 100, "pointercancel"));
  expect(r.acts()).toEqual([]);
  r.g.down(r.ev(4, 100, 100));
  r.g.up(r.ev(4, 100, 100));
  expect(r.acts()).toEqual(["pick"]);
});

test("handler: a pinch that moves then lifts never snaps", () => {
  const r = rig();
  r.g.down(r.ev(1, 100, 100));
  r.g.down(r.ev(2, 200, 200));
  r.g.move(r.ev(2, 260, 260));
  r.g.up(r.ev(2, 260, 260));
  r.g.move(r.ev(1, 100, 200));
  r.g.up(r.ev(1, 100, 200));
  expect(r.acts()).toEqual([]);
});
