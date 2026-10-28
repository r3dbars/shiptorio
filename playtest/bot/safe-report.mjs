// Playwright network failures include authenticated request headers in their Call log.
// Reports need the failure summary, never that request transcript.
const sensitive = /^(?:cookie|setcookie|authorization|proxyauthorization|password|token|accesstoken|session|sessionsecret|clientsecret|apikey|xapikey|xshiptoriotestdelegation)$/i;
export function safeReportValue(value) {
  if (value instanceof Error) return { name: value.name, message: safeReportFailure(value), ...(value.cause ? { cause: safeReportValue(value.cause) } : {}) };
  if (typeof Headers !== 'undefined' && value instanceof Headers) return safeReportValue(Object.fromEntries(value));
  if (Array.isArray(value)) return value.map(safeReportValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sensitive.test(k.replace(/[^a-z]/gi,''))?'[redacted]':safeReportValue(v)]));
  return typeof value === 'string' ? safeReportFailure(value) : value;
}
export function safeReportFailure(value) {
  return String(value).split(/\r?\nCall log:/i)[0]
    .replace(/(['"]?(?:cookie|set-cookie|authorization|x-shiptorio-test-delegation|password|token|api[_-]?key|client[_-]?secret|session[_-]?secret)['"]?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n]*)/gi, '$1[redacted]')
    .replace(/\bshiptorio_(?:access|session|guest)=[^;\s]+/g, 'shiptorio_cookie=[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|secret|code|key)=)[^&\s]*/gi, '$1[redacted]');
}
