// Feedback signal for the bottleneck brain. Reads what people outside the team said (GitHub issues,
// discussions, support tickets) and turns it into at most two signals: people are waiting on a reply,
// or too little feedback is coming in to know what to build next.
//
// Outsider text never leaves this file. The author_association gate (sources/github.ts) keeps strangers'
// issues out of the mine; here they only count. A signal carries counts, ages and links, never a stranger's
// login, title or body, so nothing they wrote can reach the model as instructions.

import { signalId, type BrainSignal, type SignalCollector, type SupportTicket } from "@shiptorio/shared";
import { gh } from "../github";
import { isOutsideAuthor, isTeamAuthor, type GitHubIssue } from "../sources/github";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A reply inside this window isn't late yet; the team gets a working day before it counts. */
export const GRACE_MS = 12 * HOUR;
/** How far back "coming in" looks. */
export const INFLOW_WINDOW_MS = 14 * DAY;
/** Fewer outside voices than this in the window and the brain hears "we need more feedback". */
export const MIN_INFLOW = 3;
const MAX_EVIDENCE = 5;
/** Feedback moves in hours, not minutes: read every 30 min, trust a read for 2 h. */
export const READ_EVERY_MS = 30 * 60_000;
const FRESH_MS = 2 * HOUR;

/** One conversation with someone outside the team, reduced to who and when. */
export interface FeedbackThread {
  channel: "issue" | "discussion" | "support";
  ref: string; // "#12", "discussion #4", "ticket" (no customer text)
  url?: string;
  person: string; // GitHub login or a ticket id: only used to count distinct people
  openedAt: number;
  /** The newest message from the outsider, and the newest from the team after it, if any. */
  lastOutsideAt: number;
  lastTeamAt?: number;
  open: boolean;
}

export interface FeedbackInput {
  threads: FeedbackThread[];
  now: number;
  /** "owner/name", for the evidence link when there's nothing else to point at. */
  repo: string;
  /** PRs shipped in the inflow window. Shipping a lot with nobody talking back makes the silence louder. */
  shipped?: number;
  /** False when part of the read failed (discussions off, a bounded page cut short). */
  complete?: boolean;
}

export const waitingOnReply = (t: FeedbackThread, now: number) =>
  t.open && (t.lastTeamAt === undefined || t.lastTeamAt < t.lastOutsideAt) && now - t.lastOutsideAt >= GRACE_MS;

const ago = (ms: number) => ms < DAY ? `${Math.max(1, Math.round(ms / HOUR))}h` : `${Math.round(ms / DAY)}d`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function feedbackSignals({ threads, now, repo, shipped = 0, complete = true }: FeedbackInput): BrainSignal[] {
  const out: BrainSignal[] = [];
  const base = { source: "feedback" as const, observedAt: now, freshUntil: now + FRESH_MS, confidence: complete ? 1 : 0.7 };
  const issuesUrl = `https://github.com/${repo}/issues`;
  const waiting = threads.filter(t => waitingOnReply(t, now)).sort((a, b) => a.lastOutsideAt - b.lastOutsideAt);
  if (waiting.length) {
    const people = new Set(waiting.map(t => t.person.toLowerCase())).size;
    const oldest = now - waiting[0].lastOutsideAt;
    // More people and longer waits both hurt; a week-old silence on one person is already loud.
    const severity = Math.min(1, 0.25 + 0.1 * Math.min(people, 5) + 0.25 * Math.min(oldest / (7 * DAY), 1));
    out.push({
      ...base, id: signalId("feedback", "feedback_unanswered"), kind: "feedback_unanswered",
      title: `${plural(people, "person", "people")} waiting on a reply, the oldest for ${ago(oldest)}.`,
      severity: round(severity),
      metric: { value: people, unit: "people" },
      evidence: waiting.slice(0, MAX_EVIDENCE).map(t => ({ label: `${t.ref} · waiting ${ago(now - t.lastOutsideAt)}`, url: t.url })),
    });
  }
  const recent = threads.filter(t => now - t.openedAt <= INFLOW_WINDOW_MS);
  const voices = new Set(recent.map(t => t.person.toLowerCase())).size;
  if (voices < MIN_INFLOW) {
    const days = Math.round(INFLOW_WINDOW_MS / DAY);
    // Quiet is normal on day one; it matters once things are shipping and nobody says a word.
    // A quiet week is worth a nudge, never a stop: it stays under anything that blocks a ship.
    const severity = Math.min(0.5, 0.2 + 0.08 * (MIN_INFLOW - voices) + 0.05 * Math.min(shipped, 6));
    const who = voices === 0 ? "Nobody" : plural(voices, "person", "people");
    out.push({
      ...base, id: signalId("feedback", "feedback_thin"), kind: "feedback_thin",
      title: `${who} outside the team spoke up in ${days} days${shipped ? `, across ${plural(shipped, "shipped PR")}` : ""}.`,
      severity: round(severity),
      // The unlock clears once value climbs above the baseline, i.e. MIN_INFLOW voices.
      metric: { value: voices, baseline: MIN_INFLOW - 1, unit: "people" },
      evidence: recent.length
        ? recent.slice(0, MAX_EVIDENCE).map(t => ({ label: t.ref, url: t.url }))
        : [{ label: `No new outside issues in ${days} days`, url: issuesUrl }],
    });
  }
  return out;
}
const round = (n: number) => Math.round(n * 100) / 100;

// --- Reading the repo -------------------------------------------------------------------------------

export interface IssueComment {
  issue_url: string; created_at: string;
  user?: { login: string; type?: string }; author_association?: string;
}

/** Outside issues, folded with the repo-wide comment stream. Only who/when is kept. */
export function issueThreads(issues: GitHubIssue[], comments: IssueComment[]): FeedbackThread[] {
  const byIssue = new Map<number, IssueComment[]>();
  for (const c of comments) {
    const n = Number(/\/issues\/(\d+)$/.exec(c.issue_url)?.[1]);
    if (Number.isInteger(n)) byIssue.set(n, [...byIssue.get(n) ?? [], c]);
  }
  const threads: FeedbackThread[] = [];
  for (const issue of issues) {
    if (issue.pull_request || !issue.user || !isOutsideAuthor(issue)) continue;
    const openedAt = Date.parse(issue.created_at ?? "") || 0;
    let lastOutsideAt = openedAt, lastTeamAt: number | undefined;
    for (const c of byIssue.get(issue.number) ?? []) {
      const at = Date.parse(c.created_at) || 0;
      if (isTeamAuthor(c)) lastTeamAt = Math.max(lastTeamAt ?? 0, at);
      else if (c.user?.login === issue.user.login || isOutsideAuthor(c)) lastOutsideAt = Math.max(lastOutsideAt, at);
    }
    // The comment stream is bounded; an issue GitHub says has comments we never saw may already be answered.
    if (lastTeamAt === undefined && (issue.comments ?? 0) > (byIssue.get(issue.number)?.length ?? 0)) continue;
    threads.push({ channel: "issue", ref: `#${issue.number}`, url: issue.html_url, person: issue.user.login, openedAt, lastOutsideAt, lastTeamAt, open: issue.state !== "closed" });
  }
  return threads;
}

export interface DiscussionNode {
  number: number; url: string; createdAt: string; closed?: boolean; isAnswered?: boolean;
  author?: { login: string } | null; authorAssociation?: string;
  comments?: { nodes: { createdAt: string; author?: { login: string } | null; authorAssociation?: string }[] };
}

export function discussionThreads(nodes: DiscussionNode[]): FeedbackThread[] {
  const threads: FeedbackThread[] = [];
  for (const d of nodes) {
    const login = d.author?.login;
    if (!login || !isOutsideAuthor({ author_association: d.authorAssociation, user: { login } })) continue;
    const openedAt = Date.parse(d.createdAt) || 0;
    let lastOutsideAt = openedAt, lastTeamAt: number | undefined;
    for (const c of d.comments?.nodes ?? []) {
      const at = Date.parse(c.createdAt) || 0;
      if (isTeamAuthor({ author_association: c.authorAssociation, user: c.author ?? undefined })) lastTeamAt = Math.max(lastTeamAt ?? 0, at);
      else lastOutsideAt = Math.max(lastOutsideAt, at);
    }
    // A marked answer closes the loop even if the asker said thanks afterwards.
    if (d.isAnswered) lastTeamAt = Math.max(lastTeamAt ?? 0, lastOutsideAt);
    threads.push({ channel: "discussion", ref: `discussion #${d.number}`, url: d.url, person: login, openedAt, lastOutsideAt, lastTeamAt, open: !d.closed });
  }
  return threads;
}

/** Support mine tickets. "waiting_fix" was already answered ("on it"), so only new/drafted wait. */
export function ticketThreads(tickets: SupportTicket[]): FeedbackThread[] {
  return tickets.map(t => {
    const lastSent = t.sent.reduce((max, s) => Math.max(max, s.at), 0) || undefined;
    const waiting = t.state === "new" || t.state === "drafted";
    return {
      channel: "support" as const, ref: `${t.channel} ticket`, person: `ticket:${t.id}`,
      openedAt: t.receivedAt, lastOutsideAt: t.receivedAt,
      lastTeamAt: waiting ? undefined : Math.max(lastSent ?? 0, t.receivedAt),
      open: t.state !== "closed",
    };
  });
}

const DISCUSSIONS_QUERY = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
  discussions(first: 25, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes {
    number url createdAt closed isAnswered authorAssociation author { login }
    comments(last: 10) { nodes { createdAt authorAssociation author { login } } } } } } }`;

/**
 * Three bounded GitHub reads per poll: recent issues, the repo-wide comment stream, and discussions.
 * Discussions may be off or outside the App's permissions; that only lowers confidence.
 */
export async function readFeedback(token: string, repo: string, now = Date.now(), tickets: SupportTicket[] = []): Promise<{ threads: FeedbackThread[]; complete: boolean }> {
  const since = new Date(now - 30 * DAY).toISOString();
  const [issues, comments] = await Promise.all([
    gh<GitHubIssue[]>(`/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=100`, token),
    gh<IssueComment[]>(`/repos/${repo}/issues/comments?sort=created&direction=desc&since=${since}&per_page=100`, token),
  ]);
  const [owner, name] = repo.split("/");
  let complete = comments.length < 100;
  const discussions = await gh<{ data?: { repository?: { discussions?: { nodes?: DiscussionNode[] } } } }>("/graphql", token, {
    method: "POST", body: JSON.stringify({ query: DISCUSSIONS_QUERY, variables: { owner, name } }),
  }).then(r => r.data?.repository?.discussions?.nodes ?? [], () => { complete = false; return []; });
  return { threads: [...issueThreads(issues, comments), ...discussionThreads(discussions), ...ticketThreads(tickets)], complete };
}

export interface FeedbackContext {
  repo: string;
  /** An installation token for the repo; with none, only support tickets are read. */
  token?: string;
  tickets?: SupportTicket[];
  shipped?: number;
}

export const feedbackCollector: SignalCollector<FeedbackContext> = {
  source: "feedback",
  everyMs: READ_EVERY_MS,
  async read(ctx, now) {
    const tickets = ctx.tickets ?? [];
    // Not connected isn't a throw: tickets alone still say who's waiting. They can't say feedback is thin,
    // though, since the issues we couldn't read may be full of it.
    const read = ctx.token ? await readFeedback(ctx.token, ctx.repo, now, tickets).catch(() => null) : null;
    const signals = feedbackSignals({ threads: read?.threads ?? ticketThreads(tickets), complete: read?.complete ?? false, now, repo: ctx.repo, shipped: ctx.shipped });
    return read ? signals : signals.filter(s => s.kind !== "feedback_thin");
  },
};
