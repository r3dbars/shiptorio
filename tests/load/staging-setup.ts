import { mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
// The generated config contains only the isolated staging bindings. Never merge
// top-level production resources into it or fall back to the default config.
const root = resolve(import.meta.dir, '../..');
const dir = resolve(root, '.test-runtime/staging-load');
await mkdir(dir, { recursive: true, mode: 0o700 });
const config = {
  name: 'shiptorio-staging', main: '../../tests/load/staging-worker.ts', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'],
  routes: [{ pattern: 'shiptorio.dev', custom_domain: true }],
  assets: { directory: '../../web/dist', binding: 'ASSETS', run_worker_first: true },
  durable_objects: { bindings: [{ name: 'FACTORY', class_name: 'Factory' }] }, migrations: [{ tag: 'v1', new_sqlite_classes: ['Factory'] }],
  d1_databases: [{ binding: 'DB', database_name: 'shiptorio-staging', database_id: '82bf6646-ed06-4c4d-94c3-c9b747940a7e', migrations_dir: '../../server/migrations' }],
  kv_namespaces: [{ binding: 'CACHE', id: 'eb151c15e208446482ca39062005f4d9' }],
  observability: { enabled: true, head_sampling_rate: 1 },
  vars: { PUBLIC_URL: 'https://shiptorio.dev', ALLOWED_LOGINS: 'r3dbars', ADMIN_LOGINS: 'r3dbars', SPARK_DISABLED: '1', LOAD_SETUP_UNTIL: String(Date.now() + 4 * 3600000) },
};
await Bun.write(`${dir}/wrangler.json`, JSON.stringify(config, null, 2));
// Existing staging gate/session secrets are shared with the coordinator. Never
// copy or rotate them here; only the owned short-lived setup token is installed.
await Bun.write(`${dir}/secrets.json`, JSON.stringify({ LOAD_SETUP_TOKEN: crypto.randomUUID() + crypto.randomUUID() }));
await chmod(`${dir}/secrets.json`, 0o600);
console.log('Generated staging-only config and private ephemeral setup token under .test-runtime/staging-load');
