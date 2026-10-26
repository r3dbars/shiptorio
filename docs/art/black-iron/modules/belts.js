// BELTS (Black Iron line): chain-driven belts for ore / feed / pass / rework, the glass pneumatic tube,
// the two rework bucket elevators (continuous bucket loops + the 'bucket' carrier), the high rework line
// with its under-slung bridge truss and work lights, the CI inspection arch, the merge plate at the
// assembler tray, and the teal aether conduit network.
// NOTES: root-local coords. Belts stop short of machine ports (machines own their trays).
// Belt texture scroll = path.speed * path.flow (one tile = 0.5 units) so items never slide.
// Rework structures are dark iron with thin red accents so red reject capsules pop. In-world text: SHIPTORIO
// plus functional labels only (REWORK x2, TUBE, CI display), all in Silkscreen.
(function () {
  'use strict';
  const THREE = window.THREE;
  const C = {
    soot: 0x1a1512, iron: 0x3a322b, ironM: 0x2e2722, ironL: 0x5c5046, ironXL: 0x7a6c5e,
    steel: 0x2c3036, steelL: 0x4a5058,
    brass: 0xb08236, brassD: 0x6e5022, brassL: 0xd8aa52, copper: 0x9a5030, copperD: 0x5e301a,
    rust: 0x8a3e1c, rustL: 0xa85a28, red: 0xc02a1a, redD: 0x6e1a10, hazard: 0xe0a018,
    aeth: 0x7af0d8, aethDim: 0x2cb89c, oil: 0x0a0a0e
  };
  let M = null;
  function mats(K) {
    if (M) return M;
    M = {
      soot: K.mat(C.soot), iron: K.mat(C.iron, { shine: 22, spec: 0x2a2a30 }), ironM: K.mat(C.ironM, { shine: 16, spec: 0x222228 }),
      ironL: K.mat(C.ironL, { shine: 28, spec: 0x3a3a40 }), ironXL: K.mat(C.ironXL, { shine: 30, spec: 0x44444a }),
      steel: K.mat(C.steel, { shine: 30, spec: 0x3a4048 }), steelL: K.mat(C.steelL, { shine: 34, spec: 0x50565e }),
      brass: K.mat(C.brass, { shine: 40, spec: 0x8a6a30 }), brassD: K.mat(C.brassD, { shine: 22, spec: 0x3a2a10 }), brassL: K.mat(C.brassL, { shine: 50, spec: 0xa08040 }),
      copper: K.mat(C.copper, { shine: 34, spec: 0x6a3a20 }), copperD: K.mat(C.copperD, { shine: 18 }),
      rust: K.mat(C.rust), rustL: K.mat(C.rustL), red: K.mat(C.red, { shine: 18, spec: 0x3a1a10, e: 0x200402 }), redD: K.mat(C.redD),
      hazard: K.mat(C.hazard), oil: K.mat(C.oil, { shine: 90, spec: 0x6a5a8a }), grime: K.mat(0x050403, { op: 0.45, depthWrite: false }),
      glass: K.mat(0xa8c8c0, { op: 0.2, shine: 70, spec: 0x9ab0aa, depthWrite: false, double: true }),
      lampFace: K.glow(0xffe2b0), led: K.glow(0x5a6c7c), white: K.glow(0xffffff)
    };
    return M;
  }

  // ---------- Silkscreen signs ----------
  const FONT = "700 16px 'Silkscreen', 'Courier New', monospace";
  function textTex(K, text, o) {
    o = o || {}; const h = o.h || 24, padX = o.padX || 8;
    const meas = document.createElement('canvas').getContext('2d'); meas.font = FONT;
    const arrowW = o.arrow ? 18 : 0;
    const w = Math.ceil(meas.measureText(text).width) + padX * 2 + arrowW;
    const tex = K.canvasTex(w, h, (g) => {
      g.fillStyle = o.edge || '#0c0a08'; g.fillRect(0, 0, w, h);
      g.fillStyle = o.bg; g.fillRect(2, 2, w - 4, h - 4);
      g.font = FONT; g.textBaseline = 'middle'; g.fillStyle = o.fg; g.fillText(text, padX, h / 2 + 1);
      if (o.arrow) { const ax = w - padX - 12, cy = h / 2; g.beginPath(); if (o.arrow > 0) { g.moveTo(ax, cy + 5); g.lineTo(ax + 12, cy + 5); g.lineTo(ax + 6, cy - 6); } else { g.moveTo(ax, cy - 5); g.lineTo(ax + 12, cy - 5); g.lineTo(ax + 6, cy + 6); } g.closePath(); g.fill(); }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { tex, aspect: w / h };
  }
  // a sign board facing +z (text on the front face only)
  function sign(K, p, tt, height, x, y, z, emissive) {
    const face = K.mat(0xffffff, { map: tt.tex, e: emissive || 0 });
    return K.box(height * tt.aspect, height, 0.05, [M.ironM, M.ironM, M.ironM, M.ironM, face, M.ironM], x, y, z, p);
  }

  // ---------- textures ----------
  function beltTex(K, cool) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = cool ? '#0e1012' : '#18130f'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = cool ? '#262a30' : '#4a3f35'; g.fillRect(0, 1, 16, 14);
      g.fillStyle = cool ? '#4a525c' : '#8a7862'; g.fillRect(1, 1, 3, 14); g.fillRect(9, 1, 3, 14);
      g.fillStyle = cool ? '#6a7480' : '#b8a084'; g.fillRect(1, 1, 3, 1); g.fillRect(9, 1, 3, 1);
      g.fillStyle = '#0a0908'; g.fillRect(4, 1, 1, 14); g.fillRect(12, 1, 1, 14);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(6, 4, 2, 3); g.fillRect(14, 10, 2, 2); g.fillRect(5, 12, 3, 1);
      g.fillStyle = 'rgba(255,220,170,0.08)'; g.fillRect(6, 8, 2, 1);
    });
  }
  function hazardTex(K) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#16120c'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#e0a018';
      for (let i = -16; i < 32; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 4, 0); g.lineTo(i + 4 - 16, 16); g.lineTo(i - 16, 16); g.fill(); }
    });
  }
  function chainTex(K) {
    return K.canvasTex(8, 16, (g) => {
      g.fillStyle = '#100c0a'; g.fillRect(0, 0, 8, 16);
      g.fillStyle = '#6a5e52'; g.fillRect(2, 0, 4, 7); g.fillStyle = '#100c0a'; g.fillRect(3, 2, 2, 3);
      g.fillStyle = '#8a7c6c'; g.fillRect(3, 7, 2, 9); g.fillStyle = '#4a4038'; g.fillRect(3, 9, 2, 5);
    });
  }
  function plateTex(K, cool) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = cool ? '#24262a' : '#3e352d'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = cool ? '#3a3e44' : '#5e5246';
      for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 16; x += 4) g.fillRect(x, y, 2, 1);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(9, 5, 4, 3);
    });
  }

  // ---------- helpers ----------
  function gear(K, p, r, thick, teeth, m, x, y, z) {
    const g = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tb = K.box(tw, thick * 0.9, r * 0.24, m, Math.sin(a) * (r * 1.08), 0, Math.cos(a) * (r * 1.08), g);
      tb.rotation.y = a;
    }
    K.cyl(r * 0.3, r * 0.3, thick * 1.7, M.ironM, 8, 0, 0, 0, g);
    if (r > 0.25) for (let i = 0; i < 3; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.14, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 3; }
    K.bake(g);
    return g;
  }
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  function strut(K, p, a, b, s, m) {
    const va = V(a), vb = V(b), len = va.distanceTo(vb);
    const o = K.box(s, len, s, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, p);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return o;
  }
  const onDeck = (x, z) => z <= 7.3 && z >= -7.3 && Math.abs(x) <= 18.3;

  // =====================================================================
  // BUCKET (carrier + the empties that circulate on the elevator loops)
  // =====================================================================
  function bucketMesh(K) {
    mats(K);
    const g = new THREE.Group();
    const inner = K.group(g);
    K.box(0.66, 0.06, 0.62, M.steelL, 0, -0.05, 0, inner);
    K.box(0.7, 0.04, 0.66, M.soot, 0, -0.1, 0, inner);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 0.4, 0.05, M.steel, sx * 0.31, 0.15, sz * 0.29, inner);
    for (const sz of [-1, 1]) { K.box(0.66, 0.05, 0.05, M.red, 0, 0.33, sz * 0.29, inner); K.box(0.66, 0.04, 0.04, M.steel, 0, 0.1, sz * 0.29, inner); }
    for (const sx of [-1, 1]) { K.box(0.05, 0.05, 0.62, M.red, sx * 0.31, 0.33, 0, inner); K.box(0.2, 0.08, 0.1, M.ironL, sx * 0.42, 0.2, 0, inner); }
    K.bake(inner);
    return g;
  }
  IRON.carrier('bucket', (K) => bucketMesh(K));

  IRON.belts((K, root, ctx) => {
    mats(K);
    const P = ctx.paths, I = ctx.I;
    const stat = K.group(root);            // everything static (baked at the end)
    const BTX = beltTex(K, false), BTXC = beltTex(K, true), HZ = hazardTex(K), CH = chainTex(K);
    const hazM = K.mat(0xffffff, { map: HZ });
    const plateM = K.mat(0xffffff, { map: plateTex(K, false) }); plateM.map.repeat.set(4, 4);
    const plateC = K.mat(0xffffff, { map: plateTex(K, true) }); plateC.map.repeat.set(8, 2);
    const W = 0.76;
    const beltAnim = [], gears = [], turntables = [], dripPts = [], splices = [], hubs = [];
    const lightsets = {};
    const dist = {};               // per-path belt travel distance (for splices / hubs)
    const transfer = {};           // per-path s values where items change belts (crumbs)
    const nearSign = (yaw) => (Math.cos(yaw) >= -0.01 ? 1 : -1);
    const twinOf = (sg) => { const t = K.group(root, sg.position.x, sg.position.y, sg.position.z); t.rotation.order = 'YZX'; t.rotation.y = sg.rotation.y; return t; };

    function phaseMats(name, rw) {
      if (!lightsets[name]) lightsets[name] = { rw, m: [0, 1, 2, 3].map(() => K.glow(0x4a2208)) };
      return lightsets[name].m;
    }
    function drive(sg, path, lx, side, deckY) {
      const g = K.group(sg, lx, 0, side * (W / 2 + 0.42));
      const h = -deckY;
      const twin = twinOf(sg);
      K.box(0.62, h - 0.2, 0.5, M.ironM, 0, -h / 2 - 0.1, 0, g);
      K.box(0.72, 0.08, 0.6, M.rust, 0, -0.32, 0, g);
      for (let i = 0; i < 4; i++) K.box(0.64, 0.03, 0.52, M.ironL, 0, -h + 0.25 + i * 0.09, 0, g);
      const mot = K.cyl(0.2, 0.2, 0.5, M.iron, 10, -0.05, -h + 0.42, side * 0.12, g); mot.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) { const f = K.cyl(0.24, 0.24, 0.03, M.ironL, 10, -0.05, -h + 0.42, side * (-0.08 + i * 0.09), g); f.rotation.x = Math.PI / 2; }
      K.box(0.16, 0.1, 0.16, M.brass, -0.05, -h + 0.68, side * 0.12, g);
      K.box(0.86, 0.5, 0.06, M.hazard, 0.05, -0.15, side * 0.3, g);
      K.box(0.86, 0.06, 0.22, M.ironL, 0.05, 0.1, side * 0.22, g);
      const mv = K.group(twin, lx, 0, side * (W / 2 + 0.42 + 0.34));
      const big = gear(K, mv, 0.32, 0.08, 14, M.brass, 0.0, -0.12, 0); big.rotation.x = Math.PI / 2;
      const small = gear(K, mv, 0.16, 0.08, 8, M.brassL, -0.05, -0.62, 0); small.rotation.x = Math.PI / 2;
      gears.push({ g: big, path, s: 1 }, { g: small, path, s: -2 });
      K.box(0.08, 0.3, 0.04, M.soot, -0.2, -0.36, 0, mv); K.box(0.08, 0.3, 0.04, M.soot, 0.2, -0.36, 0, mv);
      dripPts.push([sg.position.x, 0.12, sg.position.z]);
    }

    // ----------------------------------------------------------------- BELT BUILDER
    function buildBelt(path, o) {
      o = o || {};
      const segs = path.segs, nS = segs.length, rw = !!o.rw;
      const lm = phaseMats(path.name, rw);
      dist[path.name] = 0;
      transfer[path.name] = segs.slice(1).map((s) => s.L0).concat([path.L - 0.05]);
      let lightN = 0;
      segs.forEach((sg0, si) => {
        const sg = sg0;
        const s0 = si === 0 ? (o.trimStart || 0) : 0;
        const s1 = sg.len - (si === nS - 1 ? (o.trimEnd || 0) : 0);
        const len = s1 - s0; if (len <= 0.05) return;
        const y0 = sg.a.y, deckY = 0.1 - y0;
        const g = K.group(stat, sg.a.x, sg.a.y, sg.a.z); g.rotation.order = 'YZX'; g.rotation.y = sg.yaw;
        const twin = twinOf(g);
        const ns = nearSign(sg.yaw);
        const cx = (s0 + s1) / 2;
        const tex = (rw ? BTXC : BTX).clone(); tex.needsUpdate = true; tex.repeat.set(len * 2, 1);
        const top = K.mat(0xffffff, { map: tex, shine: 26, spec: 0x2a2620 });
        K.box(len, 0.1, W, [M.soot, M.soot, top, M.soot, M.soot, M.soot], cx, -0.05, 0, g);
        beltAnim.push({ path, tex });
        // splices: bright cross-seams riding with the belt
        for (let k = 0; k < Math.max(1, Math.floor(len / 2.4)); k++) {
          const sp = K.group(twin, 0, 0.006, 0);
          K.box(0.05, 0.014, W * 0.94, rw ? M.steelL : M.brassL, 0, 0, 0, sp);
          for (const z of [-0.24, 0, 0.24]) K.box(0.08, 0.02, 0.04, M.soot, 0, 0.004, z, sp);
          K.bake(sp);
          splices.push({ m: sp, path, s0, len, ph: k * len / Math.max(1, Math.floor(len / 2.4)) });
        }
        K.box(len, 0.04, W * 0.86, M.soot, cx, -0.3, 0, g);
        for (let x = s0 + 0.2; x < s1; x += 0.42) { const r = K.cyl(0.07, 0.07, W + 0.04, M.ironXL, 6, x, -0.16, 0, g); r.rotation.x = Math.PI / 2; }
        for (const s of [-1, 1]) {
          K.box(len + 0.1, 0.28, 0.08, rw ? M.steel : M.iron, cx, -0.12, s * (W / 2 + 0.05), g);
          K.box(len + 0.1, 0.05, 0.14, rw ? (s === ns ? M.red : M.steelL) : (s === ns ? M.rustL : M.rust), cx, 0.04, s * (W / 2 + 0.07), g);
          K.box(len + 0.1, 0.04, 0.1, M.ironM, cx, -0.27, s * (W / 2 + 0.06), g);
          for (let x = s0 + 0.2; x < s1; x += 0.4) K.box(0.06, 0.06, 0.03, rw ? M.ironXL : M.brassL, x, -0.1, s * (W / 2 + 0.1), g);
        }
        for (let x = s0 + 0.45; x < s1 - 0.2; x += 0.95) { K.box(0.12, 0.07, 0.05, lm[lightN % 4], x, -0.02, ns * (W / 2 + 0.11), g); lightN++; }
        for (let x = s0 + 0.3; x < s1; x += 1.3 + K.rnd()) { const d = K.box(0.25 + K.rnd() * 0.4, 0.2, 0.01, M.grime, x, -0.15, ns * (W / 2 + 0.096), g); d.castShadow = false; }
        if (!o.high && y0 < 3) {
          const n = Math.max(1, Math.round(len / 1.5));
          for (let i = 0; i <= n; i++) {
            const lx = s0 + (len * i) / n; const wx = sg.a.x + Math.cos(sg.yaw) * lx, wz = sg.a.z - Math.sin(sg.yaw) * lx;
            if (!onDeck(wx, wz)) continue;
            const h = -deckY - 0.34;
            for (const s of [-1, 1]) { K.box(0.1, h, 0.1, M.iron, lx, -0.34 - h / 2, s * (W / 2 + 0.02), g); K.box(0.2, 0.05, 0.2, M.ironM, lx, deckY + 0.03, s * (W / 2 + 0.02), g); }
            K.box(0.08, 0.08, W + 0.12, M.ironM, lx, -0.34 - h * 0.55, 0, g);
          }
          if (len > 2.2) {
            K.box(Math.min(1.4, len * 0.4), 0.05, W * 0.9, M.ironM, cx, deckY + 0.04, 0, g);
            for (const s of [-1, 1]) K.box(Math.min(1.4, len * 0.4), 0.08, 0.03, M.ironL, cx, deckY + 0.08, s * W * 0.45, g);
            const pd = K.sph(1, M.oil, cx, deckY + 0.075, 0, g, 10, 4); pd.scale.set(Math.min(0.6, len * 0.17), 0.012, W * 0.36); pd.castShadow = false;
            for (let k = 0; k < 3; k++) dripPts.push([sg.a.x + Math.cos(sg.yaw) * (cx + (k - 1) * 0.4), y0 - 0.32, sg.a.z - Math.sin(sg.yaw) * (cx + (k - 1) * 0.4)]);
          }
        }
        const cap = (x, dir) => {
          const d = K.cyl(0.12, 0.12, W + 0.1, M.ironL, 10, x, -0.08, 0, g); d.rotation.x = Math.PI / 2;
          K.box(0.04, 0.24, W + 0.2, hazM, x + dir * 0.13, -0.12, 0, g);
          for (const s of [-1, 1]) K.box(0.16, 0.16, 0.05, M.brassD, x, -0.08, s * (W / 2 + 0.12), g);
          // spoked hub on the camera side that turns with the belt
          const hb = K.group(twin, x, -0.08, ns * (W / 2 + 0.16));
          K.cyl(0.11, 0.11, 0.03, M.ironXL, 10, 0, 0, 0, hb).rotation.x = Math.PI / 2;
          for (let k = 0; k < 3; k++) { const sk = K.box(0.2, 0.035, 0.04, M.soot, 0, 0, 0.01, hb); sk.rotation.z = k * Math.PI / 3; }
          K.bake(hb); hubs.push({ g: hb, path });
        };
        if (si === 0) cap(s0, -1);
        if (si === nS - 1) cap(s1, 1);
        if (o.drive && o.drive[0] === si) drive(g, path, o.drive[1] !== undefined ? o.drive[1] : s0 + 0.6, -ns, deckY);
        if (o.high) {
          // high line: dark iron deck, a full railing only on the FAR side, a low red lip in front,
          // LED edge strips and work lights so the cargo reads from LINE / DECK
          K.box(len, 0.06, W + 0.5, plateC, cx, -0.44, 0, g);
          K.box(len, 0.1, 0.03, hazM, cx, -0.42, ns * (W / 2 + 0.25), g);
          const fs = -ns;
          for (let x = s0 + 0.1; x <= s1; x += 1.0) K.box(0.04, 0.55, 0.04, M.steel, x, 0.3, fs * (W / 2 + 0.2), g);
          K.box(len, 0.04, 0.04, M.steel, cx, 0.57, fs * (W / 2 + 0.2), g);
          K.box(len, 0.02, 0.05, M.red, cx, 0.6, fs * (W / 2 + 0.2), g);
          K.box(len, 0.03, 0.03, M.steel, cx, 0.32, fs * (W / 2 + 0.2), g);
          for (const s of [-1, 1]) K.box(len, 0.012, 0.035, M.led, cx, 0.006, s * (W / 2 - 0.03), g);
          for (let x = s0 + 0.9; x < s1 - 0.4; x += 2.1) {
            K.box(0.05, 1.05, 0.05, M.steel, x, 0.5, fs * (W / 2 + 0.24), g);
            K.box(0.05, 0.05, 0.42, M.steel, x, 1.02, fs * (W / 2 + 0.04), g);
            K.box(0.26, 0.1, 0.16, M.ironM, x, 0.97, fs * 0.14, g);
            K.box(0.22, 0.02, 0.12, M.lampFace, x, 0.915, fs * 0.14, g);
            const pool = K.box(0.95, 0.008, W * 0.88, K.glow(0xffd8a0, 0.13, true), x, 0.012, 0, g); pool.castShadow = false;
          }
        }
      });
      for (let i = 1; i < path.points.length - 1; i++) {
        const v = path.points[i];
        const base = K.group(stat, v[0], v[1], v[2]);
        K.cyl(0.6, 0.62, 0.14, rw ? M.steel : M.ironL, 12, 0, -0.08, 0, base);
        K.cyl(0.66, 0.66, 0.05, rw ? M.redD : M.brassD, 12, 0, -0.16, 0, base);
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; K.box(0.06, 0.06, 0.06, M.brassL, Math.cos(a) * 0.62, -0.12, Math.sin(a) * 0.62, base); }
        if (v[1] < 3) { const h = v[1] - 0.25; K.cyl(0.14, 0.2, h, M.iron, 8, 0, -0.2 - h / 2 + 0.05, 0, base); K.cyl(0.2, 0.22, 0.05, M.ironM, 8, 0, 0.13 - v[1], 0, base); }
        const spin = K.group(root, v[0], v[1] + 0.005, v[2]);
        for (let k = 0; k < 6; k++) { const r = K.box(0.9, 0.035, 0.07, rw ? M.steelL : M.ironXL, 0, 0, 0, spin); r.rotation.y = k * Math.PI / 6; }
        K.cyl(0.1, 0.1, 0.05, M.brass, 8, 0, 0.01, 0, spin);
        K.bake(spin);
        turntables.push({ g: spin, path });
      }
    }

    buildBelt(P.ore, { trimStart: 0.45, trimEnd: 0.5, drive: [1, 0.7] });
    buildBelt(P.feed, { trimStart: 0, trimEnd: 0.5, drive: [0, 0.5] });
    buildBelt(P.pass, { trimStart: 0.5, trimEnd: 0.5, drive: [1, 1.4] });
    buildBelt(P.rw1, { trimStart: 0.5, trimEnd: 0.15, rw: true });
    buildBelt(P.rwIn, { trimStart: 0.35, trimEnd: 0.5, drive: [0, 0.9], rw: true });
    buildBelt(P.rwHigh, { trimStart: 0.35, trimEnd: 0.35, high: true, rw: true });

    // ----------------------------------------------------------------- HIGH LINE: bents + under-slung bridge truss
    const zH = P.rwHigh.points[0][2], yH = P.rwHigh.points[0][1];
    function bent(x) {
      const h = yH - 0.5;
      for (const dz of [-0.62, 0.62]) {
        K.box(0.16, h, 0.16, M.ironM, x, 0.1 + h / 2, zH + dz, stat);
        K.box(0.32, 0.08, 0.32, M.ironM, x, 0.14, zH + dz, stat);
        for (const y of [1.5, 3.2, 4.9]) K.box(0.18, 0.04, 0.18, M.red, x, y, zH + dz, stat);
        if (dz > 0) K.box(0.02, h - 0.4, 0.04, M.redD, x, 0.3 + (h - 0.4) / 2, zH + dz + 0.085, stat);
      }
      for (let y = 0.4; y < h - 0.6; y += 1.7) {
        strut(K, stat, [x, y, zH - 0.62], [x, y + 1.7, zH + 0.62], 0.05, M.iron);
        strut(K, stat, [x, y, zH + 0.62], [x, y + 1.7, zH - 0.62], 0.05, M.iron);
        K.box(0.06, 0.06, 1.3, M.iron, x, y, zH, stat);
      }
      K.box(0.2, 0.18, 1.6, M.ironM, x, yH - 0.56, zH, stat);
      K.box(0.22, 0.06, 1.62, hazM, x, yH - 0.45, zH, stat);
    }
    [-5.3, -6.7, -7.9, -12.5, -13.6].forEach(bent);
    const bx0 = -12.5, bx1 = -7.9, tY = yH - 0.5, bY = yH - 1.28, tz = 0.5;
    for (const dz of [-tz, tz]) {
      const z = zH + dz;
      K.box(bx1 - bx0, 0.12, 0.12, M.ironM, (bx0 + bx1) / 2, tY, z, stat);
      K.box(bx1 - bx0 - 0.3, 0.12, 0.12, M.ironM, (bx0 + bx1) / 2, bY, z, stat);
      const n = 8, step = (bx1 - bx0) / n;
      for (let i = 0; i < n; i++) {
        const x = bx0 + i * step;
        strut(K, stat, i % 2 ? [x, tY, z] : [x, bY, z], i % 2 ? [x + step, bY, z] : [x + step, tY, z], 0.06, M.iron);
        K.box(0.05, 0.05, 0.05, M.brassL, x, tY, z + Math.sign(dz) * 0.07, stat);
      }
      if (dz > 0) K.box(bx1 - bx0 - 0.3, 0.025, 0.02, M.red, (bx0 + bx1) / 2, bY - 0.07, z + 0.07, stat);
    }
    for (let x = bx0 + 0.3; x < bx1; x += 0.575) K.box(0.05, 0.05, 2 * tz, M.ironM, x, bY, zH, stat);
    for (const x of [bx0 + 0.15, bx1 - 0.15]) { K.box(0.3, 0.3, 0.03, hazM, x, (tY + bY) / 2, zH + tz + 0.075, stat); }
    // plain hazard plate on the front truss face (the wall sign carries the brand)
    K.box(1.6, 0.34, 0.04, hazM, bx0 + 1.2, (tY + bY) / 2, zH + tz + 0.1, stat);
    K.box(1.68, 0.05, 0.06, M.ironL, bx0 + 1.2, (tY + bY) / 2 + 0.19, zH + tz + 0.1, stat);
    // tube bracket from the truss
    const TP = P.tube.points;
    const tubeNear = (x, y) => { let best = TP[0], bd = 1e9; TP.forEach((p) => { const d = Math.abs(p[0] - x) + (y !== undefined ? Math.abs(p[1] - y) * 0.5 : 0); if (d < bd) { bd = d; best = p; } }); return best; };
    {
      const a = tubeNear(-9.2); strut(K, stat, [a[0], tY, zH + tz], [a[0], a[1] + 0.22, a[2]], 0.05, M.ironL);
      K.torus(0.29, 0.05, M.brassD, 4, 12, a[0], a[1], a[2], stat).rotation.y = Math.PI / 2;
    }

    // ----------------------------------------------------------------- REWORK BUCKET ELEVATORS
    // loop geometry (relative to tower center): front leg up z=0, head sheave over the top, return leg at the back
    const R0 = 0.475, LEG = yH - 1.0, ARC = Math.PI * R0, LT = 2 * LEG + 2 * ARC, ZB = -2 * R0;
    function loopPose(d) {
      d = ((d % LT) + LT) % LT;
      if (d < LEG) return [1.0 + d, 0, 0];
      if (d < LEG + ARC) { const f = (d - LEG) / R0; return [yH + R0 * Math.sin(f), -R0 + R0 * Math.cos(f), -f]; }
      if (d < 2 * LEG + ARC) return [yH - (d - LEG - ARC), ZB, -Math.PI];
      const s = (d - 2 * LEG - ARC) / R0; return [1.0 - R0 * Math.sin(s), -R0 - R0 * Math.cos(s), -Math.PI - s];
    }
    const chainMats = [];
    const lifts = {};
    const rwT = textTex(K, 'REWORK', { fg: '#ffe0c8', bg: '#7a1a10', edge: '#16100c', arrow: 1 });
    const rwTd = textTex(K, 'REWORK', { fg: '#ffe0c8', bg: '#7a1a10', edge: '#16100c', arrow: -1 });
    function tower(path, dirUp, open, riserSide) {
      const x = path.points[0][0], z = path.points[0][2];
      const top = yH + 1.15, baseY = 0.1, hw = 0.52;
      const tg = K.group(stat, x, 0, z);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const y0 = open && open[0] === sx && open[1] === sz ? 1.75 : baseY;
        K.box(0.14, top - y0, 0.14, M.ironM, sx * hw, (top + y0) / 2, sz * hw, tg);
        if (sz > 0) K.box(0.03, top - y0 - 0.3, 0.02, M.red, sx * hw, (top + y0) / 2, sz * hw + 0.08, tg);
        if (y0 === baseY) K.box(0.3, 0.08, 0.3, M.ironM, sx * hw, 0.14, sz * hw, tg);
        else { strut(K, tg, [sx * hw, 1.8, sz * hw], [sx * hw, 2.6, -sz * hw * 0.2], 0.08, M.ironM); strut(K, tg, [sx * hw, 1.8, sz * hw], [-sx * hw * 0.2, 2.6, sz * hw], 0.08, M.ironM); K.box(0.2, 0.12, 0.2, M.hazard, sx * hw, 1.72, sz * hw, tg); }
      }
      for (let y = 0.6; y < yH - 1.0; y += 1.25) {
        K.box(hw * 2, 0.06, 0.06, M.iron, 0, y, hw, tg); K.box(hw * 2, 0.06, 0.06, M.iron, 0, y, -hw, tg);
        for (const sx of [-1, 1]) K.box(0.06, 0.06, hw * 2, M.iron, sx * hw, y, 0, tg);
        for (const sx of [-1, 1]) strut(K, tg, [sx * hw, y, -hw], [sx * hw, y + 1.25, hw], 0.04, M.iron);
      }
      // return leg guides at the back (outside the tower face) + chains on both legs
      const mkChain = (d) => { const m = K.mat(0xffffff, { map: (() => { const t = CH.clone(); t.needsUpdate = true; t.repeat.set(1, (top - 0.4) * 3); return t; })() }); chainMats.push({ m, dir: d, path }); return m; };
      const chF = mkChain(dirUp), chB = mkChain(-dirUp);
      for (const sx of [-1, 1]) {
        K.box(0.06, LEG + 0.2, 0.1, M.ironL, sx * 0.4, 1.0 + LEG / 2, -0.13, tg);
        K.box(0.07, LEG, 0.07, chF, sx * 0.44, 1.0 + LEG / 2, 0.02, tg);
        K.box(0.07, LEG, 0.07, chB, sx * 0.44, 1.0 + LEG / 2, ZB, tg);
        K.box(0.06, LEG + 0.2, 0.06, M.steel, sx * 0.47, 1.0 + LEG / 2, ZB - 0.36, tg);
        for (let y = 1.4; y < yH; y += 1.25) K.box(0.06, 0.06, 0.5, M.steel, sx * 0.47, y, -0.6, tg);
      }
      // boot + head frame
      K.box(1.2, 0.36, 1.2, M.ironM, 0, 0.28, -0.0, tg); K.box(1.24, 0.06, 1.24, M.rust, 0, 0.47, 0, tg);
      K.box(1.18, 0.12, 0.04, hazM, 0, 0.36, 0.61, tg);
      K.box(1.3, 0.12, 1.5, M.ironM, 0, top, -0.15, tg);
      K.box(1.3, 0.16, 0.06, hazM, 0, top - 0.12, 0.62, tg);
      K.box(1.8, 0.06, 1.9, plateC, 0, top + 0.08, -0.15, tg);
      for (const s of [-1, 1]) { K.box(1.8, 0.04, 0.04, M.steel, 0, top + 0.62, -0.15 + s * 0.95, tg); K.box(0.04, 0.04, 1.9, M.steel, s * 0.9, top + 0.62, -0.15, tg); for (const k of [-0.9, 0, 0.9]) { K.box(0.04, 0.55, 0.04, M.steel, s * 0.9, top + 0.35, -0.15 + k, tg); K.box(0.04, 0.55, 0.04, M.steel, k, top + 0.35, -0.15 + s * 0.95, tg); } }
      K.box(1.8, 0.02, 0.05, M.red, 0, top + 0.65, 0.8, tg);
      K.box(0.5, 0.36, 0.4, M.iron, 0, top + 0.3, -0.35, tg); for (let i = 0; i < 4; i++) K.box(0.52, 0.03, 0.42, M.ironL, 0, top + 0.18 + i * 0.07, -0.35, tg);
      // REWORK sign on the head frame front, in front of the posts (never clipped, never over the cargo lane)
      sign(K, tg, dirUp > 0 ? rwT : rwTd, 0.3, 0, top - 0.32, hw + 0.13, 0x3a0804);
      // sheaves: head + boot, both sides (spin)
      const sp = [];
      for (const [cy, r] of [[yH, R0], [1.0, R0]]) {
        const grp = K.group(root, x, cy, z - R0);
        for (const sx of [-1, 1]) { const gg = gear(K, grp, r * 0.92, 0.07, 12, M.brassL, sx * 0.47, 0, 0); gg.rotation.z = Math.PI / 2; gg.rotation.order = 'ZXY'; sp.push(gg); }
        K.cyl(0.05, 0.05, 1.0, M.ironL, 6, 0, 0, 0, grp).rotation.z = Math.PI / 2;
      }
      sp.forEach((gg) => gears.push({ g: gg, path, s: dirUp * 1.4, lift: true }));
      const bc = K.sph(0.11, K.mat(0x401010, { e: 0 }), x + 0.55, top + 0.95, z + 0.6, root, 8, 6);
      K.cyl(0.07, 0.09, 0.3, M.ironM, 8, x + 0.55, top + 0.75, z + 0.6, stat);
      // the elevator loop: one empty bucket waits at the boarding point, others circulate on the return leg
      const L = { path, x, z, dir: dirUp, boardD: dirUp > 0 ? 0 : LEG, alightD: dirUp > 0 ? LEG : 0, retLen: LT - LEG, waiting: null, ret: [], pool: [], bc, top, riserSide };
      const mk = () => { const m = bucketMesh(K); root.add(m); return m; };
      L.waiting = mk();
      L.ret.push({ m: mk(), tr: L.retLen * 0.3 }, { m: mk(), tr: L.retLen * 0.65 });
      lifts[path.name] = L;
      return L;
    }
    const upT = tower(P.rwUp, 1, [1, 1], 1);
    const dnT = tower(P.rwDown, -1, null, -1);
    function placeBucket(L, m, d) { const [y, zr, rot] = loopPose(d); m.position.set(L.x, y, L.z + zr); m.rotation.set(rot, 0, 0); }
    I.on('carrierDrop', (e) => {
      const L = lifts[e.path]; if (!L || e.carrier !== 'bucket') return;
      const m = L.pool.pop() || (() => { const b = bucketMesh(K); root.add(b); return b; })();
      m.visible = true; L.ret.push({ m, tr: 0 }); placeBucket(L, m, L.alightD);
      // a little tip-out of grit as the capsule rolls off
      for (let i = 0; i < 4; i++) K.spawn(root, L.x + K.R() * 0.4, e.pos.y + 0.05, L.z + K.R() * 0.4, K.R() * 0.6, 0.4, K.R() * 0.6, 0x3a332c, 0.6, 0.04, 6);
    });
    I.on('carrierPick', (e) => {
      const L = lifts[e.path]; if (!L || e.carrier !== 'bucket') return;
      const cm = e.item.carrierMeshes && e.item.carrierMeshes.bucket; if (cm) cm.quaternion.copy(e.item.mesh.quaternion).invert();
      if (L.waiting) { L.waiting.visible = false; L.pool.push(L.waiting); L.waiting = null; }
      else if (L.ret.length) { L.ret.sort((a, b) => b.tr - a.tr); const r = L.ret.shift(); r.m.visible = false; L.pool.push(r.m); }
    });

    // ----------------------------------------------------------------- PNEUMATIC TUBE
    const tubeG = K.group(stat);
    const glassPts = TP.slice(0);
    const glass = K.tube(glassPts, 0.25, M.glass, tubeG, 160, 12); glass.castShadow = false;
    const curve = new THREE.CatmullRomCurve3(glassPts.map(V));
    const tubeLen = curve.getLength();
    const joints = [];
    for (let u = 0.02; u < 1; u += 0.62 / tubeLen) {
      const p = curve.getPointAt(u), tn = curve.getTangentAt(u);
      const big = Math.round(u * tubeLen / 0.62) % 4 === 0;
      const c = K.torus(big ? 0.31 : 0.28, big ? 0.06 : 0.04, big ? M.brass : M.brassD, 5, 14, p.x, p.y, p.z, tubeG);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tn);
      if (big) {
        joints.push({ p: p.clone(), s: u * P.tube.L });
        for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; const b = K.box(0.06, 0.06, 0.12, M.brassL, 0, 0, 0, tubeG); const off = new THREE.Vector3(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0).applyQuaternion(c.quaternion); b.position.copy(p).add(off); b.quaternion.copy(c.quaternion); }
      }
    }
    K.tube(glassPts.map((p) => [p[0], p[1] + 0.32, p[2]]), 0.04, M.copper, tubeG, 120, 5);
    // inner streak: thin, dim teal and set to the FAR side so the capsule is the brightest thing in the glass
    const streakM = K.glow(0x2a9a84, 0.0, true);
    const streak = K.tube(glassPts.map((p) => [p[0], p[1], p[2] - 0.17]), 0.035, streakM, root, 120, 5); streak.castShadow = false;
    // suction rings running just ahead of each capsule
    const sucRings = [0, 1, 2].map(() => { const r = K.torus(0.235, 0.018, K.glow(0x5ae0c8, 0.5, true), 4, 16, 0, 0, 0, root); r.visible = false; r.castShadow = false; return r; });
    {
      const a = tubeNear(-7.05);
      const px = a[0], pz = a[2] + 0.35, py = a[1] - 0.28;
      K.box(0.2, py - 0.1, 0.2, M.iron, px, (py + 0.1) / 2, pz, stat); K.box(0.4, 0.08, 0.4, M.ironM, px, 0.14, pz, stat);
      strut(K, stat, [px, py - 1.2, pz], [px - 0.6, 0.12, pz + 0.3], 0.07, M.iron);
      strut(K, stat, [px, py, pz], [a[0], a[1] - 0.25, a[2]], 0.08, M.ironL);
      K.box(0.5, 0.1, 0.5, M.brassD, a[0], a[1] - 0.3, a[2], stat);
      for (const y of [1.4, 2.8, 4.2]) K.box(0.26, 0.06, 0.26, M.brassD, px, y, pz, stat);
    }
    const tStart = TP.findIndex((p) => p[1] > 4.75);
    const bl = TP[Math.min(TP.length - 1, Math.max(0, tStart))];
    const blower = K.group(stat, bl[0] + 0.78, bl[1] + 0.05, bl[2]);
    K.box(0.5, 0.26, 0.26, K.mat(0x7a3c20, { shine: 30 }), bl[0] + 0.3, bl[1] + 0.05, bl[2], stat); K.torus(0.27, 0.05, M.brass, 4, 12, bl[0] + 0.22, bl[1] + 0.05, bl[2], stat).rotation.y = Math.PI / 2;
    const volM = K.mat(0x7a3c20, { shine: 30, spec: 0x6a3a20 });
    K.cyl(0.5, 0.5, 0.36, volM, 16, 0, 0, 0, blower).rotation.x = Math.PI / 2;
    K.torus(0.5, 0.05, M.brass, 4, 18, 0, 0, 0.19, blower); K.torus(0.5, 0.05, M.brass, 4, 18, 0, 0, -0.19, blower);
    K.box(0.42, 0.34, 0.36, volM, 0.4, 0.22, 0, blower);
    K.box(0.05, 0.4, 0.4, M.brassD, 0.62, 0.22, 0, blower);
    K.cyl(0.34, 0.34, 0.04, M.soot, 14, 0, 0, 0.2, blower).rotation.x = Math.PI / 2;
    K.cyl(0.2, 0.2, 0.42, M.iron, 10, 0, 0, -0.42, blower).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) K.cyl(0.24, 0.24, 0.03, M.ironL, 10, 0, 0, -0.28 - i * 0.09, blower).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) K.box(0.05, 0.05, 0.05, M.brassL, Math.cos(i) * 0.45, Math.sin(i) * 0.45, 0.2, blower);
    const blowLamp = K.box(0.12, 0.12, 0.04, K.glow(0x2a6a5a), 0, 0, 0, root);
    blowLamp.position.set(bl[0] + 1.18, bl[1] + 0.47, bl[2] + 0.19);
    const imp = K.group(root, bl[0] + 0.78, bl[1] + 0.05, bl[2] + 0.23);
    for (let k = 0; k < 6; k++) { const b = K.box(0.06, 0.6, 0.03, M.brassL, 0, 0, 0, imp); b.rotation.z = k * Math.PI / 6; }
    K.bake(imp);
    const te = TP[TP.length - 1];
    const noz = K.group(stat, te[0], te[1], te[2]);
    K.lathe([[0.27, 0.15], [0.3, 0.0], [0.4, -0.12], [0.42, -0.16]], M.brass, 14, 0, 0, 0, noz);
    K.torus(0.42, 0.04, M.brassD, 4, 16, 0, -0.16, 0, noz).rotation.x = Math.PI / 2;
    K.cyl(0.3, 0.3, 0.12, M.brassD, 14, 0, 0.28, 0, noz);
    const flapPiv = K.group(root, te[0] + 0.42, te[1] - 0.16, te[2]);
    K.box(0.06, 0.04, 0.7, M.copper, -0.42, 0, 0, flapPiv);
    K.box(0.06, 0.05, 0.06, M.brassL, 0, 0, 0, flapPiv);
    {
      const fx = te[0] - 0.15, z0 = te[2] - 0.7, z1 = te[2] + 0.7, hh = 3.0;
      for (const z of [z0, z1]) { K.box(0.14, hh, 0.14, M.iron, fx, 0.1 + hh / 2, z, stat); K.box(0.3, 0.08, 0.3, M.ironM, fx, 0.14, z, stat); }
      K.box(0.16, 0.16, z1 - z0 + 0.3, M.iron, fx, 0.1 + hh, te[2], stat);
      strut(K, stat, [fx, 0.1 + hh - 0.6, z0], [fx, 0.1 + hh, z0 + 0.6], 0.06, M.ironM);
      strut(K, stat, [fx, 0.1 + hh - 0.6, z1], [fx, 0.1 + hh, z1 - 0.6], 0.06, M.ironM);
      const a = tubeNear(te[0], 3.0); K.torus(0.3, 0.06, M.brassD, 4, 12, a[0], 3.0, a[2], stat).rotation.x = Math.PI / 2;
      strut(K, stat, [fx, 0.1 + hh, a[2]], [a[0], 3.0, a[2]], 0.06, M.ironL);
    }
    const tubeT = textTex(K, 'TUBE', { fg: '#c8fff0', bg: '#16463c', edge: '#0c0a08' });
    sign(K, stat, tubeT, 0.26, te[0] - 0.85, 2.7, te[2] + 0.74, 0x062018);
    K.box(0.06, 0.4, 0.06, M.iron, te[0] - 0.85, 2.95, te[2] + 0.72, stat);

    // ----------------------------------------------------------------- CI INSPECTION ARCH over the ship belt
    const ps = P.pass.segs[1];
    const archS = ps.L0 + ps.len * 0.5;
    const archP = new THREE.Vector3(); P.pass.at(archS, archP);
    const arch = K.group(stat, archP.x, archP.y, archP.z); arch.rotation.y = ps.yaw;
    const aH = 1.55;
    for (const s of [-1, 1]) {
      K.box(0.22, aH + 0.9, 0.22, M.ironM, 0, -0.9 + (aH + 0.9) / 2, s * 0.72, arch);
      K.box(0.4, 0.1, 0.4, M.ironM, 0, -0.85, s * 0.72, arch);
      K.box(0.3, 0.2, 0.3, M.brassD, 0, aH - 0.05, s * 0.72, arch);
      for (const y of [-0.4, 0.3, 1.0]) K.box(0.26, 0.06, 0.26, M.brass, 0, y, s * 0.72, arch);
      K.box(0.02, aH + 0.6, 0.1, hazM, 0.12, -0.6 + (aH + 0.6) / 2, s * 0.72, arch);
    }
    K.box(0.42, 0.34, 1.8, M.iron, 0, aH + 0.2, 0, arch);
    K.box(0.46, 0.05, 1.84, M.brass, 0, aH + 0.38, 0, arch);
    K.box(0.12, 0.5, 0.08, M.iron, 0, aH + 0.55, 0, arch);
    // live display board facing the camera: CI READY / SCAN #142 / #142 PASS
    const dc = document.createElement('canvas'); dc.width = 128; dc.height = 32; const dg = dc.getContext('2d');
    const dtex = new THREE.CanvasTexture(dc); dtex.magFilter = dtex.minFilter = THREE.NearestFilter; dtex.generateMipmaps = false;
    const dispM = new THREE.MeshBasicMaterial({ map: dtex, fog: false });
    let dispLast = '';
    function drawCI(text, col, bg) {
      const key = text + col; if (key === dispLast) return; dispLast = key;
      dg.fillStyle = '#0a0806'; dg.fillRect(0, 0, 128, 32); dg.fillStyle = bg || '#06140c'; dg.fillRect(2, 2, 124, 28);
      dg.font = FONT; dg.textAlign = 'center'; dg.textBaseline = 'middle'; dg.fillStyle = col; dg.fillText(text, 64, 17);
      dtex.needsUpdate = true;
    }
    drawCI('CI READY', '#3aa060');
    const archMv = K.group(root, archP.x, archP.y, archP.z); archMv.rotation.y = ps.yaw;
    {
      const bd = K.group(archMv, 0, aH + 0.86, 0); bd.rotation.y = -ps.yaw;
      K.box(1.2, 0.3, 0.05, [M.ironM, M.ironM, M.ironM, M.ironM, dispM, M.ironM], 0, 0, 0, bd);
      K.box(1.26, 0.05, 0.1, M.brass, 0, 0.18, 0, bd); K.box(1.26, 0.05, 0.1, M.brass, 0, -0.18, 0, bd);
    }
    const beamM = K.glow(0x7af0d8, 0.35, true);
    const beam = K.box(0.05, aH - 0.05, 1.2, beamM, 0, aH / 2 - 0.02, 0, archMv); beam.castShadow = false;
    const lasers = []; for (const z of [-0.36, -0.12, 0.12, 0.36]) { const l = K.box(0.03, aH - 0.05, 0.03, K.glow(0x9affea, 0.8, true), 0, aH / 2 - 0.02, z, archMv); l.castShadow = false; lasers.push(l); }
    const footM = K.glow(0x7af0d8, 0.4, true); const foot = K.box(0.34, 0.012, W * 0.95, footM, 0, 0.012, 0, archMv); foot.castShadow = false;
    const slitM = K.glow(0x2cb89c);
    K.box(0.12, 0.05, 1.3, slitM, 0, aH + 0.02, 0, archMv);
    const ciLampM = K.mat(0x103a20, { e: 0 });
    K.sph(0.12, ciLampM, 0, aH + 0.52, 0.55, archMv, 8, 6);
    const ciLampB = K.sph(0.12, K.mat(0x3a2a08, { e: 0 }), 0, aH + 0.52, -0.55, archMv, 8, 6);
    let archFlash = 0, archItem = null; const archPrev = new WeakMap();

    // ----------------------------------------------------------------- MERGE PLATE at the assembler tray (kept outside the state ring)
    const mp = K.group(stat, -14.35, 0.1, 2.45);
    { const pl = K.box(1.25, 0.03, 1.25, plateM, 0, 0.015, 0, mp); pl.rotation.y = Math.PI / 4; }
    for (let k = 0; k < 3; k++) { const ch = K.box(0.28, 0.02, 0.09, M.hazard, -0.25 + k * 0.25, 0.04, -0.25 + k * 0.25, mp); ch.rotation.y = Math.PI / 4; }
    const sema = [];
    function semaphore(path, side) {
      const sg = path.segs[path.segs.length - 1];
      const end = new THREE.Vector3(); path.at(path.L - 0.9, end);
      const perp = [Math.sin(sg.yaw), Math.cos(sg.yaw)];
      const x = end.x + perp[0] * side * 0.75, z = end.z + perp[1] * side * 0.75;
      K.cyl(0.04, 0.05, 1.55, M.iron, 6, x, 0.85, z, stat);
      K.box(0.18, 0.4, 0.16, M.ironM, x, 1.65, z, stat);
      K.box(0.22, 0.04, 0.2, M.brassD, x, 1.87, z, stat);
      const g1 = K.mat(0x0c2a14, { e: 0 }), a1 = K.mat(0x2a1c08, { e: 0 });
      K.sph(0.09, g1, x, 1.74, z + 0.1, root, 8, 6);
      K.sph(0.09, a1, x, 1.55, z + 0.1, root, 8, 6);
      K.box(0.22, 0.03, 0.1, M.soot, x, 1.84, z + 0.12, stat); K.box(0.22, 0.03, 0.1, M.soot, x, 1.65, z + 0.12, stat);
      sema.push({ path, g1, a1 });
    }
    semaphore(P.ore, 1); semaphore(P.rwIn, -1);

    // ----------------------------------------------------------------- AETHER CONDUITS (runs kept outside the r3.75 state rings)
    const SRC = [0, 0.35, -2.9];
    const yC = 0.17, zB = -4.35;
    const upRx = upT.x + 0.78 * upT.riserSide, dnRx = dnT.x + 0.78 * dnT.riserSide, rz = -0.25;
    const branches = [
      { to: 'assembler', pts: [SRC, [0, yC, -3.3], [0, yC, zB], [-3.0, yC, zB], [-6.6, yC, zB], [-7.4, yC, -3.55], [-7.4, 0.35, -2.4]] },
      { to: 'launch', pts: [[0, yC, zB], [3.0, yC, zB], [6.4, yC, zB], [7.2, yC, -3.55], [7.2, 0.35, -2.3]] },
      { to: 'rwDown', pts: [[-6.6, yC, zB], [-10.0, yC, zB], [dnRx, yC, zB], [dnRx, yC, dnT.z + rz], [dnRx, 2.0, dnT.z + rz], [dnRx, dnT.top + 0.3, dnT.z + rz], [dnT.x - 0.26 * dnT.riserSide * -1, dnT.top + 0.3, dnT.z - 0.35]], riser: true },
      { to: 'rwUp', pts: [[-3.0, yC, zB], [upRx, yC, zB], [upRx, yC, upT.z + rz], [upRx, 2.0, upT.z + rz], [upRx, upT.top + 0.3, upT.z + rz], [upT.x + 0.26 * upT.riserSide, upT.top + 0.3, upT.z - 0.35]], riser: true },
      { to: 'launch', pts: [[5.2, yC, zB], [5.2, yC, -1.0], [5.2, yC, archP.z - 0.95], [5.2, 0.55, archP.z - 0.8]] }
    ];
    const pulses = [], aethNodes = [], coreMats = {};
    const aethG = K.group(stat);
    branches.forEach((br, bi) => {
      const pts = br.pts;
      const cp = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) cp.add(new THREE.LineCurve3(V(pts[i]), V(pts[i + 1])));
      const L = cp.getLength();
      coreMats[bi] = K.glow(C.aethDim);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = V(pts[i]), b = V(pts[i + 1]), len = a.distanceTo(b); if (len < 0.01) continue;
        const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const core = K.cyl(0.085, 0.085, len + 0.05, coreMats[bi], 8, mid.x, mid.y, mid.z, aethG); core.quaternion.copy(q); core.castShadow = false;
        const sheath = K.cyl(0.11, 0.11, len - 0.1, M.glass, 8, mid.x, mid.y, mid.z, aethG); sheath.quaternion.copy(q); sheath.castShadow = false;
        for (let d = 0.35; d < len - 0.2; d += 0.7) {
          const p = a.clone().addScaledVector(dir, d);
          if (Math.round(d / 0.7) % 3 === 1) { for (let k = -2; k <= 2; k++) { const c = K.torus(0.13, 0.025, M.copper, 4, 10, 0, 0, 0, aethG); c.position.copy(p).addScaledVector(dir, k * 0.055); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); } }
          else { const c = K.torus(0.13, 0.04, M.brass, 4, 10, 0, 0, 0, aethG); c.position.copy(p); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); }
        }
        if (a.y < 0.5 && b.y < 0.5) for (let d = 0.6; d < len - 0.3; d += 1.4) { const p = a.clone().addScaledVector(dir, d); K.box(0.2, 0.1, 0.2, M.ironM, p.x, 0.12, p.z, aethG); }
        if (i > 0) K.sph(0.14, M.brassD, a.x, a.y, a.z, aethG, 8, 6);
      }
      const n = Math.max(2, Math.round(L / 1.6));
      for (let i = 0; i < n; i++) { const m = K.sph(0.11, K.glow(0xb8fff0, 0.95, true), 0, 0, 0, root, 6, 4); m.castShadow = false; pulses.push({ m, curve: cp, u: i / n, L, to: br.to, bi, riser: !!br.riser }); }
    });
    function jbox(x, z, big) {
      const s = big ? 1 : 0.7;
      K.box(0.6 * s, 0.5 * s, 0.5 * s, M.ironM, x, 0.1 + 0.25 * s, z, aethG);
      K.box(0.66 * s, 0.06, 0.56 * s, M.brass, x, 0.1 + 0.5 * s, z, aethG);
      for (const sx of [-1, 1]) K.box(0.06, 0.06, 0.06, M.brassL, x + sx * 0.25 * s, 0.1 + 0.4 * s, z + 0.26 * s, aethG);
      const eye = K.cyl(0.11 * s, 0.11 * s, 0.05, K.glow(C.aeth), 10, x, 0.1 + 0.28 * s, z + 0.26 * s, root); eye.rotation.x = Math.PI / 2;
      aethNodes.push(eye);
    }
    jbox(0, zB, true); jbox(-3.0, zB); jbox(-6.6, zB); jbox(5.2, zB);
    const valveM = K.mat(0x9a2a18);
    for (const [x, z] of [[-1.6, zB], [2.6, zB], [-10.4, zB], [5.2, 0.4]]) {
      K.cyl(0.05, 0.05, 0.32, M.ironL, 6, x, 0.32, z, aethG);
      K.torus(0.15, 0.035, valveM, 4, 12, x, 0.5, z, aethG).rotation.x = Math.PI / 2;
      for (let k = 0; k < 3; k++) { const sp = K.box(0.28, 0.02, 0.02, valveM, x, 0.5, z, aethG); sp.rotation.y = k * Math.PI / 3; }
    }
    for (const p of [[-7.4, 0.35, -2.4], [7.2, 0.35, -2.3], [0, 0.35, -2.9]]) K.cyl(0.17, 0.17, 0.08, M.brass, 10, p[0], p[1] - 0.05, p[2], aethG);

    // ----------------------------------------------------------------- BAKE
    K.bake(stat);

    // ----------------------------------------------------------------- UPDATE
    const v = new THREE.Vector3();
    let tDrip = 0, prevFeedIds = new Set(), flapOpen = 0, tSteam = 0;
    const prevS = new WeakMap();
    const stState = (id) => { const st = I.stations && I.stations[id]; return !st ? 'IDLE' : st.blocked ? 'BLOCKED' : st.state; };
    const crumbs = (x, y, z, it) => {
      if (it.kind === 'issue') { const col = ctx.MINES[it.src] ? ctx.MINES[it.src].color : 0x8a6a4a; for (let i = 0; i < 3; i++) K.spawn(root, x + K.R() * 0.3, y + 0.08, z + K.R() * 0.3, K.R() * 0.8, 0.3 + Math.random() * 0.4, K.R() * 0.8, i ? 0x2a241f : col, 0.9, 0.045, 7); }
      else for (let i = 0; i < 2; i++) K.spawn(root, x + K.R() * 0.3, y + 0.05, z + K.R() * 0.3, K.R() * 0.5, 0.2, K.R() * 0.5, 0x8a7e6c, 0.7, 0.03, 4);
    };
    return { update(t, dt) {
      // belts + splices + hubs ride with their items; jammed belts stop
      beltAnim.forEach((b) => (b.tex.offset.x -= dt * 2 * b.path.speed * b.path.flow));
      for (const n in dist) dist[n] += dt * P[n].speed * P[n].flow;
      splices.forEach((s) => { s.m.position.x = s.s0 + ((dist[s.path.name] + s.ph) % s.len); });
      hubs.forEach((h) => (h.g.rotation.z -= dt * h.path.speed * h.path.flow / 0.12));
      for (const name in lightsets) {
        const p = P[name], ls = lightsets[name], ms = ls.m;
        if (p.jammed) { const on = Math.sin(t * 9) > 0; ms.forEach((m) => m.color.setHex(on ? 0xff2a10 : 0x3a0804)); }
        else { const k = Math.floor(t * 5 * Math.max(0.2, p.flow)) % 4; ms.forEach((m, i) => m.color.setHex(i === (3 - k) ? (ls.rw ? 0xff5a3a : 0xffb040) : (ls.rw ? 0x3a0e08 : 0x5a2a0a))); }
      }
      gears.forEach((q) => { const busy = q.lift ? (q.path.items.length || lifts[q.path.name].ret.length ? 1 : 0.15) : q.path.flow; q.g.rotation.y += dt * q.s * 2.2 * busy; });
      turntables.forEach((tt) => (tt.g.rotation.y += dt * 1.2 * tt.path.flow));
      // crumbs / dust at every transfer point and belt end
      ['ore', 'feed', 'pass', 'rw1', 'rwHigh', 'rwIn'].forEach((n) => P[n].items.forEach((it) => {
        const s0 = prevS.has(it) && prevS.get(it).p === n ? prevS.get(it).s : it.s;
        for (const ts of transfer[n]) if (s0 < ts && it.s >= ts) { const pp = it.mesh.position; crumbs(pp.x, pp.y, pp.z, it); }
        prevS.set(it, { p: n, s: it.s });
      }));
      // bucket elevators: chains run while anything rides; empties circulate back on the return leg
      for (const name in lifts) {
        const L = lifts[name];
        L.ret.sort((a, b) => b.tr - a.tr);
        let lim = L.waiting ? L.retLen - 0.95 : L.retLen;
        for (let i = 0; i < L.ret.length; i++) {
          const r = L.ret[i];
          r.tr = Math.min(r.tr + dt * 2.0, lim); lim = r.tr - 0.95;
          placeBucket(L, r.m, L.alightD + L.dir * r.tr);
        }
        if (!L.waiting && L.ret.length && L.ret[0].tr >= L.retLen - 1e-3) { L.waiting = L.ret.shift().m; }
        if (L.waiting) placeBucket(L, L.waiting, L.boardD);
        L.path.items.forEach((it) => { const cm = it.carrierMeshes && it.carrierMeshes.bucket; if (cm) cm.quaternion.copy(it.mesh.quaternion).invert(); });
        const on = L.path.items.length > 0;
        L.bc.material.emissive.setHex(on && Math.sin(t * 7) > 0 ? 0xff3010 : 0);
      }
      chainMats.forEach((c) => { const L = lifts[c.path.name]; const run = c.path.items.length || L.ret.length ? 1 : 0; c.m.map.offset.y -= dt * c.dir * 3 * 1.5 * run; });
      // pneumatic tube: impeller + dim far-side streak + suction rings just ahead of each capsule
      const inTube = P.tube.items.length;
      imp.rotation.z += dt * (inTube ? 40 : 4);
      streakM.opacity += ((inTube ? 0.16 : 0.05) - streakM.opacity) * Math.min(1, dt * 6);
      blowLamp.material.color.setHex(inTube ? (Math.sin(t * 14) > 0 ? 0x9affea : 0x3ac0a0) : 0x1e5a4c);
      sucRings.forEach((r, i) => {
        const it = P.tube.items[i];
        if (!it || it.s + 0.55 > P.tube.L) { r.visible = false; return; }
        const sg = P.tube.at(it.s + 0.55, v); r.visible = true; r.position.copy(v);
        r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(sg.dx, sg.dy, sg.dz).normalize());
        r.material.opacity = 0.35 + Math.sin(t * 30 + i) * 0.15;
      });
      if (inTube && Math.random() < 0.3) K.spawn(root, bl[0] + 1.3, bl[1] + 0.4, bl[2], 0.6 + K.R() * 0.3, 0.6, K.R() * 0.3, 0x9a8e7c, 0.9, 0.08, -0.1);
      // steam leaks at the big tube joints (hiss harder as a capsule passes)
      tSteam -= dt;
      if (tSteam <= 0) {
        tSteam = 0.22;
        joints.forEach((j) => {
          const near = P.tube.items.some((it) => Math.abs(it.s - j.s) < 0.8);
          if (Math.random() < (near ? 0.9 : 0.12)) K.spawn(root, j.p.x + K.R() * 0.1, j.p.y + 0.28, j.p.z + 0.2, K.R() * 0.4, 0.5 + Math.random() * 0.4, 0.25, near ? 0xe8e4dc : 0xa8a094, near ? 0.9 : 1.2, near ? 0.06 : 0.05, -0.15);
        });
      }
      // drop nozzle: flap kicks open + air puff when a capsule lands on the feed belt
      P.feed.items.forEach((it) => {
        if (it.s < 0.35 && !prevFeedIds.has(it.id)) {
          prevFeedIds.add(it.id); flapOpen = 1;
          for (let i = 0; i < 10; i++) K.spawn(root, te[0] + K.R() * 0.3, te[1] - 0.2, te[2] + K.R() * 0.3, K.R() * 2.2, -0.2 + Math.random() * 0.8, K.R() * 2.2, Math.random() < 0.5 ? 0xd8d0c0 : 0xa89c88, 0.7, 0.07, -0.2);
        }
      });
      if (prevFeedIds.size > 40) prevFeedIds = new Set([...prevFeedIds].slice(-10));
      flapOpen = Math.max(0, flapOpen - dt * 1.6);
      flapPiv.rotation.z = -flapOpen * 1.2;
      // CI arch: scan, then a green flash + "#142 PASS" on the board as each PR crosses the scan plane
      let scanning = null;
      P.pass.items.forEach((it) => {
        const ps0 = archPrev.has(it) ? archPrev.get(it) : it.s; archPrev.set(it, it.s);
        if (ps0 < archS && it.s >= archS) {
          archFlash = 1; archItem = it;
          for (let i = 0; i < 8; i++) K.spawn(root, archP.x + K.R() * 0.3, archP.y + 0.4 + Math.random() * 1.0, archP.z + K.R() * 1.0, K.R() * 0.6, 0.6, K.R() * 0.6, Math.random() < 0.5 ? 0x9affc0 : 0xffffff, 0.6, 0.05, 0, true);
        }
        if (Math.abs(it.s - archS) < 1.1 && it.s < archS) scanning = it;
      });
      archFlash = Math.max(0, archFlash - dt * 0.6);
      if (archFlash > 0.05 && archItem) drawCI(archItem.label() + ' PASS', '#5aff90', '#06200e');
      else if (scanning) drawCI('SCAN ' + scanning.label(), Math.sin(t * 8) > 0 ? '#ffc040' : '#c08a20', '#1a1206');
      else drawCI('CI READY', '#3aa060');
      const flash = archFlash > 0.6;
      beamM.color.setHex(flash ? 0x5aff90 : 0x7af0d8);
      beamM.opacity = flash ? 0.35 + archFlash * 0.4 : scanning ? 0.25 + Math.sin(t * 30) * 0.1 : 0.08 + Math.sin(t * 2) * 0.04;
      beam.scale.z = flash ? 1 : 0.6 + Math.sin(t * 3) * 0.35;
      lasers.forEach((l, i) => { l.material.color.setHex(flash ? 0x7aff9a : 0x9affea); l.material.opacity = flash ? 0.95 : scanning ? 0.5 + Math.sin(t * 40 + i) * 0.3 : 0.18 + Math.sin(t * 3 + i * 1.3) * 0.1; });
      foot.position.x = flash ? 0 : Math.sin(t * (scanning ? 9 : 2)) * 0.12; footM.color.setHex(flash ? 0x5aff90 : 0x7af0d8); footM.opacity = flash ? 0.9 : scanning ? 0.6 : 0.25;
      ciLampM.emissive.setHex(flash ? 0x30ff70 : 0);
      ciLampB.material.emissive.setHex(scanning && !flash && Math.sin(t * 10) > 0 ? 0xffb020 : 0);
      slitM.color.setHex(scanning ? (Math.sin(t * 25) > 0 ? 0xb8fff0 : 0x5ae0c8) : 0x2cb89c);
      // merge semaphores: rework has priority at the tray
      const waitingOre = P.ore.items.find((it) => it.atEnd), waitingRw = P.rwIn.items.find((it) => it.atEnd);
      sema.forEach((s) => {
        const w = s.path === P.ore ? waitingOre : waitingRw;
        const next = s.path === P.rwIn ? !!waitingRw : !!waitingOre && !waitingRw;
        s.g1.emissive.setHex(w && next ? 0x30ff70 : 0); s.a1.emissive.setHex(w && !next ? (Math.sin(t * 6) > 0 ? 0xffa020 : 0x402000) : 0);
      });
      // aether pulses: fast to a WORKING machine (and they flare as they arrive), slow idle, amber stutter when blocked
      pulses.forEach((p) => {
        const s = p.riser ? (P[p.to].items.length ? 'WORKING' : 'IDLE') : stState(p.to);
        const sp = s === 'WORKING' ? 2.6 : s === 'BLOCKED' ? (Math.sin(t * 5 + p.u * 9) > 0 ? 0.9 : 0.05) : 0.7;
        p.u = (p.u + dt * sp / p.L) % 1;
        p.curve.getPointAt(p.u, v); p.m.position.copy(v);
        const arrive = s === 'WORKING' ? K.clamp01((p.u - 0.8) / 0.2) : 0;
        p.m.material.color.setHex(s === 'BLOCKED' ? 0xffb030 : arrive > 0.5 ? 0xffffff : 0xb8fff0);
        p.m.scale.setScalar((0.85 + Math.sin(t * 10 + p.u * 30) * 0.2) * (1 + arrive * 1.1));
      });
      for (const k in coreMats) { const br = branches[k]; const s = br.riser ? (P[br.to].items.length ? 'WORKING' : 'IDLE') : stState(br.to); coreMats[k].color.setHex(s === 'BLOCKED' ? (Math.sin(t * 6) > 0 ? 0x9a6a10 : 0x4a3008) : s === 'WORKING' ? 0x3ad0b0 : 0x248a74); }
      aethNodes.forEach((e, i) => e.material.color.setHex(Math.sin(t * 4 + i) > 0.6 ? 0x9affea : 0x5ae0c8));
      if (Math.random() < dt * 3) { const p = pulses[Math.floor(Math.random() * pulses.length)].m.position; K.spawn(root, p.x, p.y, p.z, K.R() * 1.4, Math.random() * 1.2, K.R() * 1.4, Math.random() < 0.5 ? 0x9affea : 0xffffff, 0.3, 0.04, 2, true); }
      // oil drips
      tDrip -= dt;
      if (tDrip <= 0 && dripPts.length) { tDrip = 0.28; const d = dripPts[Math.floor(Math.random() * dripPts.length)]; if (d[1] > 0.5) K.spawn(root, d[0] + K.R() * 0.3, d[1], d[2] + K.R() * 0.3, 0, -0.3, 0, 0x060506, 0.8, 0.045, 7); }
      if (Math.random() < dt * 1.5) { const x = -14 + Math.random() * 10.5; K.spawn(root, x, yH - 0.5, zH + K.R() * 0.6, 0, -0.4, 0, 0x070607, 1.6, 0.05, 6); }
    } };
  });
})();
