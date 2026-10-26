import type { Factory } from "./factory";
import { appJwt, gh, type AppCredentials } from "./github";

export interface RepoRecord { full_name: string; repo_id: number | null; installation_id: number; archived_at: number | null; archive_reason: string | null }
export interface RepositoryEnv extends AppCredentials { DB: D1Database; FACTORY: DurableObjectNamespace<Factory> }
export const byRepoId = (env: RepositoryEnv, id: number) => env.FACTORY.get(env.FACTORY.idFromName(`repo:${id}`));

/** Copy every storage key before switching routing. The old object stays frozen after a crash. */
export async function migrateRepository(env: RepositoryEnv, row: RepoRecord, id: number) {
  const target = byRepoId(env, id);
  const legacy = env.FACTORY.get(env.FACTORY.idFromName(row.full_name.toLowerCase()));
  await target.importLegacy(await legacy.exportLegacy(`repo:${id}`));
  await legacy.finishLegacy();
  await env.DB.prepare("UPDATE repos SET repo_id = ? WHERE full_name = ? AND repo_id IS NULL").bind(id, row.full_name).run();
  return target;
}

export async function repositoryFactory(env: RepositoryEnv, name: string): Promise<DurableObjectStub<Factory>> {
  const row = await env.DB.prepare("SELECT * FROM repos WHERE full_name = ?").bind(name.toLowerCase()).first<RepoRecord>();
  if (row?.repo_id) return byRepoId(env, row.repo_id);
  // Existing installs are upgraded lazily using the App JWT, including archived rows.
  if (row) {
    const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const repo = await gh<{ id: number }>(`/repos/${name}`, jwt);
    return migrateRepository(env, row, repo.id);
  }
  throw new Error("Repository is not installed");
}
