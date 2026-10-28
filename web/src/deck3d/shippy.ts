// @ts-nocheck -- time-boxed spike, kept loose on purpose
// Shippy from shippy-happy.webp: a riveted slate box with a brass carry handle, a cyan lantern on its side,
// a green visor slit, and four jointed brass legs. Sits by his folded box at the deck's top-left.
// hop(u) is the one thing he does: a crouch, a hop, a little turn, a landing.
import * as THREE from "three";
import { C, M, glow, halo, parts, plateTexture, toon } from "./kit";

export function buildShippy(root, x, z, yaw = 0.5) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; root.add(g);
  const P = parts(g);
  // his folded box home, behind him
  P.plated(1.1, 0.4, 0.9, -0.2, 0, -0.9, 9, { brackets: false });
  P.box(0.5, 0.06, 0.08, M.brassHi, -0.2, 0.43, -0.9);

  const bot = new THREE.Group(); g.add(bot); const B = parts(bot);
  const BY = 0.55;
  const faces = [[0.62, 0.55], [0.62, 0.55], [0.85, 0.62], [0.85, 0.62], [0.85, 0.55], [0.85, 0.55]].map(([a, b], i) => toon(0xffffff, { map: plateTexture(a, b, 90 + i, { seams: 0, rust: 1.4 }) }));
  B.rbox(0.85, 0.55, 0.62, faces, 0, BY + 0.27, 0, 0.06);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.1, 0.57, 0.1, M.brass, sx * 0.42, BY + 0.27, sz * 0.3);
  B.box(0.89, 0.07, 0.66, M.brass, 0, BY + 0.55, 0);
  // carry handle
  for (const sx of [-1, 1]) B.box(0.06, 0.16, 0.08, M.brassDk, sx * 0.2, BY + 0.65, 0);
  B.box(0.46, 0.07, 0.1, M.brassHi, 0, BY + 0.74, 0);
  // visor
  B.box(0.6, 0.16, 0.04, M.black, 0, BY + 0.3, 0.32);
  const visor = glow(C.greenHi, 1.6); B.box(0.44, 0.05, 0.03, visor, 0, BY + 0.3, 0.345);
  // cyan lantern on his left side
  B.cyl(0.16, 0.16, 0.06, M.brass, -0.55, BY + 0.5, 0.05, "y", 8);
  B.cyl(0.13, 0.13, 0.36, glow(C.cyan, 1.6), -0.55, BY + 0.29, 0.05, "y", 8);
  B.cyl(0.16, 0.16, 0.06, M.brass, -0.55, BY + 0.08, 0.05, "y", 8);
  bot.add(halo(C.cyan, 1.1, -0.6, BY + 0.29, 0.1, 0.5));
  B.pipe([[-0.55, BY + 0.53, 0.05], [-0.48, BY + 0.62, -0.15], [-0.3, BY + 0.5, -0.32]], 0.03, M.copper);
  // four jointed legs
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sx * 0.36, BY + 0.05, sz * 0.24); bot.add(leg); const L = parts(leg);
    L.box(0.1, 0.26, 0.1, M.brass, sx * 0.08, -0.08, 0).rotation.z = sx * 0.6;
    L.ball(0.07, M.brassDk, sx * 0.17, -0.2, 0);
    L.box(0.09, 0.3, 0.09, toon(C.slate), sx * 0.19, -0.36, 0);
    L.box(0.18, 0.06, 0.16, M.brassHi, sx * 0.2, -0.52, 0);
    legs.push(leg);
  }
  const ease = (t) => t * t * (3 - 2 * t);
  return {
    group: g, bot,
    hop(u) {
      if (u < 0) { bot.position.y = 0; bot.rotation.y = 0; legs.forEach((l) => (l.scale.y = 1)); return; }
      const crouch = u < 0.2 ? Math.sin((u / 0.2) * Math.PI) * 0.12 : u > 0.85 ? Math.sin(((u - 0.85) / 0.15) * Math.PI) * 0.08 : 0;
      const air = u >= 0.2 && u <= 0.85 ? Math.sin(((u - 0.2) / 0.65) * Math.PI) * 0.45 : 0;
      bot.position.y = air - crouch;
      bot.rotation.y = u >= 0.2 && u <= 0.85 ? ease((u - 0.2) / 0.65) * Math.PI * 2 : 0;
      legs.forEach((l) => (l.scale.y = 1 - crouch * 1.5));
      visor.emissiveIntensity = 1.6 + (air > 0 ? 1.2 : 0);
    },
  };
}
