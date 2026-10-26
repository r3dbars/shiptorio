import { membershipCache } from "./browser-fixture";
import { expect, mock, test } from "bun:test";
import { unlimitedFactory } from "./browser-fixture";
import { connectPage } from "../src/connect";
import { makeSessionCookie } from "../src/session";
import { readConfig } from "../../web/src/source";
import { signedInCookie, testD1 } from "./d1-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { default: app } = await import("../src/index");
const backUrl = (html: string) => new URL(html.match(/href="([^"]+)">Back to the factory/)![1].replaceAll("&#38;", "&"), "https://shiptorio.com");

test("saving either source returns the signed-in player to the actual live repo", async () => {
  const secret = "connect-session", password = "connect-preview";
  const DB = testD1();
  await DB.prepare("INSERT INTO repos (full_name, installation_id) VALUES (?, ?)").bind("example/shop", 1).run();
  const cookie = [await signedInCookie({ DB, SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars" }, "r3dbars", ["example/shop"]), (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")].join("; ");
  for (const kind of ["sentry", "posthog"] as const) {
    const writes: string[] = [], connections: string[] = [];
    const env = { DB, CRED_MASTER_KEY: btoa("a".repeat(32)), SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "r3dbars", CACHE: { get: membershipCache.get, delete: async () => {}, put: async (key: string) => { writes.push(key); } }, FACTORY: { idFromName: (repo: string) => repo, get: (repo: string) => ({ ensure: async () => {}, disconnectMine: async () => {}, securityLimit: async () => ({ allowed: true, retryAfter: 0 }), connectMine: async (mine: string) => { connections.push(`${repo}:${mine}`); } }) } };
    const form: Record<string, string> = kind === "sentry" ? { clientSecret: "sample_test_secret_only" } : { apiKey: "phx_sample_test_key_only", projectId: "123" };
    const response = await app.fetch(new Request(`https://shiptorio.com/connect/${kind}?repo=Example%2FShop`, { method: "POST", headers: { cookie, origin: "https://shiptorio.com" }, body: new URLSearchParams(form) }), env as never);
    expect(response.status).toBe(200);
    const destination = backUrl(await response.text());
    expect(readConfig(destination.search)).toMatchObject({ kind: "live", repo: "example/shop" });
    expect(writes).toEqual([]);
    expect(connections).toEqual([`example/shop:${kind}`]);
  }
});

test("a player can't set keys for a repo they can't reach", async () => {
  const secret = "connect-session", password = "connect-preview", DB = testD1();
  await DB.prepare("INSERT INTO repos (full_name, installation_id) VALUES (?, ?)").bind("example/shop", 1).run();
  const cookie = [await signedInCookie({ DB, SESSION_SECRET: secret, ALLOWED_LOGINS: "*" }, "stranger", ["stranger/app"]), (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")].join("; ");
  const writes: string[] = [];
  const env = { DB, CRED_MASTER_KEY: btoa("a".repeat(32)), SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "*", FACTORY: unlimitedFactory, CACHE: { get: membershipCache.get, delete: async () => {}, put: async (key: string) => { writes.push(key); } } };
  const response = await app.fetch(new Request("https://shiptorio.com/connect/sentry?repo=example/shop", { method: "POST", headers: { cookie, origin: "https://shiptorio.com" }, body: new URLSearchParams({ clientSecret: "sample_test_secret_only" }) }), env as never);
  expect(response.status).toBe(403);
  expect(writes).toEqual([]);
});

test("source success pages without a valid target return home without labeling a simulator as that repo", () => {
  for (const repo of [null, "", "owner", "https://elsewhere.example/owner/repo", "owner/repo?source=sim"]) {
    const destination = backUrl(connectPage({ kind: "sentry", repo, connected: true, saved: true, webhookUrl: "" }));
    expect(destination.pathname + destination.search).toBe("/");
  }
});

test("connection page rotates, reports use and revokes without decrypting or exposing keys", async () => {
  const { sentryCreds, markUsed } = await import("../src/sources/creds");
  const DB = testD1(), secret = "connect-session", password = "connect-preview";
  await DB.prepare("INSERT INTO repos (full_name, installation_id) VALUES (?, ?)").bind("example/shop", 1).run();
  const env = { DB, CRED_MASTER_KEY: btoa("a".repeat(32)), SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "*", CACHE: { ...membershipCache, delete: async () => {} } as unknown as KVNamespace, FACTORY: { idFromName: (repo: string) => repo, get: () => ({ securityLimit: async () => ({ allowed: true, retryAfter: 0 }), ensure: async () => {}, connectMine: async () => {}, disconnectMine: async () => {} }) } };
  const cookie = [await signedInCookie(env, "owner", ["example/shop"]), (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")].join("; ");
  const url = "https://shiptorio.com/connect/sentry?repo=example/shop";
  const send = (data?: Record<string, string>, origin = "https://shiptorio.com") => app.fetch(new Request(url, { method: data ? "POST" : "GET", headers: { cookie, origin }, ...(data ? { body: new URLSearchParams(data) } : {}) }), env as never);
  const old = "initial-secret-test-123456", replacement = "replacement-secret-test-987654";
  expect((await send({ clientSecret: old })).status).toBe(200);
  const scope = { installationId: 1, repo: "example/shop" };
  await markUsed(env, "sentry", scope);
  let html = await (await send()).text();
  expect(html).toContain("Last used:"); expect(html).toContain("Revoke"); expect(html).toContain("Rotate key");
  expect(html).not.toContain(old);
  expect((await send({ clientSecret: replacement })).status).toBe(200);
  expect((await sentryCreds(env, scope)).clientSecret).toBe(replacement);
  expect((await send({ action: "revoke" }, "https://attacker.example")).status).toBe(403);
  expect((await sentryCreds(env, scope)).clientSecret).toBe(replacement);
  env.CRED_MASTER_KEY = "unavailable"; // Revocation must not require successful decryption.
  const response = await send({ action: "revoke" });
  expect(response.status).toBe(200);
  html = await response.text(); expect(html).toContain("Connection revoked");
  expect(html).not.toContain(old); expect(html).not.toContain(replacement);
  expect(await sentryCreds(env, scope)).toEqual({});
});
