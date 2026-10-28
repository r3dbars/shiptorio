export const STAGING = 'https://shiptorio.dev';
export function loadProfile(value?: string) {
  if (value !== undefined && value !== '0' && value !== '200') throw new Error('Supplemental observers must be 0 or 200');
  const supplemental = value === '200' ? 200 : 0;
  return { supplemental, targetSockets: 50 + supplemental,
    name: supplemental ? 'beyond-target-250-socket-stress' : 'requested-product-200-http-50-socket' };
}

export function stagingControlAllowed(request: Request, env: { PUBLIC_URL?: string; LOAD_SETUP_TOKEN?: string; LOAD_SETUP_UNTIL?: string }, now = Date.now()) {
  const until = Number(env.LOAD_SETUP_UNTIL);
  return new URL(request.url).origin === STAGING && env.PUBLIC_URL === STAGING
    && request.method === 'POST' && !!env.LOAD_SETUP_TOKEN
    && Number.isFinite(until) && until > now
    && request.headers.get('authorization') === `Bearer ${env.LOAD_SETUP_TOKEN}`;
}

/** Only controlled harness messages can reach a durable report, never native errors containing credentials. */
export class LoadFailure extends Error {}
export function publicFailure(error: unknown): string {
  return error instanceof LoadFailure ? error.message : 'Load setup/transport failed; raw error omitted to protect credentials';
}
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
  if (!Array.isArray(value) || value.length !== 50) throw new LoadFailure('Expected 50 staging socket fixtures');
  for (const f of value) {
    if (!f || typeof f.repo !== 'string' || f.repo.length > 140 || !/^[a-z0-9.-]+\/shiptorio-load-[a-z0-9-]+$/.test(f.repo)
      || typeof f.cookie !== 'string' || !f.cookie || f.cookie.length > 4096 || /[\r\n]/.test(f.cookie)
      || typeof f.machineId !== 'string' || !/^load-probe-[\w-]{1,64}$/.test(f.machineId))
      throw new LoadFailure('Fixtures require */shiptorio-load-* repos, private staging cookies, and load-probe-* machines');
  }
  return value;
}

export function pinnedBuild(value: unknown, expected?: string): string {
  const commit = (value as { commit?: unknown } | null)?.commit;
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit) || expected && commit !== expected) throw new LoadFailure('Staging version changed or is not pinned to a commit');
  return commit;
}
