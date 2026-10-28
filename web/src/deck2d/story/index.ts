// The scripted first run on the 2D deck (thread "Build the first-run story on the deck").
// A DeckSource with no server: it plays Justin's locked story (2026-10-28) on the real line, ported from /story-b:
//   1 Software is a factory: a small empty deck, stops build in one by one (construction, then a burst), the deck
//     grows, the rocket island rises, crates roll and the first rockets go up.
//   2 There's always a bottleneck: review and gate build in, the line speeds up, crates pile at Review waiting on
//     your call ("REVIEW WAITING"). Never "the bottleneck is you".
//   3 Swipe, and it moves: approving releases the pile and rockets launch.
//   4 Approve twice more and it's automatic: Shippy unfolds, walks to Review, takes the lever. Then the next jam
//     shows up somewhere else, and the last card asks to connect the real repo.
// Pure sim: no DOM, no canvas. The engine draws view() and animates crates by item id.
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

// Construction: one job at a time, each with a visible build-up (Stop.building / deck.growing / islandProgress).
type Job = { kind: "stop"; id: StopId; line?: string } | { kind: "grow"; size: DeckSize; line?: string };
type DeckSize = NonNullable<DeckView["deck"]>["size"];
const JOB_SEC = { stop: 2.4, grow: 1.4 } as const;
const JOB_GAP = 0.8;
// The rocket island has its own build (launch/timeline.ts LAUNCH_BUILD_SECONDS), so it rises in parallel,
// starting as soon as the repo is down. The engine won't launch until it's "built".
const ISLAND_SEC = 12;
const BEAT1: Job[] = [
  { kind: "stop", id: "repo", line: "Ideas land in your repo." },
  { kind: "stop", id: "planner", line: "A planner picks the next one." },
  { kind: "stop", id: "builder", line: "A builder writes the code." },
  { kind: "grow", size: "medium" },
  { kind: "stop", id: "checks", line: "Checks catch what's broken." },
];
const BEAT2: Job[] = [{ kind: "grow", size: "large" }, { kind: "stop", id: "review" }, { kind: "stop", id: "gate" }];
const FIXES = ["login typo", "broken docs link", "button label", "footer link", "empty state copy", "page title"];
const CALL_PILE = 5; // crates waiting at Review before the first card slides up
const PILE_CAP = 9; // stop adding crates past this so the heap stays readable

interface Live extends Item { t: number; approved: boolean }
interface StopSim { built: boolean; q: Live[]; building?: number }

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
    const st = Object.fromEntries(STOPS.map((id) => [id, { built: false, q: [] } as StopSim])) as Record<StopId, StopSim>;
    return {
      rand, fixes, st,
      t: 0, phase: "build" as StoryPhase, phaseT: 0,
      spawnEvery: 0, spawnT: 0, nextId: 1, shipped: 0,
      budget: null as number | null, // how many crates Review may still pass. null = no limit
      reviewSvc: SVC.review,
      approvals: 0, card: null as CardView | null, laterUntil: 0,
      bottleneckQueued: false, autoReview: false, jam: null as StopId | null, nextJam: null as StopId | null,
      shippy: { pose: "folded", at: "corner" } as ShippyView,
      caption: "Software is a factory." as string | null,
      timers: [] as { at: number; fn: () => void }[],
      jobs: [...BEAT1] as Job[], job: null as { job: Job; p: number } | null, jobGap: 0.6,
      size: "small" as DeckSize, growing: undefined as number | undefined,
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

  function raiseIsland(dt: number) {
    if (S.island !== "building") return;
    S.islandProgress = Math.min(1, (S.islandProgress ?? 0) + dt / ISLAND_SEC);
    if (S.islandProgress < 1) return;
    S.island = "built"; S.islandProgress = undefined;
    S.st.launch.built = true; // the pad is on the island
    S.caption = "And then it ships.";
  }

  function construct(dt: number) {
    if (!S.job) {
      if (!S.jobs.length) return;
      S.jobGap -= dt;
      if (S.jobGap > 0) return;
      const job = S.jobs.shift()!;
      S.job = { job, p: 0 };
      if (job.line) S.caption = job.line;
    }
    const { job } = S.job;
    S.job.p = Math.min(1, S.job.p + dt / JOB_SEC[job.kind]);
    const p = S.job.p, done = p >= 1;
    if (job.kind === "stop") {
      S.st[job.id].building = done ? undefined : p;
      if (done) S.st[job.id].built = true;
      if (done && job.id === "repo") { S.spawnEvery = 2.6; S.spawnT = 2.2; S.island = "building"; S.islandProgress = 0; }
    } else {
      S.growing = done ? undefined : p;
      if (done) S.size = job.size;
    }
    if (done) { S.job = null; S.jobGap = JOB_GAP; }
    if (done && !S.jobs.length && S.island === "building" && (S.islandProgress ?? 0) < 0.75) S.caption = "Last piece: somewhere to launch from.";
  }

  function director() {
    const p = S.phase;
    if (p === "build") {
      if (S.shipped >= 1 && S.caption === "And then it ships.") S.caption = "Software is a factory. Ideas in, rockets out.";
      if (S.st.launch.built && S.shipped >= 2 && !S.bottleneckQueued) {
        S.bottleneckQueued = true;
        after(0.6, () => {
          setPhase("bottleneck");
          S.caption = "There's always a bottleneck.";
          S.budget = 0;
          S.jobs.push(...BEAT2); S.jobGap = 0;
          after(5.5, () => { S.caption = "Right now, it's waiting on your call."; S.jam = "review"; S.shippy = { pose: "peek", at: "corner" }; });
          S.spawnEvery = 1.3;
        });
      }
      return;
    }
    if (p === "bottleneck" && S.jam && S.st.review.q.length >= CALL_PILE) { setPhase("swipe"); showCall(); return; }
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
      construct(h);
      raiseIsland(h);
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
      return { id, built: s.built, state, automated, ...(s.building != null ? { building: s.building } : {}), items: s.q.map(({ id, title, look }) => ({ id, title, look })), ...(waiting ? { waiting } : {}) };
    });
    return {
      stops, jam: S.jam, card: S.card ? { ...S.card } : null, shippy: { ...S.shippy }, shipped: S.shipped, caption: S.card ? null : S.caption,
      deck: {
        size: S.size, island: S.island,
        ...(S.growing != null ? { growing: S.growing } : {}),
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

  function reset() { S = fresh(); fns.forEach((fn) => fn()); }

  return {
    view, step, approve, later, reset,
    phase: () => S.phase,
    subscribe(fn) { fns.add(fn); return () => fns.delete(fn); },
  };
}
