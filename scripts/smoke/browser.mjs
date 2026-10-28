/** Production/local Chromium probe. No login or changes to the rendered app. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function browserSmoke(base, out) {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-webgl', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    // Parallel isolated contexts keep both viewports inside one 45-second budget.
    const checks = await Promise.allSettled([{ width: 390, height: 844 }, { width: 1440, height: 900 }].map(async viewport => {
      const name = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      const started = Date.now();
      const result = { viewport, errors, ok: false };
      results.push(result);
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        // Read immediately after the app's frame callback, before WebGL discards
        // its default non-preserved buffer. Never change context/render settings.
        window.__smokeCapture = true;
        const frame = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => frame(time => {
          callback(time);
          // A synchronous GPU readback every frame can starve the game itself.
          // Capture only when the assertion requests a sample.
          if (!window.__smokeCapture) return;
          const canvas = document.querySelector('canvas.map');
          if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) return;
          // Sample only the actual drawing buffer, never page text, plates or CSS background.
          const sample = document.createElement('canvas');
          sample.width = 96; sample.height = 96;
          const ctx = sample.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(canvas, 0, 0, 96, 96);
          const pixels = ctx.getImageData(0, 0, 96, 96).data;
          const colors = new Set();
          let lit = 0, opaque = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const [r, g, b, a] = pixels.slice(i, i + 4);
            if (a > 0) opaque++;
            if (a > 0 && Math.max(r, g, b) > 35) lit++;
            colors.add(`${r >> 4},${g >> 4},${b >> 4},${a > 0}`);
          }
          // Governor can skip a frame; retain the most recent actual draw.
          if (opaque > 0) {
            window.__smokePixels = { colors: colors.size, lit, total: 96 * 96 };
            window.__smokeCapture = false;
          }
        });
      });
      page.setDefaultTimeout(15_000);
      try {
        const response = await page.goto(new URL('/judge', base).href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        expect(response?.status()).toBe(200);
        await page.locator('.judge-welcome button').click();
        const canvas = page.locator('canvas.map');
        await expect(canvas).toBeVisible();
        await expect.poll(async () => {
          result.pixels = await page.evaluate(() => {
            const pixels = window.__smokePixels;
            if (!pixels || pixels.colors < 12 || pixels.lit / pixels.total < 0.01) window.__smokeCapture = true;
            return pixels;
          });
          return !!result.pixels && result.pixels.colors >= 12 && result.pixels.lit / result.pixels.total >= 0.01;
        }, { timeout: 30_000, message: `${name}: shaft must draw varied, non-black pixels` }).toBe(true);
        // Observe several more frames for deferred runtime/console failures.
        await page.waitForTimeout(1500);
        expect(errors, `${name}: browser errors`).toEqual([]);
        result.ok = true;
      } catch (error) {
        result.failure = String(error);
      } finally {
        try {
          // Capture the compositor directly. Playwright's layout/font stabilization
          // can wait behind continuous software-WebGL frames on a two-core runner.
          const cdp = await context.newCDPSession(page);
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
          await writeFile(resolve(out, `${name}.png`), Buffer.from(shot.data, 'base64'));
          await cdp.detach();
        } catch (error) { result.screenshotError = String(error); result.ok = false; }
        result.elapsedMs = Date.now() - started;
        if (errors.length) result.ok = false;
        await context.close();
      }
    }));
    for (const check of checks) if (check.status === 'rejected') results.push({ ok: false, failure: String(check.reason) });
    await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    if (results.length !== 2 || results.some(result => !result.ok)) throw new Error('Browser smoke failed; see screenshots and results.json');
  } finally { await browser.close(); }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const timer = setTimeout(() => { console.error('Browser smoke exceeded 45 seconds'); process.exit(1); }, 45_000);
  try { await browserSmoke(process.argv[2] || 'https://shiptorio.com', resolve(process.argv[3] || 'browser-smoke')); }
  catch (error) { console.error(error); process.exitCode = 1; }
  finally { clearTimeout(timer); }
}
