const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  for (const f of process.argv.slice(2)) { const p = await b.newPage(); p.setDefaultTimeout(170000);
    await p.setContent('<!doctype html><html><body>' + fs.readFileSync(f, 'utf8') + '</body></html>', { waitUntil: 'load' }); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { IRON.debug.advance(5); let m = 0, t = 0; IRON.scene.traverse((o) => { if (o.isMesh) { m++; const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return [m, Math.round(t)]; });
    console.log(f, 'meshes', r[0], 'tris', r[1]); await p.close(); }
  await b.close(); })();
