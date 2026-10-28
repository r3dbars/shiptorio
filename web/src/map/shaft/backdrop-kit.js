// The floating city's backdrop kit (ART-PASS.md). The shaft camera is ORTHOGRAPHIC, so nothing gets smaller or slides
// slower with distance by itself: depth is faked here. A far layer follows the camera by a fraction of its moves
// (parallax), a band that must never end follows it all the way across and scrolls its wrapped texture instead, and
// every backdrop material dims with scene.backgroundIntensity like the sky (the bottleneck veil's "users" dark sky).
// stage.ts emits 'camera' on the Iron every frame once the camera is placed, before the render, so nothing lags.
//
//   import { artPass, backdrop } from '../backdrop-kit.js';
//   IRON.part('skyline', (K, root, ctx) => {
//     if (!artPass()) return { update() {} };
//     const B = backdrop(ctx.I, root);
//     const band = K.box(400, 30, 0.01, mat, 0, -10, -80, root);
//     B.follow(band, 0.92, { wrap: mat.map, span: 60 }); // endless: rides the camera across, texture scrolls at 8%
//     B.dim(mat);
//     return { update(t, dt) { if (!B.calm()) drift(dt); } };
//   });

import { buildoutOn, feature } from "../../flags";

const host = () => (typeof location === "undefined" ? "" : location.hostname);
const q = () => (typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search));

/** the floating-city art: a preview feature (on at shiptorio.dev, ?artpass=1 / ?artpass=0 anywhere; web/src/flags.ts).
 * The old city + keel install when it's off. */
export function artPass() {
  return feature("artpass", q().toString(), host());
}

/** the build-as-you-go floor growth runs only with Build as you go (web/src/flags.ts buildoutOn) */
export function buildout() {
  return typeof location !== "undefined" && buildoutOn();
}

const prefersReduced = () => typeof matchMedia !== "undefined" && !!matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One kit per part. I: the Iron (ctx.I); root: the part's root group (already in root space).
 * follow / dim are applied on every 'camera' event; calm() says to hold still (reduced motion or I.calm).
 */
export function backdrop(I, root) {
  const followers = [];
  const dims = [];
  let scene = null;
  let three = null;
  const tmp = { cam: null, right: null, up: null, d: null, inv: null };

  function vecs(camera) {
    if (!three) {
      const V = camera.position.constructor;
      three = { V, M4: camera.matrixWorld.constructor };
      tmp.cam = new V(); tmp.right = new V(); tmp.up = new V(); tmp.d = new V(); tmp.inv = new three.M4();
    }
  }

  function onCamera(e) {
    const camera = e.camera;
    if (!camera || !root.parent) return;
    vecs(camera);
    if (!scene) { let s = root; while (s.parent) s = s.parent; scene = s.isScene ? s : null; }
    // camera position and its right / up axes in root space (root may be rotated in the scene)
    root.parent.updateMatrixWorld();
    tmp.inv.copy(root.matrixWorld).invert();
    tmp.cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(tmp.inv);
    const rot = root.quaternion.clone().invert();
    tmp.right.setFromMatrixColumn(camera.matrixWorld, 0).applyQuaternion(rot).normalize();
    tmp.up.setFromMatrixColumn(camera.matrixWorld, 1).applyQuaternion(rot).normalize();
    const vh = camera.top - camera.bottom;
    for (const f of followers) {
      tmp.d.copy(tmp.cam).sub(f.home);
      const dr = tmp.d.dot(tmp.right), du = tmp.d.dot(tmp.up);
      const fx = f.wrap ? 1 : f.factor;
      f.obj.position.copy(f.base).addScaledVector(tmp.right, dr * fx).addScaledVector(tmp.up, du * f.factor);
      if (f.wrap) f.wrap.offset.x = f.u0 + (dr * (1 - f.factor)) / f.span;
      if (f.zoom) f.obj.scale.copy(f.scale).multiplyScalar(Math.pow(vh / f.vh0, f.zoom));
    }
    const k = scene && typeof scene.backgroundIntensity === "number" ? scene.backgroundIntensity : 1;
    for (const d of dims) {
      d.m.color.copy(d.c).multiplyScalar(d.floor + (1 - d.floor) * k);
      if (d.e) d.m.emissive.copy(d.e).multiplyScalar(d.floor + (1 - d.floor) * k);
    }
  }
  I.on("camera", onCamera);

  return {
    /**
     * Keep obj (in root space) following the camera by `factor` of its moves: 0 = stays in the world, 1 = stays on
     * screen. Far layers 0.6-0.95. opts.wrap: a RepeatWrapping texture on obj; then obj rides the camera all the way
     * across (so it never ends) and the texture scrolls by (1 - factor) of the move, `span` world units per repeat.
     * opts.zoom: 0..1, how much obj keeps its screen size when the view zooms (vh0: the view height it was laid out
     * for, default the ALL view's 62). opts.home: the root point where obj sits as built (default: where it is).
     * Marks obj dyn (it moves every frame) and turns off its frustum culling.
     */
    follow(obj, factor, opts = {}) {
      obj.userData.dyn = true;
      obj.traverse((o) => (o.frustumCulled = false));
      const f = {
        obj, factor, wrap: opts.wrap || null, span: opts.span || 1, u0: opts.wrap ? opts.wrap.offset.x : 0,
        zoom: opts.zoom || 0, vh0: opts.vh0 || 62, base: obj.position.clone(), scale: obj.scale.clone(),
        home: opts.home ? new obj.position.constructor(...opts.home) : obj.position.clone(),
      };
      followers.push(f);
      return f;
    },
    /** dim a material (color, and emissive if it has one) with scene.backgroundIntensity; floor: the least it keeps */
    dim(m, floor = 0.25) {
      for (const one of Array.isArray(m) ? m : [m]) dims.push({ m: one, c: one.color.clone(), e: one.emissive ? one.emissive.clone() : null, floor });
    },
    /** hold still: reduced motion, or the game's calm mode */
    calm() {
      return !!I.calm || prefersReduced();
    },
    artPass,
    buildout,
  };
}

/** render order bands (ART-PASS.md): far to near, all drawn before the bottleneck veil (-1) and the shaft (0) */
export const ORDER = { sky: -40, skyFar: -30, skyMid: -26, skyNear: -22, flotilla: -18, smog: -14, haze: -10 };
/** z bands (root space): the veil sits at -33.5, so the backdrop stays behind it */
export const Z = { skyFar: -95, skyMid: -80, skyNear: -64, flotilla: [-40, -56], smog: [-36, -60], haze: -34.5 };

export default { artPass, buildout, backdrop, ORDER, Z };
