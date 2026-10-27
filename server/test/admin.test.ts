import { expect, it, mock } from 'bun:test';
import { makeSessionCookie } from '../src/session';
import { signedInCookie, testD1 } from './d1-fixture';
mock.module('cloudflare:workers', () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { testApp: app } = await import('./app-fixture');
const secret = 'admin-test-session', password = 'admin-preview';
async function cookie(login?: string) {
  const preview = (await makeSessionCookie(`${secret}:${password}`, 'preview')).split(';')[0].replace('shiptorio_session=', 'shiptorio_access=');
  return preview + (login ? '; ' + await signedInCookie(env, login) : '');
}
const env = {
  SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: 'r3dbars,other', ADMIN_LOGINS: 'r3dbars', BUILD_SHA: 'abc123',
  CACHE: { list: async () => ({ keys: [] }), put: async () => {} },
  DB: testD1(),
  FACTORY: { idFromName: (repo: string) => repo, get: () => ({ debugSnapshot: async () => ({ repo: 'owner/repo', tick: 7 }) }) },
};
it('blocks unsigned and non-admin players on every admin route', async () => {
  for (const login of [undefined, 'other']) for (const path of ['/admin', '/admin/data', '/admin/force-error']) {
    const response = await app.fetch(new Request('https://shiptorio.com' + path, { method: path.endsWith('error') ? 'POST' : 'GET', headers: { cookie: await cookie(login) } }), env);
    expect(response.status).toBe(403);
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
  }
});
it('shows Justin recent logs and a selected factory snapshot; rejects unknown factories', async () => {
  await env.DB.prepare("INSERT OR IGNORE INTO repos (full_name, installation_id, default_branch) VALUES ('owner/repo', 1, 'main')").run();
  const headers = { cookie: await cookie('r3dbars') };
  const page = await app.fetch(new Request('https://shiptorio.com/admin', { headers }), env);
  expect(page.status).toBe(200); expect(await page.text()).toContain('Shiptorio diagnostics');
  const response = await app.fetch(new Request('https://shiptorio.com/admin/data?repo=owner/repo', { headers }), env);
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ release: 'abc123', snapshot: { tick: 7 }, errors: [], events: [], spark: [], webhooks: [] });
  expect((await app.fetch(new Request('https://shiptorio.com/admin/data?repo=unknown/repo', { headers }), env)).status).toBe(404);
});
it('requires same-origin explicit POST and configured DSN to force a Sentry error', async () => {
  const headers = { cookie: await cookie('r3dbars') };
  expect((await app.fetch(new Request('https://shiptorio.com/admin/force-error', { method: 'POST', headers }), env)).status).toBe(403);
  expect((await app.fetch(new Request('https://shiptorio.com/admin/force-error', { method: 'POST', headers: { ...headers, origin: 'https://shiptorio.com' } }), env)).status).toBe(503);
});
it('returns runtime telemetry identity and release using the signed session', async () => {
  const response = await app.fetch(new Request('https://shiptorio.com/api/telemetry/config', { headers: { cookie: await cookie('r3dbars'), 'x-request-id': 'forged' } }), env);
  const data = await response.json() as any;
  expect(data.userId).toBe('r3dbars'); expect(data.release).toBe('abc123');
  expect(data.requestId).toBe(response.headers.get('X-Request-ID')); expect(data.requestId).not.toBe('forged');
});

it('uses the configured owner in waitlist mode and never inherits maintainer or wildcard diagnostics', async () => {
  const ownerEnv = {...env, DB: testD1(), SIGNUP_GATE_MODE: 'waitlist', ALLOWED_LOGINS: 'alice,r3dbars', ADMIN_LOGINS: 'alice'};
  for (const [login, status] of [['alice', 200], ['r3dbars', 403]] as const) {
    const headers = {cookie: await signedInCookie(ownerEnv, login)};
    expect((await app.fetch(new Request('https://shiptorio.com/admin/data', {headers}), ownerEnv)).status).toBe(status);
  }
  const headers = {cookie: await signedInCookie(ownerEnv, 'r3dbars')};
  for (const admins of [undefined, '', '*']) expect((await app.fetch(new Request('https://shiptorio.com/admin/data', {headers}), {...ownerEnv, ADMIN_LOGINS: admins})).status).toBe(403);
});
