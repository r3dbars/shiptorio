// =====================================================================
// THE SHAFT · LAUNCH floor machines (LAUNCH agent): 'launch' (the pad), 'orbit' (orbit watch), 'measure'.
//
// LAUNCH PAD: the Black Iron mockup's pad (docs/art/black-iron/modules/launch.js), ported piece for piece onto
// the roof of the shaft. Every green 'pass' capsule: the jib crane plucks it off the intake tray, swings it
// (cable swaying) to the rocket's cargo hatch and feeds it in; the hatch seals with spinning bolts; tesla coils
// arc into the hull (fed from the aether transformer); the clock tower + 4-tube nixie board counts T-03..T-01
// (decision point: holds at T-0 with 'HOLd'); ignition: umbilicals pop, clamps fly back with sparks, smoke
// billows out of both trench ends, the rocket hangs and grinds upward for ~1.5 s, then climbs straight up out
// of the top of the factory and on, high into the sky, leaving a bright trail + a lingering smoke column;
// M.consume() fires on the way up and a signal flare bursts over the pad; a 3-tube shipped counter ticks on
// the clock tower base. Then the scorched pedestal drops into the silo and the next rocket rises out of it.
// Real time: a loaded rocket keeps its coils charging until M.ready(item) (the real deploy) says go.
// IDLE = lights down. WORKING = lit + busy. BLOCKED = red flood strobes, venting, 'HOLd', red clock.
// A stall never freezes a lit rocket: ignition/flight finish, the pad holds before the reset.
//
// ORBIT WATCH: for 24 h after a launch it watches the real world. The brass radar dish on its lattice mast
// tracks the last rocket up and across the sky (pinging), the telescope follows, a drum recorder inks a quiet
// trace, the 24 h dial + rim lamps count the watch down and the little orrery carries one bead per launch in
// orbit. A watch that runs out clean flashes green ('CLr'). ALERT (a regression came back) = BLOCKED: red
// flood, the pen scribbles red spikes, the dish hunts, 'Err'.
//
// MEASURE: the growth loop's experiment gauge. A brass gauge board (HURT · FLAT · LIFT dial, BEFORE / AFTER
// tubes, lift % and day nixies) over a balance scale that tips toward the side that converts more.
//
// What they show, first that answers: an optional driver hook, else the game driver's FactoryState
// (driver.state: items[].orbit, stations[] of kind 'orbit', experiments[]), else (auto driver) a play run off
// 'ship' events like the mockup's dice, with a comeback now and then.
//   IRON.driver.orbit(st)   -> { watching: n, progress: 0..1 (oldest watch), hoursLeft?, alert?: '#12 came back' } | null
//   IRON.driver.measure(st) -> { state: 'measuring'|'won'|'flat'|'lost', lift: 0.16, day: 3, days: 7 } | null
// =====================================================================

export default function install(IRON) {
  'use strict';
  const C45 = Math.SQRT1_2;
  // the pad tells the orbit watch which rocket is in the air (its dish tracks it)
  const shared = { rocket: null, pad: null };

  // =====================================================================
  // SHARED ART: one palette + textures for the whole floor (made once, with the first kit we're handed)
  // =====================================================================
  let ART = null;
  function stoneTex(K) {
    return K.canvasTex(64, 64, (g) => {
      let s = 13; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#3a3027'; g.fillRect(0, 0, 64, 64);
      const tones = ['#7e6e5a', '#74644f', '#887660', '#6c5c48'];
      for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
        g.fillStyle = tones[Math.floor(r() * 4)]; g.fillRect(x + 1, y + 1, 22, 14);
        g.fillStyle = 'rgba(255,230,190,0.10)'; g.fillRect(x + 2, y + 1, 20, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 13, 22, 2);
      }
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(10,6,4,0.35)'; g.fillRect(r() * 60, r() * 60, 4 + r() * 8, 2 + r() * 4); }
    }, [4, 0.6]);
  }
  function deckTex(K, rep) {
    return K.canvasTex(64, 64, (g) => {
      let s = 5; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#26201b'; g.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
        const v = 70 + Math.floor(r() * 18); g.fillStyle = `rgb(${v},${v - 8},${v - 16})`; g.fillRect(x + 1, y + 1, 14, 14);
        g.fillStyle = 'rgba(255,230,200,0.10)'; g.fillRect(x + 1, y + 1, 14, 1);
        g.fillStyle = '#a08458'; g.fillRect(x + 2, y + 2, 1, 1); g.fillRect(x + 13, y + 2, 1, 1); g.fillRect(x + 2, y + 13, 1, 1); g.fillRect(x + 13, y + 13, 1, 1);
      }
      for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(8,5,3,0.4)'; g.fillRect(r() * 60, r() * 60, 3 + r() * 9, 2 + r() * 5); }
    }, rep || [3, 3]);
  }
  // 7-segment nixie glyphs (the mockup's set, plus a few letters for the watch and the gauge)
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd', '-': 'g', ' ': '', H: 'bcefg', O: 'abcdef', L: 'def', d: 'bcdeg', '?': 'abge', t: 'defg', C: 'adef', r: 'eg', G: 'acdef', A: 'abcefg', P: 'abefg', E: 'adefg', h: 'cefg', n: 'ceg', o: 'cdeg', U: 'bcdef', y: 'bcdfg', F: 'aefg', b: 'cdefg' };
  // 3x5 pixel font for stamped brass plates
  const FONT = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000', '-': '000000111000000', '%': '101001010100101', '/': '001001010100100', '.': '000000000000010', ' ': '000000000000000' };
  const hex6 = (c) => '#' + c.toString(16).padStart(6, '0');
  function art(K) {
    if (ART) return ART;
    const T = K.THREE;
    const nearest = (cv) => { const t = new T.CanvasTexture(cv); t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return t; };
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    // THE ATLAS. One texel per flat colour (its specular strength in a twin map) plus the stamped plates, so
    // almost every opaque part of all three machines wears ONE material, and the shaft's static merge folds a
    // machine (and each moving part) into a mesh or two instead of one mesh per colour.
    const AW = 128, AH = 128, ROWS = 4;           // rows 0..3: colour texels; below: plates
    const acv = canvas(AW, AH), scv = canvas(AW, AH), ac = acv.getContext('2d'), sc = scv.getContext('2d');
    ac.fillStyle = '#7a6a58'; ac.fillRect(0, 0, AW, AH); sc.fillStyle = '#000'; sc.fillRect(0, 0, AW, AH);
    const atex = nearest(acv), stex = nearest(scv);
    const SPEC = 0xa08048;                         // the brightest specular used (brassL); entries scale it
    const atlas = K.mat(0xffffff, { map: atex, shine: 40, spec: SPEC });
    atlas.specularMap = stex;
    const cells = new Map(); let nCell = 0, px = 0, py = ROWS + 1, rowH = 0;
    const gray = (k) => { const v = Math.round(Math.max(0, Math.min(1, k)) * 255); return `rgb(${v},${v},${v})`; };
    function specOf(m) { if (!m.specular) return 0; const s = m.specular; return Math.min(1, Math.max(s.r, s.g, s.b) / (0xa0 / 255)); }
    function cell(m) {
      const hex = m.color.getHex(), sp = Math.round(specOf(m) * 20) / 20, key = hex + '|' + sp;
      let c = cells.get(key); if (c) return c;
      const i = nCell++, x = i % AW, y = Math.floor(i / AW);
      if (y >= ROWS) console.warn('[launch] atlas colour rows full');
      ac.fillStyle = hex6(hex); ac.fillRect(x, y, 1, 1); sc.fillStyle = gray(sp); sc.fillRect(x, y, 1, 1);
      atex.needsUpdate = stex.needsUpdate = true;
      c = [(x + 0.5) / AW, 1 - (y + 0.5) / AH]; cells.set(key, c); return c;
    }
    const rects = new Map();
    function rect(key, w, h, draw, sp) {
      let r = rects.get(key); if (r) return r;
      if (px + w > AW) { px = 0; py += rowH + 1; rowH = 0; }
      if (py + h > AH) console.warn('[launch] atlas full');
      const x = px, y = py; px += w + 1; rowH = Math.max(rowH, h);
      ac.save(); ac.translate(x, y); draw(ac, w, h); ac.restore(); sc.fillStyle = gray(sp); sc.fillRect(x, y, w, h);
      atex.needsUpdate = stex.needsUpdate = true;
      r = [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH]; rects.set(key, r); return r;
    }
    // materials that may be swapped for the atlas (plain, opaque, never touched at runtime)
    const palSet = new Set();
    const pm = (c, o) => { const m = K.mat(c, o); palSet.add(m); return m; };

    // palette (Black Iron, lifted ~30%)
    const C = { soot: 0x1e1915, iron: 0x3c342d, ironM: 0x302924, ironL: 0x5e544a, brass: 0xb08838, brassD: 0x6e5022, brassL: 0xdcb060, copper: 0xa65a32, copperD: 0x6e3820, oxide: 0x7a3020, oxideD: 0x52201a, hazard: 0xe0a422, cream: 0xe6d6a8 };
    const MT = {
      soot: pm(C.soot), iron: pm(C.iron, { shine: 24, spec: 0x2a2a30 }), ironM: pm(C.ironM, { shine: 16, spec: 0x222228 }), ironL: pm(C.ironL, { shine: 30, spec: 0x3a3a40 }),
      brass: pm(C.brass, { shine: 40, spec: 0x806030 }), brassD: pm(C.brassD, { shine: 22, spec: 0x3a2a10 }), brassL: pm(C.brassL, { shine: 55, spec: 0xa08048 }),
      copper: pm(C.copper, { shine: 36, spec: 0x704028 }), copperD: pm(C.copperD, { shine: 18, spec: 0x3a1a0a }),
      oxide: pm(C.oxide, { shine: 14, spec: 0x2a1410 }), oxideD: pm(C.oxideD), hazard: pm(C.hazard), cream: pm(C.cream),
      rubber: pm(0x17130f), insul: pm(0x3a2418, { shine: 40, spec: 0x553322 }), rust: pm(0x7a3a1a),
      grime: K.mat(0x080605, { op: 0.45, depthWrite: false }), glass: K.mat(0xbfe8dc, { op: 0.25, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      dark: pm(0x0c0a08), scorch: K.mat(0x14100c, { op: 0.6, depthWrite: false }),
      brick: pm(0x4a3424), red: pm(0xc0301a), ink: pm(0x140c06), green: pm(0x46c070), oil: pm(0x1c1a20, { shine: 90, spec: 0x8a7aa8 }),
      brassBowl: K.mat(C.brass, { shine: 50, spec: 0x806030, double: true }), paperBack: pm(0x2a221a), handRed: pm(0x8a1a10), coilCore: pm(0x2a1a10), verdigris: pm(0x3f8a72),
    };

    // nixie glyph atlas: every glyph in one texture; a row of tubes is one mesh whose UVs pick the glyphs
    const GW = 10, GH = 16, GC = 8, gkeys = Object.keys(SEG), GR = Math.ceil(gkeys.length / GC);
    const gcv = canvas(GW * GC, GH * GR), gc = gcv.getContext('2d');
    const segR = { a: [2, 1, 6, 2], b: [7, 2, 2, 6], c: [7, 8, 2, 6], d: [2, 13, 6, 2], e: [1, 8, 2, 6], f: [1, 2, 2, 6], g: [2, 7, 6, 2] };
    const guv = {};
    gkeys.forEach((ch, i) => {
      const cx = (i % GC) * GW, cy = Math.floor(i / GC) * GH;
      gc.fillStyle = 'rgba(255,120,30,0.16)'; for (const k in segR) { const s = segR[k]; gc.fillRect(cx + s[0], cy + s[1], s[2], s[3]); }
      gc.fillStyle = '#ffb050'; for (const k of SEG[ch]) { const s = segR[k]; gc.fillRect(cx + s[0], cy + s[1], s[2], s[3]); }
      const W = GW * GC, H = GH * GR;
      guv[ch] = [cx / W, 1 - (cy + GH) / H, (cx + GW) / W, 1 - cy / H];
    });
    const gtex = nearest(gcv);

    ART = { C, MT, atlas, cell, rect, palSet, pm, gtex, guv,
      stone: K.mat(0xffffff, { map: stoneTex(K), double: true }), deck: K.mat(0xffffff, { map: deckTex(K), double: true }), deckTop: K.mat(0xffffff, { map: deckTex(K) }), deckPlate: K.mat(0xffffff, { map: deckTex(K, [4, 4]) }) };
    return ART;
  }

  // helpers (the mockup's, shared by all three machines)
  function tools(K) {
    const T = K.THREE;
    const A = art(K), { MT } = A;
    const band = (p, r, y, m, h) => K.cyl(r, r, h || 0.1, m || MT.brass, 18, 0, y, 0, p);
    function rivetRing(p, r, y, n, m) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, m || MT.brassL, Math.cos(a) * r, y, Math.sin(a) * r, p); } }
    function gear(p, r, thick, teeth, m, x, y, z) {
      const gg = K.group(p, x, y, z);
      K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, gg);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
      K.cyl(r * 0.3, r * 0.3, thick * 1.6, MT.ironM, 8, 0, 0, 0, gg);
      return gg;
    }
    // a round gauge; returns the needle pivot (mark it K.dyn if it moves)
    function gauge(p, x, y, z, r, ry) {
      const gg = K.group(p, x, y, z); gg.rotation.y = ry || 0;
      const rim = K.cyl(r * 1.15, r * 1.15, 0.08, MT.brass, 14, 0, 0, 0, gg); rim.rotation.x = Math.PI / 2;
      const face = K.cyl(r, r, 0.1, MT.cream, 14, 0, 0, 0.01, gg); face.rotation.x = Math.PI / 2;
      const red = K.box(r * 0.5, r * 0.18, 0.02, MT.red, r * 0.45, r * 0.45, 0.065, gg); red.rotation.z = -0.8;
      const piv = K.group(gg, 0, 0, 0.07);
      K.box(0.035, r * 0.85, 0.02, MT.ink, 0, r * 0.38, 0, piv);
      return piv;
    }
    function hazardStripe(p, len, x, y, z, n, ry, h) {
      const gg = K.group(p, x, y, z); gg.rotation.y = ry || 0; const w = len / n;
      for (let i = 0; i < n; i++) K.box(w * 0.96, h || 0.06, 0.05, i % 2 ? MT.soot : MT.hazard, -len / 2 + w * (i + 0.5), 0, 0, gg);
      return gg;
    }
    // a row of nixie tubes' glyphs: ONE additive mesh (facing +z of p) whose UVs pick each tube's glyph
    function nixieRow(p, xs, y, z, w, h) {
      const n = xs.length, pos = new Float32Array(n * 12), idx = [];
      xs.forEach((x, i) => { pos.set([x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z, x - w / 2, y + h / 2, z], i * 12); const o = i * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3); });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(n * 12).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
      geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 8), 2));
      geo.setIndex(idx);
      const m = new T.MeshBasicMaterial({ map: A.gtex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      const mesh = new T.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = false; p.add(mesh); K.dyn(mesh);
      const row = { n, m, uv: geo.attributes.uv, cur: [] };
      setRow(row, '-'.repeat(n), 0.2);
      return row;
    }
    function setRow(row, str, bright, tint) {
      let dirty = false;
      for (let i = 0; i < row.n; i++) {
        const ch = str[i] === undefined ? ' ' : str[i];
        if (row.cur[i] === ch) continue;
        row.cur[i] = ch; dirty = true;
        const r = A.guv[ch] || A.guv[' '];
        row.uv.array.set([r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]], i * 8);
      }
      if (dirty) row.uv.needsUpdate = true;
      row.m.opacity = bright; row.m.color.setHex(tint || 0xffffff);
    }
    // a stamped brass plate with pixel text, facing +z of p (its texture lives in the atlas)
    function plate(p, text, hgt, x, y, z, o) {
      o = o || {};
      const w = text.length * 4 + 3, h = 9;
      const r = A.rect(text + '|' + (o.bg || '') + (o.fg || ''), w, h, (c) => {
        c.fillStyle = o.bg || '#7a5822'; c.fillRect(0, 0, w, h);
        c.fillStyle = o.hi || '#e4b85e'; c.fillRect(0, 0, w, 1);
        c.fillStyle = o.lo || '#4a3416'; c.fillRect(0, h - 1, w, 1);
        c.fillStyle = o.fg || '#1e1408';
        text.split('').forEach((ch, i) => { const b = FONT[ch] || FONT[' ']; for (let k = 0; k < 15; k++) if (b[k] === '1') c.fillRect(2 + i * 4 + (k % 3), 2 + Math.floor(k / 3), 1, 1); });
      }, 0.6);
      const mesh = K.box(w / h * hgt, hgt, 0.03, A.atlas, x, y, z, p);
      const uv = mesh.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
      return mesh;
    }
    // a strut from a to b (local points of p)
    const ZA = new T.Vector3(0, 0, 1);
    function strut(p, a, b, th, m) {
      const va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]);
      const d = vb.clone().sub(va), L = d.length();
      const s = K.box(th, th, L, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, p);
      s.quaternion.setFromUnitVectors(ZA, d.normalize());
      return s;
    }
    // little lamps that change colour, drawn as ONE instanced mesh (unlit); set(i, hex)
    const tc = new T.Color();
    function lampSet(p, pts, r, off) {
      const im = new T.InstancedMesh(new T.SphereGeometry(r, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }), pts.length);
      const mx = new T.Matrix4();
      pts.forEach((q, i) => { im.setMatrixAt(i, mx.makeTranslation(q[0], q[1], q[2])); im.setColorAt(i, tc.setHex(off)); });
      im.castShadow = im.receiveShadow = false; im.computeBoundingSphere(); p.add(im); K.dyn(im);
      const cur = pts.map(() => off);
      return { im, set(i, hex) { if (cur[i] === hex) return; cur[i] = hex; im.setColorAt(i, tc.setHex(hex)); im.instanceColor.needsUpdate = true; } };
    }
    // glowing segments (arcs, sparks on a wire) as ONE instanced additive mesh: seg(i, a, b, hex, thick) / hide(i)
    function segSet(p, n, th, op) {
      const im = new T.InstancedMesh(new T.BoxGeometry(th, th, 1), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op === undefined ? 1 : op, blending: T.AdditiveBlending, depthWrite: false, fog: false }), n);
      im.castShadow = im.receiveShadow = false; im.frustumCulled = false; p.add(im); K.dyn(im);
      const mx = new T.Matrix4(), q = new T.Quaternion(), d = new T.Vector3(), mid = new T.Vector3(), sc = new T.Vector3(), Z0 = new T.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < n; i++) { im.setMatrixAt(i, Z0); im.setColorAt(i, tc.setHex(0xffffff)); }
      return { im,
        seg(i, a, b, hex, thick) { d.subVectors(b, a); const L = Math.max(0.01, d.length()); q.setFromUnitVectors(ZA, d.divideScalar(L)); mid.addVectors(a, b).multiplyScalar(0.5); mx.compose(mid, q, sc.set(thick || 1, thick || 1, L)); im.setMatrixAt(i, mx); im.setColorAt(i, tc.setHex(hex)); },
        hide(i) { im.setMatrixAt(i, Z0); },
        commit() { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } };
    }
    // glowing dots (charge beads on a cable) as ONE instanced additive mesh: put(i, v) / hide(i)
    function dotSet(p, n, r, hex, op) {
      const im = new T.InstancedMesh(new T.SphereGeometry(r, 6, 4), new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, fog: false }), n);
      im.castShadow = im.receiveShadow = false; im.frustumCulled = false; p.add(im); K.dyn(im);
      const mx = new T.Matrix4(), Z0 = new T.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < n; i++) im.setMatrixAt(i, Z0);
      return { im, put(i, v) { im.setMatrixAt(i, mx.makeTranslation(v.x, v.y, v.z)); }, hide(i) { im.setMatrixAt(i, Z0); }, commit() { im.instanceMatrix.needsUpdate = true; } };
    }
    // swap every plain opaque part under `root` for the atlas (one material: merges into a mesh or two)
    const shared = new Set();
    function palettize(root) {
      root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !A.palSet.has(o.material)) return;
        const c = A.cell(o.material);
        let geo = o.geometry; if (shared.has(geo)) geo = o.geometry = geo.clone(); shared.add(geo);
        const n = geo.attributes.position.count, uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { uv[i * 2] = c[0]; uv[i * 2 + 1] = c[1]; }
        geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
        o.material = A.atlas;
      });
    }
    // then fold each anchor's atlas parts (the machine itself, and every K.dyn mover) into ONE mesh, before the
    // shaft's tiny-part shadow cull can split them into a shadow and a no-shadow mesh
    function fold(root) {
      root.updateMatrixWorld(true);
      const lists = new Map();
      const walk = (o, anchor) => {
        for (const c of o.children) {
          if (c.userData.dyn || c.userData.noBake) { walk(c, c); continue; }
          if (c.isMesh && c.constructor === T.Mesh && c.material === A.atlas && c.visible && !c.children.length) { if (!lists.has(anchor)) lists.set(anchor, []); lists.get(anchor).push(c); }
          walk(c, anchor);
        }
      };
      walk(root, root);
      const inv = new T.Matrix4(), rel = new T.Matrix4();
      lists.forEach((list, anchor) => {
        if (list.length < 2) return;
        inv.copy(anchor.matrixWorld).invert();
        let n = 0;
        const geos = list.map((m) => {
          rel.multiplyMatrices(inv, m.matrixWorld);
          const gg = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); gg.applyMatrix4(rel);
          if (rel.determinant() < 0) { const a = gg.attributes.position.array, b = gg.attributes.normal.array, u = gg.attributes.uv.array; for (let v = 0; v + 2 < gg.attributes.position.count; v += 3) { for (let k = 0; k < 3; k++) { const i1 = (v + 1) * 3 + k, i2 = (v + 2) * 3 + k; [a[i1], a[i2]] = [a[i2], a[i1]]; [b[i1], b[i2]] = [b[i2], b[i1]]; } for (let k = 0; k < 2; k++) { const i1 = (v + 1) * 2 + k, i2 = (v + 2) * 2 + k; [u[i1], u[i2]] = [u[i2], u[i1]]; } } }
          n += gg.attributes.position.count; return gg;
        });
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let off = 0;
        geos.forEach((gg) => { pos.set(gg.attributes.position.array, off * 3); nor.set(gg.attributes.normal.array, off * 3); uv.set(gg.attributes.uv.array, off * 2); off += gg.attributes.position.count; gg.dispose(); });
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
        const out = new T.Mesh(geo, A.atlas); out.castShadow = list.some((m) => m.castShadow); out.receiveShadow = true; out.name = 'atlas';
        anchor.add(out);
        list.forEach((m) => m.parent.remove(m));
      });
    }
    return { band, rivetRing, gear, gauge, hazardStripe, nixieRow, setRow, plate, strut, lampSet, segSet, dotSet, palettize, fold };
  }

  // =====================================================================
  // LAUNCH PAD
  // =====================================================================
  IRON.machine('launch', function (K, M) {
    const T = K.THREE;
    const dyn = K.dyn;
    const { C, MT, stone, deck, deckTop, pm } = art(K);
    const { band, rivetRing, gear, gauge, hazardStripe, nixieRow, setRow, lampSet, segSet, dotSet, palettize, fold } = tools(K);
    const ease = (k) => k * k * (3 - 2 * k);
    // clustered small puffs (reads as smoke, not honeycomb tiles)
    function puff(x, y, z, vx, vy, vz, col, life, size, n, spread, grav) {
      for (let i = 0; i < (n || 3); i++) K.spawn(g, x + K.R() * (spread || 0.25), y + K.R() * (spread || 0.25) * 0.6, z + K.R() * (spread || 0.25), vx + K.R() * 0.35, vy + K.R() * 0.3, vz + K.R() * 0.35, col, life * (0.8 + Math.random() * 0.4), size * (0.7 + Math.random() * 0.5), grav === undefined ? -0.1 : grav);
    }

    const g = K.group();
    const S = K.group(g); // static: baked at the end
    shared.pad = g;

    // =====================================================================
    // LAYOUT (local): rocket on the silo at the origin. Trench runs screen-horizontal (local x+z = 0).
    // =====================================================================
    const HOLE = 1.18;
    const PIVOT = [-0.6, 2.1];
    const TRAY = [-0.6, 2.9];        // = launch.in port
    const COILS = [[-1.9, 0.6], [1.9, -0.6]];
    const GANTRY = [-1.5, -1.5];
    const CLOCK = [1.25, -2.35];
    const TANK = [-0.15, -2.2];
    const XFMR = [-3.12, 0.35];
    const BASE_Y = 0.8;
    const pvLen = Math.hypot(PIVOT[0], PIVOT[1]);
    const HD = [PIVOT[0] / pvLen, PIVOT[1] / pvLen];
    const THETA = Math.atan2(HD[0], HD[1]);
    const HATCH_Y = 1.75, CARGO_OUT = 0.95, CARGO_IN = 0.16;

    // ---------- PAD ----------
    K.lathe([[HOLE, -1.3], [HOLE, 0.36], [2.42, 0.36], [2.56, 0.3], [2.72, 0.02], [2.72, -0.05]], stone, 8, 0, 0, 0, S).rotation.y = Math.PI / 8;
    K.lathe([[HOLE + 0.02, 0.36], [HOLE + 0.02, 0.47], [2.28, 0.47], [2.32, 0.36]], deck, 8, 0, 0, 0, S).rotation.y = Math.PI / 8;
    // the silo below the deck (the pedestal drops 6.2 into it): a stone sleeve down through the floor's mass
    K.lathe([[HOLE + 0.03, -7.8], [HOLE + 0.03, -1.25]], stone, 16, 0, 0, 0, S);
    K.cyl(HOLE + 0.03, HOLE + 0.03, 0.1, MT.ironM, 16, 0, -7.8, 0, S);
    K.torus(HOLE + 0.06, 0.07, MT.brassD, 4, 24, 0, 0.48, 0, S).rotation.x = Math.PI / 2;
    K.torus(2.3, 0.06, MT.ironL, 4, 8, 0, 0.47, 0, S).rotation.set(Math.PI / 2, 0, Math.PI / 8);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; K.box(0.28, 0.05, 0.12, i % 2 ? MT.soot : MT.hazard, Math.cos(a) * 2.12, 0.49, Math.sin(a) * 2.12, S).rotation.y = -a; }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.06, 0.06, 0.06, MT.brassL, Math.cos(a) * 2.38, 0.5, Math.sin(a) * 2.38, S); }
    const voidDisk = dyn(K.cyl(HOLE - 0.02, HOLE - 0.02, 0.02, K.glow(0x050302), 24, 0, 0.13, 0, g)); voidDisk.visible = false;
    const voidGlow = dyn(K.torus(HOLE - 0.1, 0.05, K.glow(0xff6a20, 0.6, true), 4, 24, 0, 0.16, 0, g)); voidGlow.rotation.x = Math.PI / 2; voidGlow.visible = false;
    // FLAME TRENCH along local (1,0,-1)
    const TR = K.group(S); TR.rotation.y = Math.PI / 4;
    const TRd = K.group(g); TRd.rotation.y = Math.PI / 4;            // residual heat glow (material only)
    const heatM = K.glow(0xff5a10, 0, true);
    for (const sgn of [-1, 1]) {
      const cx = sgn * (HOLE + 2.6) / 2, len = 2.62 - HOLE + 0.2;
      K.box(len, 0.06, 0.82, MT.dark, cx, 0.46, 0, TR);
      for (let i = 0; i < 7; i++) K.box(0.06, 0.05, 0.8, MT.ironL, sgn * (HOLE + 0.15 + i * 0.2), 0.5, 0, TR);
      K.box(len, 0.03, 0.06, MT.ironL, cx, 0.5, 0.0, TR);
      for (const zz of [-0.47, 0.47]) { K.box(len, 0.16, 0.1, MT.rust, cx, 0.53, zz, TR); K.box(len, 0.04, 0.12, MT.brassD, cx, 0.62, zz, TR); }
      const lip = K.box(0.12, 0.42, 0.9, MT.oxideD, sgn * 2.62, 0.6, 0, TR); lip.rotation.z = sgn * 0.5;
      const sc = K.sph(1, MT.scorch, sgn * 3.1, 0.12, 0, TR, 12, 4); sc.scale.set(0.9, 0.02, 0.7); sc.castShadow = false;
      const hb = K.box(len - 0.1, 0.02, 0.7, heatM, cx, 0.485, 0, TRd); hb.castShadow = false;
    }
    for (const [x, z, sx, sz] of [[1.75, 0.35, 0.32, 0.2], [-1.45, -0.95, 0.3, 0.22], [0.75, -1.55, 0.28, 0.18]]) { const p = K.sph(1, MT.oil, x, 0.49, z, S, 12, 4); p.scale.set(sx, 0.012, sz); p.castShadow = false; }
    for (let i = 0; i < 10; i++) { const a = K.rnd() * 6.28, rr = 1.3 + K.rnd() * 0.8; const d = K.box(0.3 + K.rnd() * 0.5, 0.01, 0.2 + K.rnd() * 0.3, MT.grime, Math.cos(a) * rr, 0.485, Math.sin(a) * rr, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
    // rim lamps (8, one instanced mesh)
    const rimPts = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 2.5, z = Math.sin(a) * 2.5;
      K.cyl(0.09, 0.11, 0.1, MT.iron, 8, x, 0.42, z, S);
      rimPts.push([x, 0.53, z]);
    }
    const rimLamps = lampSet(g, rimPts, 0.09, 0x2a1a08);
    // BLOCKED red flood wash over the pad (pulses), readable at floor zoom
    const washM = K.glow(0xff2a10, 0, true);
    const wash = dyn(K.cyl(2.45, 2.45, 0.02, washM, 8, 0, 0.52, 0, g)); wash.rotation.y = Math.PI / 8; wash.castShadow = false; wash.visible = false;
    const washRingM = K.glow(0xff3a14, 0, true);
    const washRing = dyn(K.torus(2.55, 0.09, washRingM, 4, 8, 0, 0.56, 0, g)); washRing.rotation.set(Math.PI / 2, 0, Math.PI / 8); washRing.visible = false;

    // ---------- PEDESTAL / SILO ELEVATOR ----------
    const lifter = dyn(K.group(g, 0, 0, 0));
    const LS = K.group(lifter);
    K.cyl(1.1, 1.1, 0.33, MT.iron, 16, 0, BASE_Y - 0.165, 0, LS);
    K.cyl(1.0, 1.05, 1.9, MT.ironM, 16, 0, BASE_Y - 1.25, 0, LS);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.26, 0.08, 0.06, i % 2 ? MT.soot : MT.hazard, Math.cos(a) * 1.08, BASE_Y - 0.06, Math.sin(a) * 1.08, LS).rotation.y = -a + Math.PI / 2; }
    K.cyl(0.95, 0.95, 0.04, deckTop, 16, 0, BASE_Y + 0.005, 0, LS);
    for (let i = 0; i < 6; i++) { const b = K.box(1.8, 0.03, 0.08, MT.ironL, 0, BASE_Y + 0.03, 0, LS); b.rotation.y = i * Math.PI / 6; }
    rivetRing(LS, 1.02, BASE_Y - 0.25, 18);
    K.cyl(0.75, 0.75, 0.01, K.mat(0x14100c, { op: 0.3, depthWrite: false }), 16, 0, BASE_Y + 0.04, 0, LS).castShadow = false;
    K.bake(LS);

    // ---------- ROCKETS (two, they alternate) ----------
    const bodyLo = pm(0x8c6c34, { shine: 34, spec: 0x6a5028 }), bodyHi = pm(0x96502c, { shine: 30, spec: 0x603820 });
    const hullGrime = K.mat(0x1a1410, { op: 0.55, depthWrite: false, double: true });
    function makeRocket() {
      const rk = dyn(K.group(g, 0, BASE_Y, 0)); rk.rotation.y = THETA;
      const st = K.group(rk);
      const prof = [[0.0, 0], [0.44, 0.02], [0.54, 0.3], [0.58, 1.0], [0.58, 2.25], [0.52, 2.85], [0.4, 3.35], [0.22, 3.8], [0.05, 4.05]];
      K.lathe(prof.slice(0, 6), bodyLo, 18, 0, 0, 0, st);
      K.lathe(prof.slice(5), bodyHi, 18, 0, 0, 0, st);
      K.lathe([[0.46, 0.0], [0.56, 0.3], [0.595, 0.75]], hullGrime, 18, 0, 0.0, 0, st);
      K.cyl(0.03, 0.05, 0.6, MT.brassL, 6, 0, 4.3, 0, st); K.sph(0.07, MT.brassL, 0, 4.62, 0, st, 6, 4);
      for (const y of [0.35, 1.0, 1.55, 2.2]) { K.torus(0.585, 0.035, MT.brassD, 4, 22, 0, y, 0, st).rotation.x = Math.PI / 2; rivetRing(st, 0.6, y + 0.08, 16); }
      K.torus(0.53, 0.04, MT.brassD, 4, 22, 0, 2.85, 0, st).rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; const s = K.box(0.05, 0.5 + (i % 3) * 0.25, 0.01, MT.grime, Math.sin(a) * 0.585, 0.4 + (i % 3) * 0.2, Math.cos(a) * 0.585, st); s.rotation.y = a; s.castShadow = false; }
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2, fin = K.group(st); fin.rotation.y = a;
        const f = K.box(0.07, 1.05, 0.68, MT.copperD, 0, 0.55, 0.82, fin); f.rotation.x = 0.28;
        K.box(0.09, 0.08, 0.62, MT.brass, 0, 0.02, 0.88, fin);
        K.box(0.08, 0.9, 0.06, MT.brassL, 0, 0.62, 1.12, fin).rotation.x = 0.28;
      }
      K.lathe([[0.2, 0], [0.3, -0.32], [0.38, -0.4]], MT.ironL, 14, 0, 0.04, 0, st);
      K.torus(0.36, 0.03, MT.brassD, 4, 14, 0, -0.34, 0, st).rotation.x = Math.PI / 2;
      // two steam relief valves at mid height (they vent hard while the launch is held)
      for (const a of [Math.PI / 2, -Math.PI / 2]) { const v = K.group(st, Math.sin(a) * 0.6, 1.3, Math.cos(a) * 0.6); v.rotation.y = a; K.cyl(0.06, 0.06, 0.16, MT.brassL, 8, 0, 0, 0.06, v).rotation.x = Math.PI / 2; K.cyl(0.09, 0.07, 0.06, MT.brassD, 8, 0, 0, 0.15, v).rotation.x = Math.PI / 2; }
      const hy = HATCH_Y + 0.2;
      K.box(0.5, 0.56, 0.06, MT.brassD, 0, hy, 0.57, st);
      K.box(0.36, 0.42, 0.06, MT.dark, 0, hy, 0.59, st);
      const portM = K.glow(0x6a4a24);
      for (const [y, a] of [[2.55, 0.9], [2.55, -0.9], [1.25, Math.PI]]) {
        const pg = K.group(st, Math.sin(a) * 0.57, y, Math.cos(a) * 0.57); pg.rotation.y = a;
        K.cyl(0.15, 0.15, 0.06, MT.brassL, 12, 0, 0, 0, pg).rotation.x = Math.PI / 2;
        K.cyl(0.1, 0.1, 0.08, portM, 12, 0, 0, 0.01, pg).rotation.x = Math.PI / 2;
      }
      const aboardM = K.glow(0x14301e);
      const ab = K.group(st, 0, hy + 0.55, 0.555);
      K.cyl(0.13, 0.13, 0.06, MT.brassL, 12, 0, 0, 0, ab).rotation.x = Math.PI / 2;
      K.cyl(0.09, 0.09, 0.08, aboardM, 12, 0, 0, 0.012, ab).rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; const s = K.box(0.12, 0.08, 0.01, i % 2 ? MT.soot : MT.hazard, Math.sin(a) * 0.59, 0.72, Math.cos(a) * 0.59, st); s.rotation.y = a; }
      K.bake(st);
      // hatch door (hinged at its top edge) with 4 locking bolts that spin as it seals
      const hinge = dyn(K.group(rk, 0, hy + 0.22, 0.6));
      const door = K.group(hinge);
      K.box(0.36, 0.43, 0.05, MT.copper, 0, -0.215, 0, door);
      K.box(0.3, 0.05, 0.06, MT.brassL, 0, -0.08, 0.02, door); K.box(0.06, 0.08, 0.07, MT.brassL, 0.13, -0.33, 0.02, door);
      K.bake(door);
      const bolts = [[-0.14, -0.05], [0.14, -0.05], [-0.14, -0.38], [0.14, -0.38]].map(([x, y]) => {
        const b = dyn(K.group(hinge, x, y, 0.035)); const h = K.cyl(0.035, 0.035, 0.05, MT.brassL, 6, 0, 0, 0, b); h.rotation.x = Math.PI / 2; K.box(0.06, 0.015, 0.02, MT.soot, 0, 0, 0.03, b); return b;
      });
      const cargo = dyn(K.group(rk, 0, HATCH_Y, CARGO_OUT));
      const cradle = dyn(K.box(0.3, 0.05, 0.62, MT.ironL, 0, -0.02, 0, cargo)); cradle.visible = false;
      const plume = dyn(K.group(rk, 0, -0.38, 0));
      const fl1 = K.cone(0.35, 1.7, K.glow(0xffd27a, 0.95, true), 10, 0, -0.85, 0, plume); fl1.rotation.x = Math.PI;
      const fl2 = K.cone(0.2, 1.05, K.glow(0xffffff, 1, true), 8, 0, -0.52, 0, plume); fl2.rotation.x = Math.PI;
      const fl3 = K.cone(0.55, 2.8, K.glow(0xff6a20, 0.5, true), 10, 0, -1.4, 0, plume); fl3.rotation.x = Math.PI;
      const fl4 = K.cone(0.42, 1.3, K.glow(0x7af0d8, 0.35, true), 10, 0, -0.65, 0, plume); fl4.rotation.x = Math.PI;
      plume.visible = false;
      return { rk, hinge, bolts, cargo, cradle, plume, portM, aboardM, item: null, open: 0, slide: 0, flyT: -1 };
    }
    const rockets = [makeRocket(), makeRocket()];
    let cur = rockets[0], spare = rockets[1], flyer = null;
    spare.rk.visible = false;
    // rocket-local -> g-local helper (for particles at vents etc.)
    const vt = new T.Vector3(), YAX = new T.Vector3(0, 1, 0);
    function rkPoint(r, x, y, z) { vt.set(x, y, z).applyAxisAngle(YAX, THETA); return vt.add(r.rk.position); }

    // ---------- HOLD-DOWN CLAMPS (4, between the fins) ----------
    const clamps = [];
    for (let i = 0; i < 4; i++) {
      const a = THETA + i * Math.PI / 2, dx = Math.sin(a), dz = Math.cos(a);
      const cb = K.group(S, dx * 1.45, 0.47, dz * 1.45); cb.rotation.y = a;
      K.box(0.36, 0.22, 0.36, MT.iron, 0, 0.11, 0, cb); K.box(0.4, 0.05, 0.4, MT.brassD, 0, 0.23, 0, cb);
      const pis = K.cyl(0.05, 0.05, 0.5, MT.ironL, 6, 0, 0.35, 0.2, cb); pis.rotation.x = 0.5;
      const cg = K.group(g, dx * 1.45, 0.47, dz * 1.45); cg.rotation.y = a;
      const jaw = dyn(K.group(cg, 0, 0.22, 0));
      K.box(0.16, 0.78, 0.16, MT.oxide, 0, 0.39, 0, jaw);
      K.box(0.16, 0.14, 0.84, MT.oxide, 0, 0.74, -0.38, jaw);
      K.box(0.2, 0.22, 0.1, MT.brass, 0, 0.66, -0.8, jaw);
      K.box(0.17, 0.06, 0.86, MT.hazard, 0, 0.83, -0.38, jaw);
      K.bake(jaw);
      clamps.push({ jaw, tip: [dx * (1.45 - 0.8), 1.35, dz * (1.45 - 0.8)], dx, dz });
    }

    // ---------- GANTRY TOWER ----------
    const GT = K.group(S, GANTRY[0], 0.47, GANTRY[1]);
    const GH = 6.3;
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) { K.box(0.14, GH, 0.14, MT.oxide, sx, GH / 2, sz, GT); K.box(0.26, 0.12, 0.26, MT.ironM, sx, 0.06, sz, GT); }
    for (let y = 0.6; y < GH - 0.2; y += 0.75) {
      for (const [x, z, ry] of [[0, 0.45, 0], [0, -0.45, 0], [0.45, 0, Math.PI / 2], [-0.45, 0, Math.PI / 2]]) {
        const br = K.box(0.06, 1.06, 0.06, MT.oxideD, x, y + 0.36, z, GT); br.rotation.set(0, ry, ((Math.round(y / 0.75)) % 2 ? 1 : -1) * 0.72);
        K.box(0.92, 0.07, 0.07, MT.oxideD, x, y, z, GT).rotation.y = ry;
      }
    }
    K.box(1.25, 0.1, 1.25, MT.ironM, 0, GH, 0, GT);
    for (const s of [-1, 1]) { K.box(0.04, 0.42, 1.25, MT.ironL, s * 0.6, GH + 0.21, 0, GT); K.box(1.25, 0.42, 0.04, MT.ironL, 0, GH + 0.21, s * 0.6, GT); }
    for (let y = 0.3; y < GH; y += 0.22) K.box(0.03, 0.03, 0.4, MT.ironL, -0.53, y, 0, GT);
    for (const z of [-0.2, 0.2]) K.box(0.03, GH, 0.03, MT.ironL, -0.55, GH / 2, z, GT);
    const fl = K.group(GT, 0.45, GH + 0.45, 0.45); fl.rotation.y = Math.PI / 4;
    K.box(0.42, 0.3, 0.22, MT.iron, 0, 0, 0, fl);
    const floodM = K.glow(0x3a3020); const flood = K.box(0.36, 0.24, 0.04, floodM, 0, 0, 0, g);
    flood.position.set(GANTRY[0] + 0.45 + 0.085, 0.47 + GH + 0.45, GANTRY[1] + 0.45 + 0.085); flood.rotation.y = Math.PI / 4;
    const gtd = K.group(g, GANTRY[0], 0.47, GANTRY[1]);
    const beaconM = K.mat(0x401010, { e: 0 });
    const beaconSpin = dyn(K.group(gtd, 0, GH + 0.66, 0)); K.box(0.26, 0.18, 0.08, beaconM, 0.07, 0, 0, beaconSpin);
    const beaconDomeM = K.glow(0xff3020, 0.15); K.sph(0.19, beaconDomeM, 0, GH + 0.66, 0, gtd, 8, 6).castShadow = false;
    const strobes = lampSet(gtd, [[-0.62, -0.62], [0.62, 0.62], [0.62, -0.62], [-0.62, 0.62]].map(([x, z]) => [x, GH + 0.45, z]), 0.08, 0x401010);
    const cage = dyn(K.group(gtd, 0, 1, 0));
    K.box(0.7, 0.05, 0.7, MT.brassD, 0, 0, 0, cage); K.box(0.7, 0.05, 0.7, MT.brass, 0, 0.62, 0, cage);
    for (const sx of [-0.33, 0.33]) for (const sz of [-0.33, 0.33]) K.box(0.04, 0.62, 0.04, MT.brass, sx, 0.31, sz, cage);
    K.bake(cage);
    const cageLampM = K.glow(0x3a2a14); K.sph(0.06, cageLampM, 0, 0.5, 0, cage, 6, 4).castShadow = false;
    // service arm + two umbilical hoses that pop off at ignition
    const armP = dyn(K.group(gtd, 0.45, 3.4, 0.45)); armP.rotation.y = -Math.PI / 4;
    const sarm = K.group(armP);
    K.box(0.95, 0.14, 0.2, MT.ironL, 0.47, 0, 0, sarm); K.box(0.95, 0.04, 0.06, MT.hazard, 0.47, 0.09, 0.07, sarm);
    K.box(0.12, 0.26, 0.26, MT.brassD, 0.95, 0, 0, sarm);
    for (let x = 0.1; x < 0.9; x += 0.2) K.box(0.03, 0.16, 0.22, MT.ironM, x, -0.02, 0, sarm);
    K.bake(sarm);
    const hoses = [-0.07, 0.07].map((zo, i) => {
      const hp = dyn(K.group(sarm, 0.9, -0.12, zo));
      K.tube([[0, 0, 0], [0.05, -0.35, 0], [0.12, -0.75 - i * 0.2, 0], [0.12, -0.95 - i * 0.2, 0]], 0.04, MT.rubber, hp, 10, 5);
      K.box(0.1, 0.12, 0.1, MT.brassL, 0.12, -1.0 - i * 0.2, 0, hp);
      K.bake(hp);
      return { hp, end: -1.0 - i * 0.2, pop: 0, vel: 0 };
    });

    // ---------- BOILER TANK ----------
    const TK = K.group(S, TANK[0], 0.47, TANK[1]);
    for (const x of [-0.55, 0.55]) { K.box(0.2, 0.42, 0.9, MT.iron, x, 0.21, 0, TK); K.box(0.26, 0.05, 0.96, MT.brassD, x, 0.43, 0, TK); }
    const tb = K.cyl(0.44, 0.44, 1.7, MT.copper, 16, 0, 0.82, 0, TK); tb.rotation.z = Math.PI / 2;
    for (const x of [-0.86, 0.86]) { const cp = K.sph(0.44, MT.copperD, x, 0.82, 0, TK, 14, 8); cp.scale.x = 0.36; }
    for (const x of [-0.5, 0, 0.5]) { const b = K.cyl(0.46, 0.46, 0.07, MT.brassD, 16, x, 0.82, 0, TK); b.rotation.z = Math.PI / 2; }
    const sightM = K.glow(0x1e4a40); K.box(1.2, 0.12, 0.05, sightM, TANK[0], 0.47 + 0.92, TANK[1] + 0.44, g);
    K.cyl(0.07, 0.07, 0.5, MT.brass, 8, 0.45, 1.4, 0.0, TK); K.cyl(0.1, 0.07, 0.18, MT.brassL, 8, 0.45, 1.7, 0, TK);
    for (let i = 0; i < 4; i++) { const s = K.box(0.03, 0.3, 0.01, MT.grime, -0.6 + i * 0.4, 0.6, 0.445, TK); s.castShadow = false; }
    const tankN = dyn(gauge(g, TANK[0], 0.47 + 1.33, TANK[1] + 0.3, 0.15, 0)); tankN.parent.rotation.x = -0.4;
    K.tube([[TANK[0] - 0.7, 1.35, TANK[1] + 0.2], [-1.0, 1.4, -1.2], [-0.62, 1.3, -0.75], [-0.45, 1.05, -0.5]], 0.07, MT.copper, S, 16, 6);

    // ---------- CLOCK TOWER + NIXIE BOARDS (faces the camera) ----------
    const CK = K.group(S, CLOCK[0], 0.47, CLOCK[1]); CK.rotation.y = Math.PI / 4;
    K.box(0.66, 0.3, 0.66, MT.iron, 0, 0.15, 0, CK);
    K.box(0.56, 1.9, 0.56, MT.brick, 0, 1.25, 0, CK);
    for (const y of [0.4, 1.2, 2.0]) K.box(0.6, 0.06, 0.6, MT.brassD, 0, y, 0, CK);
    K.box(0.68, 0.14, 0.68, MT.brassD, 0, 2.25, 0, CK);
    K.torus(0.47, 0.06, MT.brass, 6, 20, 0, 2.72, 0.26, CK);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.04, i % 3 ? 0.06 : 0.11, 0.02, MT.soot, Math.sin(a) * 0.36, 2.72 + Math.cos(a) * 0.36, 0.27, CK).rotation.z = -a; }
    K.box(0.3, 0.05, 0.02, MT.red, 0.0, 2.95, 0.27, CK);
    K.cone(0.2, 0.32, MT.brassD, 6, 0, 3.3, 0, CK);
    K.box(0.62, 0.34, 0.2, MT.brassD, 0, 1.62, 0.32, CK);     // countdown housing (4 tubes)
    K.box(0.5, 0.28, 0.18, MT.ironM, 0, 0.78, 0.32, CK);      // shipped counter housing (3 tubes)
    K.box(0.12, 0.07, 0.02, MT.green, -0.18, 0.97, 0.42, CK); // little green rocket glyph plate
    K.cone(0.03, 0.06, MT.green, 4, -0.18, 1.0, 0.43, CK);
    for (let i = 0; i < 4; i++) K.cyl(0.07, 0.07, 0.28, MT.glass, 10, -0.21 + i * 0.14, 1.64, 0.45, CK).castShadow = false;
    for (let i = 0; i < 3; i++) K.cyl(0.06, 0.06, 0.22, MT.glass, 10, -0.12 + i * 0.12, 0.78, 0.43, CK).castShadow = false;
    const ckd = K.group(g, CLOCK[0], 0.47, CLOCK[1]); ckd.rotation.y = Math.PI / 4;
    const faceM = K.mat(C.cream, { e: 0 });
    K.cyl(0.46, 0.46, 0.08, faceM, 18, 0, 2.72, 0.22, ckd).rotation.x = Math.PI / 2;
    const hand = dyn(K.group(ckd, 0, 2.72, 0.28)); K.box(0.045, 0.36, 0.02, MT.handRed, 0, 0.17, 0, hand); K.box(0.07, 0.07, 0.03, MT.brassL, 0, 0, 0.01, hand);
    const bellP = dyn(K.group(ckd, 0, 3.55, 0)); K.cone(0.15, 0.2, MT.brassL, 8, 0, -0.08, 0, bellP); K.box(0.04, 0.12, 0.04, MT.iron, 0, 0.05, 0, bellP); K.bake(bellP);
    const ckLampM = K.mat(0x2a1a10, { e: 0 }); K.sph(0.09, ckLampM, 0.0, 2.02, 0.33, ckd, 8, 6);
    const board = nixieRow(ckd, [-0.21, -0.07, 0.07, 0.21], 1.64, 0.46, 0.12, 0.2);
    const counter = nixieRow(ckd, [-0.12, 0, 0.12], 0.78, 0.44, 0.1, 0.16);

    // ---------- TESLA COILS + AETHER TRANSFORMER ----------
    // the two coils share their glow materials (one merged mesh each) and one instanced mesh of arc segments
    const knobM = K.glow(0x0e2a24), haloM = K.glow(0x7af0d8, 0.0, true), windM = K.glow(0x7af0d8, 0, true);
    const arcs = segSet(g, 26, 0.06);
    const coils = COILS.map(([x, z], ci) => {
      const cg = K.group(S, x, 0.47, z);
      K.cyl(0.32, 0.4, 0.34, MT.ironM, 10, 0, 0.17, 0, cg); band(cg, 0.36, 0.3, MT.brassD, 0.06);
      for (let i = 0; i < 4; i++) K.cyl(0.2 - i * 0.012, 0.22 - i * 0.012, 0.12, MT.insul, 10, 0, 0.42 + i * 0.13, 0, cg);
      K.cyl(0.15, 0.17, 1.45, MT.coilCore, 10, 0, 1.4, 0, cg);
      for (let i = 0; i < 10; i++) K.torus(0.18, 0.032, MT.copper, 4, 12, 0, 0.82 + i * 0.13, 0, cg).rotation.x = Math.PI / 2;
      K.torus(0.33, 0.12, MT.brassL, 6, 16, 0, 2.2, 0, cg).rotation.x = Math.PI / 2;
      K.cyl(0.05, 0.05, 0.22, MT.brass, 6, 0, 2.38, 0, cg);
      K.sph(0.15, knobM, x, 0.47 + 2.52, z, g, 10, 8).castShadow = false;
      K.sph(0.36, haloM, x, 0.47 + 2.52, z, g, 10, 8).castShadow = false;
      K.cyl(0.24, 0.24, 1.3, windM, 10, x, 0.47 + 1.4, z, g).castShadow = false;
      return { x, z, i0: ci * 13, top: new T.Vector3(x, 0.47 + 2.55, z) };
    });
    const XF = K.group(S, XFMR[0], 0, XFMR[1]);
    K.box(0.95, 0.12, 0.85, MT.ironM, 0, 0.06, 0, XF);
    K.box(0.82, 1.05, 0.72, MT.iron, 0, 0.64, 0, XF);
    K.box(0.86, 0.06, 0.76, MT.brassD, 0, 1.18, 0, XF);
    for (const x of [-0.2, 0.2]) { for (let i = 0; i < 3; i++) K.cyl(0.09 - i * 0.012, 0.1 - i * 0.012, 0.1, MT.insul, 8, x, 1.26 + i * 0.1, 0, XF); K.sph(0.06, MT.brassL, x, 1.58, 0, XF, 6, 4); }
    hazardStripe(XF, 0.82, 0, 0.22, 0.37, 7, 0, 0.1);
    K.box(0.62, 0.05, 0.05, MT.brassL, 0, 0.98, 0.37, XF);
    for (const [x, y] of [[-0.36, 0.2], [0.36, 0.2], [-0.36, 1.08], [0.36, 1.08]]) K.box(0.05, 0.05, 0.05, MT.brassL, x, y, 0.38, XF);
    const xf0 = K.cyl(0.17, 0.17, 0.12, MT.brass, 12, -0.48, 0.35, 0, XF); xf0.rotation.z = Math.PI / 2;
    const xf1 = K.cyl(0.12, 0.12, 0.2, MT.verdigris, 10, -0.6, 0.35, 0, XF); xf1.rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; K.box(0.04, 0.04, 0.04, MT.brassL, -0.55, 0.35 + Math.sin(a) * 0.14, Math.cos(a) * 0.14, XF); }
    const xfGlass = K.glow(0x0e3a30); K.box(0.5, 0.16, 0.03, xfGlass, XFMR[0], 0.75, XFMR[1] + 0.375, g);
    const xfMeter = dyn(gauge(g, XFMR[0] + 0.25, 0.48, XFMR[1] + 0.38, 0.11, 0));
    const cablePaths = [
      [[XFMR[0] + 0.45, 0.12, XFMR[1] + 0.1], [-2.5, 0.1, 0.55], [COILS[0][0] - 0.3, 0.12, COILS[0][1]]],
      [[XFMR[0] + 0.2, 0.12, XFMR[1] - 0.42], [-2.75, 0.1, -1.6], [-1.6, 0.1, -2.85], [0.9, 0.1, -2.95], [2.1, 0.1, -2.75], [2.8, 0.1, -1.6], [COILS[1][0] + 0.25, 0.14, COILS[1][1] - 0.2]]
    ];
    const beads = [], beadSet = dotSet(g, 8, 0.06, 0x9afff0, 0.95);
    cablePaths.forEach((pts) => {
      K.tube(pts, 0.07, MT.rubber, S, 40, 6);
      const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2])));
      for (let i = 0; i < 9; i++) { const p = curve.getPoint((i + 0.5) / 9); K.torus(0.085, 0.025, MT.brassD, 4, 8, p.x, p.y, p.z, S).lookAt(0, 0, 0); }
      for (let i = 0; i < 4; i++) beads.push({ curve, u: i / 4, p: new T.Vector3() });
    });
    const coilL = K.light(0x7af0d8, 0, 8, 0, 2.6, 0, g);     // charge arcs / work flood / amber sputter
    const plumeL = K.light(0xff8a3a, 0, 11, 0, 0.9, 0, g);   // ignition / red flood strobe when blocked
    if (!coilL.isDummy) dyn(coilL);
    if (!plumeL.isDummy) dyn(plumeL);

    // ---------- LOADING JIB CRANE ----------
    const CB = K.group(S, PIVOT[0], 0.47, PIVOT[1]);
    K.cyl(0.32, 0.4, 0.22, MT.iron, 10, 0, 0.11, 0, CB); band(CB, 0.36, 0.22, MT.brassD, 0.05);
    gear(CB, 0.3, 0.07, 14, MT.brassD, 0, 0.27, 0);
    K.cyl(0.11, 0.13, 2.85, MT.oxide, 10, 0, 1.68, 0, CB);
    for (const y of [0.9, 1.9, 2.7]) band(CB, 0.15, y, MT.brassD, 0.07);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const s = K.box(0.05, 0.9, 0.05, MT.oxideD, Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22, CB); s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    const BOOM_Y = 3.55, BOOM_L = 1.45;
    const head = dyn(K.group(g, PIVOT[0], BOOM_Y, PIVOT[1]));
    const HS = K.group(head);
    K.cyl(0.2, 0.2, 0.14, MT.brass, 12, 0, -0.03, 0, HS);
    K.box(BOOM_L + 0.1, 0.13, 0.16, MT.oxide, BOOM_L / 2, 0.02, 0, HS);
    for (let i = 0; i < 7; i++) K.box(0.09, 0.03, 0.18, i % 2 ? MT.soot : MT.hazard, 0.12 + i * 0.2, 0.1, 0, HS);
    K.box(0.62, 0.11, 0.14, MT.oxide, -0.3, 0.02, 0, HS);
    K.box(0.32, 0.36, 0.3, MT.ironM, -0.52, 0.05, 0, HS); K.box(0.34, 0.06, 0.32, MT.brassD, -0.52, 0.24, 0, HS);
    K.cyl(0.05, 0.08, 0.62, MT.ironL, 6, 0, 0.38, 0, HS);
    const tie1 = K.box(1, 0.025, 0.025, MT.ironL, 0, 0, 0, HS); K.link(tie1, 0, 0.66, BOOM_L - 0.05, 0.08);
    const tie2 = K.box(1, 0.025, 0.025, MT.ironL, 0, 0, 0, HS); K.link(tie2, 0, 0.66, -0.6, 0.12);
    K.cyl(0.09, 0.09, 0.2, MT.brassL, 10, -0.25, 0.14, 0, HS).rotation.x = Math.PI / 2;
    K.bake(HS);
    const trolley = dyn(K.group(head, 0.8, -0.06, 0));
    const TS = K.group(trolley); K.box(0.24, 0.12, 0.24, MT.ironL, 0, 0, 0, TS);
    for (const s of [-1, 1]) K.cyl(0.05, 0.05, 0.04, MT.brass, 8, 0, 0.06, s * 0.11, TS).rotation.x = Math.PI / 2;
    K.bake(TS);
    const swing = dyn(K.group(trolley, 0, -0.06, 0));                // cable sway pivot
    const chain = dyn(K.box(0.035, 1, 0.035, MT.soot, 0, -0.5, 0, swing));
    const claw = dyn(K.group(swing, 0, -1, 0));
    const CLS = K.group(claw); K.box(0.22, 0.12, 0.2, MT.ironL, 0, 0, 0, CLS); K.box(0.1, 0.1, 0.1, MT.iron, 0, 0.1, 0, CLS); for (let i = 0; i < 3; i++) K.box(0.05, 0.13, 0.21, i % 2 ? MT.soot : MT.hazard, -0.08 + i * 0.08, 0, 0, CLS); K.bake(CLS);
    const fingers = [-1, 1].map((s) => { const fg = dyn(K.group(claw, 0, -0.04, s * 0.09)); K.box(0.16, 0.36, 0.04, MT.ironL, 0, -0.18, 0, fg); K.box(0.16, 0.05, 0.08, MT.brassD, 0, -0.34, -s * 0.03, fg); K.bake(fg); return { fg, s }; });
    const clawLampM = K.mat(0x203020, { e: 0 }); K.sph(0.04, clawLampM, 0.12, 0.02, 0, claw, 6, 4);
    const grip = K.group(claw, 0, -0.42, 0);
    const CH0 = BOOM_Y - 0.12;
    const crane = { a: Math.atan2(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]), r: 0.8, y: 2.3, gr: 0 };
    let swayX = 0, swayZ = 0, swayVX = 0, swayVZ = 0, prevA = crane.a, prevR = crane.r;
    function applyCrane(dt) {
      head.rotation.y = -crane.a;
      trolley.position.x = crane.r;
      const clawY = crane.y + 0.42;
      const c = Math.max(0.04, CH0 - 0.06 - clawY);
      chain.scale.y = c; chain.position.y = -c / 2;
      claw.position.y = -c - 0.06;
      fingers.forEach((f) => (f.fg.rotation.x = f.s * (0.55 - crane.gr * 0.55)));
      // pendulum sway driven by slewing (tangential) + trolley (radial) motion; damped
      if (dt > 0) {
        const da = (crane.a - prevA) / dt, dr = (crane.r - prevR) / dt; prevA = crane.a; prevR = crane.r;
        const L = Math.max(0.3, c + 0.4), w2 = 9.8 / L;
        swayVX += (-w2 * swayX - 2.2 * swayVX - dr * 3.2) * dt; swayX += swayVX * dt;            // about head-z (radial swing)
        swayVZ += (-w2 * swayZ - 2.2 * swayVZ + da * crane.r * 3.2) * dt; swayZ += swayVZ * dt;  // about head-x (tangential swing)
        swayX = Math.max(-0.35, Math.min(0.35, swayX)); swayZ = Math.max(-0.35, Math.min(0.35, swayZ));
      }
      swing.rotation.z = swayX; swing.rotation.x = swayZ;
    }
    const A_TRAY = Math.atan2(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]), R_TRAY = Math.hypot(TRAY[1] - PIVOT[1], TRAY[0] - PIVOT[0]);
    const cOut = [HD[0] * CARGO_OUT, HD[1] * CARGO_OUT];
    const A_HATCH = Math.atan2(cOut[1] - PIVOT[1], cOut[0] - PIVOT[0]), R_HATCH = Math.hypot(cOut[1] - PIVOT[1], cOut[0] - PIVOT[0]);
    const Y_TRAY = 1.0, Y_CARRY = 2.85, Y_HATCH = BASE_Y + HATCH_Y;

    // ---------- INTAKE TRAY ----------
    const TY = K.group(S, TRAY[0], 0, TRAY[1]);
    for (const sx of [-0.28, 0.28]) for (const sz of [-0.35, 0.3]) K.box(0.08, 0.92, 0.08, MT.iron, sx, 0.46, sz, TY);
    K.box(0.68, 0.06, 0.82, MT.ironL, 0, 0.94, -0.03, TY);
    for (let i = 0; i < 5; i++) { const r = K.cyl(0.045, 0.045, 0.6, MT.brassL, 8, 0, 0.985, -0.35 + i * 0.16, TY); r.rotation.z = Math.PI / 2; }
    for (const sx of [-0.34, 0.34]) K.box(0.05, 0.16, 0.84, MT.brassD, sx, 1.02, -0.03, TY);
    hazardStripe(TY, 0.62, 0, 1.05, -0.5, 6, 0, 0.2);
    K.box(0.7, 0.04, 0.6, MT.ironM, 0, 0.25, -0.03, TY);
    const trayLampM = K.mat(0x203020, { e: 0 }); K.sph(0.06, trayLampM, TRAY[0] + 0.36, 1.18, TRAY[1] - 0.44, g, 6, 4);

    // ---------- STATUS + CAUTION ----------
    const lamp = K.statusLamp(g, 2.3, 0.47, 0.9, 1.15);
    const caution = K.caution(g, -2.4, 0.1, 1.55, 0.85);

    // ---------- LIFTOFF FX: shockwave, bright trail, lingering smoke column ----------
    const shock = dyn(K.torus(1, 0.08, K.glow(0xffd8a0, 0.9, true), 4, 32, 0, 0.55, 0, g)); shock.rotation.x = Math.PI / 2; shock.visible = false; shock.castShadow = false;
    // vapour ring where the rocket punches out over the top of the factory
    const VAPOR_Y = 9.5;
    const vapor = dyn(K.torus(1, 0.12, K.glow(0xd8d2c8, 0.7, true), 4, 32, 0, VAPOR_Y, 0, g)); vapor.rotation.x = Math.PI / 2; vapor.visible = false; vapor.castShadow = false;
    let vaporT = -1, docked = true, clampWeld = false;
    const trailM = K.glow(0xffc070, 0, true), trailCoreM = K.glow(0xfff4d8, 0, true);
    const trail = dyn(K.cyl(0.2, 0.32, 1, trailM, 10, 0, 0, 0, g)); trail.castShadow = false; trail.visible = false;
    const trailCore = dyn(K.cyl(0.07, 0.1, 1, trailCoreM, 8, 0, 0, 0, g)); trailCore.castShadow = false; trailCore.visible = false;
    const colM = K.mat(0x9a9286, { op: 0, depthWrite: false });
    const column = dyn(K.cyl(0.5, 0.9, 1, colM, 12, 0, 0, 0, g)); column.castShadow = false; column.receiveShadow = false; column.visible = false;
    let trailTop = 0, trailA = 0, colA = 0, colTop = 0, heat = 0, trailBot = 1;

    palettize(g);
    K.bake(S);
    fold(g);

    // =====================================================================
    // STATE MACHINES
    // =====================================================================
    let craneQ = [], craneStep = null, craneT = 0, craneMode = 'rest', held = null;
    function craneGo(steps) { craneQ = steps.slice(); craneStep = null; }
    function nextCraneStep() { craneStep = craneQ.shift() || null; craneT = 0; if (craneStep) { craneStep.from = { a: crane.a, r: crane.r, y: crane.y, gr: crane.gr }; if (craneStep.start) craneStep.start(); } }
    let phase = 'ready', pT = 0, decided = false, countN = 3, seal = 0, climbT = 0;
    let resetPhase = null, rT = 0;
    let clampOpen = 0, clampSparked = false, armAway = 0, bellSwing = 0, shockT = -1, celebrateT = -1, shipFlash = 0, lastShipped = -1, hosePopped = false;
    let lite = 0;   // 0 = lights down (idle) .. 1 = lit (working)
    function setPhase(p) { phase = p; pT = 0; }
    function recycle(r) {
      r.rk.visible = false; r.plume.visible = false; r.item = null; r.open = 0; r.slide = 0; r.flyT = -1;
      r.rk.position.set(0, BASE_Y, 0); r.hinge.rotation.x = 0; r.cargo.position.z = CARGO_OUT; r.aboardM.color.setHex(0x14301e);
    }
    const rootDir = (dx, dz) => [C45 * (dx - dz), C45 * (dx + dz)];
    function orientItem(it, dxl, dzl) { const [rx, rz] = rootDir(dxl, dzl); it.mesh.rotation.order = 'YZX'; it.mesh.rotation.set(0, Math.atan2(-rz, rx), 0); }

    const tmp = new T.Vector3(), za = new T.Vector3(), zb = new T.Vector3(), zP = []; for (let i = 0; i <= 9; i++) zP.push(new T.Vector3());
    const zp0 = new T.Vector3(), zp1 = new T.Vector3();
    // one arc from a coil's top load into the hull: 9 jagged segments + a 4-segment branch (instances i0..i0+12)
    function zap(c, on, strength, col) {
      const rk = cur || flyer;
      if (!on || !rk) { for (let i = 0; i < 13; i++) arcs.hide(c.i0 + i); return; }
      const ry = rk.rk.position.y + 0.6 + Math.random() * 2.2;
      const dx = c.x - rk.rk.position.x, dz = c.z - rk.rk.position.z, d = Math.hypot(dx, dz) || 1;
      za.copy(c.top); zb.set(rk.rk.position.x + dx / d * 0.6, ry, rk.rk.position.z + dz / d * 0.6);
      const n = 9;
      for (let i = 0; i <= n; i++) { zP[i].copy(za).lerp(zb, i / n); if (i > 0 && i < n) zP[i].add(tmp.set(K.R() * 0.5, K.R() * 0.5, K.R() * 0.5).multiplyScalar(strength)); }
      for (let i = 0; i < n; i++) arcs.seg(c.i0 + i, zP[i], zP[i + 1], col || 0xd8fff6, 1);
      const k0 = 3 + Math.floor(Math.random() * 3); zp0.copy(zP[k0]);
      for (let i = 0; i < 4; i++) {
        zp1.copy(zp0).add(tmp.set(K.R() * 0.6, -0.15 - Math.random() * 0.3, K.R() * 0.6));
        if (Math.random() < 0.8) arcs.seg(c.i0 + 9 + i, zp0, zp1, col ? 0xffb020 : 0x7af0d8, 0.67); else arcs.hide(c.i0 + 9 + i);
        zp0.copy(zp1);
      }
    }
    // flight curve: heavy and slow for ~1.5 s, then it really goes (straight up out of the shaft and on into the sky)
    function flightY(q) { if (q <= 1.5) return BASE_Y + 0.9 * q * q; const d = q - 1.5; return BASE_Y + 2.025 + 2.7 * d + 5.5 * d * d; }
    const FLY_TOP = 64;      // local height (root y ~86) where the rocket is gone
    const SHIP_Y = 15;       // local height (above the gantry, out of the top of the factory) where the PR counts as shipped

    let tPuff = 0, tZap = 0;
    applyCrane(0);
    // read-only peek for screenshot scripts (window.SHAFT.I.stations.pad.holder -> this group)
    g.userData.peek = () => ({ phase, pT, reset: resetPhase, rT, crane: craneMode, fly: flyer ? flyer.rk.position.y : null, loaded: !!(cur && cur.item) });

    // an item that vanished from the world (the real issue closed): let go of it, carry on
    const lost = (it) => !it || it.gone;

    return { g, update(t, dt) {
      const blk = M.blocked;
      const live = blk ? 0 : dt;           // frozen timers while a decision is pending
      const waiting = M.waiting('in');
      if (held && lost(held)) { held = null; if (craneMode === 'hold') { craneMode = 'insert'; craneGo([{ dur: 0.6, a: A_TRAY, r: R_TRAY, y: 2.3, gr: 0, then() { craneMode = 'rest'; } }]); } }
      if (cur && cur.item && lost(cur.item) && (phase === 'ready' || phase === 'loading' || phase === 'charge' || phase === 'count' || phase === 'hold')) {
        // the PR went away before liftoff: unload the cradle, the rocket stands ready again
        cur.item = null; cur.cradle.visible = false; cur.open = 0; cur.slide = 0; cur.cargo.position.z = CARGO_OUT; cur.aboardM.color.setHex(0x14301e); seal = 0; decided = false;
        if (phase !== 'ready') setPhase('ready');
      }
      // ------------------------------------------------ CRANE (freezes while blocked)
      if (!craneStep && craneQ.length) nextCraneStep();
      if (craneStep) {
        craneT += live;
        const k = Math.min(1, craneT / craneStep.dur), e = ease(k), f = craneStep.from;
        if (craneStep.a !== undefined) crane.a = f.a + (craneStep.a - f.a) * e;
        if (craneStep.r !== undefined) crane.r = f.r + (craneStep.r - f.r) * e;
        if (craneStep.y !== undefined) crane.y = f.y + (craneStep.y - f.y) * e;
        if (craneStep.gr !== undefined) crane.gr = f.gr + (craneStep.gr - f.gr) * e;
        if (k >= 1) { const s = craneStep; craneStep = null; if (s.then) s.then(); if (craneQ.length) nextCraneStep(); }
      }
      if (craneMode === 'rest' && !craneStep && !craneQ.length) crane.y += (2.3 + Math.sin(t * 0.8) * 0.04 - crane.y) * Math.min(1, dt * 2);
      applyCrane(dt);
      if (held) orientItem(held, Math.cos(crane.a), Math.sin(crane.a));
      if (!blk && craneMode === 'rest' && !craneStep && !craneQ.length && waiting) {
        craneMode = 'fetch';
        craneGo([
          { dur: 0.45, a: A_TRAY, r: R_TRAY, y: Y_TRAY + 0.02, gr: 0 },
          { dur: 0.22, gr: 1, start() { const it = M.take('in'); if (it) { held = it; it.follow(grip); } else { craneQ = []; craneMode = 'rest'; } } },
          { dur: 0.45, y: Y_CARRY },
          { dur: 0.75, a: A_HATCH, r: R_HATCH - 0.3, then() { craneMode = 'hold'; } }
        ]);
      }
      if (!blk && craneMode === 'hold' && !craneStep && !craneQ.length && held && cur && !cur.item && phase === 'ready' && !resetPhase) {
        craneMode = 'insert'; setPhase('loading');
        craneGo([
          { dur: 0.45, r: R_HATCH, y: Y_HATCH },
          { dur: 0.22, gr: 0, start() { const it = held; held = null; if (it && !it.gone && cur) { cur.item = it; it.follow(cur.cargo); cur.cradle.visible = true; } } },
          { dur: 0.4, y: Y_CARRY, r: R_HATCH - 0.35 },
          { dur: 0.6, a: A_TRAY, r: R_TRAY, y: 2.3, then() { craneMode = 'rest'; } }
        ]);
      }

      // ------------------------------------------------ ROCKET PHASES
      const r = cur;
      if (phase === 'loading' || phase === 'charge' || phase === 'count' || phase === 'hold') pT += live; else pT += dt;
      if (phase === 'loading' && r) {
        r.open = Math.min(1, r.open + live / 0.3);
        if (r.item && r.cradle.visible) {
          r.slide = Math.min(1, r.slide + (craneStep && craneStep.gr === 0 ? 0 : live / 0.45));
          r.cargo.position.z = CARGO_OUT + (CARGO_IN - CARGO_OUT) * ease(r.slide);
          if (r.slide >= 1) {
            r.open = Math.max(0, r.open - live / 0.25);
            if (r.open <= 0.01) {
              seal += live;
              r.bolts.forEach((b, i) => (b.rotation.z += live * (14 + i * 2)));
              if (seal > 0.35) { seal = 0; r.open = 0; r.cradle.visible = false; r.aboardM.color.setHex(0x46ff8a); r.item.parts.halo.visible = false; r.item.flash(0x46ff8a); setPhase('charge'); }
            }
          }
        } else if (!craneStep && !craneQ.length && !held && pT > 1.2) { r.open = 0; setPhase('ready'); } // nothing arrived after all
      } else if (phase === 'charge') {
        // real time: the coils keep the rocket charged until the real deploy says go
        if (pT > 1.1 && (!r || !r.item || M.ready(r.item))) { setPhase('count'); countN = 3; bellSwing = 1; }
      } else if (phase === 'count') {
        const n = 3 - Math.floor(pT / 0.5);
        if (n !== countN && n >= 0) { countN = n; bellSwing = 1; }
        if (pT >= 1.5) {
          countN = 0;
          if (!decided) { decided = true; if (r && r.item && M.maybeDecision('Launch ' + r.item.label() + '? Holding at T-0')) setPhase('hold'); else { setPhase('ignite'); hosePopped = false; } }
          else { setPhase('ignite'); hosePopped = false; }
        }
      } else if (phase === 'hold') {
        if (!blk) { setPhase('ignite'); hosePopped = false; }
      } else if (phase === 'ignite') {
        // a lit rocket never freezes: ignition runs on dt even if someone stalls the pad now
        if (shockT < 0 && pT < 0.1) { shockT = 0; for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; puff(Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9, Math.cos(a) * (2.5 + Math.random() * 2), 0.3 + Math.random() * 0.5, Math.sin(a) * (2.5 + Math.random() * 2), Math.random() < 0.3 ? 0xffb050 : 0xb0a694, 1.1, 0.11, 2, 0.2, -0.08); } }
        if (!hosePopped && pT > 0.08) { hosePopped = true; hoses.forEach((h, i) => { h.vel = -5 - i * 1.5; }); }
        if (pT > 0.7 && cur) { flyer = cur; cur = null; flyer.flyT = 0; climbT = 0; setPhase('climb'); }
      } else if (phase === 'climb') {
        climbT += dt;
        if (!resetPhase && climbT > 1.8 && !blk) { resetPhase = 'drop'; rT = 0; }
      }
      // flying rocket (never freezes): straight up out of the top of the shaft, on into the sky
      if (flyer) {
        flyer.flyT += dt;
        const q = flyer.flyT;
        flyer.rk.position.y = flightY(q);
        const rumble = q < 1.5 ? (1.5 - q) * 0.035 : 0.006;
        flyer.rk.position.x = Math.sin(t * 61) * rumble; flyer.rk.position.z = Math.cos(t * 47) * rumble;
        flyer.plume.visible = true; const f = 0.85 + Math.random() * 0.35; const big = q < 1.5 ? 1.15 + (1.5 - q) * 0.25 : 1 + Math.min(1.2, (q - 1.5) * 0.5); flyer.plume.scale.set(big, f * big * (q < 1.5 ? 1.2 : 1.5), big);
        if (flyer.item && flyer.rk.position.y > SHIP_Y) { const it = flyer.item; flyer.item = null; M.consume(it); celebrateT = 0; }
        if (flyer.rk.position.y > FLY_TOP) { recycle(flyer); spare = flyer; flyer = null; }
      }
      shared.rocket = flyer ? flyer.rk : null;
      // reset: pedestal drops, the next rocket rises out of the silo with it, clamps swing in (never stops halfway)
      if (resetPhase) {
        rT += dt;
        if (resetPhase === 'drop') { lifter.position.y = -6.2 * ease(Math.min(1, rT / 0.5)); if (rT >= 0.5) { rT = 0.5; const nr = spare && !spare.rk.visible ? spare : null; if (nr) { spare = null; cur = nr; cur.rk.visible = true; resetPhase = 'rise'; rT = 0; } } }
        else if (resetPhase === 'rise') { const k = Math.min(1, rT / 1.2); lifter.position.y = -6.2 * (1 - ease(k)); if (k >= 1) { resetPhase = 'clamp'; rT = 0; } }
        else if (resetPhase === 'clamp') { if (rT > 0.35) { resetPhase = null; setPhase('ready'); decided = false; } }
        if (cur) cur.rk.position.y = BASE_Y + lifter.position.y;
      }
      if (cur && phase === 'ready' && !resetPhase) cur.rk.position.y = BASE_Y;
      if (cur) cur.hinge.rotation.x = -1.25 * ease(cur.open);
      const vd = lifter.position.y < -0.35; voidDisk.visible = vd; voidGlow.visible = vd;
      if (vd) voidGlow.material.opacity = 0.35 + Math.sin(t * 5) * 0.15;
      // ignition: heavy rumble on the clamps, plume building
      if (phase === 'ignite' && cur) { const k = Math.min(1, pT / 0.7); cur.rk.position.x = Math.sin(t * 60) * 0.03 * k; cur.rk.position.z = Math.cos(t * 53) * 0.03 * k; cur.rk.position.y = BASE_Y + Math.abs(Math.sin(t * 40)) * 0.015 * k; cur.plume.visible = true; cur.plume.scale.set(k * 1.2, k * (0.8 + Math.random() * 0.4) * 1.1, k * 1.2); }
      else if (cur) { cur.rk.position.x = 0; cur.rk.position.z = 0; cur.plume.visible = false; }

      // clamps fly back (with sparks) + service arm + umbilicals
      const wantOpen = (phase === 'ignite' && pT > 0.4) || phase === 'climb' || resetPhase === 'drop' || resetPhase === 'rise';
      clampOpen += ((wantOpen ? 1 : 0) - clampOpen) * Math.min(1, dt * (wantOpen ? 12 : 4));
      clamps.forEach((c) => (c.jaw.rotation.x = clampOpen * 1.15 + (wantOpen ? Math.sin(t * 30) * 0.02 * (1 - clampOpen) : 0)));
      if (wantOpen && !clampSparked && clampOpen > 0.15) { clampSparked = true; clamps.forEach((c) => { for (let i = 0; i < 10; i++) K.spawn(g, c.tip[0], c.tip[1], c.tip[2], c.dx * (1 + Math.random() * 2) + K.R(), 1 + Math.random() * 2, c.dz * (1 + Math.random() * 2) + K.R(), Math.random() < 0.5 ? 0xffd25a : 0xfff4d0, 0.5, 0.05, 6, true); }); }
      if (!wantOpen) clampSparked = false;
      const wantAway = phase === 'ignite' || phase === 'climb' || !!resetPhase || (phase === 'count' && pT > 1.0) || phase === 'hold';
      armAway += ((wantAway ? 1 : 0) - armAway) * Math.min(1, dt * 2.5);
      armP.rotation.y = -Math.PI / 4 + armAway * 1.25;
      hoses.forEach((h) => {
        const target = (phase === 'ignite' || phase === 'climb' || resetPhase) ? -1.25 : 0;
        if (target === 0 && armAway < 0.05) { h.pop += (0 - h.pop) * Math.min(1, dt * 3); h.vel = 0; }
        else { h.vel += ((target - h.pop) * 30 - h.vel * 3.2) * dt; h.pop += h.vel * dt; }
        h.hp.rotation.z = h.pop;
      });
      if (hosePopped && phase === 'ignite' && pT < 0.25 && Math.random() < 0.6) { armP.updateMatrixWorld(); hoses[0].hp.getWorldPosition(tmp); g.worldToLocal(tmp); puff(tmp.x, tmp.y - 0.9, tmp.z, 0.4, 0.6, 0.4, 0xe8e2d6, 0.9, 0.09, 2, 0.15); }

      // ------------------------------------------------ LIGHTS: down when idle, lit when working
      const working = phase !== 'ready' || craneMode !== 'rest' || !!resetPhase || !!flyer || !!waiting;
      lite += ((working || blk ? 1 : 0) - lite) * Math.min(1, dt * 2);
      cage.position.y = (phase === 'count' || phase === 'ignite' || phase === 'hold') ? cage.position.y + (0.25 - cage.position.y) * Math.min(1, dt * 3)
        : working ? 1 + (Math.sin(t * 0.35) * 0.5 + 0.5) * 3.8 : cage.position.y + (0.12 - cage.position.y) * Math.min(1, dt * 0.8);
      cageLampM.color.setHex(working ? 0xffc070 : 0x3a2a14);
      const alarm = blk || phase === 'count' || phase === 'ignite';
      beaconSpin.rotation.y += dt * (alarm ? (blk ? 11 : 8) : 0);
      beaconM.emissive.setHex(alarm ? (Math.sin(t * 9) > -0.2 ? (blk ? 0xff2010 : 0xff5020) : 0x300808) : 0);
      beaconDomeM.opacity = alarm ? 0.55 : 0.12;
      for (let i = 0; i < 4; i++) strobes.set(i, blk && Math.sin(t * 14 + i * 1.7) > 0.4 ? 0xff2010 : 0x401010);
      floodM.color.setHex(blk ? (Math.sin(t * 7) > 0 ? 0xff4020 : 0x501008) : lite > 0.5 ? 0xfff0c0 : 0x2a2418);
      sightM.color.setHex(lite > 0.5 ? 0x5ae0c8 : 0x1e4a40);

      // clock face, hand, nixies, bell, shipped counter
      faceM.emissive.setHex(blk ? (Math.sin(t * 6) > 0 ? 0x9a1008 : 0x3a0402) : phase === 'count' ? 0x3a2408 : 0);
      if (phase === 'count') hand.rotation.z = Math.PI * 0.5 * (1 - pT / 1.5);
      else if (phase === 'hold' || phase === 'ignite') hand.rotation.z = 0;
      else if (phase === 'charge') hand.rotation.z = Math.PI * 0.5;
      else if (phase === 'ready' || phase === 'loading') hand.rotation.z += (Math.PI * 0.5 - hand.rotation.z) * Math.min(1, dt * 3);
      const blink = Math.sin(t * 8) > 0;
      if (blk) setRow(board, blink ? 'HOLd' : '????', blink ? 1 : 0.7, blink ? 0xffffff : 0xff6040);
      else if (phase === 'count') setRow(board, 't-0' + countN, 1);
      else if (phase === 'ignite' || (phase === 'climb' && climbT < 1.5)) setRow(board, '-GO-', 1);
      else if (celebrateT >= 0) setRow(board, '5H1P', blink ? 1 : 0.6, 0xc0ffd0);
      else if (phase === 'charge') setRow(board, 'CHrG', 0.6 + Math.random() * 0.4);
      else if (phase === 'loading' || craneMode !== 'rest') setRow(board, 'LOAd', 0.8);
      else setRow(board, '----', 0.18 + lite * 0.4);
      const shipped = IRON.counters.shipped % 1000;
      if (shipped !== lastShipped) { if (lastShipped >= 0) shipFlash = 1; lastShipped = shipped; }
      shipFlash = Math.max(0, shipFlash - dt * 0.6);
      setRow(counter, String(shipped).padStart(3, '0'), 0.5 + lite * 0.25 + shipFlash * 0.5, shipFlash > 0 ? 0xd0ffd8 : 0xffffff);
      bellSwing = Math.max(0, bellSwing - dt * 1.6);
      bellP.rotation.z = Math.sin(t * 26) * 0.35 * bellSwing;
      ckLampM.emissive.setHex(blk ? (Math.sin(t * 10) > 0 ? 0xff2010 : 0) : phase === 'count' ? (Math.sin(t * 12) > 0 ? 0xffa030 : 0) : (phase === 'ignite' || phase === 'climb') ? 0x46ff8a : phase === 'charge' ? 0x5af0d8 : 0);

      // tesla coils + transformer + feed beads (a held charge, waiting on the real deploy, arcs in calmer bursts)
      const standby = phase === 'charge' && pT > 1.1;
      const charging = !blk && (phase === 'charge' || phase === 'count' || (phase === 'ignite' && pT < 0.35));
      const burst = !standby || Math.sin(t * 2.4) > 0.55;
      const sputter = blk && !!cur;
      knobM.color.setHex(charging ? (Math.random() < 0.5 ? 0xe8fffa : 0x7af0d8) : sputter ? (Math.random() < 0.25 ? 0xffc040 : 0x4a2a08) : lite > 0.5 ? 0x1e6a5a : 0x0a1e1a);
      haloM.color.setHex(sputter ? 0xffa020 : 0x7af0d8);
      haloM.opacity = charging ? (burst ? 0.35 + Math.random() * 0.25 : 0.16) : sputter ? (Math.random() < 0.3 ? 0.35 : 0.05) : 0;
      windM.opacity = charging ? (burst ? 0.12 + Math.random() * 0.1 : 0.06) : 0;
      tZap -= dt;
      if (tZap <= 0) { tZap = 0.06; coils.forEach((c) => zap(c, (charging && burst && Math.random() < (phase === 'charge' ? 0.92 : 0.7)) || (sputter && Math.random() < 0.18), charging ? (phase === 'charge' ? 1.1 : 0.8) : 0.6, sputter ? 0xffc050 : null)); arcs.commit(); }
      xfGlass.color.setHex(charging ? (Math.random() < 0.5 ? 0x9afff0 : 0x5ae0c8) : sputter ? (Math.random() < 0.3 ? 0xffa020 : 0x3a2008) : lite > 0.5 ? 0x2a8a74 : 0x0a2a22);
      xfMeter.rotation.z = charging ? -0.9 + Math.sin(t * 30) * 0.15 : blk ? -1.2 + Math.sin(t * 40) * 0.05 : 0.8;
      beads.forEach((b, i) => { if (charging) { b.u = (b.u + dt * 0.9) % 1; beadSet.put(i, b.curve.getPoint(b.u, b.p)); } else beadSet.hide(i); });
      beadSet.commit();
      if (cur) cur.portM.color.setHex(charging ? 0xfff0c0 : (phase === 'count' || phase === 'ignite' || phase === 'hold') ? 0xffd890 : lite > 0.5 ? 0xb07a3a : 0x4a3018);
      if (flyer) flyer.portM.color.setHex(0xffe0a0);
      if (cur && cur.item) cur.aboardM.color.setHex(blk ? (blink ? 0xffb020 : 0x46ff8a) : 0x46ff8a);

      // the two point lights do triple duty
      if (!coilL.isDummy) {
        if (charging && burst) { coilL.color.setHex(0x7af0d8); coilL.intensity = 1.8 + Math.random() * 1.4; coilL.position.set(0, (cur ? cur.rk.position.y : 0.8) + 1.8, 0); }
        else if (sputter) { coilL.color.setHex(0xffa030); coilL.intensity = Math.random() < 0.15 ? 1.6 : 0.2; coilL.position.set(0, 2.6, 0); }
        else { coilL.color.setHex(0xffe2b8); coilL.intensity = lite * 1.1; coilL.position.set(-0.6, 4.4, -0.6); }
      }
      const lit = phase === 'ignite' ? Math.min(1, pT / 0.7) : flyer && flyer.flyT < 3 ? Math.max(0, 1 - flyer.flyT / 3) : 0;
      if (!plumeL.isDummy) {
        if (lit > 0.02) { plumeL.color.setHex(0xff8a3a); plumeL.intensity = lit * (3.2 + Math.random() * 1.0); plumeL.position.set(0, 0.9, 0); }
        else if (blk) { plumeL.color.setHex(0xff2010); plumeL.intensity = Math.sin(t * 9) > 0 ? 3.4 : 0.5; plumeL.position.set(0.8, 2.2, 0.8); }
        else plumeL.intensity = 0;
      }
      // red flood wash on the pad while blocked
      wash.visible = washRing.visible = blk;
      if (blk) { const s = Math.sin(t * 9) > 0 ? 1 : 0.35; washM.opacity = 0.22 * s; washRingM.opacity = 0.85 * s; }

      // rim lamps: off when idle, chase when working, red strobe when blocked
      for (let i = 0; i < 8; i++) {
        let c = 0x2a1a08;
        if (blk) c = Math.sin(t * 12 + (i % 2) * Math.PI) > 0 ? 0xff2010 : 0x3a0a04;
        else if (phase === 'count') c = Math.floor(t * 14) % 8 === i ? 0xffc040 : 0x5a3410;
        else if (phase === 'charge') c = (Math.sin(t * 9 + i) > 0.3) ? 0x5af0d8 : 0x1a4a3a;
        else if (phase === 'ignite' || phase === 'climb' || resetPhase) c = 0x46ff8a;
        else if (working) c = Math.floor(t * 4) % 8 === i ? 0xffa030 : 0x3a2410;
        rimLamps.set(i, c);
      }
      trayLampM.emissive.setHex(waiting ? (Math.sin(t * 6) > 0 ? 0x46ff8a : 0x104a20) : 0);
      clawLampM.emissive.setHex(held ? 0x46ff8a : craneMode !== 'rest' ? 0xffa030 : 0);
      tankN.rotation.z = charging ? -0.7 + Math.sin(t * 6) * 0.12 : blk ? -1.15 + Math.sin(t * 40) * 0.05 : phase === 'count' ? -0.4 : lite > 0.5 ? 0.4 : 0.9;

      // ------------------------------------------------ TRAIL + SMOKE COLUMN + HEAT
      if (flyer) {
        const top = Math.min(FLY_TOP, flyer.rk.position.y - 0.4); trailTop = top;
        if (flyer.flyT < 0.1) { colTop = 0; trailBot = 1; }
        trailA = Math.min(1, trailA + dt * 3); colA = Math.min(1, colA + dt * 0.8); colTop = Math.max(colTop, Math.min(top, 16));
        heat = Math.min(1, heat + dt * 2);
        // the burn lifts off the pad behind the rocket, so the fresh one rises out of a clear silo
        trailBot = flyer.flyT > 1.8 ? 1 + 8 * Math.pow(flyer.flyT - 1.8, 1.2) : 1;
      } else { trailA = Math.max(0, trailA - dt * 0.45); colA = Math.max(0, colA - dt * 0.12); heat = Math.max(0, heat - dt * 0.14); trailBot += dt * 6; }
      if (phase === 'ignite') heat = Math.min(1, heat + dt * 1.5);
      const tBase = Math.min(trailBot, FLY_TOP);
      trail.visible = trailCore.visible = trailA > 0.01 && trailTop > tBase + 0.5;
      if (trail.visible) {
        const h = trailTop - tBase; trail.scale.set(1 + (1 - trailA) * 0.8, h, 1 + (1 - trailA) * 0.8); trail.position.set(0, tBase + h / 2, 0); trailCore.scale.set(1, h, 1); trailCore.position.copy(trail.position);
        trailM.opacity = 0.45 * trailA * (0.85 + Math.random() * 0.15); trailCoreM.opacity = 0.75 * trailA * trailA;
      }
      const cBot = Math.max(0.4, tBase - 2.5);
      column.visible = colA > 0.01 && colTop > cBot + 1.1;
      if (column.visible) { const h = colTop - cBot; column.scale.set(1 + (1 - colA) * 1.8, h, 1 + (1 - colA) * 1.8); column.position.set(Math.sin(t * 0.3) * 0.2 * (1 - colA), cBot + h / 2, 0); colM.opacity = 0.32 * colA; }
      heatM.opacity = heat * (0.5 + Math.sin(t * 11) * 0.08 + Math.random() * 0.06);

      // ------------------------------------------------ PARTICLES
      if (shockT >= 0) { shockT += dt; shock.visible = true; const k = shockT / 0.8; shock.scale.setScalar(0.6 + k * 4); shock.material.opacity = 0.9 * (1 - k); if (k >= 1) { shockT = -1; shock.visible = false; } }
      // punching out over the roof: a vapour ring + a collar of steam at that height
      if (flyer && vaporT < 0 && flyer.rk.position.y > VAPOR_Y && flyer.rk.position.y - dt * 30 < VAPOR_Y + 3) {
        vaporT = 0;
        for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; K.spawn(g, Math.cos(a) * 0.7, VAPOR_Y, Math.sin(a) * 0.7, Math.cos(a) * 3.2, -0.2 + K.R() * 0.4, Math.sin(a) * 3.2, i % 4 ? 0xe8e2d8 : 0xffd8a0, 1.1, 0.12, -0.04); }
      }
      if (vaporT >= 0) { vaporT += dt; const k = vaporT / 1.1; vapor.visible = k < 1; vapor.scale.setScalar(0.7 + ease(Math.min(1, k)) * 3.8); vapor.material.opacity = 0.7 * (1 - k) * (1 - k); if (k >= 1 && !flyer) vaporT = -1; }
      // the fresh rocket gets bolted down: weld sparks at the clamps as they bite, then the arm docks with a hiss
      if (resetPhase === 'clamp' && !clampWeld && clampOpen < 0.35) { clampWeld = true; clamps.forEach((c) => { for (let i = 0; i < 7; i++) K.spawn(g, c.tip[0], c.tip[1] - 0.2, c.tip[2], K.R() * 1.6, 0.8 + Math.random() * 1.4, K.R() * 1.6, Math.random() < 0.5 ? 0xffd25a : 0xfff4d0, 0.45, 0.045, 6, true); }); }
      if (resetPhase === 'drop') { clampWeld = false; docked = false; }
      if (!docked && !resetPhase && armAway < 0.08) {
        docked = true; armP.updateMatrixWorld(); hoses[0].hp.getWorldPosition(tmp); g.worldToLocal(tmp);
        for (let i = 0; i < 8; i++) K.spawn(g, tmp.x + 0.1, tmp.y - 0.95, tmp.z, K.R() * 1.2, 0.5 + Math.random(), K.R() * 1.2, Math.random() < 0.6 ? 0xffd25a : 0xfff4d0, 0.4, 0.04, 6, true);
        puff(tmp.x, tmp.y - 1.0, tmp.z, 0.3, 0.8, 0.3, 0xe8e2d6, 1.0, 0.09, 3, 0.12);
      }
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = 0.05;
        const tx = TANK[0] + 0.45, tz = TANK[1];
        if (blk) {
          puff(tx, 2.35, tz, 0.5, 2.0, 0.2, 0xf0ece4, 1.6, 0.12, 3, 0.2, -0.12);
          if (cur) for (const a of [Math.PI / 2, -Math.PI / 2]) { const p = rkPoint(cur, Math.sin(a) * 0.75, 1.3, Math.cos(a) * 0.75); const d = rootDirLocal(a); puff(p.x, p.y, p.z, d[0] * 2.4, 1.2, d[1] * 2.4, 0xf4f0ea, 1.5, 0.12, 3, 0.15, -0.14); }
        } else if (charging) { if (Math.random() < (burst ? 0.7 : 0.25)) puff(tx, 2.35, tz, 0.4, 1.6, 0.2, 0xd8d0c4, 1.3, 0.1, 2, 0.15); }
        else if (lite > 0.5 && Math.random() < 0.12) puff(tx, 2.35, tz, 0.2, 0.9, 0.1, 0xb8ac98, 1.2, 0.08, 1, 0.1);
        if (phase === 'count' && Math.random() < 0.7) { const s = Math.random() < 0.5 ? 1 : -1; puff(s * 2.0 * C45, 0.55, -s * 2.0 * C45, s * 0.6, 0.6, -s * 0.6, 0xc8beae, 1.1, 0.09, 2, 0.15); }
        // smoke BILLOWING out of both trench ends: dense while the rocket grinds off the pad
        if (lit > 0.05) {
          const dense = phase === 'ignite' || (flyer && flyer.flyT < 1.6) ? 3 : 1;
          for (let i = 0; i < dense; i++) {
            const s = Math.random() < 0.5 ? 1 : -1, sp = 2.4 + Math.random() * 2.6;
            puff(s * 1.6 * C45, 0.65, -s * 1.6 * C45, s * sp * C45, 0.5 + Math.random() * 0.9, -s * sp * C45, Math.random() < 0.25 ? 0xffa040 : (Math.random() < 0.5 ? 0x9a9284 : 0x6e665c), 2.0, 0.16, 2, 0.3, -0.07);
          }
          if (Math.random() < 0.5) K.spawn(g, K.R() * 0.6, 0.6, K.R() * 0.6, K.R() * 2, 0.3, K.R() * 2, 0xffd27a, 0.5, 0.06, 1, true);
        }
        // lingering exhaust column along the flight path
        if (flyer && flyer.flyT < 4.5) {
          const y = flyer.rk.position.y - 0.7;
          puff(0, y, 0, 0, -0.3, 0, Math.random() < 0.3 ? 0xffb050 : 0xa49c8e, 2.6, 0.15, 2, 0.3, -0.03);
          if (y < 14) puff(K.R() * 0.6, y, K.R() * 0.6, K.R() * 0.4, 0.05, K.R() * 0.4, 0x8a8276, 3.4, 0.17, 1, 0.4, -0.02);
        }
        // embers + heat shimmer from the trench after the burn
        if (heat > 0.15 && Math.random() < heat) { const s = Math.random() < 0.5 ? 1 : -1, u = 1.3 + Math.random() * 1.3; K.spawn(g, s * u * C45 + K.R() * 0.3, 0.5, -s * u * C45 + K.R() * 0.3, K.R() * 0.2, 0.5 + Math.random() * 0.6, K.R() * 0.2, Math.random() < 0.6 ? 0xff8a2a : 0xffd27a, 1.2, 0.04, -0.05, true); }
        if (resetPhase === 'rise' && Math.random() < 0.8) puff(K.R() * 2.2, 0.3, K.R() * 2.2, K.R() * 0.4, 0.9, K.R() * 0.4, 0xb8ac98, 1.6, 0.1, 2, 0.3);
        if (resetPhase === 'drop' && Math.random() < 0.6) puff(K.R() * 1.4, 0.4, K.R() * 1.4, K.R() * 0.3, 1.2, K.R() * 0.3, 0x6e665a, 1.8, 0.11, 2, 0.3);
      }
      // shipped: signal flare from the clock tower + burst high over the pad
      if (celebrateT >= 0) {
        const c0 = celebrateT; celebrateT += dt;
        const ckx = CLOCK[0], ckz = CLOCK[1];
        if (c0 < 0.6) { const k = c0 / 0.6; K.spawn(g, ckx + K.R() * 0.1, 4.0 + k * 5.0, ckz + K.R() * 0.1, K.R() * 0.3, -0.5, K.R() * 0.3, 0xffd890, 0.6, 0.07, 0, true); }
        if (c0 < 0.6 && celebrateT >= 0.6) {
          for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.57, sp = 2 + Math.random() * 2.5; K.spawn(g, ckx, 9.0, ckz, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 0.5, Math.sin(a) * Math.cos(b) * sp, i % 3 ? 0x46ff8a : (i % 2 ? 0xffd27a : 0xffffff), 1.3 + Math.random() * 0.6, 0.09, 2.2, true); }
        }
        if (celebrateT > 2.6) celebrateT = -1;
      }

      // ------------------------------------------------ STATE + HUD DETAIL
      const id = (cur && cur.item) ? cur.item.label() : held ? held.label() : (flyer && flyer.item) ? flyer.item.label() : '';
      let st = 'WORKING', det = '';
      if (blk && (phase === 'hold' || phase === 'count')) det = id + ' · T-0 · awaiting your go';
      else if (blk && (phase === 'climb' || flyer) && !resetPhase) det = 'held before the reset';
      else if (blk && phase === 'charge') det = id + ' · charge held';
      else if (blk && (phase === 'loading' || craneMode !== 'rest')) det = (id || 'PR') + ' · loading held';
      else if (blk && phase === 'ready') det = 'pad held';
      else if (phase === 'loading') det = id + (seal > 0 ? ' · sealing the hatch' : ' · loading the rocket');
      else if (standby) det = id + ' · charged, waiting for the deploy';
      else if (phase === 'charge') det = id + ' · charging the coils';
      else if (phase === 'count') det = id + ' · T-' + countN;
      else if (phase === 'ignite') det = id + ' · ignition';
      else if (phase === 'climb' && flyer && flyer.item) det = flyer.item.label() + ' · liftoff!';
      else if (resetPhase) det = held ? held.label() + ' · waiting for the next rocket' : 'shipped · next rocket rising';
      else if (phase === 'climb') det = 'shipped · clearing the pad';
      else if (craneMode === 'fetch') det = (held ? held.label() : 'PR') + ' · crane picking up';
      else if (craneMode === 'hold' || craneMode === 'insert') det = (held ? held.label() : id) + ' · loading the rocket';
      else if (celebrateT >= 0) det = 'shipped! · pad clear';
      else { st = 'IDLE'; det = 'pad clear, waiting for a PR'; }
      M.setState(st, det);
      lamp.set(M.stateShown, t);
      caution.update(t, dt, M.stateShown);
    } };
    // rocket-local side direction (angle a around the hull) -> g-local xz unit vector
    function rootDirLocal(a) { const x = Math.sin(a), z = Math.cos(a); const c = Math.cos(THETA), s = Math.sin(THETA); return [x * c + z * s, -x * s + z * c]; }
  });

  // =====================================================================
  // ORBIT WATCH
  // =====================================================================
  IRON.machine('orbit', function (K, M) {
    const T = K.THREE;
    const dyn = K.dyn;
    const { C, MT, deckTop } = art(K);
    const { band, rivetRing, gear, hazardStripe, nixieRow, setRow, plate, strut, lampSet, palettize, fold } = tools(K);
    const g = K.group();
    const S = K.group(g);
    const V = new T.Vector3(), V2 = new T.Vector3();
    const TOP = 0.43;
    function puff(x, y, z, vx, vy, vz, col, life, size, n, spread) {
      for (let i = 0; i < (n || 2); i++) K.spawn(g, x + K.R() * (spread || 0.15), y, z + K.R() * (spread || 0.15), vx + K.R() * 0.3, vy + K.R() * 0.3, vz + K.R() * 0.3, col, life * (0.8 + Math.random() * 0.4), size * (0.7 + Math.random() * 0.5), -0.1);
    }

    // ---------- PLINTH: an octagonal iron observation deck (kept round: the deck's right end is close) ----------
    K.cyl(2.2, 2.32, 0.34, MT.ironM, 8, 0, 0.17, 0, S).rotation.y = Math.PI / 8;
    K.cyl(2.3, 2.3, 0.06, MT.brassD, 8, 0, 0.37, 0, S).rotation.y = Math.PI / 8;
    K.cyl(2.16, 2.16, 0.05, deckTop, 8, 0, 0.405, 0, S).rotation.y = Math.PI / 8;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; K.box(0.26, 0.04, 0.11, i % 2 ? MT.soot : MT.hazard, Math.cos(a) * 1.92, TOP + 0.005, Math.sin(a) * 1.92, S).rotation.y = -a; }
    for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * Math.PI * 2; K.box(0.06, 0.06, 0.06, MT.brassL, Math.cos(a) * 2.24, 0.41, Math.sin(a) * 2.24, S); }
    for (const [x, z, sx, sz] of [[1.1, 1.2, 0.3, 0.2], [-1.3, -0.2, 0.22, 0.16]]) { const p = K.sph(1, MT.oil, x, TOP + 0.002, z, S, 12, 4); p.scale.set(sx, 0.012, sz); p.castShadow = false; }
    for (let i = 0; i < 6; i++) { const a = K.rnd() * 6.28, rr = 0.9 + K.rnd() * 0.9; const d = K.box(0.3 + K.rnd() * 0.4, 0.01, 0.2 + K.rnd() * 0.25, MT.grime, Math.cos(a) * rr, TOP + 0.004, Math.sin(a) * rr, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
    // rim lamps: the watch, 3 hours each (amber while it runs, green when it clears, red strobe on an alert)
    const rimPts = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 4 - i / 8 * Math.PI * 2, x = Math.cos(a) * 2.2, z = Math.sin(a) * 2.2;
      K.cyl(0.08, 0.1, 0.08, MT.iron, 8, x, TOP + 0.03, z, S);
      rimPts.push([x, TOP + 0.12, z]);
    }
    const rimLamps = lampSet(g, rimPts, 0.08, 0x2a1a08);
    // red flood wash while an alert is up
    const washM = K.glow(0xff2a10, 0, true);
    const wash = dyn(K.cyl(2.1, 2.1, 0.02, washM, 8, 0, TOP + 0.02, 0, g)); wash.rotation.y = Math.PI / 8; wash.castShadow = false; wash.visible = false;

    // ---------- RADAR MAST + DISH (tracks the last rocket) ----------
    const MX = -0.85, MZ = -0.85, MH = 2.55;
    const MS = K.group(S, MX, TOP, MZ);
    for (const sx of [-0.32, 0.32]) for (const sz of [-0.32, 0.32]) { K.box(0.11, MH, 0.11, MT.oxide, sx, MH / 2, sz, MS); K.box(0.22, 0.1, 0.22, MT.ironM, sx, 0.05, sz, MS); }
    for (let y = 0.4, k = 0; y < MH - 0.3; y += 0.6, k++) {
      for (const [x, z, ry] of [[0, 0.32, 0], [0, -0.32, 0], [0.32, 0, Math.PI / 2], [-0.32, 0, Math.PI / 2]]) {
        const br = K.box(0.05, 0.86, 0.05, MT.oxideD, x, y + 0.3, z, MS); br.rotation.set(0, ry, (k % 2 ? 1 : -1) * 0.8);
        K.box(0.68, 0.06, 0.06, MT.oxideD, x, y, z, MS).rotation.y = ry;
      }
    }
    for (let y = 0.25; y < MH - 0.1; y += 0.2) K.box(0.36, 0.03, 0.03, MT.ironL, 0, y, 0.38, MS);   // ladder on the front
    for (const x of [-0.17, 0.17]) K.box(0.03, MH, 0.03, MT.ironL, x, MH / 2, 0.38, MS);
    K.box(0.96, 0.08, 0.96, MT.ironM, 0, MH, 0, MS);
    for (const [x, z] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46], [0, 0.46], [0.46, 0]]) K.box(0.04, 0.3, 0.04, MT.ironL, x, MH + 0.15, z, MS);
    for (const s of [-1, 1]) { K.box(0.04, 0.04, 0.96, MT.ironL, s * 0.46, MH + 0.29, 0, MS); K.box(0.96, 0.04, 0.04, MT.ironL, 0, MH + 0.29, s * 0.46, MS); }
    hazardStripe(MS, 0.9, 0, MH - 0.07, 0.49, 8, 0, 0.06);
    K.cyl(0.3, 0.34, 0.12, MT.brassD, 12, 0, MH + 0.1, 0, MS);
    gear(MS, 0.27, 0.06, 14, MT.brass, 0, MH + 0.19, 0);
    // alert beacon on the platform corner
    const beaconM = K.mat(0x401010, { e: 0 });
    K.cyl(0.05, 0.06, 0.16, MT.iron, 6, MX + 0.4, TOP + MH + 0.12, MZ + 0.4, S);
    const beaconSpin = dyn(K.group(g, MX + 0.4, TOP + MH + 0.27, MZ + 0.4)); K.box(0.2, 0.13, 0.06, beaconM, 0.05, 0, 0, beaconSpin);
    const beaconDomeM = K.glow(0xff3020, 0.12); K.sph(0.14, beaconDomeM, MX + 0.4, TOP + MH + 0.27, MZ + 0.4, g, 8, 6).castShadow = false;
    // azimuth turret -> elevation yoke -> dish (opens toward +z of the yoke)
    const azG = dyn(K.group(g, MX, TOP + MH + 0.22, MZ));
    K.cyl(0.13, 0.17, 0.26, MT.ironL, 8, 0, 0.13, 0, azG);
    K.box(0.9, 0.08, 0.16, MT.oxide, 0, 0.28, 0, azG);
    for (const s of [-1, 1]) { K.box(0.08, 0.46, 0.15, MT.oxide, s * 0.42, 0.5, 0, azG); K.cyl(0.07, 0.07, 0.06, MT.brassL, 8, s * 0.47, 0.66, 0, azG).rotation.z = Math.PI / 2; }
    const PIVY = TOP + MH + 0.22 + 0.66;
    const elG = dyn(K.group(azG, 0, 0.66, 0));
    K.cyl(0.05, 0.05, 0.9, MT.brassL, 6, 0, 0, 0, elG).rotation.z = Math.PI / 2;
    K.box(0.22, 0.2, 0.26, MT.ironM, 0, 0, -0.05, elG);   // drive box behind the dish
    K.cyl(0.05, 0.05, 0.3, MT.ironM, 6, 0, -0.05, -0.3, elG).rotation.x = Math.PI / 2;
    K.box(0.18, 0.18, 0.18, MT.iron, 0, -0.05, -0.48, elG);   // counterweight
    const DG = K.group(elG, 0, 0, 0.1); DG.rotation.x = Math.PI / 2;  // lathe +y -> +z
    K.lathe([[0.05, 0], [0.26, 0.03], [0.48, 0.11], [0.66, 0.22], [0.78, 0.31]], MT.brassBowl, 14, 0, 0, 0, DG);
    K.torus(0.78, 0.035, MT.brassD, 4, 18, 0, 0.31, 0, DG).rotation.x = Math.PI / 2;
    K.cyl(0.14, 0.18, 0.12, MT.ironM, 8, 0, -0.03, 0, DG);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; strut(DG, [Math.cos(a) * 0.12, -0.04, Math.sin(a) * 0.12], [Math.cos(a) * 0.74, 0.27, Math.sin(a) * 0.74], 0.035, MT.brassD); }
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; strut(DG, [Math.cos(a) * 0.72, 0.3, Math.sin(a) * 0.72], [0, 0.78, 0], 0.025, MT.ironL); }
    K.cyl(0.05, 0.08, 0.16, MT.brassL, 8, 0, 0.8, 0, DG);
    const feedM = K.glow(0x1e4a40);
    K.sph(0.06, feedM, 0, 0.71, 0, DG, 8, 6).castShadow = false;
    // radar pings: rings that leave the dish along its axis
    const pings = [0, 1, 2].map(() => { const m = K.glow(0x7af0d8, 0, true); const r = dyn(K.torus(0.5, 0.03, m, 4, 20, 0, 0, 0.6, elG)); r.castShadow = false; r.visible = false; return { r, m, k: -1 }; });
    let pingT = 0, pingI = 0;

    // ---------- TELESCOPE (follows the dish) ----------
    const TX = -0.45, TZ = 0.95;
    const TP = K.group(S, TX, TOP, TZ);
    K.cyl(0.2, 0.24, 0.08, MT.iron, 8, 0, 0.04, 0, TP);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; strut(TP, [Math.cos(a) * 0.46, 0.0, Math.sin(a) * 0.46], [Math.cos(a) * 0.06, 0.86, Math.sin(a) * 0.06], 0.045, MT.oxideD); K.box(0.1, 0.05, 0.1, MT.brassD, Math.cos(a) * 0.46, 0.025, Math.sin(a) * 0.46, TP); }
    K.cyl(0.07, 0.09, 0.3, MT.ironM, 8, 0, 0.78, 0, TP);
    band(TP, 0.1, 0.64, MT.brassD, 0.05);
    const tAz = dyn(K.group(g, TX, TOP + 0.96, TZ));
    K.cyl(0.15, 0.15, 0.08, MT.brass, 10, 0, 0, 0, tAz);
    for (const s of [-1, 1]) K.box(0.05, 0.34, 0.09, MT.brassD, s * 0.2, 0.17, 0, tAz);
    const tEl = dyn(K.group(tAz, 0, 0.3, 0));
    K.cyl(0.035, 0.035, 0.46, MT.brassL, 6, 0, 0, 0, tEl).rotation.z = Math.PI / 2;
    K.cyl(0.15, 0.11, 1.5, MT.brass, 10, 0, 0, 0.25, tEl).rotation.x = Math.PI / 2;
    for (const z of [-0.25, 0.3, 0.75]) K.cyl(0.16, 0.16, 0.06, MT.brassD, 10, 0, 0, z, tEl).rotation.x = Math.PI / 2;
    K.cyl(0.19, 0.17, 0.24, MT.brassD, 10, 0, 0, 1.06, tEl).rotation.x = Math.PI / 2;
    const lensM = K.glow(0x2a5a50);
    K.cyl(0.14, 0.14, 0.02, lensM, 10, 0, 0, 1.18, tEl).rotation.x = Math.PI / 2;
    K.cyl(0.05, 0.055, 0.2, MT.ironL, 6, 0, -0.03, -0.6, tEl).rotation.x = Math.PI / 2;   // eyepiece
    K.cyl(0.04, 0.04, 0.5, MT.brassL, 6, 0, 0.2, 0.3, tEl).rotation.x = Math.PI / 2;      // finder scope
    K.box(0.03, 0.09, 0.03, MT.ironL, 0, 0.14, 0.3, tEl);

    // ---------- DRUM RECORDER (the log: a quiet ink trace; red spikes on an alert) ----------
    const RCX = 1.3, RCZ = 0.35;
    const RC = K.group(S, RCX, TOP, RCZ); RC.rotation.y = Math.PI / 4; RC.scale.setScalar(1.25);
    K.box(1.0, 0.6, 0.56, MT.iron, 0, 0.3, 0, RC);
    K.box(1.06, 0.06, 0.62, MT.brassD, 0, 0.63, 0, RC);
    K.box(0.92, 0.03, 0.02, MT.brassL, 0, 0.5, 0.29, RC);
    for (const x of [-0.24, 0.24]) { K.box(0.4, 0.18, 0.02, MT.ironL, x, 0.22, 0.29, RC); K.box(0.12, 0.03, 0.04, MT.brassL, x, 0.22, 0.31, RC); }
    for (const [x, y] of [[-0.46, 0.06], [0.46, 0.06], [-0.46, 0.56], [0.46, 0.56]]) K.box(0.05, 0.05, 0.05, MT.brassL, x, y, 0.29, RC);
    plate(RC, 'ORBIT WATCH', 0.1, 0, 0.385, 0.3);
    const paperTex = K.canvasTex(128, 64, (c) => {
      c.fillStyle = '#e8dcb8'; c.fillRect(0, 0, 128, 64);
      c.fillStyle = 'rgba(120,90,50,0.35)'; for (let x = 0; x < 128; x += 8) c.fillRect(x, 0, 1, 64); for (let y = 4; y < 64; y += 8) c.fillRect(0, y, 128, 1);
      c.fillStyle = '#2a1c10'; // top half: the quiet trace (Sentry quiet, metric back)
      let s = 3; const rr = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      for (let x = 0; x < 128; x++) { const y = 20 + Math.round(Math.sin(x * 0.2) * 1.5 + (rr() - 0.5) * 2); c.fillRect(x, y, 1, 2); }
      c.fillStyle = '#b01808'; // bottom half: the comeback (red spikes)
      let py = 52;
      for (let x = 0; x < 128; x++) { const y = x % 9 < 2 ? 34 + Math.round(rr() * 8) : 50 + Math.round((rr() - 0.5) * 6); const y0 = Math.min(py, y), y1 = Math.max(py, y); c.fillRect(x, y0, 1, y1 - y0 + 1); py = y; }
    });
    paperTex.repeat.set(1, 0.5); paperTex.offset.set(0, 0.5);
    const paperM = K.mat(0xffffff, { map: paperTex, e: 0x000000 });
    K.cyl(0.07, 0.07, 0.08, MT.brassD, 8, -0.2, 0.68, 0.02, RC);
    K.cyl(0.19, 0.19, 0.36, paperM, 16, -0.2, 0.9, 0.02, RC);
    for (const y of [0.71, 1.09]) K.cyl(0.2, 0.2, 0.025, MT.brass, 16, -0.2, y, 0.02, RC);
    K.cyl(0.03, 0.03, 0.12, MT.brassL, 6, -0.2, 1.15, 0.02, RC);
    K.box(0.56, 0.5, 0.5, MT.glass, -0.05, 0.92, 0.02, RC).castShadow = false;   // glass hood
    // pen arm: pivots on a brass post right of the drum, the nib rides the paper's front
    K.cyl(0.04, 0.05, 0.36, MT.brassD, 6, 0.24, 0.84, 0.16, RC);
    const pen = dyn(K.group(RC, 0.24, 0.98, 0.16));
    K.box(0.42, 0.02, 0.02, MT.brassL, -0.21, 0, 0, pen);
    const nibM = K.mat(0x8a1010, { e: 0x300000 });
    K.box(0.04, 0.04, 0.03, nibM, -0.42, -0.01, 0.05, pen);
    K.cyl(0.035, 0.035, 0.05, MT.brass, 8, 0, 0, 0, pen).rotation.x = Math.PI / 2;
    // a little steam stack (vents on an alert)
    K.cyl(0.05, 0.05, 0.3, MT.copper, 6, 0.38, 0.8, -0.14, RC); K.cyl(0.07, 0.05, 0.08, MT.brassL, 8, 0.38, 0.97, -0.14, RC);
    RC.updateMatrix(); const ventLocal = new T.Vector3(0.38, 1.02, -0.14).applyMatrix4(RC.matrix);

    // ---------- 24 H DIAL PILLAR + ORRERY (one bead per launch in orbit) ----------
    const DPX = 0.55, DPZ = -1.55;
    const DP = K.group(S, DPX, TOP, DPZ); DP.rotation.y = Math.PI / 4;
    K.box(0.62, 0.22, 0.62, MT.iron, 0, 0.11, 0, DP);
    K.box(0.5, 1.62, 0.5, MT.brick, 0, 1.0, 0, DP);
    for (const y of [0.36, 1.0, 1.66]) K.box(0.54, 0.05, 0.54, MT.brassD, 0, y, 0, DP);
    K.box(0.6, 0.12, 0.6, MT.brassD, 0, 1.86, 0, DP);
    const DY = 2.32;
    K.torus(0.42, 0.05, MT.brass, 6, 20, 0, DY, 0.24, DP);
    const dialFaceM = K.mat(C.cream, { e: 0 });
    K.cyl(0.4, 0.4, 0.06, dialFaceM, 20, 0, DY, 0.2, DP).rotation.x = Math.PI / 2;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; K.box(i % 6 ? 0.02 : 0.035, i % 6 ? 0.05 : 0.1, 0.02, MT.soot, Math.sin(a) * 0.33, DY + Math.cos(a) * 0.33, 0.24, DP).rotation.z = -a; }
    K.box(0.06, 0.06, 0.02, MT.red, 0, DY + 0.25, 0.245, DP);
    const hand = dyn(K.group(DP, 0, DY, 0.26)); K.box(0.04, 0.3, 0.02, MT.handRed, 0, 0.13, 0, hand); K.box(0.07, 0.07, 0.03, MT.brassL, 0, 0, 0.01, hand);
    // nixie board: hours left on the oldest watch ('CLr' when it clears, 'Err' on an alert)
    K.box(0.46, 0.26, 0.16, MT.brassD, 0, 1.36, 0.3, DP);
    for (let i = 0; i < 3; i++) K.cyl(0.065, 0.065, 0.22, MT.glass, 10, -0.13 + i * 0.13, 1.37, 0.4, DP).castShadow = false;
    const watchRow = nixieRow(DP, [-0.13, 0, 0.13], 1.37, 0.41, 0.1, 0.17);
    // orrery on top: brass globe, tilted ring, a bead per launch being watched
    K.cyl(0.04, 0.05, 0.3, MT.brassD, 6, 0, DY + 0.55, 0, DP);
    K.sph(0.11, MT.brass, 0, DY + 0.78, 0, DP, 10, 8);
    const ringG = K.group(DP, 0, DY + 0.78, 0); ringG.rotation.set(0.35, 0, 0.25);
    K.torus(0.34, 0.018, MT.brassL, 4, 24, 0, 0, 0, ringG).rotation.x = Math.PI / 2;
    const orb = dyn(K.group(ringG, 0, 0, 0));
    const beadM = K.glow(0x46ff8a);
    const orbBeads = new T.InstancedMesh(new T.SphereGeometry(0.055, 6, 4), beadM, 5);    // one per launch in orbit (count = how many)
    { const mx = new T.Matrix4(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; orbBeads.setMatrixAt(i, mx.makeTranslation(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34)); } }
    orbBeads.count = 0; orbBeads.castShadow = orbBeads.receiveShadow = false; orbBeads.computeBoundingSphere(); orb.add(orbBeads); dyn(orbBeads);

    // ---------- STATUS + CAUTION ----------
    const lamp = K.statusLamp(g, 1.95, TOP, 1.2, 1.0);
    const caution = K.caution(g, -1.5, TOP, 1.42, 0.75);
    palettize(g); fold(g);

    // =====================================================================
    // THE WATCH. What's real wins: the driver's orbit() hook, else the factory state's own watches
    // (items[].orbit). The auto driver plays a watch out for each launch it ships, and now and then
    // one comes back.
    // =====================================================================
    const auto = () => IRON.driver === IRON.AUTO;
    const WATCH_S = 36;          // auto: 24 h squeezed into this many seconds
    const ALERT_S = 9;           // auto: a comeback sounds the alarm this long (then it's back on the rework belt)
    const FRESH_MS = 10 * 60e3;  // real: a comeback this recent still sounds it
    const watches = [];          // auto: { num, t0 } oldest first
    const fresh = [];
    let clock = 0, clearT = -1, newT = -1, alertT = -1, alertNum = 0, prevN = -1;
    IRON.on('ship', (d) => fresh.push(d && d.item ? d.item.num : 0));
    // the factory's own record, when the game's driver carries one (rescanned only when a new state arrives)
    let rFs = null, rScan = null;
    function realWatch() {
      const d = IRON.driver;
      const fs = d && d !== IRON.AUTO && d.state && typeof d.state === 'object' && Array.isArray(d.state.items) ? d.state : null;
      if (!fs) return undefined;
      if (fs !== rFs) {
        rFs = fs;
        let n = 0, soon = null, bad = null;
        for (const r of fs.items) {
          const o = r && r.orbit; if (!o) continue;
          if (o.state === 'watching') { n++; if (!soon || o.until < soon.until) soon = o; }
          else if (o.state === 'regressed' && o.at && (!bad || o.at > bad.at)) bad = { at: o.at, num: o.prNumber || r.prNumber || 0 };
        }
        const rec = Array.isArray(fs.stations) ? fs.stations.find((s) => s && s.kind === 'orbit') : null;
        if (!n && rec && rec.wip > 0) n = rec.wip;
        rScan = { n, soon, bad };
      }
      const now = Date.now(), { n, soon, bad } = rScan;
      return {
        watching: n,
        progress: soon ? (now - soon.since) / Math.max(1, soon.until - soon.since) : 0,
        hoursLeft: soon ? Math.max(0, (soon.until - now) / 3.6e6) : undefined,
        alert: bad && now - bad.at < FRESH_MS ? (bad.num ? '#' + bad.num + ' came back' : 'a launch came back') : null,
      };
    }
    let az = Math.PI / 4 + 0.25, el = 0.72, taz = Math.PI / 4 + 0.37, tel = 0.58, padAz = null;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let tPuff = 0, drumU = 0;

    return { g, update(t, dt) {
      const blk = M.blocked;
      const live = blk ? 0 : dt;
      clock += live;
      // ---- what's in orbit
      const hook = typeof IRON.driver.orbit === 'function' ? IRON.driver.orbit(IRON.stations[M.id]) : undefined;
      const ext = hook !== undefined ? hook : realWatch();
      const sim = ext === undefined;
      while (fresh.length) { const num = fresh.shift(); if (sim) watches.push({ num, t0: clock }); }
      if (!sim) watches.length = 0;
      for (let i = watches.length - 1; i >= 0; i--) {
        if (clock - watches[i].t0 < WATCH_S) continue;
        const w = watches.splice(i, 1)[0];
        if (auto() && (!IRON.policy || IRON.policy.events) && alertT < 0 && Math.random() < 0.15) { alertT = 0; alertNum = w.num; }   // it came back
      }
      if (alertT >= 0) { alertT += live; if (alertT > ALERT_S) alertT = -1; }
      let n, prog, hoursLeft, alertText;
      if (!sim) {
        n = ext ? Math.max(0, ext.watching | 0) : 0;
        prog = ext ? Math.max(0, Math.min(1, ext.progress || 0)) : 0;
        hoursLeft = ext && ext.hoursLeft != null ? Math.ceil(ext.hoursLeft) : Math.ceil(24 * (1 - prog));
        alertText = ext && ext.alert ? (typeof ext.alert === 'string' ? ext.alert : 'a launch came back') : null;
      } else {
        n = watches.length;
        prog = n ? Math.min(1, (clock - watches[0].t0) / WATCH_S) : 0;
        hoursLeft = Math.ceil(24 * (1 - prog));
        alertText = alertT >= 0 ? (alertNum ? '#' + alertNum + ' came back' : 'a launch came back') : null;
      }
      if (prevN >= 0 && n > prevN) newT = 0;
      if (prevN >= 0 && n < prevN && !alertText) clearT = 0;
      prevN = n;
      if (clearT >= 0) clearT += dt; if (clearT > 2.5) clearT = -1;
      if (newT >= 0) newT += dt; if (newT > 1.5) newT = -1;
      const watching = n > 0;
      const alarm = blk || !!alertText;   // a comeback wears the stopped look: red strobes, wash, beacon, the pen scribbling

      // ---- aim: the rocket in the air, else a slow sweep where the watched launches went, parked when idle
      if (padAz === null && shared.pad) { shared.pad.getWorldPosition(V); g.worldToLocal(V); padAz = Math.atan2(V.x - MX, V.z - MZ); }
      const pa = padAz === null ? -0.6 : padAz;
      let wantAz, wantEl;
      if (alarm) { wantAz = pa + Math.sin(t * 2.3) * 1.1 + Math.sin(t * 7.1) * 0.08; wantEl = 0.35 + Math.sin(t * 3.1) * 0.15; }
      else if (shared.rocket && shared.rocket.visible) {
        shared.rocket.getWorldPosition(V); g.worldToLocal(V); V.x -= MX; V.y -= PIVY; V.z -= MZ;
        wantAz = Math.atan2(V.x, V.z); wantEl = Math.atan2(V.y, Math.hypot(V.x, V.z));
      } else if (watching) { wantAz = pa + 0.5 + Math.sin(clock * 0.21) * 0.7; wantEl = 0.95 + Math.sin(clock * 0.37) * 0.2; }
      else { wantAz = Math.PI / 4 + 0.25 + Math.sin(t * 0.05) * 0.08; wantEl = 0.72; }
      const k1 = Math.min(1, dt * (alarm ? 6 : 2.2));
      az += wrap(wantAz - az) * k1; el += (wantEl - el) * k1;
      azG.rotation.y = az; elG.rotation.x = -el;
      const k2 = Math.min(1, dt * 1.1);
      taz += wrap(wantAz + 0.12 - taz) * k2; tel += (Math.min(1.1, wantEl * 0.8) - tel) * k2;
      tAz.rotation.y = taz; tEl.rotation.x = -tel;

      // ---- pings while tracking
      pingT -= dt;
      if (!alarm && watching && pingT <= 0) { pingT = shared.rocket ? 0.45 : 1.3; const p = pings[pingI++ % pings.length]; p.k = 0; }
      pings.forEach((p) => {
        if (p.k < 0) { p.r.visible = false; return; }
        p.k += dt / 1.1; if (p.k >= 1) { p.k = -1; p.r.visible = false; return; }
        p.r.visible = true; p.r.position.z = 0.5 + p.k * 1.5; p.r.scale.setScalar(0.9 + p.k * 0.8); p.m.opacity = 0.6 * (1 - p.k) * (1 - p.k);
      });
      feedM.color.setHex(alarm ? (Math.sin(t * 10) > 0 ? 0xff3020 : 0x400808) : watching ? (Math.sin(t * 5) > 0 ? 0x9afff0 : 0x3aa890) : 0x1e4a40);
      lensM.color.setHex(alarm ? 0x6a1a10 : watching ? 0x5ae0c8 : 0x2a5a50);

      // ---- the drum and its pen (the red half of the paper is the comeback's trace)
      drumU += live * (watching && !alarm ? 0.05 : alarm ? 0.0 : 0.01) + (alarm ? dt * 0.12 : 0);
      paperTex.offset.set(drumU % 1, alarm ? 0 : 0.5);
      paperM.emissive.setHex(alarm ? (Math.sin(t * 8) > 0 ? 0x3a0804 : 0) : watching ? 0x14100a : 0);
      pen.rotation.z = alarm ? Math.sin(t * 37) * 0.18 + Math.sin(t * 23) * 0.1 : watching ? Math.sin(t * 3.1) * 0.02 + Math.sin(t * 7.3) * 0.01 : 0;
      nibM.emissive.setHex(alarm ? 0xff2010 : watching ? 0x401008 : 0x200000);

      // ---- dial, nixies, rim lamps, orrery
      const clr = clearT >= 0 && !alarm;
      hand.rotation.z = -prog * Math.PI * 2;
      dialFaceM.emissive.setHex(alarm ? (Math.sin(t * 6) > 0 ? 0x9a1008 : 0x3a0402) : clr ? 0x1a4a20 : watching ? 0x2a1c08 : 0);
      const blink = Math.sin(t * 8) > 0;
      if (alarm) setRow(watchRow, blink ? 'Err' : '   ', 1, 0xff8060);
      else if (clr) setRow(watchRow, 'CLr', blink ? 1 : 0.7, 0xc0ffd0);
      else if (watching) setRow(watchRow, String(Math.max(0, Math.min(99, hoursLeft))).padStart(2, '0') + 'h', newT >= 0 ? (blink ? 1 : 0.5) : 0.9);
      else setRow(watchRow, '---', 0.25);
      const litN = Math.ceil((1 - prog) * 8);
      for (let i = 0; i < 8; i++) {
        let c = 0x2a1a08;
        if (alarm) c = Math.sin(t * 12 + (i % 2) * Math.PI) > 0 ? 0xff2010 : 0x3a0a04;
        else if (clr) c = blink ? 0x46ff8a : 0x1a5a2a;
        else if (watching) c = i < litN ? (i === litN - 1 && Math.sin(t * 4) > 0 ? 0xffd070 : 0xffa030) : 0x3a2410;
        rimLamps.set(i, c);
      }
      orb.rotation.y += dt * (blk ? 0 : alertText ? 2.4 : 0.6);
      orbBeads.count = Math.min(5, n + (alertText ? 1 : 0));   // the one that came back stays on the ring, red, while it sounds
      beadM.color.setHex(alarm ? (blink ? 0xff3020 : 0x601008) : newT >= 0 && blink ? 0xffffff : 0x46ff8a);

      // ---- alarm
      beaconSpin.rotation.y += dt * (alarm ? 11 : 0);
      beaconM.emissive.setHex(alarm ? (Math.sin(t * 9) > -0.2 ? 0xff2010 : 0x300808) : 0);
      beaconDomeM.opacity = alarm ? 0.6 : 0.12;
      wash.visible = alarm;
      if (alarm) washM.opacity = (Math.sin(t * 9) > 0 ? 1 : 0.35) * 0.22;
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = 0.06;
        if (alarm) puff(ventLocal.x, ventLocal.y, ventLocal.z, 0.2, 1.8, 0.2, 0xf0ece4, 1.4, 0.1, 2, 0.1);
        else if (clr && Math.random() < 0.5) K.spawn(g, DPX + K.R() * 0.3, TOP + DY + 0.8, DPZ + K.R() * 0.3, K.R() * 1.4, 1 + Math.random(), K.R() * 1.4, Math.random() < 0.6 ? 0x46ff8a : 0xffd27a, 0.9, 0.05, 2, true);
      }

      // ---- state (a comeback reads as BLOCKED: the lamp, the caution post and the shaft's aura all call for you)
      if (alertText) M.setState('BLOCKED', alertText + ' · reworking');
      else if (watching) M.setState('WORKING', 'watching ' + n + ' launch' + (n > 1 ? 'es' : '') + ' · ' + Math.max(0, hoursLeft) + 'h left');
      else M.setState('IDLE', clr ? 'all clear · nothing in orbit' : 'nothing in orbit');
      lamp.set(M.stateShown, t);
      caution.update(t, dt, M.stateShown);
    } };
  });

  // =====================================================================
  // MEASURE
  // =====================================================================
  IRON.machine('measure', function (K, M) {
    const T = K.THREE;
    const dyn = K.dyn;
    const { C, MT, deckPlate } = art(K);
    const { band, gear, hazardStripe, nixieRow, setRow, plate, strut, lampSet, palettize, fold } = tools(K);
    const g = K.group();
    const S = K.group(g);
    const TOP = 0.4;
    function puff(x, y, z, vx, vy, vz, col, life, size, n, spread) {
      for (let i = 0; i < (n || 2); i++) K.spawn(g, x + K.R() * (spread || 0.15), y, z + K.R() * (spread || 0.15), vx + K.R() * 0.3, vy + K.R() * 0.3, vz + K.R() * 0.3, col, life * (0.8 + Math.random() * 0.4), size * (0.7 + Math.random() * 0.5), -0.1);
    }

    // ---------- PLINTH (square; its corners stay on the deck at the left end) ----------
    K.box(3.2, 0.3, 3.2, MT.ironM, 0, 0.15, 0, S);
    K.box(3.28, 0.06, 3.28, MT.brassD, 0, 0.33, 0, S);
    K.box(3.06, 0.04, 3.06, deckPlate, 0, 0.38, 0, S);
    hazardStripe(S, 3.0, 0, 0.18, 1.62, 14, 0, 0.16);
    hazardStripe(S, 3.0, 1.62, 0.18, 0, 14, Math.PI / 2, 0.16);
    for (let i = 0; i < 9; i++) { K.box(0.07, 0.07, 0.07, MT.brassL, -1.5 + i * 0.375, 0.3, 1.65, S); K.box(0.07, 0.07, 0.07, MT.brassL, 1.65, 0.3, -1.5 + i * 0.375, S); }
    for (const [x, z, sx, sz] of [[0.9, 0.2, 0.3, 0.2], [-0.4, 1.2, 0.24, 0.16]]) { const p = K.sph(1, MT.oil, x, TOP + 0.002, z, S, 12, 4); p.scale.set(sx, 0.012, sz); p.castShadow = false; }
    for (let i = 0; i < 6; i++) { const d = K.box(0.3 + K.rnd() * 0.5, 0.01, 0.2 + K.rnd() * 0.3, MT.grime, -1.2 + K.rnd() * 2.6, TOP + 0.004, -1.2 + K.rnd() * 2.6, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
    const washM = K.glow(0xff2a10, 0, true);
    const wash = dyn(K.box(3.0, 0.02, 3.0, washM, 0, TOP + 0.02, 0, g)); wash.castShadow = false; wash.visible = false;

    // ---------- GAUGE BOARD (faces the camera): HURT · FLAT · LIFT dial, BEFORE / AFTER tubes, nixies ----------
    const B = K.group(S, -0.55, TOP, -0.55); B.rotation.y = Math.PI / 4;
    for (const s of [-1, 1]) { K.box(0.16, 3.05, 0.16, MT.oxide, s * 1.32, 1.52, -0.1, B); K.box(0.32, 0.12, 0.32, MT.ironM, s * 1.32, 0.06, -0.1, B); strut(B, [s * 1.32, 0.1, -0.7], [s * 1.32, 1.4, -0.16], 0.07, MT.oxideD); }
    K.box(2.5, 2.32, 0.1, MT.iron, 0, 1.96, -0.12, B);
    for (const y of [0.8, 3.12]) K.box(2.66, 0.09, 0.15, MT.brassD, 0, y, -0.08, B);
    for (const s of [-1, 1]) K.box(0.09, 2.32, 0.15, MT.brassD, s * 1.29, 1.96, -0.08, B);
    for (let i = 0; i < 10; i++) { K.box(0.05, 0.05, 0.05, MT.brassL, -1.2 + i * 0.267, 3.12, 0.0, B); K.box(0.05, 0.05, 0.05, MT.brassL, -1.2 + i * 0.267, 0.8, 0.0, B); }
    for (let i = 0; i < 4; i++) { const s = K.box(0.04, 0.5 + (i % 2) * 0.4, 0.01, MT.grime, -1.0 + i * 0.6, 1.2, -0.065, B); s.castShadow = false; }
    // crest + title plate
    K.box(1.3, 0.3, 0.12, MT.brassD, 0, 3.3, -0.1, B);
    K.cone(0.12, 0.2, MT.brassL, 6, 0, 3.55, -0.1, B);
    plate(B, 'MEASURE', 0.2, 0, 3.3, -0.03);
    // the dial
    const DY = 2.05, DR = 1.0;
    const dialM = K.mat(C.cream, { e: 0 });
    K.mesh(new T.CircleGeometry(DR, 20, 0, Math.PI), dialM, 0, DY, -0.06, B);
    const SECT = [[0xff3a2a, 2 * Math.PI / 3], [0xffb030, Math.PI / 3], [0x46d070, 0]];   // HURT (left) · FLAT · LIFT (right)
    const sectMs = SECT.map(([c, a0]) => { const m = K.mat(c, { e: 0 }); K.mesh(new T.RingGeometry(0.66, 0.9, 6, 1, a0, Math.PI / 3), m, 0, DY, -0.05, B); return m; });
    for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; K.box(0.025, i % 2 ? 0.08 : 0.15, 0.02, MT.ink, Math.cos(a) * 0.95, DY + Math.sin(a) * 0.95, -0.04, B).rotation.z = a - Math.PI / 2; }
    K.torus(DR + 0.03, 0.05, MT.brass, 4, 18, 0, DY, -0.05, B, Math.PI);
    K.box(2.14, 0.08, 0.08, MT.brassD, 0, DY - 0.02, -0.04, B);
    plate(B, 'HURT', 0.11, -0.72, DY + 0.14, -0.03, { bg: '#6a1a10', hi: '#c04a30', lo: '#3a0a06', fg: '#ffd0b0' });
    plate(B, 'LIFT', 0.11, 0.72, DY + 0.14, -0.03, { bg: '#1a4a24', hi: '#4aa060', lo: '#0a2410', fg: '#d8ffd8' });
    // verdict lamps inside each sector: the one the needle settles on lights up
    const VL = [[0xff3020, 0x5a2014, 5 * Math.PI / 6], [0xffb030, 0x5a4016, Math.PI / 2], [0x46ff8a, 0x1a4a28, Math.PI / 6]];
    VL.forEach(([, , a]) => (K.cyl(0.1, 0.1, 0.04, MT.brass, 10, Math.cos(a) * 0.45, DY + Math.sin(a) * 0.45, -0.045, B).rotation.x = Math.PI / 2));
    const vSet = lampSet(B, VL.map(([, , a]) => [Math.cos(a) * 0.45, DY + Math.sin(a) * 0.45, -0.025]), 0.065, 0);
    const vLamps = VL.map(([c, base], i) => { vSet.set(i, base); return { c, base, i }; });
    const needle = dyn(K.group(B, 0, DY, 0.0));
    K.box(0.05, 0.84, 0.02, MT.ink, 0, 0.42, 0, needle);
    K.box(0.09, 0.14, 0.025, MT.red, 0, 0.76, 0.005, needle);
    K.box(0.07, 0.2, 0.02, MT.ink, 0, -0.1, 0, needle);
    K.cyl(0.08, 0.08, 0.06, MT.brassL, 10, 0, DY, 0.02, B).rotation.x = Math.PI / 2;
    // BEFORE / AFTER tubes (conversion)
    const tubes = [[-0.82, 'BEFORE'], [0.82, 'AFTER']].map(([x, label]) => {
      K.cyl(0.1, 0.1, 0.84, MT.glass, 10, x, 1.4, 0.0, B).castShadow = false;
      for (const y of [0.97, 1.84]) K.cyl(0.13, 0.13, 0.06, MT.brassD, 10, x, y, 0.0, B);
      for (let i = 0; i < 6; i++) K.box(0.08, 0.015, 0.02, MT.brassL, x + 0.17, 1.06 + i * 0.14, -0.02, B);
      const liqM = K.mat(0xffc870, { e: 0x000000 });
      K.sph(0.12, liqM, x, 0.98, 0.0, B, 10, 8);
      const col = dyn(K.cyl(0.062, 0.062, 1, liqM, 8, x, 1.0, 0.0, B));
      plate(B, label, 0.09, x, 0.9, 0.04, { bg: '#2a221a', hi: '#5a4a38', lo: '#100c08', fg: '#e6d6a8' });
      return { col, liqM, lvl: 0.1 };
    });
    // nixies: lift % (3 tubes) and the day of the window (2 tubes)
    K.box(0.52, 0.3, 0.14, MT.brassD, 0, 1.56, -0.04, B);
    K.box(0.38, 0.26, 0.14, MT.ironM, 0, 1.14, -0.04, B);
    for (let i = 0; i < 3; i++) K.cyl(0.07, 0.07, 0.24, MT.glass, 10, -0.15 + i * 0.15, 1.57, 0.06, B).castShadow = false;
    for (let i = 0; i < 2; i++) K.cyl(0.06, 0.06, 0.2, MT.glass, 10, -0.07 + i * 0.14, 1.14, 0.06, B).castShadow = false;
    const liftRow = nixieRow(B, [-0.15, 0, 0.15], 1.57, 0.08, 0.11, 0.19);
    const dayRow = nixieRow(B, [-0.07, 0.07], 1.14, 0.08, 0.1, 0.16);
    plate(B, '%', 0.08, 0.32, 1.57, 0.0);
    // gears on the board's shoulder (turn while it measures) + a steam whistle (vents when it needs you)
    const gearA = dyn(gear(B, 0.26, 0.06, 12, MT.brassD, -0.98, 2.86, 0.0)); gearA.rotation.x = Math.PI / 2;
    const gearB = dyn(gear(B, 0.16, 0.06, 9, MT.brass, -0.66, 2.98, 0.02)); gearB.rotation.x = Math.PI / 2;
    K.cyl(0.045, 0.045, 0.5, MT.copper, 6, 1.05, 3.35, -0.12, B); K.cyl(0.07, 0.05, 0.16, MT.brassL, 8, 1.05, 3.66, -0.12, B);
    const whistle = new T.Vector3(); { const q = new T.Vector3(1.05, 3.76, -0.12).applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 4); whistle.set(-0.55 + q.x, TOP + q.y, -0.55 + q.z); }

    // ---------- BALANCE SCALE (front): tips toward the side that converts more ----------
    const SC = K.group(S, 0.78, TOP, 0.78); SC.rotation.y = Math.PI / 4;
    K.box(1.0, 0.1, 0.46, MT.iron, 0, 0.05, 0, SC);
    K.box(1.04, 0.04, 0.5, MT.brassD, 0, 0.12, 0, SC);
    K.cyl(0.055, 0.085, 1.2, MT.brass, 8, 0, 0.72, 0, SC);
    band(SC, 0.09, 0.36, MT.brassD, 0.05); band(SC, 0.075, 1.0, MT.brassD, 0.04);
    K.cyl(0.1, 0.07, 0.1, MT.brassL, 8, 0, 1.33, 0, SC);
    // the pointer scale under the beam's needle
    K.torus(0.22, 0.015, MT.brassD, 4, 10, 0, 1.38, 0.05, SC, Math.PI).rotation.z = 0;
    const BEAM_Y = 1.42, ARM = 0.82;
    const beam = dyn(K.group(SC, 0, BEAM_Y, 0));
    K.box(ARM * 2 + 0.1, 0.05, 0.06, MT.brassL, 0, 0, 0, beam);
    K.box(0.18, 0.16, 0.09, MT.brass, 0, 0, 0, beam);
    K.box(0.025, 0.3, 0.025, MT.ink, 0, 0.17, 0.05, beam);
    for (const s of [-1, 1]) K.sph(0.05, MT.brassL, s * (ARM + 0.04), 0, 0, beam, 6, 4);
    const pans = [-1, 1].map((s) => {
      const p = dyn(K.group(SC, s * ARM, BEAM_Y, 0));
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; strut(p, [0, -0.02, 0], [Math.cos(a) * 0.22, -0.5, Math.sin(a) * 0.22], 0.015, MT.soot); }
      K.cyl(0.25, 0.19, 0.05, MT.brass, 12, 0, -0.52, 0, p);
      const wM = K.mat(s < 0 ? 0xd8b060 : 0x46c070, { e: 0 });
      for (let i = 0; i < 3; i++) K.cyl(0.11 - i * 0.02, 0.11 - i * 0.02, 0.05, wM, 10, 0, -0.47 + i * 0.055, 0, p);
      return { p, s, wM };
    });
    plate(SC, 'BEFORE', 0.07, -ARM, 0.2, 0.26, { bg: '#2a221a', hi: '#5a4a38', lo: '#100c08', fg: '#e6d6a8' });
    plate(SC, 'AFTER', 0.07, ARM, 0.2, 0.26, { bg: '#2a221a', hi: '#5a4a38', lo: '#100c08', fg: '#e6d6a8' });

    // ---------- STATUS + CAUTION ----------
    const lamp = K.statusLamp(g, 1.72, TOP, -0.55, 1.0);
    const caution = K.caution(g, -0.6, TOP, 1.72, 0.75);
    palettize(g); fold(g);

    // =====================================================================
    // THE EXPERIMENT (the auto driver plays one out after a launch; the game's driver says what's real)
    // =====================================================================
    const auto = () => IRON.driver === IRON.AUTO;
    const DAY_S = 3.2, DAYS = 7, SHOW_S = 11;
    let sim = null;    // { state, t, lift, target }
    function startSim(day) {
      const r = Math.random();
      const target = r < 0.55 ? 0.07 + Math.random() * 0.17 : r < 0.85 ? (Math.random() - 0.5) * 0.04 : -(0.05 + Math.random() * 0.1);
      sim = { state: 'measuring', t: (day || 0) * DAY_S, target, lift: 0 };
    }
    if (auto()) startSim(2.4);
    IRON.on('ship', () => { if (auto() && (!sim || (sim.state !== 'measuring' && sim.t > SHOW_S)) && Math.random() < 0.6) startSim(0); });
    // the factory's own record: the newest experiment that has launched (rescanned only when a new state arrives)
    let rFs = null, rEx = null;
    function realMeasure() {
      const d = IRON.driver;
      const fs = d && d !== IRON.AUTO && d.state && typeof d.state === 'object' && Array.isArray(d.state.items) ? d.state : null;
      if (!fs) return undefined;
      if (fs !== rFs) {
        rFs = fs;
        const ex = (Array.isArray(fs.experiments) ? fs.experiments : []).find((x) => x && x.launchedAt && /^(measuring|won|flat|lost|inconclusive)$/.test(x.state));
        rEx = ex ? { state: ex.state === 'inconclusive' ? 'flat' : ex.state, lift: ex.lift || 0, day: Math.max(1, Math.ceil(ex.daysWatched || 0)), days: ex.windowDays || DAYS } : null;
      }
      return rEx;
    }
    let needleA = 0, tilt = 0, shownLift = 0, celebrate = -1, prevState = null, tPuff = 0, hunt = 0;

    return { g, update(t, dt) {
      const blk = M.blocked;
      const live = blk ? 0 : dt;
      // what's being measured: the driver's measure() hook, else the factory state, else the auto driver's play
      let e = null;
      const hook = typeof IRON.driver.measure === 'function' ? IRON.driver.measure(IRON.stations[M.id]) : undefined;
      const ext = hook !== undefined ? hook : realMeasure();
      if (ext !== undefined) e = ext ? { state: ext.state, lift: ext.lift || 0, day: ext.day || 0, days: ext.days || DAYS } : null;
      else if (sim) {
        sim.t += live;
        if (sim.state === 'measuring') {
          const day = sim.t / DAY_S;
          sim.lift = sim.target * Math.min(1, day / DAYS) + Math.sin(sim.t * 1.7) * 0.03 * (1 - day / DAYS);
          if (day >= DAYS) { sim.state = Math.abs(sim.target) < 0.03 ? 'flat' : sim.target > 0 ? 'won' : 'lost'; sim.lift = sim.target; sim.t = 0; }
        } else if (sim.t > SHOW_S) sim = null;
        if (sim) e = { state: sim.state, lift: sim.lift, day: sim.state === 'measuring' ? Math.min(DAYS, Math.floor(sim.t / DAY_S) + 1) : DAYS, days: DAYS };
      }
      const state = e ? e.state : 'idle';
      const measuring = state === 'measuring';
      const verdict = state === 'won' || state === 'flat' || state === 'lost';
      if (state !== prevState) { if (verdict && prevState !== null) celebrate = 0; prevState = state; }   // no party for a verdict that was already in when the map opened
      const on = measuring || verdict;

      // the needle: hunting while it measures, decisive on a verdict, pinned at HURT and trembling when it needs you
      const lift = e ? e.lift : 0;
      hunt += live * (measuring ? 1 : 0);
      const est = measuring ? lift + Math.sin(hunt * 2.3) * 0.02 + Math.sin(hunt * 5.1) * 0.01 : verdict ? lift : 0;
      const want = blk ? 1.3 + Math.sin(t * 40) * 0.04 : on ? -1.4 * Math.tanh(est / 0.07) : 0;
      needleA += (want - needleA) * Math.min(1, dt * (blk ? 20 : verdict ? 4 : 2.5));
      needle.rotation.z = needleA;
      shownLift += (est - shownLift) * Math.min(1, dt * 3);
      const zone = needleA > Math.PI / 6 ? 0 : needleA < -Math.PI / 6 ? 2 : 1;
      const blink = Math.sin(t * 8) > 0;
      vLamps.forEach((v, i) => vSet.set(i, blk ? (blink ? 0xff2010 : 0x3a0a04) : !on ? v.base : i === zone ? (verdict ? v.c : (Math.sin(t * 6) > 0 ? v.c : v.base)) : v.base));
      sectMs.forEach((m, i) => m.emissive.setHex(on && i === zone && verdict ? [0x3a0804, 0x3a2404, 0x0a3a14][i] : 0));
      dialM.emissive.setHex(blk ? (blink ? 0x6a0c06 : 0x2a0402) : on ? 0x2a2010 : 0);

      // tubes: BEFORE holds the baseline, AFTER rises over it (lift) or sinks under it (hurt)
      const lvA = on ? 0.5 : 0.12, lvB = on ? Math.max(0.08, Math.min(0.98, 0.5 * (1 + shownLift * 2.6))) : 0.12;
      tubes.forEach((tb, i) => {
        tb.lvl += ((i ? lvB : lvA) - tb.lvl) * Math.min(1, dt * 2);
        const h = 0.08 + tb.lvl * 0.74; tb.col.scale.set(1, h, 1); tb.col.position.y = 1.0 + h / 2;
        const c = i === 0 ? 0xffc870 : blk ? 0xff3020 : state === 'won' ? 0x46ff8a : state === 'lost' ? 0xff4a2a : state === 'flat' ? 0xffb030 : measuring ? 0x7af0d8 : 0x6a5a40;
        tb.liqM.color.setHex(c); tb.liqM.emissive.setHex(on || blk ? c : 0); tb.liqM.emissiveIntensity = on || blk ? 0.55 : 0;
      });

      // nixies
      const pct = Math.round(shownLift * 100);
      if (blk) setRow(liftRow, blink ? '???' : '   ', 1, 0xff8060);
      else if (verdict) setRow(liftRow, (pct < 0 ? '-' : ' ') + String(Math.min(99, Math.abs(pct))).padStart(2, '0'), blink || celebrate < 0 ? 1 : 0.6, state === 'won' ? 0xc0ffd0 : state === 'lost' ? 0xffa090 : 0xffffff);
      else if (measuring) setRow(liftRow, e.day < 2 ? '---' : (pct < 0 ? '-' : ' ') + String(Math.min(99, Math.abs(pct))).padStart(2, '0'), 0.75 + Math.random() * 0.2);
      else setRow(liftRow, '---', 0.22);
      setRow(dayRow, on ? 'd' + Math.min(9, e.day) : '--', on ? 0.85 : 0.22);

      // the scale: AFTER heavier = lift (its pan goes down)
      const wantTilt = blk ? 0.3 + Math.sin(t * 30) * 0.02 : on ? -Math.max(-0.32, Math.min(0.32, shownLift * 2.2)) + (measuring ? Math.sin(hunt * 1.7) * 0.06 : 0) : 0;
      tilt += (wantTilt - tilt) * Math.min(1, dt * 2.5);
      beam.rotation.z = tilt;
      pans.forEach((p) => { p.p.position.set(p.s * ARM * Math.cos(tilt), BEAM_Y + p.s * ARM * Math.sin(tilt), 0); });
      pans[0].wM.emissive.setHex(on ? 0x3a2a10 : 0);
      pans[1].wM.emissive.setHex(blk ? (blink ? 0x6a0804 : 0) : state === 'won' ? 0x1a6a30 : state === 'lost' ? 0x6a1a10 : measuring ? 0x14402a : 0);
      gearA.rotation.y += live * (measuring ? 1.2 : 0); gearB.rotation.y -= live * (measuring ? 1.95 : 0);

      // alarm + celebration
      wash.visible = blk;
      if (blk) washM.opacity = (Math.sin(t * 9) > 0 ? 1 : 0.35) * 0.2;
      if (celebrate >= 0) celebrate += dt; if (celebrate > 3) celebrate = -1;
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = 0.06;
        if (blk) puff(whistle.x, whistle.y, whistle.z, 0.3, 2.0, 0.2, 0xf0ece4, 1.4, 0.1, 2, 0.08);
        else if (celebrate >= 0 && celebrate < 1.2 && state === 'won') { for (let i = 0; i < 3; i++) K.spawn(g, 0.78 * C45 * 0 + K.R() * 1.6, TOP + 3.2, -0.55 + K.R() * 0.4, K.R() * 1.6, 1.2 + Math.random() * 1.4, K.R() * 1.0, Math.random() < 0.7 ? 0x46ff8a : 0xffd27a, 1.0, 0.05, 2, true); }
        else if (measuring && Math.random() < 0.05) puff(whistle.x, whistle.y, whistle.z, 0.1, 0.8, 0.1, 0xb8ac98, 1.1, 0.07, 1, 0.05);
      }

      // state
      if (measuring) M.setState('WORKING', 'day ' + e.day + ' of ' + e.days + ' · measuring the lift');
      else if (state === 'won') M.setState('WORKING', '+' + Math.round(lift * 100) + '% lift');
      else if (state === 'lost') M.setState('WORKING', Math.round(lift * 100) + '% · it hurt');
      else if (state === 'flat') M.setState('WORKING', 'no lift');
      else M.setState('IDLE', 'no experiment running');
      lamp.set(M.stateShown, t);
      caution.update(t, dt, M.stateShown);
    } };
  });
}
