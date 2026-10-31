import { expect, test } from "bun:test";
import { currentUser, endSession } from "../src/accounts";
import { signedInCookie, testD1 } from "./d1-fixture";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(login = "player", id = 37) {
  const DB = testD1(), env = { DB, SESSION_SECRET: "request-local-auth-tests", ALLOWED_LOGINS: login };
  const cookie = await signedInCookie(env, login, [], id);
  return { env, cookie };
}

// Exercise the compatibility path for lightweight adapters without D1 batch.
test("fresh admission starts while this request's fresh revocation read is pending", async () => {
  const { env, cookie } = await fixture();
  const real = env.DB, revocationStarted = deferred(), release = deferred(), admissionRelease = deferred();
  let admitted = false, sessions = 0;
  env.DB = { ...real, batch: undefined, prepare(sql: string) {
    const statement = real.prepare(sql);
    return { ...statement, bind(...args: unknown[]) {
      const bound = statement.bind(...args);
      return { ...bound, first: async () => {
        if (sql.includes("FROM sessions")) sessions++;
        if (sql.includes("github_authorization_revocations")) { revocationStarted.resolve(); await release.promise; }
        if (sql.startsWith("SELECT enabled")) { admitted = true; await admissionRelease.promise; }
        return bound.first();
      } };
    } };
  } } as unknown as D1Database;
  let settled = false;
  const lookup = currentUser(env, cookie).then(user => { settled = true; return user; });
  try {
    await revocationStarted.promise; expect(admitted).toBe(true);
    release.resolve(); await Promise.resolve();
    expect(settled).toBe(false); // A completed revocation read cannot bypass the held admission read.
  } finally { release.resolve(); admissionRelease.resolve(); }
  expect(await lookup).toEqual({ id: 37, login: "player" });
  expect(sessions).toBe(1);
  await endSession(env, cookie);
  expect(await currentUser(env, cookie)).toBeNull();
});

test("revocation and admission changes are checked on every call, with no authority cache", async () => {
  const { env, cookie } = await fixture();
  expect(await currentUser(env, cookie)).not.toBeNull();
  await env.DB.prepare("INSERT INTO signup_allowlist(login,enabled,approved_by,updated_at) VALUES (?,0,'fixture',0)").bind("player").run();
  expect(await currentUser(env, cookie)).toBeNull();
  await env.DB.prepare("UPDATE signup_allowlist SET enabled=1 WHERE login=?").bind("player").run();
  expect(await currentUser(env, cookie)).not.toBeNull();
  await env.DB.prepare("INSERT INTO github_authorization_revocations(login,revoked_at) VALUES (?,?)").bind("player", Date.now()+1).run();
  expect(await currentUser(env, cookie)).toBeNull();
});

test("admission errors fail closed, while known revocation retains precedence over admission errors", async () => {
  const { env, cookie } = await fixture(), real = env.DB;
  env.DB = { ...real, batch: undefined, prepare(sql: string) {
    if (!sql.startsWith("SELECT enabled")) return real.prepare(sql);
    return { bind: () => ({ first: async () => { throw Error("admission unavailable"); } }) };
  } } as unknown as D1Database;
  await expect(currentUser(env, cookie)).rejects.toThrow("admission unavailable");
  await real.prepare("INSERT INTO github_authorization_revocations(login,revoked_at) VALUES (?,?)").bind("player", Date.now()+1).run();
  expect(await currentUser(env, cookie)).toBeNull();
});

test("pending sign-in skips admission only when explicitly requested, and tester policy remains enforced", async () => {
  const { env, cookie } = await fixture("test-newbie", -9001);
  const staging = { ...env, TEST_USERS: "on", PUBLIC_URL: "https://shiptorio.dev" };
  expect(await currentUser(staging, cookie)).toEqual({ id: -9001, login: "test-newbie" });
  expect(await currentUser({ ...staging, PUBLIC_URL: "https://shiptorio.com" }, cookie)).toBeNull();
  await env.DB.prepare("INSERT INTO signup_allowlist(login,enabled,approved_by,updated_at) VALUES (?,0,'fixture',0)").bind("test-newbie").run();
  expect(await currentUser(staging, cookie)).toBeNull();
  expect(await currentUser(staging, cookie, null, Date.now(), true)).not.toBeNull();
  expect(await currentUser({ ...staging, TEST_USERS: "off" }, cookie, null, Date.now(), true)).toBeNull();
});


test("a revocation lookup error keeps its original precedence over an admission denial", async () => {
  const { env, cookie } = await fixture(), real = env.DB;
  await real.prepare("INSERT INTO signup_allowlist(login,enabled,approved_by,updated_at) VALUES (?,0,'fixture',0)").bind("player").run();
  env.DB = { ...real, batch: undefined, prepare(sql: string) {
    if (!sql.includes("github_authorization_revocations")) return real.prepare(sql);
    return { bind: () => ({ first: async () => { throw Error("revocation unavailable"); } }) };
  } } as unknown as D1Database;
  await expect(currentUser(env, cookie)).rejects.toThrow("revocation unavailable");
});
