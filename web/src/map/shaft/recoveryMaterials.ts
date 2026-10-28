import * as THREE from "three";

type MaterialObject = THREE.Object3D & { material: THREE.Material | THREE.Material[] };
import { recoveryBasic, syncRecoveryBasic, type LitMaterial } from "./recoveryBasic";
const lit = (m: THREE.Material): m is LitMaterial => {
  const flags = m as unknown as Record<string, boolean>;
  const maps = m as unknown as Record<string, unknown>;
  return !!(flags.isMeshBasicMaterial || flags.isMeshPhongMaterial || flags.isMeshLambertMaterial || flags.isMeshStandardMaterial || flags.isMeshToonMaterial)
    && !maps.envMap && !maps.lightMap && !maps.aoMap && !maps.displacementMap;
};
const materials = (o: MaterialObject) => Array.isArray(o.material) ? o.material : [o.material];

/** Temporary real-geometry rendering while lost GPU pipelines warm back up.
 * advance() runs only AFTER an admitted frame: two cheap frames ensure the first
 * completed frame is visible before any original shader is promoted. */
export class RecoveryMaterials {
  private root: THREE.Object3D | null = null;
  private readonly originals = new Map<THREE.Material, THREE.Material>();
  private readonly basics = new Map<THREE.Material, THREE.ShaderMaterial>();
  private readonly bindings = new Map<MaterialObject, { original: THREE.Material | THREE.Material[]; temporary: THREE.Material | THREE.Material[] }>();
  private readonly warmed = new Set<string>();
  private readonly groups = new Set<string>();
  private white: THREE.DataTexture | null = null;
  private originalLighting = false;
  private frames = 0;
  private finishing = false;
  private serial = 0;
  get epoch() { return this.serial; }
  get unfiltered() { return this.active && this.frames < 2; }
  get active() { return this.root !== null; }
  get pending() { return this.groups.size; }

  begin(root: THREE.Object3D) {
    this.cancel();
    this.root = root;
    this.serial++;
    this.frames = 0;
  }

  /** Include newly arrived/current-state meshes without re-wrapping promoted ones. */
  prepare() {
    for (const [source, basic] of this.basics) syncRecoveryBasic(basic, source as LitMaterial, this.white!);
    this.groups.clear();
    this.originalLighting = false;
    this.root?.traverse(object => {
      if (!(object as THREE.Mesh).isMesh) return; // Sprites, Lines and specialized materials keep their own programs.
      const o = object as MaterialObject, source = o.material, list = materials(o);
      if (list.some(m => {
        const v = m as unknown as Record<string, unknown>;
        return !lit(m) && (v.isMeshPhongMaterial || v.isMeshLambertMaterial || v.isMeshStandardMaterial || v.isMeshToonMaterial || v.lights);
      })) this.originalLighting = true;
      if (!list.some(m => lit(m))) return;
      const mesh = object as THREE.Mesh;
      const shape = Object.entries(mesh.geometry.attributes).map(([name, attr]) => `${name}:${attr.itemSize}:${attr.normalized}`).sort().join(",");
      const morph = Object.entries(mesh.geometry.morphAttributes).map(([name, attrs]) => `${name}:${attrs?.length ?? 0}`).sort().join(",");
      const key = `${list.map(m => `${m.uuid}:${m.version}`).join(",")}|${shape}|${morph}|${(mesh as THREE.InstancedMesh).isInstancedMesh ? "instances" : "mesh"}|${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? "skin" : "rigid"}`;
      if (this.warmed.has(key)) {
        this.originalLighting ||= list.some(m => !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial);
        return;
      }
      const next = list.map(m => lit(m) ? this.basic(m) : m);
      o.material = Array.isArray(source) ? next : next[0];
      this.bindings.set(o, { original: source, temporary: o.material });
      this.groups.add(key);
    });
    if (this.groups.size) this.finishing = false;
  }

  /** No temporary unlit material samples the shadow map; retain its dirty flag for the first lit group. */
  render(renderer: Pick<THREE.WebGLRenderer, "shadowMap">, draw: () => void) {
    if (!this.active || this.originalLighting) { draw(); return; }
    const shadow = renderer.shadowMap, dirty = shadow.needsUpdate, automatic = shadow.autoUpdate;
    shadow.needsUpdate = false; shadow.autoUpdate = false;
    try { draw(); } finally { shadow.needsUpdate ||= dirty; shadow.autoUpdate = automatic; }
  }

  private basic(source: LitMaterial) {
    const found = this.basics.get(source);
    if (found) return found;
    if (!this.white) {
      this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      this.white.needsUpdate = true;
    }
    const basic = recoveryBasic(source, this.white);
    this.basics.set(source, basic);
    this.originals.set(basic, source);
    return basic;
  }

  /** End the draw with originals restored, so animation/baking never clones a temporary material. */
  advance() {
    if (!this.root) return;
    this.restoreBindings();
    if (this.finishing) { this.cancel(); return; }
    if (++this.frames < 2) return;
    const first = this.groups.values().next().value;
    if (first !== undefined) { this.groups.delete(first); this.warmed.add(first); }
    if (!this.groups.size) this.finishing = true;
  }

  private restoreObject(o: MaterialObject) {
    if (!o.material) return;
    const binding = this.bindings.get(o);
    if (binding && o.material === binding.temporary) { o.material = binding.original; return; }
    const restore = (m: THREE.Material) => this.originals.get(m) ?? m;
    if (Array.isArray(o.material)) {
      if (o.material.some(m => this.originals.has(m))) o.material = o.material.map(restore);
    } else o.material = restore(o.material);
  }

  private restoreBindings() {
    for (const o of this.bindings.keys()) this.restoreObject(o); // Includes objects detached during a draw.
    this.root?.traverse(o => { if ((o as MaterialObject).material) this.restoreObject(o as MaterialObject); });
    this.bindings.clear();
  }

  cancel() {
    this.restoreBindings();
    // No mesh still references one of our materials. Original materials and textures stay caller-owned.
    for (const basic of this.originals.keys()) basic.dispose();
    this.root = null;
    this.white?.dispose(); this.white = null;
    this.originals.clear(); this.basics.clear(); this.warmed.clear(); this.groups.clear();
    this.frames = 0; this.finishing = false;
  }
}
