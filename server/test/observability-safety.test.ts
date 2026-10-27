import { expect, test, spyOn } from 'bun:test';
import { Redactor, redact } from '../src/redact';
import { inTrace, log, sentryOptions, telemetryTags } from '../src/telemetry';
import { ShiptorioError, asError } from '../src/errors';
import { BudgetError } from '../src/budget';
import { OutboundError, RetryExhausted, retry } from '../src/reliability';
import { RateLimitError } from '../src/rate-limit';
import { SparkError } from '../src/spark';
import { swallowedPromises } from '../../scripts/lint-observability';

// Do not print canaries on assertion failure: only compare booleans.
const canary = () => `canary-${crypto.randomUUID()}-private`;
const hidden = (output: unknown, secrets: string[]) => {
  const serialized = JSON.stringify(output);
  expect(secrets.every(secret => !serialized.includes(secret))).toBe(true);
};

test('registered secrets crossing truncation boundaries never leave prefixes in logs or SDK payloads', () => {
  const secret = canary();
  const text = 'x'.repeat(11995) + secret;
  const redactor = new Redactor({ API_KEY: secret });
  const safe = redactor.diagnostic({ text });
  hidden(safe, [secret, secret.slice(0, 5)]);
  expect(safe.text.length).toBeLessThanOrEqual(12000);
  const info = spyOn(console, 'info').mockImplementation(() => {});
  try {
    inTrace({ requestId: 'boundary' }, { API_KEY: secret } as never, () => {}, () => {
      hidden(log('info', 'boundary', { text }), [secret, secret.slice(0, 5)]);
    });
    const options = sentryOptions({ API_KEY: secret } as never);
    hidden(options.beforeBreadcrumb!({ message: text }, {}), [secret, secret.slice(0, 5)]);
    hidden(options.beforeSend!({ type: undefined, message: text }, {}), [secret, secret.slice(0, 5)]);
  } finally { info.mockRestore(); }
});

test('nested errors, causes, cycles, headers, cookies and opaque query parameters share one policy', () => {
  const secrets = Array.from({ length: 6 }, canary);
  const cause = Object.assign(new Error(`Cookie: ${secrets[0]}`), {
    headers: { 'x-custom-header': secrets[1] }, cookie: secrets[2], query: { innocuous: secrets[3] },
    url: `https://example.test/path?ordinary=${secrets[4]}`,
    calllog: `Call log:\n - "Cookie": "${secrets[5]}"`,
  });
  const error = new Error('outer', { cause });
  Object.assign(cause, { cause: error });
  for (const scrub of [redact, (v: unknown) => new Redactor().value(v)]) {
    const output = scrub({ error, headers: new Headers({ 'x-private': secrets[1] }), params: new URLSearchParams({ private: secrets[3] }) });
    hidden(output, secrets);
    expect(JSON.stringify(output).includes('[Circular]')).toBe(true);
  }
  expect(cause.headers['x-custom-header'] === secrets[1]).toBe(true);
});

test('canonical Sentry tags follow concurrent factory, route and job contexts', async () => {
  await Promise.all(['one', 'two'].map(async id => inTrace({ requestId: id, repo: `owner/${id}`, route: `/api/${id}`, job: id }, {}, () => {}, async () => {
    await Promise.resolve();
    expect(telemetryTags()).toEqual({ factory: `owner/${id}`, route: `/api/${id}`, job: id });
    expect(telemetryTags({ repo: 'other/repo', jobId: 'override' })).toEqual({ factory: 'other/repo', route: `/api/${id}`, job: 'override' });
  })));
});

test('common application base preserves expected-error subclasses and retry classification', async () => {
  for (const error of [new BudgetError('cap'), new SparkError('bad response'), new RateLimitError(0), new OutboundError(400), new RetryExhausted('read', 1, null)]) {
    expect(error instanceof ShiptorioError).toBe(true);
    expect(asError(error)).toBe(error);
  }
  expect(asError('rejected') instanceof ShiptorioError).toBe(true);
  let calls = 0;
  try { await retry('read', async () => { calls++; throw new OutboundError(400); }); } catch (error) { expect(error instanceof RetryExhausted).toBe(true); }
  expect(calls).toBe(1);
});

test('lint rejects swallowed promise handlers while allowing reported failures and explicit fallbacks', () => {
  expect(swallowedPromises('p.catch(() => {}); p.then(ok, function () { /* ignored */ }); p.catch(() => undefined); p.catch(() => { return; });')).toHaveLength(4);
  expect(swallowedPromises('p.catch(error => report(error)); p.catch(() => null); p.catch(error => { throw error; });')).toHaveLength(0);
});

test('sanitizing application state preserves long text and lists; diagnostics drop executable serializers', () => {
  const redactor = new Redactor();
  const state = { text: 'x'.repeat(13000), items: Array.from({ length: 201 }, (_, id) => id) };
  expect(redactor.value(state)).toEqual(state);
  const secret = canary();
  const output = redactor.diagnostic({ toJSON() { return secret; }, nested: { toJSON() { return secret; } } });
  hidden(output, [secret]);
});
