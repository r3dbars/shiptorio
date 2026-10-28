import { gh } from "./github";
import type { RunnerJob } from "./runner-job";

export interface RefreshTarget { headSha: string; baseSha: string; baseBranch: string }
interface RefreshPull {
  state: string; merged: boolean; draft?: boolean; mergeable_state?: string;
  head: { sha: string; ref: string; repo: { full_name: string } | null };
  base: { sha: string; ref: string; repo: { full_name: string } | null };
}
export class RefreshBaseMoved extends Error {}
const sha = /^[a-f0-9]{40}$/;
/** Live identity and target ref, never a model-supplied base or a cached PR snapshot. */
export async function refreshTarget(token: string, repo: string, pr: number, branch: string, baseBranch: string, expected?: RefreshTarget): Promise<RefreshTarget | null> {
  const pull = await gh<RefreshPull>(`/repos/${repo}/pulls/${pr}`, token, { headers: { "cache-control": "no-store" } });
  if (pull.state !== "open" || pull.merged || pull.draft || pull.head.ref !== branch || pull.base.ref !== baseBranch || pull.head.repo?.full_name.toLowerCase() !== repo.toLowerCase() || pull.base.repo?.full_name.toLowerCase() !== repo.toLowerCase() || !sha.test(pull.head.sha) || !sha.test(pull.base.sha)) throw new Error("Factory PR identity changed; request a fresh plan");
  const ref = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${baseBranch}`, token, { headers: { "cache-control": "no-store" } });
  if (ref.object.sha !== pull.base.sha) throw new Error("Factory base changed during validation; request a fresh plan");
  const target = { headSha: pull.head.sha, baseSha: pull.base.sha, baseBranch: pull.base.ref };
  if (expected && (target.headSha !== expected.headSha || target.baseBranch !== expected.baseBranch)) throw new Error("Approved factory head or base changed; request a fresh plan");
  if (expected && target.baseSha !== expected.baseSha) throw new RefreshBaseMoved("Approved factory base changed; request a fresh plan");
  return expected || pull.mergeable_state === "behind" ? target : null;
}

export function ownsRefreshPr(jobs: RunnerJob[], item: { id: string; branch?: string; prNumber?: number }, repo: string, headSha: string): boolean {
  return !!item.prNumber && jobs.some(job => (job.status === "completed" || job.status === "failed" && !!job.refreshBase && !!job.proof?.failsOnBase && !!job.proof?.passesOnHead) && job.repo === repo && job.itemId === item.id && job.branch === item.branch && job.headSha === headSha && job.prUrl === `https://github.com/${repo}/pull/${item.prNumber}` && !!job.approvedAt);
}

export function assertRefreshItem(job: RunnerJob, item: { prNumber?: number; branch?: string }): void {
  if (job.refreshBase && (item.prNumber !== job.reworkPr || item.branch !== job.branch)) throw new Error("Factory item changed PR or branch; request a fresh plan");
}
