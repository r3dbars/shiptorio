// Sentry signal adapter for the bottleneck brain. The Sentry mine (sources/sentry.ts) turns each
// webhook into one ore chunk; this file looks across all of them and says what the trend is:
// a fresh spike, a pile of unresolved errors nobody is working, a launched fix that broke again,
// or one error hitting a lot of people. Pure: it reads items plus a small rolling event log, and
// every signal carries the Sentry links that prove it.

import type { Item } from "@shiptorio/shared";

/** One Sentry delivery, bucketed by hour. The factory appends these; the adapter only reads them. */
export interface SentryPulse { issueId: string; hour: number; events: number }

export type SentryTrend = "spike" | "pile_up" | "regression" | "users_hit";

export interface SentryEvidence { label: string; url?: string; itemId?: string }

/** What one trend says about the pipeline. `severity` is 0..1 so the brain can compare across sources. */
export interface SentryTrendSignal {
  id: string;
  source: "sentry";
  trend: SentryTrend;
  title: string;
  detail: string;
  unlock: string;
  severity: number;
  observedAt: number;
  itemIds: string[];
  evidence: SentryEvidence[];
  metrics: Record<string, number>;
}

export interface SentryTrendOptions {
  now?: number;
  pulses?: readonly SentryPulse[];
  /** Below this many unresolved, unworked errors there's no pile. */
  pileAt?: number;
  /** One error hitting at least this many users is worth a card by itself. */
  usersAt?: number;
  /** Events in the last hour needed before anything counts as a spike. */
  spikeMin?: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const PULSE_KEEP_MS = 7 * DAY;
const MAX_EVIDENCE = 5;

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const issueIdOf = (item: Item) => item.ore?.fingerprint.startsWith("sentry:") ? item.ore.fingerprint.slice(7) : item.id.replace(/^sentry-/, "");
const usersOf = (item: Item) => item.ore?.usersAffected ?? item.customer?.usersAffected ?? 0;
const evidenceOf = (item: Item, label = item.title): SentryEvidence => ({ label: label.slice(0, 160), url: item.url, itemId: item.id });
const where = (item: Item) => item.district && item.district !== "/" ? ` on /${item.district}` : "";

/** Open = still on the floor. Launched items are watched by the regression check instead. */
const isOpen = (item: Item) => item.state !== "launched";
/** Nobody has picked it up yet: raw ore, no PR, no runner on it. */
const isUnworked = (item: Item) => item.state === "ore" && !item.prNumber;

/** Adds one delivery to the rolling log. Pure; drops anything older than a week and caps the size. */
export function recordSentryPulse(pulses: readonly SentryPulse[], issueId: string, at: number, now = at, limit = 2000): SentryPulse[] {
  const hour = Math.floor(at / HOUR) * HOUR;
  const kept = pulses.filter((p) => p.hour >= now - PULSE_KEEP_MS);
  const hit = kept.findIndex((p) => p.issueId === issueId && p.hour === hour);
  const next = hit >= 0 ? kept.map((p, i) => i === hit ? { ...p, events: p.events + 1 } : p) : [...kept, { issueId, hour, events: 1 }];
  return next.length > limit ? next.sort((a, b) => b.hour - a.hour).slice(0, limit) : next;
}

/**
 * Spike: an error firing much faster now than its own normal rate. With pulses, the last hour vs
 * the 24 hours before it. Without them, a brand-new issue (first seen in the last hour) that has
 * already fired spikeMin times.
 */
function spikes(items: Item[], options: Required<Omit<SentryTrendOptions, "pulses">> & { pulses: readonly SentryPulse[] }): SentryTrendSignal[] {
  const { now, pulses, spikeMin } = options;
  const out: SentryTrendSignal[] = [];
  for (const item of items.filter(isOpen)) {
    const id = issueIdOf(item);
    const mine = pulses.filter((p) => p.issueId === id);
    const lastHour = mine.filter((p) => p.hour >= now - HOUR).reduce((n, p) => n + p.events, 0);
    const before = mine.filter((p) => p.hour < now - HOUR && p.hour >= now - 25 * HOUR).reduce((n, p) => n + p.events, 0);
    const baseline = before / 24;
    const fresh = (item.ore?.firstSeen ?? 0) >= now - HOUR;
    const recent = mine.length ? lastHour : fresh ? item.ore?.count ?? 0 : 0;
    if (recent < spikeMin) continue;
    const ratio = baseline > 0 ? recent / baseline : Infinity;
    if (ratio < 3) continue;
    const users = usersOf(item);
    out.push({
      id: `sentry:spike:${id}`, source: "sentry", trend: "spike",
      title: `Sentry spike: "${item.title}"${where(item)}`,
      detail: baseline > 0
        ? `${plural(recent, "event")} in the last hour, about ${Math.round(ratio)}x its normal rate.${users ? ` ${plural(users, "user")} hit so far.` : ""}`
        : `New error: ${plural(recent, "event")} in its first hour.${users ? ` ${plural(users, "user")} hit so far.` : ""}`,
      unlock: "Fix this error first. It's getting worse while it waits.",
      severity: clamp(0.35 + Math.log10(recent) / 5 + (item.ore?.severity ?? 2) / 20 + Math.min(users, 100) / 400),
      observedAt: item.ore?.lastSeen ?? now, itemIds: [item.id], evidence: [evidenceOf(item)],
      metrics: { lastHour: recent, baselinePerHour: Math.round(baseline * 100) / 100, users },
    });
  }
  return out;
}

/** Pile-up: unresolved errors are arriving faster than anything is picking them up. */
function pileUp(items: Item[], { now, pulses, pileAt }: { now: number; pulses: readonly SentryPulse[]; pileAt: number }): SentryTrendSignal[] {
  const open = items.filter(isOpen);
  const waiting = open.filter(isUnworked);
  if (waiting.length < pileAt) return [];
  const users = waiting.reduce((n, i) => n + usersOf(i), 0);
  const oldest = Math.min(...waiting.map((i) => i.ore?.firstSeen ?? i.updatedAt));
  const newThisWeek = waiting.filter((i) => (i.ore?.firstSeen ?? 0) >= now - 7 * DAY).length;
  const ids = new Set(waiting.map(issueIdOf));
  const eventsToday = pulses.filter((p) => ids.has(p.issueId) && p.hour >= now - DAY).reduce((n, p) => n + p.events, 0);
  const top = [...waiting].sort((a, b) => usersOf(b) - usersOf(a) || (b.ore?.count ?? 0) - (a.ore?.count ?? 0));
  const days = Math.max(0, Math.floor((now - oldest) / DAY));
  return [{
    id: "sentry:pile_up", source: "sentry", trend: "pile_up",
    title: `${plural(waiting.length, "Sentry error")} piling up with nobody on them`,
    detail: `${newThisWeek} new this week, oldest waiting ${days ? plural(days, "day") : "under a day"}.${users ? ` ${plural(users, "user")} hit in total.` : ""}${eventsToday ? ` ${plural(eventsToday, "event")} in the last day.` : ""}`,
    unlock: "Send the top few to the factory, or archive the noise in Sentry so real errors stand out.",
    severity: clamp(0.3 + Math.log2(waiting.length / pileAt + 1) / 4 + Math.min(users, 500) / 1500 + Math.min(days, 14) / 56),
    observedAt: Math.max(...waiting.map((i) => i.ore?.lastSeen ?? i.updatedAt)),
    itemIds: top.map((i) => i.id),
    evidence: top.slice(0, MAX_EVIDENCE).map((i) => evidenceOf(i, `${i.title} (${plural(usersOf(i), "user")})`)),
    metrics: { waiting: waiting.length, open: open.length, users, oldestDays: days, newThisWeek, eventsToday },
  }];
}

/**
 * Regression: an error we launched a fix for is firing again. Orbit watch catches it within its
 * window and marks the item; after the window closes, a launched item whose ore still grows counts too.
 */
function regressions(items: Item[], now: number): SentryTrendSignal[] {
  return items.filter((item) => {
    if (item.orbit?.state === "regressed" && item.orbit.signal === "sentry") return true;
    const since = item.orbit?.since;
    return item.state === "launched" && since != null && (item.ore?.lastSeen ?? 0) > since + 15 * 60_000;
  }).map((item) => {
    const id = issueIdOf(item);
    const pr = item.orbit?.prNumber ?? item.prNumber;
    const users = usersOf(item);
    const evidence: SentryEvidence[] = [evidenceOf(item)];
    if (item.orbit?.evidenceUrl && item.orbit.evidenceUrl !== item.url) evidence.push({ label: item.orbit.reason ?? "What tripped orbit watch", url: item.orbit.evidenceUrl, itemId: item.id });
    if (item.prUrl) evidence.push({ label: `PR #${pr} that was supposed to fix it`, url: item.prUrl, itemId: item.id });
    return {
      id: `sentry:regression:${id}`, source: "sentry" as const, trend: "regression" as const,
      title: `Fixed error came back: "${item.title}"`,
      detail: `${pr ? `PR #${pr} launched a fix, but ` : ""}Sentry is seeing it again${item.ore?.lastSeen ? ` (last ${Math.max(1, Math.round((now - item.ore.lastSeen) / 60_000))} min ago)` : ""}.${users ? ` ${plural(users, "user")} hit.` : ""}`,
      unlock: "Reopen the fix with the new stack trace. The last one didn't hold.",
      severity: clamp(0.7 + (item.ore?.severity ?? 2) / 20 + Math.min(users, 100) / 500),
      observedAt: item.ore?.lastSeen ?? item.orbit?.at ?? now, itemIds: [item.id], evidence,
      metrics: { prNumber: pr ?? 0, users, events: item.ore?.count ?? 0 },
    };
  });
}

/** Users hit: one open error is reaching a lot of people. The biggest few, worst first. */
function usersHit(items: Item[], usersAt: number): SentryTrendSignal[] {
  const open = items.filter(isOpen);
  const total = open.reduce((n, i) => n + usersOf(i), 0);
  return open.filter((i) => usersOf(i) >= usersAt).sort((a, b) => usersOf(b) - usersOf(a)).slice(0, 3).map((item) => {
    const users = usersOf(item);
    const share = total ? users / total : 1;
    return {
      id: `sentry:users_hit:${issueIdOf(item)}`, source: "sentry" as const, trend: "users_hit" as const,
      title: `${plural(users, "user")} hit by "${item.title}"`,
      detail: `That's ${Math.round(share * 100)}% of all user hits across open Sentry errors${where(item)}.${item.state === "ore" ? " Nobody is working on it yet." : ""}`,
      unlock: item.state === "ore" ? "Put this one first. It's the error the most people are seeing." : "Keep this one moving. It's the error the most people are seeing.",
      severity: clamp(0.35 + Math.log10(users) / 6 + share / 5 + (item.ore?.paying ? 0.1 : 0)),
      observedAt: item.ore?.lastSeen ?? item.updatedAt, itemIds: [item.id], evidence: [evidenceOf(item)],
      metrics: { users, share: Math.round(share * 100) / 100, events: item.ore?.count ?? 0 },
    };
  });
}

/** Every Sentry trend worth the brain's attention, worst first. */
export function sentryTrends(items: readonly Item[], options: SentryTrendOptions = {}): SentryTrendSignal[] {
  const now = options.now ?? Date.now();
  const pulses = options.pulses ?? [];
  const sentry = items.filter((i) => i.source === "sentry");
  if (!sentry.length) return [];
  const opts = { now, pulses, pileAt: options.pileAt ?? 5, usersAt: options.usersAt ?? 25, spikeMin: options.spikeMin ?? 5 };
  return [
    ...regressions(sentry, now),
    ...spikes(sentry, opts),
    ...usersHit(sentry, opts.usersAt),
    ...pileUp(sentry, opts),
  ].sort((a, b) => b.severity - a.severity);
}

/** Fake mode: a believable Sentry floor with one of each trend, for tests and `bun run fake:sentry trends`. */
export function fakeSentryTrends(now = Date.now()): { items: Item[]; pulses: SentryPulse[] } {
  const base = (n: number, title: string, extra: Partial<Item> = {}, ore: Partial<NonNullable<Item["ore"]>> = {}): Item => ({
    id: `sentry-${n}`, kind: "bug", source: "sentry", title, url: `https://example.sentry.io/issues/${n}/`, district: "web", state: "ore", attempts: 0, updatedAt: now,
    ore: { fingerprint: `sentry:${n}`, count: 3, firstSeen: now - 3 * DAY, lastSeen: now - HOUR, severity: 2, usersAffected: 2, reporters: [], linked: [], hints: [`sentry:${n}`], rawRefs: [], paying: false, ...ore },
    ...extra,
  });
  const items: Item[] = [
    base(4501, "TypeError: cart.total is undefined", {}, { count: 40, usersAffected: 112, firstSeen: now - 2 * DAY, lastSeen: now - 60_000 }),
    base(4502, "ChunkLoadError: Loading chunk 7 failed", { state: "launched", prNumber: 88, prUrl: "https://github.com/example/shop/pull/88", orbit: { state: "regressed", since: now - 6 * HOUR, until: now + 18 * HOUR, signal: "sentry", reason: "Sentry #4502 fired again 5h after the launch", evidenceUrl: "https://example.sentry.io/issues/4502/events/latest/", at: now - 10 * 60_000, prNumber: 88 } }, { count: 9, lastSeen: now - 10 * 60_000 }),
    base(4503, "RangeError: Invalid time value", {}, { count: 14, firstSeen: now - 30 * 60_000, lastSeen: now - 2 * 60_000, usersAffected: 9, severity: 3 }),
    ...[4504, 4505, 4506, 4507].map((n, i) => base(n, ["NetworkError when attempting to fetch resource", "Cannot read properties of null (reading 'id')", "ResizeObserver loop limit exceeded", "AbortError: The user aborted a request"][i], {}, { firstSeen: now - (i + 2) * DAY })),
  ];
  let pulses: SentryPulse[] = [];
  for (let h = 24; h >= 1; h--) pulses = recordSentryPulse(pulses, "4501", now - h * HOUR, now);
  for (let e = 0; e < 14; e++) pulses = recordSentryPulse(pulses, "4503", now - 30 * 60_000 + e * 60_000, now);
  return { items, pulses };
}
