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
  expect(await budgetAccount(db, 1)).toBe("owner");
  await expect(budgetAccount(db, 99)).rejects.toThrow("unavailable");
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
  expect(budgetLimits({ SPARK_DAILY_CALLS: "NaN", FACTORY_CONCURRENT_JOBS: "0" })).toMatchObject({ calls: 200, jobs: 0 });
});
it("Spark reserves every outbound call, caps output, and never fetches when disabled or exhausted", async () => {
  const env = { ...sparkTestEnv(), SPARK_DAILY_CALLS: "1" };
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [{ message: { content: "ok" } }], usage: { total_tokens: 10 } }));
  expect(await sparkChat(env, [{ role: "user", content: "hi" }])).toBe("ok");
  expect(JSON.parse(String(fetch.mock.calls[0][1]!.body)).max_completion_tokens).toBe(2048);
  expect(await budgetUsage(env, "owner")).toMatchObject({ calls: 1, tokens: 10 });
  await expect(sparkChat(env, [{ role: "user", content: "hi" }])).rejects.toThrow("exhausted");
  await expect(sparkChat({ ...env, SPARK_DISABLED: "1" }, [])).rejects.toThrow("kill switch");
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRestore();
});
it("Spark retains reservations on provider 429 and network failures", async () => {
  const env = sparkTestEnv();
  globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;
  await expect(sparkChat(env, [])).rejects.toThrow("429");
  const used = await budgetUsage(env, "owner");
  expect(used.calls).toBe(1);
  expect(used.tokens).toBeGreaterThanOrEqual(2048);
});
it("GitHub blocks queued calls after 429 and honors primary reset on a successful final request", async () => {
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response("", { status: 429, headers: { "retry-after": "120" } }); }) as typeof fetch;
  await expect(gh("/test", "429-test")).rejects.toThrow("rate limit");
  await expect(gh("/test", "429-test")).rejects.toThrow("rate limit");
  expect(requests).toBe(1);
  const now = Date.now();
  expect(githubCooldown(new Response("{}", { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil((now + 600000) / 1000)) } }), now, 0, false)).toBeGreaterThanOrEqual(now + 600000);
});
it("GitHub recognizes secondary 403 without treating permission errors as rate limits", async () => {
  globalThis.fetch = (async () => Response.json({ message: "You have exceeded a secondary rate limit." }, { status: 403 })) as typeof fetch;
  await expect(gh("/secondary", "secondary-test")).rejects.toThrow("rate limit");
  globalThis.fetch = (async () => Response.json({ message: "Resource not accessible" }, { status: 403 })) as typeof fetch;
  await expect(gh("/permissions", "permission-test")).rejects.toThrow("failed (403)");
});
it("GitHub polling sends an ETag and returns the cached body only on 304", async () => {
  let calls = 0, conditional = "";
  globalThis.fetch = (async (_url, init) => { calls++; conditional = new Headers(init?.headers).get("if-none-match") ?? ""; return calls === 1 ? Response.json({ value: 42 }, { headers: { etag: '"v1"' } }) : new Response(null, { status: 304 }); }) as typeof fetch;
  expect(await gh("/etag", "etag-test")).toEqual({ value: 42 });
  expect(await gh("/etag", "etag-test")).toEqual({ value: 42 });
  expect(conditional).toBe('"v1"');
});
it("PostHog 429 respects seconds and HTTP dates; jitter never shortens retry deadlines", async () => {
  const now = Date.now();
  expect(retryAfterMs("120", now)).toBe(120000);
  expect(retryAfterMs(new Date(now + 120000).toUTCString(), now)).toBeGreaterThan(119000);
  for (const retry of ["120", new Date(now + 120000).toUTCString()]) {
    globalThis.fetch = (async () => new Response("", { status: 429, headers: { "retry-after": retry } })) as typeof fetch;
    try { await fetchRouteDays({ apiKey: "fake", projectId: "1" }); throw new Error("expected 429"); }
    catch (e) { expect((e as { retryAfter: number }).retryAfter).toBeGreaterThan(119); }
  }
  expect(pollDelay(300000, 1, 1200000, () => 0.5)).toBe(1230000);
  expect(pollDelay(300000, 0, 0, () => 0)).toBe(300000);
  expect(pollDelay(300000, 0, 0, () => 0.9)).toBeGreaterThan(300000);
});
