// =====================================================================
// CLOCKWORK ASSEMBLER (the shaft's BUILD floor) — MACHINES agent
// Ported from the Black Iron mockup (docs/art/black-iron/modules/assembler.js): same geometry, materials,
// phases and blocked look. The issue's journey through the machine, every handoff a visible motion:
//   intake TRAY (stop-booms hold the queue)  ->  ARM A (dark iron + brass joints, IK, gripper)  ->  CARD PUNCH
//   (carriage, flywheel-driven ram, open front, punched ribbon; issue becomes a glowing bound card stack)  ->
//   GANTRY CLAW (hazard-yellow)  ->  engine INTAKE CUP (lid)  ->  glass pipe  ->  VACUUM RISER inside the dome
//   (gear stacks roar, collar of light rides up; cards become the PR capsule)  ->  tube port  ->  M.give(item,'out')
// Stages are independent state machines (the arm fetches the next issue while the engine compiles).
// IDLE = lights down (fire banked, dome dark, gears stopped, arm folded). WORKING = lit, turning, sparking.
// BLOCKED = everything freezes; red strobe floods the bay, dome glass turns red, the boiler throws a tall
// steam plume, and a big "?" card hangs over the machine.
// Shaft changes:
//  - one instance per subscription harness (M.harness): a marquee nameplate on the gantry post with the agent's
//    name in its accent color, plus accent pilot lamps and the dome's crown lamp, so assemblers read apart;
//  - REAL TIME: the cards hang in the riser while the agent really writes the PR (gears roar, collars of light
//    sweep the riser, the dome bubbles) until M.ready(item); then they rise, become the capsule and leave.
//    Under the auto driver the item is ready at once and the cycle plays exactly like the mockup;
//  - rework comes back in as a red capsule (attempts > 0): punched into new cards like any issue;
//  - every moving part is marked K.dyn (the shaft merges everything else after build);
//  - the point light is rationed (2 for all assemblers): without one, a soft light pool fakes it.
// =====================================================================

// harness accent colors + names: the game's palette (web/src/map/scene.ts HARNESS_COLOR / HARNESS_NAME)
const HARNESS = {
  claude_code: { name: 'CLAUDE CODE', col: 0xd97757, lamp: 0xff8a5a, dim: 0x3a1a10 },
  codex: { name: 'CODEX', col: 0xd6dbe3, lamp: 0xe6f0ff, dim: 0x26282c },
  cursor: { name: 'CURSOR', col: 0x9b8cff, lamp: 0xb0a4ff, dim: 0x1e1a38 },
  grok: { name: 'GROK', col: 0xeef1fa, lamp: 0xf4f8ff, dim: 0x2a2c30 },
  local: { name: 'LOCAL MODEL', col: 0xff7a2a, lamp: 0xff9a4a, dim: 0x3a1a08 },
  spark: { name: 'PLANNER', col: 0x6fb2ff, lamp: 0x8ac4ff, dim: 0x10203a },
};
const harnessOf = (h) => HARNESS[h] || { name: String(h || 'agent').toUpperCase().replace(/_/g, ' '), col: 0x9ad0ff, lamp: 0xb4dcff, dim: 0x18242e };

// 5x5 pixel font (Silkscreen-like caps) for the nameplates
const F5 = {
  A: '.###.|#...#|#####|#...#|#...#', B: '####.|#...#|####.|#...#|####.', C: '.####|#....|#....|#....|.####', D: '####.|#...#|#...#|#...#|####.',
  E: '#####|#....|####.|#....|#####', F: '#####|#....|####.|#....|#....', G: '.####|#....|#..##|#...#|.####', H: '#...#|#...#|#####|#...#|#...#',
  I: '#####|..#..|..#..|..#..|#####', J: '....#|....#|....#|#...#|.###.', K: '#...#|#..#.|###..|#..#.|#...#', L: '#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#', O: '.###.|#...#|#...#|#...#|.###.', P: '####.|#...#|####.|#....|#....',
  Q: '.###.|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|####.|#..#.|#...#', S: '.####|#....|.###.|....#|####.', T: '#####|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#.#.#|##.##|#...#', X: '#...#|.#.#.|..#..|.#.#.|#...#',
  Y: '#...#|.#.#.|..#..|..#..|..#..', Z: '#####|...#.|..#..|.#...|#####',
  0: '.###.|#..##|#.#.#|##..#|.###.', 1: '..#..|.##..|..#..|..#..|.###.', 2: '####.|....#|.###.|#....|#####', 3: '####.|....#|.###.|....#|####.',
  4: '#..#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|####.', 6: '.###.|#....|####.|#...#|.###.', 7: '#####|....#|...#.|..#..|..#..',
  8: '.###.|#...#|.###.|#...#|.###.', 9: '.###.|#...#|.####|....#|.###.', '-': '.....|.....|.###.|.....|.....', '>': '.#...|..#..|...#.|..#..|.#...',
};

export default function install(IRON) {
  IRON.machine('assembler', function (K, M) {
    const THREE = K.THREE, V3 = THREE.Vector3;
    const HN = harnessOf(M.harness);
    const C = {
      soot: 0x1e1814, iron: 0x3a3029, ironM: 0x483c33, ironL: 0x64574b, ironX: 0x7e6f60,
      brass: 0xb8883c, brassD: 0x7a5822, brassL: 0xe4b85e, copper: 0xac5a30, copperD: 0x72401f, verd: 0x43927a,
      wood: 0x6e4c2c, woodD: 0x4c341f, rust: 0x92461f, hazard: 0xe0a01c, red: 0xc8321e
    };
    const m = {
      soot: K.mat(C.soot), iron: K.mat(C.iron, { shine: 22, spec: 0x2e2e34 }), ironM: K.mat(C.ironM, { shine: 18, spec: 0x26262c }),
      ironL: K.mat(C.ironL, { shine: 30, spec: 0x3a3a40 }), ironX: K.mat(C.ironX, { shine: 40, spec: 0x50505a }),
      brass: K.mat(C.brass, { shine: 42, spec: 0x8a6a30 }), brassD: K.mat(C.brassD, { shine: 24, spec: 0x4a3818 }), brassL: K.mat(C.brassL, { shine: 60, spec: 0xb09050 }),
      copper: K.mat(C.copper, { shine: 36, spec: 0x7a4428 }), copperD: K.mat(C.copperD, { shine: 20, spec: 0x3a1a0a }), verd: K.mat(C.verd, { shine: 16 }),
      wood: K.mat(C.wood), woodD: K.mat(C.woodD), rust: K.mat(C.rust), hazard: K.mat(C.hazard),
      armIron: K.mat(0x2a2522, { shine: 34, spec: 0x44444c }), armIronL: K.mat(0x3c3632, { shine: 30, spec: 0x3a3a40 }),
      paint: K.mat(0xd99a16, { shine: 26, spec: 0x5a4a20 }), paintD: K.mat(0x8a2c14, { shine: 18, spec: 0x3a1a0a }), steel: K.mat(0x8c8a88, { shine: 50, spec: 0x707078 }),
      paper: K.mat(0x8e7c5e), paperD: K.mat(0x6e604a), ribbon: K.mat(0xb8a47c), ribbonD: K.mat(0x9c8862),
      gearA: K.mat(0x9a7234, { shine: 14, spec: 0x3a2a14 }), gearB: K.mat(0x7a5a28, { shine: 10, spec: 0x2a1e0e }),
      glass: K.mat(0xbfe8da, { op: 0.2, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      glassR: K.mat(0xd8fff0, { op: 0.17, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      oil: K.mat(0x0b0b10, { shine: 90, spec: 0x7a6a9a }), grime: K.mat(0x0a0806, { op: 0.42, depthWrite: false }), ink: K.mat(0x140c06)
    };
    const g = K.group();
    const st = K.group(g);      // static, baked at the end
    const dg = K.group(g);      // the moving parts live here (each mover marked K.dyn; rigid groups baked on their own)
    const dyn = K.dyn;
    const lerp = K.lerp, sm = K.smooth, cl = K.clamp01;
    const v = new V3(), v2 = new V3(), v3 = new V3();
    const bakes = [];           // rigid moving groups to bake once built
    const rigid = (p, x, y, z) => { const r = K.group(p, x, y, z); bakes.push(r); return r; };
    const noShadow = (o) => { o.traverse((c) => { if (c.isMesh) c.castShadow = false; }); return o; };
    // ---------- one draw call per rigid part ----------
    // The art is hundreds of little boxes in a dozen materials. Every opaque untextured part under each anchor
    // (the machine itself, and every part marked K.dyn) merges into ONE vertex-coloured mesh: each part's diffuse,
    // specular colour + shininess, emissive and fog ride along per vertex, so brass still shines like brass next to
    // dull iron and glows stay unfogged. Lamps (materials that change at runtime) are tagged lamp(mt): they merge
    // too, and syncLamps() copies the material's colour/emissive into their vertices when it changes (an unlit
    // glow merges as pure emission). live(mt) keeps a part out of the merge.
    const lamp = (mt) => { mt.userData.lamp = true; return mt; };
    const live = (mt) => { mt.userData.live = true; return mt; };
    let vcMat = null;
    function vcMaterial() {
      if (vcMat) return vcMat;
      vcMat = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
      vcMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 spec;\nattribute vec3 emis;\nattribute float fogk;\nvarying vec4 vSpec;\nvarying vec3 vEmis;\nvarying float vFogK;')
          .replace('#include <color_vertex>', '#include <color_vertex>\n\tvSpec = spec; vEmis = emis; vFogK = fogk;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vSpec;\nvarying vec3 vEmis;\nvarying float vFogK;')
          .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive + vEmis;')
          .replace('#include <lights_phong_fragment>', 'BlinnPhongMaterial material;\n\tmaterial.diffuseColor = diffuseColor.rgb;\n\tmaterial.specularColor = vSpec.rgb;\n\tmaterial.specularShininess = vSpec.a;\n\tmaterial.specularStrength = specularStrength;')
          .replace('#include <fog_fragment>', '#ifdef USE_FOG\n\t#ifdef FOG_EXP2\n\t\tfloat fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n\t#else\n\t\tfloat fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n\t#endif\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * vFogK );\n#endif');
      };
      vcMat.customProgramCacheKey = () => 'iron-vc';
      return vcMat;
    }
    const lampRefs = [];
    const vcOk = (c) => {
      const mt = c.material;
      if (c.constructor !== THREE.Mesh || c.children.length || !mt || Array.isArray(mt) || mt.transparent || mt.map || mt.userData.live || c.renderOrder !== 0 || !c.geometry.attributes.normal) return false;
      return (mt.isMeshPhongMaterial && mt.flatShading) || (mt.isMeshBasicMaterial && !!mt.userData.lamp);
    };
    // merge `list` (meshes) into one vertex-coloured geometry in the frame whose inverse world matrix is `inv`
    function vcGeometry(list, inv) {
      const rel = new THREE.Matrix4();
      let n = 0;
      const parts = list.map((o) => {
        rel.multiplyMatrices(inv, o.matrixWorld);
        const gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); gg.applyMatrix4(rel);
        const cnt = gg.attributes.position.count, dbl = o.material.side === THREE.DoubleSide;
        n += dbl ? cnt * 2 : cnt;
        return { gg, mt: o.material, flip: rel.determinant() < 0, dbl };
      });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), emi = new Float32Array(n * 3), spc = new Float32Array(n * 4), fgk = new Float32Array(n);
      const colA = new THREE.BufferAttribute(col, 3), emiA = new THREE.BufferAttribute(emi, 3), refs = [];
      let off = 0;
      const put = (P, N, cnt, rev) => {
        // rev: reversed winding (mirrored parts, and the back faces of double-sided ones)
        for (let q = 0; q < cnt; q += 3) for (let j = 0; j < 3; j++) {
          const src = q + (rev ? (j === 0 ? 0 : 3 - j) : j), dst = off + q + j;
          for (let k = 0; k < 3; k++) { pos[dst * 3 + k] = P[src * 3 + k]; nor[dst * 3 + k] = N[src * 3 + k] * (rev === 2 ? -1 : 1); }
        }
        off += cnt;
      };
      for (const { gg, mt, flip, dbl } of parts) {
        const P = gg.attributes.position.array, N = gg.attributes.normal.array, cnt = gg.attributes.position.count, start = off;
        put(P, N, cnt, flip ? 1 : 0);
        if (dbl) put(P, N, cnt, flip ? 0 : 2);
        const basic = mt.isMeshBasicMaterial, c = mt.color, e = basic ? c : mt.emissive, ei = basic ? 1 : mt.emissiveIntensity, s = basic ? null : mt.specular, shn = basic ? 1 : Math.max(mt.shininess, 1e-4), fog = mt.fog ? 1 : 0;
        for (let i = start; i < off; i++) {
          col[i * 3] = basic ? 0 : c.r; col[i * 3 + 1] = basic ? 0 : c.g; col[i * 3 + 2] = basic ? 0 : c.b;
          emi[i * 3] = e.r * ei; emi[i * 3 + 1] = e.g * ei; emi[i * 3 + 2] = e.b * ei;
          spc[i * 4] = s ? s.r : 0; spc[i * 4 + 1] = s ? s.g : 0; spc[i * 4 + 2] = s ? s.b : 0; spc[i * 4 + 3] = shn; fgk[i] = fog;
        }
        if (mt.userData.lamp) refs.push({ mt, basic, colA, emiA, start, end: off, key: '' });
        gg.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', colA); geo.setAttribute('emis', emiA); geo.setAttribute('spec', new THREE.BufferAttribute(spc, 4)); geo.setAttribute('fogk', new THREE.BufferAttribute(fgk, 1));
      geo.computeBoundingSphere();
      return { geo, refs };
    }
    function vcMerge(anchor, skip) {
      anchor.updateMatrixWorld(true);
      const sv = new V3(), list = [];
      let cast = false, recv = false;
      const walk = (o) => {
        for (const c of o.children) {
          if (c.userData.dyn || c.userData.noBake || !c.visible || skip.has(c)) continue;
          if (vcOk(c)) {
            list.push(c);
            const gm = c.geometry; if (!gm.boundingSphere) gm.computeBoundingSphere();
            c.getWorldScale(sv);
            if (c.castShadow && gm.boundingSphere.radius * Math.max(sv.x, sv.y, sv.z) >= 0.16) cast = true;
            if (c.receiveShadow) recv = true;
          } else walk(c);
        }
      };
      walk(anchor);
      if (!list.length) return;
      const { geo, refs } = vcGeometry(list, new THREE.Matrix4().copy(anchor.matrixWorld).invert());
      lampRefs.push(...refs);
      const mm = new THREE.Mesh(geo, vcMaterial()); mm.castShadow = cast; mm.receiveShadow = recv; mm.userData.noBake = true; mm.name = 'vc';
      anchor.add(mm);
      list.forEach((o) => o.parent.remove(o));
    }
    // the machine and each of its moving parts
    function vcBakeAll(root, skip) {
      const anchors = [root];
      const visit = (o) => { for (const c of o.children) { if (skip.has(c)) continue; if (c.userData.dyn) anchors.push(c); visit(c); } };
      visit(root);
      anchors.forEach((a) => vcMerge(a, skip));
    }
    // the kit's beacon + status lamp merge too: their materials are synced like lamps (static ones never change)
    const kitLamps = (grp) => grp.traverse((o) => { if (o.isMesh && o.material.isMeshPhongMaterial && !o.material.map && !o.material.transparent) lamp(o.material); });
    // ---------- instancing: copies of one small moving part, one draw call for all ----------
    // Each copy follows a pivot (an empty K.dyn group the cycle code moves exactly as before); every frame the
    // instances copy their pivots' matrices relative to the machine. A hidden pivot hides its copy.
    const insts = [], gInv = new THREE.Matrix4(), instM = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    function instancer(pivots, build, cast, colors) {
      const tmp = K.group(); build(tmp); tmp.updateMatrixWorld(true);
      const list = []; tmp.traverse((o) => { if (o.isMesh) list.push(o); });
      const { geo } = vcGeometry(list, new THREE.Matrix4());
      const im = dyn(new THREE.InstancedMesh(geo, vcMaterial(), pivots.length));
      im.castShadow = !!cast; im.receiveShadow = true; im.frustumCulled = false; im.name = 'vc-inst';
      if (colors) pivots.forEach((p, i) => im.setColorAt(i, new THREE.Color(colors[i])));
      g.add(im); insts.push({ im, pivots });
      return im;
    }
    function syncInstances() {
      if (!insts.length) return;
      g.updateWorldMatrix(true, false); gInv.copy(g.matrixWorld).invert();
      for (const { im, pivots } of insts) {
        pivots.forEach((p, i) => {
          if (!p.visible) { im.setMatrixAt(i, ZERO); return; }
          p.updateWorldMatrix(true, false); im.setMatrixAt(i, instM.multiplyMatrices(gInv, p.matrixWorld));
        });
        im.instanceMatrix.needsUpdate = true;
      }
    }
    // copy changed lamp materials into their vertices (only the changed ranges are uploaded)
    function syncLamps() {
      for (const L of lampRefs) {
        const mt = L.mt, c = mt.color, e = L.basic ? c : mt.emissive, ei = L.basic ? 1 : mt.emissiveIntensity;
        const dr = L.basic ? 0 : c.r, dgr = L.basic ? 0 : c.g, db = L.basic ? 0 : c.b, er = e.r * ei, eg = e.g * ei, eb = e.b * ei;
        const key = dr + ',' + dgr + ',' + db + ',' + er + ',' + eg + ',' + eb;
        if (key === L.key) continue;
        L.key = key;
        const C = L.colA.array, E = L.emiA.array;
        for (let i = L.start; i < L.end; i++) { C[i * 3] = dr; C[i * 3 + 1] = dgr; C[i * 3 + 2] = db; E[i * 3] = er; E[i * 3 + 1] = eg; E[i * 3 + 2] = eb; }
        L.colA.addUpdateRange(L.start * 3, (L.end - L.start) * 3); L.colA.needsUpdate = true;
        L.emiA.addUpdateRange(L.start * 3, (L.end - L.start) * 3); L.emiA.needsUpdate = true;
      }
    }
    // ---------- helpers ----------
    function gear(p, r, thick, teeth, mm, x, y, z) {
      const gg = K.group(p, x, y, z);
      K.cyl(r, r, thick, mm, Math.max(12, teeth), 0, 0, 0, gg);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, mm, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
      K.cyl(r * 0.3, r * 0.3, thick * 1.6, m.ironM, 8, 0, 0, 0, gg);
      if (r > 0.25) for (let i = 0; i < 3; i++) { const s = K.box(r * 1.5, thick * 1.1, r * 0.14, m.brassD, 0, 0, 0, gg); s.rotation.y = i * Math.PI / 3; }
      return gg;
    }
    const rivetRing = (p, x, z, r, y, n, mm) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, mm || m.brassL, x + Math.cos(a) * r, y, z + Math.sin(a) * r, p); } };
    const band = (p, x, z, r, y, mm, h) => K.cyl(r, r, h || 0.1, mm || m.brass, 18, x, y, z, p);
    function gauge(x, y, z, r, ry) {
      const s = K.group(st, x, y, z); s.rotation.y = ry || 0;
      const rim = K.cyl(r * 1.18, r * 1.18, 0.08, m.brass, 14, 0, 0, 0, s); rim.rotation.x = Math.PI / 2;
      const face = K.cyl(r, r, 0.1, K.mat(0xf0dfb4), 14, 0, 0, 0.01, s); face.rotation.x = Math.PI / 2;
      const red = K.box(r * 0.55, r * 0.2, 0.02, K.mat(0xc02a1a), r * 0.45, r * 0.45, 0.065, s); red.rotation.z = -0.8;
      for (let i = 0; i < 5; i++) { const a = -1.1 + i * 0.55; K.box(0.02, r * 0.18, 0.02, m.ink, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0.065, s).rotation.z = -a; }
      K.box(0.07, 0.07, 0.03, m.brassL, 0, 0, 0.1, s);
      const d = K.group(dg, x, y, z); d.rotation.y = ry || 0;
      const piv = dyn(K.group(d, 0, 0, 0.075)); piv.scale.set(1, r, 1); // the needle (one instance) is scaled to the dial
      return piv;
    }
    function hazardBand(p, len, x, y, z, n, alongZ, h) {
      const w = len / n;
      for (let i = 0; i < n; i++) { const o = -len / 2 + w * (i + 0.5); K.box(alongZ ? 0.04 : w * 0.96, h || 0.12, alongZ ? w * 0.96 : 0.04, i % 2 ? m.soot : m.hazard, x + (alongZ ? 0 : o), y, z + (alongZ ? o : 0), p); }
    }
    function puff(x, y, z, col, size, vy, spread, life, vx, vz) { K.spawn(g, x + K.R() * spread, y, z + K.R() * spread, (vx || 0) + K.R() * 0.3, vy, (vz || 0) + K.R() * 0.3, col, life || 2.2, size, -0.12); }
    function dust(x, y, z, n) { for (let i = 0; i < (n || 6); i++) K.spawn(g, x + K.R() * 0.35, y, z + K.R() * 0.35, K.R() * 1.4, 0.3 + Math.random() * 0.5, K.R() * 1.4, Math.random() < 0.5 ? 0x6a5a48 : 0x8a7a64, 0.7, 0.07, -0.2); }
    function sparks(x, y, z, n) { for (let i = 0; i < (n || 6); i++) K.spawn(g, x + K.R() * 0.2, y, z + K.R() * 0.2, K.R() * 2.4, 0.6 + Math.random() * 1.4, K.R() * 2.4, Math.random() < 0.5 ? 0xffd25a : 0xfff4d0, 0.4, 0.045, 6, true); }
    // handoff pulse: a ring of light that blooms where an item changes hands
    const pulses = [];
    function pulse(x, y, z, col) { const r = K.torus(0.3, 0.05, K.glow(col || 0xfff0c0, 0.9, true), 4, 18, x, y, z, dg); r.rotation.x = Math.PI / 2; r.castShadow = false; dyn(r); pulses.push({ r, t: 0 }); }
    // 3x5 pixel font for plates and the counter
    const FONT = { S: '111100111001111', H: '101101111101101', I: '111010010010111', P: '110101110100100', T: '111010010010010', O: '111101101101111', R: '110101110101101',
      0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };
    function glyph(c, ch, x, y, col, s) { const b = FONT[ch]; s = s || 1; c.fillStyle = col; for (let k = 0; k < 15; k++) if (b[k] === '1') c.fillRect(x + (k % 3) * s, y + Math.floor(k / 3) * s, s, s); }
    const plateTex = K.canvasTex(32, 32, (c) => {
      c.fillStyle = '#4c4238'; c.fillRect(0, 0, 32, 32);
      for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) { const o = (y / 8) % 2 ? 4 : 0; c.fillStyle = '#6a5c4e'; c.fillRect((x + o) % 32, y + 2, 3, 1); c.fillRect((x + o + 1) % 32, y + 1, 1, 3); c.fillStyle = '#2e2620'; c.fillRect((x + o + 1) % 32, y + 4, 2, 1); }
      c.fillStyle = 'rgba(10,8,6,0.35)'; c.fillRect(3, 18, 9, 6); c.fillRect(20, 4, 6, 4);
    }, [6, 6]);
    // 5x5 pixel text on a dark plate, the letters in `fg` with a soot drop shadow and a thin rim
    function textTex(text, fg, rim) {
      const pad = 3, gl = text.split('').map((ch) => (F5[ch] ? F5[ch].split('|') : null));
      let w = pad * 2; gl.forEach((q, i) => { w += (q ? 5 : 3) + (i < gl.length - 1 ? 1 : 0); });
      const h = 5 + pad * 2;
      const tex = K.canvasTex(w, h, (c) => {
        c.fillStyle = '#120d09'; c.fillRect(0, 0, w, h);
        c.fillStyle = rim; c.fillRect(1, 1, w - 2, 1); c.fillRect(1, h - 2, w - 2, 1); c.fillRect(1, 1, 1, h - 2); c.fillRect(w - 2, 1, 1, h - 2);
        for (const pass of [0, 1]) {
          let x = pad;
          gl.forEach((q) => {
            if (q) { c.fillStyle = pass ? fg : '#000000'; for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) if (q[r][k] === '#') c.fillRect(x + k + (pass ? 0 : 1), pad + r + (pass ? 0 : 1), 1, 1); }
            x += (q ? 5 : 3) + 1;
          });
        }
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return { tex, aspect: w / h };
    }
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');

    // =================================================================
    // PLINTH
    // =================================================================
    K.box(4.9, 0.3, 4.9, m.ironM, 0, 0.15, 0, st);
    K.box(5.0, 0.08, 5.0, m.brassD, 0, 0.33, 0, st);
    K.box(4.62, 0.04, 4.62, K.mat(0xffffff, { map: plateTex, shine: 20, spec: 0x2a2620 }), 0, 0.39, 0, st);
    for (let i = 0; i < 9; i++) { K.box(0.08, 0.08, 0.08, m.brassL, -2.3 + i * 0.575, 0.2, 2.47, st); K.box(0.08, 0.08, 0.08, m.brassL, 2.47, 0.2, -2.3 + i * 0.575, st); }
    hazardBand(st, 4.4, 0, 0.2, 2.48, 14, false); hazardBand(st, 4.4, 2.48, 0.2, 0, 14, true);
    for (const [x, z, sx, sz] of [[0.9, -0.2, 0.7, 0.45], [-0.3, 2.0, 0.5, 0.35], [1.9, 1.5, 0.4, 0.3], [0.55, 1.2, 0.35, 0.25]]) { const p = K.sph(1, m.oil, x, 0.4, z, st, 12, 4); p.scale.set(sx, 0.02, sz); p.castShadow = false; }
    for (let i = 0; i < 6; i++) { const d = K.box(0.4 + K.rnd() * 0.7, 0.01, 0.3 + K.rnd() * 0.5, m.grime, -2 + K.rnd() * 4, 0.415, -2 + K.rnd() * 4, st); d.rotation.y = K.rnd() * 3; d.castShadow = false; }
    for (let i = 0; i < 5; i++) K.box(0.9, 0.02, 0.06, m.soot, -0.15, 0.42, 2.0 + i * 0.09, st);
    { // stamped SHIPTORIO maker's plate
      const tex = K.canvasTex(40, 9, (c) => { c.fillStyle = '#7a5822'; c.fillRect(0, 0, 40, 9); c.fillStyle = '#e4b85e'; c.fillRect(0, 0, 40, 1); c.fillStyle = '#4a3416'; c.fillRect(0, 8, 40, 1); 'SHIPTORIO'.split('').forEach((ch, i) => glyph(c, ch, 2 + i * 4, 2, '#1e1408')); });
      K.box(1.5, 0.34, 0.03, K.mat(0xffffff, { map: tex, shine: 40, spec: 0x6a5020 }), -1.62, 0.18, 2.5, st);
      for (const x of [-2.32, -0.92]) K.box(0.05, 0.05, 0.05, m.brassL, x, 0.18, 2.53, st);
    }

    // =================================================================
    // INTAKE TRAY + stop booms (one per entry): booms drop while the tray holds an item, lift when it's taken.
    // The plan belt's spur arrives square to the front-left face (+z side).
    // =================================================================
    const TRAY = new V3(-0.5, 1.0, 2.9);
    {
      const tx = TRAY.x, tz = TRAY.z;
      for (const sx of [-0.36, 0.36]) for (const sz of [-0.36, 0.36]) { K.box(0.1, 0.86, 0.1, m.iron, tx + sx, 0.53, tz + sz, st); K.box(0.18, 0.06, 0.18, m.ironM, tx + sx, 0.13, tz + sz, st); }
      K.box(0.82, 0.06, 0.06, m.ironM, tx, 0.45, tz - 0.36, st); K.box(0.06, 0.06, 0.82, m.ironM, tx + 0.36, 0.45, tz, st);
      K.box(0.9, 0.08, 0.9, m.ironL, tx, 0.94, tz, st); K.box(0.94, 0.03, 0.94, m.brassD, tx, 0.9, tz, st);
      for (let i = 0; i < 5; i++) { const r = K.cyl(0.045, 0.045, 0.78, m.ironX, 6, tx - 0.32 + i * 0.16, 0.99, tz, st); r.rotation.x = Math.PI / 2; }
      K.box(0.06, 0.2, 0.9, m.brass, tx + 0.46, 1.06, tz, st); K.box(0.9, 0.2, 0.06, m.brass, tx, 1.06, tz - 0.46, st);
      K.box(0.1, 0.08, 0.96, m.brassD, tx + 0.46, 1.18, tz, st); K.box(0.96, 0.08, 0.1, m.brassD, tx, 1.18, tz - 0.46, st);
      for (let i = 0; i < 4; i++) { K.box(0.06, 0.06, 0.06, m.brassL, tx + 0.5, 1.06, tz - 0.33 + i * 0.22, st); K.box(0.06, 0.06, 0.06, m.brassL, tx - 0.33 + i * 0.22, 1.06, tz - 0.5, st); }
      K.box(0.06, 0.55, 0.06, m.iron, tx + 0.46, 1.4, tz - 0.46, st); K.cyl(0.09, 0.09, 0.05, m.brassD, 8, tx + 0.46, 1.69, tz - 0.46, st);
      // boom posts
      K.box(0.12, 0.42, 0.12, m.ironM, tx + 0.48, 1.16, tz + 0.5, st); K.box(0.12, 0.42, 0.12, m.ironM, tx - 0.5, 1.16, tz - 0.48, st);
    }
    const trayLampM = lamp(K.mat(0x3a2a10, { e: 0 }));
    K.sph(0.08, trayLampM, TRAY.x + 0.46, 1.76, TRAY.z - 0.46, dg, 8, 6);
    function boom(px, pz, alongZ) {
      const piv = dyn(K.group(dg, px, 1.33, pz)); const b = rigid(piv);
      const n = 6, len = 0.92, w = len / n;
      for (let i = 0; i < n; i++) { const o = -(i + 0.5) * w; K.box(alongZ ? 0.06 : w * 0.95, 0.07, alongZ ? w * 0.95 : 0.06, i % 2 ? m.soot : m.hazard, alongZ ? 0 : o, 0, alongZ ? -o : 0, b); }
      K.box(0.12, 0.12, 0.12, m.brassD, 0, 0, 0, b);
      return piv;
    }
    const boomZ = boom(TRAY.x + 0.48, TRAY.z + 0.5, false);   // across the plan-belt entry (+z side), swings up about z
    const boomX = boom(TRAY.x - 0.5, TRAY.z - 0.48, true);    // across the side gate (-x side), swings up about x
    let boomOpen = 1;

    // =================================================================
    // DIFFERENCE ENGINE: drum, glass dome (tints red when blocked), inner light shell, gear stacks, riser, tube fitting
    // =================================================================
    const D = new V3(-1.1, 0, -1.1);
    K.cyl(1.3, 1.38, 0.62, m.iron, 18, D.x, 0.71, D.z, st);
    band(st, D.x, D.z, 1.34, 0.98, m.brass, 0.1); band(st, D.x, D.z, 1.4, 0.46, m.brassD, 0.08);
    rivetRing(st, D.x, D.z, 1.36, 0.8, 22); rivetRing(st, D.x, D.z, 1.41, 0.56, 22, m.brassD);
    K.cyl(1.16, 1.16, 0.04, m.soot, 18, D.x, 1.03, D.z, st);
    const DOME_PROF = [[1.12, 0], [1.12, 1.25], [1.02, 1.85], [0.78, 2.32], [0.5, 2.6], [0.34, 2.72]];
    const dome = K.lathe(DOME_PROF, m.glass, 20, D.x, 1.03, D.z, st); dome.castShadow = false;
    const shellM = K.glow(0xffb45a, 0.0, true);
    const shell = K.lathe(DOME_PROF.map(([r, h]) => [r * 0.97, h]), shellM, 20, D.x, 1.03, D.z, dg); shell.castShadow = false; shell.userData.noBake = true;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2, c = Math.cos(a), s = Math.sin(a); K.tube([[D.x + c * 1.14, 1.04, D.z + s * 1.14], [D.x + c * 1.14, 2.28, D.z + s * 1.14], [D.x + c * 0.82, 3.3, D.z + s * 0.82], [D.x + c * 0.36, 3.74, D.z + s * 0.36]], 0.032, m.brass, st, 14, 4); }
    K.torus(1.14, 0.045, m.brassD, 4, 28, D.x, 2.28, D.z, st).rotation.x = Math.PI / 2;
    K.torus(0.4, 0.07, m.brass, 6, 18, D.x, 3.74, D.z, st).rotation.x = Math.PI / 2;
    const riser = K.cyl(0.3, 0.3, 3.42, m.glassR, 14, D.x, 1.03 + 1.71, D.z, st); riser.castShadow = false;
    for (const y of [1.1, 1.75, 2.45, 3.1, 3.7]) K.torus(0.31, 0.04, m.brassL, 4, 16, D.x, y, D.z, st).rotation.x = Math.PI / 2;
    K.cyl(0.42, 0.46, 0.18, m.brassD, 14, D.x, 3.82, D.z, st); K.cyl(0.36, 0.36, 0.08, m.brass, 14, D.x, 4.0, D.z, st);
    const fitG = K.cyl(0.3, 0.3, 0.5, m.glassR, 12, D.x, 4.18, D.z, st); fitG.castShadow = false;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.05, 0.5, 0.05, m.brass, D.x + sx * 0.25, 4.18, D.z + sz * 0.25, st);
    K.cyl(0.38, 0.38, 0.06, m.brassL, 14, D.x, 4.44, D.z, st); rivetRing(st, D.x, D.z, 0.35, 4.48, 8);
    // gear stacks: per stack, even and odd gears merged into two counter-rotating rigid groups
    const stacks = [];
    for (let s = 0; s < 4; s++) {
      const a = s / 4 * Math.PI * 2 + Math.PI / 4, sx = D.x + Math.cos(a) * 0.74, sz = D.z + Math.sin(a) * 0.74;
      K.cyl(0.035, 0.035, 2.5, m.ironL, 6, sx, 2.25, sz, st);
      const ga = dyn(rigid(dg, sx, 0, sz)), gb = dyn(rigid(dg, sx, 0, sz));
      for (let i = 0; i < 6; i++) { const r = 0.2 + ((i + s) % 3) * 0.045; gear(i % 2 ? gb : ga, r, 0.07, 10 + ((i + s) % 3) * 2, i % 2 ? m.gearA : m.gearB, 0, 1.25 + i * 0.36, 0).rotation.y = i * 0.4; }
      noShadow(ga); noShadow(gb); // inside the glass: their shadows never show, they'd only cost a pass
      stacks.push({ ga, gb, dir: s % 2 ? 1 : -1 });
    }
    const riserGlowM = K.glow(0xffb45a, 0.0, true);
    const riserGlow = dyn(K.cyl(0.24, 0.24, 3.3, riserGlowM, 10, D.x, 2.7, D.z, dg)); riserGlow.castShadow = false;
    // crown pilot lamp: the agent's accent color while it runs
    const crownM = lamp(K.glow(HN.lamp));
    K.sph(0.08, crownM, D.x + 0.4, 3.92, D.z + 0.4, dg, 8, 6);
    const collarM = K.glow(0xffd890, 0.0, true), collar2M = K.glow(0xffd890, 0.0, true);
    const collar = dyn(K.torus(0.33, 0.06, collarM, 4, 18, D.x, 1.1, D.z, dg)); collar.rotation.x = Math.PI / 2; collar.castShadow = false;
    const collar2 = dyn(K.torus(0.33, 0.04, collar2M, 4, 18, D.x, 1.1, D.z, dg)); collar2.rotation.x = Math.PI / 2; collar2.castShadow = false;
    // PR counter on the drum's front: four flip digits, ticks up per PR compiled
    const digitTex = K.canvasTex(40, 7, (c) => { c.fillStyle = '#f0dfb4'; c.fillRect(0, 0, 40, 7); for (let d = 0; d < 10; d++) glyph(c, String(d), d * 4 + 0.5 | 0, 1, '#1e1408'); });
    const digits = [];
    { const a = Math.PI / 4, cx = D.x + Math.cos(a) * 1.39, cz = D.z + Math.sin(a) * 1.39;
      const plate = K.group(st, cx, 0.72, cz); plate.rotation.y = -a + Math.PI / 2;
      K.box(0.96, 0.4, 0.05, m.brassD, 0, 0, 0, plate); K.box(1.0, 0.05, 0.08, m.brassL, 0, 0.22, 0.01, plate); K.box(1.0, 0.05, 0.08, m.brassL, 0, -0.22, 0.01, plate);
      const cg = K.group(dg, cx, 0.72, cz); cg.rotation.y = -a + Math.PI / 2;
      for (let i = 0; i < 4; i++) { const tx = digitTex.clone(); tx.needsUpdate = true; tx.repeat.set(0.1, 1); tx.offset.x = 0; const piv = dyn(K.group(cg, -0.33 + i * 0.22, 0, 0.05)); const mt = K.mat(0xffffff, { map: tx, e: 0x2a2010 }); K.box(0.18, 0.28, 0.03, mt, 0, 0, 0, piv).castShadow = false; digits.push({ piv, tx, d: 0, flip: 0 }); }
    }
    let prCount = 0;
    function setCounter(n) { const s = String(n % 10000).padStart(4, '0'); digits.forEach((dg2, i) => { const d = +s[i]; if (d !== dg2.d) { dg2.d = d; dg2.flip = 1; } }); }

    // INTAKE CUP with a hinged lid, glass pipe into the riser base
    const CUP = new V3(-1.6, 1.08, 0.15);
    {
      K.lathe([[0.18, 0], [0.33, 0.28], [0.36, 0.34]], m.brass, 14, CUP.x, 1.0, CUP.z, st);
      K.cyl(0.19, 0.22, 0.6, m.ironM, 12, CUP.x, 0.7, CUP.z, st);
      K.torus(0.36, 0.035, m.brassL, 4, 18, CUP.x, 1.34, CUP.z, st).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) K.box(0.06, 0.5, 0.06, m.iron, CUP.x + Math.cos(i * 2.1) * 0.24, 0.65, CUP.z + Math.sin(i * 2.1) * 0.24, st);
      const pipe = K.tube([[CUP.x, 1.25, CUP.z], [-1.38, 1.25, -0.5], [D.x, 1.25, D.z]], 0.27, m.glassR, st, 12, 10); pipe.castShadow = false;
      for (const k of [0.2, 0.55]) K.torus(0.28, 0.035, m.brassL, 4, 14, lerp(CUP.x, D.x, k), 1.25, lerp(CUP.z, D.z, k), st).lookAt(D.x * 2 - CUP.x, 1.25, D.z * 2 - CUP.z);
      K.box(0.5, 0.12, 0.3, m.ironM, -1.6, 0.98, -0.2, st);
    }
    const lidPiv = dyn(K.group(dg, CUP.x - 0.34, 1.36, CUP.z)); const lidR = rigid(lidPiv);
    K.cyl(0.35, 0.35, 0.05, m.brassD, 14, 0.34, 0.02, 0, lidR); K.box(0.08, 0.06, 0.08, m.brassL, 0.62, 0.06, 0, lidR);
    for (let i = 0; i < 3; i++) K.box(0.5, 0.02, 0.03, m.brass, 0.34, 0.05, -0.15 + i * 0.15, lidR);

    // =================================================================
    // COPPER BOILER
    // =================================================================
    const BO = new V3(1.35, 0.39, -1.35);
    K.cyl(0.75, 0.8, 2.5, m.copper, 16, BO.x, BO.y + 1.25, BO.z, st);
    for (const y of [0.25, 0.9, 1.6, 2.3]) { band(st, BO.x, BO.z, 0.81, BO.y + y, m.brassD, 0.1); rivetRing(st, BO.x, BO.z, 0.82, BO.y + y + 0.08, 12); }
    K.lathe([[0.77, 0], [0.7, 0.25], [0.45, 0.45], [0.12, 0.55]], m.copperD, 14, BO.x, BO.y + 2.5, BO.z, st);
    K.cyl(0.12, 0.12, 1.1, m.soot, 8, BO.x, BO.y + 3.2, BO.z, st); K.cyl(0.18, 0.12, 0.2, m.brassD, 8, BO.x, BO.y + 3.75, BO.z, st);
    K.box(0.62, 0.54, 0.06, m.iron, BO.x, BO.y + 0.45, BO.z + 0.78, st);
    for (let i = 0; i < 4; i++) K.box(0.04, 0.42, 0.1, m.soot, BO.x - 0.18 + i * 0.12, BO.y + 0.45, BO.z + 0.83, st);
    const fireM = lamp(K.glow(0xffa040));
    K.box(0.5, 0.42, 0.04, fireM, BO.x, BO.y + 0.45, BO.z + 0.8, dg);
    K.box(0.4, 0.22, 0.3, m.ironM, BO.x - 0.2, 0.52, BO.z + 1.3, st);
    for (let i = 0; i < 6; i++) K.rock(0.07, m.soot, BO.x - 0.32 + (i % 3) * 0.12, 0.66, BO.z + 1.25 + Math.floor(i / 3) * 0.1, st);
    // needles: 0 engine vacuum, 1 punch load, 2 arm load, 3 boiler heat, 4 tube pressure
    const needles = [gauge(BO.x - 0.33, BO.y + 1.85, BO.z + 0.74, 0.2, 0.25), gauge(BO.x + 0.3, BO.y + 1.85, BO.z + 0.74, 0.2, -0.1), gauge(BO.x + 0.0, BO.y + 1.3, BO.z + 0.8, 0.16, 0), gauge(BO.x + 0.8, BO.y + 1.6, BO.z + 0.05, 0.18, Math.PI / 2), gauge(BO.x + 0.74, BO.y + 2.15, BO.z + 0.33, 0.13, 1.2)];
    K.cyl(0.07, 0.07, 0.4, m.brass, 8, BO.x + 0.4, BO.y + 2.9, BO.z + 0.3, st); K.cyl(0.1, 0.06, 0.3, m.brassL, 8, BO.x + 0.4, BO.y + 3.2, BO.z + 0.3, st);
    const alarmM = lamp(K.mat(0x401010, { e: 0 }));
    K.sph(0.16, alarmM, BO.x - 0.4, BO.y + 2.97, BO.z + 0.42, dg, 8, 6);
    K.cyl(0.1, 0.13, 0.08, m.brassD, 8, BO.x - 0.4, BO.y + 2.82, BO.z + 0.42, st);
    K.tube([[BO.x - 0.6, 2.3, BO.z - 0.1], [0.2, 2.6, -1.7], [-0.4, 2.55, -1.75], [-0.6, 1.4, -1.6], [-0.4, 1.0, -1.2]], 0.07, m.copper, st, 22, 6);
    K.tube([[BO.x - 0.7, 0.9, BO.z + 0.5], [0.2, 0.7, -0.3], [-0.2, 0.62, -0.25]], 0.06, m.verd, st, 16, 5);
    K.torus(0.16, 0.03, K.mat(0xa02a18), 4, 12, 0.2, 2.62, -1.7, st).rotation.x = Math.PI / 2;

    // =================================================================
    // CARD PUNCH: open front so the stack stays in view; dark hopper; flywheel-driven ram
    // =================================================================
    const PM = { x0: -2.3, x1: -0.4, z0: 1.0, z1: 1.9, cz: 1.45, bed: 1.2, xIn: -0.65, xPunch: -1.35, xOut: -2.03 };
    K.box(PM.x1 - PM.x0, 0.55, PM.z1 - PM.z0, m.iron, (PM.x0 + PM.x1) / 2, 0.68, PM.cz, st);
    K.box(PM.x1 - PM.x0 + 0.08, 0.06, PM.z1 - PM.z0 + 0.08, m.brass, (PM.x0 + PM.x1) / 2, 0.98, PM.cz, st);
    K.box(PM.x1 - PM.x0 - 0.1, 0.1, 0.55, m.soot, (PM.x0 + PM.x1) / 2, 1.07, PM.cz, st);
    for (const z of [PM.cz - 0.2, PM.cz + 0.2]) K.box(PM.x1 - PM.x0 - 0.05, 0.05, 0.05, m.steel, (PM.x0 + PM.x1) / 2, 1.15, z, st);
    for (let i = 0; i < 8; i++) K.box(0.06, 0.06, 0.06, m.brassL, PM.x0 + 0.12 + i * 0.24, 0.92, PM.z1 + 0.02, st);
    for (const x of [PM.x1 - 0.05, PM.x0 + 0.05]) K.box(0.08, 0.14, 0.66, m.brassD, x, 1.19, PM.cz, st);
    // back plate solid, FRONT open: two slim posts only
    K.box(0.5, 1.4, 0.1, m.ironM, PM.xPunch, 1.65, PM.z0 + 0.05, st);
    for (const x of [-0.22, 0.22]) K.box(0.08, 1.4, 0.1, m.ironM, PM.xPunch + x, 1.65, PM.z1 - 0.05, st);
    K.box(0.56, 0.08, 0.14, m.brass, PM.xPunch, 2.38, PM.z0 + 0.05, st); K.box(0.56, 0.08, 0.14, m.brass, PM.xPunch, 2.38, PM.z1 - 0.05, st);
    K.box(0.6, 0.16, 0.98, m.ironL, PM.xPunch, 2.45, PM.cz, st);
    for (const z of [PM.cz - 0.2, PM.cz + 0.2]) K.cyl(0.035, 0.035, 0.75, m.steel, 6, PM.xPunch, 2.05, z, st);
    K.box(0.62, 0.36, 0.5, m.ironM, PM.xPunch, 2.71, PM.cz, st);
    for (let i = 0; i < 5; i++) K.box(0.5, 0.03, 0.4, i % 2 ? m.paper : m.paperD, PM.xPunch, 2.92 + i * 0.035, PM.cz, st);
    K.box(0.66, 0.05, 0.54, m.brassD, PM.xPunch, 2.55, PM.cz, st);
    const tick = []; for (let i = 0; i < 6; i++) { const lm = lamp(K.mat(0x2a1a10, { e: 0 })); K.box(0.13, 0.1, 0.03, lm, PM.x0 + 0.25 + i * 0.28, 0.72, PM.z1 + 0.02, dg); tick.push(lm); }
    const carriage = dyn(rigid(dg, PM.xIn, PM.bed, PM.cz));
    K.box(0.56, 0.04, 0.5, m.steel, 0, -0.02, 0, carriage); K.box(0.06, 0.08, 0.5, m.ironL, 0.27, 0.02, 0, carriage); K.box(0.06, 0.08, 0.5, m.ironL, -0.27, 0.02, 0, carriage);
    const carAnchor = K.group(carriage, 0, 0.02, 0);
    const ram = dyn(rigid(dg, PM.xPunch, 2.1, PM.cz));
    K.box(0.42, 0.26, 0.5, m.armIronL, 0, 0, 0, ram); K.box(0.44, 0.06, 0.52, m.hazard, 0, -0.1, 0, ram);
    for (let i = 0; i < 6; i++) K.box(0.04, 0.08, 0.04, m.steel, -0.15 + (i % 3) * 0.15, -0.17, -0.1 + Math.floor(i / 3) * 0.2, ram);
    K.box(0.1, 0.06, 0.12, m.brassL, 0, 0.0, 0.31, ram);
    const flyC = new V3(-0.82, 1.42, PM.z1 + 0.1), FLY_R = 0.32, PIN_R = 0.22;
    const fly = dyn(rigid(dg, flyC.x, flyC.y, flyC.z));
    { const w = K.cyl(FLY_R, FLY_R, 0.08, m.armIronL, 18, 0, 0, 0, fly); w.rotation.x = Math.PI / 2; K.torus(FLY_R, 0.04, m.brassD, 4, 20, 0, 0, 0.03, fly);
      for (let i = 0; i < 4; i++) { const s = K.box(FLY_R * 1.9, 0.05, 0.05, m.brass, 0, 0, 0.05, fly); s.rotation.z = i * Math.PI / 4; }
      K.cyl(0.05, 0.05, 0.12, m.brassL, 8, PIN_R, 0, 0.06, fly).rotation.x = Math.PI / 2; }
    K.cyl(0.06, 0.06, 0.25, m.ironM, 8, flyC.x, flyC.y, flyC.z - 0.12, st).rotation.x = Math.PI / 2;
    const conrod = dyn(K.box(1, 0.06, 0.04, m.brassD, 0, 0, 0, dg)); conrod.position.z = flyC.z + 0.12;
    K.box(0.5, 0.04, 0.08, m.soot, PM.xPunch, 0.98, PM.z1 + 0.02, st);
    { const bx = PM.xPunch, bz = 2.22; K.box(0.7, 0.05, 0.34, m.woodD, bx, 0.43, bz, st); for (const s of [-1, 1]) { K.box(0.7, 0.24, 0.04, m.wood, bx, 0.55, bz + s * 0.16, st); K.box(0.04, 0.24, 0.34, m.wood, bx + s * 0.34, 0.55, bz, st); } for (let i = 0; i < 4; i++) K.box(0.5, 0.025, 0.24, i % 2 ? m.ribbon : m.ribbonD, bx, 0.48 + i * 0.03, bz, st).rotation.y = (i - 1.5) * 0.15; }
    const ribbon = [];
    for (let i = 0; i < 8; i++) ribbon.push(dyn(K.group(dg)));
    instancer(ribbon, (t) => { K.box(0.36, 0.02, 0.26, K.mat(0xffffff), 0, 0, 0, t); for (let h = 0; h < 3; h++) K.box(0.05, 0.025, 0.05, m.ink, -0.1 + h * 0.1, 0.002, -0.05 + (h % 2) * 0.1, t); }, false, ribbon.map((_, i) => (i % 2 ? 0xb8a47c : 0x9c8862)));
    // BIG "?" card that hangs over the machine while it waits on you (readable at LINE zoom)
    const qTex = K.canvasTex(20, 20, (c) => {
      c.fillStyle = '#c8321e'; c.fillRect(0, 0, 20, 20); c.fillStyle = '#f4e2b8'; c.fillRect(2, 2, 16, 16);
      c.fillStyle = '#c8321e'; const Q = ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'];
      Q.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === '#') c.fillRect(5 + x * 2, 4 + y * 2, 2, 2); }));
    });
    const qCard = dyn(K.group(dg, -1.1, 5.3, 1.1)); const qm = K.mat(0xffffff, { map: qTex, e: 0x5a2010 });
    const qBox = K.box(1.05, 1.05, 0.05, qm, 0, 0, 0, qCard); qBox.rotation.y = Math.PI / 4;
    const qHalo = K.sph(0.9, K.glow(0xff3020, 0.25, true), 0, 0, 0, qCard, 12, 8); qHalo.castShadow = false;
    qCard.visible = false;

    // =================================================================
    // ARM A: dark iron segments, brass joints, steel fingers with hazard pads; IK
    // =================================================================
    function buildArm(px, pz, L1, L2) {
      K.cyl(0.38, 0.45, 0.32, m.ironM, 12, px, 0.56, pz, st); band(st, px, pz, 0.42, 0.72, m.brass, 0.06); rivetRing(st, px, pz, 0.44, 0.5, 12);
      K.tube([[px + 0.3, 0.45, pz - 0.2], [px + 0.7, 0.42, pz - 0.6], [px + 0.9, 0.42, pz - 1.4]], 0.04, m.soot, st, 10, 4);
      const yawG = dyn(K.group(dg, px, 0.75, pz)); const yR = rigid(yawG);
      K.cyl(0.3, 0.32, 0.16, m.brass, 12, 0, 0.08, 0, yR); K.box(0.36, 0.3, 0.34, m.armIronL, 0, 0.3, 0, yR); K.box(0.38, 0.05, 0.36, m.brassD, 0, 0.46, 0, yR);
      const sh = dyn(K.group(yawG, 0, 0.42, 0)); const sR = rigid(sh);
      K.sph(0.16, m.brass, 0, 0, 0, sR, 10, 8); gear(sR, 0.17, 0.06, 10, m.brassL, 0, 0, 0.17).rotation.x = Math.PI / 2;
      K.box(L1, 0.15, 0.15, m.armIron, L1 / 2, 0, 0, sR);
      K.box(L1 * 0.72, 0.05, 0.05, m.steel, L1 * 0.46, 0.12, 0.07, sR); K.box(L1 * 0.4, 0.08, 0.08, m.armIronL, L1 * 0.28, 0.12, 0.07, sR);
      for (let i = 0; i < 4; i++) K.box(0.05, 0.17, 0.17, m.brassD, 0.15 + i * L1 * 0.24, 0, 0, sR);
      const el = dyn(K.group(sh, L1, 0, 0)); const eR = rigid(el);
      K.sph(0.13, m.brass, 0, 0, 0, eR, 10, 8); gear(eR, 0.13, 0.05, 8, m.brassL, 0, 0, -0.14).rotation.x = Math.PI / 2;
      K.box(L2, 0.12, 0.12, m.armIron, L2 / 2, 0, 0, eR); K.box(L2 * 0.6, 0.045, 0.045, m.copper, L2 * 0.45, -0.09, 0.05, eR);
      const wr = dyn(K.group(el, L2, 0, 0)); const wR = rigid(wr);
      const wc = K.cyl(0.085, 0.085, 0.18, m.brass, 10, 0, 0, 0, wR); wc.rotation.x = Math.PI / 2;
      K.box(0.26, 0.07, 0.18, m.armIronL, 0, -0.1, 0, wR); K.box(0.1, 0.06, 0.1, m.brassL, 0, -0.03, 0, wR);
      const f1 = dyn(K.group(wr, -0.2, -0.12, 0)), f2 = dyn(K.group(wr, 0.2, -0.12, 0)); f2.rotation.y = Math.PI; // one finger shape, turned for the right
      instancer([f1, f2], (t) => { K.box(0.05, 0.3, 0.14, m.steel, 0, -0.14, 0, t); K.box(0.08, 0.07, 0.14, m.hazard, 0.02, -0.28, 0, t); }, true);
      const anchor = K.group(wr, 0, -0.3, 0);
      return { yawG, sh, el, wr, f1, f2, anchor, S: new V3(px, 0.75 + 0.42, pz), L1, L2 };
    }
    function solveArm(A, W, grip) {
      const dx = W.x - A.S.x, dz = W.z - A.S.z, dy = W.y - A.S.y;
      const r = Math.max(0.05, Math.hypot(dx, dz));
      A.yawG.rotation.y = Math.atan2(-dz, dx);
      const Dd = Math.max(Math.abs(A.L1 - A.L2) + 0.02, Math.min(A.L1 + A.L2 - 0.01, Math.hypot(r, dy)));
      const c2 = (Dd * Dd - A.L1 * A.L1 - A.L2 * A.L2) / (2 * A.L1 * A.L2);
      const q2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
      const q1 = Math.atan2(dy, r) + Math.atan2(A.L2 * Math.sin(-q2), A.L1 + A.L2 * Math.cos(q2));
      A.sh.rotation.z = q1; A.el.rotation.z = q2; A.wr.rotation.z = -(q1 + q2);
      const sp = lerp(0.29, 0.21, grip); A.f1.position.x = -sp; A.f2.position.x = sp;
    }
    const ARM = buildArm(0.55, 1.85, 0.95, 0.85);
    const W_PARK = new V3(0.35, 2.2, 1.45), W_FOLD = new V3(0.62, 1.62, 1.55);
    const W_TRAY_UP = new V3(TRAY.x, 2.05, TRAY.z), W_TRAY = new V3(TRAY.x, 1.0 + 0.2 + 0.3, TRAY.z);
    const W_PM_UP = new V3(PM.xIn, 2.2, PM.cz), W_PM = new V3(PM.xIn, PM.bed + 0.02 + 0.2 + 0.3, PM.cz);
    const parkW = W_FOLD.clone();
    function along(pts, k) { const n = pts.length - 1; const f = Math.min(n - 1e-6, Math.max(0, k * n)); const i = Math.floor(f); return v.copy(pts[i]).lerp(pts[i + 1], sm(f - i)); }

    // =================================================================
    // GANTRY CLAW: hazard-yellow head, oxide-red trolley, steel rod; sways as it travels
    // =================================================================
    const GP = new V3(-2.3, 0, 2.25), GU = new V3(0.7, 0, -2.1).normalize(), BEAM_Y = 3.05;
    const S_OUT = 0.84, S_CUP = 2.21;
    K.box(0.2, BEAM_Y - 0.4, 0.2, m.iron, GP.x, (BEAM_Y + 0.4) / 2, GP.z, st); K.box(0.36, 0.1, 0.36, m.brassD, GP.x, 0.45, GP.z, st);
    for (const y of [1.2, 2.2]) K.box(0.24, 0.07, 0.24, m.brass, GP.x, y, GP.z, st);
    const beam = K.group(st, GP.x, BEAM_Y, GP.z); beam.rotation.y = Math.atan2(-GU.z, GU.x);
    K.box(2.75, 0.06, 0.24, m.ironL, 1.15, 0.12, 0, beam); K.box(2.75, 0.06, 0.24, m.ironL, 1.15, -0.12, 0, beam); K.box(2.75, 0.2, 0.05, m.iron, 1.15, 0, 0, beam);
    hazardBand(beam, 2.6, 1.15, 0.0, 0.13, 13, false);
    K.box(0.06, 0.32, 0.3, m.brassD, 2.52, 0, 0, beam);
    const strut = K.box(0.08, 0.08, 1.3, m.ironM, 0.5, -0.32, 0, beam); strut.rotation.set(0, Math.PI / 2, 0.55);
    const trolley = dyn(K.group(dg)); trolley.rotation.y = Math.atan2(-GU.z, GU.x);
    { const tb = rigid(trolley); K.box(0.42, 0.16, 0.36, m.paintD, 0, 0, 0, tb); for (const sx of [-0.14, 0.14]) for (const sz of [-0.15, 0.15]) { const wh = K.cyl(0.06, 0.06, 0.04, m.steel, 8, sx, 0.12, sz, tb); wh.rotation.x = Math.PI / 2; } K.box(0.18, 0.4, 0.18, m.paintD, 0, -0.26, 0, tb); K.box(0.2, 0.06, 0.2, m.hazard, 0, -0.44, 0, tb); }
    const rod = dyn(K.group(trolley)); K.cyl(0.05, 0.05, 1, m.steel, 6, 0, 0, 0, rod); K.cyl(0.025, 0.025, 1, m.soot, 4, 0.1, 0, 0.08, rod); // rod + air hose stretch together
    const head = dyn(K.group(trolley)); const hR = rigid(head);
    K.cyl(0.15, 0.18, 0.16, m.paint, 10, 0, 0, 0, hR); K.cyl(0.06, 0.06, 0.08, m.brassL, 8, 0, 0.11, 0, hR);
    for (let i = 0; i < 6; i++) K.box(0.05, 0.17, 0.02, i % 2 ? m.soot : m.paint, Math.cos(i) * 0.17, 0, Math.sin(i) * 0.17, hR).rotation.y = -i;
    const clawF = [];
    for (let i = 0; i < 3; i++) { const fg = K.group(head); fg.rotation.y = i * Math.PI * 2 / 3; clawF.push(dyn(K.group(fg, 0, -0.06, 0.12))); }
    instancer(clawF, (t) => { K.box(0.06, 0.32, 0.05, m.paint, 0, -0.16, 0, t); K.box(0.07, 0.06, 0.09, m.soot, 0, -0.31, -0.03, t); }, true);
    const clawAnchor = K.group(head, 0, -0.32, 0);
    let swayV = 0, swayA = 0, lastS = S_OUT, lastVel = 0;
    function placeClaw(s, headY, grip, dt) {
      trolley.position.set(GP.x + GU.x * s, BEAM_Y - 0.25, GP.z + GU.z * s);
      const ext = Math.max(0.3, (BEAM_Y - 0.25) - headY);
      rod.scale.y = ext; rod.position.y = -ext / 2;
      // pendulum sway driven by trolley acceleration
      if (dt > 0) { const vel = (s - lastS) / dt; swayV += (-swayA * 30 - swayV * 4) * dt - (vel - lastVel) * 0.9; swayA += swayV * dt; lastVel = vel; swayA = Math.max(-0.4, Math.min(0.4, swayA)); }
      lastS = s;
      head.position.set(Math.sin(swayA) * ext * 0.25, -ext, 0); head.rotation.z = -swayA * 0.6;
      clawF.forEach((f) => (f.rotation.x = lerp(-0.55, -0.08, grip)));
    }

    // =================================================================
    // HARNESS NAMEPLATE: a marquee board standing on the gantry beam, facing the camera, the agent's name lit in
    // its accent color, a pilot lamp at each end (dim idle, lit working, amber/red blinking when blocked). It sits
    // toward the machine's middle so a phone's narrow station view still shows it.
    // =================================================================
    const plate = K.group(st, GP.x + GU.x * 1.55, BEAM_Y + 0.52, GP.z + GU.z * 1.55); plate.rotation.order = 'YXZ'; plate.rotation.y = Math.PI / 4; plate.rotation.x = -0.16;
    // two assemblers on the same harness are numbered left to right (the planner names them the same way)
    const SAME = ((IRON.layout && IRON.layout.assemblers) || []).filter((a) => (a.def && a.def.harness) === M.harness).sort((a, b) => a.x - b.x);
    const plateName = SAME.length > 1 ? HN.name + ' ' + (SAME.findIndex((a) => a.id === M.id) + 1) : HN.name;
    const NT = textTex(plateName, hex(HN.col), hex(HN.dim));
    const PH = 0.34, PW = PH * NT.aspect;
    const nameM = new THREE.MeshBasicMaterial({ map: NT.tex, color: 0xffffff, fog: false });
    K.box(PW + 0.16, PH + 0.16, 0.07, m.ironM, 0, 0, -0.04, plate);
    K.mesh(new THREE.PlaneGeometry(PW, PH), nameM, 0, 0, 0.0, plate).castShadow = false;
    for (const sy of [-1, 1]) K.box(PW + 0.24, 0.05, 0.1, m.brass, 0, sy * (PH / 2 + 0.07), -0.01, plate);
    for (const sx of [-1, 1]) { K.box(0.05, PH + 0.18, 0.1, m.brassD, sx * (PW / 2 + 0.1), 0, -0.01, plate); for (const sy of [-1, 1]) K.box(0.05, 0.05, 0.05, m.brassL, sx * (PW / 2 + 0.1), sy * (PH / 2 + 0.07), 0.05, plate); }
    // two posts down onto the beam + a brass cap on the gantry post
    for (const sx of [-0.25, 0.25]) K.box(0.06, 0.2, 0.06, m.iron, sx, -PH / 2 - 0.16, -0.03, plate);
    K.box(0.3, 0.05, 0.3, m.brass, GP.x, BEAM_Y + 0.16, GP.z, st);
    const pilotM = [-1, 1].map(() => lamp(K.mat(HN.dim, { e: 0 })));
    pilotM.forEach((pm, i) => { const sx = i ? 1 : -1; K.cyl(0.07, 0.08, 0.05, m.brassD, 8, sx * (PW / 2 + 0.22), -0.08, 0.0, plate); K.sph(0.075, pm, sx * (PW / 2 + 0.22), 0.0, 0.0, plate, 8, 6); });

    // =================================================================
    // front-right bench, CAUTION + STATUS LAMP, aether socket, work light
    // =================================================================
    { const bx = 1.7, bz = 0.55;
      K.box(1.1, 0.08, 0.6, m.wood, bx, 1.08, bz, st); K.box(1.14, 0.04, 0.64, m.brassD, bx, 1.13, bz, st);
      for (const sx of [-0.48, 0.48]) for (const sz of [-0.24, 0.24]) K.box(0.08, 0.68, 0.08, m.iron, bx + sx, 0.72, bz + sz, st);
      K.box(0.9, 0.05, 0.45, m.woodD, bx, 0.6, bz, st);
      for (let i = 0; i < 3; i++) { const c = K.cyl(0.11, 0.11, 0.36, m.brassD, 10, bx - 0.3 + i * 0.25, 1.26, bz - 0.1, st); c.rotation.z = Math.PI / 2; }
      K.box(0.26, 0.18, 0.2, m.ironL, bx + 0.35, 1.22, bz + 0.12, st);
      K.cyl(0.08, 0.1, 0.22, m.verd, 8, bx - 0.4, 1.23, bz + 0.15, st); K.cyl(0.015, 0.03, 0.2, m.brass, 4, bx - 0.36, 1.4, bz + 0.15, st);
      for (let i = 0; i < 3; i++) K.box(0.4, 0.3, 0.4, m.woodD, 2.0 + (i % 2) * 0.05, 0.56 + i * 0.3, -0.25, st).rotation.y = i * 0.25; }
    const caution = K.caution(dg, 2.15, 0.4, 2.15, 1.0);
    const statLamp = K.statusLamp(dg, 1.3, 0.4, 2.22, 1.25);
    // aether socket (the power feed) on the plinth's back edge, a glowing glass pipe into the engine drum
    const SOCK = new V3(0.35, 0.65, -2.1);
    K.box(0.62, 0.5, 0.5, m.ironM, SOCK.x, SOCK.y, SOCK.z, st); K.box(0.66, 0.06, 0.54, m.brass, SOCK.x, SOCK.y + 0.27, SOCK.z, st);
    for (const sx of [-0.25, 0.25]) K.box(0.08, 0.06, 0.56, m.iron, SOCK.x + sx, SOCK.y - 0.22, SOCK.z, st);
    const sockM = lamp(K.glow(0x7af0d8));
    K.box(0.3, 0.16, 0.02, sockM, SOCK.x, SOCK.y + 0.06, SOCK.z + 0.26, dg);
    const SPTS = [[SOCK.x - 0.1, SOCK.y + 0.1, SOCK.z + 0.24], [SOCK.x - 0.45, SOCK.y + 0.12, SOCK.z + 0.32], [-0.38, 0.86, -1.95]];
    K.tube(SPTS, 0.08, m.glassR, st, 12, 8);
    const sockPipeM = lamp(K.glow(0x2a8a78));
    K.tube(SPTS, 0.045, sockPipeM, dg, 12, 6);
    for (const k of [0.3, 0.7]) { const p = new THREE.CatmullRomCurve3(SPTS.map((q) => new V3(q[0], q[1], q[2]))).getPoint(k); K.torus(0.1, 0.025, m.brassL, 4, 10, p.x, p.y, p.z, st); }
    const workL = K.light(0xffb070, 1.0, 7, -0.4, 2.6, 2.0, g);
    // the point lights are rationed: an assembler without one fakes the work light with a soft pool on the plinth
    let poolM = null, pool = null;
    if (workL.isDummy) {
      const pt = K.canvasTex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
      pt.magFilter = pt.minFilter = THREE.LinearFilter; pt.wrapS = pt.wrapT = THREE.ClampToEdgeWrapping;
      poolM = K.glow(0xffb070, 0, true); poolM.map = pt;
      pool = K.mesh(new THREE.PlaneGeometry(4.6, 4.6), poolM, -0.3, 0.43, 0.9, dg); pool.rotation.x = -Math.PI / 2; pool.castShadow = false; pool.userData.noBake = true;
    }
    // halos that ride with each held item, so the work never gets lost among the brass
    const halos = [0, 1, 2, 3].map(() => { const h = dyn(K.sph(0.5, K.glow(0xfff0c0, 0.0, true), 0, 0, 0, dg, 12, 8)); h.castShadow = false; return h; });

    // bake: the machine and every moving part -> one vertex-coloured mesh each; leftovers (glass, textures,
    // lamps) -> one mesh per material
    kitLamps(caution.g); kitLamps(statLamp.g);
    instancer(needles, (t) => K.box(0.035, 0.85, 0.02, m.ink, 0, 0.38, 0, t), false);
    vcBakeAll(g, new Set());
    K.bake(st);
    bakes.forEach((b) => K.bake(b));

    // =================================================================
    // THE LINE INSIDE THE MACHINE
    // =================================================================
    const ARMS = { ph: 'park', t: 0, item: null };
    const PMS = { ph: 'empty', t: 0, item: null, decided: false, reserved: false, transformed: false, flyA: 0 };
    const CLAW = { ph: 'park', t: 0, item: null };
    const ENG = { ph: 'empty', t: 0, item: null, reserved: false, turned: false, y0: 0 };
    const AMBIG = ['which checkout flow?', 'repro steps missing', 'two specs disagree', 'needs a product call', 'which API version?', 'fix or redesign?'];
    const ROT_FLAT = -Math.PI / 4;
    const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ROT_FLAT, 0));
    let gripA = 0, clawGrip = 0, lidOpen = 0, clawS = S_OUT, clawY = 2.45, speedG = 0, ribbonOff = 0, tTick = 0, tPuff = 0, tSpark = 0, tDrip = 0, compile = 0;
    let lightK = 0, idleT = 0, punchKick = 0, tubeKick = 0, wasWaiting = false, tBubble = 0, sweepT = 0, lastPR = '';
    const engAnchor = dyn(K.group(dg));
    const D_RISE0 = 1.05, D_HOLD = 2.15, D_TOP = 3.55, D_EXIT = 4.42, MIN_BREW = 0.7;
    // make the bound card stack the brightest cream thing on the line, ribbon glowing in the source color
    function boost(it) {
      if (it._asmBoost) return; it._asmBoost = true;
      it.parts.cards.children.forEach((c) => { const mt = c.material; if (!mt || !mt.emissive) return; const hx = mt.color.getHex(); if (hx === 0xe8d6a8 || hx === 0xd8c290) mt.emissive.setHex(0x5a4a30); else if (mt.emissiveIntensity !== undefined && mt.emissive.getHex() !== 0) mt.emissiveIntensity = 1.2; });
    }
    function anchorPos(obj, out) { obj.getWorldPosition(out); return g.worldToLocal(out); }

    function stepArm(dt) {
      const A = ARMS; A.t += dt;
      // a held item turns flat in the gripper (no snap when it comes off the belt at an angle)
      if (A.item && dt > 0) A.item.mesh.quaternion.slerp(qFlat, 1 - Math.exp(-dt * 9));
      if (A.ph === 'park') {
        // ready pose while work flows, folds down low after a moment of idling
        parkW.lerp(idleT > 0.8 ? W_FOLD : W_PARK, Math.min(1, dt * 2.5));
        gripA = Math.max(0, gripA - dt * 4); solveArm(ARM, parkW, gripA);
        if (M.waiting('in') && PMS.ph === 'empty' && !PMS.reserved) { A.ph = 'reach'; A.t = 0; PMS.reserved = true; A.from = parkW.clone(); }
        return;
      }
      if (A.ph === 'reach') { const k = cl(A.t / 0.95); gripA = Math.max(0, gripA - dt * 5); solveArm(ARM, along([A.from, W_TRAY_UP, W_TRAY], k), gripA); if (k >= 1) { A.ph = 'grip'; A.t = 0; } return; }
      if (A.ph === 'grip') {
        if (!A.item) { const it = M.take('in'); if (!it) { A.ph = 'back'; A.t = 0; A.from = W_TRAY; PMS.reserved = false; return; } A.item = it; boost(it); it.follow(ARM.anchor, 0, -0.2, 0); sparks(TRAY.x, 1.25, TRAY.z, 5); }
        gripA = cl(A.t / 0.25); solveArm(ARM, W_TRAY, gripA); if (A.t >= 0.3) { A.ph = 'carry'; A.t = 0; } return;
      }
      if (A.ph === 'carry') { const k = cl(A.t / 1.05); solveArm(ARM, along([W_TRAY, W_TRAY_UP, W_PM_UP, W_PM], k), 1); if (k >= 1) { A.ph = 'release'; A.t = 0; } return; }
      if (A.ph === 'release') {
        gripA = 1 - cl(A.t / 0.25); solveArm(ARM, W_PM, gripA);
        if (A.item && A.t >= 0.12) { const it = A.item; it.follow(carAnchor, 0, 0, 0); it.mesh.quaternion.copy(qFlat); PMS.item = it; PMS.ph = 'loaded'; PMS.t = 0; PMS.decided = false; PMS.transformed = false; A.item = null; dust(PM.xIn, PM.bed + 0.05, PM.cz, 7); pulse(PM.xIn, PM.bed + 0.1, PM.cz, 0xfff0c0); }
        if (A.t >= 0.3) { A.ph = 'back'; A.t = 0; A.from = W_PM; } return;
      }
      if (A.ph === 'back') { const k = cl(A.t / 0.7); solveArm(ARM, along([A.from || W_PM, A.from === W_TRAY ? W_TRAY_UP : W_PM_UP, W_PARK], k), 0); if (k >= 1) { A.ph = 'park'; A.t = 0; parkW.copy(W_PARK); } }
    }
    function strike() {
      sparks(PM.xPunch, 1.55, PM.cz, 8);
      for (let i = 0; i < 5; i++) K.spawn(g, PM.xPunch + K.R() * 0.3, 1.5, PM.cz + 0.3, K.R() * 1.2, 0.8 + Math.random(), 0.6 + Math.random() * 0.8, Math.random() < 0.5 ? 0xf0dfb4 : 0xffffff, 0.9, 0.04, 3.5);
      punchKick = 1;
    }
    function stepPM(dt) {
      const P = PMS; P.t += dt;
      let flySpeed = 0;
      if (P.ph === 'empty' || P.ph === 'loaded') carriage.position.x = PM.xIn;
      if (P.ph === 'loaded') { if (ARMS.ph === 'back' && ARMS.t > 0.1) { P.ph = 'feed'; P.t = 0; } }
      else if (P.ph === 'feed') { const k = cl(P.t / 0.6); carriage.position.x = lerp(PM.xIn, PM.xPunch, sm(k)); flySpeed = 4; if (k >= 1) { P.ph = 'punch'; P.t = 0; } }
      else if (P.ph === 'punch') {
        carriage.position.x = PM.xPunch; flySpeed = 4 * Math.PI * 2 / 1.5;
        ribbonOff = (ribbonOff + dt * 1.1) % 1;
        // issues AND reworked PRs (red capsules back from the checks) are punched into a fresh card stack
        if (!P.transformed && P.t > 1.25) { P.transformed = true; P.item.setKind('cards'); boost(P.item); for (let i = 0; i < 10; i++) K.spawn(g, PM.xPunch + K.R() * 0.5, 1.5, PM.cz + K.R() * 0.5, K.R() * 1.5, 1 + Math.random(), K.R() * 1.5, 0xf0dfb4, 0.8, 0.05, 3); }
        if (P.t >= 1.5) {
          if (!P.decided) { P.decided = true; const it = P.item; if (M.maybeDecision('#' + it.num + ' unclear: ' + AMBIG[it.num % AMBIG.length])) return; }
          P.ph = 'eject'; P.t = 0;
        }
      }
      else if (P.ph === 'eject') { const k = cl(P.t / 0.5); carriage.position.x = lerp(PM.xPunch, PM.xOut, sm(k)); flySpeed = 1.5; if (k >= 1) { P.ph = 'ready'; P.t = 0; dust(PM.xOut, PM.bed + 0.05, PM.cz, 4); } }
      else if (P.ph === 'ready') carriage.position.x = PM.xOut;
      else if (P.ph === 'return') { const k = cl(P.t / 0.45); carriage.position.x = lerp(PM.xOut, PM.xIn, sm(k)); if (k >= 1) { P.ph = 'empty'; P.t = 0; P.reserved = false; } }
      const prev = P.flyA; P.flyA += dt * flySpeed; const ph = P.flyA; fly.rotation.z = ph;
      ram.position.y = P.ph === 'punch' ? 2.145 - 0.38 * (0.5 - 0.5 * Math.cos(ph)) : ram.position.y + (2.12 - ram.position.y) * Math.min(1, dt * 6);
      if (P.ph === 'punch' && Math.floor((prev - Math.PI) / (Math.PI * 2)) !== Math.floor((ph - Math.PI) / (Math.PI * 2))) strike();
      K.link(conrod, flyC.x + Math.cos(ph) * PIN_R, flyC.y + Math.sin(ph) * PIN_R, PM.xPunch + 0.08, ram.position.y + 0.02);
    }
    function stepClaw(dt) {
      const Cl = CLAW; Cl.t += dt;
      const UP = 2.45, AT_OUT = PM.bed + 0.02 + 0.17 + 0.32, AT_CUP = CUP.y + 0.17 + 0.32;
      if (Cl.ph === 'park') { clawS += (S_OUT - clawS) * Math.min(1, dt * 4); clawY += (UP - clawY) * Math.min(1, dt * 4); clawGrip = Math.max(0, clawGrip - dt * 4);
        if (PMS.ph === 'ready' && ENG.ph === 'empty' && !ENG.reserved) { Cl.ph = 'down'; Cl.t = 0; ENG.reserved = true; } }
      else if (Cl.ph === 'down') { const k = cl(Cl.t / 0.45); clawS = S_OUT; clawY = lerp(UP, AT_OUT, sm(k)); if (k >= 1) { Cl.ph = 'grip'; Cl.t = 0; } }
      else if (Cl.ph === 'grip') {
        if (!Cl.item) { Cl.item = PMS.item; PMS.item = null; PMS.ph = 'return'; PMS.t = 0; Cl.item.follow(clawAnchor, 0, -0.17, 0); pulse(PM.xOut, PM.bed + 0.15, PM.cz, 0xfff0c0); }
        clawGrip = cl(Cl.t / 0.22); if (Cl.t >= 0.28) { Cl.ph = 'up'; Cl.t = 0; } }
      else if (Cl.ph === 'up') { const k = cl(Cl.t / 0.35); clawY = lerp(AT_OUT, UP, sm(k)); if (k >= 1) { Cl.ph = 'travel'; Cl.t = 0; } }
      else if (Cl.ph === 'travel') { const k = cl(Cl.t / 0.65); clawS = lerp(S_OUT, S_CUP, sm(k)); if (k >= 1) { Cl.ph = 'lower'; Cl.t = 0; } }
      else if (Cl.ph === 'lower') { const k = cl(Cl.t / 0.35); clawS = S_CUP; clawY = lerp(UP, AT_CUP, sm(k)); if (k >= 1) { Cl.ph = 'release'; Cl.t = 0; } }
      else if (Cl.ph === 'release') {
        clawGrip = 1 - cl(Cl.t / 0.2);
        if (Cl.item && Cl.t >= 0.1) { const it = Cl.item; engAnchor.position.set(CUP.x, CUP.y, CUP.z); it.follow(engAnchor, 0, 0, 0); ENG.item = it; ENG.ph = 'load'; ENG.t = 0; ENG.turned = false; Cl.item = null; pulse(CUP.x, 1.38, CUP.z, 0xfff0c0); for (let i = 0; i < 4; i++) puff(CUP.x, 1.4, CUP.z, 0xb8b0a0, 0.1, 0.8, 0.2, 0.9); }
        if (Cl.t >= 0.24) { Cl.ph = 'retract'; Cl.t = 0; } }
      else if (Cl.ph === 'retract') { const k = cl(Cl.t / 0.3); clawY = lerp(AT_CUP, UP, sm(k)); if (k >= 1) { Cl.ph = 'return'; Cl.t = 0; if (ENG.ph === 'load') { ENG.ph = 'slide'; ENG.t = 0; } } }
      else if (Cl.ph === 'return') { const k = cl(Cl.t / 0.6); clawS = lerp(S_CUP, S_OUT, sm(k)); if (k >= 1) { Cl.ph = 'park'; Cl.t = 0; } }
      placeClaw(clawS, clawY, clawGrip, dt);
    }
    // the cards become the PR capsule as they pass y 3.0 on the way up the riser
    function turnCapsule(E) {
      E.turned = true; const it = E.item; it.setKind('capsule'); it.mesh.rotation.set(0, 0, Math.PI / 2); it.follow(engAnchor, 0.2, 0, 0);
      for (let i = 0; i < 14; i++) K.spawn(g, D.x + K.R() * 0.4, 3.2, D.z + K.R() * 0.4, K.R() * 2, Math.random() * 2, K.R() * 2, 0xffd890, 0.5, 0.05, 0, true);
    }
    function stepEngine(dt) {
      const E = ENG; E.t += dt;
      const want = E.ph === 'load' || (CLAW.ph === 'travel' && CLAW.t > 0.3) || CLAW.ph === 'lower' || CLAW.ph === 'release' ? 1 : 0;
      lidOpen += (want - lidOpen) * Math.min(1, dt * 8); lidPiv.rotation.z = lidOpen * 1.9;
      compile = Math.max(0, compile - dt * 0.6);
      if (E.ph === 'load') engAnchor.position.set(CUP.x, CUP.y, CUP.z);
      else if (E.ph === 'slide') {
        const k = cl(E.t / 0.65); engAnchor.position.set(CUP.x, CUP.y, CUP.z).lerp(v3.set(D.x, D_RISE0, D.z), sm(k)); if (E.t < 0.05 && dt > 0) dust(CUP.x, 1.2, CUP.z, 3);
        // the real work: if the agent hasn't written the PR yet, the cards hang in the vacuum and the engine brews
        if (k >= 1) { E.ph = M.ready(E.item) ? 'rise' : 'brew'; E.t = 0; }
      } else if (E.ph === 'rise') { // the mockup's cycle (the PR was ready): one smooth climb up the riser
        compile = 1;
        const k = cl(E.t / 1.35), y = lerp(D_RISE0, D_TOP, k * k * (3 - 2 * k));
        engAnchor.position.set(D.x, y, D.z);
        if (!E.turned && y > 3.0) turnCapsule(E);
        if (k >= 1) { E.ph = 'top'; E.t = 0; }
      } else if (E.ph === 'brew') { // REAL TIME: loops until the agent's PR is really done
        compile = 1;
        const k = cl(E.t / 0.8), bob = k >= 1 ? Math.sin((E.t - 0.8) * 2.1) * 0.07 : 0;
        engAnchor.position.set(D.x, lerp(D_RISE0, D_HOLD, sm(k)) + bob, D.z);
        if (dt > 0) E.item.mesh.rotateY(dt * 0.9); // the card stack turns slowly in the vacuum
        if (E.t >= MIN_BREW + 0.8 && M.ready(E.item)) { E.ph = 'rise2'; E.t = 0; E.y0 = engAnchor.position.y; }
      } else if (E.ph === 'rise2') { // done: up the rest of the riser, turning into the capsule on the way
        compile = 1;
        const k = cl(E.t / 0.95), y = lerp(E.y0, D_TOP, sm(k));
        engAnchor.position.set(D.x, y, D.z);
        if (!E.turned && y > 3.0) turnCapsule(E);
        if (k >= 1) { E.ph = 'top'; E.t = 0; }
      } else if (E.ph === 'top') {
        const k = cl(E.t / 0.35); engAnchor.position.set(D.x, lerp(D_TOP, D_EXIT, sm(k)), D.z);
        if (k >= 1 && M.give(E.item, 'out')) { lastPR = E.item.label(); E.item = null; E.ph = 'vent'; E.t = 0; tubeKick = 1; prCount++; setCounter(prCount); pulse(D.x, 4.5, D.z, 0xffb050); for (let i = 0; i < 10; i++) puff(BO.x + 0.4, BO.y + 3.4, BO.z + 0.3, 0xd8ccb8, 0.16, 2.0, 0.1, 1.2, 0.3, 0.3); }
      } else if (E.ph === 'vent') { if (E.t > 0.4) { E.ph = 'empty'; E.t = 0; E.reserved = false; } }
    }

    // chip detail: '#143 compiling the PR · next #145 punching'
    function detail() {
      const L = [];
      if (ENG.item) L.push([ENG.item, ENG.ph === 'top' && ENG.t > 0.4 ? 'tube backed up' : ENG.ph === 'brew' ? 'writing the PR' : ENG.ph === 'rise' || ENG.ph === 'rise2' || ENG.ph === 'top' ? 'compiling the PR' : 'into the engine', ENG.ph === 'brew' ? 'writing' : ENG.ph === 'rise' || ENG.ph === 'rise2' ? 'compiling' : 'engine']);
      if (CLAW.item) L.push([CLAW.item, 'claw to engine', 'on the claw']);
      if (PMS.item) L.push([PMS.item, PMS.ph === 'punch' ? 'punching cards' : PMS.ph === 'ready' || PMS.ph === 'eject' ? 'cards bound' : 'feeding the punch', PMS.ph === 'punch' ? 'punching' : PMS.ph === 'ready' || PMS.ph === 'eject' ? 'cards bound' : 'feeding']);
      if (ARMS.item) L.push([ARMS.item, 'arm picking up', 'arm grab']);
      if (!L.length && ARMS.ph === 'reach') { const w = M.waiting('in'); if (w) L.push([w, 'arm reaching', 'arm grab']); }
      if (!L.length) return ENG.ph === 'vent' && lastPR ? lastPR + ' PR sent up the tube' : 'warming up';
      const [it, long] = L[0]; let s = (it.attempts > 0 ? 'rework ' : '') + it.label() + ' ' + long;
      if (L[1]) s += ' · next ' + L[1][0].label() + ' ' + L[1][2];
      return s;
    }

    return { g, update(t, dt) {
      const blk = M.blocked;
      const run = blk ? 0 : dt;
      stepArm(run); stepPM(run); stepClaw(run); stepEngine(run);
      const busy = ARMS.ph !== 'park' || PMS.ph !== 'empty' || CLAW.ph !== 'park' || ENG.ph !== 'empty';
      if (!blk) { if (busy) M.setState('WORKING', detail()); else M.setState('IDLE', 'waiting for issues'); }
      idleT = busy || blk ? 0 : idleT + dt;
      const S = M.stateShown, work = S === 'WORKING';
      lightK += ((work ? 1 : 0) - lightK) * Math.min(1, dt * 2.5);   // lights up/down
      statLamp.set(S, t); caution.update(t, dt, S);
      const strobe = blk ? (Math.sin(t * 11) > 0 ? 1 : 0.15) : 0;
      const brewing = ENG.ph === 'brew' && !blk;
      // tray: arrival lamp, booms drop while it holds an item, little thunk on arrival
      const waiting = !!M.waiting('in');
      if (waiting && !wasWaiting) { dust(TRAY.x, 1.05, TRAY.z, 4); pulse(TRAY.x, 1.1, TRAY.z, 0xffd080); }
      wasWaiting = waiting;
      trayLampM.emissive.setHex(waiting ? (Math.sin(t * 8) > 0 ? 0xffb020 : 0x5a3a08) : 0);
      boomOpen += ((waiting ? 0 : 1) - boomOpen) * Math.min(1, dt * 7);
      boomZ.rotation.z = -boomOpen * 1.35; boomX.rotation.x = -boomOpen * 1.35;
      // gears: stopped idle, turning working, roaring compiling, frozen + shaking blocked
      const target = blk ? 0 : work ? 1.4 + compile * 3.5 : 0;
      speedG += (target - speedG) * Math.min(1, dt * 3);
      stacks.forEach((s, i) => { s.ga.rotation.y += dt * speedG * s.dir; s.gb.rotation.y -= dt * speedG * s.dir * 1.3; const j = blk ? Math.sin(t * 40 + i) * 0.03 : 0; s.ga.position.x = s.gb.position.x = D.x + Math.cos(i / 4 * Math.PI * 2 + Math.PI / 4) * 0.74 + j; });
      // dome: warm interior light working, dark idle, RED when blocked; glass tints red; it breathes while brewing
      shellM.color.setHex(blk ? 0xff2a10 : 0xffb45a);
      shellM.opacity = blk ? 0.12 + 0.22 * strobe : 0.065 * lightK + compile * 0.03 + (brewing ? 0.025 + 0.02 * Math.sin(t * 4.2) : 0);
      m.glass.color.setHex(blk ? 0xff8a70 : 0xbfe8da); m.glass.opacity = blk ? 0.32 : 0.2;
      riserGlowM.opacity = blk ? 0.08 * strobe : (0.03 + compile * 0.2 + (brewing ? 0.06 * Math.sin(t * 7) : 0)) * lightK;
      riserGlowM.color.setHex(blk ? 0xff4020 : 0xffb45a);
      // effects that have faded out stop drawing
      shell.visible = shellM.opacity > 0.004; riserGlow.visible = riserGlowM.opacity > 0.004;
      crownM.color.setHex(blk ? (strobe > 0.5 ? 0xff4020 : 0x401008) : lightK > 0.5 ? HN.lamp : HN.dim);
      const riding = ENG.ph === 'rise' || ENG.ph === 'rise2' || ENG.ph === 'top' || ENG.ph === 'slide' || ENG.ph === 'brew';
      const rideOp = riding ? 0.85 : 0;
      if (brewing) {
        // collars of light sweep up the riser past the hanging cards, over and over, while the agent works
        sweepT += dt * 0.7;
        [[collar, collarM, 0], [collar2, collar2M, 0.5]].forEach(([c, cm, o]) => { const f = (sweepT + o) % 1; c.position.y = lerp(1.12, D_TOP + 0.1, f); cm.opacity = 0.9 * Math.sin(Math.PI * f); });
      } else {
        collarM.opacity += (rideOp - collarM.opacity) * Math.min(1, dt * 8); collar2M.opacity += (rideOp - collar2M.opacity) * Math.min(1, dt * 8);
        collar.position.y = Math.max(1.1, engAnchor.position.y + 0.2); collar2.position.y = Math.max(1.1, engAnchor.position.y - 0.12 - 0.15 * Math.abs(Math.sin(t * 9)));
      }
      const colC = blk ? 0xff5030 : ENG.turned ? 0xffb050 : 0xfff0c0; collarM.color.setHex(colC); collar2M.color.setHex(colC);
      collar.visible = collarM.opacity > 0.01; collar2.visible = collar2M.opacity > 0.01;
      if (riding && !blk && (ENG.ph === 'rise' || ENG.ph === 'rise2' || brewing) && Math.random() < 0.7) K.spawn(g, D.x + K.R() * 0.4, engAnchor.position.y - 0.4, D.z + K.R() * 0.4, 0, 2.6, 0, 0xfff0c0, 0.35, 0.035, 0, true);
      // the dome bubbles while the PR is being written: slow beads rise through the oil-warm vacuum
      tBubble -= dt;
      if (brewing && tBubble <= 0) { tBubble = 0.06; const a = Math.random() * Math.PI * 2, r = 0.42 + Math.random() * 0.5; K.spawn(g, D.x + Math.cos(a) * r, 1.15, D.z + Math.sin(a) * r, K.R() * 0.08, 0.5 + Math.random() * 0.45, K.R() * 0.08, Math.random() < 0.6 ? 0xffd890 : 0xfff4d8, 2.4, 0.035 + Math.random() * 0.025, -0.06, true); }
      // gauges tied to the cycle
      punchKick = Math.max(0, punchKick - dt * 3); tubeKick = Math.max(0, tubeKick - dt * 1.5);
      const tgt = blk ? [-1.25, -1.2, -1.25, -1.15, -1.2] : [
        0.9 - lightK * 0.5 - compile * 1.2, 0.9 - lightK * 0.4 - punchKick * 1.3, ARMS.item || CLAW.item ? -0.35 : 0.9 - lightK * 0.4,
        0.95 - lightK * 1.0, 0.9 - lightK * 0.3 - tubeKick * 1.6];
      needles.forEach((n, i) => { n.rotation.z += (tgt[i] + (blk ? Math.sin(t * 34 + i) * 0.07 : work ? Math.sin(t * 2.3 + i) * 0.05 : 0) - n.rotation.z) * Math.min(1, dt * 8); });
      digits.forEach((dd) => { if (dd.flip > 0) { dd.flip = Math.max(0, dd.flip - dt * 4); dd.piv.rotation.x = Math.sin(dd.flip * Math.PI) * 1.4; if (dd.flip < 0.5) dd.tx.offset.x = dd.d / 10; } });
      // firebox: banked idle, roaring working, deep red blocked
      const ff = 0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 6.1) * 0.07;
      if (blk) fireM.color.setRGB(0.9 * ff, 0.12, 0.05); else fireM.color.setRGB(lerp(0.32, 1, lightK) * ff, lerp(0.07, 0.58, lightK) * ff, lerp(0.02, 0.2, lightK) * ff);
      alarmM.emissive.setHex(blk && strobe > 0.5 ? 0xff2a10 : 0);
      sockM.color.setHex(blk ? (strobe > 0.5 ? 0xff5030 : 0x401008) : lightK > 0.5 ? 0x9afff0 : 0x1a3a34);
      const sp = 0.5 + 0.5 * Math.sin(t * 5);
      if (blk) sockPipeM.color.setRGB(0.6 * strobe, 0.1, 0.06); else sockPipeM.color.setRGB(lerp(0.05, 0.16 + 0.12 * sp, lightK), lerp(0.18, 0.75 + 0.12 * sp, lightK), lerp(0.16, 0.66, lightK));
      if (!workL.isDummy) { workL.intensity = blk ? 3.2 * strobe : 1.1 * lightK; workL.distance = blk ? 10 : 7; workL.color.setHex(blk ? 0xff2a14 : 0xffb070); }
      else { poolM.color.setHex(blk ? 0xff2a14 : 0xffb070); poolM.opacity = blk ? 0.2 * strobe : 0.085 * lightK; pool.visible = poolM.opacity > 0.004; }
      // harness pilot lamps on the nameplate: dim idle, lit working (the plate glows with them), amber/red blocked
      pilotM.forEach((pm, i) => pm.emissive.setHex(blk ? ((Math.sin(t * 9) > 0) === !!i ? 0xffa010 : 0xff2a10) : work ? HN.lamp : 0));
      nameM.color.setScalar(blk ? (Math.sin(t * 9) > 0 ? 1 : 0.55) : lerp(0.62, 1, lightK));
      // punch ticker
      tTick -= dt; if (tTick <= 0) { tTick = work ? 0.1 : 0.5; tick.forEach((lm, i) => lm.emissive.setHex(blk ? (Math.sin(t * 9 + i) > 0 ? 0xc02010 : 0) : work && Math.random() < (PMS.ph === 'punch' ? 0.6 : 0.25) ? 0xffa84a : 0)); }
      // punched-card ribbon
      ribbon.forEach((c, i) => {
        const p = (i / ribbon.length + ribbonOff) % 1;
        if (p < 0.3) { const q = p / 0.3; c.position.set(PM.xPunch, 0.98 - q * 0.02, PM.z1 + 0.04 + q * 0.18); c.rotation.set(q * 0.4, 0, 0); }
        else { const q = (p - 0.3) / 0.7; c.position.set(PM.xPunch + Math.sin(i * 2.1) * 0.06 * q, 0.96 - q * 0.42, PM.z1 + 0.22 + q * 0.12); c.rotation.set(0.4 + q * 0.6 * (i % 2 ? 1 : -1), (i % 2 ? 0.2 : -0.2) * q, 0); }
        c.visible = PMS.ph === 'punch' || p > 0.3;
      });
      // BIG "?" over the machine while blocked
      qCard.visible = blk; if (blk) { qCard.position.y = 5.3 + Math.sin(t * 3) * 0.12; qCard.rotation.y = Math.sin(t * 1.5) * 0.25; qHalo.material.opacity = 0.18 + 0.15 * strobe; qCard.scale.setScalar(1 + 0.06 * Math.sin(t * 6)); }
      // item halos (one per held item), colored by kind
      const held = [[ARMS.item, ARM.anchor, 0], [PMS.item, carAnchor, 0.2], [CLAW.item, clawAnchor, 0], [ENG.item, engAnchor, ENG.turned ? 0 : 0.2]];
      held.forEach(([it, a, oy], i) => {
        const h = halos[i];
        if (!it || it.gone) { h.material.opacity = Math.max(0, h.material.opacity - dt * 4); h.visible = h.material.opacity > 0.004; return; }
        h.visible = true; anchorPos(a, h.position); h.position.y += oy;
        const col = blk ? (strobe > 0.5 ? 0xffb020 : 0xff3020) : it.kind === 'cards' ? 0xfff0c8 : it.kind === 'issue' ? it.parts.src : it.kind === 'reject' ? 0xff5a3a : 0xffc060;
        h.material.color.setHex(col); h.material.opacity = blk ? 0.3 : 0.2 + 0.06 * Math.sin(t * 5 + i);
      });
      for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i]; p.t += dt; const k = p.t / 0.55; p.r.scale.setScalar(1 + k * 2.4); p.r.material.opacity = 0.9 * (1 - k); if (k >= 1) { dg.remove(p.r); p.r.material.dispose(); p.r.geometry.dispose(); pulses.splice(i, 1); } }
      // steam: tall plume when blocked, working puffs + whistle while compiling, nothing idle
      tPuff -= dt;
      if (tPuff <= 0) {
        tPuff = blk ? 0.03 : 0.12;
        if (blk) {
          K.spawn(g, BO.x + 0.4 + K.R() * 0.1, BO.y + 3.4, BO.z + 0.3 + K.R() * 0.1, K.R() * 0.4, 3.6 + Math.random() * 0.8, K.R() * 0.4, Math.random() < 0.5 ? 0xd4ccbc : 0xb8b0a2, 2.3, 0.22, -0.18);
          if (Math.random() < 0.35) puff(D.x + 0.9, 0.9, D.z + 1.1, 0x9a9284, 0.1, 1.0, 0.2, 1.0, 0.5, 0.6);
        } else if (work && Math.random() < 0.5) puff(BO.x, BO.y + 3.9, BO.z, 0x4a4038, 0.2, 0.8, 0.1, 2.4, 0.2, 0.1);
        if (!blk && compile > 0.5 && Math.random() < (brewing ? 0.3 : 0.6)) puff(BO.x + 0.4, BO.y + 3.35, BO.z + 0.3, 0xe8e0d0, 0.12, 1.8, 0.05, 1.0, 0.2, 0.2);
      }
      // oil drips from the arm elbow and the claw head while working
      tDrip -= dt;
      if (work && tDrip <= 0) { tDrip = 0.9 + Math.random() * 1.2; const src = Math.random() < 0.5 ? ARM.el : head; anchorPos(src, v2); K.spawn(g, v2.x, v2.y - 0.1, v2.z, 0, -0.2, 0, 0x0a0806, 0.7, 0.05, 9); }
      tSpark -= dt;
      if (work && ARMS.ph === 'grip' && ARMS.t < 0.2 && tSpark <= 0) { tSpark = 0.05; anchorPos(ARM.anchor, v2); K.spawn(g, v2.x, v2.y, v2.z, K.R() * 1.5, 0.5 + Math.random(), K.R() * 1.5, 0xfff0b0, 0.3, 0.04, 5, true); }
      syncInstances(); syncLamps();
    } };
  });
}
