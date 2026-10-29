import { chromium } from '@playwright/test';
const out = '/tmp/claude-0/live';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desk', { width: 1280, height: 720 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const t0 = Date.now();
  await p.goto('http://localhost:5191/deck.html?source=live');
  const card = p.locator('.ic-card:not(.ic-ghost)').first();
  await card.waitFor({ timeout: 30000 });
  console.log(name, 'url', p.url(), 'first card at', Date.now() - t0, 'ms');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${name}-00.png` });
  const titles = [];
  for (let n = 0; n < 60; n++) {
    const ask = p.getByRole('button', { name: 'Create my factory', exact: true });
    if (await ask.count()) break;
    const c = p.locator('.ic-card:not(.ic-ghost)[data-card^="tour-"]').first();
    try { await c.waitFor({ timeout: 20000 }); } catch { if (await ask.count()) break; throw new Error('stuck after ' + titles.join(' | ')); }
    const title = await c.locator('.ic-title').innerText().catch(() => '?');
    if (titles.at(-1) !== title) { titles.push(title); await p.screenshot({ path: `${out}/${name}-${String(titles.length).padStart(2, '0')}.png` }); }
    const hold = await c.evaluate(el => el.classList.contains('hold'));
    await c.locator('.approve').click(hold ? { delay: 1200 } : {});
    if (hold) { for (const s of [1, 1, 1, 1, 1, 1, 1]) { await p.waitForTimeout(s * 1000); await p.screenshot({ path: `${out}/${name}-rocket-${Date.now()-t0}.png` }); } }
    await p.waitForTimeout(300);
  }
  await p.screenshot({ path: `${out}/${name}-end.png` });
  console.log(name, 'total', Math.round((Date.now() - t0) / 1000), 's', titles.join(' | '), 'errors', errs);
  await ctx.close();
}
await b.close();
