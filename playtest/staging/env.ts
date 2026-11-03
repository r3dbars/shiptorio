import type { Env } from "../../server/src/index";
import type { FixtureProvider } from "./provider";
export interface FixtureEnv extends Env {
  FIXTURE_INSTANCE: "shiptorio-fixture";
  FIXTURE_PROVIDERS: DurableObjectNamespace<FixtureProvider>;
  TEST_FACTORY_KEY: string;
}

// These credentials are consumed only by the in-process provider stubs, never a
// real API. Short values such as "fixture" otherwise redact the fixture repo name.
export const FIXTURE_PROVIDER_VALUES = {
  GITHUB_CLIENT_SECRET: "fixture-only-oauth-00000000-0000-4000-8000-000000000001",
  META_API_KEY: "fixture-only-meta-00000000-0000-4000-8000-000000000002",
} as const;
export function fixtureProviderEnv(env: FixtureEnv): FixtureEnv {
  if (env.FIXTURE_INSTANCE !== "shiptorio-fixture" || env.PUBLIC_URL !== "https://shiptorio.dev") return env;
  return { ...env, ...FIXTURE_PROVIDER_VALUES };
}
