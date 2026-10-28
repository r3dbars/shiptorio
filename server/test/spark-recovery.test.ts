import { afterEach, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { sparkChat, sparkJson } from "../src/spark";
import { planningFailureKind } from "../src/planning-retry";
import { budgetUsage } from "../src/budget";
import { sparkTestEnv } from "./budget-fixture";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("provider 429 parks until Retry-After without spending immediate retry calls", async () => {
  const env = sparkTestEnv();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(null, { status: 429, headers: { 'Retry-After': '300' } }); }) as unknown as typeof fetch;
  const before = Date.now();
  try { await sparkChat(env, []); throw new Error('expected failure'); }
  catch (error) { expect(planningFailureKind(error)).toBe('rate_limit'); expect((error as { retryAt: number }).retryAt).toBeGreaterThanOrEqual(before + 300000); }
  expect(calls).toBe(1);
});

test("5xx retries are bounded and every attempted paid call keeps its reservation", async () => {
  const env = sparkTestEnv();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(null, { status: 503 }); }) as unknown as typeof fetch;
  try { await sparkChat(env, []); throw new Error('expected failure'); }
  catch (error) { expect(planningFailureKind(error)).toBe('unavailable'); }
  expect(calls).toBe(3);
  expect((await budgetUsage(env, 'owner')).calls).toBe(3);
});

test("slow provider requests abort with a bounded timeout and bounded retries", async () => {
  const env = sparkTestEnv();
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const durations: number[] = [];
  const timer = spyOn(AbortSignal, 'timeout').mockImplementation(ms => { durations.push(ms); return timeout(2); });
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  })) as unknown as typeof fetch;
  try {
    try { await sparkChat(env, []); throw new Error('expected timeout'); }
    catch (error) { expect(planningFailureKind(error)).toBe('timeout'); }
  } finally { timer.mockRestore(); }
  expect(durations).toEqual([15000, 15000, 15000]);
});

test("bad structured output gets only one correction before parking", async () => {
  const env = sparkTestEnv();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ choices: [{ message: { content: 'not JSON' } }] }); }) as unknown as typeof fetch;
  try { await sparkJson(env, z.object({ plan: z.string() }), 'Plan', 'Task', 'low'); throw new Error('expected bad output'); }
  catch (error) { expect(planningFailureKind(error)).toBe('bad_output'); }
  expect(calls).toBe(2);
});

test("daily call and token caps stop before fetch, including 400 calls and 1M tokens", async () => {
  for (const [calls, tokens] of [[400, 0], [0, 1000000]]) {
    const env = sparkTestEnv();
    await env.DB.prepare('INSERT INTO spark_usage VALUES(?,?,?,?)').bind('owner', new Date().toISOString().slice(0, 10), calls, tokens).run();
    let fetched = false;
    globalThis.fetch = (async () => { fetched = true; return new Response(null); }) as unknown as typeof fetch;
    try { await sparkChat(env, []); throw new Error('expected cap'); }
    catch (error) { expect(planningFailureKind(error)).toBe('cap'); }
    expect(fetched).toBe(false);
  }
});
