// Host-only proof: one local upgrade, one DO, five-second bound, no external network.
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL("../../",import.meta.url));
const require=createRequire(join(root,'server/package.json'));
const {Miniflare,convertV4MiniflareOptions}=createRequire(require.resolve('wrangler'))('miniflare');
const build=createRequire(require.resolve('wrangler'))('esbuild').buildSync;
const dir=mkdtempSync(join(tmpdir(),'fixture-timing-do-'));
const source=join(dir,'worker.ts');
writeFileSync(source,`import {DurableObject} from 'cloudflare:workers';import {FixtureTiming} from ${JSON.stringify(join(root,'playtest/staging/timing.ts'))};
export class Probe extends DurableObject {fetch(){const pair=new WebSocketPair();pair[1].accept();pair[1].send('actual-upgrade');pair[1].addEventListener('message',e=>pair[1].send(e.data));return new Response(null,{status:101,webSocket:pair[0]});}}
export default {async fetch(req,env){if(req.headers.has('x-fixture-probe-hop'))return new Response('recursive harness route',{status:500});const h=new Headers(req.headers);h.set('x-fixture-probe-hop','1');const t=new FixtureTiming();const r=await env.PROBE.get(env.PROBE.idFromName('one')).fetch(new Request(req,{headers:h}));t.mark('app');return t.attach(r);}}`);
writeFileSync(join(dir,'worker.js'),build({entryPoints:[source],bundle:true,write:false,platform:'browser',format:'esm',external:['cloudflare:workers']}).outputFiles[0].text);
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[{name:'timing-proof',rootPath:dir,modules:true,scriptPath:join(dir,'worker.js'),compatibilityDate:'2026-10-01',durableObjects:{PROBE:{className:'Probe',useSQLite:true}}}]}));
try {
 const url=await mf.ready, WS=require('ws');
 await new Promise((resolve,reject)=>{
  const socket=new WS(String(url).replace(/^http/,'ws'));
  const timer=setTimeout(()=>{socket.terminate();reject(Error('timing host exceeded5s'));},5000);
  socket.on('upgrade',r=>{if(!r.headers['server-timing']?.startsWith('fixture_app;dur='))reject(Error('missing timing'));});
  socket.on('message',raw=>{if(raw.toString()!=='actual-upgrade')return reject(Error('lost frame'));clearTimeout(timer);socket.close();resolve();});
  socket.on('error',error=>{clearTimeout(timer);reject(error)});
 });
 console.log('PASS: actual workerd DO 101 preserves socket, Server-Timing and initial frame');
} finally {await mf.dispose();}
