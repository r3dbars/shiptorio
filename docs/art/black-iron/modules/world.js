// =====================================================================
// WORLD (Black Iron line): the foundry deck, back wall, furnace, yard props, skyline, and the global look.
// Owns: slab y 0.1 -> -1.4 (top + front face + rim), everything standing on the deck that isn't a machine or a
// belt, and IRON.look(). Keeps clear of machine bays, path corridors, rework columns + high line, conduit strip.
// Brighter than cogiron.js (lifted albedos, stronger hemi) but still oily, sooty, rusty.
// =====================================================================
(function () {
  'use strict';
  // decor sits ~15% darker + less saturated than the line, so machines/belts/items stay the brightest things
  function dd(h, k, s) { const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255; const l = 0.3 * r + 0.59 * g + 0.11 * b; const f = (c) => Math.max(0, Math.min(255, Math.round((c + (l - c) * (s === undefined ? 0.28 : s)) * (k === undefined ? 0.85 : k)))); return (f(r) << 16) | (f(g) << 8) | f(b); }
  const C = {
    soot: 0x1e1814, iron: 0x3a322b, ironL: 0x5a5046, ironM: 0x463d35,
    brass: 0xa87a34, brassD: 0x6a4c22, brassL: 0xd0a24e,
    copper: 0x9a4e2a, copperD: 0x643220, verd: 0x3e8a72, verdD: 0x2a5e4e,
    brick: 0x6a3020, brickD: 0x4a2216, stone: 0x6a5c4e, stoneD: 0x4a4036,
    wood: 0x5e4026, woodD: 0x45301c, leather: 0x553220, cream: 0xd8c49a,
    gas: 0xffc070, ember: 0xff7a2a, red: 0xc03a24, hazard: 0xd8a018, teal: 0x7af0d8
  };
  ['brass', 'brassD', 'brassL', 'copper', 'copperD', 'wood', 'woodD', 'leather', 'red', 'cream', 'verd', 'verdD'].forEach((k) => (C[k] = dd(C[k])));
  C.hazard = dd(C.hazard, 0.9, 0.15); C.brick = dd(C.brick, 0.95, 0.2); C.brickD = dd(C.brickD, 0.95, 0.2);
  let M = null;
  function mats(K) {
    M = {
      brass: K.mat(C.brass, { shine: 38, spec: 0x8a6a30 }), brassL: K.mat(C.brassL, { shine: 50, spec: 0xa88a48 }), brassD: K.mat(C.brassD, { shine: 22, spec: 0x4a3418 }),
      copper: K.mat(C.copper, { shine: 34, spec: 0x7a4a28 }), copperD: K.mat(C.copperD, { shine: 18 }),
      iron: K.mat(C.iron, { shine: 24, spec: 0x34343a }), ironM: K.mat(C.ironM, { shine: 18, spec: 0x2a2a30 }), ironL: K.mat(C.ironL, { shine: 30, spec: 0x44444a }),
      oil: K.mat(0x1a181e, { shine: 120, spec: 0xb0a0d0 }), sheen: K.glow(0x7a5aaa, 0.22, true),
      rust: K.mat(0x6a3418), rustL: K.mat(0x86481f), roofIron: K.mat(0x4a423a, { shine: 14 }), hazard: K.mat(C.hazard), hazardD: K.mat(0x1a140c),
      grime: K.mat(0x080604, { op: 0.42, depthWrite: false }), grimeL: K.mat(0x14100c, { op: 0.28, depthWrite: false }),
      rustStain: K.mat(0x7a3412, { op: 0.4, depthWrite: false }), paint: K.mat(0xc89a24, { op: 0.82, depthWrite: false }), paintW: K.mat(0xd8cfb8, { op: 0.55, depthWrite: false }),
      soot: K.mat(C.soot), verd: K.mat(C.verd, { shine: 20 }), verdD: K.mat(C.verdD),
      wood: K.mat(C.wood), woodD: K.mat(C.woodD), leather: K.mat(C.leather), canvas: K.mat(0x7a6a4e),
      brick: K.mat(C.brick), brickD: K.mat(C.brickD), stone: K.mat(C.stone), stoneD: K.mat(C.stoneD),
      cream: K.mat(C.cream), red: K.mat(C.red), coal: K.mat(0x221e1c, { shine: 40, spec: 0x3a3a44 }),
      glass: K.mat(0xa8d8c8, { op: 0.25, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      gas: K.glow(C.gas), ember: K.glow(C.ember), teal: K.glow(C.teal)
    };
    return M;
  }

  // ---------- part helpers (from cogiron.js) ----------
  function gear(K, p, r, thick, teeth, m, x, y, z) {
    const g = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * (r * 1.08), 0, Math.cos(a) * (r * 1.08), g); tb.rotation.y = a; }
    K.cyl(r * 0.28, r * 0.28, thick * 1.6, M.ironM, 8, 0, 0, 0, g);
    if (r > 0.35) for (let i = 0; i < 4; i++) { const s = K.box(r * 1.4, thick * 1.1, r * 0.12, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 4; }
    return g;
  }
  function rivetRing(K, p, r, y, n, m) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, m || M.brassL, Math.cos(a) * r, y, Math.sin(a) * r, p); } }
  function band(K, p, r, y, m, h) { K.cyl(r, r, h || 0.1, m || M.brass, 18, 0, y, 0, p); }
  function gauge(K, p, x, y, z, r, ry) {
    const g = K.group(p, x, y, z); g.rotation.y = ry || 0;
    const rim = K.cyl(r * 1.15, r * 1.15, 0.08, M.brass, 14, 0, 0, 0, g); rim.rotation.x = Math.PI / 2;
    const face = K.cyl(r, r, 0.1, M.cream, 14, 0, 0, 0.01, g); face.rotation.x = Math.PI / 2;
    const red = K.box(r * 0.5, r * 0.18, 0.02, K.mat(0xb02a1a), r * 0.45, r * 0.45, 0.065, g); red.rotation.z = -0.8;
    const piv = K.group(g, 0, 0, 0.07);
    K.box(0.035, r * 0.85, 0.02, K.mat(0x140c06), 0, r * 0.38, 0, piv);
    return piv;
  }
  function puff(K, p, x, y, z, col, size, vy, spread, life) {
    K.spawn(p, x + K.R() * spread, y, z + K.R() * spread, K.R() * 0.3 + 0.2, vy, K.R() * 0.3, col, life || 2.6, size, -0.12);
  }
  function hazardBand(K, p, len, y, z, n, ry, x0) {
    const g = K.group(p, x0 || 0, y, z); g.rotation.y = ry || 0; const w = len / n;
    for (let i = 0; i < n; i++) K.box(w * 0.96, 0.1, 0.05, i % 2 ? M.hazardD : M.hazard, -len / 2 + w * (i + 0.5), 0, 0, g);
    return g;
  }

  // ---------- textures (brighter than cogiron) ----------
  function srand(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function cobbleTex(K, rep) {
    return K.canvasTex(128, 128, (g) => {
      const r = srand(31);
      g.fillStyle = '#1c1611'; g.fillRect(0, 0, 128, 128);
      const tones = ['#564e46', '#4e4640', '#5c544c', '#48423c', '#625a52', '#524a44', '#4a443e', '#5a5048'];
      for (let y = 0; y < 128; y += 9) {
        let x = -Math.floor(r() * 8);
        while (x < 128) {
          const w = 7 + Math.floor(r() * 5), h = 7 + Math.floor(r() * 2), oy = Math.floor(r() * 2);
          g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1 + oy, w - 1, h - 1);
          g.fillRect(x + 2, y + oy, w - 3, 1);
          g.fillStyle = 'rgba(255,236,210,0.09)'; g.fillRect(x + 2, y + 1 + oy, w - 3, 1);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1, y + h - 1 + oy, w - 1, 1);
          if (r() < 0.08) { g.fillStyle = 'rgba(140,60,20,0.35)'; g.fillRect(x + 2, y + 2 + oy, w - 3, h - 3); }
          x += w;
        }
      }
      for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(6,4,3,0.42)'; const x = r() * 112, y = r() * 112; g.fillRect(x, y, 8 + r() * 14, 4 + r() * 7); g.fillRect(x + 3, y - 2, 5 + r() * 6, 2); }
      for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(Math.floor(r() * 64) * 2, Math.floor(r() * 64) * 2, 2, 2); }
      for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(130,56,20,0.28)'; g.fillRect(r() * 120, r() * 120, 7, 3); }
    }, rep);
  }
  function brickTex(K, rep, dark, soot) {
    return K.canvasTex(64, 64, (g) => {
      const r = srand(7);
      g.fillStyle = dark ? '#24140e' : '#2e1a12'; g.fillRect(0, 0, 64, 64);
      const tones = dark ? ['#5e2a1c', '#522418', '#6a3020'] : ['#843e28', '#783420', '#904a30', '#6e3020'];
      for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < 64; x += 16) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 14, 6);
        g.fillStyle = 'rgba(255,210,170,0.10)'; g.fillRect(x + 1, y + 1, 14, 1);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 6, 14, 1);
      }
      if (soot) { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(8,5,3,0.5)'); gr.addColorStop(0.45, 'rgba(8,5,3,0.12)'); gr.addColorStop(1, 'rgba(8,5,3,0.05)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(110,46,16,0.28)'; g.fillRect(Math.floor(r() * 60), 20 + r() * 10, 2, 30 + r() * 14); }
    }, rep);
  }
  function stoneTex(K, rep) {
    return K.canvasTex(64, 64, (g) => {
      const r = srand(13);
      g.fillStyle = '#2a2018'; g.fillRect(0, 0, 64, 64);
      const tones = ['#76685a', '#6c5e4e', '#806e5c', '#685a4a'];
      for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
        g.fillStyle = tones[Math.floor(r() * 4)]; g.fillRect(x + 1, y + 1, 22, 14);
        g.fillStyle = 'rgba(255,230,190,0.10)'; g.fillRect(x + 2, y + 1, 20, 2);
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 2, y + 13, 20, 2);
      }
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(10,6,4,0.35)'; g.fillRect(r() * 64, 0, 2 + r() * 3, 64); }
    }, rep);
  }
  function textTex(K, text, w, h, fg, bg, size) {
    return K.canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = 'bold ' + size + "px Silkscreen, 'Courier New', monospace"; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(text, Math.round(w / 2), Math.round(h / 2 + size * 0.36));
    });
  }

  // ---------- keep-out (machine bays, path corridors, columns, conduit strip) ----------
  let KEEP = null;
  function buildKeep(ctx) {
    const segs = [];
    ['ore', 'feed', 'pass', 'rw1', 'rwIn'].forEach((n) => { const p = ctx.paths[n]; if (!p) return; for (let i = 0; i < p.points.length - 1; i++) segs.push([p.points[i][0], p.points[i][2], p.points[i + 1][0], p.points[i + 1][2]]); });
    const tube = ctx.paths.tube; if (tube) for (let i = 0; i < tube.points.length - 1; i++) segs.push([tube.points[i][0], tube.points[i][2], tube.points[i + 1][0], tube.points[i + 1][2]]);
    KEEP = { segs, cols: [[-3.82, -2.55], [-14.6, -2.55], [-15.2, 8.3]] };
  }
  function segDist(px, pz, s) { const [ax, az, bx, bz] = s; const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1; let k = ((px - ax) * dx + (pz - az) * dz) / l2; k = Math.max(0, Math.min(1, k)); return Math.hypot(px - ax - k * dx, pz - az - k * dz); }
  function clear(x, z, r) {
    r = r || 0.3;
    if (Math.abs(x) > 18.2 - r || Math.abs(z) > 7.2 - r) return false;
    for (const sx of [-10, 0, 10]) { if (Math.abs(x - sx) + Math.abs(z) < 3.95 + r * 1.4) return false; if (Math.hypot(x - sx, z) < 4.2 + r) return false; if (Math.abs(x - sx) < 2.3 + r && z > 4.4 - r && z < 6.4 + r) return false; }
    for (const s of KEEP.segs) if (segDist(x, z, s) < 0.75 + r) return false;
    for (const [cx, cz] of KEEP.cols) if (Math.hypot(x - cx, z - cz) < 0.95 + r) return false;
    if (x > -7.8 && x < 7.6 && z > -3.5 && z < -1.9) return false; // aether conduit strip
    if (Math.abs(x + 15.2) < 1.0 + r && z > 3.5) return false; // ore belt into lift
    return true;
  }

  // ---------- props ----------
  function lamp(K, p, x, z, h, withLight, anim) {
    const g = K.group(p, x, 0, z);
    K.cyl(0.22, 0.28, 0.22, M.iron, 8, 0, 0.11, 0, g);
    K.cyl(0.07, 0.09, h, M.iron, 8, 0, h / 2, 0, g);
    for (let i = 0; i < 3; i++) band(K, g, 0.1, 0.5 + i * (h * 0.3), M.brassD, 0.06);
    const arm = K.box(0.5, 0.06, 0.06, M.iron, 0.18, h - 0.1, 0, g); arm.rotation.z = 0.2;
    K.cyl(0.2, 0.14, 0.1, M.brass, 6, 0, h, 0, g);
    const gm = K.glow(C.gas);
    K.box(0.24, 0.34, 0.24, gm, 0, h + 0.24, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.035, 0.38, 0.035, M.iron, sx * 0.13, h + 0.24, sz * 0.13, g);
    K.cone(0.24, 0.24, M.brassD, 6, 0, h + 0.53, 0, g);
    K.sph(0.05, M.brassL, 0, h + 0.68, 0, g, 6, 4);
    const pool = K.cyl(1.4, 1.4, 0.01, K.glow(0xffa050, 0.07, true), 16, 0, 0.12, 0, g); pool.userData.noBake = true;
    const L = withLight ? K.light(0xffae60, 1.6, 8.5, 0, h + 0.2, 0, g) : null;
    K.bake(g);
    anim.push((t) => { const f = 0.88 + Math.sin(t * 13 + x) * 0.05 + Math.sin(t * 7.3 + z) * 0.06; gm.color.setRGB(1, 0.75 * f, 0.44 * f); if (L && !L.isDummy) L.intensity = 1.6 * f; });
    return g;
  }
  function barrel(K, p, x, z, m, tip) {
    const b = K.group(p, x, 0, z);
    const body = K.group(b); if (tip) { body.rotation.z = Math.PI / 2; body.position.y = 0.32; body.rotation.y = tip; }
    K.cyl(0.32, 0.3, 0.8, m || M.wood, 10, 0, tip ? 0 : 0.4, 0, body);
    for (const y of [0.15, 0.65]) K.cyl(0.33, 0.33, 0.06, M.iron, 10, 0, (tip ? -0.25 : 0) + y, 0, body);
    if (!tip) K.cyl(0.25, 0.25, 0.02, M.oil, 10, 0, 0.81, 0, body);
    return b;
  }
  function drum(K, p, x, z, col, tip) {
    const b = K.group(p, x, 0, z); const m = K.mat(col, { shine: 20 });
    const body = K.group(b); if (tip) { body.rotation.x = Math.PI / 2; body.position.y = 0.3; body.rotation.y = tip; }
    K.cyl(0.3, 0.3, 0.86, m, 12, 0, tip ? 0 : 0.43, 0, body);
    for (const y of [0.2, 0.66]) K.cyl(0.31, 0.31, 0.04, M.ironM, 12, 0, (tip ? -0.43 : 0) + y, 0, body);
    K.box(0.32, 0.18, 0.02, M.hazard, 0, (tip ? -0.43 : 0) + 0.43, 0.3, body);
    return b;
  }
  function crate(K, p, x, z, s, ry, m) {
    const g = K.group(p, x, 0, z); g.rotation.y = ry || 0;
    K.box(s, s, s, m || M.woodD, 0, s / 2, 0, g);
    for (const d of [-1, 1]) { K.box(s * 1.02, 0.07, 0.07, M.wood, 0, s / 2, d * s * 0.5, g); K.box(0.07, s * 1.02, 0.07, M.wood, d * s * 0.42, s / 2, s * 0.51, g); }
    K.box(s * 1.02, 0.06, s * 1.02, M.wood, 0, s - 0.03, 0, g);
    K.box(s * 0.4, s * 0.25, 0.02, M.cream, 0, s * 0.55, s * 0.515, g);
    return g;
  }
  function toolbox(K, p, x, z, ry) {
    const g = K.group(p, x, 0, z); g.rotation.y = ry || 0;
    K.box(0.6, 0.28, 0.3, M.red, 0, 0.14, 0, g); K.box(0.62, 0.05, 0.32, K.mat(0x8a2a1a), 0, 0.3, 0, g);
    K.box(0.3, 0.04, 0.04, M.iron, 0, 0.42, 0, g); for (const xx of [-0.14, 0.14]) K.box(0.04, 0.12, 0.04, M.iron, xx, 0.36, 0, g);
    const w = K.box(0.5, 0.03, 0.06, M.ironL, 0.35, 0.02, 0.28, g); w.rotation.y = 0.6;
    return g;
  }
  function coil(K, p, x, z, r, m) { const g = K.group(p, x, 0, z); for (let i = 0; i < 4; i++) { const c = K.torus(r - i * 0.02, 0.035, m, 4, 16, 0, 0.04 + i * 0.06, 0, g); c.rotation.x = Math.PI / 2; } return g; }

  // a small grimy worker (overalls, cap, goggles) — legs/arms on pivots so they can walk or work
  function worker(K, p, col, x, z) {
    const g = K.group(p, x, 0, z);
    const skin = K.mat(0xb08060), cloth = K.mat(col), dark = K.mat(0x2a221c), boots = K.mat(0x1a1410);
    const legs = [];
    for (const s of [-1, 1]) { const hip = K.group(g, s * 0.09, 0.42, 0); K.box(0.11, 0.38, 0.12, cloth, 0, -0.19, 0, hip); K.box(0.13, 0.07, 0.18, boots, 0, -0.38, 0.03, hip); legs.push(hip); }
    const body = K.group(g, 0, 0.42, 0);
    K.box(0.3, 0.38, 0.18, cloth, 0, 0.2, 0, body);
    K.box(0.32, 0.06, 0.2, dark, 0, 0.02, 0, body);
    K.box(0.08, 0.18, 0.02, M.brassD, 0.06, 0.24, 0.1, body);
    const head = K.group(body, 0, 0.5, 0);
    K.box(0.2, 0.2, 0.2, skin, 0, 0, 0, head);
    K.box(0.22, 0.07, 0.24, dark, 0, 0.12, 0.01, head); K.box(0.22, 0.03, 0.08, dark, 0, 0.09, 0.14, head);
    K.box(0.18, 0.05, 0.03, K.mat(0x3a6a7a, { shine: 60 }), 0, 0.03, 0.105, head);
    const arms = [];
    for (const s of [-1, 1]) { const sh = K.group(body, s * 0.19, 0.34, 0); K.box(0.09, 0.32, 0.1, cloth, 0, -0.15, 0, sh); K.box(0.09, 0.08, 0.1, skin, 0, -0.33, 0, sh); arms.push(sh); }
    return { g, legs, arms, body, head };
  }

  // =====================================================================
  IRON.world(function (K, root, scene, ctx) {
    mats(K); buildKeep(ctx);
    IRON.look({
      sky: { top: '#1c120c', bottom: '#7a3a16', fog: '#3a2416', fogNear: 78, fogFar: 150 },
      light: { sun: 0xffc48e, sunI: 1.15, sunDir: [-12, 24, 16], hemiSky: 0xbcb4b0, hemiGnd: 0x46362a, hemiI: 1.15 },
      finish: { levels: 52, dither: 0.06, outline: 0.42, thresh: 0.1, ink: '#100806', sat: 1.02, contrast: 1.04, bloom: 0.7, bloomThresh: 0.64, vignette: 0.1, grade: 0.24, shadow: '#3a3050', high: '#ffd6a0', scan: 0 }
    });
    const S = K.group(root); // static decor, baked at the end
    const anim = [];

    // ================= DECK SLAB =================
    const top = K.mat(0xffffff, { map: cobbleTex(K, [11, 4.5]) });
    const front = K.mat(0xffffff, { map: stoneTex(K, [14, 0.6]) });
    K.box(37, 1.5, 15, [front, front, top, M.soot, front, front], 0, -0.65, 0, root).receiveShadow = true;
    // curb along the front + back edges, worn stone blocks
    for (let x = -18.25; x < 18.4; x += 0.75) {
      const h = 0.1 + Math.random() * 0.03;
      K.box(0.72, h, 0.36, Math.random() < 0.3 ? M.stoneD : M.stone, x + 0.375, 0.1 + h / 2 - 0.02, 7.3, S);
    }
    // painted hazard band on the curb (gap where the ore belt crosses)
    for (let x = -18.2; x < 18.2; x += 0.5) if (Math.abs(x + 15.2) > 0.9) K.box(0.24, 0.02, 0.12, Math.floor((x + 20) * 2) % 2 ? M.hazard : M.hazardD, x, 0.2, 7.18, S);

    // ---- FRONT FACE (what the camera sees above the underside) ----
    const FZ = 7.5;
    // I-beam girder along the top edge
    K.box(37.2, 0.34, 0.12, M.ironM, 0, -0.1, FZ + 0.08, S);
    K.box(37.2, 0.06, 0.3, M.iron, 0, 0.05, FZ + 0.12, S);
    K.box(37.2, 0.06, 0.3, M.iron, 0, -0.26, FZ + 0.12, S);
    for (let x = -18.4; x <= 18.4; x += 0.38) { K.box(0.06, 0.06, 0.05, M.brassL, x, -0.02, FZ + 0.16, S); K.box(0.06, 0.06, 0.05, M.brassL, x, -0.18, FZ + 0.16, S); }
    // lower plinth band + rust bleeding down the stone
    K.box(37.2, 0.2, 0.1, M.ironM, 0, -1.3, FZ + 0.06, S);
    for (let x = -18; x < 18.2; x += 0.6) if (Math.random() < 0.55) { const h = 0.3 + Math.random() * 0.7; K.box(0.06 + Math.random() * 0.1, h, 0.01, M.rustStain, x + Math.random() * 0.4, -0.3 - h / 2, FZ + 0.012, S); }
    for (let i = 0; i < 26; i++) { const w = 0.6 + Math.random() * 1.6; K.box(w, 0.3 + Math.random() * 0.6, 0.01, M.grime, -18 + Math.random() * 36, -0.5 - Math.random() * 0.6, FZ + 0.014, S); }
    // brackets + diagonal braces + foundation feet
    const BR = [];
    for (let x = -17.6; x <= 17.7; x += 2.9) { if (Math.abs(x + 15.2) < 1.1) continue; BR.push(x); }
    BR.forEach((x) => {
      K.box(0.22, 1.42, 0.18, M.iron, x, -0.68, FZ + 0.12, S);
      K.box(0.32, 0.12, 0.26, M.ironM, x, -1.36, FZ + 0.14, S);
      for (const y of [-0.45, -0.85, -1.2]) { K.box(0.08, 0.08, 0.05, M.brassL, x - 0.06, y, FZ + 0.22, S); K.box(0.08, 0.08, 0.05, M.brassL, x + 0.06, y, FZ + 0.22, S); }
      const d = K.box(0.08, 1.2, 0.06, M.ironM, x + 0.42, -0.72, FZ + 0.17, S); d.rotation.z = 0.62;
    });
    // hanging chains between brackets (catenary of links), skipping the lift gap
    for (let i = 0; i < BR.length - 1; i++) {
      const a = BR[i], b = BR[i + 1]; if (b - a > 3.2 || Math.random() < 0.35) continue;
      const n = 14;
      for (let k = 0; k <= n; k++) { const u = k / n, x = a + 0.15 + (b - a - 0.3) * u, y = -0.35 - Math.sin(u * Math.PI) * 0.62; const l = K.torus(0.05, 0.016, M.ironL, 4, 6, x, y, FZ + 0.27, S); l.rotation.y = k % 2 ? Math.PI / 2 : 0; l.castShadow = false; }
    }
    // a couple of loose chains hanging down off the edge
    const hangers = [];
    for (const x of [-9.3, 2.1, 9.6, 15.9]) {
      const hg = K.group(root, x, -0.05, FZ + 0.32); const n = 10 + Math.floor(Math.random() * 6);
      for (let k = 0; k < n; k++) { const l = K.torus(0.055, 0.017, M.ironL, 4, 6, 0, -k * 0.11, 0, hg); l.rotation.y = k % 2 ? Math.PI / 2 : 0; l.castShadow = false; }
      K.box(0.08, 0.2, 0.08, M.rust, 0.04, -n * 0.11 - 0.06, 0, hg); hangers.push({ hg, k: Math.random() * 6 });
    }
    // drain spouts dripping oil, glowing vent slits (furnace inside the slab)
    const spouts = [];
    for (const x of [-11.6, -3.4, 5.2, 13.4]) {
      const sp = K.cyl(0.09, 0.09, 0.55, M.copperD, 8, x, -0.62, FZ + 0.32, S); sp.rotation.x = Math.PI / 2;
      K.cyl(0.12, 0.12, 0.08, M.brassD, 8, x, -0.62, FZ + 0.1, S).rotation.x = Math.PI / 2;
      K.box(0.14, 0.4, 0.01, M.oil, x, -0.85, FZ + 0.02, S);
      spouts.push(x);
    }
    const vents = [];
    for (const x of [-13.0, -6.5, -0.9, 3.4, 8.2, 11.8, 17.0]) {
      const vg = K.glow(0xff7a2a); K.box(0.9, 0.22, 0.02, vg, x, -0.95, FZ + 0.01, S); vents.push(vg);
      for (let i = 0; i < 5; i++) K.box(0.05, 0.28, 0.06, M.soot, x - 0.36 + i * 0.18, -0.95, FZ + 0.03, S);
      K.box(1.02, 0.06, 0.08, M.ironM, x, -0.8, FZ + 0.04, S); K.box(1.02, 0.06, 0.08, M.ironM, x, -1.1, FZ + 0.04, S);
    }

    // low chain railing along the front edge (gap at the ore belt)
    const posts = [];
    for (let x = -17.9; x <= 18.0; x += 1.7) { if (Math.abs(x + 15.2) < 1.2) continue; posts.push(x); K.cyl(0.05, 0.06, 0.6, M.iron, 6, x, 0.42, 7.36, S); K.sph(0.07, M.brassD, x, 0.74, 7.36, S, 6, 4); }
    for (let i = 0; i < posts.length - 1; i++) { const a = posts[i], b = posts[i + 1]; if (b - a > 1.8) continue; for (let k = 1; k < 8; k++) { const u = k / 8; const l = K.torus(0.04, 0.012, M.ironL, 4, 6, a + (b - a) * u, 0.66 - Math.sin(u * Math.PI) * 0.16, 7.36, S); l.rotation.y = k % 2 ? Math.PI / 2 : 0; l.castShadow = false; } }

    // ================= FLOOR MARKINGS =================
    const DEC = 0.112;
    function decal(x, z, w, d, m, ry, y) { const b = K.box(w, 0.01, d, m, x, y || DEC, z, S); b.rotation.y = ry || 0; b.castShadow = false; b.receiveShadow = true; return b; }
    // machine bays: worn dashed diamond around each footprint + bay number plate
    const BAY = ['01', '02', '03'];
    [-10, 0, 10].forEach((sx, bi) => {
      const R0 = 3.9;
      const corners = [[sx - R0, 0], [sx, R0], [sx + R0, 0], [sx, -R0]];
      for (let e = 0; e < 4; e++) {
        const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
        const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 0.62);
        for (let k = 0; k < n; k++) { if (Math.random() < 0.12) continue; const u = (k + 0.3) / n; decal(ax + (bx - ax) * u, az + (bz - az) * u, 0.38, 0.09, M.paint, -Math.atan2(bz - az, bx - ax)); }
      }
      const plate = K.mat(0xffffff, { map: textTex(K, 'BAY ' + BAY[bi], 64, 16, '#d8ac34', '#1a120c', 8), op: 0.85, depthWrite: false });
      const pl = decal(sx + 0.0, 4.55, 1.5, 0.38, plate, 0); pl.rotation.x = 0;
    });
    // flow arrows painted beside the belts
    function chevrons(name, side, every) {
      const p = ctx.paths[name]; if (!p) return; const v = new K.THREE.Vector3();
      for (let s = 0.8; s < p.L - 0.6; s += every) {
        const sg = p.at(s, v); const nx = Math.sin(sg.yaw) * side, nz = Math.cos(sg.yaw) * side; // perpendicular (root)
        const x = v.x + nx * 0.62, z = v.z + nz * 0.62;
        if (!clearPaint(x, z)) continue;
        const g = K.group(S, x, DEC, z); g.rotation.y = sg.yaw;
        const a = K.box(0.26, 0.01, 0.06, M.paintW, -0.06, 0, 0.07, g); a.rotation.y = 0.7;
        const b = K.box(0.26, 0.01, 0.06, M.paintW, -0.06, 0, -0.07, g); b.rotation.y = -0.7;
        a.castShadow = b.castShadow = false;
      }
    }
    function clearPaint(x, z) { for (const sx of [-10, 0, 10]) if (Math.abs(x - sx) + Math.abs(z) < 3.7) return false; return Math.abs(x) < 18 && Math.abs(z) < 7; }
    chevrons('ore', 1, 1.1); chevrons('feed', 1, 0.9); chevrons('pass', -1, 0.9); chevrons('rwIn', -1, 1.0);
    // hazard hatching under the rework columns + lift landing
    for (const [cx, cz] of [[-3.82, -2.55], [-14.6, -2.55]]) for (let i = -3; i <= 3; i++) decal(cx + i * 0.22, cz + 0.95, 0.12, 0.42, i % 2 ? M.hazard : M.hazardD, 0.6);
    // old cart rails sunk into the cobbles along the front strip
    for (const dz of [-0.34, 0.34]) { K.box(26.5, 0.03, 0.07, M.ironL, -0.5, 0.11, 5.05 + dz, S); K.box(26.5, 0.02, 0.03, K.mat(0x9a9088, { shine: 70 }), -0.5, 0.13, 5.05 + dz, S); }
    for (let x = -13.6; x < 12.8; x += 0.55) decal(x, 5.05, 0.14, 0.9, M.woodD, 0, 0.105);
    // grime + soot decals and oil puddles with sheen
    for (let i = 0; i < 70; i++) { const x = -18 + Math.random() * 36, z = -6.2 + Math.random() * 13; const d = decal(x, z, 0.4 + Math.random() * 1.6, 0.25 + Math.random() * 1.0, Math.random() < 0.6 ? M.grime : M.grimeL, Math.random() * 3, DEC + Math.random() * 0.004); }
    for (let i = 0; i < 14; i++) { const x = -18 + Math.random() * 36, z = -6 + Math.random() * 12; decal(x, z, 0.15 + Math.random() * 0.5, 0.08 + Math.random() * 0.2, M.rustStain, Math.random() * 3, DEC + 0.002); }
    const puddles = [[-6.6, 4.3, 1.3, 0.6], [3.3, 4.6, 1.0, 0.55], [-13.2, 0.9, 0.8, 0.5], [12.6, 4.1, 1.1, 0.6], [-1.2, 5.9, 1.4, 0.55], [15.1, -1.0, 0.9, 0.5], [-17.0, 2.6, 0.8, 0.5], [6.4, -4.5, 1.2, 0.6], [-6.8, -4.8, 1.0, 0.5], [-0.5, -4.6, 0.9, 0.45]];
    const sheens = [];
    puddles.forEach(([x, z, sx, sz]) => {
      const p = K.sph(1, M.oil, x, 0.1, z, S, 14, 4); p.scale.set(sx * 0.8, 0.02, sz * 0.8); p.castShadow = false; const rim = K.torus(1, 0.04, M.grime, 3, 20, x, 0.115, z, S); rim.scale.set(sx * 0.8, sz * 0.8, 1); rim.rotation.x = Math.PI / 2; rim.castShadow = false;
      const sh = K.sph(1, M.sheen, x + sx * 0.15, 0.125, z - sz * 0.1, root, 12, 3); sh.scale.set(sx * 0.6, 0.01, sz * 0.45); sh.castShadow = false; sheens.push(sh);
    });
    // scattered bolts, nuts, scrap plates, washers
    for (let i = 0; i < 120; i++) {
      const x = -18 + Math.random() * 36, z = -6.2 + Math.random() * 13.2; if (!clear(x, z, 0.1)) continue;
      const r = Math.random();
      if (r < 0.45) K.box(0.06, 0.04, 0.06, Math.random() < 0.5 ? M.ironL : M.brassD, x, 0.13, z, S).rotation.y = Math.random() * 3;
      else if (r < 0.7) { const n = K.cyl(0.05, 0.05, 0.03, M.ironL, 6, x, 0.13, z, S); }
      else if (r < 0.88) { const pl = K.box(0.2 + Math.random() * 0.25, 0.02, 0.12 + Math.random() * 0.2, Math.random() < 0.5 ? M.rust : M.ironM, x, 0.12, z, S); pl.rotation.set(Math.random() * 0.1, Math.random() * 3, Math.random() * 0.1); }
      else { const sp = K.box(0.36, 0.04, 0.04, M.ironL, x, 0.13, z, S); sp.rotation.y = Math.random() * 3; }
    }

    // ================= BACK WALL =================
    const WZ = -6.6, WF = WZ + 0.35;
    const brick = K.mat(0xffffff, { map: brickTex(K, [9, 1], false, true) });
    K.box(37, 3.6, 0.7, brick, 0, 1.9, WZ, S);
    K.box(37.2, 0.25, 0.9, M.stoneD, 0, 3.78, WZ, S); K.box(37.2, 0.1, 0.95, M.stone, 0, 3.92, WZ, S);
    K.box(37.2, 0.32, 0.9, M.stoneD, 0, 0.26, WZ, S);
    // pilasters
    for (let x = -18; x <= 18; x += 4.6) { if (Math.abs(x - 4.6) < 2.2 || Math.abs(x - 8.4) < 1.6) continue; K.box(0.5, 3.6, 0.2, M.brickD, x, 1.9, WF + 0.08, S); K.box(0.6, 0.18, 0.28, M.stone, x, 3.55, WF + 0.1, S); }
    // arched windows (some lit, some flicker), frames + sills
    const winOn = K.glow(0xb07444), winDim = K.glow(0x4a2e1c), winFlick = K.glow(0xb07444); const litWins = [];
    const doorX = 8.4;
    for (let x = -16.6; x <= 16.8; x += 2.3) {
      if (Math.abs(x - doorX) < 1.6 || Math.abs(x - 4.6) < 1.9 || Math.abs(x + 5.2) < 1.3 || Math.abs(x - 2.6) < 0.8) continue;
      const r = Math.random(); const m = r < 0.5 ? winOn : r < 0.75 ? winFlick : winDim; if (m === winOn) litWins.push(x);
      K.box(0.9, 1.4, 0.06, m, x, 1.95, WF + 0.02, S);
      const a = K.cyl(0.45, 0.45, 0.06, m, 12, x, 2.65, WF + 0.02, S); a.rotation.x = Math.PI / 2;
      K.box(0.06, 2.1, 0.1, M.iron, x, 2.05, WF + 0.06, S); K.box(0.95, 0.06, 0.1, M.iron, x, 1.85, WF + 0.06, S); K.box(0.95, 0.05, 0.1, M.iron, x, 2.35, WF + 0.06, S);
      K.box(1.1, 0.12, 0.25, M.stoneD, x, 1.2, WF + 0.1, S);
      const arch = K.torus(0.5, 0.06, M.stoneD, 4, 12, x, 2.65, WF + 0.06, S, Math.PI); arch.castShadow = false;
      // soot plume stain above each window
      K.box(0.8, 0.8, 0.01, M.grimeL, x, 3.2, WF + 0.005, S);
    }
    anim.push((t) => { const f = Math.sin(t * 17) > 0.6 || Math.sin(t * 3.1) > 0.9 ? 0.45 : 1; winFlick.color.setRGB(0.69 * f, 0.45 * f, 0.27 * f); });
    // big sliding iron door with hazard stripes and a warm gap
    const door = K.group(S, doorX, 0, WF + 0.1);
    K.box(2.6, 3.0, 0.14, M.ironM, 0, 1.6, 0, door);
    for (let i = 0; i < 5; i++) K.box(2.6, 0.06, 0.18, M.iron, 0, 0.35 + i * 0.6, 0.02, door);
    for (let y = 0.3; y < 3; y += 0.3) for (const x of [-1.22, 1.22]) K.box(0.05, 0.05, 0.05, M.brassL, x, y, 0.1, door);
    hazardBand(K, door, 2.6, 0.18, 0.1, 10);
    K.box(0.12, 2.9, 0.05, K.glow(0xffa050, 0.85), 1.38, 1.55, 0.0, door);
    K.box(3.4, 0.16, 0.3, M.iron, 0.2, 3.18, 0.04, door);
    for (const x of [-0.9, 0.9]) K.cyl(0.08, 0.08, 0.14, M.brass, 8, x, 3.06, 0.12, door);
    // painted works sign
    const sign = K.mat(0xffffff, { map: textTex(K, 'SHIPTORIO', 160, 20, '#dcb46c', '#20140c', 16) });
    K.box(3.6, 0.48, 0.06, sign, 4.6, 2.85, WF + 0.12, S);
    K.box(3.75, 0.08, 0.1, M.brassD, 4.6, 3.13, WF + 0.07, S); K.box(3.75, 0.08, 0.1, M.brassD, 4.6, 2.57, WF + 0.07, S);
    // a wall clock + notice boards with invented glyphs
    const clk = K.group(S, 4.6, 1.85, WF + 0.05);
    const cf = K.cyl(0.42, 0.42, 0.06, M.cream, 16, 0, 0, 0, clk); cf.rotation.x = Math.PI / 2;
    K.torus(0.44, 0.05, M.brass, 4, 18, 0, 0, 0.03, clk);
    const clkH = K.group(root, 4.6, 1.85, WF + 0.1); K.box(0.04, 0.3, 0.02, K.mat(0x1a0c06), 0, 0.13, 0, clkH);
    const clkM = K.group(root, 4.6, 1.85, WF + 0.11); K.box(0.03, 0.38, 0.02, K.mat(0x8a1a10), 0, 0.17, 0, clkM);
    for (const [x, y, w, h, c] of [[-12.6, 1.75, 0.7, 0.9, 0xc8b48a], [-11.8, 1.6, 0.5, 0.6, 0xa89a7a], [12.3, 1.8, 0.7, 0.8, 0xc8b48a], [-1.5, 1.6, 0.6, 0.7, 0xb8a47a]]) {
      K.box(w, h, 0.03, K.mat(c), x, y, WF + 0.03, S);
      for (let i = 0; i < 5; i++) K.box(w * (0.4 + Math.random() * 0.4), 0.04, 0.01, K.mat(0x2a1c10), x - w * 0.05, y + h * 0.3 - i * h * 0.13, WF + 0.05, S);
    }
    // wall gears (turning)
    const wallGears = [];
    for (const [x, r, y] of [[-5.2, 1.0, 1.9], [-3.9, 0.55, 2.85], [2.6, 0.9, 1.85], [1.5, 0.48, 2.85]]) {
      const gr = gear(K, root, r, 0.16, Math.round(r * 16), M.brassD, x, y, WF + 0.06); gr.rotation.x = Math.PI / 2; wallGears.push({ g: gr, s: 1 / r });
      K.cyl(r * 0.3, r * 0.3, 0.2, M.ironM, 8, x, y, WF + 0.02, S).rotation.x = Math.PI / 2;
    }
    // pipework along the wall: copper mains, verdigris return, valves, gauges, steam leak points
    K.tube([[-18.5, 3.25, WF + 0.25], [-9.2, 3.25, WF + 0.25], [-8.7, 3.0, WF + 0.45], [-8.7, 0.35, WF + 0.45]], 0.14, M.copper, S, 32, 6);
    K.tube([[18.5, 3.0, WF + 0.25], [14.5, 3.0, WF + 0.25], [14.0, 2.7, WF + 0.45], [14.0, 0.35, WF + 0.45]], 0.14, M.copper, S, 32, 6);
    K.tube([[-18.5, 0.75, WF + 0.18], [18.5, 0.75, WF + 0.18]], 0.1, M.copperD, S, 40, 6);
    for (let x = -18; x <= 18; x += 1.2) { K.box(0.08, 0.3, 0.12, M.iron, x, 0.75, WF + 0.12, S); K.box(0.08, 0.32, 0.12, M.iron, x, 3.25, WF + 0.16, S); }
    for (const x of [-12, -6, 0.3, 6, 12, 16.5]) { const v = K.torus(0.2, 0.04, K.mat(0x9a2a18), 6, 12, x, 0.75, WF + 0.36, S); }
    for (const x of [-8.7, 14.0]) { const v = K.torus(0.28, 0.05, K.mat(0xa02a18), 6, 14, x, 1.6, WF + 0.72, S); v.rotation.x = Math.PI / 2; }
    const wallNeedles = [gauge(K, S, -8.3, 2.2, WF + 0.62, 0.17, 0), gauge(K, S, 13.6, 2.0, WF + 0.62, 0.17, 0), gauge(K, S, -16.0, 2.1, WF + 0.06, 0.2, 0)];
    // rebake gauge needles out of S: move them to root so they can turn
    wallNeedles.forEach((n) => { const w = new K.THREE.Vector3(); n.getWorldPosition(w); root.worldToLocal(w); root.attach(n); });
    const leaks = [[-8.7, 3.0, WF + 0.45], [14.0, 2.7, WF + 0.45], [-2.0, 3.25, WF + 0.25], [10.8, 3.0, WF + 0.25]];
    // cable runs on the wall (sagging), junction boxes
    for (const [x0, x1, y] of [[-17.5, -10.5, 2.9], [-4.4, 1.0, 3.35], [10.0, 17.5, 2.55]]) {
      const pts = []; for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push([x0 + (x1 - x0) * u, y - Math.sin(u * Math.PI) * 0.25, WF + 0.05]); } K.tube(pts, 0.03, M.soot, S, 24, 4);
      K.box(0.3, 0.36, 0.14, M.ironM, x0, y, WF + 0.07, S);
    }

    // ================= CHIMNEYS + SKYLINE + GASOMETER + AIRSHIP =================
    const chimTops = [];
    for (const [x, z, h, r] of [[-15.8, -8.6, 5.0, 0.6], [-11, -8.4, 5.8, 0.75], [-1.5, -8.2, 6.2, 0.9], [7, -8.6, 5.4, 0.7], [12.5, -8.0, 4.8, 0.55]]) {
      const bt = K.mat(0xffffff, { map: brickTex(K, [2, h / 1.2], true, false) });
      K.cyl(r, r * 1.2, h, bt, 10, x, h / 2, z, S);
      K.cyl(r * 1.18, r * 1.18, 0.3, M.soot, 10, x, h + 0.1, z, S);
      K.cyl(r * 1.25, r * 1.25, 0.1, M.brassD, 10, x, h - 0.6, z, S);
      K.cyl(r * 1.04, r * 1.04, 0.9, M.grimeL, 10, x, h - 0.2, z, S);
      for (let y = 0.8; y < h - 0.6; y += 0.32) K.box(0.12, 0.03, 0.05, M.iron, x, y, z + r * 1.1 - y * 0.03, S);
      chimTops.push([x, h + 0.3, z, r]);
    }
    const sil = K.mat(0x3e2a20), silD = K.mat(0x302016), silL = K.mat(0x4a3424);
    for (let x = -24; x < 24;) {
      const w = 1.5 + Math.random() * 2.5, h = 1.0 + Math.random() * 3.2, z = -13 - Math.random() * 5;
      K.box(w, h, 2, Math.random() < 0.5 ? sil : silD, x + w / 2, h / 2, z, S);
      for (let i = 0; i < Math.floor(w / 0.7); i++) { const tr = K.box(0.7, 0.5, 2, sil, x + 0.35 + i * 0.7, h + 0.2, z, S); tr.rotation.z = 0.55; tr.scale.y = 0.8; }
      if (Math.random() < 0.55) { const cx = x + w * Math.random(); K.cyl(0.18, 0.22, 1.8, silD, 6, cx, h + 0.9, z, S); chimTops.push([cx, h + 1.8, z, 0.18, true]); }
      for (let i = 0; i < 4; i++) if (Math.random() < 0.55) K.box(0.18, 0.22, 0.05, K.glow(Math.random() < 0.7 ? 0xe09a4a : 0xffd090), x + 0.4 + Math.random() * (w - 0.8), 0.4 + Math.random() * (h - 0.6), z + 1.03, S);
      x += w + 0.2;
    }
    // distant tower crane
    const tc = K.group(S, -19.5, 0, -15.5);
    for (let y = 0; y < 8; y += 0.8) { K.box(0.5, 0.06, 0.06, silL, 0, y, 0, tc); const b = K.box(0.06, 0.95, 0.06, silL, 0, y + 0.4, 0, tc); b.rotation.z = 0.55; }
    for (const s of [-0.25, 0.25]) K.box(0.08, 8, 0.08, silL, s, 4, 0, tc);
    K.box(7, 0.12, 0.12, silL, 2.0, 8.1, 0, tc); K.box(0.5, 0.5, 0.5, silD, -1.2, 7.9, 0, tc);
    const craneLamp = K.box(0.12, 0.12, 0.12, K.glow(0xff3a20), 0, 8.4, 0, tc);
    const gaso = K.group(S, 10.5, 0, -15.5);
    K.cyl(2.4, 2.4, 2.6, K.mat(0x4e3a2c), 16, 0, 1.3, 0, gaso);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; K.box(0.12, 3.6, 0.12, silL, Math.cos(a) * 2.55, 1.8, Math.sin(a) * 2.55, gaso); }
    for (const y of [1.2, 2.4, 3.5]) K.torus(2.55, 0.05, silL, 4, 24, 0, y, 0, gaso).rotation.x = Math.PI / 2;
    // airship drifting past
    const ship = K.group(root, -22, 5.6, -11.5);
    const env = K.sph(1, K.mat(0xa08058, { shine: 8 }), 0, 0, 0, ship, 16, 10); env.scale.set(2.4, 0.75, 0.75);
    for (let i = -2; i <= 2; i++) { const rib = K.torus(0.76 * Math.sqrt(1 - (i / 2.6) ** 2), 0.03, M.brassD, 4, 18, i * 0.85, 0, 0, ship); rib.rotation.y = Math.PI / 2; }
    for (const [y, z] of [[0.7, 0], [0, 0.7], [0, -0.7]]) K.box(0.8, y ? 0.6 : 0.05, z ? 0.6 : 0.05, M.leather, -2.3, y * 0.6, z * 0.6, ship);
    const gond = K.group(ship, 0.2, -0.95, 0);
    K.box(1.4, 0.32, 0.4, M.wood, 0, 0, 0, gond); K.box(1.5, 0.06, 0.46, M.brass, 0, 0.17, 0, gond);
    for (let i = 0; i < 4; i++) K.box(0.14, 0.1, 0.02, M.gas, -0.5 + i * 0.32, 0.02, 0.21, gond);
    for (const x of [-0.5, 0.5]) for (const zz of [0.15, -0.15]) K.box(0.03, 0.55, 0.03, M.iron, x, 0.42, zz, gond);
    const shipLamp = K.box(0.1, 0.1, 0.1, K.glow(0xff3a20), 2.45, 0, 0, ship);
    const prop = K.group(ship, -2.75, -0.1, 0); K.box(0.04, 0.9, 0.1, M.woodD, 0, 0, 0, prop);
    K.bake(ship); // static parts only (prop is its own group)

    // ================= BLAST FURNACE (left back) =================
    const FX = -12.2, FZc = -5.25;
    const bf = K.group(root, FX, 0, FZc);
    const bfs = K.group(bf);
    const bt = K.mat(0xffffff, { map: brickTex(K, [3, 3], true, false) });
    K.cyl(1.25, 1.45, 3.4, bt, 12, 0, 1.7, 0, bfs);
    for (const y of [0.6, 1.6, 2.6, 3.3]) { band(K, bfs, 1.3 + (3.4 - y) * 0.05, y, M.ironM, 0.14); rivetRing(K, bfs, 1.34 + (3.4 - y) * 0.05, y + 0.02, 18, M.brassD); }
    K.lathe([[1.25, 0], [0.9, 0.7], [0.5, 1.2], [0.5, 2.2]], M.ironM, 12, 0, 3.4, 0, bfs);
    K.cyl(0.6, 0.6, 0.2, M.rust, 12, 0, 5.7, 0, bfs);
    K.cyl(0.56, 0.56, 0.6, M.grimeL, 12, 0, 5.4, 0, bfs);
    const mouthM = K.glow(0xff8a2a);
    K.box(0.9, 0.8, 0.2, mouthM, 0, 0.85, 1.32, bfs);
    const mArc = K.cyl(0.45, 0.45, 0.2, mouthM, 10, 0, 1.25, 1.32, bfs); mArc.rotation.x = Math.PI / 2;
    K.box(1.2, 0.14, 0.4, M.soot, 0, 0.42, 1.4, bfs);
    for (let i = 0; i < 5; i++) K.box(0.07, 1.25, 0.08, M.soot, -0.36 + i * 0.18, 1.05, 1.46, bfs);
    for (const y of [0.75, 1.3]) K.box(1.0, 0.07, 0.08, M.soot, 0, y, 1.46, bfs);
    K.box(1.3, 0.2, 0.3, M.ironM, 0, 1.78, 1.4, bfs);
    gauge(K, bfs, 0.9, 1.9, 1.05, 0.15, 0.6);
    // charging ramp + skip bucket up the side
    K.tube([[1.5, 0.2, 0.2], [1.4, 2.5, 0.0], [0.7, 4.5, -0.2]], 0.07, M.iron, bfs, 12, 4);
    K.tube([[1.75, 0.2, -0.25], [1.65, 2.5, -0.4], [0.95, 4.5, -0.6]], 0.07, M.iron, bfs, 12, 4);
    const skip = K.group(bf, 1.5, 0.6, 0.0); K.box(0.42, 0.32, 0.42, M.rust, 0, 0, 0, skip); for (let i = 0; i < 4; i++) K.rock(0.08, M.coal, K.R() * 0.24, 0.18, K.R() * 0.24, skip);
    // molten runner channel to the crucible
    const runM = K.glow(0xff8a2a);
    K.box(0.42, 0.1, 1.1, M.soot, 0.45, 0.13, 1.85, bfs);
    K.box(0.22, 0.04, 1.1, runM, 0.45, 0.19, 1.85, bfs);
    K.box(1.6, 0.1, 0.42, M.soot, 1.2, 0.13, 2.35, bfs);
    K.box(1.6, 0.04, 0.22, runM, 1.2, 0.19, 2.35, bfs);
    const cru = K.group(bf, 2.2, 0, 1.6); K.cyl(0.45, 0.35, 0.6, M.ironL, 10, 0, 0.3, 0, cru); band(K, cru, 0.46, 0.45, M.brassD, 0.06);
    const molten = K.cyl(0.4, 0.4, 0.04, K.glow(0xffb050), 10, 0, 0.6, 0, cru);
    K.tube([[0.6, 4.6, -0.5], [1.6, 5.0, -0.8], [3.0, 5.0, -1.2], [3.6, 4.3, -1.3], [3.6, 3.6, -1.3]], 0.16, M.rust, bfs, 24, 6);
    // coal heap + shovel worker at the furnace
    for (let i = 0; i < 30; i++) K.rock(0.12 + Math.random() * 0.16, M.coal, -1.4 + Math.random() * 1.0, 0.08 + Math.random() * 0.25, 1.0 + Math.random() * 1.0, bfs);
    const stoker = worker(K, bf, 0x3e4a5a, -0.2, 2.1); stoker.g.rotation.y = Math.PI * 0.85;
    const shovel = K.group(stoker.arms[1], 0, -0.32, 0.05); K.box(0.04, 0.7, 0.04, M.wood, 0, -0.1, 0.12, shovel).rotation.x = 1.0; K.box(0.2, 0.03, 0.22, M.ironL, 0, -0.32, 0.42, shovel).rotation.x = 0.4;
    const furnL = K.light(0xff6a1a, 2.8, 12, 0, 1.2, 2.6, bf);
    K.bake(bfs);

    // ================= STEAM HAMMER (right back): ambient forging =================
    const hm = K.group(root, 13.6, 0, -4.9);
    const hms = K.group(hm);
    const red = K.mat(0x7a2a18, { shine: 16, spec: 0x2a1a10 });
    for (const s of [-1, 1]) { K.box(0.42, 4.4, 0.42, red, s * 1.0, 2.2, 0, hms); K.box(0.6, 0.3, 0.6, M.ironM, s * 1.0, 0.15, 0, hms); for (const y of [1.2, 2.6, 4.0]) K.box(0.48, 0.08, 0.48, M.brassD, s * 1.0, y, 0, hms); hazardBand(K, hms, 0.6, 0.6, 0.22, 4, 0, s * 1.0); }
    K.box(2.6, 0.55, 0.7, red, 0, 4.55, 0, hms); K.box(2.65, 0.08, 0.75, M.rust, 0, 4.86, 0, hms);
    K.cyl(0.36, 0.36, 1.2, M.ironL, 10, 0, 5.4, 0, hms); band(K, hms, 0.38, 5.1, M.brassD, 0.08); band(K, hms, 0.38, 5.7, M.brassD, 0.08);
    K.tube([[0.4, 5.6, 0], [1.4, 5.8, 0.2], [2.0, 5.0, 0.6], [2.0, 0.4, 0.6]], 0.09, M.copper, hms, 16, 6);
    K.box(1.0, 0.5, 0.8, M.ironM, 0, 0.25, 0, hms); K.box(0.8, 0.25, 0.6, M.iron, 0, 0.62, 0, hms);
    const ram = K.group(hm, 0, 3.0, 0); K.box(0.8, 0.8, 0.6, M.ironL, 0, 0, 0, ram); K.box(0.82, 0.12, 0.62, M.hazard, 0, -0.32, 0, ram); K.box(0.6, 0.15, 0.45, M.iron, 0, -0.47, 0, ram);
    const rod = K.cyl(0.08, 0.08, 1.6, M.ironL, 6, 0, 1.0, 0, ram);
    const ingotM = K.glow(0xffa040); const ingot = K.box(0.5, 0.14, 0.24, ingotM, 0.05, 0.82, 0, hm);
    const smith = worker(K, hm, 0x5a4a3a, 0.2, 1.0); smith.g.rotation.y = Math.PI; smith.arms.forEach((a) => (a.rotation.x = -1.0));
    const tongs = K.box(0.04, 0.04, 0.8, M.ironL, 0.2, 0.86, 0.5, hm);
    for (let i = 0; i < 8; i++) K.box(0.5, 0.06, 0.24, K.mat(0x5a4a44), 1.8, 0.04 + i * 0.065, 0.2 + (i % 2) * 0.05, hms); // ingot stack
    K.bake(hms);

    // ================= YARD PROPS =================
    // left: workshop shed with lit window, barrel stacks, gas bottles, hoses
    const shed = K.group(S, -17.3, 0, -3.9);
    K.box(1.9, 2.3, 2.6, K.mat(0x4a3a2c), 0, 1.15, 0, shed);
    for (let i = 0; i < 9; i++) K.box(1.92, 0.04, 0.05, M.woodD, 0, 0.25 + i * 0.25, 1.31, shed);
    const roof = K.box(2.3, 0.12, 3.0, M.roofIron, 0, 2.45, 0, shed); roof.rotation.x = 0.12; for (let i = 0; i < 6; i++) K.box(0.05, 0.03, 3.0, M.ironM, -1.0 + i * 0.4, 2.52, 0, shed).rotation.x = 0.12; for (let i = 0; i < 3; i++) K.box(0.12, 0.01, 1.2, M.rustStain, -0.7 + i * 0.6, 2.53, 0.6, shed).rotation.x = 0.12;
    K.box(0.7, 0.55, 0.05, K.glow(0xd88a3a), 0.35, 1.45, 1.32, shed); K.box(0.06, 0.6, 0.07, M.iron, 0.35, 1.45, 1.34, shed);
    K.box(0.6, 1.5, 0.05, M.woodD, -0.45, 0.75, 1.32, shed);
    K.cyl(0.08, 0.08, 1.0, M.soot, 6, 0.6, 2.9, -0.6, shed); chimTops.push([-17.3 + 0.6, 3.4, -3.9 - 0.6, 0.08, true]);
    [[-17.7, 0.1], [-17.0, 0.4], [-17.6, 0.85], [-16.9, 1.25], [-17.7, 1.6]].forEach(([x, z], i) => barrel(K, S, x, z, i % 2 ? M.wood : M.copperD));
    barrel(K, S, -16.5, 2.4, M.wood, 0.5);
    for (let i = 0; i < 4; i++) { const gb = K.cyl(0.13, 0.13, 1.1, K.mat(i % 2 ? 0x2a5a4a : 0x6a2a1a, { shine: 30 }), 8, -18.0 + i * 0.3, 0.55, -1.6, S); K.sph(0.13, M.brassD, -18.0 + i * 0.3, 1.12, -1.6, S, 6, 4); }
    coil(K, S, -16.6, 3.3, 0.35, M.soot);
    [[-17.4, 5.0, 0.9, 0.2], [-17.6, 6.1, 0.7, -0.3], [-16.8, 5.8, 0.55, 0.5], [-17.3, 4.0, 0.6, 0.1]].forEach(([x, z, s, ry]) => crate(K, S, x, z, s, ry));
    crate(K, S, -17.4, 5.0 + 0.0, 0.5, 0.6).position.y = 0.9;
    toolbox(K, S, -16.6, 6.6, 0.3);
    // right: coal pile with wheelbarrow, rocket-parts depot, water tower, fuel drums
    for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5; K.rock(0.14 + Math.random() * 0.2, M.coal, 16.4 + Math.cos(a) * r, 0.1 + (1.5 - r) * 0.35 + Math.random() * 0.15, -1.6 + Math.sin(a) * r * 0.8, S); }
    const shovelR = K.box(0.05, 0.05, 1.1, M.wood, 15.6, 0.5, -0.7, S); shovelR.rotation.set(0.9, 0.4, 0);
    // spare rocket nose cones + fuel tank on cradles
    const depot = K.group(S, 16.3, 0, 3.6);
    for (const [x, z, ry] of [[-0.4, -0.6, 0.2], [0.8, 0.6, -0.3]]) { const nc = K.group(depot, x, 0.45, z); nc.rotation.set(0, ry, Math.PI / 2); K.lathe([[0.42, 0], [0.36, 0.5], [0.2, 0.9], [0.04, 1.15]], M.copperD, 12, 0, 0, 0, nc); K.torus(0.42, 0.03, M.brassD, 4, 16, 0, 0.02, 0, nc).rotation.x = Math.PI / 2; for (const s of [-0.3, 0.3]) K.box(0.12, 0.42, 0.6, M.woodD, 0, s, 0, nc).rotation.z = Math.PI / 2; }
    const ft = K.group(depot, 0.2, 0, 2.0); ft.rotation.y = 0.3; for (const x of [-0.6, 0.6]) K.box(0.16, 0.36, 0.8, M.iron, x, 0.18, 0, ft); const ftb = K.cyl(0.38, 0.38, 1.8, M.brassD, 12, 0, 0.6, 0, ft); ftb.rotation.z = Math.PI / 2; for (const x of [-0.5, 0, 0.5]) { const b2 = K.cyl(0.4, 0.4, 0.06, M.brassD, 12, x, 0.6, 0, ft); b2.rotation.z = Math.PI / 2; }
    K.box(0.6, 0.2, 0.02, M.hazard, 0, 0.62, 0.39, ft);
    [[17.7, 0.6], [17.9, 1.4], [17.2, 1.1]].forEach(([x, z], i) => drum(K, S, x, z, i % 2 ? 0x7a2a1a : 0x2a4a3a));
    drum(K, S, 15.7, 5.9, 0x7a2a1a, 0.9);
    // water tower
    const wt = K.group(S, 17.1, 0, -5.4);
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.7, 0.7]) K.box(0.14, 3.6, 0.14, M.iron, sx, 1.8, sz, wt);
    for (const y of [1.0, 2.2]) { K.box(1.55, 0.08, 0.08, M.ironM, 0, y, 0.7, wt); K.box(1.55, 0.08, 0.08, M.ironM, 0, y, -0.7, wt); K.box(0.08, 0.08, 1.55, M.ironM, 0.7, y, 0, wt); K.box(0.08, 0.08, 1.55, M.ironM, -0.7, y, 0, wt); }
    K.cyl(1.0, 1.0, 1.5, M.woodD, 14, 0, 4.35, 0, wt); for (const y of [3.8, 4.35, 4.9]) band(K, wt, 1.02, y, M.iron, 0.06);
    K.cone(1.1, 0.7, M.roofIron, 14, 0, 5.45, 0, wt); K.box(0.4, 0.3, 0.05, M.hazard, 0, 4.4, 1.02, wt);
    K.tube([[0.8, 3.6, 0.3], [1.0, 2.0, 0.6], [1.0, 0.3, 0.6]], 0.06, M.copperD, wt, 10, 5);
    // front strip: low props only (the camera looks over them)
    const lamps = [lamp(K, root, -11.6, 6.6, 2.6, false, anim), lamp(K, root, -4.6, 6.6, 2.6, true, anim), lamp(K, root, 4.6, 6.6, 2.6, true, anim), lamp(K, root, 12.0, 6.6, 2.6, false, anim)];
    toolbox(K, S, -8.2, 6.8, -0.4); toolbox(K, S, 7.8, 4.6, 0.8);
    coil(K, S, 1.8, 6.4, 0.32, M.ironL); coil(K, S, -2.7, 4.4, 0.28, M.soot);
    crate(K, S, 14.4, 6.4, 0.6, 0.3); crate(K, S, 15.1, 6.6, 0.45, -0.2); crate(K, S, -13.0, 6.5, 0.55, 0.2);
    barrel(K, S, 9.4, 6.9, M.copperD); barrel(K, S, -6.8, 6.6, M.wood, 1.2);
    // hoses lying on the floor between front props
    K.tube([[-9.6, 0.14, 6.0], [-9.0, 0.14, 5.7], [-8.2, 0.14, 5.9], [-7.5, 0.14, 5.4], [-6.9, 0.14, 5.7]], 0.06, M.soot, S, 20, 5);
    K.tube([[10.6, 0.14, 5.6], [11.2, 0.14, 6.1], [12.2, 0.14, 5.8], [13.0, 0.14, 6.2]], 0.06, K.mat(0x5a2a1a), S, 20, 5);
    // back strip clutter: crates and parts racks between wall and conduits
    [[-9.0, -5.3, 0.7, 0.2], [-8.2, -5.6, 0.5, -0.4], [-1.9, -5.6, 0.6, 0.3], [-0.6, -5.5, 0.85, -0.1], [5.6, -5.5, 0.7, 0.4], [6.6, -5.3, 0.5, 0.1], [11.0, -5.7, 0.6, -0.2]].forEach(([x, z, s, ry]) => crate(K, S, x, z, s, ry));
    for (const [x, z] of [[-5.2, -5.3], [2.9, -5.3]]) {
      const rk = K.group(S, x, 0, z); for (const sx of [-0.8, 0.8]) K.box(0.08, 1.8, 0.5, M.iron, sx, 0.9, 0, rk);
      for (const y of [0.4, 1.0, 1.6]) { K.box(1.7, 0.06, 0.5, M.ironM, 0, y, 0, rk); for (let i = 0; i < 4; i++) { const gg = gear(K, rk, 0.16 + Math.random() * 0.06, 0.06, 10, Math.random() < 0.4 ? M.brassD : M.ironM, -0.55 + i * 0.36, y + 0.2, 0); gg.rotation.x = Math.PI / 2 + 0.2; } }
    }
    barrel(K, S, -3.0, -5.6, M.copperD); barrel(K, S, 1.0, -5.9, M.wood); barrel(K, S, 4.2, -5.8, M.copperD);
    // floor steam vents
    const steamVents = [[-6.8, 5.2], [1.6, 4.0], [-16.6, -0.9], [16.6, -3.6], [8.4, -4.4], [-7.4, -4.6]].filter(([x, z]) => clear(x, z, 0.4));
    steamVents.forEach(([x, z]) => { K.box(0.7, 0.06, 0.7, M.ironM, x, 0.13, z, S); for (let i = 0; i < 4; i++) K.box(0.6, 0.07, 0.05, M.soot, x, 0.15, z - 0.24 + i * 0.16, S); });

    // ================= WORKERS (walking) =================
    const walkers = [
      { w: worker(K, root, 0x4a3a2c, 0, 0), axis: 'z', a0: -2.3, a1: 1.8, fix: -16.15, sp: 0.55, x: 0, dir: 1, load: 'crate' },
      { w: worker(K, root, 0x3a4a52, 0, 0), axis: 'x', a0: 14.3, a1: 17.3, fix: 2.3, sp: 0.5, x: 15, dir: -1, load: 'barrow' }
    ];
    walkers.forEach((wk) => {
      if (wk.load === 'crate') { const c = K.group(wk.w.body, 0, 0.42, 0.22); K.box(0.36, 0.28, 0.3, M.woodD, 0, 0, 0, c); K.box(0.38, 0.04, 0.32, M.wood, 0, 0.12, 0, c); wk.w.arms.forEach((a) => (a.rotation.x = -1.2)); }
      else { const b = K.group(wk.w.g, 0, 0, 0.62); K.box(0.55, 0.24, 0.42, M.rust, 0, 0.42, 0, b); for (let i = 0; i < 5; i++) K.rock(0.08, M.coal, K.R() * 0.3, 0.58, K.R() * 0.2, b); const wh = K.cyl(0.14, 0.14, 0.05, M.iron, 10, 0, 0.16, 0.32, b); wh.rotation.z = Math.PI / 2; wk.wheel = wh; wk.w.arms.forEach((a) => (a.rotation.x = -0.5)); }
    });

    // ================= ROUND 2: more life on the deck =================
    const life = [];
    // ---- foreman automaton with a clipboard, walking the back strip and checking each bay ----
    const fm = K.group(root, -8.0, 0, -4.05);
    const fmBody = K.mat(dd(0x6a6a70, 0.95, 0.1), { shine: 40, spec: 0x55555a }), fmTrim = K.mat(C.brassD, { shine: 30 });
    const fmLegs = [];
    for (const s of [-1, 1]) { const hip = K.group(fm, s * 0.1, 0.46, 0); K.box(0.09, 0.42, 0.09, M.ironM, 0, -0.21, 0, hip); K.box(0.13, 0.06, 0.2, M.iron, 0, -0.43, 0.03, hip); fmLegs.push(hip); }
    const fmTorso = K.group(fm, 0, 0.46, 0);
    K.cyl(0.17, 0.2, 0.46, fmBody, 10, 0, 0.23, 0, fmTorso);
    K.cyl(0.21, 0.21, 0.05, fmTrim, 10, 0, 0.05, 0, fmTorso); K.cyl(0.18, 0.18, 0.05, fmTrim, 10, 0, 0.44, 0, fmTorso);
    for (let i = 0; i < 3; i++) K.box(0.04, 0.04, 0.02, K.mat(0xd8c49a), 0, 0.14 + i * 0.09, 0.19, fmTorso);
    const fmHead = K.group(fmTorso, 0, 0.6, 0);
    K.sph(0.14, fmBody, 0, 0, 0, fmHead, 10, 8);
    const fmEye = K.box(0.16, 0.05, 0.04, K.glow(0xffc060), 0, 0.01, 0.12, fmHead);
    K.cyl(0.17, 0.17, 0.03, K.mat(0x1c1612), 12, 0, 0.11, 0, fmHead); K.cyl(0.11, 0.12, 0.14, K.mat(0x1c1612), 10, 0, 0.18, 0, fmHead);
    const fmArmR = K.group(fmTorso, 0.22, 0.38, 0); K.box(0.07, 0.3, 0.07, M.ironM, 0, -0.14, 0, fmArmR); fmArmR.rotation.x = -1.1;
    const board = K.group(fmArmR, 0, -0.3, 0.06); K.box(0.24, 0.02, 0.32, M.woodD, 0, 0, 0, board); K.box(0.2, 0.025, 0.26, K.mat(0xe8dcc0), 0, 0.012, 0.01, board); K.box(0.08, 0.035, 0.04, fmTrim, 0, 0.02, -0.14, board);
    const fmArmL = K.group(fmTorso, -0.22, 0.38, 0); K.box(0.07, 0.3, 0.07, M.ironM, 0, -0.14, 0, fmArmL);
    const pencil = K.box(0.02, 0.02, 0.12, K.mat(0xc8a030), 0, -0.3, 0.04, fmArmL);
    const STOPS = [-7.0, 0.0, 6.4]; let fmI = 0, fmDir = 1, fmX = -8.0, fmWait = 0;
    life.push((t, dt) => {
      const target = STOPS[fmI];
      if (fmWait > 0) {
        fmWait -= dt; fm.rotation.y += ((0) - fm.rotation.y) * Math.min(1, dt * 4); // face the bay (+z)
        fmArmL.rotation.x = -1.0 + Math.sin(t * 9) * 0.12; fmArmL.rotation.z = Math.sin(t * 5) * 0.1; fmHead.rotation.x = 0.25; fmHead.rotation.y = Math.sin(t * 0.8) * 0.4;
        fmLegs.forEach((l) => (l.rotation.x *= 0.8));
        if (fmWait <= 0) { if (fmI === STOPS.length - 1) fmDir = -1; if (fmI === 0) fmDir = 1; fmI += fmDir; }
        return;
      }
      const d = target - fmX, step = Math.sign(d) * Math.min(Math.abs(d), 0.75 * dt);
      fmX += step; fm.position.x = fmX;
      fm.rotation.y += ((d > 0 ? Math.PI / 2 : -Math.PI / 2) - fm.rotation.y) * Math.min(1, dt * 6);
      const ph = t * 6; fmLegs[0].rotation.x = Math.sin(ph) * 0.45; fmLegs[1].rotation.x = -Math.sin(ph) * 0.45; fmTorso.position.y = 0.46 + Math.abs(Math.sin(ph)) * 0.02;
      fmArmL.rotation.x = Math.sin(ph) * 0.3; fmHead.rotation.x = 0; fmHead.rotation.y = 0;
      if (Math.abs(d) < 0.02) fmWait = 2.6;
      fmEye.material.color.setHex(Math.sin(t * 2.3) > 0.95 ? 0x3a2a10 : 0xffc060);
    });
    // ---- grinder bench with a worker throwing sparks ----
    const gb = K.group(S, -6.9, 0, -5.5);
    K.box(0.9, 0.08, 0.55, M.woodD, 0, 0.82, 0, gb); for (const sx of [-0.38, 0.38]) for (const sz of [-0.22, 0.22]) K.box(0.07, 0.8, 0.07, M.iron, sx, 0.4, sz, gb);
    K.box(0.36, 0.26, 0.26, M.ironM, 0.18, 0.99, -0.05, gb); K.cyl(0.05, 0.05, 0.5, M.ironL, 6, 0, 1.0, -0.05, gb).rotation.z = Math.PI / 2;
    K.box(0.12, 0.24, 0.03, K.mat(dd(0x7a2a18)), -0.18, 1.06, 0.12, gb);
    const wheel = K.group(root, -7.1, 1.0, -5.55); const wh = K.cyl(0.2, 0.2, 0.06, K.mat(0x5a5650), 12, 0, 0, 0, wheel); wh.rotation.z = Math.PI / 2; K.box(0.06, 0.04, 0.04, M.ironL, 0, 0.18, 0, wheel);
    const grinder = worker(K, root, dd(0x4a4030, 1, 0.1), -7.1, -4.9); grinder.g.rotation.y = Math.PI; grinder.arms.forEach((a) => (a.rotation.x = -1.25));
    const bar = K.box(0.04, 0.04, 0.5, M.ironL, -7.1, 1.0, -5.2, root);
    let tGr = 0, grOn = true, grT = 0;
    life.push((t, dt) => {
      wheel.rotation.x -= dt * 22; grT -= dt; if (grT <= 0) { grOn = !grOn; grT = grOn ? 2.5 + Math.random() * 2 : 1.4 + Math.random(); }
      bar.position.z = -5.2 + (grOn ? 0 : 0.18); grinder.body.rotation.x = grOn ? -0.12 : 0; tGr -= dt;
      if (grOn && tGr <= 0) { tGr = 0.035; K.spawn(root, -7.1 + K.R() * 0.06, 0.95, -5.38, K.R() * 1.2, 0.4 + Math.random() * 1.6, 1.0 + Math.random() * 2.2, Math.random() < 0.6 ? 0xffc858 : 0xfff2c8, 0.38, 0.035, 6, true); }
    });
    // ---- manhole covers that breathe steam ----
    const manholes = [[-8.0, 4.4], [5.6, 5.4], [14.0, 4.4], [-12.4, -3.3]].filter(([x, z]) => clear(x, z, 0.45));
    manholes.forEach(([x, z]) => {
      K.cyl(0.46, 0.46, 0.04, M.iron, 16, x, 0.12, z, S); K.torus(0.42, 0.03, M.ironL, 4, 18, x, 0.145, z, S).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) { const b = K.box(0.7, 0.012, 0.05, M.ironM, x, 0.148, z, S); b.rotation.y = i * Math.PI / 4; }
      K.cyl(0.08, 0.08, 0.02, M.brassD, 8, x, 0.15, z, S);
    });
    let tMh = 0;
    life.push((t, dt) => { tMh -= dt; if (tMh <= 0 && manholes.length) { tMh = 0.22; const [x, z] = manholes[Math.floor(Math.random() * manholes.length)]; const a = Math.random() * Math.PI * 2; K.spawn(root, x + Math.cos(a) * 0.42, 0.18, z + Math.sin(a) * 0.42, Math.cos(a) * 0.15 + 0.1, 0.55 + Math.random() * 0.3, Math.sin(a) * 0.15, 0xb8ae9c, 2.0, 0.1, -0.1); } });
    // ---- crows on the chimneys (perch, bob, hop, sometimes take a lap and come back) ----
    const crowM = K.mat(0x141218, { shine: 30, spec: 0x3a3a50 }), beakM = K.mat(0x5a5040);
    const perches = chimTops.slice(0, 5).map(([x, y, z, r]) => [x, y - 0.15, z, r]).concat([[-6.3, 3.98, -6.6, 0], [10.4, 3.98, -6.6, 0]]);
    const crows = [0, 1, 1, 3, 5, 6].map((pi, k) => {
      const [px, py, pz, pr] = perches[pi]; const a = k * 1.7;
      const home = new K.THREE.Vector3(px + Math.cos(a) * pr * 0.95, py, pz + Math.sin(a) * pr * 0.95);
      const c = K.group(root, home.x, home.y, home.z);
      const body = K.group(c); K.box(0.2, 0.12, 0.11, crowM, 0, 0.1, 0, body); const tail = K.box(0.12, 0.03, 0.08, crowM, -0.14, 0.12, 0, body); tail.rotation.z = 0.3;
      const hd = K.group(body, 0.11, 0.19, 0); K.box(0.09, 0.08, 0.08, crowM, 0, 0, 0, hd); K.box(0.06, 0.025, 0.03, beakM, 0.07, -0.01, 0, hd);
      for (const s of [-1, 1]) K.box(0.015, 0.06, 0.015, beakM, 0.02, 0.03, s * 0.03, body);
      const wings = [-1, 1].map((s) => { const wg = K.group(body, 0, 0.13, s * 0.055); K.box(0.16, 0.02, 0.18, crowM, 0, 0, s * 0.09, wg); wg.visible = false; return wg; });
      c.rotation.y = Math.random() * 6;
      return { c, body, hd, wings, home, state: 'perch', t: 6 + Math.random() * 20, ang: 0, rad: 2 + Math.random() * 1.5, cy: 7.5 + Math.random() * 1.5 };
    });
    life.push((t, dt) => crows.forEach((cw, i) => {
      cw.t -= dt;
      if (cw.state === 'perch') {
        cw.hd.rotation.y = Math.sin(t * 1.3 + i * 2) > 0.7 ? 0.6 : Math.sin(t * 0.7 + i) * 0.3; cw.hd.rotation.z = Math.max(0, Math.sin(t * 3 + i)) * 0.25;
        if (Math.random() < dt * 0.15) cw.c.rotation.y += K.R() * 2;
        if (cw.t <= 0) { cw.state = 'fly'; cw.t = 5 + Math.random() * 4; cw.ang = Math.atan2(cw.c.position.z - cw.home.z, cw.c.position.x - cw.home.x); cw.wings.forEach((w) => (w.visible = true)); }
      } else if (cw.state === 'fly') {
        cw.ang += dt * 0.9; const tx = cw.home.x + Math.cos(cw.ang) * cw.rad, tz = cw.home.z - 1.5 + Math.sin(cw.ang) * cw.rad * 0.6, ty = cw.cy + Math.sin(cw.ang * 2) * 0.4;
        cw.c.position.x += (tx - cw.c.position.x) * Math.min(1, dt * 2); cw.c.position.y += (ty - cw.c.position.y) * Math.min(1, dt * 2); cw.c.position.z += (tz - cw.c.position.z) * Math.min(1, dt * 2);
        cw.c.rotation.y = -cw.ang - Math.PI / 2 + Math.PI; const fl = Math.sin(t * 22 + i) * 0.9; cw.wings[0].rotation.x = fl; cw.wings[1].rotation.x = -fl;
        if (cw.t <= 0) cw.state = 'land';
      } else {
        const d = cw.home.clone().sub(cw.c.position); const L = d.length();
        cw.c.position.addScaledVector(d, Math.min(1, dt * 1.8)); const fl = Math.sin(t * 26 + i) * 0.9; cw.wings[0].rotation.x = fl; cw.wings[1].rotation.x = -fl;
        if (L < 0.05) { cw.c.position.copy(cw.home); cw.state = 'perch'; cw.t = 10 + Math.random() * 25; cw.wings.forEach((w) => (w.visible = false)); }
      }
    }));
    // ---- silhouettes passing behind lit windows ----
    const silM = K.mat(0x2a160a);
    const sils = litWins.slice(0, 5).map((x, k) => {
      const s = K.group(root, x, 0, WF + 0.04); K.box(0.32, 0.5, 0.01, silM, 0, 1.55, 0, s); K.box(0.17, 0.17, 0.01, silM, 0, 1.92, 0, s); K.box(0.22, 0.05, 0.01, silM, 0, 2.02, 0, s);
      s.visible = false; return { s, x, o: -1, sp: 0.2 + Math.random() * 0.12, wait: 3 + k * 4 + Math.random() * 6 };
    });
    life.push((t, dt) => sils.forEach((q) => {
      if (q.wait > 0) { q.wait -= dt; q.s.visible = false; return; }
      q.o += q.sp * dt; if (q.o > 0.6) { q.o = -0.6; q.wait = 6 + Math.random() * 10; q.sp = (Math.random() < 0.5 ? 1 : -1) * Math.abs(q.sp); }
      const o = q.sp > 0 ? q.o : -q.o; q.s.position.x = q.x + o; q.s.visible = Math.abs(o) < 0.26; q.s.position.y = Math.abs(Math.sin(t * 6)) * 0.02;
    }));
    // ---- leaky standpipe taps dripping into puddles (ripples) ----
    const taps = [[7.3, -5.0, 6.9, -4.6], [0.45, -5.15, -0.05, -4.72]];
    const ripples = [];
    for (let i = 0; i < 8; i++) { const rp = K.torus(1, 0.04, K.glow(0xc8c0d8, 0.5, true), 3, 20, 0, 0.13, 0, root); rp.rotation.x = Math.PI / 2; rp.visible = false; rp.castShadow = false; ripples.push({ rp, t: 0, on: false }); }
    const drips = [];
    taps.forEach(([px, pz, dx, dz]) => {
      K.cyl(0.06, 0.06, 1.05, M.copperD, 8, px, 0.52, pz, S); K.cyl(0.1, 0.1, 0.06, M.ironM, 8, px, 0.13, pz, S);
      K.tube([[px, 1.02, pz], [px + (dx - px) * 0.5, 1.12, pz + (dz - pz) * 0.5], [dx, 1.0, dz], [dx, 0.9, dz]], 0.035, M.copperD, S, 10, 5);
      const vw = K.torus(0.08, 0.02, K.mat(dd(0x9a2a18)), 4, 10, px, 1.1, pz, S); vw.rotation.x = Math.PI / 2;
      drips.push({ x: dx, z: dz, t: Math.random(), d: null });
    });
    life.push((t, dt) => drips.forEach((dp) => {
      dp.t -= dt;
      if (dp.t <= 0 && !dp.d) { dp.t = 0.9 + Math.random() * 0.8; dp.d = K.box(0.03, 0.05, 0.03, K.glow(0xa8a0b8, 0.85), dp.x, 0.86, dp.z, root); dp.v = 0; }
      if (dp.d) { dp.v += 7 * dt; dp.d.position.y -= dp.v * dt; if (dp.d.position.y <= 0.13) { root.remove(dp.d); dp.d.material.dispose(); dp.d = null; const r = ripples.find((q) => !q.on); if (r) { r.on = true; r.t = 0; r.rp.position.set(dp.x, 0.13, dp.z); r.rp.visible = true; } } }
    }));
    life.push((t, dt) => ripples.forEach((r) => { if (!r.on) return; r.t += dt; const k = r.t / 0.9; r.rp.scale.setScalar(0.05 + k * 0.45); r.rp.material.opacity = 0.5 * (1 - k); if (k >= 1) { r.on = false; r.rp.visible = false; } }));
    // ---- noticeboard by the door with papers fluttering in the draught ----
    const nb = K.group(S, 6.45, 1.65, WF + 0.05);
    K.box(1.0, 0.95, 0.05, K.mat(dd(0x6a4a2c)), 0, 0, 0, nb);
    for (const [w, h, x, y] of [[1.06, 0.05, 0, 0.5], [1.06, 0.05, 0, -0.5], [0.05, 1.0, 0.52, 0], [0.05, 1.0, -0.52, 0]]) K.box(w, h, 0.07, M.woodD, x, y, 0.01, nb);
    const papers = [];
    [[-0.3, 0.28, 0.26, 0.3, 0xe6dcc4], [0.02, 0.3, 0.22, 0.26, 0xd8c890], [0.3, 0.24, 0.24, 0.34, 0xe6dcc4], [-0.28, -0.12, 0.3, 0.24, 0xcfc8b8], [0.06, -0.08, 0.2, 0.3, 0xe8b8a0], [0.32, -0.16, 0.22, 0.22, 0xe6dcc4], [-0.06, -0.36, 0.34, 0.12, 0xd8c890]].forEach(([x, y, w, h, c], i) => {
      const pv = K.group(root, 6.45 + x, 1.65 + y + h / 2, WF + 0.085); const pm = K.mat(dd(c, 0.9, 0.1));
      const pg = K.box(w, h, 0.01, pm, 0, -h / 2, 0, pv); pg.castShadow = false;
      for (let k = 0; k < 3; k++) K.box(w * (0.5 + Math.random() * 0.35), 0.016, 0.005, K.mat(0x3a2c20), -w * 0.05, -h * (0.25 + k * 0.2), 0.008, pv);
      K.box(0.03, 0.03, 0.02, K.mat(i % 2 ? 0xb02a1a : 0x2a5a8a), 0, -0.01, 0.012, pv);
      papers.push({ pv, k: Math.random() * 6 });
    });
    life.push((t) => { const gust = Math.max(0, Math.sin(t * 0.37)) ** 6; papers.forEach((p) => { p.pv.rotation.x = -(0.05 + gust * 0.5) * (0.6 + Math.sin(t * 7 + p.k) * 0.4); p.pv.rotation.z = Math.sin(t * 3 + p.k) * 0.04 * (1 + gust * 3); }); });

    K.bake(S);

    // ================= ANIMATION =================
    let tCh = 0, tV = 0, tDrip = 0, tLeak = 0, tHam = 0;
    const v = new K.THREE.Vector3();
    return { update(t, dt) {
      anim.forEach((f) => f(t, dt));
      life.forEach((f) => f(t, dt));
      // furnace
      const ff = 0.85 + Math.sin(t * 9) * 0.07 + Math.sin(t * 23) * 0.05;
      if (!furnL.isDummy) furnL.intensity = 2.8 * ff;
      mouthM.color.setRGB(1, 0.52 * ff, 0.16); runM.color.setRGB(1, 0.46 + Math.sin(t * 3) * 0.06, 0.1); molten.material.color.setRGB(1, 0.66 * ff, 0.24);
      vents.forEach((vm, i) => vm.color.setRGB(0.9 + Math.sin(t * 4 + i) * 0.1, 0.38 + Math.sin(t * 7 + i * 2) * 0.06, 0.1));
      skip.position.y = 0.6 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 3.6; skip.position.x = 1.5 - (skip.position.y - 0.6) * 0.2;
      if (Math.random() < 0.08) K.spawn(root, FX + K.R() * 0.4, 1.0, FZc + 1.5, K.R() * 0.6, 1.4, 0.8, 0xffa030, 0.8, 0.05, 2, true);
      // stoker shovels coal into the mouth
      const sp = (t * 0.5) % 1; stoker.arms.forEach((a, i) => (a.rotation.x = -0.6 - Math.sin(sp * Math.PI * 2) * 0.5)); stoker.body.rotation.x = Math.sin(sp * Math.PI * 2) * 0.15;
      // steam hammer: slow lift, hard strike, sparks + ingot cooling glow
      const hp = (t * 0.55) % 1;
      const ry = hp < 0.72 ? 1.6 + (hp / 0.72) * 2.0 : 3.6 - ((hp - 0.72) / 0.28) ** 2 * 2.0;
      ram.position.y = ry; rod.position.y = 1.0 + (3.6 - ry) * 0.45;
      tHam -= dt;
      if (hp > 0.96 && tHam <= 0) { tHam = 0.6; for (let i = 0; i < 16; i++) K.spawn(root, 13.6 + K.R() * 0.4, 1.0, -4.9 + K.R() * 0.3, K.R() * 4.5, 1 + Math.random() * 2.5, K.R() * 4.5, Math.random() < 0.5 ? 0xffc040 : 0xfff0c0, 0.5, 0.06, 7, true); puff(K, root, 13.6, 1.0, -4.9, 0x8a7e6e, 0.18, 0.6, 0.4, 1.4); }
      ingotM.color.setRGB(1, 0.5 + Math.max(0, 0.2 - (1 - hp) * 0.2), 0.15);
      tongs.rotation.y = Math.sin(t * 1.1) * 0.08; smith.head.rotation.y = Math.sin(t * 0.7) * 0.3;
      // wall gears, clock, gauges
      wallGears.forEach((w, i) => (w.g.rotation.y += dt * 0.55 * w.s * (i % 2 ? -1 : 1)));
      clkH.rotation.z = -t * 0.02; clkM.rotation.z = -t * 0.24;
      wallNeedles.forEach((n, i) => (n.rotation.z = 0.3 + Math.sin(t * (0.8 + i * 0.3) + i) * 0.5));
      // airship, crane lamp
      ship.position.x = -22 + ((t * 0.32) % 44); ship.position.y = 5.6 + Math.sin(t * 0.6) * 0.14; prop.rotation.x += dt * 14;
      shipLamp.visible = Math.sin(t * 3) > 0.3; craneLamp.visible = Math.sin(t * 2.2) > 0;
      // sheen shimmer + hanging chains sway
      sheens.forEach((s, i) => (s.material.opacity = 0.12 + Math.sin(t * 0.8 + i) * 0.05));
      hangers.forEach((h) => (h.hg.rotation.z = Math.sin(t * 0.9 + h.k) * 0.06));
      // workers
      walkers.forEach((wk) => {
        if (wk.pause > 0) { wk.pause -= dt; wk.w.legs.forEach((l) => (l.rotation.x *= 0.8)); return; }
        wk.x += wk.dir * wk.sp * dt;
        if (wk.x > wk.a1) { wk.x = wk.a1; wk.dir = -1; wk.pause = 1.6; } if (wk.x < wk.a0) { wk.x = wk.a0; wk.dir = 1; wk.pause = 1.6; }
        if (wk.axis === 'x') { wk.w.g.position.set(wk.x, 0, wk.fix); wk.w.g.rotation.y = wk.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { wk.w.g.position.set(wk.fix, 0, wk.x); wk.w.g.rotation.y = wk.dir > 0 ? 0 : Math.PI; }
        const ph = t * wk.sp * 7; wk.w.legs[0].rotation.x = Math.sin(ph) * 0.5; wk.w.legs[1].rotation.x = -Math.sin(ph) * 0.5;
        wk.w.body.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.025;
        if (wk.wheel) wk.wheel.rotation.x += dt * wk.sp * 7;
      });
      // smoke from chimneys, steam vents, pipe leaks, oil drips off the front spouts
      tCh -= dt;
      if (tCh <= 0) { tCh = 0.12; chimTops.forEach(([x, y, z, r, far]) => { if (far && Math.random() < 0.55) return; K.spawn(root, x + K.R() * r, y, z + K.R() * r, 0.35 + K.R() * 0.2, 0.7 + Math.random() * 0.3, K.R() * 0.2, Math.random() < 0.5 ? 0x3a302a : 0x4e443a, far ? 3 : 4.4, far ? 0.22 : 0.44, -0.08); }); }
      if (Math.random() < 0.25) K.spawn(root, FX + K.R() * 0.6, 5.85, FZc + K.R() * 0.6, 0.3 + K.R() * 0.2, 0.9, K.R() * 0.2, Math.random() < 0.5 ? 0x2a221e : 0x3a302a, 4, 0.45, -0.08);
      tV -= dt;
      if (tV <= 0 && steamVents.length) { tV = 0.3; const sv = steamVents[Math.floor(Math.random() * steamVents.length)]; for (let i = 0; i < 3; i++) puff(K, root, sv[0], 0.2, sv[1], 0xb0a490, 0.18, 0.9, 0.4, 1.6); }
      tLeak -= dt;
      if (tLeak <= 0) { tLeak = 0.18; const l = leaks[Math.floor(Math.random() * leaks.length)]; K.spawn(root, l[0], l[1], l[2] + 0.2, K.R() * 0.5, 0.6, 0.5, 0xc8bca8, 1.1, 0.1, -0.15); }
      tDrip -= dt;
      if (tDrip <= 0) { tDrip = 0.45; const x = spouts[Math.floor(Math.random() * spouts.length)]; K.spawn(root, x, -0.65, FZ + 0.6, 0, -0.2, 0, 0x0a0806, 1.6, 0.06, 5); }
    } };
  });
})();
