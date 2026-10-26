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
import { commitToBranch, fileContent, installationToken, inspectPullRequest, issueReporters, openIssues, openPullRequest, repoTree, type AppCredentials } from "./github";
import { hasMachine, pickAssembler, SAFE_PATH, starterLine, upsert } from "./engine";
import { layoutMap } from "./map";
import { pickFiles, sparkConfigured, triage, writeFix, type SparkEnv } from "./spark";
import { foldSignal } from "./ore";
import { githubStatus, normalizeGitHub, type GitHubPayload, type GitHubSourceEnv } from "./sources/github";
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
      if (existing && existing.state !== "launched") await this.patch({ removed: [{ kind: "item", id: existing.id }] });
      return;
    }
    const item = foldSignal(existing, signal);
    if (item === existing) return;
    await this.patch({ items: [item] });
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
      if (item.state !== "inspecting" || !item.prNumber || !prNumbers.includes(item.prNumber)) continue;
      const result = await inspectPullRequest(token, this.meta.repo, item.prNumber, headSha);
      if (result.state === "pending") continue;
      if (result.state === "passed") {
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
    const item = this.state!.items.find((i) => i.prNumber === prNumber);
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
    if (busy) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
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
