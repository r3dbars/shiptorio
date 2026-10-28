import { expect, test } from "bun:test";
import { Hono } from "hono";
import { testD1 } from "./d1-fixture";
import { currentUser, createSession, readProgress } from "../src/accounts";
import { makeSessionCookie } from "../src/session";
import { personaSnapshot } from "../../playtest/bot/personas";
import { TEST_PERSONAS, personaId, seedTestUser, testUserRoutes, testUsersEnabled } from "../src/test-users";
import { verifyTestDelegation } from "../src/test-delegation";

const fixture = () => {
  const env = { DB: testD1(), SESSION_SECRET: "test-session-secret", APP_PASSWORD: "test-preview", ALLOWED_LOGINS: "", TEST_USERS: "on", PUBLIC_URL: "http://localhost:8787" };
  const app = new Hono<any>(); testUserRoutes(app);
  let calls = 0;
  app.all("*", c => { calls++; return c.json({ ordinary: true }); });
  return { env, app, calls: () => calls };
};
const preview = async () => (await makeSessionCookie("test-session-secret:test-preview", "preview")).replace("shiptorio_session=", "shiptorio_access=").split(";")[0];
test("test auth refuses production, aliases, mismatched PUBLIC_URL and disabled mode", () => {
  for (const [host, canonical, mode] of [
    ["https://shiptorio.com", "https://shiptorio.com", "on"],
    ["https://shiptorio.dev.evil.test", "https://shiptorio.dev.evil.test", "on"],
    ["https://shiptorio.dev", "https://shiptorio.com", "on"],
    ["http://localhost:8787", "https://shiptorio.com", "on"],
    ["https://shiptorio.dev", "https://shiptorio.dev", "off"],
  ]) expect(testUsersEnabled({ TEST_USERS: mode, PUBLIC_URL: canonical }, new URL(host))).toBe(false);
  expect(testUsersEnabled({ TEST_USERS: "on", PUBLIC_URL: "https://shiptorio.dev" }, new URL("https://shiptorio.dev/test/login"))).toBe(true);
});
test("normal negative-ID sessions persist progress and test seeds are idempotent", async () => {
  const { env } = fixture();
  for (const p of TEST_PERSONAS.filter(p => p !== "test-guest")) {
    await seedTestUser(env, p);
    const cookie = await createSession(env, { id: personaId(p), login: p }, "test");
    expect((await currentUser(env, cookie))?.id).toBeLessThan(0);
    expect(await currentUser({ ...env, TEST_USERS: "off" }, cookie)).toBeNull();
    expect(await currentUser({ ...env, PUBLIC_URL: "https://shiptorio.com" }, cookie)).toBeNull();
    const progress = (await readProgress(env, { id: personaId(p), login: p }))!;
    progress.xp = 123;
    await env.DB.prepare("UPDATE user_progress SET value=? WHERE user_id=?").bind(JSON.stringify(progress), personaId(p)).run();
    await seedTestUser(env, p);
    expect((await readProgress(env, { id: personaId(p), login: p }))?.xp).toBe(123);
  }
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n).toBe(4);
});
test("negative sessions cannot hit real repos, connectors, runner or admin before provider work", async () => {
  const f = fixture(); await seedTestUser(f.env, "test-midgame");
  const cookie = (await createSession(f.env, { id: personaId("test-midgame"), login: "test-midgame" }, "test")).split(";")[0] + "; " + await preview();
  for (const path of ["/api/repos/r3dbars/shiptorio/factory", "/api/repos/test-fixture/test-midgame/runner/pair", "/connect/sentry?repo=x/y", "/admin", "/api/runner/x/y/claim", "/api/account/delete", "/auth/login"]) {
    expect((await f.app.request(`http://localhost:8787${path}`, { headers: { cookie } }, f.env)).status).toBe(403);
  }
  expect(f.calls()).toBe(0);
  const unavailable = await f.app.request("http://localhost:8787/api/repos/test-fixture/test-midgame/factory", { headers: { cookie } }, f.env);
  expect(unavailable.status).toBe(503); expect(f.calls()).toBe(0);
  const me = await f.app.request("http://localhost:8787/api/me", { headers: { cookie } }, f.env);
  expect((await me.json() as { installUrl: string }).installUrl).toBe("/test/install");
  expect((await f.app.request("http://localhost:8787/test/install", { headers: { cookie } }, f.env)).status).toBe(503);
  const production = await f.app.request("https://shiptorio.com/api/me", { headers: { cookie } }, { ...f.env, PUBLIC_URL: "https://shiptorio.com" });
  expect(production.status).toBe(404); expect(f.calls()).toBe(0);
});
test("test login rejects unknown persona and guest does not create a signed account", async () => {
  const f = fixture();
  const headers = { cookie: await preview() };
  expect((await f.app.request("http://localhost:8787/test/login?as=admin", { headers }, f.env)).status).toBe(400);
  const guest = await f.app.request("http://localhost:8787/test/login?as=test-guest", { headers }, f.env);
  expect(guest.status).toBe(303);
  expect(guest.headers.get("set-cookie")).toContain("shiptorio_session=;");
  expect((await f.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n).toBe(0);
});
test("test login never issues a preview credential or bypasses the password gate", async () => {
  const f = fixture(); f.env.APP_PASSWORD = "required-password";
  const response = await f.app.request("http://localhost:8787/test/login?as=test-midgame", {}, f.env);
  expect(response.status).toBe(401);
  expect(response.headers.get("set-cookie") ?? "").not.toContain("shiptorio_access=");
  expect((await f.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n).toBe(0);
});
test("fixture personas have real shared-schema ships and a failed CI decision", () => {
  const mid = personaSnapshot("test-midgame", "test-fixture/test-midgame", 123);
  expect(mid.items.filter(i => i.state === "launched")).toHaveLength(3);
  expect(mid.autonomy?.level).toBe("floor");
  const blocked = personaSnapshot("test-blocked", "test-fixture/test-blocked", 123);
  expect(blocked.items[0].inspection?.stages[0].state).toBe("rework");
  expect(blocked.items[0].scars?.[0].station).toBe("ci");
});
test("disabled discovery is empty locally, while production test URLs stay unavailable", async () => {
  const f = fixture(), env = { ...f.env, TEST_USERS: "off" };
  expect(await (await f.app.request("http://localhost:8787/test/users?format=json", {}, env)).json()).toEqual({ personas: [] });
  expect((await f.app.request("https://shiptorio.com/test/users?format=json", {}, env)).status).toBe(404);
  expect(f.calls()).toBe(0);
});
test("local factory needs a keyed capability service and never routes a different repo", async () => {
  const f = fixture(); await seedTestUser(f.env, "test-midgame");
  const cookie = (await createSession(f.env, { id: personaId("test-midgame"), login: "test-midgame" }, "test")).split(";")[0] + "; " + await preview();
  const key = "a".repeat(64); let handshakes = 0;
  const env = { ...f.env, TEST_FACTORY_KEY: key, TEST_FACTORY: { fetch: async (url: string, init: RequestInit) => {
    expect(url).toBe("http://test-fixture.invalid/ready");
    expect(new Headers(init.headers).get("x-shiptorio-test-hop")).toBe(key);
    handshakes++; return new Response(null, { status: 204 });
  } } };
  expect((await f.app.request("http://localhost:8787/api/repos/test-fixture/test-midgame/factory", { headers: { cookie } }, env)).status).toBe(200);
  expect(handshakes).toBe(1); expect(f.calls()).toBe(1);
  expect((await f.app.request("http://localhost:8787/api/repos/r3dbars/shiptorio/factory", { headers: { cookie } }, env)).status).toBe(403);
  expect(handshakes).toBe(1); expect(f.calls()).toBe(1);
});
test("explicit reset is production-disabled and bound to the signed tester and same origin", async () => {
  const f = fixture(); await seedTestUser(f.env,"test-midgame");
  const cookie=(await createSession(f.env,{id:personaId("test-midgame"),login:"test-midgame"},"test")).split(";")[0]+"; "+await preview();
  const key="k".repeat(64); let calls=0;
  const env={...f.env,PUBLIC_URL:"https://shiptorio.dev",TEST_FACTORY_KEY:key,TEST_FACTORY:{fetch:async(request:Request)=>{calls++;expect(request.headers.has("cookie")).toBe(false);return Response.json({reset:"test-midgame"});}}};
  expect((await f.app.request("https://shiptorio.com/test/reset",{method:"POST",headers:{cookie,origin:"https://shiptorio.com"}},env)).status).toBe(404);
  for(const [query,origin] of [["?as=test-newbie","https://shiptorio.dev"],["","https://evil.test"]])expect((await f.app.request("https://shiptorio.dev/test/reset"+query,{method:"POST",headers:{cookie,origin}},env)).status).toBe(403);
  expect(calls).toBe(0);
  expect((await f.app.request("https://shiptorio.dev/test/reset",{method:"POST",headers:{cookie,origin:"https://shiptorio.dev"}},env)).status).toBe(200);
  expect(calls).toBe(1);
});

test("tester overview uses only the private fixture and rejects mutations and repo overrides", async () => {
  const f = fixture(); await seedTestUser(f.env, "test-midgame");
  const cookie = (await createSession(f.env, { id: personaId("test-midgame"), login: "test-midgame" }, "test")).split(";")[0] + "; " + await preview();
  expect((await f.app.request("http://localhost:8787/api/empire", { headers: { cookie } }, f.env)).status).toBe(503);
  const key = "e".repeat(64); let calls = 0;
  const env = { ...f.env, PUBLIC_URL: "https://shiptorio.dev", TEST_FACTORY_KEY: key, TEST_FACTORY: { fetch: async (request: Request) => {
    calls++;
    expect(request.headers.has("cookie")).toBe(false);
    expect(await verifyTestDelegation(request, key)).toBe("test-midgame");
    return Response.json({ islands: [{ repo: "test-fixture/test-midgame" }] });
  } } };
  const response = await f.app.request("https://shiptorio.dev/api/empire", { headers: { cookie } }, env);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ islands: [{ repo: "test-fixture/test-midgame" }] });
  for (const [url, method] of [["https://shiptorio.dev/api/empire", "POST"], ["https://shiptorio.dev/api/empire?repo=r3dbars/shiptorio", "GET"]]) {
    expect((await f.app.request(url!, { method, headers: { cookie, origin: "https://shiptorio.dev" } }, env)).status).toBe(403);
  }
  expect((await f.app.request("https://shiptorio.com/api/empire", { headers: { cookie } }, env)).status).toBe(404);
  expect(calls).toBe(1); expect(f.calls()).toBe(0);
});
