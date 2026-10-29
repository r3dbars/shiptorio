// The live first run (Justin, 2026-10-29): meet Shippy, connect GitHub, Shippy builds each station one at a time and
// says what it does in one plain line, then the real work starts on the finished line.
// A view filter, not a source: it sits on top of whatever the live page shows (connection cards included) and only
// decides what's built yet, what the one caption says, where the camera looks and when the card may come up.
// ONE thing moves at a time: every step is serial (build waits build/ STAGE_AT.gone, grow GROW_SECONDS).
// Nothing here talks to the server, approves anything or starts work.
import { STAGE_AT } from "../build/timeline";
import { GROW_SECONDS } from "../grow/index";
import { LAUNCH_BUILD_SECONDS } from "../launch/timeline";
import { STOPS, type DeckView, type ShippyView, type StopId } from "../contract";

/** intro: a guest just swiped the sample jam clear. hello: signed in, no repo yet. repo: repo chosen, waiting on the
 *  Codex engine. engine: Codex is ready. */
export type FirstRunStage = "intro" | "hello" | "repo" | "engine";
type DeckSize = NonNullable<DeckView["deck"]>["size"];
type Island = NonNullable<DeckView["deck"]>["island"];

type Step =
  | { say: string; sec?: number } // the one caption; holds the script for sec (default SAY_SEC)
  | { build: StopId; say: string } // the station builds while its line shows
  | { grow: DeckSize }
  | { island: string } // launch/ raises the island, bridge and rocket while its line shows
  | { shippy: ShippyView }
  | { rest: number };

const ORDER: FirstRunStage[] = ["intro", "hello", "repo", "engine"];
const SAY_SEC = 2.4;
const BUILD_SEC = STAGE_AT.gone;
const ISLAND_SEC = Math.min(LAUNCH_BUILD_SECONDS, 8);

// Plain words, one line each. No jargon, no "Shippy:" prefixes.
export const FIRST_RUN_LINES = {
  hi: "Hi, I'm Shippy. I keep that line moving.",
  yours: "Now let's do this with your repo.",
  pick: "Pick a repo and I'll build your factory.",
  repo: "Repo: your GitHub issues come in here.",
  planner: "Planner: I read an issue and write a short plan.",
  engine: "Next, the engine that writes the code.",
  builder: "Builder: Codex writes the code, on your computer.",
  checks: "Checks: your tests run. Broken code stops here.",
  review: "Review: a second look before anything ships.",
  gate: "Gate: nothing merges until you say so.",
  launch: "Launch: merged, and it's live.",
  ready: "Your factory is ready. Pick an issue and I'll take it from here.",
} as const;
const L = FIRST_RUN_LINES;

const SCRIPTS: Record<FirstRunStage, Step[]> = {
  intro: [{ rest: 0.4 }, { shippy: { pose: "happy", at: "review" } }, { say: L.hi }, { say: L.yours, sec: 1.8 }],
  hello: [{ rest: 0.4 }, { shippy: { pose: "happy", at: "repo" } }, { say: L.pick, sec: 1.8 }],
  repo: [
    { rest: 0.6 }, { shippy: { pose: "happy", at: "repo" } }, { build: "repo", say: L.repo }, { rest: 0.6 },
    { build: "planner", say: L.planner }, { rest: 0.6 }, { say: L.engine, sec: 1.6 },
  ],
  engine: [
    { rest: 0.3 }, { build: "builder", say: L.builder }, { rest: 0.3 }, { grow: "medium" },
    { build: "checks", say: L.checks }, { rest: 0.3 }, { build: "review", say: L.review }, { rest: 0.3 }, { grow: "large" },
    { build: "gate", say: L.gate }, { rest: 0.3 }, { island: L.launch }, { rest: 0.3 },
    { shippy: { pose: "happy", at: "repo" } }, { say: L.ready, sec: 2 },
  ],
};

// What each stage starts with already standing, and the platform it stands on.
const BEFORE: Record<FirstRunStage, { built: StopId[]; size: DeckSize }> = {
  intro: { built: [...STOPS], size: "large" },
  hello: { built: [], size: "small" },
  repo: { built: [], size: "small" },
  engine: { built: ["repo", "planner"], size: "small" },
};
const AFTER: Record<FirstRunStage, StopId[]> = { intro: [...STOPS], hello: [], repo: ["repo", "planner"], engine: [...STOPS] };

export interface FirstRunOptions {
  /** null: not yet (a guest is still playing the sample); show the page as it is. */
  stage(): FirstRunStage | null;
  /** Remembers which stages already played (per repo), so a reload never builds twice. */
  store?: Pick<Storage, "getItem" | "setItem">;
  key?: string;
  /** The live factory already has work: it's not a first run, show it as it is. */
  established?(): boolean;
}

export function createFirstRun(o: FirstRunOptions) {
  const key = `shiptorio:firstrun:${o.key ?? ""}`;
  const seen = new Set<string>();
  try { for (const s of (o.store?.getItem(key) ?? "").split(",")) if (s) seen.add(s); } catch { /* private mode */ }
  const remember = (s: FirstRunStage) => { seen.add(s); try { o.store?.setItem(key, [...seen].join(",")); } catch { /* private mode */ } };

  let stage: FirstRunStage | null = null, script: Step[] = [], stepT = 0, playing = false;
  let built = new Set<StopId>(), size: DeckSize = "small", island: Island = "none", islandProgress: number | undefined;
  let caption: string | null = null, focus: StopId | null = null, shippy: ShippyView | null = null;
  let finished = seen.has("engine");

  function enter(next: FirstRunStage) {
    stage = next;
    const before = BEFORE[next];
    // A stage that already played (or got skipped past) starts finished.
    if (seen.has(next)) { built = new Set(AFTER[next]); size = next === "engine" ? "large" : "small"; island = next === "engine" ? "built" : "none"; script = []; playing = false; caption = null; focus = null; shippy = null; return; }
    built = new Set(before.built); size = before.size; island = "none"; islandProgress = undefined;
    script = SCRIPTS[next].slice(); stepT = 0; playing = true; caption = null; focus = null; shippy = { pose: "folded", at: "corner" };
  }

  function step(dt: number) {
    if (finished) return;
    if (o.established?.()) { finished = true; remember("hello"); remember("repo"); remember("engine"); return; }
    // Stages only move forward: a runner blinking offline mid-build never tears the line back down.
    const want = o.stage();
    if (want && (!stage || ORDER.indexOf(want) > ORDER.indexOf(stage))) enter(want);
    while (playing && dt > 0) {
      const h = Math.min(dt, 0.05); dt -= h;
      const cur = script[0];
      if (!cur) { playing = false; caption = null; focus = null; shippy = null; remember(stage!); if (stage === "engine") finished = true; break; }
      const first = stepT === 0;
      stepT += h;
      let done = false;
      if ("say" in cur && !("build" in cur)) { if (first) { caption = cur.say; focus = null; } done = stepT >= (cur.sec ?? SAY_SEC); }
      else if ("build" in cur) {
        if (first) { built.add(cur.build); caption = cur.say; focus = cur.build; shippy = null; }
        done = stepT >= BUILD_SEC;
      } else if ("grow" in cur) { if (first) { size = cur.grow; caption = null; } done = stepT >= GROW_SECONDS; }
      else if ("island" in cur) {
        if (first) { island = "building"; caption = cur.island; focus = "launch"; }
        islandProgress = Math.min(1, stepT / ISLAND_SEC);
        if (islandProgress >= 1) { island = "built"; islandProgress = undefined; built.add("gate").add("launch"); done = true; }
      } else if ("shippy" in cur) { shippy = cur.shippy; done = true; }
      else done = stepT >= cur.rest;
      if (done) { script.shift(); stepT = 0; }
    }
  }

  function view<V extends DeckView>(base: V): V {
    if (finished || !stage) return base;
    // The guest's sample factory stays as it is: Shippy only says hello over it before the sign-in card.
    if (stage === "intro") return playing ? { ...base, card: null, caption, jam: null, shippy: shippy ?? base.shippy, attention: [] } : base;
    const stops = base.stops.map(s => built.has(s.id) ? s : { ...s, built: false, state: "idle" as const, automated: false, items: [], waiting: undefined });
    const v: V = { ...base, stops, jam: null, deck: { size, island, ...(islandProgress != null ? { islandProgress } : {}) } };
    if (playing) {
      // The script owns the screen: one line, no card, the camera on what's being built.
      Object.assign(v, { card: null, caption, shippy: shippy ?? base.shippy, focus: focus ?? undefined, attention: [] });
    }
    return v;
  }

  return { step, view, playing: () => playing && !finished, done: () => finished };
}
