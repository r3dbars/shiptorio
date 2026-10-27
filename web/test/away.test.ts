import { describe, expect, test } from "bun:test";
import type { FactoryState, Item, Move } from "@shiptorio/shared";
import { AWAY_MS, awaySince, launchWaiting, parseAway, shippedShown, whileAway } from "../src/ui/away";
import { AWAY } from "../src/copy";

const NOW = 1_800_000_000_000;
const H = 3600_000;

const shipped = (n: number, hoursAgo: number): Item =>
  ({ id: `pr-${n}`, kind: "bug", source: "github_issue", title: `PR ${n}`, district: "web", state: "launched", prNumber: n, attempts: 1, updatedAt: NOW, orbit: { since: NOW - hoursAgo * H, until: NOW + H, state: "clear" } }) as Item;
const onPad = (n: number): Item => ({ id: `pr-${n}`, kind: "bug", source: "github_issue", title: `PR ${n}`, district: "web", state: "on_pad", prNumber: n, attempts: 1, updatedAt: NOW }) as Item;
const launchCard = (itemId: string): Move =>
  ({ id: `move-${itemId}`, title: "Bottleneck: launch pad", why: "", stage: "pad", kind: "ship", itemId, createdAt: NOW, options: [{ id: "launch", label: "Launch", recommended: true, actions: [{ tool: "request_merge", args: {}, reason: "" }] }] }) as Move;
const state = (items: Item[], deck: Move[] = []): FactoryState => ({ items, deck, move: deck[0] ?? null }) as unknown as FactoryState;

describe("parseAway", () => {
  test("hours by default, minutes and days with a suffix", () => {
    expect(parseAway("12")).toBe(12 * H);
    expect(parseAway("90m")).toBe(90 * 60_000);
    expect(parseAway("2d")).toBe(48 * H);
    expect(parseAway("0.5")).toBe(H / 2);
  });
  test("zero, junk or nothing is no comeback", () => {
    for (const v of ["0", "", "soon", "-3", null]) expect(parseAway(v)).toBeNull();
  });
});

describe("awaySince", () => {
  test("a gap of six hours or more counts as coming back", () => {
    expect(awaySince("", NOW - AWAY_MS, NOW)).toBe(NOW - AWAY_MS);
    expect(awaySince("", NOW - AWAY_MS + 1, NOW)).toBeNull();
  });
  test("a first visit is not a comeback", () => {
    expect(awaySince("", null, NOW)).toBeNull();
  });
  test("?away= overrides the stored visit, short gaps included", () => {
    expect(awaySince("?away=12", NOW - 60_000, NOW)).toBe(NOW - 12 * H);
    expect(awaySince("?source=sim&away=30m", null, NOW)).toBe(NOW - 30 * 60_000);
    expect(awaySince("?away=0", NOW - 48 * H, NOW)).toBeNull();
  });
});

describe("whileAway", () => {
  test("only launches inside the gap count, oldest first", () => {
    const s = state([shipped(1, 30), shipped(3, 2), shipped(2, 9), onPad(4)]);
    expect(whileAway(s, NOW - 12 * H, NOW).shipped.map((i) => i.prNumber)).toEqual([2, 3]);
  });
  test("nothing shipped: nothing to show", () => {
    expect(whileAway(state([shipped(1, 30)]), NOW - 12 * H, NOW).shipped).toEqual([]);
  });
  test("a launch card counts only while its PR really waits on the pad", () => {
    expect(launchWaiting(state([onPad(143)], [launchCard("pr-143")]))?.itemId).toBe("pr-143");
    expect(launchWaiting(state([shipped(143, 1)], [launchCard("pr-143")]))).toBeNull();
    const other = { ...launchCard("pr-143"), options: [{ id: "go", label: "Go", recommended: true, actions: [{ tool: "start_job", args: {}, reason: "" }] }] } as Move;
    expect(launchWaiting(state([onPad(143)], [other]))).toBeNull();
  });
});

describe("shippedShown", () => {
  test("starts where it stood when you left and ticks to the real total", () => {
    expect([0, 1, 2, 3, 4].map((landed) => shippedShown(12, 4, 4, landed))).toEqual([8, 9, 10, 11, 12]);
  });
  test("more shipped than the replay flies: each rocket carries its share", () => {
    expect(shippedShown(30, 12, 6, 0)).toBe(18);
    expect(shippedShown(30, 12, 6, 3)).toBe(24);
    expect(shippedShown(30, 12, 6, 6)).toBe(30);
  });
  test("nothing flew: the real number", () => {
    expect(shippedShown(7, 3, 0, 0)).toBe(7);
  });
});

test("the line says what really shipped", () => {
  expect(AWAY.line(3)).toBe("3 shipped while you were away");
});
