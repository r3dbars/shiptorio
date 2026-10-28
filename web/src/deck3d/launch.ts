// @ts-nocheck -- time-boxed spike, kept loose on purpose
// The launch end, from pad.webp / launch-tower-3.webp / rocket.webp: a truss bridge off the deck to a round rock
// island with a glowing pad ring, a four-post brass tower with a crane, and the white rocket with a red nose,
// blue porthole and red fins. launch(u) flies it up and brings it back down.
import * as THREE from "three";
import { C, M, glow, halo, HALO_LAYER, parts, rng, shiny, toon } from "./kit";

const ease = (x) => x * x * (3 - 2 * x);

function bar(P, a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const o = P.cyl(r, r, A.distanceTo(B), m, 0, 0, 0, "y", 6);
  o.position.copy(A).add(B).multiplyScalar(0.5); o.rotation.set(0, 0, 0);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return o;
}

export function buildLaunch(root, { x0, x1, z, deckMat }) {
  const g = new THREE.Group(); root.add(g); const P = parts(g);
  // ---- bridge: plank deck, rails, X truss underneath ----
  const len = x1 - x0, cx = (x0 + x1) / 2, W = 1.7;
  P.box(len, 0.16, W, deckMat, cx, -0.08, z);
  for (const s of [-1, 1]) {
    const zz = z + s * (W / 2);
    P.box(len, 0.1, 0.1, M.brass, cx, -0.12, zz + s * 0.03);
    for (let x = x0 + 0.4; x <= x1 - 0.3; x += 1.0) { P.box(0.14, 0.55, 0.14, M.ironDk, x, 0.27, zz); P.box(0.2, 0.06, 0.2, M.brassHi, x, 0.56, zz); }
    bar(P, [x0, 0.5, zz], [x1, 0.5, zz], 0.045, M.copper);
    // truss under this side
    P.box(len, 0.1, 0.1, M.brassDk, cx, -0.75, zz);
    for (let x = x0; x < x1 - 0.1; x += 0.8) { bar(P, [x, -0.16, zz], [x + 0.8, -0.72, zz], 0.035, M.brassDk); bar(P, [x, -0.72, zz], [x + 0.8, -0.16, zz], 0.035, M.brassDk); }
  }
  for (const x of [x0 + 0.5, x1 - 0.5]) P.lantern(x, -0.95, z + W / 2 + 0.05);

  // ---- island ----
  const ix = x1 + 2.6, iz = z - 0.4, R = 2.7;
  const isl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.6, 8), [toon(C.slate), deckMat, toon(C.soot)]);
  isl.rotation.y = Math.PI / 8; isl.position.set(ix, -0.3, iz); g.add(isl);
  const rim = P.torus(R * 0.98, 0.07, M.brass, ix, -0.04, iz, "y", Math.PI * 2, 8); rim.rotation.z = Math.PI / 8;
  const r = rng(77), rock = toon(C.soot), rock2 = toon(C.iron);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = r() * (R - 0.6), dep = 0.7 + (1 - d / R) * 1.6 * r();
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + r() * 0.5, 0), r() < 0.7 ? rock : rock2);
    m.position.set(ix + Math.cos(a) * d, -dep, iz + Math.sin(a) * d); m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.y = 0.75; g.add(m);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, px = ix + Math.cos(a) * (R - 0.15), pz = iz + Math.sin(a) * (R - 0.15);
    const facingBridge = Math.cos(a) < -0.8 && Math.abs(pz - z) < 1.2;
    if (facingBridge) continue;
    P.box(0.16, 0.5, 0.16, M.ironDk, px, 0.25, pz);
    if (i % 2 === 0) P.lantern(px, 0.68, pz, C.amber, 0.9);
  }
  // pad: dark disk, glowing ring and crosshair
  P.cyl(1.4, 1.5, 0.14, toon(C.navy), ix, 0.07, iz, "y", 16);
  const ringMat = glow(C.amber, 1.2);
  P.torus(1.1, 0.05, ringMat, ix, 0.16, iz, "y", Math.PI * 2, 20);
  P.box(1.6, 0.02, 0.05, ringMat, ix, 0.15, iz); P.box(0.05, 0.02, 1.6, ringMat, ix, 0.15, iz);
  const padHalo = halo(C.amber, 3.2, ix, 0.3, iz, 0.25); g.add(padHalo);

  // ---- tower: four brass posts, cross bars, crane arm with a hook ----
  const T = 1.25, TH = 3.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.box(0.18, TH, 0.18, M.brass, ix + sx * T, TH / 2, iz + sz * T);
    P.box(0.3, 0.14, 0.3, M.brassDk, ix + sx * T, 0.07, iz + sz * T);
  }
  for (const y of [1.2, 2.4, TH - 0.1]) {
    for (const s of [-1, 1]) { P.box(T * 2, 0.1, 0.1, M.brassDk, ix, y, iz + s * T); P.box(0.1, 0.1, T * 2, M.brassDk, ix + s * T, y, iz); }
  }
  for (const sz of [-1, 1]) bar(P, [ix - T, 0.2, iz + sz * T], [ix + T, 1.2, iz + sz * T], 0.04, M.brassDk);
  P.box(0.16, 0.16, T * 2 + 0.4, M.brassHi, ix - 0.3, TH + 0.15, iz);
  P.cyl(0.02, 0.02, 0.6, M.soot, ix - 0.3, TH - 0.2, iz + 0.5, "y", 4);
  P.box(0.12, 0.12, 0.12, M.brassHi, ix - 0.3, TH - 0.55, iz + 0.5);

  // ---- rocket: lathe body, red nose, brass band, blue porthole, four red fins, flame ----
  const rocket = new THREE.Group(); rocket.position.set(ix, 0.14, iz); g.add(rocket);
  const Rk = parts(rocket);
  const prof = [[0.01, 0], [0.34, 0.05], [0.44, 0.45], [0.46, 1.1], [0.42, 1.55]].map(([a, b]) => new THREE.Vector2(a, b));
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 12), toon(C.white)));
  const nose = [[0.42, 1.55], [0.34, 1.85], [0.2, 2.1], [0.01, 2.3]].map(([a, b]) => new THREE.Vector2(a, b));
  rocket.add(new THREE.Mesh(new THREE.LatheGeometry(nose, 12), toon(C.red)));
  Rk.torus(0.45, 0.05, M.brass, 0, 0.5, 0, "y", Math.PI * 2, 14);
  Rk.torus(0.43, 0.04, M.brass, 0, 1.55, 0, "y", Math.PI * 2, 14);
  Rk.torus(0.17, 0.05, M.brass, 0, 1.08, 0.45);
  const port = Rk.ball(0.14, shiny(C.blue, { emissive: C.blue, emissiveIntensity: 0.4 }), 0, 1.08, 0.42, 1); port.scale.z = 0.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = Rk.box(0.06, 0.6, 0.38, toon(C.red), Math.sin(a) * 0.5, 0.28, Math.cos(a) * 0.5); f.rotation.y = a;
  }
  Rk.cyl(0.22, 0.28, 0.14, M.steel, 0, -0.02, 0, "y", 10);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.9, 8), glow(C.gold, 2.5)); flame.rotation.x = Math.PI; flame.position.y = -0.5; flame.visible = false; rocket.add(flame);
  const flameHalo = halo(C.amber, 2.2, 0, -0.5, 0, 0); rocket.add(flameHalo);

  return {
    group: g, island: new THREE.Vector3(ix, 0, iz), pad: new THREE.Vector3(ix, 0.16, iz), rocket,
    // u 0..1: ignite, lift, climb out of view, hang, come back down slowly, settle
    launch(u) {
      const lift = u < 0.12 ? 0 : u < 0.5 ? ease((u - 0.12) / 0.38) * 9 : u < 0.6 ? 9 : u < 0.95 ? 9 * (1 - ease((u - 0.6) / 0.35)) : 0;
      const burning = u >= 0 && u < 0.97;
      rocket.position.y = 0.14 + lift;
      rocket.position.x = ix + (u > 0 && u < 0.12 ? Math.sin(u * 300) * 0.02 : 0);
      flame.visible = burning; flame.scale.y = burning ? 0.7 + Math.sin(u * 90) * 0.15 : 1;
      flameHalo.material.opacity = burning ? 0.55 : 0;
      ringMat.emissiveIntensity = 1.2 + (burning ? 1.5 : 0);
    },
  };
}
