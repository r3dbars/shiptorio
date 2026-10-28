// Explicit staging-only entrypoint. Production config never imports this file.
import app, { Factory as ProductionFactory, type Env } from '../../server/src/index';
import { createSession, upsertUser, saveReach } from '../../server/src/accounts';
import { makeSessionCookie } from '../../server/src/session';
import { starterLine } from '../../server/src/engine';
import { saveFactoryState } from '../../server/src/state-storage';
import { browserSocketAuth, browserSocketEpoch } from '../../server/src/browser-socket';
import { repoAccess, requireUser } from '../../server/src/authorization';
import { byRepoId } from '../../server/src/repository';
const REPO = 'load-test/shiptorio-load-crowd';
const REPO_ID = 900000002, INSTALLATION = 900000001;
const USERS = Array.from({ length: 5 }, (_, i) => ({ id: 900000001 + i, login: `staging-load-${i}` }));
interface LoadEnv extends Env { LOAD_SETUP_TOKEN: string; LOAD_SETUP_UNTIL: string }
export class Factory extends ProductionFactory {
  async loadStatus(cookie: string) {
    const request = new Request('https://shiptorio.dev/api/repos/' + REPO + '/factory', { headers: { cookie, origin: 'https://shiptorio.dev' } });
    const user = await requireUser(request, this.env);
    return { epoch: await browserSocketEpoch(this.env), browserUser: !!await browserSocketAuth(request, this.env), user: !!user, read: !!user && !!await repoAccess(this.env, user, REPO), write: !!user && !!await repoAccess(this.env, user, REPO, 'write') };
  }
  async loadSeed() {
    if (this.env.PUBLIC_URL !== 'https://shiptorio.dev') throw new Error('Staging only');
    if (await this.ctx.storage.get('state')) return;
    const line = starterLine();
    line.machines.push({ id: 'load-probe-1', type: 'assembler', state: 'idle', x: 10000, y: 10000, tier: 1, district: '/' });
    await this.ctx.storage.put('meta', { repo: REPO, installationId: INSTALLATION });
    await this.ctx.storage.put('githubRepoId', REPO_ID);
    await saveFactoryState(this.ctx.storage, { repo: REPO, baseBranch: 'main', districts: [], ...line, items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: .5, tick: 0 });
  }
}
async function grants(env: LoadEnv) {
  await Promise.all(USERS.flatMap(user => ['read', 'write'].map(authority => env.CACHE.put(`access:v2:${authority === 'write' ? 'write:' : ''}${INSTALLATION}:${REPO}:${user.id}`, JSON.stringify({ expiresAt: Date.now() + 300000 }), { expirationTtl: 300 }))));
}
export default {
  async fetch(request: Request, env: LoadEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.hostname !== 'shiptorio.dev' || env.PUBLIC_URL !== 'https://shiptorio.dev') return new Response('Staging only', { status: 403 });
    if (!url.pathname.startsWith('/__load/')) return app.fetch(request, env, ctx);
    if (request.method !== 'POST' || !env.LOAD_SETUP_TOKEN || request.headers.get('authorization') !== `Bearer ${env.LOAD_SETUP_TOKEN}` || Date.now() > Number(env.LOAD_SETUP_UNTIL)) return new Response('Not found', { status: 404 });
    if (url.pathname === '/__load/diagnose') {
      const { cookie } = await request.json() as { cookie: string };
      return Response.json({ worker: { epoch: await browserSocketEpoch(env), browserUser: !!await browserSocketAuth(new Request('https://shiptorio.dev', { headers: { cookie } }), env) }, object: await (byRepoId(env, REPO_ID) as unknown as { loadStatus(cookie: string): Promise<unknown> }).loadStatus(cookie) });
    }
    if (url.pathname === '/__load/status') {
      const values = await Promise.all(USERS.flatMap(u => ['read', 'write'].map(a => env.CACHE.get<{ expiresAt: number }>(`access:v2:${a === 'write' ? 'write:' : ''}${INSTALLATION}:${REPO}:${u.id}`, 'json'))));
      return Response.json({ commit: env.BUILD_SHA, epoch: await browserSocketEpoch(env), grantsAlive: values.every(v => !!v && v.expiresAt > Date.now() + 60000) });
    }
    if (url.pathname === '/__load/grants') { await grants(env); return Response.json({ ok: true }); }
    if (url.pathname !== '/__load/seed') return new Response('Not found', { status: 404 });
    for (const user of USERS) {
      await upsertUser(env, user);
      await env.DB.prepare("INSERT OR REPLACE INTO signup_allowlist(login,enabled,approved_by,factories,repos,runs_daily,updated_at) VALUES (?,1,'staging-load',1,1,0,?)").bind(user.login, Date.now()).run();
      await saveReach(env, user.id, { installations: [{ id: INSTALLATION, account: 'staging-load' }], repos: [{ repo: REPO, installationId: INSTALLATION, defaultBranch: 'main' }] });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE repos SET repo_id=? WHERE full_name=?").bind(REPO_ID, REPO),
      env.DB.prepare("UPDATE installations SET permissions=?,status='active',account_type='User' WHERE id=?").bind(JSON.stringify({ contents: 'write', pull_requests: 'write', issues: 'write', checks: 'read', statuses: 'read', metadata: 'read' }), INSTALLATION),
    ]);
    await (byRepoId(env, REPO_ID) as unknown as { loadSeed(): Promise<void> }).loadSeed();
    await grants(env);
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, 'preview')).replace('shiptorio_session=', 'shiptorio_access=').split(';')[0];
    const identities = await Promise.all(USERS.map(async user => ({ repo: REPO, machineId: 'load-probe-1', cookie: `${(await createSession(env, user, 'staging load')).split(';')[0]}; ${preview}` })));
    return Response.json(Array.from({ length: 50 }, (_, i) => identities[i % identities.length]), { headers: { 'cache-control': 'no-store' } });
  },
};
