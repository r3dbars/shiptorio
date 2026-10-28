import type { AccessUser } from "./authorization";
import { currentUser } from './accounts';
import { signupMode, signupAllowed, hash } from './signup';
import { authorizationRevoked, isAllowed, readSessionDetails } from "./session";
import { ipSubject } from "./rate-limit";

export interface BrowserSocketEnv { SESSION_SECRET: string; APP_PASSWORD?: string; ALLOWED_LOGINS: string; DEV_LOGIN?: string; DB?: D1Database; SIGNUP_GATE_MODE?: string }
export interface BrowserSocketAuth { adminView?: string; login: string; expiresAt: number; epoch: string; issuedAt?: number; sessionHash?: string; userId?: number; rateSubject?: string; repo?:string; user?:AccessUser }


// Attachments hold no cookie or literal credential. Changing an access control value
// invalidates established connections when the updated Worker/DO environment loads.
export async function browserSocketEpoch(env: Pick<BrowserSocketEnv, "SESSION_SECRET" | "APP_PASSWORD" | "ALLOWED_LOGINS">): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["browser-socket-v1", env.SESSION_SECRET, env.APP_PASSWORD, env.ALLOWED_LOGINS])));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function browserSocketAuth(request: Request, env: BrowserSocketEnv, now = Date.now()): Promise<BrowserSocketAuth | null> {
  const cookie = request.headers.get("cookie");
  const session = await readSessionDetails(env.SESSION_SECRET, cookie, now);
  if (!session) return null;
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  if (env.DB) {
    user = await currentUser({...env,DB:env.DB},cookie,new URL(request.url),now);
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
  const sessionHash = session.ref ? await hash(session.ref.sid) : undefined;
  // This principal belongs only to this verified upgrade. Repository access still
  // performs its own current membership/session check before any snapshot is sent.
  const principal = user && sessionHash ? Object.freeze({ ...user, expiresAt: session.expiresAt, sessionHash }) : undefined;
  return { ...(principal ? { user: principal } : {}), issuedAt: session.issuedAt, login: session.login, expiresAt, rateSubject:ipSubject(request), epoch: await browserSocketEpoch(env), ...(session.ref ? {sessionHash:sessionHash!,userId:session.ref.uid} : {}) };

}

export function browserSocketAllowed(auth: unknown, env: BrowserSocketEnv, epoch: string | null, now = Date.now()): auth is BrowserSocketAuth {
  if (!auth || typeof auth !== "object") return false;
  const value = auth as Partial<BrowserSocketAuth>;
  return !!epoch && !!env.SESSION_SECRET && typeof value.login === "string" && (!!env.DB || isAllowed(env.ALLOWED_LOGINS ?? "", value.login))
    && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.epoch === epoch;
}

// Revalidate live session and approval after hibernation and before handling moves.
export async function browserSocketActive(auth: BrowserSocketAuth, env: BrowserSocketEnv): Promise<boolean> {
  if (!env.DB) return true; // legacy unit fixtures; deployed Factory always binds D1
  if (!auth.sessionHash || !Number.isSafeInteger(auth.userId)) return signupMode(env) === "password";
  const row = await env.DB.prepare('SELECT u.login FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.user_id=? AND s.expires_at>?').bind(auth.sessionHash,auth.userId,Date.now()).first<{login:string}>();
  return !!row && row.login.toLowerCase() === auth.login.toLowerCase() && await signupAllowed({DB:env.DB,ALLOWED_LOGINS:env.ALLOWED_LOGINS},row.login);
}

// Transport metadata is additive: the shared gameplay schemas still parse the
// original snapshot/patch/log payload. The durable cursor survives DO hibernation.
export async function browserFrame(storage: Pick<DurableObjectStorage, "get" | "put">, message: object, advance = true): Promise<string> {
  const seq = (await storage.get<number>("browserSeq") ?? 0) + (advance ? 1 : 0);
  if (advance) await storage.put("browserSeq", seq);
  return JSON.stringify({ ...message, seq });
}

export function browserHeartbeat(ws: Pick<WebSocket, "send">, raw: string | ArrayBuffer): boolean {
  if (raw !== "ping") return false;
  ws.send("pong");
  return true;
}

// Sequence allocation must not queue behind another player's authorization I/O.
export class BrowserFrames {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: Pick<DurableObjectStorage, "get" | "put">) {}
  frame(message: object, advance = true): Promise<string> {
    const frame = this.queue.then(() => browserFrame(this.storage, message, advance));
    this.queue = frame.catch(() => {});
    return frame;
  }
}
