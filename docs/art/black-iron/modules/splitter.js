// SPLITTER (Spark): the Aether Splitter as Spark's REVIEW + ROUTING station.
// NOTES: a capsule lands on the intake lift (front-left), rides it up, a teal tractor beam pulls it into the
// orrery, it orbits the aether core while rings spin up and scan rings sweep it (the core dims as the capsule
// passes in front so it reads), then sits at the front for the verdict:
//   PASS   -> green flash + check glyph, swings right, drops down the brass/glass chute (front-right face).
//   REJECT -> red flash + X glyph + klaxon, the beam FLINGS it out of the orrery into a red exterior glass chute
//             that spirals around the LEFT of the dome (in front of the columns, above the intake tower), it
//             stops in the open stamping cradle where the scar-tag ram slams it, then spirals down to the reject
//             outlet (back-left face, pinned port).
// Blocked = rings grind + judder, core amber/red, strobes, "!" glyph, steam from the dome vents.
(function () {
  'use strict';
  IRON.machine('splitter', function (K, M) {
    const THREE = K.THREE, V = THREE.Vector3;
    const DEG = Math.PI / 180;
    const clamp01 = (k) => Math.max(0, Math.min(1, k));
    const sm = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

    // ---------- materials: Black Iron palette, lifted for readability ----------
    const MT = {
      brass: K.mat(0xbc8c3c, { shine: 44, spec: 0x8a6a30 }),
      brassL: K.mat(0xe0b25c, { shine: 56, spec: 0xa8884a }),
      brassD: K.mat(0x7a5622, { shine: 24, spec: 0x3a2a10 }),
      brass2: K.mat(0xbc8c3c, { shine: 44, spec: 0x8a6a30, double: true }),
      copper: K.mat(0xa8582e, { shine: 36, spec: 0x7a4428 }),
      copperD: K.mat(0x6e3820, { shine: 20, spec: 0x3a1a0a }),
      iron: K.mat(0x463c33, { shine: 26, spec: 0x34343a }),
      ironM: K.mat(0x382f28, { shine: 18, spec: 0x26262a }),
      ironL: K.mat(0x625548, { shine: 30, spec: 0x3e3e44 }),
      soot: K.mat(0x1c1612),
      verdD: K.mat(0x2f6a58, { shine: 16 }),
      rust: K.mat(0x92421c), rustL: K.mat(0xb4622a), rustD: K.mat(0x5a2612),
      red: K.mat(0x9a2414, { shine: 22, spec: 0x4a1a10 }),
      cream: K.mat(0xe4d2a8),
      wood: K.mat(0x624228), woodD: K.mat(0x40291a),
      oil: K.mat(0x0a0a0e, { shine: 90, spec: 0x6a5a8a }),
      grime: K.mat(0x080605, { op: 0.45, depthWrite: false }),
      glass: K.mat(0xc6f2e4, { op: 0.2, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      glassR: K.mat(0xff8a6a, { op: 0.26, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      hazard: K.mat(0xd8a018), dark: K.mat(0x140f0b), ink: K.mat(0x140c06)
    };
    const stoneT = K.canvasTex(64, 64, (g) => {
      let s = 13; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#30261e'; g.fillRect(0, 0, 64, 64);
      const tones = ['#7e6c58', '#73634f', '#8a7862', '#6a5a48'];
      for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 22, 14);
        g.fillStyle = 'rgba(255,230,190,0.1)'; g.fillRect(x + 2, y + 1, 20, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 13, 22, 2);
      }
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(6,4,2,0.35)'; g.fillRect(r() * 60, r() * 60, 3 + r() * 8, 2 + r() * 5); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(110,50,20,0.25)'; g.fillRect(r() * 60, r() * 30, 2, 6 + r() * 20); }
    }, [4, 0.35]);
    const stoneM = K.mat(0xffffff, { map: stoneT });

    const g = K.group();
    const S = K.group(g); // static: baked at the end

    // ---------- helpers ----------
    const band = (p, r, y, m, h, seg, x, z) => K.cyl(r, r, h || 0.1, m || MT.brass, seg || 18, x || 0, y, z || 0, p);
    function rivetRing(p, r, y, n, m, cx, cz) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, m || MT.brassL, (cx || 0) + Math.cos(a) * r, y, (cz || 0) + Math.sin(a) * r, p); } }
    function gear(p, r, thick, teeth, m, x, y, z) {
      const gg = K.group(p, x, y, z);
      K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, gg);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
      K.cyl(r * 0.28, r * 0.28, thick * 1.6, MT.ironM, 8, 0, 0, 0, gg);
      if (r > 0.3) for (let i = 0; i < 3; i++) { const sp = K.box(r * 1.5, thick * 1.1, r * 0.12, MT.brassD, 0, 0, 0, gg); sp.rotation.y = i * Math.PI / 3; }
      return gg;
    }
    // gauge facing +z of its group (ry turns it); returns the needle pivot (rotate .z)
    function gauge(p, x, y, z, r, ry, rx, rimM) {
      const gg = K.group(p, x, y, z); gg.rotation.order = 'YXZ'; gg.rotation.y = ry || 0; gg.rotation.x = rx || 0;
      const rim = K.cyl(r * 1.15, r * 1.15, 0.07, rimM || MT.brass, 14, 0, 0, 0, gg); rim.rotation.x = Math.PI / 2;
      const face = K.cyl(r, r, 0.08, MT.cream, 14, 0, 0, 0.01, gg); face.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = -2.2 + i / 7 * 4.4; const tk = K.box(0.012, r * 0.18, 0.012, MT.ink, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0.055, gg); tk.rotation.z = -a; }
      const red = K.box(r * 0.5, r * 0.18, 0.02, K.mat(0xb02a1a), r * 0.45, r * 0.45, 0.055, gg); red.rotation.z = -0.8;
      const piv = K.group(gg, 0, 0, 0.06);
      K.box(0.03, r * 0.85, 0.02, MT.ink, 0, r * 0.38, 0, piv);
      K.cyl(0.025, 0.025, 0.03, MT.brassL, 6, 0, 0, 0.01, piv).rotation.x = Math.PI / 2;
      return piv;
    }
    const along = (m, a, b) => { // orient a unit box (1 along x) from a to b
      const d = new V().subVectors(b, a); const L = d.length();
      m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(L, 1, 1);
      m.quaternion.setFromUnitVectors(new V(1, 0, 0), d.normalize());
    };
    const rod = (p, a, b, w, m) => { const r = K.box(1, w, w, m, 0, 0, 0, p); along(r, a, b); r.scale.y = r.scale.z = 1; return r; };
    const P = (a, r, y) => new V(Math.cos(a) * r, y, Math.sin(a) * r);

    // ---------- geometry constants ----------
    const DAIS = 0.65, ORB_R = 1.22, ORB_Y = 2.85, CORE = new V(0, ORB_Y, 0);
    const ANG = { in: 110 * DEG, pass: -35 * DEG, rej: 135 * DEG, front: 45 * DEG };
    const TRAY = new V(-1.2, 1.0, 2.9), PLAT_UP = 2.65;
    const PASS_PORT = new V(2.9, 1.0, -0.9), REJ_PORT = new V(-2.9, 1.0, 0.9);

    // =====================================================================
    // DAIS: stepped octagon, brass rims, teal inlay, grime
    // =====================================================================
    K.cyl(2.55, 2.68, 0.32, stoneM, 8, 0, 0.16, 0, S);
    const rimT = K.torus(2.5, 0.05, MT.brassD, 4, 8, 0, 0.33, 0, S); rimT.rotation.x = Math.PI / 2;
    K.cyl(2.2, 2.3, 0.26, MT.ironM, 8, 0, 0.45, 0, S);
    K.cyl(2.24, 2.24, 0.05, MT.brassD, 8, 0, 0.6, 0, S);
    K.cyl(1.98, 1.98, 0.05, MT.iron, 8, 0, DAIS - 0.02, 0, S);
    rivetRing(S, 2.17, 0.5, 24);
    rivetRing(S, 2.5, 0.27, 32, MT.brassD);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; const sp = K.box(1.6, 0.02, 0.06, MT.soot, Math.cos(a) * 1.1, DAIS + 0.005, Math.sin(a) * 1.1, S); sp.rotation.y = -a; }
    const inlayM = K.glow(0x2e8a78);
    const inlay = K.torus(1.36, 0.04, inlayM, 4, 40, 0, DAIS + 0.01, 0, g); inlay.rotation.x = Math.PI / 2;
    const inlay2 = K.torus(0.62, 0.03, inlayM, 4, 28, 0, DAIS + 0.01, 0, g); inlay2.rotation.x = Math.PI / 2;
    for (const [x, z, sx, sz, y] of [[0.9, -1.1, 0.45, 0.25, DAIS + 0.01], [-1.3, -0.4, 0.3, 0.2, DAIS + 0.01], [2.9, 1.7, 0.7, 0.4, 0.03], [-2.2, 2.5, 0.5, 0.3, 0.03], [1.5, 2.9, 0.6, 0.35, 0.03]]) {
      const p = K.sph(1, MT.oil, x, y, z, S, 12, 4); p.scale.set(sx, 0.02, sz); p.castShadow = false;
    }
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + 0.3; const d = K.box(0.3 + K.rnd() * 0.4, 0.01, 0.15 + K.rnd() * 0.2, MT.grime, Math.cos(a) * 1.5, DAIS + 0.012, Math.sin(a) * 1.5, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }

    // =====================================================================
    // COLUMNS + CROWN + DOME + LIGHTNING ROD
    // =====================================================================
    const COL_R = 1.65, colPts = [];
    [0, 90, 180, 270].forEach((deg) => {
      const a = deg * DEG, x = Math.cos(a) * COL_R, z = Math.sin(a) * COL_R; colPts.push(new V(x, 3.95, z));
      K.cyl(0.24, 0.28, 0.3, MT.brassD, 8, x, DAIS + 0.15, z, S);
      K.cyl(0.15, 0.19, 4.2, MT.iron, 8, x, DAIS + 2.2, z, S);
      for (const y of [1.2, 2.45, 3.7]) { K.cyl(0.23, 0.23, 0.1, MT.brass, 8, x, y, z, S); rivetRing(S, 0.23, y, 6, MT.brassL, x, z); }
      K.cyl(0.33, 0.2, 0.28, MT.brassD, 8, x, 4.86, z, S);
      K.box(0.05, 0.9, 0.05, MT.rust, x + 0.12, 1.5, z + 0.12, S);
      K.cyl(0.2, 0.2, 0.25, MT.soot, 8, x, DAIS + 0.42, z, S);
    });
    const crown = K.torus(1.76, 0.13, MT.brass, 6, 32, 0, 5.0, 0, S); crown.rotation.x = Math.PI / 2;
    const lowR = K.torus(1.76, 0.06, MT.brassD, 4, 32, 0, 0.72, 0, S); lowR.rotation.x = Math.PI / 2;
    rivetRing(S, 1.76, 5.12, 20);
    K.lathe([[1.86, 0], [1.68, 0.4], [1.27, 0.86], [0.7, 1.16], [0.16, 1.28]], K.mat(0x2e5e50, { shine: 14, spec: 0x1e3a32, double: true }), 8, 0, 5.02, 0, S);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; const s = K.box(0.12, 0.5, 0.04, K.mat(0x1e2e28), Math.cos(a) * 1.7, 5.3, Math.sin(a) * 1.7, S); s.rotation.y = -a + Math.PI / 2; s.rotation.x = -0.45; }
    K.lathe([[1.88, 0], [1.84, 0.18]], K.mat(0x1c2a24, { double: true }), 8, 0, 5.0, 0, S);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.tube([[Math.cos(a) * 1.86, 5.02, Math.sin(a) * 1.86], [Math.cos(a) * 1.45, 5.75, Math.sin(a) * 1.45], [Math.cos(a) * 0.17, 6.3, Math.sin(a) * 0.17]], 0.035, MT.brass, S, 10, 4); }
    const vents = [];
    for (const a of [ANG.front, ANG.front + Math.PI / 2, ANG.front - Math.PI / 2]) { const v = P(a, 1.2, 5.92); K.cyl(0.08, 0.1, 0.25, MT.brassD, 6, v.x, v.y, v.z, S); vents.push(v.setY(6.08)); }
    K.cyl(0.25, 0.25, 0.12, MT.brassD, 10, 0, 6.32, 0, S);
    K.cyl(0.07, 0.1, 0.95, MT.brass, 6, 0, 6.85, 0, S);
    for (const y of [6.55, 6.8, 7.05]) { const c = K.torus(0.16, 0.035, MT.copper, 4, 10, 0, y, 0, S); c.rotation.x = Math.PI / 2; }
    const rodTip = K.sph(0.12, K.glow(0xbffff0), 0, 7.35, 0, g, 8, 6);
    K.cyl(0.07, 0.07, 1.7, MT.ironL, 8, 0, DAIS + 0.85, 0, S);
    K.cyl(0.06, 0.06, 1.62, MT.ironL, 8, 0, 4.15, 0, S);
    K.cyl(0.24, 0.24, 0.14, MT.brass, 10, 0, 4.98, 0, S);
    for (let i = 0; i < 4; i++) { const sp = K.box(3.4, 0.06, 0.06, MT.brassD, 0, 4.98, 0, S); sp.rotation.y = i * Math.PI / 4; }

    // difference drum under the core (spins with the rings); each gear baked to one draw call per material
    const drum = K.group(g, 0, DAIS, 0); const drumGears = [];
    for (let i = 0; i < 4; i++) { const gg = gear(drum, i % 2 ? 0.24 : 0.33, 0.07, i % 2 ? 8 : 11, i % 2 ? MT.brass : MT.brassD, 0, 0.22 + i * 0.26, 0); K.bake(gg); drumGears.push(gg); }
    K.cyl(0.36, 0.4, 0.14, MT.ironM, 10, 0, 0.07, 0, drum);

    // =====================================================================
    // THE BRAIN: aether core inside the orrery
    // =====================================================================
    const brain = K.group(g, 0, ORB_Y, 0);
    const coreM = K.glow(0x7af0d8);
    const core = K.sph(0.42, coreM, 0, 0, 0, brain, 16, 12);
    const innerM = K.glow(0xeafff8, 0.9, true);
    const inner = K.sph(0.26, innerM, 0, 0, 0, brain, 12, 8);
    const haloM = K.glow(0x3ac0a0, 0.25, true);
    const halo = K.sph(0.74, haloM, 0, 0, 0, brain, 14, 10);
    const coreL = K.light(0x6af0d0, 1.0, 6, 0, ORB_Y, 0, g);
    const rings = [];
    [[0.66, 0.4, 0.3, 0xe0b25c, 0xc05a2a, 0.9], [0.8, -0.6, 1.1, 0xbc8c3c, 0x5a7ab0, -1.3], [0.93, 1.3, -0.5, 0xa8582e, 0xc89a3a, 1.7]].forEach(([r, rx, rz, c, pc, sp], i) => {
      const piv = K.group(brain); piv.rotation.set(rx, 0, rz);
      const ring = K.group(piv);
      const tr = K.torus(r, 0.035, K.mat(c, { shine: 44, spec: 0x806030 }), 4, 34, 0, 0, 0, ring); tr.rotation.x = Math.PI / 2;
      const pm = K.mat(pc, { shine: 30, spec: 0x806040, e: 0 });
      K.sph(0.11 - i * 0.015, pm, r, 0, 0, ring, 8, 6);
      K.sph(0.05, MT.brassL, -r, 0, 0, ring, 6, 4);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.5; K.box(0.06, 0.06, 0.06, MT.brassL, Math.cos(a) * r, 0, Math.sin(a) * r, ring); }
      K.bake(ring);
      rings.push({ ring, piv, rx, rz, sp, pm, pc });
    });

    // aether SOURCE manifold at the back corner: where the teal conduits leave (with vacuum gauge)
    const sock = K.group(g, -2.05, 0, -2.05); sock.rotation.y = Math.PI / 4;
    const sockS = K.group(sock);
    K.box(0.9, 0.62, 0.7, MT.brassD, 0, 0.31, 0, sockS); K.box(0.98, 0.08, 0.78, MT.brass, 0, 0.64, 0, sockS);
    for (const x of [-0.3, 0, 0.3]) { const st = K.cyl(0.09, 0.09, 0.3, MT.copper, 8, x, 0.32, -0.42, sockS); st.rotation.x = Math.PI / 2; K.torus(0.11, 0.03, MT.brassL, 4, 10, x, 0.32, -0.55, sockS); }
    for (const x of [-0.42, 0.42]) K.box(0.06, 0.66, 0.74, MT.ironM, x, 0.33, 0, sockS);
    const sockGlowM = K.glow(0x2e8a78);
    for (const x of [-0.25, 0, 0.25]) K.box(0.14, 0.2, 0.02, sockGlowM, x, 0.36, 0.36, sock);
    const sockN = gauge(sock, 0, 0.82, 0.1, 0.11, 0, -0.6);
    K.tube([[-2.05, 0.3, -2.05], [-1.6, 0.42, -1.6], [-1.1, DAIS + 0.05, -1.1], [-0.4, DAIS + 0.05, -0.4]], 0.07, MT.verdD, S, 12, 6);
    const sockPipeM = K.glow(0x2e8a78);
    K.tube([[-1.9, 0.48, -1.9], [-1.25, DAIS + 0.12, -1.25], [-0.5, DAIS + 0.12, -0.5], [0, DAIS + 0.4, 0]], 0.03, sockPipeM, g, 12, 4);

    // =====================================================================
    // INTAKE LIFT at the tray (front-left face): chain hoist, counterweight, vacuum pump
    // =====================================================================
    const tw = K.group(S, TRAY.x, 0, TRAY.z);
    for (const sx of [-0.44, 0.44]) {
      K.box(0.1, 3.5, 0.1, MT.brass, sx, 1.75, 0, tw); K.box(0.26, 0.08, 0.3, MT.ironM, sx, 0.04, 0, tw);
      K.box(0.04, 3.4, 0.04, MT.brassL, sx * 1.12, 1.75, 0.04, tw);
      for (let y = 0.5; y < 3.3; y += 0.7) K.box(0.14, 0.04, 0.14, MT.brassD, sx, y, 0, tw);
    }
    K.box(0.1, 3.5, 0.1, MT.ironM, -0.68, 1.75, 0, tw);
    K.box(1.5, 0.16, 0.24, MT.ironM, -0.12, 3.5, 0, tw); K.box(1.52, 0.04, 0.26, MT.brass, -0.12, 3.6, 0, tw);
    for (let i = 0; i < 6; i++) K.box(0.18, 0.05, 0.04, i % 2 ? MT.dark : MT.hazard, -0.55 + i * 0.18, 3.5, 0.13, tw);
    K.box(0.9, 0.08, 0.5, MT.ironM, 0, 0.04, -0.15, tw);
    const sproc = gear(g, 0.17, 0.06, 9, MT.brassL, TRAY.x, 3.32, TRAY.z + 0.16); sproc.rotation.x = Math.PI / 2; K.bake(sproc);
    const sproc2 = gear(g, 0.12, 0.06, 7, MT.brass, TRAY.x - 0.68, 3.32, TRAY.z + 0.12); sproc2.rotation.x = Math.PI / 2; K.bake(sproc2);
    const plat = K.group(g, TRAY.x, TRAY.y, TRAY.z);
    K.box(0.78, 0.08, 0.72, MT.brassD, 0, -0.04, 0, plat);
    K.box(0.7, 0.02, 0.64, MT.ironL, 0, 0.005, 0, plat);
    for (let i = 0; i < 4; i++) K.box(0.03, 0.02, 0.64, MT.soot, -0.27 + i * 0.18, 0.012, 0, plat);
    K.box(0.78, 0.16, 0.05, MT.brass, 0, 0.06, -0.36, plat);
    for (const sx of [-0.4, 0.4]) { K.box(0.08, 0.22, 0.2, MT.ironM, sx, -0.02, 0, plat); K.box(0.06, 0.06, 0.06, MT.brassL, sx, 0.1, 0.08, plat); }
    K.box(0.5, 0.12, 0.08, MT.ironM, 0, -0.14, 0, plat);
    const platLampM = K.mat(0x1a1a1a, { e: 0 }); K.sph(0.05, platLampM, 0.3, 0.12, -0.36, plat, 6, 4);
    const platAnchor = K.group(plat);
    K.bake(plat);
    const chainA = K.box(0.03, 1, 0.03, MT.dark, -0.3, 2, 0.16, g), chainB = K.box(0.03, 1, 0.03, MT.dark, 0.3, 2, 0.16, g);
    const cw = K.group(g, TRAY.x - 0.68, 2.6, TRAY.z);
    K.box(0.24, 0.55, 0.24, MT.iron, 0, 0, 0, cw); for (let i = 0; i < 3; i++) K.box(0.25, 0.08, 0.25, i % 2 ? MT.dark : MT.hazard, 0, -0.18 + i * 0.18, 0, cw);
    K.bake(cw);
    const cwChain = K.box(0.025, 1, 0.025, MT.dark, TRAY.x - 0.68, 3, TRAY.z, g);
    K.box(0.86, 0.06, 0.06, MT.brassL, TRAY.x, 0.98, TRAY.z - 0.42, S);
    // vacuum pump beside the lift: two gauges that spike while a capsule is lifted / pulled
    const pump = K.group(S, TRAY.x + 0.92, 0, TRAY.z - 0.05);
    K.box(0.4, 0.66, 0.36, MT.ironM, 0, 0.33, 0, pump); K.box(0.44, 0.05, 0.4, MT.brass, 0, 0.67, 0, pump);
    K.lathe([[0.15, 0], [0.13, 0.12], [0.05, 0.2]], MT.brass2, 8, 0, 0.69, 0, pump);
    for (let i = 0; i < 4; i++) K.box(0.42, 0.03, 0.02, MT.soot, 0, 0.12 + i * 0.12, 0.19, pump);
    K.tube([[TRAY.x + 0.92, 0.9, TRAY.z - 0.05], [TRAY.x + 0.75, 1.3, TRAY.z - 0.05], [TRAY.x + 0.48, 1.4, TRAY.z]], 0.035, MT.copper, S, 8, 5);
    const vac1 = gauge(g, TRAY.x + 0.92, 0.52, TRAY.z + 0.14, 0.1, 0, 0), vac2 = gauge(g, TRAY.x + 1.13, 0.4, TRAY.z - 0.05, 0.08, Math.PI / 2, 0);

    // =====================================================================
    // PASS: funnel + brass/glass chute inside the colonnade, down to the front-right outlet
    // =====================================================================
    const passA = ANG.pass, pf = P(passA, ORB_R, 1.82);
    K.lathe([[0.13, 0], [0.3, 0.28], [0.35, 0.36]], MT.brass2, 12, pf.x, pf.y, pf.z, S);
    const pfr = K.torus(0.35, 0.035, MT.brassL, 4, 14, pf.x, pf.y + 0.36, pf.z, S); pfr.rotation.x = Math.PI / 2;
    const passCurve = new THREE.CatmullRomCurve3([[pf.x, 1.85, pf.z], [1.6, 1.6, -0.82], [2.25, 1.25, -0.9], [2.9, 1.2, -0.9]].map((p) => new V(p[0], p[1], p[2])));
    { const gp = []; for (let i = 0; i <= 20; i++) { const p = passCurve.getPoint(i / 20 * 0.86); gp.push([p.x, p.y, p.z]); } const gl = K.tube(gp, 0.19, MT.glass, g, 30, 10); gl.castShadow = false; }
    for (const u of [0.12, 0.38, 0.62, 0.84]) { const p = passCurve.getPoint(u), tn = passCurve.getTangent(u); const c = K.torus(0.2, 0.04, MT.brass, 4, 12, p.x, p.y, p.z, S); c.quaternion.setFromUnitVectors(new V(0, 0, 1), tn); }
    for (const u of [0.4, 0.75]) { const p = passCurve.getPoint(u); K.box(0.06, p.y - 0.05, 0.06, MT.brassD, p.x, p.y / 2, p.z, S); K.box(0.2, 0.05, 0.2, MT.ironM, p.x, 0.03, p.z, S); }
    const passStrip = []; for (let i = 0; i < 6; i++) { const u = 0.1 + i * 0.13; const p = passCurve.getPoint(u); passStrip.push({ u, m: K.box(0.07, 0.07, 0.07, K.glow(0x0c2a14), p.x, p.y + 0.23, p.z, g) }); }
    function trough(c, m, side) {
      const tg = K.group(S, c.x, 0, c.z);
      K.box(0.62, 0.05, 0.42, m, -side * 0.18, 0.975, 0, tg);
      for (const sz of [-0.23, 0.23]) K.box(0.62, 0.16, 0.04, m, -side * 0.18, 1.07, sz, tg);
      K.box(0.12, 0.95, 0.12, MT.ironM, -side * 0.3, 0.475, 0, tg); K.box(0.3, 0.06, 0.3, MT.ironM, -side * 0.3, 0.03, 0, tg);
      return tg;
    }
    trough(PASS_PORT, MT.brass, 1);
    const passStripM = K.glow(0x0c2a14);
    for (const sz of [-0.255, 0.255]) K.box(0.5, 0.04, 0.02, passStripM, PASS_PORT.x - 0.18, 1.12, PASS_PORT.z + sz, g);
    const sem = K.group(S, 2.75, 0, -1.55);
    K.cyl(0.05, 0.07, 2.3, MT.iron, 6, 0, 1.15, 0, sem); K.box(0.3, 0.06, 0.3, MT.ironM, 0, 0.03, 0, sem);
    K.cyl(0.11, 0.12, 0.06, MT.brassD, 8, 0, 2.32, 0, sem);
    const semLampM = K.mat(0x0c2a14, { e: 0 }); K.sph(0.11, semLampM, 2.75, 2.45, -1.55, g, 8, 6);
    const semArm = K.group(g, 2.75 + 0.07, 1.9, -1.55);
    K.box(0.04, 0.12, 0.62, MT.cream, 0, 0, 0.28, semArm); K.box(0.045, 0.12, 0.18, K.mat(0x2a9a4a), 0, 0, 0.5, semArm); K.cyl(0.06, 0.06, 0.06, MT.brass, 8, 0, 0, 0, semArm).rotation.z = Math.PI / 2;
    K.bake(semArm);

    // =====================================================================
    // REJECT: red exterior spiral chute around the LEFT of the dome, stamping cradle, outlet
    // =====================================================================
    const RH = [[135, 2.2, 3.62], [141, 2.42, 3.55], [147, 2.36, 2.95], [152, 2.36, 2.25], [157, 2.45, 1.62]]
      .map(([d, r, y]) => P(d * DEG, r, y));
    RH.push(new V(-2.62, 1.3, 0.92), new V(REJ_PORT.x, 1.2, REJ_PORT.z));
    const rejCurve = new THREE.CatmullRomCurve3(RH);
    const US = 1 / (RH.length - 1);            // the stamping cradle sits at control point 1, up on the dome's left flank
    function glassSeg(u0, u1) { const pts = []; for (let i = 0; i <= 14; i++) { const p = rejCurve.getPoint(u0 + (u1 - u0) * i / 14); pts.push([p.x, p.y, p.z]); } const gl = K.tube(pts, 0.2, MT.glassR, g, 24, 10); gl.castShadow = false; }
    glassSeg(US + 0.06, 0.93);
    // funnel mouth at the top of the spiral (catches the flung capsule)
    { const p0 = rejCurve.getPoint(0), t0 = rejCurve.getTangent(0); const mouth = K.lathe([[0.2, 0], [0.34, 0.22], [0.38, 0.28]], K.mat(0x9a2414, { shine: 22, double: true }), 12, p0.x, p0.y, p0.z, S); const from = P(ANG.rej, ORB_R, ORB_Y).sub(p0).normalize(); mouth.quaternion.setFromUnitVectors(new V(0, 1, 0), from); mouth.position.addScaledVector(from, -0.12); }
    for (const u of [0.26, 0.38, 0.5, 0.62, 0.74, 0.84, 0.92]) { const p = rejCurve.getPoint(u), tn = rejCurve.getTangent(u); const c = K.torus(0.22, 0.045, MT.rust, 4, 12, p.x, p.y, p.z, S); c.quaternion.setFromUnitVectors(new V(0, 0, 1), tn); }
    // brackets: the spiral hangs off the 90 / 180 deg columns and stands on the dais
    rod(S, new V(0, 3.62, 1.5), RH[0].clone(), 0.07, MT.rustD);
    rod(S, new V(-1.5, 3.1, 0), RH[2].clone(), 0.07, MT.rustD);
    rod(S, new V(-1.5, 2.3, 0), RH[4].clone(), 0.07, MT.rustD);
    rod(S, new V(RH[4].x, 0.32, RH[4].z), RH[4].clone().setY(1.45), 0.08, MT.rustD); K.box(0.22, 0.05, 0.22, MT.ironM, RH[4].x, 0.34, RH[4].z, S);
    const rejStrip = []; for (let i = 0; i < 7; i++) { const u = US + 0.1 + i * 0.105; if (u > 0.95) continue; const p = rejCurve.getPoint(u); rejStrip.push({ u, m: K.box(0.08, 0.08, 0.08, K.glow(0x2a0a08), p.x, p.y + 0.25, p.z, g) }); }
    // the stamping cradle (open red iron trough between the glass runs) + overhead ram + klaxon
    const SP = rejCurve.getPoint(US), STn = rejCurve.getTangent(US); const stYaw = Math.atan2(-STn.z, STn.x);
    const stat = K.group(S, SP.x, SP.y, SP.z); stat.rotation.y = stYaw;
    K.box(0.62, 0.05, 0.4, MT.red, 0, -0.2, 0, stat); for (const sz of [-0.21, 0.21]) K.box(0.62, 0.2, 0.04, MT.red, 0, -0.1, sz, stat);
    for (const sx of [-0.33, 0.33]) { const c = K.torus(0.22, 0.05, MT.rust, 4, 12, sx, 0, 0, stat); c.rotation.y = Math.PI / 2; }
    for (const sz of [-0.32, 0.32]) { K.box(0.1, 1.3, 0.1, MT.rust, 0, 0.45, sz, stat); }
    K.box(0.24, 0.22, 0.76, MT.rust, 0, 1.1, 0, stat);
    for (let i = 0; i < 5; i++) K.box(0.25, 0.09, 0.14, i % 2 ? MT.dark : MT.hazard, 0, 1.1, -0.29 + i * 0.145, stat);
    K.cyl(0.13, 0.13, 0.45, MT.ironL, 8, 0, 1.4, 0, stat); band(stat, 0.15, 1.28, MT.brassD, 0.06); band(stat, 0.15, 1.52, MT.brassD, 0.06);
    rod(S, new V(-1.52, 4.55, 0), SP.clone().setY(SP.y + 1.1), 0.08, MT.rust); rod(S, new V(0, 4.55, 1.52), SP.clone().setY(SP.y + 1.1), 0.08, MT.rust);
    const ram = K.group(g, SP.x, SP.y + 0.55, SP.z); ram.rotation.y = stYaw;
    K.cyl(0.05, 0.05, 0.5, MT.ironL, 6, 0, 0.3, 0, ram);
    K.box(0.34, 0.16, 0.3, MT.rustL, 0, 0, 0, ram);
    K.bake(ram);
    const stampFaceM = K.mat(0x6a1a10, { e: 0 }); const stampFace = K.box(0.26, 0.04, 0.2, stampFaceM, 0, -0.1, 0, ram);
    const klaxM = K.mat(0x3a0c08, { e: 0 });
    const KL = SP.clone().setY(SP.y + 1.78);
    const klaxSpin = K.group(g, KL.x, KL.y, KL.z);
    K.box(0.22, 0.13, 0.08, klaxM, 0.06, 0, 0, klaxSpin);
    const klaxDome = K.sph(0.17, K.glow(0xff3020, 0.3), KL.x, KL.y, KL.z, g, 10, 8); klaxDome.castShadow = false;
    K.cyl(0.18, 0.2, 0.09, MT.brassD, 8, KL.x, KL.y - 0.14, KL.z, S);
    // red reject lip at the pinned outlet (back-left face) + a red lamp so the exit reads
    trough(REJ_PORT, MT.rustL, -1);
    const rejLipM = K.glow(0x2a0a08);
    for (const sz of [-0.255, 0.255]) K.box(0.5, 0.04, 0.02, rejLipM, REJ_PORT.x + 0.18, 1.12, REJ_PORT.z + sz, g);

    // verdict lamps on the two front columns: green (0deg, toward the ship belt) / red (90deg, toward rework)
    function colLamp(deg, col) {
      const a = deg * DEG, p = P(a, COL_R + 0.24, 4.2);
      const cage = K.group(S, p.x, p.y, p.z);
      K.cyl(0.13, 0.15, 0.06, MT.brassD, 8, 0, -0.16, 0, cage); for (let i = 0; i < 4; i++) { const q = i / 4 * 6.28; K.box(0.03, 0.3, 0.03, MT.brassD, Math.cos(q) * 0.13, 0, Math.sin(q) * 0.13, cage); }
      const m = K.mat(col, { e: 0 }); K.sph(0.12, m, p.x, p.y, p.z, g, 10, 8);
      const br = K.box(0.3, 0.06, 0.06, MT.brassD, Math.cos(a) * (COL_R + 0.12), 4.05, Math.sin(a) * (COL_R + 0.12), S); br.rotation.y = -a;
      return m;
    }
    const passLampM = colLamp(0, 0x1a4a2a), rejLampM = colLamp(90, 0x4a1a14);

    // tally dials on the camera-facing faces of the dais: pass (green rim) / reject (red rim)
    const passDial = gauge(g, Math.cos(22.5 * DEG) * 2.47, 0.17, Math.sin(22.5 * DEG) * 2.47, 0.12, Math.PI / 2 - 22.5 * DEG, 0, K.mat(0x2a9a4a, { shine: 30 }));
    const rejDial = gauge(g, Math.cos(67.5 * DEG) * 2.47, 0.17, Math.sin(67.5 * DEG) * 2.47, 0.12, Math.PI / 2 - 67.5 * DEG, 0, K.mat(0xb02a1a, { shine: 30 }));
    let passN = 0, rejN = 0;

    // =====================================================================
    // LECTERN at the front corner: verdict lever, ticker, gauge, printed paper tape
    // =====================================================================
    const lec = K.group(g, 1.62, DAIS, 1.62); lec.rotation.y = Math.PI / 4;
    const lecS = K.group(lec);
    K.box(0.62, 0.86, 0.36, MT.wood, 0, 0.43, 0, lecS); K.box(0.66, 0.06, 0.4, MT.brassD, 0, 0.03, 0, lecS);
    for (const x of [-0.3, 0.3]) K.box(0.05, 0.88, 0.38, MT.brassD, x, 0.44, 0, lecS);
    const top = K.box(0.72, 0.07, 0.48, MT.brassD, 0, 0.92, 0.04, lecS); top.rotation.x = 0.4;
    K.box(0.2, 0.04, 0.05, MT.dark, -0.18, 0.96, 0.24, lecS); // tape slot
    K.bake(lecS);
    const tick = []; for (let i = 0; i < 6; i++) { const m = K.mat(0x1a1410, { e: 0 }); K.box(0.07, 0.05, 0.07, m, -0.24 + i * 0.096, 0.99, 0.14, lec).rotation.x = 0.4; tick.push(m); }
    const lecN = gauge(lec, -0.16, 0.98, -0.06, 0.12, 0, -1.17);
    const lever = K.group(lec, 0.18, 0.98, -0.06); K.box(0.05, 0.42, 0.05, MT.ironL, 0, 0.21, 0, lever); const knobM = K.mat(0x8a1a10, { e: 0 }); K.sph(0.07, knobM, 0, 0.43, 0, lever, 6, 4);
    K.box(0.18, 0.04, 0.06, K.mat(0x2a9a4a), 0.35, 0.96, -0.06, lec); K.box(0.18, 0.04, 0.06, K.mat(0xb02a1a), 0.01, 0.96, -0.06, lec);
    const tapeCurve = new THREE.CatmullRomCurve3([[-0.18, 0.98, 0.25], [-0.18, 0.99, 0.33], [-0.18, 0.88, 0.4], [-0.17, 0.62, 0.42], [-0.15, 0.36, 0.43], [-0.12, 0.14, 0.47]].map((p) => new V(p[0], p[1], p[2])));
    const tape = []; const tapeMarks = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 8; i++) {
      const seg = K.group(lec); K.box(0.13, 0.11, 0.008, MT.cream, 0, 0, 0, seg);
      const mm = K.mat(0xe4d2a8, { e: 0 }); K.box(0.05, 0.04, 0.012, mm, 0.02, 0, 0.004, seg);
      tape.push({ seg, mm });
    }
    let tapeFeed = 1;

    // status lamp + caution beacon (1.3x now): caution on the floor out front, clear of the intake lift
    const lamp = K.statusLamp(g, 2.2, DAIS, 0.5, 1.3);
    const caution = K.caution(g, 0.45, 0, 3.1, 1.0);

    // =====================================================================
    // FX objects: tractor beam, scan rings, lightning, shockwaves, glyph
    // =====================================================================
    const mover = K.group(g, TRAY.x, TRAY.y, TRAY.z);
    const beamM = K.glow(0x7af0d8, 0.65, true), beamOM = K.glow(0x3ac0a0, 0.22, true);
    const beam = K.cyl(0.035, 0.035, 1, beamM, 6, 0, 0, 0, g), beamO = K.cyl(0.1, 0.1, 1, beamOM, 8, 0, 0, 0, g);
    beam.visible = beamO.visible = false;
    const scanM = K.glow(0x9ffff0, 0.9, true);
    const scan = K.torus(0.24, 0.025, scanM, 4, 18, 0, 0, 0, g); scan.visible = false;
    const scan2 = K.torus(0.3, 0.018, K.glow(0x7af0d8, 0.6, true), 4, 18, 0, 0, 0, g); scan2.visible = false;
    const boltM = K.glow(0xd8fff8, 1, true);
    const bolt = []; for (let i = 0; i < 7; i++) { const b = K.box(1, 0.045, 0.045, boltM, 0, 0, 0, g); b.visible = false; b.castShadow = false; bolt.push(b); }
    const waves = []; for (let i = 0; i < 2; i++) { const w = K.torus(0.8, 0.05, K.glow(0x46ff8a, 0.9, true), 4, 36, 0, ORB_Y, 0, g); w.rotation.x = Math.PI / 2; w.visible = false; waves.push({ m: w, t: 9 }); }
    [beam, beamO, scan, scan2, inner, halo].forEach((m) => (m.castShadow = false));
    const glyph = K.group(g, 0.85, 4.0, 0.85); glyph.rotation.y = Math.PI / 4;
    const gOk = K.glow(0x5aff9a), gNo = K.glow(0xff4030), gBang = K.glow(0xffb020, 0.95), gInk = K.glow(0x120604, 0.7);
    const gCheck = K.group(glyph), gX = K.group(glyph), gB = K.group(glyph);
    const stroke = (grp, w, h, m, x, y, rz) => { const a = K.box(w, h, 0.05, m, x, y, 0.02, grp); a.rotation.z = rz; const b = K.box(w + 0.09, h + 0.09, 0.04, gInk, x, y, -0.02, grp); b.rotation.z = rz; };
    stroke(gCheck, 0.14, 0.42, gOk, -0.2, -0.12, 0.75); stroke(gCheck, 0.14, 0.84, gOk, 0.14, 0.06, -0.6);
    for (const r of [0.785, -0.785]) stroke(gX, 0.14, 0.88, gNo, 0, 0, r);
    stroke(gB, 0.16, 0.5, gBang, 0, 0.12, 0); stroke(gB, 0.16, 0.16, gBang, 0, -0.32, 0);
    [gCheck, gX, gB].forEach((q) => K.bake(q));
    const gFrame = K.torus(0.52, 0.03, K.glow(0xffffff, 0.5, true), 4, 24, 0, 0, 0, glyph);
    glyph.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    glyph.visible = false; let glyphT = 0;

    K.bake(S);
    K.bake(sockS);

    // =====================================================================
    // CYCLE
    // =====================================================================
    const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YZX'), q0 = new THREE.Quaternion();
    const C45 = Math.SQRT1_2;
    function qFor(d) { // local direction -> root-space quaternion that points the capsule's long axis along it
      const rx = C45 * (d.x - d.z), rz = C45 * (d.x + d.z);
      tmpE.set(0, Math.atan2(-rz, rx), Math.atan2(d.y, Math.hypot(rx, rz)), 'YZX');
      return tmpQ.setFromEuler(tmpE);
    }
    const orbit = (a, out) => (out || new V()).set(Math.cos(a) * ORB_R, ORB_Y - 0.2, Math.sin(a) * ORB_R);
    const tang = (a) => new V(-Math.sin(a), 0, Math.cos(a));
    const DECIDE = [
      (l) => 'Two fixes touch /billing — ship ' + l + ' first?',
      (l) => l + ' changes a public API — approve Spark’s review?',
      (l) => l + ' adds a DB migration — OK to run it in prod?',
      (l) => 'Spark is unsure about ' + l + ' (risky auth change). Your call?'
    ];
    let it = null, ph = 'idle', pt = 0, v = null, asked = false, ringSp = 0.15, flash = 0, flashCol = 0x46ff8a, orbA = ANG.front;
    let platY = TRAY.y, lastPlat = TRAY.y, klax = 0, semUp = 0, ramT = -1, ramHit = false, boltT = 0, moteT = 0, steamT = 0, dripT = 0, rejUp = 0;
    const startPos = new V(), endPos = new V(), cc = new V(), tv = new V();
    function setPhase(p) { ph = p; pt = 0; if (it) q0.copy(it.mesh.quaternion); }
    function orient(d, k) { if (!it) return; const q = qFor(d.clone().normalize()); if (k >= 1) it.mesh.quaternion.copy(q); else it.mesh.quaternion.copy(q0).slerp(q, k); }
    const L = () => (it ? it.label() : '');
    function verdictText() { return v.pass ? L() + ' · PASS → ship belt' : L() + ' · SENT BACK: ' + v.reason; }
    function fadeStrip(arr, base) { arr.forEach((s) => { const c = s.m.material.color; c.r = Math.max(base[0], c.r * (1 - 0.04)); c.g = Math.max(base[1], c.g * (1 - 0.04)); c.b = Math.max(base[2], c.b * (1 - 0.04)); }); }

    function update(t, dt) {
      const blk = M.blocked;
      const adt = blk ? 0 : dt;
      // ---- intake: claim the next capsule when the lift is down ----
      if (ph === 'idle' && !blk && platY <= TRAY.y + 0.002) {
        const w = M.waiting('in');
        if (w) { it = M.take('in'); it.follow(platAnchor); v = null; asked = false; setPhase('rise'); }
      }
      if (it) pt += adt;
      let detail = 'waiting for PRs', st = 'IDLE';
      if (it) { st = 'WORKING'; detail = L() + ' · intake lift'; }
      // ---- the item's journey ----
      if (ph === 'rise') {
        platY = TRAY.y + (PLAT_UP - TRAY.y) * sm(pt / 0.65);
        if (pt >= 0.65) { mover.position.set(TRAY.x, PLAT_UP, TRAY.z); it.follow(mover); setPhase('pull'); }
      } else if (ph === 'pull') {
        const k = sm(pt / 0.5); startPos.set(TRAY.x, PLAT_UP, TRAY.z); orbit(ANG.in, endPos);
        mover.position.lerpVectors(startPos, endPos, k); orient(tang(ANG.in), k); orbA = ANG.in;
        detail = L() + ' · pulled into the orrery';
        if (pt >= 0.5) setPhase('review');
      } else if (ph === 'review') {
        const k = sm(pt / 2.1); orbA = ANG.in + (ANG.front - Math.PI * 2 - ANG.in) * k;
        orbit(orbA, mover.position); mover.position.y += Math.sin(pt * 7) * 0.04; orient(tang(orbA), 1);
        detail = L() + ' · Spark reviewing the diff';
        if (pt >= 2.1) {
          detail = L() + ' · Spark deciding';
          if (!asked) { asked = true; M.maybeDecision(DECIDE[Math.floor(Math.random() * DECIDE.length)](L())); }
          if (!M.blocked) setPhase('verdict');
        }
      } else if (ph === 'verdict') {
        orbA = ANG.front; orbit(ANG.front, mover.position); orient(tang(ANG.front), 1);
        detail = L() + ' · Spark deciding';
        if (!v && pt >= 0.3) {
          v = M.judge(it);
          if (v.pass) { it.setKind('pass'); M.pass(it); flashCol = 0x46ff8a; passN++; }
          else { it.setKind('reject'); M.reject(it, v.reason); flashCol = 0xff3a2a; klax = 4.5; rejN++; }
          flash = 1; waves.forEach((w, i) => { w.t = -i * 0.18; w.m.material.color.setHex(flashCol); });
          for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; K.spawn(g, Math.cos(a) * 0.5, ORB_Y, Math.sin(a) * 0.5, Math.cos(a) * 3.2, K.R() * 1.4, Math.sin(a) * 3.2, Math.random() < 0.5 ? flashCol : 0xffffff, 0.55, 0.07, 1.5, true); }
          for (let i = 0; i < 18; i++) K.spawn(g, K.R() * 0.1, 7.35, K.R() * 0.1, K.R() * 3, 0.5 + Math.random() * 2.2, K.R() * 3, Math.random() < 0.5 ? flashCol : 0xffffff, 0.5, 0.05, 4, true);
          tapeMarks.unshift(flashCol); tapeMarks.length = 8; tapeFeed = 0;
        }
        if (v) detail = verdictText();
        if (pt >= 0.9) setPhase(v.pass ? 'swing' : 'rswing');
      } else if (ph === 'swing') { // PASS: swing right inside the colonnade to the pass funnel
        detail = verdictText();
        const k = sm(pt / 0.45); orbA = ANG.front + (ANG.pass - ANG.front) * k;
        orbit(orbA, mover.position); orient(tang(orbA), 1);
        if (pt >= 0.45) setPhase('drop');
      } else if (ph === 'drop') {
        detail = verdictText();
        const k = sm(pt / 0.38); orbit(ANG.pass, startPos); endPos.copy(passCurve.getPoint(0)); endPos.y -= 0.2;
        mover.position.lerpVectors(startPos, endPos, k); orient(passCurve.getTangent(0), k);
        if (pt >= 0.38) setPhase('chute');
      } else if (ph === 'chute') {
        detail = verdictText();
        const u = Math.min(1, Math.pow(pt / 0.8, 1.5));
        mover.position.copy(passCurve.getPoint(u)); mover.position.y -= 0.2; orient(passCurve.getTangent(Math.min(u, 0.999)), 1);
        passStrip.forEach((s) => { if (Math.abs(s.u - u) < 0.1) s.m.material.color.setHex(0x46ff8a); });
        if (u >= 1) setPhase('out');
      } else if (ph === 'rswing') { // REJECT: swing left inside the colonnade to the left gap
        detail = verdictText();
        const k = sm(pt / 0.5); orbA = ANG.front + (ANG.rej - ANG.front) * k;
        orbit(orbA, mover.position); orient(tang(orbA), 1);
        if (pt >= 0.5) setPhase('fling');
      } else if (ph === 'fling') { // ...then the beam throws it out between the columns into the red spiral's mouth
        detail = verdictText();
        const k = sm(pt / 0.55); orbit(ANG.rej, startPos); endPos.copy(rejCurve.getPoint(0)); endPos.y -= 0.2;
        mover.position.lerpVectors(startPos, endPos, k); mover.position.y += Math.sin(k * Math.PI) * 0.6;
        orient(rejCurve.getTangent(0), k);
        if (pt >= 0.55) setPhase('rchute1');
      } else if (ph === 'rchute1' || ph === 'rchute2') {
        detail = verdictText();
        const first = ph === 'rchute1', dur = first ? 0.3 : 1.1;
        const k = Math.min(1, first ? pt / dur : Math.pow(pt / dur, 1.3)), u = first ? US * k : US + (1 - US) * k;
        mover.position.copy(rejCurve.getPoint(u)); mover.position.y -= 0.2; orient(rejCurve.getTangent(Math.min(u, 0.999)), 1);
        rejStrip.forEach((s) => { if (Math.abs(s.u - u) < 0.07) s.m.material.color.setHex(0xff3a2a); });
        if (k >= 1) { if (first) { setPhase('stamp'); ramT = 0; ramHit = false; } else setPhase('out'); }
      } else if (ph === 'stamp') {
        detail = L() + ' · scar tag: ' + v.reason;
        mover.position.copy(SP); mover.position.y -= 0.2; orient(STn, 1);
        if (pt >= 0.75) setPhase('rchute2');
      } else if (ph === 'out') {
        detail = verdictText();
        mover.position.copy(v.pass ? PASS_PORT : REJ_PORT); orient(new V(v.pass ? 1 : -1, 0, 0), 1);
        if (v.pass) semUp = 1; else rejUp = 1;
        if (pt > 0.18) {
          if (M.give(it, v.pass ? 'pass' : 'reject')) { it = null; v = null; setPhase('idle'); detail = 'waiting for PRs'; st = 'IDLE'; }
          else detail = L() + ' · held: ' + (v.pass ? 'ship belt' : 'rework line') + ' is full';
        }
      }
      if (ph !== 'rise') platY = Math.max(TRAY.y, platY - adt * 2.4);
      if (!it) st = 'IDLE';
      M.setState(st, detail);

      // =================== visuals ===================
      const reviewing = ph === 'review' || (ph === 'verdict' && !v);
      const working = !!it;
      const inOrrery = it && (ph === 'pull' || ph === 'review' || ph === 'verdict' || ph === 'swing' || ph === 'rswing');
      // the core dims while the capsule passes in front of it (camera looks along local -45deg), so it stays readable
      const front = inOrrery ? clamp01((Math.cos(orbA - ANG.front) - 0.55) / 0.45) : 0;
      const dim = flash > 0.2 ? 0 : front * 0.6;
      // orrery spin-up / wind-down / grind
      const target = blk ? 0 : reviewing ? 2.9 : working ? 1.1 : 0.16;
      ringSp += (target - ringSp) * Math.min(1, dt * (blk ? 3 : reviewing ? 1.6 : 1.0));
      rings.forEach((r, i) => {
        r.ring.rotation.y += dt * r.sp * ringSp;
        r.piv.rotation.x = r.rx + (blk ? Math.sin(t * 47 + i * 2) * 0.035 : 0);
        r.piv.rotation.z = r.rz + (blk ? Math.sin(t * 39 + i) * 0.03 : 0);
        const on = reviewing ? Math.sin(t * 9 - i * 2.1) > 0.2 : working;
        r.pm.emissive.setHex(blk ? (Math.sin(t * 8 + i) > 0 ? 0x6a2a00 : 0) : on ? (r.pc & 0x7f7f7f) : 0);
      });
      brain.rotation.y += dt * 0.25 * ringSp;
      drum.rotation.y += dt * ringSp * 1.3;
      drumGears.forEach((gg, i) => (gg.rotation.y += dt * ringSp * (i % 2 ? 2.2 : -0.6)));
      // core colour + pulse
      flash = Math.max(0, flash - dt * 1.1);
      let col;
      if (blk) col = Math.sin(t * 15) > 0 ? 0xffa020 : 0xff4a1a;
      else if (flash > 0.2) col = flashCol;
      else col = working ? 0x7af0d8 : 0x2e8a78;
      coreM.color.setHex(col); if (dim > 0) coreM.color.multiplyScalar(1 - dim);
      const flick = blk ? (Math.random() < 0.25 ? 0.55 : 1) : 1;
      const pulse = (blk ? 0.78 : reviewing ? 1.0 + Math.sin(t * 13) * 0.12 : working ? 0.9 + Math.sin(t * 6) * 0.05 : 0.6 + Math.sin(t * 1.3) * 0.03) * flick;
      core.scale.setScalar((pulse + flash * 0.25) * (1 - dim * 0.25));
      inner.scale.setScalar((reviewing ? 1.15 : 0.9) * pulse + flash * 0.5); innerM.opacity = (blk ? 0.3 : working ? 0.55 : 0.3) * (1 - dim);
      halo.scale.setScalar(pulse * (1.15 + Math.sin(t * 9) * 0.04) + flash * 1.4);
      haloM.color.setHex(blk ? 0xff8a20 : flash > 0.2 ? flashCol : 0x3ac0a0); haloM.opacity = (blk ? 0.28 : 0.12 + (working ? 0.05 : 0) + flash * 0.3) * (1 - dim * 0.8);
      if (!coreL.isDummy) { coreL.color.setHex(col); coreL.intensity = ((blk ? 0.6 : working ? 0.75 : 0.3) * flick + flash * 1.2) * (1 - dim * 0.5); }
      const dimCol = new THREE.Color(col).multiplyScalar(working || blk ? 0.75 + Math.sin(t * 6) * 0.2 : 0.35);
      inlayM.color.copy(dimCol); sockGlowM.color.copy(dimCol); sockPipeM.color.copy(dimCol);
      rodTip.material.color.setHex(blk ? (Math.sin(t * 9) > 0 ? 0xffa020 : 0x3a1a08) : flash > 0.3 ? flashCol : reviewing && Math.sin(t * 23) > 0.1 ? 0xffffff : working ? 0x9ae8d8 : 0x3a7a6a);
      // tractor beam core -> capsule (also throws the reject out)
      const beamOn = it && (ph === 'pull' || ph === 'review' || ph === 'verdict' || ph === 'swing' || ph === 'rswing' || ph === 'drop' || ph === 'fling');
      beam.visible = beamO.visible = !!beamOn && (!blk || Math.sin(t * 20) > -0.3);
      if (beamOn) {
        cc.copy(mover.position); cc.y += 0.2;
        const d = tv.subVectors(cc, CORE); const len = d.length();
        for (const b of [beam, beamO]) { b.position.copy(CORE).addScaledVector(d, 0.5); b.scale.set(1, len, 1); b.quaternion.setFromUnitVectors(new V(0, 1, 0), d.clone().normalize()); }
        const bc = blk ? 0xffa020 : (flash > 0.2 || ph === 'fling' || ph === 'rswing') ? flashCol : 0x9ffff0;
        beamM.color.setHex(bc); beamOM.color.setHex(blk ? 0xff6a10 : (flash > 0.2 || ph === 'fling' || ph === 'rswing') ? flashCol : 0x3ac0a0);
        beamM.opacity = 0.45 + Math.sin(t * 30) * 0.15;
      }
      // scan rings sweep along the capsule while Spark reads it
      const scanning = it && (reviewing || ph === 'verdict');
      scan.visible = scan2.visible = !!scanning;
      if (scanning) {
        cc.copy(mover.position); cc.y += 0.2;
        const ax = new V(1, 0, 0).applyQuaternion(it.mesh.quaternion);
        const axL = new V(C45 * (ax.x + ax.z), ax.y, C45 * (ax.z - ax.x)).normalize();
        const s1 = Math.sin(t * (blk ? 0 : 9)) * 0.24, s2 = Math.sin(t * (blk ? 0 : 9) + Math.PI) * 0.2;
        scan.position.copy(cc).addScaledVector(axL, s1); scan.quaternion.setFromUnitVectors(new V(0, 0, 1), axL);
        scan2.position.copy(cc).addScaledVector(axL, s2); scan2.quaternion.copy(scan.quaternion);
        scanM.color.setHex(blk ? 0xffa020 : 0x9ffff0);
      }
      // data motes stream from the capsule into the core
      moteT -= dt;
      if (reviewing && !blk && moteT <= 0) {
        moteT = 0.035; cc.copy(mover.position); cc.y += 0.2;
        const d = tv.subVectors(CORE, cc);
        K.spawn(g, cc.x + K.R() * 0.2, cc.y + K.R() * 0.2, cc.z + K.R() * 0.2, d.x * 2.2, d.y * 2.2, d.z * 2.2, Math.random() < 0.5 ? 0xbffff0 : 0x7af0d8, 0.42, 0.05, 0, true);
      }
      // lightning from the core to the column capitals (and sputters when blocked)
      boltT -= dt;
      const arcing = (working && !blk && (reviewing || Math.random() < 0.02)) || (blk && Math.random() < 0.08);
      if (boltT <= 0) {
        boltT = 0.06;
        const show = arcing && Math.random() < (reviewing ? 0.85 : 0.6);
        bolt.forEach((b) => (b.visible = false));
        if (show) {
          const e = colPts[Math.floor(Math.random() * colPts.length)].clone();
          e.x *= 0.9; e.z *= 0.9; e.y = 3.6 + Math.random() * 0.6;
          const s0 = CORE.clone().addScaledVector(tv.subVectors(e, CORE).normalize(), 0.45);
          const pts = [s0]; for (let i = 1; i < bolt.length; i++) { const k = i / bolt.length; pts.push(new V().lerpVectors(s0, e, k).add(new V(K.R() * 0.3, K.R() * 0.3, K.R() * 0.3))); } pts.push(e);
          bolt.forEach((b, i) => { b.visible = true; along(b, pts[i], pts[i + 1]); b.scale.y = b.scale.z = 1; });
          boltM.color.setHex(blk ? 0xffb050 : 0xd8fff8);
          if (Math.random() < 0.4) K.spawn(g, e.x, e.y, e.z, K.R() * 2, Math.random() * 1.5, K.R() * 2, 0xbffff0, 0.25, 0.05, 2, true);
        }
      }
      if (reviewing && !blk && Math.random() < 0.25) K.spawn(g, K.R() * 0.15, 7.35, K.R() * 0.15, K.R() * 2, Math.random() * 1.5, K.R() * 2, 0xffffff, 0.22, 0.05, 0, true);
      waves.forEach((w) => { w.t += dt; const k = w.t / 0.8; w.m.visible = k > 0 && k < 1; if (w.m.visible) { w.m.scale.setScalar(1 + k * 2.6); w.m.material.opacity = 0.9 * (1 - k); } });
      // column verdict lamps (both blink amber while blocked)
      const showPass = v && v.pass && it, showRej = v && !v.pass && it;
      passLampM.emissive.setHex(blk ? (Math.sin(t * 8) > 0 ? 0xffa020 : 0) : showPass ? 0x46ff8a : 0);
      rejLampM.emissive.setHex(blk ? (Math.sin(t * 8) < 0 ? 0xffa020 : 0) : showRej ? (Math.sin(t * 12) > 0 ? 0xff3020 : 0x5a0a04) : 0);
      // klaxon over the stamping cradle spins for a reject
      klax = Math.max(0, klax - adt);
      klaxSpin.rotation.y += dt * (klax > 0 ? 10 : 0);
      klaxM.emissive.setHex(klax > 0 ? 0xff2a10 : 0); klaxDome.material.opacity = klax > 0 ? 0.65 : 0.22;
      klaxDome.material.color.setHex(klax > 0 && Math.sin(t * 20) > 0 ? 0xff5030 : 0xff3020);
      // stamper slams the scar tag in the cradle
      if (ramT >= 0) {
        ramT += adt; const k = ramT / 0.6;
        const drop = k < 0.35 ? (k / 0.35) ** 2 : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        ram.position.y = SP.y + 0.55 - drop * 0.38;
        stampFaceM.emissive.setHex(k > 0.3 && k < 0.65 ? 0xff3a1a : 0);
        if (k > 0.35 && !ramHit) { ramHit = true; if (it) it.flash(0xff3a2a); for (let i = 0; i < 16; i++) K.spawn(g, SP.x, SP.y + 0.1, SP.z, K.R() * 3.5, Math.random() * 2.5, K.R() * 3.5, Math.random() < 0.5 ? 0xffb050 : 0xff5030, 0.45, 0.05, 6, true); for (let i = 0; i < 4; i++) K.spawn(g, SP.x + K.R() * 0.3, SP.y + 0.2, SP.z + K.R() * 0.3, K.R() * 0.4, 0.8, K.R() * 0.4, 0x8a8070, 1.2, 0.12, -0.1); }
        if (k >= 1) { ramT = -1; ram.position.y = SP.y + 0.55; }
      }
      // pass semaphore / reject lip lamps
      semUp = Math.max(0, semUp - dt * 0.6); rejUp = Math.max(0, rejUp - dt * 0.6);
      semArm.rotation.x += ((semUp > 0 ? -1.0 : 0.15) - semArm.rotation.x) * Math.min(1, dt * 6);
      semLampM.emissive.setHex(semUp > 0 || showPass ? 0x46ff8a : 0);
      passStripM.color.setHex(semUp > 0 ? (Math.floor(t * 8) % 2 ? 0x46ff8a : 0x1a6a32) : 0x0c2a14);
      rejLipM.color.setHex(rejUp > 0 || (showRej && (ph === 'rchute2' || ph === 'out')) ? (Math.floor(t * 8) % 2 ? 0xff3a2a : 0x6a1408) : 0x2a0a08);
      fadeStrip(passStrip, [0.05, 0.16, 0.08]); fadeStrip(rejStrip, [0.16, 0.04, 0.03]);
      // tally dials step one tick per verdict
      passDial.rotation.z += ((-2.2 + (passN % 12) * 0.4) - passDial.rotation.z) * Math.min(1, dt * 8);
      rejDial.rotation.z += ((-2.2 + (rejN % 12) * 0.4) - rejDial.rotation.z) * Math.min(1, dt * 8);
      // printed paper tape: feeds out one notch per verdict, newest mark at the slot
      tapeFeed = Math.min(1, tapeFeed + adt * 2.5);
      tape.forEach((tp, i) => {
        const u = (i - 1 + sm(tapeFeed)) / 7;
        tp.seg.visible = u >= 0;
        if (u < 0) return;
        const uu = Math.min(1, u); tapeCurve.getPoint(uu, tp.seg.position); const tn = tapeCurve.getTangent(uu);
        tp.seg.quaternion.setFromUnitVectors(new V(0, 1, 0), tn);
        const c = tapeMarks[i] || 0; tp.mm.color.setHex(c || 0xe4d2a8); tp.mm.emissive.setHex(c ? (c & 0x5f5f5f) : 0);
      });
      // vacuum gauges: spike on lift + pull, settle otherwise
      const vac = ph === 'rise' || ph === 'pull' ? -1.4 + Math.sin(t * 25) * 0.05 : working ? -0.3 + Math.sin(t * 3) * 0.1 : 0.8;
      vac1.rotation.z += (vac - vac1.rotation.z) * Math.min(1, dt * 6); vac2.rotation.z += (vac * 0.8 - vac2.rotation.z) * Math.min(1, dt * 4);
      sockN.rotation.z = blk ? -1.2 + Math.sin(t * 30) * 0.06 : working ? -0.4 + Math.sin(t * 4) * 0.25 : 0.6;
      // intake lift hardware
      plat.position.y = platY;
      const pv = (platY - lastPlat) / Math.max(dt, 1e-4); lastPlat = platY;
      sproc.rotation.y += pv * dt * 5; sproc2.rotation.y -= pv * dt * 6;
      const chL = 3.32 - platY; for (const [c, x] of [[chainA, -0.3], [chainB, 0.3]]) { c.position.set(TRAY.x + x, platY + chL / 2, TRAY.z + 0.16); c.scale.y = Math.max(0.05, chL); }
      cw.position.y = 2.6 - (platY - TRAY.y) * 0.9;
      cwChain.position.y = (3.32 + cw.position.y + 0.27) / 2; cwChain.scale.y = Math.max(0.05, 3.32 - cw.position.y - 0.27);
      platLampM.emissive.setHex(ph === 'rise' ? (Math.sin(t * 14) > 0 ? 0x46ff8a : 0) : 0);
      // lectern
      tick.forEach((m, i) => {
        let c = 0;
        if (blk) c = Math.sin(t * 8 + i) > 0 ? 0xffa020 : 0;
        else if (v && it) c = v.pass ? 0x46ff8a : 0xff3a2a;
        else if (reviewing) c = Math.random() < 0.5 ? 0x7af0d8 : 0;
        else if (working) c = i === Math.floor(t * 6) % 6 ? 0xffa63a : 0;
        else c = i === Math.floor(t * 1.5) % 6 ? 0x3a2a10 : 0;
        if (Math.random() < 0.3 || !reviewing) m.emissive.setHex(c);
      });
      lecN.rotation.z = blk ? -1.2 + Math.sin(t * 30) * 0.06 : reviewing ? Math.sin(t * 5) * 0.8 : working ? 0.3 : 0.9;
      const lt = v && it ? (v.pass ? -0.7 : 0.7) : 0;
      lever.rotation.z += (lt - lever.rotation.z) * Math.min(1, dt * 8);
      knobM.emissive.setHex(blk ? (Math.sin(t * 8) > 0 ? 0x5a2000 : 0) : 0);
      // steam hisses from the dome vents (hard when blocked); condensation drips off the dome rim
      steamT -= dt;
      if (steamT <= 0) {
        steamT = blk ? 0.05 : 0.4;
        if (blk || Math.random() < 0.15) { const vv = vents[Math.floor(Math.random() * vents.length)]; K.spawn(g, vv.x, vv.y, vv.z, vv.x * 0.4 + K.R() * 0.3, blk ? 1.6 : 0.7, vv.z * 0.4 + K.R() * 0.3, blk ? 0xc8bca8 : 0x9a8e7c, blk ? 1.4 : 1.8, blk ? 0.16 : 0.12, -0.12); }
      }
      dripT -= dt;
      if (dripT <= 0) { dripT = 0.35 + Math.random() * 0.5; const a = (-20 + Math.random() * 130) * DEG; K.spawn(g, Math.cos(a) * 1.86, 4.98, Math.sin(a) * 1.86, 0, -0.2, 0, Math.random() < 0.5 ? 0xa8e0d0 : 0x6aa898, 1.0, 0.035, 5); }
      // verdict glyph: pops in on the verdict, stays while the capsule is routed; amber "!" while blocked
      const showV = v && it && ph !== 'out' && ph !== 'idle';
      glyph.visible = !!(blk || showV);
      if (glyph.visible) {
        glyphT += dt;
        gCheck.visible = !blk && v && v.pass; gX.visible = !blk && v && !v.pass; gB.visible = blk;
        const pop = blk ? 1 + Math.sin(t * 8) * 0.08 : Math.min(1.25, glyphT * 6) - Math.max(0, Math.min(0.25, (glyphT - 0.2) * 2));
        glyph.scale.setScalar(Math.max(0.01, pop));
        gFrame.material.color.setHex(blk ? 0xffb020 : v && v.pass ? 0x46ff8a : 0xff3a2a);
        gFrame.material.opacity = 0.35 + Math.sin(t * 10) * 0.2;
        if (blk) gBang.opacity = Math.sin(t * 9) > -0.2 ? 0.95 : 0.3;
        glyph.position.y = 4.0 + Math.sin(t * 2) * 0.05;
      } else glyphT = 0;
      lamp.set(M.stateShown, t);
      caution.update(t, dt, M.stateShown);
    }
    return { g, update };
  });
})();
