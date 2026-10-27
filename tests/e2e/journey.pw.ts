import { createHmac } from 'node:crypto';
import { test, expect, type Locator } from '@playwright/test';
import { assertWire } from '../contract/assert-wire';

test('intro → sign in → repo → approve → PR → gauntlet → launch → rocket', async ({ page }, info) => {
  // Freeze Date only: the foundry's shift clock is visible in card baselines,
  // while timers and the actual journey must continue normally.
  const fixedTime = new Date('2026-10-27T12:00:00Z');
  await page.clock.setFixedTime(fixedTime);
  const screenshot = async (target: Locator, name: string) => {
    // Stop WebGL animation work during UI-only capture on software-rendered CI.
    // Reapply fixed Date after OAuth document navigation before each 1ms pause.
    await page.clock.setFixedTime(fixedTime);
    await page.clock.pauseAt(new Date(fixedTime.getTime() + 1));
    try { await expect(target).toHaveScreenshot(name); }
    finally { await page.clock.resume(); await page.clock.setFixedTime(fixedTime); }
  };
  const repo = `fixture/${info.project.name}`;
  let signedIn = false;
  const errors: string[] = [], wireErrors: string[] = [], messages: any[] = [];
  const choices: { moveId: string; optionId: string }[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    // Repo discovery and saving intro-seen before an account exists return 401.
    if (!signedIn && /\/api\/(repos|me\/prefs)$/.test(m.location().url) && m.text().includes('401')) return;
    if (m.type() === 'error' || m.text().includes('bad message from server')) errors.push(`${m.text()} ${m.location().url}`); });
  page.on('websocket', ws => {
    ws.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string' || payload === 'ping') return;
      const raw = JSON.parse(payload);
      if (raw.type === 'choose_move') choices.push({ moveId: raw.moveId, optionId: raw.optionId });
    });
    ws.on('framereceived', ({ payload }) => {
    if (typeof payload !== 'string') return;
    const raw = JSON.parse(payload);
    try { assertWire(raw); } catch (e) { wireErrors.push(String(e)); }
    messages.push(raw);
    if (raw.type === 'log' && raw.level === 'error') console.log('Worker:', raw.text);
    });
  });
  const post = async (path: string, data?: unknown, token?: string) => {
    const res = await page.request.post(path, { data, headers: { origin: 'http://localhost:8799', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    expect(res.ok(), `${path}: ${await res.text()}`).toBe(true);
    return res.json();
  };
  const { repoId } = await post(`/__test/${repo}/seed?ore=0`);
  await post('/__test/access');
  // Stub only GitHub's authorization screen. The Worker callback validates real OAuth state,
  // exchanges the fake code and creates the real D1 account/session/repo membership.
  await page.route('**/auth/login?**', async route => {
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const authorization = new URL(response.headers().location);
    expect(authorization.origin).toBe('https://github.com');
    const state = authorization.searchParams.get('state');
    await route.fulfill({ response, headers: { ...response.headers(), location: `http://localhost:8799/auth/callback?code=fixture&state=${state}` } });
  });
  await page.goto('/?onboard=hello&source=live');
  await expect(page).toHaveTitle(/Shiptorio/i);
  await expect(page.getByRole('region', { name: 'Welcome tour' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Welcome tour' })).toContainText('Your agents are');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const welcome = page.getByRole('region', { name: 'Welcome to Shiptorio' });
  await expect(welcome).toBeVisible();
  await screenshot(welcome, 'sign-in.png');
  // OAuth navigates to a new document before it discovers the signed-in repos.
  // Assert that real response before giving the rendered repo its own UI wait.
  const discovery = page.waitForResponse(response => new URL(response.url()).pathname === '/api/repos' && response.status() === 200);
  await page.getByRole('button', { name: 'SIGN IN WITH GITHUB' }).click();
  expect((await (await discovery).json()).repos).toContainEqual(expect.objectContaining({ fullName: repo }));
  await expect(page.getByRole('button', { name: repo })).toBeVisible();
  signedIn = true;
  await page.getByRole('button', { name: repo }).click();
  await expect(page).toHaveURL(/source=live&repo=/);
  await expect.poll(() => messages.some(m => m.type === 'snapshot')).toBe(true);
  const issue = JSON.stringify({ action: 'opened', installation: { id: 1 }, repository: { id: repoId, full_name: repo, default_branch: 'main' }, issue: { number: 1, title: 'Fix cart total', body: 'Cart total is incorrect', html_url: `https://github.com/${repo}/issues/1`, state: 'open', labels: [{ name: 'bug' }], user: { login: 'fixture' } } });
  const delivery = await page.request.post('/webhooks/github', { data: issue, headers: { 'content-type': 'application/json', 'x-github-event': 'issues', 'x-github-delivery': crypto.randomUUID(), 'x-hub-signature-256': `sha256=${createHmac('sha256', 'public-test-hook').update(issue).digest('hex')}` } });
  expect(delivery.status()).toBe(202);
  await post(`/__test/${repo}/tick`);
  await expect.poll(() => messages.some(m => m.type === 'patch' && m.patch.items?.some((i: any) => i.title === 'Fix cart total'))).toBe(true);
  const { token } = await post(`/api/repos/${repo}/runner/pair`);
  await post(`/api/runner/${repo}/claim`, { harnesses: ['codex'] }, token);
  // The fixture is an idle but connected runner while the player reads and captures cards.
  // Heartbeat through the real API, independently of the browser's screenshot clock.
  const runnerErrors: string[] = [];
  let heartbeatPending: Promise<unknown> | null = null;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatPending) return;
    heartbeatPending = post(`/api/runner/${repo}/heartbeat`, { harnesses: ['codex'] }, token)
      .catch(error => { runnerErrors.push(String(error)); })
      .finally(() => { heartbeatPending = null; });
  }, 10_000);
  try {
    // Repo onboarding opens the runner connection sheet. Complete that UI step
    // before interacting with the factory's next move underneath it.
    const power = page.getByRole('region', { name: 'Power', exact: true });
    await expect(power).toBeVisible();
    await power.getByRole('button', { name: 'Close', exact: true }).click();
    // Exercise the default Needs you card, without the legacy attention=0 route.
    const card = page.locator('section.acard').filter({ hasText: 'Fix cart total' });
    await expect(card).toBeVisible();
    await expect(page.getByRole('region', { name: 'Next move', exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: /Plan with Codex/ }).click();
    await expect.poll(async () => (await (await page.request.get(`/api/repos/${repo}/runner/jobs`)).json()).length).toBe(1);
    await post(`/__test/${repo}/tick`);
    await expect(card).toContainText('Approve');
    await screenshot(card, 'approve-plan.png');
    await card.getByRole('button', { name: /Approve and build/ }).click();
    await expect.poll(async () => (await (await page.request.get(`/api/repos/${repo}/runner/jobs`)).json())[0]?.status).toBe('ready');
    const { job } = await post(`/api/runner/${repo}/claim`, { harnesses: ['codex'] }, token);
    expect(job).toBeTruthy();
    await post(`/api/runner/${repo}/finish`, { jobId: job.id, lease: job.lease, ok: true, sha: 'b'.repeat(40), summary: 'Fixture regression fixed', checks: ['typecheck', 'test', 'build'], proof: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), failsOnBase: true, passesOnHead: true, command: 'bun test src/cart.test.ts', logTail: 'Fixture receipt; no actual coding agent executes in this suite.' } }, token);
    await post(`/__test/${repo}/check`);
    for (let i = 0; i < 3; i++) await post(`/__test/${repo}/tick`);
    await expect(card).toContainText('Launch #99');
    await expect(card).toContainText('CI, the verify bay and AI review all passed');
    await screenshot(card, 'launch-card.png');
    await page.evaluate(() => {
      (window as any).__ships = [];
      window.addEventListener('shiptorio:ship', e => (window as any).__ships.push((e as CustomEvent).detail));
    });
    const launch = card.getByRole('button', { name: /Hold to launch:.*Launch #99/ });
    await expect(launch).toBeVisible();
    const box = await launch.boundingBox();
    expect(box).not.toBeNull();
    const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    // Use real Chromium touch input in the phone projects and a mouse on desktop.
    const touch = info.project.name === 'desktop' ? null : await page.context().newCDPSession(page);
    let held = false;
    const press = async () => {
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0 }] });
      else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
      held = true;
    };
    const release = async () => {
      if (!held) return;
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
      held = false;
    };
    const before = choices.length;
    await page.clock.setFixedTime(fixedTime);
    await page.clock.pauseAt(new Date(fixedTime.getTime() + 1));
    try {
      await press();
      await page.clock.fastForward(200);
      await expect(launch).toHaveClass(/\bdown\b/);
      await release();
      await expect(launch).not.toHaveClass(/\bdown\b/);
      expect(choices).toHaveLength(before);
      expect(messages.some(m => m.type === 'patch' && m.patch.items?.some((i: any) => i.state === 'launched' && i.prNumber === 99))).toBe(false);
      await press();
      // Each step delivers a frame; one long stalled frame must not count as a hold.
      for (let i = 0; i < 10; i++) await page.clock.fastForward(100);
      await expect.poll(() => choices.length).toBe(before + 1);
      await release();
    } finally {
      await release();
      await touch?.detach();
      await page.clock.resume();
      await page.clock.setFixedTime(fixedTime);
    }
    await expect.poll(() => messages.some(m => m.type === 'patch' && m.patch.items?.some((i: any) => i.state === 'launched' && i.prNumber === 99))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__ships.some((s: any) => s.prNumber === 99))).toBe(true);
    await expect(page.locator('.ship-cel').first()).toBeVisible();
  } finally {
    clearInterval(heartbeatTimer);
    await heartbeatPending;
  }
  expect(runnerErrors).toEqual([]);
  expect(wireErrors).toEqual([]);
  expect(errors).toEqual([]);
  await info.attach('wire-trace', { body: JSON.stringify(messages, null, 2), contentType: 'application/json' });
  await info.attach('launch-consent', { body: JSON.stringify({ input: touch ? 'touch' : 'mouse', earlyReleaseMs: 200, choicesBefore: before, choicesAfter: choices.length }), contentType: 'application/json' });
});

test('sim rework scenario renders and responds', async ({ page }) => {
  await page.request.post('/__test/access');
  await page.goto('/?source=sim&scenario=rework-loop&tour=0');
  await expect(page.locator('canvas').first()).toBeVisible();
  // Tools and views wait behind the one Menu button.
  await page.getByRole('button', { name: /^Menu/ }).click();
  await expect(page.getByRole('group', { name: 'View', exact: true }).getByRole('button', { pressed: true })).toBeVisible();
  await page.getByRole('button', { name: /Line$/ }).click();
  await expect(page.getByText('The line', { exact: true })).toBeVisible();
});
