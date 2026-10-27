// =====================================================================
// MINE (the shaft) — everything under the build deck. MINE agent.
// The CLIFF (front face z ~7.4, from the quarry floor at y -16 up to the build slab at y -1.4) in the Black Iron
// underside stone, two recessed mine GALLERIES with the four tunnel mouths (GITHUB + INBOX up top, SENTRY +
// POSTHOG lower), cart turntables + rotary dumpers + EMPTIES sidings, the zig-zag CHUTES down the face (the
// cascade), the QUARRY FLOOR with the COLLECTOR belt, the floating keel below it (stalactites, chains, a glow from
// deep below), and the ORE LIFT (a paternoster in an iron headframe up to the build deck).
// Carriers: 'cart' (the mine cart) and 'cage' (the ore lift + the launch freight lift).
// Ported from docs/art/black-iron/modules/underside.js: same kit, palette, textures and density of detail.
// NOTES:
//  - Only +z / +y faces are ever seen (the camera looks at the front, 30deg down): backs and undersides are skipped.
//  - Each tunnel ends at a black void plane just in front of the cart's emerge start (TUNNEL_DEPTH inside), so carts
//    roll out of the dark. On 'carrierDrop' the empty cart is clamped in the rotary dumper, tipped toward the chute,
//    then rolls on through the gate into its EMPTIES siding tunnel (never back across the incoming track, so bursts
//    of new carts can't collide with it). Empty cages ride a paternoster loop (up, over, down the left column).
//  - Ore tumbles end over end while it rides a mine chute (the cascade); corners splash grit + glints.
// =====================================================================
import { TUNNEL_DEPTH } from '../layout.js';

const css = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

export default function install(IRON) {
  const C = {
    soot: 0x1e1915, iron: 0x40372f, ironM: 0x352d27, ironL: 0x5e5246, ironXL: 0x7a6c5e,
    brass: 0xb08440, brassD: 0x6e5022, brassL: 0xdcae5c,
    copper: 0xa65a36, copperD: 0x703a22, verd: 0x3e8e74,
    rust: 0x8e4624, rustL: 0xb4642e, wood: 0x664628, woodD: 0x48331e, woodL: 0x84603a,
    teal: 0x7af0d8, ember: 0xff7a2a, gas: 0xffc070
  };
  let M = null;
  function mats(K) {
    if (M) return M;
    M = {
      iron: K.mat(C.iron, { shine: 24, spec: 0x2c2a2a }), ironM: K.mat(C.ironM, { shine: 16, spec: 0x222020 }),
      ironL: K.mat(C.ironL, { shine: 34, spec: 0x4a4644 }), ironXL: K.mat(C.ironXL, { shine: 30, spec: 0x44444a }),
      soot: K.mat(C.soot, { flat: true }), brass: K.mat(C.brass, { shine: 40, spec: 0x7a5a28 }), brassD: K.mat(C.brassD, { shine: 20, spec: 0x3a2a10 }),
      brassL: K.mat(C.brassL, { shine: 50, spec: 0x9a7a40 }), copper: K.mat(C.copper, { shine: 34, spec: 0x6a3a20 }),
      copperD: K.mat(C.copperD, { shine: 20, spec: 0x3a1a0a }), verd: K.mat(C.verd, { shine: 20, spec: 0x2a4a40 }),
      rust: K.mat(C.rust, { flat: true }), rustL: K.mat(C.rustL, { flat: true }), wood: K.mat(C.wood, { flat: true }),
      woodD: K.mat(C.woodD, { flat: true }), woodL: K.mat(C.woodL, { flat: true }),
      hazard: K.mat(0xd09a18, { flat: true }), black: K.mat(0x0c0a08, { flat: true }), rail: K.mat(0x8a8078, { shine: 60, spec: 0x8a8a8a }),
      railR: K.mat(0x5a4032, { shine: 10, spec: 0x2a2018 }), stone: K.mat(0x6a5c4e, { flat: true }), stoneD: K.mat(0x4a4036, { flat: true }),
      void: K.glow(0x050302), gas: K.glow(C.gas), ember: K.glow(C.ember),
      tealCrys: K.mat(0x3ac8b0, { e: 0x18a088, ei: 1, shine: 60, spec: 0xffffff }),
      tealPipe: K.mat(0x2a6a60, { e: 0x0a3a32, shine: 40, spec: 0x80fff0 }),
      water: K.mat(0x1a2e2c, { shine: 90, spec: 0x80a0a0, e: 0x081412 }),
      oil: K.mat(0x16141a, { shine: 120, spec: 0xb0a0d0 }),
      grime: K.mat(0x080605, { op: 0.4, depthWrite: false }), weep: K.mat(0x6a2a10, { op: 0.35, depthWrite: false }),
      ao: K.mat(0x050302, { op: 0.4, depthWrite: false }), web: K.mat(0x9a948a, { op: 0.3, depthWrite: false }),
      cageLamp: K.glow(0xffb040), red: K.mat(0xa02a1a, { flat: true }), cream: K.mat(0xd8c8a0, { flat: true }),
      plaque: {}
    };
    return M;
  }
  const plaqueMat = (K, col) => M.plaque[col] || (M.plaque[col] = K.mat(col, { e: col, ei: 0.7 }));

  // ---------- signs: Silkscreen (crisp, thresholded) with a 3x5 pixel-font fallback, redrawn once the font loads ----------
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101',
    N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', '0': '111101101101111',
    '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '!': '010010010000010', '-': '000000111000000', ' ': '000000000000000'
  };
  const fontOK = () => !!(typeof document !== 'undefined' && document.fonts && document.fonts.check && document.fonts.check('400 8px Silkscreen'));
  function signTexture(K, text, fg, bg) {
    const T = K.THREE;
    const c = document.createElement('canvas');
    const ok0 = fontOK();
    let tw = Math.ceil(text.length * 5.4);
    if (ok0) { const m = c.getContext('2d'); m.font = '400 8px Silkscreen'; tw = Math.ceil(m.measureText(text).width); }
    c.width = tw + 6; c.height = 12;
    const f = new T.Color(fg), b = new T.Color(bg === undefined ? 0x0c0806 : bg);
    const tex = new T.CanvasTexture(c); tex.magFilter = tex.minFilter = T.NearestFilter; tex.generateMipmaps = false;
    const paint = (useFont) => {
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff';
      if (useFont) { g.font = '400 8px Silkscreen'; g.textBaseline = 'alphabetic'; const w = g.measureText(text).width; g.fillText(text, Math.round((c.width - w) / 2), 9); }
      else { const x0 = Math.round((c.width - (text.length * 4 - 1)) / 2); for (let i = 0; i < text.length; i++) { const gl = FONT[text[i]] || FONT[' ']; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (gl[r * 3 + k] === '1') g.fillRect(x0 + i * 4 + k, 4 + r, 1, 1); } }
      const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const on = d[i] > 110; d[i] = on ? f.r * 255 : b.r * 255; d[i + 1] = on ? f.g * 255 : b.g * 255; d[i + 2] = on ? f.b * 255 : b.b * 255; d[i + 3] = 255; }
      const edge = (x, y) => { const i = (y * c.width + x) * 4; d[i] = f.r * 115; d[i + 1] = f.g * 115; d[i + 2] = f.b * 115; };
      for (let x = 0; x < c.width; x++) { edge(x, 0); edge(x, c.height - 1); }
      for (let y = 0; y < c.height; y++) { edge(0, y); edge(c.width - 1, y); }
      g.putImageData(img, 0, 0); tex.needsUpdate = true;
    };
    paint(ok0);
    if (!ok0 && typeof document !== 'undefined' && document.fonts && document.fonts.load) document.fonts.load('400 8px Silkscreen').then(() => { if (fontOK()) paint(true); }).catch(() => {});
    return tex;
  }
  // a lit sign board facing +z: iron frame, glowing pixel letters, brass corner bolts. Returns { face, w }.
  function sign(K, p, text, fg, x, y, z, h, o) {
    o = o || {};
    const tex = signTexture(K, text, fg, o.bg);
    const w = h * (tex.image.width / tex.image.height);
    const face = new K.THREE.MeshBasicMaterial({ map: tex, color: o.tint === undefined ? 0xc8c8c8 : o.tint, fog: false });
    K.box(w + 0.14, h + 0.14, 0.08, M.ironM, x, y, z - 0.03, p);
    K.box(w, h, 0.06, [M.iron, M.iron, M.iron, M.iron, face, M.iron], x, y, z + 0.02, p);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) K.box(0.07, 0.07, 0.04, M.brassL, x + sx * (w / 2 + 0.03), y + sy * (h / 2 + 0.03), z + 0.06, p);
    return { face, w };
  }

  // ---------- textures ----------
  // mottled cellular stone (world-space tiling): irregular plates with dark joints, a soft wavy stratum, grit
  function strataTex(K, seed, hewn) {
    return K.canvasTex(64, 64, (g) => {
      let s = seed; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const N = hewn ? 22 : 15, Pt = [];
      for (let i = 0; i < N; i++) Pt.push([r() * 64, r() * 64 * (hewn ? 1 : 0.8) + (hewn ? 0 : 6), 150 + Math.floor(r() * 70)]);
      const img = g.createImageData(64, 64), d = img.data;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        let d1 = 1e9, d2 = 1e9, tone = 180;
        for (const [px, py, tv] of Pt) { let dx = Math.abs(x - px), dy = Math.abs(y - py); dx = Math.min(dx, 64 - dx); dy = Math.min(dy, 64 - dy); const dd = Math.sqrt(dx * dx * (hewn ? 1 : 0.55) + dy * dy * (hewn ? 1 : 1.6)); if (dd < d1) { d2 = d1; d1 = dd; tone = tv; } else if (dd < d2) d2 = dd; }
        let v = tone + Math.sin((y + Math.sin(x * 0.2) * 2) * 0.2) * 8;
        if (d2 - d1 < 1.1) v = 66; else if (d2 - d1 < 2.2) v -= 28;
        if (d1 < 3.0) v += 14;
        v += (r() - 0.5) * 22;
        const i = (y * 64 + x) * 4; d[i] = v; d[i + 1] = v - 10; d[i + 2] = v - 22; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      if (hewn) for (let i = 0; i < 30; i++) { const x = Math.floor(r() * 62), yy = Math.floor(r() * 60); g.fillStyle = 'rgba(30,20,14,0.55)'; g.fillRect(x, yy, 1, 3); g.fillStyle = 'rgba(240,220,190,0.3)'; g.fillRect(x + 1, yy, 1, 2); }
    });
  }
  function plankTex(K) {
    return K.canvasTex(32, 16, (g) => {
      let s = 17; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#3e2c1a'; g.fillRect(0, 0, 32, 16);
      for (let y = 0; y < 16; y += 4) { let x = -Math.floor(r() * 10); while (x < 32) { const w = 9 + Math.floor(r() * 10); g.fillStyle = ['#6a4c2e', '#614428', '#70522f', '#5c4127'][Math.floor(r() * 4)]; g.fillRect(x, y, w - 1, 3); g.fillStyle = 'rgba(255,220,170,0.1)'; g.fillRect(x, y, w - 1, 1); x += w; } }
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.floor(r() * 28), Math.floor(r() * 14), 4, 2); }
    });
  }
  // quarry floor: packed grit with pebbles, cracks and the odd glint
  function gravelTex(K) {
    return K.canvasTex(64, 64, (g) => {
      let s = 4242; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#4e4034'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 300; i++) { const v = 62 + r() * 44; g.fillStyle = `rgb(${v + 14 | 0},${v + 2 | 0},${v - 10 | 0})`; g.fillRect(r() * 64 | 0, r() * 64 | 0, 1 + (r() * 3 | 0), 1 + (r() * 2 | 0)); }
      for (let i = 0; i < 64; i++) {
        const x = r() * 62 | 0, y = r() * 62 | 0, w = 2 + (r() * 3 | 0), h = 2 + (r() * 2 | 0), v = 108 + r() * 64;
        g.fillStyle = 'rgba(18,12,8,0.75)'; g.fillRect(x + 1, y + 1, w, h);
        g.fillStyle = `rgb(${v | 0},${v - 12 | 0},${v - 26 | 0})`; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,235,200,0.22)'; g.fillRect(x, y, w - 1, 1);
      }
      g.fillStyle = 'rgba(16,10,6,0.7)';
      for (let i = 0; i < 6; i++) { let x = r() * 64, y = r() * 64; for (let k = 0; k < 9; k++) { g.fillRect(x | 0, y | 0, 1, 1); x += (r() - 0.3) * 3; y += (r() - 0.5) * 3; } }
      for (let i = 0; i < 5; i++) { g.fillStyle = ['#ffb040', '#5aa8ff', '#ff4a3a', '#b88aff'][i % 4]; g.fillRect(r() * 64 | 0, r() * 64 | 0, 1, 1); }
    });
  }
  function beltTex(K) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#18130f'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#4a3f35'; g.fillRect(0, 1, 16, 14);
      g.fillStyle = '#8a7862'; g.fillRect(1, 1, 3, 14); g.fillRect(9, 1, 3, 14);
      g.fillStyle = '#b8a084'; g.fillRect(1, 1, 3, 1); g.fillRect(9, 1, 3, 1);
      g.fillStyle = '#0a0908'; g.fillRect(4, 1, 1, 14); g.fillRect(12, 1, 1, 14);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(6, 4, 2, 3); g.fillRect(14, 10, 2, 2); g.fillRect(5, 12, 3, 1);
      g.fillStyle = 'rgba(255,220,170,0.08)'; g.fillRect(6, 8, 2, 1);
    });
  }
  function hazardTex(K) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#16120c'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#e0a018';
      for (let i = -16; i < 32; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 4, 0); g.lineTo(i + 4 - 16, 16); g.lineTo(i - 16, 16); g.fill(); }
    });
  }
  let CHAIN = null;
  function chainTex(K) {
    if (CHAIN) return CHAIN;
    CHAIN = K.canvasTex(4, 8, (g) => { g.fillStyle = '#16120e'; g.fillRect(0, 0, 4, 8); g.fillStyle = '#7a6a58'; g.fillRect(1, 0, 2, 3); g.fillStyle = '#5a4c40'; g.fillRect(0, 4, 4, 1); g.fillRect(0, 7, 4, 1); g.fillStyle = '#9a8670'; g.fillRect(1, 0, 1, 1); });
    return CHAIN;
  }
  // a box whose UVs come from root coordinates, so a texture runs on across neighbouring boxes. S: scale or [sx, sy, sz]
  function worldBox(K, w, h, d, mat, x, y, z, p, S) {
    const [sx, sy, sz] = Array.isArray(S) ? S : [S, S, S];
    const geo = new K.THREE.BoxGeometry(w, h, d);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const X = pos.getX(i) + x, Y = pos.getY(i) + y, Z = pos.getZ(i) + z, nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
      if (ny > 0.5) uv.setXY(i, X / sx, Z / sz); else if (nx > 0.5) uv.setXY(i, Z / sz, Y / sy); else uv.setXY(i, X / sx, Y / sy);
    }
    return K.mesh(geo, mat, x, y, z, p);
  }
  // gear lying in xz (axis y): rotate x = PI/2 to face the camera, then spin .rotation.y
  function gear(K, p, r, thick, teeth, m, x, y, z) {
    const g = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.2, m, Math.sin(a) * r * 1.07, 0, Math.cos(a) * r * 1.07, g); tb.rotation.y = a; }
    K.cyl(r * 0.26, r * 0.26, thick * 1.6, M.ironM, 8, 0, 0, 0, g);
    if (r > 0.35) for (let i = 0; i < 3; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.12, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 3; }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(0.07, thick * 1.2, 0.07, M.brassL, Math.cos(a) * r * 0.82, 0, Math.sin(a) * r * 0.82, g); }
    K.bake(g);
    return K.dyn(g);
  }
  // spoked wheel facing +z (axis z): returns the spinning group (marked dyn)
  function wheel(K, p, r, m, x, y, z, spokes) {
    const hold = K.group(p, x, y, z);
    const w = K.dyn(K.group(hold));
    K.torus(r, Math.max(0.05, r * 0.08), m, 6, 24, 0, 0, 0, w);
    if (r > 0.5) K.torus(r * 0.8, 0.025, M.brassD, 4, 20, 0, 0, 0, w);
    for (let i = 0; i < (spokes || 6); i++) { const s = K.box(r * 2 * 0.96, 0.06, 0.06, M.ironL, 0, 0, 0, w); s.rotation.z = i * Math.PI / (spokes || 6); }
    const hub = K.cyl(r * 0.2, r * 0.2, 0.2, M.brass, 10, 0, 0, 0, w); hub.rotation.x = Math.PI / 2;
    K.bake(w);
    return w;
  }
  const band = (K, p, r, y, m, h) => K.cyl(r, r, h || 0.1, m || M.brass, 14, 0, y, 0, p);
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
  // little brass automaton (miners, crew). All moving parts are marked dyn.
  function automaton(K, p, x, y, z, s) {
    const g = K.dyn(K.group(p, x, y, z)); if (s) g.scale.setScalar(s);
    const body = K.group(g, 0, 0.36, 0);
    K.box(0.26, 0.3, 0.2, M.brass, 0, 0.1, 0, body); K.box(0.28, 0.06, 0.22, M.brassD, 0, 0.26, 0, body);
    K.cyl(0.07, 0.07, 0.22, M.copper, 8, 0, 0.08, -0.13, body).rotation.x = Math.PI / 2;
    const head = K.group(body, 0, 0.36, 0); K.sph(0.1, M.ironL, 0, 0, 0, head, 8, 6);
    const eye = K.box(0.12, 0.04, 0.04, K.glow(0xffc070), 0, 0.01, 0.09, head);
    K.cyl(0.02, 0.02, 0.1, M.ironL, 4, 0, 0.12, 0, head);
    const legs = [-0.07, 0.07].map((lx) => { const l = K.dyn(K.group(g, lx, 0.36, 0)); K.box(0.07, 0.34, 0.07, M.ironM, 0, -0.17, 0, l); K.box(0.09, 0.04, 0.13, M.ironM, 0, -0.34, 0.02, l); return l; });
    const arms = [-0.17, 0.17].map((ax) => { const a = K.dyn(K.group(body, ax, 0.22, 0)); K.box(0.05, 0.26, 0.05, M.brassD, 0, -0.13, 0, a); return a; });
    return { g, legs, arms, eye, head, body };
  }
  function pickaxe(K, arm) {
    const pk = K.group(arm, 0, -0.26, 0.02); pk.rotation.x = -0.4;
    K.box(0.035, 0.035, 0.5, M.woodD, 0, 0, 0.2, pk);
    const hd = K.box(0.32, 0.05, 0.05, M.ironL, 0, 0, 0.44, pk); hd.rotation.z = 0.15;
    return pk;
  }
  // a box from a to b (root points), square section s
  function strut(K, p, a, b, s, m) {
    const T = K.THREE; const va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]);
    const o = K.box(s, va.distanceTo(vb), s, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, p);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.sub(va).normalize());
    return o;
  }
  // a group at a, local +x pointing at b (core's yaw/pitch convention); returns [group, length]
  function along(K, p, a, b) {
    const g = K.group(p, a[0], a[1], a[2]);
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], hl = Math.hypot(dx, dz);
    g.rotation.order = 'YZX'; g.rotation.y = hl > 1e-4 ? Math.atan2(-dz, dx) : 0; g.rotation.z = Math.atan2(dy, hl);
    return [g, Math.hypot(dx, dy, dz)];
  }
  // two rails + sleepers along an [x, z] polyline at rail-centre height y
  function track(K, pts, y, p, o) {
    o = o || {};
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      const g = K.group(p, a[0], y, a[1]); g.rotation.y = Math.atan2(-dz, dx);
      for (const sz of [-0.28, 0.28]) { K.box(L + 0.04, 0.06, 0.06, o.rail || M.rail, L / 2, 0, sz, g); K.box(L + 0.04, 0.04, 0.1, M.ironM, L / 2, -0.05, sz, g); }
      if (!o.noSleepers) for (let x = o.ph === undefined ? 0.2 : o.ph; x < L; x += 0.5) K.box(0.14, 0.05, 0.8, o.sleeper || M.soot, x, -0.08, 0, g);
    }
  }
  const arc = (cx, cz, r, a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return out; };
  // polyline in x-z with arc-length lookup: pos + heading yaw (core convention)
  function polyline(pts) {
    const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-5) continue; segs.push({ a, b, l, L0: L, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) }); L += l; }
    return { L, at(u, out) { u = Math.max(0, Math.min(L, u)); let s = segs[0]; for (const q of segs) if (u >= q.L0) s = q; const k = Math.min(1, (u - s.L0) / s.l); out[0] = s.a[0] + (s.b[0] - s.a[0]) * k; out[1] = s.a[1] + (s.b[1] - s.a[1]) * k; out[2] = s.yaw; return out; } };
  }

  // =====================================================================
  // CARRIERS
  // =====================================================================
  // the mine cart: tub on a chassis, four wheels (marked dyn), a plaque in the mine's colour on both long sides
  function makeCart(K, col, o) {
    mats(K); o = o || {};
    const g = new K.THREE.Group();
    const body = K.group(g);
    const side = o.rusty ? M.rustL : M.rust, end = o.rusty ? M.ironM : M.iron;
    K.box(0.72, 0.05, 0.54, M.ironM, 0, -0.025, 0, body);
    for (const sx of [-1, 1]) { K.box(0.05, 0.3, 0.54, side, sx * 0.36, 0.13, 0, body); K.box(0.06, 0.04, 0.56, M.brassD, sx * 0.36, 0.29, 0, body); }
    for (const sz of [-1, 1]) { K.box(0.76, 0.3, 0.05, end, 0, 0.13, sz * 0.27, body); K.box(0.78, 0.04, 0.06, M.brassD, 0, 0.29, sz * 0.27, body); for (const rx of [-0.25, 0, 0.25]) K.box(0.04, 0.26, 0.02, M.ironL, rx, 0.13, sz * 0.3, body); }
    if (col !== null && col !== undefined) { const pm = plaqueMat(K, col); K.box(0.2, 0.12, 0.02, pm, 0.12, 0.15, 0.305, body); K.box(0.2, 0.12, 0.02, pm, -0.12, 0.15, -0.305, body); }
    K.box(0.6, 0.08, 0.4, M.soot, 0, -0.09, 0, body);
    K.box(0.12, 0.05, 0.05, M.ironL, 0.42, -0.1, 0, body); K.box(0.12, 0.05, 0.05, M.ironL, -0.42, -0.1, 0, body);
    const wheels = [];
    for (const wx of [-0.22, 0.22]) for (const wz of [-0.25, 0.25]) { const w = K.dyn(K.group(g, wx, -0.2, wz)); const c = K.cyl(0.1, 0.1, 0.06, M.ironL, 8, 0, 0, 0, w); c.rotation.x = Math.PI / 2; K.box(0.17, 0.03, 0.065, M.brassD, 0, 0, 0, w); wheels.push(w); }
    K.bake(body);
    g.userData.wheels = wheels;
    g.traverse((m) => { if (m.isMesh) { m.receiveShadow = false; m.castShadow = false; } });
    return g;
  }
  // the lift cage: open on +x (the collector feeds in) and -z (out onto the belt), bars on -x, a gate bar on +z
  function makeCage(K) {
    mats(K);
    const g = new K.THREE.Group();
    K.box(0.84, 0.05, 0.84, M.ironM, 0, -0.025, 0, g); K.box(0.88, 0.04, 0.88, M.soot, 0, -0.07, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 1.04, 0.05, M.brassD, sx * 0.4, 0.5, sz * 0.4, g);
    for (const sz of [-1, 1]) K.box(0.84, 0.05, 0.05, M.brass, 0, 1.0, sz * 0.4, g);
    for (const sx of [-1, 1]) K.box(0.05, 0.05, 0.84, M.brass, sx * 0.4, 1.0, 0, g);
    K.box(0.88, 0.03, 0.88, M.iron, 0, 1.04, 0, g);
    for (let i = 0; i < 4; i++) K.box(0.02, 0.96, 0.02, M.ironL, -0.4, 0.5, -0.27 + i * 0.18, g);
    K.box(0.02, 0.04, 0.84, M.ironL, -0.4, 0.55, 0, g);
    K.box(0.84, 0.05, 0.03, M.hazard, 0, 0.72, 0.41, g);
    for (let i = 0; i < 4; i++) K.box(0.08, 0.052, 0.035, M.soot, -0.3 + i * 0.2, 0.72, 0.415, g);
    K.box(0.06, 0.32, 0.06, M.ironL, 0, 1.2, 0, g); K.torus(0.08, 0.025, M.ironL, 4, 10, 0, 1.38, 0, g);
    K.box(0.06, 0.06, 0.42, M.ironM, 0, 0.9, -0.62, g); // hanger arm back to the chain
    K.box(0.12, 0.08, 0.1, M.cageLamp, 0.3, 1.1, 0.34, g);
    g.traverse((m) => { if (m.isMesh) { m.receiveShadow = false; m.castShadow = false; } });
    K.bake(g);
    return g;
  }
  IRON.carrier('cart', (K, item) => makeCart(K, item.parts ? item.parts.src : 0xffb040));
  IRON.carrier('cage', (K) => makeCage(K));

  // =====================================================================
  // UNDERSIDE (the mine)
  // =====================================================================
  IRON.underside((K, root, ctx) => {
    mats(K);
    const T = K.THREE, V3 = T.Vector3;
    const P = ctx.paths;
    const statics = K.group(root); statics.name = 'mine';
    const anim = K.group(root); anim.name = 'mine-anim';
    let seedS = 1234; const rr = () => { seedS = (seedS * 16807) % 2147483647; return (seedS - 1) / 2147483646; };
    const R = () => rr() - 0.5;
    const RND = K.R; // Math.random based (runtime fx)
    const TM = ctx.tiers.mine;
    const TOP = -1.4;                    // build slab bottom
    const FLOOR = TM.y + 0.1;            // quarry floor top
    const QX0 = TM.x0, QX1 = TM.x1, QZ1 = TM.z1;
    const ZB = 5.9;                      // gallery back wall
    const MINES = ctx.mines;
    const SRCS = Object.keys(MINES).filter((s) => P['cart-' + s] && P['chute-' + s]);
    const live = (src) => !P['cart-' + src].ghost;
    const HZ = K.mat(0xffffff, { map: hazardTex(K) });
    const PLANK = K.mat(0xffffff, { map: plankTex(K), e: 0x0c0804 });
    const PLANKD = K.mat(0x9a8a7a, { map: plankTex(K), e: 0x050302 });
    const GRAVEL = K.mat(0xffffff, { map: gravelTex(K) });
    const sedA = strataTex(K, 91), sedB = strataTex(K, 4447), hewn = strataTex(K, 777, true);
    const pulseSet = []; // materials that flicker with the gallery lamps

    // ------------------------------------------------------------ rows + galleries
    const rowY = {}; SRCS.forEach((s) => (rowY[MINES[s].row] = MINES[s].y));
    const rows = Object.keys(rowY).map(Number).sort((a, b) => a - b);
    const yU = rowY[rows[0]], yL = rows.length > 1 ? rowY[rows[1]] : yU - 4.5;
    const chuteSpan = (src) => { const pts = P['chute-' + src].points; let a = 1e9, b = -1e9; for (let i = 1; i < pts.length; i++) { a = Math.min(a, pts[i][0]); b = Math.max(b, pts[i][0]); } return [a - 0.5, b + 0.45]; };
    const GAL = [];
    rows.forEach((row, ri) => {
      const list = SRCS.filter((s) => MINES[s].row === row).sort((a, b) => MINES[a].x - MINES[b].x);
      const my = rowY[row], y0 = my - 0.4, yc = my + 3.1;
      const obst = SRCS.filter((s) => MINES[s].row < row).map(chuteSpan);
      if (ri === 0 || !obst.length) { GAL.push({ x0: MINES[list[0]].x - 2.6, x1: MINES[list[list.length - 1]].x + 3.5, y0, yc, my, mines: list }); return; }
      list.forEach((s) => {
        const mx = MINES[s].x; let a = mx - 5.0, b = mx + 9.0;
        obst.forEach(([o0, o1]) => { if (o1 <= mx && o1 > a) a = o1; if (o0 >= mx && o0 < b) b = o0; });
        GAL.push({ x0: a, x1: b, y0, yc, my, mines: [s] });
      });
    });
    const galOf = (src) => GAL.find((g) => g.mines.includes(src));
    const VOIDS = GAL.map((g) => [g.x0, g.x1, g.y0 - 0.05, g.yc]);
    const KEEP = VOIDS.map((v) => v.slice()); // no relief plates / grime here
    const keepOut = (x0, x1, y0, y1) => KEEP.push([x0, x1, y0, y1]);
    const inKeep = (x, y, pad) => KEEP.some((k) => x > k[0] - (pad || 0) && x < k[1] + (pad || 0) && y > k[2] - (pad || 0) && y < k[3] + (pad || 0));

    // ================================================================ ROCK: the cliff in strata bands
    const BANDS = [
      [TOP, yU + 4.0, 7.42, 0xd8b48e, sedA],          // upper crust: warm sandstone (light)
      [yU + 4.0, yU + 3.1, 7.3, 0x6e5e54, sedB],      // shale (dark) over the upper gallery
      [yU + 3.1, yU - 0.95, 7.38, 0xb49678, hewn],    // the upper mine wall: hewn rock (mid)
      [yU - 0.95, yL + 3.1, 7.28, 0x544a46, sedB],    // basalt (darkest)
      [yL + 3.1, yL - 0.95, 7.38, 0xa88c70, hewn],    // the lower mine wall
      [yL - 0.95, yL - 2.5, 7.3, 0x6a5a50, sedB],     // shale
      [yL - 2.5, FLOOR - 0.6, 7.42, 0xbc9a72, sedA]   // ochre down to the quarry floor (light)
    ];
    const bandMats = BANDS.map((b) => K.mat(b[3], { map: b[4], e: 0x0c0806 }));
    const bandAt = (y) => { for (let i = 0; i < BANDS.length; i++) if (y <= BANDS[i][0] && y > BANDS[i][1]) return i; return y > TOP ? 0 : BANDS.length - 1; };
    const front = (y) => BANDS[bandAt(y)][2];
    const rockG = K.group(statics);
    const S = 2.8;
    function rockPiece(x0, x1, y0, y1, z, mat, d) { if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return; d = d || 1.8; worldBox(K, x1 - x0, y1 - y0, d, mat, (x0 + x1) / 2, (y0 + y1) / 2, z - d / 2, rockG, S); }
    function carve(x0, x1, y0, y1, voids, emit) {
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      const v = voids.find((q) => q[0] < x1 - 1e-4 && q[1] > x0 + 1e-4 && q[2] < y1 - 1e-4 && q[3] > y0 + 1e-4);
      if (!v) return emit(x0, x1, y0, y1);
      carve(x0, x1, Math.max(y0, v[3]), y1, voids, emit);
      carve(x0, x1, y0, Math.min(y1, v[2]), voids, emit);
      const my0 = Math.max(y0, v[2]), my1 = Math.min(y1, v[3]);
      carve(x0, Math.max(x0, v[0]), my0, my1, voids, emit);
      carve(Math.min(x1, v[1]), x1, my0, my1, voids, emit);
    }
    const COLS = 16, CW = (QX1 - QX0) / COLS;
    for (let ci = 0; ci < COLS; ci++) {
      const x0 = QX0 + ci * CW, x1 = x0 + CW;
      BANDS.forEach((b, bi) => {
        const zv = (bi === 2 || bi === 4) ? R() * 0.05 : R() * 0.14;
        carve(x0, x1, b[1], b[0], VOIDS, (a0, a1, c0, c1) => rockPiece(a0, a1, c0, c1, b[2] + zv, bandMats[bi]));
      });
      // flush relief plates break up the big faces
      BANDS.forEach((b, bi) => {
        const yt = b[0], yb = b[1]; if (yt - yb < 0.8) return;
        const n = 1 + Math.floor(rr() * 3);
        for (let i = 0; i < n; i++) {
          const w = 0.6 + rr() * 1.2, h = 0.35 + rr() * Math.min(1.2, yt - yb - 0.3), d = 0.1 + rr() * 0.14;
          const px = x0 + w / 2 + rr() * (CW - w), py = yb + h / 2 + 0.1 + rr() * Math.max(0, yt - yb - h - 0.2);
          if (inKeep(px - w / 2, py, 0.2) || inKeep(px + w / 2, py, 0.2) || inKeep(px, py + h / 2, 0.2) || inKeep(px, py - h / 2, 0.2)) continue;
          worldBox(K, w, h, d, bandMats[bi], px, py, b[2] + d / 2 - 0.03, rockG, S);
        }
      });
    }
    // strata seams: dark line at each band boundary, a lit lip on the band above, AO under the overhang
    const seamM = K.mat(0x140e0a, { flat: true }), lipM = K.mat(0x8a7864, { flat: true });
    for (let bi = 1; bi < BANDS.length; bi++) {
      const yb = BANDS[bi][0], fz = BANDS[bi][2], fzUp = BANDS[bi - 1][2];
      carve(QX0, QX1, yb - 0.6, yb + 0.06, VOIDS.map((v) => [v[0], v[1], v[2] - 0.7, v[3] + 0.1]), (a0, a1, c0, c1) => {
        if (c1 - c0 < 0.6) return;
        const xc = (a0 + a1) / 2, w = a1 - a0;
        K.box(w, 0.09, 0.04, seamM, xc, yb - 0.05, fz + 0.03, rockG);
        K.box(w, 0.05, 0.05, lipM, xc, yb + 0.025, fzUp + 0.02, rockG);
        K.box(w, 0.6, 0.02, M.ao, xc, yb - 0.32, fz + 0.035, rockG).castShadow = false;
      });
    }
    K.box(QX1 - QX0, 0.6, 0.02, M.ao, (QX0 + QX1) / 2, TOP - 0.3, BANDS[0][2] + 0.04, rockG).castShadow = false;
    const grimeLater = () => { // soot streaks + rust weeping, flush with their band (after features registered KEEP)
      for (let i = 0; i < 34; i++) {
        const x = QX0 + 1.5 + rr() * (QX1 - QX0 - 3), y = TOP - 0.8 - rr() * (TOP - FLOOR - 1.4); const bi = bandAt(y); const h = 0.8 + rr() * 1.6;
        const yy = Math.min(y, BANDS[bi][0] - h / 2 - 0.1); if (inKeep(x, yy, 0.3) || inKeep(x, yy + h / 2, 0.3) || inKeep(x, yy - h / 2, 0.3)) continue;
        K.box(0.18 + rr() * 0.4, h, 0.02, rr() < 0.6 ? M.grime : M.weep, x, yy, BANDS[bi][2] + 0.03, rockG).castShadow = false;
      }
    };

    // ================================================================ SOFFIT under the slab
    const LP = P.lift;
    const LX = LP.points[0][0], LZ = LP.points[0][2], LB = LP.points[0][1], LT = LP.points[LP.points.length - 1][1];
    const DX = LX - 1.25;                 // the return column of the ore lift (empty cages come down here)
    const TX0 = DX - 0.66 - 0.5, TX1 = LX + 0.66 + 0.3; // the lift tower's x range (+ the counterweight)
    const sof = K.group(statics);
    const SX0 = TX1 + 0.3;
    K.box(QX1 - SX0, 0.36, 0.22, M.rust, (SX0 + QX1) / 2, -1.62, 7.62, sof);
    K.box(QX1 - SX0, 0.06, 0.3, M.ironM, (SX0 + QX1) / 2, -1.44, 7.62, sof); K.box(QX1 - SX0, 0.06, 0.3, M.ironM, (SX0 + QX1) / 2, -1.8, 7.62, sof);
    for (let x = SX0 + 0.2; x <= QX1 - 0.1; x += 0.6) K.box(0.06, 0.06, 0.04, M.brassL, x, -1.62, 7.75, sof);
    for (let x = SX0 + 1.1; x <= QX1 - 0.4; x += 3.6) {
      K.box(0.22, 1.5, 0.22, M.iron, x, -2.5, 7.48, sof);
      strut(K, sof, [x + 0.05, -1.85, 7.48], [x + 0.95, -3.1, 7.44], 0.12, M.ironM);
      K.box(0.42, 0.18, 0.34, M.brassD, x, -3.2, 7.42, sof);
      for (const dy of [-1.95, -2.5, -2.95]) K.box(0.08, 0.08, 0.04, M.brassL, x, dy, 7.6, sof);
    }
    K.tube([[SX0 + 0.2, -2.32, 7.72], [QX1 - 0.2, -2.32, 7.72]], 0.11, M.copper, sof, 4, 8);
    for (let x = SX0 + 0.8; x <= QX1 - 0.5; x += 2.8) { const f = K.cyl(0.16, 0.16, 0.08, M.brassD, 10, x, -2.32, 7.72, sof); f.rotation.z = Math.PI / 2; }
    const bulbs = [];
    for (let x = SX0 + 2.0; x <= QX1 - 0.8; x += 3.3) { K.box(0.02, 0.36, 0.02, M.soot, x, -1.98, 7.86, sof); bulbs.push(K.sph(0.09, K.glow(0xffc070), x, -2.2, 7.86, sof, 6, 4)); K.cone(0.14, 0.1, M.brassD, 6, x, -2.1, 7.86, sof); }
    const valves = [];
    for (const x of [-9.6, -2.6, 6.6, 15.2]) { if (x < SX0 + 0.5) continue; K.torus(0.15, 0.035, M.red, 4, 12, x, -2.32, 7.92, sof); valves.push([x, -2.42, 7.92]); K.box(0.06, 0.18, 0.06, M.brass, x, -2.22, 7.86, sof); }
    keepOut(QX0, QX1, -2.6, TOP);

    // ================================================================ MINE LEVEL SIGN (pixel style, top left)
    const MS = { x: -12.6, y: -3.15 };
    { const s = sign(K, statics, 'MINE', '#ffd08a', MS.x, MS.y, 7.56, 1.0); for (const sx of [-1, 1]) { K.box(0.06, 1.05, 0.06, M.iron, MS.x + sx * (s.w / 2 - 0.25), MS.y + 1.05, 7.5, statics); K.box(0.16, 0.08, 0.16, M.brassD, MS.x + sx * (s.w / 2 - 0.25), MS.y + 0.56, 7.55, statics); }
      keepOut(MS.x - s.w / 2 - 0.3, MS.x + s.w / 2 + 0.3, MS.y - 0.7, MS.y + 0.7);
      const arrow = K.box(0.36, 0.1, 0.03, K.glow(0xffb040), MS.x, MS.y - 0.66, 7.57, statics); arrow.rotation.z = 0; K.cone(0.11, 0.18, K.glow(0xffb040), 4, MS.x, MS.y - 0.82, 7.57, statics).rotation.z = Math.PI; }

    // ================================================================ GALLERIES (recessed bands with plank walkways)
    const gal = K.group(statics), galA = K.group(anim);
    const galLamps = [], lanterns = [], bots = [];
    const lampHead = K.glow(0xffb860); pulseSet.push(lampHead);
    GAL.forEach((g) => {
      const len = g.x1 - g.x0, cx = (g.x0 + g.x1) / 2;
      // back wall (hewn rock) with the portals carved out
      const bwM = bandMats[bandAt(g.y0 + 1)];
      const holes = [];
      g.mines.forEach((src) => { const mx = MINES[src].x; holes.push([mx - 0.7, mx + 0.7, g.y0 - 0.4, MINES[src].y + 1.75]); holes.push([mx + 2.0, mx + 3.0, g.y0 - 0.4, g.y0 + 1.35]); });
      carve(g.x0, g.x1, g.y0 - 0.3, g.yc + 0.2, holes, (a0, a1, c0, c1) => worldBox(K, a1 - a0, c1 - c0, 1.0, bwM, (a0 + a1) / 2, (c0 + c1) / 2, ZB - 0.5, gal, S));
      // walkway planks + front edge beam + rivets
      worldBox(K, len, 0.18, 7.64 - ZB, PLANK, cx, g.y0 - 0.09, (ZB + 7.64) / 2, gal, [1.0, 1, 0.85]);
      K.box(len + 0.1, 0.3, 0.16, M.rust, cx, g.y0 - 0.25, 7.71, gal);
      K.box(len + 0.1, 0.05, 0.2, M.ironM, cx, g.y0 - 0.08, 7.71, gal);
      for (let x = g.x0 + 0.15; x <= g.x1 - 0.1; x += 0.6) K.box(0.06, 0.06, 0.04, M.brassL, x, g.y0 - 0.25, 7.8, gal);
      // header beam along the top front edge of the recess (timber + iron straps)
      K.box(len, 0.22, 0.22, M.woodD, cx, g.yc - 0.08, 7.22, gal);
      for (let x = g.x0 + 0.6; x < g.x1 - 0.3; x += 2.2) K.box(0.08, 0.26, 0.26, M.ironM, x, g.yc - 0.08, 7.23, gal);
      // struts under the walkway (skip where a chute starts)
      const hops = SRCS.map((s) => P['chute-' + s].points[1][0]);
      for (let x = g.x0 + 0.5; x <= g.x1 - 0.4; x += 2.4) {
        if (hops.some((h) => Math.abs(h - x) < 0.9)) continue;
        K.box(0.18, 1.1, 0.18, M.woodD, x, g.y0 - 0.75, 7.55, gal);
        strut(K, gal, [x, g.y0 - 0.2, 7.62], [x, g.y0 - 1.25, 7.3], 0.1, M.iron);
        K.box(0.36, 0.2, 0.26, M.brassD, x, g.y0 - 1.25, 7.42, gal);
      }
      // railing along the front (gaps where the dump spills into each hopper)
      const gaps = g.mines.map((s) => { const h = P['chute-' + s].points[1][0]; return [h - 0.62, h + 0.62]; });
      const railSegs = []; let a = g.x0 + 0.05;
      gaps.sort((p, q) => p[0] - q[0]).forEach(([q0, q1]) => { if (q0 > a) railSegs.push([a, q0]); a = Math.max(a, q1); });
      if (a < g.x1 - 0.05) railSegs.push([a, g.x1 - 0.05]);
      railSegs.forEach(([r0, r1]) => {
        const n = Math.max(1, Math.round((r1 - r0) / 1.6));
        for (let i = 0; i <= n; i++) K.box(0.07, 0.92, 0.07, M.iron, r0 + (r1 - r0) * i / n, g.y0 + 0.46, 7.56, gal);
        K.box(r1 - r0, 0.07, 0.08, M.ironL, (r0 + r1) / 2, g.y0 + 0.9, 7.56, gal);
        K.box(r1 - r0, 0.05, 0.06, M.iron, (r0 + r1) / 2, g.y0 + 0.46, 7.56, gal);
        K.box(r1 - r0, 0.12, 0.02, HZ, (r0 + r1) / 2, g.y0 + 0.06, 7.57, gal);
      });
      // a cable along the back wall top
      K.tube([[g.x0 + 0.2, g.yc - 0.5, ZB + 0.08], [cx - len * 0.25, g.yc - 0.7, ZB + 0.1], [cx + len * 0.2, g.yc - 0.5, ZB + 0.08], [g.x1 - 0.2, g.yc - 0.66, ZB + 0.1]], 0.035, M.soot, gal, 30, 4);
      // timber shoring panels against the back wall between the portals
      const busy = [];
      g.mines.forEach((s) => { const mx = MINES[s].x; busy.push([mx - 1.25, mx + 3.3]); });
      for (let x = g.x0 + 1.0; x <= g.x1 - 0.9; x += 2.35) {
        if (busy.some(([b0, b1]) => x > b0 - 0.55 && x < b1 + 0.55)) continue;
        const ht = g.yc - g.y0 - 0.15;
        for (const sx of [-0.5, 0.5]) { K.box(0.2, ht, 0.2, M.woodD, x + sx, g.y0 + ht / 2, ZB + 0.12, gal); K.box(0.24, 0.08, 0.24, M.ironM, x + sx, g.y0 + 0.6, ZB + 0.13, gal); K.box(0.24, 0.08, 0.24, M.ironM, x + sx, g.y0 + ht - 0.6, ZB + 0.13, gal); }
        K.box(1.4, 0.24, 0.26, M.wood, x, g.y0 + ht - 0.05, ZB + 0.14, gal);
        strut(K, gal, [x - 0.45, g.y0 + 0.3, ZB + 0.16], [x + 0.45, g.y0 + ht - 0.3, ZB + 0.16], 0.12, M.woodD);
        if ((Math.round(x * 10) % 3) === 0) { galLamps.push(K.box(0.16, 0.2, 0.12, lampHead, x, g.y0 + 1.55, ZB + 0.3, gal)); K.box(0.22, 0.05, 0.16, M.brassD, x, g.y0 + 1.68, ZB + 0.3, gal); }
        else { K.box(0.5, 0.36, 0.04, M.hazard, x, g.y0 + 1.25, ZB + 0.25, gal); K.box(0.36, 0.22, 0.05, M.soot, x, g.y0 + 1.25, ZB + 0.26, gal); }
        busy.push([x - 0.7, x + 0.7]);
      }
      // lamp posts on the railing
      for (let x = g.x0 + 1.4; x <= g.x1 - 1.0; x += 3.1) {
        if (gaps.some(([q0, q1]) => x > q0 - 0.3 && x < q1 + 0.3)) continue;
        K.box(0.08, 1.5, 0.08, M.iron, x, g.y0 + 0.75, 7.5, gal); K.box(0.36, 0.06, 0.06, M.iron, x + 0.14, g.y0 + 1.48, 7.5, gal);
        galLamps.push(K.box(0.18, 0.24, 0.18, lampHead, x + 0.3, g.y0 + 1.25, 7.5, gal)); K.cone(0.16, 0.12, M.brassD, 6, x + 0.3, g.y0 + 1.43, 7.5, gal);
      }
      // hanging lanterns from the header beam
      for (let x = g.x0 + 2.2; x < g.x1 - 1.0; x += 4.4) {
        if (g.mines.some((s) => Math.abs(MINES[s].x - x) < 0.9)) continue;
        const piv = K.dyn(K.group(galA, x, g.yc - 0.2, 7.0));
        const L = 0.6 + rr() * 0.4;
        chainBar(K, piv, 0, 0, -L, 0, 0.035);
        const c = K.group(piv, 0, -L - 0.17, 0);
        K.box(0.24, 0.04, 0.24, M.brassD, 0, 0.16, 0, c); K.box(0.24, 0.04, 0.24, M.brassD, 0, -0.16, 0, c);
        for (const sx of [-0.1, 0.1]) for (const sz of [-0.1, 0.1]) K.box(0.03, 0.32, 0.03, M.iron, sx, 0, sz, c);
        K.box(0.12, 0.2, 0.12, lampHead, 0, 0, 0, c);
        lanterns.push({ piv, ph: rr() * 6 });
      }
      // crates + barrels against the back wall (clear of portals + panels)
      for (let x = g.x0 + 0.6; x < g.x1 - 0.5; x += 1.3 + rr() * 1.6) {
        if (busy.some(([b0, b1]) => x > b0 - 0.2 && x < b1 + 0.2)) continue;
        if (rr() < 0.5) { const s = 0.36 + rr() * 0.12; K.box(s, s, s, M.woodD, x, g.y0 + s / 2, ZB + 0.38, gal); K.box(s + 0.02, 0.04, s + 0.02, M.ironM, x, g.y0 + s * 0.75, ZB + 0.38, gal); }
        else { K.cyl(0.17, 0.17, 0.46, rr() < 0.5 ? M.verd : M.rust, 10, x, g.y0 + 0.23, ZB + 0.34, gal); band(K, K.group(gal, x, g.y0, ZB + 0.34), 0.18, 0.12, M.ironM, 0.04); }
      }
      // a brass automaton walks the gallery
      const bot = automaton(K, galA, cx, g.y0, 7.1, 0.95);
      bots.push({ a: bot, x0: g.x0 + 0.6, x1: g.x1 - 0.6, y: g.y0, z: 7.12, sp: 0.42 + rr() * 0.2, ph: rr() * 4, avoid: g.mines.map((s) => P['chute-' + s].points[1][0]) });
    });
    // a ladder from the lower gallery up through a hatch in the upper walkway (where the two overlap)
    function ladder(p, x, z, y0, y1) { const h = y1 - y0; for (const sx of [-0.18, 0.18]) K.box(0.05, h, 0.05, M.iron, x + sx, y0 + h / 2, z, p); for (let y = y0 + 0.2; y < y1; y += 0.3) K.box(0.36, 0.04, 0.04, M.ironL, x, y, z, p); }
    {
      const up = GAL.find((g) => g.y0 === yU - 0.4), lo = GAL.find((g) => g.y0 === yL - 0.4 && g.x0 < (up ? up.x0 + 1.5 : -1e9) && g.x1 > (up ? up.x0 + 1.5 : 1e9));
      if (up && lo) { const lx = up.x0 + 0.45; ladder(gal, lx, ZB + 0.22, lo.y0, up.y0 + 0.85); K.box(0.7, 0.03, 0.7, M.black, lx, up.y0 + 0.004, ZB + 0.4, gal); }
    }

    // ================================================================ MINES (portal, tunnel, rails, turntable, dumper, siding, hopper)
    const mines = {};
    const hzStripe = (p, w, h, x, y, z) => K.box(w, h, 0.02, HZ, x, y, z, p);
    SRCS.forEach((src) => {
      const mi = MINES[src], mx = mi.x, my = mi.y, col = mi.color, on = live(src);
      const g = K.group(statics);
      const railP = P['cart-' + src], chP = P['chute-' + src];
      const zc = railP.points[0][2], tipX = railP.points[railP.points.length - 1][0];
      const y0 = my - 0.4, ry = my - 0.33;                   // walkway top, rail centre
      const zT = zc - TUNNEL_DEPTH + 0.52;                   // the void plane (just in front of the emerge start)
      const hp = chP.points[1];                              // the hopper on the walkway lip
      const exS = mx + 2.0, exP = mx + 2.5, zE = ZB - 0.78;  // EMPTIES siding: straight, curve, tunnel
      const gl = galOf(src);
      const dim = (c, k) => { const q = new T.Color(c); q.multiplyScalar(k); return q.getHex(); };
      const crys = on ? K.mat(col, { e: col, ei: 0.85 }) : K.mat(dim(col, 0.35), { flat: true });
      const veinM = on ? K.mat(col, { e: col, ei: 0.28 }) : K.mat(dim(col, 0.3), { flat: true });
      // ---- tunnel: dark planks + rails running in, a timber set with a lamp, ore glints, the void beyond
      K.box(1.5, 0.12, ZB - zT + 0.05, [M.woodD, M.woodD, PLANKD, M.soot, M.woodD, M.woodD], mx, y0 - 0.06, (zT + ZB) / 2, g);
      K.box(1.9, 2.6, 0.05, M.void, mx, y0 + 1.2, zT - 0.03, g);
      const zs = (zT + ZB) / 2 + 0.05;
      for (const sx of [-0.6, 0.6]) K.box(0.14, my + 1.62 - y0, 0.14, M.woodD, mx + sx, (y0 + my + 1.62) / 2, zs, g);
      K.box(1.36, 0.16, 0.16, M.woodD, mx, my + 1.62, zs, g);
      const lampMs = [];
      const tl = K.mat(0x1a120a, { e: on ? col : 0, ei: 0.9 }); lampMs.push(tl);
      K.box(0.12, 0.16, 0.08, tl, mx + 0.44, my + 1.32, zs + 0.1, g);
      const backGlow = on ? K.box(1.36, 1.25, 0.02, K.glow(col, 0.3, true), mx, y0 + 0.64, zT + 0.02, g) : null;
      if (backGlow) backGlow.castShadow = false;
      const floorGlow = on ? K.box(1.1, 0.01, ZB - zT - 0.1, K.glow(col, 0.16, true), mx, y0 + 0.012, (zT + ZB) / 2, g) : null;
      for (let i = 0; i < 7; i++) { const sx = i % 2 ? 1 : -1; const c = K.cone(0.05 + rr() * 0.04, 0.2 + rr() * 0.22, crys, 4, mx + sx * (0.62 + rr() * 0.06), y0 + 0.25 + rr() * 1.25, zT + 0.15 + rr() * (ZB - zT - 0.3), g); c.rotation.set(R() * 1.2, rr() * 3, sx * (1.0 + R() * 0.6)); }
      for (let i = 0; i < 5; i++) K.rock(0.08 + rr() * 0.07, i % 2 ? M.soot : crys, mx + R() * 1.0, y0 + 0.06, zT + 0.15 + rr() * 0.4, g);
      track(K, [[mx, zT - 0.1], [mx, zc - 0.48]], ry, g, { rail: on ? M.rail : M.railR });
      // ---- portal: heavy timber posts, lintel, plank hood, knee braces, iron straps
      for (const sx of [-0.82, 0.82]) {
        K.box(0.22, my + 1.9 - y0, 0.3, M.wood, mx + sx, (y0 + my + 1.9) / 2, ZB + 0.15, g);
        K.box(0.28, 0.12, 0.36, M.ironM, mx + sx, y0 + 0.06, ZB + 0.15, g); K.box(0.28, 0.09, 0.36, M.ironM, mx + sx, my + 0.9, ZB + 0.15, g);
        strut(K, g, [mx + sx * 0.98, my + 1.2, ZB + 0.32], [mx + sx * 0.55, my + 1.86, ZB + 0.32], 0.1, M.woodD);
      }
      K.box(2.1, 0.28, 0.42, M.wood, mx, my + 1.88, ZB + 0.21, g);
      K.box(2.14, 0.06, 0.44, M.ironM, mx, my + 1.98, ZB + 0.22, g);
      for (let i = 0; i < 6; i++) { const pl = K.box(0.38, 0.06, 1.1, M.woodD, mx - 0.95 + i * 0.38, my + 2.08 - Math.abs(i - 2.5) * 0.02, ZB + 0.55, g); pl.rotation.x = -0.1; }
      // portal lamps (flare on spawn)
      const portalLamp = K.mat(0x1a120a, { e: on ? col : 0, ei: 0.6 });
      for (const sx of [-0.82, 0.82]) { K.box(0.18, 0.24, 0.14, portalLamp, mx + sx, my + 1.5, ZB + 0.38, g); K.cone(0.15, 0.1, M.brassD, 6, mx + sx, my + 1.68, ZB + 0.38, g); }
      // the big sign on brackets above the hood
      const sm = sign(K, g, mi.label, on ? css(col) : '#4a4038', mx, my + 2.55, 7.02, 0.72, on ? {} : { bg: 0x0a0806 });
      for (const sx of [-0.6, 0.6]) K.box(0.06, 0.3, 0.06, M.iron, mx + sx, my + 2.12, 6.98, g);
      keepOut(mx - sm.w / 2 - 0.2, mx + sm.w / 2 + 0.2, my + 2.1, my + 3.0);
      // colour veins radiating from the portal + crystal clusters on the back wall
      for (let i = 0; i < 8; i++) { const a = (i / 7) * Math.PI - Math.PI / 2 + R() * 0.2, L = 0.3 + rr() * 0.45; const sxs = i % 2 ? 1 : -1; const v = K.box(L, 0.04, 0.03, veinM, mx + Math.sin(a) * (1.15 + L / 2) * sxs, my + 0.6 + Math.cos(a) * 0.95, ZB + 0.03, g); v.rotation.z = sxs * (0.4 + R()); }
      for (const [cxo, cyo] of [[-1.35, 1.6], [3.4, 0.9]]) { if (mx + cxo < gl.x0 + 0.3 || mx + cxo > gl.x1 - 0.3) continue; for (let i = 0; i < 5; i++) { const c = K.cone(0.06 + rr() * 0.05, 0.22 + rr() * 0.25, crys, 4, mx + cxo + R() * 0.5, my + cyo + R() * 0.45, ZB + 0.08, g); c.rotation.set(-1.0 + R() * 0.6, rr() * 3, R() * 1.4); } }
      // ---- turntable in front of the portal (follows the cart round the corner)
      K.cyl(0.53, 0.53, 0.02, M.black, 16, mx, y0 + 0.004, zc, g);
      const tt = K.dyn(K.group(anim, mx, y0, zc)); tt.rotation.y = -Math.PI / 2;
      K.cyl(0.48, 0.48, 0.05, M.ironM, 16, 0, 0.0, 0, tt);
      K.torus(0.47, 0.03, M.brass, 4, 18, 0, 0.03, 0, tt).rotation.x = Math.PI / 2;
      for (const sz of [-0.28, 0.28]) K.box(0.94, 0.06, 0.06, on ? M.rail : M.railR, 0, ry - y0, sz, tt);
      for (let k = 0; k < 4; k++) K.box(0.07, 0.03, 0.07, M.brassL, Math.cos(k * 1.57 + 0.78) * 0.4, 0.035, Math.sin(k * 1.57 + 0.78) * 0.4, tt);
      // ---- rotary dumper: two hazard hoops that clamp the cart and roll it toward the chute
      const pivY = my + 0.05;
      K.box(1.15, 0.02, 1.15, M.black, tipX, y0 + 0.004, zc, g);
      for (const hx of [-0.3, 0.3]) for (const sz of [-0.36, 0.36]) { const rl = K.cyl(0.07, 0.07, 0.14, M.ironL, 8, tipX + hx, y0 + 0.02, zc + sz, g); rl.rotation.z = Math.PI / 2; K.box(0.2, 0.1, 0.16, M.ironM, tipX + hx, y0 - 0.02, zc + sz, g); }
      const dmp = K.dyn(K.group(anim, tipX, pivY, zc));
      for (const hx of [-0.3, 0.3]) {
        const h = K.torus(0.52, 0.045, M.hazard, 6, 22, hx, 0, 0, dmp); h.rotation.y = Math.PI / 2;
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; const st = K.box(0.1, 0.1, 0.06, M.soot, hx, Math.sin(a) * 0.52, Math.cos(a) * 0.52, dmp); st.rotation.x = -a; }
      }
      for (const sz of [-0.2, 0.2]) K.box(0.72, 0.05, 0.05, M.ironL, 0, 0.33, sz, dmp);
      for (const sz of [-0.28, 0.28]) K.box(0.86, 0.06, 0.06, on ? M.rail : M.railR, 0, ry - pivY, sz, dmp);
      const dGear = gear(K, anim, 0.28, 0.08, 12, M.brass, tipX - 0.62, pivY, ZB + 0.18); dGear.rotation.x = Math.PI / 2;
      K.box(0.42, 0.46, 0.22, M.ironM, tipX - 0.62, y0 + 0.23, ZB + 0.12, g);
      // ---- the gate at the far end of the dumper (lifts to let the empty roll on into the siding)
      K.box(0.12, 0.6, 0.12, M.iron, tipX + 0.56, y0 + 0.3, zc - 0.42, g);
      const gate = K.dyn(K.group(anim, tipX + 0.56, y0 + 0.5, zc - 0.36));
      K.box(0.07, 0.1, 0.74, HZ, 0, 0, 0.37, gate); K.box(0.08, 0.12, 0.06, M.red, 0, 0, 0.74, gate);
      // ---- EMPTIES siding: on past the gate, round a curve and into its own little tunnel
      const sid = [[tipX + 0.43, zc], [exS, zc], ...arc(exS, zc - 0.5, 0.5, Math.PI / 2, 0, 6).slice(1), [exP, zE - 0.1]];
      track(K, sid, ry, g, { rail: on ? M.rail : M.railR, ph: 0.15 });
      K.box(1.0, 0.1, ZB - zE + 0.05, [M.woodD, M.woodD, PLANKD, M.soot, M.woodD, M.woodD], exP, y0 - 0.05, (zE + ZB) / 2, g);
      K.box(1.2, 1.6, 0.05, M.void, exP, y0 + 0.75, zE - 0.03, g);
      for (const sx of [-0.6, 0.6]) K.box(0.18, 1.55, 0.24, M.woodD, exP + sx, y0 + 0.775, ZB + 0.12, g);
      K.box(1.5, 0.2, 0.3, M.woodD, exP, y0 + 1.5, ZB + 0.15, g);
      sign(K, g, 'EMPTIES', '#c8b8a0', exP, y0 + 1.82, ZB + 0.24, 0.24);
      if (on) K.box(0.8, 0.01, 0.55, K.glow(0xffa050, 0.14, true), exP, y0 + 0.012, (zE + ZB) / 2, g);
      // ---- spill plate + hopper on the walkway lip (the head of the chute)
      { const [sp, L] = along(K, g, [tipX + 0.05, my - 0.07, zc + 0.36], [hp[0] - 0.12, hp[1] - 0.03, hp[2] - 0.26]); K.box(L, 0.04, 0.6, M.ironL, L / 2, -0.02, 0, sp); for (const sz of [-0.3, 0.3]) K.box(L, 0.1, 0.04, M.ironM, L / 2, 0.03, sz, sp); }
      const hg = K.group(g, hp[0], hp[1], hp[2]);
      K.box(0.92, 0.64, 0.06, M.iron, 0, -0.22, -0.3, hg);
      for (const sx of [-1, 1]) K.box(0.06, 0.5, 0.62, M.ironM, sx * 0.44, -0.24, 0, hg);
      K.box(0.92, 0.28, 0.06, M.rust, 0, -0.36, 0.3, hg); hzStripe(hg, 0.9, 0.08, 0, -0.26, 0.335);
      K.box(0.96, 0.05, 0.08, M.brassD, 0, 0.1, -0.3, hg);
      for (const sx of [-1, 1]) K.box(0.08, 0.05, 0.66, M.brassD, sx * 0.44, 0.02, 0, hg);
      for (let i = 0; i < 4; i++) K.box(0.05, 0.05, 0.03, M.brassL, -0.33 + i * 0.22, -0.3, 0.34, hg);
      K.box(0.3, 0.3, 0.2, M.ironM, 0, -0.45, -0.42, hg);
      // ---- semaphore on the left post (drops to GO while a cart rolls out) + a bell under the hood
      const semX = mx - 1.0;
      const semLamp = K.mat(0x200a08, { e: 0 });
      K.box(0.08, 1.25, 0.08, M.iron, semX, my + 0.95, ZB + 0.36, g); K.box(0.12, 0.12, 0.1, semLamp, semX, my + 1.6, ZB + 0.42, g);
      const armP = K.dyn(K.group(anim, semX, my + 1.4, ZB + 0.44));
      K.box(0.62, 0.11, 0.03, M.red, -0.31, 0, 0, armP); K.box(0.1, 0.12, 0.035, M.cream, -0.5, 0, 0.002, armP);
      const bell = K.dyn(K.group(anim, mx + 0.5, my + 1.72, ZB + 0.55)); K.box(0.04, 0.12, 0.04, M.iron, 0, 0, 0, bell); K.cone(0.11, 0.15, M.brassL, 8, 0, -0.13, 0, bell);
      // ---- a miner at a vein on the back wall (live mines)
      let miner = null, minerX = mx - 1.95;
      if (minerX < gl.x0 + 0.5) minerX = mx + 3.75;
      if (on && minerX < gl.x1 - 0.4) {
        miner = automaton(K, anim, minerX, y0, ZB + 0.5, 0.95); miner.g.rotation.y = Math.PI; pickaxe(K, miner.arms[1]);
        for (let i = 0; i < 6; i++) { const c = K.cone(0.05 + rr() * 0.05, 0.2 + rr() * 0.2, crys, 4, minerX + R() * 0.5, y0 + 0.55 + rr() * 0.6, ZB + 0.07, g); c.rotation.set(-1.1 + R() * 0.5, rr() * 3, R() * 1.2); }
      }
      // ---- ghost mine: boarded up, sign dark, NOT CONNECTED plate, cobwebs
      if (!on) {
        for (let i = 0; i < 5; i++) { const b = K.box(1.78 + R() * 0.1, 0.2, 0.06, i % 2 ? M.woodD : M.wood, mx + R() * 0.06, y0 + 0.3 + i * 0.42, ZB + 0.34, g); b.rotation.z = R() * 0.1; }
        for (const s of [-1, 1]) { const b = K.box(2.3, 0.18, 0.05, M.woodL, mx, y0 + 1.1, ZB + 0.38, g); b.rotation.z = s * 0.82; }
        sign(K, g, 'NOT CONNECTED', '#ff7a4a', mx, y0 + 1.1, ZB + 0.46, 0.34, { bg: 0x140806, tint: 0xa8a8a8 });
        for (const sx of [-1, 1]) { const w = K.box(0.5, 0.5, 0.01, M.web, mx + sx * 0.5, my + 1.5, ZB + 0.32, g); w.rotation.z = sx * 0.78; w.castShadow = false; }
        for (const sx of [-1, 1]) { const b = K.box(0.9, 0.16, 0.05, M.woodD, exP, y0 + 0.4 + (sx + 1) * 0.35, ZB + 0.3, g); b.rotation.z = sx * 0.3; }
      }
      mines[src] = { src, mx, my, col, on, y0, zc, tipX, pivY, zT, sm, lampMs, portalLamp, backGlow, floorGlow, armP, semLamp, bell, miner, minerX, tt, dmp, dGear, gate, flash: 0, go: 0, ph: rr() * 6, lastStrike: 0, tipA: 0, gateK: 0,
        empPath: polyline([[tipX, zc], ...sid.slice(1)]), fx: [] };
    });

    // ================================================================ CHUTES (zig-zag troughs down the face: the cascade)
    const chuteG = K.group(statics);
    const chutes = [];
    SRCS.forEach((src) => {
      const pth = P['chute-' + src], pts = pth.points, on = live(src), col = MINES[src].color;
      const floorM = on ? M.ironL : M.ironM;
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const [g, L] = along(K, chuteG, a, b);
        const L1 = i === pts.length - 2 ? L + 0.12 : L;
        K.box(L1, 0.05, 0.54, floorM, L1 / 2, -0.025, 0, g);
        K.box(L1, 0.04, 0.62, M.ironM, L1 / 2, -0.07, 0, g);
        K.box(L1, 0.36, 0.05, M.iron, L1 / 2, 0.16, -0.29, g);
        K.box(L1, 0.18, 0.05, M.rust, L1 / 2, 0.07, 0.29, g);
        K.box(L1, 0.04, 0.09, M.brassD, L1 / 2, 0.17, 0.3, g);
        for (let x = 0.15; x < L1 - 0.05; x += 0.32) K.box(0.05, 0.05, 0.03, M.brassL, x, 0.08, 0.322, g);
        for (let x = 0.45; x < L1 - 0.2; x += 0.95) K.box(0.07, 0.3, 0.7, M.ironM, x, 0.07, 0, g);
        // brackets into the rock + a strut under each run
        for (let x = 0.5; x < L1 - 0.3; x += 1.25) K.box(0.12, 0.12, 0.2, M.ironM, x, 0.05, -0.39, g);
        if (b[2] < 7.9) {
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
          strut(K, chuteG, [m[0], m[1] - 0.12, m[2] - 0.05], [m[0] + (b[0] > a[0] ? -0.5 : 0.5), m[1] - 1.0, 7.36], 0.09, M.iron);
          K.box(0.28, 0.2, 0.08, M.brassD, m[0] + (b[0] > a[0] ? -0.5 : 0.5), m[1] - 1.0, 7.38, chuteG);
        }
        keepOut(Math.min(a[0], b[0]) - 0.45, Math.max(a[0], b[0]) + 0.45, Math.min(a[1], b[1]) - 0.4, Math.max(a[1], b[1]) + 0.4);
      }
      // corner boxes where the cascade turns back on itself
      const corners = [];
      for (let i = 2; i < pts.length - 1; i++) {
        const c = pts[i], dir = Math.sign(pts[i][0] - pts[i - 1][0]) || 1;
        const cg = K.group(chuteG, c[0], c[1], c[2]);
        K.box(0.98, 0.7, 0.06, M.iron, dir * 0.08, 0.0, -0.31, cg);
        K.box(0.06, 0.62, 0.62, M.ironM, dir * 0.55, -0.02, 0, cg);
        K.box(0.98, 0.06, 0.62, M.ironM, dir * 0.08, -0.32, 0, cg);
        K.box(0.98, 0.26, 0.06, M.rust, dir * 0.08, -0.2, 0.31, cg); hzStripe(cg, 0.96, 0.08, dir * 0.08, -0.11, 0.345);
        K.box(1.02, 0.05, 0.08, M.brassD, dir * 0.08, 0.36, -0.31, cg);
        for (let k = 0; k < 4; k++) K.box(0.05, 0.05, 0.03, M.brassL, dir * 0.08 - 0.36 + k * 0.24, -0.26, 0.345, cg);
        K.box(0.36, 0.36, 0.22, M.ironM, dir * 0.08, -0.05, -0.42, cg);
        strut(K, chuteG, [c[0] + dir * 0.3, c[1] - 0.35, c[2] - 0.1], [c[0] + dir * 0.2, c[1] - 1.1, 7.36], 0.1, M.iron);
        corners.push({ p: c, s: pth.segs[i - 1] ? pth.segs[i - 1].L0 + pth.segs[i - 1].len : 0 });
        keepOut(c[0] - 0.7, c[0] + 0.7, c[1] - 0.8, c[1] + 0.5);
      }
      // skirt boards where the chute lands on the collector
      const lp = pts[pts.length - 1], cy = P.collector.points[0][1], cz = P.collector.points[0][2];
      for (const sz of [-0.37, 0.37]) { K.box(1.1, 0.2, 0.04, M.ironM, lp[0], cy + 0.1, cz + sz, chuteG); K.box(1.1, 0.06, 0.02, HZ, lp[0], cy + 0.16, cz + sz + Math.sign(sz) * 0.025, chuteG); }
      // the s values where items reach each corner (for splashes) and the landing
      const cs = []; let acc = 0; for (const sg of pth.segs) { acc += sg.len; cs.push(acc); }
      chutes.push({ src, pth, on, col, cornerS: cs.slice(1, -1), cornerP: pts.slice(2, -1), land: lp });
    });

    // ================================================================ CLIFF FEATURES (aether vein, gears, fans, furnace, flywheel, pipes)
    const feat = K.group(statics), featA = K.group(anim);
    // AETHER crystal vein + conduit up into the slab
    const AE = { x: -7.6, y: -5.0 };
    const crysAe = [];
    for (let i = 0; i < 16; i++) {
      const cx = AE.x + R() * 2.4, cy = AE.y + R() * 1.5, cz = front(cy) + 0.1;
      const c = K.cone(0.1 + rr() * 0.12, 0.5 + rr() * 0.7, M.tealCrys, 5, cx, cy, cz, feat); c.rotation.set(0.6 + R() * 0.8, rr() * 3, R() * 1.4);
      crysAe.push([cx, cy, cz]);
    }
    const aeHalo = []; for (let i = 0; i < 3; i++) { const h = K.sph(0.55 + rr() * 0.3, K.glow(0x3ae0c0, 0.06, true), AE.x + R() * 2.0, AE.y + R() * 1.0, 7.95, feat, 8, 6); h.castShadow = false; aeHalo.push(h); }
    const condPts = [[AE.x + 0.6, AE.y + 0.8, 7.5], [AE.x + 0.3, AE.y + 1.7, 7.62], [AE.x - 0.1, AE.y + 2.6, 7.74], [AE.x - 0.2, -1.55, 7.86]];
    K.tube(condPts, 0.11, M.tealPipe, feat, 16, 6);
    const condCurve = new T.CatmullRomCurve3(condPts.map((p) => new V3(p[0], p[1], p[2])));
    for (const u of [0.2, 0.5, 0.8]) { const p = condCurve.getPoint(u); const r = K.torus(0.15, 0.04, M.brass, 4, 10, p.x, p.y, p.z, feat); const tn = condCurve.getTangent(u); r.lookAt(p.x + tn.x, p.y + tn.y, p.z + tn.z); }
    const aePulses = [0, 0.33, 0.66].map((u) => ({ m: K.dyn(K.sph(0.13, K.glow(0xbffff0), 0, 0, 0, featA, 6, 4)), u }));
    const aeSign = sign(K, feat, 'AETHER', '#7af0d8', AE.x - 1.9, AE.y + 1.55, 7.45, 0.3);
    keepOut(AE.x - 2.8, AE.x + 1.6, AE.y - 1.2, AE.y + 2.0);
    // big gear pair
    const GP = { x: -3.9, y: -5.35 };
    const gA = gear(K, featA, 1.25, 0.3, 20, M.brass, GP.x, GP.y, front(GP.y) + 0.12); gA.rotation.x = Math.PI / 2;
    const gB = gear(K, featA, 0.72, 0.28, 12, M.copper, GP.x + 1.95, GP.y + 0.1, front(GP.y) + 0.14); gB.rotation.x = Math.PI / 2;
    K.box(0.5, 0.5, 0.4, M.ironM, GP.x, GP.y, front(GP.y) - 0.05, feat); K.box(0.36, 0.36, 0.4, M.ironM, GP.x + 1.95, GP.y + 0.1, front(GP.y) - 0.05, feat);
    keepOut(GP.x - 1.5, GP.x + 2.9, GP.y - 1.5, GP.y + 1.5);
    // fans (round vents with spinning blades)
    const fans = [];
    for (const [x, y, r] of [[-15.0, -3.1, 0.7], [15.6, -3.0, 0.62], [-14.4, -10.4, 0.74], [-1.6, -14.2, 0.6]]) {
      const z = front(y) + 0.12;
      const h = K.group(feat, x, y, z);
      K.torus(r, 0.1, M.ironL, 6, 22, 0, 0, 0, h);
      const bk = K.cyl(r, r, 0.06, M.black, 18, 0, 0, -0.08, h); bk.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) K.box(r * 2, 0.04, 0.04, M.ironM, 0, -r + 0.2 + i * (r * 2 - 0.4) / 4, 0.1, h);
      const bl = K.dyn(K.group(featA, x, y, z + 0.02));
      for (let i = 0; i < 4; i++) { const pv = K.group(bl); pv.rotation.z = i * Math.PI / 2; const b = K.box(r * 0.9, 0.16, 0.03, M.brassD, r * 0.45, 0, 0, pv); b.rotation.x = 0.5; }
      K.cyl(0.12, 0.12, 0.08, M.brass, 8, 0, 0, 0.06, bl).rotation.x = Math.PI / 2;
      K.bake(bl); fans.push({ bl, x, y, z, r });
      keepOut(x - r - 0.2, x + r + 0.2, y - r - 0.2, y + r + 0.2);
    }
    // SLAG FURNACE (upper right): molten stream into a quench tank, steam
    const fur = K.group(statics), furA = K.group(anim);
    const streams = [];
    function slagFurnace(x, y, s, endY, zf) {
      zf = zf === undefined ? front(y) + 0.55 * s : zf;
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
      const core = K.dyn(K.box(0.1 * s, len, 0.1 * s, K.glow(0xffe08a, 0.95, true), spout[0], spout[1] - len / 2, spout[2], furA));
      const outer = K.dyn(K.box(0.28 * s, len, 0.28 * s, K.glow(0xff6a1a, 0.5, true), spout[0], spout[1] - len / 2, spout[2], furA));
      core.castShadow = outer.castShadow = false;
      streams.push({ core, outer, spout, len, mouth, endY });
      keepOut(x - 1.0 * s, x + 1.0 * s, y - 1.4 * s, y + 2.6 * s);
      return spout;
    }
    const sp1 = slagFurnace(17.9, -4.1, 1, -8.05);
    const qt = K.group(fur, sp1[0], -8.45, sp1[2]);
    K.cyl(0.6, 0.55, 0.75, M.rust, 14, 0, 0, 0, qt); band(K, qt, 0.62, 0.3, M.ironM, 0.08); band(K, qt, 0.6, -0.25, M.ironM, 0.08);
    K.cyl(0.54, 0.54, 0.04, M.water, 14, 0, 0.33, 0, qt);
    const quenchGlow = K.cyl(0.25, 0.25, 0.05, K.glow(0xff8a3a, 0.8, true), 0, 0.35, 0, qt);
    K.box(1.4, 0.14, 0.9, M.ironM, 0, -0.45, -0.25, qt); strut(K, fur, [sp1[0] - 0.5, -9.0, sp1[2] - 0.3], [sp1[0] - 0.9, -10.0, 7.3], 0.1, M.iron);
    sign(K, qt, 'QUENCH', '#ffc070', 0, -0.05, 0.6, 0.2);
    keepOut(sp1[0] - 0.8, sp1[0] + 0.8, -9.4, -8.0);
    // FLYWHEEL ENGINE (right, between the chutes and the geothermal)
    const FWX = 16.0, FWY = -11.0, fwZ = 7.95;
    const fw = wheel(K, featA, 1.15, M.iron, FWX, FWY, fwZ, 8);
    const crankPin = K.group(fw, 0.7, 0, 0.18); K.cyl(0.08, 0.08, 0.2, M.brassL, 8, 0, 0, 0, crankPin).rotation.x = Math.PI / 2;
    K.box(0.5, 1.3, 0.5, M.ironM, FWX, FWY - 0.9, 7.6, feat); K.cyl(0.18, 0.18, 0.7, M.brass, 8, FWX, FWY, 7.65, feat).rotation.x = Math.PI / 2;
    const cylG = K.group(feat, FWX + 2.6, FWY, fwZ + 0.18); { const cy = K.cyl(0.32, 0.32, 1.3, M.copper, 12, 0, 0, 0, cylG); cy.rotation.z = Math.PI / 2; for (const xx of [-0.6, 0, 0.6]) { const b = K.cyl(0.35, 0.35, 0.07, M.brassD, 12, xx, 0, 0, cylG); b.rotation.z = Math.PI / 2; } }
    K.box(1.6, 0.3, 0.6, M.ironM, FWX + 2.6, FWY - 0.45, fwZ - 0.1, feat);
    const rod = K.dyn(K.box(1, 0.1, 0.1, M.ironL, 0, 0, 0, featA)); rod.position.z = fwZ + 0.3;
    const piston = K.dyn(K.box(0.7, 0.12, 0.12, M.brassL, FWX + 1.8, FWY, fwZ + 0.18, featA));
    keepOut(FWX - 1.4, FWX + 3.4, FWY - 1.4, FWY + 1.4);
    // pipes + steam vents
    const pipes = K.group(statics);
    K.tube([[16.6, -1.8, 7.7], [16.7, -4.8, 7.55], [16.2, -7.9, 7.5], [FWX + 2.7, FWY + 0.35, 7.6]], 0.13, M.verd, pipes, 18, 6);
    K.tube([[-10.9, -1.75, 7.75], [-10.9, -3.6, 7.5], [-11.3, -5.2, 7.45]], 0.1, M.copperD, pipes, 14, 6);
    K.tube([[GP.x - 0.4, -1.9, 7.75], [GP.x - 0.3, -3.2, 7.6], [GP.x, GP.y + 0.3, 7.55]], 0.09, M.copper, pipes, 12, 5);
    K.tube([[-13.2, -12.6, 7.5], [-12.6, -14.4, 7.6], [-12.4, FLOOR + 0.2, 8.1], [-11.2, FLOOR + 0.18, 9.4]], 0.12, M.copperD, pipes, 16, 6);
    const pg = K.group(pipes, 16.7, -5.4, 7.62);
    { const rim = K.cyl(0.24, 0.24, 0.08, M.brass, 14, 0, 0, 0, pg); rim.rotation.x = Math.PI / 2; const f = K.cyl(0.2, 0.2, 0.09, M.cream, 14, 0, 0, 0.01, pg); f.rotation.x = Math.PI / 2; }
    const gaugeN = K.dyn(K.group(featA, 16.7, -5.4, 7.69)); K.box(0.03, 0.16, 0.02, K.mat(0x1a0c06, { flat: true }), 0, 0.07, 0, gaugeN);
    const vents = [[-16.0, -6.2, 7.45], [-12.5, -8.2, 7.4], [9.6, -9.0, 7.4], [-9.4, -13.4, 7.4], [11.4, -14.2, 7.45]];
    for (const [x, y, z] of vents) { const v = K.group(pipes, x, y, z); K.cyl(0.2, 0.24, 0.3, M.ironM, 8, 0, 0, 0, v).rotation.x = Math.PI / 2; for (let i = 0; i < 3; i++) K.box(0.36, 0.04, 0.05, M.soot, 0, -0.1 + i * 0.1, 0.16, v); keepOut(x - 0.4, x + 0.4, y - 0.4, y + 0.4); }
    // timber shoring + iron braces on the open rock between features
    for (const [x, y0s, y1s] of [[-16.1, FLOOR, -11.2], [-10.6, FLOOR, -12.6], [10.6, -13.0, -9.0], [15.0, FLOOR, -13.2], [-12.6, -7.8, -5.2], [14.6, -7.6, -4.6]]) {
      K.box(0.22, y1s - y0s, 0.22, M.woodD, x, (y0s + y1s) / 2, 7.48, feat);
      K.box(0.26, 0.1, 0.26, M.ironM, x, y1s - 0.3, 7.5, feat); K.box(0.26, 0.1, 0.26, M.ironM, x, y0s + 0.4, 7.5, feat);
      K.box(0.9, 0.2, 0.24, M.wood, x, y1s, 7.48, feat);
      strut(K, feat, [x + 0.08, y0s + 0.6, 7.5], [x + 0.75, Math.min(y1s, y0s + 2.4), 7.44], 0.1, M.iron);
      keepOut(x - 0.5, x + 0.9, y0s, y1s + 0.2);
    }
    grimeLater();

    // ================================================================ QUARRY FLOOR
    const qf = K.group(statics), qfA = K.group(anim);
    const FZ0 = 7.22;
    worldBox(K, QX1 - QX0, 0.4, QZ1 - FZ0, GRAVEL, (QX0 + QX1) / 2, FLOOR - 0.2, (FZ0 + QZ1) / 2, qf, 3.2).receiveShadow = true;
    // front lip: riveted rust beam, iron cap, rivets
    K.box(QX1 - QX0 + 0.1, 0.3, 0.16, M.rust, (QX0 + QX1) / 2, FLOOR - 0.2, QZ1 + 0.06, qf);
    K.box(QX1 - QX0 + 0.1, 0.05, 0.22, M.ironM, (QX0 + QX1) / 2, FLOOR - 0.03, QZ1 + 0.04, qf);
    for (let x = QX0 + 0.2; x <= QX1 - 0.1; x += 0.6) K.box(0.06, 0.06, 0.04, M.brassL, x, FLOOR - 0.2, QZ1 + 0.15, qf);
    // painted hazard band along the collector + a worn walking lane
    const CPh = P.collector, CY = CPh.points[0][1], CZ = CPh.points[0][2], CX0 = CPh.points[0][0], CX1 = CPh.points[CPh.points.length - 1][0];
    for (let x = Math.min(CX0, CX1) + 0.4; x < Math.max(CX0, CX1) - 0.3; x += 0.5) K.box(0.24, 0.012, 0.1, Math.floor(x * 2) % 2 ? M.hazard : M.soot, x, FLOOR + 0.006, CZ + 0.62, qf).castShadow = false;
    // chain railing along the front edge
    const posts = [];
    for (let x = QX0 + 0.5; x <= QX1 - 0.3; x += 1.7) { if (Math.abs(x - 17.4) < 2.4) continue; posts.push(x); K.cyl(0.05, 0.06, 0.6, M.iron, 6, x, FLOOR + 0.3, QZ1 - 0.12, qf); K.sph(0.07, M.brassD, x, FLOOR + 0.62, QZ1 - 0.12, qf, 6, 4); }
    for (let i = 0; i < posts.length - 1; i++) { const a = posts[i], b = posts[i + 1]; if (b - a > 1.8) continue; for (let k = 1; k < 8; k++) { const u = k / 8; const l = K.torus(0.04, 0.012, M.ironL, 4, 6, a + (b - a) * u, FLOOR + 0.55 - Math.sin(u * Math.PI) * 0.16, QZ1 - 0.12, qf); l.rotation.y = k % 2 ? Math.PI / 2 : 0; l.castShadow = false; } }
    // narrow-gauge track along the front with a parked cart and one pushed by an automaton
    const TRZ = 10.75, TRX0 = QX0 + 3.4, TRX1 = 13.8;
    track(K, [[TRX0, TRZ], [TRX1, TRZ]], FLOOR + 0.07, qf);
    for (const x of [TRX0 - 0.1, TRX1 + 0.1]) { K.box(0.14, 0.4, 0.8, M.rust, x, FLOOR + 0.2, TRZ, qf); hzStripe(qf, 0.12, 0.3, x, FLOOR + 0.22, TRZ + 0.41); }
    const parked = makeCart(K, 0xff4a3a, { rusty: true }); parked.position.set(TRX0 + 0.9, FLOOR + 0.37, TRZ); qf.add(parked);
    for (let k = 0; k < 6; k++) K.rock(0.11, k % 2 ? M.soot : M.rustL, R() * 0.4, 0.2, R() * 0.3, parked);
    const pushCart = K.dyn(makeCart(K, 0x5aa8ff)); pushCart.position.set(0, FLOOR + 0.37, TRZ); qfA.add(pushCart);
    for (let k = 0; k < 5; k++) K.rock(0.1, k % 2 ? M.soot : M.stone, R() * 0.4, 0.18, R() * 0.3, pushCart);
    const pusher = automaton(K, qfA, 0, FLOOR, TRZ, 1.0);
    // crates, barrels, timber stacks, ore piles, puddles, lamps
    const crate = (x, z, s, ry) => { const c = K.group(qf, x, FLOOR, z); c.rotation.y = ry || 0; K.box(s, s, s, M.woodD, 0, s / 2, 0, c); for (const yy of [0.15, 0.85]) K.box(s + 0.02, 0.05, s + 0.02, M.ironM, 0, s * yy, 0, c); K.box(s * 0.5, s * 0.3, 0.02, M.cream, 0, s * 0.55, s / 2 + 0.005, c); return c; };
    crate(-15.3, 9.5, 0.6, 0.2); crate(-15.25, 9.52, 0.42, 0.5).position.y += 0.6; crate(-14.4, 9.45, 0.5, -0.3); crate(11.8, 9.35, 0.55, 0.15); crate(-2.6, 11.0, 0.48, 0.4); crate(4.6, 9.4, 0.44, -0.2);
    for (const [x, z, m] of [[-9.3, 9.4, M.verd], [-8.85, 9.55, M.rust], [-9.05, 9.95, M.verd], [8.9, 11.0, M.rust], [9.3, 10.95, M.ironL]]) { const b = K.group(qf, x, FLOOR, z); K.cyl(0.2, 0.2, 0.56, m, 10, 0, 0.28, 0, b); band(K, b, 0.21, 0.12, M.ironM, 0.04); band(K, b, 0.21, 0.44, M.ironM, 0.04); K.cyl(0.05, 0.05, 0.04, M.brass, 6, 0.08, 0.58, 0.06, b); }
    for (const [x, z] of [[0.6, 9.45], [-6.4, 11.05]]) { const ts = K.group(qf, x, FLOOR, z); for (let i = 0; i < 7; i++) { const lg = K.box(1.6, 0.14, 0.14, i % 3 ? M.wood : M.woodD, R() * 0.1, 0.07 + Math.floor(i / 3) * 0.14, -0.2 + (i % 3) * 0.16, ts); lg.rotation.y = R() * 0.05; } K.box(0.06, 0.5, 0.06, M.iron, 0.7, 0.25, 0.26, ts); K.box(0.06, 0.5, 0.06, M.iron, -0.7, 0.25, 0.26, ts); }
    const oreCols = SRCS.map((s) => MINES[s].color);
    for (const [x, z] of [[-11.8, 9.3], [2.4, 11.0], [7.6, 9.45], [-4.4, 9.35]]) { for (let i = 0; i < 9; i++) { const r = 0.1 + rr() * 0.1; K.rock(r, i % 3 ? M.soot : M.stoneD, x + R() * 0.6, FLOOR + r * 0.6 + (i > 5 ? 0.12 : 0), z + R() * 0.4, qf); } for (let i = 0; i < 3; i++) { const cc = oreCols[Math.floor(rr() * oreCols.length)]; const c = K.cone(0.05, 0.2, K.mat(cc, { e: cc, ei: 0.6 }), 4, x + R() * 0.4, FLOOR + 0.22, z + R() * 0.3, qf); c.rotation.set(R(), 0, R()); } }
    for (const [x, z, w] of [[-6.2, 9.3, 0.9], [2.6, 9.55, 0.7], [-13.6, 10.6, 0.8], [6.8, 10.0, 0.6], [12.6, 10.3, 0.7]]) { const pd = K.sph(1, M.oil, x, FLOOR + 0.004, z, qf, 10, 4); pd.scale.set(w, 0.01, w * 0.45); pd.castShadow = false; }
    // rubble along the cliff foot (between the landings)
    for (let x = QX0 + 3.6; x < QX1 - 2.2; x += 0.5 + rr() * 0.7) { if (chutes.some((c) => Math.abs(c.land[0] - x) < 0.8)) continue; const r = 0.08 + rr() * 0.1; K.rock(r, rr() < 0.5 ? M.soot : M.stoneD, x, FLOOR + r * 0.5, 7.5 + rr() * 0.25, qf); }
    const qLamps = [];
    for (const x of [-12.2, -3.4, 5.6, 12.9]) {
      K.box(0.1, 1.9, 0.1, M.iron, x, FLOOR + 0.95, 9.25, qf); K.box(0.22, 0.08, 0.22, M.ironM, x, FLOOR + 0.04, 9.25, qf);
      K.box(0.38, 0.06, 0.06, M.iron, x + 0.15, FLOOR + 1.88, 9.25, qf);
      qLamps.push(K.box(0.2, 0.26, 0.2, lampHead, x + 0.32, FLOOR + 1.64, 9.25, qf)); K.cone(0.17, 0.12, M.brassD, 6, x + 0.32, FLOOR + 1.84, 9.25, qf);
      const pool = K.box(1.4, 0.006, 1.0, K.glow(0xffc880, 0.07, true), x + 0.32, FLOOR + 0.01, 9.4, qf); pool.castShadow = false;
    }
    // beam pump: rocking beam over a sump, pipe back to the cliff
    const PX = -10.6, PZ = 9.6;
    { const pb = K.group(qf, PX, FLOOR, PZ);
      K.box(1.2, 0.16, 0.7, M.stoneD, 0, 0.08, 0, pb); K.box(0.16, 1.2, 0.16, M.iron, -0.1, 0.76, -0.12, pb); K.box(0.16, 1.2, 0.16, M.iron, -0.1, 0.76, 0.12, pb);
      K.box(0.5, 0.42, 0.42, M.rust, 0.48, 0.37, 0, pb); band(K, K.group(pb, 0.48, 0, 0), 0.24, 0.6, M.ironM, 0.06);
      const sump = K.cyl(0.42, 0.42, 0.02, M.water, 12, -0.62, 0.02, 0.0, pb); sump.castShadow = false; }
    const pumpBeam = K.dyn(K.group(qfA, PX - 0.1, FLOOR + 1.4, PZ));
    K.box(1.5, 0.12, 0.12, M.ironL, 0, 0, 0, pumpBeam); K.box(0.24, 0.24, 0.24, M.brassD, -0.72, 0, 0, pumpBeam); K.box(0.3, 0.4, 0.2, M.ironM, 0.72, -0.05, 0, pumpBeam);
    const pumpRod = K.dyn(K.box(0.05, 1.0, 0.05, M.iron, PX - 0.82, FLOOR + 0.9, PZ, qfA));
    // the geothermal plant (POWER) sits at the right end: keep that corner clear

    // ================================================================ COLLECTOR belt (right -> left along the cliff foot)
    const col = K.group(statics), colA = K.group(anim);
    const CW2 = 0.76;
    const ca = CPh.points[0], cb = CPh.points[CPh.points.length - 1];
    const cLen = Math.hypot(cb[0] - ca[0], cb[2] - ca[2]), cYaw = Math.atan2(-(cb[2] - ca[2]), cb[0] - ca[0]);
    const s1 = cLen - 0.62; // stop short of the lift cage
    const cg = K.group(col, ca[0], ca[1], ca[2]); cg.rotation.y = cYaw;
    const cTwin = K.group(colA, ca[0], ca[1], ca[2]); cTwin.rotation.y = cYaw;
    const ns = Math.cos(cYaw) >= -0.01 ? 1 : -1; // local z sign of the camera side
    const beltT = beltTex(K); beltT.repeat.set(s1 * 2, 1);
    const beltTop = K.mat(0xffffff, { map: beltT, shine: 26, spec: 0x2a2620 });
    K.box(s1, 0.1, CW2, [M.soot, M.soot, beltTop, M.soot, M.soot, M.soot], s1 / 2, -0.05, 0, cg);
    K.box(s1, 0.04, CW2 * 0.86, M.soot, s1 / 2, -0.28, 0, cg);
    for (let x = 0.2; x < s1; x += 0.42) { const r = K.cyl(0.07, 0.07, CW2 + 0.04, M.ironXL, 6, x, -0.16, 0, cg); r.rotation.x = Math.PI / 2; }
    const chase = [0, 1, 2, 3].map(() => K.glow(0x4a2208));
    for (const s of [-1, 1]) {
      K.box(s1 + 0.1, 0.28, 0.08, M.iron, s1 / 2, -0.12, s * (CW2 / 2 + 0.05), cg);
      K.box(s1 + 0.1, 0.05, 0.14, s === ns ? M.rustL : M.rust, s1 / 2, 0.04, s * (CW2 / 2 + 0.07), cg);
      for (let x = 0.2; x < s1; x += 0.4) K.box(0.06, 0.06, 0.03, M.brassL, x, -0.1, s * (CW2 / 2 + 0.1), cg);
    }
    { let n = 0; for (let x = 0.45; x < s1 - 0.2; x += 0.95) { K.box(0.12, 0.07, 0.05, chase[n % 4], x, -0.02, ns * (CW2 / 2 + 0.11), cg); n++; } }
    for (let x = 0.6; x < s1 - 0.3; x += 1.5) { K.box(0.5, ca[1] - 0.26 - FLOOR, CW2 + 0.3, M.stoneD, x, -(ca[1] - FLOOR) / 2 - 0.13, 0, cg); }
    for (let x = 0.3; x < s1; x += 1.3 + rr()) { const d = K.box(0.25 + rr() * 0.4, 0.2, 0.01, M.grime, x, -0.15, ns * (CW2 / 2 + 0.096), cg); d.castShadow = false; }
    const hubs = [], splices = [];
    const cap = (x, dir) => {
      const d = K.cyl(0.12, 0.12, CW2 + 0.1, M.ironL, 10, x, -0.08, 0, cg); d.rotation.x = Math.PI / 2;
      K.box(0.04, 0.24, CW2 + 0.2, HZ, x + dir * 0.13, -0.12, 0, cg);
      for (const s of [-1, 1]) K.box(0.16, 0.16, 0.05, M.brassD, x, -0.08, s * (CW2 / 2 + 0.12), cg);
      const hb = K.dyn(K.group(cTwin, x, -0.08, ns * (CW2 / 2 + 0.16)));
      K.cyl(0.11, 0.11, 0.03, M.ironXL, 10, 0, 0, 0, hb).rotation.x = Math.PI / 2;
      for (let k = 0; k < 3; k++) { const sk = K.box(0.2, 0.035, 0.04, M.soot, 0, 0, 0.01, hb); sk.rotation.z = k * Math.PI / 3; }
      K.bake(hb); hubs.push(hb);
    };
    cap(0, -1); cap(s1, 1);
    for (let k = 0; k < 6; k++) { const sp = K.dyn(K.group(cTwin, 0, 0.006, 0)); K.box(0.05, 0.014, CW2 * 0.94, M.brassL, 0, 0, 0, sp); for (const z of [-0.24, 0, 0.24]) K.box(0.08, 0.02, 0.04, M.soot, 0, 0.004, z, sp); K.bake(sp); splices.push({ m: sp, ph: k * s1 / 6 }); }
    // drive unit at the tail end (camera side): motor, gearbox, spinning gears
    const dgs = [];
    { const lx = 0.9, side = ns; const dg = K.group(cg, lx, 0, side * (CW2 / 2 + 0.42)); const h = ca[1] - FLOOR;
      K.box(0.62, h - 0.12, 0.5, M.ironM, 0, -h / 2 - 0.06, 0, dg); K.box(0.72, 0.08, 0.6, M.rust, 0, -0.06, 0, dg);
      const mot = K.cyl(0.18, 0.18, 0.45, M.iron, 10, -0.05, -h + 0.32, side * 0.12, dg); mot.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) { const f = K.cyl(0.21, 0.21, 0.03, M.ironL, 10, -0.05, -h + 0.32, side * (-0.06 + i * 0.09), dg); f.rotation.x = Math.PI / 2; }
      K.box(0.86, 0.36, 0.06, M.hazard, 0.05, -0.15, side * 0.3, dg);
      const mv = K.group(cTwin, lx, 0, side * (CW2 / 2 + 0.42 + 0.34));
      const big = gear(K, mv, 0.26, 0.08, 14, M.brass, 0.0, 0.02, 0); big.rotation.x = Math.PI / 2;
      const small = gear(K, mv, 0.13, 0.08, 8, M.brassL, 0.33, -0.14, 0); small.rotation.x = Math.PI / 2;
      dgs.push({ g: big, s: 1 }, { g: small, s: -2 }); }

    // ================================================================ ORE LIFT (paternoster in an iron headframe)
    const lift = K.group(statics), liftA = K.group(anim);
    const CZc = LZ - 0.58;                       // chain plane, behind the cages
    const XR = LX + 0.66, XL = DX - 0.66;        // tower posts
    const ZF = LZ + 0.68, ZK = LZ - 0.68;        // front / back post rows
    const HT = LT + 4.4;                         // headframe platform
    for (const px of [XR, XL]) for (const pz of [ZK, ZF]) {
      K.box(0.2, HT - FLOOR, 0.2, M.iron, px, (HT + FLOOR) / 2, pz, lift);
      for (let y = FLOOR + 0.5; y < HT; y += 0.9) K.box(0.25, 0.05, 0.25, M.brassD, px, y, pz, lift);
    }
    for (let y = FLOOR + 0.9; y <= HT - 0.3; y += 1.5) {
      K.box(XR - XL, 0.1, 0.1, M.ironM, (XR + XL) / 2, y, ZF, lift);
      const open = y > LT - 1.0 && y < LT + 1.5;
      if (open) { K.box(LX - 0.5 - XL, 0.1, 0.1, M.ironM, (XL + LX - 0.5) / 2, y, ZK, lift); K.box(XR - (LX + 0.5), 0.1, 0.1, M.ironM, (XR + LX + 0.5) / 2, y, ZK, lift); }
      else K.box(XR - XL, 0.1, 0.1, M.ironM, (XR + XL) / 2, y, ZK, lift);
      for (const px of [XR, XL]) K.box(0.1, 0.1, ZF - ZK, M.ironM, px, y, LZ, lift);
    }
    // X-bracing on the outer (left) face and lower front bay
    for (let y = FLOOR + 0.9; y < HT - 1.6; y += 3.0) { strut(K, lift, [XL, y, ZF + 0.02], [XL, y + 1.5, ZK + 0.02], 0.07, M.ironM); }
    for (let y = FLOOR + 0.9; y < LB + 3.0; y += 1.5) strut(K, lift, [XL + 0.05, y, ZF + 0.05], [(XL + XR) / 2 - 0.65, y + 1.5, ZF + 0.05], 0.07, M.ironM);
    // guide rails beside each column
    for (const cx of [LX, DX]) for (const sx of [-0.47, 0.47]) K.box(0.05, HT - FLOOR - 0.4, 0.05, M.rail, cx + sx, (HT + FLOOR) / 2 - 0.2, LZ - 0.36, lift);
    // chain loop: up behind the loaded column, over the head wheel, down behind the return column, round the boot wheel
    const WX = (LX + DX) / 2, WR = (LX - DX) / 2, WYT = LT + 2.9, WYB = LB - 0.75;
    const chUp = chainBar(K, lift, LX, WYB, WYT, CZc, 0.08), chDn = chainBar(K, lift, DX, WYB, WYT, CZc, 0.08);
    const headW = wheel(K, liftA, WR, M.brassD, WX, WYT, CZc, 8), bootW = wheel(K, liftA, WR, M.ironL, WX, WYB, CZc, 6);
    for (const y of [WYT, WYB]) { K.cyl(0.09, 0.09, 0.9, M.iron, 8, WX, y, CZc - 0.25, lift).rotation.x = Math.PI / 2; K.box(0.3, 0.3, 0.2, M.ironM, WX, y, CZc - 0.55, lift); }
    // headframe platform + railing + sheaves on top + sign + beacon
    K.box(XR - XL + 0.5, 0.16, ZF - ZK + 0.5, M.ironM, (XR + XL) / 2, HT, LZ, lift);
    K.box(XR - XL + 0.5, 0.1, 0.06, HZ, (XR + XL) / 2, HT - 0.02, ZF + 0.26, lift);
    for (const x of [XL - 0.2, XR + 0.2]) K.box(0.07, 0.6, ZF - ZK + 0.4, M.iron, x, HT + 0.35, LZ, lift);
    const sheaves = [LX, DX].map((x) => wheel(K, liftA, 0.6, M.brass, x, HT + 0.88, LZ + (x === LX ? 0.06 : -0.06), 6));
    for (const x of [LX, DX]) { K.cyl(0.1, 0.1, 0.55, M.ironL, 8, x, HT + 0.88, LZ, lift).rotation.x = Math.PI / 2; K.box(0.14, 0.8, 0.14, M.ironM, x, HT + 0.45, LZ - 0.28, lift); }
    const liftSign = sign(K, lift, 'ORE LIFT', '#ffb040', WX, HT - 0.62, ZF + 0.12, 0.55);
    const beaconM = K.mat(0x401010, { e: 0 });
    K.box(0.06, 1.4, 0.06, M.iron, XL - 0.2, HT + 0.7, ZF, lift); K.sph(0.13, beaconM, XL - 0.2, HT + 1.45, ZF, lift, 8, 6);
    // counterweight on its own guide outside the tower, cable over a pulley to the left sheave
    const CWX = XL - 0.45;
    for (const sz of [-0.2, 0.2]) K.box(0.05, HT - FLOOR - 1.0, 0.05, M.rail, CWX, (HT + FLOOR) / 2 - 0.3, LZ + sz, lift);
    const cwPul = wheel(K, liftA, 0.2, M.brassD, CWX, HT + 0.9, LZ, 4);
    K.box(DX - CWX, 0.03, 0.03, M.soot, (DX + CWX) / 2, HT + 1.1, LZ, lift);
    const cwG = K.dyn(K.group(liftA, CWX, LT + 1.0, LZ));
    K.box(0.34, 0.86, 0.34, M.ironM, 0, 0, 0, cwG); for (const yy of [-0.3, 0, 0.3]) K.box(0.37, 0.06, 0.37, M.brassD, 0, yy, 0, cwG); K.box(0.36, 0.2, 0.02, HZ, 0, -0.3, 0.18, cwG);
    const cwCable = K.dyn(K.box(0.03, 1, 0.03, M.soot, CWX, 0, LZ, liftA));
    // lamps along the shaft that light up as cages pass, a depth dial at the top, a gauge board at the bottom
    const shaftLamps = [];
    for (let y = LB + 1.6; y <= LT - 0.5; y += 2.4) { const m = K.mat(0x3a2a10, { e: 0 }); K.box(0.16, 0.16, 0.1, m, XR + 0.02, y, ZF + 0.12, lift); shaftLamps.push({ m, y }); }
    const dial = K.group(lift, XR + 0.45, LT + 0.6, ZF + 0.08);
    { const rim = K.cyl(0.28, 0.28, 0.06, M.brass, 14, 0, 0, 0, dial); rim.rotation.x = Math.PI / 2; const f = K.cyl(0.24, 0.24, 0.07, M.cream, 14, 0, 0, 0.01, dial); f.rotation.x = Math.PI / 2; for (let i = 0; i < 7; i++) { const a = -2.2 + i * 0.73; K.box(0.02, 0.05, 0.02, M.soot, Math.sin(a) * 0.19, Math.cos(a) * 0.19, 0.05, dial).rotation.z = -a; } K.box(0.06, 0.6, 0.06, M.iron, -0.3, -0.1, -0.04, dial); }
    const dialN = K.dyn(K.group(liftA, XR + 0.45, LT + 0.6, ZF + 0.16)); K.box(0.025, 0.2, 0.02, M.red, 0, 0.09, 0, dialN);
    const gb = K.group(lift, XR + 0.62, FLOOR + 1.05, ZF + 0.02);
    K.box(0.08, 1.1, 0.08, M.iron, 0, -0.5, -0.06, gb); K.box(0.7, 0.55, 0.06, M.ironM, 0, 0.1, 0, gb); K.box(0.74, 0.04, 0.08, M.brassD, 0, 0.39, 0, gb);
    { const f = K.cyl(0.17, 0.17, 0.04, M.cream, 12, -0.15, 0.1, 0.04, gb); f.rotation.x = Math.PI / 2; }
    const gbLamps = [0x30ff60, 0xffb030, 0xff3020].map((c, i) => { const m = K.mat(0x140c08, { e: 0 }); K.box(0.09, 0.09, 0.04, m, 0.18, 0.26 - i * 0.15, 0.04, gb); return { m, c }; });
    const gbN = K.dyn(K.group(liftA, XR + 0.47, FLOOR + 1.15, ZF + 0.1)); K.box(0.02, 0.14, 0.02, M.red, 0, 0.06, 0, gbN);
    // boot: pit under the bottom run, a rust housing, spilled ore
    K.box(XR - XL - 0.2, 0.02, 0.8, M.black, (XR + XL) / 2, FLOOR + 0.004, CZc + 0.1, lift);
    K.box(XR - XL + 0.3, 0.3, 0.2, M.rust, (XR + XL) / 2, FLOOR + 0.15, ZK - 0.05, lift);
    for (let i = 0; i < 6; i++) K.rock(0.1 + rr() * 0.08, M.soot, (XR + XL) / 2 + R() * 2.2, FLOOR + 0.06, ZF + 0.25 + rr() * 0.4, lift);
    K.box(0.5, 0.04, CW2, M.ironL, LX + 0.62, LB - 0.03, LZ, lift); // transfer plate from the belt into the cage
    // top landing: grating + the stop the cage pauses at, hazard edge
    K.box(0.7, 0.05, 0.5, M.ironM, XR + 0.15, LT - 0.1, ZF - 0.1, lift);
    keepOut(TX0 - 0.2, TX1 + 0.2, FLOOR, TOP);

    // empty cages: a loop from the drop at the top -> over -> down the return column -> along the bottom -> waiting
    function cageLoop(path, side, rise) {
      const p0 = path.points[0], p1 = path.points[path.points.length - 1];
      const x = p0[0], z = p0[2], yb = p0[1], yt = p1[1], dxr = x + side * 1.25;
      const pts = [[x, yt], [x, yt + rise], [dxr, yt + rise], [dxr, yb], [x, yb]];
      const segs = []; let len = 0;
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, L0: len }); len += l; }
      const at = (u, out) => { u = Math.max(0, Math.min(len, u)); let s = segs[0]; for (const q of segs) if (u >= q.L0) s = q; const k = (u - s.L0) / s.l; out[0] = s.a[0] + (s.b[0] - s.a[0]) * k; out[1] = s.a[1] + (s.b[1] - s.a[1]) * k; return out; };
      const L = { path, z, yb, len, at, live: [], pool: [], v: 0 };
      L.get = () => { const c = L.pool.pop() || (() => { const g = K.dyn(makeCage(K)); liftA.add(g); return g; })(); c.visible = true; return c; };
      return L;
    }
    const loops = [];
    const oreLoop = cageLoop(LP, -1, 1.6); loops.push(oreLoop);
    [oreLoop.len, oreLoop.len - 1.4, oreLoop.len - 2.8].forEach((u) => oreLoop.live.push({ g: oreLoop.get(), u }));
    if (P.freight && P.freight.kind === 'lift') { const fl = cageLoop(P.freight, -1, 1.6); loops.push(fl); [fl.len, fl.len - 1.4].forEach((u) => fl.live.push({ g: fl.get(), u })); }
    const loopOf = (name) => loops.find((l) => l.path.name === name);

    // ================================================================ THE KEEL: rock tapering into the dark below the quarry floor
    const keel = K.group(statics), keelA = K.group(anim);
    const KB = [ // [yTop, yBot, front, colour, texture]
      [FLOOR - 0.38, FLOOR - 1.8, QZ1 - 0.04, 0x9a8670, sedA],
      [FLOOR - 1.8, FLOOR - 3.8, QZ1 - 0.62, 0x7c7e8a, sedB],
      [FLOOR - 3.8, FLOOR - 6.2, QZ1 - 1.7, 0x6a5e56, sedA],
      [FLOOR - 6.2, FLOOR - 9.0, QZ1 - 3.1, 0x4e505a, sedB],
      [FLOOR - 9.0, FLOOR - 12.2, QZ1 - 4.9, 0x45434c, sedA],
      [FLOOR - 12.2, FLOOR - 17.5, QZ1 - 7.1, 0x3a3842, sedB]
    ];
    const keelMats = KB.map((b) => K.mat(b[3], { map: b[4], e: 0x0a0604 }));
    const keelAt = (y) => { for (let i = 0; i < KB.length; i++) if (y <= KB[i][0] && y > KB[i][1]) return i; return KB.length - 1; };
    const keelBottom = (x) => FLOOR - 2.2 - 13.0 * Math.pow(Math.max(0, 1 - ((x - 0.8) / 20.6) ** 2), 1.1);
    const tips = [], keelBottoms = [];
    for (let ci = 0; ci < COLS; ci++) {
      const x0 = QX0 + ci * CW, x1 = x0 + CW, xc = (x0 + x1) / 2;
      const raw = keelBottom(xc) + R() * 1.2;
      const yb = FLOOR - 0.38 - 1.2 * Math.ceil((FLOOR - 0.38 - raw) / 1.2);
      KB.forEach((b, bi) => {
        const yt = b[0], ybb = Math.max(b[1], yb); if (yt <= ybb) return;
        rockPiece(x0, x1, ybb, yt, b[2] + R() * 0.22, keelMats[bi], 2.2);
        if (bi >= 1 && rr() < 0.3 && yt - ybb > 1.4) rockPiece(x0 + CW * 0.25, x1 - CW * 0.3, ybb, yt, b[2] + 0.45, keelMats[bi], 2.2);
        if (yt - ybb > 0.9) for (let i = 0; i < 1 + Math.floor(rr() * 2); i++) { const w = 0.6 + rr() * 1.1, h = 0.35 + rr() * Math.min(1.0, yt - ybb - 0.3), d = 0.1 + rr() * 0.12; worldBox(K, w, h, d, keelMats[bi], x0 + w / 2 + rr() * (CW - w), ybb + h / 2 + 0.1 + rr() * Math.max(0, yt - ybb - h - 0.2), b[2] + d / 2 - 0.03, rockG, S); }
      });
      const fz = KB[keelAt(yb + 0.1)][2];
      const n = 2 + Math.floor(rr() * 3);
      for (let i = 0; i < n; i++) {
        const L = 0.8 + rr() * (yb < FLOOR - 8 ? 3.0 : 1.6), sx = x0 + 0.3 + rr() * (CW - 0.6), sz = fz - 0.3 - rr() * 1.3;
        const c = K.cone(0.26 + rr() * 0.32, L, keelMats[keelAt(yb + 0.1)], 6, sx, yb - L / 2 + 0.05, sz, keel); c.rotation.x = Math.PI; c.rotation.y = rr() * 3;
        tips.push([sx, yb - L, sz]);
      }
      keelBottoms.push([xc, yb, fz - 0.7]);
    }
    // seams between the keel bands
    for (let bi = 1; bi < KB.length; bi++) {
      const yb = KB[bi][0], fz = KB[bi][2], fzUp = KB[bi - 1][2];
      for (let ci = 0; ci < COLS; ci++) { const kb = keelBottoms[ci]; if (kb[1] >= yb - 0.2) continue; const xc = QX0 + (ci + 0.5) * CW; K.box(CW, 0.08, 0.04, seamM, xc, yb - 0.05, fz + 0.03, keel); K.box(CW, 0.05, 0.05, lipM, xc, yb + 0.025, fzUp + 0.02, keel); K.box(CW, 0.6, 0.02, M.ao, xc, yb - 0.32, fz + 0.035, keel).castShadow = false; }
    }
    // roots / pipes hanging out of the keel
    keelBottoms.filter((k) => k[1] < FLOOR - 4).forEach((k, i) => {
      if (i % 2) return; const [x, y, z] = k; const L = 2 + rr() * 3;
      K.tube([[x, y + 0.3, z + 0.3], [x + R() * 0.8, y - L * 0.4, z + 0.5], [x + R() * 1.4, y - L, z + 0.4 + R() * 0.6]], 0.08 + rr() * 0.08, rr() < 0.5 ? M.rust : M.ironM, keel, 10, 5);
    });
    // chains swinging from the keel and the floor's lip, with hooks and lanterns
    const keelChains = [];
    keelBottoms.forEach((k, i) => {
      if (i % 3 !== 1) return;
      const piv = K.dyn(K.group(keelA, k[0] + 0.5, k[1] + 0.1, k[2] + 0.4)); const L = 2 + rr() * 2.5;
      chainBar(K, piv, 0, 0, -L, 0, 0.06);
      K.torus(0.16, 0.04, M.ironL, 4, 10, 0, -L - 0.15, 0, piv, Math.PI * 1.4);
      K.bake(piv); keelChains.push({ piv, ph: rr() * 6 });
    });
    for (const [x, L] of [[-13.4, 2.2], [-4.8, 1.6], [3.4, 2.6], [11.2, 1.8]]) {
      const piv = K.dyn(K.group(keelA, x, FLOOR - 0.3, QZ1 + 0.18));
      chainBar(K, piv, 0, 0, -L, 0, 0.04);
      const c = K.group(piv, 0, -L - 0.2, 0);
      K.box(0.26, 0.04, 0.26, M.brassD, 0, 0.18, 0, c); K.box(0.26, 0.04, 0.26, M.brassD, 0, -0.18, 0, c);
      for (const sx of [-0.12, 0.12]) for (const sz of [-0.12, 0.12]) K.box(0.03, 0.36, 0.03, M.iron, sx, 0, sz, c);
      K.box(0.14, 0.22, 0.14, lampHead, 0, 0, 0, c);
      lanterns.push({ piv, ph: rr() * 6 });
    }
    // the deep glow: a smelter in the keel's belly, a slag stream falling into the abyss, a haze from far below
    const kfX = 0.8, kfY = keelBottom(0.8) + 1.2, kfZ = KB[keelAt(kfY)][2] + 0.4;
    const kf = K.group(keel, kfX, kfY, kfZ);
    K.cyl(1.2, 0.9, 1.6, M.iron, 10, 0, 0, 0, kf); band(K, kf, 1.22, 0.5, M.rust, 0.14); band(K, kf, 1.0, -0.6, M.brassD, 0.12);
    const kfGlow = []; for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; const w = K.box(0.18, 0.7, 0.06, K.glow(0xff7a2a), Math.sin(a) * 1.08, 0, Math.cos(a) * 1.08, kf); w.rotation.y = a; kfGlow.push(w); }
    K.cone(0.9, 0.9, M.ironM, 10, 0, -1.25, 0, kf).rotation.x = Math.PI;
    const deepHaze = K.sph(6.5, K.glow(0xff5a18, 0.1, true), kfX, kfY - 5.5, kfZ - 2, keel, 12, 8); deepHaze.castShadow = false;
    const deepHaze2 = K.sph(3.4, K.glow(0xff8a3a, 0.12, true), kfX, kfY - 2.5, kfZ, keel, 10, 8); deepHaze2.castShadow = false;
    slagFurnace(9.8, FLOOR - 2.6, 0.72, FLOOR - 30, KB[1][2] + 0.4);

    // ================================================================ LIGHTS (3)
    const lUpper = K.light(0xffb070, 2.0, 15, 6.5, yU + 1.4, 10.6, root);
    const lLower = K.light(0xffa860, 2.0, 15, -3.0, yL + 1.6, 10.6, root);
    const lDeep = K.light(0xff6a28, 2.6, 14, 2.0, FLOOR - 6.5, 13.0, root);

    // shadows: the rock and floors receive; only the big props cast (cheap shadow pass)
    statics.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    anim.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    [chuteG, lift].forEach((g) => g.traverse((o) => { if (o.isMesh && !o.material.transparent && !(o.material.isMeshBasicMaterial)) o.castShadow = true; }));
    qf.traverse((o) => { if (o.isMesh && o.position.y > FLOOR + 0.05 && !o.material.transparent && !o.material.isMeshBasicMaterial) o.castShadow = true; });
    [rockG, keel].forEach((g) => g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }));
    GAL.forEach(() => {}); gal.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });

    // ================================================================ EVENTS
    let tNow = 0, lastPick = -9, lastDrop = -9;
    const puff = (x, y, z, c, size, vy, spread, life) => K.spawn(root, x + RND() * spread, y, z + RND() * spread, RND() * 0.3, vy, RND() * 0.3 + 0.15, c, life || 2.6, size, -0.12);
    IRON.on('spawn', (d) => {
      const m = mines[d.src]; if (!m) return; m.flash = 1; m.go = (d.dur || 1.8) + 0.4;
      for (let i = 0; i < 8; i++) puff(m.mx + RND() * 1.2, m.y0 + 0.2, ZB + 0.6 + Math.random() * 0.5, Math.random() < 0.5 ? 0x7a6a58 : 0x5a4c3e, 0.09 + Math.random() * 0.06, 0.35 + Math.random() * 0.4, 0.3, 1.1);
      for (let i = 0; i < 12; i++) K.spawn(root, m.mx + RND() * 1.0, m.y0 + 0.4 + Math.random() * 1.2, ZB + 0.4, RND() * 2.0, 0.6 + Math.random() * 1.6, 0.6 + Math.random() * 1.6, Math.random() < 0.6 ? m.col : 0xfff0c0, 0.7, 0.05, 5, true);
    });
    const cartPool = [];
    IRON.on('carrierDrop', (e) => {
      if (e.carrier === 'cart') {
        const m = mines[e.item.src] || mines[(e.path || '').replace('cart-', '')]; if (!m) return;
        let g = cartPool.find((c) => !c.visible && c.userData.col === e.item.parts.src);
        if (!g) { g = K.dyn(makeCart(K, e.item.parts.src)); g.userData.col = e.item.parts.src; anim.add(g); }
        g.visible = true; g.position.copy(e.pos); g.quaternion.copy(e.quat);
        if (!cartPool.includes(g)) cartPool.push(g);
        m.fx.push({ g, t: 0, u: 0, lastU: 0, q0: e.quat.clone(), p0: e.pos.clone() });
        lastDrop = tNow;
      } else if (e.carrier === 'cage') {
        const L = loopOf(e.path); if (!L) return;
        L.live.push({ g: L.get(), u: 0 });
      }
    });
    IRON.on('carrierPick', (e) => {
      if (e.carrier !== 'cage') return;
      const L = loopOf(e.path); if (!L) return;
      if (e.pos.y > L.yb + 0.4) return; // put mid-way (warm start): no waiting cage to swap
      L.live.sort((a, b) => b.u - a.u);
      const w = L.live[0];
      if (w && w.u > L.len - 0.9) { L.live.shift(); w.g.visible = false; L.pool.push(w.g); }
      if (L === oreLoop) { lastPick = tNow; for (let i = 0; i < 6; i++) puff(LX, LB + 0.1, LZ + 0.3, 0x8a7a68, 0.12, 0.4, 0.5, 1.2); }
    });
    IRON.on('enter', (d) => {
      if (d.path !== 'collector' || !d.item || d.item.kind !== 'issue') return;
      const p = d.item.mesh.position, c = d.item.parts.src;
      for (let i = 0; i < 7; i++) K.spawn(root, p.x + RND() * 0.4, CY + 0.1, CZ + RND() * 0.4, RND() * 1.6, 0.4 + Math.random() * 0.9, RND() * 1.2 + 0.3, i % 3 ? 0x6a5a4a : c, 0.7, 0.05, 6, i % 3 === 0);
    });

    // ================================================================ UPDATE
    const v3 = new V3(), crank = new V3(), p3 = [0, 0, 0], p2 = [0, 0], qInv = new T.Quaternion(), qTip = new T.Quaternion(), qYaw = new T.Quaternion();
    const eul = new T.Euler(0, 0, 0, 'YZX'), xAxis = new V3(1, 0, 0), yAxis = new V3(0, 1, 0), ctr = new V3();
    const cartPaths = SRCS.map((s) => P['cart-' + s]);
    const chuteNames = new Set(SRCS.map((s) => 'chute-' + s));
    const tumbling = new Set();
    const prevS = new WeakMap();
    let dist = 0, tDrip = 0, tVent = 0, tSlag = 0, tQuench = 0;
    const yawOf = (q) => { eul.setFromQuaternion(q, 'YZX'); return eul.y; };
    const TIP_T = 1.05, TIP_A = 1.95;
    const tipAngle = (t) => t < 0.32 ? TIP_A * K.smooth(t / 0.32) : t < 0.58 ? TIP_A + Math.sin((t - 0.32) * 40) * 0.04 : TIP_A * (1 - K.smooth(Math.min(1, (t - 0.58) / 0.47)));
    return { update(t, dt) {
      tNow = t;
      // ---- carts on the rails: wheels roll with distance travelled, sparks off the rails
      cartPaths.forEach((rp) => rp.items.forEach((it) => {
        const cm = it.carrierMeshes && it.carrierMeshes.cart; if (!cm) return;
        const ls = cm.userData.ls === undefined ? it.s : cm.userData.ls; const ds = it.s - ls; cm.userData.ls = it.s;
        cm.userData.wheels.forEach((w) => (w.rotation.z -= ds / 0.1));
        if (ds > 0.001 && Math.random() < 0.05) K.spawn(root, it.mesh.position.x + RND() * 0.4, it.mesh.position.y - 0.3, it.mesh.position.z + RND() * 0.3, RND() * 0.6, 0.6 + Math.random(), RND() * 0.4 + 0.3, Math.random() < 0.5 ? 0xffc060 : 0xfff0c0, 0.35, 0.035, 5, true);
      }));
      ctx.items.forEach((it) => { if (it.emerge && it.carrierMeshes.cart) { const cm = it.carrierMeshes.cart; const z = it.mesh.position.z; const ls = cm.userData.lz === undefined ? z : cm.userData.lz; cm.userData.lz = z; cm.userData.wheels.forEach((w) => (w.rotation.z -= (z - ls) / 0.1)); } });
      // ---- per mine: turntable, dumper, gate, the empty cart's tip + roll into the siding, spawn flare, miner
      for (const src in mines) {
        const m = mines[src];
        // turntable follows a cart that's on it, else rests aligned with the tunnel
        let follow = null;
        const rp = P['cart-' + src];
        rp.items.forEach((it) => { if (it.s < 0.5) follow = it.mesh; });
        ctx.items.forEach((it) => { if (it.emerge && it.src === src && it.mesh.position.z > m.zc - 0.5) follow = it.mesh; });
        if (follow) m.tt.rotation.y = yawOf(follow.quaternion);
        else m.tt.rotation.y += (-Math.PI / 2 - m.tt.rotation.y) * Math.min(1, dt * 4);
        // the empty cart: clamp + tip toward the chute, the gate lifts, it rolls on into the EMPTIES tunnel
        let tipA = 0, gateOpen = 0;
        for (let i = m.fx.length - 1; i >= 0; i--) {
          const c = m.fx[i]; c.t += dt;
          if (c.t < TIP_T) {
            const a = tipAngle(c.t); tipA = Math.max(tipA, a);
            qTip.setFromAxisAngle(xAxis, a); c.g.quaternion.copy(qTip).multiply(c.q0);
            ctr.set(0, c.p0.y - m.pivY, c.p0.z - m.zc).applyAxisAngle(xAxis, a);
            c.g.position.set(c.p0.x, m.pivY + ctr.y, m.zc + ctr.z);
            if (c.t > 0.18 && c.t < 0.5 && Math.random() < 0.6) K.spawn(root, c.p0.x + RND() * 0.4, m.my + 0.2, m.zc + 0.5, RND() * 0.5, -0.2, 0.6 + RND() * 0.4, Math.random() < 0.7 ? 0x3a3028 : m.col, 0.6, 0.06, 6, false);
            if (c.t > 0.7) gateOpen = 1;
          } else {
            gateOpen = 1;
            c.u = Math.min(m.empPath.L, c.u + dt * 1.6 * Math.min(1, (c.t - TIP_T) * 2.5 + 0.15));
            m.empPath.at(c.u, p3);
            c.g.position.set(p3[0], c.p0.y, p3[1]);
            qYaw.setFromAxisAngle(yAxis, p3[2]); c.g.quaternion.slerp(qYaw, Math.min(1, dt * 10));
            c.g.userData.wheels.forEach((w) => (w.rotation.z -= (c.u - c.lastU) / 0.1)); c.lastU = c.u;
            if (c.u >= m.empPath.L - 1e-3) { c.g.visible = false; m.fx.splice(i, 1); }
          }
        }
        m.dmp.rotation.x = tipA;
        m.dGear.rotation.y = -tipA * 3;
        m.gateK += (gateOpen - m.gateK) * Math.min(1, dt * 6);
        m.gate.rotation.x = -m.gateK * 1.5;
        if (!m.on) continue;
        // spawn flare, lamps, semaphore, bell
        m.flash = Math.max(0, m.flash - dt * 1.1); m.go = Math.max(0, m.go - dt);
        const f = 0.55 + m.flash * 0.9 + Math.sin(t * 2.2 + m.ph) * 0.05;
        m.lampMs.forEach((lm) => { lm.emissiveIntensity = 0.85 * f * (0.92 + Math.sin(t * 13 + m.ph) * 0.08); });
        m.portalLamp.emissiveIntensity = 0.5 + m.flash * 1.6;
        if (m.backGlow) m.backGlow.material.opacity = 0.24 + m.flash * 0.55 + Math.sin(t * 3 + m.ph) * 0.04;
        if (m.floorGlow) m.floorGlow.material.opacity = 0.14 + m.flash * 0.4;
        m.sm.face.color.setScalar(0.78 + m.flash * 0.55);
        const goK = m.go > 0 ? 1 : 0; m.armP.rotation.z += ((goK ? 0.85 : 0) - m.armP.rotation.z) * Math.min(1, dt * 6);
        m.semLamp.emissive.setHex(goK ? 0x30ff60 : 0xff2a10);
        m.bell.rotation.z = m.go > 0 ? Math.sin(t * 22) * 0.5 * Math.min(1, m.go) : m.bell.rotation.z * 0.9;
        if (m.miner) {
          const ph = (t * 0.75 + m.ph) % 1, sw = ph < 0.6 ? -1.6 * (ph / 0.6) : -1.6 + 2.4 * ((ph - 0.6) / 0.4);
          m.miner.arms[1].rotation.x = Math.min(0.8, sw); m.miner.arms[0].rotation.x = Math.min(0.8, sw) * 0.6;
          if (ph > 0.97 && t - m.lastStrike > 0.5) { m.lastStrike = t; for (let i = 0; i < 8; i++) K.spawn(root, m.minerX + RND() * 0.2, m.y0 + 0.75 + Math.random() * 0.3, ZB + 0.15, RND() * 1.6, 0.6 + Math.random() * 1.2, 0.4 + Math.random() * 0.8, Math.random() < 0.5 ? m.col : 0xfff4d0, 0.45, 0.04, 6, true); }
        }
      }
      // ---- the cascade: ore tumbles end over end down the chutes, corners splash, grit trails
      chutes.forEach((ch) => ch.pth.items.forEach((it) => {
        if (it.kind === 'issue' && it.parts && it.parts.ore) {
          const ore = it.parts.ore; const a = it.s * 2.4 + it.num * 0.7;
          ore.rotation.set(a * 0.55, a * 0.25, -a); v3.set(0, 0.2, 0).applyEuler(ore.rotation); ore.position.set(-v3.x, 0.2 - v3.y, -v3.z);
          tumbling.add(it);
        }
        const ps = prevS.has(it) ? prevS.get(it) : it.s; prevS.set(it, it.s);
        ch.cornerS.forEach((cs, k) => {
          if (ps < cs && it.s >= cs) {
            const c = ch.cornerP[k];
            for (let i = 0; i < 9; i++) K.spawn(root, c[0] + RND() * 0.4, c[1] + 0.05, c[2] + 0.25, RND() * 2.2, 0.5 + Math.random() * 1.4, 0.3 + Math.random() * 0.9, i % 3 ? 0x5a4c40 : ch.col, i % 3 ? 0.8 : 0.5, i % 3 ? 0.06 : 0.045, 6, i % 3 === 0);
          }
        });
        if (Math.random() < dt * 9) { const p = it.mesh.position; K.spawn(root, p.x + RND() * 0.2, p.y + 0.1, p.z + 0.2, RND() * 0.6, -0.4 - Math.random(), 0.2, Math.random() < 0.7 ? 0x3a3028 : ch.col, 0.5, 0.035, 6, false); }
      }));
      tumbling.forEach((it) => { if (it.gone || !it.path || !chuteNames.has(it.path.name)) { if (it.parts && it.parts.ore) { it.parts.ore.rotation.set(0, 0, 0); it.parts.ore.position.set(0, 0, 0); } tumbling.delete(it); } });
      // ---- collector belt: texture, splices and hubs ride with the items; chasing lights (red when jammed)
      const cf = CPh.speed * CPh.flow;
      beltT.offset.x -= dt * 2 * cf;
      dist += dt * cf;
      splices.forEach((s) => { s.m.position.x = (dist + s.ph) % s1; });
      hubs.forEach((h) => (h.rotation.z -= dt * cf / 0.12));
      dgs.forEach((q) => (q.g.rotation.y += dt * q.s * 2.2 * CPh.flow));
      if (CPh.jammed) { const onb = Math.sin(t * 9) > 0; chase.forEach((mm) => mm.color.setHex(onb ? 0xff2a10 : 0x3a0804)); }
      else { const k = Math.floor(t * 5 * Math.max(0.2, CPh.flow)) % 4; chase.forEach((mm, i) => mm.color.setHex(i === (3 - k) ? 0xffb040 : 0x5a2a0a)); }
      // ---- lifts: cages square to the shaft, the chain + wheels run, empties ride the loop
      const stuck = LP.items.some((it) => it.atEnd);
      loops.forEach((L) => {
        const st = L.path.items.some((it) => it.atEnd);
        L.v += ((st ? 0 : L.path.speed) - L.v) * Math.min(1, dt * 4);
        L.path.items.forEach((it) => { const cm = it.carrierMeshes && it.carrierMeshes.cage; if (cm) cm.quaternion.copy(qInv.copy(it.mesh.quaternion).invert()); });
        L.live.sort((a, b) => b.u - a.u);
        L.live.forEach((c, i) => {
          const maxU = i === 0 ? L.len : L.live[i - 1].u - 1.35;
          c.u = Math.min(c.u + L.v * dt, Math.max(c.u, maxU));
          L.at(c.u, p2); c.g.position.set(p2[0], p2[1], L.z);
        });
      });
      const lv = oreLoop.v;
      chUp.userData.tex.offset.y -= lv * dt * 5 / 1; chDn.userData.tex.offset.y += lv * dt * 5;
      headW.rotation.z -= lv * dt / WR; bootW.rotation.z -= lv * dt / WR;
      sheaves.forEach((s, i) => (s.rotation.z += (i ? 1 : -1) * lv * dt / 0.6));
      cwPul.rotation.z += lv * dt / 0.2;
      // counterweight rides opposite the lead cage
      const lead = LP.items.reduce((mx, it) => Math.max(mx, it.mesh.position.y), LB);
      const cwT = LT + 0.6 - (lead - LB) / (LT - LB) * (LT - LB - 2.5);
      cwG.position.y += (cwT - cwG.position.y) * Math.min(1, dt * 2);
      { const top = HT + 0.75, bot = cwG.position.y + 0.43; cwCable.position.y = (top + bot) / 2; cwCable.scale.y = Math.max(0.05, top - bot); }
      dialN.rotation.z = 2.2 - (lead - LB) / (LT - LB) * 4.4;
      beaconM.emissive.setHex(Math.sin(t * 5) > 0.3 ? (stuck ? 0xffa010 : 0xff2a10) : 0);
      liftSign.face.color.setHex(stuck ? (Math.sin(t * 8) > 0 ? 0xffffff : 0x806040) : 0xc8c8c8);
      shaftLamps.forEach((Lm) => { const near = LP.items.some((it) => Math.abs(it.mesh.position.y - Lm.y) < 0.8); Lm.m.emissive.setHex(near ? 0xffc040 : stuck ? (Math.sin(t * 6) > 0 ? 0xff3010 : 0) : 0x3a2408); });
      const waiting = oreLoop.live.length && oreLoop.live[0].u > oreLoop.len - 0.05;
      gbLamps[0].m.emissive.setHex(waiting ? gbLamps[0].c : 0); gbLamps[1].m.emissive.setHex(t - lastPick < 1.2 || t - lastDrop < 1.2 ? gbLamps[1].c : 0); gbLamps[2].m.emissive.setHex(stuck && Math.sin(t * 8) > 0 ? gbLamps[2].c : 0);
      gbN.rotation.z = 1.2 - Math.min(1, LP.items.length / 6) * 2.4;
      // ---- lamps flicker, lanterns swing
      const fl = 0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.06;
      lampHead.color.setRGB(1, 0.72 * fl, 0.38);
      bulbs.forEach((b, i) => b.material.color.setRGB(1, 0.75 * (0.9 + Math.sin(t * 11 + i * 2) * 0.1), 0.44));
      if (!lUpper.isDummy) lUpper.intensity = 2.0 * fl;
      if (!lLower.isDummy) lLower.intensity = 2.0 * (0.9 + Math.sin(t * 9.1) * 0.05);
      lanterns.forEach((Ln) => { Ln.piv.rotation.z = Math.sin(t * 0.9 + Ln.ph) * 0.1; Ln.piv.rotation.x = Math.sin(t * 0.7 + Ln.ph * 1.3) * 0.06; });
      keelChains.forEach((c) => { c.piv.rotation.z = Math.sin(t * 0.6 + c.ph) * 0.12; });
      // ---- molten streams + quench + deep glow
      tSlag -= dt;
      streams.forEach((s, i) => {
        const w = 0.85 + Math.sin(t * 17 + i) * 0.12 + Math.random() * 0.08;
        s.core.scale.x = s.core.scale.z = w; s.outer.scale.x = s.outer.scale.z = 1.05 - (w - 0.85);
        s.outer.material.opacity = 0.42 + Math.sin(t * 9 + i) * 0.08;
        s.mouth.material.color.setRGB(1, 0.5 + Math.sin(t * 7 + i) * 0.08, 0.14);
        if (tSlag <= 0) K.spawn(root, s.spout[0] + RND() * 0.2, s.spout[1] - Math.random() * Math.min(s.len, 12) * 0.8, s.spout[2] + RND() * 0.2, RND() * 0.6, -2 - Math.random() * 3, RND() * 0.6, Math.random() < 0.5 ? 0xffd070 : 0xff7a2a, i === 0 ? 0.35 : 0.9, 0.06 + Math.random() * 0.05, 6, true);
      });
      if (tSlag <= 0) tSlag = 0.06;
      tQuench -= dt;
      if (tQuench <= 0) { tQuench = 0.08; puff(sp1[0], -8.05, sp1[2], Math.random() < 0.5 ? 0xd8d0c4 : 0xa8a094, 0.16 + Math.random() * 0.1, 0.9 + Math.random() * 0.5, 0.35, 1.8); }
      quenchGlow.material.opacity = 0.6 + Math.random() * 0.3;
      kfGlow.forEach((gw, i) => gw.material.color.setRGB(1, 0.42 + Math.sin(t * 6 + i) * 0.08, 0.1));
      deepHaze.material.opacity = 0.09 + Math.sin(t * 0.9) * 0.02; deepHaze2.material.opacity = 0.11 + Math.sin(t * 1.7) * 0.03;
      if (!lDeep.isDummy) lDeep.intensity = 2.6 * (0.85 + Math.sin(t * 2.3) * 0.08 + Math.random() * 0.05);
      // ---- gears, flywheel + piston, fans, pump
      gA.rotation.y += dt * 0.35; gB.rotation.y -= dt * 0.35 * 1.25 / 0.72;
      fw.rotation.z -= dt * 2.2;
      crankPin.getWorldPosition(crank); root.worldToLocal(crank);
      { const pinX = crank.x, pinY = crank.y, cx = pinX + Math.sqrt(Math.max(0.01, 2.0 * 2.0 - (pinY - FWY) ** 2));
        rod.position.set((pinX + cx) / 2, (pinY + FWY) / 2, fwZ + 0.3); rod.scale.x = Math.hypot(cx - pinX, FWY - pinY); rod.rotation.z = Math.atan2(FWY - pinY, cx - pinX); piston.position.x = cx + 0.35; }
      fans.forEach((fn, i) => (fn.bl.rotation.z += dt * (6 + i * 2)));
      gaugeN.rotation.z = -0.4 + Math.sin(t * 1.7) * 0.5;
      { const a = Math.sin(t * 1.6) * 0.32; pumpBeam.rotation.z = a; const ey = FLOOR + 1.4 - Math.sin(a) * 0.72; pumpRod.position.y = (ey + FLOOR + 0.3) / 2 - 0.2; pumpRod.scale.y = Math.max(0.2, ey - FLOOR - 0.5); }
      // ---- aether vein pulses
      aePulses.forEach((p) => { p.u = (p.u + dt * 0.45) % 1; p.m.position.copy(condCurve.getPoint(p.u)); p.m.scale.setScalar(0.8 + Math.sin(t * 9 + p.u * 10) * 0.25); });
      if (Math.random() < 0.06) { const c = crysAe[Math.floor(Math.random() * crysAe.length)]; K.spawn(root, c[0], c[1], c[2] + 0.3, RND() * 0.4, 0.3 + Math.random() * 0.5, 0.3, 0xbffff0, 1.0, 0.05, 0, true); }
      // ---- automatons walk their beats (stepping aside of the hoppers), the quarry cart gets pushed back and forth
      const walk = (a, x, y, z, fwd, sp, ph) => { a.g.position.set(x, y, z); a.g.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2; const s = Math.sin(t * sp + ph) * 0.5; a.legs[0].rotation.x = s; a.legs[1].rotation.x = -s; return s; };
      bots.forEach((b) => {
        const L = b.x1 - b.x0, ph = (t * b.sp / L + b.ph) % 2, fwd = ph < 1, k = fwd ? ph : 2 - ph;
        const x = b.x0 + K.smooth(k) * L;
        const nearHop = b.avoid.some((h) => Math.abs(h - x) < 0.7);
        const s = walk(b.a, x, b.y, nearHop ? b.z - 0.55 : b.z, fwd, 7, b.ph); b.a.arms[0].rotation.x = -s * 0.6; b.a.arms[1].rotation.x = s * 0.6;
        b.a.eye.material.color.setHex(Math.sin(t * 3 + b.ph) > 0.92 ? 0xffffff : 0xffc070);
      });
      { const lp = (t * 0.06) % 2, lk = K.smooth(lp < 1 ? lp : 2 - lp), lx = -6.0 + lk * 10.5; pushCart.position.x = lx; pushCart.userData.wheels.forEach((w) => (w.rotation.z = -lx / 0.1)); const fwd = lp < 1; walk(pusher, lx + (fwd ? -0.72 : 0.72), FLOOR, TRZ, fwd, 6, 0); pusher.arms[0].rotation.x = pusher.arms[1].rotation.x = -1.2; }
      // ---- drips, steam, vents
      tDrip -= dt; if (tDrip <= 0) { tDrip = 0.12; const d = tips[Math.floor(Math.random() * tips.length)]; K.spawn(root, d[0], d[1], d[2], 0, -0.5, 0, Math.random() < 0.7 ? 0x0a0806 : 0x6ad8c8, 1.6, 0.05, 7); }
      tVent -= dt; if (tVent <= 0) { tVent = 0.2; const vv = vents[Math.floor(Math.random() * vents.length)]; for (let i = 0; i < 2; i++) puff(vv[0], vv[1], vv[2] + 0.3, 0xa89c88, 0.16, 0.8, 0.2, 1.8); }
      if (Math.random() < 0.08) { const vv = valves[Math.floor(Math.random() * valves.length)]; if (vv) K.spawn(root, vv[0], vv[1], vv[2], 0, -0.4, 0, 0x0a0806, 1.2, 0.05, 6); }
      if (Math.random() < 0.12) fans.forEach((fn) => K.spawn(root, fn.x + RND() * fn.r, fn.y + RND() * fn.r, fn.z + 0.3, RND() * 0.3, 0.5, 0.5, 0x9a8a78, 1.0, 0.08, -0.1));
    } };
  });
}
