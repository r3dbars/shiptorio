import { Hono } from "hono";
import { authCallback, login, logout, publicUrl, setupCallback, setupPage } from "./auth";
import { Factory, type FactoryEnv } from "./factory";
import { repoInstallationId } from "./github";
import { isAllowed, readSession } from "./session";
import { previewAccess, secureTransport } from "./access";
import { githubSource } from "./sources";
import type { GitHubPayload } from "./sources/github";
import { pairToken, readRunnerToken, type RunnerIdentity } from "./runner-auth";
import { EnqueueRunner, RunnerHarness, RunnerReceipt } from "./runner-job";

export { Factory };

export interface Env extends FactoryEnv {
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
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const factory = (env: Env, repo: string) => env.FACTORY.get(env.FACTORY.idFromName(repo.toLowerCase()));

const app = new Hono<{ Bindings: Env; Variables: { login: string; runner: RunnerIdentity } }>();

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
    if (!match || c.req.method !== "POST" || !identity || identity.repo !== `${match[1]}/${match[2]}`.toLowerCase()) return c.json({ error: "runner authentication required" }, 401);
    c.set("runner", identity);
    await next();
    c.header("Cache-Control", "no-store");
    return;
  }
  const denied = await previewAccess(c.req.raw, c.env);
  if (denied) return denied;
  await next();
  c.header("Cache-Control", "no-store");
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// ---------- auth + setup ----------

app.get("/auth/login", (c) => login(new URL(c.req.url), c.env));
app.get("/auth/callback", (c) => authCallback(c.req.raw, new URL(c.req.url), c.env));
app.get("/auth/logout", () => logout());
app.get("/setup", (c) => setupPage(publicUrl(new URL(c.req.url), c.env), c.env));
app.get("/setup/callback", (c) => setupCallback(new URL(c.req.url), c.env));

app.get("/api/me", async (c) => {
  const login = await readSession(c.env.SESSION_SECRET, c.req.header("cookie") ?? null);
  return c.json({ login, allowed: !!login && isAllowed(c.env.ALLOWED_LOGINS, login) });
});

app.get("/api/setup/status", (c) => c.json({
  github: !!(c.env.GITHUB_APP_ID && c.env.GITHUB_APP_PRIVATE_KEY && c.env.GITHUB_WEBHOOK_SECRET && c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET),
  spark: !!c.env.META_API_KEY,
  githubAppId: !!c.env.GITHUB_APP_ID,
  githubPrivateKey: !!c.env.GITHUB_APP_PRIVATE_KEY,
  githubWebhookSecret: !!c.env.GITHUB_WEBHOOK_SECRET,
  githubClientId: !!c.env.GITHUB_CLIENT_ID,
  githubClientSecret: !!c.env.GITHUB_CLIENT_SECRET,
}));

app.get("/api/version", (c) => c.json({ commit: c.env.BUILD_SHA || "unknown" }));

app.get("/api/sources", (c) => c.json({ sources: [githubSource.status(c.env)] }));

app.get("/api/repos", async (c) => {
  const login = await readSession(c.env.SESSION_SECRET, c.req.header("cookie") ?? null);
  if (!login || !isAllowed(c.env.ALLOWED_LOGINS, login)) return c.json({ error: "login required" }, 401);
  const repos = await c.env.DB.prepare("SELECT full_name, installation_id, default_branch FROM repos ORDER BY full_name").all();
  return c.json({ repos: repos.results });
});

// ---------- the factory (browser websocket) ----------

app.use("/api/repos/*", async (c, next) => {
  const login = await readSession(c.env.SESSION_SECRET, c.req.header("cookie") ?? null);
  if (!login || !isAllowed(c.env.ALLOWED_LOGINS, login)) return c.json({ error: "login required" }, 401);
  c.set("login", login);
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

// Everything else is the web app.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
