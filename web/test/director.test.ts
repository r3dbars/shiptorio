import { expect, test } from "bun:test";
import * as THREE from "three";

import { cameraFor, STEPS } from "../src/buildout/journey";
import { Director, drift, siteBoxes, siteFrame, SWOOP, type DirectorStage } from "../src/map/shaft/director";
import { floorFrame } from "../src/map/shaft/frame";
import { defaultPlan, makeLayout, TIERS } from "../src/map/shaft/layout";
import { YAW } from "../src/map/shaft/stage";

const layout = makeLayout(defaultPlan());
const DESK = [1440, 900] as const, PHONE = [390, 844] as const;

function fakeStage(W: number, H: number): DirectorStage & { root: THREE.Group } {
  const root = new THREE.Group();
  root.rotation.y = YAW;
  root.updateMatrixWorld(true);
  return {
    root,
    tgt: new THREE.Vector3(),
    tgtGoal: new THREE.Vector3(),
    viewH: 22,
    viewGoal: 22,
    zoom: 1.7,
    view: "build",
    W,
    H,
    rootToWorld: (x, y, z, out = new THREE.Vector3()) => root.localToWorld(out.set(x, y, z)),
  };
}
const rootOf = (s: ReturnType<typeof fakeStage>) => s.root.worldToLocal(s.tgt.clone());

test("every build site in the first run frames from the layout", () => {
  for (const t of ["mine:github", "lift", "steam", "asm-1", "planner", "ci", "gate", "pad", ["steam", "asm-1"], "build"]) {
    for (const [W, H] of [DESK, PHONE]) {
      const f = siteFrame(layout, t, W, H)!;
      expect(f).not.toBeNull();
      expect(f.h).toBeGreaterThan(8);
      expect(f.h).toBeLessThan(70);
    }
  }
  expect(siteFrame(layout, "nope", ...DESK)).toBeNull();
  expect(siteFrame(layout, "build", ...DESK)).toEqual(floorFrame("build", ...DESK));
});

test("every journey step's camera target frames on a phone and a desk, at its own spot", () => {
  const seen = new Set<string>();
  for (const step of STEPS) {
    const t = cameraFor(step, layout);
    expect(t.length).toBeGreaterThan(0);
    for (const [W, H] of [DESK, PHONE]) {
      const f = siteFrame(layout, t, W, H)!;
      expect(f).not.toBeNull();
      expect(siteBoxes(layout, t).length).toBe(t.length);
      seen.add(f.at.map((v) => v.toFixed(1)).join(","));
    }
  }
  expect(seen.size).toBe(6); // tunnel, boiler, builder, planner, checks, launch
});

test("a site is framed where its pieces stand, so a moved machine moves the camera", () => {
  const f = siteFrame(layout, "pad", ...DESK)!;
  const pad = layout.stations.find((s) => s.id === "pad")!;
  expect(f.at[0]).toBeCloseTo(pad.x);
  expect(f.at[1]).toBeGreaterThan(TIERS.launch.y);
  const moved = { ...layout, stations: layout.stations.map((s) => (s.id === "pad" ? { ...s, x: s.x + 4 } : s)) };
  expect(siteFrame(moved, "pad", ...DESK)!.at[0]).toBeCloseTo(pad.x + 4);
});

test("a phone shows the same site wider, so it still fits across", () => {
  const desk = siteFrame(layout, ["steam", "asm-1"], ...DESK)!;
  const phone = siteFrame(layout, ["steam", "asm-1"], ...PHONE)!;
  expect(phone.h).toBeGreaterThan(desk.h);
  // the boxes' width fits the phone's view width
  const boxes = siteBoxes(layout, ["steam", "asm-1"]);
  const w = Math.max(...boxes.map((b) => b.x + b.r)) - Math.min(...boxes.map((b) => b.x - b.r));
  expect(phone.h * (PHONE[0] / PHONE[1])).toBeGreaterThanOrEqual(w);
});

test("the first park cuts straight there, then a new site swoops over one second and holds", () => {
  const s = fakeStage(...DESK);
  const d = new Director(s, layout);
  d.park("mine:github");
  d.step(0, 0);
  expect(rootOf(s).x).toBeCloseTo(siteFrame(layout, "mine:github", ...DESK)!.at[0], 1);
  expect(s.zoom).toBe(1);
  expect(s.view).toBe("free");

  d.park("pad");
  expect(d.moving).toBe(true);
  const start = rootOf(s).y;
  d.step(0.5, SWOOP / 2);
  const mid = rootOf(s).y;
  const goal = siteFrame(layout, "pad", ...DESK)!;
  expect(mid).toBeGreaterThan(start);
  expect(mid).toBeLessThan(goal.at[1]);
  expect(s.viewH).toBeGreaterThan(goal.h); // pulled back mid-swoop
  d.step(1, SWOOP / 2);
  expect(d.moving).toBe(false);
  expect(rootOf(s).y).toBeCloseTo(goal.at[1], 3);
  expect(s.viewH).toBeCloseTo(goal.h, 3);
  // the stage's own glide has nothing to do
  expect(s.tgtGoal.distanceTo(s.tgt)).toBe(0);
  expect(s.viewGoal).toBe(s.viewH);
});

test("parked, the camera breathes a little and never wanders off the site", () => {
  const s = fakeStage(...PHONE);
  const d = new Director(s, layout);
  d.park("planner");
  const goal = siteFrame(layout, "planner", ...PHONE)!;
  let far = 0, moved = 0;
  const prev = new THREE.Vector3();
  for (let i = 0; i < 1200; i++) {
    const t = i / 30;
    d.step(t, 1 / 30);
    const p = rootOf(s);
    far = Math.max(far, Math.hypot(p.x - goal.at[0], p.y - goal.at[1], p.z - goal.at[2]));
    if (i) moved = Math.max(moved, p.distanceTo(prev));
    prev.copy(p);
    expect(Math.abs(s.viewH / goal.h - 1)).toBeLessThan(0.01);
  }
  expect(far).toBeGreaterThan(0.05);
  expect(far).toBeLessThan(goal.h * 0.03);
  expect(moved).toBeLessThan(0.02); // slow: no jumps between frames
  for (const v of drift(12.3)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
});

test("reduced motion cuts to each site and holds dead still", () => {
  const s = fakeStage(...DESK);
  const d = new Director(s, layout, { reduceMotion: true });
  d.park("steam");
  d.park("ci");
  expect(d.moving).toBe(false);
  const goal = siteFrame(layout, "ci", ...DESK)!;
  for (let t = 0; t < 20; t += 0.5) {
    d.step(t, 0.5);
    expect(rootOf(s).x).toBeCloseTo(goal.at[0], 5);
    expect(rootOf(s).y).toBeCloseTo(goal.at[1], 5);
    expect(s.viewH).toBe(goal.h);
  }
});

test("free look stays locked until the first rocket, then the stage gets the camera back", () => {
  const s = fakeStage(...DESK);
  const d = new Director(s, layout);
  d.park("pad");
  d.step(0, 0);
  expect(d.locked).toBe(true);
  d.unlock();
  expect(d.locked).toBe(false);
  s.zoom = 2; // the player zooms
  s.view = "stack";
  const before = s.tgt.clone();
  d.step(1, 1 / 30);
  d.park("planner");
  d.step(2, 1 / 30);
  expect(s.zoom).toBe(2);
  expect(s.view).toBe("stack");
  expect(s.tgt.equals(before)).toBe(true);
});

test("a resize re-frames the parked site for the new screen", () => {
  const s = fakeStage(...DESK);
  const d = new Director(s, layout);
  d.park("asm-1");
  d.step(0, 0);
  s.W = PHONE[0];
  s.H = PHONE[1];
  d.step(10, 0);
  expect(s.viewH).toBeGreaterThan(siteFrame(layout, "asm-1", ...DESK)!.h);
});
