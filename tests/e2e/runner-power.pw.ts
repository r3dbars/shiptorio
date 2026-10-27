import { test, expect } from '@playwright/test';

test('runner heartbeats show Claude Code and Codex as separate Power plants before a job', async ({ page, context }, info) => {
  const repo = `fixture/power-${info.project.name}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.request.post(`/__test/${repo}/seed?ore=0`);
  const session = await (await page.request.post('/__test/session')).json();
  await context.addCookies(session.cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('='); return { name: entry.slice(0, i), value: entry.slice(i + 1), url: String(info.project.use.baseURL) };
  }));
  const post = async (path: string, data: unknown, token?: string) => {
    const response = await page.request.post(path, { data, headers: { origin: String(info.project.use.baseURL), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  const { token } = await post(`/api/repos/${repo}/runner/pair`, {});
  await post(`/api/runner/${repo}/heartbeat`, { harnesses: ['codex', 'claude_code'], authRequired: [] }, token);
  await page.goto(`/?source=live&repo=${repo}&tour=0&connect=1`);
  await expect(page).toHaveTitle(/Shiptorio/i);
  const power = page.getByRole('region', { name: 'Power', exact: true });
  await expect(power).toBeVisible();
  for (const name of ['Codex', 'Claude Code']) {
    const plant = power.locator('.plant').filter({ has: page.locator('.tt').filter({ hasText: name }) });
    await expect(plant).toHaveCount(1); await expect(plant).toContainText('ready');
    await expect(plant).toContainText('Signed in'); await expect(plant.getByRole('meter')).toHaveCount(0);
  }
  await expect(power.locator('.lrow').filter({ hasText: /Codex|Claude Code/ })).toHaveCount(0);
  await power.locator(".plant.solar").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/shiptorio-runner-power-${info.project.name}.png` });
  await post(`/api/runner/${repo}/heartbeat`, { harnesses: ['codex'], authRequired: ['claude_code'] }, token);
  await expect(power.locator('.plant').filter({ hasText: 'Claude Code' })).toContainText('offline');
  await expect(power.locator('.plant').filter({ hasText: 'Codex' })).toContainText('ready');
  await power.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(power).toBeHidden();
  expect(errors).toEqual([]);
});
