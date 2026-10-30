import type { Move } from "@shiptorio/shared";
import { accountBudgetLimits, utcDay, type BudgetEnv } from "./budget";
import { factorySpend } from "./spend";
export const MAX_PLANNING_FAILURES = 3;
export const PLANNING_DEADLINE_MS = 120_000;
export const PLANNER_REST_KEY = "planningRetry:planner";
export type PlanningFailureKind = "rate_limit" | "unavailable" | "timeout" | "cap" | "bad_output" | "other";
export interface PlanningCapacity { calls: number; tokens: number; spend: number }
export interface PlanningRetry { day: string; failures: number; retryAt: number; reason: string; kind?: PlanningFailureKind; capacity?: PlanningCapacity }
/** Read-only limit snapshots: waking on a raised cap must never reserve or refund a paid call. */
export async function planningCapacity(env: BudgetEnv, account: string, repo: string): Promise<PlanningCapacity> {
  const limits = await accountBudgetLimits(env, account);
  const spend = await factorySpend(env.DB!, repo, Date.now(), account);
  // The tighter dollar ceiling decides; raising either one wakes the planner.
  return { calls: limits.calls, tokens: limits.tokens, spend: Math.min(spend.dailyBudgetUsd, spend.account?.dailyBudgetUsd ?? Infinity) };
}
export const planningCapacityRaised = (previous: PlanningCapacity, current: PlanningCapacity) =>
  current.calls > previous.calls || current.tokens > previous.tokens || current.spend > previous.spend;
export const nextPlanningDay = (now = Date.now()) => (Math.floor(now / 86400000) + 1) * 86400000;
export function planningFailureKind(error: unknown): PlanningFailureKind {
  if (error instanceof Error && error.cause) return planningFailureKind(error.cause);
  const message = String(error instanceof Error ? error.message : error);
  // No connected owner yet is a setup gap, not a planner outage: resting the whole planner would hide it.
  if (/budget owner unavailable/i.test(message)) return "other";
  if (/daily.*(?:budget|cap)|budget exhausted/i.test(message)) return "cap";
  if (/429|rate limit/i.test(message)) return "rate_limit";
  if (/timeout|timed out|deadline|abort|planner interrupted/i.test(message)) return "timeout";
  if (/JSON|output|schema|no content|no card order|planning turns|unapproved|assignment|tool needs/i.test(message)) return "bad_output";
  if (/5\d\d|offline|network|fetch failed|failed to fetch|load failed|connection|ECONN|unavailable/i.test(message)) return "unavailable";
  return "other";
}
const RATE_LIMITED = /^GitHub rate limit; queued work retries after (\S+)/;
export function planningFailure(previous: PlanningRetry | undefined, error: unknown, now = Date.now()): PlanningRetry {
  const reason = (error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error)).replace(/\bSpark\b/gi, "planner");
  const kind = planningFailureKind(error);
  const today = previous?.day === utcDay(now) ? previous.failures : 0;
  const midnight = nextPlanningDay(now);
  const limited = RATE_LIMITED.exec(reason);
  if (limited) {
    const at = Date.parse(limited[1]);
    return { day: utcDay(now), failures: today, reason, retryAt: Math.min(midnight, at > now ? at : now + 60000) };
  }
  const failures = Math.min(MAX_PLANNING_FAILURES, today + 1);
  const requested = error && typeof error === "object" && "retryAt" in error ? Number(error.retryAt) : 0;
  const retryAt = kind === "cap" || failures >= MAX_PLANNING_FAILURES ? midnight : Math.min(midnight, now + 60000 * 2 ** (failures - 1));
  return { day: utcDay(now), failures, reason, kind, retryAt: kind === "rate_limit" && Number.isFinite(requested) ? Math.max(retryAt, requested) : retryAt };
}
export function planningHold(retry: PlanningRetry | undefined, now = Date.now()) {
  if (!retry) return null;
  if (retry.day !== utcDay(now)) return retry.kind === "rate_limit" && retry.retryAt > now ? retry : null;
  // Legacy daily failure caps and GitHub cooldowns from #312 retain their original semantics.
  if (!retry.kind && retry.failures >= MAX_PLANNING_FAILURES) {
    const midnight = nextPlanningDay(now);
    const limited = RATE_LIMITED.exec(retry.reason);
    const at = limited ? Date.parse(limited[1]) : NaN;
    if (!Number.isFinite(at)) return { ...retry, retryAt: midnight };
    const retryAt = Math.min(retry.retryAt, at, midnight);
    return retryAt > now ? { ...retry, retryAt } : null;
  }
  return retry.retryAt > now ? retry : null;
}
/** A timeout or 429 is the planner being busy for a moment, not a broken station. */
export const plannerBusy = (retry: { kind?: PlanningFailureKind } | null | undefined) => retry?.kind === "rate_limit" || retry?.kind === "timeout";
export const PLANNER_BUSY_LINE = "Planner is thinking, back in a moment.";
/** One informational card, with an absolute reset carried as data for browser-local display. */
export function plannerRestDeck(deck: Move[], retry: PlanningRetry | undefined, now = Date.now()): Move[] {
  const cards = deck.filter(m => m.id !== "planner-rest");
  const hold = planningHold(retry, now);
  if (!hold) return cards;
  // Only a short rest reads as "a moment"; a long one keeps its reset time.
  const busy = plannerBusy(hold) && hold.retryAt - now <= 15 * 60000;
  const until = new Date(hold.retryAt).toISOString().slice(11, 16);
  // The $5/day account ceiling is a normal part of the day, not an outage: Shippy says so plainly.
  const spent = hold.kind === "cap" && /(?:account|site) daily dollar budget/i.test(hold.reason);
  const everyone = /site daily dollar budget/i.test(hold.reason);
  return [...cards.slice(0, 11), { id: "planner-rest", title: busy ? PLANNER_BUSY_LINE : spent ? "Shippy is done thinking for today" : `Planner is resting until ${until} UTC`,
    why: busy ? "It picks up on its own. You can keep reviewing existing work." : spent ? `${everyone ? "Shiptorio used today's AI for everyone" : "This account used today's $5 of AI"}. He's back at ${until} UTC. You can keep reviewing and shipping.` : "Planning resumes automatically. You can keep reviewing existing work.", kind: "unblock", createdAt: now,
    options: [{ id: "later", label: "Continue", recommended: true, actions: [] }],
    plan: [new Date(hold.retryAt).toISOString()] }];
}
/** Bounds the whole multi-turn plan, including reads. Late continuations must check the signal before saving. */
export async function planningDeadline<T>(run: (signal: AbortSignal) => Promise<T>, ms = PLANNING_DEADLINE_MS): Promise<T> {
  if (ms <= 0) throw new Error("Planner deadline reached");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { const error = new Error("Planner deadline reached"); controller.abort(error); reject(error); }, Math.max(0, ms));
  });
  try { return await Promise.race([expired, run(controller.signal)]); }
  finally { clearTimeout(timer!); }
}
