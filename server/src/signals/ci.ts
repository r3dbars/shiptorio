// CI collector for the bottleneck brain (docs/BRAIN.md). Reads GitHub Actions runs on the player's repo and
// says, in one plain line each, when CI is what's holding ships back: main is red, CI is slow, tests only
// pass on retry, runs sit in the queue, or one check keeps blocking open PRs. No model calls.
// One API call per read (the last 100 runs), cached so the Factory alarm can ask every tick.

import { signalId, type BrainSignal, type Evidence, type SignalCollector } from "@shiptorio/shared";
import { gh } from "../github";
import { OutboundError } from "../reliability";
import { RateLimitError } from "../rate-limit";
import { log } from "../telemetry";

/** The fields we use from GET /repos/{repo}/actions/runs. */
export interface WorkflowRun {
  id: number;
  name?: string | null;
  workflow_id?: number;
  head_branch?: string | null;
  head_sha: string;
  event?: string;
  status?: string | null;
  conclusion?: string | null;
  run_attempt?: number;
  run_started_at?: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  pull_requests?: { number: number }[] | null;
}

// Documented thresholds. Tuned so a healthy small repo stays quiet.
export const POLL_MS = 10 * 60 * 1000;
export const FRESH_MS = 30 * 60 * 1000; // a read counts this long without a fresh one
export const WINDOW_MS = 7 * 86400000;
export const PAGE = 100;
export const SLOW_MS = 15 * 60 * 1000; // median green run over this = slow
export const SLOWER_RATIO = 1.5; // recent median 1.5x the older one = getting slower...
export const SLOWER_MIN_MS = 8 * 60 * 1000; // ...if it's also over 8 min
export const MIN_RUNS = 5; // per workflow, before we judge speed or flakiness
export const FLAKY_MIN = 2; // at least this many pass-on-retry runs...
export const FLAKY_RATE = 0.1; // ...and at least 10% of finished runs
export const QUEUE_COUNT = 3; // this many waiting runs...
export const QUEUE_WAIT_MS = 10 * 60 * 1000; // ...with the oldest past 10 min
export const QUEUE_STUCK_MS = 30 * 60 * 1000; // or any one run waiting this long
export const BLOCKING_LOOKBACK_MS = 3 * 86400000;
export const MIN_REFETCH_MS = 60 * 1000; // a burst of check webhooks still costs one call a minute

const FAILED = new Set(["failure", "timed_out", "startup_failure"]);
const WAITING = new Set(["queued", "waiting", "pending", "requested"]);
const MIN = 60000;

const workflowOf = (run: WorkflowRun) => (run.name || `workflow ${run.workflow_id ?? "?"}`).slice(0, 80);
const started = (run: WorkflowRun) => Date.parse(run.run_started_at ?? run.created_at);
const durationMs = (run: WorkflowRun) => Math.max(0, Date.parse(run.updated_at) - started(run));
const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const mins = (ms: number) => Math.round(ms / MIN);
export function minutes(ms: number): string {
  if (ms < 90 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  const h = ms / 3_600_000;
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) { const k = key(row); out.set(k, [...(out.get(k) ?? []), row]); }
  return out;
}
const actionsUrl = (repo: string) => `https://github.com/${repo}/actions`;

export interface DeriveOptions {
  repo: string;
  defaultBranch: string;
  /** When the runs were read. Signals are observed then, not when they're derived. */
  observedAt: number;
  /** Open PR numbers, when the caller knows them. Without it, recent PR runs count as open. */
  openPrs?: readonly number[];
}

export function deriveCiSignals(runs: readonly WorkflowRun[], { repo, defaultBranch, observedAt: now, openPrs }: DeriveOptions): BrainSignal[] {
  const base = { source: "ci" as const, observedAt: now, freshUntil: now + FRESH_MS };
  const recent = runs.filter((r) => Number.isFinite(Date.parse(r.created_at)) && now - Date.parse(r.created_at) <= WINDOW_MS)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)); // newest first
  if (!recent.length) {
    return [{
      ...base, id: signalId("ci", "ci_missing"), kind: "ci_missing", severity: 0.45, confidence: 1,
      title: "No CI ran on this repo in the last week. Nothing checks a PR before it ships.",
      evidence: [{ label: "GitHub Actions", url: actionsUrl(repo) }],
    }];
  }
  // A full page can't see the whole week, so speed and flakiness are a sample.
  const sampled = runs.length >= PAGE ? 0.8 : 1;
  const done = recent.filter((r) => r.status === "completed");
  const signals: BrainSignal[] = [];

  // Red main: the newest finished run of a workflow on the default branch failed.
  for (const [workflow, list] of groupBy(done.filter((r) => r.head_branch === defaultBranch && r.event !== "pull_request"), workflowOf)) {
    if (!FAILED.has(list[0].conclusion ?? "")) continue;
    const green = list.findIndex((r) => r.conclusion === "success");
    const streak = green === -1 ? list.length : green;
    const redFor = now - Date.parse(list[streak - 1].created_at);
    const evidence: Evidence[] = [{ label: "Latest failing run", url: list[0].html_url }];
    if (green !== -1) evidence.push({ label: "Last green run", url: list[green].html_url });
    signals.push({
      ...base, id: signalId("ci", "ci_red_main", workflow), kind: "ci_red_main", scope: workflow, confidence: 1,
      title: `Main is red: "${workflow}" failed ${streak === 1 ? "its last run" : `${streak} runs in a row`}, for ${minutes(redFor)}. Nothing on top of it is safe to ship.`.slice(0, 160),
      severity: clamp(0.75 + Math.min(0.25, redFor / (24 * 3_600_000) * 0.25)),
      metric: { value: streak, unit: "runs" }, evidence,
    });
  }

  for (const [workflow, list] of groupBy(done, workflowOf)) {
    // Slow CI: typical green run takes too long, or got a lot slower this week.
    const green = list.filter((r) => r.conclusion === "success");
    if (green.length >= MIN_RUNS) {
      const typical = median(green.map(durationMs));
      const half = Math.floor(green.length / 2);
      const newer = median(green.slice(0, half).map(durationMs)), older = median(green.slice(half).map(durationMs));
      const slower = half >= 3 && newer >= older * SLOWER_RATIO && newer >= SLOWER_MIN_MS;
      if (typical >= SLOW_MS || slower) {
        const slowest = green.reduce((a, b) => durationMs(b) > durationMs(a) ? b : a);
        signals.push({
          ...base, id: signalId("ci", "ci_slow", workflow), kind: "ci_slow", scope: workflow, confidence: sampled,
          title: (slower
            ? `"${workflow}" got slower: ${minutes(newer)} a run now, up from ${minutes(older)}. Every PR waits that long to ship.`
            : `"${workflow}" takes ${minutes(typical)} on a typical run. Every PR waits that long to ship.`).slice(0, 160),
          severity: clamp(0.3 + Math.min(0.4, (slower ? newer : typical) / (60 * MIN) * 0.4)),
          metric: slower ? { value: mins(newer), baseline: mins(older), unit: "min" } : { value: mins(typical), unit: "min" },
          evidence: [{ label: `Slowest green run (${minutes(durationMs(slowest))})`, url: slowest.html_url }],
        });
      }
    }

    // Flaky: passed only on a retry, or the same commit both failed and passed.
    if (list.length >= MIN_RUNS) {
      const retried = list.filter((r) => r.conclusion === "success" && (r.run_attempt ?? 1) > 1);
      const flipped = [...groupBy(list, (r) => r.head_sha).values()]
        .filter((same) => same.some((r) => r.conclusion === "success") && same.some((r) => FAILED.has(r.conclusion ?? "")))
        .map((same) => same.find((r) => r.conclusion === "success")!);
      const flaky = [...new Map([...retried, ...flipped].map((r) => [r.head_sha, r])).values()];
      const rate = flaky.length / list.length;
      if (flaky.length >= FLAKY_MIN && rate >= FLAKY_RATE) {
        signals.push({
          ...base, id: signalId("ci", "ci_flaky", workflow), kind: "ci_flaky", scope: workflow, confidence: sampled,
          title: `"${workflow}" passed only on a retry ${flaky.length} of the last ${list.length} runs. Something in it is flaky.`.slice(0, 160),
          severity: clamp(0.35 + rate * 0.6),
          metric: { value: Math.round(rate * 100), unit: "%" },
          evidence: flaky.slice(0, 3).map((r) => ({ label: `Passed on retry (${r.head_sha.slice(0, 7)})`, url: r.html_url })),
        });
      }
    }
  }

  // Queue backlog: runs that haven't started. Usually runner shortage, concurrency limits or billing.
  const waiting = recent.filter((r) => WAITING.has(r.status ?? ""));
  if (waiting.length) {
    const oldest = waiting.reduce((a, b) => Date.parse(b.created_at) < Date.parse(a.created_at) ? b : a);
    const waitMs = now - Date.parse(oldest.created_at);
    if ((waiting.length >= QUEUE_COUNT && waitMs >= QUEUE_WAIT_MS) || waitMs >= QUEUE_STUCK_MS) {
      signals.push({
        ...base, id: signalId("ci", "ci_queue"), kind: "ci_queue", confidence: 1,
        title: `${waiting.length} CI ${waiting.length === 1 ? "run is" : "runs are"} stuck waiting for a runner. The oldest has waited ${minutes(waitMs)}.`,
        severity: clamp(0.4 + Math.min(0.5, waitMs / (2 * 3_600_000) * 0.5)),
        metric: { value: mins(waitMs), unit: "min" },
        evidence: [{ label: "Oldest waiting run", url: oldest.html_url }],
      });
    }
  }

  // Blocking check: the newest run of a workflow on an open PR failed. Grouped by workflow,
  // so "Lint is failing on 3 PRs" is one signal, not three.
  const open = openPrs && new Set(openPrs);
  const latest = new Map<string, { workflow: string; pr: number; run: WorkflowRun }>();
  for (const run of done) {
    if (now - Date.parse(run.created_at) > BLOCKING_LOOKBACK_MS) continue;
    for (const { number: pr } of run.pull_requests ?? []) {
      if (open && !open.has(pr)) continue;
      const key = `${workflowOf(run)}\n${pr}`;
      if (!latest.has(key)) latest.set(key, { workflow: workflowOf(run), pr, run });
    }
  }
  const blocked = groupBy([...latest.values()].filter((b) => FAILED.has(b.run.conclusion ?? "")), (b) => b.workflow);
  for (const [workflow, list] of blocked) {
    list.sort((a, b) => a.pr - b.pr);
    const shown = list.slice(0, 3).map((b) => `#${b.pr}`).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : "");
    signals.push({
      ...base, id: signalId("ci", "ci_blocking", workflow), kind: "ci_blocking", scope: workflow, confidence: open ? 1 : 0.8,
      title: (list.length === 1
        ? `"${workflow}" is failing on ${shown}, so it can't ship.`
        : `"${workflow}" is failing on ${list.length} open PRs (${shown}). One fix could unblock all of them.`).slice(0, 160),
      // A red check stops a finished PR from shipping, so even one outweighs a growing backlog.
      severity: clamp(0.7 + Math.min(0.2, (list.length - 1) * 0.1)),
      metric: { value: list.length, unit: "PRs" },
      evidence: list.slice(0, 3).map((b) => ({ label: `Failing on #${b.pr}`, url: b.run.html_url })),
    });
  }

  return signals.sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
}

/** Where the cached runs live. DurableObjectStorage fits as is. */
export interface CiCache {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
/** at = when runs were read, triedAt = last fetch attempt. runs null = never read. denied = no Actions access. */
interface CiSnapshot { at: number; triedAt: number; runs: WorkflowRun[] | null; denied?: boolean; dirty?: boolean; fromChecks?: boolean; openPrs?: number[] }
const cacheKey = (repo: string) => `ci:runs:v1:${repo}`;

/** KV-backed cache (the Worker's CACHE binding), with a per-isolate map when there's no binding. */
const local = new Map<string, unknown>();
export function kvCiCache(kv: KVNamespace | undefined): CiCache {
  return {
    get: async <T>(key: string) => (kv ? await kv.get<T>(key, "json") ?? undefined : local.get(key) as T | undefined),
    put: async <T>(key: string, value: T) => { if (kv) await kv.put(key, JSON.stringify(value), { expirationTtl: 86400 }); else local.set(key, value); },
  };
}

export interface CiContext {
  repo: string;
  defaultBranch: string;
  /** GitHub App installation token. Missing = not connected. */
  token?: string;
  cache: CiCache;
  openPrs?: readonly number[];
  /** A forced look: read GitHub again unless the snapshot is under 15s old. */
  force?: boolean;
  /** Test seam. Defaults to the GitHub App installation client. */
  fetchRuns?: (repo: string, token: string, sinceIso: string) => Promise<WorkflowRun[]>;
  /** Test seam for the open PR numbers read alongside Actions runs. */
  fetchOpenPrs?: (repo: string, token: string) => Promise<number[]>;
  /** Test seam for the fallback when the App can't read Actions. Defaults to check runs (checks: read). */
  fetchChecks?: (repo: string, token: string, defaultBranch: string) => Promise<WorkflowRun[]>;
}

export async function fetchRuns(repo: string, token: string, sinceIso: string): Promise<WorkflowRun[]> {
  const res = await gh<{ workflow_runs?: WorkflowRun[] }>(`/repos/${repo}/actions/runs?per_page=${PAGE}&created=%3E%3D${sinceIso.slice(0, 10)}`, token);
  return (res.workflow_runs ?? []).map((r) => ({
    id: r.id, name: r.name, workflow_id: r.workflow_id, head_branch: r.head_branch, head_sha: r.head_sha, event: r.event,
    status: r.status, conclusion: r.conclusion, run_attempt: r.run_attempt, run_started_at: r.run_started_at,
    created_at: r.created_at, updated_at: r.updated_at, html_url: r.html_url,
    pull_requests: (r.pull_requests ?? []).map((p) => ({ number: p.number })),
  }));
}

/** Our GitHub App asks for checks: read, not Actions, so /actions/runs is a 403 on a real install. Check runs on the
 * open PRs' heads and on the default branch say the same things that matter most (red main, a check blocking PRs),
 * shaped as runs so one derive serves both. Found by the real-loop proof: a red PR never reached Shippy. */
/** A forced look reads every source at once and they share the install's one-a-second GitHub slot, so this second
 * call often lands behind a queue and gets RateLimitError. Wait out a short one rather than drop to 0.8 confidence. */
async function openPrsOf(ctx: CiContext, repo: string, token: string): Promise<number[] | undefined> {
  const read = ctx.fetchOpenPrs ?? (ctx.fetchRuns ? undefined : fetchOpenPrs);
  for (let attempt = 0; read && attempt < 3; attempt++) {
    try { return await read(repo, token); } catch (error) {
      const wait = error instanceof RateLimitError ? error.retryAt - Date.now() : Infinity;
      if (attempt === 2 || wait > 15_000) { log("warn", "ci.open_prs_failed", { repo, error: String(error).slice(0, 200) }); return undefined; }
      await new Promise(r => setTimeout(r, Math.max(250, wait)));
    }
  }
  return undefined;
}

export async function fetchOpenPrs(repo: string, token: string): Promise<number[]> {
  return (await gh<{ number: number }[]>(`/repos/${repo}/pulls?state=open&per_page=100`, token)).map(p => p.number);
}

export async function fetchCheckRuns(repo: string, token: string, defaultBranch: string): Promise<WorkflowRun[]> {
  type CheckRun = { id: number; name: string; head_sha: string; status: string; conclusion: string | null; started_at: string | null; completed_at: string | null; html_url: string };
  const checks = async (ref: string) => (await gh<{ check_runs?: CheckRun[] }>(`/repos/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=50`, token)).check_runs ?? [];
  const asRun = (c: CheckRun, branch: string, event: string, prs: { number: number }[]): WorkflowRun => ({
    id: c.id, name: c.name, head_branch: branch, head_sha: c.head_sha, event, status: c.status, conclusion: c.conclusion,
    run_started_at: c.started_at ?? undefined, created_at: c.started_at ?? c.completed_at ?? new Date(0).toISOString(),
    updated_at: c.completed_at ?? c.started_at ?? new Date(0).toISOString(), html_url: c.html_url, pull_requests: prs,
  });
  const pulls = await gh<{ number: number; head: { sha: string; ref: string } }[]>(`/repos/${repo}/pulls?state=open&per_page=10&sort=updated&direction=desc`, token);
  // One at a time: GitHub calls share a one-a-second slot per install and a burst past it throws RateLimitError,
  // which used to drop every PR's checks. One ref failing to load mustn't hide the others' red ones.
  const out: WorkflowRun[] = [];
  for (const [ref, branch, event, prs] of [[defaultBranch, defaultBranch, "push", []] as const, ...pulls.map(p => [p.head.sha, p.head.ref, "pull_request", [{ number: p.number }]] as const)]) {
    try { out.push(...(await checks(ref)).map(c => asRun(c, branch, event, [...prs]))); } catch { /* skip this ref */ }
  }
  return out;
}

function cantRead(repo: string, now: number): BrainSignal {
  return {
    id: signalId("ci", "ci_missing"), source: "ci", kind: "ci_missing", severity: 0.35, confidence: 0.6,
    title: "Shiptorio can't read this repo's CI runs yet, so it can't tell when CI slows you down.",
    evidence: [{ label: "GitHub Actions", url: actionsUrl(repo) }],
    observedAt: now, freshUntil: now + FRESH_MS,
  };
}

/**
 * Hits GitHub at most once per POLL_MS (or a minute after markCiDirty), and derives from the cached runs
 * otherwise. A failed fetch keeps the last runs and backs off a full poll. Never throws: no token, or an
 * App without Actions read access (403/404), is a ci_missing signal.
 */
export async function readCiSignals(ctx: CiContext, now: number): Promise<BrainSignal[]> {
  const { repo, token, cache } = ctx;
  if (!token) return [cantRead(repo, now)];
  let snapshot = await cache.get<CiSnapshot>(cacheKey(repo));
  const age = snapshot ? now - snapshot.triedAt : Infinity;
  if (!snapshot || age >= POLL_MS || (ctx.force && age >= 15_000) || (snapshot.dirty && age >= MIN_REFETCH_MS)) {
    const checks = () => (ctx.fetchChecks ?? fetchCheckRuns)(repo, token, ctx.defaultBranch);
    try {
      // Once Actions said no, go straight to check runs: asking again costs a call and can fail other ways.
      snapshot = snapshot?.fromChecks
        ? { at: now, triedAt: now, runs: await checks(), fromChecks: true }
        : { at: now, triedAt: now, runs: await (ctx.fetchRuns ?? fetchRuns)(repo, token, new Date(now - WINDOW_MS).toISOString()),
          // Which PRs are still open, so a red one counts at full confidence. One call; unknown on a failure.
          openPrs: ctx.openPrs ? undefined : await openPrsOf(ctx, repo, token) };
    } catch (error) {
      const denied = !snapshot?.fromChecks && error instanceof OutboundError && (error.status === 403 || error.status === 404);
      // No Actions access: fall back to check runs. Otherwise keep the old runs (they age out on freshUntil) and
      // don't retry until the next poll.
      const fresh = denied ? await checks().catch(() => null) : null;
      snapshot = fresh ? { at: now, triedAt: now, runs: fresh, fromChecks: true } : denied ? { at: now, triedAt: now, runs: null, denied }
        : { at: snapshot?.at ?? now, triedAt: now, runs: snapshot?.runs ?? null, fromChecks: snapshot?.fromChecks };
    }
    await cache.put(cacheKey(repo), snapshot);
  }
  if (snapshot.denied) return [cantRead(repo, snapshot.at)];
  if (!snapshot.runs) return [];
  // Check runs are read only on open PRs' heads, so every PR they name is open.
  const openPrs = ctx.openPrs ?? snapshot.openPrs ?? (snapshot.fromChecks ? [...new Set(snapshot.runs.flatMap(r => r.pull_requests?.map(p => p.number) ?? []))] : undefined);
  return deriveCiSignals(snapshot.runs, { repo, defaultBranch: ctx.defaultBranch, observedAt: snapshot.at, openPrs });
}

export const ciCollector: SignalCollector<CiContext> = { source: "ci", everyMs: POLL_MS, read: readCiSignals };

/** Call on check_suite / check_run webhooks so the next read refetches. */
export async function markCiDirty(cache: CiCache, repo: string): Promise<void> {
  const snapshot = await cache.get<CiSnapshot>(cacheKey(repo));
  if (snapshot && !snapshot.dirty) await cache.put(cacheKey(repo), { ...snapshot, dirty: true });
}
