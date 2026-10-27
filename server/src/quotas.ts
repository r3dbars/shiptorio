import { budgetAccount, budgetUsage } from "./budget";
import { runQuotaStatus, isAdmin } from "./signup";
import { factorySpend } from "./spend";
import type { Env } from "./index";
import type { User } from "./accounts";
export function quota(id: string, label: string, used: number, limit: number, resetsAt: number | null, raiseUrl: string | null) {
  return { id, label, used, limit, resetsAt, raiseUrl, status: used >= limit ? "stopped" : used >= limit * 0.8 ? "warning" : "ok" };
}
/** Read-only telemetry. Never spends a run or calls Spark. All callers pass normal repo access checks. */
export async function quotaStatus(env: Env, repo: string, viewer: User) {
  const account = await budgetAccount(env.DB, repo);
  const owner = await env.DB.prepare("SELECT login FROM signup_resources WHERE kind='factory' AND resource=? ORDER BY rowid LIMIT 1").bind(repo).first<{login:string}>();
  if (!owner) throw new Error("Quota owner unavailable");
  const [runs, spark, spend, resources, caps] = await Promise.all([
    runQuotaStatus(env, owner.login), budgetUsage(env, account), factorySpend(env.DB, repo),
    env.DB.prepare('SELECT kind, COUNT(*) AS used FROM signup_resources WHERE login=? GROUP BY kind').bind(owner.login).all<{kind:string;used:number}>(),
    env.DB.prepare('SELECT factories,repos FROM signup_allowlist WHERE login=?').bind(owner.login).first<{factories:number;repos:number}>(),
  ]);
  const raiseUrl = isAdmin(env, viewer.login) ? `/admin/signup?login=${encodeURIComponent(owner.login)}` : null;
  const daily = runs.resetsAt;
  return { resetsAt: daily, disabled: spark.limits.disabled, quotas: [
    quota('runs', 'Build runs / day', runs.used, runs.limit, daily, raiseUrl),
    quota('spark-calls', 'Spark calls / day', spark.calls, spark.limits.calls, daily, raiseUrl),
    quota('spark-tokens', 'Spark tokens / day', spark.tokens, spark.limits.tokens, daily, raiseUrl),
    quota('spark-spend', 'Spark dollars / day', spend.estimatedUsd, spend.dailyBudgetUsd, daily, account === `user:${viewer.id}` ? "#planner-budget" : null),
    quota('factories', 'Connected factories', resources.results.find(r => r.kind === 'factory')?.used ?? 0, caps?.factories ?? 3, null, raiseUrl),
    quota('repos', 'Connected repos', resources.results.find(r => r.kind === 'repo')?.used ?? 0, caps?.repos ?? 3, null, raiseUrl),
  ] };
}
