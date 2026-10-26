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

test("stored keys and revocation stay with the same immutable ID across rename", async () => {
  const { env, DB, scope } = await fixture();
  const { revokeCreds, credentialStatus, linkedRepo } = await import("../src/sources/creds");
  await saveCreds(env, "sentry", { clientSecret: "synthetic-stable-key" }, scope);
  await DB.prepare("UPDATE repos SET full_name = 'example/renamed' WHERE repo_id = 501").run();
  const renamed = { ...scope, repo: "example/renamed" };
  expect((await sentryCreds(env, renamed)).clientSecret).toBe("synthetic-stable-key");
  expect(await linkedRepo(env, "sentry")).toBe(renamed.repo);
  await revokeCreds(env, "sentry", renamed);
  env.SENTRY_CLIENT_SECRET = "synthetic-operator-key";
  await DB.prepare("UPDATE repos SET full_name = 'example/again' WHERE repo_id = 501").run();
  expect(await sentryCreds(env, { ...scope, repo: "example/again" })).toEqual({});
  expect((await credentialStatus(env, "sentry", { ...scope, repo: "example/again" })).connected).toBe(false);
});

test("archived, suspended, changed-installation and caller-forged identities cannot read or write credentials", async () => {
  const { env, DB, scope } = await fixture();
  await saveCreds(env, "sentry", { clientSecret: "synthetic-stable-key" }, scope);
  expect(await sentryCreds(env, { ...scope, repoId: 502 })).toEqual({});
  await DB.prepare("UPDATE repos SET archived_at = 1").run();
  expect(await sentryCreds(env, scope)).toEqual({});
  await expect(saveCreds(env, "sentry", { clientSecret: "replacement" }, scope)).rejects.toThrow("Repository identity unavailable");
  await DB.prepare("UPDATE repos SET archived_at = NULL").run();
  await DB.prepare("UPDATE installations SET status = 'suspended'").run();
  expect(await sentryCreds(env, scope)).toEqual({});
  await DB.prepare("UPDATE installations SET status = 'active'").run();
  await DB.prepare("INSERT INTO installations (id, account_login) VALUES (41, 'other')").run();
  await DB.prepare("UPDATE repos SET installation_id = 41").run();
  expect(await sentryCreds(env, { ...scope, installationId: 41 })).toEqual({});
  expect(await sentryCreds(env, scope)).toEqual({});
});

test("unpinned names and link aliases never adopt legacy material or advertise operator keys", async () => {
  const { env, DB, kv, scope } = await fixture();
  const { credentialStatus, linkedRepo } = await import("../src/sources/creds");
  env.SENTRY_REPO_ID = ""; env.SENTRY_INSTALLATION_ID = "";
  env.SENTRY_CLIENT_SECRET = "synthetic-operator-key";
  kv.set("link:sentry", scope.repo);
  kv.set("cred:sentry", JSON.stringify({ clientSecret: "synthetic-legacy-global" }));
  kv.set("cred:sentry:example/shop", JSON.stringify({ clientSecret: "synthetic-legacy-repo" }));
  await DB.prepare("INSERT INTO credentials (scope, kind, envelope, updated_at) VALUES ('installation:40:repo:example/shop', 'sentry', 'unproven-envelope', 1)").run();
  expect(await sentryCreds(env, scope)).toEqual({});
  expect(await linkedRepo(env, "sentry")).toBeNull();
  expect(await linkedRepo(env, "sentry", scope)).toBeNull();
  expect((await credentialStatus(env, "sentry", scope)).workerOverride).toBe(false);
  expect(kv.size).toBe(3);
});

test("identity-proven name envelopes can migrate; copied ciphertext cannot decrypt under another repo ID", async () => {
  const { env, DB, scope } = await fixture();
  const { encryptCredential } = await import("../src/sources/credential-crypto");
  const old = await encryptCredential(env, "installation:40:repo:example/shop:sentry", { clientSecret: "synthetic-old-bound-by-operator" });
  await DB.prepare("INSERT INTO credentials (scope, kind, envelope, updated_at) VALUES (?, 'sentry', ?, 1)").bind("installation:40:repo:example/shop", JSON.stringify(old)).run();
  expect((await sentryCreds(env, scope)).clientSecret).toBe("synthetic-old-bound-by-operator");
  const current = await DB.prepare("SELECT envelope FROM credentials WHERE scope = 'installation:40:repo-id:501'").first<{ envelope: string }>();
  await DB.prepare("INSERT INTO repos (full_name, installation_id, repo_id) VALUES ('example/other', 40, 502)").run();
  await DB.prepare("INSERT INTO credentials (scope, kind, envelope, updated_at) VALUES ('installation:40:repo-id:502', 'sentry', ?, 1)").bind(current!.envelope).run();
  await expect(sentryCreds(env, { ...scope, repo: "example/other" })).rejects.toThrow("Credential decryption failed");
});

test("a pinned rename target cannot adopt another repository's residual legacy name credentials", async () => {
  const { env, DB, kv, scope } = await fixture();
  await DB.prepare("UPDATE repos SET full_name = 'example/renamed' WHERE repo_id = 501").run();
  kv.set("cred:sentry:example/renamed", JSON.stringify({ clientSecret: "synthetic-other-repo-key" }));
  await DB.prepare("INSERT INTO credentials(scope, kind, envelope, updated_at) VALUES ('installation:40:repo:example/renamed', 'sentry', 'unproven-other-envelope', 1)").run();
  expect(await sentryCreds(env, { ...scope, repo: "example/renamed" })).toEqual({});
  expect(kv.has("cred:sentry:example/renamed")).toBe(true);
});

test("legacy revocation survives a metadata-only usage record during identity upgrade", async () => {
  const { env, DB, scope } = await fixture();
  const { markUsed } = await import("../src/sources/creds");
  env.SENTRY_CLIENT_SECRET = "synthetic-operator-key";
  await DB.prepare("INSERT INTO credentials(scope, kind, revoked, updated_at) VALUES ('installation:40:repo:example/shop', 'sentry', 1, 1)").run();
  await markUsed(env, "sentry", scope);
  expect(await sentryCreds(env, scope)).toEqual({});
});
