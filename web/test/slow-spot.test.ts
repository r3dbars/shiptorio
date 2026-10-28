import { describe, expect, test } from "bun:test";
import type { Bottleneck, Move } from "@shiptorio/shared";
import { slowSpot, taskOrder } from "../src/ui/slowSpot";

const card = (id: string, tool: string): Move => ({ id, title: id, why: "", createdAt: 0, options: [{ id: "go", label: "Go", recommended: true, actions: [{ tool, args: {}, reason: "" }] }] });
const jam: Bottleneck = { stage: "inspect", wip: 2, ageMs: 600_000, throughputPerHour: 1, valueAtRisk: 3, summary: "2 PRs red on CI for 10 min" };

describe("the simple screen's slow-spot line", () => {
  test("names the player when work is parked on them, counting stuck and approve cards but never ideas", () => {
    const deck = [card("idea", "research"), card("plan", "plan_runner_job"), card("stuck:x", "inspect_bottleneck")];
    expect(slowSpot(deck, jam)).toEqual({ who: "you", text: "You · 2 waiting" });
  });
  test("names the jammed stage when nothing is parked on the player", () => {
    expect(slowSpot([card("idea", "research")], jam)).toEqual({ who: "line", text: "Checks · 2 PRs red on CI for 10 min" });
  });
  test("says all clear when nothing is jammed", () => {
    expect(slowSpot([], { ...jam, wip: 0 }).who).toBe("clear");
    expect(slowSpot([], null).who).toBe("clear");
  });
  test("the tray shows stuck work first, then approvals, then ideas, keeping deck order within a kind", () => {
    const deck = [card("idea", "research"), card("plan", "plan_runner_job"), card("stuck:x", "inspect_bottleneck"), card("plan2", "plan_runner_job")];
    expect(taskOrder(deck).map((m) => m.id)).toEqual(["stuck:x", "plan", "plan2", "idea"]);
  });
});
