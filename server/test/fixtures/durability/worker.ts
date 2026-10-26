// LOCAL DRILL ENTRY ONLY. Not referenced by production wrangler.jsonc.
import app, { Factory as ProductionFactory, type Env } from "../../../src/index";
import { migrateFactoryState, saveFactoryState } from "../../../src/state-storage";
export class Factory extends ProductionFactory {
  async restoreForDrill(raw: unknown) {
    const state = migrateFactoryState(raw);
    await saveFactoryState(this.ctx.storage, state);
    await this.ctx.storage.put("meta", {repo: state.repo, installationId: 1});
  }
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)) return new Response("local only", {status: 403});
    if (new URL(request.url).pathname === "/__drill/restore" && request.method === "POST") {
      const raw = await request.json() as {repo: string};
      const factory = env.FACTORY.get(env.FACTORY.idFromName(raw.repo.toLowerCase())) as unknown as Factory;
      await factory.restoreForDrill(raw);
      return Response.json({restored: true});
    }
    return app.fetch(request, env, ctx);
  },
};
