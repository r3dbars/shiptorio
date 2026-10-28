/** Browser-only observer: native calls and every draw assertion are retained. */
export function installGpuObserver() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  (window as any).__gpu = { draws: 0, lost: 0, restored: 0, frames: [] };
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
    const gl = (getContext as any).apply(this, args);
    if (args[0] === 'webgl2' && gl && !(gl as any).__observed) {
      (gl as any).__observed = true;
      let drawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      const bindFramebuffer = gl.bindFramebuffer.bind(gl);
      gl.bindFramebuffer = (target: number, framebuffer: WebGLFramebuffer | null) => {
        bindFramebuffer(target, framebuffer);
        // Read authoritative state after binding, including rejected/invalid binds.
        // READ_FRAMEBUFFER alone cannot change the draw target.
        if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) drawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      };
      const deleteFramebuffer = gl.deleteFramebuffer.bind(gl);
      gl.deleteFramebuffer = (framebuffer: WebGLFramebuffer | null) => {
        deleteFramebuffer(framebuffer);
        if (framebuffer !== null && framebuffer === drawFramebuffer) drawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      };
      this.addEventListener('webglcontextrestored', () => { drawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING); });
      (window as any).__gpu.gl = gl;
      (window as any).__gpu.extension = gl.getExtension('WEBGL_lose_context');
      (window as any).__gpu.canvas = this;
      let onscreen = false;
      const flush = gl.flush.bind(gl);
      gl.flush = () => {
        flush();
        if (!onscreen || gl.isContextLost()) return;
        onscreen = false;
        const gpu = (window as any).__gpu, epoch = gpu.lost, started = gpu.restoreStartedAt;
        const original = !(window as any).__shipPerf?.().recoveryActive;
        const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!fence) return;
        flush();
        const poll = () => {
          if (gl.isContextLost() || gpu.lost !== epoch) return;
          const status = gl.clientWaitSync(fence, 0, 0);
          if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
            gl.deleteSync(fence);
            if (started !== undefined) gpu.frames.push({ epoch, original, elapsed: performance.now() - started });
          } else if (status === gl.TIMEOUT_EXPIRED) requestAnimationFrame(poll);
          else gl.deleteSync(fence);
        };
        requestAnimationFrame(poll);
      };
      this.addEventListener('webglcontextlost', () => (window as any).__gpu.lost++);
      this.addEventListener('webglcontextrestored', () => (window as any).__gpu.restored++);
      for (const key of ['drawElements', 'drawArrays']) {
        const draw = gl[key].bind(gl);
        gl[key] = (...a: any[]) => {
          draw(...a);
          if (!gl.isContextLost() && drawFramebuffer === null) { (window as any).__gpu.draws++; onscreen = true; }
        };
      }
    }
    return gl;
  } as typeof getContext;
}
