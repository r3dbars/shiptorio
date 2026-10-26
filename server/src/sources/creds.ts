import type { PostHogCreds, PostHogSourceEnv } from "./posthog";
import type { SentryCreds, SentrySourceEnv } from "./sentry";
import { decryptCredential, encryptCredential, type Envelope, type KeyEnv } from "./credential-crypto";
import type { Redactor } from "../redact";

export type MineKind = "sentry" | "posthog";
export interface CredentialScope { installationId: number; repo: string; user?: string; repoId?: number }
type BoundScope = CredentialScope & { repoId: number };
export interface CredsEnv extends SentrySourceEnv, PostHogSourceEnv, KeyEnv {
  DB: D1Database;
  CACHE?: KVNamespace;
  SENTRY_REPO?: string;
  POSTHOG_REPO?: string;
  SENTRY_REPO_ID?: string; SENTRY_INSTALLATION_ID?: string;
  POSTHOG_REPO_ID?: string; POSTHOG_INSTALLATION_ID?: string;
}
type Creds = SentryCreds & PostHogCreds;
interface Row { envelope: string | null; revoked: number; linked: number; last_used_at: number | null }
export function scopeKey(scope: CredentialScope): string {
  if (!Number.isSafeInteger(scope.installationId) || scope.installationId <= 0 || !Number.isSafeInteger(scope.repoId) || scope.repoId! <= 0) throw new Error("Invalid credential identity");
  return `installation:${scope.installationId}:repo-id:${scope.repoId}`;
}
const binding = (scope: BoundScope, kind: MineKind) => `${scopeKey(scope)}:${kind}`;
const legacyKey = (installationId: number, repo: string) => `installation:${installationId}:repo:${repo.toLowerCase()}`;

/** Names and caller-supplied IDs cannot authorize credentials: resolve the active installed identity. */
async function identity(env: CredsEnv, scope?: CredentialScope): Promise<BoundScope | null> {
  if (!scope || !/^[\w.-]+\/[\w.-]+$/.test(scope.repo) || !Number.isSafeInteger(scope.installationId) || scope.installationId <= 0) return null;
  const row = await env.DB.prepare("SELECT r.repo_id, r.installation_id FROM repos r JOIN installations i ON i.id = r.installation_id WHERE r.full_name = ? AND r.installation_id = ? AND r.archived_at IS NULL AND i.status = 'active'")
    .bind(scope.repo.toLowerCase(), scope.installationId).first<{ repo_id: number; installation_id: number }>();
  if (!row || !Number.isSafeInteger(row.repo_id) || row.repo_id <= 0 || row.installation_id !== scope.installationId || scope.repoId !== undefined && scope.repoId !== row.repo_id) return null;
  return { ...scope, repo: scope.repo.toLowerCase(), repoId: row.repo_id };
}
function pin(env: CredsEnv, kind: MineKind) {
  const repoId = kind === "sentry" ? env.SENTRY_REPO_ID : env.POSTHOG_REPO_ID;
  const installationId = kind === "sentry" ? env.SENTRY_INSTALLATION_ID : env.POSTHOG_INSTALLATION_ID;
  if (!/^\d+$/.test(repoId ?? "") || !/^\d+$/.test(installationId ?? "")) return null;
  const result = { repoId: Number(repoId), installationId: Number(installationId) };
  return Number.isSafeInteger(result.repoId) && result.repoId > 0 && Number.isSafeInteger(result.installationId) && result.installationId > 0 ? result : null;
}
export const credentialPinMatches = (env: CredsEnv, kind: MineKind, scope: { installationId: number; repoId: number }) => {
  const expected = pin(env, kind);
  return !!expected && expected.repoId === scope.repoId && expected.installationId === scope.installationId;
};
/** Legacy/global sources require an operator-established immutable pin; never adopt the current name's identity. */
export async function legacyRepo(env: CredsEnv, kind: MineKind): Promise<string | null> {
  const expected = pin(env, kind);
  if (!expected) return null;
  const row = await env.DB.prepare("SELECT r.full_name FROM repos r JOIN installations i ON i.id = r.installation_id WHERE r.repo_id = ? AND r.installation_id = ? AND r.archived_at IS NULL AND i.status = 'active'")
    .bind(expected.repoId, expected.installationId).first<{ full_name: string }>();
  return row?.full_name ?? null;
}
async function legacyName(env: CredsEnv, kind: MineKind, _scope: BoundScope): Promise<string | null> {
  const name = (kind === "sentry" ? env.SENTRY_REPO : env.POSTHOG_REPO) || await env.CACHE?.get(`link:${kind}`);
  return name?.toLowerCase() ?? null;
}
function override(env: CredsEnv, kind: MineKind): Creds {
  return kind === "sentry" ? { clientSecret: env.SENTRY_CLIENT_SECRET } : { apiKey: env.POSTHOG_API_KEY, projectId: env.POSTHOG_PROJECT_ID, host: env.POSTHOG_HOST, keyEvent: env.POSTHOG_KEY_EVENT };
}
async function row(env: CredsEnv, scope: CredentialScope, kind: MineKind): Promise<Row | null> {
  return env.DB.prepare("SELECT envelope, revoked, linked, last_used_at FROM credentials WHERE scope = ? AND kind = ?").bind(scopeKey(scope), kind).first<Row>();
}
async function migrate(env: CredsEnv, scope: BoundScope, kind: MineKind): Promise<Row | null> {
  let current = await row(env, scope, kind);
  if (!credentialPinMatches(env, kind, scope)) return current;
  const name = scope.repo;
  if (await legacyName(env, kind, scope) !== name) return current;
  const ownsGlobal = (await env.CACHE?.get(`link:${kind}`) ?? name).toLowerCase() === name;
  const repoKey = `cred:${kind}:${name}`;
  const old = await env.DB.prepare("SELECT envelope, revoked, linked, last_used_at FROM credentials WHERE scope = ? AND kind = ?")
    .bind(legacyKey(scope.installationId, name), kind).first<Row>();
  if ((!current || (!current.envelope && !current.revoked)) && old?.revoked) {
    await revokeCreds(env, kind, scope);
    return row(env, scope, kind);
  }
  const admin = override(env, kind);
  if (!env.CRED_MASTER_KEY && (kind === "sentry" ? admin.clientSecret : admin.apiKey && admin.projectId)) return current;
  const ownLegacy = await env.CACHE?.get<Creds>(repoKey, "json");
  const globalLegacy = ownsGlobal ? await env.CACHE?.get<Creds>(`cred:${kind}`, "json") : null;
  const legacy = ownLegacy ?? globalLegacy ?? ((!current || !current.envelope) && old?.envelope
    ? await decryptCredential<Creds>(env, `${legacyKey(scope.installationId, name)}:${kind}`, JSON.parse(old.envelope)) : null);
  if ((!current || (!current.envelope && !current.revoked)) && legacy) {
    const envelope = await encryptCredential(env, binding(scope, kind), legacy);
    // A concurrent save/revoke wins. Its tombstone also prevents stale KV reads from resurrecting a key.
    await env.DB.prepare("INSERT OR IGNORE INTO credentials (scope, kind, envelope, updated_at, linked) VALUES (?, ?, ?, ?, 1)")
      .bind(scopeKey(scope), kind, JSON.stringify(envelope), Date.now()).run();
    await env.DB.prepare("UPDATE credentials SET envelope = ? WHERE scope = ? AND kind = ? AND envelope IS NULL AND revoked = 0")
      .bind(JSON.stringify(envelope), scopeKey(scope), kind).run();
    current = await row(env, scope, kind);
  }
  if ((current?.envelope || current?.revoked) && legacy) {
    await env.CACHE?.delete(repoKey);
    if (ownsGlobal) await env.CACHE?.delete(`cred:${kind}`);
  }
  return current;
}
export async function readCreds(env: CredsEnv, kind: MineKind, scope?: CredentialScope, redactor?: Redactor, used = false): Promise<Creds> {
  const bound = await identity(env, scope);
  if (!bound) return {};
  const current = await migrate(env, bound, kind);
  if (current?.revoked) return {};
  const ownFactory = credentialPinMatches(env, kind, bound);
  const admin = ownFactory ? override(env, kind) : {};
  let creds: Creds = kind === "sentry" ? (admin.clientSecret ? admin : {}) : (admin.apiKey && admin.projectId ? admin : {});
  if (!creds.clientSecret && !creds.apiKey && current?.envelope) {
    creds = await decryptCredential<Creds>(env, binding(bound, kind), JSON.parse(current.envelope));
    // Lazy key rotation is compare-and-swap, so a racing revoke/replace cannot be undone.
    if ((JSON.parse(current.envelope) as Envelope).keyVersion !== (env.CRED_KEY_VERSION || "1")) {
      const next = await encryptCredential(env, binding(bound, kind), creds);
      await env.DB.prepare("UPDATE credentials SET envelope = ? WHERE scope = ? AND kind = ? AND envelope = ? AND revoked = 0")
        .bind(JSON.stringify(next), scopeKey(bound), kind, current.envelope).run();
    }
  }
  redactor?.register(creds);
  if (used && (creds.apiKey || creds.clientSecret)) await markUsed(env, kind, bound);
  return creds;
}
export const sentryCreds = (env: CredsEnv, scope?: CredentialScope, redactor?: Redactor) => readCreds(env, "sentry", scope, redactor);
export const postHogCreds = (env: CredsEnv, scope?: CredentialScope, redactor?: Redactor) => readCreds(env, "posthog", scope, redactor);
export async function saveCreds(env: CredsEnv, kind: MineKind, creds: Creds, scope: CredentialScope): Promise<void> {
  const bound = await identity(env, scope);
  if (!bound) throw new Error("Repository identity unavailable; reconnect GitHub");
  const envelope = await encryptCredential(env, binding(bound, kind), creds);
  await env.DB.prepare("INSERT INTO credentials (scope, kind, envelope, revoked, updated_by, updated_at) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET envelope = excluded.envelope, revoked = 0, updated_by = excluded.updated_by, updated_at = excluded.updated_at, last_used_at = NULL")
    .bind(scopeKey(bound), kind, JSON.stringify(envelope), scope.user ?? null, Date.now()).run();
  if (credentialPinMatches(env, kind, bound) && await legacyName(env, kind, bound) === bound.repo) {
    await env.CACHE?.delete(`cred:${kind}:${bound.repo}`);
    if (await legacyCredentialOwner(env, kind, bound)) await env.CACHE?.delete(`cred:${kind}`);
  }
}
export async function revokeCreds(env: CredsEnv, kind: MineKind, scope: CredentialScope): Promise<void> {
  const bound = await identity(env, scope);
  if (!bound) throw new Error("Repository identity unavailable; reconnect GitHub");
  await env.DB.prepare("INSERT INTO credentials (scope, kind, envelope, revoked, updated_by, updated_at) VALUES (?, ?, NULL, 1, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET envelope = NULL, revoked = 1, linked = 0, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
    .bind(scopeKey(bound), kind, scope.user ?? null, Date.now()).run();
  if (credentialPinMatches(env, kind, bound) && await legacyName(env, kind, bound) === bound.repo) {
    await env.CACHE?.delete(`cred:${kind}:${bound.repo}`);
    if (await legacyCredentialOwner(env, kind, bound)) await env.CACHE?.delete(`cred:${kind}`);
  }
}
export async function markUsed(env: CredsEnv, kind: MineKind, scope: CredentialScope): Promise<void> {
  const bound = await identity(env, scope);
  if (!bound) throw new Error("Repository identity unavailable; reconnect GitHub");
  // Record use of a pinned Worker override too, without storing its plaintext.
  await env.DB.prepare("INSERT INTO credentials (scope, kind, updated_at, last_used_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET last_used_at = excluded.last_used_at WHERE credentials.revoked = 0")
    .bind(scopeKey(bound), kind, Date.now(), Date.now()).run();
}
export async function credentialStatus(env: CredsEnv, kind: MineKind, scope: CredentialScope) {
  const bound = await identity(env, scope);
  if (!bound) return { connected: false, lastUsedAt: null, workerOverride: false };
  const creds = await readCreds(env, kind, bound);
  const current = await row(env, bound, kind);
  const admin = override(env, kind);
  const workerOverride = !current?.revoked && credentialPinMatches(env, kind, bound) && !!(kind === "sentry" ? admin.clientSecret : admin.apiKey && admin.projectId);
  return { connected: !!(kind === "sentry" ? creds.clientSecret : creds.apiKey && creds.projectId), lastUsedAt: current?.last_used_at ?? null, workerOverride };
}
export async function linkedRepo(env: CredsEnv, kind: MineKind, scope?: CredentialScope): Promise<string | null> {
  if (!scope) return legacyRepo(env, kind);
  const bound = await identity(env, scope);
  if (!bound) return null;
  const current = await row(env, bound, kind);
  if (current?.revoked) return null;
  return current?.linked || credentialPinMatches(env, kind, bound) ? bound.repo : null;
}
export async function linkRepo(env: CredsEnv, kind: MineKind, repo: string | null, scope: CredentialScope): Promise<void> {
  const bound = await identity(env, scope);
  if (!bound) throw new Error("Repository identity unavailable; reconnect GitHub");
  await env.DB.prepare("INSERT INTO credentials (scope, kind, linked, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET linked = excluded.linked WHERE credentials.revoked = 0")
    .bind(scopeKey(bound), kind, repo ? 1 : 0, Date.now()).run();
}

export async function legacyCredentialOwner(env: CredsEnv, kind: MineKind, scope: { installationId: number; repoId: number; repo: string }): Promise<boolean> {
  if (!credentialPinMatches(env, kind, scope)) return false;
  const name = await legacyName(env, kind, scope);
  const linked = await env.CACHE?.get(`link:${kind}`);
  return name === scope.repo.toLowerCase() && (!linked || linked.toLowerCase() === name);
}
