import { expect, test } from 'bun:test';
// @ts-ignore Node benchmark module is also used by CI.
import { checkColdLoadBudget } from '../scripts/cold-load-budget.mjs';
const samples = (stranger: number[], live: number[]) => ['stranger', 'live'].flatMap(path => [
  { path, round: 'warmup', times: { 'shiptorio:playable': 99999 } },
  ...(path === 'stranger' ? stranger : live).map((ms, i) => ({ path, round: i + 1, times: { 'shiptorio:playable': ms } })),
]);
test('budgets judge each median independently, excluding a slow warm-up', () => {
  expect(checkColdLoadBudget(samples([3998, 3999, 4000, 4001, 9000], [4998, 4999, 5000, 5001, 9000]))).toEqual({ stranger: 4000, live: 5000 });
});
test('either path can fail, without rounding down an over-budget result', () => {
  expect(() => checkColdLoadBudget(samples([4000.01, 4001, 4002, 3000, 3001], [1, 2, 3, 4, 5]))).toThrow('stranger: sampled cold-load median');
  expect(() => checkColdLoadBudget(samples([1, 2, 3, 4, 5], [5000.01, 5001, 5002, 4000, 4001]))).toThrow('live: sampled cold-load median');
});
test('missing samples, duplicate rounds and invalid milestones fail closed', () => {
  expect(() => checkColdLoadBudget(samples([1, 2], [1, 2, 3, 4, 5]))).toThrow('exactly five');
  for (const bad of [NaN, Infinity, 0, -1, undefined]) {
    const rows = samples([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    (rows[1].times as Record<string, unknown>)['shiptorio:playable'] = bad;
    expect(() => checkColdLoadBudget(rows)).toThrow('invalid playable');
  }
  const duplicate = samples([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
  duplicate[2].round = duplicate[1].round;
  expect(() => checkColdLoadBudget(duplicate)).toThrow('exactly five');
});
