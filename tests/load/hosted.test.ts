import { expect, test } from 'bun:test';
import { stagingOrigin, stats, fixtures } from './hosted-support';
test('hosted load cannot target production, redirects, or lookalike hosts', () => {
  expect(stagingOrigin()).toBe('https://shiptorio.dev');
  for (const url of ['https://shiptorio.com', 'https://shiptorio.dev.evil.test', 'http://shiptorio.dev', 'https://shiptorio.dev/'])
    expect(() => stagingOrigin(url)).toThrow();
});
test('empty measurements are unavailable, not zero; percentiles use nearest rank', () => {
  expect(stats([])).toEqual({ count: 0, p50: null, p95: null, max: null });
  expect(stats(Array.from({ length: 100 }, (_, i) => 100 - i))).toEqual({ count: 100, p50: 50, p95: 95, max: 100 });
});
test('mutating probes require exactly 50 explicit isolated staging fixtures', () => {
  const valid = Array.from({ length: 50 }, () => ({ repo: 'r3dbars/shiptorio-load-crowd', cookie: 'private-session', machineId: 'load-probe-1' }));
  expect(fixtures(valid)).toHaveLength(50);
  expect(() => fixtures(valid.slice(1))).toThrow();
  expect(() => fixtures([{ ...valid[0], repo: 'r3dbars/shiptorio' }, ...valid.slice(1)])).toThrow();
  expect(() => fixtures([{ ...valid[0], cookie: 'x\r\ny' }, ...valid.slice(1)])).toThrow();
});

import { rateLimit, LIMITS, consumeBudget, type Budget } from '../../server/src/rate-limit';
test('shared NAT admits the 250-viewer burst without lifting individual user limits', async () => {
  const counters = new Map<string, Map<string, unknown>>();
  let subject = '';
  const env = { FACTORY: {
    idFromName: (name: string) => { subject = name; return name as unknown as DurableObjectId; },
    get: () => {
      const name = subject;
      if (!counters.has(name)) counters.set(name, new Map());
      const values = counters.get(name)!;
      return { securityLimit: (budget: Budget) => consumeBudget({ transaction: async fn => fn({ get: async <T>(key: string) => values.get(key) as T | undefined, put: async (key, value) => { values.set(key, value); } }) }, budget, 1000) };
    },
  } };
  for (let i = 0; i < 250; i++) {
    expect((await rateLimit(env, 'ip:192.0.2.10', 'socket')).allowed).toBe(true);
    expect((await rateLimit(env, `user:${i % 5}`, 'socket')).allowed).toBe(true);
  }
  for (let i = 50; i < LIMITS.socket; i++) expect((await rateLimit(env, 'user:0', 'socket')).allowed).toBe(true);
  expect((await rateLimit(env, 'user:0', 'socket')).allowed).toBe(false);
  for (let i = 250; i < LIMITS.socket_ip; i++) await rateLimit(env, 'ip:192.0.2.10', 'socket');
  expect((await rateLimit(env, 'ip:192.0.2.10', 'socket')).allowed).toBe(false);
});

import { pinnedBuild } from './hosted-support';
test('a replaced deployment invalidates the comparison', () => {
  expect(pinnedBuild({ commit: 'a'.repeat(40) })).toBe('a'.repeat(40));
  expect(() => pinnedBuild({ commit: 'unknown' })).toThrow();
  expect(() => pinnedBuild({ commit: 'b'.repeat(40) }, 'a'.repeat(40))).toThrow();
});
