// =====================================================================
// PLANNER (the shaft's BUILD floor) — MACHINES agent
// The Black Iron mockup's AETHER SPLITTER (docs/art/black-iron/modules/splitter.js), same machine: stepped
// octagonal dais, four iron columns, the green dome with its brass ribs and lightning rod, the aether core inside
// the armillary rings, the intake lift, the brass/glass pass chute, the semaphore, the lectern with its paper tape.
// Its job changed: it is the AI that reads each issue and decides which assembler builds it.
//   An issue (or a rejected PR coming back on the rework belt: same tray) lands on the intake lift (front-left),
//   rides it up, the teal tractor beam pulls it into the orrery and it circles the core while the rings spin up,
//   scan rings sweep it and data motes stream into the core: the planner STUDIES it. Real time: it keeps
//   circling until M.ready(item); the auto driver is ready at once and the sweep plays exactly like the mockup.
//   Then the natural decision point (M.maybeDecision), then the ROUTE: M.route(item) picks the assembler; the
//   core flashes in that agent's accent color, its name pops up over the lectern, the lever throws to it, the
//   semaphore raises its arm and lights that agent's lens, the tape prints a mark in its color; the item swings
//   to the pass funnel and drops down the glass chute to the pass port (front-right face) -> the plan belts.
//   No verdicts here: the reject spiral and its outlet are kept as hardware but SEALED (blanking caps, bolted
//   cover); its klaxon is the blocked alarm now.
// IDLE = rings idling, core dim, lift down. WORKING = rings spun up, beam on, motes, arcs.
// BLOCKED = rings grind + judder, core amber/red flicker, strobes, klaxon, "!" glyph, steam from the dome vents.
// Every moving part is marked K.dyn (the shaft merges everything else after build). In-world text: "PLANNER".
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

// 5x5 pixel font (Silkscreen-like caps) for the plates and the destination card
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
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export default function install(IRON) {
  IRON.machine('planner', function (K, M) {
    const THREE = K.THREE, V = THREE.Vector3;
    const DEG = Math.PI / 180, TAU = Math.PI * 2;
    const clamp01 = (k) => Math.max(0, Math.min(1, k));
    const sm = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
    const dyn = K.dyn;

    // the assemblers this planner feeds, left to right, with their harness name + accent color
    const ASMS = ((IRON.layout && IRON.layout.assemblers) || []).slice().sort((a, b) => a.x - b.x);
    const ASM = ASMS.map((a) => {
      const hk = a.def && a.def.harness, h = harnessOf(hk);
      const same = ASMS.filter((b) => (b.def && b.def.harness) === hk);
      return { id: a.id, name: same.length > 1 ? h.name + ' ' + (same.indexOf(a) + 1) : h.name, col: h.col, lamp: h.lamp, dim: h.dim };
    });
    const NA = ASM.length;

    // ---------- materials: Black Iron palette, lifted for readability ----------
    const MT = {
      brass: K.mat(0xbc8c3c, { shine: 44, spec: 0x8a6a30 }),
      brassL: K.mat(0xe0b25c, { shine: 56, spec: 0xa8884a }),
      brassD: K.mat(0x7a5622, { shine: 24, spec: 0x3a2a10 }),
      brass2: K.mat(0xbc8c3c, { shine: 44, spec: 0x8a6a30, double: true }),
      copper: K.mat(0xa8582e, { shine: 36, spec: 0x7a4428 }),
      copperD: K.mat(0x6e3820, { shine: 20, spec: 0x3a1a0a }),
      iron: K.mat(0x463c33, { shine: 26, spec: 0x34343a }),
      ironM: K.mat(0x382f28, { shine: 18, spec: 0x26262a }),
      ironL: K.mat(0x625548, { shine: 30, spec: 0x3e3e44 }),
      soot: K.mat(0x1c1612),
      verdD: K.mat(0x2f6a58, { shine: 16 }),
      rust: K.mat(0x92421c), rustL: K.mat(0xb4622a), rustD: K.mat(0x5a2612),
      red: K.mat(0x9a2414, { shine: 22, spec: 0x4a1a10 }),
      cream: K.mat(0xe4d2a8),
      wood: K.mat(0x624228), woodD: K.mat(0x40291a),
      oil: K.mat(0x0a0a0e, { shine: 90, spec: 0x6a5a8a }),
      grime: K.mat(0x080605, { op: 0.45, depthWrite: false }),
      glass: K.mat(0xc6f2e4, { op: 0.2, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      glassR: K.mat(0xff8a6a, { op: 0.26, shine: 90, spec: 0xffffff, depthWrite: false, double: true }),
      hazard: K.mat(0xd8a018), dark: K.mat(0x140f0b), ink: K.mat(0x140c06)
    };
    const stoneT = K.canvasTex(64, 64, (g) => {
      let s = 13; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      g.fillStyle = '#30261e'; g.fillRect(0, 0, 64, 64);
      const tones = ['#7e6c58', '#73634f', '#8a7862', '#6a5a48'];
      for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < 64; x += 24) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(x + 1, y + 1, 22, 14);
        g.fillStyle = 'rgba(255,230,190,0.1)'; g.fillRect(x + 2, y + 1, 20, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 13, 22, 2);
      }
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(6,4,2,0.35)'; g.fillRect(r() * 60, r() * 60, 3 + r() * 8, 2 + r() * 5); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(110,50,20,0.25)'; g.fillRect(r() * 60, r() * 30, 2, 6 + r() * 20); }
    }, [4, 0.35]);
    const stoneM = K.mat(0xffffff, { map: stoneT });

    const g = K.group();
    const S = K.group(g); // static: baked at the end
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
      const sv = new V(), list = [];
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
    const band = (p, r, y, m, h, seg, x, z) => K.cyl(r, r, h || 0.1, m || MT.brass, seg || 18, x || 0, y, z || 0, p);
    function rivetRing(p, r, y, n, m, cx, cz) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; K.box(0.07, 0.07, 0.07, m || MT.brassL, (cx || 0) + Math.cos(a) * r, y, (cz || 0) + Math.sin(a) * r, p); } }
    function gear(p, r, thick, teeth, m, x, y, z) {
      const gg = K.group(p, x, y, z);
      K.cyl(r, r, thick, m, Math.max(12, teeth), 0, 0, 0, gg);
      const tw = (Math.PI * 2 * r) / teeth * 0.5;
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const tb = K.box(tw, thick * 0.9, r * 0.22, m, Math.sin(a) * r * 1.08, 0, Math.cos(a) * r * 1.08, gg); tb.rotation.y = a; }
      K.cyl(r * 0.28, r * 0.28, thick * 1.6, MT.ironM, 8, 0, 0, 0, gg);
      if (r > 0.3) for (let i = 0; i < 3; i++) { const sp = K.box(r * 1.5, thick * 1.1, r * 0.12, MT.brassD, 0, 0, 0, gg); sp.rotation.y = i * Math.PI / 3; }
      return gg;
    }
    const needles = [], tmpC = new THREE.Color();
    // gauge facing +z of its group (ry turns it); returns the needle pivot (rotate .z)
    function gauge(p, x, y, z, r, ry, rx, rimM) {
      const gg = K.group(p, x, y, z); gg.rotation.order = 'YXZ'; gg.rotation.y = ry || 0; gg.rotation.x = rx || 0;
      const rim = K.cyl(r * 1.15, r * 1.15, 0.07, rimM || MT.brass, 14, 0, 0, 0, gg); rim.rotation.x = Math.PI / 2;
      const face = K.cyl(r, r, 0.08, MT.cream, 14, 0, 0, 0.01, gg); face.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = -2.2 + i / 7 * 4.4; const tk = K.box(0.012, r * 0.18, 0.012, MT.ink, Math.sin(a) * r * 0.78, Math.cos(a) * r * 0.78, 0.055, gg); tk.rotation.z = -a; }
      const red = K.box(r * 0.5, r * 0.18, 0.02, K.mat(0xb02a1a), r * 0.45, r * 0.45, 0.055, gg); red.rotation.z = -0.8;
      K.cyl(0.025, 0.025, 0.03, MT.brassL, 6, 0, 0, 0.07, gg).rotation.x = Math.PI / 2;
      const piv = dyn(K.group(gg, 0, 0, 0.06)); piv.scale.set(1, r, 1); needles.push(piv); // the needle (one instance) is scaled to the dial
      return piv;
    }
    const along = (m, a, b) => { // orient a unit box (1 along x) from a to b
      const d = new V().subVectors(b, a); const L = d.length();
      m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(L, 1, 1);
      m.quaternion.setFromUnitVectors(new V(1, 0, 0), d.normalize());
    };
    const rod = (p, a, b, w, m) => { const r = K.box(1, w, w, m, 0, 0, 0, p); along(r, a, b); r.scale.y = r.scale.z = 1; return r; };
    const P = (a, r, y) => new V(Math.cos(a) * r, y, Math.sin(a) * r);
    // 5x5 pixel text: on a dark plate (solid) or as glowing letters with a soot outline (cutout, for floating cards)
    function textTex(text, fg, o) {
      o = o || {};
      const pad = o.cut ? 1 : 3, gl = text.split('').map((ch) => (F5[ch] ? F5[ch].split('|') : null));
      let w = pad * 2; gl.forEach((q, i) => { w += (q ? 5 : 3) + (i < gl.length - 1 ? 1 : 0); });
      const h = 5 + pad * 2;
      const tex = K.canvasTex(w, h, (c) => {
        if (o.cut) c.clearRect(0, 0, w, h);
        else { c.fillStyle = '#120d09'; c.fillRect(0, 0, w, h); c.fillStyle = o.rim; c.fillRect(1, 1, w - 2, 1); c.fillRect(1, h - 2, w - 2, 1); c.fillRect(1, 1, 1, h - 2); c.fillRect(w - 2, 1, 1, h - 2); }
        const dots = (fn) => { let x = pad; gl.forEach((q) => { if (q) for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) if (q[r][k] === '#') fn(x + k, pad + r); x += (q ? 5 : 3) + 1; }); };
        if (o.cut) { c.fillStyle = '#0a0604'; dots((x, y) => c.fillRect(x - 1, y - 1, 3, 3)); }
        else { c.fillStyle = '#000000'; dots((x, y) => c.fillRect(x + 1, y + 1, 1, 1)); }
        c.fillStyle = fg; dots((x, y) => c.fillRect(x, y, 1, 1));
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return { tex, aspect: w / h };
    }

    // ---------- geometry constants ----------
    const DAIS = 0.65, ORB_R = 1.22, ORB_Y = 2.85, CORE = new V(0, ORB_Y, 0);
    const ANG = { in: 110 * DEG, pass: -35 * DEG, rej: 135 * DEG, front: 45 * DEG };
    const TRAY = new V(-1.2, 1.0, 2.9), PLAT_UP = 2.65;
    const PASS_PORT = new V(2.9, 1.0, -0.9), REJ_PORT = new V(-2.9, 1.0, 0.9);

    // =====================================================================
    // DAIS: stepped octagon, brass rims, teal inlay, grime
    // =====================================================================
    K.cyl(2.55, 2.68, 0.32, stoneM, 8, 0, 0.16, 0, S);
    const rimT = K.torus(2.5, 0.05, MT.brassD, 4, 8, 0, 0.33, 0, S); rimT.rotation.x = Math.PI / 2;
    K.cyl(2.2, 2.3, 0.26, MT.ironM, 8, 0, 0.45, 0, S);
    K.cyl(2.24, 2.24, 0.05, MT.brassD, 8, 0, 0.6, 0, S);
    K.cyl(1.98, 1.98, 0.05, MT.iron, 8, 0, DAIS - 0.02, 0, S);
    rivetRing(S, 2.17, 0.5, 24);
    rivetRing(S, 2.5, 0.27, 32, MT.brassD);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; const sp = K.box(1.6, 0.02, 0.06, MT.soot, Math.cos(a) * 1.1, DAIS + 0.005, Math.sin(a) * 1.1, S); sp.rotation.y = -a; }
    const inlayM = lamp(K.glow(0x2e8a78));
    const inlay = K.torus(1.36, 0.04, inlayM, 4, 40, 0, DAIS + 0.01, 0, g); inlay.rotation.x = Math.PI / 2;
    const inlay2 = K.torus(0.62, 0.03, inlayM, 4, 28, 0, DAIS + 0.01, 0, g); inlay2.rotation.x = Math.PI / 2;
    for (const [x, z, sx, sz, y] of [[0.9, -1.1, 0.45, 0.25, DAIS + 0.01], [-1.3, -0.4, 0.3, 0.2, DAIS + 0.01], [2.9, 1.7, 0.7, 0.4, 0.03], [-2.2, 2.5, 0.5, 0.3, 0.03], [1.5, 2.9, 0.6, 0.35, 0.03]]) {
      const p = K.sph(1, MT.oil, x, y, z, S, 12, 4); p.scale.set(sx, 0.02, sz); p.castShadow = false;
    }
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + 0.3; const d = K.box(0.3 + K.rnd() * 0.4, 0.01, 0.15 + K.rnd() * 0.2, MT.grime, Math.cos(a) * 1.5, DAIS + 0.012, Math.sin(a) * 1.5, S); d.rotation.y = K.rnd() * 3; d.castShadow = false; }

    // =====================================================================
    // COLUMNS + CROWN + DOME + LIGHTNING ROD
    // =====================================================================
    const COL_R = 1.65, colPts = [];
    [0, 90, 180, 270].forEach((deg) => {
      const a = deg * DEG, x = Math.cos(a) * COL_R, z = Math.sin(a) * COL_R; colPts.push(new V(x, 3.95, z));
      K.cyl(0.24, 0.28, 0.3, MT.brassD, 8, x, DAIS + 0.15, z, S);
      K.cyl(0.15, 0.19, 4.2, MT.iron, 8, x, DAIS + 2.2, z, S);
      for (const y of [1.2, 2.45, 3.7]) { K.cyl(0.23, 0.23, 0.1, MT.brass, 8, x, y, z, S); rivetRing(S, 0.23, y, 6, MT.brassL, x, z); }
      K.cyl(0.33, 0.2, 0.28, MT.brassD, 8, x, 4.86, z, S);
      K.box(0.05, 0.9, 0.05, MT.rust, x + 0.12, 1.5, z + 0.12, S);
      K.cyl(0.2, 0.2, 0.25, MT.soot, 8, x, DAIS + 0.42, z, S);
    });
    const crown = K.torus(1.76, 0.13, MT.brass, 6, 32, 0, 5.0, 0, S); crown.rotation.x = Math.PI / 2;
    const lowR = K.torus(1.76, 0.06, MT.brassD, 4, 32, 0, 0.72, 0, S); lowR.rotation.x = Math.PI / 2;
    rivetRing(S, 1.76, 5.12, 20);
    K.lathe([[1.86, 0], [1.68, 0.4], [1.27, 0.86], [0.7, 1.16], [0.16, 1.28]], K.mat(0x2e5e50, { shine: 14, spec: 0x1e3a32, double: true }), 8, 0, 5.02, 0, S);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; const s = K.box(0.12, 0.5, 0.04, K.mat(0x1e2e28), Math.cos(a) * 1.7, 5.3, Math.sin(a) * 1.7, S); s.rotation.y = -a + Math.PI / 2; s.rotation.x = -0.45; }
    K.lathe([[1.88, 0], [1.84, 0.18]], K.mat(0x1c2a24, { double: true }), 8, 0, 5.0, 0, S);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.tube([[Math.cos(a) * 1.86, 5.02, Math.sin(a) * 1.86], [Math.cos(a) * 1.45, 5.75, Math.sin(a) * 1.45], [Math.cos(a) * 0.17, 6.3, Math.sin(a) * 0.17]], 0.035, MT.brass, S, 10, 4); }
    const vents = [];
    for (const a of [ANG.front, ANG.front + Math.PI / 2, ANG.front - Math.PI / 2]) { const v = P(a, 1.2, 5.92); K.cyl(0.08, 0.1, 0.25, MT.brassD, 6, v.x, v.y, v.z, S); vents.push(v.setY(6.08)); }
    K.cyl(0.25, 0.25, 0.12, MT.brassD, 10, 0, 6.32, 0, S);
    K.cyl(0.07, 0.1, 0.95, MT.brass, 6, 0, 6.85, 0, S);
    for (const y of [6.55, 6.8, 7.05]) { const c = K.torus(0.16, 0.035, MT.copper, 4, 10, 0, y, 0, S); c.rotation.x = Math.PI / 2; }
    const rodTip = K.sph(0.12, lamp(K.glow(0xbffff0)), 0, 7.35, 0, g, 8, 6);
    K.cyl(0.07, 0.07, 1.7, MT.ironL, 8, 0, DAIS + 0.85, 0, S);
    K.cyl(0.06, 0.06, 1.62, MT.ironL, 8, 0, 4.15, 0, S);
    K.cyl(0.24, 0.24, 0.14, MT.brass, 10, 0, 4.98, 0, S);
    for (let i = 0; i < 4; i++) { const sp = K.box(3.4, 0.06, 0.06, MT.brassD, 0, 4.98, 0, S); sp.rotation.y = i * Math.PI / 4; }
    // PLANNER nameplate: a marquee board on the crown's front, facing the camera, the name lit in aether teal
    const NT = textTex('PLANNER', '#7af0d8', { rim: '#1e4a40' });
    const nameM = new THREE.MeshBasicMaterial({ map: NT.tex, color: 0xffffff, fog: false });
    {
      const pl = K.group(S, Math.cos(ANG.front) * 2.0, 4.86, Math.sin(ANG.front) * 2.0); pl.rotation.order = 'YXZ'; pl.rotation.y = Math.PI / 4; pl.rotation.x = -0.18;
      const PH = 0.36, PW = PH * NT.aspect;
      K.box(PW + 0.16, PH + 0.16, 0.07, MT.ironM, 0, 0, -0.04, pl);
      K.mesh(new THREE.PlaneGeometry(PW, PH), nameM, 0, 0, 0, pl).castShadow = false;
      for (const sy of [-1, 1]) K.box(PW + 0.24, 0.05, 0.1, MT.brass, 0, sy * (PH / 2 + 0.07), -0.01, pl);
      for (const sx of [-1, 1]) { K.box(0.05, PH + 0.18, 0.1, MT.brassD, sx * (PW / 2 + 0.1), 0, -0.01, pl); for (const sy of [-1, 1]) K.box(0.05, 0.05, 0.05, MT.brassL, sx * (PW / 2 + 0.1), sy * (PH / 2 + 0.07), 0.05, pl); }
      for (const sx of [-0.3, 0.3]) K.box(0.05, 0.3, 0.05, MT.iron, sx, PH / 2 + 0.2, -0.08, pl); // hung from the crown ring
    }

    // difference drum under the core (spins with the rings); each gear baked to one draw call per material
    const drum = dyn(K.group(g, 0, DAIS, 0)); const drumGears = [];
    for (let i = 0; i < 4; i++) { const gg = dyn(gear(drum, i % 2 ? 0.24 : 0.33, 0.07, i % 2 ? 8 : 11, i % 2 ? MT.brass : MT.brassD, 0, 0.22 + i * 0.26, 0)); drumGears.push(gg); }
    K.cyl(0.36, 0.4, 0.14, MT.ironM, 10, 0, 0.07, 0, drum);

    // =====================================================================
    // THE BRAIN: aether core inside the orrery
    // =====================================================================
    const brain = dyn(K.group(g, 0, ORB_Y, 0));
    const coreM = K.glow(0x7af0d8);
    const core = dyn(K.sph(0.42, coreM, 0, 0, 0, brain, 16, 12));
    const innerM = K.glow(0xeafff8, 0.9, true);
    const inner = dyn(K.sph(0.26, innerM, 0, 0, 0, brain, 12, 8));
    const haloM = K.glow(0x3ac0a0, 0.25, true);
    const halo = dyn(K.sph(0.74, haloM, 0, 0, 0, brain, 14, 10));
    const coreL = K.light(0x6af0d0, 1.0, 6, 0, ORB_Y, 0, g);
    const rings = [];
    [[0.66, 0.4, 0.3, 0xe0b25c, 0xc05a2a, 0.9], [0.8, -0.6, 1.1, 0xbc8c3c, 0x5a7ab0, -1.3], [0.93, 1.3, -0.5, 0xa8582e, 0xc89a3a, 1.7]].forEach(([r, rx, rz, c, pc, sp], i) => {
      const piv = dyn(K.group(brain)); piv.rotation.set(rx, 0, rz);
      const ring = dyn(K.group(piv));
      const tr = K.torus(r, 0.035, K.mat(c, { shine: 44, spec: 0x806030 }), 4, 34, 0, 0, 0, ring); tr.rotation.x = Math.PI / 2;
      const pm = lamp(K.mat(pc, { shine: 30, spec: 0x806040, e: 0 }));
      K.sph(0.11 - i * 0.015, pm, r, 0, 0, ring, 8, 6);
      K.sph(0.05, MT.brassL, -r, 0, 0, ring, 6, 4);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.5; K.box(0.06, 0.06, 0.06, MT.brassL, Math.cos(a) * r, 0, Math.sin(a) * r, ring); }
      rings.push({ ring, piv, rx, rz, sp, pm, pc });
    });

    // aether SOURCE manifold at the back corner: where the teal conduits leave (with vacuum gauge)
    const sock = K.group(g, -2.05, 0, -2.05); sock.rotation.y = Math.PI / 4;
    const sockS = K.group(sock);
    K.box(0.9, 0.62, 0.7, MT.brassD, 0, 0.31, 0, sockS); K.box(0.98, 0.08, 0.78, MT.brass, 0, 0.64, 0, sockS);
    for (const x of [-0.3, 0, 0.3]) { const stp = K.cyl(0.09, 0.09, 0.3, MT.copper, 8, x, 0.32, -0.42, sockS); stp.rotation.x = Math.PI / 2; K.torus(0.11, 0.03, MT.brassL, 4, 10, x, 0.32, -0.55, sockS); }
    for (const x of [-0.42, 0.42]) K.box(0.06, 0.66, 0.74, MT.ironM, x, 0.33, 0, sockS);
    const sockGlowM = lamp(K.glow(0x2e8a78));
    for (const x of [-0.25, 0, 0.25]) K.box(0.14, 0.2, 0.02, sockGlowM, x, 0.36, 0.36, sock);
    const sockN = gauge(sock, 0, 0.82, 0.1, 0.11, 0, -0.6);
    K.tube([[-2.05, 0.3, -2.05], [-1.6, 0.42, -1.6], [-1.1, DAIS + 0.05, -1.1], [-0.4, DAIS + 0.05, -0.4]], 0.07, MT.verdD, S, 12, 6);
    const sockPipeM = lamp(K.glow(0x2e8a78));
    K.tube([[-1.9, 0.48, -1.9], [-1.25, DAIS + 0.12, -1.25], [-0.5, DAIS + 0.12, -0.5], [0, DAIS + 0.4, 0]], 0.03, sockPipeM, g, 12, 4);

    // =====================================================================
    // INTAKE LIFT at the tray (front-left face): chain hoist, counterweight, vacuum pump.
    // Two belts end at this tray (ore square from the front, rework along the face from the left), so the hoist
    // stands BEHIND the platform: the platform rides on shoes up two back posts, open on three sides.
    // =====================================================================
    const BZ = -0.5; // the hoist's plane, just behind the platform
    const tw = K.group(S, TRAY.x, 0, TRAY.z);
    for (const sx of [-0.44, 0.44]) {
      K.box(0.1, 3.5, 0.1, MT.brass, sx, 1.75, BZ, tw); K.box(0.26, 0.08, 0.3, MT.ironM, sx, 0.04, BZ, tw);
      K.box(0.04, 3.4, 0.04, MT.brassL, sx * 1.12, 1.75, BZ + 0.04, tw);
      for (let y = 0.5; y < 3.3; y += 0.7) K.box(0.14, 0.04, 0.14, MT.brassD, sx, y, BZ, tw);
    }
    K.box(0.1, 3.5, 0.1, MT.ironM, 0.68, 1.75, BZ, tw); // counterweight guide (right, clear of both belts)
    K.box(1.5, 0.16, 0.24, MT.ironM, 0.12, 3.5, BZ, tw); K.box(1.52, 0.04, 0.26, MT.brass, 0.12, 3.6, BZ, tw);
    for (let i = 0; i < 6; i++) K.box(0.18, 0.05, 0.04, i % 2 ? MT.dark : MT.hazard, -0.33 + i * 0.18, 3.5, BZ + 0.13, tw);
    K.box(1.1, 0.08, 0.36, MT.ironM, 0.12, 0.04, BZ, tw);
    for (const sx of [-0.44, 0.44]) { const br = K.box(0.06, 0.06, 0.62, MT.ironM, sx, 0.62, BZ - 0.22, tw); br.rotation.x = -0.75; } // back stays
    // landing buffer: the platform comes to rest on a sprung pedestal
    K.cyl(0.09, 0.13, 0.7, MT.ironM, 8, 0, 0.35, -0.08, tw); K.cyl(0.18, 0.18, 0.05, MT.brassD, 8, 0, 0.72, -0.08, tw);
    for (let i = 0; i < 3; i++) { const c = K.torus(0.12, 0.022, MT.steel || MT.ironL, 4, 10, 0, 0.78 + i * 0.05, -0.08, tw); c.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 3; i++) K.box(0.2, 0.06, 0.2, i % 2 ? MT.dark : MT.hazard, 0, 0.12 + i * 0.07, -0.08, tw);
    const sproc = dyn(gear(g, 0.17, 0.06, 9, MT.brassL, TRAY.x, 3.32, TRAY.z + BZ + 0.16)); sproc.rotation.x = Math.PI / 2;
    const sproc2 = dyn(gear(g, 0.12, 0.06, 7, MT.brass, TRAY.x + 0.68, 3.32, TRAY.z + BZ + 0.12)); sproc2.rotation.x = Math.PI / 2;
    const plat = dyn(K.group(g, TRAY.x, TRAY.y, TRAY.z));
    K.box(0.78, 0.08, 0.72, MT.brassD, 0, -0.04, 0, plat);
    K.box(0.7, 0.02, 0.64, MT.ironL, 0, 0.005, 0, plat);
    for (let i = 0; i < 4; i++) K.box(0.03, 0.02, 0.64, MT.soot, -0.27 + i * 0.18, 0.012, 0, plat);
    K.box(0.78, 0.16, 0.05, MT.brass, 0, 0.06, -0.36, plat); // back lip: stops the ore coming in from the front
    K.box(0.05, 0.12, 0.6, MT.brass, 0.39, 0.04, -0.03, plat); // right lip: stops the rework coming along the face
    for (const sx of [-0.44, 0.44]) { K.box(0.16, 0.3, 0.16, MT.ironM, sx, -0.02, BZ + 0.02, plat); K.box(0.06, 0.06, 0.06, MT.brassL, sx, 0.1, BZ + 0.12, plat); } // guide shoes
    K.box(0.5, 0.12, 0.08, MT.ironM, 0, -0.14, 0, plat);
    const platLampM = lamp(K.mat(0x1a1a1a, { e: 0 })); K.sph(0.05, platLampM, 0.3, 0.16, -0.36, plat, 6, 4);
    const platAnchor = K.group(plat);
    const chains = dyn(K.group(g)); K.box(0.03, 1, 0.03, MT.dark, -0.3, 0, 0, chains); K.box(0.03, 1, 0.03, MT.dark, 0.3, 0, 0, chains); // both hoist chains stretch together
    const cw = dyn(K.group(g, TRAY.x + 0.68, 2.6, TRAY.z + BZ));
    K.box(0.24, 0.55, 0.24, MT.iron, 0, 0, 0, cw); for (let i = 0; i < 3; i++) K.box(0.25, 0.08, 0.25, i % 2 ? MT.dark : MT.hazard, 0, -0.18 + i * 0.18, 0, cw);
    const cwChain = dyn(K.box(0.025, 1, 0.025, MT.dark, TRAY.x + 0.68, 3, TRAY.z + BZ, g));
    K.box(0.86, 0.06, 0.06, MT.brassL, TRAY.x, 0.98, TRAY.z - 0.42, S);
    // vacuum pump beside the lift: two gauges that spike while an item is lifted / pulled
    const pump = K.group(S, TRAY.x + 0.92, 0, TRAY.z - 0.05);
    K.box(0.4, 0.66, 0.36, MT.ironM, 0, 0.33, 0, pump); K.box(0.44, 0.05, 0.4, MT.brass, 0, 0.67, 0, pump);
    K.lathe([[0.15, 0], [0.13, 0.12], [0.05, 0.2]], MT.brass2, 8, 0, 0.69, 0, pump);
    for (let i = 0; i < 4; i++) K.box(0.42, 0.03, 0.02, MT.soot, 0, 0.12 + i * 0.12, 0.19, pump);
    K.tube([[TRAY.x + 0.92, 0.9, TRAY.z - 0.05], [TRAY.x + 0.75, 1.3, TRAY.z - 0.05], [TRAY.x + 0.48, 1.4, TRAY.z]], 0.035, MT.copper, S, 8, 5);
    const vac1 = gauge(g, TRAY.x + 0.92, 0.52, TRAY.z + 0.14, 0.1, 0, 0), vac2 = gauge(g, TRAY.x + 1.13, 0.4, TRAY.z - 0.05, 0.08, Math.PI / 2, 0);

    // =====================================================================
    // PASS: funnel + brass/glass chute inside the colonnade, down to the front-right outlet (the plan belts)
    // =====================================================================
    const passA = ANG.pass, pf = P(passA, ORB_R, 1.82);
    K.lathe([[0.13, 0], [0.3, 0.28], [0.35, 0.36]], MT.brass2, 12, pf.x, pf.y, pf.z, S);
    const pfr = K.torus(0.35, 0.035, MT.brassL, 4, 14, pf.x, pf.y + 0.36, pf.z, S); pfr.rotation.x = Math.PI / 2;
    const passCurve = new THREE.CatmullRomCurve3([[pf.x, 1.85, pf.z], [1.6, 1.6, -0.82], [2.25, 1.25, -0.9], [2.9, 1.2, -0.9]].map((p) => new V(p[0], p[1], p[2])));
    { const gp = []; for (let i = 0; i <= 20; i++) { const p = passCurve.getPoint(i / 20 * 0.86); gp.push([p.x, p.y, p.z]); } const gl = K.tube(gp, 0.19, MT.glass, g, 30, 10); gl.castShadow = false; }
    for (const u of [0.12, 0.38, 0.62, 0.84]) { const p = passCurve.getPoint(u), tn = passCurve.getTangent(u); const c = K.torus(0.2, 0.04, MT.brass, 4, 12, p.x, p.y, p.z, S); c.quaternion.setFromUnitVectors(new V(0, 0, 1), tn); }
    for (const u of [0.4, 0.75]) { const p = passCurve.getPoint(u); K.box(0.06, p.y - 0.05, 0.06, MT.brassD, p.x, p.y / 2, p.z, S); K.box(0.2, 0.05, 0.2, MT.ironM, p.x, 0.03, p.z, S); }
    const passStrip = []; for (let i = 0; i < 6; i++) { const u = 0.1 + i * 0.13; const p = passCurve.getPoint(u); passStrip.push({ u, m: K.box(0.07, 0.07, 0.07, lamp(K.glow(0x0c2a14)), p.x, p.y + 0.23, p.z, g) }); }
    function trough(c, m, side) {
      const tg = K.group(S, c.x, 0, c.z);
      K.box(0.62, 0.05, 0.42, m, -side * 0.18, 0.975, 0, tg);
      for (const sz of [-0.23, 0.23]) K.box(0.62, 0.16, 0.04, m, -side * 0.18, 1.07, sz, tg);
      K.box(0.12, 0.95, 0.12, MT.ironM, -side * 0.3, 0.475, 0, tg); K.box(0.3, 0.06, 0.3, MT.ironM, -side * 0.3, 0.03, 0, tg);
      return tg;
    }
    trough(PASS_PORT, MT.brass, 1);
    const passStripM = lamp(K.glow(0x0c2a14));
    for (const sz of [-0.255, 0.255]) K.box(0.5, 0.04, 0.02, passStripM, PASS_PORT.x - 0.18, 1.12, PASS_PORT.z + sz, g);
    // the semaphore: raises its arm for the departing plan; a lens per assembler on its post lights the chosen one
    const SEM = new V(2.75, 0, -1.55);
    const sem = K.group(S, SEM.x, 0, SEM.z);
    K.cyl(0.05, 0.07, 2.3, MT.iron, 6, 0, 1.15, 0, sem); K.box(0.3, 0.06, 0.3, MT.ironM, 0, 0.03, 0, sem);
    K.cyl(0.11, 0.12, 0.06, MT.brassD, 8, 0, 2.32, 0, sem);
    const semLampM = lamp(K.mat(0x0c2a14, { e: 0 })); K.sph(0.11, semLampM, SEM.x, 2.45, SEM.z, g, 8, 6);
    const semArm = dyn(K.group(g, SEM.x + 0.07, 1.9, SEM.z));
    K.box(0.04, 0.12, 0.62, MT.cream, 0, 0, 0.28, semArm); K.box(0.045, 0.12, 0.18, K.mat(0x2a9a4a), 0, 0, 0.5, semArm); K.cyl(0.06, 0.06, 0.06, MT.brass, 8, 0, 0, 0, semArm).rotation.z = Math.PI / 2;
    const lensM = [];
    if (NA) {
      const rb = K.group(S, SEM.x, 1.25, SEM.z); rb.rotation.y = Math.PI / 4;
      const LH = 0.2 * NA + 0.1;
      K.box(0.26, LH, 0.08, MT.ironM, 0, 0, 0.02, rb); K.box(0.3, 0.04, 0.1, MT.brass, 0, LH / 2, 0.02, rb); K.box(0.3, 0.04, 0.1, MT.brass, 0, -LH / 2, 0.02, rb);
      ASM.forEach((a, i) => {
        const y = LH / 2 - 0.15 - i * 0.2;
        K.cyl(0.085, 0.085, 0.04, MT.brassD, 10, 0, y, 0.07, rb).rotation.x = Math.PI / 2;
        const lm = lamp(K.mat(a.dim, { e: 0 })); const ln = K.sph(0.065, lm, 0, y, 0.09, rb, 8, 6); ln.scale.z = 0.6; lensM.push(lm);
        K.box(0.12, 0.025, 0.04, MT.soot, 0, y + 0.08, 0.1, rb); // hood
      });
    }

    // =====================================================================
    // REJECT (sealed): the red spiral chute around the LEFT of the dome, its stamping cradle and outlet stay as
    // hardware, but the planner hands down no verdicts: blanking caps on both ends, a bolted cover on the outlet.
    // Its klaxon is the planner's blocked alarm now.
    // =====================================================================
    const RH = [[135, 2.2, 3.62], [141, 2.42, 3.55], [147, 2.36, 2.95], [152, 2.36, 2.25], [157, 2.45, 1.62]]
      .map(([d, r, y]) => P(d * DEG, r, y));
    RH.push(new V(-2.62, 1.3, 0.92), new V(REJ_PORT.x, 1.2, REJ_PORT.z));
    const rejCurve = new THREE.CatmullRomCurve3(RH);
    const US = 1 / (RH.length - 1);            // the stamping cradle sits at control point 1, up on the dome's left flank
    function glassSeg(u0, u1) { const pts = []; for (let i = 0; i <= 14; i++) { const p = rejCurve.getPoint(u0 + (u1 - u0) * i / 14); pts.push([p.x, p.y, p.z]); } const gl = K.tube(pts, 0.2, MT.glassR, g, 24, 10); gl.castShadow = false; }
    glassSeg(US + 0.06, 0.93);
    // funnel mouth at the top of the spiral, capped with a riveted blanking plate
    { const p0 = rejCurve.getPoint(0); const mouth = K.lathe([[0.2, 0], [0.34, 0.22], [0.38, 0.28]], K.mat(0x9a2414, { shine: 22, double: true }), 12, p0.x, p0.y, p0.z, S); const from = P(ANG.rej, ORB_R, ORB_Y).sub(p0).normalize(); mouth.quaternion.setFromUnitVectors(new V(0, 1, 0), from); mouth.position.addScaledVector(from, -0.12);
      const cap = K.group(S, mouth.position.x, mouth.position.y, mouth.position.z); cap.quaternion.copy(mouth.quaternion);
      K.cyl(0.4, 0.4, 0.05, MT.ironM, 14, 0, 0.29, 0, cap); K.cyl(0.42, 0.42, 0.03, MT.brassD, 14, 0, 0.27, 0, cap);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; K.box(0.05, 0.04, 0.05, MT.brassL, Math.cos(a) * 0.34, 0.32, Math.sin(a) * 0.34, cap); }
      for (const r of [0.785, -0.785]) { const b = K.box(0.6, 0.02, 0.09, MT.hazard, 0, 0.32, 0, cap); b.rotation.y = r; } }
    for (const u of [0.26, 0.38, 0.5, 0.62, 0.74, 0.84, 0.92]) { const p = rejCurve.getPoint(u), tn = rejCurve.getTangent(u); const c = K.torus(0.22, 0.045, MT.rust, 4, 12, p.x, p.y, p.z, S); c.quaternion.setFromUnitVectors(new V(0, 0, 1), tn); }
    // brackets: the spiral hangs off the 90 / 180 deg columns and stands on the dais
    rod(S, new V(0, 3.62, 1.5), RH[0].clone(), 0.07, MT.rustD);
    rod(S, new V(-1.5, 3.1, 0), RH[2].clone(), 0.07, MT.rustD);
    rod(S, new V(-1.5, 2.3, 0), RH[4].clone(), 0.07, MT.rustD);
    rod(S, new V(RH[4].x, 0.32, RH[4].z), RH[4].clone().setY(1.45), 0.08, MT.rustD); K.box(0.22, 0.05, 0.22, MT.ironM, RH[4].x, 0.34, RH[4].z, S);
    for (let i = 0; i < 7; i++) { const u = US + 0.1 + i * 0.105; if (u > 0.95) continue; const p = rejCurve.getPoint(u); K.box(0.08, 0.08, 0.08, K.mat(0x2a0a08), p.x, p.y + 0.25, p.z, S); } // dead strip lamps
    // the stamping cradle (open red iron trough between the glass runs) + overhead ram (parked) + klaxon
    const SP = rejCurve.getPoint(US), STn = rejCurve.getTangent(US); const stYaw = Math.atan2(-STn.z, STn.x);
    const stat = K.group(S, SP.x, SP.y, SP.z); stat.rotation.y = stYaw;
    K.box(0.62, 0.05, 0.4, MT.red, 0, -0.2, 0, stat); for (const sz of [-0.21, 0.21]) K.box(0.62, 0.2, 0.04, MT.red, 0, -0.1, sz, stat);
    for (const sx of [-0.33, 0.33]) { const c = K.torus(0.22, 0.05, MT.rust, 4, 12, sx, 0, 0, stat); c.rotation.y = Math.PI / 2; }
    for (const sz of [-0.32, 0.32]) { K.box(0.1, 1.3, 0.1, MT.rust, 0, 0.45, sz, stat); }
    K.box(0.24, 0.22, 0.76, MT.rust, 0, 1.1, 0, stat);
    for (let i = 0; i < 5; i++) K.box(0.25, 0.09, 0.14, i % 2 ? MT.dark : MT.hazard, 0, 1.1, -0.29 + i * 0.145, stat);
    K.cyl(0.13, 0.13, 0.45, MT.ironL, 8, 0, 1.4, 0, stat); band(stat, 0.15, 1.28, MT.brassD, 0.06); band(stat, 0.15, 1.52, MT.brassD, 0.06);
    for (const sx of [-0.26, 0.26]) { const c = K.cyl(0.21, 0.21, 0.04, MT.ironM, 12, sx * 1.2, 0, 0, stat); c.rotation.z = Math.PI / 2; } // the glass runs end in blind flanges
    rod(S, new V(-1.52, 4.55, 0), SP.clone().setY(SP.y + 1.1), 0.08, MT.rust); rod(S, new V(0, 4.55, 1.52), SP.clone().setY(SP.y + 1.1), 0.08, MT.rust);
    const ramG = K.group(S, SP.x, SP.y + 0.55, SP.z); ramG.rotation.y = stYaw;
    K.cyl(0.05, 0.05, 0.5, MT.ironL, 6, 0, 0.3, 0, ramG);
    K.box(0.34, 0.16, 0.3, MT.rustL, 0, 0, 0, ramG);
    const stampFaceM = lamp(K.mat(0x6a1a10, { e: 0 })); K.box(0.26, 0.04, 0.2, stampFaceM, 0, -0.1, 0, ramG);
    const klaxM = lamp(K.mat(0x3a0c08, { e: 0 }));
    const KL = SP.clone().setY(SP.y + 1.78);
    const klaxSpin = dyn(K.group(g, KL.x, KL.y, KL.z));
    K.box(0.22, 0.13, 0.08, klaxM, 0.06, 0, 0, klaxSpin);
    const klaxDome = K.sph(0.17, K.glow(0xff3020, 0.3), KL.x, KL.y, KL.z, g, 10, 8); klaxDome.castShadow = false;
    K.cyl(0.18, 0.2, 0.09, MT.brassD, 8, KL.x, KL.y - 0.14, KL.z, S);
    // the outlet at the pinned reject port (back-left face): red lip, bolted shut with a hazard-striped cover
    trough(REJ_PORT, MT.rustL, -1);
    for (const sz of [-0.255, 0.255]) K.box(0.5, 0.04, 0.02, K.mat(0x2a0a08), REJ_PORT.x + 0.18, 1.12, REJ_PORT.z + sz, S);
    { const cx = REJ_PORT.x + 0.18, cy = 1.17;
      K.box(0.68, 0.04, 0.54, MT.ironM, cx, cy, REJ_PORT.z, S);
      for (let i = 0; i < 4; i++) { const b = K.box(0.1, 0.012, 0.6, i % 2 ? MT.dark : MT.hazard, cx - 0.22 + i * 0.15, cy + 0.025, REJ_PORT.z, S); b.rotation.y = 0.6; b.scale.z = 0.86; }
      for (const sx of [-0.29, 0.29]) for (const sz of [-0.22, 0.22]) K.box(0.05, 0.05, 0.05, MT.brassL, cx + sx, cy + 0.03, REJ_PORT.z + sz, S);
      const lip = K.box(0.06, 0.24, 0.52, MT.ironM, REJ_PORT.x - 0.15, 1.08, REJ_PORT.z, S); lip.castShadow = true; }

    // column lamps on the two front columns: ROUTE (0deg, toward the plan belts: lights in the chosen agent's
    // color) / REWORK (90deg, toward the intake: red while a sent-back PR is being re-planned)
    function colLamp(deg, col) {
      const a = deg * DEG, p = P(a, COL_R + 0.24, 4.2);
      const cage = K.group(S, p.x, p.y, p.z);
      K.cyl(0.13, 0.15, 0.06, MT.brassD, 8, 0, -0.16, 0, cage); for (let i = 0; i < 4; i++) { const q = i / 4 * 6.28; K.box(0.03, 0.3, 0.03, MT.brassD, Math.cos(q) * 0.13, 0, Math.sin(q) * 0.13, cage); }
      const m = lamp(K.mat(col, { e: 0 })); K.sph(0.12, m, p.x, p.y, p.z, g, 10, 8);
      const br = K.box(0.3, 0.06, 0.06, MT.brassD, Math.cos(a) * (COL_R + 0.12), 4.05, Math.sin(a) * (COL_R + 0.12), S); br.rotation.y = -a;
      return m;
    }
    const routeLampM = colLamp(0, 0x3a3a34), rwLampM = colLamp(90, 0x4a1a14);

    // tally dials on the camera-facing faces of the dais: planned (teal rim) / re-planned rework (red rim)
    const planDial = gauge(g, Math.cos(22.5 * DEG) * 2.47, 0.17, Math.sin(22.5 * DEG) * 2.47, 0.12, Math.PI / 2 - 22.5 * DEG, 0, K.mat(0x2e8a78, { shine: 30 }));
    const rwDial = gauge(g, Math.cos(67.5 * DEG) * 2.47, 0.17, Math.sin(67.5 * DEG) * 2.47, 0.12, Math.PI / 2 - 67.5 * DEG, 0, K.mat(0xb02a1a, { shine: 30 }));
    let planN = 0, rwN = 0;

    // =====================================================================
    // LECTERN at the front corner: routing lever (one notch per assembler, left to right), ticker, gauge, tape
    // =====================================================================
    const lec = K.group(g, 1.62, DAIS, 1.62); lec.rotation.y = Math.PI / 4;
    const lecS = K.group(lec);
    K.box(0.62, 0.86, 0.36, MT.wood, 0, 0.43, 0, lecS); K.box(0.66, 0.06, 0.4, MT.brassD, 0, 0.03, 0, lecS);
    for (const x of [-0.3, 0.3]) K.box(0.05, 0.88, 0.38, MT.brassD, x, 0.44, 0, lecS);
    const top = K.box(0.72, 0.07, 0.48, MT.brassD, 0, 0.92, 0.04, lecS); top.rotation.x = 0.4;
    K.box(0.2, 0.04, 0.05, MT.dark, -0.18, 0.96, 0.24, lecS); // tape slot
    const tick = []; for (let i = 0; i < 6; i++) { const m = lamp(K.mat(0x1a1410, { e: 0 })); K.box(0.07, 0.05, 0.07, m, -0.24 + i * 0.096, 0.99, 0.14, lec).rotation.x = 0.4; tick.push(m); }
    const lecN = gauge(lec, -0.16, 0.98, -0.06, 0.12, 0, -1.17);
    const LEV = 0.18;
    const lever = dyn(K.group(lec, LEV, 0.98, -0.06)); K.box(0.05, 0.42, 0.05, MT.ironL, 0, 0.21, 0, lever); const knobM = lamp(K.mat(0x8a1a10, { e: 0 })); K.sph(0.07, knobM, 0, 0.43, 0, lever, 6, 4);
    const leverAt = (i) => (NA < 2 ? 0 : 0.7 - 1.4 * (i / (NA - 1))); // asm-1 (leftmost) = lever thrown left
    ASM.forEach((a, i) => { const x = LEV + (NA < 2 ? 0 : -0.17 + 0.34 * (i / (NA - 1))); K.box(NA > 2 ? 0.1 : 0.16, 0.04, 0.06, K.mat(a.col, { e: a.dim }), x, 0.96, -0.06, lec); });
    const tapeCurve = new THREE.CatmullRomCurve3([[-0.18, 0.98, 0.25], [-0.18, 0.99, 0.33], [-0.18, 0.88, 0.4], [-0.17, 0.62, 0.42], [-0.15, 0.36, 0.43], [-0.12, 0.14, 0.47]].map((p) => new V(p[0], p[1], p[2])));
    const tape = []; const tapeMarks = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 8; i++) tape.push({ seg: dyn(K.group(lec)), c: -1 });
    instancer(tape.map((tp) => tp.seg), (t) => K.box(0.13, 0.11, 0.008, MT.cream, 0, 0, 0, t), false);
    const tapeInk = instancer(tape.map((tp) => tp.seg), (t) => K.box(0.05, 0.04, 0.012, K.mat(0xffffff), 0.02, 0, 0.004, t), false, tape.map(() => 0xe4d2a8)); // the marks, printed in the agent's colour
    let tapeFeed = 1;

    // status lamp + caution beacon (1.3x): caution on the floor out front, clear of the intake lift
    const statLamp = K.statusLamp(g, 2.2, DAIS, 0.5, 1.3);
    const caution = K.caution(g, 0.45, 0, 3.1, 1.0);

    // =====================================================================
    // FX objects: tractor beam, scan rings, lightning, shockwaves, destination card / "!" glyph
    // =====================================================================
    const mover = dyn(K.group(g, TRAY.x, TRAY.y, TRAY.z));
    const beamM = K.glow(0x7af0d8, 0.65, true), beamOM = K.glow(0x3ac0a0, 0.22, true);
    const beam = dyn(K.cyl(0.035, 0.035, 1, beamM, 6, 0, 0, 0, g)), beamO = dyn(K.cyl(0.1, 0.1, 1, beamOM, 8, 0, 0, 0, g));
    beam.visible = beamO.visible = false;
    const scanM = K.glow(0x9ffff0, 0.9, true);
    const scan = dyn(K.torus(0.24, 0.025, scanM, 4, 18, 0, 0, 0, g)); scan.visible = false;
    const scan2 = dyn(K.torus(0.3, 0.018, K.glow(0x7af0d8, 0.6, true), 4, 18, 0, 0, 0, g)); scan2.visible = false;
    const boltM = K.glow(0xd8fff8, 1, true);
    const bolt = []; for (let i = 0; i < 7; i++) { const b = dyn(K.box(1, 0.045, 0.045, boltM, 0, 0, 0, g)); b.visible = false; b.castShadow = false; bolt.push(b); }
    const waves = []; for (let i = 0; i < 2; i++) { const w = dyn(K.torus(0.8, 0.05, K.glow(0x46ff8a, 0.9, true), 4, 36, 0, ORB_Y, 0, g)); w.rotation.x = Math.PI / 2; w.visible = false; waves.push({ m: w, t: 9 }); }
    [beam, beamO, scan, scan2, inner, halo].forEach((m) => (m.castShadow = false));
    const glyph = dyn(K.group(g, 0.85, 4.0, 0.85)); glyph.rotation.y = Math.PI / 4;
    const gBang = K.glow(0xffb020, 0.95), gInk = K.glow(0x120604, 0.7);
    const gB = dyn(K.group(glyph));
    const stroke = (grp, w, h, m, x, y, rz) => { const a = K.box(w, h, 0.05, m, x, y, 0.02, grp); a.rotation.z = rz; const b = K.box(w + 0.09, h + 0.09, 0.04, gInk, x, y, -0.02, grp); b.rotation.z = rz; };
    stroke(gB, 0.16, 0.5, gBang, 0, 0.12, 0); stroke(gB, 0.16, 0.16, gBang, 0, -0.32, 0);
    K.bake(gB);
    const gFrame = dyn(K.torus(0.52, 0.03, K.glow(0xffffff, 0.5, true), 4, 24, 0, 0, 0, glyph));
    // destination cards: the chosen agent's name in its accent color, glowing letters with a soot outline
    const cards = ASM.map((a) => {
      const T = textTex(a.name, hex(a.lamp), { cut: true });
      const H = 0.34, W = H * T.aspect;
      const cg = dyn(K.group(glyph));
      const cm = new THREE.MeshBasicMaterial({ map: T.tex, color: 0xffffff, alphaTest: 0.5, fog: false });
      K.mesh(new THREE.PlaneGeometry(W, H), cm, 0, 0, 0.03, cg);
      const fm = K.glow(a.lamp, 0.55, true);
      for (const sy of [-1, 1]) K.box(W + 0.16, 0.035, 0.02, fm, 0, sy * (H / 2 + 0.09), 0, cg);
      for (const sx of [-1, 1]) K.box(0.035, H + 0.2, 0.02, fm, sx * (W / 2 + 0.08), 0, 0, cg);
      const back = K.box(W + 0.12, H + 0.14, 0.02, K.glow(0x0a0604, 0.55), 0, 0, -0.02, cg);
      back.renderOrder = 1;
      K.bake(cg);
      cg.visible = false;
      return { g: cg, fm };
    });
    glyph.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    glyph.visible = false; let glyphT = 0;

    kitLamps(caution.g); kitLamps(statLamp.g);
    instancer(needles, (t) => K.box(0.03, 0.85, 0.02, MT.ink, 0, 0.38, 0, t), false);
    vcBakeAll(g, new Set());
    K.bake(S);
    K.bake(sockS);

    // =====================================================================
    // CYCLE
    // =====================================================================
    const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YZX'), q0 = new THREE.Quaternion();
    const C45 = Math.SQRT1_2;
    function qFor(d) { // local direction -> root-space quaternion that points the item's long axis along it
      const rx = C45 * (d.x - d.z), rz = C45 * (d.x + d.z);
      tmpE.set(0, Math.atan2(-rz, rx), Math.atan2(d.y, Math.hypot(rx, rz)), 'YZX');
      return tmpQ.setFromEuler(tmpE);
    }
    const orbit = (a, out) => (out || new V()).set(Math.cos(a) * ORB_R, ORB_Y - 0.2, Math.sin(a) * ORB_R);
    const tang = (a) => new V(-Math.sin(a), 0, Math.cos(a));
    const DECIDE = [
      (l) => l + ' is unclear: needs your call',
      (l) => l + ' is too big: split it first?',
      (l) => l + ': fix it or redesign it?',
      (l) => l + ' touches billing: plan it anyway?',
    ];
    const SWEEP = 2.1, W_CRUISE = -2.6, DECEL = 3.2, MIN_STUDY = 2.4; // the study orbit (rad/s, clockwise)
    let it = null, ph = 'idle', pt = 0, asked = false, ringSp = 0.15, flash = 0, flashCol = 0x7af0d8, orbA = ANG.front;
    let routed = false, dest = -1, rework = false, looping = false, orbW = 0, brake = null;
    let platY = TRAY.y, lastPlat = TRAY.y, klax = 0, semUp = 0, boltT = 0, moteT = 0, steamT = 0, dripT = 0;
    const startPos = new V(), endPos = new V(), cc = new V(), tv = new V();
    function setPhase(p) { ph = p; pt = 0; if (it) q0.copy(it.mesh.quaternion); }
    function orient(d, k) { if (!it) return; const q = qFor(d.clone().normalize()); if (k >= 1) it.mesh.quaternion.copy(q); else it.mesh.quaternion.copy(q0).slerp(q, k); }
    const L = () => (it ? (rework ? 'rework ' : '') + it.label() : '');
    const destName = () => (dest >= 0 ? ASM[dest].name : 'the plan belt');
    function routeText() { return L() + ' → ' + destName(); }
    function fadeStrip(arr, base) { arr.forEach((s) => { const c = s.m.material.color; c.r = Math.max(base[0], c.r * (1 - 0.04)); c.g = Math.max(base[1], c.g * (1 - 0.04)); c.b = Math.max(base[2], c.b * (1 - 0.04)); }); }

    function update(t, dt) {
      const blk = M.blocked;
      const adt = blk ? 0 : dt;
      // ---- intake: claim the next issue (or reworked PR) when the lift is down ----
      if (ph === 'idle' && !blk && platY <= TRAY.y + 0.002) {
        const w = M.waiting('in');
        if (w) { it = M.take('in'); it.follow(platAnchor); routed = false; dest = -1; asked = false; looping = false; brake = null; rework = it.attempts > 0 || it.kind === 'reject'; setPhase('rise'); }
      }
      if (it) pt += adt;
      let detail = 'waiting for issues', st = 'IDLE';
      if (it) { st = 'WORKING'; detail = L() + ' · intake lift'; }
      // ---- the item's journey ----
      if (ph === 'rise') {
        platY = TRAY.y + (PLAT_UP - TRAY.y) * sm(pt / 0.65);
        if (pt >= 0.65) { mover.position.set(TRAY.x, PLAT_UP, TRAY.z); it.follow(mover); setPhase('pull'); }
      } else if (ph === 'pull') {
        const k = sm(pt / 0.5); startPos.set(TRAY.x, PLAT_UP, TRAY.z); orbit(ANG.in, endPos);
        mover.position.lerpVectors(startPos, endPos, k); orient(tang(ANG.in), k); orbA = ANG.in;
        detail = L() + ' · pulled into the aether';
        if (pt >= 0.5) { setPhase('study'); orbW = 0; }
      } else if (ph === 'study') {
        detail = L() + (rework ? ' · reading why it came back' : ' · reading the issue');
        let done = false;
        if (!looping) {
          // the mockup's sweep: a lap and a bit around the core...
          const k = sm(pt / SWEEP); orbA = ANG.in + (ANG.front - TAU - ANG.in) * k;
          // ...unless the real planning is still running at mid-sweep: then it keeps circling the core
          if (pt >= SWEEP * 0.5 && pt < SWEEP && !M.ready(it)) { looping = true; orbW = (ANG.front - TAU - ANG.in) * 1.5 / SWEEP; }
          else if (pt >= SWEEP) done = true;
        } else if (!brake) {
          orbW += (W_CRUISE - orbW) * Math.min(1, adt * 0.8);
          orbA += orbW * adt;
          if (pt >= MIN_STUDY && M.ready(it)) {
            // brake at a steady rate so it comes to rest exactly at the front
            let d = ((orbA - ANG.front) % TAU + TAU) % TAU; const need = (orbW * orbW) / (2 * DECEL);
            while (d < need) d += TAU;
            brake = { a0: orbA, w0: orbW, T: (2 * d) / Math.abs(orbW), t: 0 };
          }
        } else {
          brake.t = Math.min(brake.T, brake.t + adt);
          orbA = brake.a0 + brake.w0 * brake.t - 0.5 * (brake.w0 / brake.T) * brake.t * brake.t;
          if (brake.t >= brake.T) done = true;
        }
        orbit(orbA, mover.position); mover.position.y += Math.sin(pt * 7) * 0.04; orient(tang(orbA), 1);
        if (done) {
          orbA = ANG.front; detail = L() + ' · choosing an assembler';
          if (!asked) { asked = true; M.maybeDecision(DECIDE[Math.floor(Math.random() * DECIDE.length)](it.label())); }
          if (!M.blocked) setPhase('route');
        }
      } else if (ph === 'route') {
        orbA = ANG.front; orbit(ANG.front, mover.position); orient(tang(ANG.front), 1);
        detail = L() + ' · choosing an assembler';
        if (!routed && pt >= 0.3) {
          routed = true;
          const id = M.route(it); dest = ASM.findIndex((a) => a.id === id);
          flashCol = dest >= 0 ? ASM[dest].lamp : 0x7af0d8;
          it.flash(flashCol); if (rework) rwN++; else planN++;
          flash = 1; waves.forEach((w, i) => { w.t = -i * 0.18; w.m.material.color.setHex(flashCol); });
          for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; K.spawn(g, Math.cos(a) * 0.5, ORB_Y, Math.sin(a) * 0.5, Math.cos(a) * 3.2, K.R() * 1.4, Math.sin(a) * 3.2, Math.random() < 0.5 ? flashCol : 0xffffff, 0.55, 0.07, 1.5, true); }
          for (let i = 0; i < 18; i++) K.spawn(g, K.R() * 0.1, 7.35, K.R() * 0.1, K.R() * 3, 0.5 + Math.random() * 2.2, K.R() * 3, Math.random() < 0.5 ? flashCol : 0xffffff, 0.5, 0.05, 4, true);
          tapeMarks.unshift(flashCol); tapeMarks.length = 8; tapeFeed = 0;
        }
        if (routed) detail = routeText();
        if (pt >= 0.9) setPhase('swing');
      } else if (ph === 'swing') { // swing right inside the colonnade to the pass funnel
        detail = routeText();
        const k = sm(pt / 0.45); orbA = ANG.front + (ANG.pass - ANG.front) * k;
        orbit(orbA, mover.position); orient(tang(orbA), 1);
        if (pt >= 0.45) setPhase('drop');
      } else if (ph === 'drop') {
        detail = routeText();
        const k = sm(pt / 0.38); orbit(ANG.pass, startPos); endPos.copy(passCurve.getPoint(0)); endPos.y -= 0.2;
        mover.position.lerpVectors(startPos, endPos, k); orient(passCurve.getTangent(0), k);
        if (pt >= 0.38) setPhase('chute');
      } else if (ph === 'chute') {
        detail = routeText();
        const u = Math.min(1, Math.pow(pt / 0.8, 1.5));
        mover.position.copy(passCurve.getPoint(u)); mover.position.y -= 0.2; orient(passCurve.getTangent(Math.min(u, 0.999)), 1);
        passStrip.forEach((s) => { if (Math.abs(s.u - u) < 0.1) s.m.material.color.setHex(flashCol); });
        if (u >= 1) setPhase('out');
      } else if (ph === 'out') {
        detail = routeText();
        mover.position.copy(PASS_PORT); orient(new V(1, 0, 0), 1);
        semUp = 1;
        if (pt > 0.18) {
          if (M.give(it, 'pass')) { it = null; setPhase('idle'); detail = 'waiting for issues'; st = 'IDLE'; }
          else detail = L() + ' · held: the plan belt is full';
        }
      }
      if (ph !== 'rise') platY = Math.max(TRAY.y, platY - adt * 2.4);
      if (!it) st = 'IDLE';
      M.setState(st, detail);

      // =================== visuals ===================
      const reviewing = ph === 'study' || (ph === 'route' && !routed);
      const working = !!it;
      const inOrrery = it && (ph === 'pull' || ph === 'study' || ph === 'route' || ph === 'swing');
      const sending = it && routed && (ph === 'route' || ph === 'swing' || ph === 'drop' || ph === 'chute' || ph === 'out');
      if (sending) semUp = 1;
      // the core dims while the item passes in front of it (camera looks along local -45deg), so it stays readable
      const front = inOrrery ? clamp01((Math.cos(orbA - ANG.front) - 0.55) / 0.45) : 0;
      const dim = flash > 0.2 ? 0 : front * 0.6;
      // orrery spin-up / wind-down / grind
      const target = blk ? 0 : reviewing ? 2.9 : working ? 1.1 : 0.16;
      ringSp += (target - ringSp) * Math.min(1, dt * (blk ? 3 : reviewing ? 1.6 : 1.0));
      rings.forEach((r, i) => {
        r.ring.rotation.y += dt * r.sp * ringSp;
        r.piv.rotation.x = r.rx + (blk ? Math.sin(t * 47 + i * 2) * 0.035 : 0);
        r.piv.rotation.z = r.rz + (blk ? Math.sin(t * 39 + i) * 0.03 : 0);
        const on = reviewing ? Math.sin(t * 9 - i * 2.1) > 0.2 : working;
        r.pm.emissive.setHex(blk ? (Math.sin(t * 8 + i) > 0 ? 0x6a2a00 : 0) : on ? (r.pc & 0x7f7f7f) : 0);
      });
      brain.rotation.y += dt * 0.25 * ringSp;
      drum.rotation.y += dt * ringSp * 1.3;
      drumGears.forEach((gg, i) => (gg.rotation.y += dt * ringSp * (i % 2 ? 2.2 : -0.6)));
      // core colour + pulse
      flash = Math.max(0, flash - dt * 1.1);
      let col;
      if (blk) col = Math.sin(t * 15) > 0 ? 0xffa020 : 0xff4a1a;
      else if (flash > 0.2) col = flashCol;
      else col = working ? 0x7af0d8 : 0x2e8a78;
      coreM.color.setHex(col); if (dim > 0) coreM.color.multiplyScalar(1 - dim);
      const flick = blk ? (Math.random() < 0.25 ? 0.55 : 1) : 1;
      const pulse = (blk ? 0.78 : reviewing ? 1.0 + Math.sin(t * 13) * 0.12 : working ? 0.9 + Math.sin(t * 6) * 0.05 : 0.6 + Math.sin(t * 1.3) * 0.03) * flick;
      core.scale.setScalar((pulse + flash * 0.25) * (1 - dim * 0.25));
      inner.scale.setScalar((reviewing ? 1.15 : 0.9) * pulse + flash * 0.5); innerM.opacity = (blk ? 0.3 : working ? 0.55 : 0.3) * (1 - dim);
      halo.scale.setScalar(pulse * (1.15 + Math.sin(t * 9) * 0.04) + flash * 1.4);
      haloM.color.setHex(blk ? 0xff8a20 : flash > 0.2 ? flashCol : 0x3ac0a0); haloM.opacity = (blk ? 0.28 : 0.12 + (working ? 0.05 : 0) + flash * 0.3) * (1 - dim * 0.8);
      if (!coreL.isDummy) { coreL.color.setHex(col); coreL.intensity = ((blk ? 0.6 : working ? 0.75 : 0.3) * flick + flash * 1.2) * (1 - dim * 0.5); }
      const dimCol = new THREE.Color(col).multiplyScalar(working || blk ? 0.75 + Math.sin(t * 6) * 0.2 : 0.35);
      inlayM.color.copy(dimCol); sockGlowM.color.copy(dimCol); sockPipeM.color.copy(dimCol);
      rodTip.material.color.setHex(blk ? (Math.sin(t * 9) > 0 ? 0xffa020 : 0x3a1a08) : flash > 0.3 ? flashCol : reviewing && Math.sin(t * 23) > 0.1 ? 0xffffff : working ? 0x9ae8d8 : 0x3a7a6a);
      // tractor beam core -> item (it also hands the plan to the pass funnel)
      const beamOn = it && (ph === 'pull' || ph === 'study' || ph === 'route' || ph === 'swing' || ph === 'drop');
      beam.visible = beamO.visible = !!beamOn && (!blk || Math.sin(t * 20) > -0.3);
      if (beamOn) {
        cc.copy(mover.position); cc.y += 0.2;
        const d = tv.subVectors(cc, CORE); const len = d.length();
        for (const b of [beam, beamO]) { b.position.copy(CORE).addScaledVector(d, 0.5); b.scale.set(1, len, 1); b.quaternion.setFromUnitVectors(new V(0, 1, 0), d.clone().normalize()); }
        const hot = flash > 0.2 || (routed && (ph === 'swing' || ph === 'drop'));
        beamM.color.setHex(blk ? 0xffa020 : hot ? flashCol : 0x9ffff0); beamOM.color.setHex(blk ? 0xff6a10 : hot ? flashCol : 0x3ac0a0);
        beamM.opacity = 0.45 + Math.sin(t * 30) * 0.15;
      }
      // scan rings sweep along the item while the planner reads it
      const scanning = it && (reviewing || ph === 'route');
      scan.visible = scan2.visible = !!scanning;
      if (scanning) {
        cc.copy(mover.position); cc.y += 0.2;
        const ax = new V(1, 0, 0).applyQuaternion(it.mesh.quaternion);
        const axL = new V(C45 * (ax.x + ax.z), ax.y, C45 * (ax.z - ax.x)).normalize();
        const s1 = Math.sin(t * (blk ? 0 : 9)) * 0.24, s2 = Math.sin(t * (blk ? 0 : 9) + Math.PI) * 0.2;
        scan.position.copy(cc).addScaledVector(axL, s1); scan.quaternion.setFromUnitVectors(new V(0, 0, 1), axL);
        scan2.position.copy(cc).addScaledVector(axL, s2); scan2.quaternion.copy(scan.quaternion);
        scanM.color.setHex(blk ? 0xffa020 : routed ? flashCol : 0x9ffff0);
      }
      // data motes stream from the item into the core
      moteT -= dt;
      if (reviewing && !blk && moteT <= 0) {
        moteT = 0.035; cc.copy(mover.position); cc.y += 0.2;
        const d = tv.subVectors(CORE, cc);
        K.spawn(g, cc.x + K.R() * 0.2, cc.y + K.R() * 0.2, cc.z + K.R() * 0.2, d.x * 2.2, d.y * 2.2, d.z * 2.2, Math.random() < 0.5 ? 0xbffff0 : 0x7af0d8, 0.42, 0.05, 0, true);
      }
      // lightning from the core to the column capitals (and sputters when blocked)
      boltT -= dt;
      const arcing = (working && !blk && (reviewing || Math.random() < 0.02)) || (blk && Math.random() < 0.08);
      if (boltT <= 0) {
        boltT = 0.06;
        const show = arcing && Math.random() < (reviewing ? 0.85 : 0.6);
        bolt.forEach((b) => (b.visible = false));
        if (show) {
          const e = colPts[Math.floor(Math.random() * colPts.length)].clone();
          e.x *= 0.9; e.z *= 0.9; e.y = 3.6 + Math.random() * 0.6;
          const s0 = CORE.clone().addScaledVector(tv.subVectors(e, CORE).normalize(), 0.45);
          const pts = [s0]; for (let i = 1; i < bolt.length; i++) { const k = i / bolt.length; pts.push(new V().lerpVectors(s0, e, k).add(new V(K.R() * 0.3, K.R() * 0.3, K.R() * 0.3))); } pts.push(e);
          bolt.forEach((b, i) => { b.visible = true; along(b, pts[i], pts[i + 1]); b.scale.y = b.scale.z = 1; });
          boltM.color.setHex(blk ? 0xffb050 : 0xd8fff8);
          if (Math.random() < 0.4) K.spawn(g, e.x, e.y, e.z, K.R() * 2, Math.random() * 1.5, K.R() * 2, 0xbffff0, 0.25, 0.05, 2, true);
        }
      }
      if (reviewing && !blk && Math.random() < 0.25) K.spawn(g, K.R() * 0.15, 7.35, K.R() * 0.15, K.R() * 2, Math.random() * 1.5, K.R() * 2, 0xffffff, 0.22, 0.05, 0, true);
      waves.forEach((w) => { w.t += dt; const k = w.t / 0.8; w.m.visible = k > 0 && k < 1; if (w.m.visible) { w.m.scale.setScalar(1 + k * 2.6); w.m.material.opacity = 0.9 * (1 - k); } });
      // column lamps: route (chosen agent's color while it's sent), rework (red while a sent-back PR is aboard);
      // both blink amber while blocked
      routeLampM.emissive.setHex(blk ? (Math.sin(t * 8) > 0 ? 0xffa020 : 0) : sending ? flashCol : 0);
      rwLampM.emissive.setHex(blk ? (Math.sin(t * 8) < 0 ? 0xffa020 : 0) : it && rework ? (Math.sin(t * 6) > 0 ? 0xff3020 : 0x7a1006) : 0);
      // the klaxon on the sealed reject cradle is the blocked alarm now
      klax = blk ? 1 : Math.max(0, klax - dt);
      klaxSpin.rotation.y += dt * (klax > 0 ? 10 : 0);
      klaxM.emissive.setHex(klax > 0 ? 0xff2a10 : 0); klaxDome.material.opacity = klax > 0 ? 0.65 : 0.22;
      klaxDome.material.color.setHex(klax > 0 && Math.sin(t * 20) > 0 ? 0xff5030 : 0xff3020);
      stampFaceM.emissive.setHex(blk && Math.sin(t * 10) > 0 ? 0x7a1a08 : 0);
      // semaphore: arm raised while a plan is sent, its lamp and the chosen lens in the agent's color
      semUp = Math.max(0, semUp - dt * 0.6);
      semArm.rotation.x += ((semUp > 0 ? -1.0 : 0.15) - semArm.rotation.x) * Math.min(1, dt * 6);
      semLampM.emissive.setHex(blk ? (Math.sin(t * 8) > 0 ? 0xffa020 : 0) : semUp > 0 ? flashCol : 0);
      lensM.forEach((lm, i) => lm.emissive.setHex(blk ? (Math.sin(t * 8 + i) > 0 ? 0x5a3000 : 0) : i === dest && semUp > 0 ? ASM[i].lamp : idleLens(i, t)));
      passStripM.color.setHex(semUp > 0 ? (Math.floor(t * 8) % 2 ? flashCol : 0x2a2a20) : 0x0c2a14);
      fadeStrip(passStrip, [0.05, 0.16, 0.08]);
      // tally dials step one tick per plan
      planDial.rotation.z += ((-2.2 + (planN % 12) * 0.4) - planDial.rotation.z) * Math.min(1, dt * 8);
      rwDial.rotation.z += ((-2.2 + (rwN % 12) * 0.4) - rwDial.rotation.z) * Math.min(1, dt * 8);
      // printed paper tape: feeds out one notch per plan, a mark in the chosen agent's color at the slot
      tapeFeed = Math.min(1, tapeFeed + adt * 2.5);
      tape.forEach((tp, i) => {
        const u = (i - 1 + sm(tapeFeed)) / 7;
        tp.seg.visible = u >= 0;
        if (u < 0) return;
        const uu = Math.min(1, u); tapeCurve.getPoint(uu, tp.seg.position); const tn = tapeCurve.getTangent(uu);
        tp.seg.quaternion.setFromUnitVectors(new V(0, 1, 0), tn);
        const c = tapeMarks[i] || 0; if (c !== tp.c) { tp.c = c; tapeInk.setColorAt(i, tmpC.setHex(c || 0xe4d2a8)); tapeInk.instanceColor.needsUpdate = true; }
      });
      // vacuum gauges: spike on lift + pull, settle otherwise
      const vac = ph === 'rise' || ph === 'pull' ? -1.4 + Math.sin(t * 25) * 0.05 : working ? -0.3 + Math.sin(t * 3) * 0.1 : 0.8;
      vac1.rotation.z += (vac - vac1.rotation.z) * Math.min(1, dt * 6); vac2.rotation.z += (vac * 0.8 - vac2.rotation.z) * Math.min(1, dt * 4);
      sockN.rotation.z = blk ? -1.2 + Math.sin(t * 30) * 0.06 : working ? -0.4 + Math.sin(t * 4) * 0.25 : 0.6;
      // intake lift hardware
      plat.position.y = platY;
      const pv = (platY - lastPlat) / Math.max(dt, 1e-4); lastPlat = platY;
      sproc.rotation.y += pv * dt * 5; sproc2.rotation.y -= pv * dt * 6;
      const chL = 3.32 - platY; chains.position.set(TRAY.x, platY + chL / 2, TRAY.z + BZ + 0.16); chains.scale.y = Math.max(0.05, chL);
      cw.position.y = 2.6 - (platY - TRAY.y) * 0.9;
      cwChain.position.y = (3.32 + cw.position.y + 0.27) / 2; cwChain.scale.y = Math.max(0.05, 3.32 - cw.position.y - 0.27);
      platLampM.emissive.setHex(ph === 'rise' ? (Math.sin(t * 14) > 0 ? 0x46ff8a : 0) : 0);
      // lectern
      tick.forEach((m, i) => {
        let c = 0;
        if (blk) c = Math.sin(t * 8 + i) > 0 ? 0xffa020 : 0;
        else if (routed && it) c = flashCol;
        else if (reviewing) c = Math.random() < 0.5 ? 0x7af0d8 : 0;
        else if (working) c = i === Math.floor(t * 6) % 6 ? 0xffa63a : 0;
        else c = i === Math.floor(t * 1.5) % 6 ? 0x3a2a10 : 0;
        if (Math.random() < 0.3 || !reviewing) m.emissive.setHex(c);
      });
      lecN.rotation.z = blk ? -1.2 + Math.sin(t * 30) * 0.06 : reviewing ? Math.sin(t * 5) * 0.8 : working ? 0.3 : 0.9;
      const lt = routed && it && dest >= 0 ? leverAt(dest) : 0;
      lever.rotation.z += (lt - lever.rotation.z) * Math.min(1, dt * 8);
      knobM.emissive.setHex(blk ? (Math.sin(t * 8) > 0 ? 0x5a2000 : 0) : 0);
      // steam hisses from the dome vents (hard when blocked); condensation drips off the dome rim
      steamT -= dt;
      if (steamT <= 0) {
        steamT = blk ? 0.05 : 0.4;
        if (blk || Math.random() < 0.15) { const vv = vents[Math.floor(Math.random() * vents.length)]; K.spawn(g, vv.x, vv.y, vv.z, vv.x * 0.4 + K.R() * 0.3, blk ? 1.6 : 0.7, vv.z * 0.4 + K.R() * 0.3, blk ? 0xc8bca8 : 0x9a8e7c, blk ? 1.4 : 1.8, blk ? 0.16 : 0.12, -0.12); }
      }
      dripT -= dt;
      if (dripT <= 0) { dripT = 0.35 + Math.random() * 0.5; const a = (-20 + Math.random() * 130) * DEG; K.spawn(g, Math.cos(a) * 1.86, 4.98, Math.sin(a) * 1.86, 0, -0.2, 0, Math.random() < 0.5 ? 0xa8e0d0 : 0x6aa898, 1.0, 0.035, 5); }
      // the plate glows brighter while the planner works
      nameM.color.setScalar(blk ? (Math.sin(t * 9) > 0 ? 1 : 0.6) : working ? 1 : 0.72);
      // destination card: pops up with the route decision, stays while the item is sent; amber "!" while blocked
      const showV = routed && it && dest >= 0 && ph !== 'out' && ph !== 'idle';
      glyph.visible = !!(blk || showV);
      if (glyph.visible) {
        glyphT += dt;
        gB.visible = blk; gFrame.visible = blk;
        cards.forEach((c, i) => { c.g.visible = !blk && i === dest; if (c.g.visible) c.fm.opacity = 0.4 + Math.sin(t * 10) * 0.2; });
        const pop = blk ? 1 + Math.sin(t * 8) * 0.08 : Math.min(1.25, glyphT * 6) - Math.max(0, Math.min(0.25, (glyphT - 0.2) * 2));
        glyph.scale.setScalar(Math.max(0.01, pop));
        gFrame.material.color.setHex(0xffb020);
        gFrame.material.opacity = 0.35 + Math.sin(t * 10) * 0.2;
        if (blk) gBang.opacity = Math.sin(t * 9) > -0.2 ? 0.95 : 0.3;
        glyph.position.y = (blk ? 4.0 : 4.15) + Math.sin(t * 2) * 0.05;
      } else glyphT = 0;
      statLamp.set(M.stateShown, t);
      caution.update(t, dt, M.stateShown);
      syncInstances(); syncLamps();
    }
    // the lenses idle dim in their agents' colors (a slow chase while the planner works)
    function idleLens(i, t) { return it && Math.floor(t * 2) % Math.max(1, NA) === i ? (ASM[i].dim & 0xfefefe) : 0; }
    return { g, update };
  });
}
