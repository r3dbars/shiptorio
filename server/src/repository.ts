import type { Factory } from "./factory";
import { appJwt, gh, installationToken, type AppCredentials } from "./github";

export interface RepoRecord { full_name: string; repo_id: number | null; installation_id: number; archived_at: number | null; archive_reason: string | null }
export interface RepositoryEnv extends AppCredentials { DB: D1Database; FACTORY: DurableObjectNamespace<Factory> }
export const byRepoId = (env: RepositoryEnv, id: number) => env.FACTORY.get(env.FACTORY.idFromName(`repo:${id}`));

/** Copy every storage key before switching routing. The old object stays frozen after a crash. */
export async function migrateRepository(env: RepositoryEnv, row: RepoRecord, id: number) {
  const target = byRepoId(env, id);
  const legacy = env.FACTORY.get(env.FACTORY.idFromName(row.full_name.toLowerCase()));
  await target.importLegacy(await legacy.exportLegacy(`repo:${id}`));
  await target.setRepositoryId(id);
  await legacy.finishLegacy();
  await env.DB.prepare("UPDATE repos SET repo_id = ? WHERE full_name = ? AND repo_id IS NULL").bind(id, row.full_name).run();
  return target;
}

export async function repositoryFactory(env: RepositoryEnv, name: string): Promise<DurableObjectStub<Factory>> {
  const row = await env.DB.prepare("SELECT * FROM repos WHERE full_name = ?").bind(name.toLowerCase()).first<RepoRecord>();
  if (row?.repo_id) {
    const f = byRepoId(env, row.repo_id);
    // Existing installs predate lifecycle metadata. Discover drift on first use.
    const info = await env.DB.prepare("SELECT permissions, status, account_login, account_type FROM installations WHERE id = ?").bind(row.installation_id).first<{ permissions: string | null; status: string; account_login: string; account_type: string }>();
    if (info && !info.permissions && info.status === "active" && !row.archived_at) {
      const installation = await gh<{ permissions: Record<string, string>; account: { login: string; type: string } }>(`/app/installations/${row.installation_id}`, await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY));
      await env.DB.prepare("UPDATE installations SET permissions = ?, account_type = ? WHERE id = ?").bind(JSON.stringify(installation.permissions), installation.account.type, row.installation_id).run();
      const { permissionStatus } = await import("./github-lifecycle");
      await f.restoreGitHub(row.full_name, row.installation_id);
      await f.setGitHubPermissions(permissionStatus(row.installation_id, installation.permissions, installation.account.login, installation.account.type));
    }
    return f;
  }
  // Existing active installs are upgraded lazily using an installation token.
  if (row) {
    const token = await installationToken(env, row.installation_id);
    const repo = await gh<{ id: number }>(`/repos/${name}`, token);
    await migrateRepository(env, row, repo.id);
    return repositoryFactory(env, name);
  }
  throw new Error("Repository is not installed");
}
