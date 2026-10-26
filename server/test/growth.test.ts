import { describe, expect, it } from "bun:test";
import type { Experiment, FunnelDay, Item } from "@shiptorio/shared";
import { experimentSignal, funnelFromTraffic, growthTick, newExperiment, stepsToQuery } from "../src/growth";
import { fakeFunnelDays, fakePostHogRows, funnelQuery, parseFunnel } from "../src/sources/posthog";

const DAY = 86400000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const step = { from: "/cart", to: "/checkout", label: "/cart → /checkout" };

/** /cart → /checkout per day: `share(i)` of 400 people convert, i days ago. */
function funnel(now: number, share: (daysAgo: number) => number, days = 20): Map<string, FunnelDay[]> {
  const rows = Array.from({ length: days + 1 }, (_, i) => ({ day: dayOf(now - i * DAY), entered: 400, converted: Math.round(400 * share(i)) }));
  return new Map([[step.label, rows]]);
}

const launchedItem = (launchedAt: number): Item => ({
  id: "gh-exp", kind: "feature", source: "posthog", title: "Experiment: Pay now button", district: "checkout", state: "launched", attempts: 1,
  updatedAt: launchedAt, prNumber: 77, orbit: { since: launchedAt, until: launchedAt + DAY, state: "watching", prNumber: 77 },
});
const building = (now: number): Experiment => ({
  id: "exp-1", step, title: "Experiment: Pay now button", hypothesis: "h", change: "cta", district: "checkout", state: "building", itemId: "gh-exp",
  baseline: { entered: 0, converted: 0, days: 0 }, windowDays: 7, proposedAt: now - 10 * DAY,
});

describe("growthTick", () => {
  const NOW = Date.parse("2026-10-26T12:00:00Z");

  it("traffic only picks the step; conversion comes from a per-person, ordered funnel query", () => {
    expect(funnelFromTraffic(fakePostHogRows(NOW))).toEqual(step);
    const q = funnelQuery(step);
    expect(q).toContain("GROUP BY person_id, day");
    expect(q).toContain("countIf(last_to > first_from)");
    expect(() => funnelQuery({ from: "/cart' OR 1=1 --", to: "/checkout", label: "x" })).toThrow();
    expect(parseFunnel({ results: [["2026-10-25", 250, 75]] })).toEqual([{ day: "2026-10-25", entered: 250, converted: 75 }]);
    expect(fakeFunnelDays(NOW, step).at(-1)).toEqual({ day: "2026-10-25", entered: 250, converted: 75 });
  });

  it("queries the watched step plus every experiment still in flight", () => {
    const other = { ...building(NOW), step: { from: "/pricing", to: "/signup", label: "/pricing → /signup" } };
    expect(stepsToQuery([other, { ...building(NOW), state: "won" }], step).map((s) => s.label)).toEqual(["/cart → /checkout", "/pricing → /signup"]);
  });

  it("proposes on a fresh funnel drop, and only once while one is open", () => {
    const users = funnel(NOW, (i) => (i === 1 ? 0.25 : 0.4));
    const t = growthTick([], [], users, NOW, step);
    expect(t.drop?.step.label).toBe("/cart → /checkout");
    const exp = newExperiment(t.drop!, { title: "Pay now button", hypothesis: "h", change: "cta", district: "checkout" }, NOW);
    expect(exp.title).toBe("Experiment: Pay now button");
    expect(exp.state).toBe("building");
    const queued = { ...launchedItem(NOW), state: "queued" as const, orbit: undefined };
    expect(growthTick([{ ...exp, itemId: queued.id }], [queued], users, NOW, step).drop).toBeUndefined();
    const sig = experimentSignal(exp, t.drop!, NOW);
    expect(sig.kindHint).toBe("feature");
    expect(sig.body).toContain("−38%");
  });

  it("starts measuring when the PR launches, with the week before as the baseline", () => {
    const launchedAt = NOW - 2 * DAY;
    const users = funnel(NOW, (i) => (i >= 2 ? 0.3 : 0.36));
    const t = growthTick([building(NOW)], [launchedItem(launchedAt)], users, NOW, step);
    const [exp] = t.experiments;
    expect(exp.state).toBe("measuring");
    expect(exp.prNumber).toBe(77);
    expect(exp.launchedAt).toBe(launchedAt);
    expect(exp.baseline).toEqual({ entered: 2800, converted: 840, days: 7 });
    expect(t.changed).toBe(true);
  });

  it("waits for the full week before any call, then calls the lift", () => {
    const users = funnel(NOW, (i) => (i > 5 ? 0.3 : 0.38));
    const early = growthTick([building(NOW)], [launchedItem(NOW - 5 * DAY)], users, NOW, step).experiments[0];
    const t4 = growthTick([early], [launchedItem(NOW - 5 * DAY)], users, NOW, step);
    expect(t4.experiments[0].daysWatched).toBe(4); // full days after the launch day, up to yesterday
    expect(t4.experiments[0].state).toBe("measuring");
    const launchedAt = NOW - 9 * DAY;
    const users9 = funnel(NOW, (i) => (i > 9 ? 0.3 : 0.38));
    const measuring = growthTick([building(NOW)], [launchedItem(launchedAt)], users9, NOW, step).experiments[0];
    const t = growthTick([measuring], [launchedItem(launchedAt)], users9, NOW, step);
    expect(t.experiments[0].state).toBe("won");
    expect(t.decided.map((e) => e.id)).toEqual(["exp-1"]);
    expect(t.experiments[0].line).toContain("It worked");
  });

  it("missing PostHog days in the window end inconclusive, not no lift", () => {
    const launchedAt = NOW - 12 * DAY;
    const full = funnel(NOW, () => 0.3);
    const holey = new Map([[step.label, full.get(step.label)!.filter((r) => r.day !== dayOf(NOW - 6 * DAY) && r.day !== dayOf(NOW - 7 * DAY))]]);
    const measuring = growthTick([building(NOW)], [launchedItem(launchedAt)], full, NOW, step).experiments[0];
    expect(growthTick([measuring], [launchedItem(launchedAt)], holey, NOW, step).experiments[0].state).toBe("inconclusive");
  });

  it("no funnel numbers this poll: nothing moves, nothing is proposed", () => {
    const t = growthTick([building(NOW)], [launchedItem(NOW - 2 * DAY)], new Map(), NOW, step);
    expect(t.experiments[0].state).toBe("building");
    expect(t.drop).toBeUndefined();
  });

  it("calls no lift after the full week, and keeps the window to 7 days", () => {
    const launchedAt = NOW - 12 * DAY;
    const users = funnel(NOW, () => 0.3);
    const measuring = growthTick([building(NOW)], [launchedItem(launchedAt)], users, NOW, step).experiments[0];
    const [exp] = growthTick([measuring], [launchedItem(launchedAt)], users, NOW, step).experiments;
    expect(exp.state).toBe("flat");
    expect(exp.daysWatched).toBe(7);
  });

  it("drops an experiment whose ore disappeared before it shipped", () => {
    expect(growthTick([building(NOW)], [], new Map(), NOW, step).experiments[0].state).toBe("dropped");
  });

  it("leaves things alone when nothing changed", () => {
    const decided = { ...building(NOW), state: "won" as const };
    const t = growthTick([decided], [launchedItem(NOW - 3 * DAY)], funnel(NOW, () => 0.4), NOW, step);
    expect(t.changed).toBe(false);
    expect(t.experiments[0]).toBe(decided);
  });
});
