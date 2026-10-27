// Build as you go, slice 4 (web/src/buildout/CONTRACT.md): power arrives. About one second, right after construct.ts
// has put the piece together:
//   0.00  an aether arc runs down the piece's power cable (the route power.js drew into it) to the piece. No cable:
//         from `from` if the caller gave one, else a short strike from above (a tunnel, the checks, the pad)
//   0.42  the piece crackles: blue-white bolts flick over it, sparks jump off, a ring of light runs out over the deck
//   0.62  its lamps snap on, lowest first, each with a small flare
//   1.00  done. The brass ONLINE plate is DOM (web/src/ui/BuildStamp.tsx), not here.
// `first` (the first time this kind comes online) gets the big one; repeats get a quicker, smaller burst with no ring.
// Reduced motion: no travelling arc, no bolts or sparks, just the lamps coming on under one soft flash.
//
// The effects live in their own group next to the target and are gone once the run ends. The only thing it touches
// on the piece is its lamps' visibility (unlit glow meshes that don't move), and it always puts them back on.

import * as THREE from "three";

type P3 = [number, number, number];

export const BURST_SECONDS = 1;
const SECONDS = { big: BURST_SECONDS, small: 0.65, calm: 0.45 };

export interface BurstOpts {
  /** the first time this kind of piece comes online: the big burst */
  first?: boolean;
  reduced?: boolean;
  /** where the arc starts, in the target's parent frame (the power plant feeding it); none = it crackles in place */
  from?: THREE.Vector3;
}

export interface BurstRun {
  update(dt: number): boolean;
  finish(): void;
  cancel(): void;
  readonly done: Promise<void>;
  readonly progress: number;
}

// Black Iron's aether (docs/art/IRON-STYLE.md) and the hot blue-white at the heart of an arc
const AETHER = 0x7af0d8;
const HOT = 0xe4fbff;

// ---------------------------------------------------------------------------------------------------------------
// The way power comes in: power.js leaves every line's points on its part group (root frame)

/** the shaft root a piece hangs from: the group holding the part:* groups */
function rootOf(o: THREE.Object3D): THREE.Object3D | null {
  for (let p = o.parent; p; p = p.parent) if (p.children.some((c) => c.name.startsWith("part:"))) return p;
  return null;
}

const idOf = (o: THREE.Object3D) => (o.userData.id as string | undefined) ?? o.name.replace(/^(station|mine|piece):/, "");

/** the cable into this piece from the plant feeding it, or out along a plant's own line, in `frame`'s coordinates */
export function cableFor(target: THREE.Object3D, frame: THREE.Object3D): THREE.Vector3[] | null {
  const root = rootOf(target);
  const routes = (root?.children.find((c) => c.name === "part:power")?.userData.routes ?? []) as { from: string; to: string; pts: P3[] }[];
  const id = idOf(target);
  const into = routes.find((r) => r.to === id), out = routes.find((r) => r.from === id);
  const pts = into?.pts ?? (out ? out.pts.slice().reverse() : null); // a plant: the arc runs back along its line into it
  if (!root || !pts || pts.length < 2) return null;
  root.updateWorldMatrix(true, false);
  frame.updateWorldMatrix(true, false);
  return pts.map((p) => frame.worldToLocal(root.localToWorld(new THREE.Vector3(...p))));
}

/** the piece's base middle, rough radius and height, in its parent's frame (the state aura ring is left out) */
export function measure(target: THREE.Object3D) {
  const box = new THREE.Box3(), part = new THREE.Box3();
  target.updateWorldMatrix(true, true);
  const walk = (o: THREE.Object3D) => {
    if (o.name === "aura" || o.name.startsWith("burst")) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && m.geometry) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(part.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
    }
    o.children.forEach(walk);
  };
  walk(target);
  const parent = target.parent ?? target;
  if (box.isEmpty()) return { base: target.position.clone(), radius: 2, height: 3 };
  const size = box.getSize(new THREE.Vector3());
  // the parent can be turned (the shaft root is), so carry the bottom middle across and keep sizes as they are
  const base = parent.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  return { base, radius: Math.max(0.8, Math.min(3, Math.max(size.x, size.z) * 0.36)), height: Math.max(1.2, Math.min(8, size.y)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Lamps: the piece's glowing bits, unlit materials that don't move. Things the machine animates itself (K.dyn) and
// the state aura are the machine's own business.

// a lamp: small, unlit, no picture on it (signs and big glass are not lamps)
function isLamp(m: THREE.Mesh) {
  const mt = m.material as THREE.MeshBasicMaterial;
  if (mt.type !== "MeshBasicMaterial" || mt.map) return false;
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  const sc = m.getWorldScale(new THREE.Vector3());
  return m.geometry.boundingSphere!.radius * Math.max(sc.x, sc.y, sc.z) < 0.6;
}

export function lampsOf(target: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if (o.name === "aura" || o.userData.dyn) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.visible && !Array.isArray(m.material) && isLamp(m)) out.push(m);
    o.children.forEach(walk);
  };
  walk(target);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Bolts: jagged lines drawn as stretched little boxes (the shaft is boxes all the way down), one instanced mesh
// for the hot core and one for the soft aether round it

const UP = new THREE.Vector3(0, 1, 0);

class Bolts {
  readonly core: THREE.InstancedMesh;
  readonly halo: THREE.InstancedMesh;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly d = new THREE.Vector3();

  constructor(parent: THREE.Object3D, private readonly cap: number) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mk = (color: number, op: number) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = im.receiveShadow = false;
      im.count = 0;
      im.renderOrder = 3;
      parent.add(im);
      return im;
    };
    this.halo = mk(AETHER, 0.2);
    this.core = mk(HOT, 0.95);
  }

  begin() {
    this.n = 0;
  }

  /** a jagged line through these points */
  line(pts: THREE.Vector3[], w: number) {
    for (let i = 1; i < pts.length && this.n < this.cap; i++) {
      const a = pts[i - 1], b = pts[i];
      this.d.subVectors(b, a);
      const len = this.d.length();
      if (len < 1e-4) continue;
      this.q.setFromUnitVectors(UP, this.d.divideScalar(len));
      this.mid.addVectors(a, b).multiplyScalar(0.5);
      this.m.compose(this.mid, this.q, this.s.set(w, len + w * 0.6, w));
      this.core.setMatrixAt(this.n, this.m);
      this.m.compose(this.mid, this.q, this.s.set(w * 3.2, len + w * 2, w * 3.2));
      this.halo.setMatrixAt(this.n, this.m);
      this.n++;
    }
  }

  end(alpha: number) {
    this.core.count = this.halo.count = this.n;
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0.95 * alpha;
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.2 * alpha;
    this.core.instanceMatrix.needsUpdate = this.halo.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    (this.halo.material as THREE.Material).dispose();
  }
}

/** a lightning path from a to b: midpoints pushed sideways, less at the ends */
export function zigzag(a: THREE.Vector3, b: THREE.Vector3, steps: number, jitter: number, rnd = Math.random): THREE.Vector3[] {
  const pts = [a.clone()];
  const d = new THREE.Vector3().subVectors(b, a);
  const side = new THREE.Vector3(-d.z, 0, d.x);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(d, side).normalize();
  for (let i = 1; i < steps; i++) {
    const k = i / steps, env = Math.sin(Math.PI * k);
    pts.push(a.clone().addScaledVector(d, k).addScaledVector(side, (rnd() - 0.5) * 2 * jitter * env).addScaledVector(up, (rnd() - 0.5) * 2 * jitter * env));
  }
  pts.push(b.clone());
  return pts;
}

/** the point s along a polyline, and how long it is */
function along(pts: THREE.Vector3[], cum: number[], s: number, out: THREE.Vector3) {
  const L = cum[cum.length - 1];
  s = Math.max(0, Math.min(L, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const k = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  return out.copy(pts[i - 1]).lerp(pts[i], k);
}

// ---------------------------------------------------------------------------------------------------------------
// Sparks: a small pool of hot little cubes that jump off and fall

interface Spark { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number }

class Sparks {
  readonly im: THREE.InstancedMesh;
  private readonly list: Spark[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly c = new THREE.Color();

  constructor(parent: THREE.Object3D, private readonly cap: number) {
    this.im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), cap);
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.im.frustumCulled = false;
    this.im.count = 0;
    this.im.renderOrder = 3;
    parent.add(this.im);
  }

  spawn(at: THREE.Vector3, n: number, speed: number) {
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * (0.4 + Math.random()), speed * (0.6 + Math.random() * 1.2), Math.sin(a) * speed * (0.4 + Math.random()));
      const max = 0.35 + Math.random() * 0.45;
      this.list.push({ p: at.clone(), v, life: max, max, size: 0.05 + Math.random() * 0.05 });
    }
  }

  step(dt: number) {
    let j = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      f.v.y -= 9 * dt;
      f.p.addScaledVector(f.v, dt);
    }
    for (const f of this.list) {
      const k = f.life / f.max;
      this.m.compose(f.p, this.q, this.s.setScalar(f.size * (0.5 + k)));
      this.im.setMatrixAt(j, this.m);
      // white-hot, cooling to aether
      this.im.setColorAt(j, this.c.setHex(HOT).lerp(this.c.clone().setHex(AETHER), 1 - k).multiplyScalar(Math.min(1, k * 1.8)));
      j++;
    }
    this.im.count = j;
    if (j) (this.im.instanceMatrix.needsUpdate = true), (this.im.instanceColor!.needsUpdate = true);
  }

  get alive() {
    return this.list.length;
  }

  dispose() {
    this.im.geometry.dispose();
    (this.im.material as THREE.Material).dispose();
  }
}

// A soft round glow for the flash (one canvas, shared by every burst)
let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// ---------------------------------------------------------------------------------------------------------------
// One burst

const smooth = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

export function burst(target: THREE.Object3D, opts: BurstOpts = {}): BurstRun {
  const calm = !!opts.reduced;
  const big = opts.first ?? true;
  const T = calm ? SECONDS.calm : big ? SECONDS.big : SECONDS.small;
  // the beats, as fractions of the run
  const ARC_END = 0.5, CRACKLE_AT = 0.42, LAMPS_AT = calm ? 0.1 : 0.62, LAMPS_END = calm ? 0.5 : 0.9;

  const frame = target.parent ?? target;
  const fx = new THREE.Group();
  fx.name = "burst:" + idOf(target);
  fx.userData.dyn = fx.userData.noBake = true;
  frame.add(fx);

  const { base: C, radius: R, height: H } = measure(target);
  const top = C.clone().add(new THREE.Vector3(0, H * 0.8, 0));

  // the way in: the cable, or from `from`, or a short strike down from above
  let path = cableFor(target, frame);
  if (!path && opts.from) path = zigzag(opts.from.clone(), top.clone(), 10, 0.5);
  if (!path) path = [top.clone().add(new THREE.Vector3(R * 0.4, 3.4, -R * 0.4)), top.clone()];
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
  const L = cum[cum.length - 1];

  const bolts = new Bolts(fx, calm ? 1 : 200);
  const sparks = new Sparks(fx, calm ? 1 : big ? 70 : 30);

  // the head of the arc: a bright bead
  const headM = new THREE.MeshBasicMaterial({ color: HOT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), headM);
  head.visible = false;
  fx.add(head);

  // a soft flash round the piece, and (big only) a ring of light that runs out over the deck
  const flashM = new THREE.SpriteMaterial({ map: glowTexture(), color: AETHER, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
  const flash = new THREE.Sprite(flashM);
  flash.position.copy(C).add(new THREE.Vector3(0, H * 0.5, 0));
  flash.scale.set(R * 3.4, Math.max(R * 2.4, H * 1.5), 1);
  flash.renderOrder = 2;
  fx.add(flash);
  const ringM = new THREE.MeshBasicMaterial({ color: AETHER, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 4, 48), ringM);
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(C).add(new THREE.Vector3(0, 0.12, 0));
  ring.visible = big && !calm;
  fx.add(ring);

  // lamps: off now, on one by one from the bottom up, each with a flare (a few, not one per rivet)
  const wy = new Map<THREE.Mesh, number>();
  const lamps = lampsOf(target);
  lamps.forEach((m) => (wy.set(m, m.getWorldPosition(new THREE.Vector3()).y), (m.visible = false)));
  lamps.sort((a, b) => wy.get(a)! - wy.get(b)!);
  const lit = lamps.map(() => false);
  const flareM = new THREE.MeshBasicMaterial({ color: HOT, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flareGeo = new THREE.BoxGeometry(1, 1, 1);
  const flares: { m: THREE.Mesh; life: number }[] = [];
  const flareEvery = Math.max(1, Math.ceil(lamps.length / 8));

  let t = 0, over = false, struck = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const pos = new THREE.Vector3(), a = new THREE.Vector3(), j = new THREE.Vector3();

  function lightLamp(i: number) {
    if (lit[i]) return;
    lit[i] = true;
    lamps[i].visible = true;
    if (calm || i % flareEvery) return;
    const f = new THREE.Mesh(flareGeo, flareM);
    fx.worldToLocal(lamps[i].getWorldPosition(f.position));
    fx.add(f);
    flares.push({ m: f, life: 0.3 });
  }

  function crackle() {
    // bolts that jump over the piece: from its top down its sides to the deck
    for (let i = 0, n = big ? 3 : 2; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, r = R * (0.75 + Math.random() * 0.4);
      const from = top.clone().add(new THREE.Vector3((Math.random() - 0.5) * R * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * R * 0.6));
      const to = C.clone().add(new THREE.Vector3(Math.cos(ang) * r, 0.1 + Math.random() * H * 0.35, Math.sin(ang) * r));
      bolts.line(zigzag(from, to, 7, 0.35), big ? 0.04 : 0.03);
    }
  }

  function end() {
    if (over) return;
    over = true;
    t = T;
    lamps.forEach((_, i) => lightLamp(i));
    frame.remove(fx);
    bolts.dispose();
    sparks.dispose();
    [headM, flashM, ringM, flareM].forEach((m) => m.dispose());
    [head.geometry, ring.geometry, flareGeo].forEach((g) => g.dispose());
    resolve();
  }

  return {
    done,
    get progress() {
      return clamp01(t / T);
    },
    update(dt: number) {
      if (over) return true;
      t += dt;
      const k = t / T;

      // the arc down the cable: a bright head with a jagged tail that re-strikes every frame
      bolts.begin();
      if (!calm && k < ARC_END + 0.06) {
        const s = L * smooth(clamp01(k / ARC_END));
        along(path!, cum, s, pos);
        head.visible = k < ARC_END;
        head.position.copy(pos);
        head.scale.setScalar(0.8 + Math.random() * 0.5);
        const tail = Math.min(s, big ? 3.2 : 2.2), pts = [along(path!, cum, s - tail, new THREE.Vector3())];
        for (let i = 1; i <= 8; i++) {
          const q = along(path!, cum, s - tail + (tail * i) / 8, new THREE.Vector3());
          if (i < 8) q.add(j.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.3));
          pts.push(q);
        }
        bolts.line(pts, 0.05);
        if (Math.random() < dt * 30) sparks.spawn(pos, 1, 1.2);
      } else head.visible = false;

      // the crackle over the piece
      if (!calm && k >= CRACKLE_AT && k < 0.95) {
        if (!struck) (struck = true), sparks.spawn(top, big ? 26 : 10, big ? 3 : 2.2);
        crackle();
        if (Math.random() < dt * 25) sparks.spawn(a.set(C.x + (Math.random() - 0.5) * R * 2, C.y + Math.random() * H, C.z + (Math.random() - 0.5) * R * 2), 2, 1.6);
      }
      bolts.end(k > 0.85 ? clamp01((1 - k) / 0.15) : 1);
      sparks.step(dt);

      // the flash and the ring
      const fk = calm ? clamp01(k / 0.8) : clamp01((k - CRACKLE_AT) / (1 - CRACKLE_AT));
      flashM.opacity = (big && !calm ? 0.3 : 0.2) * (fk > 0 ? Math.sin(Math.PI * fk) : 0);
      if (ring.visible) {
        const rk = clamp01((k - CRACKLE_AT) / 0.5);
        ring.scale.setScalar(R * (0.7 + rk * 1.6));
        ringM.opacity = rk > 0 ? 0.5 * (1 - rk) : 0;
      }

      // the lamps, bottom up
      const lk = clamp01((k - LAMPS_AT) / (LAMPS_END - LAMPS_AT));
      for (let i = 0, due = lk > 0 ? Math.ceil(lk * lamps.length) : 0; i < due; i++) lightLamp(i);
      for (let i = flares.length - 1; i >= 0; i--) {
        const f = flares[i];
        f.life -= dt;
        f.m.scale.setScalar(0.12 + Math.max(0, f.life) * 1.2);
        if (f.life <= 0) fx.remove(f.m), flares.splice(i, 1);
      }

      if ((k >= 1 && !sparks.alive) || k >= 1.4) end(); // never hang on a stray spark
      return over;
    },
    finish: end,
    // nothing to put back but the lamps, which end() turns on: a cancelled burst leaves the piece lit as it was
    cancel: end,
  };
}
