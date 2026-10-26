// Small helpers for building models out of primitives, plus the canvas textures
// (stone paving, belts, water). Ported from docs/art-prototype.html.

import * as THREE from "three";

export type Paint = number | THREE.Material | THREE.Material[];

// Seeded random so the island and buildings look the same on every load.
let seed = 11;
export const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// Stable 0..1 hash of a string, for per-district or per-machine variation.
export function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const cache = new Map<string, THREE.MeshPhongMaterial>();
export function mat(color: number, emissive = 0) {
  const k = `${color}:${emissive}`;
  let m = cache.get(k);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ color, emissive, flatShading: true, shininess: 0, specular: 0x000000 });
    cache.set(k, m);
  }
  return m;
}
// A material of its own, for anything that animates its color.
export const own = (color: number, emissive = 0) =>
  new THREE.MeshPhongMaterial({ color, emissive, flatShading: true, shininess: 0, specular: 0x000000 });
export const basic = (color: number, opacity?: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity !== undefined, opacity: opacity ?? 1 });

export function mesh(geo: THREE.BufferGeometry, m: Paint, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(geo, typeof m === "number" ? mat(m) : m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  parent?.add(o);
  return o;
}
export const box = (w: number, h: number, d: number, m: Paint, x?: number, y?: number, z?: number, p?: THREE.Object3D) =>
  mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, p);
export const cyl = (rTop: number, rBottom: number, h: number, m: Paint, seg = 8, x?: number, y?: number, z?: number, p?: THREE.Object3D) =>
  mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), m, x, y, z, p);
export function group(parent?: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent?.add(g);
  return g;
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function rep(tex: THREE.Texture, x: number, y: number) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(x, y);
  return t;
}

interface Textures {
  stone: THREE.Texture;
  belt: THREE.Texture;
  water: THREE.Texture;
}
let textures: Textures | null = null;

// Built on first use, since they need a document.
export function tex(): Textures {
  if (textures) return textures;
  // Big, calm concrete slabs (128px = 8 world units, so a slab row is one belt wide). Tones stay
  // within a few percent of each other so the machines, not the ground, carry the contrast.
  const stone = canvasTex(128, 128, (g) => {
    g.fillStyle = "#a08c69";
    g.fillRect(0, 0, 128, 128);
    const tones = ["#bea97f", "#baa57c", "#c3ae84", "#b6a178"];
    for (let y = 0; y < 128; y += 16) {
      let x = -Math.floor(rnd() * 24);
      while (x < 128) {
        const w = 24 + Math.floor(rnd() * 3) * 8;
        g.fillStyle = tones[Math.floor(rnd() * tones.length)];
        g.fillRect(x + 1, y + 1, w - 1, 15);
        g.fillStyle = "rgba(255,248,230,0.10)"; // lit top edge
        g.fillRect(x + 1, y + 1, w - 1, 1);
        x += w;
      }
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rnd() < 0.5 ? "rgba(90,75,50,0.12)" : "rgba(255,245,220,0.10)";
      g.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), 1, 1);
    }
    // a couple of moss seams in the cracks
    for (let i = 0; i < 3; i++) {
      const mx = Math.floor(rnd() * 128), my = Math.floor(rnd() * 8) * 16;
      for (let j = 0; j < 7; j++) {
        g.fillStyle = rnd() < 0.5 ? "#6f8f4c" : "#5f8242";
        g.fillRect(mx + j * 2, my, 2, 1);
      }
    }
  });
  const belt = canvasTex(16, 16, (g) => {
    g.fillStyle = "#2b2f36";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#4a505b";
    g.fillRect(0, 2, 3, 12);
    g.fillRect(8, 2, 3, 12);
    g.fillStyle = "#1b1d22";
    g.fillRect(0, 0, 16, 2);
    g.fillRect(0, 14, 16, 2);
  });
  const water = canvasTex(8, 32, (g) => {
    g.fillStyle = "#7cc4ff";
    g.fillRect(0, 0, 8, 32);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = rnd() < 0.6 ? "#e8f6ff" : "#4f9be6";
      g.fillRect(Math.floor(rnd() * 8), Math.floor(rnd() * 32), 1, 3 + Math.floor(rnd() * 6));
    }
  });
  textures = { stone, belt, water };
  return textures;
}

// Small parts skip the shadow pass. Their shadows are a pixel or two at the pixel-art resolution,
// and with ~1400 casters the shadow pass was nearly half of every frame's draw calls.
export function trimShadows(root: THREE.Object3D, minRadius = 0.25) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.castShadow) return;
    const g = o.geometry as THREE.BufferGeometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere!.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < minRadius) o.castShadow = false;
  });
}
