import { test, expect } from '@playwright/test';

test('owner spend chip → thinking panel → saved hard stop → resume; 80% warning', async ({ page, context }, info) => {
  const repo = `fixture/spend-${info.project.name}`, path = `/api/repos/${repo}/spend`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.request.post(`/__test/${repo}/seed?ore=0`);
  const session = await (await page.request.post('/__test/session')).json();
  await context.addCookies(session.cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('='); return { name: entry.slice(0, i), value: entry.slice(i + 1), url: String(info.project.use.baseURL) };
  }));
  await page.goto(`/?source=live&repo=${repo}&tour=0`);
  await expect(page).toHaveTitle(/Shiptorio/i);
  const chip = page.getByRole('button', { name: /Planner spend:/ });
  await expect(chip).toBeVisible();
  await chip.click();
  const panel = page.getByRole('region', { name: 'Planner daily budget' });
  await expect(panel).toContainText('0 tokens in');
  await panel.getByLabel('Daily budget (USD)').fill('0');
  await panel.getByRole('button', { name: 'Save daily budget' }).click();
  await expect(panel).toContainText('I paused paid thinking');
  expect(await (await page.request.get(path)).json()).toMatchObject({ dailyBudgetUsd: 0, status: 'stopped' });
  await page.screenshot({ path: `/tmp/shiptorio-spend-${info.project.name}-stopped.png` });
  await panel.getByLabel('Daily budget (USD)').fill('5');
  await panel.getByRole('button', { name: 'Save daily budget' }).click();
  await expect(panel).toContainText('$5.00');
  // Accounting thresholds are tested in SQLite; this fixture exercises the warning's rendered state.
  const actual = await (await page.request.get(path)).json();
  await page.route(`**${path}`, route => route.fulfill({ json: { ...actual, estimatedUsd: 4, status: 'warning', explanation: "This factory has used at least 80% of today's thinking budget." } }));
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Thinking budget at 80%' })).toBeVisible();
  await expect(chip).toContainText('~$4.00');
  await page.screenshot({ path: `/tmp/shiptorio-spend-${info.project.name}-warning.png` });
  expect(errors).toEqual([]);
});
