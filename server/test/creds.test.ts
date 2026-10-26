import { testD1 } from "./d1-fixture";
import { expect, test } from "bun:test";
import { postHogCreds, saveCreds, sentryCreds } from "../src/sources/creds";

const kvEnv = async (seed: Record<string, string> = {}) => {
  const kv = new Map(Object.entries(seed));
  const DB = testD1();
  await DB.prepare("INSERT INTO installations (id, account_login) VALUES (1, 'fixture')").run();
  await DB.prepare("INSERT INTO repos (full_name, installation_id, repo_id) VALUES ('alice/shop', 1, 501), ('r3dbars/testing', 1, 502)").run();
  return { DB, SENTRY_REPO_ID: "502", SENTRY_INSTALLATION_ID: "1", POSTHOG_REPO_ID: "502", POSTHOG_INSTALLATION_ID: "1", CRED_MASTER_KEY: btoa("a".repeat(32)), CACHE: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } as never;
};

test("mine keys are per repo, so one player's Sentry never feeds another's map", async () => {
  const env = await kvEnv();
  await saveCreds(env, "sentry", { clientSecret: "alice-secret-0123456789" }, { installationId: 1, repo: "Alice/Shop" });
  expect(await sentryCreds(env, { installationId: 1, repo: "alice/shop" })).toEqual({ clientSecret: "alice-secret-0123456789" });
  expect(await sentryCreds(env, { installationId: 1, repo: "bob/app" })).toEqual({});
});

test("keys saved before accounts keep working, but only for the repo they were linked to", async () => {
  const env = await kvEnv({ "cred:posthog": JSON.stringify({ apiKey: "phx_legacy", projectId: "1" }), "link:posthog": "r3dbars/testing" });
  expect((await postHogCreds(env, { installationId: 1, repo: "r3dbars/testing" })).apiKey).toBe("phx_legacy");
  expect(await postHogCreds(env, { installationId: 1, repo: "someone/else" })).toEqual({});
});

test("Worker-secret keys belong to the linked map only", async () => {
  const env = { ...((await kvEnv({ "link:sentry": "r3dbars/testing" })) as object), SENTRY_CLIENT_SECRET: "operator-secret-0123456789" } as never;
  expect((await sentryCreds(env, { installationId: 1, repo: "r3dbars/testing" })).clientSecret).toBe("operator-secret-0123456789");
  expect(await sentryCreds(env, { installationId: 1, repo: "someone/else" })).toEqual({});
});
