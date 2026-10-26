// BELTS (Black Iron line): chain-driven belts for ore / feed / pass / rework, the glass pneumatic tube,
// the two rework bucket-elevator towers + the 'bucket' carrier, the high rework bridge, the CI inspection
// arch, the merge plate at the assembler tray, and the teal aether conduit network.
// NOTES: all coordinates are root-local. Belts stop short of machine ports (machines own their trays).
// Belt texture scroll = path.speed * path.flow (one texture tile = 0.5 units), so items never slide.
(function () {
  'use strict';
  const C = {
    soot: 0x1a1512, iron: 0x3a322b, ironM: 0x2e2722, ironL: 0x5c5046, ironXL: 0x7a6c5e,
    brass: 0xb08236, brassD: 0x6e5022, brassL: 0xd8aa52, copper: 0x9a5030, copperD: 0x5e301a,
    rust: 0x8a3e1c, rustL: 0xa85a28, red: 0xb42a1a, redD: 0x6e1a10, hazard: 0xe0a018,
    verd: 0x3f8a72, aeth: 0x7af0d8, aethDim: 0x2cb89c, oil: 0x0a0a0e
  };
  let M = null;
  function mats(K) {
    if (M) return M;
    M = {
      soot: K.mat(C.soot), iron: K.mat(C.iron, { shine: 22, spec: 0x2a2a30 }), ironM: K.mat(C.ironM, { shine: 16, spec: 0x222228 }),
      ironL: K.mat(C.ironL, { shine: 28, spec: 0x3a3a40 }), ironXL: K.mat(C.ironXL, { shine: 30, spec: 0x44444a }),
      brass: K.mat(C.brass, { shine: 40, spec: 0x8a6a30 }), brassD: K.mat(C.brassD, { shine: 22, spec: 0x3a2a10 }), brassL: K.mat(C.brassL, { shine: 50, spec: 0xa08040 }),
      copper: K.mat(C.copper, { shine: 34, spec: 0x6a3a20 }), copperD: K.mat(C.copperD, { shine: 18 }),
      rust: K.mat(C.rust), rustL: K.mat(C.rustL), red: K.mat(C.red, { shine: 18, spec: 0x3a1a10 }), redD: K.mat(C.redD),
      hazard: K.mat(C.hazard), verd: K.mat(C.verd, { shine: 20 }),
      oil: K.mat(C.oil, { shine: 90, spec: 0x6a5a8a }), grime: K.mat(0x050403, { op: 0.45, depthWrite: false }),
      glass: K.mat(0xb8e8dc, { op: 0.26, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      aethCore: K.glow(C.aethDim), lamp: K.glow(0xffc070), white: K.glow(0xffffff)
    };
    return M;
  }

  // ---------- tiny 3x5 pixel font for signs ----------
  const FONT = {
    A: '010101111101101', C: '011100100100011', E: '111100110100111', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', K: '101101110101101', M: '101111111101101', O: '010101101101010', P: '110101110100100',
    R: '110101110101101', S: '011100010001110', T: '111010010010010', W: '101101111111101', V: '101101101101010',
    U: '101101101101111', B: '110101110101110', L: '100100100100111', N: '111101101101101', D: '110101101101110', F: '111100110100100',
    X: '101101010101101', Y: '101101010010010', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '!': '010010010000010',
    '>': '100010001010100', '<': '001010100010001', '^': '010101000000000', '-': '000000111000000', ' ': '000000000000000'
  };
  const WIDE = { W: '1000110001101011010101010', M: '1000111011101011000110001' };
  const cw = (ch) => (WIDE[ch] ? 6 : 4);
  function drawText(g, text, x, y, s, col) {
    g.fillStyle = col;
    for (const ch of text) {
      if (WIDE[ch]) { const f = WIDE[ch]; for (let i = 0; i < 25; i++) if (f[i] === '1') g.fillRect(x + (i % 5) * s, y + Math.floor(i / 5) * s, s, s); x += 6 * s; continue; }
      const f = FONT[ch] || FONT[' ']; for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s); x += 4 * s;
    }
  }
  function signTex(K, text, fg, bg, edge) {
    const w = ([...text].reduce((a, c) => a + cw(c), 0) + 3) * 2;
    return K.canvasTex(w, 18, (g) => {
      g.fillStyle = edge; g.fillRect(0, 0, w, 18); g.fillStyle = bg; g.fillRect(2, 2, w - 4, 14);
      drawText(g, text, 4, 4, 2, fg);
    });
  }

  // ---------- textures ----------
  function beltTex(K) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#18130f'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#4a3f35'; g.fillRect(0, 1, 16, 14);
      g.fillStyle = '#8a7862'; g.fillRect(1, 1, 3, 14); g.fillRect(9, 1, 3, 14);
      g.fillStyle = '#b8a084'; g.fillRect(1, 1, 3, 1); g.fillRect(9, 1, 3, 1);
      g.fillStyle = '#0c0a08'; g.fillRect(4, 1, 1, 14); g.fillRect(12, 1, 1, 14);
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
  function plateTex(K) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#3e352d'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#5e5246';
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
  const THREE = window.THREE;
  // strut between two points (box of section s)
  function strut(K, p, a, b, s, m) {
    const va = V(a), vb = V(b), len = va.distanceTo(vb);
    const o = K.box(s, len, s, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, p);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return o;
  }
  const onDeck = (x, z) => z <= 7.3 && z >= -7.3 && Math.abs(x) <= 18.3;

  // =====================================================================
  // BUCKET carrier for the rework lifts: an open iron cage-bucket with red rim and chain lugs
  // =====================================================================
  IRON.carrier('bucket', (K, item) => {
    mats(K);
    const g = new THREE.Group();
    const inner = K.group(g); inner.userData.bucket = true;
    K.box(0.66, 0.06, 0.62, M.ironL, 0, -0.05, 0, inner);
    K.box(0.7, 0.04, 0.66, M.soot, 0, -0.1, 0, inner);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 0.4, 0.05, M.iron, sx * 0.31, 0.15, sz * 0.29, inner);
    for (const sz of [-1, 1]) { K.box(0.66, 0.06, 0.05, M.red, 0, 0.33, sz * 0.29, inner); K.box(0.66, 0.04, 0.04, M.ironM, 0, 0.1, sz * 0.29, inner); }
    for (const sx of [-1, 1]) { K.box(0.05, 0.06, 0.62, M.red, sx * 0.31, 0.33, 0, inner); K.box(0.2, 0.08, 0.1, M.ironL, sx * 0.42, 0.2, 0, inner); }
    const tag = K.box(0.14, 0.1, 0.02, K.glow(0xff4a2a), 0, 0.2, 0.31, inner);
    return g;
  });

  IRON.belts((K, root, ctx) => {
    mats(K);
    const P = ctx.paths, I = ctx.I;
    const stat = K.group(root);            // everything static (baked at the end)
    const BTX = beltTex(K), HZ = hazardTex(K), CH = chainTex(K), PL = plateTex(K);
    const hazM = K.mat(0xffffff, { map: HZ });
    const plateM = K.mat(0xffffff, { map: PL.clone() }); plateM.map.needsUpdate = true; plateM.map.repeat.set(4, 4);
    const W = 0.76;
    const beltAnim = [];      // { path, tex }
    const gears = [];         // { g, path, s }
    const lightsets = {};     // path name -> [4 phase mats]
    const turntables = [];    // { g, path }
    const dripPts = [];       // [x,y,z]
    const nearSign = (yaw) => (Math.cos(yaw) >= -0.01 ? 1 : -1); // local z side that faces the camera (+root z)

    function phaseMats(name) {
      if (!lightsets[name]) lightsets[name] = [0, 1, 2, 3].map(() => K.glow(0x4a2208));
      return lightsets[name];
    }
    // drive: motor + meshing gears + chain guard, in a segment-aligned group at local x, on side `side`
    function drive(sg, path, lx, side, deckY) {
      const g = K.group(sg, lx, 0, side * (W / 2 + 0.42));
      const h = -deckY; // from deck up to belt level
      const twin = K.group(root, sg.position.x, sg.position.y, sg.position.z); twin.rotation.order = 'YZX'; twin.rotation.y = sg.rotation.y;
      K.box(0.62, h - 0.2, 0.5, M.ironM, 0, -h / 2 - 0.1 + 0.0, 0, g);
      K.box(0.72, 0.08, 0.6, M.rust, 0, -0.32, 0, g);
      for (let i = 0; i < 4; i++) K.box(0.64, 0.03, 0.52, M.ironL, 0, -h + 0.25 + i * 0.09, 0, g);
      // motor drum with fins
      const mot = K.cyl(0.2, 0.2, 0.5, M.iron, 10, -0.05, -h + 0.42, side * 0.12, g); mot.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) { const f = K.cyl(0.24, 0.24, 0.03, M.ironL, 10, -0.05, -h + 0.42, side * (-0.08 + i * 0.09), g); f.rotation.x = Math.PI / 2; }
      K.box(0.16, 0.1, 0.16, M.brass, -0.05, -h + 0.68, side * 0.12, g);
      // chain guard housing (on the outside)
      K.box(0.86, 0.5, 0.06, M.hazard, 0.05, -0.15, side * 0.3, g);
      K.box(0.86, 0.06, 0.22, M.ironL, 0.05, 0.1, side * 0.22, g);
      // spinning gears (unbaked): big on the belt shaft, small on the motor
      const mv = K.group(twin, lx, 0, side * (W / 2 + 0.42 + 0.34));
      const big = gear(K, mv, 0.32, 0.08, 14, M.brass, 0.0, -0.12, 0); big.rotation.x = Math.PI / 2;
      const small = gear(K, mv, 0.16, 0.08, 8, M.brassL, -0.05, -h + 0.42 + 0.0, 0); small.rotation.x = Math.PI / 2;
      small.position.y = -0.12 - 0.32 - 0.16 - 0.02;
      gears.push({ g: big, path, s: 1 }, { g: small, path, s: -2 });
      K.box(0.08, 0.3, 0.04, M.soot, -0.2, -0.36, 0, mv); K.box(0.08, 0.3, 0.04, M.soot, 0.2, -0.36, 0, mv);
      dripPts.push([sg.position.x, 0.12, sg.position.z]);
      return g;
    }

    // ----------------------------------------------------------------- BELT BUILDER
    function buildBelt(path, o) {
      o = o || {};
      const segs = path.segs, nS = segs.length;
      const lm = phaseMats(path.name);
      let lightN = 0;
      segs.forEach((sg, si) => {
        const s0 = si === 0 ? (o.trimStart || 0) : 0;
        const s1 = sg.len - (si === nS - 1 ? (o.trimEnd || 0) : 0);
        const len = s1 - s0; if (len <= 0.05) return;
        const y0 = sg.a.y;
        const deckY = 0.1 - y0;
        const g = K.group(stat, sg.a.x, sg.a.y, sg.a.z); g.rotation.order = 'YZX'; g.rotation.y = sg.yaw;
        const ns = nearSign(sg.yaw);
        const cx = (s0 + s1) / 2;
        // belt top: scrolling cleated texture
        const tex = BTX.clone(); tex.needsUpdate = true; tex.repeat.set(len * 2, 1);
        const top = K.mat(0xffffff, { map: tex, shine: 26, spec: 0x2a2620 });
        K.box(len, 0.1, W, [M.soot, M.soot, top, M.soot, M.soot, M.soot], cx, -0.05, 0, g);
        beltAnim.push({ path, tex });
        // return belt + rollers
        K.box(len, 0.04, W * 0.86, M.soot, cx, -0.3, 0, g);
        for (let x = s0 + 0.2; x < s1; x += 0.42) { const r = K.cyl(0.07, 0.07, W + 0.04, M.ironXL, 6, x, -0.16, 0, g); r.rotation.x = Math.PI / 2; }
        // side channels, lips, bolts
        for (const s of [-1, 1]) {
          K.box(len + 0.1, 0.28, 0.08, M.iron, cx, -0.12, s * (W / 2 + 0.05), g);
          K.box(len + 0.1, 0.05, 0.14, s === ns ? M.rustL : M.rust, cx, 0.04, s * (W / 2 + 0.07), g);
          K.box(len + 0.1, 0.04, 0.1, M.ironM, cx, -0.27, s * (W / 2 + 0.06), g);
          for (let x = s0 + 0.2; x < s1; x += 0.4) K.box(0.06, 0.06, 0.03, M.brassL, x, -0.1, s * (W / 2 + 0.1), g);
        }
        // running lights on the camera side (4-phase chase)
        for (let x = s0 + 0.45; x < s1 - 0.2; x += 0.95) { K.box(0.12, 0.07, 0.05, lm[lightN % 4], x, -0.02, ns * (W / 2 + 0.11), g); lightN++; }
        // grime streaks on the side
        for (let x = s0 + 0.3; x < s1; x += 1.3 + K.rnd()) { const d = K.box(0.25 + K.rnd() * 0.4, 0.2, 0.01, M.grime, x, -0.15, ns * (W / 2 + 0.096), g); d.castShadow = false; }
        // legs (only where there's deck below, and not for the high line which gets bents)
        if (!o.noLegs && y0 < 3) {
          const n = Math.max(1, Math.round(len / 1.5));
          for (let i = 0; i <= n; i++) {
            const lx = s0 + (len * i) / n; const wx = sg.a.x + Math.cos(sg.yaw) * lx, wz = sg.a.z - Math.sin(sg.yaw) * lx;
            if (!onDeck(wx, wz)) continue;
            const h = -deckY - 0.34;
            for (const s of [-1, 1]) { K.box(0.1, h, 0.1, M.iron, lx, -0.34 - h / 2, s * (W / 2 + 0.02), g); K.box(0.22, 0.06, 0.22, M.ironM, lx, deckY + 0.03, s * (W / 2 + 0.02), g); }
            K.box(0.08, 0.08, W + 0.12, M.ironM, lx, -0.34 - h * 0.55, 0, g);
          }
          // drip tray under the middle of long segments
          if (len > 2.2) {
            K.box(Math.min(1.4, len * 0.4), 0.05, W * 0.9, M.ironM, cx, deckY + 0.04, 0, g);
            for (const s of [-1, 1]) K.box(Math.min(1.4, len * 0.4), 0.08, 0.03, M.ironL, cx, deckY + 0.08, s * W * 0.45, g);
            const pd = K.sph(1, M.oil, cx, deckY + 0.075, 0, g, 10, 4); pd.scale.set(Math.min(0.6, len * 0.17), 0.012, W * 0.36); pd.castShadow = false;
            for (let k = 0; k < 3; k++) dripPts.push([sg.a.x + Math.cos(sg.yaw) * (cx + (k - 1) * 0.4), y0 - 0.32, sg.a.z - Math.sin(sg.yaw) * (cx + (k - 1) * 0.4)]);
          }
        }
        // end caps: head drum + hazard plate at the trimmed ends
        const cap = (x, dir) => {
          const d = K.cyl(0.12, 0.12, W + 0.1, M.ironL, 10, x, -0.08, 0, g); d.rotation.x = Math.PI / 2;
          K.box(0.04, 0.24, W + 0.2, hazM, x + dir * 0.13, -0.12, 0, g);
          for (const s of [-1, 1]) K.box(0.16, 0.16, 0.05, M.brassD, x, -0.08, s * (W / 2 + 0.12), g);
        };
        if (si === 0) cap(s0, -1);
        if (si === nS - 1) cap(s1, 1);
        if (o.drive && o.drive[0] === si) drive(g, path, o.drive[1] !== undefined ? o.drive[1] : s0 + 0.6, -ns, deckY);
        if (o.rail) {
          // railings for elevated runs
          for (const s of [-1, 1]) {
            for (let x = s0 + 0.1; x <= s1; x += 0.8) K.box(0.05, 0.55, 0.05, M.red, x, 0.3, s * (W / 2 + 0.2), g);
            K.box(len, 0.05, 0.05, M.red, cx, 0.57, s * (W / 2 + 0.2), g);
            K.box(len, 0.04, 0.04, M.redD, cx, 0.32, s * (W / 2 + 0.2), g);
            K.box(len, 0.16, 0.03, hazM, cx, -0.34, s * (W / 2 + 0.11), g);
          }
          K.box(len, 0.06, W + 0.5, PL ? plateM : M.ironM, cx, -0.44, 0, g);
        }
      });
      // corner turntables at interior vertices
      for (let i = 1; i < path.points.length - 1; i++) {
        const v = path.points[i];
        const base = K.group(stat, v[0], v[1], v[2]);
        K.cyl(0.6, 0.62, 0.14, M.ironL, 12, 0, -0.08, 0, base);
        K.cyl(0.66, 0.66, 0.05, M.brassD, 12, 0, -0.16, 0, base);
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; K.box(0.06, 0.06, 0.06, M.brassL, Math.cos(a) * 0.62, -0.12, Math.sin(a) * 0.62, base); }
        if (v[1] < 3) { const h = v[1] - 0.25; K.cyl(0.14, 0.2, h, M.iron, 8, 0, -0.2 - h / 2 + 0.05, 0, base); K.cyl(0.3, 0.34, 0.06, M.ironM, 8, 0, 0.13 - v[1], 0, base); }
        const spin = K.group(root, v[0], v[1] + 0.005, v[2]);
        for (let k = 0; k < 6; k++) { const r = K.box(0.9, 0.035, 0.07, M.ironXL, 0, 0, 0, spin); r.rotation.y = k * Math.PI / 6; }
        K.cyl(0.1, 0.1, 0.05, M.brass, 8, 0, 0.01, 0, spin);
        K.bake(spin);
        turntables.push({ g: spin, path });
      }
    }

    // ----------------------------------------------------------------- the belts
    buildBelt(P.ore, { trimStart: 0.45, trimEnd: 0.5, drive: [1, 0.7] });
    buildBelt(P.feed, { trimStart: 0, trimEnd: 0.5, drive: [0, 0.5] });
    buildBelt(P.pass, { trimStart: 0.5, trimEnd: 0.5, drive: [1, 1.4] });
    buildBelt(P.rw1, { trimStart: 0.5, trimEnd: 0.15 });
    buildBelt(P.rwIn, { trimStart: 0.35, trimEnd: 0.5, drive: [0, 0.9] });
    buildBelt(P.rwHigh, { trimStart: 0.35, trimEnd: 0.35, noLegs: true, rail: true });

    // ----------------------------------------------------------------- HIGH LINE: bents + the bridge truss
    const zH = P.rwHigh.points[0][2], yH = P.rwHigh.points[0][1];
    function bent(x) {
      const h = yH - 0.5;
      for (const dz of [-0.62, 0.62]) {
        K.box(0.16, h, 0.16, M.red, x, 0.1 + h / 2, zH + dz, stat);
        K.box(0.32, 0.08, 0.32, M.ironM, x, 0.14, zH + dz, stat);
        for (const y of [1.5, 3.2, 4.9]) K.box(0.22, 0.08, 0.22, M.brassD, x, y, zH + dz, stat);
      }
      // X bracing in the bent plane
      for (let y = 0.4; y < h - 0.6; y += 1.7) {
        strut(K, stat, [x, y, zH - 0.62], [x, y + 1.7, zH + 0.62], 0.05, M.redD);
        strut(K, stat, [x, y, zH + 0.62], [x, y + 1.7, zH - 0.62], 0.05, M.redD);
        K.box(0.06, 0.06, 1.3, M.redD, x, y, zH, stat);
      }
      K.box(0.2, 0.18, 1.6, M.red, x, yH - 0.48, zH, stat);
      K.box(0.22, 0.04, 1.62, hazM, x, yH - 0.38, zH, stat);
    }
    [-5.3, -6.7, -7.9, -12.5, -13.6].forEach(bent);
    // the bridge: a red Pratt through-truss carrying the rework line over the assembler and across the tube
    const bx0 = -12.5, bx1 = -7.9;
    for (const dz of [-0.66, 0.66]) {
      const z = zH + dz;
      K.box(bx1 - bx0, 0.14, 0.12, M.red, (bx0 + bx1) / 2, yH - 0.42, z, stat);
      K.box(bx1 - bx0 - 0.5, 0.14, 0.12, M.red, (bx0 + bx1) / 2, yH + 0.75, z, stat);
      const n = 6, step = (bx1 - bx0) / n;
      for (let i = 0; i <= n; i++) {
        const x = bx0 + i * step;
        if (i > 0 && i < n) K.box(0.09, 1.15, 0.09, M.red, x, yH + 0.17, z, stat);
        if (i < n / 2) strut(K, stat, [x, yH - 0.42, z], [x + step, yH + 0.75, z], 0.07, M.redD);
        else if (i < n) strut(K, stat, [x, yH + 0.75, z], [x + step, yH - 0.42, z], 0.07, M.redD);
        for (let r = 0; r < 2; r++) K.box(0.05, 0.05, 0.05, M.brassL, x, yH - 0.42 + r * 1.17, z + Math.sign(dz) * 0.07, stat);
      }
      strut(K, stat, [bx0, yH - 0.42, z], [bx0 + 0.25, yH + 0.75, z], 0.1, M.red);
      strut(K, stat, [bx1, yH - 0.42, z], [bx1 - 0.25, yH + 0.75, z], 0.1, M.red);
    }
    for (let x = bx0 + 0.6; x < bx1; x += 0.77) K.box(0.06, 0.06, 1.38, M.redD, x, yH + 0.75, zH, stat);
    // portal signs
    const rwSign = K.mat(0xffffff, { map: signTex(K, 'REWORK', '#ffe0c8', '#8a1a10', '#16100c'), e: 0x3a0804 });
    for (const x of [bx0 + 0.1, bx1 - 0.1]) { K.box(0.06, 0.42, 1.3, M.redD, x, yH + 1.02, zH, stat); const sg = K.box(1.3, 0.32, 0.04, rwSign, x, yH + 1.02, zH + 0.66, stat); sg.rotation.y = 0; }
    { const s2 = K.box(1.6, 0.36, 0.04, rwSign, -5.9, yH - 0.75, zH + 0.66, stat); }
    // brand plate hung under the bridge (in-world text says SHIPTORIO, per Justin)
    const brandM = K.mat(0xffffff, { map: signTex(K, 'SHIPTORIO', '#ffd890', '#2a1c12', '#b08236'), e: 0x1a1008 });
    { const bxm = (bx0 + bx1) / 2; K.box(2.9, 0.5, 0.05, brandM, bxm, yH - 0.82, zH + 0.74, stat); for (const dx of [-1.2, 1.2]) K.box(0.04, 0.32, 0.04, M.ironL, bxm + dx, yH - 0.48, zH + 0.72, stat); }
    // tube hangers from the bridge (the tube's vertical rise sits just in front of the bridge)
    const TP = P.tube.points;
    const tubeNear = (x, y) => { let best = TP[0], bd = 1e9; TP.forEach((p) => { const d = Math.abs(p[0] - x) + (y !== undefined ? Math.abs(p[1] - y) * 0.5 : 0); if (d < bd) { bd = d; best = p; } }); return best; };
    {
      const a = tubeNear(-9.2); strut(K, stat, [a[0], yH - 0.42, zH + 0.66], [a[0], a[1] + 0.26, a[2]], 0.05, M.ironL);
      const ring = K.torus(0.29, 0.05, M.brassD, 4, 12, a[0], a[1], a[2], stat); ring.rotation.y = Math.PI / 2;
    }

    // ----------------------------------------------------------------- REWORK BUCKET-ELEVATOR TOWERS
    const chainMats = [];
    function tower(x, z, dirUp, label, open) {
      const top = yH + 0.7, baseY = 0.1;
      const tg = K.group(stat, x, 0, z);
      const hw = 0.52;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const y0 = open && open[0] === sx && open[1] === sz ? 1.75 : baseY;
        K.box(0.14, top - y0, 0.14, M.red, sx * hw, (top + y0) / 2, sz * hw, tg);
        if (y0 === baseY) K.box(0.3, 0.08, 0.3, M.ironM, sx * hw, 0.14, sz * hw, tg);
        else { strut(K, tg, [sx * hw, 1.8, sz * hw], [sx * hw, 2.6, -sz * hw * 0.2], 0.08, M.red); strut(K, tg, [sx * hw, 1.8, sz * hw], [-sx * hw * 0.2, 2.6, sz * hw], 0.08, M.red); K.box(0.2, 0.12, 0.2, M.hazard, sx * hw, 1.72, sz * hw, tg); }
      }
      for (let y = 0.6; y < yH - 1.0; y += 1.25) {
        for (const sz of [-1, 1]) { K.box(hw * 2, 0.07, 0.07, M.redD, 0, y, sz * hw, tg); }
        for (const sx of [-1, 1]) { K.box(0.07, 0.07, hw * 2, M.redD, sx * hw, y, 0, tg); }
        // X braces on the back and sides (front stays open so you can see the buckets ride)
        strut(K, tg, [-hw, y, -hw], [hw, y + 1.25, -hw], 0.04, M.redD); strut(K, tg, [hw, y, -hw], [-hw, y + 1.25, -hw], 0.04, M.redD);
        for (const sx of [-1, 1]) { strut(K, tg, [sx * hw, y, -hw], [sx * hw, y + 1.25, hw], 0.04, M.redD); }
      }
      // guide rails + chains on the left/right of the bucket path
      const chM = K.mat(0xffffff, { map: (() => { const t = CH.clone(); t.needsUpdate = true; t.repeat.set(1, (top - 0.4) * 3); return t; })() });
      chainMats.push({ m: chM, dir: dirUp, path: dirUp > 0 ? P.rwUp : P.rwDown });
      for (const sx of [-1, 1]) {
        K.box(0.06, top - 0.5, 0.12, M.ironL, sx * 0.4, (top + 0.3) / 2, -0.12, tg);
        K.box(0.07, top - 0.5, 0.07, chM, sx * 0.44, (top + 0.3) / 2, 0.02, tg);
      }
      // boot (bottom housing) and head frame
      K.box(1.2, 0.5, 1.2, M.ironM, 0, 0.35, -0.0, tg); K.box(1.24, 0.06, 1.24, M.rust, 0, 0.62, 0, tg);
      K.box(1.18, 0.14, 0.04, hazM, 0, 0.45, 0.61, tg);
      K.box(1.3, 0.12, 1.3, M.ironM, 0, top, 0, tg);
      K.box(1.3, 0.5, 0.12, M.red, 0, top + 0.3, -0.6, tg);
      // top railing + catwalk
      K.box(1.7, 0.06, 1.7, plateM, 0, top + 0.06, 0, tg);
      for (const s of [-1, 1]) { K.box(1.7, 0.05, 0.05, M.red, 0, top + 0.6, s * 0.85, tg); K.box(0.05, 0.05, 1.7, M.red, s * 0.85, top + 0.6, 0, tg); for (const k of [-0.85, 0, 0.85]) { K.box(0.05, 0.55, 0.05, M.red, s * 0.85, top + 0.33, k, tg); K.box(0.05, 0.55, 0.05, M.red, k, top + 0.33, s * 0.85, tg); } }
      // motor on top
      K.box(0.5, 0.36, 0.4, M.iron, 0, top + 0.28, -0.35, tg); for (let i = 0; i < 4; i++) K.box(0.52, 0.03, 0.42, M.ironL, 0, top + 0.16 + i * 0.07, -0.35, tg);
      // sign
      const sgn = K.box(1.04, 0.24, 0.04, rwSign, 0, 3.3, hw + 0.05, tg);
      const arrowM = K.mat(0xffffff, { map: signTex(K, dirUp > 0 ? '^' : 'V', '#ffd8a0', '#8a1a10', '#16100c'), e: 0x3a0804 });
      K.box(0.26, 0.24, 0.04, arrowM, 0.42 * 0, 3.0, hw + 0.05, tg).position.y = 2.95;
      // head sprockets (spin)
      const mv = K.group(root, x, top - 0.35, z);
      const sp = [];
      for (const sx of [-1, 1]) { const gg = gear(K, mv, 0.24, 0.08, 10, M.brassL, sx * 0.44, 0, 0.02); gg.rotation.z = Math.PI / 2; gg.rotation.order = 'ZXY'; sp.push(gg); }
      const bot = K.group(root, x, 0.75, z);
      for (const sx of [-1, 1]) { const gg = gear(K, bot, 0.2, 0.08, 9, M.brass, sx * 0.44, 0, 0.02); gg.rotation.z = Math.PI / 2; gg.rotation.order = 'ZXY'; sp.push(gg); }
      sp.forEach((gg) => gears.push({ g: gg, path: dirUp > 0 ? P.rwUp : P.rwDown, s: dirUp * 1.4, axis: 'y' }));
      // warning beacon on the head frame
      const bc = K.sph(0.11, K.mat(0x401010, { e: 0 }), 0.55, top + 0.75, 0.55, root); bc.position.set(x + 0.55, top + 0.75, z + 0.55);
      K.cyl(0.07, 0.09, 0.12, M.ironM, 8, x + 0.55, top + 0.63, z + 0.55, stat);
      return { bc, x, z, top };
    }
    const upT = tower(P.rwUp.points[0][0], P.rwUp.points[0][2], 1, 'REWORK', [1, 1]);
    const dnT = tower(P.rwDown.points[0][0], P.rwDown.points[0][2], -1, 'REWORK');

    // ----------------------------------------------------------------- PNEUMATIC TUBE
    const tubeG = K.group(stat);
    const tpts = TP.filter((p, i) => i === 0 || i === TP.length - 1 || i % 1 === 0);
    const tStart = TP.findIndex((p) => p[1] > 4.75);
    const glassPts = TP.slice(0);
    const glass = K.tube(glassPts, 0.25, M.glass, tubeG, 160, 12); glass.castShadow = false; glass.userData.noBake = true;
    const curve = new THREE.CatmullRomCurve3(glassPts.map(V));
    const tubeLen = curve.getLength();
    for (let u = 0.02; u < 1; u += 0.62 / tubeLen) {
      const p = curve.getPointAt(u), tn = curve.getTangentAt(u);
      const big = Math.round(u * tubeLen / 0.62) % 4 === 0;
      const c = K.torus(big ? 0.31 : 0.28, big ? 0.06 : 0.04, big ? M.brass : M.brassD, 5, 14, p.x, p.y, p.z, tubeG);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tn);
      if (big) for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; const b = K.box(0.06, 0.06, 0.12, M.brassL, 0, 0, 0, tubeG); const off = new THREE.Vector3(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0).applyQuaternion(c.quaternion); b.position.copy(p).add(off); b.quaternion.copy(c.quaternion); }
    }
    // thin copper vacuum line riding alongside the glass
    K.tube(glassPts.map((p) => [p[0] + 0.0, p[1] + 0.32, p[2] + 0.0]), 0.04, M.copper, tubeG, 120, 5);
    // inner aether glow streak (brightens when an item rides the tube)
    const streakM = K.glow(0x7af0d8, 0.0, true);
    const streak = K.tube(glassPts, 0.1, streakM, root, 120, 6); streak.castShadow = false;
    // support post with saddle clamp where the tube swings out over the deck
    {
      const a = tubeNear(-7.05);
      const px = a[0], pz = a[2] + 0.35, py = a[1] - 0.28;
      K.box(0.2, py - 0.1, 0.2, M.iron, px, (py + 0.1) / 2, pz, stat); K.box(0.4, 0.08, 0.4, M.ironM, px, 0.14, pz, stat);
      strut(K, stat, [px, py - 1.2, pz], [px - 0.6, 0.12, pz + 0.3], 0.07, M.iron);
      strut(K, stat, [px, py, pz], [a[0], a[1] - 0.25, a[2]], 0.08, M.ironL);
      K.box(0.5, 0.1, 0.5, M.brassD, a[0], a[1] - 0.3, a[2], stat);
      for (const y of [1.4, 2.8, 4.2]) K.box(0.26, 0.06, 0.26, M.brassD, px, y, pz, stat);
    }
    // VACUUM BLOWER housing where the tube leaves the dome (snail-shell volute + motor + spinning impeller)
    const bl = TP[Math.min(TP.length - 1, Math.max(0, tStart))];
    const blower = K.group(stat, bl[0] + 0.78, bl[1] + 0.05, bl[2]);
    K.box(0.5, 0.26, 0.26, K.mat(0x7a3c20, { shine: 30 }), bl[0] + 0.3, bl[1] + 0.05, bl[2], stat); K.torus(0.27, 0.05, M.brass, 4, 12, bl[0] + 0.22, bl[1] + 0.05, bl[2], stat).rotation.y = Math.PI / 2;
    const volM = K.mat(0x7a3c20, { shine: 30, spec: 0x6a3a20 });
    const vol = K.cyl(0.5, 0.5, 0.36, volM, 16, 0.0, 0, 0.0, blower); vol.rotation.x = Math.PI / 2;
    K.torus(0.5, 0.05, M.brass, 4, 18, 0, 0, 0.19, blower); K.torus(0.5, 0.05, M.brass, 4, 18, 0, 0, -0.19, blower);
    K.box(0.42, 0.34, 0.36, volM, 0.4, 0.22, 0, blower);
    K.box(0.05, 0.4, 0.4, M.brassD, 0.62, 0.22, 0, blower);
    K.cyl(0.34, 0.34, 0.04, M.soot, 14, 0, 0, 0.2, blower).rotation.x = Math.PI / 2;
    const mot = K.cyl(0.2, 0.2, 0.42, M.iron, 10, 0, 0, -0.42, blower); mot.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) { const f = K.cyl(0.24, 0.24, 0.03, M.ironL, 10, 0, 0, -0.28 - i * 0.09, blower); f.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 6; i++) K.box(0.05, 0.05, 0.05, M.brassL, Math.cos(i) * 0.45, Math.sin(i) * 0.45, 0.2, blower);
    const blowLamp = K.box(0.12, 0.12, 0.04, K.glow(0x2a6a5a), 0.4, 0.42, 0.19, root);
    blowLamp.position.set(bl[0] + 1.18, bl[1] + 0.47, bl[2] + 0.19);
    const imp = K.group(root, bl[0] + 0.78, bl[1] + 0.05, bl[2] + 0.23);
    for (let k = 0; k < 6; k++) { const b = K.box(0.06, 0.6, 0.03, M.brassL, 0, 0, 0, imp); b.rotation.z = k * Math.PI / 6; }
    K.bake(imp);
    // DROP NOZZLE above the feed belt (flared brass mouth with a flap) + gallows frame
    const te = TP[TP.length - 1];
    const noz = K.group(stat, te[0], te[1], te[2]);
    K.lathe([[0.27, 0.15], [0.3, 0.0], [0.4, -0.12], [0.42, -0.16]], M.brass, 14, 0, 0, 0, noz);
    K.torus(0.42, 0.04, M.brassD, 4, 16, 0, -0.16, 0, noz).rotation.x = Math.PI / 2;
    K.cyl(0.3, 0.3, 0.12, M.brassD, 14, 0, 0.28, 0, noz);
    const flapPiv = K.group(root, te[0] + 0.42, te[1] - 0.16, te[2]);
    const flap = K.box(0.06, 0.04, 0.7, M.copper, -0.42, 0, 0, flapPiv);
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
    const tubeSign = K.mat(0xffffff, { map: signTex(K, 'TUBE', '#c8fff0', '#16463c', '#0c0a08'), e: 0x062018 });
    K.box(0.66, 0.26, 0.04, tubeSign, te[0] - 0.85, 2.7, te[2] + 0.74, stat); K.box(0.06, 0.4, 0.06, M.iron, te[0] - 0.85, 2.95, te[2] + 0.72, stat);

    // ----------------------------------------------------------------- CI INSPECTION ARCH over the ship belt
    const ps = P.pass.segs[1];
    const archS = ps.L0 + ps.len * 0.5;
    const archP = new THREE.Vector3(); P.pass.at(archS, archP);
    const arch = K.group(stat, archP.x, archP.y, archP.z); arch.rotation.y = ps.yaw;
    const aH = 1.55;
    for (const s of [-1, 1]) {
      K.box(0.26, aH + 0.9, 0.26, M.ironM, 0, -0.9 + (aH + 0.9) / 2, s * 0.72, arch);
      K.box(0.4, 0.1, 0.4, M.ironM, 0, -0.85, s * 0.72, arch);
      K.box(0.3, 0.2, 0.3, M.brassD, 0, aH - 0.05, s * 0.72, arch);
      for (const y of [-0.4, 0.3, 1.0]) K.box(0.28, 0.06, 0.28, M.brass, 0, y, s * 0.72, arch);
      K.box(0.02, aH + 0.6, 0.1, hazM, 0.14, -0.6 + (aH + 0.6) / 2, s * 0.72, arch);
    }
    K.box(0.42, 0.34, 1.8, M.iron, 0, aH + 0.2, 0, arch);
    K.box(0.46, 0.05, 1.84, M.brass, 0, aH + 0.38, 0, arch);
    const ciSign = K.mat(0xffffff, { map: signTex(K, 'CI', '#d8ffe8', '#14462a', '#0c0a08'), e: 0x062a12 });
    const ciS = K.box(0.04, 0.3, 0.5, ciSign, 0.22, aH + 0.2, -0.45, arch);
    K.box(0.12, 0.5, 0.08, M.iron, 0, aH + 0.55, 0, arch);
    const ciBoard = K.box(1.0, 0.42, 0.05, ciSign, 0, aH + 0.86, 0.0, arch); ciBoard.rotation.y = -ps.yaw;
    K.box(1.06, 0.06, 0.1, M.brass, 0, aH + 1.1, 0, arch).rotation.y = -ps.yaw;
    // scanner head + emitter slit (moving parts live in root, positioned from the arch frame)
    const archMv = K.group(root, archP.x, archP.y, archP.z); archMv.rotation.y = ps.yaw;
    const beamM = K.glow(0x7af0d8, 0.35, true);
    const beam = K.box(0.05, aH - 0.05, 1.2, beamM, 0, aH / 2 - 0.02, 0, archMv); beam.castShadow = false;
    const lasers = []; for (const z of [-0.36, -0.12, 0.12, 0.36]) { const l = K.box(0.03, aH - 0.05, 0.03, K.glow(0x9affea, 0.8, true), 0, aH / 2 - 0.02, z, archMv); l.castShadow = false; lasers.push(l); }
    const footM = K.glow(0x7af0d8, 0.4, true); const foot = K.box(0.34, 0.012, W * 0.95, footM, 0, 0.012, 0, archMv); foot.castShadow = false;
    const slitM = K.glow(0x2cb89c);
    K.box(0.12, 0.05, 1.3, slitM, 0, aH + 0.02, 0, archMv);
    const ciLampM = K.mat(0x103a20, { e: 0 });
    const ciLamp = K.sph(0.12, ciLampM, 0, aH + 0.52, 0.55, archMv, 8, 6);
    const ciLampB = K.sph(0.12, K.mat(0x3a2a08, { e: 0 }), 0, aH + 0.52, -0.55, archMv, 8, 6);
    // little 4-bar display on the arch face that counts recent passes
    const bars = []; for (let i = 0; i < 4; i++) bars.push(K.box(0.03, 0.16, 0.08, K.mat(0x0a2010, { e: 0 }), 0.23, aH + 0.2, 0.05 + i * 0.12, archMv));
    let archFlash = 0, archCount = 0; const prevS = new WeakMap();

    // ----------------------------------------------------------------- MERGE PLATE at the assembler tray
    const aIn = ctx.PORT_ROOT['assembler.in'];
    const mp = K.group(stat, aIn[0] - 1.05, 0.1, aIn[2] + 0.15);
    { const pl = K.box(2.4, 0.04, 2.4, plateM, 0, 0.02, 0, mp); pl.rotation.y = Math.PI / 4; }
    for (let k = 0; k < 3; k++) { const ch = K.box(0.36, 0.02, 0.12, M.hazard, 0.35 - k * 0.42, 0.05, -0.35 + k * 0.42, mp); ch.rotation.y = Math.PI / 4; }
    for (let k = 0; k < 3; k++) { const ch = K.box(0.36, 0.02, 0.12, M.hazard, 0.35 - k * 0.42, 0.05, 0.75 - k * 0.42 - 0.4, mp); ch.rotation.y = -Math.PI / 4; ch.position.set(-0.2 - k * 0.42 + 0.6, 0.05, 0.7 - k * 0.42 + 0.1); }
    // semaphore posts at the two belt ends: green = this belt goes next, amber = waiting
    const sema = [];
    function semaphore(path, side) {
      const sg = path.segs[path.segs.length - 1];
      const end = new THREE.Vector3(); path.at(path.L - 0.9, end);
      const nx = -Math.sin(sg.yaw) * 0, perp = [Math.sin(sg.yaw), Math.cos(sg.yaw)];
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

    // ----------------------------------------------------------------- AETHER CONDUITS
    const SRC = [0, 0.35, -2.9];
    const yC = 0.17, zB = -3.95;
    const branches = [
      { to: 'assembler', pts: [SRC, [0, yC, -3.3], [0, yC, zB], [-3.0, yC, zB], [-6.6, yC, zB], [-7.4, yC, -3.15], [-7.4, 0.35, -2.4]] },
      { to: 'launch', pts: [[0, yC, zB], [3.0, yC, zB], [6.4, yC, zB], [7.2, yC, -3.1], [7.2, 0.35, -2.3]] },
      { to: 'assembler', pts: [[-6.6, yC, zB], [-10.0, yC, zB - 0.05], [-13.8, yC, zB], [dnT.x, yC, zB], [dnT.x, yC, dnT.z - 0.68], [dnT.x, 2.0, dnT.z - 0.68], [dnT.x, dnT.top + 0.15, dnT.z - 0.68], [dnT.x, dnT.top + 0.3, dnT.z - 0.4]], riser: true },
      { to: 'splitter', pts: [[-3.0, yC, zB], [upT.x, yC, zB], [upT.x, yC, upT.z - 0.68], [upT.x, 2.0, upT.z - 0.68], [upT.x, upT.top + 0.15, upT.z - 0.68], [upT.x, upT.top + 0.3, upT.z - 0.4]], riser: true },
      { to: 'launch', pts: [[5.2, yC, zB], [5.2, yC, -1.0], [5.2, yC, archP.z - 0.95], [5.2, 0.55, archP.z - 0.8]] }
    ];
    const pulses = [], aethNodes = [];
    const coreMats = {};
    const aethG = K.group(stat);
    branches.forEach((br, bi) => {
      const pts = br.pts;
      // straight-ish polyline conduit: build per segment (crisp right-angle runs read better than a spline)
      const curve = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(V(pts[i]), V(pts[i + 1])));
      const L = curve.getLength();
      coreMats[bi] = K.glow(C.aethDim);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = V(pts[i]), b = V(pts[i + 1]), len = a.distanceTo(b); if (len < 0.01) continue;
        const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const core = K.cyl(0.085, 0.085, len + 0.05, coreMats[bi], 8, mid.x, mid.y, mid.z, aethG); core.quaternion.copy(q); core.castShadow = false;
        const sheath = K.cyl(0.11, 0.11, len - 0.1, M.glass, 8, mid.x, mid.y, mid.z, aethG); sheath.quaternion.copy(q); sheath.castShadow = false;
        // brass collars + copper coil windings along the run
        for (let d = 0.35; d < len - 0.2; d += 0.7) {
          const p = a.clone().addScaledVector(dir, d);
          const wind = Math.round(d / 0.7) % 3 === 1;
          if (wind) { for (let k = -2; k <= 2; k++) { const c = K.torus(0.13, 0.025, M.copper, 4, 10, 0, 0, 0, aethG); c.position.copy(p).addScaledVector(dir, k * 0.055); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); } }
          else { const c = K.torus(0.13, 0.04, M.brass, 4, 10, 0, 0, 0, aethG); c.position.copy(p); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); }
        }
        // floor saddles
        if (a.y < 0.5 && b.y < 0.5) for (let d = 0.6; d < len - 0.3; d += 1.4) { const p = a.clone().addScaledVector(dir, d); K.box(0.2, 0.1, 0.2, M.ironM, p.x, 0.12, p.z, aethG); }
        // elbow knuckles
        if (i > 0) { K.sph(0.14, M.brassD, a.x, a.y, a.z, aethG, 8, 6); }
      }
      const n = Math.max(2, Math.round(L / 1.6));
      for (let i = 0; i < n; i++) { const m = K.sph(0.11, K.glow(0xb8fff0, 0.95, true), 0, 0, 0, root, 6, 4); m.castShadow = false; pulses.push({ m, curve, u: i / n, L, to: br.to, bi }); }
    });
    // junction box behind the splitter, valve wheels, small junction boxes at branch tees
    function jbox(x, z, big) {
      const s = big ? 1 : 0.7;
      K.box(0.6 * s, 0.5 * s, 0.5 * s, M.ironM, x, 0.1 + 0.25 * s, z, aethG);
      K.box(0.66 * s, 0.06, 0.56 * s, M.brass, x, 0.1 + 0.5 * s, z, aethG);
      for (const sx of [-1, 1]) K.box(0.06, 0.06, 0.06, M.brassL, x + sx * 0.25 * s, 0.1 + 0.4 * s, z + 0.26 * s, aethG);
      const eye = K.cyl(0.11 * s, 0.11 * s, 0.05, K.glow(C.aeth), 10, x, 0.1 + 0.28 * s, z + 0.26 * s, aethG); eye.rotation.x = Math.PI / 2;
      aethNodes.push(eye);
    }
    jbox(0, zB, true); jbox(-3.0, zB); jbox(-6.6, zB); jbox(5.2, zB);
    for (const [x, z] of [[-1.6, zB], [2.6, zB], [-10.4, zB], [5.2, 0.4]]) {
      K.cyl(0.05, 0.05, 0.32, M.ironL, 6, x, 0.32, z, aethG);
      const vw = K.torus(0.15, 0.035, K.mat(0x9a2a18), 4, 12, x, 0.5, z, aethG); vw.rotation.x = Math.PI / 2;
      for (let k = 0; k < 3; k++) { const sp = K.box(0.28, 0.02, 0.02, K.mat(0x9a2a18), x, 0.5, z, aethG); sp.rotation.y = k * Math.PI / 3; }
    }
    // sockets (just the conduit ends' brass flanges; machines add their own fittings)
    for (const p of [[-7.4, 0.35, -2.4], [7.2, 0.35, -2.3], [0, 0.35, -2.9]]) { K.cyl(0.17, 0.17, 0.08, M.brass, 10, p[0], p[1] - 0.05, p[2], aethG); }

    // ----------------------------------------------------------------- BAKE
    const cut = K.bake(stat);

    // ----------------------------------------------------------------- UPDATE
    const v = new THREE.Vector3();
    let tDrip = 0, prevFeedIds = new Set(), flapOpen = 0, tubePrev = 0;
    const stState = (id) => { const st = I.stations && I.stations[id]; return !st ? 'IDLE' : st.blocked ? 'BLOCKED' : st.state; };
    return { update(t, dt) {
      // belts scroll with their items; jammed belts stop
      beltAnim.forEach((b) => (b.tex.offset.x -= dt * 2 * b.path.speed * b.path.flow));
      // running lights
      for (const name in lightsets) {
        const p = P[name], ms = lightsets[name];
        if (p.jammed) { const on = Math.sin(t * 9) > 0; ms.forEach((m) => m.color.setHex(on ? 0xff2a10 : 0x3a0804)); }
        else { const k = Math.floor(t * 5 * Math.max(0.2, p.flow)) % 4; ms.forEach((m, i) => m.color.setHex(i === (3 - k) ? 0xffb040 : 0x5a2a0a)); }
      }
      gears.forEach((q) => { const f = q.path.flow * (q.path.items.length || q.path.name.startsWith('rw') === false ? 1 : 0.35); q.g.rotation.y += dt * q.s * 2.2 * f; });
      turntables.forEach((tt) => (tt.g.rotation.y += dt * 1.2 * tt.path.flow));
      // lift chains scroll with direction; bucket carriers stay square to the tower
      chainMats.forEach((c) => (c.m.map.offset.y -= dt * c.dir * 3 * c.path.speed * c.path.flow));
      [P.rwUp, P.rwDown].forEach((p) => p.items.forEach((it) => { const cm = it.carrierMeshes && it.carrierMeshes.bucket; if (cm) cm.rotation.y = -it.mesh.rotation.y; }));
      [upT, dnT].forEach((tw, i) => { const p = i ? P.rwDown : P.rwUp; const on = p.items.length > 0 && Math.sin(t * 7) > 0; tw.bc.material.emissive.setHex(on ? 0xff3010 : 0); });
      // pneumatic tube: impeller + streak + blower lamp
      const inTube = P.tube.items.length;
      imp.rotation.z += dt * (inTube ? 40 : 4);
      streakM.opacity += ((inTube ? 0.35 + Math.sin(t * 20) * 0.1 : 0.05) - streakM.opacity) * Math.min(1, dt * 6);
      blowLamp.material.color.setHex(inTube ? (Math.sin(t * 14) > 0 ? 0x9affea : 0x3ac0a0) : 0x1e5a4c);
      if (inTube && Math.random() < 0.3) K.spawn(root, bl[0] + 1.3, bl[1] + 0.4, bl[2], 0.6 + K.R() * 0.3, 0.6, K.R() * 0.3, 0x9a8e7c, 0.9, 0.08, -0.1);
      // drop nozzle: flap kicks open + air puff when a capsule drops onto the feed belt
      P.feed.items.forEach((it) => {
        if (it.s < 0.35 && !prevFeedIds.has(it.id)) {
          prevFeedIds.add(it.id); flapOpen = 1;
          for (let i = 0; i < 10; i++) K.spawn(root, te[0] + K.R() * 0.3, te[1] - 0.2, te[2] + K.R() * 0.3, K.R() * 2.2, -0.2 + Math.random() * 0.8, K.R() * 2.2, Math.random() < 0.5 ? 0xd8d0c0 : 0xa89c88, 0.7, 0.07, -0.2);
        }
      });
      if (prevFeedIds.size > 40) prevFeedIds = new Set([...prevFeedIds].slice(-10));
      flapOpen = Math.max(0, flapOpen - dt * 1.6);
      flapPiv.rotation.z = -flapOpen * 1.2;
      // CI arch: green flash when a PR crosses the scan plane
      P.pass.items.forEach((it) => {
        const ps0 = prevS.has(it) ? prevS.get(it) : it.s;
        if (ps0 < archS && it.s >= archS) {
          archFlash = 1; archCount++;
          for (let i = 0; i < 8; i++) K.spawn(root, archP.x + K.R() * 0.3, archP.y + 0.4 + Math.random() * 1.0, archP.z + K.R() * 1.0, K.R() * 0.6, 0.6, K.R() * 0.6, Math.random() < 0.5 ? 0x9affc0 : 0xffffff, 0.6, 0.05, 0, true);
        }
        prevS.set(it, it.s);
      });
      archFlash = Math.max(0, archFlash - dt * 1.4);
      const scanning = P.pass.items.some((it) => Math.abs(it.s - archS) < 0.9);
      beamM.color.setHex(archFlash > 0.05 ? 0x5aff90 : 0x7af0d8);
      beamM.opacity = archFlash > 0.05 ? 0.35 + archFlash * 0.5 : scanning ? 0.25 + Math.sin(t * 30) * 0.1 : 0.08 + Math.sin(t * 2) * 0.04;
      beam.scale.z = archFlash > 0.05 ? 1 : 0.6 + Math.sin(t * 3) * 0.35;
      lasers.forEach((l, i) => { l.material.color.setHex(archFlash > 0.05 ? 0x7aff9a : 0x9affea); l.material.opacity = archFlash > 0.05 ? 0.95 : scanning ? 0.5 + Math.sin(t * 40 + i) * 0.3 : 0.18 + Math.sin(t * 3 + i * 1.3) * 0.1; });
      foot.position.x = archFlash > 0.05 ? 0 : Math.sin(t * (scanning ? 9 : 2)) * 0.12; footM.color.setHex(archFlash > 0.05 ? 0x5aff90 : 0x7af0d8); footM.opacity = archFlash > 0.05 ? 0.9 : scanning ? 0.6 : 0.25;
      ciLampM.emissive.setHex(archFlash > 0.05 ? 0x30ff70 : 0);
      ciLampB.material.emissive.setHex(scanning && archFlash <= 0.05 && Math.sin(t * 10) > 0 ? 0xffb020 : 0);
      slitM.color.setHex(scanning ? (Math.sin(t * 25) > 0 ? 0xb8fff0 : 0x5ae0c8) : 0x2cb89c);
      bars.forEach((b, i) => b.material.emissive.setHex(i < Math.min(4, archCount % 5) ? 0x30d060 : 0));
      // merge semaphores: rework has priority at the tray
      const waitingOre = P.ore.items.find((it) => it.atEnd), waitingRw = P.rwIn.items.find((it) => it.atEnd);
      sema.forEach((s) => {
        const w = s.path === P.ore ? waitingOre : waitingRw;
        const next = s.path === P.rwIn ? !!waitingRw : !!waitingOre && !waitingRw;
        s.g1.emissive.setHex(w && next ? 0x30ff70 : 0); s.a1.emissive.setHex(w && !next ? (Math.sin(t * 6) > 0 ? 0xffa020 : 0x402000) : 0);
      });
      // aether pulses: fast when the target machine works, slow idle, amber stutter when blocked
      pulses.forEach((p) => {
        const s = stState(p.to);
        const sp = s === 'WORKING' ? 2.6 : s === 'BLOCKED' ? (Math.sin(t * 5 + p.u * 9) > 0 ? 0.9 : 0.05) : 0.7;
        p.u = (p.u + dt * sp / p.L) % 1;
        p.curve.getPointAt(p.u, v); p.m.position.copy(v);
        p.m.material.color.setHex(s === 'BLOCKED' ? 0xffb030 : 0xb8fff0);
        p.m.scale.setScalar(0.85 + Math.sin(t * 10 + p.u * 30) * 0.2);
      });
      for (const k in coreMats) { const br = branches[k]; const s = stState(br.to); coreMats[k].color.setHex(s === 'BLOCKED' ? (Math.sin(t * 6) > 0 ? 0x9a6a10 : 0x4a3008) : s === 'WORKING' ? 0x3ad0b0 : 0x248a74); }
      aethNodes.forEach((e, i) => e.material.color.setHex(0x5ae0c8 + (Math.sin(t * 4 + i) > 0.6 ? 0x204020 : 0)));
      if (Math.random() < dt * 3) { const p = pulses[Math.floor(Math.random() * pulses.length)].m.position; K.spawn(root, p.x, p.y, p.z, K.R() * 1.4, Math.random() * 1.2, K.R() * 1.4, Math.random() < 0.5 ? 0x9affea : 0xffffff, 0.3, 0.04, 2, true); }
      // oil drips from the belts
      tDrip -= dt;
      if (tDrip <= 0 && dripPts.length) { tDrip = 0.28; const d = dripPts[Math.floor(Math.random() * dripPts.length)]; if (d[1] > 0.5) K.spawn(root, d[0] + K.R() * 0.3, d[1], d[2] + K.R() * 0.3, 0, -0.3, 0, 0x060506, 0.8, 0.045, 7); }
      if (Math.random() < dt * 1.5) { K.R(); const x = -14 + Math.random() * 10.5; K.spawn(root, x, yH - 0.5, zH + K.R() * 0.6, 0, -0.4, 0, 0x070607, 1.6, 0.05, 6); }
    } };
  });
})();
