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

// Document commitment and a rendered deck share one budget. Unrelated deferred
// resources must not substitute for (or extend) actual game readiness.
export async function navigateToReadyDeck(page, url, { timeoutMs = 30000, now = Date.now, onPhase = () => {} } = {}) {
  const deadline = now() + timeoutMs;
  const remaining = () => {
    const left = deadline - now();
    assert(left > 0, 'Deck did not become ready within its navigation budget');
    return left;
  };
  onPhase('document');
  await page.goto(url, { waitUntil: 'commit', timeout: remaining() });
  onPhase('rendered-deck');
  await page.locator('[data-deck-ready="1"]').waitFor({ timeout: remaining() });
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
      const errors = [], start = Date.now(), pending = new Map();
      let phase = "admission";
      page.on("request", request => { if (pending.size < 200) pending.set(request, { path: new URL(request.url()).pathname, type: request.resourceType(), started: Date.now() }); });
      page.on("requestfinished", request => pending.delete(request));
      page.on("requestfailed", request => { const item = pending.get(request); pending.delete(request); if (item) errors.push(`Network ${item.path}: ${request.failure()?.errorText ?? "failed"}`); });
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
        await navigateToReadyDeck(page, `${origin}/deck?source=live`, { onPhase: next => { phase = next; } });
        phase = 'story';
        const readyMs = Date.now() - start;
        assert.equal(await page.locator('.connection-tools').count(), 0, 'No setup chips before sign-in');
        assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 0, 'Play comes before sign-in');
        await page.screenshot({ path: join(out, `guest-first-frame-${viewport.width}.png`) });
        const storyCards = [];
        // The guest tour: Shippy's cards one at a time, each answer builds the next machine, then sign-in.
        const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
        // The tour ends on its own ask; only "Build mine" opens sign-in (and, on staging, the password).
        const ask = page.getByRole('button', { name: 'Build mine', exact: true });
        for (let n = 0; n < 60 && !(await ask.count()); n++) { // a story card's first tap may finish its typed line
          const beat = page.locator('.ic-card:not(.ic-ghost)[data-card^="tour-"] .approve');
          await Promise.race([beat.first().waitFor({ timeout: 30000 }).catch(() => {}), ask.waitFor({ timeout: 30000 }).catch(() => {})]);
          if (await ask.count()) break;
          assert.equal(await page.locator('.connection-tools').count(), 0);
          const shown = page.locator('.ic-card:not(.ic-ghost)[data-card^="tour-"]').first();
          storyCards.push(await shown.getAttribute('data-card'));
          // Ship it is a held press, like every real merge.
          await beat.first().click(await shown.evaluate(el => el.classList.contains('hold')) ? { delay: 1200 } : {});
        }
        // Stop at the ask: its press leaves for the password or GitHub, and preview admission never signs in.
        await ask.waitFor({ state: 'visible', timeout: 45000 });
        assert.equal(await signIn.count(), 0, 'Sign-in waits for the tour\'s own ask');
        assert(new URL(page.url()).pathname === '/deck', 'Guest left the 2D deck');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(overflow <= 1, `Guest deck overflowed the viewport by ${overflow}px`);
        await page.screenshot({ path: join(out, `guest-${viewport.width}.png`) });
        assert.equal(errors.length, 0, errors.join('\n'));
        reports.push({ ...viewport, readyMs, storyMs: Date.now() - start - readyMs, storyCards, guest: true, url: page.url(), errors });
      } catch (error) {
        await page.screenshot({ path: join(out, `guest-${viewport.width}-failed.png`), timeout: 5000 }).catch(() => {});
        const stuck = [...pending.values()].slice(0, 20).map(({ started, ...request }) => ({ ...request, ageMs: Date.now() - started }));
        // The artifact is not always reachable; the job log must say which request was still in flight.
        console.error(`Deck smoke failed at ${viewport.width}px during ${phase}. Still in flight: ${JSON.stringify(stuck)}`);
        await writeFile(join(out, 'report.json'), JSON.stringify({ passed: false, width: viewport.width, phase, error: error.message, errors, pending: stuck, reports }, null, 2));
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
