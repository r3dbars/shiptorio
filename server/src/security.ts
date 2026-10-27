import { isPublicDocs } from "./access";
// One response policy for assets, API errors, redirects and the preview gate.
export function securityHeaders(request: Request, artNonce?: string, turnstile = false, sentryDsn?: string, gatePolicy?: string): Record<string, string> {

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
  // Only a server-generated preview-gate nonce may replace the default script rule.
  const gateScript = gatePolicy?.match(/(?:^|;\s*)script-src ('nonce-[a-f0-9]{32}')(?=;|$)/)?.[1];
  const csp = [
    "default-src 'none'",
    gateScript ? `script-src ${gateScript}` : `script-src 'self'${turnstile ? " https://challenges.cloudflare.com" : ""}${artNonce ? ` 'nonce-${artNonce}' https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` : ""}`,
    "script-src-attr 'none'",
    // React positions map labels with style attributes; forms also use inline CSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${socket}${turnstile ? " https://challenges.cloudflare.com" : ""}${local ? " ws://localhost:* ws://127.0.0.1:*" : ""}${artNonce ? " https://cdnjs.cloudflare.com" : ""}${telemetryOrigin}`,
    ...(turnstile ? ["frame-src https://challenges.cloudflare.com"] : []),

    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
    `form-action 'self'${url.pathname === "/setup" ? " https://github.com" : ""}`,
    ...(!local && url.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    // Chromium turns form Origin opaque under no-referrer. Pairing needs its exact
    // same-origin POST header; same-origin still hides the device code off-site.
    "Referrer-Policy": url.pathname === "/runner/pair" ? "same-origin" : "no-referrer",
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
  if (["/webhooks/github", "/webhooks/sentry", "/access", "/api/runner-device/start", "/api/runner-device/poll"].includes(routePath)
    || /^\/webhooks\/sentry\/[\w.-]+\/[\w.-]+$/.test(routePath)
    || /^\/webhooks\/support\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}$/.test(routePath) || /^\/webhooks\/intercom\/[\w.-]+\/[\w.-]+$/.test(routePath)
    || /^\/api\/runner\/[\w.-]+\/[\w.-]+\/(claim|finish|renew|heartbeat)$/.test(routePath)) return true;
  return request.headers.get("origin") === url.origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

// Only authenticated content-hashed assets are immutable. Gates/errors/pages stay private and fresh.
export function browserCacheControl(request: Request, status: number): string {
  const hash = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
  // the public docs site is the same for everyone, so browsers and the edge may keep it a few minutes
  if (["GET", "HEAD"].includes(request.method) && [200, 304].includes(status) && isPublicDocs(new URL(request.url).pathname)) return "public, max-age=300";
  return ["GET", "HEAD"].includes(request.method) && [200, 304].includes(status) && hash.test(new URL(request.url).pathname)
    ? "private, max-age=31536000, immutable" : "no-store";
}
