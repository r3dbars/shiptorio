import { isLocal } from "./auth";
import { makeSessionCookie, readSession } from "./session";

export interface AccessEnv {
  APP_PASSWORD?: string;
  SESSION_SECRET: string;
  DEV_LOGIN?: string;
}

const COOKIE = "shiptorio_access";
const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
const page = (error = "") => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shiptorio</title><style>body{background:#1b2448;color:#e6e1d6;font:18px system-ui;display:grid;place-items:center;min-height:95vh}main{max-width:340px;padding:24px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:16px;font:inherit;border-radius:8px;border:0}button{background:#f2a93b;color:#1b2448;cursor:pointer}p{line-height:1.5}small{color:#ff9d9d}</style><main><h1>Shiptorio</h1><p>The factory must grow.</p><form method="post" action="/access"><input aria-label="Password" id="password" name="password" type="password" autocomplete="current-password" required autofocus><button>Enter the factory</button><small>${error}</small></form></main></html>`;

export async function previewAccess(request: Request, env: AccessEnv): Promise<Response | null> {
  const url = new URL(request.url);
  // GitHub cannot supply a preview password; its webhook is independently HMAC authenticated.
  if (url.pathname === "/webhooks/github") return null;
  if (env.DEV_LOGIN && isLocal(url)) return null;
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) return new Response("Private preview is being configured.", { status: 503, headers: { "cache-control": "no-store" } });
  const secret = `${env.SESSION_SECRET}:${env.APP_PASSWORD}`;
  if (url.pathname === "/access" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) return new Response("Invalid origin", { status: 403 });
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return new Response("Too large", { status: 413 });
    const form = new URLSearchParams(await request.text());
    const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
    const [given, expected] = await Promise.all([digest(form.get("password") ?? ""), digest(env.APP_PASSWORD)]);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= given[i] ^ expected[i];
    if (diff !== 0) return new Response(page("That password didn’t work."), { status: 401, headers });
    const cookie = (await makeSessionCookie(secret, "preview")).replace("shiptorio_session=", `${COOKIE}=`);
    return new Response(null, { status: 303, headers: { location: "/", "set-cookie": cookie, "cache-control": "no-store" } });
  }
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)shiptorio_access=([^;]+)/)?.[1];
  if (await readSession(secret, cookie ? `shiptorio_session=${cookie}` : null)) return null;
  if (url.pathname.startsWith("/api/")) return new Response("Preview password required", { status: 401, headers: { "cache-control": "no-store" } });
  return new Response(page(), { status: 401, headers });
}
