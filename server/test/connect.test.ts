import { expect, mock, test } from "bun:test";
import { connectPage } from "../src/connect";
import { makeSessionCookie } from "../src/session";
import { readConfig } from "../../web/src/source";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { default: app } = await import("../src/index");
const backUrl = (html: string) => new URL(html.match(/href="([^"]+)">Back to the factory/)![1].replaceAll("&#38;", "&"), "https://shiptorio.com");

test("saving either source returns the signed-in player to the actual live repo", async () => {
  const secret = "connect-session", password = "connect-preview";
  const cookie = [(await makeSessionCookie(secret, "r3dbars")).split(";")[0], (await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")].join("; ");
  for (const kind of ["sentry", "posthog"] as const) {
    const writes: string[] = [], connections: string[] = [];
    const env = { SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "r3dbars", CACHE: { get: async () => null, put: async (key: string) => { writes.push(key); } }, FACTORY: { idFromName: (repo: string) => repo, get: (repo: string) => ({ connectMine: async (mine: string) => { connections.push(`${repo}:${mine}`); } }) } };
    const form = kind === "sentry" ? { clientSecret: "sample_test_secret_only" } : { apiKey: "phx_sample_test_key_only", projectId: "123" };
    const response = await app.fetch(new Request(`https://shiptorio.com/connect/${kind}?repo=Example%2FShop`, { method: "POST", headers: { cookie, origin: "https://shiptorio.com" }, body: new URLSearchParams(form) }), env as never);
    expect(response.status).toBe(200);
    const destination = backUrl(await response.text());
    expect(readConfig(destination.search)).toMatchObject({ kind: "live", repo: "example/shop" });
    expect(writes).toEqual([`cred:${kind}`]);
    expect(connections).toEqual([`example/shop:${kind}`]);
  }
});

test("source success pages without a valid target return home without labeling a simulator as that repo", () => {
  for (const repo of [null, "", "owner", "https://elsewhere.example/owner/repo", "owner/repo?source=sim"]) {
    const destination = backUrl(connectPage({ kind: "sentry", repo, connected: true, saved: true, webhookUrl: "" }));
    expect(destination.pathname + destination.search).toBe("/");
  }
});
