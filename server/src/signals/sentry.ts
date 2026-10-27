// Sentry collector for the bottleneck brain (docs/BRAIN.md). The Sentry mine (sources/sentry.ts) turns
// each webhook into one ore chunk; this looks across all of them and says what the trend is: a fresh
// spike, a pile of unresolved errors nobody is working, a launched fix that broke again, or one error
// hitting a lot of people with nobody on it. Pure and model-free: it reads items plus a small hourly
// pulse log the factory keeps, and every signal links to the Sentry issues (and PRs) behind it.

import { signalId, type BrainSignal, type Evidence, type Item, type SignalCollector } from "@shiptorio/shared";

/** One hour of Sentry deliveries for one issue. The factory appends these on every webhook. */
export interface SentryPulse { issueId: string; hour: number; events: number }

/** Durable Object storage key for the pulse log. */
export const SENTRY_PULSES_KEY = "sentryPulses";

export interface SentryCollectorCtx {
  items: readonly Item[];
  pulses?: readonly SentryPulse[];
  /** False when this map has no Sentry key: the collector says so instead of staying silent. */
  connected?: boolean;
  /** Where the player connects Sentry, e.g. https://shiptorio.com/connect/sentry. */
  connectUrl?: string;
}

export interface SentryTrendOptions {
  /** Below this many unresolved, unworked errors there's no pile. */
  pileAt?: number;
  /** An unworked error hitting at least this many users is worth a card on its own. */
  usersAt?: number;
  /** Events in the last hour needed before anything counts as a spike. */
  spikeMin?: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const PULSE_KEEP_MS = 7 * DAY;
/** Webhooks push, so a read stays good for a while; the collector re-reads well before this runs out. */
const FRESH_MS = 2 * HOUR;
/** Same grace orbit watch gives a deploy before a repeat error counts against it. */
const DEPLOY_GRACE_MS = 15 * MIN;

const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const quote = (title: string, max = 60) => `"${title.length > max ? `${title.slice(0, max - 1)}…` : title}"`;
const issueIdOf = (item: Item) => item.ore?.fingerprint.startsWith("sentry:") ? item.ore.fingerprint.slice(7) : item.id.replace(/^sentry-/, "");
const usersOf = (item: Item) => item.ore?.usersAffected ?? item.customer?.usersAffected ?? 0;
const httpUrl = (url?: string) => url && /^https?:\/\//.test(url) ? url : undefined;
const evidenceOf = (item: Item, label = item.title, url = item.url): Evidence => ({ label: label.slice(0, 120), ...(httpUrl(url) ? { url } : {}) });
const where = (item: Item) => item.district && item.district !== "/" ? ` on /${item.district}` : "";

/** Open = still on the floor. Launched items are the regression check's job. */
const isOpen = (item: Item) => item.state !== "launched";
/** Nobody has picked it up yet: raw ore, no PR. */
const isUnworked = (item: Item) => item.state === "ore" && !item.prNumber;

/** Adds one delivery to the rolling log. Pure; drops anything older than a week and caps the size. */
export function recordSentryPulse(pulses: readonly SentryPulse[], issueId: string, at: number, now = at, limit = 2000): SentryPulse[] {
  const hour = Math.floor(at / HOUR) * HOUR;
  const kept = pulses.filter((p) => p.hour >= now - PULSE_KEEP_MS);
  const hit = kept.findIndex((p) => p.issueId === issueId && p.hour === hour);
  const next = hit >= 0 ? kept.map((p, i) => i === hit ? { ...p, events: p.events + 1 } : p) : [...kept, { issueId, hour, events: 1 }];
  return next.length > limit ? next.sort((a, b) => b.hour - a.hour).slice(0, limit) : next;
}

type Draft = Omit<BrainSignal, "id" | "source" | "observedAt" | "freshUntil" | "confidence"> & { confidence?: number };
const finish = (now: number) => (d: Draft): BrainSignal => ({
  id: signalId("sentry", d.kind, d.scope), source: "sentry", confidence: 1, ...d,
  title: d.title.slice(0, 160), evidence: d.evidence.slice(0, 5), observedAt: now, freshUntil: now + FRESH_MS,
});

/**
 * error_spike: errors firing much faster now than their own normal rate. With pulses, the last hour vs
 * the 24 hours before it. Without them (a map that connected Sentry before the log existed), a brand-new
 * issue that already fired spikeMin times in its first hour, at lower confidence.
 */
function spike(items: Item[], now: number, pulses: readonly SentryPulse[], spikeMin: number): Draft[] {
  const hits = items.filter(isOpen).flatMap((item) => {
    const mine = pulses.filter((p) => p.issueId === issueIdOf(item));
    const lastHour = mine.filter((p) => p.hour >= now - HOUR).reduce((n, p) => n + p.events, 0);
    const before = mine.filter((p) => p.hour < now - HOUR && p.hour >= now - 25 * HOUR).reduce((n, p) => n + p.events, 0);
    const fresh = (item.ore?.firstSeen ?? 0) >= now - HOUR;
    const recent = mine.length ? lastHour : fresh ? item.ore?.count ?? 0 : 0;
    const baseline = before / 24;
    if (recent < spikeMin || (baseline > 0 && recent / baseline < 3)) return [];
    return [{ item, recent, baseline, guessed: !mine.length }];
  }).sort((a, b) => b.recent - a.recent);
  if (!hits.length) return [];
  const { item, recent, baseline } = hits[0];
  const users = usersOf(item);
  const others = hits.length > 1 ? ` ${plural(hits.length - 1, "other error")} spiking too.` : "";
  return [{
    kind: "error_spike",
    title: baseline > 0
      ? `${quote(item.title)} fired ${recent} times in the last hour${where(item)}, about ${Math.round(recent / baseline)}x normal.${others}`
      : `New error ${quote(item.title)} fired ${recent} times in its first hour${where(item)}.${others}`,
    severity: clamp(0.35 + Math.log10(recent) / 5 + (item.ore?.severity ?? 2) / 20 + Math.min(users, 100) / 400 + (hits.length - 1) / 20),
    confidence: hits[0].guessed ? 0.6 : 1,
    metric: { value: recent, ...(baseline > 0 ? { baseline: Math.round(baseline * 100) / 100 } : {}), unit: "events/h" },
    evidence: hits.map((h) => evidenceOf(h.item, `${h.item.title} (${h.recent} in the last hour)`)),
  }];
}

/** errors_piling: unresolved errors are arriving faster than anything picks them up. */
function piling(items: Item[], now: number, pulses: readonly SentryPulse[], pileAt: number): Draft[] {
  const waiting = items.filter((i) => isOpen(i) && isUnworked(i));
  if (waiting.length < pileAt) return [];
  const users = waiting.reduce((n, i) => n + usersOf(i), 0);
  const oldest = Math.min(...waiting.map((i) => i.ore?.firstSeen ?? i.updatedAt));
  const days = Math.max(0, Math.floor((now - oldest) / DAY));
  const newThisWeek = waiting.filter((i) => (i.ore?.firstSeen ?? 0) >= now - 7 * DAY).length;
  const ids = new Set(waiting.map(issueIdOf));
  const today = pulses.filter((p) => ids.has(p.issueId) && p.hour >= now - DAY).reduce((n, p) => n + p.events, 0);
  const top = [...waiting].sort((a, b) => usersOf(b) - usersOf(a) || (b.ore?.count ?? 0) - (a.ore?.count ?? 0));
  return [{
    kind: "errors_piling",
    title: `${plural(waiting.length, "Sentry error")} waiting with nobody on them, ${newThisWeek} new this week${users ? `, ${plural(users, "user")} hit` : ""}. Oldest: ${days ? plural(days, "day") : "under a day"}.`,
    severity: clamp(0.3 + Math.log2(waiting.length / pileAt + 1) / 4 + Math.min(users, 500) / 1500 + Math.min(days, 14) / 56 + Math.min(today, 200) / 2000),
    metric: { value: waiting.length, baseline: pileAt, unit: "errors" },
    evidence: top.map((i) => evidenceOf(i, `${i.title} (${plural(usersOf(i), "user")})`)),
  }];
}

/**
 * regression: an error a launched fix was supposed to kill is firing again. Orbit watch marks it inside
 * its 24h window; after that, a launched item whose ore keeps growing counts too.
 */
function regression(items: Item[]): Draft[] {
  const back = items.filter((item) => (item.orbit?.state === "regressed" && item.orbit.signal === "sentry")
    || (item.state === "launched" && item.orbit?.since != null && (item.ore?.lastSeen ?? 0) > item.orbit.since + DEPLOY_GRACE_MS))
    .sort((a, b) => (b.ore?.lastSeen ?? 0) - (a.ore?.lastSeen ?? 0));
  if (!back.length) return [];
  const item = back[0];
  const pr = item.orbit?.prNumber ?? item.prNumber;
  const users = back.reduce((n, i) => n + usersOf(i), 0);
  const evidence = back.flatMap((i) => {
    const n = i.orbit?.prNumber ?? i.prNumber;
    return [evidenceOf(i), ...(i.orbit?.evidenceUrl && i.orbit.evidenceUrl !== i.url ? [evidenceOf(i, i.orbit.reason ?? "What tripped orbit watch", i.orbit.evidenceUrl)] : []), ...(i.prUrl ? [evidenceOf(i, `PR #${n}, the fix that didn't hold`, i.prUrl)] : [])];
  });
  return [{
    kind: "regression",
    title: back.length > 1
      ? `${back.length} fixed errors came back, latest ${quote(item.title)}${pr ? ` after PR #${pr}` : ""}.`
      : `${quote(item.title)} came back${pr ? ` after PR #${pr} shipped a fix` : ""}.${users ? ` ${plural(users, "user")} hit.` : ""}`,
    severity: clamp(0.7 + Math.max(...back.map((i) => i.ore?.severity ?? 2)) / 20 + Math.min(users, 100) / 500 + (back.length - 1) / 20),
    metric: { value: back.length, unit: "errors" },
    evidence,
  }];
}

/** errors_unowned: one error is hitting a lot of people and nobody has picked it up. Worst first. */
function unowned(items: Item[], usersAt: number): Draft[] {
  const open = items.filter(isOpen);
  const total = open.reduce((n, i) => n + usersOf(i), 0);
  const big = open.filter((i) => isUnworked(i) && usersOf(i) >= usersAt).sort((a, b) => usersOf(b) - usersOf(a));
  if (!big.length) return [];
  const item = big[0];
  const users = usersOf(item);
  const share = total ? users / total : 1;
  return [{
    kind: "errors_unowned",
    title: `${quote(item.title)} hit ${plural(users, "user")}${where(item)} and nobody is on it. That's ${Math.round(share * 100)}% of all Sentry user hits.`,
    severity: clamp(0.35 + Math.log10(users) / 6 + share / 5 + (item.ore?.paying ? 0.1 : 0) + (big.length - 1) / 40),
    metric: { value: users, baseline: usersAt, unit: "users" },
    evidence: big.map((i) => evidenceOf(i, `${i.title} (${plural(usersOf(i), "user")})`)),
  }];
}

/** sentry_missing: no Sentry key on this map, so errors only reach the player when users complain. */
function missing(connectUrl = "https://shiptorio.com/connect/sentry"): Draft[] {
  return [{
    kind: "sentry_missing",
    title: "Sentry isn't connected, so 0 errors are reaching the factory. Crashes only show up when someone complains.",
    severity: 0.25,
    evidence: [{ label: "Connect Sentry", url: connectUrl }],
  }];
}

/** Every Sentry signal worth the brain's attention, heaviest first. Connected but quiet = no signals. */
export function sentrySignals(ctx: SentryCollectorCtx, now = Date.now(), options: SentryTrendOptions = {}): BrainSignal[] {
  const items = ctx.items.filter((i) => i.source === "sentry");
  if (ctx.connected === false && !items.length) return missing(ctx.connectUrl).map(finish(now));
  if (!items.length) return [];
  const pulses = ctx.pulses ?? [];
  return [
    ...regression(items),
    ...spike(items, now, pulses, options.spikeMin ?? 5),
    ...unowned(items, options.usersAt ?? 25),
    ...piling(items, now, pulses, options.pileAt ?? 5),
  ].map(finish(now)).sort((a, b) => b.severity - a.severity);
}

export const sentryCollector: SignalCollector<SentryCollectorCtx> = {
  source: "sentry",
  everyMs: 5 * MIN,
  read: async (ctx, now) => sentrySignals(ctx, now),
};

/** Fake mode: a believable Sentry floor with one of each signal, for tests and `bun run fake:sentry trends`. */
export function fakeSentryFloor(now = Date.now()): { items: Item[]; pulses: SentryPulse[]; connected: true } {
  const base = (n: number, title: string, extra: Partial<Item> = {}, ore: Partial<NonNullable<Item["ore"]>> = {}): Item => ({
    id: `sentry-${n}`, kind: "bug", source: "sentry", title, url: `https://example.sentry.io/issues/${n}/`, district: "web", state: "ore", attempts: 0, updatedAt: now,
    ore: { fingerprint: `sentry:${n}`, count: 3, firstSeen: now - 3 * DAY, lastSeen: now - HOUR, severity: 2, usersAffected: 2, reporters: [], linked: [], hints: [`sentry:${n}`], rawRefs: [], paying: false, ...ore },
    ...extra,
  });
  const items: Item[] = [
    base(4501, "TypeError: cart.total is undefined", {}, { count: 40, usersAffected: 112, firstSeen: now - 2 * DAY, lastSeen: now - MIN }),
    base(4502, "ChunkLoadError: Loading chunk 7 failed", { state: "launched", prNumber: 88, prUrl: "https://github.com/example/shop/pull/88", orbit: { state: "regressed", since: now - 6 * HOUR, until: now + 18 * HOUR, signal: "sentry", reason: "Sentry #4502 fired again 5h after the launch", evidenceUrl: "https://example.sentry.io/issues/4502/events/latest/", at: now - 10 * MIN, prNumber: 88 } }, { count: 9, lastSeen: now - 10 * MIN }),
    base(4503, "RangeError: Invalid time value", {}, { count: 14, firstSeen: now - 30 * MIN, lastSeen: now - 2 * MIN, usersAffected: 9, severity: 3 }),
    ...["NetworkError when attempting to fetch resource", "Cannot read properties of null (reading 'id')", "ResizeObserver loop limit exceeded", "AbortError: The user aborted a request"]
      .map((title, i) => base(4504 + i, title, {}, { firstSeen: now - (i + 2) * DAY })),
  ];
  let pulses: SentryPulse[] = [];
  for (let h = 24; h >= 1; h--) pulses = recordSentryPulse(pulses, "4501", now - h * HOUR, now);
  for (let e = 0; e < 14; e++) pulses = recordSentryPulse(pulses, "4503", now - 30 * MIN + e * MIN, now);
  return { items, pulses, connected: true };
}
