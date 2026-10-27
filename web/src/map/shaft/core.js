// =====================================================================
// THE SHAFT CORE (owned by the integrator; module agents: read, don't edit)
// The Black Iron line (docs/art/black-iron/core.js) stood on its end: work is mined deep underground,
// climbs floor by floor through planning, building and checks, and launches from the top.
// Work items are simulated, ride paths, get handed between stations through fixed ports and stall on
// decisions. A driver says what really happens (the auto driver rolls dice like the mockup; the game's
// driver follows the real factory state). Modules plug in with IRON.world / IRON.underside / IRON.belts /
// IRON.part / IRON.machine / IRON.carrier. Positions are ROOT-LOCAL: +x left->right on screen, +z toward
// the viewer, +y up. Machines are built in their own LOCAL frame (seen from a 45deg corner) on a holder.
// See CONTRACT.md for the full contract and layout.js for where everything stands.
// =====================================================================
import * as THREE from 'three';
import { C45, PORTS, toRootAt, TUNNEL_DEPTH, MINES as MINE_DEFS } from './layout.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------------
// Legacy lighting. The art was tuned on three r128 (physicallyCorrectLights off): point lights fade to 0
// at their distance, and direct + ambient light are x PI. Materials that carry the IRON_LEGACY define
// light exactly like that; everything else in the app keeps the modern model. Patched once, idempotent.
// ---------------------------------------------------------------------
export function patchLegacyLights() {
  const SC = THREE.ShaderChunk;
  if (SC.lights_pars_begin.includes('IRON_LEGACY')) return true;
  const head = 'float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {\n';
  const irr = 'vec3 irradiance = dotNL * directLight.color;\n';
  const ind = 'reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
  if (!SC.lights_pars_begin.includes(head) || !SC.lights_phong_pars_fragment.includes(irr) || !SC.lights_phong_pars_fragment.includes(ind)) {
    console.warn('[SHAFT] three changed its light chunks; lights will look x PI off');
    return false;
  }
  SC.lights_pars_begin = SC.lights_pars_begin.replace(head, head +
    '#ifdef IRON_LEGACY\n\tif ( cutoffDistance > 0.0 && decayExponent > 0.0 ) return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );\n\treturn 1.0;\n#endif\n');
  SC.lights_phong_pars_fragment = SC.lights_phong_pars_fragment
    .replace(irr, irr + '#ifdef IRON_LEGACY\n\tirradiance *= PI;\n#endif\n')
    .replace(ind, '#ifdef IRON_LEGACY\n\treflectedLight.indirectDiffuse += irradiance * PI * BRDF_Lambert( material.diffuseColor );\n#else\n\t' + ind + '\n#endif');
  return true;
}
const legacy = (m) => { if (m && m.isMeshPhongMaterial && !(m.defines && 'IRON_LEGACY' in m.defines)) { m.defines = Object.assign({}, m.defines, { IRON_LEGACY: '' }); m.needsUpdate = true; } return m; };

// item look per source (lint rides in from the GitHub mine)
export const SOURCE_OF = { github_issue: 'github', github: 'github', lint: 'github', sentry: 'sentry', posthog: 'posthog', inbox: 'inbox', email: 'inbox' };

export function createIron(opts) {
  opts = opts || {};
  patchLegacyLights();
  const I = {
    mods: { parts: [], machines: {} },
    carriers: {}, paths: {}, pathList: [], items: [], stations: {}, stationList: [], log: [], listeners: {},
    counters: { mined: 0, shipped: 0, rework: 0, decisions: 0 },
    policy: { intake: true, autoResolve: true, autoResolveAfter: 9, speed: 1, events: true },
    CFG: {
      spawnEvery: [7, 11], gap: 0.85,
      // auto driver: chance a check sends a PR back (first try / after rework)
      rejectRate: { ci: 0.14, check: 0.1, verify: 0.12, review: 0.12, gate: 0.04 }, rejectRateRetry: 0.04,
      decisionChance: { planner: 0.05, assembler: 0.06, ci: 0.02, check: 0.02, verify: 0.04, review: 0.04, gate: 0.25, launch: 0.08 },
      sourceWeight: { sentry: 0.34, github: 0.36, inbox: 0.18, posthog: 0.12 },
    },
    LOOK: {
      sky: { top: '#140c08', bottom: '#5a2a12', fog: '#2a1810', fogNear: 70, fogFar: 140 },
      light: { sun: 0xffb070, sunI: 1.05, sunDir: [-10, 22, 14], hemiSky: 0xc8a888, hemiGnd: 0x3a2a1e, hemiI: 0.95 },
      finish: { levels: 48, dither: 0.1, outline: 0.5, thresh: 0.08, ink: '#0a0504', sat: 0.98, contrast: 1.06, bloom: 0.75, bloomThresh: 0.6, vignette: 0.3, grade: 0.32, shadow: '#1e1630', high: '#ffd29a', scan: 0 }
    }
  };
  // registration (same names as the Black Iron mockup, so its modules port 1:1)
  const part = (name, order, fn) => { I.mods.parts = I.mods.parts.filter((p) => p.name !== name); I.mods.parts.push({ name, order, fn }); };
  I.world = (fn) => part('world', 0, fn);
  I.underside = (fn) => part('underside', 1, fn);
  I.mine = I.underside;
  I.belts = (fn) => part('belts', 2, fn);
  I.part = (name, fn, order) => part(name, order === undefined ? 3 : order, fn); // any other root-level builder (decor, power lines...)
  I.machine = (type, fn) => (I.mods.machines[type] = fn);
  I.carrier = (name, fn) => (I.carriers[name] = { make: fn });
  I.look = (cfg) => { for (const k in cfg) I.LOOK[k] = Object.assign({}, I.LOOK[k] || {}, cfg[k]); };
  I.on = (ev, fn) => ((I.listeners[ev] = I.listeners[ev] || []).push(fn));
  I.emit = (ev, d) => (I.listeners[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

  // =====================================================================
  // KIT (the Black Iron kit: same helpers, same look)
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
    legacy(m);
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
  // particles: little cubes that fly, fall and fade (sparks, steam, oil drips). One instanced mesh per blend
  // mode draws them all (two draw calls, not one per particle). Positions are in the parent's local frame.
  const fx = []; const FX_MAX = opts.fxCap || 1100;
  const fxLayers = [false, true].map((add) => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const op = new THREE.InstancedBufferAttribute(new Float32Array(FX_MAX + 1), 1); op.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('fxOp', op);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add, fog: !add });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float fxOp;\nvarying float vFxOp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFxOp = fxOp;');
      sh.fragmentShader = 'varying float vFxOp;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vFxOp );');
    };
    m.customProgramCacheKey = () => 'shaft-fx';
    const im = new THREE.InstancedMesh(geo, m, FX_MAX + 1);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((FX_MAX + 1) * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.count = 0; im.frustumCulled = false; im.castShadow = im.receiveShadow = false; im.userData.dyn = true; im.name = add ? 'fx-add' : 'fx';
    return { im, op, add };
  });
  const fxM = new THREE.Matrix4(), fxQ = new THREE.Quaternion(), fxE = new THREE.Euler(), fxP = new V3(), fxS = new V3(), fxC = new THREE.Color();
  function spawn(p, x, y, z, vx, vy, vz, color, life, size, grav, add) {
    if (fx.length >= FX_MAX || !p) return null;
    fxE.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    const f = { p, x, y, z, vx, vy, vz, color: new THREE.Color(color), life, max: life, grav, size, add: !!add, q: new THREE.Quaternion().setFromEuler(fxE) };
    fx.push(f); return f;
  }
  function updateFx(dt) {
    const n = [0, 0];
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt;
      if (f.life <= 0 || !f.p.parent) { fx.splice(i, 1); continue; }
      f.vy -= f.grav * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    }
    for (const f of fx) {
      const L = fxLayers[f.add ? 1 : 0], k = f.life / f.max, j = n[f.add ? 1 : 0]++;
      const sc = f.grav < 0 ? f.size * (1 + (1 - k) * 1.5) : f.size;
      fxM.compose(fxP.set(f.x, f.y, f.z), f.q, fxS.set(sc, sc, sc)).premultiply(f.p.matrixWorld);
      L.im.setMatrixAt(j, fxM); L.im.setColorAt(j, fxC.copy(f.color)); L.op.array[j] = Math.min(1, k * 1.6);
    }
    fxLayers.forEach((L, i) => { L.im.count = n[i]; if (n[i]) { L.im.instanceMatrix.needsUpdate = true; L.im.instanceColor.needsUpdate = true; L.op.needsUpdate = true; } });
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
  // Only call on groups that never move internally. Meshes with array materials are skipped.
  // (The scene also runs a whole-world static merge after build, so this is a bonus, not a must.)
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
    const lampSpin = dyn(group(g, 0, 1.68, 0));
    box(0.2, 0.16, 0.08, lampMat, 0.06, 0, 0, lampSpin);
    const dome = sph(0.16, glow(0xffb020, 0.35), 0, 1.68, 0, g, 10, 8); dome.castShadow = false;
    const capM = mat(0x3a332c); cyl(0.1, 0.12, 0.05, capM, 8, 0, 1.86, 0, g);
    const hinge = dyn(group(g, 0, 1.2, 0.1));
    const signM = mat(0xffffff, { map: signTex(), e: 0x000000 });
    box(0.62, 0.62, 0.05, signM, 0, 0.36, 0, hinge);
    const ring = torus(0.6, 0.05, glow(0xffb020, 0.8, true), 4, 28, 0, 0.06, 0, g); ring.rotation.x = Math.PI / 2; ring.visible = false; dyn(ring);
    const ring2 = torus(0.6, 0.04, glow(0xff4020, 0.7, true), 4, 28, 0, 0.07, 0, g); ring2.rotation.x = Math.PI / 2; ring2.visible = false; dyn(ring2);
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

  // dyn: mark an object that moves, hides/shows or swaps geometry after build (it and everything under it stay live;
  // the rest of the world is merged into a few big meshes after build). Returns the object.
  const dyn = (o) => { o.userData.dyn = true; return o; };
  const K = { THREE, rnd, R, mat, glow, mesh, box, cyl, cone, sph, torus, rock, group, lathe, tube, canvasTex, spawn, lerp, smooth, clamp01, keyframes, link, bake, caution, statusLamp, signTex, dyn, v3: new V3() };
  I.K = K;
  I._fx = updateFx;
  // Point lights are rationed: every one costs every lit pixel on a phone. Quota per module (all instances of a
  // machine type share it), and a hard cap for the whole scene. Extras silently become dummies.
  const LIGHT_QUOTA = { world: 2, underside: 3, belts: 0, planner: 1, assembler: 2, ci: 0, check: 0, verify: 1, review: 0, gate: 1, launch: 2, orbit: 0, measure: 0, steam: 0, dynamo: 0, battery: 0, geothermal: 0 };
  const LIGHT_CAP = opts.lightCap === undefined ? 12 : opts.lightCap;
  const lightsUsed = {}; let lightsTotal = 0;
  const dummyLight = () => ({ intensity: 0, color: new THREE.Color(), position: new V3(), distance: 0, visible: false, isDummy: true });
  function kitFor(mod) {
    const k = Object.create(K);
    k.light = (color, intensity, dist, x, y, z, p) => {
      const used = lightsUsed[mod] || 0;
      if (used >= (LIGHT_QUOTA[mod] || 0) || lightsTotal >= LIGHT_CAP) return dummyLight();
      lightsUsed[mod] = used + 1; lightsTotal++;
      const l = new THREE.PointLight(color, intensity, dist || 8, 2); l.position.set(x || 0, y || 0, z || 0); if (p) p.add(l); return l;
    };
    return k;
  }

  // =====================================================================
  // PATHS (built from the layout's path table)
  // kind: belt | rail | lift | tube | chute. `next`: a path name, { path, s } (merge in mid-path),
  // or a function(item) returning either (junctions). `port`: 'stationId.in' — the path ends at that tray.
  // =====================================================================
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
    // (a path whose points all coincide still works: zero length, one dummy segment)
    if (!segs.length) segs.push({ a: pts[0], b: pts[0], len: 1e-5, L0: 0, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, hl: 0 });
    return Object.assign({}, def, {
      points: pts.map((v) => [v.x, v.y, v.z]), segs, L, items: [], gap: def.gap || I.CFG.gap, speed: def.speed || 0.95,
      flow: 1, jammed: false, jamT: 0, moving: false,
      at(s, out) { s = Math.max(0, Math.min(L, s)); let sg = segs[0]; for (const q of segs) if (s >= q.L0) sg = q; const k = (s - sg.L0) / sg.len; out.copy(sg.a).lerp(sg.b, k); return sg; }
    });
  }
  // where a path leads an item next: { path, s } or null
  function nextOf(path, it) {
    let n = path.next; if (typeof n === 'function') n = n(it);
    if (!n) return null;
    if (typeof n === 'string') return I.paths[n] ? { path: I.paths[n], s: 0 } : null;
    return I.paths[n.path] ? { path: I.paths[n.path], s: Math.max(0, Math.min(I.paths[n.path].L, n.s || 0)) } : null;
  }
  // room to enter `path` at `s`: nothing within a gap of it (items behind a merge wait their turn)
  function entryFree(path, s) { s = s || 0; return !path.items.some((o) => Math.abs(o.s - s) < path.gap); }

  // =====================================================================
  // ITEMS
  // =====================================================================
  const TITLES = {
    sentry: ['TypeError in checkout.js', 'Null user on /billing', '500 on POST /orders', 'Timeout in payments worker', 'Crash in Safari cart', 'Undefined plan in upgrade modal'],
    github: ['Dark mode toggle broken', 'Add CSV export', 'Typo on pricing page', 'Flaky login test', 'Slow search on /docs', 'Pagination skips a page'],
    inbox: ['Dana: can’t reset password', 'Refund email never arrived', 'Invoice shows wrong tax', 'Signup link expired', 'Can’t invite teammate'],
    posthog: ['Signup drop on /pricing', 'Rage clicks on Save', 'Checkout funnel down 12%', 'Dead click on the CSV button', 'Slow first paint on /app']
  };
  const REASONS = {
    ci: ['failing test: cart.spec', 'lint: unused import', 'type error in OrderForm', 'build broke on Node 20'],
    check: ['secret in the diff', 'bundle grew 40 KB', 'migration has no down step', 'new dependency not allowed'],
    verify: ['repro still fails', 'missed edge case: empty cart', 'fix works, but /billing broke', 'screenshot shows the old button'],
    review: ['unsafe SQL in orders.ts', 'no test for the new branch', 'changes the public API', 'error is swallowed'],
    gate: ['you said not yet', 'needs a smaller PR'],
  };
  I.KIND_COLOR = { issue: null, cards: 0xffd890, capsule: 0xffa63a, pass: 0x46ff8a, reject: 0xff3a2a };
  let nextNum = 141;
  let itemsRoot = null;
  const flashes = [];
  const srcColor = (src) => (MINE_DEFS[src] || MINE_DEFS.github).color;
  function makeItemMesh(it) {
    const g = new THREE.Group();
    const src = srcColor(it.src);
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
    box(0.08, 0.05, 0.08, mat(src, { e: src }), 0.18, 0.37, 0, cap);
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
  // An item on the line. opts: { ref: real item id, num, title, kind } (the game's driver passes the real item)
  function Item(src, o) {
    const it = this; o = o || {};
    it.src = MINE_DEFS[src] ? src : 'github';
    it.ref = o.ref || null; it.num = o.num || nextNum++; it.id = it.num;
    const list = TITLES[it.src] || TITLES.github;
    it.title = o.title || list[Math.floor(Math.random() * list.length)];
    it.kind = 'issue'; it.attempts = o.attempts || 0; it.stage = 'Mined'; it.reason = null; it.path = null; it.s = 0; it.atEnd = false;
    it.owner = null; it.followObj = null; it.followOff = new V3(); it.hidden = false; it.born = performance.now(); it.carrierMeshes = {}; it.qT = new THREE.Quaternion(); it.emerge = null;
    it.dest = null; it.boost = 1; it.passed = {};
    it.mesh = makeItemMesh(it); it.mesh.userData.item = it; itemsRoot.add(it.mesh);
    it.setKind(o.kind || it.kind, true);
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
  Item.prototype.label = function () { return '#' + this.num; };
  I.Item = Item;

  // A new issue: its cart rolls OUT of the mine tunnel (TUNNEL_DEPTH inside the rock) onto the cart rail.
  // 'spawn' fires at the start with { item, src, s, from, to, dur } so the mine can light up / animate.
  const EMERGE_DUR = 1.8;
  function spawnItem(src, o) {
    const rail = I.paths['cart-' + src]; if (!rail) return null;
    if (rail.items.some((x) => x.s < rail.gap * 1.6) || I.items.some((x) => x.emerge && x.src === src)) return null;
    const it = new Item(src, o); it.stage = 'Leaving the ' + MINE_DEFS[src].label + ' mine';
    I.items.push(it); I.counters.mined++;
    const to = new V3(); rail.at(0, to); const from = to.clone(); from.z -= TUNNEL_DEPTH;
    it.emerge = { t: 0, dur: EMERGE_DUR, s: 0, from, to, rail };
    showCarrier(it, 'cart'); it.mesh.position.copy(from); it.qT.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YZX')); it.mesh.quaternion.copy(it.qT);
    log(it.label() + ' ' + MINE_DEFS[src].label.toLowerCase() + ': ' + it.title, 'in');
    I.emit('spawn', { item: it, src, s: 0, from: from.clone(), to: to.clone(), dur: EMERGE_DUR });
    return it;
  }
  function stepEmerge(dt) {
    I.items.forEach((it) => {
      const e = it.emerge; if (!e) return;
      e.t += dt * it.boost; const k = smooth(Math.min(1, e.t / e.dur));
      it.mesh.position.copy(e.from).lerp(e.to, k);
      if (e.t >= e.dur && entryFree(e.rail, e.s)) { it.emerge = null; enterPath(it, e.rail, e.s, true); }
    });
  }
  // fallback carriers so the line reads before the mine / belts modules exist
  const FALLBACK_CARRIER = {
    cart: (K) => { const g = K.group(); K.box(0.7, 0.3, 0.5, 0x4a3a2c, 0, 0.05, 0, g); return g; },
    cage: (K) => { const g = K.group(); K.box(0.9, 0.06, 0.9, 0x3a3029, 0, -0.03, 0, g); return g; },
    bucket: (K) => { const g = K.group(); K.box(0.6, 0.3, 0.6, 0x5a3a24, 0, 0.0, 0, g); return g; },
  };
  function showCarrier(it, name) {
    for (const k in it.carrierMeshes) it.carrierMeshes[k].visible = false;
    if (!name) return;
    const c = I.carriers[name] || (FALLBACK_CARRIER[name] && { make: FALLBACK_CARRIER[name] });
    if (!c) return;
    if (!it.carrierMeshes[name]) { const cm = c.make(I.K, it); it.mesh.add(cm); it.carrierMeshes[name] = cm; }
    it.carrierMeshes[name].visible = true;
  }
  // Carrier handoffs fire events so the module that owns the carrier can draw an empty stand-in that carries on
  // moving (no pop): 'carrierDrop' when an item leaves a path with a carrier, 'carrierPick' when it boards one.
  function enterPath(it, path, s, keepCarrier) {
    it.path = path; it.s = s || 0; it.atEnd = false; it.owner = null; it.followObj = null; path.items.push(it);
    it.stage = path.label;
    if (!keepCarrier || path.carrier) showCarrier(it, path.carrier);
    if (path.carrier) I.emit('carrierPick', { item: it, carrier: path.carrier, path: path.name, pos: it.mesh.position.clone(), quat: it.mesh.quaternion.clone() });
    I.emit('enter', { item: it, path: path.name });
  }
  function leavePath(it) {
    if (!it.path) return; const path = it.path; const a = path.items; a.splice(a.indexOf(it), 1); it.path = null;
    for (const k in it.carrierMeshes) it.carrierMeshes[k].visible = false;
    if (path.carrier) I.emit('carrierDrop', { item: it, carrier: path.carrier, path: path.name, pos: it.mesh.position.clone(), quat: it.mesh.quaternion.clone() });
  }
  I.queueFor = (id) => I.pathList.filter((p) => p.port === id + '.in').reduce((n, p) => n + p.items.length, 0);

  const tmpV = new V3(), tmpO = new V3(), tmpE = new THREE.Euler();
  function stepPaths(dt) {
    I.pathList.forEach((path) => {
      if (!path.items.length) { path.moving = false; path.jamT = 0; path.jammed = false; path.flow += (1 - path.flow) * Math.min(1, dt * 3); return; }
      const arr = path.items.slice().sort((a, b) => b.s - a.s);
      let moved = false;
      arr.forEach((it, i) => {
        const maxS = i === 0 ? path.L : Math.min(path.L, arr[i - 1].s - path.gap);
        const ns = Math.min(it.s + path.speed * it.boost * dt, maxS);
        if (ns > it.s + 1e-5) moved = true;
        it.s = Math.max(it.s, ns);
        if (i === 0 && it.s >= path.L - 1e-4) {
          const nx = nextOf(path, it);
          if (nx) { if (entryFree(nx.path, nx.s)) { leavePath(it); enterPath(it, nx.path, nx.s); } else it.atEnd = true; }
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
      if (path.kind === 'lift') { tmpE.setFromQuaternion(it.qT, 'YZX'); tmpE.set(0, tmpE.y, 0, 'YZX'); it.qT.setFromEuler(tmpE); }
      else { tmpE.set(0, sg.yaw, sg.pitch, 'YZX'); it.qT.setFromEuler(tmpE); }
      it.mesh.quaternion.slerp(it.qT, ease);
      if (path.kind === 'tube') { tmpO.set(0, -0.2, 0).applyQuaternion(it.qT); it.mesh.position.add(tmpO); }
    }));
    I.items.forEach((it) => { if (it.emerge) it.mesh.quaternion.slerp(it.qT, ease); });
  }

  // =====================================================================
  // DRIVERS: who decides what really happens. The auto driver plays the mockup's dice. The game's driver
  // (ShaftScene) follows the real factory: same hooks, fed from FactoryState.
  //   intake(dt)            spawn new work
  //   route(item, st)       which assembler a planned item goes to (an id), when it leaves the planner
  //   ready(st, item)       may this item leave the station yet? (false: keep working, ask again next frame)
  //   judge(st, item)       a check's verdict { pass, reason } or null (not decided yet; ask again next frame)
  //   decision(st)          a NEEDS YOU text while the real station waits on the player, else null
  //   power(st)             { level 0..1, online } for power stations
  //   step(dt)              per-frame bookkeeping
  // =====================================================================
  let spawnT = 2;
  const AUTO = {
    name: 'auto',
    intake(dt) {
      if (!I.policy.intake) return;
      spawnT -= dt; if (spawnT > 0) return;
      const live = (I.layout.sources || []).filter((s) => I.paths['cart-' + s]);
      if (!live.length) return;
      let r = Math.random() * live.reduce((n, s) => n + (I.CFG.sourceWeight[s] || 0.2), 0);
      let src = live[0];
      for (const s of live) { r -= I.CFG.sourceWeight[s] || 0.2; if (r <= 0) { src = s; break; } }
      spawnItem(src);
      spawnT = lerp(I.CFG.spawnEvery[0], I.CFG.spawnEvery[1], Math.random());
    },
    route(it, st) {
      const asms = I.stationList.filter((s) => s.type === 'assembler');
      if (!asms.length) return null;
      const load = (s) => I.queueFor(s.id) + (s.item ? 1 : 0) + I.pathList.filter((p) => p.name.startsWith('feed-')).reduce((n, p) => n + p.items.filter((x) => x.dest === s.id).length, 0);
      return asms.slice().sort((a, b) => load(a) - load(b) || (Math.random() - 0.5))[0].id;
    },
    ready() { return true; },
    judge(st, it) {
      const base = I.CFG.rejectRate[st.type] === undefined ? 0.1 : I.CFG.rejectRate[st.type];
      const rate = it.attempts > 0 ? Math.min(base, I.CFG.rejectRateRetry) : base;
      const pass = Math.random() >= rate;
      const rs = REASONS[st.type] || REASONS.review;
      return { pass, reason: pass ? null : rs[Math.floor(Math.random() * rs.length)] };
    },
    decision() { return null; },
    power(st) { const t = I._t || 0; return { level: 0.55 + 0.4 * Math.sin(t * 0.07 + st.x), online: true }; },
    step() {},
  };
  I.AUTO = AUTO;
  I.driver = opts.driver || AUTO;
  I.setDriver = (d) => { I.driver = d || AUTO; };

  // =====================================================================
  // STATIONS (machines). Each machine module gets an M context.
  // =====================================================================
  const AURA_R = { planner: 3.75, assembler: 3.75, ci: 3.75, verify: 3.75, review: 3.75, check: 2.1, gate: 3.75, launch: 3.75, orbit: 2.6, measure: 2.4, steam: 2.0, dynamo: 1.7, battery: 1.5, geothermal: 2.2 };
  const STALL = { planner: 'Stalled by you: planner paused', assembler: 'Stalled by you: agent paused', gate: 'Stalled by you: merge held', launch: 'Stalled by you: launch held' };
  function station(def, holder, root) {
    const st = { id: def.id, type: def.type, tier: def.tier, x: def.x, y: def.y, z: def.z, def: def.def || {}, layoutDef: def,
      state: 'IDLE', detail: '', blocked: false, prompt: null, blockT: 0, manual: false, external: false, holder, item: null, resolveFns: [] };
    const ports = PORTS[def.type] || {};
    const portRoot = (name) => { const d = ports[name]; return d ? toRootAt(def, d.p[0], d.p[1], d.p[2]) : null; };
    const outPath = (port) => I.paths[I.layout.portOut[def.id + '.' + port]];
    const M = {
      id: def.id, type: def.type, tier: def.tier, def: st.def, harness: st.def.harness || null, group: holder, root,
      slotX: def.x, // (mockup name) root x of the holder
      toRoot: (x, y, z, out) => (out || new V3()).set(def.x + C45 * (x - z), def.y + y, def.z + C45 * (x + z)),
      rootOf(obj, out) { out = out || new V3(); obj.getWorldPosition(out); return root.worldToLocal(out); },
      port(name) { const d = ports[name]; if (!d) return null; return { local: new V3(d.p[0], d.p[1], d.p[2]), root: new V3().fromArray(portRoot(name)), out: d.out }; },
      waiting(port) {
        const key = def.id + '.' + (port || 'in');
        const cands = I.pathList.filter((p) => p.port === key).map((p) => p.items.find((it) => it.atEnd)).filter(Boolean);
        cands.sort((a, b) => (b.path.rework ? 1 : 0) - (a.path.rework ? 1 : 0));
        return cands[0] || null;
      },
      take(port) { const it = M.waiting(port); if (!it) return null; leavePath(it); it.owner = def.id; st.item = it; it.stage = st.label || def.type; I.emit('take', { item: it, station: def.id }); return it; },
      canGive(port) { const p = outPath(port); return !!p && entryFree(p, 0); },
      // may this item leave yet? (the real work might still be running). give() checks it too.
      ready(it) { return !it || I.driver.ready(st, it) !== false; },
      give(it, port) {
        const pth = outPath(port);
        if (!pth || !entryFree(pth, 0) || !M.ready(it)) return false;
        if (def.type === 'planner' && port === 'pass' && !it.dest) it.dest = I.driver.route(it, st) || null;
        it.owner = null; it.followObj = null; if (st.item === it) st.item = null;
        enterPath(it, pth, 0); I.emit('give', { item: it, station: def.id, port });
        return true;
      },
      setState(s, detail) { st.state = s; if (detail !== undefined) st.detail = detail; },
      setStage(it, text) { it.stage = text; },
      get blocked() { return st.blocked; },
      get stateShown() { return st.blocked ? 'BLOCKED' : st.state; },
      get item() { return st.item; },
      // ask the human. The machine must freeze while M.blocked is true.
      decision(text) { if (st.blocked) return; st.blocked = true; st.prompt = text; st.blockT = 0; st.manual = false; I.counters.decisions++; log('NEEDS YOU · ' + text, 'warn'); I.emit('decision', { station: def.id, text }); },
      // roll the dice for a natural decision point (auto driver only; the real factory raises its own). true if it blocked.
      maybeDecision(text) { if (I.driver !== AUTO || !I.policy.events) return false; if (Math.random() < (I.CFG.decisionChance[def.type] || 0)) { M.decision(text); return true; } return false; },
      onResolve(fn) { st.resolveFns.push(fn); },
      // a check's verdict for an item: { pass, reason }, or null while the real check is still running (ask again)
      judge(it) { const v = I.driver.judge(st, it); return v || null; },
      reject(it, reason) { it.attempts++; it.reason = reason; it.passed = {}; I.counters.rework++; log(it.label() + ' sent back by ' + (st.label || def.type) + ': ' + reason, 'bad'); I.emit('reject', { item: it, reason, station: def.id }); },
      pass(it) { it.passed[def.id] = true; log(it.label() + ' passed ' + (st.label || def.type), 'good'); I.emit('pass', { item: it, station: def.id }); },
      consume(it) { // shipped: remove from the world
        if (st.item === it) st.item = null; it.owner = null; leavePath(it); it.mesh.parent && it.mesh.parent.remove(it.mesh);
        const k = I.items.indexOf(it); if (k >= 0) I.items.splice(k, 1); I.counters.shipped++; log(it.label() + ' shipped · ' + it.title, 'ship'); I.emit('ship', { item: it, station: def.id });
      },
      queue() { return I.queueFor(def.id); },
      power() { return I.driver.power ? I.driver.power(st) : { level: 1, online: true }; },
      log
    };
    st.M = M;
    I.stations[def.id] = st; I.stationList.push(st);
    return { st, M };
  }
  I.resolve = (id) => {
    const st = I.stations[id]; if (!st || !st.blocked) return;
    st.blocked = false; const p = st.prompt; st.prompt = null; st.manual = false; st.external = false;
    log('Resolved · ' + (p || id), 'good'); I.emit('resolve', { station: id });
    st.resolveFns.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  };
  I.stall = (id) => { const st = I.stations[id]; if (!st || st.blocked) return; st.M.decision(STALL[st.type] || 'Stalled by you: paused'); st.manual = true; };
  function stepStations(dt) {
    for (const st of I.stationList) {
      // the driver's decisions (the real factory waiting on the player) win over the dice
      const want = I.driver.decision ? I.driver.decision(st) : null;
      if (want && !st.blocked) { st.M.decision(want); st.external = true; }
      else if (!want && st.blocked && st.external) I.resolve(st.id);
      else if (want && st.blocked && st.external && st.prompt !== want) st.prompt = want;
      if (st.blocked) { st.blockT += dt; if (I.policy.autoResolve && !st.external && I.driver === AUTO && st.blockT > I.policy.autoResolveAfter) I.resolve(st.id); }
    }
  }

  // =====================================================================
  // FALLBACK MACHINES: blockouts so the line runs before the real modules exist (or if one throws)
  // =====================================================================
  const plinth = (K, g, r, h) => K.box(r * 2, h || 0.4, r * 2, 0x3a332c, 0, (h || 0.4) / 2, 0, g);
  function fbChecker(K, M, o) {
    const g = K.group(); const r = o.r || 2.3; plinth(K, g, r);
    K.box(r * 1.1, 2.4, r * 1.1, o.col || 0x4a4038, 0, 1.6, -0.2, g);
    const eye = K.sph(0.35, K.glow(o.eye || 0x7af0d8), 0, 3.1, 0.6, g);
    const pin = M.port('in'), hold = K.group(g, pin ? pin.local.x * 0.3 : 0, 1.2, pin ? pin.local.z * 0.3 : 0);
    const lamp = K.statusLamp(g, r * 0.8, 0.4, -r * 0.8); const ct = K.caution(g, -r * 0.7, 0.4, r * 0.4, 0.8);
    let it = null, t0 = 0, v = null;
    return { g, update(t, dt) {
      ct.update(t, dt, M.stateShown); lamp.set(M.stateShown, t); if (M.blocked) return;
      if (!it) { it = M.take('in'); t0 = 0; v = null; if (it) { it.follow(hold); M.setState('WORKING', it.label() + ' ' + (o.verb || 'checking')); } else M.setState('IDLE', o.idle || 'waiting for PRs'); }
      else {
        t0 += dt;
        if (t0 > (o.dur || 2.5) && !v) { v = M.judge(it); if (v) { if (v.pass) { if (o.final) it.setKind('pass'); else it.flash(0x46ff8a); M.pass(it); } else { it.setKind('reject'); M.reject(it, v.reason); } } }
        if (v && t0 > (o.dur || 2.5) + 0.8 && M.give(it, v.pass ? 'pass' : 'reject')) { it = null; v = null; }
      }
      eye.scale.setScalar(it ? 1 + Math.sin(t * 8) * 0.15 : 0.7);
    } };
  }
  const FALLBACK = {
    planner(K, M) {
      const g = K.group(); K.cyl(2.4, 2.5, 0.5, 0x3a332c, 8, 0, 0.25, 0, g); const core = K.sph(0.5, K.glow(0x7af0d8), 0, 2.8, 0, g); const hold = K.group(g, 0, 2.0, 0);
      const lamp = K.statusLamp(g, 2, 0.5, 1.6); const ct = K.caution(g, -1.8, 0.5, 1.6);
      let it = null, t0 = 0;
      return { g, update(t, dt) {
        ct.update(t, dt, M.stateShown); lamp.set(M.stateShown, t); if (M.blocked) return;
        if (!it) { it = M.take('in'); t0 = 0; if (it) { it.follow(hold); M.setState('WORKING', it.label() + ' planning'); } else M.setState('IDLE', 'waiting for work'); }
        else { t0 += dt; if (t0 > 2.5 && M.ready(it) && M.give(it, 'pass')) it = null; }
        core.scale.setScalar(it ? 1 + Math.sin(t * 8) * 0.1 : 0.7);
      } };
    },
    assembler(K, M) {
      const g = K.group(); K.box(4.6, 0.4, 4.6, 0x3a332c, 0, 0.2, 0, g); K.box(1.4, 3.6, 1.4, 0x6a4a28, -1.1, 2.2, -1.1, g); const hold = K.group(g, 0, 1.6, 0);
      const lamp = K.statusLamp(g, 2, 0.4, 2); const ct = K.caution(g, 1.6, 0.4, -1.8);
      let it = null, t0 = 0;
      return { g, update(t, dt) {
        ct.update(t, dt, M.stateShown); lamp.set(M.stateShown, t); if (M.blocked) return;
        if (!it) { it = M.take('in'); t0 = 0; if (it) { it.follow(hold); M.setState('WORKING', it.label() + ' building'); } else M.setState('IDLE', 'waiting for work'); }
        else { t0 += dt; if (t0 > 1.2 && it.kind === 'issue') it.setKind('cards'); if (t0 > 2.6 && it.kind === 'cards') it.setKind('capsule'); if (t0 > 3.5 && M.give(it, 'out')) it = null; }
      } };
    },
    ci: (K, M) => fbChecker(K, M, { verb: 'running CI', col: 0x4a4038, eye: 0xffb040 }),
    check: (K, M) => fbChecker(K, M, { r: 1.25, verb: 'checking', col: 0x3a3a44, eye: 0x7af0d8, dur: 1.6 }),
    verify: (K, M) => fbChecker(K, M, { verb: 'verifying the fix', col: 0x3c4438, eye: 0x46e07a, dur: 3 }),
    review: (K, M) => fbChecker(K, M, { verb: 'in AI review', col: 0x40384a, eye: 0xb88aff, final: true, dur: 3 }),
    gate(K, M) {
      const g = K.group(); plinth(K, g, 2.3); K.box(0.4, 3.2, 0.4, 0x6a5a48, -1.6, 1.8, 0, g); K.box(0.4, 3.2, 0.4, 0x6a5a48, 1.6, 1.8, 0, g);
      const bar = K.box(3.6, 0.3, 0.3, 0xe0a018, 0, 3.2, 0, g); const hold = K.group(g, 0, 1.0, 0);
      const lamp = K.statusLamp(g, 1.9, 0.4, 1.9); const ct = K.caution(g, -1.8, 0.4, 1.6);
      let it = null, t0 = 0, v = null;
      return { g, update(t, dt) {
        ct.update(t, dt, M.stateShown); lamp.set(M.stateShown, t); if (M.blocked) return;
        if (!it) { it = M.take('in'); t0 = 0; v = null; if (it) { it.follow(hold); M.setState('WORKING', it.label() + ' at the gate'); } else M.setState('IDLE', 'nothing to merge'); }
        else {
          t0 += dt;
          if (t0 > 1.5 && !v) { if (M.maybeDecision('Merge ' + it.label() + ' into main?')) return; v = M.judge(it); if (v && !v.pass) { it.setKind('reject'); M.reject(it, v.reason); } }
          if (v && t0 > 2.4 && M.give(it, v.pass ? 'pass' : 'reject')) { it = null; v = null; }
        }
        bar.rotation.z = it && v && v.pass ? Math.min(1.4, (t0 - 1.5) * 2) : 0;
      } };
    },
    launch(K, M) {
      const g = K.group(); K.cyl(2.4, 2.5, 0.4, 0x3a332c, 8, 0, 0.2, 0, g); const rk = K.group(g, 0, 0.4, 0); K.cyl(0.5, 0.5, 3, 0x8a6428, 10, 0, 1.5, 0, rk); K.cone(0.5, 1, 0x7a3c20, 10, 0, 3.5, 0, rk);
      const lamp = K.statusLamp(g, 2, 0.4, 1.8); const ct = K.caution(g, -1.8, 0.4, 1.8);
      let it = null, t0 = 0;
      return { g, update(t, dt) {
        ct.update(t, dt, M.stateShown); lamp.set(M.stateShown, t); if (M.blocked) return;
        if (!it) { rk.position.y = 0.4; it = M.take('in'); t0 = 0; if (it) { it.follow(rk, 0, 2.0, 0.6); M.setState('WORKING', it.label() + ' loading'); } else M.setState('IDLE', 'pad clear'); }
        else { t0 += dt; if (t0 > 2.5) rk.position.y = 0.4 + (t0 - 2.5) ** 2 * 3; if (t0 > 4.5) { M.consume(it); it = null; } }
      } };
    },
    generic(K, M) {
      const g = K.group(); const r = (AURA_R[M.type] || 2) * 0.55; plinth(K, g, r, 0.3); K.box(r * 1.2, 1.6, r * 1.2, 0x4a4038, 0, 1.1, 0, g);
      const lamp = K.statusLamp(g, r * 0.9, 0.3, r * 0.9, 0.8);
      return { g, update(t) { M.setState('WORKING', M.type); lamp.set(M.stateShown, t); } };
    },
  };

  // =====================================================================
  // EVENT LOG
  // =====================================================================
  function log(text, kind) { I.log.unshift({ text, kind: kind || 'info', t: performance.now() }); if (I.log.length > 40) I.log.pop(); I.emit('log', I.log[0]); }
  I.logMsg = log;

  // =====================================================================
  // BUILD + STEP
  // =====================================================================
  let built = false;
  // layout: makeLayout(plan) from layout.js. build order: world -> underside (mine) -> belts -> other parts -> machines
  I.build = function (scene, root, layout, buildOpts) {
    buildOpts = buildOpts || {};
    I.layout = layout; I.root = root; I.scene = scene;
    layout.paths.forEach((d) => { const p = buildPath(d); I.paths[d.name] = p; I.pathList.push(p); });
    itemsRoot = dyn(group(root)); itemsRoot.name = 'items'; I.itemsRoot = itemsRoot;
    fxLayers.forEach((L) => scene.add(L.im));
    const ctx = { I, layout, paths: I.paths, pathList: I.pathList, stations: layout.stations, tiers: layout.tiers, mines: layout.mines, MINES: layout.mines,
      sources: layout.sources, PORTS, portOut: layout.portOut, toRootAt, C45, items: I.items };
    I.ctx = ctx;
    const updaters = [];
    const run = (name, fn, ...args) => { try { const u = fn(...args); if (u && u.update) updaters.push({ name, u }); } catch (e) { console.error('[SHAFT] module ' + name + ' failed:', e); I.failed = (I.failed || []).concat(name); } };
    const parts = I.mods.parts.slice().sort((a, b) => a.order - b.order);
    const has = (n) => parts.some((p) => p.name === n);
    if (!has('world')) { // blockout decks so the line stands on something
      for (const k in layout.tiers) { const T = layout.tiers[k]; const top = box(T.x1 - T.x0, 1.5, T.z1 - T.z0, 0x3a322a, (T.x0 + T.x1) / 2, T.y + 0.1 - 0.75, (T.z0 + T.z1) / 2, root); top.receiveShadow = true; }
    }
    parts.forEach((p) => {
      const g = group(root); g.name = 'part:' + p.name;
      run(p.name, p.fn, kitFor(p.name), g, p.name === 'world' ? scene : ctx, ctx);
    });
    if (!has('belts')) I.pathList.forEach((p) => { const pts = p.points.map((q) => new V3(q[0], q[1] - 0.02, q[2])); const geo = new THREE.BufferGeometry().setFromPoints(pts); root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: p.kind === 'tube' ? 0x7af0d8 : p.rework ? 0xff4a2a : p.ghost ? 0x5a4a3a : 0xffb040 }))); });
    layout.stations.forEach((def) => {
      const holder = group(root, def.x, def.y, def.z); holder.rotation.y = def.rot === undefined ? -Math.PI / 4 : def.rot; holder.name = 'station:' + def.id;
      const { st, M } = station(def, holder, root);
      st.label = (buildOpts.labels && buildOpts.labels[def.id]) || def.label || def.type;
      const fn = I.mods.machines[def.type] || FALLBACK[def.type] || FALLBACK.generic;
      try { const inst = fn(kitFor(def.type), M); holder.add(inst.g); st.inst = inst; st.fallback = !I.mods.machines[def.type]; }
      catch (e) {
        console.error('[SHAFT] machine ' + def.type + ' (' + def.id + ') failed:', e); I.failed = (I.failed || []).concat(def.type);
        const inst = (FALLBACK[def.type] || FALLBACK.generic)(kitFor(def.type), M); holder.add(inst.g); st.inst = inst; st.fallback = true;
      }
    });
    I.updaters = updaters; built = true;
    // every Phong material lights the legacy way, even ones a module made without the kit
    root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(legacy); });
    // perf: tiny parts (rivets, bolts, rungs, wires) don't cast shadows — halves the shadow pass, no visible change
    const sv = new V3(); let culled = 0;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      o.getWorldScale(sv); const r = g.boundingSphere.radius * Math.max(sv.x, sv.y, sv.z);
      if (r < 0.16) { o.castShadow = false; culled++; }
    });
    I.perf = { shadowCulled: culled, lights: lightsTotal };
    // STATE AURA: a ring on the floor around each line machine (dim blue idle, green working, pulsing amber/red
    // blocked) plus a tall amber beacon beam when blocked, so state reads from the art at any zoom.
    for (const st of I.stationList) {
      const h = st.holder, r = (st.layoutDef.aura || AURA_R[st.type] || 2);
      const aura = dyn(group(h)); aura.name = 'aura';
      const ringM = glow(0x8fa2c8, 0.12, true);
      const ring = torus(r, 0.07, ringM, 4, 64, 0, 0.14, 0, aura); ring.rotation.x = Math.PI / 2;
      const ping = torus(r, 0.06, glow(0xffb020, 0.8, true), 4, 64, 0, 0.15, 0, aura); ping.rotation.x = Math.PI / 2; ping.visible = false;
      const beam = cyl(0.14, 0.14, 16, glow(0xffb020, 0.4, true), 8, 0, 16, 0, aura); beam.visible = false;
      const beamCore = cyl(0.05, 0.05, 16, glow(0xfff0c0, 0.7, true), 6, 0, 16, 0, aura); beamCore.visible = false;
      [ring, ping, beam, beamCore].forEach((m) => { m.castShadow = false; m.receiveShadow = false; m.userData.noBake = true; });
      st.aura = { ring, ringM, ping, beam, beamCore };
    }
    if (buildOpts.warm !== false && I.driver === AUTO) warmStart();
    log('The line is running. Work is mined deep under the foundry.', 'info');
  };
  // put an item on a path at a fraction of its length (warm starts, and the game's driver catching up)
  const put = (src, pathName, frac, kind, o) => {
    const pth = I.paths[pathName]; if (!pth) return null;
    const s = pth.L * frac; if (!entryFree(pth, s)) return null;
    const it = new Item(src, o); I.items.push(it);
    if (kind) it.setKind(kind, true);
    enterPath(it, pth, s); const sg = pth.at(it.s, tmpV); it.mesh.position.copy(tmpV);
    tmpE.set(0, sg.yaw, pth.kind === 'lift' ? 0 : sg.pitch, 'YZX'); it.qT.setFromEuler(tmpE); it.mesh.quaternion.copy(it.qT);
    return it;
  };
  I.put = put;
  // WARM START (auto driver): work at every stage so the line is busy from the first second
  function warmStart() {
    const L = I.layout, srcs = (L.sources || []).filter((s) => I.paths['cart-' + s]);
    const S = (i) => srcs[i % Math.max(1, srcs.length)] || 'github';
    put(S(0), 'collector', 0.55); put(S(1), 'lift', 0.5); put(S(2), 'ore', 0.95); put(S(3), 'ore', 0.45);
    const asms = L.assemblers || [];
    asms.forEach((a, i) => { const it = put(S(i + 1), 'spur-' + a.id, 0.92); if (it) it.dest = a.id; });
    if (asms.length) { const it = put(S(2), 'feed-0', 0.4); if (it) it.dest = asms[asms.length - 1].id; }
    if (asms[0]) put(S(0), 'tube-' + asms[0].id, 0.6, 'capsule');
    put(S(1), 'header', 0.5, 'capsule');
    (L.checks || []).slice(0, -1).forEach((c, i) => { if (i % 2 === 0) put(S(i), 'lane-' + c.id, 0.6, 'capsule'); });
    put(S(3), 'to-lift', 0.7, 'pass'); put(S(0), 'to-gate', 0.5, 'pass'); put(S(1), 'rework', 0.35, 'reject', { attempts: 1 });
    const cap = (it) => { if (it) it.attempts = Math.max(1, it.attempts); };
    cap(I.items[I.items.length - 1]);
    srcs.slice(0, 1).forEach((s) => spawnItem(s));
  }
  const fv = new V3();
  I.step = function (t, dt) {
    if (!built) return;
    dt *= I.policy.speed; I._t = t;
    if (I.driver.step) I.driver.step(dt, t);
    if (I.driver.intake) I.driver.intake(dt);
    stepEmerge(dt);
    stepPaths(dt);
    stepStations(dt);
    I.updaters.forEach(({ name, u }) => { try { u.update(t, dt); } catch (e) { if (!u._err) { console.error('[SHAFT] ' + name + ' update:', e); u._err = 1; } } });
    for (const st of I.stationList) { try { st.inst.update(t, dt); } catch (e) { if (!st._err) { console.error('[SHAFT] ' + st.id + ' update:', e); st._err = 1; } } }
    for (const st of I.stationList) {
      const a = st.aura; if (!a) continue;
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
      const h = it.parts.halo; const base = held ? 0.26 + Math.sin(t * 10) * 0.12 : 0.16 + Math.sin(t * 3 + it.num) * 0.04;
      h.material.opacity = base; h.scale.setScalar(held ? 0.85 + Math.sin(t * 10) * 0.08 : 0.8);
      if (held) h.material.color.setHex(Math.sin(t * 10) > 0 ? 0xffb020 : 0xff3020);
      else h.material.color.setHex(it.kind === 'issue' ? it.parts.src : I.KIND_COLOR[it.kind]);
    });
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; const k = f.t / 0.7; f.r.scale.setScalar(1 + k * 3); f.r.material.opacity = 0.9 * (1 - k); if (k >= 1) { f.r.parent && f.r.parent.remove(f.r); f.r.material.dispose(); flashes.splice(i, 1); } }
    updateFx(dt);
  };
  I.spawnItem = spawnItem;
  I.enterPath = enterPath; I.leavePath = leavePath; I.entryFree = entryFree;
  // remove an item from the world without shipping it (the real item vanished: closed, merged elsewhere)
  I.removeItem = (it) => {
    if (it.owner && I.stations[it.owner] && I.stations[it.owner].item === it) I.stations[it.owner].item = null;
    leavePath(it); it.owner = null; it.emerge = null; it.mesh.parent && it.mesh.parent.remove(it.mesh);
    const k = I.items.indexOf(it); if (k >= 0) I.items.splice(k, 1);
  };
  I.debug = {
    // run the simulation forward without rendering (for screenshots in a slow headless browser)
    advance(sec, step) { step = step || 1 / 30; const n = Math.round(sec / step); for (let i = 0; i < n; i++) { I._t = (I._t || 0) + step; I.step(I._t, step); } },
    stats() {
      return { items: I.items.length, counters: I.counters, failed: I.failed || [], lights: lightsTotal,
        stations: Object.fromEntries(I.stationList.map((s) => [s.id, (s.blocked ? 'BLOCKED' : s.state) + (s.fallback ? ' (fallback)' : '')])),
        paths: Object.fromEntries(I.pathList.filter((p) => p.items.length).map((p) => [p.name, p.items.length])) };
    }
  };
  I.dispose = () => {
    const geos = new Set(), mats = new Set(), texs = new Set();
    if (I.root) I.root.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach((m) => { mats.add(m); for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); } });
    });
    fxLayers.forEach((L) => { L.im.removeFromParent(); geos.add(L.im.geometry); mats.add(L.im.material); L.im.dispose(); });
    geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
    fx.length = 0; flashes.length = 0; I.listeners = {}; built = false;
  };
  return I;
}
