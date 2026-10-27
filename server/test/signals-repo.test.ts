import { beforeEach, describe, expect, it } from "bun:test";
import { BrainSignal, FactoryState, SIGNAL_KINDS, type Item } from "@shiptorio/shared";
import { approveQueueSignal, clearRepoCache, factoryPrNumbers, fetchRepoSnapshot, repoCollector, repoSignals, type PullLite, type RepoSnapshot } from "../src/signals/repo";
import { COLLECTORS } from "../src/signals";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const now = Date.parse("2026-10-27T20:00:00Z");
const iso = (agoMs: number) => new Date(now - agoMs).toISOString();
const pr = (number: number, o: Partial<PullLite> = {}): PullLite => ({ number, title: `PR ${number}`, html_url: `https://github.com/acme/app/pull/${number}`, created_at: iso(DAY), updated_at: iso(HOUR), user: { login: "dev" }, head: { ref: `b${number}` }, ...o });
const snap = (o: Partial<RepoSnapshot> = {}): RepoSnapshot => ({ repo: "acme/app", defaultBranch: "main", open: [pr(99)], closed: [], branches: [{ name: "main" }], issues: [], fetchedAt: now, ...o });
const issue = (n: number, created: number, closed?: number, o: object = {}) => ({ number: n, title: `Issue ${n}`, html_url: `https://github.com/acme/app/issues/${n}`, created_at: iso(created), closed_at: closed === undefined ? null : iso(closed), state: closed === undefined ? "open" : "closed", labels: [{ name: "bug" }], comments: 1, ...o });
const item = (o: Partial<Item> = {}): Item => ({ id: "i1", kind: "bug", source: "github_issue", title: "Fix crash", district: "/", state: "queued", updatedAt: now - HOUR, attempts: 0, ...o });
const factory = (items: Item[], deck: unknown[] = []) =>
  FactoryState.parse({ repo: "acme/app", baseBranch: "main", districts: [], machines: [], belts: [], power: [], items, deck, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 0 });
const kinds = (s: BrainSignal[]) => s.map(x => x.kind).sort();
// Every signal must pass the shared contract and use a known kind.
const valid = (signals: BrainSignal[]) => { for (const s of signals) { BrainSignal.parse(s); expect(SIGNAL_KINDS[s.source]).toContain(s.kind); } return signals; };

describe("repo signals", () => {
  it("stays quiet on a healthy repo", () => {
    expect(repoSignals(snap({ closed: [pr(2, { merged_at: iso(2 * HOUR), closed_at: iso(2 * HOUR) })] }), { now })).toEqual([]);
  });

  it("flags PRs waiting on the player's review, skipping drafts and factory PRs", () => {
    const open = [
      pr(1, { requested_reviewers: [{ login: "Acme" }], created_at: iso(30 * HOUR) }),
      pr(2, { requested_reviewers: [{ login: "acme" }], draft: true }),
      pr(3, { requested_reviewers: [{ login: "acme" }] }),
      pr(4, { requested_reviewers: [{ login: "someone" }] }),
    ];
    const [s] = valid(repoSignals(snap({ open }), { now, factoryPrs: new Set([3]) }));
    expect(s).toMatchObject({ id: "repo:prs_waiting_on_you:repo", kind: "prs_waiting_on_you", metric: { value: 1, unit: "prs" } });
    expect(s.title).toBe("1 PR is waiting on your review, oldest for 30 h.");
    expect(s.evidence[0].url).toBe("https://github.com/acme/app/pull/1");
  });

  it("uses explicit player logins over the repo owner", () => {
    const open = [pr(1, { requested_reviewers: [{ login: "justin" }] })];
    expect(repoSignals(snap({ open }), { now })).toEqual([]);
    expect(kinds(repoSignals(snap({ open }), { players: ["Justin"], now }))).toEqual(["prs_waiting_on_you"]);
  });

  it("finds stale PRs and orphan branches", () => {
    const open = [pr(1, { updated_at: iso(5 * DAY) }), pr(2, { updated_at: iso(4 * DAY) })];
    const branches = [{ name: "main" }, { name: "b1" }, ...Array.from({ length: 9 }, (_, i) => ({ name: i < 3 ? `shiptorio/runner-${i}` : `old-${i}` }))];
    const out = valid(repoSignals(snap({ open, branches }), { now }));
    expect(kinds(out)).toEqual(["branches_stale", "prs_stale"]);
    expect(out.find(s => s.kind === "prs_stale")!.evidence.map(e => e.label)).toEqual(["#1 PR 1", "#2 PR 2"]);
    expect(out.find(s => s.kind === "branches_stale")!.title).toBe("9 branches have no open PR, 3 left by factory runners.");
  });

  it("measures backlog growth and untriaged asks", () => {
    const issues = [
      ...[1, 2, 3, 4, 5].map(n => issue(n, n * DAY, undefined, n > 2 ? { labels: [], comments: 0 } : {})),
      issue(6, 2 * DAY, DAY), issue(7, 9 * DAY, 8 * DAY),
    ];
    const out = valid(repoSignals(snap({ issues }), { now }));
    const backlog = out.find(x => x.kind === "backlog_growing")!;
    expect(backlog.metric).toEqual({ value: 5, unit: "issues", baseline: 0 });
    expect(backlog.title).toBe("The issue backlog grew by 5 this week: 6 opened, 1 closed.");
    const untriaged = out.find(x => x.kind === "issues_untriaged")!;
    expect(untriaged.metric!.value).toBe(3);
    expect(untriaged.evidence.slice(1).map(e => e.label)).toEqual(["#5 Issue 5", "#4 Issue 4", "#3 Issue 3"]);
  });

  it("measures ask-to-merge from linked issues, and a ship-rate drop", () => {
    const merged = (n: number, mergedAgo: number, openFor: number, body?: string) => pr(n, { merged_at: iso(mergedAgo), closed_at: iso(mergedAgo), created_at: iso(mergedAgo + openFor), body });
    const closed = [
      merged(1, DAY, 2 * HOUR, "Fixes #50"), merged(2, 2 * DAY, 30 * HOUR), merged(3, 3 * DAY, 40 * HOUR),
      ...[10, 11, 12, 13, 13.5, 13.8].map((d, i) => merged(10 + i, d * DAY, 4 * HOUR)),
    ];
    const issues = [issue(50, 4 * DAY, DAY)];
    const out = valid(repoSignals(snap({ closed, issues }), { now }));
    const slow = out.find(x => x.kind === "slow_merge")!;
    expect(slow.metric).toEqual({ value: 40, unit: "hours", baseline: 4 });
    expect(slow.evidence[0].label).toBe("#1 PR 1"); // the linked issue waited 3 days before its 2h PR
    expect(out.find(x => x.kind === "ship_rate_drop")!.metric).toEqual({ value: 3, unit: "prs", baseline: 6 });
  });

  it("counts PRs closed without merging, ignoring dependency bots", () => {
    const closed = [
      ...[1, 2, 3].map(n => pr(n, { closed_at: iso(DAY) })),
      ...[4, 5, 6, 7].map(n => pr(n, { closed_at: iso(DAY), merged_at: iso(DAY) })),
      ...[8, 9, 10].map(n => pr(n, { closed_at: iso(DAY), user: { login: "dependabot[bot]", type: "Bot" } })),
    ];
    const s = valid(repoSignals(snap({ closed }), { now })).find(x => x.kind === "prs_dropped")!;
    expect(s.title).toBe("3 of 7 PRs closed in 14 days never merged.");
    expect(s.evidence).toHaveLength(3);
  });

  it("notices an empty mine", () => {
    expect(kinds(valid(repoSignals(snap({ open: [] }), { now })))).toEqual(["backlog_empty"]);
  });
});

describe("repo collector", () => {
  beforeEach(clearRepoCache);
  const fake = () => {
    const calls: string[] = [];
    const fetchJson = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path === "/repos/acme/app") return { default_branch: "main" } as T;
      if (path.includes("/pulls?state=open")) return [{ ...pr(1, { requested_reviewers: [{ login: "acme" }] }), extra: "dropped" }] as T;
      if (path.includes("/branches")) return [{ name: "main", commit: { sha: "x" } }] as T;
      if (path.includes("/issues")) return [issue(3, DAY), { ...issue(4, DAY), pull_request: {} }] as T;
      return [] as T;
    };
    return { calls, fetchJson };
  };

  it("makes five list calls once, then serves the cache for 15 minutes", async () => {
    const { calls, fetchJson } = fake();
    const first = await fetchRepoSnapshot("t", "acme/app", {}, now, fetchJson);
    expect(calls).toHaveLength(5);
    expect(first.open[0]).not.toHaveProperty("extra");
    expect(first.issues.map(i => i.number)).toEqual([3]);
    await fetchRepoSnapshot("t", "acme/app", {}, now + 10 * MIN, fetchJson);
    expect(calls).toHaveLength(5);
    await fetchRepoSnapshot("t", "acme/app", {}, now + 16 * MIN, fetchJson);
    expect(calls).toHaveLength(9); // default branch comes from the old copy
  });

  it("shares the snapshot across isolates through KV", async () => {
    const store = new Map<string, string>();
    const kv = { get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null), put: async (k: string, v: string) => { store.set(k, v); } } as never;
    const { calls, fetchJson } = fake();
    await fetchRepoSnapshot("t", "acme/app", { CACHE: kv }, now, fetchJson);
    clearRepoCache();
    await fetchRepoSnapshot("t", "acme/app", { CACHE: kv }, now + MIN, fetchJson);
    expect(calls).toHaveLength(5);
  });

  it("says when it can't read, and never throws", async () => {
    expect(valid(await repoCollector.read({}, now)).map(s => [s.kind, s.severity])).toEqual([["repo_missing", 0.5]]);
    const down = await repoCollector.read({ repo: "acme/app", token: async () => "t", fetchJson: async () => { throw new Error("rate limited"); } }, now);
    expect(valid(down).map(s => [s.kind, s.severity])).toEqual([["repo_missing", 0.2]]);
    expect(down[0].title).toBe("Can't read acme/app on GitHub right now.");
  });

  it("reads through the collector with the factory's PRs left out", async () => {
    const { fetchJson } = fake();
    const pending = await repoCollector.read({ repo: "acme/app", token: async () => "t", fetchJson, state: factory([item({ prNumber: 1, state: "inspecting" })]) }, now);
    expect(pending).toEqual([]);
  });
});

describe("approve queue", () => {
  const approveCard = (itemId: string, createdAt: number) => ({ id: `m-${itemId}`, title: `Build #${itemId}: Fix crash`, why: "Review the plan", itemId, stage: "build", kind: "build", createdAt, options: [{ id: "approve", label: "Approve and build", recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId: "j" }, reason: "r" }] }, { id: "decline", label: "Not now", recommended: false, actions: [] }] });
  const items = [
    item({ id: "a", state: "on_pad", updatedAt: now - 2 * HOUR, prNumber: 9, prUrl: "https://github.com/acme/app/pull/9" }),
    item({ id: "b", updatedAt: now - MIN, url: "https://github.com/acme/app/issues/4" }),
    item({ id: "c", state: "queued" }),
  ];

  it("counts plans to approve and rockets to launch, oldest first", () => {
    const s = valid([approveQueueSignal(factory(items, [approveCard("b", now - 3 * HOUR)]), now)!])[0];
    expect(s.title).toBe("2 cards waiting on your OK (1 to approve, 1 to launch), oldest 3 h.");
    expect(s.evidence).toEqual([
      { label: "Build #b: Fix crash (plan to approve)", url: "https://github.com/acme/app/issues/4" },
      { label: "Fix crash (ready to launch)", url: "https://github.com/acme/app/pull/9" },
    ]);
  });

  it("waits 30 minutes before nagging, and ignores ordinary cards", () => {
    expect(approveQueueSignal(factory([item({ state: "on_pad", updatedAt: now - 10 * MIN })]), now)).toBeNull();
    expect(approveQueueSignal(factory([], [{ ...approveCard("b", now - DAY), options: [{ id: "ok", label: "OK", recommended: true, actions: [] }] }]), now)).toBeNull();
  });

  it("still shows when GitHub isn't connected", async () => {
    const out = valid(await repoCollector.read({ state: factory(items) }, now));
    expect(kinds(out)).toEqual(["approve_queue", "repo_missing"]);
  });

  it("is registered in the brain's collector list", () => {
    expect(COLLECTORS.map(c => c.source)).toContain("repo");
  });
});
