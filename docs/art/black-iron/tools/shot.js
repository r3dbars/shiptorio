// node shot.js <html> <prefix> [options]
//   --view=line|deck|under|follow|assembler|splitter|launch   camera (default line). Comma list = one shot each.
//   --warm=SEC      fast-forward the simulation before the first shot (default 25)
//   --frames=N --gap=SEC   take N shots per view, fast-forwarding GAP seconds between them (default 1, 1)
//   --block=assembler,splitter,launch   force those machines into BLOCKED before shooting
//   --px=1|2|3|0    pixel size (default 1)    --mobile   390x844 viewport    --zoom=Z  extra zoom factor (<1 = closer)
//   --sheet         also write shots/<prefix>-sheet.png (all frames in a grid) — one Read instead of many
// Prints console errors + line stats. Shots land in shots/<prefix>-<view>-<n>.png
const { chromium } = require('playwright');
const fs = require('fs'); const { execSync } = require('child_process');
(async () => {
  const [html, prefix, ...rest] = process.argv.slice(2);
  const o = Object.fromEntries(rest.map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
  const views = String(o.view || 'line').split(','); const warm = +(o.warm ?? 25), frames = +(o.frames || 1), gap = +(o.gap || 1);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const vp = o.mobile ? { width: 390, height: 844 } : { width: 1440, height: 860 };
  const p = await b.newPage({ viewport: vp }); p.setDefaultTimeout(170000);
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' || /\[IRON\]/.test(m.text())) errs.push(m.text()); });
  const doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(html, 'utf8') + '</body></html>';
  await p.setContent(doc, { waitUntil: 'load' });
  await p.waitForFunction(() => window.IRON && IRON.ready, null, { timeout: 150000 });
  await p.evaluate(([warm, px, block]) => {
    document.querySelector('[data-px="' + px + '"]').click();
    IRON.debug.advance(warm);
    if (block) block.split(',').forEach((id) => IRON.stall(id));
    IRON.policy.autoResolve = false;
  }, [warm, String(o.px ?? 1), o.block || '']);
  const files = [];
  for (const v of views) {
    await p.evaluate(([v, z]) => {
      if (['assembler', 'splitter', 'launch'].includes(v)) IRON.setView('station', v); else IRON.setView(v);
      for (let i = 0; i < 90; i++) IRON.camStep(1 / 30);
      if (z) { window.__z = z; }
    }, [v, o.zoom ? +o.zoom : 0]);
    if (o.zoom) await p.mouse.move(700, 400), await p.mouse.wheel(0, Math.log(+o.zoom) / 0.001);
    for (let f = 0; f < frames; f++) {
      if (f > 0) await p.evaluate((g) => { IRON.debug.advance(g); for (let i = 0; i < 20; i++) IRON.camStep(1 / 30); }, gap);
      await p.evaluate(() => { IRON.hudStep(); IRON.render(); });
      const file = `shots/${prefix}-${v}-${f}.png`; await p.screenshot({ path: file }); files.push(file);
    }
  }
  const stats = await p.evaluate(() => JSON.stringify(IRON.debug.stats()));
  console.log(errs.slice(0, 25).join('\n') || 'no errors');
  console.log('stats', stats);
  if (o.sheet && files.length > 1) {
    const cols = files.length <= 4 ? 2 : 3;
    execSync(`python3 -c "
import sys; from PIL import Image
fs=sys.argv[1:]; ims=[Image.open(f) for f in fs]; w,h=ims[0].size; s=0.5
cols=${cols}; rows=(len(ims)+cols-1)//cols
sheet=Image.new('RGB',(int(w*s)*cols,int(h*s)*rows))
for i,im in enumerate(ims): sheet.paste(im.resize((int(w*s),int(h*s))),((i%cols)*int(w*s),(i//cols)*int(h*s)))
sheet.save('shots/${prefix}-sheet.png')" ${files.join(' ')}`);
    console.log('sheet: shots/' + prefix + '-sheet.png');
  }
  await b.close();
})();
