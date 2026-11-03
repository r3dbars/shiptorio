import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CITY_COPY, CITY_ISLANDS, CITY_TIMING, STOPS, type CityIsland, type CityView, type DeckView } from "../src/deck2d/contract";
import { STORY_CARD, createStory, type Story, type StoryOptions } from "../src/deck2d/story";
import { REVEAL_SECONDS, revealAt } from "../src/deck2d/story/reveal";

// The city reveal is the full story's ending (web/src/deck2d/city/SPEC.md section 1): after the hero rocket, six beats,
// then the sign-in card. revealAt is the pure timeline; the story owns the clock and hands it to the engine as
// DeckView.city and DeckView.caption. These tests pin the numbers from the SPEC table (not the code's own sums), then
// step the story one sim tick at a time and check the wiring.

const DT = 0.05; // the story's own sub-step, so every step() below is exactly one tick
const REPO = CITY_COPY.repo;
/** Consecutive duplicates collapsed: the order things showed up in. */
const order = <T,>(xs: T[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
const lit = (...on: CityIsland[]) => Object.fromEntries(CITY_ISLANDS.map((id) => [id, on.includes(id) ? 1 : 0])) as Record<CityIsland, number>;
const plated = (...on: CityIsland[]) => Object.fromEntries(CITY_ISLANDS.map((id) => [id, on.includes(id)])) as Record<CityIsland, boolean>;
// SPEC section 1: island i (0 errors .. 4 marketing) takes 3.2 s (0.6 s of camera, 2.6 s of light) starting at 7.9 + 3.2 i
const LIGHT = 2.6; // CITY_TIMING.light, written out here so a change to the contract is a visible change to this file
const T_ISLAND = (i: number) => 7.9 + 3.2 * i;
// Reduced motion shows the same captions in the same order: the island ones are cuts, each held 3.0 s with the island dark
const EXPECTED_CAPTIONS = [CITY_COPY.line, CITY_COPY.city, ...CITY_ISLANDS.map((id) => CITY_COPY.island[id]), CITY_COPY.grow, CITY_COPY.dim];
const T_REDUCED_ISLAND = (i: number) => 6.7 + 3.0 * i;

/** revealAt sampled every 10 ms. */
function sweep(reduced: boolean, to = 31) {
  const rows: { t: number; r: ReturnType<typeof revealAt> }[] = [];
  for (let k = 0; k <= Math.round(to * 100); k++) rows.push({ t: k / 100, r: revealAt(k / 100, reduced, REPO) });
  return rows;
}
const firstAt = (rows: ReturnType<typeof sweep>, hit: (r: ReturnType<typeof revealAt>) => boolean) => rows.find(({ r }) => hit(r))?.t;

describe("the timeline numbers (SPEC section 1) are what the contract says", () => {
  test("CITY_TIMING pins the reveal clock", () => {
    expect(CITY_TIMING).toMatchObject({ rocket: 4.0, move: 0.6, line: 1.2, city: 1.5, light: 2.6, lit: 0.84, capsule: 1.94, grow: 2.5, dimGap: 0.15, dark: 1.5, reducedIsland: 3.0 });
  });

  test("REVEAL_SECONDS: 29.1 s of motion, 25.7 s reduced", () => {
    expect(REVEAL_SECONDS).toEqual({ normal: 29.1, reduced: 25.7 });
    const T = CITY_TIMING, n = CITY_ISLANDS.length;
    expect(REVEAL_SECONDS.normal).toBeCloseTo(T.rocket + T.move + T.line + T.move + T.city + n * (T.move + T.light) + T.move + T.grow + (n - 1) * T.dimGap + T.dark, 9);
    expect(REVEAL_SECONDS.reduced).toBeCloseTo(T.rocket + T.line + T.city + n * T.reducedIsland + T.grow + T.dark, 9);
  });

  test("an island's caption is up for a whole turn, 3.2 s, so nobody has to read faster than 21 characters a second", () => {
    expect(CITY_TIMING.move + CITY_TIMING.light).toBeCloseTo(3.2, 9);
    expect(CITY_TIMING.capsule).toBeGreaterThan(CITY_TIMING.lit + (CITY_TIMING.arcDots - 1) * CITY_TIMING.arcDot); // the capsule sits down after the last arc dot
    expect(CITY_TIMING.capsule).toBeLessThan(CITY_TIMING.light); // and inside the light step, before the next island's turn
    for (const id of CITY_ISLANDS) expect(CITY_COPY.island[id].length / (CITY_TIMING.move + CITY_TIMING.light), id).toBeLessThanOrEqual(21);
  });
});

describe("revealAt, normal motion", () => {
  test("beat 0 leaves the station zoom and the caption alone", () => {
    for (const t of [0, 1, 3.99, 3.9999]) {
      const r = revealAt(t, false, REPO);
      expect(r.city).toBeUndefined();
      expect(r.caption).toBeUndefined();
      expect(r.done).toBe(false);
    }
  });

  test("beats 1 and 2: the whole line at 4.0, the city at 5.8, every island dark and plateless", () => {
    for (const t of [4.0, 4.5, 5.79]) {
      expect(revealAt(t, false, REPO)).toEqual({ city: { zoom: "line", beat: "line", lit: lit(), plates: plated(), focus: null, label: REPO }, caption: CITY_COPY.line, done: false });
    }
    for (const t of [5.8, 6.4, 7.89]) {
      expect(revealAt(t, false, REPO)).toEqual({ city: { zoom: "city", beat: "city", lit: lit(), plates: plated(), focus: null, label: REPO }, caption: CITY_COPY.city, done: false });
    }
  });

  test("the line's label is whatever the caller says (the repo's name live, 'your repo' in the story)", () => {
    expect(REPO).toBe("your repo");
    expect(revealAt(4.0, false, "acme/widgets").city?.label).toBe("acme/widgets");
    expect(revealAt(30, false, "acme/widgets").city?.label).toBe("acme/widgets");
  });

  CITY_ISLANDS.forEach((island, i) => {
    test(`beat 3, island ${i + 1} of 5 (${island}): camera 0.6 s, light 2.6 s, its lines from 0.6 s in (the camera has arrived)`, () => {
      const T = T_ISLAND(i), before = CITY_ISLANDS.slice(0, i), after = CITY_ISLANDS.slice(i + 1);
      const previous = i === 0 ? CITY_COPY.city : CITY_COPY.island[CITY_ISLANDS[i - 1]];
      const at = (u: number) => revealAt(T + u, false, REPO);
      const check = (u: number, progress: number, caption: string) => {
        const { city, caption: said, done } = at(u);
        expect(city?.beat).toBe("islands");
        expect(city?.zoom).toBe("city");
        expect(city?.focus).toBe(island);
        expect(city?.lit[island]).toBeCloseTo(progress, 9);
        for (const id of before) expect(city?.lit[id]).toBe(1);
        for (const id of after) expect(city?.lit[id]).toBe(0);
        expect(city?.plates).toEqual(plated());
        expect(said).toBe(caption);
        expect(done).toBe(false);
      };
      check(0, 0, previous); // the camera starts its move
      check(0.59, 0, previous);
      check(0.6, 0, CITY_COPY.island[island]); // the move is done, the light step begins, the caption switches
      check(1.0, 0.4 / LIGHT, CITY_COPY.island[island]);
      check(1.43, 0.83 / LIGHT, CITY_COPY.island[island]);
      check(1.44, 0.84 / LIGHT, CITY_COPY.island[island]); // s = 0.84: lit, lamp and halo on
      check(2.5, 1.9 / LIGHT, CITY_COPY.island[island]);
      check(3.19, 2.59 / LIGHT, CITY_COPY.island[island]); // the last moment of its turn: the caption has been up for 2.6 s
    });
  });

  test("beat 3 ends with the camera heading back to the ring: everything lit, no focus, the Marketing line stays", () => {
    for (const t of [23.9, 24.2, 24.49]) {
      expect(revealAt(t, false, REPO)).toEqual({ city: { zoom: "city", beat: "islands", lit: lit(...CITY_ISLANDS), plates: plated(), focus: null, label: REPO }, caption: CITY_COPY.island.marketing, done: false });
    }
  });

  test("beat 4: all lit, 'The factory must grow.' for 2.5 s", () => {
    for (const t of [24.5, 25.5, 26.99]) {
      expect(revealAt(t, false, REPO)).toEqual({ city: { zoom: "city", beat: "grow", lit: lit(...CITY_ISLANDS), plates: plated(), focus: null, label: REPO }, caption: CITY_COPY.grow, done: false });
    }
  });

  test("beat 5: Marketing, Customers, Inbox, Traffic, Errors step to dark 150 ms apart, a plate with each", () => {
    const dim = (t: number) => revealAt(t, false, REPO);
    const steps: [number, CityIsland[]][] = [
      [27.0, ["marketing"]], [27.14, ["marketing"]],
      [27.15, ["marketing", "customers"]], [27.29, ["marketing", "customers"]],
      [27.3, ["marketing", "customers", "inbox"]], [27.45, ["marketing", "customers", "inbox", "traffic"]],
      [27.6, [...CITY_ISLANDS]], [29.09, [...CITY_ISLANDS]],
    ];
    for (const [t, dark] of steps) {
      const { city, caption, done } = dim(t);
      expect(city?.beat).toBe("dim");
      expect(city?.focus).toBeNull();
      expect(city?.lit).toEqual(lit(...CITY_ISLANDS.filter((id) => !dark.includes(id))));
      expect(city?.plates).toEqual(plated(...dark));
      expect(caption).toBe(CITY_COPY.dim);
      expect(done).toBe(false);
    }
  });

  test("beat 6: at 29.1 s the card takes over, every island dark with its plate, no caption, done", () => {
    for (const t of [29.1, 35, 1e6]) {
      expect(revealAt(t, false, REPO)).toEqual({ city: { zoom: "city", beat: "card", lit: lit(), plates: plated(...CITY_ISLANDS), focus: null, label: REPO }, caption: null, done: true });
    }
  });

  test("a bad clock is just beat 0, and every call returns fresh objects", () => {
    for (const t of [-1, Number.NaN, -Infinity]) expect(revealAt(t, false, REPO)).toEqual({ caption: undefined, done: false });
    const a = revealAt(20, false, REPO), b = revealAt(20, false, REPO);
    a.city!.lit.errors = 0; a.city!.plates.errors = true;
    expect(b.city!.lit.errors).toBe(1);
    expect(b.city!.plates.errors).toBe(false);
    expect(revealAt(20, false, REPO).city!.lit.errors).toBe(1);
  });

  test("swept every 10 ms: beats in order, captions in order, one thing moves at a time, dim is a step not a fade", () => {
    const rows = sweep(false);
    expect(order(rows.map(({ r }) => r.city?.beat))).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
    expect(order(rows.map(({ r }) => r.caption).filter((c): c is string | null => c !== undefined))).toEqual([...EXPECTED_CAPTIONS, null]);
    expect(rows.map(({ r }) => r.done)).toEqual(rows.map(({ t }) => t >= 29.1 - 1e-9));
    expect(firstAt(rows, (r) => r.city?.beat === "line")).toBe(4);
    expect(firstAt(rows, (r) => r.city?.beat === "city")).toBe(5.8);
    expect(firstAt(rows, (r) => r.city?.beat === "islands")).toBe(7.9);
    expect(firstAt(rows, (r) => r.city?.beat === "grow")).toBe(24.5);
    expect(firstAt(rows, (r) => r.city?.beat === "dim")).toBe(27);
    expect(firstAt(rows, (r) => r.city?.beat === "card")).toBe(29.1);

    let prev: CityView | undefined;
    for (const { r } of rows) {
      const city = r.city;
      if (!city) continue;
      const values = CITY_ISLANDS.map((id) => city.lit[id]);
      expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(values.filter((v) => v > 0 && v < 1).length).toBeLessThanOrEqual(1); // only one island is mid-light, ever
      expect(city.focus === null || city.beat === "islands").toBe(true); // the camera only leaves the ring for beat 3
      if (city.beat !== "islands") expect(values.every((v) => v === 0 || v === 1)).toBe(true); // no partial light outside beat 3
      for (const id of CITY_ISLANDS) if (city.plates[id]) expect(city.lit[id]).toBe(0); // a plate only goes on a dark island
      if (prev) {
        for (const id of CITY_ISLANDS) {
          if (prev.beat === "dim" || city.beat === "dim" || city.beat === "card") continue;
          expect(city.lit[id]).toBeGreaterThanOrEqual(prev.lit[id]); // lights only come on until beat 5
        }
        for (const id of CITY_ISLANDS) if (prev.plates[id]) expect(city.plates[id]).toBe(true); // plates never come off
      }
      prev = city;
    }
  });

  test("islands light in reveal order 3.2 s apart and dim in reverse 150 ms apart", () => {
    const rows = sweep(false);
    const litAt = CITY_ISLANDS.map((id) => firstAt(rows, (r) => (r.city?.lit[id] ?? 0) > 0)!);
    litAt.forEach((t, i) => expect(t).toBeCloseTo(T_ISLAND(i) + 0.6 + 0.01, 1)); // light starts the moment the camera move ends
    const fullAt = CITY_ISLANDS.map((id) => firstAt(rows, (r) => r.city?.lit[id] === 1)!);
    fullAt.forEach((t, i) => expect(t).toBeCloseTo(T_ISLAND(i) + 3.2, 1));
    const darkAt = [...CITY_ISLANDS].reverse().map((id) => firstAt(rows, (r) => r.city?.beat === "dim" && r.city.lit[id] === 0)!);
    expect(darkAt.map((t) => Math.round(t * 100) / 100)).toEqual([27, 27.15, 27.3, 27.45, 27.6]);
  });
});

describe("revealAt, reduced motion", () => {
  test("cuts: line at 4.0, city 5.2, the five island captions 6.7 to 21.7, all five lit in one frame at 21.7, all dim with plates in one frame at 24.2, card at 25.7", () => {
    expect(revealAt(3.99, true, REPO).city).toBeUndefined();
    expect(revealAt(3.99, true, REPO).caption).toBeUndefined();
    const row = (t: number) => revealAt(t, true, REPO);
    expect(row(4.0)).toEqual({ city: { zoom: "line", beat: "line", lit: lit(), plates: plated(), focus: null, label: REPO }, caption: CITY_COPY.line, done: false });
    expect(row(5.19).city?.beat).toBe("line");
    expect(row(5.2)).toEqual({ city: { zoom: "city", beat: "city", lit: lit(), plates: plated(), focus: null, label: REPO }, caption: CITY_COPY.city, done: false });
    expect(row(6.69).city?.beat).toBe("city");
    expect(row(6.69).caption).toBe(CITY_COPY.city);
    expect(row(21.69).city?.beat).toBe("islands");
    expect(row(21.7)).toEqual({ city: { zoom: "city", beat: "grow", lit: lit(...CITY_ISLANDS), plates: plated(), focus: null, label: REPO }, caption: CITY_COPY.grow, done: false });
    expect(row(24.19).city?.beat).toBe("grow");
    expect(row(24.2)).toEqual({ city: { zoom: "city", beat: "dim", lit: lit(), plates: plated(...CITY_ISLANDS), focus: null, label: REPO }, caption: CITY_COPY.dim, done: false });
    expect(row(25.69).done).toBe(false);
    expect(row(25.7)).toEqual({ city: { zoom: "city", beat: "card", lit: lit(), plates: plated(...CITY_ISLANDS), focus: null, label: REPO }, caption: null, done: true });
  });

  CITY_ISLANDS.forEach((island, i) => {
    test(`the caption cut for island ${i + 1} of 5 (${island}): 3.0 s from ${T_REDUCED_ISLAND(i).toFixed(1)}, the island framed and still dark, no plate`, () => {
      const T = T_REDUCED_ISLAND(i);
      for (const u of [0, 0.01, 1.5, 2.99]) {
        expect(revealAt(T + u, true, REPO)).toEqual({ city: { zoom: "city", beat: "islands", lit: lit(), plates: plated(), focus: island, label: REPO }, caption: CITY_COPY.island[island], done: false });
      }
    });
  });

  test("beat 3 is five caption cuts: one island framed at a time, every island dark and plateless, none ever mid-light", () => {
    const rows = sweep(true, 27);
    expect(order(rows.map(({ r }) => r.city?.beat))).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
    expect(order(rows.map(({ r }) => r.caption).filter((c): c is string | null => c !== undefined))).toEqual([...EXPECTED_CAPTIONS, null]);
    expect(order(rows.filter(({ r }) => r.city?.beat === "islands").map(({ r }) => r.city!.focus))).toEqual([...CITY_ISLANDS]);
    expect(firstAt(rows, (r) => r.city?.beat === "islands")).toBe(6.7);
    expect(firstAt(rows, (r) => r.city?.beat === "grow")).toBe(21.7);
    for (const { r } of rows) {
      if (!r.city) continue;
      const values = CITY_ISLANDS.map((id) => r.city!.lit[id]);
      for (const v of values) expect([0, 1]).toContain(v);
      expect(new Set(values).size).toBe(1); // all five together, always
      expect(new Set(CITY_ISLANDS.map((id) => r.city!.plates[id])).size).toBe(1);
      if (r.city.beat === "islands") { expect(values).toEqual([0, 0, 0, 0, 0]); expect(r.city.focus).not.toBeNull(); } // still dark, one framed
      else expect(r.city.focus).toBeNull(); // the camera only leaves the ring for the island captions
    }
    // each caption is held 3.0 s, to the sample before the next one cuts in
    CITY_ISLANDS.forEach((id, i) => {
      const mine = rows.filter(({ r }) => r.caption === CITY_COPY.island[id]);
      expect(mine[0].t).toBeCloseTo(T_REDUCED_ISLAND(i), 9);
      expect(mine.at(-1)!.t - mine[0].t).toBeCloseTo(2.99, 9);
    });
  });
});

// ---------- the story ----------

type Frame = { t: number; view: DeckView & { followItem?: string; attention?: string[]; focus?: string } };

/** Plays a story from wherever it is, answering every call, and stops on the tick the hero crate ships: reveal t = 0.
 *  Returns the view one tick earlier (the hero still on the line, the camera riding along). */
function advance(s: Story) {
  let before = s.view() as Frame["view"];
  for (let i = 0; i < 6000 && s.phase() !== "reveal"; i++) {
    before = s.view() as Frame["view"];
    s.step!(DT);
    const card = s.view().card;
    if (card?.id.startsWith(STORY_CARD.call)) s.approve(card.id);
  }
  expect(s.phase()).toBe("reveal");
  return before;
}
function toReveal(opts: StoryOptions = {}) {
  const s = createStory({ seed: 3, ...opts });
  const last = advance(s);
  return { s, last, before: last.shipped, hero: last.followItem! };
}

/** Steps one tick at a time until the card is up, recording every view. frames[k] is reveal t = k * DT. */
function walk(s: Story, limit = 60): Frame[] {
  const frames: Frame[] = [{ t: 0, view: s.view() }];
  for (let k = 1; k * DT <= limit && s.phase() === "reveal"; k++) { s.step!(DT); frames.push({ t: k * DT, view: s.view() }); }
  return frames;
}
const when = (frames: Frame[], hit: (v: Frame["view"]) => boolean) => frames.find((f) => hit(f.view))?.t;
/** The story's view of the city is revealAt's, give or take float dust from summing ticks. */
function sameCity(a: CityView | undefined, b: CityView | undefined) {
  expect(!!a).toBe(!!b);
  if (!a || !b) return;
  expect({ ...a, lit: 0 }).toEqual({ ...b, lit: 0 });
  for (const id of CITY_ISLANDS) expect(a.lit[id]).toBeCloseTo(b.lit[id], 6);
}

describe("the full story ends in the city reveal", () => {
  test("the hero rocket is reveal t = 0: the no-card crate ships, the camera lets go of it, the city waits", () => {
    const { s, last, before, hero } = toReveal();
    expect(last.followItem).toBe(hero); // a tick earlier the camera is still riding the crate
    expect(last.stops.some((x) => x.items.some((c) => c.id === hero))).toBe(true);
    expect(s.phase()).toBe("reveal");
    const v = s.view() as Frame["view"];
    expect(v.shipped).toBe(before + 1); // the one ship the engine turns into the rocket
    expect(v.followItem).toBeUndefined(); // cleared on that same tick
    expect(v.stops.some((x) => x.items.some((c) => c.id === hero))).toBe(false);
    expect(v.city).toBeUndefined(); // station zoom: the engine's own rocket camera
    expect(v.caption).toBe("Shippy's got these now. No card."); // beat 0 leaves the caption alone
    expect(v.card).toBeNull();
    expect(v.shippy).toEqual({ pose: "happy", at: "review" });
    expect(v.focus).toBeUndefined();
    expect(v.attention).toEqual([]);
  });

  test("beats in order, on the SPEC's clock, with their captions", () => {
    const { s } = toReveal();
    const frames = walk(s);
    expect(s.phase()).toBe("end");
    const beats = frames.map(({ view }) => view.city?.beat);
    expect(order(beats)).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
    const seen = (b: string) => when(frames, (v) => v.city?.beat === b)!;
    expect(seen("line")).toBeCloseTo(4.0, 9);
    expect(seen("city")).toBeCloseTo(5.8, 9);
    expect(seen("islands")).toBeCloseTo(7.9, 9);
    expect(seen("grow")).toBeCloseTo(24.5, 9);
    expect(seen("dim")).toBeCloseTo(27.0, 9);
    expect(seen("card")).toBeCloseTo(29.1, 9);
    expect(order(frames.map(({ view }) => view.caption))).toEqual(["Shippy's got these now. No card.", ...EXPECTED_CAPTIONS, null]);
    // each island's own lines are up within one tick of 0.6 s into its turn (the camera has arrived), and not a tick before
    CITY_ISLANDS.forEach((id, i) => {
      const at = when(frames, (v) => v.caption === CITY_COPY.island[id])!;
      expect(at).toBeGreaterThanOrEqual(T_ISLAND(i) + 0.6 - 1e-9);
      expect(at).toBeLessThan(T_ISLAND(i) + 0.6 + DT);
    });
  });

  test("every frame is revealAt at that moment, captions included", () => {
    const { s } = toReveal();
    let caption: string | null = "Shippy's got these now. No card.";
    for (const { t, view } of walk(s)) {
      const r = revealAt(t, false, REPO);
      sameCity(view.city, r.city);
      if (r.caption !== undefined) caption = r.caption;
      expect(view.caption).toBe(view.card ? null : caption);
    }
  });

  test("progress values step through the islands: Errors half lit at 9.8 s, Traffic at 13.0, Customers lit at 20.7", () => {
    const { s } = toReveal();
    const frames = walk(s);
    const at = (t: number) => frames[Math.round(t / DT)].view.city!;
    expect(at(9.8).lit.errors).toBeCloseTo(0.5, 6);
    expect(at(9.8).lit.traffic).toBe(0);
    expect(at(13.0).lit.errors).toBe(1);
    expect(at(13.0).lit.traffic).toBeCloseTo(0.5, 6);
    expect(at(20.7).lit.customers).toBe(1);
    expect(at(20.7).lit.marketing).toBe(0);
    expect(at(20.7).focus).toBe("marketing");
    expect(at(24.0).focus).toBeNull(); // the camera is on its way back to the ring
    expect(at(25).lit).toEqual(lit(...CITY_ISLANDS));
    expect(at(27.45).lit).toEqual(lit("errors"));
    expect(at(27.45).plates).toEqual(plated("marketing", "customers", "inbox", "traffic"));
  });

  test("the line stays alive and calm under the city; nothing else moves, nothing asks, no more rockets", () => {
    const { s, before } = toReveal();
    const frames = walk(s);
    const hero = frames[0].view.shipped;
    const crateIds = new Set<string>(), firstSeen: number[] = [];
    for (const { t, view } of frames.slice(0, -1)) {
      expect(view.shipped).toBe(hero); // frozen: crates reaching Launch just leave, the engine launches nothing
      expect(hero).toBe(before + 1);
      expect(view.card).toBeNull(); // the card only comes at the very end
      expect(view.jam).toBeNull();
      expect(view.attention).toEqual([]); // nothing glows yellow under "only the line moves"
      expect(view.focus).toBeUndefined();
      expect(view.followItem).toBeUndefined();
      expect(view.shippy).toEqual({ pose: "happy", at: "review" }); // on the line's island, never floating
      expect(view.stops.map((x) => x.id)).toEqual([...STOPS]);
      expect(view.stops.every((x) => x.built)).toBe(true);
      expect(view.stops.some((x) => x.state === "jammed" || x.waiting)).toBe(false); // no CHECKS WAITING, no REVIEW WAITING
      expect(view.stops.find((x) => x.id === "review")).toMatchObject({ automated: true, state: "auto" });
      expect(view.deck).toEqual({ size: "large", island: "built" });
      const ids = view.stops.flatMap((x) => x.items.map((i) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) if (!crateIds.has(id)) { crateIds.add(id); firstSeen.push(t); }
    }
    expect(crateIds.size).toBeGreaterThanOrEqual(10); // 29 s of crates, one about every 1.6 s
    for (let k = 1; k < firstSeen.length; k++) {
      expect(firstSeen[k] - firstSeen[k - 1]).toBeGreaterThan(1.3); // calmer than before: spawnEvery 1.6 with jitter
      expect(firstSeen[k] - firstSeen[k - 1]).toBeLessThan(1.9);
    }
    expect(firstSeen[0]).toBeLessThan(0.5); // the first one rolls at once, so the line is moving when the camera pulls back
    for (const beat of ["line", "city", "grow", "dim"]) { // crates are on the belt at every zoom level of the reveal
      const during = frames.filter(({ view }) => view.city?.beat === beat);
      expect(during.some(({ view }) => view.stops.some((x) => x.items.length > 0))).toBe(true);
    }
  });

  test("the end: the sign-in card over the city, every island dark with its plate", () => {
    const { s } = toReveal();
    walk(s);
    const v = s.view();
    expect(s.phase()).toBe("end");
    expect(v.card).toEqual({
      id: STORY_CARD.connect, title: "Start with your repo.", line: "GitHub first. The rest lights up later.",
      yes: "Sign in with GitHub", no: "Replay", setup: true, stop: "repo", dots: null,
    });
    expect(v.caption).toBeNull();
    expect(v.city).toEqual({ zoom: "city", beat: "card", lit: lit(), plates: plated(...CITY_ISLANDS), focus: null, label: REPO });
    for (let i = 0; i < 200; i++) s.step!(DT); // the line keeps running under the card; the city holds
    expect(s.phase()).toBe("end");
    expect(s.view().city).toEqual(v.city);
    expect(s.view().card).toEqual(v.card);
    expect(s.view().shipped).toBe(v.shipped);
    // the view hands out copies
    s.view().card!.title = "changed"; s.view().city!.plates.errors = false;
    expect(s.view().card!.title).toBe("Start with your repo.");
    expect(s.view().city!.plates.errors).toBe(true);
  });

  test("Sign in with GitHub goes where the connect card went; Replay starts the whole story over", () => {
    let connected = 0;
    const { s } = toReveal({ onConnect: () => connected++ });
    walk(s);
    s.approve("story-call-1"); // the wrong card is ignored
    expect(connected).toBe(0);
    s.approve(STORY_CARD.connect);
    expect(connected).toBe(1);
    expect(s.phase()).toBe("end"); // the page navigates away; the story does not move
    s.later(STORY_CARD.connect);
    const v = s.view();
    expect(s.phase()).toBe("build");
    expect(v.city).toBeUndefined();
    expect(v.card).toBeNull();
    expect(v.shipped).toBe(0);
    expect(v.shippy).toEqual({ pose: "folded", at: "corner" });
    expect(v.stops.find((x) => x.id === "gate")!.built).toBe(false);
    // and the same story plays again, reveal included, on fresh time
    advance(s);
    expect(s.view().shipped).toBeGreaterThan(0);
    const frames = walk(s);
    expect(order(frames.map(({ view }) => view.city?.beat))).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
    expect(when(frames, (v) => v.city?.beat === "card")).toBeCloseTo(29.1, 9);
    expect(s.view().card?.id).toBe(STORY_CARD.connect);
  });

  test("reset() in the middle of the reveal drops the city, the frozen ship count and the clock", () => {
    const { s } = toReveal();
    for (let i = 0; i < 200; i++) s.step!(DT); // 10 s in: Errors is lit
    expect(s.view().city?.beat).toBe("islands");
    s.reset();
    const v = s.view();
    expect(s.phase()).toBe("build");
    expect(v.city).toBeUndefined();
    expect(v.shipped).toBe(0);
    expect(v.card).toBeNull();
    for (let i = 0; i < 200; i++) { s.step!(DT); expect(s.view().city).toBeUndefined(); } // the old clock is gone
  });

  test("same seed, same reveal, frame for frame; the seed never changes the beats", () => {
    const a = toReveal({ seed: 7 }), b = toReveal({ seed: 7 });
    expect(JSON.stringify(walk(a.s))).toBe(JSON.stringify(walk(b.s)));
    const sequences = [1, 2, 3, 42].map((seed) => {
      const frames = walk(toReveal({ seed }).s);
      return JSON.stringify([order(frames.map(({ view }) => view.city?.beat)), order(frames.map(({ view }) => view.caption))]);
    });
    expect(new Set(sequences).size).toBe(1);
  });

  test("frame rate and speed do not matter: 16 ms, 50 ms, 100 ms and one big jump all reach the card at 29.1 s", () => {
    for (const dt of [1 / 60, 0.05, 0.1, 0.4]) {
      const { s } = toReveal();
      let t = 0, beats: (string | undefined)[] = [], captions: (string | null)[] = [];
      while (s.phase() === "reveal" && t < 40) {
        s.step!(dt); t += dt;
        beats.push(s.view().city?.beat); captions.push(s.view().caption);
      }
      expect(s.phase()).toBe("end");
      expect(t).toBeGreaterThanOrEqual(29.1 - 0.06);
      expect(t).toBeLessThan(29.1 + dt + 0.06);
      if (dt <= 0.1) {
        expect(order(beats)).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
        expect(order(captions)).toEqual(["Shippy's got these now. No card.", ...EXPECTED_CAPTIONS, null]);
      }
    }
    const { s } = toReveal();
    s.step!(REVEAL_SECONDS.normal + 0.5); // a long stall (a hidden tab) just plays through to the card
    expect(s.phase()).toBe("end");
    expect(s.view().city?.beat).toBe("card");
  });

  test("view() only reads: asking twice, or stepping by nothing, never moves the reveal", () => {
    const { s } = toReveal();
    for (let i = 0; i < 100; i++) s.step!(DT);
    const json = JSON.stringify(s.view());
    expect(JSON.stringify(s.view())).toBe(json);
    s.step!(0);
    expect(JSON.stringify(s.view())).toBe(json);
  });

  test("subscribers hear every tick of the reveal", () => {
    const { s } = toReveal();
    let heard = 0;
    const off = s.subscribe!(() => heard++);
    walk(s, 2);
    off();
    expect(heard).toBe(40);
  });
});

// The city layer turns the change between two frames of view.city into sound cues (city/timeline.ts cityEvents, SPEC section 3).
// The story's frames must give it exactly the cues the SPEC lists. Imported inside the test so a change over there fails this one.
describe("the story's frames drive the city's cues", () => {
  const LAMPS: Record<CityIsland, number> = { errors: 12, traffic: 12, inbox: 9, customers: 12, marketing: 0 }; // Marketing has no bridge
  async function cues(opts: StoryOptions, dt: number) {
    const { cityEvents } = await import("../src/deck2d/city/timeline");
    const { s } = toReveal(opts);
    let prev = s.view().city;
    const out: { t: number; type: string; island?: CityIsland; lamp?: number }[] = [];
    for (let k = 1; s.phase() === "reveal" && k < 3000; k++) {
      s.step!(dt);
      const next = s.view().city;
      for (const e of cityEvents(prev, next, (id) => LAMPS[id])) out.push({ t: k * dt, type: e.type, ...("island" in e ? { island: e.island } : {}), ...("lamp" in e ? { lamp: e.lamp } : {}) });
      prev = next;
    }
    return out;
  }

  test("normal motion: a tap as each island lights, one chord at 'grow', a thud as each goes dark, in that order", async () => {
    for (const dt of [1 / 60, DT, 0.1]) {
      const events = (await cues({}, dt)).filter((e) => e.type !== "city-lamp");
      expect(events.map((e) => (e.island ? `${e.type}/${e.island}` : e.type))).toEqual([
        ...CITY_ISLANDS.map((id) => `city-lit/${id}`), "city-all-lit", ...[...CITY_ISLANDS].reverse().map((id) => `city-dim/${id}`),
      ]);
      // each cue lands on the first frame at or after its moment
      const on = (i: number, moment: number) => { expect(events[i].t).toBeGreaterThanOrEqual(moment - 1e-6); expect(events[i].t).toBeLessThan(moment + dt + 1e-6); };
      CITY_ISLANDS.forEach((_, i) => on(i, T_ISLAND(i) + 1.44)); // 1.44 s into each turn: lit, lamp and halo on
      on(5, 24.5);
      [0, 1, 2, 3, 4].forEach((k) => on(6 + k, 27 + 0.15 * k));
    }
  });

  test("normal motion: each runway lights its lamps in order, 60 ms apart, only during its own island's turn", async () => {
    for (const dt of [1 / 60, DT]) {
      const lamps = (await cues({}, dt)).filter((e) => e.type === "city-lamp");
      CITY_ISLANDS.forEach((id, i) => {
        const mine = lamps.filter((e) => e.island === id);
        expect(mine.map((e) => e.lamp)).toEqual(Array.from({ length: LAMPS[id] }, (_, k) => k));
        for (const e of mine) {
          expect(e.t).toBeGreaterThanOrEqual(T_ISLAND(i) + 0.6 - 1e-9); // not before the camera's move is done
          expect(e.t).toBeLessThanOrEqual(T_ISLAND(i) + 0.6 + 0.06 * 12 + dt); // the runway is done by 0.66 s into the light step
        }
      });
      expect(lamps.filter((e) => e.island === "marketing")).toEqual([]);
    }
  });

  test("reduced motion: one chord when all five light, one thud when they go dark, no taps and no lamp ticks", async () => {
    for (const dt of [1 / 60, DT]) {
      const events = await cues({ reducedMotion: true }, dt);
      expect(events.map((e) => e.type)).toEqual(["city-all-lit", "city-dim"]);
      expect(events[0].t).toBeGreaterThanOrEqual(21.7 - 1e-6); // after the five caption cuts, when all five light
      expect(events[0].t).toBeLessThan(21.7 + dt + 1e-6);
      expect(events[1].t).toBeGreaterThanOrEqual(24.2 - 1e-6);
      expect(events[1].t).toBeLessThan(24.2 + dt + 1e-6);
    }
  });
});

describe("reduced motion", () => {
  test("the same beats as cuts: 25.7 s from the rocket to the card, the five island captions one by one with the islands still dark", () => {
    const { s } = toReveal({ reducedMotion: true });
    const frames = walk(s);
    expect(s.phase()).toBe("end");
    expect(order(frames.map(({ view }) => view.city?.beat))).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
    expect(order(frames.map(({ view }) => view.caption))).toEqual(["Shippy's got these now. No card.", ...EXPECTED_CAPTIONS, null]);
    const seen = (b: string) => when(frames, (v) => v.city?.beat === b)!;
    expect(seen("line")).toBeCloseTo(4.0, 9);
    expect(seen("city")).toBeCloseTo(5.2, 9);
    expect(seen("islands")).toBeCloseTo(6.7, 9);
    expect(seen("grow")).toBeCloseTo(21.7, 9);
    expect(seen("dim")).toBeCloseTo(24.2, 9);
    expect(seen("card")).toBeCloseTo(25.7, 9);
    // each island's lines cut in on the tick its 3.0 s begins
    CITY_ISLANDS.forEach((id, i) => expect(when(frames, (v) => v.caption === CITY_COPY.island[id])).toBeCloseTo(T_REDUCED_ISLAND(i), 9));
    for (const { view } of frames) {
      if (!view.city) continue;
      expect(new Set(CITY_ISLANDS.map((id) => view.city!.lit[id])).size).toBe(1); // all five at once
      for (const id of CITY_ISLANDS) expect([0, 1]).toContain(view.city.lit[id]);
      if (view.city.beat === "islands") { // an island is framed (the camera cuts to it) and still dark while its lines are up
        expect(CITY_ISLANDS.map((id) => view.city!.lit[id])).toEqual([0, 0, 0, 0, 0]);
        expect(view.city.plates).toEqual(plated());
        expect(CITY_ISLANDS).toContain(view.city.focus!);
        expect(view.caption).toBe(CITY_COPY.island[view.city.focus!]);
      } else expect(view.city.focus).toBeNull();
    }
    expect(s.view().card).toMatchObject({ title: "Start with your repo.", yes: "Sign in with GitHub", no: "Replay", setup: true });
    expect(s.view().city?.plates).toEqual(plated(...CITY_ISLANDS));
  });

  test("everything before the rocket is identical to normal motion", () => {
    const a = createStory({ seed: 5 }), b = createStory({ seed: 5, reducedMotion: true });
    for (let i = 0; i < 900; i++) {
      a.step!(DT); b.step!(DT);
      for (const s of [a, b]) { const c = s.view().card; if (c?.id.startsWith(STORY_CARD.call)) s.approve(c.id); }
      if (a.phase() === "reveal") break;
      expect(JSON.stringify(a.view())).toBe(JSON.stringify(b.view()));
    }
    expect(a.phase()).toBe("reveal");
    expect(b.phase()).toBe("reveal");
  });
});

describe("beat 0: the camera cuts to the launch pad for the rocket", () => {
  test("shot 'launch' from reveal t = 0 to 3.9 s, gone at 4.0 s when beat 1's line zoom takes over unchanged", () => {
    for (const opts of [{}, { reducedMotion: true }] as StoryOptions[]) {
      const { s } = toReveal(opts);
      const frames = walk(s, 8);
      const at = (t: number) => frames[Math.round(t / DT)].view;
      for (const t of [0, 1, 2.5, 3.9]) {
        expect(at(t).shot, `t ${t}`).toBe("launch");
        expect(at(t).city).toBeUndefined(); // station zoom: only the camera's subject is named
      }
      expect(at(4.0).shot).toBeUndefined();
      expect(at(4.0).city).toMatchObject({ zoom: "line", beat: "line" });
      for (const { t, view } of frames) if (t >= 4.0) expect(view.shot, `t ${t}`).toBeUndefined();
    }
  });

  test("never both and never neither: the shot is there exactly while the city is absent, at any frame rate", () => {
    for (const dt of [1 / 60, DT, 0.1, 0.4]) {
      const { s } = toReveal();
      expect(s.view().shot).toBe("launch");
      while (s.phase() === "reveal") {
        s.step!(dt);
        const v = s.view();
        expect(v.shot === "launch", `dt ${dt}`).toBe(v.city === undefined);
      }
      expect(s.view().shot).toBeUndefined(); // the card is up over the city
    }
  });

  test("before the rocket the story names no shot (the engine's own camera is in charge), and Replay drops it again", () => {
    const s = createStory({ seed: 2 });
    for (let i = 0; i < 6000 && s.phase() !== "reveal"; i++) {
      s.step!(DT);
      if (s.phase() === "reveal") break;
      expect(s.view().shot).toBeUndefined();
      const card = s.view().card;
      if (card?.id.startsWith(STORY_CARD.call)) s.approve(card.id);
    }
    expect(s.phase()).toBe("reveal");
    expect(s.view().shot).toBe("launch");
    walk(s);
    s.later(STORY_CARD.connect);
    expect(s.phase()).toBe("build");
    expect(s.view().shot).toBeUndefined();
  });

  test("startAt reveal holds the shot through its 0.5 s preroll and the rocket, until 4.5 s after load, and again after Replay", () => {
    const s = createStory({ seed: 1, startAt: "reveal" });
    expect(s.view().shot).toBe("launch"); // the very first view: the line is running and the camera is on the pad
    for (let k = 1; k <= 100; k++) {
      s.step!(DT);
      const sec = k * DT; // seconds since load; the rocket goes at 0.5 and the zoom out is 4.0 s later
      expect(s.view().shot === "launch", `${sec.toFixed(2)} s`).toBe(sec < 4.5 - 1e-9);
    }
    for (let i = 0; i < 1000 && s.view().card?.id !== STORY_CARD.connect; i++) s.step!(DT);
    s.later(STORY_CARD.connect);
    expect(s.view().shot).toBe("launch");
  });
});

describe("startAt: reveal", () => {
  test("the full story's last minute on its own: everything built, Review is Shippy's, the rocket goes at 0.5 s", () => {
    const s = createStory({ seed: 1, startAt: "reveal" });
    const v0 = s.view() as Frame["view"];
    expect(s.phase()).toBe("reveal");
    expect(v0.stops.every((x) => x.built)).toBe(true);
    expect(v0.stops.find((x) => x.id === "review")).toMatchObject({ automated: true, state: "auto" });
    expect(v0.shippy).toEqual({ pose: "happy", at: "review" });
    expect(v0.deck).toEqual({ size: "large", island: "built" });
    expect(v0.shipped).toBe(0);
    expect(v0.city).toBeUndefined();
    expect(v0.caption).toBeNull(); // the first thing anyone reads is "That's one line."
    expect(v0.card).toBeNull();
    s.step!(0.45);
    expect(s.view().shipped).toBe(0);
    s.step!(0.05); // exactly 0.5 s of a running line: the rocket
    expect(s.view().shipped).toBe(1);
    expect(s.view().city).toBeUndefined(); // that tick is reveal t = 0
    const once = createStory({ seed: 1, startAt: "reveal" });
    once.step!(0.5); // the same whether it arrives in one step or ten
    expect(once.view().shipped).toBe(1);
    expect(once.phase()).toBe("reveal");
    const frames = walk(s);
    expect(s.phase()).toBe("end");
    expect(order(frames.map(({ view }) => view.city?.beat))).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
    expect(order(frames.map(({ view }) => view.caption))).toEqual([null, ...EXPECTED_CAPTIONS, null]);
    expect(when(frames, (v) => v.city?.beat === "line")).toBeCloseTo(4.0, 9);
    expect(when(frames, (v) => v.city?.beat === "card")).toBeCloseTo(29.1, 9);
    expect(frames.every(({ view }) => view.shipped === 1)).toBe(true);
    expect(s.view().card?.id).toBe(STORY_CARD.connect);
  });

  test("it keeps the line running from the first tick and honors reduced motion", () => {
    const s = createStory({ seed: 1, startAt: "reveal", reducedMotion: true });
    s.step!(0.2);
    expect(s.view().stops.some((x) => x.items.length > 0)).toBe(true);
    while (s.view().shipped === 0) s.step!(DT);
    const frames = walk(s);
    expect(order(frames.map(({ view }) => view.city?.beat))).toEqual([undefined, "line", "city", "islands", "grow", "dim", "card"]);
    expect(when(frames, (v) => v.city?.beat === "card")).toBeCloseTo(25.7, 9);
  });

  test("Replay on the card restarts from the same place; the short story ignores startAt", () => {
    const s = createStory({ seed: 1, startAt: "reveal" });
    for (let i = 0; i < 1000 && s.view().card?.id !== STORY_CARD.connect; i++) s.step!(DT);
    s.later(STORY_CARD.connect);
    expect(s.phase()).toBe("reveal");
    expect(s.view().shipped).toBe(0);
    expect(s.view().city).toBeUndefined();
    expect(s.view().card).toBeNull();

    const short = createStory({ seed: 1, swipes: 1, startAt: "reveal" });
    expect(short.phase()).toBe("build");
    expect(short.view().stops.find((x) => x.id === "gate")!.built).toBe(false);
    expect(short.view().shippy).toEqual({ pose: "folded", at: "corner" });
  });
});

describe("what does not change", () => {
  test("the short front-door story never shows a city; its card keeps its words", () => {
    const s = createStory({ seed: 1, swipes: 1 });
    let guard = 0;
    while (s.phase() !== "end" && guard++ < 2000) {
      s.step!(DT);
      expect(s.view().city).toBeUndefined();
      const card = s.view().card;
      if (card && s.phase() !== "end") s.approve(card.id);
    }
    expect(s.phase()).toBe("end");
    for (let i = 0; i < 1200; i++) { s.step!(DT); expect(s.view().city).toBeUndefined(); }
    expect(s.view().card).toMatchObject({ id: STORY_CARD.connect, title: "Now let's do this with your repo.", yes: "See my repo", no: "Replay", setup: true });
  });

  test("nothing before the rocket mentions the city or the next jam", () => {
    const s = createStory({ seed: 2 });
    for (let i = 0; i < 6000 && s.phase() !== "reveal"; i++) {
      s.step!(DT);
      const v = s.view();
      expect(v.city).toBeUndefined();
      expect(JSON.stringify(v)).not.toMatch(/next jam|CHECKS WAITING|\bcity\b/i);
      if (v.card?.id.startsWith(STORY_CARD.call)) s.approve(v.card.id);
    }
    expect(s.phase()).toBe("reveal");
  });
});

// Silkscreen's advance widths in its own 8 px grid (1 unit = 1.75 px at the phone's 14 px caption). Measured in Chromium with
// web/public/fonts/silkscreen-400.woff2 at 14 px: a line's width is exactly the sum of its letters (the font has no kerning).
const UNITS: Record<string, number> = {
  " ": 4, "'": 3, ".": 3, ":": 3, i: 3,
  e: 5, f: 5, l: 5, t: 5, F: 5, T: 5,
  a: 6, b: 6, c: 6, d: 6, g: 6, h: 6, k: 6, o: 6, p: 6, q: 6, r: 6, s: 6, u: 6, C: 6, H: 6, P: 6, S: 6,
  m: 7, n: 7, v: 7, w: 7, x: 7, y: 7, N: 7, Y: 7,
};
/** A caption line's width in CSS px at 14 px Silkscreen. NaN when a letter has not been measured yet. */
const width14 = (line: string) => [...line].reduce((n, c) => n + (UNITS[c] ?? Number.NaN), 0) * 1.75;

describe("the island captions (what each island will bring, in the honest future tense)", () => {
  test("each names its integration: Sentry, Cloudflare, PostHog, the email and support tickets, marketing", () => {
    expect(CITY_COPY.island).toEqual({
      errors: "Sentry will send in crashes\nfrom your real product.",
      traffic: "Cloudflare will show how\npeople use your app.",
      inbox: "Your email and support tickets\nwill come in here.",
      customers: "PostHog funnels will show\nwhere customers drop off.",
      marketing: "Next: customer acquisition\nand automated marketing.",
    });
    expect(CITY_COPY.island.traffic).not.toMatch(/PostHog/); // PostHog is the customers' story: who they are and where they drop off
    for (const id of CITY_ISLANDS) expect(CITY_COPY.island[id], id).toMatch(/\bwill\b|^Next:/); // coming, never working
  });

  test("two lines each, at most 52 characters a line, every line at most 340 px at 14 px (the phone's 366 px band less 13 px of air each side)", () => {
    // the table reproduces what Chromium measured
    expect(width14("Sentry will send in crashes")).toBe(257.25);
    expect(width14("Cloudflare will show how")).toBe(231);
    expect(width14("Your email and support tickets")).toBe(285.25);
    expect(width14("PostHog funnels will show")).toBe(243.25);
    expect(width14("Next: customer acquisition")).toBe(243.25);
    expect(width14("and automated marketing.")).toBe(232.75);
    for (const id of CITY_ISLANDS) expect(CITY_COPY.island[id].split("\n").length, id).toBe(2);
    for (const text of [CITY_COPY.line, CITY_COPY.city, CITY_COPY.grow, CITY_COPY.dim, ...CITY_ISLANDS.map((id) => CITY_COPY.island[id])]) {
      for (const line of text.split("\n")) {
        expect(line.length, line).toBeLessThanOrEqual(52);
        expect(Number.isFinite(width14(line)), `a letter in "${line}" is not in UNITS: measure it`).toBe(true);
        expect(width14(line), line).toBeLessThanOrEqual(340);
      }
    }
  });

  test("on a 360 px phone a caption keeps its two lines: 12 px type in a 314 px chip, and even 14 px would fit", () => {
    // deck.css: the chip is calc(100% - 24px) wide less 2 x 10 px of padding and 2 x 1 px of edge; a phone's city caption is 12 px
    const content = 360 - 24 - 2 * 10 - 2 * 1;
    expect(content).toBe(314);
    for (const id of CITY_ISLANDS) for (const line of CITY_COPY.island[id].split("\n")) {
      expect(width14(line) * (12 / 14), line).toBeLessThanOrEqual(content);
      expect(width14(line), line).toBeLessThanOrEqual(content);
    }
  });
});

describe("the words (scope rule: GitHub is the only real source)", () => {
  test("only CITY_COPY is ever said, and none of it claims the five islands work", () => {
    const said = new Set<string>();
    for (const opts of [{}, { reducedMotion: true }] as StoryOptions[]) {
      const frames = walk(toReveal(opts).s);
      for (const { view } of frames) { if (view.caption) said.add(view.caption); if (view.card) said.add(`${view.card.title} ${view.card.line} ${view.card.yes} ${view.card.no}`); }
    }
    said.delete("Shippy's got these now. No card."); // beat 0, the story's own line from before the reveal
    const allowed = new Set<string>([...EXPECTED_CAPTIONS, `${CITY_COPY.card.title} ${CITY_COPY.card.line} ${CITY_COPY.card.yes} ${CITY_COPY.card.no}`]);
    expect([...said].filter((x) => !allowed.has(x))).toEqual([]);
    expect(said.size).toBe(allowed.size);
    const claims = /\b(connect(ed|s|ing)?|works?|working|runs?|running|live|active|online|enabled|ready|supported|syncs?|syncing|monitor(s|ing)?|track(s|ing)?)\b/i;
    for (const text of said) expect(text).not.toMatch(claims);
  });

  test("the reveal is pure sim: no DOM, no canvas, no timers", () => {
    const here = join(import.meta.dir, "../src/deck2d/story");
    for (const file of ["reveal.ts", "index.ts"]) {
      const code = readFileSync(join(here, file), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      expect(code).not.toMatch(/\b(document|window|canvas|getContext|requestAnimationFrame|setTimeout|setInterval|matchMedia|localStorage)\b/);
    }
  });
});
