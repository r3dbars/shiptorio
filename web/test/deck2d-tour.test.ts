import { expect, test } from "bun:test";
import { STOPS, type StopId } from "../src/deck2d/contract";
import { STORY_CARD } from "../src/deck2d/story";
import { TOUR, createTour } from "../src/deck2d/story/tour";

const until = (t: ReturnType<typeof createTour>, cond: () => boolean, limit = 60) => {
  for (let s = 0; s < limit && !cond(); s += 0.1) t.step(0.1);
  expect(cond()).toBe(true);
};

test("the tour opens on Shippy and a small, empty deck: no rocket, no machine lit, no work card", () => {
  const t = createTour(), v = t.view();
  expect(v.card?.title).toBe(TOUR[0].title);
  expect(v.card?.shippy).toBe("wave");
  expect(v.stops.every((s) => !s.built && !s.items.length)).toBe(true);
  expect(v.deck).toMatchObject({ size: "small", island: "none", boiler: 0 });
  expect(v.attention).toEqual([]);
  expect(v.shot).toBe("shippy"); // tight on Shippy first
});

test("the story camera frames each station as it is named, the engine for the boiler beat, and the line at the end", () => {
  const t = createTour(), shots = new Set<string>();
  for (let i = 0; i < 3000 && t.phase() !== "end"; i++) {
    const v = t.view();
    if (v.shot) shots.add(v.shot);
    if (v.card) t.approve(v.card.id); else t.step(0.1);
  }
  for (const s of ["shippy", "repo", "planner", "builder", "checks", "review", "gate", "line", "boiler", "launch"]) expect(shots.has(s)).toBe(true);
  expect(t.view().city).toMatchObject({ zoom: "city", beat: "card" }); // the islands story ends on the whole city
});

test("Ship it is a held press; the rocket goes on camera, then a Shipped! card says what happened", () => {
  const t = createTour();
  for (let i = 0; i < 3000 && t.view().card?.yes !== "Hold to ship"; i++) { const c = t.view().card; if (c) t.approve(c.id); else t.step(0.1); }
  const ship = t.view().card!;
  expect(ship.hold).toBe(true);
  t.approve(ship.id);
  let shots = new Set<string | undefined>();
  for (let i = 0; i < 200 && !t.view().card; i++) { t.step(0.1); shots.add(t.view().shot); }
  expect([...shots]).toEqual(["launch"]);
  expect(t.view().shipped).toBe(1);
  expect(t.view().card?.title).toBe("Shipped!");
  expect(t.view().caption).toBeNull();
});

test("each answer builds one station, card hidden while it builds; then a fix ships and the tour hands off to sign-in", () => {
  const t = createTour();
  const order: StopId[] = [];
  let seen = new Set<StopId>(), shipped = 0;
  for (let i = 0; i < 3000 && t.phase() !== "end"; i++) {
    const c = t.view().card;
    if (!c) { t.step(0.1); } else t.approve(c.id);
    const v = t.view();
    const now = new Set(v.stops.filter((s) => s.built).map((s) => s.id));
    const added = [...now].filter((id) => !seen.has(id));
    expect(added.length).toBeLessThanOrEqual(1); // one thing moves at a time
    if (added.length && added[0] !== "launch") expect(v.card).toBeNull(); // no card over a build (launch lands as the island finishes)
    order.push(...added); seen = now; shipped = v.shipped;
  }
  expect(order).toEqual([...STOPS]);
  expect(shipped).toBe(1);
  expect(t.view().card?.id).toBe(STORY_CARD.connect);
  expect(t.view().deck?.boiler).toBe(1);
});

test("no Skip: the first card only goes forward, and Replay at the end starts over", () => {
  const t = createTour();
  expect(t.view().card?.no).toBeUndefined();
  t.later(t.view().card!.id);
  expect(t.view().card?.title).toBe(TOUR[0].title);
  for (let i = 0; i < 3000 && t.phase() !== "end"; i++) { const c = t.view().card; if (c) t.approve(c.id); else t.step(0.1); }
  t.later(STORY_CARD.connect);
  expect(t.view().card?.title).toBe(TOUR[0].title);
  until(t, () => true);
});

test("every card after the first has Back, and Back goes one card back with a fresh id", () => {
  const t = createTour();
  const titles: string[] = [];
  for (let i = 0; i < 3000 && t.phase() !== "end"; i++) {
    const c = t.view().card;
    if (!c) { t.step(0.1); continue; }
    if (titles.at(-1) !== c.title) {
      titles.push(c.title);
      if (titles.length > 1) {
        expect(c.no).toBe("Back");
        t.later(c.id);
        const back = t.view().card!;
        expect(back.title).toBe(titles.at(-2)!);
        expect(back.id).not.toBe(c.id);
        t.approve(back.id); // forward again (replays that card's step)
        continue;
      }
    }
    t.approve(c.id);
  }
  expect(titles).toEqual(TOUR.map((b) => b.title));
});

test("the fix rides the whole line from Repo to the Gate, and the camera goes with it", () => {
  const t = createTour();
  for (let i = 0; i < 3000 && !(t.view().card?.title === "Launch"); i++) { const c = t.view().card; if (c) t.approve(c.id); else t.step(0.1); }
  t.approve(t.view().card!.id);
  const seen: string[] = [];
  for (let i = 0; i < 400 && !t.view().card; i++) {
    const v = t.view(), at = v.stops.find((s) => s.items.length)?.id;
    if (at && seen.at(-1) !== at) { seen.push(at); expect(v.shot).toBe(at); t.arrive("tour-crate", at); }
    t.step(0.1);
  }
  expect(seen).toEqual(["repo", "planner", "builder", "checks", "review", "gate"]);
  expect(t.view().card?.hold).toBe(true);
});
