// The pixel-art pass from docs/ART.md: render the 3D scene small, then one full-screen
// pass samples each low-res pixel at its center, adds outlines, a slight
// saturation/contrast boost, optional ordered dither, and quantizes colors.
// Same shader as docs/art-prototype.html. Settings are Justin's locked values.

import * as THREE from "three";

import { LOOK } from "./world";

// The finish: Justin's locked classic values, or Black Iron's (docs/art/IRON-STYLE.md §9) which add
// an ink-colored outline, a cheap pixel bloom, a split-tone grade and a vignette. With bloom, grade and
// vignette at 0 and black ink the shader is exactly the classic one.
export interface Finish {
  levels: number; // colors per channel
  dither: number;
  outline: number; // darken toward ink by this much when a neighbor is brighter...
  threshold: number; // ...by at least this much luminance
  saturation: number;
  contrast: number;
  ink: number;
  bloom: number;
  bloomThresh: number;
  vignette: number;
  grade: number; // split tone: shadows toward `shadow`, highlights toward `high`
  shadow: number;
  high: number;
}

export const PIXEL = { size: LOOK.pixel, ...LOOK.finish };

// "Sharper when zoomed out": pixels shrink as you zoom out, never below 1px.
// zoom > 1 means zoomed out (the view covers more world). `base` lets the frame governor coarsen it.
export const pixelSizeFor = (zoom: number, base = PIXEL.size) => Math.max(1, Math.min(base, Math.round(base / zoom)));

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 res;
  uniform float pxs, levels, dither, outline, threshold, saturation, contrast, bloom, bloomThresh, vignette, grade;
  uniform vec3 ink, shadowT, highT;
  varying vec2 vUv;

  float b2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float b4(vec2 a) { return b2(0.5 * a) * 0.25 + b2(a); }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 tap(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }

  void main() {
    vec2 p = floor(vUv * res);
    vec2 uv = (p + 0.5) / res;
    vec2 t = 1.0 / res;
    vec3 c = tap(uv);
    float l = luma(c);
    float n = max(
      max(luma(tap(uv + vec2(t.x, 0.0))), luma(tap(uv - vec2(t.x, 0.0)))),
      max(luma(tap(uv + vec2(0.0, t.y))), luma(tap(uv - vec2(0.0, t.y))))
    );
    vec3 acc = vec3(0.0);
    if (bloom > 0.0) {
      float br = 2.0 / pxs;
      for (int i = 0; i < 8; i++) {
        float a = (float(i) + b4(p)) * 0.7854;
        vec2 d = vec2(cos(a), sin(a)) * t * br;
        vec3 s1 = tap(uv + d * 2.0); vec3 s2 = tap(uv + d * 4.5); vec3 s3 = tap(uv + d * 8.0);
        acc += s1 * max(0.0, luma(s1) - bloomThresh) * 1.2 + s2 * max(0.0, luma(s2) - bloomThresh) * 0.8 + s3 * max(0.0, luma(s3) - bloomThresh) * 0.5;
      }
      acc *= 1.5; // 8 taps standing in for the reference's 12
    }
    c = mix(c, ink, outline * step(threshold, n - l));
    c += acc * bloom * 0.16;
    c = mix(vec3(luma(c)), c, saturation);
    c = (c - 0.5) * contrast + 0.5;
    if (grade > 0.0) {
      vec3 tg = mix(shadowT, highT, smoothstep(0.05, 0.85, clamp(luma(c), 0.0, 1.0)));
      c *= 1.0 + grade * (tg - vec3(luma(tg))) * 1.6;
    }
    vec2 q = vUv - 0.5;
    c *= 1.0 - vignette * smoothstep(0.3, 0.8, length(q * vec2(1.0, 0.85)));
    float d = (b4(p) - 0.5) * dither;
    c = floor(c * levels + d + 0.5) / levels;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export class PixelPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        res: { value: new THREE.Vector2(2, 2) },
        pxs: { value: PIXEL.size },
        levels: { value: PIXEL.levels },
        dither: { value: PIXEL.dither },
        outline: { value: PIXEL.outline },
        threshold: { value: PIXEL.threshold },
        saturation: { value: PIXEL.saturation },
        contrast: { value: PIXEL.contrast },
        ink: { value: new THREE.Color(PIXEL.ink) },
        bloom: { value: PIXEL.bloom },
        bloomThresh: { value: PIXEL.bloomThresh },
        vignette: { value: PIXEL.vignette },
        grade: { value: PIXEL.grade },
        shadowT: { value: new THREE.Color(PIXEL.shadow) },
        highT: { value: new THREE.Color(PIXEL.high) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(width: number, height: number, pixel: number) {
    const w = Math.max(1, Math.ceil(width / pixel));
    const h = Math.max(1, Math.ceil(height / pixel));
    this.target.setSize(w, h);
    this.material.uniforms.res.value.set(w, h);
    this.material.uniforms.pxs.value = pixel;
  }

  // the frame governor drops the bloom taps on slow devices
  setBloom(on: boolean) {
    this.material.uniforms.bloom.value = on ? PIXEL.bloom : 0;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
