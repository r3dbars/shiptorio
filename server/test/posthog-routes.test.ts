import { expect, it } from "bun:test";
import { analyze, parseRows } from "../src/sources/posthog";

const now = Date.parse("2026-10-26T15:00:00Z");

function routeRows(event: string, baseline: number, yesterday: number[]) {
  const rows: unknown[][] = [];
  for (let day = 1; day <= 8; day++) {
    const counts = day === 1 ? yesterday : [baseline, baseline];
    counts.forEach((count, index) => rows.push([
      event, `/orders/${index + 100}`, new Date(now - day * 86400000).toISOString(), count, count,
    ]));
  }
  return parseRows({ results: rows });
}

it("combines yesterday's normalized paths before judging a traffic drop, regardless of row order", () => {
  const rows = routeRows("$pageview", 50, [40, 40]);
  for (const input of [rows, [...rows].reverse()]) {
    const result = analyze(input, "$pageview", now);
    expect(result.signals).toEqual([]);
    expect(result.traffic).toEqual([{ route: "/orders/:id", baseline: 100, usersPerDay: 100, yesterday: 80 }]);
  }
});

it("reports the combined traffic loss and affected users for a real drop", () => {
  const result = analyze(routeRows("$pageview", 50, [10, 20]), "$pageview", now);
  expect(result.signals).toHaveLength(1);
  expect(result.signals[0].title).toBe("/orders/:id traffic dropped 70% yesterday");
  expect(result.signals[0].usersTotal).toBe(70);
});

it("detects an exception spike spread across normalized paths", () => {
  const result = analyze(routeRows("$exception", 1, [6, 6]), "$pageview", now);
  expect(result.signals).toHaveLength(1);
  expect(result.signals[0].title).toBe("Error spike on /orders/:id: 12 exceptions yesterday");
  expect(result.signals[0].usersTotal).toBe(12);
});
