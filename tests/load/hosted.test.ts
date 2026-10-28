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

import { pinnedBuild } from './hosted-support';
test('a replaced deployment invalidates the comparison', () => {
  expect(pinnedBuild({ commit: 'a'.repeat(40) })).toBe('a'.repeat(40));
  expect(() => pinnedBuild({ commit: 'unknown' })).toThrow();
  expect(() => pinnedBuild({ commit: 'b'.repeat(40) }, 'a'.repeat(40))).toThrow();
});

import { loadProfile, stagingControlAllowed, LoadFailure, publicFailure } from './hosted-support';
import { makeStagingConfig } from './staging-config';
test('requested profile opens exactly 50 sockets; extra 200 observers require explicit opt-in', () => {
  expect(loadProfile()).toEqual({ supplemental: 0, targetSockets: 50, name: 'requested-product-200-http-50-socket' });
  expect(loadProfile('200')).toEqual({ supplemental: 200, targetSockets: 250, name: 'beyond-target-250-socket-stress' });
  for (const value of ['50', '-200', '0.0', '', 'NaN']) expect(() => loadProfile(value)).toThrow();
});
test('fixture control fails closed for wrong host, missing/invalid expiry, method or bearer', () => {
  const now = 1000, env = { PUBLIC_URL: 'https://shiptorio.dev', LOAD_SETUP_TOKEN: 'unit-private-token', LOAD_SETUP_UNTIL: '2000' };
  const request = (url = 'https://shiptorio.dev/__load/seed', method = 'POST', token = 'unit-private-token') => new Request(url, { method, headers: { authorization: `Bearer ${token}` } });
  expect(stagingControlAllowed(request(), env, now)).toBe(true);
  for (const url of ['https://shiptorio.com/__load/seed', 'http://shiptorio.dev/__load/seed', 'https://shiptorio.dev.evil/__load/seed']) expect(stagingControlAllowed(request(url), env, now)).toBe(false);
  for (const expiry of [undefined, '', 'NaN', 'Infinity', '1000', '999']) expect(stagingControlAllowed(request(), { ...env, LOAD_SETUP_UNTIL: expiry }, now)).toBe(false);
  expect(stagingControlAllowed(request(), { ...env, PUBLIC_URL: 'https://shiptorio.com' }, now)).toBe(false);
  expect(stagingControlAllowed(request(undefined, 'GET'), env, now)).toBe(false);
  expect(stagingControlAllowed(request(undefined, 'POST', 'incorrect'), env, now)).toBe(false);
});
test('generated fixture config contains only pinned staging resources and an expiry', () => {
  const config = makeStagingConfig(1000);
  expect(config.name).toBe('shiptorio-staging');
  expect(config.routes).toEqual([{ pattern: 'shiptorio.dev', custom_domain: true }]);
  expect(config.vars.PUBLIC_URL).toBe('https://shiptorio.dev');
  expect(config.vars.LOAD_SETUP_UNTIL).toBe(String(1000 + 4 * 3600000));
  expect(config.d1_databases[0].database_id).toBe('82bf6646-ed06-4c4d-94c3-c9b747940a7e');
  expect(config.kv_namespaces[0].id).toBe('eb151c15e208446482ca39062005f4d9');
  expect(JSON.stringify(config)).not.toContain('shiptorio.com');
});
test('raw setup errors cannot serialize private headers/cookies into a report', () => {
  const secret = 'Authorization: Bearer private-test-cookie';
  expect(publicFailure(new Error(secret))).not.toContain(secret);
  expect(publicFailure(new LoadFailure('Staging version changed'))).toBe('Staging version changed');
});

import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePrivateJSON } from './private-files';
test('ephemeral fixture credentials are written privately without a public-file creation window', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiptorio-load-private-'));
  try {
    const path = join(dir, 'private', 'fixture.json');
    await writePrivateJSON(path, { token: 'local-unit-only' });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'private'))).mode & 0o777).toBe(0o700);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ token: 'local-unit-only' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
