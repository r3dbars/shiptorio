// Run by Justin, after deployment: node web/scripts/cold-load-live.mjs
// Sign in manually, choose an already-connected non-Testing repo, then press Enter.
// Cookies stay in memory. No HAR, trace, screenshot, action, or factory payload is saved.
import {chromium,devices} from '@playwright/test';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import {PROFILE,observePlayable,collectCurrentMarks,throttle} from './cold-load-profile.mjs';
const terminal=createInterface({input:process.stdin,output:process.stdout});
const browser=await chromium.launch({headless:false});
try {
  const setup=await browser.newContext(),tab=await setup.newPage();
  await tab.goto('https://shiptorio.dev/deck?source=live');
  await terminal.question('Sign in and open an already-connected repo with a real top card and paired runner. Do not select r3dbars/Testing. Press Enter here when ready: ');
  const url=new URL(tab.url()),repo=url.searchParams.get('repo');
  if(url.origin!=='https://shiptorio.dev'||url.searchParams.get('source')!=='live'||!repo||repo.toLowerCase()==='r3dbars/testing')throw Error('Open a live, non-Testing repo on shiptorio.dev first.');
  const status=await tab.evaluate(async repo=>{const r=await fetch(`/api/repos/${repo}/runner/status`);return r.ok?await r.json():null;},repo);
  if(!status?.online)throw Error('The selected repo needs an online paired runner.');
  const storageState=await setup.storageState();
  // Close the warm page; it must not compete with the timed cold context.
  await setup.close();
  const results={profile:PROFILE,sampled:true,rounds:1,paths:{}};
  for(const path of ['live','stranger']){
    const live=path==='live';
    const ctx=await browser.newContext({...devices['iPhone 13'],serviceWorkers:'block',...(live?{storageState}: {})});
    const marks=[];
    await ctx.exposeBinding('coldLoadMark',(_,{name,start,timeOrigin,url})=>{if(url.startsWith('https://shiptorio.dev/'))marks.push({name,start,timeOrigin});});
    await ctx.addInitScript(observePlayable,{live});
    const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
    await throttle(cdp);
    await page.goto(live?url.href:'https://shiptorio.dev/deck?fresh=1',{waitUntil:'commit'});
    await page.waitForFunction(()=>performance.getEntriesByName('shiptorio:playable').length>0,null,{timeout:45000});
    await collectCurrentMarks(page,marks);
    const zero=Math.min(...marks.filter(m=>m.name==='navigation').map(m=>m.timeOrigin));
    const times={};for(const mark of marks)if(!(mark.name in times))times[mark.name]=Math.round((mark.timeOrigin-zero+mark.start)*10)/10;
    results.paths[path]=times;await ctx.close();
  }
  const file=process.env.COLD_LOAD_LIVE_OUT??'cold-load-live.json';
  writeFileSync(file,JSON.stringify(results,null,2));
  console.table(results.paths);console.log('Numeric timings only:',file);
}finally{terminal.close();await browser.close();}
