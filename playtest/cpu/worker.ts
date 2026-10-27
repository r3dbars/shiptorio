// Opt-in PRIVATE measurement entry. No deployment/configuration changes are made by this file.
import { WorkerEntrypoint } from "cloudflare:workers";
import practice, { Factory as PracticeFactory, FixtureProvider as PracticeProvider } from "../staging/worker";
import type { FixtureEnv } from "../staging/env";
import { app } from "../../server/src/index";
import { ISOLATED_TEST_CONTEXT } from "../../server/src/test-delegation";
import { requireUser } from "../../server/src/authorization";
import { makeSessionCookie } from "../../server/src/session";
import { pairToken } from "../../server/src/runner-auth";
import { CPU_PATH, CPU_PERSONA, CPU_REPO, CPU_REPO_ID, CPU_INSTALLATION, fixtureIssue, sampleInput, validRun, type CpuSample } from "./manifest";

interface Grant { runId: string; until: number; cookie: string; token: string; next: Record<CpuSample["operation"], number> }
interface TickMode { runId: string; until: number; requested?: number; completed?: number; tick?: number }
const target = (env: FixtureEnv) => env.FACTORY.get(env.FACTORY.idFromName(`repo:${CPU_REPO_ID}`)) as unknown as Factory;
const enabled = (env: FixtureEnv) => env.FIXTURE_INSTANCE === "shiptorio-fixture" && env.TEST_USERS === "on" && env.PUBLIC_URL === "https://shiptorio.dev";
const deny = (status = 403) => Response.json({ ok: false, code: "cpu_probe_denied" }, { status });

export class Factory extends PracticeFactory {
  async cpuBegin(runId: string, until: number) {
    if (!enabled(this.env as FixtureEnv) || !validRun(runId) || until <= Date.now() || until > Date.now() + 35 * 60000) throw new Error("CPU fixture scope denied");
    const meta = await this.ctx.storage.get<{repo:string;installationId:number}>("meta");
    if (meta?.repo !== CPU_REPO || meta.installationId !== CPU_INSTALLATION) throw new Error("CPU fixture is not installed");
    const existing = await this.ctx.storage.get<TickMode>("cpuMode");
    if (existing && existing.until > Date.now()) throw new Error("CPU fixture already leased");
    const snapshot = await this.debugSnapshot();
    if ((await this.runnerJobs()).some(job => !["done", "failed"].includes(job.status))) throw new Error("CPU fixture has runner work");
    if (snapshot?.items.some(item => item.state === "working" || item.state === "on_pad")) throw new Error("CPU fixture must be idle");
    await this.ctx.storage.put("cpuMode", { runId, until } satisfies TickMode);
    await this.ctx.storage.deleteAlarm();
    // Normal pairing and normal signed capability, never a bypass of runner authentication.
    return this.observedCall("pairRunner", [], { requestId: crypto.randomUUID(), repo: CPU_REPO, userId: "github:user:-9001" }) as Promise<string>;
  }
  async cpuSchedule(input: CpuSample) {
    const mode = await this.ctx.storage.get<TickMode>("cpuMode");
    if (!mode || mode.runId !== input.runId || mode.until <= Date.now() || input.operation !== "tick" || mode.requested !== undefined && mode.requested !== mode.completed) throw new Error("CPU tick denied");
    await this.ctx.storage.put("cpuMode", { ...mode, requested: input.sample });
    await this.ctx.storage.setAlarm(Date.now() + 10);
  }
  async cpuStatus(runId: string) {
    const mode = await this.ctx.storage.get<TickMode>("cpuMode");
    if (!mode || mode.runId !== runId || mode.until <= Date.now()) throw new Error("CPU fixture expired");
    return { completed: mode.completed ?? -1, tick: mode.tick ?? -1 };
  }
  async cpuEnd(runId: string) {
    const mode = await this.ctx.storage.get<TickMode>("cpuMode");
    if (mode?.runId !== runId) throw new Error("CPU fixture mismatch");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete("cpuMode");
    await this.revokeRunner();
  }
  async alarm() {
    const mode = await this.ctx.storage.get<TickMode>("cpuMode");
    if (!mode) return super.alarm();
    // In this entry only, hold automatic alarms between explicitly requested real ticks.
    if (mode.until <= Date.now() || mode.requested === undefined || mode.requested === mode.completed) { await this.ctx.storage.deleteAlarm(); return; }
    await super.alarm();
    const snapshot = await this.debugSnapshot();
    await this.ctx.storage.put("cpuMode", { ...mode, completed: mode.requested, tick: snapshot?.tick } satisfies TickMode);
    await this.ctx.storage.deleteAlarm();
  }
}

export class FixtureProvider extends PracticeProvider {
  async cpuPrepare(runId: string, until: number) {
    if (!enabled(this.env) || !validRun(runId) || until <= Date.now() || until > Date.now() + 35 * 60000) throw new Error("CPU fixture scope denied");
    const old = await this.ctx.storage.get<Grant>("cpuGrant");
    if (old && old.until > Date.now()) throw new Error("CPU fixture already leased");
    const cookie = await this.env.CACHE.get(`fixture-session:${CPU_PERSONA}`);
    const user = cookie && await requireUser(new Request("https://shiptorio.dev", { headers: { cookie } }), this.env);
    const row = await this.env.DB.prepare("SELECT repo_id,installation_id FROM repos WHERE full_name=?").bind(CPU_REPO).first<{repo_id:number;installation_id:number}>();
    if (!cookie || !user || user.id !== -9001 || user.login !== CPU_PERSONA || row?.repo_id !== CPU_REPO_ID || row.installation_id !== CPU_INSTALLATION || until > user.expiresAt) throw new Error("CPU fixture installation/session required");
    // Stop only the reserved persona's fixture poller. No local runner/service is touched.
    await this.ctx.storage.deleteAlarm();
    const pairId = await target(this.env).cpuBegin(runId, until);
    const token = await pairToken(this.env.SESSION_SECRET, { repo: CPU_REPO, user, pairId, expires: until });
    const preview = (await makeSessionCookie(`${this.env.SESSION_SECRET}:${this.env.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    await this.ctx.storage.put("cpuGrant", { runId, until, token, cookie: `${cookie}; ${preview}`, next: { webhook: 0, heartbeat: 0, claim: 0, tick: 0 } } satisfies Grant);
  }
  async cpuRequest(input: CpuSample) {
    // Sensitive request parts stay within Worker/DO RPC memory, never the client response/logs.
    return this.ctx.blockConcurrencyWhile(async () => {
      const grant = await this.ctx.storage.get<Grant>("cpuGrant");
      if (!enabled(this.env) || !grant || grant.runId !== input.runId || grant.until <= Date.now() || input.sample !== grant.next[input.operation]) throw new Error("CPU sample denied");
      grant.next[input.operation]++;
      await this.ctx.storage.put("cpuGrant", grant);
      if (input.operation === "tick") return null;
      const headers: Record<string,string> = { "content-type": "application/json", origin: "https://shiptorio.dev", cookie: grant.cookie };
      if (input.operation === "webhook") {
        const body = JSON.stringify(fixtureIssue()), encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(this.env.GITHUB_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
        headers["x-hub-signature-256"] = "sha256=" + [...mac].map(x => x.toString(16).padStart(2,"0")).join("");
        headers["x-github-event"] = "issues";
        headers["x-github-delivery"] = `cpu-${input.runId}-${input.sample}`;
        return { path: "/webhooks/github", headers, body };
      }
      headers.authorization = `Bearer ${grant.token}`;
      return { path: `/api/runner/${CPU_REPO}/${input.operation}`, headers, body: '{"harnesses":["codex"]}' };
    });
  }
  async cpuEnd(runId: string) {
    const grant = await this.ctx.storage.get<Grant>("cpuGrant");
    if (grant?.runId !== runId) throw new Error("CPU fixture mismatch");
    await target(this.env).cpuEnd(runId);
    await this.ctx.storage.delete("cpuGrant");
    await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    if (await this.ctx.storage.get("cpuGrant")) { await this.ctx.storage.deleteAlarm(); return; }
    return super.alarm();
  }
}

// Only a private service binding can call probe(). It accepts no headers/cookies/signatures.
// Root must review any caller/gateway separately; no public measurement route is installed.
export default class CpuProbe extends WorkerEntrypoint<FixtureEnv> {
  fetch(request: Request) {
    if (new URL(request.url).pathname === CPU_PATH) return Promise.resolve(deny());
    return practice.fetch(request, this.env, this.ctx);
  }
  async probe(raw: Record<string,unknown>): Promise<Record<string,unknown>> {
    const env = this.env;
    if (!enabled(env) || !raw || typeof raw !== "object" || Object.keys(raw).some(key => !["action", "runId", "until", "operation", "sample"].includes(key)) || !validRun(raw.runId)) return { ok: false, code: "cpu_probe_denied" };
    const provider = env.FIXTURE_PROVIDERS.get(env.FIXTURE_PROVIDERS.idFromName(CPU_PERSONA)) as unknown as FixtureProvider;
    try {
      if (raw.action === "prepare") {
        if (!Number.isSafeInteger(raw.until)) return { ok: false, code: "cpu_probe_denied" };
        await provider.cpuPrepare(raw.runId, Number(raw.until));
        return { ok: true, action: "prepare" };
      }
      if (raw.action === "end") { await provider.cpuEnd(raw.runId); return { ok: true, action: "end" }; }
      if (raw.action === "status") return target(env).cpuStatus(raw.runId);
      const input = sampleInput(raw);
      if (raw.action !== "sample" || !input) return { ok: false, code: "cpu_probe_denied" };
      const parts = await provider.cpuRequest(input);
      if (!parts) { await target(env).cpuSchedule(input); return { ok: true, operation: "tick", sample: input.sample, scheduled: true }; }
      // Whole RPC invocation includes this fixed adapter + real app route. Provider
      // signing/setup are separate DO/control work. This is not pure route CPU.
      const response = await app.fetch(new Request(`https://shiptorio.dev${parts.path}`, { method: "POST", headers: parts.headers, body: parts.body }), { ...env, [ISOLATED_TEST_CONTEXT]: true }, this.ctx);
      const result = await response.json() as { ok?: boolean; job?: unknown; duplicate?: boolean };
      const ok = response.ok && (input.operation === "claim" ? result.job === null : result.ok === true && !result.duplicate);
      return { ok, operation: input.operation, sample: input.sample, status: response.status };
    } catch { return { ok: false, code: "cpu_probe_failed" }; }
  }
}
