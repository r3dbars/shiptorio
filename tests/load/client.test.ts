import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { writePrivateJSON } from './private-files';
async function run(args: string[], fixturesValue?: unknown, origin = 'https://127.0.0.1:4443') {
  const dir = await mkdtemp(join(tmpdir(), 'shiptorio-load-cli-'));
  const report = join(dir, 'report.json'), fixture = join(dir, 'fixture.json'), token = join(dir, 'token.json'), counter = join(dir, 'constructions.txt');
  try {
    if (typeof fixturesValue === 'string') await Bun.write(fixture, fixturesValue);
    else if (fixturesValue) await writePrivateJSON(fixture, fixturesValue);
    await writePrivateJSON(token, { LOAD_SETUP_TOKEN: 'unit-only-setup-token' });
    const child = Bun.spawn([process.execPath, '--preload', resolve(import.meta.dir, 'client.fixture.ts'), resolve(import.meta.dir, 'hosted.ts'), ...args], {
      env: { ...process.env, LOAD_ORIGIN: origin, LOAD_TEST_CONSTRUCTIONS_FILE: counter, LOAD_REPORT: report, LOAD_FIXTURES_FILE: fixture, LOAD_SETUP_TOKEN_FILE: token, LOAD_SUPPLEMENTAL_OBSERVERS: '0', LOAD_EXPECTED_SHA: 'a'.repeat(40) }, stdout: 'pipe', stderr: 'pipe',
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      return { stdout, stderr, exitCode, constructions: Number(await Bun.file(counter).text()), report: await Bun.file(report).exists() ? await Bun.file(report).json() : null };
    } finally { clearTimeout(timer); }
  } finally { await rm(dir, { recursive: true, force: true }); }
}
test('local CLI preflight reports the actual requested profile and opens no sockets', async () => {
  const result = await run(['--preflight']);
  expect(result.exitCode).toBe(0);
  expect(result.report.profile).toBe('requested-product-200-http-50-socket');
  expect(result.report.cohort).toMatchObject({ judgeHttpViewers: 200, supplementalLiveObservers: 0, signedInFactorySockets: 50, connectedSnapshots: 0 });
  expect(result.report.passedClientBudgets).toBe(false);
  expect(result.constructions).toBe(0);
});
test('malformed private fixtures cannot leak their value into CLI output or JSON evidence', async () => {
  const secret = 'never-log-private-fixture-value';
  const result = await run([], `{"cookie":"${secret}`);
  expect(result.exitCode).toBe(1);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.report.blocked).toContain('raw error omitted');
});
test('a source change stops all viewer timers promptly and cannot pass the load budget', async () => {
  const fixture = Array.from({ length: 50 }, () => ({ repo: 'load-test/shiptorio-load-crowd', machineId: 'load-probe-1', cookie: 'unit-cookie-only' }));
  const result = await run([], fixture);
  expect(result.exitCode).toBe(1);
  expect(result.report.stage).toBe('invalidated');
  expect(result.report.cohort.connectedSnapshots, JSON.stringify(result.report)).toBe(50);
  expect(result.constructions).toBe(50);
  expect(result.report.passedClientBudgets).toBe(false);
  expect(result.stderr).not.toContain('unit-cookie-only');
});

test('nonlocal orchestration targets are rejected before any client construction', async () => {
  for (const origin of ['https://shiptorio.dev', 'https://shiptorio.com']) {
    const result = await run(['--preflight'], undefined, origin);
    expect(result.exitCode).toBe(1);
    expect(result.constructions).toBe(0);
    expect(result.report).toBeNull();
    expect(result.stderr).toContain('requires a loopback target');
  }
});
