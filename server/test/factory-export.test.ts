import { credentialEnv } from "./credential-fixture";
import { membershipCache } from "./browser-fixture";
import { expect, mock, test } from "bun:test";
import { makeSessionCookie } from "../src/session";
import { signedInCookie, testD1 } from "./d1-fixture";
import original from "./fixtures/factory-state/unversioned-original.json";
import { loadFactoryState, migrateFactoryState, saveFactoryState } from "../src/state-storage";
mock.module("cloudflare:workers", () => ({DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
}}));
const { default: app, Factory } = await import("../src/index");

function fixture(connected = true, populated = true) {
  const data = new Map<string, unknown>(populated ? [["state", structuredClone(original)], ["meta", {repo: "owner/repo", installationId: 1}], ["runnerPair", "private-pair"], ["runnerJob:secret", {lease: "private-lease"}]] : []);
  const storage = {
    get: async (key: string) => structuredClone(data.get(key)),
    put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
    delete: async (key: string) => data.delete(key),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(storage),
  };
  const env = { SESSION_SECRET: "export-test", APP_PASSWORD: "export-preview", ALLOWED_LOGINS: "owner,other", CACHE: membershipCache, DB: testD1(), FACTORY: {idFromName: (repo: string) => repo, get: (_id: string) => factory} };
  const factory = new Factory({storage, getWebSockets: () => []} as never, credentialEnv(env) as never);
  const request = async (login: string | null, path = "owner/repo") => {
    if (connected) {
      await env.DB.prepare("INSERT OR IGNORE INTO installations(id,account_login,permissions) VALUES(1,'owner','{}')").run();
      await env.DB.prepare("INSERT OR IGNORE INTO repos(full_name,installation_id,repo_id) VALUES('owner/repo',1,501)").run();
    }
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    const cookie = login ? `${await signedInCookie(env, login, connected ? ["owner/repo"] : [])}; ${preview}` : preview;
    return app.fetch(new Request(`https://shiptorio.com/api/repos/${path}/export`, {headers: {cookie}}), env as never);
  };
  return {request, data};
}

test("owner downloads a versioned factory JSON through the real route and DO method", async () => {
  const f = fixture(), response = await f.request("owner");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("owner-repo-factory.json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const text = await response.text();
  expect(text).not.toContain("private-pair"); expect(text).not.toContain("private-lease");
  const exported = JSON.parse(text);
  expect(exported.format).toBe("shiptorio-factory");
  expect(exported.state.schemaVersion).toBe(2);
  expect(exported.state.items).toEqual(original.items);
  expect(exported.storage.stateBytes).toBeGreaterThan(0);
  // Restore the downloaded JSON to a separate local storage copy and reload it.
  const restored = new Map<string, unknown>();
  const storage = {get: async (k: string) => restored.get(k), put: async (k: string,v: unknown) => {restored.set(k,v);}, delete: async (k: string) => restored.delete(k), transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(storage)};
  await saveFactoryState(storage as never, migrateFactoryState(exported.state));
  expect(await loadFactoryState(storage as never)).toEqual(exported.state);
});

test("export refuses anonymous and non-owner access, missing factories, and disconnected repos", async () => {
  expect((await fixture().request(null)).status).toBe(401);
  expect((await fixture().request("other")).status).toBe(403);
  expect((await fixture(false).request("owner")).status).toBe(403);
  expect((await fixture(true, false).request("owner")).status).toBe(404);
  expect((await fixture().request("owner", "Owner/Repo")).status).toBe(200);
});
