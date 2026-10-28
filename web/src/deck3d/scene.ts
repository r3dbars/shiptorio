// @ts-nocheck -- time-boxed spike, kept loose on purpose
// The /deck3d.html world, all code-built low-poly to match the Black Iron mockups: one long chamfered deck with
// railings, lanterns and brass straps over a rocky underside (copper pipe loops, the caged cyan orb), the full line
// Repo -> Planner -> Builder -> Checks -> Review -> Gate on a belt, a truss bridge to the launch island with the
// rocket, and Shippy by his box. Units: 1 = one deck tile; the line runs along +x.
// Calm rule: one thing moves at a time. The story loop walks one crate down the line; taps play one machine.
import * as THREE from "three";
import { C, M, canvasTex, glow, halo, hex, parts, rng, toon } from "./kit";
import { STATIONS } from "./stations";
import { buildLaunch } from "./launch";
import { buildShippy } from "./shippy";

const DX = 12.6, DZ = 3.2, CH = 1.1, THICK = 0.7; // deck half length, half depth, corner chamfer, slab thickness
const STX = [-10.1, -6.2, -2.2, 1.8, 5.8, 9.9]; // station x, left to right
const ST_Z = -0.95, BELT_Z = 1.15, BELT_Y = 0.16, X0 = -11.6, X1 = DX;
const BRIDGE = [DX, DX + 4];

function outline() {
  return [[-DX + CH, -DZ], [DX - CH, -DZ], [DX, -DZ + CH], [DX, DZ - CH], [DX - CH, DZ], [-DX + CH, DZ], [-DX, DZ - CH], [-DX, -DZ + CH]].map(([x, z]) => new THREE.Vector2(x, z));
}

const tiles = canvasTex(16, 16, (g) => {
  const r = rng(7);
  g.fillStyle = hex(C.plate); g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 26; i++) { g.fillStyle = hex(r() < 0.6 ? C.rust : C.copper); g.fillRect((r() * 16) | 0, (r() * 16) | 0, 1 + ((r() * 2) | 0), 1); }
  g.fillStyle = hex(C.crateDk); g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  g.fillStyle = hex(C.brassHi); g.fillRect(1, 1, 1, 1); g.fillRect(13, 1, 1, 1); g.fillRect(1, 13, 1, 1); g.fillRect(13, 13, 1, 1);
});
const deckTop = toon(0xffffff, { map: tiles });

function buildDeck(root, lights) {
  const P = parts(root);
  const pts = outline();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: THICK, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  root.add(new THREE.Mesh(geo, [deckTop, toon(C.iron)]));
  const ironPost = toon(C.ironHi);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const A = new THREE.Vector3(a.x, 0, a.y), B = new THREE.Vector3(b.x, 0, b.y);
    const len = A.distanceTo(B), ang = Math.atan2(B.z - A.z, B.x - A.x);
    const out = new THREE.Vector3(B.z - A.z, 0, A.x - B.x).normalize();
    if (out.dot(A.clone().add(B)) < 0) out.negate();
    out.multiplyScalar(0.05);
    const mid = A.clone().add(B).multiplyScalar(0.5).add(out);
    // the right end opens onto the bridge: no rail across the belt there
    const bridgeGap = Math.abs(a.x - DX) < 0.01 && Math.abs(b.x - DX) < 0.01;
    for (const [y, h] of [[-0.08, 0.16], [-THICK + 0.1, 0.14]]) { const t = P.box(len, h, 0.1, M.brass, mid.x, y, mid.z); t.rotation.y = -ang; }
    const n = Math.max(1, Math.round(len / 1.6));
    for (let j = 0; j < n; j++) {
      const p = A.clone().lerp(B, j / n);
      const strap = P.box(0.24, THICK + 0.28, 0.14, M.brassHi, p.x + out.x * 2, -THICK / 2 - 0.1, p.z + out.z * 2); strap.rotation.y = -ang;
      P.box(0.14, 0.1, 0.16, M.brassHi, p.x + out.x * 2, -THICK - 0.22, p.z + out.z * 2).rotation.y = -ang;
      if (bridgeGap && Math.abs(p.z - BELT_Z) < 1.2) continue;
      P.box(0.2, 0.62, 0.2, ironPost, p.x, 0.31, p.z); P.box(0.26, 0.08, 0.26, M.brassHi, p.x, 0.64, p.z);
    }
    if (bridgeGap) {
      for (const [z0, z1] of [[a.y, BELT_Z - 1.1], [BELT_Z + 1.1, b.y]].map(([p, q]) => [Math.min(p, q), Math.max(p, q)])) {
        if (z1 - z0 < 0.2) continue;
        const r = P.cyl(0.055, 0.055, z1 - z0, M.copper, DX, 0.56, (z0 + z1) / 2, "z", 6);
      }
      continue;
    }
    const rail = (y, r, m) => { const o = P.cyl(r, r, len, m, mid.x - out.x, y, mid.z - out.z, "x", 6); o.rotation.set(0, -ang, Math.PI / 2); };
    rail(0.56, 0.055, M.copper); rail(0.28, 0.04, M.brass);
  }
  for (const i of [2, 3, 6, 7]) { const p = pts[i]; P.box(0.34, 1.0, 0.34, ironPost, p.x, 0.5, p.y); P.lantern(p.x, 1.22, p.y, C.amber, 1.3); }
  for (let x = -10.5; x <= 10.5; x += 3.5) { P.box(0.06, 0.2, 0.06, M.brass, x, -0.85, DZ + 0.05); P.lantern(x, -1.1, DZ + 0.06, C.amber, 1.0); }
  for (const x of [-8, 0, 8]) { const l = new THREE.PointLight(0xff9a3a, 2.5, 4, 1.6); l.position.set(x, 1.4, DZ - 0.8); lights.add(l); }
}

function buildUnderside(root) {
  const P = parts(root);
  const r = rng(42), rockA = toon(C.soot), rockB = toon(C.iron);
  for (let i = 0; i < 120; i++) {
    const x = (r() * 2 - 1) * (DX - 0.9), z = (r() * 2 - 1) * (DZ - 0.7);
    const fall = 1 - Math.pow(Math.abs(x) / DX, 2) * 0.8;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + r() * 0.55, 0), r() < 0.7 ? rockA : rockB);
    m.position.set(x, -THICK - 0.2 - r() * 1.4 * fall, z); m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.y = 0.75; root.add(m);
  }
  for (let x = -9.6; x <= 9.6; x += 3.2) {
    if (Math.abs(x - 3.2) < 0.1) continue; // the elbows hang here
    const t = P.torus(0.62, 0.075, M.copper, x, -THICK + 0.02, DZ - 0.05, "z", Math.PI, 12); t.rotation.z = Math.PI;
  }
  for (const x of [2.6, 3.9]) {
    const e = P.torus(0.35, 0.16, M.copper, x, -THICK - 0.05, DZ - 0.45, "x", Math.PI / 2, 8);
    P.cyl(0.16, 0.16, 0.6, M.copper, x, -THICK - 0.65, DZ - 0.1, "y", 8); P.cyl(0.21, 0.21, 0.1, M.brassHi, x, -THICK - 0.98, DZ - 0.1, "y", 8);
  }
  const ox = -1.0, oz = DZ - 0.3;
  P.cyl(0.08, 0.08, 1.3, M.brass, ox, -THICK - 0.65, oz, "y", 6);
  const orb = P.ball(0.55, glow(C.cyan, 1.4), ox, -THICK - 1.85, oz, 1);
  for (let i = 0; i < 3; i++) P.torus(0.66, 0.05, M.brassHi, ox, orb.position.y, oz, "z", Math.PI * 2, 12).rotation.y = (i * Math.PI) / 3;
  P.torus(0.67, 0.06, M.brassHi, ox, orb.position.y, oz, "y", Math.PI * 2, 12);
  const l = new THREE.PointLight(0x41f3f7, 4, 3.5, 1.5); l.position.copy(orb.position); root.add(l);
  root.add(halo(C.cyan, 2.6, ox, orb.position.y, oz + 0.3, 0.45));
}

function buildBelt(root) {
  const tread = canvasTex(8, 8, (g) => {
    g.fillStyle = hex(C.soot); g.fillRect(0, 0, 8, 8);
    g.fillStyle = hex(C.iron); g.fillRect(0, 0, 8, 1); g.fillRect(0, 7, 8, 1);
    g.fillStyle = hex(C.brass);
    for (const [x, y] of [[2, 2], [3, 3], [4, 4], [3, 5], [2, 6]]) g.fillRect(x, y - 0.5, 2, 1);
  }, [(X1 - X0) / 0.7, 1]);
  const P = parts(root), len = X1 - X0, side = toon(C.iron);
  root.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.7), [side, side, toon(0xffffff, { map: tread }), side, side, side]), {}).translateX((X0 + X1) / 2).translateY(BELT_Y - 0.04).translateZ(BELT_Z));
  for (const dz of [-0.4, 0.4]) P.box(len + 0.3, 0.12, 0.1, M.brass, (X0 + X1) / 2, BELT_Y, BELT_Z + dz);
  P.cyl(0.14, 0.14, 0.9, M.brassHi, X0 - 0.15, BELT_Y - 0.02, BELT_Z, "z", 8);
  for (let x = X0 + 1; x < X1; x += 2.5) P.box(0.12, 0.16, 0.6, toon(C.rust), x, 0.03, BELT_Z);
  return tread;
}

function buildCrate(root) {
  const face = canvasTex(8, 8, (g) => {
    g.fillStyle = hex(C.crate); g.fillRect(0, 0, 8, 8);
    g.fillStyle = hex(C.crateDk); g.fillRect(0, 0, 8, 1); g.fillRect(0, 7, 8, 1); g.fillRect(0, 0, 1, 8); g.fillRect(7, 0, 1, 8); g.fillRect(1, 3, 6, 1);
    g.fillStyle = hex(C.brassHi); g.fillRect(0, 0, 1, 1); g.fillRect(7, 0, 1, 1); g.fillRect(0, 7, 1, 1); g.fillRect(7, 7, 1, 1);
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.56), toon(0xffffff, { map: face }));
  root.add(m);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), glow(C.cyan, 0.9)); band.position.y = 0.05; band.visible = false; m.add(band);
  return { mesh: m, band };
}

const ease = (x) => x * x * (3 - 2 * x);
const SPEED = 2.2, WORK = 1.5;

export function buildScene() {
  const scene = new THREE.Scene();
  const root = new THREE.Group(); scene.add(root);
  const lights = new THREE.Group(); scene.add(lights);
  const key = new THREE.DirectionalLight(0xffe6c8, 1.9); key.position.set(-5, 9, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a30, 1.6); rim.position.set(8, 3, -8); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffa070, 0x2a1020, 0.5));

  buildDeck(root, lights);
  buildUnderside(root);
  const tread = buildBelt(root);
  const stations = STATIONS.map(([name, make], i) => { const s = make(root); s.group.position.set(STX[i], 0, ST_Z); s.name = name; return s; });
  const launch = buildLaunch(root, { x0: BRIDGE[0], x1: BRIDGE[1], z: BELT_Z, deckMat: deckTop });
  const shippy = buildShippy(root, -11.85, -1.2, 0.5);
  const crate = buildCrate(root);

  // the story: a crate visits each machine in turn, rides the bridge into the rocket, the rocket flies, Shippy hops
  const beats = [["appear", 0.5, {}]];
  let x = X0 + 0.3;
  STX.forEach((sx, i) => { beats.push(["move", Math.abs(sx - x) / SPEED, { from: x, to: sx }]); beats.push(["work", WORK, { i }]); x = sx; });
  beats.push(["move", (X1 - x) / SPEED, { from: x, to: X1 }]);
  beats.push(["bridge", (launch.pad.x - 0.2 - X1) / (SPEED * 0.8), {}]);
  beats.push(["load", 0.6, {}], ["launch", 6.5, {}], ["shippy", 1.0, {}], ["rest", 1.5, {}]);
  const total = beats.reduce((s, b) => s + b[1], 0);

  // taps play one machine on demand
  const manual = new Map(); // key -> u (0..1)
  const MANUAL = { rocket: 6.5, shippy: 1.0 };

  let t = 0;
  function pose(time, dt) {
    let left = time % total, beat = beats[beats.length - 1], u = 0;
    for (const b of beats) { if (left < b[1]) { beat = b; u = left / b[1]; break; } left -= b[1]; }
    const [name, , arg] = beat;
    const idx = beats.indexOf(beat);
    const workIdx = beats.findIndex((b) => b[0] === "work" && b[2].i === STX.length - 1);
    let cx = X0 + 0.3, cy = BELT_Y + 0.25, cz = BELT_Z, scale = 1, beltOn = false, built = false;
    const story = { station: -1, su: -1, launch: -1, hop: -1 };
    if (name === "appear") scale = ease(u);
    else if (name === "move") { cx = arg.from + (arg.to - arg.from) * ease(u); beltOn = true; }
    else if (name === "work") { cx = STX[arg.i]; story.station = arg.i; story.su = u; }
    else if (name === "bridge") { const k = ease(u); cx = X1 + (launch.pad.x - 0.2 - X1) * k; cz = BELT_Z + (launch.pad.z - BELT_Z) * Math.max(0, (k - 0.5) * 2); cy = 0.25 + 0.16 * (1 - k); }
    else if (name === "load") { cx = launch.pad.x - 0.2; cz = launch.pad.z; cy = 0.41 + u * 0.4; scale = 1 - ease(u); }
    else { scale = 0; }
    if (name === "launch") story.launch = u;
    if (name === "shippy") story.hop = u;
    built = idx > beats.findIndex((b) => b[0] === "work" && b[2].i === 2) && (name !== "work" || arg.i > 2 || (arg.i === 2 && u > 0.5));
    crate.mesh.position.set(cx, cy, cz); crate.mesh.scale.setScalar(Math.max(0.001, scale)); crate.band.visible = built;

    for (const [k, v] of manual) { const nu = v + dt / (MANUAL[k] ?? WORK); if (nu >= 1) manual.delete(k); else manual.set(k, nu); }
    stations.forEach((s, i) => s.act(manual.has(s.name) ? manual.get(s.name) : story.station === i ? story.su : -1));
    launch.launch(manual.has("rocket") ? manual.get("rocket") : story.launch);
    shippy.hop(manual.has("shippy") ? manual.get("shippy") : story.hop);
    return beltOn;
  }

  const pickables = [...stations.map((s) => [s.name, s.group]), ["rocket", launch.group], ["shippy", shippy.group]];
  const ray = new THREE.Raycaster();
  return {
    scene,
    bounds: { x0: -DX - 0.5, x1: launch.island.x + 3, y0: -3.4, y1: 4.2, z0: -DZ - 0.4, z1: DZ + 0.4 },
    step(dt) { t += dt; if (pose(t, dt)) tread.offset.x -= (dt * SPEED) / 0.7; },
    seek(time) { t = time; pose(t, 0); },
    // what's under a tap: { key, focus } or null
    pick(ndc, camera) {
      ray.setFromCamera(ndc, camera);
      let best = null;
      for (const [k, obj] of pickables) {
        const hit = ray.intersectObject(obj, true)[0];
        if (hit && (!best || hit.distance < best.d)) best = { key: k, d: hit.distance };
      }
      return best ? this.focusFor(best.key) : null;
    },
    focusFor(k) {
      const focus = k === "rocket" ? new THREE.Vector3(launch.island.x, 1.4, launch.island.z)
        : k === "shippy" ? shippy.group.position.clone().setY(0.6)
        : stations.find((s) => s.name === k)?.group.position.clone().setY(1.1);
      return focus ? { key: k, focus, zoom: k === "rocket" ? 2.2 : k === "shippy" ? 4 : 3 } : null;
    },
    poke(k) { if (!manual.has(k)) manual.set(k, 0); },
  };
}
