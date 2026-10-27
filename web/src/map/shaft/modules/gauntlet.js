// =====================================================================
// THE GAUNTLET (shaft checks floor + the merge gate) — GAUNTLET agent
// Machines 'ci', 'check', 'verify', 'review' (checks floor, work flows right -> left) and 'gate' (launch floor).
// Every checks-floor station carries the PR capsule across its FRONT on its own roller lane (in at the right, out at
// the left), stops it at the station's instrument for the real check, then rolls it on to the next station or shoves
// it forward into the red reject trough at the reject port (the chute below drops it onto the red rework belt).
//   CI INSPECTOR  the capsule rolls into a glass x-ray tunnel; the x-ray tube on its gooseneck sweeps a green beam
//                 along it while the TESTS board's lamps go green one by one and the test tubes bubble.
//                 Red = the failing lamp blinks, the klaxon spins and the tilt table dumps it into the trough.
//   CHECK         one compact instrument per researched tech: leftovers = shaking sieve + sweeper brush, secrets =
//                 vault with a key sniffer, types = stamping press, scope = magnifier + LINES gauge, deps = crate
//                 vs padlock balance, perf = stopwatch dyno, visual = bellows camera, canary = canary cage.
//   VERIFY BAY    a glass bell jar lowers over the capsule and the replay drum plays the original bug back: a
//                 clockwork beetle scuttles out. Fixed = green wash and the beetle flips over; not fixed = red,
//                 sparks, siren and the kicker shoves it into the trough.
//   AI REVIEW     a brass reading machine: the diff tape runs between two reels behind three magnifier lenses under
//                 the aether eye, the reading carriage traverses the capsule, then its stamp comes down and the
//                 sign flips to APPROVED / CHANGES.
//   MERGE GATE    a round vault door in a riveted wall, a big lever and a bell. The capsule waits on the turntable in
//                 front of the door for the player ("Merge #142 into main?"); yes = the lever throws, the bolts
//                 retract and the door rolls aside, the capsule rolls through to the pad; no = the turntable turns it
//                 onto the red siding.
// IDLE = lights down, still. WORKING = lit, turning. BLOCKED = each machine's own alarm (see each builder).
// Real time: a station keeps working until M.judge() returns a verdict, and holds at a port until M.give() says yes.
// =====================================================================

const C45 = Math.SQRT1_2;
const GREEN = 0x46ff8a, RED = 0xff3a2a, AMBER = 0xffb020, TEAL = 0x7af0d8;

// 3x5 pixel font for plates and signs
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
  9: '111101111001111', '#': '101111101111101', '?': '111001010000010', '!': '010010010000010', '.': '000000000000010',
  '-': '000000111000000', '+': '000010111010000', ':': '000010000010000', '/': '001001010100100', ' ': '000000000000000',
};
function glyph(c, ch, x, y, col, s) { const b = FONT[ch] || FONT[' ']; s = s || 1; c.fillStyle = col; for (let k = 0; k < 15; k++) if (b[k] === '1') c.fillRect(x + (k % 3) * s, y + Math.floor(k / 3) * s, s, s); }
function drawText(c, str, x0, y0, col, s) { str.split('').forEach((ch, i) => glyph(c, ch, x0 + i * 4 * s, y0, col, s)); }

// =====================================================================
// SHARED KIT: palette (one per IRON, so static parts merge into few draw calls), textures, text plates
// =====================================================================
function makeKit(K) {
  const THREE = K.THREE, mat = K.mat;
  const P = {
    soot: mat(0x1e1814), dark: mat(0x0e0b09),
    iron: mat(0x3a3029, { shine: 22, spec: 0x2e2e34 }), ironM: mat(0x483c33, { shine: 18, spec: 0x26262c }),
    ironL: mat(0x64574b, { shine: 30, spec: 0x3a3a40 }), ironX: mat(0x7e6f60, { shine: 40, spec: 0x50505a }),
    brass: mat(0xb8883c, { shine: 42, spec: 0x8a6a30 }), brassD: mat(0x7a5822, { shine: 24, spec: 0x4a3818 }),
    brassL: mat(0xe4b85e, { shine: 60, spec: 0xb09050 }), brass2: mat(0xb8883c, { shine: 42, spec: 0x8a6a30, double: true }),
    copper: mat(0xac5a30, { shine: 36, spec: 0x7a4428 }), copperD: mat(0x72401f, { shine: 20, spec: 0x3a1a0a }),
    copper2: mat(0xc06a3a, { shine: 40, spec: 0x8a5030, double: true }),
    verd: mat(0x43927a, { shine: 16 }), verdD: mat(0x2f6a58, { shine: 16 }),
    wood: mat(0x7a5432), woodD: mat(0x4c341f),
    rust: mat(0x92461f), rustD: mat(0x5a2612),
    hazard: mat(0xe0a01c), paint: mat(0xd99a16, { shine: 26, spec: 0x5a4a20 }),
    red: mat(0xa82818, { shine: 22, spec: 0x4a1a10 }), redD: mat(0x6a1a10, { shine: 16 }),
    cream: mat(0xe4d2a8), steel: mat(0x9a9894, { shine: 50, spec: 0x707078 }), ink: mat(0x140c06),
    rubber: mat(0x1c1712), paper: mat(0xe0d2ac), leather: mat(0x4a2a18, { shine: 10 }),
    oil: mat(0x0b0b10, { shine: 90, spec: 0x7a6a9a }), grime: mat(0x0a0806, { op: 0.42, depthWrite: false }),
    glass: mat(0xbfe8da, { op: 0.2, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
    glassG: mat(0x9affc8, { op: 0.24, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
  };
  // PALETTE ATLAS: every plain palette color is one texel of an 8x8 texture (plus a specular-strength map), and a
  // machine's parts in those colors all wear the one atlas material (atlasify() points their UVs at their texel), so
  // the static merge folds a whole machine into one or two draw calls instead of one per color.
  // (plus a glow map: brass and copper keep a little warmth of their own in the dark, like the mockup's metal)
  let atlCtx = null, specCtx = null, emCtx = null, atlN = 0;
  const atlTex = K.canvasTex(8, 8, (c) => { atlCtx = c; c.fillStyle = '#ff00ff'; c.fillRect(0, 0, 8, 8); });
  const specTex = K.canvasTex(8, 8, (c) => { specCtx = c; c.fillStyle = '#000000'; c.fillRect(0, 0, 8, 8); });
  const emTex = K.canvasTex(8, 8, (c) => { emCtx = c; c.fillStyle = '#000000'; c.fillRect(0, 0, 8, 8); });
  const ATLAS = mat(0xffffff, { map: atlTex, shine: 34, spec: 0xb8a07a, e: 0xffffff }); ATLAS.specularMap = specTex; ATLAS.emissiveMap = emTex;
  const ATLAS2 = mat(0xffffff, { map: atlTex, shine: 34, spec: 0xb8a07a, e: 0xffffff, double: true }); ATLAS2.specularMap = specTex; ATLAS2.emissiveMap = emTex;
  const tag = (m, spec, em) => {
    if (atlN >= 64) return m;
    const i = atlN++, x = i % 8, y = Math.floor(i / 8);
    atlCtx.fillStyle = '#' + m.color.getHexString(); atlCtx.fillRect(x, y, 1, 1);
    const s = Math.round(Math.max(0, Math.min(1, spec)) * 255); specCtx.fillStyle = 'rgb(' + s + ',' + s + ',' + s + ')'; specCtx.fillRect(x, y, 1, 1);
    const c = m.color, e = em || 0; emCtx.fillStyle = 'rgb(' + Math.round(c.r * e * 255) + ',' + Math.round(c.g * e * 255) + ',' + Math.round(c.b * e * 255) + ')'; emCtx.fillRect(x, y, 1, 1);
    atlTex.needsUpdate = true; specTex.needsUpdate = true; emTex.needsUpdate = true;
    m.userData.atl = i; return m;
  };
  const specOf = (m) => (m.shininess ? (m.specular.r + m.specular.g + m.specular.b) / 3 / 0.61 : 0);
  const GLOW = { brass: 0.18, brass2: 0.18, brassL: 0.24, brassD: 0.1, copper: 0.12, copper2: 0.12, hazard: 0.12, paint: 0.1 };
  for (const k in P) { const m = P[k]; if (!m.map && !m.transparent && k !== 'oil') tag(m, specOf(m), GLOW[k]); }
  // an extra plain color for one machine (safe enamel, canary yellow...): joins the atlas
  const pals = new Map();
  const pal = (hex, spec) => { const k = hex + ':' + (spec || 0); if (!pals.has(k)) pals.set(k, tag(mat(hex, { shine: 30, spec: 0x333333 }), spec || 0)); return pals.get(k); };
  // point a machine's palette parts at the atlas (call once its group is built)
  const atlasify = (root) => root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material.userData || o.material.userData.atl === undefined) return;
    const i = o.material.userData.atl, u = ((i % 8) + 0.5) / 8, v = 1 - (Math.floor(i / 8) + 0.5) / 8;
    const geo = o.geometry, n = geo.attributes.position.count;
    let uv = geo.attributes.uv;
    if (!uv || uv.count !== n) { uv = new THREE.BufferAttribute(new Float32Array(n * 2), 2); geo.setAttribute('uv', uv); }
    for (let k = 0; k < n; k++) uv.setXY(k, u, v);
    uv.needsUpdate = true;
    o.material = o.material.side === THREE.DoubleSide ? ATLAS2 : ATLAS;
  });
  // SHADOWS: each casting mesh costs a second draw in the shadow pass, so specks don't cast: text plates (their
  // backing plate casts the same shadow), rollers down in their bench, little one-off parts with their own material
  // (lamp lenses, needles), and small moving parts (gears, paddles, hands). Big parts and whole bodies still cast.
  const shade = (root) => {
    root.updateMatrixWorld(true);
    const sv = new THREE.Vector3(), bx = new THREE.Box3(), bs = new THREE.Vector3();
    const rad = (o) => { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(sv); return g.boundingSphere.radius * Math.max(sv.x, sv.y, sv.z); };
    const off = (o) => o.traverse((c) => { if (c.isMesh) c.castShadow = false; });
    const uses = new Map(); root.traverse((o) => { if (o.isMesh) uses.set(o.material, (uses.get(o.material) || 0) + 1); });
    root.traverse((o) => {
      if (o !== root && o.userData.dyn && !o.isMesh) { bx.setFromObject(o); if (!bx.isEmpty() && bx.getSize(bs).length() < 0.66) off(o); }
      if (!o.isMesh || !o.castShadow || Array.isArray(o.material)) return;
      const m = o.material, ud = m.userData || {};
      if (ud.txt || ud.noCast) o.castShadow = false;
      else if (uses.get(m) === 1 && rad(o) < 0.3) o.castShadow = false; // (a shared material merges into one caster anyway)
    });
  };
  const plateTex = K.canvasTex(32, 32, (c) => {
    c.fillStyle = '#4c4238'; c.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) { const o = (y / 8) % 2 ? 4 : 0; c.fillStyle = '#6a5c4e'; c.fillRect((x + o) % 32, y + 2, 3, 1); c.fillRect((x + o + 1) % 32, y + 1, 1, 3); c.fillStyle = '#2e2620'; c.fillRect((x + o + 1) % 32, y + 4, 2, 1); }
    c.fillStyle = 'rgba(10,8,6,0.35)'; c.fillRect(3, 18, 9, 6); c.fillRect(20, 4, 6, 4);
  }, [6, 6]);
  P.plate = mat(0xffffff, { map: plateTex, shine: 20, spec: 0x2a2620 });
  const plateTexS = plateTex.clone(); plateTexS.repeat.set(2, 2); plateTexS.needsUpdate = true;
  P.plateS = mat(0xffffff, { map: plateTexS, shine: 20, spec: 0x2a2620 });
  // riveted wall plates (UVs in world units)
  const wallTex = K.canvasTex(32, 32, (c) => {
    c.fillStyle = '#5a4c40'; c.fillRect(0, 0, 32, 32);
    c.fillStyle = '#4a3e34'; c.fillRect(0, 15, 32, 2); c.fillRect(15, 0, 2, 16); c.fillRect(7, 16, 2, 16); c.fillRect(23, 16, 2, 16);
    c.fillStyle = '#8a7a64'; for (let x = 2; x < 32; x += 4) { c.fillRect(x, 13, 1, 1); c.fillRect(x, 18, 1, 1); }
    c.fillStyle = 'rgba(20,12,8,0.3)'; c.fillRect(3, 3, 8, 5); c.fillRect(19, 22, 9, 6);
    c.fillStyle = 'rgba(120,52,20,0.35)'; c.fillRect(10, 17, 1, 10); c.fillRect(27, 2, 1, 9);
  }, [1.3, 1.3]);
  P.wall = mat(0xffffff, { map: wallTex, shine: 18, spec: 0x2a2620 });
  // rollers: stripes around the circumference, scrolled per machine so the rollers seem to turn
  const rollTex = K.canvasTex(16, 2, (c) => { for (let x = 0; x < 16; x++) { c.fillStyle = x % 8 < 2 ? '#d8c8a8' : x % 8 < 4 ? '#8a7a66' : '#4e4238'; c.fillRect(x, 0, 1, 2); } }, [1, 1]);
  const texts = new Map();
  function textTex(str, o) {
    o = o || {};
    const s = o.s || 1, pad = o.pad === undefined ? 2 : o.pad;
    const tw = str.length * 4 * s - s, w = Math.max(o.w || 0, tw + pad * 2), h = 5 * s + pad * 2;
    return K.canvasTex(w, h, (c) => {
      c.fillStyle = o.bg || '#7a5822'; c.fillRect(0, 0, w, h);
      if (o.rim) { c.fillStyle = o.rim; c.fillRect(0, 0, w, 1); c.fillStyle = o.rimD || 'rgba(0,0,0,0.45)'; c.fillRect(0, h - 1, w, 1); }
      drawText(c, str, Math.round((w - tw) / 2), pad, o.fg || '#1e1408', s);
    });
  }
  // a shared text plate material (same text + style = same material). o.lit = unlit, full bright (glowing signs)
  function text(str, o) {
    const key = str + '|' + JSON.stringify(o || {});
    if (!texts.has(key)) {
      const map = textTex(str, o);
      const tm = o && o.lit ? new THREE.MeshBasicMaterial({ map, fog: false }) : mat(0xffffff, { map, shine: 30, spec: 0x4a3a20, e: (o && o.e) || 0 });
      tm.userData.txt = true; texts.set(key, tm);
    }
    return texts.get(key);
  }
  // a plate whose text is redrawn at run time (issue numbers, verdict signs)
  function liveText(w, h, s) {
    let ctx = null;
    const tex = K.canvasTex(w, h, (c) => { ctx = c; });
    let last = '';
    return {
      tex,
      draw(str, fg, bg, rim) {
        const key = str + fg + bg + rim; if (key === last) return; last = key;
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        if (rim) { ctx.fillStyle = rim; ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1); ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h); }
        const tw = str.length * 4 * s - s;
        drawText(ctx, str, Math.round((w - tw) / 2), Math.round((h - 5 * s) / 2), fg, s);
        tex.needsUpdate = true;
      },
    };
  }
  return { THREE, P, rollTex, text, textTex, liveText, pal, atlasify, shade };
}

// a bank of N boxes in one mesh with per-box position/size/color, rewritten in place: lamp grids, tickers,
// liquid levels. One draw call however many lamps.
function boxBank(K, parent, n, opts) {
  const THREE = K.THREE; opts = opts || {};
  const base = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const bp = base.attributes.position.array, bn = base.attributes.normal.array, V = bp.length / 3;
  const pos = new Float32Array(n * V * 3), nor = new Float32Array(n * V * 3), col = new Float32Array(n * V * 3);
  for (let i = 0; i < n; i++) nor.set(bn, i * V * 3);
  base.dispose();
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
  const ca = new THREE.BufferAttribute(col, 3); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', ca);
  const m = opts.lit ? new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 30, specular: 0x333333 })
    : new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const mesh = new THREE.Mesh(geo, m); mesh.userData.noBake = true; mesh.castShadow = false; mesh.receiveShadow = !!opts.lit;
  K.dyn(mesh); parent.add(mesh);
  const last = new Int32Array(n).fill(-1), tc = new THREE.Color();
  return {
    mesh, n,
    box(i, x, y, z, sx, sy, sz) {
      const o = i * V * 3;
      for (let k = 0; k < V; k++) { pos[o + k * 3] = bp[k * 3] * sx + x; pos[o + k * 3 + 1] = bp[k * 3 + 1] * sy + y; pos[o + k * 3 + 2] = bp[k * 3 + 2] * sz + z; }
      pa.needsUpdate = true;
    },
    color(i, hex) {
      if (last[i] === hex) return; last[i] = hex; tc.setHex(hex);
      const o = i * V * 3; for (let k = 0; k < V; k++) { col[o + k * 3] = tc.r; col[o + k * 3 + 1] = tc.g; col[o + k * 3 + 2] = tc.b; }
      ca.needsUpdate = true;
    },
    bound() { geo.computeBoundingSphere(); geo.computeBoundingBox(); },
  };
}

// local direction -> root yaw, with the paths' convention (Euler YZX, capsule long axis = local x)
const yawOf = (dx, dz) => Math.atan2(-(C45 * (dx + dz)), C45 * (dx - dz));
const blink = (t, hz) => Math.sin(t * hz) > 0;

// per-machine helpers (particles, gears, gauges, pulses, glyphs) bound to the machine's group
function tools(K, g, kit) {
  const { THREE, P } = kit;
  const T = {};
  const E = new THREE.Euler(0, 0, 0, 'YZX'), Q = new THREE.Quaternion();
  T.aim = (it, yaw, pitch, roll, q0, k) => {
    E.set(roll || 0, yaw, pitch || 0, 'YZX'); Q.setFromEuler(E);
    if (q0 && k !== undefined && k < 1) it.mesh.quaternion.copy(q0).slerp(Q, Math.max(0, k)); else it.mesh.quaternion.copy(Q);
  };
  // a group in the station frame turned to face the camera (its +z = root +z): plates, gauges, cabinets
  T.face = (p, x, y, z) => { const f = K.group(p, x, y, z); f.rotation.y = Math.PI / 4; return f; };
  T.gear = (p, r, thick, teeth, m, x, y, z) => {
    const gg = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(10, teeth), 0, 0, 0, gg);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
    K.cyl(r * 0.3, r * 0.3, thick * 1.6, P.ironM, 8, 0, 0, 0, gg);
    if (r > 0.25) for (let i = 0; i < 3; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.14, P.brassD, 0, 0, 0, gg); s.rotation.y = i * Math.PI / 3; }
    return gg;
  };
  T.rivets = (p, cx, cz, r, y, n, m) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.06, 0.06, 0.06, m || P.brassL, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, p); } };
  T.row = (p, x0, y0, z0, x1, y1, z1, n, m, s) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); K.box(s || 0.06, s || 0.06, s || 0.06, m || P.brassL, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k, p); } };
  T.band = (p, cx, cz, r, y, m, h, seg) => K.cyl(r, r, h || 0.1, m || P.brass, seg || 16, cx, y, cz, p);
  // a ring standing in its group's XY plane (faces +z)
  T.ringZ = (p, r, t, m, x, y, z, seg) => K.torus(r, t, m, 4, seg || 16, x, y, z, p);
  // a disc facing +z
  T.discZ = (p, r, d, m, x, y, z, seg) => { const c = K.cyl(r, r, d, m, seg || 14, x, y, z, p); c.rotation.x = Math.PI / 2; return c; };
  // gauge facing +z of its group (ry/rx turn it); returns the needle pivot (rotate .z), marked dyn
  T.gauge = (p, x, y, z, r, ry, rx, rimM) => {
    const gg = K.group(p, x, y, z); gg.rotation.order = 'YXZ'; gg.rotation.y = ry || 0; gg.rotation.x = rx || 0;
    const rim = K.cyl(r * 1.16, r * 1.16, 0.07, rimM || P.brass, 12, 0, 0, 0, gg); rim.rotation.x = Math.PI / 2;
    const face = K.cyl(r, r, 0.08, P.cream, 12, 0, 0, 0.01, gg); face.rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) { const a = -2.1 + i / 6 * 4.2; const tk = K.box(0.014, r * 0.2, 0.014, P.ink, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0.056, gg); tk.rotation.z = -a; }
    const red = K.box(r * 0.5, r * 0.18, 0.02, P.red, r * 0.45, r * 0.45, 0.056, gg); red.rotation.z = -0.8;
    const piv = K.dyn(K.group(gg, 0, 0, 0.062));
    K.box(0.03, r * 0.85, 0.02, P.ink, 0, r * 0.38, 0, piv);
    return piv;
  };
  // hazard stripes along local x of a group at (x,y,z) turned ry
  T.hazard = (p, len, x, y, z, n, ry, h, d) => {
    const gg = K.group(p, x, y, z); gg.rotation.y = ry || 0; const w = len / n;
    for (let i = 0; i < n; i++) K.box(w * 0.96, h || 0.1, d || 0.04, i % 2 ? P.soot : P.hazard, -len / 2 + w * (i + 0.5), 0, 0, gg);
    return gg;
  };
  T.puff = (x, y, z, col, size, vy, spread, life, vx, vz) => K.spawn(g, x + K.R() * spread, y, z + K.R() * spread, (vx || 0) + K.R() * 0.3, vy, (vz || 0) + K.R() * 0.3, col, life || 2, size, -0.12);
  T.steam = (x, y, z, n) => { for (let i = 0; i < (n || 1); i++) K.spawn(g, x + K.R() * 0.06, y, z + K.R() * 0.06, K.R() * 0.35, 2.2 + Math.random(), K.R() * 0.35, Math.random() < 0.5 ? 0xd4ccbc : 0xb8b0a2, 1.3, 0.1, -0.15); };
  T.sparks = (x, y, z, n, col, spd) => { for (let i = 0; i < (n || 6); i++) K.spawn(g, x + K.R() * 0.15, y, z + K.R() * 0.15, K.R() * (spd || 2.4), 0.6 + Math.random() * 1.4, K.R() * (spd || 2.4), col || (Math.random() < 0.5 ? 0xffd25a : 0xfff4d0), 0.45, 0.045, 6, true); };
  T.dust = (x, y, z, n, s) => { for (let i = 0; i < (n || 5); i++) K.spawn(g, x + K.R() * (s || 0.3), y, z + K.R() * (s || 0.3), K.R() * 1.2, 0.3 + Math.random() * 0.4, K.R() * 1.2, Math.random() < 0.5 ? 0x6a5a48 : 0x8a7a64, 0.7, 0.06, -0.2); };
  T.motes = (x, y, z, n, col) => { for (let i = 0; i < (n || 8); i++) { const a = Math.random() * Math.PI * 2; K.spawn(g, x + Math.cos(a) * 0.2, y, z + Math.sin(a) * 0.2, Math.cos(a) * 1.4, 0.8 + Math.random() * 1.2, Math.sin(a) * 1.4, Math.random() < 0.5 ? col : 0xffffff, 0.6, 0.05, 1.5, true); } };
  // handoff pulse: a ring of light where an item changes hands (two reused rings)
  const rings = [0, 1].map(() => { const r = K.torus(0.3, 0.045, K.glow(0xffffff, 0, true), 4, 18, 0, 0, 0, g); r.rotation.x = Math.PI / 2; r.castShadow = false; K.dyn(r); return { r, t: 9 }; });
  T.pulse = (x, y, z, col) => { const p = rings[0].t >= rings[1].t ? rings[0] : rings[1]; p.t = 0; p.r.position.set(x, y, z); p.r.material.color.setHex(col || 0xfff0c0); p.r.visible = true; };
  T.stepPulses = (dt) => rings.forEach((p) => { if (p.t >= 1) { p.r.visible = false; return; } p.t += dt / 0.55; const k = Math.min(1, p.t); p.r.scale.setScalar(1 + k * 2.4); p.r.material.opacity = 0.9 * (1 - k); });
  // verdict glyph: a big green check / red X pops over the machine on the verdict, an amber "!" while blocked
  T.glyph = (x, y, z, s) => {
    const gl = K.dyn(K.group(g, x, y, z)); gl.rotation.y = Math.PI / 4; gl.scale.setScalar(s || 1);
    const gOk = K.glow(0x5aff9a), gNo = K.glow(0xff4030), gBang = K.glow(0xffb020, 0.95), gInk = K.glow(0x120604, 0.7);
    const gC = K.dyn(K.group(gl)), gX = K.dyn(K.group(gl)), gB = K.dyn(K.group(gl));
    const stroke = (grp, w, h, m, sx, sy, rz) => { const a = K.box(w, h, 0.05, m, sx, sy, 0.02, grp); a.rotation.z = rz; const b = K.box(w + 0.09, h + 0.09, 0.04, gInk, sx, sy, -0.02, grp); b.rotation.z = rz; };
    stroke(gC, 0.14, 0.42, gOk, -0.2, -0.12, 0.75); stroke(gC, 0.14, 0.84, gOk, 0.14, 0.06, -0.6);
    for (const r of [0.785, -0.785]) stroke(gX, 0.14, 0.88, gNo, 0, 0, r);
    stroke(gB, 0.16, 0.5, gBang, 0, 0.12, 0); stroke(gB, 0.16, 0.16, gBang, 0, -0.32, 0);
    const frameM = K.glow(0xffffff, 0.5, true);
    K.torus(0.52, 0.03, frameM, 4, 24, 0, 0, 0, gl);
    gl.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    let tt = 0; const y0 = y;
    return {
      gl,
      // kind: 'pass' | 'fail' | 'block' | null
      set(kind, t, dt) {
        gl.visible = !!kind;
        if (!kind) { tt = 0; return; }
        tt += dt;
        gC.visible = kind === 'pass'; gX.visible = kind === 'fail'; gB.visible = kind === 'block';
        const pop = kind === 'block' ? 1 + Math.sin(t * 8) * 0.08 : Math.min(1.25, tt * 6) - Math.max(0, Math.min(0.25, (tt - 0.2) * 2));
        gl.scale.setScalar(Math.max(0.01, pop) * (s || 1));
        frameM.color.setHex(kind === 'block' ? 0xffb020 : kind === 'pass' ? GREEN : RED);
        frameM.opacity = 0.35 + Math.sin(t * 10) * 0.2;
        if (kind === 'block') gBang.opacity = Math.sin(t * 9) > -0.2 ? 0.95 : 0.3;
        gl.position.y = y0 + Math.sin(t * 2) * 0.05;
      },
    };
  };
  // a lamp: a small sphere/box whose own material lights up (returns the material; set .emissive)
  T.lamp = (p, x, y, z, r, off, box) => { const m = K.mat(off || 0x2a1a10, { e: 0, shine: 40, spec: 0x806040 }); const l = box ? K.box(r * 2, r * 1.6, r * 2, m, x, y, z, p) : K.sph(r, m, x, y, z, p, 8, 6); l.castShadow = false; return m; };
  // a half tube (upper half) along the x axis of its parent
  T.halfTube = (p, r, len, m, x, y, z, seg) => { const h = K.mesh(new THREE.CylinderGeometry(r, r, len, seg || 14, 1, true, 0, Math.PI), m, x, y, z, p); h.rotation.z = Math.PI / 2; return h; };
  // where a (dyn-marked) marker is, in the machine's frame (for particles that leave moving parts)
  const wv = new THREE.Vector3();
  T.at = (obj, out) => { obj.getWorldPosition(wv); return g.worldToLocal((out || new THREE.Vector3()).copy(wv)); };
  T.marker = (p, x, y, z) => K.dyn(K.group(p, x, y, z));
  return T;
}

// =====================================================================
// PLINTHS
// =====================================================================
function bigPlinth(K, S, T, kit, label) {
  const P = kit.P;
  K.box(4.8, 0.3, 4.8, P.ironM, 0, 0.15, 0, S);
  K.box(4.9, 0.08, 4.9, P.brassD, 0, 0.33, 0, S);
  K.box(4.62, 0.04, 4.62, P.plate, 0, 0.39, 0, S);
  T.row(S, -2.3, 0.2, 2.47, 2.3, 0.2, 2.47, 9, P.brassL, 0.08); T.row(S, 2.47, 0.2, -2.3, 2.47, 0.2, 2.3, 9, P.brassL, 0.08);
  T.hazard(S, 4.4, 0, 0.12, 2.47, 14, 0, 0.1, 0.03); T.hazard(S, 4.4, 2.47, 0.12, 0, 14, -Math.PI / 2, 0.1, 0.03);
  for (const [x, z, sx, sz] of [[-0.9, 0.6, 0.6, 0.4], [0.3, -1.8, 0.45, 0.3], [-1.9, -0.6, 0.4, 0.28]]) { const p = K.sph(1, P.oil, x, 0.41, z, S, 10, 4); p.scale.set(sx, 0.02, sz); p.castShadow = false; }
  for (let i = 0; i < 7; i++) { const d = K.box(0.4 + K.rnd() * 0.6, 0.01, 0.3 + K.rnd() * 0.4, P.grime, -2 + K.rnd() * 4, 0.415, -2 + K.rnd() * 4, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
  // maker's plate on the front-left face
  const pw = (label.length * 4 + 3) / 9 * 0.2;
  K.box(pw, 0.2, 0.03, kit.text(label, { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e' }), -1.3, 0.18, 2.47, S);
  for (const x of [-1.32 - pw / 2, -1.28 + pw / 2]) K.box(0.05, 0.05, 0.05, P.brassL, x, 0.18, 2.5, S);
}
function smallPlinth(K, S, T, kit) {
  const P = kit.P;
  K.box(1.6, 0.22, 1.6, P.ironM, 0, 0.11, 0, S);
  K.box(1.66, 0.06, 1.66, P.brassD, 0, 0.23, 0, S);
  K.box(1.52, 0.03, 1.52, P.plateS, 0, 0.27, 0, S);
  T.row(S, -0.7, 0.13, 0.82, 0.7, 0.13, 0.82, 5, P.brassL, 0.06); T.row(S, 0.82, 0.13, -0.7, 0.82, 0.13, 0.7, 5, P.brassL, 0.06);
  T.hazard(S, 1.4, 0, 0.06, 0.81, 6, 0, 0.06, 0.02); T.hazard(S, 1.4, 0.81, 0.06, 0, 6, -Math.PI / 2, 0.06, 0.02);
  const p = K.sph(1, P.oil, -0.2, 0.29, 0.25, S, 10, 4); p.scale.set(0.3, 0.02, 0.2); p.castShadow = false;
}
// a tall cabinet facing the camera: iron box, cornice, base, banded side pillars. Returns its face group + front z.
function cabinet(K, S, T, kit, x, z, BW, BH, BD) {
  const P = kit.P;
  const TB = T.face(S, x, 0.41, z);
  const FZ = BD / 2;
  K.box(BW, BH, BD, P.iron, 0, BH / 2, 0, TB);
  K.box(BW + 0.12, 0.2, BD + 0.12, P.ironM, 0, 0.1, 0, TB);
  K.box(BW + 0.06, 0.05, BD + 0.08, P.brassD, 0, 0.22, 0, TB);
  K.box(BW + 0.22, 0.1, BD + 0.18, P.brassD, 0, BH + 0.05, 0, TB);
  K.box(BW + 0.08, 0.1, BD + 0.06, P.ironM, 0, BH + 0.15, 0, TB);
  for (const s of [-1, 1]) {
    const px = s * (BW / 2 + 0.02);
    K.box(0.17, BH, 0.17, P.ironL, px, BH / 2, FZ - 0.04, TB);
    for (const y of [0.42, BH * 0.5, BH - 0.22]) K.box(0.21, 0.07, 0.21, P.brass, px, y, FZ - 0.04, TB);
    T.row(TB, px, 0.62, FZ + 0.05, px, BH - 0.42, FZ + 0.05, Math.max(3, Math.round(BH / 0.42)), P.brassL, 0.045);
  }
  return { TB, FZ };
}

// =====================================================================
// THE LANE: a roller bench from the `in` port to the `pass` port along the machine's front, with the intake tray
// and stop boom at `in`, the pass outlet (lamp) at `pass`, the red reject trough at `reject` (in front of the
// lane's middle) and an optional kicker ram behind it. Rollers share one material whose texture scrolls, so they
// turn as items roll. Lane coordinates: u along the lane (in -> pass), w forward (toward the camera).
// =====================================================================
function makeLane(K, g, S, T, kit, o) {
  const { THREE, P } = kit;
  const V3 = THREE.Vector3;
  const big = !!o.big;
  const IN = new V3(o.IN[0], 0, o.IN[1]), PASS = new V3(o.PASS[0], 0, o.PASS[1]), REJ = new V3(o.REJ[0], 0, o.REJ[1]);
  const MID = IN.clone().add(PASS).multiplyScalar(0.5);
  const LD = PASS.clone().sub(IN); const Lh = LD.length() / 2; LD.normalize();
  const FWD = new V3(-LD.z, 0, LD.x); if (FWD.x + FWD.z < 0) FWD.negate(); // the lane's side that faces the camera
  const rotY = Math.atan2(-LD.z, LD.x);
  const LG = K.group(S, MID.x, 0, MID.z); LG.rotation.y = rotY;
  const fs = Math.sin(rotY) * FWD.x + Math.cos(rotY) * FWD.z > 0 ? 1 : -1;
  const W = (w) => w * fs; // forward offset -> LG z
  const rejU = REJ.clone().sub(MID).dot(LD), rejW = REJ.clone().sub(MID).dot(FWD);
  const bw = big ? 0.3 : 0.21, r = big ? 0.055 : 0.045, step = big ? 0.19 : 0.15;
  const yB = 1.0 - 2 * r - 0.015; // bench top
  const rt = kit.rollTex.clone(); rt.needsUpdate = true;
  const rollM = K.mat(0xffffff, { map: rt, shine: 34, spec: 0x504a40 }); rollM.userData.noCast = true;
  const ext = Lh + (big ? 0.12 : 0.08);
  // bench body + brass top rails + rivets
  K.box(ext * 2, 0.2, bw * 2 + 0.04, P.ironM, 0, yB - 0.1, 0, LG);
  K.box(ext * 2, 0.08, bw * 2 - 0.1, P.soot, 0, yB - 0.24, 0, LG);
  for (const s of [-1, 1]) { K.box(ext * 2, 0.05, 0.06, P.brass, 0, yB + 0.005, W(s * bw), LG); T.row(LG, -ext + 0.12, yB - 0.1, W(s * (bw + 0.025)), ext - 0.12, yB - 0.1, W(s * (bw + 0.025)), big ? 12 : 6, P.brassL, 0.05); }
  // rollers (skip the sections a machine replaces: tilt table, test plate, sieve...)
  const skip = o.skip || [];
  for (let u = -Lh + 0.1; u <= Lh - 0.08; u += step) { if (skip.some(([a, b]) => u > a && u < b)) continue; const c = K.cyl(r, r, bw * 2 - 0.05, rollM, 8, u, 1.0 - r, 0, LG); c.rotation.x = Math.PI / 2; }
  // guard rails: back full length (gap at the kicker), front between the tray, the reject gap and the outlet
  const rail = (u0, u1, w) => { if (u1 - u0 < 0.1) return; K.box(u1 - u0, 0.05, 0.04, P.brass, (u0 + u1) / 2, 1.13, W(w), LG); for (let u = u0 + 0.03; u < u1 - 0.08; u += 0.42) K.box(0.04, 0.16, 0.04, P.brassD, u, 1.05, W(w), LG); K.box(0.04, 0.16, 0.04, P.brassD, u1 - 0.03, 1.05, W(w), LG); };
  const railSpan = (u0, u1, w, gaps) => { let a = u0; for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g1 <= a || g0 >= u1) continue; rail(a, Math.min(g0, u1), w); a = Math.max(a, g1); } rail(a, u1, w); };
  const backGaps = (o.backGaps || []).concat(o.kicker ? [[rejU - 0.26, rejU + 0.26]] : []);
  railSpan(-Lh + 0.05, Lh - 0.05, -(bw + 0.03), backGaps);
  const gap = [rejU - (big ? 0.42 : 0.3), rejU + (big ? 0.42 : 0.3)];
  railSpan(-Lh + (big ? 0.62 : 0.36), Lh - (big ? 0.62 : 0.36), bw + 0.03, (o.noTrough ? [] : [gap]).concat(o.gaps || []));
  // legs down to the deck
  for (const u of [-Lh + 0.14, Lh - 0.14]) for (const s of [-1, 1]) { K.box(0.09, yB - 0.2, 0.09, P.iron, u, (yB - 0.2) / 2 + 0.05, W(s * (bw - 0.06)), LG); K.box(0.16, 0.05, 0.16, P.ironM, u, 0.12, W(s * (bw - 0.06)), LG); }
  // intake tray: a wider catch plate + back guide at `in`
  K.box(big ? 0.62 : 0.4, 0.04, bw * 2 + 0.2, P.brassD, -Lh + (big ? 0.2 : 0.14), yB - 0.205, W(0.04), LG);
  K.box(big ? 0.5 : 0.32, 0.2, 0.05, P.brass, -Lh + (big ? 0.28 : 0.18), 1.06, W(-(bw + 0.09)), LG);
  // stop boom across the tray exit: down while an item waits at the tray, up when it's taken
  const boomU = o.boomU !== undefined ? o.boomU : -Lh + (big ? 0.58 : 0.4);
  const boomP = K.dyn(K.group(LG, boomU, 1.2, W(-(bw + 0.07))));
  { const n = 6, len = bw * 2 + 0.16, ww = len / n; for (let i = 0; i < n; i++) K.box(0.05, 0.06, ww * 0.95, i % 2 ? P.soot : P.hazard, 0, 0, W(ww * (i + 0.5)), boomP); K.box(0.1, 0.1, 0.1, P.brassD, 0, 0, 0, boomP); }
  K.box(0.09, 0.32, 0.09, P.ironM, boomU, 1.03, W(-(bw + 0.07)), LG);
  // pass outlet: brass end posts, a green lamp on a post
  for (const s of [-1, 1]) K.box(0.06, 0.24, 0.06, P.brassD, Lh - 0.02, 1.0, W(s * (bw + 0.02)), LG);
  K.box(0.07, 0.62, 0.07, P.iron, Lh - 0.1, 1.27, W(-(bw + 0.12)), LG);
  const passM = T.lamp(LG, Lh - 0.1, 1.62, W(-(bw + 0.12)), big ? 0.075 : 0.06, 0x0c2a14);
  K.cyl(0.08, 0.09, 0.05, P.brassD, 8, Lh - 0.1, 1.54, W(-(bw + 0.12)), LG);
  // reject trough: red iron, from the bench's front edge out past the port, hazard lip, red lamp
  let rejM = null;
  if (!o.noTrough) {
    const RJ = K.group(S, MID.x + LD.x * rejU, 0, MID.z + LD.z * rejU); RJ.rotation.y = Math.atan2(-FWD.z, FWD.x); // RJ local x = forward
    const t0 = bw - 0.04, t1 = rejW + (big ? 0.28 : 0.22), tw = big ? 0.25 : 0.2;
    K.box(t1 - t0, 0.04, tw * 2, P.red, (t0 + t1) / 2, 0.955, 0, RJ);
    for (const s of [-1, 1]) K.box(t1 - t0, 0.14, 0.04, P.red, (t0 + t1) / 2, 1.02, s * tw, RJ);
    T.hazard(RJ, tw * 2, t1 - 0.02, 1.0, 0, 4, Math.PI / 2, 0.14, 0.03);
    K.box(0.06, 0.85, 0.06, P.rustD, (t0 + t1) / 2, 0.525, tw - 0.04, RJ); K.box(0.06, 0.85, 0.06, P.rustD, (t0 + t1) / 2, 0.525, -tw + 0.04, RJ);
    rejM = T.lamp(RJ, t0 + 0.06, 1.16, -(tw + 0.05), big ? 0.07 : 0.055, 0x3a0c08);
    K.box(0.05, 0.22, 0.05, P.ironM, t0 + 0.06, 1.0, -(tw + 0.05), RJ);
  }
  // kicker ram behind the lane at the reject port: shoves a rejected capsule forward into the trough
  let kickP = null; const kw0 = -(bw + (big ? 0.44 : 0.3));
  if (o.kicker) {
    const hw = big ? 0.36 : 0.26;
    K.box(hw, 0.2, big ? 0.34 : 0.24, P.ironM, rejU, 1.06, W(kw0 - 0.08), LG);
    K.box(hw + 0.04, 0.04, big ? 0.38 : 0.28, P.brass, rejU, 1.18, W(kw0 - 0.08), LG);
    K.box(0.08, 0.85, 0.08, P.iron, rejU, 0.53, W(kw0 - 0.1), LG);
    K.cyl(0.05, 0.05, 0.1, P.brassL, 6, rejU, 1.24, W(kw0 - 0.08), LG);
    T.hazard(LG, hw, rejU, 0.99, W(kw0 + 0.035), 4, 0, 0.07, 0.02);
    kickP = K.dyn(K.group(LG, rejU, 1.08, W(kw0 + 0.1)));
    K.box(big ? 0.34 : 0.24, 0.13, 0.04, P.red, 0, 0, 0, kickP);
    K.box(0.05, 0.05, big ? 0.6 : 0.4, P.steel, 0, 0, W(-(big ? 0.3 : 0.2)), kickP);
  }
  const pt = (u, w, y, out) => (out || new V3()).set(MID.x + LD.x * u + FWD.x * w, y, MID.z + LD.z * u + FWD.z * w);
  let boomOpen = 1, kickW = kw0 + 0.1;
  const yawLane = yawOf(LD.x, LD.z);
  return {
    LG, MID, LD, FWD, Lh, W, rt, rollM, rejU, rejW, bw, IN, PASS, REJ, passM, rejM, big,
    uIn: -Lh, uPass: Lh, pt, yawLane, yawOut: yawLane + Math.PI / 4, yawRej: yawLane + Math.PI / 2,
    roll(du) { rt.offset.x -= du / (2 * Math.PI * r) * 0.5; },
    boom(waiting, dt) { boomOpen += ((waiting ? 0 : 1) - boomOpen) * Math.min(1, dt * 7); boomP.rotation.x = -fs * boomOpen * 1.35; },
    // the kicker plate follows `target` (a lane w), or rests when target is null
    kick(target, dt) { if (!kickP) return; const goal = target === null ? kw0 + 0.1 : Math.max(kw0 + 0.1, target); kickW += (goal - kickW) * Math.min(1, dt * 14); kickP.position.z = W(kickW); },
  };
}

// =====================================================================
// THE STATION CYCLE on a lane: take at `in`, feed to the instrument at workU, work until M.judge() gives a verdict
// (o.work says when it's worth asking), hold for the show, then roll out to `pass` or shove forward into the reject
// trough. The machine's update() calls step() only while not blocked, and place() every frame.
// =====================================================================
function makeCycle(K, M, kit, lane, T, g, o) {
  const THREE = kit.THREE;
  const A = K.dyn(K.group(g));
  const q0 = new THREE.Quaternion(), tmp = new THREE.Vector3();
  const c = { ph: 'idle', pt: 0, it: null, v: null, asked: false, u: lane.uIn, w: 0, y: 1, yaw: lane.yawLane, pitch: 0, roll: 0,
    runs: 0, flash: 0, flashCol: GREEN, kick: 0, slerpK: 1, A, workU: o.workU || 0, lastU: lane.uIn, wobble: 0 };
  const set = (p) => { c.ph = p; c.pt = 0; };
  c.set = set;
  c.verdictNow = () => {
    const v = M.judge(c.it); if (!v) return false;
    c.v = v;
    if (v.pass) { if (M.last) c.it.setKind('pass'); else c.it.flash(GREEN); M.pass(c.it); c.flashCol = GREEN; }
    else { c.it.setKind('reject'); M.reject(c.it, v.reason || 'sent back'); c.flashCol = RED; }
    c.flash = 1; if (o.onVerdict) o.onVerdict(v); return true;
  };
  c.step = (dt, t) => {
    c.flash = Math.max(0, c.flash - dt * 1.1);
    if (c.ph === 'idle') {
      if (o.canTake && !o.canTake()) return;
      if (!M.waiting('in')) return;
      const it = M.take('in'); if (!it) return;
      c.it = it; q0.copy(it.mesh.quaternion); c.slerpK = 0; it.follow(A);
      c.v = null; c.asked = false; c.runs = 0; c.u = c.lastU = lane.uIn; c.w = 0; c.y = 1; c.yaw = lane.yawLane; c.pitch = c.roll = 0; c.kick = 0;
      set('feed'); lane.pt(lane.uIn, 0, 1.05, tmp); T.pulse(tmp.x, tmp.y, tmp.z, 0xffd080); if (o.onTake) o.onTake(it);
      return;
    }
    c.pt += dt;
    const it = c.it;
    if (c.ph === 'feed') {
      const k = K.clamp01(c.pt / o.feedT); c.u = K.lerp(lane.uIn, c.workU, K.smooth(k)); c.slerpK = K.clamp01(c.pt / (o.feedT * 0.45));
      if (k >= 1) { c.slerpK = 1; set('work'); if (o.onArrive) o.onArrive(); }
    } else if (c.ph === 'work') {
      if (o.work(c, dt, t) && !c.v) {
        if (!c.asked) { c.asked = true; const q = o.decide ? o.decide(it) : null; if (q && M.maybeDecision(q)) return; }
        if (c.verdictNow()) set('verdict');
        else c.runs++;
      }
    } else if (c.ph === 'verdict') {
      if (c.pt >= o.verdictT) set(c.v.pass ? 'out' : 'dump');
    } else if (c.ph === 'out') {
      const k = K.clamp01(c.pt / o.outT); c.u = K.lerp(c.workU, lane.uPass, K.smooth(k));
      c.yaw = k > 0.6 ? K.lerp(lane.yawLane, lane.yawOut, K.smooth((k - 0.6) / 0.4)) : lane.yawLane;
      if (k >= 1) set('give');
    } else if (c.ph === 'give') {
      if (M.give(it, 'pass')) { lane.pt(lane.uPass, 0, 1.05, tmp); T.pulse(tmp.x, tmp.y, tmp.z, GREEN); c.it = null; c.v = null; set('idle'); }
    } else if (c.ph === 'dump') {
      const tr = Math.abs(lane.rejU - c.workU) > 0.05 ? 0.4 : 0;
      if (c.pt < tr) c.u = K.lerp(c.workU, lane.rejU, K.smooth(c.pt / tr));
      else {
        const k = K.clamp01((c.pt - tr) / o.dumpT); c.u = lane.rejU; c.kick = k;
        const m = K.smooth(K.clamp01((k - 0.3) / 0.7));
        c.w = lane.rejW * m; c.y = 1 - 0.035 * Math.sin(m * Math.PI);
        c.yaw = K.lerp(lane.yawLane, lane.yawRej, m);
        if (k >= 1) set('giveR');
      }
    } else if (c.ph === 'giveR') {
      if (M.give(it, 'reject')) { T.pulse(lane.REJ.x, 1.05, lane.REJ.z, RED); c.it = null; c.v = null; c.kick = 0; set('idle'); }
    }
  };
  // every frame: the anchor, the rollers, the kicker, the item's heading
  c.place = (dt) => {
    lane.pt(c.u + c.wobble, c.w, c.y, A.position);
    const du = c.u - c.lastU; c.lastU = c.u; if (c.it && Math.abs(du) > 1e-5 && Math.abs(du) < 0.5 && c.w < 0.05) lane.roll(du);
    if (c.it) T.aim(c.it, c.yaw, c.pitch, c.roll, c.slerpK < 1 ? q0 : null, c.slerpK);
    const dumping = c.ph === 'dump' || c.ph === 'giveR';
    lane.kick(dumping && c.pt > 0 ? (c.kick < 0.3 && c.ph === 'dump' ? -0.2 : c.w - 0.19) : null, dt);
    lane.boom(!!M.waiting('in') && c.ph === 'idle', dt);
  };
  c.verdictShown = () => (c.it && c.v && (c.ph === 'verdict' || c.ph === 'out' || c.ph === 'dump') ? (c.v.pass ? 'pass' : 'fail') : null);
  c.detail = (doing) => {
    if (!c.it) return o.idle || 'waiting for PRs';
    const L = c.it.label(), re = c.it.attempts > 0 ? 'rework ' : '';
    if (c.ph === 'feed') return re + L + ' · ' + (o.feedVerb || 'rolling in');
    if (c.ph === 'work') return re + L + ' · ' + doing;
    if (c.ph === 'give') return L + ' · held: next lane is full';
    if (c.ph === 'giveR') return L + ' · held: reject chute is full';
    if (c.v) return c.v.pass ? L + ' · ' + (o.passVerb || 'passed') : L + ' · sent back: ' + (c.v.reason || 'failed');
    return L;
  };
  return c;
}

// =====================================================================
// CI INSPECTOR
// =====================================================================
function buildCI(K, M, kit) {
  const { THREE, P } = kit;
  const g = K.group(), S = K.group(g);
  const T = tools(K, g, kit);
  bigPlinth(K, S, T, kit, 'CI INSPECTOR');
  const SCAN = -0.7, TUN = [-1.12, -0.28];
  const lane = makeLane(K, g, S, T, kit, { IN: [2.9, 0.6], PASS: [0.6, 2.9], REJ: [2.05, 2.05], big: true, skip: [[-0.4, 0.4]], gaps: [[TUN[0] - 0.05, TUN[1] + 0.05]], backGaps: [[TUN[0] - 0.05, TUN[1] + 0.05]], boomU: -1.25 });
  const { LG, W } = lane;

  // ---------- TILT TABLE (the lane's middle section): tips forward to dump a reject into the trough ----------
  const TT = K.dyn(K.group(LG, 0, 0.885, W(lane.bw)));
  K.box(0.78, 0.04, lane.bw * 2, P.iron, 0, 0, W(-lane.bw), TT);
  for (const s of [-1, 1]) K.box(0.05, 0.1, lane.bw * 2, P.brassD, s * 0.39, 0.03, W(-lane.bw), TT);
  for (let u = -0.29; u <= 0.3; u += 0.19) { const c = K.cyl(0.055, 0.055, lane.bw * 2 - 0.05, lane.rollM, 8, u, 0.06, W(-lane.bw), TT); c.rotation.x = Math.PI / 2; }
  K.cyl(0.035, 0.035, 0.3, P.steel, 6, 0, -0.16, W(-lane.bw * 2 + 0.08), TT);
  K.cyl(0.06, 0.06, 0.26, P.ironL, 8, 0, 0.62, W(-lane.bw + 0.02), LG);
  { const h = K.cyl(0.04, 0.04, 0.8, P.ironM, 6, 0, 0.885, W(lane.bw), LG); h.rotation.z = Math.PI / 2; }
  T.hazard(LG, 0.8, 0, 0.9, W(lane.bw + 0.035), 6, 0, 0.05, 0.02);

  // ---------- X-RAY TUNNEL: a glass half tube over the lane, iron end hoops, copper windings, detector plate ----------
  const tunL = TUN[1] - TUN[0], tunC = (TUN[0] + TUN[1]) / 2, TR = 0.47;
  T.halfTube(LG, TR, tunL, P.glassG, tunC, 1.0, 0, 18).castShadow = false;
  const washM = K.glow(0x5aff9a, 0, true);
  T.halfTube(LG, TR - 0.04, tunL - 0.04, washM, tunC, 1.0, 0, 12).castShadow = false;
  for (const u of TUN) {
    const h = K.torus(TR + 0.03, 0.065, P.iron, 5, 16, u, 1.0, 0, LG, Math.PI); h.rotation.y = Math.PI / 2;
    const b = K.torus(TR + 0.1, 0.025, P.brass, 4, 16, u, 1.0, 0, LG, Math.PI); b.rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) { K.box(0.16, 0.1, 0.14, P.ironM, u, 0.97, W(s * (TR + 0.05)), LG); K.box(0.06, 0.06, 0.06, P.brassL, u, 1.04, W(s * (TR + 0.13)), LG); }
  }
  for (const u0 of [TUN[0] + 0.1, TUN[1] - 0.1]) for (let i = 0; i < 3; i++) { const h = K.torus(TR + 0.02, 0.016, P.copper, 3, 14, u0 + (i - 1) * 0.035 * (u0 < tunC ? 1 : -1), 1.0, 0, LG, Math.PI); h.rotation.y = Math.PI / 2; }
  for (const s of [-1, 1]) K.box(tunL, 0.05, 0.05, P.brass, tunC, 1.0, W(s * (TR + 0.04)), LG);
  const detM = K.glow(0x163a22);
  K.box(tunL - 0.1, 0.02, lane.bw * 2 - 0.1, detM, tunC, 0.9, 0, LG);

  // ---------- X-RAY TUBE on its gooseneck: glass bulb, glowing anode, collimator; the beam sweeps the capsule ----------
  const HY = 2.3;
  const colP = lane.pt(SCAN, -0.98, 0);
  const col = K.group(S, colP.x, 0.41, colP.z);
  K.cyl(0.15, 0.19, 0.24, P.ironM, 10, 0, 0.12, 0, col);
  K.cyl(0.08, 0.1, 2.2, P.iron, 10, 0, 1.25, 0, col);
  for (const y of [0.32, 1.05, 1.8]) K.cyl(0.12, 0.12, 0.07, P.brass, 10, 0, y, 0, col);
  K.cyl(0.13, 0.13, 0.14, P.brassD, 10, 0, 2.38, 0, col);
  T.hazard(col, 0.2, 0, 0.6, 0.11, 2, Math.PI / 4, 0.24, 0.02);
  { const a = lane.pt(SCAN, -0.98, 2.8), b = lane.pt(SCAN, -0.62, 3.05), c2 = lane.pt(SCAN, -0.18, 2.86), d = lane.pt(SCAN, 0, HY + 0.24);
    K.tube([[a.x, a.y, a.z], [b.x, b.y, b.z], [c2.x, c2.y, c2.z], [d.x, d.y, d.z]], 0.065, P.ironM, S, 14, 6);
    const e = lane.pt(SCAN + 0.12, -0.98, 2.6), f = lane.pt(SCAN + 0.14, -0.6, 2.95), h = lane.pt(SCAN + 0.16, -0.1, 2.75), i = lane.pt(SCAN + 0.2, 0, HY + 0.12);
    K.tube([[e.x, e.y, e.z], [f.x, f.y, f.z], [h.x, h.y, h.z], [i.x, i.y, i.z]], 0.025, P.copper, S, 14, 4); }
  const HD = K.group(LG, SCAN, HY, 0);
  K.sph(0.2, P.glass, 0, 0, 0, HD, 12, 10).castShadow = false;
  for (const s of [-1, 1]) {
    const n = K.cyl(0.07, 0.07, 0.3, P.glass, 8, s * 0.3, 0, 0, HD); n.rotation.z = Math.PI / 2; n.castShadow = false;
    const cap = K.cyl(0.09, 0.09, 0.12, P.brass, 8, s * 0.48, 0, 0, HD); cap.rotation.z = Math.PI / 2;
    const rg = K.torus(0.085, 0.022, P.brassL, 4, 10, s * 0.19, 0, 0, HD); rg.rotation.y = Math.PI / 2;
    K.box(0.05, 0.26, 0.05, P.brassD, s * 0.48, 0.16, 0, HD);
  }
  K.box(1.02, 0.05, 0.08, P.brassD, 0, 0.29, 0, HD);
  const anodeM = K.glow(0x3a8a5a);
  { const a = K.cyl(0.075, 0.075, 0.05, anodeM, 8, 0.06, 0, 0, HD); a.rotation.z = Math.PI / 2; const s2 = K.cyl(0.018, 0.018, 0.3, P.copper, 6, 0.24, 0, 0, HD); s2.rotation.z = Math.PI / 2; }
  K.box(0.18, 0.12, 0.18, P.ironM, 0, -0.27, 0, HD); K.box(0.2, 0.03, 0.2, P.brass, 0, -0.34, 0, HD);
  K.box(0.02, 0.18, 0.24, kit.text('X', { bg: '#1a120c', fg: '#9affc8', rim: '#7a5822' }), 0.5, 0.0, 0, HD);
  // the wide fan (faint) and the sweeping beam
  const fanM = K.glow(0x6affb0, 0, true); fanM.side = THREE.DoubleSide;
  const fanG = new THREE.BufferGeometry();
  fanG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, HY - 0.36, 0, -0.42, 1.05, 0, 0.42, 1.05, 0]), 3)); fanG.computeVertexNormals();
  const fan = K.mesh(fanG, fanM, SCAN, 0, 0, LG); fan.castShadow = false; fan.receiveShadow = false;
  const beamM = K.glow(0xe0fff0, 0, true); beamM.side = THREE.DoubleSide;
  const beamP = K.dyn(K.group(LG, SCAN, HY - 0.36, 0));
  const beamG = new THREE.BufferGeometry(); const bl = HY - 0.36 - 1.05;
  beamG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -0.05, -bl, 0, 0.05, -bl, 0]), 3)); beamG.computeVertexNormals();
  const beam = K.mesh(beamG, beamM, 0, 0, 0, beamP); beam.castShadow = false; beam.receiveShadow = false;
  // klaxon on top of the column (spins red when a PR is sent back)
  K.cyl(0.13, 0.15, 0.08, P.brassD, 8, colP.x, 2.9, colP.z, S);
  const klaxSpin = K.dyn(K.group(g, colP.x, 3.03, colP.z));
  const klaxM = K.mat(0x3a0c08, { e: 0 }); K.box(0.18, 0.11, 0.06, klaxM, 0.05, 0, 0, klaxSpin);
  const klaxDomeM = K.glow(0xff3020, 0.3);
  K.sph(0.14, klaxDomeM, colP.x, 3.03, colP.z, g, 8, 6).castShadow = false;

  // ---------- TESTS BOARD (back, facing the camera): 24 test lamps, the sunburst crown, screen, gauges, printer ----------
  const BW = 2.6, BH = 3.35;
  const { TB, FZ } = cabinet(K, S, T, kit, -0.88, -0.88, BW, BH, 0.62);
  // crown: an arched pediment with the lit TESTS sign and a sunburst of lamps
  const ped = K.mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.24, 18, 1, false, -Math.PI / 2, Math.PI), P.iron, 0, BH + 0.2, 0.02, TB); ped.rotation.x = -Math.PI / 2;
  K.torus(0.86, 0.06, P.brass, 4, 18, 0, BH + 0.2, 0.15, TB, Math.PI);
  K.torus(0.6, 0.03, P.brassD, 4, 16, 0, BH + 0.2, 0.15, TB, Math.PI);
  const signOff = kit.text('TESTS', { bg: '#2a1c10', fg: '#8a6a3a', rim: '#7a5822', s: 1 });
  const signOn = kit.text('TESTS', { bg: '#1a1006', fg: '#ffd27a', rim: '#e4b85e', s: 1, lit: true });
  const signPass = kit.text('TESTS', { bg: '#06200e', fg: '#7affb0', rim: '#e4b85e', s: 1, lit: true });
  const signFail = kit.text('TESTS', { bg: '#2a0806', fg: '#ff6a4a', rim: '#e4b85e', s: 1, lit: true });
  const signQ = kit.text('?????', { bg: '#2a1a04', fg: '#ffb020', rim: '#e4b85e', s: 1, lit: true });
  const sign = K.box(0.82, 0.24, 0.04, signOff, 0, BH + 0.32, 0.17, TB);
  const lampN = 24, sunN = 7;
  const lamps = boxBank(K, TB, lampN + sunN);
  for (let i = 0; i < sunN; i++) { const a = Math.PI * (0.1 + 0.8 * i / (sunN - 1)); lamps.box(lampN + i, Math.cos(a) * 0.73, BH + 0.2 + Math.sin(a) * 0.73, 0.17, 0.09, 0.09, 0.04); lamps.color(lampN + i, 0x2a1a0c); }
  // valve tubes on the cornice
  const valveM = K.glow(0x5a3a14);
  for (const x of [-1.05, -0.86, 0.86, 1.05]) { const v = K.cyl(0.075, 0.075, 0.3, P.glass, 8, x, BH + 0.4, 0, TB); v.castShadow = false; K.cyl(0.09, 0.09, 0.07, P.brassD, 8, x, BH + 0.24, 0, TB); K.cyl(0.03, 0.03, 0.2, valveM, 6, x, BH + 0.38, 0, TB); K.sph(0.04, P.brass, x, BH + 0.57, 0, TB, 6, 4); }
  // the lamp field: a soot panel in a brass bezel, 6 x 4 test lamps in sockets, tick marks
  const LFY = 2.38;
  K.box(2.0, 1.28, 0.04, P.soot, 0, LFY, FZ + 0.01, TB);
  for (const s of [-1, 1]) { K.box(2.1, 0.07, 0.07, P.brass, 0, LFY + s * 0.66, FZ + 0.03, TB); K.box(0.07, 1.38, 0.07, P.brass, s * 1.02, LFY, FZ + 0.03, TB); }
  for (let i = 0; i < lampN; i++) {
    const cI = i % 6, rI = Math.floor(i / 6), x = -0.78 + cI * 0.312, y = LFY + 0.42 - rI * 0.28;
    K.box(0.27, 0.22, 0.03, P.ironM, x, y, FZ + 0.035, TB);
    lamps.box(i, x, y, FZ + 0.06, 0.2, 0.15, 0.04); lamps.color(i, 0x22180e);
  }
  lamps.bound();
  for (let cI = 0; cI < 6; cI++) K.box(0.12, 0.02, 0.02, P.cream, -0.78 + cI * 0.312, LFY - 0.56, FZ + 0.04, TB);
  // phosphor screen: the x-ray image of the capsule, a "?" while blocked
  const scrTex = K.canvasTex(48, 24, (c) => {
    c.fillStyle = '#04140a'; c.fillRect(0, 0, 48, 24);
    for (let y = 0; y < 24; y += 2) { c.fillStyle = 'rgba(80,255,150,0.07)'; c.fillRect(0, y, 48, 1); }
    c.fillStyle = '#2a8a50'; c.fillRect(8, 8, 28, 9); c.fillStyle = '#1a5a34'; c.fillRect(6, 9, 2, 7); c.fillRect(36, 9, 2, 7);
    c.fillStyle = '#7affb0'; for (let i = 0; i < 6; i++) c.fillRect(11 + i * 4, 10, 1, 5); c.fillRect(10, 12, 24, 1);
    c.fillStyle = '#c8ffe0'; c.fillRect(20, 10, 3, 5);
  }, [1, 1]);
  const qTex = K.canvasTex(48, 24, (c) => { c.fillStyle = '#1a1004'; c.fillRect(0, 0, 48, 24); glyph(c, '?', 18, 2, '#ffb020', 4); });
  const scrM = K.mat(0x60a070, { map: scrTex, e: 0x0a2a14 });
  const scrX = -0.5, scrY = 1.2;
  K.box(1.0, 0.66, 0.05, P.brassD, scrX, scrY, FZ + 0.01, TB);
  K.box(0.88, 0.54, 0.04, scrM, scrX, scrY, FZ + 0.04, TB);
  T.row(TB, scrX - 0.46, scrY + 0.29, FZ + 0.05, scrX + 0.46, scrY + 0.29, FZ + 0.05, 4, P.brassL, 0.04);
  const ndl = [T.gauge(TB, 0.48, 1.36, FZ + 0.03, 0.21, 0, 0), T.gauge(TB, 0.92, 1.02, FZ + 0.03, 0.14, 0, 0)];
  // the report printer: paper tape curls out of a slot when the suite finishes
  K.box(0.5, 0.16, 0.08, P.brass, 0.62, 0.66, FZ + 0.03, TB); K.box(0.36, 0.03, 0.04, P.ink, 0.62, 0.62, FZ + 0.08, TB);
  const paper = K.dyn(K.group(TB, 0.62, 0.61, FZ + 0.09));
  K.box(0.3, 1, 0.015, P.paper, 0, -0.5, 0, paper);
  for (let i = 0; i < 6; i++) K.box(1.5, 0.035, 0.02, P.soot, -0.15, 0.38 + i * 0.07, FZ + 0.01, TB);
  K.tube([[-1.3, 0.7, 0.0], [-1.62, 0.65, 0.35], [-1.7, 0.45, 1.0]], 0.05, P.copper, TB, 8, 5);
  K.tube([[1.3, 1.9, -0.1], [1.62, 1.9, 0.2], [1.8, 1.4, 0.5], [1.95, 0.3, 0.6]], 0.045, P.rubber, TB, 10, 5);

  // ---------- X-RAY GENERATOR (back right): transformer, insulator stack, tesla coil, jacob's ladder ----------
  const GN = T.face(S, 1.08, 0.41, -1.72);
  K.box(0.95, 0.55, 0.7, P.ironM, 0, 0.275, 0, GN); K.box(1.0, 0.06, 0.75, P.brassD, 0, 0.58, 0, GN);
  for (let i = 0; i < 6; i++) K.box(0.035, 0.4, 0.72, P.ironL, -0.38 + i * 0.15, 0.27, 0, GN);
  T.row(GN, -0.44, 0.5, 0.36, 0.44, 0.5, 0.36, 6, P.brassL, 0.05);
  for (let i = 0; i < 5; i++) K.cyl(i % 2 ? 0.13 : 0.17, i % 2 ? 0.13 : 0.17, 0.09, P.cream, 10, -0.22, 0.68 + i * 0.1, 0, GN);
  K.cyl(0.12, 0.12, 0.9, P.copper, 12, -0.22, 1.6, 0, GN);
  for (let i = 0; i < 9; i++) { const ring = K.torus(0.124, 0.012, P.copperD, 3, 12, -0.22, 1.2 + i * 0.1, 0, GN); ring.rotation.x = Math.PI / 2; }
  K.cyl(0.03, 0.03, 0.3, P.steel, 6, -0.22, 2.15, 0, GN);
  { const tor = K.torus(0.24, 0.085, P.steel, 8, 16, -0.22, 2.3, 0, GN); tor.rotation.x = Math.PI / 2; }
  for (const s of [-1, 1]) { const rd = K.box(0.035, 1.15, 0.035, P.copper, 0.26 + s * 0.12, 1.15, 0.12, GN); rd.rotation.z = -s * 0.13; K.box(0.08, 0.06, 0.08, P.cream, 0.26 + s * 0.05, 0.62, 0.12, GN); }
  const arcM = K.glow(0xc8f8ff, 0, true);
  const arcP = K.dyn(K.group(GN, 0.26, 0.8, 0.12));
  K.box(1, 0.03, 0.03, arcM, 0, 0, 0, arcP);
  const gnNeedle = T.gauge(GN, 0.26, 0.3, 0.36, 0.1, 0, 0);

  // ---------- COOLANT TANK (back left): copper tank, sight glass, gauge, relief valve ----------
  const CT = T.face(S, -1.72, 0.41, 1.08);
  K.cyl(0.44, 0.48, 0.12, P.ironM, 14, 0, 0.06, 0, CT);
  K.cyl(0.38, 0.38, 1.55, P.copper, 14, 0, 0.9, 0, CT);
  { const dm = K.sph(0.38, P.copper, 0, 1.67, 0, CT, 14, 8); dm.scale.y = 0.55; }
  for (const y of [0.3, 0.9, 1.5]) T.band(CT, 0, 0, 0.395, y, P.brass, 0.07, 14);
  K.cyl(0.05, 0.05, 0.24, P.brass, 6, 0, 1.97, 0, CT); K.cyl(0.08, 0.08, 0.05, P.brassD, 8, 0, 2.1, 0, CT);
  K.cyl(0.05, 0.05, 0.95, P.glass, 8, 0, 0.92, 0.42, CT).castShadow = false;
  for (const y of [0.42, 1.42]) K.box(0.12, 0.05, 0.08, P.brass, 0, y, 0.42, CT);
  const coolM = K.glow(0x2a8a78);
  const cool = K.dyn(K.box(0.06, 1, 0.06, coolM, 0, 0.9, 0.42, CT));
  const ctNeedle = T.gauge(CT, 0.24, 1.2, 0.33, 0.11, 0.55, 0);
  K.tube([[0.32, 1.3, -0.1], [0.75, 1.5, -0.4], [1.2, 1.3, -0.5]], 0.045, P.copper, CT, 10, 5);

  // ---------- TEST TUBE RACK (front right, behind the intake): bubbling tubes, a flask on a coil ----------
  const RK = T.face(S, 2.12, 0.41, -0.62);
  K.box(1.06, 0.07, 0.34, P.wood, 0, 0.5, 0, RK); K.box(1.06, 0.06, 0.34, P.woodD, 0, 0.95, 0, RK);
  K.box(1.1, 0.04, 0.38, P.brassD, 0, 0.99, 0, RK);
  for (const x of [-0.5, 0.5]) { K.box(0.06, 1.05, 0.3, P.iron, x, 0.52, 0, RK); K.box(0.14, 0.05, 0.36, P.ironM, x, 0.03, 0, RK); }
  for (let i = 0; i < 6; i++) { const x = -0.36 + i * 0.144; K.cyl(0.058, 0.058, 0.6, P.glass, 8, x, 0.92, 0, RK).castShadow = false; K.sph(0.058, P.glass, x, 0.62, 0, RK, 8, 4).castShadow = false; const tr = K.torus(0.062, 0.016, P.brassL, 4, 8, x, 1.22, 0, RK); tr.rotation.x = Math.PI / 2; }
  const liquid = boxBank(K, RK, 6);
  for (let i = 0; i < 6; i++) { liquid.box(i, -0.36 + i * 0.144, 0.8, 0, 0.07, 0.36, 0.07); liquid.color(i, 0x7a5a20); }
  liquid.bound();
  K.sph(0.2, P.glass, 0.72, 1.24, 0.05, RK, 10, 8).castShadow = false;
  const flaskM = K.glow(0x3a7a50, 0.85);
  K.sph(0.15, flaskM, 0.72, 1.2, 0.05, RK, 8, 6);
  K.cyl(0.05, 0.05, 0.4, P.glass, 6, 0.72, 1.56, 0.05, RK).castShadow = false;
  for (let i = 0; i < 4; i++) { const tr = K.torus(0.08, 0.018, P.copper, 4, 10, 0.72, 1.48 + i * 0.07, 0.05, RK); tr.rotation.x = Math.PI / 2; }
  K.box(0.4, 0.06, 0.4, P.ironM, 0.72, 0.99, 0.05, RK); K.cyl(0.03, 0.03, 0.06, P.brassL, 6, 0.72, 1.02, 0.05, RK);
  K.tube([[0.3, 1.3, 0.1], [-0.2, 1.45, 0.3], [-0.95, 1.3, 0.7], [-1.35, 1.05, 0.95]], 0.035, P.verd, RK, 12, 4);

  // ---------- COMPRESSOR (front left): air receiver, pump + flywheel, gauge; feeds the tilt ram ----------
  const CP = T.face(S, -0.62, 0.41, 2.12);
  { const tk = K.cyl(0.3, 0.3, 1.0, P.copper, 12, -0.1, 0.55, 0, CP); tk.rotation.z = Math.PI / 2;
    for (const x of [-0.6, 0.4]) { const e = K.sph(0.3, P.copperD, x, 0.55, 0, CP, 10, 6); e.scale.x = 0.35; }
    for (const x of [-0.45, -0.1, 0.25]) { const b = K.cyl(0.315, 0.315, 0.06, P.brassD, 12, x, 0.55, 0, CP); b.rotation.z = Math.PI / 2; }
    for (const x of [-0.42, 0.22]) K.box(0.12, 0.3, 0.5, P.iron, x, 0.15, 0, CP);
    K.cyl(0.04, 0.04, 0.2, P.brassL, 6, -0.1, 0.92, 0, CP); K.sph(0.06, P.brass, -0.1, 1.04, 0, CP, 6, 4); }
  const cpNeedle = T.gauge(CP, 0.25, 0.75, 0.31, 0.13, 0, 0);
  K.box(0.36, 0.5, 0.3, P.ironM, 0.62, 0.25, -0.05, CP); K.box(0.4, 0.05, 0.34, P.brass, 0.62, 0.52, -0.05, CP);
  K.cyl(0.08, 0.08, 0.36, P.ironL, 8, 0.62, 0.72, -0.05, CP);
  const fly = K.dyn(K.group(CP, 0.62, 0.42, 0.14));
  { const w = K.cyl(0.2, 0.2, 0.05, P.iron, 12, 0, 0, 0, fly); w.rotation.x = Math.PI / 2; K.torus(0.2, 0.03, P.brassD, 4, 14, 0, 0, 0.02, fly); for (let i = 0; i < 3; i++) { const s = K.box(0.38, 0.04, 0.04, P.brass, 0, 0, 0.03, fly); s.rotation.z = i * Math.PI / 3; } }
  const pumpRod = K.dyn(K.box(0.05, 0.3, 0.05, P.steel, 0.62, 0.95, -0.05, CP));
  { const a = lane.pt(0, -0.3, 0.55); K.tube([[-0.62, 0.55, 2.12 - 0.5], [0.3, 0.5, 2.35], [a.x, 0.55, a.z]], 0.04, P.copper, S, 12, 5); }

  // ---------- caution + status lamp on the flanks, pass semaphore, verdict glyph ----------
  const caution = K.caution(S, -1.85, 0.41, 2.25, 1.0);
  const lamp = K.statusLamp(S, 2.25, 0.41, -1.85, 1.25);
  const semP = K.group(S, 0.25, 0.41, 2.62);
  K.cyl(0.04, 0.05, 1.7, P.iron, 6, 0, 0.85, 0, semP); K.cyl(0.08, 0.09, 0.05, P.brassD, 8, 0, 1.72, 0, semP);
  const semArm = K.dyn(K.group(g, 0.3, 1.95, 2.62)); semArm.rotation.y = Math.PI / 4;
  K.box(0.5, 0.1, 0.04, P.cream, 0.24, 0, 0, semArm); K.box(0.14, 0.1, 0.045, kit.pal(0x2a9a4a, 0.3), 0.42, 0, 0, semArm);
  const semLamp = T.lamp(g, 0.25, 2.22, 2.62, 0.07, 0x0c2a14);
  const gp = lane.pt(SCAN, 0, 3.55);
  const vglyph = T.glyph(gp.x, gp.y, gp.z, 1.0);

  // ---------- the cycle ----------
  const MIN = 1.95, STEP = 0.066;
  const c = makeCycle(K, M, kit, lane, T, g, {
    workU: SCAN, feedT: 0.8, verdictT: 0.9, outT: 1.0, dumpT: 0.55, feedVerb: 'into the x-ray', passVerb: 'CI green',
    work: (cc) => cc.pt >= MIN + cc.runs * 0.6,
    decide: (it) => 'Flaky test on ' + it.label() + ': re-run it?',
    onVerdict: (v) => { if (v.pass) { semUp = 1.8; const p = lane.pt(SCAN, 0, 1.6); T.motes(p.x, p.y, p.z, 12, GREEN); } else { klax = 2.6; failLamp = 6 + Math.floor(Math.random() * 17); const p = lane.pt(SCAN, 0, 1.4); T.sparks(p.x, p.y, p.z, 12, 0xff8050); } },
  });
  let first = true, lightK = 0, scanK = 0, tip = 0, failLamp = 12, klax = 0, semUp = 0, tBub = 0, tSteam = 0, paperK = 0;
  const lit = () => (c.ph === 'work' ? Math.min(lampN, Math.max(0, Math.floor((c.pt - 0.25) / STEP))) : c.v ? lampN : 0);

  return { g, update(t, dt) {
    if (first) { first = false; vglyph.gl.visible = false; }
    const blk = M.blocked;
    if (!blk) { c.step(dt, t); M.setState(c.it ? 'WORKING' : 'IDLE', c.detail(c.runs ? 'still testing (' + lampN + '/' + lampN + ' ran, waiting on CI)' : 'running tests ' + lit() + '/' + lampN)); }
    c.place(dt);
    const S_ = M.stateShown, work = S_ === 'WORKING';
    lamp.set(S_, t); caution.update(t, dt, S_);
    const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
    const scanning = c.ph === 'work' && !blk;
    const flash = c.flash, fc = c.flashCol;
    lightK += ((work ? 1 : 0) - lightK) * Math.min(1, dt * 2.5);
    scanK += ((scanning ? 1 : 0) - scanK) * Math.min(1, dt * 6);
    // tilt table: tips while a reject is dumped
    tip = (c.ph === 'dump' || c.ph === 'giveR') ? Math.min(1, tip + dt / 0.25) : Math.max(0, tip - dt / 0.4);
    TT.rotation.x = W(1) * tip * 0.42;
    // tunnel wash, detector, anode, beam
    washM.color.setHex(blk ? 0xffa020 : flash > 0.1 ? fc : 0x5aff9a);
    washM.opacity = blk ? 0.1 + 0.12 * strobe : flash > 0.1 ? 0.4 * flash : scanK * (0.16 + 0.06 * Math.sin(t * 17));
    detM.color.setHex(blk ? (strobe > 0.5 ? 0x8a4a08 : 0x2a1404) : scanning ? (blink(t, 30) ? 0x5affa0 : 0x2a9a5a) : lightK > 0.5 ? 0x1e5a34 : 0x10241a);
    anodeM.color.setHex(blk ? (strobe > 0.5 ? 0xff7020 : 0x401008) : scanning ? (blink(t, 50) ? 0xf0fff4 : 0x9affc8) : lightK > 0.5 ? 0x3a9a6a : 0x1a3a2a);
    fanM.opacity = blk ? 0.12 * strobe : scanK * (0.13 + 0.04 * Math.sin(t * 23));
    fanM.color.setHex(blk ? 0xffa020 : 0x6affb0);
    beamP.visible = scanning;
    if (scanning) { beamP.rotation.z = Math.sin(t * 4.2) * 0.32; beamM.opacity = 0.75; }
    // TESTS board: the lamps go green one by one; on a fail one blinks red; blocked = amber checkerboard
    const n = lit();
    for (let i = 0; i < lampN; i++) {
      let col;
      if (blk) col = ((i % 6) + Math.floor(i / 6) + Math.floor(t * 4)) % 2 ? 0xffa020 : 0x4a1006;
      else if (c.it && c.v && !c.v.pass) col = i < failLamp ? 0x2ac060 : i === failLamp ? (blink(t, 14) ? 0xff3020 : 0x5a0a04) : 0x2a0e08;
      else if (c.it && c.v && c.v.pass) col = flash > 0.7 && (i + Math.floor(t * 30)) % 3 === 0 ? 0xeaffe8 : GREEN;
      else if (c.ph === 'work') col = c.runs && i === lampN - 1 ? (blink(t, 6) ? 0xffc040 : 0x6a4010) : i < n ? 0x3ae070 : i === n ? (blink(t, 24) ? 0xffc040 : 0x6a4010) : 0x2a1c0e;
      else col = i === Math.floor(t * (lightK > 0.3 ? 3 : 0.7)) % lampN ? (lightK > 0.3 ? 0x8a5a18 : 0x4a3010) : 0x2e2012;
      lamps.color(i, col);
    }
    for (let i = 0; i < sunN; i++) {
      let col = 0x2a1a0c;
      if (blk) col = (i + Math.floor(t * 8)) % 2 ? 0xffa020 : 0x3a1a04;
      else if (flash > 0.1) col = fc;
      else if (scanning) col = (i + Math.floor(t * 9)) % sunN === 0 ? 0xfff0c0 : 0xd8901a;
      else if (lightK > 0.5) col = 0x8a5a14;
      lamps.color(lampN + i, col);
    }
    sign.material = blk ? signQ : c.it && c.v ? (c.v.pass ? signPass : signFail) : lightK > 0.5 ? signOn : signOff;
    valveM.color.setHex(blk ? (strobe > 0.5 ? 0xff5020 : 0x3a1008) : lightK > 0.5 ? (Math.random() < 0.05 ? 0xffe0a0 : 0xffb050) : 0x4a2a10);
    // phosphor screen
    scrM.map = blk ? qTex : scrTex;
    scrTex.offset.x = scanning ? -(c.pt * 0.6) % 1 : scrTex.offset.x;
    scrM.color.setHex(blk ? (strobe > 0.5 ? 0xffc060 : 0x806020) : flash > 0.1 ? fc : scanning ? (Math.random() < 0.08 ? 0xb0ffc8 : 0x80e0a0) : lightK > 0.5 ? 0x4a8058 : 0x24402c);
    // gauges
    const g0 = blk ? -1.25 : 0.9 - lightK * 0.6 - scanK * 0.9 + (scanning ? Math.sin(t * 7) * 0.15 : 0), g1 = blk ? -1.15 : 0.8 - n / lampN * 1.6;
    ndl[0].rotation.z += (g0 + (blk ? Math.sin(t * 34) * 0.07 : 0) - ndl[0].rotation.z) * Math.min(1, dt * 6);
    ndl[1].rotation.z += (g1 + (blk ? Math.sin(t * 31) * 0.07 : 0) - ndl[1].rotation.z) * Math.min(1, dt * 6);
    cpNeedle.rotation.z += ((blk ? -1.2 + Math.sin(t * 30) * 0.06 : work ? -0.3 + Math.sin(t * 3) * 0.2 : 0.7) - cpNeedle.rotation.z) * Math.min(1, dt * 5);
    gnNeedle.rotation.z += ((blk ? -1.3 + Math.sin(t * 40) * 0.08 : scanning ? -0.9 + Math.sin(t * 11) * 0.12 : work ? 0.2 : 1.0) - gnNeedle.rotation.z) * Math.min(1, dt * 6);
    ctNeedle.rotation.z += ((blk ? -1.25 : work ? -0.2 + Math.sin(t * 2) * 0.1 : 0.8) - ctNeedle.rotation.z) * Math.min(1, dt * 4);
    // report printer: the paper rolls out as the suite completes, tears off when the PR leaves
    const paperGoal = c.it ? (c.ph === 'work' ? Math.min(1, n / lampN) * 0.32 : c.v ? 0.34 : 0.02) : 0.02;
    paperK += (paperGoal - paperK) * Math.min(1, dt * 3);
    paper.scale.y = Math.max(0.02, paperK); paper.rotation.x = paperK * 0.6;
    // jacob's ladder arc climbs while the tube fires
    arcP.visible = scanning || blk;
    if (arcP.visible) { const k = blk ? 0.15 + Math.random() * 0.1 : (t * 0.9) % 1; arcP.position.y = 0.66 + k * 1.0; arcP.scale.x = 0.12 + k * 0.26; arcM.opacity = blk ? (strobe > 0.5 ? 0.9 : 0.2) : 0.6 + Math.random() * 0.4; arcM.color.setHex(blk ? 0xffb050 : 0xc8f8ff); }
    // coolant level + color
    cool.scale.y = 0.55 + (work ? 0.12 * Math.sin(t * 1.5) : 0) + (blk ? 0.3 : 0); cool.position.y = 0.45 + cool.scale.y / 2;
    coolM.color.setHex(blk ? (strobe > 0.5 ? 0xffa020 : 0x6a3a08) : lightK > 0.5 ? 0x4ae0c0 : 0x1a5a4a);
    // test tubes: bubble while the suite runs, fill green test by test; the failing tube turns red
    for (let i = 0; i < 6; i++) {
      const lv = 0.24 + (work ? 0.05 * Math.sin(t * (7 + i) + i) : 0) + (c.ph === 'work' ? (n / lampN) * 0.1 : 0);
      liquid.box(i, -0.36 + i * 0.144, 0.64 + lv / 2, 0, 0.075, lv, 0.075);
      let col = lightK > 0.3 ? 0xd0902a : 0x6a4a1a;
      if (blk) col = Math.sin(t * 8 + i) > 0 ? 0xffa020 : 0x6a2a08;
      else if (c.it && c.v && !c.v.pass && i === failLamp % 6) col = blink(t, 12) ? 0xff3020 : 0x8a1008;
      else if (c.it && (c.v ? c.v.pass : n > i * 4 + 3)) col = 0x46e080;
      liquid.color(i, col);
    }
    flaskM.color.setHex(blk ? 0xa05010 : scanning ? (blink(t, 9) ? 0x5affa0 : 0x3aa070) : 0x2a5a3a);
    tBub -= dt;
    if (work && !blk && tBub <= 0) { tBub = 0.12; const i = Math.floor(Math.random() * 6); const x = 2.12 + C45 * (-0.36 + i * 0.144), z = -0.62 - C45 * (-0.36 + i * 0.144); K.spawn(g, x, 1.65, z, K.R() * 0.1, 0.5 + Math.random() * 0.4, K.R() * 0.1, Math.random() < 0.5 ? 0xd8ffe8 : 0x9affc0, 0.5, 0.03, -0.1, true); }
    // compressor: thumps while working, hard when the tilt ram fires
    fly.rotation.z -= dt * (blk ? 0 : work ? 5 : 0.3) * (tip > 0 && tip < 1 ? 3 : 1);
    pumpRod.position.y = 0.95 + Math.sin(fly.rotation.z) * 0.06;
    // klaxon (reject), semaphore + pass lamp (pass), reject lamp
    klax = Math.max(0, klax - dt);
    klaxSpin.rotation.y += dt * (klax > 0 || blk ? 10 : 0);
    klaxM.emissive.setHex(klax > 0 ? 0xff2a10 : blk ? (strobe > 0.5 ? 0xffa010 : 0) : 0);
    klaxDomeM.opacity = klax > 0 || blk ? 0.65 : 0.22; klaxDomeM.color.setHex(blk ? 0xffa020 : 0xff3020);
    semUp = Math.max(0, semUp - dt);
    semArm.rotation.z += ((semUp > 0 ? 0.9 : -0.05) - semArm.rotation.z) * Math.min(1, dt * 6);
    semLamp.emissive.setHex(semUp > 0 ? GREEN : 0);
    lane.passM.emissive.setHex(c.ph === 'out' || c.ph === 'give' ? (blink(t, 25) ? GREEN : 0x1a6a32) : 0);
    lane.rejM.emissive.setHex(c.ph === 'dump' || c.ph === 'giveR' ? (blink(t, 25) ? 0xff3020 : 0x5a0a04) : blk ? (strobe > 0.5 ? 0xffa020 : 0) : 0);
    // blocked: steam out of the coolant tank's relief valve and the compressor
    tSteam -= dt;
    if (blk && tSteam <= 0) { tSteam = 0.06; T.steam(-1.72, 2.65, 1.08, 1); if (Math.random() < 0.4) T.steam(-0.72, 1.5, 2.02, 1); }
    vglyph.set(blk ? 'block' : c.verdictShown(), t, dt);
    T.stepPulses(dt);
  } };
}

// =====================================================================
// VERIFY BAY
// =====================================================================
function buildVerify(K, M, kit) {
  const { THREE, P } = kit;
  const g = K.group(), S = K.group(g);
  const T = tools(K, g, kit);
  bigPlinth(K, S, T, kit, 'VERIFY BAY');
  const lane = makeLane(K, g, S, T, kit, { IN: [2.9, 0.6], PASS: [0.6, 2.9], REJ: [2.05, 2.05], big: true, skip: [[-0.62, 0.62]], kicker: true });
  const { LG, W } = lane;
  const JR = 0.52, UP = 2.25, DOWN = 0.99;

  // ---------- TEST PLATE: the brass seat the bell jar seals onto, rivets, the beetle's hatch ----------
  K.cyl(0.64, 0.68, 0.16, P.ironM, 20, 0, 0.9, 0, LG);
  K.cyl(0.6, 0.6, 0.03, P.plateS, 20, 0, 0.985, 0, LG);
  { const r = K.torus(JR + 0.03, 0.035, P.brass, 4, 24, 0, 1.0, 0, LG); r.rotation.x = Math.PI / 2; }
  T.rivets(LG, 0, 0, 0.64, 0.95, 16);
  const HU = 0.3, HWv = -0.27; // the hatch (lane u, w)
  K.box(0.17, 0.02, 0.17, P.soot, HU, 0.997, W(HWv), LG);
  const hatch = K.dyn(K.group(LG, HU - 0.085, 1.0, W(HWv)));
  K.box(0.17, 0.025, 0.17, P.brassD, 0.085, 0.012, 0, hatch);

  // ---------- THE BELL JAR: glass dome, brass hoops, clamp dogs, the hook; an inner wash that fills with light ----------
  const JAR = K.dyn(K.group(LG, 0, UP, 0));
  const prof = [[JR, 0], [JR, 0.58], [JR - 0.03, 0.7], [JR - 0.1, 0.83], [JR - 0.22, 0.94], [0.14, 1.01], [0.001, 1.03]];
  K.lathe(prof, P.glass, 20, 0, 0, 0, JAR).castShadow = false;
  for (const [y, r, m, tt] of [[0.03, JR + 0.03, P.brass, 0.05], [0.56, JR + 0.015, P.brassD, 0.03], [0.9, JR - 0.17, P.brass, 0.03]]) { const h = K.torus(r, tt, m, 4, 22, 0, y, 0, JAR); h.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; const d = K.box(0.08, 0.15, 0.08, P.brassD, Math.cos(a) * (JR + 0.05), 0.08, Math.sin(a) * (JR + 0.05), JAR); d.rotation.y = -a; }
  K.cyl(0.07, 0.09, 0.09, P.brass, 10, 0, 1.06, 0, JAR); K.sph(0.06, P.brassL, 0, 1.13, 0, JAR, 8, 6);
  K.torus(0.06, 0.018, P.steel, 4, 10, 0, 1.22, 0, JAR);
  const washM = K.glow(0x5aff9a, 0, true); washM.side = THREE.DoubleSide;
  const washG = K.dyn(K.group(JAR));
  K.lathe(prof.map(([r, h]) => [Math.max(0.001, r - 0.05), h * 0.96]), washM, 16, 0, 0.01, 0, washG);

  // ---------- HOIST GANTRY behind the lane: two posts, crossbeam, cantilever, the hydraulic cylinder ----------
  const GW = -0.7, GY = 4.3;
  for (const s of [-1, 1]) {
    const u = s * 0.9;
    K.box(0.22, GY - 0.41, 0.22, P.iron, u, (GY + 0.41) / 2, W(GW), LG);
    K.box(0.34, 0.24, 0.34, P.ironM, u, 0.53, W(GW), LG); K.box(0.38, 0.05, 0.38, P.brassD, u, 0.66, W(GW), LG);
    for (const y of [1.3, 2.4, 3.5]) K.box(0.27, 0.07, 0.27, P.brass, u, y, W(GW), LG);
    T.row(LG, u, 1.45, W(GW + 0.12), u, 3.35, W(GW + 0.12), 6, P.brassL, 0.045);
    const br = K.box(0.08, 0.95, 0.08, P.ironL, s * 0.62, GY - 0.4, W(GW), LG); br.rotation.z = s * 0.72;
  }
  K.box(2.1, 0.26, 0.28, P.ironM, 0, GY, W(GW), LG);
  K.box(2.16, 0.06, 0.32, P.brass, 0, GY + 0.16, W(GW), LG);
  T.row(LG, -0.95, GY - 0.06, W(GW + 0.15), 0.95, GY - 0.06, W(GW + 0.15), 10, P.brassL, 0.045);
  K.box(0.26, 0.24, -GW + 0.16, P.ironM, 0, GY, W(GW / 2 + 0.08), LG);
  K.box(0.3, 0.04, -GW + 0.18, P.ironL, 0, GY + 0.14, W(GW / 2 + 0.08), LG);
  K.box(0.07, 0.05, -GW + 0.2, P.brass, 0, GY + 0.15, W(GW / 2 + 0.08), LG);
  K.cyl(0.13, 0.13, 0.72, P.brass, 12, 0, GY - 0.46, 0, LG);
  for (const y of [GY - 0.14, GY - 0.8]) K.cyl(0.165, 0.165, 0.07, P.brassD, 12, 0, y, 0, LG);
  K.cyl(0.04, 0.04, 0.3, P.copper, 6, 0.15, GY - 0.3, 0, LG);
  const rod = K.dyn(K.box(0.06, 1, 0.06, P.steel, 0, 3, 0, LG));
  { const sp = lane.pt(-0.12, GW, GY + 0.4); const F = T.face(S, sp.x, sp.y, sp.z);
    for (const x of [-0.34, 0.34]) K.box(0.06, 0.3, 0.06, P.ironM, x, -0.12, -0.04, F);
    K.box(0.96, 0.34, 0.04, P.brassD, 0, 0, -0.02, F);
    K.box(0.84, 0.28, 0.03, kit.text('VERIFY', { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e' }), 0, 0, 0.01, F);
    for (const x of [-0.45, 0.45]) K.box(0.04, 0.04, 0.04, P.brassL, x, 0, 0.02, F); }
  // siren on the crossbeam
  K.cyl(0.11, 0.13, 0.08, P.brassD, 8, 0.62, GY + 0.23, W(GW), LG);
  const sirenSpin = K.dyn(K.group(LG, 0.62, GY + 0.36, W(GW)));
  const sirenM = K.mat(0x3a0c08, { e: 0 }); K.box(0.16, 0.1, 0.05, sirenM, 0.05, 0, 0, sirenSpin);
  const sirenDomeM = K.glow(0xff3020, 0.3); K.sph(0.13, sirenDomeM, 0.62, GY + 0.36, W(GW), LG, 8, 6).castShadow = false;

  // ---------- REPLAY CABINET (back): the pinned drum that plays the bug back, the comb, the horn, the bug card ----------
  const BW = 2.3, BH = 2.5;
  const { TB, FZ } = cabinet(K, S, T, kit, -0.98, -0.98, BW, BH, 0.6);
  const DY = 1.5, DZ = FZ + 0.3;
  for (const s of [-1, 1]) { K.box(0.12, 0.5, 0.5, P.ironM, s * 0.86, DY - 0.12, FZ + 0.2, TB); const b = K.cyl(0.08, 0.08, 0.14, P.brass, 8, s * 0.86, DY, DZ, TB); b.rotation.z = Math.PI / 2; }
  const drum = K.dyn(K.group(TB, 0, DY, DZ));
  { const d = K.cyl(0.3, 0.3, 1.5, P.brass, 16, 0, 0, 0, drum); d.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) { const e = K.cyl(0.33, 0.33, 0.05, P.brassD, 16, s * 0.76, 0, 0, drum); e.rotation.z = Math.PI / 2; }
    let sd = 3; const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    for (let i = 0; i < 46; i++) { const a = rr() * Math.PI * 2, x = -0.66 + Math.floor(rr() * 12) * 0.12; K.box(0.04, 0.06, 0.04, P.steel, x, Math.cos(a) * 0.31, Math.sin(a) * 0.31, drum).rotation.x = a; } }
  K.box(1.5, 0.06, 0.12, P.ironM, 0, DY + 0.42, DZ - 0.2, TB);
  for (let i = 0; i < 12; i++) K.box(0.05, 0.035, 0.26, P.steel, -0.66 + i * 0.12, DY + 0.36, DZ - 0.1, TB);
  // the horn
  const HG = K.group(TB, 0.72, BH + 0.48, 0.12); HG.rotation.x = 0.85;
  K.cyl(0.05, 0.06, 0.32, P.brassD, 8, 0.72, BH + 0.36, 0.12, TB);
  K.lathe([[0.05, 0], [0.055, 0.22], [0.08, 0.42], [0.14, 0.6], [0.26, 0.74], [0.44, 0.84]], P.copper2, 18, 0, 0, 0, HG);
  { const rim = K.torus(0.44, 0.025, P.brass, 4, 20, 0, 0.84, 0, HG); rim.rotation.x = Math.PI / 2; }
  const hornMouth = T.marker(HG, 0, 0.8, 0);
  // the bug card: which issue is being replayed
  const card = kit.liveText(40, 9, 1);
  const cardM = new THREE.MeshBasicMaterial({ map: card.tex, fog: false });
  K.box(0.95, 0.22, 0.03, P.brassD, -0.52, BH - 0.3, FZ + 0.01, TB);
  K.box(0.88, 0.18, 0.03, cardM, -0.52, BH - 0.3, FZ + 0.03, TB);
  card.draw('REPLAY', '#8a6a3a', '#1a1006', '#7a5822');
  const vacNeedle = T.gauge(TB, 0.55, BH - 0.32, FZ + 0.03, 0.17, 0, 0);
  for (let i = 0; i < 5; i++) K.box(1.6, 0.035, 0.02, P.soot, 0, 0.42 + i * 0.07, FZ + 0.01, TB);
  T.row(TB, -1.0, 0.85, FZ + 0.03, 1.0, 0.85, FZ + 0.03, 9, P.brassL, 0.045);
  K.tube([[1.25, 0.9, 0.0], [1.6, 0.8, 0.4], [1.9, 0.5, 0.9]], 0.045, P.copper, TB, 8, 5);

  // ---------- VACUUM PUMP (front left): leather bellows, pump barrel, gauge, hose to the gantry ----------
  const VP = T.face(S, -0.66, 0.41, 2.1);
  K.box(0.95, 0.12, 0.58, P.ironM, 0, 0.06, 0, VP);
  K.box(0.76, 0.05, 0.52, P.brassD, -0.12, 0.14, 0, VP);
  const bel = K.dyn(K.group(VP, -0.12, 0.17, 0));
  for (let i = 0; i < 4; i++) K.box(i % 2 ? 0.6 : 0.68, 0.1, i % 2 ? 0.4 : 0.47, P.leather, 0, 0.05 + i * 0.1, 0, bel);
  const belTop = K.dyn(K.group(VP, -0.12, 0.6, 0));
  K.box(0.74, 0.05, 0.5, P.woodD, 0, 0, 0, belTop); K.box(0.78, 0.035, 0.04, P.brass, 0, 0.005, 0.25, belTop); K.box(0.05, 0.3, 0.05, P.steel, 0.3, 0.16, 0, belTop);
  K.cyl(0.12, 0.12, 0.62, P.copper, 10, 0.32, 0.45, -0.1, VP);
  for (const y of [0.25, 0.65]) K.cyl(0.135, 0.135, 0.05, P.brassD, 10, 0.32, y, -0.1, VP);
  const vpNeedle = T.gauge(VP, 0.32, 0.92, 0.05, 0.1, 0, 0);
  { const a = lane.pt(0.9, GW, 1.5); K.tube([[-0.66 + 0.2, 1.1, 2.1 - 0.25], [0.0, 1.5, 2.1], [a.x, 1.5, a.z]], 0.04, P.rubber, S, 10, 5); }

  // ---------- ACCUMULATOR (back right) + SPECIMEN SHELF (front right): pinned beetles under glass ----------
  const AC = T.face(S, 1.1, 0.41, -1.72);
  K.cyl(0.36, 0.4, 0.14, P.ironM, 12, 0, 0.07, 0, AC);
  K.cyl(0.3, 0.3, 2.0, P.iron, 12, 0, 1.1, 0, AC);
  { const d = K.sph(0.3, P.ironL, 0, 2.1, 0, AC, 12, 8); d.scale.y = 0.5; }
  for (const y of [0.4, 1.1, 1.8]) T.band(AC, 0, 0, 0.315, y, P.brass, 0.07, 12);
  const acNeedle = T.gauge(AC, 0.0, 1.45, 0.3, 0.12, 0, 0);
  K.cyl(0.04, 0.04, 0.3, P.brass, 6, 0, 2.35, 0, AC);
  K.tube([[0.2, 2.0, 0.1], [0.0, 2.6, 0.9], [-0.3, 3.4, 1.6]], 0.045, P.copper, AC, 10, 5);
  const SH = T.face(S, 2.12, 0.41, -0.62);
  K.box(0.95, 0.06, 0.38, P.wood, 0, 0.62, 0, SH); K.box(1.0, 0.04, 0.42, P.brassD, 0, 0.66, 0, SH);
  for (const x of [-0.42, 0.42]) K.box(0.06, 0.62, 0.32, P.iron, x, 0.31, 0, SH);
  for (const x of [-0.28, 0.0, 0.28]) {
    K.cyl(0.11, 0.12, 0.04, P.brassD, 10, x, 0.7, 0, SH);
    K.lathe([[0.1, 0], [0.1, 0.16], [0.07, 0.24], [0.001, 0.27]], P.glass, 12, x, 0.72, 0, SH).castShadow = false;
    const b = K.sph(0.045, P.redD, x, 0.76, 0, SH, 6, 4); b.scale.set(1.3, 0.6, 1); b.rotation.y = 1.0 + x * 3;
  }
  K.box(0.7, 0.12, 0.02, kit.text('FIXED', { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e' }), 0, 0.45, 0.17, SH);

  // ---------- THE BEETLE: a clockwork bug that comes out of the hatch while the bug is replayed ----------
  const BUG = K.dyn(K.group(LG, HU, 0.84, W(HWv)));
  const bugB = K.dyn(K.group(BUG));
  const shellM = kit.pal(0xa02c16, 0.9);
  { const sh = K.sph(0.1, shellM, 0, 0.075, 0, bugB, 10, 6); sh.scale.set(1.35, 0.62, 1); sh.castShadow = false; }
  K.box(0.24, 0.012, 0.012, P.ink, -0.01, 0.137, 0, bugB);
  K.sph(0.05, P.ink, 0.14, 0.055, 0, bugB, 6, 4);
  const eyeM = K.glow(0x401008);
  for (const s of [-1, 1]) { K.box(0.026, 0.026, 0.026, eyeM, 0.178, 0.07, s * 0.028, bugB); const a = K.box(0.11, 0.012, 0.012, P.ink, 0.22, 0.1, s * 0.045, bugB); a.rotation.y = -s * 0.5; a.rotation.z = 0.5; }
  for (const x of [-0.07, 0, 0.07]) for (const s of [-1, 1]) { const l = K.box(0.022, 0.014, 0.15, P.ink, x, 0.035, s * 0.09, bugB); l.rotation.x = -s * 0.45; }
  K.box(0.02, 0.07, 0.02, P.brass, -0.06, 0.17, 0, bugB);
  const bugKey = K.dyn(K.group(bugB, -0.06, 0.22, 0)); K.torus(0.035, 0.012, P.brassL, 4, 8, 0, 0, 0, bugKey);
  bugB.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  // ---------- the light in the jar (the bay's one point light) ----------
  const lt = K.light(0x7af0d8, 0, 4.2, 0, 1.75, 0, LG);

  // ---------- caution + status lamp, verdict glyph ----------
  const caution = K.caution(S, -1.85, 0.41, 2.25, 1.0);
  const lamp = K.statusLamp(S, 2.25, 0.41, -1.85, 1.25);
  const gp = lane.pt(-1.05, -0.2, 3.7);
  const vglyph = T.glyph(gp.x, gp.y, gp.z, 1.0);

  // ---------- the cycle ----------
  const LOWER = 0.55, SEAL = 1.0, MIN = 2.8;
  let klax = 0, first = true, lightK = 0, bugA = Math.atan2(HWv, HU), bugUp = 0, bugFlip = 0, tNote = 0, tSteam = 0, beltK = 0;
  const c = makeCycle(K, M, kit, lane, T, g, {
    workU: 0, feedT: 0.95, verdictT: 1.8, outT: 0.9, dumpT: 0.6, feedVerb: 'into the test chamber', passVerb: 'the bug is gone',
    work: (cc) => cc.pt >= MIN + cc.runs * 0.8,
    decide: (it) => "Can't reproduce the bug for " + it.label() + '. Pass it anyway?',
    onTake: (it) => card.draw('BUG ' + it.label(), '#ffd27a', '#1a1006', '#e4b85e'),
    onVerdict: (v) => { if (v.pass) { const p = lane.pt(0, 0, 1.5); T.motes(p.x, p.y, p.z, 14, GREEN); } else { klax = 2.6; const p = lane.pt(0, 0, 1.4); T.sparks(p.x, p.y, p.z, 14, 0xff6040); } },
  });
  const doing = () => (c.pt < LOWER ? 'sealing the test chamber' : c.pt < SEAL ? 'pumping it down' : c.runs ? 'replaying the bug (still verifying)' : 'replaying the original bug');
  const tmp = new THREE.Vector3();

  return { g, update(t, dt) {
    if (first) { first = false; vglyph.gl.visible = false; }
    const blk = M.blocked;
    if (!blk) { c.step(dt, t); M.setState(c.it ? 'WORKING' : 'IDLE', c.detail(doing())); }
    c.place(dt);
    const S_ = M.stateShown, work = S_ === 'WORKING';
    lamp.set(S_, t); caution.update(t, dt, S_);
    const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
    lightK += ((work ? 1 : 0) - lightK) * Math.min(1, dt * 2.5);
    const replay = c.ph === 'work' && c.pt > SEAL;
    const verdict = c.ph === 'verdict' && c.v;
    // the jar comes down over the capsule, stays sealed through the replay and the verdict, then lifts
    const jarDown = c.ph === 'work' ? K.smooth(K.clamp01(c.pt / LOWER)) : c.ph === 'verdict' ? 1 - K.smooth(K.clamp01((c.pt - 1.15) / 0.55)) : 0;
    JAR.position.y = K.lerp(UP, DOWN, jarDown) + (blk && jarDown > 0.9 ? Math.sin(t * 40) * 0.004 : 0);
    const hookY = JAR.position.y + 1.24, cylY = GY - 0.83;
    rod.position.y = (hookY + cylY) / 2; rod.scale.y = Math.max(0.02, cylY - hookY);
    // the wash inside the jar: teal flicker while replaying, green rising on a pass, red flashes on a fail, amber blocked
    let wc = 0x7af0d8, wo = 0, ws = 1;
    if (blk && jarDown > 0.5) { wc = 0xffa020; wo = 0.12 + 0.14 * strobe; }
    else if (verdict && c.v.pass) { wc = GREEN; ws = K.clamp01(c.pt / 0.6); wo = 0.42 * (1 - K.clamp01((c.pt - 1.0) / 0.6)); }
    else if (verdict) { wc = RED; wo = (blink(t, 16) ? 0.4 : 0.1) * (1 - K.clamp01((c.pt - 1.0) / 0.6)); }
    else if (replay) { wc = Math.random() < 0.1 ? 0xe8fff8 : 0x7af0d8; wo = 0.1 + Math.random() * 0.06; }
    washM.color.setHex(wc); washM.opacity = wo; washG.scale.y = Math.max(0.02, ws); washG.visible = wo > 0.01;
    // the one light
    let li = 0, lc = 0x7af0d8;
    if (blk) { lc = 0xffa020; li = 1.0 + 0.7 * Math.sin(t * 6); }
    else if (verdict && c.v.pass) { lc = 0x5aff9a; li = 2.4 * (1 - K.clamp01((c.pt - 0.9) / 0.9)); }
    else if (verdict) { lc = 0xff4020; li = blink(t, 16) ? 2.4 : 0.6; }
    else if (replay) { li = 1.2 + Math.random() * 0.7; }
    else if (work) li = 0.35;
    lt.color.setHex(lc); lt.intensity = li;
    // the beetle: out of the hatch while the bug replays, circles the capsule; flips over when the fix holds
    const showBug = !!c.it && (replay || (c.ph === 'work' && c.runs > 0) || (verdict && c.pt < 1.1));
    bugUp += ((showBug ? 1 : 0) - bugUp) * Math.min(1, dt * (blk ? 0 : 5));
    if (!blk && bugUp > 0.6 && !(verdict && c.v.pass)) bugA += dt * (verdict ? 5.5 : 2.6);
    bugFlip += ((verdict && c.v.pass ? 1 : 0) - bugFlip) * Math.min(1, dt * 7);
    if (!c.it || c.ph === 'feed') bugFlip = 0;
    const R = 0.404;
    BUG.position.set(Math.cos(bugA) * R, 0.84 + bugUp * 0.16 + bugFlip * 0.1, W(Math.sin(bugA) * R));
    BUG.rotation.y = Math.atan2(-W(Math.cos(bugA)), -Math.sin(bugA));
    BUG.visible = bugUp > 0.02;
    bugB.rotation.x = bugFlip * Math.PI;
    bugB.position.y = blk ? 0 : Math.abs(Math.sin(t * 22)) * 0.012 * (1 - bugFlip);
    bugKey.rotation.x += dt * (blk ? 0 : bugUp > 0.5 && bugFlip < 0.5 ? 9 : 0);
    eyeM.color.setHex(blk ? (blink(t, 6) ? 0xffa020 : 0x301804) : bugFlip > 0.5 ? 0x200804 : verdict ? 0xff2010 : bugUp > 0.5 ? (blink(t, 5) ? 0xff6020 : 0x8a1a08) : 0x401008);
    hatch.rotation.z = (showBug && bugUp < 0.98) || (bugUp > 0.05 && bugUp < 0.95) ? 1.3 : 0;
    // the drum plays the bug back; the horn sings
    drum.rotation.x += dt * (blk ? 0 : replay ? 2.2 : work ? 0.4 : 0);
    tNote -= dt;
    if (replay && !blk && tNote <= 0) { tNote = 0.22; T.at(hornMouth, tmp); K.spawn(g, tmp.x, tmp.y, tmp.z, K.R() * 0.5, 0.5 + Math.random() * 0.3, K.R() * 0.5 + 0.2, Math.random() < 0.5 ? 0xffd27a : 0x7af0d8, 1.2, 0.07, -0.25, true); }
    if (c.it && c.v && c.ph !== 'work') card.draw(c.v.pass ? 'FIXED' : 'BUG ' + c.it.label(), c.v.pass ? '#7affb0' : (blink(t, 8) ? '#ff6a4a' : '#8a2a1a'), c.v.pass ? '#06200e' : '#2a0806', '#e4b85e');
    else if (blk) card.draw('?', blink(t, 6) ? '#ffb020' : '#6a4010', '#2a1a04', '#e4b85e');
    else if (!c.it) card.draw('REPLAY', lightK > 0.5 ? '#ffd27a' : '#8a6a3a', '#1a1006', '#7a5822');
    else if (c.ph === 'work') card.draw('BUG ' + c.it.label(), '#ffd27a', '#1a1006', '#e4b85e');
    // vacuum: the bellows pump the jar down while sealing, breathe while replaying
    beltK = c.ph === 'work' && c.pt > LOWER && c.pt < SEAL + 0.3 && !blk ? 1 : 0;
    const bs = blk ? 0.75 : beltK ? 0.72 + 0.28 * Math.abs(Math.sin(t * 9)) : replay ? 0.85 + 0.1 * Math.sin(t * 2) : 1;
    bel.scale.y = bs; belTop.position.y = 0.17 + 0.4 * bs + 0.03;
    const sealed = jarDown > 0.95 && (c.pt > SEAL || c.ph === 'verdict');
    vacNeedle.rotation.z += ((blk ? -1.25 + Math.sin(t * 35) * 0.06 : sealed ? -1.0 + Math.sin(t * 3) * 0.05 : 0.9) - vacNeedle.rotation.z) * Math.min(1, dt * 5);
    vpNeedle.rotation.z += ((blk ? -1.2 : sealed ? -0.9 : 0.8) - vpNeedle.rotation.z) * Math.min(1, dt * 5);
    acNeedle.rotation.z += ((blk ? -1.3 + Math.sin(t * 30) * 0.06 : jarDown > 0.05 && jarDown < 0.95 ? -0.6 : work ? 0.1 : 0.9) - acNeedle.rotation.z) * Math.min(1, dt * 5);
    // siren: red when the bug is still there, amber when blocked
    klax = Math.max(0, klax - dt);
    sirenSpin.rotation.y += dt * (klax > 0 || blk ? 10 : 0);
    sirenM.emissive.setHex(klax > 0 ? 0xff2a10 : blk ? (strobe > 0.5 ? 0xffa010 : 0) : 0);
    sirenDomeM.opacity = klax > 0 || blk ? 0.65 : 0.22; sirenDomeM.color.setHex(blk ? 0xffa020 : 0xff3020);
    lane.passM.emissive.setHex(c.ph === 'out' || c.ph === 'give' ? (blink(t, 25) ? GREEN : 0x1a6a32) : 0);
    lane.rejM.emissive.setHex(c.ph === 'dump' || c.ph === 'giveR' ? (blink(t, 25) ? 0xff3020 : 0x5a0a04) : blk ? (strobe > 0.5 ? 0xffa020 : 0) : 0);
    // blocked: steam vents out of the cylinder and the accumulator
    tSteam -= dt;
    if (blk && tSteam <= 0) { tSteam = 0.06; const p = lane.pt(0.16, 0, GY - 0.15); T.steam(p.x, p.y, p.z, 1); if (Math.random() < 0.5) T.steam(1.1, 2.9, -1.72, 1); }
    vglyph.set(blk ? 'block' : c.verdictShown(), t, dt);
    T.stepPulses(dt);
  } };
}

// =====================================================================
// AI REVIEW
// =====================================================================
function makeTapeTex(K) {
  return K.canvasTex(64, 16, (c) => {
    c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, 64, 16);
    c.fillStyle = '#c8b890'; c.fillRect(0, 0, 64, 1); c.fillRect(0, 15, 64, 1);
    let s = 11; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let x = 1; x < 63; x += 2) {
      const k = r(), h = 3 + Math.floor(r() * 9);
      c.fillStyle = k < 0.22 ? '#2a9a50' : k < 0.36 ? '#c0382a' : '#6a5a48';
      c.fillRect(x, 3, 1, h);
    }
    for (let x = 4; x < 64; x += 8) { c.fillStyle = '#3a2a1a'; c.fillRect(x, 13, 1, 1); }
  }, [3, 1]);
}
function buildReview(K, M, kit) {
  const { THREE, P } = kit;
  const g = K.group(), S = K.group(g);
  const T = tools(K, g, kit);
  bigPlinth(K, S, T, kit, 'AI REVIEW');
  const lane = makeLane(K, g, S, T, kit, { IN: [2.9, 0.6], PASS: [0.6, 2.9], REJ: [2.05, 2.05], big: true, kicker: true });
  const { LG, W } = lane;
  const RY = 2.75, RW = -0.76, RU = 1.04;

  // ---------- READING BRIDGE: two posts behind the lane, arms forward, the rail over the lane ----------
  for (const s of [-1, 1]) {
    const u = s * RU;
    K.box(0.2, RY + 0.2 - 0.41, 0.2, P.iron, u, (RY + 0.2 + 0.41) / 2, W(RW), LG);
    K.box(0.32, 0.22, 0.32, P.ironM, u, 0.52, W(RW), LG); K.box(0.36, 0.05, 0.36, P.brassD, u, 0.65, W(RW), LG);
    for (const y of [1.25, 2.2]) K.box(0.25, 0.07, 0.25, P.brass, u, y, W(RW), LG);
    K.box(0.18, 0.2, -RW + 0.12, P.ironM, u, RY + 0.2, W(RW / 2 + 0.04), LG);
    K.box(0.22, 0.05, -RW + 0.16, P.brass, u, RY + 0.32, W(RW / 2 + 0.04), LG);
    const br = K.box(0.07, 0.66, 0.07, P.ironL, u, RY - 0.12, W(RW * 0.62), LG); br.rotation.x = -W(1) * 0.72;
  }
  K.box(RU * 2 + 0.2, 0.12, 0.16, P.brass, 0, RY + 0.24, 0, LG);
  K.box(RU * 2 + 0.2, 0.05, 0.1, P.steel, 0, RY + 0.15, 0, LG);
  T.row(LG, -RU + 0.1, RY + 0.24, W(0.09), RU - 0.1, RY + 0.24, W(0.09), 10, P.brassL, 0.045);
  // the reading carriage: a lens head with a teal reading beam, and the stamp ram
  const CAR = K.dyn(K.group(LG, 0.6, RY, 0));
  K.box(0.58, 0.24, 0.28, P.ironM, 0, 0, 0, CAR);
  K.box(0.62, 0.05, 0.32, P.brass, 0, 0.14, 0, CAR);
  for (const s of [-1, 1]) { const wh = K.cyl(0.06, 0.06, 0.34, P.brassD, 8, s * 0.18, 0.16, 0, CAR); wh.rotation.x = Math.PI / 2; }
  T.row(CAR, -0.26, 0, W(0.145), 0.26, 0, W(0.145), 5, P.brassL, 0.04);
  const carLampM = T.lamp(CAR, 0.0, 0.0, W(0.17), 0.045, 0x0c2a24);
  const LU = -0.16, SU = 0.16;
  K.cyl(0.08, 0.1, 0.34, P.brass, 10, LU, -0.28, 0, CAR);
  { const r = K.torus(0.12, 0.03, P.brassL, 4, 14, LU, -0.47, 0, CAR); r.rotation.x = Math.PI / 2; }
  const lensM = K.glow(0x2a6a60);
  K.cyl(0.11, 0.11, 0.03, lensM, 14, LU, -0.47, 0, CAR);
  const bh = RY - 0.49 - 1.12;
  const beamM = K.glow(0x7af0d8, 0, true);
  K.cone(0.24, bh, beamM, 14, LU, -0.49 - bh / 2, 0, CAR).castShadow = false;
  K.cyl(0.09, 0.09, 0.3, P.brassD, 10, SU, -0.27, 0, CAR);
  K.cyl(0.11, 0.11, 0.05, P.brass, 10, SU, -0.43, 0, CAR);
  const RAM = K.dyn(K.group(CAR, SU, -0.45, 0));
  K.cyl(0.035, 0.035, 0.36, P.steel, 6, 0, -0.18, 0, RAM);
  K.box(0.3, 0.13, 0.22, P.brass, 0, -0.42, 0, RAM);
  K.box(0.32, 0.03, 0.24, P.brassD, 0, -0.34, 0, RAM);
  const inkM = K.mat(0x2a1e16, { e: 0 });
  K.box(0.27, 0.04, 0.19, inkM, 0, -0.505, 0, RAM);

  // ---------- THE READER (back): diff tape between two reels under three magnifier lenses, the eye on top ----------
  const BW = 2.7, BH = 2.7;
  const { TB, FZ } = cabinet(K, S, T, kit, -0.98, -0.98, BW, BH, 0.62);
  const RLY = 1.92, RLX = 0.95, TY = RLY - 0.27;
  const reels = [-1, 1].map((s) => {
    K.box(0.12, 0.12, 0.2, P.ironM, s * RLX, RLY, FZ + 0.06, TB);
    const R = K.dyn(K.group(TB, s * RLX, RLY, FZ + 0.16));
    T.discZ(R, 0.36, 0.025, P.brassD, 0, 0, -0.07, 18);
    T.discZ(R, 0.26, 0.12, P.paper, 0, 0, 0, 16);
    T.ringZ(R, 0.34, 0.035, P.brass, 0, 0, 0.07, 18);
    for (let i = 0; i < 3; i++) { const sp = K.box(0.64, 0.05, 0.025, P.brass, 0, 0, 0.075, R); sp.rotation.z = i * Math.PI / 3; }
    T.discZ(R, 0.08, 0.22, P.ironM, 0, 0, 0, 8);
    return R;
  });
  const tapeTex = makeTapeTex(K);
  const tapeM = K.mat(0xffffff, { map: tapeTex, e: 0x1a140c });
  K.box(RLX * 2, 0.2, 0.012, tapeM, 0, TY, FZ + 0.16, TB);
  const magTex = tapeTex.clone(); magTex.repeat.set(0.3, 0.3); magTex.needsUpdate = true;
  const magM = K.mat(0xffffff, { map: magTex, e: 0x332a18 });
  for (const x of [-0.5, 0, 0.5]) {
    K.box(0.04, 0.3, 0.04, P.brassD, x, TY - 0.33, FZ + 0.22, TB);
    T.discZ(TB, 0.17, 0.01, magM, x, TY, FZ + 0.22, 16);
    T.discZ(TB, 0.18, 0.02, P.glass, x, TY, FZ + 0.25, 16).castShadow = false;
    T.ringZ(TB, 0.19, 0.035, P.brass, x, TY, FZ + 0.25, 18);
  }
  // the verdict sign over the reels
  const sign = kit.liveText(40, 9, 1);
  const signM = new THREE.MeshBasicMaterial({ map: sign.tex, fog: false });
  K.box(1.42, 0.36, 0.04, P.brassD, 0, BH - 0.25, FZ + 0.01, TB);
  K.box(1.32, 0.28, 0.03, signM, 0, BH - 0.25, FZ + 0.04, TB);
  sign.draw('AI REVIEW', '#8a6a3a', '#1a1006', '#7a5822');
  const ndl = [T.gauge(TB, -0.78, 0.86, FZ + 0.03, 0.16, 0, 0), T.gauge(TB, 0.78, 0.86, FZ + 0.03, 0.16, 0, 0)];
  for (let i = 0; i < 5; i++) K.box(0.9, 0.035, 0.02, P.soot, 0, 0.62 + i * 0.07, FZ + 0.01, TB);
  // the aether eye on a yoke over the cornice: looks at the reading head, amber and blinking when it's unsure
  for (const s of [-1, 1]) K.box(0.09, 0.62, 0.14, P.brassD, s * 0.55, BH + 0.48, 0.05, TB);
  K.box(1.2, 0.1, 0.32, P.ironM, 0, BH + 0.24, 0.05, TB);
  const EYE = K.dyn(K.group(TB, 0, BH + 0.72, 0.05));
  { const h = K.cyl(0.42, 0.42, 0.5, P.brass, 20, 0, 0, 0, EYE); h.rotation.x = Math.PI / 2; }
  { const d = K.sph(0.42, P.brassD, 0, 0, -0.22, EYE, 16, 10); d.scale.z = 0.6; }
  for (const s of [-1, 1]) { const ax = K.cyl(0.07, 0.07, 0.16, P.brassD, 8, s * 0.48, 0, 0, EYE); ax.rotation.z = Math.PI / 2; }
  T.ringZ(EYE, 0.42, 0.05, P.brassL, 0, 0, 0.25, 22);
  T.discZ(EYE, 0.37, 0.02, P.soot, 0, 0, 0.255, 18);
  const irisM = K.glow(0x2a6a60);
  const iris = K.dyn(T.discZ(EYE, 0.24, 0.02, irisM, 0, 0, 0.27, 18));
  T.discZ(EYE, 0.09, 0.025, P.ink, 0, 0, 0.285, 10);
  { const gd = K.sph(0.3, P.glass, 0, 0, 0.25, EYE, 14, 10); gd.scale.z = 0.35; gd.castShadow = false; }
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; K.box(0.05, 0.05, 0.05, P.brassD, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.28, EYE); }
  K.tube([[0.5, BH + 0.7, -0.1], [1.2, BH + 0.4, -0.2], [1.7, BH - 0.4, -0.1], [2.0, 1.6, 0.0]], 0.05, P.rubber, TB, 12, 5);

  // ---------- TELETYPE (front left): prints the review comments ----------
  const TT = T.face(S, -0.66, 0.41, 2.08);
  K.box(0.74, 0.34, 0.5, P.ironM, 0, 0.17, 0, TT); K.box(0.78, 0.04, 0.54, P.brassD, 0, 0.36, 0, TT);
  K.box(0.68, 0.24, 0.44, P.brass, 0, 0.5, -0.02, TT);
  { const kb = K.group(TT, 0, 0.52, 0.2); kb.rotation.x = 0.5; K.box(0.64, 0.04, 0.2, P.ironM, 0, 0, 0, kb); for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) K.box(0.05, 0.03, 0.04, P.cream, -0.26 + i * 0.075, 0.03, -0.06 + r * 0.06, kb); }
  { const pr = K.cyl(0.08, 0.08, 0.62, P.ink, 10, 0, 0.66, -0.1, TT); pr.rotation.z = Math.PI / 2; const pp = K.cyl(0.1, 0.1, 0.5, P.paper, 10, 0, 0.82, -0.16, TT); pp.rotation.z = Math.PI / 2; }
  const ttPaper = K.dyn(K.group(TT, 0, 0.72, -0.06));
  K.box(0.46, 1, 0.012, P.paper, 0, 0.5, 0, ttPaper);
  const ttHead = K.dyn(K.box(0.08, 0.08, 0.08, P.steel, 0, 0.7, 0.0, TT));

  // ---------- BOOKCASE (back left): the style guides ----------
  const BKt = K.canvasTex(32, 16, (c) => {
    const cols = ['#7a2418', '#2a5a3a', '#6a4a20', '#2a3a5a', '#8a6a2a', '#4a2a3a'];
    let x = 0, i = 0; while (x < 32) { const w = 2 + (i * 7) % 3; c.fillStyle = cols[i % cols.length]; c.fillRect(x, 1 + (i % 3), w, 15 - (i % 3)); c.fillStyle = '#c8a050'; c.fillRect(x, 4 + (i % 3), w, 1); c.fillRect(x, 12, w, 1); x += w; i++; }
  }, [1, 1]);
  const booksM = K.mat(0xffffff, { map: BKt, shine: 10 });
  const BKc = T.face(S, -1.72, 0.41, 1.08);
  K.box(0.95, 1.7, 0.38, P.woodD, 0, 0.85, -0.02, BKc);
  for (const y of [0.08, 0.6, 1.12, 1.66]) K.box(0.95, 0.05, 0.4, P.wood, 0, y, 0.0, BKc);
  for (const y of [0.33, 0.85, 1.37]) K.box(0.84, 0.44, 0.3, booksM, 0, y, 0.04, BKc);
  K.box(0.4, 0.1, 0.02, kit.text('STYLE', { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e' }), 0, 1.78, 0.18, BKc);

  // ---------- AETHER CORE (back right): powers the eye; pulses while it reads ----------
  const AC = T.face(S, 1.1, 0.41, -1.72);
  K.cyl(0.36, 0.42, 0.2, P.ironM, 12, 0, 0.1, 0, AC);
  K.cyl(0.4, 0.4, 0.05, P.brassD, 12, 0, 0.22, 0, AC);
  K.cyl(0.24, 0.24, 1.4, P.glass, 14, 0, 0.95, 0, AC).castShadow = false;
  const coreM = K.glow(0x2a8a78);
  K.cyl(0.1, 0.1, 1.3, coreM, 10, 0, 0.95, 0, AC);
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; K.box(0.04, 1.4, 0.04, P.brass, Math.cos(a) * 0.27, 0.95, Math.sin(a) * 0.27, AC); }
  K.cyl(0.3, 0.26, 0.16, P.brass, 12, 0, 1.72, 0, AC); K.sph(0.08, P.brassL, 0, 1.86, 0, AC, 8, 6);
  for (const y of [0.32, 1.58]) for (let i = 0; i < 3; i++) { const r = K.torus(0.26, 0.018, P.copper, 3, 14, 0, y + i * 0.04, 0, AC); r.rotation.x = Math.PI / 2; }

  // ---------- caution + status lamp, verdict glyph ----------
  const caution = K.caution(S, -1.85, 0.41, 2.25, 1.0);
  const lamp = K.statusLamp(S, 2.25, 0.41, -1.85, 1.25);
  const gp = lane.pt(-0.95, -0.2, 3.55);
  const vglyph = T.glyph(gp.x, gp.y, gp.z, 1.0);

  // ---------- the cycle ----------
  const READ = 2.3;
  let first = true, lightK = 0, carU = 0.6, ramK = 0, stamped = false, stampCol = GREEN, paperK = 0, tSteam = 0, eyeY = 0, eyeX = 0.3, tapeV = 0;
  const c = makeCycle(K, M, kit, lane, T, g, {
    workU: 0, feedT: 0.9, verdictT: 1.25, outT: 0.9, dumpT: 0.6, feedVerb: 'under the reader', passVerb: 'APPROVED',
    work: (cc) => cc.pt >= READ + cc.runs * 0.7,
    decide: (it) => it.label() + ': the reviewer flags a risky change. Approve anyway?',
    onTake: () => { stamped = false; },
    onVerdict: (v) => { stampCol = v.pass ? GREEN : RED; stamped = false; },
  });

  return { g, update(t, dt) {
    if (first) { first = false; vglyph.gl.visible = false; }
    const blk = M.blocked;
    if (!blk) { c.step(dt, t); M.setState(c.it ? 'WORKING' : 'IDLE', c.detail(c.runs ? 'reading the diff (review still running)' : 'reading the diff')); }
    c.place(dt);
    const S_ = M.stateShown, work = S_ === 'WORKING';
    lamp.set(S_, t); caution.update(t, dt, S_);
    const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
    lightK += ((work ? 1 : 0) - lightK) * Math.min(1, dt * 2.5);
    const reading = c.ph === 'work' && !blk;
    const verdict = c.ph === 'verdict' && c.v;
    // the carriage: sweeps the lens along the capsule, then parks the stamp over it and stamps
    let goal = 0.62;
    if (c.ph === 'work') goal = 0.16 + 0.34 * Math.sin(c.pt * 2.2);
    else if (verdict) goal = -SU;
    if (!blk) carU += (goal - carU) * Math.min(1, dt * (c.ph === 'work' ? 12 : 6));
    CAR.position.x = carU;
    let rk = 0;
    if (verdict) { const p = c.pt; rk = p < 0.22 ? 0 : p < 0.34 ? (p - 0.22) / 0.12 : p < 0.6 ? 1 : p < 0.85 ? 1 - (p - 0.6) / 0.25 : 0; }
    if (!blk) ramK = rk;
    RAM.position.y = -0.45 - ramK * 0.36;
    if (verdict && ramK >= 1 && !stamped) { stamped = true; const p = lane.pt(0, 0, 1.45); for (let i = 0; i < 10; i++) K.spawn(g, p.x + K.R() * 0.2, p.y, p.z + K.R() * 0.2, K.R() * 1.8, 0.4 + Math.random() * 0.8, K.R() * 1.8, stampCol, 0.5, 0.045, 5, true); T.pulse(p.x, 1.05, p.z, stampCol); }
    inkM.emissive.setHex(c.v && (verdict || c.ph === 'out' || c.ph === 'dump') ? stampCol : 0);
    beamM.opacity = blk ? 0.14 * strobe : reading ? 0.2 + 0.08 * Math.sin(t * 19) : 0;
    beamM.color.setHex(blk ? 0xffa020 : 0x7af0d8);
    lensM.color.setHex(blk ? (strobe > 0.5 ? 0xffa020 : 0x3a2004) : reading ? 0xb8fff0 : lightK > 0.5 ? 0x3a9a88 : 0x1a3a34);
    carLampM.emissive.setHex(blk ? (strobe > 0.5 ? 0xffa020 : 0) : reading ? (blink(t, 12) ? 0x7af0d8 : 0x1a4a40) : 0);
    // the tape runs while reading
    tapeV += ((reading ? 0.9 : work ? 0.12 : 0) - tapeV) * Math.min(1, dt * 4);
    tapeTex.offset.x += tapeV * dt * 0.5; magTex.offset.x = tapeTex.offset.x * 0.3 + 0.35;
    reels.forEach((R, i) => { R.rotation.z -= tapeV * dt * (i ? 2.6 : 3.4); });
    // the eye: follows the reading head, amber and blinking while blocked, green / red on the verdict
    const ey = blk ? 0 : -0.4 * (carU - 0.1), ex = blk ? 0.1 : 0.32;
    eyeY += (ey - eyeY) * Math.min(1, dt * 5); eyeX += (ex - eyeX) * Math.min(1, dt * 5);
    EYE.rotation.set(eyeX, eyeY, 0);
    const blinkK = blk ? (Math.sin(t * 5) > 0.85 ? 0.1 : 1) : 1;
    iris.scale.set(1, blinkK, 1);
    irisM.color.setHex(blk ? (strobe > 0.5 ? 0xffb020 : 0x8a5010) : c.v && (verdict || c.ph === 'out' || c.ph === 'dump') ? stampCol : reading ? (blink(t, 30) ? 0xb8fff0 : 0x7af0d8) : lightK > 0.5 ? 0x4ab8a8 : 0x1e4a44);
    coreM.color.setHex(blk ? (strobe > 0.5 ? 0xffa020 : 0x4a2a08) : reading ? (0x3ad8c0 + (Math.random() < 0.2 ? 0x204020 : 0)) : lightK > 0.5 ? 0x2a9a88 : 0x163a34);
    // the sign
    if (blk) sign.draw('?', blink(t, 6) ? '#ffb020' : '#6a4010', '#2a1a04', '#e4b85e');
    else if (c.v && (verdict ? c.pt > 0.34 : c.ph === 'out' || c.ph === 'dump' || c.ph === 'give' || c.ph === 'giveR')) sign.draw(c.v.pass ? 'APPROVED' : 'CHANGES', c.v.pass ? '#7affb0' : '#ff6a4a', c.v.pass ? '#06200e' : '#2a0806', '#e4b85e');
    else if (c.ph === 'work' || verdict) sign.draw('READING', blink(t, 3) ? '#7af0d8' : '#3a9a88', '#06141a', '#7a5822');
    else sign.draw('AI REVIEW', lightK > 0.5 ? '#ffd27a' : '#8a6a3a', '#1a1006', '#7a5822');
    // the teletype types out the comments
    const pg = c.it ? (c.ph === 'work' ? Math.min(1, c.pt / READ) * 0.42 : c.v ? 0.45 : 0.02) : 0.02;
    paperK += (pg - paperK) * Math.min(1, dt * 3);
    ttPaper.scale.y = Math.max(0.02, paperK); ttPaper.rotation.x = -paperK * 0.5;
    ttHead.position.x = reading ? Math.sin(t * 14) * 0.22 : ttHead.position.x;
    ndl[0].rotation.z += ((blk ? -1.25 + Math.sin(t * 33) * 0.07 : reading ? -0.8 + Math.sin(t * 6) * 0.2 : work ? 0 : 0.9) - ndl[0].rotation.z) * Math.min(1, dt * 6);
    ndl[1].rotation.z += ((blk ? -1.2 + Math.sin(t * 29) * 0.07 : reading ? 0.8 - Math.min(1, c.pt / READ) * 1.8 : 0.9) - ndl[1].rotation.z) * Math.min(1, dt * 6);
    lane.passM.emissive.setHex(c.ph === 'out' || c.ph === 'give' ? (blink(t, 25) ? GREEN : 0x1a6a32) : 0);
    lane.rejM.emissive.setHex(c.ph === 'dump' || c.ph === 'giveR' ? (blink(t, 25) ? 0xff3020 : 0x5a0a04) : blk ? (strobe > 0.5 ? 0xffa020 : 0) : 0);
    tSteam -= dt;
    if (blk && tSteam <= 0) { tSteam = 0.07; T.steam(-0.98 - 0.5, 0.41 + BH + 0.3, -0.98 + 0.5, 1); }
    vglyph.set(blk ? 'block' : c.verdictShown(), t, dt);
    T.stepPulses(dt);
  } };
}

// =====================================================================
// MERGE GATE (launch floor): the capsule comes in from the left, waits on the turntable in front of the portcullis
// for the player; yes = the lever throws, the lock wheel spins, the bolts pull back and the portcullis rises on its
// counterweights; the capsule rolls through to the pad and the gate drops behind it. No = the turntable turns it
// onto the red siding to the sent-back belt.
// =====================================================================
function buildGate(K, M, kit) {
  const { THREE, P } = kit;
  const g = K.group(), S = K.group(g);
  const T = tools(K, g, kit);
  bigPlinth(K, S, T, kit, 'MERGE GATE');
  const WU = -1.27;
  const lane = makeLane(K, g, S, T, kit, { IN: [-0.6, 2.9], PASS: [2.9, -0.6], REJ: [2.05, 2.05], big: true, noTrough: true, skip: [[WU - 0.47, WU + 0.47]], gaps: [[-2.2, 0.66]], backGaps: [[-0.66, -0.02]], boomU: -2.0 });
  const { LG, W } = lane;
  lane.yawOut = -Math.PI / 4;
  const W0 = lane.pt(WU, 0, 1.0); // the waiting point (turntable centre)

  // ---------- THE WALL: riveted iron plate in the plane z = 1.15 with an arched doorway at the lane ----------
  const WZ = 1.15, WT = 0.34, DCX = 1.15, AW = 0.76, AY = 1.92, WX0 = -1.5, WX1 = 2.4, WH = 3.4;
  const shape = new THREE.Shape();
  shape.moveTo(WX0, 0.41); shape.lineTo(DCX - AW, 0.41); shape.lineTo(DCX - AW, AY); shape.absarc(DCX, AY, AW, Math.PI, 0, true);
  shape.lineTo(DCX + AW, 0.41); shape.lineTo(WX1, 0.41); shape.lineTo(WX1, WH); shape.lineTo(WX0, WH); shape.lineTo(WX0, 0.41);
  const wg = new THREE.ExtrudeGeometry(shape, { depth: WT, bevelEnabled: false, curveSegments: 18 });
  wg.translate(0, 0, WZ - WT / 2);
  K.mesh(wg, P.wall, 0, 0, 0, S);
  const FZ = WZ + WT / 2;
  K.box(WX1 - WX0 + 0.12, 0.14, WT + 0.16, P.ironM, (WX0 + WX1) / 2, WH + 0.07, WZ, S);
  K.box(WX1 - WX0 + 0.16, 0.05, WT + 0.2, P.brass, (WX0 + WX1) / 2, WH + 0.16, WZ, S);
  for (const x of [WX0, WX1]) { K.box(0.3, WH - 0.41 + 0.1, WT + 0.14, P.iron, x, (WH + 0.41) / 2, WZ, S); for (const y of [0.8, 2.0, 3.0]) K.box(0.34, 0.07, WT + 0.18, P.brass, x, y, WZ, S); }
  T.row(S, WX0 + 0.25, WH - 0.12, FZ + 0.01, DCX - AW - 0.25, WH - 0.12, FZ + 0.01, 7, P.brassL, 0.05);
  T.row(S, WX0 + 0.25, 0.62, FZ + 0.01, DCX - AW - 0.3, 0.62, FZ + 0.01, 7, P.brassL, 0.05);
  // the arch: iron jambs + voussoir ring, hazard stripes, keystone
  for (const s of [-1, 1]) { K.box(0.2, AY - 0.41, 0.12, P.ironM, DCX + s * (AW + 0.1), (AY + 0.41) / 2, FZ + 0.05, S); T.hazard(S, 0.5, DCX + s * (AW + 0.1), 0.75, FZ + 0.12, 4, -Math.PI / 2 * 0, 0.08, 0.02).rotation.z = Math.PI / 2; }
  K.torus(AW + 0.1, 0.1, P.ironM, 5, 18, DCX, AY, FZ + 0.05, S, Math.PI);
  K.torus(AW + 0.22, 0.035, P.brass, 4, 18, DCX, AY, FZ + 0.08, S, Math.PI);
  K.box(0.24, 0.3, 0.16, P.brass, DCX, AY + AW + 0.12, FZ + 0.06, S);
  K.box(AW * 2 + 0.1, 0.06, WT + 0.06, P.brassD, DCX, 0.44, WZ, S);
  for (const [x, y, sx, sy] of [[-0.6, 1.6, 0.5, 0.35], [2.0, 2.6, 0.35, 0.5], [-1.1, 2.8, 0.4, 0.3]]) { const d = K.box(sx, sy, 0.01, P.grime, x, y, FZ + 0.006, S); d.castShadow = false; }
  for (const x of [-0.3, 2.05]) for (let i = 0; i < 3; i++) K.box(0.03, 0.18 + i * 0.05, 0.02, P.rust, x + i * 0.05, WH - 0.35 - i * 0.04, FZ + 0.01, S);

  // ---------- THE GUIDE FRAME + PORTCULLIS (in front of the doorway), pulleys, chains, counterweights ----------
  const GZ = FZ + 0.1, PX = 0.95, GTOP = 4.55, PB = 1.03, PH = 1.86, LIFT = 1.48;
  for (const s of [-1, 1]) {
    const x = DCX + s * PX;
    K.box(0.18, GTOP - 0.41, 0.2, P.iron, x, (GTOP + 0.41) / 2, GZ, S);
    K.box(0.3, 0.22, 0.3, P.ironM, x, 0.52, GZ, S);
    for (const y of [1.3, 2.5, 3.6]) K.box(0.22, 0.07, 0.24, P.brass, x, y, GZ, S);
    K.box(0.06, GTOP - 0.9, 0.04, P.brassD, x - s * 0.1, (GTOP + 0.6) / 2, GZ + 0.05, S);
    T.row(S, x, 0.9, GZ + 0.11, x, GTOP - 0.3, GZ + 0.11, 8, P.brassL, 0.045);
  }
  K.box(PX * 2 + 0.5, 0.24, 0.26, P.ironM, DCX, GTOP, GZ, S);
  K.box(PX * 2 + 0.56, 0.06, 0.3, P.brass, DCX, GTOP + 0.15, GZ, S);
  const pulleys = [-1, 1].map((s) => { const p = K.dyn(K.group(S, DCX + s * PX, GTOP - 0.02, GZ + 0.2)); T.discZ(p, 0.2, 0.06, P.iron, 0, 0, 0, 14); T.ringZ(p, 0.2, 0.03, P.brass, 0, 0, 0.035, 16); for (let i = 0; i < 3; i++) { const sp = K.box(0.36, 0.04, 0.02, P.brassD, 0, 0, 0.04, p); sp.rotation.z = i * Math.PI / 3; } return p; });
  const PORT = K.dyn(K.group(S, DCX, PB, GZ));
  { const n = 7, w = PX * 2 - 0.26;
    for (let i = 0; i < n; i++) { const x = -w / 2 + i * w / (n - 1); K.box(0.07, PH, 0.07, P.iron, x, PH / 2, 0, PORT); K.cone(0.05, 0.12, P.iron, 4, x, -0.04, 0, PORT).rotation.x = Math.PI; }
    for (const y of [0.25, 0.75, 1.25, 1.75]) K.box(w + 0.1, 0.07, 0.09, P.ironM, 0, y, 0, PORT);
    K.box(w + 0.16, 0.12, 0.12, P.brassD, 0, PH, 0, PORT);
    T.hazard(PORT, w + 0.1, 0, 0.1, 0.06, 8, 0, 0.08, 0.02); }
  // the lock: a brass wheel on the portcullis, two bolts into the guide posts
  const LKY = 0.9;
  T.discZ(PORT, 0.36, 0.08, P.brassD, 0, LKY, 0.08, 18);
  T.ringZ(PORT, 0.36, 0.04, P.brass, 0, LKY, 0.13, 20);
  const bolts = [-1, 1].map((s) => { const b = K.dyn(K.group(PORT, s * 0.36, LKY, 0.1)); K.box(0.6, 0.12, 0.1, P.steel, s * 0.3, 0, 0, b); K.box(0.06, 0.16, 0.12, P.brass, s * 0.58, 0, 0, b); return b; });
  const WHL = K.dyn(K.group(PORT, 0, LKY, 0.2));
  T.ringZ(WHL, 0.27, 0.04, P.brassL, 0, 0, 0, 18);
  for (let i = 0; i < 4; i++) { const sp = K.box(0.54, 0.04, 0.04, P.brass, 0, 0, 0, WHL); sp.rotation.z = i * Math.PI / 4; K.sph(0.045, P.brassL, Math.cos(i * Math.PI / 2) * 0.29, Math.sin(i * Math.PI / 2) * 0.29, 0.02, WHL, 6, 4); }
  T.discZ(WHL, 0.07, 0.08, P.brassD, 0, 0, 0, 8);
  const lockM = K.mat(0x3a0c08, { e: 0 });
  K.box(0.12, 0.12, 0.06, lockM, 0, LKY + 0.48, 0.1, PORT);
  // chains (inner: pulley -> portcullis; outer: pulley -> counterweight) and the counterweights
  // (all four chains are one mesh, rewritten as they pay out)
  const chainB = boxBank(K, S, 4, { lit: true });
  const chainX = [DCX - (PX - 0.2), DCX + (PX - 0.2), DCX - (PX + 0.2), DCX + (PX + 0.2)];
  const chain = (i, y0, y1) => chainB.box(i, chainX[i], (y0 + y1) / 2, GZ + 0.2, 0.04, Math.max(0.02, y1 - y0), 0.04);
  for (let i = 0; i < 4; i++) { chainB.color(i, 0x1a120c); chain(i, 0.8, GTOP); }
  chainB.bound();
  const weights = [-1, 1].map((s) => { const w = K.dyn(K.group(S, DCX + s * (PX + 0.2), 3.3, GZ + 0.2)); K.box(0.2, 0.42, 0.2, P.ironM, 0, 0, 0, w); K.box(0.22, 0.05, 0.22, P.brass, 0, 0.12, 0, w); K.box(0.22, 0.05, 0.22, P.brass, 0, -0.12, 0, w); return w; });

  // ---------- THE BELL (on a little belfry on the frame) and the amber beacon ----------
  for (const s of [-1, 1]) K.box(0.06, 0.62, 0.06, P.ironL, DCX + s * 0.3, GTOP + 0.48, GZ, S);
  K.box(0.7, 0.07, 0.1, P.ironM, DCX, GTOP + 0.8, GZ, S);
  const BELL = K.dyn(K.group(S, DCX, GTOP + 0.76, GZ));
  K.lathe([[0.25, -0.46], [0.21, -0.4], [0.17, -0.28], [0.14, -0.12], [0.09, -0.03], [0.001, 0]], P.brass2, 16, 0, 0, 0, BELL);
  { const r = K.torus(0.24, 0.02, P.brassL, 4, 16, 0, -0.45, 0, BELL); r.rotation.x = Math.PI / 2; }
  K.sph(0.05, P.ironM, 0, -0.42, 0, BELL, 6, 4);
  K.cyl(0.11, 0.13, 0.08, P.brassD, 8, DCX + PX, GTOP + 0.23, GZ, S);
  const beaconSpin = K.dyn(K.group(S, DCX + PX, GTOP + 0.36, GZ));
  const beaconM = K.mat(0x3a2a08, { e: 0 }); K.box(0.16, 0.1, 0.05, beaconM, 0.05, 0, 0, beaconSpin);
  const beaconDomeM = K.glow(0xffb020, 0.25); K.sph(0.13, beaconDomeM, DCX + PX, GTOP + 0.36, GZ, S, 8, 6).castShadow = false;
  // the MARQUEE on the frame: "MERGE #142 / INTO MAIN?" ringed by chasing bulbs (one mesh for all the bulbs)
  const MQW = 1.9, MQH = 0.66, MQY = GTOP - 0.47, MQZ = GZ + 0.3;
  K.box(MQW + 0.12, MQH + 0.12, 0.06, P.brassD, DCX, MQY, MQZ - 0.03, S);
  K.box(MQW, MQH, 0.05, P.soot, DCX, MQY, MQZ, S);
  for (const s2 of [-1, 1]) K.box(0.06, 0.32, 0.06, P.ironM, DCX + s2 * 0.75, MQY + MQH / 2 + 0.1, MQZ - 0.08, S);
  const MW = 46, MH = 13;
  let mctx = null, mKey = '';
  const mTex = K.canvasTex(MW, MH, (c) => { mctx = c; });
  const mqM = new THREE.MeshBasicMaterial({ map: mTex, fog: false });
  K.box(MQW - 0.26, (MQW - 0.26) * MH / MW, 0.01, mqM, DCX, MQY, MQZ + 0.03, S);
  const marquee = (l1, l2, fg, bg) => {
    const key = l1 + l2 + fg + bg; if (key === mKey) return; mKey = key;
    mctx.fillStyle = bg; mctx.fillRect(0, 0, MW, MH);
    drawText(mctx, l1, Math.round((MW - (l1.length * 4 - 1)) / 2), 1, fg, 1);
    drawText(mctx, l2, Math.round((MW - (l2.length * 4 - 1)) / 2), 7, fg, 1);
    mTex.needsUpdate = true;
  };
  marquee('MERGE', 'INTO MAIN', '#8a6a3a', '#1a1006');
  const NBX = 10, NBY = 4, NB = 2 * NBX + 2 * NBY;
  const bulbs = boxBank(K, S, NB);
  { let i = 0; const x0 = DCX - MQW / 2 + 0.06, x1 = DCX + MQW / 2 - 0.06, y0 = MQY - MQH / 2 + 0.06, y1 = MQY + MQH / 2 - 0.06, z = MQZ + 0.04;
    for (let k = 0; k < NBX; k++) bulbs.box(i++, K.lerp(x0, x1, k / (NBX - 1)), y1, z, 0.075, 0.075, 0.05);
    for (let k = 1; k <= NBY; k++) bulbs.box(i++, x1, K.lerp(y1, y0, k / (NBY + 1)), z, 0.075, 0.075, 0.05);
    for (let k = 0; k < NBX; k++) bulbs.box(i++, K.lerp(x1, x0, k / (NBX - 1)), y0, z, 0.075, 0.075, 0.05);
    for (let k = 1; k <= NBY; k++) bulbs.box(i++, x0, K.lerp(y0, y1, k / (NBY + 1)), z, 0.075, 0.075, 0.05);
    bulbs.bound(); }

  // ---------- THE LEVER (left of the gate, behind the lane): throws right to merge ----------
  const LV = T.face(S, -0.95, 0.41, 2.3);
  K.box(0.72, 0.26, 0.44, P.ironM, 0, 0.13, 0, LV); K.box(0.78, 0.05, 0.48, P.brassD, 0, 0.285, 0, LV);
  T.row(LV, -0.3, 0.13, 0.225, 0.3, 0.13, 0.225, 4, P.brassL, 0.035);
  { const q = K.torus(0.86, 0.04, P.brass, 4, 16, 0, 0.3, 0.1, LV, Math.PI * 0.5); q.rotation.z = Math.PI * 0.25; }
  const noM = K.mat(0x4a0e08, { e: 0, shine: 40, spec: 0x806040 }), yesM = K.mat(0x0c3a18, { e: 0, shine: 40, spec: 0x806040 });
  for (const [x, m] of [[-0.66, noM], [0.66, yesM]]) { K.box(0.22, 0.22, 0.06, P.brassD, x, 0.98, 0.08, LV); K.box(0.17, 0.17, 0.07, m, x, 0.98, 0.11, LV); }
  K.box(0.18, 0.09, 0.02, kit.text('NO', { bg: '#6a1a10', fg: '#ffd2b0', pad: 1 }), -0.66, 0.8, 0.11, LV);
  K.box(0.24, 0.09, 0.02, kit.text('YES', { bg: '#0c3a18', fg: '#b0ffc8', pad: 1 }), 0.66, 0.8, 0.11, LV);
  K.box(0.6, 0.13, 0.02, kit.text('MERGE', { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e' }), 0, 0.14, 0.23, LV);
  const LEV = K.dyn(K.group(LV, 0, 0.32, 0.08));
  K.box(0.085, 1.25, 0.085, P.ironL, 0, 0.625, 0, LEV); K.box(0.15, 0.12, 0.15, P.brassD, 0, 0.06, 0, LEV);
  K.box(0.11, 0.05, 0.11, P.brass, 0, 1.0, 0, LEV);
  const knobM = K.mat(0x9a1a0e, { e: 0, shine: 60, spec: 0x806050 });
  K.sph(0.15, knobM, 0, 1.32, 0, LEV, 10, 8);
  const haloM = K.glow(0xffb020, 0, true);
  K.sph(0.3, haloM, 0, 1.32, 0, LEV, 10, 8).castShadow = false;

  // ---------- THE LANTERN (the gate's one point light), hung over the turntable from the left guide post ----------
  const LX = W0.x, LY = 2.95, LZ = W0.z;
  beam(K, S, [DCX - PX, LY + 0.47, GZ], [LX, LY + 0.47, LZ + 0.02], 0.07, 0.08, P.ironM);
  beam(K, S, [DCX - PX, LY - 0.1, GZ + 0.05], [K.lerp(DCX - PX, LX, 0.55), LY + 0.44, K.lerp(GZ, LZ, 0.55)], 0.04, 0.04, P.ironL);
  K.box(0.04, 0.1, 0.04, P.ironM, LX, LY + 0.39, LZ, S);
  K.cyl(0.1, 0.13, 0.08, P.brassD, 8, LX, LY + 0.24, LZ, S); K.cone(0.13, 0.14, P.brassD, 8, LX, LY + 0.33, LZ, S);
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; K.box(0.025, 0.36, 0.025, P.brass, LX + Math.cos(a) * 0.1, LY + 0.04, LZ + Math.sin(a) * 0.1, S); }
  K.cyl(0.09, 0.09, 0.3, P.glass, 8, LX, LY + 0.04, LZ, S).castShadow = false;
  const lanM = K.glow(0x6a4010);
  K.sph(0.06, lanM, LX, LY + 0.02, LZ, S, 8, 6);
  K.cyl(0.11, 0.11, 0.05, P.brassD, 8, LX, LY - 0.15, LZ, S);
  const lt = K.light(0xffb040, 0, 5.5, LX, LY - 0.2, LZ, S);
  const spotM = K.glow(0xffc060, 0, true);
  K.cone(0.6, LY - 0.18 - 1.06, spotM, 16, LX, (LY - 0.18 + 1.06) / 2, LZ, S).castShadow = false;

  // ---------- TURNTABLE at the waiting point + the red siding to the sent-back belt ----------
  const TTB = K.dyn(K.group(LG, WU, 0.99, 0));
  K.cyl(0.45, 0.45, 0.06, P.iron, 22, 0, -0.03, 0, TTB);
  { const r = K.torus(0.45, 0.03, P.brass, 4, 24, 0, 0.0, 0, TTB); r.rotation.x = Math.PI / 2; }
  for (const u of [-0.24, -0.08, 0.08, 0.24]) { const c2 = K.cyl(0.05, 0.05, 0.5, lane.rollM, 8, u, 0.0, 0, TTB); c2.rotation.x = Math.PI / 2; }
  K.box(0.06, 0.02, 0.6, P.hazard, -0.4, 0.01, 0, TTB); K.box(0.06, 0.02, 0.6, P.hazard, 0.4, 0.01, 0, TTB);
  K.cyl(0.5, 0.52, 0.12, P.ironM, 22, WU, 0.88, 0, LG);
  const REJ = new THREE.Vector3(2.05, 1.0, 2.05);
  const sdL = REJ.x + 0.2 - (W0.x + 0.48), sdC = (REJ.x + 0.2 + W0.x + 0.48) / 2;
  const SR = K.group(S, sdC, 0, W0.z);
  const srT = kit.rollTex.clone(); srT.needsUpdate = true;
  const srRollM = K.mat(0xe08070, { map: srT, shine: 30, spec: 0x504a40 }); srRollM.userData.noCast = true;
  K.box(sdL, 0.2, 0.62, P.redD, 0, 0.775, 0, SR);
  K.box(sdL, 0.08, 0.5, P.soot, 0, 0.64, 0, SR);
  for (const s of [-1, 1]) { K.box(sdL, 0.05, 0.06, P.red, 0, 0.88, s * 0.3, SR); K.box(sdL - 0.1, 0.05, 0.04, P.red, 0, 1.13, s * 0.33, SR); for (let x = -sdL / 2 + 0.1; x < sdL / 2; x += 0.42) K.box(0.04, 0.16, 0.04, P.redD, x, 1.05, s * 0.33, SR); }
  for (let x = -sdL / 2 + 0.08; x < sdL / 2 - 0.05; x += 0.19) { const r = K.cyl(0.055, 0.055, 0.55, srRollM, 8, x, 0.945, 0, SR); r.rotation.x = Math.PI / 2; }
  for (const x of [-sdL / 2 + 0.15, sdL / 2 - 0.15]) for (const s of [-1, 1]) K.box(0.09, 0.45, 0.09, P.iron, x, 0.45, s * 0.24, SR);
  T.hazard(SR, 0.6, sdL / 2 - 0.02, 1.0, 0, 4, Math.PI / 2, 0.16, 0.04);
  const sideM = T.lamp(SR, sdL / 2 - 0.25, 1.4, -0.42, 0.07, 0x3a0c08);
  K.box(0.06, 0.45, 0.06, P.ironM, sdL / 2 - 0.25, 1.15, -0.42, SR);
  K.box(0.7, 0.11, 0.02, kit.text('SENT BACK', { bg: '#6a1a10', fg: '#ffd2b0', rim: '#e4b85e' }), 0, 0.78, 0.315, SR);

  // ---------- behind the wall: a winch house (seen over the wall) ----------
  const WHs = T.face(S, -0.4, 0.41, -1.2);
  K.box(1.3, 2.6, 0.9, P.iron, 0, 1.3, 0, WHs); K.box(1.4, 0.1, 1.0, P.brassD, 0, 2.65, 0, WHs);
  K.cyl(0.12, 0.12, 0.9, P.ironM, 8, 0.4, 3.0, 0, WHs); K.cyl(0.15, 0.15, 0.08, P.brass, 8, 0.4, 3.45, 0, WHs);
  const winch = K.dyn(K.group(WHs, -0.3, 2.95, 0.2));
  T.discZ(winch, 0.32, 0.08, P.ironM, 0, 0, 0, 14); T.ringZ(winch, 0.32, 0.04, P.brass, 0, 0, 0.05, 16);
  for (let i = 0; i < 3; i++) { const sp = K.box(0.6, 0.05, 0.03, P.brassD, 0, 0, 0.06, winch); sp.rotation.z = i * Math.PI / 3; }

  // ---------- caution + status lamp, signal semaphore at the exit, verdict glyph ----------
  const caution = K.caution(S, -1.9, 0.41, 2.2, 1.0);
  const lamp = K.statusLamp(S, 2.2, 0.41, -1.9, 1.25);
  const semP = K.group(S, 2.0, 0.41, -0.62);
  K.cyl(0.04, 0.05, 1.8, P.iron, 6, 0, 0.9, 0, semP); K.cyl(0.08, 0.09, 0.05, P.brassD, 8, 0, 1.82, 0, semP);
  const semArm = K.dyn(K.group(g, 2.05, 2.05, -0.62)); semArm.rotation.y = Math.PI / 4;
  K.box(0.5, 0.1, 0.04, P.cream, 0.24, 0, 0, semArm); K.box(0.14, 0.1, 0.045, kit.pal(0x2a9a4a, 0.3), 0.42, 0, 0, semArm);
  const semLamp = T.lamp(g, 2.0, 2.32, -0.62, 0.07, 0x0c2a14);
  const vglyph = T.glyph(W0.x - 0.5, 4.1, W0.z + 0.2, 1.0);

  // ---------- the cycle ----------
  const A = K.dyn(K.group(g));
  const q0 = new THREE.Quaternion(), tmp = new THREE.Vector3();
  let ph = 'idle', pt = 0, it = null, v = null, asked = false, first = true;
  let u = lane.uIn, lastU = u, sx = 0, lastSx = 0, yaw = 0, slerpK = 1, onSiding = false;
  let gateK = 0, boltK = 0, wheelA = 0, leverK = 0, turnK = 0, lightK = 0, slam = 0, ring = 0, tRing = 0, tSteam = 0, semUp = 0;
  const setPh = (p) => { ph = p; pt = 0; };
  function step(dt) {
    if (ph === 'idle') {
      if (gateK > 0.01 || turnK > 0.01) return; // the gate must be down and the turntable home first
      if (!M.waiting('in')) return;
      it = M.take('in'); if (!it) return;
      q0.copy(it.mesh.quaternion); slerpK = 0; it.follow(A); v = null; asked = false; u = lastU = lane.uIn; onSiding = false; sx = lastSx = 0; yaw = 0;
      setPh('feed'); const p = lane.pt(lane.uIn, 0, 1.05); T.pulse(p.x, p.y, p.z, 0xffd080);
      return;
    }
    pt += dt;
    if (ph === 'feed') { const k = K.clamp01(pt / 1.1); u = K.lerp(lane.uIn, WU, K.smooth(k)); slerpK = K.clamp01(pt / 0.5); if (k >= 1) { slerpK = 1; setPh('wait'); } }
    else if (ph === 'wait') {
      if (pt < 0.45) return;
      if (!asked) { asked = true; if (M.maybeDecision('Merge ' + it.label() + ' into main?')) return; }
      v = M.judge(it);
      if (v) {
        if (v.pass) { it.flash(GREEN); M.pass(it); setPh('unlock'); ring = 1.2; }
        else { it.setKind('reject'); M.reject(it, v.reason || 'not merged'); setPh('turn'); }
      }
    }
    else if (ph === 'unlock') { if (pt >= 1.25) setPh('lift'); }
    else if (ph === 'lift') { if (gateK >= 0.995) setPh('through'); }
    else if (ph === 'through') { const k = K.clamp01(pt / 2.1); u = K.lerp(WU, lane.uPass, K.smooth(k)); yaw = k > 0.78 ? K.lerp(0, lane.yawOut, K.smooth((k - 0.78) / 0.22)) : 0; if (k >= 1) setPh('give'); }
    else if (ph === 'give') { if (M.give(it, 'pass')) { const p = lane.pt(lane.uPass, 0, 1.05); T.pulse(p.x, p.y, p.z, GREEN); semUp = 1.6; it = null; v = null; setPh('idle'); } }
    else if (ph === 'turn') { const k = K.clamp01(pt / 0.75); turnK = K.smooth(k); yaw = lane.yawOut * turnK; if (k >= 1) setPh('siding'); }
    else if (ph === 'siding') { onSiding = true; const k = K.clamp01(pt / 1.1); sx = K.smooth(k); if (k >= 1) setPh('giveR'); }
    else if (ph === 'giveR') { if (M.give(it, 'reject')) { T.pulse(REJ.x, 1.05, REJ.z, RED); it = null; v = null; onSiding = false; setPh('idle'); } }
  }
  function detail() {
    if (!it) return 'nothing to merge';
    const L = it.label();
    if (ph === 'feed') return L + ' · to the gate';
    if (ph === 'wait') return L + ' · waiting to merge';
    if (ph === 'unlock' || ph === 'lift' || ph === 'through') return L + ' · merging into main';
    if (ph === 'give') return L + ' · held: the pad is busy';
    if (ph === 'giveR') return L + ' · held: sent-back belt is full';
    return L + ' · not merged: ' + ((v && v.reason) || 'sent back');
  }

  return { g, update(t, dt) {
    if (first) { first = false; vglyph.gl.visible = false; }
    const blk = M.blocked;
    if (!blk) { step(dt); M.setState(it ? 'WORKING' : 'IDLE', detail()); }
    const S_ = M.stateShown, work = S_ === 'WORKING';
    lamp.set(S_, t); caution.update(t, dt, S_);
    const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
    lightK += ((work ? 1 : 0) - lightK) * Math.min(1, dt * 2.5);
    const merging = ph === 'unlock' || ph === 'lift' || ph === 'through' || ph === 'give';
    const rejecting = ph === 'turn' || ph === 'siding' || ph === 'giveR';
    if (!blk) {
      // lever, wheel, bolts, gate, turntable (the gate drops once the capsule is through)
      leverK += ((merging || gateK > 0.02 ? 1 : 0) - leverK) * Math.min(1, dt * 6);
      const unlocking = ph === 'unlock' && pt > 0.3;
      boltK += ((unlocking || ph === 'lift' || ph === 'through' || ph === 'give' || gateK > 0.02 ? 1 : 0) - boltK) * Math.min(1, dt * 5);
      if (unlocking) wheelA += dt * 7; else if (boltK > 0.05 && boltK < 0.95 && gateK < 0.02) wheelA -= dt * 7;
      const gateGoal = ph === 'lift' || (ph === 'through' && pt < 1.4) ? 1 : 0;
      const prev = gateK;
      if (gateGoal > gateK) gateK = Math.min(1, gateK + dt / 0.95); else if (gateGoal < gateK) gateK = Math.max(0, gateK - dt / 0.35);
      if (prev > 0.05 && gateK === 0) { slam = 0.35; T.dust(DCX, 1.05, GZ + 0.1, 10, 0.6); T.sparks(DCX, 1.05, GZ + 0.15, 8); }
      if (!rejecting && ph !== 'idle') turnK = ph === 'feed' || ph === 'wait' || merging ? 0 : turnK;
      if (ph === 'idle') turnK = Math.max(0, turnK - dt / 0.5);
    }
    slam = Math.max(0, slam - dt);
    // the capsule
    if (onSiding) { A.position.set(K.lerp(W0.x, REJ.x, sx), 1.0, K.lerp(W0.z, REJ.z, sx)); const d = sx - lastSx; lastSx = sx; srT.offset.x -= d * 1.8 * 0.5 / (2 * Math.PI * 0.055) * 0.5; }
    else { lane.pt(u, 0, 1.0, A.position); const du = u - lastU; lastU = u; if (it && Math.abs(du) > 1e-5 && Math.abs(du) < 0.5) lane.roll(du); }
    if (it) T.aim(it, yaw, 0, 0, slerpK < 1 ? q0 : null, slerpK);
    lane.boom(!!M.waiting('in') && ph === 'idle', dt);
    TTB.rotation.y = lane.yawOut * turnK;
    // gate parts
    const gk = K.smooth(gateK);
    PORT.position.y = PB + gk * LIFT + (slam > 0 ? Math.sin(slam * 60) * 0.015 : 0);
    bolts.forEach((b, i) => { b.position.x = (i ? 1 : -1) * (0.36 - boltK * 0.3); });
    WHL.rotation.z = wheelA + (blk ? Math.sin(t * 30) * 0.03 : 0);
    pulleys.forEach((p, i) => { p.rotation.z = (i ? 1 : -1) * gk * LIFT / 0.2; });
    const topY = PB + gk * LIFT + PH, pulY = GTOP - 0.02;
    chain(0, topY, pulY); chain(1, topY, pulY);
    const wY = 3.55 - gk * LIFT * 0.9;
    weights.forEach((w) => { w.position.y = wY; });
    chain(2, wY + 0.21, pulY); chain(3, wY + 0.21, pulY);
    LEV.rotation.z = K.lerp(0.55, -0.55, K.smooth(leverK)) + (blk ? Math.sin(t * 9) * 0.04 : 0);
    winch.rotation.z = -gk * 4;
    // waiting for the player: the bell rings, the knob and the sign pulse, the lantern swells, the beacon turns
    const waiting = ph === 'wait' && !!it;
    if (blk) { tRing -= dt; if (tRing <= 0) { tRing = 0.5; T.pulse(DCX, GTOP + 0.3, GZ, AMBER); } }
    ring = Math.max(0, ring - dt);
    BELL.rotation.x = blk ? Math.sin(t * 9) * 0.55 : ring > 0 ? Math.sin(t * 12) * 0.4 * ring : 0;
    knobM.emissive.setHex(blk ? (Math.sin(t * 6) > 0 ? 0xffa020 : 0x4a2004) : waiting ? (Math.sin(t * 3) > 0 ? 0x6a3a08 : 0x2a1404) : merging ? 0x1a6a32 : 0);
    beaconSpin.rotation.y += dt * (blk ? 8 : 0);
    beaconM.emissive.setHex(blk ? (strobe > 0.5 ? 0xffa010 : 0x401800) : 0);
    beaconDomeM.opacity = blk ? 0.6 : 0.2;
    lockM.emissive.setHex(blk ? (strobe > 0.5 ? 0xffa020 : 0x3a1a04) : merging ? GREEN : rejecting ? 0xff2a10 : waiting ? 0x6a3a08 : 0);
    let li = 0.25, lc = 0xffb040, lm = 0x6a4010;
    if (blk) { li = 1.6 + 0.9 * Math.sin(t * 6); lm = Math.sin(t * 6) > 0 ? 0xffd070 : 0xa06010; }
    else if (merging) { lc = 0x6aff9a; li = 1.6; lm = 0x9affc0; }
    else if (rejecting) { lc = 0xff4a2a; li = blink(t, 10) ? 1.8 : 0.7; lm = 0xff6a4a; }
    else if (waiting) { li = 1.1 + Math.sin(t * 2.2) * 0.25; lm = 0xffc060; }
    else if (it) { li = 0.7; lm = 0xc08030; }
    lt.color.setHex(lc); lt.intensity = li * (0.92 + Math.random() * 0.08); lanM.color.setHex(lm);
    const L = it ? it.label() : '';
    if (blk) marquee(it ? 'MERGE ' + L : 'MERGE', it ? 'INTO MAIN?' : 'ON HOLD', blink(t, 3) ? '#ffc040' : '#a06818', '#1a0e02');
    else if (merging) marquee('MERGING', it ? L : 'INTO MAIN', '#7affb0', '#06200e');
    else if (rejecting) marquee('SENT BACK', L, '#ff6a4a', '#2a0806');
    else if (waiting) marquee('MERGE ' + L, 'INTO MAIN?', '#ffd27a', '#1a1006');
    else marquee('MERGE', 'INTO MAIN', lightK > 0.5 ? '#c09040' : '#6a4a20', '#120a04');
    // the bulbs: chase while it waits for you, flash green on a merge, red on a send-back, glow warm when busy
    for (let i = 0; i < NB; i++) {
      let c = 0x2a1808;
      if (blk) c = (i + Math.floor(t * 9)) % 4 < 2 ? 0xffc040 : 0x5a3008;
      else if (merging) c = blink(t, 14) ? GREEN : 0x1a5a2a;
      else if (rejecting) c = blink(t, 14) ? 0xff4020 : 0x5a1008;
      else if (waiting) c = (i + Math.floor(t * 5)) % 4 === 0 ? 0xffd070 : 0x6a4010;
      else if (lightK > 0.5) c = 0x8a5a18;
      bulbs.color(i, c);
    }
    // the YES / NO lamps take turns while it waits for you; the knob's halo breathes; the spotlight on the capsule
    const ask = blk || waiting, alt = Math.sin(t * 5) > 0;
    yesM.emissive.setHex(merging ? GREEN : ask && alt ? 0x2aff6a : 0);
    noM.emissive.setHex(rejecting ? 0xff3020 : ask && !alt ? 0xff3a20 : 0);
    haloM.color.setHex(merging ? GREEN : 0xffb020);
    haloM.opacity = blk ? 0.22 + 0.16 * Math.sin(t * 6) : waiting ? 0.12 + 0.08 * Math.sin(t * 3) : merging ? 0.2 * (1 - leverK * 0.5) : 0;
    spotM.color.setHex(merging ? 0x8affb0 : rejecting ? 0xff6a4a : 0xffc060);
    spotM.opacity = blk ? (it ? 0.11 + 0.05 * Math.sin(t * 3) : 0.05) : waiting ? 0.09 : (merging || rejecting) && it ? 0.06 : 0;
    sideM.emissive.setHex(rejecting ? (blink(t, 20) ? 0xff3020 : 0x5a0a04) : 0);
    semUp = Math.max(0, semUp - dt);
    semArm.rotation.z += ((semUp > 0 || ph === 'through' ? 0.9 : -0.05) - semArm.rotation.z) * Math.min(1, dt * 6);
    semLamp.emissive.setHex(semUp > 0 || ph === 'through' ? GREEN : 0);
    lane.passM.emissive.setHex(ph === 'through' || ph === 'give' ? (blink(t, 25) ? GREEN : 0x1a6a32) : 0);
    tSteam -= dt;
    if (blk && tSteam <= 0) { tSteam = 0.07; T.steam(DCX - PX, GTOP + 0.2, GZ, 1); if (Math.random() < 0.5) T.steam(DCX + PX, GTOP + 0.2, GZ, 1); }
    vglyph.set(blk ? 'block' : (merging && ph !== 'give') ? 'pass' : rejecting && ph === 'turn' ? 'fail' : null, t, dt);
    T.stepPulses(dt);
  } };
}

// =====================================================================
// CHECKS: one compact instrument per researched tech on a short roller lane (in at the right, out at the left,
// rejects kicked forward into the red trough). Each instrument is built in DV, a frame at the station centre
// squared to the camera (x right, y up, z toward the viewer); the capsule waits at (0, 1.0, CAPZ) (its body
// centre at CAPY). Every instrument puts its big readable face (vault door, dial, sieve, photo...) up high behind
// the lane (y 1.3..2.5) and keeps what reaches over the capsule low, so the camera sees both. The left flank
// (x < -0.48, y 1.2..1.8) stays clear for the caution sign that flips up when BLOCKED; the bodies stay within
// x +-0.8 (neighbouring checks stand 2.3 apart).
// =====================================================================
const CAPZ = 1.273, CAPY = 1.2;
// a box from a to b (its long axis = local z)
function beam(K, p, a, b, w, h, m) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const o = K.box(w, h, L, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, p);
  o.rotation.order = 'YXZ'; o.rotation.y = Math.atan2(dx, dz); o.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
  return o;
}
// a round rod from a to b
function rod(K, p, a, b, r, m, seg) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const o = K.cyl(r, r, L, m, seg || 6, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, p);
  o.rotation.order = 'YXZ'; o.rotation.y = Math.atan2(dx, dz); o.rotation.x = Math.atan2(Math.hypot(dx, dz), dy);
  return o;
}
// the instrument's own signal lamp: teal while checking, green / red on the verdict, amber strobe when blocked
function sigLamp(st, m) {
  const c = st.c; let e = 0;
  if (st.blk) e = st.strobe > 0.5 ? 0xffa020 : 0x3a1a04;
  else if (c.it && c.v && c.ph !== 'work') e = c.v.pass ? GREEN : blink(st.t, 14) ? 0xff3020 : 0x5a0a04;
  else if (st.working) e = blink(st.t, 8) ? 0x7af0d8 : 0x1a4a40;
  else if (st.lightK > 0.5) e = 0x4a3410;
  m.emissive.setHex(e);
}
// the colour of an instrument's glowing eye/ring for the moment
function eyeCol(st) {
  const t = st.t;
  if (st.blk) return st.strobe > 0.5 ? 0xffa020 : 0x3a1a04;
  if (st.after) return st.pass ? GREEN : blink(t, 16) ? 0xff3020 : 0x5a0a04;
  if (st.working) return blink(t, 20) ? 0x9afff0 : 0x2a8a7a;
  return st.lightK > 0.5 ? 0x5a4214 : 0x2a1e0e;
}

const CHECK_DEVS = {
  leftovers: { workT: 1.9, doing: 'sweeping for leftovers', passVerb: 'clean', decide: (L) => 'A console.log in ' + L + ': keep it?', build: devLeftovers },
  secrets: { workT: 1.9, verdictT: 1.05, doing: 'sniffing for secrets', passVerb: 'no secrets', decide: (L) => 'Possible key in ' + L + ': is it a test value?', build: devSecrets },
  types: { workT: 1.75, skip: [[-0.23, 0.23]], doing: 'stamping the types', passVerb: 'types hold', decide: (L) => L + ' adds an @ts-ignore: allow it?', build: devTypes },
  scope: { workT: 2.0, doing: 'measuring the scope', passVerb: 'in scope', decide: (L) => L + ' is big: review it anyway?', build: devScope },
  deps: { workT: 2.0, doing: 'weighing manifest against lockfile', passVerb: 'deps match', decide: (L) => L + ' changes package.json only: OK?', build: devDeps },
  perf: { workT: 2.0, skip: [[-0.36, 0.36]], doing: 'timing it on the dyno', passVerb: 'fast enough', decide: (L) => L + ' runs slower: accept?', build: devPerf },
  visual: { workT: 1.9, doing: 'photographing the UI', passVerb: 'looks right', decide: (L) => L + ' moved a button: expected?', build: devVisual },
  canary: { workT: 2.1, doing: 'canary rollout', passVerb: 'canary healthy', decide: (L) => 'Canary errors up on ' + L + ': roll out anyway?', build: devCanary },
  generic: { workT: 1.8, doing: 'checking', passVerb: 'passed', decide: (L) => 'Check unsure about ' + L + ': pass it?', build: devGeneric },
};

function buildCheck(K, M, kit) {
  const { THREE, P } = kit;
  const g = K.group(), S = K.group(g);
  const T = tools(K, g, kit);
  const kind = String((M.def && M.def.check) || 'generic');
  const spec = CHECK_DEVS[kind] || CHECK_DEVS.generic;
  smallPlinth(K, S, T, kit);
  const lane = makeLane(K, g, S, T, kit, { IN: [1.5, 0.3], PASS: [0.3, 1.5], REJ: [1.05, 1.05], kicker: true, skip: spec.skip || [] });
  const DV = T.face(S, 0, 0, 0);
  const X = {
    K, M, kit, THREE, P, T, g, S, DV, lane,
    // DV point -> the machine group's frame (particles, pulses)
    gl: (x, y, z, out) => (out || new THREE.Vector3()).set(C45 * (x + z), y, C45 * (z - x)),
    // DV velocity -> the machine group's frame
    gv: (vx, vz) => [C45 * (vx + vz), C45 * (vz - vx)],
    plate: (str, x, y, z, s, p) => { s = s || 1; const w = (str.length * 4 + 3) / 9 * 0.2 * s; K.box(w + 0.1, 0.2 * s + 0.04, 0.02, P.brassD, x, y, z - 0.012, p || DV); K.box(w, 0.2 * s, 0.03, kit.text(str, { bg: '#7a5822', fg: '#1e1408', rim: '#e4b85e' }), x, y, z, p || DV); for (const sx of [-1, 1]) K.box(0.03, 0.03, 0.03, P.brassL, x + sx * (w / 2 + 0.026), y, z, p || DV); return w + 0.1; },
    // a cast-iron pillar: foot, shaft, brass bands, rivet rows up its face
    pillar: (x, z, y1, w, d, bands, rivets) => {
      d = d || w;
      K.box(w + 0.16, 0.08, d + 0.16, P.ironM, x, 0.33, z, DV);
      K.box(w + 0.08, 0.04, d + 0.08, P.brassD, x, 0.39, z, DV);
      K.box(w, y1 - 0.41, d, P.iron, x, (y1 + 0.41) / 2, z, DV);
      for (const y of bands || []) K.box(w + 0.04, 0.05, d + 0.04, P.brass, x, y, z, DV);
      if (rivets) for (const s of [-1, 1]) T.row(DV, x + s * (w / 2 - 0.025), 0.56, z + d / 2 + 0.008, x + s * (w / 2 - 0.025), y1 - 0.1, z + d / 2 + 0.008, rivets, P.brassL, 0.028);
    },
    rod: (p, a, b, r, m, seg) => rod(K, p, a, b, r, m, seg),
    beam: (p, a, b, w, h, m) => beam(K, p, a, b, w, h, m),
  };
  const dev = spec.build(X);
  const caution = K.caution(S, -0.55, 0.29, 0.5, 0.62);
  const lamp = K.statusLamp(S, 0.52, 0.29, -0.55, 0.85);
  const gp = lane.pt(0, -0.2, 3.9);
  const vglyph = T.glyph(gp.x, gp.y, gp.z, 0.62);
  const c = makeCycle(K, M, kit, lane, T, g, {
    workU: 0, feedT: 0.6, verdictT: spec.verdictT || 0.95, outT: 0.55, dumpT: 0.5, feedVerb: spec.feedVerb || 'rolling in', passVerb: spec.passVerb,
    work: (cc) => cc.pt >= spec.workT + cc.runs * 0.6,
    decide: (it) => spec.decide(it.label()),
    onTake: (it) => { if (dev.onTake) dev.onTake(it); },
    onVerdict: (v) => { if (dev.onVerdict) dev.onVerdict(v); },
  });
  X.c = c;
  let lightK = 0;
  const st = { c, t: 0, dt: 0, blk: false, work: false, lightK: 0, strobe: 0, working: false, verdict: false, pass: false, wk: 0, after: false };
  return { g, update(t, dt) {
    const blk = M.blocked;
    if (!blk) { c.step(dt, t); M.setState(c.it ? 'WORKING' : 'IDLE', c.detail(c.runs ? spec.doing + ' (the check is still running)' : spec.doing)); }
    const S_ = M.stateShown, work = S_ === 'WORKING';
    lightK += ((work ? 1 : 0) - lightK) * Math.min(1, dt * 2.5);
    st.t = t; st.dt = dt; st.blk = blk; st.work = work; st.lightK = lightK; st.strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
    st.working = c.ph === 'work' && !blk; st.verdict = c.ph === 'verdict' && !!c.v; st.pass = !!(c.v && c.v.pass);
    st.after = !!(c.it && c.v && c.ph !== 'work'); // verdict shown (verdict, out, dump, give, giveR)
    st.wk = c.ph === 'work' ? Math.min(1, c.pt / spec.workT) : c.v ? 1 : 0;
    dev.update(st);
    c.place(dt);
    lamp.set(S_, t); caution.update(t, dt, S_);
    lane.passM.emissive.setHex(c.ph === 'out' || c.ph === 'give' ? (blink(t, 25) ? GREEN : 0x1a6a32) : 0);
    lane.rejM.emissive.setHex(c.ph === 'dump' || c.ph === 'giveR' ? (blink(t, 25) ? 0xff3020 : 0x5a0a04) : blk ? (st.strobe > 0.5 ? 0xffa020 : 0) : 0);
    vglyph.set(blk ? 'block' : c.verdictShown(), t, dt);
    T.stepPulses(dt);
  } };
}

// ---------------------------------------------------------------------
// SECRETS: a strongroom with a round vault door behind the lane; a key sniffer (a brass nose on leather bellows)
// runs along a gantry over the capsule. Clean = the door wheel gives a quarter turn, green. A leaked key = it rises
// out of the capsule glowing red, is sucked up the nose and locked away (the wheel spins, the dial whirls).
// Blocked = the door rattles in its frame, the nose coughs amber, the alarm lamp strobes.
// ---------------------------------------------------------------------
function devSecrets(X) {
  const { K, P, T, DV, g, kit, THREE } = X;
  const VW = 1.0, VD = 0.44, VZ = -0.4, VT = 2.3, FZ = VZ + VD / 2;
  // the strongroom: plinth, iron body, inset panel, banded corner posts, cornice
  K.box(VW + 0.14, 0.12, VD + 0.14, P.ironM, 0, 0.35, VZ, DV);
  K.box(VW + 0.06, 0.05, VD + 0.06, P.brassD, 0, 0.435, VZ, DV);
  K.box(VW, VT - 0.46, VD, P.iron, 0, (VT + 0.46) / 2, VZ, DV);
  K.box(VW - 0.24, VT - 0.72, 0.02, P.ironM, 0, (VT + 0.46) / 2 + 0.02, FZ + 0.01, DV);
  for (const s of [-1, 1]) {
    const px = s * (VW / 2 - 0.03);
    K.box(0.11, VT - 0.46, 0.11, P.ironL, px, (VT + 0.46) / 2, FZ - 0.02, DV);
    for (const y of [0.62, 1.42, 2.18]) K.box(0.14, 0.05, 0.14, P.brass, px, y, FZ - 0.02, DV);
    T.row(DV, px, 0.78, FZ + 0.04, px, 2.04, FZ + 0.04, 6, P.brassL, 0.03);
  }
  K.box(VW + 0.1, 0.06, VD + 0.1, P.brassD, 0, VT + 0.03, VZ, DV);
  K.box(VW + 0.18, 0.09, VD + 0.16, P.ironM, 0, VT + 0.105, VZ, DV);
  K.box(VW + 0.06, 0.035, VD + 0.06, P.ironL, 0, VT + 0.167, VZ, DV);
  K.box(VW + 0.08, 0.04, 0.035, P.brass, 0, VT + 0.17, VZ + (VD + 0.06) / 2, DV);
  T.row(DV, -0.48, VT + 0.105, VZ + (VD + 0.16) / 2 + 0.005, 0.48, VT + 0.105, VZ + (VD + 0.16) / 2 + 0.005, 9, P.brassL, 0.03);
  // the round door: frame ring with rivets, hinges, the door (rattles when blocked), its bolts, eye and wheel
  const DY = 1.5, DR = 0.33;
  T.discZ(DV, DR + 0.08, 0.05, P.ironL, 0, DY, FZ + 0.03, 26);
  T.ringZ(DV, DR + 0.06, 0.028, P.brassD, 0, DY, FZ + 0.06, 26);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.035, 0.035, 0.03, P.brassL, Math.sin(a) * (DR + 0.06), DY + Math.cos(a) * (DR + 0.06), FZ + 0.085, DV); }
  for (const y of [DY - 0.19, DY + 0.19]) { K.box(0.1, 0.11, 0.06, P.brassD, -DR - 0.05, y, FZ + 0.08, DV); K.cyl(0.026, 0.026, 0.17, P.brassL, 6, -DR - 0.09, y, FZ + 0.11, DV); }
  const DOOR = K.dyn(K.group(DV, 0, DY, FZ + 0.07));
  T.discZ(DOOR, DR, 0.08, P.ironM, 0, 0, 0, 26);
  T.ringZ(DOOR, DR - 0.025, 0.02, P.brass, 0, 0, 0.045, 26);
  T.ringZ(DOOR, DR * 0.6, 0.014, P.brassD, 0, 0, 0.045, 20);
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; const b = K.cyl(0.03, 0.03, 0.03, P.steel, 8, Math.sin(a) * (DR - 0.075), Math.cos(a) * (DR - 0.075), 0.05, DOOR); b.rotation.x = Math.PI / 2; }
  K.box(0.09, 0.05, 0.04, P.brassD, DR - 0.05, 0, 0.05, DOOR);
  const eyeM = K.glow(0x2a1e0e);
  T.discZ(DOOR, 0.04, 0.02, eyeM, 0, 0.255, 0.05, 10);
  const WHL = K.dyn(K.group(DOOR, 0, 0, 0.12));
  T.discZ(WHL, 0.055, 0.06, P.brass, 0, 0, 0, 10);
  T.ringZ(WHL, 0.19, 0.016, P.brass, 0, 0, 0, 20);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = K.box(0.026, 0.2, 0.026, P.brassL, Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0, WHL); sp.rotation.z = -a; K.sph(0.03, P.brassL, Math.sin(a) * 0.215, Math.cos(a) * 0.215, 0, WHL, 6, 4); }
  // the name, the combination dial beside it, the deposit drawer below the door
  X.plate('SECRETS', -0.08, 2.03, FZ + 0.035, 0.7);
  const dX = 0.32, dY = 2.03;
  T.discZ(DV, 0.085, 0.03, P.brassD, dX, dY, FZ + 0.03, 14);
  K.box(0.014, 0.03, 0.02, P.red, dX, dY + 0.1, FZ + 0.04, DV);
  const DIAL = K.dyn(K.group(DV, dX, dY, FZ + 0.055));
  T.discZ(DIAL, 0.07, 0.02, P.ink, 0, 0, 0, 12);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const tk = K.box(0.01, 0.022, 0.01, P.brassL, Math.sin(a) * 0.052, Math.cos(a) * 0.052, 0.012, DIAL); tk.rotation.z = -a; }
  T.discZ(DIAL, 0.025, 0.04, P.brass, 0, 0, 0.015, 8);
  K.box(0.52, 0.2, 0.03, P.ironL, 0, 0.86, FZ + 0.02, DV);
  K.box(0.46, 0.15, 0.02, P.ironM, 0, 0.86, FZ + 0.04, DV);
  K.box(0.16, 0.035, 0.05, P.brass, 0, 0.88, FZ + 0.06, DV);
  // alarm lamp in a cage on the roof, and the vent stack where the sniffed air goes
  K.cyl(0.08, 0.09, 0.05, P.brass, 8, -0.3, VT + 0.21, VZ + 0.05, DV);
  const lampM = T.lamp(DV, -0.3, VT + 0.29, VZ + 0.05, 0.07);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; K.box(0.014, 0.15, 0.014, P.brassD, -0.3 + Math.sin(a) * 0.085, VT + 0.3, VZ + 0.05 + Math.cos(a) * 0.085, DV); }
  K.cyl(0.095, 0.095, 0.02, P.brassD, 8, -0.3, VT + 0.38, VZ + 0.05, DV);
  K.cyl(0.045, 0.05, 0.34, P.copperD, 8, 0.3, VT + 0.33, VZ - 0.05, DV);
  K.cyl(0.075, 0.06, 0.05, P.brass, 8, 0.3, VT + 0.51, VZ - 0.05, DV);
  // the sniffer gantry: two posts behind the lane, arms forward, a rail over the capsule
  const RY = 1.92, RZ = CAPZ - 0.05, GX = 0.44, GZ = 0.6;
  for (const s of [-1, 1]) {
    K.box(0.2, 0.06, 0.2, P.ironM, s * GX, 0.32, GZ, DV);
    K.box(0.08, RY - 0.29, 0.08, P.iron, s * GX, (RY + 0.29) / 2, GZ, DV);
    for (const y of [0.9, 1.5]) K.box(0.11, 0.04, 0.11, P.brass, s * GX, y, GZ, DV);
    beam(K, DV, [s * GX, RY, GZ - 0.04], [s * GX, RY, RZ + 0.06], 0.08, 0.09, P.ironM);
    beam(K, DV, [s * GX, RY - 0.34, GZ + 0.03], [s * GX, RY - 0.03, GZ + 0.36], 0.04, 0.04, P.ironL);
  }
  K.box(GX * 2 + 0.1, 0.08, 0.08, P.ironM, 0, RY, RZ, DV);
  K.box(GX * 2 + 0.06, 0.025, 0.05, P.brass, 0, RY + 0.05, RZ, DV);
  T.hazard(DV, GX * 2 - 0.1, 0, RY - 0.015, RZ + 0.045, 8, 0, 0.045, 0.01);
  K.tube([[GX + 0.02, RY + 0.06, RZ - 0.04], [GX + 0.06, RY + 0.1, GZ], [GX + 0.07, 1.5, GZ - 0.06], [VW / 2 + 0.01, 1.12, FZ - 0.12]], 0.026, P.copper, DV, 12, 5);
  // the carriage: trolley, leather bellows, brass nose with a glowing mouth
  const CAR = K.dyn(K.group(DV, 0.3, RY, RZ));
  K.box(0.18, 0.14, 0.16, P.brassD, 0, -0.03, 0, CAR);
  for (const s of [-1, 1]) { const w = K.cyl(0.035, 0.035, 0.14, P.brass, 8, s * 0.055, 0.075, 0, CAR); w.rotation.x = Math.PI / 2; }
  K.box(0.2, 0.02, 0.18, P.brass, 0, -0.1, 0, CAR);
  const BEL = K.dyn(K.group(CAR, 0, -0.11, 0));
  for (let i = 0; i < 3; i++) { const r = K.torus(0.055, 0.022, P.leather, 4, 10, 0, -0.03 - i * 0.045, 0, BEL); r.rotation.x = Math.PI / 2; }
  const NOSE = K.dyn(K.group(CAR, 0, -0.25, 0));
  K.box(0.08, 0.05, 0.08, P.brassD, 0, 0.02, 0, NOSE);
  K.cyl(0.04, 0.1, 0.16, P.brass, 12, 0, -0.08, 0, NOSE);
  const noseM = K.glow(0x2a1e0e);
  { const r = K.torus(0.095, 0.018, noseM, 4, 14, 0, -0.16, 0, NOSE); r.rotation.x = Math.PI / 2; }
  const mouth = T.marker(NOSE, 0, -0.17, 0);
  // the leaked key (shown on a find)
  const KEY = K.dyn(K.group(g));
  const keyM = K.glow(0xff5a3a);
  K.torus(0.06, 0.02, keyM, 4, 10, -0.1, 0, 0, KEY);
  K.box(0.17, 0.03, 0.02, keyM, 0.05, 0, 0, KEY);
  for (const x of [0.09, 0.125]) K.box(0.022, 0.05, 0.02, keyM, x, -0.028, 0, KEY);
  KEY.visible = false;

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  let cx = 0.3, dialA = 0, keyK = -1, tP = 0, whlA = 0, whlGoal = 0, pump = 0, pk = 0;
  return {
    onTake() { keyK = -1; },
    onVerdict(v) { if (!v.pass) keyK = 0; else { whlGoal -= Math.PI / 2; X.gl(0, 1.5, CAPZ, v1); T.motes(v1.x, v1.y, v1.z, 10, GREEN); } },
    update(st) {
      const { c, t, dt, blk } = st;
      let goal = 0.3;
      if (st.working) goal = Math.sin(c.pt * 3.2) * 0.27;
      else if (c.it && (c.ph === 'feed' || st.verdict)) goal = 0;
      if (!blk) { cx += (goal - cx) * Math.min(1, dt * 7); if (st.working) pump += dt * 9; }
      pk += ((st.working ? Math.sin(pump) : 0) - pk) * Math.min(1, dt * 10);
      CAR.position.x = cx;
      CAR.rotation.z = blk ? Math.sin(t * 43) * 0.03 : 0;
      BEL.scale.y = 1 + 0.32 * pk; NOSE.position.y = -0.25 - 0.045 * pk;
      DOOR.rotation.z = blk ? Math.sin(t * 37) * 0.03 : 0;
      DOOR.position.x = blk ? Math.sin(t * 51) * 0.008 : 0;
      whlA += (whlGoal - whlA) * Math.min(1, dt * 3.5);
      WHL.rotation.z = whlA + (blk ? Math.sin(t * 29) * 0.12 : 0);
      if (st.working) dialA = Math.floor(t * 4) * 0.7 * (Math.floor(t * 0.5) % 2 ? 1 : -1);
      else if (st.after && !st.pass) dialA += dt * 12;
      DIAL.rotation.z = dialA + (blk ? Math.sin(t * 50) * 0.1 : 0);
      const ec = eyeCol(st); noseM.color.setHex(ec); eyeM.color.setHex(ec);
      sigLamp(st, lampM);
      // the sniff: motes drawn up out of the capsule into the nose; amber coughs when blocked
      tP -= dt;
      if (st.working && tP <= 0) {
        tP = 0.05; T.at(mouth, v1); X.gl(cx + K.R() * 0.3, 1.36, CAPZ + K.R() * 0.16, v2); const tt = 0.3;
        K.spawn(g, v2.x, v2.y, v2.z, (v1.x - v2.x) / tt, (v1.y - v2.y) / tt, (v1.z - v2.z) / tt, Math.random() < 0.5 ? 0x7af0d8 : 0xd8fff4, tt, 0.032, 0, true);
      }
      if (blk && tP <= 0) {
        tP = 0.09; T.at(mouth, v1); K.spawn(g, v1.x, v1.y, v1.z, K.R() * 0.6, -0.3, K.R() * 0.6, 0xffb020, 0.5, 0.035, -0.5, true);
        if (Math.random() < 0.35) { X.gl(0.3, VT + 0.56, VZ - 0.05, v2); T.puff(v2.x, v2.y, v2.z, 0xd8b070, 0.09, 0.6, 0.04, 1.2); }
      }
      // a leaked key rises out of the capsule and is sucked up the nose, then locked away
      if (keyK >= 0 && !blk) {
        keyK += dt / 0.75;
        T.at(mouth, v1); X.gl(0, 1.32, CAPZ, v2);
        KEY.position.lerpVectors(v2, v1, K.smooth(Math.min(1, keyK)));
        KEY.rotation.y += dt * 6; KEY.scale.setScalar(Math.max(0.05, 2.2 - Math.max(0, keyK - 0.75) * 8.5));
        if (keyK >= 1) { keyK = -1; whlGoal -= Math.PI * 2; T.sparks(v1.x, v1.y, v1.z, 12, 0xff5a3a, 1.6); }
      }
      if (!c.it) keyK = -1;
      KEY.visible = keyK >= 0;
    },
  };
}

// ---------------------------------------------------------------------
// TYPES: a stamping press. The column stands behind the lane, its arm reaches over the capsule, the head (with the
// name) carries the ram; the anvil takes the lane's middle. The ram stamps three times (sparks, the pressure gauge
// jumps), the flywheel and the gear train turn. Fail = the ram jams halfway, steam, the gauge in the red;
// blocked = stuck ram shivering, steam, amber strobe.
// ---------------------------------------------------------------------
function devTypes(X) {
  const { K, P, T, DV, g, THREE } = X;
  // the anvil and its die in place of the lane's middle rollers
  K.box(0.44, 0.2, 0.42, P.steel, 0, 0.875, CAPZ, DV);
  K.box(0.5, 0.05, 0.48, P.ironM, 0, 0.77, CAPZ, DV);
  K.box(0.34, 0.025, 0.3, P.brassD, 0, 0.9875, CAPZ, DV);
  for (const s of [-1, 1]) K.box(0.05, 0.05, 0.05, P.brassL, s * 0.19, 0.95, CAPZ + 0.215, DV);
  // the column
  const CZ = 0.08, CW = 0.44, CD = 0.36, CT = 2.6, HY = 2.06, HW = 0.52, HH = 0.5, HD = 0.44;
  const CF = CZ + CD / 2;
  K.box(CW + 0.22, 0.1, CD + 0.22, P.ironM, 0, 0.34, CZ, DV);
  K.box(CW + 0.12, 0.05, CD + 0.12, P.brassD, 0, 0.415, CZ, DV);
  K.box(CW, CT - 0.44, CD, P.iron, 0, (CT + 0.44) / 2, CZ, DV);
  for (const s of [-1, 1]) { K.box(0.07, CT - 0.5, 0.07, P.ironL, s * (CW / 2 + 0.01), (CT + 0.5) / 2, CF - 0.01, DV); T.row(DV, s * (CW / 2 - 0.06), 0.62, CF + 0.008, s * (CW / 2 - 0.06), CT - 0.1, CF + 0.008, 7, P.brassL, 0.03); }
  for (const y of [0.75, 1.5]) K.box(CW + 0.06, 0.06, CD + 0.06, P.brass, 0, y, CZ, DV);
  K.box(CW + 0.12, 0.08, CD + 0.12, P.ironM, 0, CT + 0.04, CZ, DV);
  K.box(CW + 0.14, 0.085, 0.035, P.brassD, 0, CT + 0.04, CZ + (CD + 0.12) / 2, DV);
  K.box(CW + 0.04, 0.06, CD + 0.04, P.ironM, 0, CT + 0.11, CZ, DV);
  // the pressure gauge high on the column, above the arm
  const pg = T.gauge(DV, 0.1, 2.47, CF + 0.01, 0.1, 0, 0);
  // the arm and the head
  const AY = HY + 0.1, A0 = CF - 0.01, A1 = CAPZ - HD / 2 + 0.01;
  K.box(0.34, 0.34, A1 - A0, P.ironM, 0, AY, (A0 + A1) / 2, DV);
  K.box(0.07, 0.03, A1 - A0, P.brass, 0, AY + 0.185, (A0 + A1) / 2, DV);
  for (const s of [-1, 1]) K.box(0.03, 0.025, A1 - A0, P.brassD, s * 0.16, AY + 0.18, (A0 + A1) / 2, DV);
  for (const s of [-1, 1]) T.row(DV, s * 0.175, AY - 0.1, A0 + 0.08, s * 0.175, AY - 0.1, A1 - 0.06, 4, P.brassL, 0.03);
  K.box(HW, HH, HD, P.iron, 0, HY, CAPZ, DV);
  K.box(HW + 0.05, 0.05, HD + 0.05, P.ironM, 0, HY + HH / 2, CAPZ, DV);
  K.box(HW + 0.07, 0.055, 0.035, P.brass, 0, HY + HH / 2, CAPZ + (HD + 0.05) / 2, DV);
  K.box(HW + 0.05, 0.05, HD + 0.05, P.brassD, 0, HY - HH / 2, CAPZ, DV);
  X.plate('TYPES', 0, HY + 0.1, CAPZ + HD / 2 + 0.025, 0.78);
  T.hazard(DV, HW - 0.06, 0, HY - 0.1, CAPZ + HD / 2 + 0.01, 6, 0, 0.08, 0.015);
  K.cyl(0.09, 0.09, 0.1, P.brass, 10, 0, HY - HH / 2 - 0.06, CAPZ, DV);
  // steam vent + signal lamp on the head
  K.cyl(0.025, 0.025, 0.16, P.brassD, 6, -0.15, HY + HH / 2 + 0.1, CAPZ - 0.05, DV);
  K.cyl(0.04, 0.03, 0.04, P.brass, 6, -0.15, HY + HH / 2 + 0.19, CAPZ - 0.05, DV);
  K.cyl(0.07, 0.08, 0.04, P.brass, 8, 0.14, HY + HH / 2 + 0.045, CAPZ + 0.05, DV);
  const lampM = T.lamp(DV, 0.14, HY + HH / 2 + 0.1, CAPZ + 0.05, 0.05);
  // the ram
  const RY0 = 1.7625, TRAVEL = 0.25;
  const RAM = K.dyn(K.group(DV, 0, RY0, CAPZ));
  K.cyl(0.045, 0.045, 0.34, P.steel, 8, 0, 0.15, 0, RAM);
  K.box(0.32, 0.1, 0.26, P.ironM, 0, -0.07, 0, RAM);
  K.box(0.28, 0.025, 0.22, P.brassL, 0, -0.13, 0, RAM);
  T.hazard(RAM, 0.32, 0, -0.07, 0.135, 6, 0, 0.05, 0.012);
  // the flywheel on a bracket at the right, belted down to the motor
  const FX = 0.47, FY = 1.92, FZ = CF + 0.08;
  K.box(0.3, 0.12, 0.12, P.ironM, CW / 2 + 0.13, FY, CZ, DV);
  { const ax = K.cyl(0.045, 0.045, 0.2, P.steel, 8, FX, FY, FZ - 0.08, DV); ax.rotation.x = Math.PI / 2; }
  const FLY = K.dyn(K.group(DV, FX, FY, FZ));
  T.ringZ(FLY, 0.27, 0.045, P.iron, 0, 0, 0, 24);
  T.ringZ(FLY, 0.22, 0.014, P.brassD, 0, 0, 0.03, 20);
  for (let i = 0; i < 3; i++) { const sp = K.box(0.04, 0.5, 0.03, P.ironM, 0, 0, 0, FLY); sp.rotation.z = i * Math.PI / 3; }
  T.discZ(FLY, 0.08, 0.08, P.brass, 0, 0, 0.01, 10);
  K.box(0.06, 0.06, 0.05, P.brassL, 0, 0.245, 0.04, FLY);
  const MY = 0.92;
  K.box(0.26, 0.4, 0.22, P.iron, FX, 0.55, FZ - 0.06, DV);
  K.box(0.3, 0.04, 0.26, P.brassD, FX, 0.76, FZ - 0.06, DV);
  { const mo = K.cyl(0.11, 0.11, 0.26, P.copper, 12, FX, MY, FZ - 0.06, DV); mo.rotation.x = Math.PI / 2; for (const dz of [-0.11, 0.11]) { const b = K.cyl(0.115, 0.115, 0.03, P.brassD, 12, FX, MY, FZ - 0.06 + dz, DV); b.rotation.x = Math.PI / 2; } }
  { const pu = K.cyl(0.05, 0.05, 0.04, P.brass, 8, FX, MY, FZ + 0.1, DV); pu.rotation.x = Math.PI / 2; }
  for (const s of [-1, 1]) beam(K, DV, [FX + s * 0.05, MY, FZ + 0.1], [FX + s * 0.08, FY, FZ + 0.07], 0.016, 0.016, P.rubber);
  // the gear train at the left of the column
  K.box(0.3, 0.68, 0.05, P.ironM, -0.33, 2.33, CF - 0.05, DV);
  const G1 = K.dyn(T.gear(DV, 0.2, 0.06, 14, P.brassD, -0.38, 2.2, CF + 0.02)); G1.rotation.x = Math.PI / 2;
  const G2 = K.dyn(T.gear(DV, 0.11, 0.06, 8, P.brass, -0.38, 2.53, CF + 0.02)); G2.rotation.x = Math.PI / 2;

  const tmp = new THREE.Vector3();
  let ramK = 0, hits = 0, flyA = 0, flyV = 0, tS = 0, pres = 0;
  const strokeK = (p) => (p < 0 ? 0 : p < 0.1 ? (p / 0.1) * (p / 0.1) : p < 0.17 ? 1 : p < 0.42 ? 1 - K.smooth((p - 0.17) / 0.25) : 0);
  return {
    onTake() { hits = 0; },
    onVerdict() { hits = 0; },
    update(st) {
      const { c, t, dt, blk } = st;
      const jam = st.verdict && !st.pass;
      if (!blk) {
        let k = 0;
        if (st.working) {
          const p = c.pt - 0.2, i = Math.max(0, Math.floor(p / 0.5));
          k = p < 0 ? 0 : strokeK(p - i * 0.5);
          if (k >= 1 && hits <= i) { hits = i + 1; pres = 1; X.gl(0, 1.37, CAPZ, tmp); T.sparks(tmp.x, tmp.y, tmp.z, 9); T.dust(tmp.x, 1.05, tmp.z, 4, 0.22); }
        } else if (st.verdict && st.pass) {
          k = strokeK(c.pt - 0.05);
          if (k >= 1 && hits === 0) { hits = 1; pres = 0.6; X.gl(0, 1.4, CAPZ, tmp); T.motes(tmp.x, tmp.y, tmp.z, 12, GREEN); T.pulse(tmp.x, 1.05, tmp.z, GREEN); }
        } else if (jam) k = Math.min(0.55, (c.pt / 0.14) * 0.55) + (c.pt > 0.14 ? Math.sin(t * 60) * 0.015 : 0);
        ramK = k;
        pres = Math.max(jam ? 1.3 : 0, pres - dt * 1.4);
      }
      RAM.position.y = RY0 - TRAVEL * ramK + (blk ? Math.sin(t * 45) * 0.005 : 0);
      const fg = blk ? 0 : st.working ? 7 : st.verdict ? (st.pass ? 4 : 0.4) : st.lightK > 0.5 ? 1.2 : 0;
      flyV += (fg - flyV) * Math.min(1, dt * (blk || jam ? 6 : 2)); flyA += flyV * dt;
      FLY.rotation.z = -flyA;
      G1.rotation.y = flyA * 0.55; G2.rotation.y = -flyA * 0.55 * (0.2 / 0.11);
      const pn = blk ? 1.25 + Math.sin(t * 40) * 0.06 : (st.lightK > 0.3 ? 0.15 : 0) + pres * 0.85;
      pg.rotation.z += ((1.9 - pn * 2.6) - pg.rotation.z) * Math.min(1, dt * 12);
      sigLamp(st, lampM);
      tS -= dt;
      if ((blk || jam) && tS <= 0) { tS = 0.07; X.gl(-0.15, HY + HH / 2 + 0.24, CAPZ - 0.05, tmp); T.steam(tmp.x, tmp.y, tmp.z, 1); if (jam && Math.random() < 0.3) { X.gl(0, 1.6, CAPZ, tmp); T.sparks(tmp.x, tmp.y, tmp.z, 2, 0xff8050, 1.2); } }
    },
  };
}

// ---------------------------------------------------------------------
// LEFTOVERS: a rotary brush on a cantilever rail scrubs along the capsule; what it brushes off flies up into a big
// shaking brass sieve over a copper funnel and a bin. Fail = a red leftover chunk lands in the sieve and stays;
// blocked = the sieve jams tilted steeply, dust, amber.
// ---------------------------------------------------------------------
function devLeftovers(X) {
  const { K, P, T, DV, g, kit, THREE } = X;
  const SX = -0.1, SY = 1.74, SZ = -0.2, SR = 0.34, TILT = 0.62;
  // the bin, the funnel, the spring legs
  K.box(0.5, 0.06, 0.42, P.ironM, SX, 0.32, SZ, DV);
  K.box(0.44, 0.36, 0.36, P.woodD, SX, 0.53, SZ, DV);
  for (const y of [0.4, 0.67]) K.box(0.46, 0.03, 0.38, P.brassD, SX, y, SZ, DV);
  K.box(0.2, 0.06, 0.01, kit.text('BIN', { bg: '#4c341f', fg: '#e4b85e', pad: 1 }), SX, 0.535, SZ + 0.185, DV);
  K.cyl(0.25, 0.06, 0.44, P.copper, 12, SX, 0.94, SZ, DV);
  { const r = K.torus(0.25, 0.018, P.brassD, 4, 16, SX, 1.16, SZ, DV); r.rotation.x = Math.PI / 2; }
  for (const [dx, dz] of [[-0.24, -0.17], [0.24, -0.17], [-0.24, 0.17], [0.24, 0.17]]) {
    const ty = SY - 0.06 - (dz / 0.17) * 0.12;
    rod(K, DV, [SX + dx * 0.85, 0.71, SZ + dz * 0.9], [SX + dx, ty, SZ + dz], 0.015, P.steel, 5);
    for (let i = 0; i < 3; i++) { const r = K.torus(0.024, 0.008, P.copper, 3, 8, SX + dx, ty - 0.06 - i * 0.028, SZ + dz, DV); r.rotation.x = Math.PI / 2; }
  }
  // the back frame with the name board
  for (const x of [SX - 0.36, SX + 0.36]) { K.box(0.16, 0.05, 0.16, P.ironM, x, 0.315, SZ - 0.27, DV); K.box(0.07, 2.1, 0.07, P.iron, x, 1.34, SZ - 0.27, DV); K.box(0.1, 0.04, 0.1, P.brass, x, 1.0, SZ - 0.27, DV); }
  K.box(0.86, 0.07, 0.08, P.ironM, SX, 2.36, SZ - 0.27, DV);
  K.box(0.9, 0.025, 0.1, P.brass, SX, 2.41, SZ - 0.27, DV);
  X.plate('LEFTOVERS', SX, 2.24, SZ - 0.215, 0.62);
  K.cyl(0.06, 0.07, 0.04, P.brass, 8, SX + 0.36, 2.44, SZ - 0.27, DV);
  const lampM = T.lamp(DV, SX + 0.36, 2.5, SZ - 0.27, 0.05);
  // the sieve (shakes; tilted toward the viewer)
  const SIEVE = K.dyn(K.group(DV, SX, SY, SZ));
  K.mesh(new THREE.CylinderGeometry(SR, SR - 0.02, 0.1, 18, 1, true), P.brass2, 0, 0, 0, SIEVE);
  { const r = K.torus(SR, 0.026, P.brassL, 4, 20, 0, 0.05, 0, SIEVE); r.rotation.x = Math.PI / 2; }
  { const r = K.torus(SR - 0.02, 0.018, P.brassD, 4, 20, 0, -0.05, 0, SIEVE); r.rotation.x = Math.PI / 2; }
  for (const s of [-1, 1]) K.box(0.08, 0.04, 0.06, P.brassD, s * (SR + 0.04), 0.02, 0, SIEVE);
  const meshT = K.canvasTex(16, 16, (cx) => { cx.fillStyle = '#2a1e12'; cx.fillRect(0, 0, 16, 16); cx.fillStyle = '#c89a50'; for (let i = 0; i < 16; i += 3) { cx.fillRect(i, 0, 1, 16); cx.fillRect(0, i, 16, 1); } }, [4, 4]);
  const meshM = K.mat(0xffffff, { map: meshT, shine: 30, spec: 0x6a5030 });
  K.cyl(SR - 0.01, SR - 0.01, 0.012, meshM, 18, 0, -0.03, 0, SIEVE);
  for (let i = 0; i < 9; i++) { const b = K.box(0.03 + K.rnd() * 0.04, 0.02, 0.03 + K.rnd() * 0.03, i % 3 ? P.ironL : P.paper, K.R() * 0.42, -0.014, K.R() * 0.42, SIEVE); b.rotation.y = K.rnd() * 3; }
  const CHUNK = K.dyn(K.group(SIEVE, 0.06, 0.0, 0.08));
  const chunkM = K.glow(0xff4030);
  K.box(0.11, 0.07, 0.08, chunkM, 0, 0, 0, CHUNK);
  K.box(0.06, 0.06, 0.06, chunkM, -0.06, 0.02, 0.03, CHUNK).rotation.y = 0.6;
  CHUNK.visible = false;
  // the brush rail: a post at the right, an arm forward, the rail over the capsule
  const PX = 0.52, PZ = 0.56, RY = 1.8, RZ = CAPZ - 0.03;
  K.box(0.22, 0.06, 0.22, P.ironM, PX, 0.32, PZ, DV);
  K.box(0.1, RY - 0.29, 0.1, P.iron, PX, (RY + 0.29) / 2, PZ, DV);
  for (const y of [0.8, 1.4]) K.box(0.13, 0.04, 0.13, P.brass, PX, y, PZ, DV);
  beam(K, DV, [PX, RY, PZ - 0.04], [PX, RY, RZ + 0.05], 0.09, 0.1, P.ironM);
  beam(K, DV, [PX, RY - 0.36, PZ + 0.03], [PX, RY - 0.03, PZ + 0.38], 0.04, 0.04, P.ironL);
  K.box(PX + 0.56, 0.09, 0.09, P.ironM, (PX - 0.5) / 2, RY, RZ, DV);
  K.box(PX + 0.5, 0.025, 0.05, P.brass, (PX - 0.5) / 2, RY + 0.055, RZ, DV);
  T.row(DV, -0.44, RY, RZ + 0.05, PX - 0.04, RY, RZ + 0.05, 7, P.brassL, 0.028);
  K.box(0.06, 0.13, 0.11, P.brassD, -0.5, RY, RZ, DV);
  // the brush carriage, its lift rod and the rotary brush (a star of tufts facing the camera)
  const BRC = K.dyn(K.group(DV, 0.38, RY, RZ));
  K.box(0.16, 0.14, 0.16, P.brassD, 0, -0.02, 0, BRC);
  for (const s of [-1, 1]) { const w = K.cyl(0.03, 0.03, 0.15, P.brass, 8, s * 0.05, 0.07, 0, BRC); w.rotation.x = Math.PI / 2; }
  { const m = K.cyl(0.06, 0.06, 0.14, P.copper, 10, 0.0, -0.03, -0.14, BRC); m.rotation.x = Math.PI / 2; }
  const ROD = K.dyn(K.group(BRC, 0, 0.1, 0));
  K.cyl(0.022, 0.022, 0.3, P.steel, 6, 0, -0.22, 0, ROD);
  K.box(0.28, 0.03, 0.3, P.brassD, 0, -0.25, 0, ROD);
  for (const s of [-1, 1]) K.box(0.03, 0.09, 0.3, P.brassD, s * 0.14, -0.29, 0, ROD);
  const strawM = kit.pal(0xc8a050, 0.05);
  const BRUSH = K.dyn(K.group(ROD, 0, -0.37, 0));
  { const core = K.cyl(0.045, 0.045, 0.3, P.wood, 8, 0, 0, 0, BRUSH); core.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const tf = K.box(0.04, 0.09, 0.26, i % 2 ? strawM : P.woodD, Math.sin(a) * 0.085, Math.cos(a) * 0.085, 0, BRUSH); tf.rotation.z = -a; }

  const v1 = new THREE.Vector3();
  let bx = 0.38, rodK = 0, spin = 0, tD = 0, tilt = TILT;
  const fling = (red) => {
    const tau = 0.45 + Math.random() * 0.1;
    X.gl(bx + K.R() * 0.12, 1.42, CAPZ + K.R() * 0.18, v1);
    const tx = SX + K.R() * 0.36, tz = SZ + K.R() * 0.3, ty = SY + 0.05;
    const vx = (tx - bx) / tau, vz = (tz - CAPZ) / tau, vy = (ty - 1.42 + 0.5 * 5 * tau * tau) / tau;
    const [gx, gz] = X.gv(vx, vz);
    K.spawn(g, v1.x, v1.y, v1.z, gx, vy, gz, red ? 0xff4030 : [0xd8c8a8, 0x8a7a64, 0x6a5a48, 0xb89050][Math.floor(Math.random() * 4)], tau, red ? 0.08 : 0.038, 5, !!red);
  };
  return {
    onVerdict(v) { if (!v.pass) fling(true); else { X.gl(0, 1.5, CAPZ, v1); T.motes(v1.x, v1.y, v1.z, 10, GREEN); } },
    update(st) {
      const { c, t, dt, blk } = st;
      if (!blk) {
        const goal = st.working ? Math.sin(c.pt * 3.6) * 0.27 : 0.38;
        bx += (goal - bx) * Math.min(1, dt * 6);
        rodK += ((st.working && c.pt > 0.15 ? 1 : 0) - rodK) * Math.min(1, dt * 8);
        spin += ((st.working ? 16 : st.lightK > 0.5 ? 1.5 : 0) - spin) * Math.min(1, dt * 4);
      } else spin = 0;
      BRC.position.x = bx;
      ROD.position.y = K.lerp(0.1, 0, rodK);
      BRUSH.rotation.z -= spin * dt;
      const caught = st.after && !st.pass;
      const shake = !blk && (st.working || (st.verdict && st.pass)) ? 1 : 0;
      tilt += ((blk ? 0.98 : TILT) - tilt) * Math.min(1, dt * 5);
      SIEVE.rotation.x = tilt + (blk ? Math.sin(t * 38) * 0.025 : 0);
      SIEVE.position.x = SX + shake * Math.sin(t * 47) * 0.016;
      SIEVE.position.y = SY + shake * Math.abs(Math.sin(t * 31)) * 0.012;
      CHUNK.visible = caught && (c.pt > 0.45 || c.ph !== 'verdict');
      chunkM.color.setHex(blink(t, 10) ? 0xff4030 : 0x8a1408);
      sigLamp(st, lampM);
      tD -= dt;
      if (st.working && rodK > 0.8 && tD <= 0) { tD = 0.04; fling(false); }
      if (blk && tD <= 0) { tD = 0.12; X.gl(SX, SY + 0.1, SZ + 0.1, v1); T.dust(v1.x, v1.y, v1.z, 2, 0.25); }
    },
  };
}

// ---------------------------------------------------------------------
// SCOPE: a big magnifying glass on an articulated brass arm reads along the capsule (the diff scrolls magnified in
// its lens) while the tall LINES thermometer fills and the counter climbs. Fail = the column shoots into the red
// and boils over; blocked = the column quivers at the red line, the lens rim strobes amber, the counter asks "????".
// ---------------------------------------------------------------------
function devScope(X) {
  const { K, P, T, DV, g, kit, THREE } = X;
  // the LINES thermometer (left): a scale board, a glass tube with a glowing column, a bulb
  const TX = -0.36, TZ = -0.26, TB = 0.82, TT = 2.34;
  K.box(0.36, 0.08, 0.32, P.ironM, TX, 0.33, TZ, DV);
  K.box(0.14, TB - 0.45, 0.14, P.iron, TX, (TB + 0.45) / 2 - 0.04, TZ, DV);
  K.box(0.2, 0.05, 0.2, P.brass, TX, 0.6, TZ, DV);
  K.box(0.32, TT - TB + 0.36, 0.05, P.brassD, TX, (TT + TB) / 2 + 0.06, TZ - 0.05, DV);
  K.box(0.26, TT - TB + 0.22, 0.02, P.cream, TX, (TT + TB) / 2 + 0.06, TZ - 0.02, DV);
  const RED0 = TB + (TT - TB) * 0.74;
  K.box(0.26, TT - RED0 + 0.06, 0.022, P.red, TX, (TT + RED0) / 2 + 0.06, TZ - 0.018, DV);
  for (let i = 0; i <= 12; i++) { const y = TB + 0.1 + i * (TT - TB - 0.1) / 12; for (const s of [-1, 1]) K.box(i % 3 ? 0.035 : 0.065, 0.012, 0.01, P.ink, TX + s * (0.095 - (i % 3 ? 0 : 0.015)), y, TZ - 0.005, DV); }
  T.row(DV, TX - 0.14, TB - 0.1, TZ - 0.02, TX - 0.14, TT + 0.2, TZ - 0.02, 7, P.brassL, 0.03);
  T.row(DV, TX + 0.14, TB - 0.1, TZ - 0.02, TX + 0.14, TT + 0.2, TZ - 0.02, 7, P.brassL, 0.03);
  const liqM = K.glow(0x6a3010);
  K.sph(0.085, liqM, TX, TB, TZ + 0.03, DV, 10, 8);
  K.cyl(0.07, 0.08, 0.06, P.brass, 10, TX, TB + 0.09, TZ + 0.03, DV);
  const LIQ = K.dyn(K.group(DV, TX, TB + 0.1, TZ + 0.03));
  K.box(0.05, 1, 0.05, liqM, 0, 0.5, 0, LIQ);
  { const tb = K.cyl(0.05, 0.05, TT - TB, P.glass, 10, TX, (TT + TB) / 2 + 0.05, TZ + 0.03, DV); tb.castShadow = false; }
  K.cyl(0.07, 0.06, 0.08, P.brass, 10, TX, TT + 0.11, TZ + 0.03, DV);
  X.plate('LINES', TX, TT + 0.27, TZ, 0.6);
  // the line counter on a bracket at the right of the board
  const cnt = kit.liveText(19, 9, 1);
  const cntM = new THREE.MeshBasicMaterial({ map: cnt.tex, fog: false });
  K.box(0.2, 0.05, 0.05, P.ironM, TX + 0.2, 2.06, TZ - 0.03, DV);
  K.box(0.36, 0.17, 0.08, P.brassD, TX + 0.36, 2.06, TZ - 0.02, DV);
  K.box(0.31, 0.13, 0.02, cntM, TX + 0.36, 2.06, TZ + 0.025, DV);
  const lampM = T.lamp(DV, TX + 0.36, 2.2, TZ - 0.02, 0.045);
  // the magnifier: post at the right, a two-link brass arm, the lens squared to the viewer
  const PX = 0.46, PZ = 0.08, PY = 2.06, L1 = 0.68, L2 = 0.68;
  K.box(0.26, 0.07, 0.26, P.ironM, PX, 0.325, PZ, DV);
  K.box(0.1, PY - 0.36, 0.1, P.iron, PX, (PY + 0.36) / 2 - 0.02, PZ, DV);
  for (const y of [0.8, 1.45]) K.box(0.14, 0.05, 0.14, P.brass, PX, y, PZ, DV);
  K.cyl(0.08, 0.08, 0.06, P.brassD, 10, PX, PY - 0.06, PZ, DV);
  K.cyl(0.015, 0.015, 0.2, P.brassD, 6, PX + 0.06, PY + 0.12, PZ - 0.04, DV);
  X.plate('SCOPE', PX + 0.06, PY + 0.28, PZ - 0.04, 0.5);
  const ARM1 = K.dyn(K.group(DV, PX, PY, PZ));
  K.cyl(0.065, 0.065, 0.09, P.brass, 10, 0, 0, 0, ARM1);
  K.box(0.05, 0.06, L1, P.brassD, 0, 0, L1 / 2, ARM1);
  K.cyl(0.055, 0.055, 0.1, P.brass, 10, 0, 0, L1, ARM1);
  const ARM2 = K.dyn(K.group(ARM1, 0, 0.03, L1));
  K.box(0.045, 0.05, L2, P.brass, 0, 0, L2 / 2, ARM2);
  K.cyl(0.03, 0.03, 0.06, P.brassD, 8, 0, -0.03, L2, ARM2);
  const LENS = K.dyn(K.group(ARM2, 0, -0.06, L2));
  const LT = K.group(LENS, 0, -0.225, 0.13); LT.rotation.x = -Math.PI / 6;
  T.ringZ(LT, 0.26, 0.032, P.brass, 0, 0, 0, 26);
  K.box(0.06, 0.06, 0.06, P.brassD, 0, 0.27, 0, LT);
  const diffT = K.canvasTex(16, 32, (cx) => {
    cx.fillStyle = '#0e1410'; cx.fillRect(0, 0, 16, 32);
    for (let y = 1; y < 32; y += 2) { const r = K.rnd(), ind = 1 + Math.floor(K.rnd() * 4), len = 3 + Math.floor(K.rnd() * (12 - ind)); cx.fillStyle = r < 0.3 ? '#4ae07a' : r < 0.45 ? '#ff6a4a' : '#9aa89a'; cx.fillRect(ind, y, len, 1); }
  }, [1, 0.5]);
  const lensM = new THREE.MeshBasicMaterial({ map: diffT, fog: false, color: 0x4a4a4a });
  K.mesh(new THREE.CircleGeometry(0.245, 22), lensM, 0, 0, 0.004, LT).castShadow = false;
  const rimM = K.glow(0x2a1e0e, 0.9, true);
  T.ringZ(LT, 0.29, 0.014, rimM, 0, 0, 0.012, 26).castShadow = false;

  const ik = (tx, tz) => {
    const dx = tx - PX, dz = tz - PZ, d = Math.min(L1 + L2 - 0.001, Math.max(0.05, Math.hypot(dx, dz)));
    const b = Math.atan2(dx, dz), al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const t1 = b + al, ex = PX + L1 * Math.sin(t1), ez = PZ + L1 * Math.cos(t1);
    const t2 = Math.atan2(tx - ex, tz - ez) - t1;
    ARM1.rotation.y = t1; ARM2.rotation.y = t2; LENS.rotation.y = -(t1 + t2);
  };
  const v1 = new THREE.Vector3();
  let lx = 0.18, lz = 0.5, lvl = 0, linesP = 120, linesF = 900, tB = 0;
  return {
    onTake(it) { const n = it.num || 0; linesP = 40 + ((n * 37) % 300); linesF = 600 + ((n * 53) % 900); },
    update(st) {
      const { c, t, dt, blk } = st;
      if (!blk) {
        let gx = 0.18, gz = 0.5;
        if (st.working) { gx = 0.04 + Math.sin(c.pt * 2.7) * 0.26; gz = CAPZ - 0.12; } else if (c.it && (c.ph === 'feed' || st.verdict)) { gx = 0; gz = CAPZ - 0.12; }
        lx += (gx - lx) * Math.min(1, dt * 5); lz += (gz - lz) * Math.min(1, dt * 5);
        diffT.offset.y -= dt * (st.working ? 1.4 : 0);
      }
      ik(lx, lz);
      // the column climbs with the count: settles under the red line, or shoots into it and boils over
      let goal = 0.03;
      if (st.working) goal = Math.min(0.66, (linesP / 900) * st.wk * 1.7 + 0.05) + Math.sin(t * 13) * 0.006;
      else if (st.after) goal = st.pass ? Math.min(0.64, linesP / 900 + 0.12) : 0.97 + Math.sin(t * 21) * 0.015;
      else if (st.lightK > 0.5) goal = 0.06;
      if (blk) goal = 0.76 + Math.sin(t * 17) * 0.025;
      lvl += (goal - lvl) * Math.min(1, dt * (st.after && !st.pass ? 8 : 3.5));
      LIQ.scale.y = Math.max(0.02, lvl * (TT - TB - 0.08));
      liqM.color.setHex(blk ? (st.strobe > 0.5 ? 0xffa020 : 0xb05a10) : st.after && !st.pass ? (blink(t, 12) ? 0xff3020 : 0xa01a08) : st.after ? 0x46ff8a : st.lightK > 0.3 ? 0xffb030 : 0x6a3010);
      lensM.color.setHex(st.working ? 0xffffff : st.lightK > 0.5 ? 0x9a9a9a : 0x4a4a4a);
      const pad = (n) => ('0000' + Math.floor(n)).slice(-4);
      if (blk) cnt.draw(blink(t, 6) ? '????' : '    ', '#ffb020', '#1a1004');
      else if (st.after) cnt.draw(pad(st.pass ? linesP : linesF), st.pass ? '#7affb0' : blink(t, 8) ? '#ff6a4a' : '#8a2a1a', '#0c0806');
      else if (st.working) cnt.draw(pad(linesP * st.wk), '#ffd27a', '#0c0806');
      else cnt.draw('0000', st.lightK > 0.5 ? '#8a6a3a' : '#4a3a20', '#0c0806');
      rimM.color.setHex(eyeCol(st));
      sigLamp(st, lampM);
      tB -= dt;
      if (st.after && !st.pass && st.verdict && tB <= 0) { tB = 0.08; X.gl(TX, TT + 0.16, TZ + 0.03, v1); T.steam(v1.x, v1.y, v1.z, 1); if (Math.random() < 0.4) T.sparks(v1.x, v1.y, v1.z, 2, 0xff6a3a, 0.8); }
    },
  };
}

// ---------------------------------------------------------------------
// DEPS: a tall brass balance weighs the manifest crate against the lockfile padlock while a hooded lamp on a
// gooseneck inspects the capsule. Pass = it settles level; fail = the crate side drops and the padlock springs
// open; blocked = it see-saws in jerks under an amber lamp.
// ---------------------------------------------------------------------
function devDeps(X) {
  const { K, P, T, DV, kit } = X;
  const PX = 0.0, PZ = -0.16, PY = 2.45, BL = 0.46, HG = 0.42;
  // the pillar
  K.cyl(0.22, 0.26, 0.08, P.ironM, 12, PX, 0.33, PZ, DV);
  K.cyl(0.18, 0.18, 0.04, P.brassD, 12, PX, 0.39, PZ, DV);
  K.cyl(0.06, 0.08, PY - 0.41, P.brass, 10, PX, (PY + 0.41) / 2, PZ, DV);
  for (const y of [0.9, 1.45]) K.sph(0.085, P.brassL, PX, y, PZ, DV, 10, 6);
  K.box(0.16, 0.2, 0.14, P.brassD, PX, PY - 0.04, PZ, DV);
  K.cone(0.05, 0.12, P.brass, 8, PX, PY + 0.12, PZ, DV);
  X.plate('DEPS', PX, 1.86, PZ + 0.09, 0.62);
  // the scale arc under the beam, the green "balanced" mark
  { const a = K.torus(0.36, 0.018, P.brass, 3, 16, PX, PY, PZ + 0.08, DV, 0.9); a.rotation.z = -Math.PI / 2 - 0.45; }
  for (let i = 0; i < 7; i++) { const a = Math.PI - 0.42 + i * 0.14; const tk = K.box(0.014, i === 3 ? 0.08 : 0.045, 0.01, i === 3 ? P.verd : P.ink, PX + Math.sin(a) * 0.4, PY + Math.cos(a) * 0.4, PZ + 0.085, DV); tk.rotation.z = -a; }
  const lampM = T.lamp(DV, PX, PY + 0.24, PZ, 0.05);
  // the beam with its pointer
  const BEAM = K.dyn(K.group(DV, PX, PY, PZ + 0.03));
  K.box(BL * 2 + 0.08, 0.05, 0.05, P.brass, 0, 0, 0, BEAM);
  K.box(BL * 2 - 0.1, 0.02, 0.06, P.brassL, 0, 0.03, 0, BEAM);
  for (const s of [-1, 1]) { K.box(0.035, 0.09, 0.07, P.brassD, s * BL, -0.02, 0, BEAM); K.sph(0.03, P.brassL, s * (BL + 0.05), 0, 0, BEAM, 6, 4); }
  K.box(0.13, 0.13, 0.08, P.brassD, 0, 0.02, 0, BEAM);
  K.sph(0.04, P.brassL, 0, 0.11, 0, BEAM, 6, 4);
  K.box(0.018, 0.36, 0.012, P.ink, 0, -0.2, 0.05, BEAM);
  // the pans (they hang level from the beam ends)
  const pan = (s) => {
    const G = K.dyn(K.group(DV, PX + s * BL, PY, PZ + 0.03));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; rod(K, G, [0, -0.02, 0], [Math.cos(a) * 0.15, -HG, Math.sin(a) * 0.15], 0.006, P.brassD, 4); }
    K.cyl(0.17, 0.13, 0.04, P.brass, 14, 0, -HG - 0.02, 0, G);
    { const r = K.torus(0.17, 0.013, P.brassL, 3, 16, 0, -HG, 0, G); r.rotation.x = Math.PI / 2; }
    return G;
  };
  const PL = pan(-1), PR = pan(1);
  K.box(0.24, 0.18, 0.2, P.wood, 0, -HG + 0.09, 0, PL);
  for (const y of [-HG + 0.02, -HG + 0.16]) K.box(0.25, 0.025, 0.21, P.woodD, 0, y, 0, PL);
  K.box(0.15, 0.06, 0.01, kit.text('PKG', { bg: '#7a5432', fg: '#1e1408', pad: 1 }), 0, -HG + 0.09, 0.105, PL);
  K.box(0.17, 0.14, 0.08, P.brass, 0, -HG + 0.07, 0, PR);
  K.box(0.13, 0.1, 0.085, P.brassD, 0, -HG + 0.07, 0, PR);
  K.box(0.025, 0.045, 0.01, P.ink, 0, -HG + 0.06, 0.045, PR);
  const SHK = K.dyn(K.group(PR, -0.05, -HG + 0.14, 0));
  K.torus(0.05, 0.015, P.steel, 4, 10, 0.05, 0, 0, SHK, Math.PI);
  // the inspector lamp on a gooseneck over the capsule
  K.tube([[PX, 1.2, PZ + 0.06], [PX + 0.28, 1.5, 0.3], [0.32, 1.78, 0.85], [0.2, 1.86, CAPZ - 0.08]], 0.024, P.brassD, DV, 14, 5);
  K.cone(0.11, 0.14, P.brassD, 10, 0.2, 1.82, CAPZ - 0.08, DV);
  K.cyl(0.03, 0.03, 0.05, P.brass, 6, 0.2, 1.91, CAPZ - 0.08, DV);
  const bulbM = K.glow(0x3a2a10);
  K.sph(0.045, bulbM, 0.2, 1.75, CAPZ - 0.08, DV, 8, 6);
  const coneM = K.glow(0xfff0c0, 0, true);
  K.cone(0.22, 0.38, coneM, 14, 0.12, 1.56, CAPZ - 0.04, DV).castShadow = false;

  let th = 0, thV = 0, shk = 0;
  return {
    update(st) {
      const { c, t, dt, blk } = st;
      let goal = 0;
      if (blk) goal = Math.sin(t * 3.4) > 0 ? 0.3 : -0.3;
      else if (st.working) goal = Math.sin(c.pt * 4.6) * 0.32 * (1 - 0.7 * st.wk);
      else if (st.after) goal = st.pass ? 0 : 0.4;
      // a damped spring (sub-stepped so a long frame can't blow it up)
      for (let left = dt; left > 1e-6;) { const h = Math.min(1 / 60, left); left -= h; thV += ((goal - th) * 60 - thV * 7) * h; th += thV * h; }
      BEAM.rotation.z = th;
      PL.position.set(PX - BL * Math.cos(th), PY - BL * Math.sin(th), PZ + 0.03);
      PR.position.set(PX + BL * Math.cos(th), PY + BL * Math.sin(th), PZ + 0.03);
      PL.rotation.z = PR.rotation.z = -thV * 0.03;
      shk += ((st.after && !st.pass ? 1 : 0) - shk) * Math.min(1, dt * 8);
      SHK.position.y = -HG + 0.14 + 0.05 * shk; SHK.rotation.y = shk * 1.3;
      bulbM.color.setHex(blk ? (st.strobe > 0.5 ? 0xffa020 : 0x3a1a04) : st.after ? (st.pass ? GREEN : RED) : st.working ? 0xfff4d0 : st.lightK > 0.5 ? 0x8a6a30 : 0x3a2a10);
      coneM.color.setHex(blk ? 0xffa020 : st.after ? (st.pass ? GREEN : RED) : 0xfff0c0);
      coneM.opacity = blk ? 0.12 * st.strobe : st.working ? 0.16 + 0.04 * Math.sin(t * 9) : st.after ? 0.14 : 0;
      sigLamp(st, lampM);
    },
  };
}

// ---------------------------------------------------------------------
// PERF: a stopwatch dyno. The capsule spins on two knurled rollers while the big stopwatch's hand sweeps toward
// the red line and the exhaust stack smokes. Fail = past the red line, the bezel glows red, black smoke;
// blocked = the hand flickers at the line, amber bezel.
// ---------------------------------------------------------------------
function devPerf(X) {
  const { K, P, T, DV, g, kit, THREE } = X;
  // the dyno bed: two knurled rollers along the lane, bearings, housing, exhaust
  K.box(0.7, 0.16, 0.44, P.iron, 0, 0.84, CAPZ, DV);
  K.box(0.74, 0.03, 0.48, P.brassD, 0, 0.935, CAPZ, DV);
  const dynT = kit.rollTex.clone(); dynT.needsUpdate = true;
  const dynM = K.mat(0xffffff, { map: dynT, shine: 50, spec: 0x707078 }); dynM.userData.noCast = true;
  for (const s of [-1, 1]) { const r = K.cyl(0.056, 0.056, 0.62, dynM, 10, 0, 0.944, CAPZ + s * 0.088, DV); r.rotation.z = Math.PI / 2; }
  for (const x of [-0.33, 0.33]) for (const s of [-1, 1]) K.box(0.05, 0.09, 0.08, P.brass, x, 0.95, CAPZ + s * 0.088, DV);
  K.tube([[0.34, 0.86, CAPZ - 0.18], [0.46, 0.95, 0.9], [0.5, 1.15, 0.6], [0.5, 1.3, 0.52]], 0.04, P.copper, DV, 12, 6);
  K.cyl(0.065, 0.055, 0.5, P.copperD, 10, 0.5, 1.55, 0.52, DV);
  for (const y of [1.36, 1.62]) K.cyl(0.075, 0.075, 0.04, P.brass, 10, 0.5, y, 0.52, DV);
  K.cyl(0.1, 0.065, 0.1, P.brassD, 10, 0.5, 1.85, 0.52, DV);
  K.cyl(0.11, 0.11, 0.025, P.brass, 10, 0.5, 1.91, 0.52, DV);
  // the stopwatch on its stand
  const WX = -0.06, WY = 2.0, WZ = -0.16, WR = 0.36;
  X.pillar(WX, WZ, WY - WR + 0.02, 0.14, 0.14, [0.8, 1.25], 0);
  K.box(0.26, 0.07, 0.12, P.brassD, WX, WY - WR - 0.04, WZ, DV);
  T.discZ(DV, WR, 0.14, P.brass, WX, WY, WZ, 28);
  T.discZ(DV, WR - 0.035, 0.02, P.cream, WX, WY, WZ + 0.072, 28);
  T.ringZ(DV, WR - 0.012, 0.03, P.brassL, WX, WY, WZ + 0.08, 28);
  K.cyl(0.045, 0.055, 0.09, P.brass, 10, WX, WY + WR + 0.045, WZ, DV);
  K.cyl(0.065, 0.065, 0.06, P.brassL, 10, WX, WY + WR + 0.12, WZ, DV);
  T.ringZ(DV, 0.085, 0.018, P.brassL, WX, WY + WR + 0.24, WZ, 14);
  for (const s of [-1, 1]) { const b = K.cyl(0.03, 0.03, 0.09, P.brass, 8, WX + s * 0.255, WY + 0.255, WZ, DV); b.rotation.z = -s * 0.785; }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const tk = K.box(0.016, i % 3 ? 0.035 : 0.065, 0.01, P.ink, WX + Math.sin(a) * (WR - 0.075), WY + Math.cos(a) * (WR - 0.075), WZ + 0.085, DV); tk.rotation.z = -a; }
  const RED_A = 2.15;
  { const z = K.torus(WR - 0.1, 0.026, P.red, 3, 10, WX, WY, WZ + 0.086, DV, 0.85); z.rotation.z = Math.PI / 2 - (RED_A + 0.85); }
  { const l = K.box(0.026, 0.12, 0.012, P.red, WX + Math.sin(RED_A) * (WR - 0.09), WY + Math.cos(RED_A) * (WR - 0.09), WZ + 0.09, DV); l.rotation.z = -RED_A; }
  T.ringZ(DV, 0.07, 0.009, P.ink, WX, WY - 0.14, WZ + 0.085, 12);
  K.box(0.22, 0.055, 0.01, kit.text('PERF', { bg: '#e4d2a8', fg: '#1e1408', pad: 1 }), WX, WY + 0.14, WZ + 0.085, DV);
  const lampM = T.lamp(DV, WX - 0.26, WY + 0.26, WZ, 0.045);
  const HAND = K.dyn(K.group(DV, WX, WY, WZ + 0.095));
  K.box(0.02, 0.3, 0.01, P.ink, 0, 0.12, 0, HAND);
  K.box(0.035, 0.07, 0.01, P.ink, 0, -0.045, 0, HAND);
  T.discZ(HAND, 0.03, 0.02, P.brass, 0, 0, 0.005, 8);
  const subH = K.dyn(K.group(DV, WX, WY - 0.14, WZ + 0.092));
  K.box(0.012, 0.06, 0.008, P.red, 0, 0.026, 0, subH);
  const ringM = K.glow(0xffa020, 0, true);
  T.ringZ(DV, WR + 0.04, 0.034, ringM, WX, WY, WZ + 0.09, 28).castShadow = false;
  X.plate('PERF', WX, 1.4, WZ + 0.085, 0.55);

  const v1 = new THREE.Vector3();
  let a = 0, spin = 0, tS = 0, sub = 0;
  return {
    update(st) {
      const { c, t, dt, blk } = st;
      let goal = 0;
      if (st.working) goal = 0.25 + st.wk * 1.5 + Math.sin(t * 30) * 0.02;
      else if (st.after) goal = st.pass ? 1.6 : 2.75 + Math.sin(t * 25) * 0.05;
      if (!blk) a += (goal - a) * Math.min(1, dt * (st.working ? 3 : 6));
      HAND.rotation.z = -(a + (blk ? (Math.sin(t * 40) > 0 ? 0.2 : -0.14) : 0));
      // the rollers and the capsule spin on the dyno
      const sg = blk ? 0 : st.working ? 1 : st.verdict ? 0.35 : 0;
      spin += (sg - spin) * Math.min(1, dt * 3);
      dynT.offset.x -= spin * dt * 3.2;
      sub += spin * dt * 9; subH.rotation.z = -sub;
      if (c.it && (c.ph === 'work' || c.ph === 'verdict')) c.roll += spin * dt * 13;
      else if (c.it) { const tgt = Math.round(c.roll / (Math.PI * 2)) * Math.PI * 2; c.roll += (tgt - c.roll) * Math.min(1, dt * 8); }
      const hot = st.after && !st.pass;
      ringM.color.setHex(blk ? 0xffa020 : hot ? RED : GREEN);
      ringM.opacity = blk ? 0.35 + 0.35 * st.strobe : hot ? (blink(t, 14) ? 0.7 : 0.25) : st.after ? 0.4 * Math.max(0, 1 - c.pt) : 0;
      sigLamp(st, lampM);
      tS -= dt;
      if (tS <= 0 && (spin > 0.3 || hot || blk)) {
        tS = hot ? 0.06 : 0.11; X.gl(0.5, 1.92, 0.52, v1);
        K.spawn(g, v1.x, v1.y, v1.z, K.R() * 0.3, 0.9 + Math.random() * 0.4, K.R() * 0.3, hot ? 0x1a1410 : blk ? 0xd4ccbc : Math.random() < 0.5 ? 0x6a6058 : 0x8a8078, 1.2, hot ? 0.12 : 0.08, -0.15);
      }
    },
  };
}

// ---------------------------------------------------------------------
// VISUAL: a bellows camera on a tripod photographs the capsule's UI under a magnesium flash; the print develops on
// the tall easel next to the old one. Fail = red X on the new print; blocked = the flash strobes amber, "?".
// ---------------------------------------------------------------------
function devVisual(X) {
  const { K, P, T, DV, g, kit, THREE } = X;
  // tripod (right) and the camera aimed at the capsule
  const TX = 0.46, TZ = 0.02, TY = 1.62, CY = 1.84;
  for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * Math.PI * 2 / 3; rod(K, DV, [TX, TY, TZ], [TX + Math.cos(a) * 0.27, 0.29, TZ + Math.sin(a) * 0.27], 0.02, P.wood, 5); }
  K.box(0.14, 0.06, 0.14, P.brassD, TX, TY + 0.02, TZ, DV);
  K.cyl(0.03, 0.03, 0.14, P.brass, 8, TX, TY + 0.11, TZ, DV);
  const CAMG = K.group(DV, TX, CY, TZ); CAMG.rotation.order = 'YXZ';
  { const dx = -TX, dy = 1.25 - CY, dz = CAPZ - TZ; CAMG.rotation.y = Math.atan2(dx, dz); CAMG.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)); }
  K.box(0.28, 0.28, 0.26, P.wood, 0, 0, -0.06, CAMG);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) K.box(0.024, 0.024, 0.27, P.brassL, sx * 0.135, sy * 0.135, -0.06, CAMG);
  for (let i = 0; i < 4; i++) { const s = 0.25 - i * 0.03; K.box(s, s, 0.065, i % 2 ? P.ink : P.leather, 0, 0, 0.1 + i * 0.07, CAMG); }
  K.box(0.18, 0.18, 0.03, P.woodD, 0, 0, 0.39, CAMG);
  { const l = K.cyl(0.06, 0.066, 0.13, P.brass, 10, 0, 0, 0.46, CAMG); l.rotation.x = Math.PI / 2; }
  T.ringZ(CAMG, 0.062, 0.013, P.brassL, 0, 0, 0.525, 12);
  T.discZ(CAMG, 0.054, 0.01, P.glass, 0, 0, 0.53, 12).castShadow = false;
  K.box(0.32, 0.32, 0.06, P.soot, 0, 0.01, -0.22, CAMG);
  const lampM = T.lamp(CAMG, 0.0, 0.17, -0.02, 0.038);
  // the flash pan held up on a rod
  const FX = TX - 0.14, FY = 2.5, FZ = TZ + 0.08;
  rod(K, DV, [TX - 0.03, CY + 0.12, TZ - 0.04], [FX, FY - 0.02, FZ], 0.015, P.steel);
  K.box(0.3, 0.025, 0.11, P.brassD, FX, FY, FZ, DV);
  K.box(0.24, 0.012, 0.07, P.cream, FX, FY + 0.017, FZ, DV);
  { const r = K.cyl(0.15, 0.15, 0.01, P.steel, 12, FX, FY + 0.09, FZ - 0.05, DV); r.rotation.x = Math.PI / 2 - 0.3; }
  const flashM = K.glow(0xffffff, 0, true);
  K.sph(0.18, flashM, FX, FY + 0.05, FZ + 0.02, DV, 10, 8).castShadow = false;
  const flash2M = K.glow(0xfff4d0, 0, true);
  K.sph(0.58, flash2M, FX, FY, FZ + 0.02, DV, 12, 8).castShadow = false;
  // the tall easel (left) with the old print and the new one
  const EX = -0.27, EZ = -0.16, EY = 1.78;
  rod(K, DV, [EX - 0.22, 0.29, EZ + 0.1], [EX - 0.05, 2.34, EZ - 0.08], 0.02, P.wood, 5);
  rod(K, DV, [EX + 0.22, 0.29, EZ + 0.1], [EX + 0.05, 2.34, EZ - 0.08], 0.02, P.wood, 5);
  rod(K, DV, [EX, 0.29, EZ - 0.42], [EX, 2.2, EZ - 0.09], 0.018, P.woodD, 5);
  K.box(0.5, 0.045, 0.1, P.wood, EX, EY - 0.38, EZ + 0.02, DV);
  K.box(0.16, 0.05, 0.05, P.woodD, EX, EY + 0.37, EZ - 0.03, DV);
  X.plate('VISUAL', EX, EY + 0.47, EZ - 0.05, 0.5);
  const PB = K.group(DV, EX, EY, EZ - 0.02); PB.rotation.x = -0.1;
  K.box(0.5, 0.7, 0.025, P.woodD, 0, 0, 0, PB);
  const PW = 36, PH = 54;
  let pctx = null;
  const photoT = K.canvasTex(PW, PH, (cx) => { pctx = cx; });
  const photoM = new THREE.MeshBasicMaterial({ map: photoT, fog: false, color: 0xb0b0b0 });
  K.box(0.44, 0.66, 0.01, photoM, 0, 0, 0.015, PB);
  for (const s of [-1, 1]) K.box(0.04, 0.04, 0.03, P.brassL, s * 0.2, 0.31, 0.02, PB);
  const ui = (cx, x, y, moved, a) => {
    cx.globalAlpha = a; cx.fillStyle = '#1a2230'; cx.fillRect(x, y, 30, 20); cx.fillStyle = '#4a6a9a'; cx.fillRect(x, y, 30, 4);
    cx.fillStyle = '#8a9ab0'; cx.fillRect(x + 3, y + 7, 18, 2); cx.fillRect(x + 3, y + 11, 12, 2);
    cx.fillStyle = '#e0a020'; cx.fillRect(moved ? x + 3 : x + 19, moved ? y + 15 : y + 14, 8, 4); cx.globalAlpha = 1;
  };
  let pKey = '';
  const drawPhoto = (mode, k) => {
    const key = mode + (mode === 'dev' ? Math.floor(k * 4) : ''); if (key === pKey) return; pKey = key;
    const cx = pctx;
    cx.fillStyle = '#d8cca8'; cx.fillRect(0, 0, PW, PH); cx.fillStyle = '#8a7a5a'; cx.fillRect(0, 0, PW, 1); cx.fillRect(0, PH - 1, PW, 1);
    ui(cx, 3, 4, false, 1);
    cx.fillStyle = '#2a2018'; cx.fillRect(3, 29, 30, 20);
    if (mode !== 'idle') ui(cx, 3, 29, true, mode === 'dev' ? Math.min(1, 0.25 + Math.floor(k * 4) / 4) : 1);
    cx.fillStyle = '#5a4a32'; cx.fillRect(3, 26, 30, 1);
    if (mode === 'pass') { cx.fillStyle = '#20c858'; for (let i = 0; i < 5; i++) cx.fillRect(10 + i, 38 + i, 3, 3); for (let i = 0; i < 9; i++) cx.fillRect(14 + i, 42 - i, 3, 3); }
    if (mode === 'fail') { cx.fillStyle = '#e83020'; for (let i = 0; i < 14; i++) { cx.fillRect(11 + i, 32 + i, 3, 3); cx.fillRect(24 - i, 32 + i, 3, 3); } }
    if (mode === 'block') glyph(cx, '?', 13, 31, '#ffb020', 3);
    photoT.needsUpdate = true;
  };
  drawPhoto('idle', 0);

  const v1 = new THREE.Vector3();
  let flashK = 0, shots = 0, devK = 0, tB = 0;
  const pop = () => {
    flashK = 1; X.gl(FX, FY + 0.05, FZ + 0.02, v1);
    for (let i = 0; i < 10; i++) K.spawn(g, v1.x, v1.y, v1.z, K.R() * 1.6, 0.4 + Math.random() * 1.2, K.R() * 1.6, Math.random() < 0.5 ? 0xffffff : 0xfff4c0, 0.4, 0.04, 2, true);
    for (let i = 0; i < 4; i++) T.puff(v1.x, v1.y + 0.05, v1.z, 0xd8d0c4, 0.12, 0.5, 0.1, 1.6);
  };
  return {
    onTake() { shots = 0; devK = 0; },
    update(st) {
      const { c, t, dt, blk } = st;
      if (!blk) {
        if (st.working) { const n = Math.floor((c.pt - 0.55) / 0.6) + 1; if (c.pt >= 0.55 && shots < n) { shots = n; pop(); } }
        flashK = Math.max(0, flashK - dt * 4);
        if (shots > 0 && c.it) devK = Math.min(1, devK + dt / 0.7);
      }
      flashM.color.setHex(blk ? 0xffa020 : 0xffffff); flash2M.color.setHex(blk ? 0xffa020 : 0xfff4d0);
      flashM.opacity = blk ? 0.15 + 0.55 * (Math.sin(t * 9) > 0 ? 1 : 0) : flashK;
      flash2M.opacity = blk ? 0.08 * (Math.sin(t * 9) > 0 ? 1 : 0) : flashK * 0.35;
      photoM.color.setHex(flashK > 0.3 ? 0xffffff : st.lightK > 0.5 || blk ? 0xe8e8e8 : 0xb0b0b0);
      if (blk) { tB -= dt; if (tB <= 0) { tB = 0.11; X.gl(FX, FY + 0.07, FZ + 0.02, v1); K.spawn(g, v1.x, v1.y, v1.z, K.R() * 0.5, 0.6, K.R() * 0.5, 0xffb020, 0.4, 0.035, 0, true); } }
      if (blk) drawPhoto('block', 0);
      else if (st.after) drawPhoto(st.pass ? 'pass' : 'fail', 0);
      else if (c.it && shots > 0) drawPhoto('dev', devK);
      else drawPhoto('idle', 0);
      sigLamp(st, lampM);
    },
  };
}

// ---------------------------------------------------------------------
// CANARY: a brass cage hangs from a tall hook stand; the canary hops and sings while the rollout gas from the
// capsule drifts up to it and the ROLLOUT gauge fills. Fail = the canary keels over and the gauge rolls back;
// blocked = frantic flapping, feathers flying, the cage swinging.
// ---------------------------------------------------------------------
function devCanary(X) {
  const { K, P, T, DV, g, kit, THREE } = X;
  const SX = 0.48, SZ = -0.12, HX = 0.0, HZ = 0.14, HY = 2.66;
  // the hook stand
  X.pillar(SX, SZ, HY + 0.12, 0.1, 0.1, [0.8, 1.45, 2.2], 0);
  K.tube([[SX, HY + 0.1, SZ], [SX - 0.06, HY + 0.25, SZ + 0.06], [HX + 0.22, HY + 0.27, HZ - 0.02], [HX + 0.02, HY + 0.15, HZ]], 0.032, P.ironM, DV, 12, 6);
  K.sph(0.05, P.brassL, SX, HY + 0.12, SZ, DV, 8, 6);
  rod(K, DV, [HX + 0.02, HY + 0.15, HZ], [HX, HY + 0.03, HZ], 0.013, P.brassD, 4);
  X.plate('CANARY', SX, 1.2, SZ + 0.065, 0.5);
  const roll = T.gauge(DV, SX, 1.7, SZ + 0.06, 0.12, 0, 0);
  K.box(0.2, 0.045, 0.01, kit.text('ROLLOUT', { bg: '#e4d2a8', fg: '#1e1408', pad: 1 }), SX, 1.5, SZ + 0.06, DV);
  const lampM = T.lamp(DV, SX, 2.0, SZ + 0.06, 0.045);
  K.box(0.07, 0.07, 0.06, P.brassD, SX, 2.0, SZ + 0.03, DV);
  // the cage (swings on the hook)
  const CAGE = K.dyn(K.group(DV, HX, HY, HZ));
  const CR = 0.25, CB = -0.92, CT = -0.42;
  K.torus(0.045, 0.013, P.brassL, 4, 10, 0, -0.03, 0, CAGE);
  K.cyl(0.035, 0.05, 0.07, P.brass, 8, 0, CT + CR + 0.01, 0, CAGE);
  for (let i = 0; i < 4; i++) { const r = K.torus(CR, 0.011, P.brass, 3, 14, 0, CT, 0, CAGE, Math.PI); r.rotation.y = i * Math.PI / 4; }
  for (const y of [CB + 0.035, CB + 0.26, CT]) { const r = K.torus(CR, y === CT ? 0.016 : 0.011, P.brass, 3, 18, 0, y, 0, CAGE); r.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.011, CT - CB, 0.011, P.brassL, Math.cos(a) * CR, (CT + CB) / 2, Math.sin(a) * CR, CAGE); }
  K.cyl(CR + 0.014, CR + 0.035, 0.07, P.brassD, 16, 0, CB, 0, CAGE);
  K.cyl(CR - 0.01, CR - 0.01, 0.01, P.paper, 14, 0, CB + 0.037, 0, CAGE);
  { const p = K.cyl(0.013, 0.013, CR * 1.9, P.wood, 6, 0, CB + 0.22, 0, CAGE); p.rotation.z = Math.PI / 2; }
  K.cyl(0.04, 0.034, 0.045, P.brassL, 8, 0.12, CB + 0.06, 0.1, CAGE);
  // the canary
  const yel = kit.pal(0xf4cf2a, 0.5), yelD = kit.pal(0xc89a18, 0.2);
  const BIRD = K.dyn(K.group(CAGE, 0.02, CB + 0.232, 0)); BIRD.scale.setScalar(1.35);
  const BB = K.dyn(K.group(BIRD));
  { const b = K.sph(0.055, yel, 0, 0.065, 0, BB, 10, 8); b.scale.set(1.35, 1, 0.95); }
  K.sph(0.04, yel, 0.06, 0.115, 0, BB, 8, 6);
  { const bk = K.cone(0.015, 0.04, kit.pal(0xe07a20, 0.3), 6, 0.11, 0.112, 0, BB); bk.rotation.z = -Math.PI / 2; }
  for (const s of [-1, 1]) K.box(0.012, 0.012, 0.006, P.ink, 0.075, 0.125, s * 0.034, BB);
  { const tl = K.box(0.08, 0.012, 0.04, yelD, -0.09, 0.06, 0, BB); tl.rotation.z = 0.35; }
  for (const s of [-1, 1]) K.box(0.006, 0.03, 0.006, P.ink, 0.0, 0.01, s * 0.02, BB);
  const beak = T.marker(BB, 0.13, 0.115, 0);
  const WING = K.dyn(K.group(BB, 0.0, 0.09, 0.045));
  K.box(0.085, 0.012, 0.05, yelD, -0.025, 0, 0.0, WING);

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  let keel = 0, tN = 0, tG = 0, tF = 0, sing = 0, sway = 0, swayV = 0, jx = 0, jy = 0, rk = 0;
  const cb = CB + 0.232;
  return {
    onTake() { keel = 0; },
    onVerdict(v) { if (v.pass) sing = 1.2; },
    update(st) {
      const { c, t, dt, blk } = st;
      const dead = st.after && !st.pass;
      keel += ((dead && (c.pt > 0.15 || c.ph !== 'verdict') ? 1 : 0) - keel) * Math.min(1, dt * 6);
      if (!c.it) keel = Math.max(0, keel - dt * 2);
      sing = Math.max(0, sing - dt);
      const lively = st.working || sing > 0;
      // hop, turn, sing; keel over on a fail; flap wildly round the cage when blocked
      if (blk) { if (Math.random() < dt * 6) { jx = K.R() * 0.2; jy = Math.random() * 0.24; } }
      else { jx += (0 - jx) * Math.min(1, dt * 6); jy += (0 - jy) * Math.min(1, dt * 6); }
      const hop = keel > 0.5 ? 0 : blk ? Math.abs(Math.sin(t * 19)) * 0.05 : lively ? Math.abs(Math.sin(t * 9)) * 0.035 : Math.sin(t * 1.3) > 0.93 ? Math.abs(Math.sin(t * 12)) * 0.03 : 0;
      BIRD.position.set(0.02 + jx, cb + hop + jy - keel * 0.18, 0);
      BIRD.rotation.y = blk ? Math.sin(t * 7) * 1.2 : keel > 0.5 ? 0.3 : lively ? (Math.floor(t * 1.4) % 2 ? -0.5 : Math.PI + 0.5) : -0.35;
      BB.rotation.z = keel * 2.5;
      WING.rotation.x = blk ? -0.4 - Math.abs(Math.sin(t * 38)) * 1.0 : lively && hop > 0.02 ? -0.5 : 0;
      // the cage sways (hard when blocked)
      const push = blk ? Math.sin(t * 6.5) * 0.12 : lively ? Math.sin(t * 2.2) * 0.02 : 0;
      swayV += ((push - sway) * 30 - swayV * 3) * Math.min(dt, 0.05); sway += swayV * Math.min(dt, 0.05);
      CAGE.rotation.z = sway;
      // the rollout gauge: fills while the canary breathes the gas, rolls back on a fail
      const rg = blk ? 0.5 + Math.sin(t * 31) * 0.03 : st.working ? st.wk : st.after ? (st.pass ? 1 : 0) : 0;
      rk += (rg - rk) * Math.min(1, dt * (dead ? 6 : 3));
      roll.rotation.z = 2.1 - rk * 3.3;
      tN -= dt;
      if (lively && !blk && keel < 0.2 && tN <= 0) { tN = sing > 0 ? 0.07 : 0.22; T.at(beak, v1); K.spawn(g, v1.x, v1.y, v1.z, K.R() * 0.5, 0.5 + Math.random() * 0.4, K.R() * 0.5, Math.random() < 0.5 ? 0xffe060 : 0xffffff, 0.9, 0.035, -0.2, true); }
      // the rollout gas drifts from the capsule up to the cage
      tG -= dt;
      if (st.working && tG <= 0) { tG = 0.09; X.gl(K.R() * 0.4, 1.36, CAPZ + K.R() * 0.1, v1); X.gl(HX, HY + CB + 0.3, HZ, v2); const tt = 1.1; K.spawn(g, v1.x, v1.y, v1.z, (v2.x - v1.x) / tt, (v2.y - v1.y) / tt, (v2.z - v1.z) / tt, Math.random() < 0.5 ? 0xa8b890 : 0x8a9a78, tt, 0.06, -0.05); }
      // feathers when it panics
      tF -= dt;
      if (blk && tF <= 0) { tF = 0.1; T.at(beak, v1); K.spawn(g, v1.x, v1.y, v1.z, K.R() * 0.9, 0.2 + Math.random() * 0.4, K.R() * 0.9, Math.random() < 0.6 ? 0xf4cf2a : 0xffffff, 1.4, 0.03, 0.5); }
      sigLamp(st, lampM);
    },
  };
}

// ---------------------------------------------------------------------
// GENERIC (an unknown check): a probe on an arm taps the capsule, a big gauge on the column reads it.
// ---------------------------------------------------------------------
function devGeneric(X) {
  const { K, P, T, DV } = X;
  const PX = 0.36, PZ = -0.1;
  X.pillar(PX, PZ, 2.2, 0.16, 0.16, [0.8, 1.5], 0);
  beam(K, DV, [PX, 2.1, PZ], [0, 2.1, CAPZ], 0.12, 0.14, P.ironM);
  K.box(0.22, 0.22, 0.22, P.brassD, 0, 2.06, CAPZ, DV);
  const PRB = K.dyn(K.group(DV, 0, 1.95, CAPZ));
  K.cyl(0.022, 0.022, 0.4, P.steel, 6, 0, -0.2, 0, PRB);
  const tipM = K.glow(0x2a1e0e);
  K.sph(0.04, tipM, 0, -0.42, 0, PRB, 8, 6);
  const ndl = T.gauge(DV, -0.25, 1.8, -0.2, 0.22, 0, 0);
  K.box(0.12, 1.3, 0.12, P.iron, -0.25, 1.0, -0.3, DV);
  X.plate('CHECK', -0.25, 2.14, -0.2, 0.55);
  const lampM = T.lamp(DV, PX, 2.32, PZ, 0.05);
  let k = 0;
  return {
    update(st) {
      const { c, t, dt, blk } = st;
      if (!blk) k += ((st.working ? 0.5 + 0.5 * Math.abs(Math.sin(c.pt * 5)) : 0) - k) * Math.min(1, dt * 8);
      PRB.position.y = 1.95 - 0.16 * k;
      tipM.color.setHex(eyeCol(st));
      ndl.rotation.z += ((blk ? -1.2 + Math.sin(t * 33) * 0.08 : st.after ? (st.pass ? 0 : -1.4) : st.working ? 0.8 - st.wk * 1.2 : 1.0) - ndl.rotation.z) * Math.min(1, dt * 6);
      sigLamp(st, lampM);
    },
  };
}

// =====================================================================
// INSTALL
// =====================================================================
export default function install(IRON) {
  // one palette per IRON instance (the K each machine gets is a per-module child of the instance's kit)
  const KITS = new WeakMap();
  const kit = (K) => { const base = Object.getPrototypeOf(K) || K; if (!KITS.has(base)) KITS.set(base, makeKit(K)); return KITS.get(base); };
  const fin = (K, build) => (M) => { const kt = kit(K); const m = build(K, M, kt); kt.atlasify(m.g); kt.shade(m.g); return m; };
  IRON.machine('ci', (K, M) => fin(K, buildCI)(M));
  IRON.machine('check', (K, M) => fin(K, buildCheck)(M));
  IRON.machine('verify', (K, M) => fin(K, buildVerify)(M));
  IRON.machine('review', (K, M) => fin(K, buildReview)(M));
  IRON.machine('gate', (K, M) => fin(K, buildGate)(M));
}
