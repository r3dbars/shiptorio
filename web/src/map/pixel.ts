// The pixel-art pass from the art direction doc: render the 3D scene small, then one
// full-screen pass adds outlines, a slight saturation/contrast boost, and quantizes colors.
// Settings are Justin's locked values.

import * as THREE from "three";

export const PIXEL = {
  size: 2, // render at 1/2 resolution, nearest-neighbor upscale
  levels: 32, // colors per channel
  outline: 0.35, // darken by 35% when a neighbor is brighter...
  threshold: 0.12, // ...by at least this much luminance
  saturation: 1.05,
  contrast: 1.05,
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 texel;
  uniform float levels, outline, threshold, saturation, contrast;
  varying vec2 vUv;

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = luma(c);
    float brighter = max(
      max(luma(texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb), luma(texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb)),
      max(luma(texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb), luma(texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb))
    );
    if (brighter - l > threshold) c *= 1.0 - outline;

    c = mix(vec3(luma(c)), c, saturation);
    c = (c - 0.5) * contrast + 0.5;
    c = floor(clamp(c, 0.0, 1.0) * (levels - 1.0) + 0.5) / (levels - 1.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class PixelPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        texel: { value: new THREE.Vector2() },
        levels: { value: PIXEL.levels },
        outline: { value: PIXEL.outline },
        threshold: { value: PIXEL.threshold },
        saturation: { value: PIXEL.saturation },
        contrast: { value: PIXEL.contrast },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setSize(width: number, height: number, pixel: number) {
    const w = Math.max(1, Math.floor(width / pixel));
    const h = Math.max(1, Math.floor(height / pixel));
    this.target.setSize(w, h);
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
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
