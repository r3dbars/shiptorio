export async function repoHash(repo: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(repo.toLowerCase()));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function factoryDeleted(db: D1Database, repo: string): Promise<boolean> {
  const rows = await db.prepare("SELECT repo_hash FROM deleted_factories WHERE repo_hash = ?").bind(await repoHash(repo)).all();
  return rows.results.length > 0;
}
