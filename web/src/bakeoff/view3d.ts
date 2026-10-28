// @ts-nocheck -- bake-off spike, kept loose like src/deck3d/
// One tiny 3D view for the bake-off page: render a scene into a W x H target (the same art grid the 2D side draws
// on), then the deck3d post recipe: dark outlines where depth jumps, light creases, snap to the Black Iron 48.
// The canvas is W x H and the page blows it up by a whole number with image-rendering: pixelated.
// Drag to orbit a little; it springs back home. Calm: nothing moves the camera on its own.
import * as THREE from "three";

const HEX = "0a0604 181211 291b17 432f29 6b5360 8f6f62 121e2b 273349 3d4d6a 7d8ea3 713e30 a04430 cd4f27 e28059 f2b48c 422616 6d370c a36915 c98115 fdc727 fdec9a 351705 5a3521 834621 ae6237 b48254 652203 bc3c0b e44e1b f6601f fc8717 fdad1e f9c47a 623a3a 82525a c0988e eed3c5 fdfaec 28545a 0ea0ac 41f3f7 bcf6f6 1c450f 1ab004 81f381 6a0d0d c8231b ff5b4a".split(" ");

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tNormal;
uniform vec2 texel; uniform float near; uniform float far; uniform float usePalette; uniform float useLines;
uniform vec3 pal[48];
varying vec2 vUv;
float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
float linAt(vec2 uv) { return -perspectiveDepthToViewZ(depthAt(uv), near, far); }
vec3 nAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  float d0 = depthAt(vUv);
  vec4 c4 = texture2D(tColor, vUv);
  vec3 col = c4.rgb;
  float hit = d0 < 0.99999 ? 1.0 : 0.0;
  float a = max(hit, step(0.5, c4.a)); // smoke writes color but no depth: no outline round it
  if (useLines > 0.5) {
    vec2 offs[4]; offs[0] = vec2(1, 0); offs[1] = vec2(-1, 0); offs[2] = vec2(0, 1); offs[3] = vec2(0, -1);
    if (hit < 0.5) {
      // 1px soot outline OUTSIDE the silhouette, like the 2D Px.outline()
      float near1 = 0.0;
      for (int i = 0; i < 4; i++) near1 += depthAt(vUv + offs[i] * texel) < 0.99999 ? 1.0 : 0.0;
      if (near1 > 0.0 && a < 0.5) { col = vec3(0.0); a = 1.0; }
    } else {
      float z = linAt(vUv); vec3 n = nAt(vUv);
      float dEdge = 0.0, nEdge = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 uv = vUv + offs[i] * texel;
        float zn = depthAt(uv) >= 0.99999 ? far : linAt(uv);
        dEdge += clamp(zn - z, 0.0, 2.0);
        vec3 nn = nAt(uv);
        float same = step(abs(zn - z), 0.35);
        float turn = dot(n - nn, vec3(0.6, 1.0, 0.4));
        nEdge += same * smoothstep(0.05, 0.25, turn) * (1.0 - clamp(dot(n, nn), 0.0, 1.0));
      }
      if (dEdge > 0.5 && dEdge < 7.9) col *= 0.35;
      else if (nEdge > 0.12) col = col * 1.4 + 0.02;
    }
  }
  col = toSRGB(clamp(col, 0.0, 1.0));
  if (usePalette > 0.5) {
    vec3 best = pal[0]; float bd = 1e9;
    for (int i = 0; i < 48; i++) {
      vec3 e = (col - pal[i]) * vec3(0.30, 0.59, 0.11);
      float dd = dot(e, e) + 0.35 * dot(col - pal[i], col - pal[i]);
      if (dd < bd) { bd = dd; best = pal[i]; }
    }
    col = best;
  }
  gl_FragColor = vec4(col * a, a);
}`;

// 4-band toon ramp: hand-shading steps, one more than the deck spike so round things get more volume
const ramp = new THREE.DataTexture(new Uint8Array([60, 60, 60, 255, 120, 120, 120, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 4, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
/** Polished metal: a smooth Phong highlight that the palette snap turns into hard bands and a glint, like hand shading. */
export const metal = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 36, specular: 0x6a5a48, ...extra });
export const glow = (color, intensity = 1.6) => new THREE.MeshToonMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, gradientMap: ramp });

/** Mount a tiny 3D view on a canvas. world = { scene, target: Vector3, radius, step(dt, t) }. */
export function mountView(canvas, W, H, world, { yaw = 0, pitch = 0.32, fov = 22, fill = 0.9 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  const camera = new THREE.PerspectiveCamera(fov, W / H, 1, 200);
  const mk = () => new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType });
  const colorRT = mk();
  colorRT.depthTexture = new THREE.DepthTexture(W, H); colorRT.depthTexture.type = THREE.UnsignedIntType;
  const normalRT = mk();
  const normalMat = new THREE.MeshNormalMaterial();
  const pal = HEX.map((h) => new THREE.Color().setRGB(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, THREE.LinearSRGBColorSpace));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorRT.texture }, tDepth: { value: colorRT.depthTexture }, tNormal: { value: normalRT.texture },
      texel: { value: new THREE.Vector2(1 / W, 1 / H) }, near: { value: 1 }, far: { value: 200 }, usePalette: { value: 1 }, useLines: { value: 1 },
      pal: { value: pal.map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: FRAG, depthTest: false, depthWrite: false, transparent: true,
  });
  const quad = new THREE.Scene(); quad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const home = { yaw, pitch };
  const cam = { ...home };
  const dist = world.radius / Math.tan((fov * Math.PI) / 360) / fill;
  let drag = null;
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    cam.yaw = Math.max(home.yaw - 0.9, Math.min(home.yaw + 0.9, drag.yaw - (e.clientX - drag.x) * 0.008));
    cam.pitch = Math.max(0.05, Math.min(0.9, drag.pitch + (e.clientY - drag.y) * 0.006));
  });
  const up = () => (drag = null);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);

  const opts = { palette: true, lines: true };
  function render(dt, t) {
    if (!drag) { const s = 1 - Math.exp(-dt * 2.4); cam.yaw += (home.yaw - cam.yaw) * s; cam.pitch += (home.pitch - cam.pitch) * s; }
    const tg = world.target;
    camera.position.set(tg.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist, tg.y + Math.sin(cam.pitch) * dist, tg.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist);
    camera.lookAt(tg); camera.updateMatrixWorld();
    world.step(dt, t);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(colorRT); renderer.render(world.scene, camera);
    world.scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(normalRT); renderer.render(world.scene, camera);
    world.scene.overrideMaterial = null;
    mat.uniforms.near.value = camera.near; mat.uniforms.far.value = camera.far;
    mat.uniforms.usePalette.value = opts.palette ? 1 : 0; mat.uniforms.useLines.value = opts.lines ? 1 : 0;
    renderer.setRenderTarget(null); renderer.render(quad, qcam);
  }
  return { render, opts, cam, home };
}
