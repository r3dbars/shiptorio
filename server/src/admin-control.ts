/** No cache: an operator stop applies before the next paid call or runner handout. */
export async function adminPaused(db: D1Database | undefined, repo?: string): Promise<boolean> {
  if (!db) return false;
  const row = await db.prepare('SELECT scope FROM admin_controls WHERE paused = 1 AND (scope = ? OR scope = ?) LIMIT 1')
    .bind('*', repo?.toLowerCase() ?? '').first<{scope:string}>();
  return row?.scope === "*" || !!repo && row?.scope === repo.toLowerCase();
}
export async function auditAdmin(db: D1Database, login: string, action: string, repo: string | null, user: string | null, detail: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO admin_audit(id, at, admin_login, action, target_repo, target_user, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, Date.now(), login, action, repo, user, JSON.stringify(detail)).run();
  return id;
}
