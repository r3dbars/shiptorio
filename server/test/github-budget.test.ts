import { afterEach, expect, it, spyOn } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { GitHubReadCache } from "../src/github-cache";
import { githubLease } from "../src/github-concurrency";
import { GITHUB_STEP_DEADLINE_MS, gh, openPullRequest, registerGithubCredential } from "../src/github";
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
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    conditional = new Headers(init?.headers).get("if-none-match");
    return status === 200 ? Response.json({ body: "private" }, { headers: { etag: '"one"' } }) : new Response(null, { status });
  }) as unknown as typeof fetch;
  const initial = await gh<{ body: string }>("/repos/a/b/issues/1", token);
  initial.body = "mutated";
  status = 304;
  expect(await gh("/repos/a/b/issues/1", token)).toEqual({ body: "private" });
  expect(conditional as string | null).toBe('"one"');
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
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    conditionals.push(new Headers(init?.headers).get("if-none-match"));
    return Response.json({ ok: true }, { headers: { etag: '"one"' } });
  }) as unknown as typeof fetch;
  await gh("/repos/a/b", token);
  for (const init of [{ method: "PATCH", body: "{}" }, { headers: { accept: "application/vnd.github.raw+json" } }, { headers: { range: "bytes=0-10" } }, { headers: { "cache-control": "no-store" } }] as RequestInit[]) await gh("/repos/a/b", token, init);
  expect(conditionals).toEqual([null, null, null, null, null]);
});

it("uses KV for installation reads, pins authorization and denies cached bodies after suspension", async () => {
  const isolated = await import(`../src/github.ts?eviction-isolate=${crypto.randomUUID()}`) as typeof import("../src/github");
  const { db, sqlite } = budgetDb();
  sqlite.exec("ALTER TABLE installations ADD COLUMN token_version INTEGER DEFAULT 0; ALTER TABLE installations ADD COLUMN status TEXT DEFAULT 'active'; INSERT INTO installations(id, account_login) VALUES(9021, 'owner'); CREATE TABLE repos(full_name TEXT, archived_at INTEGER, installation_id INTEGER); INSERT INTO repos VALUES('a/b', NULL, 9021)");
  const env = { DB: db, ...cacheEnv(), GITHUB_APP_ID: crypto.randomUUID(), GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey };
  const token = crypto.randomUUID();
  let authorization: string | null = null;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith("/access_tokens")) return Response.json({ token, expires_at: new Date(Date.now() + 3600000).toISOString() });
    authorization = new Headers(init?.headers).get("authorization");
    return Response.json({ body: "private" }, { headers: { etag: '"one"' } });
  }) as unknown as typeof fetch;
  await isolated.installationToken(env, 9021);
  // Evict optional registration metadata; owned installation budgets must survive.
  for (let i = 0; i < 501; i++) await isolated.registerGithubCredential(`eviction-${i}`, db, `github:test:eviction:${i}`);
  await isolated.gh("/repos/a/b", token, { headers: { authorization: "Bearer other" } });
  expect(authorization as string | null).toBe(`Bearer ${token}`);
  expect(sqlite.query("SELECT next_at FROM api_limits WHERE scope = 'github:installation:9021:inflight:0'").get()).toEqual({ next_at: 0 });
  expect([...env.values.keys()].filter(key => key.startsWith("ghread:v1:"))).toHaveLength(1);
  sqlite.exec("UPDATE installations SET status = 'suspended' WHERE id = 9021");
  globalThis.fetch = (async () => { throw new Error("must not fetch with a suspended installation"); }) as unknown as typeof fetch;
  await expect(isolated.gh("/repos/a/b", token)).rejects.toThrow("suspended");
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
  globalThis.fetch = (async () => { calls++; started(); await new Promise<void>(resolve => { finish = resolve; }); return new Response(null, { status: 429, headers: { "retry-after": "180" } }); }) as unknown as typeof fetch;
  const first = gh("/repos/a/b", tokens[0]);
  await entered;
  const rest = Array.from({ length: 8 }, (_, index) => gh(`/repos/a/b/issues/${index}`, tokens[index % 2]));
  // Attach handlers before releasing the first request to catch every rejection.
  const settled = Promise.allSettled([first, ...rest]);
  const overflow = await Promise.race(rest.map(promise => promise.catch(error => error)));
  expect(overflow).toBeInstanceOf(RateLimitError);
  finish();
  const results = await settled;
  expect(calls).toBe(1);
  expect(results.every(result => result.status === "rejected" && result.reason instanceof RateLimitError)).toBe(true);
  expect(results.filter(result => result.status === "rejected" && result.reason.retryAt > Date.now() + 170000)).toHaveLength(8);
  globalThis.fetch = (async () => new Response(null, { status: 429, headers: { "retry-after": "120" } })) as unknown as typeof fetch;
  await expect(openPullRequest(crypto.randomUUID(), "a/b", { title: "test", body: "test", base: "main", head: "fix" })).rejects.toBeInstanceOf(RateLimitError);
});

it("a hung step times out instead of wedging its scope queue", async () => {
  const { db } = budgetDb();
  const scope = `github:installation:hang-${crypto.randomUUID()}`;
  const token = crypto.randomUUID();
  await registerGithubCredential(token, db, scope);
  // The first pacing read never settles, like a stuck D1 call in production.
  const originalPrepare = db.prepare.bind(db);
  let hung = false;
  const prepare = spyOn(db, "prepare").mockImplementation((sql: string) => {
    const statement = originalPrepare(sql);
    if (hung || !sql.startsWith("SELECT next_at, failures")) return statement;
    hung = true;
    return { bind: () => ({ first: () => new Promise(() => {}) }) } as unknown as D1PreparedStatement;
  });
  // Only the hung call's deadline fires at once; the follow-up keeps its real 45s.
  const realSetTimeout = globalThis.setTimeout;
  let shortcut = false;
  const timers = spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
    const first = ms === GITHUB_STEP_DEADLINE_MS && !shortcut;
    if (first) shortcut = true;
    return realSetTimeout(fn, first ? 0 : ms);
  }) as typeof setTimeout);
  globalThis.fetch = (async () => Response.json({ ok: true })) as unknown as typeof fetch;
  try {
    await expect(gh("/repos/a/b", token)).rejects.toBeInstanceOf(RateLimitError);
    expect(await gh("/repos/a/c", token)).toEqual({ ok: true });
  } finally { prepare.mockRestore(); timers.mockRestore(); }
});

it("secondary backoff increases while primary and HTTP-date deadlines are never shortened", () => {
  const now = 1_700_000_000_000;
  const secondary = new Response(null, { status: 403 });
  expect(githubCooldown(secondary, now, 0, true)).toBe(now + 60000);
  expect(githubCooldown(secondary, now, 2, true)).toBe(now + 240000);
  expect(githubCooldown(new Response(null, { status: 429, headers: { "retry-after": new Date(now + 180000).toUTCString() } }), now, 0, false)).toBe(now + 180000);
  expect(githubCooldown(new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String((now + 600000) / 1000), "retry-after": "900" } }), now, 0, false)).toBe(now + 900000);
});

it("keeps actual request deadlines inside leases, aborts hung requests and releases slots", async () => {
  const { db, sqlite } = budgetDb();
  const scope = `github:installation:deadline-${crypto.randomUUID()}`;
  const token = crypto.randomUUID();
  await registerGithubCredential(token, db, scope);
  let abort!: () => void;
  const timeout = spyOn(AbortSignal, "timeout").mockImplementation(ms => {
    expect(ms).toBeLessThanOrEqual(20000);
    const held = sqlite.query("SELECT next_at FROM api_limits WHERE scope = ?").get(`${scope}:inflight:0`) as { next_at: number };
    expect(Date.now() + ms).toBeLessThan(held.next_at);
    const controller = new AbortController();
    abort = () => controller.abort(new DOMException("request timed out", "TimeoutError"));
    return controller.signal;
  });
  let queries = 0;
  const originalPrepare = db.prepare.bind(db);
  const prepare = spyOn(db, "prepare").mockImplementation((sql: string) => { queries++; return originalPrepare(sql); });
  // Use a non-retryable abort reason so this test observes one slot lifecycle.
  const { OutboundError } = await import("../src/reliability");
  let signal: AbortSignal | undefined;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    entered();
    return new Promise<Response>((_resolve, reject) => signal!.addEventListener("abort", () => reject(new OutboundError(400)), { once: true }));
  }) as unknown as typeof fetch;
  try {
    const request = gh("/repos/a/b", token);
    const result = request.catch(error => error);
    await started;
    abort();
    expect(await result).toMatchObject({ cause: { status: 400 } });
    expect(signal!.aborted).toBe(true);
    expect(sqlite.query("SELECT next_at FROM api_limits WHERE scope = ?").get(`${scope}:inflight:0`)).toEqual({ next_at: 0 });
    // Four pre-fetch statements + compare-release on this network-abort path.
    expect(queries).toBe(5);
  } finally { timeout.mockRestore(); prepare.mockRestore(); }
});

it("rejects an already-expired acquired slot without starting an HTTP request", async () => {
  const { db } = budgetDb();
  const token = crypto.randomUUID(), scope = `github:installation:slow-db-${crypto.randomUUID()}`;
  await registerGithubCredential(token, db, scope);
  const now = Date.now();
  const clock = spyOn(Date, "now").mockReturnValue(now);
  const originalPrepare = db.prepare.bind(db);
  const prepare = spyOn(db, "prepare").mockImplementation(sql => {
    const statement = originalPrepare(sql);
    if (!sql.includes("RETURNING next_at") || !sql.includes("excluded.failures")) return statement;
    const originalBind = statement.bind.bind(statement);
    statement.bind = (...values: unknown[]) => {
      const bound = originalBind(...values), originalFirst = bound.first.bind(bound);
      bound.first = (async () => { const row = await originalFirst(); clock.mockReturnValue(now + 31000); return row; }) as typeof bound.first;
      return bound;
    };
    return statement;
  });
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({}); }) as unknown as typeof fetch;
  try {
    await expect(gh("/repos/a/b", token)).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toBe(0);
  } finally { clock.mockRestore(); prepare.mockRestore(); }
});

it("enforces two shared slots across independent Worker modules and credentials", async () => {
  const load = () => import(`../src/github.ts?budget-isolate=${crypto.randomUUID()}`) as Promise<typeof import("../src/github")>;
  const [a, b, c] = await Promise.all([load(), load(), load()]);
  const { db } = budgetDb(), scope = `github:installation:shared-${crypto.randomUUID()}`;
  const tokens = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await a.registerGithubCredential(tokens[0], db, scope);
  await b.registerGithubCredential(tokens[1], db, scope);
  await c.registerGithubCredential(tokens[2], db, scope);
  let active = 0, maximum = 0;
  const releases: (() => void)[] = [];
  const starts: (() => void)[] = [];
  globalThis.fetch = (async () => {
    active++; maximum = Math.max(active, maximum);
    starts.shift()?.();
    await new Promise<void>(resolve => releases.push(resolve));
    active--;
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  let first!: Promise<unknown>, second!: Promise<unknown>;
  try {
    const enteredA = new Promise<void>(resolve => starts.push(resolve));
    first = a.gh("/repos/a/b", tokens[0]);
    await enteredA;
    const enteredB = new Promise<void>(resolve => starts.push(resolve));
    second = b.gh("/repos/a/b", tokens[1]);
    await enteredB;
    await expect(c.gh("/repos/a/b", tokens[2])).rejects.toBeInstanceOf(RateLimitError);
    expect(maximum).toBe(2);
    expect(active).toBe(2);
  } finally {
    releases.forEach(release => release());
    await Promise.allSettled([first, second]);
  }
}, 10000);

it("adds exactly two D1 statements on an uncontended successful installation request", async () => {
  const { db } = budgetDb(), token = crypto.randomUUID();
  await registerGithubCredential(token, db, `github:installation:queries-${crypto.randomUUID()}`);
  const originalPrepare = db.prepare.bind(db);
  const statements: string[] = [];
  const prepare = spyOn(db, "prepare").mockImplementation(sql => { statements.push(sql); return originalPrepare(sql); });
  globalThis.fetch = (async () => Response.json({ ok: true })) as unknown as typeof fetch;
  try {
    expect(await gh("/repos/a/b", token)).toEqual({ ok: true });
    expect(statements).toHaveLength(6);
    expect(statements.filter(sql => sql.includes("excluded.failures") || sql.includes("AND failures = ?"))).toHaveLength(2);
  } finally { prepare.mockRestore(); }
});

it("accepts authorized 304 when its selected validator expires in flight, then fetches unconditionally", async () => {
  const token = crypto.randomUUID(), now = Date.now();
  const clock = spyOn(Date, "now").mockReturnValue(now);
  const conditionals: (string | null)[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    conditionals.push(new Headers(init?.headers).get("if-none-match"));
    if (conditionals.length === 2) {
      clock.mockReturnValue(now + 300010);
      return new Response(null, { status: 304 });
    }
    return Response.json({ body: conditionals.length === 1 ? "original" : "updated" }, { headers: { etag: '"one"' } });
  }) as unknown as typeof fetch;
  try {
    expect(await gh("/repos/a/b/issues/1", token)).toEqual({ body: "original" });
    clock.mockReturnValue(now + 299999);
    expect(await gh("/repos/a/b/issues/1", token)).toEqual({ body: "original" });
    expect(await gh("/repos/a/b/issues/1", token)).toEqual({ body: "updated" });
    expect(conditionals).toEqual([null, '"one"', null]);
  } finally { clock.mockRestore(); }
});

for (const status of [403, 404]) it(`never serves an in-flight expired candidate after GitHub denies access (${status})`, async () => {
  const token = crypto.randomUUID(), now = Date.now();
  const clock = spyOn(Date, "now").mockReturnValue(now);
  let calls = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    if (++calls === 1) return Response.json({ body: "private" }, { headers: { etag: '"one"' } });
    expect(new Headers(init?.headers).get("if-none-match")).toBe('"one"');
    clock.mockReturnValue(now + 300010);
    return Response.json({ message: "Access denied" }, { status });
  }) as unknown as typeof fetch;
  try {
    await gh("/repos/a/b/issues/1", token);
    clock.mockReturnValue(now + 299999);
    if (status === 404) await expect(gh("/repos/a/b/issues/1", token)).rejects.toMatchObject({ status });
    else await expect(gh("/repos/a/b/issues/1", token)).rejects.toMatchObject({ cause: { status } });
    expect(calls).toBe(2);
  } finally { clock.mockRestore(); }
});

it("coalesces overlapping reads, clones results and revalidates every later read", async () => {
  const token = crypto.randomUUID();
  let calls = 0, release!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const conditionals: (string | null)[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++; conditionals.push(new Headers(init?.headers).get("if-none-match")); entered();
    await held;
    return conditionals.at(-1) ? new Response(null, { status: 304 }) : Response.json({ checks: ["green"] }, { headers: { etag: '"current"' } });
  }) as unknown as typeof fetch;
  const first = gh<{ checks: string[] }>("/repos/a/b/pulls/7", token);
  await started;
  const second = gh<{ checks: string[] }>("/repos/a/b/pulls/7", token);
  // Let both asynchronous fingerprint lookups finish before the provider responds.
  await new Promise(resolve => setTimeout(resolve, 10));
  release();
  const [a, b] = await Promise.all([first, second]);
  expect(calls).toBe(1);
  a.checks.push("caller mutation");
  expect(b.checks).toEqual(["green"]);
  expect(await gh("/repos/a/b/pulls/7", token)).toEqual({ checks: ["green"] });
  expect(calls).toBe(2);
  expect(conditionals).toEqual([null, '"current"']);
});

it("never coalesces credentials, representations, queries or explicit freshness/cancellation controls", async () => {
  const token = crypto.randomUUID();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json({ ok: true }); }) as unknown as typeof fetch;
  await Promise.all([
    gh("/repos/a/b", token),
    gh("/repos/a/b", crypto.randomUUID()),
    gh("/repos/a/b?page=2", token),
    gh("/repos/a/b", token, { headers: { accept: "application/vnd.github.raw+json" } }),
    gh("/repos/a/b", token, { headers: { "cache-control": "no-cache" } }),
    gh("/repos/a/b", token, { headers: { "if-none-match": '"caller"' } }),
    gh("/repos/a/b", token, { signal: new AbortController().signal }),
    gh("/repos/a/b", token, { cache: "reload" }),
  ]);
  expect(calls).toBe(8);
});

it("shares provider backoff across duplicate reads without consuming more GitHub calls", async () => {
  const { db } = budgetDb();
  const token = crypto.randomUUID();
  await registerGithubCredential(token, db, `github:installation:backoff-${crypto.randomUUID()}`);
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 10));
    return new Response(null, { status: 429, headers: { "retry-after": "180" } });
  }) as unknown as typeof fetch;
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => gh("/repos/a/b/pulls/7", token)));
  expect(calls).toBe(1);
  expect(results.every(r => r.status === "rejected" && r.reason instanceof RateLimitError && r.reason.retryAt > Date.now() + 170000)).toBe(true);
  await expect(gh("/repos/a/b/pulls/7", token)).rejects.toBeInstanceOf(RateLimitError);
  expect(calls).toBe(1);
});
