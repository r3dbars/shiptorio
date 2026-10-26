import { expect, it, mock } from 'bun:test';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { repoAccess, requireUser } from '../src/authorization';
import { makeSessionCookie } from '../src/session';
import { browserSocketEpoch } from '../src/browser-socket';
import { FactoryState } from '@shiptorio/shared';
import { starterLine } from '../src/engine';
import { pairToken } from '../src/runner-auth';
mock.module('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { default: app } = await import('../src/index');
const { Factory } = await import('../src/factory');
const origin = 'https://shiptorio.com';
const secret = 'test-isolation-session', password = 'test-isolation-preview';
async function cookies(login: string) {
  return (await makeSessionCookie(secret, login, Date.now(), { sid: login, uid: login === 'alice' ? 11 : 22 })).split(';')[0] + '; ' + (await makeSessionCookie(`${secret}:${password}`, 'preview')).split(';')[0].replace('shiptorio_session=', 'shiptorio_access=');
}
function fixture() {
  const repos = new Map([['alice/private', 11], ['bob/private', 22]]);
  const installs = new Set([11, 22]);
  const cache = new Map<string, { expiresAt: number }>();
  for (const [repo, id] of repos) cache.set(`access:v2:${id}:${repo}:${id}`, { expiresAt: Date.now() + 59000 });
  let factoryCalls = 0, writes = 0;
  const DB = { prepare(sql: string) { let args: unknown[] = []; const stmt = {
    bind(...values: unknown[]) { args = values; return stmt; },
    async first() {
      if (sql.startsWith('SELECT u.id, u.login FROM sessions')) return { id: args[1], login: args[1] === 11 ? 'alice' : 'bob' };
      if (sql.includes('FROM user_repos WHERE')) return String(args[1]).startsWith(args[0] === 11 ? 'alice/' : 'bob/') ? { installation_id: args[0] } : null;
      if (sql.includes('FROM user_installations WHERE')) return args[0] === args[1] ? { installation_id: args[1] } : null;
      if (sql === 'SELECT installation_id FROM repos WHERE full_name = ?') return repos.has(String(args[0])) ? { installation_id: repos.get(String(args[0])) } : null;
      if (sql === 'SELECT id FROM installations WHERE id = ?') return installs.has(Number(args[0])) ? { id: args[0] } : null;
      throw new Error(`Unexpected query ${sql}`);
    },
    all: async () => ({ results: [...repos].map(([full_name, installation_id]) => ({ full_name, installation_id, default_branch: 'main' })) }),
  }; return stmt; } };
  const env = { DB, SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: 'alice,bob', GITHUB_APP_ID: 'test', GITHUB_APP_PRIVATE_KEY: 'test',
    CACHE: { get: async (key: string) => cache.get(key) ?? null, put: async () => { writes++; } },
    ASSETS: { fetch: async () => new Response('static shell') },
    FACTORY: { idFromName: (name: string) => name, get: (name: string) => { if (name.startsWith("security:")) return { securityLimit: async () => ({ allowed: true, retryAfter: 0 }) }; factoryCalls++; return { runnerJobs: async () => [], fetch: async () => new Response('private factory') }; } },
  };
  const send = async (path: string, login = 'bob', method = 'GET', headers = {}, body?: string) => app.fetch(new Request(origin + path, { method, headers: { origin, cookie: await cookies(login), ...headers }, body }), env as never);
  return { env, send, cache, repos, installs, calls: () => factoryCalls, writes: () => writes };
}

it('second allowed user cannot read state/jobs, pair a runner, send HTTP moves, upgrade sockets or see/save connect pages', async () => {
  const f = fixture();
  for (const [path, method, headers] of [
    ['/api/repos/alice/private/factory', 'GET', {}],
    ['/api/repos/alice/private/factory', 'GET', { upgrade: 'websocket' }],
    ['/api/repos/alice/private/factory', 'POST', {}],
    ['/api/repos/alice/private/runner/jobs', 'GET', {}],
    ['/api/repos/alice/private/runner/pair', 'POST', {}],
    ['/api/repos/alice/private/runner/jobs', 'POST', {}],
    ['/connect/sentry?repo=alice/private', 'GET', {}],
    ['/connect/posthog?repo=alice/private', 'POST', {}],
    ['/api/sources?repo=alice/private', 'GET', {}],
    ['/api/setup/status?repo=alice/private', 'GET', {}],
  ] as const) expect((await f.send(path, 'bob', method, headers)).status).toBe(403);
  expect(f.calls()).toBe(0);
  expect(f.writes()).toBe(0);
  expect((await f.send('/api/repos/bob/private/runner/jobs')).status).toBe(200);
});

it('repo discovery filters tenants and uninstallation overrides a positive KV grant', async () => {
  const f = fixture();
  const list = await (await f.send('/api/repos')).json() as { repos: { full_name: string }[] };
  expect(list.repos.map(r => r.full_name)).toEqual(['bob/private']);
  f.installs.delete(22);
  expect((await f.send('/api/repos/bob/private/runner/jobs')).status).toBe(403);
  f.installs.add(22); f.repos.delete('bob/private');
  expect((await f.send('/api/repos/bob/private/runner/jobs')).status).toBe(403);
  expect((await f.send('/connect/sentry?repo=uninstalled/repo')).status).toBe(403);
});

it('no session, preview-only cookies, invalid repo, unknown API and setup cannot bypass the boundary', async () => {
  const f = fixture();
  expect(await requireUser(new Request(origin), f.env as never)).toBeNull();
  for (const path of ['/connect/sentry', '/connect/sentry?repo=alice%2F..', '/api/repos/alice/private/admin']) expect((await f.send(path)).status).toBe(403);
  expect((await f.send('/api/debug')).status).toBe(404);
  for (const path of ['/admin', '/api/admin/flags?user=alice']) expect((await f.send(path)).status).toBe(403);
  expect((await f.send('/setup')).status).toBe(404);
  expect(await (await f.send('/assets/app.js')).text()).toBe('static shell');
});

it('GitHub refresh checks installation identity and effective user permission; expired KV and upstream failures fail closed', async () => {
  const f = fixture();
  f.cache.clear();
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  f.env.GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const user = { id: 22, sessionHash: createHash('sha256').update('bob').digest('hex'), login: 'bob', expiresAt: Date.now() + 60000 };
  const original = globalThis.fetch;
  const paths: string[] = [];
  let permission = 'write', installed = 22, fail = false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname; paths.push(path);
    if (fail) return new Response('{}', { status: 503 });
    return Response.json(path.endsWith('/installation') ? { id: installed } : path.endsWith('/access_tokens') ? { token: 'test-install-token' } : { permission, user: { id: 22 } });
  }) as typeof fetch;
  try {
    expect(await repoAccess(f.env as never, user, 'BOB/PRIVATE')).toBe(22);
    expect(paths).toEqual(['/repos/bob/private/installation', '/app/installations/22/access_tokens', '/repos/bob/private/collaborators/bob/permission']);
    permission = 'none'; expect(await repoAccess(f.env as never, user, 'bob/private')).toBeNull();
    permission = 'admin'; installed = 11; expect(await repoAccess(f.env as never, user, 'bob/private')).toBeNull();
    installed = 22; fail = true;
    f.cache.set('access:v2:22:bob/private:22', { expiresAt: Date.now() - 1 });
    expect(await repoAccess(f.env as never, user, 'bob/private')).toBeNull();
    f.cache.set('access:v2:22:bob/private:22', { expiresAt: Date.now() + 3600000 });
    expect(await repoAccess(f.env as never, user, 'bob/private')).toBeNull();
  } finally { globalThis.fetch = original; }
});

it('Factory independently rejects another repo upgrade, forged move, revoked membership and cross-repo broadcasts', async () => {
  const f = fixture();
  const state = FactoryState.parse({ repo: 'alice/private', baseBranch: 'main', districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([['state', state], ['meta', { repo: state.repo, installationId: 11 }]]);
  const storage = { get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); } };
  let closed = 0, sent = 0;
  const auth = { user: { id: 22, sessionHash: createHash('sha256').update('bob').digest('hex'), login: 'bob', expiresAt: Date.now() + 60000 }, login: 'bob', expiresAt: Date.now() + 60000, epoch: await browserSocketEpoch(f.env), repo: 'bob/private' };
  const ws = { deserializeAttachment: () => auth, close: () => { closed++; }, send: () => { sent++; } } as unknown as WebSocket;
  const factory = new Factory({ storage, getWebSockets: () => [ws], blockConcurrencyWhile: (fn: () => unknown) => fn() } as never, f.env as never);
  for (const repo of ['bob/private', 'alice/private']) {
    const response = await factory.fetch(new Request(`${origin}/api/repos/${repo}/factory`, { headers: { origin, upgrade: 'websocket', cookie: await cookies('bob') } }));
    expect(response.status).toBe(403);
  }
  const move = JSON.stringify({ type: 'place_machine', machineType: 'assembler', x: 22, y: 22 });
  await factory.webSocketMessage(ws, move);
  auth.repo = 'alice/private'; // authentic attachment still lacks this membership
  await factory.webSocketMessage(ws, move);
  await (factory as unknown as { broadcast(value: unknown): Promise<void> }).broadcast({ type: 'snapshot', state });
  expect((data.get('state') as FactoryState).machines).toHaveLength(state.machines.length);
  expect(sent).toBe(0); expect(closed).toBe(3);
  auth.login = 'alice'; auth.user = { id: 11, sessionHash: createHash('sha256').update('alice').digest('hex'), login: 'alice', expiresAt: Date.now() + 60000 };
  await factory.webSocketMessage(ws, JSON.stringify({ type: 'place_machine', machineType: 'assembler', x: 22, y: 22, repo: 'bob/private' }));
  expect((data.get('state') as FactoryState).machines).toHaveLength(state.machines.length);
  f.repos.delete('alice/private');
  await factory.webSocketMessage(ws, move);
  expect(closed).toBe(5);
});

it('runner capability is confined to pairing user, installation and repo, including renewal', async () => {
  const f = fixture();
  const send = async (repo: string, login?: string) => {
    const token = await pairToken(secret, { repo, pairId: 'test', expires: Date.now() + 60000, ...(login ? { user: { id: login === 'alice' ? 11 : 22, sessionHash: createHash('sha256').update(login).digest('hex'), login, expiresAt: Date.now() + 60000 } } : {}) });
    return app.fetch(new Request(`${origin}/api/runner/${repo}/renew`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }), f.env as never);
  };
  expect((await send('alice/private', 'bob')).status).toBe(403);
  expect((await send('bob/private')).status).toBe(403);
  f.installs.delete(22);
  expect((await send('bob/private', 'bob')).status).toBe(403);
  expect(f.calls()).toBe(0);
});

it('real account logout immediately revokes existing sockets and runner grants even with positive KV membership', async () => {
  const { testD1, signedInCookie } = await import('./d1-fixture');
  const { membershipCache } = await import('./browser-fixture');
  const env = { ...fixture().env, DB: testD1(), CACHE: membershipCache };
  const loginCookie = await signedInCookie(env, 'alice', ['alice/private'], 11);
  const user = await requireUser(new Request(origin, { headers: { cookie: loginCookie } }), env as never);
  expect(user?.id).toBe(11);
  expect(await repoAccess(env as never, user!, 'alice/private')).toBe(1);
  const state = FactoryState.parse({ repo: 'alice/private', baseBranch: 'main', districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([['state', state], ['meta', { repo: state.repo, installationId: 1 }]]);
  const storage = { get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); } };
  let closed = 0, sent = 0;
  const attachment = { user: user!, login: 'alice', expiresAt: user!.expiresAt, epoch: await browserSocketEpoch(env), repo: state.repo };
  const ws = { deserializeAttachment: () => attachment, close: () => { closed++; }, send: () => { sent++; } } as unknown as WebSocket;
  const factory = new Factory({ storage, getWebSockets: () => [ws], blockConcurrencyWhile: (fn: () => unknown) => fn() } as never, env as never);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(11).run();
  expect(await repoAccess(env as never, user!, state.repo)).toBeNull();
  expect(await requireUser(new Request(origin, { headers: { cookie: loginCookie } }), env as never)).toBeNull();
  await factory.webSocketMessage(ws, JSON.stringify({ type: 'place_machine', machineType: 'assembler', x: 22, y: 22 }));
  await (factory as unknown as { broadcast(value: unknown): Promise<void> }).broadcast({ type: 'snapshot', state });
  expect(closed).toBe(2); expect(sent).toBe(0);
  expect((data.get('state') as FactoryState).machines).toHaveLength(state.machines.length);
  const token = await pairToken(secret, { repo: state.repo, pairId: 'test', expires: Date.now() + 60000, user: user! });
  const response = await app.fetch(new Request(`${origin}/api/runner/${state.repo}/renew`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }), env as never);
  expect(response.status).toBe(403);
});

it('signed webhooks mutate only their named repo and Sentry dedupe IDs are tenant-scoped', async () => {
  const { testD1 } = await import('./d1-fixture');
  const DB = testD1();
  for (const [repo, id] of [['alice/private', 11], ['bob/private', 22]] as const) {
    await DB.prepare('INSERT INTO installations (id, account_login) VALUES (?, ?)').bind(id, repo.split('/')[0]).run();
    await DB.prepare('INSERT INTO repos (full_name, installation_id) VALUES (?, ?)').bind(repo, id).run();
  }
  const queued: string[] = [];
  const env = { ...fixture().env, DB, GITHUB_WEBHOOK_SECRET: 'test-github-hook-secret',
    CACHE: { get: async (key: string) => key === 'cred:sentry:alice/private' ? { clientSecret: 'alice-secret' } : key === 'cred:sentry:bob/private' ? { clientSecret: 'bob-secret' } : null },
    FACTORY: { idFromName: (repo: string) => repo, get: (repo: string) => ({
      enqueueGitHub: async (_id: string, _event: string, payload: { repository: { full_name: string } }) => { expect(repo).toBe(payload.repository.full_name); queued.push(`github:${repo}`); },
      enqueueSentry: async (id: string) => { queued.push(`sentry:${repo}:${id}`); },
    }) },
  };
  async function sign(keyText: string, body: string) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const sentryBody = JSON.stringify({ action: 'created', data: { issue: { id: '1', title: 'test' } } });
  const sentry = async (repo: string, secretKey: string) => app.fetch(new Request(`${origin}/webhooks/sentry/${repo}`, { method: 'POST', headers: { 'sentry-hook-signature': await sign(secretKey, sentryBody), 'sentry-hook-resource': 'issue', 'request-id': 'same-event' }, body: sentryBody }), env as never, { waitUntil() {} } as never);
  expect((await sentry('bob/private', 'alice-secret')).status).toBe(401);
  expect(queued).toEqual([]);
  expect((await sentry('alice/private', 'alice-secret')).status).toBe(202);
  expect((await sentry('bob/private', 'bob-secret')).status).toBe(202);
  expect(queued).toEqual(['sentry:alice/private:alice/private:same-event', 'sentry:bob/private:bob/private:same-event']);
  const githubBody = JSON.stringify({ action: 'opened', installation: { id: 22 }, repository: { full_name: 'bob/private' }, issue: { number: 1, title: 'Test' } });
  const github = async (sig: string) => app.fetch(new Request(`${origin}/webhooks/github`, { method: 'POST', headers: { 'x-hub-signature-256': sig, 'x-github-event': 'issues', 'x-github-delivery': 'test-github-delivery' }, body: githubBody }), env as never, { waitUntil() {} } as never);
  expect((await github('sha256=invalid')).status).toBe(401);
  expect((await github('sha256=' + await sign(env.GITHUB_WEBHOOK_SECRET, githubBody))).status).toBe(202);
  expect(queued.at(-1)).toBe('github:bob/private');
});
