import { expect, test } from "bun:test";
import * as THREE from "three";
import { FirstRunLight } from "../src/map/shaft/firstRun";
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
  const basic = object.material as unknown as THREE.ShaderMaterial;
  expect(basic.uniforms.map.value).toBe(map); expect(basic.uniforms.alphaMap.value).toBe(map);
  expect(basic.uniforms.opacity.value).toBe(0.4); expect(basic.uniforms.alphaTest.value).toBe(0.2);
  expect(basic.uniforms.recoveryVertexColor.value).toBe(1); expect(basic.depthWrite).toBe(false); expect(basic.side).toBe(THREE.DoubleSide);
  expect(basic.clippingPlanes).toEqual(material.clippingPlanes); expect(basic.clipping).toBe(true);
  expect(basic.onBeforeCompile).not.toBe(material.onBeforeCompile);
  expect(material.customProgramCacheKey()).toBe("custom-visibility");
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

test("temporary visibility uses the real FirstRun shader while original hooks remain unchanged", () => {
  const root = new THREE.Group(), object = mesh(); root.add(object);
  const original = object.material, hook = original.onBeforeCompile;
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const light = new FirstRunLight(); light.set(1, true); light.patch(root, true);
  const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <project_vertex>", fragmentShader: "#include <common>\n#include <clipping_planes_fragment>\n#include <tonemapping_fragment>" };
  object.material.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
  expect(shader.vertexShader).toContain("frPiece");
  expect(shader.fragmentShader).toContain("if (vFrGone > 0.5) discard");
  expect(shader.fragmentShader).toContain("frShade");
  expect(original.onBeforeCompile).toBe(hook);
  recovery.cancel(); expect(object.material).toBe(original);
});

test("cheap-frame shader family is shared across map/color/alpha switches", () => {
  const root = new THREE.Group(), a = mesh(), b = mesh(new THREE.MeshPhongMaterial({ map: new THREE.Texture(), alphaTest: 0.3, vertexColors: true })); root.add(a, b);
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const one = a.material as unknown as THREE.ShaderMaterial, two = b.material as unknown as THREE.ShaderMaterial;
  expect(one.vertexShader).toBe(two.vertexShader); expect(one.fragmentShader).toBe(two.fragmentShader);
  expect(one.defines).toEqual(two.defines); expect(one.alphaTest).toBe(0); expect(two.alphaTest).toBe(0);
  expect(two.uniforms.alphaTest.value).toBe(0.3); expect(one.uniforms.map.value).not.toBeNull();
  recovery.cancel();
});

test("materials with special environment or displacement geometry are not approximated", () => {
  const material = new THREE.MeshPhongMaterial({ displacementMap: new THREE.Texture() });
  const object = mesh(material), root = new THREE.Group(); root.add(object);
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  expect(object.material).toBe(material); recovery.cancel();
});

test("only wholly unlit recovery draws defer shadows and restore flags even on throw", () => {
  const root = new THREE.Group(), object = mesh(); root.add(object);
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const shadow = { enabled: true, needsUpdate: true, autoUpdate: true };
  const renderer = { shadowMap: shadow } as unknown as Pick<THREE.WebGLRenderer, "shadowMap">;
  expect(() => recovery.render(renderer, () => {
    expect(shadow.enabled).toBe(true); expect(shadow.needsUpdate).toBe(false); expect(shadow.autoUpdate).toBe(false);
    throw new Error("draw failed");
  })).toThrow("draw failed");
  expect(shadow).toEqual({ enabled: true, needsUpdate: true, autoUpdate: true });
  recovery.advance(); recovery.prepare(); recovery.advance(); recovery.prepare();
  recovery.render(renderer, () => expect(shadow.needsUpdate).toBe(true));
  recovery.cancel();
});

test("unsupported custom lit programs keep their shadow update during recovery", () => {
  const root = new THREE.Group(); root.add(mesh(), new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial({ lights: true })));
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const shadow = { enabled: true, needsUpdate: true, autoUpdate: false };
  recovery.render({ shadowMap: shadow } as unknown as Pick<THREE.WebGLRenderer, "shadowMap">, () => expect(shadow.needsUpdate).toBe(true));
  recovery.cancel();
});

test("only the first two admitted recovery frames bypass finish; new loss restarts that bound", () => {
  const root = new THREE.Group(); root.add(mesh()); const recovery = new RecoveryMaterials();
  expect(recovery.unfiltered).toBe(false); recovery.begin(root);
  for (let n = 0; n < 2; n++) { expect(recovery.unfiltered).toBe(true); recovery.prepare(); recovery.advance(); }
  expect(recovery.unfiltered).toBe(false); recovery.begin(root); expect(recovery.unfiltered).toBe(true);
  recovery.cancel(); expect(recovery.unfiltered).toBe(false);
});

test("ordinary unlit meshes share the temporary family without inventing emissive or changing source state", () => {
  let disposed = 0;
  const map = new THREE.Texture(); map.addEventListener("dispose", () => disposed++);
  const material = new THREE.MeshBasicMaterial({ color: 0x123456, map, alphaTest: 0.4, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const hook = material.onBeforeCompile, root = new THREE.Group(), object = new THREE.Mesh(new THREE.BoxGeometry(), material); root.add(object);
  const recovery = new RecoveryMaterials(); recovery.begin(root); recovery.prepare();
  const temporary = object.material as unknown as THREE.ShaderMaterial;
  expect(temporary.uniforms.diffuse.value).toEqual(material.color); expect(temporary.uniforms.map.value).toBe(map);
  expect(temporary.uniforms.alphaTest.value).toBe(0.4); expect(temporary.opacity).toBe(0.7); expect(temporary.side).toBe(THREE.DoubleSide);
  expect(temporary.transparent).toBe(true); expect(material.onBeforeCompile).toBe(hook);
  recovery.advance(); expect(object.material).toBe(material); recovery.cancel(); expect(disposed).toBe(0);
});
