import { ironPage } from "./ironPage";
import { configuredAdmin } from "./admin-policy";
import { escapeHtml as escape } from "./encode";

export const GOD_FORM = `<section aria-labelledby="god-title"><h2 id="god-title">Factories</h2><p id="god-status" role="status">Loading factories…</p><form id="god-form"><label>Factory<select id="god-repo" required><option value="">All factories</option></select></label><label>Action<select id="god-action"><option value="pause">Pause</option><option value="resume">Resume</option></select></label><button type="submit">Review change</button><div id="god-confirm" hidden><p id="god-review"></p><button id="god-apply" type="button" class="danger">Apply change</button><button id="god-cancel" type="button" class="ghost">Cancel</button></div></form></section>`;
export const GOD_JS = `
const q=id=>document.getElementById(id),status=q('god-status');let pending;
async function refresh(){try{const r=await fetch('/admin/god/state');if(!r.ok)throw Error('Admin access required');const d=await r.json(),select=q('god-repo'),old=select.value;select.replaceChildren(new Option('All factories',''));for(const row of d.repos)select.append(new Option(row.full_name,row.full_name));select.value=old;status.textContent=d.pausedForAccess+' factories paused for GitHub access. '+d.pauses.filter(p=>p.paused).length+' manual pauses. Every change is recorded.'}catch(e){status.textContent=e.message}}
for(const event of ['input','change'])q('god-form').addEventListener(event,()=>{pending=null;q('god-confirm').hidden=true});
q('god-form').onsubmit=e=>{e.preventDefault();const repo=q('god-repo').value,paused=q('god-action').value==='pause';pending={action:'pause',paused,...(repo?{repo}:{})};q('god-review').textContent=(paused?'Pause ':'Resume ')+(repo||'all factories')+'?';q('god-confirm').hidden=false};
q('god-cancel').onclick=()=>{pending=null;q('god-confirm').hidden=true};
q('god-apply').onclick=async()=>{if(!pending)return;const body=pending;pending=null;q('god-apply').disabled=true;try{const r=await fetch('/admin/god',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Change failed');q('god-confirm').hidden=true;await refresh();status.textContent+=' Change saved.'}catch(e){status.textContent=e.message}finally{q('god-apply').disabled=false}};refresh();
`;

/** Focused editor for the existing Raise limit link; caller must enforce admin authorization. */
export async function quotaEditor(env: { DB: D1Database; ADMIN_LOGINS?: string }, login: string): Promise<string> {
  const row = await env.DB.prepare("SELECT factories,repos,runs_daily,spark_calls_daily,spark_tokens_daily FROM signup_allowlist WHERE login=?")
    .bind(login).first<{ factories: number; repos: number; runs_daily: number; spark_calls_daily: number | null; spark_tokens_daily: number | null }>();
  const override = await env.DB.prepare("SELECT runs,spark_calls,spark_tokens FROM admin_user_limits WHERE user_id=(SELECT id FROM users WHERE lower(login)=?)")
    .bind(login).first<{ runs: number | null; spark_calls: number | null; spark_tokens: number | null }>();
  const runs = override?.runs ?? (configuredAdmin(env, login) ? Math.max(200, row?.runs_daily ?? 0) : row?.runs_daily ?? 20);
  const field = (name: string, label: string, value: number | null, max: number) => `<label for="quota-${name}">${label}<input id="quota-${name}" name="${name}" type="number" min="0" max="${max}" value="${value ?? ""}"${value === null ? "" : " required"}></label>`;
  return ironPage({ title: "Account limits", eyebrow: "Admin · spend", home: "/admin", head: "<style>form{display:grid;gap:12px}label{margin:0}input,button{box-sizing:border-box;max-width:100%}</style>", body: `<h1>Account limits</h1><p>For <strong>${escape(login)}</strong></p><p>Saving approves account access and sets these limits. Usage already recorded today still counts.</p><form method="post" action="/admin/signup?login=${encodeURIComponent(login)}"><input type="hidden" name="login" value="${escape(login)}">${field("factories", "Factories", row?.factories ?? 3, 99999)}${field("repos", "Repos", row?.repos ?? 3, 99999)}${field("runs", "Runs/day (UTC)", runs, 99999)}${field("spark_calls", "Spark calls/day (UTC; blank = Worker default)", override?.spark_calls ?? row?.spark_calls_daily ?? null, 999999999)}${field("spark_tokens", "Spark tokens/day (UTC; blank = Worker default)", override?.spark_tokens ?? row?.spark_tokens_daily ?? null, 999999999)}<button name="action" value="limits">Save access and quotas</button></form><p><a href="/admin">Back to admin</a></p>` });
}
