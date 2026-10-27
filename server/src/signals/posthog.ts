// PostHog collector for the bottleneck brain (docs/BRAIN.md): "you're shipping well, but are people using it?"
// A few small HogQL rollups a few times a day, turned into BrainSignals with the real numbers: usage flat or
// falling, something shipped that nobody touches, a funnel step most people fall out of, new people drying up,
// nobody here at all, or no analytics to tell. Pure detectors plus one fetch. No model calls.
//
// Ids are stable per problem (signalId(source, kind, scope), no dates), so the brain can park one and only
// hear about it again when it gets worse: severity goes up, the id stays.

import { guessFunnel, rate, signalId, type BrainSignal, type Evidence, type FunnelStep, type Item, type SignalCollector } from "@shiptorio/shared";
import { routeOk, type PostHogCreds, type RouteDay } from "../sources/posthog";

export type ItemLike = Pick<Item, "id" | "title" | "kind" | "district" | "orbit">;
export interface DayUsers { day: string; users: number }
export interface DayNew { day: string; people: number }
export interface EventAdoption { event: string; firstDay: string; users: number; users7d: number }
export interface FunnelWeek { step: FunnelStep; entered: number; converted: number }

/** One read of the project. Days are full UTC days, oldest first. */
export interface UsageData {
  active: DayUsers[]; // people with any event, per day, last 28 days
  newPeople: DayNew[]; // persons created per day, last 28 days
  wau: number; // unique people over the last 7 full days
  events: EventAdoption[]; // custom (non-$) events seen in the last 28 days
  funnel?: FunnelWeek; // ordered, per person, over the last 7 full days
}

/** Where to point evidence links. Fake reads have no links. */
export interface Links { app?: string } // https://us.posthog.com/project/123

// Documented thresholds.
export const EVERY_MS = 6 * 60 * 60 * 1000; // these move by the day; four reads a day is plenty
export const FRESH_MS = 2 * EVERY_MS; // one missed read still counts, two don't
export const WINDOW_DAYS = 28;
export const MIN_ACTIVE = 20; // avg people/day in the week before, before a trend means anything
export const FALLING = 0.15; // last 7 days at least 15% below the 7 before
export const FLAT = 0.05; // within ±5% counts as flat...
export const FLAT_MIN_LAUNCHES = 3; // ...and only matters if you shipped this many things in 14 days
export const EMPTY_ACTIVE = 5; // under 5 people a day: nobody's here yet
export const NEW_FALLING = 0.2; // new people last week at least 20% below the 3 weeks before
export const NEW_SHARE = 0.1; // or new people/week under 10% of a normal day's active people while not growing
export const ADOPTION_MIN_DAYS = 3; // something new has to be live this long before we judge it
export const ADOPTION_SHARE = 0.05; // under 5% of weekly people touched a new event = unused
export const ROUTE_SHARE = 0.03; // a launched feature's page under 3% of daily people = unused
export const LEAK_MIN_ENTERED = 350; // 50/day over a week into the step
export const LEAK_RATE = 0.25; // under 25% make it through = a leak worth a look

const DAY = 86400000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const days = (now: number, from: number, n: number) => Array.from({ length: n }, (_, i) => dayOf(now - (i + from) * DAY));
const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const pct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`;

function avgOver<T extends { day: string }>(rows: T[], want: string[], pick: (r: T) => number): number | null {
  const by = new Map(rows.map((r) => [r.day, pick(r)]));
  if (!want.every((d) => by.has(d))) return null; // a missing day is unknown, not zero
  return want.reduce((t, d) => t + by.get(d)!, 0) / want.length;
}
function sumOver<T extends { day: string }>(rows: T[], want: string[], pick: (r: T) => number): number {
  const set = new Set(want);
  return rows.filter((r) => set.has(r.day)).reduce((t, r) => t + pick(r), 0);
}

function sig(kind: string, scope: string | undefined, title: string, severity: number, metric: BrainSignal["metric"], evidence: Evidence[], now: number): BrainSignal {
  return {
    id: signalId("posthog", kind, scope), source: "posthog", kind, scope, title: title.slice(0, 160), severity: clamp(severity), confidence: 1,
    metric, evidence: evidence.slice(0, 5), observedAt: now, freshUntil: now + FRESH_MS,
  };
}
const link = (links: Links, label: string, path = ""): Evidence => ({ label: label.slice(0, 120), ...(links.app && { url: `${links.app}${path}` }) });

/** Launched items whose launch started between `fromDaysAgo` and `toDaysAgo`. */
export const launchesIn = (items: ItemLike[], now: number, fromDaysAgo: number, toDaysAgo = 0) =>
  items.filter((i) => i.orbit?.since && i.orbit.since <= now - toDaysAgo * DAY && i.orbit.since >= now - fromDaysAgo * DAY);

/** Active people week over week: falling, or flat while you keep shipping. */
export function detectUsage(data: UsageData, items: ItemLike[], now: number, links: Links = {}): BrainSignal[] {
  const last = avgOver(data.active, days(now, 1, 7), (r) => r.users);
  const prev = avgOver(data.active, days(now, 8, 7), (r) => r.users);
  if (last === null || prev === null || prev < MIN_ACTIVE) return []; // too new or too small; detectGrowth covers the empty room
  const change = (last - prev) / prev;
  const metric = { value: Math.round(last), baseline: Math.round(prev), unit: "people/day" };
  const trend = link(links, `${Math.round(last)} people a day this week, ${Math.round(prev)} the week before`, "/web");
  if (change <= -FALLING) {
    return [sig("usage_falling", undefined, `Usage is down ${pct(change)}: ${Math.round(last)} people a day, from ${Math.round(prev)} last week.`,
      0.4 + Math.abs(change), metric, [trend], now)];
  }
  const shipped = launchesIn(items, now, 14);
  if (Math.abs(change) <= FLAT && shipped.length >= FLAT_MIN_LAUNCHES) {
    return [sig("usage_flat", undefined, `You shipped ${shipped.length} things in 2 weeks and usage held at ${Math.round(last)} people a day.`,
      0.3 + shipped.length * 0.05, metric, [trend, ...shipped.slice(0, 3).map((i) => ({ label: `Launched: ${i.title}`.slice(0, 120) }))], now)];
  }
  return [];
}

/** New people per week. Nobody here, or new people drying up, or a trickle that isn't growing: go get more users. */
export function detectGrowth(data: UsageData, now: number, links: Links = {}): BrainSignal[] {
  const lastActive = avgOver(data.active, days(now, 1, 7), (r) => r.users);
  if (lastActive === null) return [];
  const [thisWeek, ...before] = [0, 1, 2, 3].map((w) => sumOver(data.newPeople, days(now, 1 + w * 7, 7), (r) => r.people));
  const priorAvg = before.reduce((t, n) => t + n, 0) / before.length;
  const people = link(links, `${thisWeek} new people this week, about ${Math.round(priorAvg)} a week before`, "/persons");
  if (lastActive < EMPTY_ACTIVE) {
    const n = Math.round(lastActive);
    return [sig("no_users", undefined, n < 1 ? "Nobody used it this week." : `Only ${n} ${n === 1 ? "person uses" : "people use"} it on a normal day.`,
      0.9, { value: n, unit: "people/day" }, [people], now)];
  }
  const change = priorAvg > 0 ? (thisWeek - priorAvg) / priorAvg : 0;
  const metric = { value: thisWeek, baseline: Math.round(priorAvg), unit: "new/week" };
  if (priorAvg >= 5 && change <= -NEW_FALLING) {
    return [sig("growth_stall", undefined, `New users are down ${pct(change)}: ${thisWeek} this week, about ${Math.round(priorAvg)} a week before.`,
      0.4 + Math.abs(change), metric, [people], now)];
  }
  if (change <= 0 && thisWeek < lastActive * NEW_SHARE) {
    return [sig("growth_stall", undefined, `Growth stalled at ${thisWeek} new people a week, with ${Math.round(lastActive)} using it daily.`,
      0.5, metric, [people], now)];
  }
  return [];
}

/**
 * Something shipped and nobody touches it. Two ways to see it: a custom event that showed up in the last few
 * weeks and almost nobody fires, or a launched feature whose page (its folder, or a /path in its title) gets a
 * sliver of daily traffic. When we can't tell which page a launch is, we say nothing rather than guess.
 */
export function detectAdoption(data: UsageData, items: ItemLike[], routes: RouteDay[], keyEvent: string, now: number, links: Links = {}): BrainSignal[] {
  const out: BrainSignal[] = [];
  const alreadyThere = dayOf(now - (WINDOW_DAYS - 2) * DAY); // first seen at the window's edge = older than the window
  const lastJudgeable = dayOf(now - ADOPTION_MIN_DAYS * DAY);
  if (data.wau >= MIN_ACTIVE) {
    for (const e of data.events) {
      if (e.firstDay <= alreadyThere || e.firstDay > lastJudgeable) continue;
      const share = e.users7d / data.wau;
      if (share >= ADOPTION_SHARE) continue;
      out.push(sig("feature_unused", e.event.slice(0, 80), `Almost nobody uses ${e.event}: ${e.users7d} of ${data.wau} people this week since it showed up ${e.firstDay}.`,
        0.35 + (ADOPTION_SHARE - share) * 6, { value: Math.round(share * 1000) / 10, unit: "%" },
        [link(links, `${e.event}: ${e.users7d} people in 7 days`, "/events")], now));
    }
  }
  const dailyActive = avgOver(data.active, days(now, 1, 7), (r) => r.users);
  if (dailyActive !== null && dailyActive >= MIN_ACTIVE) {
    const pages = [...new Set(routes.filter((r) => r.event === keyEvent).map((r) => r.route))];
    for (const item of launchesIn(items, now, 21, ADOPTION_MIN_DAYS).filter((i) => i.kind === "feature")) {
      const route = matchRoute(item, pages);
      if (!route) continue;
      const since = dayOf(item.orbit!.since);
      const after = routes.filter((r) => r.event === keyEvent && r.route === route && r.day > since && r.day < dayOf(now));
      const afterDays = new Set(after.map((r) => r.day)).size;
      if (!afterDays) continue;
      const perDay = after.reduce((t, r) => t + r.users, 0) / afterDays;
      const share = perDay / dailyActive;
      if (share >= ROUTE_SHARE) continue;
      out.push(sig("feature_unused", route.slice(0, 80), `${route} shipped ${since} and gets ${Math.round(perDay)} people a day, of ${Math.round(dailyActive)} who use the product.`,
        0.4 + (ROUTE_SHARE - share) * 8, { value: Math.round(perDay), unit: "people/day" },
        [{ label: `Launched: ${item.title}`.slice(0, 120) }, link(links, `${route}: ${Math.round(perDay)} people a day since launch`, "/web")], now));
    }
  }
  return dedupe(out).sort((a, b) => b.severity - a.severity).slice(0, 3);
}

const dedupe = (signals: BrainSignal[]) => [...new Map(signals.map((s) => [s.id, s])).values()];

/** The launched item's page: a /path in its title, or a route named after its folder. */
export function matchRoute(item: Pick<Item, "title" | "district">, routes: string[]): string | null {
  const inTitle = item.title.match(/(?:^|\s)(\/[\w\-/]+)/)?.[1]?.replace(/\/+$/, "");
  if (inTitle && routes.includes(inTitle)) return inTitle;
  const folder = item.district.replace(/^\/+|\/+$/g, "").split("/").pop();
  if (!folder || ["src", "web", "app", "server", "lib", "packages", "pages", "routes"].includes(folder)) return null;
  return routes.find((r) => r === `/${folder}`) ?? null;
}

/** A funnel step most people fall out of, all week. The growth loop handles sudden drops; this is the standing leak. */
export function detectFunnelLeak(data: UsageData, now: number, links: Links = {}): BrainSignal[] {
  const f = data.funnel;
  if (!f || f.entered < LEAK_MIN_ENTERED) return [];
  const r = rate({ entered: f.entered, converted: f.converted, days: 7 });
  if (r >= LEAK_RATE) return [];
  const lost = f.entered - f.converted;
  return [sig("funnel_leak", f.step.label.slice(0, 80), `${Math.round((1 - r) * 100)}% of people drop at ${f.step.label}: ${f.converted} of ${f.entered} made it this week.`,
    0.3 + (LEAK_RATE - r) * 2 + Math.min(0.3, lost / 5000), { value: Math.round(r * 100), unit: "%" },
    [link(links, `${f.step.label}: ${f.converted} of ${f.entered} people in 7 days`, "/insights/new")], now)];
}

/** No analytics, so nobody can tell if people use what ships. */
export function noAnalytics(now: number, connectUrl?: string, why: "not_connected" | "no_events" = "not_connected"): BrainSignal {
  const title = why === "no_events" ? "PostHog is connected but saw no events in 4 weeks, so nobody can tell if people use what ships." : "No analytics yet, so nobody can tell if people use what ships.";
  return sig("no_analytics", undefined, title, why === "no_events" ? 0.5 : 0.35, undefined,
    [{ label: why === "no_events" ? "PostHog: no events in 28 days" : "Connect PostHog", ...(connectUrl && /^https:\/\//.test(connectUrl) && { url: connectUrl }) }], now);
}

/** Everything one read says, worst first. */
export function analyzeUsage(data: UsageData, items: ItemLike[], routes: RouteDay[], keyEvent: string, now = Date.now(), links: Links = {}): BrainSignal[] {
  if (!data.active.some((d) => d.users > 0)) return [noAnalytics(now, links.app, "no_events")];
  return [
    ...detectUsage(data, items, now, links),
    ...detectGrowth(data, now, links),
    ...detectAdoption(data, items, routes, keyEvent, now, links),
    ...detectFunnelLeak(data, now, links),
  ].sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
}

// ---------- the collector ----------

export type FakeUsageScenario = "healthy" | "falling" | "flat" | "unused" | "leak" | "stalled" | "empty";

export interface PostHogSignalCtx {
  creds: PostHogCreds; // apiKey + projectId missing = not connected
  fake?: boolean | FakeUsageScenario; // FAKE_POSTHOG=1
  items: ItemLike[]; // the factory's items; launched ones say what shipped and when
  routes?: RouteDay[]; // the PostHog mine's last route read, if it has one
  connectUrl?: string; // https://shiptorio.com/connect/posthog
  fetch?: typeof fetchUsage; // tests swap the network
}

export const postHogCollector: SignalCollector<PostHogSignalCtx> = {
  source: "posthog",
  everyMs: EVERY_MS,
  /** Not connected is a signal, never a throw. A failed read throws so the registry keeps the last good one. */
  async read(ctx, now) {
    const keyEvent = ctx.creds.keyEvent || "$pageview";
    const routes = ctx.routes ?? [];
    if (ctx.fake) return analyzeUsage(fakeUsage(now, ctx.fake === true ? "flat" : ctx.fake), ctx.items, routes, keyEvent, now);
    if (!ctx.creds.apiKey || !ctx.creds.projectId) return [noAnalytics(now, ctx.connectUrl)];
    const host = (ctx.creds.host || "https://us.posthog.com").replace(/\/$/, "");
    const data = await (ctx.fetch ?? fetchUsage)({ ...ctx.creds, apiKey: ctx.creds.apiKey, projectId: ctx.creds.projectId }, routes, now);
    return analyzeUsage(data, ctx.items, routes, keyEvent, now, { app: `${host}/project/${ctx.creds.projectId}` });
  },
};

// ---------- queries ----------

// Full UTC days only: today is half a day and would look like a crash every morning.
const FULL_DAYS = `timestamp >= toStartOfDay(now()) - INTERVAL ${WINDOW_DAYS} DAY AND timestamp < toStartOfDay(now())`;
export const ACTIVE_QUERY = `SELECT toString(toDate(timestamp)) AS day, uniq(person_id) AS users FROM events WHERE ${FULL_DAYS} GROUP BY day ORDER BY day LIMIT 100`;
export const NEW_PEOPLE_QUERY = `SELECT toString(toDate(created_at)) AS day, count() AS people FROM persons WHERE created_at >= toStartOfDay(now()) - INTERVAL ${WINDOW_DAYS} DAY AND created_at < toStartOfDay(now()) GROUP BY day ORDER BY day LIMIT 100`;
export const EVENTS_QUERY = `SELECT event, toString(min(toDate(timestamp))) AS first_day, uniq(person_id) AS users, uniqIf(person_id, timestamp >= toStartOfDay(now()) - INTERVAL 7 DAY) AS users_7d FROM events WHERE ${FULL_DAYS} AND NOT startsWith(event, '$') GROUP BY event ORDER BY users DESC LIMIT 300`;
export const WAU_QUERY = `SELECT uniq(person_id) AS wau FROM events WHERE timestamp >= toStartOfDay(now()) - INTERVAL 7 DAY AND timestamp < toStartOfDay(now())`;

/** Ordered per person over the last 7 full days: reached `from`, then `to` after it. */
export function funnelWeekQuery(step: FunnelStep): string {
  if (!routeOk(step.from) || !routeOk(step.to)) throw new Error("funnel routes must be plain paths");
  return `SELECT count() AS entered, countIf(last_to > first_from) AS converted FROM (
  SELECT person_id, minIf(timestamp, properties.$pathname = '${step.from}') AS first_from, maxIf(timestamp, properties.$pathname = '${step.to}') AS last_to, countIf(properties.$pathname = '${step.from}') AS froms
  FROM events WHERE event = '$pageview' AND timestamp >= toStartOfDay(now()) - INTERVAL 7 DAY AND timestamp < toStartOfDay(now()) AND properties.$pathname IN ('${step.from}', '${step.to}')
  GROUP BY person_id
) WHERE froms > 0`;
}

function results(json: unknown): unknown[][] {
  const rows = (json as { results?: unknown[][] })?.results;
  if (!Array.isArray(rows)) throw new Error("PostHog query returned no results");
  return rows.filter(Array.isArray);
}
export const parseActive = (json: unknown): DayUsers[] => results(json).map((r) => ({ day: String(r[0]).slice(0, 10), users: Number(r[1]) || 0 }));
export const parseNewPeople = (json: unknown): DayNew[] => results(json).map((r) => ({ day: String(r[0]).slice(0, 10), people: Number(r[1]) || 0 }));
export const parseEvents = (json: unknown): EventAdoption[] =>
  results(json).filter((r) => r.length >= 4).map((r) => ({ event: String(r[0]).slice(0, 100), firstDay: String(r[1]).slice(0, 10), users: Number(r[2]) || 0, users7d: Number(r[3]) || 0 }));
export const parseScalar = (json: unknown): number => Number(results(json)[0]?.[0]) || 0;

/** Fill missing days with zero once the data starts: the project existed, nobody came. */
export function zeroFill(active: DayUsers[], now: number): DayUsers[] {
  if (!active.length) return [];
  const first = active.reduce((m, r) => (r.day < m ? r.day : m), active[0].day);
  const by = new Map(active.map((r) => [r.day, r.users]));
  return days(now, 1, WINDOW_DAYS).filter((d) => d >= first).reverse().map((day) => ({ day, users: by.get(day) ?? 0 }));
}

/** One read: four small rollups, plus the funnel when the route traffic suggests one. One query at a time. */
export async function fetchUsage(creds: Required<Pick<PostHogCreds, "apiKey" | "projectId">> & PostHogCreds, routes: RouteDay[], now = Date.now()): Promise<UsageData> {
  const host = (creds.host || "https://us.posthog.com").replace(/\/$/, "");
  if (!/^https:\/\/[\w.-]+$/.test(host) || !/^\d{1,12}$/.test(creds.projectId)) throw new Error("bad PostHog host or project id");
  const run = async (query: string) => {
    const res = await fetch(`${host}/api/projects/${creds.projectId}/query/`, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${creds.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if (res.status === 429) throw Object.assign(new Error("PostHog rate limit"), { retryAfter: Number(res.headers.get("retry-after")) || 60 });
    if (!res.ok) throw new Error(`PostHog usage query failed (${res.status})`);
    return res.json();
  };
  const active = parseActive(await run(ACTIVE_QUERY));
  const newPeople = parseNewPeople(await run(NEW_PEOPLE_QUERY));
  const events = parseEvents(await run(EVENTS_QUERY));
  const wau = parseScalar(await run(WAU_QUERY));
  const step = guessFunnel([...new Set(routes.filter((r) => r.event === "$pageview").map((r) => r.route))]);
  let funnel: FunnelWeek | undefined;
  if (step) {
    const row = results(await run(funnelWeekQuery(step)))[0];
    if (row) funnel = { step, entered: Number(row[0]) || 0, converted: Number(row[1]) || 0 };
  }
  return { active: zeroFill(active, now), newPeople, wau, events, funnel };
}

// ---------- fake ----------

/** Canned reads for FAKE_POSTHOG=1 and tests. Default "flat": steady usage, a trickle of new people, a new feature nobody opens. */
export function fakeUsage(now = Date.now(), scenario: FakeUsageScenario = "flat"): UsageData {
  const all = days(now, 1, WINDOW_DAYS).reverse();
  const recent = new Set(days(now, 1, 7));
  const base = scenario === "empty" ? 2 : 120;
  const active = all.map((day) => ({ day, users: scenario === "falling" && recent.has(day) ? Math.round(base * 0.7) : base }));
  const trickle = scenario === "stalled" || scenario === "flat" || scenario === "unused";
  const newPeople = all.map((day, i) => ({ day, people: scenario === "empty" ? (i % 7 === 0 ? 1 : 0) : trickle ? (i % 7 === 0 ? 4 : 1) : recent.has(day) ? 6 : 5 }));
  const events: EventAdoption[] = [
    { event: "project_created", firstDay: all[0], users: 400, users7d: 260 },
    { event: "report_exported", firstDay: all[0], users: 150, users7d: 90 },
  ];
  if (scenario === "flat" || scenario === "unused") events.push({ event: "dark_mode_toggled", firstDay: all[WINDOW_DAYS - 10], users: 6, users7d: 4 });
  const funnel = scenario === "leak" ? { step: { from: "/cart", to: "/checkout", label: "/cart → /checkout" }, entered: 1400, converted: 210 } : undefined;
  return { active, newPeople, wau: scenario === "empty" ? 6 : 300, events, funnel };
}
