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
  const row = await env.DB.prepare('SELECT installation_id FROM repos WHERE full_name = ?').bind(repo).first<{ installation_id: number }>();
  if (!row?.installation_id) return null;
  const checks = [
    env.DB.prepare('SELECT id FROM installations WHERE id = ?').bind(row.installation_id),
    env.DB.prepare('SELECT installation_id FROM user_repos WHERE user_id = ? AND repo = ?').bind(user.id, repo),
    env.DB.prepare('SELECT installation_id FROM user_installations WHERE user_id = ? AND installation_id = ?').bind(user.id, row.installation_id),
  ];
  type Relationship = { id?: number; installation_id?: number };
  let installed: Relationship | null | undefined, membership: Relationship | null | undefined, userInstallation: Relationship | null | undefined;
  if (typeof env.DB.batch === 'function') {
    // These three facts are independent after the repo lookup. Read them in one D1
    // roundtrip on every request/frame; no authorization result is cached here.
    const results = await env.DB.batch<Relationship>(checks);
    if (results.length !== checks.length || results.some((result: { success?: boolean }) => result.success === false)) {
      if (throwOnLookupError) throw new Error('Repository membership lookup unavailable');
      return null;
    }
    [installed, membership, userInstallation] = results.map(result => result.results?.[0]);
  } else {
    // Lightweight D1 adapters can retain the original sequential read behavior.
    installed = await checks[0].first<Relationship>();
    if (!installed) return null;
    membership = await checks[1].first<Relationship>();
    userInstallation = await checks[2].first<Relationship>();
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
