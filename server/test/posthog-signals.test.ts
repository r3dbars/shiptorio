import { describe, expect, it } from "bun:test";
import { BrainSignal, SIGNAL_KINDS } from "@shiptorio/shared";
import { analyzeUsage, detectAdoption, fakeUsage, funnelWeekQuery, matchRoute, parseActive, parseEvents, postHogCollector, zeroFill, type FakeUsageScenario, type ItemLike, type UsageData } from "../src/signals/posthog";
import type { RouteDay } from "../src/sources/posthog";

const DAY = 86400000;
const NOW = Date.parse("2026-10-27T15:00:00Z");
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const launched = (id: string, daysAgo: number, extra: Partial<ItemLike> = {}): ItemLike => ({
  id, title: `Ship ${id}`, kind: "feature", district: "web",
  orbit: { since: NOW - daysAgo * DAY, until: NOW - daysAgo * DAY + DAY, state: "clear" }, ...extra,
});
const kinds = (signals: BrainSignal[]) => signals.map((s) => s.kind).sort();
const read = (fake: FakeUsageScenario, items: ItemLike[] = []) => postHogCollector.read({ creds: {}, fake, items }, NOW);

describe("PostHog collector (FAKE_POSTHOG)", () => {
  it("every signal fits the brain contract and uses a listed kind", async () => {
    for (const scenario of ["healthy", "falling", "flat", "unused", "leak", "stalled", "empty"] as const) {
      for (const s of await read(scenario, [launched("a", 2), launched("b", 5), launched("c", 9)])) {
        expect(BrainSignal.parse(s)).toBeTruthy();
        expect(SIGNAL_KINDS.posthog).toContain(s.kind);
        expect(s.id).toBe(`posthog:${s.kind}:${s.scope ?? "repo"}`);
        expect(s.freshUntil).toBeGreaterThan(s.observedAt);
      }
    }
  });

  it("healthy usage says nothing", async () => {
    expect(await read("healthy")).toEqual([]);
  });

  it("falling usage names the real numbers", async () => {
    const [s] = await read("falling");
    expect(s.kind).toBe("usage_falling");
    expect(s.title).toContain("84 people a day, from 120");
    expect(s.metric).toEqual({ value: 84, baseline: 120, unit: "people/day" });
  });

  it("flat usage only matters when you keep shipping", async () => {
    expect(kinds(await read("flat"))).not.toContain("usage_flat");
    const signals = await read("flat", [launched("a", 2), launched("b", 5), launched("c", 9)]);
    const flat = signals.find((s) => s.kind === "usage_flat")!;
    expect(flat.title).toContain("shipped 3 things");
    expect(flat.evidence.some((e) => e.label === "Launched: Ship a")).toBe(true);
  });

  it("a new event almost nobody fires is an unused feature, and old events aren't judged", async () => {
    const unused = (await read("unused")).filter((s) => s.kind === "feature_unused");
    expect(unused.map((s) => s.scope)).toEqual(["dark_mode_toggled"]);
    expect(unused[0].title).toContain("4 of 300 people");
  });

  it("a trickle of new people that isn't growing is a growth stall (go get more users)", async () => {
    const s = (await read("stalled")).find((x) => x.kind === "growth_stall")!;
    expect(s.title).toContain("10 new people a week");
    expect(s.metric?.unit).toBe("new/week");
  });

  it("an empty room is no_users, not a trend", async () => {
    expect(kinds(await read("empty"))).toEqual(["no_users"]);
  });

  it("a standing funnel leak", async () => {
    const s = (await read("leak")).find((x) => x.kind === "funnel_leak")!;
    expect(s.scope).toBe("/cart → /checkout");
    expect(s.title).toContain("85% of people drop");
  });
});

describe("PostHog collector, real reads", () => {
  it("not connected is a no_analytics signal, never a throw", async () => {
    const [s] = await postHogCollector.read({ creds: {}, items: [], connectUrl: "https://shiptorio.com/connect/posthog" }, NOW);
    expect(s.kind).toBe("no_analytics");
    expect(s.evidence[0].url).toBe("https://shiptorio.com/connect/posthog");
  });

  it("connected with no events at all says so", async () => {
    const empty: UsageData = { active: [], newPeople: [], wau: 0, events: [] };
    const [s] = await postHogCollector.read({ creds: { apiKey: "k", projectId: "1" }, items: [], fetch: async () => empty }, NOW);
    expect(s.kind).toBe("no_analytics");
    expect(s.title).toContain("no events");
  });

  it("links evidence to the player's PostHog project", async () => {
    const signals = await postHogCollector.read({ creds: { apiKey: "k", projectId: "378427" }, items: [], fetch: async () => fakeUsage(NOW, "falling") }, NOW);
    expect(signals[0].evidence[0].url).toBe("https://us.posthog.com/project/378427/web");
  });

  it("a failed read throws so the last good read stays", async () => {
    await expect(postHogCollector.read({ creds: { apiKey: "k", projectId: "1" }, items: [], fetch: async () => { throw new Error("PostHog rate limit"); } }, NOW)).rejects.toThrow("rate limit");
  });

  it("same problem, same id, worse severity on a worse read", () => {
    const mild = fakeUsage(NOW, "falling");
    const worse = { ...mild, active: mild.active.map((d, i) => (i >= 21 ? { ...d, users: 50 } : d)) };
    const a = analyzeUsage(mild, [], [], "$pageview", NOW)[0];
    const b = analyzeUsage(worse, [], [], "$pageview", NOW + DAY / 4)[0];
    expect(a.id).toBe(b.id);
    expect(b.severity).toBeGreaterThan(a.severity);
  });

  it("a missing day is unknown, not a crash", () => {
    const data = fakeUsage(NOW, "falling");
    expect(analyzeUsage({ ...data, active: data.active.slice(0, -1) }, [], [], "$pageview", NOW).map((s) => s.kind)).not.toContain("usage_falling");
  });
});

describe("launched features", () => {
  const routeDays = (route: string, users: number, n = 8): RouteDay[] =>
    Array.from({ length: n }, (_, i) => ({ event: "$pageview", route, day: dayOf(NOW - (i + 1) * DAY), count: users * 2, users }));

  it("matches a launch to its page by title path or folder, never a generic folder", () => {
    const routes = ["/", "/reports", "/billing"];
    expect(matchRoute({ title: "Add /billing page", district: "web" }, routes)).toBe("/billing");
    expect(matchRoute({ title: "Export button", district: "web/reports" }, routes)).toBe("/reports");
    expect(matchRoute({ title: "Faster build", district: "src" }, routes)).toBeNull();
  });

  it("a launched page that gets a sliver of traffic is unused", () => {
    const data = fakeUsage(NOW, "healthy");
    const routes = [...routeDays("/", 110), ...routeDays("/reports", 2)];
    const [s] = detectAdoption(data, [launched("r", 5, { district: "web/reports", title: "Reports page" })], routes, "$pageview", NOW);
    expect(s.kind).toBe("feature_unused");
    expect(s.scope).toBe("/reports");
    expect(s.title).toContain("gets 2 people a day");
  });

  it("a launched page people use is fine", () => {
    const routes = [...routeDays("/", 110), ...routeDays("/reports", 40)];
    expect(detectAdoption(fakeUsage(NOW, "healthy"), [launched("r", 5, { district: "web/reports" })], routes, "$pageview", NOW)).toEqual([]);
  });

  it("too fresh to judge", () => {
    const routes = [...routeDays("/", 110), ...routeDays("/reports", 1)];
    expect(detectAdoption(fakeUsage(NOW, "healthy"), [launched("r", 1, { district: "web/reports" })], routes, "$pageview", NOW)).toEqual([]);
  });
});

describe("queries and parsing", () => {
  it("only plain paths reach the funnel query", () => {
    expect(funnelWeekQuery({ from: "/cart", to: "/checkout", label: "x" })).toContain("'/cart'");
    expect(() => funnelWeekQuery({ from: "/cart' OR 1=1 --", to: "/checkout", label: "x" })).toThrow();
  });

  it("parses HogQL results and zero-fills quiet days", () => {
    const active = parseActive({ results: [["2026-10-20", 10], ["2026-10-22", 12]] });
    const filled = zeroFill(active, NOW);
    expect(filled.find((d) => d.day === "2026-10-21")?.users).toBe(0);
    expect(filled[0].day).toBe("2026-10-20");
    expect(parseEvents({ results: [["x", "2026-10-01", 5, 2]] })).toEqual([{ event: "x", firstDay: "2026-10-01", users: 5, users7d: 2 }]);
    expect(() => parseActive({ error: "nope" })).toThrow();
  });
});
