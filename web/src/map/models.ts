// The map's scenery from docs/art-prototype.html: the floating island, waterfalls and
// district plinths. Machines come from the Item Lab builders in itemlab.js.

import * as THREE from "three";
import { box, mat, own, rep, rnd, tex } from "./kit";

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
