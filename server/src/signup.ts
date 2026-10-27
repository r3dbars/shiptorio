import { configuredAdmin } from "./admin-policy";
import { currentUser } from './accounts';
import type { Env } from './index';
import { isAllowed } from './session';
import { isLocal } from './auth';
import { isPublicDocs } from './access';
import { ironShell } from './iron-page';

export interface SignupEnv {
  SIGNUP_GATE_MODE?: string; // waitlist opts in after Turnstile setup; default/password = rollback
  ADMIN_LOGINS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}
export const signupMode = (env: SignupEnv) => env.SIGNUP_GATE_MODE === 'waitlist' ? 'waitlist' : 'password';
export const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const githubLogin = (s: string) => /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(s);
export const isAdmin = configuredAdmin;
// Only explicitly configured owner/admin identities get quota exemptions, never a wildcard.
export const isQuotaOwner = configuredAdmin;
export async function signupAllowed(env: {DB:D1Database;ALLOWED_LOGINS?:string}, login: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT enabled FROM signup_allowlist WHERE login = ?').bind(login.toLowerCase()).first<{enabled: number}>();
  return row ? row.enabled === 1 : env.ALLOWED_LOGINS !== "*" && isAllowed(env.ALLOWED_LOGINS || "", login);
}
export async function addPending(env: Env, identity: string, kind: 'email' | 'github') {
  const now = Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO signup_waitlist(identity,kind,created_at,updated_at) VALUES (?,?,?,?)').bind(identity.toLowerCase(),kind,now,now).run();
}
export async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
// Atomic D1 counter: shared across isolates, bounded by time window, no KV races.
export async function admit(env: Env, scope: string, cap: number, windowMs: number, reason: string, now = Date.now()): Promise<boolean> {
  const bucket = Math.floor(now/windowMs);
  const result = await env.DB.prepare(`INSERT INTO signup_counters(scope,bucket,count,expires_at) SELECT ?,?,1,? WHERE ? > 0
    ON CONFLICT(scope,bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`)
    .bind(scope,bucket,(bucket+2)*windowMs,cap,cap).first();
  if (result) return true;
  await env.DB.prepare(`INSERT INTO signup_abuse(scope,reason,updated_at) VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET hits=hits+1,reason=excluded.reason,updated_at=excluded.updated_at`).bind(scope,reason,now).run();
  return false;
}
export async function ipScope(request: Request, prefix: string) {
  return `${prefix}:${await hash(request.headers.get('cf-connecting-ip') || 'unknown')}`;
}
export async function turnstile(request: Request, env: Env, form: URLSearchParams, action: string): Promise<boolean> {
  if (env.DEV_LOGIN && isLocal(new URL(request.url))) return true;
  const token = form.get('cf-turnstile-response');
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY || !token || token.length > 2048) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get('cf-connecting-ip') || undefined})});
    const data = await response.json() as {success?:boolean;hostname?:string;action?:string};
    return response.ok && data.success === true && data.hostname === new URL(request.url).hostname && data.action === action;
  } catch { return false; }
}
const headers = {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
export function signupPage(env: Env, message = '', status = 200): Response {
  const widget = (action:string) => `<div class="cf-turnstile" data-sitekey="${escape(env.TURNSTILE_SITE_KEY || '')}" data-action="${action}" data-theme="dark"></div>`;
  const body = `<p class="eyebrow">Private preview</p><h1>Join the factory</h1><p>The factory must grow. Join the private preview.</p><p class="status" role="status">${escape(message)}</p><form method="post" action="/waitlist"><label for="w-email">Email</label><input id="w-email" type="email" name="email" maxlength="254" required autocomplete="email">${widget('waitlist')}<button>Join the waitlist</button></form><hr><form method="post" action="/auth/login"><label for="w-invite">Invite code (optional)</label><input id="w-invite" name="invite" maxlength="100" autocomplete="off">${widget('signin')}<button class="alt">Continue with GitHub</button></form><p class="note">GitHub sign-in joins the waitlist. Justin approves access.</p>`;
  return new Response(ironShell('Join Shiptorio', body, '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'),{status,headers});
}
export async function signupGate(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (env.DEV_LOGIN && isLocal(new URL(request.url))) return null;
  if (['/api/version','/api/health'].includes(path) && ['GET','HEAD'].includes(request.method)) return null;
  if (path === '/admin' || path.startsWith('/admin/')) return null;
  if (isPublicDocs(path)) return null; // the docs site is public in every gate mode
  if (['/waitlist','/auth/login','/auth/callback','/auth/logout','/webhooks/github','/webhooks/sentry'].includes(path) || path.startsWith('/webhooks/sentry/')) return null;
  const login = (await currentUser(env,request.headers.get('cookie'),new URL(request.url),Date.now(),true))?.login || null;
  if (login && await signupAllowed(env,login)) return null;
  if (path.startsWith('/api/') || request.headers.get('upgrade')) return Response.json({error:login ? 'approval pending' : 'login required'},{status:login ? 403 : 401});
  return signupPage(env,login ? 'Your request is pending approval. Come back after Justin approves your GitHub account.' : '');
}
export async function redeemInvite(env: Env, code: string, login: string): Promise<boolean> {
  if (!code || code.length > 100) return false;
  const digest = await hash(code), now = Date.now();
  // Claim + grant share a D1 transaction. Only this claimant can grant access.
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE signup_invites SET redeemed_by=?,redeemed_at=? WHERE digest=? AND redeemed_by IS NULL AND expires_at>?').bind(login.toLowerCase(),now,digest,now),
    env.DB.prepare(`INSERT INTO signup_allowlist(login,approved_by,updated_at) SELECT ?,created_by,? FROM signup_invites WHERE digest=? AND redeemed_by=? AND redeemed_at=? ON CONFLICT(login) DO UPDATE SET enabled=1,approved_by=excluded.approved_by,updated_at=excluded.updated_at WHERE signup_allowlist.enabled != 0`).bind(login.toLowerCase(),now,digest,login.toLowerCase(),now),
  ]);
  return results[0].meta.changes === 1 && results[1].meta.changes === 1;
}
export async function resourceQuota(env: Env, login: string, kind: 'factory'|'repo', resource: string): Promise<boolean> {
  if (isQuotaOwner(env, login)) {
    // Still record ownership: run attribution, telemetry and account cleanup depend on this ledger.
    await env.DB.prepare('INSERT OR IGNORE INTO signup_resources(login,kind,resource) VALUES (?,?,?)').bind(login.toLowerCase(),kind,resource.toLowerCase()).run();
    return true;
  }
  const caps = await env.DB.prepare('SELECT factories,repos FROM signup_allowlist WHERE login=?').bind(login.toLowerCase()).first<{factories:number;repos:number}>();
  const cap = kind === 'factory' ? caps?.factories ?? 3 : caps?.repos ?? 3;
  const row = await env.DB.prepare(`INSERT OR IGNORE INTO signup_resources(login,kind,resource) SELECT ?,?,? WHERE
    (SELECT COUNT(*) FROM signup_resources WHERE login=? AND kind=?) < ? RETURNING resource`).bind(login.toLowerCase(),kind,resource.toLowerCase(),login.toLowerCase(),kind,cap).first();
  if (row) return true;
  return !!await env.DB.prepare('SELECT resource FROM signup_resources WHERE login=? AND kind=? AND resource=?').bind(login.toLowerCase(),kind,resource.toLowerCase()).first();
}
export async function runQuotaStatus(env: Pick<Env, 'DB' | 'ADMIN_LOGINS'>, login: string, now = Date.now()) {
  const row = await env.DB.prepare('SELECT runs_daily FROM signup_allowlist WHERE login=?').bind(login.toLowerCase()).first<{runs_daily:number}>();
  const used = await env.DB.prepare('SELECT count FROM signup_counters WHERE scope=? AND bucket=?')
    .bind(`runs:${login.toLowerCase()}`, Math.floor(now / 86400000)).first<{count:number}>();
  return { used: used?.count ?? 0, limit: isQuotaOwner(env, login) ? Math.max(200, row?.runs_daily ?? 0) : row?.runs_daily ?? 20, resetsAt: (Math.floor(now / 86400000) + 1) * 86400000 };
}
export async function runQuota(env: Env, login: string): Promise<boolean> {
  if (!await signupAllowed(env,login)) return false;
  const { limit } = await runQuotaStatus(env, login);
  return admit(env,`runs:${login.toLowerCase()}`,limit,86400000,'daily run quota');
}

export async function adminSignup(request: Request, env: Env): Promise<Response> {
  const login = (await currentUser(env,request.headers.get('cookie'),new URL(request.url)))?.login || null;
  if (!login || !isAdmin(env,login) || !await signupAllowed(env,login)) return new Response('Admin only',{status:403});
  // Bounded retention work on admin visits rather than a sweep on every public request.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM signup_counters WHERE rowid IN (SELECT rowid FROM signup_counters WHERE expires_at < ? LIMIT 100)').bind(Date.now()),
    env.DB.prepare('DELETE FROM signup_abuse WHERE scope IN (SELECT scope FROM signup_abuse WHERE updated_at < ? LIMIT 100)').bind(Date.now()-30*86400000),
    env.DB.prepare('DELETE FROM signup_invites WHERE digest IN (SELECT digest FROM signup_invites WHERE expires_at < ? LIMIT 100)').bind(Date.now()),
  ]);
  let message = '';
  const selectedLogin = new URL(request.url).searchParams.get('login')?.toLowerCase() ?? '';
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Invalid origin',{status:403});
    const raw = await request.text();
    if (raw.length > 4096) return new Response('Too large',{status:413});
    const form = new URLSearchParams(raw), action = form.get('action'), identity = (form.get('identity') || '').toLowerCase().trim(), target = (form.get('login') || identity).toLowerCase().trim();
    if (action === 'invite') {
      const code = crypto.randomUUID()+crypto.randomUUID();
      await env.DB.prepare('INSERT INTO signup_invites(digest,expires_at,created_by) VALUES (?,?,?)').bind(await hash(code),Date.now()+7*86400000,login).run();
      message = `One-use invite (expires in 7 days; copy now): ${code}`;
    } else if (['approve','deny','limits'].includes(action || '') && githubLogin(target)) {
      const count = (field:string,fallback:number) => /^\d{1,5}$/.test(form.get(field) || '') ? Number(form.get(field)) : fallback;
      const sparkCount = (field: string) => !form.has(field) || !form.get(field)?.trim() ? null : /^\d{1,9}$/.test(form.get(field)!) ? Number(form.get(field)) : NaN;
      const calls = sparkCount('spark_calls'), tokens = sparkCount('spark_tokens');
      if (Number.isNaN(calls) || Number.isNaN(tokens)) return new Response('Invalid Spark quota',{status:400});
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO signup_allowlist(login,enabled,approved_by,updated_at,factories,repos,runs_daily) VALUES (?,?,?,?,?,?,?) ON CONFLICT(login) DO UPDATE SET enabled=excluded.enabled,approved_by=excluded.approved_by,updated_at=excluded.updated_at,factories=excluded.factories,repos=excluded.repos,runs_daily=excluded.runs_daily`).bind(target,action==='deny'?0:1,login,Date.now(),count('factories',3),count('repos',3),count('runs',20)),
        env.DB.prepare('UPDATE signup_waitlist SET status=?,updated_at=? WHERE identity=?').bind(action==='deny'?'denied':'approved',Date.now(),identity),
        ...(form.has('spark_calls') && form.has('spark_tokens') ? [env.DB.prepare('UPDATE signup_allowlist SET spark_calls_daily=?,spark_tokens_daily=? WHERE login=?').bind(calls,tokens,target)] : []),
      ]);
      message = `${target}: ${action==='deny'?'access revoked':'access approved'}`;
    } else return new Response('Choose a valid GitHub login',{status:400});
  }
  const [waitlist,allowlist,abuse] = await Promise.all([
    env.DB.prepare('SELECT * FROM signup_waitlist ORDER BY created_at DESC LIMIT 200').all<Record<string,unknown>>(),
    env.DB.prepare('SELECT * FROM signup_allowlist ORDER BY login LIMIT 200').all<Record<string,unknown>>(),
    env.DB.prepare('SELECT * FROM signup_abuse ORDER BY updated_at DESC LIMIT 100').all<Record<string,unknown>>(),
  ]);
  const selected = allowlist.results.find(r => r.login === selectedLogin);
  const rows = waitlist.results.map(row=>`<li>${escape(String(row.identity))} (${escape(String(row.kind))}, ${escape(String(row.status))})<form method="post"><input type="hidden" name="identity" value="${escape(String(row.identity))}"><input name="login" aria-label="Verified GitHub login" placeholder="Verified GitHub login" value="${row.kind==='github'?escape(String(row.identity)):''}" required><button name="action" value="approve">Approve</button><button name="action" value="deny">Deny / revoke</button></form></li>`).join('');
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shiptorio admin — access</title><h1>Signup and abuse</h1><p>${escape(message)}</p><a href="/admin">Admin</a><p>Email approval requires Justin to verify the GitHub identity first.</p><h2>Waitlist</h2><ul>${rows}</ul><h2>Allowlist and quotas</h2><pre>${escape(JSON.stringify(allowlist.results,null,2))}</pre><form method="post"><input name="login" placeholder="GitHub login" value="${escape(selectedLogin)}" required><label>Factories<input name="factories" type="number" min="0" max="99999" value="${selected?.factories ?? 3}"></label><label>Repos<input name="repos" type="number" min="0" max="99999" value="${selected?.repos ?? 3}"></label><label>Runs/day (UTC)<input name="runs" type="number" min="0" max="99999" value="${selected?.runs_daily ?? 20}"></label><label>Spark calls/day (UTC; blank = Worker default)<input name="spark_calls" type="number" min="0" max="999999999" value="${selected?.spark_calls_daily ?? ''}"></label><label>Spark tokens/day (UTC; blank = Worker default)<input name="spark_tokens" type="number" min="0" max="999999999" value="${selected?.spark_tokens_daily ?? ''}"></label><button name="action" value="limits">Save access and quotas</button><button name="action" value="deny">Revoke</button></form><form method="post"><button name="action" value="invite">Create one-use invite</button></form><h2>Abuse flags</h2><pre>${escape(JSON.stringify(abuse.results,null,2))}</pre>`,{headers});
}
