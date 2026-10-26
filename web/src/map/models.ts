// The map's scenery: the floating island, waterfalls, floating rocks and district plinths.
// Machines come from the Item Lab builders in itemlab.js.

import * as THREE from "three";
import { box, canvasTex, cyl, hash01, mat, own, rep, tex } from "./kit";
import { C as IC, ironize, iron, makeIronFloater, makeIronIsland, makeMoltenPour, M as IM, worldBox, worldMat } from "./iron";
import { IRON } from "./world";

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

// Black Iron (map/world.ts) swaps the moss island for a cobbled foundry deck on a brick hull.
export function makeIsland(w: number, d: number) {
  return IRON ? makeIronIsland(w, d, islandDepth(w, d)) : makeMossIsland(w, d);
}

function makeMossIsland(w: number, d: number) {
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
  // wildflowers and mossy pebbles in the green rim (the paving stays calm)
  const petals = [0xfff1c0, 0xf2cf6b, 0xff9a8a, 0xb7a6ff];
  for (let i = 0; i < Math.round((w + d) * 0.7); i++) {
    const [x, , z] = top[Math.floor(rand() * top.length)];
    const f = 0.9 + rand() * 0.06;
    if (rand() < 0.6) {
      const st = box(0.03, 0.16, 0.03, MOSS.under, x * f, 0.08, z * f, g);
      st.castShadow = false;
      box(0.09, 0.05, 0.09, petals[i % 4], x * f, 0.17, z * f, g).castShadow = false;
    } else {
      const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + rand() * 0.08, 0), mat(rand() < 0.5 ? ROCK[0] : ROCK[1]));
      p.position.set(x * f, 0.05, z * f);
      p.rotation.set(rand() * 3, rand() * 3, 0);
      g.add(p);
    }
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
  return IRON ? makeIronFloater(size, seed) : makeMossFloater(size, seed);
}

function makeMossFloater(size: number, seed: number) {
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
  for (let i = 0; i < 3; i++) {
    const [x, , z] = top[Math.floor(rand() * top.length)];
    box(0.14 * size, 0.14 * size, 0.14 * size, MOSS.tuft, x * 0.7, 0.06 * size, z * 0.7, body).rotation.y = rand() * 3;
  }
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
  return IRON ? makeMoltenPour(parent, x, z, rotY, w, len) : makeWater(parent, x, z, rotY, w, len);
}

function makeWater(parent: THREE.Object3D, x: number, z: number, rotY: number, w: number, len: number) {
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

// Black Iron districts: sooty brick shopfronts, iron server halls, dark-brick warehouses, dressed-stone
// libraries, verdigris labs and an iron HQ, every window lit warm from inside.
const WALL: Record<DistrictKind, number[]> = IRON
  ? {
      shop: [0x8a4228, 0x7a3a24, 0x944a2e],
      servers: [0x5a4c40, 0x52463b, 0x625446],
      warehouse: [0x6a3020, 0x5e2a1c, 0x743424],
      library: [0x8a7a64, 0x7e6e5a, 0x948470],
      lab: [0x3e8a72, 0x367a64, 0x48967c],
      hq: [0x463d35, 0x40382f, 0x504539],
    }
  : {
      shop: [0xd9cbb0, 0xc7b9a0, 0xe2d6bd],
      servers: [0x7d8799, 0x6f798c, 0x8a94a6],
      warehouse: [0xa8806a, 0x9a735e, 0xb48b73],
      library: [0xd8cfc0, 0xcbc1b0, 0xe0d8ca],
      lab: [0xe6eaee, 0xd9dee4, 0xf0f2f5],
      hq: [0x6d7487, 0x5f6679, 0x7b8296],
    };
const TRIM = IRON ? 0x2e2620 : 0x3a3f52;
const GLASS: number | THREE.Material = IRON ? mat(0xffc070, 0x8a4a10) : 0x8fd3ff;
const DARK_GLASS: number | THREE.Material = IRON ? mat(0xb05a20, 0x4a1c06) : 0x2b3150;
// district roofs show health: fine, busy, under attack / rework
export const ROOF = IRON ? { ok: 0x3e8a72, busy: 0xd8a018, bad: 0xc03a24 } : { ok: 0x4fae73, busy: 0xe39a2f, bad: 0xd94a3f };

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

// Small kit every building shares: a front door with a step, a rooftop AC unit whose fan turns, a downspout.
function door(x: number, z: number, s: number, g: THREE.Group, color = TRIM, dx = 0.3) {
  box(0.2, 0.32, 0.04, color, x + dx * s, 0.66, z + s / 2 + 0.02, g);
  box(0.03, 0.03, 0.02, 0xd4a83a, x + dx * s + 0.06, 0.66, z + s / 2 + 0.05, g);
  box(0.28, 0.05, 0.12, 0x9a9488, x + dx * s, 0.52, z + s / 2 + 0.08, g);
}
function acUnit(x: number, y: number, z: number, g: THREE.Group, ticks: Tick[], k: number) {
  box(0.26, 0.14, 0.22, 0xc9ced6, x, y + 0.07, z, g);
  box(0.27, 0.02, 0.23, 0x8a94a3, x, y + 0.04, z, g);
  const fan = box(0.16, 0.012, 0.03, 0x3a3f52, x, y + 0.15, z, g);
  fan.castShadow = false;
  ticks.push((t) => (fan.rotation.y = t * 8 + k));
}
function downspout(x: number, y: number, z: number, g: THREE.Group) {
  box(0.04, y - 0.5, 0.04, 0x6d717b, x, 0.5 + (y - 0.5) / 2, z, g);
  box(0.08, 0.03, 0.06, 0x6d717b, x, 0.52, z + 0.02, g);
}

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
  for (const dx of [-0.32, 0.32]) {
    box(0.18, 0.1, 0.1, 0x8b6a43, x + dx * s, 0.55, z + s / 2 + 0.1, g); // planters with a bit of green
    box(0.14, 0.08, 0.08, MOSS.tuft, x + dx * s, 0.64, z + s / 2 + 0.1, g).castShadow = false;
  }
  acUnit(x - s * 0.22, 0.5 + h + 0.12, z - s * 0.2, g, ticks, i);
  downspout(x - s / 2 - 0.02, 0.5 + h, z + s / 2 - 0.04, g);
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
  door(x, z, s, g, 0x3a3f52, -0.36);
  box(0.05, 0.07, 0.02, own(0x173a26, 0x1f6b3a), x - s * 0.36 + 0.15, 0.7, z + s / 2 + 0.03, g); // keypad
  box(0.06, 0.06, s, 0x3a3f52, x + s / 2 + 0.04, 0.5 + hh * 0.85, z, g); // cable conduit along the side
  for (let k = 0; k < 3; k++) box(0.03, 0.12, 0.08, 0x8a94a3, x + s / 2 + 0.04, 0.5 + hh * 0.85, z - s * 0.35 + k * s * 0.35, g);
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
function warehouse({ x, z, s, h, i, roof, g, ticks }: Lot) {
  const hh = h * 0.75;
  box(s, hh, s, WALL.warehouse[i % 3], x, 0.5 + hh / 2, z, g);
  pitched(s, s, s * 0.32, roof, WALL.warehouse[i % 3], x, 0.5 + hh, z, g);
  box(s * 0.5, hh * 0.6, 0.04, 0x8b8f99, x, 0.5 + hh * 0.3, z + s / 2 + 0.02, g);
  for (let k = 0; k < 3; k++) box(0.5 * s * 0.96, 0.02, 0.05, 0x6d717b, x, 0.5 + hh * (0.12 + k * 0.17), z + s / 2 + 0.04, g);
  for (const dx of [-0.27, 0.27]) box(0.06, 0.1, 0.06, 0x16120a, x + dx * s, 0.62, z + s / 2 + 0.05, g); // dock bumpers
  box(s * 0.56, 0.04, 0.16, 0xf2a93b, x, 0.52, z + s / 2 + 0.1, g); // dock edge
  downspout(x + s / 2 + 0.02, 0.5 + hh, z + s / 2 - 0.04, g);
  const vents: THREE.Object3D[] = [];
  for (const dz of [-0.2, 0.2]) {
    cyl(0.04, 0.04, 0.1, 0x8a94a3, 6, x - s * 0.25, 0.5 + hh + s * 0.2, z + dz * s, g);
    const v = cyl(0.08, 0.07, 0.1, 0xc9ced6, 6, x - s * 0.25, 0.5 + hh + s * 0.2 + 0.1, z + dz * s, g); // turbine vent
    vents.push(v);
  }
  ticks.push((t) => vents.forEach((v, k) => (v.rotation.y = t * (3 + k))));
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
  for (let k = 0; k < 2; k++) box(s * 0.7 - k * 0.1, 0.05, 0.12, 0xcfc6b5, x, 0.52 + k * 0.05, z + s * 0.45 + 0.2 - k * 0.07, g); // front steps
  box(0.14, s * 0.35, 0.14, 0x9a735e, x + s * 0.3, 0.5 + hh + s * 0.2, z - s * 0.15, g); // chimney
  box(0.18, 0.04, 0.18, 0x6d717b, x + s * 0.3, 0.5 + hh + s * 0.38, z - s * 0.15, g);
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
  door(x, z, s, g, 0x2a7fb8, -0.28);
  box(0.12, 0.12, 0.02, 0xf2c94c, x + s * 0.22, 0.5 + hh * 0.35, z + s / 2 + 0.02, g).rotation.z = Math.PI / 4; // hazard placard
  for (let k = 0; k < 3; k++) cyl(0.04, 0.04, 0.3, [0x5bd18b, 0x6fb2ff, 0xeef1fa][k], 6, x + s / 2 + 0.08, 0.65, z - s * 0.2 + k * 0.1, g); // gas bottles
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
  door(x, z, s * 0.8, g, 0x2b3150, 0);
  const dish = new THREE.Group();
  dish.position.set(x, 0.5 + hh + 0.48, z - s * 0.25);
  g.add(dish);
  cyl(0.02, 0.02, 0.12, 0xc9ced6, 4, 0, 0, 0, dish);
  const bowl = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.06, 8), mat(0xeef1fa));
  bowl.position.y = 0.08;
  bowl.rotation.x = Math.PI - 0.6;
  dish.add(bowl);
  const k = i * 1.1;
  ticks.push((t) => {
    const on = (t + k) % 1.4 < 0.18;
    beacon.color.setHex(on ? 0xff5e52 : 0x8a1d18);
    beacon.emissive.setHex(on ? 0x8a1d18 : 0);
    flag.rotation.y = Math.sin(t * 3 + k) * 0.25;
    dish.rotation.y = t * 0.4 + k;
  });
}

const BUILD: Record<DistrictKind, (l: Lot) => void> = { shop, servers, warehouse, library, lab, hq };

export function makeDistrict(w: number, d: number, buildings: number, name: string) {
  const g = new THREE.Group();
  const kind = districtKind(name);
  if (IRON) worldBox(w, 0.5, d, worldMat("stone", 2.6), 0, 0.25, 0, g); // dressed stone, bakes with the island's
  else {
    const side = mat(0x8d7c5c);
    const top = own(0xffffff);
    top.map = rep(tex().stone, w / 7.2, d / 7.2);
    box(w, 0.5, d, [side, side, top, side, side, side], 0, 0.25, 0, g);
  }
  const roof = own(ROOF.ok);
  const ticks: Tick[] = [];
  // a curb around the plinth, and a street lamp on each front corner that comes on in the evening glow
  const curb = IRON ? IM.ironM : mat(0xbfb5a2);
  for (const sz of [-1, 1]) box(w + 0.06, 0.06, 0.08, curb, 0, 0.52, (sz * d) / 2, g);
  for (const sx of [-1, 1]) box(0.08, 0.06, d + 0.06, curb, (sx * w) / 2, 0.52, 0, g);
  if (IRON) for (let x = -w / 2 + 0.2; x < w / 2; x += 0.5) box(0.05, 0.05, 0.04, IM.brassL, x, 0.4, d / 2 + 0.01, g).castShadow = false;
  const lampM = IRON ? iron(IC.gas) : own(0xfff1c0, 0x3a2a08);
  if (IRON) lampM.emissive = new THREE.Color(0xa06018);
  for (const sx of [-1, 1]) {
    const lx = sx * (w / 2 - 0.18), lz = d / 2 - 0.18;
    cyl(0.025, 0.035, 0.8, TRIM, 6, lx, 0.9, lz, g);
    box(0.12, 0.08, 0.12, lampM, lx, 1.32, lz, g);
    box(0.16, 0.03, 0.16, IRON ? IM.brassD : TRIM, lx, 1.37, lz, g);
  }
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
  if (IRON) ironize(g, new Set([roof]));
  return { group: g, roof, kind, labelY: 2.8, update: (t: number) => ticks.forEach((f) => f(t)) };
}

// ---- progression unlocks (shared/src/progression.ts) ----

// Glass lake (island option B, "for a rainy day"): a glass-walled tank of water set into the front of the
// island, half sunk into the rock so you see the water column through the glass, a few fish inside.
// Returns a tick for the shimmer and the fish.
export function makeGlassLake(r: number, depth: number) {
  const g = new THREE.Group();
  const water = new THREE.MeshPhongMaterial({ color: 0x4fb6e8, emissive: 0x0d3550, transparent: true, opacity: 0.62, flatShading: true, shininess: 40, specular: 0x88ccff, depthWrite: false });
  const glass = new THREE.MeshPhongMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.22, shininess: 80, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
  const seg = 18;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.9, depth, seg, 1, true), water);
  col.position.y = -depth / 2 - 0.04;
  g.add(col);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, seg), new THREE.MeshPhongMaterial({ color: 0x8fe0ff, emissive: 0x1b5a7a, transparent: true, opacity: 0.85, flatShading: true }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.04; // just above the paving, which can't be cut
  g.add(top);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, depth + 0.2, seg, 1, true), glass);
  wall.position.y = -depth / 2 + 0.05;
  g.add(wall);
  // a pale stone rim and a sandy bed with a couple of weeds
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 4, seg), mat(0xb9c4cf));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.08;
  g.add(rim);
  cyl(r * 0.9, r * 0.86, 0.3, 0xd8c79a, seg, 0, -depth + 0.1, 0, g);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3, rr = r * (0.3 + (i % 3) * 0.18);
    box(0.08, 0.5 + (i % 2) * 0.4, 0.08, i % 2 ? 0x4f9a5b : 0x6cbf6a, Math.cos(a) * rr, -depth + 0.5, Math.sin(a) * rr, g).castShadow = false;
  }
  const fish = [0xf08a24, 0xffd25c, 0xe8685c].map((c, i) => {
    const f = new THREE.Group();
    box(0.26, 0.14, 0.1, c, 0, 0, 0, f).castShadow = false;
    box(0.1, 0.16, 0.04, c, -0.17, 0, 0, f).castShadow = false;
    g.add(f);
    return { f, k: i * 2.1, h: -depth * (0.3 + i * 0.2) };
  });
  // a rippling highlight on the surface
  const glint = box(r * 0.7, 0.01, 0.08, 0xe8f8ff, 0, 0.055, 0, g);
  glint.castShadow = false;
  for (const o of g.children) o.castShadow = false;
  return {
    group: g,
    tick: (t: number) => {
      for (const { f, k, h } of fish) {
        const a = t * 0.5 + k;
        f.position.set(Math.cos(a) * r * 0.55, h + Math.sin(t * 1.3 + k) * 0.15, Math.sin(a) * r * 0.55);
        f.rotation.y = -a - Math.PI / 2;
      }
      glint.position.z = Math.sin(t * 0.8) * r * 0.4;
      glint.scale.x = 0.7 + Math.sin(t * 1.7) * 0.3;
    },
  };
}

// Island lantern: a little post with a warm light, one per day of your streak.
export function makeLantern() {
  const g = new THREE.Group();
  box(0.08, 0.7, 0.08, 0x3a3f52, 0, 0.35, 0, g);
  box(0.24, 0.05, 0.24, 0x3a3f52, 0, 0.72, 0, g);
  const glow = box(0.18, 0.2, 0.18, own(0xffc861, 0xd88a1e), 0, 0.84, 0, g);
  glow.castShadow = false;
  box(0.26, 0.05, 0.26, 0x3a3f52, 0, 0.97, 0, g);
  return { group: g, glow: glow.material as THREE.MeshPhongMaterial };
}

// Gold trim on the launch pad: a square gold frame with corner studs around the pad's base.
export function makeGoldTrim(s: number) {
  const g = new THREE.Group();
  const gold = new THREE.MeshPhongMaterial({ color: 0xf2c14e, emissive: 0x5a3c08, flatShading: true, shininess: 60, specular: 0xfff0b0 });
  for (const [w, d, x, z] of [[s, 0.14, 0, -s / 2], [s, 0.14, 0, s / 2], [0.14, s, -s / 2, 0], [0.14, s, s / 2, 0]] as const) box(w, 0.1, d, gold, x, 0.06, z, g);
  for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) box(0.24, 0.18, 0.24, gold, x, 0.1, z, g);
  return g;
}
