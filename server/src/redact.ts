/** One sanitizer for logs, errors and browser output. Never serialize raw Error objects. */
export class Redactor {
  private secrets = new Set<string>();
  constructor(values: unknown = {}) { this.register(values); }
  register(values: unknown): void {
    if (!values || typeof values !== "object") return;
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string" && value && /secret|token|password|private.?key|api.?key|master.?key|previous.?keys/i.test(key)) {
        this.secrets.add(value);
        if (key === "CRED_PREVIOUS_KEYS") {
          try { for (const previous of Object.values(JSON.parse(value))) if (typeof previous === "string" && previous) this.secrets.add(previous); } catch { /* Invalid config is never printed. */ }
        }
      }
    }
  }
  text(value: string): string {
    let result = value;
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length)) {
      for (const variant of new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)])) result = result.split(variant).join("[REDACTED]");
    }
    return result.replace(/\b(?:ph[a-z]_|gh[opsu]_|github_pat_)[A-Za-z0-9_]+/g, "[REDACTED]")
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
