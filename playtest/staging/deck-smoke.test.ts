import { expect, test } from 'bun:test';
import { smokeOrigin, requireGuest } from './deck-smoke.mjs';

test('post-deploy smoke cannot target production or accidentally use signed-in authority', () => {
  expect(smokeOrigin('https://shiptorio.dev/deck?source=live')).toBe('https://shiptorio.dev');
  expect(smokeOrigin('http://localhost:8897')).toBe('http://localhost:8897');
  for (const url of ['https://shiptorio.com', 'https://example.com', 'https://user:secret@shiptorio.dev']) expect(() => smokeOrigin(url)).toThrow();
  expect(() => requireGuest({ guest: true })).not.toThrow();
  for (const user of [{ guest: false }, { login: 'owner', admin: true }, null]) expect(() => requireGuest(user)).toThrow();
});

test('request tracker names same-origin requests that are stuck or slow, and ignores other hosts', async () => {
  const { trackRequests } = await import('./deck-smoke.mjs');
  const handlers = {}; let clock = 0;
  const page = { on: (event, fn) => { handlers[event] = fn; } };
  const request = (url, headers = {}) => ({ url: () => url, response: async () => ({ status: () => 200, headers: () => headers }) });
  const tracker = trackRequests(page, 'https://shiptorio.dev', () => clock);
  const html = request('https://shiptorio.dev/deck?source=live'), chunk = request('https://shiptorio.dev/assets/deck.js', { 'x-request-id': 'r1' }), font = request('https://fonts.example/a.woff2');
  for (const r of [html, chunk, font]) handlers.request(r);
  clock = 6_000; await handlers.requestfinished(chunk);
  clock = 12_000;
  expect(tracker.stuck()).toEqual([{ path: '/deck', ms: 12_000 }]);
  expect(tracker.slow()).toEqual([{ path: '/assets/deck.js', ms: 6_000, status: 200, requestId: 'r1', timing: null }]);
});
