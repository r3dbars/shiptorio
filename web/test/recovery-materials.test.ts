import { expect, test } from "bun:test";
import * as THREE from "three";
import { RecoveryMaterials } from "../src/map/shaft/recoveryMaterials";

const mesh = (m = new THREE.MeshPhongMaterial({ color: 0x987654 })) => new THREE.Mesh(new THREE.BoxGeometry(), m);
test("temporary bindings stay inside admitted draws and shared originals survive", () => {
  const root = new THREE.Group(), a = mesh(), b = new THREE.Mesh(a.geometry, a.material);
  root.add(a, b);
  const recovery = new RecoveryMaterials();
  expect(recovery.active).toBe(false);
  const original = a.material;
  let originalDisposals = 0, temporaryDisposals = 0;
  original.addEventListener("dispose", () => originalDisposals++);
  recovery.begin(root); recovery.prepare();
  const temporary = a.material;
  temporary.addEventListener("dispose", () => temporaryDisposals++);
  expect(temporary).not.toBe(original);
  expect(b.material).toBe(temporary);
  expect(recovery.pending).toBe(1);
  recovery.advance();
  expect(a.material).toBe(original);
  recovery.prepare(); recovery.advance();
  expect(recovery.active).toBe(true);
  recovery.prepare(); recovery.advance();
  expect(a.material).toBe(original);
  expect(b.material).toBe(original);
  expect(recovery.active).toBe(false);
  expect(temporaryDisposals).toBe(1);
  expect(originalDisposals).toBe(0);
});

test("material/layout groups progress without re-wrapping promoted originals", () => {
  const root = new THREE.Group(), a = mesh(), b = mesh(); root.add(a, b);
  const originals = [a.material, b.material];
  const recovery = new RecoveryMaterials(); recovery.begin(root);
  recovery.prepare(); recovery.advance(); recovery.prepare(); recovery.advance();
  recovery.prepare(); expect(a.material).toBe(originals[0]); expect(b.material).not.toBe(originals[1]);
  recovery.advance(); recovery.prepare(); recovery.advance();
  expect(b.material).toBe(originals[1]); expect(recovery.pending).toBe(0);
});

test("temporary materials preserve maps, alpha, depth, clipping, custom hooks and skin geometry", () => {
  const map = new THREE.Texture(), material = new THREE.MeshPhongMaterial({ color: 0x987654, map, alphaMap: map, opacity: 0.4, transparent: true, alphaTest: 0.2, vertexColors: true, depthWrite: false, side: THREE.DoubleSide });
  material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 2)];
  material.onBeforeCompile = () => {};
  material.customProgramCacheKey = () => "custom-visibility";
  const object = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material), root = new THREE.Group(); root.add(object);
  const geometry = object.geometry;
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const basic = object.material as unknown as THREE.MeshBasicMaterial;
  expect(basic.map).toBe(map); expect(basic.alphaMap).toBe(map);
  expect(basic.opacity).toBe(0.4); expect(basic.alphaTest).toBe(0.2);
  expect(basic.vertexColors).toBe(true); expect(basic.depthWrite).toBe(false); expect(basic.side).toBe(THREE.DoubleSide);
  expect(basic.clippingPlanes).toEqual(material.clippingPlanes);
  expect(basic.onBeforeCompile).toBe(material.onBeforeCompile);
  expect(basic.customProgramCacheKey()).toBe("custom-visibility|recovery-basic");
  expect(object.geometry).toBe(geometry);
  recovery.cancel(); expect(object.material).toBe(material);
});

test("arrays, detached meshes and added sharers are restored before temporary disposal", () => {
  const lit = new THREE.MeshPhongMaterial(), shader = new THREE.ShaderMaterial(), originals = [lit, shader];
  const a = new THREE.Mesh(new THREE.BoxGeometry(), originals), root = new THREE.Group(); root.add(a);
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const temporary = a.material[0];
  const added = new THREE.Mesh(a.geometry, temporary); root.add(added); a.removeFromParent();
  let safeAtDispose = false;
  temporary.addEventListener("dispose", () => { safeAtDispose = a.material === originals && added.material === lit; });
  recovery.cancel(); expect(a.material).toBe(originals); expect(added.material).toBe(lit); expect(safeAtDispose).toBe(true);
});

test("new state is included, external replacements are retained, and a second loss releases all temps", () => {
  const root = new THREE.Group(), a = mesh(); root.add(a);
  const original = a.material, recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const first = a.material; let disposed = 0; first.addEventListener("dispose", () => disposed++);
  recovery.begin(root); recovery.prepare(); expect(recovery.epoch).toBe(2); expect(disposed).toBe(1);
  const external = new THREE.MeshBasicMaterial({ color: 0xff0000 }); a.material = external as unknown as THREE.MeshPhongMaterial;
  const added = mesh(); const addedOriginal = added.material; root.add(added);
  recovery.prepare(); expect(added.material).not.toBe(addedOriginal);
  recovery.cancel(); expect(a.material).toBe(external); expect(added.material).toBe(addedOriginal);
  expect(recovery.active).toBe(false); expect(original).not.toBe(external);
});

test("sprites and line materials are left with their own shader programs", () => {
  const root = new THREE.Group(), sprite = new THREE.Sprite(), line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()); root.add(sprite, line);
  const a = sprite.material, b = line.material, recovery = new RecoveryMaterials();
  recovery.begin(root); recovery.prepare(); recovery.advance(); recovery.prepare(); recovery.advance(); recovery.prepare(); recovery.advance();
  expect(sprite.material).toBe(a); expect(line.material).toBe(b); expect(recovery.active).toBe(false);
});
