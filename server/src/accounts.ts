// Player accounts (migration 0004). GitHub is the only login. Sign-in stores the GitHub user, opens a
// server-side session, and copies which App installations and repos that user can reach, read with the
// user's own token. Every factory route checks that copy, so a player only ever sees their own repos.

import { parseProgress, validProgress, type Progress } from "@shiptorio/shared";
import { isAllowed, makeSessionCookie, readSessionDetails } from "./session";

export interface AccountsEnv {
  DB: D1Database;
  SESSION_SECRET: string;
  ALLOWED_LOGINS: string;
  DEV_LOGIN?: string;
}

export interface User { id: number; login: string; dev?: true }

export interface GitHubUser { id: number; login: string; name?: string | null; avatar_url?: string | null }

const isLocal = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";
const MAX_AGE_MS = 14 * 86400_000;
const API = "https://api.github.com";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Local dev (DEV_LOGIN on localhost) skips GitHub and sees every installed repo. */
function devUser(env: AccountsEnv, url: URL | null): User | null {
  return env.DEV_LOGIN && url && isLocal(url) ? { id: 0, login: env.DEV_LOGIN, dev: true } : null;
}

export async function upsertUser(env: AccountsEnv, gh: GitHubUser, now = Date.now()): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, login, name, avatar_url, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url, last_login_at = excluded.last_login_at",
  ).bind(gh.id, gh.login, gh.name ?? null, gh.avatar_url ?? null, now, now).run();
}

/** Opens a session row and returns the Set-Cookie value for it. */
export async function createSession(env: AccountsEnv, user: User, userAgent: string | null, now = Date.now()): Promise<string> {
  const sid = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(sid), user.id, now, now + MAX_AGE_MS, userAgent?.slice(0, 200) ?? null),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
  ]);
  return makeSessionCookie(env.SESSION_SECRET, user.login, now, { sid, uid: user.id });
}

/** The signed-in player, or null. A cookie only counts while its session row exists and the login is allowed. */
export async function currentUser(env: AccountsEnv, cookie: string | null, url: URL | null = null, now = Date.now()): Promise<User | null> {
  const dev = devUser(env, url);
  if (dev) return dev;
  const session = await readSessionDetails(env.SESSION_SECRET, cookie, now);
  // Cookies from before accounts existed carry no session id; they sign in again (one click).
  if (!session?.ref || !env.DB) return null;
  const row = await env.DB.prepare("SELECT u.id, u.login FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.user_id = ? AND s.expires_at > ?")
    .bind(await sha256(session.ref.sid), session.ref.uid, now)
    .first<{ id: number; login: string }>();
  if (!row || !isAllowed(env.ALLOWED_LOGINS ?? "", row.login)) return null;
  return { id: row.id, login: row.login };
}

export async function endSession(env: AccountsEnv, cookie: string | null): Promise<void> {
  const session = await readSessionDetails(env.SESSION_SECRET, cookie);
  if (session?.ref && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(session.ref.sid)).run();
}

// ---- which repos a player can reach ----

async function userApi<T>(path: string, token: string): Promise<T> {
  const res = await fetch(API + path, {
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "shiptorio", "x-github-api-version": "2022-11-28" },
  });
  if (!res.ok) throw new Error(`GitHub GET ${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

interface Reach { installations: { id: number; account: string }[]; repos: { repo: string; installationId: number; defaultBranch: string | null }[] }

// Caps keep one sign-in inside the Worker's subrequest budget: 10 installations × 10 pages of 100 repos.
export async function fetchReach(token: string): Promise<Reach> {
  const reach: Reach = { installations: [], repos: [] };
  const { installations } = await userApi<{ installations: { id: number; account?: { login?: string } }[] }>("/user/installations?per_page=100", token);
  for (const inst of installations.slice(0, 10)) {
    reach.installations.push({ id: inst.id, account: inst.account?.login ?? "" });
    for (let page = 1; page <= 10; page++) {
      const { repositories } = await userApi<{ repositories: { full_name: string; default_branch?: string }[] }>(`/user/installations/${inst.id}/repositories?per_page=100&page=${page}`, token);
      for (const r of repositories) reach.repos.push({ repo: r.full_name.toLowerCase(), installationId: inst.id, defaultBranch: r.default_branch ?? null });
      if (repositories.length < 100) break;
    }
  }
  return reach;
}

/** Replaces the player's repo list with what GitHub says they can reach right now. */
export async function saveReach(env: AccountsEnv, userId: number, reach: Reach): Promise<void> {
  const db = env.DB;
  await db.batch([
    db.prepare("DELETE FROM user_installations WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_repos WHERE user_id = ?").bind(userId),
    ...reach.installations.flatMap((i) => [
      db.prepare("INSERT OR REPLACE INTO user_installations (user_id, installation_id, account_login) VALUES (?, ?, ?)").bind(userId, i.id, i.account),
      db.prepare("INSERT INTO installations (id, account_login) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET account_login = excluded.account_login").bind(i.id, i.account),
    ]),
    ...reach.repos.flatMap((r) => [
      db.prepare("INSERT OR REPLACE INTO user_repos (user_id, repo, installation_id) VALUES (?, ?, ?)").bind(userId, r.repo, r.installationId),
      db.prepare("INSERT INTO repos (full_name, installation_id, default_branch) VALUES (?, ?, ?) ON CONFLICT(full_name) DO UPDATE SET installation_id = excluded.installation_id, default_branch = COALESCE(excluded.default_branch, repos.default_branch)")
        .bind(r.repo, r.installationId, r.defaultBranch),
    ]),
  ]);
}

export async function canSeeRepo(env: AccountsEnv, user: User, repo: string): Promise<boolean> {
  if (user.dev) return true;
  const row = await env.DB.prepare("SELECT 1 AS ok FROM user_repos WHERE user_id = ? AND repo = ?").bind(user.id, repo.toLowerCase()).first<{ ok: number }>();
  return !!row;
}

export interface RepoRow { full_name: string; installation_id: number; default_branch: string | null }

export async function reposFor(env: AccountsEnv, user: User): Promise<RepoRow[]> {
  const query = user.dev
    ? env.DB.prepare("SELECT full_name, installation_id, default_branch FROM repos ORDER BY full_name")
    : env.DB.prepare("SELECT ur.repo AS full_name, ur.installation_id, r.default_branch FROM user_repos ur LEFT JOIN repos r ON r.full_name = ur.repo WHERE ur.user_id = ? ORDER BY ur.repo").bind(user.id);
  return (await query.all<RepoRow>()).results;
}

// ---- per-player settings ----

// Only these keys are stored, each a short string, so the table can't become a dumping ground.
const PREF_KEYS = ["intro", "guideSeen"] as const;
export type PrefKey = (typeof PREF_KEYS)[number];
export const isPrefKey = (key: string): key is PrefKey => (PREF_KEYS as readonly string[]).includes(key);

export async function readPrefs(env: AccountsEnv, user: User): Promise<Partial<Record<PrefKey, string>>> {
  if (user.dev) return {};
  const rows = await env.DB.prepare("SELECT key, value FROM user_prefs WHERE user_id = ?").bind(user.id).all<{ key: string; value: string }>();
  return Object.fromEntries(rows.results.filter((r) => isPrefKey(r.key)).map((r) => [r.key, r.value]));
}

export async function writePrefs(env: AccountsEnv, user: User, prefs: Record<string, unknown>, now = Date.now()): Promise<boolean> {
  const entries = Object.entries(prefs);
  if (!entries.length || entries.some(([k, v]) => !isPrefKey(k) || typeof v !== "string" || v.length > 64)) return false;
  if (user.dev) return true;
  await env.DB.batch(entries.map(([k, v]) =>
    env.DB.prepare("INSERT INTO user_prefs (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(user.id, k, v as string, now)));
  return true;
}

// ---- progression (migration 0007) ----

export const MAX_PROGRESS_BYTES = 32 * 1024;

export async function readProgress(env: AccountsEnv, user: User): Promise<Progress | null> {
  if (user.dev) return null;
  const row = await env.DB.prepare("SELECT value FROM user_progress WHERE user_id = ?").bind(user.id).first<{ value: string }>();
  return row ? parseProgress(row.value) : null;
}

/** Stores a progress blob only if the shared schema accepts it, so a bad client can't park junk here. */
export async function writeProgress(env: AccountsEnv, user: User, raw: string, now = Date.now()): Promise<boolean> {
  if (raw.length > MAX_PROGRESS_BYTES) return false;
  const p = validProgress(raw);
  if (!p) return false;
  if (user.dev) return true;
  await env.DB.prepare("INSERT INTO user_progress (user_id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(user.id, JSON.stringify(p), now).run();
  return true;
}
