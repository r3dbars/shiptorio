export const TEST_PERSONAS = ["test-newbie", "test-guest", "test-midgame", "test-broke", "test-blocked"] as const;
export type TestPersona = typeof TEST_PERSONAS[number];
type TestPolicy = { TEST_USERS?: string; PUBLIC_URL?: string };
export const localTestHost = (u: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
export const personaId = (p: TestPersona) => -9001 - TEST_PERSONAS.indexOf(p);
export const personaRepo = (p: TestPersona) => `test-fixture/${p}`;
export function testUsersEnabled(env: TestPolicy, url: URL): boolean {
  if (env.TEST_USERS !== "on" || !env.PUBLIC_URL) return false;
  let canonical: URL;
  try { canonical = new URL(env.PUBLIC_URL); } catch { return false; }
  if (localTestHost(url)) return localTestHost(canonical) && canonical.origin === url.origin;
  return url.origin === "https://shiptorio.dev" && canonical.origin === url.origin;
}
/** Used on socket revalidation as well as HTTP entry, so disabling testers revokes access. */
export function testIdentityAllowed(env: TestPolicy, id: number, login: string): boolean {
  if (!env.PUBLIC_URL) return false;
  try {
    return testUsersEnabled(env, new URL(env.PUBLIC_URL)) && TEST_PERSONAS.includes(login as TestPersona)
      && login !== "test-guest" && id === personaId(login as TestPersona);
  } catch { return false; }
}
