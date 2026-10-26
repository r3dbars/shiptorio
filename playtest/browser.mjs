/** Run through the Codex CUA browser handle; never imports a second browser runtime.
 * const qa = await import('/absolute/repo/playtest/browser.mjs');
 * await qa.smoke({tab, baseUrl:'http://localhost:5173', fs:await import('node:fs/promises'), outputDir:'/absolute/outputs/browser-qa'});
 */
export async function smoke({ tab, baseUrl, fs, outputDir, scenarios = ['quiet-morning', 'heal', 'first-run'] }) {
  const origin = new URL(baseUrl);
  if (!['localhost','127.0.0.1','shiptorio.com','shiptorio.dev'].includes(origin.hostname)) throw Error('Use the local or Shiptorio app');
  await fs.mkdir(outputDir, {recursive:true});
  const reports=[];
  for (const scenario of scenarios) {
    if (!/^[a-z-]+$/.test(scenario)) throw Error('Invalid scenario');
    const url=new URL(baseUrl); url.search = new URLSearchParams({source:'sim',scenario}).toString();
    const startedAt=Date.now();
    await tab.goto(url.href);
    let tree=await tab.getAXState({emit:false});
    const findings=[];
    if (!/Factory map|SHIPTORIO|Next move|Bottleneck/.test(tree)) findings.push({severity:'P1',title:'No meaningful app content'});
    if (/Vite Error|Internal Server Error|Failed to resolve import|Something went wrong/.test(tree)) findings.push({severity:'P1',title:'Framework or app error overlay'});
    // The browser runtime waits for the actual control, rather than sleeping through guessed timing.
    let interacted=false;
    try {
      const suggested=tab.playwright.getByRole('button',{name:/suggested/i}).first();
      let ready=false;
      for(let attempt=0; attempt<5 && !ready; attempt++) {
        try { await suggested.waitFor({state:'visible',timeoutMs:3000}); ready=true; }
        catch(error) { tree=await tab.getAXState({emit:false}); if(attempt===4) throw error; }
      }
      tree=await tab.getAXState({emit:false});
      await suggested.click();
      tree=await tab.getAXState({emit:false}); interacted=true;
    } catch(error) { findings.push({severity:'P2',title:'Suggested action unavailable or failed',detail:String(error).slice(0,500)}); }
    const errors=(await tab.dev.logs({levels:['error'],limit:30})).filter(e=>Date.parse(e.timestamp)>=startedAt && (!e.url || new URL(e.url).origin===origin.origin));
    if(errors.length) findings.push({severity:'P1',title:'Browser console errors',errors});
    const screenshot=`${outputDir}/${scenario}.png`;
    await fs.writeFile(screenshot,await tab.getScreenshot({emit:false}));
    const report={scenario,url:url.href,interacted,findings,screenshot,tree};
    await fs.writeFile(`${outputDir}/${scenario}.json`,JSON.stringify(report,null,2));
    reports.push(report);
  }
  await fs.writeFile(`${outputDir}/results.json`,JSON.stringify(reports,null,2));
  return reports.map(({scenario,interacted,findings,screenshot})=>({scenario,interacted,findings,screenshot}));
}
