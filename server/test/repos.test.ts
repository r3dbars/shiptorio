import { expect, mock, test } from "bun:test";
import { makeSessionCookie } from "../src/session";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { testApp: app } = await import("./app-fixture");
const secret = "test-repo-session", password = "test-repo-preview";
const cookie = async (login: string, preview = true) => [
  (await makeSessionCookie(secret, login)).split(";")[0],
  ...(preview ? [(await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")] : []),
].join("; ");

test("installed repo cards keep legacy fields, expose their full name, and omit unknown issue counts", async () => {
  const rows = [{ full_name: "r3dbars/shiptorio", installation_id: 123, default_branch: "main" }, { full_name: "r3dbars/other", installation_id: 123, default_branch: null }];
  let reads = 0;
  const env = { APP_PASSWORD: password, SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars", DB: { prepare(sql: string) { expect(sql).toBe("SELECT full_name, installation_id, default_branch FROM repos ORDER BY full_name"); return { all: async () => { reads++; return { results: rows }; } }; } } };
  const response = await app.fetch(new Request("https://shiptorio.com/api/repos", { headers: { cookie: await cookie("r3dbars") } }), env as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ repos: [
    { ...rows[0], fullName: "r3dbars/shiptorio", blurb: "Default branch: main" },
    { ...rows[1], fullName: "r3dbars/other", blurb: "Connected GitHub repository" },
  ] });
  expect(reads).toBe(1);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("preview access alone, disallowed logins, and sessions without preview access cannot list repos", async () => {
  let reads = 0;
  const env = { APP_PASSWORD: password, SESSION_SECRET: secret, ALLOWED_LOGINS: "r3dbars", DB: { prepare() { reads++; throw new Error("Unauthorized database read"); } } };
  const preview = (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
  for (const header of ["", preview, await cookie("someone-else"), await cookie("r3dbars", false)]) {
    const response = await app.fetch(new Request("https://shiptorio.com/api/repos", { headers: { cookie: header } }), env as never);
    expect(response.status).toBe(401);
  }
  expect(reads).toBe(0);
});
