// Local Miniflare entry ONLY. Never referenced by a deploy configuration.
import app, { Factory as RealFactory, type Env } from "../../server/src/index";
import { personaSnapshot } from "./personas";
import { requireUser } from "../../server/src/authorization";
import { pairToken } from "../../server/src/runner-auth";
export class Factory extends RealFactory {
  async seedPersona(persona: string, repo: string, installationId: number) {
    const state = personaSnapshot(persona, repo);
    await this.importLegacy([["state", state], ["meta", { repo, installationId }]]);
  }
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/_bot/runner") {
      if (!["localhost", "127.0.0.1"].includes(url.hostname) || request.method !== "POST" || request.headers.get("x-shiptorio-test-hop") !== env.TEST_FACTORY_KEY) return new Response("Denied", { status: 403 });
      const user = await requireUser(request, env);
      if (!user || user.id >= 0 || !/^test-(newbie|midgame|blocked)$/.test(user.login)) return new Response("Invalid fixture account", { status: 403 });
      const repo = `test-fixture/${user.login}`;
      const row = await env.DB.prepare("SELECT repo_id,installation_id FROM repos WHERE full_name=?").bind(repo).first<{ repo_id: number; installation_id: number }>();
      if (!row) return new Response("Install the fixture repository first", { status: 409 });
      const f = env.FACTORY.get(env.FACTORY.idFromName(`repo:${row.repo_id}`));
      await f.ensure(repo, row.installation_id);
      return Response.json({ token: await pairToken(env.SESSION_SECRET, { repo, user, pairId: await f.pairRunner(), expires: Date.now() + 3600000 }) });
    }
    if (url.pathname === "/_bot/seed") {
      if (!["localhost", "127.0.0.1"].includes(url.hostname) || request.method !== "POST" || request.headers.get("x-shiptorio-test-hop") !== env.TEST_FACTORY_KEY) return new Response("Denied", { status: 403 });
      const { persona, repo, installationId, repoId } = await request.json() as { persona: string; repo: string; installationId: number; repoId: number };
      if (!/^test-(midgame|broke|blocked)$/.test(persona) || repo !== `test-fixture/${persona}`) return new Response("Bad fixture", { status: 400 });
      const stub = env.FACTORY.get(env.FACTORY.idFromName(`repo:${repoId}`)) as unknown as { seedPersona(p: string, r: string, i: number): Promise<void> };
      await stub.seedPersona(persona, repo, installationId);
      return Response.json({ ok: true });
    }
    return app.fetch(request, env, ctx);
  },
};
