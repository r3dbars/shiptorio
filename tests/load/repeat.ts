import { copyFile } from 'node:fs/promises';

// CI load gate. Shared GitHub runners swing tick p95 by seconds on identical code
// (5.2s, 8.2s, then a pass three minutes later on 2026-10-28), so one run measures
// the machine as much as the Worker. Same budget as run.ts, judged on the median:
// the first run passes alone when it is under budget; otherwise two more runs decide.
// Missing deliveries or a crashed run still fail immediately.
const budget = { latencyP95: 3000, tickP95: 5000 };
type Report = { latencyMs: { p95: number }; tickRpcMs: { p95: number } };
const reports: Report[] = [];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const under = (latency: number, tick: number) => latency <= budget.latencyP95 && tick <= budget.tickP95;

for (let attempt = 1; attempt <= 3; attempt++) {
  const run = Bun.spawn(['bun', 'tests/load/run.ts'], { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, LOAD_BUDGET: 'off' } });
  if (await run.exited !== 0) throw new Error(`Load run ${attempt} failed before the budget check`);
  await copyFile('test-results/load.json', `test-results/load-${attempt}.json`);
  const report = await Bun.file('test-results/load.json').json() as Report;
  reports.push(report);
  console.log(`load run ${attempt}: latency p95 ${Math.round(report.latencyMs.p95)}ms, tick p95 ${Math.round(report.tickRpcMs.p95)}ms`);
  if (attempt === 1 && under(report.latencyMs.p95, report.tickRpcMs.p95)) process.exit(0);
}
const latency = median(reports.map(r => r.latencyMs.p95)), tick = median(reports.map(r => r.tickRpcMs.p95));
console.log(`median of 3: latency p95 ${Math.round(latency)}ms (budget ${budget.latencyP95}), tick p95 ${Math.round(tick)}ms (budget ${budget.tickP95})`);
if (!under(latency, tick)) throw new Error('Load budget exceeded on the median of three runs');
