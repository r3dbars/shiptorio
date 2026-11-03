import { expect, test } from "bun:test";
import { currentUser, endSession } from "../src/accounts";
import { testD1, signedInCookie } from "./d1-fixture";

async function fixture() {
  const db = testD1();
  const base = { DB: db, SESSION_SECRET: "cold-session-fixture", ALLOWED_LOGINS: "alice" };
  const cookie = await signedInCookie(base, "alice", [], 71);
  let reads = 0;
  const env = { ...base, DB: { ...db, prepare(sql: string) {
    const prepared = db.prepare(sql);
    return { ...prepared, bind(...args: unknown[]) { const bound = prepared.bind(...args); return { ...bound, first: async () => { reads++; return bound.first(); } }; } };
  } } as D1Database };
  return { env, db, cookie, counts: () => ({ reads }) };
}

test("each account check reads current session, revocation and admission in one D1 query", async () => {
  const f = await fixture();
  expect(await currentUser(f.env, f.cookie)).toEqual({ id: 71, login: "alice" });
  expect(f.counts()).toEqual({ reads: 1 });
  await endSession(f.env, f.cookie);
  expect(await currentUser(f.env, f.cookie)).toBeNull();
  expect(f.counts()).toEqual({ reads: 2 });
});

test("disabling admission and revoking authorization remain immediately effective", async () => {
  const f = await fixture();
  await f.db.prepare("INSERT INTO signup_allowlist(login,enabled,approved_by,updated_at) VALUES ('alice',0,'fixture',0)").run();
  expect(await currentUser(f.env, f.cookie)).toBeNull();
  expect(await currentUser(f.env, f.cookie, null, Date.now(), true)).toEqual({ id: 71, login: "alice" });
  await f.db.prepare("INSERT INTO github_authorization_revocations(login,revoked_at) VALUES ('alice',?)").bind(Date.now()).run();
  expect(await currentUser(f.env, f.cookie, null, Date.now(), true)).toBeNull();
});

test("admission uses the current database login while revocation still checks the signed claim", async () => {
  const f = await fixture();
  await f.db.prepare("UPDATE users SET login='renamed' WHERE id=71").run();
  await f.db.prepare("INSERT INTO signup_allowlist(login,enabled,approved_by,updated_at) VALUES ('renamed',1,'fixture',0)").run();
  expect(await currentUser(f.env, f.cookie)).toEqual({ id: 71, login: "renamed" });
  await f.db.prepare("INSERT INTO github_authorization_revocations(login,revoked_at) VALUES ('alice',?)").bind(Date.now()).run();
  expect(await currentUser(f.env, f.cookie)).toBeNull();
});

test("a failed D1 policy query never grants account access", async () => {
  const f = await fixture();
  const DB = { ...f.db, prepare() { return { bind() { return { first() { throw new Error("policy unavailable"); } }; } }; } } as unknown as D1Database;
  await expect(currentUser({ ...f.env, DB }, f.cookie)).rejects.toThrow("policy unavailable");
});
