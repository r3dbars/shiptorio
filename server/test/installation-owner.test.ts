import { expect, test } from "bun:test";
import { testD1 } from "./d1-fixture";
import { rememberInstallationOwner } from "../src/installation-owner";
import { saveReach } from "../src/accounts";
import { inTrace, log } from "../src/telemetry";
import { identityAccountId } from "../src/account-identity";

test("authenticated installation reach records numeric owner, not the collaborator", async () => {
  const DB = testD1();
  const env = {DB, SESSION_SECRET: "fixture-session", ALLOWED_LOGINS: "collaborator"};
  await saveReach(env, 99, {installations: [{id: 1, account: "owner", accountId: 11, accountType: "User"}], repos: []});
  expect(await DB.prepare("SELECT account_id, account_type FROM installations WHERE id = 1").first()).toEqual({account_id: 11, account_type: "User"});
  await rememberInstallationOwner(DB, 1, {login: "incomplete"});
  await rememberInstallationOwner(DB, 1, {id: 99, login: "reused", type: "User"});
  expect(await DB.prepare("SELECT account_id, account_type FROM installations WHERE id = 1").first()).toEqual({account_id: 11, account_type: "User"});
  await rememberInstallationOwner(DB, 1, {id: 11, login: "renamed", type: "User"});
  expect(await DB.prepare("SELECT account_login FROM installations WHERE id = 1").first()).toEqual({account_login: "renamed"});
});

test("legacy metadata and malformed IDs cannot establish owner-only authority", async () => {
  const DB = testD1();
  await DB.prepare("INSERT INTO installations(id,account_login) VALUES(1,'owner')").run();
  for (const id of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await rememberInstallationOwner(DB, 1, {id, login: "owner", type: "User"});
  await rememberInstallationOwner(DB, 1, {id: 11, login: "owner"});
  expect(await DB.prepare("SELECT account_id FROM installations WHERE id = 1").first()).toEqual({account_id: null});
});

test("versioned operational identity retains real account events and stops after deletion", async () => {
  const DB = testD1();
  await DB.prepare("INSERT INTO users(id,login,created_at,last_login_at) VALUES(11,'alice',1,1)").run();
  const writes: string[] = [], tasks: Promise<unknown>[] = [];
  const env = {DB, CACHE: {put: async (_key: string, value: string) => {writes.push(value);}, delete: async () => {}}};
  const emit = (userId: string) => inTrace({requestId: "identity-test", userId}, env as never, task => tasks.push(task), () => log("info", "identity-test"));
  emit("github:user:11"); await Promise.all(tasks.splice(0));
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0]).userId).toBe("github:user:11");
  emit("11"); await Promise.all(tasks.splice(0)); expect(writes).toHaveLength(1);
  await DB.prepare("DELETE FROM users WHERE id = 11").run();
  emit("github:user:11"); await Promise.all(tasks.splice(0)); expect(writes).toHaveLength(1);
  for (const value of ["11", "alice", "github:user:01", "github:user:-1", "github:user:9007199254740992"]) expect(identityAccountId(value)).toBeNull();
});
