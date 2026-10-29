import { STOPS, type DeckSource, type DeckView, type Item, type ShippyView, type StopId } from "../contract";
import { FLIGHT_SECONDS } from "../launch/flight";

/** Replays the full visual flight without creating or merging a real PR. */
export function createLaunchDemo(): DeckSource {
  let shipped = 0, age = Infinity, revision = 0;
  return {
    step: dt => { age += dt; },
    view: () => ({
      stops: STOPS.map(id => ({ id, built: true, state: "idle", automated: false, items: [] })),
      jam: null, shippy: { at: "corner", pose: "idle" }, shipped, caption: null,
      card: age > FLIGHT_SECONDS + 1 ? {
        id: `flight-${revision}`, title: "Launch and return", line: "Ignition, liftoff, correction jets, soft touchdown.",
        dots: null, stop: "launch", yes: "Launch rocket", no: "Keep parked",
      } : null,
    }),
    approve: () => { shipped++; revision++; age = 0; },
    later: () => { revision++; age = 0; },
  };
}

/** Manual visual check on the same deck: ?source=orb-demo. No live actions. */
export function createOrbDemo(): DeckSource {
  let blocked = true;
  let revision = 0;
  return {
    view: () => ({
      stops: STOPS.map((id) => ({ id, built: true, state: blocked && id === "review" ? "jammed" : "idle", automated: false, items: [] })),
      jam: blocked ? "review" : null,
      card: {
        id: `orb-demo-${revision}`, stop: "review", dots: null, title: blocked ? "Review is blocked" : "The line is clear",
        line: blocked ? "The core flashes red. Clear the block to restore cyan." : "The core is cyan again. Block the line to replay.",
        yes: blocked ? "Clear block" : "Block again", no: "Keep this state",
      },
      shippy: { at: "corner", pose: "idle" }, shipped: 0, caption: null,
    }),
    approve: () => { blocked = !blocked; revision++; },
    later: () => { revision++; },
  };
}

// A stand-in source so the engine has something to draw until story/ lands: the line builds itself, review
// starts waiting on your call, three yeses make it automatic. story/ replaces this; keep it dumb.
export function createDemo(): DeckSource {
  const SVC: Record<StopId, number> = { repo: 0.2, planner: 1, builder: 1.1, checks: 0.9, review: 0.6, gate: 0.4, launch: 0.6 };
  const SHOW: Record<StopId, number> = { repo: 0, planner: 1, builder: 1, checks: 2, review: 3, gate: 3, launch: 0 };
  const q: Record<StopId, (Item & { t: number; approved?: boolean })[]> = Object.fromEntries(STOPS.map((s) => [s, []])) as never;
  let t = 0, spawnT = 0.5, n = 0, shipped = 0, approvals = 0, auto = false, laterUntil = 0;
  let caption: string | null = "Software is a factory.", captionT = 3;
  let shippy: ShippyView = { pose: "folded", at: "corner" }, poseT = 0;
  const built = (s: StopId) => shipped >= SHOW[s];
  const next = (s: StopId) => STOPS.slice(STOPS.indexOf(s) + 1).find(built)!;
  const say = (c: string) => { caption = c; captionT = 3; };
  const waitingAtReview = () => built("review") && !auto && q.review[0] && !q.review[0].approved;

  function step(dt: number) {
    t += dt;
    captionT -= dt; if (captionT <= 0) caption = null;
    poseT -= dt; if (poseT <= 0 && shippy.at === "review" && shippy.pose !== "unfold") shippy = { pose: "walking", at: "review" };
    if (shippy.pose === "unfold" && poseT <= 0) shippy = { pose: "walking", at: "review" };
    spawnT -= dt;
    const total = STOPS.reduce((m, s) => m + q[s].length, 0);
    if (spawnT <= 0 && total < (built("review") ? 7 : 1)) { q.repo.push({ id: "c" + ++n, look: "plain", t: 0 }); spawnT = built("review") ? 2.2 : 0.5; }
    for (const s of [...STOPS].reverse()) {
      if (!built(s) || !q[s].length) continue;
      const head = q[s][0];
      if (s === "review" && !auto && !head.approved) { head.look = "wait"; continue; }
      head.t += dt;
      if (head.t < SVC[s]) continue;
      q[s].shift(); head.t = 0;
      if (s === "launch") {
        shipped++;
        if (shipped === 1) say("And then it ships.");
        if (shipped === 1) setTimeout(() => say("Ideas become code."), 1200);
        if (shipped === 2) say("Code gets checked.");
        if (shipped === 3) say("There's always a bottleneck.");
        continue;
      }
      if (s === "checks") head.look = "ok";
      if (s === "review" && auto) { shippy = { pose: "lever", at: "review" }; poseT = 0.5; }
      q[next(s)].push(head);
    }
  }
  function view(): DeckView {
    const jam: StopId | null = waitingAtReview() ? "review" : null;
    const card = jam && t > laterUntil ? {
      id: q.review[0].id, stop: "review" as StopId,
      title: ["Approve fix for checkout bug?", "Approve fix for login typo?", "Approve fix for broken link?"][approvals % 3],
      dots: { have: approvals, need: 3 },
      line: approvals === 0 ? "It's waiting on your call." : `Approve ${3 - approvals} more like this and it's automatic.`,
    } : null;
    const corner: ShippyView = card ? { pose: "peek", at: "corner" } : shippy;
    return {
      stops: STOPS.map((id) => {
        const b = built(id), items = q[id];
        const state = !b ? "idle" : id === jam ? "jammed" : auto && (id === "review" || id === "gate") ? "auto" : items.length && id !== "launch" ? "working" : "idle";
        return { id, built: b, state, automated: auto && id === "review", items: items.map(({ id, look }) => ({ id, look })), waiting: id === jam ? "REVIEW WAITING" : undefined };
      }),
      jam, card, shippy: shippy.at === "corner" ? corner : shippy, shipped, caption: card ? null : caption,
    };
  }
  return {
    view, step,
    approve(id) {
      const head = q.review[0]; if (!head || head.id !== id) return;
      head.approved = true; head.look = "ok"; approvals++;
      if (approvals === 1) say("Swipe, and it moves.");
      if (approvals >= 3) {
        auto = true; shippy = { pose: "unfold", at: "review" }; poseT = 1.3;
        for (const i of q.review) i.approved = true;
        say("Shippy's got it. You're free for the next jam.");
      } else { shippy = { pose: "happy", at: "corner" }; poseT = 0.9; setTimeout(() => { if (shippy.pose === "happy") shippy = { pose: "folded", at: "corner" }; }, 900); }
    },
    later() { laterUntil = t + 6; say("Okay. It'll wait."); },
  };
}
