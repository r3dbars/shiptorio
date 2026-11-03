import { ShiptorioError } from "./errors";
import type { Item, Move } from '@shiptorio/shared';

export class OutboundError extends ShiptorioError {
  constructor(readonly status: number) { super(`Outbound request failed (${status})`); }
}
export class RetryExhausted extends ShiptorioError {
  constructor(readonly operation: string, readonly attempts: number, cause: unknown) {
    super(`${operation} failed after ${attempts} attempts`, { cause });
  }
}
/** Only retry operations whose caller can safely replay them. Never include secrets in errors. */
export async function retry<T>(operation: string, run: () => Promise<T>, options: {
  attempts?: number; shouldRetry?: (error: unknown) => boolean; sleep?: (ms: number) => Promise<void>; random?: () => number;
} = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  for (let n = 1; ; n++) {
    try { return await run(); } catch (error) {
      if (options.shouldRetry && !options.shouldRetry(error)) throw error;
      const cause = error instanceof RetryExhausted ? error.cause : error;
      const transient = !(cause instanceof OutboundError) || [408, 429].includes(cause.status) || cause.status >= 500;
      if (!transient || n >= attempts) throw new RetryExhausted(operation, n, error);
      await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(Math.round(250 * 2 ** (n - 1) * (0.5 + (options.random ?? Math.random)())));
    }
  }
}

export const SLA_MS: Record<Item['state'], number> = {
  ore: 10 * 60000, queued: 30 * 60000, working: 30 * 60000, inspecting: 30 * 60000,
  rejected: 24 * 3600000, passed: 24 * 3600000, on_pad: 24 * 3600000, launched: Infinity,
};
/** Observation only: never redispatch a timed-out local agent or bypass a gate. */
export function stuckItem(item: Item, since: number, now: number): { item: Item; move: Move } | undefined {
  if (now - since < SLA_MS[item.state]) return;
  const reason = `stuck at ${item.state}`;
  const scar = { station: 'custom' as const, reason, strike: 1, at: now, evidenceUrl: item.prUrl };
  return {
    item: { ...item, failure: reason, scars: item.scars?.some(s => s.reason === reason && (s.at ?? 0) >= since) ? item.scars : [...(item.scars ?? []), scar] },
    move: { id: `stuck:${item.id}:${since}`, itemId: item.id, title: `${item.title}: ${reason}`, why: "This has waited too long. Check your engine or the PR before you try again.", stage: item.state === 'on_pad' || item.state === 'passed' ? 'pad' : 'inspect', kind: 'unblock', url: item.prUrl ?? item.url, createdAt: now,
      options: [{ id: 'later', label: 'Look later', recommended: true, actions: [] }] },
  };
}
