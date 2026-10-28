import { expect, it, mock } from "bun:test";
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));
const { Factory } = await import("../src/factory");

function fixture(data = new Map<string, unknown>()) {
  const f: any = Object.create(Factory.prototype);
  let stopped = false, erased = false, loads = 0, discoveries = 0, alarms = 0;
  f.meta = { repo: "owner/repo", installationId: 1 };
  f.ctx = { storage: {
    get: async (key: string) => data.get(key),
    delete: async (key: string) => data.delete(key),
  } };
  f.assertAccountActive = async () => { if (erased) throw Error("Factory deleted"); };
  f.githubStopped = async () => stopped;
  f.load = async () => { loads++; return { repo: "owner/repo" }; };
  f.accountPut = async (key: string, value: unknown) => { if (erased) throw Error("Factory deleted"); data.set(key, value); };
  f.autoConnectMines = async () => { discoveries++; };
  f.log = () => {};
  f.scheduleTick = async () => { alarms++; };
  return { f, data, counts: () => ({loads, discoveries, alarms}), stop: () => { stopped = true; }, erase: () => { erased = true; } };
}

it("opens an existing factory without optional provider I/O and loads it once", async () => {
  const { f, data, counts } = fixture();
  let providerCalled = false;
  f.autoConnectMines = async () => { providerCalled = true; throw Error("provider must not be on socket path"); };
  await f.ensure("owner/repo", 1);
  expect(providerCalled).toBe(false);
  expect(counts()).toEqual({ loads: 1, discoveries: 0, alarms: 1 });
  expect(data.get("mineReconnectPending")).toEqual({ repo: "owner/repo", installationId: 1 });
});

it("durable discovery survives eviction and coalesces reconnects, clearing only on success", async () => {
  const first = fixture();
  await Promise.all([first.f.ensure("owner/repo", 1), first.f.ensure("owner/repo", 1)]);
  const fresh = fixture(first.data);
  fresh.f.autoConnectMines = async () => { throw Error("provider offline"); };
  await expect(fresh.f.reconnectMines()).rejects.toThrow("provider offline");
  expect(first.data.has("mineReconnectPending")).toBe(true);
  const retry = fixture(first.data);
  await retry.f.reconnectMines();
  await retry.f.reconnectMines();
  expect(retry.counts().discoveries).toBe(1);
  expect(first.data.has("mineReconnectPending")).toBe(false);
});

it("deferred discovery respects current deletion, lifecycle and installation identity", async () => {
  for (const mode of ["deleted", "stopped", "installation", "repo", "reset"] as const) {
    const x = fixture(); await x.f.ensure("owner/repo", 1);
    if (mode === "deleted") x.erase();
    if (mode === "stopped") x.stop();
    if (mode === "installation") x.f.meta.installationId = 2;
    if (mode === "repo") x.f.meta.repo = "owner/other";
    if (mode === "reset") x.data.clear();
    if (mode === "deleted") await expect(x.f.reconnectMines()).rejects.toThrow("Factory deleted");
    else await x.f.reconnectMines();
    expect(x.counts().discoveries).toBe(0);
  }
});

it("repository mismatches fail before optional discovery is queued", async () => {
  const x = fixture();
  await expect(x.f.ensure("other/repo", 1)).rejects.toThrow("Repository mismatch");
  expect(x.data.size).toBe(0);
  expect(x.counts().alarms).toBe(0);
});
