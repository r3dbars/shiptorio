import { z } from "zod";
import { runnerPathAllowed } from "../../server/src/runner-job";

const path = z.string().min(1).max(200).refine(runnerPathAllowed);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
// Pick executable fields; server-only audit metadata is deliberately stripped.
export const JobAssignment = z.object({
  id: z.string().uuid(), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  harness: z.enum(["codex", "claude_code", "local"]), baseSha: sha,
  branch: z.string().regex(/^shiptorio\/runner-[a-f0-9-]{36}$/),
  allowedPaths: z.array(path).min(1).max(10), plan: z.string().min(1).max(50000),
  lease: z.string().uuid(), token: z.string().min(1).max(2048), deadline: z.number().int().positive(),
  reworkPr: z.number().int().positive().optional(), verifyBaseSha: sha.optional(),
  prTestFiles: z.array(path).max(100).optional(),
});
export type Job = z.infer<typeof JobAssignment>;
export const ClaimResponse = z.object({ job: JobAssignment.nullable() }).strict();
export const RenewResponse = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).max(2048), expires: z.number().int().positive() }).strict();
export const FinishResponse = z.union([
  z.object({ status: z.literal("failed") }).strict(),
  z.object({ prUrl: z.string().url().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/) }).strict(),
]);
export const responseSchemas = { heartbeat: z.object({ ok: z.literal(true) }).strict(), claim: ClaimResponse, renew: RenewResponse, finish: FinishResponse };
