// Repo-flow eval cases. Unlike the hand-written ones in cases.ts, these signals come out of the real repo
// collector (server/src/signals/repo.ts) run on a scripted GitHub snapshot, so the eval also catches a
// collector whose severities drift out of line with the rest of the brain.

import type { BrainSignal, FactoryState, Item } from "@shiptorio/shared";
import { approveQueueSignal, repoSignals, type PullLite, type RepoSnapshot } from "../../src/signals/repo";
import type { EvalCase } from "./cases";

const HOUR = 3_600_000, DAY = 24 * HOUR;
const iso = (now: number, ago: number) => new Date(now - ago).toISOString();
const pr = (now: number, number: number, title: string, o: Partial<PullLite> = {}): PullLite => ({
  number, title, html_url: `https://github.com/acme/shop/pull/${number}`, created_at: iso(now, DAY), updated_at: iso(now, HOUR),
  user: { login: "dev" }, head: { ref: `b${number}` }, ...o,
});
const snapshot = (now: number, o: Partial<RepoSnapshot>): RepoSnapshot => ({ repo: "acme/shop", defaultBranch: "main", open: [], closed: [], branches: [{ name: "main" }], issues: [], fetchedAt: now, ...o });
const item = (o: Partial<Item>): Item => ({ id: "i", kind: "bug", source: "github_issue", title: "Fix crash", district: "/", state: "queued", updatedAt: 0, attempts: 0, ...o });
const merged = (now: number, n: number, mergedAgo: number, openFor: number) =>
  pr(now, n, `Change ${n}`, { merged_at: iso(now, mergedAgo), closed_at: iso(now, mergedAgo), created_at: iso(now, mergedAgo + openFor) });

/** Builds a case's signals: the shared healthy hum, minus anything the repo collector now says about the same id. */
export function repoCase(hum: (now: number) => BrainSignal[], read: (now: number) => BrainSignal[]) {
  return (now: number) => {
    const mine = read(now);
    return [...hum(now).filter(h => !mine.some(m => m.id === h.id)), ...mine];
  };
}

export const repoCases = (hum: (now: number) => BrainSignal[]): EvalCase[] => [
  {
    id: "repo-review-on-you", title: "3 teammate PRs have waited 2 days for the player's review",
    signals: repoCase(hum, now => repoSignals(snapshot(now, {
      open: [41, 42, 43].map((n, i) => pr(now, n, ["Add order export", "Fix tax rounding", "Cache product images"][i], { requested_reviewers: [{ login: "acme" }], created_at: iso(now, (2 + i * 0.5) * DAY) })),
      closed: [1, 2, 3, 4].map(n => merged(now, n, n * DAY, 6 * HOUR)),
    }), { now })),
    expect: { area: "ship", signal: "repo:prs_waiting_on_you:repo" }, unlock: /review|launch|approve|waiting|merge/i,
    plays: ["launch_waiting_prs"],
    why: "The code is written; the player's review is the slowest station.",
  },
  {
    id: "repo-approve-queue", title: "Two build plans and a finished rocket wait on the player's tap",
    signals: repoCase(hum, now => {
      const plan = (id: string, title: string, ago: number) => ({ id: `m-${id}`, title: `Build: ${title}`, why: "Review the plan", itemId: id, kind: "build" as const, createdAt: now - ago,
        options: [{ id: "approve", label: "Approve and build", recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId: id }, reason: "r" }] }] });
      const state = { items: [item({ id: "a", title: "Fix checkout crash" }), item({ id: "b", title: "Add dark mode" }), item({ id: "c", title: "Speed up search", state: "on_pad", updatedAt: now - 5 * HOUR, prUrl: "https://github.com/acme/shop/pull/50" })],
        deck: [plan("a", "Fix checkout crash", 6 * HOUR), plan("b", "Add dark mode", 2 * HOUR)] } as Pick<FactoryState, "items" | "deck" | "move">;
      const s = approveQueueSignal(state, now);
      return s ? [s] : [];
    }),
    expect: { area: "ship", signal: "repo:approve_queue:repo" }, unlock: /approve|launch|tap|waiting|plan/i,
    plays: ["launch_waiting_prs"],
    why: "Agents sit idle for hours because three cards wait on one tap each.",
  },
  {
    id: "repo-slow-merge", title: "Ask-to-merge went from 4 hours to 2 days this week",
    signals: repoCase(hum, now => repoSignals(snapshot(now, {
      open: [pr(now, 60, "Refund flow")],
      closed: [
        merged(now, 51, DAY, 50 * HOUR), merged(now, 52, 2 * DAY, 46 * HOUR), merged(now, 53, 3 * DAY, 60 * HOUR),
        ...[10, 11, 12, 13].map((d, i) => merged(now, 40 + i, d * DAY, 4 * HOUR)),
      ],
    }), { now })),
    expect: { area: "ship", signal: "repo:slow_merge:repo" }, alsoOk: ["speed"], unlock: /merge|review|faster|smaller|slow|wait/i,
    plays: ["speed_up_merges"],
    why: "Every change now waits two days to land; nothing else is off.",
  },
];
