import { requireUser as resolveUser } from "../src/authorization";
import { securityObjectName } from "../src/rate-limit";
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
    get: async (key: string | string[], format?: string) => {
      const read = (key: string) => { const value = kv.get(key) ?? null; return value && format === "json" ? JSON.parse(value) : value; };
      return Array.isArray(key) ? new Map(key.filter(k => kv.has(k)).map(k => [k, read(k)])) : read(key);
    },
    put: async (key: string, value: string) => { kv.set(key, value); },
    delete: async (key: string) => { kv.delete(key); },
    list: async ({cursor, prefix}: {cursor?: string; prefix?: string}) => { const keys = [...kv.keys()].filter(key => !prefix || key.startsWith(prefix)).sort(); const offset = Number(cursor ?? 0); return { keys: keys.slice(offset, offset + 2).map(name => ({name})), list_complete: offset + 2 >= keys.length, cursor: String(offset + 2) }; },
  }, FACTORY: { idFromName: (repo: string) => repo, get: (repo: string) => objects.get(repo)!.factory }, ASSETS: {fetch: async () => new Response("app")} } as unknown as Env;
  for (const repo of ["alice/app", "bob/app", "org/shared", "github-installations", await securityObjectName("user:11"), await securityObjectName("user:alice")]) {
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
      delete: async (key: string) => record.data.delete(key),
    };
    const ctx = { id: {toString: () => repo}, storage, blockConcurrencyWhile: <T>(f: () => Promise<T>) => f(), getWebSockets: () => [{close: () => {record.closed++;}, deserializeAttachment: () => ({login: "alice"})}] };
    record.factory = new Factory(ctx as never, env);
    objects.set(repo, record);
  }
  const aliceCookie = await signedInCookie(env, "alice", ["alice/app", "org/shared"], 11);
  const aliceSecond = (await createSession(env, {id: 11, login: "alice"}, "other-browser")).split(";")[0];
  const bobCookie = await signedInCookie(env, "bob", ["bob/app", "alice/app"], 22);
  await DB.prepare("INSERT OR REPLACE INTO installations (id, account_login) VALUES (1, 'alice'), (2, 'bob'), (3, 'org')").run();
  await DB.prepare("INSERT OR REPLACE INTO repos (full_name, installation_id) VALUES ('alice/app', 1), ('bob/app', 2), ('org/shared', 3)").run();
  await DB.prepare("INSERT OR REPLACE INTO user_installations (user_id, installation_id, account_login) VALUES (11, 1, 'alice'), (11, 3, 'org'), (22, 2, 'bob')").run();
  await DB.prepare("INSERT INTO pull_requests (repo, number, title, state) VALUES ('alice/app', 1, 'Fix', 'open'), ('bob/app', 2, 'Other', 'open')").run();
  await DB.prepare("INSERT INTO move_kind_rules VALUES ('alice/app', 'test', '/', 'id', 1)").run();
  await DB.prepare("INSERT INTO user_prefs VALUES (11, 'intro', 'done', 1)").run();
  await DB.prepare("UPDATE user_repos SET installation_id = 3 WHERE repo = 'org/shared'").run();
  await DB.prepare("UPDATE user_repos SET installation_id = 2 WHERE repo = 'bob/app'").run();
  for (const [installation, repo, uid] of [[1, "alice/app", 11], [3, "org/shared", 11], [2, "bob/app", 22], [1, "alice/app", 22]]) kv.set(`access:v2:${installation}:${repo}:${uid}`, JSON.stringify({expiresAt: Date.now() + 59000}));
  const user = await resolveUser(new Request("https://shiptorio.com", {headers: {cookie: aliceCookie}}), env);
  return {env, kv, objects, aliceCookie, aliceSecond, bobCookie, user: user!};
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
  it("exports and erases every chunk of a large factory", async () => {
    const {env, user, objects} = await fixture();
    const data = objects.get("alice/app")!.data;
    const state = data.get("state") as FactoryState;
    const body = "long issue context ".repeat(12000);
    state.items[0].body = body;
    const json = JSON.stringify({...state, schemaVersion: 2});
    const parts = json.match(/[\s\S]{1,16000}/g)!;
    data.set("state", {format: "shiptorio-state-chunks", chunks: parts.length, bytes: new TextEncoder().encode(json).byteLength, schemaVersion: 2});
    parts.forEach((part, i) => data.set(`stateChunk:${String(i).padStart(6, "0")}`, part));
    expect((await exportAccount(env, user)).factories[0].data.state?.items[0].body).toBe(body);
    await deleteAccount(env, user, ["alice/app"]);
    expect(data.size).toBe(0);
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
  it("a credential save racing deletion cannot recreate the encrypted envelope", async () => {
    const {env} = await fixture();
    await env.DB.prepare("UPDATE repos SET repo_id = 101 WHERE full_name = 'alice/app'").run();
    const {saveCreds, sentryCreds} = await import("../src/sources/creds");
    const {repoHash} = await import("../src/account-lifecycle");
    const originalDB = env.DB;
    const hash = await repoHash("alice/app");
    const racingDB = new Proxy(originalDB, {get(target, key) {
      if (key !== "prepare") return Reflect.get(target, key);
      return (sql: string) => {
        const statement = target.prepare(sql);
        if (!sql.startsWith("INSERT INTO credentials")) return statement;
        return {bind(...args: unknown[]) {
          const bound = statement.bind(...args);
          return {run: async () => {
            await originalDB.prepare("INSERT OR IGNORE INTO deleted_factories (repo_hash, deleted_at) VALUES (?, 1)").bind(hash).run();
            return bound.run();
          }};
        }};
      };
    }});
    const credsEnv = {...env, DB: racingDB, CRED_MASTER_KEY: btoa("x".repeat(32)), SENTRY_REPO: "alice/app", SENTRY_CLIENT_SECRET: "operator-secret"};
    await expect(saveCreds(credsEnv, "sentry", {clientSecret: "user-secret"}, {repo: "alice/app", installationId: 1})).rejects.toThrow("Factory deleted");
    expect((await originalDB.prepare("SELECT * FROM credentials WHERE scope = 'installation:1:repo-id:101'").all()).results).toEqual([]);
    expect(await sentryCreds(credsEnv, {repo: "alice/app", installationId: 1})).toEqual({});
  });
  it("exports and purges both repo and global operational log copies, preserving other users", async () => {
    const {env, user, kv} = await fixture();
    kv.set("ops:events:all:alice", JSON.stringify({userId: "alice", repo: "org/shared", event: "saved"}));
    kv.set("ops:events:repo:alice/app:copy", JSON.stringify({repo: "alice/app", event: "saved"}));
    kv.set("ops:events:all:bob", JSON.stringify({userId: "bob", repo: "bob/app", event: "keep"}));
    const archive = await exportAccount(env, user);
    expect(archive.activity.some(e => e.event === "saved")).toBe(true);
    expect(archive.activity.some(e => e.event === "keep")).toBe(false);
    await deleteAccount(env, user, ["alice/app"]);
    expect(kv.has("ops:events:all:alice")).toBe(false);
    expect(kv.has("ops:events:repo:alice/app:copy")).toBe(false);
    expect(kv.has("ops:events:all:bob")).toBe(true);
  });
  it("an in-flight operational log cannot recreate user keys after deletion", async () => {
    const {env, user, kv} = await fixture();
    const {inTrace, log} = await import("../src/telemetry");
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => {release = resolve;});
    const writing = new Promise<void>(resolve => {started = resolve;});
    const original = env.CACHE.put.bind(env.CACHE);
    env.CACHE.put = (async (key: string, value: string) => { if (key.startsWith("ops:")) {started(); await gate;} return original(key, value); }) as typeof env.CACHE.put;
    const tasks: Promise<unknown>[] = [];
    inTrace({requestId: "delete-race", userId: "alice", repo: "alice/app"}, env, task => tasks.push(task), () => log("info", "delayed_event"));
    await writing;
    await deleteAccount(env, user, ["alice/app"]);
    release();
    await Promise.all(tasks);
    expect([...kv.keys()].some(key => key.startsWith("ops:"))).toBe(false);
  });
  it("removes signup, progress, budget and API-limit ledgers without removing another account's approval", async () => {
    const {env, user} = await fixture();
    for (const sql of [
      "INSERT INTO user_progress VALUES (11, '{\"level\":3}', 1)",
      "INSERT INTO signup_allowlist (login, approved_by, updated_at) VALUES ('alice', 'admin', 1), ('bob', 'alice', 1)",
      "INSERT INTO signup_waitlist (identity, kind, created_at, updated_at) VALUES ('alice', 'github', 1, 1)",
      "INSERT INTO signup_invites (digest, expires_at, created_by) VALUES ('test-invite', 2, 'alice')",
      "INSERT INTO signup_resources VALUES ('alice', 'factory', 'alice/app')",
      "INSERT INTO signup_counters VALUES ('runs:alice', 1, 1, 2)",
      "INSERT INTO signup_abuse (scope, reason, updated_at) VALUES ('install:alice', 'test', 1)",
      "INSERT INTO spark_usage (account, day) VALUES ('user:11', '2026-10-26')",
      "INSERT INTO spark_factory_budgets VALUES ('alice/app', 5000000000)",
      "INSERT INTO spark_factory_calls (id, repo, day, model, nano_usd) VALUES ('call-1', 'alice/app', '2026-10-26', 'muse-spark-1.3', 100)",
      "INSERT INTO factory_budget_owners VALUES ('alice/app', 11)",
      "INSERT INTO api_limits (scope) VALUES ('github:installation:1')",
    ]) await env.DB.prepare(sql).run();
    expect((await exportAccount(env, user)).progress).not.toBeNull();
    await deleteAccount(env, user, ["alice/app"]);
    for (const table of ["user_progress", "signup_waitlist", "signup_invites", "signup_resources", "signup_counters", "signup_abuse", "spark_usage", "spark_factory_calls", "spark_factory_budgets", "factory_budget_owners", "api_limits"]) expect((await env.DB.prepare(`SELECT * FROM ${table}`).all()).results).toEqual([]);
    expect((await env.DB.prepare("SELECT login, approved_by FROM signup_allowlist ORDER BY login").all()).results).toEqual([{login: "bob", approved_by: "[deleted account]"}, {login: "r3dbars", approved_by: "r3dbars"}]);
  });
  it("exports the stable repo-id factory and erases both it and its frozen legacy object", async () => {
    const {env, user, objects} = await fixture();
    const columns = await env.DB.prepare("PRAGMA table_info(repos)").all<{name: string}>();
    if (!columns.results.some(c => c.name === "repo_id")) await env.DB.prepare("ALTER TABLE repos ADD COLUMN repo_id INTEGER").run();
    await env.DB.prepare("UPDATE repos SET repo_id = 101, archived_at = 1 WHERE full_name = 'alice/app'").run();
    await env.DB.prepare("INSERT INTO pull_requests (repo, number, title, state) VALUES ('repo:101', 77, 'Archived', 'closed')").run();
    await env.DB.prepare("INSERT INTO credentials (scope, kind, envelope, updated_at) VALUES ('archived:repo:101:installation:1:repo:alice/old-name', 'sentry', 'encrypted-archived', 1), ('installation:1:repo-id:101', 'posthog', 'encrypted-stable', 1)").run();
    await env.DB.prepare("DELETE FROM user_repos WHERE repo = 'alice/app'").run();
    const kv = (env.CACHE as unknown as {get(key: string): Promise<string|null>});
    await env.CACHE.put("cred:support:1:101", "encrypted-support-key");
    const legacy = objects.get("alice/app")!;
    const data = new Map(legacy.data);
    legacy.data.clear(); legacy.data.set("migratedTo", "repo:101");
    let alarm: number | null = 10;
    const storage = {get: async (key: string) => structuredClone(data.get(key)), deleteAll: async () => {data.clear();}, deleteAlarm: async () => {alarm = null;}};
    const factory = new Factory({storage, getWebSockets: () => [], blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn()} as never, env);
    objects.set("repo:101", {factory, data, alarm, closed: 0});
    expect((await exportAccount(env, user)).factories[0].data.state?.items).toHaveLength(1);
    await deleteAccount(env, user, ["alice/app"]);
    expect(data.size).toBe(0); expect(legacy.data.size).toBe(0); expect(alarm).toBeNull();
    expect(await kv.get("cred:support:1:101")).toBeNull();
    expect((await env.DB.prepare("SELECT * FROM pull_requests WHERE repo = 'repo:101'").all()).results).toEqual([]);
    expect((await env.DB.prepare("SELECT * FROM credentials WHERE scope GLOB 'archived:repo:101:*' OR scope = 'installation:1:repo-id:101'").all()).results).toEqual([]);
  });
  it("a cold factory cannot revive after erasure even without saved repo metadata", async () => {
    const {env, user} = await fixture();
    await deleteAccount(env, user, ["alice/app"]);
    const data = new Map<string, unknown>();
    const storage = {get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => {data.set(key, value);}, list: async () => new Map(data), getAlarm: async () => null, setAlarm: async () => {throw new Error("Deleted factory scheduled an alarm");}};
    const fresh = new Factory({id: {toString: () => "alice/app"}, storage, getWebSockets: () => []} as never, env);
    await fresh.alarm();
    expect(data.size).toBe(0);
    await expect(fresh.pairRunner()).rejects.toThrow("Factory deleted");
    expect(data.size).toBe(0);
  });
  it("purges only this account's coordinator payloads and blocks a delayed installation replay", async () => {
    const {env, user, objects, kv} = await fixture();
    const shared = objects.get("github-installations")!.data;
    shared.set("delivery:alice", {payload: {installation: {id: 1}, sender: {id: 11}}});
    shared.set("failed:delivery:alice", {payload: {installation: {id: 1}}});
    shared.set("delivery:bob", {payload: {installation: {id: 2}, sender: {id: 22}}});
    kv.set("cred:support:alice/app", "encrypted-support-key");
    await env.DB.prepare("INSERT INTO webhook_deliveries (source, delivery_id, received_at, expires_at, installation_id) VALUES ('github', 'install-alice', 1, 2, 1), ('github', 'install-bob', 1, 2, 2)").run();
    await deleteAccount(env, user, ["alice/app"]);
    expect(shared.has("delivery:alice")).toBe(false); expect(shared.has("failed:delivery:alice")).toBe(false); expect(shared.has("delivery:bob")).toBe(true);
    expect(kv.has("cred:support:alice/app")).toBe(false);
    expect((await env.DB.prepare("SELECT delivery_id FROM webhook_deliveries").all()).results).toEqual([{delivery_id: "install-bob"}]);
    const {handleLifecycle} = await import("../src/github-lifecycle");
    await handleLifecycle(env, "installation", {action: "created", installation: {id: 1, account: {login: "alice"}}, repositories: [{id: 101, full_name: "alice/app"}]});
    expect(await env.DB.prepare("SELECT * FROM installations WHERE id = 1").first()).toBeNull();
    expect(await env.DB.prepare("SELECT * FROM repos WHERE full_name = 'alice/app'").first()).toBeNull();
  });
  it("a support credential save racing deletion removes its identity-scoped KV key", async () => {
    const {env, kv} = await fixture();
    const {saveSupportCreds, supportCreds} = await import("../src/sources/support");
    const {repoHash} = await import("../src/account-lifecycle");
    await env.DB.prepare("UPDATE repos SET repo_id = 101 WHERE full_name = 'alice/app'").run();
    const original = env.CACHE.put.bind(env.CACHE);
    const hash = await repoHash("alice/app");
    env.CACHE.put = (async (key: string, value: string) => {
      if (key === "cred:support:1:101") await env.DB.prepare("INSERT OR IGNORE INTO deleted_factories (repo_hash, deleted_at) VALUES (?, 1)").bind(hash).run();
      return original(key, value);
    }) as typeof env.CACHE.put;
    const source = {...env, CRED_MASTER_KEY: btoa("x".repeat(32))};
    await expect(saveSupportCreds(source, "alice/app", {intercomToken: "private-test-token"})).rejects.toThrow("Factory deleted");
    expect(kv.has("cred:support:1:101")).toBe(false);
    expect(await supportCreds(source, "alice/app")).toEqual({});
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
    expect(objects.get(await securityObjectName("user:11"))!.data.size).toBe(0);
    expect(objects.get("alice/app")!.closed).toBeGreaterThan(0);
    expect([...kv.keys()].sort()).toEqual(["access:v2:2:bob/app:22", "cred:sentry:bob/app", "unrelated"]);
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
  it("rejects a queued socket action and upgrade after its server session is revoked", async () => {
    const {env, aliceCookie, user} = await fixture();
    const {repoAccess, requireUser} = await import("../src/authorization");
    const request = new Request("https://shiptorio.com/api/repos/alice/app/factory", {headers: {cookie: aliceCookie}});
    expect(await repoAccess(env, user, "alice/app")).toBe(1);
    expect(await requireUser(request, env)).not.toBeNull();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = 11").run();
    expect(await repoAccess(env, user, "alice/app")).toBeNull();
    expect(await requireUser(request, env)).toBeNull();
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
    expect(accountPage("Account", "body")).toContain('name="referrer" content="same-origin"');
    expect(accountPage("<script>", "body")).not.toContain("<title><script>");
    expect(legalPage("privacy")).toContain("/settings");
    expect(settingsPage({id: 1, login: '<img src=x>'}, [], [], [])).not.toContain('<img src=x>');
  });
});
