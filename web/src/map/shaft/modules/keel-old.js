// The OLD keel (moved here word for word from mine.js, floating-city slice 1): banded rock tapering into the dark
// below the quarry floor, stalactites, roots and pipes, chains, swinging lanterns, the LEVEL catwalk, the smelter in
// the keel's belly with its deep haze, and the slag furnace pouring into the abyss.
// mine.js calls oldKeel() for every load: with ?artpass=1 off it builds exactly what it always did; with it on it is
// built into throwaway groups (so mine.js's seeded random sequence, and so the rest of the mine, stays the same) and
// the new keel (modules/keel.js) takes its place. No default export: the module loader skips this file.

export function oldKeel(env) {
  const { K, M, rr, R, fm, worldBox, chainBox, sign, automaton, band, slagFurnace, FLOOR, QX0, QX1, QZ1, S, T2 } = env;
  const statics = env.artPass ? K.group() : env.statics, anim = env.artPass ? K.group() : env.anim;
  // ================================================================ THE KEEL: rock tapering into the dark below the quarry floor
  const keel = K.group(statics), keelA = K.group(anim);
  const KB = [ // [yTop, yBot, front z, colour]: each band steps back under the one above
    [FLOOR - 0.38, FLOOR - 2.0, QZ1 - 0.12, 0x9a8670],
    [FLOOR - 2.0, FLOOR - 4.4, QZ1 - 1.0, 0x7c7e8a],
    [FLOOR - 4.4, FLOOR - 7.2, QZ1 - 2.1, 0x6a6672],
    [FLOOR - 7.2, FLOOR - 10.4, QZ1 - 3.4, 0x54565f],
    [FLOOR - 10.4, FLOOR - 14.0, QZ1 - 4.9, 0x46454e],
    [FLOOR - 14.0, FLOOR - 20.0, QZ1 - 6.6, 0x3a3842]
  ];
  const keelMats = KB.map((b) => fm(K, 'sed', b[3]));
  const keelAt = (y) => { for (let i = 0; i < KB.length; i++) if (y <= KB[i][0] && y > KB[i][1]) return i; return KB.length - 1; };
  const keelBottom = (x) => FLOOR - 1.6 - 15.5 * Math.pow(Math.max(0, 1 - ((x - 0.6) / 20.6) ** 2), 1.2);
  const tips = [], kcols = [];
  for (let x = QX0; x < QX1 - 0.05;) {
    const w = Math.min(QX1 - x, 1.3 + rr() * 1.8), x0 = x, x1 = x + w, xc = (x0 + x1) / 2; x = x1;
    const raw = keelBottom(xc) + R() * 1.8;
    const yb = Math.min(FLOOR - 1.4, FLOOR - 0.38 - 0.8 * Math.ceil((FLOOR - 0.38 - raw) / 0.8));
    KB.forEach((b, bi) => {
      const yt = b[0], y0 = Math.max(b[1], yb); if (yt <= y0) return;
      const fz = b[2] - rr() * 0.22;
      worldBox(K, w, yt - y0, 2.4, keelMats[bi], xc, (yt + y0) / 2, fz - 1.2, keel, S);
      if (bi >= 1 && rr() < 0.3 && yt - y0 > 1.2) {
        const bw = w * (0.35 + rr() * 0.3), bx = x0 + bw / 2 + rr() * (w - bw), bz = Math.min(KB[bi - 1][2] - 0.25, b[2] + 0.4);
        worldBox(K, bw, yt - y0, 1.0, keelMats[bi], bx, (yt + y0) / 2, bz - 0.5, keel, S);
      }
      if (yt - y0 > 0.9) for (let i = 0; i < 1 + Math.floor(rr() * 2); i++) {
        const pw = Math.min(w - 0.1, 0.6 + rr() * 1.1), ph = 0.35 + rr() * Math.min(1.0, yt - y0 - 0.3), d = 0.1 + rr() * 0.12;
        worldBox(K, pw, ph, d, keelMats[bi], x0 + pw / 2 + rr() * (w - pw), y0 + ph / 2 + 0.1 + rr() * Math.max(0, yt - y0 - ph - 0.2), fz + d / 2 - 0.03, keel, S);
      }
    });
    // stalactites under the column: longer + fatter toward the deep middle
    const bi = keelAt(yb + 0.05), fz = KB[bi][2], deep = Math.min(1, (FLOOR - yb) / 14);
    const n = 3 + Math.floor(rr() * 3);
    for (let i = 0; i < n; i++) { // the cone bases stay tucked inside the column (no caps poking out to be seen from above)
      const L = 0.8 + rr() * (1.1 + deep * 3.0), r = Math.min(w / 2 - 0.08, 0.24 + rr() * 0.34 + deep * 0.16), collar = L > 1.5 && r * 1.4 < w / 2 - 0.08;
      const rc = collar ? r * 1.4 : r, sx = x0 + rc + 0.04 + rr() * Math.max(0, w - 2 * rc - 0.08), sz = fz - rc - 0.1 - rr() * Math.max(0, 1.0 - rc);
      const c = K.cone(r, L, keelMats[bi], 6, sx, yb - L / 2 + 0.05, sz, keel); c.rotation.x = Math.PI; c.rotation.y = rr() * 3;
      if (collar) { const c2 = K.cone(rc, L * 0.3, keelMats[bi], 6, sx, yb - L * 0.15 + 0.05, sz, keel); c2.rotation.x = Math.PI; c2.rotation.y = rr() * 3; }
      tips.push([sx, yb - L, sz]);
    }
    kcols.push({ x0, x1, xc, yb, fz });
  }
  // seams between the keel bands (only where the column reaches below)
  for (let bi = 1; bi < KB.length; bi++) {
    const yb = KB[bi][0], fz = KB[bi][2], fzUp = KB[bi - 1][2];
    kcols.forEach((k) => {
      if (k.yb >= yb - 0.2) return; const w = k.x1 - k.x0;
      K.box(w, 0.08, 0.04, M.seam, k.xc, yb - 0.05, fz + 0.03, keel); K.box(w, 0.05, 0.05, M.lip, k.xc, yb + 0.025, fzUp + 0.02, keel); K.box(w, 0.6, 0.02, M.ao, k.xc, yb - 0.32, fz + 0.035, keel);
    });
  }
  // roots + old pipes hanging out of the keel, chains with hooks (a few swing)
  kcols.forEach((k, i) => {
    if (k.yb > FLOOR - 4 || i % 3) return; const L = 2 + rr() * 3;
    K.tube([[k.xc, k.yb + 0.3, k.fz - 0.4], [k.xc + R() * 0.8, k.yb - L * 0.4, k.fz - 0.2], [k.xc + R() * 1.4, k.yb - L, k.fz - 0.3 + R() * 0.6]], 0.08 + rr() * 0.08, rr() < 0.5 ? M.rust : M.ironM, keel, 8, 5);
  });
  kcols.forEach((k, i) => {
    if (i % 3 !== 1) return;
    const L = 1.6 + rr() * 2.6, x = k.xc + 0.4, y = k.yb + 0.1, z = k.fz - 0.3;
    chainBox(K, keel, x, y, y - L, z, 0.06); K.torus(0.16, 0.04, M.ironL, 4, 8, x, y - L - 0.15, z, keel, Math.PI * 1.4);
  });
  // lanterns swinging from the floor's lip
  const lanterns = [];
  for (const [x, L] of [[-14.6, 2.0], [-11.7, 1.3], [8.3, 2.4], [11.6, 1.6]]) {
    const piv = K.dyn(K.group(keelA, x, FLOOR - 0.3, QZ1 + 0.18));
    K.box(0.035, L, 0.035, M.iron, 0, -L / 2, 0, piv);
    const c = K.group(piv, 0, -L - 0.2, 0);
    K.box(0.26, 0.04, 0.26, M.brassD, 0, 0.18, 0, c); K.box(0.26, 0.04, 0.26, M.brassD, 0, -0.18, 0, c);
    for (const sx of [-0.12, 0.12]) K.box(0.03, 0.36, 0.03, M.iron, sx, 0, 0.12, c);
    K.box(0.14, 0.22, 0.14, M.lampHead, 0, 0, 0, c);
    lanterns.push({ piv, ph: rr() * 6 });
  }
  // the LEVEL catwalk hung under the floor's lip: planks on rust stringers, hanger rods, a front rail, lamps, a worker
  const CWY = FLOOR - 1.75, CWZ = QZ1 + 0.1, CW0 = -10.2, CW1 = 6.8, cwL = CW1 - CW0, cwX = (CW0 + CW1) / 2;
  worldBox(K, cwL, 0.08, 0.8, M.PLANK, cwX, CWY - 0.04, CWZ, keel, [1.0, 1, 0.8]);
  for (const sz of [-0.4, 0.4]) K.box(cwL + 0.1, 0.16, 0.07, M.rust, cwX, CWY - 0.15, CWZ + sz, keel);
  for (let x = CW0 + 0.3; x <= CW1 - 0.2; x += 0.6) K.box(0.05, 0.05, 0.03, M.brassL, x, CWY - 0.15, CWZ + 0.445, keel);
  for (let x = CW0 + 0.15; x <= CW1; x += 2.43) {
    for (const sz of [-0.36, 0.36]) K.box(0.05, FLOOR - 0.36 - CWY, 0.05, M.iron, x, (FLOOR - 0.36 + CWY) / 2, CWZ + sz, keel);
    K.box(0.09, 0.1, 0.92, M.ironM, x, CWY - 0.27, CWZ, keel);
  }
  for (let x = CW0 + 0.05; x <= CW1; x += 1.21) K.box(0.05, 0.62, 0.05, M.iron, x, CWY + 0.31, CWZ + 0.37, keel);
  for (const y of [0.34, 0.6]) K.box(cwL, 0.035, 0.035, M.ironL, cwX, CWY + y, CWZ + 0.37, keel);
  for (let x = CW0 + 0.25; x < CW1 - 0.1; x += 0.5) K.box(0.25, 0.07, 0.02, Math.floor(x * 2 + 40) % 2 ? M.hazard : M.soot, x, CWY + 0.035, CWZ + 0.41, keel);
  for (const x of [CW0 + 2.5, cwX + 0.6, CW1 - 2.0]) {
    K.box(0.06, 1.0, 0.06, M.iron, x, CWY + 0.5, CWZ - 0.3, keel); K.box(0.06, 0.05, 0.36, M.iron, x, CWY + 0.98, CWZ - 0.14, keel);
    K.box(0.16, 0.2, 0.16, M.lampHead, x, CWY + 0.8, CWZ + 0.02, keel); K.cone(0.14, 0.1, M.brassD, 6, x, CWY + 0.95, CWZ + 0.02, keel);
    K.box(1.1, 0.006, 0.72, fm(K, 'add', 0xffc070, 0.12), x, CWY + 0.006, CWZ, keel);
  }
  for (const [x, s] of [[CW0 + 1.1, 0.36], [CW0 + 1.5, 0.3], [cwX - 2.6, 0.34], [CW1 - 0.8, 0.4]]) { K.box(s, s, s, M.woodD, x, CWY + s / 2, CWZ - 0.18, keel); K.box(s + 0.02, 0.04, s + 0.02, M.ironM, x, CWY + s * 0.75, CWZ - 0.18, keel); }
  K.cyl(0.16, 0.16, 0.44, M.verd, 8, cwX + 3.4, CWY + 0.22, CWZ - 0.16, keel);
  { const lx = CW0 + 4.6, ly = FLOOR - 0.95; const lv = sign(K, keel, 'LEVEL', 0xe8d8b8, lx, ly, CWZ + 0.47, T2, { fr: 0.05 });
    for (const sx of [-0.4, 0.4]) chainBox(K, keel, lx + sx * lv.w, FLOOR - 0.36, ly + lv.h / 2 + 0.05, CWZ + 0.45, 0.03); }
  const cwBot = automaton(K, keel, cwX - 1.4, CWY, CWZ - 0.02, 0.9, false, 0); K.box(0.1, 0.14, 0.1, M.lampHead, 0, -0.3, 0.05, cwBot.arms[1]); K.box(0.12, 0.03, 0.12, M.brassD, 0, -0.215, 0.05, cwBot.arms[1]);
  // the deep glow: a smelter in the keel's belly, a slag stream falling into the abyss, a haze from far below
  const deepest = kcols.reduce((a, k) => (k.yb < a.yb ? k : a), kcols[0]);
  const kfX = deepest.xc, kfY = deepest.yb + 0.9, kfZ = deepest.fz - 0.2;
  const kf = K.group(keel, kfX, kfY, kfZ);
  K.cyl(1.2, 0.9, 1.6, M.iron, 10, 0, 0, 0, kf); band(K, kf, 1.22, 0.5, M.rust, 0.14); band(K, kf, 1.0, -0.6, M.brassD, 0.12);
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; const w = K.box(0.18, 0.7, 0.06, M.ember, Math.sin(a) * 1.08, 0, Math.cos(a) * 1.08, kf); w.rotation.y = a; }
  K.cone(0.9, 0.9, M.ironM, 10, 0, -1.25, 0, kf).rotation.x = Math.PI;
  const deepHaze = K.sph(6.5, K.glow(0xff5a18, 0.1, true), kfX, kfY - 5.5, kfZ - 2, keel, 12, 8);
  const deepHaze2 = K.sph(3.4, K.glow(0xff8a3a, 0.12, true), kfX, kfY - 2.5, kfZ, keel, 10, 8);
  slagFurnace(9.8, FLOOR - 2.6, 0.72, FLOOR - 30, KB[1][2] + 0.4);

  return { lanterns, cwBot, deepHaze, deepHaze2, tips: env.artPass ? [] : tips };
}
