import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
const id = z.string().min(1).max(128);
const text = z.string().min(1).max(16000);
export const RepoSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9_.-]+$/).refine((repo) => ![".", ".."].includes(repo.split("/")[1]), "Invalid repository name");
export const HarnessSchema = z.enum(["spark", "claude", "codex", "cursor", "grok", "local"]);
export const PowerSourceSchema = z.enum(["steam", "solar", "geothermal"]);
export const ItemStateSchema = z.enum([
  "ore", "queued", "working", "inspecting", "rejected", "passed", "on_pad", "launched",
]);
export const QualitySchema = z.enum(["normal", "uncommon", "rare", "epic", "legendary"]);
const PositionSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const MachineSchema = z.strictObject({
  id, kind: z.enum(["splitter", "assembler", "inspector", "launch_pad"]),
  position: PositionSchema, harness: HarnessSchema, powerSource: PowerSourceSchema,
  modules: z.array(id).max(16),
});
export const ItemSchema = z.strictObject({
  id, repo: RepoSchema, title: z.string().min(1).max(512),
  source: z.enum(["github_issue", "sentry", "email", "lint"]),
  sourceId: id, state: ItemStateSchema, machineId: id.nullable(),
  quality: QualitySchema.nullable(), failure: text.nullable(),
  pr: z.strictObject({ number: z.number().int().positive(), url: z.url() }).nullable(),
});
export const BeltSchema = z.strictObject({ id, from: id, to: id });
export const FactorySchema = z.strictObject({
  repo: RepoSchema, revision: z.number().int().nonnegative(),
  machines: z.array(MachineSchema), items: z.array(ItemSchema), belts: z.array(BeltSchema),
});

// Web clients and the simulator use these exact payloads. Arrays in a patch replace
// complete collections. Reject a revision gap and fetch a new snapshot before applying.
export const ServerToWebSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("snapshot"), version: z.literal(PROTOCOL_VERSION), factory: FactorySchema }),
  z.strictObject({
    type: z.literal("patch"), version: z.literal(PROTOCOL_VERSION), repo: RepoSchema,
    baseRevision: z.number().int().nonnegative(), revision: z.number().int().positive(),
    changes: z.strictObject({
      machines: z.array(MachineSchema).optional(), items: z.array(ItemSchema).optional(),
      belts: z.array(BeltSchema).optional(),
    }),
  }),
  z.strictObject({
    type: z.literal("log"), version: z.literal(PROTOCOL_VERSION), repo: RepoSchema,
    jobId: id.nullable(), level: z.enum(["info", "warn", "error"]), message: text,
  }),
]);
export const WebToServerSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("place_machine"), machine: MachineSchema }),
  z.strictObject({ type: z.literal("remove_machine"), machineId: id }),
  z.strictObject({ type: z.literal("connect_belt"), belt: BeltSchema }),
  z.strictObject({ type: z.literal("set_module"), machineId: id, modules: z.array(id).max(16) }),
  // Request to open a PR. Only a verified GitHub merge event marks an item launched.
  z.strictObject({ type: z.literal("launch_pr"), itemId: id }),
]);
export const RunnerToServerSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("hello"), version: z.literal(PROTOCOL_VERSION),
    mode: z.enum(["local", "hosted"]), harnesses: z.array(HarnessSchema),
    powerSources: z.array(PowerSourceSchema),
  }),
  z.strictObject({ type: z.literal("job_event"), jobId: id, message: text }),
  z.strictObject({ type: z.literal("job_done"), jobId: id, result: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("passed"), branch: z.string().regex(/^shiptorio\/[A-Za-z0-9_-]+$/), headSha: z.string().regex(/^[a-f0-9]{40}$/) }),
    z.strictObject({ status: z.literal("failed"), failure: text }),
  ]) }),
]);
export const ServerToRunnerSchema = z.strictObject({
  type: z.literal("job_assign"), jobId: id, repo: RepoSchema,
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  token: z.string().min(1), harness: HarnessSchema, task: text,
});
export type Factory = z.infer<typeof FactorySchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Machine = z.infer<typeof MachineSchema>;
export type ServerToWeb = z.infer<typeof ServerToWebSchema>;
export type WebToServer = z.infer<typeof WebToServerSchema>;
export type RunnerToServer = z.infer<typeof RunnerToServerSchema>;
export type ServerToRunner = z.infer<typeof ServerToRunnerSchema>;
