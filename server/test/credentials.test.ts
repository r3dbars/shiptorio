import { expect, test } from "bun:test";
import { credentialDB } from "./credential-fixture";
import { encryptCredential, decryptCredential } from "../src/sources/credential-crypto";
import { credentialStatus, sentryCreds, postHogCreds, saveCreds, revokeCreds, markUsed, scopeKey, type CredsEnv, type CredentialScope } from "../src/sources/creds";
import { Redactor } from "../src/redact";

const scope: CredentialScope = { installationId: 12, repo: "alice/shop", user: "alice" };
const secret = "private-sentry-test-value-543210";
function fixture() {
  const kv = new Map<string, string>();
  const db = credentialDB();
  const env = {
    DB: db, SENTRY_REPO_ID: "501", SENTRY_INSTALLATION_ID: "12", POSTHOG_REPO_ID: "501", POSTHOG_INSTALLATION_ID: "12", CRED_MASTER_KEY: btoa("a".repeat(32)),
    CACHE: {
      async get(key: string, type?: string) { const value = kv.get(key); return value === undefined ? null : type === "json" ? JSON.parse(value) : value; },
      async put(key: string, value: string) { kv.set(key, value); },
      async delete(key: string) { kv.delete(key); },
    },
  };
  return { env: env as unknown as CredsEnv, db, kv };
}

test("fresh data keys and IVs encrypt identical values differently and authenticate tenant/kind/version", async () => {
  const { env } = fixture();
  const a = await encryptCredential(env, "installation:12:sentry", { clientSecret: secret });
  const b = await encryptCredential(env, "installation:12:sentry", { clientSecret: secret });
  expect(a.iv).not.toBe(b.iv); expect(a.wrapIv).not.toBe(b.wrapIv); expect(a.wrappedKey).not.toBe(b.wrappedKey); expect(a.ciphertext).not.toBe(b.ciphertext);
  expect(JSON.stringify(a)).not.toContain(secret);
  expect(await decryptCredential(env, "installation:12:sentry", a)).toEqual({ clientSecret: secret });
  await expect(decryptCredential(env, "installation:13:sentry", a)).rejects.toThrow("Credential decryption failed");
  await expect(decryptCredential(env, "installation:12:posthog", a)).rejects.toThrow("Credential decryption failed");
  await expect(decryptCredential(env, "installation:12:sentry", { ...a, ciphertext: b.ciphertext })).rejects.toThrow();
  await expect(decryptCredential({ ...env, CRED_MASTER_KEY: btoa("b".repeat(32)) }, "installation:12:sentry", a)).rejects.toThrow();
  await expect(encryptCredential({ CRED_MASTER_KEY: "bad-key" }, "scope", secret)).rejects.toThrow("Credential encryption key unavailable");
});

test("encrypted records isolate installations, repositories and kinds, and never expose keys in status", async () => {
  const { env, db } = fixture();
  await saveCreds(env, "sentry", { clientSecret: secret }, scope);
  expect(await sentryCreds(env, scope)).toEqual({ clientSecret: secret });
  expect(await sentryCreds(env)).toEqual({});
  expect(await sentryCreds(env, { ...scope, installationId: 13 })).toEqual({});
  expect(await sentryCreds(env, { ...scope, repo: "alice/other" })).toEqual({});
  expect(await postHogCreds(env, scope)).toEqual({});
  expect(await credentialStatus(env, "sentry", scope)).toMatchObject({ connected: true, lastUsedAt: null, workerOverride: false });
  await markUsed(env, "sentry", scope);
  expect((await credentialStatus(env, "sentry", scope)).lastUsedAt).toBeGreaterThan(0);
  expect(JSON.stringify(db.sqlite.query("SELECT * FROM credentials").all())).not.toContain(secret);
  expect(JSON.stringify(await credentialStatus(env, "sentry", scope))).not.toContain(secret);
});

test("first owner read migrates plaintext, while unrelated reads cannot claim it", async () => {
  const { env, kv, db } = fixture();
  kv.set("link:sentry", scope.repo); kv.set("cred:sentry", JSON.stringify({ clientSecret: secret }));
  expect(await sentryCreds(env, { ...scope, repo: "bob/other" })).toEqual({});
  expect(kv.has("cred:sentry")).toBe(true);
  expect(await sentryCreds(env, scope)).toEqual({ clientSecret: secret });
  expect(kv.has("cred:sentry")).toBe(false);
  expect(db.sqlite.query("SELECT envelope FROM credentials").get()).toBeTruthy();
  expect(await sentryCreds(env, scope)).toEqual({ clientSecret: secret });
});

test("migration failures preserve plaintext and return no fallback secret", async () => {
  const { env, kv } = fixture();
  env.CRED_MASTER_KEY = undefined; kv.set("link:sentry", scope.repo); kv.set("cred:sentry", JSON.stringify({ clientSecret: secret }));
  await expect(sentryCreds(env, scope)).rejects.toThrow("Credential encryption key unavailable");
  expect(kv.has("cred:sentry")).toBe(true);
});

test("an override usage record does not discard an unmigrated key", async () => {
  const { env, kv } = fixture();
  kv.set("link:sentry", scope.repo); kv.set("cred:sentry", JSON.stringify({ clientSecret: secret }));
  await markUsed(env, "sentry", scope);
  expect(await sentryCreds(env, scope)).toEqual({ clientSecret: secret });
  expect(kv.has("cred:sentry")).toBe(false);
});

test("rotate replaces the credential; revoke erases ciphertext and prevents stale KV resurrection and override fallback", async () => {
  const { env, kv, db } = fixture();
  env.SENTRY_REPO = scope.repo;
  await saveCreds(env, "sentry", { clientSecret: secret }, scope);
  await saveCreds(env, "sentry", { clientSecret: "replacement-secret-value" }, scope);
  expect((await sentryCreds(env, scope)).clientSecret).toBe("replacement-secret-value");
  await revokeCreds(env, "sentry", scope);
  kv.set("cred:sentry", JSON.stringify({ clientSecret: secret })); // simulate a stale KV replica
  env.SENTRY_CLIENT_SECRET = secret;
  expect(await sentryCreds(env, scope)).toEqual({});
  expect((db.sqlite.query("SELECT envelope, revoked FROM credentials").get() as any)).toMatchObject({ envelope: null, revoked: 1 });
  expect(kv.has("cred:sentry")).toBe(false);
  await saveCreds(env, "sentry", { clientSecret: secret }, scope); // explicit reconnect clears the tombstone
  expect((await sentryCreds(env, scope)).clientSecret).toBe(secret);
});

test("Worker-secret override stays within Justin's pinned factory and is revocable without a master key", async () => {
  const { env } = fixture();
  env.SENTRY_REPO = scope.repo; env.SENTRY_CLIENT_SECRET = secret; env.CRED_MASTER_KEY = undefined;
  expect((await sentryCreds(env, scope)).clientSecret).toBe(secret);
  expect(await sentryCreds(env, { ...scope, repo: "bob/shop" })).toEqual({});
  await revokeCreds(env, "sentry", scope);
  expect(await sentryCreds(env, scope)).toEqual({});
});

test("master key rotation lazily re-encrypts with the new version and missing prior keys fail closed", async () => {
  const { env, db } = fixture();
  await saveCreds(env, "sentry", { clientSecret: secret }, scope);
  const old = env.CRED_MASTER_KEY!;
  env.CRED_KEY_VERSION = "2"; env.CRED_MASTER_KEY = btoa("b".repeat(32));
  await expect(sentryCreds(env, scope)).rejects.toThrow("Credential decryption failed");
  env.CRED_PREVIOUS_KEYS = JSON.stringify({ "1": old });
  expect((await sentryCreds(env, scope)).clientSecret).toBe(secret);
  const row = db.sqlite.query("SELECT envelope FROM credentials").get() as { envelope: string };
  expect(JSON.parse(row.envelope).keyVersion).toBe("2");
  env.CRED_PREVIOUS_KEYS = undefined;
  expect((await sentryCreds(env, scope)).clientSecret).toBe(secret);
});

test("redactor removes stored and env secrets from nested logs/errors/state, with encoded and escaped variants", async () => {
  const { env } = fixture();
  const redactor = new Redactor({ SESSION_SECRET: "session-test-value", CRED_MASTER_KEY: env.CRED_MASTER_KEY });
  await saveCreds(env, "sentry", { clientSecret: secret }, scope);
  await sentryCreds(env, scope, redactor);
  const output = JSON.stringify(redactor.value({
    log: `failed ${secret}`, error: new Error(`request ${secret}`),
    state: { title: `issue ${secret}`, reason: "Bearer unknown-token-value", apiKey: "unknown" },
    env: `session-test-value ${env.CRED_MASTER_KEY}`, knownFormat: "phx_another_unknown_test_value",
  }));
  for (const value of [secret, "session-test-value", env.CRED_MASTER_KEY!, "unknown-token-value", "phx_another_unknown_test_value"]) expect(output).not.toContain(value);
  const complex = 'x/y+z?"abcdefghijkl'; redactor.register({ clientSecret: complex });
  expect(redactor.text(`${complex} ${encodeURIComponent(complex)} ${JSON.stringify(complex)}`)).not.toContain("abcdefghijkl");
  expect(() => scopeKey({ ...scope, installationId: 0 })).toThrow();
});

test("a revoke racing first-read migration wins without restoring plaintext", async () => {
  const { env, kv, db } = fixture();
  kv.set("link:sentry", scope.repo); kv.set("cred:sentry", JSON.stringify({ clientSecret: secret }));
  const original = db.prepare.bind(db);
  let injected = false;
  env.DB = { prepare(sql: string) {
    const statement = original(sql);
    if (!sql.startsWith("INSERT OR IGNORE INTO credentials") || injected) return statement;
    const run = statement.run;
    statement.run = async () => {
      injected = true;
      await revokeCreds(env, "sentry", scope);
      return run();
    };
    return statement;
  } } as D1Database;
  expect(await sentryCreds(env, scope)).toEqual({});
  expect(db.sqlite.query("SELECT envelope, revoked FROM credentials").get()).toMatchObject({ envelope: null, revoked: 1 });
  expect(kv.has("cred:sentry")).toBe(false);
});

test("a revoke racing lazy master-key rotation wins its compare-and-swap", async () => {
  const { env, db } = fixture();
  await saveCreds(env, "sentry", { clientSecret: secret }, scope);
  env.CRED_PREVIOUS_KEYS = JSON.stringify({ "1": env.CRED_MASTER_KEY });
  env.CRED_KEY_VERSION = "2"; env.CRED_MASTER_KEY = btoa("b".repeat(32));
  const original = db.prepare.bind(db);
  env.DB = { prepare(sql: string) {
    const statement = original(sql);
    if (!sql.startsWith("UPDATE credentials SET envelope = ? WHERE scope = ? AND kind = ? AND envelope = ?")) return statement;
    const run = statement.run;
    statement.run = async () => { await revokeCreds(env, "sentry", scope); return run(); };
    return statement;
  } } as D1Database;
  await sentryCreds(env, scope); // An already in-flight read can finish; it cannot restore the record.
  expect(db.sqlite.query("SELECT envelope, revoked FROM credentials").get()).toMatchObject({ envelope: null, revoked: 1 });
  expect(await sentryCreds(env, scope)).toEqual({});
});

test("migrates account-era per-repo plaintext independently from another factory's global key", async () => {
  const { env, kv } = fixture();
  kv.set("cred:sentry:alice/shop", JSON.stringify({ clientSecret: secret }));
  kv.set("cred:sentry", JSON.stringify({ clientSecret: "unrelated-operator-secret" }));
  kv.set("link:sentry", "r3dbars/testing");
  expect((await sentryCreds(env, scope)).clientSecret).toBe(secret);
  expect(kv.has("cred:sentry:alice/shop")).toBe(false);
  expect(kv.has("cred:sentry")).toBe(true);
});
