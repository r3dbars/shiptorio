export const STAGING = 'https://shiptorio.dev';
export function stagingOrigin(value = STAGING): string {
  if (value !== STAGING) throw new Error('Hosted load is restricted to https://shiptorio.dev');
  return value;
}
export function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
  return { count: sorted.length, p50: percentile(.5), p95: percentile(.95), max: sorted.at(-1) ?? null };
}
export type Fixture = { repo: string; cookie: string; machineId: string };
export function fixtures(value: unknown): Fixture[] {
  if (!Array.isArray(value) || value.length !== 50) throw new Error('Expected 50 staging socket fixtures');
  for (const f of value) {
    if (!f || !/^[a-z0-9.-]+\/shiptorio-load-[a-z0-9-]+$/.test(f.repo) || typeof f.cookie !== 'string' || !f.cookie || /[\r\n]/.test(f.cookie)
      || typeof f.machineId !== 'string' || !f.machineId.startsWith('load-probe-'))
      throw new Error('Fixtures require */shiptorio-load-* repos, private staging cookies, and load-probe-* machines');
  }
  return value;
}

export function pinnedBuild(value: unknown, expected?: string): string {
  const commit = (value as { commit?: unknown } | null)?.commit;
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit) || expected && commit !== expected) throw new Error('Staging version changed or is not pinned to a commit');
  return commit;
}
