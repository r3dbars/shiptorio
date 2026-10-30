import { BudgetError, utcDay } from "./budget";

// Meta standard rates, nano-USD per token: https://dev.meta.ai/docs/pricing-rate-limits
// Spark checked 2026-10-26 ($1.25/M in, $0.15/M cached, $4.25/M out). Wonder from third-party reports of Meta's
// list price, 2026-10-16 ($4/M in, $0.20/M cached, $20/M out). Estimates, not a provider invoice.
export const NANO_USD = 1_000_000_000;
export const MODEL_PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "muse-spark-1.3": { input: 1250, cached: 150, output: 4250 },
  "muse-wonder-1.0": { input: 4000, cached: 200, output: 20000 },
};
const priceOf = (model: string) => MODEL_PRICES[model];
export const DEFAULT_DAILY_BUDGET = 5 * NANO_USD;
export interface TokenUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export function measuredCost(usage?: TokenUsage, model = "muse-spark-1.3") {
  const price = priceOf(model);
  if (!price || !usage || !count(usage.prompt_tokens) || !count(usage.completion_tokens)) return null;
  const input = usage.prompt_tokens, output = usage.completion_tokens, cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  if (!count(cached) || cached > input || !Number.isSafeInteger(input + output)) return null;
  const cost = (input - cached) * price.input + cached * price.cached + output * price.output;
  return Number.isSafeInteger(cost) ? { input, output, cached, cost } : null;
}
export async function reserveFactorySpend(db: D1Database, repo: string, input: number, output: number, model: string, now = Date.now()) {
  const price = priceOf(model);
  if (!price) throw new BudgetError("Planner spend pricing unavailable for this model; paid calls paused");
  const cost = input * price.input + output * price.output;
  if (!count(input) || !count(output) || !count(cost)) throw new BudgetError("Invalid Planner cost reservation");
  const id = crypto.randomUUID(), day = utcDay(now);
  // One statement checks and reserves: concurrent requests cannot both spend the remaining balance.
  const row = await db.prepare(`INSERT INTO spark_factory_calls(id, repo, day, model, nano_usd)
    SELECT ?, ?, ?, ?, ? WHERE COALESCE((SELECT SUM(nano_usd) FROM spark_factory_calls WHERE repo = ? AND day = ?), 0) + ?
    <= COALESCE((SELECT daily_nano_usd FROM spark_factory_budgets WHERE repo = ?), ?) RETURNING id`)
    .bind(id, repo.toLowerCase(), day, model, cost, repo.toLowerCase(), day, cost, repo.toLowerCase(), DEFAULT_DAILY_BUDGET).first();
  if (!row) throw new BudgetError("Planner daily dollar budget reached or too little remains for this call. I paused paid thinking to protect your budget. Raise the factory budget or wait until 00:00 UTC; existing PR checks and human merges can continue.");
  return id;
}
export async function settleFactorySpend(db: D1Database, id: string, usage?: TokenUsage, model?: string) {
  const measured = measuredCost(usage, model);
  if (!measured) return; // Missing/malformed usage and transport errors retain the full cost reservation.
  await db.prepare(`UPDATE spark_factory_calls SET input_tokens = ?, output_tokens = ?, cached_tokens = ?, nano_usd = ?, settled = 1 WHERE id = ? AND settled = 0`)
    .bind(measured.input, measured.output, measured.cached, measured.cost, id).run();
}
export async function factorySpend(db: D1Database, repo: string, now = Date.now()) {
  const day = utcDay(now);
  const row = await db.prepare("SELECT * FROM spark_factory_daily WHERE repo = ? AND day = ?").bind(repo.toLowerCase(), day)
    .first<{ calls: number; input_tokens: number; output_tokens: number; cached_tokens: number; nano_usd: number; unmeasured_calls: number }>();
  const budget = await db.prepare("SELECT daily_nano_usd FROM spark_factory_budgets WHERE repo = ?").bind(repo.toLowerCase()).first<{ daily_nano_usd: number }>();
  const daily = budget?.daily_nano_usd ?? DEFAULT_DAILY_BUDGET, cost = row?.nano_usd ?? 0;
  const status = cost >= daily ? "stopped" : cost >= daily * 0.8 ? "warning" : "ok";
  return { repo: repo.toLowerCase(), day, model: "muse-spark-1.3", calls: row?.calls ?? 0, inputTokens: row?.input_tokens ?? 0,
    outputTokens: row?.output_tokens ?? 0, cachedTokens: row?.cached_tokens ?? 0, unmeasuredCalls: row?.unmeasured_calls ?? 0,
    estimatedUsd: cost / NANO_USD, dailyBudgetUsd: daily / NANO_USD, status,
    explanation: status === "stopped" ? "I paused paid thinking because this factory reached its daily budget. Raise it or wait until 00:00 UTC. Existing PR checks and human merges can continue."
      : status === "warning" ? "This factory has used at least 80% of today's planner budget. I will pause paid thinking before another call could exceed it."
      : "Paid thinking pauses before a call could exceed the daily budget. Budgets reset at 00:00 UTC.",
    pricing: "Estimated at $1.25/M input, $0.15/M cached input, $4.25/M output. Unmeasured calls retain their reservation." };
}
export async function spendReport(db: D1Database, day = utcDay()) {
  return (await db.prepare("SELECT d.*, COALESCE(b.daily_nano_usd, 5000000000) AS daily_budget_nano_usd FROM spark_factory_daily d LEFT JOIN spark_factory_budgets b ON b.repo = d.repo WHERE day = ? ORDER BY nano_usd DESC, d.repo").bind(day).all()).results;
}
