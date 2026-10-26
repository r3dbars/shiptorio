// =====================================================================
// LAUNCH PAD (Black Iron line) — LAUNCH agent, round 2
// Every green 'pass' capsule: the jib crane plucks it off the intake tray, swings it (cable swaying)
// to the rocket's cargo hatch and feeds it in; the hatch seals with spinning bolts; tesla coils arc into
// the hull (fed from the aether transformer on the conduit socket); the clock tower + 4-tube nixie board
// counts t-03..t-01 (merge decision point: holds at T-0 with 'HOLD'); ignition: umbilicals pop, clamps
// fly back with sparks, smoke billows out of both trench ends, the rocket hangs and grinds upward for
// ~1.5 s before it accelerates, leaving a bright trail + lingering smoke column; M.consume() fires high
// up and a signal flare bursts over the pad; a 3-tube shipped counter ticks on the clock tower base.
// Then the scorched pedestal drops into the silo and a fresh rocket rises on it.
// IDLE = lights down. WORKING = lit + busy. BLOCKED = red flood strobes, venting, 'HOLD', red clock.
// A stall never freezes a lit rocket: ignition/flight finish, the pad holds before the reset.
// =====================================================================
(function () {
  'use strict';
  IRON.machine('launch', function (K, M) {
    const T = K.THREE;
    const C45 = Math.SQRT1_2;
    // ---------- palette (Black Iron, lifted ~30%) ----------
    const C = { soot: 0x1e1915, iron: 0x3c342d, ironM: 0x302924, ironL: 0x5e544a, brass: 0xb08838, brassD: 0x6e5022, brassL: 0xdcb060, copper: 0xa65a32, copperD: 0x6e3820, oxide: 0x7a3020, oxideD: 0x52201a, hazard: 0xe0a422, cream: 0xe6d6a8 };
    const MT = {
      soot: K.mat(C.soot), iron: K.mat(C.iron, { shine: 24, spec: 0x2a2a30 }), ironM: K.mat(C.ironM, { shine: 16, spec: 0x222228 }), ironL: K.mat(C.ironL, { shine: 30, spec: 0x3a3a40 }),
      brass: K.mat(C.brass, { shine: 40, spec: 0x806030 }), brassD: K.mat(C.brassD, { shine: 22, spec: 0x3a2a10 }), brassL: K.mat(C.brassL, { shine: 55, spec: 0xa08048 }),
      copper: K.mat(C.copper, { shine: 36, spec: 0x704028 }), copperD: K.mat(C.copperD, { shine: 18, spec: 0x3a1a0a }),
      oxide: K.mat(C.oxide, { shine: 14, spec: 0x2a1410 }), oxideD: K.mat(C.oxideD), hazard: K.mat(C.hazard), cream: K.mat(C.cream),
      rubber: K.mat(0x17130f), insul: K.mat(0x3a2418, { shine: 40, spec: 0x553322 }), rust: K.mat(0x7a3a1a),
      grime: K.mat(0x080605, { op: 0.45, depthWrite: false }), glass: K.mat(0xbfe8dc, { op: 0.25, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      dark: K.mat(0x0c0a08), scorch: K.mat(0x14100c, { op: 0.6, depthWrite: false })
    };
    function stoneTex() {
      return K.canvasTex(64, 64, (g) => {
        let s = 13; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
        g.fillStyle = '#3a3027'; g.fillRect(0, 0, 64, 64);
        const tones = ['#7e6e5a', '#74644f', '#887660', '#6c5c48'];
        for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
          g.fillStyle = tones[Math.floor(r() * 4)]; g.fillRect(x + 1, y + 1, 22, 14);
          g.fillStyle = 'rgba(255,230,190,0.10)'; g.fillRect(x + 2, y + 1, 20, 2);
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 13, 22, 2);
        }
        for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(10,6,4,0.35)'; g.fillRect(r() * 60, r() * 60, 4 + r() * 8, 2 + r() * 4); }
      }, [4, 0.6]);
    }
    function deckTex() {
      return K.canvasTex(64, 64, (g) => {
        let s = 5; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
        g.fillStyle = '#26201b'; g.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
          const v = 70 + Math.floor(r() * 18); g.fillStyle = `rgb(${v},${v - 8},${v - 16})`; g.fillRect(x + 1, y + 1, 14, 14);
          g.fillStyle = 'rgba(255,230,200,0.10)'; g.fillRect(x + 1, y + 1, 14, 1);
          g.fillStyle = '#a08458'; g.fillRect(x + 2, y + 2, 1, 1); g.fillRect(x + 13, y + 2, 1, 1); g.fillRect(x + 2, y + 13, 1, 1); g.fillRect(x + 13, y + 13, 1, 1);
        }
        for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(8,5,3,0.4)'; g.fillRect(r() * 60, r() * 60, 3 + r() * 9, 2 + r() * 5); }
      }, [3, 3]);
    }
    // ---------- helpers ----------
    function band(p, r, y, m, h) { return K.cyl(r, r, h || 0.1, m || MT.brass, 18, 0, y, 0, p); }
    function rivetRing(p, r, y, n, m) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, m || MT.brassL, Math.cos(a) * r, y, Math.sin(a) * r, p); } }
    function gear(p, r, thick, teeth, m, x, y, z) {
      const gg = K.group(p, x, y, z);
      K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, gg);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
      K.cyl(r * 0.3, r * 0.3, thick * 1.6, MT.ironM, 8, 0, 0, 0, gg);
      return gg;
    }
    function gauge(p, x, y, z, r, ry) {
      const gg = K.group(p, x, y, z); gg.rotation.y = ry || 0;
      const rim = K.cyl(r * 1.15, r * 1.15, 0.08, MT.brass, 14, 0, 0, 0, gg); rim.rotation.x = Math.PI / 2;
      const face = K.cyl(r, r, 0.1, MT.cream, 14, 0, 0, 0.01, gg); face.rotation.x = Math.PI / 2;
      const red = K.box(r * 0.5, r * 0.18, 0.02, K.mat(0xc0301a), r * 0.45, r * 0.45, 0.065, gg); red.rotation.z = -0.8;
      const piv = K.group(gg, 0, 0, 0.07);
      K.box(0.035, r * 0.85, 0.02, K.mat(0x140c06), 0, r * 0.38, 0, piv);
      return piv;
    }
    function hazardStripe(p, len, x, y, z, n, ry, h) {
      const gg = K.group(p, x, y, z); gg.rotation.y = ry || 0; const w = len / n;
      for (let i = 0; i < n; i++) K.box(w * 0.96, h || 0.06, 0.05, i % 2 ? MT.soot : MT.hazard, -len / 2 + w * (i + 0.5), 0, 0, gg);
      return gg;
    }
    const ease = (k) => k * k * (3 - 2 * k);
    // clustered small puffs (reads as smoke, not honeycomb tiles)
    function puff(x, y, z, vx, vy, vz, col, life, size, n, spread, grav) {
      for (let i = 0; i < (n || 3); i++) K.spawn(g, x + K.R() * (spread || 0.25), y + K.R() * (spread || 0.25) * 0.6, z + K.R() * (spread || 0.25), vx + K.R() * 0.35, vy + K.R() * 0.3, vz + K.R() * 0.35, col, life * (0.8 + Math.random() * 0.4), size * (0.7 + Math.random() * 0.5), grav === undefined ? -0.1 : grav);
    }

    const g = K.group();
    const S = K.group(g); // static: baked at the end

    // =====================================================================
    // LAYOUT (local): rocket on the silo at the origin. Trench runs screen-horizontal (local x+z = 0).
    // =====================================================================
    const HOLE = 1.18;
    const PIVOT = [-0.6, 2.1];
    const TRAY = [-0.6, 2.9];        // = launch.in port
    const COILS = [[-1.9, 0.6], [1.9, -0.6]];
    const GANTRY = [-1.5, -1.5];
    const CLOCK = [1.25, -2.35];
    const TANK = [-0.15, -2.2];
    const XFMR = [-3.12, 0.35];      // conduit socket flange at local [-3.6, 0.35, 0.35]
    const BASE_Y = 0.8;
    const pvLen = Math.hypot(PIVOT[0], PIVOT[1]);
    const HD = [PIVOT[0] / pvLen, PIVOT[1] / pvLen];
    const THETA = Math.atan2(HD[0], HD[1]);
    const HATCH_Y = 1.75, CARGO_OUT = 0.95, CARGO_IN = 0.16;

    // ---------- PAD ----------
    const stone = K.mat(0xffffff, { map: stoneTex(), double: true });
    K.lathe([[HOLE, -1.3], [HOLE, 0.36], [2.42, 0.36], [2.56, 0.3], [2.72, 0.02], [2.72, -0.05]], stone, 8, 0, 0, 0, S).rotation.y = Math.PI / 8;
    const deck = K.mat(0xffffff, { map: deckTex(), double: true });
    K.lathe([[HOLE + 0.02, 0.36], [HOLE + 0.02, 0.47], [2.28, 0.47], [2.32, 0.36]], deck, 8, 0, 0, 0, S).rotation.y = Math.PI / 8;
    K.torus(HOLE + 0.06, 0.07, MT.brassD, 4, 24, 0, 0.48, 0, S).rotation.x = Math.PI / 2;
    K.torus(2.3, 0.06, MT.ironL, 4, 8, 0, 0.47, 0, S).rotation.set(Math.PI / 2, 0, Math.PI / 8);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; K.box(0.28, 0.05, 0.12, i % 2 ? MT.soot : MT.hazard, Math.cos(a) * 2.12, 0.49, Math.sin(a) * 2.12, S).rotation.y = -a; }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.06, 0.06, 0.06, MT.brassL, Math.cos(a) * 2.38, 0.5, Math.sin(a) * 2.38, S); }
    const voidDisk = K.cyl(HOLE - 0.02, HOLE - 0.02, 0.02, K.glow(0x050302), 24, 0, 0.13, 0, g); voidDisk.visible = false;
    const voidGlow = K.torus(HOLE - 0.1, 0.05, K.glow(0xff6a20, 0.6, true), 4, 24, 0, 0.16, 0, g); voidGlow.rotation.x = Math.PI / 2; voidGlow.visible = false;
    // FLAME TRENCH along local (1,0,-1)
    const TR = K.group(S); TR.rotation.y = Math.PI / 4;
    const TRd = K.group(g); TRd.rotation.y = Math.PI / 4;            // dynamic: residual heat glow
    const heatMs = [];
    for (const sgn of [-1, 1]) {
      const cx = sgn * (HOLE + 2.6) / 2, len = 2.62 - HOLE + 0.2;
      K.box(len, 0.06, 0.82, MT.dark, cx, 0.46, 0, TR);
      for (let i = 0; i < 7; i++) K.box(0.06, 0.05, 0.8, MT.ironL, sgn * (HOLE + 0.15 + i * 0.2), 0.5, 0, TR);
      K.box(len, 0.03, 0.06, MT.ironL, cx, 0.5, 0.0, TR);
      for (const zz of [-0.47, 0.47]) { K.box(len, 0.16, 0.1, MT.rust, cx, 0.53, zz, TR); K.box(len, 0.04, 0.12, MT.brassD, cx, 0.62, zz, TR); }
      const lip = K.box(0.12, 0.42, 0.9, MT.oxideD, sgn * 2.62, 0.6, 0, TR); lip.rotation.z = sgn * 0.5;
      const sc = K.sph(1, MT.scorch, sgn * 3.1, 0.12, 0, TR, 12, 4); sc.scale.set(0.9, 0.02, 0.7); sc.castShadow = false;
      const hm = K.glow(0xff5a10, 0, true); heatMs.push(hm);
      const hb = K.box(len - 0.1, 0.02, 0.7, hm, cx, 0.485, 0, TRd); hb.castShadow = false;
    }
    for (const [x, z, sx, sz] of [[1.75, 0.35, 0.32, 0.2], [-1.45, -0.95, 0.3, 0.22], [0.75, -1.55, 0.28, 0.18]]) { const p = K.sph(1, K.mat(0x1c1a20, { shine: 90, spec: 0x8a7aa8 }), x, 0.49, z, S, 12, 4); p.scale.set(sx, 0.012, sz); p.castShadow = false; }
    for (let i = 0; i < 10; i++) { const a = K.rnd() * 6.28, rr = 1.3 + K.rnd() * 0.8; const d = K.box(0.3 + K.rnd() * 0.5, 0.01, 0.2 + K.rnd() * 0.3, MT.grime, Math.cos(a) * rr, 0.485, Math.sin(a) * rr, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
    // rim lamps (8)
    const rimLamps = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 2.5, z = Math.sin(a) * 2.5;
      K.cyl(0.09, 0.11, 0.1, MT.iron, 8, x, 0.42, z, S);
      const m = K.mat(0x2a1a08, { e: 0 }); const l = K.sph(0.09, m, x, 0.53, z, g, 8, 6); l.castShadow = false;
      rimLamps.push(m);
    }
    // BLOCKED red flood wash over the pad (pulses) — readable at LINE zoom
    const washM = K.glow(0xff2a10, 0, true);
    const wash = K.cyl(2.45, 2.45, 0.02, washM, 8, 0, 0.52, 0, g); wash.rotation.y = Math.PI / 8; wash.castShadow = false; wash.visible = false;
    const washRingM = K.glow(0xff3a14, 0, true);
    const washRing = K.torus(2.55, 0.09, washRingM, 4, 8, 0, 0.56, 0, g); washRing.rotation.set(Math.PI / 2, 0, Math.PI / 8); washRing.visible = false;

    // ---------- PEDESTAL / SILO ELEVATOR ----------
    const lifter = K.group(g, 0, 0, 0);
    const LS = K.group(lifter);
    K.cyl(1.1, 1.1, 0.33, MT.iron, 16, 0, BASE_Y - 0.165, 0, LS);
    K.cyl(1.0, 1.05, 1.9, MT.ironM, 16, 0, BASE_Y - 1.25, 0, LS);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.26, 0.08, 0.06, i % 2 ? MT.soot : MT.hazard, Math.cos(a) * 1.08, BASE_Y - 0.06, Math.sin(a) * 1.08, LS).rotation.y = -a + Math.PI / 2; }
    K.cyl(0.95, 0.95, 0.04, K.mat(0xffffff, { map: deckTex() }), 16, 0, BASE_Y + 0.005, 0, LS);
    for (let i = 0; i < 6; i++) { const b = K.box(1.8, 0.03, 0.08, MT.ironL, 0, BASE_Y + 0.03, 0, LS); b.rotation.y = i * Math.PI / 6; }
    rivetRing(LS, 1.02, BASE_Y - 0.25, 18);
    K.cyl(0.75, 0.75, 0.01, K.mat(0x14100c, { op: 0.3, depthWrite: false }), 16, 0, BASE_Y + 0.04, 0, LS).castShadow = false;
    K.bake(LS);

    // ---------- ROCKETS (two, they alternate) ----------
    const bodyLo = K.mat(0x8c6c34, { shine: 34, spec: 0x6a5028 }), bodyHi = K.mat(0x96502c, { shine: 30, spec: 0x603820 });
    function makeRocket() {
      const rk = K.group(g, 0, BASE_Y, 0); rk.rotation.y = THETA;
      const st = K.group(rk);
      const prof = [[0.0, 0], [0.44, 0.02], [0.54, 0.3], [0.58, 1.0], [0.58, 2.25], [0.52, 2.85], [0.4, 3.35], [0.22, 3.8], [0.05, 4.05]];
      K.lathe(prof.slice(0, 6), bodyLo, 18, 0, 0, 0, st);
      K.lathe(prof.slice(5), bodyHi, 18, 0, 0, 0, st);
      K.lathe([[0.46, 0.0], [0.56, 0.3], [0.595, 0.75]], K.mat(0x1a1410, { op: 0.55, depthWrite: false, double: true }), 18, 0, 0.0, 0, st);
      K.cyl(0.03, 0.05, 0.6, MT.brassL, 6, 0, 4.3, 0, st); K.sph(0.07, MT.brassL, 0, 4.62, 0, st, 6, 4);
      for (const y of [0.35, 1.0, 1.55, 2.2]) { K.torus(0.585, 0.035, MT.brassD, 4, 22, 0, y, 0, st).rotation.x = Math.PI / 2; rivetRing(st, 0.6, y + 0.08, 16); }
      K.torus(0.53, 0.04, MT.brassD, 4, 22, 0, 2.85, 0, st).rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; const s = K.box(0.05, 0.5 + (i % 3) * 0.25, 0.01, MT.grime, Math.sin(a) * 0.585, 0.4 + (i % 3) * 0.2, Math.cos(a) * 0.585, st); s.rotation.y = a; s.castShadow = false; }
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2, fin = K.group(st); fin.rotation.y = a;
        const f = K.box(0.07, 1.05, 0.68, MT.copperD, 0, 0.55, 0.82, fin); f.rotation.x = 0.28;
        K.box(0.09, 0.08, 0.62, MT.brass, 0, 0.02, 0.88, fin);
        K.box(0.08, 0.9, 0.06, MT.brassL, 0, 0.62, 1.12, fin).rotation.x = 0.28;
      }
      K.lathe([[0.2, 0], [0.3, -0.32], [0.38, -0.4]], MT.ironL, 14, 0, 0.04, 0, st);
      K.torus(0.36, 0.03, MT.brassD, 4, 14, 0, -0.34, 0, st).rotation.x = Math.PI / 2;
      // two steam relief valves at mid height (they vent hard while the launch is held)
      for (const a of [Math.PI / 2, -Math.PI / 2]) { const v = K.group(st, Math.sin(a) * 0.6, 1.3, Math.cos(a) * 0.6); v.rotation.y = a; K.cyl(0.06, 0.06, 0.16, MT.brassL, 8, 0, 0, 0.06, v).rotation.x = Math.PI / 2; K.cyl(0.09, 0.07, 0.06, MT.brassD, 8, 0, 0, 0.15, v).rotation.x = Math.PI / 2; }
      const hy = HATCH_Y + 0.2;
      K.box(0.5, 0.56, 0.06, MT.brassD, 0, hy, 0.57, st);
      K.box(0.36, 0.42, 0.06, MT.dark, 0, hy, 0.59, st);
      const portM = K.glow(0x6a4a24);
      for (const [y, a] of [[2.55, 0.9], [2.55, -0.9], [1.25, Math.PI]]) {
        const pg = K.group(st, Math.sin(a) * 0.57, y, Math.cos(a) * 0.57); pg.rotation.y = a;
        K.cyl(0.15, 0.15, 0.06, MT.brassL, 12, 0, 0, 0, pg).rotation.x = Math.PI / 2;
        K.cyl(0.1, 0.1, 0.08, portM, 12, 0, 0, 0.01, pg).rotation.x = Math.PI / 2;
      }
      const aboardM = K.glow(0x14301e);
      const ab = K.group(st, 0, hy + 0.55, 0.555);
      K.cyl(0.13, 0.13, 0.06, MT.brassL, 12, 0, 0, 0, ab).rotation.x = Math.PI / 2;
      K.cyl(0.09, 0.09, 0.08, aboardM, 12, 0, 0, 0.012, ab).rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; const s = K.box(0.12, 0.08, 0.01, i % 2 ? MT.soot : MT.hazard, Math.sin(a) * 0.59, 0.72, Math.cos(a) * 0.59, st); s.rotation.y = a; }
      K.bake(st);
      // hatch door (hinged at its top edge) with 4 locking bolts that spin as it seals
      const hinge = K.group(rk, 0, hy + 0.22, 0.6);
      const door = K.group(hinge);
      K.box(0.36, 0.43, 0.05, MT.copper, 0, -0.215, 0, door);
      K.box(0.3, 0.05, 0.06, MT.brassL, 0, -0.08, 0.02, door); K.box(0.06, 0.08, 0.07, MT.brassL, 0.13, -0.33, 0.02, door);
      K.bake(door);
      const bolts = [[-0.14, -0.05], [0.14, -0.05], [-0.14, -0.38], [0.14, -0.38]].map(([x, y]) => {
        const b = K.group(hinge, x, y, 0.035); const h = K.cyl(0.035, 0.035, 0.05, MT.brassL, 6, 0, 0, 0, b); h.rotation.x = Math.PI / 2; K.box(0.06, 0.015, 0.02, MT.soot, 0, 0, 0.03, b); return b;
      });
      const cargo = K.group(rk, 0, HATCH_Y, CARGO_OUT);
      const cradle = K.box(0.3, 0.05, 0.62, MT.ironL, 0, -0.02, 0, cargo); cradle.visible = false;
      const plume = K.group(rk, 0, -0.38, 0);
      const fl1 = K.cone(0.35, 1.7, K.glow(0xffd27a, 0.95, true), 10, 0, -0.85, 0, plume); fl1.rotation.x = Math.PI;
      const fl2 = K.cone(0.2, 1.05, K.glow(0xffffff, 1, true), 8, 0, -0.52, 0, plume); fl2.rotation.x = Math.PI;
      const fl3 = K.cone(0.55, 2.8, K.glow(0xff6a20, 0.5, true), 10, 0, -1.4, 0, plume); fl3.rotation.x = Math.PI;
      const fl4 = K.cone(0.42, 1.3, K.glow(0x7af0d8, 0.35, true), 10, 0, -0.65, 0, plume); fl4.rotation.x = Math.PI;
      plume.visible = false;
      return { rk, hinge, bolts, cargo, cradle, plume, portM, aboardM, item: null, open: 0, slide: 0, flyT: -1 };
    }
    const rockets = [makeRocket(), makeRocket()];
    let cur = rockets[0], spare = rockets[1], flyer = null;
    spare.rk.visible = false;
    // rocket-local -> g-local helper (for particles at vents etc.)
    const vt = new T.Vector3();
    function rkPoint(r, x, y, z) { vt.set(x, y, z).applyAxisAngle(new T.Vector3(0, 1, 0), THETA); return vt.add(r.rk.position); }

    // ---------- HOLD-DOWN CLAMPS (4, between the fins) ----------
    const clamps = [];
    for (let i = 0; i < 4; i++) {
      const a = THETA + i * Math.PI / 2, dx = Math.sin(a), dz = Math.cos(a);
      const cb = K.group(S, dx * 1.45, 0.47, dz * 1.45); cb.rotation.y = a;
      K.box(0.36, 0.22, 0.36, MT.iron, 0, 0.11, 0, cb); K.box(0.4, 0.05, 0.4, MT.brassD, 0, 0.23, 0, cb);
      const pis = K.cyl(0.05, 0.05, 0.5, MT.ironL, 6, 0, 0.35, 0.2, cb); pis.rotation.x = 0.5;
      const cg = K.group(g, dx * 1.45, 0.47, dz * 1.45); cg.rotation.y = a;
      const jaw = K.group(cg, 0, 0.22, 0);
      K.box(0.16, 0.78, 0.16, MT.oxide, 0, 0.39, 0, jaw);
      K.box(0.16, 0.14, 0.84, MT.oxide, 0, 0.74, -0.38, jaw);
      K.box(0.2, 0.22, 0.1, MT.brass, 0, 0.66, -0.8, jaw);
      K.box(0.17, 0.06, 0.86, MT.hazard, 0, 0.83, -0.38, jaw);
      K.bake(jaw);
      clamps.push({ jaw, tip: [dx * (1.45 - 0.8), 1.35, dz * (1.45 - 0.8)], dx, dz });
    }

    // ---------- GANTRY TOWER ----------
    const GT = K.group(S, GANTRY[0], 0.47, GANTRY[1]);
    const GH = 6.3;
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) { K.box(0.14, GH, 0.14, MT.oxide, sx, GH / 2, sz, GT); K.box(0.26, 0.12, 0.26, MT.ironM, sx, 0.06, sz, GT); }
    for (let y = 0.6; y < GH - 0.2; y += 0.75) {
      for (const [x, z, ry] of [[0, 0.45, 0], [0, -0.45, 0], [0.45, 0, Math.PI / 2], [-0.45, 0, Math.PI / 2]]) {
        const br = K.box(0.06, 1.06, 0.06, MT.oxideD, x, y + 0.36, z, GT); br.rotation.set(0, ry, ((Math.round(y / 0.75)) % 2 ? 1 : -1) * 0.72);
        K.box(0.92, 0.07, 0.07, MT.oxideD, x, y, z, GT).rotation.y = ry;
      }
    }
    K.box(1.25, 0.1, 1.25, MT.ironM, 0, GH, 0, GT);
    for (const s of [-1, 1]) { K.box(0.04, 0.42, 1.25, MT.ironL, s * 0.6, GH + 0.21, 0, GT); K.box(1.25, 0.42, 0.04, MT.ironL, 0, GH + 0.21, s * 0.6, GT); }
    for (let y = 0.3; y < GH; y += 0.22) K.box(0.03, 0.03, 0.4, MT.ironL, -0.53, y, 0, GT);
    for (const z of [-0.2, 0.2]) K.box(0.03, GH, 0.03, MT.ironL, -0.55, GH / 2, z, GT);
    const fl = K.group(GT, 0.45, GH + 0.45, 0.45); fl.rotation.y = Math.PI / 4;
    K.box(0.42, 0.3, 0.22, MT.iron, 0, 0, 0, fl);
    const floodM = K.glow(0x3a3020); const flood = K.box(0.36, 0.24, 0.04, floodM, 0.45 * 0, 0, 0, g);
    flood.position.set(GANTRY[0] + 0.45 + 0.085, 0.47 + GH + 0.45, GANTRY[1] + 0.45 + 0.085); flood.rotation.y = Math.PI / 4;
    const gtd = K.group(g, GANTRY[0], 0.47, GANTRY[1]);
    const beaconM = K.mat(0x401010, { e: 0 });
    const beaconSpin = K.group(gtd, 0, GH + 0.66, 0); K.box(0.26, 0.18, 0.08, beaconM, 0.07, 0, 0, beaconSpin);
    const beaconDomeM = K.glow(0xff3020, 0.15); K.sph(0.19, beaconDomeM, 0, GH + 0.66, 0, gtd, 8, 6).castShadow = false;
    const strobeMs = []; for (const [x, z] of [[-0.62, -0.62], [0.62, 0.62], [0.62, -0.62], [-0.62, 0.62]]) { const m = K.mat(0x401010, { e: 0 }); K.sph(0.08, m, x, GH + 0.45, z, gtd, 6, 4); strobeMs.push(m); }
    const cage = K.group(gtd, 0, 1, 0);
    K.box(0.7, 0.05, 0.7, MT.brassD, 0, 0, 0, cage); K.box(0.7, 0.05, 0.7, MT.brass, 0, 0.62, 0, cage);
    for (const sx of [-0.33, 0.33]) for (const sz of [-0.33, 0.33]) K.box(0.04, 0.62, 0.04, MT.brass, sx, 0.31, sz, cage);
    K.bake(cage);
    const cageLampM = K.glow(0x3a2a14); K.sph(0.06, cageLampM, 0, 0.5, 0, cage, 6, 4).castShadow = false;
    // service arm + two umbilical hoses that pop off at ignition
    const armP = K.group(gtd, 0.45, 3.4, 0.45); armP.rotation.y = -Math.PI / 4;
    const sarm = K.group(armP);
    K.box(0.95, 0.14, 0.2, MT.ironL, 0.47, 0, 0, sarm); K.box(0.95, 0.04, 0.06, MT.hazard, 0.47, 0.09, 0.07, sarm);
    K.box(0.12, 0.26, 0.26, MT.brassD, 0.95, 0, 0, sarm);
    for (let x = 0.1; x < 0.9; x += 0.2) K.box(0.03, 0.16, 0.22, MT.ironM, x, -0.02, 0, sarm);
    K.bake(sarm);
    const hoses = [-0.07, 0.07].map((zo, i) => {
      const hp = K.group(sarm, 0.9, -0.12, zo);
      K.tube([[0, 0, 0], [0.05, -0.35, 0], [0.12, -0.75 - i * 0.2, 0], [0.12, -0.95 - i * 0.2, 0]], 0.04, MT.rubber, hp, 10, 5);
      K.box(0.1, 0.12, 0.1, MT.brassL, 0.12, -1.0 - i * 0.2, 0, hp);
      K.bake(hp);
      return { hp, end: -1.0 - i * 0.2, pop: 0, vel: 0 };
    });

    // ---------- BOILER TANK ----------
    const TK = K.group(S, TANK[0], 0.47, TANK[1]);
    for (const x of [-0.55, 0.55]) { K.box(0.2, 0.42, 0.9, MT.iron, x, 0.21, 0, TK); K.box(0.26, 0.05, 0.96, MT.brassD, x, 0.43, 0, TK); }
    const tb = K.cyl(0.44, 0.44, 1.7, MT.copper, 16, 0, 0.82, 0, TK); tb.rotation.z = Math.PI / 2;
    for (const x of [-0.86, 0.86]) { const cp = K.sph(0.44, MT.copperD, x, 0.82, 0, TK, 14, 8); cp.scale.x = 0.36; }
    for (const x of [-0.5, 0, 0.5]) { const b = K.cyl(0.46, 0.46, 0.07, MT.brassD, 16, x, 0.82, 0, TK); b.rotation.z = Math.PI / 2; }
    const sightM = K.glow(0x1e4a40); K.box(1.2, 0.12, 0.05, sightM, TANK[0], 0.47 + 0.92, TANK[1] + 0.44, g);
    K.cyl(0.07, 0.07, 0.5, MT.brass, 8, 0.45, 1.4, 0.0, TK); K.cyl(0.1, 0.07, 0.18, MT.brassL, 8, 0.45, 1.7, 0, TK);
    for (let i = 0; i < 4; i++) { const s = K.box(0.03, 0.3, 0.01, MT.grime, -0.6 + i * 0.4, 0.6, 0.445, TK); s.castShadow = false; }
    const tankN = gauge(g, TANK[0], 0.47 + 1.33, TANK[1] + 0.3, 0.15, 0); tankN.parent.rotation.x = -0.4;
    K.tube([[TANK[0] - 0.7, 1.35, TANK[1] + 0.2], [-1.0, 1.4, -1.2], [-0.62, 1.3, -0.75], [-0.45, 1.05, -0.5]], 0.07, MT.copper, S, 16, 6);

    // ---------- CLOCK TOWER + NIXIE BOARDS (faces the camera) ----------
    const CK = K.group(S, CLOCK[0], 0.47, CLOCK[1]); CK.rotation.y = Math.PI / 4;
    K.box(0.66, 0.3, 0.66, MT.iron, 0, 0.15, 0, CK);
    K.box(0.56, 1.9, 0.56, K.mat(0x4a3424), 0, 1.25, 0, CK);
    for (const y of [0.4, 1.2, 2.0]) K.box(0.6, 0.06, 0.6, MT.brassD, 0, y, 0, CK);
    K.box(0.68, 0.14, 0.68, MT.brassD, 0, 2.25, 0, CK);
    K.torus(0.47, 0.06, MT.brass, 6, 20, 0, 2.72, 0.26, CK);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.04, i % 3 ? 0.06 : 0.11, 0.02, MT.soot, Math.sin(a) * 0.36, 2.72 + Math.cos(a) * 0.36, 0.27, CK).rotation.z = -a; }
    K.box(0.3, 0.05, 0.02, K.mat(0xc0301a), 0.0, 2.95, 0.27, CK);
    K.cone(0.2, 0.32, MT.brassD, 6, 0, 3.3, 0, CK);
    K.box(0.62, 0.34, 0.2, MT.brassD, 0, 1.62, 0.32, CK);     // countdown housing (4 tubes)
    K.box(0.5, 0.28, 0.18, MT.ironM, 0, 0.78, 0.32, CK);      // shipped counter housing (3 tubes)
    K.box(0.12, 0.07, 0.02, K.mat(0x46c070), -0.18, 0.97, 0.42, CK); // little green rocket glyph plate
    K.cone(0.03, 0.06, K.mat(0x46c070), 4, -0.18, 1.0, 0.43, CK);
    for (let i = 0; i < 4; i++) K.cyl(0.07, 0.07, 0.28, MT.glass, 10, -0.21 + i * 0.14, 1.64, 0.45, CK).castShadow = false;
    for (let i = 0; i < 3; i++) K.cyl(0.06, 0.06, 0.22, MT.glass, 10, -0.12 + i * 0.12, 0.78, 0.43, CK).castShadow = false;
    const ckd = K.group(g, CLOCK[0], 0.47, CLOCK[1]); ckd.rotation.y = Math.PI / 4;
    const faceM = K.mat(C.cream, { e: 0 });
    K.cyl(0.46, 0.46, 0.08, faceM, 18, 0, 2.72, 0.22, ckd).rotation.x = Math.PI / 2;
    const hand = K.group(ckd, 0, 2.72, 0.28); K.box(0.045, 0.36, 0.02, K.mat(0x8a1a10), 0, 0.17, 0, hand); K.box(0.07, 0.07, 0.03, MT.brassL, 0, 0, 0.01, hand);
    const bellP = K.group(ckd, 0, 3.55, 0); K.cone(0.15, 0.2, MT.brassL, 8, 0, -0.08, 0, bellP); K.box(0.04, 0.12, 0.04, MT.iron, 0, 0.05, 0, bellP); K.bake(bellP);
    const ckLampM = K.mat(0x2a1a10, { e: 0 }); K.sph(0.09, ckLampM, 0.0, 2.02, 0.33, ckd, 8, 6);
    // 7-segment nixie glyphs
    const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd', '-': 'g', ' ': '', H: 'bcefg', O: 'abcdef', L: 'def', d: 'bcdeg', '?': 'abge', t: 'defg', C: 'adef', r: 'eg', G: 'acdef', A: 'abcefg', P: 'abefg' };
    const glyph = {};
    Object.keys(SEG).forEach((ch) => {
      glyph[ch] = K.canvasTex(10, 16, (c) => {
        c.clearRect(0, 0, 10, 16);
        const seg = { a: [2, 1, 6, 2], b: [7, 2, 2, 6], c: [7, 8, 2, 6], d: [2, 13, 6, 2], e: [1, 8, 2, 6], f: [1, 2, 2, 6], g: [2, 7, 6, 2] };
        c.fillStyle = 'rgba(255,120,30,0.16)'; for (const k in seg) { const s = seg[k]; c.fillRect(s[0], s[1], s[2], s[3]); }
        c.fillStyle = '#ffb050'; for (const k of SEG[ch]) { const s = seg[k]; c.fillRect(s[0], s[1], s[2], s[3]); }
      });
    });
    function nixieRow(n, xs, y, z, w, h) {
      return xs.slice(0, n).map((x) => { const m = new T.MeshBasicMaterial({ map: glyph['-'], transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }); const pl = new T.Mesh(new T.PlaneGeometry(w, h), m); pl.position.set(x, y, z); ckd.add(pl); return { m, cur: '-' }; });
    }
    const board = nixieRow(4, [-0.21, -0.07, 0.07, 0.21], 1.64, 0.46, 0.12, 0.2);
    const counter = nixieRow(3, [-0.12, 0, 0.12], 0.78, 0.44, 0.1, 0.16);
    function setRow(row, str, bright, tint) { str.split('').forEach((ch, i) => { const n = row[i]; if (!n) return; if (n.cur !== ch) { n.cur = ch; n.m.map = glyph[ch] || glyph[' ']; n.m.needsUpdate = true; } n.m.opacity = bright; n.m.color.setHex(tint || 0xffffff); }); }

    // ---------- TESLA COILS + AETHER TRANSFORMER ----------
    const coils = COILS.map(([x, z]) => {
      const cg = K.group(S, x, 0.47, z);
      K.cyl(0.32, 0.4, 0.34, MT.ironM, 10, 0, 0.17, 0, cg); band(cg, 0.36, 0.3, MT.brassD, 0.06);
      for (let i = 0; i < 4; i++) K.cyl(0.2 - i * 0.012, 0.22 - i * 0.012, 0.12, MT.insul, 10, 0, 0.42 + i * 0.13, 0, cg);
      K.cyl(0.15, 0.17, 1.45, K.mat(0x2a1a10), 10, 0, 1.4, 0, cg);
      for (let i = 0; i < 10; i++) K.torus(0.18, 0.032, MT.copper, 4, 12, 0, 0.82 + i * 0.13, 0, cg).rotation.x = Math.PI / 2;
      K.torus(0.33, 0.12, MT.brassL, 6, 16, 0, 2.2, 0, cg).rotation.x = Math.PI / 2;
      K.cyl(0.05, 0.05, 0.22, MT.brass, 6, 0, 2.38, 0, cg);
      const knobM = K.glow(0x0e2a24);
      K.sph(0.15, knobM, x, 0.47 + 2.52, z, g, 10, 8).castShadow = false;
      const haloM = K.glow(0x7af0d8, 0.0, true); K.sph(0.36, haloM, x, 0.47 + 2.52, z, g, 10, 8).castShadow = false;
      const windM = K.glow(0x7af0d8, 0, true); const wind = K.cyl(0.24, 0.24, 1.3, windM, 10, x, 0.47 + 1.4, z, g); wind.castShadow = false;
      const segs = []; for (let i = 0; i < 9; i++) { const sg = K.box(0.06, 0.06, 1, K.glow(0xd8fff6, 1, true), 0, 0, 0, g); sg.visible = false; sg.castShadow = false; segs.push(sg); }
      const br = []; for (let i = 0; i < 4; i++) { const sg = K.box(0.04, 0.04, 1, K.glow(0x7af0d8, 0.9, true), 0, 0, 0, g); sg.visible = false; sg.castShadow = false; br.push(sg); }
      return { x, z, knobM, haloM, windM, segs, br, top: new T.Vector3(x, 0.47 + 2.55, z) };
    });
    const XF = K.group(S, XFMR[0], 0, XFMR[1]);
    K.box(0.95, 0.12, 0.85, MT.ironM, 0, 0.06, 0, XF);
    K.box(0.82, 1.05, 0.72, MT.iron, 0, 0.64, 0, XF);
    K.box(0.86, 0.06, 0.76, MT.brassD, 0, 1.18, 0, XF);
    for (const x of [-0.2, 0.2]) { for (let i = 0; i < 3; i++) K.cyl(0.09 - i * 0.012, 0.1 - i * 0.012, 0.1, MT.insul, 8, x, 1.26 + i * 0.1, 0, XF); K.sph(0.06, MT.brassL, x, 1.58, 0, XF, 6, 4); }
    hazardStripe(XF, 0.82, 0, 0.22, 0.37, 7, 0, 0.1);
    K.box(0.62, 0.05, 0.05, MT.brassL, 0, 0.98, 0.37, XF);
    for (const [x, y] of [[-0.36, 0.2], [0.36, 0.2], [-0.36, 1.08], [0.36, 1.08]]) K.box(0.05, 0.05, 0.05, MT.brassL, x, y, 0.38, XF);
    const fl0 = K.cyl(0.17, 0.17, 0.12, MT.brass, 12, -0.48, 0.35, 0, XF); fl0.rotation.z = Math.PI / 2;
    const fl1 = K.cyl(0.12, 0.12, 0.2, K.mat(0x3f8a72), 10, -0.6, 0.35, 0, XF); fl1.rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; K.box(0.04, 0.04, 0.04, MT.brassL, -0.55, 0.35 + Math.sin(a) * 0.14, Math.cos(a) * 0.14, XF); }
    const xfGlass = K.glow(0x0e3a30); K.box(0.5, 0.16, 0.03, xfGlass, XFMR[0], 0.75, XFMR[1] + 0.375, g);
    const xfMeter = gauge(g, XFMR[0] + 0.25, 0.48, XFMR[1] + 0.38, 0.11, 0);
    const cablePaths = [
      [[XFMR[0] + 0.45, 0.12, XFMR[1] + 0.1], [-2.5, 0.1, 0.55], [COILS[0][0] - 0.3, 0.12, COILS[0][1]]],
      [[XFMR[0] + 0.2, 0.12, XFMR[1] - 0.42], [-2.75, 0.1, -1.6], [-1.6, 0.1, -2.85], [0.9, 0.1, -2.95], [2.1, 0.1, -2.75], [2.8, 0.1, -1.6], [COILS[1][0] + 0.25, 0.14, COILS[1][1] - 0.2]]
    ];
    const beads = [];
    cablePaths.forEach((pts) => {
      K.tube(pts, 0.07, MT.rubber, S, 40, 6);
      const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2])));
      for (let i = 0; i < 9; i++) { const p = curve.getPoint((i + 0.5) / 9); K.torus(0.085, 0.025, MT.brassD, 4, 8, p.x, p.y, p.z, S).lookAt(0, 0, 0); }
      for (let i = 0; i < 4; i++) { const b = K.sph(0.06, K.glow(0x9afff0, 0.95, true), 0, 0, 0, g, 6, 4); b.castShadow = false; b.visible = false; beads.push({ b, curve, u: i / 4 }); }
    });
    const coilL = K.light(0x7af0d8, 0, 8, 0, 2.6, 0, g);     // charge arcs / work flood / amber sputter
    const plumeL = K.light(0xff8a3a, 0, 11, 0, 0.9, 0, g);   // ignition / red flood strobe when blocked

    // ---------- LOADING JIB CRANE ----------
    const CB = K.group(S, PIVOT[0], 0.47, PIVOT[1]);
    K.cyl(0.32, 0.4, 0.22, MT.iron, 10, 0, 0.11, 0, CB); band(CB, 0.36, 0.22, MT.brassD, 0.05);
    gear(CB, 0.3, 0.07, 14, MT.brassD, 0, 0.27, 0);
    K.cyl(0.11, 0.13, 2.85, MT.oxide, 10, 0, 1.68, 0, CB);
    for (const y of [0.9, 1.9, 2.7]) band(CB, 0.15, y, MT.brassD, 0.07);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const s = K.box(0.05, 0.9, 0.05, MT.oxideD, Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22, CB); s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    const BOOM_Y = 3.55, BOOM_L = 1.45;
    const head = K.group(g, PIVOT[0], BOOM_Y, PIVOT[1]);
    const HS = K.group(head);
    K.cyl(0.2, 0.2, 0.14, MT.brass, 12, 0, -0.03, 0, HS);
    K.box(BOOM_L + 0.1, 0.13, 0.16, MT.oxide, BOOM_L / 2, 0.02, 0, HS);
    for (let i = 0; i < 7; i++) K.box(0.09, 0.03, 0.18, i % 2 ? MT.soot : MT.hazard, 0.12 + i * 0.2, 0.1, 0, HS);
    K.box(0.62, 0.11, 0.14, MT.oxide, -0.3, 0.02, 0, HS);
    K.box(0.32, 0.36, 0.3, MT.ironM, -0.52, 0.05, 0, HS); K.box(0.34, 0.06, 0.32, MT.brassD, -0.52, 0.24, 0, HS);
    K.cyl(0.05, 0.08, 0.62, MT.ironL, 6, 0, 0.38, 0, HS);
    const tie1 = K.box(1, 0.025, 0.025, MT.ironL, 0, 0, 0, HS); K.link(tie1, 0, 0.66, BOOM_L - 0.05, 0.08);
    const tie2 = K.box(1, 0.025, 0.025, MT.ironL, 0, 0, 0, HS); K.link(tie2, 0, 0.66, -0.6, 0.12);
    K.cyl(0.09, 0.09, 0.2, MT.brassL, 10, -0.25, 0.14, 0, HS).rotation.x = Math.PI / 2;
    K.bake(HS);
    const trolley = K.group(head, 0.8, -0.06, 0);
    const TS = K.group(trolley); K.box(0.24, 0.12, 0.24, MT.ironL, 0, 0, 0, TS);
    for (const s of [-1, 1]) K.cyl(0.05, 0.05, 0.04, MT.brass, 8, 0, 0.06, s * 0.11, TS).rotation.x = Math.PI / 2;
    K.bake(TS);
    const swing = K.group(trolley, 0, -0.06, 0);                // cable sway pivot
    const chain = K.box(0.035, 1, 0.035, MT.soot, 0, -0.5, 0, swing);
    const claw = K.group(swing, 0, -1, 0);
    const CLS = K.group(claw); K.box(0.22, 0.12, 0.2, MT.ironL, 0, 0, 0, CLS); K.box(0.1, 0.1, 0.1, MT.iron, 0, 0.1, 0, CLS); for (let i = 0; i < 3; i++) K.box(0.05, 0.13, 0.21, i % 2 ? MT.soot : MT.hazard, -0.08 + i * 0.08, 0, 0, CLS); K.bake(CLS);
    const fingers = [-1, 1].map((s) => { const fg = K.group(claw, 0, -0.04, s * 0.09); K.box(0.16, 0.36, 0.04, MT.ironL, 0, -0.18, 0, fg); K.box(0.16, 0.05, 0.08, MT.brassD, 0, -0.34, -s * 0.03, fg); K.bake(fg); return { fg, s }; });
    const clawLampM = K.mat(0x203020, { e: 0 }); K.sph(0.04, clawLampM, 0.12, 0.02, 0, claw, 6, 4);
    const grip = K.group(claw, 0, -0.42, 0);
    const CH0 = BOOM_Y - 0.12;
    const crane = { a: Math.atan2(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]), r: 0.8, y: 2.3, gr: 0 };
    let swayX = 0, swayZ = 0, swayVX = 0, swayVZ = 0, prevA = crane.a, prevR = crane.r;
    function applyCrane(dt) {
      head.rotation.y = -crane.a;
      trolley.position.x = crane.r;
      const clawY = crane.y + 0.42;
      const c = Math.max(0.04, CH0 - 0.06 - clawY);
      chain.scale.y = c; chain.position.y = -c / 2;
      claw.position.y = -c - 0.06;
      fingers.forEach((f) => (f.fg.rotation.x = f.s * (0.55 - crane.gr * 0.55)));
      // pendulum sway driven by slewing (tangential) + trolley (radial) motion; damped
      if (dt > 0) {
        const da = (crane.a - prevA) / dt, dr = (crane.r - prevR) / dt; prevA = crane.a; prevR = crane.r;
        const L = Math.max(0.3, c + 0.4), w2 = 9.8 / L;
        swayVX += (-w2 * swayX - 2.2 * swayVX - dr * 3.2) * dt; swayX += swayVX * dt;            // about head-z (radial swing)
        swayVZ += (-w2 * swayZ - 2.2 * swayVZ + da * crane.r * 3.2) * dt; swayZ += swayVZ * dt;  // about head-x (tangential swing)
        swayX = Math.max(-0.35, Math.min(0.35, swayX)); swayZ = Math.max(-0.35, Math.min(0.35, swayZ));
      }
      swing.rotation.z = swayX; swing.rotation.x = swayZ;
    }
    const A_TRAY = Math.atan2(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]), R_TRAY = Math.hypot(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]);
    const cOut = [HD[0] * CARGO_OUT, HD[1] * CARGO_OUT];
    const A_HATCH = Math.atan2(cOut[1] - PIVOT[1], cOut[0] - PIVOT[0]), R_HATCH = Math.hypot(cOut[1] - PIVOT[1], cOut[0] - PIVOT[0]);
    const Y_TRAY = 1.0, Y_CARRY = 2.85, Y_HATCH = BASE_Y + HATCH_Y;

    // ---------- INTAKE TRAY ----------
    const TY = K.group(S, TRAY[0], 0, TRAY[1]);
    for (const sx of [-0.28, 0.28]) for (const sz of [-0.35, 0.3]) K.box(0.08, 0.92, 0.08, MT.iron, sx, 0.46, sz, TY);
    K.box(0.68, 0.06, 0.82, MT.ironL, 0, 0.94, -0.03, TY);
    for (let i = 0; i < 5; i++) { const r = K.cyl(0.045, 0.045, 0.6, MT.brassL, 8, 0, 0.985, -0.35 + i * 0.16, TY); r.rotation.z = Math.PI / 2; }
    for (const sx of [-0.34, 0.34]) K.box(0.05, 0.16, 0.84, MT.brassD, sx, 1.02, -0.03, TY);
    hazardStripe(TY, 0.62, 0, 1.05, -0.5, 6, 0, 0.2);
    K.box(0.7, 0.04, 0.6, MT.ironM, 0, 0.25, -0.03, TY);
    const trayLampM = K.mat(0x203020, { e: 0 }); K.sph(0.06, trayLampM, TRAY[0] + 0.36, 1.18, TRAY[1] - 0.44, g, 6, 4);

    // ---------- STATUS + CAUTION ----------
    const lamp = K.statusLamp(g, 2.3, 0.47, 0.9, 1.15);
    const caution = K.caution(g, -2.4, 0.1, 1.55, 0.85);

    // ---------- LIFTOFF FX: shockwave, bright trail, lingering smoke column ----------
    const shock = K.torus(1, 0.08, K.glow(0xffd8a0, 0.9, true), 4, 32, 0, 0.55, 0, g); shock.rotation.x = Math.PI / 2; shock.visible = false; shock.castShadow = false;
    const trailM = K.glow(0xffc070, 0, true), trailCoreM = K.glow(0xfff4d8, 0, true);
    const trail = K.cyl(0.2, 0.32, 1, trailM, 10, 0, 0, 0, g); trail.castShadow = false; trail.visible = false;
    const trailCore = K.cyl(0.07, 0.1, 1, trailCoreM, 8, 0, 0, 0, g); trailCore.castShadow = false; trailCore.visible = false;
    const colM = K.mat(0x9a9286, { op: 0, depthWrite: false });
    const column = K.cyl(0.5, 0.9, 1, colM, 12, 0, 0, 0, g); column.castShadow = false; column.receiveShadow = false; column.visible = false;
    let trailTop = 0, trailA = 0, colA = 0, colTop = 0, heat = 0;

    K.bake(S);

    // =====================================================================
    // STATE MACHINES
    // =====================================================================
    let craneQ = [], craneStep = null, craneT = 0, craneMode = 'rest', held = null;
    function craneGo(steps) { craneQ = steps.slice(); craneStep = null; }
    function nextCraneStep() { craneStep = craneQ.shift() || null; craneT = 0; if (craneStep) { craneStep.from = { a: crane.a, r: crane.r, y: crane.y, gr: crane.gr }; if (craneStep.start) craneStep.start(); } }
    let phase = 'ready', pT = 0, decided = false, countN = 3, seal = 0, climbT = 0;
    let resetPhase = null, rT = 0;
    let clampOpen = 0, clampSparked = false, armAway = 0, bellSwing = 0, shockT = -1, celebrateT = -1, shipFlash = 0, lastShipped = -1, hosePopped = false;
    let lite = 0;   // 0 = lights down (idle) .. 1 = lit (working)
    function setPhase(p) { phase = p; pT = 0; }
    function recycle(r) {
      r.rk.visible = false; r.plume.visible = false; r.item = null; r.open = 0; r.slide = 0; r.flyT = -1;
      r.rk.position.set(0, BASE_Y, 0); r.hinge.rotation.x = 0; r.cargo.position.z = CARGO_OUT; r.aboardM.color.setHex(0x14301e);
    }
    const rootDir = (dx, dz) => [C45 * (dx - dz), C45 * (dx + dz)];
    function orientItem(it, dxl, dzl) { const [rx, rz] = rootDir(dxl, dzl); it.mesh.rotation.order = 'YZX'; it.mesh.rotation.set(0, Math.atan2(-rz, rx), 0); }

    const tmp = new T.Vector3(), za = new T.Vector3(), zb = new T.Vector3(), zP = []; for (let i = 0; i <= 9; i++) zP.push(new T.Vector3());
    function zap(c, on, strength, col) {
      if (!on) { c.segs.forEach((s) => (s.visible = false)); c.br.forEach((s) => (s.visible = false)); return; }
      const rk = cur || flyer; if (!rk) { c.segs.forEach((s) => (s.visible = false)); c.br.forEach((s) => (s.visible = false)); return; }
      const ry = rk.rk.position.y + 0.6 + Math.random() * 2.2;
      const dx = c.x - rk.rk.position.x, dz = c.z - rk.rk.position.z, d = Math.hypot(dx, dz) || 1;
      za.copy(c.top); zb.set(rk.rk.position.x + dx / d * 0.6, ry, rk.rk.position.z + dz / d * 0.6);
      const n = c.segs.length;
      for (let i = 0; i <= n; i++) { zP[i].copy(za).lerp(zb, i / n); if (i > 0 && i < n) zP[i].add(tmp.set(K.R() * 0.5, K.R() * 0.5, K.R() * 0.5).multiplyScalar(strength)); }
      c.segs.forEach((s, i) => { s.visible = true; s.material.color.setHex(col || 0xd8fff6); s.position.copy(zP[i]).lerp(zP[i + 1], 0.5); s.scale.set(1, 1, zP[i].distanceTo(zP[i + 1])); s.lookAt(g.localToWorld(tmp.copy(zP[i + 1]))); });
      const k0 = 3 + Math.floor(Math.random() * 3); let p0 = zP[k0].clone();
      c.br.forEach((s) => { const p1 = p0.clone().add(tmp.set(K.R() * 0.6, -0.15 - Math.random() * 0.3, K.R() * 0.6)); s.visible = Math.random() < 0.8; s.material.color.setHex(col ? 0xffb020 : 0x7af0d8); s.position.copy(p0).lerp(p1, 0.5); s.scale.set(1, 1, p0.distanceTo(p1)); s.lookAt(g.localToWorld(p1.clone())); p0 = p1; });
    }
    // flight curve: heavy and slow for ~1.5 s, then it really goes
    function flightY(q) { if (q <= 1.5) return BASE_Y + 0.9 * q * q; const d = q - 1.5; return BASE_Y + 2.025 + 2.7 * d + 5.5 * d * d; }

    let tPuff = 0, tZap = 0;
    applyCrane(0);

    return { g, update(t, dt) {
      const blk = M.blocked;
      const live = blk ? 0 : dt;           // frozen timers while a decision is pending
      // ------------------------------------------------ CRANE (freezes while blocked)
      if (!craneStep && craneQ.length) nextCraneStep();
      if (craneStep) {
        craneT += live;
        const k = Math.min(1, craneT / craneStep.dur), e = ease(k), f = craneStep.from;
        if (craneStep.a !== undefined) crane.a = f.a + (craneStep.a - f.a) * e;
        if (craneStep.r !== undefined) crane.r = f.r + (craneStep.r - f.r) * e;
        if (craneStep.y !== undefined) crane.y = f.y + (craneStep.y - f.y) * e;
        if (craneStep.gr !== undefined) crane.gr = f.gr + (craneStep.gr - f.gr) * e;
        if (k >= 1) { const s = craneStep; craneStep = null; if (s.then) s.then(); if (craneQ.length) nextCraneStep(); }
      }
      if (craneMode === 'rest' && !craneStep && !craneQ.length) crane.y += (2.3 + Math.sin(t * 0.8) * 0.04 - crane.y) * Math.min(1, dt * 2);
      applyCrane(dt);
      if (held) orientItem(held, Math.cos(crane.a), Math.sin(crane.a));
      if (!blk && craneMode === 'rest' && !craneStep && !craneQ.length && M.waiting('in')) {
        craneMode = 'fetch';
        craneGo([
          { dur: 0.45, a: A_TRAY, r: R_TRAY, y: Y_TRAY + 0.02, gr: 0 },
          { dur: 0.22, gr: 1, start() { const it = M.take('in'); if (it) { held = it; it.follow(grip); } else { craneQ = []; craneMode = 'rest'; } } },
          { dur: 0.45, y: Y_CARRY },
          { dur: 0.75, a: A_HATCH, r: R_HATCH - 0.3, then() { craneMode = 'hold'; } }
        ]);
      }
      if (!blk && craneMode === 'hold' && !craneStep && !craneQ.length && held && cur && phase === 'ready' && !resetPhase) {
        craneMode = 'insert'; setPhase('loading');
        craneGo([
          { dur: 0.45, r: R_HATCH, y: Y_HATCH },
          { dur: 0.22, gr: 0, start() { const it = held; held = null; cur.item = it; it.follow(cur.cargo); cur.cradle.visible = true; } },
          { dur: 0.4, y: Y_CARRY, r: R_HATCH - 0.35 },
          { dur: 0.6, a: A_TRAY, r: R_TRAY, y: 2.3, then() { craneMode = 'rest'; } }
        ]);
      }

      // ------------------------------------------------ ROCKET PHASES
      const r = cur;
      if (phase === 'loading' || phase === 'charge' || phase === 'count' || phase === 'hold') pT += live; else pT += dt;
      if (phase === 'loading' && r) {
        r.open = Math.min(1, r.open + live / 0.3);
        if (r.item && r.cradle.visible) {
          r.slide = Math.min(1, r.slide + (craneStep && craneStep.gr === 0 ? 0 : live / 0.45));
          r.cargo.position.z = CARGO_OUT + (CARGO_IN - CARGO_OUT) * ease(r.slide);
          if (r.slide >= 1) {
            r.open = Math.max(0, r.open - live / 0.25);
            if (r.open <= 0.01) {
              seal += live;
              r.bolts.forEach((b, i) => (b.rotation.z += live * (14 + i * 2)));
              if (seal > 0.35) { seal = 0; r.open = 0; r.cradle.visible = false; r.aboardM.color.setHex(0x46ff8a); r.item.parts.halo.visible = false; r.item.flash(0x46ff8a); setPhase('charge'); }
            }
          }
        }
      } else if (phase === 'charge') {
        if (pT > 1.1) { setPhase('count'); countN = 3; bellSwing = 1; }
      } else if (phase === 'count') {
        const n = 3 - Math.floor(pT / 0.5);
        if (n !== countN && n >= 0) { countN = n; bellSwing = 1; }
        if (pT >= 1.5) {
          countN = 0;
          if (!decided) { decided = true; if (r.item && M.maybeDecision('Merge ' + r.item.label() + ' into main?')) setPhase('hold'); else { setPhase('ignite'); hosePopped = false; } }
          else { setPhase('ignite'); hosePopped = false; }
        }
      } else if (phase === 'hold') {
        if (!blk) { setPhase('ignite'); hosePopped = false; }
      } else if (phase === 'ignite') {
        // a lit rocket never freezes: ignition runs on dt even if someone stalls the pad now
        if (shockT < 0 && pT < 0.1) { shockT = 0; for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; puff(Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9, Math.cos(a) * (2.5 + Math.random() * 2), 0.3 + Math.random() * 0.5, Math.sin(a) * (2.5 + Math.random() * 2), Math.random() < 0.3 ? 0xffb050 : 0xb0a694, 1.1, 0.11, 2, 0.2, -0.08); } }
        if (!hosePopped && pT > 0.08) { hosePopped = true; hoses.forEach((h, i) => { h.vel = -5 - i * 1.5; }); }
        if (pT > 0.7) { flyer = cur; cur = null; flyer.flyT = 0; climbT = 0; setPhase('climb'); }
      } else if (phase === 'climb') {
        climbT += dt;
        if (!resetPhase && climbT > 1.8 && !blk) { resetPhase = 'drop'; rT = 0; }
      }
      // flying rocket (never freezes)
      if (flyer) {
        flyer.flyT += dt;
        const q = flyer.flyT;
        flyer.rk.position.y = flightY(q);
        const rumble = q < 1.5 ? (1.5 - q) * 0.035 : 0.006;
        flyer.rk.position.x = Math.sin(t * 61) * rumble; flyer.rk.position.z = Math.cos(t * 47) * rumble;
        flyer.plume.visible = true; const f = 0.85 + Math.random() * 0.35; const big = q < 1.5 ? 1.15 + (1.5 - q) * 0.25 : 1; flyer.plume.scale.set(big, f * big * (q < 1.5 ? 1.2 : 1.5), big);
        if (flyer.item && flyer.rk.position.y > 15) { const it = flyer.item; flyer.item = null; M.consume(it); celebrateT = 0; }
        if (flyer.rk.position.y > 60) { recycle(flyer); spare = flyer; flyer = null; }
      }
      // reset: pedestal drops, a fresh rocket rises with it, clamps swing in (never stops halfway)
      if (resetPhase) {
        rT += dt;
        if (resetPhase === 'drop') { lifter.position.y = -6.2 * ease(Math.min(1, rT / 0.5)); if (rT >= 0.5) { rT = 0.5; const nr = spare && !spare.rk.visible ? spare : null; if (nr) { spare = null; cur = nr; cur.rk.visible = true; resetPhase = 'rise'; rT = 0; } } }
        else if (resetPhase === 'rise') { const k = Math.min(1, rT / 1.2); lifter.position.y = -6.2 * (1 - ease(k)); if (k >= 1) { resetPhase = 'clamp'; rT = 0; } }
        else if (resetPhase === 'clamp') { if (rT > 0.35) { resetPhase = null; setPhase('ready'); decided = false; } }
        if (cur) cur.rk.position.y = BASE_Y + lifter.position.y;
      }
      if (cur && phase === 'ready' && !resetPhase) cur.rk.position.y = BASE_Y;
      if (cur) cur.hinge.rotation.x = -1.25 * ease(cur.open);
      const vd = lifter.position.y < -0.35; voidDisk.visible = vd; voidGlow.visible = vd;
      if (vd) voidGlow.material.opacity = 0.35 + Math.sin(t * 5) * 0.15;
      // ignition: heavy rumble on the clamps, plume building
      if (phase === 'ignite' && cur) { const k = Math.min(1, pT / 0.7); cur.rk.position.x = Math.sin(t * 60) * 0.03 * k; cur.rk.position.z = Math.cos(t * 53) * 0.03 * k; cur.rk.position.y = BASE_Y + Math.abs(Math.sin(t * 40)) * 0.015 * k; cur.plume.visible = true; cur.plume.scale.set(k * 1.2, k * (0.8 + Math.random() * 0.4) * 1.1, k * 1.2); }
      else if (cur) { cur.rk.position.x = 0; cur.rk.position.z = 0; cur.plume.visible = false; }

      // clamps fly back (with sparks) + service arm + umbilicals
      const wantOpen = (phase === 'ignite' && pT > 0.4) || phase === 'climb' || resetPhase === 'drop' || resetPhase === 'rise';
      clampOpen += ((wantOpen ? 1 : 0) - clampOpen) * Math.min(1, dt * (wantOpen ? 12 : 4));
      clamps.forEach((c) => (c.jaw.rotation.x = clampOpen * 1.15 + (wantOpen ? Math.sin(t * 30) * 0.02 * (1 - clampOpen) : 0)));
      if (wantOpen && !clampSparked && clampOpen > 0.15) { clampSparked = true; clamps.forEach((c) => { for (let i = 0; i < 10; i++) K.spawn(g, c.tip[0], c.tip[1], c.tip[2], c.dx * (1 + Math.random() * 2) + K.R(), 1 + Math.random() * 2, c.dz * (1 + Math.random() * 2) + K.R(), Math.random() < 0.5 ? 0xffd25a : 0xfff4d0, 0.5, 0.05, 6, true); }); }
      if (!wantOpen) clampSparked = false;
      const wantAway = phase === 'ignite' || phase === 'climb' || !!resetPhase || (phase === 'count' && pT > 1.0) || phase === 'hold';
      armAway += ((wantAway ? 1 : 0) - armAway) * Math.min(1, dt * 2.5);
      armP.rotation.y = -Math.PI / 4 + armAway * 1.25;
      hoses.forEach((h) => {
        const target = (phase === 'ignite' || phase === 'climb' || resetPhase) ? -1.25 : 0;
        if (target === 0 && armAway < 0.05) { h.pop += (0 - h.pop) * Math.min(1, dt * 3); h.vel = 0; }
        else { h.vel += ((target - h.pop) * 30 - h.vel * 3.2) * dt; h.pop += h.vel * dt; }
        h.hp.rotation.z = h.pop;
      });
      if (hosePopped && phase === 'ignite' && pT < 0.25 && Math.random() < 0.6) { armP.updateMatrixWorld(); hoses[0].hp.getWorldPosition(tmp); g.worldToLocal(tmp); puff(tmp.x, tmp.y - 0.9, tmp.z, 0.4, 0.6, 0.4, 0xe8e2d6, 0.9, 0.09, 2, 0.15); }

      // ------------------------------------------------ LIGHTS: down when idle, lit when working
      const working = phase !== 'ready' || craneMode !== 'rest' || !!resetPhase || !!flyer || !!M.waiting('in');
      lite += ((working || blk ? 1 : 0) - lite) * Math.min(1, dt * 2);
      cage.position.y = (phase === 'count' || phase === 'ignite' || phase === 'hold') ? cage.position.y + (0.25 - cage.position.y) * Math.min(1, dt * 3)
        : working ? 1 + (Math.sin(t * 0.35) * 0.5 + 0.5) * 3.8 : cage.position.y + (0.12 - cage.position.y) * Math.min(1, dt * 0.8);
      cageLampM.color.setHex(working ? 0xffc070 : 0x3a2a14);
      const alarm = blk || phase === 'count' || phase === 'ignite';
      beaconSpin.rotation.y += dt * (alarm ? (blk ? 11 : 8) : 0);
      beaconM.emissive.setHex(alarm ? (Math.sin(t * 9) > -0.2 ? (blk ? 0xff2010 : 0xff5020) : 0x300808) : 0);
      beaconDomeM.opacity = alarm ? 0.55 : 0.12;
      strobeMs.forEach((m, i) => m.emissive.setHex(blk && Math.sin(t * 14 + i * 1.7) > 0.4 ? 0xff2010 : 0));
      floodM.color.setHex(blk ? (Math.sin(t * 7) > 0 ? 0xff4020 : 0x501008) : lite > 0.5 ? 0xfff0c0 : 0x2a2418);
      sightM.color.setHex(lite > 0.5 ? 0x5ae0c8 : 0x1e4a40);

      // clock face, hand, nixies, bell, shipped counter
      faceM.emissive.setHex(blk ? (Math.sin(t * 6) > 0 ? 0x9a1008 : 0x3a0402) : phase === 'count' ? 0x3a2408 : 0);
      if (phase === 'count') hand.rotation.z = Math.PI * 0.5 * (1 - pT / 1.5);
      else if (phase === 'hold' || phase === 'ignite') hand.rotation.z = 0;
      else if (phase === 'charge') hand.rotation.z = Math.PI * 0.5;
      else if (phase === 'ready' || phase === 'loading') hand.rotation.z += (Math.PI * 0.5 - hand.rotation.z) * Math.min(1, dt * 3);
      const blink = Math.sin(t * 8) > 0;
      if (blk) setRow(board, blink ? 'HOLd' : '????', blink ? 1 : 0.7, blink ? 0xffffff : 0xff6040);
      else if (phase === 'count') setRow(board, 't-0' + countN, 1);
      else if (phase === 'ignite' || (phase === 'climb' && climbT < 1.5)) setRow(board, '-GO-', 1);
      else if (celebrateT >= 0) setRow(board, '5H1P', blink ? 1 : 0.6, 0xc0ffd0);
      else if (phase === 'charge') setRow(board, 'CHrG', 0.6 + Math.random() * 0.4);
      else if (phase === 'loading' || craneMode !== 'rest') setRow(board, 'LOAd', 0.8);
      else setRow(board, '----', 0.18 + lite * 0.4);
      const shipped = IRON.counters.shipped % 1000;
      if (shipped !== lastShipped) { if (lastShipped >= 0) shipFlash = 1; lastShipped = shipped; }
      shipFlash = Math.max(0, shipFlash - dt * 0.6);
      setRow(counter, String(shipped).padStart(3, '0'), 0.5 + lite * 0.25 + shipFlash * 0.5, shipFlash > 0 ? 0xd0ffd8 : 0xffffff);
      bellSwing = Math.max(0, bellSwing - dt * 1.6);
      bellP.rotation.z = Math.sin(t * 26) * 0.35 * bellSwing;
      ckLampM.emissive.setHex(blk ? (Math.sin(t * 10) > 0 ? 0xff2010 : 0) : phase === 'count' ? (Math.sin(t * 12) > 0 ? 0xffa030 : 0) : (phase === 'ignite' || phase === 'climb') ? 0x46ff8a : phase === 'charge' ? 0x5af0d8 : 0);

      // tesla coils + transformer + feed beads
      const charging = !blk && (phase === 'charge' || phase === 'count' || (phase === 'ignite' && pT < 0.35));
      const sputter = blk && !!cur;
      coils.forEach((c) => {
        c.knobM.color.setHex(charging ? (Math.random() < 0.5 ? 0xe8fffa : 0x7af0d8) : sputter ? (Math.random() < 0.25 ? 0xffc040 : 0x4a2a08) : lite > 0.5 ? 0x1e6a5a : 0x0a1e1a);
        c.haloM.color.setHex(sputter ? 0xffa020 : 0x7af0d8);
        c.haloM.opacity = charging ? 0.35 + Math.random() * 0.25 : sputter ? (Math.random() < 0.3 ? 0.35 : 0.05) : 0;
        c.windM.opacity = charging ? 0.12 + Math.random() * 0.1 : 0;
      });
      tZap -= dt;
      if (tZap <= 0) { tZap = 0.06; coils.forEach((c) => zap(c, (charging && Math.random() < (phase === 'charge' ? 0.92 : 0.7)) || (sputter && Math.random() < 0.18), charging ? (phase === 'charge' ? 1.1 : 0.8) : 0.6, sputter ? 0xffc050 : null)); }
      xfGlass.color.setHex(charging ? (Math.random() < 0.5 ? 0x9afff0 : 0x5ae0c8) : sputter ? (Math.random() < 0.3 ? 0xffa020 : 0x3a2008) : lite > 0.5 ? 0x2a8a74 : 0x0a2a22);
      xfMeter.rotation.z = charging ? -0.9 + Math.sin(t * 30) * 0.15 : blk ? -1.2 + Math.sin(t * 40) * 0.05 : 0.8;
      beads.forEach((b) => { b.b.visible = charging; if (charging) { b.u = (b.u + dt * 0.9) % 1; b.b.position.copy(b.curve.getPoint(b.u)); } });
      if (cur) cur.portM.color.setHex(charging ? 0xfff0c0 : (phase === 'count' || phase === 'ignite' || phase === 'hold') ? 0xffd890 : lite > 0.5 ? 0xb07a3a : 0x4a3018);
      if (flyer) flyer.portM.color.setHex(0xffe0a0);
      if (cur && cur.item) cur.aboardM.color.setHex(blk ? (blink ? 0xffb020 : 0x46ff8a) : 0x46ff8a);

      // the two point lights do triple duty
      if (!coilL.isDummy) {
        if (charging) { coilL.color.setHex(0x7af0d8); coilL.intensity = 1.8 + Math.random() * 1.4; coilL.position.set(0, (cur ? cur.rk.position.y : 0.8) + 1.8, 0); }
        else if (sputter) { coilL.color.setHex(0xffa030); coilL.intensity = Math.random() < 0.15 ? 1.6 : 0.2; coilL.position.set(0, 2.6, 0); }
        else { coilL.color.setHex(0xffe2b8); coilL.intensity = lite * 1.1; coilL.position.set(-0.6, 4.4, -0.6); }
      }
      const lit = phase === 'ignite' ? Math.min(1, pT / 0.7) : flyer && flyer.flyT < 3 ? Math.max(0, 1 - flyer.flyT / 3) : 0;
      if (!plumeL.isDummy) {
        if (lit > 0.02) { plumeL.color.setHex(0xff8a3a); plumeL.intensity = lit * (3.2 + Math.random() * 1.0); plumeL.position.set(0, 0.9, 0); }
        else if (blk) { plumeL.color.setHex(0xff2010); plumeL.intensity = Math.sin(t * 9) > 0 ? 3.4 : 0.5; plumeL.position.set(0.8, 2.2, 0.8); }
        else plumeL.intensity = 0;
      }
      // red flood wash on the pad while blocked
      wash.visible = washRing.visible = blk;
      if (blk) { const s = Math.sin(t * 9) > 0 ? 1 : 0.35; washM.opacity = 0.22 * s; washRingM.opacity = 0.85 * s; }

      // rim lamps: off when idle, chase when working, red strobe when blocked
      rimLamps.forEach((m, i) => {
        let c = 0;
        if (blk) c = Math.sin(t * 12 + (i % 2) * Math.PI) > 0 ? 0xff2010 : 0x300000;
        else if (phase === 'count') c = Math.floor(t * 14) % 8 === i ? 0xffc040 : 0x4a2a08;
        else if (phase === 'charge') c = (Math.sin(t * 9 + i) > 0.3) ? 0x5af0d8 : 0x103a30;
        else if (phase === 'ignite' || phase === 'climb' || resetPhase) c = 0x46ff8a;
        else if (working) c = Math.floor(t * 4) % 8 === i ? 0xffa030 : 0x2a1606;
        m.emissive.setHex(c);
      });
      trayLampM.emissive.setHex(M.waiting('in') ? (Math.sin(t * 6) > 0 ? 0x46ff8a : 0x104a20) : 0);
      clawLampM.emissive.setHex(held ? 0x46ff8a : craneMode !== 'rest' ? 0xffa030 : 0);
      tankN.rotation.z = charging ? -0.7 + Math.sin(t * 6) * 0.12 : blk ? -1.15 + Math.sin(t * 40) * 0.05 : phase === 'count' ? -0.4 : lite > 0.5 ? 0.4 : 0.9;

      // ------------------------------------------------ TRAIL + SMOKE COLUMN + HEAT
      if (flyer) {
        const top = Math.min(60, flyer.rk.position.y - 0.4); trailTop = top;
        trailA = Math.min(1, trailA + dt * 3); colA = Math.min(1, colA + dt * 0.8); colTop = Math.max(colTop, Math.min(top, 16));
        heat = Math.min(1, heat + dt * 2);
      } else { trailA = Math.max(0, trailA - dt * 0.45); colA = Math.max(0, colA - dt * 0.12); heat = Math.max(0, heat - dt * 0.14); }
      if (phase === 'ignite') heat = Math.min(1, heat + dt * 1.5);
      const tBase = 1.0;
      trail.visible = trailCore.visible = trailA > 0.01 && trailTop > tBase + 0.5;
      if (trail.visible) {
        const h = trailTop - tBase; trail.scale.set(1 + (1 - trailA) * 0.8, h, 1 + (1 - trailA) * 0.8); trail.position.set(0, tBase + h / 2, 0); trailCore.scale.set(1, h, 1); trailCore.position.copy(trail.position);
        trailM.opacity = 0.45 * trailA * (0.85 + Math.random() * 0.15); trailCoreM.opacity = 0.75 * trailA * trailA;
      }
      column.visible = colA > 0.01 && colTop > 1.5;
      if (column.visible) { const h = colTop; column.scale.set(1 + (1 - colA) * 1.8, h, 1 + (1 - colA) * 1.8); column.position.set(Math.sin(t * 0.3) * 0.2 * (1 - colA), h / 2 + 0.4, 0); colM.opacity = 0.32 * colA; }
      heatMs.forEach((m) => (m.opacity = heat * (0.5 + Math.sin(t * 11) * 0.08 + Math.random() * 0.06)));

      // ------------------------------------------------ PARTICLES
      if (shockT >= 0) { shockT += dt; shock.visible = true; const k = shockT / 0.8; shock.scale.setScalar(0.6 + k * 4); shock.material.opacity = 0.9 * (1 - k); if (k >= 1) { shockT = -1; shock.visible = false; } }
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = 0.05;
        const tx = TANK[0] + 0.45, tz = TANK[1];
        if (blk) {
          puff(tx, 2.35, tz, 0.5, 2.0, 0.2, 0xf0ece4, 1.6, 0.12, 3, 0.2, -0.12);
          if (cur) for (const a of [Math.PI / 2, -Math.PI / 2]) { const p = rkPoint(cur, Math.sin(a) * 0.75, 1.3, Math.cos(a) * 0.75); const d = rootDirLocal(a); puff(p.x, p.y, p.z, d[0] * 2.4, 1.2, d[1] * 2.4, 0xf4f0ea, 1.5, 0.12, 3, 0.15, -0.14); }
        } else if (charging) { if (Math.random() < 0.7) puff(tx, 2.35, tz, 0.4, 1.6, 0.2, 0xd8d0c4, 1.3, 0.1, 2, 0.15); }
        else if (lite > 0.5 && Math.random() < 0.12) puff(tx, 2.35, tz, 0.2, 0.9, 0.1, 0xb8ac98, 1.2, 0.08, 1, 0.1);
        if (phase === 'count' && Math.random() < 0.7) { const s = Math.random() < 0.5 ? 1 : -1; puff(s * 2.0 * C45, 0.55, -s * 2.0 * C45, s * 0.6, 0.6, -s * 0.6, 0xc8beae, 1.1, 0.09, 2, 0.15); }
        // smoke BILLOWING out of both trench ends: dense while the rocket grinds off the pad
        if (lit > 0.05) {
          const dense = phase === 'ignite' || (flyer && flyer.flyT < 1.6) ? 3 : 1;
          for (let i = 0; i < dense; i++) {
            const s = Math.random() < 0.5 ? 1 : -1, sp = 2.4 + Math.random() * 2.6;
            puff(s * 1.6 * C45, 0.65, -s * 1.6 * C45, s * sp * C45, 0.5 + Math.random() * 0.9, -s * sp * C45, Math.random() < 0.25 ? 0xffa040 : (Math.random() < 0.5 ? 0x9a9284 : 0x6e665c), 2.0, 0.13, 3, 0.3, -0.07);
          }
          if (Math.random() < 0.5) K.spawn(g, K.R() * 0.6, 0.6, K.R() * 0.6, K.R() * 2, 0.3, K.R() * 2, 0xffd27a, 0.5, 0.06, 1, true);
        }
        // lingering exhaust column along the flight path
        if (flyer && flyer.flyT < 4.5) {
          const y = flyer.rk.position.y - 0.7;
          puff(0, y, 0, 0, -0.3, 0, Math.random() < 0.3 ? 0xffb050 : 0xa49c8e, 3.2, 0.14, 2, 0.3, -0.03);
          if (y < 14) puff(K.R() * 0.6, y, K.R() * 0.6, K.R() * 0.4, 0.05, K.R() * 0.4, 0x8a8276, 4.5, 0.16, 1, 0.4, -0.02);
        }
        // embers + heat shimmer from the trench after the burn
        if (heat > 0.15 && Math.random() < heat) { const s = Math.random() < 0.5 ? 1 : -1, u = 1.3 + Math.random() * 1.3; K.spawn(g, s * u * C45 + K.R() * 0.3, 0.5, -s * u * C45 + K.R() * 0.3, K.R() * 0.2, 0.5 + Math.random() * 0.6, K.R() * 0.2, Math.random() < 0.6 ? 0xff8a2a : 0xffd27a, 1.2, 0.04, -0.05, true); }
        if (resetPhase === 'rise' && Math.random() < 0.8) puff(K.R() * 2.2, 0.3, K.R() * 2.2, K.R() * 0.4, 0.9, K.R() * 0.4, 0xb8ac98, 1.6, 0.1, 2, 0.3);
        if (resetPhase === 'drop' && Math.random() < 0.6) puff(K.R() * 1.4, 0.4, K.R() * 1.4, K.R() * 0.3, 1.2, K.R() * 0.3, 0x6e665a, 1.8, 0.11, 2, 0.3);
      }
      // shipped: signal flare from the clock tower + burst high over the pad
      if (celebrateT >= 0) {
        const c0 = celebrateT; celebrateT += dt;
        const ckx = CLOCK[0], ckz = CLOCK[1];
        if (c0 < 0.6) { const k = c0 / 0.6; K.spawn(g, ckx + K.R() * 0.1, 4.0 + k * 5.0, ckz + K.R() * 0.1, K.R() * 0.3, -0.5, K.R() * 0.3, 0xffd890, 0.6, 0.07, 0, true); }
        if (c0 < 0.6 && celebrateT >= 0.6) {
          for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.57, sp = 2 + Math.random() * 2.5; K.spawn(g, ckx, 9.0, ckz, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 0.5, Math.sin(a) * Math.cos(b) * sp, i % 3 ? 0x46ff8a : (i % 2 ? 0xffd27a : 0xffffff), 1.3 + Math.random() * 0.6, 0.09, 2.2, true); }
        }
        if (celebrateT > 2.6) celebrateT = -1;
      }

      // ------------------------------------------------ STATE + HUD DETAIL
      const id = (cur && cur.item) ? cur.item.label() : held ? held.label() : (flyer && flyer.item) ? flyer.item.label() : '';
      let st = 'WORKING', det = '';
      if (blk && (phase === 'hold' || phase === 'count')) det = id + ' · T-0 · awaiting your merge';
      else if (blk && (phase === 'climb' || flyer) && !resetPhase) det = 'held before reset';
      else if (blk && phase === 'charge') det = id + ' · charge held';
      else if (blk && (phase === 'loading' || craneMode !== 'rest')) det = (id || 'PR') + ' · loading held';
      else if (blk && phase === 'ready') det = 'pad held';
      else if (phase === 'loading') det = id + (seal > 0 ? ' · sealing the hatch' : ' · loading the rocket');
      else if (phase === 'charge') det = id + ' · charging the coils';
      else if (phase === 'count') det = id + ' · T-' + countN;
      else if (phase === 'ignite') det = id + ' · ignition';
      else if (phase === 'climb' && flyer && flyer.item) det = flyer.item.label() + ' · liftoff!';
      else if (resetPhase) det = held ? held.label() + ' · waiting for the next rocket' : 'shipped · fresh rocket rising';
      else if (phase === 'climb') det = 'shipped · clearing the pad';
      else if (craneMode === 'fetch') det = (held ? held.label() : 'PR') + ' · crane picking up';
      else if (craneMode === 'hold' || craneMode === 'insert') det = (held ? held.label() : id) + ' · loading the rocket';
      else if (celebrateT >= 0) det = 'shipped! · pad clear';
      else { st = 'IDLE'; det = 'pad clear — waiting for a PR'; }
      M.setState(st, det);
      lamp.set(M.stateShown, t);
      caution.update(t, dt, M.stateShown);
    } };
    // rocket-local side direction (angle a around the hull) -> g-local xz unit vector
    function rootDirLocal(a) { const x = Math.sin(a), z = Math.cos(a); const c = Math.cos(THETA), s = Math.sin(THETA); return [x * c + z * s, -x * s + z * c]; }
  });
})();
