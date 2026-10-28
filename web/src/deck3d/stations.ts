// @ts-nocheck -- time-boxed spike, kept loose on purpose
// The six machines on the line, each modeled from its sprite in web/public/deck/art/*-working.webp:
// Repo, Planner, Builder, Checks, Review, Gate. Each sits at its origin facing +z and returns
// { group, act(u) } where u runs 0..1 while it works (and is -1 when idle). One thing moves at a time.
import * as THREE from "three";
import { C, M, canvasTex, gear, glow, halo, hex, HALO_LAYER, parts, shiny, toon } from "./kit";

const plinth = (P, w, d) => { P.box(w, 0.2, d, M.soot, 0, 0.1, 0); for (const x of [-1, 1]) for (const z of [-1, 1]) P.box(0.3, 0.1, 0.3, M.brassHi, x * (w / 2 - 0.2), 0.05, z * (d / 2 - 0.2)); };
const ease = (x) => x * x * (3 - 2 * x);
const pulse = (u) => (u < 0 ? 0 : Math.sin(Math.min(1, u) * Math.PI));

// thin glowing stroke from a to b on a face at depth z (for glyphs and chevrons)
function stroke(P, m, a, b, z, w = 0.07) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  const s = P.box(len + w, w, 0.04, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z); s.rotation.z = Math.atan2(dy, dx); return s;
}

// ---- Repo: plated block, a branch glyph on a brass panel, amber triple bar, chimney with a copper pipe ----
export function repo(parent) {
  const g = new THREE.Group(); parent.add(g); const P = parts(g);
  plinth(P, 2.2, 1.8);
  P.plated(1.9, 1.6, 1.6, 0, 0.2, 0, 2);
  const FZ = 0.83;
  P.box(1.0, 0.95, 0.06, M.brass, 0.05, 0.92, FZ); P.box(0.84, 0.8, 0.06, M.ironDk, 0.05, 0.92, FZ + 0.02);
  const glyph = glow(C.gold, 0.5);
  stroke(P, glyph, [-0.15, 0.62], [-0.15, 1.22], FZ + 0.06); stroke(P, glyph, [-0.15, 0.85], [0.22, 1.15], FZ + 0.06);
  for (const [x, y] of [[-0.15, 0.62], [-0.15, 1.22], [0.22, 1.15]]) P.box(0.13, 0.13, 0.05, glyph, x, y, FZ + 0.07);
  const bar = glow(C.amber, 0.9);
  for (const x of [-0.14, 0, 0.14]) P.box(0.08, 0.22, 0.05, bar, x - 0.45, 1.58, FZ);
  for (const x of [0.4, 0.62]) P.rivet(x, 1.58, FZ + 0.02, 0.09);
  P.cyl(0.24, 0.24, 0.5, M.brass, -0.3, 2.05, -0.25); P.cyl(0.3, 0.3, 0.1, M.brassHi, -0.3, 2.32, -0.25); P.cyl(0.18, 0.18, 0.02, M.black, -0.3, 2.38, -0.25);
  P.pipe([[-0.05, 2.05, -0.25], [0.6, 2.08, -0.25], [1.05, 1.95, -0.1], [1.12, 1.5, 0.2], [1.12, 0.75, 0.35]], 0.1);
  const gr = gear(0.3, 8, M.steel); gr.rotation.y = -Math.PI / 2; gr.position.set(-1.0, 0.65, 0.35); g.add(gr);
  P.box(0.34, 0.42, 0.42, M.brass, 1.12, 0.55, -0.35); P.box(0.06, 0.28, 0.28, M.black, 1.3, 0.55, -0.35);
  return { group: g, act(u) { glyph.emissiveIntensity = 0.5 + pulse(u) * 2.2; gr.rotation.x = u < 0 ? 0 : ease(u) * Math.PI; } };
}

// ---- Planner: a desk with drawers, a tilted blueprint board (gear -> factory -> rocket), lamp arm, lights, lantern ----
export function planner(parent) {
  const g = new THREE.Group(); parent.add(g); const P = parts(g);
  plinth(P, 2.6, 1.6);
  P.plated(2.4, 0.85, 1.2, 0, 0.2, 0.1, 3, { brackets: false });
  P.box(2.55, 0.1, 1.35, M.brassDk, 0, 1.1, 0.1);
  for (const x of [-0.7, 0, 0.7]) { P.box(0.6, 0.32, 0.04, M.ironDk, x, 0.62, 0.72); P.box(0.18, 0.05, 0.05, M.brassHi, x, 0.62, 0.76); }
  // blueprint board on two posts, tipped back
  const board = new THREE.Group(); board.position.set(0, 1.85, -0.35); board.rotation.x = -0.28; g.add(board);
  const B = parts(board);
  B.box(1.95, 1.1, 0.1, M.brass, 0, 0, 0);
  const print = canvasTex(52, 28, (c) => {
    c.fillStyle = hex(C.cream); c.fillRect(0, 0, 52, 28);
    c.fillStyle = hex(C.slate); c.fillRect(0, 0, 52, 1); c.fillRect(0, 27, 52, 1); c.fillRect(0, 0, 1, 28); c.fillRect(51, 0, 1, 28);
    const icon = (x) => { c.fillStyle = hex(C.slateHi); c.fillRect(x, 8, 12, 12); c.fillStyle = hex(C.cream); c.fillRect(x + 1, 9, 10, 10); c.fillStyle = hex(C.slate); };
    icon(4); c.fillRect(7, 11, 6, 6); c.fillStyle = hex(C.cream); c.fillRect(9, 13, 2, 2);
    icon(20); c.fillStyle = hex(C.slate); c.fillRect(22, 14, 8, 4); c.fillRect(22, 11, 2, 3); c.fillRect(26, 12, 2, 2);
    icon(36); c.fillStyle = hex(C.slate); c.fillRect(41, 10, 2, 8); c.fillRect(40, 16, 4, 2);
    c.fillStyle = hex(C.brass); c.fillRect(17, 13, 2, 1); c.fillRect(33, 13, 2, 1);
  }, [1, 1], false);
  const printMat = new THREE.MeshToonMaterial({ map: print, emissive: 0xffffff, emissiveMap: print, emissiveIntensity: 0.15 });
  B.add(new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.92), printMat), 0, 0, 0.06);
  const lights = [glow(C.green, 1.2), glow(C.amber, 1.2), glow(C.red, 1.2)];
  lights.forEach((m, i) => B.ball(0.08, m, -0.3 + i * 0.3, 0.66, 0.02, 0));
  P.box(0.08, 0.9, 0.08, M.brassDk, -0.9, 1.45, -0.45); P.box(0.08, 0.9, 0.08, M.brassDk, 0.9, 1.45, -0.45);
  // lamp on a bent brass arm, head over the desk
  P.pipe([[-1.05, 1.15, -0.2], [-1.1, 2.15, -0.2], [-0.75, 2.6, 0.0], [-0.55, 2.5, 0.15]], 0.05, M.brass);
  const head = P.cyl(0.07, 0.24, 0.24, M.brassHi, -0.5, 2.38, 0.2); head.rotation.z = -0.5;
  const bulb = glow(C.gold, 0.6); P.ball(0.1, bulb, -0.45, 2.27, 0.22, 0);
  const lampHalo = halo(C.gold, 1.6, -0.45, 2.1, 0.3, 0.2); g.add(lampHalo);
  // desk clutter: papers, pen cup, tray
  P.box(0.5, 0.02, 0.36, M.cream, 0.2, 1.17, 0.35).rotation.y = 0.15;
  P.cyl(0.1, 0.09, 0.2, M.brass, 0.85, 1.25, 0.35); P.box(0.02, 0.14, 0.02, M.red, 0.84, 1.4, 0.35);
  P.box(0.42, 0.08, 0.3, M.copper, -0.45, 1.19, 0.4);
  P.lantern(1.2, 1.5, 0.45);
  return {
    group: g,
    act(u) {
      const p = pulse(u); bulb.emissiveIntensity = 0.6 + p * 2.4; lampHalo.material.opacity = 0.2 + p * 0.5; printMat.emissiveIntensity = 0.15 + p * 0.5;
      lights.forEach((m, i) => (m.emissiveIntensity = u < 0 ? 1.2 : 1.2 + (Math.floor(u * 9) % 3 === i ? 2 : 0)));
    },
  };
}

// ---- Builder: chunky riveted block, gear in a brass housing, lit 2x2 window, chimney, lever, copper pipe stack ----
export function builder(parent) {
  const g = new THREE.Group(); parent.add(g); const P = parts(g);
  plinth(P, 2.4, 2.0);
  const BW = 2.2, BH = 1.7, BD = 1.8, BY = 0.2, top = BY + BH, FZ = BD / 2 + 0.03;
  P.plated(BW, BH, BD, 0, BY, 0, 1);
  P.cyl(0.56, 0.56, 0.1, M.ironDk, -0.35, BY + 0.62, FZ, "z", 16);
  P.torus(0.56, 0.08, M.brass, -0.35, BY + 0.62, FZ + 0.05);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.rivet(-0.35 + Math.cos(a) * 0.56, BY + 0.62 + Math.sin(a) * 0.56, FZ + 0.13); }
  const gr = gear(0.36, 10, M.steel); gr.position.set(-0.35, BY + 0.62, FZ + 0.1); g.add(gr);
  const win = glow(C.amber, 0.7);
  P.box(0.62, 0.56, 0.08, M.brass, 0.55, BY + 1.12, FZ); P.box(0.5, 0.44, 0.06, M.black, 0.55, BY + 1.12, FZ + 0.03);
  for (const dx of [-0.11, 0.11]) for (const dy of [-0.1, 0.1]) P.box(0.18, 0.16, 0.04, win, 0.55 + dx, BY + 1.12 + dy, FZ + 0.06);
  for (let i = 0; i < 3; i++) P.box(0.36, 0.05, 0.04, M.black, -0.45, BY + 1.38 - i * 0.11, FZ);
  P.cyl(0.5, 0.5, 0.12, M.brass, 0.25, top + 0.06, -0.15); P.cyl(0.36, 0.38, 0.6, M.brassHi, 0.25, top + 0.42, -0.15);
  P.cyl(0.41, 0.41, 0.08, M.brass, 0.25, top + 0.4, -0.15); P.cyl(0.46, 0.4, 0.16, M.brass, 0.25, top + 0.78, -0.15); P.cyl(0.3, 0.3, 0.02, M.black, 0.25, top + 0.87, -0.15);
  P.box(0.3, 0.16, 0.3, M.ironDk, -0.7, top + 0.08, -0.25);
  const lever = new THREE.Group(); lever.position.set(-0.7, top + 0.16, -0.25); g.add(lever);
  const L = parts(lever); L.cyl(0.04, 0.04, 0.55, M.steel, 0, 0.27, 0, "y", 6); L.ball(0.11, M.soot, 0, 0.56, 0);
  lever.rotation.z = 0.3;
  const RX = BW / 2 + 0.22;
  P.cyl(0.2, 0.2, 1.3, M.copper, RX, BY + 0.75, 0.25, "y", 10);
  for (const y of [BY + 0.2, BY + 0.75, BY + 1.3]) P.cyl(0.24, 0.24, 0.08, M.brass, RX, y, 0.25, "y", 10);
  P.cyl(0.17, 0.17, 0.45, M.copper, RX + 0.2, BY + 0.55, 0.25, "x", 10); P.cyl(0.25, 0.25, 0.08, M.brass, RX + 0.44, BY + 0.55, 0.25, "x", 10);
  P.cyl(0.18, 0.18, 0.35, M.brass, -BW / 2 - 0.16, BY + 0.7, 0.2, "x", 10); P.cyl(0.27, 0.27, 0.08, M.brassHi, -BW / 2 - 0.34, BY + 0.7, 0.2, "x", 10);
  P.cyl(0.12, 0.12, 0.02, M.black, -BW / 2 - 0.39, BY + 0.7, 0.2, "x", 10);
  return { group: g, gear: gr, win, act(u) { gr.rotation.z = u < 0 ? 0 : -ease(u) * Math.PI * 2; win.emissiveIntensity = 0.7 + pulse(u) * 2; lever.rotation.z = 0.3 - pulse(u) * 0.6; } };
}

// ---- Checks: arched body, big blue porthole in a riveted brass ring, knob tower, side tank, lantern ----
export function checks(parent) {
  const g = new THREE.Group(); parent.add(g); const P = parts(g);
  plinth(P, 2.3, 1.8);
  P.plated(2.0, 1.2, 1.5, 0, 0.2, 0, 4, { brackets: false });
  const arch = P.cyl(1.0, 1.0, 1.5, toon(C.slate), 0, 1.25, 0, "z", 14); arch.scale.set(1, 0.85, 1);
  P.torus(1.0, 0.06, M.brass, 0, 1.25, 0.76, "z", Math.PI).scale.y = 0.85;
  const FZ = 0.8;
  P.torus(0.48, 0.11, M.brass, 0, 1.1, FZ + 0.05);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; P.rivet(Math.cos(a) * 0.48, 1.1 + Math.sin(a) * 0.48, FZ + 0.16); }
  const glass = shiny(C.blue, { emissive: C.blue, emissiveIntensity: 0.4 });
  const lens = P.ball(0.42, glass, 0, 1.1, FZ - 0.05, 2); lens.scale.z = 0.45;
  P.ball(0.1, glow(C.white, 0.8), -0.14, 1.24, FZ + 0.12, 0);
  P.cyl(0.2, 0.28, 0.35, M.brass, 0, 2.2, 0); P.cyl(0.3, 0.3, 0.08, M.brassHi, 0, 2.05, 0);
  const knob = glow(C.amber, 1.2); P.ball(0.17, knob, 0, 2.5, 0); g.add(halo(C.amber, 0.9, 0, 2.5, 0.1, 0.4));
  P.cyl(0.3, 0.3, 1.1, toon(C.slateHi), -1.25, 0.8, 0.15); for (const y of [0.4, 0.8, 1.2]) P.cyl(0.33, 0.33, 0.07, M.brass, -1.25, y, 0.15);
  P.ball(0.3, toon(C.slateHi), -1.25, 1.35, 0.15);
  P.lantern(1.2, 1.0, 0.55);
  const dots = glow(C.amber, 1.2); for (const x of [-0.22, 0, 0.22]) P.ball(0.06, dots, x, 0.45, FZ, 0);
  P.box(0.4, 0.4, 0.06, M.brass, 0.65, 0.55, FZ); for (const dx of [-0.08, 0.08]) for (const dy of [-0.08, 0.08]) P.box(0.12, 0.12, 0.05, dots, 0.65 + dx, 0.55 + dy, FZ + 0.02);
  const blue = new THREE.Color(C.blue), green = new THREE.Color(C.greenHi);
  return {
    group: g,
    act(u) {
      const pass = u >= 0.55;
      glass.color.copy(pass ? green : blue); glass.emissive.copy(pass ? green : blue);
      glass.emissiveIntensity = u < 0 ? 0.4 : pass ? 1.6 : 0.4 + Math.abs(Math.sin(u * 14)) * 0.8;
    },
  };
}

// ---- Review: long table with hazard stripes, a crate under two articulated lamps that shine down on it ----
export function review(parent) {
  const g = new THREE.Group(); parent.add(g); const P = parts(g);
  plinth(P, 3.0, 1.6);
  P.plated(2.8, 0.7, 1.3, 0, 0.2, 0, 5, { brackets: false });
  const haz = canvasTex(32, 4, (c) => { c.fillStyle = hex(C.soot); c.fillRect(0, 0, 32, 4); c.fillStyle = hex(C.gold); for (let x = -4; x < 32; x += 6) for (let y = 0; y < 4; y++) c.fillRect(x + y, y, 3, 1); }, [3, 1], false);
  P.box(2.0, 0.14, 0.04, toon(0xffffff, { map: haz }), 0, 0.82, 0.67);
  for (const x of [-1.15, 1.15]) { P.box(0.4, 0.5, 1.0, toon(C.slate), x, 0.5, 0); const ch = glow(C.gold, 1); stroke(P, ch, [x - 0.08, 0.62], [x + 0.06, 0.5], 0.52, 0.06); stroke(P, ch, [x + 0.06, 0.5], [x - 0.08, 0.38], 0.52, 0.06); }
  const crateTex = canvasTex(12, 12, (c) => {
    c.fillStyle = hex(C.brass); c.fillRect(0, 0, 12, 12); c.fillStyle = hex(C.brassDk);
    c.fillRect(0, 0, 12, 1); c.fillRect(0, 11, 12, 1); c.fillRect(0, 0, 1, 12); c.fillRect(11, 0, 1, 12);
    for (let i = 1; i < 11; i++) { c.fillRect(i, i, 1, 1); c.fillRect(11 - i, i, 1, 1); }
  }, [1, 1], false);
  const crate = P.box(0.75, 0.65, 0.65, shiny(0xffffff, { map: crateTex }), 0, 1.25, 0);
  const cones = [];
  for (const s of [-1, 1]) {
    const base = [s * 1.15, 0.92, -0.45], elbow = [s * 1.15, 2.1, -0.45], wrist = [s * 0.75, 2.6, -0.05];
    P.cyl(0.18, 0.22, 0.14, M.brass, ...base);
    P.pipe([base, elbow], 0.08, M.brass); P.pipe([elbow, wrist], 0.07, M.brass);
    for (const j of [elbow, wrist]) P.ball(0.13, M.brassDk, ...j);
    const head = P.cyl(0.08, 0.26, 0.28, M.brassHi, s * 0.6, 2.45, 0.05); head.rotation.z = s * 0.6;
    P.ball(0.1, glow(C.gold, 1.4), s * 0.55, 2.36, 0.07, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 10, 1, true), new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.set(s * 0.28, 1.85, 0.05); cone.rotation.z = s * 0.45; cone.layers.set(HALO_LAYER); g.add(cone); cones.push(cone);
  }
  return { group: g, act(u) { const p = pulse(u); for (const c of cones) c.material.opacity = p * 0.35; crate.rotation.y = u < 0 ? 0 : Math.sin(u * Math.PI * 2) * 0.12; } };
}

// ---- Gate: tall plated column with a vertical light slot, big lantern on top, copper pipe, chevron ducts each side ----
export function gate(parent) {
  const g = new THREE.Group(); parent.add(g); const P = parts(g);
  plinth(P, 1.5, 1.5);
  P.plated(1.1, 2.0, 1.2, 0, 0.2, -0.05, 6);
  const FZ = 0.58;
  P.box(0.34, 1.1, 0.06, M.brass, 0, 1.15, FZ); P.box(0.24, 1.0, 0.05, M.black, 0, 1.15, FZ + 0.02);
  const slot = glow(C.amber, 1.4); const seg = [];
  for (let i = 0; i < 4; i++) seg.push(P.box(0.16, 0.2, 0.05, slot, 0, 0.8 + i * 0.24, FZ + 0.04));
  P.cyl(0.32, 0.4, 0.14, M.brass, 0, 2.28, -0.05);
  const lamp = P.lantern(0, 2.62, -0.05, C.amber, 1.5);
  P.pipe([[-0.35, 2.25, -0.3], [-0.75, 2.35, -0.3], [-0.85, 2.0, -0.2], [-0.85, 1.4, 0.1]], 0.09);
  const chev = glow(C.gold, 0.6);
  for (const s of [-1, 1]) {
    P.box(1.1, 0.62, 0.9, toon(C.slate), s * 1.1, 0.55, 0.05);
    P.box(1.14, 0.08, 0.94, M.brass, s * 1.1, 0.88, 0.05); P.box(1.14, 0.08, 0.94, M.brass, s * 1.1, 0.24, 0.05);
    const cx = s * 1.1;
    stroke(P, chev, [cx - 0.12, 0.7], [cx + 0.08, 0.55], 0.52, 0.08); stroke(P, chev, [cx + 0.08, 0.55], [cx - 0.12, 0.4], 0.52, 0.08);
  }
  const amber = new THREE.Color(C.amber), green = new THREE.Color(C.greenHi);
  return {
    group: g,
    act(u) {
      const open = u >= 0.4;
      slot.emissive.copy(open ? green : amber);
      seg.forEach((s, i) => (s.visible = u < 0 || open || i <= Math.floor((u / 0.4) * 4)));
      chev.emissiveIntensity = 0.6 + (open ? pulse((u - 0.4) / 0.6) * 2.4 : 0);
      lamp.material.emissiveIntensity = 1.8 + pulse(u);
    },
  };
}

export const STATIONS = [
  ["repo", repo], ["planner", planner], ["builder", builder], ["checks", checks], ["review", review], ["gate", gate],
];
