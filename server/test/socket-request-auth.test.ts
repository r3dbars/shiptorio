import { expect, mock, test } from "bun:test";
import { testD1, signedInCookie } from "./d1-fixture";
import { makeSessionCookie } from "../src/session";
import { endSession } from "../src/accounts";
import { PRIVATE_SOCKET_TIMING, PrivateSocketTiming } from "../src/private-socket-timing";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
async function setup() {
  const db = testD1(); let reads = 0, denyAt = Infinity;
  const env = { DB: { ...db, prepare(sql: string) {
      const statement = db.prepare(sql);
      if (!sql.startsWith("SELECT u.id, u.login FROM sessions")) return statement;
      return { ...statement, bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { ...bound, first: async () => ++reads === denyAt ? null : bound.first() };
      } };
    } }, SESSION_SECRET: "socket-request-tests", APP_PASSWORD: "socket-request-preview", ALLOWED_LOGINS: "alice", GITHUB_APP_ID: "fixture",
    CACHE: { get: async (key: string) => key.startsWith("access:v2:") ? { expiresAt: Date.now() + 59000 } : null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
    FACTORY: { idFromName: (name: string) => name, get: (name: string) => name.startsWith("security:") ? { securityLimit: async () => ({ allowed: true, retryAfter: 0 }) } : { ensure: async () => {}, fetch: async () => new Response(null, { status: 101, headers: { "Server-Timing": "do_existing;dur=1" } }) } },
  };
  const login = await signedInCookie(env as never, "alice", ["alice/repo"], 11);
  await db.prepare("UPDATE repos SET repo_id=777 WHERE full_name='alice/repo'").run();
  const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
  const request = (profile = true, origin = "https://shiptorio.com") => { reads = 0; const bindings = { ...env, ...(profile ? { [PRIVATE_SOCKET_TIMING]: new PrivateSocketTiming() } : {}) }; return app.fetch(new Request(origin + "/api/repos/alice/repo/factory", { headers: { cookie: `${login}; ${preview}`, origin, upgrade: "websocket", "x-private-socket-timing": "on" } }), bindings as never); };
  return { env, login, request, reads: () => reads, denyAt: (value: number) => { denyAt = value; } };
}
test("whole App retains upstream and request phase timings on upgrades", async () => {
  const f = await setup(), response = await f.request();
  expect(response.status).toBe(101);
  expect(response.headers.get("Server-Timing")).toContain("do_existing;dur=1");
  expect(response.headers.get("Server-Timing")).toContain("app_trace_auth;");
  expect(response.headers.get("Server-Timing")).toContain("app_repo_access;");
});
test("whole App shares only URL-aware auth inside one request and freshly rejects revocation", async () => {
  const f = await setup();
  expect((await f.request()).status).toBe(101);
  // One shared signedIn, independent scoped resolveUser, independent repoAccess.
  expect(f.reads()).toBe(3);
  expect((await f.request()).status).toBe(101);
  expect(f.reads()).toBe(3);
  await endSession(f.env as never, f.login);
  expect((await f.request()).status).toBe(401);
  expect(f.reads()).toBeGreaterThan(0);
});
test("request headers cannot enable private phase profiling", async () => {
  const f = await setup(), response = await f.request(false);
  expect(response.status).toBe(101);
  expect(response.headers.get("Server-Timing")).toBe("do_existing;dur=1");
});

test("revocation during the request still fails at independent scoped and repo checks", async () => {
  for (const [at, status] of [[2, 401], [3, 403]]) {
    const f = await setup(); f.denyAt(at);
    expect((await f.request()).status).toBe(status);
    expect(f.reads()).toBe(at);
  }
});
test("URL-aware local development identity never replaces the actual scoped account", async () => {
  const f = await setup(); Object.assign(f.env, { DEV_LOGIN: "local-debug" });
  expect((await f.request(true, "http://localhost")).status).toBe(101);
  expect(f.reads()).toBe(2); // Scoped session and repository reads still use Alice's real account.
});
