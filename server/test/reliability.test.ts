import { expect, it } from 'bun:test';
import type { Item } from '@shiptorio/shared';
import { OutboundError, retry, RetryExhausted, SLA_MS, stuckItem } from '../src/reliability';

it('backs off with jitter, recovers and stops at exhaustion', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const options = { sleep: async (ms: number) => { sleeps.push(ms); }, random: () => 0.5 };
  expect(await retry('test', async () => { if (++calls < 3) throw new OutboundError(503); return 'ok'; }, options)).toBe('ok');
  expect(sleeps).toEqual([250, 500]);
  calls = 0;
  try { await retry('test', async () => { calls++; throw new OutboundError(429); }, options); throw new Error('expected exhaustion'); }
  catch (error) { expect(error).toBeInstanceOf(RetryExhausted); expect((error as RetryExhausted).attempts).toBe(3); }
  expect(calls).toBe(3);
  calls = 0;
  await expect(retry('test', async () => { calls++; throw new OutboundError(403); }, options)).rejects.toThrow('1 attempts');
  expect(calls).toBe(1);
});

it('scars every overdue nonterminal stage without launching or dispatching it', () => {
  for (const state of Object.keys(SLA_MS) as Item['state'][]) {
    const item: Item = { id: 'gh-1', kind: 'bug', source: 'github_issue', title: 'Fix', district: '/', state, attempts: 0, updatedAt: 0 };
    if (state === 'launched') { expect(stuckItem(item, 0, 1e12)).toBeUndefined(); continue; }
    expect(stuckItem(item, 0, SLA_MS[state] - 1)).toBeUndefined();
    const result = stuckItem(item, 0, SLA_MS[state])!;
    expect(result.item.scars?.[0].reason).toBe(`stuck at ${state}`);
    expect(result.item.state).toBe(state);
    expect(result.move.itemId).toBe(item.id);
    expect(result.move.options.every(o => !o.actions.length)).toBe(true);
  }
});

it('recovers a comment after a lost POST response, without a second comment', async () => {
  const { gh } = await import('../src/github');
  const original = globalThis.fetch;
  const comments: { body: string }[] = [];
  let posts = 0;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    // An unrelated factory's deferred provider call is not a comment delivery attempt.
    if (new URL(String(input)).pathname !== '/repos/owner/repo/issues/1/comments') return new Response(null, { status: 404 });
    if (init?.method === 'POST') { posts++; comments.push(JSON.parse(String(init.body))); throw new Error('connection lost after acceptance'); }
    return Response.json(comments);
  }) as typeof fetch;
  try {
    await gh('/repos/owner/repo/issues/1/comments', 'test-token', { method: 'POST', body: JSON.stringify({ body: 'Review for head abc' }) });
    await gh('/repos/owner/repo/issues/1/comments', 'test-token', { method: 'POST', body: JSON.stringify({ body: 'Review for head abc' }) });
    expect(posts).toBe(1);
  } finally { globalThis.fetch = original; }
});
