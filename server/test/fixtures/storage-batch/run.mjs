import { unstable_dev } from 'wrangler';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const worker = await unstable_dev(fileURLToPath(new URL('./worker.ts', import.meta.url)), {
  config: fileURLToPath(new URL('./wrangler.jsonc', import.meta.url)),
  local: true, persist: false, port: 0, logLevel: 'error',
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
});
try {
  const response = await worker.fetch('/exercise');
  const body = await response.text();
  assert.equal(response.status, 200, body);
  const result = JSON.parse(body);
  assert(result.chunks > 128);
  assert.deepEqual(result, {chunks: result.chunks, rollback: true, unicode: true, shrink: true, expiredMarkers: 257});
  console.log(JSON.stringify(result));
} finally { await worker.stop(); }
