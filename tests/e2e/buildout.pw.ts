import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { assertBuildEventPrefix, BUILDOUT_STEPS as STEPS } from '../contract/buildout-events';
import { observeManualLaunch, type LaunchObservation } from '../contract/launch-observation';

// Build As You Go (?buildout=1): the demo shop starts dark and empty, and every piece
// the app needs gets built in front of the player while the guided issue rides through.
// Hooks come from web/src/buildout/CONTRACT.md: the root carries data-step and
// data-phase, the coach card carries data-buildout-card, its action button
// data-buildout-action, and each build fires `shiptorio:build` (start, burst, done).
// Mirrors STEP_IDS in web/src/buildout/journey.ts. `issue` and `build` reveal nothing new
// (the cart rolls, then rides into the builder), so they may advance without a build moment.
const AUTO = new Set<string>(['build', 'checks']);
const NO_PIECES = new Set<string>(['issue', 'build']);
type Build = { id: string; phase: 'start' | 'burst' | 'done'; at: number };

const watchBuilds = (page: Page) => page.addInitScript(() => {
  const w = window as any;
  w.__builds = [];
  window.addEventListener('shiptorio:build', e => w.__builds.push({ ...(e as CustomEvent).detail, at: performance.now() }));
});
const builds = (page: Page): Promise<Build[]> => page.evaluate(() => (window as any).__builds);

// Hold with a real mouse on desktop and real touch on phones, like the launch hold.
async function hold(page: Page, info: TestInfo, button: ReturnType<Page['locator']>, until: () => Promise<boolean>, beforePress?: () => Promise<void>) {
  const box = await button.boundingBox();
  expect(box, 'hold button has a box').not.toBeNull();
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const touch = info.project.name === 'desktop' ? null : await page.context().newCDPSession(page);
  try {
    await beforePress?.();
    if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0 }] });
    else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
    await expect.poll(until, { timeout: 6_000 }).toBe(true);
  } finally {
    if (touch) { await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach(); }
    else await page.mouse.up();
  }
}

async function firstRun(page: Page, info: TestInfo, opts: { reduced: boolean; shoot: boolean }) {
  const errors: string[] = [];
  let launchCard: LaunchObservation | undefined;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (opts.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await watchBuilds(page);
  await page.request.post('/__test/access');
  await page.goto('/?buildout=1&source=sim&scenario=buildout');
  const root = page.locator('[data-buildout]');
  const card = page.locator('[data-buildout-card]');
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(root).toHaveAttribute('data-step', STEPS[0]);
  // Dark and empty: no counters, no free look, nothing built yet.
  await expect(page.getByText(/waiting on you/i)).toHaveCount(0);
  await expect(page.getByText(/^shipped$/i)).toHaveCount(0);
  expect(await builds(page)).toEqual([]);
  const shot = async (name: string) => {
    if (!opts.shoot) return;
    await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
  };
  await shot('00-dark.png');

  for (const [i, id] of STEPS.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const done = async () => (await builds(page)).some(b => b.id === id && b.phase === 'done');
    const started = async () => (await builds(page)).some(b => b.id === id && b.phase === 'start');
    const next = async () => (await root.getAttribute('data-step')) !== id;
    // Automatic work can finish before the poller observes its transient card.
    // Manual decisions still require their exact step and real player action.
    if (AUTO.has(id))
      await expect.poll(async () => await done() || await root.getAttribute('data-step') === id,
        { timeout: 60_000, message: `step ${n} is ${id} or already completed` }).toBe(true);
    else await expect(root, `step ${n} is ${id}`).toHaveAttribute('data-step', id, { timeout: 60_000 });
    // Steps 6 (build runs) and 7 (checks) build themselves; the rest wait on the player.
    const action = card.locator('[data-buildout-action]');
    if (!AUTO.has(id) && !(await started())) {
      await expect(action.first(), `${id} has an action`).toBeVisible();
      await expect(card).toBeVisible();
      await shot(`${n}-${id}-card.png`);
      if (await card.getAttribute('data-trigger') === 'hold')
        await expect(action.first(), `${id} advertises a real hold`).toHaveAttribute('data-buildout-action', 'hold');
      const kind = await action.first().getAttribute('data-buildout-action'); // hold, tap or continue
      if (kind === 'hold') await hold(page, info, action.first(), async () => await started() || await next(),
        id === 'launch' ? async () => { launchCard = await observeManualLaunch(page); } : undefined);
      else await action.first().click();
    }
    if (NO_PIECES.has(id)) {
      await expect.poll(async () => await started() || await next(), { timeout: 90_000, message: `${id} moves on` }).toBe(true);
      if (!(await started())) { await shot(`${n}-${id}-after.png`); continue; }
    }
    await expect.poll(started, { timeout: 90_000, message: `${id} starts building` }).toBe(true);
    if (!opts.reduced && !NO_PIECES.has(id)) {
      await expect(root).toHaveAttribute('data-phase', 'construct', { timeout: 3_000 }).catch(() => {});
      await shot(`${n}-${id}-construct.png`);
    }
    await expect.poll(async () => (await builds(page)).some(b => b.id === id && b.phase === 'burst'), { timeout: 15_000, message: `${id} bursts online` }).toBe(true);
    await expect.poll(done, { timeout: 15_000, message: `${id} finishes` }).toBe(true);
    await shot(`${n}-${id}-online.png`);
    const log = (await builds(page)).filter(b => b.id === id);
    const ms = log.find(b => b.phase === 'done')!.at - log.find(b => b.phase === 'start')!.at;
    // Logical steps reveal no piece (CONTRACT.md): their optional markers are
    // synchronous. Physical construction still keeps its original duration bounds.
    if (NO_PIECES.has(id)) expect(log.map(b => b.phase), `${id} logical markers`).toEqual(['start', 'burst', 'done']);
    else if (opts.reduced) expect(ms, `${id} reduced build ms`).toBeLessThan(4_500);
    else expect(ms, `${id} build ms`).toBeGreaterThan(3_000);
    // Even if the next automatic step has arrived, every captured phase must be
    // one ordered, non-overlapping journey; duplicates and replay still fail.
    assertBuildEventPrefix(await builds(page));
  }

  // The rocket went: counters and the "Look around" card come out, then free look.
  expect(launchCard, 'the manual Launch press started its actual-card visibility check').toBeDefined();
  await launchCard!();
  await expect(root).toHaveAttribute('data-step', 'look', { timeout: 30_000 });
  await shot('09-launched.png');
  const look = card.getByRole('button', { name: /look around/i });
  await expect(look).toBeVisible();
  await look.click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText(/waiting on you/i).first()).toBeVisible();
  await shot('10-look-around.png');
  expect(errors).toEqual([]);
}

test.describe('build as you go', () => {
  test.setTimeout(360_000);

  test('dark to rocket, one build at a time', async ({ page }, info) => {
    await firstRun(page, info, { reduced: false, shoot: true });
  });

  test('reduced motion: still camera, short builds, payoff still plays', async ({ page }, info) => {
    await firstRun(page, info, { reduced: true, shoot: true });
  });
});
