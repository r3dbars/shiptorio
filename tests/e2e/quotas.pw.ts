import { test, expect } from '@playwright/test';
test('quota warning → cap → raise link → automatic recovery and retry cooldown', async ({ page, context }, info) => {
  const repo = `fixture/${info.project.name}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.request.post(`/__test/${repo}/seed?ore=0`);
  const session = await (await page.request.post('/__test/session')).json();
  await context.addCookies(session.cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('='); return { name: entry.slice(0, i), value: entry.slice(i + 1), url: String(info.project.use.baseURL) };
  }));
  let used = 16, retry = false;
  const resetsAt = Date.now() + 3600000;
  await page.route(`**/api/repos/${repo}/limits`, route => route.fulfill({ json: {
    disabled: false, quotas: [{ id: 'runs', label: 'Build runs / day', used, limit: 20, resetsAt, raiseUrl: '/admin/signup?login=fixture', status: used >= 20 ? 'stopped' : used >= 16 ? 'warning' : 'ok' }],
    retries: retry ? [{ itemId: 'gh-42', failures: 3, reason: 'Planner unavailable', retryAt: resetsAt }] : [],
  } }));
  await page.goto(`/?source=live&repo=${repo}&tour=0`);
  await expect(page).toHaveTitle(/Shiptorio/i);
  const card = page.getByRole('status', { name: 'Factory limits' });
  await expect(card).toContainText('near limit');
  await expect(card).toContainText('16 / 20');
  await expect(card).toContainText('00:00 UTC');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await card.getByText('All limits', { exact: true }).click();
  await expect(card.locator('details')).toHaveAttribute('open', '');
  const box = await card.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `/tmp/shiptorio-quota-${info.project.name}-warning.png` });
  used = 20;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card).toContainText('limit reached');
  // Owner administration stays in a new tab so returning to the factory refreshes the live card.
  await page.route('**/admin/signup?login=fixture', route => route.fulfill({ contentType: 'text/html', body: '<title>Shiptorio quota admin</title><h1>Signup and quotas</h1>' }));
  const popupPromise = page.waitForEvent('popup');
  await card.getByRole('link', { name: 'Raise limit' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain('/admin/signup?login=fixture');
  await popup.close();
  used = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card).toHaveCount(0);
  retry = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card).toContainText('3/3 failed tries today. No build run charged.');
  await page.screenshot({ path: `/tmp/shiptorio-quota-${info.project.name}-retry.png` });
  expect(errors).toEqual([]);
});
