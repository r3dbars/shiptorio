import { describe, expect, test } from "bun:test";
import type { FactoryState, Item } from "../src/model";
import { answered, emptyProgress, levelOf, liveStreak, observe, parseProgress, summary, XP, xpForLevel } from "../src/progression";

const DAY = 86_400_000;
const t0 = new Date(2026, 9, 26, 9).getTime(); // a local morning
const state = (rockets: number, extra: Partial<FactoryState> = {}) =>
  ({ items: [], science: { red: rockets, green: 0, grey: 0, blue: 0 }, metrics: { rockets }, deck: [], ...extra }) as unknown as FactoryState;
const launched = (id: string, more: Partial<Item> = {}) => ({ id, state: "launched", ...more }) as Item;

describe("progression", () => {
  test("levels need 50 more XP each", () => {
    expect([1, 2, 3, 4].map(xpForLevel)).toEqual([0, 50, 150, 300]);
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(149).level).toBe(2);
    expect(levelOf(150)).toMatchObject({ level: 3, title: "Engineer", have: 0, need: 150 });
  });

  test("first look at a repo is a baseline, no back pay", () => {
    const s = observe(emptyProgress(), "a/b", state(12, { items: [launched("x")] }), t0);
    expect(s.progress.xp).toBe(0);
    expect(s.progress.seen["a/b"].rockets).toBe(12);
    expect(s.progress.streak).toBe(0);
  });

  test("a ship pays ship + clean + the first-move-of-the-day bonus, once", () => {
    let p = observe(emptyProgress(), "a/b", state(0), t0).progress;
    const s = observe(p, "a/b", state(1, { items: [launched("x")] }), t0 + 1000);
    expect(s.gains.map((g) => g.reason).sort()).toEqual(["clean", "ship", "streakDay"]);
    expect(s.progress.xp).toBe(XP.ship + XP.clean + XP.streakDay);
    expect(s.progress.streak).toBe(1);
    p = s.progress;
    expect(observe(p, "a/b", state(1, { items: [launched("x")] }), t0 + 2000).progress.xp).toBe(p.xp);
  });

  test("a scarred ship skips the clean bonus; orbit and permits pay extra", () => {
    let p = observe(emptyProgress(), "a/b", state(0), t0).progress;
    p = observe(p, "a/b", state(1, { items: [launched("x", { scars: [{} as never] })] }), t0).progress;
    expect(p.xp).toBe(XP.ship + XP.streakDay);
    const s = observe(p, "a/b", state(2, { items: [launched("x", { orbit: { state: "clear" } as never })], autonomy: { automated: 0.5, launches: 2 } as never }), t0);
    expect(s.gains.map((g) => g.reason).sort()).toEqual(["automated", "orbit", "ship"]);
  });

  test("a sim restart moves the baseline down without paying", () => {
    let p = observe(emptyProgress(), "sim", state(5), t0).progress;
    p = observe(p, "sim", state(0), t0).progress;
    expect(p.xp).toBe(0);
    expect(observe(p, "sim", state(1), t0).progress.xp).toBe(XP.ship + XP.streakDay);
  });

  test("streak grows day to day, breaks on a gap, and unlocks the glass lake at 3", () => {
    let p = emptyProgress();
    for (let d = 0; d < 3; d++) p = answered(p, t0 + d * DAY, 3).progress;
    expect(p.streak).toBe(3);
    expect(p.unlocked).toContain("glass-lake");
    expect(p.equip["glass-lake"]).toBe(true);
    expect(liveStreak(p, t0 + 3 * DAY)).toBe(3);
    expect(liveStreak(p, t0 + 4 * DAY)).toBe(0);
    p = answered(p, t0 + 5 * DAY, 3).progress;
    expect(p.streak).toBe(1);
    expect(p.best).toBe(3);
  });

  test("the shield covers one missed day after a 7-day run", () => {
    let p = emptyProgress();
    for (let d = 0; d < 7; d++) p = answered(p, t0 + d * DAY, 1).progress;
    expect(p.unlocked).toContain("freeze");
    expect(p.freezes).toBe(1);
    expect(liveStreak(p, t0 + 8 * DAY)).toBe(7);
    p = answered(p, t0 + 8 * DAY, 1).progress; // skipped day 7
    expect(p.streak).toBe(8);
    expect(p.freezes).toBe(0);
  });

  test("clearing the deck pays a bonus; the summary shows the deck shrinking", () => {
    let p = emptyProgress();
    p = answered(p, t0, 10).progress; // walked in to 11 cards
    const s = answered(p, t0 + 3 * DAY, 0); // walked in to 1
    expect(s.gains.some((g) => g.reason === "deckCleared")).toBe(true);
    const sum = summary(s.progress, t0 + 3 * DAY);
    expect(sum.trend.map((d) => d.deck)).toEqual([11, 1]);
    expect(sum.shrink).toBe(10);
    expect(sum.today.cards).toBe(1);
  });

  test("broken storage starts fresh", () => {
    expect(parseProgress("{nope").xp).toBe(0);
    expect(parseProgress(JSON.stringify({ v: 0 })).xp).toBe(0);
  });
});
