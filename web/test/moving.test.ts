import { describe, expect, test } from "bun:test";
import type { Item } from "@shiptorio/shared";
import { moving } from "../src/ui/moving";

const item = (id: string, state: Item["state"], updatedAt = 0) => ({ id, state, updatedAt, title: id }) as Item;

describe("see what's moving", () => {
  test("rides only work on the line (a PR on the pad waits on you, so it isn't moving), furthest along first", () => {
    const items = [item("ore", "ore"), item("q", "queued"), item("w1", "working", 1), item("w2", "working", 2), item("pad", "on_pad"), item("ship", "launched")];
    expect(moving(items).map((it) => it.id)).toEqual(["w2", "w1", "q"]);
  });

  test("starts on the work your last card said yes to", () => {
    const items = [item("q", "queued"), item("pad", "on_pad"), item("w", "working")];
    expect(moving(items, "q").map((it) => it.id)).toEqual(["q", "w"]);
    expect(moving(items, "gone").map((it) => it.id)).toEqual(["w", "q"]);
  });

  test("nothing in flight is an empty tour", () => {
    expect(moving(undefined)).toEqual([]);
    expect(moving([item("ore", "ore")])).toEqual([]);
  });
});
