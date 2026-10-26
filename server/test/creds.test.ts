import { expect, test } from "bun:test";
import { postHogCreds, saveCreds, sentryCreds } from "../src/sources/creds";

const kvEnv = (seed: Record<string, string> = {}) => {
  const kv = new Map(Object.entries(seed));
  return { CACHE: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } as never;
};

test("mine keys are per repo, so one player's Sentry never feeds another's map", async () => {
  const env = kvEnv();
  await saveCreds(env, "sentry", { clientSecret: "alice-secret-0123456789" }, "Alice/Shop");
  expect(await sentryCreds(env, "alice/shop")).toEqual({ clientSecret: "alice-secret-0123456789" });
  expect(await sentryCreds(env, "bob/app")).toEqual({});
});

test("keys saved before accounts keep working, but only for the repo they were linked to", async () => {
  const env = kvEnv({ "cred:posthog": JSON.stringify({ apiKey: "phx_legacy", projectId: "1" }), "link:posthog": "r3dbars/testing" });
  expect((await postHogCreds(env, "r3dbars/testing")).apiKey).toBe("phx_legacy");
  expect(await postHogCreds(env, "someone/else")).toEqual({});
});

test("Worker-secret keys belong to the linked map only", async () => {
  const env = { ...(kvEnv({ "link:sentry": "r3dbars/testing" }) as object), SENTRY_CLIENT_SECRET: "operator-secret-0123456789" } as never;
  expect((await sentryCreds(env, "r3dbars/testing")).clientSecret).toBe("operator-secret-0123456789");
  expect(await sentryCreds(env, "someone/else")).toEqual({});
});
