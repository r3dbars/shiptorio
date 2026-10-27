// The first run (docs/GAMEPLAY-PICKS.md, build order 6 and 7): a factory that has never shipped starts as a dark
// foundry with one lit thing, the GitHub tunnel. Floors light bottom to top as real progress lands: the mine when
// the first issue comes up as ore, the build floor when the first build runs, the checks when CI first reports,
// and the launch floor when the first rocket ships. The next floor to light glows faintly; the rest stay dark
// silhouettes. Everything here is read off FactoryState, never a timer.
//
// The darkness is a few lines of shader patched into the shaft's own materials (inside its footprint only), so
// the art stays as it is and a fully lit factory renders exactly as before.
//
// Build as you go (?buildout=1, buildout.ts) drives the same light from builds instead of state, moves the pool of
// light to the next build site, and adds the other half: a triangle tagged with a piece that isn't built (or hasn't
// risen that far) isn't drawn at all. The tag rides in a vertex attribute, `frPiece` (or `frPieceI` per instance):
// 0 and 1 mean nothing (what an untagged mesh reads), 2 + piece + how far along it sits (0-1) otherwise.

import * as THREE from "three";

import type { FactoryState, Item } from "@shiptorio/shared";

import { MINES, MINE_FACE_Z } from "./layout";

export const FLOORS = ["mine", "build", "checks", "launch"] as const;
export type Floor = (typeof FLOORS)[number];

const BUILT: ReadonlySet<Item["state"]> = new Set(["working", "inspecting", "rejected", "passed", "on_pad", "launched"]);
const CHECKED: ReadonlySet<Item["state"]> = new Set(["rejected", "passed", "on_pad", "launched"]);

const shipped = (s: FactoryState) =>
  (s.metrics?.rockets ?? 0) > 0 || s.science.red + s.science.green + s.science.grey + s.science.blue > 0 || s.items.some((i) => i.state === "launched" || !!i.orbit);
const ciReported = (i: Item) => CHECKED.has(i.state) || !!i.scars?.length || !!i.inspection?.stages.some((g) => g.gate === "ci" && g.state !== "pending");
const built = (i: Item) => BUILT.has(i.state) || i.attempts > 0 || !!i.branch || i.prNumber != null;

/** How many floors are lit, bottom up (0: only the GitHub tunnel, 4: everything). */
export function litFloors(s: FactoryState): number {
  if (shipped(s)) return 4;
  if (s.items.some(ciReported)) return 3;
  if (s.items.some(built)) return 2;
  return s.items.length ? 1 : 0;
}

/** What one floor lighting up says (the coach line, read out to screen readers). */
export const LIT_LINE: Record<Floor, string> = {
  mine: "The mine is lit: your first issue came up as ore.",
  build: "The build floor is lit: your first build is running.",
  checks: "The checks are lit: CI reported on your first build.",
  launch: "The launch floor is lit: your first rocket shipped.",
};

// Where the floors meet, in root height: each band is a deck plus the riser wall behind it (CONTRACT.md).
const SHADE = /* glsl */ `
uniform vec4 frLit;
uniform vec4 frNext;
uniform vec4 frSpot;
varying vec3 vFrPos;
vec3 frShade(vec3 c) {
  float inside = step(abs(vFrPos.x), 23.0) * step(-31.0, vFrPos.z) * step(vFrPos.z, 15.0);
  float y = vFrPos.y;
  float b0 = 1.0 - smoothstep(-1.9, -1.1, y);
  float b3 = smoothstep(20.3, 20.9, y);
  float b2 = smoothstep(9.3, 9.9, y) - b3;
  vec4 w = vec4(b0, 1.0 - b0 - b2 - b3, b2, b3);
  float lit = dot(w, frLit);
  if (frSpot.w > 0.0) lit = max(lit, 1.0 - smoothstep(frSpot.w * 0.5, frSpot.w, length((vFrPos - frSpot.xyz) * vec3(1.0, 1.0, 0.6))));
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 dark = mix(vec3(l), c, 0.3) * vec3(0.14, 0.15, 0.19);
  dark = mix(dark, c * vec3(0.36, 0.27, 0.17), dot(w, frNext));
  return mix(c, mix(dark, c, lit), inside);
}
`;

// the piece tags (buildout.ts): drop what isn't built
const HIDE_V = /* glsl */ `
attribute float frPiece;
#ifdef USE_INSTANCING
attribute float frPieceI;
#endif
uniform vec4 frRise[16];
varying float vFrGone;
`;
const HIDE_MAIN = /* glsl */ `
{ float frA = frPiece;
#ifdef USE_INSTANCING
  frA = max(frA, frPieceI);
#endif
  vFrGone = 0.0;
  if (frA >= 2.0) {
    int frP = int(frA) - 2;
    float frR = frRise[frP >> 2][frP & 3];
    if (frR < 1.0 && fract(frA) >= frR) vFrGone = 1.0;
  } }
`;

export class FirstRunLight {
  /** floors lit so far (never goes down while this map is open) */
  level = -1;
  /** the spot was placed by hand (buildout): set() leaves it alone */
  private spotted = false;
  private readonly lit = new THREE.Vector4(1, 1, 1, 1);
  private readonly goal = new THREE.Vector4(1, 1, 1, 1);
  private readonly uniforms = {
    frLit: { value: new THREE.Vector4(1, 1, 1, 1) },
    frNext: { value: new THREE.Vector4() },
    frSpot: { value: new THREE.Vector4(MINES.github.x, MINES.github.y, MINE_FACE_Z, 0) },
    frRootInv: { value: new THREE.Matrix4() },
    frRise: { value: Array.from({ length: 16 }, () => new THREE.Vector4(1, 1, 1, 1)) },
  };

  /** Build as you go: the rise per piece (buildout.ts owns the array, the shader reads it every frame). */
  bindRise(rise: THREE.Vector4[]) {
    this.uniforms.frRise.value = rise;
  }

  /** Build as you go: the pool of light sits on the next build site (root coords, radius), or nowhere. */
  spotAt(at: [number, number, number, number] | null) {
    this.spotted = true;
    const s = this.uniforms.frSpot.value;
    if (at) s.set(...at);
    else s.w = 0;
  }

  /** Take the factory's lit floors. Returns the floor that just lit (after the first look), or null. */
  set(n: number, calm: boolean): Floor | null {
    const first = this.level < 0;
    if (n <= this.level) return null;
    this.level = n;
    for (let i = 0; i < 4; i++) this.goal.setComponent(i, i < n ? 1 : 0);
    if (first || calm) this.lit.copy(this.goal);
    if (!this.spotted) this.uniforms.frSpot.value.w = n === 0 ? 3.6 : 0;
    this.write(0, calm);
    return first ? null : FLOORS[n - 1];
  }

  get dark() {
    return this.level >= 0 && this.level < 4;
  }

  /** Patch every material under the shaft's root (after build and bake), unless it's all lit already (and, with
   * `hide`, nothing is waiting to be built). */
  patch(root: THREE.Object3D, hide = false) {
    if (!this.dark && !hide) return;
    root.updateMatrixWorld(true);
    this.uniforms.frRootInv.value.copy(root.matrixWorld).invert();
    const u = this.uniforms;
    const seen = new Set<THREE.Material>();
    root.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (seen.has(m) || (m as THREE.ShaderMaterial).isShaderMaterial || m.userData.firstRun) continue;
        seen.add(m);
        m.userData.firstRun = true;
        const tags = hide;
        const before = m.onBeforeCompile;
        m.onBeforeCompile = (sh, r) => {
          before.call(m, sh, r);
          // shade before tone mapping and fog (some modules replace the fog chunk with their own)
          const at = ["#include <tonemapping_fragment>", "#include <fog_fragment>"].find((c) => sh.fragmentShader.includes(c));
          if (!at || !sh.vertexShader.includes("#include <project_vertex>")) return;
          Object.assign(sh.uniforms, u);
          if (tags && sh.fragmentShader.includes("#include <clipping_planes_fragment>")) {
            sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${HIDE_V}`).replace("#include <project_vertex>", `#include <project_vertex>\n${HIDE_MAIN}`);
            sh.fragmentShader = sh.fragmentShader
              .replace("#include <common>", "#include <common>\nvarying float vFrGone;")
              .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vFrGone > 0.5) discard;");
          }
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "#include <common>\nuniform mat4 frRootInv;\nvarying vec3 vFrPos;")
            .replace(
              "#include <project_vertex>",
              "#include <project_vertex>\n{ vec4 frP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nfrP = instanceMatrix * frP;\n#endif\nvFrPos = (frRootInv * modelMatrix * frP).xyz; }",
            );
          sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${SHADE}`).replace(at, `gl_FragColor.rgb = frShade(gl_FragColor.rgb);\n${at}`);
        };
        const key = m.customProgramCacheKey.bind(m);
        m.customProgramCacheKey = () => `${key()}|firstRun${tags ? "|tags" : ""}`;
        m.needsUpdate = true;
      }
    });
  }

  /** Each frame: fade a newly lit floor in, and breathe the next one (held steady under reduced motion). */
  step(t: number, dt: number, calm: boolean) {
    if (!this.dark && this.lit.equals(this.goal)) return;
    const k = calm ? 1 : Math.min(1, dt / 1.2);
    for (let i = 0; i < 4; i++) {
      const a = this.lit.getComponent(i), b = this.goal.getComponent(i);
      this.lit.setComponent(i, a < b ? Math.min(b, a + k) : b);
    }
    this.write(t, calm);
  }

  private write(t: number, calm: boolean) {
    this.uniforms.frLit.value.copy(this.lit);
    const next = this.uniforms.frNext.value.set(0, 0, 0, 0);
    if (this.level < 4) next.setComponent(this.level, calm ? 0.75 : 0.75 + 0.25 * Math.sin(t * 1.6));
  }
}
