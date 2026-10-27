// =====================================================================
// SMOG SEA (floating-city art pass, slice 3): IRON.part('smog'), only with ?artpass=1 (ART-PASS.md)
// Three bands of foundry smog far below the island, so the whole factory hangs in the air over the city. Each band
// is one strip painted on a canvas in the pixel style: billows lit furnace-orange from underneath, darker as they
// rise, warm pockets where the city's furnaces show through, and city spires and chimneys poking up through the tops
// (lit windows, aviation lamps). The far band's top dithers out into the haze so it melts into the skyline.
// The camera is orthographic, so depth is faked (backdrop-kit.js): each band is a wall at its own root z (inside the
// smog z band, behind the veil and in front of the skyline) that rides with the camera across and down, so it always
// fills the view below its top and never shows an edge, while its top slides against the camera by a fraction (far
// bands barely move, near ones more) and its texture wraps sideways and repeats its bottom tile downward. Bands drift
// slowly and hold still when calm. They draw in the opaque pass with a dithered alpha cut (no blended full-screen
// layers) and dim with the sky (B.dim). 3 draw calls, 0 lights.
// =====================================================================

import { artPass, backdrop, ORDER } from '../backdrop-kit.js';
import { SMOG_TOP, TIP } from '../keel-shape.js';

// band tops are laid out as seen from the ALL view (frame.ts, flag on) and measured on the keel tip's plane (z of
// TIP), so the near band's top is SMOG_TOP right where the engine's beam comes down into it
const REF = [0, -3.1, TIP[2]];
const TEXEL = 8; // canvas pixels per world unit
const TILE = 128; // world units before a band's painting repeats sideways

// far -> near. top: root height of the band's first billow row seen from the ALL view (on the tip's plane). follow:
// how much its top rides with the camera (1 = locked to the screen). z: its wall's root z. drift: world units a second.
// glow: warm pockets per billow row. head: canvas px of sky above the first billow row (room for spires). gap: px between billow rows (a multiple of 4,
// so the dither tiles). puff: billow radius range in px, puffy: how tall the heaps stand.
const BANDS = [
  { name: 'far', top: -26, follow: 0.7, z: -58, drift: 0.12, seed: 11, head: 72, gap: 16, puff: [10, 22], puffy: 0.35, fade: 14, glow: 1,
    ramp: ['#62301a', '#6c361c', '#783c1e', '#844420', '#904a22', '#9c5024'], rim: '#6c361c',
    spires: { n: 14, w: [2, 5], h: [24, 64], col: '#4c2616', lit: '#ffb860', kind: 'needle' } },
  { name: 'mid', top: -36, follow: 0.55, z: -48, drift: 0.24, seed: 23, head: 92, gap: 24, puff: [14, 30], puffy: 0.5, fade: 0, glow: 3,
    ramp: ['#3a1d12', '#462414', '#552a16', '#6c3318', '#86401a', '#a04e1c', '#b45a24'], rim: '#7c4428',
    spires: { n: 9, w: [5, 10], h: [34, 84], col: '#2c1810', lit: '#ffb050', kind: 'stack' } },
  { name: 'near', top: SMOG_TOP, follow: 0.4, z: -38, drift: 0.4, seed: 37, head: 156, gap: 40, puff: [24, 52], puffy: 0.6, fade: 0, glow: 3,
    ramp: ['#22130c', '#2a160d', '#361d10', '#4c2514', '#683016', '#8a4019', '#ac521d', '#c4642a'], rim: '#6a3c26',
    spires: { n: 5, w: [10, 18], h: [70, 150], col: '#1e120c', lit: '#ffc070', kind: 'tower' } },
];
const SHAPES = 3; // billow row shapes; rows repeat them, so the deep part of a band tiles downward forever
const LEAD = 2; // rows above the tile (they brighten into it)

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function srand(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// one band's painting, seamless sideways. From the top: sky with spires, LEAD billow rows, then a tile of SHAPES rows
// that the shader repeats downward (tile = its height as a fraction of the canvas, from the bottom).
function paintBand(B) {
  const W = TILE * TEXEL, edge0 = B.head, tileTop = edge0 + LEAD * B.gap, T = SHAPES * B.gap, H = tileTop + T, rnd = srand(B.seed);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H), px = img.data;
  const put = (x, y, rgb) => { x = ((x % W) + W) % W; if (y < 0 || y >= H) return; const i = (y * W + x) * 4; px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255; };
  const wrapDx = (a, b) => { let d = a - b; d -= Math.round(d / W) * W; return d; };

  // spires first (the smog paints over their feet, so they poke up through the tops)
  const S = B.spires, sc = hex(S.col), lit = hex(S.lit), lit2 = hex('#ff6a3a');
  const sites = [];
  for (let k = 0; k < S.n; k++) {
    // a tall one, sometimes with one or two shorter neighbours, so they read as a district poking through
    const x0 = Math.floor(((k + 0.2 + rnd() * 0.6) / S.n) * W), h0 = S.h[0] + rnd() * (S.h[1] - S.h[0]);
    sites.push([x0, h0]);
    const more = rnd() < 0.6 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let j = 0; j < more; j++) sites.push([x0 + (rnd() < 0.5 ? -1 : 1) * (S.w[1] + 2 + rnd() * S.w[1] * 1.5), h0 * (0.45 + rnd() * 0.3)]);
  }
  for (const [cx0, h0] of sites) {
    const cx = Math.round(cx0), h = Math.round(h0), w = Math.round(S.w[0] + rnd() * (S.w[1] - S.w[0]));
    const top = Math.max(2, edge0 + 10 - h);
    for (let y = top; y < tileTop; y++) {
      const f = (y - top) / Math.max(1, h);
      let half;
      if (S.kind === 'needle') half = Math.max(0.5, (w / 2) * Math.min(1, f * 3));
      else if (S.kind === 'stack') half = w / 2 + (y - top < 3 ? 1 : 0); // a lipped chimney crown
      else half = f < 0.12 ? Math.max(0.5, (w / 2) * (f / 0.12) * 0.6) : w / 2 + (f > 0.3 ? 1 : 0); // spire + setback tower
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) put(x, y, sc);
    }
    // the lamp on top and a few lit windows
    put(cx, top - 1, lit2); if (S.kind !== 'needle') put(cx - 1, top - 1, lit2);
    for (let wy = top + 9; wy <= edge0 + 6; wy += 5)
      for (let x = Math.round(cx - w / 2) + 1; x < Math.round(cx + w / 2) - 1; x += 2) if (rnd() < (S.kind === 'needle' ? 0.25 : 0.4)) put(x, wy, lit);
  }

  // billow row shapes: big heaps with smaller puffs riding on them, unevenly spaced, so the tops never read as a row
  // of scallops. Heaps stay under one row gap tall, so a row never pokes above the one before it.
  const shapes = [], glows = [];
  for (let k = 0; k < SHAPES; k++) {
    const n = Math.max(4, Math.round(W / ((B.puff[0] + B.puff[1]) * 1.6))), puffs = [];
    for (let i = 0; i < n; i++) {
      const big = rnd() < 0.35, rr = (B.puff[0] + rnd() * (B.puff[1] - B.puff[0])) * (big ? 1.7 : 1);
      puffs.push({ x: ((i + rnd()) / n) * W, r: rr, lift: big ? rr * 0.25 : rnd() * rr * 0.3 });
      if (rnd() < 0.5) puffs.push({ x: ((i + rnd()) / n) * W, r: rr * 0.45, lift: rr * (0.45 + rnd() * 0.3) });
    }
    const ph = rnd() * 6.283, bump = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let b = 0;
      for (const p of puffs) { const d = wrapDx(x, p.x); if (Math.abs(d) < p.r) b = Math.max(b, (p.r * 0.5 + p.lift) * Math.sqrt(1 - (d / p.r) ** 2) * B.puffy); }
      b += 3 + Math.sin((x / W) * 6.283 * 3 + ph) * 2 + Math.sin((x / W) * 6.283 * 7 + ph * 2);
      bump[x] = Math.min(B.gap * 0.95, Math.max(0, b));
    }
    shapes.push(bump);
    // furnace light leaking up through gaps at the foot of the row: a few warm pockets
    const pockets = [];
    for (let i = 0; i < B.glow; i++) pockets.push({ x: rnd() * W, rx: B.gap * (1.2 + rnd() * 1.6), ry: B.gap * (0.25 + rnd() * 0.15) });
    glows.push(pockets);
  }
  // row r's top edge at x; row r uses shape r % SHAPES, so the rows below tileTop repeat every T px
  const edgeAt = (r, x) => edge0 + r * B.gap - shapes[r % SHAPES][x];
  const ramp = B.ramp.map(hex), rim = hex(B.rim), nR = ramp.length, lastRow = LEAD + SHAPES;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let r = -1;
      for (let k = lastRow; k >= 0; k--) if (y >= edgeAt(k, x)) { r = k; break; }
      if (r < 0) {
        // above the top row: haze dither for the far band, else clear (spires stay)
        const e = edgeAt(0, x);
        if (B.fade && y >= e - B.fade && (e - y) / B.fade < bayer(x, y) * 0.9) put(x, y, ramp[1]);
        continue;
      }
      const d = y - edgeAt(r, x);
      if (d < 1.5 && r === 0) { put(x, y, rim); continue; }
      // light from below: each billow is dark along its top and glows toward its foot, the band brightens with
      // depth until the tile (the glow of the city under it), and thin stratus streaks run sideways through it
      const deepT = Math.min(1, Math.max(0, (y - edge0) / (tileTop - edge0)));
      const yy = y >= tileTop ? y - tileTop : y;
      const streak = Math.sin((yy / T) * 6.283 * SHAPES * 2 + Math.sin((x / W) * 6.283 * 5 + (r % SHAPES)) * 2.2) * 0.035;
      // (the tile that repeats down the screen stays low-contrast, so far below it reads as one calm glowing floor)
      const calm = deepT * 0.55, kd = Math.min(1, d / B.gap);
      let warm = 0;
      for (const p of glows[r % SHAPES]) { const dx = wrapDx(x, p.x) / p.rx, dy = (d - B.gap * 0.85) / p.ry; warm = Math.max(warm, 1 - dx * dx - dy * dy); }
      const s = Math.max(0, Math.min(1, warm * 0.38 + 0.45 * deepT + kd * (0.4 - calm * 0.36) - (d < 3 && r > 0 ? 0.1 - calm * 0.1 : 0) + streak));
      put(x, y, ramp[Math.min(nR - 1, Math.floor(s * (nR - 1) + bayer(x, y)))]);
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, tile: T / H, hw: H / TEXEL };
}

export default function install(IRON) {
  if (!artPass()) return;
  IRON.part('smog', (K, root, ctx) => {
    const THREE = K.THREE, I = ctx.I || IRON, B = backdrop(I, root);
    const bands = BANDS.map((S) => {
      const P = paintBand(S);
      const tex = new THREE.CanvasTexture(P.canvas);
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: false, depthWrite: true });
      // below the painting, repeat its bottom tile downward (the smog goes on as far as anyone drags)
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTile = { value: P.tile };
        sh.fragmentShader = 'uniform float uTile;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          'vec2 smUv = vMapUv; if (smUv.y < uTile) smUv.y = mod(smUv.y, uTile);\nvec4 sampledDiffuseColor = texture2D(map, smUv);\ndiffuseColor *= sampledDiffuseColor;');
      };
      B.dim(mat, 0.2);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.name = 'smog-' + S.name;
      mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
      mesh.renderOrder = ORDER.smog; // (a non-zero renderOrder also keeps it out of the bake)
      K.dyn(mesh);
      root.add(mesh);
      return { S, hw: P.hw, mesh, tex, drift: 0 };
    });

    // every frame once the camera is placed (stage.ts 'camera'): fit each wall to the view below its top
    const inv = new THREE.Matrix4(), cp = new THREE.Vector3(), u = new THREE.Vector3();
    I.on('camera', ({ camera: cam }) => {
      if (!cam || !root.parent) return;
      root.parent.updateMatrixWorld();
      inv.copy(root.matrixWorld).invert();
      cp.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(inv);
      u.setFromMatrixColumn(cam.matrixWorld, 1).transformDirection(inv); // screen up in root space: (0, cos 30, -sin 30)
      // screen-up coordinate of a root point; the camera never turns, so screen right is root x
      const U = (x, y, z) => u.x * x + u.y * y + u.z * z;
      const camU = cp.dot(u), refU = U(...REF), top = camU + cam.top, bot = camU + cam.bottom, w = (cam.right - cam.left) * 1.1;
      for (const b of bands) {
        const S = b.S, m = b.mesh;
        const edgeU = U(REF[0], S.top, REF[2]) + (camU - refU) * S.follow + S.head / TEXEL; // the painting's top row
        const hi = Math.min(edgeU, top + 1), lo = bot - 1;
        m.visible = hi > lo;
        if (!m.visible) continue;
        // a wall at root z S.z spanning screen-up lo..hi: root y = (U - z * u.z) / u.y
        const y0 = (lo - S.z * u.z) / u.y, y1 = (hi - S.z * u.z) / u.y;
        m.position.set(cp.x, (y0 + y1) / 2, S.z);
        m.scale.set(w, y1 - y0, 1);
        m.updateMatrixWorld();
        // texture, in screen units: x wraps and slides by (1 - follow) of the camera, plus the drift; y puts the
        // painting's top row at edgeU, one texture height per hw, its bottom tile repeating below
        b.tex.repeat.set(w / TILE, (hi - lo) / b.hw);
        b.tex.offset.set(((cp.x * (1 - S.follow) + b.drift) / TILE - w / TILE / 2) % 1, 1 - (edgeU - lo) / b.hw);
      }
    });

    return {
      update(t, dt) {
        if (!B.calm()) for (const b of bands) b.drift += b.S.drift * dt;
      },
    };
  });
}
