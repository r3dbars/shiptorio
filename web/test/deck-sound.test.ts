import { expect, test } from "bun:test";
import { STOPS, type DeckView, type Stop } from "../src/deck2d/contract";
import { musicInputFor } from "../src/deck2d/sound/deckMusic";
import { tensionFor } from "../src/deck2d/sound/music";
import { cuesFor } from "../src/deck2d/juice/sounds";

const view = (over: Partial<Record<string, Partial<Stop>>>, jam: DeckView["jam"] = null): DeckView => ({
  stops: STOPS.map((id) => ({ id, built: true, state: "idle", automated: false, items: [], ...over[id] })),
  jam, card: null, shippy: { at: "repo", pose: "folded" } as DeckView["shippy"], shipped: 0, caption: null,
});
const crates = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, title: "x", look: "plain" as const }));

test("an empty deck is quiet music", () => {
  const i = musicInputFor(view({}), null, 0);
  expect(i.moving).toBe(0);
  expect(i.bottleneck).toBeNull();
});

test("a moving line counts its crates and busy machines, and ignores stations not built yet", () => {
  const i = musicInputFor(view({ builder: { state: "working", items: crates(2) }, gate: { built: false, items: crates(3) } }), null, 0);
  expect(i.moving).toBe(2);
  expect(i.working).toBe(1);
  expect(i.stationsBusy).toBe(1);
});

test("one crate waiting at the jam stays calm; a real pile-up tips into the pressure track", () => {
  const one = musicInputFor(view({ review: { state: "jammed", items: crates(1) } }, "review"), 0, 1000);
  expect(tensionFor(one, null)).toBeLessThan(0.5);
  const pile = musicInputFor(view({ review: { state: "jammed", items: crates(5) } }, "review"), 0, 1000);
  expect(tensionFor(pile, null)).toBeGreaterThanOrEqual(0.5);
});

test("your swipes and the big moments each have a sound", () => {
  expect(cuesFor({ type: "approve", cardId: "a" })).toEqual([{ sfx: "card_go", at: 0 }]);
  expect(cuesFor({ type: "later", cardId: "a" })).toEqual([{ sfx: "card_later", at: 0 }]);
  expect(cuesFor({ type: "launch" })[0]).toMatchObject({ sfx: "launch" });
  expect(cuesFor({ type: "automated", stop: "review" })[0]).toMatchObject({ sfx: "permit_grant" });
});
