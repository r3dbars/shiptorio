import { expect, test } from "bun:test";
import type { FactoryState, Item } from "@shiptorio/shared";

import { Etas, etaLine } from "../src/ui/eta";

const item = (state: string, extra: Partial<Item> = {}) => ({ id: "a", state, updatedAt: 0, attempts: 0, ...extra }) as unknown as Item;
const st = (...items: Item[]) => ({ items }) as unknown as FactoryState;
const MIN = 60_000;

test("a cart on the line gets the typical time of the stages still ahead, minus time already spent", () => {
  const e = new Etas();
  e.observe(st(item("working")), 0);
  expect(etaLine(item("working"), 2 * MIN, e)).toBe("About 8 min to launch"); // 4 left building + 3 checks + 1 pass
  expect(etaLine(item("queued"), 0, e)).toBe("About 12 min to launch");
});

test("the pad says ready; parked, not-yet-picked and shipped carts say nothing", () => {
  const e = new Etas();
  expect(etaLine(item("on_pad"), 0, e)).toBe("Ready to launch");
  expect(etaLine(item("working", { priority: "park" }), 0, e)).toBeUndefined();
  expect(etaLine(item("ore"), 0, e)).toBeUndefined();
  expect(etaLine(item("launched"), 0, e)).toBeUndefined();
});

test("real stage times this page saw replace the typical ones; a long stage never reads 0", () => {
  const e = new Etas();
  e.observe(st(item("working")), 0);
  e.observe(st(item("inspecting")), 20 * MIN); // building really took 20 min
  e.observe(st(item("passed")), 21 * MIN); // and the checks 1 min
  expect(e.typical("working")).toBe(20 * MIN);
  expect(etaLine(item("working", { id: "b", updatedAt: 0 }), 0, e)).toBe("About 22 min to launch");
  expect(etaLine(item("working", { id: "c", updatedAt: 0 }), 60 * MIN, e)).toBe("About 3 min to launch"); // 30 s floor + 1 checks + 1 pass, rounded
});
