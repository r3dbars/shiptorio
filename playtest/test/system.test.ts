import { expect, test } from "bun:test";
import { runCase, runSuite } from "../src/system";
import { SCENARIOS } from "../../web/src/sim/engine";
test("playtests are repeatable by seed and exercise real simulated decisions", () => {
  const a = runCase("heal", 71), b = runCase("heal", 71);
  expect(a).toEqual(b);
  expect(a.decisions).toBeGreaterThan(0);
  expect(a.messages).toBeGreaterThan(20);
  expect(a.states).toContain("working");
});
test("every core scenario is covered with a gameplay and disconnection journey", () => {
  const cases = runSuite();
  expect(cases).toHaveLength((Object.keys(SCENARIOS).length - 2) * 2); // less the two guided tours (system.ts GUIDED)
  expect(cases.length).toBeGreaterThanOrEqual(10);
  expect(cases.filter(c => c.mode === "journey").every(c => c.decisions > 0)).toBe(true);
  expect(cases.flatMap(c => c.findings)).toEqual([]); // Includes the post-disconnect regression, even though it is P2.
});

test("the first-run ships its fixes then offers a real input-growth decision", () => {
  const result=runCase("first-run",71);
  expect(result.shipped).toBeGreaterThanOrEqual(2);
  expect(result.tools).toContain("connect_source");
  expect(result.findings).toEqual([]);
});


