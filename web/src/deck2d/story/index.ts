// The scripted first run on the 2D deck (thread "Build the first-run story on the deck").
// A DeckSource with no server: it plays Justin's locked story (2026-10-28) on the real line, ported from /story-b:
//   1 Software is a factory: a small empty deck, stops build in one by one (construction, then a burst), the deck
//     grows, the rocket island rises, crates roll and the first rockets go up.
// ONE thing moves at a time (Justin, 2026-10-28: "shit flashing and pinging all over the place"): construction is a
// strict serial script. Each build, grow and island plays to the end, then a short rest. A caption shows for ~2s and
// rides over the camera move into the next build instead of adding its own pause. First card ~40s at speed 1.
//   2 There's always a bottleneck: review and gate build in, the line speeds up, crates pile at Review waiting on
//     your call ("REVIEW WAITING"). Never "the bottleneck is you".
//   3 Swipe, and it moves: approving releases the pile and rockets launch.
//   4 Approve twice more and it's automatic: Shippy unfolds, walks to Review, takes the lever. Then the next jam
//     shows up somewhere else, and the last card asks to connect the real repo.
// Pure sim: no DOM, no canvas. The engine draws view() and animates crates by item id.
import { STAGE_AT } from "../build/build";
import { GROW_SECONDS } from "../grow/index";
import { LAUNCH_BUILD_SECONDS } from "../launch/timeline";
import { STOPS, type CardView, type DeckSource, type DeckView, type Item, type ShippyView, type StopId } from "../contract";

export interface StoryOptions {
  seed?: number; // same seed, same story (crate titles, spawn jitter)
  speed?: number; // accepted for the contract's signature; the page already scales dt by ?speed
  onConnect?(): void; // the last card's yes: "Want to see the real one?" Default: go to the app to sign in
}

export type StoryPhase = "build" | "bottleneck" | "swipe" | "automatic" | "next-jam" | "end";

export interface Story extends DeckSource {
  phase(): StoryPhase;
  reset(): void;
}

/** Ids of the cards the story shows, so pages and tests can tell them apart. */
export const STORY_CARD = { call: "story-call-", connect: "story-connect" } as const;

// Seconds each stop spends on its front crate. Upstream stays faster than the spawn rate so the only pile is Review.
const SVC: Record<StopId, number> = { repo: 0.5, planner: 0.8, builder: 0.95, checks: 0.8, review: 0.6, gate: 0.45, launch: 1.1 };

// Construction is one serial script: every step waits for the one before it to finish on screen.
type DeckSize = NonNullable<DeckView["deck"]>["size"];
type Step =
  | { say: string } // a caption for SAY_SEC; doesn't hold the script, the next step starts under it
  | { build: StopId } // flip built; build/ plays the whole construction, check and afterglow
  | { grow: DeckSize } // grow/ plays the new section, then its plaque
  | { island: true } // launch/ raises the island, bridge, tower, rocket
  | { rest: number }
  | { until: () => boolean }
  | { run: () => void };
const SAY_SEC = 2;
const REST_SEC = 0.5;
const BUILD_SEC = STAGE_AT.gone; // until the check and its afterglow are gone
const GROW_SEC = GROW_SECONDS;
// launch/ maps islandProgress to its picture, so the story can run it faster than its own preview clock.
const ISLAND_SEC = Math.min(LAUNCH_BUILD_SECONDS, 8);
const built = (id: StopId, line: string): Step[] => [{ build: id }, { rest: REST_SEC }, { say: line }];
const FIXES = ["login typo", "broken docs link", "button label", "footer link", "empty state copy", "page title"];
const CALL_PILE = 4; // crates waiting at Review before the first card slides up
const PILE_CAP = 9; // stop adding crates past this so the heap stays readable

interface Live extends Item { t: number; approved: boolean }
interface StopSim { built: boolean; q: Live[] }

// The real app's front door: signing in with GitHub starts there.
const connect = () => { if (typeof location !== "undefined") location.assign("/"); };

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createStory(opts: StoryOptions = {}): Story {
  let S = fresh();
  const fns = new Set<() => void>();

  function fresh() {
    const rand = rng(opts.seed ?? 1);
    const fixes = [...FIXES].sort(() => rand() - 0.5);
    const st = Object.fromEntries(STOPS.map((id) => [id, { built: id === "repo", q: [] } as StopSim])) as Record<StopId, StopSim>;
    return {
      rand, fixes, st,
      t: 0, phase: "build" as StoryPhase, phaseT: 0,
      spawnEvery: 0, spawnT: 0, nextId: 1, shipped: 0,
      budget: null as number | null, // how many crates Review may still pass. null = no limit
      reviewSvc: SVC.review,
      approvals: 0, card: null as CardView | null, laterUntil: 0,
      autoReview: false, jam: null as StopId | null, nextJam: null as StopId | null,
      shippy: { pose: "folded", at: "corner" } as ShippyView,
      caption: null as string | null, captionAt: 0,
      timers: [] as { at: number; fn: () => void }[],
      script: [] as Step[], stepT: 0, // the running step is script[0]; stepT = seconds into it
      size: "small" as DeckSize,
      island: "none" as NonNullable<DeckView["deck"]>["island"], islandProgress: undefined as number | undefined,
    };
  }
  const after = (sec: number, fn: () => void) => S.timers.push({ at: S.t + sec, fn });
  const setPhase = (p: StoryPhase) => { S.phase = p; S.phaseT = 0; };
  const nextBuilt = (i: number) => { for (let j = i + 1; j < STOPS.length; j++) if (S.st[STOPS[j]].built) return STOPS[j]; return null; };

  function spawn() {
    if (S.st.review.q.length >= PILE_CAP) return;
    // Beat 1 is about the line being built, not a pile: keep a few crates on it while the island rises.
    if (S.phase === "build" && STOPS.reduce((n, id) => n + S.st[id].q.length, 0) >= 3) return;
    const title = `Fix ${S.fixes[S.nextId % S.fixes.length]}`;
    S.st.repo.q.push({ id: `story-${S.nextId++}`, title, look: "plain", t: 0, approved: false });
  }

  // Review only passes a crate once you've called it (budget), until Shippy takes it over.
  const reviewOpen = () => S.budget == null || S.budget > 0;

  function flow(dt: number) {
    for (let i = STOPS.length - 1; i >= 0; i--) {
      const id = STOPS[i], s = S.st[id];
      if (!s.built) continue;
      const front = s.q[0];
      if (!front) continue;
      if (id === "review" && !reviewOpen()) { front.t = 0; continue; }
      front.t += dt;
      const svc = id === "review" ? S.reviewSvc : SVC[id];
      if (front.t < svc) continue;
      if (id === "launch") { s.q.shift(); S.shipped++; continue; }
      const to = nextBuilt(i);
      if (!to) continue; // finished, nowhere to go yet: it waits inside its machine
      s.q.shift();
      if (id === "review" && S.budget != null) { S.budget--; front.approved = true; }
      front.t = 0;
      S.st[to].q.push(front);
    }
    // Looks: plain until checks pass, green after, red bands while stuck waiting on a call, glowing at the front.
    const passed = STOPS.indexOf("checks");
    STOPS.forEach((id, i) => {
      for (const c of S.st[id].q) c.look = i > passed || c.approved ? "ok" : "plain";
    });
    if (S.st.review.built && !reviewOpen()) {
      S.st.review.q.forEach((c, k) => { c.look = k === 0 && S.card ? "glow" : "wait"; });
    }
  }

  function showCall() {
    const n = S.approvals, left = 3 - n;
    S.card = {
      id: `${STORY_CARD.call}${n + 1}`,
      title: `Approve ${S.st.review.q[0]?.title?.toLowerCase().replace(/^fix /, "fix for ") ?? "this fix"}?`,
      dots: { have: n, need: 3 },
      line: n === 0 ? "Swipe right and it moves." : left === 1 ? "Approve 1 more like this and it's automatic." : `Approve ${left} more like this and it's automatic.`,
      stop: "review",
    };
    S.shippy = { pose: "peek", at: "corner" };
  }

  // Beat 1: the line builds itself, piece by piece, then the first crates roll.
  const beat1 = (): Step[] => [
    // The repo is already on the deck: it's yours, the factory gets built around it.
    { rest: 0.6 }, { say: "Software is a factory." }, { rest: SAY_SEC },
    { say: "Ideas land in your repo." },
    ...built("planner", "A planner picks the next one."),
    ...built("builder", "A builder writes the code."),
    { grow: "medium" }, { rest: REST_SEC },
    ...built("checks", "Checks catch what's broken."),
    { island: true }, { rest: REST_SEC }, { say: "And then it ships." },
    { run: () => { S.spawnEvery = 2.2; S.spawnT = 2.2; } },
    { until: () => S.shipped >= 1 }, { say: "Ideas in, rockets out." }, { rest: REST_SEC },
  ];
  // Beat 2: the line drains and goes still, Review and Gate build in, then the pile starts.
  const beat2 = (): Step[] => [
    { run: () => { setPhase("bottleneck"); S.budget = 0; } },
    { grow: "large" }, { rest: REST_SEC },
    // Gate first, so the pile only starts once Review (the call) is on the line.
    { build: "gate" }, { rest: REST_SEC },
    { build: "review" }, { rest: REST_SEC },
    { say: "There's always a bottleneck." }, { rest: SAY_SEC },
    { run: () => { S.spawnEvery = 1.2; } },
    { until: () => S.st.review.q.length >= 2 },
    { run: () => { S.jam = "review"; S.shippy = { pose: "peek", at: "corner" }; } },
    { say: "Right now, it's waiting on your call." }, { rest: SAY_SEC },
  ];

  function play(dt: number) {
    const cur = S.script[0];
    if (!cur) return;
    const first = S.stepT === 0;
    S.stepT += dt;
    let done = false;
    const making = "build" in cur || "grow" in cur || "island" in cur;
    // A caption gets its SAY_SEC even if a build starts under it, then clears so nothing reads over the build.
    if (making && S.caption && S.t - S.captionAt >= SAY_SEC) S.caption = null;
    if ("say" in cur) { S.caption = cur.say; S.captionAt = S.t; done = true; }
    else if ("build" in cur) { if (first) S.st[cur.build].built = true; done = S.stepT >= BUILD_SEC; }
    else if ("grow" in cur) { if (first) S.size = cur.grow; done = S.stepT >= GROW_SEC; }
    else if ("island" in cur) {
      if (first) S.island = "building";
      S.islandProgress = Math.min(1, S.stepT / ISLAND_SEC);
      if (S.islandProgress >= 1) { S.island = "built"; S.islandProgress = undefined; S.st.launch.built = true; done = true; }
    }
    else if ("rest" in cur) done = S.stepT >= cur.rest;
    else if ("until" in cur) done = cur.until();
    else { cur.run(); done = true; }
    if (done) { S.script.shift(); S.stepT = 0; }
  }
  const idle = () => S.script.length === 0;

  function director() {
    const p = S.phase;
    if (p === "build") {
      if (idle()) S.script.push(...beat2());
      return;
    }
    if (p === "bottleneck" && idle() && S.st.review.q.length >= CALL_PILE) { setPhase("swipe"); showCall(); return; }
    if (p === "swipe" && !S.card && S.laterUntil > 0 && S.t >= S.laterUntil) { S.laterUntil = 0; showCall(); }
  }

  function goAuto() {
    setPhase("automatic");
    S.card = null;
    S.budget = null; S.reviewSvc = 0.35; S.jam = null; S.autoReview = true;
    S.spawnEvery = 1.0;
    S.caption = "Same kind, three times. Shippy's got it.";
    S.shippy = { pose: "unfold", at: "corner" };
    after(1.4, () => { S.shippy = { pose: "walking", at: "review" }; });
    after(3.0, () => { S.shippy = { pose: "lever", at: "review" }; S.caption = "Review runs itself now."; });
    after(4.4, () => { S.shippy = { pose: "happy", at: "review" }; });
    after(6.4, () => {
      setPhase("next-jam");
      S.caption = "You're free to fix the next jam.";
      S.nextJam = "checks"; S.jam = "checks";
    });
    after(10, () => {
      setPhase("end");
      S.caption = null;
      S.card = {
        id: STORY_CARD.connect,
        title: "That's your repo. Want to see the real one?",
        dots: null,
        line: "Connect GitHub and this deck runs on your real code.",
        stop: "repo",
        yes: "See my repo",
        no: "Replay",
        setup: true,
      };
    });
  }

  function step(dt: number) {
    // Fixed small steps keep the sim the same at any frame rate or speed.
    while (dt > 0) {
      const h = Math.min(dt, 0.05);
      dt -= h;
      S.t += h; S.phaseT += h;
      if (S.spawnEvery > 0) { S.spawnT += h; while (S.spawnT >= S.spawnEvery) { S.spawnT -= S.spawnEvery - (S.rand() - 0.5) * 0.3; spawn(); } }
      play(h);
      flow(h);
      const due = S.timers.filter((x) => S.t >= x.at);
      S.timers = S.timers.filter((x) => S.t < x.at);
      for (const x of due) x.fn();
      director();
    }
    fns.forEach((fn) => fn());
  }

  function view(): DeckView {
    const stops = STOPS.map((id) => {
      const s = S.st[id];
      const automated = id === "review" && S.autoReview;
      let state: DeckView["stops"][number]["state"] = s.q.length ? "working" : "idle";
      let waiting: string | undefined;
      if (id === "review" && s.built && !reviewOpen() && s.q.length) { state = "jammed"; waiting = "REVIEW WAITING"; }
      if (automated) state = "auto";
      if (id === S.nextJam) { state = "jammed"; waiting = "CHECKS WAITING"; }
      return { id, built: s.built, state, automated, items: s.q.map(({ id, title, look }) => ({ id, title, look })), ...(waiting ? { waiting } : {}) };
    });
    return {
      stops, jam: S.jam, card: S.card ? { ...S.card } : null, shippy: { ...S.shippy }, shipped: S.shipped, caption: S.card ? null : S.caption,
      deck: {
        size: S.size, island: S.island,
        ...(S.islandProgress != null ? { islandProgress: S.islandProgress } : {}),
      },
    };
  }

  function approve(cardId: string) {
    if (!S.card || S.card.id !== cardId) return;
    if (cardId === STORY_CARD.connect) { (opts.onConnect ?? connect)(); return; }
    S.approvals++;
    S.card = null;
    // Each yes releases a batch of the pile, quickly, so the swipe visibly moves the line.
    S.budget = (S.budget ?? 0) + Math.max(3, Math.ceil(S.st.review.q.length * 0.6));
    S.reviewSvc = 0.25;
    S.shippy = { pose: "happy", at: "corner" };
    if (S.approvals >= 3) { goAuto(); return; }
    S.caption = S.approvals === 1 ? "Swipe, and it moves." : "One more like this and it's automatic.";
    after(0.9, () => { S.shippy = { pose: "folded", at: "corner" }; });
    after(3.2, () => { if (S.phase === "swipe" && !S.card) showCall(); });
  }

  function later(cardId: string) {
    if (!S.card || S.card.id !== cardId) return;
    if (cardId === STORY_CARD.connect) { reset(); return; } // Later on the last card plays the story again
    S.card = null;
    S.caption = "It'll wait. Nothing moves there until you call it.";
    S.shippy = { pose: "folded", at: "corner" };
    S.laterUntil = S.t + 4;
  }

  function reset() { S = fresh(); S.script = beat1(); fns.forEach((fn) => fn()); }
  reset();

  return {
    view, step, approve, later, reset,
    phase: () => S.phase,
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
  };
}
