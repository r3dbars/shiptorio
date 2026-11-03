import { expect, test } from 'bun:test';
import { smokeOrigin, requireGuest, navigateToReadyDeck } from './deck-smoke.mjs';

test('post-deploy smoke cannot target production or accidentally use signed-in authority', () => {
  expect(smokeOrigin('https://shiptorio.dev/deck?source=live')).toBe('https://shiptorio.dev');
  expect(smokeOrigin('http://localhost:8897')).toBe('http://localhost:8897');
  for (const url of ['https://shiptorio.com', 'https://example.com', 'https://user:secret@shiptorio.dev']) expect(() => smokeOrigin(url)).toThrow();
  expect(() => requireGuest({ guest: true })).not.toThrow();
  for (const user of [{ guest: false }, { login: 'owner', admin: true }, null]) expect(() => requireGuest(user)).toThrow();
});


test('document commitment still requires a rendered deck within the original total budget', async () => {
  let now = 0;
  const phases: string[] = [];
  const page = {
    goto: async (_url: string, options: { waitUntil: string; timeout: number }) => { expect(options).toEqual({ waitUntil: 'commit', timeout: 30000 }); now = 12000; },
    locator: (selector: string) => { expect(selector).toBe('[data-deck-ready="1"]'); return { waitFor: async (options: { timeout: number }) => { expect(options.timeout).toBe(18000); } }; },
  };
  await navigateToReadyDeck(page, 'https://shiptorio.dev/deck?source=live', { now: () => now, onPhase: (phase: string) => phases.push(phase) });
  expect(phases).toEqual(['document', 'rendered-deck']);
  page.locator = () => ({ waitFor: async () => { throw new Error('deck never rendered'); } });
  now = 0;
  await expect(navigateToReadyDeck(page, 'https://shiptorio.dev/deck?source=live', { now: () => now })).rejects.toThrow('deck never rendered');
});
