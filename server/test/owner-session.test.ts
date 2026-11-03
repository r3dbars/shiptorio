import { expect, mock, test } from "bun:test";
import { currentUser, upsertUser } from "../src/accounts";
import { makeSessionCookie, ownerProof } from "../src/session";
import { testD1 } from "./d1-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { default: app } = await import("../src/index");

const secret = "owner-session", password = "owner-preview";
const access = async () => (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
const FACTORY = { idFromName: (name: string) => name, get: () => ({ securityLimit: async () => ({ allowed: true, retryAfter: 0 }) }) };
const ask = async (env: object, body: object) => app.fetch(new Request("https://shiptorio.com/auth/owner-session", {
  method: "POST", headers: { cookie: await access(), origin: "https://shiptorio.com", "content-type": "application/json" }, body: JSON.stringify(body),
}), env as never);

test("an owner script holding SESSION_SECRET gets a real, revocable session", async () => {
  const DB = testD1(), env = { DB, SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "r3dbars", FACTORY };
  await upsertUser(env, { id: 7, login: "r3dbars" });
  const at = Date.now();
  const res = await ask(env, { login: "r3dbars", at, proof: await ownerProof(secret, "r3dbars", at) });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  expect(await currentUser(env, cookie)).toEqual({ id: 7, login: "r3dbars" });
});

test("E2E_OWNER_KEY is a second owner key, only when it is set", async () => {
  const DB = testD1(), env = { DB, SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "r3dbars", FACTORY, E2E_OWNER_KEY: "e2e-key" };
  await upsertUser(env, { id: 7, login: "r3dbars" });
  const at = Date.now();
  expect((await ask(env, { login: "r3dbars", at, proof: await ownerProof("e2e-key", "r3dbars", at) })).status).toBe(200);
  expect((await ask(env, { login: "r3dbars", at, proof: await ownerProof(secret, "r3dbars", at) })).status).toBe(200);
  const { E2E_OWNER_KEY: _, ...without } = env;
  expect((await ask(without, { login: "r3dbars", at, proof: await ownerProof("e2e-key", "r3dbars", at) })).status).toBe(401);
  expect((await ask({ ...env, E2E_OWNER_KEY: "" }, { login: "r3dbars", at, proof: await ownerProof("e2e-key", "r3dbars", at) })).status).toBe(401);
});

test("a locally signed cookie without a session row is still refused", async () => {
  const env = { DB: testD1(), SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars" };
  await upsertUser(env, { id: 7, login: "r3dbars" });
  expect(await currentUser(env, (await makeSessionCookie(secret, "r3dbars")).split(";")[0])).toBeNull();
});

test("wrong secret, stale proof, unknown or disallowed accounts get no session", async () => {
  const DB = testD1(), env = { DB, SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "r3dbars", FACTORY };
  await upsertUser(env, { id: 7, login: "r3dbars" });
  await upsertUser(env, { id: 8, login: "stranger" });
  const at = Date.now(), old = at - 5 * 60_000;
  for (const [body, status] of [
    [{ login: "r3dbars", at, proof: await ownerProof("guess", "r3dbars", at) }, 401],
    [{ login: "r3dbars", at: old, proof: await ownerProof(secret, "r3dbars", old) }, 401],
    [{ login: "nobody", at, proof: await ownerProof(secret, "nobody", at) }, 403],
    [{ login: "stranger", at, proof: await ownerProof(secret, "stranger", at) }, 403],
    [{ login: "r3dbars" }, 401],
  ] as const) {
    const res = await ask(env, body);
    expect(res.status).toBe(status);
    expect(res.headers.get("set-cookie")).toBeNull();
  }
});
