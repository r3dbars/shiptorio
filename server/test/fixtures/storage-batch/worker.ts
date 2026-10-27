// Local-only workerd fixture: no production bindings, credentials, or external calls.
import { DurableObject } from "cloudflare:workers";
import { loadFactoryState, migrateFactoryState, saveFactoryState } from "../../../src/state-storage";
import { pruneExpiredDeliveryMarkers } from "../../../src/delivery-retention";
import original from "../factory-state/unversioned-original.json";

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

export class StorageTest extends DurableObject {
  async fetch(): Promise<Response> {
    const storage = this.ctx.storage;
    const small = migrateFactoryState(original);
    const goal = "🚀漢字".repeat(16000 * 33); // >128 chunks; multi-byte UTF-8 and surrogate pairs.
    const large = { ...small, goal };
    await saveFactoryState(storage, small);
    let checked = 0, failed = false;
    try {
      // The first 128-key bulk put has completed before this injected later-batch failure.
      await saveFactoryState(storage, large, () => { if (++checked === 129) throw new Error("injected later-batch failure"); });
    } catch (error) { failed = error instanceof Error && error.message === "injected later-batch failure"; }
    check(failed && checked === 129, "later-batch injection did not run");
    check(JSON.stringify(await loadFactoryState(storage)) === JSON.stringify(small), "transaction did not restore original snapshot");
    check((await storage.list({prefix: "stateChunk:"})).size === 0, "rolled-back chunk batch survived");

    await saveFactoryState(storage, large);
    const manifest = await storage.get<{chunks: number}>("state");
    check(manifest && manifest.chunks > 128, "fixture did not cross 128-key boundary");
    check((await loadFactoryState(storage))?.goal === goal, "Unicode snapshot did not round-trip");
    await saveFactoryState(storage, small);
    check((await storage.list({prefix: "stateChunk:"})).size === 0, "shrink left obsolete chunks");
    check(JSON.stringify(await loadFactoryState(storage)) === JSON.stringify(small), "shrink changed snapshot");

    for (let start = 0; start < 257; start += 128) {
      const markers: Record<string, number> = {};
      for (let i = start; i < Math.min(start + 128, 257); i++) markers[`done:delivery:${String(i).padStart(4, "0")}`] = 100;
      await storage.put(markers);
    }
    await storage.put("done:delivery:live", 101);
    check(await pruneExpiredDeliveryMarkers(storage, 100) === 257, "real storage retention pagination skipped expired markers");
    check((await storage.list({prefix: "done:delivery:"})).size === 1, "retention removed a live marker");
    return Response.json({chunks: manifest.chunks, rollback: true, unicode: true, shrink: true, expiredMarkers: 257});
  }
}
export default {
  fetch(_request: Request, env: {STORAGE_TEST: DurableObjectNamespace}) {
    return env.STORAGE_TEST.get(env.STORAGE_TEST.idFromName("isolated-test")).fetch("http://local/exercise");
  },
};
