export const PROFILE = {viewport:"iPhone 13",downloadMbps:9,uploadMbps:9,rttMs:150,cpuSlowdown:4,coldBrowserCache:true};

export const observePlayable = ({live})=>{
      const record=entry=>window.coldLoadMark?.({name:entry.name,start:entry.startTime,timeOrigin:performance.timeOrigin,url:location.href});
      record({name:'navigation',startTime:0});
      for(const type of ['mark','paint'])new PerformanceObserver(list=>list.getEntries().forEach(record)).observe({type,buffered:true});
      // Card insertion precedes its entrance animation. The budget waits for a readable,
      // on-screen card and, for live, a card matched by main.ts to the accepted state.
      const visible=()=>{
        const face=document.querySelector('.ic-card:not(.ic-ghost):not(.ic-empty)'), box=face?.getBoundingClientRect();
        const ready=performance.getEntriesByName(live?'shiptorio:live-card':'shiptorio:first-card').length;
        const line=face?.querySelector('.ic-line'), untyped=line?.querySelector('.ic-untyped');
        if(ready && box?.height && box.top>=0 && box.bottom<=innerHeight && getComputedStyle(face).opacity==='1' && line?.textContent?.trim() && (!untyped || untyped.textContent!==line.textContent)) {
          performance.mark('shiptorio:playable');
          return;
        }
        requestAnimationFrame(visible);
      };
      requestAnimationFrame(visible);
    };

// PerformanceObserver delivery can trail waitForFunction. Read the current
// document directly before serializing, while retaining prior-navigation marks.
export async function collectCurrentMarks(page, marks) {
  const current=await page.evaluate(()=>[
    {name:'navigation',start:0,timeOrigin:performance.timeOrigin},
    ...performance.getEntries().filter(e=>e.entryType==='mark'||e.entryType==='paint')
      .map(e=>({name:e.name,start:e.startTime,timeOrigin:performance.timeOrigin})),
  ]);
  for(const mark of current)if(!marks.some(m=>m.name===mark.name&&m.timeOrigin===mark.timeOrigin&&m.start===mark.start))marks.push(mark);
}

export async function throttle(cdp) {
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled",{cacheDisabled:true});
  await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:150,downloadThroughput:9e6/8,uploadThroughput:9e6/8});
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
}
