/** Retry-After accepts delta seconds or an HTTP date. Never retry before the server's deadline. */
export function retryAfterMs(value: string | null, now = Date.now(), fallback = 60000): number {
  if (!value) return fallback;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : fallback;
}
export function pollDelay(base: number, failures = 0, retryMs = 0, random = Math.random): number {
  return Math.max(retryMs, Math.min(3600000, base * 2 ** Math.min(failures, 6))) + Math.floor(random() * base * 0.2);
}
export class RateLimitError extends Error {
  constructor(public retryAt: number) { super(`GitHub rate limit; queued work retries after ${new Date(retryAt).toISOString()}`); }
}
export function githubCooldown(res: Response, now: number, failures: number, secondary: boolean): number {
  const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
  if (res.headers.get("x-ratelimit-remaining") === "0") return Math.max(now + 1000, reset || now + 60000, now + retryAfterMs(res.headers.get("retry-after"), now, 0));
  if (res.status === 429 || secondary) return now + Math.max(retryAfterMs(res.headers.get("retry-after"), now), Math.min(3600000, 60000 * 2 ** Math.min(failures, 6)));
  return 0;
}
