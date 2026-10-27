import { describe, expect, it } from "bun:test";
import { BrainSignal, SIGNAL_KINDS, type Item } from "@shiptorio/shared";
import { fakeSentryFloor, recordSentryPulse, sentryCollector, sentrySignals, PULSE_KEEP_MS } from "../src/signals/sentry";

const NOW = Date.parse("2026-10-27T20:00:00Z");
const HOUR = 3_600_000;
const item = (n: number, extra: Partial<Item> = {}, ore: Partial<NonNullable<Item["ore"]>> = {}): Item => ({
  id: `sentry-${n}`, kind: "bug", source: "sentry", title: `Error ${n}`, url: `https://example.sentry.io/issues/${n}/`, district: "web", state: "ore", attempts: 0, updatedAt: NOW,
  ore: { fingerprint: `sentry:${n}`, count: 2, firstSeen: NOW - 48 * HOUR, lastSeen: NOW - HOUR, severity: 2, usersAffected: 1, reporters: [], linked: [], hints: [], rawRefs: [], paying: false, ...ore },
  ...extra,
});
const read = (items: Item[], pulses = recordSentryPulse([], "none", NOW - 30 * HOUR, NOW)) => sentrySignals({ items, pulses, connected: true }, NOW);
const kind = (signals: BrainSignal[], k: string) => signals.find((s) => s.kind === k);

describe("sentry pulses", () => {
  it("buckets by hour and drops anything older than a week", () => {
    let p = recordSentryPulse([], "1", NOW - 10 * 60_000, NOW);
    p = recordSentryPulse(p, "1", NOW - 5 * 60_000, NOW);
    expect(p).toEqual([{ issueId: "1", hour: Math.floor((NOW - 10 * 60_000) / HOUR) * HOUR, events: 2 }]);
    p = recordSentryPulse([{ issueId: "old", hour: NOW - PULSE_KEEP_MS - HOUR, events: 9 }, ...p], "2", NOW, NOW);
    expect(p.map((x) => x.issueId)).toEqual(["1", "2"]);
  });
});

describe("sentry collector", () => {
  it("says Sentry is missing when the map has no key, and nothing when it's connected and quiet", () => {
    const off = sentrySignals({ items: [], connected: false, connectUrl: "https://shiptorio.com/connect/sentry" }, NOW);
    expect(off.map((s) => s.id)).toEqual(["sentry:sentry_missing:repo"]);
    expect(off[0].evidence[0].url).toBe("https://shiptorio.com/connect/sentry");
    expect(sentrySignals({ items: [], connected: true }, NOW)).toEqual([]);
    expect(read([{ ...item(1), source: "github_issue" }])).toEqual([]);
  });

  it("flags a spike against the issue's own baseline, not a steady trickle", () => {
    let pulses = recordSentryPulse([], "1", NOW - 20 * HOUR, NOW);
    for (let i = 0; i < 12; i++) pulses = recordSentryPulse(pulses, "1", NOW - 30 * 60_000, NOW);
    for (let h = 24; h >= 0; h--) pulses = recordSentryPulse(pulses, "2", NOW - h * HOUR, NOW); // one an hour, forever
    const spike = kind(read([item(1), item(2)], pulses), "error_spike")!;
    expect(spike.id).toBe("sentry:error_spike:repo");
    expect(spike.metric).toEqual({ value: 12, baseline: 0.04, unit: "events/h" });
    expect(spike.title).toContain("12 times in the last hour");
    expect(spike.evidence.map((e) => e.url)).toEqual(["https://example.sentry.io/issues/1/"]);
  });

  it("guesses a spike from a brand-new noisy issue when there's no pulse log, at lower confidence", () => {
    const spike = kind(sentrySignals({ items: [item(1, {}, { firstSeen: NOW - 20 * 60_000, count: 8 })] }, NOW), "error_spike")!;
    expect(spike.title).toContain("first hour");
    expect(spike.confidence).toBe(0.6);
  });

  it("calls a pile-up only when enough errors sit unworked", () => {
    const four = [1, 2, 3, 4].map((n) => item(n));
    expect(kind(read(four), "errors_piling")).toBeUndefined();
    expect(kind(read([...four, item(5, { state: "working", prNumber: 9 })]), "errors_piling")).toBeUndefined();
    const pile = kind(read([...four, item(6, {}, { usersAffected: 40 })]), "errors_piling")!;
    expect(pile.metric?.value).toBe(5);
    expect(pile.evidence[0].url).toBe("https://example.sentry.io/issues/6/"); // most users first
    expect(pile.evidence.length).toBe(5);
  });

  it("catches a fix that broke again, with the PR in the evidence", () => {
    const back = item(7, { state: "launched", prNumber: 31, prUrl: "https://github.com/o/r/pull/31", orbit: { state: "clear", since: NOW - 30 * HOUR, until: NOW - 6 * HOUR, prNumber: 31, at: NOW - 6 * HOUR } }, { lastSeen: NOW - 5 * 60_000 });
    const quiet = item(8, { state: "launched", orbit: { state: "clear", since: NOW - 30 * HOUR, until: NOW - 6 * HOUR } }, { lastSeen: NOW - 31 * HOUR });
    const reg = kind(read([back, quiet]), "regression")!;
    expect(reg.metric?.value).toBe(1);
    expect(reg.title).toContain("PR #31");
    expect(reg.evidence.map((e) => e.url)).toContain("https://github.com/o/r/pull/31");
    expect(reg.severity).toBeGreaterThanOrEqual(0.7);
  });

  it("names the unworked error hitting the most people, and ignores one already being fixed", () => {
    const s = read([item(1, {}, { usersAffected: 30 }), item(2, { state: "working", prNumber: 4 }, { usersAffected: 300 }), item(3, {}, { usersAffected: 3 })]);
    const unowned = kind(s, "errors_unowned")!;
    expect(unowned.metric?.value).toBe(30);
    expect(unowned.evidence.map((e) => e.url)).toEqual(["https://example.sentry.io/issues/1/"]);
  });

  it("fake floor raises every kind, heaviest first, and every signal passes the contract", async () => {
    const floor = fakeSentryFloor(NOW);
    const signals = await sentryCollector.read(floor, NOW);
    expect(new Set(signals.map((s) => s.kind))).toEqual(new Set(["error_spike", "errors_piling", "regression", "errors_unowned"]));
    for (let i = 1; i < signals.length; i++) expect(signals[i - 1].severity).toBeGreaterThanOrEqual(signals[i].severity);
    for (const s of signals) {
      expect(BrainSignal.parse(s)).toEqual(s);
      expect(SIGNAL_KINDS.sentry).toContain(s.kind);
      expect(s.evidence.every((e) => e.url?.startsWith("https://"))).toBe(true);
      expect(s.freshUntil).toBeGreaterThan(s.observedAt);
    }
  });
});
