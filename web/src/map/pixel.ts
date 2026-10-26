// The pixel-art pass from docs/ART.md: render the 3D scene small, then one full-screen
// pass samples each low-res pixel at its center, adds outlines, a slight
// saturation/contrast boost, optional ordered dither, and quantizes colors.
// Same shader as docs/art-prototype.html. Settings are Justin's locked values.

import * as THREE from "three";

export const PIXEL = {
  size: 2, // render at 1/2 resolution, nearest-neighbor upscale
  levels: 32, // colors per channel
  dither: 0,
  outline: 0.35, // darken by 35% when a neighbor is brighter...
  threshold: 0.12, // ...by at least this much luminance
  saturation: 1.05,
  contrast: 1.05,
};

// "Sharper when zoomed out": pixels shrink as you zoom out, never below 1px.
// zoom > 1 means zoomed out (the view covers more world).
export const pixelSizeFor = (zoom: number) => Math.max(1, Math.min(PIXEL.size, Math.round(PIXEL.size / zoom)));

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 res;
  uniform float levels, dither, outline, threshold, saturation, contrast;
  varying vec2 vUv;

  float b2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float b4(vec2 a) { return b2(0.5 * a) * 0.25 + b2(a); }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec2 p = floor(vUv * res);
    vec2 uv = (p + 0.5) / res;
    vec2 t = 1.0 / res;
    vec3 c = texture2D(tDiffuse, uv).rgb;
    float l = luma(c);
    float n = max(
      max(luma(texture2D(tDiffuse, uv + vec2(t.x, 0.0)).rgb), luma(texture2D(tDiffuse, uv - vec2(t.x, 0.0)).rgb)),
      max(luma(texture2D(tDiffuse, uv + vec2(0.0, t.y)).rgb), luma(texture2D(tDiffuse, uv - vec2(0.0, t.y)).rgb))
    );
    c *= 1.0 - outline * step(threshold, n - l);
    c = mix(vec3(luma(c)), c, saturation);
    c = (c - 0.5) * contrast + 0.5;
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
        levels: { value: PIXEL.levels },
        dither: { value: PIXEL.dither },
        outline: { value: PIXEL.outline },
        threshold: { value: PIXEL.threshold },
        saturation: { value: PIXEL.saturation },
        contrast: { value: PIXEL.contrast },
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
