// Feel test clips (web/src/deck2d/feel.ts): one short desktop clip per ?feel variant of the two moments.
//   node scripts/shots/feel.mjs [outDir]          starts vite itself (BASE_URL=http://localhost:5191 to use a running one)
//   ONLY=jamB,rocketD node scripts/shots/feel.mjs just those
// jam     /deck.html?seed=1&feel=jamX: waits for the first "Approve ...?" card, then records 1s before the swipe (→) and
//         6s after: the pile at Review clearing.
// rocket  /deck.html?source=live&feel=rocketX: answers the guest tour's cards (→) up to "Ship this fix?", then records
//         0.8s before the held Ship it and 10s after: lever, ride, countdown, liftoff.
// Each clip is <outDir>/<id>.webm (and .mp4 with a system ffmpeg), 1280x720 at 30 fps, recorded the same way as deck.mjs
// CLIP=1 (Chrome's screencast, every frame held until the next). deck.mjs has no way to answer a card, so this is its own
// small script.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const FPS = 30;
const out = resolve(process.argv[2] || (existsSync('/mnt/project-files/') ? '/mnt/project-files/shiptorio/feel-test' : 'feel-test'));
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const IDS = ['jam', 'rocket'].flatMap(m => 'ABCDE'.split('').map(v => m + v)).filter(id => !ONLY || ONLY.includes(id));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(100); }
  throw new Error(`timed out: ${what}`);
}

async function server() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop() {} };
  const port = 5199;
  const child = spawn('bun', ['run', '--filter', './web', 'dev', '--', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  const url = `http://localhost:${port}`;
  await until(() => fetch(url).then(r => r.ok, () => false), 60_000, 'vite dev server');
  return { url, stop: () => { try { process.kill(-child.pid); } catch {} } };
}

function playwrightFfmpeg() {
  if (process.env.PLAYWRIGHT_FFMPEG) return process.env.PLAYWRIGHT_FFMPEG;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright'), '/opt/pw-browsers']
    .filter(r => r && existsSync(r));
  for (const root of roots) for (const d of readdirSync(root).filter(d => /^ffmpeg-\d+$/.test(d)).sort().reverse())
    for (const bin of ['ffmpeg-mac', 'ffmpeg-linux', 'ffmpeg-win64.exe']) if (existsSync(join(root, d, bin))) return join(root, d, bin);
  return null;
}

// Chrome's screencast sends a frame whenever the page changes; each one is held for every 1/30 s tick until the next.
async function record(context, page, dir, id) {
  const frames = join(dir, `${id}-frames`);
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const list = [], writes = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(frames, `${String(list.length).padStart(5, '0')}.jpg`);
    list.push({ file, at: metadata.timestamp });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  const from = Date.now() / 1000;
  return async () => {
    const to = Date.now() / 1000;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await Promise.all(writes);
    const ticks = [];
    for (let t = from, i = 0; t < to; t += 1 / FPS) {
      while (i + 1 < list.length && list[i + 1].at <= t) i++;
      ticks.push(list[i].file);
    }
    const ff = playwrightFfmpeg();
    if (ff) {
      const enc = spawn(ff, ['-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0', '-y', '-an',
        '-c:v', 'libvpx', '-qmin', '0', '-qmax', '30', '-crf', '4', '-b:v', '6M', '-deadline', 'realtime', '-cpu-used', '8', join(dir, `${id}.webm`)], { stdio: ['pipe', 'ignore', 'inherit'] });
      const done = new Promise(r => enc.on('close', r));
      enc.stdin.on('error', () => {});
      for (const f of ticks) if (!enc.stdin.write(readFileSync(f))) await new Promise(r => enc.stdin.once('drain', r));
      enc.stdin.end();
      await done;
    }
    await writeFile(join(frames, 'list.txt'), ticks.map(f => `file '${f}'\nduration ${(1 / FPS).toFixed(5)}`).join('\n') + `\nfile '${ticks.at(-1)}'\n`);
    const mp4 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'),
      '-vf', `fps=${FPS}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', join(dir, `${id}.mp4`)]);
    if (mp4.error || mp4.status !== 0) console.log(`${id}: no system ffmpeg, webm only`);
    await rm(frames, { recursive: true, force: true });
  };
}

const approveBtn = page => page.locator('.ic-btn.approve').first();
const cardUp = page => approveBtn(page).evaluate(b => !b.disabled && b.getClientRects().length > 0).catch(() => false);

async function jam(page, base, feel, stopAt) {
  await page.goto(`${base}/deck.html?seed=1&feel=${feel}`);
  await until(() => cardUp(page), 60_000, 'the first Approve card');
  await sleep(600); // the card has slid up and settled
  const stop = await stopAt();
  await sleep(1000);
  await page.keyboard.press('ArrowRight');
  await sleep(6000);
  await stop();
}

async function rocket(page, base, feel, stopAt) {
  await page.goto(`${base}/deck.html?source=live&feel=${feel}`);
  const shipCard = () => approveBtn(page).evaluate(b => /Ship it/.test(b.getAttribute('aria-label') ?? '') && !b.disabled && b.getClientRects().length > 0).catch(() => false);
  const end = Date.now() + 180_000;
  while (!(await shipCard())) {
    if (Date.now() > end) throw new Error('timed out: the Ship it card');
    if (await cardUp(page)) { await page.keyboard.press('ArrowRight'); await sleep(700); } else await sleep(150);
  }
  await sleep(600);
  const stop = await stopAt();
  await sleep(800);
  await page.keyboard.down('ArrowRight'); await sleep(1000); await page.keyboard.up('ArrowRight');
  await sleep(10_000);
  await stop();
}

const srv = await server();
await mkdir(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
try {
  for (const id of IDS) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.route('**/api/me', r => r.fulfill({ json: { guest: true, login: null, githubConfigured: true } }).catch(() => {}));
    await context.routeWebSocket(/.*/, () => {}); // no hot reload mid-clip
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const stopAt = () => record(context, page, out, id);
    await (id.startsWith('jam') ? jam : rocket)(page, srv.url, id, stopAt);
    console.log(`${id}: ${join(out, id)}.webm${errors.length ? `  page errors: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
} finally {
  await browser.close();
  srv.stop();
}
