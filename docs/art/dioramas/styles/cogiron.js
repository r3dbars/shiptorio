// BLACK IRON (Cogworks variation 1): the dirtiest foundry. Oil-black iron, soot, rust, coal dust,
// furnace glow, and a chain-driven conveyor line that ties every machine together.
(function () {
  'use strict';
  const C = {
    soot: 0x0f0c0a, iron: 0x221d19, ironL: 0x3a332c, ironM: 0x2b2520,
    brass: 0x8a6428, brassD: 0x4e3816, brassL: 0xb48a3e,
    copper: 0x7a3c20, copperD: 0x4a2414, verd: 0x2f6a58, verdD: 0x1e463a,
    brick: 0x4a2216, brickD: 0x301612, stone: 0x4a4038, stoneD: 0x302922,
    wood: 0x3e2a18, woodD: 0x2a1c10, leather: 0x3a2214, cream: 0xc8b48a,
    gas: 0xffc070, ember: 0xff7a2a, red: 0xe0402a, teal: 0x7af0d8
  };

  // ---------- shared material + part helpers ----------
  let M = null;
  function mats(K) {
    if (M) return M;
    M = {
      brass: K.mat(C.brass, { shine: 38, spec: 0x7a5a28 }),
      brassL: K.mat(C.brassL, { shine: 50, spec: 0x9a7a40 }),
      brassD: K.mat(C.brassD, { shine: 20, spec: 0x3a2a10 }),
      copper: K.mat(C.copper, { shine: 34, spec: 0x6a3a20 }),
      copperD: K.mat(C.copperD, { shine: 18, spec: 0x3a1a0a }),
      iron: K.mat(C.iron, { shine: 26, spec: 0x2a2a30 }), ironM: K.mat(C.ironM, { shine: 18, spec: 0x222228 }), ironL: K.mat(C.ironL, { shine: 30, spec: 0x34343a }),
      oil: K.mat(0x07070a, { shine: 90, spec: 0x6a5a8a }), rust: K.mat(0x6a2e14), rustL: K.mat(0x8a4a1e), hazard: K.mat(0xb8860e), grime: K.mat(0x050403, { op: 0.55, depthWrite: false }),
      soot: K.mat(C.soot), verd: K.mat(C.verd), verdD: K.mat(C.verdD),
      wood: K.mat(C.wood), woodD: K.mat(C.woodD), leather: K.mat(C.leather),
      brick: K.mat(C.brick), brickD: K.mat(C.brickD), stone: K.mat(C.stone), stoneD: K.mat(C.stoneD),
      cream: K.mat(C.cream),
      glass: K.mat(0xa8d8c8, { op: 0.22, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      gas: K.glow(C.gas), ember: K.glow(C.ember), teal: K.glow(C.teal)
    };
    return M;
  }
  // a gear lying in the xz plane (axis = y); rotate the returned group to orient it
  function gear(K, p, r, thick, teeth, m, x, y, z) {
    const g = K.group(p, x, y, z);
    K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, g);
    const tw = (Math.PI * 2 * r) / teeth * 0.5;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * (r + r * 0.08), 0, Math.cos(a) * (r + r * 0.08), g);
      tb.rotation.y = a;
    }
    K.cyl(r * 0.28, r * 0.28, thick * 1.6, M.ironM, 8, 0, 0, 0, g);
    if (r > 0.35) for (let i = 0; i < 4; i++) { const s = K.box(r * 1.4, thick * 1.1, r * 0.12, M.brassD, 0, 0, 0, g); s.rotation.y = i * Math.PI / 4; s.scale.x = 0.95; }
    return g;
  }
  function rivetRing(K, p, r, y, n, m) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.08, 0.08, 0.08, m || M.brassL, Math.cos(a) * r, y, Math.sin(a) * r, p); } }
  function band(K, p, r, y, m, h) { K.cyl(r, r, h || 0.1, m || M.brass, 18, 0, y, 0, p); }
  // gauge facing +z (rotate the group to face elsewhere); returns needle pivot
  function gauge(K, p, x, y, z, r, ry) {
    const g = K.group(p, x, y, z); g.rotation.y = ry || 0;
    const rim = K.cyl(r * 1.15, r * 1.15, 0.08, M.brass, 14, 0, 0, 0, g); rim.rotation.x = Math.PI / 2;
    const face = K.cyl(r, r, 0.1, M.cream, 14, 0, 0, 0.01, g); face.rotation.x = Math.PI / 2;
    const red = K.box(r * 0.5, r * 0.18, 0.02, K.mat(0xb02a1a), r * 0.45, r * 0.45, 0.065, g); red.rotation.z = -0.8;
    const piv = K.group(g, 0, 0, 0.07);
    K.box(0.035, r * 0.85, 0.02, K.mat(0x140c06), 0, r * 0.38, 0, piv);
    K.box(0.07, 0.07, 0.03, M.brassL, 0, 0, 0.01, g);
    return piv;
  }
  // smoke/steam puff helper
  function puff(K, p, x, y, z, col, size, vy, spread, life) {
    K.spawn(p, x + K.R() * spread, y, z + K.R() * spread, K.R() * 0.3 + 0.25, vy, K.R() * 0.3, col, life || 2.6, size, -0.12);
  }
  function lamp(K, p, x, z, h, withLight) {
    const g = K.group(p, x, 0, z);
    K.cyl(0.22, 0.28, 0.22, M.iron, 8, 0, 0.11, 0, g);
    K.cyl(0.07, 0.09, h, M.iron, 8, 0, h / 2, 0, g);
    for (let i = 0; i < 3; i++) band(K, g, 0.1, 0.5 + i * (h * 0.3), M.brassD, 0.06);
    const arm = K.box(0.5, 0.06, 0.06, M.iron, 0.18, h - 0.1, 0, g); arm.rotation.z = 0.2;
    K.cyl(0.2, 0.14, 0.1, M.brass, 6, 0, h, 0, g);
    const glass = K.box(0.24, 0.34, 0.24, M.gas, 0, h + 0.24, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.035, 0.38, 0.035, M.iron, sx * 0.13, h + 0.24, sz * 0.13, g);
    K.cone(0.24, 0.24, M.brassD, 6, 0, h + 0.53, 0, g);
    K.sph(0.05, M.brassL, 0, h + 0.68, 0, g, 6, 4);
    const L = withLight ? K.light(0xffaa55, 1.4, 7.5, 0, h + 0.2, 0, g) : null;
    return { g, glass, L };
  }

  // ---------- textures ----------
  function cobbleTex(K) {
    return K.canvasTex(128, 128, (g) => {
      let s = 31; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#0c0907'; g.fillRect(0, 0, 128, 128);
      const tones = ['#2a241f', '#302821', '#352c25', '#26201b', '#3a3129', '#2e2620'];
      for (let y = 0; y < 128; y += 9) {
        let x = -Math.floor(r() * 8);
        while (x < 128) {
          const w = 7 + Math.floor(r() * 5), h = 7 + Math.floor(r() * 2), oy = Math.floor(r() * 2);
          g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1 + oy, w - 1, h - 1);
          g.fillRect(x + 2, y + oy, w - 3, 1); g.fillRect(x + 2, y + h + oy - 0, w - 3, 1);
          g.fillStyle = 'rgba(255,220,170,0.09)'; g.fillRect(x + 2, y + 1 + oy, w - 3, 1);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1, y + h - 1 + oy, w - 1, 1);
          x += w;
        }
      }
      for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(4,3,2,0.5)'; const x = r() * 110, y = r() * 110; g.fillRect(x, y, 10 + r() * 16, 5 + r() * 8); }
      for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(Math.floor(r() * 64) * 2, Math.floor(r() * 64) * 2, 2, 2); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(90,40,16,0.25)'; g.fillRect(r() * 120, r() * 120, 8, 3); }
    }, [9, 4.5]);
  }
  function brickTex(K, rep, dark) {
    return K.canvasTex(64, 64, (g) => {
      let s = 7; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = dark ? '#1c100c' : '#2a1812'; g.fillRect(0, 0, 64, 64);
      const tones = dark ? ['#4a2018', '#3e1c15', '#52251b'] : ['#6e3020', '#62291b', '#7a3826', '#5a2618'];
      for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < 64; x += 16) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 14, 6);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 5, 14, 2);
      }
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(8,4,2,0.35)'; g.fillRect(r() * 64, 0, 4 + r() * 8, 64); }
    }, rep);
  }
  function stoneTex(K, rep) {
    return K.canvasTex(64, 64, (g) => {
      let s = 13; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#231b15'; g.fillRect(0, 0, 64, 64);
      const tones = ['#5e5142', '#544838', '#675948'];
      for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
        g.fillStyle = tones[Math.floor(r() * 3)]; g.fillRect(x + 1, y + 1, 22, 14);
        g.fillStyle = 'rgba(255,230,190,0.08)'; g.fillRect(x + 2, y + 1, 20, 2);
      }
    }, rep);
  }


  // =====================================================================
  // FACTORY LINE: chain-driven belts that tie the three machines together
  // =====================================================================
  let BT = null;
  function beltTex(K) {
    if (BT) return BT;
    BT = K.canvasTex(16, 16, (g) => {
      g.fillStyle = '#0d0b09'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#332b24'; g.fillRect(0, 1, 16, 14);
      g.fillStyle = '#5e5246'; g.fillRect(1, 1, 4, 14); g.fillRect(9, 1, 4, 14);
      g.fillStyle = '#8a7660'; g.fillRect(1, 1, 4, 1); g.fillRect(9, 1, 4, 1);
      g.fillStyle = '#060504'; g.fillRect(5, 1, 1, 14); g.fillRect(13, 1, 1, 14);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(6, 4, 2, 3); g.fillRect(14, 10, 2, 2);
    });
    return BT;
  }
  function makePath(pts) {
    const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const hl = Math.hypot(dx, dz), len = Math.hypot(hl, dy);
      segs.push({ a, b, len, L0: L, yaw: Math.atan2(-dz, dx), pitch: Math.atan2(dy, hl), hl, dx, dz });
      L += len;
    }
    return { segs, L, at(s, o) {
      s = Math.max(0, Math.min(L - 1e-4, s));
      let sg = segs[0]; for (const q of segs) if (s >= q.L0) sg = q;
      const k = (s - sg.L0) / sg.len;
      o.set(sg.a[0] + (sg.b[0] - sg.a[0]) * k, sg.a[1] + (sg.b[1] - sg.a[1]) * k, sg.a[2] + (sg.b[2] - sg.a[2]) * k);
      return sg;
    } };
  }
  function trestleLeg(K, root, x, y, z, px, pz, w, tall) {
    const h = y - 0.2; if (h < 0.15) return;
    for (const s of [-1, 1]) {
      const lx = x + px * s * (w / 2 + 0.05), lz = z + pz * s * (w / 2 + 0.05);
      K.box(0.12, h, 0.12, M.iron, lx, h / 2, lz, root);
      K.box(0.22, 0.1, 0.22, M.ironM, lx, 0.05, lz, root);
    }
    K.box(Math.abs(px) * (w + 0.3) + 0.1, 0.1, Math.abs(pz) * (w + 0.3) + 0.1, M.ironM, x, h, z, root);
    if (tall) {
      K.box(Math.abs(px) * (w + 0.3) + 0.08, 0.08, Math.abs(pz) * (w + 0.3) + 0.08, M.ironM, x, h * 0.45, z, root);
    }
  }
  const runLights = [];
  function buildBelt(K, root, pts, w, belts) {
    const P = makePath(pts);
    P.segs.forEach((sg) => {
      const g = K.group(root, sg.a[0], sg.a[1], sg.a[2]);
      g.rotation.order = 'YZX'; g.rotation.y = sg.yaw; g.rotation.z = sg.pitch;
      const tex = beltTex(K).clone(); tex.needsUpdate = true; tex.repeat.set(sg.len * 2, 1);
      const top = K.mat(0xffffff, { map: tex, shine: 24, spec: 0x2a2620 });
      K.box(sg.len + 0.02, 0.1, w, [M.soot, M.soot, top, M.soot, M.soot, M.soot], sg.len / 2, 0, 0, g);
      for (const s of [-1, 1]) {
        K.box(sg.len + 0.12, 0.26, 0.09, M.ironM, sg.len / 2, -0.03, s * (w / 2 + 0.05), g);
        K.box(sg.len + 0.12, 0.05, 0.13, M.rustL, sg.len / 2, 0.11, s * (w / 2 + 0.06), g);
        for (let x = 0.3; x < sg.len; x += 0.6) K.box(0.06, 0.06, 0.03, M.brassL, x, -0.02, s * (w / 2 + 0.1), g);
        if (s > 0) for (let x = 0.5; x < sg.len - 0.2; x += 1.2) runLights.push(K.box(0.1, 0.07, 0.05, K.glow(0x3a1a06), x, 0.05, s * (w / 2 + 0.12), g));
      }
      for (let x = 0.2; x < sg.len; x += 0.45) { const r = K.cyl(0.075, 0.075, w + 0.06, M.ironL, 6, x, -0.13, 0, g); r.rotation.x = Math.PI / 2; }
      K.box(sg.len, 0.04, w * 0.85, M.iron, sg.len / 2, -0.25, 0, g);
      belts.push({ tex });
      // legs: sampled along the segment, perpendicular to it
      const px = -sg.dz / sg.hl, pz = sg.dx / sg.hl;
      const n = Math.max(1, Math.round(sg.hl / 1.7));
      for (let i = 0; i <= n; i++) {
        const k = i / n; const y = sg.a[1] + (sg.b[1] - sg.a[1]) * k;
        trestleLeg(K, root, sg.a[0] + sg.dx * k, y - 0.08, sg.a[2] + sg.dz * k, Math.abs(px) > 0.5 ? 1 : 0, Math.abs(px) > 0.5 ? 0 : 1, w, y > 1.2);
      }
    });
    return P;
  }
  // a motor block with a chain-driven sprocket at a belt end
  function drive(K, root, x, y, z, ry, gears) {
    const g = K.group(root, x, 0, z); g.rotation.y = ry;
    K.box(0.7, y - 0.15, 0.6, M.ironM, 0, (y - 0.15) / 2, 0, g);
    K.box(0.8, 0.08, 0.7, M.rust, 0, y - 0.12, 0, g);
    const big = gear(K, g, 0.42, 0.1, 14, M.brassD, 0, y + 0.15, 0.38); big.rotation.x = Math.PI / 2;
    const small = gear(K, g, 0.2, 0.1, 8, M.brass, 0.0, 0.45, 0.38); small.rotation.x = Math.PI / 2;
    const ch = K.box(0.04, y - 0.3, 0.04, M.soot, -0.32, (y + 0.6) / 2, 0.42, g), ch2 = K.box(0.04, y - 0.3, 0.04, M.soot, 0.32, (y + 0.6) / 2, 0.42, g);
    const fly = K.cyl(0.3, 0.3, 0.12, M.iron, 12, 0, 0.45, -0.38, g); fly.rotation.x = Math.PI / 2;
    K.box(0.12, 0.12, 0.62, M.brassD, 0, 0.45, 0, g);
    gears.push({ g: big, s: 1 }, { g: small, s: -2.1 }, { g: fly, s: -2.1, axis: 'y' });
    return g;
  }

  function factoryLine(K, root) {
    const belts = [], gears = [];
    const W = 0.8;
    // paths (root-local): ore bunker -> splitter hopper, splitter -> assembler, assembler -> launch pad (raised), rework loop
    const ORE_P = buildBelt(K, root, [[13.0, 0.95, -4.9], [4.8, 0.95, -4.9], [1.25, 4.25, -2.55]], W, belts);
    const SORT_P = buildBelt(K, root, [[1.8, 0.5, 3.95], [-4.4, 0.5, 3.95], [-6.1, 0.5, 2.0]], W, belts);
    const PR_P = buildBelt(K, root, [[-5.9, 0.95, -2.15], [-3.7, 1.75, -3.6], [5.0, 1.75, -3.6], [6.1, 0.95, -2.3]], W, belts);
    const RW_P = buildBelt(K, root, [[6.7, 0.42, 2.8], [5.4, 0.42, 5.4], [-2.6, 0.42, 5.4], [-2.6, 1.7, 3.25]], W * 0.8, belts);

    // ore bunker at the head of the ore line
    const bk = K.group(root, 13.4, 0, -4.9);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) K.box(0.18, 3.0, 0.18, M.iron, sx, 1.5, sz, bk);
    K.lathe([[0.3, 0], [1.25, 1.1], [1.3, 1.6]], M.rust, 4, 0, 1.9, 0, bk).rotation.y = Math.PI / 4;
    K.box(2.0, 0.12, 2.0, M.ironM, 0, 3.55, 0, bk);
    for (let i = 0; i < 16; i++) K.rock(0.18 + K.rnd() * 0.14, i % 4 ? M.soot : K.mat(0x5a2a14, { e: 0x2a0a02 }), K.R() * 1.6, 3.55 + K.rnd() * 0.25, K.R() * 1.6, bk);
    K.box(0.6, 0.5, 0.8, M.ironM, -0.6, 1.55, 0, bk);
    hazardBand(K, bk, 2.0, 3.45, 1.03, 10);
    // splitter output chute onto the sort line, assembler input hopper, assembler output chute, pad input
    chute(K, root, 1.6, 1.1, 3.25, 0.5, Math.PI * 0.75);
    funnel(K, root, -6.3, 0.95, 1.75);
    chute(K, root, -6.2, 1.5, -1.8, 0.9, -Math.PI * 0.25);
    funnel(K, root, 6.35, 1.4, -2.0);
    funnel(K, root, -2.6, 2.1, 3.0);
    // drives at belt heads
    drive(K, root, 12.2, 0.95, -4.05, 0, gears);
    drive(K, root, -4.6, 0.5, 4.85, 0, gears);
    drive(K, root, 4.4, 1.75, -2.75, 0, gears);
    drive(K, root, 5.9, 0.42, 6.3, 0, gears);

    // DROP FORGE on the PR line: heavy hammer stamps each crate
    const fg = K.group(root, -3.4, 0, -3.6);
    const fgRed = K.mat(0x6a2414, { shine: 16, spec: 0x2a1a10 });
    for (const s of [-1, 1]) { K.box(0.4, 4.6, 0.4, fgRed, 0, 2.3, s * 0.85, fg); for (const y of [1.0, 2.6, 4.2]) K.box(0.46, 0.08, 0.46, M.brassD, 0, y, s * 0.85, fg); K.box(0.55, 0.3, 0.55, M.ironM, 0, 0.15, s * 0.85, fg); hazardBand(K, fg, 0.42, 1.0, s * 0.85 + 0.22 * s, 3, true); }
    K.box(0.7, 0.55, 2.3, fgRed, 0, 4.7, 0, fg); hazardBand(K, fg, 2.3, 4.7, 0.36, 9); for (const z of [-0.95, 0.95]) K.box(0.5, 0.5, 0.06, M.brassD, 0, 4.7, z, fg);
    K.box(0.74, 0.08, 2.34, M.rust, 0, 4.98, 0, fg);
    const cylr = K.cyl(0.32, 0.32, 1.1, M.ironL, 10, 0, 5.5, 0, fg); band(K, fg, 0.34, 5.2, M.brassD, 0.08);
    const ram = K.group(fg, 0, 3.4, 0);
    K.box(0.6, 0.7, 1.0, M.ironL, 0, 0, 0, ram); K.box(0.62, 0.12, 1.02, M.hazard, 0, -0.2, 0, ram); K.box(0.66, 0.1, 1.06, M.brassD, 0, 0.32, 0, ram);
    K.box(0.5, 0.12, 0.8, M.ironL, 0, -0.4, 0, ram);
    const rod = K.cyl(0.08, 0.08, 1.6, M.ironL, 6, 0, 1.1, 0, ram);
    const anvil = K.box(0.8, 0.25, 1.4, M.ironM, 0, 1.45, 0, fg); anvil.visible = false;
    const forgeGlow = K.box(0.52, 0.04, 0.74, K.glow(0xff7a2a), 0, 1.82, 0, fg); forgeGlow.visible = false;
    // stamping press on the sort line
    const pg = K.group(root, -3.2, 0, 3.95);
    for (const s of [-1, 1]) K.box(0.24, 2.2, 0.24, M.iron, 0, 1.1, s * 0.62, pg);
    K.box(0.5, 0.35, 1.5, M.ironM, 0, 2.25, 0, pg); hazardBand(K, pg, 1.5, 2.1, 0.27, 6);
    const pressHead = K.box(0.42, 0.4, 0.62, M.ironL, 0, 1.4, 0, pg);
    K.cyl(0.07, 0.07, 0.8, M.brass, 6, 0, 1.9, 0, pg);

    // CHAIN HOIST over the ore line
    const hb = K.group(root, 10.0, 0, -4.9);
    K.box(0.3, 4.4, 0.3, M.iron, 0, 2.2, 1.6, hb); K.box(0.3, 0.3, 2.6, M.ironM, 0, 4.3, 0.4, hb);
    const trolley = K.group(hb, 0, 4.1, 0.2); K.box(0.4, 0.22, 0.5, M.rust, 0, 0, 0, trolley);
    const swing = K.group(trolley, 0, -0.1, 0);
    for (let i = 0; i < 9; i++) { const l = K.torus(0.07, 0.02, M.ironL, 4, 6, 0, -0.12 - i * 0.16, 0, swing); l.rotation.y = i % 2 ? Math.PI / 2 : 0; }
    K.box(0.08, 0.3, 0.08, M.ironL, 0, -1.6, 0, swing);
    const hookCrate = K.group(swing, 0, -2.0, 0);
    K.box(0.6, 0.45, 0.6, M.woodD, 0, 0, 0, hookCrate); for (const x of [-0.24, 0.24]) K.box(0.06, 0.47, 0.62, M.ironM, x, 0, 0, hookCrate);

    // BLAST FURNACE against the back wall, the main light of the yard
    const bf = K.group(root, -10.6, 0, -4.95);
    const bt = K.mat(0xffffff, { map: brickTex(K, [3, 3], true) });
    K.cyl(1.25, 1.45, 3.4, bt, 12, 0, 1.7, 0, bf);
    for (const y of [0.6, 1.6, 2.6, 3.3]) band(K, bf, 1.3 + (3.4 - y) * 0.05, y, M.ironM, 0.14);
    K.lathe([[1.25, 0], [0.9, 0.7], [0.5, 1.2], [0.5, 2.2]], M.ironM, 12, 0, 3.4, 0, bf);
    K.cyl(0.6, 0.6, 0.2, M.rust, 12, 0, 5.7, 0, bf);
    const mouth = K.box(0.9, 0.8, 0.2, K.glow(0xff8a2a), 0, 0.85, 1.32, bf);
    const mouthArc = K.cyl(0.45, 0.45, 0.2, K.glow(0xff8a2a), 10, 0, 1.25, 1.32, bf); mouthArc.rotation.x = Math.PI / 2;
    K.box(1.2, 0.14, 0.4, M.soot, 0, 0.42, 1.4, bf);
    for (let i = 0; i < 5; i++) K.box(0.07, 1.25, 0.08, M.soot, -0.36 + i * 0.18, 1.05, 1.46, bf);
    for (const y of [0.75, 1.3]) K.box(1.0, 0.07, 0.08, M.soot, 0, y, 1.46, bf);
    K.box(1.3, 0.2, 0.3, M.ironM, 0, 1.78, 1.4, bf);
    const furnL = K.light(0xff6a1a, 2.6, 11, 0, 1.2, 2.4, bf);
    // molten runner channel to a crucible
    const runner = K.box(0.22, 0.06, 2.6, K.glow(0xff7a1a), 0, 0.09, 2.7, bf);
    K.box(0.4, 0.1, 2.7, M.soot, 0, 0.05, 2.7, bf);
    const cru = K.group(bf, 0, 0, 4.2); K.cyl(0.45, 0.35, 0.6, M.ironL, 10, 0, 0.3, 0, cru); const molten = K.cyl(0.4, 0.4, 0.04, K.glow(0xffa040), 10, 0, 0.6, 0, cru);
    K.tube([[0.8, 4.6, -0.6], [1.6, 5.0, -0.8], [3.5, 5.0, -1.0], [4.4, 4.0, -1.0], [4.4, 3.4, -0.9]], 0.16, M.rust, bf, 24, 6);

    // oil puddles with a sheen, grime and drips
    for (const [x, z, sx, sz] of [[-3.8, 1.0, 1.4, 0.8], [3.3, 2.2, 1.0, 0.7], [-6.0, -3.8, 1.6, 0.9], [9.6, -2.6, 1.2, 0.8], [-1.0, 5.1, 1.3, 0.6], [11.0, 4.6, 0.9, 0.6], [-12.4, 3.4, 1.0, 0.7]]) {
      const p = K.sph(1, M.oil, x, 0.06, z, root, 12, 4); p.scale.set(sx, 0.025, sz); p.castShadow = false;
    }
    for (let i = 0; i < 18; i++) { const d = K.box(0.5 + K.rnd() * 1.4, 0.01, 0.3 + K.rnd() * 0.9, M.grime, -14 + K.rnd() * 28, 0.1, -5 + K.rnd() * 11, root); d.rotation.y = K.rnd() * 3; d.castShadow = false; }

    // the items riding the belts
    const v = new K.THREE.Vector3();
    const ORE = [0xc05a2a, 0x5a7ab0, 0xd09a3a];
    const lines = [];
    function items(P, n, speed, make) { const arr = []; for (let i = 0; i < n; i++) { const m = make(i); root.add(m); arr.push({ m, s: (i / n) * P.L }); } lines.push({ P, arr, speed }); }
    items(ORE_P, 12, 0.9, (i) => { const g = K.group(); K.rock(0.17 + (i % 3) * 0.03, i % 3 ? M.soot : K.mat(0x6a3a1a, { e: 0x2a0c02 }), 0, 0.2, 0, g); K.rock(0.11, M.soot, 0.15, 0.14, 0.12, g); return g; });
    items(SORT_P, 8, 0.75, (i) => { const g = K.group(); const c = K.cyl(0.13, 0.13, 0.42, K.mat(ORE[i % 3], { e: ORE[i % 3] & 0x4a4a4a }), 8, 0, 0.2, 0, g); c.rotation.z = Math.PI / 2; for (const x of [-0.17, 0.17]) { const b = K.cyl(0.14, 0.14, 0.05, M.brassL, 8, x, 0.2, 0, g); b.rotation.z = Math.PI / 2; } return g; });
    items(PR_P, 7, 0.7, () => { const g = K.group(); K.box(0.5, 0.4, 0.42, M.woodD, 0, 0.25, 0, g); for (const x of [-0.2, 0.2]) K.box(0.05, 0.42, 0.44, M.brass, x, 0.25, 0, g); K.box(0.36, 0.03, 0.3, K.glow(0x7af0d8), 0, 0.46, 0, g); return g; });
    items(RW_P, 5, 0.6, () => { const g = K.group(); K.box(0.42, 0.34, 0.36, M.woodD, 0, 0.22, 0, g); K.box(0.44, 0.06, 0.38, M.ironM, 0, 0.3, 0, g); const tag = K.box(0.14, 0.18, 0.02, K.glow(0xff4a2a), 0.12, 0.28, 0.2, g); return g; });

    let tDrip = 0, tSpark = 0;
    return { update(t, dt) {
      belts.forEach((b) => (b.tex.offset.x -= dt * 1.6));
      runLights.forEach((m, i) => m.material.color.setHex(Math.floor(t * 4 - i * 0.5) % 4 === 0 ? 0xffa030 : 0x4a2208));
      gears.forEach((q) => { if (q.axis === 'y') q.g.rotation.y += dt * q.s * 1.5; else q.g.rotation.y += dt * q.s * 1.5; });
      lines.forEach((ln) => ln.arr.forEach((it) => {
        it.s += dt * ln.speed; if (it.s > ln.P.L) it.s -= ln.P.L;
        const sg = ln.P.at(it.s, v); it.m.position.set(v.x, v.y + 0.04, v.z); it.m.rotation.set(0, sg.yaw, 0); it.m.rotation.order = 'YZX'; it.m.rotation.z = sg.pitch;
        it.m.visible = it.s > 0.25 && it.s < ln.P.L - 0.2;
      }));
      // drop forge: slow lift, fast strike
      const fp = (t * 0.7) % 1;
      const ry = fp < 0.75 ? 2.0 + (fp / 0.75) * 1.6 : 3.6 - ((fp - 0.75) / 0.25) ** 2 * 1.6;
      ram.position.y = ry; rod.position.y = 1.1 + (3.6 - ry) * 0.5;
      forgeGlow.visible = fp > 0.93;
      if (fp > 0.97 && tSpark <= 0) { tSpark = 0.4; for (let i = 0; i < 14; i++) K.spawn(root, -3.4 + K.R() * 0.5, 2.1, -3.6 + K.R() * 0.6, K.R() * 4, 1 + Math.random() * 2.5, K.R() * 4, Math.random() < 0.5 ? 0xffc040 : 0xfff0c0, 0.5, 0.06, 7, true); for (let i = 0; i < 4; i++) puff(K, root, -3.4, 2.0, -3.6, 0x4a4038, 0.2, 0.6, 0.6, 1.6); }
      tSpark -= dt;
      pressHead.position.y = 1.4 - Math.max(0, Math.sin(t * 3.2)) ** 6 * 0.55;
      // hoist sways and creeps
      trolley.position.z = 0.2 + Math.sin(t * 0.3) * 0.8; swing.rotation.x = Math.sin(t * 1.3) * 0.12; swing.rotation.z = Math.sin(t * 0.9) * 0.05;
      // furnace flicker
      const ff = 0.85 + Math.sin(t * 9) * 0.07 + Math.sin(t * 23) * 0.05;
      if (!furnL.isDummy) furnL.intensity = 2.6 * ff;
      mouth.material.color.setRGB(1, 0.5 * ff, 0.14); runner.material.color.setRGB(1, 0.42 + Math.sin(t * 3) * 0.06, 0.08); molten.material.color.setRGB(1, 0.6 * ff, 0.2);
      if (Math.random() < 0.3) K.spawn(root, -10.6 + K.R() * 0.6, 5.8, -4.95 + K.R() * 0.6, 0.3 + K.R() * 0.2, 0.9, K.R() * 0.2, Math.random() < 0.5 ? 0x1a1512 : 0x2c241e, 4, 0.45, -0.08);
      if (Math.random() < 0.08) K.spawn(root, -10.6 + K.R() * 0.4, 1.0, -3.5, K.R() * 0.6, 1.4, 0.8, 0xffa030, 0.8, 0.05, 2, true);
      // oil drips from the raised belts
      tDrip -= dt;
      if (tDrip <= 0) { tDrip = 0.35; const P = Math.random() < 0.5 ? PR_P : ORE_P; P.at(Math.random() * P.L, v); if (v.y > 1.0) K.spawn(root, v.x, v.y - 0.3, v.z, 0, -0.2, 0, 0x050505, 0.9, 0.05, 6); }
    } };
  }
  function hazardBand(K, p, len, y, z, n, vertical) {
    const w = len / n;
    for (let i = 0; i < n; i++) K.box(vertical ? 0.43 : w * 0.96, vertical ? w * 0.96 : 0.12, 0.04, i % 2 ? M.soot : M.hazard, vertical ? 0 : -len / 2 + w * (i + 0.5), vertical ? y - len / 2 + w * (i + 0.5) : y, z, p);
  }
  function chute(K, root, x, y, z, len, ry) {
    const g = K.group(root, x, y, z); g.rotation.y = ry;
    const c = K.box(len, 0.06, 0.55, M.ironL, len / 2, 0, 0, g); c.rotation.z = -0.5;
    for (const s of [-1, 1]) { const w = K.box(len, 0.2, 0.05, M.ironM, len / 2, 0.08, s * 0.28, g); w.rotation.z = -0.5; }
  }
  function funnel(K, root, x, y, z) {
    const g = K.group(root, x, y, z);
    K.lathe([[0.18, 0], [0.5, 0.45], [0.52, 0.55]], M.rust, 6, 0, 0, 0, g);
    K.cyl(0.18, 0.18, y, M.ironM, 6, 0, -y / 2, 0, g);
  }

  // =====================================================================
  // WORLD
  // =====================================================================
  function world(K, root) {
    mats(K);
    // raised foundry platform
    const top = K.mat(0xffffff, { map: cobbleTex(K) });
    const front = K.mat(0xffffff, { map: stoneTex(K, [10, 0.5]) });
    const side = K.mat(0xffffff, { map: stoneTex(K, [5, 0.5]) });
    K.box(30, 1.4, 15, [side, side, top, M.soot, front, front], 0, -0.7, 0, root);
    K.box(30.4, 0.18, 15.4, M.stoneD, 0, -0.02, 0, root).receiveShadow = true;
    K.box(30, 0.04, 15, top, 0, 0.08, 0, root);
    // foundations under the platform
    for (const x of [-12, -4, 4, 12]) { K.box(1.6, 5, 1.6, M.soot, x, -3.8, 5.5, root); K.box(2, 0.3, 2, M.iron, x, -1.45, 5.5, root); }
    K.tube([[-14, -1.6, 7.6], [-6, -1.8, 7.7], [2, -1.6, 7.6], [14, -1.7, 7.6]], 0.16, M.copperD, root, 30, 6);
    // lower foundry level under the yard: a dark substructure with furnace mouths
    K.box(29, 7, 13, M.soot, 0, -4.9, -0.6, root);
    const furn = [];
    for (const x of [-10.5, -6, -1.5, 3, 7.5, 12]) {
      const fm = K.box(1.2, 0.9, 0.1, K.glow(0xff6a20), x, -2.6, 5.92, root); furn.push(fm);
      const ar = K.cyl(0.6, 0.6, 0.1, K.glow(0xff6a20), 10, x, -2.15, 5.92, root); ar.rotation.x = Math.PI / 2; furn.push(ar);
      K.box(1.5, 0.15, 0.3, M.ironM, x, -3.1, 6.0, root);
      for (let i = 0; i < 4; i++) K.box(0.06, 1.2, 0.1, M.iron, x - 0.42 + i * 0.28, -2.45, 5.98, root);
    }
    for (const x of [-9, -1, 7]) { const d = K.box(1.1, 0.7, 0.1, M.soot, x, -0.75, 7.52, root); const a = K.cyl(0.55, 0.55, 0.1, M.soot, 10, x, -0.4, 7.52, root); a.rotation.x = Math.PI / 2; K.box(0.06, 0.6, 0.12, M.iron, x - 0.25, -0.75, 7.56, root); K.box(0.06, 0.6, 0.12, M.iron, x + 0.25, -0.75, 7.56, root); }

    // back factory wall with arched windows and wall gears
    const brick = K.mat(0xffffff, { map: brickTex(K, [8, 1.2]) });
    K.box(30, 3.6, 0.7, brick, 0, 1.8, -6.6, root);
    K.box(30.2, 0.25, 0.9, M.stoneD, 0, 3.7, -6.6, root);
    K.box(30.2, 0.3, 0.9, M.stoneD, 0, 0.15, -6.6, root);
    const winGlow = K.glow(0xb8642a);
    const winGlowDim = K.glow(0x3a1e10);
    const windows = [];
    for (let x = -13; x <= 13; x += 2.6) {
      if (Math.abs(x - 2.6) < 0.5 || Math.abs(x + 5.2) < 0.5) continue;
      const lit = K.rnd() < 0.6;
      const w = K.box(0.9, 1.5, 0.08, lit ? winGlow : winGlowDim, x, 1.9, -6.22, root);
      const a = K.cyl(0.45, 0.45, 0.08, lit ? winGlow : winGlowDim, 12, x, 2.65, -6.22, root, 0); a.rotation.x = Math.PI / 2;
      K.box(0.06, 2.1, 0.12, M.iron, x, 2.0, -6.2, root); K.box(0.95, 0.06, 0.12, M.iron, x, 1.9, -6.2, root);
      K.box(1.1, 0.12, 0.25, M.stoneD, x, 1.1, -6.18, root);
      if (lit) windows.push(w);
    }
    const wallGears = [];
    for (const [x, r, y] of [[-5.2, 1.0, 1.9], [-3.9, 0.55, 2.8], [2.6, 0.9, 1.8], [3.7, 0.5, 2.7]]) {
      const gr = gear(K, root, r, 0.16, Math.round(r * 16), M.brass, x, y, -6.18); gr.rotation.x = Math.PI / 2; wallGears.push({ g: gr, s: 1 / r });
    }
    // pipework along the wall
    K.tube([[-15, 3.2, -6.0], [-9, 3.2, -6.0], [-8.5, 3.0, -5.6], [-8.5, 0.4, -5.6]], 0.14, M.copper, root, 30, 6);
    K.tube([[15, 2.9, -6.0], [14.2, 2.9, -6.0], [13.8, 2.6, -5.6], [13.8, 0.3, -5.6]], 0.14, M.copper, root, 30, 6);
    K.tube([[-15, 0.6, -6.0], [15, 0.6, -6.0]], 0.1, M.verd, root, 30, 6);
    for (const x of [-12, -6, 0, 6, 12]) { const v = K.torus(0.2, 0.04, M.red ? K.mat(0x8a2a1a) : M.brass, 6, 12, x, 0.6, -5.82, root); }
    for (const x of [-8.5, 13.8]) { const v = K.torus(0.28, 0.05, K.mat(0x9a2a18), 6, 14, x, 1.6, -5.35, root); v.rotation.x = Math.PI / 2; }

    // chimneys behind the wall
    const chimTops = [];
    for (const [x, z, h, r] of [[-11, -8.4, 5.6, 0.75], [-1.5, -8.2, 6.0, 0.9], [7, -8.6, 5.2, 0.7], [12.5, -8.0, 4.6, 0.55]]) {
      const bt = K.mat(0xffffff, { map: brickTex(K, [2, h / 1.2], true) });
      K.cyl(r, r * 1.2, h, bt, 10, x, h / 2, z, root);
      K.cyl(r * 1.18, r * 1.18, 0.3, M.soot, 10, x, h + 0.1, z, root);
      K.cyl(r * 1.25, r * 1.25, 0.1, M.brassD, 10, x, h - 0.6, z, root);
      chimTops.push([x, h + 0.3, z, r]);
    }
    // distant skyline + gasometer
    const sil = K.mat(0x2a1c18), silD = K.mat(0x22160f);
    for (let x = -18; x < 18;) {
      const w = 1.5 + K.rnd() * 2.5, h = 0.8 + K.rnd() * 2.6, z = -13 - K.rnd() * 4;
      K.box(w, h, 2, K.rnd() < 0.5 ? sil : silD, x + w / 2, h / 2, z, root);
      for (let i = 0; i < Math.floor(w / 0.7); i++) { const tr = K.box(0.7, 0.5, 2, sil, x + 0.35 + i * 0.7, h + 0.2, z, root); tr.rotation.z = 0.55; tr.scale.y = 0.8; }
      if (K.rnd() < 0.55) { const cx = x + w * K.rnd(); K.cyl(0.18, 0.22, 1.8, silD, 6, cx, h + 0.9, z, root); chimTops.push([cx, h + 1.8, z, 0.18, true]); }
      if (K.rnd() < 0.7) for (let i = 0; i < 3; i++) if (K.rnd() < 0.5) K.box(0.18, 0.22, 0.05, K.glow(0xd88a3a), x + 0.4 + K.rnd() * (w - 0.8), 0.4 + K.rnd() * (h - 0.6), z + 1.03, root);
      x += w + 0.2;
    }
    const gaso = K.group(root, 9.5, 0, -15);
    K.cyl(2.2, 2.2, 2.4, K.mat(0x3a2a20), 16, 0, 1.2, 0, gaso);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; K.box(0.12, 3.4, 0.12, silD, Math.cos(a) * 2.35, 1.7, Math.sin(a) * 2.35, gaso); }
    for (const y of [1.2, 2.4, 3.3]) K.torus(2.35, 0.05, silD, 4, 24, 0, y, 0, gaso).rotation.x = Math.PI / 2;

    // airship drifting in the sky
    const ship = K.group(root, -16, 4.3, -10.5);
    const env = K.sph(1, K.mat(0x8a6a48, { shine: 8 }), 0, 0, 0, ship, 16, 10); env.scale.set(2.4, 0.75, 0.75);
    for (let i = -2; i <= 2; i++) { const rib = K.torus(0.76 * Math.sqrt(1 - (i / 2.6) ** 2), 0.03, M.brassD, 4, 18, i * 0.85, 0, 0, ship); rib.rotation.y = Math.PI / 2; rib.scale.set(1, 1, 1); }
    K.box(4.6, 0.04, 0.05, M.brassD, 0, 0.0, 0.76, ship);
    for (const [y, z] of [[0.7, 0], [0, 0.7], [0, -0.7]]) { const f = K.box(0.8, y ? 0.6 : 0.05, z ? 0.6 : 0.05, M.leather, -2.3, y * 0.6, z * 0.6, ship); }
    const gond = K.group(ship, 0.2, -0.95, 0);
    K.box(1.4, 0.32, 0.4, M.wood, 0, 0, 0, gond); K.box(1.5, 0.06, 0.46, M.brass, 0, 0.17, 0, gond);
    for (let i = 0; i < 4; i++) K.box(0.14, 0.1, 0.02, M.gas, -0.5 + i * 0.32, 0.02, 0.21, gond);
    for (const x of [-0.5, 0.5]) { K.box(0.03, 0.55, 0.03, M.iron, x, 0.42, 0.15, gond); K.box(0.03, 0.55, 0.03, M.iron, x, 0.42, -0.15, gond); }
    const prop = K.group(ship, -2.75, -0.1, 0);
    K.box(0.04, 0.9, 0.1, M.woodD, 0, 0, 0, prop);

    // gas lamps (warm point lights), barrels, crates, steam vents
    const lamps = [lamp(K, root, -4.4, 6.4, 2.6, true), lamp(K, root, 3.6, 6.4, 2.6, true), lamp(K, root, -12.4, 2.6, 2.6, true), lamp(K, root, 12.4, 2.6, 2.6, true)];
    function barrel(x, z, m) { const b = K.group(root, x, 0, z); K.cyl(0.32, 0.3, 0.8, m || M.wood, 10, 0, 0.4, 0, b); band(K, b, 0.33, 0.15, M.iron, 0.06); band(K, b, 0.33, 0.65, M.iron, 0.06); return b; }
    function crate(x, z, s, ry) { const c = K.box(s, s, s, M.woodD, x, s / 2, z, root); c.rotation.y = ry || 0; K.box(s * 1.02, 0.07, s * 1.02, M.wood, x, s - 0.04, z, root).rotation.y = ry || 0; return c; }
    barrel(-13.2, 0.6); barrel(-12.6, 1.2, M.copperD); barrel(-13.3, 1.5); barrel(13.3, -1.2, M.verdD); barrel(12.8, -0.6);
    crate(-12.9, -2.5, 0.9, 0.2); crate(-12.6, -1.5, 0.6, -0.3); crate(12.9, 1.5, 0.8, 0.4); crate(-12.2, -4.6, 0.7, 0.1); crate(-10.4, -5.0, 0.8, -0.2); crate(-11.2, -5.4, 0.55, 0.5);
    // coal pile and shovel
    for (let i = 0; i < 26; i++) K.rock(0.16 + K.rnd() * 0.2, M.soot, 13.0 + K.rnd() * 1.6, 0.1 + K.rnd() * 0.3, -2.4 - K.rnd() * 2.0, root);
    const vents = [[-3.1, -1.5], [4.2, 1.6], [-12, 4.0], [11.6, 3.6]];
    for (const [x, z] of vents) { K.box(0.7, 0.06, 0.7, M.ironM, x, 0.11, z, root); for (let i = 0; i < 4; i++) K.box(0.6, 0.07, 0.05, M.soot, x, 0.13, z - 0.24 + i * 0.16, root); }
    const line = factoryLine(K, root);

    let tCh = 0, tV = 0, tShip = 0;
    const furnFlick = (t) => furn.forEach((f, i) => f.material.color.setRGB(1, 0.36 + Math.sin(t * 5 + i * 1.7) * 0.06 + Math.sin(t * 11 + i) * 0.04, 0.1));
    return { update(t, dt) {
      furnFlick(t);
      line.update(t, dt);
      ship.position.x = -16 + ((t * 0.35) % 34); ship.position.y = 4.3 + Math.sin(t * 0.6) * 0.12; prop.rotation.x += dt * 14;
      wallGears.forEach((w, i) => (w.g.rotation.y += dt * 0.6 * w.s * (i % 2 ? -1 : 1)));
      const fl = 0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.06;
      lamps.forEach((l, i) => { if (l.L && !l.L.isDummy) l.L.intensity = 1.4 * (fl + Math.sin(t * 9 + i) * 0.04); });
      tCh -= dt;
      if (tCh <= 0) { tCh = 0.12; chimTops.forEach(([x, y, z, r, far]) => { if (far && Math.random() < 0.5) return; K.spawn(root, x + K.R() * r, y, z + K.R() * r, 0.35 + K.R() * 0.2, 0.7 + Math.random() * 0.3, K.R() * 0.2, Math.random() < 0.5 ? 0x2c241f : 0x3e342c, far ? 3 : 4.2, far ? 0.22 : 0.42, -0.08); }); }
      tV -= dt;
      if (tV <= 0) { tV = 0.25; const v = vents[Math.floor(Math.random() * vents.length)]; for (let i = 0; i < 3; i++) puff(K, root, v[0], 0.2, v[1], 0x9a8e7c, 0.18, 0.9, 0.4, 1.6); }
    } };
  }

  // =====================================================================
  // ASSEMBLER: clockwork workshop
  // =====================================================================
  function buildAssembler(K) {
    mats(K);
    const g = K.group();
    // plinth
    K.box(4.9, 0.3, 4.9, M.ironM, 0, 0.15, 0, g);
    K.box(5.0, 0.08, 5.0, M.brassD, 0, 0.32, 0, g);
    for (let i = 0; i < 9; i++) { K.box(0.08, 0.08, 0.08, M.brassL, -2.3 + i * 0.575, 0.2, 2.47, g); K.box(0.08, 0.08, 0.08, M.brassL, 2.47, 0.2, -2.3 + i * 0.575, g); }
    const floor = K.box(4.6, 0.04, 4.6, K.mat(0x3a2c22), 0, 0.37, 0, g);
    for (let i = 0; i < 6; i++) K.box(4.6, 0.02, 0.04, M.soot, 0, 0.395, -2.1 + i * 0.84, g);

    // difference engine under a glass dome (back left)
    const de = K.group(g, -1.1, 0.39, -1.1);
    K.cyl(1.25, 1.35, 0.5, M.iron, 16, 0, 0.25, 0, de);
    band(K, de, 1.3, 0.5, M.brass, 0.1);
    rivetRing(K, de, 1.33, 0.3, 16);
    const stacks = [];
    for (let s = 0; s < 4; s++) {
      const a = s / 4 * Math.PI * 2 + 0.4, sx = Math.cos(a) * 0.55, sz = Math.sin(a) * 0.55;
      K.cyl(0.04, 0.04, 2.3, M.ironL, 6, sx, 1.65, sz, de);
      const col = K.group(de, sx, 0, sz); const gs = [];
      for (let i = 0; i < 6; i++) { const r = 0.3 + ((i + s) % 3) * 0.06; gs.push(gear(K, col, r, 0.08, 10 + ((i + s) % 3) * 2, i % 2 ? M.brass : M.brassL, 0, 0.75 + i * 0.32, 0)); }
      stacks.push({ col, gs, dir: s % 2 ? 1 : -1 });
    }
    K.cyl(0.12, 0.12, 2.4, M.copper, 8, 0, 1.7, 0, de);
    const dome = K.lathe([[1.15, 0], [1.15, 1.6], [1.05, 2.1], [0.8, 2.5], [0.45, 2.75], [0.05, 2.85]], M.glass, 18, 0, 0.5, 0, de);
    dome.castShadow = false;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const rb = K.tube([[Math.cos(a) * 1.17, 0.5, Math.sin(a) * 1.17], [Math.cos(a) * 1.17, 2.1, Math.sin(a) * 1.17], [Math.cos(a) * 0.82, 3.0, Math.sin(a) * 0.82], [Math.cos(a) * 0.08, 3.35, Math.sin(a) * 0.08]], 0.035, M.brass, de, 14, 4); }
    band(K, de, 1.17, 2.1, M.brassD, 0.06);
    K.cyl(0.2, 0.3, 0.25, M.brass, 10, 0, 3.4, 0, de);
    K.cone(0.08, 0.6, M.brassL, 6, 0, 3.8, 0, de);
    const deGlow = K.sph(0.18, K.glow(0xffb45a), 0, 3.6, 0, de, 8, 6);

    // copper boiler with gauges (back right)
    const bo = K.group(g, 1.35, 0.39, -1.35);
    K.cyl(0.75, 0.8, 2.5, M.copper, 14, 0, 1.25, 0, bo);
    for (const y of [0.25, 0.9, 1.6, 2.3]) { band(K, bo, 0.8, y, M.brassD, 0.1); rivetRing(K, bo, 0.81, y + 0.08, 12, M.brassL); }
    K.lathe([[0.76, 0], [0.7, 0.25], [0.45, 0.45], [0.12, 0.55]], M.copperD, 14, 0, 2.5, 0, bo);
    K.cyl(0.12, 0.12, 1.1, M.soot, 8, 0, 3.2, 0, bo);
    K.cyl(0.18, 0.12, 0.2, M.brassD, 8, 0, 3.75, 0, bo);
    const fire = K.box(0.5, 0.42, 0.06, M.ember, 0.0, 0.45, 0.79, bo);
    K.box(0.6, 0.52, 0.04, M.iron, 0.0, 0.45, 0.76, bo);
    for (let i = 0; i < 4; i++) K.box(0.04, 0.42, 0.08, M.soot, -0.18 + i * 0.12, 0.45, 0.81, bo);
    const fireL = K.light(0xff7a30, 1.6, 5, 0.3, 0.6, 1.2, bo);
    const needles = [gauge(K, bo, -0.32, 1.85, 0.74, 0.2, 0.25), gauge(K, bo, 0.32, 1.85, 0.74, 0.2, -0.05), gauge(K, bo, 0.0, 1.3, 0.8, 0.16, 0.1)];
    const gx = gauge(K, bo, 0.8, 1.6, 0.05, 0.18, Math.PI / 2); needles.push(gx);
    // safety valve + whistle
    K.cyl(0.07, 0.07, 0.4, M.brass, 8, 0.4, 2.9, 0.3, bo);
    const whistle = K.cyl(0.1, 0.06, 0.3, M.brassL, 8, 0.4, 3.2, 0.3, bo);
    // red alarm lamp
    const alarm = K.sph(0.13, K.mat(0x401010, { e: 0x000000 }), -0.4, 2.92, 0.4, bo, 8, 6);
    K.cyl(0.1, 0.13, 0.08, M.brassD, 8, -0.4, 2.8, 0.4, bo);
    // pipe boiler -> engine
    K.tube([[0.75, 1.9, -1.35], [0.2, 2.3, -1.6], [-0.6, 2.4, -1.6], [-1.1, 2.2, -1.5]], 0.07, M.copper, g, 20, 6);
    K.tube([[0.9, 0.9, -0.6], [0.3, 0.6, -0.1], [-0.2, 0.55, -0.1]], 0.06, M.verd, g, 16, 5);

    // workbench + articulated brass arm (front right)
    const bench = K.group(g, 1.2, 0.39, 1.0);
    K.box(2.2, 0.14, 1.2, M.wood, 0, 0.95, 0, bench);
    K.box(2.25, 0.05, 1.25, M.brassD, 0, 1.03, 0, bench);
    for (const sx of [-0.95, 0.95]) for (const sz of [-0.45, 0.45]) K.box(0.12, 0.9, 0.12, M.iron, sx, 0.45, sz, bench);
    K.box(1.9, 0.08, 0.9, M.woodD, 0, 0.3, 0, bench);
    // tools hanging and a vise
    K.box(0.3, 0.2, 0.25, M.ironL, 0.75, 1.15, -0.3, bench);
    const pr = K.group(bench, -0.15, 1.04, 0.05); // the PR chest under construction
    K.box(0.7, 0.36, 0.48, M.woodD, 0, 0.18, 0, pr);
    for (const x of [-0.3, 0.3]) K.box(0.06, 0.38, 0.5, M.brass, x, 0.19, 0, pr);
    const lid = K.group(pr, 0, 0.36, -0.24); K.box(0.72, 0.08, 0.5, M.wood, 0, 0.04, 0.24, lid); K.box(0.74, 0.04, 0.06, M.brass, 0, 0.08, 0.48, lid);
    const prGlow = K.box(0.6, 0.04, 0.38, K.glow(0x7af0d8), 0, 0.37, 0, pr);
    // arm on a turret
    const armBase = K.group(g, 0.25, 0.39, 0.55);
    K.cyl(0.38, 0.45, 0.35, M.iron, 12, 0, 0.17, 0, armBase); band(K, armBase, 0.42, 0.34, M.brass, 0.06);
    const yawG = K.group(armBase, 0, 0.4, 0);
    K.cyl(0.3, 0.3, 0.2, M.brass, 12, 0, 0.1, 0, yawG);
    const sh = K.group(yawG, 0, 0.3, 0);
    gear(K, sh, 0.2, 0.1, 10, M.brassL, 0.15, 0, 0).rotation.z = Math.PI / 2;
    K.sph(0.15, M.brassD, 0, 0, 0, sh, 8, 6);
    K.box(0.14, 1.1, 0.14, M.brass, 0, 0.55, 0, sh);
    K.box(0.05, 1.0, 0.05, M.copper, 0.12, 0.55, 0.05, sh);
    const piston = K.cyl(0.045, 0.045, 0.6, M.ironL, 6, -0.12, 0.4, 0, sh);
    const el = K.group(sh, 0, 1.1, 0);
    K.sph(0.13, M.brassD, 0, 0, 0, el, 8, 6);
    K.box(0.11, 0.85, 0.11, M.brass, 0, 0.42, 0, el);
    const wr = K.group(el, 0, 0.85, 0);
    K.cyl(0.08, 0.08, 0.14, M.brassD, 8, 0, 0, 0, wr);
    K.box(0.22, 0.08, 0.14, M.iron, 0, -0.1, 0, wr);
    const torch = K.cone(0.06, 0.22, M.copper, 6, 0, -0.25, 0, wr); torch.rotation.x = Math.PI;
    const tip = K.group(wr, 0, -0.38, 0);
    const spark = K.sph(0.07, K.glow(0xfff2c0), 0, 0, 0, tip, 6, 4);

    // punch card reader (front left) with a card ribbon spilling into a tray
    const pc = K.group(g, -1.3, 0.39, 1.4);
    K.box(1.3, 0.8, 0.8, M.ironM, 0, 0.4, 0, pc);
    K.box(1.35, 0.08, 0.85, M.brass, 0, 0.82, 0, pc);
    const rollers = [];
    for (const x of [-0.35, 0.35]) { const r = K.cyl(0.12, 0.12, 0.7, M.brassL, 10, x, 1.0, 0, pc); r.rotation.x = Math.PI / 2; rollers.push(r); }
    const cards = [];
    for (let i = 0; i < 9; i++) { const c = K.box(0.5, 0.025, 0.55, M.cream, 0, 0, 0, pc); cards.push(c); for (let h = 0; h < 3; h++) K.box(0.06, 0.03, 0.06, M.soot, -0.15 + h * 0.15, 0.003, -0.1 + (h % 2) * 0.2, c); }
    K.box(0.9, 0.12, 0.7, M.woodD, 0.25, 0.06, 0.55, pc);
    const ticker = []; for (let i = 0; i < 4; i++) ticker.push(K.box(0.12, 0.12, 0.03, K.mat(0x2a1a10, { e: 0 }), -0.42 + i * 0.16, 0.55, 0.41, pc));
    // stack of crates of finished work
    for (let i = 0; i < 3; i++) { const c = K.box(0.45, 0.4, 0.45, i === 1 ? M.wood : M.woodD, -2.0 + (i % 2) * 0.1, 0.59 + i * 0.4, -0.15 + (i % 2) * 0.06, g); c.rotation.y = i * 0.3; }

    const ARM = [
      [0, 0.6, 0.5, 1.2], [0.2, 0.2, 0.9, 1.0], [0.35, 0.0, 1.05, 0.9], [0.55, -0.2, 1.0, 1.0], [0.75, 0.35, 0.95, 1.1], [1, 0.6, 0.5, 1.2]
    ];
    let k = 0, tS = 0, tCard = 0, cardOff = 0, tTick = 0;
    return { g, update(t, dt, s) {
      const work = s === 'WORKING', blk = s === 'BLOCKED';
      const speed = work ? 2.4 : blk ? 0 : 0.35;
      stacks.forEach((st, i) => { st.col.children.forEach((gg, j) => (gg.rotation.y += dt * speed * st.dir * (j % 2 ? 1.3 : -1))); if (blk) st.col.rotation.y = Math.sin(t * 40 + i) * 0.02; });
      deGlow.material.color.setHex(blk ? (Math.sin(t * 10) > 0 ? 0xff4020 : 0x401008) : work ? 0xffd27a : 0x8a5a2a);
      // gauges
      needles.forEach((n, i) => { const base = work ? 0.2 + Math.sin(t * 2.3 + i) * 0.35 : blk ? -1.15 + Math.sin(t * 30 + i) * 0.06 : 0.9 + Math.sin(t * 0.7 + i) * 0.05; n.rotation.z = base; });
      // fire
      const ff = (work ? 1 : blk ? 1.4 : 0.5) * (0.85 + Math.sin(t * 17) * 0.1 + Math.sin(t * 6.1) * 0.1);
      fire.material.color.setHex(blk ? 0xff5020 : work ? 0xffa040 : 0xb05020);
      if (!fireL.isDummy) fireL.intensity = 1.5 * ff;
      alarm.material.emissive.setHex(blk && Math.sin(t * 9) > 0 ? 0xff2a10 : 0);
      // arm
      let pose;
      if (work) { k = (k + dt * 0.35) % 1; pose = K.keyframes(ARM, k); }
      else if (blk) pose = [0.5 + Math.sin(t * 30) * 0.02, 0.2, 1.6, 1.4];
      else pose = [0.6 + Math.sin(t * 0.5) * 0.15, 0.1, 0.6, 1.3];
      yawG.rotation.y = pose[0]; sh.rotation.z = -pose[1] - 0.15; el.rotation.z = -pose[2]; wr.rotation.z = Math.PI - pose[3] * 0.5 + (pose[1] + pose[2]) * 0.0;
      sh.rotation.x = 0;
      spark.visible = work && k > 0.25 && k < 0.6 && Math.sin(t * 50) > -0.3;
      lid.rotation.x = work ? -0.9 - Math.sin(t * 0.8) * 0.2 : blk ? -0.2 : 0;
      prGlow.visible = work;
      tS -= dt;
      if (work && spark.visible && tS <= 0) {
        tS = 0.03; tip.getWorldPosition(K.v3); g.worldToLocal(K.v3);
        K.spawn(g, K.v3.x, K.v3.y, K.v3.z, K.R() * 2.4, 0.6 + Math.random() * 1.6, K.R() * 2.4, Math.random() < 0.5 ? 0xffd25a : 0xfff4d0, 0.45, 0.06, 6, true);
      }
      // steam: whistle when working, hard venting when blocked, lazy chimney
      if (Math.random() < (blk ? 0.9 : work ? 0.35 : 0.1)) {
        K.spawn(g, 1.75 + K.R() * 0.1, 3.75, -0.95, K.R() * 0.4 + (blk ? 0.6 : 0.1), blk ? 2.4 : 1.2, K.R() * 0.4 + (blk ? 0.6 : 0), 0xa89c88, blk ? 1.6 : 1.4, blk ? 0.2 : 0.14, -0.15);
        K.spawn(g, 1.35, 4.0, -1.35, K.R() * 0.2 + 0.2, 0.8, K.R() * 0.2, 0x3a302a, 2.4, 0.22, -0.1);
      }
      // cards feed through the rollers and fold into the tray
      rollers.forEach((r) => (r.rotation.y += dt * (work ? 6 : 0)));
      if (work) cardOff = (cardOff + dt * 0.6) % 1;
      cards.forEach((c, i) => {
        const p = (i / cards.length + cardOff) % 1;
        if (p < 0.4) { c.position.set(-0.4 + p * 2.0, 1.12, 0); c.rotation.set(0, 0, 0); }
        else { const q = (p - 0.4) / 0.6; c.position.set(0.45 + q * 0.15, 1.1 - q * 0.95, 0.35 + q * 0.2); c.rotation.set(0, 0, (Math.floor(i) % 2 ? 1 : -1) * 0.5 * (1 - q)); }
      });
      tTick -= dt; if (tTick <= 0) { tTick = work ? 0.12 : 0.6; ticker.forEach((m) => m.material.emissive.setHex(blk ? (Math.sin(t * 9) > 0 ? 0xc02010 : 0) : Math.random() < 0.5 ? (work ? 0xffa84a : 0x5a3a1a) : 0)); }
    } };
  }

  // =====================================================================
  // SPLITTER (Spark): aetheric sorting engine with an orrery brain
  // =====================================================================
  function buildSplitter(K) {
    mats(K);
    const g = K.group();
    // octagonal stone dais in steps
    K.cyl(2.5, 2.6, 0.3, K.mat(0xffffff, { map: stoneTex(K, [4, 0.3]) }), 8, 0, 0.15, 0, g);
    K.cyl(2.15, 2.25, 0.25, M.ironM, 8, 0, 0.42, 0, g);
    K.cyl(2.2, 2.2, 0.06, M.brassD, 8, 0, 0.56, 0, g); K.cyl(1.9, 1.9, 0.05, M.soot, 8, 0, 0.6, 0, g);
    rivetRing(K, g, 2.2, 0.5, 16);
    // four iron columns with brass capitals
    const colR = 1.35;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * colR, z = Math.sin(a) * colR;
      K.cyl(0.16, 0.2, 4.2, M.iron, 8, x, 2.65, z, g);
      for (const y of [0.9, 2.4, 3.9]) K.cyl(0.24, 0.24, 0.12, M.brass, 8, x, y, z, g);
      K.cyl(0.3, 0.2, 0.25, M.brassD, 8, x, 4.8, z, g);
    }
    // crown ring + dome
    K.torus(1.45, 0.12, M.brass, 6, 24, 0, 4.95, 0, g).rotation.x = Math.PI / 2;
    K.torus(1.45, 0.06, M.brassD, 4, 24, 0, 0.75, 0, g).rotation.x = Math.PI / 2;
    K.lathe([[1.5, 0], [1.35, 0.35], [1.0, 0.75], [0.55, 1.0], [0.15, 1.1]], K.mat(C.verd, { shine: 20, spec: 0x2a4a40, double: true }), 8, 0, 5.0, 0, g);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.tube([[Math.cos(a) * 1.5, 5.0, Math.sin(a) * 1.5], [Math.cos(a) * 1.1, 5.7, Math.sin(a) * 1.1], [Math.cos(a) * 0.15, 6.1, Math.sin(a) * 0.15]], 0.03, M.brass, g, 10, 4); }
    K.cyl(0.08, 0.1, 0.9, M.brass, 6, 0, 6.5, 0, g);
    const rodTip = K.sph(0.12, K.glow(0xbffff0), 0, 7.0, 0, g, 8, 6);
    for (const y of [6.2, 6.45, 6.7]) K.torus(0.16, 0.03, M.copper, 4, 10, 0, y, 0, g).rotation.x = Math.PI / 2;

    // the brain: a glowing aether core inside a spinning orrery
    const brain = K.group(g, 0, 2.85, 0);
    const core = K.sph(0.5, K.glow(C.teal), 0, 0, 0, brain, 14, 10);
    const halo = K.sph(0.7, K.glow(0x3ac0a0, 0.25, true), 0, 0, 0, brain, 14, 10);
    const coreL = K.light(0x6af0d0, 1.0, 4.5, 0, 0, 0, brain);
    const rings = [];
    [[0.95, 0.4, 0.3, 0xd9ac55], [1.12, -0.6, 1.1, 0xb08030], [0.8, 1.3, -0.5, 0xa0532c]].forEach(([r, rx, rz, c], i) => {
      const piv = K.group(brain); piv.rotation.set(rx, 0, rz);
      const ring = K.group(piv);
      K.torus(r, 0.035, K.mat(c, { shine: 40, spec: 0x806030 }), 4, 30, 0, 0, 0, ring).rotation.x = Math.PI / 2;
      K.sph(0.11 - i * 0.015, K.mat([0xc05a2a, 0x5a7ab0, 0xc89a3a][i], { shine: 30, spec: 0x806040, e: [0x301008, 0x0c1428, 0x2a2008][i] }), r, 0, 0, ring, 8, 6);
      K.sph(0.05, M.brassL, -r, 0, 0, ring, 6, 4);
      rings.push({ ring, sp: [0.9, -1.3, 1.7][i] });
    });
    // sorting carousel: a ring of brass buckets
    const car = K.group(g, 0, 1.5, 0);
    K.torus(1.0, 0.05, M.brassD, 4, 28, 0, 0, 0, car).rotation.x = Math.PI / 2;
    const buckets = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const b = K.group(car, Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0); K.cyl(0.16, 0.12, 0.22, M.copper, 8, 0, -0.1, 0, b); const ld = K.sph(0.09, K.mat(0x202020), 0, 0.02, 0, b, 6, 4); buckets.push(ld); }
    K.cyl(0.1, 0.1, 1.3, M.ironL, 6, 0, 1.4, 0, g);

    // hopper at the back where raw ore arrives
    const hop = K.group(g, -0.8, 0, -1.9);
    K.lathe([[0.15, 0], [0.7, 0.7], [0.75, 0.9]], M.copperD, 8, 0, 3.6, 0, hop);
    K.cyl(0.12, 0.12, 1.0, M.copper, 8, 0, 3.1, 0, hop);
    for (const sx of [-0.5, 0.5]) K.box(0.08, 3.6, 0.08, M.iron, sx, 1.8, 0, hop);
    K.tube([[-0.8, 2.6, -1.9], [-0.5, 2.6, -1.1], [-0.3, 2.85, -0.5]], 0.09, M.copper, g, 12, 6);

    // three pneumatic glass tubes from the core out to three chutes
    const ORE = [0xc05a2a, 0x5a7ab0, 0xd09a3a];
    const outs = [[2.05, 0.6, 0.6], [0.6, 0.6, 2.05], [1.65, 0.6, 1.65]];
    const curves = [], caps = [], outLamps = [];
    outs.forEach(([x, y, z], i) => {
      const pts = [[0, 2.85, 0], [x * 0.35, 3.6 - i * 0.2, z * 0.35], [x * 0.75, 2.9, z * 0.75], [x * 0.95, 1.6, z * 0.95], [x, 1.0, z]];
      const curve = new K.THREE.CatmullRomCurve3(pts.map((p) => new K.THREE.Vector3(p[0], p[1], p[2])));
      curves.push(curve);
      const gl = K.tube(pts, 0.13, M.glass, g, 30, 8); gl.castShadow = false;
      for (const u of [0.25, 0.5, 0.75]) { const p = curve.getPoint(u); const r = K.torus(0.15, 0.035, M.brass, 4, 10, p.x, p.y, p.z, g); const tn = curve.getTangent(u); r.lookAt(p.x + tn.x, p.y + tn.y, p.z + tn.z); }
      // chute + bin
      const ch = K.group(g, x, 0, z); ch.rotation.y = Math.atan2(x, z);
      K.box(0.55, 0.55, 0.55, M.ironM, 0, 0.85, 0, ch);
      K.box(0.6, 0.06, 0.6, M.brass, 0, 1.13, 0, ch);
      K.box(0.42, 0.08, 0.6, M.brassD, 0, 0.62, 0.45, ch).rotation.x = 0.4;
      const bin = K.group(ch, 0, 0, 0.95); K.box(0.7, 0.36, 0.5, M.woodD, 0, 0.18, 0, bin); for (const bx of [-0.33, 0.33]) K.box(0.04, 0.38, 0.52, M.iron, bx, 0.19, 0, bin);
      for (let k = 0; k < 3; k++) K.rock(0.09, K.mat(ORE[i], { e: ORE[i] & 0x3f3f3f }), -0.18 + k * 0.18, 0.37, K.R() * 0.2, bin);
      const lp = K.sph(0.09, K.mat(0x1a1a1a, { e: 0 }), 0, 1.3, 0, ch, 8, 6); outLamps.push(lp);
      K.cyl(0.07, 0.09, 0.06, M.brassD, 8, 0, 1.2, 0, ch);
      for (let c = 0; c < 2; c++) { const cp = K.cyl(0.07, 0.07, 0.2, K.mat(ORE[i], { e: ORE[i] }), 8, 0, 0, 0, g); cp.rotation.x = Math.PI / 2; caps.push({ m: cp, tube: i, u: c * 0.5 }); }
    });
    // control lectern with a brass lever and dials
    const lec = K.group(g, 2.0, 0.56, -1.0); lec.rotation.y = -0.5;
    K.box(0.6, 0.9, 0.4, M.wood, 0, 0.45, 0, lec);
    const lt = K.box(0.7, 0.08, 0.5, M.brassD, 0, 0.95, 0.03, lec); lt.rotation.x = 0.35;
    const lever = K.group(lec, 0.15, 1.0, 0.05); K.box(0.05, 0.45, 0.05, M.ironL, 0, 0.22, 0, lever); K.sph(0.07, K.mat(0x8a1a10), 0, 0.46, 0, lever, 6, 4);
    const lecN = gauge(K, lec, -0.15, 1.02, 0.12, 0.12, 0); lecN.parent.rotation.x = -1.2;

    let tArc = 0, tOre = 0;
    return { g, update(t, dt, s) {
      const on = s === 'SORTING';
      const sp = on ? 1 : 0.18;
      rings.forEach((r) => (r.ring.rotation.y += dt * r.sp * sp * 1.6));
      brain.rotation.y += dt * 0.2 * sp;
      const pulse = on ? 0.85 + Math.sin(t * 6) * 0.15 : 0.45 + Math.sin(t * 1.2) * 0.05;
      core.scale.setScalar(pulse); halo.scale.setScalar(pulse * (1.1 + Math.sin(t * 9) * 0.05));
      core.material.color.setHex(on ? C.teal : 0x2a7a6a);
      if (!coreL.isDummy) coreL.intensity = on ? 1.0 + Math.sin(t * 13) * 0.2 : 0.35;
      rodTip.material.color.setHex(on && Math.sin(t * 23) > 0.2 ? 0xffffff : 0x4a8a7a);
      car.rotation.y += dt * (on ? 1.4 : 0.15);
      buckets.forEach((b, i) => b.material.color.setHex(on ? ORE[i % 3] : 0x202020));
      caps.forEach((c) => {
        c.m.visible = on;
        if (!on) return;
        c.u += Math.max(0, dt) * 0.45;
        c.u = ((c.u % 1) + 1) % 1; const p = curves[c.tube].getPoint(c.u); c.m.position.copy(p);
        const tn = curves[c.tube].getTangent(c.u); c.m.lookAt(p.x + tn.x, p.y + tn.y, p.z + tn.z);
      });
      outLamps.forEach((l, i) => l.material.emissive.setHex(on && Math.sin(t * 4 + i * 2.1) > 0 ? ORE[i] : 0));
      lever.rotation.z = on ? -0.6 : 0.4;
      lecN.rotation.z = on ? Math.sin(t * 3) * 0.6 : 0.9;
      tArc -= dt;
      if (on && tArc <= 0) {
        tArc = 0.05;
        const a = Math.random() * Math.PI * 2, rr = 0.6 + Math.random() * 0.5;
        K.spawn(g, Math.cos(a) * rr, 2.85 + K.R() * 0.8, Math.sin(a) * rr, Math.cos(a) * 1.2, K.R(), Math.sin(a) * 1.2, Math.random() < 0.6 ? 0xbffff0 : 0x6af0d0, 0.3, 0.05, 0, true);
        if (Math.random() < 0.3) K.spawn(g, K.R() * 0.2, 7.0, K.R() * 0.2, K.R() * 2, Math.random() * 1.5, K.R() * 2, 0xffffff, 0.25, 0.05, 0, true);
      }
      tOre -= dt;
      if (on && tOre <= 0) { tOre = 0.5; const c = ORE[Math.floor(Math.random() * 3)]; K.spawn(g, -0.8 + K.R() * 0.3, 4.7, -1.9 + K.R() * 0.3, 0, -1.5, 0, c, 0.8, 0.14, 2); }
      if (Math.random() < (on ? 0.15 : 0.04)) K.spawn(g, K.R() * 0.4, 6.15, K.R() * 0.4, K.R() * 0.3 + 0.2, 0.7, K.R() * 0.3, 0x9a8e7c, 2.0, 0.14, -0.12);
    } };
  }

  // =====================================================================
  // LAUNCH PAD: brass rocket in a riveted gantry
  // =====================================================================
  function buildLaunch(K) {
    mats(K);
    const g = K.group();
    // octagonal iron pad with a flame trench
    K.cyl(2.55, 2.65, 0.35, K.mat(0xffffff, { map: stoneTex(K, [4, 0.3]) }), 8, 0, 0.17, 0, g);
    K.cyl(2.3, 2.3, 0.12, M.ironM, 8, 0, 0.41, 0, g);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.box(0.32, 0.05, 0.12, i % 2 ? M.soot : K.mat(0xc89a3a), Math.cos(a) * 2.25, 0.48, Math.sin(a) * 2.25, g).rotation.y = -a; }
    K.box(4.8, 0.06, 0.8, M.soot, 0, 0.475, 0, g).rotation.y = Math.PI / 4;
    for (let i = 0; i < 6; i++) { const gr = K.box(0.06, 0.07, 0.8, M.ironL, -1.2 + i * 0.5, 0.5, 0, g); gr.position.set(Math.cos(Math.PI / 4) * (-1.25 + i * 0.5), 0.5, -Math.sin(Math.PI / 4) * (-1.25 + i * 0.5)); gr.rotation.y = Math.PI / 4; }
    const pedestal = K.cyl(0.85, 0.95, 0.35, M.iron, 12, 0.2, 0.62, 0.2, g); band(K, pedestal, 0.9, 0.1, M.brass, 0.06);

    // gantry tower, back left
    const gt = K.group(g, -1.55, 0.47, -1.55);
    const H = 6.4;
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) K.box(0.13, H, 0.13, K.mat(0x3e1a12, { shine: 14, spec: 0x221410 }), sx, H / 2, sz, gt);
    for (let y = 0.7; y < H; y += 0.8) {
      for (const [x, z, ry] of [[0, 0.45, 0], [0, -0.45, 0], [0.45, 0, Math.PI / 2], [-0.45, 0, Math.PI / 2]]) {
        const br = K.box(0.06, 1.1, 0.06, K.mat(0x34160f), x, y + 0.0, z, gt); br.rotation.set(0, ry, 0.73 * ((y * 10) % 2 > 1 ? 1 : -1));
        K.box(0.9, 0.07, 0.07, K.mat(0x34160f), x, y - 0.4, z, gt).rotation.y = ry;
      }
    }
    K.box(1.2, 0.1, 1.2, M.ironM, 0, H, 0, gt);
    for (const sx of [-0.55, 0.55]) K.box(0.05, 0.4, 1.2, M.iron, sx, H + 0.2, 0, gt);
    const crane = K.group(gt, 0, H + 0.1, 0); K.box(1.8, 0.1, 0.1, M.ironL, 0.7, 0.5, 0, crane); K.box(0.06, 0.6, 0.06, M.ironL, 0, 0.3, 0, crane);
    const beacon = K.sph(0.12, K.mat(0x401010), 0, H + 0.62, 0, gt, 8, 6);
    // lift cage
    const cage = K.group(gt, 0, 1, 0); K.box(0.7, 0.6, 0.7, K.mat(0x3a2a1c, { op: 0.0 }), 0, 0.3, 0, cage);
    for (const sx of [-0.33, 0.33]) for (const sz of [-0.33, 0.33]) K.box(0.04, 0.6, 0.04, M.brass, sx, 0.3, sz, cage);
    K.box(0.7, 0.05, 0.7, M.brass, 0, 0.6, 0, cage); K.box(0.7, 0.05, 0.7, M.brassD, 0, 0, 0, cage);
    // service arm that swings away at launch
    const armP = K.group(gt, 0.45, 3.9, 0.45);
    const sarm = K.group(armP); K.box(1.55, 0.14, 0.18, M.ironL, 0.75, 0, 0, sarm); K.box(1.5, 0.05, 0.05, M.brass, 0.75, 0.1, 0.05, sarm);
    K.tube([[0, -0.1, 0], [0.8, -0.3, 0], [1.5, -0.15, 0]], 0.05, M.leather, sarm, 10, 5);
    armP.rotation.y = -Math.PI / 4;

    // horizontal boiler tank on saddles, right side
    const tank = K.group(g, -2.0, 0.47, 0.6); tank.rotation.y = -Math.PI / 4;
    for (const x of [-0.55, 0.55]) K.box(0.18, 0.4, 0.9, M.iron, x, 0.2, 0, tank);
    const tb = K.cyl(0.42, 0.42, 1.7, M.copper, 14, 0, 0.75, 0, tank); tb.rotation.z = Math.PI / 2;
    for (const x of [-0.85, 0.85]) { const cap = K.sph(0.42, M.copperD, x, 0.75, 0, tank, 12, 8); cap.scale.x = 0.35; }
    for (const x of [-0.5, 0, 0.5]) { const b = K.cyl(0.44, 0.44, 0.07, M.brassD, 14, x, 0.75, 0, tank); b.rotation.z = Math.PI / 2; }
    const tankN = gauge(K, tank, 0.0, 1.25, 0.25, 0.15, 0); tankN.parent.rotation.x = -0.4;
    K.tube([[-1.7, 1.0, 0.5], [-1.0, 0.9, 0.4], [-0.4, 0.9, 0.25]], 0.07, M.copper, g, 14, 6);

    // countdown clock tower, front right
    const ck = K.group(g, 1.75, 0.47, -1.05); ck.rotation.y = Math.PI / 4;
    K.box(0.5, 1.9, 0.5, M.woodD, 0, 0.95, 0, ck);
    K.box(0.6, 0.12, 0.6, M.brassD, 0, 1.95, 0, ck);
    const face = K.cyl(0.42, 0.42, 0.08, M.cream, 16, 0, 2.4, 0.18, ck); face.rotation.x = Math.PI / 2;
    const rim = K.torus(0.43, 0.06, M.brass, 6, 18, 0, 2.4, 0.22, ck);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.04, i % 3 ? 0.06 : 0.1, 0.02, M.soot, Math.sin(a) * 0.33, 2.4 + Math.cos(a) * 0.33, 0.23, ck).rotation.z = -a; }
    const hand = K.group(ck, 0, 2.4, 0.25); K.box(0.04, 0.32, 0.02, K.mat(0x8a1a10), 0, 0.15, 0, hand);
    K.cone(0.18, 0.3, M.brassD, 6, 0, 2.95, 0, ck);
    const bell = K.cone(0.14, 0.18, M.brassL, 8, 0, 3.2, 0, ck);
    const ckLamp = K.sph(0.1, K.mat(0x2a1a10), 0, 1.6, 0.27, ck, 8, 6);

    // the rocket
    const rk = K.group(g, 0.2, 0.8, 0.2);
    const prof = [[0.0, 0], [0.42, 0.02], [0.52, 0.3], [0.56, 1.0], [0.56, 2.2], [0.5, 2.8], [0.38, 3.3], [0.2, 3.75], [0.05, 4.0]];
    K.lathe(prof.slice(0, 6), M.brass, 16, 0, 0, 0, rk);
    K.lathe(prof.slice(5), M.copper, 16, 0, 0, 0, rk);
    K.cyl(0.03, 0.05, 0.6, M.brassL, 6, 0, 4.25, 0, rk);
    K.sph(0.07, M.brassL, 0, 4.55, 0, rk, 6, 4);
    for (const y of [0.35, 1.05, 1.75, 2.45]) { K.torus(0.565, 0.035, M.brassD, 4, 22, 0, y, 0, rk).rotation.x = Math.PI / 2; rivetRing(K, rk, 0.575, y + 0.09, 14, M.brassL); }
    const ports = [];
    for (const [y, a] of [[1.4, 0.785], [2.1, 0.785], [1.4, 2.3]]) {
      const pg = K.group(rk, Math.cos(a) * 0.55, y, Math.sin(a) * 0.55); pg.rotation.y = -a + Math.PI / 2;
      K.cyl(0.15, 0.15, 0.06, M.brassL, 12, 0, 0, 0, pg).rotation.x = Math.PI / 2;
      ports.push(K.cyl(0.1, 0.1, 0.08, K.glow(0xffc070), 12, 0, 0, 0.01, pg)); ports[ports.length - 1].rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4, fin = K.group(rk); fin.rotation.y = -a;
      const f = K.box(0.06, 1.0, 0.7, M.copperD, 0, 0.45, 0.75, fin); f.rotation.x = 0.25;
      K.box(0.08, 0.08, 0.6, M.brass, 0, -0.05, 0.85, fin);
    }
    const nozzle = K.lathe([[0.18, 0], [0.3, -0.35], [0.36, -0.42]], M.ironL, 12, 0, 0.05, 0, rk);
    // flame
    const plume = K.group(rk, 0, -0.35, 0);
    const fl1 = K.cone(0.33, 1.6, K.glow(0xffd27a, 0.95, true), 10, 0, -0.8, 0, plume); fl1.rotation.x = Math.PI;
    const fl2 = K.cone(0.2, 1.0, K.glow(0xffffff, 1, true), 8, 0, -0.5, 0, plume); fl2.rotation.x = Math.PI;
    const fl3 = K.cone(0.5, 2.6, K.glow(0xff6a20, 0.5, true), 10, 0, -1.3, 0, plume); fl3.rotation.x = Math.PI;
    plume.visible = false;
    const plumeL = K.light(0xff8a3a, 0, 9, 0, -0.6, 0, rk);
    // hold-down clamps
    const clamps = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2, cg = K.group(g, 0.2 + Math.cos(a) * 0.95, 0.8, 0.2 + Math.sin(a) * 0.95); cg.rotation.y = -a;
      K.box(0.25, 0.2, 0.25, M.iron, 0, 0.0, 0, cg);
      const jaw = K.group(cg, 0, 0.1, 0); K.box(0.14, 0.55, 0.14, M.brassD, 0, 0.27, 0, jaw); K.box(0.22, 0.1, 0.14, M.brass, -0.08, 0.52, 0, jaw);
      clamps.push(jaw);
    }

    let phase = 0, cycleS = null, tPuff = 0;
    const LAUNCH_T = 9;
    return { g, update(t, dt, s) {
      const cd = s === 'COUNTDOWN', la = s === 'LAUNCH';
      if (la) { if (cycleS !== 'LAUNCH') phase = 0; phase += dt; if (phase > LAUNCH_T) phase = 0; } else phase = 0;
      cycleS = s;
      // clock
      hand.rotation.z = cd ? -((t * 0.9) % (Math.PI * 2)) : la ? -Math.min(phase, 1) * 6.28 : 0;
      ckLamp.material.emissive.setHex(cd ? (Math.sin(t * 8) > 0 ? 0xffa030 : 0) : la && phase < 6 ? 0x60ff90 : 0);
      bell.rotation.z = cd ? Math.sin(t * 20) * 0.2 : 0;
      beacon.material.emissive.setHex((cd || la) && Math.sin(t * 6) > 0 ? 0xff3020 : 0);
      cage.position.y = cd || la ? 0.3 : 1 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 3.5;
      tankN.rotation.z = cd ? -0.6 + Math.sin(t * 5) * 0.1 : la ? -1.1 : 0.7;
      ports.forEach((p) => p.material.color.setHex(cd || la ? 0xffe0a0 : 0xb07a3a));
      // service arm swings away
      const armTarget = la ? 0.9 : cd ? 0.3 : -Math.PI / 4 + 0.0;
      armP.rotation.y += ((la || cd ? armTarget : -Math.PI / 4) - armP.rotation.y) * Math.min(1, dt * 2);
      // rocket flight
      let y = 0.8, ign = 0;
      if (la) {
        if (phase < 1.5) { ign = phase / 1.5; y = 0.8 + Math.sin(phase * 40) * 0.015; }
        else if (phase < 6) { const q = phase - 1.5; y = 0.8 + q * q * 2.2; ign = 1; }
        else { y = 60; ign = 0; }
      }
      rk.position.y = y;
      rk.visible = !(la && phase >= 6 && phase < 7.8);
      if (la && phase >= 7.8) { const q = (phase - 7.8) / 1.2; rk.position.y = 0.8 + (1 - q) * 6; }
      clamps.forEach((c) => (c.rotation.z += (((la && phase > 1.2 && phase < 7.8) ? -1.1 : 0) - c.rotation.z) * Math.min(1, dt * 6)));
      plume.visible = ign > 0;
      if (ign > 0) { const f = 0.8 + Math.random() * 0.4; plume.scale.set(ign, ign * f, ign); }
      if (!plumeL.isDummy) plumeL.intensity = ign * (2.4 + Math.random() * 0.8);
      // steam + smoke
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = 0.04;
        if (cd || s === 'IDLE') if (Math.random() < (cd ? 0.8 : 0.12)) { K.spawn(g, -2.0 + K.R() * 0.8, 1.3, 0.6 + K.R() * 0.8, K.R() * 0.4 + 0.2, 0.9, K.R() * 0.4, 0xa89c88, 1.4, 0.13, -0.1); if (cd && Math.random() < 0.5) K.spawn(g, 0.2 + K.R() * 2, 0.5, 0.2 + K.R() * 2, K.R(), 0.4, K.R(), 0x9a8e7c, 1.4, 0.18, -0.08); }
        if (la && ign > 0) {
          for (let i = 0; i < 3; i++) {
            const d = Math.random() < 0.5 ? 1 : -1;
            const dirX = Math.cos(Math.PI / 4) * d, dirZ = -Math.sin(Math.PI / 4) * d;
            if (rk.position.y < 3) K.spawn(g, 0.2 + dirX * 0.5, 0.6, 0.2 + dirZ * 0.5, dirX * (2 + Math.random() * 2), 0.4 + Math.random(), dirZ * (2 + Math.random() * 2), Math.random() < 0.3 ? 0xff9a40 : 0x9a8e7c, 1.6, 0.22, -0.2);
            K.spawn(g, 0.2 + K.R() * 0.3, rk.position.y - 0.9, 0.2 + K.R() * 0.3, K.R() * 0.6, -0.5, K.R() * 0.6, Math.random() < 0.4 ? 0xffb050 : 0x8e8474, 2.2, 0.28, -0.15);
          }
        }
        if (la && phase > 6 && phase < 7.8 && Math.random() < 0.5) K.spawn(g, 0.2 + K.R() * 3, 0.5, 0.2 + K.R() * 3, K.R(), 0.3, K.R(), 0x7e7466, 2, 0.35, -0.08);
      }
    } };
  }

  SHIP.register({
    id: 'cogiron', name: 'BLACK IRON', eyebrow: 'COGWORKS · VARIATION 1', accent: '#e0782a',
    pitch: 'The dirtiest foundry on the line. Oil-black iron, soot, rust and coal dust, lit mostly by a roaring blast furnace. Chain-driven belts carry ore, sorted capsules and finished PR crates between the machines, crossing over and under each other, with a drop forge stamping every crate.',
    palette: ['#0f0c0a', '#221d19', '#3a332c', '#4a2216', '#6a2e14', '#7a3c20', '#8a6428', '#b48a3e', '#ff7a2a', '#7af0d8'],
    keywords: ['OIL & SOOT', 'BLAST FURNACE', 'CHAIN-DRIVEN BELTS', 'DROP FORGE', 'RUST', 'AETHER CORE'],
    sky: { top: '#080605', bottom: '#3a1a0a', fog: '#1e110a', fogNear: 55, fogFar: 105 },
    light: { sun: 0xffa060, sunI: 0.85, sunDir: [-8, 16, 10], hemiSky: 0xa88a6e, hemiGnd: 0x22160e, hemiI: 0.62 },
    finish: { levels: 40, dither: 0.15, outline: 0.6, thresh: 0.07, ink: '#080403', sat: 0.92, contrast: 1.15, bloom: 0.85, bloomThresh: 0.62, vignette: 0.55, grade: 0.4, shadow: '#1a1028', high: '#ffcf90', scan: 0 },
    world,
    components: [
      { id: 'assembler', name: 'CLOCKWORK ASSEMBLER', blurb: 'A coding agent building your PR. Sorted capsules ride in on the belt, the brass arm welds the PR chest under the grinding difference engine, and crates go out on the raised line.', states: ['IDLE', 'WORKING', 'BLOCKED'], build: buildAssembler },
      { id: 'splitter', name: 'AETHER SPLITTER', blurb: 'Muse Spark, the brain. Ore climbs the incline belt into its hopper; the orrery spins around the aether core and fires sorted capsules down the glass tubes onto the line.', states: ['IDLE', 'SORTING'], build: buildSplitter },
      { id: 'launch', name: 'IRON LAUNCH PAD', blurb: 'A merged PR ships. Crates roll in on the raised line; rejects ride the rework belt back to Spark. The rocket breaks its clamps and climbs out on fire and black smoke.', states: ['IDLE', 'COUNTDOWN', 'LAUNCH'], build: buildLaunch }
    ]
  });
})();
