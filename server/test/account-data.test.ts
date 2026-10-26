import { FactoryState } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { describe, expect, it, mock } from "bun:test";
import { testD1, signedInCookie } from "./d1-fixture";
import { deleteAccount, exportAccount, factoryDeleted, ownedRepos } from "../src/account-data";
import { accountPage, legalPage, settingsPage } from "../src/account-pages";
import { createSession, currentUser } from "../src/accounts";
import type { Env } from "../src/index";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
const { default: app } = await import("../src/index");

async function fixture() {
  const DB = testD1();
  const kv = new Map<string, string>([
    ["cred:sentry:alice/app", '{"clientSecret":"DO-NOT-EXPORT"}'],
    ["cred:posthog:alice/app", '{"apiKey":"DO-NOT-EXPORT"}'],
    ["link:sentry", "alice/app"], ["cred:sentry", "legacy-key"],
    ["cred:sentry:bob/app", "bob-secret"], ["unrelated", "keep"],
    ["access:v1:alice:alice/app", "cached-access"],
  ]);
  const objects = new Map<string, { factory: InstanceType<typeof Factory>; data: Map<string, unknown>; alarm: number | null; closed: number }>();
  const env = { DB, SESSION_SECRET: "account-test", DEV_LOGIN: "local", ALLOWED_LOGINS: "alice,bob", CACHE: {
    get: async (key: string, format?: string) => { const value = kv.get(key) ?? null; return value && format === "json" ? JSON.parse(value) : value; },
    put: async (key: string, value: string) => { kv.set(key, value); },
    delete: async (key: string) => { kv.delete(key); },
    list: async ({cursor}: {cursor?: string}) => { const keys = [...kv.keys()].sort(); const offset = Number(cursor ?? 0); return { keys: keys.slice(offset, offset + 2).map(name => ({name})), list_complete: offset + 2 >= keys.length, cursor: String(offset + 2) }; },
  }, FACTORY: { idFromName: (repo: string) => repo, get: (repo: string) => objects.get(repo)!.factory }, ASSETS: {fetch: async () => new Response("app")} } as unknown as Env;
  for (const repo of ["alice/app", "bob/app", "org/shared"]) {
    const record = { data: new Map<string, unknown>([
      ["state", FactoryState.parse({repo, baseBranch: "main", districts: [], ...starterLine(), items: [{id: "gh-1", kind: "bug", source: "github_issue", title: "Fix", district: "/", state: "ore", attempts: 0, updatedAt: 1}], science: {red: 0, green: 0, grey: 0, blue: 0}, trust: 0.5, tick: 0, research: {done: ["types"], spent: 0}})],
      ["meta", {repo, installationId: repo === "alice/app" ? 1 : 2}],
      ["permits", {lanes: {docs: {allowed: true}}}], ["runnerPair", "pair-secret"],
      ["runnerJob:1", {lease: "DO-NOT-EXPORT", token: "DO-NOT-EXPORT"}],
      ["approvalEvents", [{kind: "test", scope: "/", at: 1, actionId: "approval-1"}]], ["delivery:1", {payload: "private-event"}],
      ["schemaVersion", 2], ["backup:old", {items: ["private"]}],
    ]), alarm: 10 as number | null, closed: 0, factory: null as unknown as InstanceType<typeof Factory> };
    const storage = {
      get: async (key: string) => structuredClone(record.data.get(key)),
      put: async (key: string, value: unknown) => { record.data.set(key, value); },
      list: async () => new Map(record.data),
      deleteAlarm: async () => { record.alarm = null; },
      deleteAll: async () => { record.data.clear(); },
    };
    const ctx = { storage, blockConcurrencyWhile: <T>(f: () => Promise<T>) => f(), getWebSockets: () => [{close: () => {record.closed++;}, deserializeAttachment: () => ({login: "alice"})}] };
    record.factory = new Factory(ctx as never, env);
    objects.set(repo, record);
  }
  const aliceCookie = await signedInCookie(env, "alice", ["alice/app", "org/shared"], 11);
  const aliceSecond = (await createSession(env, {id: 11, login: "alice"}, "other-browser")).split(";")[0];
  const bobCookie = await signedInCookie(env, "bob", ["bob/app", "alice/app"], 22);
  await DB.prepare("INSERT INTO installations (id, account_login) VALUES (1, 'alice'), (2, 'bob'), (3, 'org')").run();
  await DB.prepare("INSERT INTO repos (full_name, installation_id) VALUES ('alice/app', 1), ('bob/app', 2), ('org/shared', 3)").run();
  await DB.prepare("INSERT INTO user_installations (user_id, installation_id, account_login) VALUES (11, 1, 'alice'), (11, 3, 'org'), (22, 2, 'bob')").run();
  await DB.prepare("INSERT INTO pull_requests (repo, number, title, state) VALUES ('alice/app', 1, 'Fix', 'open'), ('bob/app', 2, 'Other', 'open')").run();
  await DB.prepare("INSERT INTO move_kind_rules VALUES ('alice/app', 'test', '/', 'id', 1)").run();
  await DB.prepare("INSERT INTO user_prefs VALUES (11, 'intro', 'done', 1)").run();
  return {env, kv, objects, aliceCookie, aliceSecond, bobCookie, user: {id: 11, login: "alice"}};
}

describe("account data controls", () => {
  it("exports visible factory items, permits, research and saved logs, without raw runner jobs/credentials", async () => {
    const {env, user} = await fixture();
    const result = await exportAccount(env, user);
    expect(result.factories.map(r => r.repo)).toEqual(["alice/app", "org/shared"]);
    expect(result.factories[0].data.permits).toBeTruthy();
    expect(result.factories[0].data.research).toEqual({done: ["types"], spent: 0});
    expect(result.factories[0].data.logs.approvals).toEqual([{kind: "test", scope: "/", at: 1, actionId: "approval-1"}]);
    expect(JSON.stringify(result)).not.toContain("DO-NOT-EXPORT");
    expect(JSON.stringify(result)).not.toContain("pair-secret");
  });
  it("purges installation-scoped encrypted credentials and attributed webhook receipts", async () => {
    const {env, user} = await fixture();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS credentials (scope TEXT NOT NULL, kind TEXT NOT NULL, envelope TEXT, revoked INTEGER NOT NULL DEFAULT 0, linked INTEGER NOT NULL DEFAULT 0, updated_by TEXT, updated_at INTEGER NOT NULL, last_used_at INTEGER, PRIMARY KEY(scope, kind))").run();
    await env.DB.prepare("INSERT INTO credentials (scope, kind, envelope, updated_by, updated_at) VALUES ('installation:1:repo:alice/app', 'sentry', 'encrypted-alice', 'alice', 1), ('installation:2:repo:bob/app', 'sentry', 'encrypted-bob', 'bob', 1)").run();
    await env.DB.prepare("INSERT INTO webhook_deliveries (source, delivery_id, received_at, expires_at, repo) VALUES ('github', 'alice-delivery', 1, 2, 'alice/app'), ('github', 'bob-delivery', 1, 2, 'bob/app')").run();
    await deleteAccount(env, user, ["alice/app"]);
    expect((await env.DB.prepare("SELECT envelope FROM credentials").all()).results).toEqual([{envelope: "encrypted-bob"}]);
    expect((await env.DB.prepare("SELECT delivery_id FROM webhook_deliveries").all()).results).toEqual([{delivery_id: "bob-delivery"}]);
  });
  it("can retry a failed KV purge without reporting deletion complete early", async () => {
    const {env, user, kv, objects} = await fixture();
    const original = env.CACHE.delete.bind(env.CACHE);
    let fail = true;
    env.CACHE.delete = (async (key: string) => { if (fail) throw new Error("KV temporarily unavailable"); await original(key); }) as typeof env.CACHE.delete;
    await expect(deleteAccount(env, user, ["alice/app"])).rejects.toThrow("unavailable");
    expect(await factoryDeleted(env.DB, "alice/app")).toBe(true);
    expect(objects.get("alice/app")!.data.size).toBe(0);
    expect((await env.DB.prepare("SELECT * FROM account_deletion_receipts").all()).results).toHaveLength(0);
    expect(await env.DB.prepare("SELECT * FROM users WHERE id = 11").first()).not.toBeNull();
    fail = false;
    expect((await deleteAccount(env, user, ["alice/app"])).deleted).toBe(true);
    expect(kv.has("cred:sentry:alice/app")).toBe(false);
  });
  it("requires exact names and never treats collaborator access as ownership", async () => {
    const {env, user, objects} = await fixture();
    expect((await ownedRepos(env, user)).map(r => r.full_name)).toEqual(["alice/app"]);
    await expect(deleteAccount(env, user, ["org/shared"])).rejects.toThrow("exactly");
    await expect(deleteAccount(env, user, ["Alice/app"])).rejects.toThrow("exactly");
    expect(objects.get("alice/app")!.data.size).toBeGreaterThan(0);
    expect(await factoryDeleted(env.DB, "alice/app")).toBe(false);
  });
  it("erases all owned DO keys, alarms, D1 records and paginated KV keys, revokes every session, preserves other owners", async () => {
    const {env, user, objects, kv, aliceCookie, aliceSecond, bobCookie} = await fixture();
    const result = await deleteAccount(env, user, ["alice/app"]);
    expect(result.archive.factories[0].data.state?.items).toHaveLength(1);
    for (const table of ["users", "sessions", "user_prefs", "user_repos", "user_installations"]) {
      const column = table === "users" ? "id" : "user_id";
      expect((await env.DB.prepare(`SELECT * FROM ${table} WHERE ${column} = 11`).all()).results).toEqual([]);
    }
    for (const table of ["pull_requests", "move_kind_rules", "user_repos"]) expect((await env.DB.prepare(`SELECT * FROM ${table} WHERE repo = 'alice/app'`).all()).results).toEqual([]);
    expect(await env.DB.prepare("SELECT * FROM repos WHERE full_name = 'alice/app'").first()).toBeNull();
    expect(await env.DB.prepare("SELECT * FROM installations WHERE id = 1").first()).toBeNull();
    expect(objects.get("alice/app")!.data.size).toBe(0);
    expect(objects.get("alice/app")!.alarm).toBeNull();
    expect(objects.get("alice/app")!.closed).toBeGreaterThan(0);
    expect([...kv.keys()].sort()).toEqual(["cred:sentry:bob/app", "unrelated"]);
    expect(await currentUser(env, aliceCookie)).toBeNull();
    expect(await currentUser(env, aliceSecond)).toBeNull();
    expect(await currentUser(env, bobCookie)).toEqual({id: 22, login: "bob"});
    expect(objects.get("bob/app")!.data.size).toBeGreaterThan(0);
    expect(objects.get("org/shared")!.data.size).toBeGreaterThan(0);
    expect(await factoryDeleted(env.DB, "alice/app")).toBe(true);
    await expect(objects.get("alice/app")!.factory.ensure("alice/app", 1)).rejects.toThrow("deleted");
    const receipts = (await env.DB.prepare("SELECT * FROM account_deletion_receipts").all()).results;
    expect(receipts).toHaveLength(1);
    expect(JSON.stringify(receipts)).not.toContain("alice");
  });
  it("rejects foreign origins, missing auth and wrong confirmations before destructive work", async () => {
    const {env, aliceCookie, objects} = await fixture();
    const send = (cookie: string, origin: string, body: string) => app.fetch(new Request("http://localhost/api/account/delete", {method: "POST", headers: {cookie, origin}, body}), {...env, DEV_LOGIN: undefined, APP_PASSWORD: "test"} as Env);
    // Direct controller tests exercise storage; route tests use preview cookie independently below.
    expect((await send("", "https://evil.example", "confirm=delete&repo=alice/app")).status).toBe(401);
    expect(objects.get("alice/app")!.data.size).toBeGreaterThan(0);
    const real = {...env, DEV_LOGIN: undefined, APP_PASSWORD: "preview"};
    const {makeSessionCookie} = await import("../src/session");
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:preview`, "preview")).split(";")[0].replace("shiptorio_session", "shiptorio_access");
    const request = (path: string, origin: string, body: string) => app.fetch(new Request(`https://shiptorio.com${path}`, {method: "POST", headers: {cookie: `${aliceCookie}; ${preview}`, origin}, body}), real);
    expect((await request("/api/account/delete", "https://evil.example", "confirm=delete&repo=alice/app")).status).toBe(403);
    expect((await request("/api/account/delete", "https://shiptorio.com", "confirm=delete&repo=bob/app")).status).toBe(400);
    expect(objects.get("alice/app")!.data.size).toBeGreaterThan(0);
    const res = await request("/api/account/delete", "https://shiptorio.com", "confirm=delete&repo=alice/app");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("archive.json");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("signs out all browsers and closes that user's sockets without deleting factories", async () => {
    const {env, aliceCookie, aliceSecond, objects} = await fixture();
    const {makeSessionCookie} = await import("../src/session");
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:preview`, "preview")).split(";")[0].replace("shiptorio_session", "shiptorio_access");
    const real = await app.fetch(new Request("https://shiptorio.com/api/account/signout", {method: "POST", headers: {cookie: `${aliceCookie}; ${preview}`, origin: "https://shiptorio.com"}}), {...env, DEV_LOGIN: undefined, APP_PASSWORD: "preview"});
    expect(real.status).toBe(302);
    expect(await currentUser(env, aliceSecond)).toBeNull();
    expect(objects.get("alice/app")!.closed).toBeGreaterThan(0);
    expect(objects.get("alice/app")!.data.size).toBeGreaterThan(0);
  });
  it("rejects a queued websocket action and upgrade after its server session is revoked", async () => {
    const {env, aliceCookie} = await fixture();
    const {browserSocketAuth, browserSessionActive} = await import("../src/browser-socket");
    const {makeSessionCookie} = await import("../src/session");
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:preview`, "preview")).split(";")[0].replace("shiptorio_session", "shiptorio_access");
    const socketEnv = {...env, APP_PASSWORD: "preview"};
    const request = new Request("https://shiptorio.com/api/repos/alice/app/factory", {headers: {cookie: `${aliceCookie}; ${preview}`}});
    const auth = await browserSocketAuth(request, socketEnv);
    expect(auth?.sessionHash).toBeTruthy();
    expect(await browserSessionActive(auth!, socketEnv)).toBe(true);
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = 11").run();
    expect(await browserSessionActive(auth!, socketEnv)).toBe(false);
    expect(await browserSocketAuth(request, socketEnv)).toBeNull();
  });
  it("serves readable draft legal pages publicly even with the private preview gate", async () => {
    const {env} = await fixture();
    for (const path of ["privacy", "terms"]) {
      const response = await app.fetch(new Request(`https://shiptorio.com/${path}`), {...env, DEV_LOGIN: undefined, APP_PASSWORD: "private"});
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("DRAFT");
      for (const name of ["GitHub", "Sentry", "PostHog", "Meta"]) expect(html).toContain(name);
    }
    expect(accountPage("<script>", "body")).not.toContain("<title><script>");
    expect(legalPage("privacy")).toContain("/settings");
    expect(settingsPage({id: 1, login: '<img src=x>'}, [], [], [])).not.toContain('<img src=x>');
  });
});
