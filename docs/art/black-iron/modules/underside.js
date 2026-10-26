// UNDERSIDE (Black Iron line) — everything below the deck slab (y < -1.4).
// NOTES (round 2):
//  - Rock: horizontal STRATA bands (fixed front depth per band, alternating value) built from wide blocks with
//    world-space UVs so the strata run continuously; dark seams + AO strips under each overhang; stalactites under
//    the silhouette. Only +z faces are ever visible to this camera.
//  - Mine level (y -9.9): the `rail` gallery. INBOX / GITHUB / SENTRY are real tunnels carved 1.8u deep into the
//    mine wall (receding timber sets, rails running in, lamps + ore glints in the mine colour, a working miner),
//    with a timber portal, a big Silkscreen sign, a semaphore arm and a bell. New carts roll out of them (core
//    emerge); on 'spawn' the portal flares, dust bursts, the semaphore drops to GO and the bell rings.
//  - ORE LIFT: rectangular paternoster (two sprockets top + bottom) in an iron shaft + headframe at the deck's
//    front-left. Empty cages circulate on the return side and one waits at the landing. Carrier handoffs use the
//    core's carrierDrop/carrierPick events: the cart tips on the tipper, backs off and rolls into the EMPTIES
//    siding tunnel; the waiting cage is hidden on pick; at the top the empty cage carries on over the sprockets
//    and down the return column.
//  - The ore belt's first leg (x -15.2 at deck level) is kept clear of headframe bracing and the sign.
//  - Hanging industry: soffit girders, slag furnace + quench tank, keel smelter, gears, flywheel engine, fans,
//    aether vein, catwalk + automatons, LEVEL 2 with carts and a miner, SHIPTORIO cargo airship with crew + net.
//  - No shadow receiving down here (the slab would black it out); 3 point lights; heavy use of emissive.
(function () {
  'use strict';
  const IRON = window.IRON;
  const C = {
    soot: 0x1e1915, iron: 0x40372f, ironM: 0x352d27, ironL: 0x5e5246,
    brass: 0xb08440, brassD: 0x6e5022, brassL: 0xdcae5c,
    copper: 0xa65a36, copperD: 0x703a22, verd: 0x3e8e74,
    rust: 0x8e4624, rustL: 0xb4642e, wood: 0x664628, woodD: 0x48331e,
    teal: 0x7af0d8, ember: 0xff7a2a, gas: 0xffc070
  };
  let M = null;
  function mats(K) {
    if (M) return M;
    M = {
      iron: K.mat(C.iron, { shine: 24, spec: 0x2c2a2a }), ironM: K.mat(C.ironM, { shine: 16, spec: 0x222020 }), ironL: K.mat(C.ironL, { shine: 34, spec: 0x4a4644 }),
      soot: K.mat(C.soot), brass: K.mat(C.brass, { shine: 40, spec: 0x7a5a28 }), brassD: K.mat(C.brassD, { shine: 20, spec: 0x3a2a10 }), brassL: K.mat(C.brassL, { shine: 50, spec: 0x9a7a40 }),
      copper: K.mat(C.copper, { shine: 34, spec: 0x6a3a20 }), copperD: K.mat(C.copperD, { shine: 20, spec: 0x3a1a0a }), verd: K.mat(C.verd, { shine: 20, spec: 0x2a4a40 }),
      rust: K.mat(C.rust), rustL: K.mat(C.rustL), wood: K.mat(C.wood), woodD: K.mat(C.woodD),
      hazard: K.mat(0xd09a18), black: K.mat(0x050403), rail: K.mat(0x8a8078, { shine: 60, spec: 0x8a8a8a }),
      gas: K.glow(C.gas), ember: K.glow(C.ember), teal: K.glow(C.teal),
      tealCrys: K.mat(0x3ac8b0, { e: 0x18a088, ei: 1, shine: 60, spec: 0xffffff }),
      tealPipe: K.mat(0x2a6a60, { e: 0x0a3a32, shine: 40, spec: 0x80fff0 }),
      water: K.mat(0x1a2e2c, { shine: 90, spec: 0x80a0a0, e: 0x081412 })
    };
    return M;
  }

  // ---------- signs: Silkscreen (crisp, thresholded) with a 3x5 pixel-font fallback ----------
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101',
    N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', '0': '111101101101111',
    '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '!': '010010010000010', '-': '000000111000000', ' ': '000000000000000'
  };
  function nearestTex(K, c) { const t = new K.THREE.CanvasTexture(c); t.magFilter = t.minFilter = K.THREE.NearestFilter; t.generateMipmaps = false; return t; }
  function signTexture(K, text, fg) {
    const c = document.createElement('canvas');
    const fontOK = document.fonts && document.fonts.check && document.fonts.check('700 16px Silkscreen');
    if (fontOK) {
      // native 8px Silkscreen: one texel per glyph pixel, so it survives 2x pixel mode
      const m = c.getContext('2d'); m.font = '400 8px Silkscreen'; const tw = Math.ceil(m.measureText(text).width);
      c.width = tw + 6; c.height = 12;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
      g.font = '400 8px Silkscreen'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.fillText(text, 3, 9);
      const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
      const f = new K.THREE.Color(fg); const fr = f.r * 255, fgc = f.g * 255, fb = f.b * 255;
      for (let i = 0; i < d.length; i += 4) { const on = d[i] > 110; d[i] = on ? fr : 12; d[i + 1] = on ? fgc : 8; d[i + 2] = on ? fb : 6; d[i + 3] = 255; }
      for (let x = 0; x < c.width; x++) for (const y of [0, c.height - 1]) { const i = (y * c.width + x) * 4; d[i] = fr * 0.45; d[i + 1] = fgc * 0.45; d[i + 2] = fb * 0.45; }
      for (let y = 0; y < c.height; y++) for (const x of [0, c.width - 1]) { const i = (y * c.width + x) * 4; d[i] = fr * 0.45; d[i + 1] = fgc * 0.45; d[i + 2] = fb * 0.45; }
      g.putImageData(img, 0, 0);
    } else {
      c.width = text.length * 4 + 3; c.height = 9; const g = c.getContext('2d');
      g.fillStyle = '#0c0806'; g.fillRect(0, 0, c.width, 9); g.fillStyle = fg;
      for (let i = 0; i < text.length; i++) { const gl = FONT[text[i]] || FONT[' ']; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (gl[r * 3 + k] === '1') g.fillRect(2 + i * 4 + k, 2 + r, 1, 1); }
    }
    return nearestTex(K, c);
  }
  // glowing sign facing +z; returns its basic material (tint it to flash)
  function sign(K, p, text, fg, x, y, z, h) {
    const tex = signTexture(K, text, fg);
    const w = h * (tex.image.width / tex.image.height);
    const face = new K.THREE.MeshBasicMaterial({ map: tex, color: 0xc0c0c0, fog: false });
    K.box(w + 0.14, h + 0.14, 0.08, M.ironM, x, y, z - 0.03, p);
    K.box(w, h, 0.06, [M.iron, M.iron, M.iron, M.iron, face, M.iron], x, y, z + 0.02, p);
    for (const sx of [-1, 1]) K.box(0.07, 0.07, 0.04, M.brassL, x + sx * (w / 2 + 0.03), y + h / 2 + 0.03, z + 0.06, p);
    return face;
  }

  // ---------- textures ----------
  // mottled cellular stone (tiles in world space): irregular plates with dark joints, a soft wavy stratum, grit
  function strataTex(K, seed, hewn) {
    return K.canvasTex(64, 64, (g) => {
      let s = seed; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const N = hewn ? 26 : 16, P = [];
      for (let i = 0; i < N; i++) P.push([r() * 64, r() * 64 * (hewn ? 1 : 0.8) + (hewn ? 0 : 6), 150 + Math.floor(r() * 70)]);
      const img = g.createImageData(64, 64), d = img.data;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        let d1 = 1e9, d2 = 1e9, tone = 180;
        for (const [px, py, tv] of P) { let dx = Math.abs(x - px), dy = Math.abs(y - py); dx = Math.min(dx, 64 - dx); dy = Math.min(dy, 64 - dy); const dd = Math.sqrt(dx * dx * (hewn ? 1 : 0.55) + dy * dy * (hewn ? 1 : 1.6)); if (dd < d1) { d2 = d1; d1 = dd; tone = tv; } else if (dd < d2) d2 = dd; }
        let v = tone + Math.sin((y + Math.sin(x * 0.2) * 2) * 0.2) * 8;
        if (d2 - d1 < 1.1) v = 70;                 // joint
        else if (d2 - d1 < 2.2) v -= 26;           // joint shadow
        if (d1 < 2.5 && !hewn) v += 14;            // lit plate centre
        v += (r() - 0.5) * 22;
        const i = (y * 64 + x) * 4; d[i] = v; d[i + 1] = v - 10; d[i + 2] = v - 22; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      if (hewn) for (let i = 0; i < 30; i++) { const x = Math.floor(r() * 62), yy = Math.floor(r() * 60); g.fillStyle = 'rgba(30,20,14,0.55)'; g.fillRect(x, yy, 1, 3); g.fillStyle = 'rgba(240,220,190,0.3)'; g.fillRect(x + 1, yy, 1, 2); }
    });
  }
  function plankTex(K, rep) {
    return K.canvasTex(32, 16, (g) => {
      let s = 17; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#3e2c1a'; g.fillRect(0, 0, 32, 16);
      for (let y = 0; y < 16; y += 4) { let x = -Math.floor(r() * 10); while (x < 32) { const w = 9 + Math.floor(r() * 10); g.fillStyle = ['#6a4c2e', '#614428', '#70522f', '#5c4127'][Math.floor(r() * 4)]; g.fillRect(x, y, w - 1, 3); g.fillStyle = 'rgba(255,220,170,0.1)'; g.fillRect(x, y, w - 1, 1); x += w; } }
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.floor(r() * 28), Math.floor(r() * 14), 4, 2); }
    }, rep);
  }
  let CHAIN = null;
  function chainTex(K) {
    if (CHAIN) return CHAIN;
    CHAIN = K.canvasTex(4, 8, (g) => { g.fillStyle = '#16120e'; g.fillRect(0, 0, 4, 8); g.fillStyle = '#7a6a58'; g.fillRect(1, 0, 2, 3); g.fillStyle = '#5a4c40'; g.fillRect(0, 4, 4, 1); g.fillRect(0, 7, 4, 1); g.fillStyle = '#9a8670'; g.fillRect(1, 0, 1, 1); });
    return CHAIN;
  }
  // a box whose UVs come from world (root) coordinates, so a texture runs continuously across neighbouring boxes
  function worldBox(K, w, h, d, mat, x, y, z, p, S) {
    const geo = new K.THREE.BoxGeometry(w, h, d);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const X = pos.getX(i) + x, Y = pos.getY(i) + y, Z = pos.getZ(i) + z, nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
      if (ny > 0.5) uv.setXY(i, X / S, Z / S); else if (nx > 0.5) uv.setXY(i, Z / S, Y / S); else uv.setXY(i, X / S, Y / S);
    }
    return K.mesh(geo, mat, x, y, z, p);
  }
  // gear lying in xz (axis y); rotate the returned group (x = PI/2 to face the camera, then spin .rotation.y)
  function gear(K, p, r, thick, teeth, m, x, y, z) {
    const g = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.2, m, Math.sin(a) * r * 1.07, 0, Math.cos(a) * r * 1.07, g); tb.rotation.y = a; }
    K.cyl(r * 0.26, r * 0.26, thick * 1.6, M.ironM, 8, 0, 0, 0, g);
    if (r > 0.35) for (let i = 0; i < 3; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.12, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 3; }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(0.07, thick * 1.2, 0.07, M.brassL, Math.cos(a) * r * 0.82, 0, Math.sin(a) * r * 0.82, g); }
    K.bake(g);
    return g;
  }
  // spoked wheel facing +z (axis z): returns the spinning group
  function wheel(K, p, r, m, x, y, z, spokes) {
    const hold = K.group(p, x, y, z);
    const w = K.group(hold);
    K.torus(r, Math.max(0.05, r * 0.08), m, 6, 28, 0, 0, 0, w);
    if (r > 0.5) K.torus(r * 0.8, 0.025, M.brassD, 4, 24, 0, 0, 0, w);
    for (let i = 0; i < (spokes || 6); i++) { const s = K.box(r * 2 * 0.96, 0.06, 0.06, M.ironL, 0, 0, 0, w); s.rotation.z = i * Math.PI / (spokes || 6); }
    const hub = K.cyl(r * 0.2, r * 0.2, 0.2, M.brass, 10, 0, 0, 0, w); hub.rotation.x = Math.PI / 2;
    K.bake(w);
    return w;
  }
  const band = (K, p, r, y, m, h) => K.cyl(r, r, h || 0.1, m || M.brass, 18, 0, y, 0, p);
  function puff(K, p, x, y, z, col, size, vy, spread, life) { K.spawn(p, x + K.R() * spread, y, z + K.R() * spread, K.R() * 0.3, vy, K.R() * 0.3 + 0.15, col, life || 2.6, size, -0.12); }
  function chainBar(K, p, x, y0, y1, z, w) {
    const len = Math.abs(y1 - y0); const tex = chainTex(K).clone(); tex.needsUpdate = true; tex.repeat.set(1, len * 5);
    const m = K.mat(0xffffff, { map: tex, shine: 30, spec: 0x555555 });
    const c = K.box(w || 0.07, len, w || 0.07, m, x, (y0 + y1) / 2, z, p); c.userData.tex = tex; return c;
  }
  function chainRun(K, p, x0, x1, y, z, w) {
    const len = Math.abs(x1 - x0); const tex = chainTex(K).clone(); tex.needsUpdate = true; tex.repeat.set(1, len * 5);
    const m = K.mat(0xffffff, { map: tex, shine: 30, spec: 0x555555 });
    const c = K.box(w || 0.07, len, w || 0.07, m, (x0 + x1) / 2, y, z, p); c.rotation.z = Math.PI / 2; c.userData.tex = tex; return c;
  }
  function automaton(K, p, x, y, z, s) {
    const g = K.group(p, x, y, z); if (s) g.scale.setScalar(s);
    const body = K.group(g, 0, 0.36, 0);
    K.box(0.26, 0.3, 0.2, M.brass, 0, 0.1, 0, body); K.box(0.28, 0.06, 0.22, M.brassD, 0, 0.26, 0, body);
    K.cyl(0.07, 0.07, 0.22, M.copper, 8, 0, 0.08, -0.13, body).rotation.x = Math.PI / 2;
    const head = K.group(body, 0, 0.36, 0); K.sph(0.1, M.ironL, 0, 0, 0, head, 8, 6); const eye = K.box(0.12, 0.04, 0.04, K.glow(0xffc070), 0, 0.01, 0.09, head);
    K.cyl(0.02, 0.02, 0.1, M.ironL, 4, 0, 0.12, 0, head);
    const legs = [-0.07, 0.07].map((lx) => { const l = K.group(g, lx, 0.36, 0); K.box(0.07, 0.34, 0.07, M.ironM, 0, -0.17, 0, l); K.box(0.09, 0.04, 0.13, M.ironM, 0, -0.34, 0.02, l); return l; });
    const arms = [-0.17, 0.17].map((ax) => { const a = K.group(body, ax, 0.22, 0); K.box(0.05, 0.26, 0.05, M.brassD, 0, -0.13, 0, a); return a; });
    K.bake(head); legs.forEach((l) => K.bake(l)); arms.forEach((a) => K.bake(a));
    return { g, legs, arms, eye, head, body };
  }
  function pickaxe(K, arm) {
    const pk = K.group(arm, 0, -0.26, 0.02); pk.rotation.x = -0.4;
    K.box(0.035, 0.035, 0.5, M.woodD, 0, 0, 0.2, pk);
    const hd = K.box(0.32, 0.05, 0.05, M.ironL, 0, 0, 0.44, pk); hd.rotation.z = 0.15;
    return pk;
  }

  // =====================================================================
  // CARRIERS
  // =====================================================================
  function makeCart(K, src) {
    mats(K);
    const g = new K.THREE.Group();
    const body = K.group(g);
    const col = (IRON.MINES[src] || { color: 0xffb040 }).color;
    K.box(0.72, 0.05, 0.54, M.ironM, 0, -0.025, 0, body);
    for (const sx of [-1, 1]) { K.box(0.05, 0.3, 0.54, M.rust, sx * 0.36, 0.13, 0, body); K.box(0.06, 0.04, 0.56, M.brassD, sx * 0.36, 0.29, 0, body); }
    for (const sz of [-1, 1]) { K.box(0.76, 0.3, 0.05, M.iron, 0, 0.13, sz * 0.27, body); K.box(0.78, 0.04, 0.06, M.brassD, 0, 0.29, sz * 0.27, body); for (const rx of [-0.25, 0, 0.25]) K.box(0.04, 0.26, 0.02, M.ironL, rx, 0.13, sz * 0.3, body); }
    K.box(0.18, 0.12, 0.02, K.mat(col, { e: col, ei: 0.7 }), 0.18, 0.16, 0.305, body);
    K.box(0.18, 0.12, 0.02, K.mat(col, { e: col, ei: 0.7 }), -0.18, 0.16, -0.305, body);
    K.box(0.6, 0.08, 0.4, M.soot, 0, -0.09, 0, body);
    const wheels = [];
    for (const wx of [-0.22, 0.22]) for (const wz of [-0.25, 0.25]) { const w = K.group(g, wx, -0.2, wz); const c = K.cyl(0.1, 0.1, 0.06, M.ironL, 8, 0, 0, 0, w); c.rotation.x = Math.PI / 2; K.box(0.17, 0.03, 0.065, M.brassD, 0, 0, 0, w); wheels.push(w); }
    K.box(0.12, 0.05, 0.05, M.ironL, 0.42, -0.1, 0, body); K.box(0.12, 0.05, 0.05, M.ironL, -0.42, -0.1, 0, body);
    K.bake(body); wheels.forEach((w) => K.bake(w));
    g.userData.wheels = wheels;
    g.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; } });
    return g;
  }
  function makeCage(K) {
    mats(K);
    const g = new K.THREE.Group();
    K.box(0.82, 0.05, 0.82, M.ironM, 0, -0.025, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 1.02, 0.05, M.brassD, sx * 0.39, 0.5, sz * 0.39, g);
    for (const sz of [-1, 1]) K.box(0.82, 0.05, 0.05, M.brass, 0, 1.0, sz * 0.39, g);
    for (const sx of [-1, 1]) K.box(0.05, 0.05, 0.82, M.brass, sx * 0.39, 1.0, 0, g);
    K.box(0.86, 0.03, 0.86, M.iron, 0, 1.04, 0, g);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) K.box(0.02, 0.95, 0.02, M.ironL, sx * 0.39, 0.5, -0.2 + i * 0.2, g);
    K.box(0.8, 0.04, 0.03, M.hazard, 0, 0.72, 0.4, g); // front gate bar
    K.box(0.32, 0.06, 0.06, M.ironL, 0.55, 0.85, -0.48, g); K.box(0.06, 0.06, 0.2, M.ironL, 0.69, 0.85, -0.4, g); // arm to the chain
    K.box(0.1, 0.08, 0.1, K.glow(0xffb040), 0, 1.1, 0, g);
    g.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; } });
    K.bake(g);
    return g;
  }
  IRON.carrier('cart', (K, item) => makeCart(K, item.src));
  IRON.carrier('cage', (K) => makeCage(K));

  // =====================================================================
  // UNDERSIDE
  // =====================================================================
  IRON.underside((K, root, ctx) => {
    mats(K);
    const T = K.THREE;
    const statics = K.group(root);   // baked at the end
    const anim = K.group(root);      // moving parts
    const R = K.R;
    let s0 = 1234; const rr = () => { s0 = (s0 * 16807) % 2147483647; return (s0 - 1) / 2147483646; };
    const deckTop = -9.9;

    // ================================================================ ROCK: strata bands
    const sedA = strataTex(K, 91), sedB = strataTex(K, 4447), hewn = strataTex(K, 777, true);
    // [yTop, yBot, front, color, texture]   alternating light / dark value bands
    const BANDS = [
      [-1.4, -3.8, 7.25, 0xe0bc96, sedA],   // upper crust: warm sandstone (light)
      [-3.8, -6.2, 6.6, 0x6e5e54, sedB],    // shale (dark)
      [-6.2, -11.0, 5.2, 0xb49678, hewn],   // the mine wall: hewn rock (mid)
      [-11.0, -13.4, 4.6, 0x544a46, sedB],  // basalt (darkest)
      [-13.4, -17.0, 3.5, 0xbc9a72, sedA],  // ochre (light)
      [-17.0, -20.6, 1.9, 0x7c7e8a, sedB],  // cool grey (mid)
      [-20.6, -26.0, 0.5, 0x4e505a, sedA]   // keel: cool dark
    ];
    const bandMats = BANDS.map((b) => K.mat(b[3], { map: b[4], e: 0x0c0806 }));
    const bandAt = (y) => { for (let i = 0; i < BANDS.length; i++) if (y <= BANDS[i][0] && y > BANDS[i][1]) return i; return y > -1.4 ? 0 : BANDS.length - 1; };
    const front = (y) => BANDS[bandAt(y)][2];
    const bottomAt = (x) => -3.5 - 20.5 * Math.pow(Math.max(0, 1 - ((x + 1) / 19) ** 2), 1.15);
    // voids carved out of the rock (mine tunnels, the EMPTIES siding, LEVEL 2): x0,x1,y0(bottom),y1(top)
    const MINEX = Object.values(ctx.MINES).map((m) => m.x);
    const VOIDS = MINEX.map((mx) => [mx - 0.95, mx + 0.95, deckTop, -7.6]);
    const EMPTIES_X = -13.3;
    VOIDS.push([EMPTIES_X - 0.6, EMPTIES_X + 0.6, deckTop, -8.4]);
    const lowTop = -13.1, L2X = -8.6;
    VOIDS.push([L2X - 0.7, L2X + 0.7, lowTop, -11.55]);
    const rockG = K.group(statics);
    const COLS = 16, CW = 37.2 / COLS, X0 = -18.6;
    const tips = [], keelBottoms = [], colBottom = [];
    const S = 2.4;
    function rockPiece(x0, x1, y0, y1, z, mat) { if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return; worldBox(K, x1 - x0, y1 - y0, 1.8, mat, (x0 + x1) / 2, (y0 + y1) / 2, z - 0.9, rockG, S); }
    function rockBlock(x0, x1, y0, y1, z, mat) {
      const v = VOIDS.find((q) => q[0] < x1 && q[1] > x0 && q[2] < y1 && q[3] > y0);
      if (!v) return rockPiece(x0, x1, y0, y1, z, mat);
      rockPiece(x0, x1, Math.max(y0, v[3]), y1, z, mat);           // above
      rockPiece(x0, x1, y0, Math.min(y1, v[2]), z, mat);           // below
      const my0 = Math.max(y0, v[2]), my1 = Math.min(y1, v[3]);
      rockPiece(x0, Math.max(x0, v[0]), my0, my1, z, mat);         // left of the void
      rockPiece(Math.min(x1, v[1]), x1, my0, my1, z, mat);         // right of the void
    }
    for (let ci = 0; ci < COLS; ci++) {
      const x0 = X0 + ci * CW, x1 = x0 + CW, xc = (x0 + x1) / 2;
      let raw = bottomAt(xc) + (rr() * 2 - 1) * 0.7;
      if (xc > -17.5 && xc < 11.5) raw = Math.min(raw, -12.2);   // mine level backing
      if (xc > -10.5 && xc < 5.2) raw = Math.min(raw, -14.6);    // LEVEL 2 backing
      const yb = -1.4 - 1.2 * Math.ceil((-1.4 - raw) / 1.2);
      colBottom.push(yb);
      BANDS.forEach((b, bi) => {
        const yt = b[0], ybb = Math.max(b[1], yb); if (yt <= ybb) return;
        const zv = bi === 2 ? (rr() - 0.5) * 0.06 : (rr() - 0.5) * 0.22;
        rockBlock(x0, x1, ybb, yt, b[2] + zv, bandMats[bi]);
        // a buttress here and there (full band height, so it's seated, never floating)
        if (bi >= 4 && rr() < 0.22 && yt - ybb > 1.5) rockPiece(x0 + CW * 0.25, x1 - CW * 0.3, ybb, yt, b[2] + 0.45, bandMats[bi]);
      });
      // flush relief plates break up the big faces
      BANDS.forEach((b, bi) => {
        if (bi === 2) return; const yt = b[0], ybb = Math.max(b[1], yb); if (yt - ybb < 0.8) return;
        const n = 1 + Math.floor(rr() * 3);
        for (let i = 0; i < n; i++) {
          const w = 0.6 + rr() * 1.2, h = 0.35 + rr() * Math.min(1.2, yt - ybb - 0.3), d = 0.12 + rr() * 0.16;
          const px = x0 + w / 2 + rr() * (CW - w), py = ybb + h / 2 + 0.1 + rr() * Math.max(0, yt - ybb - h - 0.2);
          if (bi === 1 && ((px > 2.5 && px < 8.2) || (px > -9.2 && px < -4.8) || (px > -13 && px < -11))) continue;
          if (bi === 0 && ((px > -13 && px < -10.8) || (px > 8.6 && px < 10.6))) continue;
          if (bi === 3 && px > -4.6 && px < -2.6) continue;
          worldBox(K, w, h, d, bandMats[bi], px, py, b[2] + d / 2 - 0.03, rockG, S);
        }
      });
      // stalactites hanging under the silhouette
      const bb = BANDS[bandAt(yb + 0.1)], fz = bb[2];
      const n = 2 + Math.floor(rr() * 2);
      for (let i = 0; i < n; i++) {
        const L = 0.8 + rr() * (yb < -14 ? 2.6 : 1.4), sx = x0 + 0.3 + rr() * (CW - 0.6), sz = fz - 0.3 - rr() * 1.1;
        const c = K.cone(0.28 + rr() * 0.3, L, bandMats[bandAt(yb + 0.1)], 6, sx, yb - L / 2 + 0.05, sz, rockG); c.rotation.x = Math.PI; c.rotation.y = rr() * 3;
        tips.push([sx, yb - L, sz]);
      }
      keelBottoms.push([xc, yb, fz - 0.7]);
    }
    // strata seams: dark line at each band boundary, a lit lip on the band above, AO under the overhang
    const seamM = K.mat(0x140e0a), lipM = K.mat(0x8a7864), aoM = K.mat(0x050302, { op: 0.4, depthWrite: false });
    for (let bi = 1; bi < BANDS.length; bi++) {
      const yb = BANDS[bi][0], fz = BANDS[bi][2], fzUp = BANDS[bi - 1][2];
      for (let ci = 0; ci < COLS; ci++) {
        if (colBottom[ci] >= yb) continue;
        const x0 = X0 + ci * CW, xc = x0 + CW / 2;
        K.box(CW, 0.09, 0.04, seamM, xc, yb - 0.05, fz + 0.03, rockG);
        K.box(CW, 0.05, 0.05, lipM, xc, yb + 0.025, fzUp + 0.02, rockG);
        const ao = K.box(CW, 0.6, 0.02, aoM, xc, yb - 0.32, fz + 0.035, rockG); ao.castShadow = false;
      }
    }
    const soffitAO = K.box(37.2, 0.6, 0.02, aoM, 0, -1.7, 7.28, rockG);
    // soot streaks + rust weeping, flush with their band
    const grime = K.mat(0x080605, { op: 0.4, depthWrite: false }), weep = K.mat(0x6a2a10, { op: 0.35, depthWrite: false });
    for (let i = 0; i < 22; i++) { const x = -17 + rr() * 34, y = -2.4 - rr() * 14; const bi = bandAt(y); if (bi === 2) continue; const h = 0.8 + rr() * 1.6; K.box(0.2 + rr() * 0.4, h, 0.02, rr() < 0.6 ? grime : weep, x, Math.min(y, BANDS[bi][0] - h / 2 - 0.1), BANDS[bi][2] + 0.03, rockG); }

    // ================================================================ SOFFIT under the slab
    const sof = K.group(statics);
    K.box(37, 0.36, 0.22, M.rust, 0, -1.62, 7.62, sof);
    K.box(37, 0.06, 0.3, M.ironM, 0, -1.44, 7.62, sof); K.box(37, 0.06, 0.3, M.ironM, 0, -1.8, 7.62, sof);
    for (let x = -18; x <= 18; x += 0.6) K.box(0.06, 0.06, 0.04, M.brassL, x, -1.62, 7.75, sof);
    for (let x = -16.2; x <= 16.3; x += 3.6) {
      if (x < -14 && x > -18) continue; // the lift shaft lives here
      K.box(0.22, 1.8, 0.22, M.iron, x, -2.6, 7.45, sof);
      const st = K.box(0.14, 2.3, 0.14, M.ironM, x + 0.6, -2.5, 7.4, sof); st.rotation.z = -0.5;
      K.box(0.42, 0.18, 0.34, M.brassD, x, -3.5, 7.35, sof);
      for (const dy of [-1.9, -2.6, -3.2]) K.box(0.08, 0.08, 0.04, M.brassL, x, dy, 7.57, sof);
    }
    K.box(34, 0.05, 0.3, M.ironM, 1.4, -2.05, 7.9, sof);
    const bulbs = [];
    for (let x = -12.4; x <= 15.5; x += 3.1) { K.box(0.02, 0.4, 0.02, M.soot, x, -2.25, 7.9, sof); bulbs.push(K.sph(0.09, K.glow(0xffc070), x, -2.5, 7.9, sof, 6, 4)); K.cone(0.14, 0.1, M.brassD, 6, x, -2.4, 7.9, sof); }
    K.tube([[-13.6, -2.35, 7.8], [18, -2.35, 7.8]], 0.12, M.copper, sof, 4, 8);
    for (let x = -13; x <= 16; x += 2.8) { const f = K.cyl(0.17, 0.17, 0.08, M.brassD, 10, x, -2.35, 7.8, sof); f.rotation.z = Math.PI / 2; }
    const valves = [];
    for (const x of [-11, -2.4, 6.4, 14]) { K.torus(0.16, 0.035, K.mat(0xa02a1a), 4, 12, x, -2.35, 8.0, sof); valves.push([x, -2.45, 8.0]); K.box(0.06, 0.2, 0.06, M.brass, x, -2.25, 7.95, sof); }

    // ================================================================ MINE GALLERY + RAIL
    const gal = K.group(statics);
    const deckTop1 = K.mat(0xffffff, { map: plankTex(K, [24, 3]), e: 0x0c0804 });
    K.box(23.6, 0.18, 2.55, [M.woodD, M.woodD, deckTop1, M.soot, M.woodD, M.woodD], -2.2, deckTop - 0.09, 6.475, gal);
    K.box(23.7, 0.32, 0.18, M.rust, -2.2, deckTop - 0.25, 7.76, gal);
    for (let x = -13.8; x <= 9.4; x += 0.6) K.box(0.06, 0.06, 0.04, M.brassL, x, deckTop - 0.25, 7.86, gal);
    for (let x = -13.6; x <= 9.4; x += 2.4) {
      K.box(0.2, 1.6, 0.2, M.woodD, x, deckTop - 1.05, 7.6, gal);
      const st = K.box(0.14, 3.0, 0.14, M.iron, x, deckTop - 1.2, 6.45, gal); st.rotation.x = 0.85;
      K.box(0.4, 0.25, 0.3, M.brassD, x, deckTop - 1.9, 7.55, gal);
    }
    for (let x = -13.8; x <= 9.5; x += 2.4) K.box(0.07, 0.9, 0.07, M.iron, x, deckTop + 0.45, 7.66, gal);
    K.box(23.4, 0.07, 0.08, M.ironL, -2.2, deckTop + 0.9, 7.66, gal); K.box(23.4, 0.05, 0.06, M.iron, -2.2, deckTop + 0.45, 7.66, gal);
    const galLamps = [];
    for (const x of [-12.6, -8.6, -3.2, 2.6, 5.2, 9.2]) {
      K.box(0.1, 1.5, 0.1, M.iron, x, deckTop + 0.75, 7.62, gal); K.box(0.36, 0.06, 0.06, M.iron, x, deckTop + 1.45, 7.75, gal);
      galLamps.push(K.box(0.18, 0.24, 0.18, K.glow(0xffb860), x + 0.16, deckTop + 1.22, 7.86, gal));
      K.cone(0.16, 0.12, M.brassD, 6, x + 0.16, deckTop + 1.4, 7.86, gal);
    }
    function track(pts, y, p, sleeperM) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
        const g = K.group(p, a[0], y, a[2]); g.rotation.y = Math.atan2(-dz, dx);
        for (const sz of [-0.28, 0.28]) { K.box(L + 0.06, 0.06, 0.06, M.rail, L / 2, 0, sz, g); K.box(L + 0.06, 0.04, 0.1, M.ironM, L / 2, -0.05, sz, g); }
        for (let x = 0.2; x < L; x += 0.55) K.box(0.14, 0.05, 0.8, sleeperM || M.soot, x, -0.08, 0, g);
      }
    }
    const railPts = ctx.paths.rail.points.map((p) => p.slice());
    railPts.unshift([9.0, railPts[0][1], railPts[0][2]]);
    track(railPts, -9.83, gal);
    function hazardStripe(p, len, y, z, n) { n = n || 6; const w = len / n; for (let i = 0; i < n; i++) K.box(0.03, 0.12, w * 0.95, i % 2 ? M.soot : M.hazard, z, y, -len / 2 + w * (i + 0.5), p); }
    { const bs = K.group(gal, 9.1, deckTop, 6.6); K.box(0.2, 0.5, 0.9, M.rust, 0, 0.25, 0, bs); hazardStripe(bs, 0.95, 0.42, 0.105); }

    // ---------------------------------------------------------------- MINE TUNNELS
    const mines = {};
    const mineA = K.group(anim);
    for (const src of ['inbox', 'github', 'sentry']) {
      const mi = ctx.MINES[src], mx = mi.x, col = mi.color, colCss = '#' + col.toString(16).padStart(6, '0');
      const mg = K.group(gal, mx, 0, 0);
      const zw = 5.2, zBack = 3.4;
      // tunnel floor (receding planks + rails running in) and a dark back wall with the glowing ore face
      K.box(1.9, 0.12, zw - zBack + 0.3, [M.woodD, M.woodD, K.mat(0x3a2a1a, { map: plankTex(K, [2, 2]) }), M.soot, M.woodD, M.woodD], 0, deckTop - 0.06, (zw + zBack) / 2 - 0.15, mg);
      K.box(1.9, 2.4, 0.1, M.black, 0, deckTop + 1.2, zBack - 0.05, mg);
      for (const sx of [-0.28, 0.28]) K.box(0.06, 0.06, zw - zBack + 1.5, M.rail, sx, -9.83, (zw + zBack + 1.4) / 2 + 0.05, mg);
      for (let z = zBack + 0.2; z < 6.4; z += 0.5) K.box(0.86, 0.05, 0.13, M.soot, 0, -9.91, z, mg);
      const oreFace = K.mat(col, { e: col, ei: 0.55 });
      for (let i = 0; i < 9; i++) { const c = K.cone(0.06 + rr() * 0.05, 0.25 + rr() * 0.25, oreFace, 4, -0.7 + rr() * 1.4, deckTop + 0.15 + rr() * 0.9, zBack + 0.05, mg); c.rotation.set(-1.2 + R() * 0.6, rr() * 3, R() * 0.8); }
      for (let i = 0; i < 6; i++) K.rock(0.12 + rr() * 0.1, i % 2 ? M.soot : oreFace, -0.6 + rr() * 1.2, deckTop + 0.1, zBack + 0.3 + rr() * 0.5, mg);
      const backGlow = K.box(1.6, 1.0, 0.04, K.glow(col, 0.35, true), 0, deckTop + 0.55, zBack + 0.02, mg); backGlow.castShadow = false;
      // timber sets receding into the dark, each with a lamp in the mine colour
      const lampMs = [];
      [4.95, 4.35, 3.8].forEach((z, i) => {
        const shade = [M.wood, M.woodD, K.mat(0x2e2014)][i];
        for (const sx of [-0.82, 0.82]) { K.box(0.16, 2.3, 0.16, shade, sx, deckTop + 1.15, z, mg); }
        K.box(1.8, 0.18, 0.2, shade, 0, -7.68, z, mg);
        const lm = K.mat(0x1a120a, { e: col, ei: 0.9 - i * 0.2 });
        K.box(0.12, 0.16, 0.1, lm, 0.72, deckTop + 1.25, z + 0.1, mg); lampMs.push(lm);
        for (let k = 0; k < 2; k++) K.box(0.05, 0.05, 0.03, oreFace, (k ? 0.82 : -0.82) + R() * 0.05, deckTop + 0.5 + rr() * 1.2, z + 0.09, mg);
      });
      const floorGlow = K.box(1.3, 0.02, 1.4, K.glow(col, 0.22, true), 0, deckTop + 0.02, 4.3, mg); floorGlow.castShadow = false;
      // portal: heavy timber hood projecting out to z ~6.1
      for (const sx of [-1.12, 1.12]) {
        K.box(0.3, 2.5, 0.32, M.wood, sx, deckTop + 1.25, 5.45, mg); K.box(0.36, 0.14, 0.38, M.ironM, sx, deckTop + 0.07, 5.45, mg); K.box(0.36, 0.1, 0.38, M.ironM, sx, deckTop + 1.6, 5.45, mg);
        const kb = K.box(0.12, 0.8, 0.14, M.woodD, sx * 0.86, -7.95, 5.75, mg); kb.rotation.z = sx * 0.7;
      }
      K.box(2.7, 0.3, 0.95, M.wood, 0, -7.45, 5.62, mg);
      K.box(2.76, 0.07, 1.0, M.ironM, 0, -7.28, 5.62, mg);
      for (let i = 0; i < 6; i++) { const pl = K.box(0.42, 0.06, 1.05, M.woodD, -1.08 + i * 0.43, -7.2 + Math.abs(i - 2.5) * -0.04, 5.68, mg); pl.rotation.x = -0.12; }
      // colour veins radiating from the portal
      const veinM = K.mat(col, { e: col, ei: 0.22 });
      for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI - Math.PI / 2 + R() * 0.2, L = 0.35 + rr() * 0.5; const v = K.box(L, 0.04, 0.03, veinM, Math.sin(a) * (1.35 + L / 2) * (i % 2 ? 1 : -1), -8.6 + Math.cos(a) * 0.9, zw + 0.03, mg); v.rotation.z = (i % 2 ? 1 : -1) * (0.4 + R()); }
      // portal lamps (flare on spawn)
      const portalLamp = K.mat(0x1a120a, { e: col, ei: 0.6 });
      for (const sx of [-1.12, 1.12]) { K.box(0.2, 0.26, 0.16, portalLamp, sx, deckTop + 2.0, 5.7, mg); K.cone(0.16, 0.12, M.brassD, 6, sx, deckTop + 2.2, 5.7, mg); }
      // big sign above the hood
      const sm = sign(K, mg, mi.label, colCss, 0, -6.98, 6.16, 0.8);
      // ore pile, chute and the spur onto the main line
      for (let i = 0; i < 7; i++) K.rock(0.12 + rr() * 0.1, i % 3 ? M.soot : oreFace, 1.55 + R() * 0.4, deckTop + 0.12 + rr() * 0.15, 5.9 + R() * 0.3, mg);
      // semaphore (drops to GO while a cart rolls out) + bell under the hood
      const sem = K.group(mg, -1.55, 0, 6.0);
      K.box(0.08, 2.2, 0.08, M.iron, 0, deckTop + 1.1, 0, sem); K.box(0.16, 0.1, 0.16, M.ironM, 0, deckTop + 0.05, 0, sem);
      const armP = K.group(sem, 0, deckTop + 2.0, 0.06);
      const armB = K.group(armP); K.box(0.7, 0.12, 0.03, K.mat(0xc02a1a), -0.35, 0, 0, armB); K.box(0.1, 0.13, 0.035, K.mat(0xeee0c0), -0.55, 0, 0.002, armB); K.bake(armB);
      const semLamp = K.mat(0x200a08, { e: 0 }); K.box(0.12, 0.12, 0.1, semLamp, 0, deckTop + 2.3, 0.06, sem);
      armP.parent.remove(armP); mineA.add(armP); armP.position.set(mx - 1.55, deckTop + 2.0, 6.06);
      const bell = K.group(mineA, mx + 0.62, -7.7, 6.0); K.box(0.04, 0.12, 0.04, M.iron, 0, 0.0, 0, bell); const bb = K.cone(0.12, 0.16, M.brassL, 8, 0, -0.14, 0, bell); K.bake(bell);
      // a miner at the face, swinging a pickaxe (sparks in the mine colour)
      const miner = automaton(K, mineA, mx - 0.5, deckTop, 3.85, 0.9); miner.g.rotation.y = Math.PI; const pk = pickaxe(K, miner.arms[1]);
      mines[src] = { mx, col, sm, lampMs, portalLamp, backGlow, floorGlow, armP, semLamp, bell, miner, pk, flash: 0, go: 0, ph: rr() * 6, lastStrike: 0 };
    }
    IRON.on('spawn', (d) => {
      const m = mines[d.src]; if (!m) return; m.flash = 1; m.go = (d.dur || 1.8) + 0.4;
      for (let i = 0; i < 10; i++) puff(K, root, m.mx + K.R() * 1.4, deckTop + 0.2, 5.5 + Math.random() * 0.6, Math.random() < 0.5 ? 0x7a6a58 : 0x5a4c3e, 0.09 + Math.random() * 0.06, 0.35 + Math.random() * 0.4, 0.3, 1.1);
      for (let i = 0; i < 16; i++) K.spawn(root, m.mx + R() * 1.2, deckTop + 0.4 + Math.random() * 1.4, 5.5, R() * 2.4, 0.6 + Math.random() * 1.8, 0.6 + Math.random() * 1.8, Math.random() < 0.6 ? m.col : 0xfff0c0, 0.7, 0.05, 5, true);
    });

    // ---------------------------------------------------------------- MINE WALL dressing
    const wall = K.group(statics);
    const wallLamps = [];
    for (let x = -12.6; x <= 10.4; x += 2.35) {
      if (MINEX.some((mx) => Math.abs(x - mx) < 1.9) || Math.abs(x - EMPTIES_X) < 1.6) continue;
      for (const sx of [-0.5, 0.5]) { K.box(0.2, 3.3, 0.2, M.woodD, x + sx, deckTop + 1.65, 5.32, wall); K.box(0.24, 0.08, 0.24, M.ironM, x + sx, deckTop + 0.6, 5.33, wall); K.box(0.24, 0.08, 0.24, M.ironM, x + sx, deckTop + 2.4, 5.33, wall); }
      K.box(1.4, 0.24, 0.26, M.wood, x, deckTop + 3.32, 5.34, wall);
      const d = K.box(0.12, 1.5, 0.12, M.woodD, x, deckTop + 2.5, 5.36, wall); d.rotation.z = 0.62;
      if (Math.round(x * 10) % 3 === 0) { wallLamps.push(K.box(0.16, 0.2, 0.12, K.glow(0xffb060), x, deckTop + 2.0, 5.48, wall)); K.box(0.22, 0.05, 0.16, M.brassD, x, deckTop + 2.13, 5.48, wall); }
      else { K.box(0.5, 0.36, 0.04, M.hazard, x, deckTop + 1.4, 5.36, wall); K.box(0.36, 0.22, 0.05, M.soot, x, deckTop + 1.4, 5.37, wall); }
    }
    K.tube([[-13.4, deckTop + 3.25, 5.48], [-9, deckTop + 3.05, 5.5], [-4, deckTop + 3.25, 5.48], [0.5, deckTop + 3.05, 5.5], [5, deckTop + 3.25, 5.48], [10.6, deckTop + 3.1, 5.5]], 0.035, M.soot, wall, 40, 4);

    // ================================================================ ORE LIFT (rectangular paternoster + headframe)
    const LX = -15.2, LZ = 8.3, DX = -16.6, CZ = 7.82, XU = -14.6, XD = -17.2, TY = 3.7, BY = -11.3, SR = 0.35;
    const lift = K.group(statics), liftA = K.group(anim);
    const postX = [-14.0, -17.8], postZ = [7.6, 9.0];
    for (const px of postX) for (const pz of postZ) { K.box(0.18, 17.6, 0.18, M.iron, px, -3.8, pz, lift); for (let y = -12.4; y < 4.8; y += 0.9) K.box(0.22, 0.05, 0.22, M.brassD, px, y, pz, lift); }
    for (let y = -12.4; y <= 4.81; y += 1.6) {
      const backOpen = (y > 0.0 && y < 2.2) || (y > -10.3 && y < -8.6);
      if (y > 0.3) { K.box(1.8, 0.1, 0.1, M.ironM, -16.9, y, 9.0, lift); K.box(0.4, 0.1, 0.1, M.ironM, -14.2, y, 9.0, lift); } // keep the ore belt's first leg clear
      else K.box(3.8, 0.1, 0.1, M.ironM, -15.9, y, 9.0, lift);
      if (!backOpen) K.box(3.8, 0.1, 0.1, M.ironM, -15.9, y, 7.6, lift);
      for (const px of postX) K.box(0.1, 0.1, 1.4, M.ironM, px, y, 8.3, lift);
    }
    { const d = K.box(0.08, 3.3, 0.08, M.ironM, -16.95, 3.2, 9.02, lift); d.rotation.z = 0.5; }
    for (const sx of [-0.46, 0.46]) K.box(0.05, 11.8, 0.05, M.rail, LX + sx, -5.3, LZ - 0.42, lift);
    // top platform + decorative sheaves + sign (left of the belt leg) + beacon
    K.box(4.1, 0.16, 1.7, M.ironM, -15.9, 4.86, 8.3, lift);
    for (const x of [-17.8, -14.0]) K.box(0.08, 0.5, 1.6, M.iron, x, 5.15, 8.3, lift);
    const liftSign = sign(K, lift, 'ORE LIFT', '#ffb040', -16.75, 4.3, 9.1, 0.46);
    const sheaves = [wheel(K, liftA, 0.72, M.brass, -15.25, 5.75, 8.3, 6), wheel(K, liftA, 0.72, M.brass, -16.55, 5.75, 8.3, 6)];
    for (const s of sheaves) { K.cyl(0.1, 0.1, 0.5, M.ironL, 8, s.parent.position.x, 5.75, 8.3, lift).rotation.x = Math.PI / 2; K.box(0.14, 0.9, 0.14, M.ironM, s.parent.position.x, 5.25, 8.0, lift); }
    const beaconM = K.mat(0x401010, { e: 0 });
    K.cyl(0.1, 0.12, 0.3, M.ironM, 8, -15.9, 5.1, 8.3, lift); K.sph(0.14, beaconM, -15.9, 6.62, 8.3, lift, 8, 6); K.box(0.06, 1.3, 0.06, M.iron, -15.9, 5.95, 8.3, lift);
    // chain loop: two sprockets top, two bottom; vertical runs up (x -14.6) and down (x -17.2)
    const sprockets = [[XU + SR, TY], [XD - SR, TY], [XU + SR, BY], [XD - SR, BY]].map(([x, y]) => wheel(K, liftA, SR, M.ironL, x - (x > -16 ? 2 * SR : -2 * SR), y, CZ, 4));
    sprockets.forEach((s) => K.cyl(0.08, 0.08, 0.9, M.iron, 8, s.parent.position.x, s.parent.position.y, 8.25, lift).rotation.x = Math.PI / 2);
    const chUp = chainBar(K, lift, XU, BY, TY, CZ, 0.08), chDn = chainBar(K, lift, XD, BY, TY, CZ, 0.08);
    const chTop = chainRun(K, lift, XU - SR, XD + SR, TY + SR, CZ, 0.08), chBot = chainRun(K, lift, XU - SR, XD + SR, BY - SR, CZ, 0.08);
    const shaftLamps = [];
    for (let y = -9.0; y <= 0.5; y += 2.4) { const m = K.mat(0x3a2a10, { e: 0 }); K.box(0.16, 0.16, 0.1, m, -14.0, y, 9.12, lift); shaftLamps.push({ m, y }); }
    // headframe depth dial: needle follows the top-most loaded cage
    const dial = K.group(lift, -17.45, 1.6, 9.12);
    { const rim = K.cyl(0.28, 0.28, 0.06, M.brass, 14, 0, 0, 0, dial); rim.rotation.x = Math.PI / 2; const f = K.cyl(0.24, 0.24, 0.07, K.mat(0xd8c8a0), 14, 0, 0, 0.01, dial); f.rotation.x = Math.PI / 2; for (let i = 0; i < 7; i++) { const a = -2.2 + i * 0.73; K.box(0.02, 0.05, 0.02, M.soot, Math.sin(a) * 0.19, Math.cos(a) * 0.19, 0.05, dial).rotation.z = -a; } }
    const dialN = K.group(liftA, -17.45, 1.6, 9.2); K.box(0.025, 0.2, 0.02, K.mat(0x8a1a10), 0, 0.09, 0, dialN);
    // landing: deck (out to the EMPTIES siding), rails, railing, tipper, lamp + gauge board
    { const lm = K.mat(0xffffff, { map: plankTex(K, [3, 5]), e: 0x0c0804 }), lmS = [M.woodD, M.woodD, lm, M.soot, M.woodD, M.woodD];
      K.box(1.7, 0.18, 2.4, lmS, -14.85, deckTop - 0.09, 6.4, lift);          // behind the shaft
      K.box(0.62, 0.18, 1.4, lmS, -14.31, deckTop - 0.09, 8.3, lift);         // right of the cage column
      K.box(1.7, 0.18, 0.42, lmS, -14.85, deckTop - 0.09, 9.21, lift);        // front walkway
      for (const sz of [-0.28, 0.28]) K.box(0.14, 0.16, 1.5, M.ironM, LX + sz, deckTop - 0.14, 8.3, lift); } // rail girders over the cage hole
    K.box(1.8, 0.3, 0.16, M.rust, -14.85, deckTop - 0.25, 9.44, lift);
    for (let x = -15.6; x <= -14.0; x += 0.8) K.box(0.07, 0.85, 0.07, M.iron, x, deckTop + 0.42, 9.4, lift);
    K.box(1.7, 0.06, 0.07, M.ironL, -14.85, deckTop + 0.85, 9.4, lift);
    const tip = K.group(lift, -14.75, deckTop + 0.05, 8.0); tip.rotation.y = -0.75; K.box(0.9, 0.06, 0.9, M.ironL, 0, 0.03, 0, tip); hazardStripe(tip, 0.9, 0.08, 0.46);
    const SID = [[-14.3, 7.45], [-13.6, 6.2], [EMPTIES_X, 5.1], [EMPTIES_X, 3.7]];
    track(SID.map(([x, z]) => [x, 0, z]), -9.83, lift);
    const landLampM = K.mat(0x103010, { e: 0 });
    K.box(0.08, 1.4, 0.08, M.iron, -14.3, deckTop + 0.7, 9.15, lift); K.box(0.22, 0.22, 0.22, landLampM, -14.3, deckTop + 1.5, 9.15, lift);
    const gb = K.group(lift, -18.3, deckTop + 1.05, 8.6);
    K.box(0.08, 1.1, 0.08, M.iron, 0, -0.5, -0.06, gb); K.box(0.7, 0.55, 0.06, M.ironM, 0, 0.1, 0, gb); K.box(0.74, 0.04, 0.08, M.brassD, 0, 0.39, 0, gb);
    { const f = K.cyl(0.17, 0.17, 0.04, K.mat(0xd8c8a0), 12, -0.15, 0.1, 0.04, gb); f.rotation.x = Math.PI / 2; }
    const gbLamps = [0x30ff60, 0xffb030, 0xff3020].map((c, i) => { const m = K.mat(0x140c08, { e: 0 }); K.box(0.09, 0.09, 0.04, m, 0.18, 0.26 - i * 0.15, 0.04, gb); return { m, c }; });
    const gbN = K.group(liftA, -18.45, deckTop + 1.15, 8.68); K.box(0.02, 0.14, 0.02, K.mat(0x8a1a10), 0, 0.06, 0, gbN);
    for (const [x, ry] of [[-14.4, 0.6], [-15.4, -0.6]]) { const s = K.box(0.12, 2.6, 0.12, M.iron, x, deckTop - 1.3, 8.6, lift); s.rotation.x = ry * 0.6; }
    // EMPTIES siding tunnel behind the landing
    { const eg = K.group(lift, EMPTIES_X, 0, 0);
      K.box(1.2, 1.5, 0.1, M.black, 0, deckTop + 0.75, 3.75, eg);
      K.box(1.2, 0.1, 1.5, M.woodD, 0, deckTop - 0.04, 4.45, eg);
      for (const sx of [-0.72, 0.72]) K.box(0.2, 1.7, 0.24, M.wood, sx, deckTop + 0.85, 5.3, eg);
      K.box(1.7, 0.22, 0.28, M.wood, 0, deckTop + 1.72, 5.3, eg);
      sign(K, eg, 'EMPTIES', '#c8b8a0', 0, deckTop + 2.14, 5.32, 0.34);
      K.box(0.9, 0.04, 0.6, K.glow(0xffa050, 0.2, true), 0, deckTop + 0.02, 4.2, eg); }
    // boot under the bottom run
    K.box(3.9, 0.5, 1.6, M.rust, -15.9, BY - 1.75, 8.3, lift); K.box(4.0, 0.08, 1.7, M.brassD, -15.9, BY - 1.48, 8.3, lift);
    for (let i = 0; i < 6; i++) K.rock(0.14 + rr() * 0.1, M.soot, -15.9 + R() * 3, BY - 1.44, 8.3 + R(), lift);

    // empty cages: a loop R0 (drop at the top) -> over the top -> down the return side -> round the bottom -> waiting at the landing
    const RL = [[LX, 1.0], [LX, TY - 0.5], [DX, TY - 0.5], [DX, BY - 1.15], [LX, BY - 1.15], [LX, -9.5]];
    const RLs = []; let RLlen = 0; for (let i = 0; i < RL.length - 1; i++) { const a = RL[i], b = RL[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); RLs.push({ a, b, L, L0: RLlen }); RLlen += L; }
    const ringAt = (u, out) => { u = Math.max(0, Math.min(RLlen, u)); let s = RLs[0]; for (const q of RLs) if (u >= q.L0) s = q; const k = (u - s.L0) / s.L; out[0] = s.a[0] + (s.b[0] - s.a[0]) * k; out[1] = s.a[1] + (s.b[1] - s.a[1]) * k; return out; };
    const cagePool = [], cagesLive = [];
    function getCage() { const c = cagePool.pop() || (() => { const g = makeCage(K); liftA.add(g); return g; })(); c.visible = true; return c; }
    [RLlen, RLlen - 1.3, RLlen - 2.6].forEach((u) => cagesLive.push({ g: getCage(), u }));

    // stand-in carts: tip into the cage, back off, roll into the EMPTIES siding
    const cartFX = [];
    const SIDPATH = (() => { const pts = [[LX, 8.3], ...SID]; const segs = []; let L = 0; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, L0: L }); L += l; } return { segs, L }; })();
    const sidAt = (u, out) => { let s = SIDPATH.segs[0]; for (const q of SIDPATH.segs) if (u >= q.L0) s = q; const k = Math.min(1, (u - s.L0) / s.l); out[0] = s.a[0] + (s.b[0] - s.a[0]) * k; out[1] = s.a[1] + (s.b[1] - s.a[1]) * k; return out; };
    let lastLoad = -9, lastDump = -9;
    IRON.on('carrierDrop', (e) => {
      if (e.carrier === 'cart') {
        const g = makeCart(K, e.item.src); g.position.copy(e.pos); g.quaternion.copy(e.quat); anim.add(g);
        cartFX.push({ g, t: 0, q0: e.quat.clone(), u: 0, lastU: 0 });
        lastDump = K._t || 0;
      } else if (e.carrier === 'cage') {
        cagesLive.push({ g: getCage(), u: 0 });
      }
    });
    IRON.on('carrierPick', (e) => {
      if (e.carrier !== 'cage') return;
      cagesLive.sort((a, b) => b.u - a.u);
      const w = cagesLive[0];
      if (w && w.u > RLlen - 1.6) { cagesLive.shift(); w.g.visible = false; cagePool.push(w.g); }
      lastLoad = K._t || 0;
      for (let i = 0; i < 8; i++) puff(K, root, LX, -9.6, LZ, 0x8a7a68, 0.14, 0.4, 0.5, 1.2);
    });

    // ================================================================ LOWER LEVEL (y -13.1)
    const low = K.group(statics), lowA = K.group(anim);
    K.box(14, 0.18, 1.9, [M.woodD, M.woodD, K.mat(0xffffff, { map: plankTex(K, [14, 2]), e: 0x0c0804 }), M.soot, M.woodD, M.woodD], -2.5, lowTop - 0.09, 4.95, low);
    K.box(14.1, 0.28, 0.16, M.rust, -2.5, lowTop - 0.23, 5.92, low);
    for (let x = -9.2; x <= 4.4; x += 2.2) { K.box(0.18, 1.5, 0.18, M.woodD, x, lowTop - 0.95, 5.8, low); const st = K.box(0.12, 2.0, 0.12, M.iron, x, lowTop - 1.1, 5.0, low); st.rotation.x = 0.8; }
    track([[-9.4, 0, 5.2], [4.4, 0, 5.2]], lowTop + 0.08, low);
    for (let x = -9.2; x <= 4.4; x += 2.8) K.box(0.06, 0.7, 0.06, M.iron, x, lowTop + 0.35, 5.88, low);
    K.box(13.8, 0.06, 0.07, M.ironL, -2.5, lowTop + 0.7, 5.88, low);
    // LEVEL 2 tunnel (carved) + winch
    K.box(1.4, 1.6, 0.1, M.black, L2X, lowTop + 0.75, 3.3, low);
    K.box(1.4, 0.1, 1.4, M.woodD, L2X, lowTop - 0.04, 4.0, low);
    const deepGlow = K.box(1.2, 0.6, 0.04, K.glow(0xff8a3a, 0.35, true), L2X, lowTop + 0.35, 3.36, low);
    for (const sx of [-0.8, 0.8]) K.box(0.18, 1.7, 0.2, M.wood, L2X + sx, lowTop + 0.85, 4.75, low);
    K.box(1.8, 0.22, 0.26, M.wood, L2X, lowTop + 1.62, 4.75, low);
    { K.box(0.06, 0.9, 0.06, M.iron, L2X + 1.75, lowTop + 0.75, 5.95, low); sign(K, low, 'LEVEL 2', '#ff8a3a', L2X + 1.75, lowTop + 1.32, 6.0, 0.36); }
    const winch = K.group(low, 3.9, lowTop, 4.6); K.box(0.8, 0.6, 0.7, M.ironM, 0, 0.3, 0, winch);
    const drum = K.group(lowA, 3.9, lowTop + 0.8, 4.6); const dr = K.cyl(0.28, 0.28, 0.8, M.brassD, 10, 0, 0, 0, drum); dr.rotation.z = Math.PI / 2; for (let i = 0; i < 4; i++) K.box(0.82, 0.05, 0.08, M.ironL, 0, Math.cos(i * 1.57) * 0.28, Math.sin(i * 1.57) * 0.28, drum); K.bake(drum);
    // two carts shuttling, each pushed by an automaton; a miner at the LEVEL 2 face
    const lowCarts = [0, 1].map((i) => { const c = makeCart(K, i ? 'github' : 'sentry'); lowA.add(c); for (let k = 0; k < 5; k++) K.rock(0.12, k % 2 ? M.soot : M.rustL, R() * 0.4, 0.2, R() * 0.3, c); return { c, bot: automaton(K, lowA, 0, lowTop, 5.2), ph: i * 1.1, sp: 0.07 + i * 0.015 }; });
    const l2miner = automaton(K, lowA, L2X + 0.35, lowTop, 3.6, 0.9); l2miner.g.rotation.y = Math.PI; const l2pk = pickaxe(K, l2miner.arms[1]);
    function ladder(p, x, z, y0, y1) { const h = y1 - y0; for (const sx of [-0.18, 0.18]) K.box(0.05, h, 0.05, M.iron, x + sx, y0 + h / 2, z, p); for (let y = y0 + 0.2; y < y1; y += 0.3) K.box(0.36, 0.04, 0.04, M.ironL, x, y, z, p); }
    ladder(low, -9.95, 5.6, lowTop, deckTop);

    // ================================================================ CATWALK (y -5.6) + automatons
    const cw = K.group(statics), cwA = K.group(anim);
    const cwY = -5.6;
    K.box(5.0, 0.1, 0.8, M.ironM, -11.5, cwY - 0.05, 6.75, cw);
    for (let x = -13.9; x <= -9.0; x += 0.3) K.box(0.03, 0.03, 0.78, M.soot, x, cwY + 0.01, 6.75, cw);
    for (let x = -13.9; x <= -9.1; x += 1.0) { K.box(0.05, 0.8, 0.05, M.iron, x, cwY + 0.4, 7.12, cw); const b = K.box(0.08, 1.3, 0.08, M.iron, x, cwY - 0.6, 6.7, cw); b.rotation.x = -0.6; }
    K.box(4.9, 0.05, 0.05, M.ironL, -11.5, cwY + 0.8, 7.12, cw); K.box(4.9, 0.04, 0.04, M.iron, -11.5, cwY + 0.4, 7.12, cw);
    ladder(cw, -13.6, 7.48, cwY, -2.2);
    ladder(cw, -9.4, 6.55, deckTop, cwY);
    const bots = [
      { a: automaton(K, cwA, -13, cwY, 6.75), x0: -13.6, x1: -9.6, y: cwY, z: 6.75, sp: 0.55, ph: 0 },
      { a: automaton(K, cwA, -12, deckTop, 5.75), x0: -12.4, x1: -8.0, y: deckTop, z: 5.75, sp: 0.42, ph: 2.3 },
      { a: automaton(K, cwA, 4, deckTop, 5.7), x0: 2.6, x1: 6.4, y: deckTop, z: 5.7, sp: 0.38, ph: 1.1 }
    ];

    // ================================================================ AETHER CRYSTAL VEIN + conduit
    const ae = K.group(statics), aeA = K.group(anim);
    const crys = [];
    for (let i = 0; i < 16; i++) {
      const cx = -7.2 + R() * 2.6, cy = -5.0 + R() * 1.6, cz = front(cy) + 0.1;
      const c = K.cone(0.1 + rr() * 0.12, 0.5 + rr() * 0.7, M.tealCrys, 5, cx, cy, cz, ae); c.rotation.set(0.6 + R() * 0.8, rr() * 3, R() * 1.4);
      crys.push([cx, cy, cz]);
    }
    for (let i = 0; i < 4; i++) { const h = K.sph(0.5 + rr() * 0.3, K.glow(0x3ae0c0, 0.06, true), -7.2 + R() * 2.2, -5.0 + R() * 1.2, 6.9, aeA, 8, 6); h.castShadow = false; }
    const condPts = [[-6.6, -4.2, 7.15], [-6.9, -3.2, 7.45], [-7.3, -2.4, 7.72], [-7.4, -1.55, 7.86]];
    K.tube(condPts, 0.11, M.tealPipe, ae, 16, 6);
    const condCurve = new T.CatmullRomCurve3(condPts.map((p) => new T.Vector3(p[0], p[1], p[2])));
    for (const u of [0.2, 0.5, 0.8]) { const p = condCurve.getPoint(u); const r = K.torus(0.15, 0.04, M.brass, 4, 10, p.x, p.y, p.z, ae); const tn = condCurve.getTangent(u); r.lookAt(p.x + tn.x, p.y + tn.y, p.z + tn.z); }
    const pulses = [0, 0.33, 0.66].map((u) => ({ m: K.sph(0.13, K.glow(0xbffff0), 0, 0, 0, aeA, 6, 4), u }));
    sign(K, ae, 'AETHER', '#7af0d8', -8.3, -3.3, 7.33, 0.36);

    // ================================================================ SLAG FURNACES, quench tank, keel smelter
    const fur = K.group(statics), furA = K.group(anim);
    const streams = [];
    function slagFurnace(x, y, s, endY) {
      const zf = front(y) + 0.55 * s;
      const g = K.group(fur, x, y, zf); g.scale.setScalar(s);
      K.cyl(0.78, 0.9, 2.3, M.iron, 12, 0, 0, 0, g);
      for (const yy of [-0.9, -0.2, 0.5, 1.0]) band(K, g, 0.86, yy, M.rust, 0.12);
      K.lathe([[0.8, 0], [0.55, 0.5], [0.3, 0.8], [0.3, 1.4]], M.ironM, 12, 0, 1.15, 0, g);
      K.box(0.5, 0.4, 0.3, M.ironM, 0, -1.25, 0, g);
      const mouth = K.box(0.6, 0.5, 0.06, K.glow(0xff8a2a), 0, -0.35, 0.86, g);
      for (let i = 0; i < 4; i++) K.box(0.05, 0.55, 0.08, M.soot, -0.2 + i * 0.13, -0.35, 0.9, g);
      const tr = K.group(g, 0, -0.95, 0.75); tr.rotation.x = 0.28;
      K.box(0.36, 0.08, 1.0, M.ironL, 0, 0, 0.45, tr); for (const sx of [-0.18, 0.18]) K.box(0.05, 0.16, 1.0, M.ironM, sx, 0.06, 0.45, tr);
      K.box(0.22, 0.03, 0.95, K.glow(0xffb040), 0, 0.05, 0.45, tr);
      for (const sx of [-0.7, 0.7]) K.box(0.12, 0.12, 0.9, M.iron, sx, 0.2, -0.55, g);
      const spout = [x, y + (-0.95 - 0.28) * s, zf + (0.75 + 0.95) * s];
      const len = Math.max(1.5, spout[1] - endY);
      const core = K.box(0.1 * s, len, 0.1 * s, K.glow(0xffe08a, 0.95, true), spout[0], spout[1] - len / 2, spout[2], furA);
      const outer = K.box(0.28 * s, len, 0.28 * s, K.glow(0xff6a1a, 0.5, true), spout[0], spout[1] - len / 2, spout[2], furA);
      streams.push({ core, outer, spout, len, mouth, endY });
      return spout;
    }
    const sp1 = slagFurnace(13.2, -4.7, 1, -8.75);
    slagFurnace(5.3, -14.7, 0.75, -36);
    // quench tank catching furnace 1: molten hits water, steam hisses up
    const qt = K.group(fur, sp1[0], -9.25, sp1[2]);
    K.cyl(0.6, 0.55, 0.75, M.rust, 14, 0, 0, 0, qt); band(K, qt, 0.62, 0.3, M.ironM, 0.08); band(K, qt, 0.6, -0.25, M.ironM, 0.08);
    K.cyl(0.54, 0.54, 0.04, M.water, 14, 0, 0.33, 0, qt);
    const quenchGlow = K.cyl(0.25, 0.25, 0.05, K.glow(0xff8a3a, 0.8, true), 0, 0.35, 0, qt);
    for (const sx of [-0.5, 0.5]) chainBar(K, fur, sp1[0] + sx, -8.9, -5.9, sp1[2] - 0.25, 0.05);
    sign(K, qt, 'QUENCH', '#ffc070', 0, -0.05, 0.6, 0.22);
    // keel smelter
    const kf = K.group(fur, -1.2, -21.6, 1.4);
    K.cyl(1.2, 0.9, 1.6, M.iron, 10, 0, 0, 0, kf); band(K, kf, 1.22, 0.5, M.rust, 0.14); band(K, kf, 1.0, -0.6, M.brassD, 0.12);
    const kfGlow = []; for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; const w = K.box(0.18, 0.7, 0.06, K.glow(0xff7a2a), Math.sin(a) * 1.08, 0, Math.cos(a) * 1.08, kf); w.rotation.y = a; kfGlow.push(w); }
    K.cone(0.9, 0.9, M.ironM, 10, 0, -1.25, 0, kf).rotation.x = Math.PI;
    K.cyl(0.16, 0.16, 2.2, M.iron, 8, 0, 1.9, 0, kf);

    // ================================================================ GEARS, FLYWHEEL, FANS
    const mech = K.group(statics), mechA = K.group(anim);
    const gA = gear(K, mechA, 1.4, 0.32, 20, M.brass, 4.5, -5.0, front(-5.0) + 0.1); gA.rotation.x = Math.PI / 2;
    const gB = gear(K, mechA, 0.8, 0.3, 12, M.copper, 6.7, -5.0, front(-5.0) + 0.12); gB.rotation.x = Math.PI / 2;
    K.box(0.5, 0.5, 0.4, M.ironM, 4.5, -5.0, front(-5.0) - 0.05, mech);
    const FWX = 11.3, fwZ = 6.25;
    const fw = wheel(K, mechA, 1.2, M.iron, FWX, -8.4, fwZ, 8);
    const crankPin = K.group(fw, 0.72, 0, 0.18); K.cyl(0.08, 0.08, 0.2, M.brassL, 8, 0, 0, 0, crankPin).rotation.x = Math.PI / 2;
    K.box(0.5, 1.2, 0.5, M.ironM, FWX, -9.3, 5.7, mech); K.cyl(0.18, 0.18, 0.7, M.brass, 8, FWX, -8.4, 5.9, mech).rotation.x = Math.PI / 2;
    const cylG = K.group(mech, FWX + 2.8, -8.4, fwZ + 0.18); { const cy = K.cyl(0.32, 0.32, 1.3, M.copper, 12, 0, 0, 0, cylG); cy.rotation.z = Math.PI / 2; for (const xx of [-0.6, 0, 0.6]) { const b = K.cyl(0.35, 0.35, 0.07, M.brassD, 12, xx, 0, 0, cylG); b.rotation.z = Math.PI / 2; } }
    K.box(1.6, 0.3, 0.6, M.ironM, FWX + 2.8, -8.85, fwZ - 0.1, mech);
    const rod = K.box(1, 0.1, 0.1, M.ironL, 0, 0, 0, mechA); rod.position.z = fwZ + 0.3;
    const piston = K.box(0.7, 0.12, 0.12, M.brassL, FWX + 2.0, -8.4, fwZ + 0.18, mechA);
    const fans = [];
    for (const [x, y, r] of [[-12.0, -2.75, 0.78], [9.6, -2.95, 0.66], [-3.6, -12.2, 0.7]]) {
      const z = front(y) + 0.12;
      const h = K.group(mech, x, y, z);
      K.torus(r, 0.1, M.ironL, 6, 24, 0, 0, 0, h);
      const bk = K.cyl(r, r, 0.06, M.black, 20, 0, 0, -0.08, h); bk.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) K.box(r * 2, 0.04, 0.04, M.ironM, 0, -r + 0.2 + i * (r * 2 - 0.4) / 4, 0.1, h);
      const bl = K.group(mechA, x, y, z + 0.02);
      for (let i = 0; i < 4; i++) { const b = K.box(r * 0.9, 0.16, 0.03, M.brassD, r * 0.45, 0, 0, K.group(bl)); b.parent.rotation.z = i * Math.PI / 2; b.rotation.x = 0.5; }
      K.cyl(0.12, 0.12, 0.08, M.brass, 8, 0, 0, 0.06, bl).rotation.x = Math.PI / 2;
      K.bake(bl); fans.push({ bl, x, y, z, r });
    }

    // ================================================================ PIPES + steam vents
    const pipes = K.group(statics);
    K.tube([[10.6, -1.7, 7.8], [10.8, -2.8, 7.45], [12.0, -3.4, 7.45], [12.9, -3.4, 7.5]], 0.12, M.copper, pipes, 16, 6);
    K.tube([[-11.0, -1.75, 7.75], [-11.0, -3.6, 7.4], [-11.4, -5.2, 6.95]], 0.1, M.copperD, pipes, 14, 6);
    K.tube([[15.6, -1.8, 7.7], [15.7, -4.8, 7.0], [15.2, -7.6, 6.6], [FWX + 3.0, -8.2, 6.45]], 0.13, M.verd, pipes, 18, 6);
    K.tube([[-3.0, -1.9, 7.75], [-2.6, -4.2, 7.05], [-2.4, -6.0, 6.8]], 0.09, M.copper, pipes, 12, 5);
    const pg = K.group(pipes, 15.75, -5.5, 7.05);
    { const rim = K.cyl(0.24, 0.24, 0.08, M.brass, 14, 0, 0, 0, pg); rim.rotation.x = Math.PI / 2; const f = K.cyl(0.2, 0.2, 0.09, K.mat(0xd8c8a0), 14, 0, 0, 0.01, pg); f.rotation.x = Math.PI / 2; }
    const gaugeN = K.group(anim, 15.75, -5.5, 7.12); K.box(0.03, 0.16, 0.02, K.mat(0x1a0c06), 0, 0.07, 0, gaugeN);
    const vents = [[-16.2, -3.3, 7.4], [5.9, -6.9, 5.4], [-3.8, -8.0, 5.4], [11.0, -12.0, 4.8], [-11.0, -12.6, 4.8]];
    for (const [x, y, z] of vents) { const v = K.group(pipes, x, y, z); K.cyl(0.2, 0.24, 0.3, M.ironM, 8, 0, 0, 0, v).rotation.x = Math.PI / 2; for (let i = 0; i < 3; i++) K.box(0.36, 0.04, 0.05, M.soot, 0, -0.1 + i * 0.1, 0.16, v); }

    // ================================================================ HOISTS + CARGO AIRSHIP
    const hst = K.group(statics), hstA = K.group(anim);
    K.box(0.24, 0.24, 2.8, M.rust, 16.3, -1.95, 9.0, hst); K.box(0.1, 1.2, 0.1, M.iron, 16.3, -2.4, 7.9, hst).rotation.x = -0.9;
    const jibBeaconM = K.mat(0x401010, { e: 0 }); K.sph(0.1, jibBeaconM, 16.3, -1.75, 10.35, hst, 6, 4);
    const jibTrolley = K.group(hstA, 16.3, -2.15, 9.6); K.box(0.36, 0.18, 0.4, M.brassD, 0, 0, 0, jibTrolley);
    const jibChain = chainBar(K, jibTrolley, 0, -0.1, -1.1, 0, 0.06);
    const jibLoad = K.group(jibTrolley, 0, -1.4, 0); K.box(0.7, 0.55, 0.6, M.woodD, 0, -0.2, 0, jibLoad); for (const x of [-0.28, 0.28]) K.box(0.06, 0.57, 0.62, M.ironM, x, -0.2, 0, jibLoad); K.box(0.06, 0.4, 0.06, M.iron, 0, 0.2, 0, jibLoad); K.bake(jibLoad);
    const SHIP_Y = -12.6; const ship = K.group(hstA, 9.0, SHIP_Y, 9.6);
    const env = K.sph(1, K.mat(0x6e5640, { shine: 6, spec: 0x2a2018 }), 0, 0, 0, ship, 18, 10); env.scale.set(2.9, 0.95, 0.95);
    for (let i = -3; i <= 3; i++) { const k = i / 3.3; const rib = K.torus(0.96 * Math.sqrt(Math.max(0.05, 1 - k * k)), 0.035, M.brassD, 4, 18, i * 0.86, 0, 0, ship); rib.rotation.y = Math.PI / 2; }
    K.box(5.6, 0.05, 0.06, M.brassD, 0, 0, 0.95, ship);
    for (const [y, z] of [[0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75]]) K.box(0.9, y ? 0.7 : 0.05, z ? 0.7 : 0.05, M.woodD, -2.75, y * 0.6, z * 0.6, ship);
    const gond = K.group(ship, 0.3, -1.15, 0);
    K.box(1.9, 0.42, 0.6, M.wood, 0, 0, 0, gond); K.box(2.0, 0.07, 0.68, M.brass, 0, 0.22, 0, gond); K.box(1.7, 0.1, 0.5, M.woodD, 0, -0.26, 0, gond);
    for (let i = 0; i < 5; i++) K.box(0.18, 0.12, 0.02, M.gas, -0.7 + i * 0.35, 0.04, 0.31, gond);
    for (const x of [-0.7, 0.7]) for (const z of [-0.22, 0.22]) K.box(0.03, 0.6, 0.03, M.iron, x, 0.5, z, gond);
    const props = [];
    for (const z of [-0.85, 0.85]) { const pp = K.group(ship, -1.6, -0.6, z); K.cyl(0.12, 0.12, 0.5, M.ironM, 8, 0.2, 0, 0, pp).rotation.z = Math.PI / 2; const bl = K.group(pp, -0.08, 0, 0); K.box(0.04, 0.9, 0.12, M.woodD, 0, 0, 0, bl); K.box(0.04, 0.12, 0.9, M.woodD, 0, 0, 0, bl); props.push(bl); }
    const shipBeacon = K.mat(0x401010, { e: 0 }); K.sph(0.09, shipBeacon, -3.2, 0.4, 0, ship, 6, 4);
    sign(K, ship, 'SHIPTORIO', '#ffc070', 0.3, -1.12, 0.33, 0.26);
    // cargo net swinging under the gondola + a crewman on the gondola roof
    const net = K.group(ship, 0.3, -1.45, 0);
    for (const [x, z] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) { const r = K.box(0.02, 0.6, 0.02, M.soot, x * 0.5, -0.3, z * 0.5, net); r.rotation.z = -x * 0.5; }
    const netB = K.group(net, 0, -0.7, 0);
    for (let i = 0; i < 4; i++) { K.box(0.62, 0.02, 0.02, K.mat(0x8a7a60), 0, -i * 0.1, 0.22, netB); K.box(0.62, 0.02, 0.02, K.mat(0x8a7a60), 0, -i * 0.1, -0.22, netB); }
    for (let i = 0; i < 5; i++) K.box(0.02, 0.32, 0.46, K.mat(0x8a7a60), -0.3 + i * 0.15, -0.15, 0, netB);
    K.box(0.26, 0.22, 0.24, M.woodD, -0.12, -0.18, 0, netB); K.box(0.2, 0.18, 0.2, M.copperD, 0.15, -0.2, 0.02, netB);
    K.bake(netB);
    const crew = automaton(K, ship, 0, -0.92, 0, 0.75);
    { const pp = props.map((b) => b.parent); [...pp, net, crew.g].forEach((x) => ship.remove(x)); K.bake(ship); [...pp, net, crew.g].forEach((x) => ship.add(x)); props.forEach((b) => K.bake(b)); }
    const moor = [[7.6, 7.7], [9.5, 7.7]].map(([x, z]) => ({ m: K.box(0.03, 1, 0.03, M.soot, 0, 0, 0, hstA), x, z }));
    const crX = 9.3;
    K.box(0.22, 0.22, 2.2, M.rust, crX, deckTop - 0.25, 8.75, hst); const cb = K.box(0.1, 1.4, 0.1, M.iron, crX, deckTop - 0.85, 8.1, hst); cb.rotation.x = -0.7;
    const crTrolley = K.group(hstA, crX, deckTop - 0.45, 9.6); K.box(0.3, 0.16, 0.36, M.brassD, 0, 0, 0, crTrolley);
    const crChain = chainBar(K, crTrolley, 0, -0.1, -1.1, 0, 0.05);
    const crLoad = K.group(crTrolley, 0, -1.2, 0); K.box(0.5, 0.42, 0.44, M.woodD, 0, -0.2, 0, crLoad); K.box(0.52, 0.06, 0.46, M.brass, 0, 0.02, 0, crLoad); K.bake(crLoad);

    // ================================================================ CAGE LANTERNS, KEEL ROOTS + CHAINS
    const lan = K.group(anim);
    const lanterns = [];
    for (const [x, y0, z, L] of [[-11.4, deckTop - 0.3, 7.5, 1.6], [-0.6, deckTop - 0.3, 7.5, 2.2], [7.2, deckTop - 0.3, 7.5, 1.4], [-6.2, lowTop - 0.3, 5.7, 1.8], [1.8, lowTop - 0.3, 5.7, 1.2], [11.0, -1.9, 7.9, 2.0], [-9.0, -1.9, 7.9, 1.8]]) {
      const piv = K.group(lan, x, y0, z);
      chainBar(K, piv, 0, 0, -L, 0, 0.04);
      const c = K.group(piv, 0, -L - 0.2, 0);
      K.box(0.26, 0.04, 0.26, M.brassD, 0, 0.18, 0, c); K.box(0.26, 0.04, 0.26, M.brassD, 0, -0.18, 0, c);
      for (const sx of [-0.12, 0.12]) for (const sz of [-0.12, 0.12]) K.box(0.03, 0.36, 0.03, M.iron, sx, 0, sz, c);
      const fl = K.box(0.14, 0.22, 0.14, K.glow(0xffb050), 0, 0, 0, c);
      K.bake(piv);
      const halo = K.sph(0.55, K.glow(0xffa040, 0.08, true), 0, -L - 0.2, 0, piv, 8, 6); halo.castShadow = false;
      lanterns.push({ piv, fl, halo, ph: rr() * 6 });
    }
    const keel = K.group(statics), keelA = K.group(anim);
    keelBottoms.filter((k) => k[1] < -17).forEach((k, i) => {
      if (i % 2) return;
      const [x, y, z] = k; const L = 2 + rr() * 3;
      K.tube([[x, y + 0.3, z + 0.3], [x + R() * 0.8, y - L * 0.4, z + 0.5], [x + R() * 1.4, y - L, z + 0.4 + R() * 0.6]], 0.08 + rr() * 0.08, rr() < 0.5 ? M.rust : M.ironM, keel, 10, 5);
    });
    const keelChains = [];
    keelBottoms.filter((k) => k[1] < -15).forEach((k, i) => {
      if (i % 2) return;
      const piv = K.group(keelA, k[0] + 0.5, k[1] + 0.1, k[2] + 0.4); const L = 2 + rr() * 2.5;
      chainBar(K, piv, 0, 0, -L, 0, 0.06);
      K.torus(0.16, 0.04, M.ironL, 4, 10, 0, -L - 0.15, 0, piv, Math.PI * 1.4);
      K.bake(piv); keelChains.push({ piv, ph: rr() * 6 });
    });

    // ================================================================ LIGHTS (3)
    const lMolten = K.light(0xff7a2a, 2.2, 12, 12.6, -7.0, 9.6, root);
    const lGallery = K.light(0xffb070, 2.2, 19, -3.0, -8.0, 9.8, root);
    const lAether = K.light(0x5af0d0, 1.0, 8, -7.0, -5.2, 8.6, root);

    [statics, anim].forEach((grp) => grp.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; } }));
    lift.traverse((o) => { if (o.isMesh && o.position.y > 0.3) o.castShadow = true; });
    [rockG, sof, gal, wall, lift, low, cw, ae, fur, mech, pipes, hst, keel].forEach((g) => K.bake(g));

    // ================================================================ UPDATE
    const railP = ctx.paths.rail, liftP = ctx.paths.lift;
    let liftV = 0, chainOff = 0, tDrip = 0, tVent = 0, tSlag = 0, tQuench = 0;
    const crank = new T.Vector3(), p2 = [0, 0], qInv = new T.Quaternion(), qTip = new T.Quaternion(), qSide = new T.Quaternion().setFromEuler(new T.Euler(0, -Math.PI / 2, 0, 'YZX')), zAxis = new T.Vector3(0, 0, 1);
    return { update(t, dt) {
      K._t = t;
      // ---- carts on the rail: wheels roll with distance travelled, sparks on the rails
      railP.items.forEach((it) => {
        const cm = it.carrierMeshes && it.carrierMeshes.cart; if (!cm) return;
        const ls = cm.userData.ls === undefined ? it.s : cm.userData.ls; const ds = it.s - ls; cm.userData.ls = it.s;
        cm.userData.wheels.forEach((w) => (w.rotation.z -= ds / 0.1));
        if (ds > 0.001 && Math.random() < 0.04) K.spawn(root, it.mesh.position.x + R() * 0.4, -9.85, it.mesh.position.z + R() * 0.3, R() * 0.6, 0.6 + Math.random(), R() * 0.4, Math.random() < 0.5 ? 0xffc060 : 0xfff0c0, 0.35, 0.035, 5, true);
      });
      ctx.items.forEach((it) => { if (it.emerge && it.carrierMeshes.cart) { const cm = it.carrierMeshes.cart; const z = it.mesh.position.z; const ls = cm.userData.lz === undefined ? z : cm.userData.lz; cm.userData.lz = z; cm.userData.wheels.forEach((w) => (w.rotation.z -= (z - ls) / 0.1)); } });
      // ---- lift: cages square to the shaft; chain, sprockets and empty cages move with the line
      liftP.items.forEach((it) => { const cm = it.carrierMeshes && it.carrierMeshes.cage; if (cm) cm.quaternion.copy(qInv.copy(it.mesh.quaternion).invert()); });
      const stuck = liftP.items.some((it) => it.atEnd);
      liftV += ((stuck ? 0 : liftP.speed) - liftV) * Math.min(1, dt * 4);
      chainOff += liftV * dt;
      chUp.userData.tex.offset.y = -chainOff; chDn.userData.tex.offset.y = chainOff; chTop.userData.tex.offset.y = chainOff; chBot.userData.tex.offset.y = -chainOff;
      sprockets.forEach((s) => (s.rotation.z -= liftV * dt / SR));
      sheaves.forEach((s, i) => (s.rotation.z += (i ? 1 : -1) * liftV * dt / 0.72));
      // empty cages ride the return loop and queue at the landing
      cagesLive.sort((a, b) => b.u - a.u);
      cagesLive.forEach((c, i) => {
        const maxU = i === 0 ? RLlen : cagesLive[i - 1].u - 1.3;
        c.u = Math.min(c.u + liftV * dt, Math.max(c.u, maxU));
        ringAt(c.u, p2); c.g.position.set(p2[0], p2[1], LZ); c.g.scale.x = p2[0] < (LX + DX) / 2 ? -1 : 1;
      });
      // dial needle: height of the top-most loaded cage
      const topY = liftP.items.reduce((m, it) => Math.max(m, it.mesh.position.y), -9.5);
      dialN.rotation.z = 2.2 - (topY + 9.5) / 10.5 * 4.4;
      beaconM.emissive.setHex(Math.sin(t * 5) > 0.3 ? 0xff2a10 : 0);
      liftSign.color.setHex(stuck ? (Math.sin(t * 8) > 0 ? 0xffffff : 0x806040) : 0xc8c8c8);
      shaftLamps.forEach((L) => { const near = liftP.items.some((it) => Math.abs(it.mesh.position.y - L.y) < 0.8); L.m.emissive.setHex(near ? 0xffc040 : stuck ? (Math.sin(t * 6) > 0 ? 0xff3010 : 0) : 0x3a2408); });
      landLampM.emissive.setHex(t - lastLoad < 0.8 ? 0x40ff70 : railP.items.length ? 0x1a4a20 : 0x0a1a0c);
      const waiting = cagesLive.length && cagesLive[0].u > RLlen - 0.05;
      gbLamps[0].m.emissive.setHex(waiting ? gbLamps[0].c : 0); gbLamps[1].m.emissive.setHex(t - lastLoad < 1.2 || t - lastDump < 1.2 ? gbLamps[1].c : 0); gbLamps[2].m.emissive.setHex(stuck && Math.sin(t * 8) > 0 ? gbLamps[2].c : 0);
      gbN.rotation.z = 1.2 - Math.min(1, liftP.items.length / 6) * 2.4;
      // ---- stand-in carts: tip, back off, roll into the EMPTIES siding
      for (let i = cartFX.length - 1; i >= 0; i--) {
        const c = cartFX[i]; c.t += dt;
        if (c.t < 0.7) { const a = Math.sin(Math.min(1, c.t / 0.7) * Math.PI) * 0.75; qTip.setFromAxisAngle(zAxis, -a); c.g.quaternion.copy(c.q0).multiply(qTip); if (c.t < 0.4 && Math.random() < 0.5) K.spawn(root, c.g.position.x + R() * 0.3, -9.2, c.g.position.z + R() * 0.3, R() * 0.5, 0.3, R() * 0.5, 0x3a3028, 0.6, 0.06, 6); }
        else {
          c.u = Math.min(SIDPATH.L, c.u + dt * 1.1 * Math.min(1, (c.t - 0.7) * 2));
          sidAt(c.u, p2); c.g.position.set(p2[0], -9.5, p2[1]);
          c.g.quaternion.copy(c.q0).slerp(qSide, Math.min(1, c.u / 1.4));
          c.g.userData.wheels.forEach((w) => (w.rotation.z += (c.u - c.lastU) / 0.1)); c.lastU = c.u;
          if (p2[1] < 4.3 || c.u >= SIDPATH.L) { anim.remove(c.g); c.g.traverse((o) => o.geometry && o.geometry.dispose()); cartFX.splice(i, 1); }
        }
      }
      // ---- mine tunnels: spawn flare, semaphore, bell, miners
      for (const src in mines) {
        const m = mines[src]; m.flash = Math.max(0, m.flash - dt * 1.1); m.go = Math.max(0, m.go - dt);
        const f = 0.55 + m.flash * 0.9 + Math.sin(t * 2.2 + m.ph) * 0.05;
        m.lampMs.forEach((lm, i) => { lm.emissive.setHex(m.col); lm.emissiveIntensity = (0.8 - i * 0.18) * f * (0.92 + Math.sin(t * 13 + i + m.ph) * 0.08); });
        m.portalLamp.emissive.setHex(m.col); m.portalLamp.emissiveIntensity = 0.5 + m.flash * 1.6;
        m.backGlow.material.opacity = 0.25 + m.flash * 0.6 + Math.sin(t * 3 + m.ph) * 0.04;
        m.floorGlow.material.opacity = 0.16 + m.flash * 0.45;
        m.sm.color.setScalar(0.75 + m.flash * 0.6);
        const goK = m.go > 0 ? 1 : 0; m.armP.rotation.z += ((goK ? 0.8 : 0) - m.armP.rotation.z) * Math.min(1, dt * 6);
        m.semLamp.emissive.setHex(goK ? 0x30ff60 : 0xff2a10);
        m.bell.rotation.z = m.go > 0 ? Math.sin(t * 22) * 0.5 * Math.min(1, m.go) : m.bell.rotation.z * 0.9;
        // miner strikes the ore face every ~1.3 s
        const ph = (t * 0.75 + m.ph) % 1, sw = ph < 0.6 ? -1.6 * (ph / 0.6) : -1.6 + 2.4 * ((ph - 0.6) / 0.4);
        m.miner.arms[1].rotation.x = Math.min(0.8, sw); m.miner.arms[0].rotation.x = Math.min(0.8, sw) * 0.6;
        if (ph > 0.97 && t - m.lastStrike > 0.5) { m.lastStrike = t; for (let i = 0; i < 9; i++) K.spawn(root, m.mx - 0.55 + R() * 0.2, deckTop + 0.5 + Math.random() * 0.3, 3.55, R() * 1.6, 0.6 + Math.random() * 1.2, 0.4 + Math.random() * 0.8, Math.random() < 0.5 ? m.col : 0xfff4d0, 0.45, 0.04, 6, true); }
      }
      // ---- lamps flicker, lanterns swing with their glow
      const fl = 0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.06;
      galLamps.forEach((l, i) => l.material.color.setRGB(1, 0.72 * (fl + Math.sin(t * 9 + i) * 0.05), 0.38));
      wallLamps.forEach((l, i) => l.material.color.setRGB(1, 0.66 * (fl + Math.sin(t * 7 + i * 3) * 0.06), 0.34));
      bulbs.forEach((b, i) => b.material.color.setRGB(1, 0.75 * (0.9 + Math.sin(t * 11 + i * 2) * 0.1), 0.44));
      if (!lGallery.isDummy) lGallery.intensity = 2.2 * fl;
      lanterns.forEach((L) => { L.piv.rotation.z = Math.sin(t * 0.9 + L.ph) * 0.1; L.piv.rotation.x = Math.sin(t * 0.7 + L.ph * 1.3) * 0.06; L.fl.material.color.setRGB(1, 0.7 * fl, 0.32); L.halo.material.opacity = 0.06 + Math.sin(t * 9 + L.ph) * 0.015; });
      keelChains.forEach((c) => { c.piv.rotation.z = Math.sin(t * 0.6 + c.ph) * 0.12; });
      // ---- molten streams + quench
      tSlag -= dt;
      streams.forEach((s, i) => {
        const w = 0.85 + Math.sin(t * 17 + i) * 0.12 + Math.random() * 0.08;
        s.core.scale.x = s.core.scale.z = w; s.outer.scale.x = s.outer.scale.z = 1.05 - (w - 0.85);
        s.outer.material.opacity = 0.42 + Math.sin(t * 9 + i) * 0.08;
        s.mouth.material.color.setRGB(1, 0.5 + Math.sin(t * 7 + i) * 0.08, 0.14);
        if (tSlag <= 0) K.spawn(root, s.spout[0] + R() * 0.2, s.spout[1] - Math.random() * s.len * 0.8, s.spout[2] + R() * 0.2, R() * 0.6, -2 - Math.random() * 3, R() * 0.6, Math.random() < 0.5 ? 0xffd070 : 0xff7a2a, i === 0 ? 0.35 : 0.9, 0.06 + Math.random() * 0.05, 6, true);
      });
      if (tSlag <= 0) tSlag = 0.05;
      tQuench -= dt;
      if (tQuench <= 0) { tQuench = 0.06; puff(K, root, sp1[0], -8.85, sp1[2], Math.random() < 0.5 ? 0xd8d0c4 : 0xa8a094, 0.16 + Math.random() * 0.1, 0.9 + Math.random() * 0.5, 0.35, 1.8); if (Math.random() < 0.3) K.spawn(root, sp1[0] + R() * 0.4, -8.9, sp1[2] + R() * 0.4, R() * 2, 1 + Math.random() * 1.5, R() * 2, 0xffc060, 0.4, 0.04, 6, true); }
      quenchGlow.material.opacity = 0.6 + Math.random() * 0.3;
      if (!lMolten.isDummy) lMolten.intensity = 2.2 * (0.85 + Math.sin(t * 8) * 0.08 + Math.random() * 0.06);
      kfGlow.forEach((g, i) => g.material.color.setRGB(1, 0.42 + Math.sin(t * 6 + i) * 0.08, 0.1));
      // ---- gears, flywheel + piston, fans, winch
      gA.rotation.y += dt * 0.35; gB.rotation.y -= dt * 0.35 * 1.4 / 0.8;
      fw.rotation.z -= dt * 2.4;
      crankPin.getWorldPosition(crank); root.worldToLocal(crank);
      { const pinX = crank.x, pinY = crank.y, cx = pinX + Math.sqrt(Math.max(0.01, 2.2 * 2.2 - (pinY + 8.4) ** 2));
        rod.position.set((pinX + cx) / 2, (pinY - 8.4) / 2, fwZ + 0.3); rod.scale.x = Math.hypot(cx - pinX, -8.4 - pinY); rod.rotation.z = Math.atan2(-8.4 - pinY, cx - pinX); piston.position.x = cx + 0.35; }
      fans.forEach((f, i) => (f.bl.rotation.z += dt * (6 + i * 2)));
      drum.rotation.x += dt * 1.2;
      gaugeN.rotation.z = -0.4 + Math.sin(t * 1.7) * 0.5;
      // ---- aether vein pulses
      pulses.forEach((p) => { p.u = (p.u + dt * 0.45) % 1; p.m.position.copy(condCurve.getPoint(p.u)); p.m.scale.setScalar(0.8 + Math.sin(t * 9 + p.u * 10) * 0.25); });
      if (!lAether.isDummy) lAether.intensity = 1.0 + Math.sin(t * 2.4) * 0.2;
      if (Math.random() < 0.06) { const c = crys[Math.floor(Math.random() * crys.length)]; K.spawn(root, c[0], c[1], c[2] + 0.3, R() * 0.4, 0.3 + Math.random() * 0.5, 0.3, 0xbffff0, 1.0, 0.05, 0, true); }
      // ---- automatons walk their beats
      const walk = (a, x, y, z, fwd, sp, ph) => { a.g.position.set(x, y, z); a.g.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2; const s = Math.sin(t * sp + ph) * 0.5; a.legs[0].rotation.x = s; a.legs[1].rotation.x = -s; return s; };
      bots.forEach((b) => {
        const L = b.x1 - b.x0, ph = (t * b.sp / L + b.ph) % 2, fwd = ph < 1, k = fwd ? ph : 2 - ph;
        const s = walk(b.a, b.x0 + K.smooth(k) * L, b.y, b.z, fwd, 7, b.ph); b.a.arms[0].rotation.x = -s * 0.6; b.a.arms[1].rotation.x = s * 0.6;
        b.a.eye.material.color.setHex(Math.sin(t * 3 + b.ph) > 0.92 ? 0xffffff : 0xffc070);
      });
      lowCarts.forEach((lc, i) => {
        const lp = (t * lc.sp + lc.ph) % 2, lk = K.smooth(lp < 1 ? lp : 2 - lp), lx = i ? 3.4 - lk * 9.0 : -7.4 + lk * 9.4;
        lc.c.position.set(lx, lowTop + 0.38, 5.2); lc.c.userData.wheels.forEach((w) => (w.rotation.z = -lx / 0.1));
        const fwd = (lp < 1) !== !!i;
        walk(lc.bot, lx + (fwd ? -0.7 : 0.7), lowTop, 5.2, fwd, 6, i); lc.bot.arms[0].rotation.x = lc.bot.arms[1].rotation.x = -1.2;
      });
      { const ph = (t * 0.8) % 1, sw = ph < 0.6 ? -1.6 * (ph / 0.6) : -1.6 + 2.4 * ((ph - 0.6) / 0.4); l2miner.arms[1].rotation.x = Math.min(0.8, sw); if (ph > 0.97 && Math.random() < 0.6) for (let i = 0; i < 6; i++) K.spawn(root, L2X + 0.3 + R() * 0.2, lowTop + 0.5, 3.45, R() * 1.4, 0.6 + Math.random(), 0.5 + Math.random() * 0.6, Math.random() < 0.5 ? 0xff9a40 : 0xfff0c0, 0.4, 0.04, 6, true); }
      // ---- hoists + airship (crew paces, cargo net swings)
      const jy = Math.sin(t * 0.35) * 0.5 + 0.5; jibChain.scale.y = 1 + jy * 2.4; jibChain.position.y = -0.1 - (1 + jy * 2.4) * 0.5; jibLoad.position.y = -1.3 - jy * 2.4; jibLoad.rotation.y = Math.sin(t * 0.5) * 0.3;
      jibBeaconM.emissive.setHex(Math.sin(t * 4 + 1) > 0.4 ? 0xff2a10 : 0);
      ship.position.y = SHIP_Y + Math.sin(t * 0.6) * 0.14; ship.rotation.z = Math.sin(t * 0.45) * 0.02;
      props.forEach((p) => (p.rotation.x += dt * 9));
      net.rotation.z = Math.sin(t * 1.1) * 0.18; net.rotation.x = Math.sin(t * 0.8) * 0.1;
      { const cp = (t * 0.12) % 2, ck = K.smooth(cp < 1 ? cp : 2 - cp); walk(crew, -0.6 + ck * 1.2 + 0.3, -0.92, 0, cp < 1, 6, 0); crew.arms[1].rotation.x = Math.sin(t * 2) > 0.7 ? -2.6 : 0; }
      shipBeacon.emissive.setHex(Math.sin(t * 3) > 0.5 ? 0xff3a20 : 0);
      moor.forEach((m) => { const top = deckTop - 0.35, bot = ship.position.y + 0.7, h = top - bot; m.m.position.set(m.x, bot + h / 2, (m.z + 9.6) / 2); m.m.scale.y = Math.hypot(h, 9.6 - m.z); m.m.rotation.x = -Math.atan2(9.6 - m.z, h); });
      { const cyc = (t * 0.12) % 1, drop = cyc < 0.7 ? K.smooth(cyc / 0.7) : 1 - K.smooth((cyc - 0.7) / 0.3);
        const dropLen = 1 + drop * (Math.max(0.5, (deckTop - 0.45) - (ship.position.y - 1.15 + 0.6)) - 1.1);
        crChain.scale.y = dropLen; crChain.position.y = -0.1 - dropLen / 2; crLoad.position.y = -0.2 - dropLen; crLoad.visible = cyc < 0.72; }
      // ---- drips, steam, vents
      tDrip -= dt; if (tDrip <= 0) { tDrip = 0.12; const d = tips[Math.floor(Math.random() * tips.length)]; K.spawn(root, d[0], d[1], d[2], 0, -0.5, 0, Math.random() < 0.7 ? 0x0a0806 : 0x6ad8c8, 1.6, 0.05, 7); }
      tVent -= dt; if (tVent <= 0) { tVent = 0.18; const vv = vents[Math.floor(Math.random() * vents.length)]; for (let i = 0; i < 2; i++) puff(K, root, vv[0], vv[1], vv[2] + 0.3, 0xa89c88, 0.16, 0.8, 0.2, 1.8); }
      if (Math.random() < 0.08) { const vv = valves[Math.floor(Math.random() * valves.length)]; K.spawn(root, vv[0], vv[1], vv[2], 0, -0.4, 0, 0x0a0806, 1.2, 0.05, 6); }
      if (Math.random() < 0.15) fans.forEach((f) => K.spawn(root, f.x + R() * f.r, f.y + R() * f.r, f.z + 0.3, R() * 0.3, 0.5, 0.5, 0x9a8a78, 1.0, 0.08, -0.1));
    } };
  });
})();
