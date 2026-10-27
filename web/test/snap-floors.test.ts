import { expect, test } from "bun:test";

import { releaseAction } from "../src/map/gesture";
import { floorFrame } from "../src/map/shaft/frame";
import { nearestFloorAt, snapFloorAt } from "../src/map/shaft/stage";

const up = { last: true, moved: 40, multi: false, cancelled: false };

test("a one-finger drag settles, a tap picks", () => {
  expect(releaseAction(up)).toBe("settle");
  expect(releaseAction({ ...up, moved: 3 })).toBe("pick");
});

test("a pinch never snaps, even when the last finger lifts after it", () => {
  expect(releaseAction({ ...up, multi: true })).toBe("none");
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
