// The factory floor in Three.js, in the style of docs/art-prototype.html: a floating
// island with the repo's districts on stone plinths behind the machine line, belts
// between machines, and items riding the belts as they move through states.
// Machines are the locked Item Lab models (itemlab.js); each frame the scene turns
// FactoryState into the Item Lab state each model animates (WORKING, SORTING, LAUNCH...).

import * as THREE from "three";
import { perf } from "./perf";
import { FrameGovernor } from "./quality";
import { lineFrame } from "./framing";
import { withPlants } from "./plants";
import type { FactoryState, Harness, Item, Machine, PowerSource, Station, StationKind } from "@shiptorio/shared";
import { box, mat, mesh, own, rep, rnd, tex, trimShadows } from "./kit";
import {
  buildAssembler,
  buildBattery,
  buildBiter,
  buildGate,
  buildGeo,
  buildInspector,
  buildLaunchPad,
  buildOre,
  buildCheck,
  buildOrbit,
  buildMeasure,
  buildReview,
  buildRework,
  buildSolar,
  buildSplitter,
  buildSteam,
  buildTurret,
  buildVerify,
  updateFx,
  getSeed,
  setSeed,
  type BuildOpts,
  type Built,
} from "./itemlab";
import { buildDrone, type DroneMode } from "./drone";
import { islandDepth, makeDistrict, makeFloater, makeGlassLake, makeGoldTrim, makeIsland, makeLantern, makeWaterfall } from "./models";

import { buildSatellite, Route, satelliteSpot, type SatelliteSpec, type SatelliteView } from "./empire";
import { disposeOwnedGeometries } from "./disposal";
import { KIND_COLOR, PALETTE } from "./palette";
import { pixelSizeFor, PixelPass } from "./pixel";
import { bakeModel, findDynamic, mergeStatic } from "./bake";

THREE.ColorManagement.enabled = false; // palette hexes render exactly as written

const CELL = 1.8; // world units per machine grid step (Item Lab models are ~3 units wide)
const DISTRICT_FRONT = -4; // districts sit behind the line, front edge here
const YAW = Math.PI / 4; // 45° turn
const TILT = Math.PI / 6; // 30° tilt
const CAM_DIST = 33;
const ZOOM_MIN = 0.4; // zoom > 1 means zoomed out
const ZOOM_MAX = 2.6;
const PORTRAIT_FIT = 0.84; // portrait phones frame the line this much closer than the padded fit
const ITEM_SPEED = 1.6; // world units per second along a belt
// three r155+ lights are physically based; × π matches the prototype's r128 light levels
const LEGACY_LIGHT = Math.PI;
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
  spark: "PLANNER",
  claude_code: "CLAUDE CODE",
  codex: "CODEX",
  cursor: "CURSOR",
  grok: "GROK",
  local: "LOCAL MODEL",
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

export interface Ping {
  key: string;
  title: string; // a few words: "Needs a look", "Ready to launch"
  code?: string; // the part of the codebase: "/web", "src/sync"
  tone?: "warn" | "ok";
  quiet?: boolean; // a small tag on a busy machine (no pulse), not the one thing that needs you
}

interface PingEl {
  key: string;
  el: HTMLButtonElement;
  title: HTMLElement;
  join: HTMLElement; // a hidden " in " so a screen reader says "Needs a look in /api"
  code: HTMLElement;
}

interface Label {
  key?: string; // what hovering or clicking this thing means: a pick id, "d:<district>" or "drone"
  obj: THREE.Object3D;
  y: number;
  el: HTMLDivElement;
  title: HTMLElement;
  sub: HTMLElement;
}

interface MachineView {
  built: Built;
  machine: Machine;
  kind?: StationKind; // set when this inspector-type machine is a gauntlet station
  label?: Label;
  art: string; // the Item Lab state the model is showing
}

interface DistrictView {
  name: string;
  roof: THREE.MeshPhongMaterial;
  center: THREE.Vector3;
  label: Label;
  files: number;
  update: (t: number) => void; // rack lights, fans, signs
}

interface ItemView {
  mesh: THREE.Mesh;
  state: Item["state"] | null;
  at?: string; // machineId when planned, so moving station to station re-plans
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

import { oreKind, ghostSpots, type OreKind, type GhostSource } from "./ghosts";
export { GHOST_SOURCES, ghostSpots, type GhostSource } from "./ghosts";

// Item Lab variants: [name, color, extra?]
const ORE_VARIANT: Record<OreKind, BuildOpts["variant"]> = {
  sentry: ["SENTRY", 0xff5e52],
  inbox: ["INBOX", 0x6fb2ff],
  posthog: ["POSTHOG", 0xf2cf6b],
  issues: ["ISSUES", 0xf2a93b],
};

function solarVariant(name = ""): BuildOpts["variant"] {
  const n = name.toLowerCase();
  if (n.includes("codex") || n.includes("chatgpt")) return ["CODEX", 0xd6dbe3];
  if (n.includes("cursor")) return ["CURSOR", 0x8a8f99];
  if (n.includes("grok")) return ["GROK", 0x30343c];
  return ["CLAUDE", 0xd97757];
}

// The art states each model can play (scene.ts artState/stationArt), for bake.ts to find its moving parts.
const ART_STATES: Partial<Record<Machine["type"] | StationKind, string[]>> = {
  assembler: ["IDLE", "WORKING", "BLOCKED"],
  splitter: ["IDLE", "SORTING"],
  inspector: ["SCANNING", "PASS", "REJECT", "BACKED UP"],
  verify: ["IDLE", "VERIFYING", "PASS", "FAIL", "BACKED UP"],
  review: ["IDLE", "REVIEWING", "APPROVED", "CHANGES", "BACKED UP"],
  merge: ["WAITING", "APPROVED", "BACKED UP", "REJECTED"],
  orbit: ["WATCHING", "ALL CLEAR", "ALERT"],
  launch_pad: ["IDLE", "COUNTDOWN", "LAUNCH", "IDLE"],
  ore_deposit: ["RICH", "DEPLETED"],
  steam: ["IDLE", "RUNNING", "OVERLOAD"],
  solar: ["SUNNY", "CAPPED"],
  battery: ["CHARGING", "FULL", "DRAINING", "EMPTY"],
  geothermal: ["IDLE", "INFERENCE", "OVERHEAT"],
  turret: ["SCANNING", "FIRING"],
};

// A model with its static parts merged (bake.ts). The probe copy is built from the same random
// seed, so it matches the real one and nothing after it shifts.
function bakedItem(key: string, states: string[] | undefined, make: () => Built): Built {
  const before = getSeed();
  const built = make();
  if (!states) return built;
  const after = getSeed();
  return bakeModel(key, built, () => {
    setSeed(before);
    const copy = make();
    setSeed(after);
    return copy;
  }, states);
}

// Only touch the DOM when a value changes; style writes invalidate layout even when equal-looking.
function setStyle(el: HTMLElement, prop: "display" | "transform", v: string) {
  if (el.style[prop] !== v) el.style[prop] = v;
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

// Gauntlet stations are inspector-type machines; the station kind picks the Item Lab model.
const STATION_LABEL_Y: Partial<Record<StationKind, number>> = { verify: 2.8, review: 2.8, merge: 3.2, orbit: 3.4, measure: 2.8 };
const BACKED_UP = 3; // this many waiting at a station and it shows BACKED UP
const CAUGHT_SLAM_MS = 620; // the verify bay's ram slam in the sound (shiptorio:station), so the CAUGHT! lands on it
const FOCUS_ZOOM = 0.5; // how close the camera flies in on a picked machine
// Every launch is the payoff, so the camera flies to the pad, rides the rocket up a little, then eases home.
const LAUNCH_ZOOM = 0.62;
const LAUNCH_RISE = 3.2; // world units the camera climbs with the rocket
const LAUNCH_HOLD = 5.2; // seconds before it eases back to where you were
const clickable = (key: string) => !key.startsWith("d:") && key !== "drone";

// A researched check (shared/src/research.ts) is an inspector frame in its own color, so the line reads
// as CI, then your checks, then the verify bay.
const CHECK_TINT: Record<string, number> = { leftovers: 0x9b8cff, secrets: 0xf2cf6b, types: 0x6cc28c, scope: 0xff9a3c, deps: 0x4fd1c5 };
const INSPECTOR_BLUE = 0x3b82f6;
function tintCheck(built: Built, color: number): Built {
  built.g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const mt = o.material as THREE.MeshPhongMaterial;
    if (mt.color?.getHex() !== INSPECTOR_BLUE) return;
    const own = mt.clone();
    own.color.setHex(color);
    if (own.emissive && own.emissive.getHex() === INSPECTOR_BLUE) own.emissive.setHex(color);
    o.material = own;
  });
  return built;
}

function buildModel(m: Machine, power?: PowerSource, kind?: StationKind): Built {
  if (m.type === "inspector" && m.id.startsWith("check-")) return tintCheck(buildCheck(m.id.slice(6)), CHECK_TINT[m.id.slice(6)] ?? 0x9b8cff);
  if (m.type === "inspector")
    switch (kind) {
      case "verify":
        return buildVerify();
      case "review":
        return buildReview();
      case "merge":
        return buildGate();
      case "orbit":
        return buildOrbit();
      case "measure":
        return buildMeasure();
    }
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

export interface Cosmetics {
  glassLake?: boolean;
  lanterns?: number; // how many are lit: your streak
  goldPad?: boolean;
}

export class FactoryScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
  private readonly pass = new PixelPass();
  private readonly sun = new THREE.DirectionalLight(0xfff0d2, 0.95 * LEGACY_LIGHT);
  private readonly world = new THREE.Group(); // island + districts, rebuilt when districts change
  private readonly beltGroup = new THREE.Group();
  private readonly powerGroup = new THREE.Group(); // power lines from each plant to the assemblers it feeds
  private powerKey = "";
  private cables: { paint: THREE.MeshPhongMaterial; color: THREE.Color; assembler: string }[] = [];
  private readonly machines = new Map<string, MachineView>();
  private readonly districts = new Map<string, DistrictView>();
  private readonly items = new Map<string, ItemView>();
  private readonly biters = new Map<string, BiterView>();
  private readonly ghosts = new Map<GhostSource, { built: Built; label: Label }>();
  private readonly paths = new Map<string, Path>(); // "from>to" and "rework:inspector>assembler"
  private readonly labels = new Set<Label>();
  private beltTextures: THREE.Texture[] = [];
  private waterfalls: ((dt: number, t: number) => void)[] = [];
  private rocks: { r: THREE.Object3D; y: number; k: number }[] = [];
  private readonly launched = new Set<string>();
  private readonly target = new THREE.Vector3();
  private readonly bounds = { x0: -10, x1: 10, z0: -10, z1: 10 };
  // progression unlocks on the island (shared/src/progression.ts), rebuilt with the world
  private cosmetics: Cosmetics = {};
  private cosmeticsKey = "";
  private readonly extras = new THREE.Group();
  private extraTicks: ((t: number) => void)[] = [];

  // the empire: other repos as satellite islands, and the sky rails to them (map/empire.ts)
  private satSpecs: SatelliteSpec[] = [];
  private satKey = "";
  private sats: { view: SatelliteView; label: Label; route: Route; y: number }[] = [];
  private readonly outer = { x0: -10, x1: 10, z0: -10, z1: 10 }; // pan limits: the main island plus satellites
  private zoomMax = ZOOM_MAX;
  private worldKey = "";
  private districtCount = 0;
  private lineKey = "";
  private teachingKeys = new Set<string>();
  private rising: THREE.Object3D[] = []; // new districts climb out of the void (the onboarding scan)
  private glide: THREE.Vector3 | null = null; // camera eases here when the island grows
  private beltKey = "";
  private zoom = 1;
  private width = 1;
  private height = 1;
  private state: FactoryState | null = null;
  private raf = 0;
  private last = performance.now();
  private t = 0;
  private launchUntil = -1;
  private readonly governor = new FrameGovernor(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  private readonly reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  private readonly v3 = new THREE.Vector3();
  // Spark, the Foreman, flying to whatever it's touching
  private readonly drone = bakeModel("drone", buildDrone(), buildDrone, ["IDLE", "FLYING", "WORKING", "THINKING"]) as ReturnType<typeof buildDrone>;
  private readonly droneTo = new THREE.Vector3(0, 4, 0);
  private droneLabel?: Label;
  // the gauntlet: the busiest station glows, and the rework belt runs back to Spark
  private readonly glow = box(3.4, 0.06, 3.4, new THREE.MeshBasicMaterial({ color: 0xf2a93b, transparent: true, opacity: 0.4 }), 0, 0.04, 0);
  private rework?: { built: Built; label: Label };
  // a station's verdict on the item that just left it: the art plays PASS or FAIL for a beat
  private verdicts = new Map<string, { fail: boolean; until: number }>();
  // floating "PASS" / "CAUGHT!" pops over stations, and the shockwave rings when the verify bay catches one
  private pops: { el: HTMLElement; at: THREE.Vector3; until: number }[] = [];
  private shocks: { mesh: THREE.Mesh; born: number }[] = [];
  // labels show on hover, on the picked thing, when hot, or all of them when toggled on
  private hovered?: string;
  private selected?: string;
  private showAll = false;
  private camGoal: { target: THREE.Vector3; zoom: number } | null = null;
  private home: { target: THREE.Vector3; zoom: number } | null = null;
  private launchCam: { back: { target: THREE.Vector3; zoom: number }; t0: number } | null = null;
  private synced = false; // launches already done when the map first loads don't fly the camera
  // where the camera target sits on screen, as a fraction of width/height from center (+x right, +y up).
  // On phones the HUD covers the bottom, so the island and picked things sit higher (or left, on a phone on its side).
  private bias = { x: 0, y: 0 };
  private biasGoal: { x: number; y: number } | null = null;
  private readonly ray = new THREE.Raycaster();
  // in-world pings: a pulsing dot on whatever needs you, plus quiet tags on busy machines, each naming the code it touches
  private pings: PingEl[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly labelRoot: HTMLElement,
    private readonly onPick?: (id: string) => void, // a station id, "m:<machine id>" or "rework"
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.info.autoReset = false; // two renders a frame (scene + pixel pass); perf.ts reads the total
    perf.watch(this.scene);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // the frame governor (quality.ts) says when
    this.scene.background = new THREE.Color(PALETTE.void);

    this.scene.add(new THREE.HemisphereLight(0xd6deff, 0x40344a, 0.6 * LEGACY_LIGHT));
    // cool bounce light from below, so the island's rock underside keeps its facets
    const under = new THREE.DirectionalLight(0x9fb2ff, 0.45 * LEGACY_LIGHT);
    under.position.set(10, -6, 14);
    this.scene.add(under);
    this.sun.castShadow = true;
    // phones and low-end machines get a smaller shadow map; the pixel pass hides the difference
    const small = window.matchMedia?.("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.sun.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024);
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target, this.world, this.beltGroup, this.powerGroup, this.drone.g, this.glow);
    this.glow.visible = false;
    this.glow.castShadow = this.glow.receiveShadow = false;
    this.droneLabel = this.addLabel(this.drone.g, 1.3, "drone");
    this.droneLabel.el.classList.add("drone");
    this.loop();
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.applyCamera();
    if (!this.camGoal) this.bias = this.biasFor(!!this.home);
    if (this.state && !this.home && !this.launchCam) this.fitLine(this.state, true);
  }

  // extra lift for whatever sits at the bottom of the screen (the welcome tour's card), as a fraction of height
  private lift = 0;
  private wideShot = false; // the tour's wide shot holds still while rockets launch
  setLift(y: number) {
    this.lift = y;
    this.biasGoal = this.biasFor(!!this.home || !!this.camGoal);
  }

  private biasFor(focused: boolean) {
    if (this.lift) return { x: 0, y: this.lift };
    const phone = this.width <= 760 || this.height <= 500;
    if (!phone) return { x: 0, y: 0 };
    if (this.height <= 500 && this.width > this.height) return { x: focused ? -0.25 : 0, y: 0 }; // panel on the right
    return { x: 0, y: focused ? 0.27 : 0.1 }; // bottom sheet / next-move card below
  }

  // factor > 1 zooms out
  zoomBy(factor: number) {
    this.governor.poke();
    this.dropLaunchCam();
    this.camGoal = null;
    this.zoom = Math.min(this.zoomMax, Math.max(ZOOM_MIN, this.zoom * factor));
    this.applyCamera();
  }

  panBy(dx: number, dy: number) {
    this.governor.poke();
    this.dropLaunchCam();
    this.camGoal = null;
    const k = (this.camera.top - this.camera.bottom) / this.height;
    const right = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
    const down = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW));
    this.target.addScaledVector(right, -dx * k);
    this.target.addScaledVector(down, (-dy * k) / Math.sin(TILT));
    const b = this.outer;
    this.target.x = Math.max(b.x0, Math.min(b.x1, this.target.x));
    this.target.z = Math.max(b.z0, Math.min(b.z1, this.target.z));
  }

  // Zoom out just enough that the whole machine line, ore to launch pad, fits the screen.
  // The HUD floats at the top and bottom edges (no side column), so the line gets the full width.
  private fitLine(state: FactoryState, immediate = false) {
    const frame = lineFrame(state.machines, this.width, this.height, this.baseViewHeight());
    if (!frame) return;
    // portrait phones: the wide line in a narrow screen leaves a tall empty sky, so drop the side padding and
    // let the line's end stations touch the edges; the island around them may bleed off the sides
    const portrait = this.width < this.height && this.width <= 760;
    const zoom = portrait ? Math.max(ZOOM_MIN, frame.zoom * PORTRAIT_FIT) : frame.zoom;
    const goal = { target: new THREE.Vector3(frame.x, 0, frame.z), zoom: Math.min(ZOOM_MAX, zoom) };
    this.glide = null;
    if (this.launchCam) { this.launchCam.back = goal; return; }
    if (this.home) { this.home = goal; return; } // keep a station panel focused; its return view stays current
    if (immediate || this.reduceMotion) { this.target.copy(goal.target); this.zoom = goal.zoom; this.applyCamera(); }
    else this.camGoal = goal;
  }

  // world units shown top to bottom at zoom 1; portrait phones see more so the line isn't cramped
  private baseViewHeight() {
    const a = this.width / this.height;
    return a < 1 ? (24 / a) * 0.78 : 19;
  }

  private applyCamera() {
    const a = this.width / this.height;
    const vh = this.baseViewHeight() * this.zoom;
    Object.assign(this.camera, { left: (-vh * a) / 2, right: (vh * a) / 2, top: vh / 2, bottom: -vh / 2 });
    this.camera.updateProjectionMatrix();
    this.pass.setSize(this.width, this.height, pixelSizeFor(this.zoom));
    this.labelRoot.classList.toggle("far", this.zoom > 1.35); // zoomed out: titles only
  }

  update(raw: FactoryState) {
    // a plant the live server only reported in state.power still gets a building on the map
    const state = withPlants(raw);
    const first = !this.state;
    this.state = state;
    this.syncMachines(state.machines);
    const key = JSON.stringify([state.districts, state.machines.map((m) => [m.x, m.y]), ghostSpots(state)]);
    if (key !== this.worldKey) {
      this.worldKey = key;
      this.buildWorld(state);
      this.buildExtras();
      const center = new THREE.Vector3((this.bounds.x0 + this.bounds.x1) / 2, 0, (this.bounds.z0 + this.bounds.z1) / 2 + 1);
      if (first) this.target.copy(center);
      else if (state.districts.length !== this.districtCount) this.glide = center;
      this.districtCount = state.districts.length;

    }
    const lineKey = JSON.stringify(state.machines.map(m => [m.id, m.x, m.y]));
    if (lineKey !== this.lineKey) { this.lineKey = lineKey; this.fitLine(state, first); }
    this.syncBelts(state);
    this.syncPowerLines(state);
    this.syncDistricts(state);
    this.syncItems(state.items);
    this.synced = true;
    this.syncBiters(state.items);
    this.syncLabels(state);
    this.syncGhosts(state);
    this.syncGauntlet(state);
    this.syncGrowth(state, first);
    this.syncDrone(state, first);
  }

  // The growth loop's payoff: when the measure station calls an experiment, the call pops over it.
  private readonly called = new Set<string>();
  private syncGrowth(state: FactoryState, first: boolean) {
    const st = state.stations?.find((x) => x.kind === "measure");
    const m = st && this.byId(st.machineId);
    for (const e of state.experiments ?? []) {
      if (e.state !== "won" && e.state !== "flat" && e.state !== "lost" && e.state !== "inconclusive") continue;
      if (this.called.has(e.id)) continue;
      this.called.add(e.id);
      if (first || !m) continue;
      const at = this.machinePos(m).setY((STATION_LABEL_Y.measure ?? 2.4) + 0.6);
      const pct = Math.round((e.lift ?? 0) * 100);
      if (e.state === "won") this.pop(at, `+${pct}% LIFT`, "lift", e.step.label, 3.2);
      else if (e.state === "lost") this.pop(at, `${pct}% HURT`, "fail", "roll it back", 3.2);
      else this.pop(at, e.state === "inconclusive" ? "NO CALL" : "NO LIFT", "flat", e.state === "inconclusive" ? "not enough data" : e.step.label, 3.2);
    }
  }

  // ---------- the Foreman drone ----------

  private syncDrone(state: FactoryState, first: boolean) {
    const f = state.foreman;
    const at = this.byId(f?.targetId) ?? this.ofType("steam")[0] ?? this.ofType("splitter")[0];
    const p = at ? this.machinePos(at) : this.target.clone();
    this.droneTo.set(p.x, at ? (LABEL_Y[at.type] ?? 2) + 1.6 : 4, p.z + (at ? 0.4 : 0));
    if (first) this.drone.g.position.copy(this.droneTo);
    if (this.droneLabel) this.setLabel(this.droneLabel, "DRONE", f?.thinking ? "thinking…" : f?.tool && f.targetId ? f.tool.replace(/_/g, " ") : "watching the floor");
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

  private stationAt(machineId: string | undefined): Station | undefined {
    return machineId ? this.state?.stations?.find((st) => st.machineId === machineId) : undefined;
  }

  // What's under a screen point: the key of a labelled thing (machine, station, rework belt, district, drone).
  keyAt(clientX: number, clientY: number, rect: DOMRect): string | undefined {
    this.governor.poke();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const targets = [...this.labels].filter((l) => l.key);
    const hit = this.ray.intersectObjects(targets.map((l) => l.obj), true)[0];
    if (!hit) return undefined;
    for (const l of targets) {
      let x: THREE.Object3D | null = hit.object;
      while (x && x !== l.obj) x = x.parent;
      if (x) return l.key;
    }
    return undefined;
  }

  // The click target under a screen point: a station id, "m:<machine id>" or "rework".
  pick(clientX: number, clientY: number, rect: DOMRect): string | undefined {
    const key = this.keyAt(clientX, clientY, rect);
    return key && clickable(key) ? key : undefined;
  }

  // Hovering shows that thing's label (labels are off by default). Returns whether it's clickable.
  hover(clientX: number, clientY: number, rect: DOMRect): boolean {
    this.hovered = this.keyAt(clientX, clientY, rect);
    return !!this.hovered && clickable(this.hovered);
  }

  clearHover() {
    this.hovered = undefined;
  }

  setTeachingKeys(keys: string[]) {
    this.teachingKeys = new Set(keys);
  }

  setShowAllLabels(on: boolean) {
    this.showAll = on;
  }

  // Pin pings to pick keys (station id, "m:<machine id>", "d:<district>", "rework"). An empty list clears them.
  setPings(list: Ping[]) {
    while (this.pings.length > list.length) this.pings.pop()!.el.remove();
    list.forEach((p, n) => {
      let pe = this.pings[n];
      if (!pe) {
        const el = document.createElement("button");
        el.type = "button";
        const dot = document.createElement("i");
        const tag = document.createElement("span");
        const title = document.createElement("b");
        const code = document.createElement("code");
        const join = document.createElement("span");
        join.className = "sr";
        join.textContent = " in ";
        pe = { key: p.key, el, title, code, join };
        tag.append(title, join, code);
        el.append(dot, tag);
        const me = pe;
        el.addEventListener("click", () => this.onPick?.(me.key));
        this.labelRoot.appendChild(el);
        this.pings.push(pe);
      }
      pe.key = p.key;
      pe.el.className = `mapping${p.quiet ? " quiet" : ""}${p.tone === "ok" ? " ok" : ""}`;
      pe.join.hidden = !p.code;
      if (pe.title.textContent !== p.title) pe.title.textContent = p.title;
      if (pe.code.textContent !== (p.code ?? "")) pe.code.textContent = p.code ?? "";
    });
  }

  // Fly the camera in on a picked thing, or back out to where it was (null).
  focus(key: string | null) {
    this.wideShot = false;
    if (this.launchCam) {
      // you picked something mid-launch: home is where you were before the fly-in
      this.home ??= this.launchCam.back;
      this.dropLaunchCam();
    }
    this.selected = key ?? undefined;
    const l = key ? [...this.labels].find((x) => x.key === key) : undefined;
    if (l) {
      this.home ??= { target: this.target.clone(), zoom: this.zoom };
      l.obj.getWorldPosition(this.v3);
      this.camGoal = { target: new THREE.Vector3(this.v3.x, 0, this.v3.z), zoom: FOCUS_ZOOM };
    } else if (this.home) {
      this.camGoal = this.home;
      this.home = null;
    }
    this.biasGoal = this.biasFor(!!this.home);
  }

  // ---------- the empire ----------

  // Other repos float nearby as satellite islands. Rebuilt only when the set of islands or their
  // districts change; label text updates in place.
  setSatellites(specs: SatelliteSpec[]) {
    this.satSpecs = specs;
    const key = JSON.stringify(specs.map((s) => [s.repo, s.districts.map((d) => d.name), Math.min(6, s.rockets), s.hot]));
    if (key !== this.satKey) {
      this.satKey = key;
      this.layoutSatellites();
    } else for (const sat of this.sats) {
      const sp = specs.find((x) => x.repo === sat.view.repo);
      if (sp) this.setLabel(sat.label, sp.title, sp.sub, sp.hot);
    }
  }

  private clearSatellites() {
    for (const sat of this.sats) {
      this.scene.remove(sat.view.g, sat.route.g);
      disposeOwnedGeometries(sat.view.g);
      sat.route.dispose();
      this.dropLabel(sat.label);
    }
    this.sats = [];
  }

  private layoutSatellites() {
    this.clearSatellites();
    const b = this.bounds;
    const center = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    const mainHalf = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
    Object.assign(this.outer, b);
    this.satSpecs.forEach((spec, i) => {
      const view = buildSatellite(spec, i);
      const at = satelliteSpot(i, this.satSpecs.length, center, mainHalf * 0.8, view.half, YAW);
      view.g.position.copy(at);
      this.scene.add(view.g);
      // the rail leaves the main island's edge toward the satellite and lands on its near rim
      const dir = at.clone().sub(center).setY(0).normalize();
      const from = center.clone().addScaledVector(dir, mainHalf * 0.62).setY(0.6);
      const to = at.clone().addScaledVector(dir, -view.half * 0.7).setY(at.y + 0.6);
      const route = new Route(from, to, spec.hot);
      this.scene.add(route.g);
      const label = this.addLabel(view.g, view.labelY, view.key);
      label.el.classList.add("island");
      this.setLabel(label, spec.title, spec.sub, spec.hot);
      this.sats.push({ view, label, route, y: at.y });
      const r = view.half + 2;
      Object.assign(this.outer, { x0: Math.min(this.outer.x0, at.x - r), x1: Math.max(this.outer.x1, at.x + r), z0: Math.min(this.outer.z0, at.z - r), z1: Math.max(this.outer.z1, at.z + r) });
    });
    this.zoomMax = this.sats.length ? Math.max(ZOOM_MAX, this.empireZoom() * 1.6) : ZOOM_MAX;
  }

  private empireZoom() {
    const b = this.outer;
    const span = (b.x1 - b.x0) * Math.cos(YAW) + (b.z1 - b.z0) * Math.sin(YAW);
    const tall = ((b.x1 - b.x0) * Math.sin(YAW) + (b.z1 - b.z0) * Math.cos(YAW)) * Math.sin(TILT) + 14; // islands hang below their tops
    return Math.max(span / (this.baseViewHeight() * (this.width / this.height)), tall / this.baseViewHeight()) * 1.08;
  }

  // Leave the empire overview: back to the main island's line.
  backToLine() {
    this.wideShot = false;
    if (this.state) this.fitLine(this.state);
  }

  // Pull all the way back so every island shows: the empire overview.
  empireView() {
    this.wideShot = true;
    this.dropLaunchCam();
    this.selected = undefined;
    this.home = null;
    this.glide = null;
    const b = this.outer;
    // the overview sheet sits on the left on wide screens and along the bottom on phones; the islands take the rest
    const phone = this.width <= 760;
    const room = phone ? 0.95 : 1.3;
    this.camGoal = { target: new THREE.Vector3((b.x0 + b.x1) / 2, -2, (b.z0 + b.z1) / 2), zoom: Math.min(this.zoomMax, Math.max(ZOOM_MIN, this.empireZoom() * room)) };
    this.biasGoal = phone ? { x: 0, y: 0.27 } : { x: 0.17, y: 0 };
  }

  // Pull back over the whole island, eased like focus (the welcome tour's wide shots). scale > 1 sits further out.
  overview(scale = 1) {
    this.wideShot = true;
    this.dropLaunchCam();
    this.selected = undefined;
    this.home = null;
    const b = this.bounds;
    const span = (b.x1 - b.x0) * Math.cos(YAW) + (b.z1 - b.z0) * Math.sin(YAW);
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, ((span * (this.width < this.height ? 1.3 : 1.75)) / (this.baseViewHeight() * (this.width / this.height))) * scale));
    this.glide = null;
    this.camGoal = { target: new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2 + 1), zoom };
    this.biasGoal = this.biasFor(true);
  }

  // Fly to the launch pad and follow the rocket up. Skipped when you're looking at something or prefer less motion.
  private flyToLaunch() {
    const pad = this.ofType("launch_pad")[0];
    if (!pad || this.reduceMotion || this.home || this.wideShot) return;
    const back = this.launchCam?.back ?? { target: this.target.clone().setY(0), zoom: this.zoom };
    this.launchCam = { back, t0: this.t };
    const p = this.machinePos(pad);
    this.camGoal = { target: new THREE.Vector3(p.x, 0, p.z), zoom: Math.min(back.zoom, LAUNCH_ZOOM) };
  }

  private dropLaunchCam() {
    if (!this.launchCam) return;
    this.launchCam = null;
    this.target.y = 0;
  }

  // ---------- world: island, districts, scenery ----------

  private buildWorld(state: FactoryState) {
    for (const d of this.districts.values()) this.dropLabel(d.label);
    this.districts.clear();
    this.world.clear();
    this.waterfalls = [];
    this.rocks = [];
    this.rising = [];

    const ms = [...state.machines, ...ghostSpots(state)].map((m) => this.machinePos(m));
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
      const model = makeDistrict(w, dep, Math.ceil(d.files / 3), d.name);
      trimShadows(model.group);
      // district ticks are pure functions of time, so they can be swept on the real thing
      // (only same-material merges: the scene recolors the shared roof by district health)
      mergeStatic(model.group, findDynamic(model.group, (check) => { for (let k = 0; k < 120; k++) (model.update(k * 0.37), check()); }), false);
      const isNew = ds.indexOf(d) >= this.districtCount; // districtCount is still the old count here
      model.group.position.set(cx, isNew ? -2.5 : 0, cz);
      if (isNew) this.rising.push(model.group);
      this.world.add(model.group);
      const label = this.addLabel(model.group, model.labelY, `d:${d.name}`);
      this.districts.set(d.name, { name: d.name, roof: model.roof, center: new THREE.Vector3(cx, 0, cz), label, files: d.files, update: model.update });
      x0 = Math.min(x0, cx - w / 2 - 1.5);
      x1 = Math.max(x1, cx + w / 2 + 1.5);
      z0 = Math.min(z0, cz - dep / 2 - 1.5);
    }

    const w = x1 - x0, d = z1 - z0;
    const island = makeIsland(w, d);
    trimShadows(island);
    mergeStatic(island); // nothing on the island moves; waterfalls hang off this.world
    island.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.world.add(island);
    // waterfalls sit just past the moss cap's bulge and fall a bit past the rock's tip
    const fall = islandDepth(w, d) * 0.9;
    this.waterfalls.push(makeWaterfall(this.world, x0 + w * 0.72, z1 + 0.6 + d * 0.025, 0, 1.4, fall));
    this.waterfalls.push(makeWaterfall(this.world, x1 + 0.6 + w * 0.025, z0 + d * 0.4, Math.PI / 2, 1.2, fall * 0.8));
    // mossy chunks floating around the island, kept clear of its footprint
    const spots = [[-1, 0.7], [1.06, 0.9], [-0.9, -0.8], [0.8, -1.1], [0.1, 1.25], [-1.15, -0.1]];
    spots.forEach(([fx, fz], i) => {
      const r = makeFloater(0.6 + ((i * 37) % 5) * 0.15, 31 + i);
      mergeStatic(r);
      r.position.set((x0 + x1) / 2 + fx * (w / 2 + 3), -2 - ((i * 53) % 7) * 1.1, (z0 + z1) / 2 + fz * (d / 2 + 3));
      this.world.add(r);
      this.rocks.push({ r, y: r.position.y, k: i * 1.3 });
    });

    Object.assign(this.bounds, { x0, x1, z0, z1 });
    this.layoutSatellites();
    const half = Math.max(w, d) / 2 + 6;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  /** Switch progression cosmetics on or off: the glass lake, streak lanterns, gold pad trim. */
  setCosmetics(c: Cosmetics | undefined) {
    const key = JSON.stringify(c ?? {});
    if (key === this.cosmeticsKey) return;
    this.cosmeticsKey = key;
    this.cosmetics = c ?? {};
    if (this.state) this.buildExtras();
  }

  private buildExtras() {
    if (!this.extras.parent) this.scene.add(this.extras);
    this.extras.clear();
    this.extraTicks = [];
    const { x0, x1, z0, z1 } = this.bounds;
    const w = x1 - x0, d = z1 - z0;
    const c = this.cosmetics;
    if (c.glassLake) {
      // front left of the island, clear of the waterfall at 72% and half sunk past the rim
      const r = Math.min(2.2, Math.max(1.5, w * 0.08));
      const lake = makeGlassLake(r, islandDepth(w, d) * 0.3);
      lake.group.position.set(x0 + w * 0.2, 0, z1 + 0.6 - r * 0.7);
      this.extras.add(lake.group);
      this.extraTicks.push(lake.tick);
    }
    if (c.lanterns) {
      // along the front rim, left to right, then up the right side
      const n = Math.min(14, c.lanterns);
      const glows: THREE.MeshPhongMaterial[] = [];
      for (let i = 0; i < n; i++) {
        const l = makeLantern();
        const f = (i + 0.5) / 14;
        const front = f < 0.6;
        const x = front ? x0 + 1 + (w - 2) * (f / 0.6) : x1 + 0.2;
        const z = front ? z1 + 0.25 : z1 - 1 - (d - 2) * ((f - 0.6) / 0.4);
        l.group.position.set(x, 0, z);
        this.extras.add(l.group);
        glows.push(l.glow);
      }
      this.extraTicks.push((t) => glows.forEach((g, i) => g.emissiveIntensity = 0.85 + Math.sin(t * 3 + i * 1.7) * 0.15));
    }
    const pad = this.ofType("launch_pad")[0];
    if (c.goldPad && pad) {
      const p = this.machinePos(pad);
      const trim = makeGoldTrim(2.8);
      trim.position.set(p.x, 0, p.z);
      this.extras.add(trim);
    }
  }

  // ---------- machines ----------

  private syncMachines(machines: Machine[]) {
    const seen = new Set<string>();
    for (const m of machines) {
      seen.add(m.id);
      const kind = m.type === "inspector" ? this.stationAt(m.id)?.kind : undefined;
      let v = this.machines.get(m.id);
      const rebuild = v && (v.machine.type !== m.type || v.machine.harness !== m.harness || v.kind !== kind);
      if (v && rebuild) this.removeMachine(m.id);
      v = this.machines.get(m.id);
      if (!v) {
        const power = this.state?.power.find((p) => p.id === m.powerId || (m.type !== "assembler" && p.id === m.id));
        const key = [m.type, kind, m.id.startsWith("check-") ? m.id : "", m.harness, m.tier, power?.name].join("|");
        const built = bakedItem(key, (kind && ART_STATES[kind]) || ART_STATES[m.type], () => {
          const b = buildModel(m, power, kind);
          trimShadows(b.g);
          return b;
        });
        const y = (kind && STATION_LABEL_Y[kind]) ?? LABEL_Y[m.type] ?? 1.6;
        const pick = kind ? this.stationAt(m.id)!.id : `m:${m.id}`;
        v = { built, machine: m, kind, label: this.addLabel(built.g, y, pick), art: "IDLE" };
        this.machines.set(m.id, v);
        this.scene.add(built.g);
      }
      v.machine = m;
      v.built.g.position.copy(this.machinePos(m));
    }
    for (const id of [...this.machines.keys()]) if (!seen.has(id)) this.removeMachine(id);
  }

  private syncGhosts(state: FactoryState) {
    const spots = ghostSpots(state);
    for (const [kind, g] of this.ghosts)
      if (!spots.some((sp) => sp.kind === kind)) {
        this.scene.remove(g.built.g);
        this.dropLabel(g.label);
        this.ghosts.delete(kind);
      }
    // they wait quietly until the first rocket, then ask: did that help anyone?
    const ask = (state.metrics?.rockets ?? 0) > 0;
    for (const sp of spots) {
      let g = this.ghosts.get(sp.kind);
      if (!g) {
        const built = buildOre({ variant: ORE_VARIANT[sp.kind] });
        built.g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone() as THREE.Material;
          mat.transparent = true;
          mat.opacity = 0.35;
          mat.depthWrite = false;
          mesh.material = mat;
          mesh.castShadow = false;
        });
        g = { built, label: this.addLabel(built.g, LABEL_Y.ore_deposit ?? 2.6, `src:${sp.kind}`) };
        this.ghosts.set(sp.kind, g);
        this.scene.add(built.g);
      }
      g.built.g.position.copy(this.machinePos(sp));
      this.setLabel(g.label, sp.kind.toUpperCase(), "empty mine · tap to connect", ask);
    }
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
      const seg = new THREE.Group();
      seg.position.set((g.x1 + g.x2) / 2, tint ? 0.13 : 0.09, (g.z1 + g.z2) / 2);
      seg.rotation.y = -Math.atan2(g.z2 - g.z1, g.x2 - g.x1);
      this.beltGroup.add(seg);
      const len = g.L + 0.7;
      box(len, 0.18, 0.7, [side, side, top, side, side, side], 0, 0, 0, seg).castShadow = false;
      // steel side rails with a support bracket every metre, like a real conveyor frame
      for (const z of [-0.37, 0.37]) {
        box(len, 0.07, 0.05, mat(tint ? 0xb5463d : 0x6b7280), 0, 0.1, z, seg).castShadow = false;
        for (let x = -len / 2 + 0.3; x < len / 2 - 0.1; x += 1.0) box(0.08, 0.16, 0.08, mat(0x3a3f47), x, 0.02, z * 1.08, seg).castShadow = false;
      }
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
    const gauntlet = (state.stations ?? []).filter((st) => st.kind !== "orbit" && st.kind !== "measure").map((st) => this.byId(st.machineId)).filter((m) => !!m);
    for (const b of state.belts) {
      const from = this.byId(b.from), to = this.byId(b.to);
      if (!from || !to) continue;
      const p = pathOf(this.route(this.machinePos(from), this.machinePos(to)));
      this.paths.set(`${b.from}>${b.to}`, p);
      this.layBelt(p);
      // no gauntlet: an inspector sends failures back to whichever assembler fed it
      if (!gauntlet.length && to.type === "inspector" && from.type === "assembler") {
        const r = pathOf(this.reworkRoute(this.machinePos(to), this.machinePos(from)));
        this.paths.set(`rework:${to.id}>${from.id}`, r);
        this.layBelt(r, 0xff9a90);
      }
    }
    this.layRework(gauntlet);
    mergeStatic(this.beltGroup); // belts only scroll their texture; rails and brackets never move
  }

  // Each solar or geothermal plant runs a power line on two poles to every assembler it feeds. The line sags
  // between the poles and glows in the plant's color while that assembler is building.
  private syncPowerLines(state: FactoryState) {
    const links = state.machines
      .filter((a) => a.type === "assembler" && a.powerId)
      .map((a) => [a, state.machines.find((p) => p.id === a.powerId && (p.type === "solar" || p.type === "geothermal"))] as const)
      .filter((l): l is readonly [Machine, Machine] => !!l[1]);
    const key = JSON.stringify(links.map(([a, p]) => [a.id, a.x, a.y, p.id, p.type, p.x, p.y]));
    if (key === this.powerKey) return;
    this.powerKey = key;
    this.powerGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.powerGroup.clear();
    this.cables = [];
    const H = 2.1, SAG = 0.4;
    for (const [a, p] of links) {
      const color = p.type === "geothermal" ? HARNESS_COLOR.local : solarVariant(state.power.find((x) => x.id === p.id)?.name)![1];
      const A = this.machinePos(p), B = this.machinePos(a);
      const dir = B.clone().sub(A).setY(0);
      if (dir.length() < 3) continue;
      dir.normalize();
      const ends = [A.clone().addScaledVector(dir, 1.45), B.clone().addScaledVector(dir, -1.45)];
      const yaw = Math.atan2(dir.x, dir.z);
      for (const e of ends) {
        box(0.12, H, 0.12, mat(0x3a3f47), e.x, H / 2, e.z, this.powerGroup).castShadow = false;
        const arm = box(0.56, 0.07, 0.09, mat(0x8a94a3), e.x, H - 0.05, e.z, this.powerGroup);
        arm.rotation.y = yaw;
        arm.castShadow = false;
        box(0.1, 0.14, 0.1, mat(color), e.x, H + 0.06, e.z, this.powerGroup).castShadow = false; // insulator in the plant's color
      }
      const paint = own(0x2b2f36);
      const n = Math.max(4, Math.round(ends[0].distanceTo(ends[1]) / 0.6));
      const at = (k: number) => ends[0].clone().lerp(ends[1], k).setY(H + 0.12 - SAG * 4 * k * (1 - k));
      for (let i = 0; i < n; i++) {
        const p0 = at(i / n), p1 = at((i + 1) / n);
        const seg = box(0.07, 0.07, p0.distanceTo(p1) + 0.02, paint, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, this.powerGroup);
        seg.lookAt(p1);
        seg.castShadow = false;
      }
      this.cables.push({ paint, color: new THREE.Color(color), assembler: a.id });
    }
  }

  // Every station drops its fails onto one red belt that runs behind the line, back to Spark's splitter.
  private layRework(stations: Machine[]) {
    const spl = this.ofType("splitter")[0];
    if (!stations.length || !spl) {
      if (this.rework) (this.scene.remove(this.rework.built.g), this.dropLabel(this.rework.label), (this.rework = undefined));
      return;
    }
    const sp = this.machinePos(spl);
    const lane = Math.min(sp.z, ...stations.map((m) => this.machinePos(m).z)) - 2.3;
    const far = Math.max(...stations.map((m) => this.machinePos(m).x));
    for (const m of stations) {
      const a = this.machinePos(m);
      const r = pathOf([[a.x, a.z - 1.2], [a.x, lane], [sp.x, lane], [sp.x, sp.z - 1.2]]);
      this.paths.set(`rework:${m.id}`, r);
      // the farthest station lays the whole belt; the rest only their drop onto it
      this.layBelt(a.x === far ? r : pathOf([[a.x, a.z - 1.2], [a.x, lane]]), 0xff7a70);
    }
    if (!this.rework) {
      const built = bakedItem("rework", ["FLOWING", "CLOGGED"], buildRework);
      built.g.scale.setScalar(0.7);
      this.scene.add(built.g);
      this.rework = { built, label: this.addLabel(built.g, 0.9, "rework") };
    }
    // the rework model sits on the belt behind the first two stations
    const xs = stations.map((m) => this.machinePos(m).x).sort((a, b) => a - b);
    this.rework.built.g.position.set((xs[0] + (xs[1] ?? xs[0])) / 2, 0.05, lane);
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
        const st = this.byId(item.machineId);
        if (st?.type === "inspector" && this.stationAt(st.id)) {
          const b = this.state?.belts.find((x) => x.to === st.id);
          const p = b && this.paths.get(`${b.from}>${b.to}`);
          if (p) (v.path = p), (v.stopAt = p.len);
          v.rest = this.pile(st, item);
          break;
        }
        const p = (asm && insp && this.paths.get(`${asm.id}>${insp.id}`)) || this.beltBetween("assembler", insp);
        if (p) (v.path = p), (v.stopAt = p.len);
        if (insp) v.rest = this.machinePos(insp).add(new THREE.Vector3(0, 1.5, 0));
        break;
      }
      case "rejected": {
        const p = this.paths.get(`rework:${item.machineId}`) ?? (asm && insp ? this.paths.get(`rework:${insp.id}>${asm.id}`) : undefined);
        if (p) (v.path = p), (v.stopAt = p.len);
        else if (insp) v.rest = this.machinePos(insp).add(new THREE.Vector3(0, 0.45, -1.4));
        break;
      }
      case "passed":
      case "on_pad": {
        const gate = this.byId(item.machineId);
        if (gate && this.stationAt(gate.id)?.kind === "merge") {
          const b = this.state?.belts.find((x) => x.to === gate.id);
          const p = b && this.paths.get(`${b.from}>${b.to}`);
          if (p) (v.path = p), (v.stopAt = p.len);
          v.rest = this.pile(gate, item);
          break;
        }
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

  // Where an item waits at a station: the first on top being checked, the rest piled in front.
  private pile(m: Machine, item: Item) {
    const here = this.state!.items.filter((i) => i.machineId === m.id && (i.state === "inspecting" || i.state === "on_pad"));
    const k = Math.max(0, here.findIndex((i) => i.id === item.id));
    const base = this.machinePos(m);
    if (k === 0) return base.add(new THREE.Vector3(0, 1.5, 0));
    return base.add(new THREE.Vector3(-1.5 + ((k - 1) % 2) * 0.36, 0.35 + Math.floor((k - 1) / 2) * 0.34, 1.0));
  }

  private syncItems(items: Item[]) {
    const live = new Set<string>();
    items.forEach((item, i) => {
      if (item.state === "launched") {
        if (!this.launched.has(item.id)) {
          this.launched.add(item.id);
          this.launchUntil = this.t + LAUNCH_SECONDS;
          if (this.synced) this.flyToLaunch();
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
      if (v.state !== item.state || v.at !== item.machineId) {
        const fresh = v.state === null;
        if (v.state === "inspecting" && v.at) this.verdict(v.at, item);
        v.state = item.state;
        v.at = item.machineId;
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
      case "inspector": {
        const st = this.stationAt(m.id);
        if (st) return this.stationArt(st, m);
        return has("rejected") ? "REJECT" : has("inspecting") ? "SCANNING" : has("passed") || has("on_pad") ? "PASS" : "SCANNING";
      }
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

  // An item just left a station: it passed if it moved on, failed if it went onto the rework belt.
  private verdict(machineId: string, item: Item) {
    const st = this.stationAt(machineId);
    const m = this.byId(machineId);
    if (!st || !m || st.kind === "orbit" || st.kind === "measure") return;
    const fail = item.state === "rejected";
    this.verdicts.set(machineId, { fail, until: this.t + (fail ? 3 : 1.6) });
    const at = this.machinePos(m).setY((STATION_LABEL_Y[st.kind] ?? 2.4) + 0.6);
    if (fail && st.kind === "verify") return this.caught(st, m, item, at);
    this.pop(at, fail ? "FAIL" : "PASS", fail ? "fail" : "pass");
  }

  // The demo moment: CI waved a fix through and the verify bay caught it anyway.
  // The bay goes red at once (with the sound's klaxon); the slam lands on the sound's ram hit, CAUGHT_SLAM_MS later.
  private caught(st: Station, m: Machine, item: Item, at: THREE.Vector3) {
    window.dispatchEvent(new CustomEvent("shiptorio:caught", { detail: { itemId: item.id, title: item.title, stationId: st.id } }));
    setTimeout(() => this.slam(m, item, at), CAUGHT_SLAM_MS);
  }

  private slam(m: Machine, item: Item, at: THREE.Vector3) {
    const why = item.scars?.at(-1)?.reason ?? item.failure;
    this.pop(at, "CAUGHT!", "caught", !why ? "passed CI · failed verify" : /\bCI\b/.test(why) ? why : `passed CI · ${why}`, 3.2);
    if (this.reduceMotion) return;
    const base = this.machinePos(m);
    for (const delay of [0, 0.18, 0.36]) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 32), new THREE.MeshBasicMaterial({ color: delay ? 0xffb340 : 0xff5e52, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(base.x - 0.35, 0.2, base.z - 0.2);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shocks.push({ mesh, born: this.t + delay });
    }
    const flash = document.createElement("div");
    flash.className = "caught-flash";
    this.labelRoot.appendChild(flash);
    setTimeout(() => flash.remove(), 1200);
    document.body.classList.remove("caught-shake");
    void document.body.offsetWidth; // restart the shake if two land close together
    document.body.classList.add("caught-shake");
    setTimeout(() => document.body.classList.remove("caught-shake"), 700);
  }

  private pop(at: THREE.Vector3, text: string, kind: string, sub?: string, life = 1.6) {
    const el = document.createElement("div");
    el.className = `mappop ${kind}`;
    const b = document.createElement("b");
    b.textContent = text;
    el.append(b);
    if (sub) {
      const i = document.createElement("i");
      i.textContent = sub;
      el.append(i);
    }
    el.style.animationDuration = `${life}s`;
    this.labelRoot.appendChild(el);
    this.pops.push({ el, at, until: this.t + life });
  }

  private stationArt(st: Station, m: Machine): string {
    const items = this.state!.items;
    const v = this.verdicts.get(m.id);
    if (v && this.t < v.until) {
      const k = st.kind;
      if (v.fail) return k === "verify" ? "FAIL" : k === "review" ? "CHANGES" : k === "merge" ? "REJECTED" : "REJECT";
      return k === "review" || k === "merge" ? "APPROVED" : "PASS";
    }
    const failing = items.some((i) => i.state === "rejected" && i.machineId === m.id);
    const busy = st.wip > 0;
    const backed = st.wip >= BACKED_UP;
    switch (st.kind) {
      case "verify":
        return failing ? "FAIL" : backed ? "BACKED UP" : busy ? "VERIFYING" : "IDLE";
      case "review":
        return failing ? "CHANGES" : backed ? "BACKED UP" : busy ? "REVIEWING" : "IDLE";
      case "merge":
        return failing ? "REJECTED" : backed ? "BACKED UP" : this.t < this.launchUntil ? "APPROVED" : "WAITING";
      case "orbit":
        return st.lastLog && !st.lastLog.ok ? "ALERT" : busy ? "WATCHING" : "ALL CLEAR";
      case "measure": {
        // the growth loop: the newest experiment past its launch sets the dial
        const exp = this.state!.experiments?.find((e) => e.launchedAt);
        return !exp ? "IDLE" : exp.state === "won" ? "LIFT" : exp.state === "lost" ? "HURT" : exp.state === "flat" || exp.state === "inconclusive" ? "NO LIFT" : "MEASURING";
      }
      default:
        return failing ? "REJECT" : backed ? "BACKED UP" : "SCANNING";
    }
  }

  // ---------- labels ----------

  private addLabel(obj: THREE.Object3D, y: number, key?: string): Label {
    const el = document.createElement("div");
    el.className = "maplabel";
    const pick = key && clickable(key) ? key : undefined;
    if (pick && this.onPick) {
      el.classList.add("pick");
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.addEventListener("click", () => this.onPick!(pick));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") (e.preventDefault(), this.onPick!(pick));
      });
    }
    const title = document.createElement("b");
    const sub = document.createElement("i");
    el.append(title, sub);
    this.labelRoot.appendChild(el);
    const l = { key, obj, y, el, title, sub };
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
          // count this deposit's own source, and ore Spark hasn't started building yet
          if (kind === "posthog") {
            const n = count((i) => (i.source as string) === "posthog" && (i.state === "ore" || i.state === "queued"));
            this.setLabel(v.label, "POSTHOG", `${n} waiting · user signals`);
            break;
          }
          const src = { sentry: "sentry", inbox: "inbox", issues: "github_issue" }[kind];
          const n = count((i) => i.source === src && (i.state === "ore" || i.state === "queued"));
          const name = { sentry: "SENTRY", inbox: "INBOX", issues: "ISSUES" }[kind];
          this.setLabel(v.label, name, `${n} waiting`, kind === "sentry" && n > 0);
          break;
        }
        case "splitter":
          this.setLabel(v.label, "SPLITTER", `triage${st}`, blocked);
          break;
        case "assembler":
          if (!m.harness && !m.powerId) this.setLabel(v.label, "ASSEMBLER", "no power · sign in to build", true);
          else this.setLabel(v.label, HARNESS_NAME[m.harness ?? "spark"], `assembler · ${p?.kind ?? "steam"}${st}`, blocked);
          break;
        case "inspector": {
          const sta = this.stationAt(m.id);
          if (!sta) this.setLabel(v.label, "INSPECTOR", `tests + lint${st}`, blocked);
          else if (sta.kind === "measure") {
            const exp = state.experiments?.find((e) => e.launchedAt);
            const sub = !exp ? "waiting for a growth launch" : exp.state === "measuring" ? `day ${Math.min(exp.windowDays, Math.floor(exp.daysWatched ?? 0) + 1)} of ${exp.windowDays} · ${exp.step.label}` : exp.state === "won" ? `+${Math.round((exp.lift ?? 0) * 100)}% lift · ${exp.step.label}` : exp.state === "lost" ? `hurt · ${exp.step.label}` : exp.state === "inconclusive" ? `not enough data · ${exp.step.label}` : `no lift · ${exp.step.label}`;
            this.setLabel(v.label, "MEASURE", sub, exp?.state === "measuring");
          } else if (sta.kind === "orbit") this.setLabel(v.label, "ORBIT WATCH", sta.wip ? `watching ${sta.wip} launch${sta.wip > 1 ? "es" : ""}` : sta.lastLog?.ok === false ? "caught a comeback" : "all clear");
          else {
            const hot = state.bottleneck?.stationId === sta.id;
            this.setLabel(v.label, sta.name.toUpperCase(), `${sta.wip} in line · caught ${sta.caughtThisWeek}`, hot);
          }
          break;
        }
        case "launch_pad": {
          const n = count((i) => i.state === "on_pad" || i.state === "passed");
          this.setLabel(v.label, "LAUNCH PAD", n ? `${n} PR${n > 1 ? "s" : ""} waiting · merge = launch` : "merge = launch");
          break;
        }
        case "steam":
          this.setLabel(v.label, "STEAM", `${p?.name ?? "Planner"} · credits`, p ? !p.online : false);
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
        case "geothermal": {
          const plant = power.get(m.id);
          const busy = state.machines.some((x) => x.powerId === m.id && x.state === "working");
          this.setLabel(v.label, "GEOTHERMAL", plant && !plant.online ? `${plant.name} · offline` : `${plant?.name ?? "your computer"} · free${busy ? " · running" : ""}`, !!plant && !plant.online);
          break;
        }
        default:
          this.setLabel(v.label, (m.type as string).toUpperCase(), "");
      }
    }
  }

  private syncGauntlet(state: FactoryState) {
    const id = state.bottleneck?.stationId;
    const hot = id ? this.byId(state.stations?.find((x) => x.id === id)?.machineId) : undefined;
    this.glow.visible = !!hot;
    if (hot) this.glow.position.copy(this.machinePos(hot)).setY(0.04);
    if (this.rework) {
      const n = state.items.filter((i) => i.state === "rejected").length;
      this.setLabel(this.rework.label, "REWORK BELT", `back to planner · ${n} item${n === 1 ? "" : "s"}`, n > 0);
    }
  }

  private placePops() {
    const w = this.width, h = this.height;
    this.pops = this.pops.filter((p) => {
      if (this.t > p.until) return (p.el.remove(), false);
      this.v3.copy(p.at).project(this.camera);
      p.el.style.left = `${((this.v3.x + 1) / 2) * w}px`;
      p.el.style.top = `${((1 - this.v3.y) / 2) * h}px`;
      return true;
    });
  }

  // Reads every label's size once, then writes every position: interleaving the two forced a
  // layout per label per frame. Labels that would overlap stack upward instead.
  private placeLabels() {
    const w = this.width, h = this.height;
    let teachingRow = 0;
    const placed: { el: HTMLElement; x: number; y: number; w: number; h: number }[] = [];
    for (const l of this.labels) {
      l.obj.getWorldPosition(this.v3);
      this.v3.y += l.y;
      this.v3.project(this.camera);
      const x = ((this.v3.x + 1) / 2) * w;
      let y = ((1 - this.v3.y) / 2) * h;
      const teaching = !!l.key && this.teachingKeys.has(l.key);
      l.el.classList.toggle("teaching", teaching);
      if (teaching) y -= (teachingRow++ % 3) * 24;
      const shown = teaching || this.showAll || l.el.classList.contains("hot") || l.el.classList.contains("island") || (!!l.key && (l.key === this.hovered || l.key === this.selected));
      const off = !shown || x < -60 || x > w + 60 || y < -40 || y > h + 40;
      setStyle(l.el, "display", off ? "none" : "flex");
      if (!off) placed.push({ el: l.el, x, y, w: 0, h: 0 });
    }
    const tags: { el: HTMLElement; x: number; y: number; w: number; h: number }[] = [];
    for (const pe of this.pings) {
      const l = [...this.labels].find((x) => x.key === pe.key);
      if (!l) {
        setStyle(pe.el, "display", "none");
        continue;
      }
      l.obj.getWorldPosition(this.v3);
      this.v3.y += l.y * 0.55;
      this.v3.project(this.camera);
      const x = ((this.v3.x + 1) / 2) * w;
      const y = ((1 - this.v3.y) / 2) * h;
      const off = x < -40 || x > w + 40 || y < -20 || y > h + 20;
      setStyle(pe.el, "display", off ? "none" : "flex");
      if (!off) tags.push({ el: pe.el, x, y, w: 0, h: 0 });
    }
    // one layout for everything, including where the HUD sits (its chips and the Check in / Build
    // lens move around on phones, and the notch pushes them down)
    for (const p of [...placed, ...tags]) (p.w = p.el.offsetWidth), (p.h = p.el.offsetHeight);
    const hud = [...document.querySelectorAll(".topbar > *, .lens")].map((e) => e.getBoundingClientRect());
    const canvasTop = this.labelRoot.getBoundingClientRect().top;
    const below = (x: number, half: number) =>
      hud.reduce((m, r) => (r.right > x - half && r.left < x + half && r.top < canvasTop + h / 2 ? Math.max(m, r.bottom - canvasTop + 4) : m), 0);
    // a label that would hide under the HUD stops just below it; then, top to bottom, a label that
    // overlaps one already placed moves down under it
    for (const p of placed) p.y = Math.max(p.y, below(p.x, p.w / 2) + p.h);
    placed.sort((a, b) => a.y - b.y);
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      for (let j = 0; j < i; j++) {
        const q = placed[j];
        if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && p.y > q.y - q.h && p.y - p.h < q.y) p.y = q.y + p.h + 2;
      }
      setStyle(p.el, "transform", `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) translate(-50%,-100%)`);
    }
    for (const t of tags) {
      const y = Math.max(t.y, below(t.x, t.w / 2) + t.h / 2);
      setStyle(t.el, "transform", `translate(${Math.round(t.x)}px,${Math.round(y)}px)`);
      // keep the tag on screen: flip it to the dot's left near the right edge
      t.el.classList.toggle("flip", t.x + t.w > w - 8);
    }
  }

  // ---------- loop ----------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (!this.governor.draw(now, !!(this.camGoal || this.glide || this.launchCam || this.biasGoal))) return;
    perf.frame(now, this.renderer.info, this.governor.tier);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t;

    for (const v of this.machines.values()) {
      v.art = this.artState(v.machine);
      v.built.update(t, dt, v.art);
    }
    if (this.rework) this.rework.built.update(t, dt, (this.state?.items.filter((i) => i.state === "rejected").length ?? 0) >= BACKED_UP ? "CLOGGED" : "FLOWING");
    if (this.glow.visible) (this.glow.material as THREE.MeshBasicMaterial).opacity = this.reduceMotion ? 0.4 : 0.25 + Math.abs(Math.sin(t * 2.4)) * 0.3;
    if (this.launchCam) {
      const age = t - this.launchCam.t0;
      if (age > LAUNCH_HOLD) {
        this.camGoal = this.launchCam.back;
        this.launchCam = null;
      } else {
        // climb after ignition, ease out as the rocket leaves the frame
        const k = Math.min(1, Math.max(0, (age - 0.8) / 2.4));
        const rise = LAUNCH_RISE * k * k * (3 - 2 * k) * (age > LAUNCH_SECONDS + 0.6 ? Math.max(0, 1 - (age - LAUNCH_SECONDS - 0.6)) : 1);
        if (this.camGoal) this.camGoal.target.y = rise;
        else this.target.y = rise;
      }
    }
    if (this.camGoal) {
      const k = this.reduceMotion ? 1 : 1 - Math.exp(-dt * 4);
      this.target.lerp(this.camGoal.target, k);
      this.zoom += (this.camGoal.zoom - this.zoom) * k;
      if (this.target.distanceTo(this.camGoal.target) < 0.02 && Math.abs(this.zoom - this.camGoal.zoom) < 0.005) {
        this.target.copy(this.camGoal.target);
        this.zoom = this.camGoal.zoom;
        this.camGoal = null;
      }
      this.applyCamera();
    }
    updateFx(dt);
    for (const b of this.beltTextures) b.offset.x -= dt * 1.3;
    for (const c of this.cables) {
      const live = this.state?.machines.find((m) => m.id === c.assembler)?.state === "working";
      const k = live ? (this.reduceMotion ? 0.7 : 0.45 + 0.4 * Math.abs(Math.sin(t * 3.2))) : 0.12;
      c.paint.emissive.copy(c.color).multiplyScalar(k);
    }
    for (const w of this.waterfalls) w(dt, t);
    for (const e of this.extraTicks) e(t);
    for (const d of this.districts.values()) d.update(t);
    for (const r of this.rocks) r.r.position.y = r.y + Math.sin(t * 0.6 + r.k) * 0.3;
    for (const sat of this.sats) {
      sat.view.g.position.y = sat.y + (this.reduceMotion ? 0 : Math.sin(t * 0.4 + sat.view.bob) * 0.25);
      if (!this.reduceMotion) sat.route.update(t);
    }
    for (const g of this.rising) g.position.y = Math.min(0, g.position.y + dt * 4);
    this.rising = this.rising.filter((g) => g.position.y < 0);
    if (this.biasGoal) {
      const k = this.reduceMotion ? 1 : Math.min(1, dt * 5);
      this.bias.x += (this.biasGoal.x - this.bias.x) * k;
      this.bias.y += (this.biasGoal.y - this.bias.y) * k;
      if (Math.abs(this.biasGoal.x - this.bias.x) + Math.abs(this.biasGoal.y - this.bias.y) < 1e-3) {
        this.bias = this.biasGoal;
        this.biasGoal = null;
      }
    }
    if (this.glide) {
      this.target.lerp(this.glide, Math.min(1, dt * 3));
      if (this.target.distanceTo(this.glide) < 0.05) this.glide = null;
    }

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
    let dx = Math.sin(t * 0.07) * 0.25 * drift, dz = Math.cos(t * 0.05) * 0.2 * drift;
    const off = new THREE.Vector3(CAM_DIST * Math.cos(TILT) * Math.sin(YAW), CAM_DIST * Math.sin(TILT), CAM_DIST * Math.cos(TILT) * Math.cos(YAW));
    // look a little right/down of the target so the target itself shows left/up (see bias)
    const vw = this.camera.right - this.camera.left, vh = this.camera.top - this.camera.bottom;
    const sr = -this.bias.x * vw, sd = (this.bias.y * vh) / Math.sin(TILT);
    dx += sr * Math.cos(YAW) + sd * Math.sin(YAW);
    dz += -sr * Math.sin(YAW) + sd * Math.cos(YAW);
    this.camera.position.set(this.target.x + dx + off.x, this.target.y + off.y, this.target.z + dz + off.z);
    this.camera.lookAt(this.target.x + dx, this.target.y, this.target.z + dz);
    this.sun.position.set(this.target.x + 14, 26, this.target.z + 8);
    this.sun.target.position.copy(this.target);

    for (const sh of this.shocks) {
      const age = t - sh.born;
      sh.mesh.visible = age >= 0;
      sh.mesh.scale.setScalar(1 + Math.max(0, age) * 7);
      (sh.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - age * 1.1);
      if (age > 0.85) (this.scene.remove(sh.mesh), sh.mesh.geometry.dispose());
    }
    this.shocks = this.shocks.filter((sh) => t - sh.born <= 0.85);

    this.renderer.shadowMap.needsUpdate = this.governor.shadows();
    this.pass.render(this.renderer, this.scene, this.camera);
    this.placeLabels();
    this.placePops();
    perf.work(performance.now() - now);
  };

  dispose() {
    this.clearSatellites();
    for (const pe of this.pings) pe.el.remove();
    for (const p of this.pops) p.el.remove();
    cancelAnimationFrame(this.raf);
    for (const l of this.labels) l.el.remove();
    this.labels.clear();
    this.glow.geometry.dispose();
    this.pass.dispose();
    this.renderer.dispose();
  }
}
