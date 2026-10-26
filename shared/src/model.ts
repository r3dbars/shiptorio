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
});
export type FactoryState = z.infer<typeof FactoryState>;
