import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { FactoryState } from "@shiptorio/shared";
import { INLINE_BYTES, STATE_SCHEMA_VERSION, jsonBytes, loadFactoryState, migrateFactoryState, saveFactoryState, stateMigrations, stateSize } from "../src/state-storage";
import original from "./fixtures/factory-state/unversioned-original.json";

// Isolated local storage copy with transaction rollback and structured-clone semantics.
export function stateStorage(initial: unknown = original) {
  const rows = new Map<string, unknown>(initial == null ? [] : [["state", structuredClone(initial)]]);
  let failAt: string | undefined;
  const storage = {
    async get(key: string) { return structuredClone(rows.get(key)); },
    async put(key: string, value: unknown) { if (key === failAt) throw new Error("injected disk failure"); rows.set(key, structuredClone(value)); },
    async delete(key: string) { return rows.delete(key); },
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const before = structuredClone(rows);
      try { return await fn(storage); } catch (err) { rows.clear(); for (const [k,v] of before) rows.set(k,v); throw err; }
    },
  };
  return { rows, storage: storage as unknown as DurableObjectStorage, fail: (key?: string) => { failAt = key; } };
}

describe("persisted factory schema", () => {
  it("has exactly one ordered migration per schema version", () => expect(stateMigrations).toHaveLength(STATE_SCHEMA_VERSION));
  for (const fixture of readdirSync(`${import.meta.dir}/fixtures/factory-state`).filter(f => f.endsWith(".json"))) {
    it(`loads and persists ${fixture}, retains user work and is idempotent`, async () => {
      const raw = await Bun.file(`${import.meta.dir}/fixtures/factory-state/${fixture}`).json();
      const f = stateStorage(raw), before = structuredClone(raw);
      const loaded = (await loadFactoryState(f.storage))!;
      expect(loaded.schemaVersion).toBe(STATE_SCHEMA_VERSION);
      expect(FactoryState.safeParse(loaded).success).toBe(true);
      expect(loaded.items).toEqual(raw.items);
      expect(loaded.science).toEqual(raw.science);
      expect(loaded.machines.some(m => m.id === "ci-1")).toBe(true);
      expect(migrateFactoryState(loaded)).toEqual(loaded);
      expect(await loadFactoryState(f.storage)).toEqual(loaded);
      expect(raw).toEqual(before);
    });
  }
  it("refuses future, malformed and negative versions without overwriting evidence", async () => {
    for (const raw of [{...original, schemaVersion: 999}, {...original, schemaVersion: null}, {...original, schemaVersion: -1}, {...original, schemaVersion: "1"}, {...original, items: null}]) {
      const f = stateStorage(raw);
      await expect(loadFactoryState(f.storage)).rejects.toThrow();
      expect(f.rows.get("state")).toEqual(raw);
    }
  });
  it("preserves unknown fields across nested and top-level schema additions", () => {
    const raw = {...original, extension: {keep: true}, items: [{...original.items[0], futureEvidence: "keep me"}]};
    const next = migrateFactoryState(raw) as unknown as typeof raw;
    expect(next.extension).toEqual(raw.extension);
    expect(next.items[0].futureEvidence).toBe("keep me");
  });
  it("retains 40 latest thoughts and lifetime counters during v1 migration", () => {
    const thought = {id: "t", at: 1, decision: "triage", by: "spark", model: "spark", title: "a", outcome: "b", reason: "c", ms: 1};
    const next = migrateFactoryState({...original, schemaVersion: 1, brain: {model: "spark", online: true, decisions: 900, fallbacks: 2, thoughts: Array.from({length: 70}, (_, i) => ({...thought, id: String(i)}))}});
    expect(next.brain!.thoughts).toHaveLength(40);
    expect(next.brain!.thoughts[0].id).toBe("0");
    expect(next.brain!.decisions).toBe(900);
  });
  it("rolls back interrupted migration writes and can retry", async () => {
    const f = stateStorage(); f.fail("state");
    await expect(loadFactoryState(f.storage)).rejects.toThrow("disk failure");
    expect(f.rows.get("state")).toEqual(original);
    f.fail(); expect((await loadFactoryState(f.storage))!.schemaVersion).toBe(2);
  });
  it("reports UTF-8 state size, atomically chunks large active work, and cleans old chunks", async () => {
    const f = stateStorage(null), large = migrateFactoryState({...original, goal: "🚀".repeat(INLINE_BYTES)});
    await saveFactoryState(f.storage, large);
    expect(stateSize(large).stateBytes).toBe(jsonBytes(large));
    expect(stateSize(large).chunked).toBe(true);
    expect((f.rows.get("state") as {chunks: number}).chunks).toBeGreaterThan(1);
    for (const [key,value] of f.rows) if (key.startsWith("stateChunk:")) expect(jsonBytes(value)).toBeLessThan(INLINE_BYTES);
    expect(await loadFactoryState(f.storage)).toEqual(large);
    f.fail("stateChunk:000001");
    await expect(saveFactoryState(f.storage, {...large, goal: large.goal + "more"})).rejects.toThrow("disk failure");
    expect(await loadFactoryState(f.storage)).toEqual(large);
    f.fail(); await saveFactoryState(f.storage, migrateFactoryState(original));
    expect([...f.rows.keys()]).toEqual(["state"]);
  });
  it("does not silently reset a snapshot whose chunk is missing", async () => {
    const f = stateStorage(); await saveFactoryState(f.storage, {...migrateFactoryState(original), goal: "x".repeat(INLINE_BYTES * 2)});
    f.rows.delete("stateChunk:000001");
    await expect(loadFactoryState(f.storage)).rejects.toThrow("Missing factory state chunk");
  });
});

it("refuses a chunked write when account deletion has stopped the factory", async () => {
  const f = stateStorage();
  const state = migrateFactoryState(original);
  state.items[0].body = "large private body ".repeat(12000);
  let calls = 0;
  await expect(saveFactoryState(f.storage, state, () => { if (++calls === 2) throw new Error("Factory deleted"); })).rejects.toThrow("Factory deleted");
  // The storage transaction rolls back the partially written chunk.
  expect([...f.rows.keys()]).toEqual(["state"]);
  expect(f.rows.get("state")).toEqual(original);
});
