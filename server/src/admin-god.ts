import { z } from 'zod';
import type { Hono } from 'hono';
import type { Env } from './index';
import type { Factory } from './factory';
import { currentUser } from './accounts';
import { readSessionDetails } from './session';
import { configuredAdmin } from './admin-policy';
import { auditAdmin } from './admin-control';
import { adminViewCookie, digest, readAdminView } from './admin-view';
import { emptyProgress, validProgress } from '@shiptorio/shared';

const repo = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).refine(v=> !v.split('/').some(x=>x==='.'||x==='..')).transform(v=>v.toLowerCase());
const login = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const base = { repo, user: login };
const count = z.number().int().min(0).max(999999999);
export const GodAction = z.discriminatedUnion('action', [
  z.object({action:z.literal('view'), ...base}),
  z.object({action:z.literal('write-mode'), enabled:z.boolean()}),
  z.object({action:z.literal('leave-view')}),
  z.object({action:z.literal('fast-forward'), repo}),
  z.object({action:z.literal('autonomy'), ...base, level:z.enum(['advisor','floor','build','lights_out'])}),
  z.object({action:z.literal('progress'), user:login, reset:z.boolean(), progress:z.string().max(32768).optional()}),
  z.object({action:z.literal('reset-factory'), repo, confirm:repo}),
  z.object({action:z.literal('limits'), user:login, runs:count, calls:count, tokens:count, dollars:z.number().min(0).max(1000)}),
  z.object({action:z.literal('pause'), repo:repo.optional(), paused:z.boolean()}),
]);
export function godRoutes(app:Hono<any>, factory:(env:Env, repo:string)=>Promise<DurableObjectStub<Factory>>|DurableObjectStub<Factory>) {
  app.get('/admin/god/state', async c=>{
    const env=c.env as Env, user=await currentUser({...env,DEV_LOGIN:undefined},c.req.header('cookie')??null,new URL(c.req.url));
    if(!configuredAdmin(env,user?.login)) return c.json({error:'admin login required'},403);
    const [users,repos,audit,pauses,view]=await Promise.all([
      env.DB.prepare(`SELECT u.id,u.login,COALESCE(c.count,0) AS runs_used,COALESCE(s.calls,0) AS calls_used,COALESCE(s.tokens,0) AS tokens_used FROM users u LEFT JOIN signup_counters c ON c.scope='runs:'||lower(u.login) AND c.bucket=? LEFT JOIN spark_usage s ON s.account='user:'||u.id AND s.day=? ORDER BY u.login`).bind(Math.floor(Date.now()/86400000),new Date().toISOString().slice(0,10)).all(),
      env.DB.prepare('SELECT full_name FROM repos ORDER BY full_name').all(),
      env.DB.prepare('SELECT * FROM admin_audit ORDER BY at DESC, id DESC LIMIT 50').all(),
      env.DB.prepare('SELECT scope, paused FROM admin_controls').all(),readAdminView(env,c.req.raw),
    ]);
    return c.json({users:users.results,repos:repos.results,audit:audit.results,pauses:pauses.results,view:view&&{login:view.login,repo:view.repo,writable:view.writable}});
  });
  app.post('/admin/god', async c=>{
    const env=c.env as Env, operator=await currentUser({...env,DEV_LOGIN:undefined},c.req.header('cookie')??null,new URL(c.req.url));
    if(!operator || !configuredAdmin(env,operator.login)) return c.json({error:'admin login required'},403);
    if(c.req.header('origin')!==new URL(c.req.url).origin) return c.json({error:'invalid origin'},403);
    const text=await c.req.text(); if(text.length>35000) return c.json({error:'too large'},413);
    let input; try{input=GodAction.safeParse(JSON.parse(text));}catch{return c.json({error:'invalid JSON'},400);}
    if(!input.success) return c.json({error:'invalid admin action'},400);
    const a=input.data;
    const target='user' in a ? await env.DB.prepare('SELECT id, login FROM users WHERE lower(login)=?').bind(a.user.toLowerCase()).first<{id:number;login:string}>():null;
    if('user' in a&&!target) return c.json({error:'unknown player'},404);
    if('repo' in a&&a.repo&&!await env.DB.prepare('SELECT full_name FROM repos WHERE full_name=?').bind(a.repo).first()) return c.json({error:'unknown factory'},404);
    if((a.action==='view'||a.action==='autonomy')&&!await env.DB.prepare('SELECT repo FROM user_repos WHERE user_id=? AND repo=?').bind(target!.id,a.repo).first()) return c.json({error:'player does not have that factory'},403);
    if(a.action==='reset-factory'&&a.confirm!==a.repo) return c.json({error:'type the factory name to confirm reset'},400);
    let progress:string|undefined;
    if(a.action==='progress') {const value=a.reset?emptyProgress():validProgress(a.progress??'');if(!value)return c.json({error:'invalid progress'},400);progress=JSON.stringify(value);}
    const view=(a.action==='write-mode'||a.action==='leave-view')?await readAdminView(env,c.req.raw):null;
    if(a.action==='write-mode'&&!view)return c.json({error:'start a view first'},409);
    const id=await auditAdmin(env.DB,operator.login,a.action,'repo'in a?a.repo??null:view?.repo??null,target?.login??view?.login??null,{status:'started',...a});
    try {
      let url:string|undefined;
      if(a.action==='view'){
        const session=await readSessionDetails(env.SESSION_SECRET,c.req.header('cookie')??null);
        if(!session?.ref) throw new Error('A real account session is required');
        const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
        await env.DB.prepare('INSERT INTO admin_views(id_hash, session_hash, admin_id, target_user_id, repo, writable, expires_at) VALUES (?,?,?,?,?,0,?)')
          .bind(await digest(token),await digest(session.ref.sid),operator.id,target!.id,a.repo,Date.now()+3600000).run();
        c.header('Set-Cookie',adminViewCookie(token,new URL(c.req.url).protocol==='https:'));
        url='/?source=live&repo='+encodeURIComponent(a.repo);
      }else if(a.action==='write-mode'){
        await env.DB.prepare('UPDATE admin_views SET writable=? WHERE id_hash=?').bind(a.enabled?1:0,view!.idHash).run();
      }else if(a.action==='leave-view'){
        if(view)await env.DB.prepare('DELETE FROM admin_views WHERE id_hash=?').bind(view.idHash).run();
        c.header('Set-Cookie',adminViewCookie('',new URL(c.req.url).protocol==='https:'));
      }else if(a.action==='progress'){
        await env.DB.batch([env.DB.prepare('INSERT INTO user_progress(user_id,value,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(target!.id,progress!,Date.now()),env.DB.prepare('INSERT INTO admin_progress_resets(user_id,version) VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1').bind(target!.id)]);
      }else if(a.action==='limits'){
        // Keep usage history. The explicit amounts are daily ceilings, not refunds.
        await env.DB.batch([
          env.DB.prepare('INSERT INTO admin_user_limits(user_id,runs,spark_calls,spark_tokens) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET runs=excluded.runs,spark_calls=excluded.spark_calls,spark_tokens=excluded.spark_tokens').bind(target!.id,a.runs,a.calls,a.tokens),
          env.DB.prepare('INSERT INTO spark_factory_budgets(repo,daily_nano_usd) SELECT repo,? FROM factory_budget_owners WHERE user_id=? ON CONFLICT(repo) DO UPDATE SET daily_nano_usd=excluded.daily_nano_usd').bind(Math.floor(a.dollars*1e9),target!.id),
        ]);
      }else if(a.action==='pause'){
        await env.DB.prepare('INSERT INTO admin_controls(scope,paused) VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET paused=excluded.paused').bind(a.repo??'*',a.paused?1:0).run();
      }else{
        await (await factory(env,a.repo)).adminControl(a.action,a.action==='autonomy'?{level:a.level}:{});
      }
      await env.DB.prepare('UPDATE admin_audit SET detail_json=? WHERE id=?').bind(JSON.stringify({...a,status:'complete'}),id).run();
      return c.json({ok:true,auditId:id,...url&&{url}});
    }catch(error){
      // Never include private provider messages or credentials in the audit/UI.
      await env.DB.prepare('UPDATE admin_audit SET detail_json=? WHERE id=?').bind(JSON.stringify({...a,status:'failed'}),id).run();
      return c.json({error:'Admin action could not finish. Active builds or PRs must finish before a factory reset.',auditId:id},409);
    }
  });
}
