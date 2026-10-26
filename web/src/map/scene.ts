// The factory floor in Three.js, in the style of docs/art-prototype.html: a floating
// island with the repo's districts on stone plinths behind the machine line, belts
// between machines, and items riding the belts as they move through states.
// Machines are the locked Item Lab models (itemlab.js); each frame the scene turns
// FactoryState into the Item Lab state each model animates (WORKING, SORTING, LAUNCH...).

import * as THREE from "three";
import type { FactoryState, Harness, Item, Machine, PowerSource } from "@shiptorio/shared";
import { box, mat, mesh, own, rep, rnd, tex } from "./kit";
import {
  buildAssembler,
  buildBattery,
  buildBiter,
  buildGeo,
  buildInspector,
  buildLaunchPad,
  buildOre,
  buildSolar,
  buildSplitter,
  buildSteam,
  buildTurret,
  updateFx,
  type BuildOpts,
  type Built,
} from "./itemlab";
import { buildDrone, type DroneMode } from "./drone";
import { makeDistrict, makeIsland, makeWaterfall } from "./models";
import { KIND_COLOR, PALETTE } from "./palette";
import { pixelSizeFor, PixelPass } from "./pixel";

THREE.ColorManagement.enabled = false; // palette hexes render exactly as written

const CELL = 1.8; // world units per machine grid step (Item Lab models are ~3 units wide)
const DISTRICT_FRONT = -4; // districts sit behind the line, front edge here
const YAW = Math.PI / 4; // 45° turn
const TILT = Math.PI / 6; // 30° tilt
const CAM_DIST = 33;
const ZOOM_MIN = 0.4; // zoom > 1 means zoomed out
const ZOOM_MAX = 2.6;
const ITEM_SPEED = 1.6; // world units per second along a belt
// three r155+ lights are physically based; × π matches the prototype's r128 light levels
const LEGACY_LIGHT = Math.PI;
const HUD_RIGHT_PX = 340; // width of the HUD column in styles.css
const LAUNCH_SECONDS = 3.4; // the Item Lab rocket clears the frame in this long

export const HARNESS_COLOR: Record<Harness, number> = {
  spark: 0x6fb2ff,
  claude_code: 0xd97757,
  codex: 0xd6dbe3,
  cursor: 0x9b8cff,
  grok: 0xeef1fa,
  local: 0xff7a2a,
};

export const HARNESS_NAME: Record<Harness, string> = {
  spark: "SPARK",
  claude_code: "CLAUDE CODE",
  codex: "CODEX",
  cursor: "CURSOR",
  grok: "GROK",
  local: "LOCAL",
};

type Pt = [number, number]; // x, z on the ground

interface Path {
  pts: Pt[];
  segs: { x1: number; z1: number; x2: number; z2: number; L: number; s0: number }[];
  len: number;
}

function pathOf(pts: Pt[]): Path {
  const segs: Path["segs"] = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1e-6) continue;
    segs.push({ x1, z1, x2, z2, L, s0: len });
    len += L;
  }
  return { pts, segs, len };
}

function pointAt(p: Path, s: number): Pt {
  for (const g of p.segs) if (s <= g.s0 + g.L) {
    const k = (s - g.s0) / g.L;
    return [g.x1 + (g.x2 - g.x1) * k, g.z1 + (g.z2 - g.z1) * k];
  }
  const last = p.pts[p.pts.length - 1];
  return [last[0], last[1]];
}

const join = (...paths: (Path | undefined)[]) => pathOf(paths.flatMap((p) => p?.pts ?? []));

interface Label {
  obj: THREE.Object3D;
  y: number;
  el: HTMLDivElement;
  title: HTMLElement;
  sub: HTMLElement;
}

interface MachineView {
  built: Built;
  machine: Machine;
  label?: Label;
  art: string; // the Item Lab state the model is showing
}

interface DistrictView {
  name: string;
  roof: THREE.MeshPhongMaterial;
  center: THREE.Vector3;
  label: Label;
  files: number;
}

interface ItemView {
  mesh: THREE.Mesh;
  state: Item["state"] | null;
  path: Path | null;
  s: number;
  stopAt: number;
  rest: THREE.Vector3 | null; // where it settles once off the belt
}

interface BiterView {
  biter: Built;
  district: string;
  attacking: boolean;
}

type OreKind = "sentry" | "inbox" | "issues";

function oreKind(m: Machine): OreKind {
  if (m.id.includes("sentry")) return "sentry";
  if (m.id.includes("inbox")) return "inbox";
  return "issues";
}

// Item Lab variants: [name, color, extra?]
const ORE_VARIANT: Record<OreKind, BuildOpts["variant"]> = {
  sentry: ["SENTRY", 0xff5e52],
  inbox: ["INBOX", 0x6fb2ff],
  issues: ["ISSUES", 0xf2a93b],
};

function solarVariant(name = ""): BuildOpts["variant"] {
  const n = name.toLowerCase();
  if (n.includes("codex") || n.includes("chatgpt")) return ["CODEX", 0xd6dbe3];
  if (n.includes("cursor")) return ["CURSOR", 0x8a8f99];
  if (n.includes("grok")) return ["GROK", 0x30343c];
  return ["CLAUDE", 0xd97757];
}

// Where the label sits above each model, from the Item Lab's item heights.
const LABEL_Y: Partial<Record<Machine["type"], number>> = {
  ore_deposit: 2.6,
  splitter: 3.9,
  assembler: 2.6,
  inspector: 2.4,
  launch_pad: 4.6,
  steam: 4.4,
  solar: 2.4,
  battery: 2.3,
  geothermal: 3.0,
  turret: 2.4,
};

function buildModel(m: Machine, power?: PowerSource): Built {
  switch (m.type) {
    case "ore_deposit":
      return buildOre({ variant: ORE_VARIANT[oreKind(m)] });
    case "splitter":
      return buildSplitter();
    case "assembler": {
      const h = m.harness ?? "spark";
      return buildAssembler({ tier: m.tier - 1, variant: [HARNESS_NAME[h], HARNESS_COLOR[h]] });
    }
    case "inspector":
      return buildInspector();
    case "launch_pad":
      return buildLaunchPad();
    case "steam":
      return buildSteam({ variant: power?.name.toLowerCase().includes("baseten") ? ["BASETEN", 0x9b8cff] : ["META API", 0x6fb2ff] });
    case "solar":
      return buildSolar({ variant: solarVariant(power?.name) });
    case "battery":
      return buildBattery();
    case "turret":
      return buildTurret();
    case "geothermal":
      return buildGeo({ variant: power?.name.includes("3090") ? ["3090 · LLAMA.CPP", 0x2b2f36, 0xf2a93b] : ["MAC · MLX", 0xc9ced6, 0xeef1fa] });
    default: {
      const g = new THREE.Group();
      box(1, 0.8, 1, PALETTE.steel, 0, 0.4, 0, g);
      return { g, update() {} };
    }
  }
}

export class FactoryScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
  private readonly pass = new PixelPass();
  private readonly sun = new THREE.DirectionalLight(0xfff0d2, 0.95 * LEGACY_LIGHT);
  private readonly world = new THREE.Group(); // island + districts, rebuilt when districts change
  private readonly beltGroup = new THREE.Group();
  private readonly machines = new Map<string, MachineView>();
  private readonly districts = new Map<string, DistrictView>();
  private readonly items = new Map<string, ItemView>();
  private readonly biters = new Map<string, BiterView>();
  private readonly paths = new Map<string, Path>(); // "from>to" and "rework:inspector>assembler"
  private readonly labels = new Set<Label>();
  private beltTextures: THREE.Texture[] = [];
  private waterTextures: THREE.Texture[] = [];
  private rocks: { r: THREE.Mesh; y: number; k: number }[] = [];
  private readonly launched = new Set<string>();
  private readonly target = new THREE.Vector3();
  private readonly bounds = { x0: -10, x1: 10, z0: -10, z1: 10 };
  private worldKey = "";
  private beltKey = "";
  private zoom = 1;
  private width = 1;
  private height = 1;
  private state: FactoryState | null = null;
  private raf = 0;
  private last = performance.now();
  private t = 0;
  private launchUntil = -1;
  private readonly reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  private readonly v3 = new THREE.Vector3();
  // Spark, the Foreman, flying to whatever it's touching
  private readonly drone = buildDrone();
  private readonly droneTo = new THREE.Vector3(0, 4, 0);
  private droneLabel?: Label;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly labelRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.scene.background = new THREE.Color(PALETTE.void);

    this.scene.add(new THREE.HemisphereLight(0xd6deff, 0x40344a, 0.6 * LEGACY_LIGHT));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target, this.world, this.beltGroup, this.drone.g);
    this.droneLabel = this.addLabel(this.drone.g, 1.3);
    this.droneLabel.el.classList.add("drone");
    this.loop();
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.applyCamera();
  }

  // factor > 1 zooms out
  zoomBy(factor: number) {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor));
    this.applyCamera();
  }

  panBy(dx: number, dy: number) {
    const k = (this.camera.top - this.camera.bottom) / this.height;
    const right = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
    const down = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW));
    this.target.addScaledVector(right, -dx * k);
    this.target.addScaledVector(down, (-dy * k) / Math.sin(TILT));
    const b = this.bounds;
    this.target.x = Math.max(b.x0, Math.min(b.x1, this.target.x));
    this.target.z = Math.max(b.z0, Math.min(b.z1, this.target.z));
  }

  private applyCamera() {
    const a = this.width / this.height;
    const vh = (a < 1 ? (24 / a) * 0.62 : 19) * this.zoom;
    // keep the factory centered in the space the HUD cards on the right leave free
    const shift = this.width > 760 ? ((HUD_RIGHT_PX / 2) * vh) / this.height : 0;
    Object.assign(this.camera, { left: (-vh * a) / 2 + shift, right: (vh * a) / 2 + shift, top: vh / 2, bottom: -vh / 2 });
    this.camera.updateProjectionMatrix();
    this.pass.setSize(this.width, this.height, pixelSizeFor(this.zoom));
  }

  update(state: FactoryState) {
    const first = !this.state;
    this.state = state;
    this.syncMachines(state.machines);
    const key = JSON.stringify([state.districts, state.machines.map((m) => [m.x, m.y])]);
    if (key !== this.worldKey) {
      this.worldKey = key;
      this.buildWorld(state);
      if (first) this.target.set((this.bounds.x0 + this.bounds.x1) / 2, 0, (this.bounds.z0 + this.bounds.z1) / 2 + 1);
    }
    this.syncBelts(state);
    this.syncDistricts(state);
    this.syncItems(state.items);
    this.syncBiters(state.items);
    this.syncLabels(state);
    this.syncDrone(state, first);
  }

  // ---------- the Foreman drone ----------

  private syncDrone(state: FactoryState, first: boolean) {
    const f = state.foreman;
    const at = this.byId(f?.targetId) ?? this.ofType("steam")[0] ?? this.ofType("splitter")[0];
    const p = at ? this.machinePos(at) : this.target.clone();
    this.droneTo.set(p.x, at ? (LABEL_Y[at.type] ?? 2) + 1.6 : 4, p.z + (at ? 0.4 : 0));
    if (first) this.drone.g.position.copy(this.droneTo);
    if (this.droneLabel) this.setLabel(this.droneLabel, "SPARK", f?.thinking ? "thinking…" : (f?.tool ?? "foreman"));
  }

  private droneMode(): DroneMode {
    if (this.state?.foreman?.thinking) return "THINKING";
    if (this.drone.g.position.distanceTo(this.droneTo) > 0.3) return "FLYING";
    return this.state?.foreman?.targetId ? "WORKING" : "IDLE";
  }

  // ---------- positions ----------

  private machinePos(m: Pick<Machine, "x" | "y">) {
    return new THREE.Vector3(m.x * CELL, 0, m.y * CELL);
  }

  private byId(id: string | undefined) {
    return id ? this.state?.machines.find((m) => m.id === id) : undefined;
  }

  private ofType(t: Machine["type"]) {
    return this.state?.machines.filter((m) => m.type === t) ?? [];
  }

  // ---------- world: island, districts, scenery ----------

  private buildWorld(state: FactoryState) {
    for (const d of this.districts.values()) this.dropLabel(d.label);
    this.districts.clear();
    this.world.clear();
    this.waterTextures = [];
    this.rocks = [];

    const ms = state.machines.map((m) => this.machinePos(m));
    let x0 = Math.min(-8, ...ms.map((p) => p.x - 2.5));
    let x1 = Math.max(8, ...ms.map((p) => p.x + 2.5));
    let z1 = Math.max(4, ...ms.map((p) => p.z + 2.5));
    let z0 = Math.min(-3, ...ms.map((p) => p.z - 2.5));

    // districts: the repo's folders, scaled down and centered behind the line
    const ds = state.districts;
    const maxX = Math.max(1, ...ds.map((d) => d.x + d.w));
    const maxY = Math.max(1, ...ds.map((d) => d.y + d.h));
    const S = Math.min(0.6, Math.max(0.35, 24 / maxX));
    const left = -(maxX * S) / 2;
    const back = DISTRICT_FRONT - maxY * S;
    for (const d of ds) {
      const w = Math.max(1.4, d.w * S - 0.4);
      const dep = Math.max(1.4, d.h * S - 0.4);
      const cx = left + (d.x + d.w / 2) * S;
      const cz = back + (d.y + d.h / 2) * S;
      const model = makeDistrict(w, dep, Math.ceil(d.files / 3), d.name.length);
      model.group.position.set(cx, 0, cz);
      this.world.add(model.group);
      const label = this.addLabel(model.group, model.labelY);
      this.districts.set(d.name, { name: d.name, roof: model.roof, center: new THREE.Vector3(cx, 0, cz), label, files: d.files });
      x0 = Math.min(x0, cx - w / 2 - 1.5);
      x1 = Math.max(x1, cx + w / 2 + 1.5);
      z0 = Math.min(z0, cz - dep / 2 - 1.5);
    }

    const w = x1 - x0, d = z1 - z0;
    const island = makeIsland(w, d);
    island.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.world.add(island);
    this.waterTextures.push(makeWaterfall(this.world, x0 + w * 0.72, z1 + 0.06, 0, 1.4));
    this.waterTextures.push(makeWaterfall(this.world, x1 + 0.06, z0 + d * 0.4, Math.PI / 2, 1.2));
    for (let i = 0; i < 9; i++) {
      const r = mesh(
        new THREE.DodecahedronGeometry(0.4 + rnd() * 0.9, 0),
        mat(0x2f3760),
        x0 - 3 + rnd() * (w + 6),
        -6 - rnd() * 8,
        z0 - 3 + rnd() * (d + 6),
        this.world,
      );
      this.rocks.push({ r, y: r.position.y, k: rnd() * 6 });
    }

    Object.assign(this.bounds, { x0, x1, z0, z1 });
    const half = Math.max(w, d) / 2 + 6;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  // ---------- machines ----------

  private syncMachines(machines: Machine[]) {
    const seen = new Set<string>();
    for (const m of machines) {
      seen.add(m.id);
      let v = this.machines.get(m.id);
      const rebuild = v && (v.machine.type !== m.type || v.machine.harness !== m.harness);
      if (v && rebuild) this.removeMachine(m.id);
      v = this.machines.get(m.id);
      if (!v) {
        const power = this.state?.power.find((p) => p.id === m.powerId || (m.type !== "assembler" && p.id === m.id));
        const built = buildModel(m, power);
        v = { built, machine: m, label: this.addLabel(built.g, LABEL_Y[m.type] ?? 1.6), art: "IDLE" };
        this.machines.set(m.id, v);
        this.scene.add(built.g);
      }
      v.machine = m;
      v.built.g.position.copy(this.machinePos(m));
    }
    for (const id of [...this.machines.keys()]) if (!seen.has(id)) this.removeMachine(id);
  }

  private removeMachine(id: string) {
    const v = this.machines.get(id);
    if (!v) return;
    this.scene.remove(v.built.g);
    if (v.label) this.dropLabel(v.label);
    this.machines.delete(id);
  }

  // ---------- belts ----------

  // An L-shaped route from one machine's side to the next, like the prototype's belts.
  private route(a: THREE.Vector3, b: THREE.Vector3): Pt[] {
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.abs(dx) >= Math.abs(dz)) {
      const sx = Math.sign(dx) || 1;
      const p0: Pt = [a.x + sx * 1.2, a.z], p3: Pt = [b.x - sx * 1.2, b.z];
      if (Math.abs(dz) < 0.01) return [p0, p3];
      const mx = (p0[0] + p3[0]) / 2;
      return [p0, [mx, a.z], [mx, b.z], p3];
    }
    const sz = Math.sign(dz) || 1;
    const p0: Pt = [a.x, a.z + sz * 1.2], p3: Pt = [b.x, b.z - sz * 1.2];
    if (Math.abs(dx) < 0.01) return [p0, p3];
    const mz = (p0[1] + p3[1]) / 2;
    return [p0, [a.x, mz], [b.x, mz], p3];
  }

  // Rejected work loops back over the top of the line, on a pink belt.
  private reworkRoute(insp: THREE.Vector3, asm: THREE.Vector3): Pt[] {
    const lane = Math.min(insp.z, asm.z) - 2.3;
    return [
      [insp.x, insp.z - 1.2],
      [insp.x, lane],
      [asm.x, lane],
      [asm.x, asm.z - 1.2],
    ];
  }

  private layBelt(p: Path, tint?: number) {
    for (const g of p.segs) {
      const t = rep(tex().belt, (g.L + 0.7) * 1.4, 1);
      this.beltTextures.push(t);
      const top = own(tint ?? 0xffffff);
      top.map = t;
      const side = mat(0x1d2026);
      const b = box(g.L + 0.7, 0.18, 0.7, [side, side, top, side, side, side], (g.x1 + g.x2) / 2, tint ? 0.13 : 0.09, (g.z1 + g.z2) / 2, this.beltGroup);
      b.rotation.y = -Math.atan2(g.z2 - g.z1, g.x2 - g.x1);
      b.castShadow = false;
    }
  }

  private syncBelts(state: FactoryState) {
    const key = JSON.stringify([state.belts, state.machines.map((m) => [m.id, m.type, m.x, m.y])]);
    if (key === this.beltKey) return;
    this.beltKey = key;
    this.beltGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.beltGroup.clear();
    this.beltTextures = [];
    this.paths.clear();
    for (const b of state.belts) {
      const from = this.byId(b.from), to = this.byId(b.to);
      if (!from || !to) continue;
      const p = pathOf(this.route(this.machinePos(from), this.machinePos(to)));
      this.paths.set(`${b.from}>${b.to}`, p);
      this.layBelt(p);
      // an inspector sends failures back to whichever assembler fed it
      if (to.type === "inspector" && from.type === "assembler") {
        const r = pathOf(this.reworkRoute(this.machinePos(to), this.machinePos(from)));
        this.paths.set(`rework:${to.id}>${from.id}`, r);
        this.layBelt(r, 0xff9a90);
      }
    }
  }

  private beltBetween(fromType: Machine["type"], to: Machine | undefined): Path | undefined {
    if (!to) return undefined;
    const b = this.state?.belts.find((x) => x.to === to.id && this.byId(x.from)?.type === fromType);
    return b ? this.paths.get(`${b.from}>${b.to}`) : undefined;
  }

  private beltFrom(from: Machine | undefined, toType: Machine["type"]): Path | undefined {
    if (!from) return undefined;
    const b = this.state?.belts.find((x) => x.from === from.id && this.byId(x.to)?.type === toType);
    return b ? this.paths.get(`${b.from}>${b.to}`) : undefined;
  }

  // ---------- districts ----------

  private syncDistricts(state: FactoryState) {
    for (const d of this.districts.values()) {
      const here = state.items.filter((i) => i.district === d.name && i.state !== "launched");
      const rework = here.some((i) => i.state === "rejected");
      const sentry = here.some((i) => i.source === "sentry" && (i.state === "ore" || i.state === "queued"));
      const busy = here.some((i) => i.state === "working" || i.state === "inspecting" || i.state === "queued");
      const status = sentry ? "under attack" : rework ? "rework" : busy ? "busy" : "healthy";
      d.roof.color.setHex(sentry || rework ? 0xd94a3f : busy ? 0xe39a2f : 0x4fae73);
      this.setLabel(d.label, d.name === "/" ? "(ROOT)" : `/${d.name.toUpperCase()}`, `${d.files} files · ${status}`, sentry || rework);
    }
  }

  // ---------- items ----------

  private assemblerFor(item: Item): Machine | undefined {
    const own = this.byId(item.machineId);
    if (own?.type === "assembler") return own;
    const asms = this.ofType("assembler");
    if (!asms.length) return undefined;
    let h = 0;
    for (const c of item.id) h = (h * 31 + c.charCodeAt(0)) | 0;
    return asms[Math.abs(h) % asms.length];
  }

  // Decide where an item goes when it enters a new state.
  private plan(v: ItemView, item: Item, index: number) {
    const jitter = (((index * 7) % 5) - 2) * 0.22;
    const ore = this.ofType("ore_deposit")[0];
    const splitter = this.ofType("splitter")[0];
    const asm = this.assemblerFor(item);
    const insp = this.ofType("inspector")[0];
    const pad = this.ofType("launch_pad")[0];
    v.path = null;
    v.rest = null;
    v.s = 0;
    switch (item.state) {
      case "ore":
        if (ore) v.rest = this.machinePos(ore).add(new THREE.Vector3(jitter, 0.75, -jitter * 0.8));
        break;
      case "queued": {
        const into = splitter && asm ? (this.paths.get(`${splitter.id}>${asm.id}`) ?? this.beltFrom(splitter, "assembler")) : undefined;
        const p = join(this.beltFrom(ore, "splitter"), into);
        if (p.len) {
          v.path = p;
          v.stopAt = Math.max(0, p.len - 0.4 - (index % 4) * 0.45);
        } else if (asm) v.rest = this.machinePos(asm).add(new THREE.Vector3(-1.4, 0.4, 0));
        break;
      }
      case "working":
        if (asm) v.rest = this.machinePos(asm).add(new THREE.Vector3(0, 1.85, 0));
        break;
      case "inspecting": {
        const p = (asm && insp && this.paths.get(`${asm.id}>${insp.id}`)) || this.beltBetween("assembler", insp);
        if (p) (v.path = p), (v.stopAt = p.len);
        if (insp) v.rest = this.machinePos(insp).add(new THREE.Vector3(0, 1.5, 0));
        break;
      }
      case "rejected": {
        const p = asm && insp ? this.paths.get(`rework:${insp.id}>${asm.id}`) : undefined;
        if (p) (v.path = p), (v.stopAt = p.len);
        else if (insp) v.rest = this.machinePos(insp).add(new THREE.Vector3(0, 0.45, -1.4));
        break;
      }
      case "passed":
      case "on_pad": {
        const p = this.beltBetween("inspector", pad);
        if (p) (v.path = p), (v.stopAt = p.len);
        if (pad) {
          const a = index * 2.1;
          v.rest = this.machinePos(pad).add(new THREE.Vector3(Math.cos(a) * 1.15, 0.55, Math.sin(a) * 1.15));
        }
        break;
      }
      case "launched":
        break;
    }
  }

  private syncItems(items: Item[]) {
    const live = new Set<string>();
    items.forEach((item, i) => {
      if (item.state === "launched") {
        if (!this.launched.has(item.id)) {
          this.launched.add(item.id);
          this.launchUntil = this.t + LAUNCH_SECONDS;
        }
        return;
      }
      live.add(item.id);
      let v = this.items.get(item.id);
      if (!v) {
        const m = box(0.32, 0.32, 0.32, own(KIND_COLOR[item.kind]), 0, -50, 0, this.scene);
        v = { mesh: m, state: null, path: null, s: 0, stopAt: 0, rest: null };
        this.items.set(item.id, v);
      }
      (v.mesh.material as THREE.MeshPhongMaterial).color.setHex(KIND_COLOR[item.kind]);
      (v.mesh.material as THREE.MeshPhongMaterial).emissive.setHex(item.state === "passed" || item.state === "on_pad" ? 0x14402a : 0);
      if (v.state !== item.state) {
        const fresh = v.state === null;
        v.state = item.state;
        this.plan(v, item, i);
        // a new item appears at the start of its route instead of flying in
        if (fresh) {
          if (v.path) {
            const [x, z] = pointAt(v.path, 0);
            v.mesh.position.set(x, 0.4, z);
          } else if (v.rest) v.mesh.position.copy(v.rest);
        }
      }
    });
    for (const [id, v] of this.items) if (!live.has(id)) (this.scene.remove(v.mesh), this.items.delete(id));
  }

  // Sentry errors that nobody has picked up yet show up as biters on their district.
  private syncBiters(items: Item[]) {
    const want = items.filter((i) => i.source === "sentry" && (i.state === "ore" || i.state === "queued"));
    const ids = new Set(want.map((i) => i.id));
    for (const i of want) {
      if (this.biters.has(i.id)) continue;
      const biter = buildBiter({ variant: ["MEDIUM · ERROR", 0xff5e52, 1] });
      biter.g.scale.setScalar(0.8);
      const d = this.districts.get(i.district);
      const c = d?.center ?? new THREE.Vector3();
      biter.g.position.set(c.x + (rnd() - 0.5) * 6, 0, this.bounds.z0 + 0.8);
      this.scene.add(biter.g);
      this.biters.set(i.id, { biter, district: i.district, attacking: false });
    }
    for (const [id, b] of this.biters) if (!ids.has(id)) (this.scene.remove(b.biter.g), this.biters.delete(id));
  }

  // ---------- Item Lab states ----------

  // Turn the factory's state into the state each Item Lab model animates.
  private artState(m: Machine): string {
    const s = this.state!;
    const items = s.items;
    const has = (st: Item["state"]) => items.some((i) => i.state === st);
    const power = s.power.find((p) => p.id === m.id || p.id === m.powerId);
    const feeding = s.machines.some((x) => x.powerId === m.id && x.state === "working");
    switch (m.type) {
      case "assembler":
        return m.state === "working" ? "WORKING" : m.state === "blocked" ? "BLOCKED" : "IDLE";
      case "splitter":
        return m.state === "working" || has("ore") || has("queued") ? "SORTING" : "IDLE";
      case "inspector":
        return has("rejected") ? "REJECT" : has("inspecting") ? "SCANNING" : has("passed") || has("on_pad") ? "PASS" : "SCANNING";
      case "launch_pad":
        return this.t < this.launchUntil ? "LAUNCH" : has("on_pad") || has("passed") ? "COUNTDOWN" : "IDLE";
      case "ore_deposit":
        return items.some((i) => i.state === "ore") ? "RICH" : "DEPLETED";
      case "steam":
        if (power && !power.online) return "OVERLOAD";
        return feeding || s.machines.some((x) => x.type === "assembler" && x.state === "working") ? "RUNNING" : "IDLE";
      case "solar":
        return power && (!power.online || power.level <= 0.05) ? "CAPPED" : "SUNNY";
      case "battery": {
        const lvl = power?.level ?? 1;
        if (lvl <= 0.05) return "EMPTY";
        if (feeding) return "DRAINING";
        return lvl >= 0.95 ? "FULL" : "CHARGING";
      }
      case "geothermal":
        return power && !power.online ? "OVERHEAT" : feeding ? "INFERENCE" : "IDLE";
      case "turret": // tests guarding a district; it fires while Sentry biters are on it
        return items.some((i) => i.source === "sentry" && i.district === m.district && (i.state === "ore" || i.state === "queued")) ? "FIRING" : "SCANNING";
      default:
        return "IDLE";
    }
  }

  // ---------- labels ----------

  private addLabel(obj: THREE.Object3D, y: number): Label {
    const el = document.createElement("div");
    el.className = "maplabel";
    const title = document.createElement("b");
    const sub = document.createElement("i");
    el.append(title, sub);
    this.labelRoot.appendChild(el);
    const l = { obj, y, el, title, sub };
    this.labels.add(l);
    return l;
  }

  private dropLabel(l: Label) {
    l.el.remove();
    this.labels.delete(l);
  }

  private setLabel(l: Label, title: string, sub: string, hot = false) {
    if (l.title.textContent !== title) l.title.textContent = title;
    if (l.sub.textContent !== sub) l.sub.textContent = sub;
    l.el.classList.toggle("hot", hot);
  }

  private syncLabels(state: FactoryState) {
    const power = new Map(state.power.map((p) => [p.id, p]));
    const count = (pred: (i: Item) => boolean) => state.items.filter(pred).length;
    for (const v of this.machines.values()) {
      const m = v.machine;
      if (!v.label) continue;
      const blocked = m.state === "blocked";
      const st = m.state === "working" ? " · working" : blocked ? " · blocked" : "";
      const p = m.powerId ? power.get(m.powerId) : undefined;
      switch (m.type) {
        case "ore_deposit": {
          const kind = oreKind(m);
          const n = count((i) => i.state === "ore");
          const name = { sentry: "SENTRY", inbox: "INBOX", issues: "ISSUES" }[kind];
          this.setLabel(v.label, name, `${n} waiting`, kind === "sentry" && n > 0);
          break;
        }
        case "splitter":
          this.setLabel(v.label, "SPLITTER", `Spark triage${st}`, blocked);
          break;
        case "assembler":
          this.setLabel(v.label, HARNESS_NAME[m.harness ?? "spark"], `assembler · ${p?.kind ?? "steam"}${st}`, blocked);
          break;
        case "inspector":
          this.setLabel(v.label, "INSPECTOR", `tests + lint${st}`, blocked);
          break;
        case "launch_pad": {
          const n = count((i) => i.state === "on_pad" || i.state === "passed");
          this.setLabel(v.label, "LAUNCH PAD", n ? `${n} PR${n > 1 ? "s" : ""} waiting · merge = launch` : "merge = launch");
          break;
        }
        case "steam":
          this.setLabel(v.label, "STEAM", `${p?.name ?? "Spark"} API · credits`, p ? !p.online : false);
          break;
        case "solar":
          this.setLabel(v.label, "SOLAR", `${p?.name ?? "subscription"} plan`);
          break;
        case "turret":
          this.setLabel(v.label, "TURRET", m.district ? `tests on /${m.district}` : "tests");
          break;
        case "battery":
          this.setLabel(v.label, "BATTERY", `${Math.round((p?.level ?? 1) * 100)}% of plan window`);
          break;
        case "geothermal":
          this.setLabel(v.label, "GEOTHERMAL", p?.name ?? "local GPU");
          break;
        default:
          this.setLabel(v.label, (m.type as string).toUpperCase(), "");
      }
    }
  }

  private placeLabels() {
    const w = this.width, h = this.height;
    for (const l of this.labels) {
      l.obj.getWorldPosition(this.v3);
      this.v3.y += l.y;
      this.v3.project(this.camera);
      const x = ((this.v3.x + 1) / 2) * w, y = ((1 - this.v3.y) / 2) * h;
      const off = x < -60 || x > w + 60 || y < -40 || y > h + 40;
      l.el.style.display = off ? "none" : "flex";
      if (!off) l.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;
    }
  }

  // ---------- loop ----------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t;

    for (const v of this.machines.values()) {
      v.art = this.artState(v.machine);
      v.built.update(t, dt, v.art);
    }
    updateFx(dt);
    for (const b of this.beltTextures) b.offset.x -= dt * 1.3;
    for (const w of this.waterTextures) w.offset.y += dt * 1.6;
    for (const r of this.rocks) r.r.position.y = r.y + Math.sin(t * 0.6 + r.k) * 0.3;

    for (const v of this.items.values()) {
      if (v.path && v.s < v.stopAt) {
        v.s = Math.min(v.stopAt, v.s + ITEM_SPEED * dt);
        const [x, z] = pointAt(v.path, v.s);
        v.mesh.position.set(x, 0.4 + Math.abs(Math.sin(v.s * 3)) * 0.04, z);
      } else if (v.rest) {
        v.mesh.position.lerp(v.rest, 1 - Math.exp(-dt * 5));
      }
      if (v.state === "working") v.mesh.rotation.y += dt * 3;
      else v.mesh.rotation.y = 0;
    }

    for (const b of this.biters.values()) {
      const d = this.districts.get(b.district);
      const p = b.biter.g.position;
      if (d) {
        const to = this.v3.set(d.center.x - p.x, 0, d.center.z - p.z);
        b.attacking = to.length() <= 2.2;
        if (!b.attacking) p.addScaledVector(to.normalize(), dt * 0.9);
        b.biter.g.rotation.y = Math.atan2(to.x, to.z);
      }
      b.biter.update(t, dt, b.attacking ? "ATTACK" : "WALK");
    }

    const dp = this.drone.g.position;
    const toward = this.v3.subVectors(this.droneTo, dp);
    const step = this.reduceMotion ? toward.length() : Math.min(toward.length(), dt * 7);
    if (toward.lengthSq() > 1e-4) {
      dp.addScaledVector(toward.normalize(), step);
      this.drone.g.rotation.y = Math.atan2(toward.x, toward.z);
    }
    this.drone.update(t, dt, this.droneMode());

    const drift = this.reduceMotion ? 0 : 1;
    const dx = Math.sin(t * 0.07) * 0.8 * drift, dz = Math.cos(t * 0.05) * 0.6 * drift;
    const off = new THREE.Vector3(CAM_DIST * Math.cos(TILT) * Math.sin(YAW), CAM_DIST * Math.sin(TILT), CAM_DIST * Math.cos(TILT) * Math.cos(YAW));
    this.camera.position.set(this.target.x + dx + off.x, this.target.y + off.y, this.target.z + dz + off.z);
    this.camera.lookAt(this.target.x + dx, this.target.y, this.target.z + dz);
    this.sun.position.set(this.target.x + 14, 26, this.target.z + 8);
    this.sun.target.position.copy(this.target);

    this.pass.render(this.renderer, this.scene, this.camera);
    this.placeLabels();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const l of this.labels) l.el.remove();
    this.labels.clear();
    this.pass.dispose();
    this.renderer.dispose();
  }
}
