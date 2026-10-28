import { mkdir } from 'node:fs/promises';
import { makeStagingConfig } from './staging-config';
import { writePrivateJSON } from './private-files';
import { resolve } from 'node:path';
// The generated config contains only the isolated staging bindings. Never merge
// top-level production resources into it or fall back to the default config.
const root = resolve(import.meta.dir, '../..');
const dir = resolve(root, '.test-runtime/staging-load');
await mkdir(dir, { recursive: true, mode: 0o700 });
const config = makeStagingConfig();
await Bun.write(`${dir}/wrangler.json`, JSON.stringify(config, null, 2));
// Existing staging gate/session secrets are shared with the coordinator. Never
// copy or rotate them here; only the owned short-lived setup token is installed.
await writePrivateJSON(`${dir}/secrets.json`, { LOAD_SETUP_TOKEN: crypto.randomUUID() + crypto.randomUUID() });
console.log('Generated staging-only config and private ephemeral setup token under .test-runtime/staging-load');
