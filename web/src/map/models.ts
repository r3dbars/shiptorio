// Every building on the map, built from boxes, cylinders and cones so their parts can
// move. Ported from docs/art-prototype.html; animations now follow the machine's state.

import * as THREE from "three";
import type { MachineState } from "@shiptorio/shared";
import { basic, box, cyl, group, mat, mesh, own, rep, rnd, tex } from "./kit";

export interface Model {
  group: THREE.Group;
  labelY: number; // label sits this high above the model
  update?(t: number, dt: number, state: MachineState): void;
}

export interface PadModel extends Model {
  launch(): void;
  launching(): boolean;
}

// Moves at full speed while working, slowly while idle, not at all when blocked.
const pace = (s: MachineState) => (s === "working" ? 1 : s === "idle" ? 0.15 : 0);

export function makeIsland(w: number, d: number) {
  const g = new THREE.Group();
  const t = tex();
  const top = own(0xffffff);
  top.map = rep(t.stone, w / 4, d / 4);
  const moss = mat(0x4f7d3b);
  box(w, 0.6, d, [moss, moss, top, moss, moss, moss], 0, -0.3, 0, g);
  const sideX = own(0xffffff);
  sideX.map = rep(t.cliff, d / 3.5, 1);
  const sideZ = own(0xffffff);
  sideZ.map = rep(t.cliff, w / 3.5, 1);
  const dark = mat(0x262c4a);
  box(w, 7, d, [sideX, sideX, dark, dark, sideZ, sideZ], 0, -4.1, 0, g);
  box(w * 0.7, 4, d * 0.7, [sideX, sideX, dark, dark, sideZ, sideZ], -w * 0.06, -9.4, -d * 0.05, g);
  box(w * 0.35, 3, d * 0.35, mat(0x2a3156), -w * 0.12, -12.6, -d * 0.1, g);
  // moss hanging off the edges
  for (let i = 0; i < Math.round((w + d) * 0.6); i++) {
    const alongX = rnd() < 0.6;
    const x = alongX ? (rnd() - 0.5) * w : w / 2 + 0.05;
    const z = alongX ? d / 2 + 0.05 : (rnd() - 0.5) * d;
    box(alongX ? 0.25 : 0.1, 0.8 + rnd() * 2.6, alongX ? 0.1 : 0.25, rnd() < 0.5 ? 0x3e6630 : 0x4f7d3b, x, -1 - rnd() * 0.8, z, g);
  }
  // autumn leaves, mostly near the edges
  const leaves = [0xf08a24, 0xe0552f, 0xf2b13b, 0xc8442a];
  for (let i = 0; i < Math.round(w * d * 0.11); i++) {
    const edge = rnd() < 0.7;
    const x = edge ? (rnd() < 0.5 ? w / 2 - rnd() * 2 : (rnd() - 0.5) * w) : (rnd() - 0.5) * w;
    const z = edge ? (rnd() < 0.5 ? d / 2 - rnd() * 2 : (rnd() - 0.5) * d) : (rnd() - 0.5) * d;
    const l = box(0.38, 0.04, 0.38, leaves[i % 4], x, 0.03, z, g);
    l.rotation.y = rnd() * 3;
    l.castShadow = false;
  }
  return g;
}

// Waterfall pouring off the island's edge. Returns the texture so the scene can scroll it.
export function makeWaterfall(parent: THREE.Object3D, x: number, z: number, rotY: number, w: number) {
  const t = rep(tex().water, 1, 4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 15), new THREE.MeshBasicMaterial({ map: t }));
  m.position.set(x, -7.4, z);
  m.rotation.y = rotY;
  parent.add(m);
  const lip = box(w + 0.2, 0.12, 0.5, 0x9fd6ff, x, 0.02, z, parent);
  lip.rotation.y = rotY;
  return t;
}

// Assembler: a coding agent's workshop. The accent is the agent's color.
export function makeAssembler(accent: number): Model {
  const g = new THREE.Group();
  box(2, 1.3, 2, 0x8a94a3, 0, 0.65, 0, g);
  box(2.04, 0.2, 2.04, accent, 0, 0.32, 0, g);
  box(2.1, 0.14, 2.1, 0x3a3f47, 0, 1.36, 0, g);
  box(0.5, 0.5, 0.06, 0x2b2f36, 0.5, 0.75, 1.02, g);
  const gear = group(g, 0, 1.5, 0);
  cyl(0.72, 0.72, 0.22, 0xf2a93b, 10, 0, 0, 0, gear);
  cyl(0.28, 0.28, 0.3, 0x2b2f36, 8, 0, 0.02, 0, gear);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    box(0.24, 0.2, 0.24, 0xf2a93b, Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82, gear).rotation.y = -a;
  }
  const led = own(0x5bd18b, 0x2f8f57);
  box(0.16, 0.16, 0.06, led, -0.65, 1.05, 1.02, g);
  return {
    group: g,
    labelY: 2.4,
    update(t, dt, s) {
      gear.rotation.y += dt * 1.6 * (s === "working" ? 2 : pace(s));
      const blink = Math.sin(t * 6) > 0;
      led.emissive.setHex(s === "blocked" ? (blink ? 0xff5e52 : 0x3e1714) : s === "working" ? (blink ? 0x5bd18b : 0x1f5f3a) : 0x7a5418);
    },
  };
}

// Splitter: Spark's sorting box. The lamp blinks while it triages.
export function makeSplitter(): Model {
  const g = new THREE.Group();
  box(1.2, 0.9, 2.6, 0xf2a93b, 0, 0.45, 0, g);
  box(1.26, 0.12, 2.66, 0xc47d1a, 0, 0.92, 0, g);
  for (const z of [-0.7, 0, 0.7]) box(0.5, 0.06, 0.16, 0x16120a, 0.1, 1.0, z, g);
  const lamp = own(0x6fb2ff, 0x2a5f9a);
  box(0.2, 0.2, 0.2, lamp, -0.4, 1.1, -1.1, g);
  return {
    group: g,
    labelY: 1.9,
    update(t, _dt, s) {
      const rate = s === "working" ? 10 : 4;
      lamp.emissive.setHex(s === "blocked" ? 0xff5e52 : Math.sin(t * rate) > 0.3 ? 0x6fb2ff : 0x1d3a66);
    },
  };
}

// Inspector: tests + lint. A scan beam sweeps while it checks a PR.
export function makeInspector(): Model {
  const g = new THREE.Group();
  box(1.8, 1.2, 2.2, 0x8a94a3, 0, 0.6, 0, g);
  box(1.86, 0.14, 2.26, 0x3a3f47, 0, 1.24, 0, g);
  cyl(0.62, 0.62, 0.5, 0x3b82f6, 12, 0, 1.55, 0, g);
  cyl(0.46, 0.46, 0.12, own(0x93c5fd, 0x3060a0), 12, 0, 1.85, 0, g);
  const beam = box(0.06, 0.06, 2.3, basic(0x7cffb0), 0.98, 0.4, 0, g);
  beam.castShadow = false;
  const ok = own(0x5bd18b, 0x2f8f57);
  const bad = own(0xff5e52, 0x8a2a24);
  box(0.16, 0.16, 0.06, ok, -0.5, 0.9, 1.12, g);
  box(0.16, 0.16, 0.06, bad, -0.2, 0.9, 1.12, g);
  return {
    group: g,
    labelY: 2.6,
    update(t, _dt, s) {
      beam.visible = s !== "idle";
      beam.position.y = 0.3 + (Math.sin(t * 3) + 1) * 0.42;
      ok.emissive.setHex(s === "working" ? 0x2f8f57 : 0x10301f);
      bad.emissive.setHex(s === "blocked" ? (Math.sin(t * 8) > 0 ? 0xff5e52 : 0x8a2a24) : 0x3e1714);
    },
  };
}

// Steam plant: a paid API (Spark on Meta's API). Burns credits, puffs smoke.
export function makeSteam(): Model {
  const g = new THREE.Group();
  box(2.4, 1.6, 1.8, 0x8a94a3, 0, 0.8, 0, g);
  box(2.46, 0.16, 1.86, 0x3a3f47, 0, 1.62, 0, g);
  const fire = own(0xf2a93b, 0xff6a1a);
  box(0.9, 0.6, 0.06, fire, -0.4, 0.55, 0.92, g);
  cyl(0.34, 0.42, 2.8, 0x4a505a, 8, 0.7, 2.6, -0.3, g);
  cyl(0.4, 0.4, 0.2, 0x2b2f36, 8, 0.7, 4.0, -0.3, g);
  const puffs: { p: THREE.Mesh; k: number; m: THREE.MeshBasicMaterial }[] = [];
  for (let i = 0; i < 6; i++) {
    const m = basic(0xeef1fa, 0.8);
    const p = box(0.5, 0.5, 0.5, m, 0.7, 4.2, -0.3, g);
    p.castShadow = false;
    puffs.push({ p, k: i / 6, m });
  }
  return {
    group: g,
    labelY: 4.6,
    update(t, dt, s) {
      const on = s !== "blocked";
      fire.emissive.setHex(!on ? 0x201008 : Math.sin(t * 13) > 0 ? 0xff6a1a : 0xd04a10);
      for (const q of puffs) {
        q.k = (q.k + dt * (s === "working" ? 0.6 : 0.35)) % 1;
        q.p.visible = on;
        q.p.position.set(0.7 + q.k * 0.9, 4.2 + q.k * 3, -0.3 - q.k * 0.4);
        q.p.scale.setScalar(0.5 + q.k * 1.1);
        q.m.opacity = 0.8 * (1 - q.k);
      }
    },
  };
}

// Solar panel: a subscription (Claude, Codex). Free while the plan has room.
export function makeSolar(): Model {
  const g = new THREE.Group();
  cyl(0.08, 0.08, 0.9, 0x5b6472, 6, 0, 0.45, 0, g);
  const panel = group(g, 0, 0.95, 0);
  panel.rotation.x = 0.55;
  box(1.8, 0.08, 1.2, 0x2f6fe0, 0, 0, 0, panel);
  box(1.84, 0.06, 1.24, 0x1d2a4a, 0, -0.05, 0, panel);
  for (const x of [-0.3, 0.3]) box(0.04, 0.1, 1.2, 0x93c5fd, x, 0.01, 0, panel);
  box(1.8, 0.1, 0.04, 0x93c5fd, 0, 0.01, 0, panel);
  return { group: g, labelY: 2 };
}

// Battery: how much of the plan's usage window is left. Bands light up with charge.
export function makeBattery(): Model & { level: number } {
  const g = new THREE.Group();
  cyl(0.6, 0.6, 1.7, 0x8a94a3, 10, 0, 0.85, 0, g);
  const bands = [0.45, 0.85, 1.25].map((y) => {
    const m = own(0x5bd18b, 0x1f6f3f);
    cyl(0.63, 0.63, 0.14, m, 10, 0, y, 0, g);
    return m;
  });
  cyl(0.24, 0.24, 0.24, 0x3a3f47, 8, 0, 1.82, 0, g);
  const model = {
    group: g,
    labelY: 2.5,
    level: 1,
    update() {
      bands.forEach((b, i) => b.emissive.setHex(i < model.level * 3 ? 0x3fbf74 : 0x13261b));
    },
  };
  return model;
}

// Geothermal: local inference (Mac or the 3090). Free, always on, capped.
export function makeGeo(): Model {
  const g = new THREE.Group();
  box(2.4, 0.1, 2.4, 0x23262c, 0, 0.05, 0, g);
  const lava = own(0xff7a2a, 0xff5a10);
  for (let i = 0; i < 7; i++) {
    const c = box(0.12 + rnd() * 0.5, 0.12, 0.08, lava, (rnd() - 0.5) * 2, 0.09, (rnd() - 0.5) * 2, g);
    c.rotation.y = rnd() * 3;
    c.castShadow = false;
  }
  box(1.4, 1, 1.4, 0x4a505a, 0, 0.6, 0, g);
  box(1.44, 0.1, 1.44, 0x2b2f36, 0, 1.12, 0, g);
  const fans = [-0.35, 0.35].map((x) => {
    const f = group(g, x, 1.2, 0);
    cyl(0.3, 0.3, 0.05, 0x2b2f36, 8, 0, 0, 0, f);
    box(0.52, 0.06, 0.1, 0x8a94a3, 0, 0.04, 0, f);
    box(0.1, 0.06, 0.52, 0x8a94a3, 0, 0.04, 0, f);
    return f;
  });
  box(0.12, 0.12, 0.06, own(0x5bd18b, 0x2f8f57), 0.45, 0.4, 0.71, g);
  return {
    group: g,
    labelY: 2.1,
    update(t, dt, s) {
      fans.forEach((f) => (f.rotation.y += dt * 9 * Math.max(0.2, pace(s))));
      lava.emissive.setHex(Math.sin(t * 2.3) > 0 ? 0xff5a10 : 0xc23c08);
    },
  };
}

// Launch pad: PRs wait here. A merge launches the rocket.
export function makeLaunchPad(): PadModel {
  const g = new THREE.Group();
  cyl(1.5, 1.7, 0.35, 0x6b7280, 12, 0, 0.18, 0, g);
  mesh(new THREE.TorusGeometry(1.15, 0.08, 4, 20), 0xf2a93b, 0, 0.38, 0, g).rotation.x = -Math.PI / 2;
  box(0.3, 3.4, 0.3, 0x8a94a3, -1.15, 1.9, -0.6, g);
  box(0.7, 0.14, 0.14, 0x8a94a3, -0.85, 2.6, -0.6, g);
  box(0.7, 0.14, 0.14, 0x8a94a3, -0.85, 1.6, -0.6, g);
  const rocket = group(g);
  cyl(0.34, 0.34, 2, 0xf2f2ee, 10, 0, 1.4, 0, rocket);
  cyl(0.36, 0.36, 0.18, 0xff5e52, 10, 0, 0.9, 0, rocket);
  mesh(new THREE.ConeGeometry(0.34, 0.75, 10), 0xff5e52, 0, 2.77, 0, rocket);
  cyl(0.12, 0.12, 0.05, 0x3b82f6, 8, 0, 1.9, 0.33, rocket).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    box(0.06, 0.6, 0.4, 0xff5e52, Math.cos(a) * 0.36, 0.7, Math.sin(a) * 0.36, rocket).rotation.y = -a + Math.PI / 2;
  }
  const flame = mesh(new THREE.ConeGeometry(0.3, 1.1, 8), basic(0xffd25a), 0, 0, 0, rocket);
  flame.rotation.x = Math.PI;
  flame.castShadow = false;
  flame.visible = false;
  let flight = -1; // seconds since liftoff, -1 when parked
  const FLIGHT = 3.5;
  return {
    group: g,
    labelY: 4.4,
    launch() {
      if (flight < 0) flight = 0;
    },
    launching: () => flight >= 0,
    update(_t, dt) {
      if (flight < 0) return;
      flight += dt;
      // the rocket clears the pad, then a fresh one rolls in
      if (flight > FLIGHT) {
        flight = -1;
        rocket.position.y = 0;
        flame.visible = false;
        return;
      }
      rocket.position.y = 0.5 * flight * flight * 3.2;
      flame.visible = true;
      flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    },
  };
}

// Biter: a Sentry error, attacking the district its stack trace points at.
export function makeBiter() {
  const g = new THREE.Group();
  const skin = own(0xff5e52);
  mesh(new THREE.SphereGeometry(0.42, 6, 4), skin, 0, 0.45, 0, g).scale.set(1, 0.75, 1.25);
  mesh(new THREE.SphereGeometry(0.28, 6, 4), skin, 0, 0.55, 0.5, g);
  box(0.08, 0.08, 0.04, 0xffffff, -0.1, 0.62, 0.76, g);
  box(0.08, 0.08, 0.04, 0xffffff, 0.1, 0.62, 0.76, g);
  const legs: { l: THREE.Mesh; side: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    legs.push({ l: box(0.5, 0.07, 0.07, 0xa8322b, side * 0.42, 0.25, ((i % 3) - 1) * 0.28, g), side });
  }
  return {
    group: g,
    skin,
    wiggle: (t: number) => legs.forEach(({ l, side }, i) => (l.rotation.z = side * (0.3 + Math.sin(t * 14 + i) * 0.25))),
  };
}

// Turret: tests guarding a district.
export function makeTurret() {
  const g = new THREE.Group();
  box(1, 0.4, 1, 0x8a94a3, 0, 0.2, 0, g);
  box(1.06, 0.1, 1.06, 0x3a3f47, 0, 0.42, 0, g);
  const head = group(g, 0, 0.55, 0);
  mesh(new THREE.SphereGeometry(0.42, 8, 5), 0x5bd18b, 0, 0, 0, head).scale.set(1, 0.8, 1);
  box(0.14, 0.14, 0.9, 0x2b2f36, 0, 0.08, 0.5, head);
  return { group: g, head };
}

export type OreKind = "sentry" | "inbox" | "issues";

// Ore patch: where feedback comes from. Red Sentry rocks, blue inbox crystals, amber issues.
export function makeOre(kind: OreKind): Model {
  const g = new THREE.Group();
  const cols = { sentry: [0xff5e52, 0xa8322b], inbox: [0x6fb2ff, 0x2f6fe0], issues: [0xf2a93b, 0xc47d1a] }[kind];
  for (let i = 0; i < 11; i++) {
    const m = own(cols[i % 2], i % 3 === 0 ? (kind === "inbox" ? 0x1d3a66 : 0x401010) : 0);
    const geo = kind === "inbox" ? new THREE.ConeGeometry(0.22, 0.6 + rnd() * 0.6, 5) : new THREE.DodecahedronGeometry(0.22 + rnd() * 0.18, 0);
    const r = mesh(geo, m, (rnd() - 0.5) * 2, kind === "inbox" ? 0.35 : 0.2, (rnd() - 0.5) * 2, g);
    r.rotation.set(rnd() * 0.4, rnd() * 3, rnd() * 0.4);
  }
  return { group: g, labelY: 1.7 };
}

// District: one folder of the repo, as a stone plinth with buildings on it.
// The roof material is shared so the scene can recolor a district by its health.
export function makeDistrict(w: number, d: number, buildings: number, seedKey: number) {
  const g = new THREE.Group();
  const side = mat(0x8d7c5c);
  const top = own(0xffffff);
  top.map = rep(tex().stone, w / 3.6, d / 3.6);
  box(w, 0.5, d, [side, side, top, side, side, side], 0, 0.25, 0, g);
  const roof = own(0x4fae73);
  const win = own(0x2b3150);
  const cols = Math.max(1, Math.floor(w / 1.7));
  const rows = Math.max(1, Math.floor(d / 1.7));
  const cw = w / cols, cd = d / rows;
  const n = Math.min(cols * rows, Math.max(1, buildings));
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = -w / 2 + cw * (c + 0.5), z = -d / 2 + cd * (r + 0.5);
    const h = 1 + ((i * 7 + seedKey) % 5) * 0.28;
    const s = Math.min(cw, cd) * 0.72;
    box(s, h, s, 0x8d97b5, x, 0.5 + h / 2, z, g);
    box(s + 0.1, 0.22, s + 0.1, roof, x, 0.6 + h, z, g);
    box(0.22, 0.22, 0.04, win, x - s * 0.2, 0.5 + h * 0.55, z + s / 2 + 0.02, g);
    box(0.22, 0.22, 0.04, win, x + s * 0.2, 0.5 + h * 0.55, z + s / 2 + 0.02, g);
  }
  return { group: g, roof, labelY: 2.8 };
}
