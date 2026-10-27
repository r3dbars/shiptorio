import { test, expect } from '@playwright/test';

test('no-login judge replay: three mines → plan → rework gauntlet → permit → rockets → Floor', async ({ page }, info) => {
  const errors: string[] = [], privateRequests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (/\/(api|auth|connect)\//.test(new URL(r.url()).pathname)) privateRequests.push(r.url()); });
  await page.addInitScript(() => {
    (window as any).__judgeShips = [];
    window.addEventListener('shiptorio:ship', e => (window as any).__judgeShips.push((e as CustomEvent).detail));
  });
  // Intentionally hostile query cannot turn the public route into a live factory.
  const response = await page.goto('/judge?source=live&repo=private/repo&autolaunch=1');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/judge\?source=sim$/);
  await expect(page).toHaveTitle(/Shiptorio/);
  await expect(page.getByRole('heading', { name: 'A factory that ships fixes' })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
  await page.getByRole('button', { name: 'Play the 90-second story' }).click();
  const story = page.getByRole('region', { name: 'Judge story', exact: true });
  await expect(story).toHaveAttribute('data-beat', '1');
  await expect(page.getByTestId('judge-item-github_issue')).toContainText('Clarify the shipping FAQ');
  await expect(page.getByTestId('judge-item-sentry')).toContainText('dana@example.com');
  await expect(story).toHaveAttribute('data-beat', '2');
  await expect(story).toContainText('plans a guarded total');
  await expect(story).toHaveAttribute('data-beat', '3');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'working');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-scars', '1');
  await expect(story).toContainText('CAUGHT');
  await expect(story).toHaveAttribute('data-beat', '4');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'on_pad');
  await expect(story.getByRole('list', { name: 'Gauntlet receipts' })).toContainText(['CI inspector: PASS', 'Verify bay: PASS', 'AI review: PASS']);
  await info.attach('judge-permit', { body: await page.screenshot(), contentType: 'image/png' });
  await page.screenshot({ path: `/tmp/shiptorio-judge-${info.project.name}.png` });
  if (info.project.name !== 'desktop') {
    await page.getByRole('button', { name: 'Grant docs permit' }).click();
    await expect(page.getByRole('button', { name: 'Permit granted' })).toBeDisabled();
  }
  await expect(story).toHaveAttribute('data-beat', '5');
  await expect(page.getByTestId('judge-item-github_issue')).toHaveAttribute('data-state', 'launched');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'on_pad');
  await expect(story).toHaveAttribute('data-beat', '6');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'launched');
  await expect(story).toHaveAttribute('data-beat', '7');
  await expect(page.getByTestId('judge-autonomy')).toHaveText('Floor');
  await expect(page.getByTestId('judge-complete')).toBeVisible();
  await expect(page.getByTestId('judge-rockets')).toHaveText('2');
  await expect(story).toContainText('Users unblocked: 112');
  await expect.poll(() => page.evaluate(() => (window as any).__judgeShips.length)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(privateRequests).toEqual([]);
  await page.getByRole('button', { name: 'Replay', exact: true }).first().click();
  await expect(page.getByTestId('judge-rockets')).toHaveText('0');
  await expect(page.getByTestId('judge-autonomy')).toHaveText('Advisor');
  await expect(story).toHaveAttribute('data-beat', '0');
});
