import { expect, test } from "bun:test";
import * as THREE from "three";

import { bakeShaft } from "../src/map/shaft/bake";
import type { Iron } from "../src/map/shaft/core";
import { buildFloor } from "../src/map/shaft/floorbuild";
import { FLOOR_IDS, FLOORS, floorAtY, floorsFor, floorToBuild, STEP_FLOOR, STEP_ORDER } from "../src/map/shaft/floors";
import { CRACKS, front, inside, LIPS, profile, radius, SMOG_TOP, SOCKET, TIP, TIP_Y, TOP } from "../src/map/shaft/keel-shape.js";
import { makeLayout, defaultPlan } from "../src/map/shaft/layout.js";

// The floating city's contract (web/src/map/shaft/ART-PASS.md): the floors, the bake's per-floor parts, and the
// rock's shape that the keel, engine, falls and camera share.

test("journey steps in order, each on a floor", () => {
  // keep in step with web/src/buildout/journey.ts STEP_IDS
  expect(STEP_ORDER).toEqual(["tunnel", "boiler", "builder", "issue", "planner", "build", "checks", "launch"]);
  for (const s of STEP_ORDER) expect(FLOOR_IDS).toContain(STEP_FLOOR[s]);
});

test("floors stand as the journey reaches them", () => {
  expect(floorsFor("tunnel")).toEqual(["mine"]);
  expect(floorsFor("boiler")).toEqual(["mine", "build"]);
  expect(floorsFor("build")).toEqual(["mine", "build"]);
  expect(floorsFor("checks")).toEqual(["mine", "build", "checks"]);
  expect(floorsFor("launch")).toEqual([...FLOOR_IDS]);
  expect(floorsFor("look")).toEqual([...FLOOR_IDS]);
  expect(floorsFor(null)).toEqual([...FLOOR_IDS]);
  expect(floorToBuild("tunnel", "boiler")).toBe("build");
  expect(floorToBuild("boiler", "builder")).toBeNull();
  expect(floorToBuild("build", "checks")).toBe("checks");
  expect(floorToBuild("checks", "launch")).toBe("launch");
  expect(floorToBuild(null, "tunnel")).toBeNull();
});

test("floor bands match the layout's decks", () => {
  const tiers = makeLayout(defaultPlan()).tiers as Record<string, { y: number }>;
  for (const f of FLOORS) {
    expect(tiers[f.id].y).toBe(f.y);
    expect(floorAtY(f.y)).toBe(f.id);
    expect(floorAtY(f.y + 3)).toBe(f.id);
  }
  expect(floorAtY(-30)).toBe("mine");
});

function fakeIron(root: THREE.Group): Iron {
  return { root } as unknown as Iron;
}

test("bake keeps each floor apart and hands its parts back", () => {
  const root = new THREE.Group();
  const part = new THREE.Group();
  part.name = "part:world";
  root.add(part);
  const m = new THREE.MeshLambertMaterial();
  const per: Record<string, THREE.Group> = {};
  for (const id of FLOOR_IDS) {
    const g = new THREE.Group();
    g.userData.floor = id;
    part.add(g);
    per[id] = g;
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
      b.position.set(i * 2 - 10, floorById(id), 0);
      g.add(b);
    }
  }
  const mover = new THREE.Group();
  mover.userData = { dyn: true, floor: "checks" };
  mover.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
  part.add(mover);
  const I = fakeIron(root);
  bakeShaft(I, root);
  for (const id of FLOOR_IDS) {
    const parts = I.floorParts!(id);
    expect(parts.length).toBeGreaterThan(0);
    // what's drawn for this floor is all inside its own parts
    const drawn: THREE.Object3D[] = [];
    for (const p of parts) p.traverse((o) => (o as THREE.Mesh).isMesh && o.visible && drawn.push(o));
    expect(drawn.length).toBeGreaterThan(0);
    for (const o of drawn) {
      let f: unknown;
      for (let q: THREE.Object3D | null = o; q && f === undefined; q = q.parent) f = q.userData.floor;
      expect(f).toBe(id);
    }
  }
  expect(I.floorParts!("checks")).toContain(mover);
  // hiding one floor hides only it
  for (const o of I.floorParts!("build")) o.visible = false;
  const stillDrawn = (id: string) => I.floorParts!(id).some((p) => p.visible);
  expect(stillDrawn("build")).toBe(false);
  for (const id of ["mine", "checks", "launch"]) expect(stillDrawn(id)).toBe(true);
  // the stub build shows it again
  const run = buildFloor(I, "build");
  expect(run.update(60)).toBe(true);
  expect(stillDrawn("build")).toBe(true);
  // baking one more holder later (a machine that just rose) adds to the floors, it doesn't wipe them
  const holder = new THREE.Group();
  const st = new THREE.Group();
  st.name = "station:x";
  holder.add(st);
  root.add(holder);
  bakeShaft(I, holder);
  expect(I.floorParts!("launch").length).toBeGreaterThan(0);
});

function floorById(id: string) {
  return FLOORS.find((f) => f.id === id)!.y;
}

test("the rock tapers from the quarry floor to a blunt tip and steps back", () => {
  const p = profile(20);
  expect(p[0][0]).toBeCloseTo(TOP);
  expect(p[20][0]).toBeCloseTo(TIP_Y);
  for (let i = 1; i < p.length; i++) {
    expect(p[i][1]).toBeLessThanOrEqual(p[i - 1][1]); // narrower going down
    expect(p[i][2]).toBeLessThanOrEqual(p[i - 1][2]); // and further back
  }
  expect(radius(TIP_Y)).toBeGreaterThan(1); // blunt, not a needle
  expect(radius(TOP + 1)).toBe(0);
  expect(SOCKET[1]).toBeLessThan(TIP[1]);
  expect(SMOG_TOP).toBeLessThan(SOCKET[1]);
  for (const c of CRACKS) {
    expect(inside(c.at[0], c.at[1])).toBe(true);
    expect(c.at[2]).toBeCloseTo(front(c.at[1]) + 0.05);
  }
  for (const l of LIPS) expect(inside(l.at[0], l.at[1])).toBe(true);
});
