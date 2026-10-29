// Post-deploy proof of the actual product entry. Preview admission never signs in a GitHub account.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

export function smokeOrigin(value) {
  const url = new URL(value);
  assert(url.origin === 'https://shiptorio.dev' || ['localhost', '127.0.0.1'].includes(url.hostname), 'Deck smoke refuses production and unknown hosts');
  assert(!url.username && !url.password, 'Deck smoke refuses credentials in the URL');
  return url.origin;
}
export function requireGuest(identity) {
  assert(identity?.guest === true, 'Deck smoke must use a fresh guest, not a signed-in player');
}

export async function deckSmoke({ origin = 'https://shiptorio.dev', password, out = '/tmp/shiptorio-deck-smoke' } = {}) {
  origin = smokeOrigin(origin);
  if (origin === 'https://shiptorio.dev') assert(password, 'Staging preview password unavailable');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [], start = Date.now();
      page.on('pageerror', error => errors.push(`Page: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push(`Console: ${message.text()}`); });
      page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === origin) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
      try {
        if (password) {
          const access = await context.request.post(`${origin}/access`, { headers: { origin }, form: { password, next: '/deck?source=live' }, maxRedirects: 0, timeout: 15000 });
          assert(access.status() === 303, 'Staging preview admission failed');
        }
        const who = await context.request.get(`${origin}/api/me`, { timeout: 15000 });
        assert(who.ok(), 'Guest identity endpoint failed');
        requireGuest(await who.json());
        await page.goto(`${origin}/deck?source=live`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.locator('[data-deck-ready="1"]').waitFor({ timeout: 30000 });
        const readyMs = Date.now() - start;
        assert.equal(await page.locator('.connection-tools').count(), 0, 'No setup chips before sign-in');
        assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 0, 'Play comes before sign-in');
        await page.screenshot({ path: join(out, `guest-first-frame-${viewport.width}.png`) });
        const storyCards = [];
        for (let n = 1; n <= 3; n++) {
          const decision = page.locator(`.ic-card:not(.ic-ghost)[data-card="story-call-${n}"]`);
          await decision.waitFor({ timeout: 30000 });
          assert.equal(await page.locator('.connection-tools').count(), 0);
          await decision.locator('.approve').click();
          await decision.waitFor({ state: 'detached' });
          storyCards.push(`story-call-${n}`);
        }
        await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
        assert(new URL(page.url()).pathname === '/deck', 'Guest left the 2D deck');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(overflow <= 1, `Guest deck overflowed the viewport by ${overflow}px`);
        await page.screenshot({ path: join(out, `guest-${viewport.width}.png`) });
        assert.equal(errors.length, 0, errors.join('\n'));
        reports.push({ ...viewport, readyMs, storyMs: Date.now() - start - readyMs, storyCards, guest: true, url: page.url(), errors });
      } catch (error) {
        await page.screenshot({ path: join(out, `guest-${viewport.width}-failed.png`), timeout: 5000 }).catch(() => {});
        await writeFile(join(out, 'report.json'), JSON.stringify({ passed: false, width: viewport.width, error: error.message, errors, reports }, null, 2));
        throw error;
      } finally { await context.close(); }
    }
    await writeFile(join(out, 'report.json'), JSON.stringify({ passed: true, reports }, null, 2));
    console.log(`Guest deck smoke passed at 390×844 and 1280×720: ${reports.map(r => `${r.readyMs}ms`).join(', ')}.`);
    return reports;
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await deckSmoke({ origin: process.env.SMOKE_ORIGIN || 'https://shiptorio.dev', password: process.env.SHIPTORIO_TEST_PASSWORD, out: process.env.SMOKE_OUT || '/tmp/shiptorio-deck-smoke' });
}
