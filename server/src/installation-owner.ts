/** Call only with account metadata from GitHub's authenticated API or signed webhook. */
export async function rememberInstallationOwner(db: D1Database, installationId: number, account?: {id?: number; login?: string; type?: string}) {
  if (!Number.isSafeInteger(account?.id) || account!.id! <= 0 || !["User", "Organization"].includes(account?.type ?? "")) return;
  await db.prepare("UPDATE installations SET account_id = ?, account_type = ?, account_login = ? WHERE id = ? AND (account_id IS NULL OR account_id = ?)")
    .bind(account!.id, account!.type, account!.login ?? "", installationId, account!.id).run();
}
