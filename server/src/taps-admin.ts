// /admin/taps: what players say yes and no to (docs/context/taps.md). Lives next to /admin (Codex #1 owns
// admin.ts) and sits behind the same /admin/* gate; it checks the admin login again on its own so it stays
// locked if it is ever mounted elsewhere.

import type { Hono } from "hono";
import { configuredAdmin } from "./admin-policy";
import { currentUser } from "./accounts";
import { ironPage } from "./ironPage";
import { loadTaps, tapsReport } from "./taps";
import { tapSignals } from "./signals/taps";

export function tapsRoutes(app: Hono<any>) {
  const admin = async (c: any) => configuredAdmin(c.env, (await currentUser(c.env, c.req.header("cookie") ?? null, new URL(c.req.url)))?.login ?? null);
  app.get("/admin/taps", async c => {
    if (!(await admin(c))) return c.json({ error: "admin login required" }, 403);
    c.header("Cache-Control", "no-store");
    return c.redirect("/admin",302); // retired surface; keep the existing admin gate
    c.header("Cache-Control", "no-store");
    return c.html(TAPS_HTML);
  });
  app.get("/admin/taps/app.js", async c => {
    if (!(await admin(c))) return c.json({ error: "admin login required" }, 403);
    c.header("Cache-Control", "no-store");
    return c.redirect("/admin",302); // retired surface; keep the existing admin gate
    c.header("Content-Type", "application/javascript; charset=utf-8");
    return c.body(TAPS_JS);
  });
  // ?rows=1 adds the raw rows, the export the brain eval harness replays.
  app.get("/admin/taps/data", async c => {
    if (!(await admin(c))) return c.json({ error: "admin login required" }, 403);
    c.header("Cache-Control", "no-store");
    return c.redirect("/admin",302); // retired surface; keep the existing admin gate
    c.header("Cache-Control", "no-store");
    const days = Math.min(90, Math.max(1, Number(c.req.query("days")) || 7));
    const repo = c.req.query("repo") || undefined;
    const now = Date.now(), since = now - days * 86400000;
    const rows = await loadTaps(c.env.DB, { repo, since });
    const repos = (await c.env.DB.prepare("SELECT DISTINCT repo FROM card_taps ORDER BY repo").all()).results.map((r: { repo: string }) => r.repo);
    return c.json({ days, repo: repo ?? null, repos, report: tapsReport(rows, since), signals: repo ? tapSignals(rows, now) : [], ...(c.req.query("rows") ? { rows } : {}) });
  });
}

const TAPS_HTML = ironPage({ title: "Taps", eyebrow: "Internal · taps", wide: true, home: "/admin",
  head: '<script type="module" src="/admin/taps/app.js"></script><style>table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:4px 8px;border-bottom:1px solid #3a2c22;vertical-align:top}th{color:#b8a48a;font-weight:400}.big{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.big div{flex:1 1 140px;background:#1e1610;border:2px solid #3a2c22;padding:10px}.big b{display:block;font-size:24px;color:#ffb020}.wrap{overflow-x:auto}.muted{color:#b8a48a}</style>',
  body: `<h1>What players say yes and no to</h1><p class="muted">Every card the factory dealt, what the planner suggested and why, what the player tapped, and whether the approved work shipped clean. <a href="/admin">Diagnostics</a> · <a id="export" href="/admin/taps/data?rows=1">Export JSON</a></p><div class="row"><label style="flex:1 1 240px">Factory <select id="repo"><option value="">All factories</option></select></label> <label>Window <select id="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label></div><p id="status">Loading…</p><div id="content"></div>` });

const TAPS_JS = `
const $=s=>document.querySelector(s),repo=$('#repo'),days=$('#days'),status=$('#status'),content=$('#content');
const pct=v=>v==null?'–':Math.round(v*100)+'%';
const dur=ms=>ms==null?'–':ms<60000?Math.round(ms/1000)+'s':ms<3600000?Math.round(ms/60000)+'m':(ms/3600000).toFixed(1)+'h';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);return e};
function section(title,note){const s=el('section');s.append(el('h2',title));if(note){const p=el('p',note);p.className='muted';s.append(p)}content.append(s);return s}
function table(parent,head,rows){const w=el('div');w.className='wrap';const t=el('table'),h=t.createTHead().insertRow();for(const x of head)h.append(el('th',x));const b=t.createTBody();for(const r of rows){const tr=b.insertRow();for(const v of r)tr.insertCell().textContent=String(v)}if(!rows.length){const tr=b.insertRow(),td=tr.insertCell();td.colSpan=head.length;td.textContent='Nothing yet.'}w.append(t);parent.append(w)}
const STAT_HEAD=['','Shown','Continue','Other','Later','Never','Untapped','Yes rate','Median wait','Shipped clean','Rework / came back','Good outcome'];
const statRow=(k,s)=>[k,s.shown,s.continued,s.other,s.later,s.never,s.gone,pct(s.approval),dur(s.medianDecideMs),s.shippedClean,(s.rework+s.shippedAfterRework)+' / '+s.cameBack,pct(s.goodRate)];
async function refresh(){
  try{
    const q='repo='+encodeURIComponent(repo.value)+'&days='+days.value;$('#export').href='/admin/taps/data?rows=1&'+q;
    const res=await fetch('/admin/taps/data?'+q);if(!res.ok)throw Error('Request failed: '+res.status);
    const d=await res.json(),r=d.report,t=r.total;
    if(repo.options.length===1)for(const name of d.repos){const o=el('option',name);o.value=name;repo.append(o)}
    status.textContent=t.shown+' cards in the last '+d.days+' day'+(d.days===1?'':'s')+(d.repo?' for '+d.repo:' across every factory')+'.';
    content.replaceChildren();
    const big=el('div');big.className='big';
    for(const [label,value] of [['Yes rate',pct(t.approval)],['Cards tapped',t.decided+' / '+t.shown],['Median time to decide',dur(t.medianDecideMs)],['Approvals that shipped clean',pct(t.goodRate)]]){const b=el('div');b.append(el('b',value),el('span',label));big.append(b)}
    content.append(big);
    table(section('By card kind','Continue = took the suggested option. Other = picked a different option. Untapped = the card left the deck before anyone tapped it.'),STAT_HEAD,Object.entries(r.byKind).map(([k,s])=>statRow(k,s)));
    table(section('By area','District, source or station the card was about.'),STAT_HEAD,Object.entries(r.byScope).map(([k,s])=>statRow(k,s)));
    table(section('Model vs rules','spark = the planner picked the option or wrote the reason. rule = fixed backend rules.'),STAT_HEAD,Object.entries(r.byAuthor).map(([k,s])=>statRow(k,s)));
    if(Object.keys(r.byPlay).length)table(section('By brain play'),STAT_HEAD,Object.entries(r.byPlay).map(([k,s])=>statRow(k,s)));
    table(section('Most skipped','Cards set aside or left untapped most often.'),['Card','Kind','Area','Later','Never','Untapped'],r.skipped.map(s=>[s.title,s.kind,s.scope,s.later,s.never,s.gone]));
    table(section('Never reasons'),['Reason','Count'],Object.entries(r.neverReasons).map(([k,v])=>[({once:'Not now',kind:'Stop showing these',spark:'You decide these',wrong:'Wrong call'})[k]||k,v]));
    if(d.repo)table(section('What the brain hears','The taps signals this factory feeds the bottleneck brain right now.'),['Signal','Severity','Evidence'],d.signals.map(s=>[s.title,s.severity.toFixed(2),s.evidence.map(e=>e.label).join(' · ')]));
    table(section('Recent cards'),['When','Factory','Card','Kind','Suggested','Why (planner)','By','Tap','Wait','Outcome'],r.recent.map(x=>[new Date(x.shown_at).toLocaleString(),x.repo,x.title,x.kind,x.suggested||'',x.because||'',x.by,x.action?(x.action+(x.reason?' ('+x.reason+')':'')+(x.option_id&&x.action==='other'?' '+x.option_id:'')):'waiting',x.decided_at&&x.action!=='gone'&&x.decided_at>x.shown_at?dur(x.decided_at-x.shown_at):'',x.outcome||'']));
  }catch(e){status.textContent=e.message}
}
repo.onchange=refresh;days.onchange=refresh;refresh();
`;
