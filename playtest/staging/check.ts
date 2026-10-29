// Real private entry + D1 + Factory/Provider DOs in workerd. No live resources.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { verifyPrivateLoop } from "./loop";
import { FIXTURE_PROVIDER_VALUES } from "./env";
import { delegateTestRequest } from "../../server/src/test-delegation.ts";
const root = process.env.SHIPTORIO_CHECK_ROOT ?? resolve(import.meta.dirname, "../.."), server = join(root, "server");
const require = createRequire(join(server, "package.json")), wrangler = require("wrangler");
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve("wrangler"))("miniflare");
const dir = mkdtempSync(join(tmpdir(), "shiptorio-staging-check-")), key = randomBytes(32).toString("hex");
const config = join(dir,"wrangler.json");
writeFileSync(config, JSON.stringify({ name:"shiptorio-fixture", main:join(root,"playtest/staging/worker.ts"), compatibility_date:"2026-10-01", compatibility_flags:["nodejs_compat"], durable_objects:{bindings:[{name:"FACTORY",class_name:"Factory"},{name:"FIXTURE_PROVIDERS",class_name:"FixtureProvider"}]}, migrations:[{tag:"v1",new_sqlite_classes:["Factory","FixtureProvider"]}] }));
execFileSync("node", [join(server,"node_modules/wrangler/wrangler-dist/cli.js"),"deploy","--config",config,"--dry-run","--outdir",dir], {cwd:root,stdio:"pipe"});
const {privateKey}=generateKeyPairSync("rsa", {modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
const base = wrangler.unstable_getMiniflareWorkerOptions(config).workerOptions;
let outbound = 0;
const mf = new Miniflare(convertV4MiniflareOptions({port:0,workers:[{name:"shiptorio-fixture",rootPath:dir,modules:true,scriptPath:join(dir,"worker.js"),compatibilityDate:"2026-10-01",compatibilityFlags:["nodejs_compat"],durableObjects:base.durableObjects,d1Databases:["DB"],kvNamespaces:["CACHE"],bindings:{PUBLIC_URL:"https://shiptorio.dev",TEST_USERS:"on",TEST_FACTORY_KEY:key,FIXTURE_INSTANCE:"shiptorio-fixture",SESSION_SECRET:"private-fixture",APP_PASSWORD:"private-preview",ALLOWED_LOGINS:"",GITHUB_APP_ID:"1",GITHUB_APP_PRIVATE_KEY:privateKey,GITHUB_WEBHOOK_SECRET:"fixture-hook",GITHUB_CLIENT_ID:"fixture",GITHUB_CLIENT_SECRET:FIXTURE_PROVIDER_VALUES.GITHUB_CLIENT_SECRET,GITHUB_APP_SLUG:"shiptorio-stub",META_API_KEY:FIXTURE_PROVIDER_VALUES.META_API_KEY,SPARK_BASE_URL:"https://api.meta.ai/v1",SPARK_MODEL:"muse-spark-1.3"},outboundService:()=>{outbound++;throw new Error("Native egress forbidden");}}]}));
const assert=(condition:unknown, message:string)=>{if(!condition)throw new Error(message);};
try {
 await mf.ready; const db=await mf.getD1Database("DB");
 for(const file of readdirSync(join(server,"migrations")).filter(f=>f.endsWith(".sql")).sort())await db.batch(wrangler.unstable_splitSqlQuery(readFileSync(join(server,"migrations",file),"utf8")).filter((s:string)=>s.trim()).map((s:string)=>db.prepare(s)));
 const user={id:-9001,login:"test-newbie"};
 const call=async(path:string,method="GET",upgrade=false)=>{const req=await delegateTestRequest(new Request("https://shiptorio.dev"+path,{method,headers:{origin:"https://shiptorio.dev",...(upgrade?{upgrade:"websocket"}:{})}}),user,key);return mf.dispatchFetch(req.url, {method:req.method,redirect:"manual",headers:Object.fromEntries(req.headers),body:req.body===null?undefined:await req.text()});};
 const denied = await mf.dispatchFetch("https://shiptorio.dev/api/repos"); assert(denied.status===403,"Unsigned status "+denied.status+": "+await denied.text());
 let r=await call("/api/repos");assert(r.ok,"Newbie inventory failed: "+r.status);assert((await r.json() as any).repos.length===0,"Newbie should start empty");
 r=await call("/test/install");assert(r.ok && (await r.text()).includes("/test/install?confirm=1"),"Fixture install form missing");
 r=await call("/test/install?confirm=1","POST");assert(r.status===302 || r.status===303,"Fixture install failed: "+r.status);
 for(let n=0;n<30;n++){r=await call("/api/repos"); const data=await r.json() as any; if(data.repos?.some((x:any)=>(x.full_name??x.fullName)==="test-fixture/test-newbie"))break;if(n===29)throw new Error("Signed fixture webhook did not populate inventory");await new Promise(r=>setTimeout(r,100));}
 r=await call("/api/repos/test-fixture/test-newbie/runner/status");assert(r.ok,"Fixture runner failed: "+r.status);
 await verifyPrivateLoop(()=>call("/api/repos/test-fixture/test-newbie/factory","GET",true));
 console.log("PASS: private alarm-driven runner carried issue1 through approved build and launch");
 await db.prepare("INSERT OR REPLACE INTO spark_usage(account,day,calls,tokens) VALUES('user:-9001','fixture-day',7,700)").run();
 await db.prepare("INSERT OR REPLACE INTO spark_usage(account,day,calls,tokens) VALUES('user:42','fixture-day',9,900)").run();
 for(let n=0;n<120;n++){r=await call("/test/reset","POST");if(r.status!==409)break;await new Promise(r=>setTimeout(r,250));} assert(r.ok,"Explicit reset failed: "+r.status+" "+await r.text());
 assert(!await db.prepare("SELECT 1 FROM spark_usage WHERE account='user:-9001'").first(),"Reset retained tester usage");
 assert(!!await db.prepare("SELECT 1 FROM spark_usage WHERE account='user:42'").first(),"Reset crossed account boundary");
 r=await call("/api/repos"); assert((await r.json() as any).repos.length===0,"Reset left installed inventory");
 r=await call("/test/install?confirm=1","POST"); assert(r.status===302 || r.status===303,"Second install failed");
 assert(outbound===0,"Native provider egress occurred");
 console.log("PASS: private staging entry, signed delegation, isolated D1, stub installation/webhook, runner pairing, explicit reset and second installation, zero native egress");
} finally {await mf.dispose();}
