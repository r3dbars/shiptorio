// FALLS (floating-city art pass, slice 7; installs only with ?artpass=1). Pipes at the island's waterfall lips
// (keel-shape.js LIPS) pour water and slag down past the keel into mist; chains with counterweights hang off the
// quarry lip; a few chunks of rubble orbit the keel slowly; a mist ring turns under the tip.
// Budget (ART-PASS.md, underside share): <= 10 draw calls, 0 lights, <= 120 particles. Everything that shares a
// look is built into ONE hand-merged mesh: the iron hardware (one palette texture), the water curtains, the slag
// curtains, the mist puffs, the tip ring and the rubble (instanced). Six draw calls.
// Calm: the falls scroll slowly, the rubble takes minutes to go round; reduced motion = a still frame.

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { artPass, backdrop } from '../backdrop-kit.js';
import { CX, LIPS, SMOG_TOP, TIP, TIP_Y, TOP, front, radius } from '../keel-shape.js';

const PARTICLES = 120; // our share of the shared 1,100
const WATER = 0x9fd2d8, SLAG = 0xff8a2a, MIST = 0xd8e4e0;

export default function install(IRON) {
  if (!artPass()) return;
  IRON.part('falls', (K, root, ctx) => build(K, root, backdrop(ctx.I, root)), 1);
}

function build(K, root, B) {
  const { THREE } = K;
  let seed = 4111;
  const rr = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const endY = SMOG_TOP + 1.5; // the falls thin out into the smog sea
  const TZ = TIP[2];
  root.userData.floor = 'mine';

  // ---------------------------------------------------------------- the iron hardware: one mesh, one palette texture
  // palette cells: iron dark, iron light, rust, brass, verdigris, soot, slag glow, water glint (the last two glow)
  const PAL = [0x3c3a40, 0x6e6c74, 0x76483a, 0xa88440, 0x4c8c7c, 0x24201e, 0xffa040, 0xb8e8ee];
  const EMI = [0, 0, 0, 0, 0, 0, 0xff7a20, 0x3a6a70];
  const IRN = 0, IRL = 1, RUST = 2, BRASS = 3, VERD = 4, SOOT = 5, HOT = 6, WET = 7;
  const palTex = (cols) => K.canvasTex(PAL.length, 1, (g) => cols.forEach((c, i) => { g.fillStyle = '#' + c.toString(16).padStart(6, '0'); g.fillRect(i, 0, 1, 1); }));
  const ironMat = new THREE.MeshPhongMaterial({ map: palTex(PAL), emissiveMap: palTex(EMI), emissive: 0xffffff, flatShading: true, shininess: 18, specular: 0x2a2a2a });
  const parts = [];
  const tmp = new THREE.Object3D();
  function put(geo, cell, x, y, z, rx, ry, rz) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const uv = g.attributes.uv, u = (cell + 0.5) / PAL.length;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u, 0.5);
    tmp.position.set(x, y, z); tmp.rotation.set(rx || 0, ry || 0, rz || 0, 'YXZ'); tmp.updateMatrix(); // tilt about x, then turn about y
    g.applyMatrix4(tmp.matrix); parts.push(g);
  }
  const box = (w, h, d, c, x, y, z, rx, ry, rz) => put(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
  const cyl = (a, b, h, c, s, x, y, z, rx, ry, rz) => put(new THREE.CylinderGeometry(a, b, h, s), c, x, y, z, rx, ry, rz);
  const ring = (r, t, c, x, y, z, rx, ry) => put(new THREE.TorusGeometry(r, t, 4, 10), c, x, y, z, rx, ry);

  // a pipe out of the rock under each lip: flanged, strapped to the rock, a valve wheel on top, lit at the mouth
  // a pipe out of the rock at each lip (keel-shape LIPS: side -1 / 1 pours off the left / right flank, 0 off the
  // front): flanged, strapped, a valve wheel on top, the mouth lit; the fall leaves along the pipe's axis (dx, dz)
  const mouths = [];
  for (const L of LIPS) {
    const [lx, ly, lz] = L.at, slag = L.kind === 'slag', r = slag ? 0.36 : 0.44, dx = L.side, dz = L.side ? 0 : 1;
    const ry = L.side ? (L.side > 0 ? Math.PI / 2 : -Math.PI / 2) : 0; // turns local +z (the pipe's run) to (dx, dz)
    const at = (s, y) => [lx + dx * s, y, lz + dz * s]; // s along the run from the lip
    const body = slag ? IRN : RUST, py = ly;
    const run = (geo, cell, s, y, tilt) => { const [x, , z] = at(s, y); put(geo, cell, x, y, z, tilt, ry, 0); };
    run(new THREE.CylinderGeometry(r, r, 1.9, 8), body, 0.15, py, Math.PI / 2);
    run(new THREE.CylinderGeometry(r * 0.9, r, 0.5, 8), body, 1.2, py - 0.18, Math.PI / 2 + 0.55); // the end turns down
    for (const s of [-0.3, 0.98]) run(new THREE.TorusGeometry(r + 0.04, 0.07, 4, 10), BRASS, s, py, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, [x, , z] = at(1.0, 0); put(new THREE.BoxGeometry(0.07, 0.07, 0.05), IRL, x + Math.cos(a) * (r + 0.11) * dz, py + Math.sin(a) * (r + 0.11), z + Math.cos(a) * (r + 0.11) * dx, 0, ry, 0); }
    run(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.04, 8), slag ? HOT : WET, 1.42, py - 0.36, Math.PI / 2 + 0.55); // the lit mouth
    // a strap over the pipe pinned into the rock above, and a brace under it back to the rock
    run(new THREE.BoxGeometry(r * 2 + 0.24, 0.12, 0.12), IRN, 0.5, py + r + 0.06, 0);
    for (const sx of [-1, 1]) { const [x, , z] = at(0.5, 0); box(0.12, 0.9, 0.12, IRN, x + sx * (r + 0.06) * dz, py + 0.25, z + sx * (r + 0.06) * dx); }
    run(new THREE.BoxGeometry(0.12, 0.36, 0.7), IRN, 0.2, py - r - 0.2, 0.5);
    // valve: stem + wheel + spokes
    { const [x, , z] = at(0.1, 0); cyl(0.05, 0.05, 0.36, IRL, 6, x, py + r + 0.18, z); ring(0.24, 0.035, slag ? BRASS : VERD, x, py + r + 0.38, z, Math.PI / 2);
      for (const a of [0, Math.PI / 2]) box(0.46, 0.03, 0.03, IRL, x, py + r + 0.38, z, 0, a); }
    // a soot / rust drip down the pipe's flank
    { const [x, , z] = at(0.7, 0); box(0.05, 0.3, 0.05, slag ? SOOT : RUST, x + 0.2 * dz, py - r * 0.6, z + 0.2 * dx); }
    const [mx, , mz] = at(1.62, 0);
    mouths.push({ slag, x: mx, y: py - 0.55, z: mz, dx, dz, w: slag ? 0.55 : 0.85 });
  }

  // chains with counterweights off the quarry lip, hanging in front of the rock (they stay clear of the falls)
  const chains = [-12.6, -7.8, -2.9, 3.4, 11.2].filter((x) => LIPS.every((l) => l.side !== 0 || Math.abs(l.at[0] - x) > 1.5));
  chains.forEach((x, i) => {
    const y0 = TOP - 0.15, L = 3.2 + ((i * 2.3) % 4.2) + rr(), z = front(TOP) - 0.25, y1 = y0 - L;
    box(0.5, 0.14, 0.4, IRN, x, y0 + 0.02, z - 0.05); // the anchor plate
    for (let y = y0 - 0.12, k = 0; y > y1; y -= 0.22, k++) box(k % 2 ? 0.04 : 0.15, 0.27, k % 2 ? 0.15 : 0.04, k % 5 === 2 ? RUST : IRN, x, y, z);
    ring(0.15, 0.04, IRL, x, y1 - 0.12, z);
    if (i % 2) { // a banded drum
      cyl(0.36, 0.36, 0.72, IRN, 8, x, y1 - 0.62, z);
      for (const by of [-0.25, 0.25]) cyl(0.38, 0.38, 0.08, i % 4 === 1 ? BRASS : RUST, 8, x, y1 - 0.62 + by, z);
      cyl(0.18, 0.05, 0.22, IRL, 6, x, y1 - 1.08, z);
    } else { // a riveted block
      box(0.8, 0.62, 0.5, IRN, x, y1 - 0.5, z); box(0.84, 0.1, 0.54, RUST, x, y1 - 0.3, z); box(0.84, 0.1, 0.54, RUST, x, y1 - 0.7, z);
      for (const sx of [-0.3, 0, 0.3]) box(0.06, 0.06, 0.04, BRASS, x + sx, y1 - 0.5, z + 0.26);
    }
  });
  const hw = new THREE.Mesh(mergeGeometries(parts), ironMat);
  hw.name = 'falls:iron'; hw.userData.noBake = true; hw.receiveShadow = true; root.add(hw);

  // ---------------------------------------------------------------- the curtains (water + slag, one mesh each)
  // a strip per fall: three columns (edge, middle, edge) so the edges go soft; arcs out of the mouth, widens,
  // fades to nothing by endY. Vertex alpha does the fades; the streak texture scrolls down.
  function streaks(hot) {
    return K.canvasTex(32, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let x = 0; x < w; x++) {
        const base = 0.35 + rr() * 0.45;
        for (let y = 0; y < h; y++) {
          const v = base + Math.sin((y / h) * Math.PI * 2 * (1 + (x % 3)) + x) * 0.18 + (rr() - 0.5) * 0.12;
          g.fillStyle = hot ? `rgba(255,${(150 + v * 90) | 0},${(40 + v * 60) | 0},${Math.min(1, v + 0.1).toFixed(2)})` : `rgba(${(190 + v * 60) | 0},${(225 + v * 30) | 0},${(230 + v * 25) | 0},${Math.min(1, v).toFixed(2)})`;
          g.fillRect(x, y, 1, 1);
        }
      }
      // foam (water) or dark crust (slag) clumps riding the flow
      for (let i = 0; i < 22; i++) {
        const x = (rr() * w) | 0, y = (rr() * h) | 0, l = 2 + ((rr() * 5) | 0);
        g.fillStyle = hot ? 'rgba(60,24,10,0.85)' : 'rgba(255,255,255,0.95)';
        g.fillRect(x, y, 1 + ((rr() * 2) | 0), l);
      }
    });
  }
  function curtain(list, col, A) {
    const P = [], U = [], C = [], I = [], c = new THREE.Color(col), N = 22;
    for (const m of list) {
      const H = m.y - endY, base = P.length / 3;
      for (let i = 0; i <= N; i++) {
        const f = i / N, d = H * f * f * 0.65 + H * f * 0.35; // finer rows near the mouth, where it bends
        const y = m.y - d, o = A * (1 - Math.exp(-d / 1.6)), x = m.x + m.dx * o, z = m.z + m.dz * o, w = m.w + d * 0.06;
        const fade = f < 0.08 ? f / 0.08 * 0.4 + 0.6 : f > 0.5 ? Math.max(0, 1 - (f - 0.5) / 0.5) ** 1.4 : 1;
        for (let k = -1; k <= 1; k++) {
          P.push(x + k * w / 2, y, z + (k ? -0.04 : 0));
          U.push((k + 1) / 2 * (m.w / 0.6), d / 3.2);
          const a = fade * (k ? 0.35 : 0.85), lit = k ? 0.8 : 1;
          C.push(c.r * lit, c.g * lit, c.b * lit, a);
        }
        if (i < N) for (let k = 0; k < 2; k++) { const a = base + i * 3 + k, b = a + 3; I.push(a, b, a + 1, a + 1, b, b + 1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    g.setIndex(I);
    return g;
  }
  const flows = [];
  for (const hot of [false, true]) {
    const list = mouths.filter((m) => m.slag === hot); if (!list.length) continue;
    const tex = streaks(hot);
    const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending });
    mat.forceSinglePass = true; // see-through and two-sided: one pass, not two (a draw call each)
    const m = new THREE.Mesh(curtain(list, hot ? SLAG : WATER, hot ? 0.7 : 1.3), mat);
    m.name = hot ? 'falls:slag' : 'falls:water'; m.userData.noBake = true; m.renderOrder = 1; root.add(m);
    flows.push({ tex, speed: hot ? 0.35 : 0.9 });
  }

  // ---------------------------------------------------------------- mist: puffs where each fall thins out (static)
  const puffTex = K.canvasTex(32, 32, (g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5) / w - 0.5, dy = (y + 0.5) / h - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - r) ** 1.6 * (0.8 + 0.2 * ((x * 7 + y * 13) % 5) / 4); // a little dither, pixel style
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.fillRect(x, y, 1, 1);
    }
  });
  puffTex.magFilter = puffTex.minFilter = THREE.LinearFilter;
  {
    const P = [], U = [], C = [], I = [];
    const quad = (x, y, z, s, col, a) => {
      const b = P.length / 3, c = new THREE.Color(col);
      for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(x + qx * s, y + qy * s * 0.62, z); U.push((qx + 1) / 2, (qy + 1) / 2); C.push(c.r, c.g, c.b, a); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (const m of mouths) {
      const H = m.y - endY;
      for (let i = 0; i < 5; i++) {
        const f = 0.55 + i * 0.1, d = H * f, o = m.slag ? 0.7 : 1.3;
        quad(m.x + m.dx * o + (rr() - 0.5) * 1.6, m.y - d, m.z + m.dz * o + 0.4 + i * 0.05, 1.8 + i * 0.7 + rr(), m.slag ? 0xffa070 : MIST, 0.16 + 0.05 * (4 - i) / 4);
      }
      quad(m.x + m.dx * 0.2, m.y - 0.6, m.z + 0.25, 0.9, m.slag ? 0xffb060 : MIST, m.slag ? 0.35 : 0.18); // spray at the mouth
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    g.setIndex(I);
    const mist = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: puffTex, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    mist.name = 'falls:mist'; mist.userData.noBake = true; mist.renderOrder = 2; root.add(mist);
  }

  // ---------------------------------------------------------------- the mist ring under the tip (polar UVs: it turns by scrolling)
  const ringTex = K.canvasTex(64, 16, (g, w, h) => {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const band = Math.sin((y / (h - 1)) * Math.PI), u = x / w * Math.PI * 2;
      const wisp = 0.7 + 0.18 * Math.sin(u * 5 + Math.sin(u * 2) * 1.5) + 0.12 * Math.sin(u * 9 + y * 0.6);
      const a = band ** 1.8 * wisp * (0.9 + 0.1 * (((x * 5 + y * 3) % 4) / 3));
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.fillRect(x, y, 1, 1);
    }
  });
  ringTex.magFilter = ringTex.minFilter = THREE.LinearFilter;
  let ringMesh;
  {
    const P = [], U = [], I = [], S = 40, rings = [[1.5, 4.4, 0], [2.8, 6.6, -1.0]];
    for (const [r0, r1, dy] of rings) {
      const b = P.length / 3;
      for (let i = 0; i <= S; i++) {
        const a = (i / S) * Math.PI * 2;
        for (const [r, v] of [[r0, 0], [r1, 1]]) { P.push(CX + Math.cos(a) * r, TIP_Y - 3.2 + dy, TZ + Math.sin(a) * r); U.push(i / S, v); }
        if (i < S) { const k = b + i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    ringMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: ringTex, color: 0xb8e0dc, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }));
    ringMesh.material.forceSinglePass = true;
    ringMesh.name = 'falls:ring'; ringMesh.userData.noBake = true; ringMesh.renderOrder = 2; root.add(ringMesh);
  }

  // ---------------------------------------------------------------- rubble: chunks orbiting the keel (one instanced mesh)
  const N_RUB = 8;
  const rubMat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 4 });
  const rub = K.dyn(new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rubMat, N_RUB));
  rub.name = 'falls:rubble'; rub.frustumCulled = false; rub.castShadow = false; rub.receiveShadow = false; root.add(rub);
  const STONE = [0x6e5e50, 0x5a5862, 0x4c4852, 0x705c48, 0x42404a];
  const chunks = [];
  for (let i = 0; i < N_RUB; i++) {
    const f = (i + 0.5) / N_RUB, y = TOP - 2.5 - f * (TOP - TIP_Y - 3) + (rr() - 0.5) * 1.5;
    const R = Math.max(3.5, radius(y)) + 2.2 + rr() * 3.5, s = 0.3 + rr() * (0.45 + (1 - f) * 0.35);
    chunks.push({ y, R, s, a: (i / N_RUB) * Math.PI * 2 * 2.6 + rr(), w: (0.035 + rr() * 0.03) * (i % 3 ? 1 : -1), ph: rr() * 6, spin: 0.1 + rr() * 0.2,
      sx: 1 + rr() * 0.3, sy: 0.7 + rr() * 0.3, sz: 1 + rr() * 0.2, dust: rr() * 2 });
    rub.setColorAt(i, new THREE.Color(STONE[i % STONE.length]));
  }
  const q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), mtx = new THREE.Matrix4();
  const place = (t) => {
    chunks.forEach((c, i) => {
      const a = c.a + c.w * t;
      pv.set(CX + Math.cos(a) * c.R, c.y + Math.sin(t * 0.25 + c.ph) * 0.15, TZ + Math.sin(a) * c.R * 0.75);
      e.set(c.ph + t * c.spin * 0.6, c.ph * 2 + t * c.spin, 0); q.setFromEuler(e);
      sv.set(c.s * c.sx, c.s * c.sy, c.s * c.sz);
      rub.setMatrixAt(i, mtx.compose(pv, q, sv));
      c.px = pv.x; c.py = pv.y; c.pz = pv.z;
    });
    rub.instanceMatrix.needsUpdate = true;
  };
  place(0);
  rub.instanceColor.needsUpdate = true;

  // ---------------------------------------------------------------- update: scroll, orbit, a few drops and motes
  const live = [];
  const spawn = (...a) => { if (live.length >= PARTICLES) return; const f = K.spawn(root, ...a); if (f) live.push(f); };
  let acc = 0;
  return {
    update(t, dt) {
      if (B.calm()) return; // reduced motion / calm: a still frame
      for (const f of flows) f.tex.offset.y -= f.speed * dt;
      ringTex.offset.x += 0.006 * dt;
      place(t);
      for (let i = live.length - 1; i >= 0; i--) if (live[i].life <= 0) live.splice(i, 1);
      acc += dt;
      if (acc < 0.12) return;
      acc = 0;
      for (const m of mouths) { // drops and sparks leaving the lip
        const x = m.x + (Math.random() - 0.5) * m.w, z = m.z + 0.1;
        if (m.slag) spawn(x, m.y, z, (Math.random() - 0.5) * 0.4, -0.2, 0.5 + Math.random() * 0.4, Math.random() < 0.6 ? 0xffb050 : 0xff6a20, 1.1, 0.05, 2.2, true);
        else spawn(x, m.y, z, (Math.random() - 0.5) * 0.5, -0.4, 0.8 + Math.random() * 0.5, Math.random() < 0.7 ? 0xd8f0f2 : 0x9fc8d0, 1.0, 0.05, 3.0);
      }
      const c = chunks[(Math.random() * chunks.length) | 0]; // dust shed by a passing chunk
      if (Math.random() < 0.5) spawn(c.px, c.py - c.s * 0.6, c.pz, 0, -0.05, 0, Math.random() < 0.5 ? 0x7a6c5c : 0x5c5650, 2.4, 0.05 + Math.random() * 0.04, 0.12);
    }
  };
}
