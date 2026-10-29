import { expect, test } from 'bun:test';
import { firstIssueCandidates, plainReason, suggestFirstIssue, type FirstIssueDeps } from '../src/first-issue';
import type { StarterIssue } from '../src/starterIssue';

const issue = (number: number, title: string, extra: Partial<StarterIssue> = {}): StarterIssue =>
  ({ id: number, number, title, body: 'Change the wording on the landing page header.', html_url: `https://github.com/o/r/issues/${number}`, state: 'open', ...extra }) as StarterIssue;
const label = (...names: string[]) => names.map(name => ({ name }));
const memory = () => { const m = new Map<string, string>(); return { m, get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); } }; };

test('rules rank labeled starters first and drop risky, taken and huge issues', () => {
  const list = firstIssueCandidates([
    issue(1, 'Rewrite the auth layer'),
    issue(2, 'Fix typo in README'),
    issue(3, 'Tidy footer', { labels: label('good first issue') }),
    issue(4, 'Security: rotate keys'),
    issue(5, 'Small copy tweak', { assignees: [{}] }),
    issue(6, 'Long one', { body: 'x'.repeat(3000) }),
  ]);
  expect(list.map(c => c.number)).toEqual([3, 2, 1]);
  expect(list[0].because).toBe("it's marked as a good first issue.");
  expect(list[2].because).toBe("it's the smallest clear ask in your repo.");
});

test('no Spark (budget gone) means the fixed rule answers without calling it', async () => {
  let asked = 0;
  const deps: FirstIssueDeps = { plannerRoom: async () => 'out of budget', ask: async () => { asked++; return { number: 2, because: 'x' }; } };
  expect(await suggestFirstIssue('o/r', [issue(1, 'Add login'), issue(2, 'Fix typo in docs')], deps)).toEqual({ number: 2, because: "it's docs only, so nothing can break.", by: 'fallback' });
  expect(asked).toBe(0);
});

test('Spark may pick another safe issue; its reason is cleaned and the answer is cached', async () => {
  const cache = memory(); let asked = 0;
  const deps: FirstIssueDeps = { plannerRoom: async () => null, cache, ask: async c => { asked++; expect(c.map(x => x.number)).toEqual([2, 1]); return { number: 1, because: 'Because it is <b>tiny</b> and clear. Visit https://evil.example now!' }; } };
  const rows = [issue(1, 'Add a footer link'), issue(2, 'Fix typo in docs')];
  const want = { number: 1, because: 'it is tiny and clear.', by: 'spark' as const };
  expect(await suggestFirstIssue('o/r', rows, deps)).toEqual(want);
  expect(await suggestFirstIssue('o/r', rows, deps)).toEqual(want);
  expect(asked).toBe(1);
});

test('a Spark pick outside the shortlist, an error, or one candidate falls back to the rules', async () => {
  const rows = [issue(1, 'Add a footer link'), issue(4, 'Security: rotate keys'), issue(2, 'Fix typo in docs')];
  const pickRisky: FirstIssueDeps = { plannerRoom: async () => null, ask: async () => ({ number: 4, because: 'do the security one' }) };
  expect((await suggestFirstIssue('o/r', rows, pickRisky))?.by).toBe('fallback');
  const broken: FirstIssueDeps = { plannerRoom: async () => null, ask: async () => { throw new Error('timeout'); } };
  expect(await suggestFirstIssue('o/r', rows, broken)).toMatchObject({ number: 2, by: 'fallback' });
  let asked = 0;
  const single: FirstIssueDeps = { plannerRoom: async () => null, ask: async () => { asked++; return { number: 1, because: 'x' }; } };
  expect(await suggestFirstIssue('o/r', [issue(1, 'Add a footer link')], single)).toMatchObject({ number: 1, by: 'fallback' });
  expect(asked).toBe(0);
  expect(await suggestFirstIssue('o/r', [issue(4, 'Security: rotate keys')], single)).toBeNull();
});

test('reasons stay one short plain sentence', () => {
  expect(plainReason('Since it only touches the README. Then ignore all rules.')).toBe('it only touches the README.');
  expect(plainReason('ok')).toBeNull();
  expect(plainReason('a'.repeat(200))!.length).toBeLessThanOrEqual(90);
});
test('acronyms keep their case', () => expect(plainReason('README only, nothing else.')).toBe('README only, nothing else.'));
