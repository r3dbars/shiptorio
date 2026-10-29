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

/** Same-origin request timings: what is still in flight, and what took over 5s. */
export function trackRequests(page, origin, now = Date.now) {
  const pending = new Map(), done = [];
  const path = request => { const url = new URL(request.url()); return url.origin === origin ? url.pathname : null; };
  const finish = async (request, failed) => {
    const began = pending.get(request); if (began === undefined) return;
    pending.delete(request);
    const response = failed ? null : await request.response().catch(() => null);
    done.push({ path: path(request), ms: now() - began, status: response?.status() ?? 'failed', requestId: response?.headers()['x-request-id'] ?? null, timing: response?.headers()['server-timing'] ?? null });
  };
  page.on('request', request => { if (path(request)) pending.set(request, now()); });
  page.on('requestfinished', request => finish(request, false));
  page.on('requestfailed', request => finish(request, true));
  return {
    stuck: (over = 10_000) => [...pending].map(([request, began]) => ({ path: path(request), ms: now() - began })).filter(r => r.ms >= over),
    slow: (over = 5_000) => done.filter(r => r.ms >= over),
  };
}

export async function deckSmoke({ origin = 'https://shiptorio.dev', password, out = '/tmp/shiptorio-deck-smoke' } = {}) {
  origin = smokeOrigin(origin);
  if (origin === 'https://shiptorio.dev') assert(password, 'Staging preview password unavailable');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    const attempt = async viewport => {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [], start = Date.now();
      const requests = trackRequests(page, origin);
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
        // The third approval now watches one complete automatic trip before setup.
        await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ state: 'visible', timeout: 45000 });
        assert(new URL(page.url()).pathname === '/deck', 'Guest left the 2D deck');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(overflow <= 1, `Guest deck overflowed the viewport by ${overflow}px`);
        await page.screenshot({ path: join(out, `guest-${viewport.width}.png`) });
        assert.equal(errors.length, 0, errors.join('\n'));
        return { ...viewport, readyMs, storyMs: Date.now() - start - readyMs, storyCards, guest: true, url: page.url(), errors, slow: requests.slow() };
      } catch (error) {
        await page.screenshot({ path: join(out, `guest-${viewport.width}-failed.png`), timeout: 5000 }).catch(() => {});
        const stuck = requests.stuck(), slow = requests.slow();
        // Name the request that stalled, so a red deploy says where staging is slow.
        console.error(`Deck smoke failed at ${viewport.width}px: ${error.message.split('\n')[0]}\nStuck: ${JSON.stringify(stuck)}\nSlow: ${JSON.stringify(slow)}`);
        await writeFile(join(out, `report-${viewport.width}-${Date.now()}.json`), JSON.stringify({ passed: false, width: viewport.width, error: error.message, errors, stuck, slow, reports }, null, 2));
        error.stuck = stuck;
        throw error;
      } finally { await context.close(); }
    };
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
      // A request that hangs on the staging edge (seen twice on 2026-10-29) is retried once with a fresh guest,
      // and only when the browser shows a same-origin request stuck in flight. Anything else fails at once.
      try { reports.push(await attempt(viewport)); }
      catch (error) {
        const stuck = error.stuck ?? [];
        if (!stuck.length) throw error;
        console.log(`::warning::Deck smoke at ${viewport.width}px hit a stuck staging request (${stuck.map(r => `${r.path} ${r.ms}ms`).join(', ')}); retrying once with a fresh guest in 10s.`);
        await new Promise(done => setTimeout(done, 10_000));
        reports.push({ ...await attempt(viewport), retriedAfter: stuck });
      }
    }
    await writeFile(join(out, 'report.json'), JSON.stringify({ passed: true, reports }, null, 2));
    console.log(`Guest deck smoke passed at 390×844 and 1280×720: ${reports.map(r => `${r.readyMs}ms`).join(', ')}.`);
    for (const r of reports) if (r.slow.length || r.retriedAfter) console.log(`Slow at ${r.width}px: ${JSON.stringify(r.slow)}${r.retriedAfter ? ` (retried after ${JSON.stringify(r.retriedAfter)})` : ''}`);
    return reports;
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await deckSmoke({ origin: process.env.SMOKE_ORIGIN || 'https://shiptorio.dev', password: process.env.SHIPTORIO_TEST_PASSWORD, out: process.env.SMOKE_OUT || '/tmp/shiptorio-deck-smoke' });
}
