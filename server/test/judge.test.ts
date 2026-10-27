import { describe, expect, it } from "bun:test";
import { publicRoute } from "../src/access";
const env = { APP_PASSWORD: "test-password", SESSION_SECRET: "test-secret" };
const at = (path: string, method = "GET") => new Request(`https://shiptorio.com${path}`, { method });

describe("public judge surface", () => {
  it("opens the replay and hashed build JS/CSS without a preview or GitHub cookie, in either signup mode", async () => {
    for (const mode of ["password", "waitlist"]) for (const method of ["GET", "HEAD"]) {
      for (const path of ["/judge", "/judge/", "/judge?source=live&repo=private/repo", "/assets/index-Abc12345.js", "/assets/index-Abc12345.css"]) {
        expect(await publicRoute(at(path, method), { ...env, SIGNUP_GATE_MODE: mode })).toBe("file");
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
