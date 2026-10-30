// Local-only companion to cold-load.mjs. Reuses the hosted tester's signed persona,
// provider and paired fixture runner. No deployed resources or real credentials.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import { delegateTestRequest } from '../../server/src/test-delegation';

export async function coldLoadHost(root: string, staticOrigin: string) {
  const server = join(root, 'server'), require = createRequire(join(server, 'package.json'));
  const wrangler = require('wrangler');
  const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler'))('miniflare');
  const dir = mkdtempSync(join(tmpdir(), 'cold-load-host-')), key = randomBytes(32).toString('hex');
  const config = join(dir, 'wrangler.json');
  const entry = join(dir, 'entry.ts');
  writeFileSync(entry, `import fixture from ${JSON.stringify(join(root, 'playtest/staging/worker.ts'))};
import {app} from ${JSON.stringify(join(root, 'server/src/index.ts'))};
import {fixtureSession} from ${JSON.stringify(join(root, 'playtest/staging/session.ts'))};
import {fixtureProviderEnv} from ${JSON.stringify(join(root, 'playtest/staging/env.ts'))};
import {makeSessionCookie} from ${JSON.stringify(join(root, 'server/src/session.ts'))};
import {ISOLATED_TEST_CONTEXT} from ${JSON.stringify(join(root, 'server/src/test-delegation.ts'))};
export {Factory,FixtureProvider} from ${JSON.stringify(join(root, 'playtest/staging/worker.ts'))};
export default {async fetch(r,e,c){
  if(r.headers.has('x-shiptorio-test-delegation'))return fixture.fetch(r,e,c);
  if(r.headers.get('x-local-me')===e.TEST_FACTORY_KEY && new URL(r.url).pathname==='/api/me') {
    const env=fixtureProviderEnv(e), session=await fixtureSession(env,'test-newbie');
    const preview=(await makeSessionCookie(e.SESSION_SECRET+':'+e.APP_PASSWORD,'preview')).split(';')[0].replace('shiptorio_session=','shiptorio_access=');
    const headers=new Headers(r.headers);headers.set('cookie',session+'; '+preview);headers.delete('x-local-me');
    return app.fetch(new Request(r,{headers}),{...env,[ISOLATED_TEST_CONTEXT]:true},c);
  }
  return app.fetch(r,e,c);
}};`);
  writeFileSync(config, JSON.stringify({ name: 'shiptorio-fixture', main: entry, compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'], durable_objects: { bindings: [{name:'FACTORY',class_name:'Factory'}, {name:'FIXTURE_PROVIDERS',class_name:'FixtureProvider'}] }, migrations: [{tag:'v1',new_sqlite_classes:['Factory','FixtureProvider']}] }));
  execFileSync('node', [join(server,'node_modules/wrangler/wrangler-dist/cli.js'),'deploy','--config',config,'--dry-run','--outdir',dir], {cwd:root,stdio:'pipe'});
  const { privateKey } = generateKeyPairSync('rsa', {modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const base = wrangler.unstable_getMiniflareWorkerOptions(config).workerOptions;
  let outbound = 0;
  const options = convertV4MiniflareOptions({port:0,d1Persist:join(dir,'d1'),kvPersist:join(dir,'kv'),durableObjectsPersist:join(dir,'do'),workers:[{name:'shiptorio-fixture',rootPath:dir,modules:true,scriptPath:join(dir,'entry.js'),compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],durableObjects:base.durableObjects,d1Databases:['DB'],kvNamespaces:['CACHE'],bindings:{PUBLIC_URL:'https://shiptorio.dev',TEST_USERS:'on',TEST_FACTORY_KEY:key,FIXTURE_INSTANCE:'shiptorio-fixture',SESSION_SECRET:'private-fixture',APP_PASSWORD:'private-preview',ALLOWED_LOGINS:'',GITHUB_APP_ID:'1',GITHUB_APP_PRIVATE_KEY:privateKey,GITHUB_WEBHOOK_SECRET:'fixture-hook',GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture',GITHUB_APP_SLUG:'shiptorio-stub',META_API_KEY:'fixture',SPARK_BASE_URL:'https://api.meta.ai/v1',SPARK_MODEL:'muse-spark-1.3'},outboundService:()=>{outbound++;throw Error('Native egress forbidden');}}]});
  let mf = new Miniflare(options);
  const samples: object[] = [];
  const call = async (path: string, live: boolean, upgrade = false) => {
    let req = new Request('https://shiptorio.dev'+path, {headers:{origin:'https://shiptorio.dev',...(upgrade?{upgrade:'websocket'}:{})}});
    if (live && path==='/api/me') req.headers.set('x-local-me',key);
    else if (live) req = await delegateTestRequest(req, {id:-9001,login:'test-newbie'}, key);
    return mf.dispatchFetch(req.url,{redirect:'manual',headers:Object.fromEntries(req.headers)});
  };
  const host = createServer(async (req,res) => {
    try {
      const path = req.url ?? '/';
      if (req.method !== 'GET') {res.writeHead(405).end();return;}
      const api = /^\/(api|auth)\//.test(path);
      const response = api ? await call(path, /cold_load_persona=1/.test(req.headers.cookie ?? '')) : await fetch(staticOrigin+(path.split('?')[0]==='/deck'?path.replace('/deck','/deck.html'):path));
      const headers = Object.fromEntries(response.headers);
      delete headers['content-length']; delete headers['transfer-encoding']; delete headers['content-encoding'];
      const body = Buffer.from(await response.arrayBuffer());
      // Gzip before CDP throttles the response, as an edge-compressed response would be.
      const zip = /text|javascript|json|svg/.test(headers['content-type'] ?? '');
      if (zip) headers['content-encoding']='gzip';
      if (/^\/assets\//.test(path)) headers['cache-control']='public, max-age=31536000, immutable';
      res.writeHead(response.status,headers).end(zip?gzipSync(body):body);
    } catch (e) {console.error('Local adapter',e);res.writeHead(500).end(String(e));}
  });
  const ws = new WebSocketServer({noServer:true});
  host.on('upgrade', async (req,socket,head) => {
    const start = performance.now();
    try {
      const response = await call(req.url!, /cold_load_persona=1/.test(req.headers.cookie ?? ''),true);
      if (response.status!==101) {socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
      const upstream = response.webSocket;
      const timing = response.headers.get('server-timing');
      ws.handleUpgrade(req,socket,head,client=>{
        let first = true;
        upstream.addEventListener('message',(event: MessageEvent)=>{
          if (first && typeof event.data==='string' && JSON.parse(event.data).type==='snapshot') {
            first=false; samples.push({upgradeToSnapshotMs:performance.now()-start,bytes:Buffer.byteLength(event.data),serverTiming:timing});
          }
          if (client.readyState===1) client.send(event.data);
        });
        client.on('message',(data,isBinary)=>upstream.send(isBinary?data:data.toString()));
        client.on('close',()=>upstream.close());
        upstream.addEventListener('close',()=>client.close());
        upstream.accept();
      });
    } catch {socket.destroy();}
  });
  try {
    await mf.ready;
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync(join(server,'migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.batch(wrangler.unstable_splitSqlQuery(readFileSync(join(server,'migrations',file),'utf8')).filter((s:string)=>s.trim()).map((s:string)=>db.prepare(s)));
    await call('/api/repos',true);
    const install = await delegateTestRequest(new Request('https://shiptorio.dev/test/install?confirm=1',{method:'POST',headers:{origin:'https://shiptorio.dev'}}),{id:-9001,login:'test-newbie'},key);
    const installed=await mf.dispatchFetch(install.url,{method:'POST',redirect:'manual',headers:Object.fromEntries(install.headers)});
    if (!installed.ok && installed.status!==302) throw Error('Fixture install failed: '+installed.status);
    for(let n=0;n<100;n++) {
      const response=await call('/api/repos',true), data=await response.json();
      if (data.repos?.length) break;
      if(n===99) throw Error('Fixture repository never became ready');
      await new Promise(r=>setTimeout(r,100));
    }
    for(let n=0;n<100;n++){
      const r=await call('/api/repos/test-fixture/test-newbie/runner/status',true), status=await r.json();
      if(status.online && status.harnesses?.includes('codex'))break;
      if(n===99)throw Error('Fixture runner never became online');
      await new Promise(r=>setTimeout(r,100));
    }
    await new Promise<void>(resolve=>host.listen(0,'127.0.0.1',resolve));
    const address=host.address();
    if (!address || typeof address==='string') throw Error('Missing listener');
    return {origin:`http://127.0.0.1:${address.port}`,samples,
      probe: async (restart=false) => {
        if(restart){await mf.dispose();mf=new Miniflare(options);await mf.ready;}
        const start=performance.now(), response=await call('/api/repos/test-fixture/test-newbie/factory',true,true);
        if(response.status!==101)throw Error('Probe upgrade failed: '+response.status);
        const socket=response.webSocket;
        const bytes=await new Promise<number>((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(Error('Probe snapshot timeout')),10000);
          socket.addEventListener('message',(event:MessageEvent)=>{if(typeof event.data==='string' && JSON.parse(event.data).type==='snapshot'){clearTimeout(timeout);resolve(Buffer.byteLength(event.data));}});
          socket.accept();
        });
        socket.close();
        return {restart,upgradeToSnapshotMs:performance.now()-start,bytes,serverTiming:response.headers.get('server-timing')};
      },
      close:async()=>{for(const c of ws.clients)c.terminate();ws.close();host.closeAllConnections();await new Promise<void>(r=>host.close(()=>r()));await mf.dispose();rmSync(dir,{recursive:true,force:true});if(outbound)throw Error('Unexpected external requests: '+outbound);}};
  } catch(e) {host.close();ws.close();await mf.dispose();rmSync(dir,{recursive:true,force:true});throw e;}
}
