import { expect, it, spyOn } from 'bun:test';
import { factoryRpc } from '../src/factory-rpc';
const trace = { requestId: 'rollout-request', userId: 'r3dbars', repo: 'owner/repo' };
it('preserves new tracing calls and never invokes the legacy operation too', async () => {
  let legacy = 0;
  const target = { observedCall: async (method: string, args: unknown[], incoming: typeof trace) => { expect(incoming).toEqual(trace); return { method, args }; }, enqueueGitHub: async () => { legacy++; } };
  expect(await factoryRpc(target, 'enqueueGitHub', ['delivery'], trace)).toEqual({ method: 'enqueueGitHub', args: ['delivery'] });
  expect(legacy).toBe(0);
});
it('uses the existing operation only when the new dispatch method is absent', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  let calls = 0;
  const target = { observedCall: async () => { throw new TypeError('The RPC receiver does not implement the method "observedCall".'); }, enqueueGitHub: async (delivery: string) => { calls++; expect(delivery).toBe('delivery'); return 'queued'; } };
  try { expect(await factoryRpc(target, 'enqueueGitHub', ['delivery'], trace)).toBe('queued'); expect(calls).toBe(1); }
  finally { warn.mockRestore(); }
});
it('never replays a failed business operation or an unrelated missing method', async () => {
  for (const message of ['publish failed after commit', 'The RPC receiver does not implement the method "anotherMethod".']) {
    let calls = 0;
    const target = { observedCall: async () => { throw new Error(message); }, finishRunner: async () => { calls++; } };
    await expect(factoryRpc(target, 'finishRunner', [], trace)).rejects.toThrow(message);
    expect(calls).toBe(0);
  }
});
