import { utcDay } from "./budget";
export const MAX_PLANNING_FAILURES = 3;
export interface PlanningRetry { day: string; failures: number; retryAt: number; reason: string }
// A GitHub rate limit is the factory waiting its turn, not the plan failing (src/rate-limit.ts RateLimitError).
// It pauses the issue until GitHub's retry time without spending one of its daily tries.
const RATE_LIMITED = /^GitHub rate limit; queued work retries after (\S+)/;
export function planningFailure(previous: PlanningRetry | undefined, reason: string, now = Date.now()): PlanningRetry {
  const today = previous?.day === utcDay(now) ? previous.failures : 0;
  const midnight = (Math.floor(now / 86400000) + 1) * 86400000;
  const limited = RATE_LIMITED.exec(reason);
  if (limited) {
    const at = Date.parse(limited[1]);
    return { day: utcDay(now), failures: today, reason, retryAt: Math.min(midnight, at > now ? at : now + 60000) };
  }
  const failures = today + 1;
  return { day: utcDay(now), failures, reason, retryAt: failures >= MAX_PLANNING_FAILURES ? midnight : Math.min(midnight, now + 60000 * 2 ** (failures - 1)) };
}
export function planningHold(retry: PlanningRetry | undefined, now = Date.now()) {
  if (!retry || retry.day !== utcDay(now)) return null;
  // The per-issue daily cap also holds if an old cooldown timestamp has already elapsed. A ledger whose
  // latest entry is a rate limit only waits out that pause: older ledgers counted rate limits as tries.
  if (retry.failures >= MAX_PLANNING_FAILURES && !RATE_LIMITED.test(retry.reason)) return { ...retry, retryAt: (Math.floor(now / 86400000) + 1) * 86400000 };
  return retry.retryAt > now ? retry : null;
}
