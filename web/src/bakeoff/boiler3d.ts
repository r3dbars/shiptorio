// @ts-nocheck -- bake-off spike, kept loose like src/deck3d/
// Bake-off, 3D side: the same twin boiler (web/public/deck/art/boiler-on.webp) as real low-poly geometry. Lathe
// tanks with domed shoulders, copper pipes swept along bent paths (real elbows), brass bands with rivets, cool
// iron with rust painted into a pixel texture, glowing grate bars, and smoke puffs that rise and thin out.
// 1 world unit = 10 art px of the 2D version, so both sides share one layout.
import * as THREE from "three";
import { glow, metal, toon } from "./view3d";

const PX = 12; // texture px per world unit: about one texel per art px at the bake-off size
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
function tex(W, H, draw) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  draw(c.getContext("2d"), W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// cool dark iron, mottled, rust blooms that run down, vertical plate seams, grime at the foot
function ironTex(w, h, seed, { seams = 4, rust = 1 } = {}) {
  return tex(Math.round(w * PX), Math.round(h * PX), (g, W, H) => {
    const r = rng(seed);
    g.fillStyle = hex(0x3d4d6a); g.fillRect(0, 0, W, H);
    const MOT = [0x273349, 0x273349, 0x432f29, 0x6b5360];
    for (let i = 0; i < W * H * 0.12; i++) { g.fillStyle = hex(MOT[(r() * MOT.length) | 0]); g.fillRect((r() * W) | 0, (r() * H) | 0, 1 + ((r() * 2) | 0), 1); }
    const RUST = [0x5a3521, 0x834621, 0x713e30, 0x351705];
    for (let b = 0; b < Math.round(W * H * 0.003 * rust); b++) {
      let x = r() * W, y = r() * H * 0.85; const n = 8 + r() * 26;
      for (let i = 0; i < n; i++) { g.fillStyle = hex(RUST[(r() * RUST.length) | 0]); g.fillRect(x | 0, y | 0, 1 + ((r() * 2) | 0), 1); x += (r() - 0.5) * 2.2; y += r() * 1.3; }
    }
    for (let s = 0; s < seams; s++) { const x = Math.round((W * (s + 0.5)) / seams); g.fillStyle = hex(0x121e2b); g.fillRect(x, 0, 1, H); }
    g.fillStyle = hex(0x181211); for (let x = 0; x < W; x++) if (r() < 0.6) g.fillRect(x, H - 1 - ((r() * 3) | 0), 1, 1);
  });
}
function brassTex(seed) {
  return tex(16, 16, (g) => {
    const r = rng(seed);
    g.fillStyle = hex(0xa36915); g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 30; i++) { g.fillStyle = hex([0xc98115, 0x6d370c, 0xa36915, 0x422616][(r() * 4) | 0]); g.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1); }
  });
}
function copperTex(seed) {
  return tex(16, 16, (g) => {
    const r = rng(seed);
    g.fillStyle = hex(0xa04430); g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 40; i++) { g.fillStyle = hex([0xae6237, 0x834621, 0x713e30, 0xcd4f27][(r() * 4) | 0]); g.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 1); }
  });
}

/** A pipe swept along a path whose corners bend with radius `bend` (same recipe as the 2D tube()). */
function bentPipe(pts, r, bend, mat) {
  const path = new THREE.CurvePath();
  let a = pts[0].clone();
  for (let i = 1; i < pts.length - 1; i++) {
    const b = pts[i], c = pts[i + 1];
    const k = Math.min(bend, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const p0 = b.clone().add(a.clone().sub(b).setLength(k)), p2 = b.clone().add(c.clone().sub(b).setLength(k));
    path.add(new THREE.LineCurve3(a, p0));
    path.add(new THREE.QuadraticBezierCurve3(p0, b.clone(), p2));
    a = p2;
  }
  path.add(new THREE.LineCurve3(a, pts[pts.length - 1].clone()));
  return new THREE.Mesh(new THREE.TubeGeometry(path, 48, r, 12, false), mat);
}

export function buildBoiler3D() {
  const scene = new THREE.Scene();
  const g = new THREE.Group(); scene.add(g);
  const brass = metal(0xffffff, { map: brassTex(3) }), brassHi = metal(0xc98115), copper = metal(0xa04430);
  const dark = toon(0x0a0604), ironDk = toon(0x181211);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // light from the upper right, in front; a cool fill so the iron stays blue-grey in the shadows
  const key = new THREE.DirectionalLight(0xfff0d8, 3.6); key.position.set(4, 6, 5); scene.add(key);
  scene.add(new THREE.HemisphereLight(0x8090b0, 0x2a1408, 1.3));

  const TX = [-1.85, 1.85], R0 = 1.5, NECK = 0.65;
  const fires = [], lights = [];
  TX.forEach((tx, i) => {
    // tank: body + dome as one lathe, its own rusty iron texture
    const prof = [];
    prof.push(new THREE.Vector2(0.001, 0));
    prof.push(new THREE.Vector2(R0, 0));
    prof.push(new THREE.Vector2(R0, 2.1));
    for (let k = 1; k <= 8; k++) { const t = k / 8; prof.push(new THREE.Vector2(NECK + (R0 - NECK) * Math.cos((t * Math.PI) / 2), 2.1 + Math.sin((t * Math.PI) / 2) * 0.95)); }
    const tank = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), metal(0xffffff, { shininess: 22, specular: 0x403a3a, map: ironTex(2 * Math.PI * R0, 3.1, 11 + i * 7) }));
    tank.position.set(tx, 0, 0); g.add(tank);
    // brass bands (top of body, the thin fire belt, the foot) with rivets on the visible half
    for (const [y, h, rv] of [[1.8, 0.4, true], [1.3, 0.1, false], [0.0, 0.5, true]]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.07, R0 + 0.07, h, 28), brass); band.position.set(tx, y + h / 2, 0); g.add(band);
      if (rv) for (let a = -1.5; a <= 1.5; a += 0.22) {
        const rv1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 3), brassHi);
        rv1.position.set(tx + Math.sin(a) * (R0 + 0.1), y + h / 2, Math.cos(a) * (R0 + 0.1)); g.add(rv1);
      }
    }
    // neck collar with rivets
    const col = new THREE.Mesh(new THREE.CylinderGeometry(NECK + 0.15, NECK + 0.2, 0.3, 20), brass); col.position.set(tx, 3.05, 0); g.add(col);
    // chimney: copper with two brass collars and a flared lip around a dark mouth
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 20), copper); ch.position.set(tx, 3.85, 0); g.add(ch);
    for (const y of [4.25, 3.5]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.24, 20), brass); c.position.set(tx, y, 0); g.add(c); }
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.62, 0.32, 20), brass); lip.position.set(tx, 4.6, 0); g.add(lip);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.02, 20), dark); mouth.position.set(tx, 4.77, 0); g.add(mouth);
    // fire window: brass frame, dark box, three glowing grate bars; an orange point light warms the iron round it
    const fz = R0 - 0.02;
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.2), brass); fr.position.set(tx, 0.85, fz); g.add(fr);
    const inn = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.1), dark); inn.position.set(tx, 0.85, fz + 0.07); g.add(inn);
    const fire = glow(0xfc8717, 1.4); fires.push(fire);
    for (const dx of [-0.35, 0, 0.35]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.06), fire); b.position.set(tx + dx, 0.88, fz + 0.12); g.add(b); }
    const pl = new THREE.PointLight(0xff8a2a, 3, 2.4, 1.4); pl.position.set(tx, 0.9, fz + 0.6); g.add(pl); lights.push(pl);
  });

  // the high pipe linking the chimneys and dropping to each cabinet, then shoulder pipes and the middle hoop + riser
  g.add(bentPipe([V(-1.6, 3.9, 0), V(-4.0, 3.9, 0), V(-4.0, 1.6, 0)], 0.25, 0.6, copper));
  g.add(bentPipe([V(1.6, 3.9, 0), V(4.0, 3.9, 0), V(4.0, 1.6, 0)], 0.25, 0.6, copper));
  g.add(bentPipe([V(-1.6, 3.9, 0), V(1.6, 3.9, 0)], 0.25, 0, copper));
  for (const x of [-3.1, 0, 3.1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.26, 12), brass); c.rotation.z = Math.PI / 2; c.position.set(x, 3.9, 0); g.add(c); }
  g.add(bentPipe([V(-2.9, 2.4, 0.4), V(-3.5, 2.4, 0.4), V(-3.5, 1.6, 0.4)], 0.2, 0.4, copper));
  g.add(bentPipe([V(2.9, 2.4, 0.4), V(3.5, 2.4, 0.4), V(3.5, 1.6, 0.4)], 0.2, 0.4, copper));
  g.add(bentPipe([V(-0.75, 2.3, 0.9), V(0, 2.8, 0.9), V(0.75, 2.3, 0.9)], 0.2, 0.6, copper));
  g.add(bentPipe([V(0, 2.6, 1.05), V(0, 0, 1.05)], 0.22, 0, copper));
  for (const y of [0.6, 1.8]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), brass); c.position.set(0, y, 1.05); g.add(c); }

  // cabinets out front at each end: riveted iron with a brass frame, vents and a nameplate
  for (const sx of [-1, 1]) {
    const cx = sx * 3.85, cz = 0.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 1.0), toon(0xffffff, { map: ironTex(1.2, 1.7, 40 + sx, { seams: 0, rust: 0.6 }) }));
    box.position.set(cx, 0.85, cz); g.add(box);
    for (const [w, h, x, y] of [[1.26, 0.08, 0, 1.7], [1.26, 0.08, 0, 0.04], [0.08, 1.7, -0.6, 0.85], [0.08, 1.7, 0.6, 0.85]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), brass); f.position.set(cx + x, y, cz + 0.5); g.add(f);
    }
    for (let k = 0; k < 4; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 0.04), dark); v.position.set(cx, 1.45 - k * 0.2, cz + 0.51); g.add(v); }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.04), brassHi); plate.position.set(cx, 0.35, cz + 0.52); g.add(plate);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.1), ironDk); top.position.set(cx, 1.73, cz); g.add(top);
  }

  // smoke: puffs born at each mouth, swelling as they rise and drift right, thinning out (alpha-hashed = dithered)
  const puffs = [];
  TX.forEach((tx, i) => {
    for (let k = 0; k < 6; k++) {
      const mat = toon(0x9c9494, { alphaHash: true, opacity: 1, depthWrite: false });
      const m = new THREE.Group();
      for (const [x, y, s] of [[0, 0, 1], [0.55, 0.25, 0.7], [-0.45, 0.3, 0.6], [0.1, 0.6, 0.65]]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat); b.position.set(x, y, 0); m.add(b); }
      g.add(m); puffs.push({ m, mat, tx, k, seed: i * 1.7 });
    }
  });

  const target = new THREE.Vector3(0, 3.0, 0);
  let tt = 0;
  return {
    scene, target, radius: 3.9,
    step(dt) {
      tt += dt;
      for (const p of puffs) {
        const q = (tt / 2 + p.k / 6 + p.seed * 0.13) % 1;
        p.m.scale.setScalar(0.22 + q * 0.6);
        p.m.position.set(p.tx + q * 0.9 + Math.sin(q * 7 + p.seed) * 0.18, 4.95 + q * 2.4, 0);
        p.mat.opacity = q < 0.65 ? 1 : 1 - (q - 0.65) / 0.35;
      }
      fires.forEach((f, i) => (f.emissiveIntensity = 1.35 + Math.sin(tt * 3 + i * 2) * 0.08));
    },
  };
}
