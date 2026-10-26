// Tiny signed-cookie session. Login goes through the GitHub App's own OAuth (user-to-server),
// and only logins in ALLOWED_LOGINS get in, since the map exposes private repo structure.

const enc = new TextEncoder();
const COOKIE = "shiptorio_session";
const MAX_AGE = 60 * 60 * 24 * 14;

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function makeSessionCookie(secret: string, login: string, now = Date.now()): Promise<string> {
  const payload = btoa(JSON.stringify({ login, exp: Math.floor(now / 1000) + MAX_AGE }));
  const value = `${payload}.${await hmac(secret, payload)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export async function readSession(secret: string, cookieHeader: string | null, now = Date.now()): Promise<string | null> {
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;
  const [payload, sig] = match[1].split(".");
  if (!payload || !sig || (await hmac(secret, payload)) !== sig) return null;
  try {
    const { login, exp } = JSON.parse(atob(payload));
    return exp > now / 1000 ? login : null;
  } catch {
    return null;
  }
}

export function isAllowed(allowedLogins: string, login: string): boolean {
  return allowedLogins
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(login.toLowerCase());
}
