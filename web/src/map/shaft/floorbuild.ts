// Floating-city art pass, slice 9 (web/src/map/shaft/ART-PASS.md): a floor of the shaft gets built, about 6 s.
// A tower crane rises on the floor below and swings the girders up off a stack, scaffold climbs the front, the slab
// slides in from both sides, the riser wall lifts into place, the deck's dressing drops in, welders run sparks along
// the seam and the arched windows light last. Then the crane folds away and the scaffold comes down.
// It moves only the floor's own parts (I.floorParts(id)) and its temporary props (one group, <= 30 draw calls, gone
// when it ends). Reduced motion: the floor fades in over 1 s, no props.
// Same run shape as construct.ts: the caller ticks update(dt) from its frame loop (works with ?raf=0).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { Iron } from "./core";
import { floorById, type FloorId, type FloorRun } from "./floors";

export const FLOOR_BUILD_SECONDS = 6;
export const FADE_SECONDS = 1;

export interface FloorBuildOpts {
  reduced?: boolean;
  /** the whole build at speed 1 (default FLOOR_BUILD_SECONDS) */
  seconds?: number;
  speed?: number;
}

// Where each floor gets built from (CONTRACT.md "The shaft"): the deck's front edge (its riser wall's face), the floor
// below it that the crane stands on, and whether a riser wall holds it up (the build deck sits on the rock). The mine
// floor is always there: it has no build, only a show.
interface FloorSpec {
  /** deck top */
  top: number;
  front: number;
  below: number;
  /** the crane's z on the floor below: in front of the riser, behind the machines */
  craneZ: number;
  riser: boolean;
}
const SPECS: Partial<Record<FloorId, Omit<FloorSpec, "top">>> = {
  build: { front: 7.5, below: -16, craneZ: 10.7, riser: false },
  checks: { front: -4.5, below: 0.1, craneZ: -3.95, riser: true },
  launch: { front: -15.5, below: 11.1, craneZ: -14.95, riser: true },
};
export function specFor(id: FloorId): FloorSpec | null {
  const s = SPECS[id];
  return s ? { top: floorById(id).y + 0.1, ...s } : null;
}

// the beats, in seconds of a 6 s build (scaled to opts.seconds); the mine floor has no build and just shows
const BEAT = {
  craneUp: [0, 0.6],
  lifts: 0.5, // first lift starts; each takes LIFT
  scaffold: [0.8, 3.0],
  slab: [2.9, 4.0],
  rise: [3.5, 4.8],
  dress: [4.3, 5.0],
  weld: [4.4, 5.4],
  light: [4.9, 5.8],
  strike: [5.25, 6.0], // crane folds, scaffold comes down
} as const;
const LIFT = 0.8;
const LIFTS = 4;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const outCubic = (u: number) => 1 - (1 - u) ** 3;
const inOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const outBack = (u: number) => {
  const c = 1.4;
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

// ---------------------------------------------------------------------------------------------------------------
// the floor's own parts

type Kind = "slab" | "rise" | "dress" | "glow";

interface Piece {
  o: THREE.Object3D;
  vis: boolean;
  auto: boolean;
  m0: THREE.Matrix4;
  /** bounds in the piece's parent frame */
  box: THREE.Box3;
  kind: Kind;
  /** slab: which way it slides in from (+1 from the right, -1 from the left, 0 from behind) */
  side: number;
  /** its beat, in seconds */
  t0: number;
  t1: number;
}

interface Glow {
  mesh: THREE.Mesh;
  mat0: THREE.Material;
  mat: THREE.Material & { color: THREE.Color };
  base: THREE.Color;
  at: number; // when it lights
}

const isGlowMat = (m: THREE.Material): m is THREE.MeshBasicMaterial => {
  if (!(m instanceof THREE.MeshBasicMaterial)) return false;
  const c = m.color;
  return !!m.map || 0.3 * c.r + 0.59 * c.g + 0.11 * c.b > 0.18;
};

/** a floor's parts: what the bake split out for it, or (not baked: ?bake=0) the top-most objects tagged with it */
export function floorPieces(I: Iron, id: FloorId): THREE.Object3D[] {
  const got = I.floorParts?.(id);
  if (got?.length) return got;
  const out: THREE.Object3D[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.floor === id) out.push(c);
      else walk(c);
    }
  };
  walk(I.root);
  return out;
}

/** show every part of a floor (or hide them): the end state of a build, and what cancel() undoes */
export function showFloor(I: Iron, id: FloorId, on = true) {
  for (const o of floorPieces(I, id)) o.visible = on;
}

function boundsIn(o: THREE.Object3D, frame: THREE.Object3D | null): THREE.Box3 {
  const world = new THREE.Box3().setFromObject(o);
  if (world.isEmpty() || !frame) return world;
  const inv = frame.matrixWorld.clone().invert();
  const b = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) b.expandByPoint(v.set(i & 1 ? world.max.x : world.min.x, i & 2 ? world.max.y : world.min.y, i & 4 ? world.max.z : world.min.z).applyMatrix4(inv));
  return b;
}

// ---------------------------------------------------------------------------------------------------------------
// props: the crane, the girders, the scaffold, the welders. Built from boxes merged per material.

// lit the way core.js lights every Phong material (its IRON_LEGACY define)
const legacy = <T extends THREE.Material>(m: T): T => {
  (m as unknown as { defines: Record<string, string> }).defines = { IRON_LEGACY: "" };
  return m;
};
const phong = (c: number, shine = 0) => legacy(new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: shine, specular: shine ? 0x3a3a3a : 0 }));

class Boxes {
  private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rz = 0, ry = 0, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    (this.byMat.get(mat) ?? this.byMat.set(mat, []).get(mat)!).push(g);
  }
  /** a strut from a to b (in the xy plane at depth z) */
  strut(mat: THREE.Material, t: number, ax: number, ay: number, bx: number, by: number, z: number) {
    const dx = bx - ax, dy = by - ay;
    this.box(mat, Math.hypot(dx, dy), t, t, (ax + bx) / 2, (ay + by) / 2, z, Math.atan2(dy, dx));
  }
  /** a strut from a to b (in the yz plane at x) */
  strutYZ(mat: THREE.Material, t: number, ay: number, az: number, by: number, bz: number, x: number) {
    const dy = by - ay, dz = bz - az;
    this.box(mat, t, Math.hypot(dy, dz), t, x, (ay + by) / 2, (az + bz) / 2, 0, 0, Math.atan2(dz, dy));
  }
  into(parent: THREE.Object3D) {
    for (const [mat, list] of this.byMat) {
      const g = mergeGeometries(list);
      list.forEach((l) => l.dispose());
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = mesh.receiveShadow = false;
      parent.add(mesh);
    }
    this.byMat.clear();
  }
}

// one I-beam, 1 long along +y, flanges facing z
function iBeam(): THREE.BufferGeometry {
  const s = new THREE.Shape(), w = 0.22, f = 0.06, web = 0.05;
  s.moveTo(-w, -w);
  s.lineTo(w, -w);
  s.lineTo(w, -w + f);
  s.lineTo(web, -w + f);
  s.lineTo(web, w - f);
  s.lineTo(w, w - f);
  s.lineTo(w, w);
  s.lineTo(-w, w);
  s.lineTo(-w, w - f);
  s.lineTo(-web, w - f);
  s.lineTo(-web, -w + f);
  s.lineTo(-w, -w + f);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateX(-Math.PI / 2); // length along y
  return g;
}

interface Girder {
  column: boolean;
  len: number;
  /** where it lies on the stack, and where it ends up (centers + rotation about z) */
  stack: THREE.Vector3;
  stackRz: number;
  place: THREE.Vector3;
  placeRz: number;
  /** hook positions: on the stack, and at its place */
  pick: THREE.Vector3;
  drop: THREE.Vector3;
}

// rng with a fixed seed: every replay of a floor looks the same
function srand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ---------------------------------------------------------------------------------------------------------------

export function buildFloor(I: Iron, floorId: FloorId, opts: FloorBuildOpts = {}): FloorRun {
  const spec = specFor(floorId);
  const parts = floorPieces(I, floorId);
  // what moves: each merged mesh and each mover in the floor's groups (a floor is one tagged group of its merged
  // static meshes, one per material, plus its movers)
  const leaves: THREE.Object3D[] = [];
  const expand = (o: THREE.Object3D) => {
    if ((o as THREE.Light).isLight) return;
    if ((o as THREE.Mesh).isMesh || o.userData.dyn) leaves.push(o);
    else o.children.forEach(expand);
  };
  parts.forEach(expand);
  // the floor's own groups show from the start (a floor not built yet is hidden whole); its pieces come in one by one
  const shown0 = parts.map((o) => o.visible);
  parts.forEach((o) => (o.visible = true));
  const reduced = !!opts.reduced;
  const T = reduced ? FADE_SECONDS : opts.seconds ?? FLOOR_BUILD_SECONDS;
  const k = T / FLOOR_BUILD_SECONDS; // beat scale
  const speed = opts.speed ?? 1;
  const root = I.root;
  root.updateMatrixWorld(true);

  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  let t = 0, over = false;

  // ---------- the floor's pieces ----------
  const all = new THREE.Box3();
  const pieces: Piece[] = [];
  const glows: Glow[] = [];
  const lights: { l: THREE.Light; i0: number }[] = [];
  const clones = new Map<THREE.Material, THREE.Material>();
  const swapped: { mesh: THREE.Mesh; mat0: THREE.Material | THREE.Material[] }[] = [];
  for (const o of leaves) {
    const rb = boundsIn(o, root);
    if (!rb.isEmpty()) all.union(rb);
  }
  for (const o of parts)
    o.traverse((l) => {
      if ((l as THREE.Light).isLight) lights.push({ l: l as THREE.Light, i0: (l as THREE.Light).intensity });
    });
  // the deck's span, what the props and slides measure from: the layout's deck (the floor's dressing and the skyline
  // on top of the launch floor reach wider), else what's flat among its pieces
  const deck = new THREE.Box3();
  const tier = (I.layout?.tiers as Record<string, { y: number; x0: number; x1: number; z0: number; z1: number }> | undefined)?.[floorId];
  if (tier) deck.set(new THREE.Vector3(tier.x0, tier.y - 1.4, tier.z0), new THREE.Vector3(tier.x1, tier.y + 0.1, tier.z1));
  else
    for (const o of leaves) {
      const rb = boundsIn(o, root);
      if (!rb.isEmpty() && rb.max.y - rb.min.y < 2.2) deck.union(rb);
    }
  if (deck.isEmpty()) deck.copy(all);
  const W = deck.isEmpty() ? 37 : deck.max.x - deck.min.x;
  const cx = deck.isEmpty() ? 0 : (deck.min.x + deck.max.x) / 2;
  for (const o of leaves) {
    const rb = boundsIn(o, root);
    if (rb.isEmpty()) continue;
    let meshes = 0, glowing = 0;
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      meshes++;
      if (isGlowMat(mesh.material)) glowing++;
    });
    const h = rb.max.y - rb.min.y;
    const kind: Kind = meshes && glowing === meshes ? "glow" : h < 2.2 ? "slab" : h >= 3.5 ? "rise" : "dress";
    const mx = (rb.min.x + rb.max.x) / 2;
    const side = Math.abs(mx - cx) < 3 ? 0 : Math.sign(mx - cx);
    pieces.push({ o, vis: o.visible, auto: o.matrixAutoUpdate, m0: o.matrix.clone(), box: boundsIn(o, o.parent), kind, side, t0: 0, t1: 0 });
  }
  // each kind's pieces go in one after another across its beat, bottom up then left to right
  const byKind = (kind: Kind) => pieces.filter((p) => p.kind === kind).sort((a, b) => a.box.min.y - b.box.min.y || a.box.min.x - b.box.min.x);
  const stagger = (list: Piece[], a: number, b: number, each: number) =>
    list.forEach((p, i) => {
      const gap = list.length > 1 ? (b - a - each) / (list.length - 1) : 0;
      p.t0 = (a + i * Math.max(0, gap)) * k;
      p.t1 = p.t0 + Math.min(each, b - a) * k;
    });
  stagger(byKind("slab"), BEAT.slab[0], BEAT.slab[1], 0.8);
  stagger(byKind("rise"), BEAT.rise[0], BEAT.rise[1], 1.0);
  stagger(byKind("dress"), BEAT.dress[0], BEAT.dress[1], 0.45);
  for (const p of byKind("glow")) (p.t0 = BEAT.rise[1] * k), (p.t1 = p.t0);

  // windows and lamps: dark until the end, then they light left to right with a flicker
  const clone = <M extends THREE.Material>(m: M): M => {
    let c = clones.get(m);
    if (!c) clones.set(m, (c = m.clone()));
    return c as M;
  };
  const xs = { min: deck.isEmpty() ? -1 : deck.min.x, w: Math.max(1, W) };
  for (const p of pieces)
    p.o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const mat0 = mesh.material;
      if (reduced) {
        const c = clone(mat0);
        c.transparent = true;
        swapped.push({ mesh, mat0 });
        mesh.material = c;
      } else if (isGlowMat(mat0)) {
        const c = clone(mat0);
        swapped.push({ mesh, mat0 });
        mesh.material = c;
        const b = boundsIn(mesh, root);
        const u = b.isEmpty() ? 0.5 : clamp01(((b.min.x + b.max.x) / 2 - xs.min) / xs.w);
        glows.push({ mesh, mat0, mat: c, base: mat0.color.clone(), at: (BEAT.light[0] + u * 0.5) * k });
      }
    });
  const opac = new Map<THREE.Material, number>();
  for (const [m0, c] of clones) opac.set(c, m0.opacity);

  // ---------- props ----------
  const props = new THREE.Group();
  props.name = `floorbuild:${floorId}`;
  props.userData.noBake = true;
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  let tick = (_t: number) => {};
  if (!reduced && spec && leaves.length) tick = stageProps(I, spec, deck, props, own, k);
  if (!reduced) root.add(props);

  // ---------- the clock ----------
  const pm = new THREE.Matrix4(), pv = new THREE.Matrix4(), ps = new THREE.Matrix4();
  const tmp = new THREE.Color();
  function apply() {
    const end = t >= T;
    for (const p of pieces) {
      if (reduced || end) {
        p.o.visible = true;
        continue;
      }
      const u = p.t1 > p.t0 ? span(t, p.t0, p.t1) : t >= p.t0 ? 1 : 0;
      p.o.visible = t >= p.t0;
      p.o.matrixAutoUpdate = false;
      const b = p.box;
      if (p.kind === "slab") {
        const d = 1 - outCubic(u);
        const reach = W * 0.55 + 4;
        const settle = u < 1 ? Math.sin(u * Math.PI) * 0.12 : 0;
        pv.makeTranslation(p.side * reach * d, settle, p.side ? 0 : -(reach * 0.6) * d);
        p.o.matrix.multiplyMatrices(pv, p.m0);
      } else if (p.kind === "rise") {
        const s = Math.max(0.001, outCubic(u));
        pv.makeTranslation(0, b.min.y, 0);
        ps.makeScale(1, s, 1);
        pm.makeTranslation(0, -b.min.y, 0);
        p.o.matrix.copy(pv).multiply(ps).multiply(pm).multiply(p.m0);
      } else if (p.kind === "dress") {
        pv.makeTranslation(0, 2.6 * (1 - outBack(u)), 0);
        p.o.matrix.multiplyMatrices(pv, p.m0);
      } else p.o.matrix.copy(p.m0);
      p.o.matrixWorldNeedsUpdate = true;
    }
    if (reduced) {
      const a = end ? 1 : clamp01(t / T);
      for (const [c, o] of opac) c.opacity = o * a;
    } else
      for (const g of glows) {
        let v = end ? 1 : t < g.at ? 0 : clamp01((t - g.at) / (0.35 * k));
        // a few stutters as each one catches
        if (v > 0 && v < 1 && Math.sin(t * 61 + g.at * 37) > 0.25) v *= 0.35;
        g.mat.color.copy(tmp.copy(g.base).multiplyScalar(0.05)).lerp(g.base, v);
      }
    const lu = reduced ? clamp01(t / T) : span(t, BEAT.light[0] * k, BEAT.light[1] * k);
    for (const { l, i0 } of lights) l.intensity = end ? i0 : i0 * lu;
    tick(t);
  }

  // back to normal: the floor's own transforms and materials, props gone
  function restore(visible: boolean | null) {
    parts.forEach((o, i) => (o.visible = visible ?? shown0[i]));
    for (const p of pieces) {
      p.o.matrix.copy(p.m0);
      p.o.matrixAutoUpdate = p.auto;
      p.o.matrixWorldNeedsUpdate = true;
      p.o.visible = visible ?? p.vis;
    }
    for (const { mesh, mat0 } of swapped) mesh.material = mat0;
    for (const c of clones.values()) c.dispose();
    clones.clear();
    for (const { l, i0 } of lights) l.intensity = i0;
    props.removeFromParent();
    props.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    disposables.forEach((d) => d.dispose());
    disposables.length = 0;
  }

  function end(visible: boolean | null) {
    if (over) return;
    over = true;
    t = T;
    restore(visible);
    resolve();
  }

  apply();
  const run: FloorRun = {
    update(dt: number) {
      if (over) return true;
      t = Math.min(T, t + Math.max(0, dt) * speed);
      if (t >= T) end(true);
      else apply();
      return over;
    },
    finish: () => end(true),
    cancel: () => end(null),
    done,
    get progress() {
      return over ? 1 : clamp01(t / T);
    },
  };
  return run;
}

// ---------------------------------------------------------------------------------------------------------------
// the crane, its girders, the scaffold and the welders for one floor. Returns the per-frame update.

function stageProps(
  I: Iron,
  spec: FloorSpec,
  all: THREE.Box3,
  props: THREE.Group,
  own: <T extends { dispose(): void }>(x: T) => T,
  k: number,
): (t: number) => void {
  const rnd = srand(Math.round(spec.top * 100) + 7);
  const IRON = own(phong(0x3a3430, 18));
  const AMBER = own(phong(0x8a6418, 20));
  const STONE = own(phong(0x6a5e52));
  const BRASS = own(phong(0xb08a3a, 40));
  const WOOD = own(phong(0x4a3220));
  const POLE = own(phong(0x5a524a, 14));
  const RUST = own(phong(0x9a4426, 22)); // red-oxide primer, so the steel reads against the brick
  const CAB = own(new THREE.MeshBasicMaterial({ color: 0xffb860, fog: false }));
  const HOT = own(new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false }));
  const SPARK = own(new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));

  const x0 = all.min.x + 0.8, x1 = all.max.x - 0.8, mid = (x0 + x1) / 2;
  const slabBottom = spec.top - 1.5;
  const zr = spec.front - 0.35; // inside the riser wall / slab edge: the wall buries the girders as it rises
  const base = spec.below;

  // ---------- where the crane stands: the clearest spot near the middle of the floor below ----------
  const below = (I.stationList ?? []).filter((s) => Math.abs(s.y - base) < 2.5 && Math.abs(s.z - spec.craneZ) < 4.5);
  // and clear of the belts, tubes and lifts that run up past it (the header tube along the riser wall)
  const mastTop = spec.top + 5.2;
  const nearPath: number[] = [];
  for (const path of I.pathList ?? [])
    for (let i = 0; i + 1 < path.points.length; i++) {
      const [ax, ay, az] = path.points[i], [bx, by, bz] = path.points[i + 1];
      for (let u = 0; u <= 1; u += 0.1) {
        const x = lerp(ax, bx, u), y = lerp(ay, by, u), z = lerp(az, bz, u);
        if (y > base - 0.5 && y < mastTop && Math.abs(z - spec.craneZ) < 1.4) nearPath.push(x);
      }
    }
  let craneX = mid, best = -Infinity;
  for (let x = x0 + 4; x <= x1 - 4; x += 0.5) {
    if (nearPath.some((px) => Math.abs(px - x) < 1.4)) continue;
    const clear = below.length ? Math.min(...below.map((s) => Math.abs(s.x - x) - (s.layoutDef.power ? 1.8 : 3))) : 6;
    const score = Math.min(clear, 4) - Math.abs(x - mid) * 0.08;
    if (score > best) (best = score), (craneX = x);
  }
  const craneZ = spec.craneZ;
  const mastH = spec.top + 4.6 - base;
  const toward = craneX > mid ? -1 : 1; // the floor's middle, from the crane

  // ---------- the girders ----------
  const girders: Girder[] = [];
  const riseH = slabBottom - base;
  if (spec.riser) {
    for (const f of [-0.36, 0, 0.36]) girders.push({ column: true, len: riseH, stack: new THREE.Vector3(), stackRz: 0, place: new THREE.Vector3(mid + f * (x1 - x0), base + riseH / 2, zr), placeRz: 0, pick: new THREE.Vector3(), drop: new THREE.Vector3() });
    girders.push({ column: false, len: Math.min(16, x1 - x0 - 4), stack: new THREE.Vector3(), stackRz: 0, place: new THREE.Vector3(mid, slabBottom + 0.25, zr), placeRz: Math.PI / 2, pick: new THREE.Vector3(), drop: new THREE.Vector3() });
  } else {
    // the build deck sits on the rock: its beams are laid across the cliff top, front to back
    for (let i = 0; i < LIFTS; i++) {
      const z = spec.front - 1.2 - i * 3;
      girders.push({ column: false, len: 14, stack: new THREE.Vector3(), stackRz: 0, place: new THREE.Vector3(mid + (i % 2 ? 5 : -5), slabBottom + 0.3, z), placeRz: Math.PI / 2, pick: new THREE.Vector3(), drop: new THREE.Vector3() });
    }
  }
  // the stack: lying flat by the crane's foot, the first one to go up on top
  const stackX = craneX + toward * 2.4, stackZ = craneZ + 1.5;
  const HANG = 0.32; // hook to the top of what it carries
  girders.forEach((g, i) => {
    const lvl = base + 0.25 + (girders.length - 1 - i) * 0.46;
    if (g.column) {
      // lies along x with its top end under the hook; tips up as it lifts
      g.stackRz = toward * (Math.PI / 2);
      g.pick.set(stackX - toward * 0.2, lvl, stackZ);
      g.stack.set(g.pick.x + toward * (g.len / 2 + HANG), lvl, stackZ);
      g.drop.set(g.place.x, g.place.y + g.len / 2 + HANG, g.place.z);
    } else {
      g.stackRz = Math.PI / 2;
      g.stack.set(stackX + toward * (g.len / 2 - 1), lvl, stackZ);
      g.pick.set(g.stack.x, lvl + 0.22 + HANG, stackZ);
      g.drop.set(g.place.x, g.place.y + 0.22 + HANG, g.place.z);
    }
  });
  const reach = Math.max(...girders.flatMap((g) => [g.pick, g.drop]).map((p) => Math.hypot(p.x - craneX, p.z - craneZ)));
  const jibL = Math.min(24, reach + 1.2);

  // ---------- the crane ----------
  const crane = new THREE.Group();
  crane.position.set(craneX, base, craneZ);
  props.add(crane);
  {
    const B = new Boxes(), s = 0.36, seg = 1.15;
    // ballast footing + the mast's four chords with a zig-zag lattice on the faces you see
    B.box(STONE, 2.4, 0.6, 2.0, 0, 0.3, 0);
    B.box(IRON, 2.8, 0.18, 0.3, 0, 0.66, 0);
    B.box(IRON, 0.3, 0.18, 2.4, 0, 0.66, 0);
    for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) B.box(AMBER, 0.13, mastH, 0.13, x, mastH / 2 + 0.6, z);
    for (let y = 0.6, i = 0; y + seg <= mastH + 0.6; y += seg, i++) {
      const a = i % 2 ? -s : s;
      B.strut(IRON, 0.07, a, y, -a, y + seg, s);
      B.strut(IRON, 0.07, a, y, -a, y + seg, -s);
      B.box(IRON, s * 2, 0.07, 0.07, 0, y, s);
      B.strutYZ(IRON, 0.07, y, a, y + seg, -a, s);
      B.strutYZ(IRON, 0.07, y, a, y + seg, -a, -s);
    }
    B.into(crane);
  }
  const top = new THREE.Group();
  top.position.y = mastH + 0.6;
  crane.add(top);
  {
    const B = new Boxes();
    B.box(AMBER, 1.3, 0.32, 1.3, 0, 0.16, 0); // slewing ring
    B.box(IRON, 1.0, 0.85, 0.9, 0.15, -0.35, 0.78); // the driver's cab
    B.box(CAB, 0.66, 0.34, 0.05, 0.15, -0.25, 1.24);
    // jib: two bottom chords, one top chord, zig-zag between them
    const yb = 0.38, yt = 1.08, zc = 0.3;
    B.box(AMBER, jibL, 0.11, 0.11, jibL / 2, yb, zc);
    B.box(AMBER, jibL, 0.11, 0.11, jibL / 2, yb, -zc);
    B.box(AMBER, jibL - 0.6, 0.11, 0.11, (jibL - 0.6) / 2, yt, 0);
    for (let x = 0, i = 0; x + 1.1 <= jibL - 0.6; x += 1.1, i++) B.strut(AMBER, 0.06, x + (i % 2 ? 1.1 : 0), yb, x + (i % 2 ? 0 : 1.1), yt, zc * 0.5);
    B.box(BRASS, 0.3, 0.3, 0.7, jibL - 0.1, yb, 0); // jib tip
    // counter-jib with its weights, the apex and the ties
    B.box(IRON, 5, 0.2, 0.75, -2.5, yb, 0);
    B.box(STONE, 1.2, 1.05, 0.95, -4.1, yb - 0.4, 0);
    B.box(STONE, 1.0, 0.9, 0.95, -2.95, yb - 0.32, 0);
    B.box(AMBER, 0.18, 2.6, 0.18, 0, yb + 1.3, 0);
    B.strut(IRON, 0.05, 0, yb + 2.6, jibL * 0.72, yt, 0);
    B.strut(IRON, 0.05, 0, yb + 2.6, -4.4, yb + 0.1, 0);
    B.box(CAB, 0.14, 0.14, 0.14, 0, yb + 2.7, 0); // the red-amber warning lamp on the apex
    B.into(top);
  }
  const trolley = new THREE.Group();
  trolley.position.y = 0.3;
  top.add(trolley);
  {
    const B = new Boxes();
    B.box(IRON, 0.7, 0.22, 0.8, 0, 0, 0);
    B.into(trolley);
  }
  const cable = own(new THREE.BoxGeometry(0.05, 1, 0.05));
  const cableMesh = new THREE.Mesh(cable, IRON);
  trolley.add(cableMesh);
  const hook = new THREE.Group();
  trolley.add(hook);
  {
    const B = new Boxes();
    B.box(BRASS, 0.38, 0.42, 0.3, 0, -0.21, 0);
    B.box(IRON, 0.1, 0.24, 0.1, 0, -0.52, 0);
    B.box(IRON, 0.24, 0.08, 0.1, 0.08, -0.64, 0);
    B.into(hook);
  }

  // ---------- girders: one instanced mesh ----------
  const beamGeo = own(iBeam());
  const beams = new THREE.InstancedMesh(beamGeo, RUST, girders.length);
  beams.frustumCulled = false;
  props.add(beams);

  // ---------- scaffold: poles + planks (riser floors) ----------
  const zs = spec.front + 0.55;
  const bays: number[] = [];
  for (let x = x0 + 0.5; x <= x1 - 0.5 + 1e-6; x += 3.1) bays.push(x);
  const tiers = spec.riser ? Math.max(1, Math.ceil(riseH / 2.2)) : 0;
  const tierH = tiers ? riseH / tiers : 0;
  const poles = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.055, 0.055, 1, 5)), POLE, Math.max(1, bays.length * tiers + tiers * Math.ceil((bays.length - 1) / 2)));
  const planks = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 0.07, 0.62)), WOOD, Math.max(1, (bays.length - 1) * tiers));
  poles.frustumCulled = planks.frustumCulled = false;
  if (tiers) props.add(poles, planks);

  // ---------- welders: a hot seam growing in from each end, and the sparks they throw ----------
  const seamY = slabBottom + 0.05, seamZ = spec.front + 0.3;
  const seamGeo = own(new THREE.BoxGeometry(1, 0.16, 0.12));
  const seamL = new THREE.Mesh(seamGeo, HOT), seamR = new THREE.Mesh(seamGeo, HOT);
  props.add(seamL, seamR);
  const NS = 56;
  const sparks = new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.15, 0.15, 0.15)), SPARK, NS);
  sparks.frustumCulled = false;
  props.add(sparks);
  const sp = Array.from({ length: NS }, (_, i) => ({ side: i % 2 ? 1 : -1, born: rnd(), vx: (rnd() - 0.5) * 2.4, vy: 1 + rnd() * 2.4, vz: 0.4 + rnd() * 1.6 }));

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), cv = new THREE.Vector3(), sc = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const HOT_ON = new THREE.Color(0xffa040), HOT_OFF = new THREE.Color(0x3a1c0e);
  const travelY = (g: Girder) => (g.column ? base + g.len + HANG + 1.0 : spec.top + 1.2);

  // the hook, in the crane's polar terms (slew angle, trolley radius, hook height), so moves swing like a crane
  const polar = (p: THREE.Vector3) => ({ a: Math.atan2(-(p.z - craneZ), p.x - craneX), r: Math.hypot(p.x - craneX, p.z - craneZ), y: p.y });
  type Polar = ReturnType<typeof polar>;
  const mixP = (a: Polar, b: Polar, u: number): Polar => {
    let da = b.a - a.a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return { a: a.a + da * u, r: lerp(a.r, b.r, u), y: lerp(a.y, b.y, u) };
  };
  const rest: Polar = { a: toward > 0 ? 0 : Math.PI, r: jibL * 0.45, y: base + mastH - 2 };
  const P = (x: number, y: number, z: number) => polar(v.set(x, y, z));

  const lift0 = BEAT.lifts * k, liftT = LIFT * k;
  return (t: number) => {
    // crane up, then folded away at the end
    const up = outBack(span(t, BEAT.craneUp[0] * k, BEAT.craneUp[1] * k));
    const fold = inOut(span(t, BEAT.strike[0] * k, BEAT.strike[1] * k));
    crane.scale.set(1, Math.max(0.001, up * (1 - fold)), 1);
    crane.visible = up * (1 - fold) > 0.01;

    // which lift is under way, and where the hook is
    let hp: Polar = rest;
    const li = Math.floor((t - lift0) / liftT);
    for (let i = 0; i < girders.length; i++) {
      const g = girders[i];
      const u = clamp01((t - lift0 - i * liftT) / liftT);
      let rz: number, c: THREE.Vector3;
      if (u <= 0.3) {
        rz = g.stackRz;
        c = cv.copy(g.stack);
      } else if (u >= 1) {
        rz = g.placeRz;
        c = cv.copy(g.place);
      } else {
        // carried: tip up off the stack, swing over, set down
        const ty = travelY(g);
        let h: Polar;
        if (u < 0.5) h = mixP(polar(g.pick), P(g.pick.x, ty, g.pick.z), inOut((u - 0.3) / 0.2));
        else if (u < 0.8) h = mixP(P(g.pick.x, ty, g.pick.z), P(g.drop.x, ty, g.drop.z), inOut((u - 0.5) / 0.3));
        else h = mixP(P(g.drop.x, ty, g.drop.z), polar(g.drop), outCubic((u - 0.8) / 0.2));
        hp = h;
        rz = g.column ? g.stackRz * (1 - outCubic(clamp01((u - 0.3) / 0.22))) : g.placeRz;
        const sway = u < 0.8 ? Math.sin(u * 19) * 0.04 * (1 - u) : 0;
        const hx = craneX + Math.cos(h.a) * h.r, hz = craneZ - Math.sin(h.a) * h.r;
        // hang from the hook: by its top end (a column, tipping up as it goes) or flat under it (a beam)
        if (g.column) c = cv.set(hx + Math.sin(rz) * (g.len / 2 + HANG), h.y - Math.cos(rz) * (g.len / 2 + HANG), hz);
        else c = cv.set(hx, h.y - 0.22 - HANG, hz);
        rz += sway;
      }
      if (i === li) {
        // the hook's way back to the stack before this lift picks up
        const uu = clamp01((t - lift0 - i * liftT) / liftT);
        if (uu <= 0.3) {
          const prev = i > 0 ? polar(girders[i - 1].drop) : rest;
          hp = mixP(prev, polar(g.pick), inOut(uu / 0.3));
        }
      }
      q.setFromAxisAngle(zAxis, rz);
      sc.set(1, g.len, 1);
      const shown = t >= 0 && t < BEAT.strike[1] * k && (g.column || u < 1 || t < BEAT.slab[1] * k);
      beams.setMatrixAt(i, shown ? m.compose(c, q, sc) : hide);
    }
    if (t >= lift0 + girders.length * liftT) hp = mixP(polar(girders[girders.length - 1].drop), rest, inOut(clamp01((t - lift0 - girders.length * liftT) / (0.6 * k))));
    beams.instanceMatrix.needsUpdate = true;
    top.rotation.y = hp.a;
    trolley.position.x = Math.max(0.9, Math.min(jibL - 0.4, hp.r));
    const drop = Math.max(0.3, top.position.y + 0.3 + base - hp.y);
    cableMesh.scale.y = drop;
    cableMesh.position.y = -drop / 2;
    hook.position.y = -drop;

    // scaffold climbs tier by tier, then comes down top first
    if (tiers) {
      let pi = 0, ki = 0;
      const climb = (BEAT.scaffold[1] - BEAT.scaffold[0]) * k;
      for (let tr = 0; tr < tiers; tr++) {
        const tA = BEAT.scaffold[0] * k + (tr / tiers) * climb;
        const strike = span(t, (BEAT.strike[0] + (tiers - 1 - tr) * 0.08) * k, (BEAT.strike[0] + (tiers - 1 - tr) * 0.08 + 0.3) * k);
        const yb = base + tr * tierH;
        for (let b = 0; b < bays.length; b++) {
          const u = outCubic(span(t, tA + b * 0.012 * k, tA + (0.4 + b * 0.012) * k)) * (1 - strike);
          poles.setMatrixAt(pi++, u > 0.001 ? m.compose(v.set(bays[b], yb + (tierH * u) / 2, zs), q.identity(), sc.set(1, tierH * u, 1)) : hide);
          if (b < bays.length - 1) {
            const w = outCubic(span(t, tA + (0.3 + b * 0.012) * k, tA + (0.55 + b * 0.012) * k)) * (1 - strike);
            planks.setMatrixAt(ki++, w > 0.001 ? m.compose(v.set((bays[b] + bays[b + 1]) / 2, yb + tierH - 0.05, zs + 0.15), q.identity(), sc.set(2.8 * w, 1, 1)) : hide);
            // a cross brace every other bay and tier
            if ((b + tr) % 2 === 0) {
              const L = Math.hypot(3.1, tierH);
              q.setFromAxisAngle(zAxis, Math.atan2(3.1, tierH) * (tr % 2 ? 1 : -1));
              poles.setMatrixAt(pi++, u > 0.99 && w > 0.5 ? m.compose(v.set((bays[b] + bays[b + 1]) / 2, yb + tierH / 2, zs + 0.06), q, sc.set(0.7, L, 0.7)) : hide);
              q.identity();
            }
          }
        }
      }
      for (; pi < poles.count; pi++) poles.setMatrixAt(pi, hide);
      poles.instanceMatrix.needsUpdate = planks.instanceMatrix.needsUpdate = true;
    }

    // welders run in from both ends and meet in the middle; the seam glows behind them, then cools
    const wA = BEAT.weld[0] * k, wB = BEAT.weld[1] * k;
    const wu = inOut(span(t, wA, wB));
    const xl = lerp(x0, mid, wu), xr = lerp(x1, mid, wu);
    const welding = t >= wA && t < wB;
    seamL.visible = seamR.visible = t >= wA && t < BEAT.strike[1] * k;
    seamL.scale.x = Math.max(0.001, xl - x0);
    seamL.position.set((x0 + xl) / 2, seamY, seamZ);
    seamR.scale.x = Math.max(0.001, x1 - xr);
    seamR.position.set((xr + x1) / 2, seamY, seamZ);
    HOT.color.copy(HOT_ON).lerp(HOT_OFF, span(t, wB, BEAT.strike[1] * k));
    const life = 0.45 * k;
    for (let i = 0; i < NS; i++) {
      const s = sp[i];
      // each spark loops: born at the welder, flies out, falls
      const period = life;
      const local = t - wA - s.born * period;
      if (!welding || local < 0) {
        sparks.setMatrixAt(i, hide);
        continue;
      }
      const age = (local % period) / k;
      const bornAt = t - age * k;
      const ex = lerp(s.side < 0 ? x0 : x1, mid, inOut(span(bornAt, wA, wB)));
      const fade = 1 - age / 0.45;
      v.set(ex + s.vx * age, seamY + s.vy * age - 4.9 * age * age, seamZ + s.vz * age);
      sparks.setMatrixAt(i, fade > 0 ? m.compose(v, q.identity(), sc.setScalar(Math.max(0.2, fade))) : hide);
    }
    sparks.instanceMatrix.needsUpdate = true;
  };
}
