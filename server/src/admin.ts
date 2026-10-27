import { GOD_FORM, GOD_JS, GOD_PAGE } from "./admin-god-page";
import { configuredAdmin } from "./admin-policy";
import { spendReport } from "./spend";
import { budgetReport } from "./budget";
import type { Hono } from 'hono';
import * as Sentry from '@sentry/cloudflare';
import type { Env } from './index';
import type { Factory } from './factory';
import { currentTrace, recentLogs, report } from './telemetry';
import { currentUser } from './accounts';
import { ironPage } from './ironPage';

// Deliberately independent of ALLOWED_LOGINS: adding a player never grants diagnostics.
export const isAdmin = configuredAdmin;
export function adminRoutes(app: Hono<any>, factory: (env: Env, repo: string) => DurableObjectStub<Factory> | Promise<DurableObjectStub<Factory>>) {
  app.use('/admin/*', async (c, next) => {
    const user = await currentUser(c.env, c.req.header('cookie') ?? null, new URL(c.req.url));
    if (!isAdmin(c.env, user?.login ?? null)) return c.json({ error: 'admin login required' }, 403);
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });
  app.get('/admin', async c => c.req.query('format') === 'json' ? c.json({ ...await budgetReport(c.env), spend: await spendReport(c.env.DB) }) : c.html(ADMIN_HTML));
  app.get('/admin/god-panel', c=>c.html(GOD_PAGE));
  app.get('/admin/god.js', c=>{c.header('Content-Type','application/javascript; charset=utf-8');return c.body(GOD_JS)});
  app.get('/admin/app.js', c => { c.header('Content-Type', 'application/javascript; charset=utf-8'); return c.body(ADMIN_JS); });
  app.get('/admin/data', async c => {
    const env = c.env as Env;
    const repos = await env.DB.prepare('SELECT full_name FROM repos ORDER BY full_name').all<{ full_name: string }>();
    const selected = c.req.query('repo');
    if (selected && !repos.results.some(r => r.full_name === selected)) return c.json({ error: 'unknown factory' }, 404);
    const [events, errors, spark, webhooks] = await Promise.all((['events', 'errors', 'spark', 'webhooks'] as const).map(group => recentLogs(env, group, selected)));
    return c.json({ release: env.BUILD_SHA, sentryConfigured: !!env.SHIPTORIO_SENTRY_DSN,
      repos: repos.results.map(r => r.full_name),
      snapshot: selected ? await (await factory(env, selected)).debugSnapshot() : null,
      errors, events, spark, webhooks, budget: await budgetReport(env), spend: await spendReport(env.DB),

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
const ADMIN_HTML = ironPage({ title: 'Diagnostics', eyebrow: 'Internal · diagnostics', wide: true, home: '/admin',
  head: '<script type="module" src="/admin/app.js"></script><script type="module" src="/admin/god.js"></script>',
  body: `<h1>Shiptorio diagnostics</h1><p><a href="/admin/flags">Feature flags</a> · <a href="/admin/signup">Signup and abuse</a></p><p id="status">Loading…</p><div class="row"><label style="flex:1 1 240px">Factory <select id="repo"><option value="">All events</option></select></label> <button id="refresh" class="ghost">Refresh</button> <button id="force" class="danger">Send verification error to Sentry</button></div><div id="content"></div>${GOD_FORM}` });
const ADMIN_JS = `
const repo=document.querySelector('#repo'), status=document.querySelector('#status');
async function refresh(){try{const res=await fetch('/admin/data?repo='+encodeURIComponent(repo.value));if(!res.ok)throw Error('Request failed: '+res.status);const data=await res.json();if(repo.options.length===1)for(const name of data.repos){const option=document.createElement('option');option.value=option.textContent=name;repo.append(option)}status.textContent='Release '+data.release+' • Sentry '+(data.sentryConfigured?'configured':'not configured')+' • '+data.note;const content=document.querySelector('#content');content.replaceChildren();const spendSection=document.createElement('section'),heading=document.createElement('h2');heading.textContent='Spark spend · today (UTC)';spendSection.append(heading);const note=document.createElement('p');note.textContent='Estimated USD · muse-spark-1.3 · $1.25/M input, $0.15/M cached, $4.25/M output. Unmeasured calls keep their reserved estimate.';spendSection.append(note);const wrap=document.createElement('div');wrap.style.overflowX='auto';const table=document.createElement('table');table.style.width='100%';const header=table.createTHead().insertRow();for(const label of ['Factory','Calls','Tokens in','Tokens out','Est. $','Daily budget $','Unmeasured']){const th=document.createElement('th');th.textContent=label;th.style.textAlign='left';header.append(th)}const body=table.createTBody();for(const row of data.spend){const tr=body.insertRow();for(const value of [row.repo,row.calls,row.input_tokens,row.output_tokens,(row.nano_usd/1e9).toFixed(4),(row.daily_budget_nano_usd/1e9).toFixed(2),row.unmeasured_calls]){const td=tr.insertCell();td.textContent=String(value)}}if(!data.spend.length){const p=document.createElement('p');p.textContent='No paid Spark calls today.';spendSection.append(p)}wrap.append(table);spendSection.append(wrap);content.append(spendSection);for(const [key,value] of Object.entries(data)){if(!['budget','snapshot','errors','events','spark','webhooks'].includes(key))continue;const section=document.createElement('section'),h=document.createElement('h2'),pre=document.createElement('pre');h.textContent=key;pre.textContent=JSON.stringify(value,null,2);section.append(h,pre);content.append(section)}}catch(e){status.textContent=e.message}}
document.querySelector('#refresh').onclick=refresh;repo.onchange=refresh;
document.querySelector('#force').onclick=async()=>{const res=await fetch('/admin/force-error',{method:'POST'});status.textContent=JSON.stringify(await res.json());};refresh();
`;
