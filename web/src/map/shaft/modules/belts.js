// =====================================================================
// CONVEYORS (the shaft) — CONVEYORS agent. Every path above the mine: the ore belt, the plan belts with their
// diverter flippers, the glass pneumatic tubes and the header up the riser wall, the CI feed and check lanes, the
// reject chutes, the red REWORK loop (lip belt, bucket drop, return to the planner), the gate's SENT BACK line,
// and the freight LAUNCH LIFT. Carrier 'bucket'.
// Ported from the Black Iron mockup (docs/art/black-iron/modules/belts.js): the same belt builder (slatted
// scrolling belt with brass splices, rails with rust lips, rollers, chase lamps, legs, drip trays and oil, spoked
// end hubs, corner turntables, gear drives), the glass tube with brass collars, copper line and steam, the rework
// bucket elevators and their bucket, the drop nozzle and the TUBE sign.
// Root-local coords, all read from ctx.paths (layout.js). Belt tops scroll at path.speed * path.flow in world units
// so items never slide; chase lamps run red while path.jammed. Belts stop at the machines' trays.
// Perf: every plain static part is merged into a few vertex-coloured meshes (colour, specular and glow per
// vertex); every belt top shares one scrolling material (each path a slot with its own offset), every lamp is a
// texel of one atlas, every sign a cell of one atlas; spinning hubs, turntables, sheaves and gears are one
// instanced mesh per kind; empty buckets are one instanced mesh per elevator. Empties stand in through
// carrierPick / carrierDrop, so loaded buckets and cages never pop.
// =====================================================================

const C = {
  soot: 0x1a1512, iron: 0x3a322b, ironM: 0x2e2722, ironL: 0x5c5046, ironXL: 0x7a6c5e,
  steel: 0x2c3036, steelL: 0x4a5058, brass: 0xb08236, brassD: 0x6e5022, brassL: 0xd8aa52,
  copper: 0x9a5030, copperD: 0x5e301a, rust: 0x8a3e1c, rustL: 0xa85a28, red: 0xc02a1a, redD: 0x6e1a10,
  hazard: 0xe0a018, oil: 0x0a0a0e, oxide: 0x8e3622, oxideD: 0x62261a,
};

// 5x5 pixel caps (the mockup's Silkscreen look, drawn texel by texel so it never depends on a web font)
const GLYPH = {
  A: '0111010001111111000110001', B: '1111010001111101000111110', C: '0111110000100001000001111',
  D: '1111010001100011000111110', E: '1111110000111101000011111', F: '1111110000111101000010000',
  G: '0111110000100111000101111', H: '1000110001111111000110001', I: '1111100100001000010011111',
  J: '0011100001000011000101110', K: '1000110010111001001010001', L: '1000010000100001000011111',
  M: '1000111011101011000110001', N: '1000111001101011001110001', O: '0111010001100011000101110',
  P: '1111010001111101000010000', Q: '0111010001101011001001101', R: '1111010001111101001010001',
  S: '0111110000011100000111110', T: '1111100100001000010000100', U: '1000110001100011000101110',
  V: '1000110001100010101000100', W: '1000110001101011101110001', X: '1000101010001000101010001',
  Y: '1000101010001000010000100', Z: '1111100010001000100011111',
  0: '0111010011101011100101110', 1: '0010001100001000010001110', 2: '1111000001011101000011111',
  3: '1111000001001100000111110', 4: '1001010010111110001000010', 5: '1111110000111100000111110',
  6: '0111010000111101000101110', 7: '1111100001000100010000100', 8: '0111010001011101000101110',
  9: '0111010001011110000101110', ' ': '0000000000000000000000000', '-': '0000000000011100000000000',
  '<': '0001000110011100011000010', '>': '0100001100011100110001000', '^': '0000000100011101111100000',
  v: '0000011111011100010000000', '#': '0101011111010101111101010', '.': '0000000000000000000000100',
};

export default function install(IRON) {
  const CACHE = new WeakMap(); // per kit (one per IRON instance): materials, textures, shared geometry

  // ---------------------------------------------------------------- palette + textures
  function mats(K) {
    let M = CACHE.get(K.mat);
    if (M) return M;
    const m = (c, o) => K.mat(c, o);
    M = {
      soot: m(C.soot), iron: m(C.iron, { shine: 22, spec: 0x2a2a30 }), ironM: m(C.ironM, { shine: 16, spec: 0x222228 }),
      ironL: m(C.ironL, { shine: 28, spec: 0x3a3a40 }), ironXL: m(C.ironXL, { shine: 30, spec: 0x44444a }),
      steel: m(C.steel, { shine: 30, spec: 0x3a4048 }), steelL: m(C.steelL, { shine: 34, spec: 0x50565e }),
      brass: m(C.brass, { shine: 40, spec: 0x8a6a30 }), brassD: m(C.brassD, { shine: 22, spec: 0x3a2a10 }), brassL: m(C.brassL, { shine: 50, spec: 0xa08040 }),
      copper: m(C.copper, { shine: 34, spec: 0x6a3a20 }), copperD: m(C.copperD, { shine: 18 }),
      rust: m(C.rust), rustL: m(C.rustL), red: m(C.red, { shine: 18, spec: 0x3a1a10, e: 0x200402 }), redD: m(C.redD),
      hazard: m(C.hazard), oil: m(C.oil, { shine: 90, spec: 0x6a5a8a }), grime: m(0x050403, { op: 0.45, depthWrite: false }),
      oxide: m(C.oxide, { shine: 20, spec: 0x3a1a10, e: 0x140402 }), oxideD: m(C.oxideD, { shine: 14, spec: 0x2a1008 }),
      volute: m(0x7a3c20, { shine: 30, spec: 0x6a3a20 }),
      glass: m(0xa8c8c0, { op: 0.2, shine: 70, spec: 0x9ab0aa, depthWrite: false, double: true }),
    };
    M.tx = { belt: beltTex(K), beltRw: beltTexRw(K), haz: hazardTex(K), chain: chainTex(K), plateC: plateTex(K) };
    M.haz = m(0xffffff, { map: M.tx.haz });
    M.plateC = m(0xffffff, { map: M.tx.plateC });
    M.vc = m(0xffffff, { shine: 30, spec: 0x3a3a40 }); M.vc.vertexColors = true;
    CACHE.set(K.mat, M);
    return M;
  }
  // belt: five 0.5-unit tiles of the mockup's slats (2.5 units), the first carries a brass splice with rivets
  function beltTex(K) {
    return K.canvasTex(80, 16, (g) => {
      for (let k = 0; k < 5; k++) {
        const o = k * 16;
        g.fillStyle = '#18130f'; g.fillRect(o, 0, 16, 16);
        g.fillStyle = '#4a3f35'; g.fillRect(o, 1, 16, 14);
        g.fillStyle = '#8a7862'; g.fillRect(o + 1, 1, 3, 14); g.fillRect(o + 9, 1, 3, 14);
        g.fillStyle = '#b8a084'; g.fillRect(o + 1, 1, 3, 1); g.fillRect(o + 9, 1, 3, 1);
        g.fillStyle = '#0a0908'; g.fillRect(o + 4, 1, 1, 14); g.fillRect(o + 12, 1, 1, 14);
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(o + 6, 4 + (k % 3), 2, 3); g.fillRect(o + 14, 10 - (k % 2) * 4, 2, 2); g.fillRect(o + 5, 12, 3, 1);
        g.fillStyle = 'rgba(255,220,170,0.08)'; g.fillRect(o + 6, 8, 2, 1);
      }
      g.fillStyle = '#d8aa52'; g.fillRect(6, 1, 2, 14); g.fillStyle = '#6e5022'; g.fillRect(8, 1, 1, 14);
      g.fillStyle = '#1a1512'; g.fillRect(6, 3, 2, 2); g.fillRect(6, 7, 2, 2); g.fillRect(6, 11, 2, 2);
    });
  }
  // rework belt: the mockup's cool steel slats with a red chevron pointing the way the belt runs (1.5 units)
  function beltTexRw(K) {
    return K.canvasTex(48, 16, (g) => {
      for (let k = 0; k < 3; k++) {
        const o = k * 16;
        g.fillStyle = '#0e1012'; g.fillRect(o, 0, 16, 16);
        g.fillStyle = '#262a30'; g.fillRect(o, 1, 16, 14);
        g.fillStyle = '#4a525c'; g.fillRect(o + 1, 1, 3, 14); g.fillRect(o + 9, 1, 3, 14);
        g.fillStyle = '#6a7480'; g.fillRect(o + 1, 1, 3, 1); g.fillRect(o + 9, 1, 3, 1);
        g.fillStyle = '#0a0908'; g.fillRect(o + 4, 1, 1, 14); g.fillRect(o + 12, 1, 1, 14);
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(o + 6, 5, 2, 3); g.fillRect(o + 14, 11, 2, 2);
      }
      for (let y = 2; y <= 13; y++) {
        const x0 = 17 + Math.round(6 - Math.abs(y - 7.5));
        g.fillStyle = '#d0321c'; g.fillRect(x0, y, 4, 1);
        g.fillStyle = '#ff7a50'; g.fillRect(x0 + 3, y, 1, 1);
        g.fillStyle = '#4a0c06'; g.fillRect(x0 - 1, y, 1, 1);
      }
    });
  }
  function hazardTex(K) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#16120c'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#e0a018';
      for (let i = -16; i < 32; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 4, 0); g.lineTo(i + 4 - 16, 16); g.lineTo(i - 16, 16); g.fill(); }
    });
  }
  // chain: the mockup's links, laid along u (the chain's length) so chains scroll like belt tops
  function chainTex(K) {
    return K.canvasTex(16, 8, (g) => {
      g.fillStyle = '#100c0a'; g.fillRect(0, 0, 16, 8);
      g.fillStyle = '#6a5e52'; g.fillRect(0, 2, 7, 4); g.fillStyle = '#100c0a'; g.fillRect(2, 3, 3, 2);
      g.fillStyle = '#8a7c6c'; g.fillRect(7, 3, 9, 2); g.fillStyle = '#4a4038'; g.fillRect(9, 3, 5, 2);
    });
  }
  function plateTex(K) {
    return K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#24262a'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#3a3e44';
      for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 16; x += 4) g.fillRect(x, y, 2, 1);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(9, 5, 4, 3);
    });
  }

  // ---------------------------------------------------------------- vertex-coloured shared geometry
  function bxg(K, w, h, d, x, y, z, ry, rx, rz) {
    const g = new K.THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
    g.translate(x || 0, y || 0, z || 0); return g;
  }
  function cyg(K, rt, rb, h, seg, x, y, z, rx, rz) {
    const g = new K.THREE.CylinderGeometry(rt, rb, h, seg);
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz);
    g.translate(x || 0, y || 0, z || 0); return g;
  }
  function vcMerge(K, parts) {
    const THREE = K.THREE;
    let n = 0;
    const gs = parts.map(([g, c]) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return [ng, c]; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0; const cc = new THREE.Color();
    for (const [g, c] of gs) {
      const cnt = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      cc.setHex(c);
      for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b; }
      o += cnt; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }
  // the rework BUCKET (the mockup's): steel tray, corner posts, red top rails, chain lugs on +-x. Depth (z) kept to
  // 0.58 so it clears the deck when it swings round a boot sheave.
  function bucketGeo(K) {
    const M = mats(K);
    if (M.bucketGeo) return M.bucketGeo;
    const P = [];
    P.push([bxg(K, 0.62, 0.06, 0.54, 0, -0.05, 0), C.steelL]);
    P.push([bxg(K, 0.66, 0.04, 0.58, 0, -0.1, 0), C.soot]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push([bxg(K, 0.05, 0.4, 0.05, sx * 0.29, 0.15, sz * 0.25), C.steel]);
    for (const sz of [-1, 1]) {
      P.push([bxg(K, 0.62, 0.05, 0.05, 0, 0.33, sz * 0.25), C.red]);
      P.push([bxg(K, 0.62, 0.04, 0.04, 0, 0.1, sz * 0.25), C.steel]);
      P.push([bxg(K, 0.58, 0.1, 0.02, 0, -0.0, sz * 0.26), C.steel]);
    }
    for (const sx of [-1, 1]) { P.push([bxg(K, 0.05, 0.05, 0.54, sx * 0.29, 0.33, 0), C.red]); P.push([bxg(K, 0.18, 0.08, 0.1, sx * 0.39, 0.2, 0), C.ironL]); }
    M.bucketGeo = vcMerge(K, P);
    return M.bucketGeo;
  }
  function bucketMesh(K) {
    const o = new K.THREE.Mesh(bucketGeo(K), mats(K).vc);
    o.castShadow = false; o.receiveShadow = false;
    return o;
  }
  IRON.carrier('bucket', (K) => bucketMesh(K));

  // =====================================================================
  IRON.belts((K, root, ctx) => {
    const THREE = K.THREE, V = THREE.Vector3, Q = THREE.Quaternion;
    const M = mats(K);
    const I = ctx.I, P = ctx.paths, LIST = ctx.pathList, TI = ctx.tiers;
    const XA = new V(1, 0, 0), YA = new V(0, 1, 0), ZA = new V(0, 0, 1);
    const stat = K.group(root); stat.name = 'belts-static';
    const W = 0.76;
    const tv = new V(), tq = new Q(), m4 = new THREE.Matrix4(), ONE = new V(1, 1, 1);
    const wrap1 = (x) => x - Math.floor(x);
    const mine = (p) => !(p.name === 'collector' || p.name === 'lift' || p.name.startsWith('cart-') || p.name.startsWith('chute-'));
    const belts = LIST.filter((p) => mine(p) && p.kind === 'belt');
    const tubes = LIST.filter((p) => mine(p) && p.kind === 'tube');
    const chutes = LIST.filter((p) => mine(p) && p.kind === 'chute');
    const lifts = LIST.filter((p) => mine(p) && p.kind === 'lift');
    const first = (p) => p.points[0], last = (p) => p.points[p.points.length - 1];
    const near = (a, b, e) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < (e || 0.03);
    const key = (p) => p[0].toFixed(2) + '|' + p[1].toFixed(2) + '|' + p[2].toFixed(2);
    const segDir = (sg) => new V(sg.dx, 0, sg.dz).normalize();
    const yawOf = (d) => Math.atan2(-d.z, d.x);
    const uvs = (o, su, sv) => { const uv = o.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * (sv || 1)); return o; };
    const noShadow = (o) => { o.castShadow = false; return o; };

    // ---------------------------------------------------------------- floors
    const tierOf = (y) => { let best = TI.build, bd = 1e9; for (const k in TI) { const d = Math.abs(TI[k].y + 1 - y); if (d < bd) { bd = d; best = TI[k]; } } return best; };
    const deckTop = (y) => tierOf(y).y + 0.1;
    const pads = []; // my own standing surfaces (lift landings): { x0, x1, z0, z1, top }
    function onDeck(x, y, z, mg) {
      mg = mg === undefined ? 0.1 : mg;
      const T = tierOf(y);
      if (x >= T.x0 + mg && x <= T.x1 - mg && z >= T.z0 + mg && z <= T.z1 - mg) return T.y + 0.1;
      for (const p of pads) if (Math.abs(p.top - (y - 0.9)) < 0.35 && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return p.top;
      return null;
    }
    // inside the solid mass of a floor (behind its riser face, from the floor below up to its deck)
    function massHit(x, z, y0, y1) {
      const order = [TI.build, TI.checks, TI.launch];
      for (let i = 1; i < order.length; i++) {
        const T = order[i], B = order[i - 1];
        if (y1 > B.y + 0.1 && y0 < T.y + 0.1 && x > T.x0 - 0.1 && x < T.x1 + 0.1 && z < T.z1 + 0.08 && z > T.z0) return true;
      }
      return false;
    }

    // ---------------------------------------------------------------- ports + trims (machines own their trays)
    const portAt = new Map();
    ctx.stations.forEach((st) => { const ps = ctx.PORTS[st.type] || {}; for (const n in ps) { const d = ps[n].p; portAt.set(key(ctx.toRootAt(st, d[0], d[1], d[2])), { st, type: st.type, port: n }); } });
    // how far short of a port a belt stops: the tray / bench / outlet each machine builds there
    const TRIM = {
      planner: { in: 0.47, pass: 0.2, reject: 0.3 }, assembler: { in: 0.47 },
      ci: { in: 0.34, pass: 0.34, reject: 0.3 }, verify: { in: 0.34, pass: 0.34, reject: 0.3 }, review: { in: 0.34, pass: 0.34, reject: 0.3 },
      check: { in: 0.28, pass: 0.28, reject: 0.24 }, gate: { in: 0.45, pass: 0.45, reject: 0.45 }, launch: { in: 0.42 },
    };
    const portTrim = (pt) => { const h = portAt.get(key(pt)); if (!h) return null; const t = TRIM[h.type]; return t && t[h.port] !== undefined ? t[h.port] : 0.4; };
    const allLifts = LIST.filter((p) => p.kind === 'lift');
    const liftEndingAt = (pt) => allLifts.find((l) => near(last(l), pt));
    const liftAfter = (p) => { const n = typeof p.next === 'string' ? P[p.next] : null; return n && n.kind === 'lift' ? n : null; };
    const liftTrim = (l) => (l.carrier === 'bucket' ? 0.52 : l.name === 'lift' ? 0.6 : 0.8);
    const contEnd = (p) => belts.some((b) => b !== p && near(first(b), last(p)));
    const contStart = (p) => belts.some((b) => b !== p && near(last(b), first(p)));
    const fedByTube = (p) => tubes.some((t) => t.next === p.name);
    const TR = new Map();
    belts.forEach((p) => {
      let a, b;
      if (contStart(p)) a = 0;
      else { const pt = portTrim(first(p)); const l = liftEndingAt(first(p)); a = pt !== null ? pt : l ? liftTrim(l) : fedByTube(p) ? -0.3 : 0.15; }
      if (contEnd(p)) b = 0;
      else { const pt = p.port ? portTrim(last(p)) : null; const l = liftAfter(p); b = pt !== null ? pt : p.port ? 0.45 : l ? liftTrim(l) : 0.15; }
      const pos = Math.max(0, a) + Math.max(0, b);
      if (p.L - pos < 0.45 && pos > 0) { const k = Math.max(0, (p.L - 0.45) / pos); if (a > 0) a *= k; if (b > 0) b *= k; }
      TR.set(p, [a, b]);
    });
    // visible belt pieces (for clearance tests)
    const visSegs = [];
    belts.forEach((p) => { const [a, b] = TR.get(p); p.segs.forEach((sg) => { const s0 = Math.max(sg.L0, a), s1 = Math.min(sg.L0 + sg.len, p.L - b); if (s1 - s0 < 0.02) return; const A = new V(), B = new V(); p.at(s0, A); p.at(s1, B); visSegs.push({ a: A, b: B, y: sg.a.y, p }); }); });
    function segDist(px, pz, s) {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, L2 = dx * dx + dz * dz;
      const t = L2 > 1e-9 ? K.clamp01(((px - s.a.x) * dx + (pz - s.a.z) * dz) / L2) : 0;
      return Math.hypot(px - (s.a.x + dx * t), pz - (s.a.z + dz * t));
    }
    // the y spans a vertical post at (x, z) can take without passing through a belt
    function postSpans(x, z, y0, y1, r) {
      r = r || 0.08;
      const cuts = [];
      visSegs.forEach((s) => { if (s.y < y0 - 0.3 || s.y > y1 + 1) return; if (segDist(x, z, s) < 0.5 + r) cuts.push([s.y - 1.0, s.y + 0.75]); });
      cuts.sort((a, b) => a[0] - b[0]);
      const out = []; let cur = y0;
      for (const [a, b] of cuts) { if (a > cur + 0.05) out.push([cur, Math.min(a, y1)]); cur = Math.max(cur, b); if (cur >= y1) break; }
      if (cur < y1 - 0.05) out.push([cur, y1]);
      return out.filter(([a, b]) => b - a > 0.06);
    }
    const vpost = (x, z, y0, y1, s, m, p) => postSpans(x, z, y0, y1, s / 2).forEach(([a, b]) => K.box(s, b - a, s, m, x, (a + b) / 2, z, p || stat));

    // =====================================================================
    // SHARED MATERIALS (a few draw calls for the whole module)
    // =====================================================================
    // LAMPS: every lamp is one texel of this atlas (one unlit material, merged with the statics); recolour = write
    const LA = (() => {
      const TW = 64, TH = 4, data = new Uint8Array(TW * TH * 4);
      for (let i = 0; i < TW * TH; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 24; data[i * 4 + 3] = 255; }
      const tex = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat);
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
      let n = 0, dirty = false;
      const A = {
        mat,
        alloc(k, hex) { const i = n; n = Math.min(TW * TH - 1, n + (k || 1)); if (hex !== undefined) for (let j = i; j < i + (k || 1); j++) A.set(j, hex); return i; },
        set(i, hex) {
          const o = i * 4, r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
          if (data[o] !== r || data[o + 1] !== g || data[o + 2] !== b) { data[o] = r; data[o + 1] = g; data[o + 2] = b; dirty = true; }
        },
        put(o, i) {
          const uv = o.geometry.attributes.uv, u = ((i % TW) + 0.5) / TW, v = (Math.floor(i / TW) + 0.5) / TH;
          for (let k = 0; k < uv.count; k++) uv.setXY(k, u, v);
          o.castShadow = false; o.receiveShadow = false; return o;
        },
        flush() { if (dirty) { tex.needsUpdate = true; dirty = false; } },
      };
      return A;
    })();
    const lampBox = (i, w, h, d, x, y, z, p) => LA.put(K.box(w, h, d, LA.mat, x, y, z, p), i);
    const lampSph = (i, r, x, y, z, p) => LA.put(K.sph(r, LA.mat, x, y, z, p, 8, 6), i);
    // SCROLLERS: one material per texture for every belt top (or chain); each path is a slot (the integer part of
    // its v coordinate) with its own u offset, so every belt still runs at its own speed * flow
    function scroller(tex, n, o) {
      const N = Math.max(1, n), offs = new Float32Array(N);
      const m = K.mat(0xffffff, Object.assign({ map: tex }, o || {}));
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uOff = { value: offs };
        sh.fragmentShader = 'uniform float uOff[' + N + '];\n' + sh.fragmentShader.replace('#include <map_fragment>',
          '#ifdef USE_MAP\n\tvec2 sUv = vMapUv;\n\tsUv.x += uOff[int(clamp(floor(sUv.y), 0.0, ' + (N - 1).toFixed(1) + '))];\n\tdiffuseColor *= texture2D( map, sUv );\n#endif');
      };
      m.customProgramCacheKey = () => 'belts-scroll-' + N;
      let used = 0;
      return { m, offs, slot: () => Math.min(N - 1, used++) };
    }
    // VERTEX-COLOUR BAKE: plain (untextured, opaque) meshes are merged into one geometry per shadow flag (and floor
    // cell) with their colour, specular and glow in vertex attributes, drawn with this one material
    let vcMatS = null;
    function vcMaterial() {
      if (vcMatS) return vcMatS;
      const m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
      m.defines = { IRON_LEGACY: '' };
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 spec;\nattribute vec3 emis;\nvarying vec4 vSpec;\nvarying vec3 vEmis;')
          .replace('#include <color_vertex>', '#include <color_vertex>\n\tvSpec = spec; vEmis = emis;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vSpec;\nvarying vec3 vEmis;')
          .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive + vEmis;')
          .replace('#include <lights_phong_fragment>', 'BlinnPhongMaterial material;\n\tmaterial.diffuseColor = diffuseColor.rgb;\n\tmaterial.specularColor = vSpec.rgb;\n\tmaterial.specularShininess = vSpec.a;\n\tmaterial.specularStrength = specularStrength;');
      };
      m.customProgramCacheKey = () => 'belts-vc';
      vcMatS = m;
      return m;
    }
    const vcOk = (c) => {
      const mt = c.material;
      return c.constructor === THREE.Mesh && c.visible && !c.children.length && !!mt && !Array.isArray(mt) && mt.isMeshPhongMaterial && !mt.map && !mt.transparent && !mt.vertexColors && !!c.geometry.attributes.position;
    };
    const BLACK = new THREE.Color(0);
    function vcGeometry(list, inv) {
      const rel = new THREE.Matrix4();
      let n = 0;
      const parts = list.map((o) => {
        rel.multiplyMatrices(inv, o.matrixWorld);
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(rel);
        n += g.attributes.position.count;
        return { g, mt: o.material, flip: rel.determinant() < 0 };
      });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), emi = new Float32Array(n * 3), spc = new Float32Array(n * 4);
      let off = 0;
      for (const { g, mt, flip } of parts) {
        const Pa = g.attributes.position.array, Na = g.attributes.normal.array, cnt = g.attributes.position.count;
        for (let q = 0; q + 2 < cnt; q += 3) for (let j = 0; j < 3; j++) {
          const src = q + (flip && j ? 3 - j : j), dst = off + q + j;
          for (let k = 0; k < 3; k++) { pos[dst * 3 + k] = Pa[src * 3 + k]; nor[dst * 3 + k] = Na[src * 3 + k]; }
        }
        const c = mt.color, e = mt.emissive || BLACK, ei = mt.emissiveIntensity === undefined ? 1 : mt.emissiveIntensity, s = mt.specular || BLACK, sh = mt.shininess || 0;
        for (let i = off; i < off + cnt; i++) {
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          emi[i * 3] = e.r * ei; emi[i * 3 + 1] = e.g * ei; emi[i * 3 + 2] = e.b * ei;
          spc[i * 4] = s.r; spc[i * 4 + 1] = s.g; spc[i * 4 + 2] = s.b; spc[i * 4 + 3] = sh;
        }
        off += cnt; g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('emis', new THREE.BufferAttribute(emi, 3));
      geo.setAttribute('spec', new THREE.BufferAttribute(spc, 4));
      geo.computeBoundingSphere();
      return geo;
    }
    const cellKey = (v) => (v.y < 6 ? 'b' : v.y < 17 ? 'c' : 'l') + (v.x < 0 ? 'L' : 'R');
    function vcBake(node, cells) {
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      const groups = new Map(), wp = new V(), sv = new V();
      const walk = (o) => {
        for (const c of o.children) {
          if (c.userData.dyn || c.userData.noBake) continue;
          if (vcOk(c)) {
            const gs = c.geometry.boundingSphere || (c.geometry.computeBoundingSphere(), c.geometry.boundingSphere);
            c.getWorldScale(sv);
            const cast = c.castShadow && gs.radius * Math.max(sv.x, sv.y, sv.z) >= 0.16;
            let k = cast ? 'c' : 'n';
            if (cells) { c.getWorldPosition(wp); root.worldToLocal(wp); k += cellKey(wp); }
            if (!groups.has(k)) groups.set(k, { cast, list: [] });
            groups.get(k).list.push(c);
          }
          walk(c);
        }
      };
      walk(node);
      groups.forEach(({ cast, list }) => {
        const m = new THREE.Mesh(vcGeometry(list, inv), vcMaterial());
        m.castShadow = cast; m.receiveShadow = true; m.name = 'belts-vc';
        list.forEach((c) => { c.parent.remove(c); c.geometry.dispose(); });
        node.add(m);
      });
    }
    // SIGNS: pixel caps on an iron board with brass bolts; every face is a cell of one atlas (filled in at the end)
    const signQ = [];
    function sign(parent, text, o, x, y, z, h, ry) {
      const tw = 6 + text.length * 6 - 1, th = 9, w = (h * tw) / th;
      const g = K.group(parent, x, y, z); if (ry) g.rotation.y = ry;
      K.box(w + 0.12, h + 0.12, 0.06, M.ironM, 0, 0, -0.035, g);
      const face = K.mesh(new THREE.PlaneGeometry(w, h), LA.mat, 0, 0, 0.0, g);
      face.castShadow = false; face.receiveShadow = false;
      signQ.push({ face, text, o, tw, th });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) K.box(0.05, 0.05, 0.03, M.brassL, sx * (w / 2 + 0.03), sy * (h / 2 + 0.03), 0.005, g);
      return { g, face, w };
    }
    function finishSigns() {
      if (!signQ.length) return;
      const AW = Math.max(...signQ.map((s) => s.tw)), AH = signQ.length * 10;
      const tex = K.canvasTex(AW, AH, (g) => {
        signQ.forEach((s, i) => {
          const y0 = i * 10;
          g.fillStyle = s.o.edge || '#0c0a08'; g.fillRect(0, y0, s.tw, s.th);
          g.fillStyle = s.o.bg; g.fillRect(1, y0 + 1, s.tw - 2, s.th - 2);
          g.fillStyle = s.o.fg;
          for (let i2 = 0; i2 < s.text.length; i2++) {
            const gl = GLYPH[s.text[i2]] || GLYPH[' '];
            for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (gl[r * 5 + c] === '1') g.fillRect(3 + i2 * 6 + c, y0 + 2 + r, 1, 1);
          }
        });
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xe8e8e8, fog: false });
      signQ.forEach((s, i) => {
        const y0 = i * 10, u1 = s.tw / AW, v0 = 1 - (y0 + s.th) / AH, v1 = 1 - y0 / AH;
        const uv = s.face.geometry.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * u1, v0 + uv.getY(k) * (v1 - v0));
        s.face.material = mat;
      });
    }
    function strut(p, a, b, s, m) {
      const va = new V(a[0], a[1], a[2]), vb = new V(b[0], b[1], b[2]);
      const o = K.box(s, va.distanceTo(vb), s, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, p);
      o.quaternion.setFromUnitVectors(YA, vb.sub(va).normalize());
      return o;
    }

    // ---------------------------------------------------------------- animated bookkeeping
    const scroll = [], chases = [], dripPts = [], flips = [], chuteLamps = [];
    // a belt stands still while everything on it is stopped (an item waiting at its end never slides)
    const RUN = new Map();
    const runF = (p) => (RUN.has(p) ? RUN.get(p) : 1);
    const spinSets = { hub: [], table: [], tableRw: [], gear: [], wheel: [] };
    const addSpin = (set, pos, q, axis, scale, rate) => { const e = { pos: pos.clone(), q: q.clone(), axis, s: scale || new V(1, 1, 1), ang: K.rnd() * 6, rate }; spinSets[set].push(e); return e; };
    const BS = {
      n: scroller(M.tx.belt, belts.filter((b) => !b.rework).length, { shine: 26, spec: 0x2a2620 }),
      r: scroller(M.tx.beltRw, belts.filter((b) => b.rework).length + chutes.length, { shine: 26, spec: 0x2a2620 }),
    };
    const CH = scroller(M.tx.chain, lifts.length * 2, { shine: 30, spec: 0x555555 });
    const chainSlots = [];

    // =====================================================================
    // BELTS
    // =====================================================================
    const segG = (parent, sg) => { const g = K.group(parent, sg.a.x, sg.a.y, sg.a.z); g.rotation.order = 'YZX'; g.rotation.y = sg.yaw; return g; };
    const nearSign = (yaw) => (Math.cos(yaw) >= -0.01 ? 1 : -1);
    const toW = (sg, lx, lz, out) => out.set(sg.a.x + Math.cos(sg.yaw) * lx + Math.sin(sg.yaw) * lz, sg.a.y, sg.a.z - Math.sin(sg.yaw) * lx + Math.cos(sg.yaw) * lz);
    // belt top: u in world units along the path (u = s / per), v = the path's slot + across
    function topPlane(len, w, sc, slot, cx, uA, uB, parent) {
      const geo = new THREE.PlaneGeometry(len, w); geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uA + uv.getX(i) * (uB - uA), slot + 0.02 + uv.getY(i) * 0.96);
      return noShadow(K.mesh(geo, sc.m, cx, 0.003, 0, parent));
    }
    function turntable(v, rw, p) {
      const base = K.group(stat, v.x, v.y, v.z);
      K.cyl(0.6, 0.62, 0.14, rw ? M.steel : M.ironL, 12, 0, -0.08, 0, base);
      K.cyl(0.66, 0.66, 0.05, rw ? M.redD : M.brassD, 12, 0, -0.16, 0, base);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; K.box(0.06, 0.06, 0.06, M.brassL, Math.cos(a) * 0.62, -0.12, Math.sin(a) * 0.62, base); }
      const top = onDeck(v.x, v.y, v.z, 0);
      if (top !== null) { const h = v.y - top - 0.15; K.cyl(0.14, 0.2, h, M.iron, 8, 0, -0.15 - h / 2, 0, base); K.cyl(0.2, 0.22, 0.05, M.ironM, 8, 0, top - v.y + 0.03, 0, base); }
      addSpin(rw ? 'tableRw' : 'table', new V(v.x, v.y + 0.006, v.z), new Q(), YA, null, () => 1.2 * p.flow * runF(p));
    }
    // gear drive (the mockup's): motor housing under the belt's far side, two gears on its outer face
    let drives = 0;
    function drive(pc, p, lx) {
      const { g, sg } = pc, side = -pc.ns;
      toW(sg, lx, side * (W / 2 + 0.42), tv);
      const top = onDeck(tv.x, sg.a.y, tv.z, 0.3); if (top === null) return false;
      const h = sg.a.y - top;
      const dg = K.group(g, lx, 0, side * (W / 2 + 0.42));
      K.box(0.62, h - 0.2, 0.5, M.ironM, 0, -h / 2 - 0.1, 0, dg);
      K.box(0.72, 0.08, 0.6, M.rust, 0, -0.32, 0, dg);
      for (let i = 0; i < 4; i++) K.box(0.64, 0.03, 0.52, M.ironL, 0, -h + 0.25 + i * 0.09, 0, dg);
      const mot = K.cyl(0.2, 0.2, 0.5, M.iron, 10, -0.05, -h + 0.42, side * 0.12, dg); mot.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) { const f = K.cyl(0.24, 0.24, 0.03, M.ironL, 10, -0.05, -h + 0.42, side * (-0.08 + i * 0.09), dg); f.rotation.x = Math.PI / 2; }
      K.box(0.16, 0.1, 0.16, M.brass, -0.05, -h + 0.68, side * 0.12, dg);
      K.box(0.86, 0.5, 0.06, M.hazard, 0.05, -0.15, side * 0.3, dg);
      K.box(0.86, 0.06, 0.22, M.ironL, 0.05, 0.1, side * 0.22, dg);
      const gz = side * (W / 2 + 0.42 + 0.34);
      K.box(0.08, 0.3, 0.04, M.soot, lx - 0.2, -0.36, gz, g); K.box(0.08, 0.3, 0.04, M.soot, lx + 0.2, -0.36, gz, g);
      const qb = new Q().setFromAxisAngle(YA, sg.yaw).multiply(new Q().setFromAxisAngle(XA, Math.PI / 2));
      toW(sg, lx, gz, tv); tv.y += -0.12;
      addSpin('gear', tv, qb, YA, new V(0.32, 0.08, 0.32), () => 2.2 * p.flow * runF(p));
      toW(sg, lx - 0.05, gz, tv); tv.y += -0.62;
      addSpin('gear', tv, qb, YA, new V(0.16, 0.08, 0.16), () => -4.4 * p.flow * runF(p));
      dripPts.push([tv.x, sg.a.y + 0.12 - 1, tv.z]);
      drives++;
      return true;
    }
    const beltInfo = new Map();
    function buildBelt(p) {
      const rw = !!p.rework;
      const [tA, tB] = TR.get(p);
      const sA = tA, sB = p.L - tB;
      const sc = rw ? BS.r : BS.n, slot = sc.slot(), per = rw ? 1.5 : 2.5;
      scroll.push({ p, sc, slot, per });
      RUN.set(p, 1);
      const lamp0 = LA.alloc(4, rw ? 0x381408 : 0x382610);
      chases.push({ p, base: lamp0, rw });
      const segs = p.segs, nS = segs.length;
      const vis = [];
      let lampN = 0;
      segs.forEach((sg, si) => {
        const a = si === 0 ? sA : Math.max(0, sA - sg.L0);
        const b = si === nS - 1 ? sB - sg.L0 : Math.min(sg.len, sB - sg.L0);
        const len = b - a; if (len < 0.04) return;
        const g = segG(stat, sg), ns = nearSign(sg.yaw), cx = (a + b) / 2;
        vis.push({ sg, si, a, b, g, ns });
        topPlane(len, W - 0.02, sc, slot, cx, (sg.L0 + a) / per, (sg.L0 + b) / per, g);
        K.box(len, 0.1, W, M.soot, cx, -0.05, 0, g);
        K.box(len, 0.04, W * 0.86, M.soot, cx, -0.3, 0, g);
        for (let x = a + 0.21; x < b - 0.05; x += 0.42) { const r = K.cyl(0.07, 0.07, W + 0.04, M.ironXL, 6, x, -0.16, 0, g); r.rotation.x = Math.PI / 2; }
        for (const s of [-1, 1]) {
          const nr = s === ns;
          K.box(len + 0.1, 0.28, 0.08, rw ? M.steel : M.iron, cx, -0.12, s * (W / 2 + 0.05), g);
          K.box(len + 0.1, 0.05, 0.14, rw ? (nr ? M.red : M.steelL) : (nr ? M.rustL : M.rust), cx, 0.04, s * (W / 2 + 0.07), g);
          K.box(len + 0.1, 0.04, 0.1, M.ironM, cx, -0.27, s * (W / 2 + 0.06), g);
          if (rw && nr) noShadow(uvs(K.box(len + 0.06, 0.1, 0.014, M.haz, cx, -0.135, s * (W / 2 + 0.096), g), (len + 0.06) / 0.34, 1));
          else for (let x = a + 0.2; x < b; x += 0.4) K.box(0.06, 0.06, 0.03, rw ? M.ironXL : M.brassL, x, -0.1, s * (W / 2 + 0.1), g);
        }
        for (let x = a + 0.45; x < b - 0.2; x += 0.95) lampBox(lamp0 + (lampN++ % 4), 0.12, 0.07, 0.05, x, -0.02, ns * (W / 2 + 0.11), g);
        for (let x = a + 0.3; x < b; x += 1.3 + K.rnd()) noShadow(K.box(0.25 + K.rnd() * 0.4, 0.2, 0.01, M.grime, x, -0.15, ns * (W / 2 + 0.104), g));
        // legs down to the deck
        const n = Math.max(1, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) {
          const lx = a + (len * i) / n; toW(sg, lx, 0, tv);
          const top = onDeck(tv.x, sg.a.y, tv.z); if (top === null) continue;
          const deckY = top - sg.a.y, h = -deckY - 0.34; if (h < 0.05) continue;
          for (const s of [-1, 1]) { K.box(0.1, h, 0.1, M.iron, lx, -0.34 - h / 2, s * (W / 2 + 0.02), g); K.box(0.2, 0.05, 0.2, M.ironM, lx, deckY + 0.03, s * (W / 2 + 0.02), g); }
          K.box(0.08, 0.08, W + 0.12, M.ironM, lx, -0.34 - h * 0.55, 0, g);
        }
        if (len > 2.2) {
          toW(sg, cx, 0, tv); const top = onDeck(tv.x, sg.a.y, tv.z);
          if (top !== null) {
            const deckY = top - sg.a.y;
            K.box(Math.min(1.4, len * 0.4), 0.05, W * 0.9, M.ironM, cx, deckY + 0.04, 0, g);
            for (const s of [-1, 1]) K.box(Math.min(1.4, len * 0.4), 0.08, 0.03, M.ironL, cx, deckY + 0.08, s * W * 0.45, g);
            const pd = K.sph(1, M.oil, cx, deckY + 0.075, 0, g, 10, 4); pd.scale.set(Math.min(0.6, len * 0.17), 0.012, W * 0.36); pd.castShadow = false;
            for (let k = 0; k < 2; k++) { toW(sg, cx + (k - 0.5) * 0.5, 0, tv); dripPts.push([tv.x, sg.a.y - 0.32, tv.z]); }
          }
        }
      });
      // end drums: hazard plate, brass brackets, a spoked hub on the camera side that turns with the belt
      const cap = (pc, x, dir) => {
        const { g, ns, sg } = pc;
        const d = K.cyl(0.12, 0.12, W + 0.1, rw ? M.steelL : M.ironL, 10, x, -0.08, 0, g); d.rotation.x = Math.PI / 2;
        noShadow(uvs(K.box(0.04, 0.24, W + 0.2, M.haz, x + dir * 0.13, -0.12, 0, g), (W + 0.2) / 0.3, 1));
        for (const s of [-1, 1]) K.box(0.16, 0.16, 0.05, M.brassD, x, -0.08, s * (W / 2 + 0.12), g);
        toW(sg, x, ns * (W / 2 + 0.16), tv); tv.y -= 0.08;
        addSpin('hub', tv, new Q().setFromAxisAngle(YA, sg.yaw), ZA, null, () => -p.speed * p.flow * runF(p) / 0.12);
      };
      if (vis.length) {
        if (!contStart(p)) cap(vis[0], vis[0].a, -1);
        if (!contEnd(p)) { const v = vis[vis.length - 1]; cap(v, v.b, 1); }
      }
      // corners (a straight-on joint between two segments needs none)
      for (let i = 1; i < nS; i++) {
        const sg = segs[i];
        if (!(sg.L0 > sA + 0.05 && sg.L0 < sB - 0.05)) continue;
        if (segDir(segs[i - 1]).dot(segDir(sg)) > 0.985) continue;
        turntable(sg.a, rw, p);
      }
      // one gear drive on the longest visible run of a long belt
      const total = vis.reduce((n, v) => n + v.b - v.a, 0);
      if (total > 4.2 && drives < 8) {
        const lg = vis.reduce((m, v) => (!m || v.b - v.a > m.b - m.a ? v : m), null);
        if (lg && lg.b - lg.a > 1.6) drive(lg, p, lg.a + Math.min(0.75, (lg.b - lg.a) * 0.3));
      }
      beltInfo.set(p, { vis, sA, sB });
    }

    // joints where belts continue into each other: corner turntables, or a diverter at a plan-belt junction
    function buildJoints() {
      const joints = new Map();
      belts.forEach((b) => belts.forEach((c) => {
        if (c === b || !near(first(c), last(b))) return;
        const k = key(last(b));
        if (!joints.has(k)) joints.set(k, { pt: last(b), ins: new Set(), outs: new Set() });
        joints.get(k).ins.add(b); joints.get(k).outs.add(c);
      }));
      joints.forEach((j) => {
        const ins = [...j.ins], outs = [...j.outs];
        const junction = ins.some((b) => b.junction || typeof b.next === 'function') && outs.length > 1;
        if (junction) { diverter(j, ins[0], outs); return; }
        const dI = segDir(ins[0].segs[ins[0].segs.length - 1]), dO = segDir(outs[0].segs[0]);
        if (outs.length === 1 && dI.dot(dO) > 0.985) return;
        turntable(new V(j.pt[0], j.pt[1], j.pt[2]), !!outs[0].rework, outs[0]);
      });
    }

    // DIVERTER at a plan-belt junction: a hazard-striped flipper hinged on the outer rail that swings across to line
    // the spur (and close the straight way) a moment before an item bound for that assembler arrives; a signal head
    // shows which way the next item goes
    function diverter(j, inP, outs) {
      const v = new V(j.pt[0], j.pt[1], j.pt[2]);
      const spur = outs.find((o) => o.name.startsWith('spur-')) || outs[0];
      const straight = outs.find((o) => o !== spur) || outs[0];
      const dIn = segDir(inP.segs[inP.segs.length - 1]), dSt = segDir(straight.segs[0]), dSp = segDir(spur.segs[0]);
      const right = new V(-dIn.z, 0, dIn.x);
      const side = dSp.dot(right) > 0 ? -1 : 1; // the paddle hinges on the side away from the spur
      const out = right.clone().multiplyScalar(side);
      // junction plate (static): a turntable-style base with a hazard rim
      const base = K.group(stat, v.x, v.y, v.z);
      K.cyl(0.64, 0.66, 0.14, M.ironL, 14, 0, -0.08, 0, base);
      K.cyl(0.7, 0.7, 0.05, M.brassD, 14, 0, -0.16, 0, base);
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; K.box(0.07, 0.06, 0.07, k % 2 ? M.soot : M.hazard, Math.cos(a) * 0.67, -0.12, Math.sin(a) * 0.67, base); }
      const top = onDeck(v.x, v.y, v.z, 0);
      if (top !== null) { const h = v.y - top - 0.15; K.cyl(0.16, 0.22, h, M.iron, 8, 0, -0.15 - h / 2, 0, base); K.cyl(0.24, 0.26, 0.05, M.ironM, 8, 0, top - v.y + 0.03, 0, base); }
      addSpin('table', new V(v.x, v.y + 0.006, v.z), new Q(), YA, null, () => 1.2 * inP.flow * runF(inP));
      // pivot post just outside the outer rail
      const pv = v.clone().addScaledVector(out, W / 2 + 0.14);
      const pb = K.group(stat, pv.x, pv.y, pv.z);
      K.cyl(0.07, 0.08, 0.62, M.ironM, 8, 0, 0.0, 0, pb);
      K.cyl(0.1, 0.1, 0.06, M.brass, 10, 0, 0.32, 0, pb);
      K.box(0.3, 0.06, 0.3, M.ironM, 0, -0.3, 0, pb);
      // the paddle (dyn): steel blade with hazard stripes both faces, a rubber lip on the belt, brass hinge and tip
      const fl = K.dyn(K.group(root, pv.x, pv.y, pv.z));
      K.box(1.02, 0.28, 0.05, M.steelL, 0.56, 0.16, 0, fl);
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) K.box(0.155, 0.22, 0.012, k % 2 ? M.soot : M.hazard, 0.14 + k * 0.165, 0.16, s * 0.031, fl);
      K.box(1.0, 0.04, 0.07, M.soot, 0.57, 0.02, 0, fl);
      K.cyl(0.07, 0.07, 0.36, M.brassL, 8, 0, 0.16, 0, fl);
      K.box(0.12, 0.12, 0.09, M.brassD, 1.06, 0.16, 0, fl);
      vcBake(fl, false);
      // signal head on the outer side: lamps for the two ways (lit = where the next item goes)
      const sh = v.clone().addScaledVector(out, W / 2 + 0.5).addScaledVector(dIn, -0.55);
      K.box(0.07, 1.25, 0.07, M.iron, sh.x, sh.y - 0.28, sh.z, stat);
      K.box(0.2, 0.05, 0.2, M.ironM, sh.x, top !== null ? top + 0.03 : sh.y - 0.88, sh.z, stat);
      K.box(0.26, 0.4, 0.14, M.ironM, sh.x, sh.y + 0.5, sh.z, stat);
      K.box(0.3, 0.04, 0.18, M.brassD, sh.x, sh.y + 0.72, sh.z, stat);
      const lSt = LA.alloc(1, 0x2a1c08), lSp = LA.alloc(1, 0x0c2a14);
      lampBox(lSt, 0.15, 0.12, 0.04, sh.x, sh.y + 0.59, sh.z + 0.08, stat);
      lampBox(lSp, 0.15, 0.12, 0.04, sh.x, sh.y + 0.41, sh.z + 0.08, stat);
      const yawSt = yawOf(dSt), yawSp = yawOf(dSp);
      fl.rotation.y = yawSt;
      flips.push({ inP, spur, straight, dest: spur.name.slice(5), fl, ang: yawSt, target: yawSt, yawSt, yawSp, lSt, lSp });
    }

    // =====================================================================
    // REJECT CHUTES: short red roller troughs from a check's reject outlet onto the rework belt
    // =====================================================================
    function buildChute(p) {
      const pt = portTrim(first(p));
      const sA = pt !== null ? pt : 0.25, sB = p.L - 0.36;
      const sc = BS.r, slot = sc.slot(), per = 1.5;
      scroll.push({ p, sc, slot, per }); RUN.set(p, 1);
      const segs = p.segs, nS = segs.length;
      segs.forEach((sg, si) => {
        const a = si === 0 ? sA : Math.max(0, sA - sg.L0);
        const b = si === nS - 1 ? sB - sg.L0 : Math.min(sg.len, sB - sg.L0);
        const len = b - a; if (len < 0.04) return;
        const g = K.group(stat, sg.a.x, sg.a.y, sg.a.z); g.rotation.order = 'YZX'; g.rotation.y = sg.yaw; g.rotation.z = sg.pitch;
        const cx = (a + b) / 2;
        // bed: a short steep rework belt (steel slats, red chevrons running down onto the lip belt)
        topPlane(len, 0.54, sc, slot, cx, (sg.L0 + a) / per, (sg.L0 + b) / per, g);
        K.box(len, 0.07, 0.6, M.redD, cx, -0.037, 0, g);
        K.box(len, 0.05, 0.5, M.soot, cx, -0.1, 0, g);
        for (const s of [-1, 1]) { K.box(len, 0.16, 0.05, M.iron, cx, 0.03, s * 0.3, g); K.box(len + 0.02, 0.04, 0.09, M.red, cx, 0.12, s * 0.3, g); }
        for (let x = a + 0.25; x < b; x += 0.5) { K.box(0.05, 0.05, 0.03, M.brassL, x, 0.03, 0.335, g); K.box(0.05, 0.05, 0.03, M.brassL, x, 0.03, -0.335, g); }
        if (si === nS - 1) {
          // tongue over the rework belt's back rail
          K.box(0.24, 0.03, 0.56, M.steelL, b + 0.1, -0.05, 0, g);
          noShadow(uvs(K.box(0.03, 0.12, 0.62, M.haz, b + 0.02, 0.04, 0, g), 2, 1));
        }
      });
      // a leg under the hump, a red lamp that blinks as a reject drops
      const hump = segs[0].b;
      const top = onDeck(hump.x, hump.y - 0.25, hump.z);
      if (top !== null) {
        K.box(0.09, hump.y - 0.12 - top, 0.09, M.ironM, hump.x, (hump.y - 0.12 + top) / 2, hump.z, stat);
        K.box(0.2, 0.05, 0.2, M.ironM, hump.x, top + 0.03, hump.z, stat);
        const li = LA.alloc(1, 0x3a0c08);
        K.box(0.05, 0.42, 0.05, M.iron, hump.x + 0.38, hump.y + 0.05, hump.z, stat);
        lampSph(li, 0.075, hump.x + 0.38, hump.y + 0.3, hump.z, stat);
        chuteLamps.push({ p, li, t: 0 });
      }
    }

    // =====================================================================
    // BUCKET ELEVATORS (rw-drop, gate-drop): the mockup's rework tower, its chain loop turned so the return leg
    // runs on the free side. Empty buckets hang upside down on the return leg, spread out when idle; one waits at
    // the boarding point and is swapped for the loaded bucket (carrierPick), which is swapped back at the bottom
    // =====================================================================
    const elev = {};
    function chainBox(len, x, y, z, parent, slot) {
      const o = K.box(0.07, len, 0.07, CH.m, x, y, z, parent);
      const pa = o.geometry.attributes.position, uv = o.geometry.attributes.uv;
      for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getY(i) + len / 2) * 3, slot + 0.5 + (pa.getX(i) + pa.getZ(i)) * 5);
      o.castShadow = false;
      return o;
    }
    function pickReturn(p, X, Z, Ybot, Ytop, R, half, headHigh) {
      let best = null;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, u = [Math.sin(a), -Math.cos(a)];
        if (u[1] > 0.45) continue; // never in front of the loaded leg
        const rx = X + u[0] * 2 * R, rz = Z + u[1] * 2 * R, mx = X + u[0] * R, mz = Z + u[1] * R;
        if (massHit(rx, rz, Ybot, Ytop) || massHit(mx, mz, Ybot, Ytop)) continue;
        let clr = 9;
        visSegs.forEach((s) => {
          const atBot = Math.abs(s.y - Ybot) < 0.3, atTop = Math.abs(s.y - Ytop) < 0.3;
          if (!atBot && !atTop) return;
          clr = Math.min(clr, segDist(rx, rz, s) - 0.47 - half);
          if (atBot || !headHigh) clr = Math.min(clr, segDist(mx, mz, s) - 0.47 - half * 0.6);
        });
        const T = tierOf(Ybot), onD = rx > T.x0 && rx < T.x1 && rz > T.z0 && rz < T.z1;
        const score = Math.min(clr, 0.3) + (onD ? 0.5 : 0) - u[1] * 0.3 - (clr < -0.04 ? 5 : 0);
        if (!best || score > best.score) best = { u, score };
      }
      return best ? best.u : [1, 0];
    }
    function bucketLift(p) {
      const p0 = first(p), p1 = last(p);
      const X = p0[0], Z = p0[2], down = p0[1] > p1[1];
      const Ytop = Math.max(p0[1], p1[1]), Ybot = Math.min(p0[1], p1[1]);
      const base = deckTop(Ybot);
      const R = 0.55, Hh = down ? 0.8 : 0.3;
      const u = pickReturn(p, X, Z, Ybot, Ytop, R, 0.3, Hh > 0.6);
      const phi = Math.atan2(-u[0], -u[1]);
      const cph = Math.cos(phi), sph = Math.sin(phi);
      const lr = (lx, lz) => [X + lx * cph + lz * sph, Z - lx * sph + lz * cph];
      const Yb = Ybot, Yh = Ytop + Hh, LEG = Yh - Yb, LT = 2 * LEG + 2 * Math.PI * R;
      const L = { p, X, Z, phi, R, Yb, Yh, LEG, LT, dirC: down ? -1 : 1, dBoard: (down ? Ytop : Ybot) - Yb, dAlight: (down ? Ybot : Ytop) - Yb, top: Yh + R + 0.5, run: 0 };
      L.retLen = LT - Math.abs(L.dBoard - L.dAlight);
      L.boardY = down ? Ytop : Ybot;
      L.qPhi = new Q().setFromAxisAngle(YA, phi);
      const top = L.top;
      const tg = K.group(stat, X, 0, Z); tg.rotation.y = phi;
      const cam = [-sph, cph]; // root +z (the camera side) in the tower's local x,z
      const hwx = 0.6, hwz = 0.5;
      // corner posts (split where a belt passes through), red stripes on the camera side, foot plates
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const [rx, rz] = lr(sx * hwx, sz * hwz);
        postSpans(rx, rz, base, top, 0.07).forEach(([a, b]) => {
          K.box(0.14, b - a, 0.14, M.ironM, sx * hwx, (a + b) / 2, sz * hwz, tg);
          if (b - a > 0.8) K.box(0.05, b - a - 0.3, 0.02, M.red, sx * hwx + cam[0] * 0.08, (a + b) / 2, sz * hwz + cam[1] * 0.08, tg);
          if (a <= base + 0.01) K.box(0.3, 0.08, 0.3, M.ironM, sx * hwx, base + 0.04, sz * hwz, tg);
        });
      }
      // ties + diagonal struts (kept clear of the belt mouths at the two ends)
      const clearY = (y) => Math.abs(y - Ybot) > 1.1 && Math.abs(y - Ytop) > 1.1 && y < Yh - 0.2;
      for (let y = base + 0.6; y < Yh - 0.4; y += 1.25) {
        if (!clearY(y)) continue;
        K.box(hwx * 2, 0.06, 0.06, M.iron, 0, y, hwz, tg); K.box(hwx * 2, 0.06, 0.06, M.iron, 0, y, -hwz, tg);
        for (const sx of [-1, 1]) K.box(0.06, 0.06, hwz * 2, M.iron, sx * hwx, y, 0, tg);
        if (clearY(y + 1.25)) for (const sx of [-1, 1]) strut(tg, [sx * hwx, y, -hwz], [sx * hwx, y + 1.25, hwz], 0.04, M.iron);
      }
      // return-leg guides (outside the back face) + chains on both legs
      const sF = CH.slot(), sB = CH.slot();
      chainSlots.push({ slot: sF, dir: -L.dirC, L }, { slot: sB, dir: L.dirC, L });
      for (const sx of [-1, 1]) {
        K.box(0.06, LEG + 0.2, 0.1, M.ironL, sx * 0.4, Yb + LEG / 2, -0.13, tg);
        chainBox(LEG, sx * 0.44, Yb + LEG / 2, 0.02, tg, sF);
        chainBox(LEG, sx * 0.44, Yb + LEG / 2, -2 * R, tg, sB);
        K.box(0.06, LEG + 0.2, 0.06, M.steel, sx * 0.47, Yb + LEG / 2, -2 * R - 0.36, tg);
        for (let y = Yb + 0.4; y < Yh; y += 1.25) K.box(0.06, 0.06, 0.5, M.steel, sx * 0.47, y, -2 * R - 0.15, tg);
      }
      // boot (the buckets dip into it) + head frame + top platform with railing
      K.box(1.3, 0.4, 1.0 + 2 * R, M.ironM, 0, base + 0.2, -R + 0.05, tg);
      noShadow(K.box(1.22, 0.05, 0.92 + 2 * R, M.plateC, 0, base + 0.42, -R + 0.05, tg));
      for (const s of [-1, 1]) { K.box(1.34, 0.07, 0.07, M.rust, 0, base + 0.43, -R + 0.05 + s * (0.5 + R), tg); K.box(0.07, 0.07, 1.04 + 2 * R, M.rust, s * 0.635, base + 0.43, -R + 0.05, tg); }
      noShadow(uvs(K.box(1.28, 0.12, 0.04, M.haz, 0, base + 0.3, 0.6, tg), 4, 1));
      const hd = 1.1 + 2 * R;
      K.box(1.3, 0.12, hd, M.ironM, 0, top, -R + 0.05, tg);
      noShadow(K.box(1.8, 0.06, hd + 0.4, M.plateC, 0, top + 0.08, -R + 0.05, tg));
      for (const s of [-1, 1]) {
        K.box(1.8, 0.04, 0.04, M.steel, 0, top + 0.62, -R + 0.05 + s * (hd / 2 + 0.2), tg);
        K.box(0.04, 0.04, hd + 0.4, M.steel, s * 0.9, top + 0.62, -R + 0.05, tg);
        for (const k of [-1, 0, 1]) { K.box(0.04, 0.55, 0.04, M.steel, s * 0.9, top + 0.35, -R + 0.05 + k * (hd / 2 + 0.2), tg); K.box(0.04, 0.55, 0.04, M.steel, k * 0.9, top + 0.35, -R + 0.05 + s * (hd / 2 + 0.2), tg); }
      }
      K.box(0.5, 0.36, 0.4, M.iron, 0, top + 0.3, -R - 0.3, tg);
      for (let i = 0; i < 4; i++) K.box(0.52, 0.03, 0.42, M.ironL, 0, top + 0.18 + i * 0.07, -R - 0.3, tg);
      // sheaves at head and boot, both sides (instanced gears turning with the chain)
      const qS = L.qPhi.clone().multiply(new Q().setFromAxisAngle(ZA, Math.PI / 2));
      for (const cy of [Yh, Yb]) for (const sx of [-1, 1]) {
        const [rx, rz] = lr(sx * 0.47, -R);
        addSpin('gear', new V(rx, cy, rz), qS, YA, new V(R * 0.92, 0.07, R * 0.92), () => L.run * L.dirC * L.p.speed / R);
      }
      for (const cy of [Yh, Yb]) { const ax = K.cyl(0.05, 0.05, 1.0, M.ironL, 6, 0, cy, -R, tg); ax.rotation.z = Math.PI / 2; }
      // the head's camera-facing edge (for the sign) and a beacon: red while a reject rides
      let fz = -1e9; const hx = lr(0, -R + 0.05)[0];
      for (const s of [-1, 1]) for (const k of [-1, 1]) fz = Math.max(fz, lr(s * 0.9, -R + 0.05 + k * (hd / 2 + 0.2))[1]);
      L.signAt = [hx, top + 0.42, fz + 0.04];
      const [bx, bz] = lr(0.55 * Math.sign(cam[0] || 1), 0.4);
      K.cyl(0.07, 0.09, 0.3, M.ironM, 8, bx, top + 0.75, bz, stat);
      L.bc = LA.alloc(1, 0x401010);
      lampSph(L.bc, 0.11, bx, top + 0.95, bz, stat);
      // empties: NE buckets on the loop (one boarding, one queued, the rest spread down the return leg)
      L.NE = 5;
      const S2 = Math.max(1.2, (L.retLen - 3.2) / (L.NE - 2));
      L.rest = (i) => (i === 0 ? L.retLen : Math.max(0.2, L.retLen - 1.2 - (i - 1) * S2));
      L.emp = []; for (let i = 0; i < L.NE; i++) L.emp.push({ tr: L.rest(i) });
      const im = new THREE.InstancedMesh(bucketGeo(K), M.vc, L.NE + 4);
      im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.name = 'belts-buckets';
      K.dyn(im); root.add(im); L.im = im;
      elev[p.name] = L;
      return L;
    }
    const tq2 = new Q();
    function loopPose(L, d, pos, quat) {
      const { LEG, R, Yh, Yb, LT } = L;
      d = ((d % LT) + LT) % LT;
      let y, z, rot;
      if (d < LEG) { y = Yb + d; z = 0; rot = 0; }
      else if (d < LEG + Math.PI * R) { const f = (d - LEG) / R; y = Yh + R * Math.sin(f); z = -R + R * Math.cos(f); rot = -f; }
      else if (d < 2 * LEG + Math.PI * R) { y = Yh - (d - LEG - Math.PI * R); z = -2 * R; rot = -Math.PI; }
      else { const s = (d - 2 * LEG - Math.PI * R) / R; y = Yb - R * Math.sin(s); z = -R - R * Math.cos(s); rot = -Math.PI - s; }
      pos.set(L.X + z * Math.sin(L.phi), y, L.Z + z * Math.cos(L.phi));
      quat.copy(L.qPhi).multiply(tq2.setFromAxisAngle(XA, rot));
    }

    // =====================================================================
    // FREIGHT (LAUNCH) LIFT: an oxide-red lattice tower like the launch gantry, a headframe with a spoked sheave,
    // hoist cables and a counterweight. The cages are MINE's 'cage' carrier: loaded ones climb the front column,
    // empties go over to the second column, come back down it and wait at the bottom
    // =====================================================================
    const cageL = {};
    function cageMesh() {
      let g = null;
      try { if (I.carriers.cage) g = I.carriers.cage.make(I.K, { src: 'github', kind: 'pass', num: 0, id: 0, attempts: 0, parts: {}, carrierMeshes: {}, mesh: null }); } catch (e) { g = null; }
      if (!g) { g = K.group(); K.box(0.9, 0.06, 0.9, 0x3a3029, 0, -0.03, 0, g); }
      K.dyn(g); root.add(g); return g;
    }
    // which way a belt leaves a lift end (outward unit vector in x,z), or null
    function beltOut(pt) {
      for (const b of belts) {
        if (near(first(b), pt)) { const d = segDir(b.segs[0]); return [d.x, d.z]; }
        if (near(last(b), pt)) { const d = segDir(b.segs[b.segs.length - 1]); return [-d.x, -d.z]; }
      }
      return null;
    }
    function cageLift(p) {
      const p0 = first(p), p1 = last(p);
      const X = p0[0], Z = p0[2], up = p1[1] > p0[1];
      const Ytop = Math.max(p0[1], p1[1]), Ybot = Math.min(p0[1], p1[1]);
      const base = deckTop(Ybot), SP = 1.22;
      // the empties' column: the free side (prefer outside the floor above, never in front)
      const cands = [[-1, 0], [1, 0], [0, -1]];
      let u = cands[0], bestS = -1e9;
      cands.forEach((c) => {
        const rx = X + c[0] * SP, rz = Z + c[1] * SP;
        if (massHit(rx, rz, Ybot, Ytop)) return;
        let clr = 9; visSegs.forEach((s) => { if (Math.abs(s.y - Ybot) < 0.3 || Math.abs(s.y - Ytop) < 0.3) clr = Math.min(clr, segDist(rx, rz, s) - 0.47 - 0.48); });
        const TU = tierOf(Ytop), inFront = rx > TU.x0 && rx < TU.x1 ? 0 : 0.4;
        const sc = Math.min(clr, 0.3) + inFront - (clr < -0.04 ? 5 : 0);
        if (sc > bestS) { bestS = sc; u = c; }
      });
      const RX = X + u[0] * SP, RZ = Z + u[1] * SP;
      const L = { p, up, X, Z, RX, RZ, Ytop, Ybot, base, waiting: null, emp: [], pool: [], run: 0, cw: (Ytop + Ybot) / 2 };
      // the empties' loop (cages stay upright): alight -> over to the return column -> down/up it -> back to board
      const yA = up ? Ytop : Ybot, yB = up ? Ybot : Ytop;
      L.loop = [[X, yA, Z], [RX, yA, RZ], [RX, yB, RZ], [X, yB, Z]];
      L.segs = []; let acc = 0;
      for (let i = 0; i < 3; i++) { const a = L.loop[i], b = L.loop[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); L.segs.push({ a, b, l, L0: acc }); acc += l; }
      L.retLen = acc;
      // TOWER
      const xs = [Math.min(X, RX) - 0.62, Math.max(X, RX) + 0.62], zs = [Math.min(Z, RZ) - 0.6, Math.max(Z, RZ) + 0.6];
      const topY = Ytop + 1.45;
      L.topY = topY; L.foot = [xs[0], xs[1], zs[0], zs[1]];
      const cx = (xs[0] + xs[1]) / 2, cz = (zs[0] + zs[1]) / 2, wx = xs[1] - xs[0], wz = zs[1] - zs[0];
      // openings where the belts pass through a face, at the boarding and alighting levels
      const opens = [];
      for (const [pt, y] of [[[X, Ybot, Z], Ybot], [[X, Ytop, Z], Ytop]]) { const d = beltOut(pt); if (d) opens.push({ d, y }); }
      const shut = (face, y0, y1) => opens.some((o) => {
        const hit = face === 'b' ? o.d[1] < -0.5 : face === 'f' ? o.d[1] > 0.5 : face === 'l' ? o.d[0] < -0.5 : o.d[0] > 0.5;
        return hit && y1 > o.y - 1.25 && y0 < o.y + 1.15;
      });
      for (const x of xs) for (const z of zs) { vpost(x, z, base, topY + 0.1, 0.15, M.oxide); K.box(0.32, 0.08, 0.32, M.ironM, x, base + 0.04, z, stat); }
      const mid = (X + RX) / 2, sideBySide = Math.abs(RZ - Z) < 0.01;
      if (sideBySide) vpost(mid, zs[0], base, topY + 0.1, 0.1, M.oxide);
      const lv = []; for (let y = base + 0.5; y < topY - 0.35; y += 1.1) lv.push(y);
      lv.push(topY - 0.05);
      // bays: [x0, x1, z, face]
      const bays = [];
      if (sideBySide) { bays.push([xs[0], mid, zs[0], 'b'], [mid, xs[1], zs[0], 'b']); }
      else bays.push([xs[0], xs[1], zs[0], 'b']);
      const retFront = sideBySide ? (RX < X ? [xs[0], mid] : [mid, xs[1]]) : null;
      const cageFront = sideBySide ? (RX < X ? [mid, xs[1]] : [xs[0], mid]) : [xs[0], xs[1]];
      for (let i = 0; i < lv.length; i++) {
        const y = lv[i], yn = lv[i + 1];
        // ties: back and both sides every level, the front over the return column, over the cage column only
        // below the boarding level and above the top cage
        for (const [x0, x1, z, f] of bays) if (!shut(f, y, y)) K.box(x1 - x0, 0.09, 0.09, M.oxideD, (x0 + x1) / 2, y, z, stat);
        for (const x of xs) if (!shut(x === xs[0] ? 'l' : 'r', y, y)) K.box(0.09, 0.09, wz, M.oxideD, x, y, cz, stat);
        if (retFront && !shut('f', y, y)) K.box(retFront[1] - retFront[0], 0.09, 0.09, M.oxideD, (retFront[0] + retFront[1]) / 2, y, zs[1], stat);
        if ((y < Ybot - 0.2 || y > Ytop + 1.2) && !shut('f', y, y)) K.box(cageFront[1] - cageFront[0], 0.09, 0.09, M.oxideD, (cageFront[0] + cageFront[1]) / 2, y, zs[1], stat);
        if (yn === undefined) continue;
        // X braces on the back bays and the return column's front
        const xb = (x0, x1, z, f) => { if (shut(f, y, yn)) return; strut(stat, [x0 + 0.05, y, z], [x1 - 0.05, yn, z], 0.05, M.oxideD); strut(stat, [x1 - 0.05, y, z], [x0 + 0.05, yn, z], 0.05, M.oxideD); };
        for (const [x0, x1, z, f] of bays) xb(x0, x1, z, f);
        if (retFront && yn < Ytop + 0.2) xb(retFront[0], retFront[1], zs[1] + 0.02, 'f');
      }
      // head platform: chequer plate, hazard band, railing
      K.box(wx + 0.34, 0.14, wz + 0.34, M.ironM, cx, topY + 0.07, cz, stat);
      noShadow(K.box(wx + 0.3, 0.05, wz + 0.3, M.plateC, cx, topY + 0.16, cz, stat));
      noShadow(uvs(K.box(wx + 0.34, 0.12, 0.03, M.haz, cx, topY + 0.06, zs[1] + 0.185, stat), (wx + 0.34) / 0.35, 1));
      for (let x = xs[0] - 0.12; x <= xs[1] + 0.13; x += (wx + 0.24) / 4) K.box(0.04, 0.55, 0.04, M.steel, x, topY + 0.46, zs[1] + 0.12, stat);
      K.box(wx + 0.28, 0.04, 0.04, M.steel, cx, topY + 0.72, zs[1] + 0.12, stat);
      K.box(wx + 0.28, 0.04, 0.04, M.steel, cx, topY + 0.72, zs[0] - 0.12, stat);
      // guide rails + chains for both columns, sprockets at top and bottom
      const run = Ytop - Ybot + 1.3;
      for (const [x, z, dir] of [[X, Z, up ? 1 : -1], [RX, RZ, up ? -1 : 1]]) {
        const sl = CH.slot(); chainSlots.push({ slot: sl, dir, L });
        for (const s of [-1, 1]) {
          K.box(0.05, run, 0.05, M.steel, x + s * 0.52, Ybot + run / 2 - 0.1, z - 0.3, stat);
          chainBox(run - 0.2, x + s * 0.5, Ybot + run / 2, z - 0.42, stat, sl);
        }
        addSpin('gear', new V(x, topY - 0.25, z - 0.42), new Q().setFromAxisAngle(XA, Math.PI / 2), YA, new V(0.32, 0.06, 0.32), () => L.run * dir * 1.6);
        addSpin('gear', new V(x, Ybot - 0.45, z - 0.42), new Q().setFromAxisAngle(XA, Math.PI / 2), YA, new V(0.32, 0.06, 0.32), () => L.run * dir * 1.6);
      }
      // boot pit plate at the bottom
      K.box(wx, 0.12, wz, M.ironM, cx, base + 0.06, cz, stat);
      noShadow(uvs(K.box(wx, 0.1, 0.03, M.haz, cx, base + 0.12, zs[1] + 0.02, stat), wx / 0.35, 1));
      // HEADFRAME: A-frame legs front and back carrying the sheave; the hoist cable drops into the cage column and
      // the counterweight's into its guides outside the tower
      const cwX = RX < X ? xs[0] - 0.34 : xs[1] + 0.34;
      const sR = Math.abs(X - cwX) / 2, sX = (X + cwX) / 2, sY = topY + sR + 0.9;
      for (const dz of [-0.36, 0.36]) {
        strut(stat, [sX - sR * 0.95, topY + 0.14, cz + dz], [sX, sY - 0.12, cz + dz * 0.7], 0.1, M.oxide);
        strut(stat, [sX + sR * 0.95, topY + 0.14, cz + dz], [sX, sY - 0.12, cz + dz * 0.7], 0.1, M.oxide);
        K.box(sR * 1.3, 0.07, 0.07, M.oxideD, sX, topY + 0.14 + (sY - topY) * 0.45, cz + dz * 0.85, stat);
      }
      K.box(0.36, 0.18, 0.7, M.ironM, sX, sY - 0.12, cz, stat);
      { const ax = K.cyl(0.07, 0.07, 0.86, M.brassL, 8, sX, sY, cz, stat); ax.rotation.x = Math.PI / 2; }
      addSpin('wheel', new V(sX, sY, cz + 0.06), new Q(), ZA, new V(sR, sR, sR), () => L.run * (up ? -1 : 1) * p.speed / sR);
      // counterweight on its own guides outside the tower (moves against the top loaded cage)
      for (const s of [-1, 1]) K.box(0.05, topY - base, 0.05, M.steel, cwX, (topY + base) / 2, cz + s * 0.3, stat);
      const cw = K.dyn(K.group(root, cwX, L.cw, cz));
      K.box(0.42, 1.0, 0.44, M.iron, 0, 0, 0, cw);
      for (let i = 0; i < 4; i++) K.box(0.44, 0.04, 0.46, M.ironL, 0, -0.36 + i * 0.24, 0, cw);
      noShadow(uvs(K.box(0.44, 0.22, 0.02, M.haz, 0, 0.28, 0.235, cw), 1.4, 1));
      K.box(0.12, 0.12, 0.12, M.brassD, 0, 0.56, 0, cw);
      vcBake(cw, false);
      L.cwG = cw;
      const cabC = K.dyn(K.box(0.03, 1, 0.03, M.soot, cwX, 0, cz, root)); // counterweight cable (stretched each frame)
      L.cabC = cabC; L.sY = sY; L.cz = cz;
      K.box(0.03, sY - topY, 0.03, M.soot, X, (sY + topY) / 2, cz, stat); // hoist cable into the cage column
      // beacon on the sheave's crosshead
      K.cyl(0.08, 0.1, 0.3, M.ironM, 8, sX, sY + 0.25, cz, stat);
      L.bc = LA.alloc(1, 0x401010);
      lampSph(L.bc, 0.13, sX, sY + 0.48, cz, stat);
      // sign spots: the head railing, and the return column's front half-way up
      L.signTop = [cx, topY + 0.45, zs[1] + 0.2];
      // empties: one waiting at the boarding point, one queued above it, one higher up the return column
      L.NE = 3;
      L.rest = (i) => (i === 0 ? L.retLen : Math.max(0.3, L.retLen - SP - 1.3 - (i - 1) * 4.0));
      // (the return column's sign hangs above the highest parked cage, so it never covers one standing still)
      const parkTop = Ybot + (L.retLen - SP - L.rest(L.NE - 1)) * (up ? 1 : 0) + 1.5;
      L.signMid = retFront ? [(retFront[0] + retFront[1]) / 2, Math.min(Ytop - 1.2, Math.max((Ybot + Ytop) / 2 + 0.6, parkTop + 0.8)), zs[1] + 0.1] : null;
      for (let i = 0; i < L.NE; i++) { const m = cageMesh(); const e = { m, tr: L.rest(i), wait: 0 }; placeCage(L, m, e.tr); L.emp.push(e); }
      cageL[p.name] = L;
      return L;
    }
    function cageAt(L, u, out) {
      u = Math.max(0, Math.min(L.retLen, u));
      let s = L.segs[0]; for (const q of L.segs) if (u >= q.L0) s = q;
      const k = s.l > 1e-6 ? (u - s.L0) / s.l : 0;
      return out.set(s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k, s.a[2] + (s.b[2] - s.a[2]) * k);
    }
    function placeCage(L, m, u) { cageAt(L, u, m.position); m.quaternion.identity(); }
    // landing deck where a lift's exit belt runs off the floor (the freight lift's top: beside the launch deck)
    function landing(lp) {
      const out = belts.find((b) => near(first(b), last(lp)));
      if (!out) return;
      const y = last(lp)[1]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, any = false;
      for (let s = 0; s <= Math.min(out.L, 4.5); s += 0.25) {
        out.at(s, tv);
        if (onDeck(tv.x, y, tv.z, 0.2) !== null) break;
        any = true; x0 = Math.min(x0, tv.x - 0.66); x1 = Math.max(x1, tv.x + 0.66); z0 = Math.min(z0, tv.z - 0.66); z1 = Math.max(z1, tv.z + 0.66);
      }
      if (!any) return;
      const T = tierOf(y);
      // reach the deck edge
      if (x1 < T.x0 + 0.3) x1 = T.x0 + 0.3; if (x0 > T.x1 - 0.3) x0 = T.x1 - 0.3;
      if (z1 < T.z0 + 0.3) z1 = T.z0 + 0.3; if (z0 > T.z1 - 0.3) z0 = T.z1 - 0.3;
      // never through the lift's own tower (the cages climb through there): keep the biggest piece outside it
      const F = cageL[lp.name] && cageL[lp.name].foot;
      if (F && x0 < F[1] && x1 > F[0] && z0 < F[3] && z1 > F[2]) {
        const opts = [[x0, Math.min(x1, F[0] - 0.02), z0, z1], [Math.max(x0, F[1] + 0.02), x1, z0, z1], [x0, x1, z0, Math.min(z1, F[2] - 0.02)], [x0, x1, Math.max(z0, F[3] + 0.02), z1]];
        let best = null, ba = 0.05;
        for (const o of opts) { const a = Math.max(0, o[1] - o[0]) * Math.max(0, o[3] - o[2]); if (a > ba) { ba = a; best = o; } }
        if (!best) return;
        [x0, x1, z0, z1] = best;
      }
      const top = T.y + 0.1;
      pads.push({ x0, x1, z0, z1, top });
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      noShadow(K.box(x1 - x0, 0.16, z1 - z0, M.plateC, cx, top - 0.08, cz, stat));
      K.box(x1 - x0 + 0.06, 0.24, z1 - z0 + 0.06, M.ironM, cx, top - 0.26, cz, stat);
      noShadow(uvs(K.box(x1 - x0, 0.1, 0.03, M.haz, cx, top - 0.2, z1 + 0.045, stat), (x1 - x0) / 0.35, 1));
      // brackets: diagonal struts back to the side of the floor mass it hangs off
      for (const z of [z0 + 0.2, z1 - 0.2]) {
        if (x0 < T.x0 - 0.2) { strut(stat, [x0 + 0.12, top - 0.36, z], [T.x0 + 0.02, top - 1.7, z], 0.1, M.iron); K.box(0.06, 0.3, 0.3, M.ironM, T.x0 + 0.03, top - 1.7, z, stat); }
        else if (x1 > T.x1 + 0.2) { strut(stat, [x1 - 0.12, top - 0.36, z], [T.x1 - 0.02, top - 1.7, z], 0.1, M.iron); K.box(0.06, 0.3, 0.3, M.ironM, T.x1 - 0.03, top - 1.7, z, stat); }
      }
      // railing on the open side
      for (let x = x0 + 0.1; x <= x1 - 0.05; x += Math.max(0.3, (x1 - x0 - 0.15) / 3)) K.box(0.05, 0.7, 0.05, M.steel, x, top + 0.35, z0 + 0.06, stat);
      K.box(x1 - x0, 0.05, 0.05, M.steel, cx, top + 0.7, z0 + 0.06, stat);
    }

    // =====================================================================
    // PNEUMATIC TUBES: glass with brass collars (bigger every fourth, bolted), a copper line, a dim far-side
    // streak, suction rings running ahead of each capsule, steam at the joints; the header carries every
    // assembler's tube along the riser wall, climbs past the checks deck edge and drops capsules onto the CI feed
    // =====================================================================
    const tubeInfo = [];
    const tubeFx = {};
    const wallZ = TI.checks.z1;
    const streakM = K.glow(0x2a9a84, 0.05, true);
    function framesFor(curve, n) {
      const fr = curve.computeFrenetFrames(n, false);
      const t0 = fr.tangents[0];
      const up = new V(0, 1, 0).addScaledVector(t0, -t0.y);
      if (up.lengthSq() < 1e-4) up.set(0, 0, -1).addScaledVector(t0, t0.z);
      up.normalize();
      const n0 = fr.normals[0];
      const ang = Math.atan2(new V().crossVectors(n0, up).dot(t0), n0.dot(up));
      for (let i = 0; i <= n; i++) fr.normals[i].applyAxisAngle(fr.tangents[i], ang);
      return fr;
    }
    function buildTube(p) {
      const pts = p.points.map((q) => new V(q[0], q[1], q[2]));
      const curve = new THREE.CatmullRomCurve3(pts);
      const L = curve.getLength();
      const glass = K.mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.ceil(L * 5)), 0.25, 10, false), M.glass, 0, 0, 0, stat);
      glass.castShadow = false; glass.receiveShadow = false;
      const N = Math.max(12, Math.ceil(L * 4));
      const fr = framesFor(curve, N);
      // copper line along the top (parallel-transported 'up'), dim teal streak on the far side
      const cu = [], st = [];
      for (let i = 0; i <= N; i++) {
        const q = curve.getPointAt(i / N), t = fr.tangents[i];
        cu.push([q.x + fr.normals[i].x * 0.32, q.y + fr.normals[i].y * 0.32, q.z + fr.normals[i].z * 0.32]);
        const far = new V(0, 0, -1).addScaledVector(t, t.z); if (far.lengthSq() < 1e-3) far.set(0, -1, 0); far.normalize();
        st.push([q.x + far.x * 0.16, q.y + far.y * 0.16, q.z + far.z * 0.16]);
      }
      K.tube(cu, 0.04, M.copper, stat, Math.max(16, N * 2), 5);
      noShadow(K.tube(st, 0.035, streakM, stat, Math.max(16, N * 2), 5));
      // collars
      const joints = [];
      let n = 0;
      for (let u = 0.012; u < 0.995; u += 0.62 / L, n++) {
        const q = curve.getPointAt(u), t = curve.getTangentAt(u);
        const big = n % 4 === 0;
        const c = K.torus(big ? 0.31 : 0.28, big ? 0.06 : 0.04, big ? M.brass : M.brassD, 5, 14, q.x, q.y, q.z, stat);
        c.quaternion.setFromUnitVectors(ZA, t);
        if (big) {
          joints.push({ p: q.clone(), s: u * p.L });
          for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; const b = K.box(0.06, 0.06, 0.12, M.brassL, 0, 0, 0, stat); b.position.copy(q).add(new V(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0).applyQuaternion(c.quaternion)); b.quaternion.copy(c.quaternion); }
        }
      }
      const info = { p, curve, L, joints };
      tubeInfo.push(info);
      return info;
    }
    // clamp the tube at curve parameter u to the riser wall behind it (wall plate, arm, split ring)
    function wallClamp(info, u) {
      const q = info.curve.getPointAt(u), t = info.curve.getTangentAt(u);
      const ring = K.torus(0.3, 0.05, M.brassD, 4, 12, q.x, q.y, q.z, stat); ring.quaternion.setFromUnitVectors(ZA, t);
      const z0 = q.z - 0.29, z1 = wallZ + 0.02;
      if (z1 > z0 - 0.05) return;
      K.box(0.12, 0.1, z0 - z1, M.ironL, q.x, q.y - 0.05, (z0 + z1) / 2, stat);
      strut(stat, [q.x, q.y - 0.55, z1 + 0.02], [q.x, q.y - 0.12, (z0 + z1) / 2 + 0.1], 0.06, M.ironM);
      K.box(0.36, 0.6, 0.05, M.ironM, q.x, q.y - 0.25, z1 + 0.025, stat);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) K.box(0.05, 0.05, 0.03, M.brassL, q.x + sx * 0.13, q.y - 0.25 + sy * 0.22, z1 + 0.06, stat);
    }
    const signTube = { fg: '#c8fff0', bg: '#16463c' };
    function buildTubes() {
      tubes.forEach(buildTube);
      const header = tubeInfo.find((i) => i.p.name === 'header');
      // feeder tubes: a collar at the dome fitting, a brass Y-sleeve where each joins the header
      tubeInfo.forEach((ti) => {
        if (ti === header) return;
        const s0 = ti.curve.getPointAt(0.02), t0 = ti.curve.getTangentAt(0.02);
        const c0 = K.torus(0.31, 0.07, M.brass, 5, 14, s0.x, s0.y, s0.z, stat); c0.quaternion.setFromUnitVectors(ZA, t0);
        if (!header) return;
        const e = ti.curve.getPointAt(1), te = ti.curve.getTangentAt(0.93);
        const hu = header.curve.getUtoTmapping(0, Math.max(0, Math.min(header.L, (ti.p.next && ti.p.next.s) || 0)));
        const hp = header.curve.getPointAt(Math.min(1, hu)), ht = header.curve.getTangentAt(Math.min(1, hu));
        const sl = K.cyl(0.31, 0.31, 0.7, M.brass, 12, hp.x, hp.y, hp.z, stat); sl.quaternion.setFromUnitVectors(YA, ht);
        for (const k of [-0.36, 0.36]) { const r = K.torus(0.32, 0.05, M.brassD, 4, 14, hp.x + ht.x * k, hp.y + ht.y * k, hp.z + ht.z * k, stat); r.quaternion.setFromUnitVectors(ZA, ht); }
        const sp = e.clone().addScaledVector(te, -0.32);
        const so = K.cyl(0.29, 0.31, 0.5, M.brassD, 12, sp.x, sp.y, sp.z, stat); so.quaternion.setFromUnitVectors(YA, te);
        const r2 = K.torus(0.3, 0.05, M.brassL, 4, 14, sp.x - te.x * 0.25, sp.y - te.y * 0.25, sp.z - te.z * 0.25, stat); r2.quaternion.setFromUnitVectors(ZA, te);
      });
      if (!header) return;
      const H = header, hp0 = first(H.p);
      // TUBE > signs hung under the straight run, in the widest gaps between the feeders' joins
      const joins = tubes.filter((t) => t !== H.p).map((t) => last(t)[0]).sort((a, b) => a - b);
      const runEnd = H.p.points.reduce((m, q) => (Math.abs(q[1] - hp0[1]) < 0.01 ? Math.max(m, q[0]) : m), hp0[0]);
      const stops = [hp0[0] + 0.6, ...joins, runEnd - 0.6];
      const gaps = [];
      for (let i = 0; i + 1 < stops.length; i++) gaps.push([stops[i], stops[i + 1]]);
      gaps.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
      const signXs = [];
      // (keep a little air around the station clock STRUCTURE hangs on the riser between the assemblers)
      const KEEP = [4.625];
      gaps.slice(0, 2).forEach(([a, b], i) => {
        if (b - a <= (i ? 6 : 3.2)) return;
        let x = (a + b) / 2;
        for (const k of KEEP) if (Math.abs(x - k) < 1.6) { const r = k + 1.6, l = k - 1.6; x = r < b - 0.8 ? r : l > a + 0.8 ? l : x; }
        signXs.push(x);
      });
      // the run sags a little: hang each sign from the tube's own height there
      const runY = (x) => { let b = null; for (let i = 0; i <= 240; i++) { const q = H.curve.getPointAt(i / 240); if (Math.abs(q.z - hp0[2]) < 0.05 && Math.abs(q.y - hp0[1]) < 1.2 && (!b || Math.abs(q.x - x) < Math.abs(b.x - x))) b = q; } return b ? b.y : hp0[1]; };
      signXs.forEach((x) => {
        const y = runY(x);
        sign(stat, 'TUBE >', signTube, x, y - 0.66, hp0[2] + 0.06, 0.26);
        K.box(0.03, 0.34, 0.03, M.iron, x - 0.45, y - 0.36, hp0[2] + 0.02, stat);
        K.box(0.03, 0.34, 0.03, M.iron, x + 0.45, y - 0.36, hp0[2] + 0.02, stat);
      });
      // wall clamps along the straight run and the climb (skip where feeders join and where signs hang)
      for (let s = 0.9; s < H.p.L - 1.0; s += 2.4) {
        H.p.at(s, tv);
        if (tv.z < wallZ + 0.6 && tv.y < TI.checks.y + 2.2 && !joins.some((x) => Math.abs(x - tv.x) < 0.7) && !signXs.some((x) => Math.abs(x - tv.x) < 1.0)) wallClamp(H, H.curve.getUtoTmapping(0, s));
      }
      // blower at the header's dead end: copper volute, impeller, motor, wall bracket
      const t0 = H.curve.getTangentAt(0);
      const bx = hp0[0] - t0.x * 0.95, by = hp0[1], bz = hp0[2];
      const cap = K.cyl(0.3, 0.3, 0.16, M.brass, 12, hp0[0] - t0.x * 0.05, by, bz, stat); cap.rotation.z = Math.PI / 2;
      K.box(0.6, 0.26, 0.26, M.volute, hp0[0] - t0.x * 0.4, by + 0.05, bz, stat);
      const blower = K.group(stat, bx, by + 0.05, bz);
      K.cyl(0.5, 0.5, 0.36, M.volute, 16, 0, 0, 0, blower).rotation.x = Math.PI / 2;
      K.torus(0.5, 0.05, M.brass, 4, 18, 0, 0, 0.19, blower); K.torus(0.5, 0.05, M.brass, 4, 18, 0, 0, -0.19, blower);
      K.box(0.42, 0.34, 0.36, M.volute, 0.38, 0.22, 0, blower);
      K.cyl(0.34, 0.34, 0.04, M.soot, 14, 0, 0, 0.2, blower).rotation.x = Math.PI / 2;
      K.cyl(0.2, 0.2, 0.42, M.iron, 10, 0, 0, -0.42, blower).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) K.cyl(0.24, 0.24, 0.03, M.ironL, 10, 0, 0, -0.28 - i * 0.09, blower).rotation.x = Math.PI / 2;
      for (let i = 0; i < 6; i++) K.box(0.05, 0.05, 0.05, M.brassL, Math.cos(i) * 0.45, Math.sin(i) * 0.45, 0.2, blower);
      if (bz - 0.65 > wallZ) { K.box(0.5, 0.12, bz - wallZ - 0.6, M.ironM, bx, by - 0.4, (bz - 0.6 + wallZ) / 2, stat); K.box(0.6, 0.7, 0.05, M.ironM, bx, by - 0.2, wallZ + 0.03, stat); }
      const imp = K.dyn(K.group(root, bx, by + 0.05, bz + 0.23));
      for (let k = 0; k < 6; k++) { const b = K.box(0.06, 0.6, 0.03, M.brassL, 0, 0, 0, imp); b.rotation.z = (k * Math.PI) / 6; }
      vcBake(imp, false);
      const blowLamp = LA.alloc(1, 0x1e5a4c);
      lampBox(blowLamp, 0.12, 0.12, 0.04, bx + 0.42, by + 0.47, bz + 0.19, stat);
      tubeFx.imp = imp; tubeFx.blowLamp = blowLamp; tubeFx.blow = [bx - 0.5, by + 0.4, bz];
      // drop nozzle at the header's end over the CI feed: brass flare, flap, a post
      const te = last(H.p), tt = H.curve.getTangentAt(1);
      const noz = K.group(stat, te[0], te[1], te[2]); noz.quaternion.setFromUnitVectors(new V(0, -1, 0), tt);
      K.lathe([[0.27, -0.15], [0.3, 0.0], [0.4, 0.12], [0.42, 0.16]], M.brass, 14, 0, 0, 0, noz);
      K.torus(0.42, 0.04, M.brassD, 4, 16, 0, 0.16, 0, noz).rotation.x = Math.PI / 2;
      K.cyl(0.3, 0.3, 0.12, M.brassD, 14, 0, -0.26, 0, noz);
      const flap = K.dyn(K.group(root, te[0] + 0.3, te[1] - 0.12, te[2] + 0.3));
      flap.rotation.y = Math.atan2(-(-0.7), 0.7);
      K.box(0.06, 0.04, 0.62, M.copper, -0.3, 0, 0, flap); K.box(0.06, 0.05, 0.06, M.brassL, 0, 0, 0, flap);
      vcBake(flap, false);
      tubeFx.flap = flap; tubeFx.te = te;
      // support: a post from the deck to the swoop's crest, an arm to the nozzle collar
      const crest = H.curve.getPointAt(0.93);
      const pX = crest.x + 0.35, pZ = crest.z - 0.45;
      const dTop = onDeck(pX, TI.checks.y + 1, pZ, 0);
      if (dTop !== null) {
        vpost(pX, pZ, dTop, crest.y - 0.2, 0.16, M.iron);
        K.box(0.34, 0.08, 0.34, M.ironM, pX, dTop + 0.04, pZ, stat);
        for (let y = dTop + 0.45; y < crest.y - 0.3; y += 0.45) K.box(0.22, 0.05, 0.22, M.brassD, pX, y, pZ, stat);
        strut(stat, [pX, crest.y - 0.25, pZ], [crest.x, crest.y - 0.22, crest.z], 0.07, M.ironL);
        const rr = K.torus(0.3, 0.05, M.brassD, 4, 12, crest.x, crest.y, crest.z, stat); rr.quaternion.setFromUnitVectors(ZA, H.curve.getTangentAt(0.93));
        strut(stat, [pX, te[1] + 0.1, pZ], [te[0], te[1] + 0.25, te[2]], 0.06, M.ironL);
      }
      // TUBE ^ where the header climbs the deck edge
      const climb = H.p.points.find((q) => q[1] > TI.checks.y - 1.2 && q[1] < TI.checks.y);
      if (climb) sign(stat, 'TUBE ^', signTube, climb[0] - 0.75, climb[1] - 0.2, climb[2] + 0.05, 0.28);
    }

    // =====================================================================
    // BUILD
    // =====================================================================
    lifts.forEach((p) => { if (p.carrier === 'bucket') bucketLift(p); else if (p.carrier === 'cage') { cageLift(p); landing(p); } });
    belts.forEach(buildBelt);
    buildJoints();
    chutes.forEach(buildChute);
    buildTubes();
    // REWORK signs: on the rework belts' camera side, and on each bucket drop's head
    const signRw = { fg: '#ffe0c8', bg: '#7a1a10' };
    belts.filter((b) => b.rework).forEach((b) => {
      const info = beltInfo.get(b); if (!info) return;
      info.vis.forEach((pc) => {
        const len = pc.b - pc.a; if (len < 4) return;
        const dx = Math.cos(pc.sg.yaw), arrow = dx < -0.3 ? '<' : dx > 0.3 ? '>' : 'v';
        const label = b.name.startsWith('gate') ? 'SENT BACK' : 'REWORK';
        const txt = arrow === '<' ? '< ' + label : label + ' ' + arrow;
        const nS = Math.max(1, Math.floor(len / 9));
        for (let k = 0; k < nS; k++) {
          // the nearest spot to the middle of this stretch that is clear of the chutes landing on the belt
          const c0 = pc.a + (len * (k + 0.5)) / nS;
          let lx = null;
          for (let j = 0; j < 16 && lx === null; j++) for (const sg of [1, -1]) {
            const cand = c0 + sg * j * 0.25; if (cand < pc.a + 0.9 || cand > pc.b - 0.9) continue;
            toW(pc.sg, cand, 0, tv);
            if (!chutes.some((c) => Math.abs(last(c)[0] - tv.x) < 1.3 && Math.abs(last(c)[1] - tv.y) < 0.5 && Math.abs(last(c)[2] - tv.z) < 1.2)) { lx = cand; break; }
          }
          if (lx === null) continue;
          toW(pc.sg, lx, pc.ns * (W / 2 + 0.135), tv);
          sign(stat, txt, signRw, tv.x, tv.y - 0.16, tv.z, 0.3, pc.ns > 0 ? pc.sg.yaw : pc.sg.yaw + Math.PI);
        }
      });
    });
    Object.values(elev).forEach((L) => sign(stat, L.p.name.startsWith('gate') ? 'SENT BACK v' : 'REWORK v', signRw, L.signAt[0], L.signAt[1], L.signAt[2], 0.26));
    Object.values(cageL).forEach((L) => {
      const signL = { fg: '#ffd27a', bg: '#3a2408' };
      sign(stat, 'LAUNCH LIFT', signL, L.signTop[0], L.signTop[1], L.signTop[2], 0.36);
      if (L.signMid) sign(stat, '^ LAUNCH', signL, L.signMid[0], L.signMid[1], L.signMid[2], 0.22);
    });
    finishSigns();
    // every plain static part: a few vertex-coloured meshes
    vcBake(stat, true);
    LA.flush();

    // instanced spinners: one draw call per kind
    const SPIN = [];
    const mkSpin = (set, geo, shadow) => {
      const list = spinSets[set]; if (!list.length) { geo.dispose(); return; }
      const im = new THREE.InstancedMesh(geo, M.vc, list.length);
      im.frustumCulled = false; im.castShadow = !!shadow; im.receiveShadow = true; im.name = 'spin-' + set;
      K.dyn(im); root.add(im);
      SPIN.push({ im, list });
    };
    mkSpin('hub', hubGeo(K));
    mkSpin('table', tableGeo(K, false));
    mkSpin('tableRw', tableGeo(K, true));
    mkSpin('gear', gearGeo(K, 12));
    mkSpin('wheel', wheelGeo(K, 8), true);
    const sq = new Q();
    const stepSpin = (dt) => SPIN.forEach(({ im, list }) => {
      list.forEach((e, i) => { e.ang += dt * e.rate(); sq.copy(e.q).multiply(tq.setFromAxisAngle(e.axis, e.ang)); m4.compose(e.pos, sq, e.s); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
    });
    stepSpin(0);
    // place the empties once so the first frame is right
    const placeBuckets = (L) => { L.emp.forEach((e, i) => { loopPose(L, L.dAlight + L.dirC * e.tr, tv, tq); m4.compose(tv, tq, ONE); L.im.setMatrixAt(i, m4); }); L.im.count = L.emp.length; L.im.instanceMatrix.needsUpdate = true; };
    Object.values(elev).forEach(placeBuckets);

    // ---------------------------------------------------------------- events: carriers hand over without pops
    I.on('carrierDrop', (e) => {
      const L = elev[e.path];
      if (L && e.carrier === 'bucket') {
        // the loaded bucket tips out at the bottom; an empty takes its place on the chain
        if (L.emp.length < L.NE + 1) L.emp.push({ tr: 0 });
        for (let i = 0; i < 4; i++) K.spawn(root, e.pos.x + K.R() * 0.4, e.pos.y + 0.05, e.pos.z + K.R() * 0.4, K.R() * 0.6, 0.4, K.R() * 0.6, 0x3a332c, 0.6, 0.04, 6);
      }
      const F = cageL[e.path];
      if (F && e.carrier === 'cage') {
        const m = F.pool.pop() || cageMesh();
        m.visible = true; F.emp.push({ m, tr: 0, wait: 0.85 }); placeCage(F, m, 0);
      }
    });
    I.on('carrierPick', (e) => {
      const L = elev[e.path];
      if (L && e.carrier === 'bucket') {
        const cm = e.item.carrierMeshes && e.item.carrierMeshes.bucket; if (cm) cm.quaternion.copy(e.item.mesh.quaternion).invert().multiply(L.qPhi);
        // boarding: the waiting empty becomes this item's bucket (a warm start mid-lift takes none)
        if (Math.abs(e.pos.y - L.boardY) < 0.4 && L.emp.length) { L.emp.sort((a, b) => b.tr - a.tr); L.emp.shift(); }
      }
      const F = cageL[e.path];
      if (F && e.carrier === 'cage') {
        const cm = e.item.carrierMeshes && e.item.carrierMeshes.cage; if (cm) cm.quaternion.copy(e.item.mesh.quaternion).invert();
        if (Math.abs(e.pos.y - (F.up ? F.Ybot : F.Ytop)) < 0.4 && F.emp.length) { F.emp.sort((a, b) => b.tr - a.tr); const r = F.emp.shift(); r.m.visible = false; F.pool.push(r.m); }
      }
    });
    // puffs: a capsule shot into a tube at the dome, and dropped out of the nozzle onto the CI feed; ore crumbs
    const tubeNames = new Set(tubes.map((t) => t.name));
    I.on('enter', (e) => {
      const pth = P[e.path]; if (!pth) return;
      if (tubeNames.has(e.path) && e.path !== 'header') {
        const q = first(pth);
        for (let i = 0; i < 6; i++) K.spawn(root, q[0] + K.R() * 0.3, q[1] + 0.1, q[2] + K.R() * 0.3, K.R() * 1.4, 0.3 + Math.random() * 0.6, K.R() * 1.4, Math.random() < 0.5 ? 0xe8e0d0 : 0xb0a490, 0.6, 0.06, -0.2);
        ringFx(q[0], q[1], q[2], 0x9affea);
      } else if (pth.kind === 'belt' && tubes.some((t) => t.next === e.path)) {
        const q = tubeFx.te || first(pth);
        tubeFx.flapOpen = 1;
        for (let i = 0; i < 10; i++) K.spawn(root, q[0] + K.R() * 0.3, q[1] - 0.2, q[2] + K.R() * 0.3, K.R() * 2.2, -0.2 + Math.random() * 0.8, K.R() * 2.2, Math.random() < 0.5 ? 0xd8d0c0 : 0xa89c88, 0.7, 0.07, -0.2);
        ringFx(q[0], q[1] - 0.3, q[2], 0xd8fff0);
      } else if (pth.kind === 'belt' && e.item.kind === 'issue' && mine(pth)) {
        const v = e.item.mesh.position, col = (ctx.MINES[e.item.src] || { color: 0x8a6a4a }).color;
        for (let i = 0; i < 3; i++) K.spawn(root, v.x + K.R() * 0.3, v.y + 0.08, v.z + K.R() * 0.3, K.R() * 0.8, 0.3 + Math.random() * 0.4, K.R() * 0.8, i ? 0x2a241f : col, 0.9, 0.045, 7);
      } else if (pth.kind === 'chute') {
        const c = chuteLamps.find((x) => x.p === pth); if (c) c.t = 1.4;
      }
    });
    // expanding glow rings (pooled)
    const rings = [];
    for (let i = 0; i < 4; i++) { const r = K.dyn(K.torus(0.3, 0.04, K.glow(0xffffff, 0.8, true), 4, 18, 0, -999, 0, root)); r.visible = false; r.castShadow = false; rings.push({ r, t: 1 }); }
    function ringFx(x, y, z, col) { const f = rings.find((q) => q.t >= 1) || rings[0]; f.t = 0; f.r.position.set(x, y, z); f.r.rotation.set(Math.PI / 2, 0, 0); f.r.material.color.setHex(col); f.r.visible = true; }
    // suction rings that run just ahead of capsules in the glass
    const suckM = K.glow(0x5ae0c8, 0.5, true);
    const suck = [];
    for (let i = 0; i < 6; i++) { const r = K.dyn(K.torus(0.235, 0.018, suckM, 4, 16, 0, -999, 0, root)); r.visible = false; r.castShadow = false; suck.push(r); }

    // =====================================================================
    // UPDATE
    // =====================================================================
    const v = new V(), dirV = new V();
    let tSteam = 0, tDrip = 0;
    return { update(t, dt) {
      // belts: tops scroll with the items; chase lamps walk forward, flash red when jammed
      for (const b of scroll) {
        const p = b.p, r = runF(p) + (((p.items.length && !p.moving) ? 0 : 1) - runF(p)) * Math.min(1, dt * 14);
        RUN.set(p, r);
        b.sc.offs[b.slot] = wrap1(b.sc.offs[b.slot] - (dt * p.speed * p.flow * r) / b.per);
      }
      for (const c of chases) {
        const p = c.p;
        if (p.jammed) { const on = Math.sin(t * 9) > 0; for (let j = 0; j < 4; j++) LA.set(c.base + j, on ? 0xff2a10 : 0x5a0a04); }
        else {
          const k = Math.floor(t * 5 * Math.max(0.2, p.flow * runF(p))) % 4;
          for (let j = 0; j < 4; j++) LA.set(c.base + j, j === k ? (c.rw ? 0xff5a3a : 0xffb040) : (c.rw ? 0x381408 : 0x382610));
        }
      }
      // diverter flippers swing toward the next item's assembler a moment before it arrives
      for (const f of flips) {
        let front = null; for (const it of f.inP.items) if (!front || it.s > front.s) front = it;
        const busy = f.spur.items.some((x) => x.s < 0.55) || f.straight.items.some((x) => x.s < 0.55) || (front && front.s > f.inP.L - 0.2);
        if (front && !busy && front.s > f.inP.L - 2.6) f.target = front.dest === f.dest ? f.yawSp : f.yawSt;
        f.ang += (f.target - f.ang) * Math.min(1, dt * 8);
        f.fl.rotation.y = f.ang;
        const toSp = Math.abs(f.target - f.yawSp) < 0.01, lit = !!front;
        LA.set(f.lSp, toSp ? (lit ? 0x30ff70 : 0x14582a) : 0x0c2a14);
        LA.set(f.lSt, !toSp ? (lit ? 0xffb030 : 0x5a3a0c) : 0x2a1c08);
      }
      // bucket elevators: empties move up to their resting spots at chain speed; the chain runs while anything moves
      for (const name in elev) {
        const L = elev[name], sp = L.p.speed;
        L.emp.sort((a, b) => b.tr - a.tr);
        let mv = false;
        L.emp.forEach((e, i) => { const goal = L.rest(i); if (e.tr < goal - 1e-4) { e.tr = Math.min(goal, e.tr + dt * sp); mv = true; } });
        placeBuckets(L);
        L.p.items.forEach((it) => { const cm = it.carrierMeshes && it.carrierMeshes.bucket; if (cm) cm.quaternion.copy(it.mesh.quaternion).invert().multiply(L.qPhi); });
        const moving = mv || (L.p.items.length > 0 && L.p.moving);
        L.run += ((moving ? 1 : 0) - L.run) * Math.min(1, dt * 6);
        const loaded = L.p.items.length > 0;
        LA.set(L.bc, loaded ? (Math.sin(t * 7) > 0 ? 0xff3010 : 0x400806) : L.p.jammed ? 0xff6010 : 0x401010);
      }
      // freight lift: empties wait out the exiting item, cross over, come down the other column and queue
      for (const name in cageL) {
        const L = cageL[name], sp = L.p.speed;
        L.emp.sort((a, b) => b.tr - a.tr);
        let mv = false;
        L.emp.forEach((e, i) => {
          if (e.wait > 0) { e.wait -= dt; }
          else { const goal = L.rest(i); if (e.tr < goal - 1e-4) { e.tr = Math.min(goal, e.tr + dt * sp * 1.2); mv = true; } }
          placeCage(L, e.m, e.tr);
        });
        let topIt = null; L.p.items.forEach((it) => { const cm = it.carrierMeshes && it.carrierMeshes.cage; if (cm) cm.quaternion.copy(it.mesh.quaternion).invert(); if (!topIt || it.s > topIt.s) topIt = it; });
        const moving = mv || (L.p.items.length > 0 && L.p.moving);
        L.run += ((moving ? 1 : 0) - L.run) * Math.min(1, dt * 6);
        const k = topIt ? topIt.s / L.p.L : 0.5;
        const goal = L.up ? L.Ytop + 0.6 - k * (L.Ytop - L.Ybot) : L.Ybot + 0.6 + k * (L.Ytop - L.Ybot);
        L.cw += (goal - L.cw) * Math.min(1, dt * 3);
        L.cwG.position.y = L.cw;
        const cabTop = L.sY, cabBot = L.cw + 0.62;
        L.cabC.position.y = (cabTop + cabBot) / 2; L.cabC.scale.y = Math.max(0.05, cabTop - cabBot);
        LA.set(L.bc, L.p.items.length ? (Math.sin(t * 6) > 0 ? 0xffa020 : 0x302000) : 0x401010);
      }
      for (const c of chainSlots) CH.offs[c.slot] = wrap1(CH.offs[c.slot] - dt * c.dir * 3 * c.L.p.speed * c.L.run);
      // pneumatic tubes: suction rings ahead of capsules, the streak brightens, steam at the joints, blower + nozzle
      let ri = 0, inTubes = 0;
      for (const ti of tubeInfo) {
        const p = ti.p;
        inTubes += p.items.length;
        for (const it of p.items) {
          if (ri >= suck.length) break;
          if (it.s + 0.55 > p.L) continue;
          const r = suck[ri++];
          const sg = p.at(it.s + 0.55, v); r.visible = true; r.position.copy(v);
          r.quaternion.setFromUnitVectors(ZA, dirV.set(sg.dx, sg.dy, sg.dz).normalize());
        }
      }
      for (; ri < suck.length; ri++) suck[ri].visible = false;
      suckM.opacity = 0.35 + Math.sin(t * 30) * 0.15;
      streakM.opacity += ((inTubes ? 0.18 : 0.05) - streakM.opacity) * Math.min(1, dt * 6);
      if (tubeFx.imp) {
        tubeFx.imp.rotation.z += dt * (inTubes ? 40 : 4);
        LA.set(tubeFx.blowLamp, inTubes ? (Math.sin(t * 14) > 0 ? 0x9affea : 0x3ac0a0) : 0x1e5a4c);
        if (inTubes && Math.random() < dt * 6) K.spawn(root, tubeFx.blow[0], tubeFx.blow[1], tubeFx.blow[2], -0.5 + K.R() * 0.3, 0.6, K.R() * 0.3, 0x9a8e7c, 0.9, 0.08, -0.1);
      }
      if (tubeFx.flap) { tubeFx.flapOpen = Math.max(0, (tubeFx.flapOpen || 0) - dt * 1.6); tubeFx.flap.rotation.z = -tubeFx.flapOpen * 1.2; }
      tSteam -= dt;
      if (tSteam <= 0) {
        tSteam = 0.3;
        for (const ti of tubeInfo) for (const j of ti.joints) {
          const nearIt = ti.p.items.some((it) => Math.abs(it.s - j.s) < 0.8);
          if (Math.random() < (nearIt ? 0.8 : 0.04)) K.spawn(root, j.p.x + K.R() * 0.1, j.p.y + 0.28, j.p.z + 0.2, K.R() * 0.4, 0.5 + Math.random() * 0.4, 0.25, nearIt ? 0xe8e4dc : 0xa8a094, nearIt ? 0.8 : 1.1, 0.055, -0.15);
        }
      }
      for (const f of rings) {
        if (f.t >= 1) continue;
        f.t = Math.min(1, f.t + dt / 0.6);
        f.r.scale.setScalar(1 + f.t * 2.4); f.r.material.opacity = 0.85 * (1 - f.t);
        if (f.t >= 1) f.r.visible = false;
      }
      for (const c of chuteLamps) { c.t = Math.max(0, c.t - dt); LA.set(c.li, c.t > 0 && Math.sin(t * 14) > 0 ? 0xff2a10 : 0x3a0c08); }
      LA.flush();
      stepSpin(dt);
      // oil drips under the belts
      tDrip -= dt;
      if (tDrip <= 0 && dripPts.length) { tDrip = 0.4; const d = dripPts[Math.floor(Math.random() * dripPts.length)]; K.spawn(root, d[0] + K.R() * 0.3, d[1], d[2] + K.R() * 0.3, 0, -0.3, 0, 0x060506, 0.7, 0.045, 7); }
    } };
  });

  // ---------------------------------------------------------------- shared spinner geometry (vertex coloured)
  function hubGeo(K) {
    const P = [[cyg(K, 0.11, 0.11, 0.03, 10, 0, 0, 0, Math.PI / 2), C.ironXL]];
    for (let k = 0; k < 3; k++) P.push([bxg(K, 0.2, 0.035, 0.04, 0, 0, 0.012, 0, 0, (k * Math.PI) / 3), C.soot]);
    return vcMerge(K, P);
  }
  function tableGeo(K, rw) {
    const P = [];
    for (let k = 0; k < 6; k++) P.push([bxg(K, 0.9, 0.035, 0.07, 0, 0, 0, (k * Math.PI) / 6), rw ? C.steelL : C.ironXL]);
    P.push([cyg(K, 0.1, 0.1, 0.05, 8, 0, 0.01, 0), rw ? C.red : C.brass]);
    return vcMerge(K, P);
  }
  function gearGeo(K, teeth) {
    const P = [[cyg(K, 1, 1, 1, Math.max(12, teeth)), C.brass]];
    const tw = ((Math.PI * 2) / teeth) * 0.5;
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; P.push([bxg(K, tw, 0.9, 0.24, Math.sin(a) * 1.08, 0, Math.cos(a) * 1.08, a), C.brass]); }
    P.push([cyg(K, 0.3, 0.3, 1.7, 8), C.ironM]);
    for (let i = 0; i < 3; i++) P.push([bxg(K, 1.5, 1.1, 0.14, 0, 0, 0, (i * Math.PI) / 3), C.brassD]);
    return vcMerge(K, P);
  }
  function wheelGeo(K, spokes) {
    const T = K.THREE;
    const P = [[new T.TorusGeometry(1, 0.07, 6, 28), C.brass], [new T.TorusGeometry(0.82, 0.025, 4, 24), C.brassD]];
    for (let i = 0; i < spokes; i++) P.push([bxg(K, 1.92, 0.05, 0.05, 0, 0, 0, 0, 0, (i * Math.PI) / spokes), C.ironL]);
    P.push([cyg(K, 0.18, 0.18, 0.2, 10, 0, 0, 0, Math.PI / 2), C.brass]);
    return vcMerge(K, P);
  }
}
