// FLOATING CITY · the endless skyline (art pass slice 2, only with ?artpass=1). Three bands of foundry city painted
// on canvas in the Black Iron pixel style (sooty blocks, sawtooth sheds, chimneys with ember tops, gantry cranes,
// water towers, gasometers, rows of lit windows), each one quad that follows the orthographic camera at its own
// fraction (far 0.92, mid 0.8, near 0.62) with its texture wrapping sideways, so a drag or a zoom never finds an
// edge. Each band fades down into the haze, the far ones palest. The old city's landmarks (pithead headframe,
// cooling tower, gantry crane, gasometer, the two tall chimneys) become the near ring, painted into the near band.
//
// Cost: 3 draw calls, 0 lights, 0 blended layers (cut-out pixels, opaque pass). Windows dim with the sky
// (scene.backgroundIntensity), beacons pulse slowly and hold still when the kit says calm.
//
// Why not B.follow(box, f, { wrap }): a band here is a quad that hugs the camera's frustum every frame (its width is
// the view's width, its bottom the view's bottom, the texture's last row is pure haze and clamps), so it can't run
// out at any zoom or pan, and it scrolls its own UVs in the shader. Same factors and dimming rules as the kit.
import * as THREE from 'three';
import { artPass, backdrop, ORDER } from '../backdrop-kit.js';

// screen-height (root y) the stack view centers on: the bands sit where they're painted when the camera is there
const REF = [0, 5, -8.4];
const BANDS = [
  // far: tall pale spires, sparse dim windows
  { name: 'far', order: ORDER.skyFar, f: 0.92, px: 0.22, W: 1024, H: 256, top: 32, dist: 340, seed: 11, body: [0x70, 0x38, 0x1c], hi: [0x80, 0x42, 0x22], haze: [0x7c, 0x3c, 0x18],
    tall: [90, 210], low: [50, 110], win: 0.16, winC: [[0xb0, 0x6a, 0x34], [0xc8, 0x84, 0x44]], fade: [0.5, 0.93], spire: 0.22, gantry: 0.08, chim: 0.3, dome: 0.12, tower: 0.06 },
  // mid: the foundry district, sawtooth sheds and stacks
  { name: 'mid', order: ORDER.skyMid, f: 0.8, px: 0.3, W: 1024, H: 256, top: 26, dist: 320, seed: 23, body: [0x4c, 0x2a, 0x1a], hi: [0x64, 0x38, 0x22], haze: [0x78, 0x3a, 0x18],
    tall: [80, 190], low: [40, 100], win: 0.3, winC: [[0xe0, 0x9a, 0x4a], [0xc8, 0x7c, 0x3a], [0xff, 0xd0, 0x90]], fade: [0.56, 0.95], spire: 0.08, gantry: 0.14, chim: 0.45, dome: 0.1, tower: 0.12 },
  // near: dark heavy blocks with bright windows, plus the landmarks
  { name: 'near', order: ORDER.skyNear, f: 0.62, px: 0.4, W: 1024, H: 256, top: 12, dist: 300, seed: 37, body: [0x2a, 0x1a, 0x12], hi: [0x46, 0x2a, 0x1a], haze: [0x72, 0x36, 0x16],
    tall: [70, 170], low: [40, 90], win: 0.42, winC: [[0xe0, 0x9a, 0x4a], [0xff, 0xd0, 0x90], [0xe0, 0x9a, 0x4a]], fade: [0.64, 0.97], spire: 0.04, gantry: 0.1, chim: 0.5, dome: 0.06, tower: 0.14, landmarks: true },
];

// alpha codes in the painted tile (the shader reads them; anything under 0.3 is sky)
const A_BODY = 255, A_WIN = 190, A_BEACON = 120;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// one band's tile: a pixel buffer that wraps sideways (every shape is drawn at x and x - W)
function paint(B) {
  const { W, H } = B, buf = new Uint8Array(W * H * 4), r = rng(B.seed);
  const set = (x, y, c, a) => {
    x = Math.floor(x); y = Math.floor(y); if (y < 0 || y >= H) return;
    x = ((x % W) + W) % W; const i = (y * W + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
  };
  const rect = (x, y, w, h, c, a) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c, a === undefined ? A_BODY : a); };
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const body = B.body, dark = shade(body, 0.8), hi = B.hi;
  const pick = (a) => a[Math.floor(r() * a.length)];
  const win = () => pick(B.winC);
  const base = H; // everything stands on the bottom row (the haze fills below)

  // a block: body down to the base, a lit left edge, rows of windows
  function block(x, top, w, opt) {
    opt = opt || {};
    rect(x, top, w, base - top, r() < 0.5 ? body : dark);
    rect(x, top, 1, base - top, hi);
    const dens = opt.win === undefined ? B.win : opt.win;
    const gx = r() < 0.5 ? 3 : 4, gy = r() < 0.5 ? 4 : 5;
    for (let wy = top + 3; wy < base - 4; wy += gy) {
      const row = r() < 0.18 ? 0 : dens * (0.6 + r() * 0.8); // some floors dark
      for (let wx = x + 2; wx < x + w - 2; wx += gx) if (r() < row) { const c = win(); set(wx, wy, c, A_WIN); if (B.px > 0.25) set(wx, wy + 1, c, A_WIN); }
    }
  }
  function roof(x, top, w) {
    const k = r();
    if (k < 0.26) { // sawtooth shed roof with skylight glow
      for (let i = 0; i + 4 <= w; i += 5) for (let j = 0; j < 4; j++) rect(x + i + j, top - 4 + j, 1, 4 - j + 1, dark);
      if (r() < 0.6) for (let i = 0; i + 4 <= w; i += 5) set(x + i + 4, top - 1, win(), A_WIN);
    } else if (k < 0.42) { rect(x - 1, top - 1, w + 2, 1, hi); rect(x + 1, top - 3, Math.max(2, w >> 2), 2, dark); } // parapet + roof shed
    else if (k < 0.52 && w > 8) { const s = Math.floor(w / 3); rect(x + s, top - 6, w - 2 * s, 6, body); rect(x + s, top - 6, 1, 6, hi); } // stepped
    else if (k < 0.62) { for (let j = 0; j < Math.min(6, w >> 1); j++) rect(x + j, top - j - 1, w - 2 * j, 1, dark); } // pitched
  }
  function chimney(cx, top, h, w) {
    rect(cx, top, w, base - top, dark); rect(cx, top, 1, base - top, hi);
    rect(cx - 1, top, w + 2, 2, shade(dark, 0.7));
    for (let y = top + 6; y < top + h * 0.6; y += 7) rect(cx, y, w, 1, shade(dark, 0.6)); // iron bands
    set(cx + (w >> 1), top - 1, [0xff, 0x8a, 0x2a], A_WIN); // ember at the lip
    if (w > 2) set(cx + (w >> 1) - 1, top - 1, [0xd0, 0x60, 0x20], A_WIN);
  }
  function gantry(x, top, h) { // lattice crane: mast, jib, counterweight, beacon
    const m = shade(dark, 0.9);
    for (let y = top; y < base; y++) { set(x, y, m, A_BODY); set(x + 3, y, m, A_BODY); if ((y - top) % 4 === 0) rect(x, y, 4, 1, m); if ((y - top) % 4 === 2) { set(x + 1, y, m); set(x + 2, y + 1, m); } }
    const jl = 14 + Math.floor(r() * 14), dir = r() < 0.5 ? 1 : -1;
    for (let i = -6; i < jl; i++) set(x + 2 + dir * i, top - 1, m, A_BODY);
    for (let i = 0; i < jl; i += 3) set(x + 2 + dir * i, top - 2, m, A_BODY);
    rect(x + 2 - dir * 6 - (dir > 0 ? 0 : 2), top, 3, 2, m);
    for (let y = top; y < top + 5 + Math.floor(r() * 10); y++) set(x + 2 + dir * (jl - 2), y, m, A_BODY); // hook line
    set(x + 1, top - 3, [0xff, 0x3a, 0x20], A_BEACON); set(x + 2, top - 3, [0xff, 0x3a, 0x20], A_BEACON);
  }
  function spire(x, top, h) { // a thin tall stack or radio mast
    for (let y = top; y < base; y++) { const w = 1 + Math.floor(((y - top) / h) * 2.5); rect(x - (w >> 1), y, Math.max(1, w), 1, dark); }
    set(x, top - 1, [0xff, 0x3a, 0x20], A_BEACON);
  }
  function dome(cx, top, rad) {
    for (let j = 0; j <= rad; j++) { const w = Math.round(Math.sqrt(rad * rad - j * j)); rect(cx - w, top + rad - j, w * 2, 1, j === rad ? hi : body); }
    rect(cx - rad, top + rad, rad * 2, base - top - rad, dark);
  }
  function tower(cx, top) { // water tower on legs
    const m = dark; rect(cx - 4, top, 9, 6, m); rect(cx - 4, top, 1, 6, hi); rect(cx - 5, top - 1, 11, 1, shade(m, 0.7));
    for (let y = top + 6; y < top + 16; y++) { set(cx - 3, y, m); set(cx + 3, y, m); if ((y - top) % 4 === 0) rect(cx - 3, y, 7, 1, m); }
    return top + 16;
  }

  // 1) a low continuous roofscape so the bottom of the band is solid all the way across
  for (let x = 0; x < W;) { const w = 6 + Math.floor(r() * 18), top = base - B.low[0] - Math.floor(r() * (B.low[1] - B.low[0])); block(x, top, w, { win: B.win * 0.8 }); roof(x, top, w); x += w; }
  // 2) the taller skyline over it, with gaps for the sky
  for (let x = Math.floor(r() * 8); x < W;) {
    const w = 8 + Math.floor(r() * 26), top = base - B.tall[0] - Math.floor(r() * (B.tall[1] - B.tall[0]));
    const solid = r() < 0.82;
    if (solid) { block(x, top, w); roof(x, top, w); }
    const k = r();
    if (k < B.chim) chimney(x + Math.floor(r() * w), top - 10 - Math.floor(r() * 24), 30, 2 + Math.floor(r() * 2));
    else if (k < B.chim + B.gantry) gantry(x + Math.floor(r() * w), top - 14 - Math.floor(r() * 20), 30);
    else if (k < B.chim + B.gantry + B.spire) spire(x + (w >> 1), top - 20 - Math.floor(r() * 40), 40);
    else if (k < B.chim + B.gantry + B.spire + B.dome) dome(x + (w >> 1), top - 6, Math.min(10, w >> 1));
    else if (solid && k < B.chim + B.gantry + B.spire + B.dome + B.tower) tower(x + (w >> 1), top - 16);
    x += w + Math.floor(r() * 12);
  }
  // 3) the near ring: the old city's landmarks, drawn bigger and darker than the blocks
  if (B.landmarks) landmarks(B, set, rect, dark, hi, base);

  // 4) the haze: every pixel fades toward the haze color with depth, and the bottom rows are pure haze
  const f0 = Math.floor(H * B.fade[0]), f1 = Math.floor(H * B.fade[1]);
  for (let y = 0; y < H; y++) {
    const t = y <= f0 ? 0 : y >= f1 ? 1 : ((y - f0) / (f1 - f0)) ** 1.4;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (y >= f1) { buf[i] = B.haze[0]; buf[i + 1] = B.haze[1]; buf[i + 2] = B.haze[2]; buf[i + 3] = A_BODY; continue; }
      if (!buf[i + 3]) { if (t > 0.98) { buf[i] = B.haze[0]; buf[i + 1] = B.haze[1]; buf[i + 2] = B.haze[2]; buf[i + 3] = A_BODY; } continue; }
      for (let c = 0; c < 3; c++) buf[i + c] = buf[i + c] + (B.haze[c] - buf[i + c]) * t;
      if (t > 0.6 && buf[i + 3] !== A_BODY) buf[i + 3] = A_BODY; // windows lost in the haze stop glowing
    }
  }
  return buf;
}

// The near ring: the old city's landmarks (pithead headframe, cooling tower, gantry crane, gasometer, the two tall
// stacks flanking the shaft) painted where they stood, plus echoes of the same kinds further out.
function landmarks(B, set, rect, dark, hi, base) {
  const W = B.W, m = [0x22, 0x14, 0x0e], ml = [0x3a, 0x26, 0x1a], red = [0xff, 0x3a, 0x20];
  const at = (x) => Math.round(W / 2 + x / B.px); // root x at the stack view -> tile px
  // headframe: two raked legs, a back strut, cross braces, the sheave wheel on top
  for (const hx of [-42, -150, 118]) { const x = at(hx), top = base - 140, h = base - top;
    for (let y = top + 8; y < base; y++) { const k = (y - top) / h; set(x - 4 - k * 6, y, m); set(x - 3 - k * 6, y, m); set(x + 4 + k * 6, y, m); set(x + 3 + k * 6, y, m); if ((y - top) % 7 === 0) rect(x - 4 - k * 6, y, 8 + k * 12, 1, m); }
    for (let y = top + 10; y < base; y++) set(x + 6 + (y - top) * 0.45, y, m);
    rect(x - 6, top + 6, 13, 3, m);
    for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; set(x + Math.cos(t) * 6, top + 1 + Math.sin(t) * 5, ml); }
    for (let i = -5; i <= 5; i++) { set(x + i, top + 1, ml); set(x, top + 1 + i * 0.8, ml); }
    set(x, top - 5, red, A_BEACON); }
  // cooling tower: hyperboloid, rim lit
  for (const cx of [-64, -96, 176]) { const x = at(cx), top = base - 92;
    for (let y = top; y < base; y++) { const k = (y - top) / (base - top), w = Math.round(12 - 5 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.75) + k * 6); rect(x - w, y, w * 2, 1, y === top ? hi : ml); set(x - w, y, hi); } }
  // a tall stack
  for (const sx of [-30, 31, -122, 150]) { const x = at(sx), top = base - 178; rect(x, top, 4, base - top, m); rect(x, top, 1, base - top, ml); rect(x - 1, top, 6, 3, [0x16, 0x0e, 0x0a]); for (let y = top + 8; y < base; y += 9) rect(x, y, 4, 1, [0x16, 0x0e, 0x0a]); set(x + 1, top - 1, [0xff, 0x8a, 0x2a], A_WIN); set(x + 2, top - 1, [0xff, 0xb0, 0x50], A_WIN); }
  // gasometer: a drum inside its guide frame
  // gantry crane by the shaft: two legs, a long girder, the trolley, beacon
  { const x = at(44), top = base - 110;
    for (let y = top; y < base; y++) { rect(x - 10, y, 2, 1, m); rect(x + 10, y, 2, 1, m); if ((y - top) % 6 === 0) { set(x - 9, y + 1, m); set(x + 11, y + 1, m); } }
    rect(x - 14, top - 3, 40, 3, m); for (let i = -14; i < 26; i += 3) set(x + i, top - 4, ml);
    rect(x + 14, top, 5, 4, ml); for (let y = top + 4; y < top + 24; y++) set(x + 16, y, ml);
    set(x - 9, top - 6, red, A_BEACON); }
  for (const gx of [64, -178, 92]) { const x = at(gx), top = base - 66;
    rect(x - 14, top + 10, 28, base - top - 10, ml); rect(x - 14, top + 10, 1, base - top - 10, hi);
    for (let i = -15; i <= 15; i += 5) for (let y = top; y < base; y++) set(x + i, y, m);
    for (const y of [top, top + 12, top + 24]) rect(x - 15, y, 31, 1, m); }
}

const VS = `
uniform vec2 uUv0; uniform vec2 uUvRep;
varying vec2 vUv;
void main() { vUv = uUv0 + uv * uUvRep; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `
uniform sampler2D uMap; uniform float uDim; uniform float uLit; uniform float uBeacon;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vec2(vUv.x, clamp(vUv.y, 0.0, 1.0)));
  if (c.a < 0.3) discard;
  vec3 col = c.rgb * uDim;
  if (c.a < 0.6) col = mix(c.rgb * uDim * 0.4, c.rgb, uBeacon * uLit);          // beacon: slow pulse
  else if (c.a < 0.9) col = mix(c.rgb * uDim * 0.45, c.rgb, uLit);               // lit window: goes out with the sky
  gl_FragColor = vec4(col, 1.0);
}`;

export default function install(IRON) {
  if (!artPass()) return;
  IRON.part('skyline', function (K, g, ctx) {
    const B = backdrop(ctx.I, g), root = ctx.I.root;
    const R = new THREE.Vector3(), U = new THREE.Vector3(), Z = new THREE.Vector3(), F = new THREE.Vector3(), cam = new THREE.Vector3(), v = new THREE.Vector3();
    const size = new THREE.Vector3(1, 1, 1), ref = new THREE.Vector3(), geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0); // origin at the top middle
    let t = 0;
    const layers = BANDS.map((L) => {
      // DataTexture rows run bottom-up: flip the painting so its top row is the texture's top
      const buf = paint(L), data = new Uint8Array(buf.length), row = L.W * 4;
      for (let y = 0; y < L.H; y++) data.set(buf.subarray(y * row, (y + 1) * row), (L.H - 1 - y) * row);
      const tex = new THREE.DataTexture(data, L.W, L.H, THREE.RGBAFormat);
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, fog: false,
        uniforms: { uMap: { value: tex }, uUv0: { value: new THREE.Vector2() }, uUvRep: { value: new THREE.Vector2(1, 1) }, uDim: { value: 1 }, uLit: { value: 1 }, uBeacon: { value: 1 } },
      });
      const m = new THREE.Mesh(geo, mat);
      m.name = 'skyline:' + L.name; m.renderOrder = L.order; m.frustumCulled = false; m.castShadow = m.receiveShadow = false;
      m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.userData.noBake = true;
      K.dyn(m); g.add(m);
      const tileW = L.W * L.px, texH = L.H * L.px;
      const anchor = new THREE.Vector3(0, L.top, -60);
      m.onBeforeRender = (renderer, scene, camera) => {
        if (!camera.isOrthographicCamera) return;
        R.setFromMatrixColumn(camera.matrixWorld, 0); U.setFromMatrixColumn(camera.matrixWorld, 1); Z.setFromMatrixColumn(camera.matrixWorld, 2); F.copy(Z).negate();
        cam.setFromMatrixPosition(camera.matrixWorld);
        root.localToWorld(ref.set(REF[0], REF[1], REF[2])); root.localToWorld(v.copy(anchor));
        const cx = cam.dot(R), cy = cam.dot(U), rx = ref.dot(R), ry = ref.dot(U);
        // the band's top and its tile's left edge on screen, relative to the view's middle: it follows f of each pan
        const topY = v.dot(U) + L.f * (cy - ry) - cy;
        const x0 = v.dot(R) - (L.W / 2) * L.px + L.f * (cx - rx) - cx;
        const w = (camera.right - camera.left) * 1.04, bottom = camera.bottom * 1.04, h = Math.max(0.01, topY - bottom);
        const u = mat.uniforms;
        u.uUv0.value.set((camera.left * 1.04 - x0) / tileW, 1 - h / texH);
        u.uUvRep.value.set(w / tileW, h / texH);
        // the city dims with the sky (the bottleneck map's dark sky) and its windows go out
        const bi = scene.backgroundIntensity === undefined ? 1 : Math.max(0, Math.min(1, scene.backgroundIntensity));
        u.uDim.value = 0.5 + 0.5 * bi; u.uLit.value = bi ** 1.5;
        if (!B.calm()) t = IRON._t || 0;
        u.uBeacon.value = B.calm() ? 1 : 0.55 + 0.45 * Math.sin(t * 1.1 + L.seed);
        // the quad: across the whole view, its top at topY, far behind everything else
        m.matrixWorld.makeBasis(R, U, Z).scale(size.set(w, h, 1));
        m.matrixWorld.setPosition(v.copy(cam).addScaledVector(R, (camera.left + camera.right) / 2).addScaledVector(U, topY).addScaledVector(F, L.dist));
      };
      return m;
    });
    // the old 3D landmarks (city-old.js keeps them under the flag) stood on the old city's blocks and float with
    // nothing under them now; the near band paints them instead, at no extra draw calls
    const ring = root.getObjectByName('city-landmarks');
    if (ring) { ring.traverse((o) => o.geometry && o.geometry.dispose()); ring.removeFromParent(); }
    return { update() {}, layers };
  }, 0.5);
}
