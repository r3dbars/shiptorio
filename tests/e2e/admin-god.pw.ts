import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('admin pause and resume require confirmation and persist the audited change', async ({ page, context }, info) => {
  const repo = `fixture/god-${info.project.name}`;
  const width = info.project.name === 'desktop' ? 1280 : 390;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.request.post(`/__test/${repo}/seed?ore=0`);
  const session = await (await page.request.post('/__test/session')).json();
  await context.addCookies(session.cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('=');
    return { name: entry.slice(0, i), value: entry.slice(i + 1), url: info.project.use.baseURL as string };
  }));
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const output = process.env.ADMIN_SCREENSHOTS || info.outputDir;
  await mkdir(output, { recursive: true });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Shiptorio admin', exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Factories', exact: true });
  await expect(panel.getByRole('status')).toContainText('Every change is recorded');
  const factory = panel.getByRole('combobox', { name: 'Factory', exact: true });
  await factory.selectOption(repo);
  await panel.getByRole('button', { name: 'Review change', exact: true }).click();
  await expect(panel.locator('#god-review')).toHaveText(`Pause ${repo}?`);
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.locator('#god-confirm')).toBeHidden();
  const state = async () => (await (await page.request.get('/admin/god/state')).json()).pauses;
  expect((await state()).some((p: { scope: string; paused: number }) => p.scope === repo && p.paused)).toBe(false);

  const change = async (action: string) => {
    await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption(action);
    await panel.getByRole('button', { name: 'Review change', exact: true }).click();
    const saved = page.waitForResponse(r => new URL(r.url()).pathname === '/admin/god' && r.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Apply change', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect((await response.request().allHeaders()).origin).toBe(new URL(info.project.use.baseURL as string).origin);
    expect((await response.json()).auditId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(panel.getByRole('status')).toContainText('Change saved');
  };
  await change('pause');
  expect((await state()).find((p: { scope: string }) => p.scope === repo).paused).toBe(1);
  await page.reload();
  await expect(panel.getByRole('status')).toContainText('1 manual pauses');
  await factory.selectOption(repo);
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  await page.screenshot({ animations: 'disabled', path: join(output, `admin-paused-${width}.png`) });
  await change('resume');
  expect((await state()).find((p: { scope: string }) => p.scope === repo).paused).toBe(0);
  await expect(panel.getByRole('status')).toContainText('0 manual pauses');
  expect(errors).toEqual([]);
});
