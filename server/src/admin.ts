import type { Hono } from 'hono';
import * as Sentry from '@sentry/cloudflare';
import type { Env } from './index';
import type { Factory } from './factory';
import { currentTrace, recentLogs, report } from './telemetry';
import { currentUser } from './accounts';

// Deliberately independent of ALLOWED_LOGINS: adding a player never grants diagnostics.
export const isAdmin = (login: string | null) => login?.toLowerCase() === 'r3dbars';
export function adminRoutes(app: Hono<any>, factory: (env: Env, repo: string) => DurableObjectStub<Factory>) {
  app.use('/admin/*', async (c, next) => {
    const user = await currentUser(c.env, c.req.header('cookie') ?? null, new URL(c.req.url));
    if (!isAdmin(user?.login ?? null)) return c.json({ error: 'admin login required' }, 403);
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });
  app.get('/admin', c => c.html(ADMIN_HTML));
  app.get('/admin/app.js', c => { c.header('Content-Type', 'application/javascript; charset=utf-8'); return c.body(ADMIN_JS); });
  app.get('/admin/data', async c => {
    const env = c.env as Env;
    const repos = await env.DB.prepare('SELECT full_name FROM repos ORDER BY full_name').all<{ full_name: string }>();
    const selected = c.req.query('repo');
    if (selected && !repos.results.some(r => r.full_name === selected)) return c.json({ error: 'unknown factory' }, 404);
    const [events, errors, spark, webhooks] = await Promise.all((['events', 'errors', 'spark', 'webhooks'] as const).map(group => recentLogs(env, group, selected)));
    return c.json({ release: env.BUILD_SHA, sentryConfigured: !!env.SHIPTORIO_SENTRY_DSN,
      repos: repos.results.map(r => r.full_name),
      snapshot: selected ? await factory(env, selected).debugSnapshot() : null,
      errors, events, spark, webhooks,
      note: 'Last 50 events per category and factory; KV may take up to 60 seconds to propagate. Retention: 7 days.' });
  });
  app.post('/admin/force-error', async c => {
    if (c.req.header('origin') !== new URL(c.req.url).origin) return c.json({ error: 'invalid origin' }, 403);
    if (!c.env.SHIPTORIO_SENTRY_DSN) return c.json({ error: 'SHIPTORIO_SENTRY_DSN is not configured' }, 503);
    const eventId = report(new Error('Shiptorio observability verification'), 'admin.forced_error');
    const flushed = await Sentry.flush(5000);
    return c.json({ eventId, requestId: currentTrace()?.requestId, flushed }, flushed ? 200 : 502);
  });
  // This DSN belongs to Shiptorio itself. It is a public ingestion key, never an auth token.
  app.get('/api/telemetry/config', async c => {
    const user = await currentUser(c.env, c.req.header('cookie') ?? null, new URL(c.req.url));
    return c.json({ dsn: c.env.SHIPTORIO_SENTRY_DSN ?? null, release: c.env.BUILD_SHA ?? 'development',
      userId: user?.login ?? null, requestId: currentTrace()?.requestId });
  });
}
const ADMIN_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Shiptorio diagnostics</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#1b2448;color:#eee;font:15px monospace;max-width:1100px;margin:32px auto;padding:16px}button,select{font:inherit;padding:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#111a30;padding:16px}section{margin:24px 0}</style></head>
<body><h1>Shiptorio diagnostics</h1><p><a href="/admin/flags">Feature flags</a> · <a href="/admin/signup">Signup and abuse</a></p><p id="status">Loading…</p><label>Factory <select id="repo"><option value="">All events</option></select></label> <button id="refresh">Refresh</button> <button id="force">Send verification error to Sentry</button><div id="content"></div>
<script type="module" src="/admin/app.js"></script></body></html>`;
const ADMIN_JS = `
const repo=document.querySelector('#repo'), status=document.querySelector('#status');
async function refresh(){try{const res=await fetch('/admin/data?repo='+encodeURIComponent(repo.value));if(!res.ok)throw Error('Request failed: '+res.status);const data=await res.json();if(repo.options.length===1)for(const name of data.repos){const option=document.createElement('option');option.value=option.textContent=name;repo.append(option)}status.textContent='Release '+data.release+' • Sentry '+(data.sentryConfigured?'configured':'not configured')+' • '+data.note;const content=document.querySelector('#content');content.replaceChildren();for(const [key,value] of Object.entries(data)){if(!['snapshot','errors','events','spark','webhooks'].includes(key))continue;const section=document.createElement('section'),h=document.createElement('h2'),pre=document.createElement('pre');h.textContent=key;pre.textContent=JSON.stringify(value,null,2);section.append(h,pre);content.append(section)}}catch(e){status.textContent=e.message}}
document.querySelector('#refresh').onclick=refresh;repo.onchange=refresh;
document.querySelector('#force').onclick=async()=>{const res=await fetch('/admin/force-error',{method:'POST'});status.textContent=JSON.stringify(await res.json());};refresh();
`;
