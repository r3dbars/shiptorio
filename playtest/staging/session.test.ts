import { expect, test } from "bun:test";
import { testD1 } from "../../server/test/d1-fixture";
import { fixtureSession } from "./session";
import { currentUser, endSession } from "../../server/src/accounts";
import { personaId } from "../../server/src/test-users-policy";
import { FixtureTiming } from "./timing";
import type { FixtureEnv } from "./env";

function setup() {
  const db = testD1(), cache = new Map<string, string>();
  let writes = 0;
  const env = { DB: { ...db, prepare(sql: string) { if (!/^SELECT\b/i.test(sql)) writes++; return db.prepare(sql); } }, CACHE: { get: async (key: string) => cache.get(key) ?? null, put: async (key: string, value: string) => { cache.set(key, value); } }, SESSION_SECRET: "isolated-session-tests", ALLOWED_LOGINS: "", PUBLIC_URL: "https://shiptorio.dev", TEST_USERS: "on" } as unknown as FixtureEnv;
  return { env, cache, writes: () => writes };
}
test("valid private sessions are rechecked without repeating provisioning writes", async () => {
  const f = setup();
  const first = await fixtureSession(f.env, "test-newbie"), provisioned = f.writes();
  expect(provisioned).toBeGreaterThan(0);
  expect((await currentUser(f.env, first))?.id).toBe(personaId("test-newbie"));
  expect(await fixtureSession(f.env, "test-newbie")).toBe(first);
  expect(f.writes()).toBe(provisioned);
  await endSession(f.env, first);
  const afterRevocation = f.writes();
  const replacement = await fixtureSession(f.env, "test-newbie");
  expect(replacement).not.toBe(first);
  expect(f.writes()).toBeGreaterThan(afterRevocation);
  expect((await currentUser(f.env, first))).toBeNull();
  expect((await currentUser(f.env, replacement))?.id).toBe(personaId("test-newbie"));
});
test("a cached session for a different persona cannot become the requested identity", async () => {
  const f = setup(), other = await fixtureSession(f.env, "test-midgame");
  f.cache.set("fixture-session:test-newbie", other);
  const created = await fixtureSession(f.env, "test-newbie");
  expect(created).not.toBe(other);
  expect((await currentUser(f.env, created))?.id).toBe(personaId("test-newbie"));
});
test("private timings contain only bounded phase durations and do not change the response", () => {
  let clock = 100;
  const timing = new FixtureTiming(() => clock);
  clock = 104.25; timing.mark("verify");
  clock = 114.25; timing.mark("session");
  const response = new Response("same body", { status: 200, headers: { "x-existing": "kept" } });
  expect(timing.attach(response)).toBe(response);
  expect(response.headers.get("Server-Timing")).toBe("fixture_verify;dur=4.3, fixture_session;dur=10.0");
  expect(response.headers.get("x-existing")).toBe("kept");
  expect(response.status).toBe(200);
});
