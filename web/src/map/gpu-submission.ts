// Bound GPU work in flight without waiting on the GPU or slowing the simulation.
// A broken/unsupported fence falls back to the original rendering path.
export interface SubmissionStats { submitted: number; pendingSkipped: number; fenceFailures: number }
type FenceGL = Pick<WebGL2RenderingContext, "isContextLost"> & Partial<Pick<WebGL2RenderingContext,
  "fenceSync" | "clientWaitSync" | "deleteSync" | "flush" | "SYNC_GPU_COMMANDS_COMPLETE" |
  "ALREADY_SIGNALED" | "CONDITION_SATISFIED" | "TIMEOUT_EXPIRED">>;
const MAX_PENDING_MS = 5000;

export class GpuSubmission {
  private pending: WebGLSync | null = null;
  private pendingAt = 0;
  private disabled = false;
  private disposed = false;
  private lost = false;
  private readonly counts: SubmissionStats = { submitted: 0, pendingSkipped: 0, fenceFailures: 0 };
  constructor(private readonly gl: FenceGL, private readonly canvas: EventTarget, private readonly now = () => performance.now()) {
    this.disabled = ![gl.fenceSync, gl.clientWaitSync, gl.deleteSync, gl.flush].every(method => typeof method === "function");
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }
  stats(): SubmissionStats { return { ...this.counts }; }
  private clear() {
    const sync = this.pending;
    this.pending = null;
    if (sync) try { this.gl.deleteSync?.(sync); } catch { /* lost/failed context; release the JS reference too */ }
  }
  private fail() { this.counts.fenceFailures++; this.clear(); this.disabled = true; }
  private onLost = () => { this.lost = true; this.clear(); };
  private onRestored = () => {
    this.clear(); this.lost = false;
    this.disabled = ![this.gl.fenceSync, this.gl.clientWaitSync, this.gl.deleteSync, this.gl.flush].every(method => typeof method === "function");
  };

  /** Called once per admitted RAF, never in a spin/retry loop. */
  submit(draw: () => void): boolean {
    if (this.disposed) return false;
    if (this.lost || this.gl.isContextLost()) { this.clear(); return false; }
    if (this.pending) {
      try {
        // Flags=0 and timeout=0: inspect completion, never block the CPU on GPU work.
        const status = this.gl.clientWaitSync!(this.pending, 0, 0);
        if (status === this.gl.TIMEOUT_EXPIRED && this.now() - this.pendingAt < MAX_PENDING_MS) {
          this.counts.pendingSkipped++;
          return false;
        }
        if (status === this.gl.ALREADY_SIGNALED || status === this.gl.CONDITION_SATISFIED) this.clear();
        else this.fail(); // WAIT_FAILED, unknown state, or a driver that never signals: no permanent freeze.
      } catch { this.fail(); }
    }
    // Rendering errors must still reach the existing error path; fence failures alone fail open.
    try { draw(); }
    finally {
      this.counts.submitted++;
      if (!this.disabled && !this.disposed && !this.lost && !this.gl.isContextLost()) {
        try {
          this.pending = this.gl.fenceSync!(this.gl.SYNC_GPU_COMMANDS_COMPLETE!, 0);
          if (!this.pending) this.fail();
          else { this.pendingAt = this.now(); this.gl.flush!(); }
        } catch { this.fail(); }
      }
    }
    return true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.clear();
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
  }
}
