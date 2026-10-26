import { signupAllowed, addPending, redeemInvite } from './signup';
// GitHub login (user-to-server OAuth through the same App) and the one-time App setup page.

import { convertManifestCode } from "./github";
import { isAllowed, makeSessionCookie } from "./session";
import { sameOriginPath } from "./redirect";
import type { Env } from "./index";

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
  if (!code || !state || state !== expected) return new Response("bad login state, try again", { status: 400 });
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${publicUrl(url, env)}/auth/callback`,
    }),
  });
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return new Response("GitHub login failed", { status: 401 });
  const userRes = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${access_token}`, "user-agent": "shiptorio", accept: "application/vnd.github+json" },
  });
  const { login } = (await userRes.json()) as { login: string };
  if (!login || !userRes.ok) return new Response('GitHub login failed',{status:401});
  const normalized = login.toLowerCase();
  const invite = request.headers.get('cookie')?.match(/(?:^|;\s*)shiptorio_invite=([^;]+)/)?.[1];
  if (invite) await redeemInvite(env,decodeURIComponent(invite),normalized);
  if (!await signupAllowed(env,normalized)) await addPending(env,normalized,'github');
  const next = request.headers.get("cookie")?.match(/(?:^|;\s*)shiptorio_next=([^;]+)/)?.[1];
  return new Response(null, {
    status: 302,
    headers: [
      ['location',await signupAllowed(env,normalized) ? sameOriginPath(next && decodeURIComponent(next), url.origin) : '/waitlist'],
      ['set-cookie',await makeSessionCookie(env.SESSION_SECRET,normalized)],
      ['set-cookie','shiptorio_invite=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0'],
      ['set-cookie','shiptorio_oauth_state=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0'],
      ['set-cookie','shiptorio_next=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0'],
    ],
  });
}

export function logout(): Response {
  return new Response(null, {
    status: 302,
    headers: { location: "/", "set-cookie": "shiptorio_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" },
  });
}

// ---- one-time GitHub App setup via the manifest flow ----

export function appManifest(publicUrl: string) {
  return {
    name: "Shiptorio",
    url: publicUrl,
    hook_attributes: { url: `${publicUrl}/webhooks/github` },
    redirect_url: `${publicUrl}/setup/callback`,
    callback_urls: [`${publicUrl}/auth/callback`],
    public: false,
    // Agents only ever open PRs; a human merge launches the rocket.
    default_permissions: { contents: "write", pull_requests: "write", issues: "write", checks: "read", statuses: "read", metadata: "read" },
    // Installation lifecycle events are delivered automatically to every GitHub App.
    default_events: ["issues", "issue_comment", "pull_request", "pull_request_review", "check_suite", "check_run", "push"],
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function setupPage(base: string, env: Env): Response {
  if (env.GITHUB_APP_ID) return new Response("Shiptorio's GitHub App is already set up.", { status: 404 });
  const manifest = escapeHtml(JSON.stringify(appManifest(base)));
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Shiptorio setup</title>
<body style="font-family:system-ui;background:#1B1A18;color:#E6E1D6;padding:40px">
<h1>Create the Shiptorio GitHub App</h1>
<p>This sends you to GitHub with everything pre-filled. You just confirm.</p>
<form action="https://github.com/settings/apps/new" method="post">
<input type="hidden" name="manifest" value="${manifest}">
<button style="font-size:18px;padding:10px 18px">Create GitHub App</button>
</form></body>`,
    { headers: { "content-type": "text/html" } },
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
    `<!doctype html><meta charset="utf-8"><title>Shiptorio setup</title>
<body style="font-family:system-ui;background:#1B1A18;color:#E6E1D6;padding:40px;max-width:900px">
<h1>App created: ${escapeHtml(app.slug)}</h1>
<p>GitHub only shows these once. Run each command and paste the value. Then
<a style="color:#FFA200" href="${escapeHtml(app.html_url)}/installations/new">install the app on your repos</a>.</p>
<h3>${cmd("GITHUB_APP_ID")}</h3><pre>${app.id}</pre>
<h3>${cmd("GITHUB_CLIENT_ID")}</h3><pre>${escapeHtml(app.client_id)}</pre>
<h3>${cmd("GITHUB_CLIENT_SECRET")}</h3><pre>${escapeHtml(app.client_secret)}</pre>
<h3>${cmd("GITHUB_WEBHOOK_SECRET")}</h3><pre>${escapeHtml(app.webhook_secret)}</pre>
<h3>${cmd("GITHUB_APP_PRIVATE_KEY")}</h3><pre>${escapeHtml(app.pem)}</pre>
</body>`,
    { headers: { "content-type": "text/html", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } },
  );
}
