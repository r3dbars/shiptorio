import { test, expect } from '@playwright/test';
import { ServerToWeb } from '../../shared/src';

test('intro → sign in → repo → approve → PR → gauntlet → launch → rocket', async ({ page }, info) => {
  const repo = `fixture/${info.project.name}`;
  const errors: string[] = [], wireErrors: string[] = [], messages: any[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    // Repo discovery before sign-in intentionally returns 401. All other console errors fail.
    if (m.location().url.endsWith('/api/repos') && m.text().includes('401')) return;
    if (m.type() === 'error' || m.text().includes('bad message from server')) errors.push(m.text()); });
  page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
    if (typeof payload !== 'string') return;
    const raw = JSON.parse(payload);
    const result = ServerToWeb.safeParse(raw);
    if (!result.success) wireErrors.push(result.error.message);
    messages.push(raw);
    if (raw.type === 'log' && raw.level === 'error') console.log('Worker:', raw.text);
  }));
  const post = async (path: string, data?: unknown, token?: string) => {
    const res = await page.request.post(path, { data, headers: { origin: 'http://localhost:8799', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    expect(res.ok(), `${path}: ${await res.text()}`).toBe(true);
    return res.json();
  };
  await post(`/__test/${repo}/seed`);
  await page.goto('/?onboard=hello&source=live');
  await expect(page).toHaveTitle(/Shiptorio/i);
  await expect(page.getByRole('region', { name: 'Welcome tour' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Welcome tour' })).toContainText('Your agents are');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const welcome = page.getByRole('region', { name: 'Welcome to Shiptorio' });
  await expect(welcome).toBeVisible();
  await expect(welcome).toHaveScreenshot('sign-in.png');
  await page.getByRole('button', { name: 'SIGN IN WITH GITHUB' }).click();
  await expect(page.getByRole('button', { name: repo })).toBeVisible();
  await page.getByRole('button', { name: repo }).click();
  await expect(page).toHaveURL(/source=live&repo=/);
  await expect.poll(() => messages.some(m => m.type === 'snapshot' && m.state.items.some((i: any) => i.title === 'Fix cart total'))).toBe(true);
  const { token } = await post(`/api/repos/${repo}/runner/pair`);
  await post(`/api/runner/${repo}/claim`, { harnesses: ['codex'] }, token);
  await post(`/__test/${repo}/tick`);
  const card = page.getByRole('region', { name: 'Next move', exact: true });
  await card.getByRole('button', { name: /Plan with Codex/ }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/repos/${repo}/runner/jobs`)).json()).length).toBe(1);
  await post(`/__test/${repo}/tick`);
  await expect(card).toContainText('Approve');
  await expect(card).toHaveScreenshot('approve-plan.png');
  await card.getByRole('button', { name: /Approve and build/ }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/repos/${repo}/runner/jobs`)).json())[0]?.status).toBe('ready');
  const { job } = await post(`/api/runner/${repo}/claim`, { harnesses: ['codex'] }, token);
  expect(job).toBeTruthy();
  await post(`/api/runner/${repo}/finish`, { jobId: job.id, lease: job.lease, ok: true, sha: 'b'.repeat(40), summary: 'Fixture regression fixed', checks: ['typecheck', 'test', 'build'], proof: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), failsOnBase: true, passesOnHead: true, command: 'bun test src/cart.test.ts', logTail: 'Fixture receipt; no actual coding agent executes in this suite.' } }, token);
  await post(`/__test/${repo}/check`);
  for (let i = 0; i < 3; i++) await post(`/__test/${repo}/tick`);
  await expect(card).toContainText('Launch #99');
  await expect(card).toContainText('CI, the verify bay and AI review all passed');
  await expect(card).toHaveScreenshot('launch-card.png');
  await page.evaluate(() => {
    (window as any).__ships = [];
    window.addEventListener('shiptorio:ship', e => (window as any).__ships.push((e as CustomEvent).detail));
  });
  await card.getByRole('button', { name: /Launch #99/ }).click();
  await expect.poll(() => messages.some(m => m.type === 'patch' && m.patch.items?.some((i: any) => i.state === 'launched' && i.prNumber === 99))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__ships.some((s: any) => s.prNumber === 99))).toBe(true);
  await expect(page.locator('.ship-cel').first()).toBeVisible();
  expect(wireErrors).toEqual([]);
  expect(errors).toEqual([]);
  await info.attach('wire-trace', { body: JSON.stringify(messages, null, 2), contentType: 'application/json' });
});

test('sim rework scenario renders and responds', async ({ page }) => {
  await page.goto('/?source=sim&scenario=rework-loop&tour=0');
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Build', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Line$/ }).click();
  await expect(page.locator('#root')).toContainText('Rework');
});
