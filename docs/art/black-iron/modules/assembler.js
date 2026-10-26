// =====================================================================
// CLOCKWORK ASSEMBLER (Black Iron line) — ASSEMBLER agent
// The issue's journey through the machine, every handoff a visible motion:
//   intake TRAY  ->  ARM A (articulated brass arm, IK, gripper)  ->  CARD PUNCH (carriage, flywheel-driven ram,
//   punched-card ribbon; issue becomes a bound card stack)  ->  GANTRY CLAW  ->  engine INTAKE CUP (lid)  ->
//   glass pipe  ->  VACUUM RISER inside the difference-engine dome (gear stacks roar; cards become the PR capsule)
//   ->  tube fitting at local [-1.1, 4.45, -1.1]  ->  M.give(item, 'out')
// Stages run as independent little state machines, so the arm can fetch the next issue while the punch works.
// Everything freezes while M.blocked; the machine then redlines, vents, strobes and pops a "?" card.
// =====================================================================
(function () {
  'use strict';
  IRON.machine('assembler', function (K, M) {
    const THREE = K.THREE, V3 = THREE.Vector3;
    const C = {
      soot: 0x1e1814, iron: 0x3a3029, ironM: 0x483c33, ironL: 0x64574b, ironX: 0x7e6f60,
      brass: 0xb8883c, brassD: 0x7a5822, brassL: 0xe4b85e, copper: 0xac5a30, copperD: 0x72401f, verd: 0x43927a,
      wood: 0x6e4c2c, woodD: 0x4c341f, cream: 0xf0dfb4, creamD: 0xd2bc8c, rust: 0x92461f, hazard: 0xe0a01c, red: 0xc8321e
    };
    const m = {
      soot: K.mat(C.soot), iron: K.mat(C.iron, { shine: 22, spec: 0x2e2e34 }), ironM: K.mat(C.ironM, { shine: 18, spec: 0x26262c }),
      ironL: K.mat(C.ironL, { shine: 30, spec: 0x3a3a40 }), ironX: K.mat(C.ironX, { shine: 40, spec: 0x50505a }),
      brass: K.mat(C.brass, { shine: 42, spec: 0x8a6a30 }), brassD: K.mat(C.brassD, { shine: 24, spec: 0x4a3818 }), brassL: K.mat(C.brassL, { shine: 60, spec: 0xb09050 }),
      copper: K.mat(C.copper, { shine: 36, spec: 0x7a4428 }), copperD: K.mat(C.copperD, { shine: 20, spec: 0x3a1a0a }), verd: K.mat(C.verd, { shine: 16 }),
      wood: K.mat(C.wood), woodD: K.mat(C.woodD), cream: K.mat(C.cream), creamD: K.mat(C.creamD), rust: K.mat(C.rust), hazard: K.mat(C.hazard),
      glass: K.mat(0xbfe8da, { op: 0.2, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      glassR: K.mat(0xd8fff0, { op: 0.17, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      gearA: K.mat(0x9a7234, { shine: 14, spec: 0x3a2a14 }), gearB: K.mat(0x7a5a28, { shine: 10, spec: 0x2a1e0e }),
      oil: K.mat(0x0b0b10, { shine: 90, spec: 0x7a6a9a }), grime: K.mat(0x0a0806, { op: 0.42, depthWrite: false }), ink: K.mat(0x140c06)
    };
    const g = K.group();
    const st = K.group(g);      // static: baked at the end
    const dyn = K.group(g);     // moving parts
    const lerp = K.lerp, sm = K.smooth, cl = K.clamp01;
    const v = new V3(), v2 = new V3();

    // ---------- helpers ----------
    function gear(p, r, thick, teeth, mm, x, y, z) {
      const gg = K.group(p, x, y, z);
      K.cyl(r, r, thick, mm, Math.max(12, teeth), 0, 0, 0, gg);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, mm, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
      K.cyl(r * 0.3, r * 0.3, thick * 1.6, m.ironM, 8, 0, 0, 0, gg);
      if (r > 0.25) for (let i = 0; i < 3; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.14, m.brassD, 0, 0, 0, gg); s.rotation.y = i * Math.PI / 3; }
      return gg;
    }
    const rivetRing = (p, x, z, r, y, n, mm) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, mm || m.brassL, x + Math.cos(a) * r, y, z + Math.sin(a) * r, p); } };
    const band = (p, x, z, r, y, mm, h) => K.cyl(r, r, h || 0.1, mm || m.brass, 18, x, y, z, p);
    // gauge: face normal along +z of a frame rotated by ry; static parts -> st, needle -> dyn
    function gauge(x, y, z, r, ry) {
      const s = K.group(st, x, y, z); s.rotation.y = ry || 0;
      const rim = K.cyl(r * 1.18, r * 1.18, 0.08, m.brass, 14, 0, 0, 0, s); rim.rotation.x = Math.PI / 2;
      const face = K.cyl(r, r, 0.1, m.cream, 14, 0, 0, 0.01, s); face.rotation.x = Math.PI / 2;
      const red = K.box(r * 0.55, r * 0.2, 0.02, K.mat(0xc02a1a), r * 0.45, r * 0.45, 0.065, s); red.rotation.z = -0.8;
      for (let i = 0; i < 5; i++) { const a = -1.1 + i * 0.55; K.box(0.02, r * 0.18, 0.02, m.ink, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0.065, s).rotation.z = -a; }
      const d = K.group(dyn, x, y, z); d.rotation.y = ry || 0;
      const piv = K.group(d, 0, 0, 0.075);
      K.box(0.035, r * 0.85, 0.02, m.ink, 0, r * 0.38, 0, piv);
      K.box(0.07, 0.07, 0.03, m.brassL, 0, 0, 0.085, d);
      return piv;
    }
    function hazardBand(p, len, x, y, z, n, alongZ) {
      const w = len / n;
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + w * (i + 0.5);
        K.box(alongZ ? 0.04 : w * 0.96, 0.12, alongZ ? w * 0.96 : 0.04, i % 2 ? m.soot : m.hazard, x + (alongZ ? 0 : o), y, z + (alongZ ? o : 0), p);
      }
    }
    function puff(x, y, z, col, size, vy, spread, life, vx, vz) {
      K.spawn(g, x + K.R() * spread, y, z + K.R() * spread, (vx || 0) + K.R() * 0.3, vy, (vz || 0) + K.R() * 0.3, col, life || 2.2, size, -0.12);
    }
    const plateTex = K.canvasTex(32, 32, (c) => {
      c.fillStyle = '#4c4238'; c.fillRect(0, 0, 32, 32);
      for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) {
        const o = (y / 8) % 2 ? 4 : 0;
        c.fillStyle = '#6a5c4e'; c.fillRect((x + o) % 32, y + 2, 3, 1); c.fillRect((x + o + 1) % 32, y + 1, 1, 3);
        c.fillStyle = '#2e2620'; c.fillRect((x + o + 1) % 32, y + 4, 2, 1);
      }
      c.fillStyle = 'rgba(10,8,6,0.35)'; c.fillRect(3, 18, 9, 6); c.fillRect(20, 4, 6, 4);
    }, [6, 6]);

    // =================================================================
    // PLINTH: riveted iron deck, diamond plate, brass trim, hazard edges
    // =================================================================
    K.box(4.9, 0.3, 4.9, m.ironM, 0, 0.15, 0, st);
    K.box(5.0, 0.08, 5.0, m.brassD, 0, 0.33, 0, st);
    K.box(4.62, 0.04, 4.62, K.mat(0xffffff, { map: plateTex, shine: 20, spec: 0x2a2620 }), 0, 0.39, 0, st);
    for (let i = 0; i < 9; i++) { K.box(0.08, 0.08, 0.08, m.brassL, -2.3 + i * 0.575, 0.2, 2.47, st); K.box(0.08, 0.08, 0.08, m.brassL, 2.47, 0.2, -2.3 + i * 0.575, st); }
    hazardBand(st, 4.4, 0, 0.2, 2.48, 14, false);
    hazardBand(st, 4.4, 2.48, 0.2, 0, 14, true);
    for (const [x, z, sx, sz] of [[0.9, -0.2, 0.7, 0.45], [-0.3, 2.0, 0.5, 0.35], [1.9, 1.5, 0.4, 0.3]]) { const p = K.sph(1, m.oil, x, 0.4, z, st, 12, 4); p.scale.set(sx, 0.02, sz); p.castShadow = false; }
    for (let i = 0; i < 6; i++) { const d = K.box(0.4 + K.rnd() * 0.7, 0.01, 0.3 + K.rnd() * 0.5, m.grime, -2 + K.rnd() * 4, 0.415, -2 + K.rnd() * 4, st); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
    // stamped brass maker's plate on the front-left face: SHIPTORIO (3x5 pixel letters)
    {
      const F = { S: '111100111001111', H: '101101111101101', I: '111010010010111', P: '110101110100100', T: '111010010010010', O: '111101101101111', R: '110101110101101' };
      const tex = K.canvasTex(40, 9, (c) => {
        c.fillStyle = '#7a5822'; c.fillRect(0, 0, 40, 9); c.fillStyle = '#e4b85e'; c.fillRect(0, 0, 40, 1); c.fillStyle = '#4a3416'; c.fillRect(0, 8, 40, 1);
        'SHIPTORIO'.split('').forEach((ch, i) => { const bits = F[ch]; for (let k = 0; k < 15; k++) if (bits[k] === '1') { c.fillStyle = '#1e1408'; c.fillRect(2 + i * 4 + (k % 3), 2 + Math.floor(k / 3), 1, 1); } });
      });
      K.box(1.5, 0.34, 0.03, K.mat(0xffffff, { map: tex, shine: 40, spec: 0x6a5020 }), -1.62, 0.18, 2.5, st);
      for (const x of [-2.32, -0.92]) K.box(0.05, 0.05, 0.05, m.brassL, x, 0.18, 2.53, st);
    }
    // floor grates leading from tray to punch
    for (let i = 0; i < 5; i++) K.box(0.9, 0.02, 0.06, m.soot, -0.15, 0.42, 2.0 + i * 0.09, st);

    // =================================================================
    // INTAKE TRAY (port 'in' at local [-0.5, 1.0, 2.9]): riveted cradle, two belts converge on it
    // =================================================================
    const TRAY = new V3(-0.5, 1.0, 2.9);
    {
      const tx = TRAY.x, tz = TRAY.z;
      for (const sx of [-0.36, 0.36]) for (const sz of [-0.36, 0.36]) { K.box(0.1, 0.86, 0.1, m.iron, tx + sx, 0.53, tz + sz, st); K.box(0.18, 0.06, 0.18, m.ironM, tx + sx, 0.13, tz + sz, st); }
      K.box(0.82, 0.06, 0.06, m.ironM, tx, 0.45, tz - 0.36, st); K.box(0.06, 0.06, 0.82, m.ironM, tx + 0.36, 0.45, tz, st);
      K.box(0.9, 0.08, 0.9, m.ironL, tx, 0.94, tz, st);
      K.box(0.94, 0.03, 0.94, m.brassD, tx, 0.9, tz, st);
      for (let i = 0; i < 5; i++) { const r = K.cyl(0.045, 0.045, 0.78, m.ironX, 6, tx - 0.32 + i * 0.16, 0.99, tz, st); r.rotation.x = Math.PI / 2; }
      // guides on the +x side and a backstop on the -z side (belts come in from +z and from -x)
      K.box(0.06, 0.2, 0.9, m.brass, tx + 0.46, 1.06, tz, st); K.box(0.9, 0.2, 0.06, m.brass, tx, 1.06, tz - 0.46, st);
      K.box(0.1, 0.08, 0.96, m.brassD, tx + 0.46, 1.18, tz, st); K.box(0.96, 0.08, 0.1, m.brassD, tx, 1.18, tz - 0.46, st);
      for (let i = 0; i < 4; i++) { K.box(0.06, 0.06, 0.06, m.brassL, tx + 0.5, 1.06, tz - 0.33 + i * 0.22, st); K.box(0.06, 0.06, 0.06, m.brassL, tx - 0.33 + i * 0.22, 1.06, tz - 0.5, st); }
      // sensor post with the arrival lamp
      K.box(0.06, 0.55, 0.06, m.iron, tx + 0.46, 1.4, tz - 0.46, st);
      K.cyl(0.09, 0.09, 0.05, m.brassD, 8, tx + 0.46, 1.69, tz - 0.46, st);
    }
    const trayLampM = K.mat(0x3a2a10, { e: 0 });
    K.sph(0.08, trayLampM, TRAY.x + 0.46, 1.76, TRAY.z - 0.46, dyn, 8, 6);

    // =================================================================
    // DIFFERENCE ENGINE: drum, glass dome, gear stacks, glass vacuum riser, tube fitting, intake cup
    // =================================================================
    const D = new V3(-1.1, 0, -1.1);
    K.cyl(1.3, 1.38, 0.62, m.iron, 18, D.x, 0.71, D.z, st);
    band(st, D.x, D.z, 1.34, 0.98, m.brass, 0.1); band(st, D.x, D.z, 1.4, 0.46, m.brassD, 0.08);
    rivetRing(st, D.x, D.z, 1.36, 0.8, 22); rivetRing(st, D.x, D.z, 1.41, 0.56, 22, m.brassD);
    K.cyl(1.16, 1.16, 0.04, m.soot, 18, D.x, 1.03, D.z, st);
    // dome glass + brass ribs
    const dome = K.lathe([[1.12, 0], [1.12, 1.25], [1.02, 1.85], [0.78, 2.32], [0.5, 2.6], [0.34, 2.72]], m.glass, 20, D.x, 1.03, D.z, st);
    dome.castShadow = false;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2, c = Math.cos(a), s = Math.sin(a); K.tube([[D.x + c * 1.14, 1.04, D.z + s * 1.14], [D.x + c * 1.14, 2.28, D.z + s * 1.14], [D.x + c * 0.82, 3.3, D.z + s * 0.82], [D.x + c * 0.36, 3.74, D.z + s * 0.36]], 0.032, m.brass, st, 14, 4); }
    K.torus(1.14, 0.045, m.brassD, 4, 28, D.x, 2.28, D.z, st).rotation.x = Math.PI / 2;
    K.torus(0.4, 0.07, m.brass, 6, 18, D.x, 3.74, D.z, st).rotation.x = Math.PI / 2;
    // vacuum riser (glass column) with brass rings, through the top into the tube fitting
    const riser = K.cyl(0.3, 0.3, 3.42, m.glassR, 14, D.x, 1.03 + 1.71, D.z, st); riser.castShadow = false;
    for (const y of [1.1, 1.75, 2.45, 3.1, 3.7]) K.torus(0.31, 0.04, m.brassL, 4, 16, D.x, y, D.z, st).rotation.x = Math.PI / 2;
    K.cyl(0.42, 0.46, 0.18, m.brassD, 14, D.x, 3.82, D.z, st);
    K.cyl(0.36, 0.36, 0.08, m.brass, 14, D.x, 4.0, D.z, st);
    const fitG = K.cyl(0.3, 0.3, 0.5, m.glassR, 12, D.x, 4.18, D.z, st); fitG.castShadow = false;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 0.5, 0.05, m.brass, D.x + sx * 0.25, 4.18, D.z + sz * 0.25, st);
    K.cyl(0.38, 0.38, 0.06, m.brassL, 14, D.x, 4.44, D.z, st); // flange where the tube bolts on
    rivetRing(st, D.x, D.z, 0.35, 4.48, 8);
    // four gear stacks around the riser (inside the dome)
    const stacks = [];
    for (let s = 0; s < 4; s++) {
      const a = s / 4 * Math.PI * 2 + Math.PI / 4, sx = D.x + Math.cos(a) * 0.74, sz = D.z + Math.sin(a) * 0.74;
      K.cyl(0.035, 0.035, 2.5, m.ironL, 6, sx, 2.25, sz, st);
      const col = K.group(dyn, sx, 0, sz); const gs = [];
      for (let i = 0; i < 6; i++) { const r = 0.2 + ((i + s) % 3) * 0.045; gs.push(gear(col, r, 0.07, 10 + ((i + s) % 3) * 2, i % 2 ? m.gearA : m.gearB, 0, 1.25 + i * 0.36, 0)); }
      stacks.push({ col, dir: s % 2 ? 1 : -1 });
    }
    // glow inside the riser + crown lamp
    const riserGlowM = K.glow(0xffb45a, 0.0, true);
    const riserGlow = K.cyl(0.24, 0.24, 3.3, riserGlowM, 10, D.x, 2.7, D.z, dyn); riserGlow.castShadow = false;
    const crownM = K.glow(0xffb45a);
    K.sph(0.08, crownM, D.x, 3.95, D.z + 0.0, dyn, 8, 6).position.set(D.x + 0.4, 3.92, D.z + 0.4);
    // suction collar: a bright ring that rides up the riser with the item
    const collarM = K.glow(0xffd890, 0.0, true);
    const collar = K.torus(0.33, 0.06, collarM, 4, 18, D.x, 1.1, D.z, dyn); collar.rotation.x = Math.PI / 2; collar.castShadow = false;
    const collar2 = K.torus(0.33, 0.04, collarM, 4, 18, D.x, 1.1, D.z, dyn); collar2.rotation.x = Math.PI / 2; collar2.castShadow = false;
    // engine counter wheels on the drum's front (visible), turn when compiling
    const counters = [];
    { const a = Math.PI / 4, cx = D.x + Math.cos(a) * 1.39, cz = D.z + Math.sin(a) * 1.39;
      const plate = K.group(st, cx, 0.72, cz); plate.rotation.y = -a + Math.PI / 2;
      K.box(0.9, 0.34, 0.05, m.brassD, 0, 0, 0, plate);
      const cg = K.group(dyn, cx, 0.72, cz); cg.rotation.y = -a + Math.PI / 2;
      for (let i = 0; i < 4; i++) { const w = K.cyl(0.11, 0.11, 0.14, m.cream, 10, -0.3 + i * 0.2, 0, 0.06, cg); w.rotation.z = Math.PI / 2; counters.push(w); K.box(0.02, 0.18, 0.02, m.ink, -0.3 + i * 0.2, 0, 0.14, cg); }
    }

    // INTAKE CUP on the drum's front-left with a hinged lid, and the glass pipe into the riser base
    const CUP = new V3(-1.6, 1.08, 0.15);
    {
      K.lathe([[0.18, 0], [0.33, 0.28], [0.36, 0.34]], m.brass, 14, CUP.x, 1.0, CUP.z, st);
      K.cyl(0.19, 0.22, 0.6, m.ironM, 12, CUP.x, 0.7, CUP.z, st);
      K.torus(0.36, 0.035, m.brassL, 4, 18, CUP.x, 1.34, CUP.z, st).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) K.box(0.06, 0.5, 0.06, m.iron, CUP.x + Math.cos(i * 2.1) * 0.24, 0.65, CUP.z + Math.sin(i * 2.1) * 0.24, st);
      const pipe = K.tube([[CUP.x, 1.25, CUP.z], [-1.38, 1.25, -0.5], [D.x, 1.25, D.z]], 0.27, m.glassR, st, 12, 10); pipe.castShadow = false;
      for (const k of [0.2, 0.55]) K.torus(0.28, 0.035, m.brassL, 4, 14, lerp(CUP.x, D.x, k), 1.25, lerp(CUP.z, D.z, k), st).lookAt(D.x * 2 - CUP.x, 1.25, D.z * 2 - CUP.z);
      K.box(0.5, 0.12, 0.3, m.ironM, -1.6, 0.98, -0.2, st); // bracket to the drum
    }
    const lidPiv = K.group(dyn, CUP.x - 0.34, 1.36, CUP.z);
    const lid = K.cyl(0.35, 0.35, 0.05, m.brassD, 14, 0.34, 0.02, 0, lidPiv); K.box(0.08, 0.06, 0.08, m.brassL, 0.62, 0.06, 0, lidPiv);
    for (let i = 0; i < 3; i++) K.box(0.5, 0.02, 0.03, m.brass, 0.34, 0.05, -0.15 + i * 0.15, lidPiv);

    // =================================================================
    // COPPER BOILER (back right) with gauges, firebox, whistle, safety valve, alarm
    // =================================================================
    const BO = new V3(1.35, 0.39, -1.35);
    K.cyl(0.75, 0.8, 2.5, m.copper, 16, BO.x, BO.y + 1.25, BO.z, st);
    for (const y of [0.25, 0.9, 1.6, 2.3]) { band(st, BO.x, BO.z, 0.81, BO.y + y, m.brassD, 0.1); rivetRing(st, BO.x, BO.z, 0.82, BO.y + y + 0.08, 12); }
    K.lathe([[0.77, 0], [0.7, 0.25], [0.45, 0.45], [0.12, 0.55]], m.copperD, 14, BO.x, BO.y + 2.5, BO.z, st);
    K.cyl(0.12, 0.12, 1.1, m.soot, 8, BO.x, BO.y + 3.2, BO.z, st);
    K.cyl(0.18, 0.12, 0.2, m.brassD, 8, BO.x, BO.y + 3.75, BO.z, st);
    // firebox on the +z face
    K.box(0.62, 0.54, 0.06, m.iron, BO.x, BO.y + 0.45, BO.z + 0.78, st);
    for (let i = 0; i < 4; i++) K.box(0.04, 0.42, 0.1, m.soot, BO.x - 0.18 + i * 0.12, BO.y + 0.45, BO.z + 0.83, st);
    const fireM = K.glow(0xffa040);
    K.box(0.5, 0.42, 0.04, fireM, BO.x, BO.y + 0.45, BO.z + 0.8, dyn);
    // coal scuttle by the firebox
    K.box(0.4, 0.22, 0.3, m.ironM, BO.x - 0.2, 0.52, BO.z + 1.3, st);
    for (let i = 0; i < 6; i++) K.rock(0.07, m.soot, BO.x - 0.32 + (i % 3) * 0.12, 0.66, BO.z + 1.25 + Math.floor(i / 3) * 0.1, st);
    const needles = [gauge(BO.x - 0.33, BO.y + 1.85, BO.z + 0.74, 0.2, 0.25), gauge(BO.x + 0.3, BO.y + 1.85, BO.z + 0.74, 0.2, -0.1), gauge(BO.x + 0.0, BO.y + 1.3, BO.z + 0.8, 0.16, 0), gauge(BO.x + 0.8, BO.y + 1.6, BO.z + 0.05, 0.18, Math.PI / 2), gauge(BO.x + 0.74, BO.y + 2.15, BO.z + 0.33, 0.13, 1.2)];
    K.cyl(0.07, 0.07, 0.4, m.brass, 8, BO.x + 0.4, BO.y + 2.9, BO.z + 0.3, st);
    K.cyl(0.1, 0.06, 0.3, m.brassL, 8, BO.x + 0.4, BO.y + 3.2, BO.z + 0.3, st);
    const alarmM = K.mat(0x401010, { e: 0 });
    K.sph(0.14, alarmM, BO.x - 0.4, BO.y + 2.95, BO.z + 0.42, dyn, 8, 6);
    K.cyl(0.1, 0.13, 0.08, m.brassD, 8, BO.x - 0.4, BO.y + 2.82, BO.z + 0.42, st);
    // pipes boiler -> engine drum, verdigris return
    K.tube([[BO.x - 0.6, 2.3, BO.z - 0.1], [0.2, 2.6, -1.7], [-0.4, 2.55, -1.75], [-0.6, 1.4, -1.6], [-0.4, 1.0, -1.2]], 0.07, m.copper, st, 22, 6);
    K.tube([[BO.x - 0.7, 0.9, BO.z + 0.5], [0.2, 0.7, -0.3], [-0.2, 0.62, -0.25]], 0.06, m.verd, st, 16, 5);
    // valve wheel on the steam pipe
    K.torus(0.16, 0.03, K.mat(0xa02a18), 4, 12, 0.2, 2.62, -1.7, st).rotation.x = Math.PI / 2;

    // =================================================================
    // CARD PUNCH (front left): chassis, sliding carriage, flywheel-driven ram, card hopper, ribbon + basket
    // =================================================================
    const PM = { x0: -2.3, x1: -0.4, z0: 1.0, z1: 1.9, cz: 1.45, bed: 1.2, xIn: -0.65, xPunch: -1.35, xOut: -2.03 };
    K.box(PM.x1 - PM.x0, 0.55, PM.z1 - PM.z0, m.iron, (PM.x0 + PM.x1) / 2, 0.68, PM.cz, st);
    K.box(PM.x1 - PM.x0 + 0.08, 0.06, PM.z1 - PM.z0 + 0.08, m.brass, (PM.x0 + PM.x1) / 2, 0.98, PM.cz, st);
    K.box(PM.x1 - PM.x0 - 0.1, 0.1, 0.55, m.ironL, (PM.x0 + PM.x1) / 2, 1.07, PM.cz, st);
    for (const z of [PM.cz - 0.2, PM.cz + 0.2]) K.box(PM.x1 - PM.x0 - 0.05, 0.05, 0.05, m.brassL, (PM.x0 + PM.x1) / 2, 1.15, z, st); // carriage rails
    for (let i = 0; i < 8; i++) { K.box(0.06, 0.06, 0.06, m.brassL, PM.x0 + 0.12 + i * 0.24, 0.92, PM.z1 + 0.02, st); }
    // in / out mouths
    for (const x of [PM.x1 - 0.05, PM.x0 + 0.05]) { K.box(0.08, 0.24, 0.66, m.brassD, x, 1.24, PM.cz, st); }
    // punch frame (side plates + crossbar)
    for (const z of [PM.z0 + 0.05, PM.z1 - 0.05]) {
      K.box(0.5, 1.4, 0.1, m.ironM, PM.xPunch, 1.65, z, st);
      K.box(0.56, 0.08, 0.14, m.brass, PM.xPunch, 2.38, z, st);
      for (const y of [1.15, 1.6, 2.05]) K.box(0.06, 0.06, 0.06, m.brassL, PM.xPunch + 0.2, y, z + (z > PM.cz ? 0.06 : -0.06), st);
    }
    K.box(0.6, 0.16, 0.98, m.ironL, PM.xPunch, 2.45, PM.cz, st);
    for (const z of [PM.cz - 0.2, PM.cz + 0.2]) K.cyl(0.035, 0.035, 0.75, m.ironX, 6, PM.xPunch, 2.05, z, st);
    // blank-card hopper on top
    K.box(0.62, 0.36, 0.5, m.brassD, PM.xPunch, 2.71, PM.cz, st);
    for (let i = 0; i < 6; i++) K.box(0.5, 0.03, 0.4, i % 2 ? m.creamD : K.mat(0xa89070), PM.xPunch, 2.92 + i * 0.035, PM.cz, st);
    K.box(0.66, 0.05, 0.54, m.brass, PM.xPunch, 2.55, PM.cz, st);
    // ticker lamps on the front face
    const tick = []; for (let i = 0; i < 6; i++) { const lm = K.mat(0x2a1a10, { e: 0 }); K.box(0.13, 0.1, 0.03, lm, PM.x0 + 0.25 + i * 0.28, 0.72, PM.z1 + 0.02, dyn); tick.push(lm); }
    // the moving bits
    const carriage = K.group(dyn, PM.xIn, PM.bed, PM.cz);
    K.box(0.56, 0.04, 0.5, m.brass, 0, -0.02, 0, carriage); K.box(0.06, 0.08, 0.5, m.brassD, 0.27, 0.02, 0, carriage); K.box(0.06, 0.08, 0.5, m.brassD, -0.27, 0.02, 0, carriage);
    const carAnchor = K.group(carriage, 0, 0.02, 0);
    const ram = K.group(dyn, PM.xPunch, 2.1, PM.cz);
    K.box(0.42, 0.26, 0.5, m.ironX, 0, 0, 0, ram); K.box(0.44, 0.06, 0.52, m.hazard, 0, -0.1, 0, ram);
    for (let i = 0; i < 6; i++) K.box(0.04, 0.08, 0.04, m.ink, -0.15 + (i % 3) * 0.15, -0.17, -0.1 + Math.floor(i / 3) * 0.2, ram);
    K.box(0.1, 0.06, 0.12, m.brassL, 0, 0.0, 0.31, ram);
    const flyC = new V3(-0.82, 1.42, PM.z1 + 0.1), FLY_R = 0.32, PIN_R = 0.22;
    const fly = K.group(dyn, flyC.x, flyC.y, flyC.z);
    { const w = K.cyl(FLY_R, FLY_R, 0.08, m.ironL, 18, 0, 0, 0, fly); w.rotation.x = Math.PI / 2;
      K.torus(FLY_R, 0.04, m.brassD, 4, 20, 0, 0, 0.03, fly);
      for (let i = 0; i < 4; i++) { const s = K.box(FLY_R * 1.9, 0.05, 0.05, m.brass, 0, 0, 0.05, fly); s.rotation.z = i * Math.PI / 4; }
      K.cyl(0.05, 0.05, 0.12, m.brassL, 8, PIN_R, 0, 0.06, fly).rotation.x = Math.PI / 2; }
    K.cyl(0.06, 0.06, 0.25, m.ironM, 8, flyC.x, flyC.y, flyC.z - 0.12, st).rotation.x = Math.PI / 2;
    const conrod = K.box(1, 0.06, 0.04, m.brassD, 0, 0, 0, dyn); conrod.position.z = flyC.z + 0.12;
    // punched-card ribbon streaming out of the front slot into a basket
    K.box(0.5, 0.04, 0.08, m.soot, PM.xPunch, 0.98, PM.z1 + 0.02, st);
    { const bx = PM.xPunch, bz = 2.22; K.box(0.7, 0.05, 0.34, m.woodD, bx, 0.43, bz, st); for (const s of [-1, 1]) { K.box(0.7, 0.24, 0.04, m.wood, bx, 0.55, bz + s * 0.16, st); K.box(0.04, 0.24, 0.34, m.wood, bx + s * 0.34, 0.55, bz, st); } for (let i = 0; i < 4; i++) K.box(0.5, 0.025, 0.24, i % 2 ? m.cream : m.creamD, bx, 0.48 + i * 0.03, bz, st).rotation.y = (i - 1.5) * 0.15; }
    const ribbon = [];
    for (let i = 0; i < 8; i++) { const c = K.group(dyn); K.box(0.36, 0.02, 0.26, i % 2 ? m.cream : m.creamD, 0, 0, 0, c); for (let h = 0; h < 3; h++) K.box(0.05, 0.025, 0.05, m.ink, -0.1 + h * 0.1, 0.002, -0.05 + (h % 2) * 0.1, c); ribbon.push(c); }
    // "?" card that pops out of the hopper when blocked
    const qTex = K.canvasTex(16, 16, (c) => { c.fillStyle = '#f0dfb4'; c.fillRect(0, 0, 16, 16); c.fillStyle = '#c8321e'; c.fillRect(5, 2, 6, 2); c.fillRect(10, 3, 2, 4); c.fillRect(7, 7, 4, 2); c.fillRect(7, 9, 2, 2); c.fillRect(7, 12, 2, 2); });
    const qCard = K.group(dyn, PM.xPunch, 3.2, PM.cz); const qm = K.mat(0xffffff, { map: qTex, e: 0x221100 });
    K.box(0.42, 0.42, 0.03, qm, 0, 0, 0, qCard).rotation.y = Math.PI / 4; qCard.visible = false;

    // =================================================================
    // ARM A: articulated brass arm with IK and a two-finger gripper
    // =================================================================
    function buildArm(px, pz, L1, L2) {
      K.cyl(0.38, 0.45, 0.32, m.ironM, 12, px, 0.56, pz, st); band(st, px, pz, 0.42, 0.72, m.brass, 0.06); rivetRing(st, px, pz, 0.44, 0.5, 12);
      K.tube([[px + 0.3, 0.45, pz - 0.2], [px + 0.7, 0.42, pz - 0.6], [px + 0.9, 0.42, pz - 1.4]], 0.04, m.soot, st, 10, 4); // power hose
      const yawG = K.group(dyn, px, 0.75, pz);
      K.cyl(0.3, 0.32, 0.16, m.brass, 12, 0, 0.08, 0, yawG);
      K.box(0.36, 0.3, 0.34, m.ironL, 0, 0.3, 0, yawG); K.box(0.38, 0.05, 0.36, m.brassD, 0, 0.46, 0, yawG);
      const sh = K.group(yawG, 0, 0.42, 0);
      K.sph(0.16, m.brassD, 0, 0, 0, sh, 10, 8);
      const sg = gear(sh, 0.17, 0.06, 10, m.brassL, 0, 0, 0.17); sg.rotation.x = Math.PI / 2;
      K.box(L1, 0.14, 0.14, m.brass, L1 / 2, 0, 0, sh);
      K.box(L1 * 0.72, 0.05, 0.05, m.ironX, L1 * 0.46, 0.11, 0.07, sh);
      K.box(L1 * 0.4, 0.08, 0.08, m.ironL, L1 * 0.28, 0.11, 0.07, sh);
      for (let i = 0; i < 4; i++) K.box(0.05, 0.16, 0.16, m.brassD, 0.15 + i * L1 * 0.24, 0, 0, sh);
      const el = K.group(sh, L1, 0, 0);
      K.sph(0.13, m.brassD, 0, 0, 0, el, 10, 8);
      const eg = gear(el, 0.13, 0.05, 8, m.brassL, 0, 0, -0.14); eg.rotation.x = Math.PI / 2;
      K.box(L2, 0.11, 0.11, m.brass, L2 / 2, 0, 0, el);
      K.box(L2 * 0.6, 0.045, 0.045, m.copper, L2 * 0.45, -0.09, 0.05, el);
      const wr = K.group(el, L2, 0, 0);
      const wc = K.cyl(0.085, 0.085, 0.18, m.brassD, 10, 0, 0, 0, wr); wc.rotation.x = Math.PI / 2;
      K.box(0.26, 0.07, 0.18, m.ironL, 0, -0.1, 0, wr);
      K.box(0.1, 0.06, 0.1, m.brassL, 0, -0.03, 0, wr);
      const f1 = K.group(wr, -0.2, -0.12, 0), f2 = K.group(wr, 0.2, -0.12, 0);
      for (const [f, s] of [[f1, 1], [f2, -1]]) { K.box(0.05, 0.3, 0.14, m.ironX, 0, -0.14, 0, f); K.box(0.08, 0.07, 0.14, m.brassL, s * 0.02, -0.28, 0, f); }
      const anchor = K.group(wr, 0, -0.3, 0);
      return { yawG, sh, el, wr, f1, f2, anchor, S: new V3(px, 0.75 + 0.42, pz), L1, L2 };
    }
    function solveArm(A, W, grip) {
      const dx = W.x - A.S.x, dz = W.z - A.S.z, dy = W.y - A.S.y;
      const r = Math.max(0.05, Math.hypot(dx, dz));
      A.yawG.rotation.y = Math.atan2(-dz, dx);
      const Dd = Math.max(Math.abs(A.L1 - A.L2) + 0.02, Math.min(A.L1 + A.L2 - 0.01, Math.hypot(r, dy)));
      const c2 = (Dd * Dd - A.L1 * A.L1 - A.L2 * A.L2) / (2 * A.L1 * A.L2);
      const q2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
      const q1 = Math.atan2(dy, r) + Math.atan2(A.L2 * Math.sin(-q2), A.L1 + A.L2 * Math.cos(q2));
      A.sh.rotation.z = q1; A.el.rotation.z = q2; A.wr.rotation.z = -(q1 + q2);
      const sp = lerp(0.29, 0.21, grip); A.f1.position.x = -sp; A.f2.position.x = sp;
    }
    const ARM = buildArm(0.55, 1.85, 0.95, 0.85);
    const W_PARK = new V3(0.35, 2.2, 1.45), W_TRAY_UP = new V3(TRAY.x, 2.05, TRAY.z), W_TRAY = new V3(TRAY.x, 1.0 + 0.2 + 0.3, TRAY.z);
    const W_PM_UP = new V3(PM.xIn, 2.2, PM.cz), W_PM = new V3(PM.xIn, PM.bed + 0.02 + 0.2 + 0.3, PM.cz);
    function along(pts, k) { // piecewise path through points, each leg eased
      const n = pts.length - 1; const f = Math.min(n - 1e-6, Math.max(0, k * n)); const i = Math.floor(f);
      return v.copy(pts[i]).lerp(pts[i + 1], sm(f - i));
    }

    // =================================================================
    // GANTRY CLAW: A-frame post, cantilevered I-beam, trolley, telescoping rod, three-finger claw
    // =================================================================
    const GP = new V3(-2.3, 0, 2.25), GU = new V3(0.7, 0, -2.1).normalize(), BEAM_Y = 3.05;
    const S_OUT = 0.84, S_CUP = 2.21;
    {
      K.box(0.2, BEAM_Y - 0.4, 0.2, m.iron, GP.x, (BEAM_Y + 0.4) / 2, GP.z, st);
      K.box(0.36, 0.1, 0.36, m.brassD, GP.x, 0.45, GP.z, st);
      for (const y of [1.2, 2.2]) K.box(0.24, 0.07, 0.24, m.brass, GP.x, y, GP.z, st);
      const br = K.box(0.08, 1.5, 0.08, m.ironM, GP.x - GU.x * 0.45, 2.45, GP.z - GU.z * 0.45, st); br.rotation.set(GU.z * 0.5, 0, -GU.x * 0.5);
    }
    const beam = K.group(st, GP.x, BEAM_Y, GP.z); beam.rotation.y = Math.atan2(-GU.z, GU.x);
    K.box(2.75, 0.06, 0.24, m.ironL, 1.15, 0.12, 0, beam); K.box(2.75, 0.06, 0.24, m.ironL, 1.15, -0.12, 0, beam); K.box(2.75, 0.2, 0.05, m.iron, 1.15, 0, 0, beam);
    hazardBand(beam, 2.6, 1.15, 0.0, 0.13, 13, false);
    K.box(0.06, 0.32, 0.3, m.brassD, 2.52, 0, 0, beam);
    // diagonal strut from the post to mid beam
    const strut = K.box(0.08, 0.08, 1.3, m.ironM, 0.55, -0.42, 0, beam); strut.rotation.set(0, Math.PI / 2, 0.55); strut.position.set(0.5, -0.32, 0);
    const trolley = K.group(dyn); const tRot = Math.atan2(-GU.z, GU.x); trolley.rotation.y = tRot;
    K.box(0.42, 0.16, 0.36, m.rust, 0, 0, 0, trolley); for (const sx of [-0.14, 0.14]) for (const sz of [-0.15, 0.15]) { const wh = K.cyl(0.06, 0.06, 0.04, m.ironX, 8, sx, 0.12, sz, trolley); wh.rotation.x = Math.PI / 2; }
    K.box(0.18, 0.4, 0.18, m.ironM, 0, -0.26, 0, trolley);
    const rod = K.cyl(0.05, 0.05, 1, m.ironX, 6, 0, 0, 0, trolley);
    const head = K.group(trolley);
    K.cyl(0.14, 0.17, 0.14, m.brass, 10, 0, 0, 0, head); K.cyl(0.06, 0.06, 0.08, m.brassL, 8, 0, 0.1, 0, head);
    const clawF = [];
    for (let i = 0; i < 3; i++) { const fg = K.group(head); fg.rotation.y = i * Math.PI * 2 / 3; const piv = K.group(fg, 0, -0.06, 0.12); K.box(0.06, 0.32, 0.05, m.ironX, 0, -0.16, 0, piv); K.box(0.07, 0.06, 0.09, m.brassL, 0, -0.31, -0.03, piv); clawF.push(piv); }
    const clawAnchor = K.group(head, 0, -0.32, 0);
    function placeClaw(s, headY, grip) {
      trolley.position.set(GP.x + GU.x * s, BEAM_Y - 0.25, GP.z + GU.z * s);
      const ext = Math.max(0.3, (BEAM_Y - 0.25) - headY);
      rod.scale.y = ext; rod.position.y = -ext / 2; head.position.y = -ext;
      clawF.forEach((f) => (f.rotation.x = lerp(-0.55, -0.08, grip)));
    }

    // =================================================================
    // front-right: small parts bench, capsule shells, oil can; CAUTION + STATUS LAMP; aether socket; light
    // =================================================================
    {
      const bx = 1.7, bz = 0.55;
      K.box(1.1, 0.08, 0.6, m.wood, bx, 1.08, bz, st); K.box(1.14, 0.04, 0.64, m.brassD, bx, 1.13, bz, st);
      for (const sx of [-0.48, 0.48]) for (const sz of [-0.24, 0.24]) K.box(0.08, 0.68, 0.08, m.iron, bx + sx, 0.72, bz + sz, st);
      K.box(0.9, 0.05, 0.45, m.woodD, bx, 0.6, bz, st);
      for (let i = 0; i < 3; i++) { const c = K.cyl(0.11, 0.11, 0.36, m.brass, 10, bx - 0.3 + i * 0.25, 1.26, bz - 0.1, st); c.rotation.z = Math.PI / 2; }
      K.box(0.26, 0.18, 0.2, m.ironL, bx + 0.35, 1.22, bz + 0.12, st);
      K.cyl(0.08, 0.1, 0.22, m.verd, 8, bx - 0.4, 1.23, bz + 0.15, st); K.cyl(0.015, 0.03, 0.2, m.brass, 4, bx - 0.36, 1.4, bz + 0.15, st);
      for (let i = 0; i < 3; i++) K.box(0.4, 0.3, 0.4, m.woodD, 2.0 + (i % 2) * 0.05, 0.56 + i * 0.3, -0.25, st).rotation.y = i * 0.25;
    }
    const caution = K.caution(dyn, 2.12, 0.4, 2.12, 0.95);
    const lamp = K.statusLamp(dyn, 1.35, 0.4, 2.2, 1.1);
    // aether socket: junction box just behind the back face, teal conduit up into the drum
    const SOCK = new V3(0.14, 0.35, -3.54);
    K.box(0.62, 0.5, 0.5, m.ironM, SOCK.x, 0.36, SOCK.z, st); K.box(0.66, 0.06, 0.54, m.brass, SOCK.x, 0.63, SOCK.z, st);
    for (const sx of [-0.25, 0.25]) K.box(0.08, 0.26, 0.08, m.iron, SOCK.x + sx, 0.12, SOCK.z, st);
    const sockM = K.glow(0x7af0d8);
    K.box(0.3, 0.16, 0.02, sockM, SOCK.x, 0.42, SOCK.z + 0.26, dyn);
    K.tube([[SOCK.x, 0.5, SOCK.z + 0.2], [0.0, 0.62, -2.9], [-0.4, 0.7, -2.4]], 0.08, m.glassR, st, 12, 8);
    const sockPipeM = K.glow(0x2a8a78, 0.85);
    K.tube([[SOCK.x, 0.5, SOCK.z + 0.2], [0.0, 0.62, -2.9], [-0.4, 0.7, -2.4]], 0.045, sockPipeM, dyn, 12, 6);
    for (const k of [0.3, 0.7]) K.torus(0.1, 0.025, m.brassL, 4, 10, lerp(SOCK.x, -0.4, k), lerp(0.5, 0.7, k), lerp(SOCK.z + 0.2, -2.4, k), st);
    const workL = K.light(0xffb070, 1.0, 6, -0.4, 2.3, 2.2, g);

    // bake every static mesh (huge draw-call saving); moving parts live in dyn
    K.bake(st);

    // =================================================================
    // THE LINE INSIDE THE MACHINE
    // =================================================================
    const ARMS = { ph: 'park', t: 0, item: null };
    const PMS = { ph: 'empty', t: 0, item: null, decided: false, reserved: false, transformed: false, flyA: 0, lastStrike: 0 };
    const CLAW = { ph: 'park', t: 0, item: null };
    const ENG = { ph: 'empty', t: 0, item: null, reserved: false, turned: false };
    const AMBIG = ['which checkout flow?', 'repro steps missing', 'two specs disagree', 'needs a product call', 'which API version?', 'fix or redesign?'];
    const ROT_FLAT = -Math.PI / 4; // item axes aligned to the machine's local axes (root yaw)
    let gripA = 0, clawGrip = 0, lidOpen = 0, clawS = S_OUT, clawY = 2.45, speedG = 0.3, ribbonOff = 0, tTick = 0, tPuff = 0, tSpark = 0, compile = 0;
    const engPos = new V3();
    const engAnchor = K.group(dyn);
    const D_RISE0 = 1.05, D_TOP = 3.55, D_EXIT = 4.42;

    function stepArm(dt) {
      const A = ARMS; A.t += dt;
      if (A.ph === 'park') {
        solveArm(ARM, along([W_PARK, W_PARK], 0), gripA = Math.max(0, gripA - dt * 4));
        if (M.waiting('in') && PMS.ph === 'empty' && !PMS.reserved) { A.ph = 'reach'; A.t = 0; PMS.reserved = true; }
        return;
      }
      if (A.ph === 'reach') { const k = cl(A.t / 0.95); gripA = Math.max(0, gripA - dt * 5); solveArm(ARM, along([W_PARK, W_TRAY_UP, W_TRAY], k), gripA); if (k >= 1) { A.ph = 'grip'; A.t = 0; } return; }
      if (A.ph === 'grip') {
        if (!A.item) { const it = M.take('in'); if (!it) { A.ph = 'back'; A.t = 0; PMS.reserved = false; return; } A.item = it; it.mesh.rotation.set(0, ROT_FLAT, 0); it.follow(ARM.anchor, 0, -0.2, 0); }
        gripA = cl(A.t / 0.25); solveArm(ARM, W_TRAY, gripA); if (A.t >= 0.3) { A.ph = 'carry'; A.t = 0; } return;
      }
      if (A.ph === 'carry') { const k = cl(A.t / 1.05); solveArm(ARM, along([W_TRAY, W_TRAY_UP, W_PM_UP, W_PM], k), 1); if (k >= 1) { A.ph = 'release'; A.t = 0; } return; }
      if (A.ph === 'release') {
        gripA = 1 - cl(A.t / 0.25); solveArm(ARM, W_PM, gripA);
        if (A.item && A.t >= 0.12) { const it = A.item; it.follow(carAnchor, 0, 0, 0); it.mesh.rotation.set(0, ROT_FLAT, 0); PMS.item = it; PMS.ph = 'loaded'; PMS.t = 0; PMS.decided = false; PMS.transformed = false; A.item = null; }
        if (A.t >= 0.3) { A.ph = 'back'; A.t = 0; } return;
      }
      if (A.ph === 'back') { const k = cl(A.t / 0.7); solveArm(ARM, along([W_PM, W_PM_UP, W_PARK], k), 0); if (k >= 1) { A.ph = 'park'; A.t = 0; } }
    }
    function strike() {
      for (let i = 0; i < 8; i++) K.spawn(g, PM.xPunch + K.R() * 0.4, 1.55, PM.cz + K.R() * 0.4, K.R() * 2.4, 0.6 + Math.random() * 1.4, K.R() * 2.4, Math.random() < 0.5 ? 0xffd25a : 0xfff4d0, 0.4, 0.045, 6, true);
      for (let i = 0; i < 5; i++) K.spawn(g, PM.xPunch + K.R() * 0.3, 1.5, PM.cz + 0.3, K.R() * 1.2, 0.8 + Math.random(), 0.6 + Math.random() * 0.8, Math.random() < 0.5 ? C.cream : 0xffffff, 0.9, 0.04, 3.5);
    }
    function stepPM(dt) {
      const P = PMS; P.t += dt;
      let flySpeed = 0.6;
      if (P.ph === 'empty' || P.ph === 'loaded') carriage.position.x = PM.xIn;
      if (P.ph === 'loaded') { if (ARMS.ph === 'back' && ARMS.t > 0.1) { P.ph = 'feed'; P.t = 0; } }
      else if (P.ph === 'feed') { const k = cl(P.t / 0.6); carriage.position.x = lerp(PM.xIn, PM.xPunch, sm(k)); flySpeed = 4; if (k >= 1) { P.ph = 'punch'; P.t = 0; } }
      else if (P.ph === 'punch') {
        carriage.position.x = PM.xPunch; flySpeed = 4 * Math.PI * 2 / 1.5;
        ribbonOff = (ribbonOff + dt * 1.1) % 1;
        if (!P.transformed && P.t > 1.25) { P.transformed = true; P.item.setKind('cards'); for (let i = 0; i < 10; i++) K.spawn(g, PM.xPunch + K.R() * 0.5, 1.5, PM.cz + K.R() * 0.5, K.R() * 1.5, 1 + Math.random(), K.R() * 1.5, C.cream, 0.8, 0.05, 3); }
        if (P.t >= 1.5) {
          if (!P.decided) { P.decided = true; const it = P.item; if (M.maybeDecision('#' + it.id + ' unclear: ' + AMBIG[it.id % AMBIG.length])) return; }
          P.ph = 'eject'; P.t = 0;
        }
      }
      else if (P.ph === 'eject') { const k = cl(P.t / 0.5); carriage.position.x = lerp(PM.xPunch, PM.xOut, sm(k)); flySpeed = 1.5; if (k >= 1) { P.ph = 'ready'; P.t = 0; } }
      else if (P.ph === 'ready') carriage.position.x = PM.xOut;
      else if (P.ph === 'return') { const k = cl(P.t / 0.45); carriage.position.x = lerp(PM.xOut, PM.xIn, sm(k)); if (k >= 1) { P.ph = 'empty'; P.t = 0; P.reserved = false; } }
      // flywheel + crank-driven ram
      const prev = P.flyA; P.flyA += dt * flySpeed;
      const ph = P.flyA; fly.rotation.z = ph;
      const ramY = 1.765 + 0.38 * (0.5 + 0.5 * Math.cos(ph + Math.PI));
      ram.position.y = P.ph === 'punch' ? 2.145 - 0.38 * (0.5 - 0.5 * Math.cos(ph)) : ram.position.y + (2.12 - ram.position.y) * Math.min(1, dt * 6);
      // strike when the crank passes bottom (cos = -1)
      if (P.ph === 'punch' && Math.floor((prev - Math.PI) / (Math.PI * 2)) !== Math.floor((ph - Math.PI) / (Math.PI * 2))) strike();
      void ramY;
      const pin = v2.set(flyC.x + Math.cos(ph) * PIN_R, flyC.y + Math.sin(ph) * PIN_R, 0);
      K.link(conrod, pin.x, pin.y, PM.xPunch + 0.08, ram.position.y + 0.02);
    }
    function stepClaw(dt) {
      const Cl = CLAW; Cl.t += dt;
      const UP = 2.45, AT_OUT = PM.bed + 0.02 + 0.17 + 0.32, AT_CUP = CUP.y + 0.17 + 0.32;
      if (Cl.ph === 'park') { clawS += (S_OUT - clawS) * Math.min(1, dt * 4); clawY += (UP - clawY) * Math.min(1, dt * 4); clawGrip = Math.max(0, clawGrip - dt * 4);
        if (PMS.ph === 'ready' && ENG.ph === 'empty' && !ENG.reserved) { Cl.ph = 'down'; Cl.t = 0; ENG.reserved = true; } }
      else if (Cl.ph === 'down') { const k = cl(Cl.t / 0.45); clawS = S_OUT; clawY = lerp(UP, AT_OUT, sm(k)); if (k >= 1) { Cl.ph = 'grip'; Cl.t = 0; } }
      else if (Cl.ph === 'grip') {
        if (!Cl.item) { Cl.item = PMS.item; PMS.item = null; PMS.ph = 'return'; PMS.t = 0; Cl.item.follow(clawAnchor, 0, -0.17, 0); }
        clawGrip = cl(Cl.t / 0.22); if (Cl.t >= 0.28) { Cl.ph = 'up'; Cl.t = 0; } }
      else if (Cl.ph === 'up') { const k = cl(Cl.t / 0.35); clawY = lerp(AT_OUT, UP, sm(k)); if (k >= 1) { Cl.ph = 'travel'; Cl.t = 0; } }
      else if (Cl.ph === 'travel') { const k = cl(Cl.t / 0.65); clawS = lerp(S_OUT, S_CUP, sm(k)); if (k >= 1) { Cl.ph = 'lower'; Cl.t = 0; } }
      else if (Cl.ph === 'lower') { const k = cl(Cl.t / 0.35); clawS = S_CUP; clawY = lerp(UP, AT_CUP, sm(k)); if (k >= 1) { Cl.ph = 'release'; Cl.t = 0; } }
      else if (Cl.ph === 'release') {
        clawGrip = 1 - cl(Cl.t / 0.2);
        if (Cl.item && Cl.t >= 0.1) { const it = Cl.item; engAnchor.position.set(CUP.x, CUP.y, CUP.z); it.follow(engAnchor, 0, 0, 0); ENG.item = it; ENG.ph = 'load'; ENG.t = 0; ENG.turned = false; Cl.item = null; }
        if (Cl.t >= 0.24) { Cl.ph = 'retract'; Cl.t = 0; } }
      else if (Cl.ph === 'retract') { const k = cl(Cl.t / 0.3); clawY = lerp(AT_CUP, UP, sm(k)); if (k >= 1) { Cl.ph = 'return'; Cl.t = 0; if (ENG.ph === 'load') { ENG.ph = 'slide'; ENG.t = 0; } } }
      else if (Cl.ph === 'return') { const k = cl(Cl.t / 0.6); clawS = lerp(S_CUP, S_OUT, sm(k)); if (k >= 1) { Cl.ph = 'park'; Cl.t = 0; } }
      placeClaw(clawS, clawY, clawGrip);
    }
    function stepEngine(dt) {
      const E = ENG; E.t += dt;
      const want = E.ph === 'load' ? 1 : 0; lidOpen += (want - lidOpen) * Math.min(1, dt * 8);
      if (CLAW.ph === 'travel' && CLAW.t > 0.3) lidOpen += (1 - lidOpen) * Math.min(1, dt * 8);
      lidPiv.rotation.z = lidOpen * 1.9;
      compile = Math.max(0, compile - dt * 0.6);
      if (E.ph === 'load') engAnchor.position.set(CUP.x, CUP.y, CUP.z);
      else if (E.ph === 'slide') {
        const k = cl(E.t / 0.65); engPos.set(CUP.x, CUP.y, CUP.z).lerp(v.set(D.x, D_RISE0, D.z), sm(k)); engAnchor.position.copy(engPos);
        if (k >= 1) { E.ph = 'rise'; E.t = 0; }
      } else if (E.ph === 'rise') {
        compile = 1;
        const k = cl(E.t / 1.35), y = lerp(D_RISE0, D_TOP, k * k * (3 - 2 * k));
        engAnchor.position.set(D.x, y, D.z);
        if (!E.turned && y > 3.0) { E.turned = true; const it = E.item; it.setKind('capsule'); it.mesh.rotation.set(0, 0, Math.PI / 2); it.follow(engAnchor, 0.2, 0, 0); for (let i = 0; i < 14; i++) K.spawn(g, D.x + K.R() * 0.4, 3.2, D.z + K.R() * 0.4, K.R() * 2, Math.random() * 2, K.R() * 2, 0xffd890, 0.5, 0.05, 0, true); }
        if (k >= 1) { E.ph = 'top'; E.t = 0; }
      } else if (E.ph === 'top') {
        const k = cl(E.t / 0.35); engAnchor.position.set(D.x, lerp(D_TOP, D_EXIT, sm(k)), D.z);
        if (k >= 1) { if (M.give(E.item, 'out')) { E.item = null; E.ph = 'vent'; E.t = 0; for (let i = 0; i < 10; i++) puff(BO.x + 0.4, BO.y + 3.4, BO.z + 0.3, 0xd8ccb8, 0.16, 2.0, 0.1, 1.2, 0.3, 0.3); } }
      } else if (E.ph === 'vent') { if (E.t > 0.4) { E.ph = 'empty'; E.t = 0; E.reserved = false; } }
    }

    function detail() {
      const s = [];
      if (ENG.item) s.push(ENG.item.label() + (ENG.ph === 'top' && ENG.t > 0.4 ? ' · tube backed up' : ENG.ph === 'rise' ? ' · compiling the PR' : ' · loading the engine'));
      if (CLAW.item) s.push(CLAW.item.label() + ' · claw to engine');
      if (PMS.item) s.push(PMS.item.label() + (PMS.ph === 'punch' ? ' · punching cards' : PMS.ph === 'ready' || PMS.ph === 'eject' ? ' · cards bound' : ' · feeding the punch'));
      if (ARMS.item) s.push(ARMS.item.label() + ' · arm picking up');
      if (!s.length && ARMS.ph === 'reach') { const w = M.waiting('in'); if (w) s.push(w.label() + ' · arm reaching'); }
      return s.slice(0, 2).join('  ');
    }
    function rework(it) { return it && it.attempts > 0; }

    return { g, update(t, dt) {
      const blk = M.blocked;
      const run = blk ? 0 : dt;
      stepArm(run); stepPM(run); stepClaw(run); stepEngine(run);
      const busy = ARMS.ph !== 'park' || PMS.ph !== 'empty' || CLAW.ph !== 'park' || ENG.ph !== 'empty';
      if (!blk) {
        if (busy) { let d = detail(); const r = [ARMS.item, PMS.item, CLAW.item, ENG.item].find(rework); if (r && d.indexOf(r.label()) === 0) d = 'rework ' + d; M.setState('WORKING', d); }
        else M.setState('IDLE', 'waiting for issues');
      }
      const S = M.stateShown, work = S === 'WORKING';
      lamp.set(S, t); caution.update(t, dt, S);
      // tray arrival lamp
      const waiting = !!M.waiting('in');
      trayLampM.emissive.setHex(waiting ? (Math.sin(t * 8) > 0 ? 0xffb020 : 0x5a3a08) : 0);
      // gear stacks: slow idle, fast working, roaring while compiling, jittering when blocked
      const target = blk ? 0 : work ? 1.2 + compile * 3.5 : 0.25;
      speedG += (target - speedG) * Math.min(1, dt * 3);
      stacks.forEach((s, i) => { s.col.children.forEach((gg, j) => (gg.rotation.y += dt * speedG * s.dir * (j % 2 ? 1.3 : -1))); s.col.rotation.y = blk ? Math.sin(t * 40 + i) * 0.03 : 0; });
      counters.forEach((w, i) => (w.rotation.x += dt * (compile > 0.1 ? 6 / (i + 1) : 0)));
      riserGlowM.opacity = blk ? 0.12 + 0.12 * Math.max(0, Math.sin(t * 10)) : 0.03 + compile * 0.2;
      riserGlowM.color.setHex(blk ? 0xff4020 : 0xffb45a);
      crownM.color.setHex(blk ? (Math.sin(t * 10) > 0 ? 0xff4020 : 0x401008) : work ? 0xe0a050 : 0x6a4a22);
      const riding = ENG.ph === 'rise' || ENG.ph === 'top' || ENG.ph === 'slide';
      collarM.opacity += ((riding ? 0.85 : 0) - collarM.opacity) * Math.min(1, dt * 8);
      collar.position.y = Math.max(1.1, engAnchor.position.y + 0.2); collar2.position.y = Math.max(1.1, engAnchor.position.y - 0.12 - 0.15 * Math.abs(Math.sin(t * 9)));
      collarM.color.setHex(blk ? 0xff5030 : ENG.turned ? 0xffb050 : 0xfff0c0);
      if (riding && !blk && ENG.ph === 'rise' && Math.random() < 0.7) K.spawn(g, D.x + K.R() * 0.4, engAnchor.position.y - 0.4, D.z + K.R() * 0.4, 0, 2.6, 0, 0xfff0c0, 0.35, 0.035, 0, true);
      // gauges: low idle, swinging working, redlined + shaking blocked
      needles.forEach((n, i) => { n.rotation.z = blk ? -1.2 + Math.sin(t * 34 + i) * 0.06 : work ? 0.25 - compile * 0.5 + Math.sin(t * 2.3 + i) * 0.3 : 0.95 + Math.sin(t * 0.7 + i) * 0.05; });
      // firebox
      const ff = 0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 6.1) * 0.07;
      fireM.color.setRGB(1, (blk ? 0.32 : work ? 0.58 : 0.38) * ff, (blk ? 0.12 : 0.2) * ff);
      alarmM.emissive.setHex(blk && Math.sin(t * 9) > 0 ? 0xff2a10 : 0);
      sockM.color.setHex(blk ? (Math.sin(t * 7) > 0 ? 0xff5030 : 0x401008) : work ? 0x9afff0 : 0x2a6a5e);
      sockPipeM.color.setRGB(blk ? 0.6 : 0.16 + 0.12 * Math.sin(t * 5), blk ? 0.12 : (work ? 0.75 : 0.42) + 0.12 * Math.sin(t * 5), blk ? 0.08 : (work ? 0.66 : 0.38));
      if (!workL.isDummy) { workL.intensity = blk ? 0.8 + Math.max(0, Math.sin(t * 9)) * 0.9 : work ? 1.0 : 0.5; workL.color.setHex(blk ? 0xff5030 : 0xffb070); }
      // ticker lamps on the punch
      tTick -= dt; if (tTick <= 0) { tTick = work ? 0.1 : 0.5; tick.forEach((lm, i) => lm.emissive.setHex(blk ? (Math.sin(t * 9 + i) > 0 ? 0xc02010 : 0) : Math.random() < (PMS.ph === 'punch' ? 0.6 : 0.2) ? (work ? 0xffa84a : 0x5a3a1a) : 0)); }
      // punched-card ribbon: out of the front slot, folds down into the basket
      ribbon.forEach((c, i) => {
        const p = (i / ribbon.length + ribbonOff) % 1;
        if (p < 0.3) { const q = p / 0.3; c.position.set(PM.xPunch, 0.98 - q * 0.02, PM.z1 + 0.04 + q * 0.18); c.rotation.set(q * 0.4, 0, 0); }
        else { const q = (p - 0.3) / 0.7; c.position.set(PM.xPunch + Math.sin(i * 2.1) * 0.06 * q, 0.96 - q * 0.42, PM.z1 + 0.22 + q * 0.12); c.rotation.set(0.4 + q * 1.2 * (i % 2 ? 1 : -1) * 0.5, (i % 2 ? 0.2 : -0.2) * q, 0); }
        c.visible = PMS.ph === 'punch' || p > 0.3;
      });
      // "?" card bobbing out of the hopper while blocked
      qCard.visible = blk; if (blk) { qCard.position.y = 3.3 + Math.sin(t * 3) * 0.08; qCard.rotation.y = Math.sin(t * 1.5) * 0.4; }
      // steam: whistle while compiling, hard venting when blocked, lazy stack otherwise
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = blk ? 0.035 : 0.12;
        if (blk) { puff(BO.x + 0.4, BO.y + 3.35, BO.z + 0.3, 0xb8ae9e, 0.16, 2.4, 0.08, 1.2, 0.7, 0.6); if (Math.random() < 0.4) puff(D.x + 0.9, 0.9, D.z + 1.1, 0x9a9284, 0.1, 1.0, 0.2, 1.0, 0.5, 0.6); }
        else if (Math.random() < (work ? 0.5 : 0.15)) puff(BO.x, BO.y + 3.9, BO.z, 0x4a4038, 0.2, 0.8, 0.1, 2.4, 0.2, 0.1);
        if (!blk && compile > 0.5 && Math.random() < 0.6) puff(BO.x + 0.4, BO.y + 3.35, BO.z + 0.3, 0xe8e0d0, 0.12, 1.8, 0.05, 1.0, 0.2, 0.2);
      }
      // gripper sparks as arm A closes on an item
      tSpark -= dt;
      if (ARMS.ph === 'grip' && ARMS.t < 0.2 && tSpark <= 0 && !blk) { tSpark = 0.05; ARM.anchor.getWorldPosition(v); g.worldToLocal(v); K.spawn(g, v.x, v.y, v.z, K.R() * 1.5, 0.5 + Math.random(), K.R() * 1.5, 0xfff0b0, 0.3, 0.04, 5, true); }
    } };
  });
})();
