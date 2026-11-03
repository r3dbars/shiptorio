// Dedicated fixture deployment only. Provider traffic never falls through to the network.
import { DurableObject } from "cloudflare:workers";
import { fixtureBusyResponse, type ResetBlocker } from "./reset-busy";
import { app } from "../../server/src/index";
import { ISOLATED_TEST_CONTEXT } from "../../server/src/test-delegation";
import { requireUser } from "../../server/src/authorization";
import { pairToken } from "../../server/src/runner-auth";
import { TEST_PERSONAS, personaId, personaRepo, testUsersEnabled, type TestPersona } from "../../server/src/test-users-policy";
import { fixtureProviderEnv, type FixtureEnv } from "./env";
// @ts-ignore Shared provider fixtures are JavaScript and also serve the local Stranger journey.
import { githubStub } from "../stranger/github-stub.mjs";
// @ts-ignore Shared provider fixture; no production implementation is duplicated here.
import { sparkStub } from "../stranger/spark-stub.mjs";

type Receipt = { jobId: string; lease: string; ok: true; sha: string; summary: string; checks: string[]; proof: { baseSha: string; headSha: string; failsOnBase: true; passesOnHead: true; command: string; logTail: string } };
type Runner = { token: string; until: number; completed: boolean; pending?: Receipt; receiptSent?: boolean; error?: string };
type Stored = { persona: TestPersona; github: Record<string, unknown>; spark: { calls: string[]; unexpected: string[] }; runner?: Runner; resetLocked?: boolean; requestLeases?: Record<string, number> };
type Storage = Pick<DurableObjectStorage, "get" | "put" | "setAlarm" | "deleteAlarm">;
type Worker = (request: Request) => Promise<Response>;
const KNOWN = new Set<string>(TEST_PERSONAS);
const RUN_MS = 10 * 60_000;
const originOf = (env: FixtureEnv) => new URL(env.PUBLIC_URL!).origin;
const enabled = (env: FixtureEnv) => {
  try { return env.FIXTURE_INSTANCE === "shiptorio-fixture" && !!env.PUBLIC_URL && testUsersEnabled(env, new URL(env.PUBLIC_URL)); }
  catch { return false; }
};
const json = (value: unknown, status = 200) => Response.json(value, { status });

/** Same runtime used by the DO and its focused storage/transport tests. */
export class FixtureRuntime {
  private record?: Stored;
  private github: any;
  private spark: any;
  private ready: Promise<void>;
  private ticking = false;
  private activeRequests = 0;
  private resetting = false;
  private pairing?: Promise<void>;
  constructor(private storage: Storage, private env: FixtureEnv, private worker: Worker) {
    this.ready = storage.get<Stored>("fixture").then(saved => {
      if (!saved) return;
      if (!KNOWN.has(saved.persona)) throw new Error("Invalid saved fixture persona");
      this.record = saved;
      this.openStubs(saved.persona, saved);
    });
  }
  private openStubs(persona: TestPersona, saved?: Stored) {
    const id = personaId(persona), repo = personaRepo(persona);
    this.github = githubStub({ origin: originOf(this.env), webhookSecret: this.env.GITHUB_WEBHOOK_SECRET,
      user: { id, login: persona, name: persona, avatar_url: null }, repo, repoId: 990000 + Math.abs(id), installationId: 9000 + Math.abs(id),
      worker: async (url: string, init: RequestInit) => {
        // Installation mutates stub state before delivering a webhook. Persist it first,
        // because the real Worker may re-enter this provider to read the installation.
        await this.persist();
        return this.worker(new Request(url, init));
      },
    });
    this.spark = sparkStub();
    if (saved) {
      if (saved.github.repo !== repo || (saved.github.user as {id?:number})?.id !== id) throw new Error("Saved fixture identity mismatch");
      Object.assign(this.github.state, saved.github);
      this.spark.calls.push(...saved.spark.calls);
      this.spark.unexpected.push(...saved.spark.unexpected);
    } else {
      if (!["test-newbie", "test-guest"].includes(persona)) this.github.state.installation = 9000 + Math.abs(id);
      this.record = { persona, github: this.github.state, spark: { calls: [], unexpected: [] } };
    }
  }
  private async persist() {
    if (!this.record || !this.github) return;
    // Diagnostics are bounded; source state and the one pending receipt remain durable.
    this.github.state.calls = this.github.state.calls.slice(-200);
    this.github.state.unexpected = this.github.state.unexpected.slice(-50);
    this.record.github = structuredClone(this.github.state);
    this.record.spark = { calls: this.spark.calls.slice(-200), unexpected: this.spark.unexpected.slice(-50) };
    await this.storage.put("fixture", structuredClone(this.record));
  }
  async fetch(request: Request): Promise<Response> {
    if (!enabled(this.env)) return json({ error: "Fixture deployment required" }, 404);
    await this.ready;
    const persona = request.headers.get("x-test-persona");
    if (!persona || !KNOWN.has(persona) || this.record && this.record.persona !== persona) return json({ error: "Invalid fixture persona" }, 403);
    if (!this.record) { this.openStubs(persona as TestPersona); await this.persist(); }
    const url = new URL(request.url);
    if (url.origin === "http://fixture.internal" && url.pathname === "/enter" && request.method === "POST") {
      if (this.record!.resetLocked || this.resetting) return json({ error: "Fixture reset in progress" }, 409);
      this.pruneRequestLeases();
      const leaseId = crypto.randomUUID();
      (this.record!.requestLeases ??= {})[leaseId] = Date.now() + 5 * 60_000;
      await this.persist();
      return json({ leaseId });
    }
    if (url.origin === "http://fixture.internal" && url.pathname === "/exit" && request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 1024) return json({ error: "Invalid request lease" }, 400);
      let leaseId: unknown;
      try { leaseId = JSON.parse(raw).leaseId; } catch { return json({ error: "Invalid request lease" }, 400); }
      if (typeof leaseId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(leaseId)) return json({ error: "Invalid request lease" }, 400);
      if (this.record!.requestLeases) delete this.record!.requestLeases[leaseId];
      await this.persist();
      return json({ released: true });
    }
    if (url.origin === "http://fixture.internal" && url.pathname === "/status" && request.method === "GET") return json({ resetLocked: !!this.record!.resetLocked || this.resetting });
    if (url.origin === "http://fixture.internal" && url.pathname === "/reset") {
      if (request.method !== "POST") return json({ error: "Reset requires POST" }, 405);
      return this.reset();
    }
    if (url.origin === "http://fixture.internal" && url.pathname === "/resume") {
      if (request.method !== "POST") return json({ error: "Resume requires POST" }, 405);
      if (this.resetting) return json({ error: "Fixture reset in progress" }, 409);
      delete this.record!.resetLocked;
      await this.persist();
      return json({ resumed: true });
    }
    if (this.record!.resetLocked) return json({ error: "Fixture reset awaiting cleanup" }, 409);
    if (this.resetting) return json({ error: "Fixture reset in progress" }, 409);
    this.activeRequests++;
    try {
    if (url.origin === "http://fixture.internal") {
      if (url.pathname === "/install") return await this.install(request);
      if (url.pathname === "/start" && request.method === "POST") return await this.start(request);
      return json({ error: "Unknown fixture command" }, 404);
    }
    let response: Response;
    if (url.origin === "https://api.github.com") response = await this.github.outbound(request);
    else if (url.origin === "https://api.meta.ai" && url.pathname === "/v1/chat/completions" && request.method === "POST") response = await this.spark.outbound(request);
    else return json({ error: "Outbound destination blocked by fixture" }, 599);
    await this.persist();
    return response;
    } finally { this.activeRequests--; }
  }
  private pruneRequestLeases() {
    for (const [id, expires] of Object.entries(this.record!.requestLeases ?? {})) {
      if (expires <= Date.now()) delete this.record!.requestLeases![id];
    }
  }
  private async reset() {
    this.pruneRequestLeases();
    if (this.record!.resetLocked && !this.resetting) return json({ reset: true });
    const runner = this.currentRunner();
    if (this.resetting || this.activeRequests || Object.keys(this.record!.requestLeases ?? {}).length || this.ticking || this.pairing || runner?.pending && runner.until > Date.now()) {
      const leases = Object.values(this.record!.requestLeases ?? {});
      const blockers: ResetBlocker[] = [];
      if (this.resetting) blockers.push("resetting");
      if (this.activeRequests) blockers.push("provider_requests");
      if (leases.length) blockers.push("request_leases");
      if (this.ticking) blockers.push("runner_tick");
      if (this.pairing) blockers.push("runner_pairing");
      if (runner?.pending && runner.until > Date.now()) blockers.push("runner_receipt");
      // Latest bounded lease expiry, not a promise that transient work is finished.
      const until = leases.reduce((latest, expiry) => Math.max(latest, expiry), Math.max(Date.now(), runner?.pending ? runner.until : 0));
      return fixtureBusyResponse(blockers, this.activeRequests, leases.length, until - Date.now());
    }
    this.resetting = true;
    try {
      await this.storage.deleteAlarm();
      this.openStubs(this.record!.persona);
      this.record!.resetLocked = true;
      await this.persist();
      return json({ reset: true });
    } finally { this.resetting = false; }
  }
  private async install(request: Request) {
    const confirm = new URL(request.url).searchParams.get("confirm") === "1";
    if (confirm ? request.method !== "POST" : request.method !== "GET") return json({ error: "Invalid install method" }, 405);
    let response: Response | undefined;
    await this.github.browser({
      request: () => ({ url: () => `https://github.com/apps/shiptorio-stub/installations/${confirm ? "confirm" : "new"}` }),
      fulfill: async (options: { status?: number; headers?: Record<string,string>; contentType?: string; body?: string }) => {
        const headers = new Headers(options.headers);
        if (options.contentType) headers.set("Content-Type", options.contentType);
        if (headers.has("location")) headers.set("Location", `${originOf(this.env)}/?source=live&onboard=repo`);
        headers.set("Cache-Control", "no-store");
        response = new Response(options.body?.replaceAll("/apps/shiptorio-stub/installations/confirm", "/test/install?confirm=1") ?? null, { status: options.status ?? 200, headers });
      },
    });
    await this.persist();
    return response ?? json({ error: "Fixture install did not respond" }, 500);
  }
  private currentRunner(): Runner | undefined { return this.record?.runner; }
  private async start(request: Request) {
    const persona = this.record!.persona;
    if (["test-guest", "test-broke"].includes(persona)) return json({ started: false });
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: "Start request too large" }, 413);
    let cookie: unknown;
    try { cookie = JSON.parse(raw).cookie; } catch { return json({ error: "Invalid start request" }, 400); }
    if (typeof cookie !== "string") return json({ error: "Test session required" }, 403);
    const user = await requireUser(new Request(originOf(this.env), { headers: { cookie } }), this.env);
    if (!user || user.id !== personaId(persona) || user.login !== persona) return json({ error: "Test session mismatch" }, 403);
    if (this.currentRunner()) return json({ started: true, completed: this.currentRunner()!.completed });
    const repo = personaRepo(persona);
    const row = await this.env.DB.prepare("SELECT repo_id, installation_id FROM repos WHERE full_name = ?").bind(repo).first<{repo_id:number;installation_id:number}>();
    if (row?.repo_id !== 990000 + Math.abs(user.id) || row.installation_id !== 9000 + Math.abs(user.id) || !this.github.state.installation) return json({ error: "Install the fixture first" }, 409);
    if (this.currentRunner()) return json({ started: true, completed: this.currentRunner()!.completed });
    if (this.pairing) { await this.pairing; return json({ started: true, completed: this.currentRunner()?.completed ?? false }); }
    this.pairing = this.pair(repo, row, user);
    try { await this.pairing; } finally { this.pairing = undefined; }
    return json({ started: true });
  }
  private async pair(repo: string, row: {repo_id:number;installation_id:number}, user: import("../../server/src/authorization").AccessUser) {
    const f = this.env.FACTORY.get(this.env.FACTORY.idFromName(`repo:${row.repo_id}`)) as unknown as { observedCall(method:string,args:unknown[],trace:{requestId:string;repo:string;userId:string}):Promise<unknown> };
    const trace = { requestId: crypto.randomUUID(), repo, userId: `github:user:${user.id}` };
    await f.observedCall("ensure", [repo, row.installation_id], trace);
    const pairId = await f.observedCall("pairRunner", [], trace) as string;
    const until = Math.min(Date.now() + RUN_MS, user.expiresAt);
    const token = await pairToken(this.env.SESSION_SECRET, { repo, user, pairId, expires: until });
    this.record!.runner = { token, until, completed: false };
    await this.persist();
    await this.storage.setAlarm(Date.now() + 1);
  }
  private async runnerApi(action: string, body: unknown) {
    const response = await this.worker(new Request(`${originOf(this.env)}/api/runner/${personaRepo(this.record!.persona)}/${action}`, {
      method: "POST", headers: { authorization: `Bearer ${this.record!.runner!.token}`, "content-type": "application/json", origin: originOf(this.env) }, body: JSON.stringify(body),
    }));
    if (!response.ok) throw new Error(`Fixture runner ${action}: ${response.status}`);
    return response.json() as Promise<any>;
  }
  async alarm() {
    if (!enabled(this.env)) return;
    await this.ready;
    const runner = this.record?.runner;
    if (!runner || this.ticking || this.resetting || this.record?.resetLocked) return;
    if (Date.now() >= runner.until) { await this.storage.deleteAlarm(); return; }
    this.ticking = true;
    try {
      await this.runnerApi("heartbeat", { harnesses: ["codex"] });
      if (!runner.completed) {
        if (!runner.pending) {
          const { job } = await this.runnerApi("claim", { harnesses: ["codex"] });
          if (job) {
            if (job.repo !== personaRepo(this.record!.persona) || !/^[a-f0-9-]{36}$/.test(job.id) || job.branch !== `shiptorio/runner-${job.id}` || !/^[a-f0-9]{40}$/.test(job.baseSha) || typeof job.lease !== "string" || !Array.isArray(job.allowedPaths) || !job.allowedPaths.length || job.allowedPaths.some((p:string) => !["src/cart.ts", "test/cart.test.ts"].includes(p))) throw new Error("Unexpected fixture job scope");
            this.github.state.branches[job.branch] = this.github.state.headSha;
            runner.pending = { jobId:job.id, lease:job.lease, ok:true, sha:this.github.state.headSha, summary:"Fixture: SAVE10 regression fix", checks:["typecheck","test","build"], proof:{baseSha:job.baseSha,headSha:this.github.state.headSha,failsOnBase:true,passesOnHead:true,command:"bun test test/cart.test.ts",logTail:"FIXTURE ONLY: base fails, head passes"} };
            await this.persist();
          }
        }
        if (runner.pending) {
          if (!runner.receiptSent) { await this.runnerApi("finish", runner.pending); runner.receiptSent = true; await this.persist(); }
          await this.github.completeChecks("success");
          runner.completed = true; delete runner.pending; delete runner.error;
        }
      }
    } catch {
      // Never store response bodies, headers, session cookies or credentials in diagnostics.
      runner.error = "Fixture runner could not advance; it will retry before the ten-minute deadline.";
    } finally {
      try {
        await this.persist();
        if (Date.now() < runner.until) await this.storage.setAlarm(Date.now()+5000); else await this.storage.deleteAlarm();
      } finally { this.ticking = false; }
    }
  }
}

export class FixtureProvider extends DurableObject<FixtureEnv> {
  private runtime: FixtureRuntime;
  constructor(ctx: DurableObjectState, env: FixtureEnv) {
    const isolated = fixtureProviderEnv(env);
    super(ctx, isolated);
    const context = { waitUntil: (p:Promise<unknown>) => ctx.waitUntil(p), passThroughOnException() {} } as ExecutionContext;
    this.runtime = new FixtureRuntime(ctx.storage, isolated, async request => app.fetch(request, { ...isolated, [ISOLATED_TEST_CONTEXT]: true }, context));
  }
  fetch(request: Request) { return this.runtime.fetch(request); }
  alarm() { return this.runtime.alarm(); }
}
