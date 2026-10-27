import { afterEach, expect, it, spyOn } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { GitHubReadCache } from "../src/github-cache";
import { githubLease } from "../src/github-concurrency";
import { gh, installationToken, openPullRequest, registerGithubCredential } from "../src/github";
import { githubCooldown, RateLimitError } from "../src/rate-limit";
import { budgetDb } from "./budget-fixture";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function cacheEnv() {
  const values = new Map<string, string>();
  const ttls: number[] = [];
  const CACHE = {
    get: async (key: string) => values.has(key) ? JSON.parse(values.get(key)!) : null,
    put: async (key: string, value: string, options: { expirationTtl: number }) => { values.set(key, value); ttls.push(options.expirationTtl); },
    delete: async (key: string) => { values.delete(key); },
  } as unknown as KVNamespace;
  return { CACHE, CRED_MASTER_KEY: Buffer.alloc(32, 23).toString("base64"), values, ttls };
}

it("reuses encrypted KV bodies across cache instances, with bounded expiry and immutable values", async () => {
  const env = cacheEnv(), first = new GitHubReadCache(), second = new GitHubReadCache();
  const key = await first.key("token-hash", "installation/version/permissions", "/repos/a/b", new Headers());
  const value = { private: "sensitive issue text" };
  await first.put(key, '"one"', value, env);
  value.private = "changed by caller";
  expect((await second.get(key, env))?.value).toEqual({ private: "sensitive issue text" });
  expect([...env.values.values()].join()).not.toContain("sensitive issue text");
  expect(key).not.toContain("token-hash");
  expect(env.ttls).toEqual([300]);
  const now = Date.now();
  const clock = spyOn(Date, "now").mockReturnValue(now + 300001);
  try { expect(await second.get(key, env)).toBeUndefined(); } finally { clock.mockRestore(); }
});

it("partitions tokens, installation versions/permissions, repository, query and response representation", async () => {
  const cache = new GitHubReadCache();
  const keys = await Promise.all([
    cache.key("one", "install:1:v1:read", "/repos/a/b?p=1", new Headers({ accept: "application/json" })),
    cache.key("two", "install:1:v1:read", "/repos/a/b?p=1", new Headers({ accept: "application/json" })),
    cache.key("one", "install:1:v2:read", "/repos/a/b?p=1", new Headers({ accept: "application/json" })),
    cache.key("one", "install:1:v1:write", "/repos/a/b?p=1", new Headers({ accept: "application/json" })),
    cache.key("one", "install:2:v1:read", "/repos/a/b?p=1", new Headers({ accept: "application/json" })),
    cache.key("one", "install:1:v1:read", "/repos/a/other?p=1", new Headers({ accept: "application/json" })),
    cache.key("one", "install:1:v1:read", "/repos/a/b?p=2", new Headers({ accept: "application/json" })),
    cache.key("one", "install:1:v1:read", "/repos/a/b?p=1", new Headers({ accept: "application/vnd.github.raw+json" })),
  ]);
  expect(new Set(keys).size).toBe(keys.length);
});

it("fails closed for corrupt/encryption-rotated/missing KV and oversized UTF-8 bodies", async () => {
  const env = cacheEnv(), cache = new GitHubReadCache();
  await cache.put("valid", '"one"', { body: "private" }, env);
  expect(await new GitHubReadCache().get("valid", { ...env, CRED_MASTER_KEY: Buffer.alloc(32, 42).toString("base64") })).toBeUndefined();
  env.values.set("corrupt", '{}');
  expect(await cache.get("corrupt", env)).toBeUndefined();
  expect(await cache.get("missing", env)).toBeUndefined();
  await cache.put("too-large", '"one"', { body: "界".repeat(25000) }, env);
  expect(await cache.get("too-large", env)).toBeUndefined();
  expect(env.values.has("too-large")).toBe(false);
  for (let i = 0; i < 40; i++) await cache.put(`body:${i}`, '"one"', "x".repeat(60000));
  expect(await cache.get("body:0")).toBeUndefined();
  expect(await cache.get("body:39")).toBeDefined();
});

it("requires a matching authorized body for 304 and never substitutes stale data on 404", async () => {
  const token = crypto.randomUUID();
  let conditional: string | null = null, status = 200;
  globalThis.fetch = (async (_url, init) => {
    conditional = new Headers(init?.headers).get("if-none-match");
    return status === 200 ? Response.json({ body: "private" }, { headers: { etag: '"one"' } }) : new Response(null, { status });
  }) as typeof fetch;
  const initial = await gh<{ body: string }>("/repos/a/b/issues/1", token);
  initial.body = "mutated";
  status = 304;
  expect(await gh("/repos/a/b/issues/1", token)).toEqual({ body: "private" });
  expect(conditional).toBe('"one"');
  await expect(gh("/repos/a/b/issues/1", crypto.randomUUID())).rejects.toMatchObject({ cause: { status: 304 } });
  expect(conditional).toBeNull();
  status = 404;
  await expect(gh("/repos/a/b/issues/1", token)).rejects.toThrow("404");
  status = 304;
  await expect(gh("/repos/a/b/issues/1", token)).rejects.toMatchObject({ cause: { status: 304 } });
  expect(conditional).toBeNull();
});

it("does not cache writes, no-store, range or alternative representations", async () => {
  const token = crypto.randomUUID();
  const conditionals: (string | null)[] = [];
  globalThis.fetch = (async (_url, init) => {
    conditionals.push(new Headers(init?.headers).get("if-none-match"));
    return Response.json({ ok: true }, { headers: { etag: '"one"' } });
  }) as typeof fetch;
  await gh("/repos/a/b", token);
  for (const init of [{ method: "PATCH", body: "{}" }, { headers: { accept: "application/vnd.github.raw+json" } }, { headers: { range: "bytes=0-10" } }, { headers: { "cache-control": "no-store" } }]) await gh("/repos/a/b", token, init);
  expect(conditionals).toEqual([null, null, null, null, null]);
});

it("uses KV for real installation reads and retains the validated credential despite header overrides", async () => {
  const env = { ...cacheEnv(), GITHUB_APP_ID: crypto.randomUUID(), GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey };
  const token = crypto.randomUUID();
  let authorization: string | null = null;
  globalThis.fetch = (async (url, init) => {
    if (String(url).endsWith("/access_tokens")) return Response.json({ token, expires_at: new Date(Date.now() + 3600000).toISOString() });
    authorization = new Headers(init?.headers).get("authorization");
    return Response.json({ body: "private" }, { headers: { etag: '"one"' } });
  }) as typeof fetch;
  await installationToken(env, 9021);
  await gh("/repos/a/b", token, { headers: { authorization: "Bearer other" } });
  expect(authorization).toBe(`Bearer ${token}`);
  expect([...env.values.keys()].filter(key => key.startsWith("ghread:v1:"))).toHaveLength(1);
});

it("caps shared installation leases at two, isolates installations, recovers crashes and fences late release", async () => {
  const { db, sqlite } = budgetDb();
  const releaseA = await githubLease(db, "github:installation:1", 1000);
  const releaseB = await githubLease(db, "github:installation:1", 1000);
  await expect(githubLease(db, "github:installation:1", 1000)).rejects.toBeInstanceOf(RateLimitError);
  const releaseOther = await githubLease(db, "github:installation:2", 1000);
  await releaseA.release();
  const releaseReplacement = await githubLease(db, "github:installation:1", 1100);
  await releaseB.release();
  await githubLease(db, "github:installation:1", 1100);
  const releaseExpired = releaseReplacement;
  const releaseNew = await githubLease(db, "github:installation:1", 32000);
  await releaseExpired.release();
  expect(sqlite.query("SELECT next_at FROM api_limits WHERE scope = 'github:installation:1:inflight:0'").get()).toEqual({ next_at: 62000 });
  expect(sqlite.query("SELECT COUNT(*) AS count FROM api_limits").get()).toEqual({ count: 3 });
  await releaseNew.release(); await releaseOther.release();
});

it("serializes replacement credentials, bounds queue pressure, and forwards Retry-After without wrapper retries", async () => {
  const { db } = budgetDb();
  const scope = `github:installation:test-${crypto.randomUUID()}`;
  const tokens = [crypto.randomUUID(), crypto.randomUUID()];
  for (const token of tokens) await registerGithubCredential(token, db, scope);
  let finish!: () => void, started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  globalThis.fetch = (async () => { calls++; started(); await new Promise<void>(resolve => { finish = resolve; }); return new Response(null, { status: 429, headers: { "retry-after": "180" } }); }) as typeof fetch;
  const first = gh("/repos/a/b", tokens[0]);
  await entered;
  const rest = Array.from({ length: 8 }, (_, index) => gh("/repos/a/b", tokens[index % 2]));
  // Attach handlers before releasing the first request to catch every rejection.
  const settled = Promise.allSettled([first, ...rest]);
  const overflow = await Promise.race(rest.map(promise => promise.catch(error => error)));
  expect(overflow).toBeInstanceOf(RateLimitError);
  finish();
  const results = await settled;
  expect(calls).toBe(1);
  expect(results.every(result => result.status === "rejected" && result.reason instanceof RateLimitError)).toBe(true);
  expect(results.filter(result => result.status === "rejected" && result.reason.retryAt > Date.now() + 170000)).toHaveLength(8);
  globalThis.fetch = (async () => new Response(null, { status: 429, headers: { "retry-after": "120" } })) as typeof fetch;
  await expect(openPullRequest(crypto.randomUUID(), "a/b", { title: "test", body: "test", base: "main", head: "fix" })).rejects.toBeInstanceOf(RateLimitError);
});

it("secondary backoff increases while primary and HTTP-date deadlines are never shortened", () => {
  const now = 1_700_000_000_000;
  const secondary = new Response(null, { status: 403 });
  expect(githubCooldown(secondary, now, 0, true)).toBe(now + 60000);
  expect(githubCooldown(secondary, now, 2, true)).toBe(now + 240000);
  expect(githubCooldown(new Response(null, { status: 429, headers: { "retry-after": new Date(now + 180000).toUTCString() } }), now, 0, false)).toBe(now + 180000);
  expect(githubCooldown(new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String((now + 600000) / 1000), "retry-after": "900" } }), now, 0, false)).toBe(now + 900000);
});
