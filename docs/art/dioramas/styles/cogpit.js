// COGWORKS: a Victorian foundry district. Brass, copper, riveted iron, verdigris, soot and gaslight.
(function () {
  'use strict';
  const C = {
    soot: 0x140f0b, iron: 0x261f19, ironL: 0x43372c, ironM: 0x322820,
    brass: 0x96692a, brassD: 0x5a3e18, brassL: 0xbf9244,
    copper: 0x8a4526, copperD: 0x5a2914, verd: 0x37705e, verdD: 0x244c40,
    brick: 0x6a2e1e, brickD: 0x46201a, stone: 0x6e6050, stoneD: 0x4a3f34,
    wood: 0x56381f, woodD: 0x3a2514, leather: 0x4a2a18, cream: 0xe8d6a8,
    gas: 0xffc070, ember: 0xff7a2a, red: 0xe0402a, teal: 0x7af0d8
  };

  // ---------- shared material + part helpers ----------
  let M = null;
  function mats(K) {
    if (M) return M;
    M = {
      brass: K.mat(C.brass, { shine: 38, spec: 0x7a5a28 }),
      brassL: K.mat(C.brassL, { shine: 50, spec: 0x9a7a40 }),
      brassD: K.mat(C.brassD, { shine: 20, spec: 0x3a2a10 }),
      copper: K.mat(C.copper, { shine: 34, spec: 0x6a3a20 }),
      copperD: K.mat(C.copperD, { shine: 18, spec: 0x3a1a0a }),
      iron: K.mat(C.iron), ironM: K.mat(C.ironM), ironL: K.mat(C.ironL, { shine: 10, spec: 0x222222 }),
      soot: K.mat(C.soot), verd: K.mat(C.verd), verdD: K.mat(C.verdD),
      wood: K.mat(C.wood), woodD: K.mat(C.woodD), leather: K.mat(C.leather),
      brick: K.mat(C.brick), brickD: K.mat(C.brickD), stone: K.mat(C.stone), stoneD: K.mat(C.stoneD),
      cream: K.mat(C.cream),
      glass: K.mat(0xa8d8c8, { op: 0.22, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      gas: K.glow(C.gas), ember: K.glow(C.ember), teal: K.glow(C.teal)
    };
    return M;
  }
  // a gear lying in the xz plane (axis = y); rotate the returned group to orient it
  function gear(K, p, r, thick, teeth, m, x, y, z) {
    const g = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * (r + r * 0.08), 0, Math.cos(a) * (r + r * 0.08), g);
      tb.rotation.y = a;
    }
    K.cyl(r * 0.28, r * 0.28, thick * 1.6, M.ironM, 8, 0, 0, 0, g);
    if (r > 0.35) for (let i = 0; i < 4; i++) { const s = K.box(r * 1.4, thick * 1.1, r * 0.12, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 4; s.scale.x = 0.95; }
    return g;
  }
  function rivetRing(K, p, r, y, n, m) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.08, 0.08, 0.08, m || M.brassL, Math.cos(a) * r, y, Math.sin(a) * r, p); } }
  function band(K, p, r, y, m, h) { K.cyl(r, r, h || 0.1, m || M.brass, 18, 0, y, 0, p); }
  // gauge facing +z (rotate the group to face elsewhere); returns needle pivot
  function gauge(K, p, x, y, z, r, ry) {
    const g = K.group(p, x, y, z); g.rotation.y = ry || 0;
    const rim = K.cyl(r * 1.15, r * 1.15, 0.08, M.brass, 14, 0, 0, 0, g); rim.rotation.x = Math.PI / 2;
    const face = K.cyl(r, r, 0.1, M.cream, 14, 0, 0, 0.01, g); face.rotation.x = Math.PI / 2;
    const red = K.box(r * 0.5, r * 0.18, 0.02, K.mat(0xb02a1a), r * 0.45, r * 0.45, 0.065, g); red.rotation.z = -0.8;
    const piv = K.group(g, 0, 0, 0.07);
    K.box(0.035, r * 0.85, 0.02, K.mat(0x140c06), 0, r * 0.38, 0, piv);
    K.box(0.07, 0.07, 0.03, M.brassL, 0, 0, 0.01, g);
    return piv;
  }
  // smoke/steam puff helper
  function puff(K, p, x, y, z, col, size, vy, spread, life) {
    K.spawn(p, x + K.R() * spread, y, z + K.R() * spread, K.R() * 0.3 + 0.25, vy, K.R() * 0.3, col, life || 2.6, size, -0.12);
  }
  function lamp(K, p, x, z, h, withLight) {
    const g = K.group(p, x, 0, z);
    K.cyl(0.22, 0.28, 0.22, M.iron, 8, 0, 0.11, 0, g);
    K.cyl(0.07, 0.09, h, M.iron, 8, 0, h / 2, 0, g);
    for (let i = 0; i < 3; i++) band(K, g, 0.1, 0.5 + i * (h * 0.3), M.brassD, 0.06);
    const arm = K.box(0.5, 0.06, 0.06, M.iron, 0.18, h - 0.1, 0, g); arm.rotation.z = 0.2;
    K.cyl(0.2, 0.14, 0.1, M.brass, 6, 0, h, 0, g);
    const glass = K.box(0.24, 0.34, 0.24, M.gas, 0, h + 0.24, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.035, 0.38, 0.035, M.iron, sx * 0.13, h + 0.24, sz * 0.13, g);
    K.cone(0.24, 0.24, M.brassD, 6, 0, h + 0.53, 0, g);
    K.sph(0.05, M.brassL, 0, h + 0.68, 0, g, 6, 4);
    const L = withLight ? K.light(0xffaa55, 1.4, 7.5, 0, h + 0.2, 0, g) : null;
    return { g, glass, L };
  }

  // ---------- textures ----------
  function cobbleTex(K) {
    return K.canvasTex(128, 128, (g) => {
      let s = 31; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#17110d'; g.fillRect(0, 0, 128, 128);
      const tones = ['#3e342b', '#463a2f', '#4c4034', '#3a3028', '#52453a', '#433830'];
      for (let y = 0; y < 128; y += 9) {
        let x = -Math.floor(r() * 8);
        while (x < 128) {
          const w = 7 + Math.floor(r() * 5), h = 7 + Math.floor(r() * 2), oy = Math.floor(r() * 2);
          g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1 + oy, w - 1, h - 1);
          g.fillRect(x + 2, y + oy, w - 3, 1); g.fillRect(x + 2, y + h + oy - 0, w - 3, 1);
          g.fillStyle = 'rgba(255,220,170,0.09)'; g.fillRect(x + 2, y + 1 + oy, w - 3, 1);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1, y + h - 1 + oy, w - 1, 1);
          x += w;
        }
      }
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(8,5,3,0.32)'; const x = r() * 110, y = r() * 110; g.fillRect(x, y, 10 + r() * 16, 5 + r() * 8); }
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(40,70,60,0.18)'; g.fillRect(r() * 120, r() * 120, 6, 4); }
    }, [9, 4.5]);
  }
  function brickTex(K, rep, dark) {
    return K.canvasTex(64, 64, (g) => {
      let s = 7; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = dark ? '#1c100c' : '#2a1812'; g.fillRect(0, 0, 64, 64);
      const tones = dark ? ['#4a2018', '#3e1c15', '#52251b'] : ['#6e3020', '#62291b', '#7a3826', '#5a2618'];
      for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < 64; x += 16) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 14, 6);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 5, 14, 2);
      }
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(8,4,2,0.35)'; g.fillRect(r() * 64, 0, 4 + r() * 8, 64); }
    }, rep);
  }
  function stoneTex(K, rep) {
    return K.canvasTex(64, 64, (g) => {
      let s = 13; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#231b15'; g.fillRect(0, 0, 64, 64);
      const tones = ['#5e5142', '#544838', '#675948'];
      for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
        g.fillStyle = tones[Math.floor(r() * 3)]; g.fillRect(x + 1, y + 1, 22, 14);
        g.fillStyle = 'rgba(255,230,190,0.08)'; g.fillRect(x + 2, y + 1, 20, 2);
      }
    }, rep);
  }

  // =====================================================================
  // WORLD: the undercroft, a cramped iron-and-brick factory hall with belts on three levels
  // =====================================================================
  function plateTex(K) {
    return K.canvasTex(128, 128, (g) => {
      let s = 41; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#3a3027'; g.fillRect(0, 0, 128, 128);
      const tones = ['#4a3f34', '#4e4237', '#463b30', '#52453a'];
      for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 30, 30);
        g.fillStyle = 'rgba(255,220,170,0.06)'; g.fillRect(x + 1, y + 1, 30, 2);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 1, y + 30, 30, 1);
        g.fillStyle = '#5a4c3e'; for (const [a, b] of [[3, 3], [27, 3], [3, 27], [27, 27]]) g.fillRect(x + a, y + b, 2, 2);
        if (r() < 0.12) { g.fillStyle = '#231b14'; for (let i = 0; i < 4; i++) g.fillRect(x + 7, y + 8 + i * 5, 18, 3); }
      }
      // oil stains and rust blooms
      for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(4,3,2,0.55)'; const x = r() * 116, y = r() * 116, w = 6 + r() * 14; g.fillRect(x, y, w, 4 + r() * 8); g.fillRect(x + 2, y - 2, w - 4, 2); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(110,52,20,0.32)'; g.fillRect(r() * 120, r() * 120, 4 + r() * 6, 2 + r() * 4); }
    }, [8, 4]);
  }
  function grimeBrickTex(K, rep) {
    return K.canvasTex(64, 64, (g) => {
      let s = 9; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#120b08'; g.fillRect(0, 0, 64, 64);
      const tones = ['#5a2a1c', '#4e2418', '#663020', '#44201a'];
      for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < 64; x += 16) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 14, 6);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1, y + 5, 14, 2);
      }
      for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(4,2,1,0.45)'; g.fillRect(r() * 64, 0, 3 + r() * 8, 64); }
    }, rep);
  }
  let beltBase = null;
  function beltTex(K) {
    if (beltBase) return beltBase;
    beltBase = K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#16120f'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#2c2520'; g.fillRect(0, 2, 3, 12); g.fillRect(8, 2, 3, 12);
      g.fillStyle = '#0a0806'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2);
    });
    return beltBase;
  }

  function world(K, root) {
    mats(K);
    const THREE = K.THREE;
    const ironDark = K.mat(0x1e1813), rail = K.mat(0x5a4a3a, { shine: 10, spec: 0x2a2018 }), hazard = K.mat(0xb08a2a), redRail = K.mat(0x7a1e14);

    // ---------- floor: iron plates with a glowing furnace trench across the front ----------
    const top = K.mat(0xffffff, { map: plateTex(K) });
    const front = K.mat(0xffffff, { map: stoneTex(K, [10, 0.5]) });
    K.box(30, 1.4, 12.2, [front, front, top, M.soot, front, front], 0, -0.7, -1.1, root);
    const top2 = K.mat(0xffffff, { map: plateTex(K) }); top2.map.repeat.set(8, 0.5);
    K.box(30, 1.4, 1.5, [front, front, top2, M.soot, front, front], 0, -0.7, 6.75, root);
    // trench: glowing pit + grates
    const pit = K.box(30, 0.1, 1.0, K.glow(0xff5a18), 0, -1.1, 5.5, root);
    K.box(30, 1.0, 0.1, K.mat(0x3a1a0c), 0, -0.6, 5.0, root); K.box(30, 1.0, 0.1, K.mat(0x3a1a0c), 0, -0.6, 6.0, root);
    for (let x = -14.8; x < 15; x += 0.42) K.box(0.08, 0.08, 1.0, ironDark, x, -0.06, 5.5, root);
    K.box(30, 0.08, 0.1, rail, 0, -0.02, 5.02, root); K.box(30, 0.08, 0.1, rail, 0, -0.02, 5.98, root);
    const pitL = K.light(0xff6a28, 2.2, 9, 0, -0.2, 5.5, root);
    // lower foundry level under the hall (kept from v1)
    K.box(29, 7, 13, M.soot, 0, -4.9, -0.6, root);
    const furn = [];
    for (const x of [-10.5, -6, -1.5, 3, 7.5, 12]) {
      K.box(1.2, 0.9, 0.1, K.glow(0x7a2a0c), x, -2.6, 5.92, root);
      const ar = K.cyl(0.6, 0.6, 0.1, K.glow(0x7a2a0c), 10, x, -2.15, 5.92, root); ar.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) K.box(0.06, 1.2, 0.1, M.iron, x - 0.42 + i * 0.28, -2.45, 5.98, root);
    }
    for (const x of [-12, -4, 4, 12]) K.box(1.6, 5, 1.6, M.soot, x, -3.8, 7.0, root);
    furn.push(pit);

    // ---------- back wall with tall grimy windows and light shafts ----------
    const brick = K.mat(0xffffff, { map: grimeBrickTex(K, [8, 3]) });
    const wall = K.box(31, 11, 0.7, brick, 0, 5.5, -6.8, root); wall.castShadow = false;
    const winM = K.glow(0xb8b8a8), winM2 = K.glow(0x8a8a7c);
    const shafts = [];
    for (const x of [-11.2, -5.6, 0, 5.6, 11.2]) {
      const wg = K.group(root, x, 0, -6.42);
      K.box(2.2, 5.4, 0.08, x === 0 ? winM2 : winM, 0, 5.6, 0, wg);
      const ar = K.cyl(1.1, 1.1, 0.08, x === 0 ? winM2 : winM, 14, 0, 8.3, 0, wg); ar.rotation.x = Math.PI / 2;
      for (let i = -2; i <= 2; i++) K.box(0.07, 6.4, 0.12, ironDark, i * 0.45, 5.9, 0.04, wg);
      for (let y = 3.4; y < 9; y += 0.7) K.box(2.3, 0.06, 0.12, ironDark, 0, y, 0.04, wg);
      // broken panes + grime
      for (let i = 0; i < 4; i++) K.box(0.4, 0.6, 0.1, K.mat(0x14100c), -0.8 + Math.floor(K.rnd() * 4) * 0.45, 3.6 + Math.floor(K.rnd() * 7) * 0.7, 0.02, wg);
      K.box(2.6, 0.25, 0.4, M.stoneD, 0, 2.8, 0.15, wg);
      // hazy light shaft slanting down into the hall
      const sh = K.box(1.8, 0.02, 9.5, K.glow(0xffd8a0, 0.1, true), x + 1.2, 3.4, -2.6, root);
      sh.rotation.x = 0.62; sh.rotation.z = -0.22; shafts.push(sh);
    }
    // soot streaks down the wall
    for (let i = 0; i < 14; i++) K.box(0.25 + K.rnd() * 0.5, 2 + K.rnd() * 6, 0.05, K.mat(0x080604, { op: 0.5 }), -15 + K.rnd() * 30, 4 + K.rnd() * 4, -6.43, root);

    // ---------- iron columns and roof trusses ----------
    const colM = K.mat(0x2a221c, { shine: 6, spec: 0x1a1410 });
    function column(x, z, h) {
      const c = K.group(root, x, 0, z);
      K.box(0.5, 0.3, 0.5, M.stoneD, 0, 0.15, 0, c);
      K.box(0.26, h, 0.26, colM, 0, h / 2, 0, c);
      K.box(0.4, 0.12, 0.4, colM, 0, h, 0, c);
      for (let y = 1.2; y < h; y += 1.6) K.box(0.32, 0.08, 0.32, rail, 0, y, 0, c);
      return c;
    }
    for (const x of [-14, -8.5, -2.8, 2.8, 8.5, 14]) column(x, -5.9, 9.6);
    for (const x of [-14, 14]) column(x, 6.6, 9.6);
    // roof trusses: front + back chords along x, rafters across z
    K.box(30, 0.22, 0.22, colM, 0, 9.6, -5.9, root); K.box(30, 0.18, 0.18, colM, 0, 9.6, -1.4, root);
    for (const x of [-14, -8.5, -2.8, 2.8, 8.5, 14]) {
      const r1 = K.box(0.12, 0.12, 4.6, colM, x, 9.6, -3.65, root);
      for (let z = -5.2; z < -1.4; z += 1.2) { const d = K.box(0.06, 1.0, 0.06, colM, x, 10.0, z, root); d.rotation.x = (Math.round(z * 10) % 2 ? 0.6 : -0.6); }
      K.box(0.12, 0.12, 4.6, colM, x, 10.4, -3.65, root);
    }

    // ---------- gantry crane: two I-beam rails, a bridge that travels along x, a trolley and a load ----------
    for (const z of [-5.3, -1.6]) { K.box(29, 0.26, 0.18, K.mat(0x5a2418), 0, 8.2, z, root); K.box(29, 0.06, 0.34, K.mat(0x3a160e), 0, 8.06, z, root); }
    const bridge = K.group(root, -6, 8.42, 0);
    K.box(0.34, 0.3, 4.1, hazard, 0, 0, -3.45, bridge);
    for (let z = -5.2; z < -1.6; z += 0.6) K.box(0.36, 0.08, 0.08, K.mat(0x16120a), 0, 0.02, z, bridge);
    for (const z of [-5.3, -1.6]) K.box(0.8, 0.3, 0.4, ironDark, 0, -0.05, z, bridge);
    const trolley = K.group(bridge, 0, -0.25, -3.0);
    K.box(0.6, 0.3, 0.5, M.ironM, 0, 0, 0, trolley);
    const cable = K.box(0.04, 1, 0.04, K.mat(0x0c0a08), 0, -0.6, 0, trolley);
    const load = K.group(trolley, 0, -1.55, 0);
    K.box(0.06, 0.1, 0.06, M.ironL, 0, 0.45, 0, load);
    for (const sx of [-1, 1]) { const ch = K.box(0.03, 0.75, 0.03, K.mat(0x0c0a08), sx * 0.35, 0.1, 0, load); ch.rotation.z = sx * 0.45; }
    const boilerPart = K.cyl(0.45, 0.45, 1.1, M.copperD, 12, 0, -0.35, 0, load); boilerPart.rotation.z = Math.PI / 2;
    for (const x of [-0.4, 0, 0.4]) { const b = K.cyl(0.47, 0.47, 0.06, M.brassD, 12, x, -0.35, 0, load); b.rotation.z = Math.PI / 2; }

    // ---------- catwalk along the back, with railings, ladders and wall brackets ----------
    const CWY = 5.1, CWZ = -4.2;
    K.box(25.5, 0.12, 1.5, ironDark, -0.95, CWY, CWZ, root);
    for (let x = -13.5; x < 12.4; x += 0.5) K.box(0.05, 0.05, 1.5, rail, x, CWY + 0.07, CWZ, root);
    for (const dz of [-0.72, 0.72]) {
      K.box(25.5, 0.06, 0.06, rail, -0.95, CWY + 0.95, CWZ + dz, root);
      K.box(25.5, 0.05, 0.05, rail, -0.95, CWY + 0.5, CWZ + dz, root);
      for (let x = -13.6; x < 12.5; x += 1.3) K.box(0.06, 0.95, 0.06, rail, x, CWY + 0.48, CWZ + dz, root);
    }
    K.box(25.5, 0.14, 0.12, hazard, -0.95, CWY - 0.02, CWZ + 0.76, root);
    for (let x = -13; x < 12.5; x += 3.2) { const br = K.box(0.08, 2.0, 0.08, colM, x, CWY - 0.8, CWZ - 1.2, root); br.rotation.x = -0.75; K.box(0.1, 0.1, 1.6, colM, x, CWY - 0.1, CWZ - 0.1, root); }
    for (const x of [-6.2, 3.6]) { K.box(0.16, CWY, 0.16, colM, x, CWY / 2, CWZ + 0.7, root); }
    function ladder(x, z) { const l = K.group(root, x, 0, z); for (const s of [-0.22, 0.22]) K.box(0.05, CWY + 1, 0.05, rail, s, (CWY + 1) / 2, 0, l); for (let y = 0.3; y < CWY + 0.9; y += 0.32) K.box(0.44, 0.04, 0.04, rail, 0, y, 0, l); }
    ladder(-4.4, CWZ + 0.95); ladder(12.0, CWZ + 0.95);
    // a little worker in a cap on the catwalk, wiping his hands
    const worker = K.group(root, -3.2, CWY + 0.06, CWZ);
    K.box(0.22, 0.42, 0.16, K.mat(0x2a3040), 0, 0.21, 0, worker); K.box(0.28, 0.42, 0.2, K.mat(0x4a3a28), 0, 0.62, 0, worker);
    K.box(0.2, 0.2, 0.2, K.mat(0xc49070), 0, 0.95, 0, worker); K.box(0.24, 0.07, 0.26, K.mat(0x1a1612), 0, 1.07, 0.02, worker);
    const wArm = K.box(0.08, 0.34, 0.08, K.mat(0x4a3a28), 0.18, 0.62, 0.05, worker);

    // ---------- chain hoists ----------
    const hoists = [];
    function hoist(x, z, len, part) {
      const piv = K.group(root, x, 9.5, z);
      K.box(0.4, 0.3, 0.3, M.ironM, 0, -0.1, 0, piv);
      for (let y = 0.3; y < len; y += 0.16) { const lk = K.box(0.06, 0.12, y % 0.32 < 0.16 ? 0.02 : 0.06, K.mat(0x3a3028), 0, -y, 0, piv); }
      const hk = K.torus(0.12, 0.03, M.ironL, 4, 10, 0, -len - 0.1, 0, piv, Math.PI * 1.5);
      const p = K.group(piv, 0, -len - 0.3, 0); part(p);
      hoists.push(piv); return piv;
    }
    hoist(-4.0, -2.2, 3.2, (p) => { const gr = gear(K, p, 0.45, 0.14, 12, M.brassD, 0, -0.45, 0); gr.rotation.x = Math.PI / 2; });
    hoist(4.2, -2.6, 2.4, (p) => { K.box(0.7, 0.55, 0.55, M.woodD, 0, -0.3, 0, p); K.box(0.72, 0.08, 0.57, M.iron, 0, -0.1, 0, p); K.box(0.72, 0.08, 0.57, M.iron, 0, -0.5, 0, p); });

    // ---------- hanging lamps that swing ----------
    const lampsH = [];
    for (const [x, z, withL] of [[-4.2, 1.8, true], [4.2, 1.8, true], [-11.5, 1.4, false], [11.5, 1.6, false], [0, -2.6, true]]) {
      const piv = K.group(root, x, 9.5, z);
      const cord = 9.5 - (z < 0 ? 7.6 : 6.4);
      K.box(0.03, cord, 0.03, K.mat(0x0a0806), 0, -cord / 2, 0, piv);
      const shade = K.cone(0.45, 0.32, K.mat(0x3a4a3a, { double: true }), 10, 0, -cord - 0.05, 0, piv);
      const bulb = K.sph(0.14, K.glow(0xffd090), 0, -cord - 0.22, 0, piv, 8, 6);
      const L = withL ? K.light(0xffb060, 1.6, 8.5, 0, -cord - 0.4, 0, piv) : null;
      const pool = K.cyl(1.1, 1.1, 0.01, K.glow(0xffc070, 0.06, true), 18, x, 0.03, z, root);
      lampsH.push({ piv, bulb, L, ph: K.rnd() * 6 });
    }

    // ---------- conveyor belts ----------
    const belts = [], paths = [];
    function beltSeg(a, b, w, railM) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const d = B.clone().sub(A), hl = Math.hypot(d.x, d.z), len = d.length();
      const g = K.group(root, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
      g.rotation.y = -Math.atan2(d.z, d.x);
      const inner = K.group(g); inner.rotation.z = Math.atan2(d.y, hl);
      const tex = beltTex(K).clone(); tex.needsUpdate = true; tex.repeat.set(len * 1.6, 1);
      const topM = K.mat(0xffffff, { map: tex }), side = K.mat(0x1d1712);
      K.box(len, 0.1, w, [side, side, topM, side, side, side], 0, -0.06, 0, inner);
      K.box(len, 0.18, w + 0.18, K.mat(0x241c16), 0, -0.2, 0, inner);
      for (const s of [-1, 1]) { K.box(len, 0.12, 0.07, railM || rail, 0, 0.0, s * (w / 2 + 0.06), inner); }
      for (let u = 0.3; u < len; u += 0.9) { const rr = K.cyl(0.06, 0.06, w + 0.2, M.ironL, 6, -len / 2 + u, -0.2, 0, inner); rr.rotation.x = Math.PI / 2; }
      belts.push({ tex, sp: len * 1.6 / len });
      return { A, B, g };
    }
    function trestles(a, b, step) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
      for (let u = step / 2; u < len; u += step) {
        const p = A.clone().lerp(B, u / len), h = p.y - 0.3;
        if (h < 0.4) continue;
        const tr = K.group(root, p.x, 0, p.z);
        for (const s of [-0.38, 0.38]) K.box(0.08, h, 0.08, colM, s, h / 2, 0, tr);
        const x1 = K.box(0.05, h * 1.05, 0.05, colM, 0, h / 2, 0, tr); x1.rotation.z = Math.atan2(0.76, h);
        K.box(0.9, 0.08, 0.12, colM, 0, h, 0, tr);
        tr.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x) + Math.PI / 2;
      }
    }
    function legs(a, b, step) { trestles(a, b, step); }
    function makePath(pts, items, speed) {
      const P = pts.map((p) => new THREE.Vector3(...p)); const L = [0];
      for (let i = 1; i < P.length; i++) L.push(L[i - 1] + P[i].distanceTo(P[i - 1]));
      const total = L[L.length - 1];
      const path = { P, L, total, items: items.map((m, i) => ({ m, s: (i / items.length) * total })), speed };
      paths.push(path); return path;
    }
    function at(path, s, out) {
      const L = path.L; let i = 1; while (i < L.length - 1 && L[i] < s) i++;
      const k = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]); return out.copy(path.P[i - 1]).lerp(path.P[i], Math.min(1, Math.max(0, k)));
    }
    const BY = 0.62;
    // A) ore chute: from a hatch high in the back wall, over the catwalk, down into Spark's hopper
    const hatch = K.group(root, 0.78, 8.3, -6.4);
    K.box(1.3, 1.1, 0.3, ironDark, 0, 0, 0, hatch); K.box(1.0, 0.8, 0.1, K.glow(0xff8a3a), 0, 0, 0.12, hatch);
    for (let i = 0; i < 3; i++) K.box(1.1, 0.06, 0.14, M.iron, 0, -0.3 + i * 0.3, 0.16, hatch);
    {
      const A = [0.78, 8.05, -6.2], B = [0.78, 5.75, -2.4];
      const A3 = new THREE.Vector3(...A), B3 = new THREE.Vector3(...B), d = B3.clone().sub(A3);
      const tg = K.group(root, (A3.x + B3.x) / 2, (A3.y + B3.y) / 2, (A3.z + B3.z) / 2); tg.rotation.y = Math.PI / 2;
      const inner = K.group(tg); inner.rotation.z = -Math.atan2(d.y, -d.z) * -1; inner.rotation.z = Math.atan2(d.y, Math.abs(d.z)) * -1;
      const len = d.length();
      K.box(len, 0.08, 0.7, M.copperD, 0, 0, 0, inner);
      for (const s of [-0.38, 0.38]) K.box(len, 0.35, 0.06, M.copper, 0, 0.15, s, inner);
      for (let u = 0.4; u < len; u += 0.9) K.box(0.1, 0.42, 0.84, M.brassD, -len / 2 + u, 0.12, 0, inner);
      K.box(0.08, 3.2, 0.08, colM, 0.78, 6.6, -2.6, root).visible = false;
      // hanger rods from the roof
      for (const z of [-5.0, -3.0]) { const y = 8.05 + (z + 6.2) / 3.8 * -2.3; K.box(0.05, 9.6 - y, 0.05, colM, 0.78, (9.6 + y) / 2, z, root); }
    }
    const oreCols = [0xc05a2a, 0x5a7ab0, 0xd09a3a];
    const oreItems = []; for (let i = 0; i < 6; i++) oreItems.push(K.rock(0.16, K.mat(oreCols[i % 3], { e: oreCols[i % 3] & 0x3a3a3a }), 0, -50, 0, root));
    makePath([[0.78, 8.2, -6.2], [0.78, 5.9, -2.4], [0.78, 4.4, -2.0]], oreItems, 1.4);

    // B) sorted capsules: floor belt in front of Spark, running left to the assembler's intake
    beltSeg([2.4, BY, 4.15], [-5.7, BY, 4.15], 0.72); beltSeg([-5.7, BY, 4.15], [-6.6, BY, 2.55], 0.72);
    // corner turntable
    K.cyl(0.5, 0.5, 0.12, M.ironL, 12, -5.75, BY - 0.02, 4.1, root); rivetRing(K, K.group(root, -5.75, 0, 4.1), 0.45, BY + 0.05, 10);
    // feeder chute from Spark's front bin
    { const f = K.box(0.5, 0.06, 1.1, M.brassD, 1.95, 0.9, 3.4, root); f.rotation.x = -0.45; }
    // assembler intake hopper
    const intake = K.group(root, -6.75, 0, 2.3);
    K.lathe([[0.18, 0], [0.5, 0.5], [0.55, 0.62]], M.copperD, 8, 0, 0.5, 0, intake);
    for (const s of [-0.4, 0.4]) K.box(0.08, 0.6, 0.08, colM, s, 0.3, 0, intake);
    const capItems = []; for (let i = 0; i < 8; i++) { const c = K.cyl(0.11, 0.11, 0.34, K.mat(oreCols[i % 3], { e: oreCols[i % 3] & 0x2a2a2a, shine: 20 }), 8, 0, -50, 0, root); c.rotation.z = Math.PI / 2; capItems.push(c); }
    makePath([[2.4, BY + 0.14, 4.15], [-5.7, BY + 0.14, 4.15], [-6.6, BY + 0.14, 2.55], [-6.75, 1.0, 2.3]], capItems, 1.0);

    // C) finished PR crates: out of the assembler, along the floor, up a long incline, along the catwalk, over Spark,
    //    and down a chute into the launch silo's loading hopper
    beltSeg([-10.05, BY, 1.85], [-11.0, BY, 3.35], 0.72);
    beltSeg([-11.0, BY, 3.35], [-11.35, BY, 3.4], 0.72);
    beltSeg([-11.35, BY, 3.4], [-11.35, CWY + 0.32, CWZ + 0.15], 0.72);
    trestles([-11.35, BY, 3.4], [-11.35, CWY + 0.32, CWZ + 0.15], 1.9);
    beltSeg([-11.35, CWY + 0.32, CWZ], [10.2, CWY + 0.32, CWZ], 0.62);
    // drop chute: catwalk -> silo hopper
    {
      const A3 = new THREE.Vector3(10.2, CWY + 0.25, CWZ + 0.2), B3 = new THREE.Vector3(10.23, 3.75, -1.95), d = B3.clone().sub(A3), len = d.length();
      const tg = K.group(root, (A3.x + B3.x) / 2, (A3.y + B3.y) / 2, (A3.z + B3.z) / 2); tg.rotation.y = Math.PI / 2;
      const inner = K.group(tg); inner.rotation.z = Math.atan2(-d.y, d.z);
      K.box(len, 0.08, 0.66, M.brassD, 0, 0, 0, inner);
      for (const s of [-0.36, 0.36]) K.box(len, 0.3, 0.06, M.brass, 0, 0.13, s, inner);
    }
    const crateItems = [];
    for (let i = 0; i < 12; i++) {
      const c = K.group(root, 0, -50, 0);
      K.box(0.36, 0.3, 0.36, M.woodD, 0, 0.15, 0, c);
      K.box(0.38, 0.05, 0.38, M.brass, 0, 0.3, 0, c);
      K.box(0.05, 0.31, 0.38, M.brassD, 0, 0.15, 0, c);
      if (i % 3 === 0) K.box(0.14, 0.04, 0.02, K.glow(0x7af0d8), 0.08, 0.2, 0.19, c);
      crateItems.push(c);
    }
    makePath([[-10.05, BY + 0.06, 1.85], [-11.0, BY + 0.06, 3.35], [-11.35, BY + 0.06, 3.4], [-11.35, CWY + 0.38, CWZ + 0.15], [-11.35, CWY + 0.38, CWZ], [10.2, CWY + 0.38, CWZ], [10.2, CWY + 0.3, CWZ + 0.2], [10.23, 3.8, -1.95]], crateItems, 1.15);

    // D) rework belt: rejected crates ride back under the catwalk to Spark, red rails and scar tags
    beltSeg([10.8, BY, -5.0], [1.9, BY, -5.0], 0.62, redRail);
    beltSeg([1.9, BY, -5.0], [1.3, BY, -3.55], 0.62, redRail);
    const rejectBox = K.group(root, 11.4, 0, -5.0);
    K.box(1.0, 1.2, 1.0, M.ironM, 0, 0.6, 0, rejectBox); K.box(0.4, 0.22, 0.06, K.glow(0xb02a14), 0, 0.95, 0.52, rejectBox);
    const reworkBin = K.group(root, 1.1, 0, -3.1);
    K.box(0.8, 0.5, 0.7, K.mat(0x5a1a10), 0, 0.25, 0, reworkBin); for (const s of [-0.38, 0.38]) K.box(0.05, 0.52, 0.72, M.iron, s, 0.26, 0, reworkBin);
    const reworkLamp = K.sph(0.1, K.mat(0x401010), 0, 0.7, 0, reworkBin, 6, 4);
    const rwItems = [];
    for (let i = 0; i < 4; i++) {
      const c = K.group(root, 0, -50, 0);
      K.box(0.34, 0.28, 0.34, K.mat(0x4a2418), 0, 0.14, 0, c); K.box(0.36, 0.04, 0.36, redRail, 0, 0.28, 0, c);
      const tag = K.box(0.12, 0.16, 0.02, K.mat(0xd8c8a0), 0.12, 0.3, 0.18, c); tag.rotation.z = 0.3;
      rwItems.push(c);
    }
    makePath([[10.8, BY + 0.06, -5.0], [1.9, BY + 0.06, -5.0], [1.3, BY + 0.06, -3.55], [1.1, 0.5, -3.1]], rwItems, 0.7);

    // ---------- dirt: oil drums, puddles, scrap, a parts rack ----------
    function drum(x, z, c) { const b = K.group(root, x, 0, z); K.cyl(0.3, 0.3, 0.82, K.mat(c || 0x3a2a1c), 10, 0, 0.41, 0, b); for (const y of [0.18, 0.64]) K.cyl(0.31, 0.31, 0.05, K.mat(0x1a1410), 10, 0, y, 0, b); K.cyl(0.28, 0.28, 0.02, K.mat(0x0a0806, { shine: 60, spec: 0x3a3a3a }), 10, 0, 0.83, 0, b); return b; }
    drum(-13.3, -1.6, 0x5a2418); drum(-13.4, -0.9); drum(-12.8, -2.4, 0x2a3424); drum(13.0, 2.6, 0x5a2418); drum(13.4, 1.9); drum(4.6, 3.0, 0x2a3424); drum(-3.2, -3.3);
    const puddleM = K.mat(0x060504, { shine: 90, spec: 0x6a5a48 });
    for (const [x, z, w, d] of [[-2.8, 2.4, 1.6, 0.9], [3.6, 2.1, 1.2, 0.7], [-12.6, 0.2, 1.0, 1.4], [12.6, 0.2, 1.4, 0.8], [6.4, -3.0, 1.0, 0.6], [-6.4, -2.2, 1.2, 0.7]]) {
      const p = K.cyl(1, 1, 0.01, puddleM, 12, x, 0.025, z, root); p.scale.set(w, 1, d); p.castShadow = false;
    }
    for (let i = 0; i < 18; i++) { const sc = K.box(0.1 + K.rnd() * 0.3, 0.04, 0.05 + K.rnd() * 0.2, K.rnd() < 0.5 ? M.ironL : M.copperD, -14 + K.rnd() * 28, 0.04, 2.6 + K.rnd() * 2.0, root); sc.rotation.y = K.rnd() * 3; }
    const rack = K.group(root, 13.2, 0, -2.6);
    for (const s of [-0.6, 0.6]) K.box(0.08, 2.4, 0.5, colM, s, 1.2, 0, rack);
    for (const y of [0.5, 1.2, 1.9]) { K.box(1.3, 0.06, 0.5, colM, 0, y, 0, rack); for (let i = 0; i < 3; i++) gear(K, rack, 0.16, 0.06, 8, i % 2 ? M.brass : M.ironL, -0.4 + i * 0.4, y + 0.2, 0).rotation.x = Math.PI / 2; }
    const vents = [[-2.4, 1.4], [2.6, -1.9], [-12.8, 4.2], [12.5, 4.2], [6.2, 3.2]];
    for (const [x, z] of vents) { K.box(0.7, 0.06, 0.7, M.ironM, x, 0.03, z, root); for (let i = 0; i < 4; i++) K.box(0.6, 0.07, 0.05, M.soot, x, 0.05, z - 0.24 + i * 0.16, root); }
    // overhead steam pipe run along the back wall, dripping
    K.tube([[-15, 7.2, -6.2], [-6, 7.2, -6.2], [-5.5, 7.0, -5.8], [5.5, 7.0, -5.8], [6, 7.2, -6.2], [15, 7.2, -6.2]], 0.16, M.copperD, root, 40, 6);
    for (const x of [-10, -3, 3, 10]) K.torus(0.2, 0.05, K.mat(0x7a1e14), 5, 10, x, 7.1, -5.85, root);
    const drips = [[-5.4, 6.9, -5.8], [5.2, 6.9, -5.8], [-8.0, CWY - 0.1, CWZ + 0.7], [6.5, CWY - 0.1, CWZ + 0.7], [0.78, 5.7, -2.5]];

    // thin rods (cords, chains, railings, rafters, rungs) cast long shadow streaks across the hall: switch those off
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
      const q = o.geometry.parameters;
      if (q.width !== undefined) { const d = [q.width, q.height, q.depth].sort((a, b) => a - b); if (d[1] <= 0.13) o.castShadow = false; }
      else if (q.radiusTop !== undefined && Math.max(q.radiusTop, q.radiusBottom) <= 0.1) o.castShadow = false;
    });
    const tmp = new THREE.Vector3();
    let tV = 0, tD = 0, craneT = 0;
    return { update(t, dt) {
      dt = Math.max(0, dt);
      furn.forEach((f, i) => f.material.color.setRGB(1, 0.34 + Math.sin(t * 5 + i * 1.7) * 0.06 + Math.sin(t * 11 + i) * 0.04, 0.08));
      if (pitL && !pitL.isDummy) pitL.intensity = 2.0 + Math.sin(t * 7) * 0.25 + Math.sin(t * 13) * 0.15;
      belts.forEach((b) => (b.tex.offset.x -= dt * 1.1 * b.sp));
      paths.forEach((p) => p.items.forEach((it) => { it.s = (it.s + dt * p.speed) % p.total; at(p, it.s, tmp); it.m.position.copy(tmp); const end = p.total - it.s; it.m.visible = end > 0.15; }));
      // crane wanders back and forth along the hall
      craneT += dt * 0.12; const cx = Math.sin(craneT) * 9.5; bridge.position.x = cx;
      trolley.position.z = -3.4 + Math.sin(craneT * 1.7) * 0.9;
      load.rotation.z = Math.cos(craneT) * 0.06; load.rotation.x = Math.sin(t * 0.9) * 0.03;
      hoists.forEach((h, i) => { h.rotation.z = Math.sin(t * 0.7 + i * 2) * 0.03; h.rotation.x = Math.sin(t * 0.5 + i) * 0.02; });
      lampsH.forEach((l) => { l.piv.rotation.z = Math.sin(t * 0.8 + l.ph) * 0.05; l.piv.rotation.x = Math.sin(t * 0.6 + l.ph) * 0.03; const f = 0.9 + Math.sin(t * 17 + l.ph) * 0.04 + (Math.random() < 0.01 ? -0.4 : 0); if (l.L && !l.L.isDummy) l.L.intensity = 1.6 * f; });
      shafts.forEach((s, i) => (s.material.opacity = 0.065 + Math.sin(t * 0.4 + i) * 0.015));
      wArm.rotation.x = Math.sin(t * 3) * 0.5;
      reworkLamp.material.emissive.setHex(Math.sin(t * 5) > 0 ? 0xff2a10 : 0);
      tV -= dt;
      if (tV <= 0) { tV = 0.22; const v = vents[Math.floor(Math.random() * vents.length)]; for (let i = 0; i < 3; i++) puff(K, root, v[0], 0.15, v[1], 0x8a8070, 0.2, 0.9, 0.4, 2.0); }
      tD -= dt;
      if (tD <= 0) { tD = 0.35; const d = drips[Math.floor(Math.random() * drips.length)]; K.spawn(root, d[0] + K.R() * 0.2, d[1], d[2], 0, -0.5, 0, 0x0a0806, 1.6, 0.06, 6); if (Math.random() < 0.4) K.spawn(root, d[0], d[1], d[2], K.R() * 0.2, 0.3, 0, 0x6a6258, 2.4, 0.16, -0.08); }
      if (Math.random() < 0.3) K.spawn(root, -15 + Math.random() * 30, 0.2 + Math.random() * 3, -4 + Math.random() * 8, 0.1, 0.05, 0, 0x5a4a38, 3, 0.04, -0.01);
      // embers rising from the furnace trench
      if (Math.random() < 0.5) K.spawn(root, -15 + Math.random() * 30, -0.3, 5.5 + K.R() * 0.6, K.R() * 0.3, 0.9 + Math.random() * 0.6, K.R() * 0.2, Math.random() < 0.5 ? 0xffa040 : 0xff5a18, 1.4, 0.05, 0, true);
    } };
  }

  // =====================================================================
  // ASSEMBLER: clockwork workshop
  // =====================================================================
  function buildAssembler(K) {
    mats(K);
    const g = K.group();
    // plinth
    K.box(4.9, 0.3, 4.9, M.ironM, 0, 0.15, 0, g);
    K.box(5.0, 0.08, 5.0, M.brassD, 0, 0.32, 0, g);
    for (let i = 0; i < 9; i++) { K.box(0.08, 0.08, 0.08, M.brassL, -2.3 + i * 0.575, 0.2, 2.47, g); K.box(0.08, 0.08, 0.08, M.brassL, 2.47, 0.2, -2.3 + i * 0.575, g); }
    const floor = K.box(4.6, 0.04, 4.6, K.mat(0x3a2c22), 0, 0.37, 0, g);
    for (let i = 0; i < 6; i++) K.box(4.6, 0.02, 0.04, M.soot, 0, 0.395, -2.1 + i * 0.84, g);

    // difference engine under a glass dome (back left)
    const de = K.group(g, -1.1, 0.39, -1.1);
    K.cyl(1.25, 1.35, 0.5, M.iron, 16, 0, 0.25, 0, de);
    band(K, de, 1.3, 0.5, M.brass, 0.1);
    rivetRing(K, de, 1.33, 0.3, 16);
    const stacks = [];
    for (let s = 0; s < 4; s++) {
      const a = s / 4 * Math.PI * 2 + 0.4, sx = Math.cos(a) * 0.55, sz = Math.sin(a) * 0.55;
      K.cyl(0.04, 0.04, 2.3, M.ironL, 6, sx, 1.65, sz, de);
      const col = K.group(de, sx, 0, sz); const gs = [];
      for (let i = 0; i < 6; i++) { const r = 0.3 + ((i + s) % 3) * 0.06; gs.push(gear(K, col, r, 0.08, 10 + ((i + s) % 3) * 2, i % 2 ? M.brass : M.brassL, 0, 0.75 + i * 0.32, 0)); }
      stacks.push({ col, gs, dir: s % 2 ? 1 : -1 });
    }
    K.cyl(0.12, 0.12, 2.4, M.copper, 8, 0, 1.7, 0, de);
    const dome = K.lathe([[1.15, 0], [1.15, 1.6], [1.05, 2.1], [0.8, 2.5], [0.45, 2.75], [0.05, 2.85]], M.glass, 18, 0, 0.5, 0, de);
    dome.castShadow = false;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const rb = K.tube([[Math.cos(a) * 1.17, 0.5, Math.sin(a) * 1.17], [Math.cos(a) * 1.17, 2.1, Math.sin(a) * 1.17], [Math.cos(a) * 0.82, 3.0, Math.sin(a) * 0.82], [Math.cos(a) * 0.08, 3.35, Math.sin(a) * 0.08]], 0.035, M.brass, de, 14, 4); }
    band(K, de, 1.17, 2.1, M.brassD, 0.06);
    K.cyl(0.2, 0.3, 0.25, M.brass, 10, 0, 3.4, 0, de);
    K.cone(0.08, 0.6, M.brassL, 6, 0, 3.8, 0, de);
    const deGlow = K.sph(0.18, K.glow(0xffb45a), 0, 3.6, 0, de, 8, 6);

    // copper boiler with gauges (back right)
    const bo = K.group(g, 1.35, 0.39, -1.35);
    K.cyl(0.75, 0.8, 2.5, M.copper, 14, 0, 1.25, 0, bo);
    for (const y of [0.25, 0.9, 1.6, 2.3]) { band(K, bo, 0.8, y, M.brassD, 0.1); rivetRing(K, bo, 0.81, y + 0.08, 12, M.brassL); }
    K.lathe([[0.76, 0], [0.7, 0.25], [0.45, 0.45], [0.12, 0.55]], M.copperD, 14, 0, 2.5, 0, bo);
    K.cyl(0.12, 0.12, 1.1, M.soot, 8, 0, 3.2, 0, bo);
    K.cyl(0.18, 0.12, 0.2, M.brassD, 8, 0, 3.75, 0, bo);
    const fire = K.box(0.5, 0.42, 0.06, M.ember, 0.0, 0.45, 0.79, bo);
    K.box(0.6, 0.52, 0.04, M.iron, 0.0, 0.45, 0.76, bo);
    for (let i = 0; i < 4; i++) K.box(0.04, 0.42, 0.08, M.soot, -0.18 + i * 0.12, 0.45, 0.81, bo);
    const fireL = K.light(0xff7a30, 1.6, 5, 0.3, 0.6, 1.2, bo);
    const needles = [gauge(K, bo, -0.32, 1.85, 0.74, 0.2, 0.25), gauge(K, bo, 0.32, 1.85, 0.74, 0.2, -0.05), gauge(K, bo, 0.0, 1.3, 0.8, 0.16, 0.1)];
    const gx = gauge(K, bo, 0.8, 1.6, 0.05, 0.18, Math.PI / 2); needles.push(gx);
    // safety valve + whistle
    K.cyl(0.07, 0.07, 0.4, M.brass, 8, 0.4, 2.9, 0.3, bo);
    const whistle = K.cyl(0.1, 0.06, 0.3, M.brassL, 8, 0.4, 3.2, 0.3, bo);
    // red alarm lamp
    const alarm = K.sph(0.13, K.mat(0x401010, { e: 0x000000 }), -0.4, 2.92, 0.4, bo, 8, 6);
    K.cyl(0.1, 0.13, 0.08, M.brassD, 8, -0.4, 2.8, 0.4, bo);
    // pipe boiler -> engine
    K.tube([[0.75, 1.9, -1.35], [0.2, 2.3, -1.6], [-0.6, 2.4, -1.6], [-1.1, 2.2, -1.5]], 0.07, M.copper, g, 20, 6);
    K.tube([[0.9, 0.9, -0.6], [0.3, 0.6, -0.1], [-0.2, 0.55, -0.1]], 0.06, M.verd, g, 16, 5);

    // workbench + articulated brass arm (front right)
    const bench = K.group(g, 1.2, 0.39, 1.0);
    K.box(2.2, 0.14, 1.2, M.wood, 0, 0.95, 0, bench);
    K.box(2.25, 0.05, 1.25, M.brassD, 0, 1.03, 0, bench);
    for (const sx of [-0.95, 0.95]) for (const sz of [-0.45, 0.45]) K.box(0.12, 0.9, 0.12, M.iron, sx, 0.45, sz, bench);
    K.box(1.9, 0.08, 0.9, M.woodD, 0, 0.3, 0, bench);
    // tools hanging and a vise
    K.box(0.3, 0.2, 0.25, M.ironL, 0.75, 1.15, -0.3, bench);
    const pr = K.group(bench, -0.15, 1.04, 0.05); // the PR chest under construction
    K.box(0.7, 0.36, 0.48, M.woodD, 0, 0.18, 0, pr);
    for (const x of [-0.3, 0.3]) K.box(0.06, 0.38, 0.5, M.brass, x, 0.19, 0, pr);
    const lid = K.group(pr, 0, 0.36, -0.24); K.box(0.72, 0.08, 0.5, M.wood, 0, 0.04, 0.24, lid); K.box(0.74, 0.04, 0.06, M.brass, 0, 0.08, 0.48, lid);
    const prGlow = K.box(0.6, 0.04, 0.38, K.glow(0x7af0d8), 0, 0.37, 0, pr);
    // arm on a turret
    const armBase = K.group(g, 0.25, 0.39, 0.55);
    K.cyl(0.38, 0.45, 0.35, M.iron, 12, 0, 0.17, 0, armBase); band(K, armBase, 0.42, 0.34, M.brass, 0.06);
    const yawG = K.group(armBase, 0, 0.4, 0);
    K.cyl(0.3, 0.3, 0.2, M.brass, 12, 0, 0.1, 0, yawG);
    const sh = K.group(yawG, 0, 0.3, 0);
    gear(K, sh, 0.2, 0.1, 10, M.brassL, 0.15, 0, 0).rotation.z = Math.PI / 2;
    K.sph(0.15, M.brassD, 0, 0, 0, sh, 8, 6);
    K.box(0.14, 1.1, 0.14, M.brass, 0, 0.55, 0, sh);
    K.box(0.05, 1.0, 0.05, M.copper, 0.12, 0.55, 0.05, sh);
    const piston = K.cyl(0.045, 0.045, 0.6, M.ironL, 6, -0.12, 0.4, 0, sh);
    const el = K.group(sh, 0, 1.1, 0);
    K.sph(0.13, M.brassD, 0, 0, 0, el, 8, 6);
    K.box(0.11, 0.85, 0.11, M.brass, 0, 0.42, 0, el);
    const wr = K.group(el, 0, 0.85, 0);
    K.cyl(0.08, 0.08, 0.14, M.brassD, 8, 0, 0, 0, wr);
    K.box(0.22, 0.08, 0.14, M.iron, 0, -0.1, 0, wr);
    const torch = K.cone(0.06, 0.22, M.copper, 6, 0, -0.25, 0, wr); torch.rotation.x = Math.PI;
    const tip = K.group(wr, 0, -0.38, 0);
    const spark = K.sph(0.07, K.glow(0xfff2c0), 0, 0, 0, tip, 6, 4);

    // punch card reader (front left) with a card ribbon spilling into a tray
    const pc = K.group(g, -1.3, 0.39, 1.4);
    K.box(1.3, 0.8, 0.8, M.ironM, 0, 0.4, 0, pc);
    K.box(1.35, 0.08, 0.85, M.brass, 0, 0.82, 0, pc);
    const rollers = [];
    for (const x of [-0.35, 0.35]) { const r = K.cyl(0.12, 0.12, 0.7, M.brassL, 10, x, 1.0, 0, pc); r.rotation.x = Math.PI / 2; rollers.push(r); }
    const cards = [];
    for (let i = 0; i < 9; i++) { const c = K.box(0.5, 0.025, 0.55, M.cream, 0, 0, 0, pc); cards.push(c); for (let h = 0; h < 3; h++) K.box(0.06, 0.03, 0.06, M.soot, -0.15 + h * 0.15, 0.003, -0.1 + (h % 2) * 0.2, c); }
    K.box(0.9, 0.12, 0.7, M.woodD, 0.25, 0.06, 0.55, pc);
    const ticker = []; for (let i = 0; i < 4; i++) ticker.push(K.box(0.12, 0.12, 0.03, K.mat(0x2a1a10, { e: 0 }), -0.42 + i * 0.16, 0.55, 0.41, pc));
    // stack of crates of finished work
    for (let i = 0; i < 3; i++) { const c = K.box(0.45, 0.4, 0.45, i === 1 ? M.wood : M.woodD, -2.0 + (i % 2) * 0.1, 0.59 + i * 0.4, -0.15 + (i % 2) * 0.06, g); c.rotation.y = i * 0.3; }

    const ARM = [
      [0, 0.6, 0.5, 1.2], [0.2, 0.2, 0.9, 1.0], [0.35, 0.0, 1.05, 0.9], [0.55, -0.2, 1.0, 1.0], [0.75, 0.35, 0.95, 1.1], [1, 0.6, 0.5, 1.2]
    ];
    let k = 0, tS = 0, tCard = 0, cardOff = 0, tTick = 0;
    return { g, update(t, dt, s) {
      const work = s === 'WORKING', blk = s === 'BLOCKED';
      const speed = work ? 2.4 : blk ? 0 : 0.35;
      stacks.forEach((st, i) => { st.col.children.forEach((gg, j) => (gg.rotation.y += dt * speed * st.dir * (j % 2 ? 1.3 : -1))); if (blk) st.col.rotation.y = Math.sin(t * 40 + i) * 0.02; });
      deGlow.material.color.setHex(blk ? (Math.sin(t * 10) > 0 ? 0xff4020 : 0x401008) : work ? 0xffd27a : 0x8a5a2a);
      // gauges
      needles.forEach((n, i) => { const base = work ? 0.2 + Math.sin(t * 2.3 + i) * 0.35 : blk ? -1.15 + Math.sin(t * 30 + i) * 0.06 : 0.9 + Math.sin(t * 0.7 + i) * 0.05; n.rotation.z = base; });
      // fire
      const ff = (work ? 1 : blk ? 1.4 : 0.5) * (0.85 + Math.sin(t * 17) * 0.1 + Math.sin(t * 6.1) * 0.1);
      fire.material.color.setHex(blk ? 0xff5020 : work ? 0xffa040 : 0xb05020);
      if (!fireL.isDummy) fireL.intensity = 1.5 * ff;
      alarm.material.emissive.setHex(blk && Math.sin(t * 9) > 0 ? 0xff2a10 : 0);
      // arm
      let pose;
      if (work) { k = (k + dt * 0.35) % 1; pose = K.keyframes(ARM, k); }
      else if (blk) pose = [0.5 + Math.sin(t * 30) * 0.02, 0.2, 1.6, 1.4];
      else pose = [0.6 + Math.sin(t * 0.5) * 0.15, 0.1, 0.6, 1.3];
      yawG.rotation.y = pose[0]; sh.rotation.z = -pose[1] - 0.15; el.rotation.z = -pose[2]; wr.rotation.z = Math.PI - pose[3] * 0.5 + (pose[1] + pose[2]) * 0.0;
      sh.rotation.x = 0;
      spark.visible = work && k > 0.25 && k < 0.6 && Math.sin(t * 50) > -0.3;
      lid.rotation.x = work ? -0.9 - Math.sin(t * 0.8) * 0.2 : blk ? -0.2 : 0;
      prGlow.visible = work;
      tS -= dt;
      if (work && spark.visible && tS <= 0) {
        tS = 0.03; tip.getWorldPosition(K.v3); g.worldToLocal(K.v3);
        K.spawn(g, K.v3.x, K.v3.y, K.v3.z, K.R() * 2.4, 0.6 + Math.random() * 1.6, K.R() * 2.4, Math.random() < 0.5 ? 0xffd25a : 0xfff4d0, 0.45, 0.06, 6, true);
      }
      // steam: whistle when working, hard venting when blocked, lazy chimney
      if (Math.random() < (blk ? 0.9 : work ? 0.35 : 0.1)) {
        K.spawn(g, 1.75 + K.R() * 0.1, 3.75, -0.95, K.R() * 0.4 + (blk ? 0.6 : 0.1), blk ? 2.4 : 1.2, K.R() * 0.4 + (blk ? 0.6 : 0), 0xa89c88, blk ? 1.6 : 1.4, blk ? 0.2 : 0.14, -0.15);
        K.spawn(g, 1.35, 4.0, -1.35, K.R() * 0.2 + 0.2, 0.8, K.R() * 0.2, 0x3a302a, 2.4, 0.22, -0.1);
      }
      // cards feed through the rollers and fold into the tray
      rollers.forEach((r) => (r.rotation.y += dt * (work ? 6 : 0)));
      if (work) cardOff = (cardOff + dt * 0.6) % 1;
      cards.forEach((c, i) => {
        const p = (i / cards.length + cardOff) % 1;
        if (p < 0.4) { c.position.set(-0.4 + p * 2.0, 1.12, 0); c.rotation.set(0, 0, 0); }
        else { const q = (p - 0.4) / 0.6; c.position.set(0.45 + q * 0.15, 1.1 - q * 0.95, 0.35 + q * 0.2); c.rotation.set(0, 0, (Math.floor(i) % 2 ? 1 : -1) * 0.5 * (1 - q)); }
      });
      tTick -= dt; if (tTick <= 0) { tTick = work ? 0.12 : 0.6; ticker.forEach((m) => m.material.emissive.setHex(blk ? (Math.sin(t * 9) > 0 ? 0xc02010 : 0) : Math.random() < 0.5 ? (work ? 0xffa84a : 0x5a3a1a) : 0)); }
    } };
  }

  // =====================================================================
  // SPLITTER (Spark): aetheric sorting engine with an orrery brain
  // =====================================================================
  function buildSplitter(K) {
    mats(K);
    const g = K.group();
    // octagonal stone dais in steps
    K.cyl(2.5, 2.6, 0.3, K.mat(0xffffff, { map: stoneTex(K, [4, 0.3]) }), 8, 0, 0.15, 0, g);
    K.cyl(2.15, 2.25, 0.25, M.ironM, 8, 0, 0.42, 0, g);
    K.cyl(2.2, 2.2, 0.06, M.brassD, 8, 0, 0.56, 0, g); K.cyl(1.9, 1.9, 0.05, M.soot, 8, 0, 0.6, 0, g);
    rivetRing(K, g, 2.2, 0.5, 16);
    // four iron columns with brass capitals
    const colR = 1.35;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * colR, z = Math.sin(a) * colR;
      K.cyl(0.16, 0.2, 4.2, M.iron, 8, x, 2.65, z, g);
      for (const y of [0.9, 2.4, 3.9]) K.cyl(0.24, 0.24, 0.12, M.brass, 8, x, y, z, g);
      K.cyl(0.3, 0.2, 0.25, M.brassD, 8, x, 4.8, z, g);
    }
    // crown ring + dome
    K.torus(1.45, 0.12, M.brass, 6, 24, 0, 4.95, 0, g).rotation.x = Math.PI / 2;
    K.torus(1.45, 0.06, M.brassD, 4, 24, 0, 0.75, 0, g).rotation.x = Math.PI / 2;
    K.lathe([[1.5, 0], [1.35, 0.35], [1.0, 0.75], [0.55, 1.0], [0.15, 1.1]], K.mat(C.verd, { shine: 20, spec: 0x2a4a40, double: true }), 8, 0, 5.0, 0, g);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.tube([[Math.cos(a) * 1.5, 5.0, Math.sin(a) * 1.5], [Math.cos(a) * 1.1, 5.7, Math.sin(a) * 1.1], [Math.cos(a) * 0.15, 6.1, Math.sin(a) * 0.15]], 0.03, M.brass, g, 10, 4); }
    K.cyl(0.08, 0.1, 0.9, M.brass, 6, 0, 6.5, 0, g);
    const rodTip = K.sph(0.12, K.glow(0xbffff0), 0, 7.0, 0, g, 8, 6);
    for (const y of [6.2, 6.45, 6.7]) K.torus(0.16, 0.03, M.copper, 4, 10, 0, y, 0, g).rotation.x = Math.PI / 2;

    // the brain: a glowing aether core inside a spinning orrery
    const brain = K.group(g, 0, 2.85, 0);
    const core = K.sph(0.5, K.glow(C.teal), 0, 0, 0, brain, 14, 10);
    const halo = K.sph(0.7, K.glow(0x3ac0a0, 0.25, true), 0, 0, 0, brain, 14, 10);
    const coreL = K.light(0x6af0d0, 1.0, 4.5, 0, 0, 0, brain);
    const rings = [];
    [[0.95, 0.4, 0.3, 0xd9ac55], [1.12, -0.6, 1.1, 0xb08030], [0.8, 1.3, -0.5, 0xa0532c]].forEach(([r, rx, rz, c], i) => {
      const piv = K.group(brain); piv.rotation.set(rx, 0, rz);
      const ring = K.group(piv);
      K.torus(r, 0.035, K.mat(c, { shine: 40, spec: 0x806030 }), 4, 30, 0, 0, 0, ring).rotation.x = Math.PI / 2;
      K.sph(0.11 - i * 0.015, K.mat([0xc05a2a, 0x5a7ab0, 0xc89a3a][i], { shine: 30, spec: 0x806040, e: [0x301008, 0x0c1428, 0x2a2008][i] }), r, 0, 0, ring, 8, 6);
      K.sph(0.05, M.brassL, -r, 0, 0, ring, 6, 4);
      rings.push({ ring, sp: [0.9, -1.3, 1.7][i] });
    });
    // sorting carousel: a ring of brass buckets
    const car = K.group(g, 0, 1.5, 0);
    K.torus(1.0, 0.05, M.brassD, 4, 28, 0, 0, 0, car).rotation.x = Math.PI / 2;
    const buckets = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const b = K.group(car, Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0); K.cyl(0.16, 0.12, 0.22, M.copper, 8, 0, -0.1, 0, b); const ld = K.sph(0.09, K.mat(0x202020), 0, 0.02, 0, b, 6, 4); buckets.push(ld); }
    K.cyl(0.1, 0.1, 1.3, M.ironL, 6, 0, 1.4, 0, g);

    // hopper at the back where raw ore arrives
    const hop = K.group(g, -0.8, 0, -1.9);
    K.lathe([[0.15, 0], [0.7, 0.7], [0.75, 0.9]], M.copperD, 8, 0, 3.6, 0, hop);
    K.cyl(0.12, 0.12, 1.0, M.copper, 8, 0, 3.1, 0, hop);
    for (const sx of [-0.5, 0.5]) K.box(0.08, 3.6, 0.08, M.iron, sx, 1.8, 0, hop);
    K.tube([[-0.8, 2.6, -1.9], [-0.5, 2.6, -1.1], [-0.3, 2.85, -0.5]], 0.09, M.copper, g, 12, 6);

    // three pneumatic glass tubes from the core out to three chutes
    const ORE = [0xc05a2a, 0x5a7ab0, 0xd09a3a];
    const outs = [[2.05, 0.6, 0.6], [0.6, 0.6, 2.05], [1.65, 0.6, 1.65]];
    const curves = [], caps = [], outLamps = [];
    outs.forEach(([x, y, z], i) => {
      const pts = [[0, 2.85, 0], [x * 0.35, 3.6 - i * 0.2, z * 0.35], [x * 0.75, 2.9, z * 0.75], [x * 0.95, 1.6, z * 0.95], [x, 1.0, z]];
      const curve = new K.THREE.CatmullRomCurve3(pts.map((p) => new K.THREE.Vector3(p[0], p[1], p[2])));
      curves.push(curve);
      const gl = K.tube(pts, 0.13, M.glass, g, 30, 8); gl.castShadow = false;
      for (const u of [0.25, 0.5, 0.75]) { const p = curve.getPoint(u); const r = K.torus(0.15, 0.035, M.brass, 4, 10, p.x, p.y, p.z, g); const tn = curve.getTangent(u); r.lookAt(p.x + tn.x, p.y + tn.y, p.z + tn.z); }
      // chute + bin
      const ch = K.group(g, x, 0, z); ch.rotation.y = Math.atan2(x, z);
      K.box(0.55, 0.55, 0.55, M.ironM, 0, 0.85, 0, ch);
      K.box(0.6, 0.06, 0.6, M.brass, 0, 1.13, 0, ch);
      K.box(0.42, 0.08, 0.6, M.brassD, 0, 0.62, 0.45, ch).rotation.x = 0.4;
      const bin = K.group(ch, 0, 0, 0.95); K.box(0.7, 0.36, 0.5, M.woodD, 0, 0.18, 0, bin); for (const bx of [-0.33, 0.33]) K.box(0.04, 0.38, 0.52, M.iron, bx, 0.19, 0, bin);
      for (let k = 0; k < 3; k++) K.rock(0.09, K.mat(ORE[i], { e: ORE[i] & 0x3f3f3f }), -0.18 + k * 0.18, 0.37, K.R() * 0.2, bin);
      const lp = K.sph(0.09, K.mat(0x1a1a1a, { e: 0 }), 0, 1.3, 0, ch, 8, 6); outLamps.push(lp);
      K.cyl(0.07, 0.09, 0.06, M.brassD, 8, 0, 1.2, 0, ch);
      for (let c = 0; c < 2; c++) { const cp = K.cyl(0.07, 0.07, 0.2, K.mat(ORE[i], { e: ORE[i] }), 8, 0, 0, 0, g); cp.rotation.x = Math.PI / 2; caps.push({ m: cp, tube: i, u: c * 0.5 }); }
    });
    // control lectern with a brass lever and dials
    const lec = K.group(g, 2.0, 0.56, -1.0); lec.rotation.y = -0.5;
    K.box(0.6, 0.9, 0.4, M.wood, 0, 0.45, 0, lec);
    const lt = K.box(0.7, 0.08, 0.5, M.brassD, 0, 0.95, 0.03, lec); lt.rotation.x = 0.35;
    const lever = K.group(lec, 0.15, 1.0, 0.05); K.box(0.05, 0.45, 0.05, M.ironL, 0, 0.22, 0, lever); K.sph(0.07, K.mat(0x8a1a10), 0, 0.46, 0, lever, 6, 4);
    const lecN = gauge(K, lec, -0.15, 1.02, 0.12, 0.12, 0); lecN.parent.rotation.x = -1.2;

    let tArc = 0, tOre = 0;
    return { g, update(t, dt, s) {
      const on = s === 'SORTING';
      const sp = on ? 1 : 0.18;
      rings.forEach((r) => (r.ring.rotation.y += dt * r.sp * sp * 1.6));
      brain.rotation.y += dt * 0.2 * sp;
      const pulse = on ? 0.85 + Math.sin(t * 6) * 0.15 : 0.45 + Math.sin(t * 1.2) * 0.05;
      core.scale.setScalar(pulse); halo.scale.setScalar(pulse * (1.1 + Math.sin(t * 9) * 0.05));
      core.material.color.setHex(on ? C.teal : 0x2a7a6a);
      if (!coreL.isDummy) coreL.intensity = on ? 1.0 + Math.sin(t * 13) * 0.2 : 0.35;
      rodTip.material.color.setHex(on && Math.sin(t * 23) > 0.2 ? 0xffffff : 0x4a8a7a);
      car.rotation.y += dt * (on ? 1.4 : 0.15);
      buckets.forEach((b, i) => b.material.color.setHex(on ? ORE[i % 3] : 0x202020));
      caps.forEach((c) => {
        c.m.visible = on;
        if (!on) return;
        c.u += Math.max(0, dt) * 0.45;
        c.u = ((c.u % 1) + 1) % 1; const p = curves[c.tube].getPoint(c.u); c.m.position.copy(p);
        const tn = curves[c.tube].getTangent(c.u); c.m.lookAt(p.x + tn.x, p.y + tn.y, p.z + tn.z);
      });
      outLamps.forEach((l, i) => l.material.emissive.setHex(on && Math.sin(t * 4 + i * 2.1) > 0 ? ORE[i] : 0));
      lever.rotation.z = on ? -0.6 : 0.4;
      lecN.rotation.z = on ? Math.sin(t * 3) * 0.6 : 0.9;
      tArc -= dt;
      if (on && tArc <= 0) {
        tArc = 0.05;
        const a = Math.random() * Math.PI * 2, rr = 0.6 + Math.random() * 0.5;
        K.spawn(g, Math.cos(a) * rr, 2.85 + K.R() * 0.8, Math.sin(a) * rr, Math.cos(a) * 1.2, K.R(), Math.sin(a) * 1.2, Math.random() < 0.6 ? 0xbffff0 : 0x6af0d0, 0.3, 0.05, 0, true);
        if (Math.random() < 0.3) K.spawn(g, K.R() * 0.2, 7.0, K.R() * 0.2, K.R() * 2, Math.random() * 1.5, K.R() * 2, 0xffffff, 0.25, 0.05, 0, true);
      }
      tOre -= dt;
      if (on && tOre <= 0) { tOre = 0.5; const c = ORE[Math.floor(Math.random() * 3)]; K.spawn(g, -0.8 + K.R() * 0.3, 4.7, -1.9 + K.R() * 0.3, 0, -1.5, 0, c, 0.8, 0.14, 2); }
      if (Math.random() < (on ? 0.15 : 0.04)) K.spawn(g, K.R() * 0.4, 6.15, K.R() * 0.4, K.R() * 0.3 + 0.2, 0.7, K.R() * 0.3, 0x9a8e7c, 2.0, 0.14, -0.12);
    } };
  }

  // =====================================================================
  // LAUNCH PAD: brass rocket in a riveted gantry
  // =====================================================================
  function hazardStripe(K, i) { return i % 2 ? M.soot : K.mat(0xb08a2a); }
  function buildLaunch(K) {
    mats(K);
    const g = K.group();
    // octagonal iron pad with a flame trench
    K.cyl(2.55, 2.65, 0.35, K.mat(0xffffff, { map: stoneTex(K, [4, 0.3]) }), 8, 0, 0.17, 0, g);
    K.cyl(2.3, 2.3, 0.12, M.ironM, 8, 0, 0.41, 0, g);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.32, 0.05, 0.12, i % 2 ? M.soot : K.mat(0xc89a3a), Math.cos(a) * 2.25, 0.48, Math.sin(a) * 2.25, g).rotation.y = -a; }
    K.box(4.8, 0.06, 0.8, M.soot, 0, 0.475, 0, g).rotation.y = Math.PI / 4;
    for (let i = 0; i < 6; i++) { const gr = K.box(0.06, 0.07, 0.8, M.ironL, -1.2 + i * 0.5, 0.5, 0, g); gr.position.set(Math.cos(Math.PI / 4) * (-1.25 + i * 0.5), 0.5, -Math.sin(Math.PI / 4) * (-1.25 + i * 0.5)); gr.rotation.y = Math.PI / 4; }
    const pedestal = K.cyl(0.85, 0.95, 0.35, M.iron, 12, 0.2, 0.62, 0.2, g); band(K, pedestal, 0.9, 0.1, M.brass, 0.06);

    // gantry tower, back left
    const gt = K.group(g, -1.55, 0.47, -1.55);
    const H = 6.4;
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) K.box(0.13, H, 0.13, K.mat(0x7a2a1c), sx, H / 2, sz, gt);
    for (let y = 0.7; y < H; y += 0.8) {
      for (const [x, z, ry] of [[0, 0.45, 0], [0, -0.45, 0], [0.45, 0, Math.PI / 2], [-0.45, 0, Math.PI / 2]]) {
        const br = K.box(0.06, 1.1, 0.06, K.mat(0x6a2418), x, y + 0.0, z, gt); br.rotation.set(0, ry, 0.73 * ((y * 10) % 2 > 1 ? 1 : -1));
        K.box(0.9, 0.07, 0.07, K.mat(0x6a2418), x, y - 0.4, z, gt).rotation.y = ry;
      }
    }
    K.box(1.2, 0.1, 1.2, M.ironM, 0, H, 0, gt);
    for (const sx of [-0.55, 0.55]) K.box(0.05, 0.4, 1.2, M.iron, sx, H + 0.2, 0, gt);
    const crane = K.group(gt, 0, H + 0.1, 0); K.box(1.8, 0.1, 0.1, M.ironL, 0.7, 0.5, 0, crane); K.box(0.06, 0.6, 0.06, M.ironL, 0, 0.3, 0, crane);
    const beacon = K.sph(0.12, K.mat(0x401010), 0, H + 0.62, 0, gt, 8, 6);
    // lift cage
    const cage = K.group(gt, 0, 1, 0); K.box(0.7, 0.6, 0.7, K.mat(0x3a2a1c, { op: 0.0 }), 0, 0.3, 0, cage);
    for (const sx of [-0.33, 0.33]) for (const sz of [-0.33, 0.33]) K.box(0.04, 0.6, 0.04, M.brass, sx, 0.3, sz, cage);
    K.box(0.7, 0.05, 0.7, M.brass, 0, 0.6, 0, cage); K.box(0.7, 0.05, 0.7, M.brassD, 0, 0, 0, cage);
    // service arm that swings away at launch
    const armP = K.group(gt, 0.45, 3.9, 0.45);
    const sarm = K.group(armP); K.box(1.55, 0.14, 0.18, M.ironL, 0.75, 0, 0, sarm); K.box(1.5, 0.05, 0.05, M.brass, 0.75, 0.1, 0.05, sarm);
    K.tube([[0, -0.1, 0], [0.8, -0.3, 0], [1.5, -0.15, 0]], 0.05, M.leather, sarm, 10, 5);
    armP.rotation.y = -Math.PI / 4;

    // horizontal boiler tank on saddles, right side
    const tank = K.group(g, -2.0, 0.47, 0.6); tank.rotation.y = -Math.PI / 4;
    for (const x of [-0.55, 0.55]) K.box(0.18, 0.4, 0.9, M.iron, x, 0.2, 0, tank);
    const tb = K.cyl(0.42, 0.42, 1.7, M.copper, 14, 0, 0.75, 0, tank); tb.rotation.z = Math.PI / 2;
    for (const x of [-0.85, 0.85]) { const cap = K.sph(0.42, M.copperD, x, 0.75, 0, tank, 12, 8); cap.scale.x = 0.35; }
    for (const x of [-0.5, 0, 0.5]) { const b = K.cyl(0.44, 0.44, 0.07, M.brassD, 14, x, 0.75, 0, tank); b.rotation.z = Math.PI / 2; }
    const tankN = gauge(K, tank, 0.0, 1.25, 0.25, 0.15, 0); tankN.parent.rotation.x = -0.4;
    K.tube([[-1.7, 1.0, 0.5], [-1.0, 0.9, 0.4], [-0.4, 0.9, 0.25]], 0.07, M.copper, g, 14, 6);

    // countdown clock tower, front right
    const ck = K.group(g, 1.75, 0.47, -1.05); ck.rotation.y = Math.PI / 4;
    K.box(0.5, 1.9, 0.5, M.woodD, 0, 0.95, 0, ck);
    K.box(0.6, 0.12, 0.6, M.brassD, 0, 1.95, 0, ck);
    const face = K.cyl(0.42, 0.42, 0.08, M.cream, 16, 0, 2.4, 0.18, ck); face.rotation.x = Math.PI / 2;
    const rim = K.torus(0.43, 0.06, M.brass, 6, 18, 0, 2.4, 0.22, ck);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.04, i % 3 ? 0.06 : 0.1, 0.02, M.soot, Math.sin(a) * 0.33, 2.4 + Math.cos(a) * 0.33, 0.23, ck).rotation.z = -a; }
    const hand = K.group(ck, 0, 2.4, 0.25); K.box(0.04, 0.32, 0.02, K.mat(0x8a1a10), 0, 0.15, 0, hand);
    K.cone(0.18, 0.3, M.brassD, 6, 0, 2.95, 0, ck);
    const bell = K.cone(0.14, 0.18, M.brassL, 8, 0, 3.2, 0, ck);
    const ckLamp = K.sph(0.1, K.mat(0x2a1a10), 0, 1.6, 0.27, ck, 8, 6);

    // the rocket
    const rk = K.group(g, 0.2, 0.8, 0.2);
    const prof = [[0.0, 0], [0.42, 0.02], [0.52, 0.3], [0.56, 1.0], [0.56, 2.2], [0.5, 2.8], [0.38, 3.3], [0.2, 3.75], [0.05, 4.0]];
    K.lathe(prof.slice(0, 6), M.brass, 16, 0, 0, 0, rk);
    K.lathe(prof.slice(5), M.copper, 16, 0, 0, 0, rk);
    K.cyl(0.03, 0.05, 0.6, M.brassL, 6, 0, 4.25, 0, rk);
    K.sph(0.07, M.brassL, 0, 4.55, 0, rk, 6, 4);
    for (const y of [0.35, 1.05, 1.75, 2.45]) { K.torus(0.565, 0.035, M.brassD, 4, 22, 0, y, 0, rk).rotation.x = Math.PI / 2; rivetRing(K, rk, 0.575, y + 0.09, 14, M.brassL); }
    const ports = [];
    for (const [y, a] of [[1.4, 0.785], [2.1, 0.785], [1.4, 2.3]]) {
      const pg = K.group(rk, Math.cos(a) * 0.55, y, Math.sin(a) * 0.55); pg.rotation.y = -a + Math.PI / 2;
      K.cyl(0.15, 0.15, 0.06, M.brassL, 12, 0, 0, 0, pg).rotation.x = Math.PI / 2;
      ports.push(K.cyl(0.1, 0.1, 0.08, K.glow(0xffc070), 12, 0, 0, 0.01, pg)); ports[ports.length - 1].rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4, fin = K.group(rk); fin.rotation.y = -a;
      const f = K.box(0.06, 1.0, 0.7, M.copperD, 0, 0.45, 0.75, fin); f.rotation.x = 0.25;
      K.box(0.08, 0.08, 0.6, M.brass, 0, -0.05, 0.85, fin);
    }
    const nozzle = K.lathe([[0.18, 0], [0.3, -0.35], [0.36, -0.42]], M.ironL, 12, 0, 0.05, 0, rk);
    // flame
    const plume = K.group(rk, 0, -0.35, 0);
    const fl1 = K.cone(0.33, 1.6, K.glow(0xffd27a, 0.95, true), 10, 0, -0.8, 0, plume); fl1.rotation.x = Math.PI;
    const fl2 = K.cone(0.2, 1.0, K.glow(0xffffff, 1, true), 8, 0, -0.5, 0, plume); fl2.rotation.x = Math.PI;
    const fl3 = K.cone(0.5, 2.6, K.glow(0xff6a20, 0.5, true), 10, 0, -1.3, 0, plume); fl3.rotation.x = Math.PI;
    plume.visible = false;
    const plumeL = K.light(0xff8a3a, 0, 9, 0, -0.6, 0, rk);
    // hold-down clamps
    const clamps = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2, cg = K.group(g, 0.2 + Math.cos(a) * 0.95, 0.8, 0.2 + Math.sin(a) * 0.95); cg.rotation.y = -a;
      K.box(0.25, 0.2, 0.25, M.iron, 0, 0.0, 0, cg);
      const jaw = K.group(cg, 0, 0.1, 0); K.box(0.14, 0.55, 0.14, M.brassD, 0, 0.27, 0, jaw); K.box(0.22, 0.1, 0.14, M.brass, -0.08, 0.52, 0, jaw);
      clamps.push(jaw);
    }

    // undercroft silo: a riveted half-wall around the pad, a loading hopper fed from the catwalk, a roof hatch
    const siloM = K.mat(0x2a221b, { double: true, shine: 6, spec: 0x1a1410 });
    const wallG = new K.THREE.CylinderGeometry(2.95, 2.95, 1.5, 20, 1, true, 2.356, Math.PI);
    K.mesh(wallG, siloM, 0.2, 0.75, 0.2, g);
    for (let i = 0; i <= 10; i++) { const a = 2.356 + i / 10 * Math.PI; K.box(0.14, 1.55, 0.14, M.ironM, 0.2 + Math.sin(a) * 2.97, 0.78, 0.2 + Math.cos(a) * 2.97, g); }
    const lipG = new K.THREE.CylinderGeometry(3.02, 3.02, 0.16, 20, 1, true, 2.356, Math.PI);
    K.mesh(lipG, K.mat(0xb08a2a, { double: true }), 0.2, 1.52, 0.2, g);
    const hp = K.group(g, 0.4, 0, -2.75);
    K.lathe([[0.16, 0], [0.62, 0.55], [0.66, 0.7]], M.brassD, 8, 0, 2.75, 0, hp);
    for (const sx of [-0.45, 0.45]) K.box(0.08, 2.8, 0.08, M.iron, sx, 1.4, 0, hp);
    K.tube([[0, 2.75, 0], [0, 2.2, 0.6], [-0.2, 1.6, 1.4]], 0.1, M.copperD, hp, 12, 6);
    const hatch = K.group(g, 0.2, 9.55, 0.2);
    K.box(2.9, 0.18, 0.24, M.iron, 0, 0, 1.3, hatch); K.box(2.9, 0.18, 0.24, M.iron, 0, 0, -1.3, hatch);
    K.box(0.24, 0.18, 2.9, M.iron, 1.3, 0, 0, hatch); K.box(0.24, 0.18, 2.9, M.iron, -1.3, 0, 0, hatch);
    const doors = [];
    for (const s of [-1, 1]) { const d = K.group(hatch, s * 0.6, 0.05, 0); K.box(1.2, 0.1, 2.4, K.mat(0x2a221b), 0, 0, 0, d); for (let i = 0; i < 4; i++) K.box(1.2, 0.05, 0.08, hazardStripe(K, i), 0, 0.07, -0.9 + i * 0.6, d); doors.push({ d, s }); }
    const sky = K.box(2.3, 0.05, 2.3, K.glow(0x4a5664), 0, 0.2, 0, hatch); sky.visible = false;
    const shaftDown = K.cyl(1.3, 1.6, 8.6, K.glow(0xbfd0e0, 0.05, true), 14, 0, -4.3, 0, hatch); shaftDown.visible = false; shaftDown.castShadow = false;
    let phase = 0, cycleS = null, tPuff = 0;
    const LAUNCH_T = 9;
    return { g, update(t, dt, s) {
      const cd = s === 'COUNTDOWN', la = s === 'LAUNCH';
      const open = cd ? 0.35 : la ? 1 : 0;
      doors.forEach((o) => (o.d.position.x += (o.s * (0.6 + open * 1.2) - o.d.position.x) * Math.min(1, dt * 2.5)));
      sky.visible = open > 0.5; shaftDown.visible = open > 0.5;
      if (la) { if (cycleS !== 'LAUNCH') phase = 0; phase += dt; if (phase > LAUNCH_T) phase = 0; } else phase = 0;
      cycleS = s;
      // clock
      hand.rotation.z = cd ? -((t * 0.9) % (Math.PI * 2)) : la ? -Math.min(phase, 1) * 6.28 : 0;
      ckLamp.material.emissive.setHex(cd ? (Math.sin(t * 8) > 0 ? 0xffa030 : 0) : la && phase < 6 ? 0x60ff90 : 0);
      bell.rotation.z = cd ? Math.sin(t * 20) * 0.2 : 0;
      beacon.material.emissive.setHex((cd || la) && Math.sin(t * 6) > 0 ? 0xff3020 : 0);
      cage.position.y = cd || la ? 0.3 : 1 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 3.5;
      tankN.rotation.z = cd ? -0.6 + Math.sin(t * 5) * 0.1 : la ? -1.1 : 0.7;
      ports.forEach((p) => p.material.color.setHex(cd || la ? 0xffe0a0 : 0xb07a3a));
      // service arm swings away
      const armTarget = la ? 0.9 : cd ? 0.3 : -Math.PI / 4 + 0.0;
      armP.rotation.y += ((la || cd ? armTarget : -Math.PI / 4) - armP.rotation.y) * Math.min(1, dt * 2);
      // rocket flight
      let y = 0.8, ign = 0;
      if (la) {
        if (phase < 1.5) { ign = phase / 1.5; y = 0.8 + Math.sin(phase * 40) * 0.015; }
        else if (phase < 6) { const q = phase - 1.5; y = 0.8 + q * q * 2.2; ign = 1; }
        else { y = 60; ign = 0; }
      }
      rk.position.y = y;
      rk.visible = !(la && phase >= 6 && phase < 7.8);
      if (la && phase >= 7.8) { const q = (phase - 7.8) / 1.2; rk.position.y = 0.8 + (1 - q) * 6; }
      clamps.forEach((c) => (c.rotation.z += (((la && phase > 1.2 && phase < 7.8) ? -1.1 : 0) - c.rotation.z) * Math.min(1, dt * 6)));
      plume.visible = ign > 0;
      if (ign > 0) { const f = 0.8 + Math.random() * 0.4; plume.scale.set(ign, ign * f, ign); }
      if (!plumeL.isDummy) plumeL.intensity = ign * (2.4 + Math.random() * 0.8);
      // steam + smoke
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = 0.04;
        if (cd || s === 'IDLE') if (Math.random() < (cd ? 0.8 : 0.12)) { K.spawn(g, -2.0 + K.R() * 0.8, 1.3, 0.6 + K.R() * 0.8, K.R() * 0.4 + 0.2, 0.9, K.R() * 0.4, 0xa89c88, 1.4, 0.13, -0.1); if (cd && Math.random() < 0.5) K.spawn(g, 0.2 + K.R() * 2, 0.5, 0.2 + K.R() * 2, K.R(), 0.4, K.R(), 0x9a8e7c, 1.4, 0.18, -0.08); }
        if (la && ign > 0) {
          for (let i = 0; i < 3; i++) {
            const d = Math.random() < 0.5 ? 1 : -1;
            const dirX = Math.cos(Math.PI / 4) * d, dirZ = -Math.sin(Math.PI / 4) * d;
            if (rk.position.y < 3) K.spawn(g, 0.2 + dirX * 0.5, 0.6, 0.2 + dirZ * 0.5, dirX * (2 + Math.random() * 2), 0.4 + Math.random(), dirZ * (2 + Math.random() * 2), Math.random() < 0.3 ? 0xff9a40 : 0x9a8e7c, 1.6, 0.22, -0.2);
            K.spawn(g, 0.2 + K.R() * 0.3, rk.position.y - 0.9, 0.2 + K.R() * 0.3, K.R() * 0.6, -0.5, K.R() * 0.6, Math.random() < 0.4 ? 0xffb050 : 0x8e8474, 2.2, 0.28, -0.15);
          }
        }
        if (la && phase > 6 && phase < 7.8 && Math.random() < 0.5) K.spawn(g, 0.2 + K.R() * 3, 0.5, 0.2 + K.R() * 3, K.R(), 0.3, K.R(), 0x7e7466, 2, 0.35, -0.08);
      }
    } };
  }

  SHIP.register({
    id: 'cogpit', name: 'UNDERCROFT', eyebrow: 'COGWORKS · VARIATION 3', accent: '#c98a3a',
    pitch: 'Down in the factory hall. Belts run on three levels: ore pours in from a wall hatch over the catwalk, sorted capsules ride the floor to the assembler, finished crates climb an incline, cross over Spark and drop into the launch silo. Rejects crawl back underneath on the red rework line. Oil on the plates, soot on the brick, a gantry crane overhead.',
    palette: ['#0c0907', '#261f19', '#3e1d14', '#5a2418', '#8a4526', '#96692a', '#bf9244', '#37705e', '#7af0d8', '#ff5a18'],
    keywords: ['FACTORY HALL', 'BELTS ON 3 LEVELS', 'GANTRY CRANE', 'OIL & SOOT', 'FURNACE TRENCH', 'AETHER CORE'],
    sky: { top: '#0e0a08', bottom: '#2a1a10', fog: '#1e140e', fogNear: 60, fogFar: 105 },
    light: { sun: 0xffc69a, sunI: 0.85, sunDir: [-8, 18, 9], hemiSky: 0x9a8a78, hemiGnd: 0x2a1c12, hemiI: 0.55 },
    finish: { levels: 40, dither: 0.15, outline: 0.6, thresh: 0.08, ink: '#0a0503', sat: 0.9, contrast: 1.14, bloom: 0.8, bloomThresh: 0.68, vignette: 0.55, grade: 0.4, shadow: '#1a1830', high: '#ffcf90', scan: 0 },
    world,
    components: [
      { id: 'assembler', name: 'CLOCKWORK ASSEMBLER', blurb: 'A coding agent building your PR: sorted capsules drop in from the floor belt, the brass arm welds the PR chest, and finished crates leave on the incline.', states: ['IDLE', 'WORKING', 'BLOCKED'], build: buildAssembler },
      { id: 'splitter', name: 'AETHER SPLITTER', blurb: 'Muse Spark, the brain: ore pours from the wall hatch into its hopper, the orrery spins around the aether core, and capsules shoot down the glass tubes onto the floor belt.', states: ['IDLE', 'SORTING'], build: buildSplitter },
      { id: 'launch', name: 'LAUNCH SILO', blurb: 'A merged PR ships: crates drop in from the catwalk, the roof hatch slides open, the clamps let go and the rocket burns up through the roof.', states: ['IDLE', 'COUNTDOWN', 'LAUNCH'], build: buildLaunch }
    ]
  });
})();
