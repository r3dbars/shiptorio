// Deliberately separate from run.ts: no local test bypasses or production fallback.
import { LoadWebSocket as WebSocket } from './socket-client';
import { setTimeout as delay } from 'node:timers/promises';
import { setMaxListeners } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { assertWire } from '../contract/assert-wire';
import { fixtures, stagingOrigin, stats, pinnedBuild, loadProfile, LoadFailure, publicFailure, type Fixture } from './hosted-support';

const origin = stagingOrigin(process.env.LOAD_ORIGIN);
const preflightOnly = process.argv.includes('--preflight');
const output = process.env.LOAD_REPORT ?? 'test-results/hosted-load.json';
const durationMs = 600_000;
const profile = loadProfile(process.env.LOAD_SUPPLEMENTAL_OBSERVERS);
const { supplemental, targetSockets } = profile;
const cancelled = new AbortController();
setMaxListeners(0, cancelled.signal);
const sleep = (ms: number) => delay(ms, undefined, { signal: cancelled.signal }).catch(error => { if (!cancelled.signal.aborted) throw error; });
let workload: Promise<unknown>[] = [];
const requestMs: number[] = [], apiMs: number[] = [], fanoutMs: number[] = [], upgradesMs: number[] = [];
const failures: Record<string, number> = {};
let attempts = 0, failed = 0, unexpectedCloses = 0, stopping = false, startedAt = '', endedAt = '';
const stop = () => { stopping = true; stage = 'cancelled'; cancelled.abort(); for (const { ws } of sockets) ws.terminate(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
const fail = (kind: string) => { failed++; failures[kind] = (failures[kind] ?? 0) + 1; };
const sockets: { ws: WebSocket; fixture: Fixture; snapshot: boolean }[] = [];
const probes = new Map<string, { start: number; remaining: Set<WebSocket>; x: number; y: number }>();
let stage = 'preflight';
let build: unknown = null;
const observedAt = new Date().toISOString();
let preflight: { health: number; judge: number; version: number } | null = null;
let blocked: string | null = null;
async function get(path: string, cookie = '', measured = true) {
  if (measured) attempts++;
  const begin = performance.now();
  try {
    const res = await fetch(origin + path, { headers: cookie ? { cookie } : {}, redirect: 'manual', signal: AbortSignal.any([cancelled.signal, AbortSignal.timeout(15_000)]) });
    const body = await res.text();
    if (measured) {
      (path.startsWith('/api/') ? apiMs : requestMs).push(performance.now() - begin);
      if (!res.ok) fail(`http:${res.status}`);
    }
    return { status: res.status, body };
  } catch {
    if (measured && !cancelled.signal.aborted) fail('http:transport');
    return { status: 0, body: '' };
  }
}
const key = (f: Fixture) => `${f.repo}:${f.machineId}`;
try {
  const health = await get('/api/health', '', false);
  const judge = await get('/judge', '', false);
  const version = await get('/api/version', '', false);
  build = version.status === 200 ? JSON.parse(version.body) : { status: version.status };
  preflight = { health: health.status, judge: judge.status, version: version.status };
  console.log(JSON.stringify({ origin, ...preflight }));
  if (health.status !== 200 || judge.status !== 200 || !judge.body.includes('<html'))
    throw new LoadFailure(`Staging preflight failed: health=${health.status}, public /judge=${judge.status}`);
  if (version.status !== 200) throw new LoadFailure('Staging build SHA is unavailable; comparison requires a version receipt');
  if (!preflightOnly) {
    const expectedBuild = pinnedBuild(build, process.env.LOAD_EXPECTED_SHA);
    if (!process.env.LOAD_SETUP_TOKEN_FILE) throw new LoadFailure('LOAD_SETUP_TOKEN_FILE is required for source/auth/fixture guards');
    const setupToken = (await Bun.file(process.env.LOAD_SETUP_TOKEN_FILE).json()).LOAD_SETUP_TOKEN as string;
    if (typeof setupToken !== 'string' || !setupToken) throw new LoadFailure('Missing private setup token');
    const runtime = async () => {
      const r = await fetch(origin + '/__load/status', { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${setupToken}` }, signal: AbortSignal.any([cancelled.signal, AbortSignal.timeout(15000)]) });
      if (!r.ok) throw new LoadFailure('Staging runtime guard unavailable');
      const state = await r.json() as { grantsAlive?: boolean };
      if (state.grantsAlive === false) throw new LoadFailure('Synthetic provider grants are unhealthy; invalid setup');
      return JSON.stringify(state);
    };
    const expectedRuntime = await runtime();
    const file = process.env.LOAD_FIXTURES_FILE;
    if (!file) throw new LoadFailure('LOAD_FIXTURES_FILE is required (private staging-only fixture JSON)');
    const factory = fixtures(await Bun.file(file).json());
    stage = 'connecting';
    const connect = (fixture: Fixture) => new Promise<void>((resolve, reject) => {
      attempts++;
      const begin = performance.now();
      let ws: WebSocket;
      try { ws = new WebSocket(`${origin.replace('https:', 'wss:')}/api/repos/${fixture.repo}/factory`, {
        headers: { cookie: fixture.cookie, origin }, handshakeTimeout: 15_000, followRedirects: false,
      }); } catch { fail('upgrade:setup'); reject(new LoadFailure('Invalid socket setup')); return; }
      const client = { ws, fixture, snapshot: false };
      sockets.push(client);
      const timeout = setTimeout(() => { rejectUpgrade('upgrade:no-snapshot'); ws.terminate(); }, 20_000);
      let upgradeFailed = false;
      const rejectUpgrade = (kind: string) => {
        if (upgradeFailed || client.snapshot) return;
        upgradeFailed = true; if (!stopping) fail(kind); clearTimeout(timeout); reject(new LoadFailure('Socket handshake failed; see aggregate report'));
      };
      ws.on('unexpected-response', (_req, res) => { rejectUpgrade(`upgrade:${res.statusCode}`); res.resume(); ws.terminate(); });
      ws.on('error', () => { if (stopping) return; if (!client.snapshot) rejectUpgrade('upgrade:transport'); else { attempts++; fail('socket:transport'); } });
      ws.on('close', () => { if (!client.snapshot) { rejectUpgrade('upgrade:closed'); return; } if (!stopping && client.snapshot) { unexpectedCloses++; attempts++; fail('socket:closed'); } });
      ws.on('message', data => {
        if (stopping) return;
        try {
          const m = assertWire(JSON.parse(String(data)));
          if (m.type === 'snapshot' && !client.snapshot) {
            const machine = m.state.machines.find(x => x.id === fixture.machineId);
            if (!machine || machine.state !== 'idle') throw new LoadFailure('Missing idle probe machine');
            client.snapshot = true;
            clearTimeout(timeout); upgradesMs.push(performance.now() - begin); resolve();
          }
          if (m.type === 'patch') {
            const probe = probes.get(key(fixture));
            if (probe && m.patch.machines?.some(m => m.id === fixture.machineId && m.x === probe.x && m.y === probe.y) && probe.remaining.delete(ws)) {
              fanoutMs.push(performance.now() - probe.start);
              if (!probe.remaining.size) probes.delete(key(fixture));
            }
          }
        } catch { attempts++; fail('socket:invalid-wire-or-fixture'); rejectUpgrade('upgrade:invalid-fixture'); }
      });
    });
    // Supplemental live observers are opt-in and stress the shared factory. /judge itself is
    // still simulation-only; these are NOT claimed as actual judge sockets.
    const cohort = [...Array.from({ length: supplemental }, (_, i) => factory[i % factory.length]), ...factory];
    const connected = await Promise.allSettled(cohort.map(connect));
    if (stopping) throw new LoadFailure('Load cancelled');
    const rejectedUpgrades = connected.filter(r => r.status === 'rejected').length;
    console.log(JSON.stringify({ connected: sockets.filter(c => c.snapshot).length, rejectedUpgrades }));
    // A failed baseline still runs its full observation window, without retrying
    // rejected sockets. Only an intact full cohort can pass the final budget.
    stage = 'measuring'; startedAt = new Date().toISOString();
    const deadline = performance.now() + durationMs;
    const judgeViewers = Array.from({ length: 200 }, async () => {
      // Virtual page viewers refetch HTML and its same-origin hashed entry assets
      // every 90 seconds. This does not measure WebGL/browser frame performance.
      do {
        const page = await get('/judge');
        const paths = new Set([...page.body.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m => m[1]));
        await Promise.all([...paths].map(path => get(path)));
        await sleep(Math.min(90_000, Math.max(0, deadline - performance.now())));
      } while (!stopping && performance.now() < deadline);
    });
    const polling = (async () => {
      do {
        const version = await get('/api/version', '', false);
        try { pinnedBuild(JSON.parse(version.body), expectedBuild); if (await runtime() !== expectedRuntime) throw new LoadFailure('Staging auth epoch changed'); }
        catch (error) { if (stopping) throw new LoadFailure('Load cancelled'); stage = 'invalidated'; throw new LoadFailure('Staging runtime invalidated: ' + (publicFailure(error))); }
        await get('/api/repos', factory[0].cookie);
        await sleep(Math.min(5_000, Math.max(0, deadline - performance.now())));
      } while (!stopping && performance.now() < deadline);
    })();
    const events = (async () => {
      let round = 0;
      do {
        const unique = new Map(factory.map(f => [key(f), f]));
        let probeIndex = 0;
        for (const f of unique.values()) {
          const viewers = sockets.filter(c => c.fixture.repo === f.repo && c.fixture.machineId === f.machineId);
          if (!viewers.some(c => c.ws.readyState === WebSocket.OPEN)) continue;
          const previous = probes.get(key(f));
          if (previous) { for (const _ of previous.remaining) fail('socket:missing-probe'); }
          const x = 10_000 + round * 200 + probeIndex++ * 3, y = 10_000; // dedicated staging load repo; avoid real machines
          attempts += viewers.filter(c => c.ws.readyState === WebSocket.OPEN).length;
          probes.set(key(f), { start: performance.now(), remaining: new Set(viewers.filter(c => c.ws.readyState === WebSocket.OPEN).map(c => c.ws)), x, y });
          attempts++;
          try { viewers.find(c => c.ws.readyState === WebSocket.OPEN)!.ws.send(JSON.stringify({ type: 'move_machine', id: f.machineId, x, y })); }
          catch { fail('socket:send'); }
        }
        round++;
        // Observer heartbeat mirrors web/src/source/live.ts. No synthetic IP headers.
        for (const { ws } of sockets) if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        await sleep(Math.min(30_000, Math.max(0, deadline - performance.now())));
        console.log(JSON.stringify({ phase: 'progress', at: new Date().toISOString(), open: sockets.filter(c => c.ws.readyState === WebSocket.OPEN).length, fanoutMs: stats(fanoutMs), failures }));
      } while (!stopping && performance.now() < deadline);
    })();
    workload = [events, polling, ...judgeViewers];
    await Promise.all(workload);
    endedAt = new Date().toISOString();
    for (const p of probes.values()) { for (const _ of p.remaining) fail('socket:missing-probe'); }
    stage = 'complete';
  }
} catch (error) {
  blocked = publicFailure(error);
  process.exitCode = 1;
} finally {
  const openAtEnd = sockets.filter(c => c.ws.readyState === WebSocket.OPEN).length;
  stopping = true;
  cancelled.abort();
  for (const { ws } of sockets) ws.terminate();
  await Promise.allSettled(workload);
  const errorRate = attempts ? failed / attempts : null;
  const report = {
    profile: profile.name, origin, observedAt, preflight, stage, blocked, build, startedAt, endedAt, durationMs,
    cohort: { judgeHttpViewers: 200, supplementalLiveObservers: supplemental, signedInFactorySockets: 50, connectedSnapshots: sockets.filter(c => c.snapshot).length, openAtEnd, unexpectedCloses },
    apiMs: stats(apiMs), pageAndAssetMs: stats(requestMs), upgradeMs: stats(upgradesMs), fanoutMs: stats(fanoutMs),
    attempts, failed, errorRate, failures,
    cloudflare: { durableObjectCpuMs: null, d1RowsReadPerMinute: null, d1RowsWrittenPerMinute: null,
      reason: 'Requires staging-scoped Cloudflare analytics export for this exact UTC window; client timing cannot measure billed CPU/D1.' },
    passedClientBudgets: stage === 'complete' && unexpectedCloses === 0 && openAtEnd === targetSockets && !!fanoutMs.length && fanoutMs.length >= targetSockets * 20 && (stats(fanoutMs).p95 ?? Infinity) < 500 && errorRate !== null && errorRate < .005,
  };
  await mkdir('test-results', { recursive: true });
  await Bun.write(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!preflightOnly && !report.passedClientBudgets) process.exitCode = 1;
}
