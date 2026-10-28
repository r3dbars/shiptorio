// =====================================================================
// FLOTILLA · far-off floating foundries (floating-city art pass, slice 4)
// 5-7 small floating factories (a rock with a foundry on it, a few lit windows, one smoke wisp each) bob and drift
// slowly through the sky behind the shaft, plus one far lane of tiny moving lights (barges, drones, signal buoys).
// Installs only with ?artpass=1.
//
// The camera is orthographic, so depth is faked (ART-PASS.md): each piece follows the camera by a fraction of its pans
// (parallax 0.5-0.7 for the foundries, 0.8 for the lane), wraps around a span wider than any view so no edge ever
// shows when you drag, and keeps nearly the same size on screen when you zoom, the way far things do. The kit's
// follow() moves whole objects; here every foundry wraps on its own, so the vertex shaders place the instances from
// the camera the kit's 'camera' event hands over. Root z -40 (parallax 0.5) to -56 (0.7 and the lane), render order
// ORDER.flotilla: behind the bottleneck veil. Painted in the pixel style on one small canvas atlas.
// Budget: 3 draw calls (foundries + windows, smoke, lane), 0 lights, no shadows. Everything dims with
// scene.backgroundIntensity like the sky; under reduced motion / calm (B.calm()) it all holds still.
// =====================================================================

import { artPass, backdrop, ORDER, Z } from '../backdrop-kit.js';

const HOME_Y = 6; // the root height the sky is laid out around
const REF_H = 30; // at this view height normalized units = world units
const ZOOM_K = 0.85; // how much of a zoom far things ignore (1 = fixed size on screen)
const SPAN = 100; // wrap span (normalized), wider than the widest view

const TILE = 64, VARS = 4; // atlas: VARS tiles across; row 0 = the foundry, row 1 = its lit windows

// u, v (normalized, around the ref), parallax, size, variant, phase, flip, drift (normalized units / s)
const FOUNDRIES = [
  [-41, 17, 0.62, 6.6, 0, 0.0, 1, 0.07],
  [-27, -7, 0.52, 8.2, 1, 1.7, -1, 0.05],
  [-19, 13, 0.7, 5.0, 2, 3.1, 1, 0.09],
  [5, -12, 0.58, 7.0, 3, 6.0, -1, 0.055],
  [19, 5, 0.56, 7.4, 3, 4.4, 1, 0.06],
  [33, -8, 0.66, 5.6, 0, 2.2, -1, 0.08],
  [46, 14, 0.6, 6.2, 1, 5.3, -1, 0.065],
];
const PUFFS = 6; // smoke puffs per wisp
const LANE = { v: 2.5, f: 0.8, n: 44 };

function srand(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

// shared vertex code: where an instance sits, in root space (the part's group is the root's frame)
const [Z_NEAR, Z_FAR] = Z.flotilla;
const PLACE = /* glsl */ `
  uniform vec3 uR, uU, uCam; uniform float uZ, uT;
  float wrapU(float r) { return mod(r + ${(SPAN / 2).toFixed(1)}, ${SPAN.toFixed(1)}) - ${(SPAN / 2).toFixed(1)}; }
  // normalized (u, v) at parallax f -> root. Laid out on the plane z = zl (nearer for less parallax); u, v are
  // screen offsets from the camera's center at uZ = 1, so the camera's own pan (d) moves them by (1 - f) of it
  vec3 place(float u, float v, float f, out float zs) {
    float zl = clamp(${Z_NEAR.toFixed(1)} + (f - 0.5) * ${((Z_FAR - Z_NEAR) / 0.2).toFixed(1)}, ${Z_FAR.toFixed(1)}, ${Z_NEAR.toFixed(1)});
    vec3 h = vec3(0.0, ${HOME_Y.toFixed(1)}, zl);
    vec3 d = uCam - h; float dx = dot(d, uR), dy = dot(d, uU);
    float ru = wrapU(u - (1.0 - f) * dx / uZ);
    float rv = v - (1.0 - f) * dy / uZ;
    zs = uZ;
    // right along the screen, up the world's vertical (so the layer stays on its z plane)
    return h + uR * (dx + ru * uZ) + vec3(0.0, (dy + rv * uZ) / uU.y, 0.0);
  }
`;

export default function install(IRON) {
  IRON.part('flotilla', function (K, root, ctx) {
    if (!artPass()) return { update() {} };
    const THREE = K.THREE;
    const I = ctx.I;
    const B = backdrop(I, root);
    const rnd = srand(4242);
    const chim = []; // per variant: chimney tops [x, y] in tile units (-0.5..0.5, +y up)

    // ---------------- the atlas ----------------
    const cv = document.createElement('canvas');
    cv.width = TILE * VARS; cv.height = TILE * 2;
    const g = cv.getContext('2d');
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const mix = (a, b, k) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); return (f(16) << 16) | (f(8) << 8) | f(0); };
    const px = (x, y, c, w = 1, h = 1) => { g.fillStyle = hex(c); g.fillRect(x, y, w, h); };
    const ST = { lite: 0x7a6656, mid: 0x5e4e44, dark: 0x40342e, deep: 0x2c2422, rust: 0x7a4026, soot: 0x221a18, ember: 0xff7a2a };
    const IR = { face: 0x3c322c, side: 0x2a221e, lite: 0x58483c, roof: 0x4a3c32, brass: 0x8a6a34 };
    const WIN = [0xffc070, 0xe09a4a, 0xffd890];

    function paint(v) {
      const ox = v * TILE, wy = TILE; // window mask row
      const top = 36 + Math.floor(rnd() * 3); // deck line
      const tip = 58 + Math.floor(rnd() * 4);
      const half = 18 + Math.floor(rnd() * 5);
      const cx = 32 + Math.floor((rnd() - 0.5) * 4);
      // ROCK: faceted, tapering, strata, lit from the upper left, furnace glow from below
      const facets = [];
      for (let x = -half; x <= half; x += 3 + Math.floor(rnd() * 4)) facets.push({ x, k: rnd() });
      for (let y = top; y <= tip; y++) {
        const p = (y - top) / (tip - top);
        let hw = half * (1 - Math.pow(p, 1.35)) + (rnd() < 0.3 ? 1 : 0);
        if (p > 0.92) hw = Math.min(hw, 1.5);
        const sh = Math.round(Math.sin(y * 0.7 + v) * 0.8); // the tip wanders a little
        for (let x = Math.round(-hw); x <= Math.round(hw); x++) {
          const fi = facets.reduce((a, f, i) => (x >= f.x ? i : a), 0);
          const side = x / Math.max(1, hw); // -1 left (lit) .. 1 right
          let c = side < -0.35 ? ST.lite : side < 0.25 ? ST.mid : side < 0.7 ? ST.dark : ST.deep;
          if (facets[fi].k < 0.3) c = mix(c, ST.deep, 0.35);
          if ((y - top) % 5 === 4) c = mix(c, ST.soot, 0.45); // strata
          if (facets[fi].k > 0.82 && p > 0.15 && (x + y) % 2 === 0) c = mix(c, ST.rust, 0.5); // rust streaks
          c = mix(c, ST.ember, Math.pow(p, 2.2) * 0.42 * (0.6 + 0.4 * (1 - Math.abs(side)))); // lit from the smog
          px(ox + cx + x + sh, y, c);
        }
      }
      // the deck lip: a light cobble edge on an iron band
      px(ox + cx - half - 1, top - 1, ST.lite, half * 2 + 3, 1);
      px(ox + cx - half, top, IR.side, half * 2 + 1, 1);
      // rubble chunks hanging below
      for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
        const rx = cx + Math.round((rnd() - 0.5) * half * 1.6), ry = tip - 6 + Math.floor(rnd() * 5);
        if (Math.abs(rx - cx) < 5) continue;
        px(ox + rx, ry, ST.mid, 2, 2); px(ox + rx + 1, ry + 1, ST.deep); px(ox + rx, ry + 2, mix(ST.dark, ST.ember, 0.4), 2, 1);
      }
      // FOUNDRY: a row of sheds and halls on the deck, chimneys, a gantry or a gasometer
      const tops = [];
      let x = cx - half + 2;
      const end = cx + half - 2;
      while (x < end - 3) {
        const w = Math.min(end - x, 5 + Math.floor(rnd() * 8));
        const h = 5 + Math.floor(rnd() * 11);
        const y0 = top - 1 - h;
        px(ox + x, y0, IR.face, w, h); // wall
        px(ox + x, y0, IR.lite, 1, h); // lit left edge
        px(ox + x + w - 1, y0, IR.side, 1, h);
        const roof = rnd();
        if (roof < 0.35) { for (let i = 0; i < w; i += 3) { px(ox + x + i, y0 - 1, IR.roof, 2, 1); px(ox + x + i, y0 - 2, IR.roof, 1, 1); } } // sawtooth
        else if (roof < 0.65) { for (let i = 0; i < Math.ceil(w / 2); i++) px(ox + x + i, y0 - 1 - Math.min(i, w - 1 - i) / 2, IR.roof, Math.max(1, w - i * 2), 1); } // gable
        else px(ox + x - 1, y0 - 1, IR.side, w + 2, 1); // flat with a cornice
        // windows: rows of small lit panes (window mask row), a furnace door at the foot
        for (let wy0 = y0 + 2; wy0 < top - 3; wy0 += 3) {
          for (let wx = x + 1; wx < x + w - 1; wx += 2) {
            if (rnd() < 0.42) { const c = WIN[Math.floor(rnd() * WIN.length)]; px(ox + wx, wy + wy0, c); px(ox + wx, wy0, mix(c, IR.face, 0.5)); }
          }
        }
        if (rnd() < 0.5 && w > 4) { const dx = x + 1 + Math.floor(rnd() * (w - 3)); px(ox + dx, wy + top - 4, ST.ember, 2, 3); px(ox + dx, top - 4, ST.ember, 2, 3); }
        tops.push({ x, w, y0 });
        x += w + (rnd() < 0.4 ? 1 : 0);
      }
      // chimneys: one or two tall stacks with a brass band, an ember at the lip; the tallest smokes
      const nc = 1 + Math.floor(rnd() * 2);
      let best = null;
      for (let i = 0; i < nc; i++) {
        const b = tops[Math.floor(rnd() * tops.length)];
        const sx = b.x + 1 + Math.floor(rnd() * Math.max(1, b.w - 3));
        const sy = Math.max(3, b.y0 - 8 - Math.floor(rnd() * 12));
        px(ox + sx, sy, IR.side, 2, b.y0 - sy); px(ox + sx, sy, IR.lite, 1, b.y0 - sy);
        px(ox + sx - 1, sy, IR.roof, 4, 1); px(ox + sx, sy + 3, IR.brass, 2, 1);
        px(ox + sx, wy + sy + 1, ST.ember, 2, 1);
        if (!best || sy < best[1]) best = [sx + 1, sy];
      }
      chim[v] = [best[0] / TILE - 0.5, 0.5 - best[1] / TILE];
      // a gantry crane (variants 1, 3) or a gasometer (0, 2) at one end
      if (v % 2) {
        const gx = cx + half - 4, gy = top - 15;
        px(ox + gx, gy, IR.side, 1, 14); px(ox + gx - 8, gy, IR.side, 11, 1);
        for (let i = 0; i < 8; i += 2) px(ox + gx - 8 + i, gy + 1, IR.lite);
        px(ox + gx - 7, gy + 1, IR.side, 1, 5); px(ox + gx - 8, gy + 6, IR.brass, 3, 1);
        px(ox + gx, wy + gy - 1, 0xff4a3a); px(ox + gx, gy - 1, 0xff4a3a); // a red warning lamp
      } else {
        const gx = cx - half + 4, r = 4;
        for (let yy = -r; yy <= r; yy++) { const ww = Math.round(Math.sqrt(r * r - yy * yy)); px(ox + gx - ww, top - 1 - r + yy - 1, yy < 0 ? IR.lite : IR.face, ww * 2 + 1, 1); }
        px(ox + gx - r, top - 1 - r, IR.brass, r * 2 + 1, 1);
      }
    }
    for (let v = 0; v < VARS; v++) paint(v);
    const atlas = new THREE.CanvasTexture(cv);
    atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
    atlas.generateMipmaps = false;
    atlas.colorSpace = THREE.NoColorSpace;

    // ---------------- shared uniforms (set from the camera each frame) ----------------
    const U = {
      uR: { value: new THREE.Vector3(1, 0, 0) }, uU: { value: new THREE.Vector3(0, 1, 0) }, uCam: { value: new THREE.Vector3() },
      uZ: { value: 1 }, uT: { value: 0 }, uDim: { value: 1 }, uHaze: { value: new THREE.Color(0x3a2416) }, uAtlas: { value: atlas },
    };
    const inv = new THREE.Matrix4(), rot = new THREE.Quaternion();
    // every frame, once the camera is placed: its position and screen axes in root space, and the zoom
    I.on('camera', (e) => {
      const cam = e.camera, sroot = e.root || root.parent;
      if (!cam || !sroot) return;
      inv.copy(sroot.matrixWorld).invert();
      sroot.getWorldQuaternion(rot).invert();
      U.uCam.value.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(inv);
      U.uR.value.setFromMatrixColumn(cam.matrixWorld, 0).applyQuaternion(rot).normalize();
      U.uU.value.setFromMatrixColumn(cam.matrixWorld, 1).applyQuaternion(rot).normalize();
      const vh = e.viewH || (cam.top - cam.bottom) / (cam.zoom || 1);
      U.uZ.value = Math.pow(Math.max(1, vh) / REF_H, ZOOM_K);
      const sc = e.scene, bi = sc && typeof sc.backgroundIntensity === 'number' ? sc.backgroundIntensity : 1;
      U.uDim.value = bi;
      if (sc && sc.fog) U.uHaze.value.copy(sc.fog.color);
    });
    function layer(geo, mat, name, order) {
      const m = new THREE.Mesh(geo, mat);
      m.name = 'flotilla:' + name;
      m.frustumCulled = false; // placed in the shader
      m.castShadow = m.receiveShadow = false;
      m.renderOrder = order;
      m.userData.noBake = true;
      K.dyn(m);
      root.add(m);
      return m;
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    const inst = (geo, name, rows) => {
      const n = rows.length, a = new Float32Array(n * rows[0].length);
      rows.forEach((r, i) => a.set(r, i * r.length));
      const g2 = new THREE.InstancedBufferGeometry().copy(geo);
      for (let k = 0; k < rows[0].length; k += 4) g2.setAttribute(name[k / 4], new THREE.InstancedBufferAttribute(a.filter((_, j) => j % rows[0].length >= k && j % rows[0].length < k + 4), 4));
      g2.instanceCount = n;
      return g2;
    };

    // ---------------- 1 · the foundries (rock + factory + lit windows): one opaque call ----------------
    const fRows = FOUNDRIES.map((F) => F.slice());
    const bodyMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */ `${PLACE}
        attribute vec4 aA; attribute vec4 aB; varying vec2 vUv; varying float vHaze, vVar, vFlick;
        void main() {
          float zs; float bob = sin(uT * 0.31 + aB.y) * 0.22 + sin(uT * 0.17 + aB.y * 2.0) * 0.12;
          vec3 c = place(aA.x + aB.w * uT, aA.y + bob, aA.z, zs);
          float s = aA.w * zs;
          vec3 w = c + uR * (position.x * s * aB.z) + uU * (position.y * s);
          vUv = uv; vVar = aB.x; vHaze = clamp((aA.z - 0.45) * 2.2, 0.0, 0.75);
          vFlick = 0.86 + 0.14 * sin(uT * 1.7 + aB.y * 5.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas; uniform float uDim; uniform vec3 uHaze;
        varying vec2 vUv; varying float vHaze, vVar, vFlick;
        void main() {
          vec2 a = vec2((vVar + vUv.x) / ${VARS.toFixed(1)}, vUv.y * 0.5 + 0.5);
          vec4 body = texture2D(uAtlas, a);
          if (body.a < 0.5) discard;
          vec4 win = texture2D(uAtlas, a - vec2(0.0, 0.5));
          vec3 c = mix(body.rgb, uHaze, vHaze) * mix(0.3, 1.0, uDim);
          if (win.a > 0.5) c = win.rgb * vFlick * (1.0 - vHaze * 0.45) * mix(0.25, 1.0, uDim);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthWrite: true,
      side: THREE.DoubleSide, // a flipped foundry turns its quad around
      fog: false,
    });
    layer(inst(quad, ['aA', 'aB'], fRows), bodyMat, 'foundries', ORDER.flotilla);

    // ---------------- 2 · one smoke wisp per foundry: one transparent call ----------------
    const sRows = [];
    FOUNDRIES.forEach((F) => { const [cxp, cyp] = chim[F[4]]; for (let k = 0; k < PUFFS; k++) sRows.push([...F, cxp, cyp, k / PUFFS, 0]); });
    const smokeMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */ `${PLACE}
        attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; varying vec2 vUv; varying float vA, vHaze;
        void main() {
          float zs; float bob = sin(uT * 0.31 + aB.y) * 0.22 + sin(uT * 0.17 + aB.y * 2.0) * 0.12;
          vec3 c = place(aA.x + aB.w * uT, aA.y + bob, aA.z, zs);
          float s = aA.w * zs, life = fract(uT * 0.07 + aC.z + aB.y * 0.13);
          vec3 at = c + uR * (aC.x * s * aB.z + life * life * s * 0.28) + uU * (aC.y * s + life * s * 0.42);
          float r = s * (0.06 + life * 0.16);
          vec3 w = at + uR * position.x * r + uU * position.y * r;
          vUv = uv; vA = smoothstep(0.0, 0.12, life) * (1.0 - life) * 0.75; vHaze = clamp((aA.z - 0.45) * 2.2, 0.0, 0.75);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDim; uniform vec3 uHaze; varying vec2 vUv; varying float vA, vHaze;
        void main() {
          vec2 q = floor(vUv * 8.0) / 7.0 - 0.5; float d = length(q) * 2.0;
          if (d > 1.0) discard;
          float a = vA * (d < 0.6 ? 1.0 : 0.6);
          vec3 c = mix(mix(vec3(0.27, 0.23, 0.2), vec3(0.4, 0.33, 0.27), step(q.y, -0.1)), uHaze, vHaze * 0.6) * mix(0.3, 1.0, uDim);
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true, depthWrite: false, fog: false,
    });
    layer(inst(quad, ['aA', 'aB', 'aC'], sRows), smokeMat, 'smoke', ORDER.flotilla);

    // ---------------- 3 · the far lane: tiny lights trundling both ways: one additive call ----------------
    const lRows = [];
    const LCOL = [[1, 0.78, 0.45], [1, 0.62, 0.3], [0.48, 0.94, 0.85], [1, 0.32, 0.24], [1, 0.9, 0.7]];
    for (let i = 0; i < LANE.n; i++) {
      const dir = i % 2 ? 1 : -1, c = LCOL[Math.floor(rnd() * LCOL.length)];
      // u, v, parallax, size · speed, phase, blink, - · r, g, b, -
      lRows.push([(rnd() - 0.5) * SPAN, LANE.v + dir * 0.45 + (rnd() - 0.5) * 0.25, LANE.f, 0.2 + rnd() * 0.12, dir * (0.25 + rnd() * 0.35), rnd() * 6.28, rnd() < 0.35 ? 1 : 0, 0, ...c, 0]);
    }
    const laneMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */ `${PLACE}
        attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; varying vec2 vUv; varying vec3 vC;
        void main() {
          float zs; vec3 c = place(aA.x + aB.x * uT, aA.y + sin(uT * 0.4 + aB.y) * 0.08, aA.z, zs);
          float r = aA.w * zs;
          vec3 w = c + uR * position.x * r * 2.0 + uU * position.y * r;
          float blink = aB.z > 0.5 ? step(0.55, fract(uT * 0.6 + aB.y)) * 0.85 + 0.15 : 1.0;
          vUv = uv; vC = aC.rgb * blink;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDim; varying vec2 vUv; varying vec3 vC;
        void main() {
          vec2 q = abs(floor(vUv * vec2(6.0, 3.0)) - vec2(2.5, 1.0));
          float core = step(q.x, 0.5) * step(q.y, 0.0);
          float a = core + (1.0 - core) * 0.28 * step(q.x + q.y, 1.5);
          if (a <= 0.0) discard;
          gl_FragColor = vec4(vC * a * mix(0.45, 0.9, uDim), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    layer(inst(quad, ['aA', 'aB', 'aC'], lRows), laneMat, 'lane', ORDER.flotilla - 1);

    // reduced motion / calm: everything holds at one moment
    const STILL = 41;
    return { update(t) { U.uT.value = B.calm() ? STILL : t; } };
  });
}
