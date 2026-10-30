// Progress -> picture. The story owns time and hands the city `lit` per island (0 = dark, 1 = fully lit, in between =
// seconds into the light step / CITY_TIMING.light); everything an island shows follows from that one number
// (SPEC.md section 1). Pure functions: the draw code and the tests both read these, and cityEvents turns the change
// between two views into the sound cues.
import { CITY_ISLANDS, CITY_TIMING as T, type CityIsland, type CityView, type DeckEvent } from "../contract";

/** Float slack when a progress value is compared with a threshold in seconds (lit = (u - 0.6) / 1.6 and back). */
const EPS = 1e-6;
export type IslandStage = "dark" | "dither" | "lit";

export interface IslandState {
  /** Seconds into the light step. */
  s: number;
  /** Runway lamps on, counted from the lit end of the bridge (0 for Marketing, which has none). */
  lampsLit: number;
  /** dark -> the 2x2 checker of lit over dark (one step) -> lit. */
  stage: IslandStage;
  /** The island is lit: its label reads lit and its own lamp and lights may come on (the caption is already up). */
  halo: boolean;
  /** How many of the island's own lights (manifest `lights`, in lightOrder) are on: Errors, Traffic and Inbox switch them on
   *  one at a time after the lit step; Customers' are all on with it. */
  lightsOn: number;
  /** The island lamp's glow: 0 off, then three steps (1 r 3, 2 r 3-5 at 25% too, 3 the full r 7-4 and r 4-2). */
  bloom: 0 | 1 | 2 | 3;
  /** Customers only: how many of the arc's dots are lit, counted from the line's rocket. */
  arcDots: number;
  /** Customers only: the arrowhead at the pad shows (every dot lit, the capsule still flying the dots). */
  arrow: boolean;
  /** Customers only: how far its capsule has flown along the dots, 0 (the line's rocket) to 1 (the last dot), or -1 when it
   *  is not flying them. */
  flight: number;
  /** Customers only: its straight drop from the last dot onto the pad, 0 to 1, or -1 when it is not dropping. */
  drop: number;
  /** Customers only: its small rocket is on its pad (CITY_TIMING.capsule). */
  capsule: boolean;
  /** Marketing only: the mast-tip beacon is lit. */
  beacon: boolean;
  /** The bridge belt runs: every runway lamp is on (and, for Errors, Traffic and Inbox, the island has finished lighting). */
  beltRuns: boolean;
}

export const secondsIn = (lit: number) => Math.max(0, Math.min(1, lit)) * T.light;

/** Customers' capsule drops straight onto its pad for this long, from the last dot, before it sits down. */
export const DROP = 0.12;
/** Customers' capsule flies the lit dots from the line's rocket: from the moment the last dot lights until DROP before it
 *  sits down at CITY_TIMING.capsule; then it drops straight onto the pad. */
export const FLIGHT = { from: T.lit + (T.arcDots - 1) * T.arcDot, to: T.capsule - DROP } as const;

/** Errors, Traffic and Inbox light up in a sequence after their lit step (CITY_TIMING.lit): their own lights come on one at a
 *  time, `gap` apart (the first one `gap` after the lit step); then their lamp's halo blooms in three steps `bloom` apart; and
 *  only one step after the halo is whole, and never before `belt`, does their connector's belt start. One thing at a time. */
export const SEQUENCE = { gap: 0.05, bloom: 0.06, belt: 1.3 } as const;
export const SEQUENCED: readonly CityIsland[] = ["errors", "traffic", "inbox"];
const sequenced = (island: CityIsland) => SEQUENCED.includes(island);
/** Seconds into light when a sequenced island with `lights` lights starts its bloom, and when its belt may start. */
export const bloomAt = (lights: number) => T.lit + (Math.max(0, lights) + 1) * SEQUENCE.gap;
export const beltAt = (lights: number) => Math.max(SEQUENCE.belt, bloomAt(lights) + 3 * SEQUENCE.bloom);

/** The order an island's own lights come on in: Errors' crack from the crater down, Traffic's signals west to east, Inbox's
 *  portholes bottom to top (west to east on a row). Anything else keeps the manifest's order. */
export function lightOrder<L extends { at: readonly [number, number] }>(island: CityIsland, lights: readonly L[]): L[] {
  const out = [...lights];
  if (island === "errors") out.sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  else if (island === "traffic") out.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  else if (island === "inbox") out.sort((a, b) => b.at[1] - a.at[1] || a.at[0] - b.at[0]);
  return out;
}

/** Runway lamps on at `lit`, of `lamps`: lamp k lights at k * 0.06 s into the step, the first as soon as it starts. */
export const lampsOn = (lit: number, lamps: number) => (lit <= 0 || lamps <= 0 ? 0 : Math.min(lamps, Math.floor((secondsIn(lit) + EPS) / T.lamp) + 1));

/** Everything an island shows at `lit`, with `lamps` runway lamps on its connector and `lights` lights of its own. */
export function islandState(lit: number, lamps: number, island: CityIsland, lights = 0): IslandState {
  const s = secondsIn(lit), on = lit > 0, seq = sequenced(island);
  const lampsLit = lampsOn(lit, lamps);
  const stage: IslandStage = !on ? "dark" : s + EPS >= T.lit ? "lit" : s + EPS >= T.dither ? "dither" : "dark";
  const isLit = stage === "lit", n = Math.max(0, lights);
  const lightsOn = !isLit ? 0 : !seq ? n : Math.min(n, Math.floor((s + EPS - T.lit) / SEQUENCE.gap));
  const sinceBloom = s + EPS - bloomAt(n);
  const bloom = (!isLit ? 0 : !seq ? 3 : sinceBloom < 0 ? 0 : Math.min(3, 1 + Math.floor(sinceBloom / SEQUENCE.bloom))) as IslandState["bloom"];
  const arcDots = island === "customers" && on && s + EPS >= T.lit ? Math.min(T.arcDots, Math.floor((s + EPS - T.lit) / T.arcDot) + 1) : 0;
  const capsule = island === "customers" && on && s + EPS >= T.capsule;
  const flying = arcDots === T.arcDots && !capsule, dropping = flying && s + EPS >= FLIGHT.to;
  return {
    s, lampsLit, stage, halo: isLit, lightsOn, bloom, arcDots, capsule,
    arrow: flying && !dropping,
    flight: flying && !dropping ? Math.min(1, Math.max(0, (s - FLIGHT.from) / (FLIGHT.to - FLIGHT.from))) : -1,
    drop: dropping ? Math.min(1, Math.max(0, (s - FLIGHT.to) / DROP)) : -1,
    beacon: island === "marketing" && on && s + EPS >= T.beacon,
    beltRuns: lamps > 0 && lampsLit >= lamps && (!seq || s + EPS >= beltAt(n)),
  };
}

/** What the sound and the rest of the page hear when the city view changes (SPEC.md section 3, "Events"). Nothing fires
 *  for a view that has just appeared (the manual city, or a view that starts already lit). */
export function cityEvents(prev: CityView | undefined, next: CityView | undefined, lampsOf: (island: CityIsland) => number): DeckEvent[] {
  if (!prev || !next) return [];
  const out: DeckEvent[] = [], lit: CityIsland[] = [], dim: CityIsland[] = [];
  for (const island of CITY_ISLANDS) {
    const a = prev.lit[island], b = next.lit[island], of = lampsOf(island);
    const before = lampsOn(a, of), after = lampsOn(b, of);
    // a jump over more than two lamps is silent (reduced motion lights everything in one frame)
    if (after > before && after - before <= 2) for (let k = before; k < after; k++) out.push({ type: "city-lamp", island, lamp: k, of });
    if (secondsIn(a) + EPS < T.lit && secondsIn(b) + EPS >= T.lit && b > 0) lit.push(island);
    if (secondsIn(a) + EPS >= T.lit && b <= 0) dim.push(island);
  }
  if (lit.length === 1) out.push({ type: "city-lit", island: lit[0] });
  if (dim.length) out.push({ type: "city-dim", island: dim[0] }); // five dimming at once (reduced motion) is one thud
  if (prev.beat !== "grow" && next.beat === "grow") out.push({ type: "city-all-lit" });
  return out;
}

/** The grow glow (a backlight behind the line: the sky round it warmed one or two steps up its ramps) is on only for "The
 *  factory must grow." (DIRECTION.md D): never on the manual city (no beat), never at line zoom, off from the dim on. It
 *  switches on and off as a step, with or without reduced motion. */
const GLOW_BEATS: ReadonlySet<string> = new Set(["grow"]);
export const growGlowOn = (city: Pick<CityView, "zoom" | "beat"> | undefined) => !!city && city.zoom === "city" && GLOW_BEATS.has(city.beat ?? "");
