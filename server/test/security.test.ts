import { credentialEnv } from "./credential-fixture";
import { describe, expect, it, mock } from "bun:test";
import { securityHeaders, browserMutationAllowed } from "../src/security";
import { consumeBudget, ipSubject, LIMITS, rateLimit, requestBudget, type Budget } from "../src/rate-limit";
import { makeSessionCookie } from "../src/session";
import { saveCreds } from "../src/sources/creds";
import { verifyHmac } from "../src/sources/types";
import { authorizedSocket, browserEnv } from "./browser-fixture";
import { signedInCookie, testD1 } from "./d1-fixture";

mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
const { Factory } = await import("../src/factory");

function storage() {
  const values = new Map<string, unknown>();
  let queue: Promise<unknown> = Promise.resolve();
  const tx = { get: async <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
    put: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); } };
  return { ...tx, transaction<T>(fn: (t: typeof tx) => Promise<T>): Promise<T> {
    const run = queue.then(() => fn(tx)); queue = run.catch(() => {}); return run;
  } };
}
function namespace() {
  const stores = new Map<string, ReturnType<typeof storage>>();
  return { idFromName: (id: string) => id, get: (id: string) => {
    if (!stores.has(id)) stores.set(id, storage());
    return { securityLimit: (budget: Budget) => consumeBudget(stores.get(id)!, budget) };
  } };
}
const baseEnv = () => ({ DB: testD1(), SESSION_SECRET: "security-test-session", APP_PASSWORD: "security-test-password", ALLOWED_LOGINS: "player", FACTORY: namespace() });
const request = (path: string, init?: RequestInit) => new Request(`https://shiptorio.com${path}`, init);

describe("webhook signatures", () => {
  const body = '{"title":"unicode 🔒 & <script>","n":1}';
  const secret = "test-only-webhook-secret";
  async function sign(text: string) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))).toString("hex");
  }
  it("accepts correct signatures and refuses missing secrets, wrong prefixes, altered bodies and hex lengths", async () => {
    const signature = await sign(body);
    for (const prefix of ["", "sha256="]) {
      expect(await verifyHmac(secret, body, prefix + signature, prefix)).toBe(true);
      expect(await verifyHmac(secret, body, prefix + signature.toUpperCase(), prefix)).toBe(true);
      for (const bad of [null, "", signature.slice(1), signature + "0", "g".repeat(64), prefix + "0".repeat(64), prefix + signature + "," + signature]) {
        expect(await verifyHmac(secret, body, bad, prefix)).toBe(false);
      }
      expect(await verifyHmac(undefined, body, prefix + signature, prefix)).toBe(false);
      expect(await verifyHmac(secret, body + " ", prefix + signature, prefix)).toBe(false);
      for (const index of [0, 31, 63]) {
        const changed = signature.slice(0, index) + (signature[index] === "0" ? "1" : "0") + signature.slice(index + 1);
        expect(await verifyHmac(secret, body, prefix + changed, prefix)).toBe(false);
      }
    }
    expect(await verifyHmac(secret, body, signature, "sha256=")).toBe(false);
    expect(await verifyHmac(secret, body, "sha256=" + signature)).toBe(false);
  });
  it("both HTTP routes reject unsigned/invalid deliveries before factory dispatch", async () => {
    const signature = await sign(body);
    const DB = testD1();
    await DB.prepare("INSERT INTO installations (id, account_login) VALUES (1, 'fixture')").run();
    await DB.prepare("INSERT INTO repos (full_name, installation_id, repo_id) VALUES (?, ?, ?)").bind("r3dbars/shiptorio", 1, 5001).run();
    const env = { DB, SENTRY_REPO_ID: "5001", SENTRY_INSTALLATION_ID: "1", GITHUB_WEBHOOK_SECRET: secret, SENTRY_CLIENT_SECRET: secret, CACHE: { get: async () => null } };
    for (const [path, header, prefix] of [["github", "x-hub-signature-256", "sha256="], ["sentry", "sentry-hook-signature", ""]]) {
      for (const sig of [null, "invalid", prefix + "0".repeat(64), prefix + signature.slice(1)]) {
        const res = await app.fetch(request(`/webhooks/${path}`, { method: "POST", headers: sig ? { [header]: sig } : {}, body }), env as never);
        expect(res.status).toBe(401);
      }
      const accepted = await app.fetch(request(`/webhooks/${path}`, { method: "POST", headers: { [header]: prefix + signature }, body }), env as never);
      expect(accepted.status).toBe(200); // unsupported event: authenticated, then ignored
      const changed = await app.fetch(request(`/webhooks/${path}`, { method: "POST", headers: { [header]: prefix + signature }, body: body + " " }), env as never);
      expect(changed.status).toBe(401);
    }
  });
  it("per-repo Sentry signatures are bound to their credential scope without cookie or Origin", async () => {
    const signature = await sign(body);
    const env = { DB: testD1(), CRED_MASTER_KEY: btoa("a".repeat(32)) };
    await env.DB.prepare("INSERT INTO installations (id, account_login) VALUES (1, 'fixture')").run();
    for (const [i, repo] of ["one/app", "two/app"].entries()) await env.DB.prepare("INSERT INTO repos (full_name, installation_id, repo_id) VALUES (?, ?, ?)").bind(repo, 1, i + 1).run();
    await saveCreds(env, "sentry", { clientSecret: secret }, { installationId: 1, repo: "one/app" });
    await saveCreds(env, "sentry", { clientSecret: "another-test-secret" }, { installationId: 1, repo: "two/app" });
    const send = (repo: string, sig?: string) => app.fetch(request(`/webhooks/sentry/${repo}`, { method: "POST", headers: sig ? { "sentry-hook-signature": sig } : {}, body }), env as never);
    expect((await send("one/app", signature)).status).toBe(200);
    expect((await send("one/app")).status).toBe(401);
    expect((await send("two/app", signature)).status).toBe(401);
  });
});

describe("browser origin and response policy", () => {
  it("fails closed for every cookie mutation and preserves independently authenticated transports", () => {
    for (const path of ["/connect/sentry", "/api/repos/a/b/runner/pair", "/api/future/move", "/unknown"]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        for (const origin of [undefined, "null", "https://evil.example", "http://shiptorio.com", "https://shiptorio.dev"]) {
          expect(browserMutationAllowed(request(path, { method, headers: origin ? { origin } : {} }))).toBe(false);
        }
        expect(browserMutationAllowed(request(path, { method, headers: { origin: "https://shiptorio.com" } }))).toBe(true);
        expect(browserMutationAllowed(request(path, { method, headers: { origin: "https://shiptorio.com", "sec-fetch-site": "cross-site" } }))).toBe(false);
      }
    }
    for (const path of ["/webhooks/github", "/webhooks/sentry", "/webhooks/sentry/a/b", "/api/runner/a/b/claim", "/api/runner/a/b/finish", "/api/runner/a/b/renew", "/access"]) {
      expect(browserMutationAllowed(request(path, { method: "POST" }))).toBe(true);
    }
    expect(browserMutationAllowed(request("/webhooks/github/extra", { method: "POST" }))).toBe(false);
    expect(browserMutationAllowed(request("/api/runner/a/b/not-authenticated", { method: "POST" }))).toBe(false);
  });
  it("central middleware rejects origins before parsing forms or dispatching jobs", async () => {
    const env = baseEnv();
    const cookie = [await signedInCookie(env, "player", ["a/b"], 7),
      (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")].join("; ");
    for (const path of ["/connect/sentry", "/api/repos/a/b/runner/pair", "/api/future/move"]) {
      for (const origin of [undefined, "null", "https://evil.example"]) {
        const res = await app.fetch(request(path, { method: "POST", headers: { cookie, ...(origin ? { origin } : {}) }, body: "invalid form" }), env as never);
        expect(res.status).toBe(403);
      }
    }
    expect(await makeSessionCookie(env.SESSION_SECRET, "player")).toContain("HttpOnly; Secure; SameSite=Lax");
  });
  it("covers denied gates, redirects, signed API, static HTML/assets and error responses", async () => {
    const env = { ...baseEnv(), ASSETS: { fetch: async () => new Response("<html>game</html>", { headers: { "content-type": "text/html" } }) } };
    const gate = await app.fetch(request("/"), env as never);
    const cookie = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    for (const res of [gate, await app.fetch(request("/api/version", { headers: { cookie } }), env as never),
      await app.fetch(request("/", { headers: { cookie } }), env as never),
      await app.fetch(request("/assets/app.js", { headers: { cookie } }), env as never),
      await app.fetch(new Request("http://shiptorio.com/"), env as never),
      await app.fetch(request("/webhooks/github", { method: "POST", body: "{}" }), env as never),
      await app.fetch(request("/", { headers: { cookie } }), { ...env, ASSETS: { fetch() { throw new Error("secret-upstream-error"); } } } as never)]) {
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("permissions-policy")).toContain("microphone=()");
      const csp = res.headers.get("content-security-policy")!;
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("script-src 'self';");
      expect(csp).not.toContain("unsafe-eval");
      if (res.status === 500) expect(await res.text()).not.toContain("secret-upstream-error");
    }
    expect(gate.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(securityHeaders(request("/setup"))["Content-Security-Policy"]).toContain("form-action 'self' https://github.com");
    expect(securityHeaders(request("/art/prototype.html"), "testnonce")["Content-Security-Policy"]).toContain("'nonce-testnonce'");
  });

  it("preserves native admin form Origin while retaining strict CSRF checks and off-site privacy", () => {
    for (const path of ["/runner/pair", "/admin/signup", "/admin/signup?login=r3dbars"]) {
      expect(securityHeaders(request(path))["Referrer-Policy"]).toBe("same-origin");
    }
    for (const path of ["/", "/admin", "/admin/signup/extra", "/api/repos/a/b/limits"]) {
      expect(securityHeaders(request(path))["Referrer-Policy"]).toBe("no-referrer");
    }
    for (const origin of [undefined, "null", "https://evil.example"]) {
      expect(browserMutationAllowed(request("/admin/signup", { method: "POST", headers: origin ? { origin } : {} }))).toBe(false);
    }
    expect(browserMutationAllowed(request("/admin/signup", { method: "POST", headers: { origin: "https://shiptorio.com" } }))).toBe(true);
  });

  it("caches public hashed judge assets; pages, gates and misses stay no-store", async () => {
    const env = { ...baseEnv(), ASSETS: { fetch: async (r: Request) => new URL(r.url).pathname === "/assets/gone.js" ? new Response("", { status: 404 }) : new Response("x") } };
    const cookie = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    const get = (path: string, withCookie = true) => app.fetch(request(path, withCookie ? { headers: { cookie } } : {}), env as never);
    expect((await get("/assets/app-abc12345.js")).headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect((await get("/assets/app-abc12345.js", false)).headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect((await get("/assets/gone.js")).headers.get("cache-control")).toBe("no-store");
    expect((await get("/")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("durable per-IP and per-user rate limits", () => {
  it("serializes concurrent increments, survives new instances, resets and keeps budget classes independent", async () => {
    const store = storage();
    const results = await Promise.all(Array.from({ length: 25 }, () => consumeBudget(store, "auth", 1000)));
    expect(results.filter(r => r.allowed)).toHaveLength(20);
    expect(await consumeBudget(store, "auth", 2000)).toEqual({ allowed: false, retryAfter: 59 });
    expect(await consumeBudget(store, "connect", 2000)).toEqual({ allowed: true, retryAfter: 0 });
    const reloaded = new Factory({ storage: store } as never, credentialEnv({}) as never);
    const realNow = Date.now; Date.now = () => 2000;
    try { expect((await reloaded.securityLimit("auth")).allowed).toBe(false); } finally { Date.now = realNow; }
    expect((await consumeBudget(store, "auth", 61000)).allowed).toBe(true);
  });
  it("shares each identity across routes and hashes stored identifiers", async () => {
    const env = baseEnv();
    for (let n = 0; n < LIMITS.auth; n++) expect((await rateLimit(env as never, "ip:192.0.2.1", "auth")).allowed).toBe(true);
    expect((await rateLimit(env as never, "ip:192.0.2.1", "auth")).allowed).toBe(false);
    expect((await rateLimit(env as never, "ip:192.0.2.2", "auth")).allowed).toBe(true);
    expect(ipSubject(request("/", { headers: { "x-forwarded-for": "spoofed" } }))).toBe("ip:unknown");
    expect(requestBudget(request("/api/repos/a/b/factory"))).toBe("socket");
    expect(requestBudget(request("/connect/sentry"))).toBe("connect");
    expect(requestBudget(request("/api/repos/a/b/runner/pair", { method: "POST" }))).toBe("move");
  });
  it("stops anonymous password guesses with 429 and Retry-After before password verification", async () => {
    const env = baseEnv();
    const send = (ip: string, password = "wrong") => app.fetch(request("/access", { method: "POST", headers: { origin: "https://shiptorio.com", "cf-connecting-ip": ip }, body: new URLSearchParams({ password }) }), env as never);
    for (let n = 0; n < 20; n++) expect((await send("192.0.2.1")).status).toBe(401);
    const denied = await send("192.0.2.1", env.APP_PASSWORD);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(denied.headers.get("content-security-policy")).toContain("frame-ancestors");
    expect((await send("192.0.2.2", env.APP_PASSWORD)).status).toBe(303);
  });
  it("limits a signed-in user across changing IPs before connecting credentials", async () => {
    const env = baseEnv();
    const cookie = await signedInCookie(env, "player", [], 7);
    for (let n = 0; n < 30; n++) await rateLimit(env as never, "user:7", "connect");
    const res = await app.fetch(request("/connect/sentry", { method: "POST", headers: { cookie, "cf-connecting-ip": "192.0.2.99", origin: "https://shiptorio.com" }, body: "clientSecret=sample" }), env as never);
    expect(res.status).toBe(429);
  });
  it("encoded route aliases share the router's canonical budget", async () => {
    const env = baseEnv();
    const cookie = [await signedInCookie(env, "player", ["a/b"], 7),
      (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")].join("; ");
    for (const budget of ["auth", "connect", "socket", "move"] as const) {
      for (let n = 0; n < LIMITS[budget]; n++) await rateLimit(env as never, "user:7", budget);
    }
    for (const [path, method] of [["/%61uth/login", "GET"], ["/%63onnect/sentry?repo=a/b", "GET"], ["/%61pi/repos/a/b/factory", "GET"], ["/%61pi/repos/a/b/runner/pair", "POST"]]) {
      const res = await app.fetch(request(path, { method, headers: { cookie, origin: "https://shiptorio.com" } }), env as never);
      expect(res.status).toBe(429);
    }
  });
  it("throttles websocket moves across connections before state loading or action dispatch", async () => {
    for (const subject of ["user:test-player", "ip:192.0.2.1"]) {
      const env = { ...browserEnv, FACTORY: namespace() };
      for (let n = 0; n < LIMITS.move; n++) await rateLimit(env as never, subject, "move");
      const f = new Factory({ storage: { get() { throw new Error("Rate-limited move reached state"); } } } as never, credentialEnv(env) as never);
      for (let n = 0; n < 2; n++) {
        const socket = authorizedSocket();
        socket.serializeAttachment({ ...socket.deserializeAttachment(), rateSubject: "ip:192.0.2.1" });
        let closed = false;
        socket.close = (code?: number) => { expect(code).toBe(1008); closed = true; };
        await f.webSocketMessage(socket, JSON.stringify({ type: "choose_move", moveId: "card", optionId: "go" }));
        expect(closed).toBe(true);
      }
    }
  });
});


it("wrapped and fast-path preview gates retain the nonce policy for their only inline script", async () => {
  const { accessFastPath } = await import("../src/index");
  const responses = [
    await app.fetch(request("/runner/pair"), baseEnv() as never),
    await accessFastPath(request("/access"), baseEnv() as never),
  ];
  for (const response of responses) {
    expect(response).not.toBeNull();
    const html = await response!.text();
    const nonce = html.match(/<script nonce="([^"]+)"/)?.[1];
    expect(nonce).toBeTruthy();
    const policy = response!.headers.get("content-security-policy")!;
    expect(policy).toContain(`script-src 'nonce-${nonce}'`);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(response!.headers.get("x-content-type-options")).toBe("nosniff");
  }
});
