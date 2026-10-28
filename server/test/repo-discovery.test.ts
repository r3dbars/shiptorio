import { expect, mock, test } from "bun:test";
import { signedInCookie, testD1 } from "./d1-fixture";
import { membershipCache, unlimitedFactory } from "./browser-fixture";
import { makeSessionCookie } from "../src/session";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
async function setup() {
  const DB = testD1(), env = { DB, SESSION_SECRET: "repo-list-session", APP_PASSWORD: "repo-list-preview", ALLOWED_LOGINS: "player", CACHE: membershipCache, FACTORY: unlimitedFactory };
  const session = await signedInCookie(env, "player", ["player/project"], 31);
  const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
  const cookie = `${session}; ${preview}`;
  const get = () => app.fetch(new Request("https://shiptorio.com/api/repos", { headers: { cookie } }), env as never);
  return { env, get };
}

test("a failed permission lookup is a retryable error, never a misleading empty repository list", async () => {
  const f = await setup(), realBatch = f.env.DB.batch.bind(f.env.DB);
  f.env.DB.batch = (async () => [{ success: false, results: [] }, { success: false, results: [] }, { success: false, results: [] }]) as any;
  const failed = await f.get();
  expect(failed.status).toBe(503);
  expect(failed.headers.get("retry-after")).toBe("5");
  expect(await failed.json()).toMatchObject({ code: "repository_discovery_unavailable" });
  f.env.DB.batch = realBatch;
  const ready = await f.get();
  expect(ready.status).toBe(200);
  expect((await ready.json() as any).repos.map((r:any)=>r.full_name)).toEqual(["player/project"]);
});

test("real membership revocation still removes a repository without an outage error", async () => {
  const f = await setup();
  await f.env.DB.prepare("DELETE FROM user_installations WHERE user_id=?").bind(31).run();
  const response = await f.get();
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ repos: [] });
});

test("discovery failures never expose internal exception details", async () => {
  const f = await setup();
  f.env.DB.batch = (async () => { throw Error("private-database-detail"); }) as any;
  const response = await f.get();
  expect(response.status).toBe(503);
  const text = await response.text();
  expect(text).toContain("Try again"); expect(text).not.toContain("private-database-detail");
});
