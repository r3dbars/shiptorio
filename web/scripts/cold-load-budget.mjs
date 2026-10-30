export const COLD_LOAD_BUDGETS = Object.freeze({ stranger: 4000, live: 5000 });

/** Judge all five timed samples, not the warm-up or a rounded display value. */
export function checkColdLoadBudget(results) {
  const medians = {};
  for (const [path, limit] of Object.entries(COLD_LOAD_BUDGETS)) {
    const warmups = results.filter(row => row.path === path && row.round === 'warmup');
    const timed = results.filter(row => row.path === path && row.round !== 'warmup');
    if (warmups.length !== 1 || timed.length !== 5 || new Set(timed.map(row => row.round)).size !== 5 || timed.some(row => !Number.isInteger(row.round) || row.round < 1 || row.round > 5)) {
      throw Error(`${path}: budget requires one warm-up and exactly five timed rounds`);
    }
    const values = timed.map(row => row.times['shiptorio:playable']);
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) throw Error(`${path}: missing or invalid playable milestone`);
    const median = [...values].sort((a, b) => a - b)[2];
    medians[path] = median;
    if (median > limit) throw Error(`${path}: sampled cold-load median ${median.toFixed(1)} ms exceeds ${limit} ms`);
  }
  return medians;
}
