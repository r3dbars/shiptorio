import { isLocal } from "./auth";
import { sameOriginPath } from "./redirect";
import { makeSessionCookie, readSession } from "./session";

export interface AccessEnv {
  APP_PASSWORD?: string;
  SESSION_SECRET: string;
  DEV_LOGIN?: string;
  SIGNUP_GATE_MODE?: string;
}

const COOKIE = "shiptorio_access";
const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "frame-ancestors 'none'; base-uri 'none'; form-action 'self'", "x-content-type-options": "nosniff" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Secure cookies cannot authenticate an HTTP page. Redirect before showing the form,
// otherwise a successful password POST looks like a silent return to the same gate.
export function secureTransport(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || isLocal(url)) return null;
  url.protocol = "https:";
  // A stale HTTP form must reload securely, not replay its POST with an HTTP Origin.
  const stalePost = request.method !== "GET" && request.method !== "HEAD";
  if (stalePost) { url.pathname = "/"; url.search = ""; }
  return new Response(null, { status: stalePost ? 303 : 308, headers: { location: url.toString(), "cache-control": "no-store" } });
}

const page = (error = "", next = "/", csrf = "") => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shiptorio</title><style>body{background:#1b2448;color:#e6e1d6;font:18px system-ui;display:grid;place-items:center;min-height:95vh}main{max-width:340px;padding:24px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:16px;font:inherit;border-radius:8px;border:0}button{background:#f2a93b;color:#1b2448;cursor:pointer}p{line-height:1.5}small{color:#ff9d9d}</style><main><h1>Shiptorio</h1><p>The factory must grow.</p><form method="post" action="/access"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="next" value="${escapeHtml(next)}"><input aria-label="Password" id="password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required autofocus><button type="submit">Enter the factory</button><small role="alert">${error}</small></form></main></html>`;

// Signed double-submit proof lets privacy browsers submit without Origin/Referer.
// It contains no credentials, expires after ten minutes, and is bound to this host.
const FORM_COOKIE = "shiptorio_access_form";
const FORM_TTL = 600_000;
async function formSignature(secret: string, origin: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`preview-form:${origin}:${payload}`)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function gate(request: Request, secret: string, error = "", next = "/", status = 401): Promise<Response> {
  const payload = `${Date.now() + FORM_TTL}.${crypto.randomUUID()}`;
  const token = `${payload}.${await formSignature(secret, new URL(request.url).origin, payload)}`;
  return new Response(page(error, next, token), { status, headers: { ...headers,
    "set-cookie": `${FORM_COOKIE}=${token}; Path=/access; HttpOnly; Secure; SameSite=Strict; Max-Age=600`,
  } });
}
async function validForm(request: Request, secret: string, token: string | null): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)shiptorio_access_form=([^;]+)/)?.[1];
  if (cookie !== token) return false;
  const [expires, nonce, signature, extra] = token.split(".");
  if (extra || !/^\d+$/.test(expires) || !/^[\da-f-]{36}$/.test(nonce ?? "")) return false;
  const remaining = Number(expires) - Date.now();
  if (remaining <= 0 || remaining > FORM_TTL) return false;
  return signature === await formSignature(secret, new URL(request.url).origin, `${expires}.${nonce}`);
}

// shiptorio.com is public: anyone without the preview cookie gets the landing page at "/"
// (web/public/welcome/), its files, robots/sitemap and the waitlist. Everything else stays gated.
const PUBLIC_FILE = /^\/(?:welcome\/[\w.-]*|robots\.txt|sitemap\.xml)$/;
export type PublicRoute = "landing" | "file" | "waitlist";
export async function publicRoute(request: Request, env: AccessEnv): Promise<PublicRoute | null> {
  const url = new URL(request.url);
  const read = request.method === "GET" || request.method === "HEAD";
  if (read && PUBLIC_FILE.test(url.pathname)) return "file";
  if (url.pathname === "/api/waitlist" && request.method === "POST") return "waitlist";
  if (!read || url.pathname !== "/" || (env.DEV_LOGIN && isLocal(url))) return null;
  // App deep links (/?onboard=repo&source=live from the GitHub install, ?source=sim, ...) still go to the
  // password form, which keeps them as next; only a bare visit or a campaign link gets the landing page.
  if ([...url.searchParams.keys()].some((key) => !/^(?:utm_\w+|ref|joined)$/.test(key))) return null;
  // Waitlist mode: anyone signed in with GitHub goes on to the signup gate (the app, or "pending approval").
  if (env.SIGNUP_GATE_MODE === "waitlist") return /(?:^|;\s*)shiptorio_session=/.test(request.headers.get("cookie") ?? "") ? null : "landing";
  return (await hasPreviewAccess(request, env)) ? null : "landing";
}
async function hasPreviewAccess(request: Request, env: AccessEnv): Promise<boolean> {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) return false;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)shiptorio_access=([^;]+)/)?.[1];
  return !!(await readSession(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, cookie ? `shiptorio_session=${cookie}` : null));
}

export async function previewAccess(request: Request, env: AccessEnv): Promise<Response | null> {
  const secure = secureTransport(request);
  if (secure) return secure;
  const url = new URL(request.url);
  const next = sameOriginPath(url.searchParams.get("next"), url.origin);
  // GitHub and Sentry cannot supply a preview password; their webhooks are independently HMAC authenticated.
  if (url.pathname === "/webhooks/github" || url.pathname === "/webhooks/sentry" || /^\/webhooks\/sentry\/[\w.-]+\/[\w.-]+$/.test(url.pathname)) return null;
  // The deployed commit SHA is public so the Deploy workflow can prove the new build is live.
  if (url.pathname === "/api/version" && request.method === "GET") return null;
  if (env.DEV_LOGIN && isLocal(url)) return null;
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) return new Response("Private preview is being configured.", { status: 503, headers: { "cache-control": "no-store" } });
  const secret = `${env.SESSION_SECRET}:${env.APP_PASSWORD}`;
  if (url.pathname === "/access" && request.method === "POST") {
    // Some Firefox/privacy configurations omit Origin on native form navigations.
    // Foreign origins are always refused; absent/opaque origins can instead
    // prove they loaded our form using its signed token and same-site cookie.
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return new Response("Too large", { status: 413 });
    const raw = await request.text();
    if (raw.length > 4096) return new Response("Too large", { status: 413 });
    const form = new URLSearchParams(raw);
    const origin = request.headers.get("origin");
    let sameSite = origin === url.origin;
    if (origin === null) {
      const referrer = request.headers.get("referer");
      try { sameSite = !!referrer && new URL(referrer).origin === url.origin; } catch { sameSite = false; }
      if (!referrer) sameSite = request.headers.get("sec-fetch-site") === "same-origin" && request.headers.get("sec-fetch-mode") === "navigate";
    }
    if (!sameSite && (origin === null || origin === "null") && request.headers.get("sec-fetch-site") !== "cross-site") sameSite = await validForm(request, secret, form.get("csrf"));
    if (request.headers.get("sec-fetch-site") === "cross-site") sameSite = false;
    if (!sameSite) return gate(request, secret, "Please reopen this site with https://, then enter the password again.", "/", 403);
    const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
    const [given, expected] = await Promise.all([digest(form.get("password") ?? ""), digest(env.APP_PASSWORD)]);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= given[i] ^ expected[i];
    if (diff !== 0) return gate(request, secret, "That password didn’t work.", sameOriginPath(form.get("next"), url.origin));
    const cookie = (await makeSessionCookie(secret, "preview")).replace("shiptorio_session=", `${COOKIE}=`);
    return new Response(null, { status: 303, headers: { location: `/access?check=1&next=${encodeURIComponent(sameOriginPath(form.get("next"), url.origin))}`, "set-cookie": cookie, "cache-control": "no-store" } });
  }
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)shiptorio_access=([^;]+)/)?.[1];
  if (await readSession(secret, cookie ? `shiptorio_session=${cookie}` : null)) {
    if (url.pathname === "/access") return new Response(null, { status: 303, headers: { location: next, "cache-control": "no-store" } });
    return null;
  }
  if (url.pathname === "/access" && url.searchParams.get("check") === "1") {
    return gate(request, secret, "Your browser did not keep the sign-in cookie. Enable cookies for this site, then try again.", next);
  }
  if (url.pathname.startsWith("/api/")) return new Response("Preview password required", { status: 401, headers: { "cache-control": "no-store" } });
  // The landing page links to /access?next=/, so the form sends players straight on to next.
  return gate(request, secret, "", url.pathname === "/access" ? next : url.pathname + url.search);
}
