import { expect, test } from "bun:test";
import { installGpuObserver } from "../../tests/e2e/gpu-observer";

test("cached draw target matches naive authoritative reads for all draws, including invalid/read-only binds and context reset", () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), oldCanvas = Object.getOwnPropertyDescriptor(globalThis, "HTMLCanvasElement");
  const listeners = new Map<string, (() => void)[]>(), nativeDraws: { onscreen: boolean; args: unknown[] }[] = [];
  let drawTarget: object | null = null, lost = false, reads = 0;
  const gl = {
    FRAMEBUFFER: 1, DRAW_FRAMEBUFFER: 2, READ_FRAMEBUFFER: 3, DRAW_FRAMEBUFFER_BINDING: 4,
    getParameter: (key: number) => { expect(key).toBe(4); reads++; return drawTarget; },
    bindFramebuffer: (target: number, value: object | null) => { if (value !== invalid && (target === 1 || target === 2)) drawTarget = value; },
    deleteFramebuffer: (framebuffer: object | null) => { if (drawTarget === framebuffer) drawTarget = null; },
    getExtension: () => ({}), isContextLost: () => lost, flush: () => {},
    drawElements: (...args: unknown[]) => nativeDraws.push({ onscreen: !lost && drawTarget === null, args }),
    drawArrays: (...args: unknown[]) => nativeDraws.push({ onscreen: !lost && drawTarget === null, args }),
  };
  const invalid = {}, offscreen = {};
  class Canvas {
    getContext() { return gl; }
    addEventListener(name: string, callback: () => void) { listeners.set(name, [...(listeners.get(name) ?? []), callback]); }
  }
  const emit = (name: string) => listeners.get(name)?.forEach(fn => fn());
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "HTMLCanvasElement", { configurable: true, value: Canvas });
    installGpuObserver(); const canvas = new Canvas(); canvas.getContext();
    // getContext's observed wrapper only initializes WebGL2.
    (canvas.getContext as any)("webgl2");
    gl.drawElements(1, 2); // default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, offscreen); gl.drawArrays(3, 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.drawElements(5, 6); // draw remains offscreen
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.drawArrays(7, 8);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, invalid); gl.drawElements(9, 10); // rejected bind retains null
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, offscreen); gl.deleteFramebuffer(offscreen); gl.drawElements(14, 15);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, offscreen); lost = true; emit("webglcontextlost"); gl.drawArrays(11, 12);
    drawTarget = null; lost = false; emit("webglcontextrestored");
    const beforeReads = reads;
    for (let n = 0; n < 100; n++) gl.drawArrays(n, 13);
    expect(reads).toBe(beforeReads); // no synchronous read per scene draw
    expect((globalThis as any).window.__gpu.draws).toBe(nativeDraws.filter(x => x.onscreen).length);
    expect((globalThis as any).window.__gpu.lost).toBe(1); expect((globalThis as any).window.__gpu.restored).toBe(1);
    expect(nativeDraws[0].args).toEqual([1, 2]); expect(nativeDraws[6].args).toEqual([11, 12]);
    expect(reads).toBe(8); // initial, five DRAW binds, bound deletion, restored; READ binding is unrelated
  } finally {
    for (const [name, descriptor] of [["window", oldWindow], ["HTMLCanvasElement", oldCanvas]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete (globalThis as any)[name];
    }
  }
});
