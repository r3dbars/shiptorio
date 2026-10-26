// The factory floor in Three.js: districts from the repo as stone pads on a floating island,
// the machine line below them, belts between machines, and items riding the line.
// Placeholder buildings: Justin's art prototype (docs/art-prototype.html) replaces these.

import * as THREE from "three";
import type { FactoryState, Item, Machine } from "@shiptorio/shared";
import { KIND_COLOR, PALETTE } from "./palette";
import { PIXEL, PixelPass } from "./pixel";

THREE.ColorManagement.enabled = false; // palette hexes render exactly as written

const LINE_GAP = 1.6; // world units between machine grid cells
const YAW = Math.PI / 4; // 45° turn
const TILT = (30 * Math.PI) / 180; // 30° tilt

const mat = (color: number, emissive = 0) =>
  new THREE.MeshPhongMaterial({ color, emissive, flatShading: true, shininess: 0, specular: 0x000000 });

function box(w: number, h: number, d: number, color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, color: number, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function placed<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

interface MachineView {
  group: THREE.Group;
  spin?: THREE.Object3D; // turns while working
  beacon?: THREE.Mesh;
  rocket?: THREE.Object3D;
}

function buildMachine(m: Machine): MachineView {
  const g = new THREE.Group();
  const v: MachineView = { group: g };
  switch (m.type) {
    case "ore_deposit": {
      const crater = cyl(0.7, 0.55, 0.15, PALETTE.dark, 10);
      crater.position.y = 0.08;
      g.add(crater);
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), mat(PALETTE.blue, 0x10306a));
        const a = (i / 5) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35);
        c.rotation.z = 0.3 * Math.cos(a);
        g.add(c);
      }
      break;
    }
    case "splitter": {
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const leg = box(0.08, 0.5, 0.08, PALETTE.steel);
        leg.position.set(x, 0.25, z);
        g.add(leg);
      }
      const silo = cyl(0.45, 0.45, 0.8, PALETTE.amber, 10);
      silo.position.y = 0.9;
      g.add(silo);
      const dish = new THREE.Group();
      const plate = cyl(0.3, 0.05, 0.1, PALETTE.white, 8);
      plate.rotation.x = 0.6;
      plate.position.y = 0.1;
      dish.add(plate);
      dish.position.y = 1.35;
      g.add(dish);
      v.spin = dish;
      break;
    }
    case "assembler": {
      g.add(placed(box(1.2, 0.2, 1.0, PALETTE.steel), 0, 0.1, 0));
      const wall = box(1.2, 0.8, 0.12, PALETTE.dark);
      wall.position.set(0, 0.6, -0.45);
      g.add(wall);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), mat(PALETTE.green, 0x1a5a33));
      screen.position.set(0, 0.65, -0.38);
      g.add(screen);
      const bench = box(0.6, 0.3, 0.4, PALETTE.cliff);
      bench.position.set(0, 0.35, 0.1);
      g.add(bench);
      const arm = new THREE.Group();
      const base = cyl(0.1, 0.12, 0.2, PALETTE.amber);
      base.position.y = 0.1;
      const boom = box(0.08, 0.08, 0.55, PALETTE.amber);
      boom.position.set(0, 0.25, 0.25);
      arm.add(base, boom);
      arm.position.set(0.4, 0.2, 0.25);
      g.add(arm);
      v.spin = arm;
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat(PALETTE.red, 0x000000));
      beacon.position.set(-0.5, 1.05, -0.45);
      g.add(beacon);
      v.beacon = beacon;
      break;
    }
    case "inspector": {
      const tunnel = box(1.0, 0.7, 0.8, PALETTE.white);
      tunnel.position.y = 0.35;
      g.add(tunnel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 12), mat(PALETTE.blue, 0x123a66));
      ring.position.set(0.52, 0.4, 0);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      v.spin = ring;
      const bin = box(0.4, 0.3, 0.4, PALETTE.red);
      bin.position.set(0, 0.15, 0.85);
      g.add(bin);
      break;
    }
    case "launch_pad": {
      g.add(placed(cyl(0.8, 0.9, 0.15, PALETTE.dark, 8), 0, 0.08, 0));
      const gantry = box(0.15, 1.8, 0.15, PALETTE.red);
      gantry.position.set(-0.55, 0.9, 0);
      g.add(gantry);
      const rocket = new THREE.Group();
      const body = cyl(0.18, 0.18, 1.0, PALETTE.white);
      body.position.y = 0.5;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 8), mat(PALETTE.red));
      nose.position.y = 1.17;
      rocket.add(body, nose);
      rocket.position.y = 0.15;
      g.add(rocket);
      v.rocket = rocket;
      break;
    }
    case "steam": {
      for (const x of [-0.35, 0.35]) {
        const tank = cyl(0.28, 0.28, 0.6, PALETTE.steel, 10);
        tank.position.set(x, 0.3, 0.2);
        g.add(tank);
      }
      const tower = box(0.3, 1.4, 0.3, PALETTE.cliff);
      tower.position.set(0, 0.7, -0.35);
      g.add(tower);
      const flare = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 5), mat(PALETTE.amber, 0xa05010));
      flare.position.set(0, 1.55, -0.35);
      g.add(flare);
      v.beacon = flare;
      break;
    }
    default:
      g.add(placed(box(0.8, 0.6, 0.8, PALETTE.steel), 0, 0.3, 0));
  }
  return v;
}

function beltTexture() {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 4;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2a2f45";
  ctx.fillRect(0, 0, 16, 4);
  ctx.fillStyle = "#4a5270";
  ctx.fillRect(0, 0, 4, 4);
  ctx.fillRect(8, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export class FactoryScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 200);
  private readonly pass = new PixelPass();
  private readonly world = new THREE.Group(); // island + districts, rebuilt when districts change
  private readonly machines = new Map<string, MachineView>();
  private readonly belts = new THREE.Group();
  private readonly items = new Map<string, THREE.Mesh>();
  private readonly beltTex = beltTexture();
  private readonly target = new THREE.Vector3();
  private readonly launches: { rocket: THREE.Object3D; t: number }[] = [];
  private districtsKey = "";
  private lineZ = 0;
  private lineX = 0;
  private zoom = 1;
  private width = 1;
  private height = 1;
  private state: FactoryState | null = null;
  private launched = new Set<string>();
  private raf = 0;
  private last = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.scene.background = new THREE.Color(PALETTE.void);

    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2f45, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(-20, 40, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
    this.scene.add(sun, sun.target);
    this.scene.add(this.world, this.belts);
    // District labels are drawn to canvases; redraw once the pixel font has loaded.
    document.fonts?.ready.then(() => {
      this.districtsKey = "";
      if (this.state) this.update(this.state);
    });
    this.loop();
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.applyCamera();
  }

  zoomBy(factor: number) {
    this.zoom = Math.min(4, Math.max(0.3, this.zoom * factor));
    this.applyCamera();
  }

  panBy(dx: number, dy: number) {
    // screen pixels → world units on the ground plane
    const unitsPerPx = (2 * this.viewHeight()) / this.height;
    const right = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
    const fwd = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW));
    this.target.addScaledVector(right, -dx * unitsPerPx);
    this.target.addScaledVector(fwd, -dy * unitsPerPx / Math.sin(TILT));
    this.applyCamera();
  }

  private viewHeight() {
    return 12 / this.zoom;
  }

  private applyCamera() {
    const h = this.viewHeight();
    const aspect = this.width / this.height;
    Object.assign(this.camera, { left: -h * aspect, right: h * aspect, top: h, bottom: -h });
    this.camera.updateProjectionMatrix();
    const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(TILT), Math.sin(TILT), Math.cos(YAW) * Math.cos(TILT));
    this.camera.position.copy(this.target).addScaledVector(dir, 60);
    this.camera.lookAt(this.target);
    // Sharper when zoomed out: pixels shrink with zoom, never below 1px.
    const pixel = Math.max(1, Math.round(PIXEL.size * Math.min(1, this.zoom)));
    this.pass.setSize(this.width, this.height, pixel);
  }

  update(state: FactoryState) {
    const first = !this.state;
    this.state = state;
    const key = JSON.stringify(state.districts);
    if (key !== this.districtsKey) {
      this.districtsKey = key;
      this.buildWorld(state);
      if (first) {
        this.target.set(this.lineX, 0, this.lineZ - 3);
        this.applyCamera();
      }
    }
    this.syncMachines(state.machines);
    this.syncBelts(state);
    this.syncItems(state.items);
  }

  private buildWorld(state: FactoryState) {
    this.world.clear();
    const ds = state.districts;
    const maxX = Math.max(10, ...ds.map((d) => d.x + d.w));
    const maxY = Math.max(4, ...ds.map((d) => d.y + d.h));
    this.lineX = maxX / 2;
    this.lineZ = maxY + 5;
    const minLineX = this.lineX - 8 * LINE_GAP;
    const maxLineX = this.lineX + 8 * LINE_GAP;

    // the floating island
    const x0 = Math.min(-2, minLineX - 2), x1 = Math.max(maxX + 2, maxLineX + 2);
    const z0 = -2, z1 = this.lineZ + 7;
    const ground = box(x1 - x0, 0.6, z1 - z0, PALETTE.moss);
    ground.position.set((x0 + x1) / 2, -0.3, (z0 + z1) / 2);
    const cliff = box(x1 - x0 - 0.4, 3, z1 - z0 - 0.4, PALETTE.cliff);
    cliff.position.set((x0 + x1) / 2, -2.1, (z0 + z1) / 2);
    this.world.add(ground, cliff);

    for (const d of ds) {
      const pad = box(d.w + 0.6, 0.3, d.h + 0.6, PALETTE.stone);
      pad.position.set(d.x + d.w / 2, 0.15, d.y + d.h / 2);
      this.world.add(pad);
      // one little block per ~4 files, so bigger districts read as denser
      const blocks = Math.min(d.w * d.h, Math.ceil(d.files / 4));
      for (let i = 0; i < blocks; i++) {
        const b = box(0.7, 0.3 + ((i * 37) % 5) * 0.12, 0.7, i % 3 ? PALETTE.steel : PALETTE.cliff);
        b.position.set(d.x + (i % d.w) + 0.5, 0.45, d.y + Math.floor(i / d.w) + 0.5);
        this.world.add(b);
      }
      this.world.add(this.label(d.name === "/" ? "(root)" : d.name, d.x + d.w / 2, d.y - 0.6));
    }
  }

  private label(text: string, x: number, z: number) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = "16px Silkscreen, monospace";
    c.width = Math.ceil(ctx.measureText(text).width) + 12;
    c.height = 22;
    ctx.fillStyle = "rgba(27,36,72,0.85)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = "16px Silkscreen, monospace";
    ctx.fillStyle = "#e8ecf1";
    ctx.fillText(text, 6, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    s.scale.set(c.width / 22, 1, 1);
    s.position.set(x, 1.2, z);
    s.renderOrder = 10;
    return s;
  }

  private machinePos(m: Pick<Machine, "x" | "y">) {
    return new THREE.Vector3(this.lineX + m.x * LINE_GAP, 0, this.lineZ + m.y * LINE_GAP);
  }

  private syncMachines(machines: Machine[]) {
    const seen = new Set<string>();
    for (const m of machines) {
      seen.add(m.id);
      let v = this.machines.get(m.id);
      if (!v) {
        v = buildMachine(m);
        this.machines.set(m.id, v);
        this.scene.add(v.group);
      }
      v.group.position.copy(this.machinePos(m));
      v.group.userData.state = m.state;
    }
    for (const [id, v] of this.machines) if (!seen.has(id)) (this.scene.remove(v.group), this.machines.delete(id));
  }

  private syncBelts(state: FactoryState) {
    this.belts.clear();
    for (const b of state.belts) {
      const from = state.machines.find((m) => m.id === b.from);
      const to = state.machines.find((m) => m.id === b.to);
      if (!from || !to) continue;
      const a = this.machinePos(from), c = this.machinePos(to);
      const len = a.distanceTo(c);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.35), mat(0xffffff));
      (mesh.material as THREE.MeshPhongMaterial).map = this.beltTex;
      this.beltTex.repeat.set(1, 1);
      mesh.position.copy(a).add(c).multiplyScalar(0.5).setY(0.08);
      mesh.rotation.y = -Math.atan2(c.z - a.z, c.x - a.x);
      mesh.receiveShadow = true;
      this.belts.add(mesh);
    }
  }

  private itemTarget(item: Item, index: number): THREE.Vector3 | null {
    const s = this.state!;
    const byType = (t: Machine["type"]) => s.machines.find((m) => m.type === t);
    const at = (m: Machine | undefined, dx = 0, dz = 0) => (m ? this.machinePos(m).add(new THREE.Vector3(dx, 0, dz)) : null);
    const jitter = ((index * 7) % 5) * 0.18 - 0.36;
    switch (item.state) {
      case "ore":
        return at(byType("ore_deposit"), jitter, -jitter)?.setY(0.45) ?? null;
      case "queued": {
        const splitter = byType("splitter"), asm = byType("assembler");
        if (!splitter || !asm) return at(asm);
        return this.machinePos(splitter).lerp(this.machinePos(asm), 0.35 + (index % 4) * 0.12).setY(0.25);
      }
      case "working":
        return at(s.machines.find((m) => m.id === item.machineId) ?? byType("assembler"), 0, 0.1)?.setY(0.6) ?? null;
      case "inspecting":
        return at(byType("inspector"))?.setY(0.4) ?? null;
      case "rejected":
        return at(byType("inspector"), jitter * 0.5, 0.85)?.setY(0.4) ?? null;
      case "passed":
      case "on_pad":
        return at(byType("launch_pad"), 0.55 + jitter * 0.4, 0.55)?.setY(0.25) ?? null;
      case "launched":
        return null;
    }
  }

  private syncItems(items: Item[]) {
    const live = new Set<string>();
    items.forEach((item, i) => {
      if (item.state === "launched") {
        if (!this.launched.has(item.id)) {
          this.launched.add(item.id);
          const pad = [...this.machines.values()].find((v) => v.rocket);
          if (pad?.rocket) this.launches.push({ rocket: pad.rocket, t: 0 });
        }
        return;
      }
      live.add(item.id);
      let mesh = this.items.get(item.id);
      if (!mesh) {
        mesh = box(0.28, 0.28, 0.28, KIND_COLOR[item.kind]);
        this.items.set(item.id, mesh);
        this.scene.add(mesh);
        const start = this.itemTarget(item, i);
        if (start) mesh.position.copy(start);
      }
      (mesh.material as THREE.MeshPhongMaterial).color.setHex(KIND_COLOR[item.kind]);
      mesh.userData.target = this.itemTarget(item, i);
    });
    for (const [id, mesh] of this.items) if (!live.has(id)) (this.scene.remove(mesh), this.items.delete(id));
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;

    this.beltTex.offset.x -= dt * 0.8;
    for (const v of this.machines.values()) {
      const working = v.group.userData.state === "working";
      if (v.spin) v.spin.rotation.y += dt * (working ? 4 : 0.4);
      if (v.beacon) (v.beacon.material as THREE.MeshPhongMaterial).emissive.setHex(
        v.group.userData.state === "blocked" ? (Math.floor(t * 3) % 2 ? 0xff2010 : 0x000000) : v.rocket ? 0 : Math.floor(t * 8) % 2 ? 0xa05010 : 0x804008,
      );
    }
    for (const mesh of this.items.values()) {
      const target = mesh.userData.target as THREE.Vector3 | null;
      if (target) mesh.position.lerp(target, 1 - Math.exp(-dt * 4));
      mesh.rotation.y += dt;
    }
    for (let i = this.launches.length - 1; i >= 0; i--) {
      const l = this.launches[i];
      l.t += dt;
      l.rocket.position.y = 0.15 + (l.t < 0.4 ? 0 : (l.t - 0.4) ** 2 * 6);
      if (l.t > 3) {
        l.rocket.position.y = 0.15;
        this.launches.splice(i, 1);
      }
    }
    this.pass.render(this.renderer, this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.pass.dispose();
    this.renderer.dispose();
  }
}
