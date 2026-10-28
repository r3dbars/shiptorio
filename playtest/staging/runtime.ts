import { currentTestEnvironment, currentTrace } from "../../server/src/telemetry";
import { TEST_PERSONAS, personaId, type TestPersona } from "../../server/src/test-users-policy";
import type { FixtureEnv } from "./env";

export function providerPersona(url: URL): TestPersona | null {
  const trace = currentTrace();
  const repo = trace?.repo ?? url.pathname.match(/^\/repos\/(test-fixture\/test-[\w-]+)(?:\/|$)/)?.[1];
  const byRepo = repo?.replace(/^test-fixture\//, "");
  if (TEST_PERSONAS.includes(byRepo as TestPersona)) return byRepo as TestPersona;
  const user = trace?.userId?.match(/^github:user:(-\d+)$/)?.[1];
  const installation = url.pathname.match(/^\/app\/installations\/(\d+)(?:\/|$)/)?.[1];
  return TEST_PERSONAS.find(p => user ? personaId(p) === Number(user) : installation ? 9000 + Math.abs(personaId(p)) === Number(installation) : false) ?? null;
}
/** Installed only by this private Worker entry. There is deliberately no native-network fallback. */
export const fixtureOnlyFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const env = currentTestEnvironment() as FixtureEnv | undefined;
  const request = new Request(input, init), url = new URL(request.url);
  const persona = providerPersona(url);
  if (env?.FIXTURE_INSTANCE !== "shiptorio-fixture" || !env.FIXTURE_PROVIDERS || env.PUBLIC_URL !== "https://shiptorio.dev" || !persona || url.protocol !== "https:" || !["api.github.com", "api.meta.ai"].includes(url.host)) throw new Error("Fixture denied outbound network request");
  const headers = new Headers(request.headers); headers.set("x-test-persona", persona);
  return env.FIXTURE_PROVIDERS.get(env.FIXTURE_PROVIDERS.idFromName(persona)).fetch(new Request(request, { headers }));
}) as typeof fetch;
