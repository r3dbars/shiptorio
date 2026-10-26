import { expect, test } from "bun:test";
import { runCase, runSuite } from "../src/system";
import { SCENARIOS } from "../../web/src/sim/engine";
import { BEATS, introMode } from "../../web/src/ui/IntroTour";
import { readConfig } from "../../web/src/source";
test("playtests are repeatable by seed and exercise real simulated decisions", () => {
  const a = runCase("heal", 71), b = runCase("heal", 71);
  expect(a).toEqual(b);
  expect(a.decisions).toBeGreaterThan(0);
  expect(a.messages).toBeGreaterThan(20);
  expect(a.states).toContain("working");
});
test("every core scenario is covered with a gameplay and disconnection journey", () => {
  const cases = runSuite();
  expect(cases).toHaveLength(Object.keys(SCENARIOS).length * 2);
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


test("the guided intro drives all eight UI beats, reproduces rework and then ships automatically", () => {
  const result = runCase("intro", 71);
  expect(result.guided?.steps).toEqual(BEATS.map(b => b.kick));
  expect(result.guided?.actions).toEqual(expect.arrayContaining(["station_action:build", "launch_pr", "set_autonomy", "station_action:catch", "place_machine", "connect_source", "station_action:lights"]));
  expect(result.guided).toMatchObject({ completed: true, verifiedRework: true, sentryOre: true });
  expect(result.guided!.automatedLaunches).toBeGreaterThan(0);
  expect(result.findings).toEqual([]);
  expect(runCase("intro", 71, "early-close").findings).toEqual([]);
});

test("intro flags never enable guided commands on a live repository source", () => {
  expect(introMode(readConfig("?source=live&scenario=intro&intro=1&repo=r3dbars/shiptorio"))).toBe(false);
  expect(introMode(readConfig("?source=sim&scenario=intro"))).toBe(true);
  expect(introMode(readConfig(""))).toBe(false);
});
