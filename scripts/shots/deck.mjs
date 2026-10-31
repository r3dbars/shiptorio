// Phone + desktop check for the 2D deck, plus an optional 31s clip. Any slice can run it.
//   node scripts/shots/deck.mjs [outDir]                 starts `bun run dev:web` itself
//   BASE_URL=http://localhost:5191 node scripts/shots/deck.mjs
//   DECK_PATH=/story-b/ node scripts/shots/deck.mjs     point it at another page
//   CLIP=1 node scripts/shots/deck.mjs                   also record 31s per view (CLIP=12 for 12s)
//   ONLY=phone-390 node scripts/shots/deck.mjs           just one view (or a comma list: ONLY=phone-390,desktop-1280)
//   CITY=1 node scripts/shots/deck.mjs                   the city: both zoom steps by hand, then the whole reveal (below)
//   FRAMES=16 (with CLIP)                                also save 16 evenly spaced frame-NN.png from each clip
//   NO_HMR=1 node scripts/shots/deck.mjs                 vite's hot reload never reaches the pages: a file another thread saves
//                                                        mid-run cannot reload the deck in the middle of the story or a clip
// Per view (desktop-1440, desktop-1280, phone-390, phone-390-reduced) it saves 00-first.png (as soon as
// the deck is ready), 01-settled.png (3s later), 02-full.png and report.json, plus clip.webm (and clip.mp4 when a system
// ffmpeg is on PATH). Exits 1 on a page error, a blank canvas or a page wider than the phone. The deck is a 2D canvas, so
// no WebGL flags are needed. Clips and frames are encoded with Playwright's own ffmpeg (`npx playwright install
// chromium` brings it; PLAYWRIGHT_FFMPEG=<path> overrides), so they work on any machine that can take the shots.
//
// CITY=1 (web/src/deck2d/city/SPEC.md "Shots"). DECK_PATH then defaults to /deck.html?seed=1&source=conveyor-demo.
//   1. Zoom button by hand: station.png, Zoom out -> line.png, Zoom out -> city.png, Zoom in -> back to the station.
//   2. The reveal, /deck.html?seed=1&reveal=1 from load, reading #toast every 100 ms: reveal-line.png (beat line + 1s),
//      reveal-city.png (beat city + 1s, the dark ring), reveal-lit.png (grow + 1s), reveal-dark.png (dim + 1.8s, 0.8s
//      with reduced motion), reveal-card.png (the "Start with your repo." card).
//      CLIP=31 records that run as the clip instead of the 31s clip of the base page: it starts once the deck has said it is
//      ready ([data-deck-ready]) and two more animation frames have drawn (the rocket sits on its pad for 0.5s, then lifts
//      off), the reveal takes 29.1s, and the card is up at about 29.6s and settled by 30.3s. A phone is recorded at its device
//      size (780x1688 at dpr 2): Chrome's screencast never gives frames bigger than the page's CSS size (390x844), so at dpr
//      above 1 the clip is a loop of page.screenshot, about 20 fps.
//   3. Problems (report.json): title not "Shiptorio"; not 6 .city-label fully on screen above the caption band; a
//      COMING SOON plate off screen; canvas pixel zoom not a whole number; more than 48 canvas colours; horizontal
//      overflow; the caption order not [line, city, errors, traffic, inbox, customers, marketing, grow, dim] (with reduced
//      motion too: the island captions are cuts, each held 3.0s); a caption on the manual city; the wrong card title; the
//      card showing "Finding your repositories…" or changing height on its way up; a focus ring on the card; "Sign in with
//      GitHub" on more than one line; a label or plate showing under the card; a CLIP shorter
//      than the reveal plus 1.5s ("clip ends before the card": CLIP=31 is the shortest round number that holds it, 29.1s of
//      reveal + 1.5s for the card to slide up and settle; a reduced-motion run is 25.7s).
// Plain vite has no worker, so /api/me is answered here as a guest (the reveal ends on the sign-in card); STRICT=1 leaves it alone.
// ME_DELAY=<ms> holds that answer back (default 300 with CITY=1, ME_DELAY=0 for none): a real server takes a moment to say who is
// here, and the sign-in card has to look the same while it waits as after it knows.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, devices } from '@playwright/test';

const CITY = process.env.CITY === '1';
const PATH = process.env.DECK_PATH || (CITY ? '/deck.html?seed=1&source=conveyor-demo' : '/deck.html?seed=1');
const REVEAL_PATH = '/deck.html?seed=1&reveal=1';
// The words the city shows (contract.ts CITY_COPY; web/test/deck2d-city-zoom.test.ts keeps this list honest).
const COPY = {
  line: "That's one line.", city: "Here's the rest of the factory.",
  islands: [
    "Sentry will send in crashes\nfrom your real product.", "Cloudflare will show how\npeople use your app.",
    "Your email and support tickets\nwill come in here.", "PostHog funnels will show\nwhere customers drop off.",
    "Next: customer acquisition\nand automated marketing.",
  ],
  grow: "The factory must grow.", dim: "For now: one line. Your repo.", card: "Start with your repo.",
};
const CLIP_DEFAULT = 31; // CLIP=1: the whole reveal (29.1s from the rocket) and the card sliding up
// How long the reveal runs from the rocket to the card (story/reveal.ts REVEAL_SECONDS; web/test/deck2d-city-zoom.test.ts keeps this honest).
const REVEAL_SECONDS = { normal: 29.1, reduced: 25.7 };
const CARD_SETTLE = 1.5; // seconds after the card appears for it to slide up and settle
// A real server takes a moment to answer /api/me; the stand-in answers after this many ms (CITY=1 default 300, ME_DELAY=0 for none).
const ME_DELAY = process.env.ME_DELAY !== undefined && process.env.ME_DELAY !== '' ? Math.max(0, Number(process.env.ME_DELAY) || 0) : CITY ? 300 : 0;
const CLIP_S = process.env.CLIP ? (Number(process.env.CLIP) > 1 ? Number(process.env.CLIP) : CLIP_DEFAULT) : 0;
const FRAMES = CLIP_S ? Math.max(0, Math.floor(Number(process.env.FRAMES) || 0)) : 0;
const CLIP_FPS = 30;
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

/** Playwright's own ffmpeg (VP8/WebM, JPEG and PNG only): PLAYWRIGHT_FFMPEG, else the newest one in the browsers folder. */
function playwrightFfmpeg() {
  if (process.env.PLAYWRIGHT_FFMPEG) return process.env.PLAYWRIGHT_FFMPEG;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright'), '/opt/pw-browsers']
    .filter(r => r && existsSync(r));
  for (const root of roots) {
    const dirs = readdirSync(root).filter(d => /^ffmpeg-\d+$/.test(d)).sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)));
    for (const d of dirs) for (const bin of ['ffmpeg-mac', 'ffmpeg-linux', 'ffmpeg-win64.exe']) if (existsSync(join(root, d, bin))) return join(root, d, bin);
  }
  return null;
}

/** Playwright's builds carry one WebM encoder: VP8 (libvpx) in older ones, VP9 (libvpx-vp9) in newer ones. */
function vpxArgs(ff) {
  const list = spawnSync(ff, ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '';
  return /libvpx-vp9/.test(list)
    ? ['-c:v', 'libvpx-vp9', '-crf', '10', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1']
    : ['-c:v', 'libvpx', '-qmin', '0', '-qmax', '30', '-crf', '4', '-b:v', '8M', '-deadline', 'realtime', '-cpu-used', '8'];
}

/** Width and height of a JPEG, read from its SOF marker (null if it has none). */
function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
/** The recording size of a view: its CSS viewport and device scale factor (a phone is 390x844 at 2, so 780x1688 device px). */
const deviceOf = view => ({ width: view.options.viewport.width, height: view.options.viewport.height, scale: view.options.deviceScaleFactor ?? 1 });

// Records the page, then turns the frames into a constant 30 fps clip.webm with Playwright's ffmpeg (and clip.mp4 too when a
// system ffmpeg is on PATH). stop(name, from, to) keeps the frames between two wall-clock times (seconds) and returns the clip's
// size; FRAMES=N then pulls N evenly spaced frame-NN.png out of clip.webm.
// Chrome's own screencast (a frame whenever the page changes) never makes frames bigger than the page's CSS size, whatever
// maxWidth and maxHeight say: a 390x844 phone at dpr 2 comes out at 390x844, half its device pixels. So at dpr 1 this records
// the screencast, and above 1 (the phone) a loop of page.screenshot: true device pixels (780x1688), about 20 fps. (Not a loop of
// raw Page.captureScreenshot with clip.scale on a second DevTools session: that gives device-size frames only until the script's
// own first page.screenshot, and from then on every frame has the page shrunk into one corner of it.)
async function startClip(context, page, dir, { scale }) {
  const frames = join(dir, 'frames');
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const list = [];
  const writes = [];
  const keep = (jpeg, at) => {
    const file = join(frames, `${String(list.length).padStart(5, '0')}.jpg`);
    list.push({ file, at });
    writes.push(writeFile(file, jpeg));
  };
  let running = true, loop = Promise.resolve(), stopScreencast = async () => {};
  if (scale > 1) {
    loop = (async () => {
      while (running) {
        const asked = Date.now() / 1000;
        try { keep(await page.screenshot({ type: 'jpeg', quality: 90, timeout: 5000 }), (asked + Date.now() / 1000) / 2); }
        catch { await sleep(50); } // the page is navigating or closing
      }
    })();
  } else {
    const cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      keep(Buffer.from(data, 'base64'), metadata.timestamp);
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
    stopScreencast = () => cdp.send('Page.stopScreencast').catch(() => {});
  }
  return {
    async stop(name, from = null, to = null) {
      const end = to ?? Date.now() / 1000;
      running = false;
      await loop;
      await stopScreencast();
      await Promise.all(writes);
      if (!list.length) return console.warn(`${name}: no clip frames`);
      // The page only sends a frame when it changes, so each one lasts until the next: hold it for every 1/30 s tick.
      const t0 = from ?? list[0].at, t1 = Math.min(end, t0 + CLIP_S);
      const ticks = [];
      for (let t = t0, i = 0; t < t1; t += 1 / CLIP_FPS) {
        while (i + 1 < list.length && list[i + 1].at <= t) i++;
        ticks.push(list[i].file);
      }
      const size = ticks.length ? jpegSize(readFileSync(ticks[0])) : null; // the clip's own first frame, not the blank page before the load
      const ff = playwrightFfmpeg();
      if (!ff) console.warn(`${name}: no Playwright ffmpeg (npx playwright install chromium), frames kept in ${frames}`);
      else {
        const webm = join(dir, 'clip.webm');
        const enc = spawn(ff, ['-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(CLIP_FPS), '-i', 'pipe:0', '-y', '-an',
          ...vpxArgs(ff), webm], { stdio: ['pipe', 'ignore', 'inherit'] });
        let closed = false;
        const done = new Promise(r => enc.on('close', code => { closed = true; r(code); }));
        enc.stdin.on('error', () => {}); // ffmpeg quit early: its exit code says why
        for (const f of ticks) {
          if (closed) break;
          if (!enc.stdin.write(readFileSync(f))) await Promise.race([new Promise(r => enc.stdin.once('drain', r)), done]);
        }
        enc.stdin.end();
        if ((await done) !== 0) console.warn(`${name}: Playwright ffmpeg failed to write clip.webm`);
        else if (FRAMES) {
          const length = ticks.length / CLIP_FPS;
          for (let n = 0; n < FRAMES; n++) {
            const at = FRAMES === 1 ? 0 : (n * (length - 1 / CLIP_FPS)) / (FRAMES - 1);
            spawnSync(ff, ['-loglevel', 'error', '-ss', at.toFixed(3), '-i', webm, '-frames:v', '1', '-y', join(dir, `frame-${String(n + 1).padStart(2, '0')}.png`)]);
          }
        }
      }
      const concat = ticks.map(f => `file '${f}'\nduration ${(1 / CLIP_FPS).toFixed(5)}`).join('\n') + `\nfile '${ticks.at(-1)}'\n`;
      await writeFile(join(frames, 'list.txt'), concat);
      const mp4 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'),
        '-vf', `fps=${CLIP_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(dir, 'clip.mp4')]);
      if (mp4.error || mp4.status !== 0) console.log(`${name}: no system ffmpeg, so clip.webm only`);
      if (ff || !mp4.error) await rm(frames, { recursive: true, force: true });
      return size;
    },
  };
}


// ---------- the city (CITY=1) ----------
const band = page => page.evaluate(() => (innerWidth / innerHeight <= 1.2 ? 80 : 96)); // the caption band at the bottom, CSS px (city/camera.ts BAND)
/** Everything the checks need from the page right now. */
const readCity = page => page.evaluate(() => {
  const canvas = document.querySelector('#world'), ctx = canvas.getContext('2d');
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
  for (let i = 0; i < px.length; i += 4) colors.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  const bandPx = innerWidth / innerHeight <= 1.2 ? 80 : 96;
  const rect = el => { const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight - bandPx }; };
  return {
    title: document.title, zoom: document.body.dataset.deckZoom, beat: document.body.dataset.cityBeat,
    labels: [...document.querySelectorAll('.city-label')].map(rect), plates: [...document.querySelectorAll('.city-plate:not([hidden])')].map(rect),
    paletteColors: colors.size, pixelZoom: canvas.dataset.pixelZoom, canvasName: canvas.getAttribute('aria-label'),
    caption: document.querySelector('#toast').textContent, zoomButton: document.querySelector('#zoom')?.textContent,
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});
const zoomTo = async (page, level) => {
  await page.waitForFunction(l => document.body.dataset.deckZoom === l, level, { timeout: 15_000 });
  await sleep(1000);
};

/** SPEC "Shots" 1: the Zoom button by hand. Returns what the city looked like once it settled. */
async function cityManual(page, dir) {
  await page.screenshot({ path: join(dir, 'station.png') });
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await zoomTo(page, 'line');
  await page.screenshot({ path: join(dir, 'line.png') });
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await zoomTo(page, 'city');
  await page.screenshot({ path: join(dir, 'city.png') });
  const seen = await readCity(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await zoomTo(page, 'station');
  return seen;
}

/** SPEC "Shots" 2: the whole reveal on its own page, from load. Returns the caption order and the card it ended on, what the
 *  card said and how tall it was on every frame it was up (the sign-in card must look the same while /api/me is still answering
 *  as after: never "Finding your repositories…", never a change of height), and whether the card carried a focus ring. */
async function cityReveal(page, dir, reduced) {
  const seq = [];
  let last = null;
  await page.evaluate(() => {
    const seen = window.__cardSeen = { titles: [], heights: [] };
    const tick = () => {
      for (const el of document.querySelectorAll('.ic-card:not(.ic-ghost):not(.ic-empty)')) {
        const title = el.querySelector('.ic-title')?.textContent ?? '';
        if (!seen.titles.includes(title)) seen.titles.push(title);
        if (!seen.heights.includes(el.offsetHeight)) seen.heights.push(el.offsetHeight); // layout height: the slide-in's transform does not count
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  const poll = setInterval(async () => {
    try {
      const text = await page.evaluate(() => document.querySelector('#toast').textContent);
      if (text !== last) { last = text; seq.push(text); }
    } catch { /* the page is closing */ }
  }, 100);
  const beat = (name, extra = 0, file) => page.waitForFunction(b => document.body.dataset.cityBeat === b, name, { timeout: 40_000 })
    .then(() => sleep(extra)).then(() => page.screenshot({ path: join(dir, file) }));
  try {
    await beat('line', 1000, 'reveal-line.png');
    await beat('city', reduced ? 700 : 1000, 'reveal-city.png');
    await beat('grow', 1000, 'reveal-lit.png');
    await beat('dim', reduced ? 800 : 1800, 'reveal-dark.png');
    const title = await page.waitForFunction(w => [...document.querySelectorAll('.ic-card .ic-title')].map(t => t.textContent).find(t => t.includes(w)) ?? null, COPY.card, { timeout: 40_000 }).then(h => h.jsonValue()).catch(() => null);
    await sleep(700); // the card slides up
    await page.screenshot({ path: join(dir, 'reveal-card.png') });
    const cardTitle = await page.evaluate(() => document.querySelector('.ic-card:not(.ic-ghost) .ic-title')?.textContent ?? null);
    const card = await page.evaluate(() => window.__cardSeen);
    // the card takes focus when it comes up (screen readers); it must not wear Chrome's ring while it does (#99c8ff and #eeeeee on this dark page)
    const ring = await page.evaluate(() => { const el = document.activeElement; return el && el.matches('.ic-card') ? getComputedStyle(el).outlineStyle : null; });
    // "Sign in with GitHub →" has to stay on one line (its button is the wider column of the card's row, or the stacked one on a phone)
    const signInLines = await page.evaluate(() => {
      const b = document.querySelector('.ic-card:not(.ic-ghost) .ic-btn.approve b');
      if (!b) return null;
      const range = document.createRange(); range.selectNodeContents(b);
      return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
    });
    // no label or plate that shows may sit under the card (a covered tag steps aside, cuts its plate or hides: city/labels.ts)
    const underCard = await page.evaluate(() => {
      const card = document.querySelector('.ic-card:not(.ic-ghost)');
      if (!card) return [];
      const c = card.getBoundingClientRect(), bad = [];
      for (const part of document.querySelectorAll('.city-tag .city-label, .city-tag .city-plate:not([hidden])')) {
        if (getComputedStyle(part).visibility === 'hidden') continue; // a hidden tag, or a plate the card cut
        const r = part.getBoundingClientRect();
        if (r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom) bad.push(part.textContent);
      }
      return bad;
    });
    return { seq, cardTitle: title ?? cardTitle, finished: !!title, card, ring, signInLines, underCard };
  } finally { clearInterval(poll); }
}

/** What is wrong with the manual city (the end state of beat 5: line lit, five dark, plates on, no caption). */
function manualProblems(c) {
  const out = [];
  if (c.title !== 'Shiptorio') out.push('wrong page title');
  if (c.labels.length !== 6 || c.labels.some(l => !l.fits)) out.push('city labels clipped, under the caption band or missing');
  if (c.plates.length !== 5 || c.plates.some(p => !p.fits)) out.push('COMING SOON plates clipped, under the caption band or missing');
  if (!Number.isInteger(Number(c.pixelZoom))) out.push(`city pixel zoom is ${c.pixelZoom}, not a whole number`);
  if (c.paletteColors > 48) out.push(`city draws ${c.paletteColors} colors, the palette has 48`);
  if (c.caption !== '') out.push(`the manual city shows a caption: ${JSON.stringify(c.caption)}`);
  if (c.zoomButton !== 'Zoom in') out.push(`the Zoom button says ${JSON.stringify(c.zoomButton)} at the city, wanted "Zoom in"`);
  if (!/city/i.test(c.canvasName ?? '')) out.push('the canvas has no accessible name for the city');
  if (c.overflow > 1) out.push(`city page is ${c.overflow}px wider than the screen`);
  return out;
}

/** The caption order the story must play: from the first caption of the reveal, empties and repeats dropped. */
const captionOrder = seq => seq.slice(Math.max(0, seq.indexOf(COPY.line))).filter(Boolean);

async function run(browser, base, view) {
  const dir = join(out, view.name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext(view.options);
  // the reveal ends on the sign-in card, which needs a guest answer from /api/me; plain vite has no worker behind it
  if (CITY && !process.env.STRICT) await context.route('**/api/me', async route => {
    if (ME_DELAY) await sleep(ME_DELAY);
    await route.fulfill({ json: { guest: true, login: null, githubConfigured: true } }).catch(() => {}); // the page may have closed while it waited
  });
  // NO_HMR: vite's hot-reload socket is answered by a stand-in that never says anything, so no saved file reloads a page
  if (process.env.NO_HMR) await context.routeWebSocket(/.*/, () => {});
  const page = await context.newPage();
  const clip = CLIP_S && !CITY ? await startClip(context, page, dir, deviceOf(view)) : null;
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
  if (CITY && PATH.includes('conveyor-demo')) await page.getByRole('button', { name: 'Start', exact: true }).click(); // the demo's card hides Zoom
  await sleep(300);
  await page.screenshot({ path: join(dir, '00-first.png') });
  await sleep(3000);
  await page.screenshot({ path: join(dir, '01-settled.png') });
  await page.screenshot({ path: join(dir, '02-full.png'), fullPage: true });
  const colors = await canvasColors(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (CLIP_S && !CITY) await sleep(CLIP_S * 1000 - 3300);
  const problems = [...errors];
  if (colors >= 0 && colors < 4) problems.push(`canvas looks blank (${colors} colors)`);
  if (overflow > 1) problems.push(`page is ${overflow}px wider than the screen`);
  let city;
  if (CITY) {
    const reduced = !!view.options.reducedMotion && view.options.reducedMotion === 'reduce';
    const manual = await cityManual(page, dir);
    problems.push(...manualProblems(manual));
    // the reveal on its own page (and, with CLIP, its own recording from load)
    const revealPage = await context.newPage();
    revealPage.on('pageerror', e => errors.push(`reveal: ${e.message}`));
    if (CLIP_S && CLIP_S < (reduced ? REVEAL_SECONDS.reduced : REVEAL_SECONDS.normal) + CARD_SETTLE) problems.push('clip ends before the card');
    const revealClip = CLIP_S ? await startClip(context, revealPage, dir, deviceOf(view)) : null;
    await revealPage.goto(`${base}${REVEAL_PATH}`);
    // The clip opens once the deck itself says it is ready and two more animation frames have drawn, not on a drawn canvas:
    // the story's clock starts with that first frame, and reveal t = 0 (the rocket lifting off) is 0.5 s after it.
    await revealPage.waitForSelector('[data-deck-ready]', { state: 'attached', timeout: 30_000 });
    await revealPage.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const clipFrom = Date.now() / 1000;
    const reveal = await cityReveal(revealPage, dir, reduced);
    const seen = await readCity(revealPage);
    let clipSize = null;
    if (revealClip) { await sleep(Math.max(0, (clipFrom + CLIP_S) * 1000 - Date.now())); clipSize = await revealClip.stop(view.name, clipFrom); }
    await revealPage.close();
    // the same order with reduced motion: its island captions are cuts (each held 3.0s, the islands still dark)
    const order = captionOrder(reveal.seq), want = [COPY.line, COPY.city, ...COPY.islands, COPY.grow, COPY.dim];
    if (JSON.stringify(order) !== JSON.stringify(want)) problems.push(`reveal captions ${JSON.stringify(order)}, wanted ${JSON.stringify(want)}`);
    if (!reveal.finished || reveal.cardTitle !== COPY.card) problems.push(`reveal card title ${JSON.stringify(reveal.cardTitle)}, wanted ${JSON.stringify(COPY.card)}`);
    if (reveal.card.titles.some(t => /Finding your repositories/i.test(t))) problems.push(`the card showed "Finding your repositories…" during the reveal: ${JSON.stringify(reveal.card.titles)}`);
    if (reveal.card.heights.length > 1) problems.push(`the card changed height during the reveal: ${reveal.card.heights.join(', ')} px`);
    if (reveal.ring && reveal.ring !== 'none') problems.push(`the card shows a focus ring (outline-style ${reveal.ring})`);
    if (reveal.signInLines !== 1) problems.push(`the Sign in button's words are on ${reveal.signInLines} lines, wanted 1`);
    if (reveal.underCard.length) problems.push(`a label or plate shows under the sign-in card: ${reveal.underCard.join(', ')}`);
    if (seen.overflow > 1) problems.push(`reveal page is ${seen.overflow}px wider than the screen`);
    problems.push(...errors.filter(e => e.startsWith('reveal: ')));
    city = { reduced, manual, captions: order, card: reveal.cardTitle, cardSeen: reveal.card, meDelay: ME_DELAY, ...(clipSize ? { clip: `${clipSize.width}x${clipSize.height}` } : {}) };
  }
  await writeFile(join(dir, 'report.json'), JSON.stringify({ url: `${base}${PATH}`, readyMs, canvasColors: colors, overflow, problems, city, apiMisses: [...apiMisses] }, null, 2));
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
  for (const view of VIEWS.filter(v => !process.env.ONLY || process.env.ONLY.split(',').includes(v.name))) {
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
