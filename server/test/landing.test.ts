import { describe, expect, it } from "bun:test";
import { previewAccess, publicRoute } from "../src/access";
import { joinWaitlist } from "../src/waitlist";

const env = { APP_PASSWORD: "test-preview-password", SESSION_SECRET: "test-session-secret" };
const at = (path: string, init?: RequestInit) => new Request(`https://shiptorio.com${path}`, init);

async function previewCookie() {
  const response = await previewAccess(at("/access", { method: "POST", headers: { origin: "https://shiptorio.com" }, body: new URLSearchParams({ password: env.APP_PASSWORD }) }), env);
  return response!.headers.get("set-cookie")!.split(";")[0];
}

describe("public landing page", () => {
  it("shows the landing page at / to visitors and the app to preview players", async () => {
    expect(await publicRoute(at("/"), env)).toBe("landing");
    expect(await publicRoute(at("/?source=sim"), env)).toBe("landing");
    expect(await publicRoute(at("/"), { SESSION_SECRET: "" })).toBe("landing");
    expect(await publicRoute(at("/", { headers: { cookie: await previewCookie() } }), env)).toBeNull();
    expect(await publicRoute(new Request("http://localhost/"), { ...env, DEV_LOGIN: "r3dbars" })).toBeNull();
  });
  it("opens only the landing files and the waitlist; the app stays gated", async () => {
    for (const path of ["/welcome/", "/welcome/loop.mp4", "/welcome/index.html", "/robots.txt", "/sitemap.xml"]) expect(await publicRoute(at(path), env)).toBe("file");
    expect(await publicRoute(at("/api/waitlist", { method: "POST" }), env)).toBe("waitlist");
    for (const path of ["/index.html", "/assets/app.js", "/api/me", "/api/waitlist", "/setup", "/art/", "/welcome/../index.html", "/welcome/a/b"]) {
      expect(await publicRoute(at(path), env)).toBeNull();
    }
    expect(await publicRoute(at("/", { method: "POST" }), env)).toBeNull();
  });
  it("sends the landing page's Enter link through the password form straight to next", async () => {
    const page = await (await previewAccess(at("/access?next=%2F"), env))!.text();
    expect(page).toContain('name="next" value="/"');
  });
});

function kv() {
  const store = new Map<string, string>();
  return { store, CACHE: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) } as unknown as KVNamespace };
}
const join = (body: unknown, headers: Record<string, string> = {}) =>
  at("/api/waitlist", { method: "POST", headers: { "content-type": "application/json", origin: "https://shiptorio.com", "cf-connecting-ip": "1.2.3.4", ...headers }, body: JSON.stringify(body) });

describe("waitlist", () => {
  it("stores a valid email once", async () => {
    const env = kv();
    expect((await joinWaitlist(join({ email: " Dana@Example.com " }), env)).status).toBe(200);
    expect((await joinWaitlist(join({ email: "dana@example.com" }), env)).status).toBe(200);
    const saved = JSON.parse(env.store.get("waitlist:email:dana@example.com")!);
    expect(saved.email).toBe("dana@example.com");
    expect([...env.store.keys()].filter((k) => k.startsWith("waitlist:email:"))).toHaveLength(1);
  });
  it("rejects bad emails, foreign origins, and silently drops honeypot bots", async () => {
    const env = kv();
    expect((await joinWaitlist(join({ email: "nope" }), env)).status).toBe(400);
    expect((await joinWaitlist(join({ email: "a@b.co" }, { origin: "https://evil.example" }), env)).status).toBe(403);
    expect((await joinWaitlist(join({ email: "bot@b.co", website: "spam" }), env)).status).toBe(200);
    expect(env.store.has("waitlist:email:bot@b.co")).toBe(false);
    expect(env.store.has("waitlist:email:a@b.co")).toBe(false);
  });
  it("limits one address to a few tries an hour", async () => {
    const env = kv();
    for (let i = 0; i < 5; i++) expect((await joinWaitlist(join({ email: `p${i}@b.co` }), env)).status).toBe(200);
    expect((await joinWaitlist(join({ email: "p9@b.co" }), env)).status).toBe(429);
  });
  it("works without JavaScript: a form post comes back to the page", async () => {
    const response = await joinWaitlist(at("/api/waitlist", { method: "POST", headers: { origin: "https://shiptorio.com", "content-type": "application/x-www-form-urlencoded" }, body: "email=sam%40b.co" }), kv());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?joined=1#join");
  });
});
