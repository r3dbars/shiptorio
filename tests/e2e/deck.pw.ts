import { test, expect, type Page } from '@playwright/test';

// Past the preview password the same way the admin suite gets there: the fixture session cookie.
test.beforeEach(async ({ page, context }, info) => {
  const session = await (await page.request.post('/__test/session')).json();
  await context.addCookies(session.cookie.split('; ').map((entry: string) => {
    const i = entry.indexOf('=');
    return { name: entry.slice(0, i), value: entry.slice(i + 1), url: info.project.use.baseURL as string };
  }));
});

// The deck is the whole web app now. These replace the old React app's journeys: every front door lands on it,
// it draws its first frame, and nothing errors on the way.
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  return errors;
}
const ready = (page: Page) => expect(page.locator('[data-deck-ready]')).toHaveCount(1, { timeout: 60_000 });

test('old demo links land on the deck and it draws', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?source=sim&scenario=first-run&world=shaft');
  await expect(page).toHaveURL(/\/deck\?source=sim&scenario=first-run$/);
  await ready(page);
  await expect(page.locator('canvas').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('without a session', () => {
  // A fresh context: the beforeEach session cookie lives on the default one.
  test('/judge plays the story for anyone, with no password', async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
    const page = await context.newPage();
    const errors = watchErrors(page);
    const response = await page.goto('/judge');
    expect(response?.status()).toBe(200);
    await ready(page);
    await expect(page.locator('canvas').first()).toBeVisible();
    expect(errors.filter(e => !e.startsWith('401 /api/'))).toEqual([]);
    await context.close();
  });
});

test('the watch rehearsal plays with no clicks and no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/deck?source=sim&watch=1');
  await ready(page);
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});
