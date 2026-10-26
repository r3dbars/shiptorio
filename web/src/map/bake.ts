// Static batching: the models are hundreds of tiny boxes each (~2,000 meshes on a busy map),
// and every one costs a draw call twice a frame (the shadow pass and the scene). Most of them
// never move, so we merge those into one mesh per material and leave the moving parts alone.
// The look doesn't change: same geometry, same materials, same shadows.
//
// Which parts move isn't written down anywhere (the Item Lab builders are copied as-is), so we
// find out by watching: snapshot every object, run the model's update() through its states,
// and anything whose transform, visibility, material or geometry changed is dynamic. A
// dynamic object keeps its whole subtree live. The merged originals stay in the tree, hidden,
// so code that reads their world position (particle spawn points) still works.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

interface Snap {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
  visible: boolean;
  material: unknown;
  geometry: unknown;
  look: string;
  version: number;
}

// What a material looks like, so two materials that never change and look alike can share a mesh.
type Look = THREE.Material & Partial<Record<"color" | "emissive" | "specular", THREE.Color>> & { map?: THREE.Texture | null; flatShading?: boolean; shininess?: number; emissiveIntensity?: number };
const look = (mt: THREE.Material) => {
  const m = mt as Look;
  return [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.specular?.getHex(), m.shininess, m.opacity, m.transparent, m.side, m.flatShading, m.vertexColors, m.depthWrite, m.depthTest, m.visible, m.alphaTest,
    m.map ? `${m.map.uuid}:${m.map.offset.x},${m.map.offset.y}:${m.map.repeat.x},${m.map.repeat.y}` : ""].join("|");
};

const list = (root: THREE.Object3D) => {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => out.push(o));
  return out;
};

const snap = (o: THREE.Object3D): Snap => {
  const m = o as THREE.Mesh;
  return {
    p: o.position.clone(),
    q: o.quaternion.clone(),
    s: o.scale.clone(),
    visible: o.visible,
    material: m.material,
    geometry: m.geometry,
    look: m.material && !Array.isArray(m.material) ? look(m.material) : "",
    version: (m.geometry?.attributes?.position as THREE.BufferAttribute | undefined)?.version ?? 0,
  };
};

const same = (a: Snap, o: THREE.Object3D) => {
  const m = o as THREE.Mesh;
  return (
    a.p.equals(o.position) &&
    a.q.equals(o.quaternion) &&
    a.s.equals(o.scale) &&
    a.visible === o.visible &&
    a.material === m.material &&
    a.geometry === m.geometry &&
    a.version === ((m.geometry?.attributes?.position as THREE.BufferAttribute | undefined)?.version ?? 0)
  );
};

// A shape fingerprint, so a cached probe is only reused on a tree built the same way.
export const signature = (root: THREE.Object3D) =>
  list(root)
    .map((o) => `${o.type}:${(o as THREE.Mesh).geometry?.type ?? ""}:${o.children.length}`)
    .join(",");

// What moved and what changed color while sweep() ran, as traverse indices. sweep() calls
// check() after every frame, so something that animates and comes back is still caught.
// Objects added during the sweep (particles) aren't in the snapshot and don't matter.
export interface Probe {
  moving: Set<number>;
  recolored: Set<number>; // meshes whose material changed (or was swapped); the rest are frozen
}
export function findDynamic(root: THREE.Object3D, sweep: (check: () => void) => void): Probe {
  const objs = list(root);
  const snaps = objs.map(snap);
  const moving = new Set<number>(), recolored = new Set<number>();
  sweep(() =>
    objs.forEach((o, i) => {
      if (!moving.has(i) && !same(snaps[i], o)) moving.add(i);
      const m = o as THREE.Mesh;
      if (!recolored.has(i) && m.isMesh && (m.material !== snaps[i].material || (!Array.isArray(m.material) && look(m.material) !== snaps[i].look))) recolored.add(i);
    }),
  );
  return { moving, recolored };
}

// Runs update() through each state for a while, jumping time around so slow cycles show up.
export function sweepStates(update: (t: number, dt: number, state: string) => void, states: string[], check: () => void, frames = 90) {
  let t = 0;
  for (const st of [...states, ...states.slice(0, 1)])
    for (let i = 0; i < frames; i++) {
      t += i % 10 === 9 ? 1.37 : 0.05;
      update(t, 0.05, st);
      check();
    }
}

const mergeable = (o: THREE.Object3D): o is THREE.Mesh => {
  const m = o as THREE.Mesh;
  if (m.constructor !== THREE.Mesh || !m.visible || Array.isArray(m.material)) return false;
  const mt = m.material as THREE.Material;
  if (mt.transparent || m.renderOrder !== 0 || !m.frustumCulled || m.morphTargetInfluences) return false;
  const g = m.geometry;
  return !!g.attributes.position && !g.morphAttributes.position; // one material, so face groups (BoxGeometry has 6) don't matter
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

// Merge static meshes into one mesh per material (and shadow flags) per rigid part. A rigid part
// is root or anything that moves; a mesh joins the nearest one above it, so a spinning rotor's
// bolts merge into the rotor and ride along. `dynamic` holds traverse indices from findDynamic
// on this tree or one built the same way.
// With a probe, materials that never changed and look alike merge together too (the Item Lab
// gives many parts a material of their own); without one, only the same material merges.
export function mergeStatic(root: THREE.Object3D, probe?: Probe, shareLooks = true) {
  const objs = list(root);
  const moving = new Set<THREE.Object3D>();
  objs.forEach((o, i) => probe?.moving.has(i) && moving.add(o));
  const frozen = (i: number) => shareLooks && !!probe && !probe.recolored.has(i);
  root.updateMatrixWorld(true);
  const groups = new Map<string, { anchor: THREE.Object3D; meshes: THREE.Mesh[] }>();
  for (const [i, o] of objs.entries()) {
    if (o === root || moving.has(o) || !mergeable(o)) continue;
    let anchor = o.parent!, ok = true;
    while (anchor !== root && !moving.has(anchor)) {
      if (!anchor.visible) ok = false;
      anchor = anchor.parent!;
    }
    if (!ok) continue;
    const mt = o.material as THREE.Material;
    const key = `${anchor.uuid}|${frozen(i) ? look(mt) : mt.uuid}|${o.castShadow}|${o.receiveShadow}`;
    const g = groups.get(key);
    if (g) g.meshes.push(o);
    else groups.set(key, { anchor, meshes: [o] });
  }
  for (const { anchor, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const inv = anchor.matrixWorld.clone().invert();
    const rel = new THREE.Matrix4();
    const geo = mergeGeometries(meshes.map((m) => prepare(m, rel.multiplyMatrices(inv, m.matrixWorld))));
    if (!geo) continue;
    const merged = new THREE.Mesh(geo, meshes[0].material);
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    merged.name = "baked";
    anchor.add(merged);
    for (const m of meshes) m.visible = false;
  }
}

// Probe once per model kind on a throwaway copy (running the real one through its states could
// leave it mid-launch); later copies reuse the answer if they're built the same way.
type Model = { g: THREE.Object3D; update(t: number, dt: number, state: string): void };
const probes = new Map<string, { sig: string; probe: Probe } | null>();
export function bakeModel<T extends Model>(key: string, built: T, copy: () => T, states: string[]): T {
  const sig = signature(built.g);
  let hit = probes.get(key);
  if (hit === undefined || (hit && hit.sig !== sig)) {
    const copyOf = copy();
    hit = signature(copyOf.g) === sig ? { sig, probe: findDynamic(copyOf.g, (check) => sweepStates(copyOf.update, states, check)) } : null;
    probes.set(key, hit);
  }
  built.g.userData.bake = key + (hit ? "" : " (no match)");
  if (hit) mergeStatic(built.g, hit.probe);
  return built;
}
