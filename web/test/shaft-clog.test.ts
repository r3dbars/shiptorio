import { expect, test } from "bun:test";
import type { Bottleneck, FactoryState } from "@shiptorio/shared";
import { type Clog, clogOf, lookOf, SHOW_AT } from "../src/map/shaft/clog";
import { makeLayout, defaultPlan, MINES } from "../src/map/shaft/layout";

// The bottleneck drawn in the shaft (clog.ts): every area lands somewhere real in the world, a normal working line
// draws nothing, and a real jam piles up at the station it's stuck at.

const stations = makeLayout(defaultPlan()).stations.map((s) => ({ id: s.id, type: s.type }));
const state = (b: Partial<Bottleneck> | null) =>
  ({ bottleneck: b && { stage: "inspect", wip: 1, ageMs: 0, throughputPerHour: 0, valueAtRisk: 1, summary: "", ...b } }) as unknown as FactoryState;
const clog = (area: Clog["area"], o: Partial<Clog> = {}): Clog => ({ id: area, area, severity: 0.7, ...o });

test("every area has a place in the default shaft", () => {
  expect(lookOf(clog("quality"), stations)).toEqual({ kind: "ore", mine: "sentry", color: 0xff3a2a });
  expect(lookOf(clog("feedback"), stations)).toEqual({ kind: "mail", mine: "inbox" });
  expect(lookOf(clog("users"), stations)).toEqual({ kind: "sky" });
  expect(lookOf(clog("speed"), stations)).toEqual({ kind: "crates", at: "ci" });
  expect(lookOf(clog("focus"), stations)).toEqual({ kind: "crates", at: "planner" });
  expect(lookOf(clog("ship"), stations)).toEqual({ kind: "crates", at: "gate" });
});

test("ship goes where the work is stuck", () => {
  expect(lookOf(clog("ship", { stationId: "review" }), stations)).toEqual({ kind: "crates", at: "review" });
  expect(lookOf(clog("ship", { stationId: "nope" }), stations)).toEqual({ kind: "crates", at: "gate" });
  expect(lookOf(clog("ship", { signal: "factory:queue_jam:build" }), stations)).toEqual({ kind: "crates", at: "asm-1" });
  expect(lookOf(clog("ship", { signal: "factory:queue_jam:intake" }), stations)).toEqual({ kind: "ore", mine: "github", color: 0xffb040 });
  expect(lookOf(clog("ship", { signal: "repo:issues_untriaged:repo" }), stations)?.kind).toBe("ore");
  expect(lookOf(clog("ship", { signal: "factory:rework_loop:repo" }), stations)).toEqual({ kind: "crates", at: "review" });
});

test("a shaft without the thing draws nothing rather than guessing", () => {
  expect(lookOf(clog("speed"), [{ id: "planner", type: "planner" }])).toBeNull();
  expect(lookOf(clog("quality"), stations, { github: MINES.github })).toBeNull();
});

test("a working line is quiet; a real jam shows, sized by how bad it is", () => {
  expect(clogOf(state(null), null)).toBeNull();
  expect(clogOf(state({ wip: 2, ageMs: 5 * 60_000 }), null)).toBeNull();
  const jam = clogOf(state({ stage: "inspect", stationId: "ci-1", wip: 6, ageMs: 2 * 3_600_000 }), null)!;
  expect(jam.area).toBe("ship");
  expect(jam.stationId).toBe("ci-1");
  expect(jam.severity).toBeGreaterThanOrEqual(SHOW_AT);
  const worse = clogOf(state({ stage: "inspect", stationId: "ci-1", wip: 9, ageMs: 4 * 3_600_000 }), null)!;
  expect(worse.severity).toBeGreaterThan(jam.severity);
  expect(worse.id).toBe(jam.id); // the same jam getting worse keeps its pile
});

test("no power or no agent draws no pile: the builders already stand dark", () => {
  expect(clogOf(state({ stage: "power", wip: 9, ageMs: 9e6 }), null)).toBeNull();
  expect(clogOf(state({ stage: "resources", wip: 9, ageMs: 9e6 }), null)).toBeNull();
});

test("?clog= previews any area, and ?clog=0 turns it off", () => {
  const jam = state({ wip: 9, ageMs: 9e6 });
  expect(clogOf(jam, "users")).toEqual({ id: "preview:users", area: "users", severity: 0.7 });
  expect(clogOf(jam, "quality:0.3")?.severity).toBe(0.3);
  expect(clogOf(jam, "0")).toBeNull();
  expect(clogOf(jam, "bogus")?.id).toStartWith("factory:");
});
