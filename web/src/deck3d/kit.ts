// @ts-nocheck -- time-boxed spike, kept loose on purpose
// The shared parts kit for /deck3d.html: Black Iron palette colors, toon materials (iron plates, shiny brass,
// copper, glass), canvas textures, and a part builder (boxes, pipes, rivets, plated machine bodies with brass
// brackets) so each station is mostly an arrangement of the same pieces, like the mockup art.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const C = {
  black: 0x0a0604, soot: 0x181211, iron: 0x291b17, ironHi: 0x432f29, slate: 0x273349, slateHi: 0x3d4d6a, navy: 0x121e2b,
  steel: 0x7d8ea3, plate: 0x834621, rust: 0x5a3521, rustHi: 0xa04430, brassDk: 0x6d370c, brass: 0xa36915, brassHi: 0xc98115,
  gold: 0xfdc727, copper: 0xae6237, copperDk: 0x834621, amber: 0xfc8717, cyan: 0x41f3f7, blue: 0x0ea0ac, green: 0x1ab004,
  greenHi: 0x81f381, red: 0xc8231b, redHi: 0xff5b4a, cream: 0xeed3c5, white: 0xfdfaec, crate: 0xae6237, crateDk: 0x6d370c,
};

export function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

function rampTex(steps) {
  const d = new Uint8Array(steps.flatMap((v) => [v, v, v, 255]));
  const t = new THREE.DataTexture(d, steps.length, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
// 3 flat bands for iron and paint; brass gets a 4th, hot band so lit faces shine like the art
const RAMP = rampTex([70, 160, 255]);
const SHINE = rampTex([60, 130, 200, 255]);
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...extra });
export const shiny = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: SHINE, ...extra });
export const glow = (color, intensity = 1.6) => new THREE.MeshToonMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, gradientMap: RAMP });

export function canvasTex(w, h, draw, repeat = [1, 1], mip = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = mip ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter; t.generateMipmaps = mip;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// halos: additive sprites drawn only in the color pass (post.ts enables layer 1 there)
const haloTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.35, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
export const HALO_LAYER = 1;
export function halo(color, size, x, y, z, opacity = 0.55) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size); s.position.set(x, y, z); s.layers.set(HALO_LAYER); return s;
}

const PX = 26; // texture pixels per world unit
// riveted plate in the mockups' cool slate iron with rust blooms, seams and brass rivets
export function plateTexture(w, h, seed, { seams = 1, rivets = true, rust = 1 } = {}) {
  const W = Math.max(8, Math.round(w * PX)), H = Math.max(8, Math.round(h * PX));
  return canvasTex(W, H, (g) => {
    const r = rng(seed);
    const IRON = [C.slate, C.slate, C.navy, C.slateHi], RUST = [C.rust, C.plate, C.brassDk, C.rustHi];
    g.fillStyle = hex(C.slate); g.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H * 0.35; i++) { g.fillStyle = hex(IRON[(r() * IRON.length) | 0]); g.fillRect((r() * W) | 0, (r() * H) | 0, 1, 1); }
    for (let b = 0; b < Math.round(W * H * 0.004 * rust); b++) {
      let x = r() * W, y = r() * H * 0.8; const n = 8 + r() * 26;
      for (let i = 0; i < n; i++) { g.fillStyle = hex(RUST[(r() * RUST.length) | 0]); g.fillRect(x | 0, y | 0, 1 + ((r() * 2) | 0), 1); x += (r() - 0.5) * 2.4; y += r() * 1.2; }
    }
    for (let s = 1; s <= seams; s++) { const x = Math.round((W * s) / (seams + 1)); g.fillStyle = hex(C.black); g.fillRect(x, 0, 1, H); g.fillStyle = hex(C.slateHi); g.fillRect(x + 1, 0, 1, H); }
    if (rivets) {
      const dot = (x, y) => { g.fillStyle = hex(C.brassHi); g.fillRect(x, y, 1, 1); g.fillStyle = hex(C.black); g.fillRect(x, y + 1, 1, 1); };
      for (let x = 3; x < W - 2; x += 5) { dot(x, 2); dot(x, H - 4); }
      for (let y = 7; y < H - 4; y += 5) { dot(2, y); dot(W - 3, y); }
    }
    g.fillStyle = hex(C.steel); g.fillRect(0, 0, W, 1);
    g.fillStyle = hex(C.black); g.fillRect(0, H - 1, W, 1);
  }, [1, 1], false);
}
const brassTex = canvasTex(16, 16, (g) => {
  const r = rng(3);
  g.fillStyle = hex(C.brassHi); g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 26; i++) { g.fillStyle = hex([C.brass, C.brassDk, C.brass][(r() * 3) | 0]); g.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1); }
}, [1, 1], false);

// shared materials
export const M = {
  brass: shiny(0xffffff, { map: brassTex }), brassHi: shiny(C.gold), brassDk: toon(C.brass), copper: shiny(C.copper),
  copperDk: toon(C.copperDk), iron: toon(C.slate), ironDk: toon(C.navy), soot: toon(C.soot), black: toon(C.black),
  steel: shiny(C.steel), cream: toon(C.cream), white: toon(C.white), red: toon(C.red),
};

// part builder bound to a group
export function parts(g) {
  const add = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); g.add(o); return o; };
  const rot = (o, axis) => { if (axis === "x") o.rotation.z = Math.PI / 2; else if (axis === "z") o.rotation.x = Math.PI / 2; return o; };
  const P = {
    g, add,
    box: (w, h, d, m, x, y, z) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z),
    rbox: (w, h, d, m, x, y, z, r = 0.06) => add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, r), m), x, y, z),
    cyl: (rt, rb, h, m, x, y, z, axis = "y", seg = 12) => rot(add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), x, y, z), axis),
    ball: (r, m, x, y, z, detail = 1) => add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m), x, y, z),
    torus: (R, r, m, x, y, z, axis = "z", arc = Math.PI * 2, seg = 14) => { const o = add(new THREE.Mesh(new THREE.TorusGeometry(R, r, 5, seg, arc), m), x, y, z); if (axis === "y") o.rotation.x = Math.PI / 2; if (axis === "x") o.rotation.y = Math.PI / 2; return o; },
    rivet: (x, y, z, s = 0.07) => P.box(s, s, s, M.brassHi, x, y, z),
    // a bent pipe through points (copper by default) with brass collars at the ends
    pipe: (pts, r = 0.1, m = M.copper) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.1);
      const o = add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 8, r, 8, false), m));
      for (const p of [pts[0], pts[pts.length - 1]]) P.ball(r * 1.35, M.brass, ...p, 0);
      return o;
    },
    // a plated machine body: rounded slate block, a riveted plate texture per face, brass bands and corner brackets
    plated: (w, h, d, x, y, z, seed = 1, { bands = true, brackets = true } = {}) => {
      const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]].map(([a, b], i) => toon(0xffffff, { map: plateTexture(a, b, seed * 10 + i) }));
      const body = add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, 0.07), faces), x, y + h / 2, z);
      if (bands) {
        const top = y + h - 0.06;
        P.box(w + 0.08, 0.14, 0.1, M.brass, x, top, z + d / 2); P.box(w + 0.08, 0.14, 0.1, M.brass, x, top, z - d / 2);
        P.box(0.1, 0.14, d + 0.08, M.brass, x + w / 2, top, z); P.box(0.1, 0.14, d + 0.08, M.brass, x - w / 2, top, z);
        P.box(w + 0.1, 0.13, d + 0.1, M.brass, x, y + 0.06, z);
      }
      if (brackets) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx = x + sx * (w / 2 + 0.01), cz = z + sz * (d / 2 + 0.01);
        P.box(0.22, h - 0.12, 0.05, M.brass, cx - sx * 0.09, y + h / 2, cz);
        P.box(0.05, h - 0.12, 0.22, M.brass, cx, y + h / 2, cz - sz * 0.09);
        for (const yy of [y + 0.3, y + h / 2, y + h - 0.3]) { P.rivet(cx - sx * 0.11, yy, cz + sz * 0.03, 0.06); P.rivet(cx + sx * 0.03, yy, cz - sz * 0.11, 0.06); }
      }
      return body;
    },
    // lantern: brass cap and base, glowing glass, halo
    lantern: (x, y, z, color = C.amber, s = 1) => {
      P.cyl(0.13 * s, 0.13 * s, 0.06 * s, M.brass, x, y - 0.16 * s, z, "y", 8);
      const glass = P.cyl(0.1 * s, 0.1 * s, 0.24 * s, glow(color, 1.8), x, y, z, "y", 8);
      P.cyl(0.05 * s, 0.14 * s, 0.08 * s, M.brass, x, y + 0.16 * s, z, "y", 8);
      g.add(halo(color, 0.9 * s, x, y, z + 0.1, 0.45));
      return glass;
    },
  };
  return P;
}

export function gear(r, teeth, mat) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 14), mat); disc.rotation.x = Math.PI / 2; g.add(disc);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.1), mat); t.position.set(Math.cos(a) * (r + 0.05), Math.sin(a) * (r + 0.05), 0); t.rotation.z = a; g.add(t);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.16, 8), M.brass); hub.rotation.x = Math.PI / 2; g.add(hub);
  return g;
}
