import { Hono } from "hono";
import type { Env } from "./index";
import type { User } from "./accounts";
import { gh, installationToken, repoInstallationId } from "./github";
import { budgetAccount, budgetUsage, BudgetError } from "./budget";
import type { GitHubIssue } from "./sources/github";

// Build 4 of the first run ("Re-rail the cart") needs one real issue to ride the line.
// We pick the smallest safe open issue; if there is none, we offer a starter README
// issue that is filed only when the player taps, since it's their repo.
// Title and label match STARTER_ISSUE in web/src/deck2d/rules/sim.ts (the demo shop's #1).

export const STARTER_LABEL = "shiptorio-starter";
export const STARTER_ISSUE = {
  title: 'Add a "Run it locally" section to the README',
  body: [
    "Add a short **Run it locally** section to the README so a new contributor can get the project running.",
    "",
    "- List what to install first (runtime, package manager).",
    "- Give the exact commands to install dependencies and start the app.",
    "- Say how to run the tests, if there are any.",
    "",
    "Docs only. No code changes.",
    "",
    "_Filed from Shiptorio as your first job. Small and safe on purpose._",
  ].join("\n"),
};

const SAFE_LABELS = new Set(["good first issue", "good-first-issue", "first-timers-only", "starter", "easy", "small", "size/xs", "size/s", "trivial", "typo", "docs", "documentation", "doc"]);
const RISKY = /security|vulnerab|breaking|migration|critical|urgent|p0|incident|outage|wontfix|won't fix|invalid|duplicate|blocked|on hold|needs[- ]design|needs[- ]discussion|question|discussion|epic|rfc|spike|refactor|infra|deploy|release|dependencies|shiptorio-skip/i;
const DOCSY = /\b(readme|docs?|documentation|typo|spelling|comment|changelog|contributing|license|wording|copy)\b/i;
const DOCS_ONLY = /\bdocs only\b|no code changes/i;
const MAX_BODY = 2000;

export type StarterIssue = GitHubIssue & { assignee?: unknown; assignees?: unknown[]; locked?: boolean };
export interface StarterPick { number: number; title: string; url: string; reason: string }
export type StarterAnswer =
  | { kind: "existing"; issue: StarterPick }
  | { kind: "starter"; offer: { title: string; body: string; label: string } };

const labelsOf = (issue: StarterIssue) => (issue.labels ?? []).map(label => label.name.toLowerCase());

/** Scores a safe candidate (lower is better), or null when the issue isn't safe to start with. */
export function starterScore(issue: StarterIssue): number | null {
  if (issue.pull_request || issue.locked || (issue.state && issue.state !== "open")) return null;
  if (issue.assignee || issue.assignees?.length) return null;
  if (issue.user?.type === "Bot" && !labelsOf(issue).includes(STARTER_LABEL)) return null;
  const labels = labelsOf(issue);
  const body = issue.body ?? "";
  if (labels.some(label => RISKY.test(label)) || RISKY.test(issue.title)) return null;
  if (body.length > MAX_BODY) return null;
  let tier: number;
  if (labels.includes(STARTER_LABEL)) tier = 0;
  else if (labels.some(label => ["good first issue", "good-first-issue", "first-timers-only", "starter", "easy", "trivial", "size/xs"].includes(label))) tier = 1;
  else if (labels.some(label => SAFE_LABELS.has(label)) || DOCS_ONLY.test(body)) tier = 2;
  else if (DOCSY.test(issue.title)) tier = 3;
  else return null;
  return tier * 10000 + body.length;
}

/** The smallest safe open issue, or null. Ties go to the oldest number. */
export function pickStarterIssue(issues: StarterIssue[]): StarterPick | null {
  let best: { issue: StarterIssue; score: number } | null = null;
  for (const issue of issues) {
    const score = starterScore(issue);
    if (score === null) continue;
    if (!best || score < best.score || score === best.score && issue.number < best.issue.number) best = { issue, score };
  }
  if (!best) return null;
  const { issue } = best;
  const reason = labelsOf(issue).includes(STARTER_LABEL)
    ? `Your starter issue #${issue.number} is ready.`
    : `Start with #${issue.number}. Smallest and safest.`;
  return { number: issue.number, title: issue.title, url: issue.html_url, reason };
}

type Call = <T>(path: string, init?: RequestInit) => Promise<T>;

async function listOpen(call: Call, repo: string): Promise<StarterIssue[]> {
  const issues: StarterIssue[] = [];
  for (let page = 1; page <= 4; page++) {
    const batch = await call<StarterIssue[]>(`/repos/${repo}/issues?state=open&per_page=50&page=${page}`);
    issues.push(...batch.filter(issue => !issue.pull_request));
    if (batch.length < 50) break;
  }
  return issues;
}

export async function findStarter(call: Call, repo: string): Promise<StarterAnswer> {
  const pick = pickStarterIssue(await listOpen(call, repo));
  if (pick) return { kind: "existing", issue: pick };
  return { kind: "starter", offer: { ...STARTER_ISSUE, label: STARTER_LABEL } };
}

/** Files the starter issue, or returns the open one already filed (a double tap files once). */
export async function fileStarter(call: Call, repo: string): Promise<StarterPick & { created: boolean }> {
  const existing = await call<StarterIssue[]>(`/repos/${repo}/issues?state=open&labels=${STARTER_LABEL}&per_page=10`);
  const open = existing.find(issue => !issue.pull_request);
  if (open) return { number: open.number, title: open.title, url: open.html_url, reason: `Your starter issue #${open.number} is ready.`, created: false };
  try {
    await call(`/repos/${repo}/labels`, { method: "POST", body: JSON.stringify({ name: STARTER_LABEL, color: "ffb020", description: "First job filed from Shiptorio" }) });
  } catch { /* already exists, or labels aren't writable: the issue still files */ }
  const issue = await call<GitHubIssue>(`/repos/${repo}/issues`, { method: "POST", body: JSON.stringify({ ...STARTER_ISSUE, labels: [STARTER_LABEL] }) });
  return { number: issue.number, title: issue.title, url: issue.html_url, reason: `Filed #${issue.number}. That's your first job.`, created: true };
}

export interface StarterDeps {
  call(env: Env, repo: string): Promise<Call>;
  plannerRoom(env: Env, repo: string): Promise<string | null>;
}

async function repoCall(env: Env, repo: string): Promise<Call> {
  const row = await env.DB.prepare("SELECT installation_id FROM repos WHERE full_name = ?").bind(repo).first<{ installation_id: number }>();
  const token = await installationToken(env, row?.installation_id ?? await repoInstallationId(env, repo));
  return (path, init) => gh(path, token, init);
}

/** Null when the planner can take a new job today, otherwise a plain reason it can't. */
async function plannerRoom(env: Env, repo: string): Promise<string | null> {
  try {
    const usage = await budgetUsage(env, await budgetAccount(env.DB, repo));
    if (usage.limits.disabled) return "The planner is paused right now.";
    if (usage.calls >= usage.limits.calls || usage.tokens >= usage.limits.tokens) return "The planner is out of budget for today. Try again tomorrow.";
    return null;
  } catch (error) {
    if (error instanceof BudgetError) return error.message;
    throw error;
  }
}

export function starterIssueRoutes(deps: StarterDeps = { call: repoCall, plannerRoom }) {
  // /api/repos/* is already behind sign-in and repo access (write for POST) in index.ts.
  const routes = new Hono<{ Bindings: Env; Variables: { user: User } }>();
  const repoOf = (c: { req: { param(name: string): string } }) => `${c.req.param("owner")}/${c.req.param("repo")}`.toLowerCase();

  routes.get("/api/repos/:owner/:repo/starter-issue", async c => {
    if (!c.env.GITHUB_APP_ID) return c.json({ error: "GitHub App not configured" }, 503);
    c.header("Cache-Control", "no-store");
    return c.json(await findStarter(await deps.call(c.env, repoOf(c)), repoOf(c)));
  });

  // Only the player's tap calls this. It never runs on its own.
  routes.post("/api/repos/:owner/:repo/starter-issue", async c => {
    if (!c.env.GITHUB_APP_ID) return c.json({ error: "GitHub App not configured" }, 503);
    const raw = await c.req.text();
    if (raw.length > 256) return c.json({ error: "too large" }, 413);
    let tapped: unknown;
    try { tapped = JSON.parse(raw || "{}").tapped; } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (tapped !== true) return c.json({ error: "a player tap is required" }, 400);
    const repo = repoOf(c);
    const blocked = await deps.plannerRoom(c.env, repo);
    if (blocked) return c.json({ error: blocked }, 429);
    c.header("Cache-Control", "no-store");
    const filed = await fileStarter(await deps.call(c.env, repo), repo);
    return c.json(filed, filed.created ? 201 : 200);
  });
  return routes;
}

export const starterIssue = starterIssueRoutes();
