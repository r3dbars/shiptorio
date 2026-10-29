import { expect, test } from "bun:test";
import { createConveyorDemo } from "../src/deck2d/engine/conveyor-demo";

test("one issue physically arrives at each station before processing and only ships after the pad", () => {
  const source = createConveyorDemo();
  expect(source.view().stops.every(s => s.items.length === 0)).toBe(true);
  source.approve(source.view().card!.id);
  const cargo = () => source.view().stops.flatMap(s => s.items)[0];
  const id = cargo().id;
  source.step?.(100);
  expect(source.view().stops.some(s => s.state === "working")).toBe(false);
  source.arrive("other-issue", "planner");
  expect(source.view().stops.some(s => s.state === "working")).toBe(false);
  source.arrive(id, "planner"); expect(source.view().stops[1].state).toBe("working");
  source.step?.(2.5); expect(cargo().id).toBe(id);
  source.arrive(id, "builder"); source.step?.(4);
  expect(cargo()).toMatchObject({ id, badge: "PR301" });
  source.arrive(id, "checks"); source.step?.(2.5);
  source.arrive(id, "review"); expect(source.view().card?.yes).toBe("Approve review");
  source.step?.(100); expect(source.view().shipped).toBe(0);
  source.approve(source.view().card!.id); source.arrive(id, "gate");
  source.approve(source.view().card!.id); expect(source.view().shipped).toBe(0);
  source.arrive(id, "launch"); expect(source.view().shipped).toBe(1);
  source.replay(); source.approve(source.view().card!.id); expect(cargo().id).not.toBe(id);
});

test("a blocked machine does not process time until the blockage clears", () => {
  const source = createConveyorDemo(); source.approve(source.view().card!.id);
  const id = source.view().stops.flatMap(s => s.items)[0].id;
  source.arrive(id, "planner"); source.toggleBlock(); source.step?.(100);
  expect(source.view().jam).toBe("planner");
  expect(source.view().card?.yes).toBe("Clear blockage");
  source.approve(source.view().card!.id); expect(source.view().jam).toBeNull();
  expect(source.view().stops[1].items[0].id).toBe(id);
  source.step?.(2.5); expect(source.view().stops[2].items[0].id).toBe(id);
});
