import { describe, expect, it } from "bun:test";
import { previewAccess, publicRoute } from "../src/access";
import { joinWaitlist } from "../src/waitlist";
import { withRange } from "../src/landing";
import { testD1 } from "./d1-fixture";

const env = { APP_PASSWORD: "test-preview-password", SESSION_SECRET: "test-session-secret" };
const at = (path: string, init?: RequestInit) => new Request(`https://shiptorio.com${path}`, init);

async function previewCookie() {
  const response = await previewAccess(at("/access", { method: "POST", headers: { origin: "https://shiptorio.com" }, body: new URLSearchParams({ password: env.APP_PASSWORD }) }), env);
  return response!.headers.get("set-cookie")!.split(";")[0];
}

describe("public landing page", () => {
  it("shows the landing page at / to visitors and the app to preview players", async () => {
    expect(await publicRoute(at("/"), env)).toBe("landing");
    expect(await publicRoute(at("/?utm_source=x&ref=hn"), env)).toBe("landing");
    expect(await publicRoute(at("/?joined=1"), env)).toBe("landing");
    // App deep links keep going through the password form with next intact.
    expect(await publicRoute(at("/?onboard=repo&source=live"), env)).toBeNull();
    expect(await publicRoute(at("/?source=sim"), env)).toBeNull();
    expect(await publicRoute(at("/"), { SESSION_SECRET: "" })).toBe("landing");
    expect(await publicRoute(at("/", { headers: { cookie: await previewCookie() } }), env)).toBeNull();
    expect(await publicRoute(new Request("http://localhost/"), { ...env, DEV_LOGIN: "r3dbars" })).toBeNull();
  });
  it("in waitlist mode, signed-in GitHub players skip the landing for the signup gate", async () => {
    const waitlist = { ...env, SIGNUP_GATE_MODE: "waitlist" };
    expect(await publicRoute(at("/"), waitlist)).toBe("landing");
    expect(await publicRoute(at("/", { headers: { cookie: "shiptorio_session=abc" } }), waitlist)).toBeNull();
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

const waitlistEnv = () => ({ DB: testD1() }) as never;
const pending = async (env: { DB: D1Database }) => (await env.DB.prepare("SELECT identity FROM signup_waitlist").all<{ identity: string }>()).results.map((r) => r.identity);
const join = (body: unknown, headers: Record<string, string> = {}) =>
  at("/api/waitlist", { method: "POST", headers: { "content-type": "application/json", origin: "https://shiptorio.com", "cf-connecting-ip": "1.2.3.4", ...headers }, body: JSON.stringify(body) });

describe("waitlist", () => {
  it("puts a valid email on the /admin waitlist once", async () => {
    const env = waitlistEnv();
    expect((await joinWaitlist(join({ email: " Dana@Example.com " }), env)).status).toBe(200);
    expect((await joinWaitlist(join({ email: "dana@example.com" }), env)).status).toBe(200);
    expect(await pending(env)).toEqual(["dana@example.com"]);
  });
  it("rejects bad emails, foreign origins, and silently drops honeypot bots", async () => {
    const env = waitlistEnv();
    expect((await joinWaitlist(join({ email: "nope" }), env)).status).toBe(400);
    expect((await joinWaitlist(join({ email: "a@b.co" }, { origin: "https://evil.example" }), env)).status).toBe(403);
    expect((await joinWaitlist(join({ email: "bot@b.co", website: "spam" }), env)).status).toBe(200);
    expect(await pending(env)).toEqual([]);
  });
  it("limits one address to a few tries an hour", async () => {
    const env = waitlistEnv();
    for (let i = 0; i < 5; i++) expect((await joinWaitlist(join({ email: `p${i}@b.co` }), env)).status).toBe(200);
    expect((await joinWaitlist(join({ email: "p9@b.co" }), env)).status).toBe(429);
  });
  it("works without JavaScript: a form post comes back to the page", async () => {
    const response = await joinWaitlist(at("/api/waitlist", { method: "POST", headers: { origin: "https://shiptorio.com", "content-type": "application/x-www-form-urlencoded" }, body: "email=sam%40b.co" }), waitlistEnv());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?joined=1#join");
  });
});

describe("video byte ranges", () => {
  const file = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "content-type": "video/mp4" } });
  const get = (range?: string) => new Request("https://shiptorio.com/welcome/loop.mp4", { headers: range ? { range } : {} });
  it("answers Safari's range probes with 206 and the right slice", async () => {
    const probe = await withRange(get("bytes=0-1"), file());
    expect(probe.status).toBe(206);
    expect(probe.headers.get("content-range")).toBe("bytes 0-1/10");
    expect([...new Uint8Array(await probe.arrayBuffer())]).toEqual([0, 1]);
    const open = await withRange(get("bytes=7-"), file());
    expect([...new Uint8Array(await open.arrayBuffer())]).toEqual([7, 8, 9]);
    const tail = await withRange(get("bytes=-2"), file());
    expect([...new Uint8Array(await tail.arrayBuffer())]).toEqual([8, 9]);
    expect((await withRange(get("bytes=20-"), file())).status).toBe(416);
    expect((await withRange(get(), file())).status).toBe(200);
  });
});
