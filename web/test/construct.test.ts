import { expect, test } from "bun:test";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CONSTRUCT_SECONDS, construct, findPieces, LUMP_VERTS, splitLump, type ConstructBeat } from "../src/map/shaft/construct";

// Build as you go, slice 3: construct.ts puts any machine group up (scaffold, parts dropping in bottom up, sparks)
// and must leave the group exactly as it was built, whether it plays out, is hurried, or is cancelled.

const mat = new THREE.MeshPhongMaterial({ color: 0x886644 });
function box(w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// a small machine like the shaft's: a holder turned 45 degrees, the machine group, nested parts, an aura ring
function machine() {
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.set(10, 0, 2);
  holder.rotation.y = -Math.PI / 4;
  holder.name = "station:asm-1";
  root.add(holder);
  const g = new THREE.Group();
  holder.add(g);
  box(4, 0.4, 4, 0, 0.2, 0, g); // plinth
  const body = new THREE.Group();
  body.position.set(0, 0.4, 0);
  body.rotation.y = 0.3; // a turned sub-frame: drops must still be straight down in the holder's frame
  g.add(body);
  for (let i = 0; i < 6; i++) box(0.5, 0.5 + i * 0.3, 0.5, -1.5 + i * 0.6, 0.5 + i * 0.3, 0, body);
  const dome = new THREE.Group();
  dome.position.y = 3;
  g.add(dome);
  for (let i = 0; i < 4; i++) box(0.3, 0.3, 0.3, Math.cos(i) * 0.8, 0, Math.sin(i) * 0.8, dome);
  const aura = new THREE.Group();
  aura.name = "aura";
  box(5, 0.05, 5, 0, 0.1, 0, aura);
  holder.add(aura);
  root.updateMatrixWorld(true);
  return { root, holder, g, aura };
}

// every object's parent, index and transform, to prove the group is left exactly as built
function snapshot(o: THREE.Object3D) {
  const out: string[] = [];
  o.traverse((c) => {
    const p = c.parent;
    out.push([c.uuid, p?.uuid, p?.children.indexOf(c), c.visible, c.matrixAutoUpdate, ...c.position.toArray(), ...c.quaternion.toArray(), ...c.scale.toArray(), (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.Material).uuid].join("|"));
  });
  return out;
}

const play = (run: { update(dt: number): boolean }, sec: number, dt = 1 / 30) => {
  for (let t = 0; t < sec; t += dt) if (run.update(dt)) return true;
  return false;
};

test("findPieces opens the groups up and leaves the aura alone", () => {
  const { holder, aura } = machine();
  const pieces = findPieces(holder);
  expect(pieces.length).toBeGreaterThanOrEqual(11);
  expect(pieces).not.toContain(aura);
  for (const p of pieces) {
    let a: THREE.Object3D | null = p;
    while (a && a !== aura) a = a.parent;
    expect(a).toBeNull();
  }
});

test("a full build hides the parts first, drops them in, and leaves the group exactly as built", async () => {
  const { root, holder } = machine();
  const before = snapshot(root);
  const beats: ConstructBeat[] = [];
  const run = construct(holder, { onBeat: (b) => beats.push(b) });
  expect(run.pieces).toBeGreaterThanOrEqual(11);
  run.update(0.05);
  // a scaffold went up, and nothing of the machine shows yet
  expect(holder.getObjectByName("scaffold")).toBeTruthy();
  const wraps = holder.children[0].getObjectsByProperty("name", "construct");
  expect(wraps.length).toBeGreaterThan(0);
  expect(wraps.every((w) => !w.visible)).toBe(true);
  // halfway: some parts landed, some still to come
  play(run, CONSTRUCT_SECONDS * 0.5);
  const shown = holder.children[0].getObjectsByProperty("name", "construct").filter((w) => w.visible).length;
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(wraps.length);
  expect(run.progress).toBeGreaterThan(0.4);
  expect(run.progress).toBeLessThan(0.6);
  expect(play(run, CONSTRUCT_SECONDS)).toBe(true);
  await run.done;
  expect(run.progress).toBe(1);
  root.updateMatrixWorld(true);
  expect(snapshot(root)).toEqual(before);
  expect(beats[0]).toBe("scaffold");
  expect(beats.filter((b) => b === "land").length).toBe(run.pieces);
  expect(beats).toContain("strike");
  expect(beats.at(-1)).toBe("done");
});

test("parts go in bottom up", () => {
  const { holder } = machine();
  const run = construct(holder);
  play(run, CONSTRUCT_SECONDS * 0.3);
  const wraps = holder.children[0].getObjectsByProperty("name", "construct");
  // the plinth (lowest) is in, the dome parts (highest) aren't yet
  const plinth = wraps.find((w) => (w.children[0] as THREE.Mesh).geometry?.parameters?.width === 4)!;
  expect(plinth.visible).toBe(true);
  const dome = wraps.filter((w) => w.children[0].parent?.parent?.position.y === 3 || w.children[0].position.y === 3 || (w.parent?.position.y ?? 0) === 3);
  expect(dome.length).toBeGreaterThan(0);
  expect(dome.every((w) => !w.visible)).toBe(true);
  run.finish();
});

test("finish mid-build (tap to hurry) and cancel both put the group back", async () => {
  for (const how of ["finish", "cancel"] as const) {
    const { root, holder } = machine();
    const before = snapshot(root);
    const run = construct(holder);
    play(run, 1.3);
    let resolved = false;
    run.done.then(() => (resolved = true));
    run[how]();
    await Promise.resolve();
    root.updateMatrixWorld(true);
    expect(snapshot(root)).toEqual(before);
    expect(holder.getObjectByName("scaffold")).toBeUndefined();
    expect(holder.getObjectByName("construct-fx")).toBeUndefined();
    expect(resolved).toBe(how === "finish");
    expect(run.update(1)).toBe(true);
  }
});

test("speed hurries it, and the default build takes about four seconds", () => {
  const a = construct(machine().holder);
  expect(play(a, CONSTRUCT_SECONDS - 0.2)).toBe(false);
  expect(play(a, 0.4)).toBe(true);
  const b = construct(machine().holder, { speed: 2 });
  expect(play(b, CONSTRUCT_SECONDS / 2 + 0.1)).toBe(true);
  const c = construct(machine().holder);
  play(c, 0.5);
  c.speed = 4;
  expect(play(c, 1)).toBe(true);
});

test("reduced motion fades the real parts in over a second, then gives the materials back", async () => {
  const { root, holder } = machine();
  const before = snapshot(root);
  const mesh = holder.children[0].children[0] as THREE.Mesh; // the plinth
  const run = construct(holder, { reduced: true });
  // no scaffold, nothing moves: the meshes get see-through copies of their material
  expect(holder.getObjectByName("scaffold")).toBeUndefined();
  play(run, 0.5);
  const m = mesh.material as THREE.MeshPhongMaterial;
  expect(m).not.toBe(mat);
  expect(m.transparent).toBe(true);
  expect(m.opacity).toBeGreaterThan(0.2);
  expect(m.opacity).toBeLessThan(0.8);
  expect(play(run, 0.6)).toBe(true);
  await run.done;
  root.updateMatrixWorld(true);
  expect(snapshot(root)).toEqual(before);
  expect(mesh.material).toBe(mat);
});

test("a merged lump is cut back into its parts for the build, then put back", async () => {
  // what K.bake / bake.ts leave: many boxes in one non-indexed mesh
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 120; i++) parts.push(new THREE.BoxGeometry(0.2, 0.2, 0.2).translate((i % 10) * 0.4 - 2, Math.floor(i / 10) * 0.4, (i % 3) * 0.4).toNonIndexed());
  const lump = mergeGeometries(parts)!;
  expect(lump.attributes.position.count).toBeGreaterThanOrEqual(LUMP_VERTS);
  const geos = splitLump(new THREE.Mesh(lump, mat), new THREE.Matrix4());
  expect(geos.length).toBeGreaterThan(4);
  // every triangle lands in exactly one cluster
  expect(geos.reduce((n, g) => n + g.attributes.position.count, 0)).toBe(lump.attributes.position.count);

  const { root, holder, g } = machine();
  const big = new THREE.Mesh(lump, mat);
  g.add(big);
  root.updateMatrixWorld(true);
  const before = snapshot(root);
  const run = construct(holder);
  run.update(0.05);
  expect(big.visible).toBe(false);
  expect(g.getObjectsByProperty("name", "construct-part").length).toBeGreaterThan(4);
  play(run, CONSTRUCT_SECONDS + 0.1);
  await run.done;
  expect(big.visible).toBe(true);
  expect(g.getObjectsByProperty("name", "construct-part").length).toBe(0);
  root.updateMatrixWorld(true);
  expect(snapshot(root)).toEqual(before);
});

test("an empty group still finishes", async () => {
  const run = construct(new THREE.Group());
  expect(play(run, CONSTRUCT_SECONDS + 0.1)).toBe(true);
  await run.done;
});
test("a warmed fade twin follows its original's disposal without retaining the old program owner", () => {
  const { holder } = machine();
  const mesh = holder.children[0].children[0] as THREE.Mesh;
  const orig = new THREE.MeshPhongMaterial({ color: 0x123456 });
  mesh.material = orig;
  const warm = construct(holder, { reduced: true });
  const twin = mesh.material as THREE.Material;
  warm.cancel();
  let disposed = 0;
  twin.addEventListener("dispose", () => disposed++);
  orig.dispose();
  expect(disposed).toBe(1);
  const next = construct(holder, { reduced: true });
  const freshTwin = mesh.material as THREE.Material;
  expect(freshTwin).not.toBe(twin);
  next.cancel();
  let freshDisposed = 0;
  freshTwin.addEventListener("dispose", () => freshDisposed++);
  orig.dispose();
  expect(disposed).toBe(1); // old source listener was removed
  expect(freshDisposed).toBe(1);
  expect(mesh.material).toBe(orig);
});

test("a reused warm fade captures current original appearance and restores its original", () => {
  const { holder } = machine();
  const mesh = holder.children[0].children[0] as THREE.Mesh;
  const orig = new THREE.MeshPhongMaterial({ color: 0x123456 });
  mesh.material = orig;
  const warm = construct(holder, { reduced: true });
  const twin = mesh.material as THREE.MeshPhongMaterial;
  warm.cancel();
  orig.color.setHex(0xabcdef);
  orig.emissive.setHex(0x102030);
  orig.opacity = 0.6;
  orig.map = new THREE.Texture();
  orig.needsUpdate = true;
  const fade = construct(holder, { reduced: true });
  expect(mesh.material).toBe(twin); // reuse retains the warmed material/program
  fade.update(0.5);
  expect(twin.color.getHex()).toBe(orig.color.getHex());
  expect(twin.emissive.getHex()).toBe(orig.emissive.getHex());
  expect(twin.map).toBe(orig.map);
  expect(twin.opacity).toBeCloseTo(0.3, 5);
  expect(twin.transparent).toBe(true);
  fade.finish();
  expect(mesh.material).toBe(orig);
  expect(orig.opacity).toBe(0.6);
  orig.dispose();
  orig.map.dispose();
});
