// Meet Shippy: the guest front door (Justin, 2026-10-29 20:51, "start with the simplest platform possible and introduce
// Shippy right away"). A small empty deck, Shippy in the card telling the story at your pace, one card at a time.
// Each "Build it" puts up the next station and names it; then one fix rolls down the line and waits at the Gate, you
// approve it, and the rocket shows what shipping is. Its last card is STORY_CARD.connect, which the page hands to sign-in.
// ONE thing moves at a time: a card is up (nothing moves) or one thing builds/rolls (no card). Pure sim: no DOM.
import { STAGE_AT } from "../build/timeline";
import { GROW_SECONDS } from "../grow/index";
import { LAUNCH_BUILD_SECONDS } from "../launch/timeline";
import { STOPS, type CardView, type DeckView, type ShippyView, type Shot, type StopId } from "../contract";
import type { AttentionView } from "../stations/attention";
import { STORY_CARD, type StoryPhase } from "./index";
import { CREDIT } from "../../copy";

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
}

// The station lines use the locked names (contract STOP_LABEL) and say what each step does for fixing and shipping.
export const TOUR: Beat[] = [
  { title: "Hi, I'm Shippy!", line: "Great to meet you. This is a game that mirrors your GitHub repo, and what you decide here really happens in your project.", yes: "Next", at: "repo", shot: "shippy", pose: "wave" },
  // Justin (20:53): call out Meta's model by name here, with the one credit (copy.ts CREDIT).
  { title: CREDIT[0].toUpperCase() + CREDIT.slice(1), line: "Meta's model is my brain. I'll cheer you on and suggest what to do next, based on what you connect: GitHub first, then issues and feedback.", yes: "Next", at: "repo", shot: "shippy" },
  { title: "Software is a factory", line: "Work comes in, gets built, gets checked, and ships. Let's build your line, one machine at a time.", yes: "Build it", at: "repo", shot: "shippy", pose: "point", then: { build: "repo" } },
  { title: "Repo", line: "Your GitHub issues land here. Every issue is a crate of work.", yes: "Build next", pose: "point", at: "repo", then: { build: "planner" } },
  { title: "Planner", line: "I read an issue and write a short plan. You say yes before any code is written.", yes: "Build next", pose: "point", at: "planner", then: { grow: "medium", build: "builder" } },
  { title: "Builder", line: "This is where the code gets written, following the plan you said yes to.", yes: "Build next", pose: "point", at: "builder", then: { build: "checks" } },
  { title: "Checks", line: "Your tests run here. Broken code stops before it can hurt anything.", yes: "Build next", pose: "point", at: "checks", then: { grow: "large", build: "review" } },
  { title: "Review", line: "A second look at the change, so nothing odd slips through.", yes: "Build next", pose: "point", at: "review", then: { build: "gate" } },
  { title: "Gate", line: "Nothing merges until you say so. This is where you decide what ships.", yes: "Next", at: "gate", pose: "point" },
  { title: "That's your software factory line", line: "Every machine is one step from an issue to shipped code. Now it needs power.", yes: "Power it", at: "repo", shot: "line", then: { boiler: true } },
  { title: "The steam engine", line: "It powers the whole line. Power it with your own Codex or Muse Code, and it writes your code on your computer.", yes: "Next", at: "repo", shot: "boiler", pose: "point", then: { island: true } },
  { title: "Launch", line: "Merged code ships from here. That's the whole goal: ship something.", yes: "Show me", at: "launch", pose: "point", then: { roll: true } },
  { title: "Ship this fix?", line: "A fix just made it through every machine and is waiting at the Gate. Approve it and I'll show you how shipping works.", yes: "Ship it", at: "gate", hold: true, then: { ship: true } },
  { title: "Shipped!", line: "That's shipping. Your fix is live. Issues come in, shipped code goes out, and you make the calls.", yes: "Next", at: "launch", pose: "happy" },
];

const BUILD_SEC = STAGE_AT.done; // the card comes back as the build lands; its dust settles behind it
const BOILER_SEC = 1.6; // the steam engine rising out of the floor
const ISLAND_SEC = Math.min(LAUNCH_BUILD_SECONDS, 3);
const HOP_SEC = 0.5; // a crate's time from one machine to the next
const ROCKET_SEC = 3.5; // the rocket's moment, on camera, before Shippy says what happened
const CRATE = "tour-crate";
const SHIP_BEAT = TOUR.findIndex((b) => b.then && "ship" in b.then);

export interface Tour {
  view(): AttentionView;
  step(dt: number): void;
  approve(id: string): void;
  later(id: string): void;
  reset(): void;
  phase(): StoryPhase;
}

export function createTour(): Tour {
  let S = fresh(), round = 0;
  function fresh() {
    return {
      beat: 0, playing: null as Beat["then"] | null, t: 0, sub: 0,
      built: new Set<StopId>(), size: "small" as DeckSize, island: "none" as Island, islandProgress: undefined as number | undefined,
      boiler: 0, crate: null as StopId | null, shipped: 0, end: false,
    };
  }

  function card(): CardView | null {
    if (S.end) return { id: STORY_CARD.connect, title: "Want to create your own factory?", line: "Sign in with GitHub and I'll build your real one, on your real repo.", stop: "repo", dots: null, yes: "Build mine", no: "Replay", setup: true, guide: "shippy" }; // a plain card: its press leaves the page
    if (S.playing) return null;
    const b = TOUR[S.beat];
    // Ship it is a real yes on real-looking work, so it shows like one (held); the rest are Shippy talking in the card.
    const face = b.hold ? { hold: true, guide: "shippy" as const } : { shippy: b.pose ?? "talk" };
    return { id: `tour-${round}-${S.beat}`, title: b.title, line: b.line, stop: b.at, dots: null, yes: b.yes, no: S.beat === 0 ? "Skip" : "Back", ...face };
  }

  function step(dt: number) {
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
      // One crate from Repo to the Gate, a machine at a time, then it waits there for your call.
      const hop = Math.min(STOPS.indexOf("gate"), Math.floor(S.t / HOP_SEC));
      S.crate = STOPS[hop];
      if (S.crate === "gate" && S.t >= HOP_SEC * (hop + 1)) done();
      return;
    }
    if ("boiler" in p) { S.boiler = Math.min(1, S.t / BOILER_SEC); if (S.boiler >= 1) done(); return; }
    if ("island" in p) {
      S.islandProgress = Math.min(1, S.t / ISLAND_SEC);
      if (S.islandProgress >= 1) { S.island = "built"; S.islandProgress = undefined; S.built.add("launch"); done(); }
      return;
    }
    // grow (if any) first, then the build: strictly one after the other.
    const growFor = "grow" in p ? GROW_SECONDS : 0;
    if ("grow" in p && S.sub === 0) { S.size = p.grow; S.sub = 1; }
    if (S.sub < 2 && S.t >= growFor) { S.built.add(p.build); S.sub = 2; }
    if (S.t >= growFor + BUILD_SEC) done();
  }
  function done() { S.playing = null; next(); }
  function next() { if (++S.beat >= TOUR.length) { S.beat = TOUR.length - 1; S.end = true; } }

  function start(b: Beat) {
    if (!b.then) { next(); return; }
    S.playing = b.then; S.t = 0; S.sub = 0;
    if ("island" in b.then) S.island = "building";
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
    round++; // fresh ids, so the card shows the earlier beat again
    if (S.beat === 0) { S.beat = TOUR.length - 1; jumpToEnd(); return; } // Skip: the whole line, straight to sign-in
    S.beat = Math.max(1, S.beat - 1); // Back re-reads the last beat; what's built stays built
  }

  function jumpToEnd() {
    S.built = new Set(STOPS); S.size = "large"; S.island = "built"; S.boiler = 1; S.end = true;
  }

  function reset() { S = fresh(); round++; }

  function view(): AttentionView {
    const c = card(), b = TOUR[Math.min(S.beat, TOUR.length - 1)];
    const p = S.playing;
    const building = p && ("build" in p ? p.build : "island" in p ? "launch" : null);
    const focus: StopId = building ?? (S.crate ?? (c?.stop ?? b.at));
    // Story camera: tight on Shippy to start, then on whatever is building or being explained; the crate's own ride
    // (and the ship beat) leave it to followItem.
    const shot: Shot | undefined = S.end ? "line" : p ? ("boiler" in p ? "boiler" : "ship" in p ? "launch" : building ?? undefined) : (b.shot ?? b.at);
    const shippy: ShippyView = S.end ? { pose: "happy", at: "gate" } : p && "ship" in p ? { pose: "happy", at: "gate" } : building ? { pose: "weld", at: building } : { pose: "inspect", at: b.at };
    return {
      stops: STOPS.map((id) => ({
        id, built: S.built.has(id), automated: false,
        state: S.crate === id ? "working" : "idle",
        items: S.crate === id ? [{ id: CRATE, title: "Fix the broken docs link", look: id === "gate" && !p ? "glow" : "ok" }] : [],
      })),
      jam: null, attention: c && S.beat === SHIP_BEAT && !S.end ? ["gate"] : [], card: c, shippy, shipped: S.shipped, caption: null,
      focus, ...(S.crate && p && !("ship" in p) ? { followItem: CRATE } : shot ? { shot } : {}),
      deck: { size: S.size, island: S.island, boiler: S.boiler, ...(S.islandProgress != null ? { islandProgress: S.islandProgress } : {}) },
    } as AttentionView;
  }

  return { view, step, approve, later, reset, phase: () => (S.end ? "end" : "build") };
}
