import { ShiptorioError } from "./errors";
export interface BudgetEnv {
  DB?: D1Database;
  SPARK_DISABLED?: string;
  SPARK_DAILY_CALLS?: string;
  SPARK_DAILY_TOKENS?: string;
  SPARK_MAX_OUTPUT_TOKENS?: string;
  FACTORY_CONCURRENT_JOBS?: string;
}
export const limit = (value: string | undefined, fallback: number) => value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
export const budgetLimits = (env: BudgetEnv) => ({ calls: limit(env.SPARK_DAILY_CALLS, 400), tokens: limit(env.SPARK_DAILY_TOKENS, 1000000), output: Math.min(limit(env.SPARK_MAX_OUTPUT_TOKENS, 6144), 16384), jobs: limit(env.FACTORY_CONCURRENT_JOBS, 1), disabled: env.SPARK_DISABLED === "1" });
export class BudgetError extends ShiptorioError {}
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export async function budgetAccount(db: D1Database, repo: string): Promise<string> {
  await db.prepare(`INSERT INTO factory_budget_owners(repo, user_id)
    SELECT repo, user_id FROM user_repos WHERE repo = ? ORDER BY user_id LIMIT 1
    ON CONFLICT(repo) DO NOTHING`).bind(repo.toLowerCase()).run();
  const row = await db.prepare("SELECT user_id FROM factory_budget_owners WHERE repo = ?").bind(repo.toLowerCase()).first<{ user_id: number }>();
  if (!row || !Number.isSafeInteger(row.user_id)) throw new BudgetError("Budget owner unavailable; sign in and connect this repo to resume Spark");
  return `user:${row.user_id}`;
}

/** Account overrides are read on every reservation: raising a limit resumes without a restart. */
export async function accountBudgetLimits(env: BudgetEnv, account: string) {
  const caps = budgetLimits(env);
  if (!account.startsWith("user:")) return caps;
  if (!env.DB) throw new BudgetError("Budget ledger unavailable; Spark paused");
  const row = await env.DB!.prepare(`SELECT a.spark_calls_daily, a.spark_tokens_daily FROM users u
    LEFT JOIN signup_allowlist a ON lower(a.login) = lower(u.login) WHERE u.id = ?`)
    .bind(Number(account.slice(5))).first<{ spark_calls_daily: number | null; spark_tokens_daily: number | null }>();
  return { ...caps, calls: row?.spark_calls_daily ?? caps.calls, tokens: row?.spark_tokens_daily ?? caps.tokens };
}

export async function reserveSpark(env: BudgetEnv, account: string, tokens: number) {
  const caps = await accountBudgetLimits(env, account), day = utcDay();
  if (!Number.isSafeInteger(tokens) || tokens <= 0) throw new BudgetError("Invalid token reservation");
  if (caps.disabled) throw new BudgetError("Spark budget: global kill switch is on");
  if (!env.DB) throw new BudgetError("Budget ledger unavailable; Spark paused");
  const row = await env.DB.prepare(`INSERT INTO spark_usage(account, day, calls, tokens)
    SELECT ?, ?, 1, ? WHERE ? >= 1 AND ? <= ?
    ON CONFLICT(account, day) DO UPDATE SET calls = calls + 1, tokens = tokens + excluded.tokens
    WHERE calls < ? AND tokens + excluded.tokens <= ? RETURNING calls, tokens`)
    .bind(account, day, tokens, caps.calls, tokens, caps.tokens, caps.calls, caps.tokens).first<{ calls: number; tokens: number }>();
  if (!row) throw new BudgetError("Spark daily call/token budget exhausted; fixed rules or player input required");
  return { account, day, tokens };
}
export async function settleSpark(env: BudgetEnv, reservation: { account: string; day: string; tokens: number }, actual: unknown) {
  // Failed/ambiguous calls keep their entire reservation. Never refund calls.
  if (typeof actual !== "number" || !Number.isSafeInteger(actual) || actual < 0) return;
  await env.DB!.prepare("UPDATE spark_usage SET tokens = MAX(0, tokens - ?) WHERE account = ? AND day = ?")
    .bind(reservation.tokens - actual, reservation.account, reservation.day).run();
}
export async function budgetUsage(env: BudgetEnv, account: string) {
  const day = utcDay();
  const usage = await env.DB!.prepare("SELECT calls, tokens FROM spark_usage WHERE account = ? AND day = ?").bind(account, day).first<{ calls: number; tokens: number }>();
  return { day, account, calls: usage?.calls ?? 0, tokens: usage?.tokens ?? 0, limits: await accountBudgetLimits(env, account) };
}

export async function budgetReport(env: BudgetEnv) {
  const day = utcDay();
  const rows = await env.DB!.prepare("SELECT account, calls, tokens FROM spark_usage WHERE day = ? ORDER BY account").bind(day).all();
  return { day, limits: budgetLimits(env), usage: rows.results };
}
