import type { BufferGeometry, Mesh, Object3D } from "three";

/** For generated groups whose geometries are owned by that group. Materials and textures
 * may come from shared caches and must remain alive for the rest of the factory. */
export function disposeOwnedGeometries(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  root.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.isMesh) geometries.add(mesh.geometry);
  });
  for (const geometry of geometries) geometry.dispose();
}
