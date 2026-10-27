// Static batching for the shaft. The art is thousands of little boxes (rivets, bricks, rungs, bolts) and each
// one costs a draw call, twice a frame with shadows. After build, every mesh that never changes is merged with
// the others that share its material into one mesh per material, per region of the shaft (so a floor you
// aren't looking at is still culled), per part or machine. Things that move are marked by their module with
// K.dyn(object) (see CONTRACT.md); they and everything under them stay live. verifyDyn() is the dev check
// that a module marked everything that moves.
// Floors (ART-PASS.md, floors.ts): a piece tagged userData.floor (on itself or any ancestor under its part) merges
// only with pieces of the same floor, and the merged mesh keeps the tag, so I.floorParts(id) can hide or build a
// floor after the bake. Movers keep their own tag.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { Iron } from "./core";

const EMPTY = new THREE.BufferGeometry();

// the regions merged meshes are cut into: floors of the shaft, and left/right halves
const cellOf = (p: THREE.Vector3) => `${p.y < -6 ? "mine" : p.y < 6 ? "build" : p.y < 17 ? "checks" : "launch"}:${p.x < 0 ? "L" : "R"}`;

const isDyn = (o: THREE.Object3D) => !!o.userData.dyn || !!o.userData.noBake;

const mergeable = (o: THREE.Object3D): o is THREE.Mesh => {
  const m = o as THREE.Mesh;
  if (m.constructor !== THREE.Mesh || Array.isArray(m.material)) return false;
  const mt = m.material as THREE.Material;
  if (!(mt instanceof THREE.MeshBasicMaterial || mt instanceof THREE.MeshPhongMaterial || mt instanceof THREE.MeshLambertMaterial)) return false;
  if (mt.vertexColors || m.renderOrder !== 0 || m.morphTargetInfluences) return false;
  if (mt.transparent && mt.depthWrite) return false; // see-through things that hide what's behind them need sorting
  const g = m.geometry;
  return !!g.attributes.position && !g.morphAttributes.position;
};

function prepare(m: THREE.Mesh, rel: THREE.Matrix4): THREE.BufferGeometry {
  let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  const keep = new THREE.BufferGeometry();
  keep.setAttribute("position", g.attributes.position);
  if (!g.attributes.normal) g.computeVertexNormals();
  keep.setAttribute("normal", g.attributes.normal);
  const n = g.attributes.position.count;
  keep.setAttribute("uv", g.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g = keep;
  g.applyMatrix4(rel);
  if (rel.determinant() < 0) {
    // a mirrored part: flip each triangle's winding so it isn't culled inside out
    for (const name of ["position", "normal", "uv"]) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      const k = a.itemSize, arr = a.array as Float32Array;
      for (let v = 0; v + 2 < a.count; v += 3)
        for (let c = 0; c < k; c++) {
          const i1 = (v + 1) * k + c, i2 = (v + 2) * k + c;
          [arr[i1], arr[i2]] = [arr[i2], arr[i1]];
        }
    }
  }
  return g;
}

// The anchors merged meshes hang from: every part (world, mine, belts...) and machine holder, plus anything a
// module marked dynamic (its static children merge into it and ride along).
function anchorsOf(root: THREE.Object3D) {
  return root.children.filter((c) => c.name.startsWith("part:") || c.name.startsWith("station:"));
}

export interface BakeInfo {
  ms: number;
  meshesBefore: number;
  merged: number;
  meshesAfter: number;
}

export function bakeShaft(I: Iron, root: THREE.Group): BakeInfo {
  const t0 = performance.now();
  root.updateMatrixWorld(true);
  const groups = new Map<string, { anchor: THREE.Object3D; meshes: THREE.Mesh[]; floor?: string }>();
  const wp = new THREE.Vector3();
  let before = 0;
  root.traverse((o) => (o as THREE.Mesh).isMesh && o.visible && before++);
  // one floor map per Iron: baking a whole root starts it over, baking one holder (a machine that just rose) adds to it
  const I2 = I as Iron & { _floors?: Map<string, Set<THREE.Object3D>> };
  const floors = (I2._floors ??= new Map());
  if (root === I.root) floors.clear();
  const tag = (o: THREE.Object3D, floor: string | undefined) => {
    if (!floor) return;
    if (!floors.has(floor)) floors.set(floor, new Set());
    floors.get(floor)!.add(o);
  };
  const walk = (o: THREE.Object3D, anchor: THREE.Object3D, region: boolean, floor?: string) => {
    for (const c of o.children) {
      if (!c.visible) continue; // hidden now might show later: leave it alone
      const fl = (c.userData.floor as string | undefined) ?? floor;
      if (isDyn(c)) {
        // a moving part: its static children merge into it (a tagged mover is one of its floor's parts as a whole)
        if (fl && fl !== floor) tag(c, fl);
        walk(c, c, false, fl);
        continue;
      }
      if (mergeable(c) && !c.children.length) {
        const mt = c.material as THREE.Material;
        // big region-wide parts (world, mine, belts) are cut into floors; machines are small already
        let cell = "";
        if (region) {
          (c.geometry.boundingSphere ?? (c.geometry.computeBoundingSphere(), c.geometry.boundingSphere))!;
          c.getWorldPosition(wp);
          root.worldToLocal(wp);
          cell = cellOf(wp);
        }
        const key = `${anchor.uuid}|${mt.uuid}|${c.castShadow}|${c.receiveShadow}|${cell}|${fl ?? ""}`;
        const g = groups.get(key);
        if (g) g.meshes.push(c);
        else groups.set(key, { anchor, meshes: [c], floor: fl });
      } else if (fl && fl !== floor) tag(c, fl); // a tagged group, or a piece that can't merge (instanced, sprites...)
      walk(c, anchor, region, fl);
    }
  };
  for (const a of anchorsOf(root)) walk(a, a, a.name.startsWith("part:"), a.userData.floor as string | undefined);
  let merged = 0;
  const rel = new THREE.Matrix4();
  for (const { anchor, meshes, floor } of groups.values()) {
    if (meshes.length < 2) {
      if (floor) tag(meshes[0], floor); // left as it is
      continue;
    }
    const inv = anchor.matrixWorld.clone().invert();
    const geo = mergeGeometries(meshes.map((m) => prepare(m, rel.multiplyMatrices(inv, m.matrixWorld))));
    if (!geo) continue;
    geo.computeBoundingSphere();
    const out = new THREE.Mesh(geo, meshes[0].material);
    out.castShadow = meshes[0].castShadow;
    out.receiveShadow = meshes[0].receiveShadow;
    out.name = "baked";
    if (floor) {
      out.userData.floor = floor;
      tag(out, floor);
    }
    anchor.add(out);
    // hidden and emptied: code that reads their world position (spawn points) still works, nothing draws them
    for (const m of meshes) {
      m.visible = false;
      m.geometry = EMPTY;
      m.matrixAutoUpdate = false;
    }
    merged += meshes.length;
  }
  let after = 0;
  root.traverse((o) => (o as THREE.Mesh).isMesh && o.visible && after++);
  // keep only the top-most tagged object in each chain (hiding it hides what's under it); merged meshes hang off the
  // part's anchor, so they stay in the list on their own
  for (const set of floors.values())
    for (const o of [...set]) for (let p = o.parent; p; p = p.parent) if (set.has(p)) { set.delete(o); break; }
  I.floorParts ??= (id: string) => [...(I2._floors?.get(id) ?? [])];
  return { ms: Math.round(performance.now() - t0), meshesBefore: before, merged, meshesAfter: after };
}

// Dev check: run the line (every machine through IDLE, WORKING and BLOCKED) and list anything that moved,
// hid/showed or swapped geometry without being marked K.dyn. Those would freeze once merged.
export function verifyDyn(I: Iron, root: THREE.Group, seconds = 40) {
  const snaps = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; v: boolean; g: unknown }>();
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (isDyn(c)) continue;
      const m = c as THREE.Mesh;
      snaps.set(c, { p: c.position.clone(), q: c.quaternion.clone(), s: c.scale.clone(), v: c.visible, g: m.geometry });
      walk(c);
    }
  };
  for (const a of anchorsOf(root)) walk(a);
  const bad = new Set<THREE.Object3D>();
  const check = () => {
    for (const [o, s] of snaps) {
      if (bad.has(o)) continue;
      if (!s.p.equals(o.position) || !s.q.equals(o.quaternion) || !s.s.equals(o.scale) || s.v !== o.visible || s.g !== (o as THREE.Mesh).geometry) bad.add(o);
    }
  };
  const step = 1 / 20;
  const ids = I.stationList.map((s) => s.id);
  for (let t = 0; t < seconds; t += step) {
    I.debug.advance(step, step);
    // every few seconds, block one machine and free it again
    const k = Math.floor(t / 2.5);
    if (Math.abs(t - k * 2.5) < step / 2) {
      const id = ids[k % ids.length];
      if (id) I.stall(id);
      const prev = ids[(k - 1 + ids.length) % ids.length];
      if (prev && prev !== id) I.resolve(prev);
    }
    check();
  }
  ids.forEach((id) => I.resolve(id));
  const where = (o: THREE.Object3D) => {
    const names: string[] = [];
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) names.unshift(p.name || p.type + (p.parent ? "#" + p.parent.children.indexOf(p) : ""));
    return names.join(" > ");
  };
  // report the top-most unmarked mover in each chain (marking it covers its children)
  const tops = [...bad].filter((o) => !(o.parent && bad.has(o.parent)));
  return tops.map((o) => ({ where: where(o), type: (o as THREE.Mesh).geometry?.type ?? o.type, at: o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => Math.round(v * 10) / 10) }));
}
