// Meet Shippy: the guest front door (Justin, 2026-10-29 20:51, "start with the simplest platform possible and introduce
// Shippy right away"). A small empty deck, Shippy in the card telling the story at your pace, one card at a time.
// Each "Build it" puts up the next station and names it; then one fix rolls down the line and waits at the Gate, you
// approve it, and the rocket shows what shipping is. Its last card is STORY_CARD.connect, which the page hands to sign-in.
// ONE thing moves at a time: a card is up (nothing moves) or one thing builds/rolls (no card). Pure sim: no DOM.
import { STAGE_AT } from "../build/timeline";
import { GROW_SECONDS } from "../grow/index";
import { LAUNCH_BUILD_SECONDS } from "../launch/timeline";
import { CITY_COPY, CITY_TIMING, STOPS, type CardView, type CityBeat, type CityIsland, type CityView, type CityZoom, type DeckView, type ShippyView, type Shot, type StopId } from "../contract";
import type { AttentionView } from "../stations/attention";
import { STORY_CARD, type StoryPhase } from "./index";

type DeckSize = NonNullable<DeckView["deck"]>["size"];
type Island = NonNullable<DeckView["deck"]>["island"];

/** One beat: a card you read and answer, then (optionally) the thing it starts. */
interface Beat {
  title: string;
  line: string;
  yes: string;
  at: StopId; // where Shippy stands and the camera looks while you read
  shot?: Shot; // what the story camera frames while you read (default: at)
  hold?: boolean; // ships (pretend) code: a held press, like every real merge; shows as a plain work card
  pose?: NonNullable<CardView["shippy"]>; // Shippy inside the card (default talk)
  then?: { build: StopId } | { grow: DeckSize; build: StopId } | { boiler: true } | { island: true } | { roll: true } | { ship: true };
  /** The islands story: the camera pulls back to the city while this card talks; `light` islands light up one after another. */
  city?: { zoom: CityZoom; beat: CityBeat; light?: CityIsland[] };
}

// The station lines use the locked names (contract STOP_LABEL) and say what each step does for fixing and shipping.
// Copy: Justin's playthrough, 2026-10-30. No Skip anywhere: Next and Back only.
export const TOUR: Beat[] = [
  { title: "Hi, I'm Shippy!", line: "Great to meet you. This game turns your GitHub repo into a factory that ships real features to your real users.", yes: "Next", at: "repo", shot: "shippy", pose: "wave" },
  { title: "Powered by Meta", line: "Meta's models are my brain. I'll cheer you on and suggest what to do next.", yes: "Next", at: "repo", shot: "shippy", pose: "happy" },
  { title: "Software is a factory", line: "Work comes in, gets built, gets checked, and ships. Let's build your line.", yes: "Build it", at: "repo", shot: "shippy", pose: "point", then: { build: "repo" } },
  { title: "Repo", line: "Your GitHub issues land here. Each one is a crate of work.", yes: "Build next", pose: "point", at: "repo", then: { build: "planner" } },
  { title: "Planner", line: "I write a short plan. You say yes before any code is written.", yes: "Build next", pose: "point", at: "planner", then: { grow: "medium", build: "builder" } },
  { title: "Builder", line: "The code gets written here, following the plan you said yes to.", yes: "Build next", pose: "point", at: "builder", then: { build: "checks" } },
  { title: "Checks", line: "Your tests run here. Broken code stops before it can hurt anything.", yes: "Build next", pose: "point", at: "checks", then: { grow: "large", build: "review" } },
  { title: "Review", line: "A second look at the change, so nothing odd slips through.", yes: "Build next", pose: "point", at: "review", then: { build: "gate" } },
  { title: "Gate", line: "Nothing merges until you say so. That's your whole line. Now it needs power.", yes: "Power it", at: "gate", shot: "line", pose: "point", then: { boiler: true } },
  { title: "The steam engine", line: "It powers the whole line. Power it with your own Codex or Muse Code subscription.", yes: "Next", at: "repo", shot: "boiler", pose: "point", then: { island: true } },
  { title: "Launch", line: "This is where you actually ship. Merged PRs fly out to your users from here. Want to ship one now?", yes: "Ship one", pose: "point", at: "launch", then: { roll: true } },
  { title: "Ship this fix?", line: "A fix rode through every machine and it's waiting on your call. Press and hold to ship it.", yes: "Hold to ship", at: "gate", hold: true, then: { ship: true } },
  { title: "Shipped!", line: "Your fix is live. Issues come in, shipped code goes out, and you make all the calls.", yes: "Next", at: "launch", pose: "happy" },
  // Justin's islands story (#725's city), told as cards you click through instead of captions on a clock.
  { title: "Your software factory", line: "This first part is your software factory: your GitHub repo, powered by your coding subscription.", yes: "Next", at: "launch", pose: "point",
    city: { zoom: "line", beat: "line" } },
  { title: "It's just the start", line: "Later you'll add more islands. Each one connects to your factory and feeds it real work.", yes: "Next", at: "launch", pose: "wave",
    city: { zoom: "city", beat: "city" } },
  { title: "Errors and traffic", line: "Sentry sends in crashes from your real product. Cloudflare shows how people use your app.", yes: "Next", at: "launch", pose: "point",
    city: { zoom: "city", beat: "islands", light: ["errors", "traffic"] } },
  { title: "Inbox and customers", line: "Support tickets and email come in as work. PostHog shows where customers drop off.", yes: "Next", at: "launch", pose: "point",
    city: { zoom: "city", beat: "islands", light: ["inbox", "customers"] } },
  { title: "The factory must grow", line: "Then marketing, so people find what you ship. Every island makes your factory smarter.", yes: "Next", at: "launch", pose: "happy",
    city: { zoom: "city", beat: "grow", light: ["marketing"] } },
];

const BUILD_SEC = STAGE_AT.done; // the card comes back as the build lands; its dust settles behind it
const BOILER_SEC = 1.6; // the steam engine rising out of the floor
const ISLAND_SEC = Math.min(LAUNCH_BUILD_SECONDS, 3);
const GROW_TOUR_SEC = 4.5; // the deck built out to its next size, column by column (Justin 2026-10-30: it "extends pretty rapidly")
const HOP_SEC = 0.5; // a crate's time from one machine to the next (the ship beat)
// The fix's ride down the whole line (Justin 2026-10-30: "it should show a PR going through all of these steps... the camera
// follows"): it stops at each machine for DWELL after the belt brings it there (the engine's crate-arrive), or after
// ROLL_HOP_MAX when nothing is drawing it (tests, a hidden tab).
const DWELL_SEC = 0.7;
const ROLL_HOP_MAX = 3.2;
const ROCKET_SEC = 3.5; // the rocket's moment, on camera, before Shippy says what happened
const LIGHT_GAP = 0.9; // the islands story: seconds between two islands lighting on the same card
const CRATE = "tour-crate";
const SHIP_BEAT = TOUR.findIndex((b) => b.then && "ship" in b.then);
const off = <V>(v: V): Record<CityIsland, V> => ({ errors: v, traffic: v, inbox: v, customers: v, marketing: v });

export interface Tour {
  view(): AttentionView;
  step(dt: number): void;
  approve(id: string): void;
  later(id: string): void;
  reset(): void;
  phase(): StoryPhase;
  /** The engine's belt brought a crate to a stop (main.ts forwards crate-arrive). */
  arrive(id: string, stop: StopId): void;
}

export function createTour(): Tour {
  let S = fresh(), round = 0;
  function fresh() {
    return {
      beat: 0, playing: null as Beat["then"] | null, t: 0, sub: 0, cardT: 0, hopT: 0, landed: false,
      built: new Set<StopId>(), size: "small" as DeckSize, island: "none" as Island, islandProgress: undefined as number | undefined,
      boiler: 0, crate: null as StopId | null, shipped: 0, end: false, growing: 0,
    };
  }

  function card(): CardView | null {
    if (S.end) return { id: STORY_CARD.connect, title: "Want to create your own factory?", line: "Sign in with GitHub and I'll build your real one, on your real repo. The other islands light up later.", stop: "repo", dots: null, yes: "Build mine", no: "Replay", setup: true, guide: "shippy" }; // a plain card: its press leaves the page
    if (S.playing) return null;
    const b = TOUR[S.beat];
    // Ship it is a real yes on real-looking work, so it shows like one (held); the rest are Shippy talking in the card.
    const face = b.hold ? { hold: true, guide: "shippy" as const } : { shippy: b.pose ?? "talk" };
    // Next and Back only (Justin 2026-10-30: "I don't want there to be a skip button"); the first card has no Back.
    return { id: `tour-${round}-${S.beat}`, title: b.title, line: b.line, stop: b.at, dots: null, yes: b.yes, ...(S.beat > 0 ? { no: "Back" } : {}), ...face };
  }

  function step(dt: number) {
    S.cardT += dt;
    if (!S.playing) return;
    S.t += dt;
    const p = S.playing;
    if ("ship" in p) {
      if (S.sub === 0 && S.t >= HOP_SEC) { S.crate = "launch"; S.sub = 1; }
      if (S.sub === 1 && S.t >= HOP_SEC * 2) { S.crate = null; S.shipped++; S.sub = 2; }
      if (S.sub === 2 && S.t >= HOP_SEC * 2 + ROCKET_SEC) done();
      return;
    }
    if ("roll" in p) {
      // One crate from Repo down the whole line, a machine at a time, the camera riding along; it waits at the Gate for your call.
      if (S.crate === null) { S.crate = "repo"; S.hopT = 0; S.landed = true; return; }
      S.hopT += dt;
      const ready = S.landed ? S.hopT >= DWELL_SEC : S.hopT >= ROLL_HOP_MAX;
      if (!ready) return;
      if (S.crate === "gate") { done(); return; }
      S.crate = STOPS[STOPS.indexOf(S.crate) + 1]; S.hopT = 0; S.landed = false;
      return;
    }
    if ("boiler" in p) { S.boiler = Math.min(1, S.t / BOILER_SEC); if (S.boiler >= 1) done(); return; }
    if ("island" in p) {
      S.islandProgress = Math.min(1, S.t / ISLAND_SEC);
      if (S.islandProgress >= 1) { S.island = "built"; S.islandProgress = undefined; S.built.add("launch"); done(); }
      return;
    }
    // grow (if any) first, then the build: strictly one after the other. The deck is built out a column at a time
    // (view.deck.growing) rather than snapping to the new size, then the new size locks in.
    const growFor = "grow" in p ? GROW_TOUR_SEC + GROW_SECONDS : 0;
    if ("grow" in p && S.sub === 0) {
      S.growing = Math.min(1, S.t / GROW_TOUR_SEC);
      if (S.growing >= 1) { S.size = p.grow; S.growing = 0; S.sub = 1; }
    }
    if (S.sub < 2 && S.t >= growFor) { S.built.add(p.build); S.sub = 2; }
    if (S.t >= growFor + BUILD_SEC) done();
  }
  function done() { S.playing = null; next(); }
  function next() { S.cardT = 0; if (++S.beat >= TOUR.length) { S.beat = TOUR.length - 1; S.end = true; } }

  function arrive(id: string, stop: StopId) {
    if (id === CRATE && S.playing && "roll" in S.playing && stop === S.crate && !S.landed) { S.landed = true; S.hopT = 0; }
  }

  function start(b: Beat) {
    if (!b.then) { next(); return; }
    S.playing = b.then; S.t = 0; S.sub = 0;
    if ("island" in b.then) S.island = "building";
    if ("roll" in b.then) S.crate = null;
  }

  function approve(id: string) {
    const c = card();
    if (!c || c.id !== id) return;
    if (S.end) return; // the page hands this card to sign-in
    start(TOUR[S.beat]);
  }

  function later(id: string) {
    const c = card();
    if (!c || c.id !== id) return;
    if (S.end) { reset(); return; } // Replay
    if (S.beat === 0) return; // no Skip: the first card only goes forward
    round++; // fresh ids, so the card shows the earlier beat again
    S.beat--; S.cardT = 0; // Back re-reads the last beat; what's built stays built
    // Back onto the fix's own cards puts the fix back where that card found it
    if (S.beat === SHIP_BEAT) S.crate = "gate";
    else if (S.beat < SHIP_BEAT) S.crate = null;
  }

  function reset() { S = fresh(); round++; }

  /** The islands story's picture for the card that is up: what was lit on earlier cards stays lit, this card's light in turn. */
  function cityView(): CityView | undefined {
    const at = S.end ? -1 : S.beat, b = TOUR[at];
    if (S.end) return { zoom: "city", beat: "card", lit: off(0), plates: off(true), focus: null, label: CITY_COPY.repo };
    if (!b?.city) return undefined;
    const lit = off(0);
    for (let i = 0; i < at; i++) for (const id of TOUR[i].city?.light ?? []) lit[id] = 1;
    (b.city.light ?? []).forEach((id, k) => { lit[id] = Math.max(0, Math.min(1, (S.cardT - CITY_TIMING.move - k * LIGHT_GAP) / CITY_TIMING.light)); });
    return { zoom: b.city.zoom, beat: b.city.beat, lit, plates: off(false), focus: null, label: CITY_COPY.repo }; // the whole ring: the card names what lights
  }

  function view(): AttentionView {
    const c = card(), b = TOUR[Math.min(S.beat, TOUR.length - 1)];
    const p = S.playing;
    const building = p && ("build" in p ? p.build : "island" in p ? "launch" : null);
    const focus: StopId = building ?? (S.crate ?? (c?.stop ?? b.at));
    const city = cityView();
    // Story camera: tight on Shippy to start, then on whatever is building or being explained; the crate's own ride
    // (and the ship beat) leave it to followItem. The islands story hands the camera to the city.
    const shot: Shot | undefined = city ? undefined : p ? ("boiler" in p ? "boiler" : "ship" in p ? "launch" : building ?? undefined) : (b.shot ?? b.at);
    const rolling = !!p && "roll" in p;
    const shippy: ShippyView = S.end || city ? { pose: "happy", at: "launch" } : p && "ship" in p ? { pose: "happy", at: "gate" }
      : building ? { pose: "weld", at: building } : rolling && S.crate ? { pose: S.landed ? "inspect" : "walking", at: S.crate } : { pose: "inspect", at: b.at };
    const stops = STOPS.map((id) => ({
      id, built: S.built.has(id), automated: false,
      state: S.crate === id ? "working" : "idle",
      items: S.crate === id ? [{ id: CRATE, title: "Fix the broken docs link", look: id === "gate" && !p ? "glow" : "ok" }] : [],
    }));
    return {
      stops, jam: null, attention: c && S.beat === SHIP_BEAT && !S.end ? ["gate"] : [], card: c, shippy, shipped: S.shipped, caption: null,
      // the fix's ride: the camera goes station to station with it, at the same framing as the build cards
      focus, ...(rolling && S.crate ? { shot: S.crate } : shot ? { shot } : {}),
      deck: { size: S.size, island: S.island, boiler: S.boiler, ...(S.growing ? { growing: S.growing } : {}), ...(S.islandProgress != null ? { islandProgress: S.islandProgress } : {}) },
      ...(city ? { city } : {}),
    } as AttentionView;
  }

  return { view, step, approve, later, reset, arrive, phase: () => (S.end ? "end" : "build") };
}
