import { factoryDeleted } from "./account-lifecycle";
import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from '@sentry/cloudflare';
import { redact, Redactor } from './redact';

export interface Trace { requestId: string; userId?: string; repo?: string; itemId?: string }
export interface TelemetryEnv { SHIPTORIO_SENTRY_DSN?: string; BUILD_SHA?: string; CACHE?: KVNamespace; DB?: D1Database }
export type LogGroup = 'events' | 'errors' | 'spark' | 'webhooks';
export interface LogEntry extends Trace { level: 'info' | 'warn' | 'error'; ts: string; event: string; durationMs?: number; [key: string]: unknown }
interface Context { trace: Trace; env: TelemetryEnv; waitUntil: (task: Promise<unknown>) => void }
const context = new AsyncLocalStorage<Context>();
export const currentTrace = () => context.getStore()?.trace;
export function inTrace<T>(trace: Trace, env: TelemetryEnv, waitUntil: Context['waitUntil'], run: () => T): T {
  return context.run({ trace, env, waitUntil }, () => Sentry.withScope(() => {
    Sentry.setTag('requestId', trace.requestId);
    if (trace.repo) Sentry.setTag('repo', trace.repo);
    if (trace.itemId) Sentry.setTag('itemId', trace.itemId);
    Sentry.setUser(trace.userId ? { id: trace.userId } : null);
    return run();
  }));
}
export function log(level: LogEntry['level'], event: string, fields: Record<string, unknown> = {}): LogEntry {
  const ctx = context.getStore();
  const entry = new Redactor(ctx?.env).value(redact({ ...fields, ...ctx?.trace, requestId: ctx?.trace.requestId ?? crypto.randomUUID(), level, ts: new Date().toISOString(), event })) as LogEntry;
  console[level](JSON.stringify(entry));
  // One immutable key per event avoids cross-isolate lost updates. Seven-day retention.
  if (ctx?.env.CACHE) {
    const suffix = `${String(9999999999999 - Date.now()).padStart(13, '0')}:${crypto.randomUUID()}`;
    const categories = ['events', ...(level === 'error' ? ['errors'] : []), ...(event.startsWith('spark.') ? ['spark'] : []), ...(event.startsWith('webhook.') ? ['webhooks'] : [])];
    const groups = categories.flatMap(group => [`${group}:all`, ...(entry.repo ? [`${group}:repo:${entry.repo}`] : [])]);
    const keys = groups.map(group => `ops:${group}:${suffix}`);
    const mayRetain = async () => {
      if (!ctx.env.DB) return true;
      if (entry.repo && await factoryDeleted(ctx.env.DB, entry.repo)) return false;
      if (entry.userId && !await ctx.env.DB.prepare("SELECT id FROM users WHERE lower(login) = ?").bind(entry.userId.toLowerCase()).first()) return false;
      return true;
    };
    const persist = Promise.resolve().then(async () => {
      if (!await mayRetain()) return;
      await Promise.all(keys.map(key => ctx.env.CACHE!.put(key, JSON.stringify(entry), { expirationTtl: 7 * 86400 })));
      // A background write that overlaps deletion must clean up its late keys.
      if (!await mayRetain()) await Promise.all(keys.map(key => ctx.env.CACHE!.delete(key)));
    }).catch(() => {
      console.warn(JSON.stringify({ level: 'warn', event: 'telemetry.persist_failed', ts: new Date().toISOString(), requestId: entry.requestId }));
    });
    try { ctx.waitUntil(persist); } catch { /* Missing/closed execution context must not break the business request. */ }
  }
  return entry;
}
export function report(error: unknown, event = 'exception', fields: Record<string, unknown> = {}): string {
  log('error', event, { ...fields, error });
  return Sentry.captureException(error);
}
export function sentryOptions(env: TelemetryEnv): Sentry.CloudflareOptions {
  return {
    dsn: env.SHIPTORIO_SENTRY_DSN, enabled: !!env.SHIPTORIO_SENTRY_DSN,
    release: env.BUILD_SHA ?? 'development',
    // Bodies/headers may carry runner grants, source credentials or private code.
    beforeSend(event) { delete event.request; if (event.user) delete event.user.ip_address; return new Redactor(env).value(redact(event)); },
    beforeBreadcrumb(breadcrumb) { return new Redactor(env).value(redact(breadcrumb)); },
    tracesSampleRate: 0,
  };
}
export async function recentLogs(env: TelemetryEnv, group: LogGroup = 'events', repo?: string): Promise<LogEntry[]> {
  if (!env.CACHE) return [];
  const prefix = `ops:${group}:${repo ? `repo:${repo}` : 'all'}:`;
  const page = await env.CACHE.list({ prefix, limit: 50 });
  if (!page.keys.length) return [];
  // Bulk reads keep this page within the Worker's external operation budget.
  const keys = page.keys.map(k => k.name);
  const rows = await env.CACHE.get<LogEntry>(keys, 'json');
  return keys.map(key => rows.get(key)).filter((v): v is LogEntry => !!v);
}
export async function observedFetch(service: 'spark' | 'github', url: string, init: RequestInit): Promise<Response> {
  const start = Date.now();
  const headers = new Headers(init.headers);
  const trace = currentTrace();
  if (trace) headers.set('X-Request-ID', trace.requestId);
  try {
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) Sentry.captureException(new Error(`${service} request failed (${response.status})`));
    log(response.ok ? 'info' : 'error', `${service}.call`, { status: response.status, durationMs: Date.now() - start, method: init.method ?? 'GET' });
    return response;
  } catch (error) {
    report(error, `${service}.call_failed`, { durationMs: Date.now() - start });
    throw error;
  }
}
