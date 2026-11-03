import { describe, expect, test } from "bun:test";
import type { FactoryState, Item, Move } from "@shiptorio/shared";
import { STOPS, type DeckView } from "../src/deck2d/contract";
import { AWAY_CARD, AWAY_MS, awaySince, createAway, parseAway } from "../src/deck2d/data/away";

const H = 3600_000, NOW = 100 * H;
const item = (id: string, over: Partial<Item>): Item => ({ id, title: `Fix ${id}`, state: "launched", updatedAt: NOW - H, ...over } as Item);
const state = (items: Item[], deck: Move[] = []): FactoryState => ({ items, deck } as unknown as FactoryState);
const base: DeckView = { stops: STOPS.map(id => ({ id, built: true, state: "idle", automated: false, items: [] })), jam: null,
  card: { id: "m1", title: "Ship PR27?", dots: null, line: "", stop: "gate" }, shippy: { pose: "inspect", at: "gate" }, shipped: 1, caption: null };
const memory = (at: number | null) => { let v = at; return { get: () => v, set: (n: number) => { v = n; }, read: () => v }; };

describe("while you were gone", () => {
  test("only a long enough gap counts, and ?away= fakes one", () => {
    expect(awaySince("", null, NOW)).toBeNull();
    expect(awaySince("", NOW - AWAY_MS + 1, NOW)).toBeNull();
    expect(awaySince("", NOW - 5 * H, NOW)).toBe(NOW - 5 * H);
    expect(awaySince("?away=90m", null, NOW)).toBe(NOW - 90 * 60_000);
    expect(parseAway("junk")).toBeNull();
  });

  test("one card says what shipped in the gap and what waits, then gets out of the way", () => {
    const s = state([item("a", { prNumber: 27 }), item("old", { updatedAt: NOW - 9 * H })], [{ id: "m1" } as Move]);
    const away = createAway({ scope: "r/x", search: "", state: () => s, now: () => NOW, store: memory(NOW - 5 * H) });
    const v = away.view(base);
    expect(v.card?.id).toBe(AWAY_CARD);
    expect(v.card?.title).toBe("While you were gone: PR27 shipped.");
    expect(v.card?.line).toBe("1 thing is waiting on you.");
    expect(v.card?.yes).toBe("Show me");
    expect(away.answer("m1")).toBe(false);
    expect(away.answer(AWAY_CARD)).toBe(true);
    expect(away.view(base).card?.id).toBe("m1");
  });

  test("counts several and says all clear when nothing waits", () => {
    const s = state([item("a", {}), item("b", {})]);
    const v = createAway({ scope: "r/x", search: "", state: () => s, now: () => NOW, store: memory(NOW - 5 * H) }).view({ ...base, card: null });
    expect(v.card?.title).toBe("While you were gone: 2 shipped.");
    expect(v.card?.line).toBe("Nothing is waiting on you. All clear.");
    expect(v.card?.yes).toBe("Got it");
  });

  test("no card on a short gap, with nothing to say, or before the factory loads; the visit is marked once loaded", () => {
    const store = memory(NOW - H);
    let s: FactoryState | null = null;
    const away = createAway({ scope: "r/x", search: "", state: () => s, now: () => NOW, store });
    expect(away.view(base)).toBe(base);
    expect(store.read()).toBe(NOW - H);
    s = state([item("a", {})], [{ id: "m1" } as Move]);
    expect(away.view(base).card?.id).toBe("m1");
    expect(store.read()).toBe(NOW);
    const quiet = createAway({ scope: "r/x", search: "", state: () => state([]), now: () => NOW, store: memory(NOW - 9 * H) });
    expect(quiet.view(base).card?.id).toBe("m1");
  });
});
