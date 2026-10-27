import { decryptCredential, encryptCredential, type Envelope, type KeyEnv } from "./sources/credential-crypto";

interface CacheEnv extends KeyEnv { CACHE?: KVNamespace }
interface Entry { etag: string; value: unknown; expires: number }
const TTL = 300_000;
const MAX_BODY = 65_536;
const MAX_MEMORY = 2 * 1024 * 1024;
const enc = new TextEncoder();

/** A cache hit is only a validator candidate. GitHub must authorize every read. */
export class GitHubReadCache {
  private entries = new Map<string, { entry: Entry; bytes: number }>();
  private bytes = 0;

  async key(tokenHash: string, identity: string, path: string, headers: Headers): Promise<string> {
    const representation: [string, string][] = [];
    headers.forEach((value, name) => { if (!["authorization", "if-none-match", "if-modified-since"].includes(name)) representation.push([name, value]); });
    representation.sort(([a], [b]) => a.localeCompare(b));
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify([tokenHash, identity, path, representation])));
    return `ghread:v1:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
  }

  async get(key: string, env?: CacheEnv): Promise<Entry | undefined> {
    const local = this.entries.get(key)?.entry;
    if (local && local.expires > Date.now()) return local;
    this.forget(key);
    if (!env?.CACHE || !env.CRED_MASTER_KEY) return;
    try {
      const envelope = await env.CACHE.get<Envelope>(key, "json");
      if (!envelope) return;
      const entry = await decryptCredential<Entry>(env, key, envelope);
      if (typeof entry.etag !== "string" || !entry.etag || !Number.isFinite(entry.expires) || entry.expires <= Date.now() || entry.expires > Date.now() + TTL || !("value" in entry)) return;
      if (this.remember(key, entry)) return entry;
    } catch { /* Corrupt, unavailable or rotated encryption keys are a cache miss. */ }
  }

  async put(key: string, etag: string, value: unknown, env?: CacheEnv): Promise<void> {
    const entry = { etag, value: structuredClone(value), expires: Date.now() + TTL };
    if (!this.remember(key, entry) || !env?.CACHE || !env.CRED_MASTER_KEY) return;
    try {
      await env.CACHE.put(key, JSON.stringify(await encryptCredential(env, key, entry)), { expirationTtl: TTL / 1000 });
    } catch { /* Cache availability must not change an authorized API result. */ }
  }

  async delete(key: string, env?: CacheEnv): Promise<void> {
    this.forget(key);
    try { await env?.CACHE?.delete(key); } catch { /* Revalidation remains mandatory. */ }
  }

  private forget(key: string) {
    this.bytes -= this.entries.get(key)?.bytes ?? 0;
    this.entries.delete(key);
  }
  private remember(key: string, entry: Entry): boolean {
    const bytes = enc.encode(JSON.stringify(entry)).byteLength;
    if (bytes > MAX_BODY) return false;
    this.forget(key);
    while (this.entries.size >= 500 || this.bytes + bytes > MAX_MEMORY) this.forget(this.entries.keys().next().value!);
    this.entries.set(key, { entry, bytes });
    this.bytes += bytes;
    return true;
  }
}
