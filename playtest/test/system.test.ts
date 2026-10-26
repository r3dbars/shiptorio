import { expect, test } from "bun:test";
import { runCase, runSuite } from "../src/system";
test("playtests are repeatable by seed and exercise real simulated decisions", () => {
  const a = runCase("heal", 71), b = runCase("heal", 71);
  expect(a).toEqual(b);
  expect(a.decisions).toBeGreaterThan(0);
  expect(a.messages).toBeGreaterThan(20);
  expect(a.states).toContain("working");
});
test("every core scenario is covered with a gameplay and disconnection journey", () => {
  const cases = runSuite();
  expect(cases).toHaveLength(10);
  expect(cases.filter(c => c.mode === "journey").every(c => c.decisions > 0)).toBe(true);
  expect(cases.flatMap(c => c.findings).filter(f => f.severity === "P1")).toEqual([]);
});
