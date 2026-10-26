import { describe, expect, it, spyOn } from 'bun:test';
import { redact, redactText } from '../src/redact';
import { currentTrace, inTrace, log, observedFetch, recentLogs } from '../src/telemetry';

describe('redaction before logs and transport', () => {
  it('removes nested credentials, cookies and email without mutating input', () => {
    const source = { authorization: 'Bearer arbitrary', nested: { api_key: 'raw-key', clientSecret: 'raw-secret', email: 'justin@example.com', message: 'Contact justin@example.com token=random-secret Bearer credential' }, cookie: 'session=abc', safe: { requestId: 'abc', userId: 'r3dbars', repo: 'owner/repo', itemId: 'gh-1' } };
    const result = redact(source);
    const text = JSON.stringify(result);
    for (const secret of ['arbitrary', 'raw-key', 'raw-secret', 'justin@example.com', 'random-secret', 'credential', 'session=abc']) expect(text).not.toContain(secret);
    expect(result.safe).toEqual(source.safe);
    expect(source.nested.api_key).toBe('raw-key');
  });
  it('scrubs errors, keys, bearer grants, JWTs, URL parameters and private keys', () => {
    const secret = 'ghp_abcdefghijklmnop';
    const text = redactText(`error ${secret} github_pat_abc123 sk-abc123 sntrys_abc123 eyJabc.def.sig https://api.test/?api_key=raw-value&ok=1\nCookie: session=xyz; other=123\nAuthorization: Bearer abc\n-----BEGIN RSA PRIVATE KEY-----\nprivate-material\n-----END RSA PRIVATE KEY-----`);
    for (const value of [secret, 'github_pat_abc123', 'sk-abc123', 'sntrys_abc123', 'eyJabc.def.sig', 'raw-value', 'session=xyz', 'other=123', 'private-material']) expect(text).not.toContain(value);
    expect(JSON.stringify(redact(new Error('password=oops user@example.com')))).not.toContain('oops');
  });
  it('handles circular and deep input', () => {
    const v: Record<string, unknown> = {}; v.self = v;
    expect(redact(v).self).toBe('[Circular]');
    expect(() => JSON.stringify(redact(v))).not.toThrow();
  });
});

it('keeps concurrent request identities isolated and redacts persisted JSON', async () => {
  const output = spyOn(console, 'info').mockImplementation(() => {});
  const saved = new Map<string, string>(), pending: Promise<unknown>[] = [];
  const env = { CACHE: { put: async (key: string, value: string) => { saved.set(key, value); } } };
  try {
    await Promise.all(['alice', 'bob'].map(userId => inTrace({ requestId: userId + '-request', userId, repo: 'owner/repo' }, env as never, p => pending.push(p), async () => {
      await Promise.resolve();
      expect(currentTrace()?.userId).toBe(userId);
      log('error', 'test.failure', { error: new Error('api_key=never-log-this'), durationMs: 10 });
    })));
    await Promise.all(pending);
    const entries = [...saved].filter(([key]) => key.startsWith('ops:events:')).map(([, value]) => JSON.parse(value));
    expect(entries).toHaveLength(2);
    for (const e of entries) { expect(e.requestId).toBe(e.userId + '-request'); expect(e.error.message).not.toContain('never-log-this'); expect(e.ts).toBeString(); }
    expect(currentTrace()).toBeUndefined();
  } finally { output.mockRestore(); }
});

it('propagates the request ID to Spark and GitHub and logs duration without auth', async () => {
  const original = globalThis.fetch;
  const output = spyOn(console, 'info').mockImplementation(() => {});
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('X-Request-ID')).toBe('request-123');
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    await inTrace({ requestId: 'request-123', userId: 'r3dbars', repo: 'owner/repo', itemId: 'gh-1' }, {}, () => {}, async () => {
      for (const service of ['spark', 'github'] as const) await observedFetch(service, 'https://api.test', { headers: { authorization: 'Bearer never-log-this' } });
    });
    expect(output).toHaveBeenCalledTimes(2);
    for (const call of output.mock.calls) { const entry = JSON.parse(call[0] as string); expect(entry.durationMs).toBeNumber(); expect(entry.itemId).toBe('gh-1'); expect(call[0]).not.toContain('never-log-this'); }
  } finally { globalThis.fetch = original; output.mockRestore(); }
});

it('queries separate recent error and webhook indexes', async () => {
  const prefixes: string[] = [];
  const env = { CACHE: { list: async ({ prefix }: { prefix: string }) => { prefixes.push(prefix); return { keys: [{ name: prefix + '1' }] }; }, get: async () => ({ event: 'test' }) } };
  expect(await recentLogs(env as never, 'errors')).toHaveLength(1);
  await recentLogs(env as never, 'webhooks');
  expect(prefixes).toEqual(['ops:errors:', 'ops:webhooks:']);
});
