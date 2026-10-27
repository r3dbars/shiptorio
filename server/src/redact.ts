// Scrub before console, persistence, or a third-party transport. Never mutate callers.
const SECRET = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key|dsn|email)/i;
// Begin token/email scans only at token boundaries, so an unbroken untrusted string
// cannot restart the same greedy scan at every character (quadratic CPU work).
export function redactText(value: string): string {
  return value
    .replace(/(\/webhooks\/support\/[^/\s?#]+\/[^/\s?#]+\/)[^/\s?#"'<>]+/gi, '$1[REDACTED]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gh[pousr]_[\w]+|github_pat_[\w]+|sk-[\w-]+|sntrys_[\w]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/(?<![\w-])((?:[\w-]*(?:token|secret|password|api[_-]?key|dsn)[\w-]*)["']?\s*[:=]\s*["']?)[^\s&;,"'}]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[REDACTED]@')
    .replace(/(?<![A-Z0-9.!#$%&'*+/=?^_`{|}~-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
}
export function redact<T>(value: T): T {
  const seen = new WeakSet<object>();
  const visit = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return redactText(v).slice(0, 12000);
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[Circular]';
    if (depth > 20) return '[Truncated]';
    seen.add(v);
    if (v instanceof Error) return { name: v.name, message: redactText(v.message), stack: redactText(v.stack ?? '') };
    if (Array.isArray(v)) return v.slice(0, 200).map(x => visit(x, depth + 1));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? '[REDACTED]' : visit(x, depth + 1)]));
  };
  return visit(value, 0) as T;
}

/** One sanitizer for logs, errors and browser output. Never serialize raw Error objects. */
export class Redactor {
  private secrets = new Set<string>();
  private orderedSecrets?: string[];
  private variants = new Map<string, string[]>();
  private addSecret(value: string): void {
    if (this.secrets.has(value)) return;
    this.secrets.add(value);
    this.orderedSecrets = undefined;
  }
  constructor(values: unknown = {}) { this.register(values); }
  register(values: unknown): void {
    if (!values || typeof values !== "object") return;
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string" && value && /secret|token|password|private.?key|api.?key|master.?key|previous.?keys/i.test(key)) {
        this.addSecret(value);
        if (key === "CRED_PREVIOUS_KEYS") {
          try { for (const previous of Object.values(JSON.parse(value))) if (typeof previous === "string" && previous) this.addSecret(previous); } catch { /* Invalid config is never printed. */ }
        }
      }
    }
  }
  text(value: string): string {
    let result = value;
    // Preserve raw-secret length ordering and each secret's raw/URI/JSON Set order.
    const ordered = this.orderedSecrets ??= [...this.secrets].sort((a, b) => b.length - a.length);
    for (const secret of ordered) {
      let variants = this.variants.get(secret);
      if (!variants) {
        variants = [...new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)])];
        this.variants.set(secret, variants);
      }
      for (const variant of variants) result = result.split(variant).join("[REDACTED]");
    }
    return redactText(result).replace(/\b(?:ph[a-z]_|gh[opsu]_|github_pat_)[A-Za-z0-9_]+/g, "[REDACTED]")
      .replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]");
  }
  value<T>(value: T): T {
    if (typeof value === "string") return this.text(value) as T;
    if (value instanceof Error) return { message: this.text(value.message) } as T;
    if (Array.isArray(value)) return value.map(v => this.value(v)) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key,
      /^(authorization|clientSecret|apiKey|access_token|refresh_token|password|privateKey|token)$/i.test(key) ? "[REDACTED]" : this.value(v)])) as T;
    return value;
  }

}
