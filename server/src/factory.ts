// One Factory per repo. It owns the factory state, runs the tick loop on an alarm,
// talks to browsers over websockets, and drives Spark jobs that open real PRs.

import { DurableObject } from "cloudflare:workers";
import {
  SCIENCE_FOR,
  WebToServer,
  type Belt,
  type FactoryState,
  type Item,
  type Machine,
  type Patch,
  type ServerToWeb,
} from "@shiptorio/shared";
import { commitToBranch, fileContent, gh, installationToken, inspectPullRequest, issueReporters, openIssues, openPullRequest, repoTree, type AppCredentials } from "./github";
import { hasMachine, pickAssembler, SAFE_PATH, starterLine, upsert } from "./engine";
import { layoutMap } from "./map";
import { pickFiles, planLocalTask, sparkConfigured, triage, writeFix, type SparkEnv } from "./spark";
import { runnerPathAllowed, validLease, type RunnerJob, type RunnerReceipt } from "./runner-job";
import { foldSignal } from "./ore";
import { githubStatus, normalizeGitHub, type GitHubPayload } from "./sources/github";
import type { Signal } from "./sources";

export interface FactoryEnv extends AppCredentials, SparkEnv {
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  HOSTED_SPARK_ASSEMBLER?: string;
  DB: D1Database;
  FACTORY: DurableObjectNamespace<Factory>;
}

const TICK_MS = 2000;
const MAX_ATTEMPTS = 3;

interface Meta {
  repo: string;
  installationId: number;
}

export class Factory extends DurableObject<FactoryEnv> {
  private state: FactoryState | null = null;
  private meta: Meta | null = null;
  private running = new Set<string>(); // item ids with a job in flight

  private async clearRunnerMove(): Promise<void> {
    if (this.state?.move?.stage !== "resources") return;
    const moveId = this.state.move.id;
    this.state.move = null;
    await this.save();
    this.broadcast({ type: "move_resolved", moveId, actor: "player" });
  }

  async pairRunner(): Promise<string> {
    const pairId = crypto.randomUUID();
    await this.ctx.storage.put("runnerPair", pairId); // Re-pairing revokes the previous token.
    return pairId;
  }

  async runnerJobs(): Promise<RunnerJob[]> {
    const jobs = await this.ctx.storage.list<RunnerJob>({ prefix: "runnerJob:" });
    return [...jobs.values()].map(({ lease, ...job }) => job);
  }

  async enqueueRunner(input: { itemId: string; harness: RunnerJob["harness"]; allowedPaths: string[] }): Promise<RunnerJob> {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!(await this.load()) || !this.meta) throw new Error("Factory not connected");
      const item = this.state!.items.find(i => i.id === input.itemId);
      if (!item || !["ore", "queued", "rejected"].includes(item.state) || item.prNumber) throw new Error("Item is not available to build");
      if (!input.allowedPaths.every(runnerPathAllowed)) throw new Error("Unsafe approved path");
      const jobs = await this.runnerJobs();
      for (const old of jobs.filter(j => j.status === "running" && j.deadline && j.deadline <= Date.now())) {
        const stored = await this.ctx.storage.get<RunnerJob>(`runnerJob:${old.id}`);
        if (stored) await this.ctx.storage.put(`runnerJob:${old.id}`, { ...stored, status: "failed", error: "Lease expired; another attempt requires player approval." });
        old.status = "failed";
      }
      if (jobs.some(j => ["planning", "ready", "running"].includes(j.status))) throw new Error("Finish the active runner job first");
      const id = crypto.randomUUID();
      const job: RunnerJob = { ...input, repo: this.meta.repo, id, branch: `shiptorio/runner-${id}`, status: "planning" };
      await this.ctx.storage.put(`runnerJob:${id}`, job);
      this.broadcast({ type: "log", level: "info", text: `Spark is planning ${item.title} for ${job.harness}.`, at: Date.now(), actor: "spark", tool: "assign_job", approvedBy: "player", reason: "Player approved this issue and exact file scope.", itemId: item.id });
      await this.scheduleTick();
      return job;
    });
  }

  private async planRunnerJobs(): Promise<void> {
    const jobs = await this.ctx.storage.list<RunnerJob>({ prefix: "runnerJob:" });
    const job = [...jobs.values()].find(j => j.status === "planning");
    if (!job || !this.meta || !this.state) return;
    try {
      if (job.planningStarted) throw new Error("Interrupted planning requires a new player-approved attempt");
      job.planningStarted = true;
      await this.ctx.storage.put(`runnerJob:${job.id}`, job);
      const item = this.state.items.find(i => i.id === job.itemId);
      if (!item) throw new Error("Item removed");
      const token = await installationToken(this.env, this.meta.installationId);
      const tree = await repoTree(token, this.meta.repo);
      job.baseSha = (await gh<{ object: { sha: string } }>(`/repos/${job.repo}/git/ref/heads/${tree.branch}`, token)).object.sha;
      job.steps = [];
      job.plan = await planLocalTask(this.env, { title: item.title, body: item.body ?? "", district: item.district, failure: item.failure }, job.allowedPaths,
        path => fileContent(token, job.repo, path, job.baseSha!), async step => {
          job.steps!.push(step);
          await this.ctx.storage.put(`runnerJob:${job.id}`, job);
          this.broadcast({ type: "log", level: "info", text: step.result, at: step.at, actor: "spark", tool: step.tool, reason: step.reason, approvedBy: "player", itemId: item.id });
        });
      job.baseBranch = tree.branch;
      job.status = "ready";
      await this.ctx.storage.put(`runnerJob:${job.id}`, job);
      this.log("success", `Spark's plan is ready for ${job.harness}. Waiting for the local runner.`, item.id);
    } catch {
      job.status = "failed"; job.error = "Spark planning failed; inspect configuration and approve a new attempt.";
      await this.ctx.storage.put(`runnerJob:${job.id}`, job);
      this.log("error", job.error, job.itemId);
    }
  }

  async claimRunner(pairId: string, harnesses: RunnerJob["harness"][]) {
    const job = await this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get("runnerPair") !== pairId) throw new Error("Runner pairing revoked");
      await this.load();
      const jobs = await this.ctx.storage.list<RunnerJob>({ prefix: "runnerJob:" });
      const job = [...jobs.values()].find(j => j.status === "ready" && harnesses.includes(j.harness));
      if (!job) return null;
      Object.assign(job, { status: "running", pairId, lease: crypto.randomUUID(), deadline: Date.now() + 30 * 60 * 1000 });
      await this.ctx.storage.put(`runnerJob:${job.id}`, job);
      const item = this.state!.items.find(i => i.id === job.itemId)!;
      const machineId = `runner-${job.harness}`;
      await this.clearRunnerMove();
      await this.patch({ items: [{ ...item, state: "working", machineId, attempts: item.attempts + 1, updatedAt: Date.now() }], machines: [{ id: machineId, type: "assembler", x: 0, y: 6, harness: job.harness, powerId: `power-${job.harness}`, tier: 1, state: "working" }], power: [...this.state!.power.filter(p => p.id !== `power-${job.harness}`), { id: `power-${job.harness}`, kind: "solar", name: job.harness === "codex" ? "Codex subscription" : "Claude subscription", level: 1, online: true }], bottleneck: null });
      this.log("info", `Local ${job.harness} accepted Spark's plan.`, item.id);
      return job;
    });
    if (!job) return null;
    if (!this.meta) throw new Error("Missing repo");
    // Installation tokens go only to the runner supervisor, never to an agent child.
    return { ...job, token: await installationToken(this.env, this.meta.installationId) };
  }

  async finishRunner(pairId: string, receipt: RunnerReceipt) {
    if (await this.ctx.storage.get("runnerPair") !== pairId) throw new Error("Runner pairing revoked");
    await this.load();
    const job = await this.ctx.storage.get<RunnerJob>(`runnerJob:${receipt.jobId}`);
    if (!job || !this.meta || !this.state) throw new Error("Unknown job");
    if (job.status === "completed" && job.pairId === pairId && job.lease === receipt.lease) {
      await this.clearRunnerMove();
      const completedItem = this.state.items.find(i => i.id === job.itemId);
      const prNumber = completedItem?.prNumber ?? Number(job.prUrl?.split("/").at(-1));
      if (prNumber) {
        const pr = await gh<{ merged: boolean }>(`/repos/${job.repo}/pulls/${prNumber}`, await installationToken(this.env, this.meta.installationId));
        if (pr.merged) await this.onPullClosed(prNumber, true);
        else if (receipt.sha) await this.onCheckSuite([prNumber], true, "Reconcile completion receipt", receipt.sha);
      }
      return { prUrl: job.prUrl }; // lost acknowledgment
    }
    if (!validLease(job, pairId, receipt.lease)) throw new Error("Invalid or expired lease");
    const item = this.state.items.find(i => i.id === job.itemId)!;
    if (!receipt.ok) {
      job.status = "failed"; job.error = "Local build failed; player must approve another attempt.";
      await this.ctx.storage.put(`runnerJob:${job.id}`, job);
      await this.patch({ items: [{ ...item, state: "rejected", failure: job.error, updatedAt: Date.now() }], machines: this.state.machines.filter(m => m.id === item.machineId).map(m => ({ ...m, state: "blocked" as const })) });
      return { status: "failed" };
    }
    if (!receipt.sha || !["typecheck", "test", "build"].every(c => receipt.checks.includes(c as RunnerReceipt["checks"][number]))) throw new Error("Missing local check receipts");
    const token = await installationToken(this.env, this.meta.installationId);
    const head = await gh<{ object: { sha: string } }>(`/repos/${job.repo}/git/ref/heads/${job.branch}`, token);
    if (head.object.sha !== receipt.sha) throw new Error("Pushed head mismatch");
    const diff = await gh<{ status: string; ahead_by: number; files: { filename: string; status: string; previous_filename?: string; changes: number }[] }>(`/repos/${job.repo}/compare/${job.baseSha}...${receipt.sha}`, token);
    if (diff.status !== "ahead" || diff.ahead_by !== 1 || !diff.files.length || diff.files.length > 10 || diff.files.some(f => !job.allowedPaths.includes(f.filename) || !runnerPathAllowed(f.filename) || f.status === "renamed" || f.status === "removed") || diff.files.reduce((n, f) => n + f.changes, 0) > 500) throw new Error("Pushed diff exceeds the approved scope");
    const pr = await openPullRequest(token, job.repo, { head: job.branch, base: job.baseBranch!, title: item.title, body: `Closes #${item.id.slice(3)}\n\nMuse Spark planned this task; the local ${job.harness} subscription executed it.\n\n${job.plan}\n\nLocal supervisor receipts: typecheck, tests and web build passed on ${receipt.sha}.\n\n${receipt.summary}\n\nHuman review and merge required. Independent verification/review stations remain pending.` });
    job.status = "completed"; job.prUrl = pr.html_url;
    await this.ctx.storage.put(`runnerJob:${job.id}`, job);
    await this.patch({ items: [{ ...item, branch: job.branch, prNumber: pr.number, prUrl: pr.html_url, state: "inspecting", inspection: { headSha: receipt.sha, state: "pending", humanApproved: false, stages: [{ gate: "ci", state: "pending", reason: "Waiting for current-head CI" }, { gate: "verify", state: "pending", reason: "Independent proof required" }, { gate: "ai", state: "pending", reason: "Independent review required" }, { gate: "human", state: "pending", reason: "Human merge required" }] }, updatedAt: Date.now() }], machines: this.state.machines.filter(m => m.id === item.machineId).map(m => ({ ...m, state: "idle" as const })) });
    this.log("success", `Local ${job.harness} opened PR #${pr.number}; waiting for CI and independent verification.`, item.id);
    return { prUrl: pr.html_url };
  }

  /** Acknowledge only after durable enqueue. No API calls, backfill or model work here. */
  async enqueueGitHub(deliveryId: string, event: string, payload: GitHubPayload): Promise<void> {
    const key = `delivery:${deliveryId}`;
    if (!(await this.ctx.storage.get(key))) await this.ctx.storage.put(key, { event, payload, attempts: 0 });
    await this.scheduleTick();
  }

  private async processDeliveries(): Promise<void> {
    const pending = await this.ctx.storage.list<{ event: string; payload: GitHubPayload; attempts: number }>({ prefix: "delivery:", limit: 4 });
    for (const [key, delivery] of pending) {
      try {
        await this.handleGitHub(delivery.event, delivery.payload);
        const id = key.slice("delivery:".length);
        await this.env.DB.prepare("UPDATE webhook_deliveries SET state = 'done' WHERE source = 'github' AND delivery_id = ?").bind(id).run();
        await this.ctx.storage.delete(key);
      } catch {
        // Keep the original payload durably queued. Never log credentials or raw API bodies.
        const attempts = delivery.attempts + 1;
        await this.ctx.storage.put(key, { ...delivery, attempts });
        this.log("error", `GitHub delivery deferred (attempt ${attempts}); check App configuration and API availability.`);
        await this.ctx.storage.setAlarm(Date.now() + Math.min(600000, 5000 * 2 ** Math.min(attempts, 7)));
        break;
      }
    }
    if ((await this.ctx.storage.list({ prefix: "delivery:", limit: 1 })).size && !(await this.ctx.storage.getAlarm())) await this.scheduleTick();
  }

  private async handleGitHub(event: string, p: GitHubPayload): Promise<void> {
    const installationId = p.installation?.id;
    const repo = p.repository?.full_name;
    if (event === "installation" || event === "installation_repositories") {
      if (!installationId) return;
      const removed = p.action === "deleted" ? await this.env.DB.prepare("SELECT full_name FROM repos WHERE installation_id = ?").bind(installationId).all<{ full_name: string }>() : { results: p.repositories_removed ?? [] };
      if (p.action === "deleted") {
        await this.env.DB.batch([this.env.DB.prepare("DELETE FROM repos WHERE installation_id = ?").bind(installationId), this.env.DB.prepare("DELETE FROM installations WHERE id = ?").bind(installationId)]);
      } else {
        const added = p.repositories ?? p.repositories_added ?? [];
        await this.env.DB.batch([
          this.env.DB.prepare("INSERT OR REPLACE INTO installations (id, account_login) VALUES (?, ?)").bind(installationId, p.installation?.account?.login ?? ""),
          ...added.map((r) => this.env.DB.prepare("INSERT OR REPLACE INTO repos (full_name, installation_id) VALUES (?, ?)").bind(r.full_name.toLowerCase(), installationId)),
        ]);
        for (const r of added) {
          const factory = this.env.FACTORY.get(this.env.FACTORY.idFromName(r.full_name.toLowerCase()));
          await factory.enqueueGitHub(`install-${installationId}-${r.full_name}-${p.action}`, "shiptorio_install", { repository: { full_name: r.full_name }, installation: p.installation });
        }
      }
      for (const r of removed.results) {
        await this.env.DB.prepare("DELETE FROM repos WHERE full_name = ?").bind(r.full_name.toLowerCase()).run();
        await this.env.FACTORY.get(this.env.FACTORY.idFromName(r.full_name.toLowerCase())).disconnectGitHub();
      }
      return;
    }
    if (!repo || !installationId) return;
    if (event === "shiptorio_install" || event === "issues" || event === "issue_comment") {
      if (await this.ctx.storage.get<boolean>("githubDisabled")) return;
      await this.ensure(repo, installationId);
      if (event === "shiptorio_install") {
        if (await this.ctx.storage.get<boolean>("githubBackfilled")) return;
        const token = await installationToken(this.env, installationId);
        const issues = await openIssues(token, repo);
        for (let offset = 0; offset < issues.length; offset += 5) {
          const batch = issues.slice(offset, offset + 5);
          const reporters = await Promise.all(batch.map((issue) => issueReporters(token, repo, issue)));
          for (let i = 0; i < batch.length; i++) for (const signal of normalizeGitHub({ repository: { full_name: repo }, issue: batch[i] })) await this.ingestSignal({ ...signal, reporters: reporters[i] });
        }
        await this.ctx.storage.put("githubBackfilled", true);
        this.log("info", `GitHub mine connected: ${issues.length} open issues loaded. Spark will triage the ore.`);
      } else {
        for (const signal of normalizeGitHub(p)) await this.ingestSignal(signal);
      }
      return;
    }
    if (!(await this.load())) return;
    if (event === "push" && p.ref === `refs/heads/${p.repository?.default_branch}`) await this.refreshDistricts();
    const pr = p.pull_request as { number?: number; merged?: boolean; head?: { sha: string; ref: string } } | undefined;
    if (event === "pull_request" && p.action === "closed" && pr?.number) await this.onPullClosed(pr.number, !!pr.merged);
    const check = (p.check_run ?? p.check_suite) as { pull_requests?: { number: number }[]; head_sha?: string; conclusion?: string } | undefined;
    if (["check_run", "check_suite"].includes(event) && p.action === "completed" && check) await this.onCheckSuite((check.pull_requests ?? []).map((pr) => pr.number), check.conclusion === "success", check.conclusion ?? "pending", check.head_sha);
  }

  async disconnectGitHub(): Promise<void> {
    await this.ctx.storage.put("githubDisabled", true);
    if (await this.load()) await this.patch({ sources: [{ ...githubStatus(this.env), state: "not_connected", detail: "GitHub mine disconnected for this repository." }] });
  }

  async ingestSignal(signal: Signal): Promise<void> {
    if (!(await this.load())) return;
    const s = this.state!;
    const existing = s.items.find((i) => i.ore?.fingerprint === signal.fingerprint || (signal.source === "github_issue" && i.id === `gh-${signal.externalId}`));
    if (signal.action === "close" || signal.action === "resolved") {
      if (existing && !existing.prNumber && existing.state !== "launched") await this.patch({ removed: [{ kind: "item", id: existing.id }] });
      return;
    }
    const item = foldSignal(existing, signal);
    if (item === existing) return;
    const status = s.sources?.find((source) => source.kind === "github") ?? githubStatus(this.env);
    const now = Date.now();
    const sameDay = status.lastEventAt && new Date(status.lastEventAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
    await this.patch({ items: [item], sources: [...(s.sources ?? []).filter((source) => source.kind !== "github"), { ...status, state: "connected", lastEventAt: now, eventsToday: (sameDay ? status.eventsToday : 0) + 1 }] });
    this.log("info", `${existing ? "Ore updated" : "Ore"}: ${item.title}`, item.id);
    await this.scheduleTick();
  }

  // ---------- state ----------

  private async load(): Promise<FactoryState | null> {
    if (!this.state) {
      this.state = (await this.ctx.storage.get<FactoryState>("state")) ?? null;
      this.meta = (await this.ctx.storage.get<Meta>("meta")) ?? null;
      // A job in flight dies with the instance; put its item back in the queue.
      if (this.state) {
        for (const i of this.state.items) if (i.state === "working") i.state = "queued";
        for (const m of this.state.machines) if (m.state === "working") m.state = "idle";
      }
    }
    return this.state;
  }

  private async save() {
    await this.ctx.storage.put("state", this.state);
  }

  private broadcast(msg: ServerToWeb) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets("web")) {
      try {
        ws.send(text);
      } catch {
        // gone; the runtime cleans up
      }
    }
  }

  private log(level: "info" | "warn" | "error" | "success", text: string, itemId?: string) {
    this.broadcast({ type: "log", level, text, at: Date.now(), itemId });
  }

  private async patch(p: Patch) {
    const s = this.state!;
    for (const it of p.items ?? []) upsert(s.items, it);
    for (const m of p.machines ?? []) upsert(s.machines, m);
    for (const b of p.belts ?? []) upsert(s.belts, b);
    for (const r of p.removed ?? []) {
      const list = r.kind === "item" ? s.items : r.kind === "machine" ? s.machines : s.belts;
      const i = list.findIndex((x) => x.id === r.id);
      if (i !== -1) list.splice(i, 1);
    }
    if (p.districts) s.districts = p.districts;
    if (p.power) s.power = p.power;
    if (p.science) s.science = p.science;
    if (p.trust !== undefined) s.trust = p.trust;
    if (p.tick !== undefined) s.tick = p.tick;
    if (p.sources) s.sources = p.sources;
    if (p.bottleneck !== undefined) s.bottleneck = p.bottleneck;
    await this.save();
    this.broadcast({ type: "patch", patch: p });
  }

  private async scheduleTick() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  // ---------- RPC from the Worker ----------

  /** Creates the factory with districts from the repo and a starter line, if it doesn't exist yet. */
  async ensure(repo: string, installationId: number): Promise<void> {
    if (await this.load()) {
      if (this.meta?.installationId !== installationId) {
        this.meta = { repo, installationId };
        await this.ctx.storage.put("meta", this.meta);
      }
      await this.scheduleTick();
      return;
    }
    this.meta = { repo, installationId };
    await this.ctx.storage.put("meta", this.meta);
    const token = await installationToken(this.env, installationId);
    const tree = await repoTree(token, repo);
    this.state = {
      repo,
      baseBranch: tree.branch,
      districts: layoutMap(tree.entries).zones,
      ...starterLine(),
      items: [],
      science: { red: 0, green: 0, grey: 0, blue: 0 },
      trust: 0.5,
      tick: 0,
      sources: [githubStatus(this.env)],
    };
    await this.save();
  }

  async refreshDistricts(): Promise<void> {
    if (!(await this.load()) || !this.meta) return;
    const token = await installationToken(this.env, this.meta.installationId);
    const tree = await repoTree(token, this.meta.repo);
    await this.patch({ districts: layoutMap(tree.entries).zones });
  }

  async ingestIssue(issue: { number: number; title: string; body: string; url: string; labels: string[] }): Promise<void> {
    if (!(await this.load())) return;
    const id = `gh-${issue.number}`;
    if (this.state!.items.some((i) => i.id === id)) return;
    const item: Item = {
      id,
      kind: "feature",
      source: "github_issue",
      title: issue.title,
      body: `${issue.body}\n\nLabels: ${issue.labels.join(", ")}`,
      url: issue.url,
      district: "/",
      state: "ore",
      attempts: 0,
      updatedAt: Date.now(),
    };
    await this.patch({ items: [item] });
    this.log("info", `Ore: #${issue.number} ${issue.title}`, id);
    await this.scheduleTick();
  }

  async onCheckSuite(prNumbers: number[], _ok: boolean, _summary: string, headSha?: string): Promise<void> {
    if (!(await this.load()) || !this.meta) return;
    const token = await installationToken(this.env, this.meta.installationId);
    for (const item of this.state!.items) {
      if (item.state !== "inspecting" || !item.prNumber || !(prNumbers.includes(item.prNumber) || (headSha && item.inspection?.headSha === headSha))) continue;
      const result = await inspectPullRequest(token, this.meta.repo, item.prNumber, headSha);
      if (result.state === "pending") continue;
      if (result.state === "passed") {
        if (item.branch?.startsWith("shiptorio/runner-")) {
          await this.patch({ items: [{ ...item, inspection: { headSha: headSha ?? "unknown", state: "pending", humanApproved: false, stages: [{ gate: "ci", state: "passed", reason: result.summary }, { gate: "verify", state: "pending", reason: "Independent proof required" }, { gate: "ai", state: "pending", reason: "Independent review required" }, { gate: "human", state: "pending", reason: "Human merge required" }] }, updatedAt: Date.now() }] });
          this.log("success", `CI passed PR #${item.prNumber}; independent verification and review remain pending.`, item.id);
          continue;
        }
        const onPad = this.state!.machines.some((m) => m.type === "launch_pad");
        await this.patch({ items: [{ ...item, state: onPad ? "on_pad" : "passed", failure: undefined, updatedAt: Date.now() }] });
        this.log("success", `Inspector passed PR #${item.prNumber}. Ready to launch.`, item.id);
      } else {
        await this.patch({ items: [{ ...item, state: "rejected", failure: result.summary, updatedAt: Date.now() }] });
        this.log("warn", `Inspector rejected PR #${item.prNumber}: ${result.summary}`, item.id);
        await this.scheduleTick();
      }
    }
  }

  async onPullClosed(prNumber: number, merged: boolean): Promise<void> {
    if (!(await this.load())) return;
    let item = this.state!.items.find((i) => i.prNumber === prNumber);
    // Recover pre-fix issue-close ordering from our durable job and GitHub's real issue.
    // Never synthesize a rocket for an unrelated PR or reopen the GitHub issue.
    if (!item && merged && this.meta) {
      const job = (await this.runnerJobs()).find(j => j.status === "completed" && j.prUrl?.endsWith(`/pull/${prNumber}`));
      if (job) {
        const token = await installationToken(this.env, this.meta.installationId);
        const issue = await gh<NonNullable<GitHubPayload["issue"]>>(`/repos/${job.repo}/issues/${job.itemId.slice(3)}`, token);
        const signal = normalizeGitHub({ repository: { full_name: job.repo }, issue })[0];
        if (signal) {
          const classification = await triage(this.env, { title: issue.title, body: issue.body ?? "", labels: [] }, this.state!.districts.map(d => d.name));
          item = { ...foldSignal(undefined, { ...signal, action: "upsert" }), ...classification, state: "inspecting", branch: job.branch, prNumber, prUrl: job.prUrl, attempts: 1 };
          await this.patch({ items: [item] });
        }
      }
    }
    if (!item || item.state === "launched") return;
    if (!merged) {
      await this.patch({ removed: [{ kind: "item", id: item.id }] });
      this.log("info", `PR #${prNumber} closed without merging. Item scrapped.`, item.id);
      return;
    }
    const s = this.state!;
    const key = SCIENCE_FOR[item.kind];
    await this.patch({
      items: [{ ...item, state: "launched", updatedAt: Date.now() }],
      science: { ...s.science, [key]: s.science[key] + 1 },
      trust: Math.min(1, s.trust + 0.05),
    });
    this.log("success", `Rocket launched: PR #${prNumber} merged.`, item.id);
  }

  // ---------- websockets (browsers) ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, ["web"]);
    const state = await this.load();
    if (state) server.send(JSON.stringify({ type: "snapshot", state } satisfies ServerToWeb));
    else server.send(JSON.stringify({ type: "log", level: "warn", text: "No factory yet. Is the GitHub App installed on this repo?", at: Date.now() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw === "ping") return;
    if (raw.length > 16384) return;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return; }
    const parsed = WebToServer.safeParse(value);
    if (!parsed.success || !(await this.load())) return;
    const msg = parsed.data;
    const s = this.state!;
    switch (msg.type) {
      case "connect_source": {
        if (msg.kind === "github") {
          await this.ctx.storage.delete("githubDisabled");
          const source = githubStatus(this.env);
          await this.patch({ sources: [...(s.sources ?? []).filter((entry) => entry.kind !== "github"), source] });
          this.log("info", source.setup.steps.join(" "));
        } else {
          const source = { kind: msg.kind, state: "needs_action" as const, detail: "Connector setup is not implemented yet.", eventsToday: 0, setup: { steps: ["GitHub is the first source checkpoint. This connector follows the verified shipping loop."] } };
          await this.patch({ sources: [...(s.sources ?? []).filter((entry) => entry.kind !== msg.kind), source] });
          this.log("info", source.detail);
        }
        break;
      }
      case "disconnect_source": {
        if (msg.kind === "github") await this.disconnectGitHub();
        else await this.patch({ sources: (s.sources ?? []).map((source) => source.kind === msg.kind ? { ...source, state: "not_connected", detail: "Disconnected" } : source) });
        break;
      }
      case "place_machine": {
        const m: Machine = {
          id: `${msg.machineType}-${crypto.randomUUID().slice(0, 6)}`,
          type: msg.machineType,
          x: msg.x,
          y: msg.y,
          district: msg.district,
          harness: msg.harness,
          powerId: msg.harness === "spark" ? "steam-spark" : undefined,
          tier: 1,
          state: "idle",
        };
        await this.patch({ machines: [m] });
        break;
      }
      case "remove_machine":
        if (s.machines.some((m) => m.id === msg.id && m.state === "working")) break;
        await this.patch({
          removed: [
            { kind: "machine", id: msg.id },
            ...s.belts.filter((b) => b.from === msg.id || b.to === msg.id).map((b) => ({ kind: "belt" as const, id: b.id })),
          ],
        });
        break;
      case "connect_belt": {
        if (!s.machines.some((m) => m.id === msg.from) || !s.machines.some((m) => m.id === msg.to)) return;
        const b: Belt = { id: `belt-${crypto.randomUUID().slice(0, 6)}`, from: msg.from, to: msg.to, carries: msg.carries };
        await this.patch({ belts: [b] });
        break;
      }
      case "set_module": {
        const m = s.machines.find((x) => x.id === msg.machineId);
        if (m) await this.patch({ machines: [{ ...m, module: msg.module }] });
        break;
      }
      case "route_item": {
        const item = s.items.find((i) => i.id === msg.itemId);
        const m = s.machines.find((x) => x.id === msg.machineId);
        if (item && m?.type === "assembler" && (item.state === "ore" || item.state === "queued")) {
          await this.patch({ items: [{ ...item, state: "queued", machineId: m.id, updatedAt: Date.now() }] });
          await this.scheduleTick();
        }
        break;
      }
      case "launch_pr": {
        // A human merge launches the rocket; this just points the player at the PR.
        const item = s.items.find((i) => i.id === msg.itemId);
        if (item?.prUrl) this.log("info", `Merge ${item.prUrl} to launch.`, item.id);
        break;
      }
    }
    await this.scheduleTick();
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, "bye");
  }

  // ---------- the tick loop ----------

  async alarm(): Promise<void> {
    await this.processDeliveries();
    if (!(await this.load())) return;
    await this.planRunnerJobs();
    const s = this.state!;
    await this.patch({ tick: s.tick + 1 });
    const now = Date.now();

    for (const item of [...s.items]) {
      if (item.state === "ore" && hasMachine(s, "splitter")) {
        const t = await triage(this.env, { title: item.title, body: item.body ?? "", labels: [] }, s.districts.map((d) => d.name)).catch(
          () => null,
        );
        await this.patch({ items: [{ ...item, kind: t?.kind ?? item.kind, district: t?.district ?? item.district, state: "queued", updatedAt: now }] });
        this.log("info", `Splitter sorted "${item.title}" as ${t?.kind ?? item.kind} → ${t?.district ?? item.district}`, item.id);
      } else if (item.state === "rejected") {
        if (item.attempts >= MAX_ATTEMPTS) continue; // stays rejected until a human steps in
        await this.patch({ items: [{ ...item, state: "queued", updatedAt: now }] });
        this.log("info", `Rework: "${item.title}" goes back to the assemblers`, item.id);
      }
    }

    for (const item of s.items.filter((i) => i.state === "queued" && i.attempts < MAX_ATTEMPTS)) {
      const m = pickAssembler(s, item);
      if (!m) continue;
      if (this.env.HOSTED_SPARK_ASSEMBLER !== "1") {
        await this.patch({
          machines: [{ ...m, state: "blocked" }],
          bottleneck: { stage: "resources", wip: s.items.filter((i) => i.state === "queued").length, ageMs: Math.max(0, now - item.updatedAt), throughputPerHour: 0, valueAtRisk: s.items.reduce((total, i) => total + (i.value ?? 0), 0), summary: "Plug in Claude or ChatGPT to start building." },
        });
        if (!s.move || s.move.stage !== "resources") {
          s.move = { id: crypto.randomUUID(), title: "Plug in Claude or ChatGPT to start building.", why: "Spark directs the factory; your local subscription agents write the code.", stage: "resources", itemId: item.id, createdAt: now, options: [{ id: "connect", label: "Connect a local agent", recommended: true, actions: [{ tool: "connect_source", args: { kind: "claude" }, reason: "No subscription builder is connected." }] }] };
          await this.save();
          this.broadcast({ type: "move", move: s.move });
        }
        continue;
      }
      if (!sparkConfigured(this.env)) {
        if (m.state !== "blocked") this.log("warn", "Spark has no power. Add the Meta API key to start this line.", item.id);
        await this.patch({ machines: [{ ...m, state: "blocked" }] });
        continue;
      }
      await this.patch({
        items: [{ ...item, state: "working", machineId: m.id, attempts: item.attempts + 1, updatedAt: now }],
        machines: [{ ...m, state: "working" }],
      });
      this.running.add(item.id);
      // Bounded hosted jobs execute in an alarm, not an HTTP request or a 30-second waitUntil.
      // One job per alarm keeps total work under the alarm's 15-minute limit.
      await this.runSparkJob(item.id, m.id);
      break;
    }

    const busy = s.items.some((i) => i.attempts < MAX_ATTEMPTS && ((i.state === "ore" && hasMachine(s, "splitter")) || i.state === "rejected" || (i.state === "queued" && this.env.HOSTED_SPARK_ASSEMBLER === "1" && sparkConfigured(this.env) && !!pickAssembler(s, i))));
    if (busy && (await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    else await this.save();
  }

  private async runSparkJob(itemId: string, machineId: string): Promise<void> {
    const s = this.state!;
    const get = () => s.items.find((i) => i.id === itemId)!;
    const machine = () => s.machines.find((m) => m.id === machineId);
    try {
      if (!sparkConfigured(this.env)) throw new Error("Spark has no power: META_API_KEY isn't set");
      if (!this.meta) throw new Error("factory has no repo");
      const item = get();
      const token = await installationToken(this.env, this.meta.installationId);
      const tree = await repoTree(token, this.meta.repo);
      const paths = tree.entries.filter((e) => e.type === "blob").map((e) => e.path);
      const inDistrict = item.district === "/" ? paths : paths.filter((p) => p.startsWith(`${item.district}/`));
      const task = { title: item.title, body: item.body ?? "", district: item.district, failure: item.failure };
      const ref = item.branch ?? s.baseBranch;

      this.log("info", `Assembler ${machineId} is reading the code`, itemId);
      const wanted = await pickFiles(this.env, task, inDistrict.length ? inDistrict : paths);
      const files = (
        await Promise.all(wanted.map(async (path) => ({ path, content: await fileContent(token, this.meta!.repo, path, ref) })))
      ).filter((f): f is { path: string; content: string } => f.content !== null);

      this.log("info", `Assembler ${machineId} is writing a fix`, itemId);
      const fix = await writeFix(this.env, task, files);
      const bad = fix.changes.find((c) => !SAFE_PATH.test(c.path));
      if (bad) throw new Error(`refused to write ${bad.path}`);

      const branch = item.branch ?? `shiptorio/${item.id}`;
      await commitToBranch(token, this.meta.repo, s.baseBranch, branch, fix.changes, `${fix.title}\n\n${fix.summary}`);

      let { prNumber, prUrl } = item;
      if (!prNumber) {
        const issueNumber = item.source === "github_issue" ? Number(item.id.replace("gh-", "")) : null;
        const pr = await openPullRequest(token, this.meta.repo, {
          head: branch,
          base: s.baseBranch,
          title: fix.title,
          body: `${fix.summary}\n\n${issueNumber ? `Closes #${issueNumber}\n\n` : ""}_Built by a Muse Spark assembler in Shiptorio._`,
        });
        prNumber = pr.number;
        prUrl = pr.html_url;
      }
      await this.patch({
        items: [{ ...get(), state: "inspecting", branch, prNumber, prUrl, updatedAt: Date.now() }],
        machines: machine() ? [{ ...machine()!, state: "idle" }] : [],
      });
      this.log("success", `PR #${prNumber} is on the belt to the inspector`, itemId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.patch({
        items: [{ ...get(), state: "rejected", failure: msg, updatedAt: Date.now() }],
        machines: machine() ? [{ ...machine()!, state: "idle" }] : [],
      });
      this.log("error", `Assembler ${machineId} failed: ${msg}`, itemId);
    } finally {
      this.running.delete(itemId);
      await this.scheduleTick();
    }
  }
}
