// The map's scenery: the floating island, waterfalls, floating rocks and district plinths.
// Machines come from the Item Lab builders in itemlab.js.

import * as THREE from "three";
import { box, canvasTex, cyl, hash01, mat, own, rep, tex } from "./kit";

// Island look (Justin, Oct 26, option A of the island mockup): a thick moss cap with a soft
// rounded rim, a soil band, then chunky faceted rock that tapers to a blunt tip. Roots hang
// under the cap, waterfalls fade into mist, and small mossy chunks float alongside.
const ROCK = [0xa0959f, 0x8e8494, 0x7a7186, 0x675f76, 0x554e66];
const MOSS = { top: 0x7fa843, rim: 0x6e9a3a, under: 0x557f33, tuft: 0x9cc055 };
const SOIL = 0x5b4433;

// Own seeded random, so the island keeps its shape when it grows or rebuilds.
const seeded = (s: number) => () => {
  s = (s * 16807) % 2147483647;
  return (s - 1) / 2147483646;
};

// Rounded rectangle (superellipse) with n points.
function ring(a: number, b: number, n: number, p = 8): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([a * Math.sign(c) * Math.abs(c) ** (2 / p), b * Math.sign(s) * Math.abs(s) ** (2 / p)]);
  }
  return pts;
}

// One ring per layer: y, scale, radial jitter, vertical wobble, and the color of the band below it.
interface Layer { y: number; s: number; j?: number; yj?: number; c?: number }

// Stacks rings downward and stitches them into faceted bands. The last layer (s = 0) is the tip.
function rockBody(w: number, d: number, layers: Layer[], rand: () => number, n: number, p = 8, drift = 0) {
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const wave = (i: number, k: number) =>
    Math.sin(i * 0.43 + ph[0] + k) * 0.5 + Math.sin(i * 1.1 + ph[1] - k * 0.7) * 0.3 + Math.sin(i * 2.3 + ph[2]) * 0.2;
  const base = ring(w / 2, d / 2, n, p);
  const rings = layers.map((L, k) =>
    base.map(([x, z], i) => {
      const f = L.s * (1 + (L.j ?? 0) * (wave(i, k) + (rand() - 0.5) * 0.8));
      const off = drift * k * (1 - L.s); // the tip leans a little off center
      return [x * f + off * w * 0.009, L.y + (L.yj ?? 0) * (wave(i * 1.7, k + 3) + rand() - 0.5), z * f + off * d * 0.006];
    }),
  );
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      c.set(layers[k].c ?? 0).multiplyScalar(0.9 + rand() * 0.18);
      for (const v of [A[i], B[i], A[j], A[j], B[i], B[j]]) {
        pos.push(v[0], v[1], v[2]);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0, specular: 0x000000, side: THREE.DoubleSide });
  const body = new THREE.Mesh(geo, m);
  body.castShadow = body.receiveShadow = true;
  return { body, top: rings[0], rings };
}

function flatShape(pts: [number, number][], y: number, m: THREE.Material, parent: THREE.Object3D) {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
  const o = new THREE.Mesh(geo, m);
  o.rotation.x = -Math.PI / 2;
  o.position.y = y;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

// How far the rock hangs below the top, so waterfalls can be sized to match.
export const islandDepth = (w: number, d: number) => 12.1 * Math.min(1.5, Math.max(1, Math.min(w, d) / 12));

export function makeIsland(w: number, d: number) {
  const g = new THREE.Group();
  const rand = seeded(7);
  const k = islandDepth(w, d) / 12.1;
  const y = (v: number) => v * k;
  const layers: Layer[] = [
    { y: 0, s: 1, c: MOSS.rim },
    { y: -0.22, s: 1.035, j: 0.008, c: MOSS.under },
    { y: -0.62, s: 1.02, j: 0.012, yj: 0.22, c: SOIL },
    { y: -0.95, s: 0.995, j: 0.03, yj: 0.15, c: ROCK[0] },
    { y: y(-2.6), s: 0.97, j: 0.06, yj: 0.3, c: ROCK[1] },
    { y: y(-4.6), s: 0.9, j: 0.08, yj: 0.4, c: ROCK[1] },
    { y: y(-6.6), s: 0.78, j: 0.1, yj: 0.4, c: ROCK[2] },
    { y: y(-8.6), s: 0.6, j: 0.12, yj: 0.4, c: ROCK[3] },
    { y: y(-10.4), s: 0.38, j: 0.14, yj: 0.35, c: ROCK[4] },
    { y: y(-11.6), s: 0.14, j: 0.2, c: ROCK[4] },
    { y: y(-12.1), s: 0 },
  ];
  const n = Math.min(96, Math.max(44, Math.round((w + d) * 1.6)));
  // the ring is a bit bigger than w x d so its rounded corners still cover the build area
  const { body, top, rings } = rockBody(w + 1.2, d + 1.2, layers, rand, n, 8, 1);
  g.add(body);

  // moss cap with stone paving inset, leaving a soft green rim
  const flat = top.map(([x, , z]) => [x, z] as [number, number]);
  flatShape(flat, 0.001, mat(MOSS.top), g);
  const pave = own(0xffffff);
  pave.map = rep(tex().stone, 1 / 8, 1 / 8);
  const sx = (w + 1.2 - 1.4) / (w + 1.2), sz = (d + 1.2 - 1.4) / (d + 1.2);
  flatShape(flat.map(([x, z]) => [x * sx, z * sz]), 0.012, pave, g);

  // grass tufts along the rim
  for (let i = 0; i < Math.round((w + d) * 0.9); i++) {
    const [x, , z] = top[Math.floor(rand() * top.length)];
    const f = 0.95 + rand() * 0.04;
    const t = box(0.22, 0.18 + rand() * 0.2, 0.22, rand() < 0.5 ? MOSS.tuft : MOSS.rim, x * f, 0.1, z * f, g);
    t.rotation.y = rand() * 3;
    t.castShadow = false;
  }
  // roots dangling from under the cap
  for (let i = 0; i < Math.round((w + d) * 0.45); i++) {
    let [x, ry, z] = rings[3][Math.floor(rand() * n)];
    x *= 0.97;
    z *= 0.97;
    const segs = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < segs; s++) {
      const len = 0.35 + rand() * 0.45;
      const seg = box(0.08, len, 0.08, s % 2 ? 0x6b4a2f : 0x5a3d28, x, ry - len / 2, z, g);
      seg.rotation.z = (rand() - 0.5) * 0.5;
      seg.castShadow = false;
      ry -= len * 0.92;
      x += (rand() - 0.5) * 0.12;
      z += (rand() - 0.5) * 0.12;
    }
  }
  // autumn leaves, mostly near the edges
  const leaves = [0xf08a24, 0xe0552f, 0xf2b13b, 0xc8442a];
  for (let i = 0; i < Math.round(w * d * 0.03); i++) {
    const edge = rand() < 0.85; // a few blown onto the paving, most along the rim
    const x = edge ? (rand() < 0.5 ? w / 2 - rand() * 2 : (rand() - 0.5) * w) : (rand() - 0.5) * w;
    const z = edge ? (rand() < 0.5 ? d / 2 - rand() * 2 : (rand() - 0.5) * d) : (rand() - 0.5) * d;
    const l = box(0.38, 0.04, 0.38, leaves[i % 4], x, 0.03, z, g);
    l.rotation.y = rand() * 3;
    l.castShadow = false;
  }
  return g;
}

// A small mossy chunk of rock that floats next to the island.
export function makeFloater(size: number, seed: number) {
  const rand = seeded(seed);
  const layers: Layer[] = [
    { y: 0, s: 1, c: MOSS.rim },
    { y: -0.18 * size, s: 1.05, j: 0.05, c: SOIL },
    { y: -0.8 * size, s: 0.7, j: 0.15, c: ROCK[2] },
    { y: -1.5 * size, s: 0.25, j: 0.2, c: ROCK[3] },
    { y: -1.8 * size, s: 0 },
  ];
  const { body, top } = rockBody(size * 1.4, size * 1.1, layers, rand, 9, 2.6);
  flatShape(top.map(([x, , z]) => [x, z]), 0.005, mat(MOSS.top), body);
  return body;
}

// Fades a waterfall out toward the bottom (alphaMap reads green: bright at the top, dark below).
let fadeTex: THREE.Texture | null = null;
const fade = () =>
  (fadeTex ??= canvasTex(1, 32, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 32);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.5, "#fff");
    grad.addColorStop(0.88, "#000");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, 32);
  }));

// Waterfall pouring off the island's edge into a puff of mist.
// Returns a tick so the scene can scroll the water and breathe the mist.
export function makeWaterfall(parent: THREE.Object3D, x: number, z: number, rotY: number, w: number, len: number) {
  const t = rep(tex().water, 1, len / 3.75);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, len),
    new THREE.MeshBasicMaterial({ map: t, alphaMap: fade(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  m.position.set(x, -len / 2 + 0.05, z);
  m.rotation.y = rotY;
  parent.add(m);
  const lip = box(w + 0.15, 0.1, 0.9, 0x9fd6ff, x - Math.sin(rotY) * 0.3, 0.04, z - Math.cos(rotY) * 0.3, parent);
  lip.rotation.y = rotY;

  const rand = seeded(Math.round(x * 31 + z * 17) + 99);
  const mist: { o: THREE.Mesh; y: number; r: number; k: number }[] = [];
  const geo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 8; i++) {
    const mm = new THREE.MeshPhongMaterial({ color: i % 2 ? 0xcfe6ff : 0xe8f6ff, flatShading: true, shininess: 0, specular: 0x000000, transparent: true, opacity: 0.82, depthWrite: false });
    const o = new THREE.Mesh(geo, mm);
    const along = (rand() - 0.5) * 1.8, out = (rand() - 0.2) * 1.0;
    o.position.set(x + Math.cos(rotY) * along + Math.sin(rotY) * out, -len * 0.85 + rand() * 0.8, z - Math.sin(rotY) * along + Math.cos(rotY) * out);
    o.rotation.set(rand() * 6, rand() * 6, 0);
    parent.add(o);
    mist.push({ o, y: o.position.y, r: 0.35 + rand() * 0.45, k: rand() });
  }
  return (dt: number, time: number) => {
    t.offset.y += dt * 1.6;
    for (const p of mist) {
      const c = (time * 0.45 + p.k) % 1;
      p.o.scale.setScalar(p.r * (0.7 + c * 0.6));
      p.o.position.y = p.y + c * 0.7;
    }
  };
}

// District: one folder of the repo, as a stone plinth with buildings on it. The folder's name picks
// what kind of buildings stand there, so /web reads as a shopfront street and /server as a server hall.
// The roof material is shared so the scene can recolor a district by its health.
export type DistrictKind = "shop" | "servers" | "warehouse" | "library" | "lab" | "hq";

const KIND_WORDS: [DistrictKind, RegExp][] = [
  ["lab", /test|spec|e2e|qa|bench/],
  ["library", /doc|wiki|guide|blog|content|brief|readme/],
  ["servers", /server|api|backend|worker|func|runner|db|data|infra|cloud|service|queue|job/],
  ["shop", /web|app|ui|front|client|site|page|checkout|cart|shop|store|view|component|mobile|ios|android/],
  ["warehouse", /shared|lib|pkg|package|common|core|util|vendor|types|asset|static|public|model/],
  ["hq", /^\/$|root|script|config|tool|bin|ci|github|deploy|ops/],
];
export function districtKind(name: string): DistrictKind {
  const n = name.toLowerCase();
  for (const [k, re] of KIND_WORDS) if (re.test(n)) return k;
  const all: DistrictKind[] = ["shop", "servers", "warehouse", "library", "lab"];
  return all[Math.floor(hash01(n) * all.length)];
}

const WALL: Record<DistrictKind, number[]> = {
  shop: [0xd9cbb0, 0xc7b9a0, 0xe2d6bd],
  servers: [0x7d8799, 0x6f798c, 0x8a94a6],
  warehouse: [0xa8806a, 0x9a735e, 0xb48b73],
  library: [0xd8cfc0, 0xcbc1b0, 0xe0d8ca],
  lab: [0xe6eaee, 0xd9dee4, 0xf0f2f5],
  hq: [0x6d7487, 0x5f6679, 0x7b8296],
};
const TRIM = 0x3a3f52;
const GLASS = 0x8fd3ff;
const DARK_GLASS = 0x2b3150;

type Tick = (t: number) => void;

// Two slabs leaning on a ridge that runs along x: a pitched roof over a w x d footprint at height y.
function pitched(w: number, d: number, rise: number, m: THREE.Material, wall: number, x: number, y: number, z: number, g: THREE.Group) {
  const run = d / 2 + 0.06, slope = Math.hypot(run, rise), a = Math.atan2(rise, run);
  for (const side of [-1, 1]) {
    const slab = box(w + 0.1, 0.07, slope, m, x, y + rise / 2, z + (side * run) / 2, g);
    slab.rotation.x = side * a;
  }
  // gable ends
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const geo = new THREE.ShapeGeometry(shape);
  const endMat = own(wall);
  endMat.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(geo, endMat);
    end.castShadow = true;
    end.rotation.y = Math.PI / 2;
    end.position.set(x + (side * w) / 2, y, z);
    g.add(end);
  }
}
interface Lot { x: number; z: number; s: number; h: number; i: number; roof: THREE.Material; g: THREE.Group; ticks: Tick[] }

// A tiny shopfront: glass front, striped awning in the roof color, a glowing sign.
function shop({ x, z, s, h, i, roof, g, ticks }: Lot) {
  const wall = WALL.shop[i % 3];
  box(s, h, s, wall, x, 0.5 + h / 2, z, g);
  box(s + 0.08, 0.12, s + 0.08, roof, x, 0.5 + h + 0.06, z, g);
  box(s * 0.8, h * 0.42, 0.04, GLASS, x, 0.5 + h * 0.24, z + s / 2 + 0.02, g);
  box(0.06, h * 0.42, 0.05, TRIM, x, 0.5 + h * 0.24, z + s / 2 + 0.03, g);
  for (let k = 0; k < 3; k++) {
    const a = box(s / 3 - 0.02, 0.06, 0.34, k % 2 ? 0xf1ece0 : roof, x - s / 3 + (k * s) / 3, 0.5 + h * 0.5, z + s / 2 + 0.16, g);
    a.rotation.x = 0.35;
  }
  // upper windows
  for (const dx of [-0.22, 0.22]) box(0.2, 0.2, 0.04, DARK_GLASS, x + dx * s, 0.5 + h * 0.78, z + s / 2 + 0.02, g);
  const sign = own(0xffe6a8, 0x3a2a08);
  box(s * 0.5, 0.18, 0.06, sign, x, 0.5 + h + 0.22, z + s / 2 - 0.08, g);
  const k = i * 1.7;
  ticks.push((t) => sign.emissive.setHex(Math.sin(t * 2.2 + k) > 0.6 ? 0x6a4c10 : 0x3a2a08));
}

// Server hall: a low steel block with rack lights blinking down its face and rooftop fans spinning.
function servers({ x, z, s, h, i, roof, g, ticks }: Lot) {
  const hh = h * 0.8;
  box(s, hh, s, WALL.servers[i % 3], x, 0.5 + hh / 2, z, g);
  box(s + 0.06, 0.1, s + 0.06, roof, x, 0.5 + hh + 0.05, z, g);
  box(s * 0.84, hh * 0.7, 0.04, 0x1e2230, x, 0.5 + hh * 0.48, z + s / 2 + 0.02, g);
  const leds: THREE.MeshPhongMaterial[] = [];
  const rows = Math.max(2, Math.round(hh / 0.22));
  for (let r = 0; r < rows; r++)
    for (const c of [-1, 0, 1]) {
      const m = own(0x1d6b3d, 0);
      leds.push(m);
      box(0.08, 0.05, 0.03, m, x + c * s * 0.26, 0.5 + hh * 0.2 + (r * hh * 0.6) / rows, z + s / 2 + 0.05, g);
    }
  const fans: THREE.Object3D[] = [];
  for (const dx of [-0.22, 0.22]) {
    cyl(s * 0.18, s * 0.18, 0.1, 0x9aa3b3, 10, x + dx * s, 0.5 + hh + 0.15, z - 0.05, g);
    const blade = box(s * 0.3, 0.03, 0.06, 0x3a3f52, x + dx * s, 0.5 + hh + 0.22, z - 0.05, g);
    blade.castShadow = false;
    fans.push(blade);
  }
  const seed = i * 13;
  ticks.push((t) => {
    for (const f of fans) f.rotation.y = t * 9;
    const tick = Math.floor(t * 6);
    leds.forEach((m, j) => {
      const on = ((tick + j * 7 + seed) * 2654435761) % 7 > 2;
      m.color.setHex(on ? 0x5bd18b : 0x1d6b3d);
      m.emissive.setHex(on ? 0x1f6b3a : 0);
    });
  });
}

// Warehouse: a long brick shed with a pitched roof, a roll-up door and crates stacked by it.
function warehouse({ x, z, s, h, i, roof, g }: Lot) {
  const hh = h * 0.75;
  box(s, hh, s, WALL.warehouse[i % 3], x, 0.5 + hh / 2, z, g);
  pitched(s, s, s * 0.32, roof, WALL.warehouse[i % 3], x, 0.5 + hh, z, g);
  box(s * 0.5, hh * 0.6, 0.04, 0x8b8f99, x, 0.5 + hh * 0.3, z + s / 2 + 0.02, g);
  for (let k = 0; k < 3; k++) box(0.5 * s * 0.96, 0.02, 0.05, 0x6d717b, x, 0.5 + hh * (0.12 + k * 0.17), z + s / 2 + 0.04, g);
  const crate = 0xb8854a;
  box(0.22, 0.22, 0.22, crate, x + s * 0.38, 0.61, z + s / 2 + 0.2, g);
  box(0.2, 0.2, 0.2, 0xa87640, x + s * 0.38, 0.82, z + s / 2 + 0.2, g).rotation.y = 0.4;
}

// Library: pale stone hall with a gabled roof, columns across the front and a lit reading window.
function library({ x, z, s, h, i, roof, g, ticks }: Lot) {
  const hh = h * 0.8;
  box(s, hh, s * 0.9, WALL.library[i % 3], x, 0.5 + hh / 2, z, g);
  box(s + 0.12, 0.08, s * 0.9 + 0.12, 0xbfb5a2, x, 0.5 + 0.04, z, g);
  pitched(s, s * 0.9, s * 0.4, roof, WALL.library[i % 3], x, 0.5 + hh, z, g);
  for (const dx of [-0.36, -0.12, 0.12, 0.36]) cyl(0.05, 0.05, hh * 0.85, 0xf2ede3, 6, x + dx * s, 0.5 + hh * 0.43, z + s * 0.45 + 0.08, g);
  const win = own(0xffd88a, 0x4a3410);
  box(s * 0.3, hh * 0.35, 0.04, win, x, 0.5 + hh * 0.45, z + s * 0.45 + 0.02, g);
  const k = i * 2.3;
  ticks.push((t) => win.emissive.setHex(Math.sin(t * 0.8 + k) > 0 ? 0x4a3410 : 0x2a1d08));
}

// Test lab: white block under a dome with a slit that sweeps around, plus a vent stack.
function lab({ x, z, s, h, i, roof, g, ticks }: Lot) {
  const hh = h * 0.6;
  box(s, hh, s, WALL.lab[i % 3], x, 0.5 + hh / 2, z, g);
  box(s * 0.84, 0.1, 0.04, 0x2a7fb8, x, 0.5 + hh * 0.6, z + s / 2 + 0.02, g);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(s * 0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), roof);
  dome.position.set(x, 0.5 + hh, z);
  dome.castShadow = true;
  g.add(dome);
  const slit = box(0.06, s * 0.2, s * 0.3, 0x1e2230, x, 0.5 + hh + s * 0.14, z, g);
  cyl(0.06, 0.06, 0.4, 0x9aa3b3, 6, x + s * 0.36, 0.5 + hh + 0.2, z - s * 0.36, g);
  const k = i * 0.9;
  ticks.push((t) => {
    const a = t * 0.6 + k;
    slit.position.set(x + Math.sin(a) * s * 0.3, 0.5 + hh + s * 0.14, z + Math.cos(a) * s * 0.3);
    slit.rotation.y = a;
  });
}

// HQ: a slate control tower with a glass cab, an antenna with a blinking light and a flag.
function hq({ x, z, s, h, i, roof, g, ticks }: Lot) {
  const hh = h * 1.3;
  box(s * 0.8, hh, s * 0.8, WALL.hq[i % 3], x, 0.5 + hh / 2, z, g);
  for (let k = 1; k < 4; k++) box(s * 0.82, 0.04, s * 0.82, TRIM, x, 0.5 + (hh * k) / 4, z, g);
  box(s * 0.92, 0.32, s * 0.92, GLASS, x, 0.5 + hh + 0.16, z, g);
  box(s * 0.98, 0.08, s * 0.98, roof, x, 0.5 + hh + 0.36, z, g);
  cyl(0.025, 0.025, 0.7, 0xc9ced6, 4, x - s * 0.25, 0.5 + hh + 0.75, z, g);
  const beacon = own(0x8a1d18, 0);
  box(0.08, 0.08, 0.08, beacon, x - s * 0.25, 0.5 + hh + 1.12, z, g);
  cyl(0.02, 0.02, 0.6, 0xc9ced6, 4, x + s * 0.25, 0.5 + hh + 0.7, z, g);
  const flag = box(0.28, 0.16, 0.02, roof, x + s * 0.25 + 0.14, 0.5 + hh + 0.92, z, g);
  const k = i * 1.1;
  ticks.push((t) => {
    const on = (t + k) % 1.4 < 0.18;
    beacon.color.setHex(on ? 0xff5e52 : 0x8a1d18);
    beacon.emissive.setHex(on ? 0x8a1d18 : 0);
    flag.rotation.y = Math.sin(t * 3 + k) * 0.25;
  });
}

const BUILD: Record<DistrictKind, (l: Lot) => void> = { shop, servers, warehouse, library, lab, hq };

export function makeDistrict(w: number, d: number, buildings: number, name: string) {
  const g = new THREE.Group();
  const kind = districtKind(name);
  const side = mat(0x8d7c5c);
  const top = own(0xffffff);
  top.map = rep(tex().stone, w / 7.2, d / 7.2);
  box(w, 0.5, d, [side, side, top, side, side, side], 0, 0.25, 0, g);
  const roof = own(0x4fae73);
  const ticks: Tick[] = [];
  const cols = Math.max(1, Math.floor(w / 1.7));
  const rows = Math.max(1, Math.floor(d / 1.7));
  const cw = w / cols, cd = d / rows;
  const n = Math.min(cols * rows, Math.max(1, buildings));
  const seedKey = name.length;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = -w / 2 + cw * (c + 0.5), z = -d / 2 + cd * (r + 0.5);
    const h = 1 + ((i * 7 + seedKey) % 5) * 0.28;
    const s = Math.min(cw, cd) * 0.72;
    BUILD[kind]({ x, z, s, h, i, roof, g, ticks });
  }
  return { group: g, roof, kind, labelY: 2.8, update: (t: number) => ticks.forEach((f) => f(t)) };
}
