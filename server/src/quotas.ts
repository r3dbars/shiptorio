import { budgetAccount, budgetUsage } from "./budget";
import { runQuotaStatus, isAdmin, isQuotaOwner } from "./signup";
import { factorySpend } from "./spend";
import type { Env } from "./index";
import type { User } from "./accounts";
export function quota(id: string, label: string, used: number, limit: number, resetsAt: number | null, raiseUrl: string | null) {
  return { id, label, used, limit, resetsAt, raiseUrl, status: used >= limit ? "stopped" : used >= limit * 0.8 ? "warning" : "ok" };
}
/** Read-only telemetry. Never spends a run or calls Spark. All callers pass normal repo access checks. */
export async function quotaStatus(env: Env, repo: string, viewer: User, readonly = false) {
  const payerRow = readonly ? await env.DB.prepare('SELECT user_id FROM factory_budget_owners WHERE repo=?').bind(repo).first<{user_id:number}>() : null;
  const account = readonly ? `user:${payerRow?.user_id ?? viewer.id}` : await budgetAccount(env.DB, repo);
  let owner = await env.DB.prepare("SELECT login FROM signup_resources WHERE kind='factory' AND resource=? ORDER BY rowid LIMIT 1").bind(repo).first<{login:string}>();
  if (!owner && readonly) owner = {login:viewer.login};
  if (!owner) throw new Error("Quota owner unavailable");
  const [runs, spark, spend, resources, caps] = await Promise.all([
    runQuotaStatus(env, owner.login), budgetUsage(env, account), factorySpend(env.DB, repo, Date.now(), account),
    env.DB.prepare('SELECT kind, COUNT(*) AS used FROM signup_resources WHERE login=? GROUP BY kind').bind(owner.login).all<{kind:string;used:number}>(),
    env.DB.prepare('SELECT factories,repos FROM signup_allowlist WHERE login=?').bind(owner.login).first<{factories:number;repos:number}>(),
  ]);
  const payer = await env.DB.prepare('SELECT login FROM users WHERE id=?').bind(Number(account.slice(5))).first<{login:string}>();
  const sparkRaiseUrl = isAdmin(env, viewer.login) && payer ? `/admin/signup?login=${encodeURIComponent(payer.login.toLowerCase())}` : null;
  const raiseUrl = isAdmin(env, viewer.login) ? `/admin/signup?login=${encodeURIComponent(owner.login)}` : null;
  const daily = runs.resetsAt;
  return { resetsAt: daily, disabled: spark.limits.disabled, quotas: [
    quota('runs', 'Build runs / day', runs.used, runs.limit, daily, raiseUrl),
    quota('spark-calls', 'Spark calls / day', spark.calls, spark.limits.calls, daily, sparkRaiseUrl),
    quota('spark-tokens', 'Spark tokens / day', spark.tokens, spark.limits.tokens, daily, sparkRaiseUrl),
    ...(account === `user:${viewer.id}` ? [quota('spark-spend', 'Spark dollars / day', spend.estimatedUsd, spend.dailyBudgetUsd, daily, "#planner-budget")] : []),
    ...(spend.account ? [quota('account-spend', 'AI dollars / day (account)', spend.account.estimatedUsd, spend.account.dailyBudgetUsd, daily, sparkRaiseUrl)] : []),
    quota('factories', 'Connected factories', resources.results.find(r => r.kind === 'factory')?.used ?? 0, isQuotaOwner(env, owner.login) ? 99999 : caps?.factories ?? 3, null, raiseUrl),
    quota('repos', 'Connected repos', resources.results.find(r => r.kind === 'repo')?.used ?? 0, isQuotaOwner(env, owner.login) ? 99999 : caps?.repos ?? 3, null, raiseUrl),
  ] };
}
