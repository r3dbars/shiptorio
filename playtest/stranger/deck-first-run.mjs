// A fresh player, real local Worker/D1/DO, fixture GitHub and a fixture local Codex runner.
// No real sign-in, paid model call or GitHub write. The browser only reaches the first issue card.
import { execFileSync } from 'node:child_process';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { githubStub } from './github-stub.mjs';
import { sparkStub } from './spark-stub.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const server = join(root, 'server');
const out = process.env.DECK_FIRST_RUN_OUT || join(process.env.STRANGER_OUT || mkdtempSync(join(tmpdir(),'stranger-')), 'deck-first-run');
mkdirSync(out,{recursive:true});
const require = createRequire(join(server,'package.json'));
const wrangler = require('wrangler');
const {Miniflare,convertV4MiniflareOptions} = createRequire(require.resolve('wrangler'))('miniflare');
const bundle = mkdtempSync(join(tmpdir(),'deck-first-run-worker-'));
execFileSync('npx',['wrangler','deploy','--dry-run','--outdir',bundle],{cwd:server,stdio:'ignore'});
const {workerOptions} = wrangler.unstable_getMiniflareWorkerOptions(join(server,'wrangler.jsonc'));
const {privateKey} = generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const views = [{name:'desktop-1280',width:1280,height:720},{name:'phone-390',width:390,height:844}];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}:{});
const reports=[];
const baseline = process.env.DECK_FIRST_RUN_BASELINE === '1';
try { for (const [index,view] of views.entries()) {
  const origin=`http://localhost:${Number(process.env.DECK_FIRST_RUN_PORT || 8816)+index}`;
  const dir=join(out,view.name);mkdirSync(dir,{recursive:true});
  const secret='deck-first-run-webhook', password='deck-first-run-preview';
  let mf, context;
  const stub=githubStub({origin,webhookSecret:secret,worker:(url,init)=>mf.dispatchFetch(url,init),user:{id:5252001+index,login:`deck-stranger-${index}`,name:'Deck Stranger',avatar_url:null},repo:`deck-stranger-${index}/workshop`,repoId:5252999+index});
  // The selected repository already has the App installed (e.g. by its organization owner).
  // The Shiptorio account and its runner pairing are new for each viewport.
  stub.state.installation=99001+index;
  const spark=sparkStub();
  try {
    const {compatibilityDate,compatibilityFlags,kvNamespaces,d1Databases,durableObjects,assets}=workerOptions;
    mf=new Miniflare(convertV4MiniflareOptions({port:Number(new URL(origin).port),workers:[{
      compatibilityDate,compatibilityFlags,kvNamespaces,d1Databases,durableObjects,assets,
      name:'shiptorio',rootPath:bundle,modules:true,scriptPath:join(bundle,'index.js'),
      bindings:{...workerOptions.bindings,PUBLIC_URL:origin,ALLOWED_LOGINS:stub.state.user.login,SESSION_SECRET:'deck-first-run-session-0123456789abcdef',APP_PASSWORD:password,META_API_KEY:'stub-meta-key',SPARK_DAILY_TOKENS:'5000000',GITHUB_APP_ID:'1',GITHUB_APP_PRIVATE_KEY:privateKey,GITHUB_CLIENT_ID:'Iv1.stub',GITHUB_CLIENT_SECRET:'stub-client-secret',GITHUB_WEBHOOK_SECRET:secret,GITHUB_APP_SLUG:'shiptorio-stub'},
      outboundService:async request=>{
        if(new URL(request.url).host==='api.meta.ai') return spark.outbound(request);
        const response=await stub.outbound(request);
        if(request.method==='GET' && new URL(request.url).pathname===`/repos/${stub.state.repo}/issues`) {
          const rows=await response.json();
          return Response.json(rows.map(row=>({...row,id:row.number+7000})));
        }
        return response;
      },
    }]})); await mf.ready;
    const db=await mf.getD1Database('DB');
    for(const file of readdirSync(join(server,'migrations')).filter(f=>f.endsWith('.sql')).sort()) {
      const sql=wrangler.unstable_splitSqlQuery(readFileSync(join(server,'migrations',file),'utf8')).filter(s=>s.trim());
      await db.batch(sql.map(s=>db.prepare(s)));
    }
    const body=JSON.stringify({action:'created',installation:{id:stub.state.installation,account:{id:stub.state.user.id,login:stub.state.user.login,type:'User'}},repositories:[{id:stub.state.repoId,full_name:stub.state.repo}],sender:stub.state.user});
    const installed=await mf.dispatchFetch(origin+'/webhooks/github',{method:'POST',headers:{'content-type':'application/json','x-github-event':'installation','x-github-delivery':`first-run-install-${index}`,'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')},body});
    assert.equal(installed.ok,true,await installed.text());
    context=await browser.newContext({viewport:{width:view.width,height:view.height}});
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await context.route('https://github.com/**',route=>stub.browser(route));
    await context.route(origin+'/auth/login*',async route=>{
      const res=await route.fetch({maxRedirects:0}),to=res.headers().location || '/';
      if(!to.startsWith('https://github.com/'))return route.fulfill({response:res});
      const cookies=res.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value);
      await route.fulfill({status:200,contentType:'text/html',headers:{'set-cookie':cookies.join('\n')},body:`<script>location.href=${JSON.stringify(to)}</script>`});
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[], requests=[];let signedIn=false;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.method()!=='GET')requests.push(new URL(r.url()).pathname)});
    page.on('console',m=>{if(m.type()==='error' && !(m.text().includes('401')&&!signedIn&&(baseline||new URL(m.location().url || origin).pathname==='/deck.html')))errors.push(m.text())});
    page.on('response',r=>{if(!baseline&&new URL(r.url()).pathname.startsWith('/api/')&&r.status()>=400)errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`)});
    const steps=[],started=Date.now();
    const card=()=>page.locator('.ic-card:not(.ic-ghost)');
    async function step(name,work){const at=Date.now();try{await work();steps.push({name,ms:Date.now()-at});await page.screenshot({path:join(dir,`${String(steps.length).padStart(2,'0')}-${name}.png`),animations:'disabled'});if(!baseline) for(const button of await card().getByRole('button').all()){const b=await button.boundingBox(),c=await card().boundingBox();assert.ok(b.x>=c.x && b.x+b.width<=c.x+c.width+1,`${name}: button stays inside its card`);}}catch(e){await page.screenshot({path:join(dir,`FAIL-${name}.png`)});throw e;}}
    await step('enter-deck',async()=>{
      await page.goto(origin+'/deck.html?source=live');await page.getByLabel('Password').fill(password);await page.getByRole('button',{name:'Enter the factory'}).click();await page.locator('[data-deck-ready]').waitFor();
      if(baseline) await card().getByRole('button',{name:'Sign in',exact:true}).waitFor();
      else { assert.equal(await page.locator('.connection-tools').count(),0,'setup chips stay hidden before sign-in');assert.equal(await card().getByRole('button',{name:'Sign in',exact:true}).count(),0,'play the story before setup'); }
    });
    if(!baseline){
      for(let n=1;n<=3;n++)await step(`story-decision-${n}`,async()=>{
        const decision=page.locator(`.ic-card:not(.ic-ghost)[data-card="story-call-${n}"]`);
        await decision.waitFor({timeout:30000});assert.equal(await page.locator('.connection-tools').count(),0);
        assert.equal(await card().getByRole('button',{name:'Sign in',exact:true}).count(),0);
        await decision.locator('.approve').click();await decision.waitFor({state:'detached'});
      });
      await step('story-sign-in',async()=>{await card().getByRole('button',{name:'Sign in',exact:true}).waitFor({timeout:45000});assert.equal(await page.locator('.connection-tools').count(),0);});
    }
    // The fixture account has one repo, so signing in opens it with no pick: the next card is the Codex setup.
    await step('github-sign-in',async()=>{await card().getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('repo')===stub.state.repo);signedIn=true;await card().getByRole('button',{name:'Copy setup',exact:true}).waitFor();});
    let joinTicket;
    await step('codex-setup',async()=>{
      const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/runner/join'));
      await card().getByRole('button',{name:'Copy setup',exact:true}).click();joinTicket=(await (await response).json()).join;
      await card().getByRole('heading',{name:'Paste it into Terminal',exact:true}).waitFor();
      assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/--join/);
    });
    await step('runner-ready',async()=>{
      const joined=await context.request.post(origin+'/api/runner-device/join',{data:{join:joinTicket},headers:{origin}});assert.equal(joined.ok(),true,await joined.text());
      const {token}=await joined.json();
      const online=await context.request.post(origin+`/api/runner/${stub.state.repo}/heartbeat`,{data:{harnesses:['codex']},headers:{origin,authorization:`Bearer ${token}`}});assert.equal(online.ok(),true,await online.text());
      // No Check and no Open inbox: the deck notices the runner and shows the first issue.
      await card().getByRole('button',{name:'Plan',exact:true}).waitFor();
    });
    await step('first-issue-card',async()=>{assert.match(await card().innerText(),/#1.*Checkout total/);});
    assert.ok(Date.now()-started<120000,'first issue must be reached in under two minutes');
    assert.deepEqual(errors,[],'no browser runtime errors');
    assert.ok(!requests.some(p=>p.endsWith('/start')),'browsing must not start a job');
    assert.equal(stub.state.pulls.length,0,'no PR before starting an issue');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,`horizontal overflow ${overflow}`);
    const bounds=await card().getByRole('button',{name:baseline?'Start issue':'Plan',exact:true}).boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=view.width,'Plan is fully onscreen');
    reports.push({view: view.name,totalMs:Date.now()-started,steps,slowest:[...steps].sort((a,b)=>b.ms-a.ms).slice(0,3),errors});
    console.log(`PASS deck first run ${view.name}: ${Date.now()-started}ms`);
  } finally {await context?.close();await mf?.dispose();}
} } finally {await browser.close();writeFileSync(join(out,'timings.json'),JSON.stringify(reports,null,2));}
console.log(`Deck first-run screenshots and timings: ${out}`);
