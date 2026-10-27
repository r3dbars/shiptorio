// =====================================================================
// WORLD · STRUCTURE (the shaft): IRON.world + IRON.look
// The three stepped floors (cobbled decks, iron-banded slab rims), the riser walls between them (brick foundry
// walls with furnace-lit arched windows, pilasters, pipes, gears, clocks, signs), the framing that ties the
// floors into one building (corner buttresses, fire-escape stairs, ladders), the floor name plates, the launch
// floor's back wall, the skyline behind it (chimneys, blast furnace, water tower, smoke), the airships, the hazy
// foundry city on both sides, yard props and workers, and the global look.
// Ported from the Black Iron mockup's world.js (docs/art/black-iron/modules/world.js): same palette, materials,
// textures, props and level of detail. Everything is placed from ctx (tiers, stations, paths), and every prop
// checks the keep-out (machine bays, paths ±0.7, lifts ±0.8, the lip belts) so any plan size stays clear.
// Static parts sit under one group and are merged by the shaft's bake; movers are marked K.dyn.
// =====================================================================

import { artPass } from '../backdrop-kit.js';
import { oldCity } from './city-old.js';

// 5px-tall pixel font (Silkscreen-like). Canvas text can't count on the web font being loaded at build time.
const GLYPH = {
  A: ['01110', '10001', '11111', '10001', '10001'], B: ['11110', '10001', '11110', '10001', '11110'], C: ['01111', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '11110', '10000', '11111'], F: ['11111', '10000', '11110', '10000', '10000'],
  G: ['01111', '10000', '10011', '10001', '01111'], H: ['10001', '10001', '11111', '10001', '10001'], I: ['111', '010', '010', '010', '111'],
  J: ['00111', '00001', '00001', '10001', '01110'], K: ['10001', '10010', '11100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001'], O: ['01110', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '11110', '10000', '10000'], Q: ['01110', '10001', '10001', '10011', '01111'], R: ['11110', '10001', '11110', '10010', '10001'],
  S: ['01111', '10000', '01110', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '01010', '00100'], W: ['10001', '10001', '10101', '11011', '10001'], X: ['10001', '01010', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100'], Z: ['11111', '00010', '00100', '01000', '11111'],
  0: ['01110', '10011', '10101', '11001', '01110'], 1: ['010', '110', '010', '010', '111'], 2: ['11110', '00001', '01110', '10000', '11111'],
  3: ['11110', '00001', '00110', '00001', '11110'], 4: ['10010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '11110'],
  6: ['01110', '10000', '11110', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '00100'], 8: ['01110', '10001', '01110', '10001', '01110'],
  9: ['01110', '10001', '01111', '00001', '01110'], '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
  '.': ['0', '0', '0', '0', '1'], '!': ['1', '1', '1', '0', '1'], ':': ['0', '1', '0', '1', '0'], '/': ['001', '001', '010', '100', '100'],
  '#': ['01010', '11111', '01010', '11111', '01010'], "'": ['1', '1', '0', '0', '0'], '&': ['0110', '1001', '0110', '1001', '0111'], ' ': ['00', '00', '00', '00', '00'],
};
const glyph = (ch) => GLYPH[ch] || GLYPH[ch.toUpperCase()] || GLYPH[' '];
function textW(text) { let w = 0; for (const ch of text) w += glyph(ch)[0].length + 1; return Math.max(0, w - 1); }
// draw text at canvas (x, y) (top-left), one font pixel = s canvas pixels
function pixText(g, text, x, y, s, col) {
  g.fillStyle = col; let cx = x;
  for (const ch of text) { const gl = glyph(ch); const w = gl[0].length; for (let r = 0; r < 5; r++) for (let c = 0; c < w; c++) if (gl[r][c] === '1') g.fillRect(cx + c * s, y + r * s, s, s); cx += (w + 1) * s; }
}
function srand(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export default function install(IRON) {
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

  // ---------- world-space texture tiles ----------
  const CB = 3.4; // cobbles: 128px per 3.4 units (the mockup's deck)
  const BRU = 4.1, BRV = 3.6; // bricks: 64px per 4.1 x 3.6 (the mockup's back wall)
  const STU = 2.64, STV = 2.5; // stone slab face
  const GRT = 0.9; // grating

  IRON.world(function (K, root, scene, ctx) {
    const THREE = K.THREE;
    const rnd = srand(20261027); // static layout: same every build
    const R = () => rnd() - 0.5;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const fails = [];
    const sect = (name, fn) => { try { fn(); } catch (e) { fails.push(name); console.error('[SHAFT] world/' + name + ':', e); } };

    IRON.look({
      sky: { top: '#1c120c', bottom: '#7a3a16', fog: '#3a2416', fogNear: 84, fogFar: 156 },
      light: { sun: 0xffc48e, sunI: 1.15, sunDir: [-12, 24, 16], hemiSky: 0xbcb4b0, hemiGnd: 0x46362a, hemiI: 1.15 },
      finish: { levels: 52, dither: 0.06, outline: 0.42, thresh: 0.1, ink: '#100806', sat: 1.02, contrast: 1.04, bloom: 0.7, bloomThresh: 0.64, vignette: 0.1, grade: 0.24, shadow: '#3a3050', high: '#ffd6a0', scan: 0 }
    });

    // ================= TEXTURES =================
    const mip = (t) => { t.generateMipmaps = true; t.minFilter = THREE.NearestMipmapLinearFilter; t.anisotropy = 4; t.needsUpdate = true; return t; };
    function cobbleTex() {
      return mip(K.canvasTex(128, 128, (g) => {
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
      }));
    }
    function brickTex(dark) {
      return mip(K.canvasTex(64, 64, (g) => {
        const r = srand(dark ? 9 : 7);
        g.fillStyle = dark ? '#24140e' : '#2e1a12'; g.fillRect(0, 0, 64, 64);
        const tones = dark ? ['#5e2a1c', '#522418', '#6a3020'] : ['#843e28', '#783420', '#904a30', '#6e3020', '#7c3a24'];
        for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < 64; x += 16) {
          g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 14, 6);
          g.fillStyle = 'rgba(255,210,170,0.10)'; g.fillRect(x + 1, y + 1, 14, 1);
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 6, 14, 1);
          if (r() < 0.07) { g.fillStyle = 'rgba(10,6,4,0.45)'; g.fillRect(x + 1, y + 1, 14, 6); }
        }
        for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(110,46,16,0.28)'; g.fillRect(Math.floor(r() * 60), 20 + r() * 10, 2, 30 + r() * 14); }
      }));
    }
    function stoneTex() {
      return mip(K.canvasTex(64, 64, (g) => {
        const r = srand(13);
        g.fillStyle = '#2a2018'; g.fillRect(0, 0, 64, 64);
        const tones = ['#76685a', '#6c5e4e', '#806e5c', '#685a4a'];
        for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
          g.fillStyle = tones[Math.floor(r() * 4)]; g.fillRect(x + 1, y + 1, 22, 14);
          g.fillStyle = 'rgba(255,230,190,0.10)'; g.fillRect(x + 2, y + 1, 20, 2);
          g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 2, y + 13, 20, 2);
        }
        for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(10,6,4,0.35)'; g.fillRect(r() * 64, 0, 2 + r() * 3, 64); }
      }));
    }
    function grateTex() {
      return mip(K.canvasTex(16, 16, (g) => {
        g.fillStyle = '#16120e'; g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#5a5048'; for (let i = 0; i < 16; i += 4) { g.fillRect(i, 0, 1, 16); g.fillRect(0, i, 16, 1); }
        g.fillStyle = '#3e3630'; for (let i = 0; i < 16; i += 4) g.fillRect(i + 1, 0, 1, 16);
      }));
    }
    // furnace-lit window glass: 4 cells (16x40) of glow with pixel silhouettes of the foundry inside; the top row
    // is lit (warm tint baked in), the bottom row the same panes dark, so lit and dark windows share one material
    function windowTex() {
      return K.canvasTex(64, 80, (g) => {
        for (const y0 of [0, 40]) for (let c = 0; c < 4; c++) {
          const x0 = c * 16;
          for (let y = 0; y < 40; y++) {
            const k = y / 39, kk = k * k;
            g.fillStyle = `rgb(${Math.round(86 + 140 * kk)},${Math.round(38 + 96 * kk)},${Math.round(18 + 44 * kk)})`; g.fillRect(x0, y0 + y, 16, 1);
          }
          g.fillStyle = 'rgba(255,200,120,0.55)'; g.fillRect(x0, y0 + 35, 16, 5);
          const sil = 'rgba(34,14,6,0.92)'; g.fillStyle = sil;
          if (c === 0) { // flywheel + post
            for (let y = 0; y < 40; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 10.5, y - 27); if (d > 4.2 && d < 6.2) g.fillRect(x0 + x, y0 + y, 1, 1); }
            g.fillRect(x0 + 10, y0 + 21, 1, 12); g.fillRect(x0 + 5, y0 + 27, 11, 1); g.fillRect(x0 + 2, y0, 2, 40);
          } else if (c === 1) { // hook on a chain under a beam
            g.fillRect(x0, y0 + 7, 16, 2); for (let y = 9; y < 22; y += 2) g.fillRect(x0 + 8, y0 + y, 1, 1);
            g.fillRect(x0 + 7, y0 + 22, 3, 1); g.fillRect(x0 + 9, y0 + 23, 1, 3); g.fillRect(x0 + 7, y0 + 25, 2, 1); g.fillRect(x0 + 6, y0 + 23, 1, 2);
          } else if (c === 2) { // pipes + a crucible pouring
            g.fillRect(x0 + 2, y0, 2, 40); g.fillRect(x0 + 12, y0, 2, 30);
            g.fillRect(x0 + 5, y0 + 31, 6, 6); g.fillRect(x0 + 4, y0 + 30, 8, 1);
            g.fillStyle = 'rgb(255,214,130)'; g.fillRect(x0 + 6, y0 + 29, 4, 1);
          } else { // roof truss + hanging lamp
            for (let i = 0; i < 16; i++) { g.fillRect(x0 + i, y0 + Math.round(12 - i * 0.6), 1, 1); g.fillRect(x0 + i, y0 + Math.round(3 + i * 0.6), 1, 1); }
            g.fillRect(x0 + 8, y0 + 12, 1, 7);
            g.fillStyle = 'rgb(255,226,150)'; g.fillRect(x0 + 7, y0 + 19, 3, 2);
          }
        }
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = '#d8c4b0'; g.fillRect(0, 0, 64, 40);
        g.fillStyle = '#3c3028'; g.fillRect(0, 40, 64, 40);
        g.globalCompositeOperation = 'source-over';
      });
    }
    // soot: dark at the top fading down (alpha), stretched over wall bands
    function sootTex() {
      return K.canvasTex(4, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(8,5,3,0.66)'); gr.addColorStop(0.5, 'rgba(8,5,3,0.22)'); gr.addColorStop(1, 'rgba(8,5,3,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); });
    }
    // orange haze rising from the depths (side city)
    function hazeTex() {
      const t = K.canvasTex(4, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(122,58,22,0)'); gr.addColorStop(0.55, 'rgba(110,52,22,0.45)'); gr.addColorStop(1, 'rgba(122,58,22,0.85)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); });
      t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
    }
    // enamel name plate: brass rim, gold pixel lettering with a drop shadow
    function plateTex(text, fg, bg) {
      const s = 2, tw = textW(text) * s, W = tw + 18, H = 5 * s + 14;
      return K.canvasTex(W, H, (g) => {
        g.fillStyle = bg || '#1c130c'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#9a7030'; g.fillRect(0, 0, W, 2); g.fillRect(0, H - 2, W, 2); g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
        g.fillStyle = '#3a2810'; g.fillRect(3, 3, W - 6, 1); g.fillRect(3, H - 4, W - 6, 1);
        g.fillStyle = '#c89a48'; for (const [x, y] of [[4, 5], [W - 6, 5], [4, H - 7], [W - 6, H - 7]]) g.fillRect(x, y, 2, 2);
        pixText(g, text, 9, 8, s, '#3a220c');
        pixText(g, text, 9, 7, s, fg || '#f0c060');
      });
    }
    // painted sign (works sign, shop signs): flat lettering, 1px per font pixel x s
    function signTexP(text, fg, bg, s) {
      s = s || 2; const W = textW(text) * s + 8, H = 5 * s + 8;
      return K.canvasTex(W, H, (g) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); pixText(g, text, 4, 4, s, fg); });
    }

    // ================= MATERIALS (one palette, reused so static parts merge) =================
    const M = {
      brass: K.mat(C.brass, { shine: 38, spec: 0x8a6a30 }), brassL: K.mat(C.brassL, { shine: 50, spec: 0xa88a48 }), brassD: K.mat(C.brassD, { shine: 22, spec: 0x4a3418 }),
      copper: K.mat(C.copper, { shine: 34, spec: 0x7a4a28 }), copperD: K.mat(C.copperD, { shine: 18 }),
      iron: K.mat(C.iron, { shine: 24, spec: 0x34343a }), ironM: K.mat(C.ironM, { shine: 18, spec: 0x2a2a30 }), ironL: K.mat(C.ironL, { shine: 30, spec: 0x44444a }),
      oil: K.mat(0x1a181e, { shine: 120, spec: 0xb0a0d0 }), sheen: K.glow(0x7a5aaa, 0.22, true),
      rust: K.mat(0x6a3418), rustL: K.mat(0x86481f), roofIron: K.mat(0x4a423a, { shine: 14 }), hazard: K.mat(C.hazard), hazardD: K.mat(0x1a140c),
      grime: K.mat(0x080604, { op: 0.42, depthWrite: false }), grimeL: K.mat(0x14100c, { op: 0.28, depthWrite: false }),
      rustStain: K.mat(0x7a3412, { op: 0.4, depthWrite: false }), paint: K.mat(0xc89a24, { op: 0.82, depthWrite: false }), paintW: K.mat(0xd8cfb8, { op: 0.55, depthWrite: false }),
      soot: K.mat(C.soot), verd: K.mat(C.verd, { shine: 20 }), verdD: K.mat(C.verdD),
      wood: K.mat(C.wood), woodD: K.mat(C.woodD), leather: K.mat(C.leather), canvas: K.mat(0x7a6a4e),
      brickD: K.mat(C.brickD), stone: K.mat(C.stone), stoneD: K.mat(C.stoneD),
      cream: K.mat(C.cream), red: K.mat(C.red), coal: K.mat(0x221e1c, { shine: 40, spec: 0x3a3a44 }),
      valve: K.mat(dd(0xa02a18)), ink: K.mat(0x140c06), redHand: K.mat(0x8a1a10), paper: K.mat(dd(0xe6dcc4, 0.9, 0.1)),
      gas: K.glow(C.gas), ember: K.glow(C.ember), teal: K.glow(C.teal),
      sil: K.mat(0x3e2a20), silD: K.mat(0x302016), silL: K.mat(0x4a3424),
    };
    M.cobble = K.mat(0xffffff, { map: cobbleTex() });
    M.brickW = K.mat(0xffffff, { map: brickTex(false) });
    M.brickC = K.mat(0xffffff, { map: brickTex(true) }); // chimneys, furnace
    M.stoneF = K.mat(0xffffff, { map: stoneTex() });
    M.grate = K.mat(0xffffff, { map: grateTex(), shine: 20, spec: 0x2a2a2a });
    M.sootG = K.mat(0xffffff, { map: sootTex(), op: 1, depthWrite: false });
    const winT = windowTex();
    const basic = (o) => new THREE.MeshBasicMaterial(Object.assign({ fog: false }, o));
    // materials whose color animates keep their own instance (the palette pass below leaves them alone)
    const keep = (m) => { m.userData.keep = true; return m; };
    // animated glows: they join the shared glow palette on a texel of their own that update() repaints each frame
    const anim = (m, name) => { m.userData.anim = name; return m; };
    M.win = basic({ map: winT }); M.winFlick = basic({ map: winT });
    M.winLo = basic({ color: 0x4a2e1c }); // boarded / unlit small panes
    M.cityWin = basic({ color: 0xe09a4a }); M.cityWin2 = basic({ color: 0xffd090 }); M.cityWinD = basic({ color: 0x9a5a2a });
    M.city = K.mat(0x3a2a20); M.cityD = K.mat(0x2a1c14); M.cityL = K.mat(0x4a3628);
    M.beacon = anim(K.glow(0xff3a20), 'beacon'); M.hatchGlow = anim(K.glow(0xff8a2a), 'hatch'); M.gasoM = K.mat(0x4e3a2c); M.hose = K.mat(0x5a2a1a);
    M.railTop = K.mat(0x9a9088, { shine: 70, spec: 0x8a8a8a });
    M.crow = K.mat(0x141218, { shine: 30, spec: 0x3a3a50 }); M.beak = K.mat(0x5a5040);
    M.gasLamp = anim(K.glow(C.gas), 'gas'); M.rimLamp = M.gasLamp; // street lamps, rim lamps, gondola windows flicker together
    M.ventA = anim(K.glow(0xff7a2a), 'vent'); M.ventB = M.ventA;
    M.oil = keep(M.oil); // glossy puddles keep their own shine

    // ================= GEOMETRY HELPERS =================
    // world-aligned UVs on an axis-aligned box (its parent sits at the root origin): textures line up across parts
    function wuv(m, su, sv) {
      const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, o = m.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + o.x, y = p.getY(i) + o.y, z = p.getZ(i) + o.z, ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
        if (ay > 0.5) uv.setXY(i, x / su, -z / sv); else if (ax > 0.5) uv.setXY(i, -z / su, y / sv); else uv.setXY(i, x / su, y / sv);
      }
      uv.needsUpdate = true; return m;
    }
    // cylinder UVs scaled to a tile (rounded around so the seam matches)
    function cuv(m, r, h, su, sv) { const uv = m.geometry.attributes.uv; const cu = Math.max(1, Math.round((2 * Math.PI * r) / su)), cv = h / sv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cu, uv.getY(i) * cv); uv.needsUpdate = true; return m; }
    const archCache = {};
    function archGeo(w, h, cell, row) {
      const key = w + '|' + h + '|' + cell + '|' + row; if (archCache[key]) return archCache[key];
      const s = new THREE.Shape(), hw = w / 2;
      s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, h); s.absarc(0, h, hw, 0, Math.PI, false); s.lineTo(-hw, 0);
      const g = new THREE.ShapeGeometry(s, 6), p = g.attributes.position, uv = g.attributes.uv, H = h + hw;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (cell + (p.getX(i) + hw) / w) / 4, (row ? 0 : 0.5) + 0.5 * Math.min(0.99, p.getY(i) / H));
      return (archCache[key] = g);
    }
    const noShadow = (m) => { m.castShadow = false; return m; };

    // ---------- part helpers (mockup) ----------
    function gear(p, r, thick, teeth, m, x, y, z) {
      const g = K.group(p, x, y, z);
      K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * (r * 1.08), 0, Math.cos(a) * (r * 1.08), g); tb.rotation.y = a; }
      K.cyl(r * 0.28, r * 0.28, thick * 1.6, M.ironM, 8, 0, 0, 0, g);
      if (r > 0.35) for (let i = 0; i < 4; i++) { const s = K.box(r * 1.4, thick * 1.1, r * 0.12, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 4; }
      if (r > 0.7) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(0.07, thick * 1.2, 0.07, M.brassL, Math.cos(a) * r * 0.8, 0, Math.sin(a) * r * 0.8, g); }
      return g;
    }
    // spoked wheel facing +z: returns the spinning group
    function wheel(p, r, m, x, y, z, spokes) {
      const w = K.group(p, x, y, z);
      K.torus(r, Math.max(0.05, r * 0.08), m, 6, 24, 0, 0, 0, w);
      if (r > 0.5) K.torus(r * 0.78, 0.025, M.brassD, 4, 20, 0, 0, 0, w);
      for (let i = 0; i < (spokes || 6); i++) { const s = K.box(r * 2 * 0.96, 0.06, 0.06, M.ironL, 0, 0, 0, w); s.rotation.z = i * Math.PI / (spokes || 6); }
      const hub = K.cyl(r * 0.2, r * 0.2, 0.2, M.brass, 10, 0, 0, 0, w); hub.rotation.x = Math.PI / 2;
      return w;
    }
    function rivetRing(p, r, y, n, m) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, m || M.brassL, Math.cos(a) * r, y, Math.sin(a) * r, p); } }
    function band(p, r, y, m, h) { K.cyl(r, r, h || 0.1, m || M.brass, 14, 0, y, 0, p); }
    function gauge(p, x, y, z, r, ry) {
      const g = K.group(p, x, y, z); g.rotation.y = ry || 0;
      const rim = K.cyl(r * 1.15, r * 1.15, 0.08, M.brass, 14, 0, 0, 0, g); rim.rotation.x = Math.PI / 2;
      const face = K.cyl(r, r, 0.1, M.cream, 14, 0, 0, 0.01, g); face.rotation.x = Math.PI / 2;
      const red = K.box(r * 0.5, r * 0.18, 0.02, M.valve, r * 0.45, r * 0.45, 0.065, g); red.rotation.z = -0.8;
      const piv = K.dyn(K.group(g, 0, 0, 0.07));
      K.box(0.035, r * 0.85, 0.02, M.ink, 0, r * 0.38, 0, piv);
      noCast.push(piv);
      return piv;
    }
    function puff(x, y, z, col, size, vy, spread, life) { K.spawn(root, x + K.R() * spread, y, z + K.R() * spread, K.R() * 0.3 + 0.2, vy, K.R() * 0.3, col, life || 2.6, size, -0.12); }
    function hazardStrip(x0, x1, y, z, w, h, d) { // alternating hazard paint blocks along x
      for (let x = x0; x < x1 - 0.01; x += w * 2) { K.box(Math.min(w, x1 - x), h, d, M.hazard, x + w / 2, y, z, S); if (x + w < x1) K.box(Math.min(w, x1 - x - w), h, d, M.hazardD, x + w * 1.5, y, z, S); }
    }

    // ================= KEEP-OUT (machine bays, paths, lifts, lip belts) =================
    const SEGS = [];
    for (const p of ctx.pathList) { const P = p.points; for (let i = 0; i < P.length - 1; i++) SEGS.push({ a: P[i], b: P[i + 1], kind: p.kind }); }
    const BIG = { planner: 3.25, assembler: 3.25, ci: 3.25, verify: 3.25, review: 3.25, gate: 3.25, launch: 3.25 };
    const RAD = { steam: 2.1, dynamo: 2.1, battery: 2.1, geothermal: 2.4, orbit: 2.7, measure: 2.5 };
    const TALL = { check: 6, steam: 4.6, dynamo: 4.6, battery: 4.6, geothermal: 5, orbit: 7, measure: 6 };
    function d2(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9; let k = ((px - ax) * dx + (pz - az) * dz) / l2; k = Math.max(0, Math.min(1, k)); return Math.hypot(px - ax - k * dx, pz - az - k * dz); }
    function d3(px, py, pz, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz || 1e-9; let k = ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / l2; k = Math.max(0, Math.min(1, k)); return Math.hypot(px - a[0] - k * dx, py - a[1] - k * dy, pz - a[2] - k * dz); }
    const extraKeep = []; // [x0, x1, z0, z1, y0, y1] boxes I build myself (stairs) so props avoid them
    const T = ctx.tiers, TB = T.build, TC = T.checks, TL = T.launch;
    // is a vertical capsule at (x, z) of radius r spanning y ya..yb in someone's way?
    function blocked(x, z, r, ya, yb) {
      r = r || 0.3;
      for (const st of ctx.stations) {
        if (yb < st.y - 0.5 || ya > st.y + (TALL[st.type] || 8)) continue;
        const dx = Math.abs(x - st.x), dz = Math.abs(z - st.z);
        if (BIG[st.type] !== undefined) { if (dx + dz < BIG[st.type] + r * 1.42) return true; }
        else if (st.type === 'check') { if (dx + dz < 2.0 + r * 1.42) return true; }
        else if (Math.hypot(dx, dz) < (RAD[st.type] || 2.1) + r) return true;
      }
      for (const s of SEGS) {
        const lo = Math.min(s.a[1], s.b[1]), hi = Math.max(s.a[1], s.b[1]);
        if (s.kind === 'lift') { if (yb < lo - 1 || ya > hi + 1.2) continue; if (d2(x, z, s.a[0], s.a[2], s.b[0], s.b[2]) < 0.8 + r) return true; }
        else if (s.kind === 'tube') { for (let k = 0; k <= 4; k++) if (d3(x, ya + (yb - ya) * k / 4, z, s.a, s.b) < 0.7 + r) return true; }
        else { if (yb < lo - 1.3 || ya > hi + 0.6) continue; if (d2(x, z, s.a[0], s.a[2], s.b[0], s.b[2]) < 0.7 + r) return true; }
      }
      if (ya < TC.y + 3 && yb > TC.y && z > TC.z1 - 1.2 - r && z < TC.z1 + 0.5 && x > TC.x0 - 1 && x < TC.x1 + 1) return true;
      if (ya < TL.y + 3 && yb > TL.y && z > TL.z1 - 1.2 - r && z < TL.z1 + 0.5 && x > TL.x0 - 1 && x < TL.x1 + 1) return true;
      for (const [x0, x1, z0, z1, y0, y1] of extraKeep) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r && yb > y0 && ya < y1) return true;
      return false;
    }
    // a free spot on a deck for a prop of radius r and height h
    function free(tier, x, z, r, h) {
      const t = tier, y = t.y + 0.1;
      if (x < t.x0 + r + 0.15 || x > t.x1 - r - 0.15 || z < t.z0 + r + 0.15 || z > t.z1 - r - 0.15) return false;
      return !blocked(x, z, r, y, y + (h || 1));
    }

    const S = K.group(root); S.name = 'static'; // everything static (merged per material at the end, see PRE-MERGE)
    // the far backdrop (city, skyline blocks, crane, gasometer): batches of its own (it neither casts nor catches
    // shadows), a handful of draw calls
    const FAR = K.group(root); FAR.name = 'far'; FAR.userData.noBake = true;
    const noCast = []; // noCast: small movers whose shadows nobody would see
    const DEC = 0.012; // decals sit this far above a deck top
    function decal(tier, x, z, w, d, m, ry, lift) { const b = K.box(w, 0.01, d, m, x, tier.y + 0.1 + (lift === undefined ? DEC : lift), z, S); b.rotation.y = ry || 0; b.castShadow = false; return b; }

    // ================= PROPS (mockup) =================
    function lampPost(x, y, z, h) {
      const g = K.group(S, x, y, z);
      K.cyl(0.22, 0.28, 0.22, M.iron, 8, 0, 0.11, 0, g);
      K.cyl(0.07, 0.09, h, M.iron, 8, 0, h / 2, 0, g);
      for (let i = 0; i < 3; i++) band(g, 0.1, 0.5 + i * (h * 0.3), M.brassD, 0.06);
      const arm = K.box(0.5, 0.06, 0.06, M.iron, 0.18, h - 0.1, 0, g); arm.rotation.z = 0.2;
      K.cyl(0.2, 0.14, 0.1, M.brass, 6, 0, h, 0, g);
      K.box(0.24, 0.34, 0.24, M.gasLamp, 0, h + 0.24, 0, g);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.035, 0.38, 0.035, M.iron, sx * 0.13, h + 0.24, sz * 0.13, g);
      K.cone(0.24, 0.24, M.brassD, 6, 0, h + 0.53, 0, g);
      K.sph(0.05, M.brassL, 0, h + 0.68, 0, g, 6, 4);
      noShadow(K.cyl(1.4, 1.4, 0.01, M.pool, 16, 0, 0.12, 0, g));
      return g;
    }
    M.pool = K.glow(0xffa050, 0.07, true);
    function barrel(x, y, z, m, tip) {
      const b = K.group(S, x, y, z);
      const body = K.group(b); if (tip) { body.rotation.z = Math.PI / 2; body.position.y = 0.32; body.rotation.y = tip; }
      K.cyl(0.32, 0.3, 0.8, m || M.wood, 10, 0, tip ? 0 : 0.4, 0, body);
      for (const yy of [0.15, 0.65]) K.cyl(0.33, 0.33, 0.06, M.iron, 10, 0, (tip ? -0.25 : 0) + yy, 0, body);
      if (!tip) K.cyl(0.25, 0.25, 0.02, M.oil, 10, 0, 0.81, 0, body);
      return b;
    }
    const drumMats = {};
    function drum(x, y, z, col, tip) {
      const b = K.group(S, x, y, z); const m = drumMats[col] || (drumMats[col] = K.mat(col, { shine: 20 }));
      const body = K.group(b); if (tip) { body.rotation.x = Math.PI / 2; body.position.y = 0.3; body.rotation.y = tip; }
      K.cyl(0.3, 0.3, 0.86, m, 12, 0, tip ? 0 : 0.43, 0, body);
      for (const yy of [0.2, 0.66]) K.cyl(0.31, 0.31, 0.04, M.ironM, 12, 0, (tip ? -0.43 : 0) + yy, 0, body);
      K.box(0.32, 0.18, 0.02, M.hazard, 0, (tip ? -0.43 : 0) + 0.43, 0.3, body);
      return b;
    }
    function crate(x, y, z, s, ry, m) {
      const g = K.group(S, x, y, z); g.rotation.y = ry || 0;
      K.box(s, s, s, m || M.woodD, 0, s / 2, 0, g);
      for (const d of [-1, 1]) { K.box(s * 1.02, 0.07, 0.07, M.wood, 0, s / 2, d * s * 0.5, g); K.box(0.07, s * 1.02, 0.07, M.wood, d * s * 0.42, s / 2, s * 0.51, g); }
      K.box(s * 1.02, 0.06, s * 1.02, M.wood, 0, s - 0.03, 0, g);
      K.box(s * 0.4, s * 0.25, 0.02, M.cream, 0, s * 0.55, s * 0.515, g);
      return g;
    }
    function toolbox(x, y, z, ry) {
      const g = K.group(S, x, y, z); g.rotation.y = ry || 0;
      K.box(0.6, 0.28, 0.3, M.red, 0, 0.14, 0, g); K.box(0.62, 0.05, 0.32, M.toolLid, 0, 0.3, 0, g);
      K.box(0.3, 0.04, 0.04, M.iron, 0, 0.42, 0, g); for (const xx of [-0.14, 0.14]) K.box(0.04, 0.12, 0.04, M.iron, xx, 0.36, 0, g);
      const w = K.box(0.5, 0.03, 0.06, M.ironL, 0.35, 0.02, 0.28, g); w.rotation.y = 0.6;
      return g;
    }
    M.toolLid = K.mat(0x8a2a1a);
    function coil(x, y, z, r, m) { const g = K.group(S, x, y, z); for (let i = 0; i < 4; i++) { const c = K.torus(r - i * 0.02, 0.035, m, 4, 14, 0, 0.04 + i * 0.06, 0, g); c.rotation.x = Math.PI / 2; } return g; }
    function gasBottles(x, y, z, n) { for (let i = 0; i < n; i++) { K.cyl(0.13, 0.13, 1.1, i % 2 ? M.bottleG : M.bottleR, 8, x + i * 0.3, y + 0.55, z, S); K.sph(0.13, M.brassD, x + i * 0.3, y + 1.12, z, S, 6, 4); } K.box(n * 0.3 + 0.1, 0.06, 0.06, M.iron, x + (n - 1) * 0.15, y + 0.8, z + 0.14, S); }
    M.bottleG = K.mat(0x2a5a4a, { shine: 30 }); M.bottleR = K.mat(0x6a2a1a, { shine: 30 });
    function rack(x, y, z) {
      const rk = K.group(S, x, y, z); for (const sx of [-0.8, 0.8]) K.box(0.08, 1.8, 0.5, M.iron, sx, 0.9, 0, rk);
      for (const yy of [0.4, 1.0, 1.6]) { K.box(1.7, 0.06, 0.5, M.ironM, 0, yy, 0, rk); for (let i = 0; i < 4; i++) { const gg = gear(rk, 0.16 + rnd() * 0.06, 0.06, 10, rnd() < 0.4 ? M.brassD : M.ironM, -0.55 + i * 0.36, yy + 0.2, 0); gg.rotation.x = Math.PI / 2 + 0.2; } }
      return rk;
    }
    // a small grimy worker (overalls, cap, goggles): legs/arms on pivots so they can walk or work
    function worker(p, col, x, y, z) {
      const g = K.dyn(K.group(p, x, y, z));
      const cloth = M['cloth' + col] || (M['cloth' + col] = K.mat(col));
      const legs = [];
      for (const s of [-1, 1]) { const hip = K.dyn(K.group(g, s * 0.09, 0.42, 0)); K.box(0.11, 0.38, 0.12, cloth, 0, -0.19, 0, hip); K.box(0.13, 0.07, 0.18, M.boots, 0, -0.38, 0.03, hip); legs.push(hip); noCast.push(hip); }
      const body = K.dyn(K.group(g, 0, 0.42, 0));
      K.box(0.3, 0.38, 0.18, cloth, 0, 0.2, 0, body);
      K.box(0.32, 0.06, 0.2, M.capD, 0, 0.02, 0, body);
      K.box(0.08, 0.18, 0.02, M.brassD, 0.06, 0.24, 0.1, body);
      const head = K.group(body, 0, 0.5, 0);
      K.box(0.2, 0.2, 0.2, M.skin, 0, 0, 0, head);
      K.box(0.22, 0.07, 0.24, M.capD, 0, 0.12, 0.01, head); K.box(0.22, 0.03, 0.08, M.capD, 0, 0.09, 0.14, head);
      K.box(0.18, 0.05, 0.03, M.goggle, 0, 0.03, 0.105, head);
      const arms = [];
      for (const s of [-1, 1]) { const sh = K.group(body, s * 0.19, 0.34, 0); K.box(0.09, 0.32, 0.1, cloth, 0, -0.15, 0, sh); K.box(0.09, 0.08, 0.1, M.skin, 0, -0.33, 0, sh); arms.push(sh); }
      return { g, legs, arms, body, head };
    }
    M.skin = K.mat(0xb08060); M.capD = K.mat(0x2a221c); M.boots = K.mat(0x1a1410); M.goggle = K.mat(0x3a6a7a, { shine: 60 });

    // ================= DECKS: cobbled tops + iron-banded slab rims =================
    const plates = { build: 'PLAN + BUILD', checks: 'CHECKS', launch: 'LAUNCH' };
    const PLATE_X = -13.4, PLATE_H = 0.92;
    const plateW = {};
    for (const k in plates) plateW[k] = PLATE_H * ((textW(plates[k]) * 2 + 18) / (5 * 2 + 14));
    const hangers = [], vents = { length: 0 }, spouts = [], rimLamps = [];
    function rimGap(tier, key) { // x spans to keep clear on a rim (lifts/drops passing in front, the plate)
      const gaps = [];
      const FZ = tier.z1;
      for (const s of SEGS) {
        if (s.kind !== 'lift' && s.kind !== 'tube') continue;
        const lo = Math.min(s.a[1], s.b[1]) - 1, hi = Math.max(s.a[1], s.b[1]) + 1;
        if (hi < tier.y - 1.5 || lo > tier.y + 0.2) continue;
        const z = Math.max(s.a[2], s.b[2]); if (z < FZ - 1.6) continue;
        const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]);
        if (s.kind === 'lift' || Math.abs(s.a[1] - s.b[1]) > 0.2) gaps.push([x0 - 1.0, x1 + 1.0]);
      }
      // the name plate sits at the same x on every floor unless a lift passes in front of it there
      const hw = plateW[key] / 2 + 0.25;
      let px = PLATE_X;
      while (px < 0 && gaps.some(([a, b]) => px + hw > a && px - hw < b)) px += 0.25;
      gaps.push([px - hw, px + hw]);
      const gap = (x, w) => gaps.some(([a, b]) => x + (w || 0) > a && x - (w || 0) < b);
      gap.plateX = px;
      return gap;
    }
    function deck(key, tier) {
      const top = tier.y + 0.1, bot = tier.y - 1.4, W = tier.x1 - tier.x0, D = tier.z1 - tier.z0, cx = (tier.x0 + tier.x1) / 2, cz = (tier.z0 + tier.z1) / 2, FZ = tier.z1;
      noShadow(wuv(K.box(W, 0.12, D, M.cobble, cx, top - 0.06, cz, S), CB, CB));
      noShadow(wuv(K.box(W, 1.38, 0.12, M.stoneF, cx, bot + 0.69, FZ - 0.06, S), STU, STV));
      const gap = rimGap(tier, key);
      // I-beam girder along the top edge, two rivet rows
      K.box(W + 0.2, 0.34, 0.12, M.ironM, cx, top - 0.2, FZ + 0.08, S);
      K.box(W + 0.2, 0.06, 0.3, M.iron, cx, top - 0.05, FZ + 0.12, S);
      K.box(W + 0.2, 0.06, 0.3, M.iron, cx, top - 0.36, FZ + 0.12, S);
      for (let x = tier.x0 + 0.1; x <= tier.x1 - 0.1; x += 0.38) { K.box(0.06, 0.06, 0.05, M.brassL, x, top - 0.12, FZ + 0.16, S); K.box(0.06, 0.06, 0.05, M.brassL, x, top - 0.28, FZ + 0.16, S); }
      // lower band + rust bleeding down the stone + grime
      K.box(W + 0.2, 0.2, 0.1, M.ironM, cx, bot + 0.1, FZ + 0.06, S);
      for (let x = tier.x0 + 0.3; x < tier.x1 - 0.2; x += 0.6) if (rnd() < 0.55) { const h = 0.3 + rnd() * 0.7; K.box(0.06 + rnd() * 0.1, h, 0.01, M.rustStain, x + rnd() * 0.4, top - 0.4 - h / 2, FZ + 0.012, S); }
      for (let i = 0; i < W * 0.7; i++) { const w = 0.6 + rnd() * 1.6; K.box(w, 0.3 + rnd() * 0.6, 0.01, M.grime, tier.x0 + 0.5 + rnd() * (W - 1), top - 0.6 - rnd() * 0.6, FZ + 0.014, S); }
      // brackets + diagonal braces + rivets
      const BR = [];
      for (let x = tier.x0 + 0.9; x <= tier.x1 - 0.7; x += 2.9) { if (gap(x, 0.3)) continue; BR.push(x); }
      BR.forEach((x) => {
        K.box(0.22, 1.42, 0.18, M.iron, x, top - 0.78, FZ + 0.12, S);
        K.box(0.32, 0.12, 0.26, M.ironM, x, bot + 0.04, FZ + 0.14, S);
        for (const y of [-0.55, -0.95, -1.3]) { K.box(0.08, 0.08, 0.05, M.brassL, x - 0.06, top + y, FZ + 0.22, S); K.box(0.08, 0.08, 0.05, M.brassL, x + 0.06, top + y, FZ + 0.22, S); }
        const d = K.box(0.08, 1.2, 0.06, M.ironM, x + 0.42, top - 0.82, FZ + 0.17, S); d.rotation.z = 0.62;
      });
      // hanging chains between brackets (catenary of links)
      for (let i = 0; i < BR.length - 1; i++) {
        const a = BR[i], b = BR[i + 1]; if (b - a > 3.2 || rnd() < 0.4) continue;
        const n = 12;
        for (let k = 0; k <= n; k++) { const u = k / n, x = a + 0.15 + (b - a - 0.3) * u, y = top - 0.45 - Math.sin(u * Math.PI) * 0.55; const l = K.torus(0.05, 0.016, M.ironL, 4, 6, x, y, FZ + 0.27, S); l.rotation.y = k % 2 ? Math.PI / 2 : 0; }
      }
      // loose chains swinging off the edge
      for (let i = 0; i < 2; i++) {
        const x = tier.x0 + 3 + rnd() * (W - 6); if (gap(x, 0.2)) continue;
        const hg = K.dyn(K.group(root, x, top - 0.15, FZ + 0.32)); const n = 8 + Math.floor(rnd() * 6);
        for (let k = 0; k < n; k++) { const l = K.torus(0.055, 0.017, M.ironL, 4, 6, 0, -k * 0.11, 0, hg); l.rotation.y = k % 2 ? Math.PI / 2 : 0; }
        K.box(0.08, 0.2, 0.08, M.rust, 0.04, -n * 0.11 - 0.06, 0, hg); hangers.push({ hg, k: rnd() * 6 }); noCast.push(hg);
      }
      // drain spouts dripping oil
      for (let x = tier.x0 + 4.2; x < tier.x1 - 2; x += 7.4 + rnd() * 2) {
        if (gap(x, 0.2)) continue;
        const sp = K.cyl(0.09, 0.09, 0.55, M.copperD, 8, x, top - 0.72, FZ + 0.32, S); sp.rotation.x = Math.PI / 2;
        K.cyl(0.12, 0.12, 0.08, M.brassD, 8, x, top - 0.72, FZ + 0.1, S).rotation.x = Math.PI / 2;
        noShadow(K.box(0.14, 0.4, 0.01, M.oil, x, top - 0.95, FZ + 0.02, S));
        spouts.push([x, top - 0.75, FZ + 0.6]);
      }
      // glowing vent slits (the furnace inside the slab)
      for (let x = tier.x0 + 2.4; x < tier.x1 - 1; x += 3.3 + rnd() * 2.4) {
        if (gap(x, 0.55)) continue;
        K.box(0.9, 0.22, 0.02, (vents.length++) % 2 ? M.ventB : M.ventA, x, top - 1.05, FZ + 0.01, S);
        for (let i = 0; i < 5; i++) K.box(0.05, 0.28, 0.06, M.soot, x - 0.36 + i * 0.18, top - 1.05, FZ + 0.03, S);
        K.box(1.02, 0.06, 0.08, M.ironM, x, top - 0.9, FZ + 0.04, S); K.box(1.02, 0.06, 0.08, M.ironM, x, top - 1.2, FZ + 0.04, S);
      }
      // caged bulkhead lamps on the girder
      for (let x = tier.x0 + 2.0; x < tier.x1 - 1; x += 5.7) {
        const lx = x + 1.2; if (gap(lx, 0.3)) continue;
        const g = K.group(S, lx, top - 0.62, FZ + 0.26);
        K.box(0.3, 0.12, 0.16, M.iron, 0, 0.2, -0.06, g);
        K.box(0.2, 0.22, 0.2, M.rimLamp, 0, 0, 0, g);
        for (const sx of [-0.11, 0.11]) K.box(0.03, 0.26, 0.24, M.iron, sx, 0, 0, g);
        K.box(0.26, 0.03, 0.24, M.iron, 0, 0, 0, g);
        K.box(0.24, 0.04, 0.24, M.brassD, 0, -0.13, 0, g);
        noShadow(K.box(0.9, 0.9, 0.01, M.lampHalo, 0, -0.1, -0.24, g));
        rimLamps.push(lx);
      }
      // hazard paint on the lip (the deck top's front edge)
      for (let x = tier.x0 + 0.05; x < tier.x1 - 0.2; x += 0.5) { const m = Math.floor((x + 40) * 2) % 2 ? M.hazard : M.hazardD; noShadow(K.box(0.25, 0.012, 0.12, m, x + 0.125, top + 0.006, FZ - 0.07, S)); }
      // the floor's name plate on the rim (brass frame, enamel face, gold pixel letters)
      namePlate(plates[key], gap.plateX, top - 0.78, FZ + 0.24, PLATE_H);
    }
    M.lampHalo = K.glow(0xffa050, 0.12, true);
    function namePlate(text, x, y, z, h) {
      const tex = plateTex(text);
      const w = h * (tex.image.width / tex.image.height);
      const pm = K.mat(0xffffff, { map: tex }); pm.emissiveMap = tex; pm.emissive.setHex(0x5a4020);
      const g = K.group(S, x, y, z);
      K.box(w + 0.18, h + 0.18, 0.08, M.brassD, 0, 0, -0.02, g);
      K.box(w, h, 0.04, pm, 0, 0, 0.04, g);
      for (const sx of [-1, 1]) { K.box(0.12, h * 0.5, 0.18, M.iron, sx * (w * 0.32), 0, -0.12, g); for (const sy of [-1, 1]) K.box(0.08, 0.08, 0.05, M.brassL, sx * (w / 2 + 0.03), sy * (h / 2 + 0.03), 0.04, g); }
      return g;
    }
    sect('decks', () => { deck('build', TB); deck('checks', TC); deck('launch', TL); });

    // build deck front: worn stone curb with a hazard band, low chain railing (gap where the ore belt crosses)
    sect('curb', () => {
      const FZ = TB.z1, top = TB.y + 0.1;
      const open = (x, w) => blocked(x, FZ - 0.2, w || 0.2, top, top + 1.2);
      for (let x = TB.x0 + 0.25; x < TB.x1 - 0.2; x += 0.75) {
        if (open(x + 0.375, 0.3)) continue;
        const h = 0.1 + rnd() * 0.03;
        K.box(0.72, h, 0.36, rnd() < 0.3 ? M.stoneD : M.stone, x + 0.375, top + h / 2 - 0.02, FZ - 0.2, S);
      }
      const posts = [];
      for (let x = TB.x0 + 0.6; x <= TB.x1 - 0.5; x += 1.7) { if (open(x, 0.25)) continue; posts.push(x); K.cyl(0.05, 0.06, 0.6, M.iron, 6, x, top + 0.32, FZ - 0.14, S); K.sph(0.07, M.brassD, x, top + 0.64, FZ - 0.14, S, 6, 4); }
      for (let i = 0; i < posts.length - 1; i++) { const a = posts[i], b = posts[i + 1]; if (b - a > 1.8) continue; for (let k = 1; k < 8; k++) { const u = k / 8; const l = K.torus(0.04, 0.012, M.ironL, 4, 6, a + (b - a) * u, top + 0.56 - Math.sin(u * Math.PI) * 0.16, FZ - 0.14, S); l.rotation.y = k % 2 ? Math.PI / 2 : 0; } }
      // old cart rails sunk into the cobbles along the front strip (the mockup's), in runs that stop short of anything
      const RZ = 5.85, railTop = M.railTop;
      let run = null;
      const flush = (x1) => { if (!run || x1 - run < 1) { run = null; return; } const L = x1 - run, cx = (run + x1) / 2; for (const dz of [-0.34, 0.34]) { K.box(L, 0.03, 0.07, M.ironL, cx, top + 0.015, RZ + dz, S); K.box(L, 0.02, 0.03, railTop, cx, top + 0.035, RZ + dz, S); } for (let x = run + 0.2; x < x1 - 0.1; x += 0.55) decal(TB, x, RZ, 0.14, 0.9, M.woodD, 0, 0.004); run = null; };
      for (let x = TB.x0 + 2.2; x <= TB.x1 - 0.7; x += 0.25) { const ok = !blocked(x, RZ, 0.42, top, top + 0.3); if (ok && run === null) run = x; if (!ok) flush(x - 0.25); }
      flush(TB.x1 - 0.7);
    });

    // ================= RISER WALLS + BACK WALL: brick foundry facades =================
    const winFlick = M.winFlick; const sils = [], wallGears = [], needles = [], leaks = [], clocks = [], papers = [];
    // arched window: furnace glass (atlas cell), iron mullions, stone sill, arch ring + keystone, soot plume
    function archWindow(x, y, h, w, zf, mode) {
      const r = w / 2, cell = Math.floor(rnd() * 4);
      const m = mode === 1 ? winFlick : M.win;
      noShadow(K.mesh(archGeo(w, h, cell, mode === 2 ? 1 : 0), m, x, y, zf + 0.012, S));
      // reveal: dark frame just around the glass
      K.box(0.07, h, 0.05, M.soot, x - r - 0.02, y + h / 2, zf + 0.02, S); K.box(0.07, h, 0.05, M.soot, x + r + 0.02, y + h / 2, zf + 0.02, S);
      K.box(0.06, h + r - 0.04, 0.06, M.iron, x, y + (h + r) / 2, zf + 0.05, S);
      if (w > 1.05) for (const s of [-1, 1]) K.box(0.04, h, 0.05, M.iron, x + s * w * 0.27, y + h / 2, zf + 0.045, S);
      for (const k of (h > 2 ? [0.25, 0.5, 0.75, 1] : [0.36, 0.7, 1])) K.box(w, 0.05, 0.06, M.iron, x, y + h * k, zf + 0.05, S);
      for (const s of [-1, 1]) { const rb = K.box(0.04, r * 0.95, 0.05, M.iron, x + s * r * 0.36, y + h + r * 0.36, zf + 0.045, S); rb.rotation.z = -s * 0.78; }
      K.box(w + 0.22, 0.12, 0.24, M.stoneD, x, y - 0.06, zf + 0.1, S);
      K.box(w + 0.3, 0.05, 0.28, M.stone, x, y - 0.0, zf + 0.12, S);
      noShadow(K.torus(r + 0.05, 0.075, M.stoneD, 4, 10, x, y + h, zf + 0.05, S, Math.PI));
      K.box(0.18, 0.22, 0.1, M.stone, x, y + h + r + 0.08, zf + 0.06, S);
      noShadow(K.box(w * 0.95, 1.0, 0.01, M.grimeL, x, y + h + r + 0.55, zf + 0.004, S));
      return m;
    }
    function door(x, y, w, h, zf, glowEdge) {
      const g = K.group(S, x, y, zf + 0.06);
      K.box(w, h, 0.12, M.ironM, 0, h / 2, 0, g);
      for (let i = 0; i < Math.floor(h / 0.6); i++) K.box(w, 0.06, 0.16, M.iron, 0, 0.3 + i * 0.6, 0.02, g);
      for (let yy = 0.3; yy < h; yy += 0.3) for (const sx of [-1, 1]) K.box(0.05, 0.05, 0.05, M.brassL, sx * (w / 2 - 0.08), yy, 0.09, g);
      for (let i = 0; i < 8; i++) K.box(w / 8 * 0.96, 0.12, 0.05, i % 2 ? M.hazardD : M.hazard, -w / 2 + w / 8 * (i + 0.5), 0.18, 0.09, g);
      if (glowEdge) { K.box(0.14, h - 0.1, 0.05, M.doorGlow, w / 2 + 0.08, h / 2, 0.0, g); noShadow(K.box(0.5, 0.012, 0.9, M.doorSpill, w / 2 + 0.3, 0.012, 0.4, g)); }
      K.box(w + 0.8, 0.16, 0.26, M.iron, 0.2, h + 0.12, 0.04, g);
      for (const sx of [-0.3, 0.3]) K.cyl(0.08, 0.08, 0.14, M.brass, 8, sx * w, h, 0.12, g);
      return g;
    }
    M.doorGlow = K.glow(0xffb060); M.doorSpill = K.glow(0xffa050, 0.18, true);
    function noticeBoard(x, y, z, w, h) {
      K.box(w, h, 0.05, M.board, x, y, z, S);
      for (const [ww, hh, xx, yy] of [[w + 0.06, 0.05, 0, h / 2], [w + 0.06, 0.05, 0, -h / 2], [0.05, h + 0.05, w / 2, 0], [0.05, h + 0.05, -w / 2, 0]]) K.box(ww, hh, 0.07, M.woodD, x + xx, y + yy, z + 0.01, S);
      const n = Math.max(3, Math.floor(w * h * 7));
      for (let i = 0; i < n; i++) {
        const pw = 0.18 + rnd() * 0.12, ph = 0.2 + rnd() * 0.14, px = x + (rnd() - 0.5) * (w - pw - 0.08), py = y + (rnd() - 0.5) * (h - ph - 0.08);
        const flutter = i === n - 1;
        const pv = flutter ? K.dyn(K.group(root, px, py + ph / 2, z + 0.035)) : K.group(S, px, py + ph / 2, z + 0.035); const pm = rnd() < 0.2 ? M.paperR : M.paper;
        K.box(pw, ph, 0.01, pm, 0, -ph / 2, 0, pv);
        for (let k = 0; k < 3; k++) K.box(pw * (0.5 + rnd() * 0.35), 0.016, 0.005, M.ink, -pw * 0.05, -ph * (0.25 + k * 0.2), 0.008, pv);
        K.box(0.03, 0.03, 0.02, rnd() < 0.5 ? M.valve : M.pin, 0, -0.01, 0.012, pv);
        if (flutter) { papers.push({ pv, k: rnd() * 6 }); noCast.push(pv); } else pv.rotation.z = (rnd() - 0.5) * 0.12;
      }
    }
    M.board = K.mat(dd(0x6a4a2c)); M.paperR = K.mat(dd(0xe8b8a0, 0.9, 0.1)); M.pin = K.mat(0x2a5a8a);
    function wallClock(x, y, z, r) {
      const clk = K.group(S, x, y, z);
      K.cyl(r * 1.12, r * 1.12, 0.1, M.brassD, 18, 0, 0, -0.03, clk).rotation.x = Math.PI / 2;
      const cf = K.cyl(r, r, 0.08, M.cream, 18, 0, 0, 0.02, clk); cf.rotation.x = Math.PI / 2;
      K.torus(r * 1.04, 0.05, M.brass, 4, 18, 0, 0, 0.06, clk);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(i % 3 ? 0.04 : 0.07, i % 3 ? 0.08 : 0.14, 0.02, M.ink, Math.sin(a) * r * 0.8, Math.cos(a) * r * 0.8, 0.07, clk).rotation.z = -a; }
      K.box(0.14, 0.3, 0.12, M.iron, 0, r + 0.12, -0.02, clk);
      const hh = K.dyn(K.group(root, x, y, z + 0.09)); K.box(0.06, r * 0.55, 0.02, M.ink, 0, r * 0.24, 0, hh);
      const mh = K.dyn(K.group(root, x, y, z + 0.1)); K.box(0.045, r * 0.82, 0.02, M.redHand, 0, r * 0.37, 0, mh);
      clocks.push({ hh, mh, k: rnd() * 20 }); noCast.push(hh, mh);
    }
    // facade: brick wall from floor y0 to slab y1 with a plinth, string course, cornice, pilasters + windows
    function facade(o) {
      const W = o.x1 - o.x0, H = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2, zf = o.zf;
      noShadow(wuv(K.box(W, H, 0.5, M.brickW, cx, o.y0 + H / 2, zf - 0.25, S), BRU, BRV));
      K.box(W, 0.42, 0.16, M.stoneD, cx, o.y0 + 0.21, zf + 0.08, S);
      K.box(W, 0.06, 0.2, M.stone, cx, o.y0 + 0.44, zf + 0.1, S);
      if (o.course) { K.box(W, 0.26, 0.2, M.stoneD, cx, o.course, zf + 0.1, S); K.box(W, 0.07, 0.26, M.stone, cx, o.course + 0.16, zf + 0.13, S); }
      if (o.coping) { K.box(W + 0.2, 0.25, 0.9, M.stoneD, cx, o.y1 - 0.12, zf - 0.3, S); K.box(W + 0.2, 0.1, 0.95, M.stone, cx, o.y1 + 0.05, zf - 0.3, S); }
      else {
        K.box(W, 0.3, 0.24, M.stoneD, cx, o.y1 - 0.42, zf + 0.12, S);
        K.box(W, 0.1, 0.3, M.stone, cx, o.y1 - 0.22, zf + 0.15, S);
        for (let x = o.x0 + 0.3; x < o.x1 - 0.2; x += 0.55) K.box(0.22, 0.2, 0.16, M.stoneD, x, o.y1 - 0.67, zf + 0.08, S);
      }
      noShadow(K.box(W, 2.4, 0.01, M.sootG, cx, o.y1 - (o.coping ? 0.2 : 0.75) - 1.2, zf + 0.006, S));
      // grime washes + rust streaks
      for (let i = 0; i < W * 0.5; i++) { const w = 0.5 + rnd() * 1.4; noShadow(K.box(w, 0.6 + rnd() * 1.8, 0.01, rnd() < 0.5 ? M.grimeL : M.grime, o.x0 + rnd() * W, o.y0 + 0.6 + rnd() * (H - 1.5), zf + 0.003, S)); }
      for (let i = 0; i < W * 0.35; i++) { const h = 0.6 + rnd() * 1.8; noShadow(K.box(0.05 + rnd() * 0.08, h, 0.01, M.rustStain, o.x0 + rnd() * W, o.y0 + H * (0.25 + rnd() * 0.6), zf + 0.004, S)); }
      const nb = Math.max(1, Math.round(W / o.bay)), bw = W / nb;
      for (let i = 0; i <= nb; i++) {
        const x = o.x0 + i * bw, end = i === 0 || i === nb, pw = end ? 0.9 : 0.5, px = end ? x + (i === 0 ? pw / 2 : -pw / 2) : x, ph = H - 0.45 - (o.coping ? 0.1 : 0.55);
        K.box(pw, ph, 0.2, M.brickD, px, o.y0 + 0.45 + ph / 2, zf + 0.1, S);
        K.box(pw + 0.12, 0.2, 0.28, M.stone, px, o.y0 + 0.55, zf + 0.12, S);
        K.box(pw + 0.14, 0.18, 0.3, M.stone, px, o.y0 + 0.45 + ph - 0.08, zf + 0.13, S);
        if (end) for (let y = o.y0 + 0.9; y < o.y1 - 0.8; y += 0.9) K.box(pw + 0.06, 0.32, 0.24, M.stoneD, px + (i === 0 ? -0.03 : 0.03) + (Math.round(y * 1.1) % 2 ? 0.08 : -0.08), y, zf + 0.12, S);
        if (o.course && !end) K.box(pw + 0.1, 0.3, 0.28, M.stone, px, o.course, zf + 0.12, S);
      }
      for (let b = 0; b < nb; b++) {
        const bc = o.x0 + (b + 0.5) * bw;
        for (const side of [-1, 1]) {
          const x = bc + side * bw * 0.25;
          o.rows.forEach((row, ri) => {
            if (o.skip && o.skip(x, ri, b, side)) return;
            const rr = rnd(); const mode = rr < 0.5 ? 0 : rr < 0.72 ? 1 : 2;
            archWindow(x, row.y, row.h, row.w, zf, mode);
            if (mode === 0 && rnd() < 0.5 && sils.length < 10) sils.push(silhouette(x, row.y, row.h, zf));
          });
        }
      }
      return { nb, bw };
    }
    // a worker's silhouette passing behind a lit window
    let silGeo = null;
    function silhouette(x, y, h, zf) {
      if (!silGeo) {
        const rect = (x0, y0, x1, y1) => { const sh = new THREE.Shape(); sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1); sh.lineTo(x0, y1); sh.lineTo(x0, y0); return sh; };
        silGeo = new THREE.ShapeGeometry([rect(-0.16, 0.17, 0.16, 0.67), rect(-0.085, 0.67, 0.085, 0.86), rect(-0.11, 0.84, 0.11, 0.9), rect(0.16, 0.38, 0.21, 0.62)]);
      }
      const s = K.dyn(K.group(root, x, y, zf + 0.014));
      K.mesh(silGeo, M.silW, 0, 0, 0, s).scale.setScalar(Math.min(1.3, h / 1.6));
      s.visible = false; return { s, x, o: -1, sp: 0.2 + rnd() * 0.12, wait: 3 + rnd() * 10 };
    }
    M.silW = basic({ color: 0x2a160a });

    // pipes laid flat against a wall face (zf): copper main, verdigris return, brackets, valve wheels
    function wallPipe(x0, x1, y, zf, r, m, every) {
      const p = K.cyl(r, r, x1 - x0, m, 8, (x0 + x1) / 2, y, zf + r + 0.02, S); p.rotation.z = Math.PI / 2;
      for (let x = x0 + 0.3; x < x1 - 0.1; x += every || 1.2) K.box(0.08, r * 2.6, r * 2 + 0.06, M.iron, x, y, zf + r + 0.02, S);
    }
    function downPipe(x, y0, y1, zf, r, m) {
      K.cyl(r, r, y1 - y0, m, 8, x, (y0 + y1) / 2, zf + r + 0.02, S);
      for (let y = y0 + 0.4; y < y1 - 0.2; y += 1.1) K.box(r * 2.6, 0.08, r * 2 + 0.06, M.iron, x, y, zf + r + 0.02, S);
      K.cyl(r * 1.25, r * 1.25, 0.12, M.brassD, 8, x, y0 + 0.12, zf + r + 0.02, S);
    }
    function valveWheel(x, y, z, r) { const v = K.torus(r, 0.04, M.valve, 6, 12, x, y, z, S); K.box(r * 2, 0.04, 0.04, M.valve, x, y, z, S); K.box(0.04, r * 2, 0.04, M.valve, x, y, z, S); K.cyl(0.05, 0.05, 0.12, M.brassD, 6, x, y, z - 0.04, S).rotation.x = Math.PI / 2; return v; }
    function cableRun(x0, x1, y, zf, sag) {
      const pts = []; for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push([x0 + (x1 - x0) * u, y - Math.sin(u * Math.PI) * (sag || 0.25), zf + 0.05]); }
      K.tube(pts, 0.03, M.soot, S, 20, 4);
      K.box(0.3, 0.36, 0.14, M.ironM, x0, y, zf + 0.07, S); K.box(0.3, 0.36, 0.14, M.ironM, x1, y, zf + 0.07, S);
      K.box(0.12, 0.06, 0.02, M.hazard, x0, y + 0.08, zf + 0.15, S);
    }
    function gearCluster(x, y, zf, list) {
      for (const [dx, dy, r, m, dir] of list) {
        const gr = K.dyn(gear(root, r, 0.16, Math.round(r * 16), m || M.brassD, x + dx, y + dy, zf + 0.16)); gr.rotation.x = Math.PI / 2;
        wallGears.push({ g: gr, s: (dir || 1) / r });
        K.cyl(r * 0.3, r * 0.3, 0.2, M.ironM, 8, x + dx, y + dy, zf + 0.08, S).rotation.x = Math.PI / 2;
      }
    }

    // ---- CHECKS RISER: the wall behind the build floor (z -4.5 deck edge, brick face recessed to -4.7) ----
    const RC = { x0: TC.x0, x1: TC.x1, y0: TB.y + 0.1, y1: TC.y - 1.4, zf: TC.z1 - 0.2 };
    const RL = { x0: TL.x0, x1: TL.x1, y0: TC.y + 0.1, y1: TL.y - 1.4, zf: TL.z1 - 0.2 };
    const BW = { x0: TL.x0, x1: TL.x1, y0: TL.y + 0.1, y1: TL.y + 3.9, zf: TL.z0 + 0.6 };
    const LOWER = (y0) => ({ y: y0 + 1.05, h: 1.55, w: 1.0 });
    const UPPER = (y0) => ({ y: y0 + 4.75, h: 2.3, w: 1.15 });
    const fe = { checks: [-16.35, -13.25], launch: [10.6, 13.7] }; // fire-escape spans (flight x range) on each riser
    sect('checks riser', () => {
      const zf = RC.zf, y0 = RC.y0;
      facade({ x0: RC.x0, x1: RC.x1, y0, y1: RC.y1, zf, bay: 4.625, course: y0 + 3.95, rows: [LOWER(y0), UPPER(y0)], skip: (x, ri) =>
        (ri === 1 && x > -8.3 && x < -5.6) || // gears
        (ri === 1 && x > -13.3 && x < -12.2) || // fire-escape door
        (ri === 0 && x > 14.5) || // big door
        (ri === 0 && x > 5.2 && x < 6.4) // notice board
      });
      // big sliding door at the right end, a small door off the fire escape's middle landing
      door(16.05, y0, 2.5, 3.0, zf, true);
      door(-12.85, y0 + 6.1, 0.9, 1.9, zf, false);
      // pipes: copper main + verdigris return, valve wheels, downpipes from the cornice
      wallPipe(RC.x0 + 1.1, RC.x1 - 0.9, y0 + 3.45, zf, 0.11, M.copper, 1.2);
      wallPipe(RC.x0 + 1.1, 14.55, y0 + 0.66, zf, 0.08, M.verdD, 1.4); // stops at the big door
      for (const x of [-9.6, 1.8, 12.3]) valveWheel(x, y0 + 3.45, zf + 0.32, 0.2);
      for (const x of [-3.9, 7.35, 11.95]) downPipe(x, y0 + 3.45, RC.y1 - 0.6, zf, 0.09, M.copperD);
      downPipe(-3.9, y0 + 0.2, y0 + 3.45, zf, 0.09, M.copperD);
      needles.push(gauge(S, -8.2, y0 + 3.95, zf + 0.2, 0.17), gauge(S, 6.1, y0 + 3.95, zf + 0.2, 0.17), gauge(S, 15.0, y0 + 3.95, zf + 0.2, 0.2));
      leaks.push([-10.6, y0 + 3.45, zf + 0.25], [5.2, y0 + 3.45, zf + 0.25], [14.1, y0 + 3.45, zf + 0.25]);
      cableRun(-17.6, -14.2, RC.y1 - 1.25, zf, 0.3); cableRun(-4.6, 1.2, RC.y1 - 1.05, zf, 0.25); cableRun(9.8, 15.4, RC.y1 - 1.25, zf, 0.3);
      // gear train between the planner and the first assembler, a station clock on the pilaster between the assemblers
      gearCluster(-6.94, y0 + 6.1, zf, [[-0.7, 0, 1.1, M.brassD, 1], [0.95, 0.85, 0.58, M.copperD, -1], [0.75, -0.95, 0.42, M.brassD, -1]]);
      wallClock(4.625, y0 + 6.45, zf + 0.2, 0.58);
      noticeBoard(5.8, y0 + 1.95, zf + 0.04, 1.05, 0.9);
    });
    // ---- LAUNCH RISER: the wall behind the checks floor ----
    sect('launch riser', () => {
      const zf = RL.zf, y0 = RL.y0;
      facade({ x0: RL.x0, x1: RL.x1, y0, y1: RL.y1, zf, bay: 5, course: y0 + 3.95, rows: [LOWER(y0), UPPER(y0)], skip: (x, ri) =>
        (ri === 1 && x > -8.9 && x < -5.6) || // gears
        (ri === 0 && x > -13.9 && x < -11.0) || // door
        (ri === 1 && x > 9.4 && x < 10.4) // fire-escape door
      });
      door(-12.5, y0, 2.0, 2.8, zf, true);
      door(10.15, y0 + 6.1, 0.9, 1.9, zf, false);
      wallPipe(RL.x0 + 1.1, RL.x1 - 0.9, y0 + 3.45, zf, 0.11, M.copper, 1.2);
      wallPipe(-11.3, RL.x1 - 0.9, y0 + 0.66, zf, 0.08, M.verdD, 1.4); // starts past the door
      for (const x of [-6.3, 4.4]) valveWheel(x, y0 + 3.45, zf + 0.32, 0.2);
      for (const x of [-3.9, 7.35]) downPipe(x, y0 + 3.45, RL.y1 - 0.6, zf, 0.09, M.copperD);
      needles.push(gauge(S, -1.2, y0 + 3.95, zf + 0.2, 0.17), gauge(S, 6.4, y0 + 6.3, zf + 0.2, 0.3));
      leaks.push([-8.0, y0 + 3.45, zf + 0.25], [3.0, y0 + 3.45, zf + 0.25]);
      cableRun(-14.4, -10.6, RL.y1 - 1.25, zf, 0.3); cableRun(-1.6, 3.6, RL.y1 - 1.1, zf, 0.25);
      gearCluster(-7.5, y0 + 6.0, zf, [[0.6, 0.1, 1.15, M.brassD, -1], [-1.05, 0.95, 0.55, M.brassD, 1], [-0.95, -0.85, 0.46, M.copperD, 1]]);
      // the notice board and the furnace hatch sit between the lower windows of the two middle bays; the hatch takes the
      // left one, which no checks machine stands in front of (the verify bay stands before the right one)
      noticeBoard(2.5, y0 + 1.95, zf + 0.04, 1.1, 0.95);
      // a furnace hatch: round iron door with a glowing peep slot
      const fh = K.group(S, -2.5, y0 + 1.7, zf + 0.06); fh.scale.setScalar(0.86); // clears the windows either side
      K.cyl(0.78, 0.78, 0.14, M.iron, 14, 0, 0, 0, fh).rotation.x = Math.PI / 2;
      K.torus(0.78, 0.07, M.brassD, 4, 16, 0, 0, 0.07, fh);
      K.box(0.8, 0.14, 0.04, M.hatchGlow, 0, 0.18, 0.09, fh);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(0.08, 0.08, 0.05, M.brassL, Math.cos(a) * 0.64, Math.sin(a) * 0.64, 0.09, fh); }
      K.box(0.6, 0.08, 0.08, M.ironL, 0.5, -0.25, 0.12, fh);
    });

    // ---- LAUNCH BACK WALL (the mockup's back wall on the top floor) ----
    sect('back wall', () => {
      const zf = BW.zf, y0 = BW.y0;
      // bays (5 wide, pilasters at x = 0, ±5, ±10, ±15): windows | windows | SIGN + clock | gears | DOOR | windows
      facade({ x0: BW.x0, x1: BW.x1, y0, y1: BW.y1, zf, bay: 5, coping: true, rows: [{ y: y0 + 1.0, h: 1.5, w: 0.95 }], skip: (x) =>
        (x > -4.6 && x < -0.4) || (x > 0.4 && x < 2.1) || (x > 5.6 && x < 9.4) || (x > -11.8 && x < -10.7) });
      door(7.5, y0, 2.4, 2.9, zf, true);
      const sign = K.mat(0xffffff, { map: signTexP('SHIPTORIO', '#dcb46c', '#20140c', 2) });
      K.box(3.6, 0.5, 0.06, sign, -2.5, y0 + 2.95, zf + 0.12, S);
      K.box(3.75, 0.08, 0.1, M.brassD, -2.5, y0 + 3.24, zf + 0.07, S); K.box(3.75, 0.08, 0.1, M.brassD, -2.5, y0 + 2.66, zf + 0.07, S);
      for (const sx of [-1.9, 1.9]) K.box(0.1, 0.66, 0.12, M.brassD, -2.5 + sx, y0 + 2.95, zf + 0.08, S);
      wallClock(-2.5, y0 + 1.8, zf + 0.06, 0.42);
      noticeBoard(-1.15, y0 + 1.55, zf + 0.04, 0.85, 0.85);
      noticeBoard(-11.25, y0 + 1.7, zf + 0.04, 0.8, 0.85);
      wallPipe(BW.x0 + 0.5, -7.2, y0 + 3.2, zf + 0.12, 0.13, M.copper, 1.2);
      wallPipe(9.7, BW.x1 - 0.5, y0 + 2.95, zf + 0.12, 0.13, M.copper, 1.2);
      wallPipe(BW.x0 + 0.5, 6.1, y0 + 0.72, zf + 0.04, 0.09, M.copperD, 1.2); wallPipe(8.9, BW.x1 - 0.5, y0 + 0.72, zf + 0.04, 0.09, M.copperD, 1.2);
      K.tube([[-7.2, y0 + 3.2, zf + 0.39], [-6.75, y0 + 2.95, zf + 0.55], [-6.75, y0 + 0.4, zf + 0.55]], 0.13, M.copper, S, 12, 6);
      K.tube([[9.7, y0 + 2.95, zf + 0.39], [9.3, y0 + 2.7, zf + 0.55], [9.3, y0 + 0.4, zf + 0.55]], 0.13, M.copper, S, 12, 6);
      for (const x of [-6.75, 9.3]) { const v = K.torus(0.28, 0.05, M.valve, 6, 14, x, y0 + 1.6, zf + 0.82, S); v.rotation.x = Math.PI / 2; }
      for (const x of [-11, -2.6, 3.4, 12.6]) { const v = K.torus(0.2, 0.04, M.valve, 6, 12, x, y0 + 0.72, zf + 0.33, S); }
      needles.push(gauge(S, -6.35, y0 + 2.2, zf + 0.72, 0.17), gauge(S, 9.7, y0 + 2.0, zf + 0.72, 0.17));
      leaks.push([-6.75, y0 + 2.95, zf + 0.55], [9.3, y0 + 2.7, zf + 0.55]);
      cableRun(-14.2, -8.6, y0 + 2.75, zf, 0.25); cableRun(10.0, 14.2, y0 + 2.5, zf, 0.25);
      gearCluster(1.5, y0 + 1.9, zf, [[0.35, 0, 0.82, M.brassD, 1], [-0.65, 0.85, 0.45, M.copperD, -1]]);
    });

    // ================= FRAMING: buttresses, columns, fire escapes, ladders =================
    // lattice panel facing the camera: two chords, struts, X braces, gusset plates
    function lattice(xa, xb, y0, y1, z, m, chord) {
      const w = xb - xa, H = y1 - y0, n = Math.max(1, Math.round(H / Math.max(1.1, w * 1.15))), sh = H / n, cx = (xa + xb) / 2;
      chord = chord || 0.24;
      K.box(chord, H, chord, m || M.iron, xa, y0 + H / 2, z, S); K.box(chord, H, chord, m || M.iron, xb, y0 + H / 2, z, S);
      for (let i = 0; i <= n; i++) { K.box(w, 0.12, 0.14, M.ironM, cx, y0 + i * sh, z, S); K.box(0.3, 0.3, 0.05, M.brassD, xa, y0 + i * sh, z + chord / 2 + 0.01, S); K.box(0.3, 0.3, 0.05, M.brassD, xb, y0 + i * sh, z + chord / 2 + 0.01, S); }
      const L = Math.hypot(w, sh), a = Math.atan2(sh, w);
      for (let i = 0; i < n; i++) { const yc = y0 + (i + 0.5) * sh; const b1 = K.box(L, 0.08, 0.06, M.ironM, cx, yc, z + 0.02, S); b1.rotation.z = a; const b2 = K.box(L, 0.08, 0.06, M.ironM, cx, yc, z - 0.02, S); b2.rotation.z = -a; }
      for (let y = y0 + 0.25; y < y1; y += 0.5) for (const x of [xa, xb]) K.box(0.05, 0.05, 0.04, M.brassL, x, y, z + chord / 2 + 0.01, S);
    }
    // a heavy riveted H-column with brass bands (front-facing flanges)
    function column(x, y0, y1, z, w) {
      w = w || 0.42; const H = y1 - y0;
      K.box(w, H, 0.1, M.ironM, x, y0 + H / 2, z + 0.16, S); K.box(w, H, 0.1, M.ironM, x, y0 + H / 2, z - 0.16, S); K.box(0.1, H, 0.32, M.iron, x, y0 + H / 2, z, S);
      for (let y = y0 + 0.2; y < y1 - 0.1; y += 0.32) for (const s of [-1, 1]) K.box(0.05, 0.05, 0.04, M.brassL, x + s * (w / 2 - 0.06), y, z + 0.22, S);
      for (const y of [y0 + 0.3, y1 - 0.3]) K.box(w + 0.2, 0.22, 0.46, M.brassD, x, y, z, S);
      K.box(w + 0.3, 0.3, 0.6, M.stoneD, x, y0 + 0.15, z, S);
    }
    // a grated platform with a railing on top of a tower, flush with a floor (ties the tower to that floor)
    function towerDeck(xa, xb, y, z0, z1, s) {
      const w = xb - xa, cx = (xa + xb) / 2, d = z1 - z0, cz = (z0 + z1) / 2;
      noShadow(wuv(K.box(w, 0.08, d, M.grate, cx, y - 0.04, cz, S), GRT, GRT));
      K.box(w, 0.16, 0.08, M.ironM, cx, y - 0.1, z1, S); K.box(w, 0.16, 0.08, M.ironM, cx, y - 0.1, z0, S);
      const xo = s < 0 ? xa : xb;
      for (const z of [z0 + 0.05, cz, z1 - 0.05]) K.box(0.05, 0.95, 0.05, M.iron, xo, y + 0.47, z, S);
      for (const yy of [0.5, 0.95]) K.box(0.05, 0.05, d, M.ironL, xo, y + yy, cz, S);
      for (let x = xa + 0.05; x <= xb; x += Math.max(0.4, w / 3)) K.box(0.05, 0.95, 0.05, M.iron, x, y + 0.47, z1 - 0.02, S);
      for (const yy of [0.5, 0.95]) K.box(w, 0.05, 0.05, M.ironL, cx, y + yy, z1 - 0.02, S);
      K.box(w, 0.12, 0.04, M.hazard, cx, y + 0.06, z1 + 0.03, S);
    }
    // a grated catwalk running back along the outside of a deck's side (along z), from xi (inner) to xo (outer, the
    // railed side), hung off the slab side at x = edge on cross-beams and knee braces
    function catwalk(xi, xo, edge, y, z0, z1) {
      const xa = Math.min(xi, xo), xb = Math.max(xi, xo), w = xb - xa, cx = (xa + xb) / 2, d = z1 - z0, cz = (z0 + z1) / 2;
      noShadow(wuv(K.box(w, 0.08, d, M.grate, cx, y - 0.04, cz, S), GRT, GRT));
      for (const x of [xa + 0.04, xb - 0.04]) K.box(0.08, 0.18, d, M.ironM, x, y - 0.13, cz, S);
      if (Math.abs(xi - edge) > 0.02) noShadow(K.box(Math.abs(xi - edge), 0.06, d, M.ironM, (xi + edge) / 2, y - 0.03, cz, S));
      const n = Math.max(2, Math.round(d / 1.3)), sw = Math.abs(xo - edge), bl = Math.hypot(sw, 0.9), ba = Math.atan2(edge - xo, 0.9);
      for (let i = 0; i <= n; i++) {
        const z = z0 + 0.06 + (d - 0.12) * i / n;
        K.box(0.05, 0.95, 0.05, M.iron, xo, y + 0.47, z, S);
        if (i % 2 === 0) { K.box(sw, 0.1, 0.1, M.ironM, (xo + edge) / 2, y - 0.24, z, S); const kb = K.box(0.08, bl, 0.08, M.iron, (xo + edge) / 2, y - 0.24 - 0.45, z, S); kb.rotation.z = ba; }
      }
      for (const yy of [0.5, 0.95]) K.box(0.05, 0.05, d, M.ironL, xo, y + yy, cz, S);
      K.box(0.04, 0.1, d, M.hazardD, xo, y + 0.05, cz, S);
    }
    sect('buttresses', () => {
      // lower: build + checks levels, outside both ends of the checks riser (y -1.4 -> past the checks deck)
      const zb = RC.zf + 0.05, yb0 = TB.y - 1.4, yb1 = TC.y + 1.6;
      for (const s of [-1, 1]) {
        const xin = s < 0 ? TC.x0 - 0.15 : TC.x1 + 0.15, xout = xin + s * 1.75;
        lattice(Math.min(xin, xout), Math.max(xin, xout), yb0, yb1, zb, M.iron, 0.26);
        column(xout, yb0, yb1 + 0.4, zb - 0.05, 0.46);
        // knee brace down into the cliff top, and a beacon on top
        const kb = K.box(0.16, 2.4, 0.16, M.ironM, xout - s * 0.55, yb0 - 0.9, zb, S); kb.rotation.z = s * 0.5;
        K.box(0.7, 0.18, 0.7, M.brassD, xout, yb1 + 0.7, zb - 0.05, S); K.box(0.22, 0.26, 0.22, M.beacon, xout, yb1 + 0.92, zb - 0.05, S);
        // ladder up the inside of the buttress to a grated platform flush with the checks floor
        for (const sx of [-0.2, 0.2]) K.box(0.05, TC.y - yb0 - 0.2, 0.05, M.iron, (xin + xout) / 2 + sx, (yb0 + TC.y) / 2, zb + 0.4, S);
        for (let y = yb0 + 0.4; y < TC.y; y += 0.32) K.box(0.4, 0.04, 0.04, M.ironL, (xin + xout) / 2, y, zb + 0.4, S);
        towerDeck(Math.min(xin, xout + s * 0.3) - (s < 0 ? 0 : 0.15), Math.max(xin, xout + s * 0.3) + (s < 0 ? 0.15 : 0), TC.y + 0.1, zb - 0.45, zb + 0.75, s);
      }
      // upper: lattice towers beside the launch riser, past the freight lift (left) and the sent-back drop (right)
      const zu = RL.zf - 0.1, yu0 = TC.y + 0.1, yu1 = TL.y + 1.6;
      for (const s of [-1, 1]) {
        let x = s < 0 ? TL.x0 - 2.8 : TL.x1 + 2.8;
        for (let k = 0; k < 8 && blocked(x, zu, 0.5, yu0, yu1); k++) x += s * 0.3;
        const xo = x + s * 1.3;
        lattice(Math.min(x, xo), Math.max(x, xo), yu0, yu1, zu, M.iron, 0.24);
        // ladder up its face from the checks floor to the platform at the launch floor
        for (const sx of [-0.2, 0.2]) K.box(0.05, TL.y - yu0, 0.05, M.iron, (x + xo) / 2 + sx, (yu0 + TL.y) / 2, zu + 0.4, S);
        for (let y = yu0 + 0.3; y < TL.y; y += 0.32) K.box(0.4, 0.04, 0.04, M.ironL, (x + xo) / 2, y, zu + 0.4, S);
        column(xo, yu0, yu1 + 0.4, zu - 0.05, 0.42);
        K.box(0.7, 0.18, 0.7, M.brassD, xo, yu1 + 0.7, zu - 0.05, S); K.box(0.22, 0.26, 0.22, M.beacon, xo, yu1 + 0.92, zu - 0.05, S);
        towerDeck(Math.min(x, xo) - 0.1, Math.max(x, xo) + 0.1, TL.y + 0.1, zu - 0.45, zu + 0.7, s);
        // girder to the launch slab corner, behind the lift's column
        const xs = s < 0 ? TL.x0 : TL.x1, gz = zu - 0.35;
        K.box(Math.abs(x - xs), 0.34, 0.2, M.ironM, (x + xs) / 2, TL.y - 1.0, gz, S);
        const L = Math.hypot(x - xs, 4.2), br = K.box(0.14, L, 0.14, M.iron, (x + xs) / 2, TL.y - 1.0 - 2.1, gz, S); br.rotation.z = Math.atan2(xs - x, 4.2) * -1;
      }
      // catwalks along the outside of the checks deck's sides, from each lower tower's platform back to the foot of
      // the upper tower's ladder (pushed out past anything running along the deck edge, e.g. the gate-return belt)
      const zc0 = zb - 0.45, zc1 = zu + 0.3, cw = 0.85;
      for (const s of [-1, 1]) {
        const edge = s < 0 ? TC.x0 : TC.x1;
        let xi = edge;
        const hit = (xi) => { for (let z = zc1 + 0.2; z < Math.min(zc0, TC.z1 - 1.7); z += 0.5) if (blocked(xi + s * cw / 2, z, cw / 2, TC.y + 0.1, TC.y + 1.1)) return true; return false; };
        for (let k = 0; k < 6 && hit(xi); k++) xi += s * 0.15;
        const xo = xi + s * cw;
        catwalk(xi, xo, edge, TC.y + 0.1, zc1, zc0);
        // close the lower platform's back edge between its outer railing and the catwalk's
        const pOut = s < 0 ? TC.x0 - 0.15 - 1.75 - 0.3 : TC.x1 + 0.15 + 1.75 + 0.3, a = Math.min(pOut, xo), b = Math.max(pOut, xo);
        if (b - a > 0.1) { for (const yy of [0.5, 0.95]) K.box(b - a, 0.05, 0.05, M.ironL, (a + b) / 2, TC.y + 0.1 + yy, zc0 + 0.02, S); K.box(0.05, 0.95, 0.05, M.iron, (a + b) / 2, TC.y + 0.57, zc0 + 0.02, S); }
      }
    });
    // switchback fire escape against a riser wall: flights (stringers, treads, handrail), grated landings, then a
    // ladder up the slab rim to the deck above
    function flight(xa, ya, xb, yb, zc, D) {
      const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx), cx = (xa + xb) / 2, cy = (ya + yb) / 2;
      for (const s of [-1, 1]) { const st = K.box(L, 0.16, 0.05, M.iron, cx, cy - 0.06, zc + s * D / 2, S); st.rotation.z = a; }
      const n = Math.max(3, Math.round(Math.abs(dy) / 0.27));
      for (let i = 1; i < n; i++) { const u = i / n; K.box(0.26, 0.04, D - 0.06, M.grate, xa + dx * u, ya + dy * u, zc, S); }
      const hr = K.box(L, 0.05, 0.05, M.ironL, cx, cy + 0.88, zc + D / 2, S); hr.rotation.z = a;
      for (const u of [0.05, 0.5, 0.95]) K.box(0.05, 0.9, 0.05, M.iron, xa + dx * u, ya + dy * u + 0.45, zc + D / 2, S);
    }
    function landing(x0, x1, y, zf, D) {
      const zc = zf + 0.2 + D / 2, w = x1 - x0, cx = (x0 + x1) / 2;
      noShadow(wuv(K.box(w, 0.07, D, M.grate, cx, y - 0.035, zc, S), GRT, GRT));
      K.box(w, 0.14, 0.05, M.ironM, cx, y - 0.07, zc + D / 2, S);
      for (const x of [x0 + 0.1, x1 - 0.1]) { const b = K.box(0.07, 1.1, 0.07, M.iron, x, y - 0.55, zf + 0.2 + D * 0.5, S); b.rotation.x = 0.7; }
      K.box(w, 0.05, 0.05, M.ironL, cx, y + 0.95, zc + D / 2, S); K.box(w, 0.04, 0.04, M.ironL, cx, y + 0.5, zc + D / 2, S);
      for (let x = x0 + 0.05; x <= x1; x += Math.max(0.3, w / 2)) K.box(0.05, 0.95, 0.05, M.iron, x, y + 0.47, zc + D / 2, S);
    }
    function ladder(x, y0, y1, z, hoops) {
      for (const sx of [-0.2, 0.2]) K.box(0.05, y1 - y0 + (hoops ? 0.5 : 0), 0.05, M.iron, x + sx, (y0 + y1) / 2 + (hoops ? 0.25 : 0), z, S);
      for (let y = y0 + 0.2; y < y1; y += 0.3) K.box(0.4, 0.04, 0.04, M.ironL, x, y, z, S);
      if (hoops) { const h = K.torus(0.24, 0.025, M.iron, 4, 10, x, y1 + 0.35, z + 0.05, S, Math.PI); h.rotation.z = 0; }
    }
    function fireEscape(xa, xb, y0, y1, zf, rimTop) {
      // flights alternate between the two ends of [xa, xb]; landings sit just outside the flight span
      const D = 0.85, zc = zf + 0.2 + D / 2, n = 3, rise = (y1 - y0) / n;
      let from = xb, to = xa;
      for (let i = 0; i < n; i++) {
        const ya = y0 + i * rise, yb = ya + rise;
        flight(from, ya, to, yb, zc, D);
        const lx0 = to < from ? to - 0.8 : to, lx1 = to < from ? to : to + 0.8;
        landing(lx0, lx1, yb, zf, D);
        if (i === n - 1) ladder((lx0 + lx1) / 2, yb, rimTop, zf + 0.42, true);
        [from, to] = [to, from];
      }
      extraKeep.push([Math.min(xa, xb) - 0.9, Math.max(xa, xb) + 0.9, zf, zf + 0.2 + D + 0.1, y0 - 0.2, y1 + 2]);
    }
    sect('fire escapes', () => {
      fireEscape(fe.checks[0], fe.checks[1], RC.y0, RC.y1 - 0.62, RC.zf, TC.y + 0.1);
      fireEscape(fe.launch[1], fe.launch[0], RL.y0, RL.y1 - 0.62, RL.zf, TL.y + 0.1);
    });

    // ================= SKYLINE: behind the launch floor =================
    const chimTops = [];
    function chimney(x, z, y0, y1, r, smoke, P) {
      const h = y1 - y0; P = P || S;
      cuv(K.cyl(r, r * 1.2, h, M.brickC, 10, x, y0 + h / 2, z, P), r, h, BRU, BRV);
      K.cyl(r * 1.18, r * 1.18, 0.3, M.soot, 10, x, y1 + 0.1, z, P);
      K.cyl(r * 1.25, r * 1.25, 0.1, M.brassD, 10, x, y1 - 0.6, z, P);
      K.cyl(r * 1.04, r * 1.04, 0.9, M.grimeL, 10, x, y1 - 0.2, z, P);
      if (P === S) for (let y = y1 - h * 0.55; y < y1 - 0.6; y += 0.32) K.box(0.12, 0.03, 0.05, M.iron, x, y, z + r * 1.1 - (y - y0) * 0.2 / h * r, P);
      if (smoke !== false) chimTops.push([x, y1 + 0.3, z, r, smoke === 'far']);
    }
    sect('skyline', () => {
      const yb = TL.y - 3.5; // bases hide behind the back wall
      chimney(-13.6, -28.6, yb, TL.y + 9.6, 0.85); chimney(-4.9, -28.9, yb, TL.y + 10.8, 1.0); chimney(1.6, -28.4, yb, TL.y + 8.9, 0.8); chimney(9.8, -29.0, yb, TL.y + 10.1, 0.9);
      // silhouette blocks of the foundry district (the mockup's skyline), bases far below
      for (let x = -19.5; x < 19.5;) { // only behind the top floor: the sides stay open to the sky
        const w = 1.6 + rnd() * 2.8, z = -36.5 - rnd() * 5, top = TL.y - 1.2 + rnd() * 4.2, base = TL.y - 14;
        const m = rnd() < 0.5 ? M.sil : M.silD;
        K.box(w, top - base, 2, m, x + w / 2, (top + base) / 2, z, FAR);
        for (let i = 0; i < Math.floor(w / 0.7); i++) { const tr = K.box(0.7, 0.5, 2, M.sil, x + 0.35 + i * 0.7, top + 0.2, z, FAR); tr.rotation.z = 0.55; tr.scale.y = 0.8; }
        if (rnd() < 0.55) { const cx = x + w * rnd(); K.cyl(0.18, 0.22, 1.8, M.silD, 6, cx, top + 0.9, z, FAR); chimTops.push([cx, top + 1.8, z, 0.18, true]); }
        for (let i = 0; i < 5; i++) if (rnd() < 0.55) K.box(0.2, 0.24, 0.05, rnd() < 0.7 ? M.cityWin : M.cityWin2, x + 0.4 + rnd() * (w - 0.8), top - 0.5 - rnd() * 3.2, z + 1.03, FAR);
        x += w + 0.2;
      }
      // distant tower crane (left) + gasometer (right)
      const tc = K.group(FAR, -21.5, TL.y - 1, -38);
      for (let y = 0; y < 10; y += 0.8) { K.box(0.6, 0.06, 0.06, M.silL, 0, y, 0, tc); const b = K.box(0.06, 0.95, 0.06, M.silL, 0, y + 0.4, 0, tc); b.rotation.z = 0.55; }
      for (const s of [-0.3, 0.3]) K.box(0.09, 10, 0.09, M.silL, s, 5, 0, tc);
      K.box(8.5, 0.14, 0.14, M.silL, 2.4, 10.1, 0, tc); K.box(0.6, 0.6, 0.6, M.silD, -1.4, 9.9, 0, tc);
      for (let i = 0; i < 6; i++) { const b = K.box(0.06, 1.1, 0.06, M.silL, -0.6 + i * 1.3, 10.6, 0, tc); b.rotation.z = 0.9; }
      K.box(0.14, 0.14, 0.14, M.beacon, 0, 10.5, 0, tc); K.box(0.16, 0.16, 0.16, M.beacon, 6.4, 10.25, 0, tc); // both blink with the beacon color
      const gaso = K.group(FAR, 19.5, TL.y - 1, -40);
      K.cyl(2.8, 2.8, 3.2, M.gasoM, 16, 0, 1.6, 0, gaso);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.14, 4.4, 0.14, M.silL, Math.cos(a) * 2.95, 2.2, Math.sin(a) * 2.95, gaso); }
      for (const y of [1.4, 2.8, 4.2]) K.torus(2.95, 0.06, M.silL, 4, 24, 0, y, 0, gaso).rotation.x = Math.PI / 2;
    });

    // ---- BLAST FURNACE (left, behind the back wall): brick shaft, charging skip, hot-blast stoves, downcomer ----
    let skip = null, furnaceTop = null, mouthM = null;
    sect('blast furnace', () => {
      const FX = -9.6, FZ = -30.2, y0 = TL.y - 1;
      const bf = K.group(S, FX, y0, FZ);
      const sh = cuv(K.cyl(1.55, 1.85, 5.4, M.brickC, 12, 0, 2.7, 0, bf), 1.7, 5.4, BRU, BRV);
      for (const y of [1.0, 2.2, 3.4, 4.6, 5.3]) { band(bf, 1.62 + (5.4 - y) * 0.055, y, M.ironM, 0.16); rivetRing(bf, 1.66 + (5.4 - y) * 0.055, y + 0.02, 20, M.brassD); }
      K.lathe([[1.55, 0], [1.15, 0.8], [0.62, 1.4], [0.62, 2.4]], M.ironM, 12, 0, 5.4, 0, bf);
      K.cyl(0.74, 0.74, 0.24, M.rust, 12, 0, 7.9, 0, bf);
      K.cyl(0.7, 0.7, 0.6, M.grimeL, 12, 0, 7.6, 0, bf);
      mouthM = M.hatchGlow;
      K.box(1.0, 0.25, 0.1, mouthM, 0, 8.05, 0.62, bf); // flare slot at the throat
      // downcomer: gas uptakes joining and dropping to the dust catcher
      K.tube([[0.4, 7.6, 0.2], [0.9, 8.9, 0.3], [2.0, 9.2, 0.3], [3.0, 8.4, 0.2], [3.1, 4.4, 0.2]], 0.2, M.rust, bf, 20, 6);
      K.tube([[-0.4, 7.6, 0.2], [-0.8, 8.7, 0.3], [0.9, 8.9, 0.3]], 0.17, M.rust, bf, 12, 6);
      K.cyl(0.7, 0.5, 1.6, M.ironM, 10, 3.1, 3.7, 0.2, bf); K.cone(0.5, 0.7, M.ironM, 10, 3.1, 2.55, 0.2, bf);
      // two hot-blast stoves (domed towers) on the left, bustle pipe round the furnace
      for (const [sx, h] of [[-3.0, 7.2], [-4.9, 6.6]]) {
        cuv(K.cyl(0.85, 0.85, h, M.brickC, 10, sx, h / 2, -0.4, bf), 0.85, h, BRU, BRV);
        K.sph(0.85, M.ironM, sx, h, -0.4, bf, 10, 6).scale.y = 0.55;
        for (const y of [1.2, 3.0, 4.8]) { const b = K.cyl(0.9, 0.9, 0.12, M.ironM, 10, sx, y, -0.4, bf); }
        K.cyl(0.15, 0.15, 0.6, M.ironL, 6, sx, h + 0.6, -0.4, bf);
      }
      K.tube([[-4.9, 4.2, 0.2], [-3.0, 4.4, 0.4], [-1.6, 4.4, 0.8], [0, 4.4, 1.9]], 0.2, M.copperD, bf, 12, 6);
      K.torus(1.95, 0.14, M.copperD, 6, 18, 0, 4.4, 0, bf).rotation.x = Math.PI / 2;
      // charging incline (lattice) and the skip that rides it
      const inc = K.group(bf, 2.0, 0, 0.9); inc.rotation.z = 0;
      for (const sz of [-0.32, 0.32]) K.tube([[3.4, 0, sz], [2.3, 4.0, sz], [0.6, 8.2, sz]], 0.07, M.iron, inc, 10, 4);
      for (let i = 0; i < 9; i++) { const u = i / 8; K.box(0.08, 0.08, 0.7, M.ironM, 3.4 - 2.8 * u, 8.2 * u, 0, inc); }
      skip = K.dyn(K.group(bf, 4.8, 0.6, 0.9)); K.box(0.5, 0.38, 0.5, M.rust, 0, 0, 0, skip); for (let i = 0; i < 4; i++) K.rock(0.09, M.coal, R() * 0.26, 0.22, R() * 0.26, skip);
      furnaceTop = [FX, y0 + 8.2, FZ];
    });

    // ---- WATER TOWER (back right of the launch floor, or behind the wall when the floor is full) ----
    sect('water tower', () => {
      let x = 13.7, z = -25.0, y0 = TL.y + 0.1;
      if (blocked(x, z, 1.0, y0, y0 + 5)) { z = -28.0; }
      const wt = K.group(S, x, y0, z);
      for (const sx of [-0.7, 0.7]) for (const sz of [-0.7, 0.7]) K.box(0.14, 3.6, 0.14, M.iron, sx, 1.8, sz, wt);
      for (const y of [1.0, 2.2]) { K.box(1.55, 0.08, 0.08, M.ironM, 0, y, 0.7, wt); K.box(1.55, 0.08, 0.08, M.ironM, 0, y, -0.7, wt); K.box(0.08, 0.08, 1.55, M.ironM, 0.7, y, 0, wt); K.box(0.08, 0.08, 1.55, M.ironM, -0.7, y, 0, wt); }
      for (const y of [0.5, 1.6, 2.8]) { const b = K.box(1.9, 0.06, 0.06, M.ironM, 0, y + 0.55, 0.72, wt); b.rotation.z = 0.6; }
      K.cyl(1.0, 1.0, 1.5, M.woodD, 14, 0, 4.35, 0, wt); for (const y of [3.8, 4.35, 4.9]) band(wt, 1.02, y, M.iron, 0.06);
      K.cone(1.1, 0.7, M.roofIron, 14, 0, 5.45, 0, wt); K.box(0.4, 0.3, 0.05, M.hazard, 0, 4.4, 1.02, wt);
      K.tube([[0.8, 3.6, 0.3], [1.0, 2.0, 0.6], [1.0, 0.3, 0.6]], 0.06, M.copperD, wt, 10, 5);
      K.box(0.05, 2.0, 0.05, M.iron, -0.3, 4.4, 1.02, wt); for (let y = 3.6; y < 5.2; y += 0.25) K.box(0.24, 0.03, 0.03, M.ironL, -0.18, y, 1.04, wt);
    });

    // ================= THE CITY ON BOTH SIDES (hazy towers rising from the depths) =================
    // modules/city-old.js (the floating city, ?artpass=1, keeps only its landmarks: see ART-PASS.md)
    sect('city', () => {
      const landmarks = artPass() ? K.group(FAR) : null;
      if (landmarks) { landmarks.name = 'city-landmarks'; landmarks.userData.noBake = true; }
      oldCity({ K, THREE, M, rnd, chimney, hazeTex, FAR, chimTops, landmarks, artPass: artPass() });
    });

    // ================= AIRSHIPS =================
    let ship = null, prop = null, ship2 = null;
    function airship(scale, withName) {
      const sh = K.dyn(K.group(root));
      const g = K.group(sh); g.scale.setScalar(scale);
      const env = K.sph(1, M.envelope, 0, 0, 0, g, 16, 10); env.scale.set(2.4, 0.75, 0.75);
      for (let i = -2; i <= 2; i++) { const rib = K.torus(0.76 * Math.sqrt(1 - (i / 2.6) ** 2), 0.03, M.brassD, 4, 18, i * 0.85, 0, 0, g); rib.rotation.y = Math.PI / 2; }
      for (const [y, z] of [[0.7, 0], [0, 0.7], [0, -0.7]]) K.box(0.8, y ? 0.6 : 0.05, z ? 0.6 : 0.05, M.leather, -2.3, y * 0.6, z * 0.6, g);
      const gond = K.group(g, 0.2, -0.95, 0);
      K.box(1.4, 0.32, 0.4, M.wood, 0, 0, 0, gond); K.box(1.5, 0.06, 0.46, M.brass, 0, 0.17, 0, gond);
      for (let i = 0; i < 4; i++) K.box(0.14, 0.1, 0.02, M.gasLamp, -0.5 + i * 0.32, 0.02, 0.21, gond);
      for (const x of [-0.5, 0.5]) for (const zz of [0.15, -0.15]) K.box(0.03, 0.55, 0.03, M.iron, x, 0.42, zz, gond);
      if (withName) { const nt = K.mat(0xffffff, { map: signTexP('SHIPTORIO', '#e8c070', '#3a2414', 1) }); K.box(1.7, 0.3, 0.02, nt, -0.1, 0.05, 0.74, g); }
      K.box(0.1, 0.1, 0.1, M.beacon, 2.45, 0, 0, g); // blinks with the beacon color
      const pr = K.group(g, -2.75, -0.1, 0); K.box(0.04, 0.9, 0.1, M.woodD, 0, 0, 0, pr);
      if (withName) K.dyn(pr); // the far ship's propeller is a couple of pixels: left still
      noCast.push(sh);
      return { sh, pr };
    }
    M.envelope = K.mat(0x8c6e4c, { shine: 8 });
    sect('airships', () => {
      const a = airship(1.2, true); ship = a.sh; prop = a.pr;
      const b = airship(0.85, false); ship2 = b.sh; ship2.rotation.y = Math.PI;
    });

    // ================= DECK DRESSING: markings, grime, puddles, scrap, props =================
    const sheens = [], steamVents = [], manholes = [];
    function dressDeck(tier, area) {
      const top = tier.y + 0.1;
      // worn dashed diamonds round every big machine bay on this floor
      for (const st of ctx.stations) {
        if (st.tier !== area || BIG[st.type] === undefined) continue;
        const R0 = 3.9, corners = [[st.x - R0, st.z], [st.x, st.z + R0], [st.x + R0, st.z], [st.x, st.z - R0]];
        for (let e = 0; e < 4; e++) {
          const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4], len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 0.62);
          for (let k = 0; k < n; k++) {
            if (rnd() < 0.12) continue; const u = (k + 0.3) / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
            if (x < tier.x0 + 0.2 || x > tier.x1 - 0.2 || z < tier.z0 + 0.2 || z > tier.z1 - 0.3) continue;
            if (SEGS.some((s) => s.kind === 'belt' && Math.abs(s.a[1] - (tier.y + 1)) < 0.5 && d2(x, z, s.a[0], s.a[2], s.b[0], s.b[2]) < 0.6)) continue;
            decal(tier, x, z, 0.38, 0.09, M.paint, -Math.atan2(bz - az, bx - ax));
          }
        }
      }
      // flow chevrons painted beside this floor's belts
      for (const p of ctx.pathList) {
        if (p.kind !== 'belt' || Math.abs(p.points[0][1] - (tier.y + 1)) > 0.3 || p.L < 2) continue;
        const v = new THREE.Vector3(), side = p.rework ? -1 : 1;
        for (let s = 0.8; s < p.L - 0.6; s += 1.0) {
          const sg = p.at(s, v); const nx = Math.sin(sg.yaw) * side, nz = Math.cos(sg.yaw) * side;
          const x = v.x + nx * 0.66, z = v.z + nz * 0.66;
          if (x < tier.x0 + 0.3 || x > tier.x1 - 0.3 || z < tier.z0 + 0.3 || z > tier.z1 - 0.3) continue;
          if (ctx.stations.some((st) => st.tier === area && BIG[st.type] !== undefined && Math.abs(x - st.x) + Math.abs(z - st.z) < 3.5)) continue;
          const g = K.group(S, x, top + DEC, z); g.rotation.y = sg.yaw;
          noShadow(K.box(0.26, 0.01, 0.06, p.rework ? M.paintR : M.paintW, -0.06, 0, 0.07, g)).rotation.y = 0.7;
          noShadow(K.box(0.26, 0.01, 0.06, p.rework ? M.paintR : M.paintW, -0.06, 0, -0.07, g)).rotation.y = -0.7;
        }
      }
      // grime + soot decals, rust stains
      const W = tier.x1 - tier.x0, D = tier.z1 - tier.z0, n = Math.round(W * D * 0.16);
      for (let i = 0; i < n; i++) decal(tier, tier.x0 + 0.5 + rnd() * (W - 1), tier.z0 + 0.4 + rnd() * (D - 0.8), 0.4 + rnd() * 1.6, 0.25 + rnd() * 1.0, rnd() < 0.6 ? M.grime : M.grimeL, rnd() * 3, DEC + rnd() * 0.004);
      for (let i = 0; i < n * 0.08; i++) decal(tier, tier.x0 + 0.5 + rnd() * (W - 1), tier.z0 + 0.4 + rnd() * (D - 0.8), 0.3 + rnd() * 0.6, 0.15 + rnd() * 0.3, M.rustStain, rnd() * 3, DEC + 0.002);
      // oil puddles with a sheen
      for (let i = 0, k = 0; i < 40 && k < Math.round(W * D / 45); i++) {
        const x = tier.x0 + 1 + rnd() * (W - 2), z = tier.z0 + 1 + rnd() * (D - 2), sx = 0.7 + rnd() * 0.7, sz = 0.45 + rnd() * 0.2;
        if (!free(tier, x, z, 0.3, 0.3)) continue; k++;
        const p = K.sph(1, M.oil, x, top, z, S, 14, 4); p.scale.set(sx * 0.8, 0.02, sz * 0.8); p.castShadow = false;
        const rim = K.torus(1, 0.04, M.grime, 3, 20, x, top + 0.015, z, S); rim.scale.set(sx * 0.8, sz * 0.8, 1); rim.rotation.x = Math.PI / 2; rim.castShadow = false;
        const sh = K.sph(1, M.sheen, x + sx * 0.15, top + 0.025, z - sz * 0.1, S, 12, 3); sh.scale.set(sx * 0.6, 0.01, sz * 0.45); sh.castShadow = false; sheens.push(sh);
      }
      // scattered bolts, nuts, scrap plates, spanners
      for (let i = 0; i < W * D * 0.15; i++) {
        const x = tier.x0 + 0.4 + rnd() * (W - 0.8), z = tier.z0 + 0.4 + rnd() * (D - 0.8); if (!free(tier, x, z, 0.1, 0.2)) continue;
        const r = rnd();
        if (r < 0.45) K.box(0.06, 0.04, 0.06, rnd() < 0.5 ? M.ironL : M.brassD, x, top + 0.03, z, S).rotation.y = rnd() * 3;
        else if (r < 0.7) K.cyl(0.05, 0.05, 0.03, M.ironL, 6, x, top + 0.03, z, S);
        else if (r < 0.88) { const pl = K.box(0.2 + rnd() * 0.25, 0.02, 0.12 + rnd() * 0.2, rnd() < 0.5 ? M.rust : M.ironM, x, top + 0.02, z, S); pl.rotation.set(rnd() * 0.1, rnd() * 3, rnd() * 0.1); }
        else { const sp = K.box(0.36, 0.04, 0.04, M.ironL, x, top + 0.03, z, S); sp.rotation.y = rnd() * 3; }
      }
      // manholes that breathe steam + floor steam grates
      for (let i = 0, k = 0; i < 30 && k < 3; i++) {
        const x = tier.x0 + 1.5 + rnd() * (W - 3), z = tier.z0 + 1 + rnd() * (D - 2); if (!free(tier, x, z, 0.5, 0.6)) continue; k++;
        K.cyl(0.46, 0.46, 0.04, M.iron, 16, x, top + 0.02, z, S); K.torus(0.42, 0.03, M.ironL, 4, 18, x, top + 0.045, z, S).rotation.x = Math.PI / 2;
        for (let j = 0; j < 4; j++) { const b = K.box(0.7, 0.012, 0.05, M.ironM, x, top + 0.048, z, S); b.rotation.y = j * Math.PI / 4; }
        manholes.push([x, top, z]);
      }
      for (let i = 0, k = 0; i < 30 && k < 3; i++) {
        const x = tier.x0 + 1.5 + rnd() * (W - 3), z = tier.z0 + 1 + rnd() * (D - 2); if (!free(tier, x, z, 0.45, 0.6)) continue; k++;
        K.box(0.7, 0.06, 0.7, M.ironM, x, top + 0.03, z, S); for (let j = 0; j < 4; j++) K.box(0.6, 0.07, 0.05, M.soot, x, top + 0.05, z - 0.24 + j * 0.16, S);
        steamVents.push([x, top, z]);
      }
    }
    M.paintR = K.mat(0xc03a24, { op: 0.6, depthWrite: false });
    sect('dress build', () => dressDeck(TB, 'build'));
    sect('dress checks', () => dressDeck(TC, 'checks'));
    sect('dress launch', () => dressDeck(TL, 'launch'));

    // props: try each candidate, keep the ones that are clear on this plan
    function place(tier, x, z, r, h, fn) { if (!free(tier, x, z, r, h)) return false; fn(x, tier.y + 0.1, z); return true; }
    let lightsLeft = 2;
    sect('props build', () => {
      const t = TB, y = t.y + 0.1;
      // front strip: lamps, toolboxes, coils, crates, barrels, hoses
      for (const x of [-11.6, -4.6, 4.6, 12.0]) place(t, x, 6.65, 0.35, 3.2, (px, py, pz) => lampPost(px, py, pz, 2.6));
      place(t, -8.2, 6.8, 0.4, 0.5, (px, py, pz) => toolbox(px, py, pz, -0.4)); place(t, 7.8, 6.6, 0.4, 0.5, (px, py, pz) => toolbox(px, py, pz, 0.8));
      place(t, 1.8, 6.62, 0.4, 0.4, (px, py, pz) => coil(px, py, pz, 0.32, M.ironL)); place(t, -2.7, 6.9, 0.35, 0.4, (px, py, pz) => coil(px, py, pz, 0.28, M.soot));
      place(t, 14.4, 6.68, 0.5, 0.7, (px, py, pz) => crate(px, py, pz, 0.6, 0.3)); place(t, 15.1, 6.75, 0.4, 0.6, (px, py, pz) => crate(px, py, pz, 0.45, -0.2)); place(t, -13.4, 6.7, 0.45, 0.6, (px, py, pz) => crate(px, py, pz, 0.55, 0.2));
      place(t, 9.4, 6.9, 0.4, 0.9, (px, py, pz) => barrel(px, py, pz, M.copperD)); place(t, -6.8, 6.78, 0.45, 0.7, (px, py, pz) => barrel(px, py, pz, M.wood, 1.2));
      if (free(t, -8.2, 5.85, 0.35, 0.3)) K.tube([[-9.6, y + 0.07, 6.3], [-9.0, y + 0.08, 5.9], [-8.2, y + 0.08, 6.1], [-7.5, y + 0.08, 5.75], [-7.0, y + 0.06, 5.35]], 0.06, M.soot, S, 20, 5);
      if (free(t, 11.8, 6.0, 0.35, 0.3)) K.tube([[10.6, y + 0.07, 6.5], [11.2, y + 0.08, 6.1], [12.2, y + 0.08, 5.8], [13.0, y + 0.07, 6.6]], 0.06, M.hose, S, 20, 5);
      // right end: coal pile + shovel, drums, the rocket-parts depot
      if (free(t, 16.4, -1.6, 1.4, 1)) { for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, r = rnd() * 1.5; K.rock(0.14 + rnd() * 0.2, M.coal, 16.4 + Math.cos(a) * r, y + (1.5 - r) * 0.35 + rnd() * 0.15, -1.6 + Math.sin(a) * r * 0.8, S); } const sv = K.box(0.05, 0.05, 1.1, M.wood, 15.6, y + 0.4, -0.7, S); sv.rotation.set(0.9, 0.4, 0); }
      // (x stays under 18.1: a geothermal plant feeding a builder runs its conduit along this edge at x 18.3)
      [[17.7, 0.9], [17.75, 1.7], [17.2, 1.4]].forEach(([x, z], i) => place(t, x, z, 0.32, 0.9, (px, py, pz) => drum(px, py, pz, i % 2 ? 0x7a2a1a : 0x2a4a3a)));
      place(t, 16.1, 6.75, 0.5, 0.6, (px, py, pz) => drum(px, py, pz, 0x7a2a1a, 0.9));
      if (free(t, 16.4, 3.6, 1.0, 1)) {
        const depot = K.group(S, 16.4, y, 3.4);
        for (const [x, z, ry] of [[-0.4, -0.5, 0.2], [0.6, 0.55, -0.3]]) { const nc = K.group(depot, x, 0.45, z); nc.rotation.set(0, ry, Math.PI / 2); K.lathe([[0.42, 0], [0.36, 0.5], [0.2, 0.9], [0.04, 1.15]], M.copperD, 12, 0, 0, 0, nc); K.torus(0.42, 0.03, M.brassD, 4, 16, 0, 0.02, 0, nc).rotation.x = Math.PI / 2; for (const s of [-0.3, 0.3]) K.box(0.12, 0.42, 0.6, M.woodD, 0, s, 0, nc).rotation.z = Math.PI / 2; }
      }
      // back strip by the riser: crates, barrels, gas bottles, parts racks (wherever the power plants leave room)
      for (const [x, z, s, ry] of [[-9.0, -3.9, 0.7, 0.2], [-8.2, -3.6, 0.5, -0.4], [-2.4, -4.0, 0.6, 0.3], [5.9, -3.9, 0.7, 0.4], [6.8, -3.4, 0.5, 0.1], [12.6, -3.9, 0.6, -0.2], [13.6, -3.6, 0.5, 0.3]]) place(t, x, z, s * 0.75, s + 0.1, (px, py, pz) => crate(px, py, pz, s, ry));
      for (const [x, z] of [[-10.7, -3.7], [7.3, -4.0], [14.6, -3.7]]) place(t, x, z, 0.4, 1, (px, py, pz) => barrel(px, py, pz, rnd() < 0.5 ? M.copperD : M.wood));
      place(t, -15.6, -2.5, 0.7, 1.3, (px, py, pz) => gasBottles(px - 0.45, py, pz, 4));
      place(t, 11.2, -3.75, 0.95, 1.9, (px, py, pz) => rack(px, py, pz));
    });
    sect('props checks', () => {
      const t = TC;
      for (const x of [-11.5, -4.9, 6.0]) place(t, x, -14.6, 0.35, 3.2, (px, py, pz) => lampPost(px, py, pz, 2.6)); // -4.9: beside the furnace hatch, on the pilaster
      for (const [x, z, s, ry] of [[-13.2, -14.7, 0.7, 0.3], [-12.4, -14.9, 0.5, -0.2], [-3.7, -14.8, 0.6, 0.2], [-0.6, -14.6, 0.8, -0.1], [3.6, -14.8, 0.6, 0.4], [8.4, -14.8, 0.55, -0.3], [-17.6, -9.6, 0.6, 0.1], [-17.4, -12.2, 0.7, -0.3]]) place(t, x, z, s * 0.75, s + 0.1, (px, py, pz) => crate(px, py, pz, s, ry));
      for (const [x, z] of [[-17.7, -7.2], [-17.0, -7.9], [-9.4, -14.7], [1.6, -14.9]]) place(t, x, z, 0.4, 1, (px, py, pz) => barrel(px, py, pz, rnd() < 0.5 ? M.copperD : M.wood));
      place(t, -7.4, -14.9, 0.7, 1.3, (px, py, pz) => gasBottles(px - 0.45, py, pz, 4));
      place(t, -17.6, -14.6, 0.45, 0.5, (px, py, pz) => toolbox(px, py, pz, 0.4));
      for (const [x, z] of [[-6.3, -14.4], [5.2, -14.5]]) place(t, x, z, 0.95, 1.9, (px, py, pz) => rack(px, py, pz));
    });
    sect('props launch', () => {
      const t = TL;
      for (const x of [-12.8, -1.3]) place(t, x, -25.0, 0.35, 3.2, (px, py, pz) => lampPost(px, py, pz, 2.6));
      for (const [x, z, s, ry] of [[-3.4, -25.3, 0.6, 0.2], [0.2, -25.4, 0.7, -0.3], [9.5, -25.4, 0.55, 0.2], [-14.2, -25.8, 0.6, 0.1]]) place(t, x, z, s * 0.75, s + 0.1, (px, py, pz) => crate(px, py, pz, s, ry));
      [[-14.1, -20.0], [-13.5, -19.4], [-14.3, -18.8], [10.6, -25.6], [11.2, -25.2]].forEach(([x, z], i) => place(t, x, z, 0.32, 0.9, (px, py, pz) => drum(px, py, pz, i % 2 ? 0x7a2a1a : 0x2a4a3a)));
      if (free(t, -12.4, -23.6, 1.0, 1)) {
        const nc = K.group(S, -12.6, t.y + 0.1 + 0.45, -23.4); nc.rotation.set(0, 0.3, Math.PI / 2);
        K.lathe([[0.42, 0], [0.36, 0.5], [0.2, 0.9], [0.04, 1.15]], M.copperD, 12, 0, 0, 0, nc); for (const s of [-0.3, 0.3]) K.box(0.12, 0.42, 0.6, M.woodD, 0, s, 0, nc).rotation.z = Math.PI / 2;
      }
    });

    // ================= WORKERS (they walk their beats) =================
    const walkers = [];
    function walkerOn(tier, z, a0, a1, col, load) {
      const y = tier.y + 0.1;
      // shrink the beat until every step of it is clear
      const ok = (x) => !blocked(x, z, 0.3, y, y + 1.2) && x > tier.x0 + 0.5 && x < tier.x1 - 0.5;
      while (a1 - a0 > 1.5 && !ok(a0)) a0 += 0.5; while (a1 - a0 > 1.5 && !ok(a1)) a1 -= 0.5;
      for (let x = a0; x <= a1; x += 0.25) if (!ok(x)) return null;
      const w = worker(root, col, a0, y, z);
      if (load === 'crate') { const c = K.group(w.body, 0, 0.42, 0.22); K.box(0.36, 0.28, 0.3, M.woodD, 0, 0, 0, c); K.box(0.38, 0.04, 0.32, M.wood, 0, 0.12, 0, c); w.arms.forEach((a) => (a.rotation.x = -1.2)); }
      if (load === 'board') { const bd = K.group(w.arms[1], 0, -0.3, 0.06); K.box(0.24, 0.02, 0.32, M.woodD, 0, 0, 0, bd); K.box(0.2, 0.025, 0.26, M.paper, 0, 0.012, 0.01, bd); w.arms[1].rotation.x = -1.1; }
      const wk = { w, a0, a1, z, y, x: a0 + (a1 - a0) * rnd(), dir: rnd() < 0.5 ? 1 : -1, sp: 0.45 + rnd() * 0.15, pause: 0 };
      walkers.push(wk); return wk;
    }
    sect('workers', () => {
      walkerOn(TB, 6.05, -15.5, -6.2, 0x4a3a2c, 'crate');
      walkerOn(TB, 2.4, 14.0, 17.6, 0x3a4a52, null);
      walkerOn(TC, -14.0, -12.5, 9.0, 0x5a4a3a, 'board');
      walkerOn(TL, -25.0, -3.0, 1.2, 0x3e4a5a, null);
    });

    // ---- crows on the chimney tops (perch, bob, hop, sometimes take a lap) ----
    const crows = [];
    sect('crows', () => {
      const perches = chimTops.filter((c) => !c[4]).slice(0, 4);
      [0, 1, 1, 3].forEach((pi, k) => {
        const pc = perches[pi % Math.max(1, perches.length)]; if (!pc) return;
        const [px, py, pz, pr] = pc; const a = k * 1.7;
        const home = new THREE.Vector3(px + Math.cos(a) * pr * 0.95, py - 0.15, pz + Math.sin(a) * pr * 0.95);
        const c = K.dyn(K.group(root, home.x, home.y, home.z));
        const body = K.group(c); K.box(0.24, 0.14, 0.13, M.crow, 0, 0.1, 0, body); const tail = K.box(0.14, 0.03, 0.09, M.crow, -0.17, 0.12, 0, body); tail.rotation.z = 0.3;
        const hd = K.dyn(K.group(body, 0.13, 0.21, 0)); K.box(0.1, 0.09, 0.09, M.crow, 0, 0, 0, hd); K.box(0.07, 0.03, 0.03, M.beak, 0.08, -0.01, 0, hd);
        const wings = [-1, 1].map((s) => { const wg = K.dyn(K.group(body, 0, 0.15, s * 0.065)); K.box(0.18, 0.02, 0.2, M.crow, 0, 0, s * 0.1, wg); wg.visible = false; return wg; });
        noCast.push(c);
        c.rotation.y = rnd() * 6;
        crows.push({ c, body, hd, wings, home, state: 'perch', t: 6 + rnd() * 20, ang: 0, rad: 2 + rnd() * 1.5, cy: home.y + 2 + rnd() * 1.5 });
      });
    });

    // ================= LIGHTS (2): the floors with the fewest machine lamps =================
    const lights = [];
    sect('lights', () => {
      // the checks floor has the fewest machine lamps: furnace glow from the hatch, and light spilling out of the
      // open door at the left end of the launch riser
      // (the door's sits low beside its glowing gap, so it pools on the floor without washing out the iron door)
      lights.push({ L: K.light(0xff8a3a, 1.6, 7, -2.5, TC.y + 1.0, RL.zf + 0.7, root), base: 1.6, k: 0 });
      lights.push({ L: K.light(0xffae60, 1.5, 6, -11.2, TC.y + 0.45, RL.zf + 0.45, root), base: 1.5, k: 2 });
      lightsLeft = 0;
    });

    // ================= PALETTE BATCHING =================
    // Every flat-colored part draws with one of four shared materials whose color comes from a 16x16 palette
    // texture (one texel per color; all of a part's UVs point at its texel). The pre-merge below goes by material,
    // so all the iron, brass, stone and paint becomes one mesh instead of one per color.
    // Specular strength rides in a second texture (the old materials' spec colors -> per-texel strength).
    let palT = null, palData = null; const ANIM = {};
    const setGlow = (name, m, r, g, b) => {
      m.color.setRGB(r, g, b);
      const i = ANIM[name]; if (i === undefined || !palData) return;
      palData[i * 4] = Math.round(Math.min(1, r) * 255); palData[i * 4 + 1] = Math.round(Math.min(1, g) * 255); palData[i * 4 + 2] = Math.round(Math.min(1, b) * 255);
      palT.needsUpdate = true;
    };
    sect('palette', () => {
      const N = 16, slots = new Map(), list = [], jobs = [];
      const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
      root.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        if (!m || Array.isArray(m) || m.map || m.userData.keep || m.vertexColors) return;
        let kind = null;
        if (m.isMeshPhongMaterial) kind = m.transparent ? (m.depthWrite ? null : 'decal') : 'solid';
        else if (m.isMeshBasicMaterial) kind = m.blending === THREE.AdditiveBlending ? 'add' : m.transparent ? null : 'glow';
        if (!kind || (kind === 'solid' && m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b))) return;
        const c = m.color, a = kind === 'solid' || kind === 'glow' ? 255 : Math.round(m.opacity * 255);
        const sp = kind === 'solid' && m.shininess > 0 ? Math.round(Math.min(1, lum(m.specular) * 1.5) * 255) : 0;
        const rgb = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), a, sp];
        const key = m.userData.anim && kind === 'glow' ? 'anim:' + m.userData.anim : rgb.join(',');
        let i = slots.get(key);
        if (i === undefined) { i = list.length; slots.set(key, i); list.push(rgb); if (key.startsWith('anim:')) ANIM[m.userData.anim] = i; }
        jobs.push([o, kind, i]);
      });
      if (list.length > N * N) { console.warn('[SHAFT] world: palette full (' + list.length + ' colors)'); return; }
      const data = new Uint8Array(N * N * 4), spec = new Uint8Array(N * N * 4);
      list.forEach(([r, g, b, a, sp], i) => { data.set([r, g, b, a], i * 4); spec.set([sp, sp, sp, 255], i * 4); });
      const tex = (d) => { const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
      palT = tex(data); palData = data; const specT = tex(spec);
      const PAL = {
        solid: K.mat(0xffffff, { map: palT, shine: 30, spec: 0xfff0dc }),
        decal: K.mat(0xffffff, { map: palT, op: 1, depthWrite: false }),
        glow: new THREE.MeshBasicMaterial({ map: palT, fog: false }),
        add: new THREE.MeshBasicMaterial({ map: palT, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      };
      PAL.solid.specularMap = specT;
      for (const k in PAL) PAL[k].name = 'pal-' + k;
      const geoSlot = new Map();
      const inFar = (o) => { for (let p = o; p; p = p.parent) { if (p === FAR) return true; if (p === root) return false; } return false; };
      for (const [o, kind, i] of jobs) {
        let g = o.geometry;
        if (geoSlot.has(g) && geoSlot.get(g) !== i) { g = o.geometry = g.clone(); }
        geoSlot.set(g, i);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        const uv = g.attributes.uv, u = ((i % N) + 0.5) / N, v = (Math.floor(i / N) + 0.5) / N;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, u, v);
        uv.needsUpdate = true;
        o.material = PAL[kind];
        const far = inFar(o);
        if (kind === 'solid') { o.castShadow = !far; o.receiveShadow = !far; }
        else if (kind === 'decal') { o.castShadow = false; o.receiveShadow = !far; }
      }
      // see-through or flat things cast no shadow (keeps each of their materials to one batch)
      root.traverse((o) => { if (o.isMesh && (o.material === M.oil || o.material === M.grate)) o.castShadow = false; });
      // the backdrop neither casts nor catches the sun's shadow (it is far outside the shadow box)
      FAR.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      noCast.forEach((g) => g.traverse((o) => { if (o.isMesh) o.castShadow = false; }));
    });

    // ================= PRE-MERGE =================
    // Merge my static parts per material myself, before the core turns off shadows on tiny parts (that would split
    // all the iron into a casting and a non-casting mesh): one batch per material for the whole structure, one for
    // the backdrop, one per moving object. Not split per floor: every view shows two or three floors' worth of my
    // walls and framing anyway, so floor bands would save few triangles (the whole structure is ~130k) and cost a
    // draw call per material per floor. The results are tagged noBake so the shaft's bake leaves them as they are.
    sect('premerge', () => {
      root.updateMatrixWorld(true);
      const mtx = new THREE.Matrix4(), inv = new THREE.Matrix4();
      const merge = (anchor) => {
        const buckets = new Map();
        const walk = (o) => {
          for (const c of o.children) {
            if (!c.visible || c.userData.dyn || c.userData.noBake) continue;
            if (c.isMesh && c.constructor === THREE.Mesh && !Array.isArray(c.material) && c.geometry.attributes.position) {
              const key = c.material.uuid + '|' + c.castShadow + '|' + c.receiveShadow;
              (buckets.get(key) || buckets.set(key, []).get(key)).push(c);
            }
            walk(c);
          }
        };
        walk(anchor);
        inv.copy(anchor.matrixWorld).invert();
        for (const list of buckets.values()) {
          if (list.length < 2) continue;
          let n = 0;
          const geos = list.map((o) => {
            mtx.multiplyMatrices(inv, o.matrixWorld);
            const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
            if (!g.attributes.normal) g.computeVertexNormals();
            g.applyMatrix4(mtx);
            if (mtx.determinant() < 0) { // mirrored: flip winding
              for (const name of ['position', 'normal', 'uv']) { const a = g.attributes[name]; if (!a) continue; const k = a.itemSize, arr = a.array; for (let v = 0; v + 2 < a.count; v += 3) for (let q = 0; q < k; q++) { const i1 = (v + 1) * k + q, i2 = (v + 2) * k + q; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; } }
            }
            n += g.attributes.position.count; return g;
          });
          const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
          let off = 0;
          for (const g of geos) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; g.dispose(); }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          geo.computeBoundingSphere();
          const m = new THREE.Mesh(geo, list[0].material); m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
          m.name = 'world-merged'; m.userData.noBake = true; anchor.add(m);
          for (const o of list) o.parent.remove(o);
        }
      };
      merge(S);
      merge(FAR);
      { const lm = FAR.getObjectByName('city-landmarks'); if (lm) merge(lm); } // ?artpass=1 only
      const movers = [];
      root.traverse((o) => { if (o.userData.dyn && o.visible) movers.push(o); });
      movers.forEach((o) => merge(o));
    });

    // ================= ANIMATION =================
    let tCh = 0, tV = 0, tDrip = 0, tLeak = 0, tMh = 0, tFur = 0;
    if (fails.length) console.warn('[SHAFT] world: sections failed:', fails.join(', '));
    return { update(t, dt) {
      // window flicker, rim vents, furnace hatch, lamps
      const f = Math.sin(t * 17) > 0.6 || Math.sin(t * 3.1) > 0.9 ? 0.45 : 1; winFlick.color.setRGB(f, f, f);
      setGlow('vent', M.ventA, 0.9 + Math.sin(t * 4) * 0.1, 0.38 + Math.sin(t * 7) * 0.06, 0.1);
      const ff = 0.85 + Math.sin(t * 9) * 0.07 + Math.sin(t * 23) * 0.05;
      setGlow('hatch', M.hatchGlow, 1, 0.52 * ff, 0.16);
      const gf = 0.88 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.06; setGlow('gas', M.gasLamp, 1, 0.75 * gf, 0.44 * gf);
      lights.forEach((l) => { if (l.L && !l.L.isDummy) l.L.intensity = l.base * (0.9 + Math.sin(t * 9 + l.k) * 0.05 + Math.sin(t * 23 + l.k) * 0.04); });
      if (Math.sin(t * 3) > 0) setGlow('beacon', M.beacon, 1, 0.227, 0.125); else setGlow('beacon', M.beacon, 0.478, 0.102, 0.063);
      // wall gears, clocks, gauges
      wallGears.forEach((w) => (w.g.rotation.y += dt * 0.5 * w.s));
      clocks.forEach((c) => { c.hh.rotation.z = -(t + c.k) * 0.02; c.mh.rotation.z = -(t + c.k) * 0.24; });
      needles.forEach((n, i) => (n.rotation.z = 0.3 + Math.sin(t * (0.8 + i * 0.3) + i) * 0.5));
      // airships drift across the sky; the far one the other way, behind the stack
      if (ship) { ship.position.set(((t * 0.32 + 38) % 96) - 48, TL.y + 2.4 + Math.sin(t * 0.6) * 0.14, -33.4); prop.rotation.x += dt * 14; }
      if (ship2) { ship2.position.set(52 - ((t * 0.22 + 20) % 104), TL.y - 9 + Math.sin(t * 0.5 + 1) * 0.2, -44); }
      if (skip) { const k = (Math.sin(t * 0.4) * 0.5 + 0.5); skip.position.set(4.8 - k * 2.8, 0.6 + k * 7.4, 0.9); }
      // sheen shimmer, chains sway, papers flutter
      hangers.forEach((h) => (h.hg.rotation.z = Math.sin(t * 0.9 + h.k) * 0.06));
      const gust = Math.max(0, Math.sin(t * 0.37)) ** 6; papers.forEach((p) => { p.pv.rotation.x = -(0.05 + gust * 0.5) * (0.6 + Math.sin(t * 7 + p.k) * 0.4); p.pv.rotation.z = Math.sin(t * 3 + p.k) * 0.04 * (1 + gust * 3); });
      // silhouettes passing behind lit windows
      sils.forEach((q) => {
        if (q.wait > 0) { q.wait -= dt; q.s.visible = false; return; }
        q.o += q.sp * dt; if (q.o > 0.6) { q.o = -0.6; q.wait = 6 + Math.random() * 10; q.sp = (Math.random() < 0.5 ? 1 : -1) * Math.abs(q.sp); }
        const o = q.sp > 0 ? q.o : -q.o; q.s.position.x = q.x + o; q.s.visible = Math.abs(o) < 0.3;
      });
      // workers
      walkers.forEach((wk) => {
        const g = wk.w.g;
        if (wk.pause > 0) { wk.pause -= dt; wk.w.legs.forEach((l) => (l.rotation.x *= 0.8)); return; }
        wk.x += wk.dir * wk.sp * dt;
        if (wk.x > wk.a1) { wk.x = wk.a1; wk.dir = -1; wk.pause = 1.6 + Math.random() * 2; } if (wk.x < wk.a0) { wk.x = wk.a0; wk.dir = 1; wk.pause = 1.6 + Math.random() * 2; }
        g.position.set(wk.x, wk.y, wk.z); g.rotation.y = wk.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const ph = t * wk.sp * 7; wk.w.legs[0].rotation.x = Math.sin(ph) * 0.5; wk.w.legs[1].rotation.x = -Math.sin(ph) * 0.5;
        wk.w.body.position.y = 0.42 + Math.abs(Math.sin(ph)) * 0.025;
      });
      // crows
      crows.forEach((cw, i) => {
        cw.t -= dt;
        if (cw.state === 'perch') {
          cw.hd.rotation.y = Math.sin(t * 1.3 + i * 2) > 0.7 ? 0.6 : Math.sin(t * 0.7 + i) * 0.3; cw.hd.rotation.z = Math.max(0, Math.sin(t * 3 + i)) * 0.25;
          if (cw.t <= 0) { cw.state = 'fly'; cw.t = 5 + Math.random() * 4; cw.ang = 0; cw.wings.forEach((w) => (w.visible = true)); }
        } else if (cw.state === 'fly') {
          cw.ang += dt * 0.9; const tx = cw.home.x + Math.cos(cw.ang) * cw.rad, tz = cw.home.z - 1.5 + Math.sin(cw.ang) * cw.rad * 0.6, ty = cw.cy + Math.sin(cw.ang * 2) * 0.4;
          cw.c.position.x += (tx - cw.c.position.x) * Math.min(1, dt * 2); cw.c.position.y += (ty - cw.c.position.y) * Math.min(1, dt * 2); cw.c.position.z += (tz - cw.c.position.z) * Math.min(1, dt * 2);
          cw.c.rotation.y = -cw.ang; const fl = Math.sin(t * 22 + i) * 0.9; cw.wings[0].rotation.x = fl; cw.wings[1].rotation.x = -fl;
          if (cw.t <= 0) cw.state = 'land';
        } else {
          const d = cw.home.clone().sub(cw.c.position); const L = d.length();
          cw.c.position.addScaledVector(d, Math.min(1, dt * 1.8)); const fl = Math.sin(t * 26 + i) * 0.9; cw.wings[0].rotation.x = fl; cw.wings[1].rotation.x = -fl;
          if (L < 0.05) { cw.c.position.copy(cw.home); cw.state = 'perch'; cw.t = 10 + Math.random() * 25; cw.wings.forEach((w) => (w.visible = false)); }
        }
      });
      // smoke from chimneys + furnace, steam from vents/manholes/leaks, oil drips off the rims
      tCh -= dt;
      if (tCh <= 0) { tCh = 0.3; chimTops.forEach(([x, y, z, r, far]) => { if (far && Math.random() < 0.8) return; K.spawn(root, x + K.R() * r, y, z + K.R() * r, 0.35 + K.R() * 0.2, 0.7 + Math.random() * 0.3, K.R() * 0.2, Math.random() < 0.5 ? 0x3a302a : 0x4e443a, far ? 3 : 4.4, far ? 0.26 : 0.55, -0.08); }); }
      tFur -= dt;
      if (furnaceTop && tFur <= 0) { tFur = 0.2; K.spawn(root, furnaceTop[0] + K.R() * 0.6, furnaceTop[1], furnaceTop[2] + K.R() * 0.6, 0.3 + K.R() * 0.2, 0.9, K.R() * 0.2, Math.random() < 0.5 ? 0x2a221e : 0x3a302a, 4, 0.5, -0.08); if (Math.random() < 0.3) K.spawn(root, furnaceTop[0] + K.R() * 0.4, furnaceTop[1] - 0.2, furnaceTop[2] + 0.7, K.R() * 0.6, 1.4, 0.4, 0xffa030, 0.8, 0.06, 2, true); }
      tV -= dt;
      if (tV <= 0 && steamVents.length) { tV = 0.35; const sv = steamVents[Math.floor(Math.random() * steamVents.length)]; for (let i = 0; i < 3; i++) puff(sv[0], sv[1] + 0.1, sv[2], 0xb0a490, 0.18, 0.9, 0.4, 1.6); }
      tMh -= dt;
      if (tMh <= 0 && manholes.length) { tMh = 0.3; const [x, y, z] = manholes[Math.floor(Math.random() * manholes.length)]; const a = Math.random() * Math.PI * 2; K.spawn(root, x + Math.cos(a) * 0.42, y + 0.08, z + Math.sin(a) * 0.42, Math.cos(a) * 0.15 + 0.1, 0.55 + Math.random() * 0.3, Math.sin(a) * 0.15, 0xb8ae9c, 2.0, 0.1, -0.1); }
      tLeak -= dt;
      if (tLeak <= 0 && leaks.length) { tLeak = 0.22; const l = leaks[Math.floor(Math.random() * leaks.length)]; K.spawn(root, l[0], l[1], l[2] + 0.2, K.R() * 0.5, 0.6, 0.5, 0xc8bca8, 1.1, 0.1, -0.15); }
      tDrip -= dt;
      if (tDrip <= 0 && spouts.length) { tDrip = 0.5; const s = spouts[Math.floor(Math.random() * spouts.length)]; K.spawn(root, s[0], s[1], s[2], 0, -0.2, 0, 0x0a0806, 1.6, 0.06, 5); }
    } };
  });
}
