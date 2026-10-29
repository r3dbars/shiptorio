import { signupAllowed } from "./signup";
import { testIdentityAllowed } from "./test-users-policy";
// Shared adapter over accounts.ts. HTTP, browser sockets and runner grants use one revocable session.
import { currentUser } from './accounts';
import { isAllowed, readSessionDetails } from './session';
import { gh, installationToken, repoInstallationId, type AppCredentials } from './github';
export interface AccessUser { id: number; login: string; expiresAt: number; sessionHash: string }
export interface AuthorizationEnv extends AppCredentials {
  SESSION_SECRET: string; ALLOWED_LOGINS: string; DB: D1Database; CACHE?: KVNamespace;
  TEST_USERS?: string; PUBLIC_URL?: string;
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
// GitHub collaborator checks are reused for 5 minutes. Idle runners re-checked every minute and drained the App's
// hourly API bucket. D1 is checked even on cache hits: uninstall/removal revokes all users immediately.
const ACCESS_TTL = 5 * 60 * 1000;
export async function repoAccess(env: AuthorizationEnv, user: AccessUser, name: string, authority: "read" | "write" = "read", throwOnLookupError = false): Promise<number | null> {
  const repo = name.toLowerCase();
  if (user.id < 0 && (!testIdentityAllowed(env, user.id, user.login) || repo !== `test-fixture/${user.login}`)) return null;
  if (!validRepo(repo) || user.expiresAt <= Date.now()) return null;
  if (!Number.isSafeInteger(user.id) || !/^[a-f0-9]{64}$/.test(user.sessionHash ?? '')) return null;
  const sessionUser = await env.DB.prepare('SELECT u.id, u.login FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.user_id = ? AND s.expires_at > ?').bind(user.sessionHash, user.id, Date.now()).first<{ id: number; login: string }>();
  if (!sessionUser || !await signupAllowed(env,sessionUser.login)) return null;
  type Relationship = { id?: number; installation_id?: number };
  let row: Relationship | null | undefined, installed: Relationship | null | undefined, membership: Relationship | null | undefined, userInstallation: Relationship | null | undefined;
  const repository = env.DB.prepare('SELECT installation_id FROM repos WHERE full_name = ?').bind(repo);
  if (typeof env.DB.batch === 'function') {
    // Keep session/admission denial ahead of repository I/O. Resolve the current
    // installation mapping and all three relationships in one D1 transaction.
    const results = await env.DB.batch<Relationship>([
      repository,
      env.DB.prepare('SELECT id FROM installations WHERE id = (SELECT installation_id FROM repos WHERE full_name = ?)').bind(repo),
      env.DB.prepare('SELECT installation_id FROM user_repos WHERE user_id = ? AND repo = ?').bind(user.id, repo),
      env.DB.prepare('SELECT installation_id FROM user_installations WHERE user_id = ? AND installation_id = (SELECT installation_id FROM repos WHERE full_name = ?)').bind(user.id, repo),
    ]);
    // A failed repository lookup used to throw from first(), even for a caller
    // that treats relationship lookup failures as a denial. Preserve that order.
    if (!results[0] || results[0].success === false || !Array.isArray(results[0].results)) throw new Error('Repository lookup unavailable');
    row = results[0].results[0];
    if (!row?.installation_id) return null;
    const relationships = results.slice(1);
    if (results.length !== 4 || relationships.some((result: { success?: boolean }) => result.success === false)) {
      if (throwOnLookupError) throw new Error('Repository membership lookup unavailable');
      return null;
    }
    [installed, membership, userInstallation] = relationships.map(result => result.results?.[0]);
  } else {
    // Lightweight D1 adapters retain the original sequential reads and ordering.
    row = await repository.first<Relationship>();
    if (!row?.installation_id) return null;
    installed = await env.DB.prepare('SELECT id FROM installations WHERE id = ?').bind(row.installation_id).first<Relationship>();
    if (!installed) return null;
    membership = await env.DB.prepare('SELECT installation_id FROM user_repos WHERE user_id = ? AND repo = ?').bind(user.id, repo).first<Relationship>();
    userInstallation = await env.DB.prepare('SELECT installation_id FROM user_installations WHERE user_id = ? AND installation_id = ?').bind(user.id, row.installation_id).first<Relationship>();
  }
  if (!installed || !membership || membership.installation_id !== row.installation_id || !userInstallation) return null;
  // Never promote a cached visibility grant into mutation authority. Separate
  // keys also make pre-upgrade read-only grants harmless for writers.
  const key = `access:v2:${authority === "write" ? "write:" : ""}${row.installation_id}:${repo}:${user.id}`;
  const cached = await env.CACHE?.get<{ expiresAt: number }>(key, 'json').catch(() => null);
  if (cached && cached.expiresAt > Date.now() && cached.expiresAt <= Date.now() + ACCESS_TTL) return row.installation_id;
  try {
    if (await repoInstallationId(env, repo) !== row.installation_id) return null;
    const token = await installationToken(env, row.installation_id);
    const result = await gh<{ permission: string; user: { id: number } }>(`/repos/${repo}/collaborators/${encodeURIComponent(sessionUser.login)}/permission`, token);
    if (throwOnLookupError && (!Number.isSafeInteger(result.user?.id) || typeof result.permission !== "string")) throw new Error("Repository permission lookup unavailable");
    const permissions = authority === "write" ? ['write', 'maintain', 'admin'] : ['read', 'triage', 'write', 'maintain', 'admin'];
    if (result.user?.id !== user.id || !permissions.includes(result.permission)) return null;
    await env.CACHE?.put(key, JSON.stringify({ expiresAt: Date.now() + ACCESS_TTL }), { expirationTtl: ACCESS_TTL / 1000 }).catch(() => {});
    return row.installation_id;
  } catch (error) { if (throwOnLookupError) throw error; return null; } // Deny every caller; runners distinguish unavailable from confirmed revocation.
}
