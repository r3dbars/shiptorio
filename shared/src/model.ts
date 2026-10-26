// The factory's state, shared by server, runner and web. The server owns it;
// everyone else only reads it or asks for changes through protocol messages.

import { z } from "zod";

// Science colors double as the kind of work an item is.
export const ItemKind = z.enum(["bug", "feature", "cleanup", "tests"]);
export type ItemKind = z.infer<typeof ItemKind>;

export const OreSource = z.enum(["github_issue", "sentry", "inbox", "lint"]);
export type OreSource = z.infer<typeof OreSource>;

export const SourceKind = z.enum(["github", "sentry", "email", "stripe", "claude", "chatgpt"]);
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
export const StationKind = z.enum(["ci", "verify", "review", "merge", "orbit", "custom"]);
export type StationKind = z.infer<typeof StationKind>;

// Why a fail rode the rework belt back to Spark. Spark re-plans with it; third strike goes to the player.
export const ScarTag = z.object({
  station: StationKind,
  reason: z.string(), // "crash still repros with an empty cart"
  evidenceUrl: z.string().optional(), // CI log, repro, review comment
  strike: z.number().int().min(1), // 1, 2, 3
  at: z.number().optional(),
});
export type ScarTag = z.infer<typeof ScarTag>;

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

export const SCIENCE_FOR: Record<ItemKind, keyof Science> = {
  bug: "red",
  feature: "green",
  cleanup: "grey",
  tests: "blue",
};

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
export const MoveKind = z.enum(["unblock", "build", "verify", "input", "automate", "ship", "review"]);
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
  move: Move.nullable().optional(), // the open Next Move card
  deck: z.array(Move).max(12).optional(), // the check-in deck, ranked; deck[0] is the open card
  autonomy: Autonomy.optional(),
  metrics: Metrics.optional(),
  foreman: Foreman.optional(),
  sources: z.array(SourceStatus).optional(),
  stations: z.array(Station).optional(), // the gauntlet, in line order
});
export type FactoryState = z.infer<typeof FactoryState>;
