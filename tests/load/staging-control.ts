import { writePrivateJSON } from './private-files';
const secrets = await Bun.file('.test-runtime/staging-load/secrets.json').json();
export async function control(path: 'seed' | 'grants') {
  const r = await fetch(`https://shiptorio.dev/__load/${path}`, { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${secrets.LOAD_SETUP_TOKEN}` }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Staging ${path}: ${r.status}`);
  return r.json();
}
if (process.argv.includes('seed')) {
  const fixtures = await control('seed');
  await writePrivateJSON('.test-runtime/staging-load/fixtures.json', fixtures);
  console.log('Created 50 socket fixtures across five staging-only accounts; cookies saved privately');
} else if (process.argv.includes('keep-warm')) {
  let failureCount = 0;
  for (let i = 0; i < 80; i++) {
    try { await control('grants'); failureCount = 0; console.log(`Warm provider grants refreshed at ${new Date().toISOString()}`); await Bun.sleep(60000); }
    catch (error) {
      failureCount++;
      console.error(JSON.stringify({ at: new Date().toISOString(), event: 'fixture-grant-renewal-failed', failures: failureCount, reason: error instanceof Error ? error.name : 'transport' }));
      if (failureCount >= 5) throw new Error('Fixture grants unavailable; stop the comparison');
      await Bun.sleep(Math.min(15000, 1000 * 2 ** failureCount));
    }
  }
}
