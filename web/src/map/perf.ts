// Frame stats for perf work: `window.__shipPerf()` in the console (or from a Playwright run)
// returns fps, ms of JS + GL submit per frame, draw calls and triangles. ?perf shows them live.
import type * as THREE from "three";
import type { SubmissionStats } from "./gpu-submission";

let frames = 0, since = performance.now(), fps = 0, workMs = 0, workSum = 0;
let info: THREE.WebGLInfo | null = null;
let last = { calls: 0, triangles: 0, tier: 0 };
let el: HTMLElement | null = null;
interface RenderDimensions { bufferWidth: number; bufferHeight: number; sceneWidth: number; sceneHeight: number; shadowWidth: number; shadowHeight: number; internalPixel: number; severeBudget: number }
let dimensions: RenderDimensions = { bufferWidth: 0, bufferHeight: 0, sceneWidth: 0, sceneHeight: 0, shadowWidth: 0, shadowHeight: 0, internalPixel: 1, severeBudget: 0 };
let gpu: SubmissionStats = { submitted: 0, pendingSkipped: 0, fenceFailures: 0 };

export const perf = {
  frame(now: number, i: THREE.WebGLInfo, tier = 0) {
    info = i;
    last = { calls: i.render.calls, triangles: i.render.triangles, tier };
    i.reset();
    frames++;
    if (now - since >= 1000) {
      fps = (frames * 1000) / (now - since);
      workMs = workSum / frames;
      frames = 0; workSum = 0; since = now;
      if (el) el.textContent = `${fps.toFixed(0)} fps · ${workMs.toFixed(1)} ms · ${last.calls} calls · ${(last.triangles / 1000).toFixed(0)}k tris · q${last.tier}`;
    }
  },
  work(ms: number) { workSum += ms; },
  // Existing fps/workMs still describe admitted logical frames. These passive
  // counters separately expose actual GL submissions and driver backpressure.
  submissions(stats: SubmissionStats) { gpu = stats; },
  dimensions(value: RenderDimensions) { dimensions = value; },
  // ?perf also hands the scene to the console as window.__shipScene
  watch(scene: THREE.Scene) { if (el) (window as unknown as { __shipScene: THREE.Scene }).__shipScene = scene; },
  stats() {
    return { fps, workMs, ...last, ...dimensions, geometries: info?.memory.geometries ?? 0, textures: info?.memory.textures ?? 0, programs: info?.programs?.length ?? 0, gpuSubmitted: gpu.submitted, gpuPendingSkipped: gpu.pendingSkipped, gpuFenceFailures: gpu.fenceFailures };
  },
};

(window as unknown as { __shipPerf: () => unknown }).__shipPerf = perf.stats;
if (new URLSearchParams(location.search).has("perf")) {
  el = document.createElement("div");
  el.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99;font:11px monospace;color:#fff;background:#000a;padding:2px 6px;pointer-events:none";
  document.body.append(el);
}
