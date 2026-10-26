import { unlimitedFactory } from "./browser-fixture";
import { afterEach, expect, mock, test } from 'bun:test';
import { signedInCookie, testD1 } from './d1-fixture';
import { admit, signupAllowed, redeemInvite, hash, resourceQuota, runQuota, turnstile, addPending } from '../src/signup';
import { browserSocketAuth, browserSocketActive } from '../src/browser-socket';
mock.module('cloudflare:workers',()=>({DurableObject:class {ctx:unknown;env:unknown;constructor(ctx:unknown,env:unknown){this.ctx=ctx;this.env=env;}}}));
const {default:app}=await import('../src/index');
const realFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=realFetch;});
const env = () => ({FACTORY:unlimitedFactory,SIGNUP_GATE_MODE:'waitlist',DB:testD1(),SESSION_SECRET:'signup-test-secret',ALLOWED_LOGINS:'r3dbars',ADMIN_LOGINS:'r3dbars',TURNSTILE_SITE_KEY:'public-test',TURNSTILE_SECRET_KEY:'private-test',ASSETS:{fetch:async()=>new Response('factory app')}});
const req=(path:string,cookie='',body?:Record<string,string>,origin='https://shiptorio.com')=>new Request('https://shiptorio.com'+path,{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:body?new URLSearchParams(body):undefined});

test('Justin approves pending user from /admin; pending cannot access assets, APIs or admin; revoke takes effect',async()=>{
  const e=env();
  const admin=await signedInCookie(e,'r3dbars');
  const friend=await signedInCookie(e,'new-player');
  await addPending(e as never,'new-player','github');
  expect((await app.fetch(req('/api/repos',friend),e as never)).status).toBe(403);
  expect(await (await app.fetch(req('/',friend),e as never)).text()).toContain('pending approval');
  expect((await app.fetch(req('/admin',friend,{action:'approve',identity:'new-player'}),e as never)).status).toBe(403);
  const approved=await app.fetch(req('/admin',admin,{action:'approve',identity:'new-player'}),e as never);
  expect(approved.status).toBe(200);
  expect(await approved.text()).toContain('access approved');
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
  expect((await app.fetch(req('/admin',admin,{action:'approve',identity:'person@example.com',login:'verified-person'}),e as never)).status).toBe(200);
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

test('failed runner pairings throttle and surface on admin without calling a factory',async()=>{
  const e=env();
  for(let i=0;i<10;i++) expect((await app.fetch(new Request('https://shiptorio.com/api/runner/owner/repo/claim',{method:'POST',headers:{authorization:'Bearer invalid','cf-connecting-ip':'192.0.2.8'}}),e as never)).status).toBe(401);
  expect((await app.fetch(new Request('https://shiptorio.com/api/runner/owner/repo/claim',{method:'POST',headers:{authorization:'Bearer invalid','cf-connecting-ip':'192.0.2.8'}}),e as never)).status).toBe(429);
  const admin=await signedInCookie(e,'r3dbars');
  const page=await app.fetch(req('/admin/signup',admin),e as never);
  expect(await page.text()).toContain('repeated failed runner authentication');
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
