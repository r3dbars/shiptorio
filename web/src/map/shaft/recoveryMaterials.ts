import * as THREE from "three";

type MaterialObject = THREE.Object3D & { material: THREE.Material | THREE.Material[] };
type LitMaterial = THREE.MeshPhongMaterial | THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
const lit = (m: THREE.Material): m is LitMaterial => {
  const flags = m as unknown as Record<string, boolean>;
  return !!(flags.isMeshPhongMaterial || flags.isMeshLambertMaterial || flags.isMeshStandardMaterial || flags.isMeshToonMaterial);
};
const materials = (o: MaterialObject) => Array.isArray(o.material) ? o.material : [o.material];

/** Temporary real-geometry rendering while lost GPU pipelines warm back up.
 * advance() runs only AFTER an admitted frame: two cheap frames ensure the first
 * completed frame is visible before any original shader is promoted. */
export class RecoveryMaterials {
  private root: THREE.Object3D | null = null;
  private readonly originals = new Map<THREE.MeshBasicMaterial, THREE.Material>();
  private readonly basics = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private readonly bindings = new Map<MaterialObject, { original: THREE.Material | THREE.Material[]; temporary: THREE.Material | THREE.Material[] }>();
  private readonly warmed = new Set<string>();
  private readonly groups = new Set<string>();
  private frames = 0;
  private finishing = false;
  private serial = 0;
  get epoch() { return this.serial; }
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
    for (const [source, basic] of this.basics) {
      const current = source as LitMaterial;
      basic.color.copy(current.color).add(current.emissive.clone().multiplyScalar(current.emissiveIntensity));
      basic.opacity = current.opacity;
    }
    this.groups.clear();
    this.root?.traverse(object => {
      if (!(object as THREE.Mesh).isMesh) return; // Sprites, Lines and specialized materials keep their own programs.
      const o = object as MaterialObject, source = o.material, list = materials(o);
      if (!list.some(m => lit(m))) return;
      const mesh = object as THREE.Mesh;
      const shape = Object.entries(mesh.geometry.attributes).map(([name, attr]) => `${name}:${attr.itemSize}:${attr.normalized}`).sort().join(",");
      const morph = Object.entries(mesh.geometry.morphAttributes).map(([name, attrs]) => `${name}:${attrs?.length ?? 0}`).sort().join(",");
      const key = `${list.map(m => `${m.uuid}:${m.version}`).join(",")}|${shape}|${morph}|${(mesh as THREE.InstancedMesh).isInstancedMesh ? "instances" : "mesh"}|${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? "skin" : "rigid"}`;
      if (this.warmed.has(key)) return;
      const next = list.map(m => lit(m) ? this.basic(m) : m);
      o.material = Array.isArray(source) ? next : next[0];
      this.bindings.set(o, { original: source, temporary: o.material });
      this.groups.add(key);
    });
    if (this.groups.size) this.finishing = false;
  }

  private basic(source: LitMaterial) {
    const found = this.basics.get(source);
    if (found) return found;
    const basic = new THREE.MeshBasicMaterial();
    // Base Material.copy retains clipping, stencil, blending, alpha and depth policy.
    THREE.Material.prototype.copy.call(basic, source);
    const copy = ["map", "alphaMap", "lightMap", "lightMapIntensity", "aoMap", "aoMapIntensity", "envMap", "combine", "reflectivity", "refractionRatio", "fog", "wireframe", "wireframeLinewidth"] as const;
    const from = source as unknown as Record<string, unknown>, to = basic as unknown as Record<string, unknown>;
    for (const key of copy) if (from[key] !== undefined) to[key] = from[key];
    basic.color.copy(source.color);
    type Defined = { defines?: Record<string, string | number | boolean> };
    (basic as THREE.MeshBasicMaterial & Defined).defines = { ...(source as LitMaterial & Defined).defines };
    basic.color.add(source.emissive.clone().multiplyScalar(source.emissiveIntensity));
    // Existing UV scrolling, first-run visibility and vertex-color hooks remain intact.
    basic.onBeforeCompile = source.onBeforeCompile;
    basic.customProgramCacheKey = () => `${source.customProgramCacheKey()}|recovery-basic`;
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
    const restore = (m: THREE.Material) => this.originals.get(m as THREE.MeshBasicMaterial) ?? m;
    if (Array.isArray(o.material)) {
      if (o.material.some(m => this.originals.has(m as THREE.MeshBasicMaterial))) o.material = o.material.map(restore);
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
    this.originals.clear(); this.basics.clear(); this.warmed.clear(); this.groups.clear();
    this.frames = 0; this.finishing = false;
  }
}
