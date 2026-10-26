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
      districtTrust: [{ district: "docs", score: 0.8, risk: "low", permit: true }],
      metrics: { rockets: 4, bitersKilled: 1, escapedDefects: 0, customersAnswered: 1, usersUnblocked: 112, shipScore: 126 },
      foreman: { targetId: "inspector-1", tool: "inspect_pr" },
    });
    expect(state.move?.options[1].recommended).toBe(false);
    expect(state.foreman?.thinking).toBe(false);
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
  });

  test("player actions on the foreman layer", () => {
    for (const msg of [
      { type: "choose_move", moveId: "m1", optionId: "review" },
      { type: "undo", actionId: "a1" },
      { type: "revoke_permit", district: "docs" },
      { type: "set_goal", text: "ship checkout fixes" },
    ]) expect(WebToServer.safeParse(msg).success).toBe(true);
    expect(WebToServer.safeParse({ type: "set_goal", text: "x".repeat(201) }).success).toBe(false);
  });
});
