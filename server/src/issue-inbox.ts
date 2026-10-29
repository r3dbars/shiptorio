import { gh } from './github';
import type { FirstIssue } from './first-issue';
import type { StarterIssue } from './starterIssue';

type GitHubIssue = StarterIssue & { id: number; state: string };
/** Read-only inbox: GitHub's issues endpoint also returns PRs. Never import or start work here.
 * On page 1, suggest (when given) picks the issue Shippy recommends starting with. */
export async function issueInbox(repo: string, token: string, page: number, read = gh, suggest?: (rows: GitHubIssue[]) => Promise<FirstIssue | null>) {
  const rows = await read<GitHubIssue[]>(`/repos/${repo}/issues?state=open&sort=created&direction=desc&per_page=30&page=${page}`, token);
  const seen = new Set<number>();
  const open = rows.filter(row => !row.pull_request && row.state === 'open' && !seen.has(row.id) && !!seen.add(row.id));
  const suggested = page === 1 && suggest && open.length ? await suggest(open).catch(() => null) : null;
  return {
    issues: open.map(row => ({ id: row.id, number: row.number, title: row.title, body: (row.body ?? '').slice(0, 400) })),
    nextPage: rows.length === 30 ? page + 1 : null,
    ...(suggested ? { suggested } : {}),
  };
}
