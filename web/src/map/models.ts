// The map's scenery: the floating island, waterfalls, floating rocks and district plinths.
// Machines come from the Item Lab builders in itemlab.js.

import * as THREE from "three";
import { box, canvasTex, mat, own, rep, tex } from "./kit";

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
  pave.map = rep(tex().stone, 1 / 4, 1 / 4);
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
  for (let i = 0; i < Math.round(w * d * 0.11); i++) {
    const edge = rand() < 0.7;
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
