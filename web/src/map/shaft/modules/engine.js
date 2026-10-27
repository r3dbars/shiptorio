// THE AETHER ENGINE: the thing that keeps the island up. It hangs under the keel's tip (keel-shape.js): an iron
// collar bolted into the rock, a brass cage holding a teal aether core, two brass rings slowly turning opposite
// ways around it, teal veins glowing in the rock's cracks (keel-shape crack anchors) and a soft beam falling from
// the cage's finial down into the smog.
//
// It reads the factory: the glow follows TOTAL POWER (every plant's { level, online } summed over the plants)
// and the whole engine sags to a dim slate-teal ember when the AI is offline (driver.state.brain.online false,
// or no plant online at all). Calm: the rings turn slowly, the core breathes slowly; under reduced motion or calm mode (backdrop-kit calm())
// nothing moves, only the glow level changes.
//
// Only installs with ?artpass=1 (see ART-PASS.md). Budget: 1 light (part 'engine'), <= 12 draw calls after the
// bake: 4 static materials (brass, dark brass, iron, aether glow) + core, halo, two rings, the beam.

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { artPass, backdrop } from '../backdrop-kit.js';
import { KEEL } from '../keel-shape.js';

const AETHER = 0x7af0d8;
const PLANTS = new Set(['steam', 'dynamo', 'battery', 'geothermal']);

export default function install(IRON) {
  if (!artPass()) return;
  IRON.part('engine', (K, root, ctx) => {
    const T = K.THREE, I = ctx.I;
    const B = backdrop(I, root); // only for calm(): the engine itself is world-fixed
    const calm = () => B.calm();
    let seed = 61;
    const rr = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // ---------------------------------------------------------------- palette (few materials: the bake merges per material)
    const P = {
      brass: K.mat(0x9c7236, { shine: 26, spec: 0x5a4424 }),
      brassD: K.mat(0x6c4e20, { shine: 16, spec: 0x3a2c14 }),
      iron: K.mat(0x3e342c, { shine: 20, spec: 0x2a2a30 }),
      copper: K.mat(0x8c5232, { shine: 30, spec: 0x5a3a2a }),
      vein: new T.MeshBasicMaterial({ color: AETHER, fog: false }), // cracks, cage lamps, rivet glints: one glow
    };
    const veinOn = new T.Color(AETHER), veinOff = new T.Color(0x1c3634);

    const [sx, sy, sz] = KEEL.SOCKET;
    // marked dyn (it never moves): the bake then merges everything static under it by material alone, without
    // cutting it into the shaft's left/right cells, so the whole engine stays ~9 draw calls
    const eng = K.dyn(K.group(root, sx, sy, sz));
    eng.name = 'aether-engine';

    // ---------------------------------------------------------------- the mount: an iron collar bolted into the tip
    K.cyl(1.45, 1.25, 0.42, P.iron, 10, 0, -0.1, 0, eng);
    K.cyl(1.52, 1.52, 0.1, P.brassD, 10, 0, -0.32, 0, eng);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; K.box(0.1, 0.12, 0.1, P.brass, Math.sin(a) * 1.46, -0.18, Math.cos(a) * 1.46, eng); }
    // four iron straps climbing into the rock, riveted, splayed like roots
    for (const [ax, az] of [[-1, 0.7], [1, 0.7], [-0.7, -1], [0.7, -1]]) {
      const s = K.box(0.22, 1.9, 0.12, P.iron, ax * 1.25, 0.75, az * 1.0, eng);
      s.rotation.z = -ax * 0.42; s.rotation.x = az * 0.25;
      for (const k of [0.25, 0.65]) K.box(0.08, 0.08, 0.06, P.brass, ax * (1.25 + 0.38 * k), 0.75 - 0.6 + 1.2 * k, az * 1.0 + 0.08, eng);
    }
    // three pistons (fixed rods + brass sleeves) hold the cage under the collar
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const px = Math.sin(a) * 1.05, pz = Math.cos(a) * 1.05;
      K.cyl(0.1, 0.1, 0.9, P.iron, 6, px, -0.75, pz, eng);
      K.cyl(0.16, 0.16, 0.36, P.brass, 6, px, -0.6, pz, eng);
    }

    // ---------------------------------------------------------------- the cage: brass hoops and curved bars
    const CY = -2.55; // core centre (engine local)
    K.torus(1.36, 0.11, P.brass, 5, 18, 0, -1.2, 0, eng).rotation.x = Math.PI / 2;
    K.torus(1.62, 0.07, P.brassD, 4, 18, 0, CY, 0, eng).rotation.x = Math.PI / 2;
    K.torus(0.78, 0.09, P.brass, 5, 14, 0, -3.95, 0, eng).rotation.x = Math.PI / 2;
    const BARS = 9;
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2;
      const at = (r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
      K.tube([at(1.36, -1.2), at(1.7, -1.9), at(1.66, CY - 0.4), at(1.2, -3.55), at(0.78, -3.95)], 0.055, P.brassD, eng, 10, 4);
      if (Math.cos(a) > -0.2) K.box(0.09, 0.09, 0.09, P.vein, ...at(1.7, CY), eng); // teal lamps on the front bars
    }
    // the cup under the core, the finial, the drip lamp the beam falls from
    K.lathe([[0.82, 0], [0.7, -0.22], [0.5, -0.4], [0.3, -0.55], [0.22, -0.7]], P.iron, 10, 0, -3.95, 0, eng);
    K.cone(0.22, 0.9, P.iron, 8, 0, -5.1, 0, eng).rotation.x = Math.PI;
    K.sph(0.14, P.vein, 0, -5.58, 0, eng, 8, 6);
    // a brass pressure dial on the collar's front, teal needle
    K.cyl(0.32, 0.32, 0.08, P.brass, 10, 0.2, -0.12, 1.46, eng).rotation.x = Math.PI / 2;
    K.cyl(0.25, 0.25, 0.03, P.iron, 10, 0.2, -0.12, 1.51, eng).rotation.x = Math.PI / 2;
    K.box(0.03, 0.2, 0.02, P.vein, 0.2, -0.06, 1.53, eng).rotation.z = -0.6;

    // ---------------------------------------------------------------- the core, its halo, the two rings (the movers)
    const coreMat = new T.MeshBasicMaterial({ color: AETHER, fog: false });
    const core = K.dyn(K.mesh(new T.IcosahedronGeometry(0.82, 1), coreMat, 0, CY, 0, eng));
    const haloMat = K.glow(AETHER, 0.22, true);
    const halo = K.dyn(K.sph(1.5, haloMat, 0, CY, 0, eng, 12, 8));
    halo.renderOrder = 2;

    function ringGeo(r, teeth, tooth) {
      const parts = [new T.TorusGeometry(r, 0.09, 4, 28)];
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2, b = new T.BoxGeometry(tooth[0], tooth[1], tooth[2]);
        b.rotateZ(a); b.translate(Math.cos(a) * (r + 0.1), Math.sin(a) * (r + 0.1), 0);
        parts.push(b);
      }
      return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    }
    const ringA = K.dyn(K.group(eng, 0, CY, 0)); ringA.rotation.set(1.15, 0, 0.35);
    const ringB = K.dyn(K.group(eng, 0, CY, 0)); ringB.rotation.set(1.95, 0, -0.5);
    const spinA = K.dyn(K.mesh(ringGeo(2.55, 16, [0.16, 0.12, 0.14]), P.brassD, 0, 0, 0, ringA));
    const spinB = K.dyn(K.mesh(ringGeo(2.25, 8, [0.12, 0.24, 0.1]), P.copper, 0, 0, 0, ringB));

    // ---------------------------------------------------------------- the beam: a soft cone into the smog
    const beamTex = K.canvasTex(4, 64, (g, w, h) => {
      for (let y = 0; y < h; y++) {
        const f = 1 - y / (h - 1), band = 0.75 + 0.25 * ((y % 9) < 2 ? 1 : 0);
        const v = Math.round(255 * Math.pow(f, 1.6) * band);
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, w, 1); // canvas top = the beam's top
      }
    });
    beamTex.magFilter = beamTex.minFilter = T.LinearFilter; beamTex.wrapS = T.ClampToEdgeWrapping;
    const BEAM_L = 12; // fades out around the smog's top (KEEL.SMOG_TOP); the smog swallows the rest
    const beamMat = new T.MeshBasicMaterial({ color: 0x3ee0c0, map: beamTex, transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const beamGeo = new T.CylinderGeometry(0.28, 3.4, BEAM_L, 12, 1, true);
    const beam = K.dyn(K.mesh(beamGeo, beamMat, 0, -5.6 - BEAM_L / 2, 0, eng));
    beam.renderOrder = 1;

    // ---------------------------------------------------------------- veins in the rock's cracks
    // each crack (KEEL.CRACKS: at = its lower end on the front face, dir = the way it runs up, len) carries a jagged
    // vein: a soot groove with a teal glow line on top, hugging the face (KEEL.front(y)). Every other crack forks.
    // Built under the engine group, socket-relative, so they merge with it.
    const rel = (q) => q.map(([x, y, z]) => [x - sx, y - sy, z - sz]);
    const onFace = (x, y, lift) => [x, y, KEEL.front(y) + 0.05 + lift];
    KEEL.CRACKS.forEach((c, ci) => {
      const [ax, ay] = c.at, [dx, dy] = c.dir, n = 6, pts = [];
      for (let i = 0; i <= n; i++) {
        const f = (i / n) * c.len, w = i > 0 && i < n ? (rr() - 0.5) * 0.8 : 0; // zig-zag across the run
        pts.push([ax + dx * f - dy * w, ay + dy * f + dx * w]);
      }
      const line = (q, lift) => rel(q.map(([x, y]) => onFace(x, y, lift)));
      K.tube(line(pts, 0), 0.13, P.iron, eng, n * 3, 4);
      K.tube(line(pts, 0.1), 0.06, P.vein, eng, n * 3, 4);
      if (ci % 2 === 0) {
        const m = pts[3], side = ci % 4 ? 1 : -1;
        const br = [m, [m[0] + side * 0.7 + dx * 0.6, m[1] + 0.7], [m[0] + side * 1.3 + dx * 1.2, m[1] + 1.5]];
        K.tube(line(br, 0), 0.09, P.iron, eng, 6, 4);
        K.tube(line(br, 0.08), 0.04, P.vein, eng, 6, 4);
      }
    });

    // ---------------------------------------------------------------- the one light
    const light = K.light(AETHER, 2.4, 11, sx, sy + CY, sz + 1.6, root);

    // the engine casts nothing (it hangs in open air) and nothing of ours needs shadows
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

    // ---------------------------------------------------------------- reading the factory
    function readPower() {
      const plants = I.stationList.filter((s) => PLANTS.has(s.type));
      let sum = 0, on = 0;
      for (const s of plants) {
        let p = null;
        try { p = I.driver.power ? I.driver.power(s) : null; } catch (e) { p = null; }
        p = p || { level: 1, online: true };
        if (p.online === false) continue;
        on++; sum += Math.max(0, Math.min(1, p.level));
      }
      const brain = I.driver && I.driver.state && I.driver.state.brain;
      const ai = !(brain && brain.online === false);
      return { level: plants.length ? sum / plants.length : 0, online: ai && on > 0 };
    }

    const coreOn = new T.Color(0x3ccfb4), coreHot = new T.Color(AETHER), coreOff = new T.Color(0x2a4644);
    const tmpC = new T.Color();
    // the metal goes dark with the core (and picks up a teal sheen while it runs), so offline reads as dead
    const metals = [P.brass, P.brassD, P.copper].map((m) => ({ m, base: m.color.clone() }));
    const sheen = new T.Color(AETHER);
    let glow = 0.6, ph = 0;
    const api = { force: null, glow: 0, level: 0, online: true };
    I._engine = api; // the dev harness / screenshot tool reads (and can force) the engine's state

    return {
      update(t, dt) {
        const pw = api.force || readPower();
        api.level = pw.level; api.online = pw.online;
        // target glow: 0.12 when the AI is offline, else 0.3 .. 1 with total power
        const want = pw.online ? 0.3 + 0.7 * Math.max(0, Math.min(1, pw.level)) : 0.12;
        glow += (want - glow) * (calm() ? 1 : Math.min(1, dt * 1.2));
        api.glow = glow;
        const still = calm();
        if (!still) ph += dt * (0.5 + 0.7 * glow);
        const breathe = still ? 0 : Math.sin(ph * 1.1) * 0.5 + 0.5;

        // core + halo
        tmpC.copy(coreOff).lerp(coreOn, Math.min(1, glow * 1.3));
        if (glow > 0.7) tmpC.lerp(coreHot, (glow - 0.7) * 1.2 * (0.6 + 0.4 * breathe));
        coreMat.color.copy(tmpC);
        haloMat.opacity = 0.04 + 0.14 * glow * (0.8 + 0.2 * breathe);
        halo.scale.setScalar(0.85 + 0.25 * glow + 0.05 * breathe);
        if (!still) { core.rotation.y += dt * 0.15; core.rotation.x += dt * 0.05; }
        core.scale.setScalar(1 + 0.04 * breathe * glow);

        // rings: slow, opposite ways, slower as power falls; almost stopped offline
        if (!still) {
          const sp = 0.06 + 0.32 * glow;
          spinA.rotation.z += dt * sp;
          spinB.rotation.z -= dt * sp * 1.3;
        }

        for (const { m, base } of metals) { m.color.copy(base).multiplyScalar(0.45 + 0.55 * glow); m.emissive.copy(sheen).multiplyScalar(0.1 * glow); }
        // veins, cage lamps, the dial
        P.vein.color.copy(veinOff).lerp(veinOn, Math.min(1, 0.15 + glow * (0.85 + 0.15 * breathe)));

        // the beam: brighter with power, gone when offline
        beamMat.opacity = pw.online ? 0.08 + 0.3 * glow * (0.85 + 0.15 * breathe) : 0.02;

        light.intensity = 0.2 + 1.3 * glow;
      },
    };
  });
}
