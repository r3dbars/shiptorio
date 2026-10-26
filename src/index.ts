import {
  convertManifestCode,
  installationToken,
  pullRequestFiles,
  repoInstallationId,
  repoTree,
  verifyWebhookSignature,
} from "./github";
import { layoutMap } from "./map";
import { RepoRoom } from "./room";
import { isAllowed, makeSessionCookie, readSession } from "./session";

export { RepoRoom };

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CACHE: KVNamespace;
  REPO_ROOM: DurableObjectNamespace<RepoRoom>;
  PUBLIC_URL?: string; // optional override; defaults to the request origin
  DEV_LOGIN?: string; // local only: skip GitHub login on localhost as this user
  ALLOWED_LOGINS: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

const MAP_TTL = 60 * 10;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/webhooks/github" && request.method === "POST") return await handleWebhook(request, env);
      if (path === "/setup") return setupPage(publicUrl(url, env), env);
      if (path === "/setup/callback") return await setupCallback(url, env);
      if (path === "/auth/login") return await login(url, env);
      if (path === "/auth/callback") return await authCallback(request, url, env);
      if (path === "/auth/logout") return logout();

      const api = path.match(/^\/api\/repos\/([^/]+\/[^/]+)\/(map|prs|live)$/);
      if (api) {
        const login = await readSession(env.SESSION_SECRET, request.headers.get("cookie"));
        if (!login || !isAllowed(env.ALLOWED_LOGINS, login)) return json({ error: "login required" }, 401);
        const repo = api[1];
        if (!REPO_RE.test(repo)) return json({ error: "bad repo" }, 400);
        if (api[2] === "map") return await getMap(env, repo, url.searchParams.has("fresh"));
        if (api[2] === "prs") return await getPrs(env, repo);
        return room(env, repo).fetch(request);
      }

      if (path === "/api/me") {
        const login = await readSession(env.SESSION_SECRET, request.headers.get("cookie"));
        return json({ login, allowed: !!login && isAllowed(env.ALLOWED_LOGINS, login) });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: String(err instanceof Error ? err.message : err) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function room(env: Env, repo: string) {
  return env.REPO_ROOM.get(env.REPO_ROOM.idFromName(repo.toLowerCase()));
}

async function broadcast(env: Env, repo: string, event: unknown) {
  await room(env, repo).fetch("https://room/broadcast", { method: "POST", body: JSON.stringify(event) });
}

// ---- map + PRs ----

async function installationFor(env: Env, repo: string): Promise<number> {
  const row = await env.DB.prepare("SELECT installation_id FROM repos WHERE full_name = ?")
    .bind(repo.toLowerCase())
    .first<{ installation_id: number }>();
  return row?.installation_id ?? (await repoInstallationId(env, repo));
}

async function getMap(env: Env, repo: string, fresh: boolean): Promise<Response> {
  const key = `map:${repo.toLowerCase()}`;
  if (!fresh) {
    const cached = await env.CACHE.get(key);
    if (cached) return new Response(cached, { headers: { "content-type": "application/json", "x-cache": "hit" } });
  }
  const token = await installationToken(env, await installationFor(env, repo));
  const tree = await repoTree(token, repo);
  const body = JSON.stringify({
    repo,
    branch: tree.branch,
    sha: tree.sha,
    truncated: tree.truncated,
    map: layoutMap(tree.entries),
  });
  await env.CACHE.put(key, body, { expirationTtl: MAP_TTL });
  return new Response(body, { headers: { "content-type": "application/json", "x-cache": "miss" } });
}

interface PrRow {
  number: number;
  title: string;
  state: string;
  author: string | null;
  ci_status: string | null;
  files: string | null;
  updated_at: string;
}

function prOut(r: PrRow) {
  return { ...r, files: r.files ? (JSON.parse(r.files) as string[]) : [] };
}

async function getPrs(env: Env, repo: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT number, title, state, author, ci_status, files, updated_at FROM pull_requests
     WHERE repo = ? AND (state = 'open' OR updated_at > datetime('now', '-7 days'))
     ORDER BY state = 'open' DESC, updated_at DESC LIMIT 100`,
  )
    .bind(repo.toLowerCase())
    .all<PrRow>();
  return json(results.map(prOut));
}

// ---- webhooks ----

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const ok = await verifyWebhookSignature(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get("x-hub-signature-256"));
  if (!ok) return json({ error: "bad signature" }, 401);

  const event = request.headers.get("x-github-event");
  const p = JSON.parse(body);
  const repo: string | undefined = p.repository?.full_name?.toLowerCase();
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
      break;
    }

    case "pull_request": {
      if (!repo || !installationId) break;
      const pr = p.pull_request;
      const state = pr.merged ? "merged" : pr.state;
      let files: string[] = [];
      try {
        files = await pullRequestFiles(await installationToken(env, installationId), repo, pr.number);
      } catch (err) {
        console.error("pr files", err);
      }
      await env.DB.prepare(
        `INSERT INTO pull_requests (repo, number, title, state, author, head_sha, files, ci_status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
         ON CONFLICT (repo, number) DO UPDATE SET
           title = excluded.title, state = excluded.state, author = excluded.author, files = excluded.files,
           ci_status = CASE WHEN pull_requests.head_sha = excluded.head_sha THEN pull_requests.ci_status ELSE NULL END,
           head_sha = excluded.head_sha, updated_at = excluded.updated_at`,
      )
        .bind(repo, pr.number, pr.title, state, pr.user?.login ?? null, pr.head.sha, JSON.stringify(files))
        .run();
      await upsertRepo(env, repo, installationId, p.repository.default_branch);
      await broadcast(env, repo, { type: "pr", action: p.action, number: pr.number });
      break;
    }

    case "check_suite": {
      if (!repo) break;
      const suite = p.check_suite;
      const status =
        suite.status !== "completed" ? "pending" : ["success", "neutral", "skipped"].includes(suite.conclusion) ? "success" : "failure";
      const { meta } = await env.DB.prepare("UPDATE pull_requests SET ci_status = ?, updated_at = datetime('now') WHERE repo = ? AND head_sha = ?")
        .bind(status, repo, suite.head_sha)
        .run();
      if (meta.changes) await broadcast(env, repo, { type: "ci", sha: suite.head_sha, status });
      break;
    }

    case "push": {
      if (!repo || p.ref !== `refs/heads/${p.repository.default_branch}`) break;
      await env.CACHE.delete(`map:${repo}`);
      if (installationId) await upsertRepo(env, repo, installationId, p.repository.default_branch);
      await broadcast(env, repo, { type: "push", sha: p.after });
      break;
    }
  }

  return json({ ok: true });
}

async function upsertRepo(env: Env, repo: string, installationId: number, defaultBranch: string) {
  await env.DB.prepare(
    `INSERT INTO repos (full_name, installation_id, default_branch, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (full_name) DO UPDATE SET installation_id = excluded.installation_id,
       default_branch = excluded.default_branch, updated_at = excluded.updated_at`,
  )
    .bind(repo, installationId, defaultBranch)
    .run();
}

// ---- login (GitHub App user-to-server OAuth) ----

function publicUrl(url: URL, env: Env): string {
  return (env.PUBLIC_URL || url.origin).replace(/\/$/, "");
}

const isLocal = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";

// Only same-site paths, so the login redirect can't be bounced elsewhere.
const safeNext = (next: string | null | undefined) => (next && /^\/(?![/\\])/.test(next) ? next : "/");

async function login(url: URL, env: Env): Promise<Response> {
  const next = safeNext(url.searchParams.get("next"));
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

async function authCallback(request: Request, url: URL, env: Env): Promise<Response> {
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
  if (!isAllowed(env.ALLOWED_LOGINS, login)) return new Response(`${login} isn't on the allow list`, { status: 403 });
  const next = request.headers.get("cookie")?.match(/(?:^|;\s*)shiptorio_next=([^;]+)/)?.[1];
  return new Response(null, {
    status: 302,
    headers: { location: safeNext(next && decodeURIComponent(next)), "set-cookie": await makeSessionCookie(env.SESSION_SECRET, login) },
  });
}

function logout(): Response {
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
    default_permissions: { contents: "read", pull_requests: "read", checks: "read", metadata: "read" },
    default_events: ["pull_request", "push", "check_suite"],
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function setupPage(base: string, env: Env): Response {
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

async function setupCallback(url: URL, env: Env): Promise<Response> {
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
    { headers: { "content-type": "text/html", "cache-control": "no-store" } },
  );
}
