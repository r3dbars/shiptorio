// Signed session cookie. Login goes through the GitHub App's own OAuth (user-to-server), and only
// logins in ALLOWED_LOGINS get in while Shiptorio is private ("*" opens sign-up to everyone).
// The cookie names a server-side session row (accounts.ts) so sign-out and revocation are real.

import { hmacSigningKey } from "./hmac-key";

const enc = new TextEncoder();
const COOKIE = "shiptorio_session";
const MAX_AGE = 60 * 60 * 24 * 14;

async function hmac(secret: string, data: string): Promise<string> {
  const key = await hmacSigningKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export interface SessionRef { sid: string; uid: number }

export async function makeSessionCookie(secret: string, login: string, now = Date.now(), ref?: SessionRef): Promise<string> {
  const payload = btoa(JSON.stringify({ login, exp: Math.floor(now / 1000) + MAX_AGE, ...ref }));
  const value = `${payload}.${await hmac(secret, payload)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

/** What an owner script sends to /auth/owner-session to prove it holds SESSION_SECRET. */
export async function ownerProof(secret: string, login: string, at: number): Promise<string> {
  return hmac(secret, `owner-session.${login.toLowerCase()}.${at}`);
}

export async function readSessionDetails(secret: string, cookieHeader: string | null, now = Date.now()): Promise<{ login: string; expiresAt: number; issuedAt: number; ref?: SessionRef } | null> {

  if (!secret) return null;
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;
  const [payload, sig, extra] = match[1].split(".");
  if (extra || !payload || !sig || (await hmac(secret, payload)) !== sig) return null;
  try {
    const { login, exp, sid, uid } = JSON.parse(atob(payload));
    if (typeof login !== "string" || !Number.isFinite(exp) || exp <= now / 1000) return null;
    const ref = typeof sid === "string" && Number.isSafeInteger(uid) ? { sid, uid } : undefined;
    return { login, expiresAt: exp * 1000, issuedAt: (exp - MAX_AGE) * 1000, ...(ref ? { ref } : {}) };
  } catch {
    return null;
  }
}

export async function readSession(secret: string, cookieHeader: string | null, now = Date.now()): Promise<string | null> {
  return (await readSessionDetails(secret, cookieHeader, now))?.login ?? null;
}

export function isAllowed(allowedLogins: string, login: string): boolean {
  if (allowedLogins.trim() === "*") return true;
  return allowedLogins
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(login.toLowerCase());
}

export async function authorizationRevoked(db: D1Database | undefined, login: string, issuedAt: number): Promise<boolean> {
  if (!db) return false;
  const row = await db.prepare("SELECT revoked_at FROM github_authorization_revocations WHERE login = ?").bind(login.toLowerCase()).first<{ revoked_at: number }>();
  return !!row && issuedAt <= row.revoked_at;
}
