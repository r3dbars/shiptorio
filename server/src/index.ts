import { Hono } from "hono";
import { authCallback, login, logout, publicUrl, setupCallback, setupPage } from "./auth";
import { Factory, type FactoryEnv } from "./factory";
import { repoInstallationId, verifyWebhookSignature } from "./github";
import { isAllowed, readSession } from "./session";
import { previewAccess } from "./access";

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
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const factory = (env: Env, repo: string) => env.FACTORY.get(env.FACTORY.idFromName(repo.toLowerCase()));

const app = new Hono<{ Bindings: Env; Variables: { login: string } }>();

app.use("*", async (c, next) => {
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
  github: !!(c.env.GITHUB_APP_ID && c.env.GITHUB_APP_PRIVATE_KEY && c.env.GITHUB_WEBHOOK_SECRET),
  spark: !!c.env.META_API_KEY,
  model: c.env.SPARK_MODEL || "muse-spark-1.3",
}));

// ---------- the factory (browser websocket) ----------

app.use("/api/repos/*", async (c, next) => {
  const login = await readSession(c.env.SESSION_SECRET, c.req.header("cookie") ?? null);
  if (!login || !isAllowed(c.env.ALLOWED_LOGINS, login)) return c.json({ error: "login required" }, 401);
  c.set("login", login);
  await next();
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
  const env = c.env;
  const body = await c.req.text();
  if (!(await verifyWebhookSignature(env.GITHUB_WEBHOOK_SECRET, body, c.req.header("x-hub-signature-256") ?? null)))
    return c.json({ error: "bad signature" }, 401);

  const event = c.req.header("x-github-event");
  let p;
  try { p = JSON.parse(body); } catch { return c.json({ error: "invalid JSON" }, 400); }
  const repo: string | undefined = p.repository?.full_name;
  const installationId: number | undefined = p.installation?.id;

  switch (event) {
    case "installation":
    case "installation_repositories": {
      if (p.action === "deleted") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM repos WHERE installation_id = ?").bind(installationId),
          env.DB.prepare("DELETE FROM installations WHERE id = ?").bind(installationId),
        ]);
        break;
      }
      const added: { full_name: string }[] = p.repositories ?? p.repositories_added ?? [];
      const removed: { full_name: string }[] = p.repositories_removed ?? [];
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO installations (id, account_login) VALUES (?, ?)").bind(
          installationId,
          p.installation.account.login,
        ),
        ...added.map((r) =>
          env.DB.prepare("INSERT OR REPLACE INTO repos (full_name, installation_id) VALUES (?, ?)").bind(
            r.full_name.toLowerCase(),
            installationId,
          ),
        ),
        ...removed.map((r) => env.DB.prepare("DELETE FROM repos WHERE full_name = ?").bind(r.full_name.toLowerCase())),
      ]);
      // Build each new repo's starter factory now, so the first visit is instant.
      for (const r of added) c.executionCtx.waitUntil(factory(env, r.full_name).ensure(r.full_name, installationId!));
      break;
    }

    case "issues": {
      if (!repo || !installationId || !["opened", "reopened"].includes(p.action)) break;
      const f = factory(env, repo);
      await f.ensure(repo, installationId);
      await f.ingestIssue({
        number: p.issue.number,
        title: p.issue.title,
        body: p.issue.body ?? "",
        url: p.issue.html_url,
        labels: (p.issue.labels ?? []).map((l: { name: string }) => l.name),
      });
      break;
    }

    case "check_suite": {
      if (!repo || p.action !== "completed") break;
      const suite = p.check_suite;
      const prs: number[] = (suite.pull_requests ?? []).map((pr: { number: number }) => pr.number);
      if (!prs.length) break;
      const ok = ["success", "neutral", "skipped"].includes(suite.conclusion);
      await factory(env, repo).onCheckSuite(prs, ok, `${suite.app?.name ?? "CI"} ${suite.conclusion}`, suite.head_sha);
      break;
    }

    case "pull_request": {
      if (!repo || p.action !== "closed") break;
      await factory(env, repo).onPullClosed(p.pull_request.number, !!p.pull_request.merged);
      break;
    }

    case "push": {
      if (!repo || p.ref !== `refs/heads/${p.repository.default_branch}`) break;
      await factory(env, repo).refreshDistricts();
      break;
    }
  }
  return c.json({ ok: true });
});

// Everything else is the web app.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
