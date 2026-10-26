const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [html, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 860 } }); p.setDefaultTimeout(170000);
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(html, 'utf8') + '</body></html>', { waitUntil: 'load' });
  await p.waitForFunction(() => window.IRON && IRON.ready, null, { timeout: 150000 });
  const r = await p.evaluate(() => {
    IRON.debug.advance(50); IRON.setView('line'); for (let i = 0; i < 90; i++) IRON.camStep(1 / 30);
    const t0 = performance.now(); IRON.hudStep(); IRON.render(); const ms = performance.now() - t0;
    let meshes = 0, tris = 0; IRON.scene.traverse((o) => { if (o.isMesh && o.visible) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    const info = IRON.renderer.info.render; let lights = 0; IRON.scene.traverse((o) => { if (o.isPointLight) lights++; });
    return { ms: Math.round(ms), meshes, tris: Math.round(tris), calls: info.calls, triangles: info.triangles, lights, stats: IRON.debug.stats() };
  });
  console.log(JSON.stringify(r)); console.log(errs.slice(0, 10).join('\n') || 'no errors');
  if (out) await p.screenshot({ path: out, timeout: 170000 });
  await b.close();
})();
