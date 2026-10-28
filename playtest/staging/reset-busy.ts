// Only fixed diagnostic labels and bounded counters cross the private fixture boundary.
export const RESET_BLOCKERS = ["resetting", "provider_requests", "request_leases", "runner_tick", "runner_pairing", "runner_receipt"] as const;
export type ResetBlocker = typeof RESET_BLOCKERS[number];
type Busy = { code: "fixture_busy"; blockers: ResetBlocker[]; activeRequests: number; requestLeases: number; leaseRetryAfterSeconds?: number };
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000;

export function fixtureBusyResponse(blockers: ResetBlocker[], activeRequests: number, requestLeases: number, retryMs: number): Response {
  const retry = Math.min(600, Math.max(0, Math.ceil(retryMs / 1000)));
  const value: Busy = { code: "fixture_busy", blockers, activeRequests: Math.min(activeRequests, 1_000_000), requestLeases: Math.min(requestLeases, 1_000_000), ...(retry ? { leaseRetryAfterSeconds: retry } : {}) };
  return Response.json(value, { status: 409, headers: { "cache-control": "no-store", ...(retry ? { "retry-after": String(retry) } : {}) } });
}

/** Never forward a provider body/header wholesale, even on the signed private reset path. */
export async function sanitizedResetFailure(response: Response): Promise<Response> {
  const fallback = () => new Response("Fixture reset failed", { status: response.status === 409 ? 409 : 503 });
  if (response.status !== 409) return fallback();
  let value: unknown;
  try {
    const reader = response.body?.getReader();
    if (!reader) return fallback();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value: chunk, done } = await reader.read(); if (done) break;
      size += chunk.length;
      if (size > 2048) { await reader.cancel(); return fallback(); }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return fallback(); }
  if (!value || typeof value !== "object") return fallback();
  const v = value as Partial<Busy>;
  if (v.code !== "fixture_busy" || !Array.isArray(v.blockers) || !v.blockers.length || v.blockers.length > RESET_BLOCKERS.length
    || new Set(v.blockers).size !== v.blockers.length || v.blockers.some(b => !RESET_BLOCKERS.includes(b))
    || !count(v.activeRequests) || !count(v.requestLeases)
    || v.leaseRetryAfterSeconds !== undefined && (!count(v.leaseRetryAfterSeconds) || v.leaseRetryAfterSeconds < 1 || v.leaseRetryAfterSeconds > 600)) return fallback();
  return fixtureBusyResponse(v.blockers, v.activeRequests, v.requestLeases, (v.leaseRetryAfterSeconds ?? 0) * 1000);
}
