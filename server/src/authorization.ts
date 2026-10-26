// Shared adapter over accounts.ts. HTTP, browser sockets and runner grants use one revocable session.
import { currentUser } from './accounts';
import { isAllowed, readSessionDetails } from './session';
import { gh, installationToken, repoInstallationId, type AppCredentials } from './github';
export interface AccessUser { id: number; login: string; expiresAt: number; sessionHash: string }
export interface AuthorizationEnv extends AppCredentials {
  SESSION_SECRET: string; ALLOWED_LOGINS: string; DB: D1Database; CACHE?: KVNamespace;
}
export async function requireUser(request: Request, env: AuthorizationEnv): Promise<AccessUser | null> {
  const session = await readSessionDetails(env.SESSION_SECRET, request.headers.get('cookie'));
  if (!session?.ref) return null;
  const user = await currentUser(env, request.headers.get('cookie'));
  if (!user) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session.ref.sid));
  const sessionHash = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  return { id: user.id, login: user.login, expiresAt: session.expiresAt, sessionHash };
}

export const validRepo = (repo: string) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && !repo.split('/').some(p => p === '.' || p === '..');
// D1 is checked even on cache hits: uninstall/removal revokes all users immediately.
export async function repoAccess(env: AuthorizationEnv, user: AccessUser, name: string): Promise<number | null> {
  const repo = name.toLowerCase();
  if (!validRepo(repo) || user.expiresAt <= Date.now()) return null;
  if (!Number.isSafeInteger(user.id) || !/^[a-f0-9]{64}$/.test(user.sessionHash ?? '')) return null;
  const sessionUser = await env.DB.prepare('SELECT u.id, u.login FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.user_id = ? AND s.expires_at > ?').bind(user.sessionHash, user.id, Date.now()).first<{ id: number; login: string }>();
  if (!sessionUser || !isAllowed(env.ALLOWED_LOGINS, sessionUser.login)) return null;
  const row = await env.DB.prepare('SELECT installation_id FROM repos WHERE full_name = ?').bind(repo).first<{ installation_id: number }>();
  if (!row?.installation_id) return null;
  const installed = await env.DB.prepare('SELECT id FROM installations WHERE id = ?').bind(row.installation_id).first();
  if (!installed) return null;
  const membership = await env.DB.prepare('SELECT installation_id FROM user_repos WHERE user_id = ? AND repo = ?').bind(user.id, repo).first<{ installation_id: number }>();
  const userInstallation = await env.DB.prepare('SELECT installation_id FROM user_installations WHERE user_id = ? AND installation_id = ?').bind(user.id, row.installation_id).first();
  if (!membership || membership.installation_id !== row.installation_id || !userInstallation) return null;
  const key = `access:v2:${row.installation_id}:${repo}:${user.id}`;
  const cached = await env.CACHE?.get<{ expiresAt: number }>(key, 'json').catch(() => null);
  if (cached && cached.expiresAt > Date.now() && cached.expiresAt <= Date.now() + 60000) return row.installation_id;
  try {
    if (await repoInstallationId(env, repo) !== row.installation_id) return null;
    const token = await installationToken(env, row.installation_id);
    const result = await gh<{ permission: string; user: { id: number } }>(`/repos/${repo}/collaborators/${encodeURIComponent(sessionUser.login)}/permission`, token);
    if (result.user?.id !== user.id || !['read', 'triage', 'write', 'maintain', 'admin'].includes(result.permission)) return null;
    await env.CACHE?.put(key, JSON.stringify({ expiresAt: Date.now() + 60000 }), { expirationTtl: 60 }).catch(() => {});
    return row.installation_id;
  } catch { return null; } // API errors and suspended/uninstalled Apps fail closed.
}
