import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type TestInfo } from '@playwright/test';

// Floating-city art pass, slice 10 (web/src/map/shaft/modules/growth.js): under ?buildout=1&artpass=1 the island
// starts as the rock and its boarded tunnel, and each floor goes up just before the build that sits on it: the build
// deck after the tunnel, the checks floor after the build runs, the launch floor after checks. growth.js fires
// `shiptorio:floor` ({ phase: 'stand', floors } on the first look, then 'start' / 'done' per floor); the builds come
// from `shiptorio:build` (web/src/buildout/CONTRACT.md). Shots of each floor rising land in FLOOR_SHOTS when set
// (the project's floating-city folder), and are attached to the report either way.
const STEPS = ['tunnel', 'boiler', 'builder', 'issue', 'planner', 'build', 'checks', 'launch'] as const;
const AUTO = new Set<string>(['build', 'checks']);
// the floor that rises once this build is done (the next build sits on it)
const RISES_AFTER: Record<string, string> = { tunnel: 'build', build: 'checks', checks: 'launch' };
type Ev = { kind: 'build' | 'floor'; id?: string; floor?: string; floors?: string[]; phase: string; at: number };

const watch = (page: Page) => page.addInitScript(() => {
  const w = window as any;
  w.__ev = [];
  window.addEventListener('shiptorio:build', e => w.__ev.push({ kind: 'build', ...(e as CustomEvent).detail, at: performance.now() }));
  window.addEventListener('shiptorio:floor', e => w.__ev.push({ kind: 'floor', ...(e as CustomEvent).detail, at: performance.now() }));
});
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => (window as any).__ev);
const floors = async (page: Page) => (await events(page)).filter(e => e.kind === 'floor');
const built = async (page: Page, id: string, phase = 'done') => (await events(page)).some(e => e.kind === 'build' && e.id === id && e.phase === phase);

// Hold from the keyboard (Space on the focused button): the same consent path as a pointer hold (holdLaunch.ts),
// and it doesn't depend on pointer capture under software WebGL.
async function hold(page: Page, button: ReturnType<Page['locator']>, until: () => Promise<boolean>) {
  await button.focus();
  await page.keyboard.down('Space');
  try { await expect.poll(until, { timeout: 20_000 }).toBe(true); } // software WebGL can run a few frames a second
  finally { await page.keyboard.up('Space'); }
}

function shooter(page: Page, info: TestInfo) {
  const dir = process.env.FLOOR_SHOTS ? join(process.env.FLOOR_SHOTS, info.project.name) : '';
  if (dir) mkdirSync(dir, { recursive: true });
  return async (name: string) => {
    const body = await page.screenshot();
    await info.attach(name, { body, contentType: 'image/png' });
    if (dir) writeFileSync(join(dir, name), body);
  };
}

test.describe('floors grow with the build-as-you-go run', () => {
  // 1440 (desktop) and 390 (iphone-14); pixel-7 adds nothing the phone run doesn't.
  test.beforeEach(({}, info) => test.skip(info.project.name === 'pixel-7', 'covered by iphone-14'));
  test.setTimeout(420_000);

  test('dark to rocket: each floor rises right before the build that sits on it', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await watch(page);
    await page.request.post('/__test/access');
    await page.goto('/?buildout=1&artpass=1&source=sim&scenario=buildout');
    const shot = shooter(page, info);
    const root = page.locator('[data-buildout]');
    const action = page.locator('[data-buildout-card] [data-buildout-action]');
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(root).toHaveAttribute('data-step', 'tunnel');
    // the first look: the rock and nothing above it
    await expect.poll(async () => (await floors(page)).find(e => e.phase === 'stand')?.floors, { timeout: 30_000 }).toEqual(['mine']);
    await shot('floors-00-rock.png');

    for (const [i, id] of STEPS.entries()) {
      await expect(root, `step ${id}`).toHaveAttribute('data-step', id, { timeout: 90_000 });
      if (!AUTO.has(id) && !(await built(page, id, 'start'))) {
        await expect(action.first(), `${id} has an action`).toBeVisible();
        const kind = await action.first().getAttribute('data-buildout-action');
        const moved = async () => (await built(page, id, 'start')) || (await root.getAttribute('data-step')) !== id;
        if (kind === 'hold' || (await action.first().getAttribute('class'))?.includes('bo-hold')) await hold(page, action.first(), moved);
        else await action.first().click();
      }
      await expect.poll(() => built(page, id), { timeout: 90_000, message: `${id} finishes` }).toBe(true);
      const floor = RISES_AFTER[id];
      const n = String(i + 1).padStart(2, '0');
      if (!floor) {
        // nothing rises after this build: no floor started since it finished
        const done = (await events(page)).find(e => e.kind === 'build' && e.id === id && e.phase === 'done')!.at;
        expect((await floors(page)).filter(e => e.phase === 'start' && e.at >= done), `no floor after ${id}`).toEqual([]);
        continue;
      }
      await expect.poll(async () => (await floors(page)).some(e => e.phase === 'start' && e.floor === floor), { timeout: 5_000, message: `${floor} floor starts after ${id}` }).toBe(true);
      await page.waitForTimeout(2_500); // mid-rise: girders up, slab sliding in
      await shot(`floors-${n}-${floor}-rising.png`);
      await expect.poll(async () => (await floors(page)).some(e => e.phase === 'done' && e.floor === floor), { timeout: 15_000, message: `${floor} floor stands` }).toBe(true);
      await shot(`floors-${n}-${floor}-up.png`);
    }

    // every floor rose once, bottom up, each after the build before it
    const ev = await events(page);
    const rose = ev.filter(e => e.kind === 'floor' && e.phase === 'start').map(e => e.floor);
    expect(rose).toEqual(['build', 'checks', 'launch']);
    for (const [after, floor] of Object.entries(RISES_AFTER)) {
      const done = ev.find(e => e.kind === 'build' && e.id === after && e.phase === 'done')!.at;
      const start = ev.find(e => e.kind === 'floor' && e.phase === 'start' && e.floor === floor)!.at;
      expect(start, `${floor} after ${after}`).toBeGreaterThanOrEqual(done);
    }
    await expect(page.locator('.ship-cel').first()).toBeVisible({ timeout: 30_000 });
    await shot('floors-09-rocket.png');
    expect(errors).toEqual([]);
  });

  test('a returning factory shows all its floors at once', async ({ page }) => {
    await watch(page);
    await page.request.post('/__test/access');
    await page.goto('/?buildout=1&artpass=1&source=sim&scenario=research'); // six rockets shipped already
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect.poll(async () => (await floors(page)).find(e => e.phase === 'stand')?.floors, { timeout: 30_000 }).toEqual(['mine', 'build', 'checks', 'launch']);
    await page.waitForTimeout(3_000);
    expect((await floors(page)).filter(e => e.phase === 'start')).toEqual([]);
  });

  test('flag off: no floor growth', async ({ page }) => {
    await watch(page);
    await page.request.post('/__test/access');
    await page.goto('/?buildout=1&source=sim&scenario=buildout');
    await expect(page.locator('[data-buildout]')).toHaveAttribute('data-step', 'tunnel');
    await page.waitForTimeout(3_000);
    expect(await floors(page)).toEqual([]);
  });
});
