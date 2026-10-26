// Redirects remain local after browser URL normalization, including control characters.
export function sameOriginPath(next: string | null | undefined, origin: string): string {
  if (!next || !/^\/(?![/\\])/.test(next) || /[\\\u0000-\u0020\u007f]/.test(next)) return "/";
  try {
    return new URL(next, origin).origin === new URL(origin).origin ? next : "/";
  } catch { return "/"; }
}
