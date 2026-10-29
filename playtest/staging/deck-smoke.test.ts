import { expect, test } from 'bun:test';
import { smokeOrigin, requireGuest } from './deck-smoke.mjs';

test('post-deploy smoke cannot target production or accidentally use signed-in authority', () => {
  expect(smokeOrigin('https://shiptorio.dev/deck?source=live')).toBe('https://shiptorio.dev');
  expect(smokeOrigin('http://localhost:8897')).toBe('http://localhost:8897');
  for (const url of ['https://shiptorio.com', 'https://example.com', 'https://user:secret@shiptorio.dev']) expect(() => smokeOrigin(url)).toThrow();
  expect(() => requireGuest({ guest: true })).not.toThrow();
  for (const user of [{ guest: false }, { login: 'owner', admin: true }, null]) expect(() => requireGuest(user)).toThrow();
});
