import { expect, test } from "bun:test";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshPhongMaterial, Texture } from "three";
import { disposeOwnedGeometries } from "../src/map/disposal";

test("satellite rebuild cleanup releases every owned geometry once and preserves shared factory paint", () => {
  const texture = new Texture(), material = new MeshPhongMaterial({ map: texture });
  let materialsDisposed = 0, texturesDisposed = 0;
  material.addEventListener("dispose", () => materialsDisposed++);
  texture.addEventListener("dispose", () => texturesDisposed++);
  const mainIsland = new Mesh(new BoxGeometry(), material);
  let mainDisposed = 0;
  mainIsland.geometry.addEventListener("dispose", () => mainDisposed++);
  for (let rebuild = 0; rebuild < 3; rebuild++) {
    const satellite = new Group(), nested = new Group();
    const merged = new BoxGeometry(), loose = new BoxGeometry();
    let mergedDisposed = 0, looseDisposed = 0;
    merged.addEventListener("dispose", () => mergedDisposed++);
    loose.addEventListener("dispose", () => looseDisposed++);
    satellite.add(new Mesh(merged, material), nested);
    // Loose copied meshes may share the same geometry within a generated island.
    nested.add(new Mesh(loose, material), new InstancedMesh(loose, material, 2));
    disposeOwnedGeometries(satellite);
    expect([mergedDisposed, looseDisposed]).toEqual([1, 1]);
  }
  expect([mainDisposed, materialsDisposed, texturesDisposed]).toEqual([0, 0, 0]);
  expect(mainIsland.material.map).toBe(texture);
});
