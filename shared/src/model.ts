// The factory's state, shared by server, runner and web. The server owns it;
// everyone else only reads it or asks for changes through protocol messages.

import { z } from "zod";

// Science colors double as the kind of work an item is.
export const ItemKind = z.enum(["bug", "feature", "cleanup", "tests"]);
export type ItemKind = z.infer<typeof ItemKind>;

export const OreSource = z.enum(["github_issue", "sentry", "inbox", "lint"]);
export type OreSource = z.infer<typeof OreSource>;

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

export const Item = z.object({
  id: z.string(),
  kind: ItemKind,
  source: OreSource,
  title: z.string(),
  body: z.string().optional(),
  url: z.string().optional(),
  district: z.string(), // top-level folder the work lands in, "/" for the root
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
export const Stage = z.enum(["intake", "triage", "build", "inspect", "pad", "release", "impact", "power"]);
export type Stage = z.infer<typeof Stage>;

// Who did something. Every Spark action carries its reason so the player can ask "why".
export const Actor = z.enum(["spark", "player", "system"]);
export type Actor = z.infer<typeof Actor>;

export const Bottleneck = z.object({
  stage: Stage,
  wip: z.number().int(), // items waiting there
  ageMs: z.number(), // oldest item's wait
  throughputPerHour: z.number(),
  valueAtRisk: z.number(), // sum of item value waiting there
  summary: z.string(), // one line with real numbers: "3 PRs waiting on review for 9h"
});
export type Bottleneck = z.infer<typeof Bottleneck>;

export const MoveOption = z.object({
  id: z.string(),
  label: z.string(), // button text: "Review #41", "Fix at high effort"
  recommended: z.boolean().default(false), // exactly one option is Spark's pick
});
export type MoveOption = z.infer<typeof MoveOption>;

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
});
export type Move = z.infer<typeof Move>;

export const DistrictTrust = z.object({
  district: z.string(),
  score: z.number().min(0).max(1),
  risk: z.enum(["low", "medium", "high"]),
  permit: z.boolean(), // Spark may launch PRs here on its own
});
export type DistrictTrust = z.infer<typeof DistrictTrust>;

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
});
export type Metrics = z.infer<typeof Metrics>;

// What the Foreman drone is doing on the map right now.
export const Foreman = z.object({
  targetId: z.string().optional(), // machine or item id it flies to
  tool: z.string().optional(), // last Spark tool call, e.g. "triage"
  thinking: z.boolean().default(false), // a Spark call is in flight
});
export type Foreman = z.infer<typeof Foreman>;

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
  districtTrust: z.array(DistrictTrust).optional(),
  metrics: Metrics.optional(),
  foreman: Foreman.optional(),
});
export type FactoryState = z.infer<typeof FactoryState>;
