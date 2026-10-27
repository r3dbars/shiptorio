import { expect, it, mock } from "bun:test";
import { testD1 } from "./d1-fixture";
import { fakeIntercom } from "../src/sources/support";

mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { app } = await import("../src/index");
const { Factory } = await import("../src/factory");

it("a signed Intercom webhook passes the real observed RPC allowlist before support enqueue", async () => {
  const DB = testD1();
  await DB.prepare("INSERT INTO installations(id, account_login, permissions) VALUES (1, 'fixture', '{}')").run();
  await DB.prepare("INSERT INTO repos(full_name, installation_id, repo_id) VALUES ('fixture/shop', 1, 501)").run();
  const secret = "support-rpc-fixture-secret";
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} };
  const queued: string[] = [];
  // Exercise the production guard/dispatch. Only the final queue sink is a fixture;
  // app-fixture's permissive observedCall adapter must not stand in for this guard.
  const object = Object.assign(Object.create(Factory.prototype), { ctx,
    enqueueSupport: async (id: string) => { queued.push(id); },
  });
  const bindings = { DB, CACHE: { get: async () => null },
    SUPPORT_REPO: "fixture/shop", SUPPORT_REPO_ID: "501", SUPPORT_INSTALLATION_ID: "1", INTERCOM_CLIENT_SECRET: secret,
    FACTORY: { idFromName: (name: string) => name, get: () => object },
  };
  object.env = bindings;
  const body = JSON.stringify(fakeIntercom());
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
  const send = (signature: string) => app.fetch(new Request("https://shiptorio.com/webhooks/intercom/fixture/shop", {
    method: "POST", headers: { "x-hub-signature": `sha1=${signature}` }, body,
  }), bindings as never, ctx as never);
  expect((await send("0".repeat(40))).status).toBe(401);
  expect(queued).toHaveLength(0);
  expect((await send(sig)).status).toBe(202);
  expect(queued).toHaveLength(1);
  expect(queued[0]).toStartWith("fixture/shop:");
  await Promise.all(pending);
});
