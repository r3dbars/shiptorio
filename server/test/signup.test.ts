import { unlimitedFactory } from "./browser-fixture";
import { afterEach, expect, mock, test } from 'bun:test';
import { signedInCookie, testD1 } from './d1-fixture';
import { admit, signupAllowed, redeemInvite, hash, resourceQuota, runQuota, runQuotaStatus, turnstile, addPending } from '../src/signup';
import { browserSocketAuth, browserSocketActive } from '../src/browser-socket';
mock.module('cloudflare:workers',()=>({DurableObject:class {ctx:unknown;env:unknown;constructor(ctx:unknown,env:unknown){this.ctx=ctx;this.env=env;}}}));
const {testApp:app}=await import('./app-fixture');
const realFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=realFetch;});
const env = () => ({FACTORY:unlimitedFactory,SIGNUP_GATE_MODE:'waitlist',DB:testD1(),SESSION_SECRET:'signup-test-secret',ALLOWED_LOGINS:'r3dbars',ADMIN_LOGINS:'r3dbars',TURNSTILE_SITE_KEY:'public-test',TURNSTILE_SECRET_KEY:'private-test',ASSETS:{fetch:async()=>new Response('factory app')}});
const req=(path:string,cookie='',body?:Record<string,string>,origin='https://shiptorio.com')=>new Request('https://shiptorio.com'+path,{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:body?new URLSearchParams(body):undefined});

test('staging opens the live deck setup by default and preserves explicit routes and production',async()=>{
  const e=env(),cookie=await signedInCookie(e,'r3dbars');
  for(const host of ['shiptorio.dev','www.shiptorio.dev']) {
    const response=await app.fetch(new Request(`https://${host}/`,{headers:{cookie}}),e as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/deck?source=live');
  }
  // Old entry points (the onboarding tour, the live map, sign-in returns to "/") land on the deck too.
  for(const [path,target] of [['/?onboard=repo','/deck?source=live'],['/?source=live&repo=owner/repo','/deck?source=live&repo=owner%2Frepo'],['/deck?source=live&px=0','/deck?source=live']]) {
    const response=await app.fetch(new Request(`https://shiptorio.dev${path}`,{headers:{cookie}}),e as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(target);
  }
  const install=await app.fetch(new Request('https://shiptorio.dev/github/installed',{headers:{cookie}}),e as never);
  expect(install.headers.get('location')).toBe('/deck?source=live');
  for(const url of ['https://shiptorio.com/','https://shiptorio.com/?onboard=repo','https://shiptorio.com/?source=live&repo=owner/repo','https://shiptorio.dev/deck','https://shiptorio.dev/?source=sim&scenario=first-run']) {
    const response=await app.fetch(new Request(url,{headers:{cookie}}),e as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('factory app');
  }
});

test('staging opens on the deck tutorial; its data stays behind the preview password gate',async()=>{
  // Justin 2026-10-29: shiptorio.dev opens straight into the tutorial; the password comes at "create your own factory".
  const e={...env(),SIGNUP_GATE_MODE:'password',APP_PASSWORD:'private-preview'};
  const response=await app.fetch(new Request('https://shiptorio.dev/'),e as never);
  expect(response.headers.get('location')).toBe('/deck?source=live');
  const deck=await app.fetch(new Request('https://shiptorio.dev/deck?source=sim&scenario=deck-watch&watch=1'),e as never);
  expect(deck.status).toBe(200);
  const api=await app.fetch(new Request('https://shiptorio.dev/api/me'),e as never);
  expect(api.status).toBe(401);
});

test('Justin approves pending user from /admin; pending cannot access assets, APIs or admin; revoke takes effect',async()=>{
  const e=env();
  const admin=await signedInCookie(e,'r3dbars');
  const friend=await signedInCookie(e,'new-player');
  await addPending(e as never,'new-player','github');
  expect((await app.fetch(req('/api/repos',friend),e as never)).status).toBe(403);
  expect(await (await app.fetch(req('/',friend),e as never)).text()).toContain('pending approval');
  expect((await app.fetch(req('/admin',friend,{action:'approve',identity:'new-player'}),e as never)).status).toBe(403);
  const approved=await app.fetch(req('/admin',admin,{action:'approve',identity:'new-player'}),e as never);
  expect(approved.status).toBe(302);
  expect(approved.headers.get('location')).toBe('/admin');
  expect(await signupAllowed(e,'new-player')).toBe(true);
  expect(await (await app.fetch(req('/',friend),e as never)).text()).toBe('factory app');
  expect((await app.fetch(req('/api/repos',friend),e as never)).status).toBe(200);
  expect((await app.fetch(req('/admin',admin,{action:'deny',identity:'new-player'},'https://evil.example'),e as never)).status).toBe(403);
  await app.fetch(req('/admin',admin,{action:'deny',identity:'new-player'}),e as never);
  expect(await signupAllowed(e,'new-player')).toBe(false);
  expect((await app.fetch(req('/api/repos',friend),e as never)).status).toBe(403);
});

test('email waitlist does not authenticate an identity; approval requires GitHub linkage; admin values are escaped',async()=>{
  const e=env(),admin=await signedInCookie(e,'r3dbars');
  globalThis.fetch=mock(async()=>Response.json({success:true,hostname:'shiptorio.com',action:'waitlist'})) as unknown as typeof fetch;
  const response=await app.fetch(req('/waitlist','',{email:'person@example.com','cf-turnstile-response':'test'}),e as never);
  expect(response.status).toBe(200);
  expect((await e.DB.prepare('SELECT status FROM signup_waitlist').first<{status:string}>())?.status).toBe('pending');
  expect((await app.fetch(req('/admin',admin,{action:'approve',identity:'person@example.com'}),e as never)).status).toBe(400);
  expect((await app.fetch(req('/admin',admin,{action:'approve',identity:'person@example.com',login:'verified-person'}),e as never)).status).toBe(302);
  expect(await signupAllowed(e,'verified-person')).toBe(true);
  expect((await app.fetch(req('/waitlist','',{email:'person@example.com','cf-turnstile-response':'test'},'https://evil.example'),e as never)).status).toBe(403);
});

test('invite is hashed, expires, and only admits one claimant under concurrent attempts',async()=>{
  const e=env();
  await e.DB.prepare('INSERT INTO signup_invites(digest,expires_at,created_by) VALUES (?,?,?)').bind(await hash('one-secret'),Date.now()+60000,'r3dbars').run();
  const results=await Promise.all(['first','second'].map(login=>redeemInvite(e as never,'one-secret',login)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await signupAllowed(e,'first')).toBe(true);
  expect(await signupAllowed(e,'second')).toBe(false);
  expect(await redeemInvite(e as never,'wrong-secret','third')).toBe(false);
  await e.DB.prepare('INSERT INTO signup_invites(digest,expires_at,created_by) VALUES (?,?,?)').bind(await hash('expired'),Date.now()-1,'r3dbars').run();
  expect(await redeemInvite(e as never,'expired','third')).toBe(false);
});

test('atomic counters enforce global per-user daily quotas and resource caps; windows reset and denial flags admin',async()=>{
  const e=env();
  const admissions=await Promise.all(Array.from({length:12},()=>admit(e as never,'webhook:1',3,60000,'flood',60001)));
  expect(admissions.filter(Boolean)).toHaveLength(3);
  expect(await admit(e as never,'webhook:1',3,60000,'flood',120001)).toBe(true);
  expect((await e.DB.prepare('SELECT hits FROM signup_abuse').first<{hits:number}>())?.hits).toBe(9);
  for (const kind of ['repo','factory'] as const) {
    for (let i=0;i<3;i++) expect(await resourceQuota(e as never,'first',kind,`owner/repo${i}`)).toBe(true);
    expect(await resourceQuota(e as never,'first',kind,'owner/repo0')).toBe(true);
    expect(await resourceQuota(e as never,'first',kind,'owner/repo4')).toBe(false);
    expect(await resourceQuota(e as never,'second',kind,'owner/repo4')).toBe(true);
  }
  await e.DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at) VALUES ('first','r3dbars',0)").run();
  for(let i=0;i<20;i++) expect(await runQuota(e as never,'first')).toBe(true);
  expect(await runQuota(e as never,'first')).toBe(false);
});

test('Turnstile fails closed without secrets, wrong hostname/action, invalid or unreachable verification',async()=>{
  const e=env(),r=req('/waitlist'),form=new URLSearchParams({'cf-turnstile-response':'token'});
  expect(await turnstile(r,{...e,TURNSTILE_SECRET_KEY:undefined} as never,form,'waitlist')).toBe(false);
  for(const result of [{success:false},{success:true,hostname:'evil.example',action:'waitlist'},{success:true,hostname:'shiptorio.com',action:'signin'},{success:true,hostname:'shiptorio.com',action:'waitlist'}]){
    globalThis.fetch=mock(async()=>Response.json(result)) as unknown as typeof fetch;
    expect(await turnstile(r,e as never,form,'waitlist')).toBe(result.action==='waitlist' && result.hostname==='shiptorio.com');
  }
  globalThis.fetch=mock(async()=>{throw new Error('unavailable');}) as unknown as typeof fetch;
  expect(await turnstile(r,e as never,form,'waitlist')).toBe(false);
});

test('approved users upgrade without preview password; revocation stops established socket authorization',async()=>{
  const e=env(),cookie=await signedInCookie(e,'friend');
  await e.DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at) VALUES ('friend','r3dbars',0)").run();
  const auth=await browserSocketAuth(req('/api/repos/owner/repo/factory',cookie),e);
  expect(auth).not.toBeNull();
  expect(await browserSocketActive(auth!,e)).toBe(true);
  await e.DB.prepare("UPDATE signup_allowlist SET enabled=0 WHERE login='friend'").run();
  expect(await browserSocketActive(auth!,e)).toBe(false);
  expect(await browserSocketAuth(req('/api/repos/owner/repo/factory',cookie),e)).toBeNull();
});

test('password fallback remains explicit and does not unlock admin with password alone',async()=>{
  const e={...env(),SIGNUP_GATE_MODE:'password',APP_PASSWORD:'old-preview'};
  expect((await app.fetch(req('/index.html'),e as never)).status).toBe(401);
  expect(await (await app.fetch(req('/index.html'),e as never)).text()).toContain('Password');
});

test('failed runner pairings remain throttled after the old admin page is retired',async()=>{
  const e=env();
  for(let i=0;i<10;i++) expect((await app.fetch(new Request('https://shiptorio.com/api/runner/owner/repo/claim',{method:'POST',headers:{authorization:'Bearer invalid','cf-connecting-ip':'192.0.2.8'}}),e as never)).status).toBe(401);
  expect((await app.fetch(new Request('https://shiptorio.com/api/runner/owner/repo/claim',{method:'POST',headers:{authorization:'Bearer invalid','cf-connecting-ip':'192.0.2.8'}}),e as never)).status).toBe(429);
  const admin=await signedInCookie(e,'r3dbars');
  const page=await app.fetch(req('/admin/signup',admin),e as never);
  expect(page.status).toBe(302);expect(page.headers.get('location')).toBe('/admin');
});

test('Turnstile sign-in has no GET bypass in waitlist mode; missing keys never start OAuth',async()=>{
  const e={...env(),TURNSTILE_SECRET_KEY:undefined};
  const get=await app.fetch(req('/auth/login'),e as never);
  expect(get.headers.get('location')).toBeNull();
  expect(await get.text()).toContain('data-action="signin"');
  expect(get.headers.get('content-security-policy')).toContain('frame-src https://challenges.cloudflare.com');
  const post=await app.fetch(req('/auth/login','',{'cf-turnstile-response':'fake'}),e as never);
  expect(post.status).toBe(403);
  expect(post.headers.get('location')).toBeNull();
});

test('the docs site stays public in waitlist mode; the app and its API do not',async()=>{
  const e=env();
  for (const path of ['/docs/','/docs/faq']) expect(await (await app.fetch(req(path),e as never)).text()).toBe('factory app');
  expect((await app.fetch(req('/api/repos'),e as never)).status).toBe(401);
  expect(await (await app.fetch(req('/art/spark.html'),e as never)).text()).not.toBe('factory app');
});


test('configured owner has uncapped resources and a 200-run floor with no allowlist row', async () => {
  const e = { ...env(), ADMIN_LOGINS: ' Custom-Owner ', ALLOWED_LOGINS: 'custom-owner' };
  for (const kind of ['factory', 'repo'] as const) {
    for (let i = 0; i < 5; i++) expect(await resourceQuota(e as never, 'CUSTOM-OWNER', kind, `org/repo${i}`)).toBe(true);
  }
  expect((await e.DB.prepare("SELECT COUNT(*) AS n FROM signup_resources WHERE login='custom-owner'").first<{n:number}>())?.n).toBe(10);
  expect((await runQuotaStatus(e, 'CUSTOM-OWNER')).limit).toBe(200);
  const bucket = Math.floor(Date.now() / 86400000);
  await e.DB.prepare("INSERT INTO signup_counters VALUES('runs:custom-owner',?,199,?)").bind(bucket, (bucket + 2) * 86400000).run();
  expect(await runQuota(e as never, 'CUSTOM-OWNER')).toBe(true);
  expect(await runQuota(e as never, 'custom-owner')).toBe(false);
  await e.DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at,factories,repos,runs_daily) VALUES('custom-owner','custom-owner',0,0,0,0)").run();
  expect((await runQuotaStatus(e, 'custom-owner')).limit).toBe(200);
  expect(await resourceQuota(e as never, 'custom-owner', 'factory', 'org/extra')).toBe(true);
  await e.DB.prepare("UPDATE signup_allowlist SET runs_daily=500 WHERE login='custom-owner'").run();
  expect((await runQuotaStatus(e, 'custom-owner')).limit).toBe(500);
  // Quota exemption grants neither signup approval nor access after explicit revocation.
  await e.DB.prepare("UPDATE signup_allowlist SET enabled=0 WHERE login='custom-owner'").run();
  expect(await runQuota(e as never, 'custom-owner')).toBe(false);
  expect((await runQuotaStatus({ ...e, ADMIN_LOGINS: '*' }, 'other')).limit).toBe(20);
  expect((await runQuotaStatus({ ...e, ADMIN_LOGINS: 'someone-else' }, 'r3dbars')).limit).toBe(20); // portable migrations never enroll a maintainer
  await e.DB.prepare("DELETE FROM signup_allowlist WHERE login='r3dbars'").run();
  expect((await runQuotaStatus({ ...e, ADMIN_LOGINS: 'someone-else' }, 'r3dbars')).limit).toBe(20);
  expect((await runQuotaStatus({ ...e, ADMIN_LOGINS: undefined }, 'r3dbars')).limit).toBe(20);
});

test('Raise limit opens only the selected account and a native save returns to persisted quotas',async()=>{
  const e=env(), admin=await signedInCookie(e,'r3dbars');
  await e.DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at,factories,repos,runs_daily,spark_calls_daily,spark_tokens_daily) VALUES('quota-player','r3dbars',0,4,5,20,30,4000),('other-account','r3dbars',0,1,1,1,1,1)").run();
  const get=()=>app.fetch(req('/admin/signup?login=quota-player',admin),e as never);
  const page=await get();
  expect(page.status).toBe(200);
  expect(page.headers.get('referrer-policy')).toBe('same-origin');
  expect(page.headers.get('cache-control')).toBe('no-store');
  const html=await page.text();
  expect(html).toContain('Account limits');
  expect(html).toContain('quota-player');
  expect(html).not.toContain('other-account');
  expect(html).not.toContain('Abuse flags');
  expect(html).not.toContain('Create one-use invite');
  expect(html).toContain('name="runs" type="number" min="0" max="99999" value="20"');
  expect(html).toContain('action="/admin/signup?login=quota-player"');
  for(let i=0;i<3;i++) expect(await runQuota(e as never,'quota-player')).toBe(true);
  const saved=await app.fetch(req('/admin/signup?login=quota-player',admin,{action:'limits',login:'quota-player',factories:'6',repos:'7',runs:'25',spark_calls:'50',spark_tokens:'8000'}),e as never);
  expect(saved.status).toBe(303);
  expect(saved.headers.get('location')).toBe('/admin/signup?login=quota-player');
  const refreshed=await (await get()).text();
  expect(refreshed).toContain('name="runs" type="number" min="0" max="99999" value="25"');
  expect(refreshed).toContain('name="factories" type="number" min="0" max="99999" value="6"');
  expect(await runQuotaStatus(e as never,'quota-player')).toMatchObject({used:3,limit:25});
  expect(await e.DB.prepare("SELECT spark_calls_daily,spark_tokens_daily FROM signup_allowlist WHERE login='quota-player'").first()).toEqual({spark_calls_daily:50,spark_tokens_daily:8000});
});

test('focused quota editor keeps admin, Origin and input validation boundaries',async()=>{
  const e=env(), admin=await signedInCookie(e,'r3dbars'), player=await signedInCookie(e,'player');
  expect((await app.fetch(req('/admin/signup?login=player',player),e as never)).status).toBe(403);
  expect((await app.fetch(req('/admin/signup?login=player'),e as never)).status).toBe(403);
  const form={action:'limits',login:'player',runs:'25'};
  expect((await app.fetch(req('/admin/signup?login=player',admin,form,'https://evil.example'),e as never)).status).toBe(403);
  expect((await app.fetch(req('/admin/signup?login=player',admin,{...form,spark_calls:'bad',spark_tokens:'10'}),e as never)).status).toBe(400);
  expect(await e.DB.prepare("SELECT 1 FROM signup_allowlist WHERE login='player'").first()).toBeNull();
  const invalid=await app.fetch(req('/admin/signup?login=%22%3E%3Cscript%3E',admin),e as never);
  expect(invalid.status).toBe(302);expect(invalid.headers.get('location')).toBe('/admin');
});

test('quota save updates existing effective overrides and blank Spark values restore defaults',async()=>{
  const {accountBudgetLimits,budgetLimits}=await import('../src/budget');
  const e=env(), admin=await signedInCookie(e,'r3dbars');
  await signedInCookie(e,'quota-player');
  const user=await e.DB.prepare("SELECT id FROM users WHERE login='quota-player'").first<{id:number}>();
  await e.DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at,runs_daily,spark_calls_daily,spark_tokens_daily) VALUES('quota-player','r3dbars',0,100,200,3000)").run();
  await e.DB.prepare('INSERT INTO admin_user_limits(user_id,runs,spark_calls,spark_tokens) VALUES(?,5,7,900)').bind(user!.id).run();
  const page=await (await app.fetch(req('/admin/signup?login=quota-player',admin),e as never)).text();
  expect(page).toContain('name="runs" type="number" min="0" max="99999" value="5"');
  expect(page).toContain('name="spark_calls" type="number" min="0" max="999999999" value="7"');
  expect(page).toContain('name="spark_tokens" type="number" min="0" max="999999999" value="900"');
  for(let i=0;i<3;i++) expect(await runQuota(e as never,'quota-player')).toBe(true);
  const save=(calls:string,tokens:string)=>app.fetch(req('/admin/signup?login=quota-player',admin,{action:'limits',login:'quota-player',runs:'25',spark_calls:calls,spark_tokens:tokens}),e as never);
  expect((await save('40','5000')).status).toBe(303);
  expect(await e.DB.prepare('SELECT runs,spark_calls,spark_tokens FROM admin_user_limits WHERE user_id=?').bind(user!.id).first()).toEqual({runs:25,spark_calls:40,spark_tokens:5000});
  expect(await runQuotaStatus(e as never,'quota-player')).toMatchObject({used:3,limit:25});
  expect(await accountBudgetLimits(e as never,`user:${user!.id}`)).toMatchObject({calls:40,tokens:5000});
  expect((await save('','')).status).toBe(303);
  expect(await e.DB.prepare('SELECT spark_calls,spark_tokens FROM admin_user_limits WHERE user_id=?').bind(user!.id).first()).toEqual({spark_calls:null,spark_tokens:null});
  expect(await e.DB.prepare("SELECT spark_calls_daily,spark_tokens_daily FROM signup_allowlist WHERE login='quota-player'").first()).toEqual({spark_calls_daily:null,spark_tokens_daily:null});
  const defaults=budgetLimits(e as never);
  expect(await accountBudgetLimits(e as never,`user:${user!.id}`)).toMatchObject({calls:defaults.calls,tokens:defaults.tokens});
});

test('quota editor preserves the owner floor unless an explicit existing run override applies',async()=>{
  const e=env(), admin=await signedInCookie(e,'r3dbars');
  const user=await e.DB.prepare("SELECT id FROM users WHERE login='r3dbars'").first<{id:number}>();
  await e.DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at,runs_daily) VALUES('r3dbars','r3dbars',0,20)").run();
  await e.DB.prepare('INSERT INTO admin_user_limits(user_id,runs,spark_calls,spark_tokens) VALUES(?,NULL,NULL,NULL)').bind(user!.id).run();
  const get=async()=> (await app.fetch(req('/admin/signup?login=r3dbars',admin),e as never)).text();
  const save=(runs:string)=>app.fetch(req('/admin/signup?login=r3dbars',admin,{action:'limits',login:'r3dbars',runs,spark_calls:'',spark_tokens:''}),e as never);
  expect(await get()).toContain('name="runs" type="number" min="0" max="99999" value="200"');
  expect((await save('25')).status).toBe(303);
  expect(await e.DB.prepare('SELECT runs FROM admin_user_limits WHERE user_id=?').bind(user!.id).first()).toEqual({runs:null});
  expect(await runQuotaStatus(e as never,'r3dbars')).toMatchObject({limit:200});
  expect((await save('250')).status).toBe(303);
  expect(await runQuotaStatus(e as never,'r3dbars')).toMatchObject({limit:250});
  await e.DB.prepare('UPDATE admin_user_limits SET runs=40 WHERE user_id=?').bind(user!.id).run();
  expect(await get()).toContain('name="runs" type="number" min="0" max="99999" value="40"');
  expect((await save('50')).status).toBe(303);
  expect(await runQuotaStatus(e as never,'r3dbars')).toMatchObject({limit:50});
});
