import * as THREE from "three";
export type LitMaterial = THREE.MeshBasicMaterial | THREE.MeshPhongMaterial | THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | THREE.MeshToonMaterial;

/** One unlit program family, with feature switches as uniforms rather than one cold program per map/color combination. */
export function recoveryBasic(source: LitMaterial, white: THREE.Texture): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms),
    vertexShader: "uniform float recoveryVertexColor;\n" + THREE.ShaderLib.basic.vertexShader.replace("#include <color_vertex>", THREE.ShaderChunk.color_vertex.replace("vColor *= color;", "vColor *= mix(vec4(1.0), color, recoveryVertexColor);")),
    fragmentShader: "uniform float recoveryFog;\n" + THREE.ShaderLib.basic.fragmentShader
      .replace("#include <color_fragment>", "diffuseColor *= vColor;")
      .replace("#include <fog_fragment>", "if (recoveryFog > 0.5) {\n#include <fog_fragment>\n}"),
    fog: true,
  });
  THREE.Material.prototype.copy.call(material, source);
  // Runtime switches preserve each source's behavior while keeping one compiled shader.
  material.vertexColors = false;
  material.alphaTest = 0;
  material.fog = true;
  material.clipping = !!source.clippingPlanes?.length;
  material.defines = { USE_MAP: "", USE_ALPHAMAP: "", USE_ALPHATEST: "", USE_COLOR: "", USE_COLOR_ALPHA: "", MAP_UV: uv(source.map), ALPHAMAP_UV: uv(source.alphaMap) };
  for (const texture of [source.map, source.alphaMap]) if (texture?.channel) material.defines[`USE_UV${texture.channel}`] = "";
  material.uniforms.recoveryVertexColor = { value: source.vertexColors ? 1 : 0 };
  material.uniforms.recoveryFog = { value: source.fog ? 1 : 0 };
  material.userData.recoveryVisibility = true;
  delete material.userData.firstRun;
  syncRecoveryBasic(material, source, white);
  return material;
}
function uv(texture: THREE.Texture | null) { return texture?.channel ? `uv${texture.channel}` : "uv"; }

export function syncRecoveryBasic(material: THREE.ShaderMaterial, source: LitMaterial, white: THREE.Texture) {
  const u = material.uniforms;
  (u.diffuse.value as THREE.Color).copy(source.color);
  if ("emissive" in source) (u.diffuse.value as THREE.Color).add(source.emissive.clone().multiplyScalar(source.emissiveIntensity));
  u.opacity.value = source.opacity;
  u.alphaTest.value = source.alphaTest;
  for (const key of ["map", "alphaMap"] as const) {
    const texture = source[key] ?? white;
    if (texture.matrixAutoUpdate) texture.updateMatrix();
    u[key].value = texture;
    (u[`${key}Transform`].value as THREE.Matrix3).copy(texture.matrix);
  }
  material.uniformsNeedUpdate = true;
}
