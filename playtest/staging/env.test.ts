import { expect, test } from "bun:test";
import { fixtureProviderEnv, FIXTURE_PROVIDER_VALUES, type FixtureEnv } from "./env";
import { Redactor } from "../../server/src/redact";

test("private provider credentials cannot redact the fixture repository or card text", () => {
  const env = { FIXTURE_INSTANCE: "shiptorio-fixture", PUBLIC_URL: "https://shiptorio.dev", GITHUB_CLIENT_SECRET: "fixture", META_API_KEY: "fixture", SESSION_SECRET: "keep-session-signing-value", TEST_FACTORY_KEY: "keep-delegation-value" } as FixtureEnv;
  const isolated = fixtureProviderEnv(env);
  expect(new Redactor(isolated).value({ repo: "test-fixture/test-newbie", title: "A fixture issue" })).toEqual({ repo: "test-fixture/test-newbie", title: "A fixture issue" });
  expect(new Redactor(isolated).text(FIXTURE_PROVIDER_VALUES.META_API_KEY)).toBe("[REDACTED]");
  expect(isolated.SESSION_SECRET).toBe(env.SESSION_SECRET);
  expect(isolated.TEST_FACTORY_KEY).toBe(env.TEST_FACTORY_KEY);
  expect(env.META_API_KEY).toBe("fixture");
  const production = { ...env, PUBLIC_URL: "https://shiptorio.com" };
  expect(fixtureProviderEnv(production)).toBe(production);
});
