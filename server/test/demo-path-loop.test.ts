// The hackathon demo path, end to end, through the real Factory Durable Object (docs/context/github-deck-loop.md).
// Shippy sees a red PR, the player says yes, a fix issue is filed and planned, the local runner builds it, Checks and
// Review pass, the player holds Ship it, GitHub merges the approved head, the rocket launches, the red PR gets the fix,
// and Shippy says "That's fixed" once. GitHub and Meta are in-memory fakes that record every call and refuse anything
// they don't model; no network, no live factory.
import { credentialEnv } from "./credential-fixture";
import { authorizedSocket, browserEnv, membershipCache } from "./browser-fixture";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { FactoryState, projectPipeline, signalId, type Item, type Move, type ServerToWeb } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { emptyMemory } from "../src/diagnose";
import type { RunnerJob } from "../src/runner-job";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

const REPO = "r3dbars/demo", RED_PR = 39, ISSUE = 50, FIX_PR = 51;
const BASE = "a".repeat(40), FIX_HEAD = "b".repeat(40), PUSHED_LATER = "c".repeat(40), RED_HEAD = "d".repeat(40), RED_UPDATED = "e".repeat(40);
const FILES = ["server/src/check.ts", "server/test/check.test.ts"];
const red = {
  id: signalId("ci", "ci_blocking", "check"), source: "ci" as const, kind: "ci_blocking", scope: "check", title: `"check" is failing on #${RED_PR}, so it can't ship.`, severity: 0.7, confidence: 1,
  evidence: [{ label: `Failing on #${RED_PR}`, url: "https://github.com/r3dbars/demo/actions/runs/1" }], observedAt: Date.now(), freshUntil: Date.now() + 3_600_000,
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

type Check = "success" | "failure" | "pending";
type Pull = { number: number; state: "open" | "closed"; merged: boolean; title: string; head: { sha: string; ref: string; repo: { full_name: string } }; base: { sha: string; ref: string; repo: { full_name: string } }; body: string };

/**
 * A small GitHub + Meta. Every request is recorded; writes keep their bodies. Anything the world doesn't model is
 * recorded in `unexpected` and refused, so a new call on the demo path fails the test instead of passing quietly.
 */
function world() {
  const calls: string[] = [], writes: { method: string; path: string; body: any }[] = [], unexpected: string[] = [], spark: string[] = [];
  const pulls = new Map<number, Pull>([[RED_PR, { number: RED_PR, state: "open", merged: false, title: "Shipping note", body: "", head: { sha: RED_HEAD, ref: "shipping-note", repo: { full_name: REPO } }, base: { sha: BASE, ref: "main", repo: { full_name: REPO } } }]]);
  const checks = new Map<string, Check>([[RED_HEAD, "failure"], [RED_UPDATED, "success"]]);
  const comments = new Map<number, unknown[]>();
  const branches = new Map<string, string>();
  const issue = { number: ISSUE, state: "open", title: `Fix "check" failing on #${RED_PR}`, body: "", user: { login: "r3dbars" }, author_association: "OWNER", labels: [{ name: "shiptorio" }], updated_at: "2026-10-30T19:00:00Z", html_url: `https://github.com/${REPO}/issues/${ISSUE}` };
  let issueFiled = false, plannerTurn = 0;
  const blocked = new Set<number>(); // PRs GitHub's branch protection is holding (mergeable_state "blocked")
  const review = { verdict: "pass" as "pass" | "rework", reason: "The check now passes and the new test pins the fix." };
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  const pullJson = (p: Pull) => ({ ...p, html_url: `https://github.com/${REPO}/pull/${p.number}`, draft: false, mergeable: p.state === "open" && !p.merged, mergeable_state: p.state !== "open" || p.merged ? "unknown" : blocked.has(p.number) ? "blocked" : "clean" });
  const runs = (sha: string) => { const c = checks.get(sha) ?? "pending"; return { total_count: 1, check_runs: [{ id: 7, name: "check", app: { id: 15368 }, head_sha: sha, status: c === "pending" ? "in_progress" : "completed", conclusion: c === "pending" ? null : c, output: { summary: c === "failure" ? "1 test failed" : "" } }] }; };

  async function sparkReply(body: any): Promise<unknown> {
    const developer = String(body.messages.find((m: { role: string }) => m.role === "developer")?.content ?? "");
    const user = String(body.messages.find((m: { role: string }) => m.role === "user")?.content ?? "");
    if (developer.includes("the mind of Shiptorio")) {
      spark.push("diagnose");
      return { tool: "diagnose", reason: "A red check is the one thing stopping #39.", signalIds: [red.id], area: "speed", title: "A red check blocks #39", why: "#39 can't ship while check fails", play: "fix_blocking_check", card: "Fix the failing check", because: "1 check is red on #39", confidence: 0.9 };
    }
    if (developer.includes("game master of Shiptorio")) {
      spark.push("rank");
      const ids = [...user.matchAll(/\\?"id\\?":\\?"([^"\\]+)\\?"/g)].map(m => m[1]);
      return { order: ids, reason: "Oldest jam first.", picks: {} };
    }
    if (developer.includes("You triage incoming work")) { spark.push("triage"); return { kind: "bug", district: "/", reason: "A failing check is a bug." }; }
    if (developer.includes("planning a small, focused change")) { spark.push("scope"); return { files: FILES }; }
    if (developer.includes("Shiptorio's foreman")) {
      spark.push("plan");
      return ++plannerTurn % 2 === 1
        ? { tool: "read_file", path: FILES[0], reason: "Read the code the check exercises." }
        : { tool: "assign_job", files: FILES, reason: "Fix the code the check runs and pin it with a test.", plan: "Fix the guard in server/src/check.ts so the check passes, and add a regression test.", acceptance: ["The check passes on the default branch", "A new test fails before the fix and passes after"], heeded: [] };
    }
    if (developer.includes("hostile reviewer")) { spark.push("review"); return { verdict: review.verdict, reason: review.reason, findings: [] }; }
    unexpected.push(`spark: ${developer.slice(0, 80)}`);
    throw new Error(`Unexpected planner prompt: ${developer.slice(0, 80)}`);
  }

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input)), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.pathname.endsWith("/chat/completions")) return json({ choices: [{ message: { content: JSON.stringify(await sparkReply(body)) } }], usage: { total_tokens: 100, prompt_tokens: 80, completion_tokens: 20 } });
    if (url.hostname !== "api.github.com") { unexpected.push(`${method} ${url}`); throw new Error(`Unexpected host ${url.hostname}`); }
    const path = url.pathname, full = `${path}${url.search}`;
    calls.push(`${method} ${full}`);
    // GraphQL reads (the feedback collector's Discussions query) are POSTs that change nothing; a mutation is a write.
    const graphRead = path === "/graphql" && typeof body?.query === "string" && !/^\s*mutation\b/.test(body.query);
    if (method !== "GET" && !graphRead) writes.push({ method, path, body });
    const r = `/repos/${REPO}`;
    if (path.startsWith("/app/installations/") && path.endsWith("/access_tokens") && method === "POST") return json({ token: `fixture-token-${writes.length}`, expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
    if (path === r && method === "GET") return json({ default_branch: "main" });
    if (path === `${r}/git/trees/main`) return json({ sha: "tree-main", truncated: false, tree: [{ path: "README.md", type: "blob" }, ...FILES.slice(0, 1).map(p => ({ path: p, type: "blob" }))] });
    if (path.startsWith(`${r}/git/trees/`)) return json({ sha: "tree-head", truncated: false, tree: [{ path: "README.md", type: "blob" }, ...FILES.map(p => ({ path: p, type: "blob" }))] });
    if (path === `${r}/git/ref/heads/main`) return json({ object: { sha: BASE } });
    if (path.startsWith(`${r}/git/ref/heads/shiptorio/runner-`)) { const sha = branches.get(decodeURIComponent(path.slice(`${r}/git/ref/heads/`.length))); return sha ? json({ object: { sha } }) : json({ message: "Not Found" }, 404); }
    if (path.startsWith(`${r}/contents/`)) return json({ encoding: "base64", content: btoa("export const guard = (x: number) => x > 0;\n") });
    if (path === `${r}/issues` && method === "POST") { if (issueFiled) unexpected.push("second fix issue"); issueFiled = true; return json(issue, 201); }
    if (path === `${r}/issues/${ISSUE}` && method === "GET") return issueFiled ? json(issue) : json({ message: "Not Found" }, 404);
    const commentsMatch = /^\/repos\/r3dbars\/demo\/issues\/(\d+)\/comments$/.exec(path);
    if (commentsMatch && method === "GET") return json(comments.get(Number(commentsMatch[1])) ?? []);
    if (commentsMatch && method === "POST") { const n = Number(commentsMatch[1]); comments.set(n, [...(comments.get(n) ?? []), { id: Date.now(), body: body.body, user: { login: "shiptorio[bot]", type: "Bot" }, created_at: new Date().toISOString() }]); return json({ id: 1 }, 201); }
    if (path === `${r}/pulls` && method === "GET") {
      const head = url.searchParams.get("head")?.split(":")[1];
      return json([...pulls.values()].filter(p => p.state === "open" && (!head || p.head.ref === head)).map(pullJson));
    }
    if (path === `${r}/pulls` && method === "POST") {
      if (pulls.has(FIX_PR)) { unexpected.push("second fix PR"); return json({ message: "A pull request already exists" }, 422); }
      const sha = branches.get(body.head);
      if (!sha) return json({ message: "head not found" }, 422);
      pulls.set(FIX_PR, { number: FIX_PR, state: "open", merged: false, title: body.title, body: body.body, head: { sha, ref: body.head, repo: { full_name: REPO } }, base: { sha: BASE, ref: body.base, repo: { full_name: REPO } } });
      return json(pullJson(pulls.get(FIX_PR)!), 201);
    }
    const pullMatch = /^\/repos\/r3dbars\/demo\/pulls\/(\d+)(\/[a-z-]+)?$/.exec(path);
    if (pullMatch) {
      const pull = pulls.get(Number(pullMatch[1]));
      if (!pull) return json({ message: "Not Found" }, 404);
      const rest = pullMatch[2];
      if (!rest && method === "GET") return json(pullJson(pull));
      if (rest === "/files") return json(pull.number === FIX_PR ? [{ filename: FILES[0], status: "modified", additions: 1, deletions: 1, changes: 2, patch: "@@ -1 +1 @@\n-export const guard = (x: number) => x > 0;\n+export const guard = (x: number) => x >= 0;" }, { filename: FILES[1], status: "added", additions: 1, deletions: 0, changes: 1, patch: "@@ -0,0 +1 @@\n+test(\"guard accepts zero\", () => expect(guard(0)).toBe(true));" }] : []);
      if (rest === "/merge" && method === "PUT") {
        if (pull.state !== "open" || pull.merged) return json({ message: "Pull Request is not mergeable" }, 405);
        if (body.sha !== pull.head.sha) return json({ message: "Head branch was modified. Review and try the merge again." }, 409);
        pull.merged = true; pull.state = "closed";
        return json({ sha: "f".repeat(40), merged: true, message: "Pull Request successfully merged" });
      }
      if (rest === "/update-branch" && method === "PUT") { pull.head = { ...pull.head, sha: RED_UPDATED }; return json({ message: "Updating pull request branch." }, 202); }
    }
    const compare = /^\/repos\/r3dbars\/demo\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/.exec(path);
    if (compare) return json(compare[1] === BASE && compare[2] === FIX_HEAD ? { status: "ahead", ahead_by: 1, files: [{ filename: FILES[0], status: "modified", changes: 2, patch: "-export const guard = (x: number) => x > 0;\n+export const guard = (x: number) => x >= 0;" }, { filename: FILES[1], status: "added", changes: 1, patch: "+test(\"guard accepts zero\", () => expect(guard(0)).toBe(true));" }] } : { status: "diverged", ahead_by: 0, files: [] });
    const checkRuns = /^\/repos\/r3dbars\/demo\/commits\/([^/]+)\/check-runs$/.exec(path);
    if (checkRuns) return json(runs(decodeURIComponent(checkRuns[1])));
    if (/^\/repos\/r3dbars\/demo\/commits\/[^/]+\/status$/.test(path)) return json({ total_count: 0, statuses: [] });
    // Shippy's forced look after the fix merges re-reads the repo and CI collectors: a quiet repo, no red runs.
    if (method === "GET" && path === `${r}/issues` && url.searchParams.get("state") === "all") return json(issueFiled ? [{ ...issue, state: "closed" }] : []);
    if (method === "GET" && path === `${r}/issues/comments`) return json([]);
    if (method === "GET" && path === `${r}/branches`) return json([{ name: "main", commit: { sha: BASE } }]);
    if (graphRead) return json({ data: { repository: { discussions: { nodes: [] } } } });
    if (method === "GET" && path === `${r}/actions/runs`) return json({ total_count: 0, workflow_runs: [] });
    unexpected.push(`${method} ${full}`);
    return json({ message: `Not modeled by the demo-path fixture: ${method} ${full}` }, 404);
  }) as unknown as typeof fetch;
  /** The runner pushed its commit to the job's branch. */
  const push = (branch: string, sha: string) => { branches.set(branch, sha); const pr = [...pulls.values()].find(p => p.head.ref === branch); if (pr) pr.head = { ...pr.head, sha }; };
  return { fetch: fakeFetch, calls, writes, unexpected, spark, pulls, checks, comments, branches, push, review, blocked };
}

/** The real Durable Object with in-memory storage, the "brain" flag on, a paired runner and an App key. */
async function fixture() {
  const gh = world();
  globalThis.fetch = gh.fetch;
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  const state = FactoryState.parse({ repo: REPO, baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0, move: null, deck: [] });
  const now = Date.now();
  const data = new Map<string, unknown>([
    ["githubAccessCheckedAt", now], ["state", structuredClone(state)], ["meta", { repo: REPO, installationId: 1 }], ["openMoves", []], ["runnerPair", "pair"],
    // Shippy's collectors already read the repo: CI saw "check" red on #39. Nothing else is due.
    ["brainSignals", { signals: [red], readAt: { ci: now, repo: now, factory: now, sentry: now, posthog: now, feedback: now, goals: now } }],
    ["brainMemory", emptyMemory()],
  ]);
  let alarm: number | null = null;
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async deleteAlarm() { alarm = null; },
    async list(options: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)); },
    async getAlarm() { return alarm; }, async setAlarm(value: number) { alarm = value; },
  };
  const row = { token_version: 0, status: "active", installation_id: 1, id: 1, login: "test-player", user_id: 1, calls: 1, tokens: 100, next_at: Date.now(), failures: 0, enabled: 1, runs_daily: 20, count: 1 };
  const DB = { prepare: () => ({ bind: () => ({ first: async () => ({ ...row, next_at: Date.now() }), all: async () => ({ results: [] }), run: async () => ({ success: true, meta: { changes: 1 } }) }) }) };
  const CACHE = { ...membershipCache, get: async (key: string) => key === "flags:v1:global:brain" ? "true" : membershipCache.get(key) };
  const events: ServerToWeb[] = [];
  const socket = authorizedSocket((raw: string) => events.push(JSON.parse(raw)));
  let exclusive: Promise<unknown> = Promise.resolve();
  const background: Promise<unknown>[] = [];
  const ctx = { storage, waitUntil: (task: Promise<unknown>) => { background.push(task.catch(() => {})); }, acceptWebSocket() {}, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const next = exclusive.then(fn); exclusive = next.catch(() => {}); return next; }, getWebSockets: () => [socket] };
  const env = credentialEnv({ ...browserEnv, CACHE, DB, GITHUB_APP_ID: "demo-path", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "demo-path-key" });
  const factory = new Factory(ctx as never, env as never);
  /** The private parts the tick helper drives, as brain-factory.test.ts does. */
  const internal = factory as unknown as { brainBusy: boolean; brainKickedAt: number; refreshDecisions(): Promise<void>; broadcastQueue: Promise<void> };
  const settle = async () => {
    for (let i = 0; i < 400 && internal.brainBusy; i++) await new Promise(r => setTimeout(r, 5));
    await Promise.all(background); await internal.broadcastQueue;
  };
  /** One alarm tick, with Shippy's look allowed and finished. */
  const tick = async () => { internal.brainKickedAt = 0; await factory.alarm(); await settle(); await internal.refreshDecisions(); await settle(); };
  const send = async (value: unknown) => { await factory.webSocketMessage(authorizedSocket(), JSON.stringify(value)); await settle(); };
  const saved = () => data.get("state") as FactoryState;
  const item = (id = `gh-${ISSUE}`) => saved().items.find(i => i.id === id) as Item | undefined;
  const deck = () => saved().deck ?? [];
  const card = (match: (m: Move) => boolean) => deck().find(match);
  const jobs = () => [...data.entries()].filter(([k]) => k.startsWith("runnerJob:")).map(([, v]) => v as RunnerJob);
  const stations = () => Object.fromEntries(projectPipeline(saved(), jobs(), true).map(s => [s.id, s.state]));
  const logs = () => events.filter((e): e is Extract<ServerToWeb, { type: "log" }> => e.type === "log").map(e => e.text);
  const merges = () => gh.writes.filter(w => w.path.endsWith("/merge"));
  return { gh, factory, data, tick, send, settle, saved, item, deck, card, jobs, stations, logs, merges, events };
}
type Demo = Awaited<ReturnType<typeof fixture>>;

/** Shippy deals the red-PR card, the player says yes, the fix issue is planned and approved, the runner opens the PR,
 * and CI, the proof check and Review pass. Leaves the factory at Gate with a Launch card for FIX_HEAD. */
async function driveToGate(f: Demo) {
  // ---- Shippy deals a card about a real problem.
  await f.tick();
  const unlock = f.card(m => m.id === `unlock:${red.id}`);
  expect(unlock).toMatchObject({ title: "Fix the failing check" });
  expect(unlock!.options.map(o => o.id)).toEqual(["continue", "later"]);
  expect(f.gh.spark).toContain("diagnose");
  expect(f.saved().holdingBack).toMatchObject({ id: red.id });
  expect(f.gh.writes.filter(w => !w.path.endsWith("/access_tokens"))).toEqual([]); // looking writes nothing

  // ---- Yes: Shippy files one fix issue and puts it on the line (Repo → Planner).
  await f.send({ type: "choose_move", moveId: unlock!.id, optionId: "continue" });
  const filed = f.gh.writes.filter(w => w.path === `/repos/${REPO}/issues`);
  expect(filed).toHaveLength(1);
  expect(filed[0].body).toMatchObject({ title: `Fix "check" failing on #${RED_PR}`, labels: ["shiptorio"] });
  expect(filed[0].body.body).toContain("don't weaken or skip the check");
  expect(f.item()).toMatchObject({ source: "github_issue", title: `Fix "check" failing on #${RED_PR}` });
  expect(f.data.get(`fixesPr:${ISSUE}`)).toEqual({ pr: RED_PR, sameRepo: true });
  expect(f.jobs()).toEqual([expect.objectContaining({ itemId: `gh-${ISSUE}`, status: "planning", needsApproval: true })]);
  expect(f.logs()).toContain(`Filed #${ISSUE} to fix "check" on #${RED_PR}. Approve its plan and the Builder fixes it.`);
  expect(f.card(m => m.id === unlock!.id)).toBeUndefined();
  expect(f.stations().planner).toBe("working");

  // ---- The planner reads the issue and code and offers the plan (Planner, waiting on the player).
  await f.tick();
  const job = f.jobs()[0];
  expect(job).toMatchObject({ status: "awaiting_approval", allowedPaths: FILES, baseSha: BASE, harness: "codex" });
  const approval = f.card(m => m.id === job.approvalMoveId)!;
  expect(approval).toMatchObject({ title: `Build #${ISSUE}: Fix "check" failing on #${RED_PR}`, kind: "build", itemId: `gh-${ISSUE}` });
  expect(approval.plan).toContain(`Files: ${FILES.join(", ")}`);
  expect(approval.options.map(o => o.id)).toEqual(["approve", "decline"]);
  const planComments = f.gh.writes.filter(w => w.path === `/repos/${REPO}/issues/${ISSUE}/comments`);
  expect(planComments).toHaveLength(1);
  expect(planComments[0].body.body).toContain(`<!-- shiptorio-plan:${job.id} -->`);
  expect(f.stations().planner).toBe("waiting_player");
  expect(["queued", "ore"]).toContain(f.item()!.state);
  // Nothing builds before the yes: the runner gets no job.
  expect(await f.factory.claimRunner("pair", ["codex"])).toBeNull();

  // ---- Approve the plan; the local runner claims it (Builder).
  await f.send({ type: "choose_move", moveId: approval.id, optionId: "approve" });
  expect(f.jobs()[0]).toMatchObject({ status: "ready", approvedBy: "player" });
  expect(f.card(m => m.id === approval.id)).toBeUndefined();
  const claimed = await f.factory.claimRunner("pair", ["codex"]);
  await f.settle();
  expect(claimed).toMatchObject({ id: job.id, status: "running", allowedPaths: FILES, baseSha: BASE });
  expect(claimed!.token).toBeTruthy();
  expect(f.item()).toMatchObject({ state: "working", attempts: 1 });
  expect(f.stations()).toMatchObject({ planner: "done", builder: "working" });
  expect(await f.factory.claimRunner("pair", ["codex"])).toBeNull(); // one lease

  // ---- The runner pushes one commit and reports; the factory opens the PR (Builder → Checks).
  f.gh.push(claimed!.branch, FIX_HEAD);
  f.gh.checks.set(FIX_HEAD, "pending");
  const receipt = { jobId: job.id, lease: claimed!.lease!, ok: true, sha: FIX_HEAD, summary: "Guard accepts zero; regression test added.", checks: ["typecheck", "test", "build"] as ("typecheck" | "test" | "build")[] };
  expect((await f.factory.finishRunner("pair", receipt)).prUrl).toBe(`https://github.com/${REPO}/pull/${FIX_PR}`);
  await f.settle();
  const opened = f.gh.writes.filter(w => w.path === `/repos/${REPO}/pulls` && w.method === "POST");
  expect(opened).toHaveLength(1);
  expect(opened[0].body).toMatchObject({ head: claimed!.branch, base: "main", draft: false });
  expect(opened[0].body.body).toContain(`Closes #${ISSUE}`);
  expect(opened[0].body.body).toContain("Human review and merge required.");
  expect(f.item()).toMatchObject({ state: "inspecting", prNumber: FIX_PR, branch: claimed!.branch, machineId: "ci-1", inspection: { headSha: FIX_HEAD } });
  expect(f.stations()).toMatchObject({ builder: "done", checks: "working" });
  expect(f.logs()).toContain(`Local codex opened PR #${FIX_PR}; waiting for CI and independent verification.`);

  // ---- CI goes green on the PR head (Checks), then the proof check and Review run on the tick.
  await f.factory.onCheckSuite([FIX_PR], true, "pending", FIX_HEAD);
  expect(f.item()!.inspection!.stages.find(s => s.gate === "ci")?.state).toBe("pending");
  f.gh.checks.set(FIX_HEAD, "success");
  await f.factory.onCheckSuite([FIX_PR], true, "green", FIX_HEAD);
  await f.settle();
  expect(f.item()!.inspection!.stages.find(s => s.gate === "ci")?.state).toBe("passed");
  expect(f.logs()).toContain(`Checks: CI passed PR #${FIX_PR}. Next, the proof check.`);
  await f.tick();
  const stage = (gate: string) => f.item()!.inspection!.stages.find(s => s.gate === gate)?.state;
  expect([stage("ci"), stage("verify"), stage("ai"), stage("human")]).toEqual(["passed", "passed", "passed", "pending"]);
  expect(f.gh.spark).toContain("review");
  const reviewComments = f.gh.writes.filter(w => w.path === `/repos/${REPO}/issues/${FIX_PR}/comments`);
  expect(reviewComments).toHaveLength(1);
  expect(reviewComments[0].body.body).toContain(`<!-- shiptorio-review-head:${FIX_HEAD} -->`);
  expect(f.logs().some(l => l.startsWith(`Review passed PR #${FIX_PR}`))).toBe(true);

  // ---- Gate: the Launch card, bound to the head that passed.
  expect(f.item()).toMatchObject({ state: "on_pad", machineId: "gate-1" });
  const launch = f.card(m => m.stage === "pad" && m.kind === "ship")!;
  expect(launch).toMatchObject({ title: `Launch #${FIX_PR}: Fix "check" failing on #${RED_PR}`, itemId: `gh-${ISSUE}` });
  expect(launch.locked).toBeFalsy();
  expect(launch.evidence?.every(e => e.ok)).toBe(true);
  expect(launch.options.find(o => o.id === "launch")!.actions[0]).toMatchObject({ tool: "request_merge", args: { pr: FIX_PR, headSha: FIX_HEAD } });
  expect(f.stations()).toMatchObject({ checks: "done", review: "done", gate: "waiting_player", launch: "waiting_player" });
  expect(f.merges()).toEqual([]);
  return { job, launch, claimed: claimed! };
}

describe("the demo path, through the real factory", () => {
  it("red PR → yes → fix issue → plan → build → Checks → Review → Ship it → merged → launched → \"That's fixed\" once", async () => {
    const f = await fixture();
    const { launch } = await driveToGate(f);

    // ---- No merge without the human: the factory ticking at Gate (learned work, autonomy, readiness polls) never merges.
    await f.tick(); await f.tick();
    expect(f.merges()).toEqual([]);
    expect(f.item()!.state).toBe("on_pad");

    // ---- Ship it (the deck's held press sends this choice): one merge, pinned to the approved head.
    const current = f.card(m => m.stage === "pad" && m.kind === "ship")!;
    expect(current.id).toBe(launch.id); // the same card the player has been looking at
    expect(current.options.find(o => o.id === "launch")!.actions[0].args.headSha).toBe(FIX_HEAD);
    await f.send({ type: "choose_move", moveId: current.id, optionId: "launch" });
    expect(f.merges()).toEqual([{ method: "PUT", path: `/repos/${REPO}/pulls/${FIX_PR}/merge`, body: { merge_method: "squash", sha: FIX_HEAD, commit_title: `Fix "check" failing on #${RED_PR} (#${FIX_PR})` } }]);
    expect(f.gh.pulls.get(FIX_PR)).toMatchObject({ merged: true, state: "closed" });

    // ---- Launched: one rocket, science, the human stamp, and the red PR gets the fix exactly once.
    expect(f.item()).toMatchObject({ state: "launched", inspection: { humanApproved: true } });
    expect(f.saved().science.red).toBe(1);
    expect(f.stations()).toMatchObject({ planner: "done", builder: "done", checks: "done", review: "done", gate: "done", launch: "done" });
    expect(f.logs()).toContain(`Rocket launched: PR #${FIX_PR} merged.`);
    expect(f.card(m => m.itemId === `gh-${ISSUE}`)).toBeUndefined();
    expect(f.gh.writes.filter(w => w.path === `/repos/${REPO}/pulls/${RED_PR}/update-branch`)).toHaveLength(1);
    expect(f.data.get(`fixesPr:${ISSUE}`)).toMatchObject({ pr: RED_PR, done: true, fixedBy: FIX_PR });

    // GitHub's own merge webhook lands after our launch: no second rocket, no second update.
    await f.factory.onPullClosed(FIX_PR, true, "f".repeat(40));
    expect(f.saved().science.red).toBe(1);
    expect(f.gh.writes.filter(w => w.path.endsWith("/update-branch"))).toHaveLength(1);

    // ---- #39's checks run on the fix and pass: Shippy checks himself and follows up first, once.
    await f.tick();
    expect(f.data.get(`fixesPr:${ISSUE}`)).toMatchObject({ confirmed: true });
    const win = f.deck()[0];
    expect(win).toMatchObject({ id: `win:fix:${RED_PR}`, title: "That's fixed", why: `Shippy checked again: #${RED_PR} passes its checks now, with the fix from #${FIX_PR}.` });
    expect(win.options.map(o => o.label)).toEqual(["Nice", "Hide"]);
    expect(f.deck().filter(m => m.id.startsWith("win:"))).toHaveLength(1);
    await f.tick();
    expect(f.deck().filter(m => m.id.startsWith("win:"))).toHaveLength(1);

    // ---- Nice: it goes away and stays gone.
    await f.send({ type: "choose_move", moveId: win.id, optionId: "continue" });
    expect(f.deck().some(m => m.id.startsWith("win:"))).toBe(false);
    await f.tick();
    expect(f.deck().some(m => m.id.startsWith("win:"))).toBe(false);

    // ---- The whole story wrote exactly this to GitHub, in order.
    expect(f.gh.writes.filter(w => !w.path.endsWith("/access_tokens")).map(w => `${w.method} ${w.path}`)).toEqual([
      `POST /repos/${REPO}/issues`,
      `POST /repos/${REPO}/issues/${ISSUE}/comments`,
      `POST /repos/${REPO}/pulls`,
      `POST /repos/${REPO}/issues/${FIX_PR}/comments`,
      `PUT /repos/${REPO}/pulls/${FIX_PR}/merge`,
      `PUT /repos/${REPO}/pulls/${RED_PR}/update-branch`,
    ]);
    expect(f.gh.unexpected).toEqual([]);
  });

  it("a push after Ship it was offered: no merge of the new head; it goes back through Checks", async () => {
    const f = await fixture();
    const { launch } = await driveToGate(f);
    expect(launch.options[0].actions[0].args.headSha).toBe(FIX_HEAD);
    // Someone pushes to the PR branch after the player saw Ship it (no webhook has arrived yet).
    f.gh.push(f.item()!.branch!, PUSHED_LATER);
    f.gh.checks.set(PUSHED_LATER, "success");
    await f.send({ type: "choose_move", moveId: launch.id, optionId: "launch" });
    expect(f.merges()).toEqual([]);
    expect(f.gh.pulls.get(FIX_PR)!.merged).toBe(false);
    expect(f.item()).toMatchObject({ state: "inspecting", machineId: "ci-1", inspection: { headSha: PUSHED_LATER, humanApproved: false } });
    expect(f.logs()).toContain("The PR changed after its checks ran. It goes back through the gauntlet.");
    // The old card can't be replayed against the new head.
    expect(f.card(m => m.id === launch.id)).toBeUndefined();
    await f.send({ type: "choose_move", moveId: launch.id, optionId: "launch" });
    expect(f.merges()).toEqual([]);
    expect(f.saved().science.red).toBe(0);
    expect(f.gh.unexpected).toEqual([]);
  });

  it("GitHub's branch protection holds the PR at Gate: Ship it merges nothing and the card says it's waiting on GitHub", async () => {
    const f = await fixture();
    const { launch } = await driveToGate(f);
    f.gh.blocked.add(FIX_PR);
    await f.send({ type: "choose_move", moveId: launch.id, optionId: "launch" });
    expect(f.merges()).toEqual([]);
    expect(f.gh.pulls.get(FIX_PR)!.merged).toBe(false);
    expect(f.item()).toMatchObject({ state: "on_pad", inspection: { headSha: FIX_HEAD, humanApproved: false } });
    expect(f.logs()).toContain("Current checks: Waiting for GitHub's required checks, reviews or repository rules.");
    const waiting = f.card(m => m.stage === "pad" && m.itemId === `gh-${ISSUE}`)!;
    expect(waiting).toMatchObject({ kind: "unblock", title: `PR #${FIX_PR} is waiting on GitHub` });
    expect(waiting.options.map(o => o.id)).toEqual(["later"]);
    expect(f.saved().science.red).toBe(0);
    expect(f.gh.unexpected).toEqual([]);
  });

  it("checks go red at Gate: Ship it merges nothing and the PR goes back for repair", async () => {
    const f = await fixture();
    const { launch } = await driveToGate(f);
    f.gh.checks.set(FIX_HEAD, "failure");
    await f.send({ type: "choose_move", moveId: launch.id, optionId: "launch" });
    expect(f.merges()).toEqual([]);
    expect(f.item()).toMatchObject({ state: "rejected" });
    expect(f.item()!.inspection!.stages.find(s => s.gate === "ci")?.state).toBe("rework");
    expect(f.item()!.scars?.at(-1)).toMatchObject({ station: "ci" });
    expect(f.logs()).toContain("Current checks have not passed. The PR is back at CI.");
    expect(f.stations().checks).toBe("stuck");
    await f.tick();
    expect(f.merges()).toEqual([]);
    expect(f.card(m => m.stage === "pad" && m.kind === "ship" && !m.locked)).toBeUndefined();
    expect(f.saved().science.red).toBe(0);
    expect(f.gh.writes.filter(w => w.path.endsWith("/update-branch"))).toEqual([]);
    expect(f.gh.unexpected).toEqual([]);
  });

  it("red CI on the PR head never reaches Gate: no Launch card, no merge", async () => {
    const f = await fixture();
    await f.tick();
    await f.send({ type: "choose_move", moveId: `unlock:${red.id}`, optionId: "continue" });
    await f.tick();
    const job = f.jobs()[0];
    await f.send({ type: "choose_move", moveId: job.approvalMoveId, optionId: "approve" });
    const claimed = (await f.factory.claimRunner("pair", ["codex"]))!;
    f.gh.push(claimed.branch, FIX_HEAD);
    f.gh.checks.set(FIX_HEAD, "failure");
    await f.factory.finishRunner("pair", { jobId: job.id, lease: claimed.lease!, ok: true, sha: FIX_HEAD, summary: "done", checks: ["typecheck", "test", "build"] });
    await f.factory.onCheckSuite([FIX_PR], false, "red", FIX_HEAD);
    await f.tick(); await f.tick();
    expect(f.item()).toMatchObject({ state: "rejected", prNumber: FIX_PR });
    expect(f.item()!.inspection!.stages.find(s => s.gate === "ci")?.state).toBe("rework");
    expect(f.item()!.inspection!.stages.find(s => s.gate === "ai")?.state).toBe("pending"); // Review never ran on red
    expect(f.gh.spark).not.toContain("review");
    expect(f.card(m => m.stage === "pad" && m.kind === "ship")).toBeUndefined();
    expect(f.merges()).toEqual([]);
    expect(f.stations().checks).toBe("stuck");
    expect(f.gh.unexpected).toEqual([]);
  });
});
