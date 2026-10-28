import { afterEach, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { repeatLoad, type Report } from './repeat';

const report = (tick: number): Report => ({ latencyMs: { p95: 100 }, tickRpcMs: { p95: tick } });
// Each fake sample writes its report (or nothing) and exits 0, like run.ts with LOAD_BUDGET=off.
const samples = (...ticks: (number | null)[]) => {
  let i = 0;
  return async () => {
    const tick = ticks[i++];
    if (tick !== null) await Bun.write('test-results/load.json', JSON.stringify(report(tick!)));
    return 0;
  };
};
const quiet = () => {};
afterEach(async () => { for (const name of ['load', 'load-1', 'load-2', 'load-3']) await rm(`test-results/${name}.json`, { force: true }); });
await mkdir('test-results', { recursive: true });

test('a first sample under budget passes alone', async () => {
  await expect(repeatLoad(samples(4000), quiet)).resolves.toBeUndefined();
});

test('an over-budget first sample is judged on the median of three', async () => {
  await expect(repeatLoad(samples(8000, 4000, 4500), quiet)).resolves.toBeUndefined();
  await expect(repeatLoad(samples(8000, 6000, 4500), quiet)).rejects.toThrow('median of three');
});

test('a later sample with no report fails instead of reusing the previous one', async () => {
  await expect(repeatLoad(samples(8000, 4000, null), quiet)).rejects.toThrow('Load run 3 wrote no report');
});

test('a crashed sample fails immediately', async () => {
  await expect(repeatLoad(async () => 1, quiet)).rejects.toThrow('Load run 1 failed');
});
