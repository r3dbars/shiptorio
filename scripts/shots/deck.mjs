// Phone + desktop check for the 2D deck, plus an optional 30s clip. Any slice can run it.
//   node scripts/shots/deck.mjs [outDir]                 starts `bun run dev:web` itself
//   BASE_URL=http://localhost:5191 node scripts/shots/deck.mjs
//   DECK_PATH=/story-b/ node scripts/shots/deck.mjs     point it at another page
//   CLIP=1 node scripts/shots/deck.mjs                   also record 30s per view (CLIP=12 for 12s)
//   ONLY=phone-390 node scripts/shots/deck.mjs           just one view
// Per view (desktop-1440, desktop-1280, phone-390, phone-390-reduced) it saves 00-first.png (as soon as
// the deck is ready), 01-settled.png (3s later), 02-full.png and report.json, plus clip.mp4. Exits 1 on a page error, a blank canvas or a page
// wider than the phone. The deck is a 2D canvas, so no WebGL flags are needed.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, devices } from '@playwright/test';

const CITY = process.env.CITY_MOCKUP === '1';
const PATH = process.env.DECK_PATH || '/deck.html?seed=1';
const CLIP_S = process.env.CLIP ? (Number(process.env.CLIP) > 1 ? Number(process.env.CLIP) : 30) : 0;
const VIEWS = [
  { name: 'desktop-1440', options: { viewport: { width: 1440, height: 900 } } },
  { name: 'desktop-1280', options: { viewport: { width: 1280, height: 720 } } },
  { name: 'phone-390', options: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
  { name: 'phone-390-reduced', options: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' } },
];
const out = resolve(process.argv[2] || (existsSync('/mnt/project-files/') ? '/mnt/project-files/shiptorio/deck/shots' : 'deck-shots'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(150); }
  throw new Error(`timed out: ${what}`);
}

async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL.replace(/\/$/, ''), stop() {} };
  const port = 5198;
  const child = spawn('bun', ['run', '--filter', './web', 'dev', '--', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  const url = `http://localhost:${port}`;
  await until(() => fetch(url).then(r => r.ok, () => false), 60_000, 'vite dev server');
  return { url, stop: () => { try { process.kill(-child.pid); } catch {} } };
}

// Ready = the page says so ([data-deck-ready]) or, until the deck sets that, a drawn canvas.
const ready = page => page.evaluate(() => {
  if (document.querySelector('[data-deck-ready]')) return true;
  return [...document.querySelectorAll('canvas')].some(c => c.width > 0 && c.height > 0);
});

// Samples the biggest 2D canvas: a deck that drew something has more than a few colors.
const canvasColors = page => page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!c) return -1;
  const ctx = c.getContext('2d');
  if (!ctx) return -2; // a WebGL canvas, can't sample it from here
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(((i % 20) + 0.5) / 20 * c.width), y = Math.floor((Math.floor(i / 20) + 0.5) / 20 * c.height);
    seen.add(ctx.getImageData(x, y, 1, 1).data.join(','));
  }
  return seen.size;
});

// Records with Chrome's own screencast (no Playwright ffmpeg download needed), then stitches
// the frames into clip.mp4 with the system ffmpeg (`brew install ffmpeg` on a Mac).
async function startClip(context, page, dir) {
  const frames = join(dir, 'frames');
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const list = [];
  const writes = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(frames, `${String(list.length).padStart(5, '0')}.jpg`);
    list.push({ file, at: metadata.timestamp });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
  return {
    async stop(name) {
      const end = Date.now() / 1000;
      await cdp.send('Page.stopScreencast').catch(() => {});
      await Promise.all(writes);
      if (!list.length) return console.warn(`${name}: no clip frames`);
      // Each frame lasts until the next one; the page only sends a frame when it changes.
      const concat = list.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((list[i + 1]?.at ?? end) - f.at)).toFixed(3)}`).join('\n') + `\nfile '${list.at(-1).file}'\n`;
      await writeFile(join(frames, 'list.txt'), concat);
      const mp4 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'),
        '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(dir, 'clip.mp4')]);
      if (mp4.error || mp4.status !== 0) return console.warn(`${name}: no ffmpeg on PATH (or it failed), frames kept in ${frames}`);
      await rm(frames, { recursive: true, force: true });
    },
  };
}

async function run(browser, base, view) {
  const dir = join(out, view.name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext(view.options);
  const page = await context.newPage();
  let clip = !CITY && CLIP_S ? await startClip(context, page, dir) : null;
  const errors = [];
  const apiMisses = new Set();
  // Plain `vite` has no worker behind /api, so those misses are expected; set STRICT=1 to count them.
  const api = url => !process.env.STRICT && /^\/(api|auth)\//.test(new URL(url).pathname) && (apiMisses.add(new URL(url).pathname), true);
  page.on('pageerror', e => errors.push(e.message));
  // The browser asks for /favicon.ico on its own; the deck page has no icon yet, and that's fine.
  page.on('console', m => { const at = m.location().url; if (m.type() === 'error' && !(at && (api(at) || new URL(at).pathname === '/favicon.ico'))) errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', r => { if (!api(r.url())) errors.push(`request failed: ${r.url()}`); });
  page.on('response', r => { if (r.status() >= 400 && !api(r.url())) errors.push(`${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(`${base}${PATH}`);
  await until(() => ready(page), 30_000, 'deck ready');
  const readyMs = Date.now() - t0;
  if (CITY && PATH.includes('conveyor-demo')) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
  }
  await sleep(300);
  await page.screenshot({ path: join(dir, '00-first.png') });
  await sleep(3000);
  await page.screenshot({ path: join(dir, '01-settled.png') });
  await page.screenshot({ path: join(dir, '02-full.png'), fullPage: true });
  if (CITY) {
    await page.screenshot({ path: join(dir, 'station.png') });
    if (CLIP_S) clip = await startClip(context, page, dir);
    await sleep(1000);
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.deckZoom === 'line');
    await sleep(1000);
    await page.screenshot({ path: join(dir, 'line.png') });
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.deckZoom === 'city');
    await sleep(1000);
    await page.screenshot({ path: join(dir, 'city.png') });
    if (CLIP_S) await sleep(Math.max(0, CLIP_S * 1000 - 3000));
    if (clip) { await clip.stop(view.name); clip = null; }
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.deckZoom === 'station');
  }
  const colors = await canvasColors(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (CLIP_S && !CITY) await sleep(CLIP_S * 1000 - 3300);
  const problems = [...errors];
  if (colors >= 0 && colors < 4) problems.push(`canvas looks blank (${colors} colors)`);
  if (overflow > 1) problems.push(`page is ${overflow}px wider than the screen`);
  await writeFile(join(dir, 'report.json'), JSON.stringify({ url: `${base}${PATH}`, readyMs, canvasColors: colors, overflow, problems, apiMisses: [...apiMisses] }, null, 2));
  if (clip) await clip.stop(view.name);
  await context.close();
  console.log(`${view.name}: ready in ${readyMs}ms, ${colors} colors${problems.length ? `, ${problems.length} problem(s)` : ', ok'}`);
  return problems;
}

const server = await startServer();
// Cloud sandboxes ship one Chromium at /opt/pw-browsers/chromium; elsewhere use Playwright's own.
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
let failed = false;
try {
  for (const view of VIEWS.filter(v => !process.env.ONLY || v.name === process.env.ONLY)) {
    try {
      const problems = await run(browser, server.url, view);
      if (problems.length) { failed = true; console.error(`${view.name}:`, problems); }
    } catch (e) { failed = true; console.error(`${view.name}: ${e.message}`); }
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(`shots in ${out}`);
process.exit(failed ? 1 : 0);
