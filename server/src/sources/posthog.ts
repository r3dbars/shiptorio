// PostHog mine: pull, not push. The Factory polls a HogQL query on its alarm and turns
// sharp drops in a key event (or a spike in $exception) on a route into ore on that district.
// It only reports what changed; Spark decides if it's real and links it to Sentry or issue ore.

import type { SourceStatus } from "@shiptorio/shared";
import type { Signal } from "./types";

export interface PostHogCreds {
  apiKey?: string;
  projectId?: string;
  host?: string; // https://us.posthog.com (default) or https://eu.posthog.com
  keyEvent?: string; // the event whose drop matters; default $pageview
}

export interface PostHogSourceEnv {
  POSTHOG_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;
  POSTHOG_HOST?: string;
  POSTHOG_KEY_EVENT?: string;
  FAKE_POSTHOG?: string;
}

/** One row per (event, route, day): how often it happened and to how many people. */
export interface RouteDay { event: string; route: string; day: string; count: number; users: number }

// Documented thresholds. A drop needs a real baseline, then has to lose at least half of it.
export const POLL_MS = 5 * 60 * 1000;
export const MIN_BASELINE = 30; // avg events/day over the last 7 full days before we judge a route
export const DROP_RATIO = 0.5; // yesterday below 50% of baseline = drop
export const SPIKE_MIN = 10; // $exception: at least this many on a route in a day...
export const SPIKE_RATIO = 3; // ...and 3× its baseline
export const MAX_ROUTES = 200;

const DAY = 86400000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export function postHogQuery(keyEvent: string): string {
  // Only literal event names reach the query (validated by keyEventOk).
  return `SELECT event, coalesce(properties.$pathname, '/') AS route, toString(toDate(timestamp)) AS day, count() AS n, count(DISTINCT person_id) AS users
FROM events WHERE event IN ('${keyEvent}', '$exception') AND timestamp >= now() - INTERVAL 9 DAY
GROUP BY event, route, day ORDER BY n DESC LIMIT 5000`;
}

export const keyEventOk = (event: string) => /^[\w$ .:-]{1,100}$/.test(event) && !event.includes("'");

export function parseRows(json: unknown): RouteDay[] {
  const results = (json as { results?: unknown[][] })?.results;
  if (!Array.isArray(results)) throw new Error("PostHog query returned no results");
  return results.filter((r) => Array.isArray(r) && r.length >= 5).map((r) => ({
    event: String(r[0]), route: normalizeRoute(String(r[1] ?? "/")), day: String(r[2]).slice(0, 10), count: Number(r[3]) || 0, users: Number(r[4]) || 0,
  }));
}

/** Collapse ids so /orders/123 and /orders/456 are one route. */
export function normalizeRoute(route: string): string {
  const clean = route.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return clean.split("/").map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f-]{16,}$/i.test(seg) ? ":id" : seg)).join("/") || "/";
}

export interface RouteTraffic { route: string; usersPerDay: number; baseline: number; yesterday: number }

/** Compare the last full day against the 7 full days before it, per route. */
export function analyze(rows: RouteDay[], keyEvent: string, now = Date.now()): { signals: Signal[]; traffic: RouteTraffic[] } {
  const yesterday = dayOf(now - DAY);
  const baselineDays = new Set(Array.from({ length: 7 }, (_, i) => dayOf(now - (i + 2) * DAY)));
  const byKey = new Map<string, RouteDay[]>();
  for (const row of rows) {
    const key = `${row.event}\u0000${row.route}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  const signals: Signal[] = [];
  const traffic: RouteTraffic[] = [];
  for (const [key, list] of byKey) {
    const [event, route] = key.split("\u0000");
    const sum = (pick: (r: RouteDay) => number, days: Set<string>) => list.filter((r) => days.has(r.day)).reduce((t, r) => t + pick(r), 0);
    const baseline = sum((r) => r.count, baselineDays) / 7;
    const baseUsers = sum((r) => r.users, baselineDays) / 7;
    // parseRows collapses paths such as /orders/123 and /orders/456. The query
    // still returns a row per original path, so compare whole route totals on
    // both sides; taking the first row invents drops and hides error spikes.
    const yesterdayDays = new Set([yesterday]);
    const y = sum((r) => r.count, yesterdayDays);
    const yesterdayUsers = sum((r) => r.users, yesterdayDays);
    if (event === keyEvent) {
      traffic.push({ route, usersPerDay: Math.round(baseUsers), baseline: Math.round(baseline), yesterday: y });
      if (baseline >= MIN_BASELINE && y < baseline * DROP_RATIO) {
        const pct = Math.round((1 - y / baseline) * 100);
        const lostUsers = Math.max(0, Math.round(baseUsers - yesterdayUsers));
        signals.push(signal(event, route, yesterday, `${route} traffic dropped ${pct}% yesterday`,
          `${event} on ${route}: ${y} yesterday vs ${Math.round(baseline)}/day over the week before (−${pct}%). About ${lostUsers} fewer people got through.`,
          lostUsers, 2, now));
      }
    } else if (event === "$exception" && y >= SPIKE_MIN && y >= SPIKE_RATIO * Math.max(1, baseline)) {
      signals.push(signal(event, route, yesterday, `Error spike on ${route}: ${y} exceptions yesterday`,
        `$exception on ${route}: ${y} yesterday vs ${Math.round(baseline)}/day before. ${yesterdayUsers} people hit it.`,
        yesterdayUsers, 2, now));
    }
  }
  traffic.sort((a, b) => b.usersPerDay - a.usersPerDay);
  return { signals: signals.slice(0, 20), traffic: traffic.slice(0, MAX_ROUTES) };
}

function signal(event: string, route: string, day: string, title: string, body: string, users: number, severity: number, now: number): Signal {
  const fingerprint = `posthog:${event}:${route}:${day}`;
  return {
    source: "posthog", externalId: `${event}:${route}:${day}`, fingerprint, kindHint: "bug",
    title, body, districtHint: route, usersAffected: 0, usersTotal: users,
    occurredAt: now, rawRef: fingerprint, severity, hints: [`route:${route}`], action: "upsert",
  };
}

export async function fetchRouteDays(creds: Required<Pick<PostHogCreds, "apiKey" | "projectId">> & PostHogCreds): Promise<RouteDay[]> {
  const host = (creds.host || "https://us.posthog.com").replace(/\/$/, "");
  if (!/^https:\/\/[\w.-]+$/.test(host) || !/^\d{1,12}$/.test(creds.projectId)) throw new Error("bad PostHog host or project id");
  const keyEvent = creds.keyEvent && keyEventOk(creds.keyEvent) ? creds.keyEvent : "$pageview";
  const res = await fetch(`${host}/api/projects/${creds.projectId}/query/`, {
    method: "POST",
    headers: { authorization: `Bearer ${creds.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: postHogQuery(keyEvent) } }),
  });
  if (res.status === 429) throw Object.assign(new Error("PostHog rate limit"), { retryAfter: Number(res.headers.get("retry-after")) || 60 });
  if (!res.ok) throw new Error(`PostHog query failed (${res.status})`);
  return parseRows(await res.json());
}

/** Canned data for FAKE_POSTHOG: steady traffic everywhere, then /checkout falls off a cliff yesterday. */
export function fakePostHogRows(now = Date.now(), phase: "steady" | "drop" | "recovered" = "drop"): RouteDay[] {
  const rows: RouteDay[] = [];
  const routes: [string, number][] = [["/", 900], ["/checkout", 240], ["/cart", 420], ["/api/orders", 120], ["/docs", 60]];
  for (let i = 1; i <= 8; i++) {
    const day = dayOf(now - i * DAY);
    for (const [route, n] of routes) {
      const dropped = phase === "drop" && i === 1 && route === "/checkout";
      rows.push({ event: "$pageview", route, day, count: dropped ? Math.round(n * 0.3) : n, users: Math.round((dropped ? n * 0.3 : n) * 0.6) });
    }
    rows.push({ event: "$exception", route: "/checkout", day, count: phase === "drop" && i === 1 ? 48 : 2, users: phase === "drop" && i === 1 ? 31 : 2 });
  }
  return rows;
}

export function postHogStatus(creds: PostHogCreds, publicUrl = "https://shiptorio.com", fake = false): SourceStatus {
  const connected = fake || !!(creds.apiKey && creds.projectId);
  return {
    kind: "posthog",
    state: connected ? "connected" : "needs_action",
    detail: connected ? `PostHog is connected${fake ? " (fake data)" : ""}. Traffic drops and error spikes per route show up as ore.` : "Connect PostHog so real traffic shows which fixes matter and drops show up as ore.",
    eventsToday: 0,
    setup: {
      steps: [
        "In PostHog: Settings → Personal API keys → Create key. Scope: Query read and Project read only.",
        "Copy the key and your project id (the number in your PostHog URL).",
        "Paste both on the connect page.",
      ],
      actionUrl: `${publicUrl}/connect/posthog`,
    },
  };
}
