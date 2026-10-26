import { RetryExhausted } from "./reliability";
import type { SourceStatus } from "@shiptorio/shared";
import { gh, GitHubError, purgeInstallationTokens, repoInstallationId } from "./github";
import { byRepoId, migrateRepository, type RepoRecord, type RepositoryEnv } from "./repository";
import type { GitHubPayload, GitHubRepository } from "./sources/github";

export const RETENTION_MS = 30 * 86400000;
export const lifecycleEvents = ["installation", "installation_repositories", "repository", "github_app_authorization"];
export const REQUIRED_PERMISSIONS = { contents: "write", pull_requests: "write", issues: "write", checks: "read", statuses: "read", metadata: "read" } as const;
export function permissionStatus(id: number, permissions: Record<string, string>, account = "", type = "User"): SourceStatus {
  const missing = Object.entries(REQUIRED_PERMISSIONS).filter(([key, level]) => permissions[key] !== "write" && !(level === "read" && permissions[key] === "read")).map(([key, level]) => `${key}: ${level}`);
  const actionUrl = type === "Organization" ? `https://github.com/organizations/${encodeURIComponent(account)}/settings/installations/${id}` : `https://github.com/settings/installations/${id}`;
  return { kind: "github", state: missing.length ? "needs_action" : "connected", detail: missing.length ? `GitHub permissions missing: ${missing.join(", ")}. Review and accept the requested permissions.` : "GitHub repository connected.", eventsToday: 0, setup: { actionUrl, steps: missing.length ? [`Open this installation's settings and accept: ${missing.join(", ")}.`] : [] } };
}

async function rows(env: RepositoryEnv, installation: number) {
  return (await env.DB.prepare("SELECT * FROM repos WHERE installation_id = ?").bind(installation).all<RepoRecord>()).results;
}
async function objectFor(env: RepositoryEnv, row: RepoRecord, id?: number) {
  if (row.repo_id) return byRepoId(env, row.repo_id);
  if (id) return migrateRepository(env, row, id);
  return env.FACTORY.get(env.FACTORY.idFromName(row.full_name));
}
async function archive(env: RepositoryEnv, row: RepoRecord, reason: string, id?: number) {
  const at = row.archived_at ?? Date.now();
  // Persist first; retries keep the original retention deadline.
  await env.DB.prepare("UPDATE repos SET archived_at = ?, archive_reason = ? WHERE full_name = ? AND installation_id = ?").bind(at, reason, row.full_name, row.installation_id).run();
  await env.DB.prepare("DELETE FROM user_repos WHERE repo = ? AND installation_id = ?").bind(row.full_name, row.installation_id).run();
  await (await objectFor(env, row, id)).archiveGitHub(reason, at, row.full_name, row.installation_id);
}
async function upsert(env: RepositoryEnv, repo: GitHubRepository, installation: number) {
  if (!repo.id) throw new Error("Lifecycle repository ID required");
  const collision = await env.DB.prepare("SELECT * FROM repos WHERE full_name = ? AND repo_id IS NOT NULL AND repo_id <> ?").bind(repo.full_name.toLowerCase(), repo.id).first<RepoRecord>();
  if (collision) {
    await archive(env, collision, "repository name reused", collision.repo_id!);
    await byRepoId(env, collision.repo_id!).retainReferencesById(collision.repo_id!);
  }
  const old = await env.DB.prepare("SELECT * FROM repos WHERE repo_id = ? OR (repo_id IS NULL AND full_name = ?) LIMIT 1").bind(repo.id, repo.full_name.toLowerCase()).first<RepoRecord>();
  const f = old ? await objectFor(env, old, repo.id) : byRepoId(env, repo.id);
  if (old && old.full_name !== repo.full_name.toLowerCase()) {
    await env.DB.batch([env.DB.prepare("UPDATE pull_requests SET repo = ? WHERE repo = ?").bind(repo.full_name.toLowerCase(), old.full_name), env.DB.prepare("UPDATE move_kind_rules SET repo = ? WHERE repo = ?").bind(repo.full_name.toLowerCase(), old.full_name), env.DB.prepare("UPDATE user_repos SET repo = ? WHERE repo = ?").bind(repo.full_name.toLowerCase(), old.full_name)]);
    await env.DB.prepare("UPDATE repos SET full_name = ? WHERE full_name = ?").bind(repo.full_name.toLowerCase(), old.full_name).run();
  }
  await env.DB.prepare("INSERT INTO repos (full_name, repo_id, installation_id, default_branch) VALUES (?, ?, ?, ?) ON CONFLICT(full_name) DO UPDATE SET repo_id = excluded.repo_id, installation_id = excluded.installation_id, default_branch = COALESCE(excluded.default_branch, repos.default_branch), archived_at = NULL, archive_reason = NULL").bind(repo.full_name.toLowerCase(), repo.id, installation, repo.default_branch ?? null).run();
  await f.restoreGitHub(repo.full_name.toLowerCase(), installation, repo.id);
  return f;
}

/** Runs in the durable installation coordinator's queue; deliveries retry on partial failure. */
export async function handleLifecycle(env: RepositoryEnv, event: string, p: GitHubPayload): Promise<void> {
  if (event === "github_app_authorization") {
    if (p.action !== "revoked" || !p.sender?.login) return;
    const affected = await env.DB.prepare("SELECT DISTINCT r.* FROM repos r JOIN user_repos ur ON ur.repo = r.full_name JOIN users u ON u.id = ur.user_id WHERE lower(u.login) = ?").bind(p.sender.login.toLowerCase()).all<RepoRecord>();
    for (const row of affected.results) await (await objectFor(env, row)).revokeGitHubUser(p.sender.login);
    await env.DB.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(login) = ?)").bind(p.sender.login.toLowerCase()).run();
    await env.DB.prepare("DELETE FROM user_repos WHERE user_id IN (SELECT id FROM users WHERE lower(login) = ?)").bind(p.sender.login.toLowerCase()).run();
    await env.DB.prepare("DELETE FROM user_installations WHERE user_id IN (SELECT id FROM users WHERE lower(login) = ?)").bind(p.sender.login.toLowerCase()).run();
    await env.DB.prepare("INSERT INTO github_authorization_revocations (login, revoked_at) VALUES (?, ?) ON CONFLICT(login) DO UPDATE SET revoked_at = excluded.revoked_at").bind(p.sender.login.toLowerCase(), Date.now()).run();
    return;
  }
  const id = p.installation?.id;
  if (!id) throw new Error("Installation ID required");
  purgeInstallationTokens(id);
  await env.DB.prepare("INSERT OR IGNORE INTO installations (id, account_login) VALUES (?, ?)").bind(id, p.installation?.account?.login ?? "").run();
  // Cross-isolate invalidation: every token acquisition/use checks this generation.
  await env.DB.prepare("UPDATE installations SET token_version = token_version + 1 WHERE id = ?").bind(id).run();
  if (event === "repository") {
    const repo = p.repository;
    if (!repo?.id) throw new Error("Repository ID required");
    const previous = (p.changes as { repository?: { name?: { from?: string } }; name?: { from?: string } } | undefined);
    const oldName = previous?.repository?.name?.from ?? previous?.name?.from;
    const legacyName = oldName ? `${repo.full_name.split("/")[0]}/${oldName}`.toLowerCase() : repo.full_name.toLowerCase();
    const row = await env.DB.prepare("SELECT * FROM repos WHERE repo_id = ? OR (repo_id IS NULL AND full_name = ?) LIMIT 1").bind(repo.id, legacyName).first<RepoRecord>();
    if (row && !row.repo_id) await migrateRepository(env, row, repo.id);
    if (p.action === "deleted") { if (row) await archive(env, row, "repository deleted", repo.id); return; }
    if (!["renamed", "transferred"].includes(p.action ?? "")) return;
    // A transfer can remove access or move it to a DIFFERENT installation. Never trust the old ID.
    const current = await repoInstallationId(env, repo.full_name).catch(error => { const cause = error instanceof RetryExhausted ? error.cause : error; if (cause instanceof GitHubError && [403, 404].includes(cause.status)) return null; throw error; });
    if (!current) { if (row) await archive(env, row, "repository transferred out of installation", repo.id); return; }
    await env.DB.prepare("INSERT OR IGNORE INTO installations (id, account_login) VALUES (?, ?)").bind(current, repo.full_name.split("/")[0]).run();
    await upsert(env, repo, current);
    await refreshInstallationPermissions(env, current);
    if (row && p.action === "transferred") await env.DB.prepare("DELETE FROM user_repos WHERE repo = ?").bind(repo.full_name.toLowerCase()).run();
    return;
  }
  const account = p.installation?.account;
  const status = p.action === "deleted" ? "deleted" : p.action === "suspend" ? "suspended" : "active";
  if (event === "installation") {
    if (!["created", "deleted", "suspend", "unsuspend", "new_permissions_accepted"].includes(p.action ?? "")) return;
    await env.DB.prepare("INSERT INTO installations (id, account_login, status, permissions, account_type) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_login = excluded.account_login, status = excluded.status, permissions = COALESCE(excluded.permissions, installations.permissions), account_type = excluded.account_type").bind(id, account?.login ?? "", status, p.installation?.permissions ? JSON.stringify(p.installation.permissions) : null, account?.type ?? "User").run();
    if (status !== "active") {
      if (status === "deleted") await env.DB.batch([
        env.DB.prepare("DELETE FROM user_repos WHERE installation_id = ?").bind(id),
        env.DB.prepare("DELETE FROM user_installations WHERE installation_id = ?").bind(id),
      ]);
      for (const row of await rows(env, id)) {
        if (status === "deleted") await archive(env, row, "installation deleted");
        else if (!row.archived_at) await (await objectFor(env, row)).pauseGitHub("GitHub installation suspended");
      }
      return;
    }
  }
  if (event === "installation_repositories") {
    for (const repo of p.repositories_removed ?? []) {
      const row = await env.DB.prepare("SELECT * FROM repos WHERE (repo_id = ? OR full_name = ?) AND installation_id = ?").bind(repo.id ?? null, repo.full_name.toLowerCase(), id).first<RepoRecord>();
      if (row) await archive(env, row, "repository removed", repo.id);
    }
  }
  const added = p.repositories ?? p.repositories_added ?? [];
  for (const repo of added) await upsert(env, repo, id);
  if (Number.isSafeInteger(p.sender?.id) && added.length) await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO user_installations (user_id, installation_id, account_login) SELECT id, ?, ? FROM users WHERE id = ?").bind(id, account?.login ?? "", p.sender!.id!),
    ...added.map(repo => env.DB.prepare("INSERT OR REPLACE INTO user_repos (user_id, repo, installation_id) SELECT id, ?, ? FROM users WHERE id = ?").bind(repo.full_name.toLowerCase(), id, p.sender!.id!)),
  ]);
  // unsuspend/permissions payloads may omit repositories. Refresh every retained active factory.
  if (event === "installation" && ["unsuspend", "new_permissions_accepted"].includes(p.action ?? "")) {
    for (const row of await rows(env, id)) if (!row.archived_at) await (await objectFor(env, row)).restoreGitHub(row.full_name, id);
  }
  await refreshInstallationPermissions(env, id, p);
}

export async function refreshInstallationPermissions(env: RepositoryEnv, id: number, p?: GitHubPayload): Promise<void> {
  const account = p?.installation?.account;
  const info = await env.DB.prepare("SELECT permissions, account_login, account_type FROM installations WHERE id = ?").bind(id).first<{ permissions: string | null; account_login: string; account_type: string }>();
  let permissions = info?.permissions ? JSON.parse(info.permissions) as Record<string, string> : p?.installation?.permissions;
  if (!permissions) {
    const { appJwt } = await import("./github");
    const installation = await gh<{ permissions: Record<string, string>; account?: { login: string; type: string } }>(`/app/installations/${id}`, await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY));
    permissions = installation.permissions;
    await env.DB.prepare("INSERT INTO installations (id, account_login, permissions, account_type) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET permissions = excluded.permissions, account_type = excluded.account_type").bind(id, installation.account?.login ?? account?.login ?? "", JSON.stringify(permissions), installation.account?.type ?? account?.type ?? "User").run();
    if (!account && installation.account) p = { installation: { id, account: installation.account } };
  }
  const source = permissionStatus(id, permissions, info?.account_login ?? p?.installation?.account?.login, info?.account_type ?? p?.installation?.account?.type);
  for (const row of await rows(env, id)) {
    if (row.archived_at) continue;
    const f = await objectFor(env, row);
    await f.setGitHubPermissions(source);
    if (source.state === "connected") await f.enqueueGitHub(`backfill-${id}-${row.repo_id}`, "shiptorio_install", { repository: { id: row.repo_id ?? undefined, full_name: row.full_name }, installation: p?.installation ?? { id } });
  }
}
