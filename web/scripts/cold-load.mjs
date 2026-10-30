// bun run build && node web/scripts/cold-load.mjs
// Local fixture only. COLD_LOAD_OUT retains HAR + Chrome trace for every round.
import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { benchmarkServer } from './perf-server.mjs';
import { PROFILE, observePlayable, throttle } from './cold-load-profile.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.COLD_LOAD_OUT ?? mkdtempSync(join(tmpdir(),'cold-load-'));
mkdirSync(out,{recursive:true});
const compiled=join(root,'node_modules/.cache/cold-load-host.mjs');
mkdirSync(join(root,'node_modules/.cache'),{recursive:true});
execFileSync('bun',['build','web/scripts/cold-load-host.ts','--target=node','--packages=external',`--outfile=${compiled}`],{cwd:root,stdio:'pipe'});
const {coldLoadHost}=await import(pathToFileURL(compiled).href);
const staticServer=benchmarkServer(join(root,'web/dist'));
await new Promise(r=>staticServer.once('listening',r));
let host,browser;
const results=[];
const profile=PROFILE;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try {
  host=await coldLoadHost(root,`http://127.0.0.1:${staticServer.address().port}`);
  browser=await chromium.launch();
  async function run(path,round) {
    const name=`${path}-${round}`,live=path==='live';
    const context=await browser.newContext({...devices['iPhone 13'],defaultBrowserType:'chromium',serviceWorkers:'block',recordHar:{path:join(out,`${name}.har`),content:'omit'}});
    if(live) await context.addCookies([{name:'cold_load_persona',value:'1',url:host.origin}]);
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    const marks=[],documents=[],requests=[],sockets=[],errors=[];
    page.on('response',response=>{if(response.status()>=400 && !(response.status()===401 && !live && /\/(api\/me|auth\/logout)$/.test(new URL(response.url()).pathname)))errors.push(`${response.status()} ${new URL(response.url()).pathname}`);});
    await context.exposeBinding('coldLoadMark',(_,{name,start,timeOrigin,url})=>{if(url.startsWith(host.origin))marks.push({name,start,timeOrigin});});
    await context.addInitScript(observePlayable,{live});
    page.on('pageerror',error=>errors.push(error.message));
    cdp.on('Network.requestWillBeSent',e=>{requests.push({id:e.requestId,url:e.request.url,at:e.timestamp,wallTime:e.wallTime,type:e.type});if(e.type==='Document')documents.push(e);});
    cdp.on('Network.webSocketFrameReceived',e=>{try{const msg=JSON.parse(e.response.payloadData);if(msg.type==='snapshot')sockets.push({at:e.timestamp,repo:msg.state.repo,cardIds:(msg.state.deck??[]).map(m=>m.id),bytes:Buffer.byteLength(e.response.payloadData),pipeline:msg.state.pipeline});}catch{}});
    await throttle(cdp);
    await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,loading,v8',transferMode:'ReturnAsStream'});
    const before=host.samples.length;
    try {
      await page.goto(host.origin+(live?'/deck?source=live&repo=test-fixture/test-newbie':'/deck?fresh=1'),{waitUntil:'commit'});
      await page.waitForFunction(name=>performance.getEntriesByName(name).length>0,'shiptorio:playable',{timeout:45000});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:join(out,`${name}.png`)});
      if(errors.length)throw Error(errors.join('\n'));
      const cardId=await page.locator('.ic-card:not(.ic-ghost):not(.ic-empty)').getAttribute('data-card');
      if(live && !sockets.some(s=>s.cardIds.includes(cardId)))throw Error('Rendered card does not belong to a received snapshot');
      if(live && (!sockets.length || sockets[0].repo!=='test-fixture/test-newbie' || !sockets[0].cardIds.length))throw Error('No real fixture snapshot/card');
      const origin=Math.min(...marks.filter(m=>m.name==='navigation').map(m=>m.timeOrigin));
      const times={navigation:0};
      for(const m of marks)if(!(m.name in times))times[m.name]=Math.round((m.timeOrigin-origin+m.start)*10)/10;
      const row={path,round,times,milestones:marks.map(m=>({name:m.name,ms:Math.round((m.timeOrigin-origin+m.start)*10)/10})),navigations:documents.length,requests:requests.map(r=>({url:new URL(r.url).pathname,type:r.type,ms:Math.round((r.wallTime*1000-origin)*10)/10})),snapshots:sockets,server:host.samples.slice(before)};
      results.push(row);
      writeFileSync(join(out,'rounds.json'),JSON.stringify({profile,results},null,2));
      console.log(name,JSON.stringify(times));
    } catch (error) {
      console.error(name, 'failed', {marks, requests, errors});
      await page.screenshot({path:join(out,`${name}-failed.png`)});
      throw error;
    } finally {
      const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      await cdp.send('Tracing.end');
      const {stream}=await complete;
      let trace='';
      for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.base64Encoded?Buffer.from(part.data,'base64').toString():part.data;if(part.eof)break;}
      await cdp.send('IO.close',{handle:stream});
      writeFileSync(join(out,`${name}.trace.json`),trace);
      await context.close();
    }
  }
  // One uncounted round for each path; every timed round still has a fresh browser context/cache.
  for(const path of ['stranger','live'])await run(path,'warmup');
  const rounds=Number(process.env.COLD_LOAD_ROUNDS??5);
  if(!Number.isInteger(rounds)||rounds<1)throw Error('Invalid round count');
  for(let round=1;round<=rounds;round++)for(const path of ['stranger','live'])await run(path,round);
  const summary={};
  for(const path of ['stranger','live']){
    const rows=results.filter(r=>r.path===path&&r.round!=='warmup');
    summary[path]=Object.fromEntries(Object.keys(rows[0].times).map(key=>[key,median(rows.map(r=>r.times[key]))]));
  }
  const serverOnly=[await host.probe(true)];
  for(let n=0;n<5;n++)serverOnly.push(await host.probe());
  writeFileSync(join(out,'results.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),profile,rounds,summary,results,serverOnly},null,2));
  console.table(summary);console.log('Evidence:',out);
} finally {
  await browser?.close();await host?.close();
  staticServer.closeAllConnections();await new Promise(r=>staticServer.close(r));
  rmSync(compiled,{force:true});
}
