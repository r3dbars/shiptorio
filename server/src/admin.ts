import { GOD_FORM, GOD_JS } from "./admin-god-page";
import { configuredAdmin } from "./admin-policy";
import { spendReport } from "./spend";
import { budgetReport } from "./budget";
import type { Hono } from 'hono';
import type { Env } from './index';
import type { Factory } from './factory';
import { currentTrace } from './telemetry';
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
  app.get('/admin/god.js', c=>{c.header('Content-Type','application/javascript; charset=utf-8');return c.body(GOD_JS)});
  app.get('/admin/app.js', c => { c.header('Content-Type', 'application/javascript; charset=utf-8'); return c.body(ADMIN_JS); });
  app.get('/admin/data', async c => {
    const env = c.env as Env;
    return c.json({ budget: await budgetReport(env), spend: await spendReport(env.DB) });
  });
  app.post('/admin/force-error', async c => {
    if (c.req.header('origin') !== new URL(c.req.url).origin) return c.json({ error: 'invalid origin' }, 403);
    return c.redirect('/admin',302);
  });
  // This DSN belongs to Shiptorio itself. It is a public ingestion key, never an auth token.
  app.get('/api/telemetry/config', async c => {
    const user = await currentUser(c.env, c.req.header('cookie') ?? null, new URL(c.req.url));
    return c.json({ dsn: c.env.SHIPTORIO_SENTRY_DSN ?? null, release: c.env.BUILD_SHA ?? 'development',
      userId: user?.login ?? null, requestId: currentTrace()?.requestId });
  });
}
export const ADMIN_HTML = ironPage({ title: 'Admin', eyebrow: 'Internal', wide: true, home: '/admin',
  head: '<script type="module" src="/admin/app.js"></script><script type="module" src="/admin/god.js"></script><style>#god-form{display:grid;gap:12px;max-width:640px}.spend-row{padding:12px 0;border-top:1px solid #594128;overflow-wrap:anywhere}.spend-row h3{margin:0 0 8px}#content{display:grid;gap:12px}section{min-width:0}</style>',
  body: `<h1>Shiptorio admin</h1>${GOD_FORM}<section><h2>Kill switches</h2><p><a href="/admin/flags">Manage feature flags</a></p></section><section><h2>Spend today</h2><p id="status" role="status">Loading spend…</p><button id="refresh" class="ghost">Refresh spend</button><div id="content"></div></section>` });
const ADMIN_JS = `
const status=document.querySelector('#status');
async function refresh(){try{const res=await fetch('/admin/data');if(!res.ok)throw Error('Admin access required');const data=await res.json(),content=document.querySelector('#content');content.replaceChildren();status.textContent='Estimated AI spend today (UTC).';if(!data.spend.length){status.textContent='No paid AI calls today.';return}for(const row of data.spend){const section=document.createElement('article');section.className='spend-row';const h=document.createElement('h3');h.textContent=row.repo;const p=document.createElement('p');p.textContent=row.calls+' calls · '+row.input_tokens+' input tokens · '+row.output_tokens+' output tokens';const cost=document.createElement('p');cost.textContent='$'+(row.nano_usd/1e9).toFixed(4)+' estimated · $'+(row.daily_budget_nano_usd/1e9).toFixed(2)+' daily budget'+(row.unmeasured_calls?' · '+row.unmeasured_calls+' calls awaiting measurement':'');section.append(h,p,cost);content.append(section)}}catch(e){status.textContent=e.message}}
document.querySelector('#refresh').onclick=refresh;refresh();
`;
