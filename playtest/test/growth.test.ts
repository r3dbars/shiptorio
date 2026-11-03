import { describe, expect, test } from "bun:test";
import type { FactoryState, ServerToWeb } from "../../shared/src";
import { connectSim } from "../../web/src/sim/engine";
import { applyPatch } from "../../web/src/source/patch";
import { Clock } from "../src/system";

// ?source=sim&scenario=growth, played by someone who says yes to every suggested option.
function play(ticks: number) {
  const clock = new Clock();
  clock.install();
  let state: FactoryState | null = null;
  const tools: string[] = [];
  try {
    const src = connectSim("growth", (m: ServerToWeb) => {
      if (m.type === "snapshot") state = m.state;
      else if (m.type === "patch" && state) state = applyPatch(state, m.patch);
      else if (m.type === "log" && m.tool) tools.push(m.tool);
      else if (m.type === "move") queueMicrotask(() => src.send({ type: "choose_move", moveId: m.move.id, optionId: m.move.options.find((o) => o.recommended)!.id }));
    }, () => {});
    for (let i = 0; i < ticks; i++) clock.advance(900);
    src.close();
  } finally {
    clock.restore();
  }
  return { state: state as FactoryState | null, tools };
}

describe("growth scenario", () => {
  const { state, tools } = play(160);
  const exps = state!.experiments!;
  const cart = exps.find((e) => e.step.from === "/cart")!;
  const pricing = exps.find((e) => e.step.from === "/pricing")!;

  test("a funnel drop becomes an experiment that ships as a PR", () => {
    expect(cart.itemId).toBeDefined();
    expect(cart.prNumber).toBeGreaterThan(0);
    const item = state!.items.find((i) => i.id === cart.itemId)!;
    expect(item.state).toBe("launched");
    expect(item.source).toBe("posthog");
  });
  test("the measure station calls the checkout button a lift", () => {
    expect(cart.state).toBe("won");
    expect(cart.lift!).toBeGreaterThan(0.1);
    expect(cart.p!).toBeLessThan(0.05);
    expect(cart.line).toContain("Observed");
  });
  test("the pricing copy is a wash after the full week", () => {
    expect(pricing.state).toBe("flat");
    expect(pricing.daysWatched).toBe(7);
    expect(pricing.line).toContain("No clear lift");
  });
  test("the planner's proposal lands in how it thinks; the verdict is math, so it's only on the floor log", () => {
    expect(tools).toContain("propose_experiment");
    expect(tools).toContain("measure_experiment");
    const decisions = state!.brain!.thoughts.map((t) => t.decision);
    expect(decisions).toContain("growth");
  });
  test("the measure station is on the map and in the station list", () => {
    expect(state!.machines.some((m) => m.id === "measure-1")).toBe(true);
    expect(state!.stations!.find((s) => s.kind === "measure")?.passRate).toBe(1);
    expect(state!.machines.some((m) => m.id === "ore-posthog")).toBe(true);
  });
});
