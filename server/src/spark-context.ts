// What Spark's read tools see, built from the live factory and GitHub. Pure summaries (factoryBrief,
// signalsBrief) are tested on their own; the GitHub readers are thin and fail soft, because a missing
// comment list should never stop a plan. No secrets or customer addresses ever go in here.

import type { FactoryState, Item } from "@shiptorio/shared";
import { gh } from "./github";
import type { PermitBook } from "./permits";
import type { Toolbox } from "./spark-tools";
import { redactText } from "./redact";

const line = (s: string | undefined, n = 200) => redactText(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** read_factory: the gauntlet, this district's history, permits, autonomy and the player's past calls. */
export function factoryBrief(s: FactoryState, item: Item | undefined, permits: PermitBook | undefined, playerFeedback: string): string {
  const district = item?.district;
  const scarred = s.items.filter(i => i.id !== item?.id && i.scars?.length && (!district || i.district === district));
  const lanes = Object.values(permits?.lanes ?? {});
  return JSON.stringify({
    goal: s.goal,
    autonomy: s.autonomy ? { level: s.autonomy.level, next: s.autonomy.next, ranAlone: s.autonomy.ranAlone } : undefined,
    bottleneck: s.bottleneck?.summary,
    stations: (s.stations ?? []).map(st => ({ name: st.name, kind: st.kind, waiting: st.wip, passRate: st.passRate, caughtThisWeek: st.caughtThisWeek, last: st.lastLog ? line(st.lastLog.text, 160) : undefined })),
    thisItem: item ? { id: item.id, state: item.state, district: item.district, lane: item.lane, attempts: item.attempts, failure: line(item.failure, 400), scars: (item.scars ?? []).map(sc => ({ station: sc.station, strike: sc.strike, reason: line(sc.reason, 300) })) } : undefined,
    districtScars: scarred.slice(-8).map(i => ({ item: line(i.title, 100), scars: (i.scars ?? []).slice(-2).map(sc => `${sc.station}: ${line(sc.reason, 160)}`) })),
    permits: lanes.map(r => ({ lane: r.lane, permit: r.permit, cleanStreak: r.streak, shipped: r.shipped, reworks: r.reworks })),
    research: s.research ? { done: s.research.done, suggested: s.research.suggest?.tech } : undefined,
    playerCalls: playerFeedback || "none",
  });
}

/** read_signals: the mines behind this work. Counts and hints, never a customer's address. */
export function signalsBrief(s: FactoryState, item: Item | undefined): string {
  const district = item?.district;
  const linked = new Set([...(item?.customer?.linked ?? []), ...(item?.ore?.linked ?? [])]);
  const ore = (i: Item) => ({ id: i.id, source: i.source, title: line(i.title, 140), state: i.state, count: i.ore?.count, usersAffected: i.ore?.usersAffected ?? i.customer?.usersAffected, paying: i.ore?.paying || i.customer?.paying || undefined, hints: (i.ore?.hints ?? []).slice(0, 4).map(h => line(h, 160)) });
  const related = s.items.filter(i => i.id !== item?.id && i.source !== "github_issue" && (linked.has(i.id) || (district && i.district === district))).slice(0, 8);
  const tickets = (s.support ?? []).filter(t => t.triage && (t.triage.linkedItemId === item?.id || (district && t.triage.district === district))).slice(0, 6)
    .map(t => ({ subject: line(t.subject, 140), kind: t.triage!.kind, summary: line(t.triage!.summary, 200), messages: t.messages, paying: t.paying || undefined, aboutThis: t.triage!.linkedItemId === item?.id || undefined }));
  const self = item && item.source !== "github_issue" ? ore(item) : undefined;
  if (!self && !related.length && !tickets.length) return `No Sentry, PostHog or support signals tied to ${district ? `the ${district} district` : "this work"} yet.`;
  return JSON.stringify({ thisItem: self, related: related.map(ore), support: tickets, experiments: (s.experiments ?? []).filter(e => !district || e.district === district).slice(0, 3).map(e => ({ title: line(e.title, 120), state: e.state })) });
}

/** read_comments: the issue thread, oldest first, with who said it. Shiptorio's own plan comments are skipped. */
export async function issueComments(token: string, repo: string, number: number): Promise<string> {
  const comments = await gh<{ user?: { login?: string; type?: string }; body?: string; created_at?: string }[]>(`/repos/${repo}/issues/${number}/comments?per_page=30`, token);
  const kept = comments.filter(c => !/<!-- shiptorio-(plan|review-head):/.test(c.body ?? ""));
  if (!kept.length) return "No comments on this issue.";
  return kept.slice(-15).map(c => `${c.user?.login ?? "someone"}${c.user?.type === "Bot" ? " (bot)" : ""}: ${line(c.body, 600)}`).join("\n");
}

/** read_ci: every check on a commit; failed ones bring their annotations. */
export async function ciReport(token: string, repo: string, sha: string, failure?: string): Promise<string> {
  const { check_runs: runs } = await gh<{ check_runs: { id: number; name: string; status: string; conclusion: string | null; output?: { title?: string | null; summary?: string | null } }[] }>(`/repos/${repo}/commits/${sha}/check-runs?per_page=30`, token);
  const out = runs.map(r => `${r.name}: ${r.status === "completed" ? r.conclusion : r.status}${r.output?.title ? ` (${line(r.output.title, 120)})` : ""}${r.conclusion === "failure" && r.output?.summary ? `\n  ${line(r.output.summary, 400)}` : ""}`);
  for (const r of runs.filter(r => r.conclusion === "failure").slice(0, 2)) {
    const notes = await gh<{ path: string; start_line: number; message: string }[]>(`/repos/${repo}/check-runs/${r.id}/annotations?per_page=10`, token).catch(() => []);
    for (const a of notes.slice(0, 6)) out.push(`  ${r.name} → ${a.path}:${a.start_line}: ${line(a.message, 200)}`);
  }
  if (failure) out.push(`Station that sent it back said: ${line(failure, 400)}`);
  return out.length ? out.join("\n") : "No checks reported on this commit.";
}

/** GitHub code search over the repo's default branch. Rate-limited by GitHub, so it fails soft to the scan. */
export async function codeSearch(token: string, repo: string, query: string): Promise<string[]> {
  const q = `${query.replace(/[":]/g, " ").trim().slice(0, 80)} repo:${repo}`;
  const res = await gh<{ items?: { path: string }[] }>(`/search/code?q=${encodeURIComponent(q)}&per_page=10`, token);
  return (res.items ?? []).map(i => i.path);
}

/** Every repo blob path at a commit. */
export async function treePaths(token: string, repo: string, sha: string): Promise<string[]> {
  const tree = await gh<{ tree: { path: string; type: string }[]; truncated?: boolean }>(`/repos/${repo}/git/trees/${sha}?recursive=1`, token);
  if (!Array.isArray(tree.tree) || tree.truncated) throw new Error("Repository tree is incomplete");
  return tree.tree.filter(e => e.type === "blob").map(e => e.path);
}

export type { Toolbox };
