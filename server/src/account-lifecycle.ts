import { sha256Hex } from "./encode";
export async function repoHash(repo: string): Promise<string> {
  return sha256Hex(repo.toLowerCase());
}
export async function factoryDeleted(db: D1Database, repo: string): Promise<boolean> {
  const rows = await db.prepare("SELECT repo_hash FROM deleted_factories WHERE repo_hash = ?").bind(await repoHash(repo)).all();
  return rows.results.length > 0;
}
