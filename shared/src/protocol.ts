// Every message on the wire. Both lanes build against this file; change it in a PR both see.

import { z } from "zod";
import { HoldingBack } from "./signals";
import { GoalId, Goals } from "./goals";
import {
  Actor,
  Autonomy,
  AutonomyLevel,
  Belt,
  Bottleneck,
  Brain,
  District,
  Experiment,
  FactoryState,
  Foreman,
  Harness,
  Item,
  Machine,
  MachineType,
  Metrics,
  Move,
  PowerSource,
  Science,
  Research,
  Station,
  SourceKind,
  SourceStatus,
  SupportTicket,
} from "./model";

// ---------- server → web ----------

export const Patch = z.object({
  items: z.array(Item).optional(), // upserts
  machines: z.array(Machine).optional(),
  belts: z.array(Belt).optional(),
  districts: z.array(District).optional(), // full replacement when present
  power: z.array(PowerSource).optional(),
  removed: z.array(z.object({ kind: z.enum(["item", "machine", "belt"]), id: z.string() })).optional(),
  science: Science.optional(),
  trust: z.number().optional(),
  tick: z.number().int().optional(),
  goal: z.string().optional(),
  goals: Goals.optional(),
  bottleneck: Bottleneck.nullable().optional(),
  holdingBack: HoldingBack.nullable().optional(),
  autonomy: Autonomy.optional(), // full replacement when present
  metrics: Metrics.optional(),
  foreman: Foreman.optional(),
  brain: Brain.optional(), // full replacement when present
  sources: z.array(SourceStatus).optional(), // full replacement when present
  stations: z.array(Station).optional(), // full replacement when present
  research: Research.optional(), // full replacement when present
  support: z.array(SupportTicket).optional(), // full replacement when present
  experiments: z.array(Experiment).optional(), // full replacement when present
});
export type Patch = z.infer<typeof Patch>;

export const LogLevel = z.enum(["info", "warn", "error", "success"]);

export const ServerToWeb = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), state: FactoryState }),
  z.object({ type: z.literal("patch"), patch: Patch }),
  z.object({
    type: z.literal("log"),
    level: LogLevel,
    text: z.string(),
    at: z.number(),
    itemId: z.string().optional(),
    actor: Actor.optional(), // "spark" lines show in Spark's voice
    tool: z.string().optional(), // the Spark tool call behind this line, e.g. "link_items"
    reason: z.string().optional(), // why Spark did it
    actionId: z.string().optional(), // set when the action can be undone
    approvedBy: z.enum(["player", "autonomy"]).optional(), // who let a Spark action through
  }),
  z.object({ type: z.literal("move"), move: Move }), // a new Next Move card (replaces the open one)
  z.object({ type: z.literal("move_resolved"), moveId: z.string(), optionId: z.string().optional(), actor: Actor }),
  z.object({ type: z.literal("deck"), deck: z.array(Move).max(12) }), // the check-in deck changed (replaces it)
  // The unlock moment. With district, that district earned (or lost) its launch permit.
  z.object({ type: z.literal("autonomy_unlocked"), level: AutonomyLevel, district: z.string().optional(), text: z.string() }),
]);
export type ServerToWeb = z.infer<typeof ServerToWeb>;

// ---------- web → server ----------

export const WebToServer = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("place_machine"),
    machineType: MachineType,
    x: z.number().int(),
    y: z.number().int(),
    harness: Harness.optional(),
    district: z.string().optional(),
  }),
  z.object({ type: z.literal("remove_machine"), id: z.string() }),
  // Make it yours (docs/PRODUCT.md, Onboarding): move a machine, or pick which agent runs an assembler.
  z.object({ type: z.literal("move_machine"), id: z.string(), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("set_harness"), machineId: z.string(), harness: Harness }),
  z.object({ type: z.literal("connect_belt"), from: z.string(), to: z.string(), carries: Belt.shape.carries }),
  z.object({ type: z.literal("set_module"), machineId: z.string(), module: z.string() }),
  z.object({ type: z.literal("launch_pr"), itemId: z.string() }),
  z.object({ type: z.literal("route_item"), itemId: z.string(), machineId: z.string() }), // drag ore onto a machine
  // a cart's callout: Rush (front of its queue), Park (set aside, stops taking the line) or none (back in line)
  z.object({ type: z.literal("set_priority"), itemId: z.string().max(80), priority: z.enum(["rush", "park", "none"]) }),
  z.object({ type: z.literal("choose_move"), moveId: z.string(), optionId: z.string() }), // a Next Move button
  // Check-in swipes (docs/PRODUCT.md "Check-in"). Right is choose_move with the recommended option.
  z.object({ type: z.literal("defer_move"), moveId: z.string() }), // left: later, back next check-in
  // down: never. why: once = just this one, kind = stop this kind (a rule), spark = Spark decides these, wrong = Spark misread it (a scar)
  z.object({ type: z.literal("dismiss_move"), moveId: z.string(), why: z.enum(["once", "kind", "spark", "wrong"]) }),
  z.object({ type: z.literal("undo"), actionId: z.string() }),
  // Turn autonomy up to an unlocked level or back down. With district, permit sets that district's launch permit.
  z.object({ type: z.literal("set_autonomy"), level: AutonomyLevel.optional(), district: z.string().optional(), permit: z.boolean().optional() }),
  z.object({ type: z.literal("set_goal"), text: z.string().max(200) }),
  // Pick goals (shared/src/goals.ts) from Make it yours, most important first.
  z.object({ type: z.literal("set_goals"), picks: z.array(GoalId).min(1).max(3) }),
  // A station panel button. stationId is a Station id, or "rework" / a power source id for those panels.
  z.object({ type: z.literal("station_action"), stationId: z.string(), action: z.string() }),
  z.object({ type: z.literal("connect_source"), kind: SourceKind }),
  // Spend science packs on a tech in the research tree. Its station joins the gauntlet right after CI.
  z.object({ type: z.literal("research"), tech: z.string().max(40) }),
  z.object({ type: z.literal("disconnect_source"), kind: SourceKind }),
  // Support mine. Send names the exact draft the player saw (its hash); a changed draft needs a new tap.
  z.object({ type: z.literal("send_reply"), ticketId: z.string().max(80), draftHash: z.string().max(80) }),
  z.object({ type: z.literal("edit_reply"), ticketId: z.string().max(80), text: z.string().min(1).max(4000) }),
  z.object({ type: z.literal("file_issue"), ticketId: z.string().max(80) }),
  z.object({ type: z.literal("close_ticket"), ticketId: z.string().max(80) }),
]);
export type WebToServer = z.infer<typeof WebToServer>;

// ---------- runner ↔ server ----------

export const RunnerToServer = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    mode: z.enum(["local", "hosted"]),
    harnesses: z.array(Harness),
    powerSources: z.array(PowerSource.pick({ kind: true, name: true })),
  }),
  z.object({
    type: z.literal("job_event"),
    jobId: z.string(),
    kind: z.enum(["status", "output", "error"]),
    text: z.string(),
  }),
  z.object({
    type: z.literal("job_done"),
    jobId: z.string(),
    ok: z.boolean(),
    branch: z.string().optional(),
    summary: z.string().optional(),
  }),
]);
export type RunnerToServer = z.infer<typeof RunnerToServer>;

export const ServerToRunner = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("job_assign"),
    jobId: z.string(),
    repo: z.string(),
    baseSha: z.string(),
    token: z.string(), // short-lived installation token, scoped to the repo
    harness: Harness,
    task: z.object({ title: z.string(), body: z.string(), district: z.string(), failure: z.string().optional() }),
  }),
]);
export type ServerToRunner = z.infer<typeof ServerToRunner>;
