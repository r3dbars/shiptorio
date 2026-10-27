import { expect, mock, test } from "bun:test";
import { makeSessionCookie } from "../src/session";
import { signedInCookie, testD1 } from "./d1-fixture";
import { membershipCache } from "./browser-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { testApp: app } = await import("./app-fixture");
const secret = "test-empire-session", password = "test-empire-preview";
const preview = async () => (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
const get = (env: object, cookie: string) => app.fetch(new Request("https://shiptorio.com/api/empire", { headers: { cookie } }), env as never);

const island = (repo: string, waiting: number) => ({
  repo, ready: true, rockets: 4, launches: 2, automated: 0.5, waiting, inFlight: 1,
  bottleneck: null, districts: [{ name: "web", files: 9 }], permits: [], research: [], updatedAt: 1,
});

test("the empire lists one island per repo the player can reach, and never anyone else's", async () => {
  const asked: string[] = [];
  const env = {
    APP_PASSWORD: password, SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars,friend", DB: testD1(), CACHE: membershipCache,
    FACTORY: {
      idFromName: (r: string) => r,
      get: (r: string) => ({ summary: async () => (asked.push(r), r === "repo:1" ? island("r3dbars/shiptorio", 2) : null) }),
    },
  };
  const mine = `${await signedInCookie(env, "r3dbars", ["r3dbars/shiptorio", "r3dbars/testing"])}; ${await preview()}`;
  await signedInCookie(env, "friend", ["friend/secret-app"]);
  const res = await get(env, mine);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { islands: { repo: string; ready: boolean; waiting: number }[] };
  expect(body.islands.map((i) => [i.repo, i.ready, i.waiting])).toEqual([["r3dbars/shiptorio", true, 2], ["r3dbars/testing", false, 0]]);
  expect(asked).not.toContain("friend/secret-app");
});

test("the empire rechecks access before resolving factories from stale sign-in reach", async () => {
  const asked: string[] = [];
  const env = {
    APP_PASSWORD: password, SESSION_SECRET: secret, ALLOWED_LOGINS: "friend", DB: testD1(),
    CACHE: { ...membershipCache, get: async (key: string) => key.includes(":owner/allowed:") ? { expiresAt: Date.now() + 59000 } : null },
    FACTORY: { idFromName: (name: string) => name, get: (name: string) => ({
      summary: async () => { asked.push(name); return island("owner/allowed", 2); },
    }) },
  };
  const cookie = `${await signedInCookie(env, "friend", ["owner/allowed", "owner/revoked"])}; ${await preview()}`;
  // Stale membership rows still list both repos; without a current grant the
  // GitHub refresh fails closed (including provider outages and lost access).
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("GitHub unavailable"); }) as typeof fetch;
  try {
    const response = await get(env, cookie);
    expect(response.status).toBe(200);
    expect((await response.json() as { islands: { repo: string }[] }).islands.map(i => i.repo)).toEqual(["owner/allowed"]);
    expect(asked).toEqual(["repo:1"]);
  } finally { globalThis.fetch = original; }
});

test("the empire needs a signed-in player", async () => {
  const env = { APP_PASSWORD: password, SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars", DB: testD1() };
  expect((await get(env, await preview())).status).toBe(401);
});
