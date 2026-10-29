import { test, expect, type Page, type BrowserContext } from '@playwright/test';
async function ownerSession(page: Page, context: BrowserContext, baseURL: string) {
  const session = await (await page.request.post('/__test/session')).json();
  await context.addCookies(session.cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('='); return { name: entry.slice(0, i), value: entry.slice(i + 1), url: baseURL };
  }));
}
async function saveNativeQuota(admin: Page, baseURL: string) {
  await expect(admin.locator('meta[name="viewport"]')).toHaveAttribute('content', /^width=device-width,\s*initial-scale=1$/);
  const runInput = admin.getByRole('spinbutton', { name: 'Runs/day (UTC)', exact: true });
  await expect(runInput).toHaveValue('20');
  await runInput.fill('25');
  const saved = admin.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/admin/signup');
  await admin.getByRole('button', { name: 'Save access and quotas', exact: true }).click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  expect((await response.request().allHeaders()).origin).toBe(new URL(baseURL).origin);
  await expect(runInput).toHaveValue('25');
  // Reload proves the change reached D1 rather than merely changing the input's local value.
  await admin.reload();
  await expect(runInput).toHaveValue('25');
  await expect(admin.getByRole('spinbutton', { name: 'Factories', exact: true })).toHaveValue('51');
  await expect(admin.getByRole('spinbutton', { name: 'Repos', exact: true })).toHaveValue('51');
}

test('native owner quota form keeps Origin and persists the save', async ({ page, context }, info) => {
  await ownerSession(page, context, info.project.use.baseURL as string);
  await page.goto('/admin/signup?login=fixture');
  await saveNativeQuota(page, info.project.use.baseURL as string);
});

test('quota warning → cap → raise link → automatic recovery and retry cooldown', async ({ page, context }, info) => {
  const repo = `fixture/${info.project.name}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.request.post(`/__test/${repo}/seed?ore=0`);
  await ownerSession(page, context, info.project.use.baseURL as string);
  let used = 16, retry = false;
  const resetsAt = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
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
  const popupPromise = page.waitForEvent('popup');
  await card.getByRole('link', { name: 'Raise limit' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain('/admin/signup?login=fixture');
  await saveNativeQuota(popup, info.project.use.baseURL as string);
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
