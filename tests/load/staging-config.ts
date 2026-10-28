export function makeStagingConfig(now = Date.now()) {
const config = {
  name: 'shiptorio-staging', main: '../../tests/load/staging-worker.ts', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'],
  routes: [{ pattern: 'shiptorio.dev', custom_domain: true }],
  assets: { directory: '../../web/dist', binding: 'ASSETS', run_worker_first: true },
  durable_objects: { bindings: [{ name: 'FACTORY', class_name: 'Factory' }] }, migrations: [{ tag: 'v1', new_sqlite_classes: ['Factory'] }],
  d1_databases: [{ binding: 'DB', database_name: 'shiptorio-staging', database_id: '82bf6646-ed06-4c4d-94c3-c9b747940a7e', migrations_dir: '../../server/migrations' }],
  kv_namespaces: [{ binding: 'CACHE', id: 'eb151c15e208446482ca39062005f4d9' }],
  observability: { enabled: true, head_sampling_rate: 1 },
  vars: { PUBLIC_URL: 'https://shiptorio.dev', ALLOWED_LOGINS: 'r3dbars', ADMIN_LOGINS: 'r3dbars', SPARK_DISABLED: '1', LOAD_SETUP_UNTIL: String(now + 4 * 3600000) },
};
return config;
}
