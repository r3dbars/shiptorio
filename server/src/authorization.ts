// The only session adapter: replace this with the accounts lane's user lookup when it lands.
import { isAllowed, readSessionDetails } from './session';
import { gh, installationToken, repoInstallationId, type AppCredentials } from './github';
export interface AccessUser { login: string; expiresAt: number }
export interface AuthorizationEnv extends AppCredentials {
  SESSION_SECRET: string; ALLOWED_LOGINS: string; DB: D1Database; CACHE?: KVNamespace;
}
export async function requireUser(request: Request, env: AuthorizationEnv): Promise<AccessUser | null> {
  const session = await readSessionDetails(env.SESSION_SECRET, request.headers.get('cookie'));
  return session && isAllowed(env.ALLOWED_LOGINS, session.login) ? session : null;
}
export const validRepo = (repo: string) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && !repo.split('/').some(p => p === '.' || p === '..');
// D1 is checked even on cache hits: uninstall/removal revokes all users immediately.
export async function repoAccess(env: AuthorizationEnv, user: AccessUser, name: string): Promise<number | null> {
  const repo = name.toLowerCase();
  if (!validRepo(repo) || user.expiresAt <= Date.now()) return null;
  const row = await env.DB.prepare('SELECT installation_id FROM repos WHERE full_name = ?').bind(repo).first<{ installation_id: number }>();
  if (!row?.installation_id) return null;
  const installed = await env.DB.prepare('SELECT id FROM installations WHERE id = ?').bind(row.installation_id).first();
  if (!installed) return null;
  const key = `access:v1:${row.installation_id}:${repo}:${user.login.toLowerCase()}`;
  const cached = await env.CACHE?.get<{ expiresAt: number }>(key, 'json').catch(() => null);
  if (cached && cached.expiresAt > Date.now() && cached.expiresAt <= Date.now() + 60000) return row.installation_id;
  try {
    if (await repoInstallationId(env, repo) !== row.installation_id) return null;
    const token = await installationToken(env, row.installation_id);
    const result = await gh<{ permission: string }>(`/repos/${repo}/collaborators/${encodeURIComponent(user.login)}/permission`, token);
    if (!['read', 'triage', 'write', 'maintain', 'admin'].includes(result.permission)) return null;
    await env.CACHE?.put(key, JSON.stringify({ expiresAt: Date.now() + 60000 }), { expirationTtl: 60 }).catch(() => {});
    return row.installation_id;
  } catch { return null; } // API errors and suspended/uninstalled Apps fail closed.
}
