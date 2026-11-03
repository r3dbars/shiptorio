import { pausedForGitHubAccess } from './github-lifecycle';
import { z } from 'zod';
import type { Hono } from 'hono';
import type { Env } from './index';
import type { Factory } from './factory';
import { currentUser } from './accounts';
import { configuredAdmin } from './admin-policy';
import { auditAdmin } from './admin-control';

const repo = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).refine(v=> !v.split('/').some(x=>x==='.'||x==='..')).transform(v=>v.toLowerCase());
export const GodAction = z.object({action:z.literal('pause'), repo:repo.optional(), paused:z.boolean()});
const retired = new Set(['view','write-mode','leave-view','fast-forward','autonomy','progress','reset-factory','limits']);

export function godRoutes(app:Hono<any>, _factory:(env:Env, repo:string)=>Promise<DurableObjectStub<Factory>>|DurableObjectStub<Factory>) {
  app.get('/admin/god/state', async c=>{
    const env=c.env as Env, user=await currentUser({...env,DEV_LOGIN:undefined},c.req.header('cookie')??null,new URL(c.req.url));
    if(!configuredAdmin(env,user?.login)) return c.json({error:'admin login required'},403);
    const [repos,pauses]=await Promise.all([
      env.DB.prepare('SELECT full_name FROM repos ORDER BY full_name').all(),
      env.DB.prepare('SELECT scope, paused FROM admin_controls').all(),
    ]);
    return c.json({repos:repos.results,pauses:pauses.results,pausedForAccess:await pausedForGitHubAccess(env.DB)});
  });
  app.post('/admin/god', async c=>{
    const env=c.env as Env, operator=await currentUser({...env,DEV_LOGIN:undefined},c.req.header('cookie')??null,new URL(c.req.url));
    if(!operator || !configuredAdmin(env,operator.login)) return c.json({error:'admin login required'},403);
    if(c.req.header('origin')!==new URL(c.req.url).origin) return c.json({error:'invalid origin'},403);
    const text=await c.req.text(); if(text.length>35000) return c.json({error:'too large'},413);
    let value:unknown; try{value=JSON.parse(text);}catch{return c.json({error:'invalid JSON'},400);}
    if(value && typeof value==='object' && 'action' in value && typeof value.action==='string' && retired.has(value.action)) return c.redirect('/admin',302);
    const input=GodAction.safeParse(value);
    if(!input.success) return c.json({error:'invalid admin action'},400);
    const a=input.data;
    if(a.repo&&!await env.DB.prepare('SELECT full_name FROM repos WHERE full_name=?').bind(a.repo).first()) return c.json({error:'unknown factory'},404);
    const id=await auditAdmin(env.DB,operator.login,a.action,a.repo??null,null,{status:'started',...a});
    try {
      await env.DB.prepare('INSERT INTO admin_controls(scope,paused) VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET paused=excluded.paused').bind(a.repo??'*',a.paused?1:0).run();
      await env.DB.prepare('UPDATE admin_audit SET detail_json=? WHERE id=?').bind(JSON.stringify({...a,status:'complete'}),id).run();
      return c.json({ok:true,auditId:id});
    }catch{
      await env.DB.prepare('UPDATE admin_audit SET detail_json=? WHERE id=?').bind(JSON.stringify({...a,status:'failed'}),id).run();
      return c.json({error:'Could not update the factory pause. Try again.',auditId:id},409);
    }
  });
}
