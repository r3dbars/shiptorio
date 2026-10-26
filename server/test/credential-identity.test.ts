import { expect, test } from "bun:test";
import { testD1 } from "./d1-fixture";
import { sentryCreds, postHogCreds, saveCreds, type CredsEnv } from "../src/sources/creds";

async function fixture() {
  const DB = testD1();
  await DB.prepare("INSERT INTO installations (id, account_login) VALUES (40, 'example')").run();
  await DB.prepare("INSERT INTO repos (full_name, installation_id, repo_id) VALUES ('example/shop', 40, 501)").run();
  const kv = new Map<string, string>();
  const env = { DB, CRED_MASTER_KEY: btoa("a".repeat(32)), SENTRY_REPO: "example/shop", SENTRY_INSTALLATION_ID: "40", SENTRY_REPO_ID: "501", POSTHOG_REPO: "example/shop", POSTHOG_INSTALLATION_ID: "40", POSTHOG_REPO_ID: "501", CACHE: {
    async get(key: string, type?: string) { const value = kv.get(key); return value == null ? null : type === "json" ? JSON.parse(value) : value; },
    async delete(key: string) { kv.delete(key); }, async put(key: string, value: string) { kv.set(key, value); },
  } } as unknown as CredsEnv & { SENTRY_INSTALLATION_ID: string; SENTRY_REPO_ID: string; POSTHOG_INSTALLATION_ID: string; POSTHOG_REPO_ID: string };
  return { env, DB, kv, scope: { installationId: 40, repo: "example/shop" } };
}

test("Worker keys do not follow a repository name to its replacement", async () => {
  const { env, DB, scope } = await fixture();
  env.SENTRY_CLIENT_SECRET = "synthetic-operator-sentry-key";
  env.POSTHOG_API_KEY = "phx_synthetic_operator_key"; env.POSTHOG_PROJECT_ID = "123";
  expect((await sentryCreds(env, scope)).clientSecret).toBe(env.SENTRY_CLIENT_SECRET);
  expect((await postHogCreds(env, scope)).apiKey).toBe(env.POSTHOG_API_KEY);
  await DB.prepare("UPDATE repos SET repo_id = 502").run();
  expect(await sentryCreds(env, scope)).toEqual({});
  expect(await postHogCreds(env, scope)).toEqual({});
});

test("legacy KV cannot be adopted by a replacement with the same name and installation", async () => {
  const { env, DB, kv, scope } = await fixture();
  kv.set("cred:sentry", JSON.stringify({ clientSecret: "synthetic-original-owner-key" }));
  kv.set("cred:posthog:example/shop", JSON.stringify({ apiKey: "phx_synthetic_original_key", projectId: "123" }));
  await DB.prepare("UPDATE repos SET repo_id = 502").run();
  expect(await sentryCreds(env, scope)).toEqual({});
  expect(await postHogCreds(env, scope)).toEqual({});
  expect(kv.size).toBe(2);
});

test("rename then old-name reuse does not expose an encrypted credential", async () => {
  const { env, DB, scope } = await fixture();
  await saveCreds(env, "sentry", { clientSecret: "synthetic-encrypted-original-key" }, scope);
  await DB.prepare("UPDATE repos SET full_name = 'example/renamed' WHERE repo_id = 501").run();
  await DB.prepare("INSERT INTO repos (full_name, installation_id, repo_id) VALUES ('example/shop', 40, 502)").run();
  expect(await sentryCreds(env, scope)).toEqual({});
});
