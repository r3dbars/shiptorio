import { describe, expect, test } from "bun:test";
import { FactoryState, Move, ServerToWeb, WebToServer } from "@shiptorio/shared";

const base = {
  repo: "demo/shop",
  baseBranch: "main",
  districts: [],
  machines: [],
  belts: [],
  items: [],
  power: [],
  science: { red: 0, green: 0, grey: 0, blue: 0 },
  trust: 0.5,
  tick: 0,
};

describe("foreman contract", () => {
  test("a state without the foreman layer still validates", () => {
    expect(FactoryState.safeParse(base).success).toBe(true);
  });

  test("state carries bottleneck, move, trust and metrics", () => {
    const state = FactoryState.parse({
      ...base,
      goal: "fix checkout",
      bottleneck: { stage: "pad", wip: 3, ageMs: 9 * 3600e3, throughputPerHour: 0.5, valueAtRisk: 112, summary: "3 PRs waiting on review for 9h" },
      move: {
        id: "m1",
        title: "Bottleneck: launch pad",
        why: "Merging #41 closes the checkout crash hitting 112 users",
        options: [{ id: "review", label: "Review #41", recommended: true }, { id: "permit", label: "Auto-launch docs PRs" }],
        createdAt: 1,
      },
      autonomy: {
        level: "floor",
        districts: [{ district: "docs", score: 0.8, risk: "low", permit: true }],
        next: { level: "build", have: 3, need: 5, label: "PRs merged from Spark's plans, no escaped defect" },
      },
      metrics: { rockets: 4, bitersKilled: 1, escapedDefects: 0, customersAnswered: 1, usersUnblocked: 112, shipScore: 126 },
      foreman: { targetId: "inspector-1", tool: "inspect_pr" },
    });
    expect(state.move?.options[1].recommended).toBe(false);
    expect(state.foreman?.thinking).toBe(false);
    expect(state.move?.options[0].actions).toEqual([]);
    expect(state.autonomy?.ranAlone).toBe(0);
  });

  test("a move needs 1 to 3 options", () => {
    const move = { id: "m", title: "t", why: "w", createdAt: 0 };
    expect(Move.safeParse({ ...move, options: [] }).success).toBe(false);
    expect(Move.safeParse({ ...move, options: Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, label: "x" })) }).success).toBe(false);
  });

  test("Spark log lines and move messages round-trip", () => {
    const log = { type: "log", level: "info", text: "Linked the email to the Sentry error", at: 1, actor: "spark", tool: "link_items", reason: "same stack", actionId: "a1" };
    expect(ServerToWeb.parse(log)).toEqual(log as never);
    expect(ServerToWeb.safeParse({ type: "move_resolved", moveId: "m1", optionId: "review", actor: "player" }).success).toBe(true);
    expect(ServerToWeb.safeParse({ type: "autonomy_unlocked", level: "floor", text: "Spark earned Floor" }).success).toBe(true);
    expect(ServerToWeb.safeParse({ ...log, approvedBy: "autonomy" }).success).toBe(true);
  });

  test("a move option carries the Spark tool calls it applies", () => {
    const opt = Move.parse({
      id: "m2",
      title: "Checkout crash, 112 users",
      why: "Send to your Claude Code assembler with this plan?",
      stage: "build",
      options: [
        { id: "go", label: "Go", recommended: true, actions: [{ tool: "start_job", args: { itemId: "i1", machineId: "asm-claude-1" }, reason: "top value item" }] },
        { id: "skip", label: "Skip" },
      ],
      createdAt: 2,
    }).options[0];
    expect(opt.actions[0].tool).toBe("start_job");
    expect(Move.safeParse({ id: "m3", title: "t", why: "w", stage: "resources", options: [{ id: "a", label: "Sign in with Claude" }], createdAt: 0 }).success).toBe(true);
  });

  test("player actions on the foreman layer", () => {
    for (const msg of [
      { type: "choose_move", moveId: "m1", optionId: "review" },
      { type: "undo", actionId: "a1" },
      { type: "set_autonomy", level: "advisor" },
      { type: "set_autonomy", district: "docs", permit: false },
      { type: "set_goal", text: "ship checkout fixes" },
    ]) expect(WebToServer.safeParse(msg).success).toBe(true);
    expect(WebToServer.safeParse({ type: "set_goal", text: "x".repeat(201) }).success).toBe(false);
  });
});

describe("gauntlet contract", () => {
  test("stations, scar tags and station actions", () => {
    const state = FactoryState.parse({
      ...base,
      stations: [
        {
          id: "verify-1",
          kind: "verify",
          name: "Verify bay",
          machineId: "verify-1",
          wip: 4,
          oldestWaitMs: 23 * 60e3,
          caughtThisWeek: 5,
          lastLog: { who: "Verify bay", text: "#41 passed CI but the crash still happens", ok: false },
          actions: [{ id: "second-bay", label: "Build a second verify bay", recommended: true }, { id: "recipe", label: "Teach a /checkout verify recipe" }],
        },
      ],
      bottleneck: { stage: "inspect", stationId: "verify-1", wip: 4, ageMs: 1, throughputPerHour: 1, valueAtRisk: 4, summary: "4 PRs waiting on the verify bay" },
      items: [
        {
          id: "i1",
          kind: "bug",
          source: "sentry",
          title: "cart.total is undefined",
          district: "checkout",
          state: "rejected",
          updatedAt: 1,
          scars: [{ station: "verify", reason: "still repros with an empty cart", strike: 2 }],
        },
      ],
    });
    expect(state.stations?.[0].actions[1].recommended).toBe(false);
    expect(state.items[0].scars?.[0].strike).toBe(2);
    expect(WebToServer.safeParse({ type: "station_action", stationId: "verify-1", action: "second-bay" }).success).toBe(true);
    expect(FactoryState.safeParse({ ...base, stations: [{ id: "x", kind: "lint", name: "x", wip: 0, caughtThisWeek: 0 }] }).success).toBe(false);
  });
});

test("Later intent correlation is optional for old clients and validates as a bounded UUID", () => {
  expect(WebToServer.safeParse({type:"defer_move",moveId:"card"}).success).toBe(true);
  expect(WebToServer.safeParse({type:"defer_move",moveId:"card",intentId:"11111111-1111-4111-8111-111111111111"}).success).toBe(true);
  for(const intentId of ["not-a-uuid", "x".repeat(10000), 42]) expect(WebToServer.safeParse({type:"defer_move",moveId:"card",intentId}).success).toBe(false);
});
