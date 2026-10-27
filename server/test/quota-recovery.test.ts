import { expect, mock, test } from "bun:test";
import { FactoryState } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { testD1, signedInCookie } from "./d1-fixture";
import { runQuotaStatus, adminSignup } from "../src/signup";
import { quotaStatus } from "../src/quotas";
import { reserveSpark, budgetAccount } from "../src/budget";
import { planningFailure, planningHold, type PlanningRetry } from "../src/planning-retry";
import type { RunnerJob } from "../src/runner-job";
import type { Env } from "../src/index";
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
const { testApp } = await import("./app-fixture");
async function fixture() {
  const DB = testD1();
  const env = { DB, SESSION_SECRET: "quota-test", SIGNUP_GATE_MODE: "waitlist", ALLOWED_LOGINS: "owner,guest", ADMIN_LOGINS: "owner", CACHE: { get: async () => ({ expiresAt: Date.now() + 59000 }), put: async () => {} } } as unknown as Env;
  const cookie = await signedInCookie(env, "owner", ["owner/repo"], 1);
  await DB.prepare("INSERT INTO signup_resources VALUES('owner','factory','owner/repo'),('owner','repo','owner/repo')").run();
  await DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at) VALUES('owner','owner',0)").run();
  const state = FactoryState.parse({ repo: "owner/repo", baseBranch: "main", districts: [], ...starterLine(), items: [{ id: "gh-1", kind: "bug", source: "github_issue", title: "Fix the cart", district: "/", state: "queued", attempts: 0, updatedAt: 1 }], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }], ["runnerPair", "pair"]]);
  let alarm: number | null = null, exclusive = Promise.resolve<unknown>(undefined);
  const storage = {
    async get(k: string) { return structuredClone(data.get(k)); },
    async put(k: string, v: unknown) { data.set(k, structuredClone(v)); },
    async delete(k: string) { return data.delete(k); },
    async list(o: { prefix?: string } = {}) { return new Map([...data.entries()].filter(([k]) => k.startsWith(o.prefix ?? ""))); },
    async getAlarm() { return alarm; }, async setAlarm(at: number) { alarm = at; },
    async transaction<T>(fn: (tx: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void> }) => Promise<T>): Promise<T> { return fn(storage); },
  };
  const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [], waitUntil: (_p: Promise<unknown>) => {} };
  const reload = () => new Factory(ctx as never, env);
  return { env, cookie, data, f: reload(), reload };
}

test("quota telemetry warns at 80%, stops at the cap, and resets at midnight without spending a run", async () => {
  const { env } = await fixture();
  const bucket = Math.floor(Date.now() / 86400000);
  await env.DB.prepare("INSERT INTO signup_counters VALUES('runs:owner',?,16,?)").bind(bucket, (bucket + 2) * 86400000).run();
  const account = await budgetAccount(env.DB, "owner/repo");
  await env.DB.prepare('INSERT INTO spark_usage VALUES(?,?,160,400000)').bind(account, new Date().toISOString().slice(0, 10)).run();
  env.ADMIN_LOGINS = "admin";
  const status = await quotaStatus(env, "owner/repo", { id: 1, login: "admin" });
  expect(status.quotas.filter(q => ['runs','spark-calls','spark-tokens'].includes(q.id)).map(q => q.status)).toEqual(['warning','warning','warning']);
  expect(status.quotas[0].raiseUrl).toBe('/admin/signup?login=owner');
  expect(status.resetsAt).toBe((bucket + 1) * 86400000);
  expect((await runQuotaStatus(env, 'owner')).used).toBe(16);
  expect((await runQuotaStatus(env, 'owner', status.resetsAt)).used).toBe(0);
  expect((await quotaStatus(env, 'owner/repo', { id: 2, login: 'guest' })).quotas[0].raiseUrl).toBeNull();
  await env.DB.prepare("UPDATE signup_counters SET count=20").run();
  expect((await quotaStatus(env, 'owner/repo', { id: 1, login: 'admin' })).quotas[0].status).toBe('stopped');
});

test("one-tap admin link selects existing limits; saving raises Spark and run quotas immediately", async () => {
  const { env } = await fixture();
  env.ADMIN_LOGINS = 'admin';
  const adminCookie = await signedInCookie(env, 'admin', [], 3);
  await env.DB.prepare("INSERT INTO signup_allowlist(login,approved_by,updated_at) VALUES('admin','admin',0)").run();
  await env.DB.prepare("UPDATE signup_allowlist SET runs_daily=5, spark_calls_daily=0, spark_tokens_daily=0").run();
  const account = await budgetAccount(env.DB, 'owner/repo');
  await expect(reserveSpark(env, account, 1)).rejects.toThrow('exhausted');
  const page = await adminSignup(new Request('https://shiptorio.test/admin/signup?login=owner', { headers: { cookie: adminCookie } }), env);
  const html = await page.text();
  expect(html).toContain('value="owner" required'); expect(html).toContain('value="5"');
  const response = await adminSignup(new Request('https://shiptorio.test/admin/signup', { method: 'POST', headers: { cookie: adminCookie, origin: 'https://shiptorio.test' }, body: new URLSearchParams({ action: 'limits', login: 'owner', runs: '30', factories: '3', repos: '3', spark_calls: '500', spark_tokens: '1000000' }) }), env);
  expect(response.status).toBe(200);
  await expect(reserveSpark(env, account, 1)).resolves.toMatchObject({ account });
  const q = await quotaStatus(env, 'owner/repo', { id: 1, login: 'owner' });
  expect(q.quotas.slice(0, 3).map(q => q.limit)).toEqual([30, 500, 1000000]);
});

test("three failed plans consume zero run quota, back off across restarts, and cannot retry early", async () => {
  const { f, env, data, reload } = await fixture();
  const input = { itemId: 'gh-1', harness: 'codex' as const, allowedPaths: [], needsApproval: true };
  let current = f;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const job = await current.enqueueRunner(input);
    // No App private key: the real planner fails before it can talk to GitHub or Spark.
    await (current as unknown as { planRunnerJob(job: RunnerJob): Promise<void> }).planRunnerJob(job);
    expect((await current.runnerJobs()).find(j => j.id === job.id)?.error).toContain('No build run charged');
    const retry = data.get('planningRetry:gh-1') as PlanningRetry;
    expect(retry.failures).toBe(attempt);
    expect(retry.retryAt).toBeGreaterThan(Date.now());
    expect((await runQuotaStatus(env, 'owner')).used).toBe(0);
    current = reload();
    await expect(current.enqueueRunner(input)).rejects.toThrow('Planning paused');
    if (attempt < 3) data.set('planningRetry:gh-1', { ...retry, retryAt: Date.now() - 1 });
  }
  const retry = data.get('planningRetry:gh-1') as PlanningRetry;
  expect(retry.retryAt).toBe((Math.floor(Date.now() / 86400000) + 1) * 86400000);
});

test("legacy hosted scoping failures also preserve run quota and wait behind the persisted cooldown", async () => {
  const { f, env, data } = await fixture();
  env.META_API_KEY = "test-only";
  await f.usage(); // loads the real factory state without contacting providers
  await (f as unknown as { runSparkJob(itemId: string, machineId: string): Promise<void> }).runSparkJob('gh-1', 'assembler-1');
  expect((await runQuotaStatus(env, 'owner')).used).toBe(0);
  expect((data.get('state') as FactoryState).items[0]).toMatchObject({ state: 'queued', attempts: 0 });
  expect(data.get('planningRetry:gh-1')).toMatchObject({ failures: 1 });
});

test("approved ready jobs wait for capacity and dispatch charges exactly once, including a lost claim", async () => {
  const { f, env, data } = await fixture();
  env.ADMIN_LOGINS = 'admin';
  const job = await f.enqueueRunner({ itemId: 'gh-1', harness: 'codex', allowedPaths: ['src/cart.ts'] });
  expect((await runQuotaStatus(env, 'owner')).used).toBe(0);
  data.set(`runnerJob:${job.id}`, { ...job, status: 'ready' });
  await env.DB.prepare("UPDATE signup_allowlist SET runs_daily=0").run();
  expect(await f.claimRunner('pair', ['codex'])).toBeNull();
  expect((await f.runnerJobs())[0].status).toBe('ready');
  expect(await env.DB.prepare("SELECT hits FROM signup_abuse WHERE scope='runs:owner'").first()).toBeNull();
  await env.DB.prepare("UPDATE signup_allowlist SET runs_daily=20").run();
  // No installation credential in this fixture: dispatch persists the lease, then token delivery fails.
  // Recover that lost claim after the response timeout; it must reuse the run, never debit again.
  await expect(f.claimRunner('pair', ['codex'])).rejects.toThrow();
  expect((await runQuotaStatus(env, 'owner')).used).toBe(1);
  const running = (await f.runnerJobs())[0];
  expect(running.status).toBe('running');
  data.set(`runnerJob:${job.id}`, { ...running, deadline: Date.now() + 30 * 60000 - 46000 });
  await expect(f.claimRunner('pair', ['codex'])).rejects.toThrow();
  expect((await runQuotaStatus(env, 'owner')).used).toBe(1);
  expect((await f.runnerJobs())[0].lease).toBe(running.lease);
});

test("planning cooldowns increase, midnight clears the cap, and issue state cannot reset the retry ledger", () => {
  const start = Date.parse('2026-10-26T20:00:00Z');
  const one = planningFailure(undefined, 'offline', start);
  const two = planningFailure(one, 'offline', start + 60000);
  const three = planningFailure(two, 'offline', start + 180000);
  expect(one.retryAt - start).toBe(60000);
  expect(two.retryAt - (start + 60000)).toBe(120000);
  expect(three.retryAt).toBe(Date.parse('2026-10-27T00:00:00Z'));
  expect(planningHold(three, three.retryAt - 1)).toEqual(three);
  expect(planningHold(three, three.retryAt)).toBeNull();
  expect(planningFailure(three, 'offline', three.retryAt).failures).toBe(1);
});

test("a GitHub rate limit pauses planning until GitHub's retry time without spending a daily try", () => {
  const start = Date.parse('2026-10-27T03:00:00Z');
  const limited = (at: number) => `GitHub rate limit; queued work retries after ${new Date(at).toISOString()}`;
  const one = planningFailure(undefined, 'offline', start);
  const paused = planningFailure(one, limited(start + 25 * 60000), start + 120000);
  expect(paused.failures).toBe(1);
  expect(paused.retryAt).toBe(start + 25 * 60000);
  expect(planningHold(paused, start + 25 * 60000 - 1)).toEqual(paused);
  expect(planningHold(paused, start + 25 * 60000)).toBeNull();
  // A ledger written before this fix counted the rate limit as the third try; it only waits out the pause.
  const legacy: PlanningRetry = { day: '2026-10-27', failures: 3, retryAt: Date.parse('2026-10-28T00:00:00Z'), reason: limited(start + 60000) };
  expect(planningHold(legacy, start + 120000)).toEqual(legacy);
  const capped = planningFailure(planningFailure(paused, 'offline', start + 26 * 60000), 'offline', start + 30 * 60000);
  expect(capped.failures).toBe(3);
  expect(planningHold(capped, start + 60 * 60000)?.retryAt).toBe(Date.parse('2026-10-28T00:00:00Z'));
});

test("limits endpoint denies other repos, requires authentication, and returns no-store telemetry", async () => {
  const { env, cookie } = await fixture();
  const bindings = { ...env, FACTORY: { idFromName: (s: string) => s, get: () => ({ runnerJobs: async () => [], planningRetries: async () => [], securityLimit: async () => ({ allowed: true, retryAfter: 0 }) }) } };
  const request = (path: string, auth = cookie) => testApp.fetch(new Request(`https://shiptorio.test${path}`, { headers: { cookie: auth } }), bindings);
  expect((await request('/api/repos/owner/repo/limits', '')).status).toBe(401);
  expect((await request('/api/repos/stranger/repo/limits')).status).toBe(403);
  const response = await request('/api/repos/owner/repo/limits');
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
  expect((await response.json() as { quotas: unknown[] }).quotas).toHaveLength(7);
});


test("daily planning cap survives an elapsed timestamp and does not block another issue", async () => {
  const { f, data, env, reload } = await fixture();
  await f.usage();
  const state = data.get('state') as FactoryState;
  data.set('state', { ...state, items: [...state.items, { ...state.items[0], id: 'gh-2' }] });
  const retry = { day: new Date().toISOString().slice(0, 10), failures: 3, retryAt: Date.now() - 1, reason: 'offline' };
  data.set('planningRetry:gh-1', retry);
  const current = reload();
  const input = { harness: 'codex' as const, allowedPaths: ['src/cart.ts'] };
  await expect(current.enqueueRunner({ ...input, itemId: 'gh-1' })).rejects.toThrow('Planning paused');
  expect(await current.enqueueRunner({ ...input, itemId: 'gh-2' })).toMatchObject({ status: 'planning' });
  expect((await runQuotaStatus(env, 'owner')).used).toBe(0);
});


test("quota telemetry reports the configured owner floor and effective resource limits without a row", async () => {
  const { env } = await fixture();
  await env.DB.prepare("DELETE FROM signup_allowlist WHERE login='owner'").run();
  const status = await quotaStatus(env, 'owner/repo', { id: 1, login: 'owner' });
  expect(status.quotas.filter(q => ['runs', 'factories', 'repos'].includes(q.id)).map(q => q.limit)).toEqual([200, 99999, 99999]);
});
