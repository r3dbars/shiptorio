// =====================================================================
// KEEL (floating-city art pass, slice 5) — the island's rock underside. Installs only with ?artpass=1
// (keel-old.js keeps the old blocky keel when the flag is off).
// One faceted chunk of rock that hangs from the quarry floor and tapers to a blunt tip, following keel-shape.js:
// stacked strata (each tier widest at its top and tucked in at its bottom, so every stratum shows a lit ledge),
// in the Black Iron underside stone. Soot runs down from the quarry lip, rust weeps from every rivet row, riveted
// iron hoops bind the rock and straps hang it from the quarry floor's rim, and a few roots and dead pipes dangle.
// NOTES:
//  - Front faces only: the rock is the front half of a superellipse that is boxy at the top (so it meets the quarry
//    floor's straight front edge) and round near the tip. The camera never sees the back, the top or the far side.
//  - The rock is ONE vertex-coloured mesh (strata + per-facet tone ride the colours, the stone plates the texture);
//    the stains are ONE vertex-alpha mesh hugging the surface (found by raycasts); everything else uses five shared
//    materials, so bake.ts merges it all to a handful of draw calls. No lights (the engine has the underside's one),
//    nothing moves (calm, and still under reduced motion).
//  - The tip, the engine socket, the crack anchors and the waterfall lips all come from keel-shape.js: the engine
//    (slice 6) and the falls (slice 7) build there, so this keeps clear of them and cuts dark cracks at the anchors.
// =====================================================================
import { artPass } from '../backdrop-kit.js';
import { TOP, TIP_Y, CX, TIP, SOCKET, BANDS, CRACKS, LIPS, FRONT_TOP, radius, front } from '../keel-shape.js';

export default function install(IRON) {
  if (!artPass()) return;

  // cobbled underside stone (world-space tiling, same recipe as mine.js's strata so the keel reads as the same rock):
  // irregular plates stretched along the strata with dark joints, each bevelled (lit from the top), plus grit.
  function stoneTex(K, seed) {
    const S = 128;
    return K.canvasTex(S, S, (g) => {
      let s = seed; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const Pt = [];
      for (let i = 0; i < 46; i++) Pt.push([r() * S, r() * S, 150 + Math.floor(r() * 80)]);
      const img = g.createImageData(S, S), d = img.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let d1 = 1e9, d2 = 1e9, tone = 180, cx = 0, cy = 0;
        for (const [px, py, tv] of Pt) {
          let dx = x - px, dy = y - py;
          if (dx > S / 2) dx -= S; else if (dx < -S / 2) dx += S;
          if (dy > S / 2) dy -= S; else if (dy < -S / 2) dy += S;
          const dd = Math.sqrt(dx * dx * 0.5 + dy * dy * 1.7);
          if (dd < d1) { d2 = d1; d1 = dd; tone = tv; cx = dx; cy = dy; } else if (dd < d2) d2 = dd;
        }
        const e = d2 - d1;
        let v = tone + Math.sin((y + Math.sin(x * 0.1) * 3) * 0.12) * 7;
        if (e < 1.25) v = 52;
        else if (e < 3.6) { const k = 1 - (e - 1.25) / 2.35, l = -(cx * 0.45 + cy * 0.9) / (Math.hypot(cx, cy) + 0.01); v += l * 40 * k - 10 * k; }
        v += (r() - 0.5) * 18;
        const i = (y * S + x) * 4; d[i] = v; d[i + 1] = v - 8; d[i + 2] = v - 16; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      for (let i = 0; i < 60; i++) { const x = Math.floor(r() * (S - 2)), yy = Math.floor(r() * (S - 4)); g.fillStyle = 'rgba(26,18,14,0.5)'; g.fillRect(x, yy, 1, 2 + Math.floor(r() * 3)); }
    });
  }

  IRON.part('keel', (K, root) => {
    const T = K.THREE, V3 = T.Vector3;
    let seedS = 5150; const rr = () => { seedS = (seedS * 16807) % 2147483647; return (seedS - 1) / 2147483646; };
    const R = () => rr() - 0.5;
    const g = K.group(root); g.name = 'keel';
    const ST = 8.5; // the stone texture's world size (bigger plates than the cliff's 6.4: calmer under the busy mine)

    // ------------------------------------------------------------ the profile (keel-shape.js)
    // the front half of a superellipse: x half-width radius(y) about CX, depth from CZ out to front(y)
    const CZ = TIP[2] - 1.0, HX0 = radius(TOP);
    const yIn = (y) => Math.max(TIP_Y + 0.01, Math.min(TOP - 0.01, y));
    const tOf = (y) => Math.max(0, Math.min(1, (TOP - y) / (TOP - TIP_Y)));
    const hx = (y) => radius(yIn(y));
    // the top band hangs plumb under the quarry rim (a receding face would ride up the screen and hide under the floor)
    const hz = (y) => Math.max(1.2, (y > BANDS[1] ? Math.max(front(yIn(y)), FRONT_TOP - 0.25) : front(yIn(y))) - CZ);
    const ex = (y) => (y > BANDS[1] ? 16 : 2.4 + 9.6 * Math.pow(1 - tOf(y), 2.2)); // superellipse exponent: boxy under the floor, round at the tip
    // a point on the nominal surface: u -1..1 runs left -> front -> right; k scales it in (k < 1) or out
    const surf = (u, y, k, out) => {
      const n = ex(y), a = Math.min(1, Math.abs(u));
      return out.set(CX + hx(y) * u * k, y, CZ + hz(y) * k * Math.pow(1 - Math.pow(a, n), 1 / n));
    };

    // ------------------------------------------------------------ strata: tiers, each widest at its top
    // one tier per keel-shape BAND, top -> down: warm ochre under the quarry (the cliff's lowest band carries on),
    // then the purple-grey underside stone darkening toward the tip
    const COLS = [0xb09274, 0x8c7c7a, 0x726c78, 0x625d6c, 0x545160, 0x464454];
    const TIERS = BANDS.slice(0, -1).map((b, i) => [b - (i === BANDS.length - 2 ? BANDS[i + 1] + 1.0 : BANDS[i + 1] + 0.14) , COLS[Math.min(i, COLS.length - 1)]]);
    // how far each tier tucks in at its bottom: the upper tiers hang nearly plumb (anything flatter than the camera's
    // 30deg would face away from it and vanish under the quarry floor), the lower ones pinch in harder
    const TUCK = [0.0, 0.07, 0.1, 0.12, 0.13, 0.14], RIDGE = [0.25, 0.6, 1, 1, 1, 1];
    const rings = []; // { y, k, tier, ledge, band }
    TIERS.forEach(([h, col], ti) => {
      const y = BANDS[ti];
      const last = ti === TIERS.length - 1, nR = last ? 4 : h > 2.6 ? 3 : 2;
      for (let j = 0; j <= nR; j++) {
        const f = j / nR, yy = y - h * f;
        // the top ring sits out (the ledge), the bottom ring tucks in; the last tier pinches into the blunt tip
        const k = j === 0 ? 1.0 : last ? 1 - 0.16 * f : 1 - TUCK[ti] * Math.pow(f, 1.4);
        rings.push({ y: yy, k, tier: ti, col, top: j === 0, bot: j === nR, band: j });
      }
    });
    const tipY = TIP_Y;

    // ------------------------------------------------------------ the rock mesh
    const NU = 34;
    // vertical ridges + gullies: a low-frequency wobble per tier, so the rock reads as weathered columns, not a bowl
    const ridge = TIERS.map(() => { const ph = [rr() * 6, rr() * 6], f = [3 + rr() * 3, 7 + rr() * 4]; return (u, ti) => 1 - RIDGE[ti] * (0.04 * (1 + Math.sin(u * f[0] + ph[0])) + 0.022 * (1 + Math.sin(u * f[1] + ph[1]))); });
    const grid = rings.map((ring, ri) => {
      const row = [];
      for (let j = 0; j <= NU; j++) {
        let u = -1 + (2 * j) / NU;
        const edge = j === 0 || j === NU;
        if (!edge) u += R() * (1.2 / NU);
        // jitter only inward, so hoops and straps laid on the nominal surface never sink into a bulge
        const kk = ring.k * (ri === 0 ? 1 : ridge[ring.tier](u, ring.tier)) * (edge ? 1 : ring.top && ri === 0 ? 0.985 + rr() * 0.015 : ring.tier === 0 ? 0.975 + rr() * 0.025 : 0.9 + rr() * 0.1);
        const yy = ring.y + (ri === 0 || ring.top ? R() * 0.06 : R() * 0.42);
        row.push(surf(u, yy, kk, new V3()));
      }
      return row;
    });
    const tipP = new V3(TIP[0], tipY, TIP[2]);

    const pos = [], col = [], uv = [];
    const cA = new T.Color(), cTmp = new T.Color();
    const e1 = new V3(), e2 = new V3(), nrm = new V3(), ctr = new V3(), outward = new V3();
    function tri(a, b, c, color, shade) {
      e1.subVectors(b, a); e2.subVectors(c, a); nrm.crossVectors(e1, e2);
      if (nrm.lengthSq() < 1e-8) return;
      ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      outward.set(ctr.x - CX, 0, ctr.z - CZ);
      if (outward.lengthSq() < 1e-6) outward.set(0, -1, 0.3);
      if (nrm.dot(outward) < 0 && !(shade && shade.down)) { const t = b; b = c; c = t; nrm.negate(); }
      nrm.normalize();
      const ax = Math.abs(nrm.x), ay = Math.abs(nrm.y), az = Math.abs(nrm.z);
      const lit = nrm.y > 0.35 ? 1 - 0.3 * Math.min(1, (nrm.y - 0.35) / 0.5) : 1; // sun-facing tops would blow out
      for (const p of [a, b, c]) {
        pos.push(p.x, p.y, p.z); col.push(color.r * lit, color.g * lit, color.b * lit);
        if (ay > ax && ay > az) uv.push(p.x / ST, p.z / ST); else if (ax > az) uv.push(p.z / ST, p.y / ST); else uv.push(p.x / ST, p.y / ST);
      }
    }
    // a facet's colour: the stratum, its thin bands, a per-facet tone (the facets read even in flat light), soot
    // under the quarry lip and a warm bounce from the city glow on the lowest, down-facing rock
    function facetCol(ring, u, down) {
      // two-tone strata: each tier's upper rows a warm sandstone seam, its lower rows the cool tier stone
      cA.setHex(ring.col);
      if (ring.band === 0) cA.lerp(cTmp.setHex(0xb08a66), 0.45);
      const band = ring.band % 2 ? 0.88 : 1.08;
      let k = band * (0.86 + rr() * 0.26);
      if (down) k *= 0.78;
      const t = tOf(ring.y);
      cA.multiplyScalar(k);
      if (t > 0.55) cA.lerp(cTmp.setHex(0x8a4a2a), 0.12 * (t - 0.55) / 0.45);
      if (Math.abs(u) > 0.92) cA.multiplyScalar(0.82); // the far flanks fall into shadow
      return cA.clone();
    }
    for (let ri = 0; ri < rings.length - 1; ri++) {
      const A = grid[ri], B = grid[ri + 1], ring = rings[ri], ledge = rings[ri + 1].top;
      for (let j = 0; j < NU; j++) {
        const u = -1 + (2 * j + 1) / NU;
        const c1 = facetCol(ledge ? rings[ri + 1] : ring, u, false);
        const c2 = rr() < 0.5 ? c1 : facetCol(ledge ? rings[ri + 1] : ring, u, false);
        if ((j + ri) % 2) { tri(A[j], B[j], B[j + 1], c1); tri(A[j], B[j + 1], A[j + 1], c2); }
        else { tri(A[j], B[j], A[j + 1], c1); tri(A[j + 1], B[j], B[j + 1], c2); }
      }
    }
    { // the blunt tip: a fan from the last ring
      const A = grid[grid.length - 1], ring = rings[rings.length - 1];
      for (let j = 0; j < NU; j++) tri(A[j], tipP, A[j + 1], facetCol(ring, -1 + (2 * j + 1) / NU, true), { down: false });
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const rockM = K.mat(0xffffff, { map: stoneTex(K, 313), e: 0x0a0706 });
    rockM.vertexColors = true; 
    const rock = K.mesh(geo, rockM, 0, 0, 0, g);
    rock.name = 'keel-rock'; rock.castShadow = false; rock.receiveShadow = true;

    // ------------------------------------------------------------ hugging the surface: raycasts onto the rock
    const ray = new T.Raycaster(), rO = new V3(), rD = new V3(), nTmp = new V3();
    rock.updateMatrixWorld(true);
    // the rock surface at (u, y): { p, n } in the keel's frame, or null off the rock
    function onRock(u, yy) {
      surf(u, yy, 1, rO); rD.set(rO.x - CX, 0, rO.z - CZ).normalize();
      rO.addScaledVector(rD, 4); ray.set(rO, rD.negate()); ray.far = 40;
      const hit = ray.intersectObject(rock, false)[0];
      if (!hit) return null;
      nTmp.copy(hit.face.normal);
      return { p: hit.point.clone(), n: nTmp.clone() };
    }

    // ------------------------------------------------------------ stains: soot runs, rust weeps, cracks (one mesh)
    const sPos = [], sCol = [];
    // a strip laid along the rock through samples at(f) -> [u, y] for f 0..1, width w tapering, alpha a0 -> a1
    function stainAlong(at, len, w, rgb, a0, a1) {
      const steps = Math.max(2, Math.ceil(len / 0.3)); let prev = null;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps, [u, yy] = at(f), hit = onRock(u, yy);
        if (!hit) { prev = null; continue; }
        const tg = new V3(hit.n.z, 0, -hit.n.x).normalize(), ww = w * (1 - f * 0.55) / 2;
        const p = hit.p.addScaledVector(hit.n, 0.03), a = a0 + (a1 - a0) * f;
        const cur = [p.clone().addScaledVector(tg, -ww), p.clone().addScaledVector(tg, ww), a];
        if (prev) {
          for (const [q, al] of [[prev[0], prev[2]], [prev[1], prev[2]], [cur[1], a], [prev[0], prev[2]], [cur[1], a], [cur[0], a]]) { sPos.push(q.x, q.y, q.z); sCol.push(rgb[0], rgb[1], rgb[2], al); }
        }
        prev = cur;
      }
    }
    // a run straight down the face from (u, y0)
    const stain = (u, y0, len, w, rgb, a0, a1) => stainAlong((f) => [u + Math.sin(f * 5 + u * 9) * 0.004, y0 - len * f], len, w, rgb, a0, a1);
    const uOf = (x, yy) => (x - CX) / Math.max(0.5, hx(yy));
    const SOOT = [0.05, 0.035, 0.03], RUST = [0.45, 0.2, 0.08], CRACK = [0.02, 0.015, 0.012];
    // soot from the quarry lip (the furnaces above vent down the face)
    for (let i = 0; i < 16; i++) { const u = -0.95 + (1.9 * (i + rr() * 0.7)) / 16; stain(u, TOP - 0.05, 1.4 + rr() * 4.5, 0.3 + rr() * 0.7, SOOT, 0.55, 0); }
    // dark seams at keel-shape's CRACKS (the engine's teal veins glow in them), jagged, plus a few more for the rock
    const crack = (x0, y0, dx, dy, len, w) => {
      const kinks = [0, R() * 0.5, R() * 0.5, R() * 0.4, 0];
      stainAlong((f) => {
        const i = Math.min(3, Math.floor(f * 4)), k = f * 4 - i, off = kinks[i] + (kinks[i + 1] - kinks[i]) * k;
        const x = x0 + dx * len * f - dy * off, yy = y0 + dy * len * f + dx * off;
        return [uOf(x, yy), yy];
      }, len, w, CRACK, 0.92, 0.7);
    };
    CRACKS.forEach(({ at, dir, len }) => crack(at[0], at[1], dir[0], dir[1], len, 0.16));
    for (let i = 0; i < 6; i++) { const yy = TOP - 3 - rr() * 11; crack(CX + R() * hx(yy) * 1.5, yy, R() * 0.6, 1, 1.2 + rr() * 1.6, 0.1); }

    // ------------------------------------------------------------ iron: hoops round the rock, straps from the rim
    const ironM = K.mat(0x40372f, { shine: 24, spec: 0x2c2a2a }), ironD = K.mat(0x2a241f, { shine: 12, spec: 0x1a1a1a });
    const rivM = K.mat(0xb08440, { shine: 44, spec: 0x6a5430 }), rustM = K.mat(0x8e4624);
    const rootM = K.mat(0x5a4028), copperM = K.mat(0x8a4a2e, { shine: 30, spec: 0x553322 });
    const nearLip = (x, yy) => LIPS.some(({ at }) => Math.abs(at[0] - x) < 2.2 && Math.abs(at[1] - yy) < 3);
    const nearEngine = (x, yy) => Math.abs(x - SOCKET[0]) < 3.2 && yy < SOCKET[1] + 5.4;
    // a flat iron band along a polyline on the rock, riveted
    const segBox = (a, b, h, d, m, n) => {
      const len = a.distanceTo(b); if (len < 1e-3) return null;
      const o = K.box(len + 0.04, h, d, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, g);
      const xAx = new V3().subVectors(b, a).normalize(), zAx = n.clone().sub(xAx.clone().multiplyScalar(n.dot(xAx))).normalize(), yAx = new V3().crossVectors(zAx, xAx);
      o.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(xAx, yAx, zAx));
      return o;
    };
    const hoopYs = [rings.find((r) => r.tier === 2 && r.top).y - 0.35, rings.find((r) => r.tier === 4 && r.top).y - 0.4];
    const hoops = hoopYs.map((hy) => {
      const pts = [];
      for (let u = -0.985; u <= 0.986; u += 0.025) { const h = onRock(u, hy); if (h) pts.push({ u, p: h.p.addScaledVector(h.n, 0.07), n: h.n }); }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        segBox(a.p, b.p, 0.44, 0.08, ironM, a.n);
        segBox(a.p.clone().addScaledVector(a.n, 0.03).setY(hy + 0.15), b.p.clone().addScaledVector(b.n, 0.03).setY(hy + 0.15), 0.05, 0.06, ironD, a.n);
      }
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += pts[i].p.distanceTo(pts[i - 1].p);
        if (acc < 0.55) continue; acc = 0;
        const p = pts[i].p, n = pts[i].n;
        for (const dy of [0.09, -0.09]) K.box(0.07, 0.07, 0.07, rivM, p.x + n.x * 0.05, p.y + dy, p.z + n.z * 0.05, g);
        if (rr() < 0.3) stain(pts[i].u, hy - 0.2, 0.8 + rr() * 2.2, 0.12 + rr() * 0.1, RUST, 0.55, 0);
      }
      return { y: hy, pts };
    });
    // straps: taut from the quarry rim down over each ledge lip to the lower hoop, a plate where they cross a hoop
    const ledgeYs = rings.filter((r) => r.top && r.tier <= 4).map((r) => r.y - 0.05);
    const strapU = [-0.86, -0.6, -0.3, 0.04, 0.33, 0.62, 0.88];
    strapU.forEach((u0) => {
      // a strap hangs plumb: the same x all the way down, so u grows as the rock narrows
      const x = CX + HX0 * (u0 + R() * 0.04), uAt = (yy) => uOf(x, yy);
      if (nearLip(x, TOP - 1) || Math.abs(uAt(hoopYs[1])) > 0.93) return;
      const u = uAt(hoopYs[1]);
      const pts = [];
      const top = surf(uAt(TOP), TOP + 0.2, 1, new V3()); pts.push({ p: top.clone().add(new V3(0, 0, 0.1)), n: new V3(0, 0, 1) });
      for (const ly of ledgeYs) { if (ly < hoopYs[1] - 0.2) break; const h = onRock(uAt(ly), ly); if (h) pts.push({ p: h.p.addScaledVector(h.n, 0.09), n: h.n }); }
      const hb = onRock(u, hoopYs[1]); if (hb) pts.push({ p: hb.p.addScaledVector(hb.n, 0.12), n: hb.n });
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i].p, b = pts[i + 1].p, n = pts[i].n.clone().add(pts[i + 1].n).normalize();
        segBox(a, b, 0.42, 0.07, ironM, n); // a flat strap lying on the rock
        const len = a.distanceTo(b), dir = new V3().subVectors(b, a).normalize();
        for (let s = 0.35; s < len - 0.2; s += 0.6) { const q = a.clone().addScaledVector(dir, s).addScaledVector(n, 0.04); K.box(0.07, 0.07, 0.07, rivM, q.x, q.y, q.z, g); }
      }
      // a turnbuckle at the top, a plate at each hoop crossing, rust weeping from the plate
      K.box(0.36, 0.22, 0.2, ironD, top.x, TOP - 0.05, top.z + 0.12, g);
      K.cyl(0.07, 0.07, 0.5, rustM, 6, top.x, TOP - 0.35, top.z + 0.16, g);
      for (const hy of hoopYs) {
        const h = onRock(uAt(hy), hy); if (!h) continue;
        const p = h.p.addScaledVector(h.n, 0.17);
        const pl = K.box(0.46, 0.5, 0.05, ironD, p.x, p.y, p.z, g); pl.rotation.y = Math.atan2(h.n.x, h.n.z);
        for (const [sx, sy] of [[-0.16, 0.16], [0.16, 0.16], [-0.16, -0.16], [0.16, -0.16]]) K.box(0.08, 0.08, 0.06, rivM, p.x + Math.cos(pl.rotation.y) * sx + h.n.x * 0.03, p.y + sy, p.z - Math.sin(pl.rotation.y) * sx + h.n.z * 0.03, g);
        stain(uAt(hy), hy - 0.3, 1.5 + rr() * 2.5, 0.22, RUST, 0.6, 0);
      }
    });

    // ------------------------------------------------------------ roots and dead pipes hanging off the ledges
    const tubeTaper = (pts, r0, r1, m) => { // a tube that thins toward its end, in a few pieces
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = Math.floor((i * (pts.length - 1)) / n), b = Math.floor(((i + 1) * (pts.length - 1)) / n);
        const sub = pts.slice(a, b + 1); if (sub.length < 2) continue;
        K.tube(sub.map((p) => [p.x, p.y, p.z]), r0 + (r1 - r0) * (i / (n - 1)), m, g, 6, 5);
      }
    };
    for (let i = 0; i < 7; i++) {
      const rg = rings.filter((r) => r.bot && r.tier <= 3)[i % 4]; if (!rg) continue;
      const u = -0.8 + 1.6 * ((i * 0.37 + rr() * 0.2) % 1), h = onRock(u, rg.y + 0.15); if (!h) continue;
      if (nearLip(h.p.x, h.p.y)) continue;
      const L = 1.6 + rr() * 2.6, pts = [h.p.clone().addScaledVector(h.n, -0.1)];
      for (let s = 1; s <= 5; s++) { const q = pts[s - 1].clone(); q.y -= L / 5; q.x += R() * 0.35; q.addScaledVector(h.n, 0.12 + R() * 0.1); pts.push(q); }
      tubeTaper(pts, 0.13, 0.05, rootM);
      if (rr() < 0.6) { const q = pts[2], br = [q, q.clone().add(new V3(R() * 0.5, -0.5, 0.1)), q.clone().add(new V3(R() * 0.9, -1.1, 0.15))]; K.tube(br.map((p) => [p.x, p.y, p.z]), 0.03, rootM, g, 4, 4); }
    }
    // old pipes: out of the face, an elbow, down, a flange (one with a valve wheel); soot or rust runs under them
    [[-0.52, 1], [0.18, 2], [0.7, 1]].forEach(([u, tier], i) => {
      const rg = rings.find((r) => r.tier === tier && r.band === 1); if (!rg) return;
      const h = onRock(u, rg.y); if (!h || nearLip(h.p.x, h.p.y)) return;
      const m = i === 1 ? copperM : ironM, p0 = h.p.clone().addScaledVector(h.n, -0.2), p1 = h.p.clone().addScaledVector(h.n, 0.55);
      const L = 1.4 + rr() * 1.8, p2 = p1.clone().add(new V3(0, -0.35, 0)), p3 = p1.clone().add(new V3(0, -L, 0));
      K.tube([[p0.x, p0.y, p0.z], [p1.x, p1.y + 0.02, p1.z], [p2.x, p2.y, p2.z], [p3.x, p3.y, p3.z]], 0.11, m, g, 10, 6);
      K.cyl(0.17, 0.17, 0.08, ironD, 8, p3.x, p3.y, p3.z, g);
      const fl = K.cyl(0.19, 0.19, 0.07, ironD, 8, h.p.x + h.n.x * 0.05, h.p.y, h.p.z + h.n.z * 0.05, g); fl.rotation.x = Math.PI / 2; fl.rotation.z = -Math.atan2(h.n.x, h.n.z);
      if (i === 1) { const w = K.torus(0.2, 0.035, rustM, 4, 10, p1.x + h.n.x * 0.1, p1.y - 0.7, p1.z + h.n.z * 0.25, g); w.rotation.y = Math.atan2(h.n.x, h.n.z); }
      stain(u, rg.y - 0.25, 1.8 + rr() * 1.5, 0.2, i === 1 ? [0.18, 0.32, 0.26] : RUST, 0.45, 0);
    });
    // chunks of the same stone jutting from the flanks, so the silhouette isn't a smooth curve
    const chunkM = [K.mat(0x6a6270, { map: rockM.map }), K.mat(0x524e5a, { map: rockM.map })];
    for (let i = 0; i < 12; i++) {
      const rg = rings[1 + Math.floor(rr() * (rings.length - 3))], u = (rr() < 0.5 ? -1 : 1) * (0.7 + rr() * 0.28);
      const h = onRock(u, rg.y); if (!h || nearLip(h.p.x, h.p.y) || nearEngine(h.p.x, h.p.y)) continue;
      const r = 0.4 + rr() * 0.6, c = K.rock(r, chunkM[i % 2], h.p.x + h.n.x * r * 0.2, h.p.y, h.p.z + h.n.z * r * 0.2, g);
      c.scale.set(1.2, 0.55 + rr() * 0.35, 0.8); c.rotation.set(rr() * 3, rr() * 3, rr() * 3);
    }

    // the stains mesh (vertex alpha: one draw call, drawn over the rock, never writes depth)
    if (sPos.length) {
      const sg = new T.BufferGeometry();
      sg.setAttribute('position', new T.Float32BufferAttribute(sPos, 3));
      sg.setAttribute('color', new T.Float32BufferAttribute(sCol, 4));
      const sm = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: T.DoubleSide });
      const st = new T.Mesh(sg, sm); st.name = 'keel-stains'; st.renderOrder = 1; st.castShadow = st.receiveShadow = false;
      g.add(st);
    }
    // nothing of ours casts (the rock only receives): cheap on the shadow pass
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }, 1.5);
}
