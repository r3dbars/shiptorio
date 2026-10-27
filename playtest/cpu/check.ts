// Real private entry + D1 + Factory/Provider DOs in workerd. No live resources.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { delegateTestRequest } from "../../server/src/test-delegation.ts";
const root = process.env.SHIPTORIO_CHECK_ROOT ?? resolve(import.meta.dirname, "../.."), server = join(root, "server");
const require = createRequire(join(server, "package.json")), wrangler = require("wrangler");
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve("wrangler"))("miniflare");
const dir = mkdtempSync(join(tmpdir(), "shiptorio-staging-check-")), key = randomBytes(32).toString("hex");
const config = join(dir,"wrangler.json");
writeFileSync(config, JSON.stringify({ name:"shiptorio-fixture", main:join(root,"playtest/cpu/worker.ts"), compatibility_date:"2026-10-01", compatibility_flags:["nodejs_compat"], durable_objects:{bindings:[{name:"FACTORY",class_name:"Factory"},{name:"FIXTURE_PROVIDERS",class_name:"FixtureProvider"}]}, migrations:[{tag:"v1",new_sqlite_classes:["Factory","FixtureProvider"]}] }));
execFileSync("node", [join(server,"node_modules/wrangler/wrangler-dist/cli.js"),"deploy","--config",config,"--dry-run","--outdir",dir], {cwd:root,stdio:"pipe"});
const {privateKey}=generateKeyPairSync("rsa", {modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
const base = wrangler.unstable_getMiniflareWorkerOptions(config).workerOptions;
let outbound = 0;
const mf = new Miniflare(convertV4MiniflareOptions({port:0,workers:[{name:"shiptorio-fixture",rootPath:dir,modules:true,scriptPath:join(dir,"worker.js"),compatibilityDate:"2026-10-01",compatibilityFlags:["nodejs_compat"],durableObjects:base.durableObjects,d1Databases:["DB"],kvNamespaces:["CACHE"],bindings:{PUBLIC_URL:"https://shiptorio.dev",TEST_USERS:"on",TEST_FACTORY_KEY:key,FIXTURE_INSTANCE:"shiptorio-fixture",SESSION_SECRET:"private-fixture",APP_PASSWORD:"private-preview",ALLOWED_LOGINS:"",GITHUB_APP_ID:"1",GITHUB_APP_PRIVATE_KEY:privateKey,GITHUB_WEBHOOK_SECRET:"fixture-hook",GITHUB_CLIENT_ID:"fixture",GITHUB_CLIENT_SECRET:"fixture",GITHUB_APP_SLUG:"shiptorio-stub",META_API_KEY:"fixture",SPARK_BASE_URL:"https://api.meta.ai/v1",SPARK_MODEL:"muse-spark-1.3"},outboundService:()=>{outbound++;throw new Error("Native egress forbidden");}},{name:"cpu-driver",modules:[{type:"ESModule",path:"driver.js",contents:'export default {async fetch(request,env) {return Response.json(await env.PRIVATE.probe(await request.json()));}}'}],compatibilityDate:"2026-10-01",serviceBindings:{PRIVATE:"shiptorio-fixture"}}]}));
const assert=(condition:unknown, message:string)=>{if(!condition)throw new Error(message);};
try {
 await mf.ready;
 const db=await mf.getD1Database("DB","shiptorio-fixture");
 const driver=await mf.getWorker("cpu-driver");
 for(const file of readdirSync(join(server,"migrations")).filter(f=>f.endsWith(".sql")).sort())await db.batch(wrangler.unstable_splitSqlQuery(readFileSync(join(server,"migrations",file),"utf8")).filter((s:string)=>s.trim()).map((s:string)=>db.prepare(s)));
 const user={id:-9001,login:"test-newbie"};
 const call=async(path:string,method="GET")=>{const req=await delegateTestRequest(new Request("https://shiptorio.dev"+path,{method,headers:method==="POST"?{origin:"https://shiptorio.dev"}:{}}),user,key);return mf.dispatchFetch(req.url,{method:req.method,redirect:"manual",headers:Object.fromEntries(req.headers),body:req.body===null?undefined:await req.text()});};
 assert((await mf.dispatchFetch("https://shiptorio.dev/api/repos/test-fixture/test-newbie/cpu-probe",{method:"POST",body:"{}"})).status===403,"Public probe must be denied");
 await call("/api/repos");
 await call("/test/install");
 const installed=await call("/test/install?confirm=1","POST");
 assert([302,303].includes(installed.status),"Fixture installation rejected (status " + installed.status + ")");
 for(let n=0;n<100;n++) {if(await db.prepare("SELECT 1 FROM repos WHERE repo_id=999001").first())break;if(n===99)throw new Error("Fixture install did not settle");await new Promise(r=>setTimeout(r,50));}
 const runId=crypto.randomUUID();
 const probe=async(input:Record<string,unknown>)=>{
   const response=await driver.fetch("http://local.invalid",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId,...input})});
   const result=await response.json() as any;
   const serialized=JSON.stringify(result);
   for(const secret of [key,"private-fixture","private-preview","fixture-hook","Bearer ","shiptorio_session=","sha256="])assert(!serialized.includes(secret),"Probe leaked credentials");
   return result;
 };
 assert((await probe({action:"sample",operation:"heartbeat",sample:0})).ok===false,"Unprepared sample admitted");
 const prepared=await probe({action:"prepare",until:Date.now()+20*60000});
 assert(prepared.ok===true,"CPU preparation failed");
 for(const operation of ["heartbeat","claim","webhook"]) {
   const result=await probe({action:"sample",operation,sample:0});
   assert(result.ok===true && result.status===(operation==="webhook"?202:200),"Real app route failed: "+operation);
   assert((await probe({action:"sample",operation,sample:0})).ok===false,"Replay sample admitted");
 }
 assert((await probe({action:"sample",operation:"tick",sample:0})).scheduled===true,"Real alarm was not scheduled");
 let completed=false;
 for(let n=0;n<100;n++) {const status=await probe({action:"status"});if(status.completed===0){assert(status.tick>=1,"Real tick did not advance");completed=true;break;}await new Promise(r=>setTimeout(r,50));}
 assert(completed,"Real alarm did not complete");
 assert((await probe({action:"sample",operation:"claim",sample:1})).ok===true,"Tick created an approved runner job");
 assert((await probe({action:"sample",operation:"webhook",sample:300})).ok===false,"Unbounded sample admitted");
 assert((await probe({action:"sample",operation:"heartbeat",sample:1,authorization:"canary"})).ok===false,"Unknown probe field admitted");
 assert((await probe({action:"end"})).ok===true,"CPU cleanup failed");
 assert((await probe({action:"sample",operation:"heartbeat",sample:1})).ok===false,"Ended run admitted");
 assert(outbound===0,"Native provider egress occurred");
 console.log("PASS: private safe-argument RPC, public denial, real signed webhook/heartbeat/empty claim and Factory alarm, bounded replay-safe samples, no credential response fields, zero native egress");
} finally {await mf.dispose();}
