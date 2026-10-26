import { requireUser } from "../src/authorization";
import { fixtureUser, authorizedDB, membershipCache } from "./browser-fixture";
import { expect, it, mock } from "bun:test";
import { fakeGitHub } from "../src/sources/github";
import { pairToken, readRunnerToken } from "../src/runner-auth";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { testApp: app } = await import("./app-fixture");

it("runner transport authenticates independently without opening the preview or other repos", async () => {
  let claims = 0;
  const env = { SESSION_SECRET: "test-session-secret", APP_PASSWORD: "preview-password", ALLOWED_LOGINS: "test-player", CACHE: membershipCache, DB: { prepare: () => ({ bind: () => ({ first: async () => ({ installation_id: 1, id: 1, login: "test-player", enabled:1, runs_daily:20, count:1 }) }) }) }, FACTORY: { idFromName: (repo: string) => repo, get: () => ({ securityLimit: async () => ({ allowed: true, retryAfter: 0 }), isRunnerPaired: async (pair: string) => pair === "pair-1", claimRunner: async (pair: string) => { expect(pair).toBe("pair-1"); claims++; return null; } }) } };
  const token = await pairToken(env.SESSION_SECRET, { repo: "r3dbars/shiptorio", pairId: "pair-1", user: fixtureUser(), expires: Date.now() + 10000 });
  const send = (repo: string, bearer = token) => app.fetch(new Request(`https://shiptorio.com/api/runner/${repo}/claim`, { method: "POST", headers: { authorization: `Bearer ${bearer}` }, body: JSON.stringify({ harnesses: ["codex"] }) }), env as never);
  expect((await send("r3dbars/shiptorio", "forged")).status).toBe(401);
  expect((await send("r3dbars/other")).status).toBe(401);
  expect((await send("r3dbars/shiptorio")).status).toBe(200);
  expect(claims).toBe(1);
  const renewal = await app.fetch(new Request("https://shiptorio.com/api/runner/r3dbars/shiptorio/renew", { method: "POST", headers: { authorization: `Bearer ${token}` } }), env as never);
  expect(renewal.status).toBe(200);
  const renewed = await renewal.json() as { token: string };
  expect((await readRunnerToken(env.SESSION_SECRET, renewed.token))?.pairId).toBe("pair-1");
  const revoked = await pairToken(env.SESSION_SECRET, { repo: "r3dbars/shiptorio", pairId: "revoked", user: fixtureUser(), expires: Date.now() + 10000 });
  expect((await app.fetch(new Request("https://shiptorio.com/api/runner/r3dbars/shiptorio/renew", { method: "POST", headers: { authorization: `Bearer ${revoked}` } }), env as never)).status).toBe(401);
  expect((await app.fetch(new Request("https://shiptorio.com/api/repos/r3dbars/shiptorio/runner/pair", { method: "POST" }), env as never)).status).toBe(401);
  expect((await app.fetch(new Request("https://shiptorio.com/", { headers: { authorization: `Bearer ${token}` } }), env as never)).status).toBe(401);
});

it("authenticates, durably enqueues before 202, and deduplicates completed deliveries", async () => {
  const rows = new Map<string, { state: string }>();
  const queued: string[] = [];
  const pending: Promise<unknown>[] = [];
  const env = {
    GITHUB_WEBHOOK_SECRET: "fake-intake-signing-secret",
    DB: { prepare: (sql: string) => {
      let values: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => { values = args; return statement; },
        run: async () => {
          if (!sql.startsWith("INSERT")) return { meta: { changes: 0 } };
          const id = String(values[0]);
          const existed = rows.has(id);
          if (!existed) rows.set(id, { state: "pending" });
          return { meta: { changes: existed ? 0 : 1 } };
        },
        first: async () => sql.includes("signup_counters") ? { count: 1 } : rows.get(String(values[0])) ?? null,
      };
      return statement;
    } },
    FACTORY: { idFromName: (repo: string) => repo, get: () => ({ enqueueGitHub: async (id: string) => { queued.push(id); } }) },
  };
  const raw = JSON.stringify(fakeGitHub());
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.GITHUB_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = "sha256=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const send = (sig = signature, id = "fake-delivery-1", body = raw) => app.fetch(new Request("https://shiptorio.com/webhooks/github", { method: "POST", headers: { "x-hub-signature-256": sig, "x-github-event": "issues", "x-github-delivery": id }, body }), env as never, { waitUntil: (p: Promise<unknown>) => pending.push(p) } as never);
  expect((await send("sha256=" + "0".repeat(64))).status).toBe(401);
  expect(queued).toHaveLength(0);
  const first = await send();
  expect(first.status).toBe(202);
  expect(queued).toEqual(["fake-delivery-1"]);
  rows.get("fake-delivery-1")!.state = "done";
  const duplicate = await send();
  expect(duplicate.status).toBe(200);
  expect(await duplicate.json()).toEqual({ ok: true, duplicate: true });
  expect(queued).toHaveLength(1);
  expect((await send(signature, "")).status).toBe(400);
  expect((await send(signature, "fake-2", "{}")).status).toBe(401);
  await Promise.all(pending);
});

it("upgrades remote HTTP before authentication and sets HSTS on HTTPS gate responses", async () => {
  const env = { SIGNUP_GATE_MODE: "password", APP_PASSWORD: "test-preview", SESSION_SECRET: "test-secret" };
  const insecure = await app.fetch(new Request("http://shiptorio.com/"), env as never);
  expect(insecure.status).toBe(308);
  expect(insecure.headers.get("location")).toBe("https://shiptorio.com/");
  const secure = await app.fetch(new Request("https://shiptorio.com/"), env as never);
  expect(secure.status).toBe(401);
  expect(secure.headers.get("strict-transport-security")).toBe("max-age=31536000");
  const local = await app.fetch(new Request("http://localhost/"), env as never);
  expect(local.status).toBe(401);
  expect(local.headers.has("location")).toBe(false);
  expect(local.headers.has("strict-transport-security")).toBe(false);
});

it("runner revoke is a same-origin signed-in web action and invalidates renewal", async () => {
  const { browserCookies, browserEnv } = await import("./browser-fixture");
  const { testD1, signedInCookie } = await import("./d1-fixture");
  let paired = true;
  const env = { ...browserEnv, CACHE: membershipCache, DB: testD1(), FACTORY: { idFromName: (s: string) => s, get: () => ({ securityLimit: async () => ({ allowed: true, retryAfter: 0 }), revokeRunner: async () => { paired = false; }, isRunnerPaired: async () => paired }) } };
  const url = "https://shiptorio.com/api/repos/r3dbars/shiptorio/runner/revoke";
  const cookie = await signedInCookie(env, "test-player", ["r3dbars/shiptorio"]) + "; " + (await browserCookies()).split("; ")[1];
  expect((await app.fetch(new Request(url, { method: "POST", headers: { cookie, origin: "https://evil.example" } }), env as never)).status).toBe(403);
  expect(paired).toBe(true);
  expect((await app.fetch(new Request(url, { method: "POST", headers: { cookie, origin: "https://shiptorio.com" } }), env as never)).status).toBe(200);
  expect(paired).toBe(false);
  const token = await pairToken(env.SESSION_SECRET, { repo: "r3dbars/shiptorio", pairId: "old", expires: Date.now() + 60000, user: (await requireUser(new Request(url, { headers: { cookie } }), env as never))! });
  expect((await app.fetch(new Request("https://shiptorio.com/api/runner/r3dbars/shiptorio/renew", { method: "POST", headers: { authorization: `Bearer ${token}` } }), env as never)).status).toBe(401);
});
