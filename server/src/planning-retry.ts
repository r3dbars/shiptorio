import { utcDay } from "./budget";
export const MAX_PLANNING_FAILURES = 3;
export interface PlanningRetry { day: string; failures: number; retryAt: number; reason: string }
export function planningFailure(previous: PlanningRetry | undefined, reason: string, now = Date.now()): PlanningRetry {
  const failures = (previous?.day === utcDay(now) ? previous.failures : 0) + 1;
  const midnight = (Math.floor(now / 86400000) + 1) * 86400000;
  return { day: utcDay(now), failures, reason, retryAt: failures >= MAX_PLANNING_FAILURES ? midnight : Math.min(midnight, now + 60000 * 2 ** (failures - 1)) };
}
export function planningHold(retry: PlanningRetry | undefined, now = Date.now()) {
  if (!retry || retry.day !== utcDay(now)) return null;
  // The per-issue daily cap also holds if an old cooldown timestamp has already elapsed.
  if (retry.failures >= MAX_PLANNING_FAILURES) return { ...retry, retryAt: (Math.floor(now / 86400000) + 1) * 86400000 };
  return retry.retryAt > now ? retry : null;
}
