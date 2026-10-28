import { expect, test } from 'bun:test';
import { retainVisibilityResult } from './launch-observation';

test('visibility observed during Launch remains proof after later construction work', async () => {
  const observed = retainVisibilityResult(Promise.resolve());
  await new Promise<void>(resolve => queueMicrotask(resolve));
  await expect(observed()).resolves.toBeUndefined();
});

test('an early visibility failure is handled immediately and rethrown unchanged later', async () => {
  const failure = new Error('actual shipped card never became visible');
  const observed = retainVisibilityResult(Promise.reject(failure));
  await new Promise<void>(resolve => setImmediate(resolve));
  await expect(observed()).rejects.toBe(failure);
});
