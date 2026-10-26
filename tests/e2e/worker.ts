// TEST ENTRY ONLY. Production wrangler.jsonc never imports this module.
import app, { Factory as ProductionFactory, type Env } from '../../server/src/index';
import { makeSessionCookie } from '../../server/src/session';
import { createSession, upsertUser, saveReach } from '../../server/src/accounts';
const knownRepos = new Set<string>();
const installationId = (repo: string) => repo === 'load/crowd' ? 1000
  : repo.startsWith('load/factory-') ? 1001 + Number(repo.slice('load/factory-'.length)) : 1;
export class Factory extends ProductionFactory {
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    // Test pacing is explicit: a slow fake-provider call must not race a natural alarm.
    const storage = new Proxy(ctx.storage, { get(target, key) {
      if (key === 'setAlarm') return async () => {};
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    this.ctx = new Proxy(ctx, { get(target, key) {
      if (key === 'storage') return storage;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  // Use the real alarm body, with test-controlled pacing to avoid card-ID races.
  async alarm() { await super.alarm(); await this.ctx.storage.deleteAlarm(); }
  async testTick() { await this.alarm(); }
}
const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40);
const files = [
  { filename: 'src/cart.ts', status: 'modified', changes: 2, patch: '-return 0;\n+return 1;' },
  { filename: 'src/cart.test.ts', status: 'modified', changes: 2, patch: '-expect(total()).toBe(0);\n+expect(total()).toBe(1);' },
];
const reply = (value: unknown) => Response.json(value);
const promptJson = (content: string) => {
  const envelope = content.match(/^UNTRUSTED_DATA_BEGIN\n([\s\S]*)\nUNTRUSTED_DATA_END$/);
  return JSON.parse(envelope ? JSON.parse(envelope[1]) : content);
};
// Fail closed: accidental unstubbed provider requests cannot reach the internet.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'fixture.meta') {
    const body = JSON.parse(String(init?.body));
    const dev = body.messages[0].content as string;
    let out: unknown;
    if (dev.includes('ONE tool per turn')) {
      const brief = promptJson(body.messages[1].content);
      const read = brief.alreadyRead as string[];
      out = !read.includes('issue') ? { tool: 'read_issue', reason: 'Read issue' }
        : !read.includes('src/cart.ts') ? { tool: 'read_file', path: 'src/cart.ts', reason: 'Read implementation' }
        : { tool: 'assign_job', files: ['src/cart.ts', 'src/cart.test.ts'], reason: 'Scope ready', plan: 'Fix the cart total and add a regression test.', acceptance: ['Cart total is correct'] };
    } else if (dev.includes('Pick the files')) out = { files: ['src/cart.ts', 'src/cart.test.ts'] };
    else if (dev.includes('triage incoming')) out = { kind: 'bug', district: 'src', reason: 'Cart defect' };
    else if (dev.includes('game master')) {
      const brief = promptJson(body.messages[1].content);
      out = { order: brief.cards.map((c: { id: string }) => c.id), reason: 'Oldest first', picks: {} };
    } else if (dev.includes('"verdict"')) out = { verdict: 'pass', reason: 'Regression covers the fix', findings: [] };
    else throw new Error(`Unstubbed Meta prompt: ${dev.slice(0, 80)}`);
    return reply({ usage: { total_tokens: 64 }, choices: [{ message: { content: JSON.stringify(out) } }] });
  }
  if (url.hostname === 'github.com' && url.pathname === '/login/oauth/access_token') return reply({ access_token: 'fixture-user-token' });
  if (url.hostname !== 'api.github.com') throw new Error(`External fetch blocked: ${url.hostname}`);
  const p = url.pathname;
  if (p === '/user') return reply({ id: 123, login: 'fixture', name: 'Fixture Player' });
  if (p === '/user/installations') return reply({ installations: [{ id: 1, account: { login: 'fixture' } }] });
  if (p === '/user/installations/1/repositories') return reply({ repositories: [...knownRepos].map(full_name => ({ full_name, default_branch: 'main' })) });
  const collaborator = p.match(/\/collaborators\/fixture([1-5])?\/permission$/);
  if (collaborator) return reply({ permission: 'write', user: { id: 123 + Number(collaborator[1] ?? 0) } });
  if (p.endsWith('/access_tokens')) return reply({ token: `public-test-installation-${p.split('/')[3]}-token` });
  if (p.endsWith('/installation')) return reply({ id: installationId(p.split('/').slice(2, 4).join('/')) });
  if (p.includes('/git/trees/')) return reply({ sha: BASE, tree: files.map(f => ({ path: f.filename, type: 'blob', size: 100 })), truncated: false });
  if (p.includes('/git/ref/heads/')) return reply({ object: { sha: p.endsWith('/main') ? BASE : HEAD } });
  if (p.includes('/contents/')) return reply({ content: btoa('export const total = () => 0;'), encoding: 'base64' });
  if (p.includes('/compare/')) return reply({ status: 'ahead', ahead_by: 1, files });
  if (p.endsWith('/check-runs')) return reply({ total_count: 1, check_runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }] });
  if (p.endsWith('/status')) return reply({ total_count: 0, statuses: [] });
  if (p.endsWith('/files')) return reply(files);
  if (p.endsWith('/merge')) return reply({ merged: true, sha: HEAD, message: 'Fixture merge' });
  if (p.endsWith('/comments')) return reply(init?.method === 'POST' ? { id: 1 } : []);
  if (/\/issues\/1$/.test(p)) return reply({ number: 1, title: 'Fix cart total', body: 'Cart total is incorrect', state: 'open', user: { login: 'fixture' }, html_url: 'https://github.com/fixture/demo/issues/1' });
  if (p.endsWith('/pulls/99')) return reply({ number: 99, head: { sha: HEAD }, base: { sha: BASE }, merged: false, state: 'open' });
  if (p.endsWith('/pulls')) return init?.method === 'POST' ? reply({ number: 99, html_url: 'https://github.com/fixture/demo/pull/99' }) : reply([]);
  if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return reply({ default_branch: 'main' });
  throw new Error(`Unstubbed GitHub request: ${init?.method ?? 'GET'} ${p}`);
}) as typeof fetch;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname === '/__test/warm-load-grants') {
      // The load target is DO fan-out, not GitHub's upstream request queue. Model
      // already-warm provider permission grants; D1 membership/session checks still run.
      await Promise.all([...knownRepos].flatMap(repo => Array.from({ length: 5 }, (_, i) =>
        env.CACHE.put(`access:v2:${installationId(repo)}:${repo}:${124 + i}`, JSON.stringify({ expiresAt: Date.now() + 60000 }), { expirationTtl: 60 }))));
      return reply({ ok: true });
    }
    if (url.pathname === '/__test/access' || url.pathname === '/__test/session') {
      const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, 'preview')).replace('shiptorio_session=', 'shiptorio_access=');
      if (url.pathname === '/__test/access') return Response.json({ ok: true }, { headers: { 'set-cookie': preview } });
      const index = Number(url.searchParams.get('user') ?? 0);
      if (!Number.isInteger(index) || index < 0 || index > 5) return new Response('bad fixture user', { status: 400 });
      const user = { id: 123 + index, login: index ? `fixture${index}` : 'fixture' };
      await upsertUser(env, user);
      // Explicitly grant the load accounts enough factories; production quotas still execute.
      await env.DB.prepare('INSERT OR REPLACE INTO signup_allowlist (login, enabled, approved_by, factories, repos, runs_daily, updated_at) VALUES (?, 1, ?, 51, 51, 20, ?)').bind(user.login, 'test-fixture', Date.now()).run();
      await saveReach(env, user.id, { installations: [...new Set([...knownRepos].map(installationId))].map(id => ({ id, account: 'fixture' })), repos: [...knownRepos].map(repo => ({ repo, installationId: installationId(repo), defaultBranch: 'main' })) });
      if (index) await Promise.all([...knownRepos].map(repo => env.CACHE.put(`access:v2:${installationId(repo)}:${repo}:${user.id}`, JSON.stringify({ expiresAt: Date.now() + 60000 }), { expirationTtl: 60 })));
      const session = await createSession(env, user, 'load fixture');
      return reply({ cookie: `${session.split(';')[0]}; ${preview.split(';')[0]}` });
    }
    const match = url.pathname.match(/^\/__test\/([\w-]+)\/([\w-]+)\/(seed|tick|check)$/);
    if (match) {
      const repo = `${match[1]}/${match[2]}`;
      const f = env.FACTORY.get(env.FACTORY.idFromName(repo));
      if (req.method !== 'POST') return new Response('POST required', { status: 405 });
      if (match[3] === 'seed') {
        knownRepos.add(repo);
        const id = installationId(repo);
        await env.DB.prepare('INSERT OR IGNORE INTO installations (id, account_login) VALUES (?, ?)').bind(id, 'fixture').run();
        await env.DB.prepare('INSERT OR REPLACE INTO repos (full_name, installation_id, default_branch) VALUES (?, ?, ?)').bind(repo, id, 'main').run();
        await f.ensure(repo, id);
        if (url.searchParams.get('ore') !== '0') await f.ingestIssue({ number: 1, title: 'Fix cart total', body: 'Cart total is incorrect', labels: ['bug'], url: `https://github.com/${repo}/issues/1` });
      } else if (match[3] === 'check') await f.onCheckSuite([99], true, 'CI green', HEAD);
      else await (f as unknown as { testTick(): Promise<void> }).testTick();
      return reply({ ok: true });
    }
    // Miniflare overwrites CF-Connecting-IP. Only this non-production entry may emulate edge IPs.
    const ip = req.headers.get('x-fixture-client-ip');
    if (ip && /^192\.0\.2\.[1-5]$/.test(ip)) {
      const headers = new Headers(req.headers); headers.set('cf-connecting-ip', ip);
      req = new Request(req, { headers });
    }
    return app.fetch(req, { ...env, DEV_LOGIN: undefined }, ctx);
  },
};
