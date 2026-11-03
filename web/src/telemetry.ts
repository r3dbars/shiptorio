import * as Sentry from '@sentry/browser';
import { redact } from '../../server/src/redact';

let requestId: string | undefined;
let started = false;
/** Turns on browser error reporting once, when a signed-in factory connects (live.ts). Deferred to idle time so it
 *  never competes with the first frame; the anonymous tutorial never loads this module. No DSN configured = no-op. */
export function startTelemetry(): void {
  if (started || typeof document === "undefined" || typeof window?.fetch !== "function") return;
  started = true;
  const run = () => void initTelemetry();
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run);
  else setTimeout(run, 2000);
}
async function initTelemetry() {
  // Runtime config keeps the DSN in one Worker secret and release identical to /api/version.
  try {
    const response = await fetch('/api/telemetry/config', { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return;
    const config = await response.json() as { dsn: string | null; release: string; userId: string | null; requestId: string };
    requestId = config.requestId;
    if (config.dsn) Sentry.init({
      dsn: config.dsn, release: config.release,
      beforeSend(event) { delete event.request; if (event.user) delete event.user.ip_address; return redact(event); },
      beforeBreadcrumb(breadcrumb) { return redact(breadcrumb); },
      // GlobalHandlers captures unhandled promise rejections and uncaught exceptions.
    });
    Sentry.setUser(config.userId ? { id: config.userId } : null);
    Sentry.setTag('requestId', requestId);
    // Same-origin API response IDs give browser errors a path back to Worker logs.
    const nativeFetch = window.fetch.bind(window);
    window.fetch = new Proxy(window.fetch, { async apply(_target, _thisArg, args: Parameters<typeof fetch>) {
      const result = await nativeFetch(...args);
      const url = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
        const id = result.headers.get('X-Request-ID');
        if (id) { requestId = id; Sentry.setTag('requestId', id); }
        Sentry.addBreadcrumb({ category: 'api', data: { path: url.pathname, status: result.status, requestId: id } });
      }
      return result;
    } });
  } catch { /* Monitoring cannot prevent the simulator or offline app from starting. */ }
}
export function socketDisconnected(repo: string, code: number, wasClean: boolean) {
  Sentry.addBreadcrumb({ category: 'websocket', level: 'warning', message: 'Factory disconnected', data: { repo, code, wasClean } });
  if (!wasClean || code !== 1000) Sentry.captureMessage('Factory websocket disconnected', { level: 'warning', tags: { repo }, extra: { code, wasClean, requestId } });
}
