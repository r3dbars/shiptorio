import { BudgetError, utcDay } from "./budget";

// Nano-USD per token. Meta standard rates for Spark, checked 2026-10-26: https://dev.meta.ai/docs/pricing-rate-limits
// Estimates, not a provider invoice.
export const MODEL_PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "muse-spark-1.3": { input: 1250, cached: 150, output: 4250 },
};
// Any model without a confirmed rate card (Muse Wonder runs ~4x Spark per call) is charged 4x Spark,
// so switching SPARK_MODEL can never slip past the daily dollar ceiling.
export const FALLBACK_PRICE = { input: 5000, cached: 600, output: 17000 };
export const modelPrice = (model: string) => MODEL_PRICES[model] ?? FALLBACK_PRICE;
export const NANO_USD = 1_000_000_000;
export const DEFAULT_DAILY_BUDGET = 5 * NANO_USD;
/** Every signed-in account gets $5/day of model spend across all the factories it pays for. Resets 00:00 UTC. */
export const ACCOUNT_DAILY_BUDGET = 5 * NANO_USD;
/** All accounts together: $50/day unless SPARK_SITE_DAILY_USD says otherwise. Protects the bill when strangers sign in. */
export const SITE_DAILY_BUDGET = 50 * NANO_USD;
export const siteDailyBudget = (env: { SPARK_SITE_DAILY_USD?: string }) => {
  const usd = Number(env.SPARK_SITE_DAILY_USD);
  return env.SPARK_SITE_DAILY_USD !== undefined && Number.isFinite(usd) && usd >= 0 ? Math.round(usd * NANO_USD) : SITE_DAILY_BUDGET;
};
export const SITE_CAP_LINE = "Shippy is done thinking for today: Shiptorio hit its daily AI limit for everyone. He's back at 00:00 UTC. The deck, reviews and merges keep working.";
export const ACCOUNT_CAP_LINE = "Shippy is done thinking for today: this account used its $5 of AI for the day. He's back at 00:00 UTC. The deck, reviews and merges keep working.";
const accountUserId = (account?: string) => account && /^user:-?\d+$/.test(account) ? Number(account.slice(5)) : null;
export async function accountDailyBudget(db: D1Database, account?: string) {
  const id = accountUserId(account);
  if (id === null) return ACCOUNT_DAILY_BUDGET;
  const row = await db.prepare("SELECT spend_nano_usd FROM admin_user_limits WHERE user_id = ?").bind(id).first<{ spend_nano_usd: number | null }>();
  return row?.spend_nano_usd ?? ACCOUNT_DAILY_BUDGET;
}
export async function accountSpend(db: D1Database, account: string, now = Date.now()) {
  const day = utcDay(now);
  const [row, daily] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(nano_usd), 0) AS nano_usd FROM spark_factory_calls WHERE account = ? AND day = ?").bind(account, day).first<{ calls: number; nano_usd: number }>(),
    accountDailyBudget(db, account),
  ]);
  const cost = row?.nano_usd ?? 0;
  return { account, day, calls: row?.calls ?? 0, estimatedUsd: cost / NANO_USD, dailyBudgetUsd: daily / NANO_USD,
    status: cost >= daily ? "stopped" as const : cost >= daily * 0.8 ? "warning" as const : "ok" as const };
}
export interface TokenUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export function measuredCost(usage?: TokenUsage, model = "muse-spark-1.3") {
  if (!usage || !count(usage.prompt_tokens) || !count(usage.completion_tokens)) return null;
  const input = usage.prompt_tokens, output = usage.completion_tokens, cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  if (!count(cached) || cached > input || !Number.isSafeInteger(input + output)) return null;
  const price = modelPrice(model), cost = (input - cached) * price.input + cached * price.cached + output * price.output;
  return Number.isSafeInteger(cost) ? { input, output, cached, cost } : null;
}
export async function reserveFactorySpend(db: D1Database, repo: string, input: number, output: number, model: string, now = Date.now(), account?: string, siteCap = SITE_DAILY_BUDGET) {
  const price = modelPrice(model), cost = input * price.input + output * price.output;
  if (!count(input) || !count(output) || !count(cost)) throw new BudgetError("Invalid Planner cost reservation");
  const id = crypto.randomUUID(), day = utcDay(now), accountCap = await accountDailyBudget(db, account);
  // One statement checks both ceilings and reserves: concurrent requests cannot both spend the remaining balance.
  const row = await db.prepare(`INSERT INTO spark_factory_calls(id, repo, day, model, nano_usd, account)
    SELECT ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT SUM(nano_usd) FROM spark_factory_calls WHERE repo = ? AND day = ?), 0) + ?
    <= COALESCE((SELECT daily_nano_usd FROM spark_factory_budgets WHERE repo = ?), ?)
    AND (? IS NULL OR COALESCE((SELECT SUM(nano_usd) FROM spark_factory_calls WHERE account = ? AND day = ?), 0) + ? <= ?)
    AND COALESCE((SELECT SUM(nano_usd) FROM spark_factory_calls WHERE day = ?), 0) + ? <= ? RETURNING id`)
    .bind(id, repo.toLowerCase(), day, model, cost, account ?? null, repo.toLowerCase(), day, cost, repo.toLowerCase(), DEFAULT_DAILY_BUDGET,
      account ?? null, account ?? null, day, cost, accountCap, day, cost, siteCap).first();
  if (!row) {
    const site = await db.prepare("SELECT COALESCE(SUM(nano_usd), 0) AS nano_usd FROM spark_factory_calls WHERE day = ?").bind(day).first<{ nano_usd: number }>();
    if ((site?.nano_usd ?? 0) + cost > siteCap) throw new BudgetError(`Site daily dollar budget reached. ${SITE_CAP_LINE}`);
  }
  if (!row && account && (await accountSpend(db, account, now)).estimatedUsd * NANO_USD + cost > accountCap) throw new BudgetError(`Account daily dollar budget reached. ${ACCOUNT_CAP_LINE}`);
  if (!row) throw new BudgetError("Planner daily dollar budget reached or too little remains for this call. I paused paid thinking to protect your budget. Raise the factory budget or wait until 00:00 UTC; existing PR checks and human merges can continue.");
  return id;
}
export async function settleFactorySpend(db: D1Database, id: string, usage?: TokenUsage, model?: string) {
  const measured = measuredCost(usage, model);
  if (!measured) return; // Missing/malformed usage and transport errors retain the full cost reservation.
  await db.prepare(`UPDATE spark_factory_calls SET input_tokens = ?, output_tokens = ?, cached_tokens = ?, nano_usd = ?, settled = 1 WHERE id = ? AND settled = 0`)
    .bind(measured.input, measured.output, measured.cached, measured.cost, id).run();
}
export async function factorySpend(db: D1Database, repo: string, now = Date.now(), account?: string) {
  const day = utcDay(now);
  const row = await db.prepare("SELECT * FROM spark_factory_daily WHERE repo = ? AND day = ?").bind(repo.toLowerCase(), day)
    .first<{ calls: number; input_tokens: number; output_tokens: number; cached_tokens: number; nano_usd: number; unmeasured_calls: number }>();
  const budget = await db.prepare("SELECT daily_nano_usd FROM spark_factory_budgets WHERE repo = ?").bind(repo.toLowerCase()).first<{ daily_nano_usd: number }>();
  const daily = budget?.daily_nano_usd ?? DEFAULT_DAILY_BUDGET, cost = row?.nano_usd ?? 0;
  const own = account ? await accountSpend(db, account, now) : null;
  const factoryStatus = cost >= daily ? "stopped" : cost >= daily * 0.8 ? "warning" : "ok";
  const rank = { ok: 0, warning: 1, stopped: 2 } as const;
  // The tighter ceiling wins: a factory under its own budget still rests once its paying account is spent.
  const status = own && rank[own.status] > rank[factoryStatus] ? own.status : factoryStatus;
  const accountLimited = !!own && status !== factoryStatus;
  return { repo: repo.toLowerCase(), day, model: "muse-spark-1.3", account: own, calls: row?.calls ?? 0, inputTokens: row?.input_tokens ?? 0,
    outputTokens: row?.output_tokens ?? 0, cachedTokens: row?.cached_tokens ?? 0, unmeasuredCalls: row?.unmeasured_calls ?? 0,
    estimatedUsd: cost / NANO_USD, dailyBudgetUsd: daily / NANO_USD, status,
    explanation: accountLimited ? (status === "stopped" ? ACCOUNT_CAP_LINE : "This account has used at least 80% of today's $5 of AI. Shippy pauses before another call could go over.") : status === "stopped" ? "I paused paid thinking because this factory reached its daily budget. Raise it or wait until 00:00 UTC. Existing PR checks and human merges can continue."
      : status === "warning" ? "This factory has used at least 80% of today's planner budget. I will pause paid thinking before another call could exceed it."
      : "Paid thinking pauses before a call could exceed the daily budget. Budgets reset at 00:00 UTC.",
    pricing: "Estimated at $1.25/M input, $0.15/M cached input, $4.25/M output for Spark; other models at 4x until priced. Unmeasured calls retain their reservation." };
}
export async function spendReport(db: D1Database, day = utcDay()) {
  return (await db.prepare("SELECT d.*, COALESCE(b.daily_nano_usd, 5000000000) AS daily_budget_nano_usd FROM spark_factory_daily d LEFT JOIN spark_factory_budgets b ON b.repo = d.repo WHERE day = ? ORDER BY nano_usd DESC, d.repo").bind(day).all()).results;
}
