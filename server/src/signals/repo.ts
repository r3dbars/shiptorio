/**
 * Repo-flow collector for the bottleneck brain (docs/BRAIN.md): where work gets stuck between "someone asked"
 * and "it merged". PRs waiting on the player's review, PRs and branches nobody touches, an issue backlog that
 * grows faster than it closes, untriaged asks, slow ask → merge time, a drop in ship rate, PRs thrown away, and
 * the player's own Approve queue in the game (plans to approve, rockets to launch).
 *
 * `repoSignals` is pure: snapshot in, BrainSignals out, each with evidence links. `fetchRepoSnapshot` reads that
 * snapshot with five list calls (no per-PR fan-out) and shares it for 15 minutes across isolates through KV, so
 * the brain can ask as often as it likes without touching the App's rate limit. No model calls.
 */
import { signalId, type BrainSignal, type Evidence, type FactoryState, type SignalCollector } from "@shiptorio/shared";
import { gh } from "../github";

export interface PullLite {
  number: number; title: string; html_url: string; draft?: boolean;
  created_at: string; updated_at: string; closed_at?: string | null; merged_at?: string | null;
  user?: { login: string; type?: string } | null;
  requested_reviewers?: { login: string }[];
  head?: { ref: string };
  body?: string | null;
}
export interface IssueLite { number: number; title: string; html_url: string; created_at: string; closed_at?: string | null; state?: string; comments?: number; labels?: { name: string }[]; pull_request?: unknown }
export interface RepoSnapshot { repo: string; defaultBranch: string; open: PullLite[]; closed: PullLite[]; branches: { name: string }[]; issues: IssueLite[]; fetchedAt: number }
export interface RepoSignalOptions {
  players?: readonly string[]; // GitHub logins of the people playing; defaults to the repo owner
  factoryPrs?: ReadonlySet<number>; // PRs the factory already shows as rockets, so they aren't counted twice
  now?: number;
}

const HOUR = 3_600_000, DAY = 24 * HOUR;
export const REPO_EVERY_MS = 15 * 60_000; // how long one GitHub snapshot is reused
export const REPO_FRESH_MS = 2 * HOUR;
// Small repos ship in bursts, so every rule needs both a count and an age before it fires.
export const REPO_LIMITS = { reviewWaitMs: 4 * HOUR, stalePrMs: 3 * DAY, staleBranches: 8, backlogNet: 3, untriagedMs: 2 * DAY, untriaged: 3, slowMergeMs: 2 * DAY, dropRatio: 0.3, shipDropFrom: 4, approveWaitMs: 30 * 60_000 };

const ms = (iso?: string | null) => (iso ? Date.parse(iso) : NaN);
const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
const hours = (n: number) => Math.round(n / HOUR * 10) / 10;
const ago = (n: number) => n < HOUR ? `${Math.max(1, Math.round(n / 60_000))} min` : n < 2 * DAY ? `${Math.round(n / HOUR)} h` : `${Math.round(n / DAY)} days`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const isBot = (u?: { login: string; type?: string } | null) => u?.type === "Bot" || !!u?.login.endsWith("[bot]");
const label = (n: number, title: string) => `#${n} ${title}`.slice(0, 120);
const prEvidence = (prs: PullLite[], max = 5): Evidence[] => prs.slice(0, max).map(p => ({ label: label(p.number, p.title), url: p.html_url }));
// "Fixes #12" / "closes #12" in a PR body, so ask → merge starts when the issue was opened.
const linkedIssues = (body?: string | null) => [...(body ?? "").matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)].map(m => Number(m[1]));

/** Not connected: one honest signal instead of silence, so the brain can ask the player to install the App. */
export function repoMissing(now: number, repo?: string): BrainSignal {
  return { id: signalId("repo", "repo_missing"), source: "repo", kind: "repo_missing", title: repo ? `Can't read ${repo} on GitHub right now.` : "No GitHub repo connected yet.", severity: repo ? 0.2 : 0.5, confidence: 1, evidence: [{ label: "Connect GitHub in Shiptorio setup", url: "https://shiptorio.com/setup" }], observedAt: now, freshUntil: now + REPO_FRESH_MS };
}

/**
 * The player's Approve queue: build plans waiting on "Approve and build" (deck cards carrying approve_runner_job)
 * and rockets on the pad waiting on Launch. Agents sit idle until the player taps, so this is repo flow too.
 * Reads factory state only, so it works even when GitHub can't be read.
 */
export function approveQueueSignal(state: Pick<FactoryState, "items" | "deck" | "move"> | undefined, now: number): BrainSignal | null {
  if (!state) return null;
  const cards = [...(state.move ? [state.move] : []), ...(state.deck ?? [])].filter((m, i, all) => all.findIndex(x => x.id === m.id) === i && m.options.some(o => o.actions.some(a => a.tool === "approve_runner_job")));
  const planned = new Set(cards.map(m => m.itemId));
  const pad = state.items.filter(i => i.state === "on_pad" && !planned.has(i.id));
  const waits = [...cards.map(m => ({ since: m.createdAt, label: `${m.title} (plan to approve)`, url: state.items.find(i => i.id === m.itemId)?.url })),
    ...pad.map(i => ({ since: i.updatedAt, label: `${i.title} (ready to launch)`, url: i.prUrl ?? i.url }))].sort((a, b) => a.since - b.since);
  if (!waits.length) return null;
  const oldest = now - waits[0].since;
  if (oldest < REPO_LIMITS.approveWaitMs) return null;
  return {
    id: signalId("repo", "approve_queue"), source: "repo", kind: "approve_queue", confidence: 1, observedAt: now, freshUntil: now + 15 * 60_000,
    title: `${plural(waits.length, "card")} waiting on your OK (${cards.length} to approve, ${pad.length} to launch), oldest ${ago(oldest)}.`,
    severity: clamp(Math.min(0.8, 0.4 + 0.1 * waits.length + oldest / (12 * HOUR))), // one tap away, but never louder than a crash
    metric: { value: waits.length, unit: "items" },
    evidence: waits.slice(0, 5).map(w => ({ label: w.label.slice(0, 120), ...(w.url ? { url: w.url } : {}) })),
  };
}

export function repoSignals(snap: RepoSnapshot, options: RepoSignalOptions = {}): BrainSignal[] {
  const now = options.now ?? Date.now();
  const { repo } = snap;
  const players = new Set((options.players?.length ? options.players : [repo.split("/")[0]]).map(l => l.toLowerCase()));
  const factoryPrs = options.factoryPrs ?? new Set<number>();
  const out: BrainSignal[] = [];
  const push = (kind: string, s: Pick<BrainSignal, "title" | "severity" | "evidence"> & Partial<Pick<BrainSignal, "metric" | "confidence">>) =>
    out.push({ id: signalId("repo", kind), source: "repo", kind, confidence: 1, observedAt: now, freshUntil: now + REPO_FRESH_MS, ...s, title: s.title.slice(0, 160), severity: clamp(s.severity) });

  // PRs where the player is the requested reviewer. Factory PRs already wait as rockets on the pad.
  const ready = snap.open.filter(p => !p.draft && !factoryPrs.has(p.number));
  const onYou = ready.filter(p => p.requested_reviewers?.some(r => players.has(r.login.toLowerCase())) && now - ms(p.created_at) >= REPO_LIMITS.reviewWaitMs)
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));
  if (onYou.length) {
    const oldest = now - ms(onYou[0].created_at);
    push("prs_waiting_on_you", {
      title: `${plural(onYou.length, "PR")} ${onYou.length === 1 ? "is" : "are"} waiting on your review, oldest for ${ago(oldest)}.`,
      severity: Math.min(0.8, 0.45 + 0.08 * onYou.length + oldest / (4 * DAY)), // a crash or red main still outranks a review
      metric: { value: onYou.length, unit: "prs" },
      evidence: prEvidence(onYou),
    });
  }

  // PRs nobody has touched in days, whoever wrote them.
  const waiting = new Set(onYou.map(p => p.number));
  const stale = ready.filter(p => !waiting.has(p.number) && now - ms(p.updated_at) >= REPO_LIMITS.stalePrMs).sort((a, b) => ms(a.updated_at) - ms(b.updated_at));
  if (stale.length) push("prs_stale", {
    title: `${plural(stale.length, "open PR")} ${stale.length === 1 ? "hasn't" : "haven't"} moved in ${ago(REPO_LIMITS.stalePrMs)}; oldest idle ${ago(now - ms(stale[0].updated_at))}.`,
    severity: 0.2 + 0.05 * stale.length + (now - ms(stale[0].updated_at)) / (30 * DAY),
    metric: { value: stale.length, unit: "prs" },
    evidence: prEvidence(stale),
  });

  // Branches with no open PR: half-done or forgotten work. The list has no dates, so it's a count only.
  const heads = new Set(snap.open.map(p => p.head?.ref));
  const orphans = snap.branches.filter(b => b.name !== snap.defaultBranch && !heads.has(b.name));
  if (orphans.length >= REPO_LIMITS.staleBranches) {
    const runner = orphans.filter(b => b.name.startsWith("shiptorio/runner-")).length;
    push("branches_stale", {
      title: `${orphans.length} branches have no open PR${runner ? `, ${runner} left by factory runners` : ""}.`,
      severity: 0.1 + orphans.length / 200,
      confidence: snap.branches.length >= 100 ? 0.7 : 1, // first page only
      metric: { value: orphans.length, unit: "branches" },
      evidence: [{ label: "Stale branches on GitHub", url: `https://github.com/${repo}/branches/stale` }],
    });
  }

  // Backlog: opened vs closed this week, against the week before.
  const issues = snap.issues.filter(i => !i.pull_request);
  const inWeek = (t: number, w: number) => t > now - (w + 1) * 7 * DAY && t <= now - w * 7 * DAY;
  const count = (f: (i: IssueLite) => number, w: number) => issues.filter(i => inWeek(f(i), w)).length;
  const opened = count(i => ms(i.created_at), 0), closed = count(i => ms(i.closed_at), 0);
  const net = opened - closed, netBefore = count(i => ms(i.created_at), 1) - count(i => ms(i.closed_at), 1);
  const open = issues.filter(i => (i.state ?? (i.closed_at ? "closed" : "open")) === "open").sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const issueEvidence = (list: IssueLite[]): Evidence[] => [{ label: "Open issues", url: `https://github.com/${repo}/issues` }, ...list.slice(0, 4).map(i => ({ label: label(i.number, i.title), url: i.html_url }))];
  if (net >= REPO_LIMITS.backlogNet) push("backlog_growing", {
    title: `The issue backlog grew by ${net} this week: ${opened} opened, ${closed} closed.`,
    // More asks coming in than going out is worth a look, but it never blocks a ship the way red CI does.
    severity: Math.min(0.6, 0.25 + net / 20 + (net > netBefore ? 0.1 : 0)),
    metric: { value: net, unit: "issues", baseline: netBefore },
    evidence: issueEvidence(open.slice(-4).reverse()),
  });

  // Asks nobody has looked at: open for days, no label, no comment.
  const untriaged = open.filter(i => now - ms(i.created_at) >= REPO_LIMITS.untriagedMs && !i.labels?.length && !i.comments);
  if (untriaged.length >= REPO_LIMITS.untriaged) push("issues_untriaged", {
    title: `${untriaged.length} issues have sat ${ago(REPO_LIMITS.untriagedMs)}+ with no label or reply.`,
    severity: 0.2 + untriaged.length / 25,
    confidence: snap.issues.length >= 100 ? 0.8 : 1, // only issues touched in the last 30 days
    metric: { value: untriaged.length, unit: "issues" },
    evidence: issueEvidence(untriaged),
  });

  // Ask → merge time. PR open → merge, starting at the linked issue when the PR says "Fixes #n".
  const merged = snap.closed.filter(p => p.merged_at && now - ms(p.merged_at) <= 30 * DAY);
  const issueOpened = new Map(issues.map(i => [i.number, ms(i.created_at)]));
  const lead = (p: PullLite) => ms(p.merged_at) - Math.min(ms(p.created_at), ...linkedIssues(p.body).map(n => issueOpened.get(n)).filter((t): t is number => Number.isFinite(t)));
  const thisWeek = merged.filter(p => now - ms(p.merged_at) <= 7 * DAY), lastWeek = merged.filter(p => inWeek(ms(p.merged_at), 1));
  const before = merged.filter(p => now - ms(p.merged_at) > 7 * DAY).map(lead);
  const recentMedian = median(thisWeek.map(lead)), beforeMedian = median(before);
  if (thisWeek.length >= 3 && (recentMedian >= REPO_LIMITS.slowMergeMs || (before.length >= 3 && recentMedian >= 1.5 * beforeMedian && recentMedian >= DAY))) {
    const slowest = [...thisWeek].sort((a, b) => lead(b) - lead(a));
    push("slow_merge", {
      title: `Work takes ${ago(recentMedian)} from ask to merge${before.length >= 3 ? `, up from ${ago(beforeMedian)}` : ""}.`,
      severity: 0.2 + recentMedian / (10 * DAY) + (beforeMedian && recentMedian > beforeMedian ? 0.15 : 0),
      metric: { value: hours(recentMedian), unit: "hours", ...(before.length >= 3 ? { baseline: hours(beforeMedian) } : {}) },
      evidence: prEvidence(slowest, 3),
    });
  }

  // Ship rate: merges this week vs last week.
  if (lastWeek.length >= REPO_LIMITS.shipDropFrom && thisWeek.length <= lastWeek.length / 2) push("ship_rate_drop", {
    title: `${plural(thisWeek.length, "PR")} merged this week, down from ${lastWeek.length} last week.`,
    severity: 0.3 + (1 - thisWeek.length / lastWeek.length) * 0.4,
    metric: { value: thisWeek.length, unit: "prs", baseline: lastWeek.length },
    evidence: [{ label: "Merged PRs", url: `https://github.com/${repo}/pulls?q=is%3Apr+is%3Amerged` }, ...prEvidence(thisWeek, 3)],
  });

  // PRs closed without merging: work thrown away. Dependency bots close in bulk and say nothing about rework.
  const done = snap.closed.filter(p => now - ms(p.closed_at) <= 14 * DAY && (!isBot(p.user) || factoryPrs.has(p.number)));
  const dropped = done.filter(p => !p.merged_at);
  if (done.length >= 6 && dropped.length / done.length >= REPO_LIMITS.dropRatio) push("prs_dropped", {
    title: `${dropped.length} of ${done.length} PRs closed in 14 days never merged.`,
    severity: 0.2 + dropped.length / done.length * 0.6,
    metric: { value: Math.round(dropped.length / done.length * 100) / 100, unit: "ratio" },
    evidence: prEvidence(dropped),
  });

  // Nothing to build at all: the mine is empty. Only when the repo also shipped nothing this week.
  if (!open.length && !snap.open.length && !thisWeek.length && snap.issues.length < 100) push("backlog_empty", {
    title: "No open issues or PRs, and nothing merged this week.",
    severity: 0.3,
    evidence: [{ label: "Open an issue", url: `https://github.com/${repo}/issues/new` }],
  });
  return out.sort((a, b) => b.severity - a.severity);
}

// ---- Fetch: five list calls, cached per repo. ----
type FetchJson = <T>(path: string, token: string) => Promise<T>;
const cache = new Map<string, RepoSnapshot>();
export interface RepoCacheEnv { CACHE?: Pick<KVNamespace, "get" | "put"> }
export const clearRepoCache = () => cache.clear();

export async function fetchRepoSnapshot(token: string, repo: string, env: RepoCacheEnv = {}, now = Date.now(), fetchJson: FetchJson = gh): Promise<RepoSnapshot> {
  const key = `brain:repo:v1:${repo.toLowerCase()}`;
  const hit = cache.get(key) ?? await env.CACHE?.get<RepoSnapshot>(key, "json").catch(() => null) ?? undefined;
  if (hit && now - hit.fetchedAt < REPO_EVERY_MS) { cache.set(key, hit); return hit; }
  const since = new Date(now - 30 * DAY).toISOString();
  const [meta, open, closed, branches, issues] = await Promise.all([
    hit ? Promise.resolve({ default_branch: hit.defaultBranch }) : fetchJson<{ default_branch: string }>(`/repos/${repo}`, token),
    fetchJson<PullLite[]>(`/repos/${repo}/pulls?state=open&sort=created&direction=asc&per_page=100`, token),
    fetchJson<PullLite[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`, token),
    fetchJson<{ name: string }[]>(`/repos/${repo}/branches?per_page=100`, token),
    fetchJson<IssueLite[]>(`/repos/${repo}/issues?state=all&since=${encodeURIComponent(since)}&per_page=100`, token),
  ]);
  // Keep only what the rules read, so the cached copy stays small.
  const pick = (p: PullLite): PullLite => ({ number: p.number, title: p.title, html_url: p.html_url, draft: p.draft, created_at: p.created_at, updated_at: p.updated_at, closed_at: p.closed_at, merged_at: p.merged_at, user: p.user ? { login: p.user.login, type: p.user.type } : null, requested_reviewers: p.requested_reviewers?.map(r => ({ login: r.login })), head: p.head ? { ref: p.head.ref } : undefined, body: p.body?.slice(0, 500) });
  const snapshot: RepoSnapshot = {
    repo, defaultBranch: meta.default_branch, fetchedAt: now,
    open: open.map(pick), closed: closed.map(pick), branches: branches.map(b => ({ name: b.name })),
    issues: issues.filter(i => !i.pull_request).map(i => ({ number: i.number, title: i.title, html_url: i.html_url, created_at: i.created_at, closed_at: i.closed_at, state: i.state, comments: i.comments, labels: i.labels?.map(l => ({ name: l.name })) })),
  };
  cache.set(key, snapshot);
  await env.CACHE?.put(key, JSON.stringify(snapshot), { expirationTtl: 3600 }).catch(() => {});
  return snapshot;
}

export interface RepoCtx {
  repo?: string; // "owner/name"; missing = not connected
  token?: () => Promise<string>; // installation token for the repo's GitHub App install
  env?: RepoCacheEnv;
  state?: Pick<FactoryState, "items" | "deck" | "move">; // for the Approve queue and to skip the factory's own PRs
  players?: readonly string[];
  fetchJson?: FetchJson; // tests
}

/** PRs the factory already shows as rockets, so they aren't counted twice. */
export const factoryPrNumbers = (state?: Pick<FactoryState, "items">): Set<number> => new Set((state?.items ?? []).map(i => i.prNumber).filter((n): n is number => !!n));

export const repoCollector: SignalCollector<RepoCtx> = {
  source: "repo",
  everyMs: 5 * 60_000, // the Approve queue is local and cheap; GitHub reads stay behind the 15-minute snapshot cache
  async read(ctx, now) {
    const approve = approveQueueSignal(ctx.state, now);
    const local = approve ? [approve] : [];
    if (!ctx.repo || !ctx.token) return [repoMissing(now), ...local];
    try {
      const snap = await fetchRepoSnapshot(await ctx.token(), ctx.repo, ctx.env, now, ctx.fetchJson);
      return [...repoSignals(snap, { players: ctx.players, factoryPrs: factoryPrNumbers(ctx.state), now }), ...local].sort((a, b) => b.severity - a.severity);
    } catch {
      return [repoMissing(now, ctx.repo), ...local]; // rate limit or outage; the next read tries again
    }
  },
};
