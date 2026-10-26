import WebSocket from 'ws';
import { mkdir, rm } from 'node:fs/promises';
import { assertWire } from '../contract/assert-wire';

const origin = 'http://localhost:8799';
const rounds = Number(process.env.LOAD_ROUNDS ?? 20);
if (!Number.isInteger(rounds) || rounds < 5 || rounds > 100) throw new Error('LOAD_ROUNDS must be 5..100');
await mkdir('test-results', { recursive: true });
await rm('test-results/load-worker.log', { force: true });
const output = Bun.file('test-results/load-worker.log');
const runId = `load-${crypto.randomUUID()}`;
const server = Bun.spawn(['bun', 'tests/e2e/start.ts'], { stdout: output, stderr: output, detached: true, env: { ...process.env, SHIPTORIO_TEST_RUN_ID: runId } });
const clients: { ws: WebSocket; repo: string; tick: number }[] = [];
const latencies: number[] = [], tickTimes: number[] = [];
let profileSocket: WebSocket | undefined;
const waitFor = async (predicate: () => boolean, timeout = 30_000) => {
  const until = performance.now() + timeout;
  while (!predicate()) { if (performance.now() > until) throw new Error('Load timeout / missing websocket delivery'); await Bun.sleep(5); }
};
const post = async (path: string) => { const r = await fetch(origin + path, { method: 'POST' }); if (!r.ok) throw new Error(`${path}: ${await r.text()}`); };
try {
  const until = Date.now() + 120_000;
  while (true) {
    try { const response = await fetch(origin + '/api/version'); if (response.ok && (await response.json() as { commit?: string }).commit === runId) break; } catch {}
    if (Date.now() > until || server.exitCode !== null) throw new Error('Wrangler failed to start; see load-worker.log');
    await Bun.sleep(200);
  }
  const repos = ['load/crowd', ...Array.from({ length: 50 }, (_, i) => `load/factory-${i}`)];
  // Provision sequentially through the real GitHub request budget (one installation).
  for (const repo of repos) await post(`/__test/${repo}/seed`);
  // Five legitimate player identities/IPs keep each cohort below the real 60 upgrades/min budget.
  const identities = await Promise.all(Array.from({ length: 5 }, async (_, i) => {
    const { cookie } = await (await fetch(`${origin}/__test/session?user=${i + 1}`, { method: 'POST' })).json() as { cookie: string };
    return { cookie, ip: `192.0.2.${i + 1}` };
  }));
  let clientNumber = 0;
  const sentAt = new Map<string, number>();
  const failures: string[] = [];
  const connect = async (repo: string) => {
    const identity = identities[clientNumber++ % identities.length];
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/api/repos/${repo}/factory`, { headers: { cookie: identity.cookie, origin, 'x-fixture-client-ip': identity.ip } });
    const client = { ws, repo, tick: -1 };
    clients.push(client);
    ws.onmessage = event => {
      let m: ReturnType<typeof assertWire>;
      try { m = assertWire(JSON.parse(String(event.data))); } catch (e) { failures.push(String(e)); return; }
      if (m.type === 'snapshot') client.tick = m.state.tick;
      if (m.type === 'patch' && m.patch.tick !== undefined) {
        client.tick = m.patch.tick;
        const t = sentAt.get(repo);
        if (t !== undefined) latencies.push(performance.now() - t);
      }
    };
    ws.on('unexpected-response', (_request, response) => { failures.push(`Upgrade ${repo}: HTTP ${response.statusCode}`); response.resume(); });
    ws.onerror = e => failures.push(`Socket error ${repo}: ${e.message}`);
    ws.onclose = () => failures.push(`Unexpected close ${repo}`);
    await waitFor(() => client.tick >= 0 || failures.length > 0);
    if (failures.length) throw new Error(failures.slice(0, 5).join('\n'));
  };
  // Ramp handshakes in batches; the measured phase still keeps all 250 sockets open.
  const connections = [...Array.from({ length: 200 }, () => repos[0]), ...repos.slice(1)];
  for (let i = 0; i < connections.length; i += 25) await Promise.all(connections.slice(i, i + 25).map(connect));
  await post('/__test/warm-load-grants');
  // CDP samples measure local workerd isolate CPU, never billed Cloudflare CPU.
  const targets = await (await fetch('http://localhost:9249/json')).json() as { webSocketDebuggerUrl: string }[];
  profileSocket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { profileSocket!.onopen = () => resolve(); profileSocket!.onerror = reject; });
  let id = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: unknown) => void }>();
  profileSocket.onmessage = event => { const m = JSON.parse(String(event.data)); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } };
  const cdp = (method: string) => new Promise<any>((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Inspector timeout: ${method}`)); }, 15_000);
    pending.set(requestId, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    profileSocket!.send(JSON.stringify({ id: requestId, method }));
  });
  await cdp('Profiler.enable');
  await cdp('Profiler.start');
  const started = performance.now();
  for (let round = 0; round < rounds; round++) {
    const expected = new Map(repos.map(repo => [repo, Math.max(...clients.filter(c => c.repo === repo).map(c => c.tick)) + 1]));
    await Promise.all(repos.map(async repo => {
      const start = performance.now(); sentAt.set(repo, start);
      await post(`/__test/${repo}/tick`);
      tickTimes.push(performance.now() - start);
    }));
    await waitFor(() => clients.every(c => c.tick >= expected.get(c.repo)!));
    sentAt.clear();
    if (failures.length) throw new Error(failures.join('\n'));
  }
  const elapsedMs = performance.now() - started;
  const { profile } = await cdp('Profiler.stop');
  if (!profile.samples?.length || profile.samples.length !== profile.timeDeltas?.length) throw new Error('Inspector returned no usable CPU samples');
  await Bun.write('test-results/load.cpuprofile', JSON.stringify(profile));
  const nodes = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);
  let activeUs = 0, factoryUs = 0;
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const node = nodes.get(profile.samples[i]);
    const us = profile.timeDeltas[i] ?? 0;
    if (!['(idle)', '(root)', '(program)'].includes(node?.callFrame.functionName)) activeUs += us;
    let ancestor = node, factory = false;
    while (ancestor) {
      if (['alarm', 'webSocketMessage', 'broadcast', 'refreshDecisions', 'runGauntlet', 'offerRunnerPlan'].includes(ancestor.callFrame.functionName)) factory = true;
      ancestor = nodes.get(parent.get(ancestor.id)!);
    }
    if (factory) factoryUs += us;
  }
  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) };
  };
  const report = { environment: { runtime: 'local Wrangler/workerd', platform: process.platform, arch: process.arch, bun: Bun.version, cpuMeasurement: 'CDP sampled isolate active CPU; Factory stack subset. Estimates, not billed production DO CPU.' }, clients: clients.length, clientsOnOneFactory: 200, otherTickingFactories: 50, rounds, elapsedMs, latencyMs: stats(latencies), tickRpcMs: stats(tickTimes), cpu: { samples: profile.samples?.length, isolateActiveMs: activeUs / 1000, factoryStackMs: factoryUs / 1000, factoryMsPerRequestedTick: factoryUs / 1000 / (repos.length * rounds) }, failures };
  await Bun.write('test-results/load.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (latencies.length < clients.length * rounds || report.latencyMs.p95 > 3000 || report.tickRpcMs.p95 > 5000) throw new Error('Load budget exceeded or deliveries missing');
} finally {
  profileSocket?.close();
  for (const { ws } of clients) { ws.onclose = null; ws.close(); }
  // Kill the complete Wrangler/workerd process group, including failure paths.
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await Promise.race([server.exited, Bun.sleep(5000)]);
  if (server.exitCode === null) { try { process.kill(-server.pid, 'SIGKILL'); } catch {} }
}
