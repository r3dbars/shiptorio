import { expect, test } from 'bun:test';
import { buildoutObserver, type BuildoutObservation, type TimedBuildEvent } from './buildout-observation';

const event = (phase: TimedBuildEvent['phase'], at: number): TimedBuildEvent => ({ id: 'tunnel', phase, at });
const snapshot = (events: TimedBuildEvent[], step = 'tunnel'): BuildoutObservation => ({ events, step, phase: null, trigger: 'hold', actionKind: 'hold' });

test('missing phases refresh; observed positive phases share one browser read', async () => {
  let reads = 0;
  const frames = [snapshot([]), snapshot([event('start', 1), event('burst', 4), event('done', 5)])];
  const observed = buildoutObserver(async () => frames[Math.min(reads++, frames.length - 1)]);
  expect(await observed.phase('tunnel', 'start')).toBe(false);
  expect(await observed.phase('tunnel', 'burst')).toBe(true);
  expect(await observed.phase('tunnel', 'done')).toBe(true);
  expect(await observed.phase('tunnel', 'start')).toBe(true);
  expect(reads).toBe(2);
});

test('phase-or-DOM polls use one fresh read and never retain a false DOM result', async () => {
  let reads = 0;
  const observed = buildoutObserver(async () => snapshot([], reads++ ? 'boiler' : 'tunnel'));
  expect(await observed.phaseOr('tunnel', 'start', s => s.step !== 'tunnel')).toBe(false);
  expect(await observed.phaseOr('tunnel', 'start', s => s.step !== 'tunnel')).toBe(true);
  expect(reads).toBe(2);
});

test('explicit post-evidence refresh detects duplicate events despite positive cache', async () => {
  let reads = 0;
  const events = [event('start', 1), event('burst', 4), event('done', 5)];
  const observed = buildoutObserver(async () => snapshot(reads++ ? [...events, event('done', 6)] : events));
  expect(await observed.phase('tunnel', 'done')).toBe(true);
  await expect(observed.refresh()).rejects.toThrow('builds run once');
  expect(reads).toBe(2);
});

test('a checkpoint returns one complete fresh history and both action attributes', async () => {
  let reads = 0;
  const observed = buildoutObserver(async () => snapshot(reads++ ? [event('start', 2), event('burst', 7), event('done', 8)] : []));
  expect((await observed.refresh()).events).toEqual([]);
  const fresh = await observed.refresh();
  expect(fresh.events.at(-1)?.at).toBe(8);
  expect([fresh.trigger, fresh.actionKind]).toEqual(['hold', 'hold']);
  expect(reads).toBe(2);
});


test('existing checkpoint refresh carries optional performance evidence without another read', async () => {
  let reads = 0;
  const perf = { fps: 2.4, workMs: 12, tier: 2, calls: 170, triangles: 40000 };
  const observed = buildoutObserver(async () => { reads++; return { ...snapshot([]), at: 1200, perf }; });
  const checkpoint = await observed.refresh();
  expect(checkpoint.perf).toEqual(perf);
  expect(checkpoint.at).toBe(1200);
  expect(reads).toBe(1);
});
