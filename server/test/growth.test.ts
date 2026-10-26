import { describe, expect, it } from "bun:test";
import type { Experiment, Item, RouteUsers } from "@shiptorio/shared";
import { experimentSignal, growthTick, newExperiment, routeUsers } from "../src/growth";
import { fakePostHogRows } from "../src/sources/posthog";

const DAY = 86400000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const step = { from: "/cart", to: "/checkout", label: "/cart → /checkout" };

/** /cart → /checkout per day: `share(i)` of 400 people convert, i days ago. */
function funnel(now: number, share: (daysAgo: number) => number, days = 20): RouteUsers[] {
  const out: RouteUsers[] = [];
  for (let i = 0; i <= days; i++) {
    const day = dayOf(now - i * DAY);
    out.push({ route: "/cart", day, users: 400 }, { route: "/checkout", day, users: Math.round(400 * share(i)) });
  }
  return out;
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

  it("reads the key event's users per route from PostHog rows", () => {
    const users = routeUsers(fakePostHogRows(NOW), "$pageview");
    expect(users.some((u) => u.route === "/cart" && u.users > 0)).toBe(true);
    expect(users.every((u) => u.route !== "/checkout" || u.users >= 0)).toBe(true);
  });

  it("proposes on a fresh funnel drop, and only once while one is open", () => {
    const users = funnel(NOW, (i) => (i === 1 ? 0.25 : 0.4));
    const t = growthTick([], [], users, NOW);
    expect(t.drop?.step.label).toBe("/cart → /checkout");
    const exp = newExperiment(t.drop!, { title: "Pay now button", hypothesis: "h", change: "cta", district: "checkout" }, NOW);
    expect(exp.title).toBe("Experiment: Pay now button");
    expect(exp.state).toBe("building");
    const queued = { ...launchedItem(NOW), state: "queued" as const, orbit: undefined };
    expect(growthTick([{ ...exp, itemId: queued.id }], [queued], users, NOW).drop).toBeUndefined();
    const sig = experimentSignal(exp, t.drop!, NOW);
    expect(sig.kindHint).toBe("feature");
    expect(sig.body).toContain("−38%");
  });

  it("starts measuring when the PR launches, with the week before as the baseline", () => {
    const launchedAt = NOW - 2 * DAY;
    const users = funnel(NOW, (i) => (i >= 2 ? 0.3 : 0.36));
    const t = growthTick([building(NOW)], [launchedItem(launchedAt)], users, NOW);
    const [exp] = t.experiments;
    expect(exp.state).toBe("measuring");
    expect(exp.prNumber).toBe(77);
    expect(exp.launchedAt).toBe(launchedAt);
    expect(exp.baseline).toEqual({ entered: 2800, converted: 840, days: 7 });
    expect(t.changed).toBe(true);
  });

  it("calls a lift once a few full days are in", () => {
    const launchedAt = NOW - 5 * DAY;
    const users = funnel(NOW, (i) => (i > 5 ? 0.3 : 0.38));
    const measuring = growthTick([building(NOW)], [launchedItem(launchedAt)], users, NOW).experiments[0];
    const t = growthTick([measuring], [launchedItem(launchedAt)], users, NOW);
    const [exp] = t.experiments;
    expect(exp.daysWatched).toBe(4); // full days after the launch day, up to yesterday
    expect(exp.state).toBe("won");
    expect(t.decided.map((e) => e.id)).toEqual(["exp-1"]);
    expect(exp.line).toContain("It worked");
  });

  it("calls no lift after the full week, and keeps the window to 7 days", () => {
    const launchedAt = NOW - 12 * DAY;
    const users = funnel(NOW, () => 0.3);
    const measuring = growthTick([building(NOW)], [launchedItem(launchedAt)], users, NOW).experiments[0];
    const [exp] = growthTick([measuring], [launchedItem(launchedAt)], users, NOW).experiments;
    expect(exp.state).toBe("flat");
    expect(exp.daysWatched).toBe(7);
  });

  it("drops an experiment whose ore disappeared before it shipped", () => {
    expect(growthTick([building(NOW)], [], [], NOW).experiments[0].state).toBe("dropped");
  });

  it("leaves things alone when nothing changed", () => {
    const decided = { ...building(NOW), state: "won" as const };
    const t = growthTick([decided], [launchedItem(NOW - 3 * DAY)], funnel(NOW, () => 0.4), NOW);
    expect(t.changed).toBe(false);
    expect(t.experiments[0]).toBe(decided);
  });
});
