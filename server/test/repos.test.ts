import { expect, mock, test } from "bun:test";
import { makeSessionCookie } from "../src/session";
import { signedInCookie, testD1 } from "./d1-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { default: app } = await import("../src/index");
const secret = "test-repo-session", password = "test-repo-preview";
const preview = async () => (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
const baseEnv = () => ({ APP_PASSWORD: password, SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars,friend", DB: testD1() });
const get = (env: object, path: string, cookie: string) => app.fetch(new Request(`https://shiptorio.com${path}`, { headers: { cookie } }), env as never);

test("a player's repo cards list only the repos their GitHub account reaches, with legacy fields", async () => {
  const env = baseEnv();
  await env.DB.prepare("INSERT INTO repos (full_name, installation_id, default_branch) VALUES ('r3dbars/shiptorio', 1, 'main'), ('someone/private', 2, 'main')").run();
  const cookie = `${await signedInCookie(env, "r3dbars", ["r3dbars/shiptorio", "r3dbars/other"])}; ${await preview()}`;
  const response = await get(env, "/api/repos", cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ repos: [
    { full_name: "r3dbars/other", installation_id: 1, default_branch: null, fullName: "r3dbars/other", blurb: "Connected GitHub repository" },
    { full_name: "r3dbars/shiptorio", installation_id: 1, default_branch: "main", fullName: "r3dbars/shiptorio", blurb: "Default branch: main" },
  ] });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("preview access alone, disallowed logins, pre-accounts cookies, signed-out sessions and missing preview access cannot list repos", async () => {
  const env = {...baseEnv(),SIGNUP_GATE_MODE:"password"};
  const legacy = (await makeSessionCookie(secret, "r3dbars")).split(";")[0];
  const outsider = await signedInCookie({ ...env, ALLOWED_LOGINS: "*" }, "someone-else", ["r3dbars/shiptorio"]);
  const revoked = await signedInCookie(env, "r3dbars", ["r3dbars/shiptorio"]);
  await env.DB.prepare("DELETE FROM sessions").run();
  for (const header of [await preview(), `${legacy}; ${await preview()}`, `${outsider}; ${await preview()}`, `${revoked}; ${await preview()}`, await signedInCookie(env, "r3dbars", ["r3dbars/shiptorio"])]) {
    expect((await get(env, "/api/repos", header)).status).toBe(401);
  }
});

test("a factory is only served to players who can reach its repo", async () => {
  const env = { ...baseEnv(), FACTORY: { idFromName: (r: string) => r, get: () => ({ fetch: async () => new Response("factory"), runnerJobs: async () => ({ jobs: [] }) }) } };
  const mine = `${await signedInCookie(env, "r3dbars", ["r3dbars/shiptorio"])}; ${await preview()}`;
  const theirs = `${await signedInCookie(env, "friend", ["friend/app"])}; ${await preview()}`;
  expect((await get(env, "/api/repos/r3dbars/shiptorio/runner/jobs", mine)).status).toBe(200);
  expect((await get(env, "/api/repos/R3dbars/Shiptorio/runner/jobs", mine)).status).toBe(200);
  expect((await get(env, "/api/repos/r3dbars/shiptorio/runner/jobs", theirs)).status).toBe(404);
  const socket = await app.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/shiptorio/factory", { headers: { cookie: theirs, origin: "https://shiptorio.com" } }), env as never);
  expect(socket.status).toBe(404);
});

test("signing out deletes the session row, so the same cookie stops working", async () => {
  const env = baseEnv();
  const login = await signedInCookie(env, "r3dbars", ["r3dbars/shiptorio"]);
  const cookie = `${login}; ${await preview()}`;
  expect((await get(env, "/api/repos", cookie)).status).toBe(200);
  expect((await get(env, "/auth/logout", cookie)).status).toBe(302);
  expect((await get(env, "/api/repos", cookie)).status).toBe(401);
});

test("prefs follow the player and only accept known short keys", async () => {
  const env = baseEnv();
  const cookie = `${await signedInCookie(env, "r3dbars")}; ${await preview()}`;
  const put = (body: string, origin = "https://shiptorio.com") => app.fetch(new Request("https://shiptorio.com/api/me/prefs", { method: "PUT", headers: { cookie, origin }, body }), env as never);
  expect((await put(JSON.stringify({ intro: "1", guideSeen: "4" }))).status).toBe(200);
  expect((await put(JSON.stringify({ anything: "x" }))).status).toBe(400);
  expect((await put(JSON.stringify({ intro: "1" }), "https://evil.example")).status).toBe(403);
  const me = await (await get(env, "/api/me", cookie)).json();
  expect(me).toMatchObject({ login: "r3dbars", allowed: true, prefs: { intro: "1", guideSeen: "4" } });
});
