import { expect, test } from "bun:test";
import { funnelDays } from "../src/growth";
const step = { from: "/cart", to: "/checkout", label: "Cart to checkout" };
const at = Date.parse("2026-10-26T12:00:00Z");
test("daily cohort helper keeps disjoint people and reversed visits out of conversions", () => {
  const events = [
    { person: "alice", route: "/cart", at },
    { person: "bob", route: "/checkout", at: at + 1000 },
    { person: "carol", route: "/checkout", at },
    { person: "carol", route: "/cart", at: at + 1000 },
    { person: "dave", route: "/cart", at },
    { person: "dave", route: "/checkout", at: at + 1000 },
  ];
  expect(funnelDays(events, step)).toEqual([{ day: "2026-10-26", entered: 3, converted: 1 }]);
});
test("daily helper is explicitly daily: one repeat visitor cannot stand in for distinct window users", () => {
  const events = [0, 86400000].flatMap(offset => [{ person: "same-person", route: "/cart", at: at + offset }, { person: "same-person", route: "/checkout", at: at + offset + 1000 }]);
  expect(funnelDays(events, step)).toEqual([{ day: "2026-10-26", entered: 1, converted: 1 }, { day: "2026-10-27", entered: 1, converted: 1 }]);
});
