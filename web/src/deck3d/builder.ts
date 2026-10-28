// @ts-nocheck -- time-boxed spike, kept loose on purpose
// The Builder at mockup detail (web/public/deck/art/builder-working.webp): a chunky riveted iron block with rust,
// brass corner brackets and bands, a gear in a brass housing, a lit 2x2 window, a chimney stack, a lever, a copper
// pipe stack on the right and a brass stub on the left. The plate texture + bracket/pipe helpers here are the
// reusable "kit": the next station should mostly be a new arrangement of these parts.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const PX = 26; // texture pixels per world unit, about one texel per screen pixel at the rest camera

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

// riveted, rusty iron plate for a w x h face (world units): mottled iron, rust blooms that run down from rivets,
// a seam or two, brass rivets around the edge, a light top lip and a dark bottom lip
export function plateTexture(w, h, seed, { seams = 1, rivets = true, rust = 1 } = {}) {
  const W = Math.max(8, Math.round(w * PX)), H = Math.max(8, Math.round(h * PX));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), r = rng(seed);
  const IRON = [0x291b17, 0x291b17, 0x351705, 0x432f29], RUST = [0x5a3521, 0x834621, 0x6d370c, 0xa04430];
  g.fillStyle = hex(0x291b17); g.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H * 0.35; i++) { g.fillStyle = hex(IRON[(r() * IRON.length) | 0]); g.fillRect((r() * W) | 0, (r() * H) | 0, 1, 1); }
  // rust blooms: blobs that drip down
  for (let b = 0; b < Math.round(W * H * 0.004 * rust); b++) {
    let x = r() * W, y = r() * H * 0.8; const n = 10 + r() * 30;
    for (let i = 0; i < n; i++) {
      g.fillStyle = hex(RUST[(r() * RUST.length) | 0]);
      g.fillRect(x | 0, y | 0, 1 + ((r() * 2) | 0), 1);
      x += (r() - 0.5) * 2.4; y += r() * 1.2;
    }
  }
  // seams: vertical panel joins with rivet lines
  for (let s = 1; s <= seams; s++) {
    const x = Math.round((W * s) / (seams + 1));
    g.fillStyle = hex(0x0a0604); g.fillRect(x, 0, 1, H);
    g.fillStyle = hex(0x432f29); g.fillRect(x + 1, 0, 1, H);
  }
  if (rivets) {
    const dot = (x, y) => { g.fillStyle = hex(0xc98115); g.fillRect(x, y, 1, 1); g.fillStyle = hex(0x0a0604); g.fillRect(x, y + 1, 1, 1); };
    const step = 5;
    for (let x = 3; x < W - 2; x += step) { dot(x, 2); dot(x, H - 4); }
    for (let y = 2 + step; y < H - 4; y += step) { dot(2, y); dot(W - 3, y); }
  }
  g.fillStyle = hex(0x6b5360); g.fillRect(0, 0, W, 1);
  g.fillStyle = hex(0x0a0604); g.fillRect(0, H - 1, W, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

// worn brass: mostly brass with darker scuffs, for brackets and bands
function brassTexture(seed) {
  const c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = hex(0xa36915); g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 24; i++) { g.fillStyle = hex([0xc98115, 0x6d370c, 0xa36915][(r() * 3) | 0]); g.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildBuilderHD(parent, { toon, glow, gear }) {
  const g = new THREE.Group(); parent.add(g);
  const brassMap = brassTexture(3);
  const brass = toon(0xffffff, { map: brassMap }), brassHi = toon(0xc98115), copper = toon(0xae6237), copperDk = toon(0x834621);
  const ironDk = toon(0x181211), steel = toon(0x7d8ea3), black = toon(0x0a0604);
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (rt, rb, h, m, x, y, z, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); g.add(o); return o; };
  const rivet = (x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), brassHi); o.position.set(x, y, z); g.add(o); };

  // body: chamfered block, a riveted rusty plate texture per face
  const BW = 2.2, BH = 1.7, BD = 1.8, BY = 0.28;
  const faces = [[BD, BH, 11], [BD, BH, 12], [BW, BD, 13], [BW, BD, 14], [BW, BH, 15], [BW, BH, 16]].map(([w, h, s]) => toon(0xffffff, { map: plateTexture(w, h, s) }));
  const body = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 1, 0.08), faces);
  body.position.set(0, BY + BH / 2, 0); g.add(body);
  // plinth with little feet
  box(BW + 0.2, 0.2, BD + 0.2, ironDk, 0, 0.18, 0);
  for (const x of [-0.9, 0.9]) for (const z of [-0.75, 0.75]) box(0.34, 0.1, 0.34, brassHi, x, 0.05, z);

  // brass bands top and bottom, corner brackets with rivets
  const top = BY + BH;
  // top band as four strips so the roof stays riveted iron
  box(BW + 0.1, 0.16, 0.12, brass, 0, top - 0.06, BD / 2); box(BW + 0.1, 0.16, 0.12, brass, 0, top - 0.06, -BD / 2);
  box(0.12, 0.16, BD + 0.1, brass, BW / 2, top - 0.06, 0); box(0.12, 0.16, BD + 0.1, brass, -BW / 2, top - 0.06, 0);
  box(BW + 0.1, 0.14, BD + 0.1, brass, 0, BY + 0.05, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (BW / 2 + 0.01), z = sz * (BD / 2 + 0.01);
    box(0.26, BH - 0.1, 0.06, brass, x - sx * 0.1, BY + BH / 2, z);
    box(0.06, BH - 0.1, 0.26, brass, x, BY + BH / 2, z - sz * 0.1);
    for (const y of [BY + 0.4, BY + BH / 2, top - 0.4]) { rivet(x - sx * 0.12, y, z + sz * 0.03); rivet(x + sx * 0.03, y, z - sz * 0.12); }
  }

  // front: gear in a brass ring housing (lower left)
  const FZ = BD / 2 + 0.03;
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.1, 16), ironDk); housing.rotation.x = Math.PI / 2; housing.position.set(-0.35, BY + 0.62, FZ); g.add(housing);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.08, 5, 16), brass); ring.position.set(-0.35, BY + 0.62, FZ + 0.05); g.add(ring);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rivet(-0.35 + Math.cos(a) * 0.56, BY + 0.62 + Math.sin(a) * 0.56, FZ + 0.13); }
  const gr = gear(0.36, 10, steel); gr.position.set(-0.35, BY + 0.62, FZ + 0.1); g.add(gr);

  // front: lit 2x2 window in a brass frame (upper right)
  const win = glow(0xfc8717, 0.7);
  const wx = 0.55, wy = BY + 1.12;
  box(0.62, 0.56, 0.08, brass, wx, wy, FZ);
  box(0.5, 0.44, 0.06, black, wx, wy, FZ + 0.03);
  for (const dx of [-0.11, 0.11]) for (const dy of [-0.1, 0.1]) box(0.18, 0.16, 0.04, win, wx + dx, wy + dy, FZ + 0.06);

  // front: vent slots and a small hatch (upper left)
  for (let i = 0; i < 3; i++) box(0.36, 0.05, 0.04, black, -0.45, BY + 1.35 - i * 0.11, FZ);

  // chimney stack on top: flange, pipe, ring, lip, dark mouth
  const cx = 0.25, cz = -0.15;
  cyl(0.5, 0.5, 0.12, brass, cx, top + 0.06, cz, 12);
  cyl(0.36, 0.38, 0.6, brassHi, cx, top + 0.42, cz, 12);
  cyl(0.41, 0.41, 0.08, brass, cx, top + 0.4, cz, 12);
  cyl(0.46, 0.4, 0.16, brass, cx, top + 0.78, cz, 12);
  cyl(0.3, 0.3, 0.02, black, cx, top + 0.87, cz, 12);

  // lever on top left: block, rod, ball
  box(0.3, 0.16, 0.3, ironDk, -0.7, top + 0.08, -0.25);
  const rod = cyl(0.04, 0.04, 0.55, steel, -0.7, top + 0.42, -0.25, 6); rod.rotation.z = 0.25;
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), toon(0x181211)); ball.position.set(-0.77, top + 0.7, -0.25); g.add(ball);

  // right side: copper pipe stack with brass rings, elbow out to a flanged stub
  const RX = BW / 2 + 0.22;
  cyl(0.2, 0.2, 1.3, copper, RX, BY + 0.75, 0.25, 10);
  for (const y of [BY + 0.2, BY + 0.75, BY + 1.3]) cyl(0.24, 0.24, 0.08, brass, RX, y, 0.25, 10);
  const stub = cyl(0.17, 0.17, 0.45, copper, RX + 0.2, BY + 0.55, 0.25, 10); stub.rotation.z = Math.PI / 2;
  const fl = cyl(0.25, 0.25, 0.08, brass, RX + 0.44, BY + 0.55, 0.25, 10); fl.rotation.z = Math.PI / 2;
  box(0.18, 0.18, 0.18, brassHi, RX - 0.15, BY + 1.3, 0.25);

  // left side: short brass stub with a flange
  const ls = cyl(0.18, 0.18, 0.35, brass, -BW / 2 - 0.16, BY + 0.7, 0.2, 10); ls.rotation.z = Math.PI / 2;
  const lf = cyl(0.27, 0.27, 0.08, brassHi, -BW / 2 - 0.34, BY + 0.7, 0.2, 10); lf.rotation.z = Math.PI / 2;
  const lm = cyl(0.12, 0.12, 0.02, black, -BW / 2 - 0.39, BY + 0.7, 0.2, 10); lm.rotation.z = Math.PI / 2;

  return { gear: gr, win, group: g };
}
