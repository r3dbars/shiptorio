import type { PostHogCreds, PostHogSourceEnv } from "./posthog";
import type { SentryCreds, SentrySourceEnv } from "./sentry";
import { decryptCredential, encryptCredential, type Envelope, type KeyEnv } from "./credential-crypto";
import type { Redactor } from "../redact";

export type MineKind = "sentry" | "posthog";
export interface CredentialScope { installationId: number; repo: string; user?: string }
export interface CredsEnv extends SentrySourceEnv, PostHogSourceEnv, KeyEnv {
  DB: D1Database;
  CACHE?: KVNamespace;
  SENTRY_REPO?: string;
  POSTHOG_REPO?: string;
}
type Creds = SentryCreds & PostHogCreds;
interface Row { envelope: string | null; revoked: number; linked: number; last_used_at: number | null }
export function scopeKey(scope: CredentialScope): string {
  if (!Number.isSafeInteger(scope.installationId) || scope.installationId <= 0 || !/^[\w.-]+\/[\w.-]+$/.test(scope.repo)) throw new Error("Invalid credential scope");
  return `installation:${scope.installationId}:repo:${scope.repo.toLowerCase()}`;
}
const binding = (scope: CredentialScope, kind: MineKind) => `${scopeKey(scope)}:${kind}`;
/** Global material belongs only to the explicitly pinned/previously linked factory; never first-reader wins. */
export async function legacyRepo(env: CredsEnv, kind: MineKind): Promise<string> {
  return ((kind === "sentry" ? env.SENTRY_REPO : env.POSTHOG_REPO) || await env.CACHE?.get(`link:${kind}`) || "r3dbars/shiptorio").toLowerCase();
}
function override(env: CredsEnv, kind: MineKind): Creds {
  return kind === "sentry" ? { clientSecret: env.SENTRY_CLIENT_SECRET } : { apiKey: env.POSTHOG_API_KEY, projectId: env.POSTHOG_PROJECT_ID, host: env.POSTHOG_HOST, keyEvent: env.POSTHOG_KEY_EVENT };
}
async function row(env: CredsEnv, scope: CredentialScope, kind: MineKind): Promise<Row | null> {
  return env.DB.prepare("SELECT envelope, revoked, linked, last_used_at FROM credentials WHERE scope = ? AND kind = ?").bind(scopeKey(scope), kind).first<Row>();
}
async function migrate(env: CredsEnv, scope: CredentialScope, kind: MineKind): Promise<Row | null> {
  let current = await row(env, scope, kind);
  const ownsGlobal = scope.repo.toLowerCase() === await legacyRepo(env, kind);
  const repoKey = `cred:${kind}:${scope.repo.toLowerCase()}`;
  const ownLegacy = await env.CACHE?.get<Creds>(repoKey, "json");
  const globalLegacy = ownsGlobal ? await env.CACHE?.get<Creds>(`cred:${kind}`, "json") : null;
  const legacy = ownLegacy ?? globalLegacy;
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
    await env.CACHE!.delete(repoKey);
    if (ownsGlobal) await env.CACHE!.delete(`cred:${kind}`);
  }
  return current;
}
export async function readCreds(env: CredsEnv, kind: MineKind, scope?: CredentialScope, redactor?: Redactor, used = false): Promise<Creds> {
  if (!scope) return {}; // Never resolve credentials without an installation boundary.
  const current = await migrate(env, scope, kind);
  if (current?.revoked) return {};
  const ownFactory = scope.repo.toLowerCase() === await legacyRepo(env, kind);
  const admin = ownFactory ? override(env, kind) : {};
  let creds: Creds = kind === "sentry" ? (admin.clientSecret ? admin : {}) : (admin.apiKey && admin.projectId ? admin : {});
  if (!creds.clientSecret && !creds.apiKey && current?.envelope) {
    creds = await decryptCredential<Creds>(env, binding(scope, kind), JSON.parse(current.envelope));
    // Lazy key rotation is compare-and-swap, so a racing revoke/replace cannot be undone.
    if ((JSON.parse(current.envelope) as Envelope).keyVersion !== (env.CRED_KEY_VERSION || "1")) {
      const next = await encryptCredential(env, binding(scope, kind), creds);
      await env.DB.prepare("UPDATE credentials SET envelope = ? WHERE scope = ? AND kind = ? AND envelope = ? AND revoked = 0")
        .bind(JSON.stringify(next), scopeKey(scope), kind, current.envelope).run();
    }
  }
  redactor?.register(creds);
  if (used && (creds.apiKey || creds.clientSecret)) await markUsed(env, kind, scope);
  return creds;
}
export const sentryCreds = (env: CredsEnv, scope?: CredentialScope, redactor?: Redactor) => readCreds(env, "sentry", scope, redactor);
export const postHogCreds = (env: CredsEnv, scope?: CredentialScope, redactor?: Redactor) => readCreds(env, "posthog", scope, redactor);
export async function saveCreds(env: CredsEnv, kind: MineKind, creds: Creds, scope: CredentialScope): Promise<void> {
  const envelope = await encryptCredential(env, binding(scope, kind), creds);
  await env.DB.prepare("INSERT INTO credentials (scope, kind, envelope, revoked, updated_by, updated_at) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET envelope = excluded.envelope, revoked = 0, updated_by = excluded.updated_by, updated_at = excluded.updated_at, last_used_at = NULL")
    .bind(scopeKey(scope), kind, JSON.stringify(envelope), scope.user ?? null, Date.now()).run();
  await env.CACHE?.delete(`cred:${kind}:${scope.repo.toLowerCase()}`);
  if (scope.repo.toLowerCase() === await legacyRepo(env, kind)) await env.CACHE?.delete(`cred:${kind}`);
}
export async function revokeCreds(env: CredsEnv, kind: MineKind, scope: CredentialScope): Promise<void> {
  await env.DB.prepare("INSERT INTO credentials (scope, kind, envelope, revoked, updated_by, updated_at) VALUES (?, ?, NULL, 1, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET envelope = NULL, revoked = 1, linked = 0, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
    .bind(scopeKey(scope), kind, scope.user ?? null, Date.now()).run();
  await env.CACHE?.delete(`cred:${kind}:${scope.repo.toLowerCase()}`);
  if (scope.repo.toLowerCase() === await legacyRepo(env, kind)) await env.CACHE?.delete(`cred:${kind}`);
}
export async function markUsed(env: CredsEnv, kind: MineKind, scope: CredentialScope): Promise<void> {
  // Record use of a pinned Worker override too, without storing its plaintext.
  await env.DB.prepare("INSERT INTO credentials (scope, kind, updated_at, last_used_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET last_used_at = excluded.last_used_at WHERE credentials.revoked = 0")
    .bind(scopeKey(scope), kind, Date.now(), Date.now()).run();
}
export async function credentialStatus(env: CredsEnv, kind: MineKind, scope: CredentialScope) {
  const creds = await readCreds(env, kind, scope);
  const current = await row(env, scope, kind);
  const admin = override(env, kind);
  const workerOverride = !current?.revoked && scope.repo.toLowerCase() === await legacyRepo(env, kind) && !!(kind === "sentry" ? admin.clientSecret : admin.apiKey && admin.projectId);
  return { connected: !!(kind === "sentry" ? creds.clientSecret : creds.apiKey && creds.projectId), lastUsedAt: current?.last_used_at ?? null, workerOverride };
}
export async function linkedRepo(env: CredsEnv, kind: MineKind, scope?: CredentialScope): Promise<string | null> {
  if (!scope) return legacyRepo(env, kind); // Only for resolving the legacy webhook destination.
  const current = await row(env, scope, kind);
  if (current?.revoked) return null;
  return current?.linked || scope.repo.toLowerCase() === await legacyRepo(env, kind) ? scope.repo.toLowerCase() : null;
}
export async function linkRepo(env: CredsEnv, kind: MineKind, repo: string | null, scope: CredentialScope): Promise<void> {
  await env.DB.prepare("INSERT INTO credentials (scope, kind, linked, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope, kind) DO UPDATE SET linked = excluded.linked WHERE credentials.revoked = 0")
    .bind(scopeKey(scope), kind, repo ? 1 : 0, Date.now()).run();
}
