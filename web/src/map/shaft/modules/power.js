// =====================================================================
// POWER (the shaft) — POWER agent
// The plants that drive the factory, and the teal aether conduits that carry their power to the machines.
//   STEAM       the planner's boiler (the hosted AI's API budget): brick firebox, riveted copper drum, pressure
//               gauge, sight glass, safety valve, whistle, and a little mill engine (piston, crosshead, flywheel,
//               flyball governor) turning the aether generator that feeds the planner.
//   DYNAMO      one per subscription (Claude Code, Codex ...), behind its assembler: a long-legged dynamo with
//               copper field coils, a spinning armature + commutator, sparking brushes, a flywheel, a level dial
//               and the subscription's nameplate up top where the camera sees it over the dome.
//   BATTERY     an accumulator: a rack of glass cells whose charge glow rises and falls with the level.
//   GEOTHERMAL  your own computer running local models: a wellhead on the quarry floor drawing lava heat up from
//               deep below, a heat-exchanger coil (glowing hot at the bottom, aether teal at the top) and a turbine.
//   power lines IRON.part('power'): a conduit from each plant to the back corner of every machine it feeds
//               (def.feeds), on saddles along the floor and brackets up the cliff and wall, ending in a socket;
//               pulses flow toward the machine, faster when the level is high, dim and red when offline.
// M.power() -> { level 0..1, online }: WORKING while online, IDLE when the level is ~0, BLOCKED when offline
// (or when a decision is pending). Point lights: none (quota 0) — every glow is emissive.
// =====================================================================

const C45 = Math.SQRT1_2;

// 3x5 pixel font (M, N, W drawn wider) for the nameplates
const GLYPH = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '1000111011101011000110001', N: '10011101101110011001',
  O: '111101101101111', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110',
  T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '1000110001101011101110001', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111',
  3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001',
  8: '111101111101111', 9: '111101111001111', '-': '000000111000000', '.': '000000000000010', '%': '101001010100101',
  ' ': '0000000000', '!': '11101', '+': '000010111010000', '/': '001001010100100'
};
const glyphW = (ch) => (GLYPH[ch] || GLYPH[' ']).length / 5;
const HARNESS_NAME = { claude_code: 'CLAUDE CODE', codex: 'CODEX', cursor: 'CURSOR', grok: 'GROK', local: 'LOCAL', spark: 'SPARK' };

// Local points (machine frame) where each plant's conduit starts, and the in-plant run to the edge of the plant.
// The power part routes on from the last point, so plant and line always meet.
const OUT = {
  steam: [[0.38, 0.86, 0.84], [0.38, 0.58, 1.28], [-1.25, 0.58, 1.28], [-1.6, 0.3, 1.28]],
  dynamo: [[0.16, 0.5, 0.55]],
  battery: [[-0.34, 0.5, 0.62]],
  geothermal: [[0.42, 0.62, -0.9], [0.42, 0.55, -1.04], [0.99, 0.55, -1.04]],
};
const Y_RUN = 0.3; // conduit centre above a deck (deck top + 0.2)

export default function install(IRON) {
  const I = IRON;
  const STATUS = {}; // plant id -> { S, lv, online, load } (written by the plant each frame, read by the lines)
  let PAL = null;

  // ------------------------------------------------------------------ palette (shared by every plant + the lines)
  function palette(K) {
    if (PAL) return PAL;
    const plateTex = K.canvasTex(32, 32, (c) => {
      c.fillStyle = '#4c4238'; c.fillRect(0, 0, 32, 32);
      for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) { const o = (y / 8) % 2 ? 4 : 0; c.fillStyle = '#6a5c4e'; c.fillRect((x + o) % 32, y + 2, 3, 1); c.fillRect((x + o + 1) % 32, y + 1, 1, 3); c.fillStyle = '#2e2620'; c.fillRect((x + o + 1) % 32, y + 4, 2, 1); }
      c.fillStyle = 'rgba(10,8,6,0.35)'; c.fillRect(3, 18, 9, 6); c.fillRect(20, 4, 6, 4);
    }, [3, 3]);
    const brickTex = K.canvasTex(32, 32, (c) => {
      c.fillStyle = '#2a1610'; c.fillRect(0, 0, 32, 32);
      const tones = ['#8a3e24', '#7a3420', '#94482a', '#6e301c'];
      let s = 3; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      for (let y = 0; y < 32; y += 6) for (let x = (y / 6) % 2 ? -5 : 0; x < 32; x += 10) {
        c.fillStyle = tones[Math.floor(r() * 4)]; c.fillRect(x + 1, y + 1, 9, 5);
        c.fillStyle = 'rgba(255,200,150,0.12)'; c.fillRect(x + 1, y + 1, 9, 1);
      }
      c.fillStyle = 'rgba(10,6,4,0.55)'; c.fillRect(0, 0, 32, 4); c.fillRect(12, 20, 8, 5); // soot
    }, [3, 1]);
    const coilTex = K.canvasTex(8, 16, (c) => {
      c.fillStyle = '#a85a30'; c.fillRect(0, 0, 8, 16);
      for (let y = 0; y < 16; y += 2) { c.fillStyle = '#d07a44'; c.fillRect(0, y, 8, 1); c.fillStyle = '#5a2a12'; c.fillRect(0, y + 1, 8, 1); }
      c.fillStyle = 'rgba(255,220,160,0.25)'; c.fillRect(2, 0, 1, 16);
    }, [6, 5]);
    const stoneTex = K.canvasTex(32, 32, (c) => {
      c.fillStyle = '#2e2620'; c.fillRect(0, 0, 32, 32);
      const tones = ['#6e6050', '#625444', '#76685a', '#5a4c3e'];
      let s = 11; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      for (let y = 0; y < 32; y += 8) for (let x = (y / 8) % 2 ? -6 : 0; x < 32; x += 12) { c.fillStyle = tones[Math.floor(r() * 4)]; c.fillRect(x + 1, y + 1, 11, 7); c.fillStyle = 'rgba(255,230,190,0.1)'; c.fillRect(x + 1, y + 1, 11, 1); }
      c.fillStyle = 'rgba(8,5,3,0.45)'; c.fillRect(4, 10, 7, 4); c.fillRect(20, 24, 9, 3);
    }, [3, 1]);
    PAL = {
      soot: K.mat(0x1e1814), iron: K.mat(0x3a3029, { shine: 22, spec: 0x2e2e34 }), ironM: K.mat(0x483c33, { shine: 18, spec: 0x26262c }),
      ironL: K.mat(0x64574b, { shine: 30, spec: 0x3a3a40 }), ironX: K.mat(0x7e6f60, { shine: 40, spec: 0x50505a }),
      brass: K.mat(0xb8883c, { shine: 42, spec: 0x8a6a30 }), brassD: K.mat(0x7a5822, { shine: 24, spec: 0x4a3818 }), brassL: K.mat(0xe4b85e, { shine: 60, spec: 0xb09050 }),
      copper: K.mat(0xac5a30, { shine: 36, spec: 0x7a4428 }), copperD: K.mat(0x72401f, { shine: 20, spec: 0x3a1a0a }), verd: K.mat(0x43927a, { shine: 16 }),
      steel: K.mat(0x8c8a88, { shine: 50, spec: 0x707078 }), rubber: K.mat(0x17130f), insul: K.mat(0x3a2418, { shine: 40, spec: 0x553322 }),
      wood: K.mat(0x6e4c2c), woodD: K.mat(0x4c341f), hazard: K.mat(0xe0a01c), rust: K.mat(0x92461f),
      cream: K.mat(0xf0dfb4), ink: K.mat(0x140c06), redZone: K.mat(0xc02a1a), valve: K.mat(0x9a2a18),
      glass: K.mat(0xbfe8da, { op: 0.2, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      glassC: K.mat(0xa8d8cc, { op: 0.24, shine: 70, spec: 0x9ab0aa, depthWrite: false }),
      grime: K.mat(0x0a0806, { op: 0.42, depthWrite: false }), oil: K.mat(0x0b0b10, { shine: 90, spec: 0x7a6a9a }),
      plate: K.mat(0xffffff, { map: plateTex, shine: 20, spec: 0x2a2620 }), brick: K.mat(0xffffff, { map: brickTex }),
      stone: K.mat(0xffffff, { map: stoneTex }), coal: K.mat(0x16120e, { shine: 30, spec: 0x2a2a30 }),
      coilTex,
    };
    return PAL;
  }

  // ------------------------------------------------------------------ small kit (the mockup's helpers)
  function kit(K, P) {
    const THREE = K.THREE;
    const H = {};
    H.band = (p, x, z, r, y, m, h) => K.cyl(r, r, h || 0.1, m || P.brass, 18, x, y, z, p);
    // rivets round a drum; front=true skips the ones facing away from the camera
    H.rivetRing = (p, x, z, r, y, n, m, front) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a); if (front && cx + sz < -0.7) continue; K.box(0.07, 0.07, 0.07, m || P.brassL, x + cx * r, y, z + sz * r, p); } };
    H.gear = (p, r, thick, teeth, m, x, y, z) => {
      const gg = K.group(p, x, y, z);
      K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, gg);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
      K.cyl(r * 0.3, r * 0.3, thick * 1.6, P.ironM, 8, 0, 0, 0, gg);
      return gg;
    };
    // a group whose +z faces the given local yaw (pi/4 = straight at the camera)
    H.face = (p, x, y, z, ry) => { const f = K.group(p, x, y, z); f.rotation.y = ry || 0; return f; };
    // brass-rimmed dial; returns the needle pivot (k 0..1 -> rotation.z = 1.1 - 2.2k). redLow: red zone at the low end
    H.gauge = (p, x, y, z, r, ry, redLow) => {
      const s = H.face(p, x, y, z, ry);
      const rim = K.cyl(r * 1.18, r * 1.18, 0.08, P.brass, 14, 0, 0, 0, s); rim.rotation.x = Math.PI / 2;
      const f = K.cyl(r, r, 0.1, P.cream, 14, 0, 0, 0.01, s); f.rotation.x = Math.PI / 2;
      const red = K.box(r * 0.55, r * 0.2, 0.02, P.redZone, (redLow ? -1 : 1) * r * 0.45, r * 0.45, 0.065, s); red.rotation.z = redLow ? 0.8 : -0.8;
      for (let i = 0; i < 5; i++) { const a = -1.1 + i * 0.55; K.box(0.02, r * 0.18, 0.02, P.ink, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0.065, s).rotation.z = -a; }
      K.box(0.07, 0.07, 0.03, P.brassL, 0, 0, 0.1, s);
      const piv = K.dyn(K.group(s, 0, 0, 0.075));
      K.box(0.035, r * 0.85, 0.02, P.ink, 0, r * 0.38, 0, piv);
      return piv;
    };
    H.needle = (piv, k, dt, shake, t) => { const tgt = 1.1 - 2.2 * k + (shake ? Math.sin(t * 34) * 0.08 : 0); piv.rotation.z += (tgt - piv.rotation.z) * Math.min(1, dt * 8); };
    // hazard stripes along a plinth edge (alongZ: the edge runs along local z)
    H.hazardBand = (p, len, x, y, z, n, alongZ, h) => { const w = len / n; for (let i = 0; i < n; i++) { const o = -len / 2 + w * (i + 0.5); K.box(alongZ ? 0.04 : w * 0.96, h || 0.12, alongZ ? w * 0.96 : 0.04, i % 2 ? P.soot : P.hazard, x + (alongZ ? 0 : o), y, z + (alongZ ? o : 0), p); } };
    // the machine plinth: iron slab, brass trim, tread plate top, rivets + hazard bands on the two front edges
    H.plinth = (p, hx, hz, cx, cz, hazard) => {
      cx = cx || 0; cz = cz || 0;
      K.box(hx * 2, 0.3, hz * 2, P.ironM, cx, 0.15, cz, p);
      K.box(hx * 2 + 0.08, 0.08, hz * 2 + 0.08, P.brassD, cx, 0.33, cz, p);
      K.box(hx * 2 - 0.2, 0.04, hz * 2 - 0.2, P.plate, cx, 0.39, cz, p);
      const nx = Math.max(2, Math.round(hx * 3.4)), nz = Math.max(2, Math.round(hz * 3.4));
      for (let i = 0; i <= nx; i++) K.box(0.07, 0.07, 0.07, P.brassL, cx - hx + 0.1 + i * (hx * 2 - 0.2) / nx, 0.24, cz + hz + 0.02, p);
      for (let i = 0; i <= nz; i++) K.box(0.07, 0.07, 0.07, P.brassL, cx + hx + 0.02, 0.24, cz - hz + 0.1 + i * (hz * 2 - 0.2) / nz, p);
      if (hazard !== false) { H.hazardBand(p, hx * 2 - 0.3, cx, 0.13, cz + hz + 0.025, Math.round(hx * 5) * 2, false, 0.1); H.hazardBand(p, hz * 2 - 0.3, cx + hx + 0.025, 0.13, cz, Math.round(hz * 5) * 2, true, 0.1); }
    };
    // a nameplate facing +z of its group: pixel-font texture on a brass-framed board
    H.sign = (p, text, h, x, y, z, ry, st) => {
      st = st || {};
      const t = textTex(K, text, st);
      const g = H.face(p, x, y, z, ry);
      const w = h * t.aspect;
      K.box(w + 0.1, h + 0.1, 0.06, st.frame || P.brassD, 0, 0, -0.035, g);
      const m = K.mat(0xffffff, { map: t.tex, shine: 24, spec: 0x3a2a14 });
      if (st.glow) { m.emissive.setHex(st.glowCol || 0xffffff); m.emissiveMap = t.tex; m.emissiveIntensity = st.glow; }
      const face = K.mesh(new THREE.PlaneGeometry(w, h), m, 0, 0, 0.0, g); face.castShadow = false;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) K.box(0.045, 0.045, 0.03, P.brassL, sx * (w / 2 + 0.02), sy * (h / 2 + 0.02), 0.0, g);
      return { g, w, m };
    };
    H.puff = (p, x, y, z, col, size, vy, spread, life, vx, vz) => K.spawn(p, x + K.R() * spread, y, z + K.R() * spread, (vx || 0) + K.R() * 0.3, vy, (vz || 0) + K.R() * 0.3, col, life || 2.2, size, -0.12);
    H.sparks = (p, x, y, z, n, col, speed) => { for (let i = 0; i < n; i++) K.spawn(p, x + K.R() * 0.06, y, z + K.R() * 0.06, K.R() * 2.2 * (speed || 1), 0.4 + Math.random() * 1.2 * (speed || 1), K.R() * 2.2 * (speed || 1), Math.random() < 0.5 ? (col || 0xb8fff0) : 0xffffff, 0.3 + Math.random() * 0.15, 0.035, 6, true); };
    return H;
  }

  function textTex(K, text, o) {
    o = o || {};
    const s = o.s || 2, pad = o.pad === undefined ? 2 : o.pad;
    const chars = String(text).toUpperCase().split('');
    let tw = 0; chars.forEach((c, i) => { tw += glyphW(c) + (i ? 1 : 0); });
    const W = (tw + pad * 2) * s, Hh = (5 + pad * 2) * s;
    const tex = K.canvasTex(W, Hh, (c) => {
      c.fillStyle = o.edge || '#1a120a'; c.fillRect(0, 0, W, Hh);
      c.fillStyle = o.bg || '#8a6428'; c.fillRect(s / 2, s / 2, W - s, Hh - s);
      if (o.hi) { c.fillStyle = o.hi; c.fillRect(s / 2, s / 2, W - s, s / 2); }
      if (o.lo) { c.fillStyle = o.lo; c.fillRect(s / 2, Hh - s, W - s, s / 2); }
      let x = pad;
      chars.forEach((ch) => {
        const b = GLYPH[ch] || GLYPH[' ']; const w = b.length / 5;
        if (o.shadow) { c.fillStyle = o.shadow; for (let k = 0; k < b.length; k++) if (b[k] === '1') c.fillRect((x + (k % w)) * s + s / 2, (pad + Math.floor(k / w)) * s + s / 2, s, s); }
        c.fillStyle = o.fg || '#1e1408';
        for (let k = 0; k < b.length; k++) if (b[k] === '1') c.fillRect((x + (k % w)) * s, (pad + Math.floor(k / w)) * s, s, s);
        x += w + 1;
      });
    });
    tex.wrapS = tex.wrapT = K.THREE.ClampToEdgeWrapping;
    return { tex, aspect: W / Hh };
  }

  // ------------------------------------------------------------------ state (shared by every plant)
  const clamp01 = (k) => Math.max(0, Math.min(1, k));
  function readPower(M) {
    let pw = null;
    try { pw = M.power(); } catch (e) { pw = null; }
    pw = pw || {};
    const lv = typeof pw.level === 'number' && isFinite(pw.level) ? clamp01(pw.level) : 1;
    return { level: lv, online: pw.online !== false };
  }
  // how hard the machines a plant feeds are working (0..1)
  function loadOf(def) {
    const feeds = (def && def.feeds) || [];
    let n = 0, w = 0;
    for (const id of feeds) { const s = I.stations[id]; if (!s) continue; n++; if (!s.blocked && s.state === 'WORKING') w++; }
    return n ? w / n : 0;
  }
  function newStatus() { return { S: 'IDLE', lv: 0.5, level: 0.5, online: true, load: 0, pct: -1 }; }
  // one step of a plant's state: WORKING while online, IDLE at ~0, BLOCKED when offline or a decision is pending
  function stepStatus(M, ps, dt, name) {
    const pw = readPower(M);
    ps.online = pw.online; ps.level = pw.level;
    ps.lv += (pw.level - ps.lv) * Math.min(1, dt * 2.5);
    ps.load += (loadOf(M.def) - ps.load) * Math.min(1, dt * 1.5);
    const pct = Math.round(pw.level * 100);
    if (!pw.online) { if (ps.pct !== -2) { ps.pct = -2; M.setState('IDLE', name + ' offline'); } }
    else if (pw.level < 0.04) { if (ps.pct !== -3) { ps.pct = -3; M.setState('IDLE', name + ' empty'); } }
    else if (pct !== ps.pct) { ps.pct = pct; M.setState('WORKING', name + ' ' + pct + '%'); }
    ps.S = M.blocked || !pw.online ? 'BLOCKED' : pw.level < 0.04 ? 'IDLE' : 'WORKING';
    STATUS[M.id] = ps;
    return ps;
  }
  // the state the lines see for a plant (falls back to asking the station if its machine isn't drawing it)
  const lineStatus = {};
  function statusOf(id, dt) {
    if (STATUS[id]) return STATUS[id];
    const st = I.stations[id]; if (!st || !st.M) return null;
    const ps = lineStatus[id] || (lineStatus[id] = newStatus());
    const pw = readPower(st.M);
    ps.online = pw.online; ps.lv += (pw.level - ps.lv) * Math.min(1, dt * 2.5);
    ps.load += (loadOf(st.def) - ps.load) * Math.min(1, dt * 1.5);
    ps.S = st.blocked || !pw.online ? 'BLOCKED' : pw.level < 0.04 ? 'IDLE' : 'WORKING';
    return ps;
  }

  // =====================================================================
  // STEAM: the planner's boiler house
  // =====================================================================
  IRON.machine('steam', function (K, M) {
    const P = palette(K), H = kit(K, P), THREE = K.THREE, lerp = K.lerp;
    const g = K.group();
    const ps = newStatus();
    // ---------- plinth ----------
    H.plinth(g, 1.45, 1.45);
    for (const [x, z, sx, sz] of [[0.6, -0.9, 0.5, 0.3], [-0.9, 0.7, 0.4, 0.3], [0.9, 0.2, 0.3, 0.25]]) { const o = K.sph(1, P.oil, x, 0.41, z, g, 12, 4); o.scale.set(sx, 0.02, sz); o.castShadow = false; }
    for (let i = 0; i < 4; i++) { const d = K.box(0.4 + K.rnd() * 0.5, 0.01, 0.3 + K.rnd() * 0.4, P.grime, -1.1 + K.rnd() * 2.2, 0.415, -1.1 + K.rnd() * 2.2, g); d.rotation.y = K.rnd() * 3; d.castShadow = false; }

    // ---------- brick firebox + fire door (faces front-left) ----------
    const BO = { x: -0.32, z: -0.32 };
    K.cyl(0.92, 0.98, 0.8, P.brick, 14, BO.x, 0.8, BO.z, g);
    K.cyl(0.99, 0.99, 0.08, P.iron, 14, BO.x, 1.22, BO.z, g);
    K.cyl(1.0, 1.0, 0.06, P.brassD, 14, BO.x, 0.43, BO.z, g);
    const door = H.face(g, BO.x, 0.78, BO.z + 0.93, 0);
    K.box(0.7, 0.6, 0.12, P.iron, 0, 0, 0, door);
    K.box(0.78, 0.07, 0.16, P.brassD, 0, 0.33, 0.01, door);
    const fireM = K.glow(0xffa040);
    K.box(0.52, 0.4, 0.04, fireM, 0, -0.02, 0.05, door);
    for (let i = 0; i < 5; i++) K.box(0.035, 0.4, 0.05, P.soot, -0.2 + i * 0.1, -0.02, 0.085, door);
    K.box(0.62, 0.1, 0.32, P.ironM, 0, -0.36, 0.14, door);
    const leaf = K.group(door, 0.33, 0, 0.07); leaf.rotation.y = -2.0;
    K.box(0.34, 0.5, 0.04, P.ironL, 0.17, 0, 0, leaf); K.box(0.06, 0.06, 0.08, P.brassL, 0.28, 0, 0.04, leaf);
    const spillM = K.glow(0xff7a2a, 0.22, true);
    const spill = K.box(0.9, 0.01, 0.55, spillM, BO.x, 0.43, BO.z + 1.28, g); spill.castShadow = false;
    // coal bin + shovel
    K.box(0.42, 0.22, 0.36, P.woodD, BO.x - 0.78, 0.52, BO.z + 1.25, g);
    for (let i = 0; i < 7; i++) K.rock(0.07 + K.rnd() * 0.03, P.coal, BO.x - 0.92 + (i % 4) * 0.09, 0.66, BO.z + 1.16 + Math.floor(i / 4) * 0.12, g);
    { const sh = K.group(g, BO.x - 1.02, 0.78, BO.z + 0.98); sh.rotation.set(0.15, 0.4, 0.5); K.box(0.04, 0.7, 0.04, P.wood, 0, 0, 0, sh); K.box(0.16, 0.16, 0.03, P.ironL, 0, -0.42, 0, sh); }

    // ---------- riveted copper drum, crown, chimney ----------
    const D0 = 1.26, D1 = 3.55;
    K.cyl(0.8, 0.82, D1 - D0, P.copper, 16, BO.x, (D0 + D1) / 2, BO.z, g);
    for (const y of [1.38, 2.04, 2.74, 3.44]) { H.band(g, BO.x, BO.z, 0.83, y, P.brassD, 0.1); H.rivetRing(g, BO.x, BO.z, 0.84, y + 0.075, 16, P.brassL, true); }
    K.lathe([[0.82, 0], [0.78, 0.16], [0.62, 0.34], [0.36, 0.48], [0.0, 0.53]], P.copperD, 16, BO.x, D1, BO.z, g);
    K.cyl(0.13, 0.15, 1.55, P.soot, 8, BO.x, 4.05 + 0.775, BO.z, g);
    K.cyl(0.21, 0.23, 0.14, P.brassD, 8, BO.x, 4.1, BO.z, g);
    for (const y of [4.7, 5.25]) K.cyl(0.16, 0.16, 0.06, P.iron, 8, BO.x, y, BO.z, g);
    K.cyl(0.27, 0.15, 0.2, P.iron, 8, BO.x, 5.7, BO.z, g);
    K.torus(0.26, 0.03, P.brassD, 4, 12, BO.x, 5.8, BO.z, g).rotation.x = Math.PI / 2;
    // manhole (front-left), big pressure gauge (at the camera), sight glass (front-right)
    const mh = H.face(g, BO.x + Math.sin(0.15) * 0.83, 1.72, BO.z + Math.cos(0.15) * 0.83, 0.15);
    { const d = K.cyl(0.24, 0.24, 0.05, P.brassD, 12, 0, 0, 0.01, mh); d.rotation.x = Math.PI / 2; d.scale.z = 1.25;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(0.05, 0.05, 0.05, P.brassL, Math.cos(a) * 0.2, Math.sin(a) * 0.25, 0.04, mh); } }
    const gp = Math.PI / 4;
    K.cyl(0.06, 0.06, 0.16, P.brass, 8, BO.x + Math.sin(gp) * 0.86, 2.36, BO.z + Math.cos(gp) * 0.86, g).rotation.set(Math.PI / 2, gp, 0, 'YXZ');
    const presN = H.gauge(g, BO.x + Math.sin(gp) * 0.95, 2.36, BO.z + Math.cos(gp) * 0.95, 0.3, gp, false);
    const tempN = H.gauge(g, BO.x + Math.sin(gp + 0.62) * 0.9, 3.05, BO.z + Math.cos(gp + 0.62) * 0.9, 0.15, gp + 0.62, false);
    const sgA = 1.35, sgx = BO.x + Math.sin(sgA) * 0.95, sgz = BO.z + Math.cos(sgA) * 0.95;
    K.cyl(0.055, 0.055, 1.0, P.glass, 8, sgx, 2.15, sgz, g).castShadow = false;
    for (const y of [1.62, 2.68]) { K.cyl(0.08, 0.08, 0.08, P.brass, 8, sgx, y, sgz, g); const st = K.cyl(0.035, 0.035, 0.16, P.brassD, 6, BO.x + Math.sin(sgA) * 0.86, y, BO.z + Math.cos(sgA) * 0.86, g); st.rotation.set(Math.PI / 2, sgA, 0, 'YXZ'); }
    const waterM = K.glow(0x6ad8e8);
    const water = K.dyn(K.group(g, sgx, 1.66, sgz));
    K.cyl(0.035, 0.035, 1, waterM, 6, 0, 0.5, 0, water).castShadow = false;
    // safety valve (lever + ball weight lifts when it blows) and the whistle
    const SV = { x: BO.x + 0.28, y: 3.98, z: BO.z + 0.02 };
    K.cyl(0.07, 0.09, 0.2, P.brass, 8, SV.x, SV.y + 0.06, SV.z, g); K.cyl(0.1, 0.1, 0.05, P.brassD, 8, SV.x, SV.y + 0.17, SV.z, g);
    K.box(0.04, 0.2, 0.06, P.iron, SV.x - 0.14, SV.y + 0.1, SV.z, g);
    const lever = K.dyn(K.group(g, SV.x - 0.14, SV.y + 0.2, SV.z));
    K.box(0.74, 0.045, 0.05, P.iron, 0.37, 0, 0, lever); K.sph(0.085, P.ironL, 0.7, -0.02, 0, lever, 8, 6);
    const WH = { x: BO.x - 0.1, z: BO.z + 0.34 };
    K.cyl(0.03, 0.03, 0.34, P.brass, 6, WH.x, 4.12, WH.z, g);
    K.cyl(0.075, 0.075, 0.26, P.brassL, 10, WH.x, 4.42, WH.z, g); K.cyl(0.045, 0.085, 0.07, P.brass, 10, WH.x, 4.58, WH.z, g);
    K.box(0.18, 0.025, 0.03, P.iron, WH.x + 0.09, 4.32, WH.z, g); K.box(0.012, 0.9, 0.012, P.ink, WH.x + 0.17, 3.86, WH.z, g);
    const alarmM = K.mat(0x401010, { e: 0 });
    K.sph(0.13, alarmM, BO.x - 0.5, 3.92, BO.z + 0.36, g, 8, 6); K.cyl(0.1, 0.12, 0.06, P.brassD, 8, BO.x - 0.5, 3.8, BO.z + 0.36, g);

    // ---------- mill engine on the front-right: cylinder, crosshead, flywheel, governor, aether generator ----------
    const EX = 0.95, EY = 1.0, FZ = 0.52, FY = 1.16, PIN = 0.2, ROD = 0.62;
    K.box(0.44, 0.2, 2.1, P.ironM, EX, 0.5, -0.07, g);
    K.box(0.48, 0.04, 2.14, P.brassD, EX, 0.62, -0.07, g);
    for (let i = 0; i < 5; i++) K.box(0.06, 0.06, 0.06, P.brassL, EX + 0.23, 0.52, -1.0 + i * 0.45, g);
    // cylinder + steam chest
    const cy = K.cyl(0.24, 0.24, 0.58, P.ironL, 12, EX, EY, -0.74, g); cy.rotation.x = Math.PI / 2;
    for (const z of [-1.03, -0.45]) { const f = K.cyl(0.29, 0.29, 0.06, P.brass, 12, EX, EY, z, g); f.rotation.x = Math.PI / 2; }
    K.box(0.34, 0.3, 0.46, P.iron, EX, EY - 0.3, -0.74, g);
    K.box(0.3, 0.18, 0.42, P.ironM, EX, EY + 0.3, -0.74, g); K.box(0.34, 0.04, 0.46, P.brassD, EX, EY + 0.4, -0.74, g);
    K.tube([[BO.x + 0.62, 3.1, BO.z + 0.2], [0.6, 3.0, -0.55], [EX, 2.3, -0.78], [EX, EY + 0.42, -0.78]], 0.055, P.copper, g, 16, 6);
    K.torus(0.075, 0.025, P.brassD, 4, 10, EX, EY + 0.9, -0.78, g).rotation.x = Math.PI / 2;
    // guides
    for (const dy of [-0.13, 0.13]) K.box(0.05, 0.04, 0.62, P.steel, EX, EY + dy, -0.12, g);
    K.box(0.08, 0.36, 0.06, P.iron, EX, EY, 0.19, g);
    // crosshead + piston rod (slide along z)
    const xh = K.dyn(K.group(g, EX, EY, 0));
    K.box(0.18, 0.2, 0.16, P.brass, 0, 0, 0, xh); const rod = K.cyl(0.03, 0.03, 0.8, P.steel, 6, 0, 0, -0.4, xh); rod.rotation.x = Math.PI / 2;
    // flywheel (spins about local x; its face toward the camera's right)
    K.box(0.12, FY - 0.6, 0.14, P.iron, EX - 0.16, (FY + 0.6) / 2, FZ, g);
    K.cyl(0.07, 0.07, 0.12, P.brassD, 8, EX - 0.16, FY, FZ, g).rotation.z = Math.PI / 2;
    const fly = K.dyn(K.group(g, EX + 0.06, FY, FZ));
    { const w = K.group(fly); w.rotation.y = Math.PI / 2;
      K.torus(0.5, 0.06, P.iron, 6, 22, 0, 0, 0, w); K.torus(0.535, 0.022, P.brassD, 4, 22, 0, 0, 0, w);
      for (let i = 0; i < 3; i++) { const s = K.box(0.96, 0.05, 0.05, P.brass, 0, 0, 0, w); s.rotation.z = i * Math.PI / 3; }
      const hub = K.cyl(0.09, 0.09, 0.16, P.brassL, 8, 0, 0, 0, w); hub.rotation.x = Math.PI / 2;
      const pin = K.cyl(0.04, 0.04, 0.14, P.brassL, 6, PIN, 0, 0.08, w); pin.rotation.x = Math.PI / 2; }
    // connecting rod (in the y-z plane, in front of the wheel)
    const crG = K.group(g, EX + 0.17, 0, 0); crG.rotation.y = -Math.PI / 2;
    const conrod = K.dyn(K.box(1, 0.07, 0.04, P.brassD, 0, 0, 0, crG));
    // flyball governor on the steam chest
    K.cyl(0.02, 0.02, 0.5, P.steel, 6, EX, EY + 0.65, -0.74, g); K.cyl(0.06, 0.08, 0.06, P.brassD, 8, EX, EY + 0.43, -0.74, g);
    const gov = K.dyn(K.group(g, EX, EY + 0.86, -0.74));
    K.sph(0.035, P.brassL, 0, 0.03, 0, gov, 6, 4);
    const govArms = [-1, 1].map((sd) => { const a = K.group(gov, 0, 0, 0); a.rotation.y = sd > 0 ? 0 : Math.PI; const r = K.dyn(K.group(a)); K.box(0.015, 0.26, 0.015, P.steel, 0.0, -0.13, 0, r); K.sph(0.055, P.brassL, 0, -0.27, 0, r, 8, 6); return r; });
    // aether generator behind the wheel, output flange at OUT.steam[0]
    const gen = K.cyl(0.27, 0.27, 0.42, P.ironM, 12, 0.38, FY, FZ, g); gen.rotation.z = Math.PI / 2;
    for (const x of [0.2, 0.56]) { const b = K.cyl(0.29, 0.29, 0.05, P.brass, 12, x, FY, FZ, g); b.rotation.z = Math.PI / 2; }
    const genM = K.glow(0x2cb89c);
    for (let i = 0; i < 3; i++) K.box(0.08, 0.05, 0.02, genM, 0.28 + i * 0.1, FY + 0.12, FZ + 0.27, g);
    K.cyl(0.03, 0.03, 0.36, P.steel, 6, 0.75, FY, FZ, g).rotation.z = Math.PI / 2;
    K.box(0.3, 0.5, 0.3, P.iron, 0.38, 0.65, FZ, g);
    K.cyl(0.14, 0.14, 0.06, P.brass, 10, OUT.steam[0][0], OUT.steam[0][1] + 0.08, OUT.steam[0][2], g);

    // ---------- nameplate, caution, lamp ----------
    H.sign(g, 'STEAM', 0.26, BO.x + Math.sin(0.1) * 0.86, 3.08, BO.z + Math.cos(0.1) * 0.86, 0.1, { bg: '#b8883c', fg: '#1e1408', hi: '#e4b85e', lo: '#5a3e14', edge: '#2a1a0a' });
    const caution = K.caution(g, 1.18, 0.4, -1.18, 0.8);
    const lamp = K.statusLamp(g, 1.2, 0.4, 1.2, 1.1);

    // ---------- run ----------
    let flyA = 0, spd = 0, fireK = 0.5, vent = 0, tPuff = 0, whistle = 0, tWhistle = 3, waterK = 0.6;
    const feeds = (M.def && M.def.feeds) || [];
    I.on('take', (e) => { if (e && feeds.includes(e.station)) whistle = 1; });
    const v = new THREE.Vector3();
    return { g, update(t, dt) {
      const st = stepStatus(M, ps, dt, 'steam');
      const S = st.S, blk = S === 'BLOCKED', work = S === 'WORKING';
      caution.update(t, dt, S); lamp.set(S, t);
      const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
      // engine: speed follows the pressure and how hard the planner is working
      const target = blk ? 0 : work ? (1.6 + 4.2 * st.lv) * (0.55 + 0.45 * st.load) : 0;
      spd += (target - spd) * Math.min(1, dt * (blk ? 6 : 1.5));
      flyA += dt * spd;
      fly.rotation.x = -flyA;
      const pz = FZ - PIN * Math.cos(flyA), py = FY - PIN * Math.sin(flyA);
      const zc = pz - Math.sqrt(Math.max(0.01, ROD * ROD - (py - EY) * (py - EY)));
      xh.position.z = zc;
      K.link(conrod, zc, EY, pz, py);
      gov.rotation.y += dt * spd * 1.6;
      const open = Math.min(1, spd / 6);
      govArms.forEach((a) => (a.rotation.z = 0.25 + open * 0.75));
      // firebox: banked idle, roaring working, deep red pulsing blocked
      fireK += ((work ? 0.45 + 0.55 * st.lv : blk ? 0.35 : 0.12) - fireK) * Math.min(1, dt * 2);
      const ff = 0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 6.1) * 0.07;
      if (blk) fireM.color.setRGB((0.55 + 0.4 * strobe) * ff, 0.08, 0.04);
      else fireM.color.setRGB(lerp(0.3, 1, fireK) * ff, lerp(0.07, 0.6, fireK) * ff, lerp(0.02, 0.22, fireK) * ff);
      spillM.opacity = blk ? 0.12 + 0.12 * strobe : 0.05 + 0.2 * fireK * ff;
      genM.color.setHex(blk ? (strobe > 0.5 ? 0xff5030 : 0x401008) : work ? (Math.sin(t * 9) > 0 ? 0x9afff0 : 0x5ae0c8) : 0x163a32);
      alarmM.emissive.setHex(blk && strobe > 0.5 ? 0xff2a10 : 0);
      // gauges: pressure follows the level (pegged in the red when blocked), temperature follows the fire
      H.needle(presN, blk ? 1.08 : work ? 0.08 + 0.72 * st.lv + Math.sin(t * 2.3) * 0.02 : 0.02, dt, blk, t);
      H.needle(tempN, blk ? 1.0 : 0.1 + 0.75 * fireK, dt, blk, t + 1);
      waterK += ((work ? 0.55 + Math.sin(t * 1.3) * 0.08 : blk ? 0.15 : 0.6) - waterK) * Math.min(1, dt * 2);
      water.scale.y = Math.max(0.02, waterK * 0.95);
      waterM.color.setHex(blk ? (strobe > 0.5 ? 0xff6040 : 0x401008) : 0x6ad8e8);
      // safety valve: blows when the pressure runs high, and constantly when blocked
      const wantVent = blk ? 1 : work && st.lv > 0.88 ? 0.6 : 0;
      vent += (wantVent - vent) * Math.min(1, dt * 5);
      lever.rotation.z = vent * 0.32 + (vent > 0.1 ? Math.sin(t * 40) * 0.03 * vent : 0);
      // steam + smoke
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = blk ? 0.035 : 0.12;
        if (vent > 0.2) K.spawn(g, SV.x + K.R() * 0.06, SV.y + 0.3, SV.z + K.R() * 0.06, K.R() * 0.35, (blk ? 3.4 : 2.2) + Math.random() * 0.8, K.R() * 0.35, Math.random() < 0.5 ? 0xd4ccbc : 0xb8b0a2, blk ? 2.2 : 1.4, blk ? 0.2 : 0.14, -0.18);
        if (work && Math.random() < 0.35 + 0.4 * st.lv) H.puff(g, BO.x, 5.85, BO.z, Math.random() < 0.5 ? 0x4a4038 : 0x5a5046, 0.2, 0.9, 0.1, 2.6, 0.25, 0.1);
        if (work && spd > 2 && Math.random() < 0.3) H.puff(g, EX, EY + 0.1, -1.08, 0xd8d0c0, 0.08, 0.6, 0.05, 0.8, 0.1, -0.3);
      }
      // whistle: a toot whenever the planner takes new work (and now and then while it runs)
      tWhistle -= dt; if (work && tWhistle <= 0) { tWhistle = 9 + Math.random() * 8; whistle = Math.max(whistle, 0.6); }
      if (whistle > 0) {
        if (!blk && Math.random() < 0.9) K.spawn(g, WH.x + K.R() * 0.05, 4.68, WH.z + K.R() * 0.05, K.R() * 0.5 + 0.2, 1.6 + Math.random(), K.R() * 0.5, 0xf4efe4, 1.0, 0.1, -0.15);
        whistle = Math.max(0, whistle - dt * 1.6);
      }
      if (work && Math.random() < dt * 2 * fireK) { v.set(BO.x + K.R() * 0.3, 0.75, BO.z + 1.05); K.spawn(g, v.x, v.y, v.z, K.R() * 0.4, 0.6 + Math.random() * 0.6, 0.4, Math.random() < 0.5 ? 0xffb050 : 0xff7a2a, 0.5, 0.035, 2, true); }
    } };
  });

  // =====================================================================
  // DYNAMO: one per subscription, behind its assembler
  // =====================================================================
  IRON.machine('dynamo', function (K, M) {
    const P = palette(K), H = kit(K, P), THREE = K.THREE;
    const g = K.group();
    const ps = newStatus();
    const harness = (M.def && M.def.harness) || M.harness || '';
    const NAME = HARNESS_NAME[harness] || (harness ? String(harness).replace(/_/g, ' ').toUpperCase() : 'DYNAMO');
    // the body stands left of the assembler's back corner, clear of the dome (body frame: B, same axes as local)
    const B = K.group(g, -0.45, 0, 0.95);
    const AY = 2.45;
    // bedplate
    K.box(1.12, 0.28, 1.34, P.ironM, 0, 0.14, 0.02, B);
    K.box(1.16, 0.05, 1.38, P.brassD, 0, 0.3, 0.02, B);
    for (const [x, z] of [[-0.48, -0.58], [0.48, -0.58], [-0.48, 0.62], [0.48, 0.62]]) { K.cyl(0.05, 0.05, 0.08, P.brassL, 6, x, 0.36, z, B); }
    H.hazardBand(B, 1.0, 0.0, 0.13, 0.7, 8, false, 0.1);
    // yoke + the two copper field coils (legs)
    K.box(1.02, 0.4, 0.62, P.iron, 0, 0.52, 0, B);
    K.box(1.06, 0.05, 0.66, P.brassD, 0, 0.74, 0, B);
    const coilM = K.mat(0xffffff, { map: P.coilTex, shine: 40, spec: 0x7a4428, e: 0x000000 });
    for (const sx of [-0.34, 0.34]) {
      K.cyl(0.2, 0.2, 1.36, coilM, 12, sx, 1.48, 0, B);
      for (const y of [0.84, 2.12]) K.cyl(0.235, 0.235, 0.08, P.brass, 12, sx, y, 0, B);
      K.cyl(0.215, 0.215, 0.04, P.copperD, 12, sx, 1.48, 0, B);
    }
    // pole pieces hugging the armature
    for (const sx of [-1, 1]) {
      K.box(0.3, 0.56, 0.62, P.iron, sx * 0.42, AY, 0, B);
      K.box(0.32, 0.05, 0.64, P.brassD, sx * 0.42, AY + 0.3, 0, B);
      for (const z of [-0.22, 0.22]) K.box(0.05, 0.05, 0.05, P.brassL, sx * 0.58, AY + 0.15, z, B);
    }
    // shaft + bearing pedestals
    const sh = K.cyl(0.05, 0.05, 1.5, P.steel, 6, 0, AY, 0.12, B); sh.rotation.x = Math.PI / 2;
    for (const z of [-0.5, 0.6]) { K.box(0.18, AY - 0.3, 0.14, P.iron, 0, (AY + 0.3) / 2 - 0.05, z, B); const c = K.cyl(0.11, 0.11, 0.16, P.brassD, 10, 0, AY, z, B); c.rotation.x = Math.PI / 2; }
    // armature + commutator (spin about z)
    const arm = K.dyn(K.group(B, 0, AY, 0));
    { const core = K.cyl(0.2, 0.2, 0.64, P.ironL, 12, 0, 0, 0, arm); core.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const b = K.box(0.06, 0.05, 0.66, P.copper, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, arm); b.rotation.z = a; }
      const com = K.cyl(0.13, 0.13, 0.16, P.brass, 12, 0, 0, 0.44, arm); com.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const b = K.box(0.015, 0.03, 0.17, P.ink, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.44, arm); b.rotation.z = a; } }
    // brush gear: a brass bridge over the commutator, two carbon brushes
    K.box(0.86, 0.06, 0.08, P.brass, 0, AY + 0.36, 0.44, B);
    const BR = [[-0.1, 0.09], [0.1, 0.09]];
    for (const [x, y] of BR) { K.box(0.03, 0.22, 0.04, P.brassD, x * 1.6, AY + 0.25, 0.44, B); K.box(0.07, 0.07, 0.07, P.soot, x, AY + y + 0.05, 0.44, B); }
    for (const sx of [-1, 1]) K.tube([[sx * 0.16, AY + 0.36, 0.48], [sx * 0.55, AY + 0.1, 0.62], [sx * 0.6, 1.0, 0.5], [0.58, 0.55, -0.35]], 0.025, P.rubber, B, 16, 4);
    // flywheel / pulley on the front end (faces front-left)
    const fly = K.dyn(K.group(B, 0, AY, 0.76));
    K.torus(0.5, 0.055, P.iron, 6, 22, 0, 0, 0, fly); K.torus(0.535, 0.02, P.brassL, 4, 22, 0, 0, 0, fly);
    for (let i = 0; i < 3; i++) { const s = K.box(0.96, 0.06, 0.05, P.brass, 0, 0, 0, fly); s.rotation.z = i * Math.PI / 3; }
    K.cyl(0.1, 0.1, 0.14, P.brassD, 8, 0, 0, 0, fly).rotation.x = Math.PI / 2;
    // the level dial + nameplate high up (seen over the assembler's dome), the status lamp on top.
    // two iron posts from the bedplate carry them; the board's width runs across the camera (local (1,0,-1))
    const SC = -0.3, SU = 0.45; // board centre (SC, SC) and the posts at +-SU along its width
    const posts = [[SC + SU * C45, SC - SU * C45], [SC - SU * C45, SC + SU * C45]];
    for (const [x, z] of posts) { K.box(0.07, AY + 1.25, 0.07, P.iron, x, 0.1 + (AY + 1.25) / 2, z, B); K.box(0.12, 0.08, 0.12, P.brassD, x, 0.34, z, B); }
    const cb = H.face(B, SC, AY + 0.55, SC, Math.PI / 4); K.box(SU * 2 + 0.1, 0.06, 0.06, P.brassD, 0, 0, 0, cb); K.box(SU * 2 + 0.1, 0.06, 0.06, P.brassD, 0, 0.66, 0, cb);
    const dialN = H.gauge(B, SC + 0.06, AY + 0.88, SC + 0.06, 0.27, Math.PI / 4, true);
    const plate = H.sign(B, NAME, 0.34, SC + 0.05, AY + 1.5, SC + 0.05, Math.PI / 4, { bg: '#1c2a26', fg: '#bff8ea', edge: '#0a0806', hi: '#2e443e', glow: 0.9, frame: P.brassD });
    const lamp = K.statusLamp(B, SC + 0.05 - (plate.w / 2 + 0.12) * C45, AY + 1.32, SC + 0.05 + (plate.w / 2 + 0.12) * C45, 0.9);
    // output terminal box on the right side (conduit to the assembler's socket starts here)
    const T = OUT.dynamo[0];
    K.box(0.34, 0.38, 0.3, P.ironM, T[0] - 0.22, 0.47, T[2], g); K.box(0.36, 0.04, 0.32, P.brass, T[0] - 0.22, 0.68, T[2], g);
    const termM = K.glow(0x2cb89c); K.box(0.14, 0.08, 0.02, termM, T[0] - 0.22 + 0.08, 0.5, T[2] + 0.16, g);
    const ring = K.cyl(0.13, 0.13, 0.05, P.brass, 10, T[0] - 0.04, T[1], T[2], g); ring.rotation.z = Math.PI / 2;
    // caution post where the camera sees it (left of the dome)
    const caution = K.caution(g, -1.05, 0.1, 1.45, 0.65);
    const fieldE = new THREE.Color();

    let ang = 0, spd = 0, tSpark = 0;
    return { g, update(t, dt) {
      const st = stepStatus(M, ps, dt, NAME.toLowerCase());
      const S = st.S, blk = S === 'BLOCKED', work = S === 'WORKING';
      caution.update(t, dt, S); lamp.set(S, t);
      const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
      const target = blk ? 0 : work ? (2.5 + 9 * st.lv) * (0.4 + 0.6 * st.load) : 0;
      spd += (target - spd) * Math.min(1, dt * (blk ? 8 : 1.4));
      ang += dt * spd;
      arm.rotation.z = ang; fly.rotation.z = ang;
      // field coils warm when energised; red when blocked
      if (blk) coilM.emissive.setRGB(0.35 * strobe, 0.02, 0.0);
      else fieldE.setRGB(0.2, 0.07, 0.01).multiplyScalar(Math.min(1, spd / 8)), coilM.emissive.copy(fieldE);
      termM.color.setHex(blk ? (strobe > 0.5 ? 0xff5030 : 0x401008) : work ? (Math.sin(t * 7) > 0 ? 0x9afff0 : 0x5ae0c8) : 0x163a32);
      plate.m.emissiveIntensity = blk ? 0.4 + 0.6 * strobe : work ? 0.9 : 0.35;
      H.needle(dialN, blk ? 0 : st.lv, dt, blk, t);
      // brushes spark: hard and teal while running, sputtering red when blocked
      tSpark -= dt;
      if (tSpark <= 0) {
        tSpark = 0.05;
        const rate = blk ? 0.15 : Math.min(0.9, spd / 10);
        for (const [x, y] of BR) if (Math.random() < rate) H.sparks(B, x, AY + y, 0.5, 2, blk ? 0xff6030 : 0x9affea, blk ? 0.6 : 1);
      }
    } };
  });

  // =====================================================================
  // BATTERY: a rack of glass accumulator cells
  // =====================================================================
  IRON.machine('battery', function (K, M) {
    const P = palette(K), H = kit(K, P);
    const g = K.group();
    const ps = newStatus();
    const CB = { x: 0.32, z: 0.32 }; // rack centre (pushed forward off the wall)
    H.plinth(g, 0.7, 0.7, CB.x, CB.z, true);
    // rack frame
    const RH = 1.42;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(0.08, RH - 0.4, 0.08, P.iron, CB.x + sx * 0.62, (RH + 0.4) / 2, CB.z + sz * 0.62, g);
    for (const y of [0.52, RH]) { K.box(1.32, 0.06, 0.07, P.ironM, CB.x, y, CB.z + 0.62, g); K.box(0.07, 0.06, 1.32, P.ironM, CB.x + 0.62, y, CB.z, g); K.box(1.32, 0.06, 0.07, P.ironM, CB.x, y, CB.z - 0.62, g); K.box(0.07, 0.06, 1.32, P.ironM, CB.x - 0.62, y, CB.z, g); }
    K.box(1.2, 0.06, 1.2, P.woodD, CB.x, 0.46, CB.z, g);
    // 3x3 glass cells, lead plates, the charge glow (one group, scaled with the level)
    const glowM = K.glow(0x3ad0b0);
    const charge = K.dyn(K.group(g, 0, 0.52, 0));
    const CELLS = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const x = CB.x - 0.4 + i * 0.4, z = CB.z - 0.4 + j * 0.4;
      CELLS.push([x, z]);
      K.cyl(0.16, 0.16, 0.78, P.glass, 10, x, 0.92, z, g).castShadow = false;
      K.cyl(0.17, 0.17, 0.05, P.soot, 10, x, 1.33, z, g);
      for (const d of [-0.05, 0.05]) K.box(0.16, 0.6, 0.025, P.ironL, x, 0.86, z + d, g);
      K.cyl(0.11, 0.11, 0.72, glowM, 8, x, 0.36, z, charge).castShadow = false;
      for (const d of [-0.07, 0.07]) K.cyl(0.03, 0.03, 0.1, d < 0 ? P.brassL : P.copper, 6, x + d, 1.4, z, g);
    }
    // series straps
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const [x, z] = CELLS[i * 3 + j]; K.box(0.05, 0.03, 0.42, P.copper, x + 0.07, 1.46, z + 0.2, g); }
    for (let i = 0; i < 2; i++) { const [x, z] = CELLS[i * 3 + 2]; K.box(0.42, 0.03, 0.05, P.copper, x + 0.2, 1.46, z, g); }
    // charge meter on a post at the front corner, facing the camera
    const MX = CB.x + 0.72, MZ = CB.z + 0.72;
    K.box(0.07, 1.25, 0.07, P.iron, MX, 1.0, MZ, g);
    const dialN = H.gauge(g, MX + 0.02, 1.75, MZ + 0.02, 0.22, Math.PI / 4, true);
    const lampTop = K.statusLamp(g, CB.x - 0.62, RH + 0.03, CB.z + 0.62, 0.8);
    // output terminal on the left side
    const T = OUT.battery[0];
    K.box(0.22, 0.34, 0.34, P.ironM, T[0] + 0.12, 0.62, T[2], g); K.box(0.24, 0.04, 0.36, P.brass, T[0] + 0.12, 0.81, T[2], g);
    const ring = K.cyl(0.13, 0.13, 0.05, P.brass, 10, T[0], T[1], T[2], g); ring.rotation.z = Math.PI / 2;
    K.tube([[CELLS[0][0] - 0.07, 1.46, CELLS[0][1]], [T[0] + 0.1, 1.2, T[2] - 0.2], [T[0] + 0.12, 0.8, T[2]]], 0.025, P.rubber, g, 10, 4);
    const caution = K.caution(g, CB.x + 0.85, 0.1, CB.z - 0.55, 0.6);

    let lvShow = 0.5, tBub = 0;
    return { g, update(t, dt) {
      const st = stepStatus(M, ps, dt, 'battery');
      const S = st.S, blk = S === 'BLOCKED', work = S === 'WORKING';
      caution.update(t, dt, S); lampTop.set(S, t);
      const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
      lvShow += ((blk ? Math.max(0.15, st.lv) : st.lv) - lvShow) * Math.min(1, dt * 2);
      charge.scale.y = Math.max(0.03, lvShow);
      const pulse = 0.82 + 0.18 * Math.sin(t * 3);
      if (blk) glowM.color.setRGB(0.6 * strobe + 0.1, 0.08, 0.04);
      else if (work) glowM.color.setRGB(0.14 * pulse, (0.45 + 0.4 * lvShow) * pulse, (0.4 + 0.3 * lvShow) * pulse);
      else glowM.color.setRGB(0.04, 0.14, 0.12);
      H.needle(dialN, blk ? 0 : lvShow, dt, blk, t);
      // bubbles rise in the cells while it's live
      tBub -= dt;
      if (tBub <= 0) { tBub = 0.12; if (work && Math.random() < 0.7) { const [x, z] = CELLS[Math.floor(Math.random() * CELLS.length)]; K.spawn(g, x + K.R() * 0.12, 0.6, z + K.R() * 0.12, 0, 0.35 + Math.random() * 0.2, 0, 0x9affea, Math.max(0.3, lvShow * 1.4), 0.03, 0, true); } }
    } };
  });

  // =====================================================================
  // GEOTHERMAL: your own computer, drawing lava heat up from deep below the quarry floor
  // =====================================================================
  IRON.machine('geothermal', function (K, M) {
    const P = palette(K), H = kit(K, P);
    const g = K.group();
    const ps = newStatus();
    H.plinth(g, 1.35, 1.35);
    // the well: a stone collar round a grated bore glowing with lava heat
    const W = { x: 0.32, z: 0.32 };
    K.cyl(0.66, 0.72, 0.3, P.stone, 14, W.x, 0.55, W.z, g);
    K.cyl(0.7, 0.7, 0.06, P.brassD, 14, W.x, 0.71, W.z, g);
    H.rivetRing(g, W.x, W.z, 0.71, 0.62, 14, P.brassL, true);
    const lavaM = K.glow(0xff6a1a);
    K.cyl(0.5, 0.5, 0.04, lavaM, 14, W.x, 0.5, W.z, g).castShadow = false;
    const hazeM = K.glow(0xff8a3a, 0.2, true);
    const haze = K.cyl(0.42, 0.52, 0.5, hazeM, 12, W.x, 0.98, W.z, g); haze.castShadow = false;
    for (let i = 0; i < 5; i++) K.box(1.0, 0.05, 0.06, P.iron, W.x, 0.74, W.z - 0.36 + i * 0.18, g);
    K.box(0.06, 0.05, 1.0, P.iron, W.x, 0.75, W.z, g);
    // the casing pipe up out of the well, valve wheel, then over to the heat exchanger
    const hotM = K.mat(0x8a4a2a, { shine: 30, spec: 0x6a3a20, e: 0x000000 });
    K.cyl(0.13, 0.13, 1.2, hotM, 10, W.x - 0.25, 1.3, W.z - 0.25, g);
    for (const y of [0.85, 1.55]) K.cyl(0.18, 0.18, 0.06, P.brass, 10, W.x - 0.25, y, W.z - 0.25, g);
    const vw = H.face(g, W.x - 0.25, 1.32, W.z - 0.25 + 0.2, 0);
    K.torus(0.16, 0.03, P.valve, 4, 12, 0, 0, 0.05, vw); for (let k = 0; k < 3; k++) { const s = K.box(0.3, 0.025, 0.025, P.valve, 0, 0, 0.05, vw); s.rotation.z = k * Math.PI / 3; }
    K.tube([[W.x - 0.25, 1.88, W.z - 0.25], [W.x - 0.3, 2.3, W.z - 0.4], [-0.25, 2.45, -0.6], [-0.45, 2.3, -0.62]], 0.11, hotM, g, 14, 8);
    // heat exchanger: dark tank with a copper coil that glows hot at the bottom, aether teal at the top
    const X = { x: -0.5, z: -0.5 };
    K.cyl(0.46, 0.48, 1.85, P.iron, 14, X.x, 0.4 + 0.925, X.z, g);
    for (const y of [0.55, 1.35, 2.15]) H.band(g, X.x, X.z, 0.49, y, P.brassD, 0.08);
    K.lathe([[0.48, 0], [0.42, 0.18], [0.24, 0.32], [0.0, 0.36]], P.copperD, 14, X.x, 2.25, X.z, g);
    const coilHotM = K.glow(0xff6a20), coilCoolM = K.glow(0x3ad0b0);
    const helix = (y0, y1, turns, m) => { const pts = []; const n = Math.round(turns * 12); for (let i = 0; i <= n; i++) { const a = i / 12 * Math.PI * 2; pts.push([X.x + Math.cos(a) * 0.56, y0 + (y1 - y0) * i / n, X.z + Math.sin(a) * 0.56]); } return K.tube(pts, 0.045, m, g, n * 2, 5); };
    helix(0.62, 1.32, 2.5, coilHotM); helix(1.38, 2.05, 2.5, coilCoolM);
    const vent = { x: X.x + 0.15, z: X.z + 0.1 };
    K.cyl(0.06, 0.06, 0.7, P.soot, 8, vent.x, 2.8, vent.z, g); K.cyl(0.1, 0.07, 0.1, P.brassD, 8, vent.x, 3.18, vent.z, g);
    const dialN = H.gauge(g, X.x + Math.sin(Math.PI / 4) * 0.5, 1.75, X.z + Math.cos(Math.PI / 4) * 0.5, 0.22, Math.PI / 4, true);
    // turbine (spins about local x) + generator, output flange at OUT.geothermal[0]
    const TB = { x: 0.62, y: 0.95, z: -0.62 };
    const hous = K.cyl(0.42, 0.42, 0.22, P.ironM, 16, TB.x + 0.18, TB.y, TB.z, g); hous.rotation.z = Math.PI / 2;
    K.torus(0.42, 0.04, P.brass, 4, 18, TB.x + 0.3, TB.y, TB.z, g).rotation.y = Math.PI / 2;
    const rot = K.dyn(K.group(g, TB.x + 0.31, TB.y, TB.z));
    { const w = K.group(rot); w.rotation.y = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const b = K.box(0.06, 0.34, 0.03, P.brass, 0, 0.18, 0, K.group(w)); b.parent.rotation.z = i * Math.PI / 4; b.rotation.y = 0.5; }
      K.cyl(0.08, 0.08, 0.08, P.brassL, 8, 0, 0, 0, w).rotation.x = Math.PI / 2; }
    K.box(0.5, 0.5, 0.5, P.iron, TB.x - 0.2, 0.62, TB.z, g);
    K.tube([[-0.45, 1.0, -0.15], [0.0, 1.0, -0.4], [TB.x - 0.05, TB.y, TB.z]], 0.07, P.copper, g, 10, 6);
    // nameplate + caution + lamp
    const plate = H.sign(g, 'YOUR COMPUTER', 0.28, -0.42, 0.95, 1.12, Math.PI / 4, { bg: '#1c2a26', fg: '#bff8ea', edge: '#0a0806', hi: '#2e443e', glow: 0.9 });
    for (const s of [-1, 1]) K.box(0.05, 0.55, 0.05, P.iron, -0.42 + s * plate.w * 0.4 * C45, 0.6, 1.12 - s * plate.w * 0.4 * C45 - 0.04, g);
    const caution = K.caution(g, 1.1, 0.4, 0.55, 0.7);
    const lamp = K.statusLamp(g, -1.05, 0.4, -0.2, 1.0);

    let ang = 0, spd = 0, heat = 0.5, tEmb = 0, tVent = 0;
    return { g, update(t, dt) {
      const st = stepStatus(M, ps, dt, 'local');
      const S = st.S, blk = S === 'BLOCKED', work = S === 'WORKING';
      caution.update(t, dt, S); lamp.set(S, t);
      const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
      heat += ((work ? 0.55 + 0.45 * st.lv : blk ? 0.5 : 0.18) - heat) * Math.min(1, dt * 1.5);
      const fl = 0.85 + 0.1 * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 13);
      if (blk) lavaM.color.setRGB(0.5 + 0.45 * strobe, 0.08, 0.03); else lavaM.color.setRGB(lerpC(0.35, 1, heat) * fl, lerpC(0.08, 0.45, heat) * fl, 0.06 * fl);
      hazeM.opacity = blk ? 0.08 + 0.12 * strobe : 0.06 + 0.18 * heat * fl;
      hotM.emissive.setRGB(0.25 * heat, 0.05 * heat, 0.0);
      coilHotM.color.setRGB(lerpC(0.25, 1, heat) * fl, lerpC(0.06, 0.4, heat) * fl, 0.04);
      coilCoolM.color.setHex(blk ? (strobe > 0.5 ? 0xff5030 : 0x401008) : work ? (Math.sin(t * 6) > 0 ? 0x7af0d8 : 0x3ad0b0) : 0x16443a);
      plate.m.emissiveIntensity = blk ? 0.4 + 0.6 * strobe : work ? 0.9 : 0.35;
      const target = blk ? 0 : work ? (3 + 8 * st.lv) * (0.5 + 0.5 * st.load) : 0.4;
      spd += (target - spd) * Math.min(1, dt * (blk ? 6 : 1.2));
      ang += dt * spd; rot.rotation.x = ang;
      H.needle(dialN, blk ? 0 : st.lv, dt, blk, t);
      // embers rise out of the bore; the vent breathes steam
      tEmb -= dt;
      if (tEmb <= 0) { tEmb = 0.08; if (Math.random() < 0.35 + heat * 0.5) K.spawn(g, W.x + K.R() * 0.6, 0.6, W.z + K.R() * 0.6, K.R() * 0.3, 0.6 + Math.random() * 0.9, K.R() * 0.3, Math.random() < 0.5 ? 0xff8a3a : 0xffc060, 1.2, 0.04, -0.2, true); }
      tVent -= dt;
      if (tVent <= 0) { tVent = blk ? 0.05 : 0.25; if (blk || Math.random() < 0.5) K.spawn(g, vent.x + K.R() * 0.05, 3.25, vent.z + K.R() * 0.05, K.R() * 0.3, blk ? 2.8 : 1.0, K.R() * 0.3, blk ? 0xd4ccbc : 0xb8b0a2, blk ? 1.8 : 2.2, blk ? 0.18 : 0.14, -0.15); }
    } };
  });
  const lerpC = (a, b, k) => a + (b - a) * k;

  // =====================================================================
  // POWER LINES: aether conduits from each plant to the back corner of the machines it feeds
  // =====================================================================
  IRON.part('power', function (K, root, ctx) {
    const P = palette(K), H = kit(K, P), THREE = K.THREE;
    const V3 = THREE.Vector3;
    const toRoot = (st, p) => ctx.toRootAt(st, p[0], p[1], p[2]);
    const byId = {}; ctx.stations.forEach((s) => (byId[s.id] = s));
    const plants = ctx.stations.filter((s) => s.power || ['steam', 'dynamo', 'battery', 'geothermal'].includes(s.type));
    const tiers = ctx.tiers || {};
    const deckTop = (y) => { // the deck top a conduit at height y rests over
      let best = null;
      for (const k in tiers) { const T = tiers[k]; const top = T.y + 0.1; if (top <= y + 0.05 && (best === null || top > best)) best = top; }
      return best === null ? y - 0.2 : best;
    };
    const lines = [], sockets = {};

    // ---- the socket at a machine's back corner (one per machine; every plant's line ends in it)
    function socketFor(c) {
      if (sockets[c.id]) return sockets[c.id];
      const S = toRoot(c, [-2.62, 0, -2.62]);
      const y0 = c.y + 0.1;
      const eyeM = K.glow(0x2cb89c);
      const sg = K.group(root);
      K.box(0.62, 0.42, 0.44, P.ironM, S[0], y0 + 0.21, S[2], sg);
      K.box(0.68, 0.06, 0.5, P.brass, S[0], y0 + 0.45, S[2], sg);
      for (const sx of [-0.27, 0.27]) K.box(0.06, 0.06, 0.06, P.brassL, S[0] + sx, y0 + 0.36, S[2] + 0.23, sg);
      K.cyl(0.11, 0.11, 0.05, eyeM, 10, S[0], y0 + 0.49, S[2], sg).castShadow = false;
      // the plug: a brass collar from the socket into the machine's back corner
      const plug = K.cyl(0.1, 0.1, 0.5, P.brass, 10, S[0], y0 + Y_RUN, S[2] + 0.4, sg); plug.rotation.x = Math.PI / 2;
      const col = K.cyl(0.15, 0.15, 0.06, P.brassD, 10, S[0], y0 + Y_RUN, S[2] + 0.26, sg); col.rotation.x = Math.PI / 2;
      return (sockets[c.id] = { S, y0, eyeM, c, lines: [] });
    }

    // ---- a conduit: teal core in a glass sheath, brass rings and copper coil bands, saddles / wall brackets, ball joints
    const Yax = new V3(0, 1, 0), Zax = new V3(0, 0, 1);
    function conduit(pts, coreM, opts) {
      opts = opts || {};
      const a = new V3(), b = new V3(), dir = new V3(), mid = new V3(), p = new V3();
      for (let i = 0; i < pts.length - 1; i++) {
        a.fromArray(pts[i]); b.fromArray(pts[i + 1]);
        const len = a.distanceTo(b); if (len < 0.01) continue;
        dir.copy(b).sub(a).normalize(); mid.copy(a).add(b).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(Yax, dir), qr = new THREE.Quaternion().setFromUnitVectors(Zax, dir);
        const core = K.cyl(0.085, 0.085, len + 0.05, coreM, 8, mid.x, mid.y, mid.z, root); core.quaternion.copy(q); core.castShadow = false;
        const sh = K.cyl(0.118, 0.118, Math.max(0.04, len - 0.14), P.glassC, 8, mid.x, mid.y, mid.z, root); sh.quaternion.copy(q); sh.castShadow = false;
        for (let d = 0.35; d < len - 0.2; d += 0.7) {
          p.copy(a).addScaledVector(dir, d);
          if (Math.round(d / 0.7) % 3 === 1) for (let k = -2; k <= 2; k++) { const c = K.torus(0.13, 0.024, P.copper, 4, 10, 0, 0, 0, root); c.position.copy(p).addScaledVector(dir, k * 0.055); c.quaternion.copy(qr); }
          else { const c = K.torus(0.135, 0.04, P.brass, 4, 10, 0, 0, 0, root); c.position.copy(p); c.quaternion.copy(qr); }
        }
        const vertical = Math.abs(dir.y) > 0.9;
        if (!vertical && Math.abs(dir.y) < 0.3) {
          // saddles down to the deck
          for (let d = 0.6; d < len - 0.3; d += 1.4) {
            p.copy(a).addScaledVector(dir, d);
            const top = deckTop(p.y), h = p.y - 0.1 - top;
            if (h > 0.04) { K.box(0.2, h, 0.22, P.ironM, p.x, top + h / 2, p.z, root); K.box(0.26, 0.05, 0.28, P.iron, p.x, top + 0.025, p.z, root); }
          }
        } else if (vertical && opts.wall) {
          // brackets back to the wall / cliff behind the riser
          for (let d = 0.5; d < len - 0.2; d += 1.3) {
            p.copy(a).addScaledVector(dir, d);
            const ring = K.torus(0.14, 0.035, P.iron, 4, 10, p.x, p.y, p.z, root); ring.rotation.x = Math.PI / 2;
            const w = opts.wall(p);
            if (w) { const L = Math.abs(w.z - p.z) + Math.abs(w.x - p.x); K.box(Math.abs(w.x - p.x) > 0.01 ? L : 0.07, 0.07, Math.abs(w.z - p.z) > 0.01 ? L : 0.07, P.iron, (p.x + w.x) / 2, p.y, (p.z + w.z) / 2, root); K.box(0.2, 0.2, 0.04, P.ironM, w.x, p.y, w.z, root); }
          }
        }
        if (i > 0) K.sph(0.15, P.brassD, a.x, a.y, a.z, root, 8, 6);
      }
      // flanges at both ends
      for (const [pi, pj] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
        a.fromArray(pts[pi]); b.fromArray(pts[pj]); dir.copy(a).sub(b).normalize();
        const f = K.cyl(0.16, 0.16, 0.06, P.brass, 10, a.x, a.y, a.z, root); f.quaternion.setFromUnitVectors(Yax, dir);
      }
    }

    // ---- routing: out of the plant, a 45deg run, then straight along the socket's z into its side
    function route(plant, c) {
      const outs = (OUT[plant.type] || [[0, 0.5, 0]]).map((p) => toRoot(plant, p));
      const T = outs[outs.length - 1];
      const sk = socketFor(c);
      const S = sk.S, y = sk.y0 + Y_RUN;
      const pts = outs.slice();
      if (plant.type === 'geothermal') return geoRoute(pts, sk);
      const side = T[0] < S[0] ? -1 : 1;
      const px = S[0] + side * 0.42, pz = S[2];
      if (Math.abs(T[1] - y) > 0.05) { pts.push([T[0], y, T[2]]); }
      const dz = pz - T[2], dx = px - T[0];
      if (Math.abs(dz) > 0.02) {
        const k = Math.min(Math.abs(dz), Math.max(0, Math.abs(dx) - 0.15));
        pts.push([T[0] + Math.sign(dx) * k, y, T[2] + Math.sign(dz) * k]);
        if (k < Math.abs(dz) - 0.02) pts.push([T[0] + Math.sign(dx) * k, y, pz]);
      }
      pts.push([px, y, pz]);
      return pts;
    }
    // geothermal: along the quarry floor to the cliff's right edge, up the face, over the deck's corner, then
    // to the LOCAL box; to feed a machine: along the deck's right edge, up the riser wall, along it and down
    const GX = 18.8, GZ = 7.78, WALLZ = ((tiers.checks && tiers.checks.z1) || -4.5) + 0.22;
    let localBox = null;
    function geoHead(pts) {
      const T = pts[pts.length - 1];
      const yb = (tiers.build ? tiers.build.y : 0) + 0.1 + Y_RUN;
      pts.push([GX, T[1], T[2]], [GX, T[1], GZ], [GX, yb, GZ], [GX - 0.4, yb, GZ - 0.4], [GX - 0.4, yb, 6.35]);
      return yb;
    }
    function geoRoute(pts, sk) {
      const yb = geoHead(pts);
      const S = sk.S, y = sk.y0 + Y_RUN, yw = (tiers.build ? tiers.build.y : 0) + 5.6;
      pts.push([GX - 0.4, yb, WALLZ + 0.1], [GX - 0.4, yw, WALLZ], [S[0] + 0.0, yw, WALLZ], [S[0], y, WALLZ], [S[0], y, S[2] - 0.32]);
      return pts;
    }
    function buildLocalBox() {
      if (localBox) return localBox;
      const yb = (tiers.build ? tiers.build.y : 0) + 0.1;
      const bx = GX - 0.85, bz = 5.9;
      const lg = K.group(root);
      K.box(0.72, 0.9, 0.5, P.ironM, bx, yb + 0.45, bz, lg); K.box(0.78, 0.06, 0.56, P.brass, bx, yb + 0.92, bz, lg);
      K.box(0.62, 0.08, 0.06, P.brassD, bx, yb + 0.05, bz + 0.26, lg);
      const eyeM = K.glow(0x2cb89c); K.cyl(0.1, 0.1, 0.05, eyeM, 10, bx + 0.2, yb + 0.96, bz, lg).castShadow = false;
      H.sign(lg, 'LOCAL', 0.22, bx, yb + 0.64, bz + 0.27, 0, { bg: '#1c2a26', fg: '#bff8ea', edge: '#0a0806', hi: '#2e443e', glow: 0.8 });
      const needle = H.gauge(lg, bx, yb + 0.3, bz + 0.26, 0.12, 0, true);
      localBox = { eyeM, needle, p: [bx + 0.36, yb + Y_RUN, bz] };
      return localBox;
    }

    plants.forEach((pl) => {
      const feeds = ((pl.def && pl.def.feeds) || []).map((id) => byId[id]).filter(Boolean);
      const add = (pts, c) => {
        const coreM = K.glow(0x248a74);
        conduit(pts, coreM, { wall: (p) => (p.z > 6.5 ? { x: p.x, z: GZ - 0.28 } : p.z < -3.5 ? { x: p.x, z: WALLZ - 0.22 } : null) });
        const pv = pts.map((q) => new V3(q[0], q[1], q[2]));
        const cum = [0]; for (let i = 1; i < pv.length; i++) cum.push(cum[i - 1] + pv[i].distanceTo(pv[i - 1]));
        const L = cum[cum.length - 1];
        const ln = { plant: pl, c, pv, cum, L, coreM, n: Math.max(2, Math.round(L / 1.5)), off: Math.random() * L };
        lines.push(ln);
        if (c && sockets[c.id]) sockets[c.id].lines.push(ln);
        return ln;
      };
      if (pl.type === 'geothermal') {
        const outs = (OUT.geothermal).map((p) => toRoot(pl, p));
        const box = buildLocalBox();
        if (!feeds.length) { const pts = outs.slice(); geoHead(pts); pts.push(box.p); add(pts, null); }
        feeds.forEach((c) => add(route(pl, c), c));
        return;
      }
      feeds.forEach((c) => add(route(pl, c), c));
    });

    // ---- pulses: one instanced mesh (a bright bead) + one for the soft halo round each
    let total = 0; lines.forEach((l) => (total += l.n));
    const beadM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const haloM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const mk = (geo, m) => { const im = new THREE.InstancedMesh(geo, m, Math.max(1, total)); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, total) * 3), 3); im.frustumCulled = false; im.castShadow = im.receiveShadow = false; im.count = total; K.dyn(im); root.add(im); return im; };
    const beads = mk(new THREE.SphereGeometry(0.11, 6, 4), beadM), halos = mk(new THREE.SphereGeometry(0.26, 8, 6), haloM);
    const mtx = new THREE.Matrix4(), qI = new THREE.Quaternion(), sc = new V3(), pos = new V3(), col = new THREE.Color();
    function at(ln, s, out) {
      s = ((s % ln.L) + ln.L) % ln.L;
      let i = 1; while (i < ln.cum.length - 1 && ln.cum[i] < s) i++;
      const k = (s - ln.cum[i - 1]) / Math.max(1e-6, ln.cum[i] - ln.cum[i - 1]);
      return out.copy(ln.pv[i - 1]).lerp(ln.pv[i], k);
    }
    const stateOf = (id) => { const s = I.stations[id]; return !s ? 'IDLE' : s.blocked ? 'BLOCKED' : s.state; };

    return { update(t, dt) {
      let j = 0;
      for (const ln of lines) {
        const ps = statusOf(ln.plant.id, dt) || { S: 'IDLE', lv: 0, online: true, load: 0 };
        const S = ps.S, off = !ps.online, blk = S === 'BLOCKED', work = S === 'WORKING';
        const cs = ln.c ? stateOf(ln.c.id) : 'IDLE';
        const sp = blk ? (Math.sin(t * 5 + ln.L) > 0 ? 0.7 : 0.05) : work ? (0.9 + 2.6 * ps.lv) * (cs === 'WORKING' ? 1 : 0.55) : 0.22;
        ln.off = (ln.off + dt * sp) % ln.L;
        // core: bright teal with the level, dim idle, amber/red blink when blocked, near dark when offline
        if (off) ln.coreM.color.setRGB(Math.sin(t * 7 + ln.L) > 0.6 ? 0.35 : 0.12, 0.03, 0.02);
        else if (blk) ln.coreM.color.setHex(Math.sin(t * 6) > 0 ? 0x9a6a10 : 0x4a3008);
        else if (work) ln.coreM.color.setRGB(0.1 + 0.12 * ps.lv, 0.42 + 0.4 * ps.lv, 0.36 + 0.32 * ps.lv);
        else ln.coreM.color.setRGB(0.05, 0.2, 0.17);
        for (let i = 0; i < ln.n; i++) {
          const s = (ln.off + i * ln.L / ln.n) % ln.L;
          at(ln, s, pos);
          const arrive = work ? K.clamp01((s / ln.L - 0.82) / 0.18) : 0;
          const tw = 0.85 + Math.sin(t * 10 + i * 2.1) * 0.15;
          let r, gg, b, size;
          if (off) { const f = Math.sin(t * 9 + i) > 0.7 ? 0.5 : 0.1; r = f; gg = f * 0.12; b = f * 0.08; size = 0.7; }
          else if (blk) { const f = Math.sin(t * 5 + i * 0.7) > 0 ? 0.9 : 0.25; r = f; gg = f * 0.62; b = f * 0.12; size = 0.85; }
          else if (work) { const f = (0.45 + 0.55 * ps.lv) * tw; r = f * (0.55 + 0.45 * arrive); gg = f; b = f * (0.88 + 0.12 * arrive); size = (0.8 + 0.25 * ps.lv) * (1 + arrive * 0.9); }
          else { r = 0.05; gg = 0.22; b = 0.18; size = 0.6; }
          mtx.compose(pos, qI, sc.set(size, size, size));
          beads.setMatrixAt(j, mtx); halos.setMatrixAt(j, mtx);
          beads.setColorAt(j, col.setRGB(r, gg, b)); halos.setColorAt(j, col.setRGB(r * 0.5, gg * 0.5, b * 0.5));
          j++;
        }
      }
      if (j) { beads.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true; beads.instanceColor.needsUpdate = halos.instanceColor.needsUpdate = true; }
      // socket eyes show the best state among the plants feeding that machine
      for (const id in sockets) {
        const sk = sockets[id];
        let best = 0;
        for (const ln of sk.lines) { const ps = statusOf(ln.plant.id, 0); if (!ps) continue; best = Math.max(best, ps.S === 'WORKING' ? 3 : ps.S === 'IDLE' ? 1 : 2); }
        sk.eyeM.color.setHex(best === 3 ? (Math.sin(t * 4) > 0 ? 0x9affea : 0x5ae0c8) : best === 2 ? (Math.sin(t * 8) > 0 ? 0xffb030 : 0x5a2a08) : 0x163a32);
      }
      if (localBox) {
        const geo = plants.find((p) => p.type === 'geothermal');
        const ps = geo && statusOf(geo.id, 0);
        localBox.eyeM.color.setHex(!ps ? 0x163a32 : ps.S === 'WORKING' ? (Math.sin(t * 3) > 0 ? 0x9affea : 0x5ae0c8) : ps.S === 'BLOCKED' ? (Math.sin(t * 8) > 0 ? 0xff5030 : 0x401008) : 0x163a32);
        H.needle(localBox.needle, ps && ps.S !== 'BLOCKED' ? ps.lv : 0, dt, ps && ps.S === 'BLOCKED', t);
      }
      // a few sparks off the beads
      if (lines.length && Math.random() < dt * 3) { const ln = lines[Math.floor(Math.random() * lines.length)]; const ps = statusOf(ln.plant.id, 0); if (ps && ps.S === 'WORKING') { at(ln, ln.off, pos); K.spawn(root, pos.x, pos.y, pos.z, K.R() * 1.4, Math.random() * 1.2, K.R() * 1.4, Math.random() < 0.5 ? 0x9affea : 0xffffff, 0.3, 0.04, 2, true); } }
    } };
  });
}
