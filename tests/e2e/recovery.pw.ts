import { test, expect, type Page } from '@playwright/test';

// Exercise native GPU recovery on macOS; Linux CI uses the configured software GPU.
if (process.platform === 'darwin') test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-webgl'] } });

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/__test/access')).ok()).toBe(true);
});

// Observe real GPU submissions in the production bundle; no dev-only scene hooks.
async function observeGpu(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    (window as any).__gpu = { draws: 0, lost: 0, restored: 0 };
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
      const gl = (getContext as any).apply(this, args);
      if (args[0] === 'webgl2' && gl && !(gl as any).__observed) {
        (gl as any).__observed = true;
        (window as any).__gpu.gl = gl;
        (window as any).__gpu.extension = gl.getExtension('WEBGL_lose_context');
        (window as any).__gpu.canvas = this;
        this.addEventListener('webglcontextlost', () => (window as any).__gpu.lost++);
        this.addEventListener('webglcontextrestored', () => (window as any).__gpu.restored++);
        for (const key of ['drawElements', 'drawArrays']) {
          const draw = gl[key].bind(gl);
          gl[key] = (...a: any[]) => {
            draw(...a);
            if (!gl.isContextLost() && gl.getParameter(gl.FRAMEBUFFER_BINDING) === null) (window as any).__gpu.draws++;
          };
        }
      }
      return gl;
    } as typeof getContext;
  });
}

async function openShaft(page: Page) {
  await page.route('**/api/telemetry/config', route => route.fulfill({ json: { dsn: null } }));
  await page.route('**/api/me/prefs', route => route.fulfill({ json: { prefs: {} } }));
  await page.goto('/?source=sim&world=shaft&scenario=quiet-morning');
  await expect(page).toHaveTitle(/Shiptorio/);
  await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws), { timeout: 90000 }).toBeGreaterThan(0);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('lost context restores and draws within two seconds without navigation', async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await observeGpu(page);
      await openShaft(page);
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      for (let cycle = 0; cycle < 2; cycle++) {
        await page.evaluate(() => (window as any).__gpu.extension.loseContext());
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.lost)).toBe(cycle + 1);
        const before = await page.evaluate(() => (window as any).__gpu.draws);
        await page.evaluate(() => (window as any).__gpu.extension.restoreContext());
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws), { timeout: 2000, intervals: [25, 50] }).toBeGreaterThan(before);
        await expect(page.locator('.crash')).toHaveCount(0);
      }
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
      expect(errors).toEqual([]);
      await info.attach('recovered-shaft', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test('restoration waits for a real held launch gesture before submitting graphics', async ({ page }) => {
      await observeGpu(page);
      await page.goto('/?source=sim&world=shaft&scenario=checkin&simple=1');
      await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws), { timeout: 90000 }).toBeGreaterThan(0);
      const launch = page.getByRole('button', { name: /Hold to launch:.*Launch #143/ });
      await expect(launch).toBeVisible();
      const box = await launch.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      let before = 0;
      try {
        // Let the normal loop see the physical hold before testing a restore.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        before = await page.evaluate(() => (window as any).__gpu.draws);
        await page.evaluate(() => (window as any).__gpu.extension.loseContext());
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.lost)).toBe(1);
        await page.evaluate(() => (window as any).__gpu.extension.restoreContext());
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.restored)).toBe(1);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(await page.evaluate(() => (window as any).__gpu.draws)).toBe(before);
      } finally { await page.mouse.up(); }
      await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws), { timeout: 2000, intervals: [25, 50] }).toBeGreaterThan(before);
      await expect(page.locator('.crash')).toHaveCount(0);
    });

    test('a context that never restores gets a fresh canvas and current factory', async ({ page }) => {
      await observeGpu(page);
      await openShaft(page);
      await page.evaluate(() => { (window as any).__originalCanvas = (window as any).__gpu.canvas; (window as any).__gpu.extension.loseContext(); });
      await expect.poll(() => page.evaluate(() => (window as any).__gpu.canvas !== (window as any).__originalCanvas), { timeout: 6000 }).toBe(true);
      const before = await page.evaluate(() => (window as any).__gpu.draws);
      await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws)).toBeGreaterThan(before);
      await expect(page.locator('.crash')).toHaveCount(0);
      await expect(page.locator('#map-summary')).toContainText('sim/shiptorio: 5 folders, 11 machines');
      await page.locator('canvas.map').focus();
      await page.keyboard.press('ArrowDown');
    });

    for (const failure of ['react', 'webgl'] as const) test(`${failure} render failure shows one Reload button and one telemetry event`, async ({ page, baseURL }, info) => {
      const events: any[] = [];
      await page.route('**/api/telemetry/config', route => route.fulfill({ json: { dsn: `${baseURL!.replace('://', '://public@')}/1`, release: 'recovery-test', userId: null, requestId: 'recovery' } }));
      await page.route('**/api/1/envelope/**', async route => {
        for (const line of (route.request().postData() ?? '').split('\n')) {
          try { const event = JSON.parse(line); if (event.event_id && !event.sent_at && !event.type) events.push(event); } catch { /* envelope framing */ }
        }
        await route.fulfill({ json: {} });
      });
      if (failure === 'react') await page.addInitScript(() => {
        // The map hands asynchronous setup errors to React by throwing during render.
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
          if (args[0] === 'webgl2') throw new Error('Forced render failure: private details must stay hidden');
          return (getContext as any).apply(this, args);
        } as typeof getContext;
      });
      if (failure === 'webgl') await observeGpu(page);
      await page.goto('/?source=sim&world=shaft');
      if (failure === 'webgl') {
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws), { timeout: 90000 }).toBeGreaterThan(0);
        await page.evaluate(() => { (window as any).__gpu.gl.drawElements = () => { throw new Error('Forced GPU render failure'); }; });
      }
      const crash = page.getByRole('alert');
      await expect(crash).toContainText('Boiler blew');
      await expect(crash.getByRole('button')).toHaveCount(1);
      await expect(crash.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
      await expect(crash).not.toContainText('Forced render');
      await expect.poll(() => events.length).toBe(1);
      expect(events[0].message).toBe('Game render failed');
      expect(events[0].tags.reason).toBe(`${failure}_render`);
      await page.screenshot({ path: `/tmp/shiptorio-crash-${viewport.width}-${info.project.name}.png` });
      await info.attach(`crash-${viewport.width}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(events).toHaveLength(1);
      const navigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
      await crash.getByRole('button', { name: 'Reload', exact: true }).click();
      await navigation;
    });
  });
}
