import { describe, expect, test } from "bun:test";
import { ACHIEVEMENTS, board, check, cleanRun, emptyEarned, markDay, mergeEarned, parseEarned, verifyCatches, type Earned } from "../src/achievements";
import type { FactoryState, Item } from "../src/model";

const T0 = new Date(2026, 9, 26, 12).getTime();
const DAY = 86_400_000;

function factory(over: Partial<FactoryState> = {}): FactoryState {
  return { repo: "r3dbars/testing", baseBranch: "main", districts: [], machines: [], belts: [], items: [], power: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0, ...over };
}
let n = 0;
function launched(over: Partial<Item> = {}): Item {
  n++;
  return { id: `i${n}`, kind: "bug", source: "github_issue", title: `fix ${n}`, district: "web", state: "launched", attempts: 0, updatedAt: T0 + n, orbit: { since: T0 + n, until: T0 + n + DAY, state: "watching" }, ...over };
}
const scar = { station: "verify" as const, reason: "still crashes", strike: 1 };
const ids = (s: FactoryState, e: Earned = emptyEarned(), streak = 0) => check(e, "r3dbars/testing", s, T0, streak).fresh.map((a) => a.id);

describe("each achievement unlocks on its real outcome", () => {
  test("nothing for an empty factory", () => {
    expect(ids(factory())).toEqual([]);
  });

  test("first rocket: a merged PR", () => {
    expect(ids(factory({ metrics: { rockets: 1, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 1 } }))).toEqual(["first-rocket"]);
    expect(ids(factory({ science: { red: 1, green: 0, grey: 0, blue: 0 } }))).toEqual(["first-rocket"]); // the sim counts science instead
  });

  test("ten rockets", () => {
    expect(ids(factory({ science: { red: 9, green: 0, grey: 0, blue: 0 } }))).not.toContain("ten-rockets");
    expect(ids(factory({ science: { red: 6, green: 4, grey: 0, blue: 0 } }))).toContain("ten-rockets");
  });

  test("first research: a check on the line", () => {
    expect(ids(factory({ research: { done: [], spent: 0 } }))).toEqual([]);
    expect(ids(factory({ research: { done: ["leftovers"], spent: 2 } }))).toEqual(["first-research"]);
  });

  test("first Sentry mine and first PostHog mine, only once connected", () => {
    const src = (kind: "sentry" | "posthog", state: "connected" | "missing") => ({ kind, state, detail: "", eventsToday: 0, setup: { steps: [] } });
    expect(ids(factory({ sources: [src("sentry", "missing"), src("posthog", "missing")] }))).toEqual([]);
    expect(ids(factory({ sources: [src("sentry", "connected")] }))).toEqual(["first-mine-sentry"]);
    expect(ids(factory({ sources: [src("posthog", "connected")] }))).toEqual(["first-mine-posthog"]);
  });

  test("caught before prod: the verify bay stopped a bad fix", () => {
    const station = (caught: number, kind: "verify" | "ci" = "verify") => ({ id: "v", kind, name: "Verify bay", wip: 0, caughtThisWeek: caught, actions: [] });
    expect(ids(factory({ stations: [station(3, "ci")] }))).toEqual([]); // CI catching isn't the verify bay
    expect(ids(factory({ stations: [station(1)] }))).toEqual(["caught-before-prod"]);
    expect(ids(factory({ items: [{ ...launched(), state: "working", scars: [scar] }] }))).toEqual(["caught-before-prod"]);
    expect(verifyCatches(factory({ stations: [station(2)], items: [{ ...launched(), state: "working", scars: [scar] }] }))).toBe(2);
  });

  test("back on the belt: a reworked PR shipped", () => {
    const got = ids(factory({ items: [launched({ scars: [{ station: "ci", reason: "tests", strike: 1 }] })] }));
    expect(got).toContain("second-try");
    expect(ids(factory({ items: [{ ...launched(), state: "rejected", scars: [{ station: "ci", reason: "tests", strike: 1 }] }] }))).not.toContain("second-try");
  });

  test("first permit: a lane can launch on its own", () => {
    const autonomy = (permit: boolean) => ({ level: "build" as const, districts: [{ district: "docs", score: 1, risk: "low" as const, permit }], next: null, ranAlone: 0 });
    expect(ids(factory({ autonomy: autonomy(false) }))).toEqual([]);
    expect(ids(factory({ autonomy: autonomy(true) }))).toEqual(["first-permit"]);
  });

  test("first auto-launch: a rocket nobody tapped", () => {
    const autonomy = (automated: number, launches: number) => ({ level: "build" as const, districts: [], next: null, ranAlone: 0, automated, launches });
    expect(ids(factory({ autonomy: autonomy(0, 4) }))).toEqual([]);
    expect(ids(factory({ autonomy: autonomy(0.25, 4) }))).toEqual(["first-auto"]);
  });

  test("orbit all clear: a launch held its whole watch", () => {
    const i = launched();
    expect(ids(factory({ items: [i] }))).not.toContain("orbit-clear");
    expect(ids(factory({ items: [{ ...i, orbit: { ...i.orbit!, state: "clear" } }] }))).toContain("orbit-clear");
    expect(ids(factory({ items: [{ ...i, orbit: { ...i.orbit!, state: "regressed" } }] }))).not.toContain("orbit-clear");
  });

  test("biter down: a live error your fix killed", () => {
    expect(ids(factory({ metrics: { rockets: 0, bitersKilled: 1, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0 } }))).toEqual(["error-fixed"]);
  });

  test("ten clean in a row: one rework anywhere in the last ten breaks it", () => {
    const ten = Array.from({ length: 10 }, () => launched());
    expect(cleanRun(factory({ items: ten }))).toBe(10);
    expect(ids(factory({ items: ten }))).toContain("clean-10");
    const broken = [...ten.slice(0, 5), launched({ scars: [scar] }), ...Array.from({ length: 9 }, () => launched())];
    expect(cleanRun(factory({ items: broken }))).toBe(9);
    expect(ids(factory({ items: broken }))).not.toContain("clean-10");
    // items still in the line don't count either way
    expect(cleanRun(factory({ items: [...ten, { ...launched(), state: "rejected", scars: [scar] }] }))).toBe(10);
  });

  test("week on the line: progression's streak, or the record's own", () => {
    expect(ids(factory(), emptyEarned(), 6)).toEqual([]);
    expect(ids(factory(), emptyEarned(), 7)).toEqual(["streak-7"]);
    let e = emptyEarned();
    for (let d = 0; d < 7; d++) e = markDay(e, T0 + d * DAY);
    expect(e.best).toBe(7);
    expect(ids(factory(), e)).toEqual(["streak-7"]);
  });

  test("lights out", () => {
    expect(ids(factory({ autonomy: { level: "lights_out", districts: [], next: null, ranAlone: 0 } }))).toContain("lights-out");
  });

  test("every achievement has a test above", () => {
    expect(ACHIEVEMENTS.length).toBe(14);
  });
});

describe("the record", () => {
  test("each one unlocks once, with when and where", () => {
    const s = factory({ science: { red: 1, green: 0, grey: 0, blue: 0 } });
    const first = check(emptyEarned(), "r3dbars/testing", s, T0);
    expect(first.earned.got["first-rocket"]).toEqual({ at: T0, repo: "r3dbars/testing" });
    expect(check(first.earned, "r3dbars/testing", s, T0 + 5).fresh).toEqual([]);
    expect(check(first.earned, "r3dbars/other", s, T0 + 5).earned).toBe(first.earned); // same object, nothing to save
  });

  test("streak: days in a row, a gap starts over, the same day counts once", () => {
    let e = markDay(emptyEarned(), T0);
    e = markDay(e, T0 + 3600_000);
    expect(e.streak).toBe(1);
    e = markDay(e, T0 + DAY);
    expect(e.streak).toBe(2);
    e = markDay(e, T0 + 3 * DAY);
    expect([e.streak, e.best]).toEqual([1, 2]);
  });

  test("round-trips through storage and shrugs off junk", () => {
    const e = check(emptyEarned(), "r", factory({ science: { red: 1, green: 0, grey: 0, blue: 0 } }), T0).earned;
    expect(parseEarned(JSON.stringify(e))).toEqual(e);
    expect(parseEarned("{nope")).toEqual(emptyEarned());
    expect(parseEarned(JSON.stringify({ v: 2 }))).toEqual(emptyEarned());
    expect(parseEarned(JSON.stringify({ ...e, got: { ...e.got, "not-a-thing": { at: 1 } } })).got).toEqual(e.got);
    // everything earned still fits the account pref
    const all = { ...e, got: Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, { at: T0, repo: "some-long-owner-name/some-long-repo-name" }])) };
    expect(JSON.stringify(all).length).toBeLessThanOrEqual(2048);
  });

  test("merging two browsers keeps the earliest unlock and the best streak", () => {
    const a: Earned = { v: 1, got: { "first-rocket": { at: 5 } }, streak: 2, best: 2, last: "2026-10-25" };
    const b: Earned = { v: 1, got: { "first-rocket": { at: 3 }, "first-permit": { at: 9 } }, streak: 1, best: 4, last: "2026-10-26" };
    expect(mergeEarned(a, b)).toEqual({ v: 1, got: { "first-rocket": { at: 3 }, "first-permit": { at: 9 } }, streak: 1, best: 4, last: "2026-10-26" });
  });

  test("the board lists earned first, then the closest", () => {
    const e = check(emptyEarned(), "r", factory({ science: { red: 1, green: 0, grey: 0, blue: 0 } }), T0).earned;
    const rows = board(e, factory({ science: { red: 8, green: 0, grey: 0, blue: 0 } }));
    expect(rows[0].a.id).toBe("first-rocket");
    expect(rows[1].a.id).toBe("ten-rockets");
    expect(rows[1].have).toBe(8);
  });
});
