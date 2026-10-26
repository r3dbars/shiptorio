// NEON TOKYO: a rain-soaked rooftop landing deck in a night megacity.
(function () {
  const T = THREE;
  const C = {
    ink: 0x05030c, deck: 0x14122a, deckDark: 0x0b0a18, steel: 0x2a2c44, steelHi: 0x4a4f72, glassC: 0x7ae8ff,
    mag: 0xff2bd6, cyan: 0x22e6ff, violet: 0x8a4bff, amber: 0xffa63a, red: 0xff3355, white: 0xeef4ff, lime: 0x9dff6a
  };
  const PAL = ['#05030c', '#14122a', '#2a2c44', '#4a4f72', '#8a4bff', '#ff2bd6', '#22e6ff', '#ffa63a', '#ff3355', '#eef4ff'];

  // ---------- local helpers ----------
  let sd = 4242;
  const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const basicMap = (map, o) => {
    o = o || {};
    return new T.MeshBasicMaterial({ map, color: o.color === undefined ? 0xffffff : o.color, transparent: !!o.op || !!o.add, opacity: o.op === undefined ? 1 : o.op,
      blending: o.add ? T.AdditiveBlending : T.NormalBlending, depthWrite: !o.add, fog: o.fog !== false, side: o.double ? T.DoubleSide : T.FrontSide });
  };
  const add = (c, op) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: op === undefined ? 1 : op, blending: T.AdditiveBlending, depthWrite: false, fog: false });

  function windowTex(K, w, h, density, tint) {
    return K.canvasTex(w, h, (g) => {
      g.fillStyle = '#07061a'; g.fillRect(0, 0, w, h);
      const cols = ['#ffcf7a', '#ffe7b0', '#7ae8ff', '#d8e0ff', '#ff7ae0', '#b08cff'];
      for (let y = 2; y < h - 2; y += 4) {
        const floorLit = rr() < 0.85;
        for (let x = 1; x < w - 1; x += 3) {
          if (floorLit && rr() < density) { g.fillStyle = rr() < 0.75 ? (tint || cols[Math.floor(rr() * 2)]) : cols[Math.floor(rr() * cols.length)]; g.fillRect(x, y, 2, 2); }
          else if (rr() < 0.3) { g.fillStyle = '#121030'; g.fillRect(x, y, 2, 2); }
        }
      }
      if (rr() < 0.5) { g.fillStyle = '#1d1840'; for (let x = 0; x < w; x += 9) g.fillRect(x, 0, 1, h); }
    });
  }
  function glyphTex(K, color, n) {
    return K.canvasTex(16, 16 * n, (g) => {
      g.fillStyle = '#0a0414'; g.fillRect(0, 0, 16, 16 * n);
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const y0 = i * 16 + 2;
        // invented glyphs: random strokes on a 4x4 lattice
        const strokes = 3 + Math.floor(rr() * 3);
        for (let s = 0; s < strokes; s++) {
          if (rr() < 0.5) { const yy = y0 + Math.floor(rr() * 4) * 3; const x0 = 2 + Math.floor(rr() * 2) * 3; g.fillRect(x0, yy, 6 + Math.floor(rr() * 4), 2); }
          else { const xx = 2 + Math.floor(rr() * 4) * 3; const yy = y0 + Math.floor(rr() * 2) * 3; g.fillRect(xx, yy, 2, 6 + Math.floor(rr() * 4)); }
        }
      }
    });
  }
  function codeTex(K, color, accent) {
    return K.canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      for (let y = 1; y < 64; y += 4) {
        let x = 2 + Math.floor(rr() * 4) * 3;
        const parts = 1 + Math.floor(rr() * 4);
        for (let p = 0; p < parts && x < 60; p++) {
          const w = 3 + Math.floor(rr() * 12);
          g.fillStyle = rr() < 0.2 ? accent : color; g.fillRect(x, y, Math.min(w, 62 - x), 2); x += w + 2;
        }
      }
    });
  }
  function deckTex(K) {
    return K.canvasTex(64, 64, (g) => {
      g.fillStyle = '#0e0c1e'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 4; i++) { g.fillStyle = rr() < 0.5 ? '#121028' : '#0c0a1a'; g.fillRect(i % 2 * 32, Math.floor(i / 2) * 32, 32, 32); }
      g.fillStyle = '#05040c'; g.fillRect(0, 0, 64, 1); g.fillRect(0, 32, 64, 1); g.fillRect(0, 0, 1, 64); g.fillRect(32, 0, 1, 64);
      g.fillStyle = '#1c1a38'; for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28], [35, 35], [60, 35], [35, 60], [60, 60]]) g.fillRect(x, y, 1, 1);
      g.fillStyle = '#16142e'; g.fillRect(8, 44, 18, 2);
    });
  }

  // a flying car with head/tail lights and an underglow
  function hoverCar(K, color, glowC) {
    const g = K.group();
    K.box(1.1, 0.22, 0.5, K.mat(color, { shine: 40, e: 0x0a0618 }), 0, 0, 0, g);
    K.box(1.12, 0.04, 0.52, add(glowC, 0.9), 0, 0.02, 0, g);
    K.box(0.55, 0.16, 0.42, K.mat(0x0a0a18, { shine: 60 }), -0.05, 0.18, 0, g);
    K.box(0.5, 0.04, 0.44, add(glowC, 0.9), -0.05, 0.27, 0, g);
    K.box(0.06, 0.08, 0.36, add(C.white), 0.56, 0.02, 0, g);
    K.box(0.05, 0.07, 0.4, add(C.red), -0.56, 0.02, 0, g);
    K.box(0.9, 0.02, 0.36, add(glowC, 0.55), 0, -0.13, 0, g);
    const beam = K.box(1.8, 0.05, 0.25, add(0xfff2c8, 0.18), 1.5, -0.02, 0, g);
    const trail = K.box(1.6, 0.06, 0.3, add(C.red, 0.5), -1.4, 0.02, 0, g);
    return { g, beam, trail };
  }

  // =====================================================================
  // WORLD
  // =====================================================================
  function world(K, root, scene) {
    const ups = [];
    // --- the deck ---
    const dt = deckTex(K); dt.repeat.set(8, 3.5);
    const deckTop = K.mat(0xffffff, { map: dt, shine: 70, spec: 0x3a3a66 });
    const side = K.mat(0x0a0918);
    K.box(30, 1.4, 12, [side, side, deckTop, side, side, side], 0, -0.7, 0, root);
    // underside layers + struts dropping into the abyss
    const facTex = windowTex(K, 64, 128, 0.38); facTex.repeat.set(8, 6);
    const facM = basicMap(facTex, { color: 0x9a90c0 });
    K.box(29.6, 30, 11.6, [facM, facM, side, side, facM, facM], 0, -16.4, -0.2, root);
    for (let x = -14; x <= 14; x += 4.66) K.box(0.3, 30, 0.2, K.mat(0x0a0918), x, -16.4, 5.62, root);
    K.box(29.8, 0.5, 0.3, K.mat(0x0a0918), 0, -1.65, 5.7, root);
    for (const [x, c] of [[-10, C.mag], [-2, C.cyan], [7, C.amber]]) { const n = 6; const sg = K.box(0.7, 4, 0.04, basicMap(glyphTex(K, hex(c), n), { fog: false }), x, -4.2, 5.85, root); K.box(0.8, 4.1, 0.04, add(c, 0.25), x, -4.2, 5.83, root); }
    for (let x = -13; x <= 13; x += 6.5) { K.box(0.8, 30, 0.8, K.mat(0x0c0b1c), x, -18, 4.5, root); K.box(0.8, 30, 0.8, K.mat(0x0c0b1c), x, -18, -4.5, root); }
    // edge trim lights along the front edge and sides
    K.box(30, 0.08, 0.08, add(C.cyan, 0.95), 0, 0.02, 6, root);
    K.box(30, 0.06, 0.06, add(C.mag, 0.7), 0, -1.38, 6.02, root);
    for (let i = 0; i < 30; i++) { if (i % 3) continue; K.box(0.5, 0.05, 0.05, add(C.amber, 0.9), -14.5 + i, -0.7, 6.04, root); }
    // railing at the front
    for (let x = -14.6; x <= 14.6; x += 1.2) K.box(0.06, 0.7, 0.06, K.mat(C.steel), x, 0.35, 5.85, root);
    K.box(29.4, 0.06, 0.08, K.mat(C.steelHi, { shine: 50 }), 0, 0.72, 5.85, root);
    K.box(29.4, 0.03, 0.04, add(C.cyan, 0.6), 0, 0.4, 5.86, root);
    // landing guide lines on the deck
    for (const x of [-8, 0, 8]) {
      K.box(5.6, 0.012, 0.08, add(C.amber, 0.45), x, 0.006, 3.2, root);
      for (let i = -2; i <= 2; i++) K.box(0.3, 0.012, 0.3, add(i % 2 ? C.mag : C.cyan, 0.35), x + i * 1.3, 0.006, 4.2, root);
    }
    // hazard chevrons near the edges
    for (let i = 0; i < 10; i++) { const m = K.box(0.4, 0.014, 0.14, add(C.amber, 0.5), -14 + i * 0.55, 0.007, 5.3, root); m.rotation.y = 0.6; }
    for (let i = 0; i < 10; i++) { const m = K.box(0.4, 0.014, 0.14, add(C.amber, 0.5), 9.2 + i * 0.55, 0.007, 5.3, root); m.rotation.y = 0.6; }

    // --- wet reflections: streaks below lights ---
    const refl = [];
    const reflAt = (x, z, w, len, c, op) => { const m = K.box(w, 0.01, len, add(c, op), x, 0.012, z, root); refl.push({ m, op, k: rr() * 6 }); return m; };
    // puddles
    for (const [x, z, w, d] of [[-4.2, 3.6, 2.2, 1.4], [3.9, -1.8, 1.4, 2.4], [-12, 1.5, 1.6, 2.8], [12.4, 3.2, 1.8, 1.2], [4.5, 4.3, 1.2, 0.8]]) {
      K.box(w, 0.008, d, new T.MeshBasicMaterial({ color: 0x1a0f3a, transparent: true, opacity: 0.55, fog: false }), x, 0.01, z, root);
    }

    // --- back-of-deck props ---
    // holo billboard between slots
    const adTex = K.canvasTex(64, 32, (g) => {
      g.fillStyle = '#12002a'; g.fillRect(0, 0, 64, 32);
      g.fillStyle = '#ff2bd6'; g.fillRect(4, 4, 24, 24); g.fillStyle = '#12002a'; g.fillRect(8, 8, 16, 16);
      g.fillStyle = '#22e6ff'; g.fillRect(12, 12, 8, 8);
      g.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) g.fillRect(34, 6 + i * 6, 14 + Math.floor(rr() * 14), 3);
      g.fillStyle = '#ffa63a'; g.fillRect(34, 28, 26, 2);
    });
    const boards = [];
    for (const x of [-4, 4]) {
      const bg = K.group(root, x, 0, -4.6);
      K.box(0.14, 4.2, 0.14, K.mat(C.steel), -1.1, 2.1, 0, bg); K.box(0.14, 4.2, 0.14, K.mat(C.steel), 1.1, 2.1, 0, bg);
      K.box(2.6, 1.5, 0.12, K.mat(0x08061a), 0, 3.6, -0.05, bg);
      const scr = K.box(2.4, 1.3, 0.02, basicMap(adTex, { fog: false }), 0, 3.6, 0.03, bg);
      const holo = K.box(2.6, 1.5, 0.02, add(C.cyan, 0.08), 0, 3.6, 0.35, bg);
      boards.push({ scr, holo, k: x });
    }
    // vertical neon signs on the deck corners and far edges
    const signs = [];
    const sign = (x, y, z, h, color, rot) => {
      const n = Math.max(3, Math.round(h / 0.55));
      const tex = glyphTex(K, hex(color), n);
      const sg = K.group(root, x, y, z); sg.rotation.y = rot || 0;
      K.box(0.7, h + 0.2, 0.22, K.mat(0x0a0818), 0, 0, -0.06, sg);
      const face = K.box(0.56, h, 0.02, basicMap(tex, { fog: false }), 0, 0, 0.06, sg);
      K.box(0.62, 0.04, 0.04, add(color), 0, h / 2 + 0.08, 0.07, sg); K.box(0.62, 0.04, 0.04, add(color), 0, -h / 2 - 0.08, 0.07, sg);
      K.box(0.04, h + 0.2, 0.04, add(color, 0.8), -0.33, 0, 0.07, sg); K.box(0.04, h + 0.2, 0.04, add(color, 0.8), 0.33, 0, 0.07, sg);
      signs.push({ face, k: rr() * 10, flick: rr() < 0.35 });
      reflAt(x, z + 1.6, 0.6, 2.6, color, 0.22);
      return sg;
    };
    sign(-13.4, 3.4, -4.4, 5.6, C.mag);
    sign(13.4, 3.0, -4.4, 4.6, C.cyan);
    sign(-12.2, 2.2, -5.2, 3.0, C.amber);
    sign(12.0, 2.6, -5.3, 3.6, C.violet);

    // AC units with spinning fans + vents with steam
    const fans = [], vents = [];
    for (const [x, z] of [[-13.2, 0.8], [-13.2, 3], [13.3, 1.2]]) {
      K.box(1.1, 0.7, 1.4, K.mat(0x2b2e48, { shine: 20 }), x, 0.35, z, root);
      for (let i = 0; i < 4; i++) K.box(1.12, 0.03, 0.02, K.mat(0x14152a), x, 0.12 + i * 0.13, z + 0.71, root);
      K.cyl(0.42, 0.42, 0.04, K.mat(0x14152a), 16, x, 0.72, z, root);
      const f = K.group(root, x, 0.76, z);
      for (let b = 0; b < 4; b++) { const bl = K.box(0.7, 0.02, 0.12, K.mat(0x55597a), 0, 0, 0, f); bl.rotation.y = b * Math.PI / 4; }
      fans.push(f);
    }
    for (const [x, z] of [[-4, 1.8], [4.2, 2.2], [11.2, -2.4], [-11, -3]]) {
      K.cyl(0.25, 0.3, 0.3, K.mat(0x22243c), 8, x, 0.15, z, root);
      K.cyl(0.18, 0.18, 0.04, K.mat(0x06050e), 8, x, 0.31, z, root);
      vents.push({ x, z, cd: rr() });
    }
    // vending machine glowing at the right
    K.box(0.9, 1.9, 0.7, K.mat(0x1d1f3a, { shine: 30 }), 13.2, 0.95, -2.4, root);
    K.box(0.7, 1.2, 0.02, add(C.cyan, 0.85), 13.2, 1.15, -2.04, root);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) K.box(0.14, 0.18, 0.02, add([C.mag, C.amber, C.lime][j], 0.9), 13.0 + j * 0.2, 0.75 + i * 0.25, -2.02, root);
    reflAt(13.2, -1.2, 0.8, 2.2, C.cyan, 0.2);
    // cable bundles snaking across the deck
    K.tube([[-14, 0.05, -2], [-11.5, 0.06, -1.6], [-10.6, 0.06, -3.2], [-6, 0.06, -3.6], [-3, 0.06, -3.1]], 0.06, K.mat(0x07060f), root, 30, 5);
    K.tube([[3, 0.06, -3.2], [6, 0.06, -3.4], [11, 0.06, -3.6], [14, 0.05, -3]], 0.07, K.mat(0x0a0818), root, 30, 5);
    // overhead cables sagging between poles, with lantern strings
    for (const [x0, x1] of [[-13.4, -4], [4, 13.4]]) {
      const pts = []; for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push([x0 + (x1 - x0) * k, 5.2 - Math.sin(k * Math.PI) * 0.9, -4.6]); }
      K.tube(pts, 0.025, K.mat(0x050409), root, 24, 4);
      pts.forEach((p, i) => { if (i % 2) K.box(0.14, 0.14, 0.14, add(i % 4 === 1 ? C.amber : C.mag, 0.95), p[0], p[1] - 0.14, p[2], root); });
    }

    // --- the skyline behind ---
    const bodyMat = new T.MeshPhongMaterial({ color: 0x0b0a1e, flatShading: true });
    const winTexes = [windowTex(K, 32, 128, 0.42), windowTex(K, 32, 128, 0.3, '#7ae8ff'), windowTex(K, 32, 128, 0.5), windowTex(K, 32, 128, 0.22, '#ff9ae8')];
    const towers = [];
    function ring(g, w, d, th, y, m) {
      K.box(w, th, 0.06, m, 0, y, d / 2, g); K.box(w, th, 0.06, m, 0, y, -d / 2, g);
      K.box(0.06, th, d, m, w / 2, y, 0, g); K.box(0.06, th, d, m, -w / 2, y, 0, g);
    }
    function tower(x, z, w, d, h, y0) {
      const tex = winTexes[Math.floor(rr() * winTexes.length)].clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(w / 1.4)), Math.max(1, h / 5.5));
      const dim = Math.max(0.35, 1 - (-z - 8) / 70);
      const wm = basicMap(tex, { color: new T.Color(dim, dim, dim * 1.05) });
      const g = K.group(root, x, y0, z);
      K.box(w, h, d, [wm, wm, bodyMat, bodyMat, wm, wm], 0, h / 2, 0, g);
      // crown details
      const top = rr();
      if (top < 0.3) { K.box(w * 0.6, 1.4, d * 0.6, bodyMat, 0, h + 0.7, 0, g); K.cyl(0.05, 0.05, 3, K.mat(0x30324c), 4, 0, h + 2.9, 0, g); const bl = K.box(0.2, 0.2, 0.2, add(C.red), 0, h + 4.4, 0, g); towers.push({ blink: bl, k: rr() * 6 }); }
      else if (top < 0.55) { ring(g, w + 0.1, d + 0.1, 0.14, h + 0.07, add(rr() < 0.5 ? C.cyan : C.mag, 0.8)); }
      else if (top < 0.75) { for (let i = 0; i < 3; i++) K.box(w * (0.8 - i * 0.2), 0.8, d * (0.8 - i * 0.2), bodyMat, 0, h + 0.4 + i * 0.8, 0, g); }
      // neon band partway up
      if (rr() < 0.45) ring(g, w + 0.06, d + 0.06, 0.16, h * (0.3 + rr() * 0.5), add([C.mag, C.cyan, C.violet, C.amber][Math.floor(rr() * 4)], 0.7));
      return g;
    }
    // near row (just behind the deck), mid row, far row
    for (let x = -30; x < 30; x += 3.4 + rr() * 2) tower(x, -9.5 - rr() * 3, 2.4 + rr() * 2, 2.4 + rr() * 2, 10 + rr() * 16, -14);
    for (let x = -42; x < 42; x += 4 + rr() * 3) tower(x, -18 - rr() * 6, 3 + rr() * 3, 3 + rr() * 3, 22 + rr() * 26, -18);
    for (let x = -60; x < 60; x += 5 + rr() * 4) tower(x, -32 - rr() * 10, 4 + rr() * 4, 4, 34 + rr() * 30, -22);
    // lower city below the deck's front edge
    for (let x = -20; x < 20; x += 3 + rr() * 2.5) tower(x, 9 + rr() * 6, 2.5 + rr() * 2, 2.5 + rr() * 2, 8 + rr() * 6, -26);
    // giant vertical signs on the near towers
    const bigSign = (x, y, z, h, color) => {
      const n = Math.round(h / 0.9); const tex = glyphTex(K, hex(color), n);
      const sg = K.group(root, x, y, z);
      K.box(1.2, h + 0.3, 0.3, K.mat(0x080616), 0, 0, -0.1, sg);
      const face = K.box(1.0, h, 0.02, basicMap(tex, { fog: false }), 0, 0, 0.07, sg);
      K.box(1.1, h + 0.25, 0.02, add(color, 0.25), 0, 0, 0.1, sg);
      signs.push({ face, k: rr() * 10, flick: rr() < 0.4 });
    };
    bigSign(-9.2, 6.5, -8.4, 7, C.mag);
    bigSign(2.3, 8.2, -8.6, 6, C.cyan);
    bigSign(9.6, 6.0, -8.2, 5.4, C.amber);
    bigSign(-17, 9, -8.6, 8, C.violet);
    bigSign(17.5, 8, -8.6, 7, C.mag);
    // huge holo ad floating among the towers
    const holoTex = K.canvasTex(32, 48, (g) => {
      g.clearRect(0, 0, 32, 48); g.fillStyle = '#22e6ff';
      g.fillRect(14, 4, 4, 4); g.fillRect(10, 10, 12, 14); g.fillRect(6, 12, 4, 10); g.fillRect(22, 12, 4, 10); g.fillRect(11, 24, 4, 16); g.fillRect(17, 24, 4, 16);
      g.fillStyle = '#ff2bd6'; for (let y = 2; y < 48; y += 4) g.fillRect(0, y, 32, 1);
    });
    const holoRing = K.group(root, -2, 15, -16);
    const hr1 = K.torus(2.4, 0.08, add(C.cyan, 0.7), 4, 48, 0, 0, 0, holoRing);
    const hr2 = K.torus(1.9, 0.05, add(C.mag, 0.6), 4, 48, 0, 0, 0, holoRing);
    const hr3 = K.box(1.4, 1.4, 0.02, basicMap(glyphTex(K, '#22e6ff', 1), { add: true, op: 0.8, fog: false }), 0, 0, 0, holoRing);

    // --- monorail ---
    const railY = 7.2, railZ = -7.2;
    K.box(120, 0.35, 0.45, K.mat(0x1a1b30, { shine: 30 }), 0, railY, railZ, root);
    K.box(120, 0.05, 0.05, add(C.cyan, 0.7), 0, railY - 0.2, railZ + 0.24, root);
    for (let x = -36; x <= 36; x += 9) { K.box(0.4, 26, 0.4, K.mat(0x12122a), x, railY - 13.2, railZ, root); K.box(1.4, 0.3, 0.6, K.mat(0x12122a), x, railY - 0.3, railZ, root); }
    const train = K.group(root, -60, railY + 0.6, railZ);
    for (let i = 0; i < 4; i++) {
      const cx = -i * 2.3;
      K.box(2.2, 0.8, 0.7, K.mat(0x34385a, { shine: 60 }), cx, 0, 0, train); K.box(2.2, 0.06, 0.72, add(C.cyan, 0.8), cx, 0.38, 0, train);
      K.box(2.0, 0.22, 0.02, add(C.amber, 0.95), cx, 0.08, 0.36, train);
      K.box(2.2, 0.05, 0.02, add(C.mag, 0.9), cx, -0.3, 0.36, train);
    }
    K.box(0.3, 0.6, 0.72, K.mat(0x34385a, { shine: 60 }), 1.25, -0.05, 0, train);
    K.box(0.05, 0.2, 0.5, add(C.white), 1.42, 0, 0, train);
    let trainX = -60;

    // --- flying traffic ---
    const lanes = [
      { y: 9.5, z: -6.2, v: 6, n: 4 }, { y: 10.6, z: -6.0, v: -5, n: 4 },
      { y: 13, z: -12, v: 4.5, n: 5 }, { y: 14.2, z: -12.5, v: -4, n: 5 },
      { y: 18, z: -20, v: 3.2, n: 6 }, { y: 9.8, z: 2.5, v: -7, n: 2 }
    ];
    const cars = [];
    const carCols = [[0x1a1d36, C.cyan], [0x2c0f30, C.mag], [0xd0d4e8, C.cyan], [0x16182a, C.amber], [0x24103e, C.violet]];
    lanes.forEach((L) => {
      for (let i = 0; i < L.n; i++) {
        const [c, gc] = carCols[Math.floor(rr() * carCols.length)];
        const car = hoverCar(K, c, gc); root.add(car.g);
        const s = 1.3 + rr() * 0.4; car.g.scale.setScalar(L.z < -15 ? s * 1.4 : s);
        car.x = -40 + (80 / L.n) * i + rr() * 6; car.L = L; car.bob = rr() * 6;
        if (L.v < 0) car.g.rotation.y = Math.PI;
        cars.push(car);
      }
    });

    // --- drones circling ---
    const drones = [];
    for (let i = 0; i < 3; i++) {
      const d = K.group(root);
      K.box(0.36, 0.1, 0.36, K.mat(0x22243c), 0, 0, 0, d);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) K.cyl(0.12, 0.12, 0.02, add(0xaab0ff, 0.35), 8, a * 0.22, 0.06, b * 0.22, d);
      const led = K.box(0.08, 0.06, 0.08, add(i % 2 ? C.red : C.lime), 0, -0.08, 0, d);
      const cone = K.cone(0.6, 1.6, add(0xbfefff, 0.06), 10, 0, -0.9, 0, d); cone.rotation.x = Math.PI;
      drones.push({ d, led, r: 3 + i * 2.5, y: 4.5 + i * 0.9, k: i * 2.1, cx: [-4, 4, 0][i], cz: [1, -1, 0.5][i] });
    }

    // --- rain (line segments) ---
    const N = 420, pos = new Float32Array(N * 6), drops = [];
    for (let i = 0; i < N; i++) drops.push({ x: (rr() - 0.5) * 34, y: rr() * 18, z: -9 + rr() * 17, v: 14 + rr() * 6 });
    const rgeo = new T.BufferGeometry(); rgeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const rain = new T.LineSegments(rgeo, new T.LineBasicMaterial({ color: 0x9fb0ff, transparent: true, opacity: 0.38, fog: false }));
    rain.frustumCulled = false; root.add(rain);

    // --- lights ---
    K.light(C.mag, 2.2, 10, -12.5, 3, -2.5, root);
    K.light(C.cyan, 2.0, 10, 12.5, 3, -1.5, root);
    K.light(C.amber, 1.4, 9, 0, 4.2, -3.8, root);

    return {
      update(t, dtt) {
        signs.forEach((s) => { let on = 1; if (s.flick) { const f = Math.sin(t * 13 + s.k) + Math.sin(t * 31 + s.k * 2); on = f > 1.6 ? 0.25 : 1; } s.face.material.color.setScalar(on); });
        refl.forEach((r) => (r.m.material.opacity = r.op * (0.75 + 0.25 * Math.sin(t * 2 + r.k))));
        boards.forEach((b) => { b.scr.material.map.offset.x = Math.floor(t * 0.5 + b.k) * 0.5; b.holo.material.opacity = 0.06 + 0.04 * Math.sin(t * 6 + b.k); });
        hr1.rotation.y = t * 0.6; hr2.rotation.x = t * 0.8; hr3.rotation.y = Math.sin(t * 0.7) * 0.6; holoRing.visible = Math.sin(t * 19) < 0.95;
        towers.forEach((b) => b.blink.visible = Math.sin(t * 2.4 + b.k) > 0.6);
        fans.forEach((f) => (f.rotation.y += dtt * 9));
        vents.forEach((v) => { v.cd -= dtt; if (v.cd <= 0) { v.cd = 0.12; K.spawn(root, v.x + K.R() * 0.2, 0.35, v.z + K.R() * 0.2, K.R() * 0.2, 0.7 + Math.random() * 0.3, K.R() * 0.2, 0x5a5480, 2.2, 0.16, -0.15); } });
        cars.forEach((c) => {
          c.x += c.L.v * dtt; if (c.x > 45) c.x = -45; if (c.x < -45) c.x = 45;
          c.g.position.set(c.x, c.L.y + Math.sin(t * 1.3 + c.bob) * 0.12, c.L.z);
          c.beam.material.opacity = 0.14 + 0.06 * Math.sin(t * 8 + c.bob);
        });
        trainX += dtt * 9; if (trainX > 70) trainX = -70; train.position.x = trainX;
        drones.forEach((d) => { const a = t * 0.5 + d.k; d.d.position.set(d.cx + Math.cos(a) * d.r, d.y + Math.sin(t * 1.7 + d.k) * 0.2, d.cz + Math.sin(a) * d.r * 0.5); d.d.rotation.y = -a; d.led.visible = Math.sin(t * 6 + d.k) > 0; });
        for (let i = 0; i < N; i++) {
          const d = drops[i]; d.y -= d.v * dtt;
          if (d.y < (Math.abs(d.z) < 6 && Math.abs(d.x) < 15 ? 0 : -14)) {
            if (d.y > -1 && Math.random() < 0.08) K.spawn(root, d.x, 0.05, d.z, K.R() * 0.6, 0.6, K.R() * 0.6, 0x9fb0ff, 0.25, 0.05, 4);
            d.y = 16 + Math.random() * 3; d.x = (Math.random() - 0.5) * 34; d.z = -9 + Math.random() * 17;
          }
          const o = i * 6; pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z; pos[o + 3] = d.x - 0.04; pos[o + 4] = d.y + 0.55; pos[o + 5] = d.z;
        }
        rgeo.attributes.position.needsUpdate = true;
      }
    };
  }

  // =====================================================================
  // ASSEMBLER: a glass robotics cell building a PR
  // =====================================================================
  function baseSlab(K, g, w, d, edge) {
    K.box(w, 0.24, d, K.mat(0x14132a, { shine: 40 }), 0, 0.12, 0, g);
    K.box(w - 0.3, 0.02, d - 0.3, K.mat(0x0c0b1c, { shine: 80, spec: 0x2a2a55 }), 0, 0.25, 0, g);
    K.box(w + 0.04, 0.05, 0.05, add(edge, 0.95), 0, 0.2, d / 2, g); K.box(0.05, 0.05, d + 0.04, add(edge, 0.95), w / 2, 0.2, 0, g);
    K.box(w + 0.04, 0.05, 0.05, add(edge, 0.5), 0, 0.2, -d / 2, g); K.box(0.05, 0.05, d + 0.04, add(edge, 0.5), -w / 2, 0.2, 0, g);
  }
  function arm(K, p, x, z, color) {
    const base = K.group(p, x, 0.26, z);
    K.cyl(0.24, 0.3, 0.16, K.mat(0x1c1d34, { shine: 50 }), 12, 0, 0.08, 0, base);
    K.torus(0.25, 0.025, add(color, 0.9), 4, 16, 0, 0.17, 0, base).rotation.x = Math.PI / 2;
    const yaw = K.group(base, 0, 0.18, 0);
    K.box(0.3, 0.16, 0.3, K.mat(0xe6e8f4, { shine: 60 }), 0, 0.08, 0, yaw);
    const sh = K.group(yaw, 0, 0.2, 0);
    K.sph(0.12, K.mat(0x2a2c44), 0, 0, 0, sh, 8, 6);
    K.box(0.13, 0.85, 0.15, K.mat(0xe6e8f4, { shine: 60 }), 0, 0.42, 0, sh);
    K.box(0.03, 0.7, 0.16, add(color, 0.95), 0.075, 0.42, 0, sh);
    const el = K.group(sh, 0, 0.85, 0);
    K.sph(0.1, K.mat(0x2a2c44), 0, 0, 0, el, 8, 6);
    K.box(0.11, 0.65, 0.12, K.mat(0xe6e8f4, { shine: 60 }), 0, 0.32, 0, el);
    const wr = K.group(el, 0, 0.65, 0);
    K.cyl(0.07, 0.07, 0.1, K.mat(0x2a2c44), 8, 0, 0, 0, wr);
    const tool = K.box(0.06, 0.24, 0.06, K.mat(0x9aa0c8, { shine: 80 }), 0, -0.15, 0, wr);
    const tip = K.box(0.06, 0.06, 0.06, add(color), 0, -0.3, 0, wr);
    return { yaw, sh, el, wr, tip };
  }
  function buildAssembler(K) {
    const g = K.group();
    baseSlab(K, g, 4.8, 4.8, C.cyan);
    // glass cell frame
    const frameM = K.mat(0x22243e, { shine: 60 }), glassM = K.mat(C.glassC, { op: 0.12, double: true, shine: 90, spec: 0x99ccff, depthWrite: false });
    const h = 3.2, w = 3.8;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1]]) K.box(0.12, h, 0.12, frameM, x * w / 2, 0.25 + h / 2, z * w / 2, g);
    K.box(0.12, 0.5, 0.12, frameM, w / 2, 0.25 + h - 0.25, w / 2, g);
    for (const z of [-1, 1]) K.box(w + 0.12, 0.14, 0.14, frameM, 0, 0.25 + h, z * w / 2, g);
    for (const x of [-1, 1]) K.box(0.14, 0.14, w + 0.12, frameM, x * w / 2, 0.25 + h, 0, g);
    const cellLight = K.light(0x9fdcff, 2.2, 6, 0.3, 2.6, 0.6, g);
    K.box(w + 0.15, 0.04, 0.05, add(C.cyan), 0, 0.25 + h - 0.1, w / 2 + 0.05, g);
    K.box(0.05, 0.04, w + 0.15, add(C.cyan), w / 2 + 0.05, 0.25 + h - 0.1, 0, g);
    // glass walls: front + right only low-ish so you see in; back + left full
    K.box(w, h * 0.55, 0.02, glassM, 0, 0.25 + h * 0.275, w / 2, g);
    K.box(0.02, h * 0.55, w, glassM, w / 2, 0.25 + h * 0.275, 0, g);
    K.box(w, h, 0.02, glassM, 0, 0.25 + h / 2, -w / 2, g);
    K.box(0.02, h, w, glassM, -w / 2, 0.25 + h / 2, 0, g);
    // roof: gantry with emitter strips and a light bar
    for (let i = -1; i <= 1; i++) K.box(w, 0.08, 0.14, frameM, 0, 0.25 + h - 0.04, i * 1.1, g);
    const roofStrip = K.box(w - 0.4, 0.03, 0.08, add(C.white, 0.9), 0, 0.25 + h - 0.12, 0, g);
    // server rack at the back-left corner
    const rack = K.group(g, -1.35, 0.26, -1.35);
    K.box(0.9, 2.4, 0.7, K.mat(0x0e0e20, { shine: 30 }), 0, 1.2, 0, rack);
    const leds = [];
    for (let r = 0; r < 9; r++) {
      K.box(0.82, 0.02, 0.02, K.mat(0x2a2c44), 0, 0.2 + r * 0.24, 0.36, rack);
      for (let c = 0; c < 5; c++) { const m = K.box(0.06, 0.05, 0.02, add(C.lime), -0.3 + c * 0.13, 0.3 + r * 0.24, 0.36, rack); leds.push({ m, k: Math.random() * 10, c: [C.lime, C.cyan, C.amber][(r + c) % 3] }); }
    }
    for (let r = 0; r < 9; r++) for (let c = 0; c < 4; c++) { const m = K.box(0.02, 0.05, 0.06, add(C.cyan), 0.46, 0.3 + r * 0.24, -0.25 + c * 0.15, rack); leds.push({ m, k: Math.random() * 10, c: C.cyan }); }
    // cables from rack to work table
    K.tube([[-1.0, 1.4, -1.0], [-0.6, 1.6, -0.6], [-0.2, 0.9, -0.3], [0, 0.6, 0]], 0.03, K.mat(0x07060f), g, 16, 4);
    K.tube([[-0.9, 0.5, -1.0], [-0.5, 0.3, -0.4], [0, 0.3, 0]], 0.04, K.mat(C.mag, { e: 0x3a0030 }), g, 16, 4);
    // work table + the PR being built (a glowing crystalline crate)
    K.box(1.4, 0.08, 1.0, K.mat(0x2a2c44, { shine: 60 }), 0.2, 0.75, 0.3, g);
    for (const [x, z] of [[-0.4, -0.1], [0.8, -0.1], [-0.4, 0.7], [0.8, 0.7]]) K.box(0.08, 0.48, 0.08, frameM, x, 0.5, z, g);
    const core = K.group(g, 0.2, 1.15, 0.3);
    const crate = K.box(0.5, 0.5, 0.5, K.mat(0x1a1440, { e: 0x2a0060, shine: 90 }), 0, 0, 0, core);
    const crateEdge = K.box(0.56, 0.56, 0.56, new T.MeshBasicMaterial({ color: C.mag, wireframe: true, transparent: true, opacity: 0.9 }), 0, 0, 0, core);
    const scanRing = K.torus(0.42, 0.015, add(C.cyan), 4, 24, 0, 0, 0, core); scanRing.rotation.x = Math.PI / 2;
    // two arms
    const a1 = arm(K, g, 1.25, 1.2, C.mag), a2 = arm(K, g, -0.85, 1.3, C.cyan);
    for (const a of [a1, a2]) a.yaw.parent.scale.setScalar(1.25);
    // holographic code panes floating around
    const panes = [];
    const pane = (x, y, z, w2, h2, ry, color, accent) => {
      const tex = codeTex(K, hex(color), hex(accent)); tex.repeat.set(1, 0.7);
      const m = K.box(w2, h2, 0.01, basicMap(tex, { add: true, op: 0.95, fog: false, double: true }), x, y, z, g); m.rotation.y = ry;
      const fr = K.box(w2 + 0.06, h2 + 0.06, 0.005, add(color, 0.12), x, y, z, g); fr.rotation.y = ry;
      K.box(w2, 0.02, 0.01, add(color), x, y + h2 / 2 + 0.03, z, g).rotation.y = ry;
      panes.push({ m, fr, tex, x, y, z, ry, k: Math.random() * 5, color });
    };
    pane(0.1, 2.3, -1.2, 2.4, 1.3, 0, C.cyan, C.mag);
    pane(-1.5, 2.0, 0.3, 1.5, 1.0, Math.PI / 2, C.violet, C.cyan);
    pane(1.0, 2.75, 0.6, 1.1, 0.7, -0.5, C.mag, C.amber);
    // exterior: status pylon + monitor + feed belt carrying finished branches out
    const pylon = K.group(g, 2.15, 0.25, 2.15);
    K.box(0.22, 1.6, 0.22, K.mat(0x14132a), 0, 0.8, 0, pylon);
    const lamps = ['g', 'a', 'r'].map((k, i) => ({ k, m: K.box(0.26, 0.2, 0.26, add([C.lime, C.amber, C.red][i], 0.15), 0, 1.0 + i * 0.24, 0, pylon) }));
    const strobe = K.light(C.red, 0, 6, 0, 3.6, 0, g);
    const outBelt = K.group(g, 2.0, 0.26, -0.6);
    K.box(0.6, 0.1, 2.2, K.mat(0x1a1b30), 0, 0.05, 0, outBelt);
    K.box(0.04, 0.03, 2.2, add(C.cyan, 0.8), 0.3, 0.1, 0, outBelt);
    const chips = [0, 1, 2].map((i) => K.box(0.28, 0.16, 0.28, K.mat(0x1a1440, { e: C.violet, ei: 0.6 }), 0, 0.18, -1 + i * 0.7, outBelt));
    let k = 0, cd = 0, glitchT = 0;
    const ARM = [[0, 0.5, 0.6, 1.1], [0.25, 0.9, 0.5, 0.9], [0.5, 0.2, 0.75, 1.0], [0.75, -0.3, 0.55, 1.2], [1, 0.5, 0.6, 1.1]];
    return { g, update(t, dt, s) {
      const work = s === 'WORKING', blocked = s === 'BLOCKED';
      cd -= dt; glitchT -= dt;
      if (work) k = (k + dt * 0.35) % 1;
      const p1 = work ? K.keyframes(ARM, k) : blocked ? [0.6 + Math.sin(t * 30) * 0.05, 0.4, 1.0] : [0.4 + Math.sin(t * 0.6) * 0.15, 0.3, 0.9];
      const p2 = work ? K.keyframes(ARM, (k + 0.5) % 1) : blocked ? [-0.6, 0.5, 1.1] : [-0.4, 0.3, 0.9];
      a1.yaw.rotation.y = p1[0] + 2.4; a1.sh.rotation.x = -p1[1]; a1.el.rotation.x = -p1[2]; a1.wr.rotation.x = p1[1] + p1[2] - 0.4;
      a2.yaw.rotation.y = -p2[0] - 0.6; a2.sh.rotation.x = -p2[1]; a2.el.rotation.x = -p2[2]; a2.wr.rotation.x = p2[1] + p2[2] - 0.4;
      core.rotation.y += dt * (work ? 1.5 : blocked ? 0 : 0.3);
      scanRing.position.y = work ? Math.sin(t * 3) * 0.3 : 0;
      crate.material.emissive.setHex(blocked ? (Math.sin(t * 12) > 0 ? 0x600010 : 0x200008) : work ? 0x40107a : 0x1a0844);
      crateEdge.material.color.setHex(blocked ? C.red : C.mag);
      if (work && cd <= 0) {
        cd = 0.05;
        for (const a of [a1, a2]) { a.tip.getWorldPosition(K.v3); g.worldToLocal(K.v3); K.spawn(g, K.v3.x, K.v3.y, K.v3.z, K.R() * 1.5, 0.5 + Math.random(), K.R() * 1.5, Math.random() < 0.5 ? C.cyan : C.white, 0.35, 0.04, 5, true); }
      }
      panes.forEach((P) => {
        P.tex.offset.y -= dt * (work ? 0.35 : 0.05);
        const red = blocked;
        const glitch = red && Math.sin(t * 40 + P.k) > 0.6;
        P.m.material.color.setHex(red ? C.red : 0xffffff);
        P.m.position.x = P.x + (glitch ? (Math.random() - 0.5) * 0.15 : 0);
        P.m.scale.y = glitch ? 0.6 + Math.random() * 0.6 : 1;
        P.m.material.opacity = s === 'IDLE' ? 0.45 : 0.95;
        P.fr.material.color.setHex(red ? C.red : P.color);
        P.m.position.y = P.y + Math.sin(t * 1.2 + P.k) * 0.05;
      });
      leds.forEach((L) => { const on = Math.sin(t * (work ? 9 : 2) + L.k * 7) > 0.2; L.m.material.color.setHex(blocked ? (Math.sin(t * 10) > 0 ? C.red : 0x220006) : on ? L.c : 0x101020); });
      roofStrip.material.color.setHex(blocked ? (Math.sin(t * 10) > 0 ? C.red : 0x220006) : C.white);
      roofStrip.material.opacity = s === 'IDLE' ? 0.4 : 0.9;
      lamps.forEach((L) => (L.m.material.opacity = (work && L.k === 'g') || (s === 'IDLE' && L.k === 'a') || (blocked && L.k === 'r' && Math.sin(t * 10) > 0) ? 1 : 0.12));
      strobe.intensity = blocked ? (Math.sin(t * 10) > 0 ? 3 : 0) : 0;
      cellLight.intensity = blocked ? 0.6 : s === 'IDLE' ? 1.2 : 2.2; cellLight.color.setHex(blocked ? C.red : 0x9fdcff);
      chips.forEach((c, i) => { c.position.z = work ? ((-1 + i * 0.7 + t * 0.4) % 2.1 + 2.1) % 2.1 - 1 : -1 + i * 0.7; c.visible = s !== 'IDLE'; });
    } };
  }

  // =====================================================================
  // SPLITTER: Spark's AI core tower routing light packets
  // =====================================================================
  function buildSplitter(K) {
    const g = K.group();
    baseSlab(K, g, 4.8, 4.8, C.violet);
    // hex plinth in tiers
    const tiers = [[1.9, 0.3], [1.55, 0.3], [1.2, 0.25]];
    let y = 0.25;
    tiers.forEach(([r, h], i) => { K.cyl(r, r + 0.08, h, K.mat(i % 2 ? 0x1c1d36 : 0x14132a, { shine: 50 }), 6, 0, y + h / 2, 0, g); const ring = K.torus(r + 0.02, 0.035, add(i === 2 ? C.cyan : C.violet, 0.9), 4, 6, 0, y + h, 0, g); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; y += h; });
    // four pylons that hold the orb
    const top = y;
    const pyl = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 1.05, z = Math.sin(a) * 1.05;
      const p = K.box(0.16, 3.2, 0.16, K.mat(0x22243e, { shine: 60 }), x, top + 1.6, z, g);
      K.box(0.04, 3.0, 0.04, add(C.violet, 0.9), x * 0.93, top + 1.6, z * 0.93, g);
      pyl.push(p);
    }
    K.cyl(1.25, 1.25, 0.12, K.mat(0x22243e), 6, 0, top + 3.25, 0, g);
    K.cyl(0.5, 0.2, 0.5, K.mat(0x14132a), 6, 0, top + 3.55, 0, g);
    const antenna = K.cyl(0.03, 0.03, 1.2, K.mat(0x55597a), 4, 0, top + 4.3, 0, g);
    const tipLight = K.box(0.12, 0.12, 0.12, add(C.red), 0, top + 4.95, 0, g);
    // the orb + shells
    const oy = top + 1.6;
    const orb = K.sph(0.5, add(0xff8af0), 0, oy, 0, g, 16, 12);
    K.sph(0.28, add(0xffffff), 0, oy, 0, g, 12, 8);
    const halo = K.sph(0.72, add(C.mag, 0.25), 0, oy, 0, g, 16, 12);
    const halo2 = K.sph(0.95, add(C.violet, 0.1), 0, oy, 0, g, 16, 12);
    const rings = [
      K.torus(0.95, 0.04, add(C.cyan), 4, 32, 0, oy, 0, g),
      K.torus(1.15, 0.035, add(C.mag), 4, 32, 0, oy, 0, g),
      K.torus(1.35, 0.03, add(C.violet), 4, 32, 0, oy, 0, g)
    ];
    // ring nodes
    rings.forEach((r, i) => { for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2; K.box(0.1, 0.1, 0.1, add(C.white), Math.cos(a) * r.geometry.parameters.radius, Math.sin(a) * r.geometry.parameters.radius, 0, r); } });
    const coreLight = K.light(C.mag, 2.5, 7, 0, oy, 0, g);
    // conduits: one intake from the back, three outputs to the front/right
    const path = (ang, inbound) => {
      const c = Math.cos(ang), sn = Math.sin(ang), P = (r, y) => [c * r, y, sn * r];
      const pts = [P(0.15, oy - 0.45), P(0.75, oy - 0.35), P(1.45, 1.6), P(1.85, 1.25), P(2.15, 0.75), P(2.25, 0.62)];
      return inbound ? pts.reverse() : pts;
    };
    const routes = [
      { pts: path(-3 * Math.PI / 4, true), c: C.white, inbound: true },
      { pts: path(Math.PI / 4), c: C.cyan },
      { pts: path(-0.25), c: C.mag },
      { pts: path(Math.PI / 2 + 0.25), c: C.amber }
    ];
    routes.forEach((r) => {
      r.curve = new T.CatmullRomCurve3(r.pts.map((p) => new T.Vector3(p[0], p[1], p[2])));
      K.mesh(new T.TubeGeometry(r.curve, 32, 0.09, 6, false), K.mat(0x2a2c50, { op: 0.55, shine: 80, depthWrite: false }), 0, 0, 0, g);
      K.mesh(new T.TubeGeometry(r.curve, 32, 0.035, 4, false), add(r.c, 0.75), 0, 0, 0, g);
      r.packets = [];
      for (let i = 0; i < 4; i++) r.packets.push({ m: K.box(0.17, 0.17, 0.17, add(r.inbound ? [C.cyan, C.mag, C.amber][i % 3] : r.c), 0, 0, 0, g), s: i / 4 });
    });
    // outlet docks at the end of each output
    const docks = routes.slice(1).map((r) => {
      const e = r.pts[r.pts.length - 1];
      const d = K.group(g, e[0] * 1.02, 0.26, e[2] * 1.02);
      K.box(0.5, 0.35, 0.5, K.mat(0x1c1d36, { shine: 40 }), 0, 0.17, 0, d);
      const lamp = K.box(0.52, 0.06, 0.52, add(r.c), 0, 0.36, 0, d);
      return { lamp, flash: 0 };
    });
    // intake hopper at the back
    const hop = K.group(g, -1.62, 0.26, -1.62);
    K.box(0.7, 0.5, 0.7, K.mat(0x1c1d36), 0, 0.25, 0, hop);
    K.box(0.72, 0.05, 0.72, add(C.white, 0.6), 0, 0.52, 0, hop);
    // hologram readout panel
    const readTex = codeTex(K, '#22e6ff', '#ff2bd6');
    const read = K.box(1.0, 0.6, 0.01, basicMap(readTex, { add: true, op: 0.85, fog: false, double: true }), 1.9, 1.5, 0.6, g); read.rotation.y = Math.PI / 2 - 0.3;
    const pv = new T.Vector3();
    return { g, update(t, dt, s) {
      const sort = s === 'SORTING';
      const sp = sort ? 1 : 0.15;
      rings[0].rotation.x += dt * 1.4 * sp + dt * 0.1; rings[0].rotation.y += dt * 0.8 * sp;
      rings[1].rotation.y += dt * 1.8 * sp + dt * 0.1; rings[1].rotation.z += dt * 0.6 * sp;
      rings[2].rotation.x -= dt * 0.9 * sp + dt * 0.05; rings[2].rotation.z += dt * 1.2 * sp;
      const pulse = 1 + Math.sin(t * (sort ? 7 : 2)) * (sort ? 0.12 : 0.05);
      orb.scale.setScalar(pulse); halo.scale.setScalar(pulse * (1 + 0.05 * Math.sin(t * 3)));
      halo.material.opacity = sort ? 0.35 : 0.18; halo2.material.opacity = sort ? 0.14 : 0.06;
      coreLight.intensity = sort ? 2.6 + Math.sin(t * 7) : 1.2;
      tipLight.visible = Math.sin(t * 3) > 0;
      routes.forEach((r, ri) => {
        r.packets.forEach((P, i) => {
          if (sort) P.s = (((P.s + Math.max(0, dt) * (r.inbound ? 0.45 : 0.55)) % 1) + 1) % 1;
          r.curve.getPointAt(P.s, pv); P.m.position.copy(pv);
          P.m.visible = sort || (r.inbound && i === 0);
          if (sort && !r.inbound && P.s > 0.97) docks[ri - 1].flash = 1;
        });
      });
      docks.forEach((d) => { d.flash = Math.max(0, d.flash - dt * 2.5); d.lamp.material.opacity = 0.35 + d.flash * 0.65; });
      readTex.offset.y -= dt * (sort ? 0.5 : 0.05);
      read.material.opacity = sort ? 0.85 : 0.35;
    } };
  }

  // =====================================================================
  // LAUNCH PAD: a mag-rail VTOL tower that fires the merged PR into the sky
  // =====================================================================
  function buildLaunch(K) {
    const g = K.group();
    baseSlab(K, g, 4.9, 4.9, C.amber);
    // octagonal pad with blast ring
    K.cyl(2.0, 2.15, 0.3, K.mat(0x1a1b30, { shine: 40 }), 8, 0.25, 0.4, 0.25, g);
    K.cyl(1.2, 1.2, 0.04, K.mat(0x06050e), 16, 0.25, 0.56, 0.25, g);
    const padRing = K.torus(1.45, 0.05, add(C.amber), 4, 32, 0.25, 0.57, 0.25, g); padRing.rotation.x = Math.PI / 2;
    const marks = [];
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const m = K.box(0.3, 0.02, 0.1, add(C.amber, 0.8), 0.25 + Math.cos(a) * 1.75, 0.56, 0.25 + Math.sin(a) * 1.75, g); m.rotation.y = -a; marks.push(m); }
    // mag-rail tower at the back-left
    const towerX = -1.7, towerZ = -1.7;
    const tw = K.group(g, towerX, 0.25, towerZ);
    K.box(0.9, 0.3, 0.9, K.mat(0x14132a), 0, 0.15, 0, tw);
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { K.box(0.12, 7.2, 0.12, K.mat(0x5a6090, { shine: 70, spec: 0x8888cc }), x, 3.75, z, tw); }
    K.box(0.03, 7.0, 0.03, add(C.mag, 0.8), 0.37, 3.75, -0.3, tw); K.box(0.03, 7.0, 0.03, add(C.mag, 0.8), -0.3, 3.75, 0.37, tw);
    K.box(0.8, 0.3, 0.8, K.mat(0x2a2c44), 0, 7.35, 0, tw);
    for (let y = 0.6; y < 7.4; y += 0.6) { const b = K.box(0.62, 0.05, 0.05, K.mat(0x4a4f72), 0, y, 0.3, tw); const b2 = K.box(0.05, 0.05, 0.62, K.mat(0x4a4f72), 0.3, y, 0, tw); b.rotation.z = 0.5; b2.rotation.x = 0.5; }
    const railLights = [];
    for (let i = 0; i < 12; i++) railLights.push(K.box(0.08, 0.3, 0.08, add(C.cyan), 0.36, 0.6 + i * 0.55, 0.36, tw));
    // the arm that clamps the craft
    const armG = K.group(tw, 0, 4.4, 0);
    const armBar = K.box(2.2, 0.14, 0.2, K.mat(0x2a2c44, { shine: 60 }), 1.1, 0, 1.1, armG); armBar.rotation.y = -Math.PI / 4;
    K.box(2.2, 0.03, 0.03, add(C.mag), 1.1, -0.09, 1.1, armG).rotation.y = -Math.PI / 4;
    // top beacon + floodlights
    const beaconG = K.group(tw, 0, 7.5, 0);
    K.cyl(0.14, 0.18, 0.1, K.mat(0x14132a), 8, 0, 0, 0, beaconG);
    const bRot = K.group(beaconG, 0, 0.12, 0);
    const bLamp = K.box(0.3, 0.1, 0.06, add(C.amber), 0.12, 0, 0, bRot);
    const bCone = K.cone(0.4, 2.2, add(C.amber, 0.12), 8, 1.2, 0, 0, bRot); bCone.rotation.z = Math.PI / 2;
    // corner warning beacons on the slab
    const warn = [[2.1, 2.1], [2.1, -1.4], [-1.4, 2.1]].map(([x, z]) => {
      K.cyl(0.12, 0.15, 0.2, K.mat(0x14132a), 8, x, 0.35, z, g);
      const rot = K.group(g, x, 0.5, z);
      const lamp = K.box(0.18, 0.1, 0.06, add(C.red), 0.07, 0, 0, rot);
      const beam = K.cone(0.25, 1.4, add(C.red, 0.3), 8, 0.75, 0, 0, rot); beam.rotation.z = Math.PI / 2;
      return { rot, lamp, beam };
    });
    // the craft: sleek VTOL rocket built from a lathe profile
    const craft = K.group(g, 0.25, 0.58, 0.25);
    const bodyM = K.mat(0xaab0cc, { shine: 70, spec: 0x555577 });
    K.lathe([[0, 0], [0.42, 0.05], [0.5, 0.4], [0.5, 2.4], [0.44, 3.0], [0.3, 3.5], [0.12, 3.85], [0, 3.95]], bodyM, 16, 0, 0.35, 0, craft);
    K.cyl(0.505, 0.505, 0.16, K.mat(0x14132a), 16, 0, 1.2, 0, craft);
    K.cyl(0.505, 0.505, 0.05, add(C.mag), 16, 0, 1.32, 0, craft);
    K.cyl(0.505, 0.505, 0.05, add(C.cyan), 16, 0, 2.5, 0, craft);
    K.box(0.4, 0.2, 0.05, add(C.cyan, 0.9), 0, 2.85, 0.44, craft);
    for (let i = 0; i < 4; i++) {
      const fin = K.group(craft, 0, 0.6, 0); fin.rotation.y = i * Math.PI / 2 + Math.PI / 4;
      const f = K.box(0.08, 0.9, 0.55, K.mat(0x14132a, { shine: 60 }), 0, 0.2, 0.62, fin); f.rotation.x = -0.25;
      K.box(0.09, 0.6, 0.04, add(C.mag), 0, 0.2, 0.9, fin);
    }
    K.cyl(0.3, 0.38, 0.35, K.mat(0x2a2c44), 12, 0, 0.18, 0, craft);
    // plume
    const plume = K.group(craft, 0, 0, 0);
    const pc1 = K.cone(0.42, 2.6, add(0xfff0d0, 0.95), 12, 0, -1.3, 0, plume); pc1.rotation.x = Math.PI;
    const pc2 = K.cone(0.7, 4.2, add(C.cyan, 0.5), 12, 0, -2.1, 0, plume); pc2.rotation.x = Math.PI;
    const pc3 = K.cone(1.0, 5.5, add(C.mag, 0.25), 12, 0, -2.75, 0, plume); pc3.rotation.x = Math.PI;
    plume.visible = false;
    const flare = K.light(0xffd8a0, 0, 12, 0.25, 1, 0.25, g);
    const padKey = K.light(0xb0a0ff, 0.9, 7, 1.8, 3.0, 2.0, g);
    // vapor vents around the pad
    const vents = [[-1.2, 1.9], [1.9, -1.2], [1.9, 1.9]];
    let seq = 0, cd = 0;
    return { g, update(t, dt, s) {
      cd -= dt;
      const count = s === 'COUNTDOWN', launch = s === 'LAUNCH';
      // beacons spin in countdown + launch
      const spin = count || launch;
      warn.forEach((w) => { w.rot.rotation.y += dt * (spin ? 7 : 0); w.lamp.material.color.setHex(count ? C.amber : C.red); w.beam.material.color.setHex(count ? C.amber : C.red); w.beam.visible = spin; w.lamp.material.opacity = spin ? 1 : 0.25; });
      bRot.rotation.y += dt * (spin ? 5 : 0.8);
      bCone.visible = spin;
      // rail lights: chase up the tower while charging
      railLights.forEach((m, i) => {
        if (count) m.material.color.setHex(((Math.floor(t * 12) - i) % 12 + 12) % 12 < 3 ? C.white : C.cyan);
        else if (launch) m.material.color.setHex(C.white);
        else m.material.color.setHex(Math.sin(t * 2 + i * 0.5) > 0.6 ? C.cyan : 0x0a3040);
      });
      padRing.material.color.setHex(count ? (Math.sin(t * 10) > 0 ? C.amber : C.red) : launch ? C.white : C.amber);
      marks.forEach((m, i) => (m.material.opacity = count ? ((Math.floor(t * 8) + i) % 8 < 2 ? 1 : 0.2) : 0.6));
      if (count && cd <= 0) { cd = 0.09; vents.forEach(([x, z]) => K.spawn(g, x, 0.4, z, K.R() * 0.5, 0.6 + Math.random() * 0.6, K.R() * 0.5, 0x5a5a90, 1.1, 0.07, -0.25)); }
      // launch sequence
      if (launch) {
        seq += dt;
        const p = seq;
        let y = 0;
        if (p < 0.7) y = 0; else y = Math.pow(p - 0.7, 2) * 9;
        craft.position.y = 0.58 + y;
        craft.position.x = 0.25 + (p < 0.7 ? Math.sin(t * 60) * 0.02 : 0);
        armG.rotation.y = Math.min(1, p * 2) * -1.0;
        plume.visible = true;
        const f = 0.85 + Math.random() * 0.3;
        plume.scale.set(f * (y < 1 ? 1.3 : 1), Math.min(1.3, 0.12 + y * 0.35) * f, f * (y < 1 ? 1.3 : 1));
        flare.intensity = 4 + Math.random() * 2;
        if (cd <= 0) {
          cd = 0.02;
          for (let i = 0; i < 4; i++) K.spawn(g, 0.25 + K.R() * 0.4, 0.5 + Math.max(0, y - 0.5), 0.25 + K.R() * 0.4, K.R() * 6, Math.random() * 0.6, K.R() * 6, Math.random() < 0.5 ? 0xd8dcff : 0x8a8ab0, 1.6, 0.22, -0.4);
          if (y > 1.5) K.spawn(g, 0.25 + K.R() * 0.2, 0.3 + y, 0.25 + K.R() * 0.2, K.R(), -2 - Math.random() * 2, K.R(), Math.random() < 0.5 ? C.amber : C.white, Math.min(0.5, (y - 0.5) / 4), 0.08, 0, true);
        }
        if (p > 4.2) seq = 0;
        craft.visible = y < 60;
      } else {
        seq = 0; craft.position.set(0.25, 0.58, 0.25); craft.visible = true; plume.visible = false;
        armG.rotation.y = count ? -0.15 : 0;
        flare.intensity = count ? 0.4 + Math.sin(t * 10) * 0.3 : 0;
      }
    } };
  }

  SHIP.register({
    id: 'neon', name: 'NEON TOKYO', eyebrow: 'FUTURE CITY', accent: '#ff2bd6',
    pitch: 'A rain-soaked rooftop landing deck in a night megacity. Towers with thousands of lit windows, vertical signs in invented glyphs, hover cars streaking through traffic lanes, a monorail sliding past. The machines are glass robotics cells, an AI core and a mag-rail launch tower.',
    palette: PAL,
    keywords: ['RAIN', 'NEON GLYPHS', 'HOVER TRAFFIC', 'HOLOGRAMS', 'WET REFLECTIONS', 'BLOOM'],
    sky: { top: '#05020f', bottom: '#2a0a3a', fog: '#1a0830', fogNear: 62, fogFar: 120 },
    light: { sun: 0x9aa8ff, sunI: 0.6, sunDir: [6, 22, 16], hemiSky: 0x6a4ad0, hemiGnd: 0x12062a, hemiI: 0.85 },
    finish: { levels: 40, dither: 0.12, outline: 0.45, thresh: 0.08, ink: '#05020c', sat: 1.15, contrast: 1.08, bloom: 0.9, bloomThresh: 0.55, vignette: 0.45, grade: 0.35, shadow: '#2a0a60', high: '#ffd6f4', scan: 0.05 },
    world,
    components: [
      { id: 'assembler', name: 'ASSEMBLER', blurb: 'A coding agent building a PR: a glass robotics cell where two arms assemble the change under scrolling holo-code, fed by a blinking server rack.', states: ['IDLE', 'WORKING', 'BLOCKED'], build: buildAssembler },
      { id: 'splitter', name: 'SPLITTER · SPARK', blurb: 'Spark triaging feedback: an AI core tower with a pulsing orb inside gyroscope rings, pulling light packets in and routing them out along three neon conduits.', states: ['IDLE', 'SORTING'], build: buildSplitter },
      { id: 'launch', name: 'LAUNCH PAD', blurb: 'A merged PR shipping: a mag-rail tower that charges up, spins its beacons and fires the craft into the rain.', states: ['IDLE', 'COUNTDOWN', 'LAUNCH'], build: buildLaunch }
    ]
  });
})();
