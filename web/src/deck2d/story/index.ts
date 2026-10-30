// The scripted first run on the 2D deck (thread "Build the first-run story on the deck").
// A DeckSource with no server: it plays Justin's locked story (2026-10-28) on the real line, ported from /story-b.
// North star: open it, see your one bottleneck within ~5s, swipe once, it clears. So the first card lands ~10s in:
//   1 Software is a factory: a small working line is already running, crates roll, rockets go up.
//   2 There's always a bottleneck: crates pile at Review, waiting on your call ("REVIEW WAITING"). Never "the
//     bottleneck is you".
//   3 Swipe, and it moves: approving releases the pile and rockets launch. The reward: a Gate builds in.
//   4 Approve twice more and it's automatic: Shippy unfolds, walks to Review, takes the lever. One crate then rolls the
//     whole line with no card, its rocket goes up, and the camera zooms out: the line is one island among six, the
//     other five light up and go dark again (reveal.ts, city/SPEC.md). The last card asks you to start with your repo.
// ONE thing moves at a time (Justin, 2026-10-28: "shit flashing and pinging all over the place"): build-outs are a
// strict serial script, each plays to the end, then a short rest; the line pauses new crates while one plays.
// Pure sim: no DOM, no canvas. The engine draws view() and animates crates by item id.
import { STAGE_AT } from "../build/build";
import { GROW_SECONDS } from "../grow/index";
import { LAUNCH_BUILD_SECONDS } from "../launch/timeline";
import { CITY_COPY, STOPS, type CardView, type DeckSource, type DeckView, type Item, type ShippyView, type StopId } from "../contract";
import type { AttentionView } from "../stations/attention";
import { revealAt } from "./reveal";
import { FEEL } from "../feel";

export interface StoryOptions {
  seed?: number; // same seed, same story (crate titles, spawn jitter)
  speed?: number; // accepted for the contract's signature; the page already scales dt by ?speed
  swipes?: number; // 1: the short front-door version, end right after the first swipe clears the jam (default 3)
  onConnect?(): void; // the last card's yes: "Sign in with GitHub" (the short story: "See my repo"). Default: go to the app to sign in
  reducedMotion?: boolean; // prefers-reduced-motion: the city reveal plays as cuts (camera cuts, all five islands at once)
  startAt?: "reveal"; // start the full story at the city reveal (shots, recording takes); ignored by the short story
}

export type StoryPhase = "build" | "bottleneck" | "swipe" | "automatic" | "reveal" | "end";

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
const FIXES = ["login typo", "broken docs link", "button label", "footer link", "empty state copy", "page title"];
const CALL_PILE = 3; // crates waiting at Review before the first card slides up
const PREROLL = 0.5; // startAt "reveal": seconds of a running line before the hero rocket goes up
const PILE_CAP = 9; // stop adding crates past this so the heap stays readable

// The small working line the story opens on: everything but the Gate, island up. Whenever the island is up the deck
// must be large, or the bridge hangs over open sky past the deck's end.
const START: StopId[] = ["repo", "planner", "builder", "checks", "review", "launch"];

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
    const st = Object.fromEntries(STOPS.map((id) => [id, { built: START.includes(id), q: [] } as StopSim])) as Record<StopId, StopSim>;
    return {
      rand, fixes, st,
      t: 0, phase: "build" as StoryPhase, phaseT: 0,
      spawnEvery: 1, spawnT: 0.9, nextId: 1, shipped: 0,
      budget: 2 as number | null, // how many crates Review may still pass (the first two ship). null = no limit
      reviewSvc: SVC.review,
      approvals: 0, card: null as CardView | null, laterUntil: 0, asked: [] as string[], // crate titles already on a card
      autoReview: false, jam: null as StopId | null,
      shippy: { pose: "folded", at: "corner" } as ShippyView,
      caption: null as string | null, captionAt: 0,
      timers: [] as { at: number; fn: () => void }[],
      script: [] as Step[], stepT: 0, // the running step is script[0]; stepT = seconds into it
      size: "large" as DeckSize, lastCallAt: -99,
      island: "built" as NonNullable<DeckView["deck"]>["island"], islandProgress: undefined as number | undefined,
      follow: null as string | null, // the crate the camera rides along with (beat 4's no-card crate)
      watch: null as StopId | null, // where the camera parks while Shippy takes the lever (rockets would pull it away)
      pace: 1, // > 1 slows every stop, so the one no-card crate reads on camera
      revealT: null as number | null, // seconds since reveal t = 0 (the no-card crate left Launch); null = not started
      shippedFrozen: null as number | null, // view.shipped from reveal t = 0 on: no more rockets under the city
    };
  }
  const after = (sec: number, fn: () => void) => S.timers.push({ at: S.t + sec, fn });
  const setPhase = (p: StoryPhase) => { S.phase = p; S.phaseT = 0; };
  const nextBuilt = (i: number) => { for (let j = i + 1; j < STOPS.length; j++) if (S.st[STOPS[j]].built) return STOPS[j]; return null; };
  const onLine = (id: string) => STOPS.some((s) => S.st[s].q.some((c) => c.id === id)); // a crate until it leaves the Launch queue

  function spawn() {
    if (S.st.review.q.length >= PILE_CAP) return;
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
      const svc = (id === "review" ? S.reviewSvc : SVC[id]) * S.pace;
      if (front.t < svc) continue;
      if (id === "launch") { s.q.shift(); S.shipped++; continue; }
      const to = nextBuilt(i);
      if (!to) continue; // finished, nowhere to go yet: it waits inside its machine
      s.q.shift();
      if (id === "review" && S.budget != null) { S.budget--; front.approved = true; }
      front.t = 0;
      S.st[to].q.push(front);
    }
    // Looks: plain until checks pass, green after, yellow while waiting on your call.
    const passed = STOPS.indexOf("checks");
    STOPS.forEach((id, i) => {
      for (const c of S.st[id].q) c.look = i > passed || c.approved ? "ok" : "plain";
    });
    if (S.st.review.built && !reviewOpen()) {
      for (const c of S.st.review.q) c.look = "wait";
    }
  }

  function showCall() {
    const n = S.approvals, left = 3 - n;
    // Titles cycle, so the third call could repeat the first. Each call names a different fix.
    const head = S.st.review.q[0];
    if (head?.title && S.asked.includes(head.title)) {
      const unused = S.fixes.map(f => `Fix ${f}`).find(t => !S.asked.includes(t));
      if (unused) head.title = unused;
    }
    if (head?.title && !S.asked.includes(head.title)) S.asked.push(head.title);
    S.card = {
      id: `${STORY_CARD.call}${n + 1}`,
      title: `Approve ${S.st.review.q[0]?.title?.toLowerCase().replace(/^fix /, "fix for ") ?? "this fix"}?`,
      dots: { have: n, need: 3 },
      line: n === 0 ? "Swipe right and it moves." : left === 1 ? "Approve 1 more like this and it's automatic." : `Approve ${left} more like this and it's automatic.`,
      stop: "review",
    };
    S.shippy = { pose: "peek", at: "corner" };
  }

  // Beats 1-2: the line is running; it jams at Review within a few seconds.
  const opening = (): Step[] => [
    { rest: 0.4 }, { say: "Software is a factory." }, { rest: SAY_SEC },
    { until: () => S.shipped >= 1 }, { say: "There's always a bottleneck." }, { rest: SAY_SEC },
    { until: () => S.st.review.q.length >= 2 },
    { run: () => { setPhase("bottleneck"); S.jam = "review"; S.shippy = { pose: "peek", at: "corner" }; } },
    { say: "Right now, it's waiting on your call." }, { rest: SAY_SEC },
  ];
  // The first swipe's reward: the released crates ship, then the line goes still while a Gate builds in. Then crates
  // roll again and pile for the next call.
  const reward = (): Step[] => [
    { until: () => !STOPS.slice(STOPS.indexOf("review") + 1).some((id) => S.st[id].q.length) && S.st.review.q.every((c) => !c.approved) },
    { run: () => { S.spawnEvery = 0; } }, { rest: REST_SEC },
    { build: "gate" }, { rest: REST_SEC },
    { say: "The line grows as you go." }, { rest: SAY_SEC },
    { run: () => { S.spawnEvery = 1; S.spawnT = 0.9; } },
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
    if (p === "bottleneck" && idle() && S.st.review.q.length >= CALL_PILE) { setPhase("swipe"); showCall(); return; }
    // The next call: once the pile is back and nothing is building, a beat after the last swipe.
    if (p === "swipe" && !S.card && !S.laterUntil && idle() && S.approvals > 0 && S.t - S.lastCallAt >= 3 && S.st.review.q.length >= CALL_PILE) showCall();
    if (p === "swipe" && !S.card && S.laterUntil > 0 && S.t >= S.laterUntil) { S.laterUntil = 0; showCall(); }
    if (p === "automatic" && S.follow && !onLine(S.follow)) beginReveal(); // it shipped this sub-step: reveal t = 0
    if (p === "reveal" && S.revealT == null && S.t >= PREROLL - 1e-9) { S.shipped++; beginReveal(); } // startAt: the hero rocket
  }

  // Beat 4, the climax: the third yes hands Review to Shippy, and the next crate rolls the whole line with no card while
  // the camera rides along. One thing at a time: Shippy takes the lever (the AUTOMATED stamp lands), the pile drains,
  // then the one crate nobody had to call. When it leaves Launch its rocket goes up and the city reveal takes over
  // (beginReveal), ending on the last card.
  function goAuto() {
    setPhase("automatic");
    S.card = null;
    S.spawnEvery = 0; S.jam = null; S.watch = "review"; // the third yes already released a batch; nothing new until Shippy has the lever
    S.caption = "Same kind, three times."; S.captionAt = S.t;
    S.shippy = { pose: "unfold", at: "corner" };
    S.script.push(
      { rest: 1.4 }, { run: () => { S.shippy = { pose: "walking", at: "review" }; } },
      { rest: 1.6 }, { run: () => { S.shippy = { pose: "lever", at: "review" }; S.autoReview = true; S.budget = null; S.reviewSvc = 0.35; } },
      { say: "Review runs itself now." }, { rest: 1.4 }, { run: () => { S.shippy = { pose: "happy", at: "review" }; } },
      { until: () => !STOPS.some((id) => S.st[id].q.length) }, { rest: REST_SEC },
      { run: () => { S.watch = null; S.pace = 1.6; S.follow = `story-${S.nextId}`; spawn(); S.caption = "Shippy's got these now. No card."; S.captionAt = S.t; } },
    ); // director() starts the reveal the moment that crate has left Launch
  }

  // Reveal t = 0 (SPEC section 1): the hero rocket goes up. From here the story only drives the city (revealAt). The line
  // keeps rolling, calmer; Review stays Shippy's; Shippy stays on the line's island; no further rocket ever launches.
  function beginReveal() {
    setPhase("reveal");
    S.revealT = 0; S.shippedFrozen = S.shipped;
    S.follow = null; S.watch = null; S.jam = null; S.pace = 1;
    S.spawnEvery = 1.6; S.spawnT = S.spawnEvery - 0.1; // the first crate rolls at once
    S.shippy = { pose: "happy", at: "review" };
  }

  // One sub-step of the reveal clock; the caption follows the beat, and at the end the sign-in card slides up.
  function tickReveal(h: number) {
    if (S.phase !== "reveal" || S.revealT == null) return;
    S.revealT += h;
    const r = revealAt(S.revealT, !!opts.reducedMotion, CITY_COPY.repo);
    if (r.caption !== undefined) S.caption = r.caption;
    if (!r.done) return;
    setPhase("end");
    S.card = {
      id: STORY_CARD.connect, title: CITY_COPY.card.title, line: CITY_COPY.card.line, yes: CITY_COPY.card.yes, no: CITY_COPY.card.no,
      setup: true, stop: "repo", dots: null,
    };
  }

  // startAt "reveal": the full story's last minute on its own. Everything is built and Review is Shippy's; PREROLL of a
  // running line, then the hero rocket (shipped goes up, see director) is reveal t = 0 and the city takes over.
  function startAtReveal() {
    for (const id of STOPS) S.st[id].built = true;
    S.autoReview = true; S.budget = null; S.reviewSvc = 0.35;
    S.shippy = { pose: "happy", at: "review" };
    S.spawnEvery = 1.6; S.spawnT = S.spawnEvery - 0.1;
    setPhase("reveal");
  }

  // The short version (a guest at the front door): the one swipe clears the jam, the released crates ship, the line
  // goes still, and the story ends on its connect card so the page can hand over to setup.
  let shippedAt = 0;
  function shortEnd() {
    S.caption = "Swipe, and it moves."; S.captionAt = S.t;
    after(0.9, () => { S.shippy = { pose: "folded", at: "corner" }; });
    S.script.push(
      { run: () => { S.spawnEvery = 0; S.jam = null; S.budget = null; shippedAt = S.shipped; } }, // the whole pile goes, not just a batch
      { until: () => !S.st.review.q.length && S.shipped > shippedAt }, { rest: 0.8 }, // the jam is gone and one ships: enough
      { run: () => {
        setPhase("end");
        S.caption = null;
        S.card = { id: STORY_CARD.connect, title: "Now let's do this with your repo.", dots: null, line: "Connect GitHub and this deck runs on your real code.", stop: "repo", yes: "See my repo", no: "Replay", setup: true };
      } },
    );
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
      tickReveal(h);
      const due = S.timers.filter((x) => S.t >= x.at);
      S.timers = S.timers.filter((x) => S.t < x.at);
      for (const x of due) x.fn();
      director();
    }
    fns.forEach((fn) => fn());
  }

  function view(): AttentionView & { followItem?: string } {
    const stops = STOPS.map((id) => {
      const s = S.st[id];
      const automated = id === "review" && S.autoReview;
      let state: DeckView["stops"][number]["state"] = s.q.length ? "working" : "idle";
      let waiting: string | undefined;
      // Every bottleneck in the story waits on your call, so it's yellow (attention), never red (stuck).
      if (id === "review" && s.built && !reviewOpen() && s.q.length) { state = "idle"; waiting = "REVIEW WAITING"; }
      if (automated) state = "auto";
      return { id, built: s.built, state, automated, items: s.q.map(({ id, title, look }) => ({ id, title, look })), ...(waiting ? { waiting } : {}) };
    });
    const call = S.jam && stops.find((s) => s.id === S.jam)?.waiting ? S.jam : null;
    const city = S.revealT != null ? revealAt(S.revealT, !!opts.reducedMotion, CITY_COPY.repo).city : undefined; // omitted in beat 0
    // Beat 0, the hero rocket (and the startAt preroll before it): the camera cuts to the launch pad (shot "launch") and stays
    // there until beat 1's zoom out takes over, CITY_TIMING.rocket (4.0) seconds in. revealAt leaves `city` out until exactly
    // then (with the same microsecond slack), so a view never has both.
    const rocket = S.phase === "reveal" && !city;
    return {
      stops, jam: null, attention: call ? [call] : [], card: S.card ? { ...S.card } : null, shippy: { ...S.shippy }, shipped: S.shippedFrozen ?? S.shipped, caption: S.card ? null : S.caption,
      ...(S.follow ? { followItem: S.follow } : {}), ...(S.watch ?? S.jam ? { focus: S.watch ?? S.jam! } : {}),
      ...(rocket ? { shot: "launch" as const } : {}),
      deck: {
        size: S.size, island: S.island,
        ...(S.islandProgress != null ? { islandProgress: S.islandProgress } : {}),
      },
      ...(city ? { city } : {}),
    };
  }

  function approve(cardId: string) {
    if (!S.card || S.card.id !== cardId) return;
    if (cardId === STORY_CARD.connect) { (opts.onConnect ?? connect)(); return; }
    S.approvals++;
    S.card = null;
    // Each yes releases a batch of the pile, quickly, so the swipe visibly moves the line.
    // ?feel=jamX (feel.ts): how long Review holds after the yes, how much of the pile goes, how far apart.
    const release = Math.max(3, Math.ceil(S.st.review.q.length * FEEL.jam.batch));
    if (FEEL.jam.hold > 0) after(FEEL.jam.hold, () => { S.budget = (S.budget ?? 0) + release; }); else S.budget = (S.budget ?? 0) + release;
    S.reviewSvc = FEEL.jam.svc;
    S.shippy = { pose: "happy", at: "corner" };
    if (S.approvals >= 3) { goAuto(); return; }
    if (S.approvals >= (opts.swipes ?? 3)) { shortEnd(); return; }
    S.caption = S.approvals === 1 ? "Swipe, and it moves." : "One more like this and it's automatic.";
    S.captionAt = S.t; S.lastCallAt = S.t;
    if (S.approvals === 1) S.script.push(...reward());
    after(0.9, () => { S.shippy = { pose: "folded", at: "corner" }; });
  }

  function later(cardId: string) {
    if (!S.card || S.card.id !== cardId) return;
    if (cardId === STORY_CARD.connect) { reset(); return; } // Later on the last card plays the story again
    S.card = null;
    S.caption = "It'll wait. Nothing moves there until you call it.";
    S.shippy = { pose: "folded", at: "corner" };
    S.laterUntil = S.t + 4;
  }

  function reset() {
    S = fresh();
    if (opts.startAt === "reveal" && (opts.swipes ?? 3) >= 3) startAtReveal(); else S.script = opening();
    fns.forEach((fn) => fn());
  }
  reset();

  return {
    view, step, approve, later, reset,
    phase: () => S.phase,
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
  };
}
