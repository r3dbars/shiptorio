import { expect, test } from "bun:test";
import * as THREE from "three";

import { bakeShaft } from "../src/map/shaft/bake";
import type { Iron } from "../src/map/shaft/core";
import { buildFloor, FLOOR_BUILD_SECONDS } from "../src/map/shaft/floorbuild";
import { defaultPlan, makeLayout } from "../src/map/shaft/layout.js";

// A floor of the floating city being built (floorbuild.ts, ART-PASS.md "Floors"): it moves only the floor's own parts
// plus its props, and leaves everything exactly as it was when it ends.

function shaft() {
  const root = new THREE.Group();
  const part = new THREE.Group();
  part.name = "part:world";
  root.add(part);
  const floor = new THREE.Group();
  floor.name = "floor:checks";
  floor.userData.floor = "checks";
  part.add(floor);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = floor) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const stone = new THREE.MeshPhongMaterial({ color: 0x6a5e52 });
  const brick = new THREE.MeshPhongMaterial({ color: 0x8a3a22 });
  const win = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  const slab = add(new THREE.BoxGeometry(37, 1.5, 11), stone, 0, 10.35, -10);
  const riser = add(new THREE.BoxGeometry(37, 9.5, 0.8), brick, 0, 4.85, -4.9);
  // one material each, so the bake leaves each piece as it is (it merges pieces that share one)
  const crate = add(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial({ color: 0x4a3220 }), 6, 11.6, -9);
  const window = add(new THREE.PlaneGeometry(1, 1.6), win, -4, 5, -4.45);
  const lamp = new THREE.PointLight(0xffa050, 2.5);
  lamp.position.set(-2, 12, -9);
  floor.add(lamp);
  // a mover on the floor (a crow, a gauge): moves whole
  const mover = new THREE.Group();
  mover.userData = { dyn: true };
  add(new THREE.BoxGeometry(0.4, 0.4, 0.4), stone, 9, 11.4, -8, mover);
  floor.add(mover);
  const layout = makeLayout(defaultPlan());
  const I = { root, layout, stationList: [], pathList: [] } as unknown as Iron;
  bakeShaft(I, root);
  root.updateMatrixWorld(true);
  return { I, root, floor, slab, riser, crate, window, win, lamp, mover };
}

const snapshot = (root: THREE.Object3D) => {
  const out = new Map<THREE.Object3D, { m: number[]; v: boolean; mat: unknown }>();
  root.traverse((o) => out.set(o, { m: o.matrix.toArray(), v: o.visible, mat: (o as THREE.Mesh).material }));
  return out;
};

test("the floor goes up piece by piece with its props, then everything is as it was", async () => {
  const s = shaft();
  const before = snapshot(s.root);
  const kids = s.root.children.length;
  const run = buildFloor(s.I, "checks");
  const props = s.root.children.find((c) => c.name === "floorbuild:checks")!;
  expect(props).toBeDefined();
  // the props cost at most 30 draw calls
  let draws = 0;
  props.traverse((o) => (o as THREE.Mesh).isMesh && draws++);
  expect(draws).toBeGreaterThan(5);
  expect(draws).toBeLessThanOrEqual(30);
  // nothing of the floor stands before its beat; the windows are dark and the lamp is out
  expect(s.slab.visible).toBe(false);
  expect(s.riser.visible).toBe(false);
  expect(s.lamp.intensity).toBe(0);
  expect(run.progress).toBe(0);

  // halfway: the girders are up, the slab is sliding in, nothing is lit yet
  run.update(3.2);
  expect(run.progress).toBeCloseTo(3.2 / FLOOR_BUILD_SECONDS, 3);
  expect(s.slab.visible).toBe(true);
  expect(s.slab.matrix.toArray()).not.toEqual(before.get(s.slab)!.m);
  const lit = (s.window.material as THREE.MeshBasicMaterial).color;
  expect(s.window.material).not.toBe(s.win); // its own copy while it lights
  expect(lit.r).toBeLessThan(s.win.color.r * 0.2);

  // the end: only the floor's own parts moved, and they're back exactly; the props are gone
  let finished = false;
  void run.done.then(() => (finished = true));
  while (!run.update(1 / 30));
  await run.done;
  expect(finished).toBe(true);
  expect(run.progress).toBe(1);
  expect(s.root.children.length).toBe(kids);
  for (const [o, b] of before) {
    expect(o.matrix.toArray()).toEqual(b.m);
    expect(o.visible).toBe(b.v);
    expect((o as THREE.Mesh).material).toBe(b.mat as THREE.Material);
  }
  expect(s.lamp.intensity).toBe(2.5);
  expect(s.slab.matrixAutoUpdate).toBe(true);
  // a second update after the end is a no-op
  expect(run.update(1)).toBe(true);
});

test("cancel puts a hidden floor back hidden; finish jumps to the floor standing", () => {
  const s = shaft();
  s.floor.visible = false;
  const run = buildFloor(s.I, "checks");
  expect(s.floor.visible).toBe(true);
  run.update(2);
  run.cancel();
  expect(s.floor.visible).toBe(false);
  expect(s.root.children.some((c) => c.name.startsWith("floorbuild"))).toBe(false);

  const again = buildFloor(s.I, "checks");
  again.update(1);
  again.finish();
  expect(again.progress).toBe(1);
  expect(s.floor.visible).toBe(true);
  expect(s.slab.visible && s.riser.visible && s.crate.visible && s.mover.visible).toBe(true);
  expect(s.root.children.some((c) => c.name.startsWith("floorbuild"))).toBe(false);
});

test("reduced motion: a 1 s fade, no props, materials back after", () => {
  const s = shaft();
  const mat0 = s.riser.material;
  const run = buildFloor(s.I, "checks", { reduced: true });
  expect(s.root.children.some((c) => c.name.startsWith("floorbuild"))).toBe(false);
  run.update(0.5);
  const m = s.riser.material as THREE.MeshPhongMaterial;
  expect(m).not.toBe(mat0);
  expect(m.transparent).toBe(true);
  expect(m.opacity).toBeCloseTo(0.5, 2);
  expect(s.riser.visible).toBe(true);
  expect(run.update(0.6)).toBe(true);
  expect(s.riser.material).toBe(mat0);
});

test("speed and seconds stretch the build; the mine floor just shows", () => {
  const s = shaft();
  const slow = buildFloor(s.I, "checks", { speed: 0.5 });
  expect(slow.update(FLOOR_BUILD_SECONDS)).toBe(false);
  expect(slow.update(FLOOR_BUILD_SECONDS)).toBe(true);
  const quick = buildFloor(s.I, "checks", { seconds: 2 });
  expect(quick.update(2)).toBe(true);
  const mine = buildFloor(s.I, "mine");
  expect(mine.update(FLOOR_BUILD_SECONDS)).toBe(true);
});
