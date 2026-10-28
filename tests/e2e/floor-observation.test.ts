import { expect, test } from 'bun:test';
import { floorObserver, type FloorObservation, type ObservedFloorEvent } from './floor-observation';
const build = (['start', 'burst', 'done'] as const).map((phase, at): ObservedFloorEvent => ({ kind: 'build', id: 'tunnel', phase, at }));
const floor: ObservedFloorEvent = { kind: 'floor', floor: 'build', phase: 'start', at: 3 };
const snapshot = (events: ObservedFloorEvent[], step = 'tunnel'): FloorObservation => ({ events, step, actionKind: 'hold', actionClass: 'bo-hold' });

test('a known floor start does not repeat an expensive browser read inside its short deadline', async () => {
  let reads = 0;
  const observed = floorObserver(async () => { reads++; return snapshot([...build, floor]); });
  await observed.refresh(); // the required complete post-build history already contains this start
  expect(await observed.floor('build', 'start')).toBe(true);
  expect(await observed.built('tunnel')).toBe(true);
  expect(reads).toBe(1);
});

test('missing floor events refresh and newly recorded duplicates still fail a fresh checkpoint', async () => {
  let reads = 0;
  const frames = [snapshot(build), snapshot([...build, floor]), snapshot([...build, floor, floor])];
  const observed = floorObserver(async () => frames[Math.min(reads++, frames.length - 1)]);
  expect(await observed.floor('build', 'start')).toBe(false);
  expect(await observed.floor('build', 'start')).toBe(true);
  await expect(observed.refresh()).rejects.toThrow('floors start and finish once');
  expect(reads).toBe(3);
});

test('changing step and action observations use a single fresh snapshot', async () => {
  let reads = 0;
  const observed = floorObserver(async () => snapshot([], reads++ ? 'boiler' : 'tunnel'));
  expect(await observed.builtOr('tunnel', 'start', s => s.step !== 'tunnel')).toBe(false);
  expect(await observed.builtOr('tunnel', 'start', s => s.step !== 'tunnel')).toBe(true);
  const action = await observed.refresh();
  expect([action.actionKind, action.actionClass]).toEqual(['hold', 'bo-hold']);
  expect(reads).toBe(3);
});
