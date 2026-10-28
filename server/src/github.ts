import { hmacSigningKey } from "./hmac-key";
import { githubCooldown, RateLimitError } from "./rate-limit";
import { observedFetch } from "./telemetry";
import { decryptCredential, encryptCredential, type Envelope, type KeyEnv } from "./sources/credential-crypto";
import { retry, OutboundError, RetryExhausted } from "./reliability";
import { GitHubReadCache } from "./github-cache";
import { githubLease } from "./github-concurrency";

// GitHub App auth + webhook verification, using only WebCrypto so it runs on Workers.
import { isOwnPlanComment, normalizeGitHub, TRUST_LABEL, trustedAuthor, type GitHubIssue, type GitHubPayload } from "./sources/github";
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
  const key = await hmacSigningKey(secret);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  const expected = "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

export interface AppCredentials extends KeyEnv {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  DB?: D1Database;
  CACHE?: KVNamespace;
}

export class GitHubError extends OutboundError {
  constructor(status: number, path: string, method: string) { super(status); this.message = `GitHub ${method} ${path} failed (${status})`; }
}
interface TokenEntry { token: string; expiresAt: number; installationId: number; version: number; env: AppCredentials; scope?: InstallationTokenScope }
const tokenCache = new Map<string, TokenEntry>();
const tokenOwners = new Map<string, Omit<TokenEntry, "token">>();
async function tokenFingerprint(token: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(token)));
  return [...hash].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const pendingTokens = new Map<string, Promise<string>>();
const distrusted = new Set<number>();
const tokenKey = (env: AppCredentials, id: number, scope?: InstallationTokenScope) => JSON.stringify([env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY, id, scope]);
export function purgeInstallationTokens(id: number) {
  for (const [key, value] of tokenCache) if (value.installationId === id) tokenCache.delete(key);
  distrusted.add(id); // the shared KV copy may be the token GitHub just refused
  // Keep ownership until expiry so outstanding callers can refresh or fail closed.
}
async function tokenVersion(env: AppCredentials, id: number): Promise<number> {
  if (!env.DB) return 0;
  const row = await env.DB.prepare("SELECT token_version, status FROM installations WHERE id = ?").bind(id).first<{ token_version: number; status: string }>();
  if (row && row.status !== "active") {
    const error = new GitHubError(403, `/app/installations/${id}`, "GET");
    error.message = "GitHub installation is suspended or deleted";
    throw error;
  }
  return row?.token_version ?? 0;
}
// In-isolate queues serialize each credential; D1 also spaces requests and preserves cooldowns
// across isolates/restarts for installation credentials. Keys are hashes, never stored tokens.
const queues = new Map<string, Promise<unknown>>();
const queued = new Map<string, number>();
const contexts = new Map<string, { db: D1Database; scope: string }>();
const cooldowns = new Map<string, { next: number; failures: number }>();
const readCache = new GitHubReadCache();
// One hung D1, KV or body read must not hold its scope's queue (and the cap of 8) forever.
// Paced delay (5s) + lease-bounded fetch (30s) fit well inside this.
export const GITHUB_STEP_DEADLINE_MS = 45_000;
function withDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RateLimitError(Date.now() + 1000)), GITHUB_STEP_DEADLINE_MS); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
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
  const key = await credentialKey(token), owner = tokenOwners.get(key);
  // Bounded context eviction must never remove an installation's shared budget.
  const context = owner?.env.DB ? { db: owner.env.DB, scope: `github:installation:${owner.installationId}` } : contexts.get(key);
  // Permission-scoped and replacement tokens still consume the same installation budget.
  // D1 shares spacing/cooldowns across isolates; this queue caps in-flight calls to one per isolate.
  const scope = context?.scope ?? (owner ? `github:installation:${owner.installationId}` : key);
  if ((queued.get(scope) ?? 0) >= 8) throw new RateLimitError(Date.now() + 60000);
  queued.set(scope, (queued.get(scope) ?? 0) + 1);
  const previous = queues.get(scope) ?? Promise.resolve();
  // The deadline starts on this call's turn, so waiting behind others never counts against it.
  const request = previous.catch(() => {}).then(() => withDeadline((async () => {
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
    const headers = new Headers({ accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": UA, "x-github-api-version": "2022-11-28" });
    if (init.body) headers.set("content-type", "application/json");
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    // Callers cannot switch the credential after its access boundary was checked.
    headers.set("authorization", `Bearer ${token}`);
    const cacheable = (init.method ?? "GET").toUpperCase() === "GET" && !init.body && !headers.has("if-none-match") && !headers.has("if-modified-since") && !headers.has("range") && !/\bno-store\b/i.test(headers.get("cache-control") ?? "");
    const identity = owner ? JSON.stringify([owner.env.GITHUB_APP_ID, owner.installationId, owner.version, owner.scope]) : scope;
    const cacheKey = cacheable ? await readCache.key(key, identity, path, headers) : undefined;
    const cached = cacheKey ? await readCache.get(cacheKey, owner?.env) : undefined;
    if (cached) headers.set("if-none-match", cached.etag);
    const lease = context && scope.startsWith("github:installation:") ? await githubLease(context.db, scope) : undefined;
    try {
      // Slow D1 acquisition must not let the API request outlive its lease.
      const remaining = lease ? Math.min(20000, lease.expiresAt - Date.now() - 1000) : 20000;
      if (remaining <= 0) throw new RateLimitError(Date.now() + 1000);
      const timeout = AbortSignal.timeout(remaining);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      const res = await observedFetch("github", API + path, { ...init, signal, headers });
      const secondary = res.status === 403 && (res.headers.has("retry-after") || /secondary rate limit|rate limit exceeded|abuse detection/i.test(await res.clone().text()));
      const next = githubCooldown(res, Date.now(), state.failures, secondary);
      const failures = res.status === 429 || secondary ? state.failures + 1 : 0;
      boundedSet(cooldowns, scope, { next, failures });
      if (context) await context.db.prepare("UPDATE api_limits SET next_at = MAX(next_at, ?), failures = ? WHERE scope = ?").bind(next, failures, scope).run();
      if (res.status === 429 || secondary || res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") throw new RateLimitError(next);
      // The candidate was fresh when selected; this authenticated 304 validates its
      // exact ETag even if its storage TTL elapsed in flight. Do not extend that TTL:
      // the next request must fetch unconditionally once the original entry expires.
      if (res.status === 304 && cached) return structuredClone(cached.value) as T;
      // Never serve stale data on errors, including revoked access disguised as 404.
      if (!res.ok || res.status === 204) {
        if (cacheKey && cached) await readCache.delete(cacheKey, owner?.env);
        if (!res.ok) throw new GitHubError(res.status, path, init.method ?? "GET");
        return undefined as T;
      }
      const value = await res.json();
      if (cacheKey && res.status === 200 && res.headers.has("etag") && !/\bno-store\b/i.test(res.headers.get("cache-control") ?? "") && res.headers.get("vary") !== "*") await readCache.put(cacheKey, res.headers.get("etag")!, value, owner?.env);
      else if (cacheKey && cached) await readCache.delete(cacheKey, owner?.env);
      return value as T;
    } finally {
      // Keep the API outcome if release storage is unavailable; the lease expires.
      try { await lease?.release(); } catch { /* bounded crash recovery */ }
    }
  })()));
  queues.set(scope, request);
  try { return await request; } finally {
    const left = (queued.get(scope) ?? 1) - 1;
    if (left) queued.set(scope, left); else queued.delete(scope);
    if (queues.get(scope) === request) queues.delete(scope);
  }
}
export async function gh<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const owner = tokenOwners.get(await tokenFingerprint(token));
  let authRetried = false;


  const comment = init.method === "POST" && /\/issues\/\d+\/comments$/.test(path) && typeof init.body === "string";
  let marker: string | undefined;
  if (comment) {
    const payload = JSON.parse(init.body as string) as { body: string };
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(payload.body));
    marker = `<!-- shiptorio-delivery:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")} -->`;
    init = { ...init, body: JSON.stringify({ ...payload, body: `${payload.body}\n\n${marker}` }) };
  }
  const request = async (): Promise<T> => {
    if (owner) {
      const version = await tokenVersion(owner.env, owner.installationId);
      const repo = /^\/repos\/([^/]+\/[^/?]+)/.exec(path)?.[1]?.toLowerCase();
      if (repo && owner.env.DB) {
        const row = await owner.env.DB.prepare("SELECT archived_at, installation_id FROM repos WHERE full_name = ?").bind(repo).first<{ archived_at: number | null; installation_id: number }>();
        if (row && (row.archived_at != null || row.installation_id !== owner.installationId)) throw new GitHubError(403, path, init.method ?? "GET");
      }
      const current = tokenOwners.get(await tokenFingerprint(token));
      if (!current || version !== current.version || current.expiresAt <= Date.now() + 60000) token = await installationToken(owner.env, owner.installationId, owner.scope);
    }
    if (marker) {
      for (let page = 1; ; page++) {
        if (page > 20) throw new OutboundError(409);
        const comments = await gh<{ body?: string }[]>(`${path}?per_page=100&page=${page}`, token);
        const existing = comments.find(c => c.body?.includes(marker!));
        if (existing) return existing as T;
        if (comments.length < 100) break;
      }
    }
    try { return await ghRequest<T>(path, token, init); }
    catch (error) {
      if (!owner || authRetried || !(error instanceof OutboundError) || ![401, 403].includes(error.status)) throw error;
      authRetried = true;
      purgeInstallationTokens(owner.installationId);
      token = await installationToken(owner.env, owner.installationId, owner.scope);
      return ghRequest<T>(path, token, init);
    }
  };
  try {
    return await retry(`GitHub ${init.method ?? "GET"} ${path}`, request, { shouldRetry: error => !(error instanceof RateLimitError), attempts: init.method === "POST" && /\/pulls$|\/git\/refs$/.test(path) ? 1 : 3 });
  } catch (error) {
    if (error instanceof RetryExhausted && error.cause instanceof GitHubError && (error.cause.status === 404 || owner && [401, 403].includes(error.cause.status))) throw error.cause;
    throw error;
  }

}

interface InstallationTokenScope {
  repositories: string[];
  permissions: { contents: "write"; metadata: "read" };
}

export async function installationToken(env: AppCredentials, installationId: number, scope?: InstallationTokenScope): Promise<string> {
  const key = tokenKey(env, installationId, scope);
  const version = await tokenVersion(env, installationId);
  const cached = tokenCache.get(key);
  if (cached && cached.version === version && cached.expiresAt > Date.now() + 60000) return cached.token;
  const pendingKey = key + version;
  if (pendingTokens.has(pendingKey)) return pendingTokens.get(pendingKey)!;
  const pending = (async () => {
    const shared = distrusted.has(installationId) ? null : await sharedToken(env, key, version);
    if (shared) { await adoptToken(env, key, { ...shared, installationId, version, env, scope }); return shared.token; }
    const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    if (env.DB) boundedSet(contexts, await credentialKey(jwt), { db: env.DB, scope: `github:app:${env.GITHUB_APP_ID}` });
    const res = await gh<{ token: string; expires_at?: string }>(`/app/installations/${installationId}/access_tokens`, jwt, {
      method: "POST", ...(scope ? { body: JSON.stringify(scope) } : {}),
    });
    if (await tokenVersion(env, installationId) !== version) throw new Error("GitHub installation changed while issuing token");
    const entry = { token: res.token, expiresAt: Date.parse(res.expires_at ?? "") || Date.now(), installationId, version, env, scope };
    await adoptToken(env, key, entry);
    await shareToken(env, key, entry);
    distrusted.delete(installationId);
    return res.token;
  })();
  pendingTokens.set(pendingKey, pending);
  try { return await pending; } finally { pendingTokens.delete(pendingKey); }

}

async function adoptToken(env: AppCredentials, key: string, entry: TokenEntry) {
  boundedSet(tokenCache, key, entry);
  if (env.DB) await registerGithubCredential(entry.token, env.DB, `github:installation:${entry.installationId}`);
  for (const [value, old] of tokenOwners) if (old.expiresAt <= Date.now()) tokenOwners.delete(value);
  const { token: _, ...metadata } = entry;
  tokenOwners.set(await tokenFingerprint(entry.token), metadata);
}
// Every isolate used to mint its own installation token, which drained the App's 5,000/hr bucket.
// Isolates now share one, encrypted in KV under the token version, until 5 minutes before expiry.
const SHARED_MARGIN = 5 * 60 * 1000;
const sharedKey = async (key: string, version: number) => `ghtoken:v1:${await tokenFingerprint(key)}:${version}`;
async function sharedToken(env: AppCredentials, key: string, version: number): Promise<{ token: string; expiresAt: number } | null> {
  if (!env.CACHE || !env.CRED_MASTER_KEY) return null;
  try {
    const name = await sharedKey(key, version);
    const envelope = await env.CACHE.get<Envelope>(name, "json");
    if (!envelope) return null;
    const value = await decryptCredential<{ token: string; expiresAt: number }>(env, name, envelope);
    return value.expiresAt > Date.now() + SHARED_MARGIN ? value : null;
  } catch { return null; }
}
async function shareToken(env: AppCredentials, key: string, entry: TokenEntry) {
  const ttl = Math.floor((entry.expiresAt - Date.now() - SHARED_MARGIN) / 1000);
  if (!env.CACHE || !env.CRED_MASTER_KEY || ttl < 60) return;
  try {
    const name = await sharedKey(key, entry.version);
    await env.CACHE.put(name, JSON.stringify(await encryptCredential(env, name, { token: entry.token, expiresAt: entry.expiresAt })), { expirationTtl: ttl });
  } catch { /* the in-isolate cache still holds it */ }
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
    for (const comment of comments) if (comment.body.trim() && !isOwnPlanComment(comment) && trustedAuthor(comment) && (!latest || at(comment) > at(latest) || at(comment) === at(latest) && comment.id > latest.id)) latest = comment;
    if (comments.length < 100) {
      const again = await gh<GitHubIssue>(`/repos/${repo}/issues/${number}`, token);
      const stamp = (value: GitHubIssue) => JSON.stringify([value.number, value.state, !!value.pull_request, value.title, value.body ?? "", value.labels ?? [], value.updated_at]);
      if (stamp(issue) !== stamp(again)) throw new Error("Issue changed while reading feedback");
      const signal = normalizeGitHub({ repository: { full_name: repo }, issue, comment: latest })[0];
      if (!signal) throw new Error(`Issue author isn't a collaborator; add the "${TRUST_LABEL}" label to plan it`);
      return signal;
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
    if (error instanceof GitHubError && error.status === 404 || error instanceof RetryExhausted && error.cause instanceof OutboundError && error.cause.status === 404) return null;
    throw error;

  }
}

async function branchSha(token: string, fullName: string, branch: string): Promise<string | null> {
  try {
    const ref = await gh<{ object: { sha: string } }>(`/repos/${fullName}/git/ref/heads/${encodeURIComponent(branch)}`, token);
    return ref.object.sha;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404 || error instanceof RetryExhausted && error.cause instanceof OutboundError && error.cause.status === 404) return null;
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
    }, { shouldRetry: error => !(error instanceof RateLimitError) });
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
  }, { shouldRetry: error => !(error instanceof RateLimitError) });
}

/** GitHub's own aggregate merge gate, not an inferred list of required check names.
 * Only an explicitly clean, open PR for the inspected head/base may expose Launch.
 * Unknown/unsupported states wait; the SHA-bound merge endpoint remains final authority.
 */
export async function pullRequestReadiness(token: string, repo: string, number: number, headSha: string, base: string) {
  const pr = await gh<{ head?: { sha?: string }; base?: { ref?: string }; state?: string; merged?: boolean; draft?: boolean; mergeable?: boolean | null; mergeable_state?: string | null }>(
    `/repos/${repo}/pulls/${number}`, token, { headers: { "cache-control": "no-store" } },
  );
  const mergeState = pr.mergeable_state ?? null;
  if (pr.head?.sha !== headSha || pr.base?.ref !== base) return { mergeState, ready: false, reason: "The PR changed. Its current commit and target need fresh checks." };
  if (pr.state !== "open" || pr.merged || pr.draft !== false) return { mergeState, ready: false, reason: "The PR must be open and ready for review before Launch." };
  if (pr.mergeable === true && pr.mergeable_state === "clean") return { mergeState, ready: true, reason: "GitHub reports this PR ready to merge." };
  const reason = pr.mergeable_state === "behind" ? "Waiting for the PR to include the latest base branch and pass fresh checks."
    : pr.mergeable_state === "blocked" ? "Waiting for GitHub's required checks, reviews or repository rules."
    : pr.mergeable_state === "dirty" ? "The PR has merge conflicts that must be resolved."
    : "Waiting for GitHub to confirm this PR is ready to merge.";
  return { mergeState, ready: false, reason };
}

/** Inspect all checks on the CURRENT PR commit. Never accept a moving head/base or check evidence for another commit. */
export async function inspectPullRequest(token: string, repo: string, number: number, eventSha?: string, expectedBase?: string) {
  type Pr = { head: { sha: string }; base: { ref: string; sha: string }; state: string; merged: boolean };
  const path = `/repos/${repo}/pulls/${number}`;
  const pr = await gh<Pr>(path, token);
  const pending = (summary: string, stale = false) => ({ headSha: pr.head.sha, stale, state: "pending" as const, summary });
  if (eventSha && eventSha !== pr.head.sha) return pending("Ignoring checks for an older commit", true);
  if (expectedBase && pr.base?.ref !== expectedBase) return pending("PR targets a different base branch");
  const [checks, statuses] = await Promise.all([
    gh<{ total_count: number; check_runs: { name: string; head_sha?: string; app?: { id: number }; status: string; conclusion: string | null; output?: { summary?: string | null } }[] }>(`/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100&filter=latest`, token),
    gh<{ total_count: number; statuses: { state: string; context: string; description: string }[] }>(`/repos/${repo}/commits/${pr.head.sha}/status?per_page=100`, token),
  ]);
  if (!pr.base?.ref || !pr.base.sha) return pending("Missing PR base metadata");

  const latest = await gh<Pr>(path, token);
  if (latest.head.sha !== pr.head.sha || latest.base?.ref !== pr.base?.ref || latest.base?.sha !== pr.base?.sha) return pending("PR changed while its checks were being read", true);
  if (pr.state && (pr.state !== "open" || pr.merged)) return pending("PR is no longer open");
  if (checks.check_runs.some(c => c.head_sha !== pr.head.sha)) return pending("Check evidence belongs to another commit");
  const failures = checks.check_runs.filter((c) => c.status === "completed" && !["success", "neutral", "skipped"].includes(c.conclusion ?? ""));
  const badStatuses = statuses.statuses.filter((s) => ["failure", "error"].includes(s.state));
  if (failures.length || badStatuses.length) return { headSha: pr.head.sha, stale: false, state: "failed" as const, summary: [...failures.map((c) => `${c.name}: ${c.conclusion}\n${c.output?.summary ?? ""}`), ...badStatuses.map((s) => `${s.context}: ${s.description}`)].join("\n").slice(0, 3000) };
  if (!checks.check_runs.length && !statuses.statuses.length || checks.total_count > checks.check_runs.length || statuses.total_count > statuses.statuses.length || checks.check_runs.some((c) => c.status !== "completed") || statuses.statuses.some((s) => s.state !== "success")) return pending("Waiting for all checks on the current commit");
  if (!checks.check_runs.some((c) => c.conclusion === "success") && !statuses.statuses.some((s) => s.state === "success")) return pending("Waiting for a successful check");
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
