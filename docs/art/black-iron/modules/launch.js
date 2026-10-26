// =====================================================================
// LAUNCH PAD (Black Iron line) — LAUNCH agent
// Every green 'pass' capsule: the jib crane plucks it off the intake tray, swings it to the rocket's
// cargo hatch and feeds it in; tesla coils arc into the hull (fed from the aether transformer on the
// conduit socket); the clock tower + nixie tubes count 3-2-1 (merge decision point: holds at T-0);
// liftoff blows smoke out both ends of the flame trench; M.consume() fires when it's high and a signal
// flare bursts over the pad. Meanwhile the scorched pedestal drops into the silo and a fresh rocket
// rises on it. Two rockets alternate (one flying, one on the pad). The crane pre-fetches the next PR.
// =====================================================================
(function () {
  'use strict';
  IRON.machine('launch', function (K, M) {
    const T = K.THREE;
    const C45 = Math.SQRT1_2;
    // ---------- palette (Black Iron, lifted ~30%) ----------
    const C = {
      soot: 0x1e1915, iron: 0x3c342d, ironM: 0x302924, ironL: 0x5e544a,
      brass: 0xb08838, brassD: 0x6e5022, brassL: 0xdcb060, copper: 0xa65a32, copperD: 0x6e3820,
      verd: 0x3f8a72, oxide: 0x7a3020, oxideD: 0x52201a, hazard: 0xe0a422, cream: 0xe6d6a8,
      teal: 0x7af0d8, ember: 0xff7a2a
    };
    const MT = {
      soot: K.mat(C.soot), iron: K.mat(C.iron, { shine: 24, spec: 0x2a2a30 }), ironM: K.mat(C.ironM, { shine: 16, spec: 0x222228 }), ironL: K.mat(C.ironL, { shine: 30, spec: 0x3a3a40 }),
      brass: K.mat(C.brass, { shine: 40, spec: 0x806030 }), brassD: K.mat(C.brassD, { shine: 22, spec: 0x3a2a10 }), brassL: K.mat(C.brassL, { shine: 55, spec: 0xa08048 }),
      copper: K.mat(C.copper, { shine: 36, spec: 0x704028 }), copperD: K.mat(C.copperD, { shine: 18, spec: 0x3a1a0a }),
      verd: K.mat(C.verd), oxide: K.mat(C.oxide, { shine: 14, spec: 0x2a1410 }), oxideD: K.mat(C.oxideD), hazard: K.mat(C.hazard),
      cream: K.mat(C.cream), rubber: K.mat(0x17130f), insul: K.mat(0x3a2418, { shine: 40, spec: 0x553322 }),
      rust: K.mat(0x7a3a1a), oil: K.mat(0x0a0a0d, { shine: 90, spec: 0x6a5a8a }), grime: K.mat(0x080605, { op: 0.45, depthWrite: false }),
      glass: K.mat(0xbfe8dc, { op: 0.25, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
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
    function deckTex() { // riveted iron deck plates with scorch
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
    function gauge(p, x, y, z, r, ry) { // faces +z of its group
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
    const clamp01 = (k) => Math.max(0, Math.min(1, k));
    const V = () => new T.Vector3();

    const g = K.group();
    const S = K.group(g); // static: baked at the end

    // =====================================================================
    // LAYOUT (local): rocket on the silo at the origin. Trench runs screen-horizontal (local x+z = 0).
    // =====================================================================
    const HOLE = 1.18;               // silo opening radius
    const PIVOT = [-0.6, 2.1];       // loading jib crane
    const TRAY = [-0.6, 2.9];        // = launch.in port
    const COILS = [[-1.9, 0.6], [1.9, -0.6]];
    const GANTRY = [-1.5, -1.5];
    const CLOCK = [1.25, -2.35];
    const TANK = [-0.15, -2.2];
    const XFMR = [-3.12, 0.35];      // transformer box; conduit socket flange at local [-3.6, 0.35, 0.35]
    const BASE_Y = 0.8;              // rocket base (pedestal top) at rest
    // rocket faces its cargo hatch (+z) toward the crane
    const toPv = new T.Vector2(PIVOT[0], PIVOT[1]); const pvLen = toPv.length();
    const HD = [PIVOT[0] / pvLen, PIVOT[1] / pvLen];                         // hatch outward dir (local xz)
    const THETA = Math.atan2(HD[0], HD[1]);                                 // rocket rotation.y
    const HATCH_Y = 1.75;                                                    // capsule origin height on the rocket
    const CARGO_OUT = 0.95, CARGO_IN = 0.16;                                 // cargo cradle radial travel

    // ---------- PAD: octagonal stone base ring with the silo opening, iron deck, hazard rim ----------
    const stone = K.mat(0xffffff, { map: stoneTex(), double: true });
    K.lathe([[HOLE, -1.3], [HOLE, 0.36], [2.42, 0.36], [2.56, 0.3], [2.72, 0.02], [2.72, -0.05]], stone, 8, 0, 0, 0, S).rotation.y = Math.PI / 8;
    const deck = K.mat(0xffffff, { map: deckTex(), double: true });
    K.lathe([[HOLE + 0.02, 0.36], [HOLE + 0.02, 0.47], [2.28, 0.47], [2.32, 0.36]], deck, 8, 0, 0, 0, S).rotation.y = Math.PI / 8;
    K.torus(HOLE + 0.06, 0.07, MT.brassD, 4, 24, 0, 0.48, 0, S).rotation.x = Math.PI / 2;
    K.torus(2.3, 0.06, MT.ironL, 4, 8, 0, 0.47, 0, S).rotation.set(Math.PI / 2, 0, Math.PI / 8);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; K.box(0.28, 0.05, 0.12, i % 2 ? MT.soot : MT.hazard, Math.cos(a) * 2.12, 0.49, Math.sin(a) * 2.12, S).rotation.y = -a; }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.06, 0.06, 0.06, MT.brassL, Math.cos(a) * 2.38, 0.5, Math.sin(a) * 2.38, S); }
    // silo void (shows when the pedestal is down) + silo wall rivets
    const voidDisk = K.cyl(HOLE - 0.02, HOLE - 0.02, 0.02, K.glow(0x050302), 24, 0, 0.13, 0, g); voidDisk.visible = false;
    const voidGlow = K.torus(HOLE - 0.1, 0.05, K.glow(0xff6a20, 0.6, true), 4, 24, 0, 0.16, 0, g); voidGlow.rotation.x = Math.PI / 2; voidGlow.visible = false;
    // FLAME TRENCH along local (1,0,-1): two arms from the silo to the rim, grated, with deflector lips
    const TR = K.group(S); TR.rotation.y = Math.PI / 4; // local +x of TR = machine (cos45, -sin45)
    for (const sgn of [-1, 1]) {
      const cx = sgn * (HOLE + 2.6) / 2, len = 2.62 - HOLE + 0.2;
      K.box(len, 0.06, 0.82, MT.dark, cx, 0.46, 0, TR);
      for (let i = 0; i < 7; i++) K.box(0.06, 0.05, 0.8, MT.ironL, sgn * (HOLE + 0.15 + i * 0.2), 0.5, 0, TR);
      K.box(len, 0.03, 0.06, MT.ironL, cx, 0.5, 0.0, TR);
      for (const zz of [-0.47, 0.47]) { K.box(len, 0.16, 0.1, MT.rust, cx, 0.53, zz, TR); K.box(len, 0.04, 0.12, MT.brassD, cx, 0.62, zz, TR); }
      // deflector lip at the rim end, and a scorch fan on the deck beyond
      const lip = K.box(0.12, 0.42, 0.9, MT.oxideD, sgn * 2.62, 0.6, 0, TR); lip.rotation.z = sgn * 0.5;
      const sc = K.sph(1, MT.scorch, sgn * 3.1, 0.12, 0, TR, 12, 4); sc.scale.set(0.9, 0.02, 0.7); sc.castShadow = false;
    }
    // grime + oil on the pad
    for (const [x, z, sx, sz] of [[1.75, 0.35, 0.32, 0.2], [-1.45, -0.95, 0.3, 0.22], [0.75, -1.55, 0.28, 0.18]]) { const p = K.sph(1, K.mat(0x1c1a20, { shine: 90, spec: 0x8a7aa8 }), x, 0.49, z, S, 12, 4); p.scale.set(sx, 0.012, sz); p.castShadow = false; }
    for (let i = 0; i < 10; i++) { const a = K.rnd() * 6.28, rr = 1.3 + K.rnd() * 0.8; const d = K.box(0.3 + K.rnd() * 0.5, 0.01, 0.2 + K.rnd() * 0.3, MT.grime, Math.cos(a) * rr, 0.485, Math.sin(a) * rr, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }

    // rim lamps (8): idle amber, chase on countdown, teal on charge, green on liftoff, red strobe when blocked
    const rimLamps = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 2.5, z = Math.sin(a) * 2.5;
      K.cyl(0.09, 0.11, 0.1, MT.iron, 8, x, 0.42, z, S);
      const m = K.mat(0x3a2408, { e: 0 }); const l = K.sph(0.08, m, x, 0.52, z, g, 8, 6); l.castShadow = false;
      rimLamps.push(m);
    }

    // ---------- PEDESTAL / SILO ELEVATOR ----------
    const lifter = K.group(g, 0, 0, 0);
    const LS = K.group(lifter);
    K.cyl(1.1, 1.1, 0.33, MT.iron, 16, 0, BASE_Y - 0.165, 0, LS);
    K.cyl(1.0, 1.05, 1.9, MT.ironM, 16, 0, BASE_Y - 1.25, 0, LS);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.26, 0.08, 0.06, i % 2 ? MT.soot : MT.hazard, Math.cos(a) * 1.08, BASE_Y - 0.06, Math.sin(a) * 1.08, LS).rotation.y = -a + Math.PI / 2; }
    K.cyl(0.95, 0.95, 0.04, K.mat(0xffffff, { map: deckTex() }), 16, 0, BASE_Y + 0.005, 0, LS);
    for (let i = 0; i < 6; i++) { const b = K.box(1.8, 0.03, 0.08, MT.ironL, 0, BASE_Y + 0.03, 0, LS); b.rotation.y = i * Math.PI / 6; }
    rivetRing(LS, 1.02, BASE_Y - 0.25, 18);
    const pedScorch = K.cyl(0.75, 0.75, 0.01, K.mat(0x14100c, { op: 0.3, depthWrite: false }), 16, 0, BASE_Y + 0.04, 0, LS); pedScorch.castShadow = false;
    K.bake(LS);

    // ---------- ROCKETS (two, they alternate) ----------
    function makeRocket() {
      const rk = K.group(g, 0, BASE_Y, 0); rk.rotation.y = THETA;
      const st = K.group(rk);
      const prof = [[0.0, 0], [0.44, 0.02], [0.54, 0.3], [0.58, 1.0], [0.58, 2.25], [0.52, 2.85], [0.4, 3.35], [0.22, 3.8], [0.05, 4.05]];
      K.lathe(prof.slice(0, 6), K.mat(0x8c6c34, { shine: 34, spec: 0x6a5028 }), 18, 0, 0, 0, st);
      K.lathe(prof.slice(5), K.mat(0x96502c, { shine: 30, spec: 0x603820 }), 18, 0, 0, 0, st);
      // soot skirt + exhaust scorching up from the nozzle
      K.lathe([[0.46, 0.0], [0.56, 0.3], [0.595, 0.75]], K.mat(0x1a1410, { op: 0.55, depthWrite: false, double: true }), 18, 0, 0.0, 0, st);
      K.cyl(0.03, 0.05, 0.6, MT.brassL, 6, 0, 4.3, 0, st); K.sph(0.07, MT.brassL, 0, 4.62, 0, st, 6, 4);
      for (const y of [0.35, 1.0, 1.55, 2.2]) { K.torus(0.585, 0.035, MT.brassD, 4, 22, 0, y, 0, st).rotation.x = Math.PI / 2; rivetRing(st, 0.6, y + 0.08, 16); }
      K.torus(0.53, 0.04, MT.brassD, 4, 22, 0, 2.85, 0, st).rotation.x = Math.PI / 2;
      // soot streaks + oil weep down the hull
      for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; const s = K.box(0.05, 0.5 + (i % 3) * 0.25, 0.01, MT.grime, Math.sin(a) * 0.585, 0.4 + (i % 3) * 0.2, Math.cos(a) * 0.585, st); s.rotation.y = a; s.castShadow = false; }
      // fins (between the clamps), with brass leading edges
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2, fin = K.group(st); fin.rotation.y = a;
        const f = K.box(0.07, 1.05, 0.68, MT.copperD, 0, 0.55, 0.82, fin); f.rotation.x = 0.28;
        K.box(0.09, 0.08, 0.62, MT.brass, 0, 0.02, 0.88, fin);
        K.box(0.08, 0.9, 0.06, MT.brassL, 0, 0.62, 1.12, fin).rotation.x = 0.28;
      }
      // nozzle
      K.lathe([[0.2, 0], [0.3, -0.32], [0.38, -0.4]], MT.ironL, 14, 0, 0.04, 0, st);
      K.torus(0.36, 0.03, MT.brassD, 4, 14, 0, -0.34, 0, st).rotation.x = Math.PI / 2;
      // cargo hatch frame on +z (faces the crane)
      const hy = HATCH_Y + 0.2;
      K.box(0.5, 0.56, 0.06, MT.brassD, 0, hy, 0.57, st);
      K.box(0.36, 0.42, 0.06, MT.dark, 0, hy, 0.59, st);
      for (const [x, y] of [[-0.21, 0.24], [0.21, 0.24], [-0.21, -0.24], [0.21, -0.24]]) K.box(0.05, 0.05, 0.05, MT.brassL, x, hy + y, 0.61, st);
      // portholes (3) + the PR-aboard window above the hatch
      const portM = K.glow(0xb07a3a);
      for (const [y, a] of [[2.55, 0.9], [2.55, -0.9], [1.25, Math.PI]]) {
        const pg = K.group(st, Math.sin(a) * 0.57, y, Math.cos(a) * 0.57); pg.rotation.y = a;
        K.cyl(0.15, 0.15, 0.06, MT.brassL, 12, 0, 0, 0, pg).rotation.x = Math.PI / 2;
        K.cyl(0.1, 0.1, 0.08, portM, 12, 0, 0, 0.01, pg).rotation.x = Math.PI / 2;
      }
      const aboardM = K.glow(0x14301e);
      const ab = K.group(st, 0, hy + 0.55, 0.555);
      K.cyl(0.13, 0.13, 0.06, MT.brassL, 12, 0, 0, 0, ab).rotation.x = Math.PI / 2;
      K.cyl(0.09, 0.09, 0.08, aboardM, 12, 0, 0, 0.012, ab).rotation.x = Math.PI / 2;
      // stencil band
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; const s = K.box(0.12, 0.08, 0.01, i % 2 ? MT.soot : MT.hazard, Math.sin(a) * 0.59, 0.72, Math.cos(a) * 0.59, st); s.rotation.y = a; }
      K.bake(st);
      // hatch door (hinged at its top edge) + the cargo cradle that pulls the capsule in
      const hinge = K.group(rk, 0, hy + 0.22, 0.6);
      K.box(0.36, 0.43, 0.05, MT.copper, 0, -0.215, 0, hinge);
      K.box(0.3, 0.05, 0.06, MT.brassL, 0, -0.08, 0.02, hinge); K.box(0.06, 0.08, 0.07, MT.brassL, 0.13, -0.33, 0.02, hinge);
      const cargo = K.group(rk, 0, HATCH_Y, CARGO_OUT);
      const cradle = K.box(0.3, 0.05, 0.62, MT.ironL, 0, -0.02, 0, cargo); cradle.visible = false;
      // plume
      const plume = K.group(rk, 0, -0.38, 0);
      const fl1 = K.cone(0.35, 1.7, K.glow(0xffd27a, 0.95, true), 10, 0, -0.85, 0, plume); fl1.rotation.x = Math.PI;
      const fl2 = K.cone(0.2, 1.05, K.glow(0xffffff, 1, true), 8, 0, -0.52, 0, plume); fl2.rotation.x = Math.PI;
      const fl3 = K.cone(0.55, 2.8, K.glow(0xff6a20, 0.5, true), 10, 0, -1.4, 0, plume); fl3.rotation.x = Math.PI;
      const fl4 = K.cone(0.42, 1.3, K.glow(0x7af0d8, 0.35, true), 10, 0, -0.65, 0, plume); fl4.rotation.x = Math.PI;
      plume.visible = false;
      return { rk, hinge, cargo, cradle, plume, portM, aboardM, item: null, open: 0, slide: 0, flyT: -1 };
    }
    const rockets = [makeRocket(), makeRocket()];
    let cur = rockets[0], spare = rockets[1], flyer = null;
    spare.rk.visible = false;

    // ---------- HOLD-DOWN CLAMPS (4, between the fins) ----------
    const clamps = [];
    for (let i = 0; i < 4; i++) {
      const a = THETA + i * Math.PI / 2; // directions in machine local: (sin a, cos a)
      const dx = Math.sin(a), dz = Math.cos(a);
      const cg = K.group(g, dx * 1.45, 0.47, dz * 1.45); cg.rotation.y = a;   // local +z = outward
      K.box(0.36, 0.22, 0.36, MT.iron, 0, 0.11, 0, cg); K.box(0.4, 0.05, 0.4, MT.brassD, 0, 0.23, 0, cg);
      const piston = K.cyl(0.05, 0.05, 0.5, MT.ironL, 6, 0, 0.35, 0.2, cg); piston.rotation.x = 0.5;
      const jaw = K.group(cg, 0, 0.22, 0);
      K.box(0.16, 0.78, 0.16, MT.oxide, 0, 0.39, 0, jaw);
      K.box(0.16, 0.14, 0.84, MT.oxide, 0, 0.74, -0.38, jaw);
      K.box(0.2, 0.22, 0.1, MT.brass, 0, 0.66, -0.8, jaw);
      K.box(0.17, 0.06, 0.86, MT.hazard, 0, 0.83, -0.38, jaw);
      clamps.push(jaw);
    }

    // ---------- GANTRY TOWER (back corner) with lift cage, service arm, beacon, floodlight ----------
    const GT = K.group(S, GANTRY[0], 0.47, GANTRY[1]);
    const GH = 6.3;
    const oxide = MT.oxide, oxD = MT.oxideD;
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) { K.box(0.14, GH, 0.14, oxide, sx, GH / 2, sz, GT); K.box(0.26, 0.12, 0.26, MT.ironM, sx, 0.06, sz, GT); }
    for (let y = 0.6; y < GH - 0.2; y += 0.75) {
      for (const [x, z, ry] of [[0, 0.45, 0], [0, -0.45, 0], [0.45, 0, Math.PI / 2], [-0.45, 0, Math.PI / 2]]) {
        const br = K.box(0.06, 1.06, 0.06, oxD, x, y + 0.36, z, GT); br.rotation.set(0, ry, ((Math.round(y / 0.75)) % 2 ? 1 : -1) * 0.72);
        K.box(0.92, 0.07, 0.07, oxD, x, y, z, GT).rotation.y = ry;
      }
    }
    K.box(1.25, 0.1, 1.25, MT.ironM, 0, GH, 0, GT);
    for (const s of [-1, 1]) { K.box(0.04, 0.42, 1.25, MT.ironL, s * 0.6, GH + 0.21, 0, GT); K.box(1.25, 0.42, 0.04, MT.ironL, 0, GH + 0.21, s * 0.6, GT); }
    // ladder up the front-left face
    for (let y = 0.3; y < GH; y += 0.22) K.box(0.03, 0.03, 0.4, MT.ironL, -0.53, y, 0, GT);
    for (const z of [-0.2, 0.2]) K.box(0.03, GH, 0.03, MT.ironL, -0.55, GH / 2, z, GT);
    // floodlight on the top deck, aimed at the rocket
    const fl = K.group(GT, 0.45, GH + 0.45, 0.45); fl.rotation.y = Math.PI / 4;
    K.box(0.42, 0.3, 0.22, MT.iron, 0, 0, 0, fl); const floodM = K.glow(0x5a4a30); K.box(0.36, 0.24, 0.04, floodM, 0, 0, 0.12, fl);
    // dynamic gantry bits
    const gtd = K.group(g, GANTRY[0], 0.47, GANTRY[1]);
    const beaconM = K.mat(0x401010, { e: 0 });
    const beaconSpin = K.group(gtd, 0, GH + 0.62, 0); K.box(0.2, 0.14, 0.07, beaconM, 0.06, 0, 0, beaconSpin);
    K.sph(0.15, K.glow(0xff3020, 0.3), 0, GH + 0.62, 0, gtd, 8, 6).castShadow = false;
    const strobeMs = []; for (const [x, z] of [[-0.62, -0.62], [0.62, 0.62]]) { const m = K.mat(0x401010, { e: 0 }); K.sph(0.07, m, x, GH + 0.45, z, gtd, 6, 4); strobeMs.push(m); }
    const cage = K.group(gtd, 0, 1, 0);
    K.box(0.7, 0.05, 0.7, MT.brassD, 0, 0, 0, cage); K.box(0.7, 0.05, 0.7, MT.brass, 0, 0.62, 0, cage);
    for (const sx of [-0.33, 0.33]) for (const sz of [-0.33, 0.33]) K.box(0.04, 0.62, 0.04, MT.brass, sx, 0.31, sz, cage);
    const cageLamp = K.sph(0.06, K.glow(0xffc070), 0, 0.5, 0, cage, 6, 4); cageLamp.castShadow = false;
    // service arm (points from the gantry at the rocket; swings away at ignition)
    const armP = K.group(gtd, 0.45, 3.4, 0.45); armP.rotation.y = -Math.PI / 4;
    const sarm = K.group(armP);
    K.box(0.95, 0.14, 0.2, MT.ironL, 0.47, 0, 0, sarm); K.box(0.95, 0.04, 0.06, MT.hazard, 0.47, 0.09, 0.07, sarm);
    K.tube([[0, -0.1, 0.05], [0.5, -0.32, 0.05], [0.95, -0.12, 0.05]], 0.05, MT.rubber, sarm, 10, 5);
    K.box(0.12, 0.26, 0.26, MT.brassD, 0.95, 0, 0, sarm);

    // ---------- BOILER TANK (back) ----------
    const TK = K.group(S, TANK[0], 0.47, TANK[1]);
    for (const x of [-0.55, 0.55]) { K.box(0.2, 0.42, 0.9, MT.iron, x, 0.21, 0, TK); K.box(0.26, 0.05, 0.96, MT.brassD, x, 0.43, 0, TK); }
    const tb = K.cyl(0.44, 0.44, 1.7, MT.copper, 16, 0, 0.82, 0, TK); tb.rotation.z = Math.PI / 2;
    for (const x of [-0.86, 0.86]) { const cp = K.sph(0.44, MT.copperD, x, 0.82, 0, TK, 14, 8); cp.scale.x = 0.36; }
    for (const x of [-0.5, 0, 0.5]) { const b = K.cyl(0.46, 0.46, 0.07, MT.brassD, 16, x, 0.82, 0, TK); b.rotation.z = Math.PI / 2; }
    K.box(1.2, 0.12, 0.05, K.glow(0x2a6a5a), 0, 0.92, 0.44, TK);
    K.cyl(0.07, 0.07, 0.5, MT.brass, 8, 0.45, 1.4, 0.0, TK); K.cyl(0.1, 0.07, 0.18, MT.brassL, 8, 0.45, 1.7, 0, TK);
    for (let i = 0; i < 4; i++) { const s = K.box(0.03, 0.3, 0.01, MT.grime, -0.6 + i * 0.4, 0.6, 0.445, TK); s.castShadow = false; }
    const tankN = gauge(g, TANK[0] + 0.0, 0.47 + 1.33, TANK[1] + 0.3, 0.15, 0); tankN.parent.rotation.x = -0.4;
    K.tube([[TANK[0] - 0.7, 1.35, TANK[1] + 0.2], [-1.0, 1.4, -1.2], [-0.62, 1.3, -0.75], [-0.45, 1.05, -0.5]], 0.07, MT.copper, S, 16, 6);

    // ---------- CLOCK TOWER + NIXIE COUNTDOWN (right-back), faces the camera ----------
    const CK = K.group(S, CLOCK[0], 0.47, CLOCK[1]); CK.rotation.y = Math.PI / 4;
    K.box(0.62, 0.3, 0.62, MT.iron, 0, 0.15, 0, CK);
    K.box(0.52, 1.9, 0.52, K.mat(0x4a3424), 0, 1.25, 0, CK);
    for (const y of [0.4, 1.2, 2.0]) K.box(0.56, 0.06, 0.56, MT.brassD, 0, y, 0, CK);
    K.box(0.64, 0.14, 0.64, MT.brassD, 0, 2.25, 0, CK);
    K.cyl(0.46, 0.46, 0.08, MT.cream, 18, 0, 2.72, 0.22, CK).rotation.x = Math.PI / 2;
    K.torus(0.47, 0.06, MT.brass, 6, 20, 0, 2.72, 0.26, CK);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.04, i % 3 ? 0.06 : 0.11, 0.02, MT.soot, Math.sin(a) * 0.36, 2.72 + Math.cos(a) * 0.36, 0.27, CK).rotation.z = -a; }
    K.box(0.3, 0.05, 0.02, K.mat(0xc0301a), 0.0, 2.95, 0.27, CK).rotation.z = 0; // red "T-0" mark at 12
    K.cone(0.2, 0.32, MT.brassD, 6, 0, 3.3, 0, CK);
    // nixie housing below the face
    K.box(0.5, 0.36, 0.2, MT.brassD, 0, 1.62, 0.3, CK);
    for (const x of [-0.12, 0.12]) { const tg = K.cyl(0.085, 0.085, 0.3, MT.glass, 10, x, 1.64, 0.42, CK); tg.castShadow = false; }
    const ckd = K.group(g, CLOCK[0], 0.47, CLOCK[1]); ckd.rotation.y = Math.PI / 4;
    const hand = K.group(ckd, 0, 2.72, 0.28); K.box(0.045, 0.36, 0.02, K.mat(0x8a1a10), 0, 0.17, 0, hand); K.box(0.07, 0.07, 0.03, MT.brassL, 0, 0, 0.01, hand);
    const bellP = K.group(ckd, 0, 3.55, 0); K.cone(0.15, 0.2, MT.brassL, 8, 0, -0.08, 0, bellP); K.box(0.04, 0.12, 0.04, MT.iron, 0, 0.05, 0, bellP);
    const ckLampM = K.mat(0x2a1a10, { e: 0 }); K.sph(0.09, ckLampM, 0.0, 2.02, 0.3, ckd, 8, 6);
    // nixie digit textures (orange glow, pixel 7-segment)
    const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd', '-': 'g', ' ': '' };
    const digitTex = {};
    Object.keys(SEG).forEach((ch) => {
      digitTex[ch] = K.canvasTex(10, 16, (c) => {
        c.clearRect(0, 0, 10, 16);
        const seg = { a: [2, 1, 6, 2], b: [7, 2, 2, 6], c: [7, 8, 2, 6], d: [2, 13, 6, 2], e: [1, 8, 2, 6], f: [1, 2, 2, 6], g: [2, 7, 6, 2] };
        c.fillStyle = 'rgba(255,120,30,0.18)'; for (const k in seg) { const s = seg[k]; c.fillRect(s[0], s[1], s[2], s[3]); }
        c.fillStyle = '#ffb050'; for (const k of SEG[ch]) { const s = seg[k]; c.fillRect(s[0], s[1], s[2], s[3]); }
      });
    });
    const nixies = [-0.12, 0.12].map((x) => {
      const m = new T.MeshBasicMaterial({ map: digitTex['-'], transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      const pl = new T.Mesh(new T.PlaneGeometry(0.14, 0.22), m); pl.position.set(x, 1.64, 0.43); ckd.add(pl);
      return { m, cur: '-' };
    });
    function nixie(str, bright) { str.split('').forEach((ch, i) => { const n = nixies[i]; if (n.cur !== ch) { n.cur = ch; n.m.map = digitTex[ch] || digitTex[' ']; n.m.needsUpdate = true; } n.m.opacity = bright; }); }

    // ---------- TESLA COILS (2) fed by the AETHER TRANSFORMER on the conduit socket ----------
    const coils = COILS.map(([x, z]) => {
      const cg = K.group(S, x, 0.47, z);
      K.cyl(0.32, 0.4, 0.34, MT.ironM, 10, 0, 0.17, 0, cg); band(cg, 0.36, 0.3, MT.brassD, 0.06);
      for (let i = 0; i < 4; i++) K.cyl(0.2 - i * 0.012, 0.22 - i * 0.012, 0.12, MT.insul, 10, 0, 0.42 + i * 0.13, 0, cg);
      K.cyl(0.15, 0.17, 1.45, K.mat(0x2a1a10), 10, 0, 1.4, 0, cg);
      for (let i = 0; i < 10; i++) K.torus(0.18, 0.032, MT.copper, 4, 12, 0, 0.82 + i * 0.13, 0, cg).rotation.x = Math.PI / 2;
      const top = K.torus(0.33, 0.12, MT.brassL, 6, 16, 0, 2.2, 0, cg); top.rotation.x = Math.PI / 2;
      K.cyl(0.05, 0.05, 0.22, MT.brass, 6, 0, 2.38, 0, cg);
      const knobM = K.glow(0x1e6a5a);
      const knob = K.sph(0.15, knobM, x, 0.47 + 2.52, z, g, 10, 8); knob.castShadow = false;
      const haloM = K.glow(0x7af0d8, 0.0, true); const halo = K.sph(0.34, haloM, x, 0.47 + 2.52, z, g, 10, 8); halo.castShadow = false;
      const segs = []; for (let i = 0; i < 9; i++) { const sg = K.box(0.06, 0.06, 1, K.glow(0xd8fff6, 1, true), 0, 0, 0, g); sg.visible = false; sg.castShadow = false; segs.push(sg); }
      const br = []; for (let i = 0; i < 4; i++) { const sg = K.box(0.04, 0.04, 1, K.glow(0x7af0d8, 0.9, true), 0, 0, 0, g); sg.visible = false; sg.castShadow = false; br.push(sg); }
      return { x, z, knobM, haloM, segs, br, top: new T.Vector3(x, 0.47 + 2.55, z) };
    });
    const coilL = K.light(0x7af0d8, 0, 7, 0, 2.6, 0, g);
    // transformer cabinet with the brass conduit flange facing -x (socket at local [-3.6,0.35,0.35])
    const XF = K.group(S, XFMR[0], 0, XFMR[1]);
    K.box(0.95, 0.12, 0.85, MT.ironM, 0, 0.06, 0, XF);
    K.box(0.82, 1.05, 0.72, MT.iron, 0, 0.64, 0, XF);
    K.box(0.86, 0.06, 0.76, MT.brassD, 0, 1.18, 0, XF);
    for (const x of [-0.2, 0.2]) { for (let i = 0; i < 3; i++) K.cyl(0.09 - i * 0.012, 0.1 - i * 0.012, 0.1, MT.insul, 8, x, 1.26 + i * 0.1, 0, XF); K.sph(0.06, MT.brassL, x, 1.58, 0, XF, 6, 4); }
    hazardStripe(XF, 0.82, 0, 0.22, 0.37, 7, 0, 0.1);
    K.box(0.62, 0.05, 0.05, MT.brassL, 0, 0.98, 0.37, XF);
    const xfGlass = K.glow(0x1e6a5a); K.box(0.5, 0.16, 0.03, xfGlass, 0, 0.75, 0.375, XF);
    for (const [x, y] of [[-0.36, 0.2], [0.36, 0.2], [-0.36, 1.08], [0.36, 1.08]]) K.box(0.05, 0.05, 0.05, MT.brassL, x, y, 0.38, XF);
    // socket flange + conduit stub (the BELTS conduit lands here)
    const fl0 = K.cyl(0.17, 0.17, 0.12, MT.brass, 12, -0.48, 0.35, 0, XF); fl0.rotation.z = Math.PI / 2;
    const fl1 = K.cyl(0.12, 0.12, 0.2, MT.verd, 10, -0.6, 0.35, 0, XF); fl1.rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; K.box(0.04, 0.04, 0.04, MT.brassL, -0.55, 0.35 + Math.sin(a) * 0.14, Math.cos(a) * 0.14, XF); }
    const xfMeter = gauge(g, XFMR[0] + 0.18, 0.47, XFMR[1] + 0.38, 0.11, 0);
    xfMeter.parent.position.set(XFMR[0] + 0.25, 0.48, XFMR[1] + 0.38);
    // armored feed cables, transformer -> coil bases, with teal pulse beads
    const cablePaths = [
      [[XFMR[0] + 0.45, 0.12, XFMR[1] + 0.1], [-2.5, 0.1, 0.55], [COILS[0][0] - 0.3, 0.12, COILS[0][1]]],
      [[XFMR[0] + 0.2, 0.12, XFMR[1] - 0.42], [-2.75, 0.1, -1.6], [-1.6, 0.1, -2.85], [0.9, 0.1, -2.95], [2.1, 0.1, -2.75], [2.8, 0.1, -1.6], [COILS[1][0] + 0.25, 0.14, COILS[1][1] - 0.2]]
    ];
    const beads = [];
    cablePaths.forEach((pts) => {
      K.tube(pts, 0.07, MT.rubber, S, 40, 6);
      const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2])));
      for (let i = 0; i < 9; i++) { const u = (i + 0.5) / 9; const p = curve.getPoint(u); K.torus(0.085, 0.025, MT.brassD, 4, 8, p.x, p.y, p.z, S).lookAt(0, 0, 0); }
      for (let i = 0; i < 3; i++) { const b = K.sph(0.06, K.glow(0x9afff0, 0.95, true), 0, 0, 0, g, 6, 4); b.castShadow = false; b.visible = false; beads.push({ b, curve, u: i / 3 }); }
    });

    // ---------- LOADING JIB CRANE ----------
    const CB = K.group(S, PIVOT[0], 0.47, PIVOT[1]);
    K.cyl(0.32, 0.4, 0.22, MT.iron, 10, 0, 0.11, 0, CB); band(CB, 0.36, 0.22, MT.brassD, 0.05);
    gear(CB, 0.3, 0.07, 14, MT.brassD, 0, 0.27, 0);
    K.cyl(0.11, 0.13, 2.85, MT.oxide, 10, 0, 1.68, 0, CB);
    for (const y of [0.9, 1.9, 2.7]) band(CB, 0.15, y, MT.brassD, 0.07);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const s = K.box(0.05, 0.9, 0.05, MT.oxideD, Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22, CB); s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    const BOOM_Y = 3.55, BOOM_L = 1.45;
    const head = K.group(g, PIVOT[0], BOOM_Y, PIVOT[1]);
    K.cyl(0.2, 0.2, 0.14, MT.brass, 12, 0, -0.03, 0, head);
    K.box(BOOM_L + 0.1, 0.13, 0.16, MT.oxide, BOOM_L / 2, 0.02, 0, head);
    K.box(BOOM_L + 0.1, 0.03, 0.18, MT.hazard, BOOM_L / 2, 0.1, 0, head);
    K.box(0.62, 0.11, 0.14, MT.oxide, -0.3, 0.02, 0, head);
    K.box(0.32, 0.36, 0.3, MT.ironM, -0.52, 0.05, 0, head);
    K.box(0.34, 0.06, 0.32, MT.brassD, -0.52, 0.24, 0, head);
    K.cyl(0.05, 0.08, 0.62, MT.ironL, 6, 0, 0.38, 0, head);
    const tie1 = K.box(1, 0.025, 0.025, MT.ironL, 0, 0, 0, head); K.link(tie1, 0, 0.66, BOOM_L - 0.05, 0.08);
    const tie2 = K.box(1, 0.025, 0.025, MT.ironL, 0, 0, 0, head); K.link(tie2, 0, 0.66, -0.6, 0.12);
    const winch = K.cyl(0.09, 0.09, 0.2, MT.brassL, 10, -0.25, 0.14, 0, head); winch.rotation.x = Math.PI / 2;
    const trolley = K.group(head, 0.8, -0.06, 0);
    K.box(0.24, 0.12, 0.24, MT.ironL, 0, 0, 0, trolley);
    for (const s of [-1, 1]) { const w = K.cyl(0.05, 0.05, 0.04, MT.brass, 8, 0, 0.06, s * 0.11, trolley); w.rotation.x = Math.PI / 2; }
    const chain = K.box(0.035, 1, 0.035, MT.soot, 0, -0.5, 0, trolley);
    const claw = K.group(trolley, 0, -1, 0);
    K.box(0.22, 0.12, 0.2, MT.brass, 0, 0, 0, claw); K.box(0.1, 0.1, 0.1, MT.iron, 0, 0.1, 0, claw);
    const fingers = [-1, 1].map((s) => { const fg = K.group(claw, 0, -0.04, s * 0.09); K.box(0.16, 0.36, 0.04, MT.ironL, 0, -0.18, 0, fg); K.box(0.16, 0.05, 0.08, MT.brassD, 0, -0.34, -s * 0.03, fg); return { fg, s }; });
    const clawLampM = K.mat(0x203020, { e: 0 }); K.sph(0.04, clawLampM, 0.12, 0.02, 0, claw, 6, 4);
    const grip = K.group(claw, 0, -0.42, 0);   // capsule origin hangs here
    // CHAIN_TOP: y (local machine) of the chain top = BOOM_Y - 0.06 - 0.06
    const CH0 = BOOM_Y - 0.12;
    // crane pose: a (boom angle, dir (cos a, sin a)), r (trolley), y (capsule-origin height), gr (grip 0 open..1 closed)
    const crane = { a: Math.atan2(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]), r: 0.8, y: 2.3, gr: 0 };
    function applyCrane() {
      head.rotation.y = -crane.a;
      trolley.position.x = crane.r;
      const clawY = crane.y + 0.42;
      const c = Math.max(0.04, CH0 - 0.06 - clawY);
      chain.scale.y = c; chain.position.y = -0.06 - c / 2;
      claw.position.y = -0.06 - c - 0.06;
      fingers.forEach((f) => (f.fg.rotation.x = f.s * (0.55 - crane.gr * 0.55)));
    }
    // geometry for each crane target
    const A_TRAY = Math.atan2(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]), R_TRAY = Math.hypot(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]);
    const cOut = [HD[0] * CARGO_OUT, HD[1] * CARGO_OUT];
    const A_HATCH = Math.atan2(cOut[1] - PIVOT[1], cOut[0] - PIVOT[0]), R_HATCH = Math.hypot(cOut[1] - PIVOT[1], cOut[0] - PIVOT[0]);
    const Y_TRAY = 1.0, Y_CARRY = 2.85, Y_HATCH = BASE_Y + HATCH_Y;

    // ---------- INTAKE TRAY at the launch.in port ----------
    const TY = K.group(S, TRAY[0], 0, TRAY[1]);
    for (const sx of [-0.28, 0.28]) for (const sz of [-0.35, 0.3]) K.box(0.08, 0.92, 0.08, MT.iron, sx, 0.46, sz, TY);
    K.box(0.68, 0.06, 0.82, MT.ironL, 0, 0.94, -0.03, TY);
    for (let i = 0; i < 5; i++) { const r = K.cyl(0.045, 0.045, 0.6, MT.brassL, 8, 0, 0.985, -0.35 + i * 0.16, TY); r.rotation.z = Math.PI / 2; }
    for (const sx of [-0.34, 0.34]) { K.box(0.05, 0.16, 0.84, MT.brassD, sx, 1.02, -0.03, TY); }
    K.box(0.62, 0.22, 0.06, MT.hazard, 0, 1.05, -0.47, TY);
    hazardStripe(TY, 0.62, 0, 1.05, -0.5, 6, 0, 0.2);
    K.box(0.7, 0.04, 0.6, MT.ironM, 0, 0.25, -0.03, TY);
    const trayLampM = K.mat(0x203020, { e: 0 }); K.sph(0.06, trayLampM, 0.36, 1.18, -0.42, g, 6, 4).position.set(TRAY[0] + 0.36, 1.18, TRAY[1] - 0.44);

    // ---------- STATUS + CAUTION ----------
    const lamp = K.statusLamp(g, 2.3, 0.47, 0.9, 1.15);
    const caution = K.caution(g, -2.35, 0.1, 1.5, 0.95);

    // shockwave ring + flare
    const shock = K.torus(1, 0.08, K.glow(0xffd8a0, 0.9, true), 4, 32, 0, 0.55, 0, g); shock.rotation.x = Math.PI / 2; shock.visible = false; shock.castShadow = false;
    const plumeL = K.light(0xff8a3a, 0, 10, 0, 0.9, 0, g);

    K.bake(S);

    // =====================================================================
    // STATE MACHINES
    // =====================================================================
    // crane steps: tween crane pose; `then` fires at the end
    let craneQ = [], craneStep = null, craneT = 0, craneMode = 'rest', held = null;
    function craneGo(steps) { craneQ = steps.slice(); craneStep = null; }
    function nextCraneStep() {
      craneStep = craneQ.shift() || null; craneT = 0;
      if (craneStep) { craneStep.from = { a: crane.a, r: crane.r, y: crane.y, gr: crane.gr }; if (craneStep.start) craneStep.start(); }
    }
    // rocket phases
    let phase = 'ready', pT = 0, decided = false, countN = 3;
    let resetPhase = null, rT = 0;
    let clampOpen = 0, armAway = 0, bellSwing = 0, shockT = -1, celebrateT = -1;
    function setPhase(p) { phase = p; pT = 0; }
    function recycle(r) {
      r.rk.visible = false; r.plume.visible = false; r.item = null; r.open = 0; r.slide = 0; r.flyT = -1;
      r.rk.position.set(0, BASE_Y, 0); r.hinge.rotation.x = 0; r.cargo.position.z = CARGO_OUT; r.aboardM.color.setHex(0x14301e);
    }

    const rootDir = (dx, dz) => [C45 * (dx - dz), C45 * (dx + dz)];
    function orientItem(it, dxl, dzl) { const [rx, rz] = rootDir(dxl, dzl); it.mesh.rotation.order = 'YZX'; it.mesh.rotation.set(0, Math.atan2(-rz, rx), 0); }

    const tmp = new T.Vector3(), za = new T.Vector3(), zb = new T.Vector3(), zP = []; for (let i = 0; i <= 9; i++) zP.push(new T.Vector3());
    function zap(c, on, strength) {
      if (!on) { c.segs.forEach((s) => (s.visible = false)); c.br.forEach((s) => (s.visible = false)); return; }
      const rk = (flyer && flyer.rk.position.y < 4 ? flyer : cur) || cur;
      const ry = rk.rk.position.y + 0.6 + Math.random() * 2.2;
      const dx = c.x - rk.rk.position.x, dz = c.z - rk.rk.position.z, d = Math.hypot(dx, dz) || 1;
      za.copy(c.top); zb.set(rk.rk.position.x + dx / d * 0.6, ry, rk.rk.position.z + dz / d * 0.6);
      const n = c.segs.length;
      for (let i = 0; i <= n; i++) { zP[i].copy(za).lerp(zb, i / n); if (i > 0 && i < n) zP[i].add(tmp.set(K.R() * 0.5, K.R() * 0.5, K.R() * 0.5).multiplyScalar(strength)); }
      c.segs.forEach((s, i) => { s.visible = true; s.position.copy(zP[i]).lerp(zP[i + 1], 0.5); s.scale.set(1, 1, zP[i].distanceTo(zP[i + 1])); s.lookAt(g.localToWorld(tmp.copy(zP[i + 1]))); });
      // a forked branch off the middle
      const k0 = 3 + Math.floor(Math.random() * 3); let p0 = zP[k0].clone();
      c.br.forEach((s, i) => { const p1 = p0.clone().add(tmp.set(K.R() * 0.6, -0.15 - Math.random() * 0.3, K.R() * 0.6)); s.visible = Math.random() < 0.8; s.position.copy(p0).lerp(p1, 0.5); s.scale.set(1, 1, p0.distanceTo(p1)); s.lookAt(g.localToWorld(p1.clone())); p0 = p1; });
    }

    let tPuff = 0, tZap = 0, lastDetail = '', idleT = 0;
    function steam(x, y, z, n, hard) { for (let i = 0; i < n; i++) K.spawn(g, x + K.R() * 0.3, y, z + K.R() * 0.3, K.R() * 0.5 + (hard ? 0.4 : 0.15), hard ? 1.8 : 0.9, K.R() * 0.5, Math.random() < 0.5 ? 0xb8ac98 : 0xa49884, hard ? 1.5 : 1.3, hard ? 0.18 : 0.13, -0.12); }

    applyCrane();

    return { g, update(t, dt) {
      const blk = M.blocked;
      const live = blk ? 0 : dt;           // frozen timers while a decision is pending
      // ------------------------------------------------ CRANE
      if (!craneStep && craneQ.length) nextCraneStep();
      if (craneStep) {
        craneT += live;
        const k = Math.min(1, craneT / craneStep.dur), e = ease(k), f = craneStep.from;
        if (craneStep.a !== undefined) crane.a = f.a + (craneStep.a - f.a) * e;
        if (craneStep.r !== undefined) crane.r = f.r + (craneStep.r - f.r) * e;
        if (craneStep.y !== undefined) crane.y = f.y + (craneStep.y - f.y) * e;
        if (craneStep.gr !== undefined) crane.gr = f.gr + (craneStep.gr - f.gr) * e;
        if (craneStep.wait && !craneStep.wait()) craneT = Math.min(craneT, craneStep.dur * 0.999);
        if (k >= 1 && (!craneStep.wait || craneStep.wait())) { const s = craneStep; craneStep = null; if (s.then) s.then(); if (craneQ.length) nextCraneStep(); }
      }
      applyCrane();
      if (held) orientItem(held, Math.cos(crane.a), Math.sin(crane.a));
      // start a fetch when idle and something waits on the tray (pre-fetches during the reset too)
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
      if (craneMode === 'rest' && !craneStep && !craneQ.length) { crane.y += (2.3 + Math.sin(t * 0.8) * 0.04 - crane.y) * Math.min(1, dt * 2); }

      // ------------------------------------------------ ROCKET PHASES
      pT += live;
      const r = cur;
      if (phase === 'loading' && r) {
        r.open = Math.min(1, r.open + live / 0.3);
        if (r.item && r.cradle.visible) {
          r.slide = Math.min(1, r.slide + (craneStep && craneStep.gr === 0 ? 0 : live / 0.55));
          r.cargo.position.z = CARGO_OUT + (CARGO_IN - CARGO_OUT) * ease(r.slide);
          if (r.slide >= 1) { r.open = Math.max(0, r.open - live / 0.25 * 1.2); if (r.open <= 0.01) { r.open = 0; r.cradle.visible = false; r.aboardM.color.setHex(0x46ff8a); r.item.parts.halo.visible = false; r.item.flash(0x46ff8a); setPhase('charge'); } }
        }
      } else if (phase === 'charge') {
        if (pT > 1.4) { setPhase('count'); countN = 3; bellSwing = 1; }
      } else if (phase === 'count') {
        const n = 3 - Math.floor(pT / 0.5);
        if (n !== countN && n >= 0) { countN = n; bellSwing = 1; }
        if (pT >= 1.5) {
          countN = 0;
          if (!decided) { decided = true; if (r.item && M.maybeDecision('Merge ' + r.item.label() + ' into main?')) { setPhase('hold'); } else setPhase('ignite'); }
          else setPhase('ignite');
        }
      } else if (phase === 'hold') {
        if (!blk) { setPhase('ignite'); }
      } else if (phase === 'ignite') {
        if (pT < dt * 1.5 + live && shockT < 0) { shockT = 0; for (let i = 0; i < 32; i++) { const a = Math.random() * 6.28; K.spawn(g, Math.cos(a) * 0.8, 0.55, Math.sin(a) * 0.8, Math.cos(a) * (3 + Math.random() * 2), 0.3 + Math.random(), Math.sin(a) * (3 + Math.random() * 2), Math.random() < 0.3 ? 0xffb050 : 0xa89c88, 1.0, 0.17, -0.1); } }
        if (pT > 0.6) { flyer = cur; cur = null; flyer.flyT = 0; setPhase('climb'); }
      } else if (phase === 'climb') {
        if (!resetPhase && pT > 1.1) { resetPhase = 'drop'; rT = 0; }
      }
      // flying rocket (never freezes once it's lit)
      if (flyer) {
        flyer.flyT += dt;
        const q = flyer.flyT;
        flyer.rk.position.y = BASE_Y + q * q * 3.2;
        flyer.rk.position.x = Math.sin(q * 7) * 0.01;
        flyer.plume.visible = true; const f = 0.85 + Math.random() * 0.35; flyer.plume.scale.set(1, f, 1);
        if (flyer.item && flyer.rk.position.y > 15) { const it = flyer.item; flyer.item = null; M.consume(it); celebrateT = 0; }
        if (flyer.rk.position.y > 60) { recycle(flyer); spare = flyer; flyer = null; }
      }
      // reset: pedestal drops, a fresh rocket rises with it, clamps swing in
      if (resetPhase) {
        rT += live;
        if (resetPhase === 'drop') { lifter.position.y = -6.2 * ease(Math.min(1, rT / 0.6)); if (rT >= 0.6) { rT = 0.6; const nr = spare && !spare.rk.visible ? spare : null; if (nr) { spare = null; cur = nr; cur.rk.visible = true; resetPhase = 'rise'; rT = 0; } } }
        else if (resetPhase === 'rise') { const k = Math.min(1, rT / 1.5); lifter.position.y = -6.2 * (1 - ease(k)); if (k >= 1) { resetPhase = 'clamp'; rT = 0; } }
        else if (resetPhase === 'clamp') { if (rT > 0.45) { resetPhase = null; setPhase('ready'); decided = false; } }
        if (cur) cur.rk.position.y = BASE_Y + lifter.position.y;
      }
      if (phase === 'climb' && !resetPhase && cur) setPhase('ready');
      if (cur && phase === 'ready' && !resetPhase) cur.rk.position.y = BASE_Y;
      const padRocket = cur;
      if (padRocket) { padRocket.hinge.rotation.x = -1.25 * ease(padRocket.open); }
      const vd = lifter.position.y < -0.35; voidDisk.visible = vd; voidGlow.visible = vd;
      if (vd) voidGlow.material.opacity = 0.35 + Math.sin(t * 5) * 0.15;

      // ignition shake
      if (phase === 'ignite' && cur) { cur.rk.position.x = Math.sin(t * 60) * 0.02; cur.rk.position.z = Math.cos(t * 53) * 0.02; cur.plume.visible = true; const k = Math.min(1, pT / 0.6); cur.plume.scale.set(k, k * (0.8 + Math.random() * 0.4), k); }
      else if (cur) { cur.rk.position.x = 0; cur.rk.position.z = 0; if (phase !== 'ignite') cur.plume.visible = false; }

      // clamps + service arm
      const wantOpen = phase === 'ignite' && pT > 0.25 || phase === 'climb' || resetPhase === 'drop' || resetPhase === 'rise';
      clampOpen += ((wantOpen ? 1 : 0) - clampOpen) * Math.min(1, dt * (wantOpen ? 9 : 4));
      clamps.forEach((j) => (j.rotation.x = clampOpen * 1.05));
      const wantAway = phase === 'ignite' || phase === 'climb' || !!resetPhase || (phase === 'count' && pT > 1.0) || phase === 'hold';
      armAway += ((wantAway ? 1 : 0) - armAway) * Math.min(1, dt * 2.5);
      armP.rotation.y = -Math.PI / 4 + armAway * 1.25;
      // gantry cage rides; beacon; floodlight
      const busy = phase !== 'ready' || craneMode !== 'rest' || !!resetPhase;
      cage.position.y = phase === 'count' || phase === 'ignite' || phase === 'hold' ? cage.position.y + (0.25 - cage.position.y) * Math.min(1, dt * 3) : 1 + (Math.sin(t * 0.35) * 0.5 + 0.5) * 3.8;
      const alarm = blk || phase === 'count' || phase === 'ignite';
      beaconSpin.rotation.y += dt * (alarm ? 8 : 0);
      beaconM.emissive.setHex(alarm ? (Math.sin(t * 9) > -0.2 ? (blk ? 0xff2010 : 0xff5020) : 0x300808) : 0);
      strobeMs.forEach((m, i) => m.emissive.setHex(blk && Math.sin(t * 14 + i * 3.1) > 0.5 ? 0xff2010 : 0));
      floodM.color.setHex(phase === 'ready' && !busy ? 0x6a5838 : 0xfff0c0);

      // clock + nixies + bell
      if (phase === 'count') hand.rotation.z = Math.PI * 0.5 * (1 - pT / 1.5);       // sweeps from T-3 (9 o'clock-ish) to 12
      else if (phase === 'hold' || phase === 'ignite') hand.rotation.z = 0;
      else if (phase === 'charge') hand.rotation.z = Math.PI * 0.5;
      else if (phase === 'ready' || phase === 'loading') hand.rotation.z += (Math.PI * 0.5 - hand.rotation.z) * Math.min(1, dt * 3);
      if (phase === 'count') nixie('0' + countN, 1);
      else if (phase === 'hold') nixie('00', Math.sin(t * 8) > 0 ? 1 : 0.25);
      else if (phase === 'ignite' || (phase === 'climb' && pT < 1.2)) nixie('00', 1);
      else if (phase === 'charge') nixie('--', 0.6 + Math.random() * 0.4);
      else if (blk) nixie('--', Math.sin(t * 8) > 0 ? 1 : 0.2);
      else nixie('--', 0.55);
      bellSwing = Math.max(0, bellSwing - dt * 1.6);
      bellP.rotation.z = Math.sin(t * 26) * 0.35 * bellSwing;
      ckLampM.emissive.setHex(blk ? (Math.sin(t * 10) > 0 ? 0xff2010 : 0) : phase === 'count' ? (Math.sin(t * 12) > 0 ? 0xffa030 : 0) : (phase === 'ignite' || phase === 'climb') ? 0x46ff8a : phase === 'charge' ? 0x5af0d8 : 0);

      // tesla coils + transformer + feed beads
      const charging = !blk && (phase === 'charge' || phase === 'count' || (phase === 'ignite' && pT < 0.35));
      const sputter = blk && (phase === 'charge' || phase === 'count' || phase === 'hold');
      coils.forEach((c) => { c.knobM.color.setHex(charging ? (Math.random() < 0.5 ? 0xe8fffa : 0x7af0d8) : sputter ? (Math.random() < 0.2 ? 0x9afff0 : 0x1e6a5a) : 0x1e6a5a); c.haloM.opacity = charging ? 0.35 + Math.random() * 0.25 : 0; });
      tZap -= dt;
      if (tZap <= 0) { tZap = 0.06; coils.forEach((c) => zap(c, (charging && Math.random() < (phase === 'charge' ? 0.92 : 0.7)) || (sputter && Math.random() < 0.12), phase === 'charge' ? 1.1 : 0.8)); }
      if (!coilL.isDummy) { coilL.intensity = charging ? 1.6 + Math.random() * 1.4 : sputter && Math.random() < 0.1 ? 1.2 : 0; if (cur) coilL.position.set(0, cur.rk.position.y + 1.8, 0); }
      xfGlass.color.setHex(charging ? (Math.random() < 0.5 ? 0x9afff0 : 0x5ae0c8) : phase === 'loading' ? 0x3aa890 : 0x1e5a4c);
      xfMeter.rotation.z = charging ? -0.9 + Math.sin(t * 30) * 0.15 : blk ? -1.2 : 0.8;
      beads.forEach((b) => { b.b.visible = charging; if (charging) { b.u = (b.u + dt * 0.9) % 1; b.b.position.copy(b.curve.getPoint(b.u)); } });
      if (cur) cur.portM.color.setHex(charging ? 0xfff0c0 : phase === 'count' || phase === 'ignite' || phase === 'hold' ? 0xffd890 : 0xb07a3a);
      if (flyer) flyer.portM.color.setHex(0xffe0a0);
      if (cur && cur.item) cur.aboardM.color.setHex(blk && phase === 'hold' ? (Math.sin(t * 8) > 0 ? 0xffb020 : 0x46ff8a) : 0x46ff8a);

      // rim lamps
      rimLamps.forEach((m, i) => {
        let c = 0x3a2408;
        if (blk) c = Math.sin(t * 12 + (i % 2) * Math.PI) > 0 ? 0xff2010 : 0x200000;
        else if (phase === 'count') c = Math.floor(t * 14) % 8 === i ? 0xffc040 : 0x4a2a08;
        else if (phase === 'charge') c = (Math.sin(t * 9 + i) > 0.3) ? 0x5af0d8 : 0x103a30;
        else if (phase === 'ignite' || phase === 'climb' || resetPhase) c = 0x46ff8a;
        else if (phase === 'loading' || craneMode !== 'rest') c = Math.floor(t * 4) % 8 === i ? 0xffa030 : 0x3a2408;
        else c = 0x5a3a10;
        m.emissive.setHex(c);
      });
      trayLampM.emissive.setHex(M.waiting('in') ? (Math.sin(t * 6) > 0 ? 0x46ff8a : 0x104a20) : 0);
      clawLampM.emissive.setHex(held ? 0x46ff8a : craneMode !== 'rest' ? 0xffa030 : 0);
      tankN.rotation.z = charging ? -0.7 + Math.sin(t * 6) * 0.12 : blk ? -1.15 + Math.sin(t * 40) * 0.05 : phase === 'count' ? -0.4 : 0.8;

      // plume light, shockwave, trench smoke, steam
      const lit = phase === 'ignite' ? Math.min(1, pT / 0.6) : flyer && flyer.flyT < 2.2 ? Math.max(0, 1 - flyer.flyT / 2.2) : 0;
      if (!plumeL.isDummy) plumeL.intensity = lit * (2.8 + Math.random() * 0.9);
      if (shockT >= 0) { shockT += dt; shock.visible = true; const k = shockT / 0.8; shock.scale.setScalar(0.6 + k * 4); shock.material.opacity = 0.9 * (1 - k); if (k >= 1) { shockT = -1; shock.visible = false; } }
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = 0.05;
        const tx = TANK[0] + 0.45, tz = TANK[1];
        if (blk) { steam(tx, 2.35, tz, 2, true); if (Math.random() < 0.5) steam(K.R() * 0.6, 0.6, K.R() * 0.6, 1, true); }
        else if (charging) { if (Math.random() < 0.7) steam(tx, 2.35, tz, 1, true); }
        else if (Math.random() < 0.1) steam(tx, 2.35, tz, 1, false);
        if (phase === 'count' && Math.random() < 0.6) { const s = Math.random() < 0.5 ? 1 : -1; K.spawn(g, s * 2.0 * C45, 0.55, -s * 2.0 * C45, s * 0.6, 0.6, -s * 0.6, 0xb8ac98, 1.2, 0.16, -0.1); }
        // liftoff smoke: blasted out both ends of the flame trench
        if (lit > 0.05) {
          for (let i = 0; i < 4; i++) {
            const s = Math.random() < 0.5 ? 1 : -1, sp = 3 + Math.random() * 3;
            if (i < 3) K.spawn(g, s * 1.4 * C45, 0.6, -s * 1.4 * C45, s * sp * C45 + K.R(), 0.3 + Math.random() * 0.6, -s * sp * C45 + K.R(), Math.random() < 0.3 ? 0xffa040 : (Math.random() < 0.5 ? 0x8e8474 : 0x6a6258), 1.3, 0.16, -0.12);
          }
          if (Math.random() < 0.5) K.spawn(g, K.R() * 0.6, 0.6, K.R() * 0.6, K.R() * 2, 0.3, K.R() * 2, 0xffd27a, 0.5, 0.08, 1, true);
        }
        if (flyer && flyer.flyT < 4) {
          const y = flyer.rk.position.y - 0.7;
          for (let i = 0; i < 2; i++) K.spawn(g, K.R() * 0.3, y, K.R() * 0.3, K.R() * 0.6, -0.6, K.R() * 0.6, Math.random() < 0.35 ? 0xffb050 : 0x8e8474, 2.0, 0.2, -0.1);
        }
        if (resetPhase === 'rise' && Math.random() < 0.8) K.spawn(g, K.R() * 2.2, 0.3, K.R() * 2.2, K.R() * 0.4, 0.9, K.R() * 0.4, 0xb8ac98, 1.6, 0.2, -0.1);
        if (resetPhase === 'drop' && Math.random() < 0.6) K.spawn(g, K.R() * 1.4, 0.4, K.R() * 1.4, K.R() * 0.3, 1.2, K.R() * 0.3, 0x6e665a, 1.8, 0.24, -0.1);
      }
      // shipped: signal flare from the clock tower + burst high over the pad
      if (celebrateT >= 0) {
        const c0 = celebrateT; celebrateT += dt;
        const ckx = CLOCK[0], ckz = CLOCK[1];
        if (c0 < 0.6) { const k = c0 / 0.6; K.spawn(g, ckx + K.R() * 0.1, 4.0 + k * 5.0, ckz + K.R() * 0.1, K.R() * 0.3, -0.5, K.R() * 0.3, 0xffd890, 0.6, 0.07, 0, true); }
        if (c0 < 0.6 && celebrateT >= 0.6) {
          for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.57, sp = 2 + Math.random() * 2.5; K.spawn(g, ckx, 9.0, ckz, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 0.5, Math.sin(a) * Math.cos(b) * sp, i % 3 ? 0x46ff8a : (i % 2 ? 0xffd27a : 0xffffff), 1.3 + Math.random() * 0.6, 0.09, 2.2, true); }
        }
        if (celebrateT > 2.5) celebrateT = -1;
      }

      // ------------------------------------------------ STATE + HUD DETAIL
      const id = (cur && cur.item) ? cur.item.label() : held ? held.label() : (flyer && flyer.item) ? flyer.item.label() : '';
      let st = 'WORKING', det = '';
      if (phase === 'hold' || (blk && phase === 'count')) det = id + ' · T-0 · awaiting your merge';
      else if (phase === 'loading') det = id + ' · loading the rocket';
      else if (phase === 'charge') det = id + ' · charging the coils';
      else if (phase === 'count') det = id + ' · T-' + countN;
      else if (phase === 'ignite') det = id + ' · ignition';
      else if (phase === 'climb' && flyer && flyer.item) det = flyer.item.label() + ' · liftoff!';
      else if (resetPhase) det = held ? held.label() + ' · waiting for the next rocket' : 'shipped · fresh rocket rising';
      else if (craneMode === 'fetch') det = (held ? held.label() : 'PR') + ' · crane picking up';
      else if (craneMode === 'hold' || craneMode === 'insert') det = (held ? held.label() : id) + ' · loading the rocket';
      else if (celebrateT >= 0) det = 'shipped! · pad clear';
      else { st = 'IDLE'; det = 'pad clear — waiting for a PR'; }
      if (blk && !det) det = 'launch held';
      M.setState(st, det); lastDetail = det;
      lamp.set(M.stateShown, t);
      caution.update(t, dt, M.stateShown);
      idleT += dt;
    } };
  });
})();
