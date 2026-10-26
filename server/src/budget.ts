export interface BudgetEnv {
  DB?: D1Database;
  SPARK_DISABLED?: string;
  SPARK_DAILY_CALLS?: string;
  SPARK_DAILY_TOKENS?: string;
  SPARK_MAX_OUTPUT_TOKENS?: string;
  FACTORY_CONCURRENT_JOBS?: string;
}
export const limit = (value: string | undefined, fallback: number) => value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
export const budgetLimits = (env: BudgetEnv) => ({ calls: limit(env.SPARK_DAILY_CALLS, 200), tokens: limit(env.SPARK_DAILY_TOKENS, 500000), output: Math.min(limit(env.SPARK_MAX_OUTPUT_TOKENS, 2048), 16384), jobs: limit(env.FACTORY_CONCURRENT_JOBS, 1), disabled: env.SPARK_DISABLED === "1" });
export class BudgetError extends Error {}
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export async function budgetAccount(db: D1Database, installationId: number): Promise<string> {
  const row = await db.prepare("SELECT account_login FROM installations WHERE id = ?").bind(installationId).first<{ account_login: string }>();
  if (!row?.account_login) throw new BudgetError("Budget account unavailable; Spark paused");
  return row.account_login.toLowerCase();
}
export async function reserveSpark(env: BudgetEnv, account: string, tokens: number) {
  const caps = budgetLimits(env), day = utcDay();
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
    .bind(Math.max(0, reservation.tokens - actual), reservation.account, reservation.day).run();
}
export async function budgetUsage(env: BudgetEnv, account: string) {
  const day = utcDay();
  const usage = await env.DB!.prepare("SELECT calls, tokens FROM spark_usage WHERE account = ? AND day = ?").bind(account, day).first<{ calls: number; tokens: number }>();
  return { day, account, calls: usage?.calls ?? 0, tokens: usage?.tokens ?? 0, limits: budgetLimits(env) };
}
