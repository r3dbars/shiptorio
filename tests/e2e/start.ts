import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve('.test-runtime');
await mkdir(dir, { recursive: true });
await rm(`${dir}/state`, { recursive: true, force: true });
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
const config = {
  name: 'shiptorio-test', main: '../tests/e2e/worker.ts', compatibility_date: '2026-10-01',
  assets: { directory: '../web/dist', binding: 'ASSETS', run_worker_first: true },
  durable_objects: { bindings: [{ name: 'FACTORY', class_name: 'Factory' }] },
  migrations: [{ tag: 'v1', new_sqlite_classes: ['Factory'] }],
  d1_databases: [{ binding: 'DB', database_name: 'test', database_id: '00000000-0000-0000-0000-000000000001', migrations_dir: '../server/migrations' }],
  kv_namespaces: [{ binding: 'CACHE', id: 'local-only' }],
  vars: { DEV_LOGIN: 'fixture', ALLOWED_LOGINS: 'fixture,fixture1,fixture2,fixture3,fixture4,fixture5', SESSION_SECRET: 'public-test-only-session', APP_PASSWORD: 'public-test-only-preview', GITHUB_APP_SLUG: 'fixture-app', GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-client-secret', GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, GITHUB_WEBHOOK_SECRET: 'public-test-hook', META_API_KEY: 'fixture', SPARK_BASE_URL: 'https://fixture.meta/v1' },
};
await Bun.write(`${dir}/wrangler.json`, JSON.stringify(config));
let child: ReturnType<typeof Bun.spawn> | undefined;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { child?.kill(signal); process.exit(0); });
const run = async (args: string[]) => { const p = child = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' }); if (await p.exited) throw new Error(args.join(' ')); };
await run(['bun', 'run', 'build']);
await run(['node', 'server/node_modules/wrangler/wrangler-dist/cli.js', 'd1', 'migrations', 'apply', 'test', '--local', '--config', `${dir}/wrangler.json`, '--persist-to', `${dir}/state`]);
await run(['node', 'server/node_modules/wrangler/wrangler-dist/cli.js', 'dev', '--local', '--config', `${dir}/wrangler.json`, '--persist-to', `${dir}/state`, '--port', '8799', '--inspector-port', '9249']);
