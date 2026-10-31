import { afterEach, expect, it } from "bun:test";
import { testD1 } from "./d1-fixture";
import { accountSpend, siteDailyBudget, factorySpend, measuredCost, NANO_USD, reserveFactorySpend, settleFactorySpend, spendReport } from "../src/spend";
import { sparkChat } from "../src/spark";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
async function cap(db: D1Database, repo: string, dollars: number) {
  await db.prepare("INSERT INTO spark_factory_budgets VALUES (?, ?) ON CONFLICT(repo) DO UPDATE SET daily_nano_usd=excluded.daily_nano_usd").bind(repo, dollars * NANO_USD).run();
}
it("prices measured input/output and cached tokens with integer precision; rejects malformed usage", () => {
  expect(measuredCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 100_000 } }))
    .toEqual({ input: 1_000_000, output: 1_000_000, cached: 100_000, cost: 5_390_000_000 });
  // Muse Wonder: $4/M in, $0.20/M cached, $20/M out.
  expect(measuredCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 100_000 } }, "muse-wonder-1.0")?.cost).toBe(23_620_000_000);
  expect(measuredCost({ prompt_tokens: 1, completion_tokens: 1 }, "unknown-model")?.cost).toBe(22_000); // unpriced: 4x Spark
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
it("account denial cancels the factory reservation and unpriced models are charged 4x Spark", async () => {
  const db = testD1();
  await expect(sparkChat({ DB: db, META_API_KEY: "test", budgetRepo: "owner/repo", budgetAccount: async () => "user:1", SPARK_DAILY_CALLS: "0" }, [])).rejects.toThrow("budget exhausted");
  expect(await factorySpend(db, "owner/repo")).toMatchObject({ calls: 0, estimatedUsd: 0 });
  await reserveFactorySpend(db, "owner/repo", 1000, 1000, "muse-wonder-preview");
  expect(await factorySpend(db, "owner/repo")).toMatchObject({ calls: 1, estimatedUsd: 0.022 }); // 4 x $0.0055
  expect(measuredCost({ prompt_tokens: 1000, completion_tokens: 1000 }, "muse-wonder-preview")?.cost).toBe(22_000_000);
});
it("caps each paying account at $5/day across all its factories, overridable per account, resetting at UTC midnight", async () => {
  const db = testD1(), now = Date.parse("2026-10-30T12:00:00Z");
  // $2 per call at Spark rates; each factory alone is under its own $5 ceiling.
  const big = () => [1_600_000, 0] as const;
  await reserveFactorySpend(db, "owner/a", ...big(), "muse-spark-1.3", now, "user:1");
  await reserveFactorySpend(db, "owner/b", ...big(), "muse-spark-1.3", now, "user:1");
  await expect(reserveFactorySpend(db, "owner/c", ...big(), "muse-spark-1.3", now, "user:1")).rejects.toThrow("five dollars of AI");
  expect(await accountSpend(db, "user:1", now)).toMatchObject({ calls: 2, estimatedUsd: 4, dailyBudgetUsd: 5, status: "warning" });
  expect(await factorySpend(db, "owner/c", now, "user:1")).toMatchObject({ status: "warning", estimatedUsd: 0 });
  // Another account is untouched, and tomorrow starts fresh.
  await expect(reserveFactorySpend(db, "other/a", ...big(), "muse-spark-1.3", now, "user:2")).resolves.toBeString();
  await expect(reserveFactorySpend(db, "owner/c", ...big(), "muse-spark-1.3", now + 86400000, "user:1")).resolves.toBeString();
  // An operator override raises one account without a deploy.
  await db.prepare("INSERT INTO users(id, login) VALUES (1, 'owner')").run().catch(() => undefined);
  await db.prepare("INSERT INTO admin_user_limits(user_id, spend_nano_usd) VALUES (1, ?)").bind(10 * NANO_USD).run();
  await expect(reserveFactorySpend(db, "owner/c", ...big(), "muse-spark-1.3", now, "user:1")).resolves.toBeString();
});
it("charges calls without a factory to the account, so nothing slips past the cap", async () => {
  const db = testD1(), env = { DB: db, META_API_KEY: "test", budgetAccount: async () => "user:7" };
  globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } })) as unknown as typeof fetch;
  expect(await sparkChat(env, [])).toBe("ok");
  expect(await accountSpend(db, "user:7")).toMatchObject({ calls: 1, estimatedUsd: 0.00021 });
});
it("caps the whole site at $50/day by default, whoever is asking", async () => {
  const db = testD1(), now = Date.parse("2026-10-30T12:00:00Z");
  // $4 per call: every account stays under its own $5, but the site fills up.
  for (let user = 1; user <= 12; user++) await reserveFactorySpend(db, `u${user}/repo`, 3_200_000, 0, "muse-spark-1.3", now, `user:${user}`);
  await expect(reserveFactorySpend(db, "u13/repo", 3_200_000, 0, "muse-spark-1.3", now, "user:13")).rejects.toThrow("daily AI limit for everyone");
  await expect(reserveFactorySpend(db, "u13/repo", 3_200_000, 0, "muse-spark-1.3", now, "user:13", 100 * NANO_USD)).resolves.toBeString();
  expect(siteDailyBudget({})).toBe(50 * NANO_USD);
  expect(siteDailyBudget({ SPARK_SITE_DAILY_USD: "20" })).toBe(20 * NANO_USD);
});
