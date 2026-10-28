import { expect, test } from "bun:test";
import * as THREE from "three";
import { drawRecoveryFrame } from "../src/map/shaft/recoveryFrame";

for (const throws of [false, true]) test(`unfiltered recovery draws actual scene and restores render state (${throws ? "throw" : "success"})`, () => {
  const target = {}, viewport = new THREE.Vector4(1, 2, 30, 40), scissor = new THREE.Vector4(5, 6, 20, 25), color = new THREE.Color(0x123456);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), calls: unknown[][] = [];
  const renderer = {
    domElement: { width: 390, height: 844 }, autoClear: false, outputColorSpace: THREE.SRGBColorSpace,
    getPixelRatio: () => 1, getRenderTarget: () => target, getActiveCubeFace: () => 3, getActiveMipmapLevel: () => 2,
    getViewport: (out: THREE.Vector4) => out.copy(viewport), getScissor: (out: THREE.Vector4) => out.copy(scissor), getScissorTest: () => true,
    getClearColor: (out: THREE.Color) => out.copy(color), getClearAlpha: () => 0.3,
    setRenderTarget: (...a: unknown[]) => calls.push(["target", ...a]),
    setViewport: (...a: unknown[]) => calls.push(["viewport", ...a]), setScissor: (...a: unknown[]) => calls.push(["scissor", ...a]),
    setScissorTest: (...a: unknown[]) => calls.push(["scissorTest", ...a]), setClearColor: (...a: unknown[]) => calls.push(["clear", ...a]),
    render: (s: THREE.Scene, c: THREE.Camera) => { calls.push(["render", s, c]); if (throws) throw new Error("draw"); },
  };
  const draw = () => drawRecoveryFrame(renderer as unknown as THREE.WebGLRenderer, scene, camera);
  if (throws) expect(draw).toThrow("draw"); else draw();
  expect(calls[0]).toEqual(["target", null]);
  expect(calls[3]).toEqual(["render", scene, camera]);
  expect(calls.slice(4)).toEqual([["target", target, 3, 2], ["viewport", viewport], ["scissor", scissor], ["scissorTest", true], ["clear", color, 0.3]]);
  expect(renderer.autoClear).toBe(false); expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
});
