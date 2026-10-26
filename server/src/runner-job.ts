import { z } from "zod";
// Internal HTTP transport; shared browser/runner websocket contracts remain compatible.
export const RunnerHarness = z.enum(["codex", "claude_code"]);
export const EnqueueRunner = z.object({ itemId: z.string().regex(/^gh-\d+$/), harness: RunnerHarness, allowedPaths: z.array(z.string().min(1).max(200)).min(1).max(10) }).strict();
export const RunnerReceipt = z.object({ jobId: z.string().uuid(), lease: z.string().uuid(), ok: z.boolean(), sha: z.string().regex(/^[a-f0-9]{40}$/).optional(), summary: z.string().max(4000), checks: z.array(z.enum(["typecheck", "test", "build"])).max(3) }).strict();
export type RunnerReceipt = z.infer<typeof RunnerReceipt>;
export interface RunnerJob {
  id: string; itemId: string; repo: string; harness: z.infer<typeof RunnerHarness>;
  allowedPaths: string[]; status: "planning" | "ready" | "running" | "completed" | "failed";
  steps?: { tool: string; reason: string; result: string; at: number }[];
  baseSha?: string; baseBranch?: string; branch: string; plan?: string;
  lease?: string; pairId?: string; deadline?: number; prUrl?: string; error?: string;
}
export const runnerPathAllowed = (path: string) => /^[\w./@+-]+$/.test(path)
  && !path.startsWith("/") && !path.includes("..")
  && !path.split("/").some(p => /^(?:\.git.*|\.env.*|\.dev\.vars.*|node_modules|\.wrangler)$/i.test(p))
  && !/\.(?:pem|key|p12|pfx)$/i.test(path);
export function validLease(job: RunnerJob, pairId: string, lease: string, now = Date.now()): boolean {
  return job.status === "running" && job.pairId === pairId && job.lease === lease && !!job.deadline && job.deadline > now;
}
