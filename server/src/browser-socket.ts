import { isAllowed, readSessionDetails } from "./session";

export interface BrowserSocketEnv { SESSION_SECRET: string; APP_PASSWORD?: string; ALLOWED_LOGINS: string; DEV_LOGIN?: string }
export interface BrowserSocketAuth { login: string; expiresAt: number; epoch: string }

// Attachments hold no cookie or literal credential. Changing an access control value
// invalidates established connections when the updated Worker/DO environment loads.
export async function browserSocketEpoch(env: BrowserSocketEnv): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["browser-socket-v1", env.SESSION_SECRET, env.APP_PASSWORD, env.ALLOWED_LOGINS])));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function browserSocketAuth(request: Request, env: BrowserSocketEnv, now = Date.now()): Promise<BrowserSocketAuth | null> {
  const cookie = request.headers.get("cookie");
  const session = await readSessionDetails(env.SESSION_SECRET, cookie, now);
  if (!session || !isAllowed(env.ALLOWED_LOGINS ?? "", session.login)) return null;
  const url = new URL(request.url);
  const local = !!env.DEV_LOGIN && ["localhost", "127.0.0.1"].includes(url.hostname);
  let expiresAt = session.expiresAt;
  if (!local) {
    if (!env.APP_PASSWORD) return null;
    const previewValue = cookie?.match(/(?:^|;\s*)shiptorio_access=([^;]+)/)?.[1];
    const preview = await readSessionDetails(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, previewValue ? `shiptorio_session=${previewValue}` : null, now);
    if (!preview) return null;
    expiresAt = Math.min(expiresAt, preview.expiresAt);
  }
  return { login: session.login, expiresAt, epoch: await browserSocketEpoch(env) };
}

export function browserSocketAllowed(auth: unknown, env: BrowserSocketEnv, epoch: string | null, now = Date.now()): auth is BrowserSocketAuth {
  if (!auth || typeof auth !== "object") return false;
  const value = auth as Partial<BrowserSocketAuth>;
  return !!epoch && !!env.SESSION_SECRET && typeof value.login === "string" && isAllowed(env.ALLOWED_LOGINS ?? "", value.login)
    && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.epoch === epoch;
}
