import { test, expect, type Page } from '@playwright/test';
import { installGpuObserver } from './gpu-observer';

// Exercise native GPU recovery on macOS; Linux CI uses the configured software GPU.
if (process.platform === 'darwin') test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-webgl'] } });

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/__test/access')).ok()).toBe(true);
});

// Observe real GPU submissions in the production bundle; no dev-only scene hooks.
async function observeGpu(page: Page) {
  await page.addInitScript(() => {
    const heartbeat = (window as any).__recoveryHeartbeat = { last: performance.now(), maxDrift: 0, active: false };
    setInterval(() => { const now = performance.now(); if (heartbeat.active) heartbeat.maxDrift = Math.max(heartbeat.maxDrift, now - heartbeat.last - 50); heartbeat.last = now; }, 50);
    document.addEventListener('pointerup', event => {
      const gpu = (window as any).__gpu;
      if (gpu?.watchRelease && event.isTrusted) { gpu.restoreStartedAt = event.timeStamp; gpu.watchRelease = false; gpu.releaseTrusted = true; }
    }, true);
    document.addEventListener('keydown', event => {
      const target = event.target as HTMLElement | null;
      if (event.key !== 'Enter' || !target?.matches('.menu-btn')) return;
      const receipt = (window as any).__recoveryInput = { trusted: event.isTrusted, eventAt: event.timeStamp, receivedAt: performance.now(), duringRecovery: !!(window as any).__shipPerf?.().recoveryActive, effectAt: 0 };
      const observer = new MutationObserver(() => { receipt.effectAt = performance.now(); observer.disconnect(); });
      observer.observe(target, { attributes: true, attributeFilter: ['aria-expanded'] });
    }, true);
  });
  await page.addInitScript(installGpuObserver);
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
        // Measure the product deadline in the browser: tracing can delay delivery
        // of an already-successful CDP result by more than a second on software GPUs.
        // The separate host bound detects a hung transport; it does not extend 2000ms.
        const recovered = await test.step(`restore ${cycle + 1} within browser budget`, () => page.evaluate(epoch => new Promise<{ draws: number; first: { elapsed: number } | null }>(resolve => {
          const gpu = (window as any).__gpu;
          gpu.restoreStartedAt = performance.now();
          const heartbeat = (window as any).__recoveryHeartbeat;
          heartbeat.last = gpu.restoreStartedAt; heartbeat.maxDrift = 0; heartbeat.active = true;
          gpu.extension.restoreContext();
          const poll = () => {
            const first = gpu.frames.find((frame: any) => frame.epoch === epoch);
            if (first) resolve({ draws: gpu.draws, first });
            else if (performance.now() - gpu.restoreStartedAt >= 2000) resolve({ draws: gpu.draws, first: null });
            else requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        }), cycle + 1), { timeout: 30000 });
        expect(recovered.draws).toBeGreaterThan(before);
        expect(recovered.first).not.toBeNull();
        expect(recovered.first!.elapsed).toBeLessThan(2000);
        await expect(page.locator('.crash')).toHaveCount(0);
        // Native input and actual UI effect are timed inside the browser too,
        // independently of artifact capture/host transport latency.
        const menu = page.locator('.menu-btn');
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await menu.focus(); await page.keyboard.press('Enter');
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        const input = await page.evaluate(() => (window as any).__recoveryInput);
        expect(input.trusted).toBe(true); expect(input.duringRecovery).toBe(true);
        expect(input.effectAt).toBeGreaterThanOrEqual(input.receivedAt);
        expect(input.effectAt - input.eventAt).toBeLessThan(2000);
        await page.keyboard.press('Enter');
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        // The first usable frame keeps the original two-second budget; full lighting
        // follows in bounded submissions and must also finish, without navigating.
        await expect.poll(() => page.evaluate(() => (window as any).__shipPerf().recoveryActive)).toBe(false);
        // Every completion is tagged from the state at submission, not a later RAF.
        await expect.poll(() => page.evaluate(n => (window as any).__gpu.frames.some((f: any) => f.epoch === n), cycle + 1)).toBe(true);
        const first = await page.evaluate(n => (window as any).__gpu.frames.find((f: any) => f.epoch === n), cycle + 1);
        expect(first.elapsed).toBeLessThan(2000);
        await expect.poll(() => page.evaluate(n => (window as any).__gpu.frames.some((f: any) => f.epoch === n && f.original), cycle + 1)).toBe(true);
        const original = await page.evaluate(n => (window as any).__gpu.frames.find((f: any) => f.epoch === n && f.original), cycle + 1);
        expect(original.elapsed).toBeLessThan(30000);
        const heartbeat = await page.evaluate(() => { const beat = (window as any).__recoveryHeartbeat; beat.active = false; return { maxDrift: beat.maxDrift }; });
        await info.attach(`recovery-completion-${cycle + 1}`, { body: JSON.stringify({ first, original, input, heartbeat }), contentType: 'application/json' });
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
      await page.evaluate(() => { (window as any).__gpu.watchRelease = true; });
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
      const released = await test.step('physical release completes a scene within browser budget', () => page.evaluate(() => new Promise<{ draws: number; trusted: boolean; first: { elapsed: number } | null }>(resolve => {
        const gpu = (window as any).__gpu;
        const poll = () => {
          const first = gpu.frames.find((frame: any) => frame.epoch === gpu.lost);
          if (first || gpu.restoreStartedAt === undefined || performance.now() - gpu.restoreStartedAt >= 2000) resolve({ draws: gpu.draws, trusted: gpu.releaseTrusted, first: first ?? null });
          else requestAnimationFrame(poll);
        };
        poll();
      })), { timeout: 30000 });
      expect(released.trusted).toBe(true); expect(released.draws).toBeGreaterThan(before);
      expect(released.first).not.toBeNull(); expect(released.first!.elapsed).toBeLessThan(2000);
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
      // A replacement context uses the recovery path rather than cold full-detail startup.
      expect(await page.evaluate(() => (window as any).__shipPerf().recoveryEpoch)).toBeGreaterThan(0);
      await page.locator('canvas.map').focus();
      await page.keyboard.press('ArrowDown');
    });

    for (const failure of ['react', 'webgl', 'shader-vertex', 'shader-fragment'] as const) test(`${failure} render failure shows one Reload button and one telemetry event`, async ({ page, baseURL }, info) => {
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
      if (failure !== 'react') await observeGpu(page);
      await page.goto('/?source=sim&world=shaft');
      if (failure === 'webgl') {
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws), { timeout: 90000 }).toBeGreaterThan(0);
        await page.evaluate(() => { (window as any).__gpu.gl.drawElements = () => { throw new Error('Forced GPU render failure'); }; });
      }
      if (failure.startsWith('shader')) {
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.draws), { timeout: 90000 }).toBeGreaterThan(0);
        await page.evaluate(vertex => {
          const gl = (window as any).__gpu.gl as WebGL2RenderingContext;
          const source = gl.shaderSource.bind(gl);
          gl.shaderSource = (shader, text) => source(shader, gl.getShaderParameter(shader, gl.SHADER_TYPE) === (vertex ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER) ? text + '\nINVALID_RECOVERY_SHADER;' : text);
          (window as any).__gpu.extension.loseContext();
        }, failure === 'shader-vertex');
        await expect.poll(() => page.evaluate(() => (window as any).__gpu.lost)).toBe(1);
        await page.evaluate(() => (window as any).__gpu.extension.restoreContext());
      }
      const crash = page.getByRole('alert');
      await expect(crash).toContainText('Boiler blew');
      await expect(crash.getByRole('button')).toHaveCount(1);
      await expect(crash.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
      await expect(crash).not.toContainText('Forced render');
      await expect.poll(() => events.length).toBe(1);
      expect(events[0].message).toBe('Game render failed');
      expect(events[0].tags.reason).toBe(failure === "react" ? "react_render" : "webgl_render");
      await page.screenshot({ path: `/tmp/shiptorio-crash-${viewport.width}-${info.project.name}.png` });
      await info.attach(`crash-${viewport.width}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(events).toHaveLength(1);
      const navigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
      await crash.getByRole('button', { name: 'Reload', exact: true }).click();
      await navigation;
    });
  });
}
