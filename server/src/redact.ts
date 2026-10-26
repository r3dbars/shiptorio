// Scrub before console, persistence, or a third-party transport. Never mutate callers.
const SECRET = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key|dsn|email)/i;
export function redactText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gh[pousr]_[\w]+|github_pat_[\w]+|sk-[\w-]+|sntrys_[\w]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/((?:[\w-]*(?:token|secret|password|api[_-]?key|dsn)[\w-]*)["']?\s*[:=]\s*["']?)[^\s&;,"'}]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[REDACTED]@')
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
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
