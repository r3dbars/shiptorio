import { z } from "zod";
import { runnerPathAllowed } from "../../server/src/runner-job";

const path = z.string().min(1).max(200).refine(runnerPathAllowed);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
// Pick executable fields; server-only audit metadata is deliberately stripped.
export const JobAssignment = z.object({
  id: z.string().uuid(), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).transform(repo => repo.toLowerCase()),
  harness: z.enum(["codex", "claude_code", "local"]), baseSha: sha,
  branch: z.string().regex(/^shiptorio\/runner-[a-f0-9-]{36}$/),
  allowedPaths: z.array(path).min(1).max(10), plan: z.string().min(1).max(50000),
  lease: z.string().uuid(), token: z.string().min(1).max(2048), deadline: z.number().int().positive(),
  reworkPr: z.number().int().positive().optional(), verifyBaseSha: sha.optional(),
  refreshBase: z.object({ expectedHeadSha: sha }).strict().optional(),
  prTestFiles: z.array(path).max(100).optional(),
}).superRefine((job, ctx) => {
  if (job.refreshBase && (!job.reworkPr || job.verifyBaseSha !== job.baseSha || job.refreshBase.expectedHeadSha === job.baseSha)) ctx.addIssue({ code: "custom", message: "Invalid approved base refresh" });
});
export type Job = z.infer<typeof JobAssignment>;
/** GitHub owner/repo names are case-insensitive; the approved branch and lease are not. */
export function assertJobAssignment(job: Job, repo: string, now = Date.now()): void {
  if (job.repo.toLowerCase() !== repo.toLowerCase()
    || !/^[a-f0-9]{40}$/.test(job.baseSha)
    || (!job.reworkPr && job.branch !== `shiptorio/runner-${job.id}`
      || !!job.reworkPr && (!Number.isInteger(job.reworkPr) || job.reworkPr < 1 || !/^shiptorio\/runner-[a-f0-9-]{36}$/.test(job.branch)))
    || !/^[a-f0-9-]{36}$/.test(job.id) || job.deadline <= now) throw new Error("Invalid job assignment");
}
export const ClaimResponse = z.object({ job: JobAssignment.nullable() }).strict();
export const RenewResponse = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).max(2048), expires: z.number().int().positive() }).strict();
export const FinishResponse = z.union([
  z.object({ status: z.literal("failed") }).strict(),
  z.object({ prUrl: z.string().url().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/) }).strict(),
]);
export const responseSchemas = { heartbeat: z.object({ ok: z.literal(true) }).strict(), claim: ClaimResponse, renew: RenewResponse, finish: FinishResponse };

/** Friendly terminal copy; raw errors stay out of normal output. */
export function plainRunnerError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (/another Shiptorio server/i.test(text)) return "This runner belongs to another factory; use the setup command from the factory you want to connect.";
  if (/Shiptorio origin|HTTPS Shiptorio/i.test(text)) return "The factory address is not valid; use the HTTPS address from Shiptorio.";
  if (/private Keychain|Keychain.*unlock/i.test(text)) return "Claude could not unlock its saved sign-in.\nshiptorio-runner doctor";
  if (/grant|paired|pairing|re-pair|connection stopped|connection needs|revoked|receipt repository/i.test(text)) return "This computer needs to reconnect to your factory.\nshiptorio-runner pair";
  if (/Install Codex|Assigned harness|CLI installed|unavailable.*agent/i.test(text)) return "Codex is not installed on this computer.\nnpm install -g @openai/codex";
  if (/sign.in|authentication|authorization rejected|invalid_api_key|unauthorized/i.test(text)) return `Sign in to ${/claude/i.test(text) ? "Claude" : "Codex"} again.\nshiptorio-runner login ${/claude/i.test(text) ? "claude" : "codex"}`;
  if (/quota|usage.*limit|rate.*limit|429/i.test(text)) return "Your coding agent has reached its usage limit; try again after it resets.";
  if (/lease expired|deadline/i.test(text)) return "The build ran out of time; approve a new attempt in Shiptorio.";
  if (/scope|approved files|unapproved|history|Non-regular|Unexpected or empty|Regression|base-failing/i.test(text)) return "The build did not pass its safety checks; review it in Shiptorio.";
  if (/network|connection|timed?.?out|HTTP|HTTPS|ECONN|heartbeat/i.test(text)) return "The runner could not connect.\nshiptorio-runner watch";
  if (/Usage:.*doctor/i.test(text)) return "Run a check of this computer.\nshiptorio-runner doctor";
  if (/Usage:.*geothermal/i.test(text)) return "Choose the local model you want to use.\nshiptorio-runner geothermal qwen2.5-coder:7b";
  if (/Expected job UUID/i.test(text)) return "Choose the saved build to retry; find it in Shiptorio first.";
  if (/Local models do not need/i.test(text)) return "Your local model does not need a sign-in.\nshiptorio-runner watch";
  if (/sandbox|permission|operation not permitted/i.test(text)) return "Your computer blocked the runner's safety check.\nshiptorio-runner doctor";
  return "The runner could not finish this step.\nshiptorio-runner doctor";
}

export function runnerCheckLabel(name: string): string {
  if (name.includes("codex")) return "Codex";
  if (name.includes("claude")) return "Claude";
  if (/pair|connect/.test(name)) return "Your factory connection";
  if (/sandbox|platform/.test(name)) return "Your computer's safety checks";
  return "The runner";
}
