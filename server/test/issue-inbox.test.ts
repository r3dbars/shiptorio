import { expect, test } from 'bun:test';
import { issueInbox } from '../src/issue-inbox';
test('inbox reads one bounded GitHub page, filters PRs and closed issues, deduplicates, and limits body', async () => {
  let path = '';
  const read = async <T>(url: string, token: string): Promise<T> => {
    path = url; expect(token).toBe('scoped');
    return [{ id: 1, number: 2, title: 'real issue', body: 'x'.repeat(900), state: 'open' }, { id: 1, state: 'open' }, { id: 3, state: 'open', pull_request: {} }, { id: 4, state: 'closed' }] as T;
  };
  const result = await issueInbox('owner/repo', 'scoped', 2, read);
  expect(path).toBe('/repos/owner/repo/issues?state=open&sort=created&direction=desc&per_page=30&page=2');
  expect(result.issues).toEqual([{ id: 1, number: 2, title: 'real issue', body: 'x'.repeat(400) }]);
  expect(result.nextPage).toBeNull();
});
test('a full PR-only page still offers the next page', async () => {
  const result = await issueInbox('owner/repo', '', 1, async <T>() => Array.from({ length: 30 }, (_, id) => ({ id, pull_request: {}, state: 'open' })) as T);
  expect(result.issues).toHaveLength(0); expect(result.nextPage).toBe(2);
});
test('GitHub outages remain failures rather than empty inboxes', async () => {
  await expect(issueInbox('owner/repo', '', 1, async () => { throw Error('offline'); })).rejects.toThrow('offline');
});
test('page 1 carries Shippy\'s suggested first issue; later pages and failures do not', async () => {
  const read = async <T>(): Promise<T> => [{ id: 1, number: 7, title: 'Fix typo', body: '', state: 'open', labels: [{ name: 'docs' }] }] as T;
  let seen: number[] = [];
  const suggest = async (rows: { number: number }[]) => { seen = rows.map(r => r.number); return { number: 7, because: 'it is small.', by: 'fallback' as const }; };
  expect((await issueInbox('o/r', '', 1, read, suggest)).suggested).toEqual({ number: 7, because: 'it is small.', by: 'fallback' });
  expect(seen).toEqual([7]);
  expect((await issueInbox('o/r', '', 2, read, suggest)).suggested).toBeUndefined();
  expect((await issueInbox('o/r', '', 1, read, async () => { throw Error('spark'); })).suggested).toBeUndefined();
});

test('issues already on the line are not offered again', async () => {
  const read = async <T>() => [{ id: 1, number: 30, title: 'on the pad', state: 'open' }, { id: 2, number: 40, title: 'fresh', state: 'open' }] as T;
  expect((await issueInbox('o/r', '', 1, read, undefined, new Set([30]))).issues.map(i => i.number)).toEqual([40]);
});
