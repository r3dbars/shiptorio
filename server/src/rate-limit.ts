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

// Counters use the existing Factory namespace, in dedicated per-subject objects.
// A single bounded record survives isolate restarts; transactions serialize all
// connections for that identity. Idle objects have no alarms or growing key list.
export type Budget = "auth" | "connect" | "socket" | "move";
export const LIMITS: Record<Budget, number> = { auth: 20, connect: 30, socket: 60, move: 120 };
export interface LimitResult { allowed: boolean; retryAfter: number }
interface Window { start: number; count: number }
interface Counter { windows: Partial<Record<Budget, Window>> }
interface Storage {
  transaction<T>(fn: (tx: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<unknown> }) => Promise<T>): Promise<T>;
}

export async function consumeBudget(storage: Storage, budget: Budget, now = Date.now()): Promise<LimitResult> {
  if (!Object.hasOwn(LIMITS, budget)) throw new Error("unknown security budget");
  return storage.transaction(async tx => {
    const counter = await tx.get<Counter>("security-budget") ?? { windows: {} };
    let window = counter.windows[budget];
    if (!window || now >= window.start + 60_000) window = { start: now, count: 0 };
    const retryAfter = Math.max(1, Math.ceil((window.start + 60_000 - now) / 1000));
    if (window.count >= LIMITS[budget]) return { allowed: false, retryAfter };
    window.count++;
    counter.windows[budget] = window;
    await tx.put("security-budget", counter);
    return { allowed: true, retryAfter: 0 };
  });
}

interface LimiterEnv { FACTORY: { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): { securityLimit(budget: Budget): Promise<LimitResult> } } }
export async function securityObjectName(subject: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject));
  const hash = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `security:${hash}`;
}

export async function rateLimit(env: LimiterEnv, subject: string, budget: Budget): Promise<LimitResult> {
  return env.FACTORY.get(env.FACTORY.idFromName(await securityObjectName(subject))).securityLimit(budget);
}

// Cloudflare overwrites this header at the edge. Never use X-Forwarded-For,
// client-chosen identity headers or a form-supplied login as counter identities.
export const ipSubject = (request: Request) => `ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`;
export function requestBudget(request: Request, path = new URL(request.url).pathname): Budget | null {
  if (path.startsWith("/auth/") || path.startsWith("/setup") || path === "/access" && request.method === "POST") return "auth";
  if (path.startsWith("/connect/")) return "connect";
  if (/^\/api\/repos\/[^/]+\/[^/]+\/factory$/.test(path)) return "socket";
  if (/^\/api\/repos\//.test(path) && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return "move";
  return null;
}
