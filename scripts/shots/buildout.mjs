// Screenshots of every Build As You Go moment, for review outside a test run.
//   node scripts/shots/buildout.mjs [outDir]       starts `bun run dev:web` itself
//   BASE_URL=http://localhost:5190 node scripts/shots/buildout.mjs
// Walks ?buildout=1&source=sim&scenario=buildout from dark to rocket at 1440 and 390,
// plus 390 with reduced motion, using the hooks in web/src/buildout/CONTRACT.md.
// Saves <view>/NN-<step>-{card,construct,online}.png and timings.json per view.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, devices } from '@playwright/test';

const STEPS = ['tunnel', 'boiler', 'builder', 'issue', 'planner', 'build', 'checks', 'launch'];
const AUTO = new Set(['build', 'checks']);
const NO_PIECES = new Set(['issue', 'build']); // may move on without a build moment
const VIEWS = [
  { name: 'desktop-1440', options: { viewport: { width: 1440, height: 900 } } },
  { name: 'phone-390', options: { ...devices['iPhone 14'], deviceScaleFactor: 2 } },
  { name: 'phone-390-reduced', options: { ...devices['iPhone 14'], deviceScaleFactor: 2, reducedMotion: 'reduce' } },
];
const out = resolve(process.argv[2] || '/mnt/project-files/shiptorio/buildout/shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(150); }
  throw new Error(`timed out: ${what}`);
}

async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop() {} };
  const port = 5199;
  const child = spawn('bun', ['run', '--filter', './web', 'dev', '--', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  const url = `http://localhost:${port}`;
  await until(() => fetch(url).then(r => r.ok, () => false), 60_000, 'vite dev server');
  return { url, stop: () => { try { process.kill(-child.pid); } catch {} } };
}

async function walk(browser, base, view) {
  const dir = join(out, view.name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext(view.options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__builds = [];
    window.addEventListener('shiptorio:build', e => window.__builds.push({ ...e.detail, at: performance.now() }));
  });
  const builds = () => page.evaluate(() => window.__builds);
  const has = async (id, phase) => (await builds()).some(b => b.id === id && b.phase === phase);
  const shot = name => page.screenshot({ path: join(dir, name) });
  const root = page.locator('[data-buildout]');
  const action = page.locator('[data-buildout-card] [data-buildout-action]').first();

  await page.goto(`${base}/?buildout=1&source=sim&scenario=buildout`);
  await until(() => root.count().then(n => n > 0), 30_000, 'buildout root');
  await sleep(1500);
  await shot('00-dark.png');
  for (const [i, id] of STEPS.entries()) {
    const n = String(i + 1).padStart(2, '0');
    await until(async () => (await root.getAttribute('data-step')) === id, 60_000, `step ${id}`);
    const moved = async () => (await root.getAttribute('data-step')) !== id;
    if (!AUTO.has(id) && !(await has(id, 'start')) && await action.isVisible().catch(() => false)) {
      await sleep(400);
      await shot(`${n}-${id}-card.png`);
      if ((await action.getAttribute('data-buildout-action')) === 'hold') {
        const box = await action.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await until(async () => await has(id, 'start') || await moved(), 6_000, `${id} hold`).finally(() => page.mouse.up());
      } else await action.click();
    }
    if (NO_PIECES.has(id)) {
      await until(async () => await has(id, 'start') || await moved(), 90_000, `${id} moves on`);
      if (!(await has(id, 'start'))) { await shot(`${n}-${id}-after.png`); console.log(`${view.name}: ${id} passed`); continue; }
    }
    await until(() => has(id, 'start'), 90_000, `${id} start`);
    await sleep(view.options.reducedMotion ? 400 : 2500);
    await shot(`${n}-${id}-construct.png`);
    await until(() => has(id, 'done'), 20_000, `${id} done`);
    await sleep(300);
    await shot(`${n}-${id}-online.png`);
    console.log(`${view.name}: ${id} built`);
  }
  await until(async () => (await root.getAttribute('data-step')) === 'look', 30_000, 'look around');
  await sleep(1000);
  await shot('09-launched.png');
  const timings = {};
  for (const b of await builds()) (timings[b.id] ??= {})[b.phase] = Math.round(b.at);
  await writeFile(join(dir, 'timings.json'), JSON.stringify({ timings, errors }, null, 2));
  await context.close();
  return errors;
}

const server = await startServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] });
let failed = false;
try {
  for (const view of VIEWS) {
    try {
      const errors = await walk(browser, server.url, view);
      if (errors.length) { failed = true; console.error(`${view.name}: page errors`, errors); }
    } catch (e) { failed = true; console.error(`${view.name}: ${e.message}`); }
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(`shots in ${out}`);
process.exit(failed ? 1 : 0);
