// @ts-nocheck -- time-boxed spike, kept loose on purpose
// Post pass for /deck3d.html: color + depth + normals from the tiny target -> outlines, palette snap, sunset sky.
// Outlines follow t3ssel8r: a pixel whose neighbor is much farther away goes dark (silhouettes), a pixel on a convex
// crease of the same surface goes light (edge highlights). Then every pixel snaps to the Black Iron 48 palette.
import * as THREE from "three";

// art/palette/black-iron-48.hex (docs/PIXEL-PLAN.md)
const HEX = "0a0604 181211 291b17 432f29 6b5360 8f6f62 121e2b 273349 3d4d6a 7d8ea3 713e30 a04430 cd4f27 e28059 f2b48c 422616 6d370c a36915 c98115 fdc727 fdec9a 351705 5a3521 834621 ae6237 b48254 652203 bc3c0b e44e1b f6601f fc8717 fdad1e f9c47a 623a3a 82525a c0988e eed3c5 fdfaec 28545a 0ea0ac 41f3f7 bcf6f6 1c450f 1ab004 81f381 6a0d0d c8231b ff5b4a".split(" ");

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tNormal; uniform sampler2D tSky;
uniform vec2 texel; uniform float near; uniform float far; uniform float aspect;
uniform vec2 skyShift; uniform float usePalette; uniform float useLines;
uniform vec3 pal[48];
varying vec2 vUv;

float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
float linAt(vec2 uv) { return -perspectiveDepthToViewZ(depthAt(uv), near, far); }
vec3 nAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

vec3 sky(vec2 uv) {
  // cover by height, a window of the 3:1 panorama, nudged by the camera for a little parallax
  float w = min(1.0, aspect / 3.0) * 0.92;
  vec2 s = vec2(0.47 + (uv.x - 0.5) * w + skyShift.x, 0.06 + uv.y * 0.88 + skyShift.y);
  return texture2D(tSky, s).rgb;
}

void main() {
  float d0 = depthAt(vUv);
  vec3 col;
  if (d0 >= 0.99999) col = sky(vUv);
  else col = texture2D(tColor, vUv).rgb;

  if (useLines > 0.5 && d0 < 0.99999) {
    float z = linAt(vUv);
    vec3 n = nAt(vUv);
    float dEdge = 0.0, nEdge = 0.0;
    vec2 offs[4]; offs[0] = vec2(1, 0); offs[1] = vec2(-1, 0); offs[2] = vec2(0, 1); offs[3] = vec2(0, -1);
    for (int i = 0; i < 4; i++) {
      vec2 uv = vUv + offs[i] * texel;
      float zn = depthAt(uv) >= 0.99999 ? far : linAt(uv);
      dEdge += clamp(zn - z, 0.0, 2.0);
      vec3 nn = nAt(uv);
      // same surface-ish (no big depth jump) and the normal turns away: a crease. Bias picks the lit side.
      float same = step(abs(zn - z), 0.35);
      float turn = dot(n - nn, vec3(-0.3, 1.0, 0.6));
      nEdge += same * smoothstep(0.05, 0.25, turn) * (1.0 - clamp(dot(n, nn), 0.0, 1.0));
    }
    if (dEdge > 0.45) col *= 0.32;
    else if (nEdge > 0.12) col = col * 1.45 + 0.02;
  }

  col = toSRGB(clamp(col, 0.0, 1.0));
  if (usePalette > 0.5) {
    // nearest palette color, weighted toward how the eye reads brightness
    vec3 best = pal[0]; float bd = 1e9;
    for (int i = 0; i < 48; i++) {
      vec3 e = (col - pal[i]) * vec3(0.30, 0.59, 0.11);
      float dd = dot(e, e) + 0.35 * dot(col - pal[i], col - pal[i]);
      if (dd < bd) { bd = dd; best = pal[i]; }
    }
    col = best;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function makePost() {
  const mk = () => new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType });
  const colorRT = mk();
  colorRT.depthTexture = new THREE.DepthTexture(4, 4);
  colorRT.depthTexture.type = THREE.UnsignedIntType;
  const normalRT = mk();
  const normalMat = new THREE.MeshNormalMaterial({ flatShading: true });

  const skyTex = new THREE.TextureLoader().load("/deck/art/sky.webp");
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.minFilter = THREE.LinearMipmapLinearFilter;
  skyTex.magFilter = THREE.LinearFilter;

  const pal = HEX.map((h) => new THREE.Color().setRGB(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, THREE.LinearSRGBColorSpace));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorRT.texture }, tDepth: { value: colorRT.depthTexture }, tNormal: { value: normalRT.texture }, tSky: { value: skyTex },
      texel: { value: new THREE.Vector2() }, near: { value: 1 }, far: { value: 100 }, aspect: { value: 1.7 },
      skyShift: { value: new THREE.Vector2() }, usePalette: { value: 1 }, useLines: { value: 1 },
      pal: { value: pal.map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: FRAG,
    depthTest: false, depthWrite: false,
  });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    palette: true,
    lines: true,
    setSize(w, h) {
      colorRT.setSize(w, h); normalRT.setSize(w, h);
      mat.uniforms.texel.value.set(1 / w, 1 / h);
      mat.uniforms.aspect.value = w / h;
    },
    render(renderer, scene, camera, dYaw, dPitch) {
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(colorRT);
      camera.layers.enable(1); // halos only in the color pass
      renderer.render(scene, camera);
      camera.layers.disable(1);
      const bg = scene.background; const fog = scene.fog;
      scene.overrideMaterial = normalMat; scene.fog = null;
      renderer.setRenderTarget(normalRT);
      renderer.render(scene, camera);
      scene.overrideMaterial = null; scene.fog = fog; scene.background = bg;
      const u = mat.uniforms;
      u.near.value = camera.near; u.far.value = camera.far;
      u.skyShift.value.set(-dYaw * 0.06, -dPitch * 0.12);
      u.usePalette.value = this.palette ? 1 : 0;
      u.useLines.value = this.lines ? 1 : 0;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    },
  };
}
