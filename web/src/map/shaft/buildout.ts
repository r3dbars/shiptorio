// Build as you go, slice 2 (web/src/buildout/CONTRACT.md): the shaft is built whole, once, and everything the
// player hasn't built yet is gone. Not dimmed, not a silhouette: gone. Only the next site shows, as a chalk outline
// and four stakes on the deck under a pool of light. Each build then plays its moment (about 7 s): the chalk glows,
// the pieces rise (construct.ts), power bursts in (burst.ts), the floor lights, and `shiptorio:build` fires at
// start, burst and done for the card, the sound and the tests.
//
// How "gone" works without rebuilding anything:
// - machines (and power plants) stand on their own holder: an unbuilt one is kept out of the bake and hidden, and
//   comes back live for construct.ts to animate, then is baked on its own.
// - belts, tubes, lifts, chutes and power lines are merged into big meshes by their modules, so they can't be
//   hidden one by one. Instead every triangle of those parts is tagged once with the piece it belongs to (the
//   nearest path or power line) and how far along it sits; the shader (firstRun.ts) drops a triangle whose piece
//   hasn't risen that far yet. A belt grows along its own direction as it's built.
// - the world (decks, walls, the cliff) is never touched: it's the dark foundry everything gets built in.

import * as THREE from "three";

import type { FactoryState } from "@shiptorio/shared";

import { STEP_IDS, STEPS, cameraFor, emitBuild, resolve, stepById, stepFrom, type StepId } from "../../buildout/journey";
import { burst, type BurstRun } from "./burst";
import { construct, type ConstructRun } from "./construct";
import type { Iron } from "./core";
import type { Layout, PathDef, Plan, StationDef } from "./layout";
import { LEDGE_Z, MINES, MINE_FACE_Z } from "./layout";
import type { ShaftPlan } from "./plan";

/** the step a piece rises in; null: not part of the first run (it stands once the journey is done) */
export type Owner = StepId | null;
const ORDER = (o: Owner) => (o === null ? STEP_IDS.length : STEP_IDS.indexOf(o));
const later = (a: Owner, b: Owner): Owner => (ORDER(a) >= ORDER(b) ? a : b);

// ---------- the plan: the whole first-run shaft, so nothing is rebuilt as it fills in ----------

// The ids a fresh factory's machines get (the demo shop's, sim/engine.ts). A placeholder only stands until the real
// machine shows up; if the server names it differently the shaft rebuilds once, just before that piece is built.
const SKELETON = { planner: "splitter-1", assembler: "assembler-1", ci: "ci-1", steam: "steam-spark", dynamo: "solar-claude_code" };

/** The player's plan plus every piece the first run builds, so the shaft stands complete from the start (hidden). */
export function fullPlan(sp: ShaftPlan): ShaftPlan {
  const p = sp.plan;
  const labels = { ...sp.labels };
  const planner = p.planner && p.planner.id !== "planner" ? p.planner : { id: SKELETON.planner };
  labels[planner.id] ??= "PLANNER";
  const assemblers = p.assemblers?.length ? p.assemblers : [{ id: SKELETON.assembler, harness: "claude_code" }];
  for (const a of assemblers) labels[a.id] ??= "ASSEMBLER";
  const checks = p.checks?.length ? p.checks : [{ id: SKELETON.ci, kind: "ci" }];
  for (const c of checks) labels[c.id] ??= c.kind === "ci" ? "CI INSPECTOR" : c.kind.toUpperCase();
  const sources = p.sources?.includes("github") ? p.sources : ["github", ...(p.sources ?? [])];
  const first = assemblers[0].id;
  // a plant read off the state before its builder stands feeds nothing yet: it's the first builder's
  // feeds named before their machine stands (plan.ts says "planner" until the splitter exists) point at the
  // placeholder, so the key stays put and the shaft isn't rebuilt mid-build when the real plant arrives
  const fed = (ids: string[] | undefined) => ids?.map((id) => (id === "planner" ? planner.id : id));
  const power = (p.power ?? []).map((x) => (x.type === "dynamo" && !x.feeds?.length ? { ...x, feeds: [first] } : { ...x, feeds: fed(x.feeds) }));
  if (!power.some((x) => x.type === "steam")) power.unshift({ id: SKELETON.steam, type: "steam", feeds: [planner.id] });
  if (!power.some((x) => x.type !== "steam" && x.feeds?.includes(first))) power.push({ id: SKELETON.dynamo, type: "dynamo", feeds: [first], harness: "claude_code" });
  for (const x of power) labels[x.id] ??= x.type === "dynamo" ? "DYNAMO" : x.type.toUpperCase();
  const plan: Plan = { ...p, planner, assemblers, checks, sources, power };
  const key = "buildout:" + JSON.stringify([planner.id, assemblers, checks, p.gate?.id, p.pad?.id, p.orbit?.id, p.measure?.id, sources, power.map((x) => [x.id, x.type, x.feeds])]);
  return { ...sp, plan, key, labels };
}

// ---------- who builds what ----------

export interface Owners {
  stations: Map<string, Owner>;
  paths: Map<string, Owner>;
  mines: Map<string, Owner>;
}

// What a step brings along beyond the pieces journey.ts names: the belts and chutes between them, so the first
// issue never rides a belt that isn't there.
function extras(step: StepId, L: Layout): { stations: string[]; paths: string[] } {
  const names = L.paths.map((p) => p.name);
  const plants = (feeds: string) => L.stations.filter((s) => s.power && ((s.def as { feeds?: string[] }).feeds ?? []).includes(feeds));
  if (step === "boiler") return { stations: L.assemblers[0] ? plants(L.assemblers[0].id).map((s) => s.id) : [], paths: [] };
  if (step === "planner") return { stations: plants(L.planner.id).map((s) => s.id), paths: names.filter((n) => n === "feed-0") };
  if (step === "checks")
    return { stations: L.checks.map((s) => s.id), paths: names.filter((n) => n === "ci-feed" || /^(lane|drop)-/.test(n) || n === "rework" || n === "rw-drop" || n === "rw-in") };
  if (step === "launch") return { stations: [], paths: names.filter((n) => n === "to-lift" || /^(to-gate|to-pad|gate-)/.test(n)) };
  return { stations: [], paths: [] };
}

/** Which step raises each station, path and mine of this layout (anything left over: null). */
export function ownersFor(L: Layout): Owners {
  const o: Owners = { stations: new Map(), paths: new Map(), mines: new Map() };
  for (const step of STEPS) {
    const r = resolve(step.reveals, L);
    const x = extras(step.id, L);
    for (const id of [...r.stations, ...x.stations]) if (!o.stations.has(id)) o.stations.set(id, step.id);
    for (const n of [...r.paths, ...x.paths]) if (!o.paths.has(n)) o.paths.set(n, step.id);
    for (const m of r.mines) if (!o.mines.has(m)) o.mines.set(m, step.id);
  }
  for (const s of L.stations) if (!o.stations.has(s.id)) o.stations.set(s.id, null);
  for (const p of L.paths) if (!o.paths.has(p.name)) o.paths.set(p.name, null);
  for (const m of L.sources) if (!o.mines.has(m)) o.mines.set(m, null);
  return o;
}

// ---------- pieces: paths and power lines, tagged into the merged meshes ----------

interface Piece {
  id: number; // 1..63, its slot in the rise uniform
  name: string;
  owner: Owner;
  pts: THREE.Vector3[];
  cum: number[]; // length along it at each point
  r: number; // how far round it a triangle still counts as part of it
  min: THREE.Vector3;
  max: THREE.Vector3;
  clip?: (p: THREE.Vector3) => boolean; // false: never this piece (the rock behind a chute)
}

const MAX_PIECES = 63;
// the reach of each kind of path: the frame, legs and housings its module builds round it
const REACH: Record<string, number> = { belt: 1.15, rail: 1.3, chute: 0.95, tube: 0.9, lift: 1.9 };
// in front of the cliff face and above the quarry floor: the rock and the floor are the world's
const inFront = (p: THREE.Vector3) => p.z > MINE_FACE_Z + 0.06 && p.y > -15.92;

function piece(id: number, name: string, owner: Owner, pts: THREE.Vector3[], r: number, clip?: Piece["clip"]): Piece {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of pts) min.min(p), max.max(p);
  min.subScalar(r);
  max.addScalar(r);
  return { id, name, owner, pts, cum, r, min, max, clip };
}

const seg = new THREE.Vector3(), rel = new THREE.Vector3();
/** distance from p to the piece and how far along it (0-1) that nearest point is */
function nearest(pc: Piece, p: THREE.Vector3): [number, number] {
  let best = Infinity, along = 0;
  const L = pc.cum[pc.cum.length - 1] || 1;
  if (pc.pts.length === 1) return [p.distanceTo(pc.pts[0]), 0];
  for (let i = 1; i < pc.pts.length; i++) {
    const a = pc.pts[i - 1];
    seg.subVectors(pc.pts[i], a);
    const l2 = seg.lengthSq();
    rel.subVectors(p, a);
    const k = l2 > 0 ? Math.min(1, Math.max(0, rel.dot(seg) / l2)) : 0;
    const d = rel.addScaledVector(seg, -k).length();
    if (d < best) (best = d), (along = (pc.cum[i - 1] + k * Math.sqrt(l2)) / L);
  }
  return [best, along];
}

/** The tag a point gets: 0 for nothing (always drawn), else 2 + piece id + how far along (see firstRun.ts). */
export function tagAt(pieces: Piece[], p: THREE.Vector3): number {
  let best: Piece | null = null, bd = Infinity, ba = 0;
  for (const pc of pieces) {
    if (p.x < pc.min.x || p.y < pc.min.y || p.z < pc.min.z || p.x > pc.max.x || p.y > pc.max.y || p.z > pc.max.z) continue;
    if (pc.clip && !pc.clip(p)) continue;
    const [d, a] = nearest(pc, p);
    if (d <= pc.r && d < bd) (best = pc), (bd = d), (ba = a);
  }
  return best ? 2 + best.id + Math.min(0.995, ba) : 0;
}

// ---------- one build moment ----------

type Phase = "chalk" | "construct" | "burst" | "payoff";
const CHALK_S = 0.5, CONSTRUCT_S = 4, BURST_S = 1, PAYOFF_S = 1.5;

interface Moment {
  step: StepId;
  phase: Phase;
  t: number; // seconds into this phase
  holders: THREE.Object3D[];
  pieces: Piece[];
  runs: ConstructRun[];
  burst: BurstRun | null;
  anchor: THREE.Object3D | null; // what bursts when the step raised no machine (the tunnel)
  hurry: boolean;
}

export interface BuildoutHooks {
  /** the camera parks here (director.ts) */
  park: (target: string[]) => void;
  /** a floor's first piece finished: it lights up */
  light: (floors: number) => void;
  /** a machine finished rising: bake it like the rest */
  bake: (holder: THREE.Object3D) => void;
  /** something changed that the shadow map should see */
  poke: () => void;
}

const FLOOR_OF: Record<string, number> = { mine: 1, build: 2, checks: 3, launch: 4 };

export class Buildout {
  /** the steps whose pieces stand (kept across rebuilds) */
  readonly shown = new Set<StepId>();
  /** every step built and shown: the leftovers (second builder, other mines, orbit watch...) stand too */
  complete = false;
  /** the steps built in the factory but not shown yet, played in order */
  private queue: StepId[] = [];
  private moment: Moment | null = null;
  private synced = false;
  private next: StepId | null = null; // the step the player is on (its site wears the chalk)
  private parked = "";

  // per shaft
  private I: Iron | null = null;
  private root: THREE.Object3D | null = null;
  private L: Layout | null = null;
  private owners: Owners | null = null;
  private pieces: Piece[] = [];
  private shadows: { m: THREE.Mesh; ids: Set<number>; cast: boolean }[] = [];
  private lights: { l: THREE.Light; station: string }[] = [];
  private readonly hiddenStations = new Set<string>();
  private chalk: THREE.Group | null = null;
  private chalkMat = new THREE.MeshBasicMaterial({ color: 0xf4ead8, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  private stakeMat = new THREE.MeshBasicMaterial({ color: 0x5a3f26, fog: false });

  /** rise per piece slot, 0 (gone) to 1 (all there), four to a vec4: firstRun.ts uploads it */
  readonly rise = Array.from({ length: 16 }, () => new THREE.Vector4(1, 1, 1, 1));

  constructor(
    private readonly hooks: BuildoutHooks,
    private readonly reduced: boolean,
  ) {}

  /** the step the player is on, or null once every build is done */
  get step(): StepId | null {
    return this.next;
  }

  /** a build is playing */
  get busy(): boolean {
    return !!this.moment;
  }

  /** how many floors are lit, bottom up, by what's been built */
  get litFloors(): number {
    let n = 0;
    for (const id of this.shown) {
      const f = stepById(id).lights;
      if (f) n = Math.max(n, FLOOR_OF[f]);
    }
    return this.complete ? 4 : n;
  }

  private standing(o: Owner): boolean {
    return o === null ? this.complete : this.shown.has(o);
  }

  // ---------- per shaft ----------

  /** A new shaft was built (I.build done, not baked yet): keep what isn't built out of the bake and out of sight. */
  attach(I: Iron, root: THREE.Object3D, L: Layout) {
    this.I = I;
    this.root = root;
    this.L = L;
    this.owners = ownersFor(L);
    this.hiddenStations.clear();
    this.lights = [];
    this.shadows = [];
    for (const st of I.stationList) {
      if (this.standing(this.owners.stations.get(st.id) ?? null)) continue;
      this.hiddenStations.add(st.id);
      // an unbuilt machine doesn't run (no smoke, no sparks out of thin air)
      const inst = (st as unknown as { inst: { update: (t: number, dt: number) => void } }).inst;
      const run = inst.update;
      inst.update = (t, dt) => void (this.hiddenStations.has(st.id) || run.call(inst, t, dt));
      // children hidden through the bake (it leaves hidden things alone), then the holder itself
      for (const c of st.holder.children) (c.userData.boWas = c.visible), (c.visible = false);
    }
    // a lamp inside a hidden machine still counts as a light, dark, so revealing it never recompiles every shader
    const lamps: { l: THREE.Light; station: string }[] = [];
    for (const id of this.hiddenStations)
      I.stations[id].holder.traverse((o) => {
        if ((o as THREE.Light).isLight) lamps.push({ l: o as THREE.Light, station: id });
      });
    for (const { l, station } of lamps) {
      root.attach(l);
      let v = l.intensity;
      Object.defineProperty(l, "intensity", { get: () => (this.hiddenStations.has(station) ? 0 : v), set: (x: number) => void (v = x), configurable: true });
      this.lights.push({ l, station });
    }
    // a build cut short by the rebuild starts over on the new shaft
    if (this.moment) {
      for (const r of this.moment.runs) r.cancel();
      this.moment.burst?.cancel();
      this.moment.anchor?.removeFromParent();
      this.moment = { ...this.moment, phase: "chalk", t: 0, holders: [], pieces: [], runs: [], burst: null, anchor: null };
    }
  }

  /** Run one draw with every hidden machine showing and unculled, so their shaders compile and link now, at load,
   *  and revealing one mid-build never stalls the frame (and the player's hold) on a compile. */
  precompile(draw: (holders: THREE.Object3D[]) => void) {
    const holders = [...this.hiddenStations].map((id) => this.I!.stations[id].holder);
    const culled: THREE.Object3D[] = [];
    for (const h of holders) {
      h.visible = true;
      h.traverse((o) => {
        if (o.frustumCulled) (o.frustumCulled = false), culled.push(o);
      });
    }
    try {
      draw(holders);
    } finally {
      for (const o of culled) o.frustumCulled = true;
      for (const h of holders) h.visible = false;
    }
  }

  /** After the bake: hide the machines for real, and tag the merged belts, chutes, lifts and power lines. */
  afterBake() {
    const I = this.I!, root = this.root!, L = this.L!, owners = this.owners!;
    for (const id of this.hiddenStations) {
      const h = I.stations[id].holder;
      for (const c of h.children) if (c.userData.boWas !== undefined) (c.visible = c.userData.boWas), delete c.userData.boWas;
      h.visible = false;
    }
    // the pieces: every path, then every power line (from its plant to the machine it feeds)
    this.pieces = [];
    const add = (name: string, owner: Owner, pts: THREE.Vector3[], r: number, clip?: Piece["clip"]) => {
      if (pts.length < 1 || this.pieces.length >= MAX_PIECES) return;
      this.pieces.push(piece(this.pieces.length + 1, name, owner, pts, r, clip));
    };
    for (const p of L.paths as PathDef[]) {
      const mine = p.name.startsWith("cart-") || p.name.startsWith("chute-") || p.name === "collector" || p.name === "lift";
      add(p.name, owners.paths.get(p.name) ?? null, p.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), REACH[p.kind] ?? 1, mine ? inFront : undefined);
    }
    const power = root.getObjectByName("part:power");
    const routes = (power?.userData.routes ?? []) as { from: string; to: string; pts: number[][] }[];
    for (const r of routes) {
      const owner = later(owners.stations.get(r.from) ?? null, owners.stations.get(r.to) ?? null);
      add(`power:${r.from}>${r.to}`, owner, r.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), 0.75);
    }
    this.tag(routes);
    this.writeRise();
    this.drawChalk();
  }

  // Every triangle of the mine, belts and power parts gets the piece it belongs to. Static meshes per triangle
  // (the bake left them non-indexed), instanced ones per instance; things that move keep 0 and always draw.
  private tag(routes: { from: string; to: string; pts: number[][] }[]) {
    const root = this.root!;
    const pieces = this.pieces;
    if (!pieces.length) return;
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const m = new THREE.Matrix4(), im = new THREE.Matrix4();
    const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const users = new Map<THREE.BufferGeometry, number>();
    root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g) users.set(g, (users.get(g) ?? 0) + 1);
    });
    for (const part of root.children) {
      if (!part.name.startsWith("part:") || part.name === "part:world") continue;
      part.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        let g = mesh.geometry;
        const pos = g?.attributes.position;
        if (!pos || !pos.count) return;
        m.multiplyMatrices(inv, mesh.matrixWorld);
        const ids = new Set<number>();
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
          const inst = mesh as THREE.InstancedMesh;
          if (!inst.count) return; // filled in as things move (buckets): nothing fixed to tag
          if (users.get(g)! > 1) inst.geometry = g = g.clone();
          const arr = new Float32Array(inst.instanceMatrix.count);
          // the power pulses ride their own line: one run of instances per line, in route order
          const pulses = mesh.parent?.name === "part:power" && this.pulseRuns(routes, inst.instanceMatrix.count);
          for (let i = 0; i < arr.length; i++) {
            if (pulses) {
              const pc = pulses[i];
              arr[i] = pc ? 2 + pc.id + 0.995 : 0; // a pulse shows once its line is whole
            } else {
              inst.getMatrixAt(i, im);
              p.setFromMatrixPosition(im).applyMatrix4(m);
              arr[i] = tagAt(pieces, p);
            }
            if (arr[i]) ids.add(Math.floor(arr[i]) - 2);
          }
          g.setAttribute("frPieceI", new THREE.InstancedBufferAttribute(arr, 1));
        } else {
          if (users.get(g)! > 1) mesh.geometry = g = g.clone();
          const n = pos.count, arr = new Float32Array(n);
          if (g.index) {
            for (let i = 0; i < n; i++) {
              arr[i] = tagAt(pieces, p.fromBufferAttribute(pos, i).applyMatrix4(m));
              if (arr[i]) ids.add(Math.floor(arr[i]) - 2);
            }
          } else
            for (let i = 0; i + 2 < n; i += 3) {
              a.fromBufferAttribute(pos, i).applyMatrix4(m);
              b.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
              c.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
              const t = tagAt(pieces, p.copy(a).add(b).add(c).divideScalar(3));
              arr[i] = arr[i + 1] = arr[i + 2] = t;
              if (t) ids.add(Math.floor(t) - 2);
            }
          g.setAttribute("frPiece", new THREE.BufferAttribute(arr, 1));
        }
        // a mesh still holding something unbuilt casts no shadow until it's all there (the depth pass can't drop it)
        if (ids.size && mesh.castShadow) this.shadows.push({ m: mesh, ids, cast: true });
      });
    }
  }

  // power.js lays its pulses out one line after another, round(length / 1.5) (at least 2) to a line
  private pulseRuns(routes: { from: string; to: string; pts: number[][] }[], count: number): (Piece | null)[] | null {
    const out: (Piece | null)[] = [];
    for (const r of routes) {
      let L = 0;
      for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1], r.pts[i][2] - r.pts[i - 1][2]);
      const pc = this.pieces.find((x) => x.name === `power:${r.from}>${r.to}`) ?? null;
      for (let k = Math.max(2, Math.round(L / 1.5)); k > 0; k--) out.push(pc);
    }
    return out.length === count ? out : null;
  }

  private writeRise() {
    for (const v of this.rise) v.set(1, 1, 1, 1);
    for (const pc of this.pieces) this.setRise(pc.id, this.standing(pc.owner) ? 1 : 0);
    this.syncShadows();
  }

  private setRise(id: number, r: number) {
    this.rise[id >> 2].setComponent(id & 3, r);
  }

  private riseOf(id: number) {
    return this.rise[id >> 2].getComponent(id & 3);
  }

  private syncShadows() {
    let changed = false;
    for (const s of this.shadows) {
      const all = [...s.ids].every((id) => this.riseOf(id) >= 1);
      if (s.m.castShadow !== all) (s.m.castShadow = all), (changed = true);
    }
    if (changed) this.hooks.poke();
  }

  /** a station the player hasn't built: no chip, no pick */
  hidden(stationId: string): boolean {
    return this.hiddenStations.has(stationId);
  }

  /** a mine the player hasn't opened */
  mineHidden(src: string): boolean {
    return !!this.owners && !this.standing(this.owners.mines.get(src) ?? null);
  }

  // ---------- the journey ----------

  /** Read where the factory is. The first look shows what's built as it stands; after that, new builds play. */
  sync(state: FactoryState) {
    const where = stepFrom(state);
    if (!this.synced) {
      this.synced = true;
      for (const id of where.built) this.shown.add(id);
      this.complete = where.id === "look";
      if (this.I) this.refresh();
    } else
      for (const id of where.built) if (!this.shown.has(id) && !this.queue.includes(id) && this.moment?.step !== id) this.queue.push(id);
    this.next = where.id === "look" ? null : where.id;
    this.advance();
  }

  // every piece and machine as the shown set says, after the first look decided what stands
  private refresh() {
    const I = this.I!;
    for (const id of [...this.hiddenStations]) {
      if (!this.standing(this.owners!.stations.get(id) ?? null)) continue;
      this.hiddenStations.delete(id);
      I.stations[id].holder.visible = true;
      this.hooks.bake(I.stations[id].holder);
    }
    this.writeRise();
    this.drawChalk();
  }

  private advance() {
    if (this.moment) return;
    const id = this.queue.shift();
    if (!id) {
      if (!this.complete && !this.next && this.shown.size === STEPS.length) {
        // every build done: the leftovers stand, quietly
        this.complete = true;
        if (this.I) this.refresh();
        this.hooks.light(4);
      }
      this.drawChalk();
      this.parkOn(this.next);
      return;
    }
    const step = stepById(id);
    if (!step.reveals.length) {
      // nothing rises (the cart rolls out, the build runs): the moment is the line moving, the card says so
      emitBuild({ id, phase: "start", first: true });
      emitBuild({ id, phase: "burst", first: true });
      this.shown.add(id);
      emitBuild({ id, phase: "done", first: true });
      this.advance();
      return;
    }
    this.moment = { step: id, phase: "chalk", t: 0, holders: [], pieces: [], runs: [], burst: null, anchor: null, hurry: false };
    this.drawChalk(id);
    this.parkOn(id);
    emitBuild({ id, phase: "start", first: true });
  }

  private parkOn(id: StepId | null) {
    if (!id || !this.L) return;
    const target = cameraFor(stepById(id), this.L);
    const key = target.join(",");
    if (key === this.parked || !target.length) return;
    this.parked = key;
    this.hooks.park(target);
  }

  /** A new camera (a new shaft): park it where the journey is. */
  repark() {
    this.parked = "";
    this.parkOn(this.moment?.step ?? this.next);
  }

  /** a tap: skip ahead to the burst (the payoff always plays) */
  hurry() {
    const mo = this.moment;
    if (!mo || (mo.phase !== "chalk" && mo.phase !== "construct")) return;
    mo.hurry = true;
    for (const r of mo.runs) r.finish();
  }

  /** every frame (and every manual advance) */
  tick(t: number, dt: number) {
    if (this.chalk) {
      const glow = this.moment?.phase === "chalk" ? 0.85 + 0.15 * Math.min(1, this.moment.t / CHALK_S) : this.reduced ? 0.8 : 0.72 + 0.14 * Math.sin(t * 2.2);
      this.chalkMat.opacity = glow;
    }
    const mo = this.moment;
    if (!mo || !this.I) return;
    mo.t += dt;
    if (mo.phase === "chalk") {
      if (mo.t >= CHALK_S || mo.hurry) this.startConstruct(mo);
      return;
    }
    if (mo.phase === "construct") {
      let all = true;
      for (const r of mo.runs) if (!r.update(dt)) all = false;
      const k = mo.hurry || this.reduced ? 1 : Math.min(1, mo.t / CONSTRUCT_S);
      // the pieces grow one after another along the flow, each over 40% of the time
      const n = mo.pieces.length;
      mo.pieces.forEach((pc, i) => {
        const start = n > 1 ? (i / (n - 1)) * 0.6 : 0;
        const u = Math.min(1, Math.max(0, (k - start) / 0.4));
        this.setRise(pc.id, u >= 1 ? 1 : u * u * (3 - 2 * u));
      });
      if (n) this.syncShadows();
      if (all && (k >= 1 || mo.hurry)) this.startBurst(mo);
      return;
    }
    if (mo.phase === "burst") {
      const fin = !mo.burst || mo.burst.update(dt);
      if (fin && (mo.t >= BURST_S || this.reduced)) {
        mo.phase = "payoff";
        mo.t = 0;
        const f = stepById(mo.step).lights;
        this.shown.add(mo.step);
        if (f) this.hooks.light(this.litFloors);
      }
      return;
    }
    if (mo.t >= PAYOFF_S) {
      mo.anchor?.removeFromParent();
      this.moment = null;
      emitBuild({ id: mo.step, phase: "done", first: true });
      this.advance();
    }
  }

  private startConstruct(mo: Moment) {
    const I = this.I!, owners = this.owners!;
    mo.phase = "construct";
    mo.t = 0;
    this.clearChalk();
    for (const [id, o] of owners.stations) {
      if (o !== mo.step || !this.hiddenStations.has(id)) continue;
      const h = I.stations[id]?.holder;
      if (!h) continue;
      this.hiddenStations.delete(id);
      h.visible = true;
      mo.holders.push(h);
      mo.runs.push(construct(h, { reduced: this.reduced, seconds: CONSTRUCT_S }));
    }
    mo.pieces = this.pieces.filter((pc) => pc.owner === mo.step && this.riseOf(pc.id) < 1);
    this.hooks.poke();
  }

  private startBurst(mo: Moment) {
    const I = this.I!, L = this.L!;
    for (const r of mo.runs) r.finish();
    for (const pc of mo.pieces) this.setRise(pc.id, 1);
    this.syncShadows();
    for (const h of mo.holders) this.hooks.bake(h);
    mo.phase = "burst";
    mo.t = 0;
    // the machine the camera's on bursts; a step that raised none (the tunnel) crackles at its site
    const cam = cameraFor(stepById(mo.step), L);
    let target: THREE.Object3D | undefined = cam.map((k) => I.stations[k]?.holder).find((h) => h && mo.holders.includes(h));
    if (!target) {
      mo.anchor = new THREE.Group();
      mo.anchor.position.copy(this.siteOf(mo.step));
      this.root!.add(mo.anchor);
      target = mo.anchor;
    }
    // burst.ts finds the cable feeding a machine from its station:<id> name
    mo.burst = burst(target, { first: true, reduced: this.reduced });
    emitBuild({ id: mo.step, phase: "burst", first: true });
    this.hooks.poke();
  }

  // ---------- the chalk outline on the next site ----------

  private siteOf(step: StepId): THREE.Vector3 {
    const L = this.L!;
    const r = resolve(stepById(step).reveals, L);
    const st = r.stations.map((id) => L.stations.find((s) => s.id === id)).find(Boolean);
    if (st) return new THREE.Vector3(st.x, st.y + 1, st.z);
    const m = r.mines[0] && MINES[r.mines[0]];
    return m ? new THREE.Vector3(m.x, m.y + 0.8, LEDGE_Z + 0.6) : new THREE.Vector3();
  }

  /** where the pool of light sits (root coords) and how wide, or null for none */
  spot(): [number, number, number, number] | null {
    const id = this.moment?.step ?? this.next;
    if (!id || !this.L || !stepById(id).reveals.length) return null;
    const s = this.siteOf(id);
    return [s.x, s.y, s.z, 5.5];
  }

  private clearChalk() {
    if (!this.chalk) return;
    this.chalk.removeFromParent();
    this.chalk.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.chalk = null;
  }

  private drawChalk(step: StepId | null = this.moment?.step ?? this.next) {
    this.clearChalk();
    if (!step || !this.root || !this.L || this.moment?.phase === "construct" || this.moment?.phase === "burst" || this.moment?.phase === "payoff") return;
    const L = this.L;
    const r = resolve(stepById(step).reveals, L);
    const g = new THREE.Group();
    g.name = "buildout-chalk";
    g.userData.noBake = true;
    for (const id of r.stations) {
      const st = L.stations.find((s) => s.id === id);
      if (st && !this.standing(this.owners!.stations.get(id) ?? null)) g.add(this.outline(st));
    }
    for (const src of r.mines) if (MINES[src] && this.mineHidden(src)) g.add(this.mouth(src));
    if (!g.children.length) return;
    this.root.add(g);
    this.chalk = g;
  }

  // a dashed square on the deck round the machine's footprint, a stake at each corner
  private outline(st: StationDef): THREE.Group {
    const g = new THREE.Group();
    g.position.set(st.x, st.y + 0.13, st.z);
    g.rotation.y = st.rot ?? -Math.PI / 4;
    const half = st.power ? 1.5 : st.type === "check" ? 1.35 : st.type === "launch" ? 2.6 : 2.4;
    const dash = 0.42, gap = 0.22;
    for (let side = 0; side < 4; side++) {
      const e = new THREE.Group();
      e.rotation.y = (side * Math.PI) / 2;
      for (let s = -half + gap; s < half - gap; s += dash + gap) {
        const len = Math.min(dash, half - gap - s);
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.15), this.chalkMat);
        m.position.set(s + len / 2, 0, half);
        e.add(m);
      }
      g.add(e);
    }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), this.stakeMat);
      post.position.set(sx * (half + 0.12), 0.33, sz * (half + 0.12));
      post.rotation.z = sx * 0.06;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.03), this.chalkMat);
      flag.position.set(sx * (half + 0.12) + 0.09, 0.62, sz * (half + 0.12));
      g.add(post, flag);
    }
    // a chalk cross where the machine's heart goes
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const x = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.13), this.chalkMat);
      x.rotation.y = a;
      g.add(x);
    }
    return g;
  }

  // the tunnel mouth: a chalk frame on the rock and two stakes on its ledge
  private mouth(src: string): THREE.Group {
    const m = MINES[src];
    const g = new THREE.Group();
    g.position.set(m.x, m.y, MINE_FACE_Z + 0.07);
    const w = 3.4, h = 2.8;
    const bar = (len: number, x: number, y: number, rot: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.03), this.chalkMat);
      b.position.set(x, y, 0);
      b.rotation.z = rot;
      g.add(b);
    };
    for (let s = -w / 2; s < w / 2 - 0.1; s += 0.62) bar(0.4, s + 0.2, h, 0), bar(0.4, s + 0.2, -0.05, 0);
    for (let s = 0; s < h - 0.1; s += 0.62) bar(0.4, -w / 2, s + 0.2, Math.PI / 2), bar(0.4, w / 2, s + 0.2, Math.PI / 2);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), this.stakeMat);
      post.position.set(sx * (w / 2 + 0.3), 0.3, LEDGE_Z - MINE_FACE_Z + 0.7);
      g.add(post);
    }
    return g;
  }

  dispose() {
    this.clearChalk();
    this.chalkMat.dispose();
    this.stakeMat.dispose();
  }
}
