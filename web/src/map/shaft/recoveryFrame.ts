import * as THREE from "three";

/** Two transient real-scene frames avoid warming the full-screen finish before the map is usable. */
export function drawRecoveryFrame(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear, colorSpace = renderer.outputColorSpace;
  try {
    renderer.setRenderTarget(null);
    const ratio = renderer.getPixelRatio();
    renderer.setViewport(0, 0, renderer.domElement.width / ratio, renderer.domElement.height / ratio);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
    renderer.setClearColor(clear, alpha); renderer.autoClear = autoClear; renderer.outputColorSpace = colorSpace;
  }
}
