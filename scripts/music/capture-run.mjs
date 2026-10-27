// Capture the actual simulator's music bus, without replacing factory input or its timer.
// This is review evidence, never a runtime asset. Start Vite, then run with Node.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const base=process.env.MUSIC_URL ?? 'http://127.0.0.1:5173';
const out=process.env.MUSIC_OUT ?? '/tmp/shiptorio-music';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage(); const requests=[];
  page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>localStorage.setItem('shiptorio.sound',JSON.stringify({muted:false,volume:0.5,music:true,musicVolume:0.8})));
  await page.goto(`${base}/?source=sim&scenario=quiet-morning&intro=0&tour=0&autolaunch=1&music=2`);
  await page.locator('canvas').first().waitFor();
  await page.mouse.click(10,10);
  await page.waitForTimeout(400);
  const engineUrl=requests.find(u=>u.includes('/src/sound/engine.ts'));
  await page.evaluate(async url=>{
    const {sound}=await import(url);
    const stream=sound.audio.createMediaStreamDestination();
    // TypeScript private is only a compile-time constraint; this probe stays in the test script.
    sound.musicBus.connect(stream);
    const mimeType=['audio/mp4;codecs=mp4a.40.2','audio/webm;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(stream.stream,{mimeType,audioBitsPerSecond:96000});
    const chunks=[]; const states=[]; const start=performance.now();
    const timer=setInterval(()=>{
      const state=sound.musicState();
      if(states.at(-1)?.state!==state.state) states.push({seconds:(performance.now()-start)/1000,...state});
    },250);
    window.captureDone=new Promise(resolve=>{
      recorder.ondataavailable=e=>chunks.push(e.data);
      recorder.onstop=async()=>{
        clearInterval(timer);sound.musicBus.disconnect(stream);
        const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let text='';
        for(let i=0;i<bytes.length;i+=8192) text+=String.fromCharCode(...bytes.subarray(i,i+8192));
        resolve({base64:btoa(text),mimeType:recorder.mimeType,states});
      };
    });
    window.captureRecorder=recorder;recorder.start(1000);
  },engineUrl);
  console.log('Recording actual quiet-morning simulation for 65 seconds');
  await page.waitForTimeout(65000);
  const result=await page.evaluate(async()=>{window.captureRecorder.stop();return window.captureDone;});
  const extension=result.mimeType.includes('mp4') ? 'm4a' : 'webm';
  const bytes=Buffer.from(result.base64,'base64');
  writeFileSync(`${out}/simulator-run.${extension}`,bytes);
  delete result.base64;
  writeFileSync(`${out}/simulator-run.json`,JSON.stringify({...result,bytes:bytes.length,seconds:65},null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
