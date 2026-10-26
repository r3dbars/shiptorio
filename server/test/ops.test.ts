import { credentialEnv } from "./credential-fixture";
import { expect, mock, test } from "bun:test";
import { flagEnabled, flagKey, readFlags } from "../src/flags";
import { makeSessionCookie } from "../src/session";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { testApp: app } = await import("./app-fixture");
const { Factory } = await import("../src/factory");
const secret = "ops-test-session", password = "ops-test-preview";
function fixture() {
  const values = new Map<string, string>();
  const CACHE = { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: string) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); } };
  const env = { SESSION_SECRET: secret, APP_PASSWORD: password, ADMIN_LOGINS: "admin", ALLOWED_LOGINS: "admin,player", CACHE,
    DB: { prepare: (sql:string) => sql.startsWith("SELECT enabled") ? ({bind:()=>({first:async()=>null})}) : ({ first: async () => ({ 1: 1 }), bind: (_hash: string, uid: number) => ({ first: async () => uid === 1 ? { id: 1, login: "admin" } : { id: 2, login: "player" } }) }) },
    FACTORY: { idFromName: (name: string) => name, get: () => ({ health: async () => ({ ok: true }) }) } };
  return { values, env, request: (path: string, init?: RequestInit) => app.fetch(new Request(`https://shiptorio.dev${path}`, init), env as never) };
}
async function cookies(user: string) {
  return [(await makeSessionCookie(secret, user, Date.now(), { sid: "ops-test-session-id", uid: user === "admin" ? 1 : 2 })).split(";")[0], (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")].join("; ");
}
test("flag precedence, user isolation, defaults and fail-closed storage", async () => {
  const { env, values } = fixture();
  expect(await flagEnabled(env as never, "newFeatures", "alice")).toBe(false);
  values.set(flagKey("newFeatures", "alice"), "true");
  expect(await flagEnabled(env as never, "newFeatures", "Alice")).toBe(true);
  expect(await flagEnabled(env as never, "newFeatures", "bob")).toBe(false);
  values.set(flagKey("newFeatures"), "false");
  expect(await flagEnabled(env as never, "newFeatures", "alice")).toBe(false);
  values.set(flagKey("research", "alice"), "false");
  expect((await readFlags(env as never, "alice")).research).toBe(false);
  expect(await flagEnabled({ CACHE: { get: async () => { throw new Error("offline"); } } } as never, "permits")).toBe(false);
});
test("health bypasses preview only for its exact path, reports degraded dependencies without details", async () => {
  const { env, request } = fixture();
  const healthy = await request("/api/health");
  expect(healthy.status).toBe(200);
  expect(await healthy.json()).toEqual({ ok: true, checks: { d1: "ok", kv: "ok", durableObject: "ok" } });
  expect(healthy.headers.get("cache-control")).toBe("no-store");
  for (const dependency of ["DB", "CACHE", "FACTORY"] as const) {
    const original = env[dependency];
    (env as Record<string, unknown>)[dependency] = new Proxy({}, { get() { throw new Error("sensitive failure"); } });
    const response = await request("/api/health");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive");
    (env as Record<string, unknown>)[dependency] = original;
  }
  expect((await request("/api/flags")).status).toBe(401);
  expect((await request("/api/health/other")).status).toBe(401);
});
test("admin flag write requires admin session and same origin; validates and resets overrides", async () => {
  const { values, request } = fixture();
  const post = async (user: string, origin = "https://shiptorio.dev", body = "name=research&value=false&user=Player") => request("/api/admin/flags", { method: "POST", headers: { cookie: await cookies(user), origin, "content-type": "application/x-www-form-urlencoded" }, body });
  expect((await post("player")).status).toBe(403);
  expect((await post("admin", "https://evil.example")).status).toBe(403);
  expect((await post("admin", undefined, "name=unknown&value=true")).status).toBe(400);
  expect((await post("admin")).status).toBe(303);
  expect(values.get(flagKey("research", "player"))).toBe("false");
  const personal = await request("/api/flags", { headers: { cookie: await cookies("player") } });
  expect((await personal.json() as { research: boolean }).research).toBe(false);
  expect((await post("admin", undefined, "name=research&value=inherit&user=player")).status).toBe(303);
  expect(values.has(flagKey("research", "player"))).toBe(false);
  expect((await request("/admin/flags", { headers: { cookie: await cookies("admin") } })).status).toBe(200);
});
test("DO health probe reads storage without initializing a factory or scheduling work", async () => {
  const reads: string[] = [];
  const factory = new Factory({ storage: { get: async (key: string) => { reads.push(key); } } } as never, credentialEnv({}) as never);
  expect(await factory.health()).toEqual({ ok: true });
  expect(reads).toEqual(["ops-health"]);
});
test("permit kill switch blocks existing autonomous launches before any GitHub request", async () => {
  const factory = new Factory({} as never, credentialEnv({ CACHE: { get: async () => "false" } }) as never);
  (factory as unknown as { meta: unknown }).meta = { repo: "test/repo", installationId: 1 };
  const launch = factory as unknown as { launch(item: unknown, by: string): Promise<void> };
  // Would read meta/token if the guard were absent. No initialized repo is needed to stop it.
  await launch.launch({ prNumber: 1 }, "autonomy");
});

test("revoked and legacy signed sessions cannot administer flags", async () => {
  const { env, request } = fixture();
  const validCookies = await cookies("admin");
  (env.DB as unknown as { prepare: unknown }).prepare = () => ({ bind: () => ({ first: async () => null }) });
  expect((await request("/admin/flags", { headers: { cookie: validCookies } })).status).toBe(403);
  const legacy = (await makeSessionCookie(secret, "admin")).split(";")[0];
  const preview = (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
  expect((await request("/admin/flags", { headers: { cookie: `${legacy}; ${preview}` } })).status).toBe(403);
});
