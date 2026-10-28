// @ts-nocheck -- time-boxed spike, kept loose on purpose
// The /deck3d.html world, all code-built low-poly: a chamfered Black Iron deck section with railings and lanterns,
// a rocky underside with copper pipes and a caged cyan orb, the Builder and Checks stations, a belt, one crate,
// and Shippy as a box. Units: 1 = one deck tile. The line runs left to right along +x.
import * as THREE from "three";

// colors straight from the Black Iron 48 palette so the palette snap barely moves them
const C = {
  iron: 0x291b17, ironHi: 0x432f29, plate: 0x834621, rust: 0x5a3521, brass: 0xa36915, brassHi: 0xc98115,
  copper: 0xae6237, rock: 0x181211, steel: 0x7d8ea3, steelDk: 0x3d4d6a, navy: 0x121e2b, amber: 0xfc8717,
  cyan: 0x41f3f7, green: 0x1ab004, greenHi: 0x81f381, crate: 0xae6237, crateDk: 0x6d370c, cream: 0xeed3c5,
};

// 3-band toon ramp: light reads as flat steps, like hand shading
const ramp = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
const glow = (color, intensity = 1.6) => new THREE.MeshToonMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, gradientMap: ramp });

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  return t;
}
const haloTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.35, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
export const HALO_LAYER = 1;
function halo(color, size, x, y, z, opacity = 0.55) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size); s.position.set(x, y, z); s.layers.set(HALO_LAYER); return s;
}
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(rt, rb, h, mat, seg = 8) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); }
// a bar from a to b (rails, rods)
function bar(a, b, r, mat, seg = 6) {
  const len = a.distanceTo(b);
  const m = cyl(r, r, len, mat, seg);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// ---------------- deck ----------------
const DX = 8, DZ = 3.2, CH = 1.1, THICK = 0.7; // half length, half depth, corner chamfer, slab thickness
function outline() {
  return [[-DX + CH, -DZ], [DX - CH, -DZ], [DX, -DZ + CH], [DX, DZ - CH], [DX - CH, DZ], [-DX + CH, DZ], [-DX, DZ - CH], [-DX, -DZ + CH]].map(([x, z]) => new THREE.Vector2(x, z));
}

function buildDeck(root, lights) {
  const pts = outline();
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); // shape y -> world z, extrude goes down

  const tiles = canvasTex(16, 16, (g) => {
    const r = rng(7);
    g.fillStyle = hex(C.plate); g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 26; i++) { g.fillStyle = hex(r() < 0.6 ? C.rust : C.copper); g.fillRect((r() * 16) | 0, (r() * 16) | 0, 1 + ((r() * 2) | 0), 1); }
    g.fillStyle = hex(C.crateDk); g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
    g.fillStyle = hex(C.brassHi); g.fillRect(1, 1, 1, 1); g.fillRect(13, 1, 1, 1); g.fillRect(1, 13, 1, 1); g.fillRect(13, 13, 1, 1);
  });
  const top = toon(0xffffff, { map: tiles });
  const side = toon(C.iron);
  root.add(new THREE.Mesh(geo, [top, side]));

  const brass = toon(C.brass), brassHi = toon(C.brassHi), copper = toon(C.copper), iron = toon(C.ironHi);
  const lantern = glow(C.amber, 2.2);
  // fascia trim + railing along every edge
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const A = new THREE.Vector3(a.x, 0, a.y), B = new THREE.Vector3(b.x, 0, b.y);
    const len = A.distanceTo(B), ang = Math.atan2(B.z - A.z, B.x - A.x);
    const out = new THREE.Vector3(B.z - A.z, 0, A.x - B.x).normalize();
    if (out.dot(A.clone().add(B)) < 0) out.negate(); // point away from the deck's middle
    out.multiplyScalar(0.05);
    for (const [y, h] of [[-0.08, 0.16], [-THICK + 0.1, 0.14]]) {
      const t = box(len, h, 0.1, brass); t.position.copy(A).add(B).multiplyScalar(0.5).add(out); t.position.y = y; t.rotation.y = -ang; root.add(t);
    }
    // posts every ~1.6, rails at two heights
    const n = Math.max(1, Math.round(len / 1.6));
    for (let j = 0; j < n; j++) {
      const p = A.clone().lerp(B, j / n);
      root.add(box(0.2, 0.62, 0.2, iron, p.x, 0.31, p.z));
      root.add(box(0.26, 0.08, 0.26, brassHi, p.x, 0.64, p.z));
      const strap = box(0.24, THICK + 0.28, 0.14, brassHi); strap.position.copy(p).add(out.clone().multiplyScalar(2)); strap.position.y = -THICK / 2 - 0.1; strap.rotation.y = -ang; root.add(strap);
      const cap = box(0.14, 0.1, 0.16, brassHi); cap.position.copy(strap.position); cap.position.y = -THICK - 0.22; cap.rotation.y = -ang; root.add(cap);
    }
    root.add(bar(A.clone().setY(0.56), B.clone().setY(0.56), 0.055, copper));
    root.add(bar(A.clone().setY(0.28), B.clone().setY(0.28), 0.04, brass));
  }
  // corner lantern posts (tall) on the four chamfer corners at the front and back ends
  for (const i of [2, 3, 6, 7]) {
    const p = pts[i];
    root.add(box(0.34, 1.0, 0.34, iron, p.x, 0.5, p.y));
    root.add(box(0.24, 0.26, 0.24, lantern, p.x, 1.16, p.y));
    root.add(box(0.34, 0.08, 0.34, brassHi, p.x, 1.33, p.y));
    root.add(halo(0xff8a2a, 1.3, p.x, 1.16, p.y));
  }
  // lanterns hung on the front fascia
  for (const x of [-6.2, -3.1, 3.1, 6.2]) {
    root.add(box(0.06, 0.2, 0.06, brass, x, -0.85, DZ + 0.05));
    root.add(box(0.2, 0.24, 0.2, lantern, x, -1.05, DZ + 0.05));
    root.add(halo(0xff8a2a, 1.2, x, -1.05, DZ + 0.2));
  }
  for (const [x, z] of [[-6.2, DZ + 0.6], [6.2, DZ + 0.6], [0, DZ + 0.8]]) {
    const l = new THREE.PointLight(0xff9a3a, 2.5, 3.5, 1.6); l.position.set(x, 1.4, z - 1.4); lights.add(l);
  }
}

function buildUnderside(root) {
  const r = rng(42);
  const rockA = toon(C.rock), rockB = toon(C.iron);
  // rocks hang in an inverted dome, deepest under the middle
  for (let i = 0; i < 70; i++) {
    const x = (r() * 2 - 1) * (DX - 0.9), z = (r() * 2 - 1) * (DZ - 0.7);
    const fall = 1 - Math.pow(Math.abs(x) / DX, 2) * 0.8;
    const y = -THICK - 0.2 - r() * 1.3 * fall;
    const s = 0.55 + r() * 0.55;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), r() < 0.7 ? rockA : rockB);
    m.position.set(x, y, z); m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.y = 0.75;
    root.add(m);
  }
  const copper = toon(C.copper), brass = toon(C.brass), brassHi = toon(C.brassHi);
  // copper pipe loops hanging off the front face
  for (const x of [-4.7, -1.6, 1.6, 4.7]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.075, 5, 12, Math.PI), copper);
    t.rotation.z = Math.PI; t.position.set(x, -THICK + 0.02, DZ - 0.05); root.add(t);
  }
  // two copper elbows dropping out of the deck (the mockup's steam pipes, no steam: calm rule)
  for (const x of [3.6, 4.9]) {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.16, 6, 8, Math.PI / 2), copper);
    e.rotation.y = Math.PI / 2; e.position.set(x, -THICK - 0.05, DZ - 0.45); root.add(e);
    const p = cyl(0.16, 0.16, 0.6, copper); p.position.set(x, -THICK - 0.65, DZ - 0.1); root.add(p);
    const lip = cyl(0.21, 0.21, 0.1, brassHi); lip.position.set(x, -THICK - 0.98, DZ - 0.1); root.add(lip);
  }
  // the caged cyan orb
  const ox = -0.6, oz = DZ - 0.3;
  const rod = cyl(0.08, 0.08, 1.3, brass); rod.position.set(ox, -THICK - 0.65, oz); root.add(rod);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), glow(C.cyan, 1.4)); orb.position.set(ox, -THICK - 1.85, oz); root.add(orb);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 4, 12), brassHi);
    ring.position.copy(orb.position); ring.rotation.set(0, (i * Math.PI) / 3, 0);
    root.add(ring);
  }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.67, 0.06, 4, 12), brassHi); belt.position.copy(orb.position); belt.rotation.x = Math.PI / 2; root.add(belt);
  const l = new THREE.PointLight(0x41f3f7, 4, 3.5, 1.5); l.position.copy(orb.position); root.add(l);
  root.add(halo(0x41f3f7, 2.6, orb.position.x, orb.position.y, orb.position.z + 0.3, 0.45));
}

// ---------------- line: belt, stations, crate, Shippy ----------------
const BELT_Z = 0.7, BELT_Y = 0.16, X0 = -7.0, X1 = 7.0;
const STOP = { builder: -2.2, checks: 2.6 };

function buildBelt(root) {
  const tread = canvasTex(8, 8, (g) => {
    g.fillStyle = hex(C.rock); g.fillRect(0, 0, 8, 8);
    g.fillStyle = hex(C.iron); g.fillRect(0, 0, 8, 1); g.fillRect(0, 7, 8, 1);
    g.fillStyle = hex(C.brass); // chevrons pointing +x
    for (const [x, y] of [[2, 2], [3, 3], [4, 4], [3, 5], [2, 6]]) g.fillRect(x, y - 0.5, 2, 1);
  }, [(X1 - X0) / 0.7, 1]);
  const len = X1 - X0;
  const top = toon(0xffffff, { map: tread }), sideM = toon(C.iron), brass = toon(C.brass), brassHi = toon(C.brassHi);
  const geo = new THREE.BoxGeometry(len, 0.14, 0.7);
  const belt = new THREE.Mesh(geo, [sideM, sideM, top, sideM, sideM, sideM]);
  belt.position.set((X0 + X1) / 2, BELT_Y - 0.04, BELT_Z); root.add(belt);
  for (const dz of [-0.4, 0.4]) root.add(box(len + 0.3, 0.12, 0.1, brass, (X0 + X1) / 2, BELT_Y, BELT_Z + dz));
  for (const x of [X0 - 0.15, X1 + 0.15]) { const r = cyl(0.14, 0.14, 0.9, brassHi, 8); r.rotation.x = Math.PI / 2; r.position.set(x, BELT_Y - 0.02, BELT_Z); root.add(r); }
  for (let x = X0 + 1; x < X1; x += 2.5) root.add(box(0.12, 0.16, 0.6, toon(C.rust), x, 0.03, BELT_Z));
  return tread;
}

function gear(r, teeth, mat) {
  const g = new THREE.Group();
  const disc = cyl(r, r, 0.1, mat, 12); disc.rotation.x = Math.PI / 2; g.add(disc);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = box(0.14, 0.14, 0.1, mat, Math.cos(a) * (r + 0.05), Math.sin(a) * (r + 0.05), 0); t.rotation.z = a; g.add(t);
  }
  const hub = cyl(0.1, 0.1, 0.14, toon(C.steelDk), 6); hub.rotation.x = Math.PI / 2; g.add(hub);
  return g;
}

function buildBuilder(root) {
  const g = new THREE.Group(); g.position.set(STOP.builder, 0, -1.0); root.add(g);
  const iron = toon(C.iron), brass = toon(C.brass), brassHi = toon(C.brassHi), copper = toon(C.copper);
  g.add(box(2.0, 1.8, 1.7, iron, 0, 0.9, 0));
  // brass frame on every vertical edge + bands top and bottom
  for (const [x, z] of [[-1, -0.85], [1, -0.85], [-1, 0.85], [1, 0.85]]) g.add(box(0.16, 1.72, 0.16, brass, x, 0.86, z));
  for (const y of [0.08, 1.66]) { g.add(box(2.12, 0.14, 1.82, brass, 0, y, 0)); }
  // chimney
  const ch = cyl(0.32, 0.36, 0.8, brassHi, 10); ch.position.set(0.2, 2.1, -0.1); g.add(ch);
  const lip = cyl(0.4, 0.4, 0.12, brass, 10); lip.position.set(0.2, 2.5, -0.1); g.add(lip);
  // lever
  g.add(box(0.06, 0.5, 0.06, toon(C.steelDk), -0.6, 1.95, -0.2));
  const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), toon(C.rock)); knob.position.set(-0.6, 2.22, -0.2); g.add(knob);
  // side pipes
  for (const x of [-1.15, 1.15]) { const p = cyl(0.2, 0.2, 0.9, copper, 8); p.position.set(x, 0.7, 0.25); g.add(p); }
  // amber window
  const winMat = glow(C.amber, 0.6);
  g.add(box(0.5, 0.42, 0.04, winMat, 0.5, 1.15, 0.87));
  // gear on the front
  const gr = gear(0.42, 9, toon(C.steel)); gr.position.set(-0.3, 0.72, 0.9); g.add(gr);
  return { gear: gr, win: winMat, group: g };
}

function buildChecks(root) {
  const g = new THREE.Group(); g.position.set(STOP.checks, 0, -1.0); root.add(g);
  const iron = toon(C.iron), brass = toon(C.brass), brassHi = toon(C.brassHi);
  g.add(box(1.7, 1.3, 1.6, iron, 0, 0.65, 0));
  g.add(box(1.84, 0.12, 1.74, brass, 0, 1.26, 0));
  for (const [x, z] of [[-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8]]) g.add(box(0.14, 1.32, 0.14, brass, x, 0.66, z));
  g.add(box(1.82, 0.12, 1.72, brass, 0, 0.07, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.66, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon(C.steelDk));
  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.06, 4, 14), brassHi); domeRing.rotation.x = Math.PI / 2; domeRing.position.set(0, 1.32, 0); g.add(domeRing); dome.position.set(0, 1.3, 0); g.add(dome);
  const lampMat = glow(C.green, 0.25);
  const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), lampMat); lamp.position.set(0, 2.18, 0); g.add(lamp);
  g.add(box(0.08, 0.2, 0.08, brass, 0, 1.95, 0));
  // gauge on the front: cream face + needle
  const face = cyl(0.36, 0.36, 0.06, toon(C.cream), 12); face.rotation.x = Math.PI / 2; face.position.set(0, 0.72, 0.82); g.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 4, 12), brass); ring.position.copy(face.position); g.add(ring);
  const needle = new THREE.Group(); needle.position.set(0, 0.72, 0.87); g.add(needle);
  needle.add(box(0.05, 0.3, 0.03, toon(0x6a0d0d), 0, 0.13, 0));
  needle.rotation.z = 1.0;
  const light = new THREE.PointLight(0x81f381, 0, 3, 1.5); light.position.set(0, 2.3, 0.4); g.add(light);
  return { lamp: lampMat, needle, light };
}

function buildCrate(root) {
  const face = canvasTex(8, 8, (g) => {
    g.fillStyle = hex(C.crate); g.fillRect(0, 0, 8, 8);
    g.fillStyle = hex(C.crateDk); g.fillRect(0, 0, 8, 1); g.fillRect(0, 7, 8, 1); g.fillRect(0, 0, 1, 8); g.fillRect(7, 0, 1, 8);
    g.fillRect(1, 3, 6, 1);
    g.fillStyle = hex(C.brassHi); g.fillRect(0, 0, 1, 1); g.fillRect(7, 0, 1, 1); g.fillRect(0, 7, 1, 1); g.fillRect(7, 7, 1, 1);
  });
  const plain = toon(0xffffff, { map: face });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.56), plain);
  root.add(m);
  // once built: a cyan band (the code is in it)
  const band = box(0.6, 0.1, 0.6, glow(C.cyan, 0.9)); band.position.y = 0.05; band.visible = false; m.add(band);
  return { mesh: m, band };
}

function buildShippy(root) {
  const g = new THREE.Group(); g.position.set(-6.4, 0, -1.9); g.rotation.y = 0.5; root.add(g);
  // his folded box home
  const home = box(1.0, 0.36, 0.9, toon(C.rust), 0, 0.18, -0.15); g.add(home);
  g.add(box(1.04, 0.06, 0.94, toon(C.brass), 0, 0.36, -0.15));
  const bot = new THREE.Group(); bot.position.set(0, 0.39, 0); g.add(bot);
  const body = box(0.7, 0.56, 0.56, toon(C.steelDk), 0, 0.42, 0); bot.add(body);
  bot.add(box(0.74, 0.08, 0.6, toon(C.brassHi), 0, 0.14, 0));
  bot.add(box(0.52, 0.3, 0.04, toon(C.navy), 0, 0.46, 0.29));
  const eye = glow(C.cyan, 1.5);
  bot.add(box(0.09, 0.11, 0.03, eye, -0.12, 0.47, 0.32));
  bot.add(box(0.09, 0.11, 0.03, eye, 0.12, 0.47, 0.32));
  bot.add(box(0.04, 0.24, 0.04, toon(C.steel), 0.18, 0.8, 0));
  const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), glow(C.cyan, 1.2)); tip.position.set(0.18, 0.95, 0); bot.add(tip);
  for (const x of [-0.2, 0.2]) bot.add(box(0.14, 0.14, 0.3, toon(C.rock), x, 0.07, 0));
  return { bot };
}

// ---------------- the calm story loop ----------------
// strictly serial beats: one thing moves at a time
const BEATS = [
  ["appear", 0.5], ["toBuilder", 0], ["build", 1.8], ["toChecks", 0], ["check", 1.6], ["out", 0], ["leave", 0.5], ["shippy", 0.9], ["rest", 1.8],
];
const SPEED = 1.5;

export function buildScene() {
  const scene = new THREE.Scene();
  const root = new THREE.Group(); scene.add(root);
  const lights = new THREE.Group(); scene.add(lights);
  // sunset key from behind-right is the sky's story, but for read we light from front-left-top like the mockups
  const key = new THREE.DirectionalLight(0xffe6c8, 1.9); key.position.set(-5, 9, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a30, 1.6); rim.position.set(8, 3, -8); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffa070, 0x2a1020, 0.45));

  buildDeck(root, lights);
  buildUnderside(root);
  const tread = buildBelt(root);
  const builder = buildBuilder(root);
  const checks = buildChecks(root);
  const crate = buildCrate(root);
  const shippy = buildShippy(root);

  // durations for move beats come from distance
  const dur = (name) => {
    if (name === "toBuilder") return (STOP.builder - X0) / SPEED;
    if (name === "toChecks") return (STOP.checks - STOP.builder) / SPEED;
    if (name === "out") return (X1 - STOP.checks) / SPEED;
    return BEATS.find((b) => b[0] === name)[1];
  };
  const total = BEATS.reduce((s, [n]) => s + dur(n), 0);
  let t = 0;

  function pose(time) {
    let left = time % total, beat = "rest", u = 0;
    for (const [n] of BEATS) { const d = dur(n); if (left < d) { beat = n; u = left / d; break; } left -= d; }
    const ease = (x) => x * x * (3 - 2 * x);
    // defaults
    let cx = X0, scale = 1, built = false, beltOn = false;
    builder.win.emissiveIntensity = 0.6;
    checks.lamp.emissiveIntensity = 0.25; checks.light.intensity = 0; checks.needle.rotation.z = 1.0;
    shippy.bot.position.y = 0.39; shippy.bot.rotation.y = 0;
    const order = BEATS.map((b) => b[0]);
    const i = order.indexOf(beat);
    const past = (n) => order.indexOf(n) < i;
    if (beat === "appear") { scale = ease(u); }
    else if (beat === "toBuilder") { cx = X0 + (STOP.builder - X0) * ease(u); beltOn = true; }
    else if (beat === "build") { cx = STOP.builder; builder.gear.rotation.z = -ease(u) * Math.PI * 2; builder.win.emissiveIntensity = 0.6 + Math.sin(u * Math.PI) * 1.6; built = u > 0.5; }
    else if (beat === "toChecks") { cx = STOP.builder + (STOP.checks - STOP.builder) * ease(u); beltOn = true; built = true; }
    else if (beat === "check") {
      cx = STOP.checks; built = true;
      checks.needle.rotation.z = 1.0 - ease(Math.min(1, u * 1.6)) * 2.0;
      const on = u > 0.55 ? 1 : 0; checks.lamp.emissiveIntensity = 0.25 + on * 2.0; checks.light.intensity = on * 4;
    }
    else if (beat === "out") { cx = STOP.checks + (X1 - STOP.checks) * ease(u); beltOn = true; built = true; checks.lamp.emissiveIntensity = 2.2; }
    else if (beat === "leave") { cx = X1; built = true; scale = 1 - ease(u); }
    else if (beat === "shippy") { scale = 0; shippy.bot.position.y = 0.39 + Math.sin(u * Math.PI) * 0.35; shippy.bot.rotation.y = Math.sin(u * Math.PI * 2) * 0.25; }
    else if (beat === "rest") { scale = 0; }
    if (past("leave")) scale = 0;
    crate.mesh.position.set(cx, BELT_Y + 0.3 * scale, BELT_Z);
    crate.mesh.scale.setScalar(Math.max(0.001, scale));
    crate.band.visible = built;
    return beltOn;
  }

  return {
    scene,
    step(dt) {
      t += dt;
      const beltOn = pose(t);
      if (beltOn) tread.offset.x -= (dt * SPEED) / 0.7;
    },
    seek(time) { t = time; pose(t); },
  };
}
