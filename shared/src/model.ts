// The factory's state, shared by server, runner and web. The server owns it;
// everyone else only reads it or asks for changes through protocol messages.

import { z } from "zod";
import { HoldingBack } from "./signals";

// Science colors double as the kind of work an item is.
export const ItemKind = z.enum(["bug", "feature", "cleanup", "tests"]);
export type ItemKind = z.infer<typeof ItemKind>;

export const OreSource = z.enum(["github_issue", "sentry", "posthog", "inbox", "lint"]);
export type OreSource = z.infer<typeof OreSource>;

// "email" is the support mine: inbound support email and Intercom chats (docs/context/support-mine.md).
export const SourceKind = z.enum(["github", "sentry", "posthog", "email", "stripe", "claude", "chatgpt"]);
export type SourceKind = z.infer<typeof SourceKind>;
export const SourceStatus = z.object({
  kind: SourceKind,
  state: z.enum(["not_connected", "needs_action", "connected", "error"]),
  detail: z.string(),
  lastEventAt: z.number().optional(),
  eventsToday: z.number().int().nonnegative().default(0),
  setup: z.object({ steps: z.array(z.string()), actionUrl: z.string().url().optional() }),
});
export type SourceStatus = z.infer<typeof SourceStatus>;

export const OreChunk = z.object({
  fingerprint: z.string(),
  count: z.number().int().positive(),
  firstSeen: z.number(),
  lastSeen: z.number(),
  severity: z.number().positive(),
  usersAffected: z.number().int().nonnegative(),
  reporters: z.array(z.string()),
  linked: z.array(z.string()),
  hints: z.array(z.string()),
  rawRefs: z.array(z.string()),
  paying: z.boolean().default(false),
});
export type OreChunk = z.infer<typeof OreChunk>;

export const QualityTier = z.enum(["normal", "uncommon", "rare", "epic", "legendary"]);
export const Inspection = z.object({
  headSha: z.string(),
  state: z.enum(["pending", "passed", "rework"]),
  quality: QualityTier.optional(),
  stages: z.array(z.object({
    gate: z.enum(["ci", "verify", "ai", "human"]),
    state: z.enum(["pending", "passed", "rework"]),
    reason: z.string(),
  })),
  // Researched checks (shared/src/research.ts). They run right after CI, cheapest first, before the verify bay.
  checks: z.array(z.object({ id: z.string(), state: z.enum(["pending", "passed", "rework"]), reason: z.string() })).optional(),
  humanApproved: z.boolean().default(false),
});
export type Inspection = z.infer<typeof Inspection>;

export const ItemState = z.enum(["ore", "queued", "working", "inspecting", "rejected", "passed", "on_pad", "launched"]);
export type ItemState = z.infer<typeof ItemState>;

// Who an item hurts. Spark fills this in during triage; it's what makes priorities real.
export const CustomerContext = z.object({
  usersAffected: z.number().int().default(0), // Sentry users, PostHog sessions on the route
  reporters: z.array(z.string()).default([]), // email senders, issue authors
  linked: z.array(z.string()).default([]), // item ids that are the same problem
  paying: z.boolean().optional(),
});
export type CustomerContext = z.infer<typeof CustomerContext>;

// The verification gauntlet (docs/LOOP.md): CI inspector → verify bay → AI review → merge gate → orbit watch.
// Inspection.stages gate names map onto these: ci → ci, verify → verify, ai → review, human → merge.
export const StationKind = z.enum(["ci", "verify", "review", "merge", "orbit", "custom", "measure"]);
export type StationKind = z.infer<typeof StationKind>;

// Why a fail rode the rework belt back to Spark. Spark re-plans with it; third strike goes to the player.
export const ScarTag = z.object({
  station: StationKind,
  reason: z.string(), // "crash still repros with an empty cart"
  evidenceUrl: z.string().optional(), // CI log, repro, review comment
  strike: z.number().int().min(1), // 1, 2, 3
  at: z.number().optional(),
  check: z.string().optional(), // the researched check that caught it, when station is "custom"
});
export type ScarTag = z.infer<typeof ScarTag>;

// Orbit watch: the last station. For 24h after a launch it watches the real world. A comeback (the same Sentry
// error, a new error spike on that folder, a revert PR, main going red on the merge commit) scars the item,
// sends it back on the rework belt and revokes its lane's launch permit.
export const OrbitSignal = z.enum(["sentry", "revert", "deploy"]);
export type OrbitSignal = z.infer<typeof OrbitSignal>;
export const OrbitWatch = z.object({
  since: z.number(), // launch time
  until: z.number(), // watch ends
  mergeSha: z.string().optional(), // the commit on main the deploy and CI run on
  state: z.enum(["watching", "clear", "regressed"]),
  signal: OrbitSignal.optional(), // what tripped it
  reason: z.string().optional(), // "Sentry #8812 fired again 3h after the launch"
  evidenceUrl: z.string().optional(),
  at: z.number().optional(), // when it cleared or regressed
  prNumber: z.number().int().optional(), // the launched PR (the item gets a new one on rework)
});
export type OrbitWatch = z.infer<typeof OrbitWatch>;

export const Item = z.object({
  id: z.string(),
  kind: ItemKind,
  source: OreSource,
  title: z.string(),
  body: z.string().optional(),
  url: z.string().optional(),
  district: z.string(), // top-level folder the work lands in, "/" for the root
  lane: z.string().optional(), // the launch-permit lane its PR's files fall in ("docs", a folder); none = always asks
  state: ItemState,
  machineId: z.string().optional(),
  branch: z.string().optional(),
  prNumber: z.number().int().optional(),
  prUrl: z.string().optional(),
  failure: z.string().optional(), // why the inspector rejected it
  attempts: z.number().int().default(0),
  updatedAt: z.number(),
  customer: CustomerContext.optional(),
  value: z.number().optional(), // Spark's weight for this item; drives the bottleneck math
  ore: OreChunk.optional(),
  inspection: Inspection.optional(),
  scars: z.array(ScarTag).optional(), // every fail so far, newest last
  orbit: OrbitWatch.optional(), // set at launch; orbit watch's verdict on the last launch
  priority: z.enum(["rush", "park"]).optional(), // the player's Rush or Park from the cart's callout (shared/src/priority.ts)
});
export type Item = z.infer<typeof Item>;

export const MachineType = z.enum([
  "ore_deposit",
  "splitter",
  "assembler",
  "inspector",
  "launch_pad",
  "turret",
  "solar",
  "battery",
  "steam",
  "geothermal",
]);
export type MachineType = z.infer<typeof MachineType>;

// Who does the work inside an assembler (or splitter).
export const Harness = z.enum(["spark", "claude_code", "codex", "cursor", "grok", "local"]);
export type Harness = z.infer<typeof Harness>;

export const MachineState = z.enum(["idle", "working", "blocked"]);
export type MachineState = z.infer<typeof MachineState>;

export const Machine = z.object({
  id: z.string(),
  type: MachineType,
  x: z.number().int(),
  y: z.number().int(),
  district: z.string().optional(),
  harness: Harness.optional(),
  powerId: z.string().optional(),
  tier: z.number().int().min(1).max(3).default(1),
  state: MachineState.default("idle"),
  module: z.string().optional(),
});
export type Machine = z.infer<typeof Machine>;

export const Belt = z.object({
  id: z.string(),
  from: z.string(), // machine id
  to: z.string(), // machine id
  carries: ItemKind.optional(), // typed belt; undefined carries anything
});
export type Belt = z.infer<typeof Belt>;

export const District = z.object({
  name: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
  files: z.number().int(),
});
export type District = z.infer<typeof District>;

export const PowerKind = z.enum(["solar", "steam", "geothermal"]);
export const PowerSource = z.object({
  id: z.string(),
  kind: PowerKind,
  name: z.string(), // "Muse Spark", "Claude", "Mac (MLX)"
  level: z.number().min(0).max(1), // battery charge or credit headroom
  online: z.boolean(),
});
export type PowerSource = z.infer<typeof PowerSource>;

export const Science = z.object({
  red: z.number().int(), // bug fixes
  green: z.number().int(), // features
  grey: z.number().int(), // cleanup
  blue: z.number().int(), // tests added
});
export type Science = z.infer<typeof Science>;

export { SCIENCE_FOR } from "./science";

// ---------- the foreman layer (docs/PRODUCT.md) ----------

// The pipeline stages the bottleneck engine scores.
// "resources": nothing can build because no subscription is plugged in.
export const Stage = z.enum(["intake", "triage", "build", "inspect", "pad", "release", "impact", "power", "resources"]);
export type Stage = z.infer<typeof Stage>;

// Who did something. Every Spark action carries its reason so the player can ask "why".
export const Actor = z.enum(["spark", "player", "system"]);
export type Actor = z.infer<typeof Actor>;

export const Bottleneck = z.object({
  stage: Stage,
  stationId: z.string().optional(), // when the jam is at one gauntlet station, it glows on the map
  wip: z.number().int(), // items waiting there
  ageMs: z.number(), // oldest item's wait
  throughputPerHour: z.number(),
  valueAtRisk: z.number(), // sum of item value waiting there
  summary: z.string(), // one line with real numbers: "3 PRs waiting on review for 9h"
});
export type Bottleneck = z.infer<typeof Bottleneck>;

// A Spark tool call waiting on the player. Saying yes to the option applies it.
export const MoveAction = z.object({
  tool: z.string(), // e.g. "start_job"
  args: z.record(z.string(), z.unknown()),
  reason: z.string(),
});
export type MoveAction = z.infer<typeof MoveAction>;

export const MoveOption = z.object({
  id: z.string(),
  label: z.string(), // button text: "Review #41", "Send to Claude Code"
  recommended: z.boolean().default(false), // exactly one option is Spark's pick
  actions: z.array(MoveAction).default([]), // what Spark will do on yes; empty for "skip" or a link out
});
export type MoveOption = z.infer<typeof MoveOption>;

// What a move does for the loop. The check-in deck favors verify, input and automate (docs/PRODUCT.md "Check-in").
// "reply" is a drafted customer reply: only a player tap sends it, at every autonomy level.
export const MoveKind = z.enum(["unblock", "build", "verify", "input", "automate", "ship", "review", "reply"]);
export type MoveKind = z.infer<typeof MoveKind>;

// One gauntlet stamp on a card: a station that passed, failed or never ran.
export const MoveEvidence = z.object({
  station: z.string(), // "CI", "Verify bay", or a Station id
  ok: z.boolean(),
  note: z.string().optional(), // "repro'd, then gone"
});
export type MoveEvidence = z.infer<typeof MoveEvidence>;

// The Next Move card: the one thing holding the factory back, and 1 to 3 ways to act on it.
export const Move = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string(), // who it hurts
  options: z.array(MoveOption).min(1).max(3),
  stage: Stage.optional(),
  itemId: z.string().optional(),
  url: z.string().optional(), // e.g. the PR to review
  createdAt: z.number(),
  // Check-in deck fields. All optional; a plain Next Move card ignores them.
  kind: MoveKind.optional(),
  focus: z.string().optional(), // station, machine or district id the map zooms to on tap
  grows: z.array(z.string()).optional(), // what yes adds to the loop: "+1 CHECK", "+1 SOURCE"
  evidence: z.array(MoveEvidence).optional(), // gauntlet stamps on a merge card
  locked: z.boolean().optional(), // not proven yet: swipe right runs the recommended option, never a merge
  plan: z.array(z.string()).optional(), // what happens on yes, step by step (details sheet)
  because: z.string().optional(), // one plain sentence on why the suggested option is the right call
  attention: z.enum(["approve", "steer", "suggest"]).optional(), // docs/ATTENTION.md: approve = parked on a yes, steer = stuck, suggest = an idea
});
export type Move = z.infer<typeof Move>;

export const DistrictTrust = z.object({
  district: z.string(),
  score: z.number().min(0).max(1),
  risk: z.enum(["low", "medium", "high"]),
  permit: z.boolean(), // Spark may launch PRs here on its own
});
export type DistrictTrust = z.infer<typeof DistrictTrust>;

// Autonomy is earned by playing (docs/PRODUCT.md). Spark asks first at "advisor".
// "launch" is per district: it's DistrictTrust.permit, never a factory-wide level.
export const AutonomyLevel = z.enum(["advisor", "floor", "build", "lights_out"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

export const Autonomy = z.object({
  level: AutonomyLevel,
  districts: z.array(DistrictTrust),
  next: z
    .object({
      level: AutonomyLevel,
      have: z.number().int(), // e.g. 7 floor moves approved as-is
      need: z.number().int(), // e.g. 10
      label: z.string(), // "floor moves approved without a change"
    })
    .nullable(), // null at the top level
  ranAlone: z.number().int().default(0), // actions this week Spark took without asking
  automated: z.number().min(0).max(1).optional(), // share of rockets that launched on a permit
  launches: z.number().int().nonnegative().optional(), // rockets counted toward automated
});
export type Autonomy = z.infer<typeof Autonomy>;

// HUD numbers. Every one is a real metric with a game skin.
export const Metrics = z.object({
  rockets: z.number().int(), // PRs merged
  leadTimeMs: z.number().optional(), // ore → merged, median this week
  bitersKilled: z.number().int(), // Sentry issues resolved after a release
  escapedDefects: z.number().int(),
  customersAnswered: z.number().int(),
  usersUnblocked: z.number().int(),
  costPerRocket: z.number().optional(), // credits
  shipScore: z.number(), // users unblocked + 10 × customers answered + rockets − 25 × escaped defects
  checkouts: z.number().int().optional(), // demo shop "checkout completed" counter (Stripe test mode)
});
export type Metrics = z.infer<typeof Metrics>;

// What the Foreman drone is doing on the map right now.
export const Foreman = z.object({
  targetId: z.string().optional(), // machine or item id it flies to
  tool: z.string().optional(), // last Spark tool call, e.g. "triage"
  thinking: z.boolean().default(false), // a Spark call is in flight
});
export type Foreman = z.infer<typeof Foreman>;

// One decision the planner made, for the "how it thinks" panel. Every Spark call lands here,
// and so does every time a rule had to stand in because Spark was down or unconfigured.
export const ThoughtDecision = z.enum(["triage", "scope", "plan", "review", "next_move", "rank", "orbit", "research", "permit", "support", "route", "growth", "diagnose"]);
export type ThoughtDecision = z.infer<typeof ThoughtDecision>;
export const Thought = z.object({
  id: z.string(),
  at: z.number(),
  decision: ThoughtDecision,
  by: z.enum(["spark", "fallback"]), // fallback = a fixed rule decided because Spark couldn't
  model: z.string(), // e.g. "muse-spark-1.3"
  ms: z.number(), // how long the call took
  itemId: z.string().optional(),
  title: z.string(), // what it looked at: "Checkout button does nothing on Safari"
  outcome: z.string(), // what it decided: "bug → web"
  reason: z.string(), // why, in its own words
  simulated: z.boolean().optional(), // sim mode only; never set by the live server
});
export type Thought = z.infer<typeof Thought>;
export const Brain = z.object({
  model: z.string(),
  online: z.boolean(), // the Meta key is set
  decisions: z.number().int(), // Spark decisions since the factory started counting
  fallbacks: z.number().int(),
  thoughts: z.array(Thought).max(40), // newest first
  // The scorecard: how good its calls turn out, not just how many it makes.
  score: z.object({
    plans: z.number().int(), // distinct jobs it planned
    shipped: z.number().int(), // of those, merged and launched
    reviews: z.number().int(), // PR verdicts it gave
    catches: z.number().int(), // of those, sent back for rework
    open: z.array(z.string()), // outstanding planned items must not lose eventual launch credit
  }).optional(),
});
export type Brain = z.infer<typeof Brain>;

export interface Scorecard { planSuccess: number | null; catchRate: number | null; fallbackRate: number | null; plans: number; shipped: number; reviews: number; catches: number }

/** Plan success, review catch rate and fallback share, as 0..1 (null until there's something to measure). */
export function scorecard(brain: Brain | undefined): Scorecard {
  const sc = brain?.score ?? { plans: 0, shipped: 0, reviews: 0, catches: 0 };
  const total = (brain?.decisions ?? 0) + (brain?.fallbacks ?? 0);
  return {
    // Jobs still on the line count as not shipped yet, so the rate only climbs as PRs merge.
    planSuccess: sc.plans ? sc.shipped / sc.plans : null,
    catchRate: sc.reviews ? sc.catches / sc.reviews : null,
    fallbackRate: total ? (brain?.fallbacks ?? 0) / total : null,
    plans: sc.plans, shipped: sc.shipped, reviews: sc.reviews, catches: sc.catches,
  };
}

// A station action is a Next Move option scoped to one station (docs/LOOP.md "Click any station").
export const StationAction = z.object({
  id: z.string(),
  label: z.string(), // "Build a second verify bay"
  recommended: z.boolean().default(false), // Spark's pick
});
export type StationAction = z.infer<typeof StationAction>;

export const Station = z.object({
  id: z.string(),
  kind: StationKind,
  name: z.string(), // "Verify bay"
  machineId: z.string().optional(), // the machine on the map that is this station
  districts: z.array(z.string()).optional(), // districts whose launch permit needs it; absent = all
  wip: z.number().int(), // items in line
  oldestWaitMs: z.number().optional(),
  passRate: z.number().min(0).max(1).optional(), // this week
  caughtThisWeek: z.number().int(), // bugs it stopped before shipping; only goes up
  lastLog: z.object({ who: z.string(), text: z.string(), ok: z.boolean() }).optional(),
  actions: z.array(StationAction).max(3).default([]),
});
export type Station = z.infer<typeof Station>;

// The research tree (docs/LOOP.md "Players add checks"). Shipped PRs are science packs; spending them unlocks
// new gauntlet stations that really run on every PR. The catalog and rules live in shared/src/research.ts.
export const Research = z.object({
  done: z.array(z.string()), // researched tech ids, in the order they were unlocked
  spent: z.number().int().nonnegative(), // science packs spent so far
  suggest: z.object({ tech: z.string(), why: z.string() }).optional(), // the planner's pick, from repeated scars
});
export type Research = z.infer<typeof Research>;

// ---------- the support mine (docs/context/support-mine.md) ----------

// One customer conversation from support email or Intercom. Spark sorts it, links it to the work it's about
// and drafts a reply. Nothing reaches the customer until the player taps Send on that exact draft.
export const SupportChannel = z.enum(["email", "intercom"]);
export type SupportChannel = z.infer<typeof SupportChannel>;
export const SupportKind = z.enum(["bug", "feature", "question", "praise", "spam"]);
export type SupportKind = z.infer<typeof SupportKind>;
export const SupportDraft = z.object({
  text: z.string().max(4000),
  hash: z.string(), // Send carries this, so only the draft the player saw goes out
  purpose: z.enum(["answer", "fixed"]), // first answer, or "we shipped the fix"
  by: z.enum(["spark", "fallback", "player"]),
  at: z.number(),
});
export type SupportDraft = z.infer<typeof SupportDraft>;
export const SupportTicket = z.object({
  id: z.string(),
  channel: SupportChannel,
  thread: z.string(), // email thread root or Intercom conversation id, so a reply lands in the same conversation
  replyTo: z.string().optional(), // the newest customer message id; an email reply threads onto it
  from: z.string(), // the customer's address or Intercom contact; never leaves the factory except in the reply
  name: z.string().optional(),
  subject: z.string(),
  body: z.string(), // latest customer message
  messages: z.number().int().positive(), // customer messages on this thread so far
  receivedAt: z.number(),
  paying: z.boolean().optional(),
  state: z.enum(["new", "drafted", "waiting_fix", "answered", "closed"]),
  triage: z.object({
    kind: SupportKind,
    district: z.string(),
    summary: z.string(), // one plain line: "Checkout crashes with an empty cart"
    reason: z.string(),
    linkedItemId: z.string().optional(), // the factory item it's about (a Sentry error, an issue)
    by: z.enum(["spark", "fallback"]),
  }).optional(),
  draft: SupportDraft.optional(),
  // via "outbox": no mail sender is connected, so the reply is kept here (text) for the player to copy.
  sent: z.array(z.object({ at: z.number(), purpose: z.enum(["answer", "fixed"]), via: z.enum(["email", "intercom", "outbox"]), text: z.string().max(4000).optional() })).default([]),
  issue: z.object({ number: z.number().int(), url: z.string() }).optional(), // filed from this ticket
});
export type SupportTicket = z.infer<typeof SupportTicket>;
// The growth loop (shared/src/growth.ts, docs/context/growth-loop.md). A funnel step from PostHog drops, the
// planner proposes one small experiment, it ships through the gauntlet, and the measure station calls the result.
export const FunnelStep = z.object({
  from: z.string(), // route people enter on: "/cart"
  to: z.string(), // route that counts as converting: "/checkout"
  label: z.string(), // "/cart → /checkout"
});
export type FunnelStep = z.infer<typeof FunnelStep>;
export const ExperimentChange = z.enum(["copy", "cta", "onboarding", "layout"]);
export type ExperimentChange = z.infer<typeof ExperimentChange>;
export const ExperimentVerdict = z.enum(["too_early", "lift", "no_lift", "hurt", "inconclusive"]);
export type ExperimentVerdict = z.infer<typeof ExperimentVerdict>;
const StepCounts = z.object({ entered: z.number().int().nonnegative(), converted: z.number().int().nonnegative(), days: z.number().int().nonnegative() }).refine(c => c.converted <= c.entered, "Converted people must belong to the entered cohort");
export const Experiment = z.object({
  id: z.string(),
  step: FunnelStep,
  title: z.string(), // "Clearer checkout button on /cart"
  hypothesis: z.string(), // what should happen and by how much
  change: ExperimentChange,
  district: z.string(), // where the PR lands
  // proposed → building (yes on the card) → measuring (launched) → won / flat / lost; dropped = player said no
  state: z.enum(["proposed", "building", "measuring", "won", "flat", "lost", "dropped", "inconclusive"]),
  itemId: z.string().optional(), // the factory item that ships it
  prNumber: z.number().int().optional(),
  baseline: StepCounts, // the step before the change
  after: StepCounts.optional(), // the step since the launch
  windowDays: z.number().int().positive(),
  daysWatched: z.number().nonnegative().optional(),
  lift: z.number().optional(), // relative, 0.16 = +16%
  p: z.number().min(0).max(1).optional(),
  verdict: ExperimentVerdict.optional(),
  line: z.string().optional(), // the measure station's plain sentence
  proposedAt: z.number(),
  launchedAt: z.number().optional(),
  decidedAt: z.number().optional(),
});
export type Experiment = z.infer<typeof Experiment>;

export const FactoryState = z.object({
  repo: z.string(),
  baseBranch: z.string(),
  districts: z.array(District),
  machines: z.array(Machine),
  belts: z.array(Belt),
  items: z.array(Item),
  power: z.array(PowerSource),
  science: Science,
  trust: z.number().min(0).max(1),
  tick: z.number().int(),
  // Foreman layer. Optional so servers and sims that don't send it yet still validate.
  goal: z.string().optional(),
  bottleneck: Bottleneck.nullable().optional(),
  holdingBack: HoldingBack.nullable().optional(), // the bottleneck brain's pick (docs/BRAIN.md), behind the "brain" flag
  move: Move.nullable().optional(), // the open Next Move card
  deck: z.array(Move).max(12).optional(), // the check-in deck, ranked; deck[0] is the open card
  autonomy: Autonomy.optional(),
  metrics: Metrics.optional(),
  foreman: Foreman.optional(),
  brain: Brain.optional(), // the planner's decision log (powered by Meta Muse Spark)
  sources: z.array(SourceStatus).optional(),
  stations: z.array(Station).optional(), // the gauntlet, in line order
  research: Research.optional(),
  support: z.array(SupportTicket).max(60).optional(), // newest first
  experiments: z.array(Experiment).max(20).optional(), // the growth loop, newest first
});
export type FactoryState = z.infer<typeof FactoryState>;
