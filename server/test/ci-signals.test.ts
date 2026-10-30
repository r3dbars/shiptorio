import { describe, expect, it } from "bun:test";
import { BrainSignal, SIGNAL_KINDS, freshSignals } from "@shiptorio/shared";
import clogged from "./fixtures/ci/clogged-runs.json";
import healthy from "./fixtures/ci/healthy-runs.json";
import { GitHubError } from "../src/github";
import { ciCollector, deriveCiSignals, markCiDirty, minutes, POLL_MS, type CiCache, type CiContext, type WorkflowRun } from "../src/signals/ci";

const now = Date.parse("2026-10-27T18:00:00Z");
const repo = "acme/shop";
const cloggedRuns = clogged.workflow_runs as WorkflowRun[];
const healthyRuns = healthy.workflow_runs as WorkflowRun[];
const derive = (runs: WorkflowRun[], openPrs?: number[]) => deriveCiSignals(runs, { repo, defaultBranch: "main", observedAt: now, openPrs });
const byKind = (runs: WorkflowRun[], openPrs?: number[]) => Object.fromEntries(derive(runs, openPrs).map((s) => [s.kind, s]));
const memoryCache = (): CiCache => {
  const store = new Map<string, unknown>();
  return { get: async <T>(k: string) => structuredClone(store.get(k)) as T | undefined, put: async (k, v) => { store.set(k, structuredClone(v)); } };
};
const run = (overrides: Partial<WorkflowRun>): WorkflowRun => ({ id: 1, name: "CI", head_branch: "main", head_sha: "a".repeat(40), event: "push", status: "completed", conclusion: "success", run_attempt: 1, created_at: "2026-10-27T17:00:00Z", updated_at: "2026-10-27T17:05:00Z", html_url: "https://github.com/acme/shop/actions/runs/1", ...overrides });

describe("CI collector: what it sees", () => {
  it("stays quiet on a healthy repo", () => {
    expect(derive(healthyRuns)).toEqual([]);
  });

  it("finds every way CI clogs the pipeline, each a valid BrainSignal with evidence", () => {
    const signals = derive(cloggedRuns);
    expect(signals.map((s) => s.kind).sort()).toEqual(["ci_blocking", "ci_flaky", "ci_queue", "ci_red_main", "ci_slow"]);
    for (const s of signals) {
      expect(BrainSignal.parse(s)).toEqual(s);
      expect(SIGNAL_KINDS.ci).toContain(s.kind);
      expect(s.title).not.toContain("\n");
      expect(s.id).toBe(`ci:${s.kind}:${s.scope ?? "repo"}`);
      expect(s.freshUntil).toBeGreaterThan(s.observedAt);
      for (const e of s.evidence) expect(e.url).toStartWith("https://github.com/acme/shop/actions/runs/");
    }
    expect(freshSignals(signals, now)[0].kind).toBe("ci_red_main"); // worst first
  });

  it("red main: counts the failing streak and links the last green run", () => {
    const red = byKind(cloggedRuns).ci_red_main;
    expect(red.id).toBe("ci:ci_red_main:CI");
    expect(red.metric).toEqual({ value: 3, unit: "runs" });
    expect(red.title).toBe('Main is red: "CI" failed 3 runs in a row, for 5 h. Nothing on top of it is safe to ship.');
    expect(red.evidence.map((e) => e.label)).toEqual(["Latest failing run", "Last green run"]);
    // A Deploy failure ten days ago is outside the window, so it never shows up.
    expect(derive(cloggedRuns).some((s) => s.scope === "Deploy")).toBe(false);
  });

  it("red main clears once main goes green again", () => {
    const fixed = [run({ id: 9, created_at: "2026-10-27T17:50:00Z", updated_at: "2026-10-27T17:55:00Z" }), ...cloggedRuns];
    expect(byKind(fixed).ci_red_main).toBeUndefined();
  });

  it("slow: median green run over 15 minutes", () => {
    const slow = byKind(cloggedRuns).ci_slow;
    expect(slow.scope).toBe("CI");
    expect(slow.metric!.value).toBeGreaterThanOrEqual(15);
    expect(slow.title).toMatch(/^"CI" takes 2\d min on a typical run\./);
  });

  it("slow: also flags a workflow that got much slower, even under the hard limit", () => {
    const at = (minAgo: number, dur: number, i: number) => run({ id: i, head_sha: String(i).padEnd(40, "0"), created_at: new Date(now - minAgo * 60000).toISOString(), updated_at: new Date(now - minAgo * 60000 + dur * 60000).toISOString() });
    const runs = [...[9, 10, 11].map((d, i) => at(60 + i * 60, d, i)), ...[4, 4, 5].map((d, i) => at(600 + i * 60, d, 10 + i))];
    const slow = byKind(runs).ci_slow;
    expect(slow.title).toBe('"CI" got slower: 10 min a run now, up from 4 min. Every PR waits that long to ship.');
    expect(slow.metric).toEqual({ value: 10, baseline: 4, unit: "min" });
  });

  it("flaky: runs that only passed on a retry", () => {
    const flaky = byKind(cloggedRuns).ci_flaky;
    expect(flaky.metric).toEqual({ value: 25, unit: "%" });
    expect(flaky.evidence).toHaveLength(3);
    expect(flaky.title).toBe('"CI" passed only on a retry 3 of the last 12 runs. Something in it is flaky.');
  });

  it("flaky: the same commit failing then passing counts too", () => {
    const sha = "f".repeat(40);
    const runs = [run({ id: 1, head_sha: sha }), run({ id: 2, head_sha: sha, conclusion: "failure" }), run({ id: 3, head_sha: "e".repeat(40) }), run({ id: 4, head_sha: "d".repeat(40), run_attempt: 3 }), run({ id: 5, head_sha: "c".repeat(40) })];
    expect(byKind(runs.map((r) => ({ ...r, head_branch: "feature" }))).ci_flaky.metric!.value).toBe(40);
  });

  it("queue: several runs waiting past ten minutes, or one stuck past thirty", () => {
    const queue = byKind(cloggedRuns).ci_queue;
    expect(queue.id).toBe("ci:ci_queue:repo");
    expect(queue.metric).toEqual({ value: 25, unit: "min" });
    expect(queue.title).toBe("4 CI runs are stuck waiting for a runner. The oldest has waited 25 min.");
    const queued = (minAgo: number) => run({ status: "queued", conclusion: null, created_at: new Date(now - minAgo * 60000).toISOString() });
    expect(byKind([queued(5)]).ci_queue).toBeUndefined(); // normal
    expect(byKind([queued(40)]).ci_queue.title).toBe("1 CI run is stuck waiting for a runner. The oldest has waited 40 min.");
  });

  it("blocking: groups open PRs by the workflow failing on them, using each PR's newest run", () => {
    const all = byKind(cloggedRuns).ci_blocking;
    expect(all.metric!.value).toBe(4); // without open PRs known, closed #60 counts, at lower confidence
    expect(all.confidence).toBe(0.8);
    const open = byKind(cloggedRuns, [50, 51, 52]).ci_blocking;
    expect(open.id).toBe("ci:ci_blocking:Lint");
    expect(open.confidence).toBe(1);
    expect(open.title).toBe('"Lint" is failing on 3 open PRs (#50, #51, #52). One fix could unblock all of them.');
    expect(open.evidence.map((e) => e.label)).toEqual(["Failing on #50", "Failing on #51", "Failing on #52"]);
    expect(byKind(healthyRuns).ci_blocking).toBeUndefined(); // #98 failed, then went green
  });

  it("no CI at all is a ci_missing signal, not silence", () => {
    const [missing] = derive([]);
    expect(missing.kind).toBe("ci_missing");
    expect(missing.evidence[0].url).toBe("https://github.com/acme/shop/actions");
  });

  it("ids are stable across reads so the brain can tell new from still-true", () => {
    const later = deriveCiSignals(cloggedRuns, { repo, defaultBranch: "main", observedAt: now + 60000 }).map((s) => s.id).sort();
    expect(later).toEqual(derive(cloggedRuns).map((s) => s.id).sort());
  });

  it("formats waits in plain words", () => {
    expect([30_000, 25 * 60000, 5 * 3_600_000, 3 * 86_400_000].map(minutes)).toEqual(["1 min", "25 min", "5 h", "3 days"]);
  });
});

describe("CI collector: reading cheaply", () => {
  const ctx = (over: Partial<CiContext>): CiContext => ({ repo, defaultBranch: "main", token: "t", cache: memoryCache(), ...over });

  it("is a SignalCollector for the ci source", () => {
    expect(ciCollector.source).toBe("ci");
    expect(ciCollector.everyMs).toBe(POLL_MS);
  });

  it("calls GitHub once per poll and serves the cache in between", async () => {
    let calls = 0;
    const c = ctx({ fetchRuns: async (r, _t, since) => { calls++; expect(r).toBe(repo); expect(since).toBe("2026-10-20T18:00:00.000Z"); return cloggedRuns; } });
    expect((await ciCollector.read(c, now)).length).toBe(5);
    const cached = await ciCollector.read(c, now + 60000);
    expect(calls).toBe(1);
    expect(cached[0].observedAt).toBe(now); // observed when read, not when served
    await ciCollector.read(c, now + POLL_MS);
    expect(calls).toBe(2);
  });

  it("a check webhook makes the next read refetch, but a burst still costs one call a minute", async () => {
    let calls = 0;
    const c = ctx({ fetchRuns: async () => { calls++; return healthyRuns; } });
    await ciCollector.read(c, now);
    await markCiDirty(c.cache, repo);
    await ciCollector.read(c, now + 10_000);
    expect(calls).toBe(1);
    await ciCollector.read(c, now + 61_000);
    expect(calls).toBe(2);
  });

  it("keeps the last runs when GitHub hiccups, and backs off a full poll", async () => {
    const c = ctx({ fetchRuns: async () => cloggedRuns });
    await ciCollector.read(c, now);
    let calls = 0;
    c.fetchRuns = async () => { calls++; throw new GitHubError(502, "/x", "GET"); };
    const stale = await ciCollector.read(c, now + POLL_MS);
    expect(stale.length).toBe(5);
    expect(stale[0].observedAt).toBe(now);
    await ciCollector.read(c, now + POLL_MS + 60000);
    expect(calls).toBe(1);
    // A first read that fails says nothing rather than guessing.
    expect(await ciCollector.read(ctx({ fetchRuns: c.fetchRuns }), now)).toEqual([]);
  });

  it("never throws for not connected: no token or no Actions access is ci_missing", async () => {
    expect((await ciCollector.read(ctx({ token: undefined }), now)).map((s) => s.kind)).toEqual(["ci_missing"]);
    const denied = await ciCollector.read(ctx({ fetchRuns: async () => { throw new GitHubError(403, "/x", "GET"); }, fetchChecks: async () => { throw new GitHubError(403, "/y", "GET"); } }), now);
    expect(denied.map((s) => s.kind)).toEqual(["ci_missing"]);
    expect(denied[0].title).toContain("can't read");
  });

  it("without Actions access, check runs on open PRs still show a check blocking a PR", async () => {
    const failing = { id: 1, name: "check", head_branch: "seed", head_sha: "a".repeat(40), event: "pull_request", status: "completed", conclusion: "failure", created_at: new Date(now - 3_600_000).toISOString(), updated_at: new Date(now - 3_500_000).toISOString(), html_url: "https://github.com/x/y/runs/1", pull_requests: [{ number: 39 }] };
    const signals = await ciCollector.read(ctx({ fetchRuns: async () => { throw new GitHubError(403, "/x", "GET"); }, fetchChecks: async (_r, _t, branch) => { expect(branch).toBe("main"); return [failing]; } }), now);
    expect(signals.map(s => s.kind)).toContain("ci_blocking");
    expect(signals.find(s => s.kind === "ci_blocking")!.title).toContain("#39");
  });
});
