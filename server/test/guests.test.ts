import { afterEach, expect, mock, test } from "bun:test";
import { emptyProgress } from "@shiptorio/shared";
import { createGuest, currentGuest, guestCookie, GUEST_TTL, mergeGuest, sweepGuests, touchGuest, writeGuestPrefs, writeGuestProgress } from "../src/guests";
import { currentUser, readPrefs, readProgress, upsertUser, writePrefs, writeProgress } from "../src/accounts";
import { makeSessionCookie } from "../src/session";
import { testD1 } from "./d1-fixture";
import { unlimitedFactory } from "./browser-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { testApp: app } = await import("./app-fixture");
const { authCallback } = await import("../src/auth");
const { default: worker } = await import("../src/index");
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const environment = () => ({ DB: testD1(), SESSION_SECRET: "guest-test-secret", APP_PASSWORD: "guest-test-preview", ALLOWED_LOGINS: "player", FACTORY: unlimitedFactory, CACHE: { get: async () => null, put: async () => {} } });
const access = async (env: ReturnType<typeof environment>) => (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
function req(path: string, cookie = "", method = "GET", body?: string, origin = "https://shiptorio.com") {
  return new Request(`https://shiptorio.com${path}`, { method, headers: { cookie, origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.8" }, body });
}
async function browser(env: ReturnType<typeof environment>) {
  const preview = await access(env);
  const response = await app.fetch(req("/api/me", preview), env);
  expect(response.status).toBe(200);
  const header = response.headers.get("set-cookie")!;
  return { cookie: `${preview}; ${header.split(";")[0]}`, header, response };
}
const progress = (xp = 17) => ({ ...emptyProgress(), xp });

test("first visit creates only an isolated signed guest save; reload retains progress and preferences", async () => {
  const env = environment(); let outbound = 0;
  globalThis.fetch = (async () => { outbound++; throw Error("guest must not fetch a provider"); }) as unknown as typeof fetch;
  const first = await browser(env);
  expect(await first.response.json()).toEqual({ login: null, guest: true, allowed: false, prefs: {}, installUrl: null });
  for (const part of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) expect(first.header).toContain(part);
  expect(await currentUser(env, first.cookie)).toBeNull();
  expect((await app.fetch(req("/api/me/progress", first.cookie, "PUT", JSON.stringify(progress())), env)).status).toBe(200);
  expect((await app.fetch(req("/api/me/prefs", first.cookie, "PUT", JSON.stringify({ intro: "seen", guideSeen: "yes" })), env)).status).toBe(200);
  expect(await (await app.fetch(req("/api/me/progress", first.cookie), env)).json()).toEqual({ progress: progress(), resetVersion: 0 });
  expect(((await (await app.fetch(req("/api/me", first.cookie), env)).json()) as { prefs: unknown }).prefs).toEqual({ intro: "seen", guideSeen: "yes" });
  expect((await env.DB.prepare("SELECT count(*) n FROM guests").first<{ n: number }>())?.n).toBe(1);
  expect((await env.DB.prepare("SELECT count(*) n FROM users").first<{ n: number }>())?.n).toBe(0);
  expect(outbound).toBe(0);
});

test("preview password still gates guest creation; cookie tampering and cross-origin writes fail", async () => {
  const env = environment();
  expect((await app.fetch(req("/api/me"), env)).status).toBe(401);
  const crossSite = req("/api/me", await access(env));
  crossSite.headers.set("sec-fetch-site", "cross-site");
  expect((await app.fetch(crossSite, env)).status).toBe(403);
  expect((await env.DB.prepare("SELECT count(*) n FROM guests").first<{ n: number }>())?.n).toBe(0);
  const first = await browser(env);
  const tampered = first.cookie.replace(/.$/, c => c === "0" ? "1" : "0");
  expect(await currentGuest(env, tampered)).toBeNull();
  expect((await app.fetch(req("/api/me/progress", tampered, "PUT", JSON.stringify(progress())), env)).status).toBe(401);
  expect((await app.fetch(req("/api/me/progress", first.cookie, "PUT", JSON.stringify(progress()), "https://evil.example"), env)).status).toBe(403);
  expect((await app.fetch(req("/api/me/progress", first.cookie, "PUT", '{"xp":17}'), env)).status).toBe(400);
  expect((await app.fetch(req("/api/me/prefs", first.cookie, "PUT", '{"admin":"yes"}'), env)).status).toBe(400);
  expect((await app.fetch(req("/api/me/progress", first.cookie, "PUT", JSON.stringify({ ...progress(), padding: "雪".repeat(12000) })), env)).status).toBe(413);
});

test("guest cannot call real repo, Spark, runner or connector paths or disclose another save", async () => {
  const env = environment(), first = await browser(env), second = await browser(env);
  let outbound = 0;
  globalThis.fetch = (async () => { outbound++; throw Error("guest must not fetch a provider"); }) as unknown as typeof fetch;
  for (const [path, method] of [["/api/repos", "GET"], ["/api/repos/player/repo/factory", "GET"], ["/api/repos/player/repo/runner/jobs", "GET"], ["/api/repos/player/repo/runner/enqueue", "POST"], ["/api/sources?repo=player/repo", "GET"], ["/connect/sentry?repo=player/repo", "GET"], ["/runner/pair", "GET"]]) {
    const response = await app.fetch(req(path, first.cookie, method), env);
    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe("github_signin_required");
  }
  await app.fetch(req("/api/me/progress", first.cookie, "PUT", JSON.stringify(progress(33))), env);
  const exported = await (await app.fetch(req("/api/account/export?guest=other", second.cookie), env)).json() as { guest: boolean; progress: unknown };
  expect(exported.guest).toBe(true);
  expect(exported.progress).toBeNull();
  expect(outbound).toBe(0);
});

test("guest creation uses the existing per-IP limiter", async () => {
  const env = environment(), preview = await access(env);
  for (let i = 0; i < 10; i++) expect((await app.fetch(req("/api/me", preview), env)).status).toBe(200);
  expect((await app.fetch(req("/api/me", preview), env)).status).toBe(429);
  expect((await env.DB.prepare("SELECT count(*) n FROM guests").first<{ n: number }>())?.n).toBe(10);
});

test("guest inactivity expires at 30 days and only stale records are swept; touches are throttled", async () => {
  const env = environment(), now = Date.now();
  const expired = await createGuest(env, now - GUEST_TTL), fresh = await createGuest(env, now);
  expect(await currentGuest(env, await guestCookie(env, expired.id), now)).toBeNull();
  expect(await touchGuest(env, fresh, now + 1000)).toBe(false);
  expect(await touchGuest(env, fresh, now + 7 * 3600000)).toBe(true);
  expect(await touchGuest(env, fresh, now + 7 * 3600000)).toBe(false);
  await worker.scheduled({} as never, env as never);
  expect(await currentGuest(env, await guestCookie(env, fresh.id), now)).not.toBeNull();
  expect((await env.DB.prepare("SELECT count(*) n FROM guests").first<{ n: number }>())?.n).toBe(1);
});

test("account import consumes a guest once and preserves existing account progress and preferences", async () => {
  const env = environment(), user = { id: 42, login: "player" };
  await upsertUser(env, user);
  const guest = await createGuest(env), cookie = await guestCookie(env, guest.id);
  await writeGuestProgress(env, guest, JSON.stringify(progress(20)));
  await writeGuestPrefs(env, guest, { intro: "guest", guideSeen: "yes" });
  await Promise.all([mergeGuest(env, cookie, user), mergeGuest(env, cookie, user)]);
  expect(await readProgress(env, user)).toEqual(progress(20));
  expect(await readPrefs(env, user)).toEqual({ intro: "guest", guideSeen: "yes" });
  expect(await currentGuest(env, cookie)).toBeNull();
  const another = await createGuest(env), next = await guestCookie(env, another.id);
  await writeGuestProgress(env, another, JSON.stringify(progress(99)));
  await writeGuestPrefs(env, another, { intro: "replacement" });
  await writeProgress(env, user, JSON.stringify(progress(45)));
  await writePrefs(env, user, { intro: "account" });
  await mergeGuest(env, next, user);
  expect(await readProgress(env, user)).toEqual(progress(45));
  expect((await readPrefs(env, user)).intro).toBe("account");
  expect(await currentGuest(env, next)).toBeNull();
});

test("real OAuth callback imports the guest and remains idempotent on a repeated callback", async () => {
  const env = environment(), guest = await createGuest(env), cookie = await guestCookie(env, guest.id);
  await writeGuestProgress(env, guest, JSON.stringify(progress(28)));
  await writeGuestPrefs(env, guest, { intro: "complete" });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fixture-oauth-guest" });
    if (url === "https://api.github.com/user") return Response.json({ id: 51, login: "player" });
    if (url.includes("/user/installations")) return Response.json({ installations: [] });
    throw Error(`unexpected provider path ${new URL(url).pathname}`);
  }) as unknown as typeof fetch;
  const url = new URL("https://shiptorio.com/auth/callback?code=fixture&state=state");
  const request = new Request(url, { headers: { cookie: `${cookie}; shiptorio_oauth_state=state` } });
  const first = await authCallback(request, url, env as never);
  expect(first.status).toBe(302);
  expect(first.headers.get("set-cookie")).toContain("shiptorio_guest=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  expect(await readProgress(env, { id: 51, login: "player" })).toEqual(progress(28));
  await writeProgress(env, { id: 51, login: "player" }, JSON.stringify(progress(40)));
  const repeat = await authCallback(request, url, env as never);
  expect(repeat.status).toBe(302);
  expect(await readProgress(env, { id: 51, login: "player" })).toEqual(progress(40));
  expect((await env.DB.prepare("SELECT count(*) n FROM guests").first<{ n: number }>())?.n).toBe(0);
});

test("guest export and deletion cover only the authenticated sample save", async () => {
  const env = environment(), first = await browser(env), second = await browser(env);
  await app.fetch(req("/api/me/progress", first.cookie, "PUT", JSON.stringify(progress(16))), env);
  const exported = await (await app.fetch(req("/api/account/export", first.cookie), env)).json() as { progress: unknown };
  expect(exported.progress).toEqual(progress(16));
  expect(exported).not.toHaveProperty("factories");
  const response = await app.fetch(req("/api/account/delete", first.cookie, "POST", "confirm=delete&guest=other"), env);
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await currentGuest(env, first.cookie)).toBeNull();
  expect(await currentGuest(env, second.cookie)).not.toBeNull();
});


test("guest progress and preference writes share the existing IP move budget", async () => {
  let moves = 0;
  const env = { ...environment(), FACTORY: { idFromName: (name: string) => name,
    get: () => ({ securityLimit: async (budget = "move") => ({ allowed: budget !== "move" || ++moves <= 2, retryAfter: 60 }) }) } };
  const first = await browser(env);
  expect((await app.fetch(req("/api/me/progress", first.cookie, "PUT", JSON.stringify(progress())), env)).status).toBe(200);
  expect((await app.fetch(req("/api/me/prefs", first.cookie, "PUT", JSON.stringify({ intro: "seen" })), env)).status).toBe(200);
  const limited = await app.fetch(req("/api/me/progress", first.cookie, "PUT", JSON.stringify(progress(30))), env);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
  expect(moves).toBe(3);
  const guest = await currentGuest(env, first.cookie);
  expect(guest?.save.progress).toEqual(progress());
});
