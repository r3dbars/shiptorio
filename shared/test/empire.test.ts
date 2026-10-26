import { expect, test } from "bun:test";
import { emptyIsland, rollup, stuckScore, type IslandSummary } from "../src/empire";

const isl = (repo: string, o: Partial<IslandSummary> = {}): IslandSummary => ({ ...emptyIsland(repo, 1), ready: true, ...o });

test("automated rolls up weighted by launches, so a busy island counts more", () => {
  const r = rollup([isl("a/busy", { launches: 9, automated: 1, rockets: 9 }), isl("a/quiet", { launches: 1, automated: 0, rockets: 1 })]);
  expect(r.automated).toBeCloseTo(0.9);
  expect(r.rockets).toBe(10);
  expect(rollup([]).automated).toBe(0);
});

test("the most stuck island is the one with cards on you, then the oldest pile", () => {
  const pile = { stage: "inspect" as const, summary: "2 PRs waiting on review for 10m", wip: 2, ageMs: 10 * 60_000 };
  const a = isl("a/pile", { bottleneck: pile });
  const b = isl("a/cards", { waiting: 1 });
  expect(stuckScore(a)).toBe(20);
  expect(rollup([a, b]).worst?.repo).toBe("a/cards");
  expect(rollup([isl("a/clear")]).worst).toBeNull();
});

test("research shared across islands is the union, once each", () => {
  expect(rollup([isl("a/x", { research: ["leftovers"] }), isl("a/y", { research: ["leftovers", "secrets"] })]).research).toEqual(["leftovers", "secrets"]);
});
