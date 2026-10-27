import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import WebSocket from 'ws';
import type { FactoryState, Move } from '../../shared/src';

test('60s offline while a PR ships → snapshot in 2s, one celebration, no replay', async ({ page, context }, info) => {
  const repo = `fixture/reconnect-${info.project.name}`;
  const origin = String(info.project.use.baseURL);
  const post = async (path: string, data?: unknown, token?: string) => {
    const res = await page.request.post(path, { data, headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    expect(res.ok(), await res.text()).toBe(true); return res.json();
  };
  const { repoId } = await post(`/__test/${repo}/seed`);
  const { cookie } = await post('/__test/session');
  await context.addCookies(cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('='); return { name: entry.slice(0, i), value: entry.slice(i + 1), url: origin };
  }));
  // Independent operator socket continues advancing the real DO while the player is offline.
  const operator = new WebSocket(`${origin.replace('http', 'ws')}/api/repos/${repo}/factory`, { headers: { cookie, origin } });
  let deck: Move[] = [];
  operator.on('message', raw => {
    if (String(raw) === 'pong') return;
    const msg = JSON.parse(String(raw));
    if (msg.type === 'snapshot') deck = msg.state.deck ?? [];
    if (msg.type === 'deck') deck = msg.deck;
  });
  try {
    await expect.poll(() => operator.readyState).toBe(WebSocket.OPEN);
    const { token } = await post(`/api/repos/${repo}/runner/pair`, {});
    await post(`/api/runner/${repo}/heartbeat`, { harnesses: ['codex'] }, token);
    await post(`/__test/${repo}/tick`);
    const choose = async (tool: string) => {
      await expect.poll(() => deck.some(m => m.options.some(o => o.actions.some(a => a.tool === tool)))).toBe(true);
      const move = deck.find(m => m.options.some(o => o.actions.some(a => a.tool === tool)))!;
      const option = move.options.find(o => o.actions.some(a => a.tool === tool))!;
      operator.send(JSON.stringify({ type: 'choose_move', moveId: move.id, optionId: option.id }));
    };
    await choose('plan_runner_job');
    await expect.poll(async () => (await (await page.request.get(`/api/repos/${repo}/runner/jobs`)).json()).length).toBe(1);
    await post(`/__test/${repo}/tick`);
    await choose('approve_runner_job');
    await expect.poll(async () => (await (await page.request.get(`/api/repos/${repo}/runner/jobs`)).json())[0]?.status).toBe('ready');
    const { job } = await post(`/api/runner/${repo}/claim`, { harnesses: ['codex'] }, token);
    await post(`/api/runner/${repo}/finish`, { jobId: job.id, lease: job.lease, ok: true, sha: 'b'.repeat(40), summary: 'Reconnect regression', checks: ['typecheck', 'test', 'build'], proof: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), failsOnBase: true, passesOnHead: true, command: 'bun test src/cart.test.ts', logTail: 'Fixture only; no coding agent executes.' } }, token);
    const state = async (): Promise<FactoryState> => (await (await page.request.get(`/api/repos/${repo}/export`)).json()).state;
    await expect.poll(async () => (await state()).items[0]?.prNumber).toBe(99);
    await post(`/__test/${repo}/check`);
    for (let i = 0; i < 3; i++) await post(`/__test/${repo}/tick`);
    expect((await state()).items[0].state).toBe('on_pad');
    await page.addInitScript(() => {
      (window as any).__ships = [];
      window.addEventListener('shiptorio:ship', e => (window as any).__ships.push((e as CustomEvent).detail));
      (window as any).__notices = [];
      new MutationObserver(() => {
        if (document.body?.textContent?.includes('Reconnecting…')) (window as any).__notices.push(Date.now());
      }).observe(document, { childList: true, subtree: true });
    });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    let playerOnline = true, snapshots = 0;
    await page.routeWebSocket('**/api/repos/**/factory', socket => {
      const server = socket.connectToServer();
      server.onMessage(message => {
        if (!playerOnline) return;
        if (typeof message === "string" && message !== "pong" && JSON.parse(message).type === "snapshot") snapshots++;
        socket.send(message);
      });
      socket.onMessage(message => { if (playerOnline) server.send(message); });
    });
    await page.goto(`/?source=live&repo=${repo}&tour=0`);
    await expect(page).toHaveTitle(/Shiptorio/);
    await expect(page.locator('canvas').first()).toBeVisible();
    // The map's accessible description is driven by the same applied FactoryState.
    const map = page.locator('#map-summary');
    await expect(map).toContainText('0 shipped');
    const clock = new Date();
    await page.clock.install({ time: clock });
    await page.clock.pauseAt(new Date(clock.getTime() + 1000));
    playerOnline = false;
    await context.setOffline(true);
    // The Worker remains online; only the player's browser network is cut.
    const merged = JSON.stringify({ action: 'closed', installation: { id: 1 }, repository: { id: repoId, full_name: repo, default_branch: 'main' }, pull_request: { number: 99, merged: true, merge_commit_sha: 'b'.repeat(40) } });
    const hook = await page.request.post('/webhooks/github', { data: merged, headers: { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-github-delivery': crypto.randomUUID(), 'x-hub-signature-256': `sha256=${createHmac('sha256', 'public-test-hook').update(merged).digest('hex')}` } });
    expect(hook.status()).toBe(202);
    await post(`/__test/${repo}/tick`); // the fixture deliberately disables natural alarms
    await expect.poll(async () => (await state()).items[0].state).toBe('launched');
    await page.clock.fastForward(60_000);
    await expect(map).toContainText('0 shipped');
    const before = snapshots;
    const start = Date.now();
    playerOnline = true;
    await context.setOffline(false);
    // Restoring Chromium networking dispatches the real online event.
    await expect.poll(() => snapshots, { timeout: 2000, intervals: [25, 50, 100] }).toBe(before + 1);
    await expect(map).toContainText('1 shipped', { timeout: 2000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
    await expect.poll(() => page.evaluate(() => (window as any).__ships.length)).toBe(1);
    await expect(page.getByText('Reconnecting…', { exact: true })).toHaveCount(0);
    // Force another full snapshot at the same cursor: no second rocket or sound event.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => snapshots).toBe(before + 2);
    await page.clock.fastForward(1000);
    await expect(map).toContainText('1 shipped');
    expect(await page.evaluate(() => (window as any).__ships.length)).toBe(1);
    await page.clock.resume();
    await page.screenshot({ path: `/tmp/shiptorio-reconnect-${info.project.name}.png` });
    expect(errors).toEqual([]);
    await info.attach('recovery', { body: JSON.stringify({ elapsedMs: elapsed, shipped: 1, celebrations: 1 }), contentType: 'application/json' });
  } finally { operator.close(); }
});

test('a 1s blip never shows reconnect UI; a long outage shows a quiet notice', async ({ page, context }, info) => {
  const repo = `fixture/blip-${info.project.name}`;
  await page.request.post(`/__test/${repo}/seed?ore=0`);
  const { cookie } = await (await page.request.post('/__test/session')).json();
  await context.addCookies(cookie.split('; ').map((entry: string) => { const i = entry.indexOf('='); return { name: entry.slice(0, i), value: entry.slice(i + 1), url: String(info.project.use.baseURL) }; }));
  let snapshots = 0;
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    if (typeof payload === 'string' && payload !== 'pong' && JSON.parse(payload).type === 'snapshot') snapshots++;
  }));
  await page.goto(`/?source=live&repo=${repo}&tour=0`);
  await expect(page.locator('#map-summary')).toContainText(repo);
  const clock = new Date();
  await page.clock.install({ time: clock });
  await page.clock.pauseAt(new Date(clock.getTime() + 1000));
  await page.evaluate(() => {
    (window as any).__notices = [];
    new MutationObserver(() => {
      if (document.body.textContent?.includes('Reconnecting…')) (window as any).__notices.push(1);
    }).observe(document.body, { subtree: true, childList: true });
  });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); // force dead-socket discovery
  await page.clock.fastForward(1000);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Reconnecting…', { exact: true })).toHaveCount(0);
  await expect.poll(() => snapshots).toBe(2);
  expect(await page.evaluate(() => (window as any).__notices)).toEqual([]);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.clock.fastForward(3001);
  await expect(page.getByText('Reconnecting…', { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/shiptorio-reconnect-notice-${info.project.name}.png` });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Reconnecting…', { exact: true })).toHaveCount(0);
});
