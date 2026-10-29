import { gh } from './github';

interface GitHubIssue { id: number; number: number; title: string; body?: string | null; html_url: string; state: string; pull_request?: unknown }
/** Read-only inbox: GitHub's issues endpoint also returns PRs. Never import or start work here. */
export async function issueInbox(repo: string, token: string, page: number, read = gh) {
  const rows = await read<GitHubIssue[]>(`/repos/${repo}/issues?state=open&sort=created&direction=desc&per_page=30&page=${page}`, token);
  const seen = new Set<number>();
  return {
    issues: rows.filter(row => !row.pull_request && row.state === 'open' && !seen.has(row.id) && !!seen.add(row.id)).map(row => ({
      id: row.id, number: row.number, title: row.title, body: (row.body ?? '').slice(0, 400),
    })),
    nextPage: rows.length === 30 ? page + 1 : null,
  };
}
