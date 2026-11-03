import { chromium } from '@playwright/test';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5191/deck.html?source=live');
const cards = () => p.locator('.ic-card:not(.ic-ghost)').evaluateAll(els => els.map(e => e.dataset.card + ' ' + (e.querySelector('.ic-title')?.textContent)));
for (let n = 0; n < 80; n++) {
  const c = p.locator('.ic-card:not(.ic-ghost)').first();
  await c.waitFor({ timeout: 20000 }).catch(() => {});
  const list = await cards(); if (n > 25) console.log(n, list);
  if (list.some(x => x.startsWith('story-connect'))) break;
  const hold = await c.evaluate(el => el.classList.contains('hold')).catch(() => false);
  await c.locator('.approve').click(hold ? { delay: 1200 } : { timeout: 3000 }).catch(e => console.log('click fail', e.message.split('\n')[0]));
  await p.waitForTimeout(400);
}
await b.close();
