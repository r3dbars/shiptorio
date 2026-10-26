// Real Worker + D1/KV/DO check. Run against npm run dev; creates an isolated demo factory.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import WebSocket from "ws";
const base = new URL(process.env.SMOKE_URL || "http://localhost:8787");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Smoke checks only run locally");
const repo = `demo/smoke-${randomUUID()}`;
const endpoint = new URL(`/api/repos/${repo}/factory`, base);
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
}
assert.equal((await request(endpoint)).status, 401);
const login = await request(new URL("/auth/login",base), {redirect:"manual"});
assert.equal(login.status,302);
const cookie = login.headers.get("set-cookie").split(";")[0];
const headers = {cookie,"content-type":"application/json"};
let res = await request(endpoint,{headers});
assert.equal(res.status,200);
assert.deepEqual((await res.json()).factory.items,[]);
const ws = new WebSocket(endpoint.href.replace(/^http/,'ws'), {headers:{cookie}});
const first = once(ws,"message",{signal:AbortSignal.timeout(10000)});
await once(ws,"open",{signal:AbortSignal.timeout(10000)});
assert.equal(JSON.parse(String((await first)[0])).type,"snapshot");
try {
  const machine = {id:"smoke",kind:"assembler",position:{x:0,y:0},harness:"codex",powerSource:"solar",modules:[]};
  const update = once(ws,"message",{signal:AbortSignal.timeout(10000)});
  ws.send(JSON.stringify({type:"place_machine",machine}));
  const patch = JSON.parse(String((await update)[0]));
  assert.equal(patch.type,"patch"); assert.equal(patch.baseRevision,0); assert.equal(patch.revision,1);
  res = await request(endpoint,{headers});
  assert.equal((await res.json()).factory.machines[0].id,"smoke");
  res = await request(endpoint,{method:"POST",headers:{...headers,origin:"https://other.example"},body:JSON.stringify({type:"remove_machine",machineId:"smoke"})});
  assert.equal(res.status,403);
  res = await request(endpoint,{method:"POST",headers,body:JSON.stringify({type:"connect_belt",belt:{id:"b",from:"smoke",to:"missing"}})});
  assert.equal(res.status,409);
  const vars=readFileSync(".dev.vars","utf8");
  const secret=(vars.match(/^GITHUB_WEBHOOK_SECRET=(.*)$/m)?.[1]??"").trim().replace(/^(["'])(.*)\1$/, "$2");
  const body=JSON.stringify({action:"opened",installation:{id:1},repository:{full_name:repo},issue:{number:42,title:"Smoke issue"}});
  const webhook=new URL("/webhooks/github",base);
  const signature="sha256="+createHmac("sha256",secret).update(body).digest("hex");
  assert.equal((await request(webhook,{method:"POST",headers:{"x-github-event":"issues","x-hub-signature-256":"sha256=bad"},body})).status,401);
  for(let i=0;i<2;i++) assert.equal((await request(webhook,{method:"POST",headers:{"x-github-event":"issues","x-hub-signature-256":signature},body})).status,200);
  const state=(await (await request(endpoint,{headers})).json()).factory;
  assert.equal(state.items.length,1); assert.equal(state.items[0].state,"ore"); assert.equal(state.revision,2);
  console.log("PASS: auth, origin enforcement, Durable Object state, WebSocket snapshot/patch, command rejection, signed issue ingestion and webhook deduplication");
} finally { ws.close(); }
