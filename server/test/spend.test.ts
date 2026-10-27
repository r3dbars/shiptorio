import { afterEach, expect, it } from "bun:test";
import { testD1 } from "./d1-fixture";
import { factorySpend, measuredCost, NANO_USD, reserveFactorySpend, settleFactorySpend, spendReport } from "../src/spend";
import { sparkChat } from "../src/spark";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
async function cap(db: D1Database, repo: string, dollars: number) {
  await db.prepare("INSERT INTO spark_factory_budgets VALUES (?, ?) ON CONFLICT(repo) DO UPDATE SET daily_nano_usd=excluded.daily_nano_usd").bind(repo, dollars * NANO_USD).run();
}
it("prices measured input/output and cached tokens with integer precision; rejects malformed usage", () => {
  expect(measuredCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 100_000 } }))
    .toEqual({ input: 1_000_000, output: 1_000_000, cached: 100_000, cost: 5_390_000_000 });
  for (const usage of [undefined, {}, { prompt_tokens: -1, completion_tokens: 1 }, { prompt_tokens: 1.1, completion_tokens: 1 }, { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 2 } }]) expect(measuredCost(usage)).toBeNull();
});
it("atomically reserves concurrent calls up to 100%, isolates factories and stops at zero", async () => {
  const db = testD1();
  await cap(db, "owner/one", 0.01); // each reservation costs $0.005
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserveFactorySpend(db, "owner/one", 4000, 0, "muse-spark-1.3")));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
  expect(await factorySpend(db, "owner/one")).toMatchObject({ calls: 2, estimatedUsd: 0.01, status: "stopped", inputTokens: 0, unmeasuredCalls: 2 });
  await expect(reserveFactorySpend(db, "owner/two", 4000, 0, "muse-spark-1.3")).resolves.toBeString();
  await cap(db, "owner/zero", 0);
  await expect(reserveFactorySpend(db, "owner/zero", 1, 1, "muse-spark-1.3")).rejects.toThrow("budget");
});
it("settles once, keeps unknown calls reserved, warns at exactly 80%, and resets at UTC midnight", async () => {
  const db = testD1(), now = Date.parse("2026-10-26T23:59:59Z");
  await cap(db, "owner/repo", 0.01);
  const id = await reserveFactorySpend(db, "OWNER/REPO", 7200, 0, "muse-spark-1.3", now);
  await settleFactorySpend(db, id, { prompt_tokens: 6400, completion_tokens: 0 });
  await settleFactorySpend(db, id, { prompt_tokens: 1, completion_tokens: 1 });
  expect(await factorySpend(db, "owner/repo", now)).toMatchObject({ calls: 1, inputTokens: 6400, outputTokens: 0, estimatedUsd: 0.008, status: "warning", unmeasuredCalls: 0 });
  expect(await factorySpend(db, "owner/repo", now + 1000)).toMatchObject({ calls: 0, estimatedUsd: 0, status: "ok", dailyBudgetUsd: 0.01 });
  expect(await spendReport(db, "2026-10-26")).toMatchObject([{ repo: "owner/repo", input_tokens: 6400, calls: 1 }]);
  const ambiguous = await reserveFactorySpend(db, "other/repo", 10, 10, "muse-spark-1.3", now);
  await settleFactorySpend(db, ambiguous, undefined);
  expect(await factorySpend(db, "other/repo", now)).toMatchObject({ unmeasuredCalls: 1, estimatedUsd: 0.000055 });
});
it("records Spark usage, denies calls before fetch and preserves unknown provider attempts", async () => {
  const db = testD1(), env = { DB: db, META_API_KEY: "test", budgetRepo: "owner/repo", budgetAccount: async () => "user:1" };
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }); }) as unknown as typeof fetch;
  expect(await sparkChat(env, [])).toBe("ok");
  expect(await factorySpend(db, env.budgetRepo)).toMatchObject({ calls: 1, inputTokens: 100, outputTokens: 20, estimatedUsd: 0.00021 });
  await cap(db, env.budgetRepo, 0);
  await expect(sparkChat(env, [])).rejects.toThrow("daily dollar budget");
  expect(calls).toBe(1);
  await cap(db, env.budgetRepo, 1);
  globalThis.fetch = (async () => { calls++; return new Response("", { status: 429 }); }) as unknown as typeof fetch;
  await expect(sparkChat(env, [])).rejects.toThrow("429");
  expect(await factorySpend(db, env.budgetRepo)).toMatchObject({ calls: 2, unmeasuredCalls: 1 });
});
it("account denial cancels the factory reservation and unsupported model prices fail closed", async () => {
  const db = testD1();
  await expect(sparkChat({ DB: db, META_API_KEY: "test", budgetRepo: "owner/repo", budgetAccount: async () => "user:1", SPARK_DAILY_CALLS: "0" }, [])).rejects.toThrow("budget exhausted");
  expect(await factorySpend(db, "owner/repo")).toMatchObject({ calls: 0, estimatedUsd: 0 });
  await expect(reserveFactorySpend(db, "owner/repo", 10, 10, "unknown-model")).rejects.toThrow("pricing unavailable");
});
