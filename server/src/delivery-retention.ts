// Only completed-delivery deduplication markers have an existing expiry policy.
// Pending/failed deliveries, runner jobs and approval/proof/audit records are not touched.
const PREFIX = "done:delivery:";
const BATCH_KEYS = 128;
type Storage = Pick<DurableObjectStorage, "list" | "delete">;

export async function pruneExpiredDeliveryMarkers(storage: Storage, now: number): Promise<number> {
  let startAfter: string | undefined;
  let deleted = 0;
  while (true) {
    const page = await storage.list<number>({ prefix: PREFIX, limit: BATCH_KEYS, ...(startAfter ? { startAfter } : {}) });
    const expired: string[] = [];
    for (const [key, expiry] of page) {
      if (key.startsWith(PREFIX) && typeof expiry === "number" && Number.isFinite(expiry) && expiry <= now) expired.push(key);
    }
    if (expired.length) deleted += await storage.delete(expired);
    if (page.size < BATCH_KEYS) return deleted;
    // The cursor is the last scanned key, even when that key was just deleted.
    startAfter = [...page.keys()][page.size - 1];
  }
}
