import { describe, expect, it } from "bun:test";
import { canSetPriority, lineOrder, priorityChoices, WebToServer, withPriority, type Item } from "../src/index";

const item = (id: string, over: Partial<Item> = {}) => ({ id, state: "queued" as Item["state"], ...over });

describe("Rush and Park", () => {
  it("puts rushed work first and leaves parked work out of the line", () => {
    const order = lineOrder([item("a"), item("b", { priority: "park" }), item("c", { priority: "rush" }), item("d"), item("e", { priority: "rush" })]);
    expect(order.map((i) => i.id)).toEqual(["c", "e", "a", "d"]);
  });
  it("offers Rush and Park only while the item waits; Unpark always", () => {
    expect(priorityChoices(item("a"))).toEqual(["rush", "park"]);
    expect(priorityChoices(item("a", { priority: "rush" }))).toEqual(["park"]);
    expect(priorityChoices(item("a", { state: "working" }))).toEqual([]);
    expect(priorityChoices(item("a", { state: "on_pad", priority: "park" }))).toEqual(["none"]);
  });
  it("ignores choices that change nothing or come too late", () => {
    expect(canSetPriority(item("a"), "rush")).toBe(true);
    expect(canSetPriority(item("a", { priority: "rush" }), "rush")).toBe(false);
    expect(canSetPriority(item("a", { state: "inspecting" }), "park")).toBe(false);
    expect(canSetPriority(item("a"), "none")).toBe(false);
    expect(canSetPriority(item("a", { state: "working", priority: "park" }), "none")).toBe(true);
  });
  it("applies and clears the choice", () => {
    expect(withPriority(item("a"), "park").priority).toBe("park");
    expect("priority" in withPriority(item("a", { priority: "park" }), "none")).toBe(false);
  });
  it("is a bounded wire message", () => {
    expect(WebToServer.safeParse({ type: "set_priority", itemId: "gh-1", priority: "rush" }).success).toBe(true);
    expect(WebToServer.safeParse({ type: "set_priority", itemId: "gh-1", priority: "top" }).success).toBe(false);
    expect(WebToServer.safeParse({ type: "set_priority", itemId: "x".repeat(81), priority: "park" }).success).toBe(false);
  });
});
