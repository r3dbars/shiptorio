import { signupGate, signupPage, signupAllowed, addPending, adminSignup, admit, ipScope, turnstile, resourceQuota, type SignupEnv } from './signup';
import { Hono, type Context, type Next } from "hono";
import { authCallback, login, logout, publicUrl, setupCallback, setupPage } from "./auth";
import { Factory, type FactoryEnv } from "./factory";
import { appJwt, gh, repoInstallationId } from "./github";
import { canSeeRepo, currentUser, readPrefs, reposFor, writePrefs, type User } from "./accounts";
import { previewAccess, secureTransport } from "./access";
import { githubSource } from "./sources";
import { sentryStatus, sentryWebhookUrl, type SentryPayload } from "./sources/sentry";
import { postHogStatus } from "./sources/posthog";
import { verifyHmac } from "./sources/types";
import { linkedRepo, postHogCreds, saveCreds, sentryCreds } from "./sources/creds";
import { connectPage } from "./connect";
import type { GitHubPayload } from "./sources/github";
import { pairToken, readRunnerToken, type RunnerIdentity } from "./runner-auth";
import { EnqueueRunner, RunnerHarness, RunnerReceipt } from "./runner-job";

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
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const factory = (env: Env, repo: string) => env.FACTORY.get(env.FACTORY.idFromName(repo.toLowerCase()));

type AppEnv = { Bindings: Env; Variables: { user: User; runner: RunnerIdentity } };
const app = new Hono<AppEnv>();

const signedIn = (c: { env: Env; req: { header(name: string): string | undefined; url: string } }) =>
  currentUser(c.env, c.req.header("cookie") ?? null, new URL(c.req.url));

/** Route guard: 401s unless a real session is signed in, and puts the player on c.get("user"). */
export const requireUser = async (c: Context<AppEnv>, next: Next) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  c.set("user", user);
  await next();
};

app.use("*", async (c, next) => {
  const redirect = secureTransport(c.req.raw);
  if (redirect) return redirect;
  await next();
  if (new URL(c.req.url).protocol === "https:") c.header("Strict-Transport-Security", "max-age=31536000");
});

app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/runner/")) {
    const match = c.req.path.match(/^\/api\/runner\/([\w.-]+)\/([\w.-]+)\/(claim|finish|renew)$/);
    const identity = await readRunnerToken(c.env.SESSION_SECRET, c.req.header("authorization")?.replace(/^Bearer /, "") ?? "");
    if (!await admit(c.env, await ipScope(c.req.raw, 'pairing'), 60, 60000, 'runner authentication flood')) return c.json({error:'try again later'},429);
    if (!match || c.req.method !== "POST" || !identity || identity.repo !== `${match[1]}/${match[2]}`.toLowerCase()) return c.json({ error: "runner authentication required" }, 401);
    c.set("runner", identity);
    await next();
    c.header("Cache-Control", "no-store");
    return;
  }
  const denied = c.env.SIGNUP_GATE_MODE === "password" ? await previewAccess(c.req.raw, c.env) : await signupGate(c.req.raw, c.env);
  if (denied) return denied;
  await next();
  c.header("Cache-Control", "no-store");
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// ---------- auth + setup ----------

app.get("/auth/login", (c) => c.env.SIGNUP_GATE_MODE === 'password' ? login(new URL(c.req.url), c.env) : signupPage(c.env));
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
app.on(['GET','POST'],'/admin',c=>adminSignup(c.req.raw,c.env));
app.get("/auth/callback", (c) => authCallback(c.req.raw, new URL(c.req.url), c.env));
app.get("/auth/logout", (c) => logout(c.req.raw, c.env));
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

/** Where a player installs the App on more repos. The slug is read once from GitHub and cached. */
async function installUrl(env: Env): Promise<string | null> {
  if (env.GITHUB_APP_SLUG) return `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) return null;
  let slug = await env.CACHE?.get("app:slug").catch(() => null);
  if (!slug) {
    slug = await gh<{ slug: string }>("/app", await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY)).then((a) => a.slug).catch(() => null);
    if (slug) await env.CACHE?.put("app:slug", slug, { expirationTtl: 86400 }).catch(() => null);
  }
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

app.get("/api/setup/status", async (c) => c.json({
  sentry: !!(await sentryCreds(c.env)).clientSecret,
  posthog: c.env.FAKE_POSTHOG === "1" || !!(await postHogCreds(c.env)).apiKey,
  github: !!(c.env.GITHUB_APP_ID && c.env.GITHUB_APP_PRIVATE_KEY && c.env.GITHUB_WEBHOOK_SECRET && c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET),
  spark: !!c.env.META_API_KEY,
  githubAppId: !!c.env.GITHUB_APP_ID,
  githubPrivateKey: !!c.env.GITHUB_APP_PRIVATE_KEY,
  githubWebhookSecret: !!c.env.GITHUB_WEBHOOK_SECRET,
  githubClientId: !!c.env.GITHUB_CLIENT_ID,
  githubClientSecret: !!c.env.GITHUB_CLIENT_SECRET,
}));

app.get("/api/version", (c) => c.json({ commit: c.env.BUILD_SHA || "unknown" }));

app.get("/api/sources", async (c) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  const url = publicUrl(new URL(c.req.url), c.env);
  const asked = (c.req.query("repo") ?? "").toLowerCase();
  const repo = REPO_RE.test(asked) && (await canSeeRepo(c.env, user, asked)) ? asked : null;
  return c.json({ sources: [githubSource.status(c.env), sentryStatus(repo ? await sentryCreds(c.env, repo) : {}, url, repo), postHogStatus(repo ? await postHogCreds(c.env, repo) : {}, url, c.env.FAKE_POSTHOG === "1")] });
});

// ---------- connect a mine (Sentry, PostHog): paste the key once ----------

app.on(["GET", "POST"], "/connect/:kind", async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "sentry" && kind !== "posthog") return c.notFound();
  const user = await signedIn(c);
  if (!user) return c.redirect(`/auth/login?next=${encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search)}`);
  const url = publicUrl(new URL(c.req.url), c.env);
  const repoParam = c.req.query("repo") ?? "";
  const repo = REPO_RE.test(repoParam) ? repoParam.toLowerCase() : await linkedRepo(c.env, kind);
  // Keys belong to one map, and only someone who can open that map may set them.
  if (!repo) return c.text("Open this page from the map you want to plug it into.", 400);
  if (!(await canSeeRepo(c.env, user, repo))) return c.text("You don't have access to that repo's factory.", 403);
  const connected = kind === "sentry" ? !!(await sentryCreds(c.env, repo)).clientSecret : !!(await postHogCreds(c.env, repo)).apiKey;
  const webhookUrl = sentryWebhookUrl(url, repo);
  if (c.req.method === "GET") return c.html(connectPage({ kind, repo, connected, webhookUrl }));
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.text("invalid origin", 403);
  const form = await c.req.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  if (kind === "sentry") {
    const clientSecret = field("clientSecret");
    if (!/^[\w-]{16,200}$/.test(clientSecret)) return c.html(connectPage({ kind, repo, connected, webhookUrl, error: "That doesn't look like a Sentry Client Secret." }), 400);
    await saveCreds(c.env, "sentry", { clientSecret }, repo);
  } else {
    const apiKey = field("apiKey");
    const projectId = field("projectId");
    const host = field("host") === "eu" ? "https://eu.posthog.com" : "https://us.posthog.com";
    const keyEvent = field("keyEvent") || "$pageview";
    if (!/^ph[a-z]_[\w]{10,200}$/.test(apiKey) || !/^\d{1,12}$/.test(projectId) || !/^[\w$ .:-]{1,100}$/.test(keyEvent)) return c.html(connectPage({ kind, repo, connected, webhookUrl: "", error: "Check the key (starts with phx_) and the project id (a number)." }), 400);
    await saveCreds(c.env, "posthog", { apiKey, projectId, host, keyEvent }, repo);
  }
  // Plug it straight into the map it came from.
  await factory(c.env, repo).connectMine(kind).catch(() => null);
  return c.html(connectPage({ kind, repo, connected: true, webhookUrl, saved: true }));
});

app.get("/api/repos", async (c) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  // Only repos this player's GitHub account can reach through an App installation.
  const repos = { results: await reposFor(c.env, user) };
  // Preserve the legacy database fields while serving the browser's repo-card contract.
  // Issue counts are not available from this query; omit them rather than inventing zero.
  return c.json({ repos: repos.results.map(repo => ({
    ...repo,
    fullName: repo.full_name,
    blurb: repo.default_branch ? `Default branch: ${repo.default_branch}` : "Connected GitHub repository",
  })) });
});

// ---------- the factory (browser websocket) ----------

app.use("/api/repos/:owner/:repo/*", async (c, next) => {
  const user = await signedIn(c);
  if (!user) return c.json({ error: "login required" }, 401);
  const repo = `${c.req.param("owner")}/${c.req.param("repo")}`;
  if (!REPO_RE.test(repo)) return c.json({ error: "bad repo" }, 400);
  // Same answer for "no such factory" and "not yours", so repo names can't be probed.
  if (!(await canSeeRepo(c.env, user, repo))) return c.json({ error: "not found" }, 404);
  if (!await resourceQuota(c.env,user.login,'repo',repo) || !await resourceQuota(c.env,user.login,'factory',repo)) return c.json({error:'repository/factory quota reached'},429);
  c.set("user", user);
  await next();
});

app.post("/api/repos/:owner/:repo/runner/:action", async (c) => {
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "invalid origin" }, 403);
  const repo = `${c.req.param("owner")}/${c.req.param("repo")}`.toLowerCase();
  if (!REPO_RE.test(repo)) return c.json({ error: "bad repo" }, 400);
  const f = factory(c.env, repo);
  await f.ensure(repo, await installationFor(c.env, repo));
  if (c.req.param("action") === "pair") {
    const pairId = await f.pairRunner();
    const expires = Date.now() + 8 * 60 * 60 * 1000;
    return c.json({ token: await pairToken(c.env.SESSION_SECRET, { repo, pairId, expires }), expires });
  }
  if (c.req.param("action") !== "jobs") return c.json({ error: "unknown action" }, 404);
  const text = await c.req.text();
  if (text.length > 8192) return c.json({ error: "too large" }, 413);
  const parsed = EnqueueRunner.safeParse(JSON.parse(text));
  if (!parsed.success) return c.json({ error: "invalid job" }, 400);
  return c.json(await f.enqueueRunner(parsed.data), 202);
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

app.get("/api/repos/:owner/:repo/factory", async (c) => {
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "invalid origin" }, 403);
  const repo = `${c.req.param("owner")}/${c.req.param("repo")}`;
  if (!REPO_RE.test(repo)) return c.json({ error: "bad repo" }, 400);
  const f = factory(c.env, repo);
  if (c.env.GITHUB_APP_ID) {
    const installationId = await installationFor(c.env, repo).catch(() => null);
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
  await factory(c.env, repo ?? "github-installations").enqueueGitHub(delivery, event, payload);
  c.executionCtx.waitUntil(c.env.DB.prepare("DELETE FROM webhook_deliveries WHERE expires_at < ? AND state = 'done'").bind(now).run());
  return c.json({ ok: true, queued: true, duplicate: !inserted.meta.changes }, 202);
});

// ---------- Sentry webhooks ----------

// /webhooks/sentry/<owner>/<repo> is checked with that map's own secret. The bare URL is the
// pre-accounts one and still feeds the repo the legacy shared key is linked to.
app.post("/webhooks/sentry/:owner/:repo", (c) => sentryWebhook(c, `${c.req.param("owner")}/${c.req.param("repo")}`.toLowerCase()));
app.post("/webhooks/sentry", (c) => sentryWebhook(c, null));

async function sentryWebhook(c: Context<AppEnv>, perRepo: string | null) {
  if (perRepo && !REPO_RE.test(perRepo)) return c.json({ error: "bad repo" }, 400);
  if (Number(c.req.header("content-length") ?? 0) > 1048576) return c.json({ error: "payload too large" }, 413);
  const body = await c.req.text();
  if (body.length > 1048576) return c.json({ error: "payload too large" }, 413);
  const { clientSecret } = await sentryCreds(c.env, perRepo);
  if (!(await verifyHmac(clientSecret, body, c.req.header("sentry-hook-signature") ?? null))) return c.json({ error: "bad signature" }, 401);
  const resource = c.req.header("sentry-hook-resource") ?? "";
  if (!["issue", "event_alert", "error"].includes(resource)) return c.json({ ok: true, ignored: true });
  let payload: SentryPayload;
  try { payload = JSON.parse(body); } catch { return c.json({ error: "invalid JSON" }, 400); }
  if (!payload || typeof payload !== "object") return c.json({ error: "invalid payload" }, 400);
  const repo = perRepo ?? (await linkedRepo(c.env, "sentry"));
  if (!repo || !REPO_RE.test(repo)) return c.json({ ok: true, ignored: true, reason: "Sentry isn't plugged into a map yet" });
  // Sentry sends Request-ID; fall back to a body hash so retries still dedupe.
  const delivery = c.req.header("request-id")?.replace(/[^\w-]/g, "").slice(0, 200)
    || [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!await admit(c.env,`webhook:sentry:${repo.toLowerCase()}`,300,60000,"Sentry webhook flood")) return c.json({error:"webhook throttled"},429);
  const now = Date.now();
  const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO webhook_deliveries (source, delivery_id, received_at, expires_at) VALUES ('sentry', ?, ?, ?)").bind(delivery, now, now + 7 * 86400000).run();
  if (!inserted.meta.changes) {
    const previous = await c.env.DB.prepare("SELECT state FROM webhook_deliveries WHERE source = 'sentry' AND delivery_id = ?").bind(delivery).first<{ state: string }>();
    if (previous?.state === "done") return c.json({ ok: true, duplicate: true });
  }
  await factory(c.env, repo).enqueueSentry(delivery, resource, payload);
  return c.json({ ok: true, queued: true }, 202);
}

// Everything else is the web app.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
