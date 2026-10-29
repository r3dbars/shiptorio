import type { FactoryState } from "@shiptorio/shared";
import { starterLine } from "./engine";
import type { TreeEntry } from "./github";
import { layoutMap } from "./map";
import { githubStatus, type GitHubSourceEnv } from "./sources/github";

/** Pure fresh-state construction; the Factory owns access checks, IO and persistence. */
export function initialFactoryState(
  repo: string,
  tree: { branch: string; entries: TreeEntry[] },
  env: GitHubSourceEnv,
): FactoryState {
  return {
    repo,
    baseBranch: tree.branch,
    districts: layoutMap(tree.entries).zones,
    ...starterLine(),
    items: [],
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    trust: 0.5,
    tick: 0,
    sources: [githubStatus(env)],
  };
}


export const ACCESS_RECHECK_MS = 5 * 60_000;
export const ACCESS_LOST_REASON = "GitHub repository access unavailable";
type AccessResult = { stopped: false; checkedAt?: number } | { stopped: true; reason: string; archivedAt?: number };

/** Check durable revocations before any work; periodically catch missed GitHub deliveries.
 * The caller owns the DO pause so this helper never RPCs back into its own factory.
 */
export async function reconcileFactoryGitHubAccess(
  env: import("./repository").RepositoryEnv,
  meta: { repo: string; installationId: number },
  lastCheckedAt?: number,
  now = Date.now(),
  lookup?: () => Promise<{ id: number; suspended_at?: string | null }>,
): Promise<AccessResult> {
  const row = await env.DB.prepare(`SELECT r.archived_at, r.archive_reason, i.status, i.token_version FROM repos r
    LEFT JOIN installations i ON i.id = r.installation_id WHERE lower(r.full_name) = ? AND r.installation_id = ?`)
    .bind(meta.repo.toLowerCase(), meta.installationId).first<{ archived_at: number | null; archive_reason: string | null; status: string | null; token_version: number }>();
  // A real factory has meta; losing its registry row must not resurrect orphaned work.
  if (!row) return { stopped: true, reason: "GitHub repository is not installed" };
  if (row.archived_at != null) return { stopped: true, reason: row.archive_reason ?? ACCESS_LOST_REASON, archivedAt: row.archived_at };
  if (row.status === "suspended") return { stopped: true, reason: "GitHub installation suspended" };
  if (row.status === "deleted") return lost("installation deleted");
  if (lastCheckedAt !== undefined && now - lastCheckedAt < ACCESS_RECHECK_MS) return { stopped: false };
  if (!lookup && (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY)) return { stopped: false };
  const { appJwt, gh, GitHubError, registerGithubCredential } = await import("./github");
  const { RetryExhausted } = await import("./reliability");
  try {
    const current = await (lookup ? lookup() : (async () => {
      const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
      await registerGithubCredential(jwt, env.DB, `github:app:${env.GITHUB_APP_ID}`);
      return gh<{ id: number; suspended_at?: string | null }>(`/repos/${meta.repo}/installation`, jwt);
    })());
    if (current.id !== meta.installationId) return lost(ACCESS_LOST_REASON);
    if (current.suspended_at) {
      const changed = await env.DB.prepare("UPDATE installations SET status = 'suspended', token_version = token_version + 1 WHERE id = ? AND token_version = ?")
        .bind(meta.installationId, row.token_version).run();
      return changed.meta.changes ? { stopped: true, reason: "GitHub installation suspended" } : { stopped: false };
    }
    return { stopped: false, checkedAt: now };
  } catch (error) {
    const cause = error instanceof RetryExhausted ? error.cause : error;
    // 404 is positive absence. Rate limits, credential faults and outages are not revocations.
    if (cause instanceof GitHubError && cause.status === 404) return lost(ACCESS_LOST_REASON);
    throw error;
  }
  async function lost(reason: string): Promise<AccessResult> {
    // A signed restore/permission transition invalidates evidence obtained before it.
    await env.DB.prepare(`UPDATE repos SET archived_at = ?, archive_reason = ? WHERE lower(full_name) = ?
      AND installation_id = ? AND archived_at IS NULL
      AND (SELECT token_version FROM installations WHERE id = ?) = ?`)
      .bind(now, reason, meta.repo.toLowerCase(), meta.installationId, meta.installationId, row!.token_version).run();
    const saved = await env.DB.prepare("SELECT archived_at, archive_reason FROM repos WHERE lower(full_name) = ? AND installation_id = ?")
      .bind(meta.repo.toLowerCase(), meta.installationId).first<{ archived_at: number | null; archive_reason: string | null }>();
    if (saved?.archived_at == null) return { stopped: false };
    await env.DB.prepare("DELETE FROM user_repos WHERE lower(repo) = ? AND installation_id = ?").bind(meta.repo.toLowerCase(), meta.installationId).run();
    return { stopped: true, reason: saved.archive_reason ?? reason, archivedAt: saved.archived_at };
  }
}
