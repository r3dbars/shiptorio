// Build-as-you-go (?buildout=1), slice 3: the construct part of a build moment. Takes any machine group (a
// station holder, a power plant, anything) and puts it up in about four seconds: iron scaffold poles rise around
// it, its real parts drop in from above bottom up, rivet sparks fly where each lands, steam puffs, and the
// scaffold sinks away. No per-machine code: the parts are whatever the group is made of, sorted by height.
// Reduced motion: a one second fade in place.
//
// The caller ticks it from its frame loop (so it runs headless with ?raf=0 too):
//   const run = construct(st.holder, { reduced });
//   each frame: run.update(dt)   // true once it's finished; the group is exactly as it was built
//   tap to hurry: run.speed = 3  // skip to the end: run.finish()
//   await run.done               // then burst.ts takes over
// Best on the live group, before the static merge (bake.ts) folds its parts into one mesh per material; on a
// baked group it still works, just in fewer, bigger pieces.

import * as THREE from "three";

export type ConstructBeat = "scaffold" | "land" | "steam" | "strike" | "done";

export interface ConstructOpts {
  /** prefers-reduced-motion: a plain fade instead */
  reduced?: boolean;
  /** how long the full build takes (default 4; reduced motion is always 1) */
  seconds?: number;
  /** playback speed (tap to hurry); can be changed while running */
  speed?: number;
  /** leave these children alone (default: the state aura ring core.js hangs on every holder) */
  skip?: (o: THREE.Object3D) => boolean;
  /** for sound: scaffold up, each part landing, steam, the last part home, done */
  onBeat?: (beat: ConstructBeat, i: number) => void;
}

export interface ConstructRun {
  /** advance by dt seconds; true once finished */
  update(dt: number): boolean;
  /** jump to the end (the group is left exactly as built) */
  finish(): void;
  /** stop and put the group back as it was, without resolving done */
  cancel(): void;
  readonly done: Promise<void>;
  /** 0..1 */
  readonly progress: number;
  speed: number;
  /** pieces it found (for tests and the dev page) */
  readonly pieces: number;
}

export const CONSTRUCT_SECONDS = 4;
export const CONSTRUCT_REDUCED_SECONDS = 1;

// Timeline, as fractions of the run: scaffold rises, parts drop (each one falls for a fixed share), scaffold sinks.
const T = { scaffoldUp: [0, 0.16], drops: [0.1, 0.82], fall: 0.13, scaffoldDown: [0.84, 1] } as const;
const BANDS = 12; // height bands the parts drop in, bottom first
const TARGET_PIECES = 70; // split the group until it's at least this many pieces (or can't split further)
const MAX_PIECES = 400;

const defaultSkip = (o: THREE.Object3D) => o.name === "aura";
const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k);
const smooth = (k: number) => k * k * (3 - 2 * k);
const easeOutBack = (k: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
// a dropped part: falls with gravity (ease-in), touches down at 1
const fallK = (k: number) => k * k;

// Black Iron scaffold palette: oiled iron poles, worn timber planks, brass clamps. Made once, shared.
let PAL: { iron: THREE.Material; wood: THREE.Material; brass: THREE.Material; hot: THREE.Material } | null = null;
function palette() {
  if (!PAL)
    PAL = {
      iron: new THREE.MeshPhongMaterial({ color: 0x7a5038, specular: 0x3a2a1e, shininess: 14 }),
      wood: new THREE.MeshPhongMaterial({ color: 0x7a5a3a, specular: 0x111111, shininess: 4 }),
      brass: new THREE.MeshPhongMaterial({ color: 0xc8963a, specular: 0x8a6a30, shininess: 40, emissive: 0x2a1a04 }),
      hot: new THREE.MeshBasicMaterial({ color: 0xffb040 }),
    };
  return PAL;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

// Reduced motion fades a machine's own materials in through a transparent twin of each. Twins are made once per
// material and kept, with the original's shader patches (firstRun.ts), so a fade never compiles a fresh program
// mid-build: on a slow GPU that's a long main-thread stall right when the player's build starts.
const TWINS = new WeakMap<THREE.Material, THREE.Material>();
export function fadeTwin(orig: THREE.Material): THREE.Material {
  let m = TWINS.get(orig);
  if (!m) {
    m = orig.clone();
    m.transparent = true;
    m.onBeforeCompile = orig.onBeforeCompile;
    m.customProgramCacheKey = orig.customProgramCacheKey;
    TWINS.set(orig, m);
  }
  return m;
}

/** One of each thing a construct draws (scaffold, rivet sparks), for the scene to compile at load (ShaftScene.warm). */
export function constructWarmups(): THREE.Object3D[] {
  const P = palette();
  const out: THREE.Object3D[] = [P.iron, P.wood, P.brass, P.hot].map((m) => {
    const mesh = new THREE.Mesh(BOX, m);
    mesh.castShadow = true;
    return mesh;
  });
  const fx = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 1);
  fx.setColorAt(0, new THREE.Color(0xffffff));
  out.push(fx);
  return out;
}

interface Piece {
  obj: THREE.Object3D;
  wrap: THREE.Group;
  box: THREE.Box3; // in the target's frame
  start: number; // fraction of the run its drop starts at
  grow: boolean; // a base slab: rises out of the deck instead of dropping
  drop: number; // fall height
  spin: number;
  landed: boolean;
  P: THREE.Matrix4; // target frame -> the piece's parent frame (the wrapper lives there)
  Pinv: THREE.Matrix4;
}

/** the group's own-frame bounding box of everything under obj */
function localBox(target: THREE.Object3D, obj: THREE.Object3D, out = new THREE.Box3()) {
  out.makeEmpty();
  const inv = new THREE.Matrix4().copy(target.matrixWorld).invert();
  const m = new THREE.Matrix4(), b = new THREE.Box3();
  obj.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g?.attributes?.position || !g.attributes.position.count) return;
    if (!g.boundingBox) g.computeBoundingBox();
    b.copy(g.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    out.union(b);
  });
  return out;
}

const meshCount = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => {
    const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if ((c as THREE.Mesh).isMesh && g?.attributes?.position?.count) n++;
  });
  return n;
};

/** Split the target into pieces: open up the biggest groups until there are enough (pure, exported for tests). */
export function findPieces(target: THREE.Object3D, skip: (o: THREE.Object3D) => boolean = defaultSkip): THREE.Object3D[] {
  const kidsOf = (p: THREE.Object3D) => p.children.filter((c) => !skip(c) && meshCount(c) > 0);
  const pieces = kidsOf(target);
  // a mesh with children draws itself too, so it stays whole (its children ride along)
  const openable = (p: THREE.Object3D) => !(p as THREE.Mesh).isMesh && kidsOf(p).length > 0 && pieces.length - 1 + kidsOf(p).length <= MAX_PIECES;
  while (pieces.length < TARGET_PIECES) {
    let best = -1, bestN = 0;
    pieces.forEach((p, i) => {
      const n = meshCount(p);
      if (n > bestN && openable(p)) (best = i), (bestN = n);
    });
    if (best < 0) break;
    pieces.splice(best, 1, ...kidsOf(pieces[best]));
  }
  return pieces;
}

// A merged lump (the mockup modules' K.bake, or bake.ts after the static merge) is one mesh holding many parts.
// Cut it back into parts for the build: triangles that share corners are one part (a box, a pipe), and the parts
// are gathered into clusters by height band and quarter so they drop in a few dozen pieces. Pure geometry; the
// clusters share the lump's material and draw exactly what it draws. Exported for tests.
export const LUMP_VERTS = 900;
export function splitLump(mesh: THREE.Mesh, toTarget: THREE.Matrix4, bands = 6): THREE.BufferGeometry[] {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = src.attributes.position;
  const nTri = Math.floor(pos.count / 3);
  if (nTri < 2) return [];
  // union-find over corner positions
  const keyId = new Map<string, number>();
  const parent: number[] = [];
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const idOf = (v: number) => {
    const k = `${Math.round(pos.getX(v) * 1000)},${Math.round(pos.getY(v) * 1000)},${Math.round(pos.getZ(v) * 1000)}`;
    let id = keyId.get(k);
    if (id === undefined) keyId.set(k, (id = parent.length)), parent.push(id);
    return id;
  };
  const triRoot = new Int32Array(nTri);
  for (let t = 0; t < nTri; t++) {
    const a = find(idOf(t * 3)), b = find(idOf(t * 3 + 1)), c = find(idOf(t * 3 + 2));
    parent[b] = a;
    parent[find(c)] = a;
  }
  for (let t = 0; t < nTri; t++) triRoot[t] = find(idOf(t * 3));
  // each part's centre in the target's frame
  const sum = new Map<number, [number, number, number, number]>();
  const v = new THREE.Vector3();
  for (let t = 0; t < nTri; t++) {
    v.fromBufferAttribute(pos, t * 3).applyMatrix4(toTarget);
    const r = sum.get(triRoot[t]) ?? [0, 0, 0, 0];
    r[0] += v.x, r[1] += v.y, r[2] += v.z, r[3]++;
    sum.set(triRoot[t], r);
  }
  let y0 = Infinity, y1 = -Infinity, cx = 0, cz = 0;
  for (const r of sum.values()) {
    const y = r[1] / r[3];
    y0 = Math.min(y0, y), y1 = Math.max(y1, y), cx += r[0] / r[3] / sum.size, cz += r[2] / r[3] / sum.size;
  }
  const cluster = new Map<number, number>();
  for (const [root, r] of sum) {
    const band = Math.min(bands - 1, Math.floor(((r[1] / r[3] - y0) / Math.max(1e-6, y1 - y0)) * bands));
    cluster.set(root, band * 4 + (r[0] / r[3] > cx ? 1 : 0) + (r[2] / r[3] > cz ? 2 : 0));
  }
  const tris = new Map<number, number[]>();
  for (let t = 0; t < nTri; t++) {
    const c = cluster.get(triRoot[t])!;
    (tris.get(c) ?? tris.set(c, []).get(c)!).push(t);
  }
  if (tris.size < 2) return [];
  const out: THREE.BufferGeometry[] = [];
  for (const list of tris.values()) {
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(src.attributes)) {
      const a = src.attributes[name] as THREE.BufferAttribute;
      const k = a.itemSize, arr = new (a.array.constructor as Float32ArrayConstructor)(list.length * 3 * k);
      list.forEach((t, j) => arr.set((a.array as Float32Array).subarray(t * 3 * k, t * 3 * k + 3 * k), j * 3 * k));
      g.setAttribute(name, new THREE.BufferAttribute(arr, k, a.normalized));
    }
    out.push(g);
  }
  if (src !== mesh.geometry) src.dispose();
  return out;
}

// put a wrapper in obj's place (same parent, same index) so the module keeps owning obj's own transform
function wrapIn(obj: THREE.Object3D) {
  const parent = obj.parent!;
  const w = new THREE.Group();
  w.name = "construct";
  w.userData.dyn = true;
  w.matrixAutoUpdate = false;
  const i = parent.children.indexOf(obj);
  parent.children[i] = w;
  w.parent = parent;
  w.children.push(obj);
  obj.parent = w;
  return w;
}
function unwrap(w: THREE.Group) {
  const obj = w.children[0], parent = w.parent;
  if (!parent || !obj) return;
  const i = parent.children.indexOf(w);
  if (i >= 0) parent.children[i] = obj;
  obj.parent = parent;
  w.children.length = 0;
  w.parent = null;
}

function buildScaffold(target: THREE.Object3D, b: THREE.Box3) {
  const P = palette();
  const g = new THREE.Group();
  g.name = "scaffold";
  g.userData.dyn = true;
  const pad = 0.35;
  const x0 = b.min.x - pad, x1 = b.max.x + pad, z0 = b.min.z - pad, z1 = b.max.z + pad;
  const y0 = Math.max(b.min.y, 0), top = Math.max(1.6, b.max.y + 0.45);
  const h = top - y0;
  const poles: THREE.Mesh[] = [];
  const corners: [number, number][] = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
  // middle poles on long sides so big machines get a proper frame
  if (x1 - x0 > 3.2) corners.push([(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1]);
  if (z1 - z0 > 3.2) corners.push([x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]);
  for (const [x, z] of corners) {
    const pole = new THREE.Mesh(BOX, P.iron);
    pole.scale.set(0.15, h, 0.15);
    pole.position.set(x, y0 + h / 2, z);
    pole.castShadow = true;
    g.add(pole);
    poles.push(pole);
    const foot = new THREE.Mesh(BOX, P.iron);
    foot.scale.set(0.34, 0.08, 0.34);
    foot.position.set(x, y0 + 0.04, z);
    g.add(foot);
    // a brass clamp near the top
    const clamp = new THREE.Mesh(BOX, P.brass);
    clamp.scale.set(0.2, 0.14, 0.2);
    clamp.position.set(x, top - 0.25, z);
    g.add(clamp);
  }
  // ledgers (horizontal bars) every ~1.6 up all four sides, brass couplers where they meet the poles, and a
  // zig-zag of braces on the two faces the camera sees (+x and +z)
  const nL = Math.max(2, Math.round(h / 1.6));
  const levels = Array.from({ length: nL }, (_, i) => y0 + (h * (i + 1)) / nL - (i === nL - 1 ? 0.1 : 0));
  const sides = [[x0, z1, x1, z1], [x1, z0, x1, z1], [x0, z0, x1, z0], [x0, z0, x0, z1]] as const;
  // the two camera faces only get the top ring, so the machine stays in view while it goes up
  for (const y of levels)
    for (const [ax, az, bx, bz] of y === levels[nL - 1] ? sides : sides.slice(2)) {
      const L = new THREE.Mesh(BOX, P.iron);
      const len = Math.hypot(bx - ax, bz - az);
      L.scale.set(ax === bx ? 0.09 : len, 0.09, ax === bx ? len : 0.09);
      L.position.set((ax + bx) / 2, y, (az + bz) / 2);
      g.add(L);
      for (const [cx, cz] of [[ax, az], [bx, bz]]) {
        const cp = new THREE.Mesh(BOX, P.brass);
        cp.scale.set(0.2, 0.13, 0.2);
        cp.position.set(cx, y, cz);
        g.add(cp);
      }
    }
  for (const [ax, az, bx, bz] of sides.slice(1, 2)) {
    const len = Math.hypot(bx - ax, bz - az);
    let ya = y0;
    levels.forEach((yb, i) => {
      const dy = yb - ya, d = Math.hypot(len, dy), ang = Math.atan2(len, dy) * (i % 2 ? -1 : 1);
      const br = new THREE.Mesh(BOX, P.iron);
      br.scale.set(0.06, d, 0.06);
      br.position.set((ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2);
      if (ax === bx) br.rotation.x = ang;
      else br.rotation.z = -ang;
      g.add(br);
      ya = yb;
    });
  }
  // a plank deck along the back edge at the top (where the crane hook hangs from)
  const planks: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const pl = new THREE.Mesh(BOX, P.wood);
    pl.scale.set(x1 - x0 + 0.3, 0.06, 0.26);
    pl.position.set((x0 + x1) / 2, top + 0.02, z0 + 0.18 + i * 0.3);
    pl.castShadow = true;
    g.add(pl);
    planks.push(pl);
  }
  // the hoist: a beam out over the middle with a hook on a chain; it follows the part being lowered
  const beam = new THREE.Mesh(BOX, P.iron);
  beam.scale.set(0.14, 0.14, z1 - z0 + 0.6);
  beam.position.set((x0 + x1) / 2, top + 0.14, (z0 + z1) / 2);
  g.add(beam);
  const hook = new THREE.Group();
  const chain = new THREE.Mesh(BOX, P.iron);
  chain.scale.set(0.04, 1, 0.04);
  chain.position.y = -0.5;
  hook.add(chain);
  const claw = new THREE.Mesh(BOX, P.brass);
  claw.scale.set(0.2, 0.12, 0.2);
  claw.position.y = -1;
  hook.add(claw);
  hook.position.set((x0 + x1) / 2, top + 0.1, (z0 + z1) / 2);
  g.add(hook);
  g.traverse((o) => {
    o.userData.noBake = true;
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true;
  });
  target.add(g);
  return { g, y0, top, h, hook, chain, claw, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

// Sparks and steam: little cubes in one additive instanced mesh (one draw call while a build runs, gone after).
// Each fades by darkening to black, which on an additive layer reads as fading out.
const FX_MAX = 220;
class Sparks {
  im: THREE.InstancedMesh;
  fx: { x: number; y: number; z: number; vx: number; vy: number; vz: number; c: THREE.Color; life: number; max: number; size: number; grav: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  constructor(parent: THREE.Object3D) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.im = new THREE.InstancedMesh(BOX, mat, FX_MAX);
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FX_MAX * 3), 3);
    this.im.count = 0;
    this.im.frustumCulled = false;
    this.im.name = "construct-fx";
    this.im.userData.dyn = this.im.userData.noBake = true;
    parent.add(this.im);
  }
  spawn(_p: THREE.Object3D, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, size: number, grav: number) {
    if (this.fx.length >= FX_MAX) return;
    this.fx.push({ x, y, z, vx, vy, vz, c: new THREE.Color(color), life, max: life, size, grav });
  }
  update(dt: number) {
    const { fx } = this;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        fx.splice(i, 1);
        continue;
      }
      f.vy -= f.grav * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      // sparks skitter on the deck instead of falling through it
      if (f.y < 0.02 && f.grav > 0) (f.y = 0.02), (f.vy *= -0.3), (f.vx *= 0.6), (f.vz *= 0.6);
    }
    fx.forEach((f, j) => {
      const k = f.life / f.max;
      // steam (rises, grav < 0) swells as it fades; sparks just fade
      const sc = f.grav < 0 ? f.size * (1 + (1 - k) * 1.6) : f.size;
      this.e.set(f.x * 7, f.y * 5, f.z * 3);
      this.m.compose(this.p.set(f.x, f.y, f.z), this.q.setFromEuler(this.e), this.s.set(sc, sc, sc));
      this.im.setMatrixAt(j, this.m);
      this.im.setColorAt(j, this.c.copy(f.c).multiplyScalar(Math.min(1, k * 1.6)));
    });
    this.im.count = fx.length;
    this.im.instanceMatrix.needsUpdate = true;
    this.im.instanceColor!.needsUpdate = true;
  }
  dispose() {
    this.im.removeFromParent();
    (this.im.material as THREE.Material).dispose();
    this.im.dispose();
  }
}

export function construct(target: THREE.Object3D, opts: ConstructOpts = {}): ConstructRun {
  const skip = opts.skip ?? defaultSkip;
  const reduced = !!opts.reduced;
  const seconds = reduced ? CONSTRUCT_REDUCED_SECONDS : Math.max(0.5, opts.seconds ?? CONSTRUCT_SECONDS);
  const beat = opts.onBeat ?? (() => {});
  target.visible = true;
  target.updateMatrixWorld(true);

  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  let t = 0, finished = false, landedN = 0, steamT = 0;
  const run: ConstructRun = {
    update,
    finish,
    cancel,
    done,
    speed: opts.speed ?? 1,
    get progress() {
      return finished ? 1 : clamp01(t / seconds);
    },
    get pieces() {
      return pieces.length;
    },
  };

  // merged lumps are cut back into parts for the build (put back at the end)
  const lumps: { mesh: THREE.Mesh; subs: THREE.Mesh[]; vis: boolean }[] = [];
  const objs = findPieces(target, skip).flatMap((o) => {
    const m = o as THREE.Mesh;
    if (reduced || !m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.children.length || !m.visible) return [o];
    if ((m.geometry?.attributes?.position?.count ?? 0) < LUMP_VERTS) return [o];
    const toTarget = new THREE.Matrix4().copy(target.matrixWorld).invert().multiply(m.matrixWorld);
    const geos = splitLump(m, toTarget);
    if (!geos.length) return [o];
    const subs = geos.map((g) => {
      const sm = new THREE.Mesh(g, m.material);
      sm.name = "construct-part";
      sm.position.copy(m.position);
      sm.quaternion.copy(m.quaternion);
      sm.scale.copy(m.scale);
      sm.castShadow = m.castShadow;
      sm.receiveShadow = m.receiveShadow;
      m.parent!.add(sm);
      sm.updateMatrixWorld();
      return sm;
    });
    lumps.push({ mesh: m, subs, vis: m.visible });
    m.visible = false;
    return subs;
  });
  const all = new THREE.Box3();
  const pieces: Piece[] = objs.map((obj) => {
    const box = localBox(target, obj);
    all.union(box);
    const Pinv = new THREE.Matrix4().copy(obj.parent!.matrixWorld).invert().multiply(target.matrixWorld).invert();
    const P = Pinv.clone().invert();
    return { obj, wrap: wrapIn(obj), box, start: 0, grow: false, drop: 0, spin: 0, landed: false, P, Pinv };
  });
  if (!pieces.length || all.isEmpty()) all.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
  const size = all.getSize(new THREE.Vector3());
  const K = reduced ? null : new Sparks(target);
  const footprint = Math.max(0.01, size.x * size.z);

  // ---------- reduced motion: fade the real materials in (cloned for the second, then put back) ----------
  const fades: { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[] }[] = [];
  const clones = new Map<THREE.Material, { m: THREE.Material; op: number }>();
  if (reduced) {
    for (const p of pieces)
      p.obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const orig = mesh.material;
        let c = clones.get(orig);
        if (!c) {
          c = { m: fadeTwin(orig), op: orig.opacity };
          clones.set(orig, c);
        }
        fades.push({ mesh, orig });
        mesh.material = c.m;
      });
    setFade(0);
    beat("scaffold", 0);
  }

  // ---------- full build: schedule each piece bottom up ----------
  let sc: ReturnType<typeof buildScaffold> | null = null;
  if (!reduced) {
    sc = buildScaffold(target, all);
    const order = pieces
      .map((p, i) => ({ p, i, y: (p.box.min.y + p.box.max.y) / 2, r: Math.hypot((p.box.min.x + p.box.max.x) / 2, (p.box.min.z + p.box.max.z) / 2) }))
      .sort((a, b) => a.y - b.y || a.r - b.r || a.i - b.i);
    const y0 = all.min.y, span = Math.max(0.01, size.y);
    const [d0, d1] = T.drops;
    const last = d1 - T.fall;
    // a base slab (wide and low) rises out of the deck first
    order.forEach(({ p }, k) => {
      const ps = p.box.getSize(new THREE.Vector3());
      // bands by the part's middle height: the plinth, then the body, then what sits on top
      const band = Math.min(BANDS - 1, Math.floor((((p.box.min.y + p.box.max.y) / 2 - y0) / span) * BANDS));
      p.grow = (p.box.min.y + p.box.max.y) / 2 - y0 < span * 0.16 && ps.y < span * 0.25 && ps.x * ps.z > footprint * 0.25;
      // spread by band, with a little order jitter inside the band so a band isn't one thud
      const inBand = (k / Math.max(1, order.length - 1)) * 0.06;
      p.start = p.grow ? d0 : d0 + 0.04 + (band / BANDS) * (last - d0 - 0.06) + inBand;
      p.start = Math.min(last, p.start);
      p.drop = 1.6 + (sc!.top - p.box.min.y) * 0.35 + ((k * 0.37) % 0.5);
      p.spin = (((k * 0.61) % 1) - 0.5) * 0.5;
      p.wrap.visible = false;
    });
    setScaffold(0);
  }

  function setFade(k: number) {
    for (const [, c] of clones) c.m.opacity = c.op * k;
  }

  function setScaffold(f: number) {
    if (!sc) return;
    const up = smooth(clamp01((f - T.scaffoldUp[0]) / (T.scaffoldUp[1] - T.scaffoldUp[0])));
    const down = smooth(clamp01((f - T.scaffoldDown[0]) / (T.scaffoldDown[1] - T.scaffoldDown[0])));
    const k = up * (1 - down);
    // the frame grows up out of the deck, then sinks back into it
    sc.g.scale.set(1, Math.max(0.001, k), 1);
    sc.g.position.y = sc.y0 * (1 - k);
    sc.g.visible = k > 0.002;
  }

  // a piece's pose in the target's frame: dropped by dy, turned by spin, scaled (sx, sy, sx) about its base
  // centre; written into its wrapper in the wrapper's own (parent) frame
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
  function pose(p: Piece, dy: number, spin: number, sx: number, sy: number) {
    const cx = (p.box.min.x + p.box.max.x) / 2, cz = (p.box.min.z + p.box.max.z) / 2, by = p.box.min.y;
    mA.makeTranslation(-cx, -by, -cz);
    mA.premultiply(mB.makeScale(sx, sy, sx));
    mA.premultiply(mB.makeRotationY(spin));
    mA.premultiply(mB.makeTranslation(cx, by + dy, cz));
    p.wrap.matrix.copy(p.P).multiply(mA).multiply(p.Pinv);
    p.wrap.matrixWorldNeedsUpdate = true;
  }

  // where the hoist hook sits: over the piece being lowered right now
  const hookAt = new THREE.Vector3();
  function stepPieces(f: number, dt: number) {
    let lowering: Piece | null = null;
    for (const p of pieces) {
      const k = clamp01((f - p.start) / T.fall);
      if (k <= 0) {
        p.wrap.visible = false;
        continue;
      }
      p.wrap.visible = true;
      const cx = (p.box.min.x + p.box.max.x) / 2, cz = (p.box.min.z + p.box.max.z) / 2, by = p.box.min.y;
      if (p.grow) {
        // a base slab rises out of the deck with a little overshoot
        pose(p, 0, 0, 1, Math.max(0.001, easeOutBack(smooth(k))));
      } else if (k < 1) {
        const fk = fallK(k), dy = p.drop * (1 - fk);
        // squash on touchdown
        const sq = k > 0.85 ? Math.sin(((k - 0.85) / 0.15) * Math.PI) * 0.07 : 0;
        pose(p, dy, p.spin * (1 - fk), 1 + sq * 0.6, 1 - sq);
        if (!lowering || p.start > lowering.start) {
          lowering = p;
          hookAt.set(cx, by + dy + (p.box.max.y - p.box.min.y), cz);
        }
      } else pose(p, 0, 0, 1, 1);
      if (k >= 1 && !p.landed) {
        p.landed = true;
        land(p, cx, by, cz);
      }
    }
    if (sc) {
      // the hook drifts over the part being lowered, chain paying out to it, then reels in
      const hk = sc.hook;
      let len = 0.3;
      if (lowering) {
        hk.position.x += (hookAt.x - hk.position.x) * Math.min(1, dt * 10);
        hk.position.z += (hookAt.z - hk.position.z) * Math.min(1, dt * 10);
        len = Math.max(0.15, sc.top + 0.1 - Math.min(sc.top - 0.2, hookAt.y + 0.1));
      }
      len = sc.chain.scale.y + (len - sc.chain.scale.y) * Math.min(1, dt * (lowering ? 14 : 4));
      sc.chain.scale.y = len;
      sc.chain.position.y = -len / 2;
      sc.claw.position.y = -len;
    }
  }

  // rivet sparks where the part lands and a ratchet beat; every few landings, a steam puff
  function land(p: Piece, cx: number, by: number, cz: number) {
    landedN++;
    beat("land", landedN);
    if (!K) return;
    const ps = p.box.getSize(new THREE.Vector3());
    const n = p.grow ? 10 : Math.min(6, 2 + Math.round(ps.x + ps.z));
    for (let i = 0; i < n; i++) {
      // sparks fly from the part's base edge
      const a = Math.random() * Math.PI * 2, rx = (ps.x / 2) * Math.cos(a), rz = (ps.z / 2) * Math.sin(a);
      K.spawn(target, cx + rx, by + 0.05, cz + rz, Math.cos(a) * (1 + Math.random() * 2), 1.5 + Math.random() * 2.5, Math.sin(a) * (1 + Math.random() * 2), Math.random() < 0.3 ? 0xfff2c0 : 0xffa030, 0.35 + Math.random() * 0.35, 0.05, 9);
    }
    if (landedN % 4 === 1 || p.grow) puff(cx, by + ps.y * 0.6, cz, p.grow ? 5 : 2);
  }
  function puff(x: number, y: number, z: number, n: number) {
    beat("steam", landedN);
    if (!K) return;
    for (let i = 0; i < n; i++)
      K.spawn(target, x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 0x5a5650, 1.1 + Math.random() * 0.6, 0.22, -0.4);
  }

  let struck = false, scaffoldBeat = false;
  function update(dt: number) {
    if (finished) return true;
    t += Math.max(0, dt) * Math.max(0.1, run.speed);
    const f = clamp01(t / seconds);
    if (reduced) setFade(smooth(f));
    else {
      if (!scaffoldBeat) (scaffoldBeat = true), beat("scaffold", 0);
      setScaffold(f);
      stepPieces(f, dt);
      // steam leaks from the frame while it works
      steamT -= dt;
      if (sc && K && f > T.scaffoldUp[1] && f < T.drops[1] && steamT <= 0) {
        steamT = 0.45;
        const side = Math.random() < 0.5;
        K.spawn(target, side ? all.max.x + 0.2 : all.min.x + (Math.random() * size.x), sc.y0 + 0.3 + Math.random() * size.y * 0.5, side ? all.min.z + Math.random() * size.z : all.max.z + 0.2, 0, 0.5, 0, 0x4a4640, 1.2, 0.18, -0.3);
      }
      if (!struck && pieces.every((p) => p.landed)) {
        struck = true;
        beat("strike", landedN);
        puff(sc!.cx, sc!.y0 + size.y * 0.5, sc!.cz, 6);
      }
    }
    K?.update(dt);
    if (f >= 1) finish();
    return finished;
  }

  function restore() {
    for (const p of pieces) {
      p.wrap.visible = true;
      unwrap(p.wrap);
    }
    for (const { mesh, orig } of fades) mesh.material = orig;
    for (const L of lumps) {
      for (const sm of L.subs) sm.removeFromParent(), sm.geometry.dispose();
      L.mesh.visible = L.vis;
    }
    lumps.length = 0;
    clones.clear(); // the twins stay (fadeTwin): disposing one would drop its compiled program
    if (sc) {
      sc.g.removeFromParent();
      sc = null;
    }
    K?.dispose();
  }

  function finish() {
    if (finished) return;
    if (!reduced) for (const p of pieces) if (!p.landed) (p.landed = true), landedN++;
    restore();
    finished = true;
    beat("done", landedN);
    resolve();
  }

  function cancel() {
    if (finished) return;
    restore();
    finished = true;
  }

  return run;
}
