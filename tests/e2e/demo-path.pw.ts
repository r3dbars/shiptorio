import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';

// The demo's first minute in a real browser, at the locked canvas sizes (contract.ts CANVAS 640x360, CANVAS_PORTRAIT
// 360x640): a guest on /deck?source=live plays Shippy's whole tour, and nothing on the way can reach a model. The page
// opens no socket and asks the API only "who is here" (/api/me) until "Build mine". The card stays on screen at both
// sizes, the page never scrolls sideways, and Build mine is the password popup (or, with the preview cookie, GitHub).
// The headless half of this path (card order, the live socket loop, colors, dots, cap card): web/test/demo-path-deck.test.ts.

const SIZES = { desktop: { width: 640, height: 360 }, phone: { width: 360, height: 640 } } as const;

/** A fresh guest: no session. With access, the preview cookie only (what shiptorio.dev's public deck gives a stranger). */
async function guest(browser: Browser, info: TestInfo, size: { width: number; height: number }, access: boolean) {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: size, deviceScaleFactor: 1, hasTouch: size.width < size.height });
  // Hard stop at the network edge: nothing off-site loads. A server redirect isn't routed, so the GitHub sign-in hop is
  // read off /auth/login's own answer (where it sends the browser) and the browser stays on a stub page.
  const offsite: string[] = [];
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => {
    offsite.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Off site</title>' });
  });
  await context.route('**/auth/login**', async route => {
    const answer = await route.fetch({ maxRedirects: 0 });
    offsite.push(answer.headers().location ?? `no redirect: ${answer.status()}`);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>GitHub</title>' });
  });
  if (access) expect((await context.request.post('/__test/access')).ok()).toBe(true);
  const page = await context.newPage();
  const api: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on('websocket', ws => sockets.push(ws.url()));
  page.on('request', r => { const u = new URL(r.url()); if (/^\/(api|auth|access|connect)\b/.test(u.pathname)) api.push(`${r.method()} ${u.pathname}`); });
  page.on('pageerror', e => errors.push(e.message));
  return { context, page, api, sockets, errors, offsite };
}

const card = (page: Page) => page.locator('#card-host .ic-card:not(.ic-ghost):not(.ic-empty)');
const title = async (page: Page) => (await card(page).locator('.ic-title').textContent({ timeout: 30_000 }))?.trim() ?? '';

/** On screen: the whole card and its yes inside the viewport, and the page itself never wider than the screen. */
async function fits(page: Page, size: { width: number; height: number }, what: string) {
  // measure the card at rest: the last one has flown off and this one has finished sliding in
  await expect(page.locator('#card-host .ic-ghost')).toHaveCount(0, { timeout: 10_000 });
  await page.locator('#card-host').evaluate(host => Promise.all(host.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)));
  const box = await card(page).boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.x, `${what}: left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${what}: top edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what}: right edge`).toBeLessThanOrEqual(size.width + 0.5);
  expect(box!.y + box!.height, `${what}: bottom edge`).toBeLessThanOrEqual(size.height + 0.5);
  const yes = await card(page).locator('.ic-btn.approve').boundingBox();
  expect(yes && yes.height >= 24 && yes.y + yes.height <= size.height + 0.5, `${what}: its yes can be tapped`).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${what}: no sideways scroll`).toBe(true);
}

/** Play every tour card with its yes (a held press on the one that ships) until the card with this title. */
async function playTour(page: Page, size: { width: number; height: number }, until: string) {
  const seen: string[] = [];
  for (let i = 0; i < 200; i++) {
    await expect(card(page)).toBeVisible({ timeout: 60_000 });
    const now = await title(page);
    if (seen.at(-1) !== now) { seen.push(now); await fits(page, size, now); }
    if (now === until) return seen;
    const yes = card(page).locator('.ic-btn.approve');
    if (await card(page).evaluate(el => el.classList.contains('hold'))) {
      const b = (await yes.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
    } else await yes.click();
    // a tap first finishes Shippy's typed line, then goes on: wait for this card to change (or the deck to take over)
    await expect.poll(async () => (await card(page).count()) ? title(page) : '', { timeout: 3_000 }).not.toBe(now).catch(() => undefined);
  }
  throw new Error(`never reached "${until}" after ${seen.join(' / ')}`);
}

for (const [name, size] of Object.entries(SIZES)) {
  test.describe(`${name} ${size.width}x${size.height}`, () => {
    // The sizes are set here, so one project runs them; the phone projects would only repeat the same viewports.
    test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'sized explicitly'); });
    test.setTimeout(300_000); // the whole tour, read at 8x speed

    test('a guest plays the whole tour first: no socket, only /api/me, then Build mine goes on to GitHub', async ({ browser }, info) => {
      const g = await guest(browser, info, size, true);
      await g.page.goto('/deck?source=live&speed=8');
      await expect(g.page.locator('[data-deck-ready]')).toHaveCount(1, { timeout: 60_000 });
      expect(await title(g.page)).toBe("Hi, I'm Shippy!");
      await expect(g.page.locator('#deck-password')).toHaveCount(0);
      const seen = await playTour(g.page, size, 'Want to build yours?');
      expect(seen[0]).toBe("Hi, I'm Shippy!");
      expect(seen).toContain('Ship this fix?');
      expect(seen.at(-1)).toBe('Want to build yours?');
      expect(g.sockets).toEqual([]);
      expect([...new Set(g.api)]).toEqual(['GET /api/me']); // the page asks who is here; nothing else, so no model call
      await card(g.page).locator('.ic-btn.approve').click();
      await expect.poll(() => g.offsite.find(u => u.startsWith('https://github.com/login/oauth/authorize')) ?? '', { timeout: 30_000 }).toContain('client_id=fixture-client');
      expect(g.api).toContain('GET /auth/login');
      expect(g.sockets).toEqual([]);
      expect(g.errors).toEqual([]);
      await g.context.close();
    });

    test('without the preview password, Build mine is the password popup, on screen, then GitHub', async ({ browser }, info) => {
      const g = await guest(browser, info, size, true);
      // what shiptorio.dev answers a stranger who has the public deck but not the password
      await g.page.route('**/api/me', route => route.fulfill({ status: 401, contentType: 'text/plain', body: 'Preview password required' }));
      await g.page.goto('/deck?source=live&speed=8');
      await expect(g.page.locator('[data-deck-ready]')).toHaveCount(1, { timeout: 60_000 });
      await playTour(g.page, size, 'Want to build yours?');
      await expect(g.page.locator('#deck-password')).toHaveCount(0); // never before the last card
      await card(g.page).locator('.ic-btn.approve').click();
      const popup = g.page.getByRole('dialog', { name: 'Enter the password' });
      await expect(popup).toBeVisible();
      const box = (await popup.locator('form').boundingBox())!;
      expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 0.5 && box.y + box.height <= size.height + 0.5).toBe(true);
      await expect(g.page.getByLabel('Password', { exact: true })).toBeFocused();
      await g.page.getByLabel('Password', { exact: true }).fill('not-the-password');
      await g.page.getByRole('button', { name: 'Enter the factory' }).click();
      await expect(popup.getByRole('alert')).toHaveText('That password didn’t work.');
      await g.page.getByLabel('Password', { exact: true }).fill('public-test-only-preview');
      await g.page.getByRole('button', { name: 'Enter the factory' }).click();
      await expect.poll(() => g.offsite.find(u => u.startsWith('https://github.com/login/oauth/authorize')) ?? '', { timeout: 30_000 }).toContain('client_id=fixture-client');
      expect(g.api.filter(r => !['GET /api/me', 'POST /access', 'GET /auth/login'].includes(r))).toEqual([]);
      expect(g.sockets).toEqual([]);
      await g.context.close();
    });
  });
}
