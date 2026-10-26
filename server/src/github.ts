import { githubCooldown, RateLimitError } from "./rate-limit";
import { observedFetch } from "./telemetry";
import { retry, OutboundError, RetryExhausted } from "./reliability";

// GitHub App auth + webhook verification, using only WebCrypto so it runs on Workers.
import { isOwnPlanComment, normalizeGitHub, type GitHubIssue, type GitHubPayload } from "./sources/github";
import type { Signal } from "./sources/types";

const API = "https://api.github.com";
const UA = "shiptorio";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | out.length, ...out];
}

function derWrap(tag: number, content: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([tag, ...derLength(content.length), ...content]);
}

// GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY") but WebCrypto only imports PKCS#8.
// Wrap it so nobody has to run openssl first.
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = Uint8Array.from([0x02, 0x01, 0x00]);
  const rsaAlgId = Uint8Array.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const key = derWrap(0x04, pkcs1);
  return derWrap(0x30, Uint8Array.from([...version, ...rsaAlgId, ...key]));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  let der = pemToDer(pem);
  if (pem.includes("BEGIN RSA PRIVATE KEY")) der = pkcs1ToPkcs8(der);
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

export async function appJwt(appId: string, privateKeyPem: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000) - 60; // allow for clock drift
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat, exp: iat + 9 * 60, iss: appId }));
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyWebhookSignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  const expected = "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

export interface AppCredentials {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  DB?: D1Database;
}

// In-isolate queues serialize each credential; D1 also spaces requests and preserves cooldowns
// across isolates/restarts for installation credentials. Keys are hashes, never stored tokens.
const queues = new Map<string, Promise<unknown>>();
const queued = new Map<string, number>();
const contexts = new Map<string, { db: D1Database; scope: string }>();
const cooldowns = new Map<string, { next: number; failures: number }>();
const etags = new Map<string, { etag: string; value: unknown; expires: number }>();
const tokenCache = new Map<string, { token: string; expires: number }>();
async function credentialKey(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function boundedSet<K, V>(map: Map<K, V>, key: K, value: V) {
  if (map.size >= 500 && !map.has(key)) map.delete(map.keys().next().value!);
  map.set(key, value);
}
export async function registerGithubCredential(token: string, db: D1Database, scope: string) {
  boundedSet(contexts, await credentialKey(token), { db, scope });
}
async function ghRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const key = await credentialKey(token), context = contexts.get(key), scope = context?.scope ?? key;
  if ((queued.get(scope) ?? 0) >= 8) throw new RateLimitError(Date.now() + 60000);
  queued.set(scope, (queued.get(scope) ?? 0) + 1);
  const previous = queues.get(scope) ?? Promise.resolve();
  const request = previous.catch(() => {}).then(async () => {
    let state = cooldowns.get(scope) ?? { next: 0, failures: 0 };
    if (context) {
      const row = await context.db.prepare("SELECT next_at, failures FROM api_limits WHERE scope = ?").bind(scope).first<{ next_at: number; failures: number }>();
      if (row) state = { next: Math.max(state.next, row.next_at), failures: Math.max(state.failures, row.failures) };
    }
    if (state.next > Date.now() + 5000) throw new RateLimitError(state.next);
    if (context) {
      const slot = await context.db.prepare(`INSERT INTO api_limits(scope, next_at) VALUES (?, ?)
        ON CONFLICT(scope) DO UPDATE SET next_at = MAX(next_at, ?) + 1000 RETURNING next_at`)
        .bind(scope, Date.now() + 1000, Date.now()).first<{ next_at: number }>();
      state.next = Math.max(state.next, (slot?.next_at ?? Date.now() + 1000) - 1000);
    }
    const delay = state.next - Date.now();
    if (delay > 5000) throw new RateLimitError(state.next);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    // Another isolate may have discovered a cooldown while this request waited for its slot.
    if (context) {
      const latest = await context.db.prepare("SELECT next_at FROM api_limits WHERE scope = ?").bind(scope).first<{ next_at: number }>();
      if (latest && latest.next_at > Date.now() + 5000) throw new RateLimitError(latest.next_at);
    }
    const cacheKey = `${key}:${path}`;
    const cached = (init.method ?? "GET") === "GET" ? etags.get(cacheKey) : undefined;
    const headers = new Headers({ accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": UA, "x-github-api-version": "2022-11-28" });
    if (init.body) headers.set("content-type", "application/json");
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (cached && cached.expires > Date.now()) headers.set("if-none-match", cached.etag);
    const res = await observedFetch("github", API + path, { signal: AbortSignal.timeout(20000), ...init, headers });
    const secondary = res.status === 403 && (res.headers.has("retry-after") || /secondary rate limit|rate limit exceeded|abuse detection/i.test(await res.clone().text()));
    const next = githubCooldown(res, Date.now(), state.failures, secondary);
    const failures = res.status === 429 || secondary ? state.failures + 1 : 0;
    boundedSet(cooldowns, scope, { next, failures });
    if (context) await context.db.prepare("UPDATE api_limits SET next_at = MAX(next_at, ?), failures = ? WHERE scope = ?").bind(next, failures, scope).run();
    if (res.status === 429 || secondary || res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") throw new RateLimitError(next);
    if (res.status === 304 && cached) return structuredClone(cached.value) as T;
    if (!res.ok) throw new OutboundError(res.status);
    if (res.status === 204) return undefined as T;
    const value = await res.json();
    if ((init.method ?? "GET") === "GET" && res.headers.has("etag") && JSON.stringify(value).length <= 65536) boundedSet(etags, cacheKey, { etag: res.headers.get("etag")!, value, expires: Date.now() + 300000 });
    return value as T;
  });
  queues.set(scope, request);
  try { return await request; } finally {
    const left = (queued.get(scope) ?? 1) - 1;
    if (left) queued.set(scope, left); else queued.delete(scope);
    if (queues.get(scope) === request) queues.delete(scope);
  }
}
export async function gh<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {

  const comment = init.method === "POST" && /\/issues\/\d+\/comments$/.test(path) && typeof init.body === "string";
  let marker: string | undefined;
  if (comment) {
    const payload = JSON.parse(init.body as string) as { body: string };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload.body));
    marker = `<!-- shiptorio-delivery:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")} -->`;
    init = { ...init, body: JSON.stringify({ ...payload, body: `${payload.body}\n\n${marker}` }) };
  }
  const request = async () => {
    if (marker) {
      for (let page = 1; ; page++) {
        if (page > 20) throw new OutboundError(409); // do not post if duplicate history cannot be checked within budget
        const comments = await gh<{ body?: string }[]>(`${path}?per_page=100&page=${page}`, token);
        const existing = comments.find(c => c.body?.includes(marker!));
        if (existing) return existing as T;
        if (comments.length < 100) break;
      }
    }
    return ghRequest<T>(path, token, init);
  };
  // GitHub has no general REST idempotency key. POST needs operation-specific recovery.
  return retry(`GitHub ${init.method ?? "GET"} ${path}`, request, { shouldRetry: error => !(error instanceof RateLimitError), attempts: init.method === "POST" && /\/pulls$|\/git\/refs$/.test(path) ? 1 : 3 });
}

interface InstallationTokenScope {
  repositories: string[];
  permissions: { contents: "write"; metadata: "read" };
}

export async function installationToken(env: AppCredentials, installationId: number, scope?: InstallationTokenScope): Promise<string> {
  const cacheKey = `${env.GITHUB_APP_ID}:${await credentialKey(env.GITHUB_APP_PRIVATE_KEY)}:${installationId}:${JSON.stringify(scope ?? null)}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    if (env.DB) await registerGithubCredential(cached.token, env.DB, `github:installation:${installationId}`);
    return cached.token;
  }
  const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  if (env.DB) boundedSet(contexts, await credentialKey(jwt), { db: env.DB, scope: `github:app:${env.GITHUB_APP_ID}` });
  const res = await gh<{ token: string }>(`/app/installations/${installationId}/access_tokens`, jwt, {
    method: "POST",
    ...(scope ? { body: JSON.stringify(scope) } : {}),
  });
  if (env.DB) boundedSet(contexts, await credentialKey(res.token), { db: env.DB, scope: `github:installation:${installationId}` });
  boundedSet(tokenCache, cacheKey, { token: res.token, expires: Date.now() + 45 * 60000 });
  return res.token;
}

// Publishing credentials stay inside one repository and cannot create PRs.
// Contents-write still permits merges; independent repository rules must enforce
// merge restrictions, or publishing must move behind a credential-holding proxy.
// GitHub does not support branch-scoped installation tokens; repository rules must
// independently protect main and any other branches the runner must not update.
export async function runnerInstallationToken(env: AppCredentials, installationId: number, fullName: string): Promise<string> {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(fullName);
  if (!match || match.slice(1).some(part => part === "." || part === "..")) throw new Error("Invalid runner repository");
  return installationToken(env, installationId, { repositories: [match[2]], permissions: { contents: "write", metadata: "read" } });
}

export async function repoInstallationId(env: AppCredentials, fullName: string): Promise<number> {
  const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  if (env.DB) await registerGithubCredential(jwt, env.DB, `github:app:${env.GITHUB_APP_ID}`);
  const res = await gh<{ id: number }>(`/repos/${fullName}/installation`, jwt);
  return res.id;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

export async function repoTree(
  token: string,
  fullName: string,
): Promise<{ branch: string; sha: string; entries: TreeEntry[]; truncated: boolean }> {
  const repo = await gh<{ default_branch: string }>(`/repos/${fullName}`, token);
  const tree = await gh<{ sha: string; tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${fullName}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
    token,
  );
  return { branch: repo.default_branch, sha: tree.sha, entries: tree.tree, truncated: tree.truncated };
}

export async function pullRequestFiles(token: string, fullName: string, number: number): Promise<string[]> {
  const files = await gh<{ filename: string }[]>(`/repos/${fullName}/pulls/${number}/files?per_page=100`, token);
  return files.map((f) => f.filename);
}

export async function openIssues(token: string, repo: string): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  for (let page = 1; page <= 10 && issues.length < 50; page++) {
    const batch = await gh<GitHubIssue[]>(`/repos/${repo}/issues?state=open&per_page=25&page=${page}`, token);
    issues.push(...batch.filter((issue) => !issue.pull_request).slice(0, 50 - issues.length));
    if (batch.length < 25) break;
  }
  return issues;
}

/** Refresh only new planning jobs: old bot audit text must not become the next task. */
export async function freshIssueInput(token: string, repo: string, number: number): Promise<Signal> {
  const issue = await gh<GitHubIssue>(`/repos/${repo}/issues/${number}`, token);
  if (issue.number !== number || issue.state !== "open" || issue.pull_request) throw new Error("GitHub issue is no longer open");
  let latest: GitHubPayload["comment"];
  const at = (comment: NonNullable<GitHubPayload["comment"]>) => Date.parse(comment.updated_at ?? comment.created_at ?? "") || 0;
  for (let page = 1; page <= 5; page++) {
    const comments = await gh<NonNullable<GitHubPayload["comment"]>[]>(`/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`, token);
    if (!Array.isArray(comments)) throw new Error("GitHub issue feedback unavailable");
    for (const comment of comments) if (comment.body.trim() && !isOwnPlanComment(comment) && (!latest || at(comment) > at(latest) || at(comment) === at(latest) && comment.id > latest.id)) latest = comment;
    if (comments.length < 100) {
      const again = await gh<GitHubIssue>(`/repos/${repo}/issues/${number}`, token);
      const stamp = (value: GitHubIssue) => JSON.stringify([value.number, value.state, !!value.pull_request, value.title, value.body ?? "", value.labels ?? [], value.updated_at]);
      if (stamp(issue) !== stamp(again)) throw new Error("Issue changed while reading feedback");
      return normalizeGitHub({ repository: { full_name: repo }, issue, comment: latest })[0];
    }
  }
  throw new Error("Issue feedback exceeds the bounded planning window; narrow the issue before planning");
}

export async function issueReporters(token: string, repo: string, issue: GitHubIssue): Promise<string[]> {
  if (!issue.reactions?.total_count) return issue.user ? [issue.user.login] : [];
  const reactions = await gh<{ user?: { login: string } }[]>(`/repos/${repo}/issues/${issue.number}/reactions?per_page=100`, token);
  return [...new Set([...(issue.user ? [issue.user.login] : []), ...reactions.flatMap((reaction) => reaction.user ? [reaction.user.login] : [])])];
}

export async function fileContent(token: string, fullName: string, path: string, ref: string): Promise<string | null> {
  try {
    const f = await gh<{ content?: string; encoding?: string }>(
      `/repos/${fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    if (f.encoding !== "base64" || f.content == null) return null;
    const bytes = Uint8Array.from(atob(f.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof RetryExhausted && error.cause instanceof OutboundError && error.cause.status === 404) return null;
    throw error;
  }
}

async function branchSha(token: string, fullName: string, branch: string): Promise<string | null> {
  try {
    const ref = await gh<{ object: { sha: string } }>(`/repos/${fullName}/git/ref/heads/${encodeURIComponent(branch)}`, token);
    return ref.object.sha;
  } catch (error) {
    if (error instanceof RetryExhausted && error.cause instanceof OutboundError && error.cause.status === 404) return null;
    throw error;
  }
}

export interface FileChange {
  path: string;
  content: string;
}

// One commit with all changes on `branch`, created from `base` if it doesn't exist yet.
export async function commitToBranch(
  token: string,
  fullName: string,
  base: string,
  branch: string,
  changes: FileChange[],
  message: string,
): Promise<string> {
  const existing = await branchSha(token, fullName, branch);
  const parent = existing ?? (await branchSha(token, fullName, base));
  if (!parent) throw new Error(`base branch ${base} not found`);
  const parentCommit = await gh<{ tree: { sha: string } }>(`/repos/${fullName}/git/commits/${parent}`, token);
  const tree = await gh<{ sha: string }>(`/repos/${fullName}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parentCommit.tree.sha,
      tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", content: c.content })),
    }),
  });
  const commit = await gh<{ sha: string }>(`/repos/${fullName}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }),
  });
  if (existing) {
    await gh(`/repos/${fullName}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
  } else {
    await retry("Create branch", async () => {
      const recovered = await branchSha(token, fullName, branch);
      if (recovered === commit.sha) return;
      if (recovered) throw new OutboundError(409);
      await gh(`/repos/${fullName}/git/refs`, token, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
      });
    });
  }
  return commit.sha;
}

export async function openPullRequest(
  token: string,
  fullName: string,
  pr: { head: string; base: string; title: string; body: string },
): Promise<{ number: number; html_url: string }> {
  // A crash can occur after GitHub accepts the PR but before the Factory saves it.
  // Recover the existing PR on retry rather than opening another one.
  return retry("Open pull request", async () => {
    const owner = fullName.split("/")[0];
    const existing = await gh<{ number: number; html_url: string }[]>(
      `/repos/${fullName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${pr.head}`)}&base=${encodeURIComponent(pr.base)}`, token,
    );
    if (existing[0]) return existing[0];
    return gh(`/repos/${fullName}/pulls`, token, { method: "POST", body: JSON.stringify({ ...pr, draft: false }) });
  });
}

/** Inspect all checks on the CURRENT PR commit. An old or unrelated successful suite cannot pass a new fix. */
export async function inspectPullRequest(token: string, repo: string, number: number, eventSha?: string) {
  const pr = await gh<{ head: { sha: string } }>(`/repos/${repo}/pulls/${number}`, token);
  if (eventSha && eventSha !== pr.head.sha) return { headSha: pr.head.sha, stale: true, state: "pending" as const, summary: "Ignoring checks for an older commit" };
  const [checks, statuses] = await Promise.all([
    gh<{ total_count: number; check_runs: { name: string; status: string; conclusion: string | null; output?: { summary?: string | null } }[] }>(`/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100&filter=latest`, token),
    gh<{ total_count: number; statuses: { state: string; context: string; description: string }[] }>(`/repos/${repo}/commits/${pr.head.sha}/status?per_page=100`, token),
  ]);
  const failures = checks.check_runs.filter((c) => c.status === "completed" && !["success", "neutral", "skipped"].includes(c.conclusion ?? ""));
  const badStatuses = statuses.statuses.filter((s) => ["failure", "error"].includes(s.state));
  if (failures.length || badStatuses.length) return { headSha: pr.head.sha, stale: false, state: "failed" as const, summary: [...failures.map((c) => `${c.name}: ${c.conclusion}\n${c.output?.summary ?? ""}`), ...badStatuses.map((s) => `${s.context}: ${s.description}`)].join("\n").slice(0, 3000) };
  if (!checks.check_runs.length && !statuses.statuses.length || checks.total_count > checks.check_runs.length || statuses.total_count > statuses.statuses.length || checks.check_runs.some((c) => c.status !== "completed") || statuses.statuses.some((s) => s.state !== "success")) return { headSha: pr.head.sha, stale: false, state: "pending" as const, summary: "Waiting for all checks on the current commit" };
  // A skipped workflow is not evidence that a fix was tested.
  if (!checks.check_runs.some((c) => c.conclusion === "success") && !statuses.statuses.some((s) => s.state === "success")) return { headSha: pr.head.sha, stale: false, state: "pending" as const, summary: "Waiting for a successful check" };
  return { headSha: pr.head.sha, stale: false, state: "passed" as const, summary: "All reported checks passed on the current commit" };
}

export async function convertManifestCode(code: string): Promise<{
  id: number;
  slug: string;
  html_url: string;
  pem: string;
  webhook_secret: string;
}> {
  const res = await observedFetch("github", `${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", "user-agent": UA },
  });
  if (!res.ok) throw new Error(`manifest conversion failed: ${res.status} ${await res.text()}`);
  return res.json();
}
