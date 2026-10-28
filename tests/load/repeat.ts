import { copyFile, rm } from 'node:fs/promises';

// CI load gate. Shared GitHub runners swing tick p95 by seconds on identical code
// (5.2s, 8.2s, then a pass three minutes later on 2026-10-28), so one run measures
// the machine as much as the Worker. Same budget as run.ts, judged on the median:
// the first run passes alone when it is under budget; otherwise two more runs decide.
// Missing deliveries, a crashed run or a missing report still fail immediately.
export const budget = { latencyP95: 3000, tickP95: 5000 };
export type Report = { latencyMs: { p95: number }; tickRpcMs: { p95: number } };
const reportPath = 'test-results/load.json';
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const under = (latency: number, tick: number) => latency <= budget.latencyP95 && tick <= budget.tickP95;

/** runOnce runs one load sample that writes reportPath and resolves to its exit code. */
export async function repeatLoad(runOnce: () => Promise<number>, log: (line: string) => void = console.log) {
  const reports: Report[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    // A sample that exits 0 without a report must never reuse the previous one.
    await rm(reportPath, { force: true });
    if (await runOnce() !== 0) throw new Error(`Load run ${attempt} failed before the budget check`);
    const file = Bun.file(reportPath);
    if (!await file.exists()) throw new Error(`Load run ${attempt} wrote no report`);
    await copyFile(reportPath, `test-results/load-${attempt}.json`);
    const report = await file.json() as Report;
    reports.push(report);
    log(`load run ${attempt}: latency p95 ${Math.round(report.latencyMs.p95)}ms, tick p95 ${Math.round(report.tickRpcMs.p95)}ms`);
    if (attempt === 1 && under(report.latencyMs.p95, report.tickRpcMs.p95)) return;
  }
  const latency = median(reports.map(r => r.latencyMs.p95)), tick = median(reports.map(r => r.tickRpcMs.p95));
  log(`median of 3: latency p95 ${Math.round(latency)}ms (budget ${budget.latencyP95}), tick p95 ${Math.round(tick)}ms (budget ${budget.tickP95})`);
  if (!under(latency, tick)) throw new Error('Load budget exceeded on the median of three runs');
}

if (import.meta.main) {
  await repeatLoad(() => Bun.spawn(['bun', 'tests/load/run.ts'], { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, LOAD_BUDGET: 'off' } }).exited);
}
