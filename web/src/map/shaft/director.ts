// The build-as-you-go director (?buildout=1, slice 5): the camera parks on the spot where the next thing gets built.
// Each build site is framed from the layout (where its pieces stand and how big that kind of piece is), never from a
// hand-placed camera. Between builds the camera makes one quick 1 second swoop to the next site, then holds there
// with a slow breathing drift so it doesn't feel frozen. Under reduced motion it cuts straight there and holds still.
//
// Free look is earned: until the first rocket the camera is locked (the scene ignores drag, zoom and hover labels
// while `locked` is true). unlock() hands the camera back to the stage's normal views.
//
// The director writes the stage's target and view height every frame and keeps the goals equal to them, so the
// stage's own glide (camStep) has nothing left to do while it drives.

import * as THREE from "three";

import { cover, floorFrame, isFloorView, isPhone, type FloorView } from "./frame";
import type { Layout, StationDef } from "./layout";
import { MINE_FACE_Z, MINES, LIFT_X, LIFT_Z, TIERS } from "./layout";
import { TILT, type ShaftView } from "./stage";

/** What to look at: station ids from the layout ("planner", "asm-1", "steam", "ci", "gate", "pad"), a mine
 *  ("mine:github"), the ore lift ("lift") or a floor ("build"). A list frames them all together. */
export type CamTarget = string | string[];

/** The bits of ShaftStage the director drives (the stage itself fits). */
export interface DirectorStage {
  readonly tgt: THREE.Vector3;
  readonly tgtGoal: THREE.Vector3;
  viewH: number;
  viewGoal: number;
  zoom: number;
  view: ShaftView;
  W: number;
  H: number;
  rootToWorld(x: number, y: number, z: number, out?: THREE.Vector3): THREE.Vector3;
}

export type Frame = { at: [number, number, number]; h: number };

export const SWOOP = 1; // seconds from one site to the next
const MARGIN = 1.45; // room around a site, so the scaffold and the burst fit
const MIN_H = 11; // never closer than this, even on a small piece (room for its scaffold and burst)
const DRIFT = 0.012; // the drift's reach, as a fraction of the view height
const BREATHE = 0.008; // how much the view height breathes

// [half width, height] of each kind of piece, around where it stands (root units, from the module footprints)
const SIZE: Record<string, [number, number]> = {
  planner: [3, 4.5],
  assembler: [3, 5],
  ci: [3, 4],
  verify: [3, 4],
  review: [3, 4],
  check: [1.5, 3],
  gate: [3, 4.5],
  launch: [3.5, 10], // the rocket stands tall on its pad
  orbit: [2, 6],
  measure: [2, 4],
  steam: [2.5, 5.5],
  dynamo: [1.6, 3],
  battery: [1.6, 2.6],
  geothermal: [2.5, 3],
};
const MINE_SIZE: [number, number] = [2.6, 3.2]; // a tunnel mouth, its cart and ledge
const LIFT_SIZE: [number, number] = [1.6, 16]; // the ore lift runs from the quarry floor up to the build deck

// the camera's up on screen, in root space (root +x is screen right; the camera looks down TILT from the front)
const UP_Y = Math.cos(TILT), UP_Z = -Math.sin(TILT);
const screenUp = (y: number, z: number) => y * UP_Y + z * UP_Z;

type Box = { x: number; y: number; z: number; r: number; h: number };

/** the boxes a target covers (unknown ids are skipped) */
export function siteBoxes(layout: Layout, target: CamTarget): Box[] {
  const out: Box[] = [];
  for (const id of typeof target === "string" ? [target] : target) {
    if (id.startsWith("mine:")) {
      const m = MINES[id.slice(5)];
      if (m) out.push({ x: m.x, y: m.y, z: MINE_FACE_Z, r: MINE_SIZE[0], h: MINE_SIZE[1] });
      continue;
    }
    if (id === "lift") {
      out.push({ x: LIFT_X, y: TIERS.mine.y, z: LIFT_Z, r: LIFT_SIZE[0], h: LIFT_SIZE[1] });
      continue;
    }
    const st: StationDef | undefined = layout.stations.find((s) => s.id === id);
    if (!st) continue;
    const [r, h] = SIZE[st.type] ?? [3, 4];
    out.push({ x: st.x, y: st.y, z: st.z, r, h });
  }
  return out;
}

/**
 * How to frame a target on a W x H screen: the root point the view centers on and the view height. Each box is
 * measured as the camera sees it (screen right is root x, screen up mixes y and z), so a site and its neighbor
 * across a floor both fit. A phone is narrow, so width usually decides there. Floors use the stage's own framing.
 */
export function siteFrame(layout: Layout, target: CamTarget, W: number, H: number): Frame | null {
  if (typeof target === "string" && isFloorView(target)) return floorFrame(target as FloorView, W, H);
  const boxes = siteBoxes(layout, target);
  if (!boxes.length) return null;
  let x0 = Infinity, x1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  let cy = 0, cz = 0;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x - b.r);
    x1 = Math.max(x1, b.x + b.r);
    // the footprint's front and back edges, at the floor and at the top
    for (const dz of [-b.r, b.r]) for (const dy of [0, b.h]) {
      const v = screenUp(b.y + dy, b.z + dz);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    cy += b.y + b.h / 2;
    cz += b.z;
  }
  cy /= boxes.length;
  cz /= boxes.length;
  // slide the middle point along screen up until it sits in the middle of the boxes on screen
  const shift = (v0 + v1) / 2 - screenUp(cy, cz);
  const at: [number, number, number] = [(x0 + x1) / 2, cy + shift * UP_Y, cz + shift * UP_Z];
  // fit it into the band the HUD's plates leave free
  const free = Math.max(H * 0.4, H - cover.top - cover.bottom);
  const a = W / free;
  const fit = Math.max(v1 - v0, (x1 - x0) / a) * MARGIN;
  const h = Math.max(MIN_H * (isPhone(W) ? 1.35 : 1), fit) * (H / free);
  return { at, h };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Director {
  private target: CamTarget | null = null;
  private free = false;
  private size = "";
  private readonly from = new THREE.Vector3();
  private fromH = 0;
  private readonly goal = new THREE.Vector3();
  private goalH = 0;
  private swoop = 1; // 0..1 through the current swoop (1 = parked)
  private hold = 0; // seconds parked, for the drift to ease in
  private first = true; // the first park cuts straight there
  private readonly v = new THREE.Vector3();
  private readonly o = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(private readonly stage: DirectorStage, private layout: Layout, private opts: { reduceMotion?: boolean } = {}) {}

  /** true until the first rocket: the scene ignores drag, zoom and hover labels */
  get locked() {
    return !this.free;
  }

  /** where the camera is parked (or headed) */
  get at(): CamTarget | null {
    return this.target;
  }

  /** still swooping toward the site */
  get moving() {
    return !this.free && this.swoop < 1;
  }

  set reduceMotion(on: boolean) {
    this.opts.reduceMotion = on;
  }

  /** a new layout (a build added pieces): re-frame where we are, without a swoop */
  setLayout(layout: Layout) {
    this.layout = layout;
    this.size = "";
  }

  /** Swoop to a site (1 second) and hold there. snap (or reduced motion) cuts straight to it. */
  park(target: CamTarget, opts: { snap?: boolean } = {}) {
    if (this.free) return;
    const same = this.target !== null && key(this.target) === key(target);
    this.target = target;
    if (!this.aim()) return;
    const s = this.stage;
    if (opts.snap || this.opts.reduceMotion || this.first) {
      this.first = false;
      this.swoop = 1;
      this.hold = 0;
      this.write(this.goal, this.goalH);
      return;
    }
    if (same) return;
    this.from.copy(s.tgt);
    this.fromH = s.viewH;
    this.swoop = 0;
    this.hold = 0;
  }

  /** The first rocket: free look on. The camera stays where it is and the stage takes it from here. */
  unlock() {
    this.free = true;
    const s = this.stage;
    s.tgtGoal.copy(s.tgt);
    s.viewGoal = s.viewH;
  }

  /** every frame, before the stage's camStep */
  step(t: number, dt: number) {
    if (this.free || !this.target) return;
    const s = this.stage;
    s.view = "free"; // the stage's glide leaves the camera to us
    s.zoom = 1;
    const size = `${s.W}x${s.H}:${cover.top}:${cover.bottom}`;
    if (size !== this.size && !this.aim()) return;
    if (this.opts.reduceMotion) {
      this.swoop = 1;
      this.write(this.goal, this.goalH);
      return;
    }
    if (this.swoop < 1) {
      this.swoop = Math.min(1, this.swoop + dt / SWOOP);
      const k = ease(this.swoop);
      this.v.lerpVectors(this.from, this.goal, k);
      // pull back a little in the middle, so a long move reads as a swoop and not a slide
      const far = this.from.distanceTo(this.goal);
      const lift = Math.sin(Math.PI * k) * Math.min(far * 0.25, Math.max(this.fromH, this.goalH) * 0.35);
      this.write(this.v, this.fromH + (this.goalH - this.fromH) * k + lift);
      return;
    }
    this.hold += dt;
    const fade = Math.min(1, this.hold / 2); // the drift eases in after landing
    const [dx, dy, dh] = drift(t);
    const h = this.goalH;
    // drift in screen space: root x is screen right, (0, UP_Y, UP_Z) is screen up
    const ox = dx * DRIFT * h * fade, oy = dy * DRIFT * h * fade;
    const wp = this.v.copy(this.goal);
    const o = s.rootToWorld(0, 0, 0, this.o);
    const right = s.rootToWorld(1, 0, 0, this.right).sub(o);
    const up = s.rootToWorld(0, UP_Y, UP_Z, this.up).sub(o);
    wp.addScaledVector(right, ox).addScaledVector(up, oy);
    this.write(wp, h * (1 + dh * BREATHE * fade));
  }

  /** work out the goal for the current target and screen; false if it's nothing we know */
  private aim(): boolean {
    const s = this.stage;
    this.size = `${s.W}x${s.H}:${cover.top}:${cover.bottom}`;
    const f = this.target && siteFrame(this.layout, this.target, s.W, s.H);
    if (!f) return false;
    s.rootToWorld(...f.at, this.goal);
    this.goalH = f.h;
    return true;
  }

  private write(p: THREE.Vector3, h: number) {
    const s = this.stage;
    s.tgt.copy(p);
    s.tgtGoal.copy(p);
    s.viewH = s.viewGoal = h;
  }
}

const key = (t: CamTarget) => (typeof t === "string" ? t : t.join("+"));

/** the breathing drift at time t: screen x, screen y, view height, each in -1..1 (slow, never in step) */
export function drift(t: number): [number, number, number] {
  return [Math.sin(t * 0.53) * 0.8 + Math.sin(t * 0.21) * 0.2, Math.sin(t * 0.37 + 1.3) * 0.8 + Math.sin(t * 0.17) * 0.2, Math.sin(t * 0.29 + 0.6)];
}
