import { describe, expect, it } from "bun:test";
import { previewAccess } from "../src/access";

const env = { APP_PASSWORD: "test-preview-password", SESSION_SECRET: "test-session-secret" };
describe("private preview", () => {
  it("protects the page, static assets, setup, API and websocket entry", async () => {
    for (const path of ["/", "/assets/app.js", "/setup", "/api/me", "/api/repos/a/b/factory"]) {
      const response = await previewAccess(new Request(`https://shiptorio.com${path}`), env);
      expect(response?.status).toBe(401);
    }
  });
  it("fails closed without secrets; lets signed-webhook handling run separately", async () => {
    expect((await previewAccess(new Request("https://shiptorio.com/"), { SESSION_SECRET: "" }))?.status).toBe(503);
    expect(await previewAccess(new Request("https://shiptorio.com/webhooks/github"), env)).toBeNull();
  });
  it("accepts a password, rejects forgery, and invalidates cookies after password rotation", async () => {
    const request = (password: string) => new Request("https://shiptorio.com/access", { method: "POST", headers: { origin: "https://shiptorio.com" }, body: new URLSearchParams({ password }) });
    expect((await previewAccess(request("wrong"), env))?.status).toBe(401);
    const response = await previewAccess(request(env.APP_PASSWORD), env);
    expect(response?.status).toBe(303);
    const cookie = response!.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toContain("shiptorio_access=");
    const home = new Request("https://shiptorio.com/", { headers: { cookie } });
    expect(await previewAccess(home, env)).toBeNull();
    expect((await previewAccess(home, { ...env, APP_PASSWORD: "rotated" }))?.status).toBe(401);
    expect((await previewAccess(new Request("https://shiptorio.com/", { headers: { cookie: cookie + "forged" } }), env))?.status).toBe(401);
  });
  it("rejects cross-site password submissions and only bypasses on explicit local dev", async () => {
    expect((await previewAccess(new Request("https://shiptorio.com/access", { method: "POST", body: "password=x" }), env))?.status).toBe(403);
    expect(await previewAccess(new Request("http://localhost/"), { ...env, DEV_LOGIN: "r3dbars" })).toBeNull();
    expect((await previewAccess(new Request("https://shiptorio.com/"), { ...env, DEV_LOGIN: "r3dbars" }))?.status).toBe(401);
  });
});

it("redirects HTTP entry before rendering or accepting the password", async () => {
  for (const path of ["/?source=live&repo=r3dbars/shiptorio", "/access", "/api/version"]) {
    const response = await previewAccess(new Request(`http://shiptorio.com${path}`), env);
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(`https://shiptorio.com${path}`);
    expect(response?.headers.has("set-cookie")).toBe(false);
  }
});

it("checks cookie acceptance and preserves the intended factory after native form submission", async () => {
  const next = "/?source=live&repo=r3dbars/shiptorio&checkin";
  const gate = await previewAccess(new Request(`https://shiptorio.com${next}`), env);
  const html = await gate!.text();
  expect(html).toContain('method="post" action="/access"');
  expect(html).toContain('name="next"');
  expect(html).not.toContain("<script");
  const response = await previewAccess(new Request("https://shiptorio.com/access", {
    method: "POST", headers: { origin: "https://shiptorio.com" },
    body: new URLSearchParams({ password: env.APP_PASSWORD, next }),
  }), env);
  const target = new URL(response!.headers.get("location")!, "https://shiptorio.com");
  const blocked = await previewAccess(new Request(target), env);
  expect(blocked?.status).toBe(401);
  expect(await blocked!.text()).toContain("did not keep the sign-in cookie");
  const accepted = await previewAccess(new Request(target, { headers: { cookie: response!.headers.get("set-cookie")!.split(";")[0] } }), env);
  expect(accepted?.status).toBe(303);
  expect(accepted?.headers.get("location")).toBe(next);
});

it("refuses external post-login destinations", async () => {
  for (const next of ["//attacker.example", "/\\attacker.example", "https://attacker.example"]) {
    const response = await previewAccess(new Request("https://shiptorio.com/access", {
      method: "POST", headers: { origin: "https://shiptorio.com" },
      body: new URLSearchParams({ password: env.APP_PASSWORD, next }),
    }), env);
    expect(new URL(response!.headers.get("location")!, "https://shiptorio.com").searchParams.get("next")).toBe("/");
  }
});
