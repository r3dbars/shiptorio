import { membershipCache } from "./browser-fixture";
import { expect, mock, test } from "bun:test";
import { unlimitedFactory } from "./browser-fixture";
import { makeSessionCookie } from "../src/session";
import { signedInCookie, testD1 } from "./d1-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { testApp: app } = await import("./app-fixture");
const secret = "test-repo-session", password = "test-repo-preview";
const preview = async () => (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
const baseEnv = () => ({ APP_PASSWORD: password, SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars,friend", FACTORY: unlimitedFactory, CACHE: membershipCache, DB: testD1() });
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
  const env = { ...baseEnv(), FACTORY: { idFromName: (r: string) => r, get: () => ({ securityLimit: async () => ({ allowed: true, retryAfter: 0 }), fetch: async () => new Response("factory"), runnerJobs: async () => ({ jobs: [] }) }) } };
  const mine = `${await signedInCookie(env, "r3dbars", ["r3dbars/shiptorio"])}; ${await preview()}`;
  const theirs = `${await signedInCookie(env, "friend", ["friend/app"])}; ${await preview()}`;
  expect((await get(env, "/api/repos/r3dbars/shiptorio/runner/jobs", mine)).status).toBe(200);
  expect((await get(env, "/api/repos/R3dbars/Shiptorio/runner/jobs", mine)).status).toBe(200);
  expect((await get(env, "/api/repos/r3dbars/shiptorio/runner/jobs", theirs)).status).toBe(403);
  const socket = await app.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/shiptorio/factory", { headers: { cookie: theirs, origin: "https://shiptorio.com" } }), env as never);
  expect(socket.status).toBe(403);
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

test("achievements get a bigger pref, still capped", async () => {
  const env = baseEnv();
  const cookie = `${await signedInCookie(env, "r3dbars")}; ${await preview()}`;
  const put = (body: string) => app.fetch(new Request("https://shiptorio.com/api/me/prefs", { method: "PUT", headers: { cookie, origin: "https://shiptorio.com" }, body }), env as never);
  const earned = JSON.stringify({ v: 1, got: { "first-rocket": { at: 1, repo: "r3dbars/testing" } }, streak: 1, best: 1, last: "2026-10-26" });
  expect(earned.length).toBeGreaterThan(64);
  expect((await put(JSON.stringify({ achievements: earned }))).status).toBe(200);
  expect((await put(JSON.stringify({ achievements: "x".repeat(2049) }))).status).toBe(400);
  expect((await put(JSON.stringify({ intro: "x".repeat(65) }))).status).toBe(400);
  const me = (await (await get(env, "/api/me", cookie)).json()) as { prefs: Record<string, string> };
  expect(me.prefs.achievements).toBe(earned);
});

test("admin budget usage requires a live operator session and includes daily limits", async () => {
  const env = { ...baseEnv(), ADMIN_LOGINS: "r3dbars" };
  const operator = `${await signedInCookie(env, "r3dbars", [], 11)}; ${await preview()}`;
  const player = `${await signedInCookie(env, "friend", [], 12)}; ${await preview()}`;
  expect((await get(env, "/admin?format=json", player)).status).toBe(403);
  const response = await get(env, "/admin?format=json", operator);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ limits: { calls: 200, tokens: 500000, jobs: 1 }, usage: [] });
  await env.DB.prepare("DELETE FROM sessions").run();
  expect((await get(env, "/admin", operator)).status).toBe(403);
});
test("progress follows the player, validated by the shared schema", async () => {
  const env = baseEnv();
  const cookie = `${await signedInCookie(env, "r3dbars")}; ${await preview()}`;
  const put = (body: string, origin = "https://shiptorio.com") => app.fetch(new Request("https://shiptorio.com/api/me/progress", { method: "PUT", headers: { cookie, origin }, body }), env as never);
  const { emptyProgress } = await import("@shiptorio/shared");
  const p = { ...emptyProgress(), xp: 120, streak: 2, best: 2 };
  expect((await (await get(env, "/api/me/progress", cookie)).json())).toEqual({ progress: null });
  expect((await put(JSON.stringify(p))).status).toBe(200);
  expect((await put(JSON.stringify({ v: 1, xp: "lots" }))).status).toBe(400);
  expect((await put(JSON.stringify(p), "https://evil.example")).status).toBe(403);
  const got = (await (await get(env, "/api/me/progress", cookie)).json()) as { progress: unknown };
  expect(got.progress).toMatchObject({ xp: 120, streak: 2 });
  expect((await get(env, "/api/me/progress", "")).status).toBe(401);
});
