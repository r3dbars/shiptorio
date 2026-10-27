import { currentUser, type AccountsEnv } from './accounts';
import { readSessionDetails } from './session';
import { configuredAdmin } from './admin-policy';

export const ADMIN_VIEW_COOKIE = 'shiptorio_admin_view';
export interface AdminView { idHash: string; adminId: number; sessionHash: string; userId: number; login: string; repo: string; writable: boolean }
type ViewEnv = AccountsEnv & { ADMIN_LOGINS?: string };
export async function digest(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function viewCookieValue(cookie: string | null): string | null {
  return cookie?.match(/(?:^|;\s*)shiptorio_admin_view=([a-f0-9]{64})(?:;|$)/)?.[1] ?? null;
}
/** Recheck both the operator's real session and immutable target membership on every use. */
export async function activeAdminView(env: ViewEnv, idHash: string, adminId: number, sessionHash: string, repo?: string): Promise<AdminView | null> {
  const row = await env.DB.prepare(`SELECT v.repo, v.target_user_id, v.writable, u.login, a.login AS admin_login FROM admin_views v
    JOIN sessions s ON s.id_hash = v.session_hash AND s.user_id = v.admin_id
    JOIN users a ON a.id = v.admin_id JOIN users u ON u.id = v.target_user_id
    JOIN user_repos r ON r.user_id = v.target_user_id AND r.repo = v.repo
    WHERE v.id_hash = ? AND v.admin_id = ? AND v.session_hash = ? AND v.expires_at > ? AND s.expires_at > ?`)
    .bind(idHash, adminId, sessionHash, Date.now(), Date.now()).first<{repo:string; target_user_id:number; writable:number; login:string; admin_login:string}>();
  if (!row || !configuredAdmin(env, row.admin_login) || repo && row.repo !== repo.toLowerCase()) return null;
  return { idHash, adminId, sessionHash, userId: row.target_user_id, login: row.login, repo: row.repo, writable: row.writable === 1 };
}
export async function readAdminView(env: ViewEnv, request: Request): Promise<AdminView | null> {
  const cookie = request.headers.get('cookie'), token = viewCookieValue(cookie);
  if (!token) return null;
  const user = await currentUser(env, cookie, new URL(request.url));
  const session = await readSessionDetails(env.SESSION_SECRET, cookie);
  if (!user || !session?.ref || !configuredAdmin(env,user.login)) return null;
  return activeAdminView(env, await digest(token), user.id, await digest(session.ref.sid));
}
export const adminViewCookie = (token: string, secure = true) => `${ADMIN_VIEW_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; ${secure ? 'Secure; ' : ''}Max-Age=${token ? 3600 : 0}`;
