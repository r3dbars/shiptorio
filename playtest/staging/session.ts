import { createSession, currentUser } from "../../server/src/accounts";
import { seedTestUser } from "../../server/src/test-users";
import { personaId, type TestPersona } from "../../server/src/test-users-policy";
import type { FixtureEnv } from "./env";

/** A valid private session proves this persona was already provisioned. Revalidate
 * it on every request, but never rewrite its user/progress/allowlist just to read.
 */
export async function fixtureSession(env: FixtureEnv, persona: TestPersona): Promise<string> {
  const key = `fixture-session:${persona}`;
  const existing = await env.CACHE.get(key);
  const user = existing ? await currentUser(env, existing) : null;
  if (user?.id === personaId(persona) && user.login === persona) return existing!;
  await seedTestUser(env, persona);
  const session = (await createSession(env, { id: personaId(persona), login: persona }, "isolated staging fixture")).split(";")[0]!;
  await env.CACHE.put(key, session, { expirationTtl: 86400 });
  return session;
}

/** Reset removes seeded progress/reach, so its old session must not skip reseeding. */
export async function clearFixtureSession(env: FixtureEnv, persona: TestPersona): Promise<void> {
  await env.CACHE.delete(`fixture-session:${persona}`);
}
