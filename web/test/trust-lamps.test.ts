import { expect, test } from "bun:test";
import type { FactoryState } from "@shiptorio/shared";

import { TrustLamps, trustLamps } from "../src/map/shaft/trust";

test("trust lights small lamps in levels of five; a full level lights its brass lamp", () => {
  expect(trustLamps(0)).toEqual({ lit: 0, levels: 0 });
  expect(trustLamps(0.2)).toEqual({ lit: 4, levels: 0 });
  expect(trustLamps(0.5)).toEqual({ lit: 10, levels: 2 });
  expect(trustLamps(1)).toEqual({ lit: 20, levels: 4 });
  expect(trustLamps(7)).toEqual({ lit: 20, levels: 4 }); // never past the top
});

test("the tower repaints only when the lit count changes", () => {
  const t = new TrustLamps();
  const lit = () => t.group.children.filter((m) => ((m as unknown as { material: { color: { getHex(): number } } }).material.color.getHex() === 0xffb020)).length;
  t.sync({ trust: 0.3 } as FactoryState);
  expect(lit()).toBe(6);
  t.sync({ trust: 0.31 } as FactoryState);
  expect(lit()).toBe(6);
  t.sync({ trust: 0.6 } as FactoryState);
  expect(lit()).toBe(12);
  t.dispose();
});
