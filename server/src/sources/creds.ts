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

async function stored<T>(env: CredsEnv, kind: MineKind): Promise<Partial<T>> {
  return ((await env.CACHE?.get<T>(`cred:${kind}`, "json").catch(() => null)) ?? {}) as Partial<T>;
}

export async function sentryCreds(env: CredsEnv): Promise<SentryCreds> {
  if (env.SENTRY_CLIENT_SECRET) return { clientSecret: env.SENTRY_CLIENT_SECRET };
  return stored<SentryCreds>(env, "sentry");
}

export async function postHogCreds(env: CredsEnv): Promise<PostHogCreds> {
  if (env.POSTHOG_API_KEY && env.POSTHOG_PROJECT_ID) return { apiKey: env.POSTHOG_API_KEY, projectId: env.POSTHOG_PROJECT_ID, host: env.POSTHOG_HOST, keyEvent: env.POSTHOG_KEY_EVENT };
  return stored<PostHogCreds>(env, "posthog");
}

export async function saveCreds(env: CredsEnv, kind: MineKind, creds: SentryCreds | PostHogCreds): Promise<void> {
  if (!env.CACHE) throw new Error("no KV binding");
  await env.CACHE.put(`cred:${kind}`, JSON.stringify(creds));
}

/** The one repo whose factory a mine feeds (Shiptorio is single-player for now). */
export async function linkedRepo(env: CredsEnv, kind: MineKind): Promise<string | null> {
  const pinned = kind === "sentry" ? env.SENTRY_REPO : env.POSTHOG_REPO;
  return pinned?.toLowerCase() || ((await env.CACHE?.get(`link:${kind}`).catch(() => null)) ?? null);
}

export async function linkRepo(env: CredsEnv, kind: MineKind, repo: string | null): Promise<void> {
  if (!env.CACHE) return;
  if (repo) await env.CACHE.put(`link:${kind}`, repo.toLowerCase());
  else await env.CACHE.delete(`link:${kind}`);
}
