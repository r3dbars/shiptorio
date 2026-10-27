import { afterEach, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { testD1, signedInCookie } from "./d1-fixture";
import { requireUser } from "../src/authorization";
import { pairToken } from "../src/runner-auth";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

for (const upstream of [503, 429]) test(`GitHub ${upstream} denies the request but never permanently rejects a valid runner grant`, async () => {
  let repairs = 0, beats = 0, warm = false, calls = 0;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = { DB: testD1(), SESSION_SECRET: "runner-outage-fixture", ALLOWED_LOGINS: "player",
    GITHUB_APP_ID: `runner-outage-${upstream}`, GITHUB_APP_PRIVATE_KEY: privateKey.export({format:"pem",type:"pkcs8"}).toString(),
    CACHE: { get: async (key: string) => warm && key.startsWith("access:") ? {expiresAt: Date.now()+59000} : null, put: async()=>{} },
    FACTORY: { idFromName: (name: string)=>name, get: ()=>({ securityLimit:async()=>({allowed:true,retryAfter:0}),
      isRunnerPaired:async()=>true, rejectRunnerGrant:async()=>{repairs++;}, heartbeatRunner:async()=>{beats++;} }) },
  };
  const cookie = await signedInCookie(env, "player", ["player/repo"], 41);
  const user = await requireUser(new Request("https://shiptorio.com", {headers:{cookie}}), env as never);
  const token = await pairToken(env.SESSION_SECRET, {repo:"player/repo",pairId:"valid-pair",expires:Date.now()+3600000,user:user!});
  globalThis.fetch = (async()=>{ calls++; return Response.json({message:"upstream unavailable"}, {status:upstream,headers:{"retry-after":"0"}}); }) as unknown as typeof fetch;
  const request = ()=>new Request("https://shiptorio.com/api/runner/player/repo/heartbeat", {method:"POST",headers:{authorization:`Bearer ${token}`},body:JSON.stringify({harnesses:["codex"]})});
  const failed = await app.fetch(request(), env);
  expect(failed.status).toBe(503);
  expect((await failed.json() as {code?:string}).code).toBeUndefined();
  expect(repairs).toBe(0); expect(beats).toBe(0); expect(calls).toBeGreaterThan(0);
  warm = true;
  const recovered = await app.fetch(request(), env);
  expect(recovered.status).toBe(200);
  expect(beats).toBe(1); expect(repairs).toBe(0);
});
