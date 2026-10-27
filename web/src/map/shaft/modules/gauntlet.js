// =====================================================================
// THE GAUNTLET (shaft checks floor + the merge gate) — GAUNTLET agent
// Machines 'ci', 'check', 'verify', 'review' (checks floor, work flows right -> left) and 'gate' (launch floor).
// Every station carries the PR capsule across its FRONT on its own roller lane (in at the right, out at the left),
// stops it at the station's instrument for the real check, and either rolls it on to the next station or dumps
// it forward through the reject port (the chute below drops it onto the red rework lip belt).
//   CI INSPECTOR  x-ray arch over the lane, the TESTS board (a ticker of little lamps going green one by one), a
//                 phosphor screen showing the scan, a rack of bubbling test tubes. Rejects: the tilt table dumps it.
//   CHECK         one compact instrument per researched tech: sieve, key-sniffer vault, stamping press, magnifier,
//                 balance scale (deps), stopwatch dyno, bellows camera, canary cage.
//   VERIFY BAY    a glass bell jar lowers over the capsule and the replay drum plays the original bug back: a
//                 clockwork beetle scuttles out. Fixed = green wash and the bug flips over; not fixed = sparks + siren.
//   AI REVIEW     a brass reading machine: the diff tape streams past magnifier lenses under the aether eye, a
//                 reading head traverses the capsule, then the big stamp comes down: APPROVED / CHANGES.
//   MERGE GATE    a vault door in a riveted wall, a signal lever and a bell. The capsule waits on the turntable in
//                 front of the door for the player ("Merge #142?"); yes = bolts retract, wheel spins, the door swings
//                 open and it rolls through to the pad; no = the turntable turns it onto the red siding.
// IDLE = lights down, still. WORKING = lit, turning. BLOCKED = each machine's own alarm (see each builder).
// Real time: a station keeps scanning until M.judge() returns a verdict, and holds at a port until M.give() says yes.
// =====================================================================

const C45 = Math.SQRT1_2;
const GREEN = 0x46ff8a, RED = 0xff3a2a, AMBER = 0xffb020;

// 3x5 pixel font for plates and signs
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
  9: '111101111001111', '#': '101111101111101', '?': '111001010000010', '!': '010010010000010', '.': '000000000000010',
  '-': '000000111000000', '+': '000010111010000', ':': '000010000010000', '/': '001001010100100', ' ': '000000000000000',
};
function glyph(c, ch, x, y, col, s) { const b = FONT[ch] || FONT[' ']; s = s || 1; c.fillStyle = col; for (let k = 0; k < 15; k++) if (b[k] === '1') c.fillRect(x + (k % 3) * s, y + Math.floor(k / 3) * s, s, s); }

// =====================================================================
// SHARED KIT: palette (one per IRON, so static parts merge into few draw calls), textures, text plates
// =====================================================================
function makeKit(K) {
  const THREE = K.THREE, mat = K.mat;
  const P = {
    soot: mat(0x1e1814), dark: mat(0x0e0b09),
    iron: mat(0x3a3029, { shine: 22, spec: 0x2e2e34 }), ironM: mat(0x483c33, { shine: 18, spec: 0x26262c }),
    ironL: mat(0x64574b, { shine: 30, spec: 0x3a3a40 }), ironX: mat(0x7e6f60, { shine: 40, spec: 0x50505a }),
    brass: mat(0xb8883c, { shine: 42, spec: 0x8a6a30 }), brassD: mat(0x7a5822, { shine: 24, spec: 0x4a3818 }),
    brassL: mat(0xe4b85e, { shine: 60, spec: 0xb09050 }), brass2: mat(0xb8883c, { shine: 42, spec: 0x8a6a30, double: true }),
    copper: mat(0xac5a30, { shine: 36, spec: 0x7a4428 }), copperD: mat(0x72401f, { shine: 20, spec: 0x3a1a0a }),
    copper2: mat(0xac5a30, { shine: 36, spec: 0x7a4428, double: true }),
    verd: mat(0x43927a, { shine: 16 }), verdD: mat(0x2f6a58, { shine: 16 }),
    wood: mat(0x6e4c2c), woodD: mat(0x4c341f),
    rust: mat(0x92461f), rustD: mat(0x5a2612),
    hazard: mat(0xe0a01c), paint: mat(0xd99a16, { shine: 26, spec: 0x5a4a20 }), paintD: mat(0x8a2c14, { shine: 18, spec: 0x3a1a0a }),
    red: mat(0xa82818, { shine: 22, spec: 0x4a1a10 }), redD: mat(0x6a1a10, { shine: 16 }),
    cream: mat(0xe4d2a8), steel: mat(0x8c8a88, { shine: 50, spec: 0x707078 }), ink: mat(0x140c06),
    rubber: mat(0x17130f), paper: mat(0xd8c8a0),
    oil: mat(0x0b0b10, { shine: 90, spec: 0x7a6a9a }), grime: mat(0x0a0806, { op: 0.42, depthWrite: false }),
    glass: mat(0xbfe8da, { op: 0.2, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
    glassD: mat(0x9ad0c4, { op: 0.3, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
  };
  const plateTex = K.canvasTex(32, 32, (c) => {
    c.fillStyle = '#4c4238'; c.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) { const o = (y / 8) % 2 ? 4 : 0; c.fillStyle = '#6a5c4e'; c.fillRect((x + o) % 32, y + 2, 3, 1); c.fillRect((x + o + 1) % 32, y + 1, 1, 3); c.fillStyle = '#2e2620'; c.fillRect((x + o + 1) % 32, y + 4, 2, 1); }
    c.fillStyle = 'rgba(10,8,6,0.35)'; c.fillRect(3, 18, 9, 6); c.fillRect(20, 4, 6, 4);
  }, [6, 6]);
  P.plate = mat(0xffffff, { map: plateTex, shine: 20, spec: 0x2a2620 });
  const plateTexS = plateTex.clone(); plateTexS.repeat.set(3, 3); plateTexS.needsUpdate = true;
  P.plateS = mat(0xffffff, { map: plateTexS, shine: 20, spec: 0x2a2620 });
  // rollers: stripes around the circumference, scrolled per machine so the rollers seem to turn
  const rollTex = K.canvasTex(16, 2, (c) => { for (let x = 0; x < 16; x++) { c.fillStyle = x % 8 < 2 ? '#d8c8a8' : x % 8 < 4 ? '#8a7a66' : '#4e4238'; c.fillRect(x, 0, 1, 2); } }, [1, 1]);
  const texts = new Map();
  function textTex(str, o) {
    o = o || {};
    const s = o.s || 1, pad = o.pad === undefined ? 2 : o.pad;
    const tw = str.length * 4 * s - s, w = Math.max(o.w || 0, tw + pad * 2), h = 5 * s + pad * 2;
    return K.canvasTex(w, h, (c) => {
      c.fillStyle = o.bg || '#7a5822'; c.fillRect(0, 0, w, h);
      if (o.rim) { c.fillStyle = o.rim; c.fillRect(0, 0, w, 1); c.fillStyle = o.rimD || 'rgba(0,0,0,0.45)'; c.fillRect(0, h - 1, w, 1); }
      const x0 = Math.round((w - tw) / 2);
      str.split('').forEach((ch, i) => glyph(c, ch, x0 + i * 4 * s, pad, o.fg || '#1e1408', s));
    });
  }
  // a shared text plate material (same text + style = same material)
  function text(str, o) {
    const key = str + '|' + JSON.stringify(o || {});
    if (!texts.has(key)) texts.set(key, mat(0xffffff, { map: textTex(str, o), shine: 30, spec: 0x4a3a20, e: (o && o.e) || 0 }));
    return texts.get(key);
  }
  return { THREE, P, rollTex, text, textTex };
}

// a bank of N boxes in one mesh with per-box position/size/color, rewritten in place: lamp grids, tickers,
// liquid levels, tape marks. One draw call however many lamps.
function boxBank(K, parent, n, opts) {
  const THREE = K.THREE; opts = opts || {};
  const base = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const bp = base.attributes.position.array, bn = base.attributes.normal.array, V = bp.length / 3;
  const pos = new Float32Array(n * V * 3), nor = new Float32Array(n * V * 3), col = new Float32Array(n * V * 3);
  for (let i = 0; i < n; i++) nor.set(bn, i * V * 3);
  base.dispose();
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
  const ca = new THREE.BufferAttribute(col, 3); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', ca);
  const m = opts.lit ? new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 30, specular: 0x333333 })
    : new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: !!opts.op, opacity: opts.op || 1, depthWrite: !opts.op, blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(geo, m); mesh.userData.noBake = true; mesh.castShadow = false; mesh.receiveShadow = !!opts.lit;
  K.dyn(mesh); parent.add(mesh);
  const last = new Int32Array(n).fill(-1), tc = new THREE.Color();
  return {
    mesh, n,
    box(i, x, y, z, sx, sy, sz) {
      const o = i * V * 3;
      for (let k = 0; k < V; k++) { pos[o + k * 3] = bp[k * 3] * sx + x; pos[o + k * 3 + 1] = bp[k * 3 + 1] * sy + y; pos[o + k * 3 + 2] = bp[k * 3 + 2] * sz + z; }
      pa.needsUpdate = true;
    },
    color(i, hex) {
      if (last[i] === hex) return; last[i] = hex; tc.setHex(hex);
      const o = i * V * 3; for (let k = 0; k < V; k++) { col[o + k * 3] = tc.r; col[o + k * 3 + 1] = tc.g; col[o + k * 3 + 2] = tc.b; }
      ca.needsUpdate = true;
    },
    bound() { geo.computeBoundingSphere(); geo.computeBoundingBox(); },
  };
}

// local direction -> root yaw, with the paths' convention (Euler YZX, capsule long axis = local x)
const yawOf = (dx, dz) => Math.atan2(-(C45 * (dx + dz)), C45 * (dx - dz));

// per-machine helpers (particles, gears, gauges, pulses, glyphs) bound to the machine's group
function tools(K, g, kit) {
  const { THREE, P } = kit;
  const T = {};
  const E = new THREE.Euler(0, 0, 0, 'YZX'), Q = new THREE.Quaternion();
  T.aim = (it, yaw, pitch, roll, q0, k) => {
    E.set(roll || 0, yaw, pitch || 0, 'YZX'); Q.setFromEuler(E);
    if (q0 && k !== undefined && k < 1) it.mesh.quaternion.copy(q0).slerp(Q, Math.max(0, k)); else it.mesh.quaternion.copy(Q);
  };
  T.gear = (p, r, thick, teeth, m, x, y, z) => {
    const gg = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(10, teeth), 0, 0, 0, gg);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
    K.cyl(r * 0.3, r * 0.3, thick * 1.6, P.ironM, 8, 0, 0, 0, gg);
    if (r > 0.25) for (let i = 0; i < 3; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.14, P.brassD, 0, 0, 0, gg); s.rotation.y = i * Math.PI / 3; }
    return gg;
  };
  T.rivets = (p, cx, cz, r, y, n, m) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.06, 0.06, 0.06, m || P.brassL, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, p); } };
  T.row = (p, x0, y0, z0, x1, y1, z1, n, m, s) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); K.box(s || 0.06, s || 0.06, s || 0.06, m || P.brassL, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k, p); } };
  T.band = (p, cx, cz, r, y, m, h, seg) => K.cyl(r, r, h || 0.1, m || P.brass, seg || 16, cx, y, cz, p);
  // gauge facing +z of its group (ry/rx turn it); returns the needle pivot (rotate .z), marked dyn
  T.gauge = (p, x, y, z, r, ry, rx, rimM) => {
    const gg = K.group(p, x, y, z); gg.rotation.order = 'YXZ'; gg.rotation.y = ry || 0; gg.rotation.x = rx || 0;
    const rim = K.cyl(r * 1.16, r * 1.16, 0.07, rimM || P.brass, 12, 0, 0, 0, gg); rim.rotation.x = Math.PI / 2;
    const face = K.cyl(r, r, 0.08, P.cream, 12, 0, 0, 0.01, gg); face.rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) { const a = -2.1 + i / 6 * 4.2; const tk = K.box(0.014, r * 0.2, 0.014, P.ink, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0.056, gg); tk.rotation.z = -a; }
    const red = K.box(r * 0.5, r * 0.18, 0.02, P.red, r * 0.45, r * 0.45, 0.056, gg); red.rotation.z = -0.8;
    const piv = K.dyn(K.group(gg, 0, 0, 0.062));
    K.box(0.03, r * 0.85, 0.02, P.ink, 0, r * 0.38, 0, piv);
    return piv;
  };
  // hazard stripes along local x of a group at (x,y,z) turned ry
  T.hazard = (p, len, x, y, z, n, ry, h, d) => {
    const gg = K.group(p, x, y, z); gg.rotation.y = ry || 0; const w = len / n;
    for (let i = 0; i < n; i++) K.box(w * 0.96, h || 0.1, d || 0.04, i % 2 ? P.soot : P.hazard, -len / 2 + w * (i + 0.5), 0, 0, gg);
    return gg;
  };
  T.puff = (x, y, z, col, size, vy, spread, life, vx, vz) => K.spawn(g, x + K.R() * spread, y, z + K.R() * spread, (vx || 0) + K.R() * 0.3, vy, (vz || 0) + K.R() * 0.3, col, life || 2, size, -0.12);
  T.sparks = (x, y, z, n, col, spd) => { for (let i = 0; i < (n || 6); i++) K.spawn(g, x + K.R() * 0.15, y, z + K.R() * 0.15, K.R() * (spd || 2.4), 0.6 + Math.random() * 1.4, K.R() * (spd || 2.4), col || (Math.random() < 0.5 ? 0xffd25a : 0xfff4d0), 0.45, 0.045, 6, true); };
  T.dust = (x, y, z, n) => { for (let i = 0; i < (n || 5); i++) K.spawn(g, x + K.R() * 0.3, y, z + K.R() * 0.3, K.R() * 1.2, 0.3 + Math.random() * 0.4, K.R() * 1.2, Math.random() < 0.5 ? 0x6a5a48 : 0x8a7a64, 0.7, 0.06, -0.2); };
  T.motes = (x, y, z, n, col) => { for (let i = 0; i < (n || 8); i++) { const a = Math.random() * Math.PI * 2; K.spawn(g, x + Math.cos(a) * 0.2, y, z + Math.sin(a) * 0.2, Math.cos(a) * 1.4, 0.8 + Math.random() * 1.2, Math.sin(a) * 1.4, Math.random() < 0.5 ? col : 0xffffff, 0.6, 0.05, 1.5, true); } };
  // handoff pulse: a ring of light where an item changes hands (two reused rings)
  const rings = [0, 1].map(() => { const r = K.torus(0.3, 0.045, K.glow(0xffffff, 0, true), 4, 18, 0, 0, 0, g); r.rotation.x = Math.PI / 2; r.castShadow = false; K.dyn(r); return { r, t: 9 }; });
  T.pulse = (x, y, z, col) => { const p = rings[0].t >= rings[1].t ? rings[0] : rings[1]; p.t = 0; p.r.position.set(x, y, z); p.r.material.color.setHex(col || 0xfff0c0); p.r.visible = true; };
  T.stepPulses = (dt) => rings.forEach((p) => { if (p.t >= 1) { p.r.visible = false; return; } p.t += dt / 0.55; const k = Math.min(1, p.t); p.r.scale.setScalar(1 + k * 2.4); p.r.material.opacity = 0.9 * (1 - k); });
  // verdict glyph: a big green check / red X pops over the machine on the verdict, an amber "!" while blocked
  T.glyph = (x, y, z, s) => {
    const gl = K.dyn(K.group(g, x, y, z)); gl.rotation.y = Math.PI / 4; gl.scale.setScalar(s || 1);
    const gOk = K.glow(0x5aff9a), gNo = K.glow(0xff4030), gBang = K.glow(0xffb020, 0.95), gInk = K.glow(0x120604, 0.7);
    const gC = K.dyn(K.group(gl)), gX = K.dyn(K.group(gl)), gB = K.dyn(K.group(gl));
    const stroke = (grp, w, h, m, sx, sy, rz) => { const a = K.box(w, h, 0.05, m, sx, sy, 0.02, grp); a.rotation.z = rz; const b = K.box(w + 0.09, h + 0.09, 0.04, gInk, sx, sy, -0.02, grp); b.rotation.z = rz; };
    stroke(gC, 0.14, 0.42, gOk, -0.2, -0.12, 0.75); stroke(gC, 0.14, 0.84, gOk, 0.14, 0.06, -0.6);
    for (const r of [0.785, -0.785]) stroke(gX, 0.14, 0.88, gNo, 0, 0, r);
    stroke(gB, 0.16, 0.5, gBang, 0, 0.12, 0); stroke(gB, 0.16, 0.16, gBang, 0, -0.32, 0);
    const frameM = K.glow(0xffffff, 0.5, true);
    K.torus(0.52, 0.03, frameM, 4, 24, 0, 0, 0, gl);
    gl.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    let tt = 0, y0 = y;
    return {
      gl,
      // kind: 'pass' | 'fail' | 'block' | null
      set(kind, t, dt) {
        gl.visible = !!kind;
        if (!kind) { tt = 0; return; }
        tt += dt;
        gC.visible = kind === 'pass'; gX.visible = kind === 'fail'; gB.visible = kind === 'block';
        const pop = kind === 'block' ? 1 + Math.sin(t * 8) * 0.08 : Math.min(1.25, tt * 6) - Math.max(0, Math.min(0.25, (tt - 0.2) * 2));
        gl.scale.setScalar(Math.max(0.01, pop) * (s || 1));
        frameM.color.setHex(kind === 'block' ? 0xffb020 : kind === 'pass' ? GREEN : RED);
        frameM.opacity = 0.35 + Math.sin(t * 10) * 0.2;
        if (kind === 'block') gBang.opacity = Math.sin(t * 9) > -0.2 ? 0.95 : 0.3;
        gl.position.y = y0 + Math.sin(t * 2) * 0.05;
      },
    };
  };
  // a lamp: a small sphere/box whose own material lights up (returns the material)
  T.lamp = (p, x, y, z, r, off, box) => { const m = K.mat(off || 0x2a1a10, { e: 0, shine: 40, spec: 0x806040 }); const l = box ? K.box(r * 2, r * 1.6, r * 2, m, x, y, z, p) : K.sph(r, m, x, y, z, p, 8, 6); l.castShadow = false; return m; };
  return T;
}

// =====================================================================
// PLINTHS
// =====================================================================
function bigPlinth(K, S, T, kit, label) {
  const P = kit.P;
  K.box(4.8, 0.3, 4.8, P.ironM, 0, 0.15, 0, S);
  K.box(4.9, 0.08, 4.9, P.brassD, 0, 0.33, 0, S);
  K.box(4.62, 0.04, 4.62, P.plate, 0, 0.39, 0, S);
  T.row(S, -2.3, 0.2, 2.47, 2.3, 0.2, 2.47, 9, P.brassL, 0.08); T.row(S, 2.47, 0.2, -2.3, 2.47, 0.2, 2.3, 9, P.brassL, 0.08);
  T.hazard(S, 4.4, 0, 0.12, 2.47, 14, 0, 0.1, 0.03); T.hazard(S, 4.4, 2.47, 0.12, 0, 14, -Math.PI / 2, 0.1, 0.03);
  for (const [x, z, sx, sz] of [[-0.9, 0.6, 0.6, 0.4], [0.3, -1.8, 0.45, 0.3], [-1.9, -0.6, 0.4, 0.28]]) { const p = K.sph(1, P.oil, x, 0.41, z, S, 10, 4); p.scale.set(sx, 0.02, sz); p.castShadow = false; }
  for (let i = 0; i < 7; i++) { const d = K.box(0.4 + K.rnd() * 0.6, 0.01, 0.3 + K.rnd() * 0.4, P.grime, -2 + K.rnd() * 4, 0.415, -2 + K.rnd() * 4, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
  // maker's plate on the front-left face
  K.box(1.3, 0.2, 0.03, kit.text(label, { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e', w: 34 }), -1.25, 0.2, 2.47, S);
  for (const x of [-1.85, -0.65]) K.box(0.05, 0.05, 0.05, P.brassL, x, 0.2, 2.5, S);
}
function smallPlinth(K, S, T, kit, label) {
  const P = kit.P;
  K.box(1.6, 0.22, 1.6, P.ironM, 0, 0.11, 0, S);
  K.box(1.66, 0.06, 1.66, P.brassD, 0, 0.23, 0, S);
  K.box(1.52, 0.03, 1.52, P.plateS, 0, 0.27, 0, S);
  T.row(S, -0.7, 0.13, 0.82, 0.7, 0.13, 0.82, 5, P.brassL, 0.06); T.row(S, 0.82, 0.13, -0.7, 0.82, 0.13, 0.7, 5, P.brassL, 0.06);
  // name plate on the front-right face
  K.box(0.03, 0.14, 1.1, kit.text(label, { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e', w: 30 }), 0.82, 0.13, -0.1, S);
}

// =====================================================================
// THE LANE: a roller bench from the `in` port to the `pass` port along the machine's front, with the intake tray
// and stop boom at `in`, the pass outlet (lamp + semaphore) at `pass`, and the red reject trough at `reject`
// (in front of the lane's middle). Rollers share one material whose texture scrolls, so they turn as items roll.
// =====================================================================
function makeLane(K, g, S, T, kit, o) {
  const { THREE, P } = kit;
  const V3 = THREE.Vector3;
  const big = !!o.big;
  const IN = new V3(o.IN[0], 0, o.IN[1]), PASS = new V3(o.PASS[0], 0, o.PASS[1]), REJ = new V3(o.REJ[0], 0, o.REJ[1]);
  const MID = IN.clone().add(PASS).multiplyScalar(0.5);
  const LD = PASS.clone().sub(IN); const Lh = LD.length() / 2; LD.normalize();
  const FWD = new V3(C45, 0, C45);
  const rotY = Math.atan2(-LD.z, LD.x);
  const LG = K.group(S, MID.x, 0, MID.z); LG.rotation.y = rotY;
  const fs = Math.sin(rotY) * FWD.x + Math.cos(rotY) * FWD.z > 0 ? 1 : -1;
  const W = (w) => w * fs; // forward offset -> LG z
  const rejU = REJ.clone().sub(MID).dot(LD), rejW = REJ.clone().sub(MID).dot(FWD);
  const bw = big ? 0.3 : 0.21, r = big ? 0.055 : 0.045, step = big ? 0.19 : 0.15;
  const yB = 1.0 - 2 * r - 0.015; // bench top
  const rt = kit.rollTex.clone(); rt.needsUpdate = true;
  const rollM = K.mat(0xffffff, { map: rt, shine: 34, spec: 0x504a40 });
  const ext = Lh + (big ? 0.12 : 0.08);
  // bench body + brass top rails + skirt
  K.box(ext * 2, 0.2, bw * 2 + 0.04, P.ironM, 0, yB - 0.1, 0, LG);
  K.box(ext * 2, 0.08, bw * 2 - 0.1, P.soot, 0, yB - 0.24, 0, LG);
  for (const s of [-1, 1]) { K.box(ext * 2, 0.05, 0.06, P.brass, 0, yB + 0.005, W(s * bw), LG); T.row(LG, -ext + 0.12, yB - 0.1, W(s * (bw + 0.025)), ext - 0.12, yB - 0.1, W(s * (bw + 0.025)), big ? 12 : 7, P.brassL, 0.05); }
  // rollers (skip the sections a machine replaces: tilt table, test plate...)
  const skip = o.skip || [];
  for (let u = -Lh + 0.1; u <= Lh - 0.08; u += step) { if (skip.some(([a, b]) => u > a && u < b)) continue; const c = K.cyl(r, r, bw * 2 - 0.05, rollM, 8, u, 1.0 - r, 0, LG); c.rotation.x = Math.PI / 2; }
  // back guard rail full length; front rail only between the tray, the reject gap and the outlet
  const rail = (u0, u1, w) => { K.box(u1 - u0, 0.05, 0.04, P.brass, (u0 + u1) / 2, 1.13, W(w), LG); for (let u = u0 + 0.05; u < u1; u += 0.42) K.box(0.04, 0.16, 0.04, P.brassD, u, 1.05, W(w), LG); K.box(0.04, 0.16, 0.04, P.brassD, u1 - 0.03, 1.05, W(w), LG); };
  rail(-Lh + 0.05, Lh - 0.05, -(bw + 0.03));
  const gap = o.frontGap || [rejU - (big ? 0.42 : 0.3), rejU + (big ? 0.42 : 0.3)];
  if (-Lh + 0.62 < gap[0]) rail(-Lh + 0.62, gap[0], bw + 0.03);
  if (gap[1] < Lh - 0.62) rail(gap[1], Lh - 0.62, bw + 0.03);
  // legs down to the deck
  for (const u of [-Lh + 0.14, Lh - 0.14]) for (const s of [-1, 1]) { K.box(0.09, yB - 0.2, 0.09, P.iron, u, (yB - 0.2) / 2 + 0.05, W(s * (bw - 0.06)), LG); K.box(0.16, 0.05, 0.16, P.ironM, u, 0.12, W(s * (bw - 0.06)), LG); }
  if (big) { K.box(0.16, yB - 0.3, 0.16, P.iron, 0, (yB - 0.3) / 2 + 0.15, W(-bw + 0.1), LG); }
  // intake tray: a wider catch plate + back guide at `in`
  K.box(big ? 0.62 : 0.46, 0.04, bw * 2 + 0.24, P.brassD, -Lh + (big ? 0.2 : 0.14), yB - 0.205, W(0.06), LG);
  K.box(big ? 0.5 : 0.36, 0.2, 0.05, P.brass, -Lh + (big ? 0.28 : 0.2), 1.06, W(-(bw + 0.09)), LG);
  // stop boom across the tray exit: down while an item waits at the tray, up when it's taken
  const boomP = K.dyn(K.group(LG, -Lh + (big ? 0.58 : 0.42), 1.2, W(-(bw + 0.07))));
  { const n = 6, len = bw * 2 + 0.16, ww = len / n; for (let i = 0; i < n; i++) K.box(0.05, 0.06, ww * 0.95, i % 2 ? P.soot : P.hazard, 0, 0, W(ww * (i + 0.5)), boomP); K.box(0.1, 0.1, 0.1, P.brassD, 0, 0, 0, boomP); }
  K.box(0.09, 0.32, 0.09, P.ironM, -Lh + (big ? 0.58 : 0.42), 1.03, W(-(bw + 0.07)), LG);
  // pass outlet: brass end posts, a green lamp on a post
  for (const s of [-1, 1]) K.box(0.06, 0.24, 0.06, P.brassD, Lh - 0.02, 1.0, W(s * (bw + 0.02)), LG);
  K.box(0.07, 0.62, 0.07, P.iron, Lh - 0.1, 1.27, W(-(bw + 0.12)), LG);
  const passM = T.lamp(LG, Lh - 0.1, 1.62, W(-(bw + 0.12)), big ? 0.075 : 0.06, 0x0c2a14);
  K.cyl(0.08, 0.09, 0.05, P.brassD, 8, Lh - 0.1, 1.54, W(-(bw + 0.12)), LG);
  // reject trough: red iron, from the bench's front edge out past the port, hazard lip, red lamp
  const RJ = K.group(S, MID.x + LD.x * rejU, 0, MID.z + LD.z * rejU); RJ.rotation.y = Math.atan2(-FWD.z, FWD.x); // RJ local x = forward
  const t0 = bw - 0.04, t1 = rejW + (big ? 0.28 : 0.22), tw = big ? 0.24 : 0.19;
  K.box(t1 - t0, 0.04, tw * 2, P.red, (t0 + t1) / 2, 0.955, 0, RJ);
  for (const s of [-1, 1]) K.box(t1 - t0, 0.14, 0.04, P.red, (t0 + t1) / 2, 1.02, s * tw, RJ);
  T.hazard(RJ, tw * 2, t1 - 0.02, 1.0, 0, 4, Math.PI / 2, 0.14, 0.03);
  K.box(0.06, 0.95 - 0.1, 0.06, P.rustD, (t0 + t1) / 2, (0.95 - 0.1) / 2 + 0.1, tw - 0.04, RJ);
  const rejM = T.lamp(RJ, t0 + 0.06, 1.16, -(tw + 0.05), big ? 0.07 : 0.055, 0x3a0c08);
  K.box(0.05, 0.22, 0.05, P.ironM, t0 + 0.06, 1.0, -(tw + 0.05), RJ);
  const pt = (u, w, y, out) => (out || new V3()).set(MID.x + LD.x * u + FWD.x * w, y, MID.z + LD.z * u + FWD.z * w);
  let boomOpen = 1;
  return {
    LG, MID, LD, FWD, Lh, W, rt, rollM, rejU, rejW, bw, IN, PASS, REJ, passM, rejM,
    uIn: -Lh, uPass: Lh, pt, yawLane: yawOf(LD.x, LD.z), yawPass: o.yawPass, yawRej: yawOf(FWD.x, FWD.z),
    roll(du) { rt.offset.x -= du / (2 * Math.PI * r) * 0.5; },
    boom(waiting, dt) { boomOpen += ((waiting ? 0 : 1) - boomOpen) * Math.min(1, dt * 7); boomP.rotation.x = -fs * boomOpen * 1.35; },
  };
}

// =====================================================================
// CI INSPECTOR
// =====================================================================
function buildCI(K, M, kit) {
  const { THREE, P } = kit;
  const V3 = THREE.Vector3;
  const lerp = K.lerp, sm = K.smooth, cl = K.clamp01;
  const g = K.group();
  const S = K.group(g);
  const T = tools(K, g, kit);
  bigPlinth(K, S, T, kit, 'CI');
  const lane = makeLane(K, g, S, T, kit, { IN: [2.9, 0.6], PASS: [0.6, 2.9], REJ: [2.05, 2.05], big: true, skip: [[-0.4, 0.4]], yawPass: yawOf(0, 1) });
  const { LG, W } = lane;

  // ---------- TILT TABLE (the lane's middle section): tips forward to dump a reject into the trough ----------
  const TT = K.dyn(K.group(LG, 0, 0.885, W(lane.bw)));
  K.box(0.78, 0.04, lane.bw * 2, P.iron, 0, 0, W(-lane.bw), TT);
  for (const s of [-1, 1]) K.box(0.05, 0.1, lane.bw * 2, P.brassD, s * 0.39, 0.03, W(-lane.bw), TT);
  for (let u = -0.29; u <= 0.3; u += 0.19) { const c = K.cyl(0.055, 0.055, lane.bw * 2 - 0.05, lane.rollM, 8, u, 0.06, W(-lane.bw), TT); c.rotation.x = Math.PI / 2; }
  K.cyl(0.035, 0.035, 0.3, P.steel, 6, 0, -0.16, W(-lane.bw * 2 + 0.08), TT);
  K.cyl(0.06, 0.06, 0.26, P.ironL, 8, 0, 0.62, W(-lane.bw + 0.02), LG);
  { const h = K.cyl(0.04, 0.04, 0.8, P.ironM, 6, 0, 0.885, W(lane.bw), LG); h.rotation.z = Math.PI / 2; }
  const T_HAZ = T.hazard(LG, 0.8, 0, 0.9, W(lane.bw + 0.035), 6, 0, 0.05, 0.02);

  // ---------- X-RAY ARCH over the lane's middle (in the plane x = 1.75, seen at 45deg) ----------
  const AX = 1.75, AZ = 1.75, AR = 0.68, AY = 2.15;
  const arch = K.group(S, AX, 0, AZ);
  for (const s of [-1, 1]) {
    const z = s * AR;
    K.box(0.22, AY - 0.41, 0.22, P.iron, 0, (AY + 0.41) / 2, z, arch);
    K.box(0.34, 0.16, 0.34, P.ironM, 0, 0.49, z, arch); K.box(0.36, 0.05, 0.36, P.brassD, 0, 0.59, z, arch);
    for (let i = 0; i < 7; i++) { const c = K.torus(0.15, 0.04, i % 2 ? P.copperD : P.copper, 4, 10, 0, 0.82 + i * 0.1, z, arch); c.rotation.x = Math.PI / 2; }
    K.box(0.28, 0.06, 0.28, P.brass, 0, 0.74, z, arch); K.box(0.28, 0.06, 0.28, P.brass, 0, 1.55, z, arch);
    T.row(arch, 0.12, 1.7, z - 0.07, 0.12, AY - 0.05, z - 0.07, 3, P.brassL, 0.05);
  }
  { const a = K.torus(AR, 0.12, P.iron, 6, 14, 0, AY, 0, arch, Math.PI); a.rotation.y = Math.PI / 2;
    const b = K.torus(AR + 0.12, 0.04, P.brass, 4, 14, 0, AY, 0, arch, Math.PI); b.rotation.y = Math.PI / 2;
    const c = K.torus(AR - 0.12, 0.03, P.brassD, 4, 14, 0, AY, 0, arch, Math.PI); c.rotation.y = Math.PI / 2; }
  // x-ray head on the crown: tube housing, plate, cooling fins, cable to the board
  const HY = AY + AR + 0.1;
  K.box(0.44, 0.34, 0.6, P.ironM, 0, HY + 0.12, 0, arch); K.box(0.48, 0.05, 0.64, P.brass, 0, HY + 0.31, 0, arch);
  for (let i = 0; i < 5; i++) K.box(0.46, 0.03, 0.04, P.ironL, 0, HY + 0.02 + i * 0.05, 0.31, arch);
  K.box(0.02, 0.16, 0.5, kit.text('X-RAY', { bg: '#1a120c', fg: '#9affc8', rim: '#7a5822', w: 26 }), 0.23, HY + 0.13, 0, arch);
  const tubeG = K.cyl(0.09, 0.09, 0.36, P.glass, 8, -0.05, HY + 0.5, 0, arch); tubeG.castShadow = false;
  K.cyl(0.11, 0.11, 0.06, P.brassD, 8, -0.05, HY + 0.34, 0, arch); K.cyl(0.07, 0.11, 0.08, P.brass, 8, -0.05, HY + 0.71, 0, arch);
  const filM = K.glow(0x2a6a4a);
  K.box(0.05, 0.22, 0.05, filM, AX - 0.05, HY + 0.5, AZ, g);
  K.tube([[AX - 0.22, HY + 0.2, AZ - 0.2], [AX - 0.9, HY + 0.4, AZ - 0.9], [-0.2, 3.3, -0.2]], 0.045, P.rubber, S, 10, 4);
  // klaxon on the head (spins red when a PR is sent back)
  K.cyl(0.13, 0.15, 0.08, P.brassD, 8, AX + 0.05, HY + 0.38, AZ + 0.2, g);
  const klaxSpin = K.dyn(K.group(g, AX + 0.05, HY + 0.52, AZ + 0.2));
  const klaxM = K.mat(0x3a0c08, { e: 0 }); K.box(0.18, 0.11, 0.06, klaxM, 0.05, 0, 0, klaxSpin);
  const klaxDome = K.sph(0.14, K.glow(0xff3020, 0.3), AX + 0.05, HY + 0.52, AZ + 0.2, g, 8, 6); klaxDome.castShadow = false;
  // the scan curtain in the arch, the sweeping scan line, the emitter lamps on the inner edge
  const curtM = K.glow(0x8affc8, 0.0, true);
  const curt = K.box(0.02, 1.55, AR * 2 - 0.36, curtM, AX, 1.0 + 0.775, AZ, g); curt.castShadow = false;
  const scanM = K.glow(0xd8ffe8, 0.0, true);
  const scanL = K.dyn(K.box(0.05, 0.035, AR * 2 - 0.3, scanM, AX, 1.5, AZ, g)); scanL.castShadow = false;
  const emit = boxBank(K, g, 11);
  const EMN = 11;
  for (let i = 0; i < EMN; i++) {
    let y, z;
    if (i < 3) { y = 1.25 + i * 0.3; z = -AR + 0.13; } else if (i >= EMN - 3) { y = 1.25 + (EMN - 1 - i) * 0.3; z = AR - 0.13; }
    else { const a = Math.PI - (i - 2) / (EMN - 5 + 1) * Math.PI; y = AY + Math.sin(a) * (AR - 0.13); z = Math.cos(a) * (AR - 0.13); }
    emit.box(i, AX + 0.12, y, AZ + z, 0.05, 0.08, 0.08); emit.color(i, 0x1a2a20);
  }
  emit.bound();

  // ---------- TESTS BOARD (back corner, facing the camera) ----------
  const TB = K.group(S, -0.78, 0.41, -0.78); TB.rotation.y = Math.PI / 4;
  const BW = 2.5, BH = 3.25, BD = 0.55, FZ = BD / 2;
  K.box(BW, BH, BD, P.iron, 0, BH / 2, 0, TB);
  K.box(BW + 0.1, 0.12, BD + 0.1, P.brassD, 0, BH + 0.06, 0, TB); K.box(BW + 0.16, 0.06, BD + 0.16, P.brass, 0, BH + 0.15, 0, TB);
  K.box(BW + 0.08, 0.18, BD + 0.08, P.ironM, 0, 0.09, 0, TB);
  for (const s of [-1, 1]) { K.box(0.1, BH, 0.1, P.brassD, s * (BW / 2 - 0.02), BH / 2, FZ, TB); T.row(TB, s * (BW / 2 - 0.02), 0.35, FZ + 0.05, s * (BW / 2 - 0.02), BH - 0.2, FZ + 0.05, 9, P.brassL, 0.05); }
  K.box(BW - 0.1, 0.06, 0.08, P.brass, 0, BH - 0.48, FZ + 0.01, TB);
  K.box(1.5, 0.3, 0.04, kit.text('TESTS', { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e', w: 30 }), 0, BH - 0.24, FZ + 0.02, TB);
  // lamp field: a soot panel in a brass bezel, 6 x 4 test lamps + tick marks
  const LFY = 2.42;
  K.box(1.78, 1.18, 0.04, P.soot, 0, LFY, FZ + 0.01, TB);
  for (const s of [-1, 1]) { K.box(1.9, 0.06, 0.06, P.brass, 0, LFY + s * 0.62, FZ + 0.03, TB); K.box(0.06, 1.3, 0.06, P.brass, s * 0.92, LFY, FZ + 0.03, TB); }
  const lamps = boxBank(K, TB, 24);
  for (let i = 0; i < 24; i++) { const c = i % 6, r = Math.floor(i / 6); lamps.box(i, -0.7 + c * 0.28, LFY + 0.39 - r * 0.26, FZ + 0.05, 0.19, 0.15, 0.05); lamps.color(i, 0x22180e); }
  lamps.bound();
  for (let c = 0; c < 6; c++) K.box(0.12, 0.02, 0.02, P.cream, -0.7 + c * 0.28, LFY - 0.53, FZ + 0.04, TB);
  // phosphor screen (shows the capsule in the arch), gauges, vents
  const scrTex = K.canvasTex(48, 24, (c) => {
    c.fillStyle = '#04140a'; c.fillRect(0, 0, 48, 24);
    for (let y = 0; y < 24; y += 2) { c.fillStyle = 'rgba(80,255,150,0.06)'; c.fillRect(0, y, 48, 1); }
    c.fillStyle = '#2a8a50'; c.fillRect(8, 8, 28, 9); c.fillStyle = '#1a5a34'; c.fillRect(6, 9, 2, 7); c.fillRect(36, 9, 2, 7);
    c.fillStyle = '#7affb0'; for (let i = 0; i < 6; i++) c.fillRect(11 + i * 4, 10, 1, 5); c.fillRect(10, 12, 24, 1);
    c.fillStyle = '#c8ffe0'; c.fillRect(20, 10, 3, 5);
  }, [1, 1]);
  const qTex = K.canvasTex(48, 24, (c) => { c.fillStyle = '#1a1004'; c.fillRect(0, 0, 48, 24); glyph(c, '?', 18, 2, '#ffb020', 4); });
  const scrM = K.mat(0x60a070, { map: scrTex, e: 0x0a2a14 });
  const scrX = -0.55, scrY = 1.32;
  K.box(0.98, 0.64, 0.05, P.brassD, scrX, scrY, FZ + 0.01, TB);
  K.box(0.86, 0.52, 0.04, scrM, scrX, scrY, FZ + 0.04, TB);
  T.row(TB, scrX - 0.45, scrY + 0.28, FZ + 0.05, scrX + 0.45, scrY + 0.28, FZ + 0.05, 4, P.brassL, 0.04);
  const ndl = [T.gauge(TB, 0.5, 1.48, FZ + 0.03, 0.2, 0, 0), T.gauge(TB, 0.92, 1.16, FZ + 0.03, 0.14, 0, 0)];
  for (let i = 0; i < 6; i++) K.box(1.6, 0.04, 0.02, P.soot, 0, 0.36 + i * 0.08, FZ + 0.01, TB);
  // valve tubes on the cabinet top + a little brass bell
  const valveM = K.glow(0x5a3a14);
  for (const x of [-0.75, -0.45, 0.6]) { const v = K.cyl(0.1, 0.1, 0.36, P.glass, 8, x, BH + 0.38, 0, TB); v.castShadow = false; K.cyl(0.12, 0.12, 0.08, P.brassD, 8, x, BH + 0.2, 0, TB); K.cyl(0.04, 0.04, 0.22, valveM, 6, x, BH + 0.36, 0, TB); }
  K.tube([[-1.3, 0.6, 0.0], [-1.6, 0.6, 0.4], [-1.65, 0.45, 1.1]], 0.05, P.copper, TB, 8, 5);

  // ---------- TEST TUBE RACK (right side, behind the intake) ----------
  const RK = K.group(S, 2.12, 0.41, -0.62); RK.rotation.y = Math.PI / 4;
  K.box(1.06, 0.07, 0.34, P.wood, 0, 0.5, 0, RK); K.box(1.06, 0.06, 0.34, P.woodD, 0, 0.95, 0, RK);
  K.box(1.1, 0.04, 0.38, P.brassD, 0, 0.99, 0, RK);
  for (const x of [-0.5, 0.5]) { K.box(0.06, 1.05, 0.3, P.iron, x, 0.52, 0, RK); K.box(0.14, 0.05, 0.36, P.ironM, x, 0.03, 0, RK); }
  for (let i = 0; i < 6; i++) { const x = -0.36 + i * 0.144; const tb = K.cyl(0.058, 0.058, 0.6, P.glass, 8, x, 0.92, 0, RK); tb.castShadow = false; K.sph(0.058, P.glass, x, 0.62, 0, RK, 8, 4).castShadow = false; K.torus(0.062, 0.016, P.brassL, 4, 8, x, 1.22, 0, RK).rotation.x = Math.PI / 2; }
  const liquid = boxBank(K, RK, 6, { lit: false });
  for (let i = 0; i < 6; i++) { liquid.box(i, -0.36 + i * 0.144, 0.8, 0, 0.07, 0.36, 0.07); liquid.color(i, 0x7a5a20); }
  liquid.bound();
  // round flask + coil condenser beside the rack
  const flask = K.sph(0.2, P.glass, 0.72, 1.24, 0.05, RK, 10, 8); flask.castShadow = false;
  const flaskM = K.glow(0x3a7a50, 0.85);
  K.sph(0.15, flaskM, 0.72, 1.2, 0.05, RK, 8, 6);
  K.cyl(0.05, 0.05, 0.4, P.glass, 6, 0.72, 1.56, 0.05, RK).castShadow = false;
  for (let i = 0; i < 4; i++) K.torus(0.08, 0.018, P.copper, 4, 10, 0.72, 1.48 + i * 0.07, 0.05, RK).rotation.x = Math.PI / 2;
  K.box(0.4, 0.06, 0.4, P.ironM, 0.72, 0.99, 0.05, RK); K.cyl(0.03, 0.03, 0.06, P.brassL, 6, 0.72, 1.02, 0.05, RK);
  K.tube([[0.3, 1.3, 0.1], [-0.2, 1.45, 0.3], [-0.95, 1.3, 0.7], [-1.35, 1.05, 0.95]], 0.035, P.verd, RK, 12, 4);

  // ---------- COMPRESSOR (left side): air receiver, pump + flywheel, gauge, pipes to the tilt ram and the arch ----------
  const CP = K.group(S, -0.62, 0.41, 2.12); CP.rotation.y = Math.PI / 4;
  { const tk = K.cyl(0.3, 0.3, 1.0, P.copper, 12, -0.1, 0.55, 0, CP); tk.rotation.z = Math.PI / 2;
    for (const x of [-0.6, 0.4]) { const e = K.sph(0.3, P.copperD, x, 0.55, 0, CP, 10, 6); e.scale.x = 0.35; }
    for (const x of [-0.45, -0.1, 0.25]) { const b = K.cyl(0.315, 0.315, 0.06, P.brassD, 12, x, 0.55, 0, CP); b.rotation.z = Math.PI / 2; }
    for (const x of [-0.42, 0.22]) { K.box(0.12, 0.3, 0.5, P.iron, x, 0.15, 0, CP); }
    K.cyl(0.04, 0.04, 0.2, P.brassL, 6, -0.1, 0.92, 0, CP); K.sph(0.06, P.brass, -0.1, 1.04, 0, CP, 6, 4); }
  const cpNeedle = T.gauge(CP, 0.25, 0.75, 0.31, 0.13, 0, 0);
  K.box(0.36, 0.5, 0.3, P.ironM, 0.62, 0.25, -0.05, CP); K.box(0.4, 0.05, 0.34, P.brass, 0.62, 0.52, -0.05, CP);
  K.cyl(0.08, 0.08, 0.36, P.ironL, 8, 0.62, 0.72, -0.05, CP);
  const fly = K.dyn(K.group(CP, 0.62, 0.42, 0.14));
  { const w = K.cyl(0.2, 0.2, 0.05, P.iron, 12, 0, 0, 0, fly); w.rotation.x = Math.PI / 2; K.torus(0.2, 0.03, P.brassD, 4, 14, 0, 0, 0.02, fly); for (let i = 0; i < 3; i++) { const s = K.box(0.38, 0.04, 0.04, P.brass, 0, 0, 0.03, fly); s.rotation.z = i * Math.PI / 3; } }
  const pumpRod = K.dyn(K.box(0.05, 0.3, 0.05, P.steel, 0.62, 0.95, -0.05, CP));
  K.tube([[-0.62, 0.55, 2.12 - 0.62], [0.2, 0.45, 2.4], [1.2, 0.55, 2.1], [1.62, 0.6, 1.62]].map(([x, y, z]) => [x, y, z]), 0.04, P.copper, S, 12, 5);

  // ---------- caution + status lamp on the flanks, pass semaphore, verdict glyph ----------
  const caution = K.caution(S, -1.85, 0.41, 2.25, 1.0);
  const lamp = K.statusLamp(S, 2.25, 0.41, -1.85, 1.25);
  const semP = K.group(S, 0.25, 0.41, 2.62);
  K.cyl(0.04, 0.05, 1.7, P.iron, 6, 0, 0.85, 0, semP); K.cyl(0.08, 0.09, 0.05, P.brassD, 8, 0, 1.72, 0, semP);
  const semArm = K.dyn(K.group(g, 0.25 + 0.05, 1.55, 2.62)); semArm.rotation.y = Math.PI / 4;
  K.box(0.5, 0.1, 0.04, P.cream, 0.24, 0, 0, semArm); K.box(0.14, 0.1, 0.045, K.mat(0x2a9a4a), 0.42, 0, 0, semArm);
  const semLamp = T.lamp(g, 0.25, 1.82, 2.62, 0.07, 0x0c2a14);
  const vglyph = T.glyph(0.9, 4.75, 0.9, 1.0);

  // ---------- the cycle ----------
  const A = K.dyn(K.group(g));
  const q0 = new THREE.Quaternion();
  const tmp = new V3();
  const MIN_SCAN = 1.85, TFEED = 0.75, TOUT = 0.6;
  const FLAKY = ['flaky test on #', 'CI runner timed out on #', 'tests pass locally but not in CI on #'];
  let ph = 'idle', pt = 0, it = null, v = null, asked = false, first = true;
  let u = lane.uIn, wv = 0, yv = 1.0, tip = 0, lit = 0, failLamp = -1, runs = 0, lastU = u, klax = 0, semUp = 0, flash = 0, flashCol = GREEN, lightK = 0, tBub = 0, tSteam = 0, scanK = 0;
  const setPh = (p) => { ph = p; pt = 0; };
  const L = () => (it ? it.label() : '');
  function verdictNow() {
    v = M.judge(it);
    if (!v) return false;
    if (v.pass) { if (M.last) it.setKind('pass'); else it.flash(GREEN); M.pass(it); flashCol = GREEN; semUp = 1.6; T.motes(AX, 1.6, AZ, 10, GREEN); }
    else { it.setKind('reject'); M.reject(it, v.reason); flashCol = RED; klax = 2.4; failLamp = Math.min(23, Math.max(3, lit - 1 - Math.floor(Math.random() * 3))); T.sparks(AX, 1.5, AZ, 10, 0xff8050); }
    flash = 1;
    return true;
  }

  function step(dt, t) {
    if (ph === 'idle') {
      if (tip < 0.02) { const w8 = M.waiting('in'); if (w8) { it = M.take('in'); if (it) { q0.copy(it.mesh.quaternion); it.follow(A); v = null; asked = false; lit = 0; runs = 0; failLamp = -1; setPh('feed'); lane.pt(lane.uIn, 0, 1.05, tmp); T.pulse(tmp.x, tmp.y, tmp.z, 0xffd080); } } }
      return;
    }
    pt += dt;
    if (ph === 'feed') {
      const k = sm(cl(pt / TFEED)); u = lerp(lane.uIn, 0, k); wv = 0; yv = 1.0;
      T.aim(it, lane.yawLane, 0, 0, q0, cl(pt / (TFEED * 0.55)));
      if (pt >= TFEED) { setPh('scan'); T.pulse(AX, 1.05, AZ, 0x8affc8); }
    } else if (ph === 'scan') {
      // the capsule jogs back and forth through the curtain while the test lamps tick on one by one
      u = Math.sin(pt * 2.6) * 0.2; T.aim(it, lane.yawLane, 0, 0);
      lit = Math.min(24, Math.floor((pt - runs * MIN_SCAN) / 0.072));
      if (pt >= MIN_SCAN * (runs + 1) - 0.05 && !v) {
        if (!asked) { asked = true; if (M.maybeDecision(FLAKY[it.num % FLAKY.length] + it.num + ': rerun or skip?')) return; }
        if (verdictNow()) { setPh('verdict'); return; }
        runs++; // still running: the board resets and runs the suite again
      }
    } else if (ph === 'verdict') {
      u += (0 - u) * Math.min(1, dt * 8); T.aim(it, lane.yawLane, 0, 0);
      if (pt >= 0.7) setPh(v.pass ? 'out' : 'tip');
    } else if (ph === 'out') {
      const k = cl(pt / TOUT); u = lerp(0, lane.uPass, sm(k));
      T.aim(it, lane.yawLane, 0, 0, null); if (k > 0.6) { q0.copy(it.mesh.quaternion); T.aim(it, lerp(lane.yawLane, lane.yawLane + Math.PI / 4, (k - 0.6) / 0.4), 0, 0); }
      if (k >= 1) setPh('give');
    } else if (ph === 'give') {
      if (M.give(it, 'pass')) { lane.pt(lane.uPass, 0, 1.05, tmp); T.pulse(tmp.x, tmp.y, tmp.z, GREEN); it = null; v = null; setPh('idle'); }
    } else if (ph === 'tip') {
      tip = Math.min(1, tip + dt / 0.22);
      if (pt >= 0.22) setPh('dump');
    } else if (ph === 'dump') {
      const k = cl(pt / 0.42); const e = k * k; wv = lane.rejW * e; u = 0; yv = 1.0 - Math.sin(k * Math.PI) * 0.05;
      T.aim(it, lerp(lane.yawLane, lane.yawLane + Math.PI / 2, sm(k)), Math.sin(k * Math.PI) * 0.15, 0);
      if (k >= 1) setPh('giveR');
    } else if (ph === 'giveR') {
      if (M.give(it, 'reject')) { T.pulse(lane.REJ.x, 1.05, lane.REJ.z, RED); it = null; v = null; setPh('idle'); }
    }
  }

  function detail() {
    if (!it) return 'waiting for PRs';
    const re = it.attempts > 0 ? 'rework ' : '';
    if (ph === 'feed') return re + L() + ' · into the x-ray';
    if (ph === 'scan') return re + L() + (runs ? ' · re-running tests ' : ' · running tests ') + lit + '/24';
    if (ph === 'give') return L() + ' · held: next lane is full';
    if (ph === 'giveR') return L() + ' · held: reject chute is full';
    if (v) return v.pass ? L() + ' · CI green' : L() + ' · CI red: ' + v.reason;
    return L();
  }

  return { g, update(t, dt) {
    if (first) { first = false; vglyph.gl.visible = false; }
    const blk = M.blocked;
    if (!blk) step(dt, t);
    if (!blk) M.setState(it ? 'WORKING' : 'IDLE', detail());
    const S_ = M.stateShown, work = S_ === 'WORKING';
    lightK += ((work ? 1 : 0) - lightK) * Math.min(1, dt * 2.5);
    lamp.set(S_, t); caution.update(t, dt, S_);
    const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
    // the item rides the anchor
    lane.pt(u, wv, yv, A.position);
    const du = u - lastU; lastU = u; if (Math.abs(du) > 1e-5) lane.roll(du);
    lane.boom(!!M.waiting('in') && ph === 'idle', dt);
    // tilt table
    if (ph !== 'tip' && ph !== 'dump' && ph !== 'giveR') tip = Math.max(0, tip - dt / 0.35);
    TT.rotation.x = lane.W(1) * tip * 0.42;
    // ---- scan visuals ----
    const scanning = ph === 'scan' && !blk;
    scanK += ((scanning ? 1 : 0) - scanK) * Math.min(1, dt * 6);
    flash = Math.max(0, flash - dt * 1.2);
    curtM.color.setHex(blk ? 0xffa020 : flash > 0.1 ? flashCol : 0x8affc8);
    curtM.opacity = blk ? 0.14 + 0.1 * strobe : flash > 0.1 ? 0.34 * flash : scanK * (0.12 + 0.05 * Math.sin(t * 17));
    scanL.visible = scanning || blk;
    if (scanL.visible) { scanL.position.y = blk ? 1.6 : 1.05 + (0.5 + 0.5 * Math.sin(t * 5.5)) * 1.45; scanM.opacity = blk ? 0.5 * strobe : 0.85; scanM.color.setHex(blk ? 0xff6020 : 0xd8ffe8); }
    for (let i = 0; i < EMN; i++) {
      let c = 0x1a2a20;
      if (blk) c = (i + Math.floor(t * 6)) % 2 ? 0xff5a10 : 0x401004;
      else if (flash > 0.1) c = flashCol;
      else if (scanning) c = (Math.floor(t * 14) + i) % 4 === 0 ? 0xd8ffe8 : 0x3aa070;
      else if (work) c = 0x1e5a3a;
      emit.color(i, c);
    }
    filM.color.setHex(blk ? (strobe > 0.5 ? 0xff5020 : 0x401008) : scanning ? (Math.sin(t * 40) > 0 ? 0xd8ffe8 : 0x8affc8) : lightK > 0.5 ? 0x3a9a6a : 0x1a3a2a);
    // TESTS board lamps
    for (let i = 0; i < 24; i++) {
      let c;
      if (blk) c = ((i % 6) + Math.floor(i / 6) + Math.floor(t * 4)) % 2 ? 0xffa020 : 0x5a1006;
      else if (it && v && !v.pass) c = i < failLamp ? 0x2ac060 : i === failLamp ? (Math.sin(t * 14) > 0 ? 0xff3020 : 0x5a0a04) : 0x2a0e08;
      else if (it && v && v.pass) c = flash > 0.75 && (i + Math.floor(t * 30)) % 3 === 0 ? 0xeaffe8 : GREEN;
      else if (ph === 'scan') c = i < lit ? 0x3ae070 : i === lit ? (Math.sin(t * 24) > 0 ? 0xffc040 : 0x6a4010) : 0x24180c;
      else c = i === Math.floor(t * 1.2) % 24 ? 0x4a3010 : 0x1e160c;
      lamps.color(i, c);
    }
    // phosphor screen
    scrM.map = blk ? qTex : scrTex;
    scrTex.offset.x = scanning ? -u * 0.9 : scrTex.offset.x * 0.95;
    scrM.color.setHex(blk ? (strobe > 0.5 ? 0xffc060 : 0x806020) : flash > 0.1 ? flashCol : scanning ? (Math.random() < 0.08 ? 0xb0ffc8 : 0x80e0a0) : lightK > 0.5 ? 0x4a8058 : 0x24402c);
    // gauges
    const tgt = blk ? [-1.25, -1.15] : [0.9 - lightK * 0.6 - scanK * 0.9 + (ph === 'scan' ? Math.sin(t * 7) * 0.15 : 0), 0.8 - lit / 24 * 1.6];
    ndl.forEach((n, i) => { n.rotation.z += (tgt[i] + (blk ? Math.sin(t * 34 + i) * 0.07 : 0) - n.rotation.z) * Math.min(1, dt * 6); });
    cpNeedle.rotation.z += ((blk ? -1.2 + Math.sin(t * 30) * 0.06 : work ? -0.3 + Math.sin(t * 3) * 0.2 : 0.7) - cpNeedle.rotation.z) * Math.min(1, dt * 5);
    // test tubes: bubble while the suite runs, fill green test by test; red tube on a fail
    for (let i = 0; i < 6; i++) {
      const lv = 0.24 + (work ? 0.06 * Math.sin(t * (7 + i) + i) : 0) + (ph === 'scan' ? Math.min(lit / 24, 1) * 0.1 : 0);
      liquid.box(i, -0.36 + i * 0.144, 0.64 + lv / 2, 0, 0.075, lv, 0.075);
      let c = lightK > 0.3 ? 0xd0902a : 0x6a4a1a;
      if (blk) c = Math.sin(t * 8 + i) > 0 ? 0xffa020 : 0x6a2a08;
      else if (it && v && !v.pass && i === failLamp % 6) c = Math.sin(t * 12) > 0 ? 0xff3020 : 0x8a1008;
      else if (it && (v ? v.pass : lit > i * 4 + 3)) c = 0x46e080;
      liquid.color(i, c);
    }
    flaskM.color.setHex(blk ? 0xa05010 : scanning ? (Math.sin(t * 9) > 0 ? 0x5affa0 : 0x3aa070) : 0x2a5a3a);
    tBub -= dt;
    if (work && !blk && tBub <= 0) { tBub = 0.12; const i = Math.floor(Math.random() * 6); const x = 2.12 + C45 * (-0.36 + i * 0.144), z = -0.62 - C45 * (-0.36 + i * 0.144); K.spawn(g, x, 1.65, z, K.R() * 0.1, 0.5 + Math.random() * 0.4, K.R() * 0.1, Math.random() < 0.5 ? 0xd8ffe8 : 0x9affc0, 0.5, 0.03, -0.1, true); }
    // compressor: the pump thumps while working, hard when the tilt ram fires
    fly.rotation.z -= dt * (blk ? 0 : work ? 5 : 0.3) * (ph === 'tip' || ph === 'dump' ? 3 : 1);
    pumpRod.position.y = 0.95 + Math.sin(fly.rotation.z) * 0.06;
    valveM.color.setHex(blk ? (strobe > 0.5 ? 0xff5020 : 0x3a1008) : lightK > 0.5 ? (Math.random() < 0.05 ? 0xffe0a0 : 0xffb050) : 0x4a2a10);
    // klaxon (reject), semaphore + pass lamp (pass), reject lamp
    klax = Math.max(0, klax - dt);
    klaxSpin.rotation.y += dt * (klax > 0 || blk ? 10 : 0);
    klaxM.emissive.setHex(klax > 0 ? 0xff2a10 : blk ? (strobe > 0.5 ? 0xffa010 : 0) : 0);
    klaxDome.material.opacity = klax > 0 || blk ? 0.65 : 0.22; klaxDome.material.color.setHex(blk ? 0xffa020 : 0xff3020);
    semUp = Math.max(0, semUp - dt);
    semArm.rotation.z += ((semUp > 0 ? 0.9 : -0.05) - semArm.rotation.z) * Math.min(1, dt * 6);
    semLamp.emissive.setHex(semUp > 0 ? GREEN : 0);
    lane.passM.emissive.setHex(ph === 'out' || ph === 'give' ? (Math.floor(t * 8) % 2 ? GREEN : 0x1a6a32) : 0);
    lane.rejM.emissive.setHex(ph === 'tip' || ph === 'dump' || ph === 'giveR' ? (Math.floor(t * 8) % 2 ? 0xff3020 : 0x5a0a04) : blk ? (strobe > 0.5 ? 0xffa020 : 0) : 0);
    // blocked: steam out of the compressor's relief valve
    tSteam -= dt;
    if (blk && tSteam <= 0) { tSteam = 0.05; K.spawn(g, -0.62 - 0.07, 1.5, 2.12 - 0.07, K.R() * 0.3, 2.4 + Math.random(), K.R() * 0.3, Math.random() < 0.5 ? 0xd4ccbc : 0xb8b0a2, 1.6, 0.16, -0.15); }
    vglyph.set(blk ? 'block' : it && v && (ph === 'verdict' || ph === 'out' || ph === 'tip' || ph === 'dump') ? (v.pass ? 'pass' : 'fail') : null, t, dt);
    T.stepPulses(dt);
    void T_HAZ;
  } };
}

// =====================================================================
// INSTALL
// =====================================================================
export default function install(IRON) {
  let KIT = null;
  const kit = (K) => KIT || (KIT = makeKit(K));
  IRON.machine('ci', (K, M) => buildCI(K, M, kit(K)));
}
