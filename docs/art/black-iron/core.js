// =====================================================================
// IRON LINE CORE  (owned by the integrator; module agents: read, don't edit)
// The Black Iron factory as a real line: work items are simulated, ride paths,
// get handed between stations through fixed ports, and stall on decisions.
// Modules plug in with IRON.world / IRON.underside / IRON.belts / IRON.machine / IRON.carrier.
// All positions are ROOT-LOCAL: +x runs left->right on screen, +z toward the viewer, +y up.
// Machines are built in their own LOCAL frame (seen from a 45deg corner, +x and +z faces visible);
// convert with M.toRoot(x,y,z). See CONTRACT.md for the full contract.
// =====================================================================
window.IRON = (function () {
  'use strict';
  const THREE = window.THREE;
  const V3 = THREE.Vector3;
  const I = {
    mods: { world: null, underside: null, belts: null, machines: {} },
    carriers: {}, paths: {}, pathList: [], items: [], stations: {}, log: [], listeners: {},
    counters: { mined: 0, shipped: 0, rework: 0, decisions: 0 },
    policy: { intake: true, autoResolve: true, autoResolveAfter: 9, speed: 1, events: true },
    CFG: {
      spawnEvery: [8, 12], gap: 0.85, rejectRate: 0.28, rejectRateRetry: 0.08,
      decisionChance: { assembler: 0.07, splitter: 0.06, launch: 0.18 }
    },
    LOOK: {
      sky: { top: '#140c08', bottom: '#5a2a12', fog: '#2a1810', fogNear: 70, fogFar: 140 },
      light: { sun: 0xffb070, sunI: 1.05, sunDir: [-10, 22, 14], hemiSky: 0xc8a888, hemiGnd: 0x3a2a1e, hemiI: 0.95 },
      finish: { levels: 48, dither: 0.1, outline: 0.5, thresh: 0.08, ink: '#0a0504', sat: 0.98, contrast: 1.06, bloom: 0.75, bloomThresh: 0.6, vignette: 0.3, grade: 0.32, shadow: '#1e1630', high: '#ffd29a', scan: 0 }
    }
  };
  I.world = (fn) => (I.mods.world = fn);
  I.underside = (fn) => (I.mods.underside = fn);
  I.belts = (fn) => (I.mods.belts = fn);
  I.machine = (id, fn) => (I.mods.machines[id] = fn);
  I.carrier = (name, fn) => (I.carriers[name] = { make: fn });
  I.look = (cfg) => { for (const k in cfg) I.LOOK[k] = Object.assign({}, I.LOOK[k] || {}, cfg[k]); };
  I.on = (ev, fn) => ((I.listeners[ev] = I.listeners[ev] || []).push(fn));
  I.emit = (ev, d) => (I.listeners[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

  // =====================================================================
  // KIT (same as the diorama kit, plus bake / caution / statusLamp / sign)
  // =====================================================================
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const cache = {};
  function mat(c, o) {
    const plain = o === undefined && typeof c === 'number';
    if (plain && cache[c]) return cache[c];
    o = o || {};
    const m = new THREE.MeshPhongMaterial({
      color: c, emissive: o.e || 0, emissiveIntensity: o.ei === undefined ? 1 : o.ei,
      flatShading: o.flat !== false, shininess: o.shine || 0, specular: o.spec === undefined ? (o.shine ? 0x333333 : 0) : o.spec,
      transparent: o.op !== undefined, opacity: o.op === undefined ? 1 : o.op, side: o.double ? THREE.DoubleSide : THREE.FrontSide, map: o.map || null
    });
    if (o.depthWrite === false) m.depthWrite = false;
    if (plain) cache[c] = m;
    return m;
  }
  const glow = (c, op, add) => new THREE.MeshBasicMaterial({ color: c, transparent: op !== undefined || !!add, opacity: op === undefined ? 1 : op, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add, fog: false });
  function mesh(geo, m, x, y, z, p) {
    const o = new THREE.Mesh(geo, typeof m === 'number' ? mat(m) : m);
    o.position.set(x || 0, y || 0, z || 0);
    const mm = Array.isArray(o.material) ? o.material[0] : o.material;
    const lit = !mm.isMeshBasicMaterial;
    o.castShadow = lit && !mm.transparent; o.receiveShadow = lit;
    if (p) p.add(o); return o;
  }
  const box = (w, h, d, m, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, p);
  const cyl = (a, b, h, m, s, x, y, z, p) => mesh(new THREE.CylinderGeometry(a, b, h, s || 10), m, x, y, z, p);
  const cone = (r, h, m, s, x, y, z, p) => mesh(new THREE.ConeGeometry(r, h, s || 10), m, x, y, z, p);
  const sph = (r, m, x, y, z, p, ws, hs) => mesh(new THREE.SphereGeometry(r, ws || 10, hs || 8), m, x, y, z, p);
  const torus = (r, t, m, rs, ts, x, y, z, p, arc) => mesh(new THREE.TorusGeometry(r, t, rs || 6, ts || 16, arc || Math.PI * 2), m, x, y, z, p);
  const rock = (r, m, x, y, z, p, detail) => mesh(new THREE.DodecahedronGeometry(r, detail || 0), m, x, y, z, p);
  const group = (p, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (p) p.add(g); return g; };
  function lathe(points, m, seg, x, y, z, p) {
    const mm = typeof m === 'number' ? mat(m, { double: true }) : m;
    return mesh(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), seg || 16), mm, x, y, z, p);
  }
  function tube(points, r, m, p, seg, radial) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new V3(x, y, z)));
    return mesh(new THREE.TubeGeometry(curve, seg || 24, r, radial || 6, false), m, 0, 0, 0, p);
  }
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat[0], repeat[1]); return t;
  }
  // particles
  const fx = []; const fxGeo = new THREE.BoxGeometry(1, 1, 1);
  function spawn(p, x, y, z, vx, vy, vz, color, life, size, grav, add) {
    if (fx.length > 1100) return null;
    const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add, fog: !add }));
    m.position.set(x, y, z); m.scale.setScalar(size); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); p.add(m);
    const f = { m, p, vx, vy, vz, life, max: life, grav, size }; fx.push(f); return f;
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt;
      if (f.life <= 0 || !f.p.parent) { f.p.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); continue; }
      f.vy -= f.grav * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
      const k = f.life / f.max; f.m.material.opacity = Math.min(1, k * 1.6);
      if (f.grav < 0) f.m.scale.setScalar(f.size * (1 + (1 - k) * 1.5));
    }
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const clamp01 = (k) => Math.max(0, Math.min(1, k));
  function keyframes(frames, p) {
    for (let i = 0; i < frames.length - 1; i++) { const a = frames[i], b = frames[i + 1]; if (p <= b[0]) { const k = smooth((p - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, j) => lerp(v, b[j + 1], k)); } }
    return frames[frames.length - 1].slice(1);
  }
  function link(m, ax, ay, bx, by) { m.position.x = (ax + bx) / 2; m.position.y = (ay + by) / 2; m.rotation.z = Math.atan2(by - ay, bx - ax); m.scale.x = Math.hypot(bx - ax, by - ay); }
  const R = () => Math.random() - 0.5;

  // bake: merge every static mesh under `grp` that shares a material into one mesh (cuts draw calls).
  // Only call on groups that never move internally. Basic (glow) and transparent meshes are merged too,
  // but meshes with array materials are skipped. Returns the number of meshes removed.
  function bake(grp) {
    grp.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
    const buckets = new Map(); const kill = [];
    grp.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || o.userData.noBake) return;
      const g = o.geometry; if (!g.attributes.position || !g.attributes.normal) return;
      const key = o.material.uuid + '|' + (g.attributes.uv ? 1 : 0) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, list: [], cast: o.castShadow, recv: o.receiveShadow, uv: !!g.attributes.uv });
      buckets.get(key).list.push(o); kill.push(o);
    });
    let removed = 0;
    const mtx = new THREE.Matrix4();
    buckets.forEach((b) => {
      if (b.list.length < 2) { kill.splice(kill.indexOf(b.list[0]), 1); return; }
      let n = 0; const geos = b.list.map((o) => { mtx.multiplyMatrices(inv, o.matrixWorld); const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); g.applyMatrix4(mtx); n += g.attributes.position.count; return g; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = b.uv ? new Float32Array(n * 2) : null; let off = 0;
      geos.forEach((g) => { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); if (uv) uv.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; g.dispose(); });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const m = new THREE.Mesh(geo, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; grp.add(m); removed += b.list.length - 1;
    });
    kill.forEach((o) => o.parent && o.parent.remove(o));
    return removed;
  }

  // hazard stripes + "!" sign texture (shared)
  let SIGN = null;
  function signTex() {
    if (SIGN) return SIGN;
    SIGN = canvasTex(32, 32, (g) => {
      g.fillStyle = '#16100a'; g.fillRect(0, 0, 32, 32);
      for (let i = -32; i < 64; i += 8) { g.fillStyle = '#f2b21a'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 4, 0); g.lineTo(i + 4 - 32, 32); g.lineTo(i - 32, 32); g.fill(); }
      g.fillStyle = '#16100a'; g.fillRect(4, 4, 24, 24);
      g.fillStyle = '#ffc21a'; g.beginPath(); g.moveTo(16, 6); g.lineTo(27, 26); g.lineTo(5, 26); g.closePath(); g.fill();
      g.fillStyle = '#16100a'; g.fillRect(15, 11, 3, 9); g.fillRect(15, 22, 3, 3);
    });
    return SIGN;
  }
  // CAUTION BEACON: a hazard post with a rotating amber beacon and a "!" sign that flips up when BLOCKED,
  // plus a pinging ring on the floor. Every machine places one where it's easy to see.
  function caution(p, x, y, z, s) {
    s = (s || 1) * 1.3;
    const g = group(p, x, y, z); g.scale.setScalar(s);
    const iron = mat(0x2b2520, { shine: 20 });
    cyl(0.07, 0.09, 1.5, iron, 8, 0, 0.75, 0, g);
    for (let i = 0; i < 5; i++) cyl(0.095, 0.095, 0.14, mat(i % 2 ? 0x16120c : 0xe0a018), 8, 0, 0.18 + i * 0.28, 0, g);
    cyl(0.16, 0.18, 0.08, iron, 10, 0, 1.52, 0, g);
    const lampMat = mat(0x5a3a08, { e: 0 });
    const lampSpin = group(g, 0, 1.68, 0);
    box(0.2, 0.16, 0.08, lampMat, 0.06, 0, 0, lampSpin);
    const dome = sph(0.16, glow(0xffb020, 0.35), 0, 1.68, 0, g, 10, 8); dome.castShadow = false;
    const capM = mat(0x3a332c); cyl(0.1, 0.12, 0.05, capM, 8, 0, 1.86, 0, g);
    const hinge = group(g, 0, 1.2, 0.1);
    const sm = mat(0xffffff, { map: signTex(), e: 0x000000 }); const signM = sm;
    const sign = box(0.62, 0.62, 0.05, signM, 0, 0.36, 0, hinge);
    const ring = torus(0.6, 0.05, glow(0xffb020, 0.8, true), 4, 28, 0, 0.06, 0, g); ring.rotation.x = Math.PI / 2; ring.visible = false;
    const ring2 = torus(0.6, 0.04, glow(0xff4020, 0.7, true), 4, 28, 0, 0.07, 0, g); ring2.rotation.x = Math.PI / 2; ring2.visible = false;
    let fold = 1;
    return { g, update(t, dt, state) {
      const blk = state === 'BLOCKED';
      lampSpin.rotation.y += dt * (blk ? 9 : 0);
      const on = blk && Math.sin(t * 12) > -0.2;
      lampMat.emissive.setHex(blk ? (on ? 0xffa010 : 0x401800) : 0);
      dome.material.color.setHex(blk ? (Math.sin(t * 6) > 0 ? 0xffb020 : 0xff4a10) : 0x6a4a10);
      dome.material.opacity = blk ? 0.55 : 0.25;
      fold += ((blk ? 0 : 1) - fold) * Math.min(1, dt * 6);
      hinge.rotation.x = -fold * 1.45;
      signM.emissive.setHex(blk && Math.sin(t * 6) > 0 ? 0x3a2a00 : 0);
      ring.visible = ring2.visible = blk;
      if (blk) {
        const k = (t * 0.9) % 1, k2 = (t * 0.9 + 0.5) % 1;
        ring.scale.setScalar(0.4 + k * 2.6); ring.material.opacity = 0.9 * (1 - k);
        ring2.scale.setScalar(0.4 + k2 * 2.6); ring2.material.opacity = 0.7 * (1 - k2);
      }
    } };
  }
  // STATUS LAMP: green WORKING / amber IDLE / red BLOCKED (blinks), with a brass cap
  function statusLamp(p, x, y, z, s) {
    const g = group(p, x, y, z); g.scale.setScalar(s || 1);
    cyl(0.04, 0.04, 0.4, mat(0x2b2520), 6, 0, 0.2, 0, g);
    const defs = [['WORKING', 0x30ff80, 0x0c2a14], ['IDLE', 0xffb030, 0x2a1c08], ['BLOCKED', 0xff3020, 0x2a0a08]];
    const L = defs.map(([k, on, off], i) => { const m = mat(off, { e: 0 }); box(0.2, 0.15, 0.2, m, 0, 0.5 + i * 0.17, 0, g); return { k, on, m }; });
    cyl(0.14, 0.12, 0.05, mat(0x8a6428, { shine: 30 }), 8, 0, 0.98, 0, g);
    return { g, set(state, t) { L.forEach((l) => l.m.emissive.setHex(l.k === state && (state !== 'BLOCKED' || Math.sin((t || 0) * 10) > 0) ? l.on : 0)); } };
  }

  const K = { THREE, rnd, R, mat, glow, mesh, box, cyl, cone, sph, torus, rock, group, lathe, tube, canvasTex, spawn, lerp, smooth, clamp01, keyframes, link, bake, caution, statusLamp, signTex, v3: new V3() };
  I.K = K;
  I._fx = updateFx;
  // point lights: 10 for the whole scene, split by module
  const LIGHT_QUOTA = { world: 3, underside: 3, belts: 0, assembler: 1, splitter: 1, launch: 2, core: 0 };
  function kitFor(mod) {
    const k = Object.create(K); let used = 0;
    k.light = (color, intensity, dist, x, y, z, p) => {
      if (used >= (LIGHT_QUOTA[mod] || 0)) return { intensity: 0, color: new THREE.Color(), position: new V3(), isDummy: true };
      used++; const l = new THREE.PointLight(color, intensity, dist || 8, 2); l.position.set(x || 0, y || 0, z || 0); if (p) p.add(l); return l;
    };
    return k;
  }

  // =====================================================================
  // GEOMETRY CONTRACT: slots, ports, paths (root-local)
  // =====================================================================
  const C45 = Math.SQRT1_2;
  const SLOTS = { assembler: -10, splitter: 0, launch: 10 };
  I.SLOTS = SLOTS;
  const toRoot = (sx, x, y, z, out) => (out || new V3()).set(sx + C45 * (x - z), y, C45 * (x + z));
  const dirToRoot = (dx, dz) => [C45 * (dx - dz), C45 * (dx + dz)];
  I.toRoot = toRoot;
  // ports: machine-LOCAL position where an item waits / is handed over, and the local outward direction
  const PORTS = {
    assembler: { in: { p: [-0.5, 1.0, 2.9], out: [0, 1] }, out: { p: [-1.1, 4.45, -1.1], out: [0, 0] } },
    splitter: { in: { p: [-1.2, 1.0, 2.9], out: [0, 1] }, pass: { p: [2.9, 1.0, -0.9], out: [1, 0] }, reject: { p: [-2.9, 1.0, 0.9], out: [-1, 0] } },
    launch: { in: { p: [-0.6, 1.0, 2.9], out: [0, 1] } }
  };
  I.PORTS = PORTS;
  const P = {};
  for (const id in PORTS) for (const name in PORTS[id]) { const d = PORTS[id][name]; const r = toRoot(SLOTS[id], d.p[0], d.p[1], d.p[2]); P[id + '.' + name] = [r.x, r.y, r.z]; }
  I.PORT_ROOT = P;
  const add = (a, dx, dy, dz) => [a[0] + dx, a[1] + dy, a[2] + dz];
  const aIn = P['assembler.in'], aOut = P['assembler.out'], sIn = P['splitter.in'], sPass = P['splitter.pass'], sRej = P['splitter.reject'], lIn = P['launch.in'];
  const [fzx, fzz] = dirToRoot(0, 1);   // local +z (front-left face normal) in root
  const [fxx, fxz] = dirToRoot(1, 0);   // local +x (front-right face normal)
  // PATH TABLE. kind: belt | lift | tube | rail. `next` chains into another path; `port` ends at a station port.
  const PATH_DEFS = [
    { name: 'rail', kind: 'rail', label: 'MINE RAIL', speed: 1.4, carrier: 'cart', next: 'lift',
      pts: [[8.0, -9.5, 6.6], [-13.4, -9.5, 6.6], [-15.2, -9.5, 8.3]] },
    { name: 'lift', kind: 'lift', label: 'ORE LIFT', speed: 1.6, carrier: 'cage', next: 'ore', gap: 1.4,
      pts: [[-15.2, -9.5, 8.3], [-15.2, 1.0, 8.3]] },
    { name: 'ore', kind: 'belt', label: 'ORE BELT', speed: 0.95, port: 'assembler.in',
      pts: [[-15.2, 1.0, 8.3], [-15.2, 1.0, aIn[2] + fzz * 2.0 + (aIn[0] + fzx * 2.0 + 15.2)], [aIn[0] + fzx * 2.0, 1.0, aIn[2] + fzz * 2.0], aIn] },
    { name: 'tube', kind: 'tube', label: 'PNEUMATIC TUBE', speed: 3.4, gap: 0.6, smooth: true, next: 'feed',
      pts: [aOut, add(aOut, 0, 1.3, 0), [-8.6, 6.15, -1.0], [-7.0, 5.4, 0.7], [-6.2, 3.4, 2.1], [-6.2, 1.35, 2.4]] },
    { name: 'feed', kind: 'belt', label: 'FEED BELT', speed: 0.95, port: 'splitter.in',
      pts: [[-6.2, 1.0, 2.4], [sIn[0] + fzx * 1.9, 1.0, sIn[2] + fzz * 1.9], sIn] },
    { name: 'pass', kind: 'belt', label: 'SHIP BELT', speed: 0.95, port: 'launch.in',
      pts: [sPass, [sPass[0] + fxx * 2.18, 1.0, sPass[2] + fxz * 2.18], [lIn[0] + fzx * 1.9, 1.0, lIn[2] + fzz * 1.9], lIn] },
    { name: 'rw1', kind: 'belt', label: 'REWORK LOOP', speed: 0.95, next: 'rwUp',
      pts: [sRej, [sRej[0] - fxx * 1.6, 1.0, sRej[2] - fxz * 1.6]] },
    { name: 'rwUp', kind: 'lift', label: 'REWORK LIFT', speed: 1.5, carrier: 'bucket', next: 'rwHigh', gap: 1.2,
      pts: [[sRej[0] - fxx * 1.6, 1.0, sRej[2] - fxz * 1.6], [sRej[0] - fxx * 1.6, 6.9, sRej[2] - fxz * 1.6]] },
    { name: 'rwHigh', kind: 'belt', label: 'REWORK HIGH LINE', speed: 0.95, next: 'rwDown',
      pts: [[sRej[0] - fxx * 1.6, 6.9, sRej[2] - fxz * 1.6], [-14.6, 6.9, sRej[2] - fxz * 1.6]] },
    { name: 'rwDown', kind: 'lift', label: 'REWORK DROP', speed: 1.5, carrier: 'bucket', next: 'rwIn', gap: 1.2,
      pts: [[-14.6, 6.9, sRej[2] - fxz * 1.6], [-14.6, 1.0, sRej[2] - fxz * 1.6]] },
    { name: 'rwIn', kind: 'belt', label: 'REWORK RETURN', speed: 0.95, port: 'assembler.in',
      pts: [[-14.6, 1.0, sRej[2] - fxz * 1.6], [-14.6, 1.0, aIn[2] - fxz * 2.2 - (aIn[0] - fxx * 2.2 + 14.6)], [aIn[0] - fxx * 2.2, 1.0, aIn[2] - fxz * 2.2], aIn] }
  ];
  I.PATH_DEFS = PATH_DEFS;
  // where each source's mine mouth sits along the rail (x position)
  I.MINES = { inbox: { x: 8.0, color: 0x5aa8ff, label: 'INBOX' }, github: { x: 1.0, color: 0xffb040, label: 'GITHUB' }, sentry: { x: -6.0, color: 0xff4a3a, label: 'SENTRY' } };
  // output port -> path
  const PORT_OUT = { 'assembler.out': 'tube', 'splitter.pass': 'pass', 'splitter.reject': 'rw1' };

  function buildPath(def) {
    let pts = def.pts.map((p) => new V3(p[0], p[1], p[2]));
    if (def.smooth) { const c = new THREE.CatmullRomCurve3(pts); pts = c.getSpacedPoints(48); }
    const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
      if (len < 1e-5) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, hl = Math.hypot(dx, dz);
      segs.push({ a, b, len, L0: L, yaw: hl > 1e-4 ? Math.atan2(-dz, dx) : null, pitch: Math.atan2(dy, hl), dx, dy, dz, hl });
      L += len;
    }
    for (let i = 0; i < segs.length; i++) if (segs[i].yaw === null) segs[i].yaw = i > 0 ? segs[i - 1].yaw : (segs[i + 1] ? segs[i + 1].yaw : 0);
    const path = Object.assign({}, def, {
      points: pts.map((v) => [v.x, v.y, v.z]), segs, L, items: [], gap: def.gap || I.CFG.gap,
      flow: 1, jammed: false, jamT: 0, moving: false,
      at(s, out) { s = Math.max(0, Math.min(L, s)); let sg = segs[0]; for (const q of segs) if (s >= q.L0) sg = q; const k = (s - sg.L0) / sg.len; out.copy(sg.a).lerp(sg.b, k); return sg; }
    });
    return path;
  }
  PATH_DEFS.forEach((d) => { const p = buildPath(d); I.paths[d.name] = p; I.pathList.push(p); });

  // =====================================================================
  // ITEMS
  // =====================================================================
  const TITLES = {
    sentry: ['TypeError in checkout.js', 'Null user on /billing', '500 on POST /orders', 'Timeout in payments worker', 'Crash in Safari cart', 'Undefined plan in upgrade modal'],
    github: ['Dark mode toggle broken', 'Add CSV export', 'Typo on pricing page', 'Flaky login test', 'Slow search on /docs', 'Pagination skips a page'],
    inbox: ['Dana: can’t reset password', 'Refund email never arrived', 'Invoice shows wrong tax', 'Signup link expired', 'Can’t invite teammate']
  };
  const REASONS = ['failing test: cart.spec', 'lint: unused import', 'type error in OrderForm', 'missed edge case: empty cart', 'AI review: unsafe SQL', 'repro still fails'];
  I.KIND_COLOR = { issue: null, cards: 0xffd890, capsule: 0xffa63a, pass: 0x46ff8a, reject: 0xff3a2a };
  let nextNum = 141;
  let itemsRoot = null;
  const flashes = [];
  function makeItemMesh(it) {
    const g = new THREE.Group();
    const src = I.MINES[it.src].color;
    // ISSUE: a dark ore lump with glowing crystal shards in the source color
    const ore = group(g);
    rock(0.21, mat(0x2a2420, { shine: 10 }), 0, 0.2, 0, ore);
    rock(0.13, mat(0x1e1a16), 0.14, 0.13, 0.1, ore);
    const crys = mat(src, { e: src, ei: 0.85 });
    for (let i = 0; i < 4; i++) { const c = cone(0.06, 0.26, crys, 4, Math.cos(i * 1.7) * 0.12, 0.3 + (i % 2) * 0.05, Math.sin(i * 1.7) * 0.12, ore); c.rotation.set(R() * 0.9, i, R() * 0.9); }
    // CARDS: a bound stack of punch cards, ribbon in the source color
    const cards = group(g);
    for (let i = 0; i < 4; i++) { const c = box(0.46, 0.05, 0.32, mat(i % 2 ? 0xe8d6a8 : 0xd8c290), 0, 0.06 + i * 0.055, 0, cards); c.rotation.y = (i - 1.5) * 0.06; }
    box(0.08, 0.26, 0.34, mat(src, { e: src, ei: 0.5 }), 0, 0.15, 0, cards);
    for (let i = 0; i < 3; i++) box(0.05, 0.01, 0.04, mat(0x1a120a), -0.15 + i * 0.13, 0.3, -0.06 + (i % 2) * 0.1, cards);
    // CAPSULE: brass pneumatic capsule with a glowing status band (amber = PR in review)
    const cap = group(g);
    const body = cyl(0.15, 0.15, 0.5, mat(0x9a7030, { shine: 50, spec: 0xa08040 }), 10, 0, 0.2, 0, cap); body.rotation.z = Math.PI / 2;
    for (const x of [-0.28, 0.28]) { const e = sph(0.15, mat(0x6a4a20, { shine: 40 }), x, 0.2, 0, cap, 10, 6); e.scale.x = 0.45; }
    const bandM = mat(0xffa63a, { e: 0xffa63a, ei: 0.9 });
    const band = cyl(0.165, 0.165, 0.14, bandM, 10, 0, 0.2, 0, cap); band.rotation.z = Math.PI / 2;
    const srcDot = box(0.08, 0.05, 0.08, mat(src, { e: src }), 0.18, 0.37, 0, cap);
    const tag = group(cap, -0.12, 0.36, 0); // red scar tag (rework)
    box(0.02, 0.22, 0.02, mat(0x1a1410), 0, 0.11, 0, tag); box(0.16, 0.12, 0.02, mat(0xff3a2a, { e: 0xa01408 }), 0.08, 0.18, 0, tag); tag.visible = false;
    const check = group(cap, 0, 0.42, 0); // green check light (passed)
    box(0.07, 0.07, 0.07, glow(0x46ff8a), 0, 0, 0, check); check.visible = false;
    // halo: soft additive glow so items read at any zoom
    const halo = sph(0.42, glow(src, 0.2, true), 0, 0.22, 0, g, 10, 8); halo.userData.noBake = true; halo.castShadow = false;
    g.traverse((o) => { if (o.isMesh && o !== halo) { o.castShadow = true; } });
    it.parts = { ore, cards, cap, bandM, tag, check, halo, src };
    return g;
  }
  function Item(src) {
    const it = this;
    it.id = nextNum++; it.src = src; it.title = TITLES[src][Math.floor(Math.random() * TITLES[src].length)];
    it.kind = 'issue'; it.attempts = 0; it.stage = 'Mined'; it.reason = null; it.path = null; it.s = 0; it.atEnd = false;
    it.owner = null; it.followObj = null; it.followOff = new V3(); it.hidden = false; it.born = performance.now(); it.carrierMeshes = {}; it.qT = new THREE.Quaternion(); it.emerge = null;
    it.mesh = makeItemMesh(it); itemsRoot.add(it.mesh);
    it.setKind(it.kind, true);
  }
  Item.prototype.setKind = function (kind, silent) {
    this.kind = kind; const p = this.parts;
    p.ore.visible = kind === 'issue';
    p.cards.visible = kind === 'cards';
    p.cap.visible = kind === 'capsule' || kind === 'pass' || kind === 'reject';
    const col = kind === 'issue' ? p.src : I.KIND_COLOR[kind];
    p.bandM.color.setHex(col); p.bandM.emissive.setHex(col);
    p.tag.visible = kind === 'reject' || (kind === 'capsule' && this.attempts > 0);
    p.check.visible = kind === 'pass';
    p.halo.material.color.setHex(col);
    if (!silent) { this.flash(col); I.emit('kind', { item: this, kind }); }
  };
  Item.prototype.flash = function (col) {
    const r = torus(0.35, 0.05, glow(col || 0xffffff, 0.9, true), 4, 20, 0, 0.2, 0, this.mesh); r.rotation.x = Math.PI / 2; r.castShadow = false;
    flashes.push({ r, t: 0 });
  };
  Item.prototype.place = function (v) { this.followObj = null; this.mesh.position.copy(v); };
  Item.prototype.follow = function (obj, ox, oy, oz) { this.followObj = obj; this.followOff.set(ox || 0, oy || 0, oz || 0); };
  Item.prototype.hide = function () { this.hidden = true; this.mesh.visible = false; };
  Item.prototype.show = function () { this.hidden = false; this.mesh.visible = true; };
  Item.prototype.label = function () { return '#' + this.id; };
  I.Item = Item;

  // A new issue: its cart rolls OUT of the mine tunnel (from 2.4 units inside the rock) onto the rail.
  // 'spawn' fires at the start with { item, src, s, from, to, dur } so the mine can light up / animate.
  const TUNNEL_DEPTH = 2.4, EMERGE_DUR = 1.8;
  function spawnItem(src) {
    const rail = I.paths.rail; const x0 = rail.points[0][0];
    const s = Math.max(0, x0 - I.MINES[src].x);
    if (rail.items.some((o) => Math.abs(o.s - s) < rail.gap * 1.6) || I.items.some((o) => o.emerge && o.src === src)) return null;
    const it = new Item(src); it.stage = 'Leaving the ' + I.MINES[src].label + ' mine'; it.minedAt = s;
    I.items.push(it); I.counters.mined++;
    const to = new V3(); rail.at(s, to); const from = to.clone(); from.z -= TUNNEL_DEPTH;
    it.emerge = { t: 0, dur: EMERGE_DUR, s, from, to };
    showCarrier(it, 'cart'); it.mesh.position.copy(from); it.qT.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YZX')); it.mesh.quaternion.copy(it.qT);
    log(it.label() + ' ' + I.MINES[src].label.toLowerCase() + ': ' + it.title, 'in');
    I.emit('spawn', { item: it, src, s, from: from.clone(), to: to.clone(), dur: EMERGE_DUR });
    return it;
  }
  function stepEmerge(dt) {
    I.items.forEach((it) => {
      const e = it.emerge; if (!e) return;
      e.t += dt; const k = smooth(Math.min(1, e.t / e.dur));
      it.mesh.position.copy(e.from).lerp(e.to, k);
      if (e.t >= e.dur) { const rail = I.paths.rail; if (!rail.items.some((o) => Math.abs(o.s - e.s) < rail.gap)) { it.emerge = null; enterPath(it, rail, e.s, true); } }
    });
  }
  function showCarrier(it, name) {
    for (const k in it.carrierMeshes) it.carrierMeshes[k].visible = false;
    if (name && I.carriers[name]) {
      if (!it.carrierMeshes[name]) { const cm = I.carriers[name].make(I.K, it); it.mesh.add(cm); it.carrierMeshes[name] = cm; }
      it.carrierMeshes[name].visible = true;
    }
  }
  // Carrier handoffs fire events so the module that owns the carrier can draw an empty stand-in that
  // carries on moving (no pop): 'carrierDrop' when an item leaves a path with a carrier (pos/quat = the
  // carrier's root-space pose at that moment), 'carrierPick' when it boards one.
  function enterPath(it, path, s, keepCarrier) {
    it.path = path; it.s = s || 0; it.atEnd = false; it.owner = null; it.followObj = null; path.items.push(it);
    it.stage = path.label;
    if (!keepCarrier || path.carrier) showCarrier(it, path.carrier);
    if (path.carrier) I.emit('carrierPick', { item: it, carrier: path.carrier, path: path.name, pos: it.mesh.position.clone(), quat: it.mesh.quaternion.clone() });
  }
  function leavePath(it) {
    if (!it.path) return; const path = it.path; const a = path.items; a.splice(a.indexOf(it), 1); it.path = null;
    for (const k in it.carrierMeshes) it.carrierMeshes[k].visible = false;
    if (path.carrier) I.emit('carrierDrop', { item: it, carrier: path.carrier, path: path.name, pos: it.mesh.position.clone(), quat: it.mesh.quaternion.clone() });
  }
  I.queueFor = (id) => I.pathList.filter((p) => p.port === id + '.in').reduce((n, p) => n + p.items.length, 0);
  function entryFree(path) { return !path.items.some((o) => o.s < path.gap); }

  const tmpV = new V3(), tmpO = new V3(), tmpE = new THREE.Euler();
  function stepPaths(dt) {
    I.pathList.forEach((path) => {
      const arr = path.items.slice().sort((a, b) => b.s - a.s);
      let moved = false;
      arr.forEach((it, i) => {
        const maxS = i === 0 ? path.L : Math.min(path.L, arr[i - 1].s - path.gap);
        const ns = Math.min(it.s + path.speed * dt, maxS);
        if (ns > it.s + 1e-5) moved = true;
        it.s = Math.max(it.s, ns);
        if (i === 0 && it.s >= path.L - 1e-4) {
          if (path.next) { const nx = I.paths[path.next]; if (entryFree(nx)) { leavePath(it); enterPath(it, nx, 0); } else it.atEnd = true; }
          else it.atEnd = true;
        }
      });
      const front = arr[0];
      const stuck = front && front.atEnd && front.path === path;
      path.jamT = stuck && arr.length >= 2 ? path.jamT + dt : 0;
      path.jammed = path.jamT > 0.35;
      path.moving = moved;
      path.flow += ((path.jammed ? 0 : 1) - path.flow) * Math.min(1, dt * 3);
    });
    // place path-riding items; orientation eases toward the path direction (no snapping at corners/handoffs)
    const ease = 1 - Math.exp(-dt * 10);
    I.pathList.forEach((path) => path.items.forEach((it) => {
      const sg = path.at(it.s, tmpV); it.mesh.position.copy(tmpV);
      if (path.kind === 'belt' || path.kind === 'rail' || path.kind === 'tube') { tmpE.set(0, sg.yaw, sg.pitch, 'YZX'); it.qT.setFromEuler(tmpE); }
      else { tmpE.setFromQuaternion(it.qT, 'YZX'); tmpE.set(0, tmpE.y, 0, 'YZX'); it.qT.setFromEuler(tmpE); }
      it.mesh.quaternion.slerp(it.qT, ease);
      if (path.kind === 'tube') { tmpO.set(0, -0.2, 0).applyQuaternion(it.qT); it.mesh.position.add(tmpO); }
    }));
    I.items.forEach((it) => { if (it.emerge) it.mesh.quaternion.slerp(it.qT, ease); });
  }

  // =====================================================================
  // STATIONS (machines). Each machine module gets an M context.
  // =====================================================================
  function station(id, holder, root) {
    const st = { id, state: 'IDLE', detail: '', blocked: false, prompt: null, blockT: 0, manual: false, holder, item: null, resolveFns: [] };
    const sx = SLOTS[id];
    const M = {
      id, slotX: sx, group: holder, root,
      toRoot: (x, y, z, out) => toRoot(sx, x, y, z, out),
      rootOf(obj, out) { out = out || new V3(); obj.getWorldPosition(out); return root.worldToLocal(out); },
      port(name) { const d = PORTS[id][name]; return { local: new V3(d.p[0], d.p[1], d.p[2]), root: new V3().fromArray(P[id + '.' + name]) }; },
      waiting(port) {
        const key = id + '.' + (port || 'in');
        const cands = I.pathList.filter((p) => p.port === key).map((p) => p.items.find((it) => it.atEnd)).filter(Boolean);
        cands.sort((a, b) => (b.path.name.startsWith('rw') ? 1 : 0) - (a.path.name.startsWith('rw') ? 1 : 0));
        return cands[0] || null;
      },
      take(port) { const it = M.waiting(port); if (!it) return null; leavePath(it); it.owner = id; st.item = it; I.emit('take', { item: it, station: id }); return it; },
      canGive(port) { const pth = I.paths[PORT_OUT[id + '.' + port]]; return !!pth && entryFree(pth); },
      give(it, port) {
        const pth = I.paths[PORT_OUT[id + '.' + port]];
        if (!pth || !entryFree(pth)) return false;
        it.owner = null; it.followObj = null; if (st.item === it) st.item = null;
        enterPath(it, pth, 0); I.emit('give', { item: it, station: id, port });
        return true;
      },
      setState(s, detail) { st.state = s; if (detail !== undefined) st.detail = detail; },
      setStage(it, text) { it.stage = text; },
      get blocked() { return st.blocked; },
      get stateShown() { return st.blocked ? 'BLOCKED' : st.state; },
      // ask the human. The machine must freeze while M.blocked is true.
      decision(text) { if (st.blocked) return; st.blocked = true; st.prompt = text; st.blockT = 0; st.manual = false; I.counters.decisions++; log('NEEDS YOU · ' + text, 'warn'); I.emit('decision', { station: id, text }); },
      // roll the dice for a natural decision point (respects the EVENTS toggle). Returns true if it blocked.
      maybeDecision(text) { if (!I.policy.events) return false; if (Math.random() < (I.CFG.decisionChance[id] || 0)) { M.decision(text); return true; } return false; },
      onResolve(fn) { st.resolveFns.push(fn); },
      // Spark's verdict for an item (splitter only). { pass, reason }
      judge(it) {
        const rate = it.attempts > 0 ? I.CFG.rejectRateRetry : I.CFG.rejectRate;
        const pass = Math.random() >= rate;
        return { pass, reason: pass ? null : REASONS[Math.floor(Math.random() * REASONS.length)] };
      },
      reject(it, reason) { it.attempts++; it.reason = reason; I.counters.rework++; log(it.label() + ' sent back: ' + reason, 'bad'); I.emit('reject', { item: it, reason }); },
      pass(it) { log(it.label() + ' passed Spark review', 'good'); I.emit('pass', { item: it }); },
      consume(it) { // shipped: remove from the world
        if (st.item === it) st.item = null; it.owner = null; leavePath(it); it.mesh.parent && it.mesh.parent.remove(it.mesh);
        I.items.splice(I.items.indexOf(it), 1); I.counters.shipped++; log(it.label() + ' shipped · ' + it.title, 'ship'); I.emit('ship', { item: it });
      },
      log
    };
    st.M = M;
    I.stations[id] = st;
    return { st, M };
  }
  I.resolve = (id) => {
    const st = I.stations[id]; if (!st || !st.blocked) return;
    st.blocked = false; const p = st.prompt; st.prompt = null; st.manual = false;
    log('Resolved · ' + (p || id), 'good'); I.emit('resolve', { station: id });
    st.resolveFns.forEach((f) => f());
  };
  I.stall = (id) => { const st = I.stations[id]; if (!st || st.blocked) return; st.M.decision({ assembler: 'Stalled by you: agent paused', splitter: 'Stalled by you: Spark paused', launch: 'Stalled by you: launch held' }[id]); st.manual = true; };
  function stepStations(dt) {
    for (const id in I.stations) {
      const st = I.stations[id];
      if (st.blocked) { st.blockT += dt; if (I.policy.autoResolve && st.blockT > I.policy.autoResolveAfter) I.resolve(id); }
    }
  }

  // fallback machines so the line runs before the real modules exist
  const FALLBACK = {
    assembler(K, M) { const g = K.group(); K.box(4.6, 0.4, 4.6, 0x3a332c, 0, 0.2, 0, g); K.box(1.4, 3.6, 1.4, 0x6a4a28, -1.1, 2.2, -1.1, g); const hold = K.group(g, 0, 1.6, 0); const lamp = K.statusLamp(g, 2, 0.4, 2); const ct = K.caution(g, 1.6, 0.4, -1.8);
      let it = null, t0 = 0; return { g, update(t, dt) { if (M.blocked) { lamp.set('BLOCKED', t); ct.update(t, dt, 'BLOCKED'); return; } ct.update(t, dt, M.stateShown);
        if (!it) { it = M.take('in'); t0 = 0; if (it) { it.follow(hold); M.setState('WORKING', it.label() + ' building'); } else M.setState('IDLE', 'waiting for work'); }
        else { t0 += dt; if (t0 > 1.5 && it.kind !== 'capsule') it.setKind('capsule'); if (t0 > 3 && M.canGive('out')) { M.give(it, 'out'); it = null; } }
        lamp.set(M.stateShown, t); } }; },
    splitter(K, M) { const g = K.group(); K.cyl(2.4, 2.5, 0.5, 0x3a332c, 8, 0, 0.25, 0, g); const core = K.sph(0.5, K.glow(0x7af0d8), 0, 2.8, 0, g); const hold = K.group(g, 0, 2.0, 0); const lamp = K.statusLamp(g, 2, 0.5, 1.6); const ct = K.caution(g, -1.8, 0.5, 1.6);
      let it = null, t0 = 0, v = null; return { g, update(t, dt) { ct.update(t, dt, M.stateShown); lamp.set(M.stateShown, t); if (M.blocked) return;
        if (!it) { it = M.take('in'); t0 = 0; v = null; if (it) { it.follow(hold); M.setState('WORKING', it.label() + ' review'); } else M.setState('IDLE', 'waiting for PRs'); }
        else { t0 += dt; if (t0 > 2 && !v) { v = M.judge(it); if (v.pass) { it.setKind('pass'); M.pass(it); } else { it.setKind('reject'); M.reject(it, v.reason); } }
          if (v && t0 > 3 && M.canGive(v.pass ? 'pass' : 'reject')) { M.give(it, v.pass ? 'pass' : 'reject'); it = null; } } core.scale.setScalar(it ? 1 + Math.sin(t * 8) * 0.1 : 0.7); } }; },
    launch(K, M) { const g = K.group(); K.cyl(2.4, 2.5, 0.4, 0x3a332c, 8, 0, 0.2, 0, g); const rk = K.group(g, 0, 0.4, 0); K.cyl(0.5, 0.5, 3, 0x8a6428, 10, 0, 1.5, 0, rk); K.cone(0.5, 1, 0x7a3c20, 10, 0, 3.5, 0, rk); const lamp = K.statusLamp(g, 2, 0.4, 1.8); const ct = K.caution(g, -1.8, 0.4, 1.8);
      let it = null, t0 = 0; return { g, update(t, dt) { ct.update(t, dt, M.stateShown); lamp.set(M.stateShown, t); if (M.blocked) return;
        if (!it) { rk.position.y = 0.4; it = M.take('in'); t0 = 0; if (it) { it.follow(rk, 0, 2.0, 0.6); M.setState('WORKING', it.label() + ' loading'); } else M.setState('IDLE', 'pad clear'); }
        else { t0 += dt; if (t0 > 2.5) rk.position.y = 0.4 + (t0 - 2.5) ** 2 * 3; if (t0 > 4.5) { M.consume(it); it = null; } } } }; }
  };

  // =====================================================================
  // EVENT LOG
  // =====================================================================
  function log(text, kind) { I.log.unshift({ text, kind: kind || 'info', t: performance.now() }); if (I.log.length > 40) I.log.pop(); I.emit('log', I.log[0]); }
  I.logMsg = log;

  // =====================================================================
  // BUILD + STEP
  // =====================================================================
  let spawnT = 2, built = false;
  I.build = function (scene, root) {
    itemsRoot = group(root); I.root = root; I.scene = scene;
    const ctx = { paths: I.paths, PATH_DEFS, PORTS, PORT_ROOT: P, SLOTS, MINES: I.MINES, toRoot, items: I.items, I };
    const updaters = [];
    const run = (name, fn, ...args) => { try { const u = fn(...args); if (u && u.update) updaters.push({ name, u }); } catch (e) { console.error('[IRON] module ' + name + ' failed:', e); } };
    if (I.mods.world) run('world', I.mods.world, kitFor('world'), root, scene, ctx);
    else { const top = box(37, 1.4, 15, 0x3a322a, 0, -0.7, 0, root); top.receiveShadow = true; }
    if (I.mods.underside) run('underside', I.mods.underside, kitFor('underside'), root, ctx);
    if (I.mods.belts) run('belts', I.mods.belts, kitFor('belts'), root, ctx);
    else I.pathList.forEach((p) => { const pts = p.points.map((q) => new V3(q[0], q[1] - 0.02, q[2])); const geo = new THREE.BufferGeometry().setFromPoints(pts); root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: p.kind === 'tube' ? 0x7af0d8 : p.name.startsWith('rw') ? 0xff4a2a : 0xffb040 }))); });
    ['assembler', 'splitter', 'launch'].forEach((id) => {
      const holder = group(root, SLOTS[id], 0, 0); holder.rotation.y = -Math.PI / 4;
      const { st, M } = station(id, holder, root);
      const fn = I.mods.machines[id] || FALLBACK[id];
      try { const inst = fn(kitFor(id), M); holder.add(inst.g); st.inst = inst; st.fallback = !I.mods.machines[id]; }
      catch (e) { console.error('[IRON] machine ' + id + ' failed:', e); const inst = FALLBACK[id](kitFor(id), M); holder.add(inst.g); st.inst = inst; st.fallback = true; }
    });
    I.updaters = updaters; built = true;
    // perf: tiny parts (rivets, bolts, rungs, wires) don't cast shadows — halves the shadow pass, no visible change
    const sv = new V3(); let culled = 0;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      o.getWorldScale(sv); const r = g.boundingSphere.radius * Math.max(sv.x, sv.y, sv.z);
      if (r < 0.16) { o.castShadow = false; culled++; }
    });
    I.perf = { shadowCulled: culled };
    // STATE AURA: a ring on the floor around each machine (dim blue idle, green working, pulsing amber/red
    // blocked) plus a tall amber beacon beam when blocked, so state reads from the art at any zoom.
    for (const id in I.stations) {
      const st = I.stations[id], h = st.holder;
      const aura = group(h);
      const ringM = glow(0x8fa2c8, 0.12, true);
      const ring = torus(3.75, 0.07, ringM, 4, 64, 0, 0.14, 0, aura); ring.rotation.x = Math.PI / 2;
      const ping = torus(3.75, 0.06, glow(0xffb020, 0.8, true), 4, 64, 0, 0.15, 0, aura); ping.rotation.x = Math.PI / 2; ping.visible = false;
      const beam = cyl(0.14, 0.14, 16, glow(0xffb020, 0.4, true), 8, 0, 16, 0, aura); beam.visible = false;
      const beamCore = cyl(0.05, 0.05, 16, glow(0xfff0c0, 0.7, true), 6, 0, 16, 0, aura); beamCore.visible = false;
      [ring, ping, beam, beamCore].forEach((m) => { m.castShadow = false; m.receiveShadow = false; m.userData.noBake = true; });
      st.aura = { ring, ringM, ping, beam, beamCore };
    }
    // WARM START: put work at every stage so the line is busy from the first second
    const put = (src, pathName, frac, kind) => {
      const pth = I.paths[pathName]; const it = new Item(src); I.items.push(it); I.counters.mined++;
      if (kind) it.setKind(kind, true);
      enterPath(it, pth, pth.L * frac); const sg = pth.at(it.s, tmpV); it.mesh.position.copy(tmpV);
      tmpE.set(0, sg.yaw, pth.kind === 'lift' ? 0 : sg.pitch, 'YZX'); it.qT.setFromEuler(tmpE); it.mesh.quaternion.copy(it.qT);
      return it;
    };
    put('github', 'ore', 0.97); put('sentry', 'ore', 0.45); put('inbox', 'lift', 0.5);
    put('github', 'feed', 0.9, 'capsule'); put('sentry', 'pass', 0.92, 'pass'); put('github', 'pass', 0.35, 'pass');
    spawnItem('sentry');
    log('The line is running. Issues are mined below the island.', 'info');
  };
  const fv = new V3();
  I.step = function (t, dt) {
    if (!built) return;
    dt *= I.policy.speed;
    if (I.policy.intake) { spawnT -= dt; if (spawnT <= 0) { const r = Math.random(); spawnItem(r < 0.4 ? 'sentry' : r < 0.8 ? 'github' : 'inbox'); spawnT = lerp(I.CFG.spawnEvery[0], I.CFG.spawnEvery[1], Math.random()); } }
    stepEmerge(dt);
    stepPaths(dt);
    stepStations(dt);
    I.updaters.forEach(({ name, u }) => { try { u.update(t, dt); } catch (e) { if (!u._err) { console.error('[IRON] ' + name + ' update:', e); u._err = 1; } } });
    for (const id in I.stations) { const st = I.stations[id]; try { st.inst.update(t, dt); } catch (e) { if (!st._err) { console.error('[IRON] ' + id + ' update:', e); st._err = 1; } } }
    for (const id in I.stations) {
      const st = I.stations[id], a = st.aura; if (!a) continue;
      const s = st.blocked ? 'BLOCKED' : st.state;
      if (s === 'BLOCKED') {
        const on = Math.sin(t * 8) > 0; a.ringM.color.setHex(on ? 0xffb020 : 0xff3a20); a.ringM.opacity = 0.75 + Math.sin(t * 8) * 0.2;
        const k = (t * 0.8) % 1; a.ping.visible = true; a.ping.scale.setScalar(1 + k * 0.45); a.ping.material.opacity = 0.8 * (1 - k);
        a.beam.visible = a.beamCore.visible = true; a.beam.material.opacity = 0.28 + Math.sin(t * 8) * 0.14; a.beamCore.material.opacity = 0.5 + Math.sin(t * 8) * 0.25;
      } else {
        a.ping.visible = false; a.beam.visible = a.beamCore.visible = false;
        if (s === 'WORKING') { a.ringM.color.setHex(0x46e07a); a.ringM.opacity = 0.2 + Math.sin(t * 3) * 0.06; }
        else { a.ringM.color.setHex(0x8fa2c8); a.ringM.opacity = 0.09 + Math.sin(t * 1.2) * 0.03; }
      }
    }
    // items held by stations follow their objects
    I.items.forEach((it) => { if (it.followObj) { it.followObj.getWorldPosition(fv); I.root.worldToLocal(fv); it.mesh.position.copy(fv).add(it.followOff); } });
    // halos pulse; items held by a blocked station blink amber
    I.items.forEach((it) => {
      const held = it.owner && I.stations[it.owner] && I.stations[it.owner].blocked;
      const h = it.parts.halo; const base = held ? 0.26 + Math.sin(t * 10) * 0.12 : 0.16 + Math.sin(t * 3 + it.id) * 0.04;
      h.material.opacity = base; h.scale.setScalar(held ? 0.85 + Math.sin(t * 10) * 0.08 : 0.8);
      if (held) h.material.color.setHex(Math.sin(t * 10) > 0 ? 0xffb020 : 0xff3020);
      else h.material.color.setHex(it.kind === 'issue' ? it.parts.src : I.KIND_COLOR[it.kind]);
    });
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; const k = f.t / 0.7; f.r.scale.setScalar(1 + k * 3); f.r.material.opacity = 0.9 * (1 - k); if (k >= 1) { f.r.parent && f.r.parent.remove(f.r); flashes.splice(i, 1); } }
    updateFx(dt);
  };
  I.spawnItem = spawnItem;
  I.debug = {
    // run the simulation forward without rendering (for screenshots in a slow headless browser)
    advance(sec, step) { step = step || 1 / 30; const n = Math.round(sec / step); for (let i = 0; i < n; i++) { I._t = (I._t || 0) + step; I.step(I._t, step); } },
    stats() { return { items: I.items.length, counters: I.counters, stations: Object.fromEntries(Object.entries(I.stations).map(([k, s]) => [k, s.blocked ? 'BLOCKED' : s.state])), paths: Object.fromEntries(I.pathList.map((p) => [p.name, p.items.length])) }; }
  };
  return I;
})();
