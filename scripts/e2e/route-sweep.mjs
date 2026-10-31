// Every route on shiptorio.dev, checked against what the Worker (server/src/index.ts, access.ts) promises.
//
//   node scripts/e2e/route-sweep.mjs https://shiptorio.dev   live, signed out, read-only: GET/HEAD plus POSTs the
//                                                             gate refuses before any work. No password, no sign-in.
//   node scripts/e2e/route-sweep.mjs                         local clone of the staging Worker served as
//                                                             https://shiptorio.dev (Miniflare, stub GitHub + Spark):
//                                                             signed out, with the password, signed in, bad input.
//
// Exits 1 if any row fails. Prints one line per route: PASS/FAIL, method, path, expected, got.
import { createHash, createHmac, generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const live = process.argv[2];
const origin = 'https://shiptorio.dev';
const rows = [];
const any = (...codes) => codes;

// Signed out on shiptorio.dev: tutorial + static art + docs are open; everything that touches an account is gated.
const SIGNED_OUT = [
  // the front door
  ['GET', '/', [302], { location: '/deck?source=live' }],
  ['GET', '/?source=sim&scenario=first-run', [302], { location: '/deck?source=sim&scenario=first-run' }],
  ['GET', '/?onboard=repo', [302]],
  ['GET', '/deck', [200], { type: 'text/html', cache: 'no-store' }],
  ['HEAD', '/deck', [200]],
  ['GET', '/deck/', [200, 301, 302, 307, 308]],
  ['GET', '/deck.html', [200, 307]],
  ['GET', '/deck?source=live', [200]],
  ['GET', '/deck?fresh=1', [200]],
  ['GET', '/judge', [200], { type: 'text/html' }],
  ['GET', '/privacy', [200]],
  ['GET', '/terms', [200]],
  ['GET', '/docs', [200, 301, 302, 307, 308]],
  ['GET', '/robots.txt', [200]],
  ['GET', '/sitemap.xml', [200]],
  ['GET', '/fonts/jetbrains-mono.woff2', [200]],
  ['GET', '/welcome/factory-poster.webp', [200]],
  ['GET', '/deck/traces/all-clear.json', [200]],
  ['GET', '/deck/px/launch/tower-0.png', [200]],
  ['GET', '/api/health', [200]],
  ['GET', '/api/version', [200]],
  ['GET', '/auth/login', [302], { locationStarts: 'https://github.com/login/oauth/authorize' }],
  ['GET', '/test/users?format=json', [200, 401, 404]],
  // gated: no password yet
  ['GET', '/api/me', [401]], ['GET', '/api/me/progress', [401]], ['PUT', '/api/me/prefs', any(401, 403)],
  ['GET', '/api/flags', [401]], ['GET', '/api/sources', [401]], ['GET', '/api/repos', [401]], ['GET', '/api/empire', [401]],
  ['GET', '/api/setup/status', [401]], ['GET', '/api/telemetry/config', [401]], ['GET', '/api/admin/budget', [401]], ['GET', '/api/admin/flags', [401]],
  ['GET', '/api/account/export', [401]], ['POST', '/api/account/signout', any(401, 403)], ['POST', '/api/account/delete', any(401, 403)],
  ['GET', '/api/repos/r3dbars/testing/factory', [401]], ['GET', '/api/repos/r3dbars/testing/limits', [401]],
  ['GET', '/api/repos/r3dbars/testing/spend', [401]], ['GET', '/api/repos/r3dbars/testing/export', [401]],
  ['GET', '/api/repos/r3dbars/testing/issues', [401]], ['GET', '/api/repos/r3dbars/testing/starter-issue', [401]],
  ['GET', '/api/repos/r3dbars/testing/runner/status', [401]], ['GET', '/api/repos/r3dbars/testing/runner/jobs', [401]],
  ['POST', '/api/repos/r3dbars/testing/issues/1/start', any(401, 403)], ['POST', '/api/repos/r3dbars/testing/review/retry', any(401, 403)],
  ['POST', '/api/repos/r3dbars/testing/runner/join', any(401, 403)], ['POST', '/api/repos/r3dbars/testing/starter-issue', any(401, 403)],
  ['POST', '/api/runner/r3dbars/testing/claim', [401]], ['POST', '/api/runner/r3dbars/testing/heartbeat', [401]],
  ['GET', '/api/runner/r3dbars/testing/claim', [401]],
  ['GET', '/auth/callback?code=x&state=y', [401]], ['POST', '/auth/logout', any(401, 403)], ['GET', '/auth/logout', [401]],
  ['GET', '/github/installed', [401]], ['GET', '/settings', [401]], ['GET', '/setup', [401]], ['GET', '/setup/callback', [401]],
  ['GET', '/waitlist', [401]], ['GET', '/connect/sentry?repo=r3dbars/testing', [401]], ['GET', '/connect/support', [401]],
  ['GET', '/runner/pair', [401]], ['GET', '/admin', [401]], ['GET', '/admin/signup', [401]], ['GET', '/admin/god/state', [401]],
  ['GET', '/admin/flags', [401]], ['GET', '/admin/taps', [401]], ['GET', '/admin/app.js', [401]],
  ['GET', '/test/login?as=test-newbie', any(401, 404)], ['GET', '/test/reset', any(401, 404)],
  ['GET', '/index.html', [401]], ['GET', '/sw.js', [401]], ['GET', '/art/prototype', [401]], ['GET', '/art/spark.html', [401]],
  // bad input and 404s never leak past the gate
  ['GET', '/nope', [401]], ['GET', '/api/nope', [401]], ['POST', '/deck', any(401, 403)],
  ['GET', '/deck/art/../index.html', [401]], ['GET', '/deck/art/x.js', [401]], ['GET', '/deck/traces/x.json.map', [401]],
  ['GET', '/deck/secret.html', [401]], ['GET', '/%2e%2e/etc/passwd', [401, 400, 404]],
  ['GET', '/api/repos/..%2F..%2Fx/y/factory', [401, 400, 404]], ['GET', '/' + 'a'.repeat(5000), any(401, 404, 414)],
  // webhooks are open to the internet but must refuse unsigned bodies
  ['POST', '/webhooks/github', any(400, 401, 403), { body: '{}' }],
  ['POST', '/webhooks/sentry', any(400, 401, 403, 404), { body: '{}' }],
  ['POST', '/webhooks/intercom/r3dbars/testing', any(400, 401, 403, 404), { body: '{}' }],
  ['POST', '/webhooks/support/r3dbars/testing/' + '0'.repeat(40), any(400, 401, 403, 404), { body: '{}' }],
];

async function check(fetchFn, [method, path, codes, opts = {}], label, headers = {}) {
  let res, error;
  const init = { method, redirect: 'manual', headers: { ...headers, ...(opts.body ? { 'content-type': 'application/json' } : {}) } };
  if (opts.body) init.body = opts.body;
  try { res = await fetchFn(origin + path, init); } catch (e) { error = e.message; }
  const got = res?.status ?? 0;
  const problems = [];
  if (error) problems.push(error);
  else if (!codes.includes(got)) problems.push(`status ${got}`);
  const loc = res?.headers.get('location') ?? '';
  if (res && opts.location && loc !== opts.location) problems.push(`location ${loc}`);
  if (res && opts.locationStarts && !loc.startsWith(opts.locationStarts)) problems.push(`location ${loc.slice(0, 60)}`);
  if (res && opts.type && !(res.headers.get('content-type') ?? '').includes(opts.type)) problems.push(`type ${res.headers.get('content-type')}`);
  if (res && opts.cache && res.headers.get('cache-control') !== opts.cache) problems.push(`cache ${res.headers.get('cache-control')}`);
  if (res && opts.json) { try { const b = await res.clone().json(); const why = opts.json(b); if (why) problems.push(why); } catch { problems.push('not json'); } }
  // Every response carries the security headers.
  if (res && got !== 0 && !res.headers.get('x-content-type-options')) problems.push('no nosniff');
  await res?.body?.cancel?.().catch(() => {});
  const row = { label, method, path: path.length > 70 ? path.slice(0, 67) + '...' : path, expected: codes.join('/'), got, pass: !problems.length, note: problems.join('; ') };
  rows.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${label.padEnd(10)} ${method.padEnd(4)} ${row.path.padEnd(52)} want ${row.expected.padEnd(12)} got ${got}${row.note ? '  ' + row.note : ''}`);
  return res;
}

if (live) {
  if (new URL(live).origin !== origin) throw new Error('live sweep is for https://shiptorio.dev only');
  for (const route of SIGNED_OUT) await check(fetch, route, 'signed-out');
} else {
  await local();
}
const failed = rows.filter(r => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} pass`);
if (process.env.ROUTE_SWEEP_JSON) writeFileSync(process.env.ROUTE_SWEEP_JSON, JSON.stringify(rows, null, 2));
process.exit(failed.length ? 1 : 0);

async function local() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const server = join(root, 'server');
  const require = createRequire(join(server, 'package.json'));
  const wrangler = require('wrangler');
  const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler'))('miniflare');
  const { githubStub } = await import(join(root, 'playtest/stranger/github-stub.mjs'));
  const { sparkStub } = await import(join(root, 'playtest/stranger/spark-stub.mjs'));
  const bundle = mkdtempSync(join(tmpdir(), 'route-sweep-'));
  execFileSync('npx', ['wrangler', 'deploy', '--dry-run', '--env', 'staging', '--outdir', bundle], { cwd: server, stdio: 'ignore' });
  const { workerOptions } = wrangler.unstable_getMiniflareWorkerOptions(join(server, 'wrangler.jsonc'), 'staging');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const secret = 'route-sweep-webhook', password = 'route-sweep-preview';
  let mf;
  const stub = githubStub({ origin, webhookSecret: secret, worker: (u, i) => mf.dispatchFetch(u, i), user: { id: 6161001, login: 'sweep-player', name: 'Sweep', avatar_url: null }, repo: 'sweep-player/workshop', repoId: 6161999 });
  stub.state.installation = 99101;
  const spark = sparkStub();
  const { compatibilityDate, compatibilityFlags, kvNamespaces, d1Databases, durableObjects, assets } = workerOptions;
  const { TEST_FACTORY: _skip, ...bindings } = workerOptions.bindings ?? {};
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
    compatibilityDate, compatibilityFlags, kvNamespaces, d1Databases, durableObjects, assets,
    name: 'shiptorio', rootPath: bundle, modules: true, scriptPath: join(bundle, 'index.js'),
    bindings: { ...bindings, PUBLIC_URL: origin, ALLOWED_LOGINS: stub.state.user.login, ADMIN_LOGINS: 'r3dbars', SESSION_SECRET: 'route-sweep-session-0123456789abcdef', APP_PASSWORD: password,
      META_API_KEY: 'stub-meta-key', GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_CLIENT_ID: 'Iv1.stub', GITHUB_CLIENT_SECRET: 'stub-client-secret', GITHUB_WEBHOOK_SECRET: secret, GITHUB_APP_SLUG: 'shiptorio-stub' },
    outboundService: async request => new URL(request.url).host === 'api.meta.ai' ? spark.outbound(request) : stub.outbound(request),
  }] }));
  await mf.ready;
  try {
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync(join(server, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
      const sql = wrangler.unstable_splitSqlQuery(readFileSync(join(server, 'migrations', file), 'utf8')).filter(s => s.trim());
      await db.batch(sql.map(s => db.prepare(s)));
    }
    const go = (url, init) => mf.dispatchFetch(url, init);
    const hook = (event, body) => go(origin + '/webhooks/github', { method: 'POST', headers: { 'content-type': 'application/json', 'x-github-event': event, 'x-github-delivery': `sweep-${event}-${Date.now()}`, 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(body).digest('hex') }, body });

    // 1) signed out, exactly what the live sweep checks, plus zero Spark calls.
    for (const route of SIGNED_OUT) await check(go, route, 'signed-out');
    const sparkAfterGuest = spark.calls.length;
    rows.push({ label: 'signed-out', method: '-', path: 'Spark calls after the whole signed-out sweep', expected: '0', got: sparkAfterGuest, pass: sparkAfterGuest === 0, note: '' });
    console.log(`${sparkAfterGuest === 0 ? 'PASS' : 'FAIL'}  signed-out zero Spark calls (got ${sparkAfterGuest})`);

    // 2) the password: wrong one refused, cross-site refused, right one sets the access cookie.
    const form = (pw, extra = {}) => ({ method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin, ...extra }, body: `password=${encodeURIComponent(pw)}&next=%2Fdeck` });
    const wrong = await go(origin + '/access', form('nope'));
    record('password', 'POST', '/access (wrong password)', [401], wrong.status);
    const cross = await go(origin + '/access', form(password, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }));
    record('password', 'POST', '/access (cross-site, right password)', [403], cross.status);
    const right = await go(origin + '/access', form(password));
    record('password', 'POST', '/access (right password)', [303], right.status);
    const access = right.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    record('password', '-', 'access cookie is HttpOnly + Secure', ['yes'], /HttpOnly/i.test(right.headers.get('set-cookie')) && /Secure/i.test(right.headers.get('set-cookie')) ? 'yes' : 'no');
    const pw = { cookie: access };
    for (const route of [
      // With the password but no GitHub you're a guest: a save slot, never an account.
      ['GET', '/api/me', [200, 401], { json: b => b.login ? 'signed in as ' + b.login : null }],
      ['GET', '/index.html', [200, 307]], ['GET', '/settings', [401, 302]], ['GET', '/api/repos', [401]],
      ['GET', '/admin', [401, 403]], ['GET', '/nope', [200, 404]], ['GET', '/api/nope', [401, 404]],
      ['GET', '/test/users?format=json', [200]],
      ['GET', '/api/repos/sweep-player/workshop/factory', [401, 403]],
    ]) await check(go, route, 'password', pw);
    record('password', '-', 'Spark calls with password, no GitHub', ['0'], String(spark.calls.length - sparkAfterGuest));

    // 3) GitHub sign-in (stub GitHub), then the account routes.
    await hook('installation', JSON.stringify({ action: 'created', installation: { id: stub.state.installation, account: { id: stub.state.user.id, login: stub.state.user.login, type: 'User' } }, repositories: [{ id: stub.state.repoId, full_name: stub.state.repo }], sender: stub.state.user }));
    const login = await go(origin + '/auth/login?next=%2Fdeck', { redirect: 'manual', headers: pw });
    const authorize = new URL(login.headers.get('location'));
    const loginCookies = login.headers.getSetCookie().map(c => c.split(';')[0]);
    const cb = await go(`${origin}/auth/callback?code=stub-code&state=${authorize.searchParams.get('state')}`, { redirect: 'manual', headers: { cookie: [access, ...loginCookies].join('; ') } });
    record('sign-in', 'GET', '/auth/callback (stub GitHub)', [302, 303], cb.status);
    const forged = await go(`${origin}/auth/callback?code=stub-code&state=forged`, { redirect: 'manual', headers: { cookie: [access, ...loginCookies].join('; ') } });
    record('sign-in', 'GET', '/auth/callback (forged state)', [400, 401, 403, 302], forged.status, forged.status === 302 && /session/.test(forged.headers.get('set-cookie') ?? '') ? 'issued a session!' : '');
    const session = cb.headers.getSetCookie().map(c => c.split(';')[0]);
    const me = { cookie: [access, ...session].join('; '), origin };
    const repo = stub.state.repo;
    for (const route of [
      ['GET', '/api/me', [200], { json: b => b.login === 'sweep-player' || b.user?.login === 'sweep-player' ? null : 'wrong user ' + JSON.stringify(b).slice(0, 80) }],
      ['GET', '/api/me/progress', [200]], ['PUT', '/api/me/prefs', [400], { body: '{}' }], ['PUT', '/api/me/prefs', [400], { body: 'not json' }],
      ['GET', '/api/version', [200]], ['GET', '/api/flags', [200]], ['GET', '/api/repos', [200, 503]], ['GET', '/api/repos', [200]], ['GET', '/api/empire', [200]],
      ['GET', `/api/sources?repo=${repo}`, [200]], ['GET', `/api/setup/status?repo=${repo}`, [200]], ['GET', '/api/telemetry/config', [200, 404]],
      ['GET', '/api/account/export', [200]], ['GET', '/settings', [200]],
      ['GET', `/api/repos/${repo}/limits`, [200]], ['GET', `/api/repos/${repo}/spend`, [200]],
      ['GET', `/api/repos/${repo}/issues`, [200]], ['GET', `/api/repos/${repo}/starter-issue`, [200, 204]],
      ['GET', `/api/repos/${repo}/runner/status`, [200]], ['GET', `/api/repos/${repo}/runner/jobs`, [200]],
      ['GET', `/api/repos/${repo}/export`, [200, 404]],
      ['GET', `/connect/sentry?repo=${repo}`, [200]],
      ['GET', '/runner/pair', [400]], ['GET', '/runner/pair?code=XXXX-XXXX-XXXX', [200, 400, 404]],
      // admin stays admin-only for a normal player
      ['GET', '/admin', [403, 401]], ['GET', '/admin/god/state', [403, 401]], ['GET', '/api/admin/budget', [403, 401]], ['GET', '/admin/flags', [403, 401]],
      ['GET', '/admin/signup', [403, 401, 404]], ['GET', '/admin/taps', [403, 401]],
      // someone else's repo
      ['GET', '/api/repos/r3dbars/testing/limits', [403]], ['GET', '/api/repos/r3dbars/testing/issues', [403]],
      ['POST', '/api/repos/r3dbars/testing/issues/1/start', [403], { body: '{}' }],
      ['GET', '/api/repos/r3dbars/testing/factory', [403]],
      // bad input
      ['GET', '/api/repos/bad repo/x/limits', [400, 403, 404]], ['GET', '/api/repos/../x/limits', [400, 403, 404]],
      ['POST', `/api/repos/${repo}/issues/notanumber/start`, [400, 404], { body: '{}' }],
      
      ['POST', '/api/runner-device/poll', [400], { body: 'not json' }], ['POST', '/api/runner-device/poll', [400], { body: '{"code":"x"}' }],
      ['POST', '/api/runner-device/join', [410], { body: '{"join":"nope"}' }],
      ['PUT', '/api/me/progress', [400, 413, 422], { body: 'x'.repeat(200000) }],
      ['GET', '/api/nope', [404]], ['GET', '/nope', [200, 404]],
    ]) await check(go, route, 'signed-in', me);
    await check(go, ['POST', `/api/repos/${repo}/issues/2/start`, [202], { body: '{}' }], 'plan', me);
    await check(go, ['POST', `/api/repos/${repo}/issues/2/start`, [409], { body: '{}', json: b => /broke/i.test(b.error) ? 'generic error' : null }], 'plan', me);
    // An issue closed (or gone) on GitHub while its card was up: a plain 409, not "Something broke".
    await check(go, ['POST', `/api/repos/${repo}/issues/999/start`, [409], { body: '{}', json: b => /broke/i.test(b.error) ? 'generic error' : null }], 'plan', me);
    // Cross-site write with a valid session is refused.
    await check(go, ['POST', `/api/repos/${repo}/review/retry`, [403], { body: '{}' }], 'csrf', { cookie: me.cookie, origin: 'https://evil.example' });
    await check(go, ['GET', `/api/repos/${repo}/factory`, [403]], 'csrf', { cookie: me.cookie, origin: 'https://evil.example' });
    // Signing out kills the session.
    await check(go, ['POST', '/api/account/signout', [200, 204, 302, 303]], 'sign-out', me);
    await check(go, ['GET', '/api/me', [200, 401], { json: b => b.login ? 'still signed in as ' + b.login : null }], 'sign-out', me);
    await check(go, ['GET', `/api/repos/${repo}/limits`, [401]], 'sign-out', me);
    // The stub GitHub doesn't serve the background branch/comment scans; anything else leaving it is a finding.
    const strays = stub.state.unexpected.filter(u => !/\/(branches|issues\/comments)\?/.test(u));
    record('signed-in', '-', 'GitHub calls the stub did not expect', ['0'], String(strays.length), strays.slice(0, 2).join(', '));
  } finally { await mf.dispose(); }
}

function record(label, method, path, expected, got, note = '') {
  const pass = expected.map(String).includes(String(got)) && !note;
  rows.push({ label, method, path, expected: expected.join('/'), got, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(10)} ${method.padEnd(4)} ${path.padEnd(52)} want ${expected.join('/').padEnd(12)} got ${got}${note ? '  ' + note : ''}`);
}
