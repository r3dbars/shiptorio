import { test, expect } from '@playwright/test';

test('no-login judge replay: three mines → plan → rework gauntlet → permit → rockets → Floor', async ({ page }, info) => {
  const epoch = new Date('2026-10-27T12:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(new Date(epoch.getTime() + 1000));
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
  expect((await page.request.head('/judge')).status()).toBe(200);
  await expect(page).toHaveURL(/\/judge\?source=sim$/);
  await expect(page).toHaveTitle(/Shiptorio/);
  await expect(page.getByRole('heading', { name: 'A factory that ships fixes' })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
  await page.getByRole('button', { name: 'Play the 90-second story' }).focus();
  await page.keyboard.press('Enter');
  const story = page.getByRole('region', { name: 'Judge story', exact: true });
  // Advance ordinary simulation ticks individually so React observes each state.
  // Slow rendering or evidence capture cannot skip a transient story beat.
  const progress = story.locator('progress');
  const advanceTo = async (target: number) => {
    while (Number(await progress.getAttribute('value')) < target) {
      const tick = Number(await progress.getAttribute('value'));
      // One 900ms interval per step; skip redundant WebGL animation frames.
      await page.clock.fastForward(900);
      await expect.poll(async () => Number(await progress.getAttribute('value'))).toBeGreaterThan(tick);
    }
  };
  await advanceTo(6);
  await expect(story).toHaveAttribute('data-beat', '1');
  await expect(page.getByTestId('judge-item-github_issue')).toContainText('Clarify the shipping FAQ');
  await expect(page.getByTestId('judge-item-sentry')).toContainText('dana@example.com');
  await advanceTo(14);
  await expect(story).toHaveAttribute('data-beat', '2');
  await expect(story).toContainText('plans a guarded total');
  await advanceTo(25);
  await expect(story).toHaveAttribute('data-beat', '3');
  while (await page.getByTestId('judge-item-sentry').getAttribute('data-state') !== 'working' && Number(await progress.getAttribute('value')) < 58) {
    await advanceTo(Number(await progress.getAttribute('value')) + 1);
  }
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'working');
  await advanceTo(50);
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-scars', '1');
  await expect(story).toContainText('CAUGHT');
  await advanceTo(58);
  await expect(story).toHaveAttribute('data-beat', '4');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'on_pad');
  await expect(story.getByRole('list', { name: 'Gauntlet receipts' }).getByRole('listitem')).toContainText(['CI inspector: PASS', 'Verify bay: PASS', 'AI review: PASS']);
  const headerBox = await page.locator('.judge-header').boundingBox();
  const captionBox = await story.boundingBox();
  expect(captionBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  expect(captionBox!.y + captionBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  // On phones the factory stays in view: the caption never takes more than about half the screen.
  if (info.project.name !== 'desktop') expect(captionBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.5);
  await expect(story).toHaveAttribute('data-beat', '4');
  await info.attach('judge-permit', { body: await page.screenshot(), contentType: 'image/png' });
  await page.screenshot({ path: `/tmp/shiptorio-judge-${info.project.name}.png` });
  await expect(story).toHaveAttribute('data-beat', '4');
  if (info.project.name !== 'desktop') {
    await page.getByRole('button', { name: 'Grant docs permit' }).click();
    await expect(page.getByRole('button', { name: 'Permit granted' })).toBeDisabled();
  }
  await advanceTo(74);
  await expect(story).toHaveAttribute('data-beat', '5');
  await expect(page.getByTestId('judge-item-github_issue')).toHaveAttribute('data-state', 'launched');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'on_pad');
  await advanceTo(86);
  await expect(story).toHaveAttribute('data-beat', '6');
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-state', 'launched');
  await advanceTo(94);
  await expect(story).toHaveAttribute('data-beat', '7');
  await expect(page.getByTestId('judge-autonomy')).toHaveText('Floor');
  await advanceTo(100);
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
  // Beat 0 lasts under two seconds, so a slow runner may already be on beat 1: either means the story restarted.
  await expect(story).toHaveAttribute('data-beat', /^[01]$/);
});

test('judge replay plays in the vertical shaft map', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/judge?world=shaft&repo=private/repo');
  await expect(page).toHaveURL(/\/judge\?source=sim&world=shaft$/);
  await page.getByRole('button', { name: 'Play the 90-second story' }).click();
  const story = page.getByRole('region', { name: 'Judge story', exact: true });
  await expect(page.getByTestId('judge-item-sentry')).toHaveAttribute('data-scars', '1', { timeout: 60_000 });
  await expect(story).toHaveAttribute('data-beat', '4', { timeout: 60_000 });
  await page.screenshot({ path: `/tmp/shiptorio-judge-shaft-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
