// Default is a read-only resource plan. --apply is for an explicitly approved deployment.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "../.."), dir = join(root, ".fixture-setup");
const plan = {
  creates: { worker: "shiptorio-fixture", d1: "shiptorio-fixture", kv: "shiptorio-fixture-cache", durableObjects: ["Factory", "FixtureProvider"] },
  modifiesOnlyWhenActivated: { worker: "shiptorio-staging", domain: "shiptorio.dev", binding: "TEST_FACTORY -> shiptorio-fixture", secret: "TEST_FACTORY_KEY (new, fixture-only)" },
  network: "private service binding only; no routes, workers.dev or preview URL for fixture backend; all provider fetches go to fixture DO",
  production: "No changes to shiptorio.com or any other Worker; no production credentials, databases or KV reused",
};
if (!process.argv.includes("--apply")) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
const require = createRequire(join(root, "server/package.json"));
const production = require("wrangler").unstable_readConfig({ config: join(root, "server/wrangler.jsonc") });
const staging = require("wrangler").unstable_readConfig({ config: join(root, "server/wrangler.jsonc"), env: "staging" });
if (production.name !== "shiptorio" || production.vars.PUBLIC_URL !== "https://shiptorio.com" || staging.name !== "shiptorio-staging" || staging.vars.PUBLIC_URL !== "https://shiptorio.dev") throw new Error("Unexpected project targets; refusing all resource mutations");
if (plan.creates.worker !== "shiptorio-fixture" || plan.creates.d1 !== "shiptorio-fixture" || plan.creates.kv !== "shiptorio-fixture-cache") throw new Error("Unexpected fixture resource names");
mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
const save = (name, value) => { const path = join(dir, name); writeFileSync(path, JSON.stringify(value, null, 2)); chmodSync(path, 0o600); return path; };
const run = args => execFileSync("node", [join(root, "server/node_modules/wrangler/wrangler-dist/cli.js"), ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const stateFile = join(dir, "resources.json");
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
const protectedD1 = [...production.d1_databases, ...staging.d1_databases].map(d => d.database_id);
const protectedKV = [...production.kv_namespaces, ...staging.kv_namespaces].map(k => k.id);
if (protectedD1.includes(state.databaseId) || protectedKV.includes(state.kvId)) throw new Error("Fixture resources overlap application storage");
if (!state.databaseId) {
  const out = run(["d1", "create", plan.creates.d1]);
  state.databaseId = out.match(/database_id["\s:=]+["']?([a-f0-9-]{36})/i)?.[1];
  if (!state.databaseId) throw new Error("Database created but its ID was not recognized; inspect Cloudflare before retrying");
  save("resources.json", state);
}
if (!state.kvId) {
  const out = run(["kv", "namespace", "create", plan.creates.kv]);
  state.kvId = out.match(/["']?id["'\s:=]+["']?([a-f0-9]{32})/i)?.[1];
  if (!state.kvId) throw new Error("KV created but its ID was not recognized; inspect Cloudflare before retrying");
  save("resources.json", state);
}
if (!/^[a-f0-9-]{36}$/.test(state.databaseId) || !/^[a-f0-9]{32}$/.test(state.kvId)) throw new Error("Invalid fixture resource IDs");
const secretsFile = join(dir, "fixture-secrets.json");
const secrets = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8")) : {
  SESSION_SECRET: randomBytes(32).toString("hex"), APP_PASSWORD: randomBytes(32).toString("hex"),
  TEST_FACTORY_KEY: randomBytes(32).toString("hex"), GITHUB_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey,
  GITHUB_CLIENT_SECRET: randomBytes(32).toString("hex"), META_API_KEY: "fixture-only-not-a-real-api-key",
};
save("fixture-secrets.json", secrets);
const fixtureConfig = save("fixture.json", {
  name: "shiptorio-fixture", main: join(root, "playtest/staging/worker.ts"), compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"],
  workers_dev: false, preview_urls: false, routes: [],
  durable_objects: { bindings: [{ name: "FACTORY", class_name: "Factory" }, { name: "FIXTURE_PROVIDERS", class_name: "FixtureProvider" }] },
  migrations: [{ tag: "fixture-v1", new_sqlite_classes: ["Factory", "FixtureProvider"] }],
  d1_databases: [{ binding: "DB", database_name: "shiptorio-fixture", database_id: state.databaseId, migrations_dir: join(root, "server/migrations") }],
  kv_namespaces: [{ binding: "CACHE", id: state.kvId }],
  vars: { PUBLIC_URL: "https://shiptorio.dev", TEST_USERS: "on", FIXTURE_INSTANCE: "shiptorio-fixture", ALLOWED_LOGINS: "", ADMIN_LOGINS: "", GITHUB_APP_ID: "1", GITHUB_CLIENT_ID: "fixture", GITHUB_APP_SLUG: "shiptorio-stub", SPARK_BASE_URL: "https://api.meta.ai/v1", SPARK_MODEL: "muse-spark-1.3" },
});
run(["d1", "migrations", "apply", "shiptorio-fixture", "--remote", "--config", fixtureConfig]);
run(["deploy", "--config", fixtureConfig]);
run(["secret", "bulk", secretsFile, "--config", fixtureConfig]);
if (process.argv.includes("--activate-stage")) {
  const c = staging;
  if (c.name !== "shiptorio-staging" || c.vars.PUBLIC_URL !== "https://shiptorio.dev") throw new Error("Refusing unexpected staging target");
  const stageConfig = save("staging.json", {
    name: "shiptorio-staging", main: join(root, "server/src/index.ts"), compatibility_date: c.compatibility_date, compatibility_flags: c.compatibility_flags,
    workers_dev: false, routes: [{ pattern: "shiptorio.dev", custom_domain: true }],
    assets: { ...c.assets, directory: join(root, "web/dist") }, durable_objects: c.durable_objects, migrations: c.migrations,
    d1_databases: c.d1_databases.map(d => ({ ...d, migrations_dir: join(root, "server/migrations") })), kv_namespaces: c.kv_namespaces,
    triggers: c.triggers, limits: c.limits, observability: c.observability,
    vars: { ...c.vars, TEST_USERS: "on" }, services: [...(c.services ?? []).filter(s => s.binding !== "TEST_FACTORY"), { binding: "TEST_FACTORY", service: "shiptorio-fixture" }],
  });
  execFileSync("bun", ["run", "build"], { cwd: root, stdio: "inherit" });
  const stageKey = save("stage-fixture-key.json", { TEST_FACTORY_KEY: secrets.TEST_FACTORY_KEY });
  run(["secret", "bulk", stageKey, "--config", stageConfig]);
  run(["deploy", "--config", stageConfig]);
}
console.log("Fixture backend deployed. Staging activation:", process.argv.includes("--activate-stage") ? "complete" : "not requested");
