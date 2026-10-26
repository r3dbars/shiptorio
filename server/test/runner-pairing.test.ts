import { expect, mock, test } from "bun:test";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
test("one pairing slot per repository replaces older runners and revoke clears it", async () => {
  const data = new Map<string, unknown>();
  const storage = { get: async (k: string) => data.get(k), put: async (k: string, v: unknown) => { data.set(k, v); }, delete: async (k: string) => data.delete(k) };
  const f = new Factory({ storage } as never, {} as never);
  const first = await f.pairRunner(), second = await f.pairRunner();
  expect(await f.isRunnerPaired(first)).toBe(false);
  expect(await f.isRunnerPaired(second)).toBe(true);
  await f.revokeRunner();
  expect(await f.isRunnerPaired(second)).toBe(false);
});

test("a copied pairing token cannot claim another job while its slot is running", async () => {
  const job = { status: "running", deadline: Date.now() + 60000 };
  const storage = { get: async () => "pair", list: async () => new Map([["runnerJob:active", job]]) };
  const f = new Factory({ storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn() } as never, {} as never);
  expect(await f.claimRunner("pair", ["codex"])).toBeNull();
});
