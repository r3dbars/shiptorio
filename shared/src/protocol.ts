// Every message on the wire. Both lanes build against this file; change it in a PR both see.

import { z } from "zod";
import { Belt, District, FactoryState, Harness, Item, Machine, MachineType, PowerSource, Science } from "./model";

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
});
export type Patch = z.infer<typeof Patch>;

export const LogLevel = z.enum(["info", "warn", "error", "success"]);

export const ServerToWeb = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), state: FactoryState }),
  z.object({ type: z.literal("patch"), patch: Patch }),
  z.object({ type: z.literal("log"), level: LogLevel, text: z.string(), at: z.number(), itemId: z.string().optional() }),
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
  z.object({ type: z.literal("connect_belt"), from: z.string(), to: z.string(), carries: Belt.shape.carries }),
  z.object({ type: z.literal("set_module"), machineId: z.string(), module: z.string() }),
  z.object({ type: z.literal("launch_pr"), itemId: z.string() }),
  z.object({ type: z.literal("route_item"), itemId: z.string(), machineId: z.string() }), // drag ore onto a machine
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
