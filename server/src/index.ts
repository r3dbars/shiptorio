import { signupMode, signupGate, signupPage, signupAllowed, addPending, adminSignup, admit, ipScope, turnstile, resourceQuota, type SignupEnv } from './signup';
import { repoAccess, requireUser as resolveUser, validRepo } from "./authorization";


import { Redactor } from "./redact";
import * as Sentry from "@sentry/cloudflare";
import { currentTrace, inTrace, log, report, sentryOptions, type Trace } from "./telemetry";
import { adminRoutes } from "./admin";

import { Hono, type Context, type Next } from "hono";
import { ops } from "./ops";
import { authCallback, login, logout, ownerSession, publicUrl, setupCallback, setupPage } from "./auth";
import { Factory, type FactoryEnv } from "./factory";
import { appJwt, gh, repoInstallationId } from "./github";
import { currentUser, MAX_PROGRESS_BYTES, readPrefs, readProgress, reposFor, writePrefs, writeProgress, type User } from "./accounts";

import { isAllowed } from "./session";

import { previewAccess, secureTransport } from "./access";
import { githubSource } from "./sources";
import { sentryStatus, sentryWebhookUrl, type SentryPayload } from "./sources/sentry";
import { postHogStatus } from "./sources/posthog";
import { verifyHmac } from "./sources/types";
import { linkedRepo, postHogCreds, saveCreds, sentryCreds, credentialStatus, revokeCreds, markUsed, type CredentialScope } from "./sources/creds";
import { connectPage } from "./connect";
import type { GitHubPayload } from "./sources/github";
import { pairToken, readRunnerToken, type RunnerIdentity } from "./runner-auth";
import { EnqueueRunner, RunnerHarness, RunnerReceipt } from "./runner-job";
import { installationToken } from "./github";
import { CODE_RE, DEVICE_TTL, normalizeCode, secretHash, htmlEscape, runnerPage } from "./device-pairing";
import { emptyIsland, type Empire, type IslandSummary } from "@shiptorio/shared";

import { browserMutationAllowed, securityHeaders } from "./security";
import { ipSubject, rateLimit, requestBudget } from "./rate-limit";


export { Factory };

export interface Env extends FactoryEnv, SignupEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  CACHE: KVNamespace;
  FACTORY: DurableObjectNamespace<Factory>;
  PUBLIC_URL?: string; // optional override; defaults to the request origin
  DEV_LOGIN?: string; // local only: skip GitHub login on localhost as this user
  ALLOWED_LOGINS: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  APP_PASSWORD?: string;
  BUILD_SHA?: string;
  GITHUB_APP_SLUG?: string; // optional: skips the GET /app lookup for the install link
  ADMIN_LOGINS?: string;
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const factory = (env: Env, repo: string) => {
  const stub = env.FACTORY.get(env.FACTORY.idFromName(repo.toLowerCase()));
  const trace = { ...currentTrace(), requestId: currentTrace()?.requestId ?? crypto.randomUUID(), repo: repo.toLowerCase() };
  // Capture per call, never put mutable request identity on a shared DO instance.
  return new Proxy(stub, { get(target, method) {
    if (method === "fetch") return (request: Request) => {
      const headers = new Headers(request.headers);
      headers.set("X-Request-ID", trace.requestId);
      return target.fetch(new Request(request, { headers }));
    };
    return (...args: unknown[]) => (target as unknown as { observedCall(method: string, args: unknown[], trace: Trace): Promise<unknown> }).observedCall(String(method), args, trace);
  } }) as typeof stub;
};

const signedIn = (c: { env: Env; req: { header(name: string): string | undefined; url: string } }) => currentUser(c.env, c.req.header("cookie") ?? null, new URL(c.req.url));

type AppEnv = { Bindings: Env; Variables: { user: User; runner: RunnerIdentity; artNonce: string } };
const app = new Hono<AppEnv>();
export const requireUser = async (c: Context<AppEnv>, next: Next) => {
  const user = await resolveUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "login required" }, 401);
  c.set("user", user);
  await next();
};

app.use("*", async (c, next) => {
  const trace: Trace = { requestId: crypto.randomUUID() };
  const match = c.req.path.match(/^\/api\/repos\/([\w.-]+\/[\w.-]+)/);
  if (match) trace.repo = match[1].toLowerCase();
  const start = Date.now();
  return inTrace(trace, c.env, task => c.executionCtx.waitUntil(task), async () => {
    c.header("X-Request-ID", trace.requestId);
    const user = await currentUser(c.env, c.req.header("cookie") ?? null, new URL(c.req.url));
    if (user) { trace.userId = user.login; Sentry.setUser({ id: user.login }); }
    await next();
    // A response can be replaced by auth, assets, or a websocket upgrade.
    c.header("X-Request-ID", trace.requestId);
    log(c.res.status >= 500 ? "error" : "info", c.req.path.startsWith("/webhooks/") ? "webhook.delivery" : "http.request", {
      method: c.req.method, path: c.req.path, status: c.res.status, durationMs: Date.now() - start,
      ...(c.req.path.startsWith("/webhooks/") ? { deliveryId: c.req.header("x-github-delivery") ?? c.req.header("request-id"), webhookEvent: c.req.header("x-github-event") ?? c.req.header("sentry-hook-resource") } : {}),
    });
  });
});

app.use("*", async (c, next) => {
  const redirect = secureTransport(c.req.raw);
  if (redirect) c.res = redirect;
  else await next();
  for (const [key, value] of Object.entries(securityHeaders(c.req.raw, c.get("artNonce"), signupMode(c.env) === "waitlist", c.env.SHIPTORIO_SENTRY_DSN))) c.header(key, value);

});

app.use("*", async (c, next) => {
  // Use the router's decoded path, so encoded aliases consume the same budget.
  const budget = requestBudget(c.req.raw, c.req.path);
  if (budget) {
    const user = await signedIn(c);
    for (const subject of [ipSubject(c.req.raw), ...(user ? [`user:${user.id}`] : [])]) {
      const result = await rateLimit(c.env, subject, budget);
      if (!result.allowed) {
        c.header("Retry-After", String(result.retryAfter));
        return c.json({ error: "too many requests" }, 429);
      }
    }
  }
  await next();
});

app.use("*", async (c, next) => {
  // Installer and device exchange have no browser cookies. Device approval still requires
  // the normal preview + user session and same-origin form submission below.
  if (["/install.sh", "/runner.mjs", "/runner-manifest.json", "/docs/runner", "/api/runner-device/start", "/api/runner-device/poll"].includes(c.req.path)) {
    await next(); c.header("Cache-Control", "no-store"); return;
  }
  if (c.req.path.startsWith("/api/runner/")) {
    const match = c.req.path.match(/^\/api\/runner\/([\w.-]+)\/([\w.-]+)\/(claim|finish|renew|heartbeat)$/);
    const identity = await readRunnerToken(c.env.SESSION_SECRET, c.req.header("authorization")?.replace(/^Bearer /, "") ?? "");
    if (!match || c.req.method !== "POST" || !identity || identity.repo !== `${match[1]}/${match[2]}`.toLowerCase()) {
      if (!await admit(c.env,await ipScope(c.req.raw,'pairing'),10,60000,'repeated failed runner authentication')) return c.json({error:'try again later'},429);
      return c.json({error:'runner authentication required'},401);
    }
    if (!identity.user || !await signupAllowed(c.env,identity.user.login) || !await repoAccess(c.env, identity.user, identity.repo)) return c.json({error:'repository access denied'},403);
    if (!await factory(c.env,identity.repo).isRunnerPaired(identity.pairId)) {
      if (!await admit(c.env,await ipScope(c.req.raw,'pairing'),10,60000,'repeated revoked pairings')) return c.json({error:'try again later'},429);
      return c.json({error:'runner pairing revoked'},401);
    }

    c.set("runner", identity);
    await next();
    c.header("Cache-Control", "no-store");
    return;
  }
  if (c.req.path === "/api/health" && ["GET", "HEAD"].includes(c.req.method)) { await next(); c.header("Cache-Control", "no-store"); return; }
  const denied = signupMode(c.env) === "password" ? await previewAccess(c.req.raw, c.env) : await signupGate(c.req.raw, c.env);
  if (denied) return denied;
  await next();
  c.header("Cache-Control", "no-store");
});

app.onError((err, c) => {
  report(err, "http.exception");
  return c.json({ error: "Something broke. Please reload.", requestId: currentTrace()?.requestId }, 500);

});

app.use("*", async (c, next) => {
  if (!browserMutationAllowed(c.req.raw, c.req.path)) return c.json({ error: "invalid origin" }, 403);
  await next();

});

app.use("*", async (c, next) => {
  const path = c.req.path;
  const match = path.match(/^\/api\/repos\/([^/]+)\/([^/]+)/);
  const scoped = !!match || path.startsWith("/connect/") || ["/api/sources", "/api/setup/status"].includes(path);
  if (path === "/setup" || path === "/setup/callback") {
    if (c.env.GITHUB_APP_ID) return c.notFound();
    const user = await resolveUser(c.req.raw, c.env);
    if (!user) return c.json({ error: "login required" }, 401);
  }
  if (scoped) {
    const user = await resolveUser(c.req.raw, c.env);
    if (!user) return c.json({ error: "login required" }, 401);
    const repo = match ? `${match[1]}/${match[2]}` : c.req.query("repo") ?? "";
    if (!validRepo(repo) || !await repoAccess(c.env, user, repo)) return c.json({ error: "repository access denied" }, 403);
    if (match && (!await resourceQuota(c.env,user.login,'repo',repo) || !await resourceQuota(c.env,user.login,'factory',repo))) return c.json({error:'repository/factory quota reached'},429);
    c.set("user", user);
  }
  await next();
});

app.route("/", ops);

// ---------- auth + setup ----------

app.get("/auth/login", (c) => signupMode(c.env) === 'password' ? login(new URL(c.req.url), c.env) : signupPage(c.env));
app.post('/auth/login', async c => {
  if (c.req.header('origin') !== new URL(c.req.url).origin) return c.text('Invalid origin',403);
  if (!await admit(c.env,await ipScope(c.req.raw,'signin'),10,600000,'sign-in flood')) return c.text('Try again later',429);
  const raw = await c.req.text();
  if (raw.length>4096) return c.text('Too large',413);
  const form = new URLSearchParams(raw);
  if (!await turnstile(c.req.raw,c.env,form,'signin')) return signupPage(c.env,'Please complete verification. If it is unavailable, try again later.',403);
  const response = await login(new URL(c.req.url),c.env);
  // Store invite on the OAuth path; never include it in GitHub URLs or logs.
  const invite = form.get('invite') || '';
  if (invite.length <=100 && invite) response.headers.append('set-cookie',`shiptorio_invite=${encodeURIComponent(invite)}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return response;
});
app.get('/waitlist',c => signupPage(c.env));
app.post('/waitlist',async c => {
  if (c.req.header('origin') !== new URL(c.req.url).origin) return c.text('Invalid origin',403);
  if (!await admit(c.env,await ipScope(c.req.raw,'waitlist'),5,3600000,'waitlist flood')) return c.text('Try again later',429);
  const raw = await c.req.text();
  if (raw.length>4096) return c.text('Too large',413);
  const form=new URLSearchParams(raw),email=(form.get('email')||'').trim().toLowerCase();
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return signupPage(c.env,'Enter a valid email.',400);
  if (!await turnstile(c.req.raw,c.env,form,'waitlist')) return signupPage(c.env,'Please complete verification. If it is unavailable, try again later.',403);
  await addPending(c.env,email,'email');
  return signupPage(c.env,'You are on the waitlist. Justin will review your request.');
});
app.on(['GET','POST'],'/admin/signup',c=>adminSignup(c.req.raw,c.env));
app.post('/admin',c=>adminSignup(c.req.raw,c.env));
app.get("/auth/callback", (c) => authCallback(c.req.raw, new URL(c.req.url), c.env));
app.get("/auth/logout", (c) => logout(c.req.raw, c.env));
app.post("/auth/owner-session", (c) => ownerSession(c.req.raw, c.env));
app.get("/setup", (c) => setupPage(publicUrl(new URL(c.req.url), c.env), c.env));
app.get("/setup/callback", (c) => setupCallback(new URL(c.req.url), c.env));

app.get("/api/me", async (c) => {
  const user = await signedIn(c);
  if (!user) return c.json({ login: null, allowed: false, installUrl: await installUrl(c.env) });
  return c.json({ login: user.login, allowed: true, prefs: await readPrefs(c.env, user), installUrl: await installUrl(c.env) });
});

// Settings that follow the player across browsers (intro seen, guide progress).
app.put("/api/me/prefs", async (c) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "invalid origin" }, 403);
  const text = await c.req.text();
  if (text.length > 1024) return c.json({ error: "too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return c.json({ error: "invalid JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !(await writePrefs(c.env, user, body as Record<string, unknown>))) return c.json({ error: "invalid prefs" }, 400);
  return c.json({ ok: true });
});

// Progression (levels, streak, unlocks) follows the player across devices. The web merges, then writes the whole blob.
app.get("/api/me/progress", async (c) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  return c.json({ progress: await readProgress(c.env, user) });
});

app.put("/api/me/progress", async (c) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "invalid origin" }, 403);
  const text = await c.req.text();
  if (text.length > MAX_PROGRESS_BYTES) return c.json({ error: "too large" }, 413);
  if (!(await writeProgress(c.env, user, text))) return c.json({ error: "invalid progress" }, 400);
  return c.json({ ok: true });
});

/** Where a player installs the App on more repos. The slug is read once from GitHub and cached. */
async function installUrl(env: Env): Promise<string | null> {
  if (env.GITHUB_APP_SLUG) return `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) return null;
  let slug = await env.CACHE?.get("app:slug");
  if (!slug) {
    slug = await gh<{ slug: string }>("/app", await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY)).then((a) => a.slug);
    if (slug) await env.CACHE?.put("app:slug", slug, { expirationTtl: 86400 });
  }
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

async function requestScope(c: Context<AppEnv>): Promise<CredentialScope | null> {
  const user = await resolveUser(c.req.raw, c.env);
  const repo = c.req.query("repo")?.toLowerCase();
  if (!user || !repo || !validRepo(repo) || !(await repoAccess(c.env, user, repo))) return null;
  const row = await c.env.DB.prepare("SELECT installation_id FROM repos WHERE full_name = ?").bind(repo).first<{ installation_id: number }>();
  return row?.installation_id ? { installationId: row.installation_id, repo, user: String(user.id) } : null;
}

app.get("/api/setup/status", async (c) => {
  const scope = await requestScope(c);
  if (!scope) return c.json({ error: "repository access denied" }, 403);
  return c.json({
  sentry: !!(await sentryCreds(c.env, scope)).clientSecret,
  posthog: c.env.FAKE_POSTHOG === "1" || !!(await postHogCreds(c.env, scope)).apiKey,
  github: !!(c.env.GITHUB_APP_ID && c.env.GITHUB_APP_PRIVATE_KEY && c.env.GITHUB_WEBHOOK_SECRET && c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET),
  spark: !!c.env.META_API_KEY,
  githubAppId: !!c.env.GITHUB_APP_ID,
  githubPrivateKey: !!c.env.GITHUB_APP_PRIVATE_KEY,
  githubWebhookSecret: !!c.env.GITHUB_WEBHOOK_SECRET,
  githubClientId: !!c.env.GITHUB_CLIENT_ID,
  githubClientSecret: !!c.env.GITHUB_CLIENT_SECRET,
}); });

app.get("/api/version", (c) => c.json({ commit: c.env.BUILD_SHA || "unknown" }));

app.get("/api/sources", async (c) => {
  const url = publicUrl(new URL(c.req.url), c.env);
  const scope = await requestScope(c);
  if (!scope) return c.json({ error: "repository access denied" }, 403);
  return c.json({ sources: [githubSource.status(c.env), sentryStatus(await sentryCreds(c.env, scope), url, scope.repo), postHogStatus(await postHogCreds(c.env, scope), url, c.env.FAKE_POSTHOG === "1")] });
});

// Device-code flow. No subscription credential or browser cookie crosses to the runner.
const device = (env: Env, code: string) => factory(env, `device:${code}`);
async function deviceRepoAccess(env: Env, user: import("./authorization").AccessUser, repo: string): Promise<number | null> {
  if (!REPO_RE.test(repo) || repo.split("/").some(p => p === "." || p === "..")) return null;
  const installation = await repoAccess(env, user, repo);
  if (!installation) return null;
  try {
    const token = await installationToken(env, installation);
    const permission = await gh<{ permission: string; user: { id: number } }>(`/repos/${repo}/collaborators/${encodeURIComponent(user.login)}/permission`, token);
    return permission.user?.id === user.id && ["write", "maintain", "admin"].includes(permission.permission) ? installation : null;
  } catch { return null; }
}
app.post("/api/runner-device/start", async c => {
  const bucket = await secretHash(c.req.header("cf-connecting-ip") ?? "local");
  if (!await factory(c.env, `device-rate:${bucket}`).allowDeviceStart()) return c.json({ error: "Too many pairing requests. Try again in 10 minutes." }, 429);
  // No client input: high-entropy human code and secret are generated by the server.
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
  const secret = crypto.randomUUID() + crypto.randomUUID();
  const expires = Date.now() + DEVICE_TTL;
  if (!await device(c.env, code).startDevice(await secretHash(secret), expires)) return c.json({ error: "Try again" }, 409);
  return c.json({ code, secret, expires, interval: 3, verificationUri: `${publicUrl(new URL(c.req.url), c.env)}/runner/pair?code=${code}` });
});
app.post("/api/runner-device/poll", async c => {
  const raw = await c.req.text();
  if (raw.length > 512) return c.json({ error: "too large" }, 413);
  let body: { code?: string; secret?: string };
  try { body = JSON.parse(raw); } catch { return c.json({ error: "invalid JSON" }, 400); }
  if (typeof body?.code !== "string" || !CODE_RE.test(body.code) || typeof body.secret !== "string" || body.secret.length !== 72) return c.json({ error: "invalid device" }, 400);
  return c.json(await device(c.env, body.code).pollDevice(await secretHash(body.secret)));
});
app.on(["GET", "POST"], "/runner/pair", async c => {
  const user = await resolveUser(c.req.raw, c.env);
  if (!user) return c.redirect(`/auth/login?next=${encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search)}`);
  const code = normalizeCode(c.req.query("code") ?? "");
  const headers = { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "referrer-policy": "no-referrer" };
  if (!CODE_RE.test(code)) return c.html(runnerPage("Connect your machine", "<p>Start the installer on your computer to get a fresh pairing code. <a href='/docs/runner'>Runner instructions</a>.</p>"), 400, headers);
  if (c.req.method === "POST") {
    if (c.req.header("origin") !== new URL(c.req.url).origin) return c.text("invalid origin", 403);
    const raw = await c.req.text();
    if (raw.length > 1024) return c.text("too large", 413);
    const repo = String(new URLSearchParams(raw).get("repo") ?? "").trim().toLowerCase();
    const installation = await deviceRepoAccess(c.env, user, repo);
    if (!installation) return c.html(runnerPage("Repository unavailable", "<p>You need write access and a Shiptorio GitHub App installation for this repo. Go back and choose another.</p>"), 403, headers);
    // Reserve approval before rotating the repo credential: concurrent approvals must not
    // rotate a second token after the first has already been delivered to the runner.
    if (!await resourceQuota(c.env, user.login, "repo", repo) || !await resourceQuota(c.env, user.login, "factory", repo)) return c.json({ error: "repository/factory quota reached" }, 429);
    if (!await admit(c.env, `pair:${user.id}`, 5, 600000, "repeated browser pairing requests")) return c.json({ error: "pairing throttled" }, 429);
    const f = factory(c.env, repo);
    await f.ensure(repo, installation);
    const pairId = crypto.randomUUID(), expires = Date.now() + 8 * 60 * 60 * 1000;
    const token = await pairToken(c.env.SESSION_SECRET, { repo, pairId, expires, user });
    if (!await device(c.env, code).approveDevice({ repo, token, expires })) return c.html(runnerPage("Code expired or already used", "<p>Run shiptorio-runner pair for a new code.</p>"), 409, headers);
    await f.activateRunner(pairId);
    await device(c.env, code).readyDevice();
    return c.html(runnerPage("Machine approved", `<p>Your terminal will confirm connection to <b>${htmlEscape(repo)}</b>. Return there to finish pairing, then <a href="/?source=live&repo=${encodeURIComponent(repo)}">open your factory</a>. The planner asks you to approve a plan before any code runs.</p>`), 200, headers);
  }
  const wanted = c.req.query("repo") ?? "";
  return c.html(runnerPage("Connect your machine", `<p>Check that your terminal shows this exact code:</p><h2><code>${code}</code></h2><p>Only approve a code you just requested on your own computer.</p><form method="post"><label>Repository (owner/name)<input name="repo" required pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+" value="${htmlEscape(wanted)}" placeholder="you/your-repo"></label><button>Connect this repo</button></form><p>This replaces the previous machine for that repo. Pair again to add another repo to this machine. Your Claude and Codex sign-ins stay on your computer.</p>`), 200, headers);
});
app.get("/api/repos/:owner/:repo/runner/status", async c => {
  const user = await resolveUser(c.req.raw, c.env);
  const repo = `${c.req.param("owner")}/${c.req.param("repo")}`.toLowerCase();
  if (!user || !await deviceRepoAccess(c.env, user, repo)) return c.json({ error: "repository access required" }, 403);
  return c.json(await factory(c.env, repo).runnerStatus());
});


// ---------- connect a mine (Sentry, PostHog): paste the key once ----------

app.on(["GET", "POST"], "/connect/:kind", async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "sentry" && kind !== "posthog") return c.notFound();
  const user = await resolveUser(c.req.raw, c.env);
  if (!user) return c.redirect(`/auth/login?next=${encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search)}`);
  const url = publicUrl(new URL(c.req.url), c.env);
  const scope = await requestScope(c);
  if (!scope) return c.text("You don't have access to that repo's factory.", 403);
  const repo = scope.repo;
  const webhookUrl = sentryWebhookUrl(url, repo);
  if (c.req.method === "GET") {
    const { connected, lastUsedAt, workerOverride } = await credentialStatus(c.env, kind, scope);
    return c.html(connectPage({ kind, repo, connected, lastUsedAt, workerOverride, webhookUrl }));
  }
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.text("invalid origin", 403);
  const form = await c.req.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  if (field("action") === "revoke") {
    await revokeCreds(c.env, kind, scope);
    await factory(c.env, repo).disconnectMine(kind);
    return c.html(connectPage({ kind, repo, connected: false, webhookUrl, revoked: true }));
  }
  const { connected, workerOverride } = await credentialStatus(c.env, kind, scope);
  if (workerOverride) return c.html(connectPage({ kind, repo, connected, workerOverride, webhookUrl, error: "This factory uses an operator-managed key. Ask the operator to rotate it." }), 409);
  if (!c.env.CRED_MASTER_KEY) return c.text("Encrypted credential storage is not configured. Ask the operator to set CRED_MASTER_KEY.", 503);
  if (kind === "sentry") {
    const clientSecret = field("clientSecret");
    if (!/^[\w-]{16,200}$/.test(clientSecret)) return c.html(connectPage({ kind, repo, connected, webhookUrl, error: "That doesn't look like a Sentry Client Secret." }), 400);
    await saveCreds(c.env, "sentry", { clientSecret }, scope);
  } else {
    const apiKey = field("apiKey");
    const projectId = field("projectId");
    const host = field("host") === "eu" ? "https://eu.posthog.com" : "https://us.posthog.com";
    const keyEvent = field("keyEvent") || "$pageview";
    if (!/^ph[a-z]_[\w]{10,200}$/.test(apiKey) || !/^\d{1,12}$/.test(projectId) || !/^[\w$ .:-]{1,100}$/.test(keyEvent)) return c.html(connectPage({ kind, repo, connected, webhookUrl: "", error: "Check the key (starts with phx_) and the project id (a number)." }), 400);
    await saveCreds(c.env, "posthog", { apiKey, projectId, host, keyEvent }, scope);
  }
  // Plug it straight into the map it came from.
  await factory(c.env, repo).ensure(repo, scope.installationId);
  await factory(c.env, repo).connectMine(kind);
  return c.html(connectPage({ kind, repo, connected: true, webhookUrl, saved: true }));
});

app.get("/api/repos", async (c) => {
  const user = await resolveUser(c.req.raw, c.env);
  if (!user) return c.json({ error: "login required" }, 401);
  const repos = { results: await reposFor(c.env, user) };
  // Preserve the legacy database fields while serving the browser's repo-card contract.
  // Issue counts are not available from this query; omit them rather than inventing zero.
  return c.json({ repos: (await Promise.all(repos.results.map(async repo => await repoAccess(c.env, user, repo.full_name) ? repo : null))).filter((repo): repo is NonNullable<typeof repo> => !!repo).map(repo => ({
    ...repo,
    fullName: repo.full_name,
    blurb: repo.default_branch ? `Default branch: ${repo.default_branch}` : "Connected GitHub repository",
  })) });
});

// The empire overview: one small summary per repo this player can reach (shared/src/empire.ts).
// Repos never opened come back as ready: false; the map still draws them as islands.
app.get("/api/empire", async (c) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  const repos = (await reposFor(c.env, user)).slice(0, 24);
  const islands = await Promise.all(repos.map(async (r): Promise<IslandSummary> => {
    const summary = await Promise.race([
      factory(c.env, r.full_name).summary().catch(() => null),
      new Promise<null>((ok) => setTimeout(() => ok(null), 2500)),
    ]);
    return summary ?? emptyIsland(r.full_name);
  }));
  return c.json({ islands } satisfies Empire);
});

// ---------- the factory (browser websocket) ----------

app.post("/api/repos/:owner/:repo/runner/:action", async (c) => {
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "invalid origin" }, 403);
  const repo = `${c.req.param("owner")}/${c.req.param("repo")}`.toLowerCase();
  if (!REPO_RE.test(repo)) return c.json({ error: "bad repo" }, 400);
  const f = factory(c.env, repo);
  if (c.req.param("action") === "revoke") {
    await f.revokeRunner();
    return c.json({ revoked: true });
  }
  await f.ensure(repo, await installationFor(c.env, repo));
  if (c.req.param("action") === "disconnect") {
    if (!await deviceRepoAccess(c.env, (await resolveUser(c.req.raw, c.env))!, repo)) return c.json({ error: "repository access required" }, 403);
    await f.revokeRunner(); return c.json({ ok: true });
  }
  if (c.req.param("action") === "pair") {
    if (!await admit(c.env,`pair:${c.get("user").id}`,5,600000,'repeated browser pairing requests')) return c.json({error:'pairing throttled'},429);
    const pairId = await f.pairRunner();
    const expires = Date.now() + 8 * 60 * 60 * 1000;
    return c.json({ token: await pairToken(c.env.SESSION_SECRET, { repo, pairId, expires, user: (await resolveUser(c.req.raw, c.env))! }), expires });
  }
  if (c.req.param("action") !== "jobs") return c.json({ error: "unknown action" }, 404);
  const text = await c.req.text();
  if (text.length > 8192) return c.json({ error: "too large" }, 413);
  const parsed = EnqueueRunner.safeParse(JSON.parse(text));
  if (!parsed.success) return c.json({ error: "invalid job" }, 400);
  try { return c.json(await f.enqueueRunner(parsed.data,c.get("user").login), 202); }
  catch (error) {
    if (error instanceof Error && error.message.includes('Daily run quota reached')) return c.json({error:'daily run quota reached'},429);
    throw error;
  }
});

app.get("/api/repos/:owner/:repo/runner/jobs", async (c) => c.json(await factory(c.env, `${c.req.param("owner")}/${c.req.param("repo")}`).runnerJobs()));

app.post("/api/runner/:owner/:repo/claim", async (c) => {
  const identity = c.get("runner");
  const body = await c.req.text();
  if (body.length > 1024) return c.json({ error: "too large" }, 413);
  const raw = JSON.parse(body);
  if (!Array.isArray(raw.harnesses) || raw.harnesses.length > 2 || raw.harnesses.some((h: unknown) => !RunnerHarness.safeParse(h).success)) return c.json({ error: "invalid harnesses" }, 400);
  return c.json({ job: await factory(c.env, identity.repo).claimRunner(identity.pairId, raw.harnesses) });
});

app.post("/api/runner/:owner/:repo/heartbeat", async c => {
  const identity = c.get("runner");
  const body = await c.req.text();
  if (body.length > 1024) return c.json({ error: "too large" }, 413);
  let raw: { harnesses?: unknown }; try { raw = JSON.parse(body); } catch { return c.json({ error: "invalid JSON" }, 400); }
  if (!Array.isArray(raw?.harnesses) || raw.harnesses.length > 2 || raw.harnesses.some((h: unknown) => !RunnerHarness.safeParse(h).success)) return c.json({ error: "invalid harnesses" }, 400);
  const f = factory(c.env, identity.repo);
  if (!await f.isRunnerPaired(identity.pairId)) return c.json({ error: "Runner pairing revoked" }, 401);
  await f.heartbeatRunner(identity.pairId, raw.harnesses); return c.json({ ok: true });
});

app.post("/api/runner/:owner/:repo/renew", async (c) => {
  const identity = c.get("runner");
  if (!(await factory(c.env, identity.repo).isRunnerPaired(identity.pairId))) return c.json({ error: "Runner pairing revoked" }, 401);
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  return c.json({ token: await pairToken(c.env.SESSION_SECRET, { ...identity, expires }), expires });
});

app.post("/api/runner/:owner/:repo/finish", async (c) => {
  const identity = c.get("runner");
  const body = await c.req.text();
  if (body.length > 16384) return c.json({ error: "too large" }, 413);
  const parsed = RunnerReceipt.safeParse(JSON.parse(body));
  if (!parsed.success) return c.json({ error: "invalid receipt" }, 400);
  return c.json(await factory(c.env, identity.repo).finishRunner(identity.pairId, parsed.data));
});

// Exports are stricter than map access: only the repository owner can download them.
app.get("/api/repos/:owner/:repo/export", async (c) => {
  const repo = `${c.req.param("owner")}/${c.req.param("repo")}`.toLowerCase();
  if (!REPO_RE.test(repo)) return c.json({ error: "bad repo" }, 400);
  if (c.get("user").login.toLowerCase() !== c.req.param("owner").toLowerCase()) return c.json({ error: "owner required" }, 403);
  const connected = await c.env.DB.prepare("SELECT installation_id FROM repos WHERE full_name = ?").bind(repo).first();
  if (!connected) return c.json({ error: "factory not found" }, 404);
  const data = await factory(c.env, repo).exportState();
  if (!data) return c.json({ error: "factory not found" }, 404);
  c.header("Content-Disposition", `attachment; filename="${repo.replace("/", "-")}-factory.json"`);
  c.header("X-Content-Type-Options", "nosniff");
  return c.json(data);
});

app.get("/api/repos/:owner/:repo/factory", async (c) => {
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "invalid origin" }, 403);
  const repo = `${c.req.param("owner")}/${c.req.param("repo")}`;
  if (!REPO_RE.test(repo)) return c.json({ error: "bad repo" }, 400);
  const f = factory(c.env, repo);
  if (c.env.GITHUB_APP_ID) {
    const installationId = await installationFor(c.env, repo);
    if (installationId) await f.ensure(repo, installationId);
  }
  return f.fetch(c.req.raw);
});

async function installationFor(env: Env, repo: string): Promise<number> {
  const row = await env.DB.prepare("SELECT installation_id FROM repos WHERE full_name = ?")
    .bind(repo.toLowerCase())
    .first<{ installation_id: number }>();
  return row?.installation_id ?? (await repoInstallationId(env, repo));
}

// ---------- GitHub webhooks ----------

app.post("/webhooks/github", async (c) => {
  if (Number(c.req.header("content-length") ?? 0) > 1048576) return c.json({ error: "payload too large" }, 413);
  if (!(await githubSource.verify(c.req.raw.clone(), c.env))) return c.json({ error: "bad signature" }, 401);
  const body = await c.req.text();
  if (body.length > 1048576) return c.json({ error: "payload too large" }, 413);
  let payload: GitHubPayload;
  try { payload = JSON.parse(body); } catch { return c.json({ error: "invalid JSON" }, 400); }
  if (!payload || typeof payload !== "object") return c.json({ error: "invalid payload" }, 400);
  const event = c.req.header("x-github-event") ?? "";
  const supported = ["installation", "installation_repositories", "issues", "issue_comment", "pull_request", "pull_request_review", "check_run", "check_suite", "push"];
  if (!supported.includes(event)) return c.json({ ok: true, ignored: true });
  const delivery = c.req.header("x-github-delivery");
  if (!delivery || !/^[a-zA-Z0-9_-]{1,200}$/.test(delivery)) return c.json({ error: "delivery id required" }, 400);
  const repo = payload.repository?.full_name;
  const installation = payload.installation?.id;
  if (!Number.isSafeInteger(installation) || installation! <= 0 || (repo && !REPO_RE.test(repo))) return c.json({ error: "invalid installation or repo" }, 400);
  if (!repo && !["installation", "installation_repositories"].includes(event)) return c.json({ error: "repo required" }, 400);
  if (repo && currentTrace()) { currentTrace()!.repo = repo.toLowerCase(); Sentry.setTag("repo", repo.toLowerCase()); }
  if (!await admit(c.env,`webhook:github:${installation}`,300,60000,'GitHub webhook flood')) return c.json({error:'webhook throttled'},429);
  if (event === 'installation' && payload.action === 'created') {
    const account = payload.installation?.account?.login?.toLowerCase();
    if (!account || !await admit(c.env,`install:${account}`,10,3600000,'many installs from one account')) return c.json({error:'installation throttled'},429);
  }

  const now = Date.now();
  const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO webhook_deliveries (source, delivery_id, received_at, expires_at) VALUES ('github', ?, ?, ?)").bind(delivery, now, now + 7 * 86400000).run();
  if (!inserted.meta.changes) {
    const previous = await c.env.DB.prepare("SELECT state FROM webhook_deliveries WHERE source = 'github' AND delivery_id = ?").bind(delivery).first<{ state: string }>();
    if (previous?.state === "done") return c.json({ ok: true, duplicate: true });
  }
  // Persistence is acknowledged before returning; API and model work run in the DO alarm.
  await factory(c.env, ["installation", "installation_repositories"].includes(event) ? "github-installations" : repo!).enqueueGitHub(delivery, event, payload);
  c.executionCtx.waitUntil(c.env.DB.prepare("DELETE FROM webhook_deliveries WHERE expires_at < ? AND state = 'done'").bind(now).run());
  return c.json({ ok: true, queued: true, duplicate: !inserted.meta.changes }, 202);
});

// ---------- Sentry webhooks ----------

// /webhooks/sentry/<owner>/<repo> is checked with that map's own secret. The bare URL is the
// pre-accounts one and still feeds the repo the legacy shared key is linked to.
app.post("/webhooks/sentry/:owner/:repo", (c) => sentryWebhook(c, `${c.req.param("owner")}/${c.req.param("repo")}`.toLowerCase()));
app.post("/webhooks/sentry", (c) => sentryWebhook(c, null));

async function sentryWebhook(c: Context<AppEnv>, perRepo: string | null) {
  if (!/^[a-f0-9]{64}$/i.test(c.req.header("sentry-hook-signature") ?? "")) return c.json({ error: "bad signature" }, 401);
  if (perRepo && !REPO_RE.test(perRepo)) return c.json({ error: "bad repo" }, 400);
  if (Number(c.req.header("content-length") ?? 0) > 1048576) return c.json({ error: "payload too large" }, 413);
  const body = await c.req.text();
  if (body.length > 1048576) return c.json({ error: "payload too large" }, 413);
  const repo = perRepo ?? c.req.query("repo")?.toLowerCase() ?? await linkedRepo(c.env, "sentry");
  if (!repo || !REPO_RE.test(repo)) return c.json({ error: "repository unavailable" }, 403);
  const installation = await c.env.DB.prepare("SELECT installation_id FROM repos WHERE full_name = ?").bind(repo).first<{ installation_id: number }>();
  if (!installation) return c.json({ error: "repository unavailable" }, 403);
  const scope = { repo, installationId: installation.installation_id };
  const redactor = new Redactor(c.env);
  const { clientSecret } = await sentryCreds(c.env, scope, redactor);
  if (!(await verifyHmac(clientSecret, body, c.req.header("sentry-hook-signature") ?? null))) return c.json({ error: "bad signature" }, 401);
  await markUsed(c.env, "sentry", scope);
  const resource = c.req.header("sentry-hook-resource") ?? "";
  if (!["issue", "event_alert", "error"].includes(resource)) return c.json({ ok: true, ignored: true });
  let payload: SentryPayload;
  try { payload = JSON.parse(body); } catch { return c.json({ error: "invalid JSON" }, 400); }
  if (!payload || typeof payload !== "object") return c.json({ error: "invalid payload" }, 400);
  if (!repo || !REPO_RE.test(repo)) return c.json({ ok: true, ignored: true, reason: "Sentry isn't plugged into a map yet" });
  // Sentry sends Request-ID; fall back to a body hash so retries still dedupe.
  const sourceDelivery = c.req.header("request-id")?.replace(/[^\w-]/g, "").slice(0, 200)
    || [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (repo && currentTrace()) { currentTrace()!.repo = repo.toLowerCase(); Sentry.setTag("repo", repo.toLowerCase()); }
  if (!await admit(c.env,`webhook:sentry:${repo.toLowerCase()}`,300,60000,"Sentry webhook flood")) return c.json({error:"webhook throttled"},429);

  const delivery = `${repo}:${sourceDelivery}`;

  const now = Date.now();
  const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO webhook_deliveries (source, delivery_id, received_at, expires_at) VALUES ('sentry', ?, ?, ?)").bind(delivery, now, now + 7 * 86400000).run();
  if (!inserted.meta.changes) {
    const previous = await c.env.DB.prepare("SELECT state FROM webhook_deliveries WHERE source = 'sentry' AND delivery_id = ?").bind(delivery).first<{ state: string }>();
    if (previous?.state === "done") return c.json({ ok: true, duplicate: true });
  }
  await factory(c.env, repo).enqueueSentry(delivery, resource, redactor.value(payload));
  c.executionCtx.waitUntil(c.env.DB.prepare("DELETE FROM webhook_deliveries WHERE source = 'sentry' AND expires_at < ? AND state = 'done'").bind(now).run());
  return c.json({ ok: true, queued: true }, 202);
}

adminRoutes(app, factory);

app.all("/api/*", (c) => c.notFound());
app.all("/connect/*", (c) => c.notFound());


// Everything else is the web app.
app.all("*", async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  // Only trusted static art contains inline executable scripts. Never add nonces
  // to user-provided text or relax the application/API policy to allow them.
  if (/^\/art\/(prototype|item-lab)(?:\.html)?\/?$/.test(c.req.path) && response.headers.get("content-type")?.includes("text/html")) {
    const nonce = crypto.randomUUID().replaceAll("-", "");
    c.set("artNonce", nonce);
    return new HTMLRewriter().on("script", { element(el) { el.setAttribute("nonce", nonce); } }).transform(response);
  }
  return response;
});

export { app }; // Unwrapped Hono app for route tests.
export default Sentry.withSentry((env: Env) => sentryOptions(env), { fetch: app.fetch });
