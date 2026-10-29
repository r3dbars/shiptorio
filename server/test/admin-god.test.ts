import { expect, it, mock } from 'bun:test';
import { testD1, signedInCookie } from './d1-fixture';
import { adminPaused } from '../src/admin-control';
import { readAdminView, digest, adminViewCookie } from '../src/admin-view';
import { readSessionDetails } from '../src/session';
import { reserveSpark } from '../src/budget';
import { runQuotaStatus } from '../src/signup';
import { emptyProgress } from '@shiptorio/shared';
mock.module('cloudflare:workers',()=>({DurableObject:class{ctx:unknown;env:unknown;constructor(ctx:unknown,env:unknown){this.ctx=ctx;this.env=env}}}));
const {testApp:app}=await import('./app-fixture');
async function fixture(){
 const calls:unknown[]=[];
 const env={DB:testD1(),SESSION_SECRET:'admin-god-test',GITHUB_APP_SLUG:'fixture',GITHUB_APP_ID:'1',GITHUB_APP_PRIVATE_KEY:'fixture-no-provider-call',ALLOWED_LOGINS:'operator,player,outsider',ADMIN_LOGINS:'operator',SIGNUP_GATE_MODE:'waitlist',CACHE:{list:async()=>({keys:[]}),put:async()=>{},get:async()=>null},FACTORY:{idFromName:(id:string)=>id,get:()=>({adminControl:async(...args:unknown[])=>calls.push(args),debugSnapshot:async()=>null,ensure:async()=>{},securityLimit:async()=>({allowed:true,retryAfter:0})})}};
 const owner=await signedInCookie(env,'operator',[],1),player=await signedInCookie(env,'player',['fixture/repo'],2),outsider=await signedInCookie(env,'outsider',[],3);
 return {env,owner,player,outsider,calls};
}
const url='https://shiptorio.com';
const actions=[{action:'view',user:'player',repo:'fixture/repo'},{action:'fast-forward',repo:'fixture/repo'},{action:'autonomy',user:'player',repo:'fixture/repo',level:'build'},{action:'progress',user:'player',reset:true},{action:'progress',user:'player',reset:false,progress:JSON.stringify({...emptyProgress(),xp:100,unlocked:['nightShift']})},{action:'reset-factory',repo:'fixture/repo',confirm:'fixture/repo'},{action:'limits',user:'player',runs:0,calls:0,tokens:0,dollars:0},{action:'pause',repo:'fixture/repo',paused:true},{action:'pause',paused:true},{action:'write-mode',enabled:true},{action:'leave-view'}];
const post=(env:unknown,cookie:string,body:unknown,origin=url)=>app.fetch(new Request(url+'/admin/god',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)}),env);
// Retained-view security still matters for cookies issued before the retired UI was removed.
async function retainedView(env:any, owner:string) {
 const token='a'.repeat(64),session=await readSessionDetails(env.SESSION_SECRET,owner);
 await env.DB.prepare('INSERT INTO admin_views(id_hash,session_hash,admin_id,target_user_id,repo,writable,expires_at) VALUES (?,?,?,?,?,0,?)').bind(await digest(token),await digest(session!.ref!.sid),1,2,'fixture/repo',Date.now()+3600000).run();
 return new Response('{}',{headers:{'set-cookie':adminViewCookie(token)}});
}
it('every god action rejects a non-admin or cross-origin request before audit/effects',async()=>{
 const {env,owner,player,outsider,calls}=await fixture();
 for(const a of actions){for(const cookie of [player,outsider])expect((await post(env,cookie,a)).status).toBe(403);expect((await post(env,owner,a,'https://evil.example')).status).toBe(403)}
 expect((await env.DB.prepare('SELECT count(*) AS n FROM admin_audit').first<{n:number}>())!.n).toBe(0);expect(calls).toHaveLength(0);
 for(const admin of ['',undefined,'*'])expect((await post({...env,ADMIN_LOGINS:admin},owner,actions[0])).status).toBe(403);
});
it('pause and resume are audited; retired actions redirect without effects',async()=>{
 const {env,owner,calls}=await fixture();
 for(const a of actions){const r=await post(env,owner,a);expect(r.status).toBe(a.action==='pause'?200:302);if(a.action!=='pause')expect(r.headers.get('location')).toBe('/admin')}
 const rows=(await env.DB.prepare('SELECT * FROM admin_audit').all<{action:string;detail_json:string}>()).results;
 expect(rows).toHaveLength(2);expect(rows.every(r=>JSON.parse(r.detail_json).status==='complete')).toBe(true);expect(calls).toHaveLength(0);
 expect(await adminPaused(env.DB,'fixture/repo')).toBe(true);expect(await adminPaused(env.DB,'elsewhere/repo')).toBe(true);
 const r=await app.fetch(new Request(url+'/admin/god/state',{headers:{cookie:owner}}),env);const body=await r.json() as any;
 expect(body.pauses).toHaveLength(2);expect(body.pausedForAccess).toBe(0);expect(body.audit).toBeUndefined();expect(body.users).toBeUndefined();
});
it('view is bound to the real admin session, current role and target membership',async()=>{
 const {env,owner,player}=await fixture();const r=await retainedView(env,owner);const viewCookie=r.headers.get('set-cookie')!.split(';')[0];
 const req=(cookie:string)=>new Request(url,{headers:{cookie}});
 expect(await readAdminView(env,req(player+'; '+viewCookie))).toBeNull();
 const other=await signedInCookie(env,'operator',[],1);
 expect(await readAdminView(env,req(other+'; '+viewCookie))).toBeNull();
 expect(await readAdminView({...env,ADMIN_LOGINS:'*'},req(owner+'; '+viewCookie))).toBeNull();
 await env.DB.prepare('DELETE FROM user_repos WHERE user_id=2').run();expect(await readAdminView(env,req(owner+'; '+viewCookie))).toBeNull();
});
it('retired actions redirect but unknown pause targets still fail closed',async()=>{
 const {env,owner}=await fixture();expect((await post(env,owner,{...actions[5],confirm:'other/repo'})).status).toBe(302);
 expect((await post(env,owner,{action:'view',user:'missing',repo:'other/repo'})).status).toBe(302);
 expect((await post(env,owner,{action:'pause',repo:'other/repo',paused:true})).status).toBe(404);
 expect((await post(env,owner,{action:'unknown'})).status).toBe(400);
});
it('scoped kill switch stops Spark before reserving a paid call, global stop covers every repo',async()=>{
 const {env,owner}=await fixture();
 await post(env,owner,{action:'pause',repo:'fixture/repo',paused:true});
 await expect(reserveSpark({...env,budgetRepo:'fixture/repo'},'user:2',1)).rejects.toThrow('Administrator paused');
 expect(await adminPaused(env.DB,'other/repo')).toBe(false);
 await post(env,owner,{action:'pause',paused:true});expect(await adminPaused(env.DB,'other/repo')).toBe(true);
 await post(env,owner,{action:'pause',paused:false});expect(await adminPaused(env.DB,'other/repo')).toBe(false);expect(await adminPaused(env.DB,'fixture/repo')).toBe(true);
});

it('Factory controls preserve verification and refuse active work; kill switch blocks real claim handler',async()=>{
 const {Factory}=await import('../src/factory');const {starterLine}=await import('../src/engine');
 const env=(await fixture()).env;
 const initial={repo:'fixture/repo',baseBranch:'main',districts:[],...starterLine(),items:[],science:{red:2,green:0,grey:0,blue:0},trust:.5,tick:7};
 const data=new Map<string,unknown>([['state',initial],['meta',{repo:'fixture/repo',installationId:1}],['planningRetry:gh-2',{day:new Date().toISOString().slice(0,10),failures:3,retryAt:Date.now()+60000,reason:'stalled'}],['runnerPair','keep-pair'],['githubRepoId',100]]);
 let alarm=0;
 const storage={get:async(k:string)=>structuredClone(data.get(k)),put:async(k:string,v:unknown)=>{data.set(k,structuredClone(v))},delete:async(k:string)=>data.delete(k),list:async(o?:{prefix?:string})=>new Map([...data].filter(([k])=>k.startsWith(o?.prefix??''))),getAlarm:async()=>alarm,setAlarm:async(n:number)=>{alarm=n},transaction:async(fn:(tx:unknown)=>unknown)=>fn(storage)};
 const f=new Factory({storage,blockConcurrencyWhile:(fn:()=>unknown)=>fn(),getWebSockets:()=>[],waitUntil:()=>{}} as never,env as never);
 await f.adminControl('fast-forward',{});
 expect((data.get('planningRetry:gh-2') as any).failures).toBe(3);expect((data.get('planningRetry:gh-2') as any).retryAt).toBe(0);expect(alarm).toBeGreaterThan(0);
 await env.DB.prepare("INSERT INTO admin_controls VALUES ('fixture/repo',1)").run();
 expect(await f.claimRunner('keep-pair',['codex'])).toBeNull();
 data.set('runnerJob:busy',{id:'busy',status:'running'});await expect(f.adminControl('reset-factory',{})).rejects.toThrow('Active work');data.delete('runnerJob:busy');
 await f.adminControl('autonomy',{level:'build'});expect((data.get('permits') as any).ladder.level).toBe('build');expect((data.get('permits') as any).lanes).toEqual({});
 await f.adminControl('reset-factory',{});expect((data.get('state') as any).science.red).toBe(0);expect(data.get('runnerPair')).toBe('keep-pair');expect(data.get('meta')).toEqual({repo:'fixture/repo',installationId:1});expect(data.has('permits')).toBe(false);
 await expect(f.adminControl('launch',{})).rejects.toThrow('Unknown control');
});

it('administrator progress reset cannot be overwritten by a stale client',async()=>{
 const {env,owner,player}=await fixture();await env.DB.prepare('INSERT INTO admin_progress_resets(user_id,version) VALUES (2,1)').run();
 const put=(version?:string)=>app.fetch(new Request(url+'/api/me/progress',{method:'PUT',headers:{cookie:player,origin:url,...version&&{'x-progress-reset':version}},body:JSON.stringify({...emptyProgress(),xp:999})}),env);
 expect((await put()).status).toBe(409);expect((await put('0')).status).toBe(409);expect((await put('1')).status).toBe(200);
});

it('the real websocket handler blocks view writes until an audited toggle, then audits each move and rechecks role',async()=>{
 const {Factory}=await import('../src/factory');const {starterLine}=await import('../src/engine');const {browserSocketEpoch}=await import('../src/browser-socket');const {requireUser}=await import('../src/authorization');
 const {env,owner}=await fixture();const response=await retainedView(env,owner);const cookie=owner+'; '+response.headers.get('set-cookie')!.split(';')[0];
 const view=(await readAdminView(env,new Request(url,{headers:{cookie}})))!;
 const user=(await requireUser(new Request(url,{headers:{cookie}}),env as never))!;
 const state={repo:'fixture/repo',baseBranch:'main',districts:[],...starterLine(),items:[],science:{red:0,green:0,grey:0,blue:0},trust:.5,tick:0};
 const data=new Map<string,unknown>([['state',state],['meta',{repo:'fixture/repo',installationId:1}],['githubRepoId',100]]);
 const storage={get:async(k:string)=>structuredClone(data.get(k)),put:async(k:string,v:unknown)=>{data.set(k,structuredClone(v))},delete:async(k:string)=>data.delete(k),list:async(o?:{prefix?:string})=>new Map([...data].filter(([k])=>k.startsWith(o?.prefix??''))),getAlarm:async()=>null,setAlarm:async()=>{},transaction:async(fn:(tx:unknown)=>unknown)=>fn(storage)};
 const f=new Factory({storage,blockConcurrencyWhile:(fn:()=>unknown)=>fn(),getWebSockets:()=>[],waitUntil:()=>{}} as never,env as never);
 const messages:unknown[]=[];
 const auth={login:'operator',userId:1,user,sessionHash:user.sessionHash,expiresAt:Date.now()+60000,issuedAt:Date.now(),epoch:await browserSocketEpoch(env),repo:'fixture/repo',adminView:view.idHash};
 const ws={deserializeAttachment:()=>auth,send:(raw:string)=>messages.push(JSON.parse(raw)),close:()=>{}} as unknown as WebSocket;
 const move=JSON.stringify({type:'set_goal',text:'support check'});
 await f.webSocketMessage(ws,move);expect((data.get('state') as any).goal).toBeUndefined();expect(messages).toContainEqual(expect.objectContaining({text:expect.stringContaining('read-only')}));
 expect((await post(env,cookie,{action:'write-mode',enabled:true})).status).toBe(302);
 await env.DB.prepare('UPDATE admin_views SET writable=1 WHERE id_hash=?').bind(view.idHash).run(); // retained writable view fixture, not an exposed control
 await f.webSocketMessage(ws,move);expect((data.get('state') as any).goal).toBe('support check');
 expect((await env.DB.prepare("SELECT count(*) n FROM admin_audit WHERE action='view-write'").first<{n:number}>())!.n).toBe(1);
 env.ADMIN_LOGINS='';await f.webSocketMessage(ws,JSON.stringify({type:'set_goal',text:'should not apply'}));expect((data.get('state') as any).goal).toBe('support check');
});

it('/api/me exposes admin only from configuration and displays the viewed player prefs',async()=>{
 const {env,owner,player}=await fixture();
 await env.DB.prepare("INSERT INTO user_prefs(user_id,key,value,updated_at) VALUES (2,'intro','seen',1)").run();
 const get=(cookie:string)=>app.fetch(new Request(url+'/api/me',{headers:{cookie}}),env);
 expect(await(await get(player)).json()).toMatchObject({login:'player',admin:false});
 const view=await retainedView(env,owner);const cookie=owner+'; '+view.headers.get('set-cookie')!.split(';')[0];
 expect(await(await get(cookie)).json()).toMatchObject({login:'operator',admin:true,viewingAs:{login:'player',writable:false},prefs:{intro:'seen'}});
});

it('signing out clears the admin view so another account does not inherit the context',async()=>{
 const {env,owner}=await fixture();const result=await retainedView(env,owner);const cookie=owner+'; '+result.headers.get('set-cookie')!.split(';')[0];
 const response=await app.fetch(new Request(url+'/auth/logout',{headers:{cookie,'sec-fetch-site':'same-origin'}}),env);
 expect(response.headers.get('set-cookie')).toContain('shiptorio_admin_view=;');
 expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
 expect(await readAdminView(env,new Request(url,{headers:{cookie}}))).toBeNull();
});
