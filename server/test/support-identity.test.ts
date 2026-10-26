import { expect, test } from "bun:test";
import { redactText } from "../src/redact";
import { testD1 } from "./d1-fixture";
import { encryptCredential } from "../src/sources/credential-crypto";
import { isOperatorSupport, saveSupportCreds, supportCredentialKey, supportCreds } from "../src/sources/support";

async function fixture() {
  const DB = testD1();
  await DB.prepare("INSERT INTO installations(id,account_login) VALUES (1,'owner'),(2,'new-owner')").run();
  await DB.prepare("INSERT INTO repos(full_name,installation_id,repo_id) VALUES ('owner/shop',1,101)").run();
  const values = new Map<string, string>();
  const env = {
    DB, CRED_MASTER_KEY: btoa("a".repeat(32)),
    CACHE: {
      get: async (key: string) => values.has(key) ? JSON.parse(values.get(key)!) : null,
      put: async (key: string, value: string) => { values.set(key, value); },
    } as unknown as KVNamespace,
  };
  return { env, values, DB };
}
const secrets = { inboundToken: "synthetic-inbound", intercomToken: "synthetic-destination-token", intercomAdminId: "42" };

test("the same actual repository keeps its encrypted support connection across rename", async () => {
  const { env, DB, values } = await fixture();
  await saveSupportCreds(env, "owner/shop", secrets);
  expect([...values.keys()]).toEqual([supportCredentialKey({ installationId: 1, repoId: 101 })]);
  expect([...values.values()].join()).not.toContain(secrets.intercomToken);
  await DB.prepare("UPDATE repos SET full_name='owner/renamed' WHERE repo_id=101").run();
  expect(await supportCreds(env, "owner/renamed")).toEqual(secrets);
  expect(await supportCreds(env, "owner/shop")).toEqual({});
});

test("a replacement reusing the name cannot inherit a token or transplanted ciphertext", async () => {
  const { env, DB, values } = await fixture();
  await saveSupportCreds(env, "owner/shop", secrets);
  const encrypted = values.get("cred:support:1:101")!;
  await DB.prepare("UPDATE repos SET full_name='owner/retired' WHERE repo_id=101").run();
  await DB.prepare("INSERT INTO repos(full_name,installation_id,repo_id) VALUES ('owner/shop',1,202)").run();
  expect((await supportCreds(env, "owner/shop")).intercomToken).toBeUndefined();
  values.set("cred:support:1:202", encrypted);
  expect((await supportCreds(env, "owner/shop")).inboundToken).toBeUndefined();
  expect((await supportCreds(env, "owner/shop")).intercomToken).toBeUndefined();
  expect(await supportCreds(env, "owner/retired")).toEqual(secrets);
});

test("installation changes isolate stored credentials and operator fallback", async () => {
  const { env, DB, values } = await fixture();
  const operator = { ...env, SUPPORT_REPO: "owner/shop", SUPPORT_REPO_ID: "101", SUPPORT_INSTALLATION_ID: "1", INTERCOM_TOKEN: "synthetic-operator" };
  await saveSupportCreds(env, "owner/shop", secrets);
  expect(await isOperatorSupport(operator, "owner/shop")).toBe(true);
  await DB.prepare("UPDATE repos SET installation_id=2 WHERE repo_id=101").run();
  expect(await isOperatorSupport(operator, "owner/shop")).toBe(false);
  expect((await supportCreds(operator, "owner/shop")).intercomToken).toBeUndefined();
  values.set("cred:support:2:101", values.get("cred:support:1:101")!);
  expect((await supportCreds(env, "owner/shop")).intercomToken).toBeUndefined();
});

test("legacy name-only credentials, absent metadata and revoked installations fail closed", async () => {
  const { env, DB, values } = await fixture();
  values.set("cred:support:owner/shop", JSON.stringify({ envelope: await encryptCredential(env, "support:owner/shop", secrets) }));
  expect((await supportCreds(env, "owner/shop")).intercomToken).toBeUndefined();
  expect(await supportCreds({ ...env, DB: undefined }, "owner/shop")).toEqual({});
  await saveSupportCreds(env, "owner/shop", secrets);
  await DB.prepare("UPDATE installations SET status='suspended' WHERE id=1").run();
  expect(await supportCreds(env, "owner/shop")).toEqual({});
  await expect(saveSupportCreds(env, "owner/shop", secrets)).rejects.toThrow("active repository identity");
  await DB.prepare("UPDATE installations SET status='active' WHERE id=1").run();
  await DB.prepare("UPDATE repos SET archived_at=1 WHERE repo_id=101").run();
  expect(await supportCreds(env, "owner/shop")).toEqual({});
});

test("explicit operator identity survives rename while legacy name-only configuration stays disabled", async () => {
  const { env, DB } = await fixture();
  const operator = { ...env, SUPPORT_REPO: "owner/shop", SUPPORT_REPO_ID: "101", SUPPORT_INSTALLATION_ID: "1", INTERCOM_TOKEN: "synthetic-operator" };
  await DB.prepare("UPDATE repos SET full_name='owner/renamed' WHERE repo_id=101").run();
  expect((await supportCreds(operator, "owner/renamed")).intercomToken).toBe("synthetic-operator");
  expect(await isOperatorSupport({ ...operator, SUPPORT_REPO_ID: undefined }, "owner/renamed")).toBe(false);
});

test("the inbound bearer token in a support URL is scrubbed without relying on Worker env secrets", () => {
  const token = "c".repeat(40);
  const path = `/webhooks/support/owner/shop/${token}`;
  expect(redactText(path)).toBe("/webhooks/support/owner/shop/[REDACTED]");
  expect(redactText(`Failed https://shiptorio.com${path}?retry=1`)).not.toContain(token);
});
