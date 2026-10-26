import { currentUser } from './accounts';
import { signupMode, signupAllowed, hash } from './signup';
import { isAllowed, readSessionDetails } from "./session";
import { ipSubject } from "./rate-limit";

export interface BrowserSocketEnv { SESSION_SECRET: string; APP_PASSWORD?: string; ALLOWED_LOGINS: string; DEV_LOGIN?: string; DB?: D1Database; SIGNUP_GATE_MODE?: string }
export interface BrowserSocketAuth { login: string; expiresAt: number; epoch: string; sessionHash?: string; userId?: number; rateSubject?: string }

// Attachments hold no cookie or literal credential. Changing an access control value
// invalidates established connections when the updated Worker/DO environment loads.
export async function browserSocketEpoch(env: BrowserSocketEnv): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["browser-socket-v1", env.SESSION_SECRET, env.APP_PASSWORD, env.ALLOWED_LOGINS])));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function browserSocketAuth(request: Request, env: BrowserSocketEnv, now = Date.now()): Promise<BrowserSocketAuth | null> {
  const cookie = request.headers.get("cookie");
  const session = await readSessionDetails(env.SESSION_SECRET, cookie, now);
  if (!session) return null;
  if (env.DB) {
    const user = await currentUser({...env,DB:env.DB},cookie,new URL(request.url),now);
    if (!user) return null;
  } else if (!isAllowed(env.ALLOWED_LOGINS ?? '',session.login)) return null;
  const url = new URL(request.url);
  const local = !!env.DEV_LOGIN && ["localhost", "127.0.0.1"].includes(url.hostname);
  let expiresAt = session.expiresAt;
  if (!local && (!env.DB || signupMode(env) === "password")) {
    if (!env.APP_PASSWORD) return null;
    const previewValue = cookie?.match(/(?:^|;\s*)shiptorio_access=([^;]+)/)?.[1];
    const preview = await readSessionDetails(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, previewValue ? `shiptorio_session=${previewValue}` : null, now);
    if (!preview) return null;
    expiresAt = Math.min(expiresAt, preview.expiresAt);
  }
  return { login: session.login, expiresAt, rateSubject:ipSubject(request), epoch: await browserSocketEpoch(env), ...(session.ref ? {sessionHash:await hash(session.ref.sid),userId:session.ref.uid} : {}) };
}

export function browserSocketAllowed(auth: unknown, env: BrowserSocketEnv, epoch: string | null, now = Date.now()): auth is BrowserSocketAuth {
  if (!auth || typeof auth !== "object") return false;
  const value = auth as Partial<BrowserSocketAuth>;
  return !!epoch && !!env.SESSION_SECRET && typeof value.login === "string" && (!!env.DB && signupMode(env) !== "password" || isAllowed(env.ALLOWED_LOGINS ?? "", value.login))
    && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.epoch === epoch;
}

// Revalidate live session and approval after hibernation and before handling moves.
export async function browserSocketActive(auth: BrowserSocketAuth, env: BrowserSocketEnv): Promise<boolean> {
  if (!env.DB) return true; // legacy unit fixtures; deployed Factory always binds D1
  if (!auth.sessionHash || !Number.isSafeInteger(auth.userId)) return signupMode(env) === "password";
  const row = await env.DB.prepare('SELECT u.login FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.user_id=? AND s.expires_at>?').bind(auth.sessionHash,auth.userId,Date.now()).first<{login:string}>();
  return !!row && row.login.toLowerCase() === auth.login.toLowerCase() && await signupAllowed({DB:env.DB,ALLOWED_LOGINS:env.ALLOWED_LOGINS},row.login);
}
