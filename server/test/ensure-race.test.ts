import { expect, mock, test } from "bun:test";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { Factory } = await import("../src/factory");

test("simultaneous install and browser initialization fetch one tree, preserve work, and can retry a failed initialization", async () => {
  const original = globalThis.fetch;
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----`;
  let trees = 0, fail = false;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) return Response.json({ token: "test-token" });
    if (url.endsWith("/repos/example/shop")) return Response.json({ default_branch: "main" });
    if (url.includes("/git/trees/")) { trees++; if (fail) return Response.json({ message: "Failure" }, { status: 400 }); return Response.json({ tree: [{ path: "src/cart.ts", type: "blob", size: 10 }] }); }
    throw Error(`Unexpected fixture call ${url}`);
  }) as typeof fetch;
  const data = new Map<string, unknown>();
  const storage = { async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); }, get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); }, delete: async (key: string) => data.delete(key), list: async () => new Map(), getAlarm: async () => null, setAlarm: async () => {} };
  const env = { SESSION_SECRET: "test-session", APP_PASSWORD: "test-preview", ALLOWED_LOGINS: "example", GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({}) }) }) } };
  const make = () => new Factory({ storage, blockConcurrencyWhile: (fn: () => unknown) => fn(), getWebSockets: () => [] } as never, env as never);
  try {
    const factory = make();
    await Promise.all([factory.ensure("example/shop", 1), factory.ensure("example/shop", 1)]);
    expect(trees).toBe(1);
    await factory.ingestIssue({ number: 1, title: "Real backlog", body: "Do not lose this", url: "https://github.com/example/shop/issues/1", labels: [] });
    await factory.ensure("example/shop", 1);
    expect((data.get("state") as { items: { id: string }[] }).items.map(item => item.id)).toEqual(["gh-1"]);
    expect(trees).toBe(1);
    await expect(factory.ensure("different/repo", 1)).rejects.toThrow("Repository mismatch");
    data.clear(); fail = true;
    const retry = make();
    await expect(retry.ensure("example/shop", 1)).rejects.toThrow();
    fail = false;
    await retry.ensure("example/shop", 1);
    expect(data.has("state")).toBe(true);
  } finally { globalThis.fetch = original; }
});
