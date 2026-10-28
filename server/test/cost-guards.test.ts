import { afterEach, expect, it, spyOn } from "bun:test";
import { budgetDb, sparkTestEnv } from "./budget-fixture";
import { budgetAccount, budgetLimits, budgetUsage, reserveSpark, settleSpark } from "../src/budget";
import { sparkChat } from "../src/spark";
import { gh } from "../src/github";
import { fetchRouteDays } from "../src/sources/posthog";
import { githubCooldown, pollDelay, retryAfterMs } from "../src/rate-limit";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

it("atomically enforces a shared account's daily call cap across concurrent factories", async () => {
  const { db } = budgetDb();
  const env = { DB: db, SPARK_DAILY_CALLS: "3", SPARK_DAILY_TOKENS: "1000" };
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserveSpark(env, "owner", 10)));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
  expect(await budgetUsage(env, "owner")).toMatchObject({ calls: 3, tokens: 30 });
  await expect(reserveSpark(env, "other-user", 10)).resolves.toMatchObject({ account: "other-user" });
  expect(await budgetAccount(db, "owner/repo")).toBe("user:1");
  await expect(budgetAccount(db, "owner/missing")).rejects.toThrow("unavailable");
});
it("enforces tokens before fetch, refunds measured usage only, and retains ambiguous reservations", async () => {
  const env = { DB: budgetDb().db, SPARK_DAILY_TOKENS: "100" };
  const reservation = await reserveSpark(env, "owner", 80);
  await expect(reserveSpark(env, "owner", 21)).rejects.toThrow("exhausted");
  await settleSpark(env, reservation, undefined);
  expect((await budgetUsage(env, "owner")).tokens).toBe(80);
  await settleSpark(env, reservation, 20);
  await reserveSpark(env, "owner", 80);
  expect(await budgetUsage(env, "owner")).toMatchObject({ calls: 2, tokens: 100 });
});
it("a new UTC day gets a fresh cap and zero is a valid hard stop", async () => {
  const { db, sqlite } = budgetDb();
  sqlite.exec("INSERT INTO spark_usage VALUES('owner', '2000-01-01', 99999, 99999)");
  await expect(reserveSpark({ DB: db }, "owner", 1)).resolves.toMatchObject({ tokens: 1 });
  await expect(reserveSpark({ DB: db, SPARK_DAILY_CALLS: "0" }, "other", 1)).rejects.toThrow("exhausted");
  await expect(reserveSpark({ DB: db, SPARK_DISABLED: "1" }, "owner", 1)).rejects.toThrow("kill switch");
  expect(budgetLimits({ SPARK_DAILY_CALLS: "NaN", FACTORY_CONCURRENT_JOBS: "0" })).toMatchObject({ calls: 400, jobs: 0 });
});
it("Spark reserves every outbound call, caps output, and never fetches when disabled or exhausted", async () => {
  const env = { ...sparkTestEnv(), SPARK_DAILY_CALLS: "1" };
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [{ message: { content: "ok" } }], usage: { total_tokens: 10 } }));
  expect(await sparkChat(env, [{ role: "user", content: "hi" }])).toBe("ok");
  expect(JSON.parse(String(fetch.mock.calls[0][1]!.body)).max_completion_tokens).toBe(6144);
  expect(await budgetUsage(env, "owner")).toMatchObject({ calls: 1, tokens: 10 });
  await expect(sparkChat(env, [{ role: "user", content: "hi" }])).rejects.toThrow("exhausted");
  await expect(sparkChat({ ...env, SPARK_DISABLED: "1" }, [])).rejects.toThrow("kill switch");
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRestore();
});
it("Spark retains reservations on provider 429 and network failures", async () => {
  const env = sparkTestEnv();
  globalThis.fetch = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
  await expect(sparkChat(env, [])).rejects.toThrow("429");
  const used = await budgetUsage(env, "owner");
  expect(used.calls).toBe(1);
  expect(used.tokens).toBeGreaterThanOrEqual(2048);
});
it("GitHub blocks queued calls after 429 and honors primary reset on a successful final request", async () => {
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response("", { status: 429, headers: { "retry-after": "120" } }); }) as unknown as typeof fetch;
  await expect(gh("/test", "429-test")).rejects.toThrow("rate limit");
  await expect(gh("/test", "429-test")).rejects.toThrow("rate limit");
  expect(requests).toBe(1);
  const now = Date.now();
  expect(githubCooldown(new Response("{}", { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil((now + 600000) / 1000)) } }), now, 0, false)).toBeGreaterThanOrEqual(now + 600000);
});
it("GitHub recognizes secondary 403 without treating permission errors as rate limits", async () => {
  globalThis.fetch = (async () => Response.json({ message: "You have exceeded a secondary rate limit." }, { status: 403 })) as unknown as typeof fetch;
  await expect(gh("/secondary", "secondary-test")).rejects.toThrow("rate limit");
  globalThis.fetch = (async () => Response.json({ message: "Resource not accessible" }, { status: 403 })) as unknown as typeof fetch;
  try { await gh("/permissions", "permission-test"); throw new Error("expected permission failure"); }
  catch (error) { expect((error as { cause?: { status: number } }).cause?.status).toBe(403); }
});
it("GitHub polling sends an ETag and returns the cached body only on 304", async () => {
  let calls = 0, conditional = "";
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { calls++; conditional = new Headers(init?.headers).get("if-none-match") ?? ""; return calls === 1 ? Response.json({ value: 42 }, { headers: { etag: '"v1"' } }) : new Response(null, { status: 304 }); }) as unknown as typeof fetch;
  expect(await gh("/etag", "etag-test")).toEqual({ value: 42 });
  expect(await gh("/etag", "etag-test")).toEqual({ value: 42 });
  expect(conditional).toBe('"v1"');
});
it("PostHog 429 respects seconds and HTTP dates; jitter never shortens retry deadlines", async () => {
  const now = Date.now();
  expect(retryAfterMs("120", now)).toBe(120000);
  expect(retryAfterMs(new Date(now + 120000).toUTCString(), now)).toBeGreaterThan(119000);
  for (const retry of ["120", new Date(now + 120000).toUTCString()]) {
    globalThis.fetch = (async () => new Response("", { status: 429, headers: { "retry-after": retry } })) as unknown as typeof fetch;
    try { await fetchRouteDays({ apiKey: "fake", projectId: "1" }); throw new Error("expected 429"); }
    catch (e) { expect((e as { retryAfter: number }).retryAfter).toBeGreaterThan(119); }
  }
  expect(pollDelay(300000, 1, 1200000, () => 0.5)).toBe(1230000);
  expect(pollDelay(300000, 0, 0, () => 0)).toBe(300000);
  expect(pollDelay(300000, 0, 0, () => 0.9)).toBeGreaterThan(300000);
});
it("one player's factories share a budget identity and collaborators cannot reset it", async () => {
  const { db, sqlite } = budgetDb();
  const account = await budgetAccount(db, "owner/repo");
  sqlite.exec("INSERT INTO user_repos VALUES('owner/another', 1), ('owner/repo', 0)");
  expect(await budgetAccount(db, "owner/another")).toBe(account);
  expect(await budgetAccount(db, "owner/repo")).toBe(account);
  await reserveSpark({ DB: db, SPARK_DAILY_CALLS: "1" }, account, 10);
  await expect(reserveSpark({ DB: db, SPARK_DAILY_CALLS: "1" }, await budgetAccount(db, "owner/another"), 10)).rejects.toThrow("exhausted");
});
it("persisted GitHub cooldown applies to a replacement credential and Worker context", async () => {
  const { registerGithubCredential } = await import("../src/github");
  const { db } = budgetDb();
  const scope = `github:test:${crypto.randomUUID()}`;
  await registerGithubCredential("old-credential", db, scope);
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response("", { status: 429, headers: { "retry-after": "180" } }); }) as unknown as typeof fetch;
  await expect(gh("/limited", "old-credential")).rejects.toThrow("rate limit");
  const saved = await db.prepare("SELECT next_at FROM api_limits WHERE scope = ?").bind(scope).first<{ next_at: number }>();
  expect(saved!.next_at).toBeGreaterThan(Date.now() + 179000);
  // A different local scope with copied persistent state models a new isolate with no in-memory cooldown.
  await db.prepare("INSERT INTO api_limits(scope, next_at, failures) SELECT ?, next_at, failures FROM api_limits WHERE scope = ?").bind(scope + ":new-isolate", scope).run();
  await registerGithubCredential("replacement-credential", db, scope + ":new-isolate");
  await expect(gh("/limited", "replacement-credential")).rejects.toThrow("rate limit");
  expect(requests).toBe(1);
});
it("Spark fails closed without its ledger or user identity", async () => {
  globalThis.fetch = (() => { throw new Error("must never fetch"); }) as unknown as typeof fetch;
  await expect(sparkChat({ META_API_KEY: "test" }, [])).rejects.toThrow("ledger/account unavailable");
});

it("each Spark provider retry is reserved and the daily cap stops retries before fetch", async () => {
  const env = { ...sparkTestEnv(), SPARK_DAILY_CALLS: "1" };
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response("", { status: 503 }); }) as unknown as typeof fetch;
  await expect(sparkChat(env, [])).rejects.toThrow("budget exhausted");
  expect(requests).toBe(1);
  expect((await budgetUsage(env, "owner")).calls).toBe(1);
});
