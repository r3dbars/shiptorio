import { describe, expect, test } from "bun:test";
import type { Move } from "@shiptorio/shared";
import { countKinds, trayCard } from "../src/ui/Attention";
import { quietHour } from "../src/ui/Progress";

const card = (id: string, tool: string): Move => ({ id, title: id, why: "", createdAt: 0, options: [{ id: "go", label: "Go", recommended: true, actions: [{ tool, args: {}, reason: "" }] }] });

describe("the calm Needs you tray", () => {
  test("shows a stuck line first, then parked work, then ideas, keeping deck order within a kind", () => {
    const idea = card("idea", "research"), plan = card("plan", "plan_runner_job"), plan2 = card("plan2", "plan_runner_job"), stuck = card("stuck:x", "inspect_bottleneck");
    expect(trayCard([idea, plan, plan2, stuck])?.id).toBe("stuck:x");
    expect(trayCard([idea, plan, plan2])?.id).toBe("plan");
    expect(trayCard([idea])?.id).toBe("idea");
    expect(trayCard([])).toBeNull();
    expect(countKinds([idea, plan, plan2, stuck])).toEqual({ approve: 2, steer: 1, suggest: 1 });
  });
  test("quiet hours run 10 pm to 8 am", () => {
    expect([21, 22, 3, 7, 8].map(quietHour)).toEqual([false, true, true, true, false]);
  });
});
