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

async function stored<T>(env: CredsEnv, kind: MineKind, repo?: string | null): Promise<Partial<T>> {
  return ((await env.CACHE?.get<T>(repo ? `cred:${kind}:${repo.toLowerCase()}` : `cred:${kind}`, "json").catch(() => null)) ?? {}) as Partial<T>;
}

export async function sentryCreds(env: CredsEnv, repo?: string | null): Promise<SentryCreds> {
  if (env.SENTRY_CLIENT_SECRET && (!repo || repo.toLowerCase() === await linkedRepo(env, "sentry"))) return { clientSecret: env.SENTRY_CLIENT_SECRET };
  return stored<SentryCreds>(env, "sentry", repo);
}

export async function postHogCreds(env: CredsEnv, repo?: string | null): Promise<PostHogCreds> {
  if (env.POSTHOG_API_KEY && env.POSTHOG_PROJECT_ID && (!repo || repo.toLowerCase() === await linkedRepo(env, "posthog"))) return { apiKey: env.POSTHOG_API_KEY, projectId: env.POSTHOG_PROJECT_ID, host: env.POSTHOG_HOST, keyEvent: env.POSTHOG_KEY_EVENT };
  return stored<PostHogCreds>(env, "posthog", repo);
}

export async function saveCreds(env: CredsEnv, kind: MineKind, creds: SentryCreds | PostHogCreds, repo: string): Promise<void> {
  if (!env.CACHE) throw new Error("no KV binding");
  await env.CACHE.put(repo ? `cred:${kind}:${repo.toLowerCase()}` : `cred:${kind}`, JSON.stringify(creds));
}

/** The one repo whose factory a mine feeds (Shiptorio is single-player for now). */
export async function linkedRepo(env: CredsEnv, kind: MineKind): Promise<string | null> {
  const pinned = kind === "sentry" ? env.SENTRY_REPO : env.POSTHOG_REPO;
  return pinned?.toLowerCase() || ((await env.CACHE?.get(`link:${kind}`).catch(() => null)) ?? null);
}

export async function linkRepo(_env: CredsEnv, _kind: MineKind, _repo: string | null): Promise<void> {
  // Connection state is owned by the repo's DO. Legacy global links are read-only.
}
