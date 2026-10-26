// The empire on the map: every other repo you connect floats near your main island as a smaller
// satellite island, tied to it by a sky rail that carries crates back and forth.
//
// Satellites are built from the same parts as the main island (the moss-cap island, real district
// buildings, the Item Lab launch pad) but they never animate, so each one is flattened into a
// handful of meshes (one per look) and skips the shadow pass. A whole satellite costs about as
// many draw calls as one machine on the main line.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildLaunchPad } from "./itemlab.js";
import { box, mat } from "./kit";
import { makeDistrict, makeFloater, makeIsland } from "./models";
import { PALETTE } from "./palette";
import { ironize } from "./iron";
import { IRON } from "./world";

export interface SatelliteSpec {
  repo: string;
  title: string; // label: the repo's short name
  sub: string; // label: what's happening there
  districts: { name: string; files: number }[];
  rockets: number;
  hot: boolean; // the empire's worst bottleneck is here
}

export interface SatelliteView {
  repo: string;
  key: string; // "island:<repo>", the pick key
  g: THREE.Group;
  labelY: number;
  half: number; // rough radius on the ground, for framing and placement
  bob: number;
}

// Satellites sit this far past the main island's edge.
const GAP = 7;

// Merge every static mesh under root into one mesh per look. Satellites never move inside, so all
// of it can go; colors and textures stay the same, only the draw calls drop.
function flatten(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { m: THREE.Material; geos: THREE.BufferGeometry[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.visible || Array.isArray(m.material)) return; // multi-material boxes ride along below
    // hidden anywhere up the chain (the pad's idle rocket flame) stays out
    for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return;
    const mt = m.material as THREE.MeshPhongMaterial;
    if (mt.transparent) return;
    const key = [mt.type, mt.color?.getHex(), mt.emissive?.getHex(), mt.map?.uuid ?? "", mt.map ? `${mt.map.repeat.x},${mt.map.repeat.y}` : "", mt.vertexColors, mt.side].join("|");
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const keep = new THREE.BufferGeometry();
    keep.setAttribute("position", g.attributes.position);
    if (!g.attributes.normal) g.computeVertexNormals();
    keep.setAttribute("normal", g.attributes.normal);
    const n = g.attributes.position.count;
    keep.setAttribute("uv", g.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    keep.setAttribute("color", g.attributes.color ?? new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g = keep;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(rel);
    if (rel.determinant() < 0) {
      // a mirrored part: flip each triangle's winding so it isn't culled inside out
      for (const name of ["position", "normal", "uv", "color"]) {
        const a = g.attributes[name] as THREE.BufferAttribute, k = a.itemSize, arr = a.array as Float32Array;
        for (let v = 0; v + 2 < a.count; v += 3)
          for (let c = 0; c < k; c++) [arr[(v + 1) * k + c], arr[(v + 2) * k + c]] = [arr[(v + 2) * k + c], arr[(v + 1) * k + c]];
      }
    }
    const entry = groups.get(key);
    if (entry) entry.geos.push(g);
    else groups.set(key, { m: mt, geos: [g] });
  });
  const out = new THREE.Group();
  for (const { m, geos } of groups.values()) {
    const geo = mergeGeometries(geos);
    if (!geo) continue;
    const merged = new THREE.Mesh(geo, m);
    merged.castShadow = merged.receiveShadow = false;
    out.add(merged);
  }
  // transparent bits (water, glass) and multi-material boxes (district plinths) ride along unmerged
  const loose: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && o.visible && (Array.isArray(m.material) || (m.material as THREE.Material).transparent)) loose.push(m);
  });
  for (const o of loose) {
    const c = new THREE.Mesh(o.geometry, o.material);
    new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    c.castShadow = c.receiveShadow = false;
    out.add(c);
  }
  return out;
}

export function buildSatellite(spec: SatelliteSpec, seed: number): SatelliteView {
  const ds = spec.districts.slice(0, 4);
  // a smaller island: its districts in a row behind a little launch pad
  const cols = Math.max(2, Math.min(4, ds.length));
  const w = 4 + cols * 2.4, d = 8.5;
  const raw = new THREE.Group();
  raw.add(makeIsland(w, d));
  const step = w / (cols + 0.4);
  ds.forEach((dist, i) => {
    const dw = Math.min(2.6, step - 0.4), dd = 2.4;
    const model = makeDistrict(dw, dd, Math.max(1, Math.min(4, Math.ceil(dist.files / 6))), dist.name);
    (model.roof as THREE.MeshPhongMaterial).color.setHex(0x4fae73);
    model.update(0);
    model.group.position.set(-w / 2 + step * (i + 0.7), 0, -d / 2 + 2.2);
    raw.add(model.group);
  });
  const pad = buildLaunchPad();
  if (IRON) ironize(pad.g);
  pad.update(0, 0.016, "IDLE");
  pad.g.scale.setScalar(0.8);
  pad.g.position.set(w / 2 - 2.1, 0, d / 2 - 2.3);
  raw.add(pad.g);
  // a short line of belt in front, so it reads as a factory, not a village
  for (let i = 0; i < 5; i++) box(0.9, 0.12, 0.7, i % 2 ? PALETTE.dark : 0x3a3f52, -w / 2 + 1.6 + i, 0.06, d / 2 - 2.3, raw);
  // a few rockets' worth of science crates stacked by the pad
  for (let i = 0; i < Math.min(6, spec.rockets); i++) box(0.4, 0.4, 0.4, [PALETTE.red, PALETTE.green, PALETTE.blue][i % 3], w / 2 - 3.9 + (i % 3) * 0.45, 0.2 + Math.floor(i / 3) * 0.42, d / 2 - 1.3, raw);

  const g = flatten(raw);
  // one floating chunk alongside, flattened with the rest
  const rock = makeFloater(0.7, 40 + seed);
  rock.position.set(w / 2 + 2, -2.4, -d / 4);
  rock.castShadow = rock.receiveShadow = false;
  g.add(rock);
  return { repo: spec.repo, key: `island:${spec.repo}`, g, labelY: 3.2, half: Math.hypot(w, d) / 2, bob: seed * 1.7 };
}

// Where satellite i of n sits, around a main island with this center and radius. They fan out on
// the far side (up on screen at the 45° camera), where the HUD never covers them.
export function satelliteSpot(i: number, n: number, center: THREE.Vector3, mainHalf: number, satHalf: number, yaw: number) {
  const up = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw)); // screen-up, on the ground
  const right = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
  const ring = Math.floor(i / 4); // more than four go further out
  const inRing = Math.min(4, n - ring * 4), k = i % 4;
  const r = mainHalf + satHalf + GAP + ring * (satHalf * 2 + GAP);
  // fan across the far side: one sits straight up, more spread to about ±40°
  const a = inRing === 1 ? 0 : (k / (inRing - 1) - 0.5) * Math.min(1.5, 0.55 * inRing) + (ring % 2) * 0.35;
  const x = center.x + (up.x * Math.cos(a) + right.x * Math.sin(a)) * r;
  const z = center.z + (up.y * Math.cos(a) + right.y * Math.sin(a)) * r;
  return new THREE.Vector3(x, -1.2 + ((i * 37) % 5) * 0.6, z);
}

// A sky rail from the main island's edge to a satellite: steel girders on a gentle sag, and
// crates riding it both ways. Girders are one mesh; crates are one instanced mesh.
export class Route {
  readonly g = new THREE.Group();
  private readonly crates: THREE.InstancedMesh;
  private readonly curve: THREE.QuadraticBezierCurve3;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly n: number;

  constructor(from: THREE.Vector3, to: THREE.Vector3, busy: boolean) {
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.min(from.y, to.y) - 1.2;
    this.curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const len = this.curve.getLength();
    const segs = Math.max(6, Math.round(len / 0.8));
    const geos: THREE.BufferGeometry[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < segs; i++) {
      this.curve.getPoint(i / segs, a);
      this.curve.getPoint((i + 1) / segs, b);
      const seg = b.clone().sub(a);
      const geo = new THREE.BoxGeometry(0.16, 0.1, seg.length() + 0.04);
      const o = new THREE.Object3D();
      o.position.copy(a).lerp(b, 0.5);
      o.lookAt(b);
      o.updateMatrix();
      geo.applyMatrix4(o.matrix);
      geos.push(geo);
      if (i % 3 === 0) {
        // a hanger every few segments
        const h = new THREE.BoxGeometry(0.06, 0.35, 0.06);
        h.translate(o.position.x, o.position.y - 0.2, o.position.z);
        geos.push(h);
      }
    }
    const rail = new THREE.Mesh(mergeGeometries(geos)!, mat(0x5b6378));
    rail.castShadow = rail.receiveShadow = false;
    this.g.add(rail);
    this.n = busy ? 6 : 3;
    this.crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), mat(0xffffff), this.n);
    const colors = [PALETTE.amber, PALETTE.green, PALETTE.blue, PALETTE.red];
    for (let i = 0; i < this.n; i++) this.crates.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    this.crates.castShadow = this.crates.receiveShadow = false;
    this.g.add(this.crates);
  }

  update(t: number) {
    for (let i = 0; i < this.n; i++) {
      // even crates ride out, odd ones ride home
      let s = (t * 0.06 + i / this.n) % 1;
      if (i % 2) s = 1 - s;
      this.curve.getPoint(s, this.p);
      this.p.y -= 0.32; // hanging under the rail
      this.m.makeTranslation(this.p.x, this.p.y, this.p.z);
      this.crates.setMatrixAt(i, this.m);
    }
    this.crates.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
