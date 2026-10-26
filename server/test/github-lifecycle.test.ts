import { describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { FactoryState } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { handleLifecycle, permissionStatus, RETENTION_MS } from "../src/github-lifecycle";
import { migrateRepository, repositoryFactory, type RepoRecord } from "../src/repository";
import { authorizationRevoked, makeSessionCookie, readSessionDetails } from "../src/session";
import payload from "./fixtures/github/lifecycle.json";
import { browserEnv } from "./browser-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { Factory } = await import("../src/factory");

function fixture() {
  const sqlite = new Database(":memory:");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  const DB = {
    prepare(sql: string) {
      let args: any[] = [];
      const statement = { bind(...values: any[]) { args = values; return statement; },
        async first() { return sqlite.query(sql).get(...args); },
        async all() { return { results: sqlite.query(sql).all(...args) }; },
        async run() { return { meta: sqlite.query(sql).run(...args) }; } };
      return statement;
    },
    async batch(statements: any[]) { return Promise.all(statements.map(s => s.run())); },
  };
  const objects = new Map<string, ReturnType<typeof create>>();
  const env: any = { ...browserEnv, DB, GITHUB_APP_ID: "40", GITHUB_APP_PRIVATE_KEY: "not-used", FACTORY: { idFromName: (name: string) => name, get(name: string) { if (!objects.has(name)) objects.set(name, create()); return objects.get(name)!.factory; } } };
  function create() {
    const data = new Map<string, any>();
    let alarm: number | null = null;
    const storage = { async get(key: string) { return structuredClone(data.get(key)); }, async put(key: string, value: unknown) { data.set(key, structuredClone(value)); }, async delete(key: string) { return data.delete(key); }, async deleteAll() { data.clear(); }, async list(options?: { prefix?: string; limit?: number }) { return new Map([...data].filter(([key]) => key.startsWith(options?.prefix ?? "")).slice(0, options?.limit)); }, async getAlarm() { return alarm; }, async setAlarm(at: number) { alarm = at; }, async deleteAlarm() { alarm = null; } };
    const ctx = { storage, getWebSockets: () => [], blockConcurrencyWhile: (fn: () => any) => fn() };
    return { data, alarm: () => alarm, factory: new Factory(ctx as never, env) };
  }
  const seed = (name = "octo-org/demo", key = "repo:501") => {
    const factory = env.FACTORY.get(key);
    const obj = objects.get(key)!;
    obj.data.set("state", FactoryState.parse({ repo: name, baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 2, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 4 }));
    obj.data.set("meta", { repo: name, installationId: 40 });
    return { ...obj, factory };
  };
  return { DB, sqlite, env, objects, seed, row: () => sqlite.query("SELECT * FROM repos LIMIT 1").get() as RepoRecord | null };
}

async function install(f: ReturnType<typeof fixture>) {
  f.seed();
  await handleLifecycle(f.env, "installation", { ...payload, action: "created", repositories: [payload.repository] });
}

describe("GitHub lifecycle fixture payloads", () => {
  it("installation.created records ID routing, exact installation settings and backfill", async () => {
    const f = fixture(); await install(f);
    expect(f.row()?.repo_id).toBe(501);
    expect(f.objects.get("repo:501")!.data.get("githubPermissions").setup.actionUrl).toBe("https://github.com/organizations/octo-org/settings/installations/40");
    expect(f.objects.get("repo:501")!.data.has("delivery:backfill-40-501")).toBe(true);
    expect(await repositoryFactory(f.env, "octo-org/demo")).toBe(f.objects.get("repo:501")!.factory as never);
  });
  for (const [event, action] of [["installation", "deleted"], ["installation_repositories", "removed"], ["repository", "deleted"]]) {
    it(`${event}.${action} stops work, retains 30 days, and can restore`, async () => {
      const f = fixture(); await install(f);
      const obj = f.objects.get("repo:501")!;
      obj.data.set("runnerPair", "old-pair");
      await handleLifecycle(f.env, event!, { ...payload, action, repositories_removed: [payload.repository] });
      const archived = f.row()!.archived_at!;
      expect(archived).toBeGreaterThan(0);
      expect(obj.alarm()).toBe(archived + RETENTION_MS);
      expect(obj.data.has("runnerPair")).toBe(false);
      await expect(obj.factory.pairRunner()).rejects.toThrow("archived");
      await obj.factory.alarm();
      expect(obj.data.get("state").tick).toBe(4);
      await handleLifecycle(f.env, "installation", { ...payload, installation: { ...payload.installation, id: 41 }, action: "created", repositories: [payload.repository] });
      expect(f.row()?.archived_at).toBeNull();
      expect(obj.data.get("state").science.red).toBe(2);
      expect(obj.data.get("meta").installationId).toBe(41);
      expect(obj.data.has("githubLifecycle")).toBe(false);
    });
  }
  it("installation.suspend pauses without deleting data; unsuspend restores without a repository list", async () => {
    const f = fixture(); await install(f);
    const obj = f.objects.get("repo:501")!;
    await handleLifecycle(f.env, "installation", { ...payload, action: "suspend" });
    expect(obj.alarm()).toBeNull(); expect(f.row()?.archived_at).toBeNull();
    await handleLifecycle(f.env, "installation", { ...payload, action: "unsuspend" });
    expect(obj.data.has("githubLifecycle")).toBe(false); expect(obj.alarm()).not.toBeNull();
  });
  it("new_permissions_accepted clears drift; missing permissions pause and expose precise settings", async () => {
    const f = fixture(); f.seed();
    await handleLifecycle(f.env, "installation", { ...payload, action: "created", repositories: [payload.repository], installation: { ...payload.installation, permissions: { contents: "read" } } });
    const obj = f.objects.get("repo:501")!;
    expect(obj.data.get("githubPermissions").detail).toContain("contents: write");
    expect(obj.alarm()).toBeNull();
    await handleLifecycle(f.env, "installation", { ...payload, action: "new_permissions_accepted" });
    expect(obj.data.get("githubPermissions").state).toBe("connected");
    expect(obj.data.has("githubLifecycle")).toBe(false);
  });
  it("installation_repositories.added restores the same factory after removal", async () => {
    const f = fixture(); await install(f);
    await handleLifecycle(f.env, "installation_repositories", { ...payload, action: "removed", repositories_removed: [payload.repository] });
    await handleLifecycle(f.env, "installation_repositories", { ...payload, action: "added", repositories_added: [payload.repository] });
    expect(f.row()?.archived_at).toBeNull(); expect(f.objects.get("repo:501")!.data.get("state").science.red).toBe(2);
  });
  for (const action of ["renamed", "transferred"]) {
    it(`repository.${action} preserves identity and refreshes the installation`, async () => {
      const f = fixture(); await install(f);
      // JWT signer uses a real ephemeral key; GitHub API is replaced below.
      f.env.GITHUB_APP_PRIVATE_KEY = await privateKey();
      const original = globalThis.fetch;
      globalThis.fetch = (async () => Response.json({ id: 41 })) as unknown as typeof fetch;
      try { await handleLifecycle(f.env, "repository", { ...payload, action, repository: { ...payload.repository, full_name: "new-org/renamed" } }); } finally { globalThis.fetch = original; }
      expect(f.row()?.full_name).toBe("new-org/renamed"); expect(f.row()?.repo_id).toBe(501);
      expect(f.objects.get("repo:501")!.data.get("state").repo).toBe("new-org/renamed");
      expect(f.row()?.installation_id).toBe(41);
    });
  }
  it("transfer without access archives rather than keeping stale installation access", async () => {
    const f = fixture(); await install(f); f.env.GITHUB_APP_PRIVATE_KEY = await privateKey();
    const original = globalThis.fetch; globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    try { await handleLifecycle(f.env, "repository", { ...payload, action: "transferred" }); } finally { globalThis.fetch = original; }
    expect(f.row()?.archived_at).toBeGreaterThan(0);
  });
  it("github_app_authorization.revoked invalidates cookies but keeps the organization's installation", async () => {
    const f = fixture(); await install(f);
    const session = await readSessionDetails("secret", await makeSessionCookie("secret", "octocat", Date.now() - 10000));
    await handleLifecycle(f.env, "github_app_authorization", { action: "revoked", sender: payload.sender });
    expect(await authorizationRevoked(f.env.DB, "octocat", session!.issuedAt)).toBe(true);
    expect(await authorizationRevoked(f.env.DB, "octocat", Date.now() + 1000)).toBe(false);
    expect(f.row()?.archived_at).toBeNull();
  });
  it("expiry deletes retained DO and repository data after 30 days", async () => {
    const f = fixture(); await install(f);
    const obj = f.objects.get("repo:501")!;
    await obj.factory.archiveGitHub("removed", Date.now() - RETENTION_MS - 1);
    await f.DB.prepare("UPDATE repos SET archived_at = 1").run();
    await obj.factory.alarm();
    expect(f.row()).toBeNull(); expect(obj.data.size).toBe(0); expect(obj.alarm()).toBeNull();
  });
  it("migrates all name-keyed state once, freezes old work and removes the old private copy", async () => {
    const f = fixture(); const old = f.seed("octo-org/demo", "octo-org/demo");
    old.data.set("runnerJob:1", { id: "1" }); old.data.set("permits", { district: "checkout" });
    await f.DB.prepare("INSERT INTO repos(full_name, installation_id) VALUES ('octo-org/demo', 40)").run();
    await migrateRepository(f.env, f.row()!, 501);
    await migrateRepository(f.env, { ...f.row()!, repo_id: null }, 501);
    const obj = f.objects.get("repo:501")!;
    expect(obj.data.get("runnerJob:1")).toEqual({ id: "1" });
    expect(obj.data.get("state").science.red).toBe(2); expect(old.data.size).toBe(1);
    await expect(old.factory.pairRunner()).rejects.toThrow("archived");
  });
});

export async function privateKey() {
  const key = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", key.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
}
