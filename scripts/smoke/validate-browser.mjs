/** Explicit Chromium regression fixtures; kept out of bun test's browser-free suite. */
import { browserSmoke } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const mode of ['healthy', 'black', 'console', 'crash']) {
  const server = Bun.serve({ port: 0, fetch: () => new Response(`<!doctype html><div class="judge-welcome"><button>Play</button></div><script>
    document.querySelector('button').onclick = () => {
      const canvas = document.createElement('canvas'); canvas.className = 'map'; canvas.width = 390; canvas.height = 844; document.body.append(canvas);
      const ctx = canvas.getContext('2d');
      function frame() {
        for(let y=0;y<844;y+=20) for(let x=0;x<390;x+=20) { ctx.fillStyle = ${mode === 'black' ? "'black'" : "'rgb('+x%255+','+y%255+',100)'"}; ctx.fillRect(x,y,20,20); }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      ${mode === 'console' ? "console.error('fixture console error')" : ''}
      ${mode === 'crash' ? "setTimeout(() => { throw new Error('fixture crash') }, 10)" : ''}
    };
    </script>`, { headers: { 'content-type': 'text/html' } }) });
  try {
    const awaitOut = await mkdtemp(join(tmpdir(), 'browser-smoke-fixture-'));
    const run = () => browserSmoke(server.url.href, join(awaitOut, mode));
    if (mode === 'healthy') await run();
    else await assert.rejects(run, /Browser smoke failed/);
    console.log(`PASS ${mode}`);
  } finally { server.stop(true); }
}
