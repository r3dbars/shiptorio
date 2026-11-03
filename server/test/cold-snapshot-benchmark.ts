// Run from the repository root: bun build server/test/cold-snapshot-benchmark.ts --target=node --packages=external --outfile=/tmp/cold-snapshot-benchmark.mjs && node /tmp/cold-snapshot-benchmark.mjs
// Real private entry + D1 + Factory/Provider DOs in workerd. No live resources.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { delegateTestRequest } from "../src/test-delegation";
const root = process.env.SHIPTORIO_CHECK_ROOT ?? process.cwd(), server = join(root, "server");
const require = createRequire(join(server, "package.json")), wrangler = require("wrangler");
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve("wrangler"))("miniflare");
const dir = mkdtempSync(join(tmpdir(), "shiptorio-staging-check-")), key = randomBytes(32).toString("hex");
const config = join(dir,"wrangler.json");
writeFileSync(config, JSON.stringify({ name:"shiptorio-fixture", main:join(root,"playtest/staging/worker.ts"), compatibility_date:"2026-10-01", compatibility_flags:["nodejs_compat"], durable_objects:{bindings:[{name:"FACTORY",class_name:"Factory"},{name:"FIXTURE_PROVIDERS",class_name:"FixtureProvider"}]}, migrations:[{tag:"v1",new_sqlite_classes:["Factory","FixtureProvider"]}] }));
execFileSync("node", [join(server,"node_modules/wrangler/wrangler-dist/cli.js"),"deploy","--config",config,"--dry-run","--outdir",dir], {cwd:root,stdio:"pipe"});
const {privateKey}=generateKeyPairSync("rsa", {modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
const base = wrangler.unstable_getMiniflareWorkerOptions(config).workerOptions;
let outbound = 0;
const mf = new Miniflare(convertV4MiniflareOptions({port:0,workers:[{name:"shiptorio-fixture",rootPath:dir,modules:true,scriptPath:join(dir,"worker.js"),compatibilityDate:"2026-10-01",compatibilityFlags:["nodejs_compat"],durableObjects:base.durableObjects,d1Databases:["DB"],kvNamespaces:["CACHE"],bindings:{PUBLIC_URL:"https://shiptorio.dev",TEST_USERS:"on",TEST_FACTORY_KEY:key,FIXTURE_INSTANCE:"shiptorio-fixture",SESSION_SECRET:"private-fixture",APP_PASSWORD:"private-preview",ALLOWED_LOGINS:"",GITHUB_APP_ID:"1",GITHUB_APP_PRIVATE_KEY:privateKey,GITHUB_WEBHOOK_SECRET:"fixture-hook",GITHUB_CLIENT_ID:"fixture",GITHUB_CLIENT_SECRET:"fixture",GITHUB_APP_SLUG:"shiptorio-stub",META_API_KEY:"fixture",SPARK_BASE_URL:"https://api.meta.ai/v1",SPARK_MODEL:"muse-spark-1.3"},outboundService:()=>{outbound++;throw new Error("Native egress forbidden");}}]}));
const assert=(condition:unknown, message:string)=>{if(!condition)throw new Error(message);};
try {
 await mf.ready; const db=await mf.getD1Database("DB");
 for(const file of readdirSync(join(server,"migrations")).filter(f=>f.endsWith(".sql")).sort())await db.batch(wrangler.unstable_splitSqlQuery(readFileSync(join(server,"migrations",file),"utf8")).filter((s:string)=>s.trim()).map((s:string)=>db.prepare(s)));
 const user={id:-9001,login:"test-newbie"};
 const call=async(path:string,method="GET",upgrade=false)=>{
  const req=await delegateTestRequest(new Request("https://shiptorio.dev"+path,{method,headers:{origin:"https://shiptorio.dev",...(upgrade?{upgrade:"websocket"}:{})}}),user,key);
  const headers: Record<string, string> = {}; req.headers.forEach((value, name) => { headers[name] = value; });
  return mf.dispatchFetch(req.url,{method:req.method,redirect:"manual",headers,body:req.body===null?undefined:await req.text()});
 };
 await call("/api/repos"); await call("/test/install?confirm=1","POST");
 for(let n=0;n<30;n++){const r=await call("/api/repos");const data=await r.json() as any;if(data.repos?.length)break;await new Promise(r=>setTimeout(r,100));}
 for(const name of ["cold",...Array.from({length:10},(_,i)=>"warm-"+i)]){
  const started=performance.now(); const response=await call("/api/repos/test-fixture/test-newbie/factory","GET",true);
  assert(response.status===101,"upgrade status "+response.status+" "+await(response.status===101?Promise.resolve(""):response.text()));
  const socket=(response as any).webSocket;
  const frame=await new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error("snapshot timeout")),10000);socket.addEventListener("message",(event:any)=>{const value=JSON.parse(event.data);if(value.type==="snapshot"){clearTimeout(timeout);resolve(value);}});socket.accept();});
  console.log(JSON.stringify({visit:name,firstSnapshotMs:Math.round(performance.now()-started),timing:response.headers.get("server-timing")})); socket.close();
 }
 assert(outbound===0,"unexpected external calls");
}finally{await mf.dispose();rmSync(dir,{recursive:true,force:true});}
