import { expect, mock, spyOn, test } from "bun:test";
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
  await env.DB.prepare('INSERT INTO spark_usage VALUES(?,?,320,800000)').bind(account, new Date().toISOString().slice(0, 10)).run();
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
  // The provider refuses the key. Never reach the real API: a transient network error there retried with
  // backoff after this test ended and landed on other files' fetch mocks.
  const provider = spyOn(globalThis, "fetch").mockImplementation((async () => new Response(null, { status: 401 })) as unknown as typeof fetch);
  try { await (f as unknown as { runSparkJob(itemId: string, machineId: string): Promise<void> }).runSparkJob('gh-1', 'assembler-1'); }
  finally { provider.mockRestore(); }
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
  expect(planningHold(legacy, start + 30000)).toEqual({ ...legacy, retryAt: start + 60000 });
  expect(planningHold(legacy, start + 60000)).toBeNull();
  expect(planningHold(legacy, start + 120000)).toBeNull();
  // Invalid timestamps cannot turn a real daily cap into a free retry.
  expect(planningHold({ ...legacy, reason: limited(start) + 'invalid' }, start + 120000)?.retryAt).toBe(legacy.retryAt);
  expect(planningHold({ ...legacy, reason: 'offline' }, start + 120000)?.retryAt).toBe(legacy.retryAt);
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

test("every planner failure releases the job, publishes one calm card, and resumes without a player tap", async () => {
  const { BudgetError } = await import('../src/budget');
  const { SparkError } = await import('../src/spark');
  const { OutboundError } = await import('../src/reliability');
  const { PLANNER_REST_KEY } = await import('../src/planning-retry');
  for (const error of [new SparkError('Planner rate limit (429)'), new OutboundError(503), new DOMException('Timed out', 'TimeoutError'), new BudgetError('Planner daily call/token budget exhausted'), new SparkError('malformed JSON')]) {
    const { f, data, reload } = await fixture();
    const input = { itemId: 'gh-1', harness: 'codex' as const, allowedPaths: ['src/cart.ts'] };
    const job = await f.enqueueRunner(input);
    const methods = f as unknown as { performRunnerPlan(job: RunnerJob, signal: AbortSignal): Promise<void>; planRunnerJob(job: RunnerJob): Promise<void>; refreshDecisions(): Promise<void> };
    const attempt = spyOn(methods, 'performRunnerPlan').mockRejectedValue(error);
    try { await methods.planRunnerJob(job); } finally { attempt.mockRestore(); }
    expect((await f.runnerJobs())[0]).toMatchObject({ status: 'failed', deadline: undefined });
    expect(data.has(`planningResume:${job.id}`)).toBe(true);
    for (let n = 0; n < 3; n++) await methods.refreshDecisions();
    expect((data.get('state') as FactoryState).deck?.filter(m => m.id === 'planner-rest')).toHaveLength(1);
    expect((data.get('state') as FactoryState).bottleneck).toBeTruthy(); // deterministic engine still runs
    // Simulate the persisted reset elapsing, then cold-start the object and run its planning pass.
    for (const key of [PLANNER_REST_KEY, 'planningRetry:gh-1']) {
      const retry = data.get(key) as PlanningRetry;
      data.set(key, { ...retry, retryAt: Date.now() - 1 });
    }
    const restored = reload();
    await restored.usage();
    const resumed = restored as unknown as { planRunnerJobs(): Promise<void>; performRunnerPlan(job: RunnerJob): Promise<void>; refreshDecisions(): Promise<void> };
    let resumedJob: RunnerJob | undefined;
    const recovered = spyOn(resumed, 'performRunnerPlan').mockImplementation(async j => { resumedJob = j; data.set(`runnerJob:${j.id}`, { ...j, status: 'awaiting_approval' }); data.delete(`planningResume:${j.id}`); });
    try { await resumed.planRunnerJobs(); await resumed.refreshDecisions(); } finally { recovered.mockRestore(); }
    expect(resumedJob?.id).toBe(job.id);
    expect(resumedJob?.planningStarted).toBe(false);
    expect((data.get('state') as FactoryState).deck?.some(m => m.id === 'planner-rest')).toBe(false);
  }
});

test("an expired persisted planning deadline fails before any provider work starts", async () => {
  const { f, data } = await fixture();
  const job = await f.enqueueRunner({ itemId: 'gh-1', harness: 'codex', allowedPaths: ['src/cart.ts'] });
  job.deadline = Date.now() - 1;
  data.set(`runnerJob:${job.id}`, job);
  const methods = f as unknown as { planRunnerJob(job: RunnerJob): Promise<void>; performRunnerPlan(job: RunnerJob): Promise<void> };
  const work = spyOn(methods, 'performRunnerPlan');
  try { await methods.planRunnerJob(job); expect(work).not.toHaveBeenCalled(); } finally { work.mockRestore(); }
  expect((await f.runnerJobs())[0].status).toBe('failed');
  expect((data.get('planningRetry:gh-1') as PlanningRetry).kind).toBe('timeout');
});

test("a hung planning attempt leaves planning at its deadline and cannot publish a late ready job", async () => {
  const { f } = await fixture();
  const job = await f.enqueueRunner({ itemId: 'gh-1', harness: 'codex', allowedPaths: ['src/cart.ts'] });
  job.deadline = Date.now() + 10;
  const methods = f as unknown as { planRunnerJob(job: RunnerJob): Promise<void>; performRunnerPlan(job: RunnerJob, signal: AbortSignal): Promise<void> };
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const work = spyOn(methods, 'performRunnerPlan').mockImplementation(async (j, signal) => { await wait; signal.throwIfAborted(); j.status = 'ready'; });
  const before = Date.now();
  try {
    await methods.planRunnerJob(job);
    expect(Date.now() - before).toBeLessThan(500);
    expect((await f.runnerJobs())[0].status).toBe('failed');
    release(); await Promise.resolve();
    expect(job.status).toBe('failed');
  } finally { work.mockRestore(); }
});

test("a failed deck model drops its cached wording and keeps deterministic bottleneck guidance", async () => {
  const { f, env, data } = await fixture();
  await f.usage();
  await (f as unknown as { decisionData(): Promise<void> }).decisionData();
  env.META_API_KEY = 'test-only';
  const methods = f as unknown as { askGameMaster(deck: unknown[], stages: unknown[]): void; gmAsking: string | null; gm: unknown; refreshDecisions(): Promise<void> };
  methods.gm = { key: 'old', call: { order: [], reason: 'old wording' } };
  const provider = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429 }));
  try {
    methods.askGameMaster([{ id: 'bottleneck:build', title: 'Work waiting', why: 'A queued issue', options: [{ id: 'later', label: 'Later', actions: [], recommended: true }] }], []);
    for (let n = 0; methods.gmAsking && n < 100; n++) await new Promise(resolve => setTimeout(resolve, 1));
    expect(methods.gmAsking).toBeNull();
    expect(methods.gm).toBeNull();
    await methods.refreshDecisions(); // the next scheduled tick applies the fallback
    const state = data.get('state') as FactoryState;
    expect(state.bottleneck).toBeTruthy();
    expect(state.deck?.some(m => m.id.startsWith('bottleneck:'))).toBe(true);
    expect(state.deck?.filter(m => m.id === 'planner-rest')).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
  } finally { provider.mockRestore(); }
});

test("the shared resting ledger never appears as a phantom issue in quota telemetry", async () => {
  const { f, data } = await fixture();
  data.set('planningRetry:planner', planningFailure(undefined, '503'));
  expect(await f.planningRetries()).toEqual([]);
});

test("a parked retry respects a subsequent player deferral", async () => {
  const { f, data } = await fixture();
  await f.usage();
  const state = data.get('state') as FactoryState;
  const job: RunnerJob = { id: 'parked', itemId: 'gh-1', repo: 'owner/repo', harness: 'codex', allowedPaths: ['src/cart.ts'], status: 'failed', branch: 'shiptorio/runner-parked' };
  data.set('planningResume:parked', job);
  data.set('runnerDeferred:gh-1', state.items[0].updatedAt);
  const methods = f as unknown as { planRunnerJobs(): Promise<void>; performRunnerPlan(job: RunnerJob): Promise<void> };
  const attempt = spyOn(methods, 'performRunnerPlan');
  try { await methods.planRunnerJobs(); expect(attempt).not.toHaveBeenCalled(); } finally { attempt.mockRestore(); }
  expect(data.has('planningResume:parked')).toBe(false);
});

test("an interrupted planner parks for automatic recovery after a cold start", async () => {
  const { f, data, reload } = await fixture();
  const job = await f.enqueueRunner({ itemId: 'gh-1', harness: 'codex', allowedPaths: ['src/cart.ts'] });
  data.set(`runnerJob:${job.id}`, { ...job, planningStarted: true });
  const restored = reload();
  await restored.usage();
  await (restored as unknown as { planRunnerJobs(): Promise<void> }).planRunnerJobs();
  expect((await restored.runnerJobs())[0].status).toBe('failed');
  expect(data.has(`planningResume:${job.id}`)).toBe(true);
  expect((data.get('planningRetry:gh-1') as PlanningRetry).kind).toBe('timeout');
});

test("raising call, token or spend caps wakes parked planning without refunding an ambiguous call", async () => {
  const { sparkChat } = await import('../src/spark');
  const { factorySpend } = await import('../src/spend');
  const { budgetUsage } = await import('../src/budget');
  for (const cap of ['calls', 'tokens', 'spend'] as const) {
    const { f, env, data } = await fixture();
    if (cap === 'calls') await env.DB.prepare('UPDATE signup_allowlist SET spark_calls_daily=1').run();
    if (cap === 'tokens') await env.DB.prepare('UPDATE signup_allowlist SET spark_tokens_daily=7000').run();
    if (cap === 'spend') await env.DB.prepare("INSERT INTO spark_factory_budgets VALUES('owner/repo',30000000)").run();
    const account = await budgetAccount(env.DB, 'owner/repo');
    const chatEnv = { ...env, META_API_KEY: 'test-only', budgetRepo: 'owner/repo', budgetAccount: async () => account };
    const job = await f.enqueueRunner({ itemId: 'gh-1', harness: 'codex', allowedPaths: ['src/cart.ts'] });
    const methods = f as unknown as { performRunnerPlan(job: RunnerJob): Promise<void>; planRunnerJob(job: RunnerJob): Promise<void>; planRunnerJobs(): Promise<void>; refreshDecisions(): Promise<void> };
    let offline = true;
    const provider = spyOn(globalThis, 'fetch').mockImplementation((async () => {
      if (offline) throw new TypeError('fetch failed');
      return Response.json({ choices: [{ message: { content: 'approved plan' } }], usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } });
    }) as unknown as typeof fetch);
    const attempt = spyOn(methods, 'performRunnerPlan').mockImplementation(async j => {
      await sparkChat(chatEnv, []);
      data.set(`runnerJob:${j.id}`, { ...j, status: 'awaiting_approval' });
      data.delete(`planningResume:${j.id}`);
    });
    try {
      await methods.planRunnerJob(job);
      const before = await budgetUsage(env, account), spendBefore = await factorySpend(env.DB, 'owner/repo');
      expect(before.calls).toBe(1);
      expect(spendBefore).toMatchObject({ calls: 1, unmeasuredCalls: 1 });
      expect((data.get('planningRetry:planner') as PlanningRetry).kind).toBe('cap');
      await methods.planRunnerJobs(); // remaining room below 100% is not a cap increase
      expect(provider).toHaveBeenCalledTimes(1);
      expect((await f.runnerJobs())[0].status).toBe('failed');
      if (cap === 'calls') await env.DB.prepare('UPDATE signup_allowlist SET spark_calls_daily=2').run();
      if (cap === 'tokens') await env.DB.prepare('UPDATE signup_allowlist SET spark_tokens_daily=14000').run();
      if (cap === 'spend') await env.DB.prepare("UPDATE spark_factory_budgets SET daily_nano_usd=100000000").run();
      offline = false;
      await methods.planRunnerJobs();
      await methods.refreshDecisions();
      expect(provider).toHaveBeenCalledTimes(2);
      const after = await budgetUsage(env, account), spendAfter = await factorySpend(env.DB, 'owner/repo');
      expect(after.calls).toBe(2);
      expect(after.tokens).toBe(before.tokens + 10);
      expect(spendAfter).toMatchObject({ calls: 2, unmeasuredCalls: 1 });
      expect(spendAfter.estimatedUsd).toBeCloseTo(spendBefore.estimatedUsd + 0.0000185, 8);
      expect((await runQuotaStatus(env, 'owner')).used).toBe(0);
      expect((await f.runnerJobs())[0].status).toBe('awaiting_approval');
      expect((data.get('state') as FactoryState).deck?.some(m => m.id === 'planner-rest')).toBe(false);
    } finally { attempt.mockRestore(); provider.mockRestore(); }
  }
});

test("the actual daily cap resets at midnight without erasing the previous day's unknown spend", async () => {
  const { sparkChat } = await import('../src/spark');
  const { factorySpend } = await import('../src/spend');
  const { budgetUsage } = await import('../src/budget');
  const { f, env, data } = await fixture();
  await env.DB.prepare('UPDATE signup_allowlist SET spark_calls_daily=1').run();
  const account = await budgetAccount(env.DB, 'owner/repo');
  const chatEnv = { ...env, META_API_KEY: 'test-only', budgetRepo: 'owner/repo', budgetAccount: async () => account };
  const job = await f.enqueueRunner({ itemId: 'gh-1', harness: 'codex', allowedPaths: ['src/cart.ts'] });
  const methods = f as unknown as { performRunnerPlan(job: RunnerJob): Promise<void>; planRunnerJob(job: RunnerJob): Promise<void>; planRunnerJobs(): Promise<void> };
  const before = Date.now();
  let offline = true;
  const provider = spyOn(globalThis, 'fetch').mockImplementation((async () => {
    if (offline) throw new TypeError('network unavailable');
    return Response.json({ choices: [{ message: { content: 'plan' } }], usage: { total_tokens: 10 } });
  }) as unknown as typeof fetch);
  const attempt = spyOn(methods, 'performRunnerPlan').mockImplementation(async j => { await sparkChat(chatEnv, []); data.set(`runnerJob:${j.id}`, { ...j, status: 'awaiting_approval' }); });
  let clock: ReturnType<typeof spyOn> | undefined;
  try {
    await methods.planRunnerJob(job);
    const oldSpend = await factorySpend(env.DB, 'owner/repo', before);
    const retry = data.get('planningRetry:planner') as PlanningRetry;
    offline = false;
    clock = spyOn(Date, 'now').mockReturnValue(retry.retryAt);
    await methods.planRunnerJobs();
    expect((await budgetUsage(env, account)).calls).toBe(1);
    expect((await f.runnerJobs())[0].status).toBe('awaiting_approval');
    expect(await factorySpend(env.DB, 'owner/repo', before)).toEqual(oldSpend);
    expect(oldSpend.unmeasuredCalls).toBe(1);
    expect(provider).toHaveBeenCalledTimes(2);
  } finally { clock?.mockRestore(); attempt.mockRestore(); provider.mockRestore(); }
});
