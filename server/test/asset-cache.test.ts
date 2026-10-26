import { expect, mock, test } from "bun:test";
import { makeSessionCookie } from "../src/session";
import { securityHeaders } from "../src/security";
import { readFileSync } from "node:fs";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { default: app } = await import("../src/index");
test("authorized hashed assets keep immutable caching after middleware; pages, errors and the gate do not", async () => {
  let assets = 0;
  const env = { SESSION_SECRET: "cache-session", APP_PASSWORD: "cache-password", ASSETS: { fetch: async (request: Request) => { assets++; return new Response("asset", { status: new URL(request.url).pathname.includes("missing") ? 404 : 200 }); } } };
  const cookie = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
  for (const [path, expected] of [["/assets/index-abcdefgh.js", "private, max-age=31536000, immutable"], ["/assets/missing-abcdefgh.js", "no-store"], ["/assets/unversioned.js", "no-store"], ["/", "no-store"]]) {
    const response = await app.fetch(new Request(`https://shiptorio.com${path}`, { headers: { cookie } }), env as never);
    expect(response.headers.get("cache-control")).toBe(expected);
  }
  const before = assets;
  const gate = await app.fetch(new Request("https://shiptorio.com/assets/index-abcdefgh.js"), env as never);
  expect(gate.headers.get("cache-control")).toBe("no-store");
  expect(assets).toBe(before);
});
test("the committed font loading markup works without CSP-blocked inline handlers", () => {
  const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
  expect(securityHeaders(new Request("https://shiptorio.com"))["Content-Security-Policy"]).toContain("script-src-attr 'none'");
  expect(html).not.toMatch(/\bonload\s*=/i);
  expect(html).toMatch(/fonts\.googleapis\.com[^>]+rel="stylesheet"/);
  expect((html.match(/<link\b[^>]*>/gi) ?? []).filter(link => link.includes("fonts.googleapis.com")).every(link => !link.includes('media="print"'))).toBe(true);
});
