import { describe, expect, it, mock } from "bun:test";
import { publicRoute } from "../src/access";
const env = { APP_PASSWORD: "test-password", SESSION_SECRET: "test-secret" };
const at = (path: string, method = "GET") => new Request(`https://shiptorio.com${path}`, { method });

describe("public judge surface", () => {
  it("opens the replay and hashed build JS/CSS without a preview or GitHub cookie, in either signup mode", async () => {
    for (const mode of ["password", "waitlist"]) for (const method of ["GET", "HEAD"]) {
      for (const path of ["/judge", "/judge/", "/judge?source=live&repo=private/repo", "/assets/index-Abc12345.js", "/assets/index-Abc12345.css"]) {
        expect(await publicRoute(at(path, method), { ...env, SIGNUP_GATE_MODE: mode })).toBe(path.startsWith("/judge") ? "judge" : "file");
      }
    }
  });
  it("does not grant access to APIs, websocket, arbitrary files, map source, or mutation routes", async () => {
    for (const path of ["/?source=sim", "/judge/private", "/judge-api", "/api/me", "/api/repos/private/repo/factory", "/assets/index-Abc12345.js.map", "/assets/app.js", "/src/map/scene.ts", "/setup", "/index.html"]) {
      expect(await publicRoute(at(path), env)).toBeNull();
    }
    for (const method of ["POST", "PUT", "DELETE"]) expect(await publicRoute(at("/judge", method), env)).toBeNull();
  });
});

mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));
const { default: app } = await import("../src/index");
it("serves the deck's story past both gates without leaking access to live data", async () => {
  for (const mode of ["password", "waitlist"]) {
    const reads: string[] = [];
    const runtime = { ...env, SIGNUP_GATE_MODE: mode, FACTORY: { idFromName: (id: string) => id, get: () => ({ securityLimit: async () => ({ allowed: true }) }) }, ASSETS: { fetch: async (r: Request) => {
      reads.push(new URL(r.url).pathname);
      return new Response("deck shell", { headers: { "content-type": "text/html" } });
    } } };
    const page = await app.fetch(at("/judge?source=live&repo=private/repo"), runtime as never);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("deck shell");
    expect(reads).toEqual(["/deck.html"]);
    expect(page.headers.has("set-cookie")).toBe(false);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    // The deck's static art is public too; nothing else is.
    expect((await app.fetch(at("/deck/art/sky.webp"), runtime as never)).status).toBe(200);
    for (const path of ["/api/me", "/api/repos/private/repo/factory", ...(mode === "password" ? ["/deck", "/deck/art/x.js", "/assets/unversioned.js"] : [])]) {
      expect((await app.fetch(at(path), runtime as never)).status, path).toBe(401);
    }
  }
});
