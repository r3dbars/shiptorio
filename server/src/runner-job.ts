import { z } from "zod";
// Internal HTTP transport; shared browser/runner websocket contracts remain compatible.
export const RunnerHarness = z.enum(["codex", "claude_code"]);
export const EnqueueRunner = z.object({ itemId: z.string().regex(/^gh-\d+$/), harness: RunnerHarness, allowedPaths: z.array(z.string().min(1).max(200)).min(1).max(10) }).strict();
export const RegressionProof = z.object({ failsOnBase: z.boolean(), passesOnHead: z.boolean(), baseSha: z.string().regex(/^[a-f0-9]{40}$/), headSha: z.string().regex(/^[a-f0-9]{40}$/), command: z.string().max(1000), logTail: z.string().max(3000) }).strict();
export type RegressionProof = z.infer<typeof RegressionProof>;
export const RunnerReceipt = z.object({ jobId: z.string().uuid(), lease: z.string().uuid(), ok: z.boolean(), sha: z.string().regex(/^[a-f0-9]{40}$/).optional(), summary: z.string().max(4000), checks: z.array(z.enum(["typecheck", "test", "build"])).max(3), proof: RegressionProof.optional() }).strict();
export type RunnerReceipt = z.infer<typeof RunnerReceipt>;
export interface RunnerJob {
  id: string; itemId: string; repo: string; harness: z.infer<typeof RunnerHarness>;
  allowedPaths: string[]; status: "planning" | "awaiting_approval" | "ready" | "running" | "completed" | "failed";
  steps?: { tool: string; reason: string; result: string; at: number }[];
  planningStarted?: boolean;
  needsApproval?: boolean;
  approvalMoveId?: string;
  approvedAt?: number;
  inputRevision?: string;
  reworkPr?: number;
  verifyBaseSha?: string;
  prTestFiles?: string[];
  headSha?: string;
  proof?: RegressionProof;
  baseSha?: string; baseBranch?: string; branch: string; plan?: string;
  lease?: string; pairId?: string; deadline?: number; prUrl?: string; error?: string;
}
export { pathAllowed as runnerPathAllowed } from "./injection-policy";
export function validLease(job: RunnerJob, pairId: string, lease: string, now = Date.now()): boolean {
  return job.status === "running" && job.pairId === pairId && job.lease === lease && !!job.deadline && job.deadline > now;
}
export async function issueRevision(title: string, body = ""): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([title, body])));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
}
