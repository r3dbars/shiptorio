// The Black Iron finish, exactly as the mockup draws it (docs/art/black-iron/template.html): render the scene
// small, then one full-screen pass samples each low-res pixel at its center, inks the outlines, adds a pixel
// bloom, a split-tone grade and a vignette, and quantizes colors. Values come from IRON.LOOK.finish (the
// world module owns them). 12 bloom taps like the mockup; phones drop to 8 (the frame governor) or none.

import * as THREE from "three";

export interface FinishLook {
  levels?: number;
  dither?: number;
  outline?: number;
  thresh?: number;
  ink?: string | number;
  sat?: number;
  contrast?: number;
  bloom?: number;
  bloomThresh?: number;
  vignette?: number;
  grade?: number;
  shadow?: string | number;
  high?: string | number;
  scan?: number;
}

const vertexShader = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse; uniform vec2 res; uniform float smoothMode, pxs, levels, dither, outline, thresh, sat, contrast, bloom, bloomThresh, vignette, grade, scan;
  uniform vec3 ink, shadowT, highT; uniform vec2 bloomDirections[TAPS]; varying vec2 vUv;
  float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
  float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 tap(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
  void main(){
    vec2 p = floor(vUv * res); vec2 uv = (p + 0.5) / res; vec2 t = 1.0 / res;
    vec3 c = tap(uv); float l = lum(c);
    float n = max(max(lum(tap(uv + vec2(t.x, 0.0))), lum(tap(uv - vec2(t.x, 0.0)))), max(lum(tap(uv + vec2(0.0, t.y))), lum(tap(uv - vec2(0.0, t.y)))));
    vec3 acc = vec3(0.0); float br = 2.0 / pxs;
    if (bloom > 0.0) { float a = b4(p) * (6.2832 / float(TAPS)); vec2 r = vec2(cos(a), sin(a));
      for (int i = 0; i < TAPS; i++) { vec2 b = bloomDirections[i]; vec2 d = vec2(b.x * r.x - b.y * r.y, b.x * r.y + b.y * r.x);
      vec3 s1 = tap(uv + d * t * 2.0 * br); vec3 s2 = tap(uv + d * t * 4.5 * br); vec3 s3 = tap(uv + d * t * 8.0 * br);
      acc += s1 * max(0.0, lum(s1) - bloomThresh) * 1.2 + s2 * max(0.0, lum(s2) - bloomThresh) * 0.8 + s3 * max(0.0, lum(s3) - bloomThresh) * 0.5; }
      acc *= 12.0 / float(TAPS); }
    c = mix(c, ink, outline * step(thresh, n - l) * (1.0 - smoothMode));
    c += acc * bloom * 0.16;
    c = mix(vec3(lum(c)), c, sat); c = (c - 0.5) * contrast + 0.5;
    float Lm = clamp(lum(c), 0.0, 1.0); vec3 tg = mix(shadowT, highT, smoothstep(0.05, 0.85, Lm));
    c *= 1.0 + grade * (tg - vec3(lum(tg))) * 1.6;
    vec2 q = vUv - 0.5; c *= 1.0 - vignette * smoothstep(0.3, 0.8, length(q * vec2(1.0, 0.85)));
    c *= 1.0 - scan * step(1.0, mod(p.y, 2.0)) * (1.0 - smoothMode);
    if (smoothMode < 0.5) { float d = (b4(p) - 0.5) * dither; c = floor(c * levels + d + 0.5) / levels; }
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

const NUMS = ["levels", "dither", "outline", "thresh", "sat", "contrast", "bloom", "bloomThresh", "vignette", "grade", "scan"] as const;

export class FinishPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private look: FinishLook = {};
  private taps = 12;
  private bloomOn = true;

  constructor(look: FinishLook) {
    this.target = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.material = this.make();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.setLook(look);
  }

  private make() {
    return new THREE.ShaderMaterial({
      defines: { TAPS: this.taps },
      uniforms: {
        bloomDirections: { value: Array.from({ length: this.taps }, (_, i) => new THREE.Vector2(Math.cos(i * 6.2832 / this.taps), Math.sin(i * 6.2832 / this.taps))) },
        tDiffuse: { value: this.target.texture }, res: { value: new THREE.Vector2(2, 2) }, smoothMode: { value: 0 }, pxs: { value: 1 },
        levels: { value: 48 }, dither: { value: 0 }, outline: { value: 0.5 }, thresh: { value: 0.1 }, ink: { value: new THREE.Color(0) },
        sat: { value: 1 }, contrast: { value: 1 }, bloom: { value: 0.5 }, bloomThresh: { value: 0.6 }, vignette: { value: 0.3 },
        grade: { value: 0 }, shadowT: { value: new THREE.Color(0x808080) }, highT: { value: new THREE.Color(0x808080) }, scan: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
  }

  setLook(look: FinishLook) {
    this.look = look;
    const U = this.material.uniforms;
    for (const k of NUMS) if (look[k] !== undefined) U[k].value = look[k];
    U.ink.value.set(look.ink ?? 0x000000);
    U.shadowT.value.set(look.shadow ?? 0x808080);
    U.highT.value.set(look.high ?? 0x808080);
    U.bloom.value = this.bloomOn ? (look.bloom ?? 0.5) : 0;
  }

  /** 12 taps like the mockup, 8 on a weak device, 0 = no bloom at all */
  setBloomTaps(n: 0 | 8 | 12) {
    this.bloomOn = n > 0;
    if (n > 0 && n !== this.taps) {
      this.taps = n;
      const quad = this.scene.children[0] as THREE.Mesh;
      this.material.dispose();
      this.material = this.make();
      quad.material = this.material;
    }
    this.setLook(this.look);
  }

  /** pixel: 1 = full resolution; 0 = smooth (no outline or quantize) */
  setSize(width: number, height: number, pixel: number) {
    const px = pixel === 0 ? 1 : pixel;
    const w = Math.max(1, Math.ceil(width / px)), h = Math.max(1, Math.ceil(height / px));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const U = this.material.uniforms;
    U.res.value.set(w, h);
    U.pxs.value = px;
    U.smoothMode.value = pixel === 0 ? 1 : 0;
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
