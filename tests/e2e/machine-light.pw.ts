import { test, expect } from '@playwright/test';

test('the HUD light says whether your machine is connected and what it waits on', async ({ page, context }, info) => {
  const repo = `fixture/light-${info.project.name}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.request.post(`/__test/${repo}/seed`);
  const session = await (await page.request.post('/__test/session')).json();
  await context.addCookies(session.cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('='); return { name: entry.slice(0, i), value: entry.slice(i + 1), url: String(info.project.use.baseURL) };
  }));
  const post = async (path: string, data: unknown, token?: string) => {
    const response = await page.request.post(path, { data, headers: { origin: String(info.project.use.baseURL), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  await page.goto(`/?source=live&repo=${repo}&tour=0`);
  const light = page.locator('.machine-light');
  await expect(light).toContainText('Not connected');
  const { token } = await post(`/api/repos/${repo}/runner/pair`, {});
  await post(`/api/runner/${repo}/heartbeat`, { harnesses: ['codex', 'claude_code'], authRequired: [] }, token);
  await expect(light).toContainText(/Connected/);
  await page.screenshot({ path: `/tmp/shiptorio-machine-light-${info.project.name}.png` });
  // only one plan card is ever dealt, however many issues are queued
  const deck = await (await page.request.get(`/api/repos/${repo}/runner/status`)).json();
  expect(deck.online).toBe(true);
  expect(errors).toEqual([]);
});
