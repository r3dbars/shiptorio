import { expect, test } from "bun:test";
import { FUEL_PACK, PLANS, planMargin, sparkCostPerLaunch } from "../src/pricing";

test("a launch costs about a dime of Spark", () => {
  const c = sparkCostPerLaunch();
  expect(c).toBeGreaterThan(0.05);
  expect(c).toBeLessThan(0.2);
});

test("paid plans don't lose money even when a player burns all their fuel", () => {
  for (const p of PLANS.filter((p) => p.price)) expect(planMargin(p)).toBeGreaterThan(-0.05);
  expect(FUEL_PACK.price / FUEL_PACK.launches).toBeGreaterThan(sparkCostPerLaunch() * 1.5);
});

test("plans grow in price, fuel, repos and players", () => {
  for (let i = 1; i < PLANS.length; i++) {
    for (const k of ["price", "launches", "repos", "players"] as const) expect(PLANS[i][k]).toBeGreaterThanOrEqual(PLANS[i - 1][k]);
  }
});
