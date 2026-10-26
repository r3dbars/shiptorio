import type { SourceStatus } from "@shiptorio/shared";
import { verifyHmac, type Signal, type Source } from "./types";

export interface GitHubSourceEnv {
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export interface GitHubIssue {
  number: number; title: string; body?: string | null; html_url: string;
  state?: string; updated_at?: string; created_at?: string;
  user?: { login: string }; labels?: { name: string }[];
  pull_request?: unknown;
  reactions?: { total_count?: number };
}
export interface GitHubPayload {
  action?: string;
  repository?: { full_name: string; default_branch?: string };
  installation?: { id: number; account?: { login: string } };
  issue?: GitHubIssue;
  comment?: { id: number; body: string; created_at?: string; updated_at?: string; user?: { login: string; type?: string }; performed_via_github_app?: { id: number } | null };
  repositories?: { full_name: string }[];
  repositories_added?: { full_name: string }[];
  repositories_removed?: { full_name: string }[];
  [key: string]: unknown;
}

/** Our own plan audit trail is output, not a new request to change that plan. */
export function isOwnPlanComment(comment: GitHubPayload["comment"]): boolean {
  return comment?.user?.login.toLowerCase() === "shiptorio[bot]" && comment.user.type === "Bot"
    && /^🧠 \*\*Shiptorio planned this(?: rework)?\*\* with Meta Muse Spark \(/.test(comment.body);
}

export function normalizeGitHub(payload: unknown): Signal[] {
  const p = payload as GitHubPayload;
  const issue = p?.issue;
  if (!issue || issue.pull_request || !Number.isInteger(issue.number) || !p.repository?.full_name) return [];
  if (isOwnPlanComment(p.comment)) return [];
  const body = issue.body ?? "";
  const labels = issue.labels?.map((l) => l.name) ?? [];
  // These are inspectable evidence hints, not priority or cross-source linking decisions.
  const hints = [...body.matchAll(/(?:sentry[^\s]*\/(?:issues\/)?(\d+)|sentry\s*#?(\d+))/gi)].map((m) => `sentry:${m[1] ?? m[2]}`);
  for (const m of body.matchAll(/(?:route|path)\s*[:=]\s*(\/[\w/.-]+)/gi)) hints.push(`route:${m[1]}`);
  const timestamp = Date.parse(p.comment?.created_at ?? issue.updated_at ?? issue.created_at ?? "") || Date.now();
  return [{
    source: "github_issue", externalId: String(issue.number),
    fingerprint: `github:${p.repository.full_name.toLowerCase()}#${issue.number}`,
    title: issue.title, body: `${body}\n\nLabels: ${labels.join(", ")}${p.comment ? `\n\nComment: ${p.comment.body}` : ""}`,
    url: issue.html_url, usersAffected: 0,
    reporter: p.comment?.user?.login ?? issue.user?.login,
    occurredAt: timestamp,
    rawRef: p.comment ? `github:comment:${p.comment.id}` : `${issue.html_url}@${issue.updated_at ?? issue.created_at ?? p.action ?? "backfill"}`,
    severity: 1, hints,
    action: p.action === "closed" || issue.state === "closed" ? "close" : "upsert",
  }];
}

export function githubStatus(env: GitHubSourceEnv): SourceStatus {
  const connected = !!(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_WEBHOOK_SECRET && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  return { kind: "github", state: connected ? "connected" : "needs_action", detail: connected ? "GitHub App configured; install it on a repository to open its mine." : "Create and install the GitHub App.", eventsToday: 0, setup: { steps: ["Open Shiptorio setup and create the private GitHub App.", "Set the five GITHUB_* secrets shown on the callback from server/.", "Install on Only select repositories, then open the live repo map."], actionUrl: "https://shiptorio.com/setup" } };
}

export function fakeGitHub(event = "issues.opened"): GitHubPayload {
  const action = event.split(".").at(-1)!;
  return { action, repository: { full_name: "example/demo", default_branch: "main" }, installation: { id: 1, account: { login: "example" } }, issue: { number: 1, title: "Checkout total crashes for an empty cart", body: "The checkout cannot complete. Route: /checkout", html_url: "https://github.com/example/demo/issues/1", state: action === "closed" ? "closed" : "open", updated_at: "2026-10-26T12:00:00Z", user: { login: "example-reporter" }, labels: [{ name: "bug" }] } };
}

export const githubSource: Source<GitHubSourceEnv> = {
  verify: async (request, env) => verifyHmac(env.GITHUB_WEBHOOK_SECRET, await request.text(), request.headers.get("x-hub-signature-256"), "sha256="),
  normalize: normalizeGitHub, status: githubStatus, fake: fakeGitHub,
};
