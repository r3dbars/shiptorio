import { unlimitedFactory } from "./browser-fixture";
import { expect, mock, test } from "bun:test";
import { makeSessionCookie } from "../src/session";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { default: app } = await import("../src/index");

// shiptorio.dev opens straight into the tutorial; the password comes at "create your own factory".
const env = { SESSION_SECRET: "deck-session", APP_PASSWORD: "deck-password", FACTORY: unlimitedFactory,
  ASSETS: { fetch: async (request: Request) => new Response(`asset ${new URL(request.url).pathname}`) } };
const visit = (path: string, init?: RequestInit, host = "shiptorio.dev") => app.fetch(new Request(`https://${host}${path}`, init), env as never);

test("a stranger on shiptorio.dev lands in the tutorial with no password", async () => {
  const door = await visit("/");
  expect(door.status).toBe(302);
  expect(door.headers.get("location")).toBe("/deck?source=live");
  for (const path of ["/deck?source=live", "/deck", "/deck.html", "/deck/art/sky.webp", "/deck/px/launch/island-2.png", "/deck/traces/all-clear.json", "/assets/deck-DVL-dzKS.js", "/fonts/silkscreen-400.woff2"]) {
    const response = await visit(path);
    expect(response.status, path).toBe(200);
    expect(await response.text()).toBe(`asset ${path.split("?")[0]}`);
  }
  expect((await visit("/deck")).headers.get("cache-control")).toBe("no-store");
});

test("every real-account route on shiptorio.dev still needs the password", async () => {
  for (const path of ["/api/me", "/api/repos", "/api/repos/a/b/factory", "/api/repos/a/b/runner/status", "/auth/callback?code=x&state=y",
    "/connect/a/b", "/admin", "/settings", "/setup", "/index.html", "/?source=sim", "/deck/art/../index.html", "/deck/art/x.js", "/deck/traces/x.json.map",
    "/deck/secret.html", "/sw.js"]) {
    expect((await visit(path)).status, path).toBe(401);
  }
  for (const [path, method] of [["/deck", "POST"], ["/api/repos/a/b/issues/1/start", "POST"], ["/auth/logout", "POST"]]) {
    expect((await visit(path, { method })).status, `${method} ${path}`).toBeOneOf([401, 403]);
  }
});

test("the password unlocks the account routes exactly as before", async () => {
  const cookie = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
  expect((await visit("/index.html", { headers: { cookie } })).status).toBe(200);
  expect((await visit("/index.html", { headers: { cookie: cookie + "x" } })).status).toBe(401);
});

test("shiptorio.com keeps its landing page and gates the deck", async () => {
  for (const path of ["/deck", "/deck?source=live", "/deck/art/sky.webp"]) expect((await visit(path, undefined, "shiptorio.com")).status, path).toBe(401);
});
