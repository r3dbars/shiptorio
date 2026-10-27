import { expect, it, mock } from 'bun:test';
import { testD1, signedInCookie } from './d1-fixture';
import { adminPaused } from '../src/admin-control';
import { readAdminView } from '../src/admin-view';
import { reserveSpark } from '../src/budget';
import { runQuotaStatus } from '../src/signup';
import { emptyProgress } from '@shiptorio/shared';
mock.module('cloudflare:workers',()=>({DurableObject:class{ctx:unknown;env:unknown;constructor(ctx:unknown,env:unknown){this.ctx=ctx;this.env=env}}}));
const {testApp:app}=await import('./app-fixture');
async function fixture(){
 const calls:unknown[]=[];
 const env={DB:testD1(),SESSION_SECRET:'admin-god-test',ALLOWED_LOGINS:'operator,player,outsider',ADMIN_LOGINS:'operator',SIGNUP_GATE_MODE:'waitlist',CACHE:{list:async()=>({keys:[]}),put:async()=>{},get:async()=>null},FACTORY:{idFromName:(id:string)=>id,get:()=>({adminControl:async(...args:unknown[])=>calls.push(args),debugSnapshot:async()=>null,ensure:async()=>{},securityLimit:async()=>({allowed:true,retryAfter:0})})}};
 const owner=await signedInCookie(env,'operator',[],1),player=await signedInCookie(env,'player',['fixture/repo'],2),outsider=await signedInCookie(env,'outsider',[],3);
 return {env,owner,player,outsider,calls};
}
const url='https://shiptorio.com';
const actions=[{action:'view',user:'player',repo:'fixture/repo'},{action:'fast-forward',repo:'fixture/repo'},{action:'autonomy',user:'player',repo:'fixture/repo',level:'build'},{action:'progress',user:'player',reset:true},{action:'progress',user:'player',reset:false,progress:JSON.stringify({...emptyProgress(),xp:100,unlocked:['nightShift']})},{action:'reset-factory',repo:'fixture/repo',confirm:'fixture/repo'},{action:'limits',user:'player',runs:0,calls:0,tokens:0,dollars:0},{action:'pause',repo:'fixture/repo',paused:true},{action:'pause',paused:true},{action:'write-mode',enabled:true},{action:'leave-view'}];
const post=(env:unknown,cookie:string,body:unknown,origin=url)=>app.fetch(new Request(url+'/admin/god',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)}),env);
it('every god action rejects a non-admin or cross-origin request before audit/effects',async()=>{
 const {env,owner,player,outsider,calls}=await fixture();
 for(const a of actions){for(const cookie of [player,outsider])expect((await post(env,cookie,a)).status).toBe(403);expect((await post(env,owner,a,'https://evil.example')).status).toBe(403)}
 expect((await env.DB.prepare('SELECT count(*) AS n FROM admin_audit').first<{n:number}>())!.n).toBe(0);expect(calls).toHaveLength(0);
 for(const admin of ['',undefined,'*'])expect((await post({...env,ADMIN_LOGINS:admin},owner,actions[0])).status).toBe(403);
});
it('each successful control writes exactly one audit row; view begins read-only and write mode is separate',async()=>{
 const {env,owner,calls}=await fixture();let cookie=owner;
 for(const a of actions){const r=await post(env,cookie,a);expect(r.status).toBe(200);if(a.action==='view'){
  cookie+='; '+r.headers.get('set-cookie')!.split(';')[0];
  const view=await readAdminView(env,new Request(url,{headers:{cookie}}));expect(view).toMatchObject({writable:false,login:'player',repo:'fixture/repo'});
  for(const path of ['/api/me/prefs','/api/repos/fixture/repo/runner/jobs'])expect((await app.fetch(new Request(url+path,{method:'POST',headers:{cookie,origin:url},body:'{}'}),env)).status).toBe(403);
 }
 }
 const rows=(await env.DB.prepare('SELECT * FROM admin_audit').all<{action:string;detail_json:string}>()).results;
 expect(rows).toHaveLength(actions.length);expect(rows.every(r=>JSON.parse(r.detail_json).status==='complete')).toBe(true);expect(calls).toEqual([['fast-forward',{}],['autonomy',{level:'build'}],['reset-factory',{}]]);
 expect(await adminPaused(env.DB,'fixture/repo')).toBe(true);expect(await adminPaused(env.DB,'elsewhere/repo')).toBe(true);
 expect((await runQuotaStatus(env,'player')).limit).toBe(0);
 expect((await env.DB.prepare('SELECT daily_nano_usd FROM spark_factory_budgets WHERE repo=?').bind('fixture/repo').first())).toBeNull(); // no payer assigned by this fixture
 const r=await app.fetch(new Request(url+'/admin/god/state',{headers:{cookie:owner}}),env);expect((await r.json() as any).audit).toHaveLength(actions.length);
});
it('view is bound to the real admin session, current role and target membership',async()=>{
 const {env,owner,player}=await fixture();const r=await post(env,owner,actions[0]);const viewCookie=r.headers.get('set-cookie')!.split(';')[0];
 const req=(cookie:string)=>new Request(url,{headers:{cookie}});
 expect(await readAdminView(env,req(player+'; '+viewCookie))).toBeNull();
 const other=await signedInCookie(env,'operator',[],1);
 expect(await readAdminView(env,req(other+'; '+viewCookie))).toBeNull();
 expect(await readAdminView({...env,ADMIN_LOGINS:'*'},req(owner+'; '+viewCookie))).toBeNull();
 await env.DB.prepare('DELETE FROM user_repos WHERE user_id=2').run();expect(await readAdminView(env,req(owner+'; '+viewCookie))).toBeNull();
});
it('reset needs the exact repo confirmation and unknown users/factories cannot become views',async()=>{
 const {env,owner}=await fixture();expect((await post(env,owner,{...actions[5],confirm:'other/repo'})).status).toBe(400);
 expect((await post(env,owner,{action:'view',user:'outsider',repo:'fixture/repo'})).status).toBe(403);
 expect((await post(env,owner,{action:'view',user:'missing',repo:'fixture/repo'})).status).toBe(404);
 expect((await post(env,owner,{action:'view',user:'player',repo:'other/repo'})).status).toBe(404);
});
it('scoped kill switch stops Spark before reserving a paid call, global stop covers every repo',async()=>{
 const {env,owner}=await fixture();
 await post(env,owner,{action:'pause',repo:'fixture/repo',paused:true});
 await expect(reserveSpark({...env,budgetRepo:'fixture/repo'},'user:2',1)).rejects.toThrow('Administrator paused');
 expect(await adminPaused(env.DB,'other/repo')).toBe(false);
 await post(env,owner,{action:'pause',paused:true});expect(await adminPaused(env.DB,'other/repo')).toBe(true);
 await post(env,owner,{action:'pause',paused:false});expect(await adminPaused(env.DB,'other/repo')).toBe(false);expect(await adminPaused(env.DB,'fixture/repo')).toBe(true);
});
