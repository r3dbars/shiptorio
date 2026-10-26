// Destructive only to two freshly-created LOCAL directories under the OS temp dir.
// No --remote commands, production credentials, or Cloudflare resource creation.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
const root = resolve(import.meta.dir, "../.."), server = join(root,"server");
const config = join(server,"test/fixtures/durability/wrangler.jsonc");
const drill = mkdtempSync(join(tmpdir(), "shiptorio-durability-"));
const source = join(drill,"source"), restored = join(drill,"restored"), backup = join(drill,"backup.sql");
const configFor = (path: string) => {
  mkdirSync(path,{recursive:true});
  const local = JSON.parse(readFileSync(config,"utf8"));
  local.main=join(server,"test/fixtures/durability/worker.ts");
  local.d1_databases[0].migrations_dir=join(server,"migrations");
  const target=join(path,"wrangler.json"); writeFileSync(target,JSON.stringify(local)); return target;
};
const run = (args: string[]) => {
  const at=args.indexOf("--persist-to"), path=args[at+1];
  assert(at>=0); args=[...args.slice(0,at),...args.slice(at+2)];
  const result = Bun.spawnSync([process.execPath,"x","wrangler",...args,"--config",configFor(path)], {cwd: server, env: {...process.env, WRANGLER_SEND_METRICS: "false"}, stdout:"pipe",stderr:"pipe"});
  if (result.exitCode) throw new Error(Buffer.from(result.stderr).toString()+Buffer.from(result.stdout).toString());
  return Buffer.from(result.stdout).toString();
};
run(["d1","migrations","apply","shiptorio","--local","--persist-to",source]);
run(["d1","execute","shiptorio","--local","--persist-to",source,"--command", "INSERT INTO installations(id,account_login) VALUES(1,'owner'); INSERT INTO repos(full_name,installation_id) VALUES('owner/repo',1); INSERT INTO users(id,login,created_at,last_login_at) VALUES(1,'owner',1,1); INSERT INTO user_prefs(user_id,key,value,updated_at) VALUES(1,'intro','1',1);"]);
run(["d1","export","shiptorio","--local","--persist-to",source,"--output",backup]);
run(["d1","execute","shiptorio","--local","--persist-to",restored,"--file",backup]);
const query = "SELECT full_name,installation_id,default_branch,created_at,updated_at FROM repos; SELECT * FROM user_prefs; PRAGMA foreign_key_check; PRAGMA quick_check;";
// --json returns local timing metadata too; compare the query results themselves.
const rows = (path: string) => JSON.parse(run(["d1","execute","shiptorio","--local","--persist-to",path,"--command",query,"--json"])).map((r: {results: unknown})=>r.results);
assert.deepEqual(rows(source), rows(restored));
const original = JSON.parse(readFileSync(join(server,"test/fixtures/factory-state/unversioned-original.json"),"utf8"));
original.goal = "🚀".repeat(100000); // real workerd writes exercise chunked state too
let worker: ReturnType<typeof spawn> | undefined;
const port = 18793, base = `http://127.0.0.1:${port}`;
async function start(path: string) {
  worker=spawn(process.execPath,["x","wrangler","dev","--local","--config",configFor(path),"--port",String(port)], {cwd:server, env:{...process.env,WRANGLER_SEND_METRICS:"false"},stdio:"ignore"});
  for(let i=0;i<100;i++) {
    try {const res=await fetch(`${base}/api/version`); if(res.ok) return;} catch {}
    await Bun.sleep(200);
  }
  throw new Error("Local drill Worker did not start");
}
async function stop() {
  if (!worker) return;
  const processToStop=worker;
  const stopped=new Promise<void>(resolve=>processToStop.once("exit",()=>resolve()));
  processToStop.kill("SIGTERM"); await stopped; worker=undefined;
}
try {
  await start(source);
  const seed=await fetch(`${base}/__drill/restore`,{method:"POST",body:JSON.stringify(original)}); assert.equal(seed.status,200,await seed.text());
  const first=await fetch(`${base}/api/repos/owner/repo/export`); assert.equal(first.status,200,await first.clone().text());
  const snapshot=await first.json(); writeFileSync(join(drill,"factory.json"),JSON.stringify(snapshot,null,2));
  assert.equal(snapshot.state.goal,original.goal); assert.equal(snapshot.state.schemaVersion,2); assert(snapshot.storage.chunked);
  await stop();
  // Restore the exported JSON into a different local DO namespace/database copy.
  await start(restored);
  const restore=await fetch(`${base}/__drill/restore`,{method:"POST",body:JSON.stringify(snapshot.state)}); assert.equal(restore.status,200,await restore.text());
  await stop(); await start(restored); // real process restart, then read from persisted disk
  const response=await fetch(`${base}/api/repos/owner/repo/export`); assert.equal(response.status,200,await response.clone().text());
  const after=await response.json(); assert.deepEqual(after.state,snapshot.state);
  console.log(JSON.stringify({ok:true,drill,d1:"export/import rows equal, foreign_key_check empty, quick_check ok",factory:after.storage,restarted:true},null,2));
} finally {await stop();}
