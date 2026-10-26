const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [html, secs] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] }); const p = await b.newPage(); p.setDefaultTimeout(170000);
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setContent('<!doctype html><html><body>' + fs.readFileSync(html, 'utf8') + '</body></html>', { waitUntil: 'load' }); await p.waitForTimeout(800);
  const r = await p.evaluate((secs) => { const out = []; for (let i = 0; i < secs / 30; i++) { IRON.debug.advance(30); const s = IRON.debug.stats(); out.push(((i + 1) * 30) + 's ' + JSON.stringify(s.counters) + ' ' + JSON.stringify(s.stations) + ' ' + JSON.stringify(s.paths)); } return out; }, +secs);
  console.log(r.join('\n')); console.log(errs.slice(0, 10).join('\n') || 'no errors'); await b.close(); })();
