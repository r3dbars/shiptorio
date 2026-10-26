// One response policy for assets, API errors, redirects and the preview gate.
export function securityHeaders(request: Request, artNonce?: string, sentryDsn?: string): Record<string, string> {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  let telemetryOrigin = '';
  try {
    if (sentryDsn) {
      const target = new URL(sentryDsn);
      if (target.protocol === 'https:' || local && target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)) telemetryOrigin = ` ${target.origin}`;
    }
  } catch { /* An invalid monitoring DSN must not broaden the browser policy. */ }
  const socket = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  const csp = [
    "default-src 'none'",
    `script-src 'self'${artNonce ? ` 'nonce-${artNonce}' https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` : ""}`,
    "script-src-attr 'none'",
    // React positions map labels with style attributes; forms also use inline CSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${socket}${local ? " ws://localhost:* ws://127.0.0.1:*" : ""}${artNonce ? " https://cdnjs.cloudflare.com" : ""}${telemetryOrigin}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
    `form-action 'self'${url.pathname === "/setup" ? " https://github.com" : ""}`,
    ...(!local && url.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(url.protocol === "https:" ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}

// Machine-to-machine routes authenticate without cookies. /access has its own
// signed form proof for browsers that strip Origin. Every other mutation fails
// closed without an exact same-origin header, including future API endpoints.
export function browserMutationAllowed(request: Request, routePath = new URL(request.url).pathname): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const url = new URL(request.url);
  if (["/webhooks/github", "/webhooks/sentry", "/access"].includes(routePath)
    || /^\/webhooks\/sentry\/[\w.-]+\/[\w.-]+$/.test(routePath)
    || /^\/api\/runner\/[\w.-]+\/[\w.-]+\/(claim|finish|renew)$/.test(routePath)) return true;
  return request.headers.get("origin") === url.origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
