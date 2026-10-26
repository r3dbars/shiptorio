// Black Iron world parts (docs/art/IRON-STYLE.md §9, reference docs/art/black-iron/modules/world.js and
// underside.js): the island as an oily cobbled foundry deck on a sooty brick-and-iron hull, furnace glow
// and lit windows underneath, molten pours instead of waterfalls, rusty ballast rocks instead of moss.
// Everything here is static except what the scene ticks (pours, drips), so it bakes to a few meshes.

import * as THREE from "three";
import { box, canvasTex, cyl, group, rep } from "./kit";

// Palette C from the reference, lifted for phones (IRON-STYLE §2 / CONTRACT "Look + brightness").
export const C = {
  soot: 0x1e1814, iron: 0x3a322b, ironL: 0x5a5046, ironM: 0x463d35,
  brass: 0xa87a34, brassD: 0x6a4c22, brassL: 0xd0a24e,
  copper: 0x9a4e2a, copperD: 0x643220, verd: 0x3e8a72, verdD: 0x2a5e4e,
  brick: 0x6a3020, brickD: 0x4a2216, stone: 0x6a5c4e, stoneD: 0x4a4036,
  wood: 0x5e4026, woodD: 0x45301c, cream: 0xd8c49a, rust: 0x6a3418, rustL: 0x86481f,
  gas: 0xffc070, ember: 0xff7a2a, red: 0xc03a24, hazard: 0xd8a018, hazardD: 0x1a140c, teal: 0x7af0d8,
};

const DONE = Symbol("ironized");
type Paintable = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; [DONE]?: true };

// Lit material with a little shine (brass, oil, iron). Cached so the island bakes by material.
const lit = new Map<string, THREE.MeshPhongMaterial>();
export function iron(color: number, shine = 0, spec?: number) {
  const k = `${color}:${shine}:${spec ?? -1}`;
  let m = lit.get(k);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: shine, specular: spec ?? (shine ? 0x333333 : 0) });
    (m as Paintable)[DONE] = true; // already Black Iron: ironize() leaves it alone
    lit.set(k, m);
  }
  return m;
}
// Unlit glow (windows, furnace mouths, embers): bright enough to catch the pixel pass's bloom.
const glows = new Map<number, THREE.MeshBasicMaterial>();
export function glow(color: number) {
  let m = glows.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, fog: false });
    (m as Paintable)[DONE] = true;
    glows.set(color, m);
  }
  return m;
}

export const M = {
  get iron() { return iron(C.iron, 24, 0x34343a); },
  get ironM() { return iron(C.ironM, 18, 0x2a2a30); },
  get ironL() { return iron(C.ironL, 30, 0x44444a); },
  get brass() { return iron(C.brass, 38, 0x8a6a30); },
  get brassL() { return iron(C.brassL, 50, 0xa88a48); },
  get brassD() { return iron(C.brassD, 22, 0x4a3418); },
  get copper() { return iron(C.copper, 34, 0x7a4a28); },
  get copperD() { return iron(C.copperD, 18); },
  get rust() { return iron(C.rust); },
  get rustL() { return iron(C.rustL); },
  get soot() { return iron(C.soot); },
  get stone() { return iron(C.stone); },
  get stoneD() { return iron(C.stoneD); },
  get brick() { return iron(C.brick); },
  get brickD() { return iron(C.brickD); },
  get hazard() { return iron(C.hazard); },
  get hazardD() { return iron(C.hazardD); },
  get verd() { return iron(C.verd, 20); },
  get wood() { return iron(C.wood); },
};

// ---------- textures (ported from world.js: cobble, brick, stone) ----------
const srand = (s: number) => () => {
  s = (s * 16807) % 2147483647;
  return (s - 1) / 2147483646;
};

let T: { cobble: THREE.Texture; brick: THREE.Texture; brickSoot: THREE.Texture; stone: THREE.Texture; molten: THREE.Texture } | null = null;
export function ironTex() {
  if (T) return T;
  const cobble = canvasTex(128, 128, (g) => {
    const r = srand(31);
    g.fillStyle = "#1c1611";
    g.fillRect(0, 0, 128, 128);
    const tones = ["#564e46", "#4e4640", "#5c544c", "#48423c", "#625a52", "#524a44", "#4a443e", "#5a5048"];
    for (let y = 0; y < 128; y += 9) {
      let x = -Math.floor(r() * 8);
      while (x < 128) {
        const w = 7 + Math.floor(r() * 5), h = 7 + Math.floor(r() * 2), oy = Math.floor(r() * 2);
        g.fillStyle = tones[Math.floor(r() * tones.length)];
        g.fillRect(x + 1, y + 1 + oy, w - 1, h - 1);
        g.fillRect(x + 2, y + oy, w - 3, 1);
        g.fillStyle = "rgba(255,236,210,0.09)";
        g.fillRect(x + 2, y + 1 + oy, w - 3, 1);
        g.fillStyle = "rgba(0,0,0,0.22)";
        g.fillRect(x + 1, y + h - 1 + oy, w - 1, 1);
        if (r() < 0.08) {
          g.fillStyle = "rgba(140,60,20,0.35)";
          g.fillRect(x + 2, y + 2 + oy, w - 3, h - 3);
        }
        x += w;
      }
    }
    // calmer than the reference: fewer, softer oil stains, so the machines carry the contrast
    for (let i = 0; i < 10; i++) {
      g.fillStyle = "rgba(6,4,3,0.3)";
      const x = r() * 112, y = r() * 112;
      g.fillRect(x, y, 8 + r() * 14, 4 + r() * 7);
      g.fillRect(x + 3, y - 2, 5 + r() * 6, 2);
    }
    for (let i = 0; i < 20; i++) {
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(Math.floor(r() * 64) * 2, Math.floor(r() * 64) * 2, 2, 2);
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = "rgba(130,56,20,0.25)";
      g.fillRect(r() * 120, r() * 120, 7, 3);
    }
  });
  const brickOf = (dark: boolean, soot: boolean) =>
    canvasTex(64, 64, (g) => {
      const r = srand(7);
      g.fillStyle = dark ? "#24140e" : "#2e1a12";
      g.fillRect(0, 0, 64, 64);
      const tones = dark ? ["#5e2a1c", "#522418", "#6a3020"] : ["#843e28", "#783420", "#904a30", "#6e3020"];
      for (let y = 0; y < 64; y += 8)
        for (let x = (y / 8) % 2 ? -8 : 0; x < 64; x += 16) {
          g.fillStyle = tones[Math.floor(r() * tones.length)];
          g.fillRect(x + 1, y + 1, 14, 6);
          g.fillStyle = "rgba(255,210,170,0.10)";
          g.fillRect(x + 1, y + 1, 14, 1);
          g.fillStyle = "rgba(0,0,0,0.18)";
          g.fillRect(x + 1, y + 6, 14, 1);
        }
      if (soot) {
        const gr = g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, "rgba(8,5,3,0.6)");
        gr.addColorStop(0.45, "rgba(8,5,3,0.16)");
        gr.addColorStop(1, "rgba(8,5,3,0.05)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
      }
      for (let i = 0; i < 4; i++) {
        g.fillStyle = "rgba(110,46,16,0.28)";
        g.fillRect(Math.floor(r() * 60), 20 + r() * 10, 2, 30 + r() * 14);
      }
    });
  const stone = canvasTex(64, 64, (g) => {
    const r = srand(13);
    g.fillStyle = "#2a2018";
    g.fillRect(0, 0, 64, 64);
    const tones = ["#76685a", "#6c5e4e", "#806e5c", "#685a4a"];
    for (let y = 0; y < 64; y += 16)
      for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
        g.fillStyle = tones[Math.floor(r() * 4)];
        g.fillRect(x + 1, y + 1, 22, 14);
        g.fillStyle = "rgba(255,230,190,0.10)";
        g.fillRect(x + 2, y + 1, 20, 2);
        g.fillStyle = "rgba(0,0,0,0.2)";
        g.fillRect(x + 2, y + 13, 20, 2);
      }
    for (let i = 0; i < 5; i++) {
      g.fillStyle = "rgba(10,6,4,0.35)";
      g.fillRect(r() * 64, 0, 2 + r() * 3, 64);
    }
  });
  // a pour of molten slag: hot streaks on orange, scrolled down by the scene
  const molten = canvasTex(8, 32, (g) => {
    const r = srand(5);
    g.fillStyle = "#ff7a2a";
    g.fillRect(0, 0, 8, 32);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = r() < 0.55 ? "#ffd27a" : "#c8401a";
      g.fillRect(Math.floor(r() * 8), Math.floor(r() * 32), 1, 3 + Math.floor(r() * 6));
    }
  });
  T = { cobble, brick: brickOf(false, false), brickSoot: brickOf(true, true), stone, molten };
  return T;
}

// One material per texture, tiled in world units (`unit` world units per texture repeat), so every box
// that uses it can bake into a single mesh no matter its size.
const worldMats = new Map<string, THREE.MeshPhongMaterial>();
export function worldMat(name: "cobble" | "brick" | "brickSoot" | "stone", unit: number) {
  const k = `${name}:${unit}`;
  let m = worldMats.get(k);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0, specular: 0 });
    m.map = rep(ironTex()[name], 1 / unit, 1 / unit);
    (m as Paintable)[DONE] = true;
    worldMats.set(k, m);
  }
  return m;
}
// A box whose UVs are in world units (u along the face's width, v along its height), for worldMat().
export function worldBox(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, p?: THREE.Object3D) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z, 4 vertices each
  const size: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * size[f][0], uv.getY(i) * size[f][1]);
  }
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  p?.add(o);
  return o;
}

// A row of brass rivets along x (or z), on a face.
function rivets(p: THREE.Object3D, x0: number, x1: number, y: number, z: number, step: number, alongZ = false) {
  for (let a = x0; a <= x1; a += step) {
    const r = box(0.07, 0.07, 0.07, M.brassL, alongZ ? z : a, y, alongZ ? a : z, p);
    r.castShadow = false;
  }
}

// ---------- the island: cobbled deck on a brick-and-iron hull ----------

// Layers of the hull below the slab: how far each tier is inset, and how tall it is (× depth scale).
const HULL = [
  { s: 0.95, h: 2.3 },
  { s: 0.82, h: 2.5 },
  { s: 0.65, h: 2.4 },
  { s: 0.46, h: 2.1 },
  { s: 0.28, h: 1.7 },
];
const SLAB = 1.5;

export function makeIronIsland(w: number, d: number, depth: number) {
  const g = new THREE.Group();
  const r = srand(Math.round(w * 13 + d * 7));
  const W = w + 1.2, D = d + 1.2;
  const k = Math.max(0.6, (depth - SLAB - 1.6) / HULL.reduce((a, t) => a + t.h, 0));

  // deck slab: oily cobbles on top, dressed stone on the sides (two meshes, each bakes with its kind)
  worldBox(W, SLAB - 0.02, D, worldMat("stone", 2.6), 0, -0.01 - SLAB / 2, 0, g);
  worldBox(W, 0.02, D, worldMat("cobble", 4.6), 0, 0, 0, g).castShadow = false;
  // iron curb frame around the deck, brass-riveted, hazard paint along the two edges the camera sees
  const cy = 0.07;
  for (const sz of [-1, 1]) box(W + 0.12, 0.14, 0.32, M.ironM, 0, cy, (sz * (D - 0.26)) / 2, g);
  for (const sx of [-1, 1]) box(0.32, 0.14, D - 0.2, M.ironM, (sx * (W - 0.26)) / 2, cy, 0, g);
  rivets(g, -W / 2 + 0.3, W / 2 - 0.3, 0.15, D / 2 - 0.13, 0.9);
  rivets(g, -D / 2 + 0.3, D / 2 - 0.3, 0.15, W / 2 - 0.13, 0.9, true);
  for (let x = -W / 2 + 0.6, i = 0; x < W / 2 - 0.6; x += 0.5, i++) box(0.24, 0.02, 0.1, i % 2 ? M.hazardD : M.hazard, x, 0.02, D / 2 - 0.42, g).castShadow = false;
  for (let z = -D / 2 + 0.6, i = 0; z < D / 2 - 0.6; z += 0.5, i++) box(0.1, 0.02, 0.24, i % 2 ? M.hazardD : M.hazard, W / 2 - 0.42, 0.02, z, g).castShadow = false;

  // the two faces the camera sees: an I-beam girder along the top edge, brackets and braces,
  // glowing furnace vents in the slab, drain spouts, rust bleeding down the stone
  const FZ = D / 2, FX = W / 2;
  const face = (along: number, len: number, _onX: boolean, fn: (a: number) => void) => {
    for (let a = -len / 2 + along; a < len / 2 - 0.4; a += along) fn(a);
  };
  const at = (onX: boolean, a: number, out: number): [number, number] => (onX ? [FX + out, a] : [a, FZ + out]);
  for (const onX of [false, true]) {
    const len = onX ? D : W;
    const ry = onX ? Math.PI / 2 : 0;
    const beam = (y: number, h: number, dep: number, out: number, m: THREE.Material) => {
      const [x, z] = at(onX, 0, out);
      const b = box(len + 0.2, h, dep, m, x, y, z, g);
      b.rotation.y = ry;
    };
    beam(-0.1, 0.34, 0.12, 0.08, M.ironM);
    beam(0.05, 0.06, 0.3, 0.12, M.iron);
    beam(-0.26, 0.06, 0.3, 0.12, M.iron);
    beam(-1.36, 0.18, 0.1, 0.06, M.ironM);
    for (let a = -len / 2 + 0.2; a <= len / 2 - 0.2; a += 0.38) {
      for (const y of [-0.02, -0.18]) {
        const [x, z] = at(onX, a, 0.17);
        box(0.06, 0.06, 0.06, M.brassL, x, y, z, g).castShadow = false;
      }
    }
    face(2.9, len, onX, (a) => {
      let [x, z] = at(onX, a, 0.12);
      const br = box(0.22, 1.42, 0.18, M.iron, x, -0.68, z, g);
      br.rotation.y = ry;
      [x, z] = at(onX, a + 0.42, 0.17);
      const brace = box(0.08, 1.2, 0.06, M.ironM, x, -0.72, z, g);
      brace.rotation.set(0, ry, 0.62, "YXZ");
    });
    // furnace vents: a glowing slit behind iron louvres
    face(3.6, len, onX, (a) => {
      if (r() < 0.35) return;
      const c = a + 1.45;
      let [x, z] = at(onX, c, 0.01);
      box(onX ? 0.02 : 0.9, 0.22, onX ? 0.9 : 0.02, glow(r() < 0.7 ? C.ember : 0xffa040), x, -0.92, z, g).castShadow = false;
      for (let i = 0; i < 5; i++) {
        [x, z] = at(onX, c - 0.36 + i * 0.18, 0.03);
        box(onX ? 0.06 : 0.05, 0.28, onX ? 0.05 : 0.06, M.soot, x, -0.92, z, g).castShadow = false;
      }
      for (const y of [-0.77, -1.07]) {
        [x, z] = at(onX, c, 0.04);
        box(onX ? 0.08 : 1.02, 0.06, onX ? 1.02 : 0.08, M.ironM, x, y, z, g);
      }
    });
    // rust streaks bleeding down the stone under the girder
    for (let a = -len / 2 + 0.3; a < len / 2 - 0.3; a += 0.6) {
      if (r() > 0.5) continue;
      const h = 0.3 + r() * 0.6;
      const [x, z] = at(onX, a + r() * 0.3, 0.012);
      box(onX ? 0.01 : 0.06 + r() * 0.08, h, onX ? 0.06 + r() * 0.08 : 0.01, M.rust, x, -0.3 - h / 2, z, g).castShadow = false;
    }
  }

  // ---- the hull: stepped tiers of sooty brick with iron ledges, lit windows and furnace mouths ----
  let y = 0.01 - SLAB;
  let prevW = W, prevD = D;
  HULL.forEach((tier, i) => {
    const h = tier.h * k;
    const tw = W * tier.s, td = D * tier.s;
    const hull = worldBox(tw, h, td, worldMat("brickSoot", 2.2), 0, y - h / 2, 0, g);
    hull.castShadow = false; // nothing below the deck sees the sun
    // iron ledge where this tier meets the one above, with a riveted band
    box(prevW * (i ? 1 : 0.995) + 0.1, 0.24, prevD * (i ? 1 : 0.995) + 0.1, M.iron, 0, y - 0.12, 0, g);
    box(tw + 0.12, 0.16, td + 0.12, M.ironM, 0, y - h + 0.08, 0, g);
    rivets(g, -tw / 2 + 0.2, tw / 2 - 0.2, y - h + 0.1, td / 2 + 0.07, 0.7);
    rivets(g, -td / 2 + 0.2, td / 2 - 0.2, y - h + 0.1, tw / 2 + 0.07, 0.7, true);

    // windows on the camera-facing faces: some lit warm, some furnace orange, some dark
    const rows = Math.max(1, Math.floor((h - 0.6) / 1.1));
    for (const onX of [false, true]) {
      const len = onX ? td : tw, out = (onX ? tw : td) / 2;
      const cols = Math.floor((len - 1) / 1.5);
      for (let c = 0; c < cols; c++)
        for (let rr = 0; rr < rows; rr++) {
          const a = -len / 2 + 0.75 + (c + 0.5) * ((len - 1.5) / cols);
          const wy = y - 0.45 - (rr + 0.5) * ((h - 0.6) / rows);
          const roll = r();
          if (roll < 0.3) continue;
          const m = roll < 0.62 ? glow(0xd8803a) : roll < 0.72 ? glow(0xffc070) : M.soot;
          const px = onX ? out + 0.01 : a, pz = onX ? a : out + 0.01;
          box(onX ? 0.02 : 0.34, 0.44, onX ? 0.34 : 0.02, m, px, wy, pz, g).castShadow = false;
          // iron frame: a sill and a mullion
          box(onX ? 0.06 : 0.44, 0.06, onX ? 0.44 : 0.06, M.iron, onX ? out + 0.03 : a, wy - 0.25, onX ? a : out + 0.03, g).castShadow = false;
          box(onX ? 0.05 : 0.04, 0.44, onX ? 0.04 : 0.05, M.iron, onX ? out + 0.03 : a, wy, onX ? a : out + 0.03, g).castShadow = false;
        }
      // a furnace mouth in the upper tiers: glowing arch with a brick surround
      if (i === 0 || i === 2) {
        const a = (r() - 0.5) * len * 0.5;
        const fy = y - h * 0.55;
        const px = onX ? out + 0.02 : a, pz = onX ? a : out + 0.02;
        box(onX ? 0.04 : 1.3, 1.0, onX ? 1.3 : 0.04, M.brickD, px, fy, pz, g);
        box(onX ? 0.05 : 0.9, 0.7, onX ? 0.9 : 0.05, glow(C.ember), px, fy - 0.06, pz, g).castShadow = false;
        box(onX ? 0.06 : 0.5, 0.2, onX ? 0.5 : 0.06, glow(0xffd27a), px, fy - 0.3, pz, g).castShadow = false;
        box(onX ? 0.08 : 1.4, 0.1, onX ? 1.4 : 0.08, M.iron, px, fy + 0.52, pz, g);
      }
    }
    // pipes down the corners of the visible faces: copper mains with brass collars
    for (const [px, pz] of [[tw / 2 + 0.12, td / 2 - 0.6], [tw / 2 - 0.6, td / 2 + 0.12]]) {
      cyl(0.1, 0.1, h, M.copper, 6, px, y - h / 2, pz, g);
      for (let yy = y - 0.4; yy > y - h; yy -= 0.9) cyl(0.13, 0.13, 0.08, M.brassD, 6, px, yy, pz, g).castShadow = false;
    }
    // hanging lamps under the ledge
    if (i < 3)
      for (const onX of [false, true]) {
        const len = onX ? prevD : prevW, out = (onX ? prevW : prevD) / 2 - 0.15;
        for (let a = -len / 2 + 1.5; a < len / 2 - 1; a += 3.4 + r() * 2) {
          const px = onX ? out : a, pz = onX ? a : out;
          box(0.02, 0.4, 0.02, M.soot, px, y - 0.44, pz, g).castShadow = false;
          box(0.16, 0.2, 0.16, glow(C.gas), px, y - 0.72, pz, g).castShadow = false;
          box(0.2, 0.04, 0.2, M.brassD, px, y - 0.6, pz, g).castShadow = false;
        }
      }
    // an aether conduit along the top tier: teal lines with brass sockets (IRON-STYLE: "teal aether conduits")
    if (i === 1) {
      const ay = y - 0.3;
      box(tw + 0.04, 0.08, 0.08, glow(C.teal), 0, ay, td / 2 + 0.04, g).castShadow = false;
      box(0.08, 0.08, td + 0.04, glow(C.teal), tw / 2 + 0.04, ay, 0, g).castShadow = false;
      for (let a = -tw / 2 + 1; a < tw / 2; a += 2.2) box(0.16, 0.16, 0.12, M.brass, a, ay, td / 2 + 0.06, g).castShadow = false;
      for (let a = -td / 2 + 1; a < td / 2; a += 2.2) box(0.12, 0.16, 0.16, M.brass, tw / 2 + 0.06, ay, a, g).castShadow = false;
    }
    // knee braces from the ledge above down onto this tier's wall, along the faces the camera sees
    if (i > 0) {
      const ox = (prevW - tw) / 2, oz = (prevD - td) / 2;
      const up = new THREE.Vector3(0, 1, 0);
      const brace = (ax: number, az: number, bx: number, bz: number) => {
        const A = new THREE.Vector3(ax, y - 0.2, az), B = new THREE.Vector3(bx, y - h * 0.55, bz);
        const dir = B.clone().sub(A);
        const s = box(0.12, dir.length(), 0.12, M.iron, (ax + bx) / 2, (A.y + B.y) / 2, (az + bz) / 2, g);
        s.quaternion.setFromUnitVectors(up, dir.normalize());
      };
      for (let a = -tw / 2 + 1; a < tw / 2 - 0.5; a += 4) brace(a, td / 2 + oz * 0.85, a, td / 2);
      for (let a = -td / 2 + 1; a < td / 2 - 0.5; a += 4) brace(tw / 2 + ox * 0.85, a, tw / 2, a);
    }
    prevW = tw;
    prevD = td;
    y -= h;
  });
  // the keel: an iron spire with brass bands down to a glowing ember tip
  const spireH = Math.max(1.2, depth - (0.01 - y) );
  const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.min(prevW, prevD) * 0.42, spireH, 8), M.iron);
  cone.rotation.x = Math.PI;
  cone.position.y = y - spireH / 2;
  cone.castShadow = true;
  g.add(cone);
  for (let j = 1; j < 3; j++) {
    const rr = Math.min(prevW, prevD) * 0.42 * (1 - j / 3);
    cyl(rr + 0.06, rr + 0.06, 0.14, M.brassD, 8, 0, y - spireH * (j / 3), 0, g);
  }
  box(0.36, 0.36, 0.36, glow(C.ember), 0, y - spireH + 0.12, 0, g).rotation.set(0.6, 0.6, 0);
  return g;
}

// ---------- floating ballast: a rough chunk of rock with a stone cap, an iron band and a glowing seam ----------
export function makeIronFloater(size: number, seed: number) {
  const r = srand(seed * 97 + 3);
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.8, 0), iron(r() < 0.5 ? 0x5a4a3c : 0x4e4034));
  rock.scale.set(1.1, 1.3, 0.95);
  rock.position.y = -size * 0.8;
  rock.rotation.set(r() * 3, r() * 3, 0);
  g.add(rock);
  box(size * 1.2, size * 0.3, size * 1.0, M.stone, 0, -size * 0.1, 0, g);
  box(size * 1.26, size * 0.1, size * 1.06, M.ironM, 0, -size * 0.28, 0, g);
  box(size * 0.08, size * 0.6, size * 0.04, glow(C.ember), size * 0.3, -size * 0.8, size * 0.62, g);
  if (r() < 0.6) {
    // a riveted crate of coal strapped on top
    box(size * 0.4, size * 0.3, size * 0.4, M.wood, -size * 0.2, size * 0.2, 0, g);
    box(size * 0.36, size * 0.06, size * 0.36, iron(0x221e1c, 40, 0x3a3a44), -size * 0.2, size * 0.36, 0, g);
  }
  return g;
}

// ---------- molten pour off the deck's edge into a puff of steam ----------
let fadeTex: THREE.Texture | null = null;
const fade = () =>
  (fadeTex ??= canvasTex(1, 32, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 32);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.45, "#fff");
    grad.addColorStop(0.85, "#000");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, 32);
  }));

export function makeMoltenPour(parent: THREE.Object3D, x: number, z: number, rotY: number, w: number, len: number) {
  const t = rep(ironTex().molten, 1, len / 3.75);
  const pw = w * 0.55;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(pw, len),
    new THREE.MeshBasicMaterial({ map: t, alphaMap: fade(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  m.position.set(x, -len / 2 - 0.3, z);
  m.rotation.y = rotY;
  parent.add(m);
  // the chute: an iron trough jutting out of the slab with a glowing lip
  const chute = group(parent, x, 0, z);
  chute.rotation.y = rotY;
  box(pw + 0.4, 0.3, 1.1, M.iron, 0, -0.2, -0.25, chute);
  for (const sx of [-1, 1]) box(0.08, 0.22, 1.1, M.ironM, sx * (pw / 2 + 0.16), -0.02, -0.25, chute);
  box(pw, 0.04, 1.0, glow(C.ember), 0, -0.04, -0.25, chute).castShadow = false;
  box(pw + 0.5, 0.08, 0.1, M.brassD, 0, -0.32, 0.3, chute);

  // steam and embers where the pour fades out
  const rand = srand(Math.round(x * 31 + z * 17) + 99);
  const puffs: { o: THREE.Mesh; y: number; r: number; k: number }[] = [];
  const geo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 6; i++) {
    const mm = new THREE.MeshPhongMaterial({ color: i % 2 ? 0x8a7a6a : 0x6a5a4e, flatShading: true, shininess: 0, specular: 0, transparent: true, opacity: 0.7, depthWrite: false });
    const o = new THREE.Mesh(geo, mm);
    const along = (rand() - 0.5) * 1.4, out = (rand() - 0.2) * 0.8;
    o.position.set(x + Math.cos(rotY) * along + Math.sin(rotY) * out, -len * 0.8 + rand() * 0.8, z - Math.sin(rotY) * along + Math.cos(rotY) * out);
    o.rotation.set(rand() * 6, rand() * 6, 0);
    parent.add(o);
    puffs.push({ o, y: o.position.y, r: 0.3 + rand() * 0.4, k: rand() });
  }
  return (dt: number, time: number) => {
    t.offset.y += dt * 0.9;
    for (const p of puffs) {
      const c = (time * 0.35 + p.k) % 1;
      p.o.scale.setScalar(p.r * (0.6 + c * 0.8));
      p.o.position.y = p.y + c * 0.9;
    }
  };
}

// ---------- ironize: re-paint a classic model in Black Iron materials ----------
// The Item Lab models and district buildings are painted in the classic cool greys. Instead of forking
// every builder, Black Iron re-tints their materials once at build time: neutral greys become warm iron,
// pewter and brass by brightness (with a little oily shine), the classic navy trims become soot, and
// saturated colors (harness colors, status lights, ore, kind colors) stay as they are so states still read.
// Materials the scene recolors at runtime (status LEDs, roofs) keep whatever the model sets later.
const EXACT: Record<number, [number, number]> = {
  // classic hex: [iron hex, shininess]
  0x2b2f36: [0x2e2620, 18], // dark steel → oily iron
  0x3a3f47: [0x3a322b, 24],
  0x3a3f52: [0x3a322b, 24],
  0x4a505a: [0x5a4a3c, 24],
  0x6b7280: [0x6a5a48, 28],
  0x8a94a3: [0xa87a34, 38], // the classic steel trim → brass
  0xc9ced6: [0xd0a24e, 50], // light steel → bright brass
  0xd5d8de: [0xd8c49a, 40], // polished rods → cream steel
  0xeef1fa: [0xc4b08a, 20], // white panels → cream enamel
  0xe8ecf1: [0xc4b08a, 20],
  0x10141f: [0x140e0a, 0],
  0x1d2026: [0x1e1814, 0],
  0x16120a: [0x1a140c, 0],
  0x2a2f45: [0x2a211b, 0],
  0x1b2448: [0x2a1c14, 0],
  0x2b3150: [0x2a1c14, 0],
  0xf2a93b: [0xd8a018, 10], // hazard amber → caution paint
};
const tmp = new THREE.Color();
function ironHex(hex: number): [number, number] | null {
  if (EXACT[hex]) return EXACT[hex];
  tmp.setHex(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  tmp.getHSL(hsl);
  // cool greys and slate blues with little saturation: warm them along iron → pewter → brass
  const cool = hsl.h > 0.45 && hsl.h < 0.75;
  if (hsl.s < 0.06 || (cool && hsl.s < 0.32)) {
    const l = hsl.l;
    if (l < 0.1) return [0x1e1814, 0];
    if (l < 0.2) return [0x2e2620, 16];
    if (l < 0.32) return [0x463d35, 22];
    if (l < 0.48) return [0x5e5244, 26];
    if (l < 0.66) return [0x8a7458, 30];
    if (l < 0.82) return [0xb89a64, 40];
    return [0xd8c49a, 24];
  }
  return null;
}

export function ironizeMaterial(m: THREE.Material, keep?: Set<THREE.Material>) {
  const mm = m as Paintable;
  if (mm[DONE] || keep?.has(m) || !mm.color) return;
  mm[DONE] = true;
  if (mm.map || (mm as THREE.MeshPhongMaterial).vertexColors) return; // textures (belts, signs) stay
  const to = ironHex(mm.color.getHex());
  if (!to) return;
  mm.color.setHex(to[0]);
  if (m instanceof THREE.MeshPhongMaterial && to[1]) {
    m.shininess = to[1];
    m.specular.setHex(to[0] === 0xa87a34 || to[0] === 0xd0a24e || to[0] === 0xb89a64 ? 0x8a6a30 : 0x2a2a30);
  }
}
export function ironize(root: THREE.Object3D, keep?: Set<THREE.Material>) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) ironizeMaterial(m, keep);
  });
  return root;
}
