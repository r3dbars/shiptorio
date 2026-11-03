/** In-memory fault drill over the real built judge assets. Never touches Cloudflare. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { browserSmoke } from './browser.mjs';

const root = resolve(import.meta.dir, '../../web/dist');
const out = resolve(process.argv[2] || '/tmp/shiptorio-local-browser-drill');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const entry = html.match(/src="(\/assets\/index-[^"/]+\.js)"/)?.[1];
assert.ok(entry, 'Build the web app before running the drill');
let broken = false;
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (broken && path === entry) return new Response('throw new Error("browser rollback drill: deliberately broken entry");', {
      headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store' },
    });
    const file = resolve(root, path === '/judge' || path === '/' ? 'deck.html' : `.${path}`);
    if (relative(root, file).startsWith('..')) return new Response('Not found', { status: 404 });
    return new Response(Bun.file(file), { headers: { 'cache-control': 'no-store' } });
  },
});
try {
  await browserSmoke(server.url.href, resolve(out, 'healthy'));
  broken = true;
  await assert.rejects(() => browserSmoke(server.url.href, resolve(out, 'rejected')), /Browser smoke failed/);
  const failures = JSON.parse(await readFile(resolve(out, 'rejected/results.json'), 'utf8'));
  assert.equal(failures.length, 2);
  assert.ok(failures.every(result => !result.ok && result.errors.some(error => error.includes('browser rollback drill: deliberately broken entry'))),
    'Both sizes must fail on the deliberately broken built JavaScript');
  broken = false;
  await browserSmoke(server.url.href, resolve(out, 'restored'));
  console.log(`Local built-asset drill passed: healthy → deliberate crash rejected → original assets restored. Evidence: ${out}`);
  console.log('Local proof only; no Cloudflare deployment or automatic production rollback was exercised.');
} finally { server.stop(true); }
