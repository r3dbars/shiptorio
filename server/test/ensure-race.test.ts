import { expect, mock, test } from "bun:test";
import { credentialEnv } from "./credential-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { Factory } = await import("../src/factory");

test("first-factory initialization coalesces, retries failure, and cannot resurrect paused or migrated state", async () => {
  const original = globalThis.fetch;
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----`;
  let trees = 0, fail = false;
  let arrived!: () => void, release!: () => void;
  let held: Promise<void> | null = null;
  const holdTree = () => { const ready = new Promise<void>(resolve => { arrived = resolve; }); held = new Promise(resolve => { release = resolve; }); return ready; };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) return Response.json({ token: "ensure-test-token" });
    if (url.endsWith("/repos/example/shop")) return Response.json({ default_branch: "main" });
    if (url.includes("/git/trees/")) { trees++; arrived?.(); await held; if (fail) return Response.json({ message: "Failure" }, { status: 400 }); return Response.json({ tree: [{ path: "src/cart.ts", type: "blob", size: 10 }] }); }
    throw Error(`Unexpected fixture call ${url}`);
  }) as typeof fetch;
  const data = new Map<string, unknown>();
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
    delete: async (key: string) => data.delete(key), list: async (o?: { prefix?: string }) => new Map([...data].filter(([key]) => !o?.prefix || key.startsWith(o.prefix))),
    getAlarm: async () => null, setAlarm: async () => {}, deleteAlarm: async () => {},
  };
  const DB = { prepare: (sql: string) => { const statement = { bind: (..._values: unknown[]) => statement, all: async () => ({ results: [] }), run: async () => ({}), first: async () => sql.includes("token_version") ? { token_version: 0, status: "active" } : sql.includes("excluded.failures") ? { next_at: Date.now() + 30000 } : null }; return statement; } };
  const env = credentialEnv({ SESSION_SECRET: "test-session", APP_PASSWORD: "test-preview", ALLOWED_LOGINS: "example", GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, DB });
  const make = () => new Factory({ storage, blockConcurrencyWhile: (fn: () => unknown) => fn(), getWebSockets: () => [] } as never, env as never);
  try {
    const factory = make();
    const ready = holdTree();
    let completed = 0;
    const first = factory.ensure("example/shop", 1).then(() => { completed++; });
    await ready;
    const second = factory.ensure("example/shop", 1).then(() => { completed++; });
    await Promise.resolve();
    expect(completed).toBe(0);
    release(); await first;
    await factory.ingestIssue({ number: 1, title: "Real backlog", body: "Do not lose this", url: "https://github.com/example/shop/issues/1", labels: [] });
    await second;
    expect(trees).toBe(1);
    expect((data.get("state") as { items: { id: string }[] }).items.map(item => item.id)).toEqual(["gh-1"]);
    await expect(factory.ensure("different/repo", 1)).rejects.toThrow("Repository mismatch");
    await Promise.all([factory.ensure("example/shop", 1), factory.ensure("example/shop", 2)]);
    expect((data.get("meta") as { installationId: number }).installationId).toBe(2);
    expect(trees).toBe(1);
    data.clear(); fail = true; held = null;
    const retry = make();
    const rejected = await Promise.allSettled([retry.ensure("example/shop", 1), retry.ensure("example/shop", 1)]);
    expect(rejected.map(result => result.status)).toEqual(["rejected", "rejected"]);
    fail = false; await retry.ensure("example/shop", 1);
    expect(data.has("state")).toBe(true);
    for (const lifecycle of ["pause", "migration"]) {
      data.clear(); const stopped = make(), started = holdTree();
      const pending = stopped.ensure("example/shop", 1);
      await started;
      if (lifecycle === "pause") await stopped.pauseGitHub("Access revoked");
      else await stopped.exportLegacy("repo:42");
      release(); await pending;
      expect(data.has("state")).toBe(false);
    }
  } finally { globalThis.fetch = original; }
});
