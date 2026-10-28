import { expect, test } from "bun:test";
import { GpuSubmission } from "../src/map/gpu-submission";
function fixture() {
  let now = 0, lost = false, status = 0x911b, next = 0;
  const polls: unknown[][] = [], deleted: WebGLSync[] = [], created: WebGLSync[] = [];
  const canvas = new EventTarget();
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, CONDITION_SATISFIED: 0x911c, TIMEOUT_EXPIRED: 0x911b,
    isContextLost: () => lost,
    fenceSync: (_condition: number, _flags: number) => { const sync = { id: ++next } as unknown as WebGLSync; created.push(sync); return sync; },
    clientWaitSync: (...args: unknown[]) => { polls.push(args); return status; },
    deleteSync: (sync: WebGLSync) => { deleted.push(sync); }, flush: () => {},
  };
  const gate = new GpuSubmission(gl, canvas, () => now);
  return { gl, gate, canvas, polls, deleted, created, time: (value: number) => { now = value; }, status: (value: number) => { status = value; }, lost: (value: boolean) => { lost = value; } };
}
test("one pending GPU frame, one zero-timeout poll per subsequent frame; simulation keeps stepping", () => {
  const f = fixture(); let simulation = 0, hud = 0, draws = 0;
  const frame = () => { simulation++; f.gate.submit(() => { draws++; }); hud++; };
  frame(); frame(); frame();
  expect([simulation, hud, draws]).toEqual([3, 3, 1]);
  expect(f.created).toHaveLength(1);
  expect(f.polls).toEqual([[f.created[0], 0, 0], [f.created[0], 0, 0]]);
  expect(f.gate.stats()).toEqual({ submitted: 1, pendingSkipped: 2, fenceFailures: 0 });
  for (const status of [f.gl.ALREADY_SIGNALED, f.gl.CONDITION_SATISFIED]) { f.status(status); frame(); }
  expect(draws).toBe(3); expect(f.deleted).toHaveLength(2);
  f.gate.dispose(); f.gate.dispose(); expect(f.deleted).toHaveLength(3);
});
test("failed/unknown polling and a never-signaled fence fall back instead of freezing", () => {
  for (const status of [0x911d, -1, 0x911b]) {
    const f = fixture(); let draws = 0;
    f.gate.submit(() => draws++); f.status(status);
    if (status === 0x911b) f.time(5000);
    f.gate.submit(() => draws++); f.gate.submit(() => draws++);
    expect(draws).toBe(3); expect(f.created).toHaveLength(1); expect(f.deleted).toHaveLength(1);
    expect(f.gate.stats().fenceFailures).toBe(1); f.gate.dispose();
  }
});
test("context loss discards old sync, restoration admits a fresh frame, dispose never draws", () => {
  const f = fixture(); let draws = 0;
  f.gate.submit(() => draws++); f.lost(true); f.canvas.dispatchEvent(new Event("webglcontextlost"));
  expect(f.gate.submit(() => draws++)).toBe(false); expect(f.deleted).toHaveLength(1);
  f.lost(false); f.canvas.dispatchEvent(new Event("webglcontextrestored"));
  expect(f.gate.submit(() => draws++)).toBe(true); expect(f.created).toHaveLength(2);
  f.gate.dispose(); f.canvas.dispatchEvent(new Event("webglcontextrestored"));
  expect(f.gate.submit(() => draws++)).toBe(false); expect(draws).toBe(2); expect(f.deleted).toHaveLength(2);
});
test("unsupported, null, or throwing sync APIs preserve the old rendering path", () => {
  const f = fixture(); let draws = 0;
  const unsupported = new GpuSubmission({ isContextLost: () => false }, f.canvas);
  unsupported.submit(() => draws++); unsupported.submit(() => draws++); expect(draws).toBe(2); unsupported.dispose();
  for (const method of ["fenceSync", "flush", "clientWaitSync"] as const) {
    const x = fixture(); x.gl[method] = (() => { throw new Error("driver failure"); }) as never;
    x.gate.submit(() => draws++); x.gate.submit(() => draws++); x.gate.submit(() => draws++);
    expect(x.gate.stats().submitted).toBe(3); expect(x.gate.stats().fenceFailures).toBe(1); x.gate.dispose();
  }
  const n = fixture(); n.gl.fenceSync = (() => null) as never;
  n.gate.submit(() => draws++); n.gate.submit(() => draws++); expect(n.gate.stats().submitted).toBe(2); n.gate.dispose();
});
test("render exceptions propagate and still fence already-submitted partial work", () => {
  const f = fixture();
  expect(() => f.gate.submit(() => { throw new Error("real render error"); })).toThrow("real render error");
  expect(f.created).toHaveLength(1); expect(f.gate.submit(() => { throw new Error("must not run while pending"); })).toBe(false);
  f.gate.dispose();
});
