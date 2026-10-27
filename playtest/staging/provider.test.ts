import { expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx:unknown, public env:unknown) {} } }));
const { FixtureRuntime } = await import("./provider");
import { testD1 } from "../../server/test/d1-fixture";
import { createSession } from "../../server/src/accounts";
import { seedTestUser } from "../../server/src/test-users";
import { personaId, personaRepo, type TestPersona } from "../../server/src/test-users-policy";
import { readRunnerToken } from "../../server/src/runner-auth";
import type { FixtureEnv } from "./env";

class MemoryStorage {
  values = new Map<string,unknown>(); alarm: number | null = null;
  async get<T>(key:string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key:string,value:unknown) { this.values.set(key,structuredClone(value)); }
  async setAlarm(at:number|Date) { this.alarm=Number(at); }
  async deleteAlarm() { this.alarm=null; }
}
function setup(persona:TestPersona="test-midgame") {
  const storage=new MemoryStorage(), events:string[]=[], calls:{action:string;body:any;authorization:string|null}[]=[];
  const methods:string[]=[];
  const env={FIXTURE_INSTANCE:"shiptorio-fixture",TEST_USERS:"on",PUBLIC_URL:"https://shiptorio.dev", DB:testD1(), SESSION_SECRET:"fixture-session-secret",GITHUB_WEBHOOK_SECRET:"fixture-webhook-secret",ALLOWED_LOGINS:"",FACTORY:{idFromName:(s:string)=>s,get:()=>({observedCall:async(method:string,args:any[],trace:any)=>{methods.push(method);expect(trace.repo).toBe(personaRepo(persona));expect(trace.userId).toBe(`github:user:${personaId(persona)}`);return method==="pairRunner"?"fixture-pair":undefined;}})}} as unknown as FixtureEnv;
  const job={id:"00000000-0000-4000-8000-000000000001",repo:personaRepo(persona),branch:"shiptorio/runner-00000000-0000-4000-8000-000000000001",baseSha:"a".repeat(40),lease:"fixture-lease",allowedPaths:["src/cart.ts","test/cart.test.ts"]};
  const worker=async(request:Request)=>{
    const path=new URL(request.url).pathname;
    if(path==="/webhooks/github") { events.push(request.headers.get("x-github-event")!); expect(await storage.get("fixture")).toBeDefined(); const body=await request.text(); expect(request.headers.get("x-hub-signature-256")).toBe(`sha256=${createHmac("sha256",env.GITHUB_WEBHOOK_SECRET).update(body).digest("hex")}`); return Response.json({ok:true}); }
    const action=path.split("/").at(-1)!;
    calls.push({action,body:await request.json(),authorization:request.headers.get("authorization")});
    return Response.json(action==="claim"?{job}:{ok:true});
  };
  const request=(path:string,method="GET",body?:unknown,p=persona)=>new Request(path,{method,headers:{"x-test-persona":p,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const runtime=new FixtureRuntime(storage as any,env,worker);
  const cookie=async()=>{await seedTestUser(env,persona);return (await createSession(env,{id:personaId(persona),login:persona},null)).split(";")[0]!;};
  return {storage,env,runtime,worker,request,cookie,events,calls,methods,job};
}
test("fixture providers fail closed outside staging and reject unknown destinations/personas",async()=>{
  for(const change of [{PUBLIC_URL:"https://shiptorio.com"},{PUBLIC_URL:"invalid"},{TEST_USERS:"off"},{FIXTURE_INSTANCE:"other"}]) {
    const f=setup();Object.assign(f.env,change);expect((await f.runtime.fetch(f.request("https://api.github.com/user"))).status).toBe(404);expect(f.storage.values.size).toBe(0);
  }
  const f=setup();expect((await f.runtime.fetch(f.request("https://example.com/steal"))).status).toBe(599);
  expect((await f.runtime.fetch(f.request("https://api.github.com/user","GET",undefined,"test-blocked"))).status).toBe(403);
  expect((await f.runtime.fetch(f.request("https://api.meta.ai/not-chat","POST",{}))).status).toBe(599);
  expect(f.calls).toHaveLength(0);
});
test("fixture install stays on staging, delivers signed webhook, and survives DO eviction",async()=>{
  const f=setup("test-newbie");
  const page=await f.runtime.fetch(f.request("http://fixture.internal/install"));
  expect(await page.text()).toContain('action="/test/install?confirm=1"');
  expect((await f.runtime.fetch(f.request("http://fixture.internal/install?confirm=1"))).status).toBe(405);
  const installed=await f.runtime.fetch(f.request("http://fixture.internal/install?confirm=1","POST"));
  expect(installed.headers.get("location")).toBe("https://shiptorio.dev/?source=live&onboard=repo");
  expect(f.events).toEqual(["installation"]);
  const saved=await f.storage.get<any>("fixture");expect(saved.github.installation).toBe(18001);
  const restored=new FixtureRuntime(f.storage as any,f.env,f.worker);
  const response=await restored.fetch(f.request("https://api.github.com/app/installations/18001"));
  expect(response.ok).toBe(true);expect((await response.json() as any).id).toBe(18001);
});
test("fixture runner requires its own live session and pairs only once across concurrent starts",async()=>{
  const f=setup();
  expect((await f.runtime.fetch(f.request("http://fixture.internal/start","POST",{cookie:"bad"}))).status).toBe(403);
  const cookie=await f.cookie();
  const other=(await createSession(f.env,{id:personaId("test-blocked"),login:"test-blocked"},null)).split(";")[0];
  expect((await f.runtime.fetch(f.request("http://fixture.internal/start","POST",{cookie:other}))).status).toBe(403);
  const before=Date.now();
  const starts=await Promise.all([1,2].map(()=>f.runtime.fetch(f.request("http://fixture.internal/start","POST",{cookie}))));
  expect(starts.every(r=>r.ok)).toBe(true);expect(f.methods).toEqual(["ensure","pairRunner"]);
  const saved=await f.storage.get<any>("fixture");expect(JSON.stringify(saved)).not.toContain(cookie);
  expect(saved.runner.until).toBeGreaterThanOrEqual(before+600000);expect(saved.runner.until).toBeLessThanOrEqual(Date.now()+600000);
  const identity=await readRunnerToken(f.env.SESSION_SECRET,saved.runner.token);expect(identity?.repo).toBe(personaRepo("test-midgame"));expect(identity?.user?.id).toBe(-9003);
});
test("fixture runner persists one receipt, completes checks and never claims a second job",async()=>{
  const f=setup();const cookie=await f.cookie();await f.runtime.fetch(f.request("http://fixture.internal/start","POST",{cookie}));
  await f.runtime.alarm();
  const saved=await f.storage.get<any>("fixture");expect(saved.runner.completed).toBe(true);expect(saved.github.checks).toBe("success");
  expect(f.calls.map(c=>c.action)).toEqual(["heartbeat","claim","finish"]);expect(f.events).toEqual(["check_suite"]);
  const receipt=f.calls.find(c=>c.action==="finish")!.body;expect(receipt.proof.logTail).toContain("FIXTURE ONLY");expect(receipt.proof.failsOnBase).toBe(true);expect(receipt.sha).toBe("b".repeat(40));
  const restored=new FixtureRuntime(f.storage as any,f.env,f.worker);await restored.alarm();expect(f.calls.filter(c=>c.action==="claim")).toHaveLength(1);
  saved.runner.until=Date.now()-1;await f.storage.put("fixture",saved);const expired=new FixtureRuntime(f.storage as any,f.env,f.worker);await expired.alarm();expect(f.storage.alarm).toBeNull();
});
test("fixture runner refuses jobs outside the fixed fixture diff scope",async()=>{
  const f=setup();f.job.allowedPaths.push("server/src/index.ts");await f.runtime.fetch(f.request("http://fixture.internal/start","POST",{cookie:await f.cookie()}));await f.runtime.alarm();
  expect(f.calls.some(c=>c.action==="finish")).toBe(false);expect((await f.storage.get<any>("fixture")).runner.error).toContain("could not advance");
});
