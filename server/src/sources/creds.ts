// Where a mine's credentials and its repo link live. Wrangler secrets win; otherwise the
// player pasted them on /connect/<kind> and they sit in KV (never in git, logs or the factory state).

import type { PostHogCreds, PostHogSourceEnv } from "./posthog";
import type { SentryCreds, SentrySourceEnv } from "./sentry";

export type MineKind = "sentry" | "posthog";

export interface CredsEnv extends SentrySourceEnv, PostHogSourceEnv {
  CACHE?: KVNamespace;
  SENTRY_REPO?: string; // optional: pin the repo whose map gets Sentry ore
  POSTHOG_REPO?: string;
}

// Keys are per repo (`cred:<kind>:<owner/name>`), so one player's Sentry or PostHog never feeds another
// player's map. Keys saved before that (`cred:<kind>`) still count, but only for the repo they were linked to.
const key = (kind: MineKind, repo: string) => `cred:${kind}:${repo.toLowerCase()}`;

async function stored<T>(env: CredsEnv, kind: MineKind, repo?: string | null): Promise<Partial<T>> {
  const read = (k: string) => env.CACHE?.get<T>(k, "json").catch(() => null) ?? Promise.resolve(null);
  if (repo) {
    const own = await read(key(kind, repo));
    if (own) return own as Partial<T>;
    if ((await linkedRepo(env, kind)) !== repo.toLowerCase()) return {};
  }
  return ((await read(`cred:${kind}`)) ?? {}) as Partial<T>;
}

/** Keys set as Worker secrets belong to the operator's own map: the pinned repo, else whichever map linked them first. */
async function secretsApply(env: CredsEnv, kind: MineKind, repo?: string | null): Promise<boolean> {
  if (!repo) return true;
  const linked = await linkedRepo(env, kind);
  return linked === repo.toLowerCase();
}

export async function sentryCreds(env: CredsEnv, repo?: string | null): Promise<SentryCreds> {
  if (env.SENTRY_CLIENT_SECRET && (await secretsApply(env, "sentry", repo))) return { clientSecret: env.SENTRY_CLIENT_SECRET };
  return stored<SentryCreds>(env, "sentry", repo);
}

export async function postHogCreds(env: CredsEnv, repo?: string | null): Promise<PostHogCreds> {
  if (env.POSTHOG_API_KEY && env.POSTHOG_PROJECT_ID && (await secretsApply(env, "posthog", repo))) return { apiKey: env.POSTHOG_API_KEY, projectId: env.POSTHOG_PROJECT_ID, host: env.POSTHOG_HOST, keyEvent: env.POSTHOG_KEY_EVENT };
  return stored<PostHogCreds>(env, "posthog", repo);
}

export async function saveCreds(env: CredsEnv, kind: MineKind, creds: SentryCreds | PostHogCreds, repo: string): Promise<void> {
  if (!env.CACHE) throw new Error("no KV binding");
  await env.CACHE.put(key(kind, repo), JSON.stringify(creds));
}

/** The repo the legacy shared keys and the old /webhooks/sentry URL feed. Per-repo keys don't need it. */
export async function linkedRepo(env: CredsEnv, kind: MineKind): Promise<string | null> {
  const pinned = kind === "sentry" ? env.SENTRY_REPO : env.POSTHOG_REPO;
  return pinned?.toLowerCase() || ((await env.CACHE?.get(`link:${kind}`).catch(() => null)) ?? null);
}

export async function linkRepo(_env: CredsEnv, _kind: MineKind, _repo: string | null): Promise<void> {
  // Per-repo DO state owns connection lifecycle. Legacy global links are read-only.
}
