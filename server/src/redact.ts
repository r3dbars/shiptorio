// Scrub before console, persistence, or a third-party transport. Never mutate callers.
const SECRET = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key|dsn|email|headers|query|searchParams)/i;
// Begin token/email scans only at token boundaries, so an unbroken untrusted string
// cannot restart the same greedy scan at every character (quadratic CPU work).
export function redactText(value: string): string {
  return value
    // Browser/request libraries append raw request headers in verbose call logs.
    .replace(/(\bCall log:)[\s\S]*/gi, '$1 [REDACTED]')
    .replace(/(\/webhooks\/support\/[^/\s?#]+\/[^/\s?#]+\/)[^/\s?#"'<>]+/gi, '$1[REDACTED]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gh[pousr]_[\w]+|github_pat_[\w]+|sk-[\w-]+|sntrys_[\w]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie)["']?\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/(?<![\w-])((?:[\w-]*(?:token|secret|password|api[_-]?key|dsn)[\w-]*)["']?\s*[:=]\s*["']?)[^\s&;,"'}]+/gi, '$1[REDACTED]')
    // Query values can be arbitrary opaque credentials; do not rely on key names.
    .replace(/(https?:\/\/[^\s?"'<>]+)\?[^\s"'<>]+/gi, '$1?[REDACTED]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[REDACTED]@')
    .replace(/(?<![A-Z0-9.!#$%&'*+/=?^_`{|}~-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
}
/** Redact the complete string before applying any output bound. */
function sanitize<T>(value: T, text: (value: string) => string, bounded = true): T {
  const seen = new WeakSet<object>();
  const visit = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return bounded ? text(v).slice(0, 12000) : text(v);
    if (typeof v === 'function' || typeof v === 'symbol') return undefined;
    if (typeof v === 'bigint') return v.toString();
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[Circular]';
    if (depth > 20) return '[Truncated]';
    seen.add(v);
    try {
      if (v instanceof Headers || v instanceof URLSearchParams) return '[REDACTED]';
      if (v instanceof URL) return bounded ? text(v.href).slice(0, 12000) : text(v.href);
      if (Array.isArray(v)) return (bounded ? v.slice(0, 200) : v).map(x => visit(x, depth + 1));
      // Error properties are usually non-enumerable. Keep nested causes and provider
      // diagnostics under the same policy as ordinary structured fields.
      const entries = v instanceof Error
        ? Object.entries({ ...v, name: v.name, message: v.message, stack: v.stack, ...('cause' in v ? { cause: v.cause } : {}) })
        : Object.entries(v);
      return Object.fromEntries(entries.map(([k, x]) => [text(k).slice(0, 12000), SECRET.test(k) ? '[REDACTED]' : visit(x, depth + 1)]));
    } finally { seen.delete(v); }
  };
  return visit(value, 0) as T;
}
export function redact<T>(value: T): T { return sanitize(value, redactText); }

/** One sanitizer for logs, errors and browser output. Never serialize raw Error objects. */
export class Redactor {
  private secrets = new Set<string>();
  private orderedSecrets?: string[];
  private variants = new Map<string, string[]>();
  // Repeated object keys and short values dominate browser/diagnostic scrubbing.
  // Instance-local FIFO: <=128 pairs of <=256 UTF-16 units each, so <=128 KiB
  // of string payload plus Map overhead. Long/unbounded input is never retained.
  private shortText = new Map<string, string>();
  private addSecret(value: string): void {
    if (this.secrets.has(value)) return;
    this.secrets.add(value);
    this.orderedSecrets = undefined;
    // Previously ordinary text may now contain a raw, URI or JSON secret variant.
    this.shortText.clear();
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
    const memoized = value.length <= 256 ? this.shortText.get(value) : undefined;
    if (memoized !== undefined) return memoized;
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
    result = redactText(result).replace(/\b(?:ph[a-z]_|gh[opsu]_|github_pat_)[A-Za-z0-9_]+/g, "[REDACTED]")
      .replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]");
    if (value.length <= 256 && result.length <= 256) {
      if (this.shortText.size >= 128) this.shortText.delete(this.shortText.keys().next().value!);
      this.shortText.set(value, result);
    }
    return result;
  }
  value<T>(value: T): T { return sanitize(value, text => this.text(text), false); }
  /** Bounded diagnostic output; secrets are removed before truncation. */
  diagnostic<T>(value: T): T { return sanitize(value, text => this.text(text)); }
}
