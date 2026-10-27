import { expect, it, mock } from "bun:test";
import { testD1 } from "./d1-fixture";

mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
const LIMIT = 1048576;
const token = "a".repeat(40);
const secret = "webhook-boundary-fixture-secret";
const routes = [
  ["/webhooks/github", "x-hub-signature-256", "sha256=", "SHA-256"],
  ["/webhooks/sentry/fixture/shop", "sentry-hook-signature", "", "SHA-256"],
  ["/webhooks/intercom/fixture/shop", "x-hub-signature", "sha1=", "SHA-1"],
  [`/webhooks/support/fixture/shop/${token}`, "", "", ""],
] as const;
async function env() {
  const DB = testD1();
  await DB.prepare("INSERT INTO installations(id, account_login, permissions) VALUES (1, 'fixture', '{}')").run();
  await DB.prepare("INSERT INTO repos(full_name, installation_id, repo_id) VALUES ('fixture/shop', 1, 501)").run();
  return { DB, CACHE: { get: async () => null }, GITHUB_WEBHOOK_SECRET: secret,
    SENTRY_REPO_ID: "501", SENTRY_INSTALLATION_ID: "1", SENTRY_CLIENT_SECRET: secret,
    SUPPORT_REPO: "fixture/shop", SUPPORT_REPO_ID: "501", SUPPORT_INSTALLATION_ID: "1",
    SUPPORT_INBOUND_TOKEN: token, INTERCOM_CLIENT_SECRET: secret };
}
async function signature(body: string, hash: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
}
it("stops every webhook at the byte limit without draining an oversized stream or trusting Content-Length", async () => {
  const bindings = await env();
  for (const [path, header, prefix, hash] of routes) {
    for (const declared of [undefined, "1"]) {
      let reads = 0, cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(reads === 1 ? LIMIT : 1));
          if (reads === 8) controller.close();
        },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 });
      const headers: Record<string, string> = header ? { [header]: prefix + "0".repeat(hash === "SHA-1" ? 40 : 64) } : {};
      if (declared) headers["content-length"] = declared;
      const response = await app.fetch(new Request(`https://shiptorio.com${path}`, { method: "POST", headers, body: stream }), bindings);
      expect({ path, declared, status: response.status }).toEqual({ path, declared, status: 413 });
      expect(reads).toBe(2);
      expect(cancelled).toBe(true);
    }
  }
});
it("counts UTF-8 bytes rather than UTF-16 code units for every webhook", async () => {
  const bindings = await env();
  const body = JSON.stringify({ text: "é".repeat(LIMIT / 2) });
  expect(body.length).toBeLessThan(LIMIT);
  for (const [path, header, prefix, hash] of routes) {
    const headers = header ? { [header]: prefix + await signature(body, hash) } : {};
    expect((await app.fetch(new Request(`https://shiptorio.com${path}`, { method: "POST", headers, body }), bindings)).status).toBe(413);
  }
});
it("preserves whitespace and split UTF-8 sequences for provider raw-body signatures", async () => {
  const bindings = await env();
  const body = '{ "text": "🔒 café" }\n';
  const bytes = new TextEncoder().encode(body);
  for (const [path, header, prefix, hash] of routes) {
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      if (offset === bytes.length) controller.close();
      else controller.enqueue(bytes.slice(offset, ++offset));
    } });
    const headers = header ? { [header]: prefix + await signature(body, hash) } : {};
    const response = await app.fetch(new Request(`https://shiptorio.com${path}`, { method: "POST", headers, body: stream }), bindings);
    expect(response.status).toBe(200); // authenticated, unsupported event/no sender ignored
    if (header) {
      const changed = await app.fetch(new Request(`https://shiptorio.com${path}`, { method: "POST", headers, body: body.trim() }), bindings);
      expect(changed.status).toBe(401);
    }
  }
});
it("accepts the exact byte boundary and rejects signed malformed JSON before dispatch", async () => {
  const bindings = await env();
  const body = "{}" + " ".repeat(LIMIT - 2);
  for (const [path, header, prefix, hash] of routes) {
    const headers = header ? { [header]: prefix + await signature(body, hash) } : {};
    expect((await app.fetch(new Request(`https://shiptorio.com${path}`, { method: "POST", headers, body }), bindings)).status).toBe(200);
    const malformed = '{"from":';
    const invalidHeaders: Record<string, string> = header ? { [header]: prefix + await signature(malformed, hash) } : {};
    // Sentry ignores unsupported resources before parsing, so use its supported resource here.
    invalidHeaders["sentry-hook-resource"] = "issue";
    expect((await app.fetch(new Request(`https://shiptorio.com${path}`, { method: "POST", headers: invalidHeaders, body: malformed }), bindings)).status).toBe(400);
  }
});
it("an invalid signature cannot poison a delivery marker, and pending deliveries remain retryable", async () => {
  const { fakeGitHub } = await import("../src/sources/github");
  const bindings = await env();
  const payload = fakeGitHub();
  payload.repository!.full_name = "fixture/shop";
  const body = JSON.stringify(payload);
  let attempts = 0;
  const withFactory = { ...bindings, FACTORY: { idFromName: (name: string) => name, get: () => ({
    enqueueGitHub: async () => { if (++attempts === 1) throw new Error("fixture enqueue unavailable"); },
  }) } };
  const good = "sha256=" + await signature(body, "SHA-256");
  const send = (sig: string) => app.fetch(new Request("https://shiptorio.com/webhooks/github", {
    method: "POST", headers: { "x-hub-signature-256": sig, "x-github-event": "issues", "x-github-delivery": "retry-fixture" }, body,
  }), withFactory);
  expect((await send("sha256=" + "0".repeat(64))).status).toBe(401);
  expect(await bindings.DB.prepare("SELECT state FROM webhook_deliveries WHERE source = 'github' AND delivery_id = 'retry-fixture'").first()).toBeNull();
  expect((await send(good)).status).toBe(500); // enqueue failed after durable reservation
  expect(await bindings.DB.prepare("SELECT state FROM webhook_deliveries WHERE source = 'github' AND delivery_id = 'retry-fixture'").first()).toEqual({ state: "pending" });
  expect((await send(good)).status).toBe(202); // provider redelivery must recover it
  await bindings.DB.prepare("UPDATE webhook_deliveries SET state = 'done' WHERE source = 'github' AND delivery_id = 'retry-fixture'").run();
  const duplicate = await send(good);
  expect(duplicate.status).toBe(200);
  expect(await duplicate.json()).toEqual({ ok: true, duplicate: true });
  expect(attempts).toBe(2);
});
it("anonymous callers cannot use public webhook or runner exceptions to open private APIs", async () => {
  for (const mode of ["password", "waitlist"]) {
    const bindings = { ...await env(), SIGNUP_GATE_MODE: mode, SESSION_SECRET: "boundary-session-fixture", APP_PASSWORD: "boundary-password-fixture" };
    for (const path of ["/api/account/export", "/api/repos", "/api/empire", "/api/sources?repo=fixture/shop", "/api/setup/status?repo=fixture/shop", "/api/repos/fixture/shop/export", "/api/repos/fixture/shop/runner/jobs", "/api/repos/fixture/shop/limits"]) {
      const response = await app.fetch(new Request(`https://shiptorio.com${path}`, {
        headers: { authorization: "Bearer forged", "x-hub-signature-256": "sha256=" + "0".repeat(64) },
      }), bindings);
      expect({ mode, path, status: response.status }).toEqual({ mode, path, status: 401 });
    }
  }
});
