import { expect, mock, test } from "bun:test";
import { makeSessionCookie } from "../src/session";
import { securityHeaders } from "../src/security";
import { signedInCookie, testD1 } from "./d1-fixture";
import { membershipCache, unlimitedFactory } from "./browser-fixture";

mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
const { accessFastPath } = await import("../src/index");
const origin = "https://shiptorio.com";

function expectHeaders(response: Response, path: string) {
  expect(response.headers.get("content-type")).toContain("text/html");
  const csp = response.headers.get("content-security-policy")!;
  for (const directive of ["default-src 'none'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "script-src-attr 'none'"]) {
    expect(csp, path).toContain(directive);
  }
  expect(csp, path).not.toContain("unsafe-eval");
  expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
  expect(response.headers.get("x-frame-options"), path).toBe("DENY");
  expect(response.headers.get("referrer-policy"), path).toBe(["/runner/pair", "/admin/signup"].includes(path) ? "same-origin" : "no-referrer");
  expect(response.headers.get("strict-transport-security"), path).toBe("max-age=31536000");
}

async function fixture() {
  const env = {
    DB: testD1(), SESSION_SECRET: "headers-test-session", APP_PASSWORD: "headers-test-preview",
    SELFHOST_SETUP: "1", ALLOWED_LOGINS: "r3dbars", ADMIN_LOGINS: "r3dbars", CRED_MASTER_KEY: btoa("h".repeat(32)),
    CACHE: { ...membershipCache, list: async () => ({ keys: [] }) }, FACTORY: { ...unlimitedFactory, get: () => ({ ...unlimitedFactory.get(), setRepositoryId: async () => {}, accountConnectionStatus: async () => ({ paired: false }), connectSupport: async () => {} }) },
    ASSETS: { fetch: async () => new Response("<!doctype html><html><head></head><body>fixture</body></html>", { headers: { "content-type": "text/html; charset=utf-8" } }) },
  };
  const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
  const cookie = `${preview}; ${await signedInCookie(env, "r3dbars", ["example/shop"], 61)}`;
  return { env, cookie, preview };
}

test("public HTML, docs, legal, signup and authenticated HTML retain the central headers", async () => {
  const { env, cookie, preview } = await fixture();
  // Each independently returned HTML surface: static assets, public early returns,
  // auth/setup, account, mine, pairing and operator route handlers.
  const cases: [string, string, number][] = [
    ["/", "", 200], ["/judge", "", 200], ["/judge/", "", 200],
    ["/welcome/index.html", "", 200], ["/docs", "", 200], ["/docs/security", "", 200],
    ["/privacy", "", 200], ["/terms", "", 200],
    ["/?source=sim", preview, 200], ["/setup", preview, 200],
    ["/settings", cookie, 200], ["/runner/pair", cookie, 400],
    ["/runner/pair?code=ABCD-EFAB-1234", cookie, 200],
    ["/connect/sentry?repo=example/shop", cookie, 200],
    ["/connect/posthog?repo=example/shop", cookie, 200],
    ["/connect/support?repo=example/shop", cookie, 200],
    ["/admin", cookie, 200], ["/admin/signup", cookie, 200], ["/admin/flags", cookie, 200],
  ];
  for (const [path, auth, status] of cases) {
    const response = await app.fetch(new Request(origin + path, { headers: auth ? { cookie: auth } : {} }), env);
    expect(response.status, path).toBe(status);
    expectHeaders(response, new URL(origin + path).pathname);
  }
  for (const path of ["/auth/login", "/waitlist", "/?source=sim"]) {
    const response = await app.fetch(new Request(origin + path), { ...env, SIGNUP_GATE_MODE: "waitlist" });
    expect(response.status, path).toBe(200);
    expectHeaders(response, new URL(origin + path).pathname);
  }
});

test("wrapped and fast-path gate HTML keeps a fresh matching script nonce and all headers (#260)", async () => {
  const { env } = await fixture();
  const responses = [
    await app.fetch(new Request(origin + "/runner/pair"), env),
    await accessFastPath(new Request(origin + "/access"), env as never),
    await accessFastPath(new Request(origin + "/access"), env as never),
  ];
  const nonces = new Set<string>();
  for (const [index, response] of responses.entries()) {
    expect(response).not.toBeNull();
    expect(response!.status).toBe(index === 0 ? 401 : 200);
    expectHeaders(response!, index === 0 ? "/runner/pair" : "/access");
    const html = await response!.text();
    const nonce = html.match(/<script nonce="([a-f0-9]{32})"/)?.[1];
    expect(nonce).toBeTruthy();
    nonces.add(nonce!);
    const csp = response!.headers.get("content-security-policy")!;
    expect(csp).toContain(`script-src 'nonce-${nonce}';`);
    expect(csp).not.toContain("script-src 'self'");
  }
  expect(nonces.size).toBe(responses.length);
});

test("HSTS is HTTPS-only, including local development", () => {
  for (const url of ["http://localhost:8787", "http://127.0.0.1:8787", "http://shiptorio.com"]) {
    expect(securityHeaders(new Request(url))["Strict-Transport-Security"]).toBeUndefined();
  }
  expect(securityHeaders(new Request(origin))["Strict-Transport-Security"]).toBe("max-age=31536000");
});
