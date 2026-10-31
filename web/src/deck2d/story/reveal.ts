// The city reveal: the full story's ending, from the hero rocket to the sign-in card (web/src/deck2d/city/SPEC.md
// section 1, BRIEF.md "The reveal"). Pure: revealAt(t) is the whole picture t seconds after reveal t = 0, the sub-step
// where the no-card crate leaves the Launch queue and the rocket goes up. The story owns the clock and hands the result
// to the engine as DeckView.city and DeckView.caption; the city layer draws it. No DOM, no canvas, no timers here.
//
//   0 rocket   station zoom, the engine's own rocket camera, the caption is left alone
//   1 line     zoom out one step: the whole line                              "That's one line."
//   2 city     zoom out again: sunset, the line lit, five dark islands        "Here's the rest of the factory."
//   3 islands  Errors, Traffic, Inbox, Customers, Marketing light one at a time, a caption each
//   4 grow     all lit, only the line moves                                   "The factory must grow."
//   5 dim      the islands step back to dark in reverse order, plates on      "For now: one line. Your repo."
//   6 card     the sign-in card slides up over the city (no caption: the card talks)
//
// Reduced motion plays the same beats as cuts: no glides, no runway, no dither. Beat 3 becomes five caption cuts: each
// island is framed and still dark while its two lines are held CITY_TIMING.reducedIsland (3.0 s); then all five light at once
// ("The factory must grow.") and dim at once.
import { CITY_COPY, CITY_ISLANDS, CITY_TIMING as T, type CityBeat, type CityIsland, type CityView, type CityZoom } from "../contract";
import { clamp01 } from "../engine/math";

export interface Reveal {
  /** What the engine and the city layer draw. Omitted in beat 0: station zoom, exactly as before the city existed. */
  city?: CityView;
  /** The caption to show. undefined = leave whatever is showing alone (beat 0); null = no caption (the card talks). */
  caption: string | null | undefined;
  /** The reveal is over and the card should come up. Stays true for any later t. */
  done: boolean;
}

// Sim time is a float sum; a boundary reached to within a microsecond counts as reached. Only boundaries get the slack:
// the lit progress is the exact value of t.
const EPS = 1e-6;
// CITY_TIMING is in whole milliseconds; rounding keeps sums like 29.1 from printing as 29.100000000000001.
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fill = <V>(v: V): Record<CityIsland, V> => ({ errors: v, traffic: v, inbox: v, customers: v, marketing: v });

const N = CITY_ISLANDS.length;
/** One island's turn in beat 3: the camera move, then the light step (3.2 s). */
const ISLAND_SECONDS = r3(T.move + T.light);
/** Beat 5 dims in reverse reveal order: Marketing first, Errors last. */
const DIM_ORDER = [...CITY_ISLANDS].reverse();

/** When each beat starts, in seconds from reveal t = 0. */
const NORMAL = (() => {
  const line = T.rocket; // 4.0: zoom out one step
  const city = r3(line + T.move + T.line); // 5.8: zoom out to the city
  const islands = r3(city + T.move + T.city); // 7.9: the first island
  const ring = r3(islands + N * ISLAND_SECONDS); // 23.9: the camera heads back to the ring (still beat 3)
  const grow = r3(ring + T.move); // 24.5: all lit
  const dim = r3(grow + T.grow); // 27.0: the islands step to dark
  const card = r3(dim + (N - 1) * T.dimGap + T.dark); // 29.1: the card
  return { line, city, islands, ring, grow, dim, card };
})();
const REDUCED = (() => {
  const line = T.rocket; // 4.0
  const city = r3(line + T.line); // 5.2
  const islands = r3(city + T.city); // 6.7: the first island's caption
  const grow = r3(islands + N * T.reducedIsland); // 21.7: all lit (five captions of 3.0 s between)
  const dim = r3(grow + T.grow); // 24.2
  const card = r3(dim + T.dark); // 25.7
  return { line, city, islands, grow, dim, card };
})();

/** How long the reveal runs, from reveal t = 0 to the card. */
export const REVEAL_SECONDS = { normal: NORMAL.card, reduced: REDUCED.card } as const;

export function revealAt(t: number, reduced: boolean, label: string): Reveal {
  const x = t + EPS; // t for boundary checks
  const at = reduced ? REDUCED : NORMAL;
  const show = (beat: CityBeat, zoom: CityZoom, lit: Record<CityIsland, number>, plates: Record<CityIsland, boolean>,
    focus: CityIsland | null = null): CityView => ({ zoom, beat, lit, plates, focus, label });

  if (!(x >= at.line)) return { caption: undefined, done: false }; // 0 rocket (also NaN and negative t)
  if (x < at.city) return { city: show("line", "line", fill(0), fill(false)), caption: CITY_COPY.line, done: false };
  if (x < at.islands) return { city: show("city", "city", fill(0), fill(false)), caption: CITY_COPY.city, done: false };

  if (reduced && x < REDUCED.grow) { // 3 islands as cuts: each framed and still dark, its two lines held 3.0 s
    const i = Math.min(N - 1, Math.floor((t - REDUCED.islands + EPS) / T.reducedIsland)), id = CITY_ISLANDS[i];
    return { city: show("islands", "city", fill(0), fill(false), id), caption: CITY_COPY.island[id], done: false };
  }
  if (!reduced && x < NORMAL.grow) { // 3 islands, one at a time
    if (x >= NORMAL.ring) // the camera heads back to the ring: all lit, the Marketing line stays up
      return { city: show("islands", "city", fill(1), fill(false)), caption: CITY_COPY.island[CITY_ISLANDS[N - 1]], done: false };
    const u = t - NORMAL.islands;
    const i = Math.min(N - 1, Math.floor((u + EPS) / ISLAND_SECONDS)), into = u - i * ISLAND_SECONDS; // island i, seconds into its turn
    const lit = fill(0);
    CITY_ISLANDS.forEach((id, j) => { lit[id] = j < i ? 1 : j === i ? clamp01((into - T.move) / T.light) : 0; });
    // An island's own lines show once the camera arrives at it; until then the previous island's (or the city's) stay up.
    const caption = into + EPS >= T.move ? CITY_COPY.island[CITY_ISLANDS[i]] : i === 0 ? CITY_COPY.city : CITY_COPY.island[CITY_ISLANDS[i - 1]];
    return { city: show("islands", "city", lit, fill(false), CITY_ISLANDS[i]), caption, done: false };
  }

  if (x < at.dim) return { city: show("grow", "city", fill(1), fill(false)), caption: CITY_COPY.grow, done: false };

  if (x < at.card) { // 5 dim: a step to dark each, 150 ms apart (all at once when reduced), a plate with each
    const lit = fill(1), plates = fill(false);
    DIM_ORDER.forEach((id, k) => { if (reduced || x - at.dim >= k * T.dimGap) { lit[id] = 0; plates[id] = true; } });
    return { city: show("dim", "city", lit, plates), caption: CITY_COPY.dim, done: false };
  }

  return { city: show("card", "city", fill(0), fill(true)), caption: null, done: true }; // 6 card
}
