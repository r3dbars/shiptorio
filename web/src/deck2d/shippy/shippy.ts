// Shippy, the automation robot (contract: ShippyModule in ../contract.ts). He never talks.
//
// Home is the top-left corner: a folded iron box that breathes, peeks out when a call is waiting, hops when you
// approve, rattles and smokes when something jams. When the view sends him to a stop he unfolds in the corner,
// jumps out, drops onto the deck with a clunk, walks to the stop and does the pose (pulls the lever, hops, alarms).
// Sent back to the corner he jumps off the deck and lands in the corner folding shut.
//
// Everything is driven by update(dt, view): the engine only says where he should be and what he's doing.
// Times are seconds. World units are deck px (contract "world space").
import { ART_PX, FLOOR_Y, STOP_X, type ArtLoader, type ShippyModule, type ShippyPose, type ShippyView, type StopId } from "../contract";
import { pixelOn } from "../../flags";
import { ANCHOR, STRIP_H, UNFOLD, type ShippyFrame } from "./frames";
import { PX_INK, drawPx, pxFrame, type PxFrame } from "./pixel";

/** The contract's poses plus the build poses: weld (torch + sparks) and carry (a steel beam, also while walking). */
export type ShippyActPose = ShippyPose | "weld" | "carry";

/** ShippyView with the build poses allowed too (the engine's ShippyView fits as is). */
export type ShippyActView = Omit<ShippyView, "pose"> & { pose: ShippyActPose };

export type ShippyOptions = {
  /** Strip-frame height in world units (the folded box is ~3/4 of it). */
  size?: number;
  /** Walk speed, world units per second. */
  speed?: number;
  /** Where he stands relative to a stop's x (beside the machine, by its lever). */
  standDx?: number;
  /** Where he drops onto the deck. */
  entryX?: number;
  /** Floor height under x, for decks that aren't flat (the bridge to the rocket island). */
  floorAt?: (x: number) => number;
  reducedMotion?: boolean;
  /** Draw as code pixel art on the art grid (contract: the pixel canvas). Defaults to ?px=1 / the pixel feature. */
  pixel?: boolean;
};

// px / pxFlip: the frame and facing when drawn as pixel art (?px=1); without px it follows `frame`.
type Draw = { frame: ShippyFrame; x: number; y: number; sx: number; sy: number; rot: number; flip: boolean; glow: number; color: string; alpha: number; px?: PxFrame; pxFlip?: boolean };
type Puff = { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number; color: string };
type CornerMode = "home" | "unfold" | "gone" | "fold";
type WorldMode = "off" | "drop" | "walk" | "stand" | "leave";

const STEP = 0.06; // seconds per unfold frame
const ANTICIPATE = 0.12;
const UNFOLD_S = ANTICIPATE + STEP * UNFOLD.length + 0.08;
const FOLD_S = 0.32 + STEP * UNFOLD.length + 0.35; // fall in, fold, clunk + wobble
const DROP_S = 0.42;
const LAND_S = 0.3;
const LEAVE_S = 0.4;
const CYAN = "95,220,255", AMBER = "255,176,32", GREEN = "70,224,122", RED = "255,74,50";

const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Damped spring: 1 at t=0 wobbling down to 0 by t~0.8. */
const wobble = (t: number, hz = 2.5) => Math.exp(-6 * t) * Math.cos(t * hz * Math.PI * 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function createShippy(art: ArtLoader, options: ShippyOptions = {}): ShippyModule & {
  /** Same as the contract's update, also taking the build poses. */
  update(dt: number, view: ShippyActView): void;
  /** For previews and tests: what he's doing right now. */
  readonly state: { corner: CornerMode; world: WorldMode; x: number; pose: ShippyActPose };
} {
  const o = {
    size: 90, speed: 380, standDx: 150, entryX: STOP_X.repo - 150,
    floorAt: (_x: number) => FLOOR_Y + 22, // just in front of the belt, so he never walks through a machine
    reducedMotion: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    pixel: pixelOn(),
    ...options,
  };
  const still = o.reducedMotion;
  let clock = 0;
  let view: ShippyActView = { pose: "folded", at: "corner" };
  const corner = { mode: "home" as CornerMode, t: 9, poseT: 9, pose: "folded" as ShippyActPose };
  const world = { mode: "off" as WorldMode, t: 0, x: o.entryX, tx: o.entryX, facing: 1 as 1 | -1, poseT: 0, pose: "walking" as ShippyActPose };
  const worldPuffs: Puff[] = [];
  const cornerPuffs: Puff[] = []; // in box units: 0..1 across the corner box
  let landed = 9; // seconds since the corner box last clunked shut

  const spot = (at: StopId) => STOP_X[at] + o.standDx;
  const wantsDeck = () => view.at !== "corner";

  function puff(list: Puff[], x: number, y: number, n: number, spread: number, color = "200,180,150", rise = 0) {
    if (still) return;
    for (let i = 0; i < n; i++) list.push({
      x: x + (Math.random() - 0.5) * spread, y,
      vx: (Math.random() - 0.5) * spread * 2.5, vy: -(0.3 + Math.random() + rise) * spread,
      age: 0, life: 0.4 + Math.random() * 0.35 + rise * 0.3, r: spread * (0.12 + Math.random() * 0.12), color,
    });
  }
  const feet = (n: number, color?: string) => puff(worldPuffs, world.x, o.floorAt(world.x), n, o.size * 0.35, color);

  function update(dt: number, next: ShippyActView) {
    dt = Math.min(dt, 0.1);
    clock += dt;
    landed += dt;
    if (next.pose !== view.pose) { world.poseT = 0; corner.poseT = 0; }
    view = next;
    world.poseT += dt;
    corner.poseT += dt;

    // ---- corner ----
    corner.t += dt;
    if (corner.mode === "home" && wantsDeck() && world.mode === "off") { corner.mode = "unfold"; corner.t = 0; }
    if (corner.mode === "unfold" && corner.t >= UNFOLD_S) {
      corner.mode = "gone"; corner.t = 0;
      if (wantsDeck()) { world.mode = "drop"; world.t = 0; world.x = o.entryX; world.facing = 1; }
      else { corner.mode = "fold"; } // changed his mind mid-unfold
    }
    if (corner.mode === "fold" && corner.t >= FOLD_S) { corner.mode = "home"; corner.t = 0; }
    if (corner.mode === "home") corner.pose = view.at === "corner" ? view.pose : "folded";
    // clunk when the box slams shut, and a puff of dust
    if (corner.mode === "fold" && crossed(corner.t, dt, 0.32 + STEP * UNFOLD.length)) { landed = 0; puff(cornerPuffs, 0.5, 0.92, 6, 0.3); }

    // ---- world ----
    world.t += dt;
    const target = view.at === "corner" ? null : spot(view.at);
    switch (world.mode) {
      case "drop":
        if (crossed(world.t, dt, DROP_S)) feet(8);
        if (world.t >= DROP_S + LAND_S) startWalk(target);
        break;
      case "walk": {
        if (target === null) { world.mode = "leave"; world.t = 0; feet(5); break; }
        world.tx = target;
        const d = world.tx - world.x;
        if (d !== 0) world.facing = d > 0 ? 1 : -1;
        const stepLen = Math.min(Math.abs(d), o.speed * dt * walkEase());
        world.x += Math.sign(d) * stepLen;
        if (Math.abs(world.tx - world.x) < 0.5) { world.x = world.tx; world.mode = "stand"; world.t = 0; world.poseT = 0; feet(3); }
        break;
      }
      case "stand":
        if (target === null) { world.mode = "leave"; world.t = 0; feet(5); }
        else if (Math.abs(target - world.x) > 0.5) startWalk(target);
        else standEffects(dt);
        break;
      case "leave":
        if (world.t >= LEAVE_S) {
          if (wantsDeck()) { world.mode = "drop"; world.t = 0; } // changed his mind: straight back down
          else { world.mode = "off"; corner.mode = "fold"; corner.t = 0; }
        }
        break;
    }
    world.pose = view.pose;
    if (corner.mode === "home" && view.at === "corner" && view.pose === "alarmed" && Math.floor(clock / 0.15) !== Math.floor((clock - dt) / 0.15))
      puff(cornerPuffs, 0.58, 0.1, 1, 0.25, "120,110,105", 1.2);

    age(worldPuffs, dt);
    age(cornerPuffs, dt);
  }

  // he speeds up out of a stand and slows into the stop, so a walk never starts or ends at full tilt
  function walkEase() {
    const left = Math.abs(world.tx - world.x);
    return Math.min(1, 0.35 + world.t * 3) * Math.min(1, 0.3 + left / (o.size * 1.2));
  }
  function startWalk(target: number | null) {
    if (target === null) { world.mode = "leave"; world.t = 0; return; }
    world.mode = "walk"; world.t = 0; world.tx = target;
  }
  function standEffects(dt: number) {
    const p = world.pose, t = world.poseT;
    if (p === "lever" && crossed(t % 1.4, dt, 0.55)) puff(worldPuffs, world.x + o.size * 1.35, o.floorAt(world.x) - o.size * 0.35, 5, o.size * 0.25, "255,190,90");
    if (p === "happy" && t < 1 && crossed(t % 0.5, dt, 0.49)) feet(3);
    if (p === "weld" && crossed(t % 0.09, dt, 0.08)) puff(worldPuffs, world.x + o.size * 0.95, o.floorAt(world.x) - o.size * 0.05, 3, o.size * 0.18, "255,200,90", 0.6);
    if (p === "alarmed" && crossed(t % 0.14, dt, 0.13)) puff(worldPuffs, world.x + o.size * 0.15, o.floorAt(world.x) - o.size * 1.35, 1, o.size * 0.3, "120,110,105", 1.2);
  }
  function crossed(t: number, dt: number, at: number) { return t >= at && t - dt < at; }
  function age(list: Puff[], dt: number) {
    for (const q of list) { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.96; }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].age >= list[i].life) list.splice(i, 1);
  }

  // ---- poses ----
  /** A pose acted out in place: shared by the corner and the deck. u = one body-size in the space being drawn. */
  function act(pose: ShippyActPose, t: number, u: number, base: Draw): Draw {
    switch (pose) {
      case "lever": {
        // reach, yank with a jolt, hold, let go; repeats while the view keeps him on the lever
        const k = (t % 1.4) / 1.4;
        const yank = k > 0.35 && k < 0.5 ? Math.sin(((k - 0.35) / 0.15) * Math.PI) : 0;
        // pixel art: he faces the engine's lever (to his left) and the arm dips a px on the yank
        return { ...base, frame: k > 0.9 ? "shippy-4" : "shippy-lever", px: yank > 0.3 ? "lever1" : "lever0", pxFlip: true, flip: false, x: base.x + yank * u * 0.05, sx: 1 + yank * 0.05, sy: 1 - yank * 0.08, glow: 0.6 + yank * 0.4 };
      }
      case "happy": {
        // two hops, then he stands there glowing green
        const h = t < 1 ? (t % 0.5) / 0.5 : 0;
        const air = still ? 0 : Math.sin(h * Math.PI);
        const land = !still && h > 0.9 ? (h - 0.9) * 10 : 0;
        return { ...base, frame: "shippy-happy", y: base.y - air * u * 0.4, sx: 1 - air * 0.07 + land * 0.1, sy: 1 + air * 0.1 - land * 0.12, glow: 0.9, color: GREEN };
      }
      case "alarmed":
        return {
          ...base, frame: "shippy-alarm",
          x: base.x + (still ? 0 : Math.sin(t * 80) * u * 0.03), rot: still ? 0 : Math.sin(t * 61) * 0.025,
          glow: 0.6 + 0.4 * Math.sin(t * 16), color: RED,
        };
      case "weld": {
        // torch flickers between the two frames, a shower of sparks at the tip
        const f = Math.floor(t / 0.09) % 2;
        return { ...base, frame: f ? "shippy-weld-1" : "shippy-weld-0", px: f ? "weld1" : "weld0", flip: false, x: base.x + (f ? u * 0.01 : 0), glow: 0.7 + 0.3 * f, color: AMBER };
      }
      case "carry": {
        const f = Math.floor(t / 0.6) % 2;
        return { ...base, frame: f ? "shippy-carry-1" : "shippy-carry-0", px: "carry0", sy: base.sy - (f ? 0.02 : 0) };
      }
      case "inspect":
        // lean in with the eye wide, a slow look over the thing in front of him
        return { ...base, frame: "shippy-4", px: Math.floor(t / 0.6) % 2 ? "inspect1" : "inspect0", y: base.y + u * 0.02 };
      case "poke": {
        const f = Math.floor(t / 0.25) % 2;
        return { ...base, frame: "shippy-4", px: f ? "poke1" : "poke0", x: base.x + (f ? u * 0.04 : 0) };
      }
      case "skid":
        return { ...base, frame: "shippy-5", px: "skid", x: base.x - u * 0.04 };
      case "idle":
        // a blink every few seconds, nothing else
        return { ...base, frame: "shippy-3", px: t % 4 > 3.85 ? "idle1" : "idle0" };
      case "peek": {
        // pop the lid once with one little hop, then just the amber glow: "a call is waiting on you"
        const pop = t < 0.25 ? wobble(t / 0.25, 1) * 0.12 : 0;
        const k = (t - 0.1) / 0.35;
        const hop = !still && k > 0 && k < 1 ? Math.sin(k * Math.PI) * u * 0.12 : 0;
        return { ...base, frame: "shippy-peek", y: base.y - hop, sx: 1 + pop, sy: 1 - pop + (hop ? 0.04 : 0), glow: 0.55 + 0.35 * Math.sin(t * 6), color: AMBER };
      }
      default:
        return base;
    }
  }

  function cornerDraw(x: number, y: number, size: number): Draw | null {
    const fx = x + size * 0.5, fy = y + size * 0.9;
    const base: Draw = { frame: "shippy-1", x: fx, y: fy, sx: 1, sy: 1, rot: 0, flip: false, glow: 0.4, color: CYAN, alpha: 1 };
    const t = corner.t;
    switch (corner.mode) {
      case "gone": return null;
      case "unfold": {
        // squash down, then pop up through the strip, then leap up and out of the corner
        if (t < ANTICIPATE) { const a = t / ANTICIPATE; return { ...base, frame: "shippy-1", sx: 1 + 0.16 * a, sy: 1 - 0.2 * a }; }
        const ft = t - ANTICIPATE;
        const i = Math.min(UNFOLD.length - 1, Math.floor(ft / STEP));
        const a = clamp01(ft / (UNFOLD_S - ANTICIPATE));
        const leap = a > 0.7 ? easeIn((a - 0.7) / 0.3) : 0;
        return {
          ...base, frame: UNFOLD[i], y: fy - Math.sin(Math.min(a, 0.7) / 0.7 * Math.PI) * size * 0.12 - leap * size * 0.9,
          sx: 1 - 0.08 * Math.sin(a * Math.PI) - leap * 0.1, sy: 1 + 0.14 * Math.sin(a * Math.PI) + leap * 0.15,
          glow: 0.4 + 0.6 * a, alpha: 1 - leap,
        };
      }
      case "fold": {
        // drop in from above, fold up the strip backwards, slam shut and wobble
        const fall = 0.32;
        if (t < fall) {
          const a = easeIn(t / fall);
          return { ...base, frame: "shippy-5", y: fy - (1 - a) * size * 1.1, sx: 0.92, sy: 1.12, alpha: clamp01(t / 0.1) };
        }
        const ft = t - fall;
        const i = Math.max(0, UNFOLD.length - 1 - Math.floor(ft / STEP));
        if (ft < STEP * UNFOLD.length) {
          const a = ft / (STEP * UNFOLD.length);
          return { ...base, frame: UNFOLD[i], sx: 1 + 0.1 * Math.sin(a * Math.PI), sy: 1 - 0.1 * Math.sin(a * Math.PI), glow: 0.9 - 0.5 * a };
        }
        return { ...base, frame: "shippy-0" };
      }
      case "home": {
        const breathe = still ? 0 : Math.sin(clock * 2.2) * 0.025;
        const settle = still ? 0 : wobble(Math.min(landed, 2)) * 0.18;
        const idle: Draw = {
          ...base, frame: landed < 0.4 || Math.sin(clock * 1.6) > 0.3 ? "shippy-1" : "shippy-0",
          sx: 1 - breathe + settle, sy: 1 + breathe - settle, glow: 0.35 + 0.25 * Math.sin(clock * 2.2),
        };
        return act(corner.pose, corner.poseT, size, idle);
      }
    }
  }

  function worldDraw(): Draw | null {
    const u = o.size, floor = o.floorAt(world.x), t = world.t;
    const base: Draw = { frame: "shippy-3", x: world.x, y: floor, sx: 1, sy: 1, rot: 0, flip: world.facing < 0, glow: 0.5, color: CYAN, alpha: 1 };
    switch (world.mode) {
      case "off": return null;
      case "drop": {
        if (t < DROP_S) {
          const a = easeIn(t / DROP_S);
          return { ...base, frame: "shippy-5", y: floor - (1 - a) * u * 4, sx: 0.9, sy: 1.15, rot: -0.06 * (1 - a), alpha: clamp01(t / 0.08) };
        }
        const w = wobble((t - DROP_S) / LAND_S, 2) * 0.22;
        return { ...base, frame: "shippy-3", sx: 1 + w, sy: 1 - w };
      }
      case "walk": {
        if (still) return { ...base, frame: "shippy-5" };
        const ph = (t % 0.13) / 0.13;
        const bob = Math.abs(Math.sin(ph * Math.PI));
        const beam = view.pose === "carry";
        const legs = Math.floor(t / (beam ? 0.18 : 0.13)) % 2;
        return {
          ...base, frame: beam ? (legs ? "shippy-carry-1" : "shippy-carry-0") : legs ? "shippy-3" : "shippy-5",
          px: `${beam ? "carry" : "walk"}${Math.floor(t * (beam ? 8 : 10)) % 6}` as PxFrame,
          y: floor - bob * u * 0.06, rot: Math.sin(t * Math.PI * 2 / 0.26) * 0.04 * world.facing,
          sx: 1 + bob * 0.03, sy: 1 - bob * 0.03,
        };
      }
      case "stand": {
        const breathe = still ? 0 : Math.sin(clock * 2.6) * 0.01;
        const arrive = still ? 0 : wobble(Math.min(1, t / 0.5), 2) * 0.1;
        // standing still means still: one frame, only a faint breath (the deck was too busy, Justin 2026-10-28)
        const idle: Draw = { ...base, frame: "shippy-3", sx: 1 + arrive - breathe, sy: 1 - arrive + breathe };
        return act(world.pose, world.poseT, u, idle);
      }
      case "leave": {
        // crouch, then spring straight up off the deck and away to the corner
        if (t < 0.12) { const a = t / 0.12; return { ...base, frame: "shippy-3", sx: 1 + 0.15 * a, sy: 1 - 0.18 * a }; }
        const a = (t - 0.12) / (LEAVE_S - 0.12);
        return { ...base, frame: "shippy-5", y: floor - easeInOut(a) * u * 4, sx: 0.9, sy: 1.15, rot: -0.08 * a * world.facing, alpha: 1 - clamp01((a - 0.6) / 0.4) };
      }
    }
  }

  function paint(ctx: CanvasRenderingContext2D, d: Draw, k: number, u: number, floorY: number) {
    const im = art.get(d.frame);
    ctx.save();
    ctx.globalAlpha = d.alpha;
    // lantern glow behind him: the gentle pulse, tinted by mood
    if (d.glow > 0) {
      const gx = d.x + (d.flip ? 1 : -1) * u * 0.42, gy = d.y - u * 0.4, r = u * 0.75;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(${d.color},${0.32 * d.glow})`);
      g.addColorStop(1, `rgba(${d.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    // contact shadow on the floor, smaller the higher he is
    const lift = Math.max(0, floorY - d.y);
    const s = Math.max(0.25, 1 - lift / (u * 2));
    ctx.fillStyle = `rgba(0,0,0,${0.32 * s})`;
    ctx.beginPath();
    ctx.ellipse(d.x, floorY, u * 0.55 * s, u * 0.09 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (im) {
      const a = ANCHOR[d.frame];
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      const ks = k * (a.s ?? 1);
      ctx.scale((d.flip ? -1 : 1) * d.sx * ks, d.sy * ks);
      ctx.drawImage(im, -a.ax, -a.ay);
    }
    ctx.restore();
  }
  /** Pixel-art frame for a Draw: the pose's own, else the closest match to the painted frame. */
  const PX_OF: Record<ShippyFrame, PxFrame> = {
    "shippy-0": "box0", "shippy-1": "box1", "shippy-2": "unfold2", "shippy-3": "unfold3", "shippy-4": "armout", "shippy-5": "stand",
    "shippy-lever": "lever0", "shippy-happy": "happy", "shippy-alarm": "alarm", "shippy-peek": "peek",
    "shippy-weld-0": "weld0", "shippy-weld-1": "weld1", "shippy-carry-0": "carry0", "shippy-carry-1": "carry3",
  };
  /** Pixel paint: whole art px only, no rotation or scaling; squash and stretch become nothing, hops become px steps. */
  function paintPx(ctx: CanvasRenderingContext2D, d: Draw, unit: number, floorY: number, standing: boolean) {
    if (d.alpha < 0.5) return;
    const name = d.px ?? (standing && d.frame === "shippy-3" ? "stand" : PX_OF[d.frame]);
    const snapU = (n: number) => Math.round(n / unit) * unit;
    let x = snapU(d.x);
    const y = snapU(d.y), fy = snapU(floorY);
    if (name === "alarm" && !still) x += (Math.floor(clock * 10) % 2) * unit; // a 1 px rattle
    const g = pxFrame(name);
    // contact shadow: a soft iron row on the floor, down-left of him, shrinking as he lifts off
    const lift = Math.round((fy - y) / unit);
    const w = Math.max(2, g.maxX - g.minX + 1 - 2 - lift * 2);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = PX_INK.k;
    ctx.fillRect(x + (g.minX + (g.maxX - g.minX + 1 - w) / 2 - 1 | 0) * unit, fy, w * unit, unit);
    ctx.restore();
    drawPx(ctx, name, x, y, unit, d.pxFlip ?? d.flip);
  }
  const PUFF_INK: Record<string, string> = { "200,180,150": PX_INK.h, "120,110,105": PX_INK.i, "255,190,90": PX_INK.e, "255,200,90": PX_INK.f };
  function paintPuffsPx(ctx: CanvasRenderingContext2D, list: Puff[], map: (x: number, y: number) => [number, number], unit: number) {
    for (const q of list) {
      if (q.age > q.life * 0.7) continue;
      const [x, y] = map(q.x, q.y);
      ctx.fillStyle = PUFF_INK[q.color] ?? PX_INK.h;
      ctx.fillRect(Math.round(x / unit) * unit, Math.round(y / unit) * unit, unit, unit);
    }
  }
  function paintPuffs(ctx: CanvasRenderingContext2D, list: Puff[], map: (x: number, y: number) => [number, number], unit: number) {
    for (const q of list) {
      const a = 1 - q.age / q.life;
      const [x, y] = map(q.x, q.y);
      ctx.fillStyle = `rgba(${q.color},${0.55 * a})`;
      ctx.beginPath();
      ctx.arc(x, y, q.r * unit * (1 + q.age * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    update,
    drawWorld(ctx) {
      const d = worldDraw();
      if (o.pixel) {
        if (d) paintPx(ctx, d, ART_PX, o.floorAt(world.x), true);
        paintPuffsPx(ctx, worldPuffs, (x, y) => [x, y], ART_PX);
        return;
      }
      if (d) paint(ctx, d, o.size / STRIP_H, o.size, o.floorAt(world.x));
      paintPuffs(ctx, worldPuffs, (x, y) => [x, y], 1);
    },
    drawCorner(ctx, x, y, size) {
      const d = cornerDraw(x, y, size);
      if (o.pixel) {
        // the same pixel art at a whole number of screen px per art px
        const unit = Math.max(1, Math.floor(size / 24));
        if (d) paintPx(ctx, d, unit, y + size * 0.9, false);
        paintPuffsPx(ctx, cornerPuffs, (px, py) => [x + px * size, y + py * size], unit);
        return;
      }
      if (d) paint(ctx, d, (size * 0.8) / 282, size * 0.8, y + size * 0.9);
      paintPuffs(ctx, cornerPuffs, (px, py) => [x + px * size, y + py * size], size);
    },
    get state() { return { corner: corner.mode, world: world.mode, x: world.x, pose: view.pose }; },
  };
}
