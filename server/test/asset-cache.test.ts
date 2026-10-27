import { unlimitedFactory } from "./browser-fixture";
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
  const publicAsset = await app.fetch(new Request("https://shiptorio.com/assets/index-abcdefgh.js"), env as never);
  expect(publicAsset.status).toBe(200);
  expect(publicAsset.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  expect(assets).toBe(before + 1);
  const gate = await app.fetch(new Request("https://shiptorio.com/assets/unversioned.js"), env as never);
  expect(gate.headers.get("cache-control")).toBe("no-store");
  expect(assets).toBe(before + 1);
});
test("the committed font loading markup works without CSP-blocked inline handlers", () => {
  const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
  expect(securityHeaders(new Request("https://shiptorio.com"))["Content-Security-Policy"]).toContain("script-src-attr 'none'");
  expect(html).not.toMatch(/\bonload\s*=/i);
  expect(html).toMatch(/fonts\.googleapis\.com[^>]+rel="stylesheet"/);
  expect((html.match(/<link\b[^>]*>/gi) ?? []).filter(link => link.includes("fonts.googleapis.com")).every(link => !link.includes('media="print"'))).toBe(true);
});

test("public docs survive password and waitlist gates while private APIs stay gated", async () => {
  for (const mode of ["password", "waitlist"]) {
    let assets = 0;
    const env = {
      SESSION_SECRET: "docs-session", APP_PASSWORD: "docs-password", SIGNUP_GATE_MODE: mode, FACTORY: unlimitedFactory,
      ASSETS: { fetch: async (request: Request) => {
        assets++;
        return new Response("public documentation", { status: new URL(request.url).pathname.includes("missing") ? 404 : 200 });
      } },
    };
    for (const path of ["/docs", "/docs/runner", "/docs/search.json"]) {
      const response = await app.fetch(new Request(`https://shiptorio.com${path}`), env as never);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("public documentation");
      expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    }
    const missing = await app.fetch(new Request("https://shiptorio.com/docs/missing"), env as never);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    const before = assets;
    const privateApi = await app.fetch(new Request("https://shiptorio.com/api/me"), env as never);
    expect(privateApi.status).toBe(401);
    expect(assets).toBe(before);
  }
});
