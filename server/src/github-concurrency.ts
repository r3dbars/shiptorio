import { RateLimitError } from "./rate-limit";

// Reuse the bounded deadline ledger: two rows per installation, no queue payloads.
// A crashed Worker releases its slot after 30s; API calls must abort within 20s.
export async function githubLease(db: D1Database, scope: string, now = Date.now()): Promise<{ expiresAt: number; release(): Promise<void> }> {
  const expires = now + 30_000;
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const holder = bytes.reduce((n, byte) => n * 256 + byte, 0);
  let retryAt = expires;
  for (let slot = 0; slot < 2; slot++) {
    const name = `${scope}:inflight:${slot}`;
    const row = await db.prepare(`INSERT INTO api_limits(scope, next_at, failures) VALUES (?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET next_at = excluded.next_at, failures = excluded.failures WHERE next_at <= ?
      RETURNING next_at`).bind(name, expires, holder, now).first<{ next_at: number }>();
    if (row) return { expiresAt: expires, async release() {
      // An expired holder cannot release a newer holder's lease.
      await db.prepare("UPDATE api_limits SET next_at = 0 WHERE scope = ? AND next_at = ? AND failures = ?").bind(name, expires, holder).run();
    } };
    const held = await db.prepare("SELECT next_at FROM api_limits WHERE scope = ?").bind(name).first<{ next_at: number }>();
    if (held) retryAt = Math.min(retryAt, held.next_at);
  }
  throw new RateLimitError(Math.max(now + 1000, retryAt));
}
