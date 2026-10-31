import { log, observedFetch } from "./telemetry";
import { signupAllowed, addPending, redeemInvite } from './signup';

// GitHub login (user-to-server OAuth through the same App) and the one-time App setup page.

import { gh, registerGithubCredential, convertManifestCode } from "./github";
import { isAllowed, makeSessionCookie, ownerProof } from "./session";
import { createSession, endSession, fetchReach, saveReach, upsertUser, type GitHubUser } from "./accounts";
import { clearGuestCookie, mergeGuest } from "./guests";
import { sameOriginPath } from "./redirect";
import type { Env } from "./index";
import { ironPage } from "./ironPage";
import { escapeHtml } from "./encode";

// ---- login (GitHub App user-to-server OAuth) ----

export function publicUrl(url: URL, env: Env): string {
  return (env.PUBLIC_URL || url.origin).replace(/\/$/, "");
}

export const isLocal = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";

export async function login(url: URL, env: Env): Promise<Response> {
  const next = sameOriginPath(url.searchParams.get("next"), url.origin);
  if (env.DEV_LOGIN && isLocal(url)) {
    return new Response(null, {
      status: 302,
      headers: { location: next, "set-cookie": await makeSessionCookie(env.SESSION_SECRET, env.DEV_LOGIN) },
    });
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return signInJam("GitHub sign-in is not configured", "Ask the operator to finish connecting the GitHub App, then try again.", 503);
  const state = crypto.randomUUID();
  const target = new URL("https://github.com/login/oauth/authorize");
  target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  target.searchParams.set("redirect_uri", `${publicUrl(url, env)}/auth/callback`);
  target.searchParams.set("state", state);
  const headers = new Headers({ location: target.toString() });
  headers.append("set-cookie", `shiptorio_oauth_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  headers.append("set-cookie", `shiptorio_next=${encodeURIComponent(next)}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}

export async function authCallback(request: Request, url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.headers.get("cookie")?.match(/(?:^|;\s*)shiptorio_oauth_state=([^;]+)/)?.[1];
  if (!state || state !== expected) return signInJam("Sign-in jammed", "The sign-in ticket didn't match this browser (bad login state). It happens if the tab sat open too long or cookies are blocked. Try again.", 400);
  if (url.searchParams.get("error") === "access_denied") return signInJam("Sign-in cancelled", "You cancelled GitHub sign-in. No new session was opened. Try again when you're ready.", 400);
  if (!code) return signInJam("GitHub login failed", "GitHub did not return a sign-in ticket. Try again.", 400);
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return signInJam("GitHub sign-in is not configured", "Ask the operator to finish connecting the GitHub App, then try again.", 503);
  const signal = AbortSignal.timeout(8000);
  let phase = "token";
  try {
    const tokenRes = await observedFetch("github", "https://github.com/login/oauth/access_token", {
      method: "POST",
      signal,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${publicUrl(url, env)}/auth/callback`,
      }),
    });
    if (tokenRes.status === 429 || tokenRes.status >= 500) return signInJam("GitHub is unavailable", "GitHub could not finish sign-in right now. Try again shortly.", 503);
    if (!tokenRes.ok) return signInJam("GitHub login failed", "GitHub rejected the sign-in ticket. Try again to get a fresh ticket.", 401);
    const token = await tokenRes.json() as { access_token?: unknown } | null;
    const access_token = token?.access_token;
    if (typeof access_token !== "string" || !access_token) return signInJam("GitHub login failed", "GitHub didn't hand back a sign-in. No new session was opened. Try again.", 401);
    phase = "account";
    const user = await gh<GitHubUser>("/user", access_token);
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== "string" || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(user.login)) return signInJam("GitHub login failed", "GitHub sent back an account we couldn't read. Nothing was changed. Try again.", 401);
    await registerGithubCredential(access_token, env.DB, `github:user:${user.id}`);
    user.login = user.login.toLowerCase();
    const invite = request.headers.get('cookie')?.match(/(?:^|;\s*)shiptorio_invite=([^;]+)/)?.[1];
    if (invite) { try { await redeemInvite(env,decodeURIComponent(invite),user.login); } catch {} }
    const allowed = await signupAllowed(env,user.login);
    if (!allowed) await addPending(env,user.login,'github');
    await upsertUser(env,user);
    // Pending accounts get a revocable session, but no factory access or installation discovery.
    phase = "repositories";
    if (allowed) await saveReach(env,user.id,await fetchReach(access_token));
    phase = "session";
    const next = request.headers.get('cookie')?.match(/(?:^|;\s*)shiptorio_next=([^;]+)/)?.[1];
    const headers = new Headers({location:allowed ? sameOriginPath(next && decodeURIComponent(next),url.origin) : '/waitlist'});
    headers.append('set-cookie',await createSession(env,{id:user.id,login:user.login},request.headers.get('user-agent')));
    if (allowed && await mergeGuest(env, request.headers.get('cookie'), {id:user.id,login:user.login})) headers.append('set-cookie', clearGuestCookie());
    for (const name of ['shiptorio_invite','shiptorio_oauth_state','shiptorio_next']) headers.append('set-cookie',`${name}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return new Response(null,{status:302,headers});
  } catch (error) {
    const timedOut = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    log("warn", "github.signin_unavailable", { phase, timedOut });
    return signInJam(timedOut ? "GitHub took too long" : "Could not connect GitHub", "Sign-in did not finish. Your existing factory is unchanged. Try again to get a fresh sign-in ticket.", 503);
  }
}

export async function logout(request: Request, env: Env): Promise<Response> {
  await endSession(env, request.headers.get("cookie"));
  return new Response(null, {
    status: 302,
    headers: { location: "/", "set-cookie": "shiptorio_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" },
  });
}

// Owner scripts (runner pairing, the dogfood autopilot) prove they hold SESSION_SECRET and get a real,
// revocable session row, like a GitHub sign-in. Only an existing, allowed account qualifies. E2E_OWNER_KEY (staging
// only, scripts/e2e/real-loop.ts) is a second key for the same proof, so the driver never needs SESSION_SECRET and
// replacing it signs nobody out.
export async function ownerSession(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { login?: unknown; at?: unknown; proof?: unknown } | null;
  const { login, at, proof } = body ?? {};
  if (typeof login !== "string" || typeof at !== "number" || typeof proof !== "string" || Math.abs(now - at) > 60_000 ||
    !(proof === await ownerProof(env.SESSION_SECRET, login, at) || (!!env.E2E_OWNER_KEY && proof === await ownerProof(env.E2E_OWNER_KEY, login, at))))
    return Response.json({ error: "bad proof" }, { status: 401 });
  const user = await env.DB.prepare("SELECT id, login FROM users WHERE lower(login) = lower(?)").bind(login).first<{ id: number; login: string }>();
  if (!user || !isAllowed(env.ALLOWED_LOGINS, user.login)) return Response.json({ error: "unknown account" }, { status: 403 });
  return Response.json({ ok: true }, { headers: { "set-cookie": await createSession(env, user, "owner-script", now) } });
}

// ---- one-time GitHub App setup via the manifest flow ----

export function appManifest(publicUrl: string) {
  return {
    name: "Shiptorio",
    url: publicUrl,
    hook_attributes: { url: `${publicUrl}/webhooks/github` },
    redirect_url: `${publicUrl}/setup/callback`,
    // after installing, GitHub sends the player back to pick their repo instead of leaving them on GitHub
    setup_url: `${publicUrl}/github/installed`,
    setup_on_update: true,
    callback_urls: [`${publicUrl}/auth/callback`],
    public: false,
    // Agents only ever open PRs; a human merge launches the rocket.
    default_permissions: { contents: "write", pull_requests: "write", issues: "write", checks: "read", statuses: "read", metadata: "read" },
    // Installation lifecycle events are delivered automatically to every GitHub App.
    default_events: ["issues", "issue_comment", "pull_request", "pull_request_review", "check_suite", "check_run", "push", "repository"],
  };
}


// A failed GitHub round trip lands on an iron plate with one way back in, not a bare text line.
function signInJam(title: string, detail: string, status: number): Response {
  return new Response(ironPage({ title, eyebrow: "Sign-in", alarm: true, body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><a class="btn" href="/auth/login">Try again</a><a class="btn ghost" href="/">Back to the front door</a>` }),
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...(status === 503 ? { "retry-after": "5" } : {}) } });
}

export function setupPage(base: string, env: Env): Response {
  if (env.GITHUB_APP_ID) return new Response("Shiptorio's GitHub App is already set up.", { status: 404 });
  const manifest = escapeHtml(JSON.stringify(appManifest(base)));
  return new Response(
    ironPage({ title: "Setup", eyebrow: "Owner · setup", body: `<h1>Create the Shiptorio GitHub App</h1>
<p>This sends you to GitHub with everything pre-filled. You just confirm.</p>
<form action="https://github.com/settings/apps/new" method="post">
<input type="hidden" name="manifest" value="${manifest}">
<button>Create GitHub App</button>
</form>` }),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function setupCallback(url: URL, env: Env): Promise<Response> {
  if (env.GITHUB_APP_ID) return new Response("already set up", { status: 404 });
  const code = url.searchParams.get("code");
  if (!code) return new Response("missing code", { status: 400 });
  const app = (await convertManifestCode(code)) as Awaited<ReturnType<typeof convertManifestCode>> & {
    client_id: string;
    client_secret: string;
  };
  const cmd = (name: string) => `npx wrangler secret put ${name}`;
  return new Response(
    ironPage({ title: "Setup", eyebrow: "Owner · setup", wide: true, body: `<h1>App created: ${escapeHtml(app.slug)}</h1>
<p>GitHub only shows these once. Run each command and paste the value. Then
<a href="${escapeHtml(app.html_url)}/installations/new">install the app on your repos</a>.</p>
<h3>${cmd("GITHUB_APP_ID")}</h3><pre>${app.id}</pre>
<h3>${cmd("GITHUB_CLIENT_ID")}</h3><pre>${escapeHtml(app.client_id)}</pre>
<h3>${cmd("GITHUB_CLIENT_SECRET")}</h3><pre>${escapeHtml(app.client_secret)}</pre>
<h3>${cmd("GITHUB_WEBHOOK_SECRET")}</h3><pre>${escapeHtml(app.webhook_secret)}</pre>
<h3>${cmd("GITHUB_APP_PRIVATE_KEY")}</h3><pre>${escapeHtml(app.pem)}</pre>` }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } },
  );
}
