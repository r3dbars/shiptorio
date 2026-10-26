// Sentry mine: an internal integration posts issue + error webhooks here.
// Each Sentry issue is one ore chunk; repeats grow it (more biters), resolving it kills them.

import type { SourceStatus } from "@shiptorio/shared";
import { verifyHmac, type Signal, type Source } from "./types";

export interface SentryCreds {
  clientSecret?: string;
}

export interface SentrySourceEnv {
  SENTRY_CLIENT_SECRET?: string;
}

interface SentryFrame { filename?: string; abs_path?: string; module?: string; in_app?: boolean }
interface SentryEvent {
  event_id?: string; issue_id?: string | number; title?: string; culprit?: string; level?: string;
  web_url?: string; url?: string; transaction?: string; datetime?: string; timestamp?: number | string;
  user?: { id?: string; email?: string; username?: string; ip_address?: string } | null;
  request?: { url?: string } | null;
  exception?: { values?: { stacktrace?: { frames?: SentryFrame[] } | null }[] } | null;
  metadata?: { filename?: string };
}
interface SentryIssue {
  id: string | number; shortId?: string; title?: string; culprit?: string; level?: string;
  permalink?: string; web_url?: string; userCount?: number; count?: string | number;
  firstSeen?: string; lastSeen?: string; status?: string;
  metadata?: { filename?: string; type?: string; value?: string };
  project?: { slug?: string };
}
export interface SentryPayload {
  action?: string;
  installation?: { uuid?: string };
  data?: { issue?: SentryIssue; event?: SentryEvent; error?: SentryEvent; triggered_rule?: string };
  [key: string]: unknown;
}

// Sentry level → ore severity (and biter size on the map): warning = small, error = medium, fatal = big.
export const SENTRY_SEVERITY: Record<string, number> = { debug: 0.5, info: 0.5, warning: 1, error: 2, fatal: 3 };

/** The topmost in-app frame is where the crash happened; Sentry lists frames oldest-first. */
export function topInAppPath(event: SentryEvent | undefined): string | undefined {
  for (const value of [...(event?.exception?.values ?? [])].reverse()) {
    const frames = value.stacktrace?.frames ?? [];
    const top = [...frames].reverse().find((f) => f.in_app !== false && (f.filename || f.abs_path));
    if (top) return cleanPath(top.filename ?? top.abs_path!);
  }
  return event?.metadata?.filename ? cleanPath(event.metadata.filename) : undefined;
}

/** "app:///web/src/checkout.ts" or "https://x.com/assets/a.js" → a repo-ish path. */
export function cleanPath(path: string): string {
  return path.replace(/^[a-z]+:\/\/[^/]*/i, "").replace(/^(\.\/|~\/|\/)+/, "").replace(/\?.*$/, "");
}

export function routeOf(event: SentryEvent | undefined): string | undefined {
  const raw = event?.transaction || event?.request?.url;
  if (!raw) return undefined;
  try { return new URL(raw).pathname; } catch { return raw.startsWith("/") ? raw.split("?")[0] : undefined; }
}

/** `resource` is the Sentry-Hook-Resource header: issue, event_alert or error. */
export function normalizeSentry(payload: unknown, resource = "issue"): Signal[] {
  const p = payload as SentryPayload;
  const data = p?.data;
  if (!data) return [];
  if (resource === "issue" && data.issue) {
    const issue = data.issue;
    const id = String(issue.id);
    if (!/^\w{1,40}$/.test(id)) return [];
    const route = issue.culprit?.startsWith("/") ? issue.culprit.split(" ")[0] : undefined;
    const path = issue.metadata?.filename ? cleanPath(issue.metadata.filename) : undefined;
    const action = p.action === "resolved" ? "resolved" : p.action === "ignored" || p.action === "archived" ? "close" : "upsert";
    return [{
      source: "sentry", externalId: id, fingerprint: `sentry:${id}`, kindHint: "bug",
      title: (issue.title ?? "Sentry error").slice(0, 300),
      body: [issue.metadata?.type && `${issue.metadata.type}: ${issue.metadata.value ?? ""}`, issue.culprit && `Culprit: ${issue.culprit}`, issue.count && `Events: ${issue.count}`, issue.userCount != null && `Users: ${issue.userCount}`].filter(Boolean).join("\n"),
      url: issue.permalink ?? issue.web_url,
      districtHint: path ?? route,
      usersAffected: 0, usersTotal: Math.max(0, Math.floor(issue.userCount ?? 0)),
      occurredAt: Date.parse(issue.lastSeen ?? issue.firstSeen ?? "") || Date.now(),
      rawRef: `sentry:issue:${id}:${p.action ?? "created"}:${issue.lastSeen ?? issue.count ?? ""}`,
      severity: SENTRY_SEVERITY[issue.level ?? "error"] ?? 2,
      hints: [`sentry:${id}`, ...(route ? [`route:${route}`] : [])],
      action,
    }];
  }
  const event = data.event ?? data.error;
  if (!event || event.issue_id == null) return [];
  const id = String(event.issue_id);
  if (!/^\w{1,40}$/.test(id)) return [];
  const path = topInAppPath(event);
  const route = routeOf(event);
  const user = event.user?.id ?? event.user?.email ?? event.user?.username ?? event.user?.ip_address;
  return [{
    source: "sentry", externalId: id, fingerprint: `sentry:${id}`, kindHint: "bug",
    title: (event.title ?? "Sentry error").slice(0, 300),
    body: [event.culprit && `Culprit: ${event.culprit}`, path && `Top frame: ${path}`, route && `Route: ${route}`, data.triggered_rule && `Alert: ${data.triggered_rule}`].filter(Boolean).join("\n"),
    url: event.web_url ?? event.url,
    districtHint: path ?? route,
    usersAffected: user ? 1 : 0,
    occurredAt: (typeof event.timestamp === "number" ? event.timestamp * 1000 : Date.parse(String(event.datetime ?? event.timestamp ?? ""))) || Date.now(),
    rawRef: `sentry:event:${event.event_id ?? `${id}-${event.datetime ?? Date.now()}`}`,
    severity: SENTRY_SEVERITY[event.level ?? "error"] ?? 2,
    hints: [`sentry:${id}`, ...(route ? [`route:${route}`] : [])],
    action: "upsert",
  }];
}

export function sentryStatus(creds: SentryCreds, publicUrl = "https://shiptorio.com"): SourceStatus {
  const connected = !!creds.clientSecret;
  return {
    kind: "sentry",
    state: connected ? "connected" : "needs_action",
    detail: connected ? "Sentry is connected. New errors show up as biters on the folder they hit." : "Connect Sentry so errors show up as biters the moment they happen.",
    eventsToday: 0,
    setup: {
      steps: [
        "In Sentry: Settings → Developer Settings → Custom Integrations → Create New Integration → Internal Integration.",
        `Webhook URL: ${publicUrl}/webhooks/sentry. Turn on Alert Rule Action, tick the issue and error webhooks, give Issue & Event read access.`,
        "Save, copy the Client Secret, and paste it on the connect page.",
      ],
      actionUrl: `${publicUrl}/connect/sentry`,
    },
  };
}

export function fakeSentry(event = "issue.created", issueId = "4501"): SentryPayload {
  const [resource, action] = event.split(".");
  if (resource === "error" || resource === "event_alert") {
    const e: SentryEvent = {
      event_id: crypto.randomUUID().replace(/-/g, ""), issue_id: issueId, title: "TypeError: cart.total is undefined", culprit: "checkout/total.ts in sumCart",
      level: "error", web_url: `https://example.sentry.io/issues/${issueId}/`, transaction: "/checkout", datetime: new Date().toISOString(),
      user: { id: `fake-user-${Math.floor(Math.random() * 1000)}` },
      exception: { values: [{ stacktrace: { frames: [{ filename: "node_modules/react-dom/index.js", in_app: false }, { filename: "./checkout/total.ts", in_app: true }] } }] },
    };
    return resource === "error" ? { action: "created", data: { error: e } } : { action: "triggered", data: { event: e, triggered_rule: "New issue" } };
  }
  return {
    action: action ?? "created",
    data: { issue: { id: issueId, shortId: "SHOP-1", title: "TypeError: cart.total is undefined", culprit: "/checkout", level: "error", permalink: `https://example.sentry.io/issues/${issueId}/`, userCount: 112, count: "340", firstSeen: "2026-10-26T12:00:00Z", lastSeen: new Date().toISOString(), status: action === "resolved" ? "resolved" : "unresolved", metadata: { filename: "checkout/total.ts", type: "TypeError", value: "cart.total is undefined" }, project: { slug: "shop" } } },
  };
}

export const sentrySource: Source<SentrySourceEnv> = {
  // Sentry signs the raw body with the integration's Client Secret: hex HMAC-SHA256, no prefix.
  verify: async (request, env) => verifyHmac(env.SENTRY_CLIENT_SECRET, await request.text(), request.headers.get("sentry-hook-signature")),
  normalize: (payload) => normalizeSentry(payload),
  status: (env) => sentryStatus({ clientSecret: env.SENTRY_CLIENT_SECRET }),
  fake: fakeSentry,
};
