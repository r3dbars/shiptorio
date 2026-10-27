import { describe, expect, test } from "bun:test";
import type { FactoryState, Item } from "@shiptorio/shared";
import { whatsNext } from "../src/ui/whatsNext";

// A small caught-up factory: issue deposit, one assembler, the merge gate, nothing on the line.
function factory(over: Partial<FactoryState> = {}): FactoryState {
  return {
    repo: "you/demo-shop",
    baseBranch: "main",
    districts: [{ name: "web", x: 0, y: 0, w: 4, h: 4, files: 10 }],
    machines: [
      { id: "ore-issues", type: "ore_deposit", x: -6, y: 0, tier: 1, state: "idle" },
      { id: "assembler-1", type: "assembler", x: 0, y: 0, tier: 1, state: "idle" },
      { id: "gate-1", type: "inspector", x: 9, y: 0, tier: 1, state: "idle" },
    ],
    belts: [],
    items: [],
    power: [],
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    research: { done: [], spent: 0 },
    trust: 0.5,
    tick: 40,
    move: null,
    metrics: { rockets: 2, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 2 },
    stations: [{ id: "gate-1", kind: "merge", name: "Merge gate", machineId: "gate-1", wip: 0, caughtThisWeek: 0, actions: [] }],
    ...over,
  } as FactoryState;
}

const item = (state: Item["state"], n = 1): Item =>
  ({ id: `it-${n}`, kind: "bug", source: "github_issue", title: `Fix ${n}`, district: "web", state, attempts: 0, updatedAt: 0, prNumber: 140 + n }) as Item;

// All available mines connected, so no empty mine competes
const mined = {
  sources: (["sentry", "posthog", "email"] as const).map((kind) => ({ kind, state: "connected" as const, detail: "", eventsToday: 0, setup: { steps: [] } })),
};

describe("whatsNext", () => {
  test("a PR on the pad comes first", () => {
    const n = whatsNext(factory({ items: [item("launched", 1), item("on_pad", 2)], deck: [] }));
    expect(n.cta.action).toEqual({ do: "launch", itemId: "it-2" });
    expect(n.title).toContain("#142");
  });

  test("live opens the existing merge gate without fabricating a launch command", () => {
    const n = whatsNext(factory({ items: [item("on_pad", 2)] }), { live: true });
    expect(n.cta.label).toBe("Open the merge gate");
    expect(n.cta.action).toEqual({ do: "station", id: "gate-1" });
    expect(n.title).not.toContain("passed every check");
  });

  test("live missing gate opens check-in without inventing a station or launch", () => {
    const n = whatsNext(factory({ items: [item("on_pad", 2)], stations: [] }), { live: true });
    expect(n.cta.action).toEqual({ do: "checkin" });
  });

  test("waiting cards send you to the check-in", () => {
    const deck = [{ id: "m1", title: "t", why: "w", options: [{ id: "a", label: "A", recommended: true, actions: [] }], createdAt: 0 }];
    expect(whatsNext(factory({ deck })).cta.action).toEqual({ do: "checkin" });
  });

  test("a stuck station opens that station", () => {
    const n = whatsNext(factory({ bottleneck: { stage: "pad", stationId: "gate-1", wip: 2, ageMs: 0, throughputPerHour: 0, valueAtRisk: 2, summary: "2 PRs wait for a merge" } as FactoryState["bottleneck"] }));
    expect(n.cta.action).toEqual({ do: "station", id: "gate-1" });
  });

  test("spendable science packs suggest research", () => {
    const n = whatsNext(factory({ science: { red: 3, green: 2, grey: 1, blue: 1 }, metrics: { rockets: 7, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 7 } }));
    expect(n.cta.action).toEqual({ do: "research" });
    expect(n.grows).toBe("+1 CHECK");
  });

  test("after three rockets, an empty mine asks to be connected", () => {
    const n = whatsNext(factory({ metrics: { rockets: 3, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 3 } }));
    expect(n.cta.action).toEqual({ do: "connect", source: "sentry" });
    expect(n.grows).toBe("+1 SOURCE");
  });

  test("support is the next mine once error and traffic mines are connected", () => {
    const sources = mined.sources.filter(s => s.kind !== "email");
    const metrics = { rockets: 9, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 9 };
    expect(whatsNext(factory({ sources, metrics })).cta.action).toEqual({ do: "connect", source: "email" });
  });

  test("no mine nudge before the first rocket", () => {
    const n = whatsNext(factory({ metrics: { rockets: 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0 } }));
    expect(n.cta.action.do).not.toBe("connect");
  });

  test("mines unlock one at a time: the next waits three more rockets", () => {
    const one = { sources: [{ kind: "sentry" as const, state: "connected" as const, detail: "", eventsToday: 0, setup: { steps: [] } }] };
    const at = (rockets: number) => whatsNext(factory({ ...one, metrics: { rockets, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: rockets } }));
    expect(at(5).cta.action.do).not.toBe("connect");
    expect(at(6).cta.action).toEqual({ do: "connect", source: "posthog" });
  });

  test("a lane near its permit points at the merge gate", () => {
    const autonomy = { level: "advisor", districts: [{ district: "docs", score: 0.7, risk: "low", permit: false }], next: null, ranAlone: 0 } as FactoryState["autonomy"];
    const n = whatsNext(factory({ ...mined, autonomy }));
    expect(n.id).toBe("permit:docs");
    expect(n.cta.action).toEqual({ do: "station", id: "gate-1" });
  });

  test("room to build suggests another assembler", () => {
    expect(whatsNext(factory(mined), { canPlace: true }).cta.action).toEqual({ do: "place" });
  });

  test("fixes still on the line: watch them", () => {
    const n = whatsNext(factory({ ...mined, items: [item("working", 1), item("inspecting", 2)] }));
    expect(n.cta.action).toEqual({ do: "sheet", sheet: "line" });
    expect(n.title).toContain("2 fixes");
  });

  test("caught up still always has a move", () => {
    const n = whatsNext(factory({ ...mined, items: [item("launched", 1)] }));
    expect(n.id).toBe("caught-up");
    expect(n.cta.label.length).toBeGreaterThan(0);
  });

  test("never mentions the planner model by name", () => {
    const states = [factory(), factory(mined), factory({ items: [item("on_pad")] }), factory({ ...mined, items: [item("working")] })];
    for (const st of states) {
      const n = whatsNext(st, { canPlace: true });
      expect(`${n.kicker} ${n.title} ${n.why} ${n.cta.label}`).not.toMatch(/spark/i);
    }
  });
});
