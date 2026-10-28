// Isolate-local and bounded: never persist signing keys or serialize cache contents.
type HmacHash = "SHA-256" | "SHA-1";
type ImportSigningKey = (secret: string, hash: HmacHash) => Promise<CryptoKey>;
const encoder = new TextEncoder();
const importSigningKey: ImportSigningKey = (secret, hash) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash }, false, ["sign"]);

export class HmacKeyCache {
  private entries = new Map<string, Promise<CryptoKey>>();
  constructor(private readonly importKey: ImportSigningKey = importSigningKey) {}
  get(secret: string, hash: HmacHash = "SHA-256"): Promise<CryptoKey> {
    // Exact secret + algorithm identity preserves immediate rotation behavior. A
    // previous secret can only be used when explicitly supplied by the caller.
    const id = `${hash}:${secret}`;
    const cached = this.entries.get(id);
    if (cached) {
      this.entries.delete(id);
      this.entries.set(id, cached);
      return cached;
    }
    // Share pending imports too; a burst must not import once per request.
    const pending = Promise.resolve().then(() => this.importKey(secret, hash));
    this.entries.set(id, pending);
    if (this.entries.size > 16) this.entries.delete(this.entries.keys().next().value!);
    void pending.catch(() => {
      if (this.entries.get(id) === pending) this.entries.delete(id);
    });
    return pending;
  }
}
const signingKeys = new HmacKeyCache();
export const hmacSigningKey = (secret: string, hash: HmacHash = "SHA-256") => signingKeys.get(secret, hash);
