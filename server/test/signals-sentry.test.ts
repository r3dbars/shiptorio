import { describe, expect, it } from "bun:test";
import type { Item } from "@shiptorio/shared";
import { fakeSentryTrends, recordSentryPulse, sentryTrends, PULSE_KEEP_MS } from "../src/signals/sentry";

const NOW = Date.parse("2026-10-27T20:00:00Z");
const HOUR = 3_600_000;
const item = (n: number, extra: Partial<Item> = {}, ore: Partial<NonNullable<Item["ore"]>> = {}): Item => ({
  id: `sentry-${n}`, kind: "bug", source: "sentry", title: `Error ${n}`, url: `https://example.sentry.io/issues/${n}/`, district: "web", state: "ore", attempts: 0, updatedAt: NOW,
  ore: { fingerprint: `sentry:${n}`, count: 2, firstSeen: NOW - 48 * HOUR, lastSeen: NOW - HOUR, severity: 2, usersAffected: 1, reporters: [], linked: [], hints: [], rawRefs: [], paying: false, ...ore },
  ...extra,
});

describe("sentry pulses", () => {
  it("buckets by hour and drops anything older than a week", () => {
    let p = recordSentryPulse([], "1", NOW - 10 * 60_000, NOW);
    p = recordSentryPulse(p, "1", NOW - 5 * 60_000, NOW);
    expect(p).toEqual([{ issueId: "1", hour: Math.floor((NOW - 10 * 60_000) / HOUR) * HOUR, events: 2 }]);
    p = recordSentryPulse([{ issueId: "old", hour: NOW - PULSE_KEEP_MS - HOUR, events: 9 }, ...p], "2", NOW, NOW);
    expect(p.map((x) => x.issueId)).toEqual(["1", "2"]);
  });
});

describe("sentry trends", () => {
  it("says nothing without Sentry items", () => {
    expect(sentryTrends([{ ...item(1), source: "github_issue" }], { now: NOW })).toEqual([]);
  });

  it("flags a spike against the issue's own baseline, not a steady trickle", () => {
    let pulses = recordSentryPulse([], "1", NOW - 20 * HOUR, NOW);
    for (let i = 0; i < 12; i++) pulses = recordSentryPulse(pulses, "1", NOW - 30 * 60_000, NOW);
    for (let h = 24; h >= 0; h--) pulses = recordSentryPulse(pulses, "2", NOW - h * HOUR, NOW); // one an hour, forever
    const trends = sentryTrends([item(1), item(2)], { now: NOW, pulses });
    const spike = trends.filter((t) => t.trend === "spike");
    expect(spike.map((t) => t.itemIds[0])).toEqual(["sentry-1"]);
    expect(spike[0].metrics.lastHour).toBe(12);
    expect(spike[0].evidence[0].url).toBe("https://example.sentry.io/issues/1/");
  });

  it("treats a brand-new noisy issue as a spike when there's no pulse log yet", () => {
    const trends = sentryTrends([item(1, {}, { firstSeen: NOW - 20 * 60_000, count: 8 })], { now: NOW });
    expect(trends.find((t) => t.trend === "spike")?.detail).toContain("first hour");
  });

  it("calls a pile-up only when enough errors sit unworked", () => {
    const four = [1, 2, 3, 4].map((n) => item(n));
    expect(sentryTrends(four, { now: NOW }).some((t) => t.trend === "pile_up")).toBe(false);
    const working = item(5, { state: "working", prNumber: 9 });
    expect(sentryTrends([...four, working], { now: NOW }).some((t) => t.trend === "pile_up")).toBe(false);
    const pile = sentryTrends([...four, item(6, {}, { usersAffected: 40 })], { now: NOW }).find((t) => t.trend === "pile_up")!;
    expect(pile.metrics.waiting).toBe(5);
    expect(pile.itemIds[0]).toBe("sentry-6"); // most users first
    expect(pile.evidence.length).toBeLessThanOrEqual(5);
  });

  it("catches a fix that broke again, with the PR in the evidence", () => {
    const back = item(7, { state: "launched", prNumber: 31, prUrl: "https://github.com/o/r/pull/31", orbit: { state: "clear", since: NOW - 30 * HOUR, until: NOW - 6 * HOUR, prNumber: 31, at: NOW - 6 * HOUR } }, { lastSeen: NOW - 5 * 60_000 });
    const quiet = item(8, { state: "launched", orbit: { state: "clear", since: NOW - 30 * HOUR, until: NOW - 6 * HOUR } }, { lastSeen: NOW - 31 * HOUR });
    const reg = sentryTrends([back, quiet], { now: NOW }).filter((t) => t.trend === "regression");
    expect(reg.map((t) => t.itemIds[0])).toEqual(["sentry-7"]);
    expect(reg[0].evidence.map((e) => e.url)).toContain("https://github.com/o/r/pull/31");
    expect(reg[0].severity).toBeGreaterThanOrEqual(0.7);
  });

  it("ranks the errors hitting the most people", () => {
    const trends = sentryTrends([item(1, {}, { usersAffected: 30 }), item(2, {}, { usersAffected: 300 }), item(3, {}, { usersAffected: 3 })], { now: NOW });
    const hits = trends.filter((t) => t.trend === "users_hit");
    expect(hits.map((t) => t.itemIds[0])).toEqual(["sentry-2", "sentry-1"]);
    expect(hits[0].severity).toBeGreaterThan(hits[1].severity);
  });

  it("fake mode produces one of each trend, worst first, all with evidence links", () => {
    const { items, pulses } = fakeSentryTrends(NOW);
    const trends = sentryTrends(items, { now: NOW, pulses });
    expect(new Set(trends.map((t) => t.trend))).toEqual(new Set(["spike", "pile_up", "regression", "users_hit"]));
    expect(trends[0].trend).toBe("users_hit"); // 112 users on an unworked error beats a 2-user regression
    for (let i = 1; i < trends.length; i++) expect(trends[i - 1].severity).toBeGreaterThanOrEqual(trends[i].severity);
    for (const t of trends) {
      expect(t.severity).toBeGreaterThan(0);
      expect(t.severity).toBeLessThanOrEqual(1);
      expect(t.evidence.length).toBeGreaterThan(0);
      expect(t.evidence.every((e) => e.url?.startsWith("https://"))).toBe(true);
    }
  });
});
