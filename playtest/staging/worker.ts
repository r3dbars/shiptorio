import { settleFixtureLease } from "./request-lease";
// PRIVATE, isolated test backend. Production/staging application entries never import this file.
import { app } from "../../server/src/index";
import { fixtureSession, clearFixtureSession } from "./session";
import { FixtureTiming } from "./timing";
import { makeSessionCookie } from "../../server/src/session";
import { ISOLATED_TEST_CONTEXT, verifyTestDelegation } from "../../server/src/test-delegation";
import { personaId, personaRepo } from "../../server/src/test-users-policy";
import { fixtureOnlyFetch } from "./runtime";
import type { FixtureEnv } from "./env";
import { Factory as SeededFactory } from "../bot/worker";
export class Factory extends SeededFactory {
  async prepareFixtureReset() {
    const existing = await this.ctx.storage.get<{ receipt: string; complete: boolean }>("fixtureReset");
    if (existing) {
      const alarm = await this.ctx.storage.getAlarm();
      if (!existing.complete && (alarm === null || alarm > Date.now() + 5000)) await this.ctx.storage.setAlarm(Date.now() + 1);
      return existing;
    }
    const reset = { receipt: crypto.randomUUID(), complete: false };
    await this.ctx.storage.put("fixtureReset", reset);
    await this.ctx.storage.setAlarm(Date.now() + 1);
    return reset;
  }
  async confirmFixtureReset(receipt: string) { const reset = await this.ctx.storage.get<{receipt:string;complete:boolean}>("fixtureReset"); return reset?.complete === true && reset.receipt === receipt; }
  async completeFixtureReset() { await this.ctx.storage.delete("fixtureReset"); }
  async alarm() {
    const reset = await this.ctx.storage.get<{receipt:string;complete:boolean}>("fixtureReset");
    if (!reset) {
      await super.alarm();
      const pending = await this.ctx.storage.get<{complete:boolean}>("fixtureReset");
      if (pending && !pending.complete) await this.ctx.storage.setAlarm(Date.now() + 1);
      return;
    }
    if (reset.complete) return;
    await this.eraseAccountData();
    await this.ctx.storage.put("fixtureReset", { ...reset, complete: true });
    await this.ctx.storage.sync();
    this.ctx.abort("Fixture reset completed");
  }
}
export { FixtureProvider } from "./provider";

globalThis.fetch = fixtureOnlyFetch;
export default {
  async fetch(request: Request, env: FixtureEnv, ctx: ExecutionContext): Promise<Response> {
    if (env.FIXTURE_INSTANCE !== "shiptorio-fixture" || env.TEST_USERS !== "on" || env.PUBLIC_URL !== "https://shiptorio.dev") return new Response("Fixture disabled", { status: 503 });
    const timing = new FixtureTiming();
    const persona = await verifyTestDelegation(request, env.TEST_FACTORY_KEY ?? "");
    timing.mark("verify");
    if (!persona || persona === "test-guest") return new Response("Private fixture authorization required", { status: 403 });
    if (new URL(request.url).pathname === "/test/reset") {
      const repo = personaRepo(persona), id = personaId(persona), installation = 9000 + Math.abs(id);
      const provider = env.FIXTURE_PROVIDERS.get(env.FIXTURE_PROVIDERS.idFromName(persona));
      const stopped = await provider.fetch(new Request("http://fixture.internal/reset", { method: "POST", headers: { "x-test-persona": persona } }));
      if (!stopped.ok) return new Response("Fixture reset failed", { status: stopped.status === 409 ? 409 : 503 });
      const factory = env.FACTORY.get(env.FACTORY.idFromName(`repo:${990000 + Math.abs(id)}`)) as unknown as Factory;
      const reset = await factory.prepareFixtureReset();
      if (!reset.complete) return new Response("Fixture reset pending", { status: 409 });
      if (!await factory.confirmFixtureReset(reset.receipt)) return new Response("Fixture wipe was not confirmed", { status: 503 });
      await env.DB.batch([
        env.DB.prepare("DELETE FROM user_repos WHERE user_id=? AND repo=?").bind(id, repo),
        env.DB.prepare("DELETE FROM user_installations WHERE user_id=? AND installation_id=?").bind(id, installation),
        env.DB.prepare("DELETE FROM repos WHERE full_name=? AND installation_id=?").bind(repo, installation),
        env.DB.prepare("DELETE FROM installations WHERE id=?").bind(installation),
        env.DB.prepare("DELETE FROM pull_requests WHERE repo=?").bind(repo),
        env.DB.prepare("DELETE FROM user_progress WHERE user_id=?").bind(id),
        env.DB.prepare("DELETE FROM user_prefs WHERE user_id=?").bind(id),
        env.DB.prepare("DELETE FROM spark_factory_calls WHERE repo=?").bind(repo),
        env.DB.prepare("DELETE FROM factory_budget_owners WHERE repo=?").bind(repo),
        env.DB.prepare("DELETE FROM spark_usage WHERE account=?").bind(`user:${id}`),
        env.DB.prepare("DELETE FROM signup_counters WHERE scope=?").bind(`runs:${persona}`),
        env.DB.prepare("DELETE FROM signup_resources WHERE login=? AND resource=?").bind(persona, repo),
        env.DB.prepare("DELETE FROM spark_factory_budgets WHERE repo=?").bind(repo),
      ]);
      await clearFixtureSession(env, persona);
      await factory.completeFixtureReset();
      const resumed = await provider.fetch(new Request("http://fixture.internal/resume", { method: "POST", headers: { "x-test-persona": persona } }));
      if (!resumed.ok) return new Response("Fixture reset remains locked", { status: 503 });
      return Response.json({ reset: persona });
    }
    const gate = env.FIXTURE_PROVIDERS.get(env.FIXTURE_PROVIDERS.idFromName(persona));
    const entered = await gate.fetch(new Request("http://fixture.internal/enter", { method: "POST", headers: { "x-test-persona": persona } }));
    if (!entered.ok) return new Response("Fixture reset in progress", { status: 409 });
    const { leaseId } = await entered.json() as { leaseId: string };
    timing.mark("enter");
    let upgraded = false;
    try {
    const session = await fixtureSession(env, persona);
    timing.mark("session");
    const preview = (await makeSessionCookie(`${env.SESSION_SECRET}:${env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    const cookie = `${session}; ${preview}`;
    timing.mark("preview");
    const headers = new Headers(request.headers); headers.delete("x-shiptorio-test-delegation"); headers.set("cookie", cookie);
    const internal = new Request(request, { headers });
    const localEnv = { ...env, [ISOLATED_TEST_CONTEXT]: true, ASSETS: { fetch: async () => new Response("No public fixture assets", { status: 404 }) } as unknown as Fetcher };
    const repo = personaRepo(persona), provider = env.FIXTURE_PROVIDERS.get(env.FIXTURE_PROVIDERS.idFromName(persona));
    if (persona !== "test-newbie") {
      const fixture = env.FACTORY.get(env.FACTORY.idFromName(`repo:${990000 + Math.abs(personaId(persona))}`)) as unknown as { seedPersona(p: string, r: string, i: number): Promise<void>; setRepositoryId(id: number): Promise<void> };
      await fixture.seedPersona(persona, repo, 9000 + Math.abs(personaId(persona)));
      await fixture.setRepositoryId(990000 + Math.abs(personaId(persona)));
    }
    timing.mark("seed");
    if (new URL(request.url).pathname === "/test/install") {
      const response = await provider.fetch(new Request(`http://fixture.internal/install${new URL(request.url).search}`, { method: request.method, redirect: "manual", headers: { "x-test-persona": persona } }));
      const clean = new Response(response.body, response); clean.headers.delete("set-cookie"); return clean;
    }
    if (persona !== "test-broke" && await env.DB.prepare("SELECT 1 FROM user_repos WHERE user_id=? AND repo=?").bind(personaId(persona), repo).first()) {
      await provider.fetch(new Request("http://fixture.internal/start", { method: "POST", headers: { "content-type": "application/json", "x-test-persona": persona }, body: JSON.stringify({ cookie }) }));
    }
    timing.mark("runner");
    const response = await app.fetch(internal, localEnv, ctx);
    timing.mark("app");
    // An upgrade owns its headers; ordinary responses must never replace the outer app's session.
    if (response.status === 101) { upgraded = true; return timing.attach(response); }
    const clean = new Response(response.body, response); clean.headers.delete("set-cookie");
    return timing.attach(clean);
    } finally {
      await settleFixtureLease(upgraded, () => gate.fetch(new Request("http://fixture.internal/exit", { method: "POST", headers: { "x-test-persona": persona, "content-type": "application/json" }, body: JSON.stringify({ leaseId }) })), ctx);
    }
  },
} satisfies ExportedHandler<FixtureEnv>;
