// UNDERSIDE (Black Iron line) — everything below the deck slab (y < -1.4).
// NOTES:
//  - Rock: an inverted mountain built from 1.2u stone blocks. Only +z (front) faces are ever seen by this camera,
//    so blocks sit at a front-surface depth zFront(y) and hang deeper toward the middle (keel ~y -24).
//  - Mine level (y -9.9 gallery) carries the `rail` path; INBOX / GITHUB / SENTRY mine mouths sit in the flat wall
//    behind it and flash when IRON fires 'spawn' for their source.
//  - ORE LIFT: a paternoster cage chain in an iron shaft + headframe in front of the deck's front-left corner.
//    Up column x -15.2 (the `lift` path, cages = 'cage' carrier), empty cages return down the x -16.6 column.
//  - Carriers: 'cart' (rail) and 'cage' (lift). Item origin = the floor of the cart / cage.
//  - Hanging industry: soffit girders, slag furnaces pouring molten streams, half-sunk gears, flywheel engine,
//    cooling fans, aether crystal vein with conduit pulses, catwalks + automatons, a lower mining level,
//    a cargo airship docked below with a crane, cage lanterns, iron roots and chains under the keel.
//  - Underside meshes don't receive shadows (the slab would black them out); the look is carried by hemi light,
//    3 point lights (molten, gallery, aether) and lots of emissive.
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
      hazard: K.mat(0xd09a18), black: K.mat(0x070504), rail: K.mat(0x8a8078, { shine: 60, spec: 0x8a8a8a }),
      gas: K.glow(C.gas), ember: K.glow(C.ember), teal: K.glow(C.teal),
      tealCrys: K.mat(0x3ac8b0, { e: 0x18a088, ei: 1, shine: 60, spec: 0xffffff }),
      tealPipe: K.mat(0x2a6a60, { e: 0x0a3a32, shine: 40, spec: 0x80fff0 }),
      glass: K.mat(0xa8d8c8, { op: 0.25, shine: 90, spec: 0xffffff, depthWrite: false, double: true })
    };
    return M;
  }

  // ---------- tiny 3x5 pixel font for signs ----------
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101',
    N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', '0': '111101101101111',
    '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '!': '010010010000010', '-': '000000111000000', ' ': '000000000000000', '·': '000000010000000'
  };
  function signCanvasTex(K, text, fg, bg) {
    const w = text.length * 4 + 3, h = 9;
    return K.canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.globalAlpha = 0.35; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.globalAlpha = 1;
      for (let i = 0; i < text.length; i++) { const gl = FONT[text[i]] || FONT[' ']; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (gl[r * 3 + c] === '1') g.fillRect(2 + i * 4 + c, 2 + r, 1, 1); }
    });
  }
  // a glowing sign facing +z: returns its basic material (tint it to flash)
  function sign(K, p, text, fg, x, y, z, h) {
    const tex = signCanvasTex(K, text, fg, '#0c0806');
    const w = h * (tex.image.width / tex.image.height);
    const face = new K.THREE.MeshBasicMaterial({ map: tex, color: 0xb0b0b0, fog: false });
    K.box(w + 0.12, h + 0.12, 0.08, M.ironM, x, y, z - 0.02, p);
    K.box(w, h, 0.06, [M.iron, M.iron, M.iron, M.iron, face, M.iron], x, y, z + 0.03, p);
    for (const sx of [-1, 1]) K.box(0.06, 0.06, 0.04, M.brassL, x + sx * (w / 2 + 0.02), y + h / 2 + 0.02, z + 0.07, p);
    return face;
  }

  // ---------- textures ----------
  function rockTex(K, seed) {
    return K.canvasTex(32, 32, (g) => {
      let s = seed || 91; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#6a5747'; g.fillRect(0, 0, 32, 32);
      // soft strata, slightly tilted so neighbouring blocks don't line up like brick courses
      for (let y = -8; y < 40; y += 3 + Math.floor(r() * 4)) { g.fillStyle = ['#715d4b', '#645241', '#6e5a49', '#5e4d3e'][Math.floor(r() * 4)]; for (let x = 0; x < 32; x += 4) g.fillRect(x, y + Math.floor(x / 11), 4, 3); }
      // chunky stones / pebbles with a lit top edge
      for (let i = 0; i < 9; i++) { const x = Math.floor(r() * 28), y = Math.floor(r() * 28), w = 3 + Math.floor(r() * 5), h = 2 + Math.floor(r() * 3); g.fillStyle = r() < 0.5 ? '#7c6753' : '#574637'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,230,200,0.14)'; g.fillRect(x, y, w, 1); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y + h, w, 1); }
      for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? 'rgba(40,28,20,0.5)' : 'rgba(150,120,95,0.35)'; g.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1, 1); }
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, 31, 32, 1);
      for (let i = 0; i < 4; i++) { g.fillStyle = r() < 0.5 ? '#c48c4a' : '#9c6c3a'; g.fillRect(Math.floor(r() * 31), Math.floor(r() * 31), 1, 1); }
    });
  }
  function plankTex(K, rep) {
    return K.canvasTex(32, 16, (g) => {
      let s = 17; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#2a1c10'; g.fillRect(0, 0, 32, 16);
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
  // gear lying in xz (axis y); rotate the returned group (x = PI/2 to face the camera, then spin .rotation.y)
  function gear(K, p, r, thick, teeth, m, x, y, z) {
    const g = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.2, m, Math.sin(a) * r * 1.07, 0, Math.cos(a) * r * 1.07, g); tb.rotation.y = a; }
    K.cyl(r * 0.26, r * 0.26, thick * 1.6, M.ironM, 8, 0, 0, 0, g);
    if (r > 0.35) for (let i = 0; i < 6; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.12, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 6 * 2 / 2; s.rotation.y = i * Math.PI / 3; }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(0.07, thick * 1.2, 0.07, M.brassL, Math.cos(a) * r * 0.82, 0, Math.sin(a) * r * 0.82, g); }
    K.bake(g);
    return g;
  }
  // spoked wheel facing +z (axis z): returns the spinning group
  function wheel(K, p, r, m, x, y, z, spokes) {
    const hold = K.group(p, x, y, z);
    const w = K.group(hold);
    const rim = K.torus(r, Math.max(0.05, r * 0.07), m, 6, 28, 0, 0, 0, w);
    K.torus(r * 0.8, 0.025, M.brassD, 4, 24, 0, 0, 0, w);
    for (let i = 0; i < (spokes || 6); i++) { const s = K.box(r * 2 * 0.96, 0.06, 0.06, M.ironL, 0, 0, 0, w); s.rotation.z = i * Math.PI / (spokes || 6); }
    const hub = K.cyl(r * 0.18, r * 0.18, 0.2, M.brass, 10, 0, 0, 0, w); hub.rotation.x = Math.PI / 2;
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
  function automaton(K, p, x, y, z) {
    const g = K.group(p, x, y, z);
    const body = K.group(g, 0, 0.36, 0);
    K.box(0.26, 0.3, 0.2, M.brass, 0, 0.1, 0, body); K.box(0.28, 0.06, 0.22, M.brassD, 0, 0.26, 0, body);
    K.cyl(0.07, 0.07, 0.22, M.copper, 8, 0, 0.08, -0.13, body).rotation.x = Math.PI / 2;
    const head = K.group(body, 0, 0.36, 0); K.sph(0.1, M.ironL, 0, 0, 0, head, 8, 6); const eye = K.box(0.12, 0.04, 0.04, K.glow(0xffc070), 0, 0.01, 0.09, head);
    K.cyl(0.02, 0.02, 0.1, M.ironM, 4, 0, 0.12, 0, head);
    const legs = [-0.07, 0.07].map((lx) => { const l = K.group(g, lx, 0.36, 0); K.box(0.07, 0.34, 0.07, M.ironM, 0, -0.17, 0, l); K.box(0.09, 0.04, 0.13, M.iron, 0, -0.34, 0.02, l); return l; });
    const arms = [-0.17, 0.17].map((ax) => { const a = K.group(body, ax, 0.22, 0); K.box(0.05, 0.26, 0.05, M.brassD, 0, -0.13, 0, a); return a; });
    return { g, legs, arms, eye, head };
  }

  // =====================================================================
  // CARRIERS
  // =====================================================================
  IRON.carrier('cart', (K, item) => {
    mats(K);
    const g = new K.THREE.Group();
    const body = K.group(g);
    const col = (IRON.MINES[item.src] || { color: 0xffb040 }).color;
    K.box(0.72, 0.05, 0.54, M.ironM, 0, -0.025, 0, body);
    for (const sx of [-1, 1]) { K.box(0.05, 0.3, 0.54, M.rust, sx * 0.36, 0.13, 0, body); K.box(0.06, 0.04, 0.56, M.brassD, sx * 0.36, 0.29, 0, body); }
    for (const sz of [-1, 1]) { K.box(0.76, 0.3, 0.05, M.iron, 0, 0.13, sz * 0.27, body); K.box(0.78, 0.04, 0.06, M.brassD, 0, 0.29, sz * 0.27, body); for (const rx of [-0.25, 0, 0.25]) K.box(0.04, 0.26, 0.02, M.ironL, rx, 0.13, sz * 0.3, body); }
    K.box(0.18, 0.12, 0.02, K.mat(col, { e: col, ei: 0.7 }), 0.18, 0.16, 0.305, body);
    K.box(0.6, 0.08, 0.4, M.soot, 0, -0.09, 0, body);
    const wheels = [];
    for (const wx of [-0.22, 0.22]) for (const wz of [-0.25, 0.25]) { const w = K.group(g, wx, -0.2, wz); const c = K.cyl(0.1, 0.1, 0.06, M.ironL, 8, 0, 0, 0, w); c.rotation.x = Math.PI / 2; K.box(0.17, 0.03, 0.065, M.brassD, 0, 0, 0, w); wheels.push(w); }
    K.box(0.12, 0.05, 0.05, M.ironL, 0.42, -0.1, 0, body); K.box(0.12, 0.05, 0.05, M.ironL, -0.42, -0.1, 0, body);
    K.bake(body); wheels.forEach((w) => K.bake(w));
    g.userData.wheels = wheels;
    g.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; } });
    return g;
  });
  IRON.carrier('cage', (K, item) => {
    mats(K);
    const g = new K.THREE.Group(); // counter-rotated each frame so it lines up with the shaft
    K.box(0.82, 0.05, 0.82, M.ironM, 0, -0.025, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 1.02, 0.05, M.brassD, sx * 0.39, 0.5, sz * 0.39, g);
    for (const sz of [-1, 1]) K.box(0.82, 0.05, 0.05, M.brass, 0, 1.0, sz * 0.39, g);
    for (const sx of [-1, 1]) K.box(0.05, 0.05, 0.82, M.brass, sx * 0.39, 1.0, 0, g);
    K.box(0.86, 0.03, 0.86, M.iron, 0, 1.04, 0, g);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) K.box(0.02, 0.95, 0.02, M.ironL, sx * 0.39, 0.5, -0.2 + i * 0.2, g);
    for (let i = 0; i < 3; i++) K.box(0.02, 0.95, 0.02, M.ironL, -0.2 + i * 0.2, 0.5, -0.39, g);
    K.box(0.8, 0.04, 0.03, M.hazard, 0, 0.72, 0.4, g); // front gate bar
    K.box(0.32, 0.06, 0.06, M.ironL, 0.55, 0.85, -0.48, g); K.box(0.06, 0.06, 0.2, M.ironL, 0.69, 0.85, -0.4, g); // arm to the chain
    K.box(0.1, 0.08, 0.1, K.glow(0xffb040), 0, 1.1, 0, g);
    g.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; } });
    K.bake(g);
    return g;
  });

  // =====================================================================
  // UNDERSIDE
  // =====================================================================
  IRON.underside((K, root, ctx) => {
    mats(K);
    const T = K.THREE;
    const statics = K.group(root);   // baked at the end
    const anim = K.group(root);      // moving parts
    const upd = [];                  // per-frame updaters
    const R = K.R;
    let s0 = 1234; const rr = () => { s0 = (s0 * 16807) % 2147483647; return (s0 - 1) / 2147483646; };

    // ---------------------------------------------------------------- ROCK
    const rt = rockTex(K, 91), rt2 = rockTex(K, 4447);
    const rockMats = [
      K.mat(0xffffff, { map: rt, e: 0x140c08 }),
      K.mat(0xd4c4b4, { map: rt2, e: 0x100a06 }),
      K.mat(0xffdcc4, { map: rt2, e: 0x160a04 }),
      K.mat(0xa8a49e, { map: rt, e: 0x0a0a0c }),
      K.mat(0x8e8e94, { map: rt2, e: 0x08080c })
    ];
    const ZF = [[-1.4, 7.4], [-3, 7.1], [-5, 6.55], [-6.2, 6.3], [-6.25, 5.2], [-11.0, 5.2], [-11.6, 5.0], [-12.4, 4.6], [-13.4, 4.3], [-15, 3.4], [-18, 1.9], [-21, 0.4], [-26, -1.2]];
    const zFrontAt = (y) => { for (let i = 0; i < ZF.length - 1; i++) { const a = ZF[i], b = ZF[i + 1]; if (y <= a[0] && y >= b[0]) return a[1] + (b[1] - a[1]) * (a[0] - y) / (a[0] - b[0]); } return y > -1.4 ? 7.4 : -1.2; };
    const bottomAt = (x) => -3.5 - 20.5 * Math.pow(Math.max(0, 1 - ((x + 1) / 19) ** 2), 1.15);
    const CS = 1.2;
    const rockG = K.group(statics);
    const tips = [];      // stalactite tips (drips)
    const keelBottoms = [];
    for (let xi = 0; xi < 31; xi++) {
      const x = -18 + xi * CS;
      let bot = bottomAt(x) + (rr() * 2 - 1) * 1.1;
      const mineX = x > -17.0 && x < 11.0;
      if (mineX) bot = Math.min(bot, -11.7);
      if (x > -10 && x < 4.6) bot = Math.min(bot, -14.6); // lower level backing
      let last = null;
      for (let yt = -1.4; yt - CS >= bot - 0.7; yt -= CS) {
        const yc = yt - CS / 2;
        let zf = zFrontAt(yc);
        const mineWall = mineX && yc < -6.2 && yc > -11.2;
        if (mineWall) zf = 5.2 + (rr() - 0.5) * 0.1;
        else if (yc > -2.7) zf = Math.min(7.35, zf + (rr() - 0.5) * 0.3);
        else zf += (rr() - 0.5) * 0.5 + (rr() < 0.12 ? 0.42 : 0);
        const depth = -yc;
        const mi = depth < 7 ? (rr() < 0.3 ? 2 : rr() < 0.5 ? 1 : 0) : depth < 13 ? (rr() < 0.25 ? 2 : rr() < 0.6 ? 1 : 0) : depth < 18 ? (rr() < 0.5 ? 3 : 1) : (rr() < 0.6 ? 4 : 3);
        const bw = CS + (mineWall ? 0.02 : rr() * 0.3), bh = CS + (mineWall ? 0.02 : rr() * 0.22);
        K.box(bw, bh, CS, rockMats[mi], x + (mineWall ? 0 : R() * 0.16), yc + (mineWall ? 0 : R() * 0.1), zf - CS / 2, rockG);
        // strata ledges + big boulder clusters break up the block grid
        if (!mineWall && rr() < 0.1) K.box(CS * (1.4 + rr()), 0.18, 0.4, rockMats[(mi + 2) % 5], x + R() * 0.6, yc - 0.45, zf + 0.1, rockG);
        if (!mineWall && rr() < 0.07) { const bc = rockMats[(mi + 1) % 5]; K.rock(0.55 + rr() * 0.3, bc, x + R() * 0.4, yc + R() * 0.3, zf + 0.12, rockG, 0); K.rock(0.3, bc, x + 0.5, yc - 0.4, zf + 0.2, rockG); }
        last = { x, yc, zf };
        // boulders on the face
        if (!mineWall && rr() < 0.18) K.rock(0.3 + rr() * 0.35, rockMats[(mi + 1) % 4], x + R() * 0.6, yc + R() * 0.5, zf + 0.05, rockG);
      }
      if (last) {
        const by = last.yc - CS / 2;
        keelBottoms.push([x, by, last.zf - 0.6]);
        const n = 1 + Math.floor(rr() * 3);
        for (let i = 0; i < n; i++) {
          const L = 0.5 + rr() * (by < -14 ? 2.6 : 1.4), sx = x + R() * 0.8, sz = last.zf - 0.3 - rr() * 0.6;
          const c = K.cone(0.22 + rr() * 0.25, L, rockMats[3 + (i % 2)], 5, sx, by - L / 2 + 0.05, sz, rockG); c.rotation.x = Math.PI; c.rotation.y = rr() * 3;
          tips.push([sx, by - L, sz]);
        }
      }
    }
    // soot streaks + ore veins on the face
    const grime = K.mat(0x080605, { op: 0.45, depthWrite: false });
    for (let i = 0; i < 26; i++) { const x = -17 + rr() * 34, y = -2.2 - rr() * 11; const d = K.box(0.25 + rr() * 0.5, 1 + rr() * 3, 0.02, grime, x, y, zFrontAt(y) + 0.32, rockG); d.castShadow = false; }
    const vein = K.mat(0xc88a3a, { e: 0x3a1a04 });
    for (let i = 0; i < 18; i++) { const x = -16 + rr() * 30, y = -3 - rr() * 14; const v = K.box(0.6 + rr(), 0.06, 0.03, vein, x, y, zFrontAt(y) + 0.3, rockG); v.rotation.z = R() * 1.2; }

    // ---------------------------------------------------------------- SOFFIT under the slab
    const sof = K.group(statics);
    K.box(37, 0.36, 0.22, M.rust, 0, -1.62, 7.62, sof);
    K.box(37, 0.06, 0.3, M.ironM, 0, -1.44, 7.62, sof); K.box(37, 0.06, 0.3, M.ironM, 0, -1.8, 7.62, sof);
    for (let x = -18; x <= 18; x += 0.6) K.box(0.06, 0.06, 0.04, M.brassL, x, -1.62, 7.75, sof);
    for (let x = -16.2; x <= 16.3; x += 3.6) {
      K.box(0.22, 1.8, 0.22, M.iron, x, -2.6, 7.45, sof);
      const st = K.box(0.14, 2.3, 0.14, M.ironM, x + 0.6, -2.5, 7.4, sof); st.rotation.z = -0.5;
      K.box(0.42, 0.18, 0.34, M.brassD, x, -3.5, 7.35, sof);
      for (const dy of [-1.9, -2.6, -3.2]) K.box(0.08, 0.08, 0.04, M.brassL, x, dy, 7.57, sof);
    }
    // cable tray with hanging bulbs + copper main
    K.box(36, 0.05, 0.3, M.ironM, 0, -2.05, 7.9, sof);
    const bulbs = [];
    for (let x = -15.5; x <= 15.5; x += 3.1) { K.box(0.02, 0.4, 0.02, M.soot, x, -2.25, 7.9, sof); const bb = K.sph(0.09, K.glow(0xffc070), x, -2.5, 7.9, sof, 6, 4); bulbs.push(bb); K.cone(0.14, 0.1, M.brassD, 6, x, -2.4, 7.9, sof); }
    K.tube([[-18, -2.35, 7.8], [18, -2.35, 7.8]], 0.12, M.copper, sof, 4, 8);
    for (let x = -16; x <= 16; x += 2.8) { const f = K.cyl(0.17, 0.17, 0.08, M.brassD, 10, x, -2.35, 7.8, sof); f.rotation.z = Math.PI / 2; }
    const valves = [];
    for (const x of [-11, -2.4, 6.4, 14]) { const v = K.torus(0.16, 0.035, K.mat(0xa02a1a), 4, 12, x, -2.35, 8.0, sof); valves.push([x, -2.45, 8.0]); K.box(0.06, 0.2, 0.06, M.brass, x, -2.25, 7.95, sof); }

    // ---------------------------------------------------------------- MINE GALLERY + RAIL
    const gal = K.group(statics);
    const deckTop = -9.9;
    const deckTex = plankTex(K, [24, 3]);
    const deckTop1 = K.mat(0xffffff, { map: deckTex, e: 0x0c0804 });
    K.box(23.6, 0.18, 2.55, [M.woodD, M.woodD, deckTop1, M.soot, M.woodD, M.woodD], -2.2, deckTop - 0.09, 6.475, gal);
    K.box(23.7, 0.32, 0.18, M.rust, -2.2, deckTop - 0.25, 7.76, gal);
    for (let x = -13.8; x <= 9.4; x += 0.6) K.box(0.06, 0.06, 0.04, M.brassL, x, deckTop - 0.25, 7.86, gal);
    // posts + struts under the gallery
    for (let x = -13.6; x <= 9.4; x += 2.4) {
      K.box(0.2, 1.6, 0.2, M.woodD, x, deckTop - 1.05, 7.6, gal);
      const st = K.box(0.14, 3.0, 0.14, M.iron, x, deckTop - 1.2, 6.45, gal); st.rotation.x = 0.85;
      K.box(0.4, 0.25, 0.3, M.brassD, x, deckTop - 1.9, 7.55, gal);
    }
    // railing with lantern posts
    for (let x = -13.8; x <= 9.5; x += 2.4) K.box(0.07, 0.9, 0.07, M.iron, x, deckTop + 0.45, 7.66, gal);
    K.box(23.4, 0.07, 0.08, M.ironL, -2.2, deckTop + 0.9, 7.66, gal); K.box(23.4, 0.05, 0.06, M.iron, -2.2, deckTop + 0.45, 7.66, gal);
    const galLamps = [];
    for (const x of [-12.6, -8.6, -3.2, 2.6, 6.2, 9.2]) {
      K.box(0.1, 1.5, 0.1, M.iron, x, deckTop + 0.75, 7.62, gal); K.box(0.36, 0.06, 0.06, M.iron, x, deckTop + 1.45, 7.75, gal);
      const lg = K.box(0.18, 0.24, 0.18, K.glow(0xffb860), x + 0.16, deckTop + 1.22, 7.86, gal); galLamps.push(lg);
      K.cone(0.16, 0.12, M.brassD, 6, x + 0.16, deckTop + 1.4, 7.86, gal);
    }
    // rail track along the `rail` path (+ a stub past the start with a buffer stop)
    const railPts = ctx.paths.rail.points.map((p) => p.slice());
    railPts.unshift([9.0, railPts[0][1], railPts[0][2]]);
    function track(pts, y, p) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
        const g = K.group(p, a[0], y, a[2]); g.rotation.y = Math.atan2(-dz, dx);
        for (const sz of [-0.28, 0.28]) { K.box(L + 0.06, 0.06, 0.06, M.rail, L / 2, 0, sz, g); K.box(L + 0.06, 0.04, 0.1, M.ironM, L / 2, -0.05, sz, g); }
        for (let x = 0.2; x < L; x += 0.55) K.box(0.14, 0.05, 0.8, M.soot, x, -0.08, 0, g);
      }
    }
    track(railPts, -9.83, gal);
    const bs = K.group(gal, 9.1, deckTop, 6.6); K.box(0.2, 0.5, 0.9, M.rust, 0, 0.25, 0, bs); hazardStripe(bs, 0.95, 0.42, 0.105);
    function hazardStripe(p, len, y, z) { const n = 6, w = len / n; for (let i = 0; i < n; i++) K.box(0.03, 0.12, w * 0.95, i % 2 ? M.soot : M.hazard, z, y, -len / 2 + w * (i + 0.5), p); }

    // MINE MOUTHS
    const mines = {};
    for (const src of ['inbox', 'github', 'sentry']) {
      const mi = ctx.MINES[src], mx = mi.x, col = mi.color;
      const mg = K.group(gal, mx, 0, 0);
      const zw = 5.22;
      K.box(1.6, 1.95, 0.08, M.black, 0, deckTop + 0.98, zw + 0.02, mg);
      K.box(1.0, 1.35, 0.06, K.mat(0x140c08, { e: 0x0a0604 }), 0, deckTop + 0.75, zw + 0.03, mg);
      const inner = K.glow(col, 0.9);
      K.box(1.3, 0.1, 0.05, inner, 0, deckTop + 0.07, zw + 0.06, mg);
      const back = K.sph(0.16, inner, 0, deckTop + 0.85, zw + 0.06, mg, 8, 6);
      for (let i = 0; i < 5; i++) { const c = K.cone(0.05, 0.22, K.mat(col, { e: col, ei: 0.9 }), 4, -0.45 + i * 0.22, deckTop + 0.18, zw + 0.12, mg); c.rotation.z = R() * 0.8; }
      for (const sx of [-1, 1]) { K.box(0.22, 2.05, 0.24, M.wood, sx * 0.88, deckTop + 1.02, zw + 0.14, mg); K.box(0.26, 0.12, 0.28, M.ironM, sx * 0.88, deckTop + 0.06, zw + 0.14, mg); const br = K.box(0.1, 0.6, 0.12, M.woodD, sx * 0.66, deckTop + 1.82, zw + 0.24, mg); br.rotation.z = sx * 0.8; }
      K.box(2.1, 0.26, 0.3, M.wood, 0, deckTop + 2.08, zw + 0.15, mg);
      K.box(2.14, 0.06, 0.32, M.ironM, 0, deckTop + 2.23, zw + 0.15, mg);
      const sm = sign(K, mg, mi.label, '#' + col.toString(16).padStart(6, '0'), 0, deckTop + 2.62, zw + 0.12, 0.44);
      // spur rails out to the main line
      for (const sx of [-0.28, 0.28]) K.box(0.06, 0.06, 1.3, M.rail, sx, -9.83, 5.95, mg);
      for (let z = 5.4; z < 6.4; z += 0.42) K.box(0.86, 0.05, 0.13, M.woodD, 0, -9.91, z, mg);
      // ore pile + a hanging cage lamp in the source color
      for (let i = 0; i < 7; i++) K.rock(0.12 + rr() * 0.1, i % 3 ? M.soot : K.mat(col, { e: col, ei: 0.5 }), 1.25 + R() * 0.5, deckTop + 0.12 + rr() * 0.15, 5.65 + R() * 0.3, mg);
      K.box(0.05, 0.5, 0.05, M.iron, -1.2, deckTop + 1.9, zw + 0.35, mg); K.box(0.3, 0.05, 0.05, M.iron, -1.08, deckTop + 2.12, zw + 0.35, mg);
      const lampM = K.mat(0x221a10, { e: 0 });
      K.box(0.18, 0.22, 0.18, lampM, -0.96, deckTop + 1.86, zw + 0.35, mg);
      mines[src] = { mx, col, inner, back, sm, lampM, flash: 0 };
    }
    const wall = K.group(statics);
    const mineXs = Object.values(ctx.MINES).map((m) => m.x);
    const wallLamps = [];
    for (let x = -13.0; x <= 10.4; x += 2.35) {
      if (mineXs.some((mx) => Math.abs(x - mx) < 1.5)) continue;
      // timber shoring set: two props + cap beam + iron straps
      for (const sx of [-0.5, 0.5]) { K.box(0.2, 3.3, 0.2, M.woodD, x + sx, deckTop + 1.65, 5.32, wall); K.box(0.24, 0.08, 0.24, M.ironM, x + sx, deckTop + 0.6, 5.33, wall); K.box(0.24, 0.08, 0.24, M.ironM, x + sx, deckTop + 2.4, 5.33, wall); }
      K.box(1.4, 0.24, 0.26, M.wood, x, deckTop + 3.32, 5.34, wall);
      const d = K.box(0.12, 1.5, 0.12, M.woodD, x, deckTop + 2.5, 5.36, wall); d.rotation.z = 0.62;
      if (Math.round(x * 10) % 3 === 0) { const lm = K.box(0.16, 0.2, 0.12, K.glow(0xffb060), x, deckTop + 2.0, 5.48, wall); K.box(0.22, 0.05, 0.16, M.brassD, x, deckTop + 2.13, 5.48, wall); wallLamps.push(lm); }
      else { K.box(0.5, 0.36, 0.04, M.hazard, x, deckTop + 1.4, 5.36, wall); K.box(0.36, 0.22, 0.05, M.soot, x, deckTop + 1.4, 5.37, wall); }
    }
    // power cable sagging along the wall between lamps
    K.tube([[-13.4, deckTop + 3.25, 5.48], [-9, deckTop + 3.05, 5.5], [-4, deckTop + 3.25, 5.48], [0.5, deckTop + 3.05, 5.5], [5, deckTop + 3.25, 5.48], [10.6, deckTop + 3.1, 5.5]], 0.035, M.soot, wall, 40, 4);
    // ore chutes from the mines feeding the carts (decor)
    for (const mx of mineXs) { const ch = K.group(wall, mx + 1.2, deckTop + 1.3, 5.6); K.box(0.36, 0.06, 0.8, M.ironL, 0, 0, 0.2, ch).rotation.x = 0.5; for (const s of [-0.18, 0.18]) K.box(0.04, 0.14, 0.8, M.ironM, s, 0.05, 0.2, ch).rotation.x = 0.5; }
    IRON.on('spawn', (d) => {
      const m = mines[d.src]; if (!m) return; m.flash = 1;
      for (let i = 0; i < 8; i++) puff(K, root, m.mx, deckTop + 0.4, 5.9, 0x8a7a68, 0.16, 0.5, 0.8, 1.4);
      for (let i = 0; i < 10; i++) K.spawn(root, m.mx + R() * 0.8, deckTop + 0.6, 5.7, R() * 2, 0.6 + Math.random() * 1.4, Math.random() * 1.6, m.col, 0.6, 0.05, 5, true);
    });

    // ---------------------------------------------------------------- ORE LIFT (paternoster + headframe)
    const LX = -15.2, LZ = 8.3, DX = -16.6, CZ = 7.82, WX = -15.9, TOPY = 2.9, BOTY = -11.3, WR = 1.3;
    const lift = K.group(statics);
    const liftA = K.group(anim);
    const postX = [-14.0, -17.8], postZ = [7.6, 9.0];
    for (const px of postX) for (const pz of postZ) { K.box(0.18, 17.6, 0.18, M.iron, px, -3.8, pz, lift); for (let y = -12.4; y < 4.8; y += 0.9) K.box(0.22, 0.05, 0.22, M.brassD, px, y, pz, lift); }
    for (let y = -12.4; y <= 4.81; y += 1.6) {
      const backOpen = (y > 0.0 && y < 2.2) || (y > -10.3 && y < -8.6);
      K.box(3.8, 0.1, 0.1, M.ironM, -15.9, y, 9.0, lift);
      if (!backOpen) K.box(3.8, 0.1, 0.1, M.ironM, -15.9, y, 7.6, lift);
      for (const px of postX) K.box(0.1, 0.1, 1.4, M.ironM, px, y, 8.3, lift);
    }
    // front diagonals only on the headframe section (keep the cages readable)
    for (const [x, ry] of [[-16.85, 0.62], [-14.95, -0.62]]) { const d = K.box(0.08, 3.3, 0.08, M.ironM, x, 3.2, 9.02, lift); d.rotation.z = ry; }
    // guide rails in the up column
    for (const sx of [-0.46, 0.46]) K.box(0.05, 13.6, 0.05, M.rail, LX + sx, -4.4, LZ - 0.42, lift);
    // top platform + sheaves + sign + beacon
    K.box(4.1, 0.16, 1.7, M.ironM, -15.9, 4.86, 8.3, lift);
    for (const x of [-17.8, -14.0]) K.box(0.08, 0.5, 1.6, M.iron, x, 5.15, 8.3, lift);
    const liftSign = sign(K, lift, 'ORE LIFT', '#ffb040', -15.9, 4.35, 9.08, 0.42);
    const sheaves = [wheel(K, liftA, 0.72, M.brass, -15.25, 5.75, 8.3, 6), wheel(K, liftA, 0.72, M.brass, -16.55, 5.75, 8.3, 6)];
    for (const s of sheaves) { K.cyl(0.1, 0.1, 0.5, M.ironL, 8, s.parent.position.x, 5.75, 8.3, lift).rotation.x = Math.PI / 2; K.box(0.14, 0.9, 0.14, M.ironM, s.parent.position.x, 5.25, 8.0, lift); }
    const beaconM = K.mat(0x401010, { e: 0 });
    K.cyl(0.1, 0.12, 0.3, M.ironM, 8, -15.9, 5.1, 8.3, lift); K.sph(0.14, beaconM, -15.9, 6.62, 8.3, lift, 8, 6); K.box(0.06, 1.3, 0.06, M.iron, -15.9, 5.95, 8.3, lift);
    // chain loop: top + bottom wheels, two chains
    const topW = wheel(K, liftA, WR, M.ironL, WX, TOPY, CZ, 8);
    const botW = wheel(K, liftA, WR, M.ironL, WX, BOTY, CZ, 8);
    K.cyl(0.14, 0.14, 1.6, M.iron, 8, WX, TOPY, 8.3, lift).rotation.x = Math.PI / 2;
    K.cyl(0.14, 0.14, 1.6, M.iron, 8, WX, BOTY, 8.3, lift).rotation.x = Math.PI / 2;
    const chUp = chainBar(K, lift, WX + WR, BOTY, TOPY, CZ, 0.08), chDn = chainBar(K, lift, WX - WR, BOTY, TOPY, CZ, 0.08);
    // signal lamps up the shaft
    const shaftLamps = [];
    for (let y = -9.0; y <= 0.5; y += 2.4) { const m = K.mat(0x3a2a10, { e: 0 }); K.box(0.16, 0.16, 0.1, m, -14.0, y, 9.12, lift); shaftLamps.push({ m, y }); }
    // landing platform (cart -> cage transfer), railing, tipper ramp
    const landTex = plankTex(K, [3, 4]);
    K.box(1.7, 0.18, 3.1, [M.woodD, M.woodD, K.mat(0xffffff, { map: landTex, e: 0x0c0804 }), M.soot, M.woodD, M.woodD], -14.85, deckTop - 0.09, 7.85, lift);
    K.box(1.8, 0.3, 0.16, M.rust, -14.85, deckTop - 0.25, 9.44, lift);
    for (let x = -15.6; x <= -14.0; x += 0.8) K.box(0.07, 0.85, 0.07, M.iron, x, deckTop + 0.42, 9.4, lift);
    K.box(1.7, 0.06, 0.07, M.ironL, -14.85, deckTop + 0.85, 9.4, lift);
    const tip = K.group(lift, -14.75, deckTop + 0.05, 8.0); tip.rotation.y = -0.75; K.box(0.9, 0.06, 0.9, M.ironL, 0, 0.03, 0, tip); hazardStripe(tip, 0.9, 0.08, 0.46);
    const landLampM = K.mat(0x103010, { e: 0 });
    K.box(0.08, 1.4, 0.08, M.iron, -14.3, deckTop + 0.7, 9.15, lift); K.box(0.22, 0.22, 0.22, landLampM, -14.3, deckTop + 1.5, 9.15, lift);
    K.box(0.4, 0.2, 0.4, M.ironM, -14.3, deckTop + 0.1, 9.15, lift);
    for (const [x, ry] of [[-14.4, 0.6], [-13.0, -0.6]]) { const s = K.box(0.12, 2.6, 0.12, M.iron, x, deckTop - 1.3, 8.6, lift); s.rotation.x = ry * 0.6; }
    // shaft boot under the bottom wheel
    K.box(3.9, 0.5, 1.6, M.rust, -15.9, BOTY - 1.6, 8.3, lift); K.box(4.0, 0.08, 1.7, M.brassD, -15.9, BOTY - 1.32, 8.3, lift);
    for (let i = 0; i < 6; i++) K.rock(0.14 + rr() * 0.1, M.soot, -15.9 + R() * 3, BOTY - 1.28, 8.3 + R(), lift);
    // empty cages returning down the left column
    const downCages = [];
    for (let i = 0; i < 8; i++) {
      const c = IRON.carriers.cage.make(K, { src: 'github' }); c.position.set(DX, 0, LZ); c.scale.x = -1; liftA.add(c); downCages.push({ c, o: i * 1.75 });
    }

    // ---------------------------------------------------------------- LOWER LEVEL (y -13.1)
    const low = K.group(statics), lowA = K.group(anim);
    const lowTop = -13.1;
    K.box(14, 0.18, 1.9, [M.woodD, M.woodD, K.mat(0xffffff, { map: plankTex(K, [14, 2]), e: 0x0c0804 }), M.soot, M.woodD, M.woodD], -2.5, lowTop - 0.09, 4.95, low);
    K.box(14.1, 0.28, 0.16, M.rust, -2.5, lowTop - 0.23, 5.92, low);
    for (let x = -9.2; x <= 4.4; x += 2.2) { K.box(0.18, 1.5, 0.18, M.woodD, x, lowTop - 0.95, 5.8, low); const st = K.box(0.12, 2.0, 0.12, M.iron, x, lowTop - 1.1, 5.0, low); st.rotation.x = 0.8; }
    track([[-9.4, 0, 5.2], [4.4, 0, 5.2]], lowTop + 0.08, low);
    for (let x = -9.2; x <= 4.4; x += 2.8) K.box(0.06, 0.7, 0.06, M.iron, x, lowTop + 0.35, 5.88, low);
    K.box(13.8, 0.06, 0.07, M.ironL, -2.5, lowTop + 0.7, 5.88, low);
    // deep shaft mouth at the left end + winch at the right
    K.box(1.3, 1.6, 0.08, M.black, -8.6, lowTop + 0.8, 4.35, low);
    const deepGlow = K.box(1.1, 0.1, 0.05, K.glow(0xff8a3a, 0.9), -8.6, lowTop + 0.07, 4.4, low);
    for (const sx of [-0.72, 0.72]) K.box(0.18, 1.7, 0.2, M.wood, -8.6 + sx, lowTop + 0.85, 4.45, low);
    K.box(1.7, 0.22, 0.24, M.wood, -8.6, lowTop + 1.72, 4.45, low);
    sign(K, low, 'LEVEL 2', '#ff8a3a', -8.6, lowTop + 2.12, 4.4, 0.32);
    const winch = K.group(low, 3.9, lowTop, 4.6); K.box(0.8, 0.6, 0.7, M.ironM, 0, 0.3, 0, winch);
    const drum = K.group(lowA, 3.9, lowTop + 0.8, 4.6); const dr = K.cyl(0.28, 0.28, 0.8, M.brassD, 10, 0, 0, 0, drum); dr.rotation.z = Math.PI / 2; for (let i = 0; i < 4; i++) K.box(0.82, 0.05, 0.08, M.ironL, 0, Math.cos(i * 1.57) * 0.28, Math.sin(i * 1.57) * 0.28, drum);
    K.bake(drum);
    // a decorative cart shuttling on level 2, pushed by an automaton
    const lowCart = IRON.carriers.cart.make(K, { src: 'sentry' }); lowCart.position.set(0, lowTop + 0.38, 5.2); lowA.add(lowCart);
    for (let i = 0; i < 5; i++) K.rock(0.12, i % 2 ? M.soot : M.rustL, R() * 0.4, 0.2, R() * 0.3, lowCart);
    const lowBot = automaton(K, lowA, 0, lowTop, 5.2);
    // ladder gallery -> level 2
    function ladder(p, x, z, y0, y1) { const h = y1 - y0; for (const sx of [-0.18, 0.18]) K.box(0.05, h, 0.05, M.iron, x + sx, y0 + h / 2, z, p); for (let y = y0 + 0.2; y < y1; y += 0.3) K.box(0.36, 0.04, 0.04, M.ironL, x, y, z, p); }
    ladder(low, -9.9, 5.6, lowTop, deckTop);

    // ---------------------------------------------------------------- CATWALK (y -5.6) + ladders + automatons
    const cw = K.group(statics), cwA = K.group(anim);
    const cwY = -5.6;
    K.box(6.2, 0.1, 0.8, M.ironM, -12.1, cwY - 0.05, 6.75, cw);
    for (let x = -15.1; x <= -9.0; x += 0.3) K.box(0.03, 0.03, 0.78, M.soot, x, cwY + 0.01, 6.75, cw);
    for (let x = -15.0; x <= -9.1; x += 1.0) { K.box(0.05, 0.8, 0.05, M.iron, x, cwY + 0.4, 7.12, cw); const b = K.box(0.08, 1.3, 0.08, M.iron, x, cwY - 0.6, 6.7, cw); b.rotation.x = -0.6; }
    K.box(6.1, 0.05, 0.05, M.ironL, -12.1, cwY + 0.8, 7.12, cw); K.box(6.1, 0.04, 0.04, M.iron, -12.1, cwY + 0.4, 7.12, cw);
    ladder(cw, -14.6, 7.48, cwY, -2.2);
    ladder(cw, -9.4, 6.55, deckTop, cwY);
    const bots = [
      { a: automaton(K, cwA, -14, cwY, 6.75), x0: -14.6, x1: -9.6, y: cwY, z: 6.75, sp: 0.55, ph: 0 },
      { a: automaton(K, cwA, -12, deckTop, 5.75), x0: -12.8, x1: -7.6, y: deckTop, z: 5.75, sp: 0.42, ph: 2.3 },
      { a: automaton(K, cwA, 4, deckTop, 5.7), x0: 2.6, x1: 6.6, y: deckTop, z: 5.7, sp: 0.38, ph: 1.1 }
    ];

    // ---------------------------------------------------------------- AETHER CRYSTAL VEIN + conduit
    const ae = K.group(statics), aeA = K.group(anim);
    const crys = [];
    for (let i = 0; i < 16; i++) {
      const cx = -7.2 + R() * 2.6, cy = -5.2 + R() * 1.6, cz = zFrontAt(cy) + 0.25;
      const c = K.cone(0.1 + rr() * 0.12, 0.5 + rr() * 0.7, M.tealCrys, 5, cx, cy, cz, ae); c.rotation.set(0.6 + R() * 0.8, rr() * 3, R() * 1.4);
      crys.push([cx, cy, cz]);
    }
    for (let i = 0; i < 5; i++) { const h = K.sph(0.5 + rr() * 0.3, K.glow(0x3ae0c0, 0.06, true), -7.2 + R() * 2.2, -5.2 + R() * 1.2, 6.5, aeA, 8, 6); h.castShadow = false; }
    const condPts = [[-6.6, -4.2, 7.15], [-6.9, -3.2, 7.45], [-7.3, -2.4, 7.72], [-7.4, -1.55, 7.86]];
    K.tube(condPts, 0.11, M.tealPipe, ae, 16, 6);
    const condCurve = new T.CatmullRomCurve3(condPts.map((p) => new T.Vector3(p[0], p[1], p[2])));
    for (const u of [0.2, 0.5, 0.8]) { const p = condCurve.getPoint(u); const r = K.torus(0.15, 0.04, M.brass, 4, 10, p.x, p.y, p.z, ae); const tn = condCurve.getTangent(u); r.lookAt(p.x + tn.x, p.y + tn.y, p.z + tn.z); }
    const pulses = [0, 0.33, 0.66].map((u) => ({ m: K.sph(0.13, K.glow(0xbffff0), 0, 0, 0, aeA, 6, 4), u }));
    sign(K, ae, 'AETHER', '#7af0d8', -7.9, -3.5, 7.35, 0.3);

    // ---------------------------------------------------------------- SLAG FURNACES + molten streams
    const fur = K.group(statics), furA = K.group(anim);
    const streams = [];
    function slagFurnace(x, y, s) {
      const zf = zFrontAt(y) + 0.55 * s;
      const g = K.group(fur, x, y, zf); g.scale.setScalar(s);
      K.cyl(0.78, 0.9, 2.3, M.iron, 12, 0, 0, 0, g);
      for (const yy of [-0.9, -0.2, 0.5, 1.0]) { band(K, g, 0.86, yy, M.rust, 0.12); }
      K.lathe([[0.8, 0], [0.55, 0.5], [0.3, 0.8], [0.3, 1.4]], M.ironM, 12, 0, 1.15, 0, g);
      K.box(0.5, 0.4, 0.3, M.ironM, 0, -1.25, 0, g);
      const mouth = K.box(0.6, 0.5, 0.06, K.glow(0xff8a2a), 0, -0.35, 0.86, g);
      for (let i = 0; i < 4; i++) K.box(0.05, 0.55, 0.08, M.soot, -0.2 + i * 0.13, -0.35, 0.9, g);
      // spout trough
      const tr = K.group(g, 0, -0.95, 0.75); tr.rotation.x = 0.28;
      K.box(0.36, 0.08, 1.0, M.ironL, 0, 0, 0.45, tr); for (const sx of [-0.18, 0.18]) K.box(0.05, 0.16, 1.0, M.ironM, sx, 0.06, 0.45, tr);
      K.box(0.22, 0.03, 0.95, K.glow(0xffb040), 0, 0.05, 0.45, tr);
      // brackets into the rock
      for (const sx of [-0.7, 0.7]) { const b = K.box(0.12, 0.12, 0.9, M.iron, sx, 0.2, -0.55, g); }
      const spout = [x, y + (-0.95 - 0.28) * s, zf + (0.75 + 0.95) * s];
      const len = Math.max(4, spout[1] + 22);
      const core = K.box(0.1 * s, len, 0.1 * s, K.glow(0xffe08a, 0.95, true), spout[0], spout[1] - len / 2, spout[2], furA);
      const outer = K.box(0.28 * s, len, 0.28 * s, K.glow(0xff6a1a, 0.5, true), spout[0], spout[1] - len / 2, spout[2], furA);
      const fade = K.box(0.4 * s, 3, 0.4 * s, K.glow(0xff8a2a, 0.25, true), spout[0], spout[1] - len + 1.5, spout[2], furA);
      streams.push({ core, outer, fade, spout, len, mouth });
    }
    slagFurnace(13.2, -4.4, 1);
    slagFurnace(5.3, -14.7, 0.75);
    // keel furnace: a squat hanging smelter with glowing grates at the bottom of the mountain
    const kf = K.group(fur, -1.2, -21.6, 1.4);
    K.cyl(1.2, 0.9, 1.6, M.iron, 10, 0, 0, 0, kf); band(K, kf, 1.22, 0.5, M.rust, 0.14); band(K, kf, 1.0, -0.6, M.brassD, 0.12);
    const kfGlow = []; for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; const w = K.box(0.18, 0.7, 0.06, K.glow(0xff7a2a), Math.sin(a) * 1.08, 0, Math.cos(a) * 1.08, kf); w.rotation.y = a; kfGlow.push(w); }
    K.cone(0.9, 0.9, M.ironM, 10, 0, -1.25, 0, kf).rotation.x = Math.PI;
    K.cyl(0.16, 0.16, 2.2, M.iron, 8, 0, 1.9, 0, kf);

    // ---------------------------------------------------------------- GEARS, FLYWHEEL, FANS
    const mech = K.group(statics), mechA = K.group(anim);
    const gA = gear(K, mechA, 1.6, 0.32, 22, M.brass, 4.5, -4.6, zFrontAt(-4.6) + 0.05); gA.rotation.x = Math.PI / 2;
    const gB = gear(K, mechA, 0.85, 0.3, 12, M.copper, 6.85, -3.75, zFrontAt(-3.75) + 0.08); gB.rotation.x = Math.PI / 2;
    K.box(0.5, 0.5, 0.4, M.ironM, 4.5, -4.6, zFrontAt(-4.6) - 0.05, mech);
    // flywheel engine near the INBOX mine
    const fwZ = 6.25;
    const fw = wheel(K, mechA, 1.25, M.iron, 12.6, -8.4, fwZ, 8);
    K.torus(1.25, 0.16, M.ironL, 6, 30, 0, 0, 0.0, fw);
    const crankPin = K.group(fw, 0.75, 0, 0.18); K.cyl(0.08, 0.08, 0.2, M.brassL, 8, 0, 0, 0, crankPin).rotation.x = Math.PI / 2;
    K.box(0.5, 1.2, 0.5, M.ironM, 12.6, -9.3, 5.7, mech); K.cyl(0.18, 0.18, 0.7, M.brass, 8, 12.6, -8.4, 5.9, mech).rotation.x = Math.PI / 2;
    const cylG = K.group(mech, 15.4, -8.4, fwZ + 0.18); const cy = K.cyl(0.32, 0.32, 1.3, M.copper, 12, 0, 0, 0, cylG); cy.rotation.z = Math.PI / 2; for (const xx of [-0.6, 0, 0.6]) { const b = K.cyl(0.35, 0.35, 0.07, M.brassD, 12, xx, 0, 0, cylG); b.rotation.z = Math.PI / 2; }
    K.box(1.6, 0.3, 0.6, M.ironM, 15.4, -8.85, fwZ - 0.1, mech);
    const rod = K.box(1, 0.1, 0.1, M.ironL, 0, 0, 0, mechA); rod.position.z = fwZ + 0.3;
    const piston = K.box(0.7, 0.12, 0.12, M.brassL, 14.6, -8.4, fwZ + 0.18, mechA);
    // cooling fans set into the rock
    const fans = [];
    for (const [x, y, r] of [[-11.8, -3.6, 0.85], [9.6, -3.0, 0.68], [-3.6, -12.2, 0.7]]) {
      const z = zFrontAt(y) + 0.12;
      const h = K.group(mech, x, y, z);
      K.torus(r, 0.1, M.ironL, 6, 24, 0, 0, 0, h);
      const bk = K.cyl(r, r, 0.06, M.black, 20, 0, 0, -0.08, h); bk.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) K.box(r * 2, 0.04, 0.04, M.ironM, 0, -r + 0.2 + i * (r * 2 - 0.4) / 4, 0.1, h);
      const bl = K.group(mechA, x, y, z + 0.02);
      for (let i = 0; i < 4; i++) { const b = K.box(r * 0.9, 0.16, 0.03, M.brassD, r * 0.45, 0, 0, K.group(bl)); b.parent.rotation.z = i * Math.PI / 2; b.rotation.x = 0.5; }
      K.cyl(0.12, 0.12, 0.08, M.brass, 8, 0, 0, 0.06, bl).rotation.x = Math.PI / 2;
      K.bake(bl); fans.push({ bl, x, y, z, r });
    }

    // ---------------------------------------------------------------- PIPES down the rock + steam vents
    const pipes = K.group(statics);
    K.tube([[10.6, -1.7, 7.8], [10.8, -2.8, 7.45], [12.0, -3.2, 7.45], [12.9, -3.15, 7.5]], 0.12, M.copper, pipes, 16, 6);
    K.tube([[-12.8, -1.75, 7.75], [-12.8, -3.5, 7.2], [-13.2, -5.2, 6.95]], 0.1, M.copperD, pipes, 14, 6);
    K.tube([[15.6, -1.8, 7.7], [15.7, -4.8, 7.0], [15.8, -7.6, 6.6], [15.5, -8.2, 6.45]], 0.13, M.verd, pipes, 18, 6);
    K.tube([[-3.0, -1.9, 7.75], [-2.6, -4.2, 7.0], [-2.4, -6.0, 6.45]], 0.09, M.copper, pipes, 12, 5);
    const pg = K.group(pipes, 15.75, -5.5, 7.05);
    { const rim = K.cyl(0.24, 0.24, 0.08, M.brass, 14, 0, 0, 0, pg); rim.rotation.x = Math.PI / 2; const f = K.cyl(0.2, 0.2, 0.09, K.mat(0xd8c8a0), 14, 0, 0, 0.01, pg); f.rotation.x = Math.PI / 2; }
    const gaugeN = K.group(anim, 15.75, -5.5, 7.12); K.box(0.03, 0.16, 0.02, K.mat(0x1a0c06), 0, 0.07, 0, gaugeN);
    const vents = [[-16.2, -3.3, 7.25], [5.8, -6.8, 5.4], [-4.4, -8.0, 5.4], [11.0, -12.0, 4.9], [-11.0, -12.6, 4.8]];
    for (const [x, y, z] of vents) { const v = K.group(pipes, x, y, z); K.cyl(0.2, 0.24, 0.3, M.ironM, 8, 0, 0, 0, v).rotation.x = Math.PI / 2; for (let i = 0; i < 3; i++) K.box(0.36, 0.04, 0.05, M.soot, 0, -0.1 + i * 0.1, 0.16, v); }

    // ---------------------------------------------------------------- HOISTS + CARGO AIRSHIP
    const hst = K.group(statics), hstA = K.group(anim);
    // jib hoist under the right end of the slab
    K.box(0.24, 0.24, 2.8, M.rust, 16.3, -1.95, 9.0, hst); K.box(0.1, 1.2, 0.1, M.iron, 16.3, -2.4, 7.9, hst).rotation.x = -0.9;
    const jibBeaconM = K.mat(0x401010, { e: 0 }); K.sph(0.1, jibBeaconM, 16.3, -1.75, 10.35, hst, 6, 4);
    const jibTrolley = K.group(hstA, 16.3, -2.15, 9.6); K.box(0.36, 0.18, 0.4, M.brassD, 0, 0, 0, jibTrolley);
    const jibChain = chainBar(K, jibTrolley, 0, -0.1, -1.1, 0, 0.06);
    const jibLoad = K.group(jibTrolley, 0, -1.4, 0); K.box(0.7, 0.55, 0.6, M.woodD, 0, -0.2, 0, jibLoad); for (const x of [-0.28, 0.28]) K.box(0.06, 0.57, 0.62, M.ironM, x, -0.2, 0, jibLoad); K.box(0.06, 0.4, 0.06, M.iron, 0, 0.2, 0, jibLoad); K.bake(jibLoad);
    // airship docked under the gallery
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
    sign(K, ship, 'SHIPTORIO', '#ffc070', 0.3, -1.12, 0.33, 0.22);
    { const pp = props.map((b) => b.parent); pp.forEach((x) => ship.remove(x)); K.bake(ship); pp.forEach((x) => ship.add(x)); props.forEach((b) => K.bake(b)); }
    // mooring lines up to the gallery
    const moor = [[7.6, 7.7], [9.5, 7.7]].map(([x, z]) => { const m = K.box(0.03, 1, 0.03, M.soot, 0, 0, 0, hstA); return { m, x, z }; });
    // crane on the gallery front lowering crates down to the gondola
    const crX = 9.3;
    K.box(0.22, 0.22, 2.2, M.rust, crX, deckTop - 0.25, 8.75, hst); const cb = K.box(0.1, 1.4, 0.1, M.iron, crX, deckTop - 0.85, 8.1, hst); cb.rotation.x = -0.7;
    const crTrolley = K.group(hstA, crX, deckTop - 0.45, 9.6); K.box(0.3, 0.16, 0.36, M.brassD, 0, 0, 0, crTrolley);
    const crChain = chainBar(K, crTrolley, 0, -0.1, -1.1, 0, 0.05);
    const crLoad = K.group(crTrolley, 0, -1.2, 0); K.box(0.5, 0.42, 0.44, M.woodD, 0, -0.2, 0, crLoad); K.box(0.52, 0.06, 0.46, M.brass, 0, 0.02, 0, crLoad); K.bake(crLoad);

    // ---------------------------------------------------------------- CAGE LANTERNS, KEEL ROOTS + CHAINS
    const lan = K.group(anim);
    const lanterns = [];
    for (const [x, y0, z, L] of [[-11.4, deckTop - 0.3, 7.5, 1.6], [-0.6, deckTop - 0.3, 7.5, 2.2], [9.0, deckTop - 0.3, 7.5, 1.4], [-6.2, lowTop - 0.3, 5.7, 1.8], [1.8, lowTop - 0.3, 5.7, 1.2], [11.2, -1.9, 7.9, 2.4], [-9.8, -1.9, 7.9, 1.8]]) {
      const piv = K.group(lan, x, y0, z);
      chainBar(K, piv, 0, 0, -L, 0, 0.04);
      const c = K.group(piv, 0, -L - 0.2, 0);
      K.box(0.26, 0.04, 0.26, M.brassD, 0, 0.18, 0, c); K.box(0.26, 0.04, 0.26, M.brassD, 0, -0.18, 0, c);
      for (const sx of [-0.12, 0.12]) for (const sz of [-0.12, 0.12]) K.box(0.03, 0.36, 0.03, M.iron, sx, 0, sz, c);
      const fl = K.box(0.14, 0.22, 0.14, K.glow(0xffb050), 0, 0, 0, c);
      K.bake(piv); lanterns.push({ piv, fl, ph: rr() * 6 });
    }
    const keel = K.group(statics), keelA = K.group(anim);
    keelBottoms.filter((k) => k[1] < -17).forEach((k, i) => {
      if (i % 2) return;
      const [x, y, z] = k; const L = 2 + rr() * 3;
      K.tube([[x, y + 0.3, z + 0.3], [x + R() * 0.8, y - L * 0.4, z + 0.5], [x + R() * 1.4, y - L, z + 0.4 + R() * 0.6]], 0.08 + rr() * 0.08, rr() < 0.5 ? M.rust : M.ironM, keel, 10, 5);
    });
    const keelChains = [];
    keelBottoms.filter((k) => k[1] < -15).slice(0, 12).forEach((k, i) => {
      if (i % 3) return;
      const piv = K.group(keelA, k[0], k[1] + 0.1, k[2] + 0.5); const L = 2 + rr() * 2.5;
      chainBar(K, piv, 0, 0, -L, 0, 0.06);
      const hook = K.torus(0.16, 0.04, M.ironL, 4, 10, 0, -L - 0.15, 0, piv, Math.PI * 1.4);
      K.bake(piv); keelChains.push({ piv, ph: rr() * 6 });
    });

    // ---------------------------------------------------------------- LIGHTS (3)
    const lMolten = K.light(0xff7a2a, 2.4, 13, 13.4, -6.6, 9.6, root);
    const lGallery = K.light(0xffb070, 2.2, 19, -3.0, -8.0, 9.8, root);
    K.bake(wall);
    const lAether = K.light(0x5af0d0, 1.1, 8, -7.0, -5.4, 8.4, root);

    // no slab shadows down here (it would black everything out); only the headframe above the deck casts
    [statics, anim].forEach((grp) => grp.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; } }));
    lift.traverse((o) => { if (o.isMesh && o.position.y > 0.3) o.castShadow = true; });
    // bake everything static
    K.bake(rockG); K.bake(sof); K.bake(gal); K.bake(lift); K.bake(low); K.bake(cw); K.bake(ae); K.bake(fur); K.bake(mech); K.bake(pipes); K.bake(hst); K.bake(keel);

    // ---------------------------------------------------------------- UPDATE
    const railP = ctx.paths.rail, liftP = ctx.paths.lift;
    let liftV = 0, chainOff = 0, tDrip = 0, tVent = 0, tSlag = 0, tLand = 0, lastLoad = -1;
    const seenLift = new Set();
    const v = new T.Vector3(), crank = new T.Vector3();
    return { update(t, dt) {
      // ---- carts: wheels roll with distance travelled
      railP.items.forEach((it) => {
        const cm = it.carrierMeshes && it.carrierMeshes.cart; if (!cm) return;
        const ls = cm.userData.ls === undefined ? it.s : cm.userData.ls; const ds = it.s - ls; cm.userData.ls = it.s;
        cm.userData.wheels.forEach((w) => (w.rotation.z -= ds / 0.1));
        if (ds > 0.001 && Math.random() < 0.04) K.spawn(root, it.mesh.position.x + R() * 0.4, -9.85, it.mesh.position.z + R() * 0.3, R() * 0.6, 0.6 + Math.random(), R() * 0.4, Math.random() < 0.5 ? 0xffc060 : 0xfff0c0, 0.35, 0.035, 5, true);
      });
      // ---- lift: cages square to the shaft; chain, wheels and returning cages move with the line
      liftP.items.forEach((it) => {
        const cm = it.carrierMeshes && it.carrierMeshes.cage; if (cm) cm.rotation.y = -it.mesh.rotation.y;
        if (!seenLift.has(it)) { seenLift.add(it); for (let i = 0; i < 6; i++) puff(K, root, LX, -9.6, LZ, 0x8a7a68, 0.14, 0.4, 0.5, 1.2); lastLoad = t; }
      });
      seenLift.forEach((it) => { if (it.path !== liftP) seenLift.delete(it); });
      const stuck = liftP.items.some((it) => it.atEnd);
      liftV += ((stuck ? 0 : liftP.speed) - liftV) * Math.min(1, dt * 4);
      chainOff += liftV * dt;
      chUp.userData.tex.offset.y = -chainOff * 5 / (TOPY - BOTY) * 0 - chainOff * 1.0;
      chDn.userData.tex.offset.y = chainOff * 1.0;
      topW.rotation.z -= liftV * dt / WR; botW.rotation.z -= liftV * dt / WR;
      sheaves.forEach((s, i) => (s.rotation.z += (i ? 1 : -1) * liftV * dt / 0.72));
      const span = TOPY - BOTY;
      downCages.forEach((d) => { const y = TOPY - ((d.o + chainOff) % (8 * 1.75)); d.c.visible = y > BOTY && y < TOPY - 0.8; d.c.position.y = y - 0.9; });
      beaconM.emissive.setHex(Math.sin(t * 5) > 0.3 ? 0xff2a10 : 0);
      liftSign.color.setHex(stuck ? (Math.sin(t * 8) > 0 ? 0xffffff : 0x806040) : 0xc8c8c8);
      shaftLamps.forEach((L) => { const near = liftP.items.some((it) => Math.abs(it.mesh.position.y - L.y) < 0.8); L.m.emissive.setHex(near ? 0xffc040 : stuck ? (Math.sin(t * 6) > 0 ? 0xff3010 : 0) : 0x3a2408); });
      landLampM.emissive.setHex(t - lastLoad < 0.8 ? 0x40ff70 : railP.items.length ? 0x1a4a20 : 0x0a1a0c);
      // ---- mine mouths flash on spawn
      for (const src in mines) {
        const m = mines[src]; m.flash = Math.max(0, m.flash - dt * 1.2);
        const f = 0.55 + m.flash * 0.45 + Math.sin(t * 2.2 + m.mx) * 0.05;
        m.inner.color.setHex(m.col).multiplyScalar(f);
        m.back.scale.setScalar(1 + m.flash * 1.4 + Math.sin(t * 3 + m.mx) * 0.08);
        m.sm.color.setScalar(0.72 + m.flash * 0.6);
        m.lampM.emissive.setHex(m.col); m.lampM.emissive.multiplyScalar(0.35 + m.flash * 0.65 + (Math.sin(t * 4 + m.mx) > 0.6 ? 0.2 : 0));
      }
      // ---- lamps flicker
      const fl = 0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.06;
      galLamps.forEach((l, i) => l.material.color.setRGB(1, 0.72 * (fl + Math.sin(t * 9 + i) * 0.05), 0.38));
      wallLamps.forEach((l, i) => l.material.color.setRGB(1, 0.66 * (fl + Math.sin(t * 7 + i * 3) * 0.06), 0.34));
      bulbs.forEach((b, i) => b.material.color.setRGB(1, 0.75 * (0.9 + Math.sin(t * 11 + i * 2) * 0.1), 0.44));
      if (!lGallery.isDummy) lGallery.intensity = 2.2 * fl;
      lanterns.forEach((L) => { L.piv.rotation.z = Math.sin(t * 0.9 + L.ph) * 0.08; L.piv.rotation.x = Math.sin(t * 0.7 + L.ph * 1.3) * 0.05; L.fl.material.color.setRGB(1, 0.7 * fl, 0.32); });
      keelChains.forEach((c) => { c.piv.rotation.z = Math.sin(t * 0.6 + c.ph) * 0.12; });
      // ---- molten streams
      tSlag -= dt;
      streams.forEach((s, i) => {
        const w = 0.85 + Math.sin(t * 17 + i) * 0.12 + Math.random() * 0.08;
        s.core.scale.x = s.core.scale.z = w; s.outer.scale.x = s.outer.scale.z = 1.05 - (w - 0.85);
        s.outer.material.opacity = 0.42 + Math.sin(t * 9 + i) * 0.08;
        s.mouth.material.color.setRGB(1, 0.5 + Math.sin(t * 7 + i) * 0.08, 0.14);
        if (tSlag <= 0) { K.spawn(root, s.spout[0] + R() * 0.2, s.spout[1] - Math.random() * s.len * 0.8, s.spout[2] + R() * 0.2, R() * 0.6, -2 - Math.random() * 3, R() * 0.6, Math.random() < 0.5 ? 0xffd070 : 0xff7a2a, 0.9, 0.06 + Math.random() * 0.05, 6, true); }
      });
      if (tSlag <= 0) tSlag = 0.05;
      if (!lMolten.isDummy) lMolten.intensity = 2.4 * (0.85 + Math.sin(t * 8) * 0.08 + Math.random() * 0.06);
      kfGlow.forEach((g, i) => g.material.color.setRGB(1, 0.42 + Math.sin(t * 6 + i) * 0.08, 0.1));
      // ---- gears, flywheel + piston, fans, winch
      gA.rotation.y += dt * 0.35; gB.rotation.y -= dt * 0.35 * 1.6 / 0.85;
      fw.rotation.z -= dt * 2.4;
      crankPin.getWorldPosition(crank); root.worldToLocal(crank);
      const pinX = crank.x, pinY = crank.y; const crossX = 14.3 + (pinX - 12.6) * 0.0; const cx = pinX + Math.sqrt(Math.max(0.01, 2.2 * 2.2 - (pinY + 8.4) ** 2));
      rod.position.set((pinX + cx) / 2, (pinY - 8.4) / 2, fwZ + 0.3); rod.scale.x = Math.hypot(cx - pinX, -8.4 - pinY); rod.rotation.z = Math.atan2(-8.4 - pinY, cx - pinX);
      piston.position.x = cx + 0.35;
      fans.forEach((f, i) => (f.bl.rotation.z += dt * (6 + i * 2)));
      drum.rotation.x += dt * 1.2;
      gaugeN.rotation.z = -0.4 + Math.sin(t * 1.7) * 0.5;
      // ---- aether vein pulses
      pulses.forEach((p) => { p.u = (p.u + dt * 0.45) % 1; const q = condCurve.getPoint(p.u); p.m.position.copy(q); p.m.scale.setScalar(0.8 + Math.sin(t * 9 + p.u * 10) * 0.25); });
      if (!lAether.isDummy) lAether.intensity = 1.0 + Math.sin(t * 2.4) * 0.2;
      if (Math.random() < 0.06) { const c = crys[Math.floor(Math.random() * crys.length)]; K.spawn(root, c[0], c[1], c[2] + 0.3, R() * 0.4, 0.3 + Math.random() * 0.5, 0.3, 0xbffff0, 1.0, 0.05, 0, true); }
      // ---- automatons walk their beats
      bots.forEach((b) => {
        const L = b.x1 - b.x0, ph = (t * b.sp / L + b.ph) % 2, fwd = ph < 1, k = fwd ? ph : 2 - ph;
        const x = b.x0 + K.smooth(k) * L; b.a.g.position.set(x, b.y, b.z); b.a.g.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2;
        const sw = Math.sin(t * 7 + b.ph) * 0.5; b.a.legs[0].rotation.x = sw; b.a.legs[1].rotation.x = -sw; b.a.arms[0].rotation.x = -sw * 0.6; b.a.arms[1].rotation.x = sw * 0.6;
        b.a.eye.material.color.setHex(Math.sin(t * 3 + b.ph) > 0.92 ? 0xffffff : 0xffc070);
      });
      // level-2 cart shuttles, pushed by its automaton
      const lp = (t * 0.07) % 2, lk = K.smooth(lp < 1 ? lp : 2 - lp), lx = -7.6 + lk * 10.4;
      lowCart.position.x = lx; lowCart.userData.wheels.forEach((w) => (w.rotation.z = -lx / 0.1));
      lowBot.g.position.set(lx + (lp < 1 ? -0.7 : 0.7), lowTop, 5.2); lowBot.g.rotation.y = lp < 1 ? Math.PI / 2 : -Math.PI / 2;
      { const sw = Math.sin(t * 6) * 0.45; lowBot.legs[0].rotation.x = sw; lowBot.legs[1].rotation.x = -sw; lowBot.arms[0].rotation.x = lowBot.arms[1].rotation.x = -1.2; }
      // ---- hoists + airship
      const jy = Math.sin(t * 0.35) * 0.5 + 0.5; jibChain.scale.y = 1 + jy * 2.4; jibChain.position.y = -0.1 - (1 + jy * 2.4) * 0.5; jibLoad.position.y = -1.3 - jy * 2.4; jibLoad.rotation.y = Math.sin(t * 0.5) * 0.3;
      jibBeaconM.emissive.setHex(Math.sin(t * 4 + 1) > 0.4 ? 0xff2a10 : 0);
      ship.position.y = SHIP_Y + Math.sin(t * 0.6) * 0.14; ship.rotation.z = Math.sin(t * 0.45) * 0.02;
      props.forEach((p) => (p.rotation.x += dt * 9));
      shipBeacon.emissive.setHex(Math.sin(t * 3) > 0.5 ? 0xff3a20 : 0);
      moor.forEach((m) => { const top = deckTop - 0.35, bot = ship.position.y + 0.7, h = top - bot; m.m.position.set(m.x, bot + h / 2, (m.z + 9.6) / 2); m.m.scale.y = Math.hypot(h, 9.6 - m.z); m.m.rotation.x = Math.atan2(9.6 - m.z, h) * -1; });
      const cyc = (t * 0.12) % 1; const drop = cyc < 0.7 ? K.smooth(cyc / 0.7) : 1 - K.smooth((cyc - 0.7) / 0.3);
      const dropLen = 1 + drop * (Math.max(0.5, (deckTop - 0.45) - (ship.position.y - 1.15 + 0.6)) - 1.1);
      crChain.scale.y = dropLen; crChain.position.y = -0.1 - dropLen / 2; crLoad.position.y = -0.2 - dropLen; crLoad.visible = cyc < 0.72;
      // ---- drips, steam, vents
      tDrip -= dt; if (tDrip <= 0) { tDrip = 0.12; const d = tips[Math.floor(Math.random() * tips.length)]; K.spawn(root, d[0], d[1], d[2], 0, -0.5, 0, Math.random() < 0.7 ? 0x0a0806 : 0x6ad8c8, 1.6, 0.05, 7); }
      tVent -= dt; if (tVent <= 0) { tVent = 0.18; const vv = vents[Math.floor(Math.random() * vents.length)]; for (let i = 0; i < 2; i++) puff(K, root, vv[0], vv[1], vv[2] + 0.3, 0xa89c88, 0.16, 0.8, 0.2, 1.8); }
      if (Math.random() < 0.08) { const vv = valves[Math.floor(Math.random() * valves.length)]; K.spawn(root, vv[0], vv[1], vv[2], 0, -0.4, 0, 0x0a0806, 1.2, 0.05, 6); }
      if (Math.random() < 0.15) fans.forEach((f) => K.spawn(root, f.x + R() * f.r, f.y + R() * f.r, f.z + 0.3, R() * 0.3, 0.5, 0.5, 0x9a8a78, 1.0, 0.08, -0.1));
    } };
  });
})();
