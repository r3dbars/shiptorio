// Browser plugin not available in this session; use the repository's Playwright dependency.
// Start Vite first. Outputs are review artifacts outside the source tree by default.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.MUSIC_URL ?? 'http://127.0.0.1:5173';
const out = process.env.MUSIC_OUT ?? '/tmp/shiptorio-music';
mkdirSync(out,{recursive:true});
const browser = await chromium.launch();
const results = {};
const url = `${base}/?source=sim&scenario=quiet-morning&intro=0&tour=0&autolaunch=1&music=2`;
try {
  for (const [name, device] of [['desktop',{viewport:{width:1440,height:900}}],['phone',devices['iPhone 13']]]) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    const errors=[]; const requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>requests.push(r.url()));
    await page.addInitScript(()=>localStorage.setItem('shiptorio.sound',JSON.stringify({muted:false,volume:0.5,music:false,musicVolume:0.8})));
    await page.goto(url);
    await page.locator('canvas').first().waitFor();
    await page.waitForTimeout(1000);
    const musicRequests=()=>requests.filter(u=>/foundry(Player|Score)|\.(m4a|mp3|opus|ogg|wav)(\?|$)/.test(u));
    if(musicRequests().length) throw Error('Music requested before first gesture');
    await page.getByRole('button',{name:/^Activity, /}).click();
    await page.getByRole('slider',{name:'Music volume',exact:true}).scrollIntoViewIfNeeded();
    if(musicRequests().length) throw Error('Music requested while music off');
    await page.getByRole('button',{name:'MUSIC OFF',exact:true}).click();
    await page.waitForTimeout(4000);
    const state=()=>page.evaluate(async()=>{const {sound}=await import('/src/sound/engine.ts');return sound.musicState();});
    const playing=await state();
    if(!playing.attached || playing.scheduledNotes<=0) throw Error(`Music did not start: ${JSON.stringify(playing)}`);
    await page.getByRole('slider',{name:'Music volume',exact:true}).fill('37');
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('shiptorio.sound')));
    if(stored.musicVolume!==0.37 || stored.volume!==0.5) throw Error('Independent music volume failed');
    await page.screenshot({path:`${out}/${name}.png`});
    await page.getByRole('button',{name:'MUSIC ON',exact:true}).click();
    await page.waitForTimeout(250);
    const stopped=await state();
    await page.waitForTimeout(700);
    const later=await state();
    if(later.scheduledNotes!==stopped.scheduledNotes || later.activeVoices!==0) throw Error('Music kept scheduling while disabled');
    await page.getByRole('button',{name:'MUSIC OFF',exact:true}).click();
    await page.waitForTimeout(300);
    await page.getByRole('button',{name:'ON',exact:true}).click();
    await page.waitForTimeout(400);
    const suspended=await page.evaluate(async()=>{const {sound}=await import('/src/sound/engine.ts');return sound.audio.state;});
    if(suspended!=='suspended') throw Error(`Muted context ${suspended}`);
    if(errors.length) throw Error(errors.join('\n'));
    results[name]={url:page.url(),title:await page.title(),musicRequests:musicRequests(),playing,persisted:stored,offStopsScheduling:true,muteSuspends:true,errors};
    await context.close();
  }
  const page=await browser.newPage();
  await page.goto(`${base}/?source=sim&intro=0&tour=0&music=2&quality=2`);
  // Render the exact score/instruments offline and write a standard mono PCM WAV.
  const pcm=await page.evaluate(async()=>{
    const {renderFoundryPreview}=await import('/src/sound/foundryScore.ts');
    const buffer=await renderFoundryPreview();
    const data=buffer.getChannelData(0); let peak=0,energy=0;
    const pcm=new Int16Array(data.length);
    for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]*data[i];pcm[i]=Math.max(-1,Math.min(1,data[i]))*32767;}
    // Chunked base64 prevents exceeding the browser argument stack limit.
    const bytes=new Uint8Array(pcm.buffer); let str='';
    for(let i=0;i<bytes.length;i+=8192) str+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {bytes:btoa(str),sampleRate:buffer.sampleRate,seconds:buffer.duration,peak,rms:Math.sqrt(energy/data.length)};
  });
  const bytes=Buffer.from(pcm.bytes,'base64'); const header=Buffer.alloc(44);
  header.write('RIFF',0);header.writeUInt32LE(bytes.length+36,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);
  header.writeUInt32LE(pcm.sampleRate,24);header.writeUInt32LE(pcm.sampleRate*2,28);
  header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(bytes.length,40);
  writeFileSync(`${out}/foundry-preview.wav`,Buffer.concat([header,bytes]));
  results.audition={...pcm,bytes:bytes.length};
  if(pcm.peak>=1 || pcm.rms<0.01) throw Error('Audition clips or is inaudible');
  // Profile the music in isolation at 4x CPU, avoiding 3D map cost in attribution.
  await page.route('**/music-bench',r=>r.fulfill({contentType:'text/html',body:'<button>Start music</button>'}));
  await page.goto(`${base}/music-bench?music=2&quality=2`);
  await page.evaluate(async()=>{const {sound}=await import('/src/sound/engine.ts');sound.install();sound.set({muted:false,music:true,musicVolume:0.8});sound.setMusic({moving:15,working:4,stationsBusy:5,rejected:4,bottleneck:{stage:'build',wip:8,ageMs:30000000}});});
  await page.getByRole('button').click();
  await page.waitForTimeout(500);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval',{interval:500});
  await cdp.send('Profiler.start'); await page.waitForTimeout(12000);
  const {profile}=await cdp.send('Profiler.stop');
  const ids=new Set(profile.nodes.filter(n=>/foundryPlayer|foundryScore/.test(n.callFrame.url)).map(n=>n.id));
  let attributedUs=0;
  for(let i=0;i<profile.samples.length;i++) if(ids.has(profile.samples[i])) attributedUs+=profile.timeDeltas[i];
  const musicPercent=attributedUs/(profile.endTime-profile.startTime)*100;
  results.phoneMusicProfile={cpuThrottle:4,musicSelfTimePercent:musicPercent,seconds:(profile.endTime-profile.startTime)/1e6,decodedPCMBytes:0,state:await page.evaluate(async()=>{const {sound}=await import('/src/sound/engine.ts');return sound.musicState();})};
  await page.close();
  writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
