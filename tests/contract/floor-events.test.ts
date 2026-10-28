import { expect, test } from 'bun:test';
import { assertFloorChronology, floorStartsBeforeNextTrigger, type FloorEvent } from './floor-events';
const build = (id: string, at: number): FloorEvent => ({ kind: 'build', phase: 'done', id, at });
const floor = (id: string, phase: string, at: number): FloorEvent => ({ kind: 'floor', phase, floor: id, at });
const beforePlanner = [build('tunnel', 1), floor('build', 'start', 1), floor('build', 'done', 7), build('boiler', 8), build('builder', 9), build('issue', 10)];

test('the captured future checks floor belongs to the automatic build, not planner', () => {
  // CI saw checks start after planner because the next logical build had already
  // completed. Equal timestamps must use event order, not a millisecond filter.
  const events = [...beforePlanner, build('planner', 11), build('build', 11), floor('checks', 'start', 11)];
  expect(floorStartsBeforeNextTrigger(events, 'planner')).toEqual([]);
  expect(() => assertFloorChronology(events)).not.toThrow();
});

test('a floor starting before its own trigger is still rejected', () => {
  const early = [...beforePlanner, build('planner', 11), floor('checks', 'start', 11), build('build', 12)];
  expect(floorStartsBeforeNextTrigger(early, 'planner')).toHaveLength(1);
  expect(() => assertFloorChronology(early)).toThrow();
});

test('complete chronology rejects duplicate, overlapping and reordered floors', () => {
  const valid = [...beforePlanner, build('planner', 11), build('build', 12), floor('checks', 'start', 12), floor('checks', 'done', 18), build('checks', 19), floor('launch', 'start', 19), floor('launch', 'done', 25)];
  expect(() => assertFloorChronology(valid)).not.toThrow();
  expect(() => assertFloorChronology([...valid, floor('launch', 'done', 26)])).toThrow();
  expect(() => assertFloorChronology(valid.filter(e => !(e.floor === 'checks' && e.phase === 'done')))).toThrow();
  expect(() => assertFloorChronology([...beforePlanner, build('build', 12), floor('launch', 'start', 12)])).toThrow();
});
