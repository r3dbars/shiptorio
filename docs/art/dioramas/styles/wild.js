// WILDWOOD: an ancient forest glade at golden hour. Machines are grown, not built.
(function () {
  'use strict';
  const C = {
    barkD: 0x2e2118, bark: 0x4a3423, barkL: 0x6b4c31, barkHi: 0x8a6842,
    moss: 0x4c6a26, mossL: 0x78923a, mossD: 0x2f4a1c,
    leafD: 0x1d3a22, leaf: 0x2c5a2a, leafM: 0x3f7a30, leafL: 0x6e9a3a, leafGold: 0xc0a03a,
    stoneD: 0x45433d, stone: 0x6b685e, stoneL: 0x918b7a,
    water: 0x3a7d86, waterL: 0x9ad8cc,
    gGreen: 0xa8ff7a, gGold: 0xffd56a, gCyan: 0x7ff0e0, gRed: 0xff4a32, petal: 0xe9c9a0, petalPink: 0xe8a2a0
  };
  const TAU = Math.PI * 2;

  // ---------- small shared growers ----------
  function grassTex(K) {
    return K.canvasTex(32, 32, (g) => {
      g.fillStyle = '#44521f'; g.fillRect(0, 0, 32, 32);
      const cols = ['#3c4a1c', '#4c5a24', '#525e26', '#384419', '#5a6428'];
      for (let i = 0; i < 90; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(Math.floor(K.rnd() * 16) * 2, Math.floor(K.rnd() * 16) * 2, 2, 2); }
      if (K.rnd() < 0.5) { g.fillStyle = '#7a7032'; g.fillRect(Math.floor(K.rnd() * 16) * 2, Math.floor(K.rnd() * 16) * 2, 2, 2); }
    });
  }
  function cliffTex(K) {
    return K.canvasTex(32, 64, (g) => {
      g.fillStyle = '#6a5440'; g.fillRect(0, 0, 32, 64);
      for (let y = 6; y < 64; y += 7 + Math.floor(K.rnd() * 6)) { g.fillStyle = '#8a7e68'; g.fillRect(0, y, 32, 3); g.fillStyle = '#4a3a2a'; g.fillRect(0, y + 3, 32, 1); }
      for (let i = 0; i < 40; i++) { g.fillStyle = K.rnd() < 0.5 ? '#9a8e74' : '#4a3a2a'; g.fillRect(Math.floor(K.rnd() * 16) * 2, Math.floor(K.rnd() * 32) * 2, 2, 2); }
      g.fillStyle = '#4c6a26'; g.fillRect(0, 0, 32, 4);
      for (let i = 0; i < 9; i++) { const x = Math.floor(K.rnd() * 15) * 2; g.fillStyle = i % 2 ? '#3a5420' : '#56762b'; g.fillRect(x, 4, 2, 4 + Math.floor(K.rnd() * 14)); }
      for (let i = 0; i < 4; i++) { const x = Math.floor(K.rnd() * 15) * 2; g.fillStyle = '#2a1e14'; g.fillRect(x, 6, 1, 10 + Math.floor(K.rnd() * 18)); }
    });
  }
  function waterTex(K) {
    return K.canvasTex(16, 32, (g) => {
      g.fillStyle = '#3a7d86'; g.fillRect(0, 0, 16, 32);
      for (let i = 0; i < 14; i++) { g.fillStyle = i % 3 ? '#57a0a2' : '#a8e2d6'; g.fillRect(Math.floor(K.rnd() * 8) * 2, Math.floor(K.rnd() * 16) * 2, 4, 2); }
      g.fillStyle = '#2e6670'; for (let i = 0; i < 8; i++) g.fillRect(Math.floor(K.rnd() * 8) * 2, Math.floor(K.rnd() * 16) * 2, 2, 2);
    });
  }
  function fallTex(K) {
    return K.canvasTex(16, 32, (g) => {
      g.fillStyle = '#6fb8b4'; g.fillRect(0, 0, 16, 32);
      for (let x = 0; x < 16; x += 2) { const n = 2 + Math.floor(K.rnd() * 4); for (let k = 0; k < n; k++) { g.fillStyle = K.rnd() < 0.5 ? '#e6fbf2' : '#3f8a8e'; g.fillRect(x, Math.floor(K.rnd() * 28), 2, 4 + Math.floor(K.rnd() * 6)); } }
    });
  }
  // a mossy boulder: rock + moss cap
  function boulder(K, p, x, z, r, y) {
    const b = K.rock(r, K.rnd() < 0.5 ? C.stone : C.stoneD, x, (y || 0) + r * 0.55, z, p); b.rotation.set(K.rnd() * 3, K.rnd() * 3, K.rnd() * 3); b.scale.y = 0.75;
    const m = K.rock(r * 0.78, K.rnd() < 0.5 ? C.moss : C.mossL, x, (y || 0) + r * 0.95, z, p); m.scale.set(1, 0.38, 1); m.rotation.y = K.rnd() * 3;
    return b;
  }
  function fern(K, p, x, z, s, col) {
    const g = K.group(p, x, 0, z); g.scale.setScalar(s || 1); g.rotation.y = K.rnd() * TAU;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, f = K.group(g, 0, 0.05, 0); f.rotation.y = a;
      const fr = K.group(f); fr.rotation.x = -0.75 - K.rnd() * 0.3;
      K.box(0.14, 0.03, 0.75, col || (i % 2 ? C.leafM : C.leaf), 0, 0, 0.38, fr);
      K.box(0.3, 0.03, 0.08, col || C.leafL, 0, 0.01, 0.42, fr);
      K.box(0.22, 0.03, 0.08, col || C.leafM, 0, 0.01, 0.6, fr);
    }
    return g;
  }
  function mushroom(K, p, x, z, s, glowing) {
    const g = K.group(p, x, 0, z); g.scale.setScalar(s);
    K.cyl(0.07, 0.1, 0.42, 0xd9ccb0, 6, 0, 0.21, 0, g);
    const cap = glowing ? K.mat(0x3a8a86, { e: 0x2fd8c8, ei: 0.9 }) : K.mat(0x9a3a22);
    const c = K.cone(0.28, 0.2, cap, 8, 0, 0.5, 0, g);
    if (!glowing) for (let i = 0; i < 3; i++) K.box(0.05, 0.03, 0.05, 0xf0e2c0, Math.cos(i * 2.1) * 0.15, 0.5, Math.sin(i * 2.1) * 0.15, g);
    return c;
  }
  function tuft(K, p, x, z, s, tufts) {
    const g = K.group(p, x, 0, z); g.scale.setScalar(s);
    for (let i = 0; i < 4; i++) { const b = K.cone(0.05, 0.5 + K.rnd() * 0.3, i % 2 ? C.mossL : C.leafM, 4, Math.cos(i * 1.7) * 0.08, 0.28, Math.sin(i * 1.7) * 0.08, g); b.rotation.set((K.rnd() - 0.5) * 0.5, 0, (K.rnd() - 0.5) * 0.5); }
    tufts.push({ g, k: K.rnd() * 6 });
    return g;
  }
  // a cluster-crown of faceted leaf blobs, darker below and gold-lit on top
  function crown(K, p, x, y, z, r, n) {
    const g = K.group(p, x, y, z);
    for (let i = 0; i < n; i++) {
      const a = K.rnd() * TAU, d = K.rnd() * r, h = (K.rnd() - 0.3) * r * 0.6;
      const tier = h / r;
      const col = tier > 0.15 ? (K.rnd() < 0.35 ? C.leafL : C.leafM) : tier > -0.05 ? C.leaf : C.leafD;
      const b = K.rock(r * (0.38 + K.rnd() * 0.3), col, Math.cos(a) * d, h, Math.sin(a) * d * 0.85, g);
      b.rotation.set(K.rnd() * 3, K.rnd() * 3, 0); b.scale.y = 0.72;
    }
    for (let i = 0; i < Math.ceil(n / 3); i++) { const a = K.rnd() * TAU; const b = K.rock(r * 0.28, C.leafGold, Math.cos(a) * r * 0.5, r * 0.35, Math.sin(a) * r * 0.45, g); b.scale.y = 0.6; }
    return g;
  }
  // a gnarled tree: tapered lathe trunk, root flares, crooked branches to crowns
  function bigTree(K, p, x, z, h, r, crowns) {
    const g = K.group(p, x, 0, z);
    K.lathe([[r * 1.7, 0], [r * 1.2, 0.4], [r, 1.2], [r * 0.85, h * 0.5], [r * 0.7, h * 0.85], [r * 0.55, h], [0, h + 0.1]], K.mat(C.bark), 9, 0, 0, 0, g);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + K.rnd() * 0.5;
      K.tube([[Math.cos(a) * r * 0.8, 1.4, Math.sin(a) * r * 0.8], [Math.cos(a) * r * 1.5, 0.5, Math.sin(a) * r * 1.5], [Math.cos(a) * r * 2.6, 0.02, Math.sin(a) * r * 2.6]], r * 0.28, C.barkD, g, 10, 5);
    }
    for (let i = 0; i < 5; i++) K.box(0.1, h * 0.6, 0.1, C.barkD, Math.cos(i * 1.3) * r * 0.9, h * 0.35, Math.sin(i * 1.3) * r * 0.9, g);
    K.rock(r * 0.9, C.moss, r * 0.4, 0.6, r * 0.5, g).scale.set(0.9, 0.35, 0.6);
    (crowns || []).forEach(([cx, cy, cz, cr, n]) => {
      K.tube([[0, h * 0.7, 0], [cx * 0.5, cy - 1, cz * 0.5], [cx, cy - 0.3, cz]], r * 0.3, C.bark, g, 10, 5);
      crown(K, g, cx, cy, cz, cr, n || 9);
      for (let k = 0; k < 4; k++) K.box(0.06, 0.6 + K.rnd() * 1.2, 0.06, 0x6c7a40, cx + (K.rnd() - 0.5) * cr, cy - cr * 0.5 - 0.5, cz + (K.rnd() - 0.5) * cr, g);
    });
    return g;
  }

  // =====================================================================
  // WORLD
  // =====================================================================
  function world(K, root) {
    const tufts = [], flies = [], birds = [], rays = [];
    const grass = grassTex(K); grass.repeat.set(17, 8);
    const cliff = cliffTex(K); cliff.repeat.set(17, 2);
    const cliffS = cliffTex(K); cliffS.repeat.set(8, 2);
    const top = K.mat(0xffffff, { map: grass }), side = K.mat(0xffffff, { map: cliff }), sideS = K.mat(0xffffff, { map: cliffS });
    // the plateau: front edge is a cliff the river falls off
    K.box(34, 8, 16, [sideS, sideS, top, side, side, side], 0, -4, -2, root);
    // a lower ledge under the left half of the cliff
    K.box(12, 2, 3, [sideS, sideS, K.mat(0xffffff, { map: grass }), side, side, side], -9, -6.5, 7.4, root);
    // back hills that rise toward the far forest
    const hillTop = K.mat(0xffffff, { map: (() => { const t = grassTex(K); t.repeat.set(20, 6); return t; })() });
    K.box(44, 6, 14, [sideS, sideS, hillTop, side, side, side], 0, -2.2, -17, root);
    K.box(50, 8, 20, [sideS, sideS, hillTop, side, side, side], 0, -1, -34, root);
    // distant mountains in the haze
    [[-30, -70, 22, 9], [-6, -80, 30, 11], [22, -72, 24, 10], [40, -60, 16, 8]].forEach(([x, z, h, r]) => {
      const m = K.cone(r * 2, h, 0x5f6f7e, 7, x, h / 2 - 2, z, root); m.rotation.y = K.rnd();
      K.cone(r * 0.7, h * 0.32, 0x8e9aa4, 7, x, h - 2 - h * 0.16, z, root).rotation.y = m.rotation.y;
    });

    // ---- the river: from the back hills, between the splitter and the launch pad, off the cliff ----
    const wt = waterTex(K); wt.repeat.set(1, 8);
    const wmat = K.mat(0x9ab8b4, { map: wt, e: 0x06181c, ei: 1, shine: 40, spec: 0x2a3a3a });
    const rx = 4.2;
    K.box(1.8, 0.1, 16.2, wmat, rx, 0.02, -2, root);
    const wt2 = waterTex(K); wt2.repeat.set(1, 5);
    K.box(1.8, 0.1, 10, K.mat(0x9ab8b4, { map: wt2, e: 0x06181c, ei: 1 }), rx - 0.6, 0.85, -14.5, root).rotation.y = 0.12;
    // a small cascade off the back hill
    const ft0 = fallTex(K); ft0.repeat.set(1, 1);
    K.box(1.8, 1.2, 0.2, K.mat(0xc8dcd6, { map: ft0, e: 0x183a3a, ei: 1 }), rx - 0.2, 0.4, -9.9, root);
    for (let z = -9; z < 6; z += 0.9) for (const sx of [-1, 1]) boulder(K, root, rx + sx * (1.05 + K.rnd() * 0.2), z + K.rnd() * 0.5, 0.22 + K.rnd() * 0.18, -0.1);
    // waterfall sheet + spray
    const ft = fallTex(K); ft.repeat.set(1, 3);
    const fall = K.box(1.8, 9, 0.25, K.mat(0xc8dcd6, { map: ft, e: 0x183a3a, ei: 1 }), rx, -4.4, 6.1, root);
    const lip = K.box(2.0, 0.2, 0.6, K.mat(0xa8e2d6, { e: 0x3a7070 }), rx, 0.0, 5.95, root);
    for (let i = 0; i < 26; i++) {
      const x = -15 + i * 1.18 + K.rnd() * 0.5; if (Math.abs(x - rx) < 1.2) continue;
      const h = 0.8 + K.rnd() * 2.6;
      K.box(0.12, h, 0.08, i % 3 ? C.moss : C.mossL, x, -h / 2, 6.06, root);
      if (i % 4 === 0) K.tube([[x + 0.3, 0, 6.0], [x + 0.5, -0.8, 6.15], [x + 0.2, -1.8, 6.1]], 0.07, C.barkD, root, 6, 4);
    }
    // ---- ruins: a broken arch and fallen pillars, swallowed by moss ----
    const ruin = K.group(root, -12.6, 0, -3.2); ruin.rotation.y = 0.35;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) K.box(0.9, 0.85, 0.9, i % 2 ? C.stone : C.stoneL, sx * 1.3, 0.43 + i * 0.86, 0, ruin).rotation.y = (K.rnd() - 0.5) * 0.12;
    }
    K.box(3.6, 0.6, 1.0, C.stoneL, -0.35, 3.75, 0, ruin).rotation.z = -0.08;
    K.box(3.7, 0.25, 1.1, C.moss, -0.35, 4.13, 0, ruin).rotation.z = -0.08;
    for (let i = 0; i < 6; i++) K.box(0.06, 0.8 + K.rnd(), 0.06, C.mossL, -1.6 + i * 0.6, 3.0, 0.52, ruin);
    const fallen = K.cyl(0.42, 0.42, 2.6, C.stone, 10, 2.6, 0.42, 1.4, ruin); fallen.rotation.z = Math.PI / 2; fallen.rotation.y = 0.5;
    K.cyl(0.45, 0.45, 0.9, C.moss, 10, 2.2, 0.48, 1.25, ruin).rotation.set(0, 0.5, Math.PI / 2);
    // a stone stair and pillar stubs on the right
    const r2 = K.group(root, 12.6, 0, -2.2);
    for (let i = 0; i < 3; i++) K.box(2.4 - i * 0.5, 0.3, 1.0, i % 2 ? C.stone : C.stoneL, 0, 0.15 + i * 0.3, -i * 0.5, r2);
    for (const [px, pz, ph] of [[-1.6, 1.4, 1.8], [1.5, 1.6, 1.0], [1.6, -1.6, 2.6]]) { K.cyl(0.36, 0.42, ph, C.stoneL, 8, px, ph / 2, pz, r2); K.cyl(0.38, 0.38, 0.2, C.moss, 8, px, ph + 0.05, pz, r2); }

    // ---- the old forest behind ----
    // a wall of old trees closing the glade: crowns low enough to fill the top of the frame
    [[-15.5, -7.5, 4.2, 0.8], [-11.5, -9.2, 4.8, 1.0], [-7.2, -8.4, 4.0, 0.75], [-3.6, -10.2, 5.2, 1.15], [0.8, -8.8, 4.4, 0.85], [6.6, -9.6, 5.0, 1.0], [10.8, -8.2, 4.2, 0.8], [15, -7.2, 4.6, 0.9]]
      .forEach(([x, z, h, r], i) => {
        const s1 = i % 2 ? 1 : -1;
        bigTree(K, root, x, z, h, r, [[-1.4 * s1, h + 0.6, 0.6, 2.3, 12], [1.6 * s1, h + 1.3, -0.2, 2.2, 11], [0.2, h + 2.3, 0.2, 1.7, 8]]);
      });
    for (let i = 0; i < 9; i++) {
      const x = -16 + i * 4 + K.rnd() * 1.5, z = -12.5 - K.rnd() * 2;
      K.cyl(0.35, 0.5, 4, C.barkD, 6, x, 2, z, root);
      crown(K, root, x, 4.6 + K.rnd(), z, 2.2 + K.rnd() * 0.6, 8);
    }
    // undergrowth along the forest edge
    for (let i = 0; i < 16; i++) fern(K, root, -15 + i * 2 + K.rnd(), -6.4 - K.rnd() * 1.2, 1.1 + K.rnd() * 0.6, i % 3 ? null : C.mossL);
    // leaf litter and moss patches to break the ground up
    for (let i = 0; i < 22; i++) {
      const x = -15 + K.rnd() * 30, z = -6 + K.rnd() * 11.5;
      if (Math.abs(x - 4.2) < 1.3) continue;
      if ([-8, 0, 8].some((sx) => Math.abs(x - sx) < 3.4 && Math.abs(z) < 3.4)) continue;
      const pc = K.cyl(0.6 + K.rnd() * 1.2, 0.6 + K.rnd() * 1.2, 0.03, [0x4e4a22, 0x33421a, 0x56521f, 0x3a4a1c][i % 4], 7, x, 0.015 + i * 0.0005, z, root);
      pc.scale.z = 0.6 + K.rnd() * 0.5; pc.rotation.y = K.rnd() * 3;
    }
    // ---- clearing dressing ----
    [[-12.5, 2.2, 0.7], [-4.2, 3.6, 0.45], [-4.8, -2.8, 0.6], [2.8, 3.8, 0.4], [11.2, 2.8, 0.55], [12.6, 4.4, 0.4], [-13.8, 4.6, 0.5], [6.2, -4.2, 0.55], [-1.5, -4.4, 0.7], [14.5, 0.4, 0.6]]
      .forEach(([x, z, r]) => boulder(K, root, x, z, r));
    [[-11.2, 4.4, 1.1], [-3.8, 4.8, 0.9], [-5.6, -4.6, 1.2], [3.2, -5, 0.8], [10.8, 4.8, 1.0], [13.4, -3.5, 1.2], [-14.2, -0.6, 1.0], [6.4, 3.6, 0.8], [-1, 4.9, 0.8], [1.4, -6, 1.0]]
      .forEach(([x, z, s]) => fern(K, root, x, z, s));
    for (let i = 0; i < 110; i++) {
      const x = -15 + K.rnd() * 30, z = -7 + K.rnd() * 12.6;
      if (Math.abs(x - rx) < 1.4) continue;
      if ([-8, 0, 8].some((sx) => Math.abs(x - sx) < 2.6 && Math.abs(z) < 2.6)) continue;
      tuft(K, root, x, z, 0.7 + K.rnd() * 0.6, tufts);
    }
    const glowCaps = [];
    [[-4.6, -3.4, 0.9, 1], [-4.1, -3.0, 0.6, 1], [-5.0, -2.8, 0.5, 1], [5.6, -3.6, 0.8, 1], [6.0, -3.2, 0.55, 1], [-12, 1.2, 0.9, 0], [-11.6, 1.6, 0.6, 0], [12.2, 3.6, 0.8, 0], [-2.8, 4.2, 0.6, 1], [13.6, -1.4, 0.7, 1]]
      .forEach(([x, z, s, gl]) => { const c = mushroom(K, root, x, z, s, !!gl); if (gl) glowCaps.push(c); });
    K.light(0x5ff0d8, 1.2, 5, -4.6, 0.8, -3.1, root);
    K.light(0x5ff0d8, 1.0, 5, 5.8, 0.8, -3.4, root);

    // ---- light shafts through the canopy ----
    [[-7, -5, 0.5, 0.09], [-0.5, -6, 0.45, 0.07], [6, -6, 0.5, 0.08], [11, -3, 0.42, 0.06], [-13, -2, 0.55, 0.06]].forEach(([x, z, rot, op], i) => {
      const m = K.glow(0xffd88a, op, true);
      const pl = K.mesh(new THREE.PlaneGeometry(1.6 + (i % 2), 18), m, x, 6, z, root); pl.rotation.z = rot; pl.renderOrder = 5;
      rays.push({ m, op, k: i * 1.7 });
    });
    // ---- fireflies / pollen motes ----
    for (let i = 0; i < 46; i++) {
      const m = K.box(0.07, 0.07, 0.07, K.glow(i % 3 ? 0xffe28a : 0xc8ff8a, 1, true), 0, 0, 0, root);
      flies.push({ m, x: -14 + K.rnd() * 28, y: 0.4 + K.rnd() * 4, z: -6 + K.rnd() * 11, k: K.rnd() * 10, s: 0.3 + K.rnd() * 0.6 });
    }
    // ---- birds circling high over the canopy ----
    for (let i = 0; i < 5; i++) {
      const b = K.group(root);
      const wl = K.group(b), wr = K.group(b);
      K.box(0.5, 0.04, 0.16, 0x1c1814, -0.25, 0, 0, wl); K.box(0.5, 0.04, 0.16, 0x1c1814, 0.25, 0, 0, wr);
      K.box(0.12, 0.08, 0.3, 0x1c1814, 0, 0, 0, b);
      birds.push({ b, wl, wr, r: 5 + K.rnd() * 6, y: 9 + K.rnd() * 3, k: K.rnd() * 6, s: 0.25 + K.rnd() * 0.15, cx: -4 + K.rnd() * 8, cz: -6 - K.rnd() * 4 });
    }
    let leafT = 0, mistT = 0;
    return {
      update(t, dt) {
        dt = Math.max(0, dt);
        wt.offset.y -= dt * 0.35; wt2.offset.y -= dt * 0.3; ft.offset.y += dt * 1.4; ft0.offset.y += dt * 1.1;
        lip.scale.y = 1 + Math.sin(t * 9) * 0.15;
        tufts.forEach((u) => { u.g.rotation.z = Math.sin(t * 1.3 + u.k) * 0.12; u.g.rotation.x = Math.cos(t * 1.1 + u.k) * 0.06; });
        flies.forEach((f) => { f.m.position.set(f.x + Math.sin(t * f.s + f.k) * 1.2, f.y + Math.sin(t * f.s * 1.7 + f.k) * 0.5, f.z + Math.cos(t * f.s * 0.9 + f.k) * 0.8); f.m.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + f.k * 3)); });
        birds.forEach((b) => { const a = t * b.s + b.k; b.b.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(a * 2) * 0.4, b.cz + Math.sin(a) * b.r * 0.6); b.b.rotation.y = -a; const fl = Math.sin(t * 9 + b.k) * 0.6; b.wl.rotation.z = fl; b.wr.rotation.z = -fl; });
        rays.forEach((r) => (r.m.opacity = r.op * (0.6 + 0.4 * Math.sin(t * 0.4 + r.k))));
        glowCaps.forEach((c, i) => (c.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 1.5 + i)));
        leafT -= dt; mistT -= dt;
        if (leafT <= 0) { leafT = 0.35; K.spawn(root, -14 + Math.random() * 28, 8 + Math.random() * 3, -8 + Math.random() * 6, 0.4 + K.R() * 0.4, -0.7, 0.3, Math.random() < 0.5 ? C.leafGold : 0xb06a2a, 14, 0.12, 0); }
        if (mistT <= 0) { mistT = 0.05; K.spawn(root, rx + K.R() * 1.6, -6.5 + Math.random(), 6.4 + Math.random() * 0.6, K.R() * 0.6, 0.9 + Math.random() * 0.6, 0.4, 0xdff4ee, 1.6, 0.22, -0.3); }
      }
    };
  }

  // =====================================================================
  // ASSEMBLER: the Root Loom
  // =====================================================================
  function rootArm(K, p, x, y, z, ry) {
    const sh = K.group(p, x, y, z); sh.rotation.y = ry;
    const tilt = K.group(sh);
    K.sph(0.2, C.barkD, 0, 0, 0, tilt, 7, 5);
    K.cyl(0.11, 0.17, 1.5, C.bark, 6, 0, 0.75, 0, tilt);
    K.box(0.08, 0.5, 0.2, C.moss, 0.1, 0.6, 0, tilt);
    const el = K.group(tilt, 0, 1.5, 0);
    K.sph(0.14, C.barkD, 0, 0, 0, el, 7, 5);
    K.cyl(0.06, 0.11, 1.2, C.barkL, 6, 0, 0.6, 0, el);
    const tip = K.group(el, 0, 1.25, 0);
    const bud = K.sph(0.13, K.glow(C.gGreen), 0, 0, 0, tip, 8, 6);
    K.cone(0.08, 0.22, C.leafL, 5, 0.1, -0.08, 0, tip).rotation.z = -0.9;
    K.cone(0.08, 0.22, C.leafL, 5, -0.1, -0.08, 0, tip).rotation.z = 0.9;
    return { sh, tilt, el, tip, bud };
  }
  function buildAssembler(K) {
    const g = K.group();
    // living ground: mossy root mat
    K.cyl(2.4, 2.5, 0.12, C.mossD, 12, 0, 0.06, 0, g);
    K.cyl(2.1, 2.2, 0.06, C.moss, 12, 0.1, 0.13, 0.1, g);
    // the hollow stump
    const sx = -0.95, sz = 0.55;
    const stump = K.group(g, sx, 0, sz);
    K.lathe([[1.45, 0], [1.38, 0.3], [1.22, 1.0], [1.18, 1.9], [1.26, 2.25], [1.12, 2.3], [0.98, 2.1], [0.92, 1.2], [0.9, 0.4]], K.mat(C.bark, { double: true }), 13, 0, 0, 0, stump);
    for (let i = 0; i < 13; i++) { const a = i / 13 * TAU + 0.12; const ridge = K.box(0.12, 1.9, 0.14, i % 2 ? C.barkD : C.barkL, Math.cos(a) * 1.27, 1.05, Math.sin(a) * 1.27, stump); ridge.rotation.y = -a; }
    // moss lip, jagged broken rim
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; const m = K.rock(0.3, i % 3 ? C.moss : C.mossL, Math.cos(a) * 1.15, 2.28, Math.sin(a) * 1.15, stump); m.scale.set(1, 0.45, 1); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.4; K.cone(0.18, 0.5 + (i % 2) * 0.35, C.barkL, 5, Math.cos(a) * 1.18, 2.45 + (i % 2) * 0.15, Math.sin(a) * 1.18, stump); }
    // the glowing heartwood inside
    const heart = K.cyl(0.92, 0.92, 0.08, K.glow(0x8ad86a), 12, 0, 1.95, 0, stump);
    const heartL = K.light(0xb8ff7a, 2.2, 6, 0, 2.6, 0, stump);
    // knothole windows that show the work inside
    const knots = [];
    for (const [a, y] of [[0.75, 1.1], [1.2, 0.6], [0.2, 1.5]]) { const k = K.sph(0.15, K.glow(C.gGold), Math.cos(a) * 1.24, y, Math.sin(a) * 1.24, stump, 8, 6); k.scale.set(1, 1.3, 0.5); k.rotation.y = -a; knots.push(k); }
    // buttress roots crawling out to the edge
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.2;
      K.tube([[sx + Math.cos(a) * 1.0, 0.9, sz + Math.sin(a) * 1.0], [sx + Math.cos(a) * 1.7, 0.35, sz + Math.sin(a) * 1.7], [sx + Math.cos(a + 0.2) * 2.4, 0.06, sz + Math.sin(a + 0.2) * 2.4]], 0.15, i % 2 ? C.barkD : C.bark, g, 10, 5);
    }
    // mushrooms clinging to the stump
    [[-2.0, -0.6, 0.8], [-1.6, -1.0, 0.55], [0.2, 1.9, 0.6]].forEach(([x, z, s]) => mushroom(K, g, x, z, s, false));
    for (let i = 0; i < 3; i++) { const sh = K.cyl(0.35 - i * 0.07, 0.38 - i * 0.07, 0.06, 0xcab27e, 8, sx - 0.6, 0.7 + i * 0.35, sz + 1.15, g); sh.rotation.x = 0.15; }

    // ---- the loom: a frame of living root facing the viewer, threads of code woven across it ----
    const loom = K.group(g, 1.15, 0.12, -0.55); loom.rotation.y = Math.PI / 4;
    for (const s of [-1, 1]) {
      K.tube([[s * 1.15, 0, 0.1], [s * 1.25, 1.2, 0], [s * 1.12, 2.4, -0.05], [s * 1.2, 2.75, 0]], 0.13, C.bark, loom, 12, 6);
      K.tube([[s * 1.1, 0, 0.2], [s * 1.5, 0.05, 0.6], [s * 1.8, 0.0, 0.9]], 0.1, C.barkD, loom, 6, 5);
      K.sph(0.2, C.moss, s * 1.2, 2.75, 0, loom, 7, 5).scale.y = 0.6;
    }
    K.tube([[-1.25, 2.6, 0], [0, 2.82, 0.05], [1.25, 2.6, 0]], 0.1, C.barkL, loom, 10, 5);
    K.tube([[-1.2, 0.35, 0], [0, 0.3, 0.05], [1.2, 0.35, 0]], 0.09, C.barkL, loom, 10, 5);
    for (let i = 0; i < 7; i++) K.box(0.025, 2.2, 0.025, 0x8a7a50, -0.9 + i * 0.3, 1.45, -0.02, loom);
    const threads = [];
    for (let r = 0; r < 9; r++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x34502a });
      const th = K.box(2.0, 0.09, 0.05, m, 0, 0.55 + r * 0.24, 0.03, loom);
      threads.push({ th, m, w: 0.4 + K.rnd() * 0.6, off: (K.rnd() - 0.5) * 0.5 });
    }
    const shuttle = K.sph(0.11, K.glow(0xfff2b0), 0, 1, 0.1, loom, 8, 6);
    const shuttleHalo = K.sph(0.24, K.glow(C.gGold, 0.35, true), 0, 1, 0.1, loom, 8, 6);
    // thorns that push out when blocked
    const thorns = [];
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, y = 0.4 + (i >> 1) * 0.35;
      const th = K.cone(0.07, 0.4, 0x7a2a1a, 4, side * 1.3, y, 0.12, loom); th.rotation.z = -side * 1.4; thorns.push(th);
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const th = K.cone(0.09, 0.5, 0x7a2a1a, 4, sx + Math.cos(a) * 1.35, 1.0 + (i % 3) * 0.4, sz + Math.sin(a) * 1.35, g); th.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4); thorns.push(th); }
    // two root arms growing from the stump rim, weaving over the loom
    const armA = rootArm(K, g, sx + 0.95, 2.1, sz - 0.35, Math.PI / 4 + 0.35);
    const armB = rootArm(K, g, sx + 0.35, 2.1, sz - 0.95, Math.PI / 4 - 0.35);
    // output: freshly unfurled leaves stacking on a flat stone
    K.cyl(0.7, 0.8, 0.22, C.stone, 7, 1.25, 0.11, 1.35, g);
    const leaves = [];
    for (let i = 0; i < 7; i++) {
      const lf = K.group(g, 1.25 + Math.cos(i * 2.4) * 0.22, 0.26 + i * 0.07, 1.35 + Math.sin(i * 2.4) * 0.22); lf.rotation.y = i * 0.9;
      K.box(0.55, 0.04, 0.26, i % 2 ? C.leafL : C.leafM, 0, 0, 0, lf); K.box(0.5, 0.05, 0.03, 0xd8e08a, 0, 0.01, 0, lf);
      leaves.push(lf);
    }
    const newLeaf = K.group(loom, 0, 0.35, 0.3); K.box(0.6, 0.04, 0.3, C.leafL, 0, 0, 0, newLeaf); K.box(0.55, 0.05, 0.04, K.glow(0xe8ff9a), 0, 0.01, 0, newLeaf);

    let k = 0, row = 0, made = 3, sparkT = 0, sapT = 0;
    return { g, update(t, dt, s) {
      dt = Math.max(0, dt);
      const work = s === 'WORKING', blocked = s === 'BLOCKED';
      sparkT -= dt; sapT -= dt;
      if (work) k += dt * 0.9;
      // arms: weave over the loom while working, droop when blocked, sway when idle
      const ph = k * Math.PI;
      if (work) {
        armA.tilt.rotation.z = -0.55 + Math.sin(ph) * 0.25; armA.tilt.rotation.x = 0.35 + Math.cos(ph) * 0.2; armA.el.rotation.z = -0.9 + Math.sin(ph * 2) * 0.3;
        armB.tilt.rotation.z = -0.55 + Math.sin(ph + 1.6) * 0.25; armB.tilt.rotation.x = 0.35 + Math.cos(ph + 1.6) * 0.2; armB.el.rotation.z = -0.9 + Math.sin(ph * 2 + 1.6) * 0.3;
      } else if (blocked) {
        const tw = Math.sin(t * 22) * 0.03;
        armA.tilt.rotation.z = -1.25 + tw; armA.tilt.rotation.x = 0.2; armA.el.rotation.z = -1.3;
        armB.tilt.rotation.z = -1.25 - tw; armB.tilt.rotation.x = 0.2; armB.el.rotation.z = -1.3;
      } else {
        armA.tilt.rotation.z = -0.3 + Math.sin(t * 0.6) * 0.08; armA.tilt.rotation.x = 0.1; armA.el.rotation.z = -0.5 + Math.sin(t * 0.8) * 0.1;
        armB.tilt.rotation.z = -0.3 + Math.sin(t * 0.6 + 1) * 0.08; armB.tilt.rotation.x = 0.1; armB.el.rotation.z = -0.5 + Math.sin(t * 0.8 + 1) * 0.1;
      }
      const budC = blocked ? (Math.sin(t * 10) > 0 ? C.gRed : 0x5a1a10) : work ? C.gGreen : 0x8ac860;
      armA.bud.material.color.setHex(budC); armB.bud.material.color.setHex(budC);
      // the weave: each row fills left to right like a line of code being written
      const cycle = 9 * 1.0;
      const prog = (k % cycle);
      const r0 = Math.floor(prog);
      threads.forEach((T, i) => {
        let fill;
        if (work) fill = i < r0 ? 1 : i === r0 ? prog - r0 : 0;
        else fill = blocked ? 1 : 0.35;
        const w = Math.max(0.02, fill) * (0.55 + T.w * 0.45);
        T.th.scale.x = w; T.th.position.x = -1.0 + w * 1.0 + T.off * 0 ;
        const lit = work ? (i === r0 ? 0xfff2b0 : i < r0 ? (i % 3 ? 0x8af06a : 0xffd56a) : 0x34502a) : blocked ? (Math.sin(t * 8 + i) > 0.2 ? 0xff5a3a : 0x6a1a12) : (i % 3 ? 0x3f6a32 : 0x5a5a2a);
        T.m.color.setHex(lit);
      });
      if (work) {
        const w = Math.max(0.02, prog - r0) * (0.55 + threads[Math.min(8, r0)].w * 0.45);
        const sxp = -1.0 + 2 * w; const sy = 0.55 + Math.min(8, r0) * 0.24;
        shuttle.position.set(sxp, sy, 0.1); shuttleHalo.position.copy(shuttle.position);
        if (sparkT <= 0) { sparkT = 0.05; K.spawn(loom, sxp, sy, 0.15, K.R() * 1.2, 0.6 + Math.random(), 0.4 + Math.random() * 0.5, Math.random() < 0.5 ? 0xfff2b0 : 0xb8ff7a, 0.7, 0.05, 0.6, true); }
      }
      shuttle.visible = shuttleHalo.visible = work;
      // a finished weave unfurls a leaf onto the stack
      const unf = work ? Math.min(1, Math.max(0, (prog - 8.3) / 0.7)) : 0;
      newLeaf.visible = work && unf > 0; newLeaf.scale.set(unf, 1, unf); newLeaf.rotation.x = (1 - unf) * 1.2;
      const doneCount = work ? (3 + Math.floor(k / cycle)) % 8 : (blocked ? 2 : 4);
      leaves.forEach((lf, i) => { lf.visible = i < doneCount; lf.children[0].material = K.mat(blocked ? 0x7a5a2a : i % 2 ? C.leafL : C.leafM); });
      // heartwood glow and knotholes
      heart.material.color.setHex(blocked ? (Math.sin(t * 6) > 0 ? 0xc0301e : 0x5a160e) : work ? 0xb8ff7a : 0x5a8a40);
      heartL.color.setHex(blocked ? 0xff4a2a : 0xb8ff7a); heartL.intensity = blocked ? 1.6 + Math.sin(t * 6) : work ? 2.4 + Math.sin(t * 7) * 0.4 : 1.0;
      knots.forEach((kn, i) => kn.material.color.setHex(blocked ? 0x8a1a10 : work ? (Math.sin(t * 5 + i * 2) > 0 ? 0xffe28a : 0xc0a040) : 0x8a7a3a));
      // thorns push out when blocked
      thorns.forEach((th, i) => { const target = blocked ? 1 : 0.001; th.scale.setScalar(th.scale.x + (target - th.scale.x) * Math.min(1, dt * 6)); });
      if (blocked && sapT <= 0) { sapT = 0.18; K.spawn(g, sx + Math.cos(t) * 1.2, 1.4, sz + Math.sin(t) * 1.2, 0, -0.2, 0, 0xc0281a, 1.2, 0.08, 2.0); }
    } };
  }

  // =====================================================================
  // SPLITTER: the Spark Heartwood
  // =====================================================================
  function buildSplitter(K) {
    const g = K.group();
    K.cyl(2.45, 2.55, 0.12, C.mossD, 12, 0, 0.06, 0, g);
    const tx = -0.55, tz = -0.55;
    const tree = K.group(g, tx, 0, tz);
    K.lathe([[1.55, 0], [1.15, 0.45], [0.92, 1.3], [0.82, 2.4], [0.86, 3.3], [1.0, 3.9], [0.55, 4.3], [0, 4.35]], K.mat(C.bark), 11, 0, 0, 0, tree);
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU; const r = K.box(0.14, 3.2, 0.16, i % 2 ? C.barkD : C.barkL, Math.cos(a) * 0.92, 1.9, Math.sin(a) * 0.92, tree); r.rotation.y = -a; r.rotation.z = Math.sin(i) * 0.08; }
    // a twisting vine climbing the trunk
    const vine = []; for (let i = 0; i <= 16; i++) { const a = i * 0.7, y = 0.2 + i * 0.24; vine.push([Math.cos(a) * 1.0, y, Math.sin(a) * 1.0]); }
    K.tube(vine, 0.06, C.mossL, tree, 60, 5);
    // roots
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + 0.3;
      K.tube([[Math.cos(a) * 0.9, 1.0, Math.sin(a) * 0.9], [Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6], [Math.cos(a) * 2.3, 0.05, Math.sin(a) * 2.3]], 0.17, i % 2 ? C.barkD : C.bark, tree, 10, 5);
    }
    // the cleft in the trunk, facing the viewer, with Spark's seed-crystal inside
    const cleft = K.group(tree, 0.62, 1.55, 0.62); cleft.rotation.y = Math.PI / 4;
    K.box(0.95, 1.5, 0.3, 0x140e08, 0, 0, 0, cleft);
    K.tube([[-0.55, -0.8, 0.15], [-0.62, 0, 0.2], [-0.4, 0.85, 0.15], [0, 1.0, 0.12]], 0.1, C.barkL, cleft, 10, 5);
    K.tube([[0.55, -0.8, 0.15], [0.62, 0, 0.2], [0.4, 0.85, 0.15], [0, 1.0, 0.12]], 0.1, C.barkL, cleft, 10, 5);
    const core = K.mesh(new THREE.OctahedronGeometry(0.34, 0), K.glow(0xffd870), 0, 0, 0.25, cleft);
    const coreHalo = K.sph(0.62, K.glow(C.gGold, 0.3, true), 0, 0, 0.3, cleft, 10, 8);
    const coreRing = K.torus(0.5, 0.025, K.glow(C.gCyan, 0.7, true), 4, 24, 0, 0, 0.3, cleft);
    const coreL = K.light(0xffd88a, 1.6, 5, 0, 0.3, 0.9, cleft);
    // crown: three tiers, branches reaching out
    for (const [cx, cy, cz, cr, n] of [[-1.3, 5.0, 0.4, 1.5, 11], [1.2, 5.4, -0.6, 1.5, 11], [0.1, 6.2, 0.3, 1.3, 9], [0.6, 4.8, 1.0, 1.1, 7]]) {
      K.tube([[0, 3.8, 0], [cx * 0.5, cy - 0.9, cz * 0.5], [cx, cy - 0.4, cz]], 0.2, C.bark, tree, 10, 5);
      crown(K, tree, cx, cy, cz, cr, n);
    }
    // hanging moss and glow-lanterns of fungus
    const lanterns = [];
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = 1.4 + (i % 3) * 0.35; K.box(0.05, 0.7 + (i % 4) * 0.35, 0.05, 0x7a8a48, Math.cos(a) * r, 4.2 - (i % 4) * 0.15, Math.sin(a) * r, tree); }
    for (const [a, r, y] of [[0.3, 1.7, 3.9], [2.2, 1.6, 4.0], [4.4, 1.8, 3.8]]) {
      K.box(0.03, 0.5, 0.03, 0x3a2a1a, Math.cos(a) * r, y + 0.25, Math.sin(a) * r, tree);
      lanterns.push(K.sph(0.13, K.glow(C.gCyan), Math.cos(a) * r, y - 0.05, Math.sin(a) * r, tree, 8, 6));
    }
    // the basin and three channels: Spark splits incoming feedback into routes
    const bx = 0.85, bz = 0.85;
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; K.box(0.36, 0.3, 0.26, i % 2 ? C.stone : C.stoneL, bx + Math.cos(a) * 0.82, 0.21, bz + Math.sin(a) * 0.82, g).rotation.y = -a; }
    const pool = K.cyl(0.72, 0.72, 0.06, K.mat(0x2a5a60, { e: 0x0a2a2c }), 14, bx, 0.28, bz, g);
    const swirl = K.torus(0.42, 0.04, K.glow(C.gCyan, 0.6, true), 4, 20, bx, 0.33, bz, g); swirl.rotation.x = Math.PI / 2;
    const routes = [
      { dir: [1, 0], len: 1.8, col: C.gGold, name: 'fix' },
      { dir: [0, 1], len: 1.6, col: C.gCyan, name: 'reply' },
      { dir: [-0.15, 1], len: 0, col: C.gGreen, name: 'idea' }
    ];
    const chans = [[1, 0, 1.75], [0, 1, 1.55], [0.7071, -0.7071, 1.15]];
    const flows = [];
    chans.forEach(([dx, dz, len], ci) => {
      const ang = Math.atan2(dx, dz);
      const ch = K.group(g, bx + dx * 0.8, 0.12, bz + dz * 0.8); ch.rotation.y = ang;
      for (const s of [-1, 1]) K.box(0.14, 0.2, len, C.stoneL, s * 0.24, 0.05, len / 2, ch);
      K.box(0.34, 0.06, len, K.mat(C.water, { e: 0x174a50 }), 0, 0.02, len / 2, ch);
      const col = [C.gGold, C.gCyan, C.gGreen][ci];
      K.box(0.36, 0.3, 0.12, col === C.gGold ? 0x8a6a2a : col === C.gCyan ? 0x2a6a6a : 0x3a6a2a, 0, 0.12, len + 0.05, ch);
      const sig = K.box(0.18, 0.18, 0.06, K.glow(col), 0, 0.42, len + 0.08, ch);
      const motes = [];
      for (let i = 0; i < 4; i++) motes.push(K.box(0.12, 0.12, 0.12, K.glow(col), 0, 0.14, 0, ch));
      flows.push({ ch, len, motes, sig, col });
    });
    // a small waterwheel on the gold channel
    const wheel = K.group(g, bx + 1.65, 0.45, bz - 0.36);
    const wr = K.group(wheel); wheel.rotation.y = Math.PI / 2;
    K.torus(0.38, 0.04, C.barkL, 4, 12, 0, 0, 0, wr);
    for (let i = 0; i < 8; i++) { const sp = K.box(0.06, 0.74, 0.06, C.bark, 0, 0, 0, wr); sp.rotation.z = i / 8 * Math.PI; K.box(0.1, 0.18, 0.2, C.barkD, Math.cos(i / 8 * TAU) * 0.38, Math.sin(i / 8 * TAU) * 0.38, 0, wr).rotation.z = i / 8 * TAU; }
    K.cyl(0.04, 0.04, 0.5, C.barkD, 5, 0, 0, 0, wheel).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) K.box(0.08, 0.5, 0.08, C.barkD, 0, -0.25, s * 0.22, wheel);
    // incoming feedback: dim motes drifting in from the forest behind
    const incoming = [];
    for (let i = 0; i < 7; i++) incoming.push({ m: K.box(0.13, 0.13, 0.13, K.glow([0xff7a5a, 0x9ab8ff, 0xffb84a][i % 3]), 0, 0, 0, g), k: i / 7 });
    // mycelium threads glowing in the moss
    const myc = [];
    for (let i = 0; i < 6; i++) {
      const a = 2.0 + i * 0.5; const m = K.glow(C.gCyan, 0.5, true);
      const pts = [[tx, 0.14, tz]]; for (let j = 1; j <= 4; j++) pts.push([tx + Math.cos(a + Math.sin(j) * 0.4) * j * 0.5, 0.14, tz + Math.sin(a + Math.sin(j) * 0.4) * j * 0.5]);
      myc.push({ t: K.tube(pts, 0.025, m, g, 16, 3), m });
    }
    let fk = 0, sporeT = 0;
    return { g, update(t, dt, s) {
      dt = Math.max(0, dt);
      const on = s === 'SORTING';
      sporeT -= dt;
      if (on) fk += dt;
      const pulse = on ? 0.75 + 0.25 * Math.sin(t * 6) : 0.4 + 0.15 * Math.sin(t * 1.3);
      core.rotation.y += dt * (on ? 2.4 : 0.5); core.rotation.x = Math.sin(t) * 0.2;
      core.scale.setScalar(0.85 + pulse * 0.3);
      coreHalo.material.opacity = 0.1 + pulse * 0.22; coreHalo.scale.setScalar(0.9 + pulse * 0.4);
      coreRing.rotation.x = t * (on ? 1.6 : 0.4); coreRing.rotation.y = t * (on ? 1.1 : 0.3);
      coreL.intensity = 0.5 + pulse * 1.4;
      swirl.rotation.z = t * (on ? 2.5 : 0.5); swirl.material.opacity = on ? 0.45 : 0.2;
      wr.rotation.z -= dt * (on ? 2.2 : 0.3);
      lanterns.forEach((l, i) => l.scale.setScalar(0.85 + 0.2 * Math.sin(t * 2 + i)));
      myc.forEach((m, i) => (m.m.opacity = on ? 0.35 + 0.4 * Math.max(0, Math.sin(t * 4 - i)) : 0.18));
      flows.forEach((f, ci) => {
        f.motes.forEach((m, i) => {
          const p = ((fk * 0.55 + i / f.motes.length + ci * 0.13) % 1);
          m.visible = on; m.position.z = p * f.len; m.position.y = 0.16 + Math.sin(p * 9) * 0.03;
        });
        f.sig.material.color.setHex(on && Math.sin(t * 5 + ci * 2) > 0 ? f.col : 0x2a2a2a);
      });
      incoming.forEach((m) => {
        const p = (m.k + t * (on ? 0.22 : 0.06)) % 1;
        const a = m.k * 6.28;
        m.m.position.set(tx + 0.6 + Math.cos(a) * (1 - p) * 2.4 - 0.3 * p, 1.55 + (1 - p) * 1.6 + Math.sin(t * 2 + a) * 0.2, tz - 2.2 * (1 - p) + 0.6 * p + Math.sin(a) * (1 - p));
        m.m.scale.setScalar(p > 0.85 ? (1 - p) * 6.6 : 1);
      });
      if (on && sporeT <= 0) { sporeT = 0.07; K.spawn(g, tx + 0.7 + K.R() * 0.4, 1.6, tz + 0.7 + K.R() * 0.4, K.R() * 0.8, 0.8 + Math.random() * 0.8, K.R() * 0.8, [C.gGold, C.gCyan, C.gGreen][Math.floor(Math.random() * 3)], 1.4, 0.06, -0.1, true); }
    } };
  }

  // =====================================================================
  // LAUNCH PAD: the Seed Circle
  // =====================================================================
  function buildLaunch(K) {
    const g = K.group();
    K.cyl(2.5, 2.6, 0.12, C.mossD, 14, 0, 0.06, 0, g);
    // standing stones with runes
    const runes = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU + 0.45, r = 2.05, h = 1.5 + ((i * 37) % 5) * 0.18;
      const st = K.group(g, Math.cos(a) * r, 0, Math.sin(a) * r); st.rotation.y = -a + Math.PI / 2; st.rotation.z = ((i * 13) % 7 - 3) * 0.02;
      K.box(0.62, h, 0.38, i % 2 ? C.stone : C.stoneL, 0, h / 2, 0, st);
      K.box(0.5, 0.3, 0.3, C.stoneD, 0.04, 0.12, 0.02, st);
      const cap = K.rock(0.36, C.moss, 0, h + 0.02, 0, st); cap.scale.set(1.05, 0.38, 0.7);
      const rm = new THREE.MeshBasicMaterial({ color: 0x223a2a });
      for (let j = 0; j < 3; j++) runes.push({ m: rm, i, mesh: K.box(j === 1 ? 0.24 : 0.08, j === 1 ? 0.07 : 0.22, 0.04, rm, (j - 1) * 0.12, h * 0.55 + j * 0.16, 0.2, st) });
      K.box(0.05, h * 0.5, 0.05, C.mossL, -0.24, h * 0.35, 0.2, st);
    }
    // stone dais with a carved glowing ring
    K.cyl(1.35, 1.45, 0.3, C.stone, 14, 0, 0.27, 0, g);
    K.cyl(1.05, 1.1, 0.18, C.stoneL, 14, 0, 0.5, 0, g);
    const ring = K.torus(0.86, 0.04, K.glow(0x3a5a3a), 4, 28, 0, 0.6, 0, g); ring.rotation.x = Math.PI / 2;
    // the stalk, wrapped in climbing vines
    const pod = K.group(g, 0, 0.6, 0);
    K.cyl(0.2, 0.32, 1.1, C.barkL, 8, 0, 0.55, 0, pod);
    for (let v = 0; v < 2; v++) { const pts = []; for (let i = 0; i <= 10; i++) { const a = i * 0.9 + v * Math.PI; pts.push([Math.cos(a) * 0.3, i * 0.11, Math.sin(a) * 0.3]); } K.tube(pts, 0.05, C.mossL, pod, 30, 4); }
    for (let i = 0; i < 4; i++) { const lf = K.box(0.45, 0.04, 0.2, C.leafM, Math.cos(i * 1.6) * 0.45, 0.2 + i * 0.18, Math.sin(i * 1.6) * 0.45, pod); lf.rotation.y = -i * 1.6; lf.rotation.z = 0.35; }
    // the bulb: a cup of sepals, six great petals hinged around it, the seed inside
    const bulb = K.group(pod, 0, 1.1, 0);
    K.lathe([[0.15, 0], [0.5, 0.15], [0.62, 0.4], [0.5, 0.6], [0.4, 0.62]], K.mat(C.leaf, { double: true }), 10, 0, 0, 0, bulb);
    const petals = [];
    for (let i = 0; i < 6; i++) {
      const hinge = K.group(bulb, 0, 0.35, 0); hinge.rotation.y = i / 6 * TAU;
      const leaf = K.group(hinge, 0, 0, 0.5);
      const pm = K.mat(i % 2 ? C.petal : C.petalPink);
      const p1 = K.sph(0.36, pm, 0, 0.85, 0, leaf, 8, 6); p1.scale.set(1, 2.4, 0.28);
      K.box(0.05, 1.5, 0.06, i % 2 ? 0xc89a7a : 0xb87a70, 0, 0.8, 0.11, leaf);
      petals.push({ hinge, leaf, pm });
    }
    const seed = K.sph(0.36, K.glow(0xffd060), 0, 1.25, 0, bulb, 12, 10);
    const seedHalo = K.sph(0.7, K.glow(C.gGold, 0.25, true), 0, 1.25, 0, bulb, 10, 8);
    const seedL = K.light(0xffd88a, 1.5, 7, 0, 2.6, 0.4, g);
    // the beam left behind by a launch
    const beam = K.cyl(0.35, 0.6, 40, K.glow(0xffe8a0, 0, true), 10, 0, 20, 0, g);
    // the flying seed (separate so it can leave the pod)
    const flyer = K.group(g);
    K.sph(0.36, K.glow(0xfff8e0), 0, 0, 0, flyer, 12, 10);
    K.sph(0.75, K.glow(C.gGold, 0.35, true), 0, 0, 0, flyer, 10, 8);
    for (let i = 0; i < 8; i++) { const f = K.box(0.03, 0.55, 0.03, 0xfff2d0, 0, 0, 0, flyer); f.position.set(Math.cos(i / 8 * TAU) * 0.3, 0.4, Math.sin(i / 8 * TAU) * 0.3); f.rotation.set(Math.sin(i / 8 * TAU) * 0.5, 0, -Math.cos(i / 8 * TAU) * 0.5); }
    flyer.visible = false;
    let trailT = 0, pollenT = 0, cd = 0, lastS = '';
    const setOpen = (o, droop) => petals.forEach((P, i) => { P.hinge.rotation.x = 0; P.leaf.rotation.x = -0.18 + o * 1.25 + (droop || 0) + Math.sin(i * 1.3) * 0.03; });
    return { g, update(t, dt, s) {
      dt = Math.max(0, dt);
      trailT -= dt; pollenT -= dt;
      if (s !== lastS) { lastS = s; cd = 0; }
      runes.forEach((r) => r.m.color.setHex(0x2a4a2a));
      if (s === 'IDLE') {
        cd = 0; flyer.visible = false; beam.material.opacity = 0; bulb.scale.setScalar(1); seed.visible = seedHalo.visible = true;
        const br = Math.sin(t * 0.9) * 0.04; setOpen(0.02 + br);
        seed.scale.setScalar(0.6); seedHalo.material.opacity = 0.12; seedL.intensity = 0.6;
        ring.material.color.setHex(0x3a6a3a); petals.forEach((P, i) => P.pm.color.setHex(i % 2 ? C.petal : C.petalPink));
        runes.forEach((r) => r.m.color.setHex(Math.sin(t * 0.8 + r.i) > 0.85 ? 0x6ad88a : 0x2a4a2a));
      } else if (s === 'COUNTDOWN') {
        cd += dt; const c = cd % 4.5, k = c / 4.5;
        flyer.visible = false; beam.material.opacity = 0; bulb.scale.setScalar(1); seed.visible = seedHalo.visible = true;
        setOpen(Math.min(1, k * 1.3) * 0.85 + Math.sin(t * 6) * 0.02);
        const lit = Math.floor(k * N + 0.999);
        runes.forEach((r) => r.m.color.setHex(r.i < lit ? (Math.sin(t * 10) > -0.3 ? 0x9cff9a : 0x4aa86a) : 0x2a4a2a));
        seed.scale.setScalar(0.7 + k * 0.45 + Math.sin(t * 14) * 0.03 * k); seedHalo.material.opacity = 0.12 + k * 0.3; seedHalo.scale.setScalar(1 + k * 0.6);
        seedL.intensity = 1 + k * 3.5; ring.material.color.setHex(k > 0.5 && Math.sin(t * 12) > 0 ? 0xffe28a : 0x7ad87a);
        if (pollenT <= 0) { pollenT = 0.04; const a = t * 3 + Math.random() * 6; K.spawn(g, Math.cos(a) * 1.7, 0.7, Math.sin(a) * 1.7, -Math.cos(a) * 0.5, 0.9 + k * 1.2, -Math.sin(a) * 0.5, Math.random() < 0.5 ? 0xffe28a : 0xc8ff9a, 1.6, 0.06, -0.2, true); }
      } else {
        cd += dt; const c = cd % 7.5;
        runes.forEach((r) => r.m.color.setHex(c < 3.2 ? 0xfff2b0 : 0x3a6a3a));
        if (c < 0.6) {
          const k = c / 0.6; setOpen(0.85 + k * 0.35); flyer.visible = false; seed.visible = seedHalo.visible = true; bulb.scale.setScalar(1 - k * 0.08);
          seed.scale.setScalar(1.15 + k * 0.2); seedHalo.material.opacity = 0.7; seedL.intensity = 4.5; beam.material.opacity = 0;
        } else if (c < 3.4) {
          const k = (c - 0.6) / 2.8, y = 2.95 + Math.pow(k, 1.8) * 34;
          seed.visible = seedHalo.visible = false; flyer.visible = true; flyer.position.set(Math.sin(k * 9) * 0.2 * k, y, Math.cos(k * 9) * 0.2 * k); flyer.rotation.y += dt * 6;
          setOpen(1.2); bulb.scale.setScalar(1);
          beam.material.opacity = 0.32 * (1 - k * 0.7); beam.scale.x = beam.scale.z = 1 - k * 0.5;
          seedL.intensity = 3 * (1 - k); ring.material.color.setHex(0xfff2b0);
          if (trailT <= 0) {
            trailT = 0.025;
            for (let j = 0; j < 2; j++) { const a = t * 11 + j * Math.PI; K.spawn(g, flyer.position.x + Math.cos(a) * 0.5, y - 0.4, flyer.position.z + Math.sin(a) * 0.5, Math.cos(a) * 0.7, -0.4, Math.sin(a) * 0.7, j ? 0xffe28a : 0xfff8e0, 1.4, 0.1, 0.1, true); }
            K.spawn(g, flyer.position.x + K.R(), y - 0.6, flyer.position.z + K.R(), K.R() * 1.5, 0.2, K.R() * 1.5, Math.random() < 0.5 ? C.petalPink : C.petal, 2.4, 0.14, 0.8);
          }
        } else if (c < 4.8) {
          const k = (c - 3.4) / 1.4; flyer.visible = false; beam.material.opacity = 0.1 * (1 - k);
          setOpen(1.2, k * 0.45); petals.forEach((P) => P.pm.color.lerpColors(new THREE.Color(C.petal), new THREE.Color(0x8a6a4a), k));
          bulb.scale.setScalar(1 - k * 0.9); seedL.intensity = 0.3; ring.material.color.setHex(0x3a6a3a);
        } else {
          const k = Math.min(1, (c - 4.8) / 2.2); beam.material.opacity = 0; flyer.visible = false;
          petals.forEach((P, i) => P.pm.color.setHex(i % 2 ? C.petal : C.petalPink));
          bulb.scale.setScalar(Math.max(0.05, 0.1 + k * 0.9)); setOpen(1 - k * 0.98);
          seed.visible = seedHalo.visible = k > 0.4; seed.scale.setScalar(Math.max(0.01, (k - 0.4) * 1.0)); seedHalo.material.opacity = 0.1; seedL.intensity = 0.5;
          if (pollenT <= 0) { pollenT = 0.12; K.spawn(g, K.R() * 1.2, 1.2, K.R() * 1.2, 0, 0.5, 0, 0xc8ff9a, 1.0, 0.05, -0.1, true); }
        }
      }
    } };
  }

  SHIP.register({
    id: 'wild', name: 'WILDWOOD', eyebrow: 'NATURE', accent: '#c9e06a',
    pitch: 'An ancient forest glade at golden hour. Nothing here is built. The machines are grown: a stump that weaves code on a loom of living roots, a heartwood tree whose seed-crystal sorts the forest’s whispers into streams, and a ring of standing stones that fires a glowing seed into the sky when a change ships.',
    palette: ['#1d3a22', '#2c5a2a', '#6e9a3a', '#4a3423', '#8a6842', '#6b685e', '#3a7d86', '#ffd56a', '#a8ff7a', '#7ff0e0'],
    keywords: ['GOLDEN HOUR', 'ANCIENT TREES', 'MOSS + RUINS', 'WATERFALL', 'BIOLUMINESCENCE', 'GROWN, NOT BUILT'],
    sky: { top: '#2e4a66', bottom: '#e8b57a', fog: '#b89a6a', fogNear: 62, fogFar: 120 },
    light: { sun: 0xffc27a, sunI: 1.35, sunDir: [-7, 12, 16], hemiSky: 0x8aa0b8, hemiGnd: 0x2a2416, hemiI: 0.5 },
    finish: { levels: 40, dither: 0.12, outline: 0.42, thresh: 0.085, ink: '#10140a', sat: 1.0, contrast: 1.12, bloom: 0.42, bloomThresh: 0.7, vignette: 0.38, grade: 0.4, shadow: '#1f3a5a', high: '#ffd890', scan: 0 },
    world,
    components: [
      { id: 'assembler', name: 'ROOT LOOM', blurb: 'The assembler: a coding agent at work. A hollow stump whose living roots weave glowing threads of code across a loom; every finished weave unfurls as a leaf.', states: ['IDLE', 'WORKING', 'BLOCKED'], build: buildAssembler },
      { id: 'splitter', name: 'SPARK HEARTWOOD', blurb: 'The splitter: Muse Spark. Feedback drifts in from the forest, the seed-crystal in the heartwood reads it, and the basin splits it down three channels: fix, reply, idea.', states: ['IDLE', 'SORTING'], build: buildSplitter },
      { id: 'launch', name: 'SEED CIRCLE', blurb: 'The launch pad: a merged PR ships. Runes wake stone by stone, the pod opens, and the seed fires skyward on a spiral of pollen before a new pod regrows.', states: ['IDLE', 'COUNTDOWN', 'LAUNCH'], build: buildLaunch }
    ]
  });
})();
