import { expect, test } from "bun:test";
import * as THREE from "three";

import { FLOOR_IDS } from "../src/map/shaft/floors";

// The shaft's structure (modules/world.js) is cut into floors so a floor can stay hidden until it's built and then
// rise on its own (floating-city art pass, slice 8). Build the world module headless and check that every part of it
// belongs to a floor, and that hiding one floor hides that floor and nothing else.

// world.js paints its textures on canvases: a 2D context that draws nothing is enough to build it
const ctx2d: Record<string | symbol, unknown> = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {}, data: new Uint8ClampedArray(4), width: 0 })),
  set: (t, k, v) => ((t[k] = v), true),
});
const realDocument = (globalThis as { document?: unknown }).document;

async function buildWorld() {
  (globalThis as { document?: unknown }).document = { createElement: (tag: string) => ({ tagName: tag, width: 0, height: 0, style: {}, getContext: () => ctx2d }) };
  try {
    const { createIron } = await import("../src/map/shaft/core.js");
    const { bakeShaft } = await import("../src/map/shaft/bake");
    const { makeLayout, defaultPlan } = await import("../src/map/shaft/layout.js");
    const world = (await import("../src/map/shaft/modules/world.js")).default;
    const I = createIron();
    world(I);
    const scene = new THREE.Scene(), root = new THREE.Group();
    scene.add(root);
    I.build(scene, root, makeLayout(defaultPlan()), {});
    const part = root.children.find((c) => c.name === "part:world")!;
    return { I, part, bake: () => bakeShaft(I as never, root) };
  } finally {
    (globalThis as { document?: unknown }).document = realDocument;
  }
}

const FLOORS: readonly string[] = FLOOR_IDS;
const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));

test("every part of the world sits on a floor", async () => {
  const { I, part } = await buildWorld();
  expect(I.failed ?? []).toEqual([]);
  const meshes: THREE.Object3D[] = [];
  part.traverse((o) => ((o as THREE.Mesh).isMesh || (o as THREE.Light).isLight) && meshes.push(o));
  expect(meshes.length).toBeGreaterThan(100);
  const loose = meshes.filter((m) => !FLOORS.includes(m.userData.floor)).map((m) => m.name || m.type);
  expect(loose).toEqual([]);
  // nothing was built outside a floor
  expect(part.children.find((c) => c.name === "static")!.children.length).toBe(0);
  // every floor has its own baked parts
  for (const id of ["build", "checks", "launch"]) expect(meshes.filter((m) => m.userData.floor === id && m.visible).length).toBeGreaterThan(5);
});

test("hiding one floor hides only that floor", async () => {
  const { I, part, bake } = await buildWorld();
  bake();
  const meshes: THREE.Object3D[] = [];
  part.traverse((o) => (o as THREE.Mesh).isMesh && shown(o) && meshes.push(o));
  for (const id of FLOORS) {
    // the floor's top-most parts after the bake (what a floor build hides and reveals)
    const tops = (I as unknown as { floorParts(id: string): THREE.Object3D[] }).floorParts(id);
    expect(tops.length).toBeGreaterThan(0);
    tops.forEach((o) => (o.visible = false));
    for (const m of meshes) expect([m.userData.floor, shown(m)]).toEqual([m.userData.floor, m.userData.floor !== id]);
    tops.forEach((o) => (o.visible = true));
  }
});
