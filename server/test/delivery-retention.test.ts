import { expect, it } from "bun:test";
import { pruneExpiredDeliveryMarkers } from "../src/delivery-retention";

function fixture(entries: [string, unknown][]) {
  const rows = new Map(entries);
  const calls = {list: 0, delete: 0};
  const sizes: number[] = [];
  const storage = {
    async list({prefix, limit, startAfter}: {prefix: string; limit: number; startAfter?: string}) {
      calls.list++;
      return new Map([...rows].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .filter(([k]) => k.startsWith(prefix) && (!startAfter || k > startAfter)).slice(0, limit));
    },
    async delete(keys: string | string[]) {
      calls.delete++;
      if (typeof keys === "string") return rows.delete(keys);
      sizes.push(keys.length);
      return keys.reduce((n, k) => n + Number(rows.delete(k)), 0);
    },
  };
  return {rows, calls, sizes, storage: storage as unknown as DurableObjectStorage};
}
const key = (i: number) => `done:delivery:${String(i).padStart(4, "0")}`;

it("pins completed marker retention calls and survives deleted page cursors", async () => {
  const entries: [string, unknown][] = Array.from({length: 257}, (_, i) => [key(i), 100]);
  const before = fixture(entries);
  // Original watchdog implementation, measured on the identical fixture.
  for (const [key, expiry] of await before.storage.list<number>({prefix: "done:delivery:"})) {
    if (expiry <= 100) await before.storage.delete(key);
  }
  expect(before.calls).toEqual({list: 1, delete: 257});
  const f = fixture(entries);
  expect(await pruneExpiredDeliveryMarkers(f.storage, 100)).toBe(257);
  // Before: one unbounded list and 257 individual deletes. After: three pages + three deletes.
  expect(f.calls).toEqual({list: 3, delete: 3});
  expect(f.sizes).toEqual([128, 128, 1]);
  expect(f.rows.size).toBe(0);
  expect(await pruneExpiredDeliveryMarkers(f.storage, 100)).toBe(0);
});

it("retains live markers, malformed expiries and all non-marker records", async () => {
  const retained: [string, unknown][] = [
    [key(0), 101], [key(1), "1"], [key(2), NaN],
    ["delivery:pending", {attempts: 0}], ["failed:delivery:old", 1],
    ["runnerJob:old", {status: "running"}], ["approvalEvents", [{at: 1}]],
    ["permits", {allowed: true}], ["launchCredit:1", 1], ["trace:1", {at: 1}],
  ];
  const f = fixture([...retained, [key(3), 99]]);
  expect(await pruneExpiredDeliveryMarkers(f.storage, 100)).toBe(1);
  expect(f.rows).toEqual(new Map(retained));
});

it("advances through full pages of unexpired markers and handles exact page sizes", async () => {
  const f = fixture(Array.from({length: 256}, (_, i) => [key(i), i < 128 ? 200 : 100]));
  expect(await pruneExpiredDeliveryMarkers(f.storage, 100)).toBe(128);
  expect(f.calls).toEqual({list: 3, delete: 1});
  expect(f.rows.size).toBe(128);
});

it("propagates deletion failures so the caller can report and retry cleanup", async () => {
  const f = fixture([[key(0), 1]]);
  f.storage.delete = (async () => { throw new Error("disk failure"); }) as typeof f.storage.delete;
  await expect(pruneExpiredDeliveryMarkers(f.storage, 100)).rejects.toThrow("disk failure");
  expect(f.rows.has(key(0))).toBe(true);
});
