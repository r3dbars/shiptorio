// PRIVATE, isolated test backend. Production/staging application entries never import this file.
import { app } from "../../server/src/index";
import { createSession, currentUser } from "../../server/src/accounts";
import { seedTestUser } from "../../server/src/test-users";
import { makeSessionCookie } from "../../server/src/session";
import { ISOLATED_TEST_CONTEXT, verifyTestDelegation } from "../../server/src/test-delegation";
import { personaId, personaRepo } from "../../server/src/test-users-policy";
import { fixtureOnlyFetch } from "./runtime";
import type { FixtureEnv } from "./env";
export { Factory } from "../bot/worker";
export { FixtureProvider } from "./provider";

globalThis.fetch = fixtureOnlyFetch;
export default {
  async fetch(request: Request, env: FixtureEnv, ctx: ExecutionContext): Promise<Response> {
    if (env.FIXTURE_INSTANCE !== "shiptorio-fixture" || env.TEST_USERS !== "on" || env.PUBLIC_URL !== "https://shiptorio.dev") return new Response("Fixture disabled", { status: 503 });
    const persona = await verifyTestDelegation(request, env.TEST_FACTORY_KEY ?? "");
    if (!persona || persona === "test-guest") return new Response("Private fixture authorization required", { status: 403 });
    await seedTestUser(env, persona);
    let session = await env.CACHE.get(`fixture-session:${persona}`);
    if (!session || !(await currentUser(env, session))) {
      session = (await createSession(env, { id: personaId(persona), login: persona }, "isolated staging fixture")).split(";")[0];
      await env.CACHE.put(`fixture-session:${persona}`, session, { expirationTtl: 86400 });
    }
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    const cookie = `${session}; ${preview}`;
    const headers = new Headers(request.headers); headers.delete("x-shiptorio-test-delegation"); headers.set("cookie", cookie);
    const internal = new Request(request, { headers });
    const localEnv = { ...env, [ISOLATED_TEST_CONTEXT]: true, ASSETS: { fetch: async () => new Response("No public fixture assets", { status: 404 }) } as unknown as Fetcher };
    const repo = personaRepo(persona), provider = env.FIXTURE_PROVIDERS.get(env.FIXTURE_PROVIDERS.idFromName(persona));
    if (persona !== "test-newbie") {
      const fixture = env.FACTORY.get(env.FACTORY.idFromName(`repo:${990000 + Math.abs(personaId(persona))}`)) as unknown as { seedPersona(p: string, r: string, i: number): Promise<void>; setRepositoryId(id: number): Promise<void> };
      await fixture.seedPersona(persona, repo, 9000 + Math.abs(personaId(persona)));
      await fixture.setRepositoryId(990000 + Math.abs(personaId(persona)));
    }
    if (new URL(request.url).pathname === "/test/install") {
      const response = await provider.fetch(new Request(`http://fixture.internal/install${new URL(request.url).search}`, { method: request.method, redirect: "manual", headers: { "x-test-persona": persona } }));
      const clean = new Response(response.body, response); clean.headers.delete("set-cookie"); return clean;
    }
    if (persona !== "test-broke" && await env.DB.prepare("SELECT 1 FROM user_repos WHERE user_id=? AND repo=?").bind(personaId(persona), repo).first()) {
      await provider.fetch(new Request("http://fixture.internal/start", { method: "POST", headers: { "content-type": "application/json", "x-test-persona": persona }, body: JSON.stringify({ cookie }) }));
    }
    const response = await app.fetch(internal, localEnv, ctx);
    // An upgrade owns its headers; ordinary responses must never replace the outer app's session.
    if (response.status === 101) return response;
    const clean = new Response(response.body, response); clean.headers.delete("set-cookie");
    return clean;
  },
} satisfies ExportedHandler<FixtureEnv>;
